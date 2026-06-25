"""
Agent routes — API for the autonomous networking agent.

All routes require authentication. Mutation endpoints (POST/PUT) are
Elite-only. GET endpoints are accessible to all tiers for gate UI.

Prefix: /api/agent
"""
from __future__ import annotations

import logging

from flask import Blueprint, current_app, jsonify, request

from app.extensions import get_db, require_firebase_auth, require_tier
from app.services.agent_brief_parser import parse_brief
from app.services.brief_proposer import propose_brief
from app.utils.exceptions import ValidationError
from app.utils.validation import (
    AgentBriefRequest,
    AgentConfigUpdate,
    validate_request,
)
from app.services.agent_service import (
    approve_action,
    deploy_agent,
    get_agent_activity,
    get_agent_companies,
    get_agent_config,
    get_agent_cycles,
    get_agent_jobs,
    get_agent_pipeline,
    get_agent_stats,
    get_cycle_status,
    get_pending_approvals,
    pause_agent,
    reject_action,
    stop_agent,
    trigger_cycle_background,
    update_agent_config,
    update_agent_job_status,
)

logger = logging.getLogger(__name__)

agent_bp = Blueprint("agent", __name__, url_prefix="/api/agent")


@agent_bp.route("/config", methods=["GET"])
@require_firebase_auth
def get_config():
    uid = request.firebase_user["uid"]
    config = get_agent_config(uid)
    return jsonify(config)


@agent_bp.route("/config", methods=["PUT"])
@require_firebase_auth
@require_tier(['elite'])
def put_config():
    uid = request.firebase_user["uid"]
    data = request.get_json() or {}
    try:
        validated = validate_request(AgentConfigUpdate, data)
    except ValidationError as e:
        return e.to_response()
    config = update_agent_config(uid, validated)
    return jsonify(config)


