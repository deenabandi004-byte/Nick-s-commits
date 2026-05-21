"""
Frontend metrics event ingestion.

POST /api/metrics/events - log a whitelisted event type to Firestore.
"""
from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, rate_limit_by_user
from app.utils.metrics_events import log_event

metrics_bp = Blueprint("metrics", __name__, url_prefix="/api/metrics")

ALLOWED_EVENTS = {"suggestion_shown", "suggestion_clicked", "suggestion_dismissed"}


@metrics_bp.route("/events", methods=["POST"])
@require_firebase_auth
@rate_limit_by_user
def log_frontend_event():
    uid = request.firebase_user["uid"]
    data = request.get_json(silent=True) or {}
    event_type = data.get("event_type")
    if event_type not in ALLOWED_EVENTS:
        return jsonify({"error": "invalid event_type"}), 400
    log_event(uid, event_type, data.get("properties"))
    return jsonify({"ok": True}), 202
