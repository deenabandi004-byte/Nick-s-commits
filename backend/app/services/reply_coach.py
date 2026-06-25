"""
Reply Coach — auto-generates draft replies when a contact replies.

Triggered by gmail_webhook.py after reply detection. Runs in a background
thread with a pending doc in Firestore for crash safety. On-demand fallback
via GET /api/contacts/<id>/reply-draft detects stale/failed pending docs
and regenerates.
"""
import logging
import threading
from datetime import datetime, timezone

from app.extensions import get_db
from app.services.gmail_client import _gmail_service, _load_user_gmail_creds, get_full_thread_chain
from app.services.reply_generation import generate_reply_to_message

logger = logging.getLogger(__name__)

REPLY_DRAFT_STALE_MINUTES = 10


def _fetch_user_context(db, uid):
    """Fetch user profile and resume text for reply generation context."""
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() if user_doc.exists else {}
    resume_text = (user_data.get("resumeParsed") or {}).get("rawText", "")
    return user_data, resume_text


def _fetch_thread_chain(uid, contact_data):
    """Fetch the full Gmail thread chain for thread-aware drafting.

    Returns [] when no thread id, no creds, or Gmail errors. The caller can
    still generate from the latest snippet alone — the chain is additive
    context, not a hard requirement.
    """
    thread_id = contact_data.get("gmailThreadId")
    if not thread_id:
        return []
    try:
        creds = _load_user_gmail_creds(uid)
    except Exception as e:
        logger.warning(f"[reply_coach] uid={uid} creds load failed: {e}")
        return []
    if not creds:
        return []
    try:
        service = _gmail_service(creds)
    except Exception as e:
        logger.warning(f"[reply_coach] uid={uid} gmail service init failed: {e}")
        return []

    contact_email = contact_data.get("draftToEmail") or contact_data.get("email")
    user_email = None
    try:
        user_doc = get_db().collection("users").document(uid).get()
        if user_doc.exists:
            user_email = (user_doc.to_dict() or {}).get("email")
    except Exception:
        pass

    try:
        return get_full_thread_chain(service, thread_id, contact_email, user_email)
    except Exception as e:
        logger.warning(f"[reply_coach] uid={uid} thread fetch failed for {thread_id}: {e}")
        return []


