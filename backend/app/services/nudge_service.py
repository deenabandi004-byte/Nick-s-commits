"""
Nudge service: scan contacts, generate follow-up nudges, persist to Firestore.

Background daemon calls scan_and_generate_nudges() every 6 hours.
Each nudge includes AI-generated follow-up suggestion text and an optional
ready-to-send follow-up email draft (cherry-pick #1 from CEO review).
"""
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

from google.cloud.firestore_v1 import transactional

from app.extensions import get_db
from app.services.openai_client import get_openai_client
from app.services.outbox_service import _parse_iso
from app.utils.users import (
    get_university_variants,
    get_user_name,
    get_user_school,
    get_user_major,
    get_user_career_track,
)

logger = logging.getLogger("nudge_service")

# Contacts in these stages are eligible for follow-up nudges
NUDGE_ELIGIBLE_STAGES = frozenset({
    "email_sent", "waiting_on_reply", "draft_created",
})

# Default follow-up timing: 7 calendar days (CEO review decision)
DEFAULT_FOLLOWUP_DAYS = 7

# Max nudges per user per day (frequency cap)
MAX_NUDGES_PER_USER_PER_DAY = 3

# Distributed lock TTL (seconds) — prevents duplicate scans across Gunicorn workers
LOCK_TTL_SECONDS = 3600  # 1 hour

# Max contacts to process in parallel
MAX_WORKERS = 10

# Nudge TTL: auto-delete dismissed/acted nudges older than this
NUDGE_TTL_DAYS = 30


# ---------------------------------------------------------------------------
# Distributed lock (Firestore transaction — atomic, no TOCTOU race)
# ---------------------------------------------------------------------------

