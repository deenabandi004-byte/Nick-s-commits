"""
Alumni + consent routes, Phase 6 of the Personalization Data Layer.

This blueprint exposes:

    GET  /api/alumni/at-company?school=&company=&office=
        Returns the cached alumni count, sourcing on demand when the cache
        is missing/stale and ALUMNI_GRAPH_ENABLED is on. Directory list of
        consenting users is reserved for v1.1 per section 9.C and is not
        emitted here yet.

    GET  /api/users/consent/alumni-graph
    POST /api/users/consent/alumni-graph    body: { value: 'opt_in'|'opt_out' }
        Read + write the user's alumniGraphConsent field. POST also emits
        the audit event and tombstones the user's alumniByUser entries on
        opt_out.

All routes require Firebase auth. The alumni count endpoint is safe to
call regardless of consent (it counts external profiles via PDL); only
the alumniByUser graph writes are consent-gated.
"""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services.alumni_service import get_alumni_count
from app.services.alumni_sourcing_service import (
    index_user_in_alumni_graph,
    is_enabled as alumni_graph_enabled,
    source_alumni_for_pair,
)
from app.services.consent_service import (
    VALID_DECISIONS,
    get_alumni_graph_consent,
    set_alumni_graph_consent,
)

logger = logging.getLogger('routes.alumni')

alumni_bp = Blueprint('alumni', __name__, url_prefix='/api/alumni')
alumni_consent_bp = Blueprint(
    'alumni_consent', __name__, url_prefix='/api/users/consent'
)


@alumni_bp.route('/at-company', methods=['GET'])
@require_firebase_auth
def alumni_at_company():
    school = (request.args.get('school') or '').strip()
    company = (request.args.get('company') or '').strip()
    office = (request.args.get('office') or '').strip() or None

    if not school or not company:
        return jsonify({'error': 'school and company are required'}), 400

    if alumni_graph_enabled():
        result = source_alumni_for_pair(school, company, office)
    else:
        result = get_alumni_count(school, company, office)

    if result is None:
        return jsonify({
            'count': None,
            'isStale': False,
            'source': None,
            'enabled': alumni_graph_enabled(),
        }), 200

    return jsonify({
        **result.to_dict(),
        'enabled': alumni_graph_enabled(),
    }), 200


@alumni_consent_bp.route('/alumni-graph', methods=['GET'])
@require_firebase_auth
def get_alumni_consent():
    uid = request.firebase_user['uid']
    state = get_alumni_graph_consent(uid)
    return jsonify({
        'value': state.get('value'),
        'decidedAt': state.get('decidedAt'),
    }), 200


@alumni_consent_bp.route('/alumni-graph', methods=['POST'])
@require_firebase_auth
def post_alumni_consent():
    uid = request.firebase_user['uid']
    body = request.get_json(silent=True) or {}
    value = body.get('value')
    if value not in VALID_DECISIONS:
        return jsonify({
            'error': f'value must be one of {list(VALID_DECISIONS)}',
        }), 400
    source = body.get('source') or 'user'

    new_state = set_alumni_graph_consent(uid, value, source=source)

    indexed = None
    if value == 'opt_in' and alumni_graph_enabled():
        try:
            res = index_user_in_alumni_graph(uid)
            indexed = {'written': res.written, 'skipped': res.skipped}
        except Exception:
            logger.exception('post_alumni_consent: index_user_in_alumni_graph failed')

    return jsonify({
        'value': new_state.get('value'),
        'decidedAt': new_state.get('decidedAt'),
        'indexed': indexed,
    }), 200