def _generate_and_store_draft(db, uid, contact_id, contact_data, message_snippet, is_followup=False):
    """Generate a reply draft (or follow-up nudge) and store it in Firestore.
    Returns the draft dict. is_followup is set by the on-demand path when
    there is no inbound reply yet — the contact has been emailed but hasn't
    responded, so Generate flips into nudge mode instead of 404'ing.
    """
    user_data, resume_text = _fetch_user_context(db, uid)

    original_subject = contact_data.get("emailSubject") or contact_data.get("draftSubject", "")
    prior_messages = _fetch_thread_chain(uid, contact_data)

    result = generate_reply_to_message(
        message_content=message_snippet,
        contact_data=contact_data,
        resume_text=resume_text or None,
        user_profile=user_data or None,
        original_email_subject=original_subject or None,
        prior_messages=prior_messages,
        is_followup=is_followup,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    draft_doc = {
        "body": result.get("body", ""),
        "replyType": result.get("replyType", ""),
        "warmthTier": result.get("warmthTier", ""),
        "leadType": result.get("leadType", ""),
        "contactId": contact_id,
        "createdAt": now_iso,
        "status": "ready",
        "isFollowup": is_followup,
    }

    db.collection("users").document(uid).collection("replyDrafts").document(contact_id).set(draft_doc)
    return draft_doc


def _run_reply_coach_thread(uid, contact_id, contact_data, message_snippet):
    """Background thread body. Writes pending doc, generates draft, cleans up."""
    try:
        db = get_db()
        pending_ref = (
            db.collection("users")
            .document(uid)
            .collection("pending_reply_drafts")
            .document(contact_id)
        )

        _generate_and_store_draft(db, uid, contact_id, contact_data, message_snippet)

        # Clean up pending doc on success
        pending_ref.delete()
        logger.info(f"[reply_coach] uid={uid} contact={contact_id} draft generated successfully")

    except Exception as exc:
        logger.error(f"[reply_coach] uid={uid} contact={contact_id} draft generation failed: {exc}")
        try:
            db = get_db()
            db.collection("users").document(uid).collection("pending_reply_drafts").document(contact_id).set(
                {"status": "failed", "error": str(exc)[:200], "updatedAt": datetime.now(timezone.utc).isoformat()},
                merge=True,
            )
        except Exception:
            pass


def spawn_reply_coach(uid, contact_id, contact_data, message_snippet):
    """Write a pending doc and spawn background thread to generate reply draft.

    Called from gmail_webhook.py after reply detection. Fire-and-forget.
    """
    try:
        db = get_db()

        # Check user tier — reply coach is Pro/Elite only
        user_doc = db.collection("users").document(uid).get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        tier = user_data.get("subscriptionTier") or user_data.get("tier", "free")
        if tier not in ("pro", "elite"):
            logger.info(f"[reply_coach] uid={uid} skipping — tier={tier}")
            return

        # Write pending doc before spawning thread
        now_iso = datetime.now(timezone.utc).isoformat()
        db.collection("users").document(uid).collection("pending_reply_drafts").document(contact_id).set({
            "status": "pending",
            "contactId": contact_id,
            "createdAt": now_iso,
        })

        t = threading.Thread(
            target=_run_reply_coach_thread,
            args=(uid, contact_id, contact_data, message_snippet),
            daemon=True,
        )
        t.start()
        logger.info(f"[reply_coach] uid={uid} contact={contact_id} background thread spawned")

    except Exception as exc:
        logger.error(f"[reply_coach] uid={uid} contact={contact_id} spawn failed: {exc}")


def get_reply_draft(uid, contact_id, refresh=False):
    """Get a reply draft for a contact, with on-demand fallback.

    If a ready draft exists, return it. If a pending doc is stale (>10min)
    or failed, regenerate synchronously. If no draft and no pending doc,
    generate on-demand.

    When refresh=True, the cached draft is bypassed and a fresh thread-aware
    generation runs. The inbox "Generate" button always passes this so that
    cached drafts written by the webhook path (which were latest-snippet-only)
    don't surface stale, non-thread-aware text on the first click.
    """
    db = get_db()

    # Check for existing ready draft (skip when caller forces refresh)
    draft_ref = db.collection("users").document(uid).collection("replyDrafts").document(contact_id)
    if not refresh:
        draft_doc = draft_ref.get()
        if draft_doc.exists:
            return draft_doc.to_dict()

    # Check pending doc — also bypassed on refresh so a click during a
    # pending background job still returns a fresh sync result.
    pending_ref = db.collection("users").document(uid).collection("pending_reply_drafts").document(contact_id)
    if not refresh:
        pending_doc = pending_ref.get()
        if pending_doc.exists:
            pending_data = pending_doc.to_dict() or {}
            status = pending_data.get("status")

            if status == "pending":
                # Check staleness
                created_str = pending_data.get("createdAt", "")
                if created_str:
                    try:
                        created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                        age_minutes = (datetime.now(timezone.utc) - created_dt).total_seconds() / 60
                        if age_minutes < REPLY_DRAFT_STALE_MINUTES:
                            return {"status": "generating", "createdAt": created_str}
                    except Exception:
                        pass
                # Stale — fall through to regenerate

            elif status == "failed":
                pass  # Fall through to regenerate
            else:
                pass  # Unknown status — regenerate

    # On-demand generation: fetch contact data and last message snippet
    contact_ref = db.collection("users").document(uid).collection("contacts").document(contact_id)
    contact_doc = contact_ref.get()
    if not contact_doc.exists:
        return None

    contact_data = contact_doc.to_dict() or {}
    message_snippet = contact_data.get("lastMessageSnippet", "")

    # No inbound reply yet — flip into follow-up mode if the user has sent
    # something to nudge on (a thread id, a sent timestamp, or a stored email
    # body). When none of those exist, the contact is truly empty and we 404.
    is_followup = False
    if not message_snippet:
        has_sent_state = bool(
            contact_data.get("gmailThreadId")
            or contact_data.get("emailSentAt")
            or contact_data.get("emailBody")
        )
        if not has_sent_state:
            return None
        is_followup = True
        # For follow-ups we pass the user's own most recent outgoing note as
        # message_content so the model knows what's being nudged. Falls back
        # to the email subject when no body is stored.
        message_snippet = (
            contact_data.get("emailBody")
            or contact_data.get("emailSubject")
            or ""
        )

    # Generate synchronously
    draft = _generate_and_store_draft(db, uid, contact_id, contact_data, message_snippet, is_followup=is_followup)

    # Clean up pending doc if it existed
    try:
        pending_ref.delete()
    except Exception:
        pass

    return draft
