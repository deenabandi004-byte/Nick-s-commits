"""
Agent routes - API for the autonomous networking agent.

All routes require authentication. Mutation endpoints (POST/PUT) are
Elite-only. GET endpoints are accessible to all tiers for gate UI.

Prefix: /api/agent
"""
from __future__ import annotations

import logging

from flask import Blueprint, current_app, jsonify, request

from app.extensions import require_firebase_auth, require_tier
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
    config = update_agent_config(uid, data)
    return jsonify(config)


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