def _acquire_lock(db) -> bool:
    """
    Attempt to acquire a distributed lock for the nudge scanner.
    Uses a Firestore transaction to prevent TOCTOU race between workers.
    Returns True if lock acquired, False if another worker holds it.
    """
    lock_ref = db.collection("system").document("nudge_scanner_lock")

    @transactional
    def _try_acquire(transaction):
        lock_snap = lock_ref.get(transaction=transaction)
        now = time.time()

        if lock_snap.exists:
            lock_data = lock_snap.to_dict() or {}
            acquired_at = lock_data.get("acquiredAt", 0)
            if now - acquired_at < LOCK_TTL_SECONDS:
                return False  # Lock held by another worker

        transaction.set(lock_ref, {
            "acquiredAt": now,
            "acquiredBy": f"worker-{os.getpid()}",
            "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })
        return True

    try:
        transaction = db.transaction()
        acquired = _try_acquire(transaction)
        if not acquired:
            logger.info("Nudge scanner lock held by another worker, skipping")
        return acquired
    except Exception as e:
        logger.error("Failed to acquire nudge scanner lock: %s", e)
        return False


def _release_lock(db):
    """Release the distributed lock."""
    try:
        db.collection("system").document("nudge_scanner_lock").delete()
    except Exception as e:
        logger.warning("Failed to release nudge scanner lock: %s", e)


def _update_healthcheck(db, nudges_generated: int, users_scanned: int, errors: int):
    """Write healthcheck timestamp so monitoring can detect daemon death."""
    try:
        db.collection("system").document("nudge_scanner").set({
            "lastScanAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "nudgesGenerated": nudges_generated,
            "usersScanned": users_scanned,
            "errors": errors,
        })
    except Exception as e:
        logger.warning("Failed to update healthcheck: %s", e)


# ---------------------------------------------------------------------------
# Contact scanning (server-side Firestore filters)
# ---------------------------------------------------------------------------

def _get_eligible_contacts(db, uid: str, followup_days: int = DEFAULT_FOLLOWUP_DAYS):
    """
    Query contacts eligible for follow-up nudges using Firestore server-side
    filters where possible, with client-side fallback for complex predicates.
    """
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=followup_days)
    max_age = now - timedelta(days=30)  # 30-day initial rollout cutoff

    cutoff_iso = cutoff.isoformat().replace("+00:00", "Z")
    max_age_iso = max_age.isoformat().replace("+00:00", "Z")

    eligible = []
    try:
        # Server-side filter: emailGeneratedAt within the nudge window
        # This reduces reads from all contacts to only those with emails in range
        query = (
            contacts_ref
            .where("emailGeneratedAt", ">=", max_age_iso)
            .where("emailGeneratedAt", "<=", cutoff_iso)
        )
        docs = list(query.stream())
    except Exception:
        # Fallback if composite index doesn't exist yet — scan all contacts
        logger.warning("Firestore index missing for emailGeneratedAt range query on uid=%s, falling back to full scan", uid)
        docs = list(contacts_ref.stream())

    for doc in docs:
        data = doc.to_dict() or {}
        stage = data.get("pipelineStage") or ""
        if stage not in NUDGE_ELIGIBLE_STAGES:
            continue
        if data.get("archivedAt"):
            continue

        # Check snooze
        snoozed = data.get("snoozedUntil")
        if snoozed:
            try:
                if datetime.fromisoformat(snoozed.replace("Z", "+00:00")) > now:
                    continue
            except (ValueError, TypeError):
                pass

        sent_at = _parse_iso(data.get("emailGeneratedAt") or data.get("emailSentAt"))
        if not sent_at:
            continue
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        if sent_at > cutoff:
            continue
        if sent_at < max_age:
            continue

        # Skip if already has a recent pending nudge
        if data.get("lastNudgeAt"):
            last_nudge = _parse_iso(data["lastNudgeAt"])
            if last_nudge:
                if last_nudge.tzinfo is None:
                    last_nudge = last_nudge.replace(tzinfo=timezone.utc)
                if last_nudge > cutoff:
                    continue

        eligible.append({"id": doc.id, **data})

    return eligible


# ---------------------------------------------------------------------------
# AI nudge generation (GPT-4o-mini)
# ---------------------------------------------------------------------------

def _generate_nudge_text(contact: dict, user_data: dict) -> dict | None:
    """
    Generate nudge suggestion text and a follow-up email draft using GPT-4o-mini.
    Returns {"suggestion": str, "followUpDraft": str} or None on failure.
    """
    client = get_openai_client()
    if not client:
        logger.warning("OpenAI client not available, skipping nudge generation")
        return None

    contact_name = (
        f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip()
        or contact.get("name", "Unknown")
    )
    company = contact.get("company") or "their company"
    title = contact.get("jobTitle") or ""
    college = contact.get("college") or ""
    days_elapsed = DEFAULT_FOLLOWUP_DAYS
    sent_at = _parse_iso(contact.get("emailGeneratedAt") or contact.get("emailSentAt"))
    if sent_at:
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        days_elapsed = (datetime.now(timezone.utc) - sent_at).days

    user_name = get_user_name(user_data)
    user_school = get_user_school(user_data)
    user_major = get_user_major(user_data)
    user_career_track = get_user_career_track(user_data)

    # Detect genuinely shared facts using variant-aware matching
    shared_facts = []
    contact_only_facts = []

    user_uni_variants = get_university_variants(user_school)
    contact_uni_variants = get_university_variants(college) if college else set()
    if user_uni_variants and contact_uni_variants and (user_uni_variants & contact_uni_variants):
        shared_facts.append(f"Same university: {user_school}")
    elif college:
        contact_only_facts.append(f"Attended {college}")

    shared_section = ""
    if shared_facts:
        shared_section = "\nSHARED BACKGROUND (you may reference as common ground):\n" + "\n".join(f"- {f}" for f in shared_facts)
    if contact_only_facts:
        shared_section += "\nCONTACT-ONLY FACTS (reference as their background, NOT as shared):\n" + "\n".join(f"- {f}" for f in contact_only_facts)

    prompt = f"""You are helping a college student follow up on a networking email they sent {days_elapsed} days ago that hasn't received a reply.

STUDENT (the sender — these are the ONLY facts about the student):
- Name: {user_name}
- University: {user_school or 'not specified'}
- Major: {user_major or 'not specified'}
- Target industry: {user_career_track or 'not specified'}

CONTACT (the recipient):
- Name: {contact_name}
- Role: {title} at {company}
- University: {college or 'not specified'}
{shared_section}

RULES:
- NEVER say "as a fellow X" or "you both attended X" unless X appears in SHARED BACKGROUND above.
- If there is no shared background, reference the CONTACT's role or company as the reason to follow up.
- Do not invent facts about the student that are not listed above.

Generate two things:
1. SUGGESTION: A brief 1-2 sentence nudge explaining why they should follow up and what angle to take (20-40 words).
2. DRAFT: A short follow-up email (60-100 words) that's warm, specific, and references the original outreach without being pushy. No subject line needed. Sign off with just the student's first name.

Format your response exactly as:
SUGGESTION: [your suggestion]
DRAFT: [your email draft]"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write concise, genuine networking follow-up suggestions for college students. Be specific, not generic."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
            temperature=0.7,
        )
        text = response.choices[0].message.content or ""

        # Parse the response
        suggestion = ""
        draft = ""
        if "SUGGESTION:" in text and "DRAFT:" in text:
            parts = text.split("DRAFT:")
            suggestion = parts[0].replace("SUGGESTION:", "").strip()
            draft = parts[1].strip()
        else:
            # Fallback: use the whole response as suggestion
            suggestion = text.strip()[:200]

        if not suggestion:
            return None

        return {
            "suggestion": suggestion,
            "followUpDraft": draft or "",
        }
    except Exception as e:
        logger.error("GPT-4o-mini nudge generation failed for contact %s: %s",
                      contact.get("id"), e)
        return None


def _generate_template_nudge(contact: dict) -> dict:
    """Fallback template nudge when LLM is unavailable."""
    contact_name = (
        f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip()
        or contact.get("name", "Unknown")
    )
    company = contact.get("company") or "their company"
    days_elapsed = DEFAULT_FOLLOWUP_DAYS
    sent_at = _parse_iso(contact.get("emailGeneratedAt") or contact.get("emailSentAt"))
    if sent_at:
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        days_elapsed = (datetime.now(timezone.utc) - sent_at).days

    return {
        "suggestion": (
            f"You emailed {contact_name} at {company} {days_elapsed} days ago. "
            f"A brief, friendly follow-up can significantly increase your reply rate."
        ),
        "followUpDraft": "",
    }


# ---------------------------------------------------------------------------
# Nudge persistence
# ---------------------------------------------------------------------------

def _create_nudge(db, uid: str, contact: dict, nudge_text: dict) -> str | None:
    """
    Write a nudge document to users/{uid}/nudges/ and update the contact's lastNudgeAt.
    Returns the nudge document ID, or None on failure.
    """
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    contact_id = contact.get("id") or contact.get("doc_id", "")
    contact_name = (
        f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip()
        or contact.get("name", "Unknown")
    )

    nudge_data = {
        "contactId": contact_id,
        "contactName": contact_name,
        "company": contact.get("company") or "",
        "type": "follow_up",
        "generatedMessage": nudge_text.get("suggestion", ""),
        "followUpDraft": nudge_text.get("followUpDraft", ""),
        "createdAt": now_iso,
        "status": "pending",
        "actedOn": False,
        "followUpOutcome": None,
    }

    try:
        # Check for existing pending nudge for this contact (dedup)
        nudges_ref = db.collection("users").document(uid).collection("nudges")
        existing = list(
            nudges_ref
            .where("contactId", "==", contact_id)
            .where("status", "==", "pending")
            .limit(1)
            .stream()
        )
        if existing:
            logger.debug("Pending nudge already exists for uid=%s contact=%s, skipping", uid, contact_id)
            return None

        # Create nudge document
        _, nudge_ref = nudges_ref.add(nudge_data)
        nudge_id = nudge_ref.id

        # Update contact's lastNudgeAt
        db.collection("users").document(uid).collection("contacts").document(contact_id).update({
            "lastNudgeAt": now_iso,
        })

        return nudge_id
    except Exception as e:
        logger.error("Failed to create nudge for uid=%s contact=%s: %s", uid, contact_id, e)
        return None


# ---------------------------------------------------------------------------
# Nudge cleanup (TTL for old dismissed/acted nudges)
# ---------------------------------------------------------------------------

def _cleanup_old_nudges(db, uid: str):
    """Delete nudges older than NUDGE_TTL_DAYS that are dismissed or acted_on.

    Uses a single-field equality query (no composite index needed) and filters
    by createdAt in memory. Bounded by a fetch limit per status to cap cost.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=NUDGE_TTL_DAYS)
    cutoff_iso = cutoff.isoformat().replace("+00:00", "Z")
    nudges_ref = db.collection("users").document(uid).collection("nudges")
    deleted = 0
    try:
        for status in ("dismissed", "acted_on"):
            # Single-field equality — no composite index required.
            candidates = list(
                nudges_ref
                .where("status", "==", status)
                .limit(200)
                .stream()
            )
            for doc in candidates:
                data = doc.to_dict() or {}
                created_at = data.get("createdAt") or ""
                if isinstance(created_at, str) and created_at and created_at <= cutoff_iso:
                    doc.reference.delete()
                    deleted += 1
                    if deleted >= 50:
                        break
            if deleted >= 50:
                break
    except Exception as e:
        logger.warning("Nudge cleanup failed for uid=%s: %s", uid, e)
    if deleted:
        logger.debug("Cleaned up %d old nudges for uid=%s", deleted, uid)


