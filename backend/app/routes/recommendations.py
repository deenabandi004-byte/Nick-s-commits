"""
Recommendations routes: Phase 5 of the Personalization Data Layer.

GET /api/recommendations/contacts?limit=20
GET /api/recommendations/jobs?limit=20

Both gated by RECOMMENDATIONS_ENABLED, default OFF. When the flag is off
the routes return empty arrays (not 403) so the frontend can mount the
EmptyRecommendations component without distinguishing flag-off from
no-data.
"""
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth
from app.services.recommendation_service import (
    is_enabled,
    rank_contacts,
    rank_jobs,
)

recommendations_bp = Blueprint(
    'recommendations', __name__, url_prefix='/api/recommendations'
)

# Hard cap regardless of what the client asks for. Keeps any one
# recompute bounded.
MAX_LIMIT = 50
DEFAULT_LIMIT = 20


def _parse_limit() -> int:
    raw = request.args.get('limit', str(DEFAULT_LIMIT))
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_LIMIT
    if n <= 0:
        return DEFAULT_LIMIT
    return min(n, MAX_LIMIT)


@recommendations_bp.route('/contacts', methods=['GET'])
@require_firebase_auth
def recommendations_contacts():
    if not is_enabled():
        return jsonify({
            'enabled': False,
            'contacts': [],
        }), 200

    uid = request.firebase_user['uid']
    limit = _parse_limit()
    ranked = rank_contacts(uid, limit=limit)
    return jsonify({
        'enabled': True,
        'contacts': [r.to_dict() for r in ranked],
    }), 200


@recommendations_bp.route('/jobs', methods=['GET'])
@require_firebase_auth
def recommendations_jobs():
    if not is_enabled():
        return jsonify({
            'enabled': False,
            'jobs': [],
        }), 200

    uid = request.firebase_user['uid']
    limit = _parse_limit()
    ranked = rank_jobs(uid, limit=limit)
    return jsonify({
        'enabled': True,
        'jobs': [r.to_dict() for r in ranked],
    }), 200
