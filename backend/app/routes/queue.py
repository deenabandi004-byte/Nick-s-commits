"""
Agentic Networking Queue routes (Phase 1).

Endpoints:
    POST   /api/queue/generate
    GET    /api/queue/current
    GET    /api/queue/status/<queue_id>
    PATCH  /api/queue/<queue_id>/contacts/<contact_id>/approve
    PATCH  /api/queue/<queue_id>/contacts/<contact_id>/dismiss
    GET    /api/queue/preferences
    PUT    /api/queue/preferences

Tier gating: Pro/Elite only (Free tier sees a static teaser card in the
frontend and never hits these endpoints). Backend still enforces the
check - never trust the client tier claim.
"""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from app.config import TIER_CONFIGS
from app.extensions import get_db, require_firebase_auth
from app.services.queue_service import (
    QUEUE_GENERATION_CREDITS,
    VALID_DISMISS_REASONS,
    approve_queue_contact,
    dismiss_queue_contact,
    get_current_queue,
    get_queue_preferences,
    get_queue_status,
    is_free_weekly_eligible,
    is_queue_feature_enabled,
    start_queue_generation,
    update_queue_preferences,
    _InsufficientCredits,
)

logger = logging.getLogger(__name__)

queue_bp = Blueprint("queue", __name__, url_prefix="/api/queue")


def _load_user_doc(db, uid: str) -> dict:
    snap = db.collection("users").document(uid).get()
    return snap.to_dict() or {} if snap.exists else {}


def _resolve_tier(user_data: dict) -> str:
    return user_data.get("subscriptionTier") or user_data.get("tier") or "free"


def _gate_pro_or_elite(user_data: dict):
    """Return (tier, error_response_or_None)."""
    tier = _resolve_tier(user_data)
    if not is_queue_feature_enabled(tier):
        return tier, (
            jsonify(
                {
                    "error": "Agentic queue is a Pro/Elite feature.",
                    "tier": tier,
                    "upgradeRequired": True,
                }
            ),
            403,
        )
    return tier, None


@queue_bp.post("/generate")
@require_firebase_auth
def generate_queue():
    """
    Kick off queue generation in a background thread. Returns a queue_id
    immediately for polling. The frontend auto-generates on first tab
    visit using the user's onboarding profile, and uses the Refine sheet
    for subsequent manual generations.
    """
    uid = request.firebase_user["uid"]
    user_email = request.firebase_user.get("email", "")
    db = get_db()

    user_data = _load_user_doc(db, uid)
    tier, gate_err = _gate_pro_or_elite(user_data)
    if gate_err is not None:
        return gate_err

    body = request.get_json(silent=True) or {}
    filters = body.get("filters") or {}

    # Fall back to onboarding profile when filters are incomplete - this is
    # the "auto-generate on first tab visit" path from /plan-design-review HR-1.
    # The current onboarding flow only writes `careerInterests` / `location.interests`
    # (no `goals.targetCompanies` / `goals.targetRoles`), so we read from the
    # broadest set of fields available.
    goals = user_data.get("goals") or {}
    location = user_data.get("location") or {}
    professional = user_data.get("professionalInfo") or {}
    resume_parsed = user_data.get("resumeParsed") or {}

    def _first_str(value) -> str:
        if not value:
            return ""
        if isinstance(value, str):
            parts = [p.strip() for p in value.split(",") if p.strip()]
            return parts[0] if parts else ""
        if isinstance(value, (list, tuple)):
            for item in value:
                if isinstance(item, str) and item.strip():
                    return item.strip()
        return ""

    if not filters.get("company"):
        company = (
            _first_str(goals.get("targetCompanies"))
            or _first_str(user_data.get("dreamCompanies"))
            or _first_str(user_data.get("targetCompanies"))
            or _first_str(professional.get("targetCompanies"))
        )
        if company:
            filters["company"] = company

    if not filters.get("titleKeywords"):
        title_kw = (
            _first_str(goals.get("targetRoles"))
            or _first_str(user_data.get("targetRoles"))
            or _first_str(professional.get("targetRoles"))
            or _first_str(user_data.get("careerInterests"))
            or _first_str(location.get("careerInterests"))
            or _first_str(location.get("interests"))
            or _first_str(user_data.get("career_interests"))
        )
        if title_kw:
            filters["titleKeywords"] = title_kw

    if not filters.get("university"):
        academics = user_data.get("academics") or {}
        university = (
            academics.get("university")
            or academics.get("college")
            or user_data.get("university")
            or (resume_parsed.get("education") or {}).get("university")
            or ""
        )
        if university:
            filters["university"] = university

    if not filters.get("company") and not filters.get("titleKeywords"):
        return (
            jsonify(
                {
                    "error": (
                        "Queue needs at least a company or title keywords. "
                        "Complete onboarding or use Refine to set filters."
                    ),
                    "needsRefine": True,
                }
            ),
            400,
        )

    # Pro/Elite get one free queue per ISO week.
    is_free = is_free_weekly_eligible(db, uid, tier)

    # Compute the next cycle number from existing preferences
    prefs = get_queue_preferences(db, uid)
    cycle_number = int(prefs.get("cyclesCompleted", 0)) + 1

    try:
        queue_id, credits_charged = start_queue_generation(
            uid=uid,
            filters=filters,
            user_profile=user_data,
            resume_text=user_data.get("resumeText") or "",
            cycle_number=cycle_number,
            is_free_weekly=is_free,
            intent_text=body.get("intentText") or "",
            phase=prefs.get("phase", "guided"),
        )
    except _InsufficientCredits as exc:
        return (
            jsonify(
                {
                    "error": f"Insufficient credits. You need {exc.needed} to generate another queue this week.",
                    "creditsNeeded": exc.needed,
                    "upgradeRequired": tier == "free",
                }
            ),
            402,
        )
    except Exception as exc:
        logger.exception("queue.generate failed uid=%s", uid)
        return jsonify({"error": str(exc)}), 500

    return (
        jsonify(
            {
                "ok": True,
                "queueId": queue_id,
                "isFreeWeekly": is_free,
                "creditsCharged": credits_charged,
                "status": "processing",
            }
        ),
        202,
    )


