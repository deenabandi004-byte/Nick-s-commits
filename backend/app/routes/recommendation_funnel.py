"""
GET /api/admin/recommendation-funnel

Aggregates the recommendation_events collection into a funnel:
recommendation_shown -> email_drafted -> email_sent -> email_replied ->
meeting_scheduled -> offer_received.

Returns total counts + adjacent-stage rates, plus breakdowns by warmth_tier,
model_version, and surface. Admin only (ADMIN_UIDS env var).

This is the measurement readout for the recommendation-engine plan's
heuristic-baseline period. Aggregate (not per-user) conversion: a power
user replying a lot can inflate rates. Good enough for trend tracking.
"""
import os
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from app.extensions import get_db

logger = logging.getLogger(__name__)

recommendation_funnel_bp = Blueprint("recommendation_funnel", __name__)


FUNNEL_ORDER = [
    "recommendation_shown",
    "email_drafted",
    "email_sent",
    "email_replied",
    "meeting_scheduled",
    "offer_received",
]

# Safety caps
MAX_RANGE_DAYS = 90
READ_CAP = 100_000


def _check_admin():
    """Return (is_admin, error_response_tuple_or_None). ADMIN_UIDS env var."""
    admin_uids = {u.strip() for u in os.getenv("ADMIN_UIDS", "").split(",") if u.strip()}
    if not admin_uids:
        return False, (jsonify({"error": "ADMIN_UIDS not configured"}), 500)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return False, (jsonify({"error": "Unauthorized"}), 401)

    from firebase_admin import auth as fb_auth
    token = auth_header.split("Bearer ", 1)[1]
    try:
        decoded = fb_auth.verify_id_token(token, clock_skew_seconds=5)
    except Exception:
        return False, (jsonify({"error": "Invalid token"}), 401)

    if decoded.get("uid") not in admin_uids:
        return False, (jsonify({"error": "Forbidden"}), 403)

    return True, None


def _rate(num, denom):
    if not denom:
        return None
    return round(num / denom, 4)


def _funnel_block(counts):
    return {
        "counts": {k: counts.get(k, 0) for k in FUNNEL_ORDER},
        "rates": {
            "shown_to_drafted": _rate(counts.get("email_drafted", 0), counts.get("recommendation_shown", 0)),
            "drafted_to_sent": _rate(counts.get("email_sent", 0), counts.get("email_drafted", 0)),
            "sent_to_replied": _rate(counts.get("email_replied", 0), counts.get("email_sent", 0)),
            "replied_to_meeting": _rate(counts.get("meeting_scheduled", 0), counts.get("email_replied", 0)),
            "meeting_to_offer": _rate(counts.get("offer_received", 0), counts.get("meeting_scheduled", 0)),
            "shown_to_replied": _rate(counts.get("email_replied", 0), counts.get("recommendation_shown", 0)),
        },
    }


@recommendation_funnel_bp.get("/api/admin/recommendation-funnel")
def funnel():
    is_admin, err = _check_admin()
    if not is_admin:
        return err

    today = datetime.now(timezone.utc).date()
    default_from = today - timedelta(days=28)

    try:
        date_to = datetime.strptime(request.args.get("to", today.isoformat()), "%Y-%m-%d").date()
        date_from = datetime.strptime(request.args.get("from", default_from.isoformat()), "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "Invalid date format; use YYYY-MM-DD"}), 400

    if date_from > date_to:
        return jsonify({"error": "'from' must be <= 'to'"}), 400
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        return jsonify({"error": f"Date range exceeds {MAX_RANGE_DAYS} days"}), 400

    surface_filter = request.args.get("surface")

    db = get_db()
    if not db:
        return jsonify({"error": "Database unavailable"}), 503

    # Range query on a single field (event_date) - works without composite index.
    # Surface filter applied in Python so we never need a composite (range+equality).
    query = (
        db.collection("recommendation_events")
        .where("event_date", ">=", date_from.isoformat())
        .where("event_date", "<=", date_to.isoformat())
    )

    total = defaultdict(int)
    by_tier = defaultdict(lambda: defaultdict(int))
    by_model = defaultdict(lambda: defaultdict(int))
    by_surface = defaultdict(lambda: defaultdict(int))

    n_read = 0
    cap_hit = False
    try:
        for doc in query.stream():
            n_read += 1
            if n_read > READ_CAP:
                cap_hit = True
                logger.warning("recommendation funnel hit read cap of %d", READ_CAP)
                break

            d = doc.to_dict() or {}
            event_type = d.get("event_type")
            if event_type not in FUNNEL_ORDER:
                continue

            surface = d.get("surface") or "unknown"
            if surface_filter and surface != surface_filter:
                continue

            total[event_type] += 1

            tier = (d.get("features_snapshot") or {}).get("warmth_tier") or "unknown"
            by_tier[tier][event_type] += 1

            model = d.get("model_version") or "unknown"
            by_model[model][event_type] += 1

            by_surface[surface][event_type] += 1
    except Exception as e:
        logger.exception("recommendation funnel query failed")
        return jsonify({"error": "Query failed", "detail": str(e)}), 500

    return jsonify({
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "surface_filter": surface_filter,
        "events_read": n_read,
        "read_cap_hit": cap_hit,
        "total": _funnel_block(total),
        "by_warmth_tier": {tier: _funnel_block(c) for tier, c in by_tier.items()},
        "by_model_version": {ver: _funnel_block(c) for ver, c in by_model.items()},
        "by_surface": {sfc: _funnel_block(c) for sfc, c in by_surface.items()},
    }), 200
