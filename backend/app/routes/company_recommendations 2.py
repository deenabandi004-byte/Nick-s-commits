"""
GET /api/companies/recommendations
Returns personalized company recommendations with scout sentences.
Credit cost: 0
"""
from flask import Blueprint, jsonify, request
from ..extensions import require_firebase_auth, get_db
from ..services.company_recommendations import get_recommendations

company_recommendations_bp = Blueprint("company_recommendations", __name__)


@company_recommendations_bp.route("/api/companies/recommendations", methods=["GET"])
@require_firebase_auth
def recommendations():
    uid = request.firebase_user["uid"]
    db = get_db()

    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()

    if not user_doc.exists:
        return jsonify({
            "user": {"name": "", "school": "", "seal": "?", "sealColor": "#1B2A44",
                     "major": "", "location": "", "demonym": None, "demonymConfidence": "low"},
            "stats": {"alumni_tracked": 0, "jobs_indexed": 0, "last_updated": ""},
            "companies": [],
        })

    user_data = user_doc.to_dict()
    user_data["uid"] = uid

    result = get_recommendations(user_data)
    return jsonify(result)