@queue_bp.get("/current")
@require_firebase_auth
def get_current():
    """Return the most recent non-archived queue with its contacts embedded."""
    uid = request.firebase_user["uid"]
    db = get_db()

    user_data = _load_user_doc(db, uid)
    tier, gate_err = _gate_pro_or_elite(user_data)
    if gate_err is not None:
        return gate_err

    queue = get_current_queue(db, uid)
    if not queue:
        return jsonify({"queue": None}), 200

    return jsonify({"queue": queue}), 200


@queue_bp.get("/status/<queue_id>")
@require_firebase_auth
def get_status(queue_id: str):
    """Poll queue generation status."""
    uid = request.firebase_user["uid"]
    db = get_db()

    status = get_queue_status(db, uid, queue_id)
    if status is None:
        return jsonify({"error": "Queue not found"}), 404
    return jsonify(status), 200


@queue_bp.patch("/<queue_id>/contacts/<contact_id>/approve")
@require_firebase_auth
def approve_contact(queue_id: str, contact_id: str):
    """Approve a queued contact → create Gmail draft + add to pipeline."""
    uid = request.firebase_user["uid"]
    user_email = request.firebase_user.get("email", "")
    db = get_db()

    user_data = _load_user_doc(db, uid)
    _tier, gate_err = _gate_pro_or_elite(user_data)
    if gate_err is not None:
        return gate_err

    try:
        result = approve_queue_contact(
            db=db,
            uid=uid,
            queue_id=queue_id,
            contact_id=contact_id,
            user_email=user_email,
            user_profile=user_data,
        )
    except Exception as exc:
        logger.exception("queue.approve failed uid=%s queue=%s contact=%s", uid, queue_id, contact_id)
        return jsonify({"error": str(exc)}), 500

    if not result.get("ok"):
        if result.get("notFound"):
            return jsonify(result), 404
        return jsonify(result), 400

    return jsonify(result), 200


@queue_bp.patch("/<queue_id>/contacts/<contact_id>/dismiss")
@require_firebase_auth
def dismiss_contact(queue_id: str, contact_id: str):
    """Dismiss a queued contact with a reason (feeds the blocklist)."""
    uid = request.firebase_user["uid"]
    db = get_db()

    user_data = _load_user_doc(db, uid)
    _tier, gate_err = _gate_pro_or_elite(user_data)
    if gate_err is not None:
        return gate_err

    body = request.get_json(silent=True) or {}
    reason = (body.get("reason") or "").strip()

    if reason not in VALID_DISMISS_REASONS:
        return (
            jsonify(
                {
                    "error": f"Invalid reason. Must be one of: {', '.join(sorted(VALID_DISMISS_REASONS))}",
                }
            ),
            400,
        )

    try:
        result = dismiss_queue_contact(
            db=db,
            uid=uid,
            queue_id=queue_id,
            contact_id=contact_id,
            reason=reason,
        )
    except Exception as exc:
        logger.exception("queue.dismiss failed uid=%s queue=%s contact=%s", uid, queue_id, contact_id)
        return jsonify({"error": str(exc)}), 500

    if not result.get("ok"):
        if result.get("notFound"):
            return jsonify(result), 404
        return jsonify(result), 400

    return jsonify(result), 200


@queue_bp.get("/preferences")
@require_firebase_auth
def get_preferences():
    """Return queue preferences (pause state, blocklist, cycles)."""
    uid = request.firebase_user["uid"]
    db = get_db()
    prefs = get_queue_preferences(db, uid)
    return jsonify({"preferences": prefs}), 200


@queue_bp.put("/preferences")
@require_firebase_auth
def put_preferences():
    """Update the whitelisted subset of queue preferences (pause/cadence)."""
    uid = request.firebase_user["uid"]
    db = get_db()
    body = request.get_json(silent=True) or {}
    merged = update_queue_preferences(db, uid, body)
    return jsonify({"preferences": merged}), 200
