"""Scout execute action: draft outreach emails for already-saved contacts.

Powers the chat flow "find me 4 Bain consultants" -> "now draft emails to
each of them". The contacts already live in users/{uid}/contacts (the search
saved them), so this reuses the SAME generation + Gmail-draft path the MCP
draft_outreach tool and the website's Find flow use, then attaches the draft
to the existing contact doc so the Inbox / Tracker pages pick it up.

Read-then-write, but only within the user's own account, and no credits are
charged here: the contact-search credit already covered "verified email +
AI draft" (config.py CREDIT_COSTS comment).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_MAX_DRAFTS = 5


def _db():
    try:
        from app.extensions import get_db
        return get_db()
    except Exception:
        return None


def _text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return "" if value is None else str(value)


def _contact_email(doc: Dict[str, Any]) -> str:
    for key in ("WorkEmail", "workEmail", "Email", "email", "PersonalEmail", "personalEmail"):
        v = _text(doc.get(key)).strip()
        if v and "@" in v:
            return v
    return ""


def _contact_name(doc: Dict[str, Any]) -> str:
    first = _text(doc.get("FirstName") or doc.get("firstName")).strip()
    last = _text(doc.get("LastName") or doc.get("lastName")).strip()
    return f"{first} {last}".strip() or _text(doc.get("name")).strip()


def _created_key(doc: Dict[str, Any]) -> str:
    for key in ("createdAt", "created_at", "savedAt", "lastActivityAt"):
        v = doc.get(key)
        if v is not None:
            return str(v)
    return ""


def draft_emails_to_contacts(
    uid: str,
    contact_names: Optional[List[str]] = None,
    limit: int = 4,
) -> Dict[str, Any]:
    """Draft personalized outreach (as Gmail drafts) for saved contacts.

    contact_names filters the user's saved contacts case-insensitively; when
    omitted, the most recently saved contacts are used (the ones the last
    search added). Returns per-contact results the LLM reports verbatim.
    """
    empty = {"drafted": [], "skipped": [], "count": 0}
    if not uid:
        return {**empty, "error": "sign in required", "code": "AUTH_REQUIRED"}
    db = _db()
    if db is None:
        return {**empty, "error": "database unavailable", "code": "UNAVAILABLE"}

    try:
        limit = max(1, min(int(limit or 4), _MAX_DRAFTS))
    except (TypeError, ValueError):
        limit = 4

    from app.mcp_server.schemas import ContactRef
    from app.mcp_server.persist import attach_gmail_draft_to_contact
    from app.mcp_server.tools.draft_outreach import (
        _create_gmail_draft,
        _load_authed_context,
    )
    from app.services.reply_generation import batch_generate_emails
    from email_templates import get_template_instructions

    ctx = _load_authed_context(uid, db)
    if not ctx.has_gmail_integration:
        return {
            **empty,
            "error": "Gmail is not connected, so drafts have nowhere to go",
            "code": "GMAIL_NOT_CONNECTED",
        }

    # ---- pick the contacts -------------------------------------------------
    docs: List[Dict[str, Any]] = []
    try:
        for snap in db.collection("users").document(uid).collection("contacts").stream():
            d = snap.to_dict() or {}
            d["_id"] = snap.id
            docs.append(d)
    except Exception as e:
        logger.warning("[ScoutOutreach] contact read failed: %s", e)
        return {**empty, "error": "could not read your contacts", "code": "UNAVAILABLE"}

    docs.sort(key=_created_key, reverse=True)

    wanted = [n.strip().lower() for n in (contact_names or []) if n and n.strip()]
    skipped: List[Dict[str, str]] = []
    picked: List[Dict[str, Any]] = []
    if wanted:
        for name in wanted:
            match = next(
                (d for d in docs if name in _contact_name(d).lower()), None
            )
            if match is None:
                skipped.append({"name": name, "reason": "not found in your saved contacts"})
            elif not _contact_email(match):
                skipped.append({"name": _contact_name(match), "reason": "no email on file"})
            else:
                picked.append(match)
    else:
        for d in docs:
            if len(picked) >= limit:
                break
            if _contact_email(d):
                picked.append(d)
    picked = picked[:limit]

    if not picked:
        return {**empty, "skipped": skipped, "error": "no matching contacts with an email", "code": "NO_CONTACTS"}

    # ---- generate the emails (one batch call, same engine as the website) --
    gen_contacts = []
    for d in picked:
        gen_contacts.append({
            "FirstName": _text(d.get("FirstName") or d.get("firstName")),
            "LastName": _text(d.get("LastName") or d.get("lastName")),
            "Title": _text(d.get("Title") or d.get("jobTitle") or d.get("title")),
            "Company": _text(d.get("Company") or d.get("company")),
            "LinkedIn": _text(d.get("LinkedIn") or d.get("linkedin")),
            "College": _text(d.get("College") or d.get("college")),
            "WorkEmail": _contact_email(d),
            "Email": "",
            "PersonalEmail": "",
            "experience": d.get("experience") or [],
        })

    template = ctx.user_data.get("emailTemplate") or {}
    template_instructions = get_template_instructions(
        purpose=template.get("purpose"),
        style_preset=template.get("stylePreset"),
        custom_instructions=(template.get("customInstructions") or "").strip()[:4000],
    )

    drafts = batch_generate_emails(
        contacts=gen_contacts,
        resume_text=ctx.resume_text or "",
        user_profile=ctx.user_profile,
        career_interests=ctx.user_data.get("careerInterests") or "",
        template_instructions=template_instructions,
        dream_companies=ctx.user_data.get("dreamCompanies") or [],
        uid=uid,
    ) or {}

    # ---- create Gmail drafts + attach to the saved contact docs ------------
    tier = _text(ctx.user_data.get("subscriptionTier") or ctx.user_data.get("tier")) or "free"
    drafted: List[Dict[str, str]] = []
    for i, d in enumerate(picked):
        gen = drafts.get(i) or drafts.get(str(i)) or {}
        subject = _text(gen.get("subject"))
        body = _text(gen.get("plain_body") or gen.get("body"))
        name = _contact_name(d)
        if not subject or not body:
            skipped.append({"name": name, "reason": "email generation failed"})
            continue
        ref = ContactRef(
            name=name,
            title=_text(d.get("Title") or d.get("jobTitle")) or None,
            company=_text(d.get("Company") or d.get("company")) or None,
            linkedin_url=_text(d.get("LinkedIn") or d.get("linkedin")) or None,
            education=_text(d.get("College") or d.get("college")) or None,
            email=_contact_email(d),
        )
        try:
            draft = _create_gmail_draft(
                tier=tier, contact=ref, subject=subject, body=body, ctx=ctx,
            )
        except Exception as e:
            logger.warning("[ScoutOutreach] gmail draft failed for %s: %s", name, e)
            draft = None
        if draft is None:
            skipped.append({"name": name, "reason": "Gmail draft creation failed"})
            continue
        try:
            attach_gmail_draft_to_contact(
                uid=uid, db=db,
                contact_doc_id=d["_id"],
                draft_id=draft.draft_id,
                draft_url=draft.draft_url,
                thread_id=None,
                recipient_email=draft.recipient_email,
                subject=subject,
                body=body,
            )
        except Exception as e:
            logger.warning("[ScoutOutreach] attach failed for %s: %s", name, e)
        drafted.append({
            "name": name,
            "company": _text(d.get("Company") or d.get("company")),
            "recipient_email": draft.recipient_email,
            "subject": subject[:160],
            # For the chat report: deep links to the Gmail draft and to the
            # exact Inbox conversation (/outbox?contact=<id>).
            "gmail_draft_url": draft.draft_url or "",
            "contact_id": d["_id"],
        })

    return {"drafted": drafted, "skipped": skipped, "count": len(drafted)}
