"""
Loop routes — /api/agent/loops/*

Multi-Loop endpoints layered on top of the existing /api/agent/* singleton
routes. Existing routes keep working during the frontend migration.

Tier gating: any Loop endpoint requires a non-free tier OR free-tier users
within their max_loops cap (1). The decorator chain checks the cap inside
create_loop, so we don't need a tier guard on read endpoints — those are
already cheap.

Prefix: /api/agent/loops
"""
from __future__ import annotations

import logging

from flask import Blueprint, current_app, jsonify, request

from app.extensions import get_db, require_firebase_auth
from app.services.agent_brief_parser import parse_brief
from app.services.loop_budget import (
    estimate_cycle_cost,
    usage_breakdown_this_month,
)
from app.services.loop_service import (
    create_loop,
    delete_loop,
    get_loop,
    get_loop_activity,
    get_loop_limits,
    list_loops,
    pause_loop,
    resume_loop,
    run_loop_now,
    start_loop,
    update_loop,
)

logger = logging.getLogger(__name__)

loops_bp = Blueprint("loops", __name__, url_prefix="/api/agent/loops")


def _user_tier() -> str:
    """Fetch the authenticated user's tier from Firestore.

    These routes don't use @require_tier (Loops are available to all tiers,
    just gated by max_loops), so we look it up ourselves. Reads
    subscriptionTier first, falls back to legacy tier, then free.
    """
    cached = getattr(request, "user_tier", None)
    if cached:
        return cached
    uid = request.firebase_user.get("uid")
    if not uid:
        return "free"
    db = get_db()
    if not db:
        return "free"
    try:
        doc = db.collection("users").document(uid).get()
        if not doc.exists:
            return "free"
        data = doc.to_dict() or {}
        tier = data.get("subscriptionTier") or data.get("tier") or "free"
        request.user_tier = tier
        return tier
    except Exception:
        logger.exception("Failed to fetch tier for uid=%s", uid)
        return "free"


@loops_bp.route("", methods=["GET"])
@require_firebase_auth
def list_user_loops():
    uid = request.firebase_user["uid"]
    loops = list_loops(uid)
    return jsonify({"loops": loops, "limits": get_loop_limits(uid, _user_tier())})


@loops_bp.route("", methods=["POST"])
@require_firebase_auth
def create_user_loop():
    """Create a Loop. If the body contains briefText, parses it in-line so the
    response includes the parsed structure (no second round-trip)."""
    uid = request.firebase_user["uid"]
    data = request.get_json() or {}

    brief_text = (data.get("briefText") or "").strip()
    # Only re-parse server-side when the client didn't supply a usable parse.
    # The Loop composer parses on the frontend, lets the user edit chips, and
    # sends the curated result here as `briefParsed`. Treat null/empty as
    # "please parse for me" so old clients and short briefs still work.
    client_parsed = data.get("briefParsed")
    client_parsed_useful = isinstance(client_parsed, dict) and any(
        client_parsed.get(k)
        for k in ("companies", "industries", "roles", "locations", "constraints", "emailPurpose")
    )
    if brief_text and not client_parsed_useful:
        parsed, _status = parse_brief(brief_text)
        data["briefParsed"] = parsed

    try:
        loop = create_loop(uid, _user_tier(), data)
    except ValueError as e:
        msg = str(e)
        if msg == "tier_cap_reached":
            limits = get_loop_limits(uid, _user_tier())
            return jsonify({
                "error": "tier_cap_reached",
                "message": (
                    f"You're at your plan's limit of {limits['cap']} Loop"
                    f"{'s' if limits['cap'] != 1 else ''}. "
                    "Upgrade to add more."
                ),
                "limits": limits,
            }), 402
        return jsonify({"error": msg}), 400
    return jsonify(loop), 201


@loops_bp.route("/<loop_id>", methods=["GET"])
@require_firebase_auth
def get_user_loop(loop_id):
    uid = request.firebase_user["uid"]
    loop = get_loop(uid, loop_id)
    if not loop:
        return jsonify({"error": "not_found"}), 404
    return jsonify(loop)


