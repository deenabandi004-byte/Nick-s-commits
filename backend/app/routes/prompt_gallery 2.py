"""
POST /api/find/prompt-gallery
Returns 6 personalized company search prompts for the current user.
Credit cost: 0
"""
from flask import Blueprint, jsonify, request
from ..extensions import require_firebase_auth
from ..services.prompt_gallery import get_prompt_gallery

prompt_gallery_bp = Blueprint("prompt_gallery", __name__)


@prompt_gallery_bp.route("/api/find/prompt-gallery", methods=["POST"])
@require_firebase_auth
def prompt_gallery():
    uid = request.firebase_user["uid"]
    result = get_prompt_gallery(uid)
    return jsonify(result)