# ---------------------------------------------------------------------------
# Main scan orchestrator
# ---------------------------------------------------------------------------

def scan_and_generate_nudges():
    """
    Main entry point called by the daemon thread.
    Scans all users, finds eligible contacts, generates nudges.
    Uses distributed lock to prevent duplicate scans across workers.
    """
    if os.environ.get("NUDGES_ENABLED", "true").lower() == "false":
        logger.info("Nudges disabled via NUDGES_ENABLED=false, skipping scan")
        return

    db = get_db()

    if not _acquire_lock(db):
        return

    try:
        _run_scan(db)
    finally:
        _release_lock(db)


def _run_scan(db):
    """Execute the nudge scan (called after lock is acquired)."""
    logger.info("Nudge scan starting")
    users_scanned = 0
    total_nudges = 0
    total_errors = 0

    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        user_data = user_doc.to_dict() or {}

        # Respect user's nudge opt-out preference
        if user_data.get("nudgesEnabled") is False:
            users_scanned += 1
            continue

        # Per-uid ops override (same pattern as USE_NEW_GENERATOR).
        # `feature_flags/global.NUDGES_ENABLED.overrides[uid] = false`
        # disables nudges for a specific user without flipping the env var.
        # Unlike the other three flags, NUDGES_ENABLED is an operational kill
        # switch (default true) and the wsgi daemon doesn't start when env is
        # false, so override=true cannot re-enable a user when env is off.
        from app.services.feature_flags import get_user_override
        if get_user_override("NUDGES_ENABLED", uid) is False:
            users_scanned += 1
            continue

        # Read user-configured preferences with defaults
        followup_days = user_data.get("nudgeFollowUpDays", DEFAULT_FOLLOWUP_DAYS)
        max_per_day = user_data.get("nudgeMaxPerDay", MAX_NUDGES_PER_USER_PER_DAY)

        try:
            eligible = _get_eligible_contacts(db, uid, followup_days=followup_days)
            if not eligible:
                users_scanned += 1
                # Still run cleanup even if no eligible contacts
                _cleanup_old_nudges(db, uid)
                continue

            # Respect frequency cap using proper datetime comparison
            today_start = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            today_start_iso = today_start.isoformat().replace("+00:00", "Z")
            nudges_today = 0
            try:
                nudges_ref = db.collection("users").document(uid).collection("nudges")
                today_nudges = list(
                    nudges_ref
                    .where("createdAt", ">=", today_start_iso)
                    .limit(max_per_day + 1)
                    .stream()
                )
                nudges_today = len(today_nudges)
            except Exception as e:
                logger.warning("Failed to count today's nudges for uid=%s: %s", uid, e)

            remaining = max_per_day - nudges_today
            if remaining <= 0:
                users_scanned += 1
                _cleanup_old_nudges(db, uid)
                continue

            contacts_to_nudge = eligible[:remaining]

            # Generate nudges in parallel using ThreadPoolExecutor
            def process_contact(contact):
                nudge_text = _generate_nudge_text(contact, user_data)
                if not nudge_text:
                    nudge_text = _generate_template_nudge(contact)
                return contact, nudge_text

            with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(contacts_to_nudge))) as executor:
                futures = {
                    executor.submit(process_contact, c): c
                    for c in contacts_to_nudge
                }
                for future in as_completed(futures):
                    try:
                        contact, nudge_text = future.result()
                        nudge_id = _create_nudge(db, uid, contact, nudge_text)
                        if nudge_id:
                            total_nudges += 1
                    except Exception as e:
                        total_errors += 1
                        logger.error("Nudge generation failed for uid=%s: %s", uid, e)

            # Cleanup old nudges after processing
            _cleanup_old_nudges(db, uid)
            users_scanned += 1

        except Exception as e:
            total_errors += 1
            users_scanned += 1
            logger.error("Error processing user uid=%s: %s", uid, e)

    _update_healthcheck(db, total_nudges, users_scanned, total_errors)
    logger.info(
        "Nudge scan complete: users=%d nudges=%d errors=%d",
        users_scanned, total_nudges, total_errors,
    )


# ---------------------------------------------------------------------------
# Nudge invalidation (called from gmail_webhook on reply detection)
# ---------------------------------------------------------------------------

def dismiss_pending_nudges_for_contact(db, uid: str, contact_id: str):
    """
    When a reply is detected, dismiss any pending nudges for that contact.
    Prevents "follow up with Sarah" appearing alongside "Sarah replied!".
    """
    try:
        nudges_ref = db.collection("users").document(uid).collection("nudges")
        pending = list(
            nudges_ref
            .where("contactId", "==", contact_id)
            .where("status", "==", "pending")
            .stream()
        )
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        for doc in pending:
            doc.reference.update({
                "status": "dismissed",
                "dismissedAt": now_iso,
                "dismissReason": "reply_received",
            })
        if pending:
            logger.info("Dismissed %d pending nudge(s) for uid=%s contact=%s",
                         len(pending), uid, contact_id)
    except Exception as e:
        logger.warning("Failed to dismiss nudges for uid=%s contact=%s: %s",
                        uid, contact_id, e)
