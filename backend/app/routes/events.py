"""
Events API — Phase 2 of the Personalization Data Layer.

POST /api/events/batch
    Body: {"events": [<event-envelope>, ...]}
    Each envelope must contain `eventId`, `type`, `timestamp`, `payload`.
    Returns: {"accepted": N, "rejected": M, "results": [...]}.

The endpoint is idempotent — retried calls with the same eventIds will
collapse onto the same Firestore docs. Per the eng review §3.2, the
frontend uses `crypto.randomUUID()` so client-side retries are free.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services.events_service import accept_frontend_event, is_enabled

logger = logging.getLogger('events_route')

events_bp = Blueprint('events', __name__, url_prefix='/api/events')

MAX_BATCH_SIZE = 50


@events_bp.post('/batch')
@require_firebase_auth
def post_batch():
    """Accept a batched list of frontend-originated events.

    The body shape matches the TS `useEventLogger` flush payload:
        {"events": [<envelope>, ...]}
    Each envelope is validated against `IncomingEvent` server-side; bad
    envelopes are rejected individually so a single malformed event doesn't
    drop the whole batch.
    """
    uid = request.firebase_user['uid']
    payload = request.get_json(silent=True) or {}
    events: List[Dict[str, Any]] = payload.get('events') or []

    if not isinstance(events, list):
        return jsonify({'error': 'events must be a list'}), 400
    if len(events) > MAX_BATCH_SIZE:
        return jsonify({
            'error': f'batch size exceeds limit of {MAX_BATCH_SIZE}',
        }), 413

    if not is_enabled(uid):
        # Quietly accept and discard so the frontend doesn't fail loudly
        # when the rollout flag is off. Behaves like /dev/null.
        return jsonify({'accepted': 0, 'rejected': 0, 'disabled': True}), 200

    results: List[Dict[str, Any]] = []
    accepted = 0
    rejected = 0

    for raw in events:
        if not isinstance(raw, dict):
            rejected += 1
            results.append({'ok': False, 'reason': 'not_a_dict'})
            continue

        event_id = accept_frontend_event(uid, raw)
        if event_id:
            accepted += 1
            results.append({'ok': True, 'eventId': event_id})
        else:
            # Either validation failed, the type isn't allowlisted, or this
            # is an idempotent retry. Treat all three as "not newly accepted"
            # but not necessarily an error from the client's perspective.
            rejected += 1
            results.append({'ok': False, 'eventId': raw.get('eventId')})

    return jsonify({
        'accepted': accepted,
        'rejected': rejected,
        'results': results,
    }), 200
