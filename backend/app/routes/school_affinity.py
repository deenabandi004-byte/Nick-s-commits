"""
School affinity endpoint - returns top companies where alumni of a given school work,
powered by PDL people search with Firestore caching (30-day TTL).
"""
from flask import Blueprint, request, jsonify
from app.extensions import require_firebase_auth, get_db
from app.services.school_affinity import get_school_affinity

school_affinity_bp = Blueprint('school_affinity', __name__, url_prefix='/api/companies')


@school_affinity_bp.route('/school-affinity', methods=['GET'])
@require_firebase_auth
def school_affinity_route():
    university = (request.args.get('university') or '').strip()
    field = (request.args.get('field') or '').strip()

    if not university:
        return jsonify({"error": "university parameter is required"}), 400
    if not field:
        return jsonify({"error": "field parameter is required"}), 400

    try:
        companies = get_school_affinity(university, field)
        return jsonify({
            "success": True,
            "university": university,
            "field": field,
            "companies": companies,
            "total": len(companies),
        })
    except Exception as e:
        print(f"[SchoolAffinity] Error: {e}")
        return jsonify({"error": "Failed to fetch school affinity data"}), 500
