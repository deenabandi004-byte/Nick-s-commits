"""
Reply Coach - auto-generates draft replies when a contact replies.

Triggered by gmail_webhook.py after reply detection. Runs in a background
thread with a pending doc in Firestore for crash safety. On-demand fallback
via GET /api/contacts/<id>/reply-draft detects stale/failed pending docs
and regenerates.
"""
import logging
import threading
from datetime import datetime, timezone

from app.extensions import get_db
from app.services.reply_generation import generate_reply_to_message

logger = logging.getLogger(__name__)

REPLY_DRAFT_STALE_MINUTES = 10


def _fetch_user_context(db, uid):
    """Fetch user profile and resume text for reply generation context."""
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() if user_doc.exists else {}
    resume_text = (user_data.get("resumeParsed") or {}).get("rawText", "")
    return user_data, resume_text


def _generate_and_store_draft(db, uid, contact_id, contact_data, message_snippet):
    """Generate a reply draft and store it in Firestore. Returns the draft dict."""
    user_data, resume_text = _fetch_user_context(db, uid)

    original_subject = contact_data.get("emailSubject") or contact_data.get("draftSubject", "")

    result = generate_reply_to_message(
        message_content=message_snippet,
        contact_data=contact_data,
        resume_text=resume_text or None,
        user_profile=user_data or None,
        original_email_subject=original_subject or None,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    draft_doc = {
        "body": result.get("body", ""),
        "replyType": result.get("replyType", ""),
        "contactId": contact_id,
        "createdAt": now_iso,
        "status": "ready",
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

        # Check user tier - reply coach is Pro/Elite only
        user_doc = db.collection("users").document(uid).get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        tier = user_data.get("subscriptionTier") or user_data.get("tier", "free")
        if tier not in ("pro", "elite"):
            logger.info(f"[reply_coach] uid={uid} skipping - tier={tier}")
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


def get_reply_draft(uid, contact_id):
    """Get a reply draft for a contact, with on-demand fallback.

    If a ready draft exists, return it. If a pending doc is stale (>10min)
    or failed, regenerate synchronously. If no draft and no pending doc,
    generate on-demand.
    """
    db = get_db()

    # Check for existing ready draft
    draft_ref = db.collection("users").document(uid).collection("replyDrafts").document(contact_id)
    draft_doc = draft_ref.get()
    if draft_doc.exists:
        return draft_doc.to_dict()

    # Check pending doc
    pending_ref = db.collection("users").document(uid).collection("pending_reply_drafts").document(contact_id)
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
            # Stale - fall through to regenerate

        elif status == "failed":
            pass  # Fall through to regenerate
        else:
            pass  # Unknown status - regenerate

    # On-demand generation: fetch contact data and last message snippet
    contact_ref = db.collection("users").document(uid).collection("contacts").document(contact_id)
    contact_doc = contact_ref.get()
    if not contact_doc.exists:
        return None

    contact_data = contact_doc.to_dict() or {}
    message_snippet = contact_data.get("lastMessageSnippet", "")
    if not message_snippet:
        return None

    # Generate synchronously
    draft = _generate_and_store_draft(db, uid, contact_id, contact_data, message_snippet)

    # Clean up pending doc if it existed
    try:
        pending_ref.delete()
    except Exception:
        pass

    return draft
