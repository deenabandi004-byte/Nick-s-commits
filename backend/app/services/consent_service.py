"""
Consent service, Phase 6 of the Personalization Data Layer.

Owns the alumniGraphConsent state machine on users/{uid} and the tombstone
behavior that removes a user from the alumniByUser graph the moment they
opt out. The state field is one of:

    'opt_in'    user agreed to appear in their school's alumni surface
    'opt_out'   user explicitly refused (or revoked a prior opt_in)
    'pending'   surfaced the modal, no decision yet (rarely persisted)
    None        never asked (the default for cold-start accounts)

Per spec section 11 / 15.5, the read path treats anything other than
'opt_in' as withheld. Sourcing services MUST consult get_alumni_graph_consent
before writing a user into the alumniByUser graph, and MUST filter on
consent value when reading.

This module is deliberately small and synchronous. Audit trail flows
through the Phase 2 events service (ALUMNI_GRAPH_CONSENT_CHANGED) so the
event log remains the single source of truth for who decided what when.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.extensions import get_db
from app.models.events import EventType
from app.models.users import AlumniGraphConsent
from app.services.events_service import log_event

logger = logging.getLogger('consent_service')

VALID_DECISIONS = ('opt_in', 'opt_out', 'pending')


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_alumni_graph_consent(uid: str) -> Dict[str, Any]:
    """Return the user's current alumni-graph consent state.

    Shape: {'value': 'opt_in'|'opt_out'|'pending'|None, 'decidedAt': str|None}.
    Never raises on missing user, returns the cold-start default.
    """
    if not uid:
        return {'value': None, 'decidedAt': None}
    db = get_db()
    snap = db.collection('users').document(uid).get()
    if not snap.exists:
        return {'value': None, 'decidedAt': None}
    data = snap.to_dict() or {}
    value = data.get('alumniGraphConsent')
    decided_at = data.get('alumniGraphConsentAt')
    if value not in VALID_DECISIONS:
        value = None
    return {'value': value, 'decidedAt': decided_at}


def set_alumni_graph_consent(
    uid: str,
    value: AlumniGraphConsent,
    *,
    source: str = 'user',
) -> Dict[str, Any]:
    """Persist a consent decision and emit the audit event.

    Args:
        uid: Firebase UID.
        value: 'opt_in', 'opt_out', or 'pending'.
        source: where the decision originated ('user', 'system', 'admin').
                Used in the audit event payload, not on the user doc.

    Returns:
        The new state dict (same shape as get_alumni_graph_consent).

    Side effects:
      - Writes alumniGraphConsent + alumniGraphConsentAt on users/{uid}.
      - Logs an ALUMNI_GRAPH_CONSENT_CHANGED event with previous + next.
      - On opt_out, tombstones every alumniByUser entry for this user.
    """
    if not uid:
        raise ValueError('uid is required')
    if value not in VALID_DECISIONS:
        raise ValueError(f'value must be one of {VALID_DECISIONS}, got {value!r}')

    prior = get_alumni_graph_consent(uid)
    now = _now_iso()

    db = get_db()
    user_ref = db.collection('users').document(uid)
    user_ref.set(
        {'alumniGraphConsent': value, 'alumniGraphConsentAt': now},
        merge=True,
    )

    if value == 'opt_out':
        try:
            removed = _tombstone_alumni_by_user(uid)
        except Exception:
            logger.exception('consent_service: tombstone failed for uid=%s', uid)
            removed = 0
    else:
        removed = 0

    try:
        log_event(
            uid=uid,
            event_type=EventType.ALUMNI_GRAPH_CONSENT_CHANGED,
            payload={
                'previous': prior.get('value'),
                'next': value,
                'source': source,
                'tombstonedEntries': removed,
            },
            source='backend',
        )
    except Exception:
        logger.exception('consent_service: audit event log failed for uid=%s', uid)

    return {'value': value, 'decidedAt': now}


def revoke_alumni_graph_consent(uid: str) -> Dict[str, Any]:
    """Convenience wrapper. Equivalent to set_alumni_graph_consent(uid, 'opt_out')."""
    return set_alumni_graph_consent(uid, 'opt_out', source='user')


def _tombstone_alumni_by_user(uid: str) -> int:
    """Remove every alumniByUser/{key}/users/{uid} entry for this user.

    Uses a collection-group query on the 'users' subcollection filtered by
    userId == uid. The Firestore composite index for (userId) on the
    'users' collection-group must exist in production; on miss, the query
    raises and we fall back to a no-op (caller logs).

    Returns the number of entries removed.
    """
    db = get_db()
    removed = 0
    try:
        query = db.collection_group('users').where('userId', '==', uid)
        for doc in query.stream():
            ref = doc.reference
            path = getattr(ref, 'path', None)
            if path is None:
                # Fall back to walking the parent chain when the SDK or
                # test stub doesn't expose .path directly.
                try:
                    parent_doc = ref.parent.parent
                    parent_collection = parent_doc.parent if parent_doc else None
                    parent_collection_id = (
                        getattr(parent_collection, 'id', None) if parent_collection else None
                    )
                except AttributeError:
                    parent_collection_id = None
                if parent_collection_id != 'alumniByUser':
                    continue
            else:
                if not str(path).startswith('alumniByUser/'):
                    continue
            ref.delete()
            removed += 1
    except Exception:
        logger.exception(
            'consent_service: collection_group tombstone query failed for uid=%s', uid
        )
        raise
    return removed


def list_user_consent_audit(uid: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Read-side helper used by the privacy/data dashboard.

    Returns the most recent ALUMNI_GRAPH_CONSENT_CHANGED events for this
    user, newest first. Empty list on miss or when events logging is off.
    """
    if not uid:
        return []
    db = get_db()
    try:
        snaps = (
            db.collection('users')
            .document(uid)
            .collection('events')
            .where('type', '==', EventType.ALUMNI_GRAPH_CONSENT_CHANGED.value)
            .order_by('timestamp', direction='DESCENDING')
            .limit(int(max(1, limit)))
            .stream()
        )
        return [s.to_dict() or {} for s in snaps]
    except Exception:
        logger.exception('consent_service: audit read failed for uid=%s', uid)
        return []
