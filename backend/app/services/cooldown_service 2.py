"""
Global contact outreach cooldown tracking.

Prevents contact saturation by tracking how many users have contacted
a given professional within a rolling 30-day window. Written atomically
on every confirmed send; read at scoring time as a penalty feature.

Collection: global_contact_outreach/{contact_email}
Fields:
  - last_outreach_ts: ISO timestamp of most recent outreach
  - outreach_count_30d: int, rolling count (decayed on read)
  - outreach_entries: list of {uid, ts} for the last 30 days
"""
import logging
from datetime import datetime, timedelta, timezone

from app.extensions import get_db

logger = logging.getLogger(__name__)


def record_outreach(contact_email: str, uid: str) -> None:
    """Record that a user sent an outreach to this contact email.

    Fire-and-forget: never raises, never blocks the caller.
    """
    if not contact_email:
        return
    try:
        db = get_db()
        if not db:
            return

        contact_email = contact_email.strip().lower()
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        ref = db.collection("global_contact_outreach").document(contact_email)
        doc = ref.get()

        if doc.exists:
            data = doc.to_dict() or {}
            entries = data.get("outreach_entries", [])
        else:
            entries = []

        # Prune entries older than 30 days
        cutoff = now - timedelta(days=30)
        entries = [
            e for e in entries
            if datetime.fromisoformat(e["ts"]).replace(tzinfo=timezone.utc) > cutoff
        ]

        # Append new entry
        entries.append({"uid": uid, "ts": now_iso})

        ref.set({
            "last_outreach_ts": now_iso,
            "outreach_count_30d": len(entries),
            "outreach_entries": entries,
        })

        logger.info(
            f"[cooldown] Recorded outreach to {contact_email} by uid={uid}, "
            f"count_30d={len(entries)}"
        )
    except Exception as e:
        logger.warning(f"[cooldown] Failed to record outreach for {contact_email}: {e}")


def get_outreach_count(contact_email: str) -> int:
    """Return the number of outreaches to this contact in the last 30 days.

    Returns 0 on any error or if no record exists.
    """
    if not contact_email:
        return 0
    try:
        db = get_db()
        if not db:
            return 0

        contact_email = contact_email.strip().lower()
        ref = db.collection("global_contact_outreach").document(contact_email)
        doc = ref.get()
        if not doc.exists:
            return 0

        data = doc.to_dict() or {}
        entries = data.get("outreach_entries", [])

        # Prune stale entries on read
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        current = [
            e for e in entries
            if datetime.fromisoformat(e["ts"]).replace(tzinfo=timezone.utc) > cutoff
        ]

        # Update if we pruned any stale entries
        if len(current) != len(entries):
            try:
                ref.update({
                    "outreach_count_30d": len(current),
                    "outreach_entries": current,
                })
            except Exception:
                pass

        return len(current)
    except Exception as e:
        logger.warning(f"[cooldown] Failed to read outreach count for {contact_email}: {e}")
        return 0
