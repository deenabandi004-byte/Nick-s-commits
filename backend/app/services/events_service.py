"""
Events service — Phase 2 idempotent writer for users/{uid}/events/{eventId}.

Single entry point: `log_event(uid, type, payload, idempotency_key=None,
source='backend', session_id=None)`.

Idempotency is built in. Frontend callers pass `eventId = crypto.randomUUID()`
which becomes the Firestore doc ID; retries of the same UUID hit the same
doc and `transaction.create()` raises (we swallow). Pub/Sub callers pass
`idempotency_key=sha256(uid:msgid:type)` so a redelivered Gmail message
becomes the same write.

Retention: every event is written with `expiresAt = createdAt + 90 days`.
The Firestore TTL service must be configured to use this field on the
`events` collection group (see `backend/scripts/firestore_indexes.md`).

Feature flag: when `EVENTS_LOGGING_ENABLED` is false (default during
rollout) `log_event` becomes a no-op so we can deploy code paths and
flip the switch separately.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union

from app.extensions import get_db
from app.models.events import (
    BACKEND_EVENT_TYPES,
    BaseEvent,
    EventType,
    FRONTEND_EVENT_TYPES,
    IncomingEvent,
)

logger = logging.getLogger('events_service')

EVENT_TTL = timedelta(days=90)
COLLECTION_NAME = 'events'


def is_enabled(uid: Optional[str] = None) -> bool:
    """Feature gate. Defaults to OFF during rollout (§8 of eng review).

    When `uid` is provided, a per-uid Firestore override at
    `feature_flags/global.EVENTS_LOGGING_ENABLED.overrides[uid]` takes
    precedence over the env var (same pattern as USE_NEW_GENERATOR).
    """
    if uid:
        from app.services.feature_flags import get_user_override
        override = get_user_override('EVENTS_LOGGING_ENABLED', uid)
        if override is not None:
            return override
    return os.getenv('EVENTS_LOGGING_ENABLED', 'false').lower() == 'true'


def derive_idempotency_key(uid: str, message_id: str, event_type: Union[str, EventType]) -> str:
    """Deterministic key for Pub/Sub callers — same source → same doc ID."""
    type_str = event_type.value if isinstance(event_type, EventType) else str(event_type)
    raw = f'{uid}:{message_id}:{type_str}'.encode('utf-8')
    return hashlib.sha256(raw).hexdigest()[:32]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def log_event(
    uid: str,
    event_type: Union[str, EventType],
    payload: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
    source: str = 'backend',
    session_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
) -> Optional[str]:
    """Append an event to users/{uid}/events.

    Args:
        uid: Firebase user ID.
        event_type: One of the EventType values (or its string form).
        payload: Event-specific payload. See `models.events` for typed schemas.
        idempotency_key: Optional override for the Firestore doc ID. Pub/Sub
            callers pass `derive_idempotency_key(uid, msg_id, type)` so retries
            collapse onto the same doc. If omitted, a UUID4 is generated.
        source: 'frontend' or 'backend'. Frontend writes go through
            `accept_frontend_event` instead, which validates type membership.
        session_id: Optional grouping ID for funnel analysis.
        timestamp: Override for the event time (defaults to now).

    Returns:
        The event ID if the write succeeded, or None if the feature flag is
        off / the doc already existed (idempotency hit).
    """
    if not uid:
        logger.warning('log_event called without uid; dropping')
        return None
    if not is_enabled(uid):
        logger.debug('events_service disabled via EVENTS_LOGGING_ENABLED=false')
        return None

    try:
        type_value = EventType(event_type) if not isinstance(event_type, EventType) else event_type
    except ValueError:
        logger.warning('log_event: unknown event type %r — dropping', event_type)
        return None

    event_id = idempotency_key or str(uuid.uuid4())
    now = timestamp or _now()
    expires_at = now + EVENT_TTL

    doc = {
        'eventId': event_id,
        'type': type_value.value,
        'timestamp': now,
        'source': source,
        'schemaVersion': 1,
        'sessionId': session_id,
        'payload': payload or {},
        'createdAt': now,
        'expiresAt': expires_at,
    }

    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection(COLLECTION_NAME)
        .document(event_id)
    )

    # Use create() so a duplicate eventId raises and we can detect the
    # idempotency hit. The google-cloud-firestore client raises
    # `AlreadyExists` (or a generic exception with message containing the
    # term) when the doc exists.
    try:
        ref.create(doc)
        return event_id
    except Exception as exc:  # pragma: no cover — exception class varies
        msg = str(exc).lower()
        if 'already exists' in msg or 'already_exists' in msg or 'alreadyexists' in msg:
            logger.debug('log_event: idempotent hit on %s', event_id)
            return None
        logger.exception('log_event failed for uid=%s type=%s', uid, type_value)
        return None


def accept_frontend_event(uid: str, raw_event: Dict[str, Any]) -> Optional[str]:
    """Validate and persist a frontend-originated event.

    Used by routes/events.py:POST /api/events/batch. The frontend POSTs
    pre-stamped events with `eventId`, `type`, `timestamp`, `payload`.
    We validate via Pydantic, ensure the type is in the frontend allowlist,
    then forward to `log_event` with the client's eventId so retries are
    idempotent without server-side coordination.
    """
    try:
        validated = IncomingEvent.model_validate(raw_event) if hasattr(IncomingEvent, 'model_validate') else IncomingEvent(**raw_event)  # type: ignore[attr-defined]
    except Exception as exc:
        logger.warning('accept_frontend_event: validation failed: %s', exc)
        return None

    if validated.type not in FRONTEND_EVENT_TYPES:
        logger.warning(
            'accept_frontend_event: type %s is not in frontend allowlist',
            validated.type,
        )
        return None

    return log_event(
        uid=uid,
        event_type=validated.type,
        payload=validated.payload,
        idempotency_key=validated.event_id,
        source='frontend',
        session_id=validated.session_id,
        timestamp=validated.timestamp,
    )
