"""
Search Suggestions route - returns smart suggestions based on user profile.
"""
from flask import Blueprint, request, jsonify
from app.extensions import require_firebase_auth

search_suggestions_bp = Blueprint("search_suggestions", __name__)


@search_suggestions_bp.route("/api/search-suggestions", methods=["GET"])
@require_firebase_auth
def get_suggestions():
    uid = request.firebase_user["uid"]
    try:
        from app.services.search_suggestions import get_cached_suggestions
        suggestions = get_cached_suggestions(uid)
        return jsonify({"suggestions": suggestions})
    except Exception as e:
        print(f"[SearchSuggestions] Error: {e}")
        return jsonify({"suggestions": []})
