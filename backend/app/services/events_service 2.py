"""
Event logging service for the personalization data layer.

Writes behavioral events to users/{uid}/events/{event_id} with:
- Idempotency via transaction.create (duplicate key → silent skip)
- 90-day TTL via expiresAt field (Firestore TTL policy)
- Frontend vs backend allowlist enforcement
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.extensions import get_db
from app.models.events import EventType, FRONTEND_ALLOWLIST
from app.services.feature_flags import is_enabled, EVENTS_LOGGING_ENABLED

logger = logging.getLogger("events_service")

EVENT_TTL_DAYS = 90


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _expires_at(from_dt: Optional[datetime] = None) -> str:
    base = from_dt or datetime.now(timezone.utc)
    return (base + timedelta(days=EVENT_TTL_DAYS)).isoformat().replace("+00:00", "Z")


def _derive_idempotency_key(uid: str, event_type: str, msg_id: Optional[str] = None) -> str:
    """
    Generate a deterministic idempotency key for backend events that
    don't carry a client-generated UUID (e.g. reply_received from Pub/Sub).
    """
    raw = f"{uid}:{msg_id or ''}:{event_type}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def log_event(
    uid: str,
    event_type: str | EventType,
    payload: Optional[dict[str, Any]] = None,
    *,
    idempotency_key: Optional[str] = None,
    source: str = "backend",
) -> Optional[str]:
    """
    Write a single event to Firestore.

    Args:
        uid: Firebase user ID.
        event_type: One of EventType values.
        payload: Event-specific data (no raw email text — privacy rule).
        idempotency_key: Client-generated UUID or derived key. If the key
            already exists, the write is silently skipped.
        source: "frontend" or "backend".

    Returns:
        The event document ID on success, None if skipped or disabled.
    """
    if not is_enabled(EVENTS_LOGGING_ENABLED, uid=uid):
        return None

    # Normalize event type
    if isinstance(event_type, EventType):
        event_type_str = event_type.value
    else:
        event_type_str = event_type

    # Validate event type
    try:
        et = EventType(event_type_str)
    except ValueError:
        logger.warning("Unknown event type %s from uid=%s, dropping", event_type_str, uid)
        return None

    # Enforce frontend allowlist
    if source == "frontend" and et not in FRONTEND_ALLOWLIST:
        logger.warning(
            "Frontend tried to write backend-only event %s for uid=%s, dropping",
            event_type_str, uid,
        )
        return None

    now = _now_iso()
    doc_data = {
        "type": event_type_str,
        "uid": uid,
        "payload": payload or {},
        "source": source,
        "createdAt": now,
        "expiresAt": _expires_at(),
    }

    db = get_db()
    events_ref = db.collection("users").document(uid).collection("events")

    # Use idempotency key as document ID if provided
    doc_id = idempotency_key or None

    try:
        if doc_id:
            doc_ref = events_ref.document(doc_id)
            # doc_ref.create() raises AlreadyExists if the doc exists → idempotent
            doc_ref.create(doc_data)
            return doc_ref.id
        else:
            # Auto-generate ID
            _, ref = events_ref.add(doc_data)
            return ref.id
    except Exception as e:
        err_str = str(e)
        if "ALREADY_EXISTS" in err_str or "already exists" in err_str.lower():
            logger.debug("Idempotent skip for event %s key=%s uid=%s", event_type_str, doc_id, uid)
            return None
        logger.error("Failed to log event %s for uid=%s: %s", event_type_str, uid, e)
        return None


def log_event_batch(
    uid: str,
    events: list[dict[str, Any]],
    source: str = "frontend",
) -> dict[str, Any]:
    """
    Write a batch of events. Per-event validation so one bad event
    doesn't drop the whole batch.

    Args:
        uid: Firebase user ID.
        events: List of dicts, each with "type", optional "payload",
            optional "idempotencyKey".
        source: "frontend" or "backend".

    Returns:
        {"accepted": int, "rejected": int, "errors": list[str]}
    """
    accepted = 0
    rejected = 0
    errors = []

    for i, event in enumerate(events):
        event_type = event.get("type")
        payload = event.get("payload")
        idem_key = event.get("idempotencyKey")

        if not event_type:
            rejected += 1
            errors.append(f"Event {i}: missing type")
            continue

        result = log_event(
            uid=uid,
            event_type=event_type,
            payload=payload,
            idempotency_key=idem_key,
            source=source,
        )
        if result is not None:
            accepted += 1
        else:
            # Could be idempotent skip, disabled, or validation failure —
            # count as accepted (not an error) if the type is valid
            try:
                EventType(event_type)
                accepted += 1  # Idempotent skip or flag disabled
            except ValueError:
                rejected += 1
                errors.append(f"Event {i}: unknown type '{event_type}'")

    return {"accepted": accepted, "rejected": rejected, "errors": errors}