@loops_bp.route("/<loop_id>", methods=["PATCH"])
@require_firebase_auth
def patch_user_loop(loop_id):
    uid = request.firebase_user["uid"]
    data = request.get_json() or {}

    # If only briefText was sent, re-parse it before saving.
    if "briefText" in data and "briefParsed" not in data:
        parsed, _status = parse_brief(data["briefText"])
        data["briefParsed"] = parsed

    loop = update_loop(uid, loop_id, data)
    if not loop:
        return jsonify({"error": "not_found"}), 404
    return jsonify(loop)


@loops_bp.route("/<loop_id>", methods=["DELETE"])
@require_firebase_auth
def delete_user_loop(loop_id):
    uid = request.firebase_user["uid"]
    ok = delete_loop(uid, loop_id)
    if not ok:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"ok": True})


@loops_bp.route("/<loop_id>/start", methods=["POST"])
@require_firebase_auth
def start_user_loop(loop_id):
    uid = request.firebase_user["uid"]
    try:
        loop = start_loop(uid, loop_id, app=current_app._get_current_object())
    except ValueError as e:
        msg = str(e)
        if msg == "brief_required":
            return jsonify({
                "error": "brief_required",
                "message": "Add a brief before starting this Loop.",
            }), 400
        return jsonify({"error": msg}), 400
    if not loop:
        return jsonify({"error": "not_found"}), 404
    return jsonify(loop)


@loops_bp.route("/estimate", methods=["POST"])
@require_firebase_auth
def estimate_loop_cost():
    """Estimate per-cycle and per-month credits for a hypothetical Loop.

    Body: { briefParsed: {...}, cadence: 'daily'|'every_other_day'|'weekly' }
    Returns: { per_cycle_credits, monthly_credits, cycles_per_month, breakdown }

    Used by the Loop creation hero to show a live cost preview as the user
    types their brief.
    """
    data = request.get_json() or {}
    brief_parsed = data.get("briefParsed") or {}
    cadence = data.get("cadence") or "every_other_day"
    return jsonify(estimate_cycle_cost(brief_parsed, cadence))


@loops_bp.route("/usage-breakdown", methods=["GET"])
@require_firebase_auth
def get_usage_breakdown():
    """Where the user's credits went this month, grouped by source.

    Powers the Account Settings "Where my credits went" panel.
    """
    uid = request.firebase_user["uid"]
    return jsonify(usage_breakdown_this_month(uid))


@loops_bp.route("/<loop_id>/mark-reviewed", methods=["POST"])
@require_firebase_auth
def mark_loop_reviewed(loop_id):
    """Stamp lastReviewedAt=now on the Loop. Called by LoopDetailPage when
    the activity feed renders, so the inactivity-pause gate sees the user
    is engaged.
    """
    from datetime import datetime, timezone
    uid = request.firebase_user["uid"]
    db = get_db()
    ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    if not ref.get().exists:
        return jsonify({"error": "not_found"}), 404
    ref.update({"lastReviewedAt": datetime.now(timezone.utc).isoformat()})
    return jsonify({"ok": True})


@loops_bp.route("/<loop_id>/activity", methods=["GET"])
@require_firebase_auth
def get_user_loop_activity(loop_id):
    """Per-Loop activity feed — every find, newest first."""
    uid = request.firebase_user["uid"]
    limit = request.args.get("limit", 50, type=int)
    items = get_loop_activity(uid, loop_id, limit=min(limit, 100))
    return jsonify({"items": items})


@loops_bp.route("/<loop_id>/run-now", methods=["POST"])
@require_firebase_auth
def run_user_loop_now(loop_id):
    uid = request.firebase_user["uid"]
    loop = run_loop_now(uid, loop_id, app=current_app._get_current_object())
    if not loop:
        return jsonify({"error": "not_found"}), 404
    return jsonify(loop)


@loops_bp.route("/<loop_id>/pause", methods=["POST"])
@require_firebase_auth
def pause_user_loop(loop_id):
    uid = request.firebase_user["uid"]
    loop = pause_loop(uid, loop_id)
    if not loop:
        return jsonify({"error": "not_found"}), 404
    return jsonify(loop)


@loops_bp.route("/<loop_id>/resume", methods=["POST"])
@require_firebase_auth
def resume_user_loop(loop_id):
    uid = request.firebase_user["uid"]
    loop = resume_loop(uid, loop_id, app=current_app._get_current_object())
    if not loop:
        return jsonify({"error": "not_found"}), 404
    return jsonify(loop)
