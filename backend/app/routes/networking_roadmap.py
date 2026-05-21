"""
Networking Roadmap routes - Phase 4.

GET  /api/networking-roadmap - Returns cached roadmap or generates new one
POST /api/networking-roadmap/refresh - Force regenerate roadmap
"""
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, require_tier

networking_roadmap_bp = Blueprint(
    "networking_roadmap", __name__, url_prefix="/api"
)


@networking_roadmap_bp.get("/networking-roadmap")
@require_tier(["pro", "elite"])
@require_firebase_auth
def get_roadmap():
    """Return cached roadmap or generate a new one."""
    uid = request.firebase_user["uid"]

    from app.services.networking_roadmap import get_cached_roadmap, generate_roadmap

    cached = get_cached_roadmap(uid)
    if cached:
        return jsonify({"roadmap": cached, "cached": True}), 200

    roadmap = generate_roadmap(uid)
    return jsonify({"roadmap": roadmap, "cached": False}), 200


@networking_roadmap_bp.post("/networking-roadmap/refresh")
@require_tier(["pro", "elite"])
@require_firebase_auth
def refresh_roadmap():
    """Force regenerate the roadmap."""
    uid = request.firebase_user["uid"]

    from app.services.networking_roadmap import generate_roadmap

    roadmap = generate_roadmap(uid)
    return jsonify({"roadmap": roadmap, "cached": False}), 200
