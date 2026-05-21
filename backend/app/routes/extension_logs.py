"""
Extension telemetry - receives scraper health logs from the Chrome extension.
Logs are stored in-memory for the current process and periodically summarized.
"""
from flask import Blueprint, jsonify, request
from backend.app.extensions import require_firebase_auth
import logging
from collections import defaultdict
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

extension_logs_bp = Blueprint("extension_logs", __name__)

# In-memory counters (reset on deploy). Lightweight - no Firestore writes.
_scraper_stats = defaultdict(lambda: {"success": 0, "fail": 0, "fields": defaultdict(int)})


@extension_logs_bp.route("/api/extension/scraper-log", methods=["POST"])
@require_firebase_auth
def log_scraper_result():
    data = request.get_json(silent=True) or {}
    platform = data.get("platform", "unknown")
    success = data.get("success", False)
    fields_found = data.get("fields_found", [])

    stats = _scraper_stats[platform]
    if success:
        stats["success"] += 1
    else:
        stats["fail"] += 1
    for field in fields_found:
        stats["fields"][field] += 1

    return jsonify({"ok": True}), 200


@extension_logs_bp.route("/api/extension/scraper-stats", methods=["GET"])
@require_firebase_auth
def get_scraper_stats():
    """View scraper health stats (for admin debugging)."""
    result = {}
    for platform, stats in _scraper_stats.items():
        total = stats["success"] + stats["fail"]
        result[platform] = {
            "total": total,
            "success": stats["success"],
            "fail": stats["fail"],
            "success_rate": round(stats["success"] / total * 100, 1) if total > 0 else 0,
            "fields": dict(stats["fields"]),
        }
    return jsonify(result)
