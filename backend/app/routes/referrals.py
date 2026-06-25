"""
Referral program routes.
"""
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, get_db
from app.services import referral_service

referrals_bp = Blueprint('referrals', __name__, url_prefix='/api/referrals')


@referrals_bp.route('/me', methods=['GET'])
@require_firebase_auth
def referral_me():
    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401
    return jsonify(referral_service.get_referral_status(get_db(), uid)), 200


@referrals_bp.route('/attribute', methods=['POST'])
@require_firebase_auth
def referral_attribute():
    uid = request.firebase_user.get('uid')
    email = request.firebase_user.get('email', '')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json() or {}
    code = data.get('code') or data.get('referral_code') or ''
    result = referral_service.record_referral_signup(get_db(), code, uid, email)
    return jsonify(result), 200


@referrals_bp.route('/claim', methods=['POST'])
@require_firebase_auth
def referral_claim():
    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401
    result = referral_service.claim_reward(get_db(), uid)
    status = 200 if result.get('ok') else 400
    return jsonify(result), status


@referrals_bp.route('/ack', methods=['POST'])
@require_firebase_auth
def referral_ack():
    uid = request.firebase_user.get('uid')
    if not uid:
        return jsonify({'error': 'unauthorized'}), 401
    surface = (request.get_json() or {}).get('surface', '')
    result = referral_service.ack_referral_surface(get_db(), uid, surface)
    return jsonify(result), (200 if result.get('ok') else 400)