@agent_bp.route("/brief", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def parse_and_save_brief():
    """Parse a free-text Loop brief and save it to the user's agent config.

    Body: { "briefText": "..." }
    Returns: { "briefParsed": {...}, "config": {...} }

    Idempotent — saving the same brief twice is safe. The parsed result is
    stored on the config so cycle execution can read it without re-calling
    the LLM.
    """
    uid = request.firebase_user["uid"]
    data = request.get_json() or {}
    try:
        validated = validate_request(AgentBriefRequest, data)
    except ValidationError as e:
        return e.to_response()
    brief_text = validated["briefText"].strip()

    parsed, status = parse_brief(brief_text)
    config = update_agent_config(uid, {
        "briefText": brief_text,
        "briefParsed": parsed,
    })
    # status: "ok" | "empty" | "failed". Empty input is legitimate (user is
    # still typing); a real LLM failure becomes 502 so the client can show
    # "parser temporarily unavailable" instead of a silent empty parse.
    if status == "failed":
        return jsonify({
            "briefParsed": parsed,
            "config": config,
            "parseStatus": "failed",
            "error": "Brief parser is temporarily unavailable.",
        }), 502
    return jsonify({"briefParsed": parsed, "config": config, "parseStatus": status})


@agent_bp.route("/propose-brief", methods=["POST"])
@require_firebase_auth
def propose_brief_route():
    """Draft a starting Loop brief from the user's resume + profile.

    Used by the V2 Loops setup wizard to pre-fill the Step 01 textarea +
    chips on mount, so students never face a blank page. Body is empty —
    everything we need lives on the user's Firestore doc.

    Returns 200 with ProposedBrief on ok / empty, 502 on failed (the wizard
    falls back to a blank textarea and a friendly toast).

    Not tier-gated: V2 wizard is the single Loop-creation surface across
    free / pro / elite.
    """
    uid = request.firebase_user["uid"]
    db = get_db()
    snap = db.collection("users").document(uid).get()
    user_data = snap.to_dict() if snap.exists else {}
    resume_text = user_data.get("resumeText") or ""
    profile = user_data.get("professionalInfo") or {}

    # Direction extractor stores chip-style preferences at the top level
    # (targetFirms / targetIndustries / extractedRoles / preferredLocations).
    # Pass them through so Claude drafts a sentence aligned with the
    # student's stated preferences, not just resume inference. Legacy doc
    # shape kept the dream-companies list under `dreamCompanies`; honored
    # here so older accounts still benefit.
    direction = {
        "targetFirms": user_data.get("targetFirms") or user_data.get("dreamCompanies") or [],
        "targetIndustries": user_data.get("targetIndustries") or [],
        "extractedRoles": user_data.get("extractedRoles") or [],
        "preferredLocations": user_data.get("preferredLocations") or [],
    }

    proposal = propose_brief(
        resume_text=resume_text,
        profile=profile,
        direction=direction,
    )
    if proposal["status"] == "failed":
        return jsonify({
            **proposal,
            "error": "Brief proposer is temporarily unavailable.",
        }), 502
    return jsonify(proposal)


@agent_bp.route("/deploy", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def deploy():
    uid = request.firebase_user["uid"]
    try:
        config = deploy_agent(uid)
        return jsonify(config)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@agent_bp.route("/pause", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def pause():
    uid = request.firebase_user["uid"]
    config = pause_agent(uid)
    return jsonify(config)


@agent_bp.route("/stop", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def stop():
    uid = request.firebase_user["uid"]
    config = stop_agent(uid)
    return jsonify(config)


@agent_bp.route("/run-now", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def run_now():
    uid = request.firebase_user["uid"]
    try:
        cycle_id = trigger_cycle_background(uid, current_app._get_current_object())
        return jsonify({"cycleId": cycle_id, "status": "running"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@agent_bp.route("/cycles/<cycle_id>/status", methods=["GET"])
@require_firebase_auth
def cycle_status(cycle_id):
    uid = request.firebase_user["uid"]
    result = get_cycle_status(uid, cycle_id)
    if not result:
        return jsonify({"error": "Cycle not found"}), 404
    return jsonify(result)


@agent_bp.route("/activity", methods=["GET"])
@require_firebase_auth
def activity():
    uid = request.firebase_user["uid"]
    limit = request.args.get("limit", 20, type=int)
    offset = request.args.get("offset", 0, type=int)
    actions = get_agent_activity(uid, limit=min(limit, 50), offset=offset)
    return jsonify({"actions": actions})


@agent_bp.route("/stats", methods=["GET"])
@require_firebase_auth
def stats():
    uid = request.firebase_user["uid"]
    return jsonify(get_agent_stats(uid))


@agent_bp.route("/pipeline", methods=["GET"])
@require_firebase_auth
def pipeline():
    uid = request.firebase_user["uid"]
    return jsonify(get_agent_pipeline(uid))


@agent_bp.route("/approvals", methods=["GET"])
@require_firebase_auth
def approvals():
    uid = request.firebase_user["uid"]
    pending = get_pending_approvals(uid)
    return jsonify({"approvals": pending})


@agent_bp.route("/approvals/<action_id>/approve", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def approve(action_id):
    uid = request.firebase_user["uid"]
    try:
        result = approve_action(uid, action_id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@agent_bp.route("/approvals/<action_id>/reject", methods=["POST"])
@require_firebase_auth
@require_tier(['elite'])
def reject(action_id):
    uid = request.firebase_user["uid"]
    try:
        result = reject_action(uid, action_id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@agent_bp.route("/cycles", methods=["GET"])
@require_firebase_auth
def cycles():
    uid = request.firebase_user["uid"]
    limit = request.args.get("limit", 10, type=int)
    cycle_list = get_agent_cycles(uid, limit=min(limit, 50))
    return jsonify({"cycles": cycle_list})


@agent_bp.route("/jobs", methods=["GET"])
@require_firebase_auth
def jobs():
    uid = request.firebase_user["uid"]
    limit = request.args.get("limit", 20, type=int)
    offset = request.args.get("offset", 0, type=int)
    jobs_list = get_agent_jobs(uid, limit=min(limit, 50), offset=offset)
    return jsonify({"jobs": jobs_list})


@agent_bp.route("/jobs/<job_id>/status", methods=["PUT"])
@require_firebase_auth
@require_tier(['elite'])
def update_job_status(job_id):
    uid = request.firebase_user["uid"]
    data = request.get_json() or {}
    status = data.get("status", "")
    try:
        result = update_agent_job_status(uid, job_id, status)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@agent_bp.route("/companies", methods=["GET"])
@require_firebase_auth
def companies():
    uid = request.firebase_user["uid"]
    limit = request.args.get("limit", 20, type=int)
    companies_list = get_agent_companies(uid, limit=min(limit, 50))
    return jsonify({"companies": companies_list})


