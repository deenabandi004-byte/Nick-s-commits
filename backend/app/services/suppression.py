"""
Email suppression list — bounced / undeliverable addresses.

Two layers:
  - per-user: users/{uid}/suppression/{email}
  - global:   global_suppression/{email}

Queried before drafting/sending to keep us from putting the same bad address
back in front of the user (or anyone else) after Gmail already told us it
bounced. Recorded by the Gmail webhook the moment a DSN comes in.

Same fire-and-forget shape as cooldown_service: never raises, never blocks
the request path.
"""
import logging
from datetime import datetime, timezone

from google.cloud.firestore_v1 import Increment

from app.extensions import get_db

logger = logging.getLogger(__name__)


def _normalize(email: str) -> str:
    return (email or "").strip().lower()


def record_bounce(uid: str, contact_email: str, contact_id: str = None, reason: str = "bounce") -> None:
    """Mark an email as bounced for this user (and globally). Fire-and-forget."""
    email = _normalize(contact_email)
    if not email:
        return
    try:
        db = get_db()
        if not db:
            return

        now_iso = datetime.now(timezone.utc).isoformat()

        if uid:
            user_ref = (
                db.collection("users")
                .document(uid)
                .collection("suppression")
                .document(email)
            )
            user_ref.set(
                {
                    "email": email,
                    "reason": reason,
                    "contactId": contact_id or "",
                    "bouncedAt": now_iso,
                },
                merge=True,
            )

        global_ref = db.collection("global_suppression").document(email)
        global_ref.set(
            {
                "email": email,
                "reason": reason,
                "lastBouncedAt": now_iso,
                "bounceCount": Increment(1),
            },
            merge=True,
        )

        logger.info(f"[suppression] Recorded bounce email={email} uid={uid} reason={reason}")
    except Exception as e:
        logger.warning(f"[suppression] Failed to record bounce for {email}: {e}")


def is_suppressed(uid: str, contact_email: str) -> bool:
    """Return True if this email has bounced for this user OR globally."""
    email = _normalize(contact_email)
    if not email:
        return False
    try:
        db = get_db()
        if not db:
            return False

        if uid:
            user_doc = (
                db.collection("users")
                .document(uid)
                .collection("suppression")
                .document(email)
                .get()
            )
            if user_doc.exists:
                return True

        global_doc = db.collection("global_suppression").document(email).get()
        return global_doc.exists
    except Exception as e:
        logger.warning(f"[suppression] Lookup failed for {email}: {e}")
        return False


def filter_suppressed(uid: str, emails):
    """Return the subset of `emails` that are NOT suppressed. Best-effort."""
    out = []
    for e in emails or []:
        if not is_suppressed(uid, e):
            out.append(e)
    return out
