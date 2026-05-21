"""
Scout API endpoints - conversational job search assistant.
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.extensions import get_db, require_firebase_auth
from app.services.auth import check_and_reset_credits, deduct_credits_atomic
from app.services.scout_service import scout_service
from app.utils.async_runner import run_async

scout_bp = Blueprint("scout", __name__, url_prefix="/api/scout")

SCOUT_CREDIT_COST = 5


def _get_user_resume():
    """Fetch resume data from Firestore for the authenticated user.
    Returns (user_resume_dict, error_response) - error_response is None on success."""
    user_id = request.firebase_user.get("uid")
    db = get_db()

    user_doc = db.collection("users").document(user_id).get()
    if not user_doc.exists:
        return None, (jsonify({
            "status": "error",
            "message": "Please upload your resume at offerloop.ai first.",
        }), 400)

    user_data = user_doc.to_dict() or {}
    resume_text = user_data.get("resumeText")
    resume_parsed = user_data.get("resumeParsed")

    if not resume_text and not resume_parsed:
        return None, (jsonify({
            "status": "error",
            "message": "Please upload your resume at offerloop.ai first.",
        }), 400)

    # Build a resume dict matching what the service expects
    user_resume = {}
    if resume_parsed and isinstance(resume_parsed, dict):
        user_resume = dict(resume_parsed)
    if resume_text:
        user_resume["resume_text"] = resume_text
    # Include profile fields the service may use
    for key in ("location", "firstName", "lastName", "name", "university"):
        if user_data.get(key):
            user_resume[key] = user_data[key]

    return user_resume, None


def _check_credits():
    """Check if the authenticated user has enough credits for a Scout run.
    Returns (user_id, error_response) - error_response is None on success."""
    user_id = request.firebase_user.get("uid")
    db = get_db()
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        return user_id, (jsonify({
            "status": "error",
            "message": f"Insufficient credits. You need {SCOUT_CREDIT_COST} credits.",
            "error_code": "INSUFFICIENT_CREDITS",
        }), 402)

    user_data = user_doc.to_dict() or {}
    credits_available = check_and_reset_credits(user_ref, user_data)

    if credits_available < SCOUT_CREDIT_COST:
        return user_id, (jsonify({
            "status": "error",
            "message": f"Insufficient credits. You have {credits_available} credits but need {SCOUT_CREDIT_COST}.",
            "error_code": "INSUFFICIENT_CREDITS",
            "current_credits": credits_available,
            "credits_needed": SCOUT_CREDIT_COST,
        }), 402)

    return user_id, None


@scout_bp.route("/chat", methods=["POST"])
@require_firebase_auth
def scout_chat():
    """
    Main Scout chat endpoint.
    Requires Firebase authentication and 5 credits per successful run.
    """
    # Check credits
    user_id, credit_err = _check_credits()
    if credit_err:
        return credit_err

    # Fetch resume from Firestore
    user_resume, resume_err = _get_user_resume()
    if resume_err:
        return resume_err

    payload = request.get_json(force=True, silent=True) or {}
    message = payload.get("message", "")
    context = payload.get("context") or {}
    # Inject server-fetched resume into context (overwrite any client-sent value)
    context["user_resume"] = user_resume

    try:
        result = run_async(
            scout_service.handle_chat(
                message=message,
                context=context,
            )
        )
        # Deduct credits only on success
        deduct_credits_atomic(user_id, SCOUT_CREDIT_COST, "scout_chat")
        return jsonify(result)
    except Exception as exc:
        print(f"[Scout] Chat endpoint failed: {type(exc).__name__}: {exc}")
        import traceback
        print(f"[Scout] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": "Scout is having trouble right now. Please try again!",
            "context": context,
        }), 500


@scout_bp.route("/analyze-job", methods=["POST"])
@require_firebase_auth
def analyze_job():
    """
    Analyze how well the user fits a specific job.
    Requires Firebase authentication and 5 credits per successful run.
    """
    # Check credits
    user_id, credit_err = _check_credits()
    if credit_err:
        return credit_err

    # Fetch resume from Firestore
    user_resume, resume_err = _get_user_resume()
    if resume_err:
        return resume_err

    payload = request.get_json(force=True, silent=True) or {}
    job = payload.get("job", {})

    if not job:
        return jsonify({
            "status": "error",
            "message": "Missing job data"
        }), 400

    try:
        result = run_async(
            scout_service.analyze_job_fit(
                job=job,
                user_resume=user_resume,
            )
        )
        # Deduct credits only on success
        deduct_credits_atomic(user_id, SCOUT_CREDIT_COST, "scout_analyze_job")
        return jsonify(result)
    except Exception as exc:
        print(f"[Scout] Analyze job failed: {type(exc).__name__}: {exc}")
        import traceback
        print(f"[Scout] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": "Failed to analyze job fit"
        }), 500


@scout_bp.route("/firm-assist", methods=["POST"])
@require_firebase_auth
def scout_firm_assist():
    """
    Scout assistant for Firm Search page.
    Requires Firebase authentication and 5 credits per successful run.
    """
    # Check credits
    user_id, credit_err = _check_credits()
    if credit_err:
        return credit_err

    # Fetch resume from Firestore
    user_resume, resume_err = _get_user_resume()
    if resume_err:
        return resume_err

    payload = request.get_json(force=True, silent=True) or {}
    message = payload.get("message", "")
    firm_context = payload.get("firm_context", {})
    fit_context = payload.get("fit_context")
    conversation_history = payload.get("conversation_history", [])

    try:
        result = run_async(
            scout_service.handle_firm_assist(
                message=message,
                firm_context=firm_context,
                user_resume=user_resume,
                fit_context=fit_context,
                conversation_history=conversation_history,
            )
        )
        # Deduct credits only on success
        deduct_credits_atomic(user_id, SCOUT_CREDIT_COST, "scout_firm_assist")
        return jsonify(result)
    except Exception as exc:
        print(f"[Scout] Firm assist failed: {type(exc).__name__}: {exc}")
        import traceback
        print(f"[Scout] Traceback: {traceback.format_exc()}")
        return jsonify({
            "status": "error",
            "message": "Scout ran into an issue. Please try again!",
        }), 500


@scout_bp.route("/health", methods=["GET"])
def scout_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "scout"})
