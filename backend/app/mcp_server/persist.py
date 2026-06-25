"""
MCP → My Network contact persistence.

When an MCP caller (Claude.ai, Cursor, etc.) is OAuth-authed,
find_contacts and draft_outreach write the resulting contacts into
the user's My Network collection so the conversation in Claude shows
up on offerloop.ai. Each freshly-persisted contact gets:

  source: "mcp"        - surfaces in My Network UI as a Claude-sourced row
  mcpUnseen: true      - frontend renders an orange highlight; cleared on
                         the first My Network page view via the
                         /api/contacts/clear-mcp-unseen endpoint

Shape mirrors runs.py's contact_doc so the same My Network / Inbox /
Tracker UIs render MCP-sourced contacts identically. Dedup matches the
website's _contact_already_exists (email | linkedinUrl | name+company).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _today_short() -> str:
    return datetime.now().strftime("%m/%d/%Y")


def _name_company_key(first: str, last: str, company: str) -> str:
    return f"{first.lower().strip()}_{last.lower().strip()}_{company.lower().strip()}"


def _extract_email(c: dict) -> str:
    """Pull whichever email field a PDL-shaped contact carries. Mirrors
    runs.py's lookup order so MCP-sourced and website-sourced contacts
    land on identical email values in Firestore."""
    return (
        c.get("Email")
        or c.get("WorkEmail")
        or c.get("PersonalEmail")
        or c.get("email")
        or ""
    ).strip()


def _existing_contacts_index(uid: str, db: Any) -> dict:
    """Read existing contacts once, build the three dedup lookup tables
    PLUS an `by_key -> doc_id` map so callers can update specific docs
    later (e.g., draft_outreach attaching a gmailDraftId).

    Returns:
        {
          "email": set[str],
          "linkedin": set[str],
          "name_company": set[str],
          "by_key": {key: doc_id},  # any of the three key types → existing doc id
        }
    """
    out: dict[str, Any] = {
        "email": set(),
        "linkedin": set(),
        "name_company": set(),
        "by_key": {},
    }
    if db is None or not uid:
        return out
    try:
        snaps = db.collection("users").document(uid).collection("contacts").stream()
    except Exception as e:
        logger.warning("[MCP persist] existing-contacts read failed: %s", e)
        return out
    for snap in snaps:
        data = snap.to_dict() or {}
        email = (data.get("email") or "").strip().lower()
        linkedin = (data.get("linkedinUrl") or "").strip()
        first = (data.get("firstName") or "").strip()
        last = (data.get("lastName") or "").strip()
        company = (data.get("company") or "").strip()
        if email:
            out["email"].add(email)
            out["by_key"][email] = snap.id
        if linkedin:
            out["linkedin"].add(linkedin)
            out["by_key"][linkedin] = snap.id
        if first and last and company:
            key = _name_company_key(first, last, company)
            out["name_company"].add(key)
            out["by_key"][key] = snap.id
    return out


def _match_existing(c: dict, index: dict) -> Optional[str]:
    """Return the existing contact's doc_id if this contact (PDL-shaped)
    matches an existing My Network row via email | linkedin | name+company.
    """
    email = _extract_email(c).lower()
    if email and email in index["email"]:
        return index["by_key"].get(email)
    linkedin = (c.get("LinkedIn") or c.get("linkedinUrl") or "").strip()
    if linkedin and linkedin in index["linkedin"]:
        return index["by_key"].get(linkedin)
    first = (c.get("FirstName") or c.get("firstName") or "").strip()
    last = (c.get("LastName") or c.get("lastName") or "").strip()
    company = (c.get("Company") or c.get("company") or "").strip()
    if first and last and company:
        key = _name_company_key(first, last, company)
        if key in index["name_company"]:
            return index["by_key"].get(key)
    return None


def _build_contact_doc(c: dict, *, source: str, now: str) -> dict:
    first = (c.get("FirstName") or c.get("firstName") or "").strip()
    last = (c.get("LastName") or c.get("lastName") or "").strip()
    email = _extract_email(c)
    linkedin = (c.get("LinkedIn") or c.get("linkedinUrl") or "").strip()
    company = (c.get("Company") or c.get("company") or "").strip()
    doc = {
        "firstName": first,
        "lastName": last,
        "email": email,
        "linkedinUrl": linkedin,
        "company": company,
        "jobTitle": c.get("Title") or c.get("jobTitle") or "",
        "college": c.get("College") or c.get("college") or "",
        "location": c.get("location") or "",
        "status": "Not Contacted",
        "pipelineStage": "added",
        "firstContactDate": _today_short(),
        "lastContactDate": _today_short(),
        "createdAt": now,
        "updatedAt": now,
        "lastActivityAt": now,
        "inOutbox": False,
        "hasUnreadReply": False,
        "source": source,
        "mcpUnseen": True,
        "emailSource": c.get("EmailSource") or None,
        "emailVerified": bool(c.get("EmailVerified")),
        "emailConfidenceScore": int(c.get("EmailConfidenceScore") or 0),
    }
    if c.get("warmth_score") is not None:
        doc["warmthScore"] = c["warmth_score"]
        doc["warmthTier"] = c.get("warmth_tier") or ""
        doc["warmthLabel"] = c.get("warmth_label") or ""
        doc["warmthSignals"] = c.get("warmth_signals") or []
    return doc


def persist_contacts(
    *,
    uid: str,
    db: Any,
    contacts: list[dict],
    source: str = "mcp",
) -> dict[str, str]:
    """Persist a batch of MCP-sourced contacts to users/{uid}/contacts/.

    Dedupes against existing contacts by email | linkedinUrl |
    name+company. Returns a dict mapping the matched dedup key (email,
    linkedin URL, or name+company key) to a Firestore doc ID for both
    newly-written AND existing contacts. Callers can use this to follow
    up with targeted updates (e.g., draft_outreach attaching a
    gmailDraftId to the specific contact it just drafted to).

    Errors are swallowed: a Firestore blip should never break the
    user-facing find_contacts / draft_outreach response.
    """
    if not contacts or not uid or db is None:
        return {}

    index = _existing_contacts_index(uid, db)
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    now = _now_iso()
    written: dict[str, str] = {}
    saved = 0
    skipped = 0

    for c in contacts:
        existing_id = _match_existing(c, index)
        first = (c.get("FirstName") or c.get("firstName") or "").strip()
        last = (c.get("LastName") or c.get("lastName") or "").strip()
        email = _extract_email(c).lower()
        linkedin = (c.get("LinkedIn") or c.get("linkedinUrl") or "").strip()
        company = (c.get("Company") or c.get("company") or "").strip()
        nc_key = _name_company_key(first, last, company) if (first and last and company) else ""

        if existing_id:
            # Don't overwrite existing — preserve the user's own state
            # (pipelineStage progress, hasUnreadReply, etc.). Just surface
            # the doc ID so callers can do targeted updates.
            for key in (email, linkedin, nc_key):
                if key:
                    written[key] = existing_id
            skipped += 1
            continue

        try:
            doc = _build_contact_doc(c, source=source, now=now)
            new_ref = contacts_ref.add(doc)
            # Firestore .add() returns (timestamp, DocumentReference). The
            # in-memory fake just returns DocumentReference. Handle both.
            doc_id = new_ref[1].id if isinstance(new_ref, tuple) else new_ref.id
        except Exception as e:
            logger.warning("[MCP persist] write failed for contact: %s", e)
            continue

        for key in (email, linkedin, nc_key):
            if key:
                written[key] = doc_id
                # Seed dedup so duplicates within the same batch are caught.
                if key == email:
                    index["email"].add(key)
                elif key == linkedin:
                    index["linkedin"].add(key)
                elif key == nc_key:
                    index["name_company"].add(key)
                index["by_key"][key] = doc_id
        saved += 1

    logger.info(
        "[MCP persist] uid=%s saved=%d skipped=%d source=%s",
        uid, saved, skipped, source,
    )
    return written


def attach_gmail_draft_to_contact(
    *,
    uid: str,
    db: Any,
    contact_doc_id: str,
    draft_id: str,
    draft_url: str,
    thread_id: Optional[str],
    recipient_email: str,
    subject: str,
    body: str,
) -> None:
    """Update a My Network contact with Gmail draft info so the Inbox /
    Tracker UI surfaces it. Mirrors runs.py's draft_created path."""
    if not uid or not contact_doc_id or db is None:
        return
    now = _now_iso()
    updates = {
        "pipelineStage": "draft_created",
        "inOutbox": True,
        "gmailDraftId": draft_id,
        "gmailDraftUrl": draft_url,
        "draftToEmail": recipient_email,
        "draftCreatedAt": now,
        "emailGeneratedAt": now,
        "draftStillExists": True,
        "lastActivityAt": now,
        "updatedAt": now,
        "emailSubject": subject,
        "emailBody": body,
        "hasUnreadReply": False,
    }
    if thread_id:
        updates["gmailThreadId"] = thread_id
    try:
        (
            db.collection("users").document(uid).collection("contacts")
            .document(contact_doc_id).update(updates)
        )
        logger.info(
            "[MCP persist] uid=%s contact=%s attached gmailDraftId=%s",
            uid, contact_doc_id, draft_id,
        )
    except Exception as e:
        logger.warning("[MCP persist] attach gmail draft failed: %s", e)


def clear_mcp_unseen_for_user(uid: str, db: Any) -> int:
    """Batch-clear `mcpUnseen` after the My Network UI loads. Called by
    the POST /api/contacts/clear-mcp-unseen endpoint the frontend hits
    after rendering MCP-sourced rows with their orange tint."""
    if db is None or not uid:
        return 0
    cleared = 0
    try:
        snaps = (
            db.collection("users").document(uid)
            .collection("contacts").where("mcpUnseen", "==", True).stream()
        )
        for snap in snaps:
            try:
                snap.reference.update({"mcpUnseen": False})
                cleared += 1
            except Exception:
                continue
    except Exception as e:
        logger.warning("[MCP persist] clear_mcp_unseen failed: %s", e)
    return cleared
