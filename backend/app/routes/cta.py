"""
Dashboard CTA routes  Phase 8 of the Personalization Data Layer.

Three endpoints, all require Firebase auth and are gated by the
CTA_CARDS_ENABLED env flag (default OFF):

    GET  /api/dashboard/ctas
        Return the visible deck (max 3) plus the quieted flag. The
        frontend hook polls this every 60s.

    POST /api/dashboard/ctas/<cardId>/dismiss
        Persist the dismissal and update the cooldown tally. Returns
        the new notificationStats so the client can update without a
        round-trip read.

    POST /api/dashboard/ctas/<cardId>/click
        Persist a click so the same card does not reappear on the
        next poll. Does NOT count toward cooldown.

Cards are derived on every GET; persistence is limited to dismissal /
click state. See `services/cta_service.py` for trigger registration and
aggregation rules.
"""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services import cta_service
from app.services.events_service import log_event

logger = logging.getLogger('routes.cta')

cta_bp = Blueprint('cta', __name__, url_prefix='/api/dashboard')


def _disabled_response():
    """Default-OFF flag returns an empty payload, NOT a 404, so the
    frontend hook can render its empty state without any branching."""
    return jsonify({'cards': [], 'isQuieted': False, 'enabled': False}), 200


@cta_bp.route('/ctas', methods=['GET'])
@require_firebase_auth
def list_ctas():
    if not cta_service.is_enabled():
        return _disabled_response()

    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthenticated'}), 401

    cards, is_quieted = cta_service.evaluate(uid)
    return jsonify({
        'cards': [c.to_dict() for c in cards],
        'isQuieted': is_quieted,
        'enabled': True,
    }), 200


@cta_bp.route('/ctas/<card_id>/dismiss', methods=['POST'])
@require_firebase_auth
def dismiss_cta(card_id: str):
    if not cta_service.is_enabled():
        return _disabled_response()

    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthenticated'}), 401
    card_id = (card_id or '').strip()
    if not card_id:
        return jsonify({'error': 'cardId required'}), 400

    stats = cta_service.record_dismissal(uid, card_id)

    # Mirror to the Phase 2 event log so the metrics layer can compute
    # dismiss-rate per card_type without re-reading ctaDismissals.
    try:
        from app.models.events import EventType
        log_event(
            uid=uid,
            event_type=EventType.DASHBOARD_CTA_DISMISSED,
            payload={'cardId': card_id, 'cardType': cta_service._card_type_from_id(card_id)},
            idempotency_key=f'cta_dismissed:{card_id}',
            source='backend',
        )
    except Exception as exc:
        logger.debug('cta_dismissed event log failed: %s', exc)

    return jsonify({'notificationStats': stats}), 200


@cta_bp.route('/ctas/<card_id>/click', methods=['POST'])
@require_firebase_auth
def click_cta(card_id: str):
    if not cta_service.is_enabled():
        return _disabled_response()

    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthenticated'}), 401
    card_id = (card_id or '').strip()
    if not card_id:
        return jsonify({'error': 'cardId required'}), 400

    cta_service.record_click(uid, card_id)

    try:
        from app.models.events import EventType
        log_event(
            uid=uid,
            event_type=EventType.DASHBOARD_CTA_CLICKED,
            payload={'cardId': card_id, 'cardType': cta_service._card_type_from_id(card_id)},
            idempotency_key=f'cta_clicked:{card_id}',
            source='backend',
        )
    except Exception as exc:
        logger.debug('cta_clicked event log failed: %s', exc)

    return jsonify({'ok': True}), 200
