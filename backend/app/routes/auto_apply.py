"""
Auto-apply endpoints.

Routes mounted under /api/job-board/auto-apply/* so they sit alongside the
existing job-board surface. Application Profile endpoints are mounted at
/api/users/application-profile/* on the same blueprint.

Phase 1 endpoints:
  GET  /api/users/application-profile           — read saved profile
  POST /api/users/application-profile           — save profile (stamps acknowledgedAt)
  POST /api/job-board/auto-apply/prepare        — generate preview (loads job + profile + LLM open-ended)
  POST /api/job-board/auto-apply/<id>/submit    — kick off Browserless form submission
  GET  /api/job-board/auto-apply/<id>/status    — poll job status

Tier gate: prepare/submit/status require Pro or Elite. Profile endpoints are
available to all signed-in users (Free can set their profile in advance even
though they cannot run auto-apply).
"""
from __future__ import annotations

import logging
import os
import threading
import uuid
from datetime import datetime
from typing import Any, Dict

from flask import Blueprint, jsonify, request

from app.config import AUTO_APPLY_CREDITS
from app.extensions import get_db, require_firebase_auth, require_tier
from app.services.auth import deduct_credits_atomic, refund_credits_atomic
from app.services.auto_apply.answer_library import save_answer
from app.services.auto_apply.application_profile import (
    get_application_profile,
    is_acknowledged,
    save_application_profile,
    work_auth_complete,
)
from app.services.auto_apply.ats_detector import detect_platform, is_eligible
from app.services.auto_apply.preview import build_preview, load_user_for_apply
from app.services.auto_apply.runner import run_auto_apply_job


logger = logging.getLogger(__name__)

auto_apply_bp = Blueprint("auto_apply", __name__)


# =============================================================================
# Application Profile (available to all tiers)
# =============================================================================

@auto_apply_bp.route("/api/users/application-profile", methods=["GET"])
@require_firebase_auth
def read_application_profile():
    uid = request.firebase_user["uid"]
    profile = get_application_profile(uid)
    return jsonify({
        "profile": profile,
        "acknowledged": is_acknowledged(profile),
        "work_auth_complete": work_auth_complete(profile),
    })


@auto_apply_bp.route("/api/users/application-profile", methods=["POST"])
@require_firebase_auth
def write_application_profile():
    uid = request.firebase_user["uid"]
    payload = request.get_json(silent=True) or {}
    incoming = payload.get("profile") if isinstance(payload, dict) else None
    if not isinstance(incoming, dict):
        return jsonify({"error": "profile object required"}), 400
    saved = save_application_profile(uid, incoming)
    return jsonify({
        "profile": saved,
        "acknowledged": is_acknowledged(saved),
        "work_auth_complete": work_auth_complete(saved),
    })


# =============================================================================
# Auto-apply: Pro / Elite only
# =============================================================================

def _load_job(job_id: str) -> Dict[str, Any]:
    """Load a job from the global jobs/ collection."""
    db = get_db()
    snap = db.collection("jobs").document(str(job_id)).get()
    return (snap.to_dict() or {}) if snap.exists else {}


@auto_apply_bp.route("/api/job-board/auto-apply/prepare", methods=["POST"])
@require_firebase_auth
@require_tier(["pro", "elite"])
def prepare_auto_apply():
    """Validate eligibility, load profile, return a preview payload the client
    renders in the review modal. Does NOT deduct credits — that happens on
    submit.

    Returns 409 PROFILE_REQUIRED if the user has not acknowledged their
    Application Profile yet, so the client can render the profile modal first.
    """
    uid = request.firebase_user["uid"]
    payload = request.get_json(silent=True) or {}
    job_id = payload.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id required"}), 400

    job = _load_job(job_id)
    if not job:
        return jsonify({"error": "job not found"}), 404
    if not is_eligible(job):
        return jsonify({"error": "job is not auto-apply eligible", "code": "INELIGIBLE"}), 400

    profile = get_application_profile(uid)
    if not is_acknowledged(profile):
        return jsonify({
            "error": "application profile required",
            "code": "PROFILE_REQUIRED",
        }), 409
    if not work_auth_complete(profile):
        return jsonify({
            "error": "work authorization required in profile",
            "code": "WORK_AUTH_REQUIRED",
        }), 409

    try:
        user = load_user_for_apply(uid)
        user["applicationProfile"] = profile  # already loaded; avoid double-read
        preview = build_preview(job, user)
        preview_complete = True
    except Exception as exc:
        # Don't blow up on data-shape surprises — return a degraded preview
        # (empty identity + answers + LLM) so the user can still see the modal
        # and edit. Logged so we can spot recurring shapes that need defensive
        # coverage in build_preview.
        logger.exception("preview generation failed for uid=%s job=%s: %s", uid, job_id, exc)
        from app.services.auto_apply.preview import build_resume_descriptor
        preview = {
            "fields": {"first_name": "", "last_name": "", "full_name": "",
                       "email": "", "phone": "", "location": "",
                       "linkedin_url": "", "github_url": "", "portfolio_url": ""},
            "structured_answers": {
                "authorized_to_work_us": None, "requires_sponsorship": None,
                "visa_status": None, "gender": "decline", "race": "decline",
                "ethnicity": "decline", "lgbtq": "decline",
                "veteran_status": "decline", "disability_status": "decline",
                "earliest_start_date": None, "expected_salary_usd": None,
                "open_to_relocation": None, "open_to_remote": None,
            },
            "open_ended_answers": {},
            "resume": {"has_resume": False, "filename": "resume.pdf"},
            "unmapped_fields": [],
        }
        preview_complete = False

    return jsonify({
        "job_id": str(job_id),
        "ats_platform": detect_platform(job),
        "preview": preview,
        "preview_complete": preview_complete,
        "job": {
            "title": job.get("title"),
            "company": job.get("company"),
            "apply_url": job.get("apply_url"),
        },
    })


@auto_apply_bp.route("/api/job-board/auto-apply/<job_id>/submit", methods=["POST"])
@require_firebase_auth
@require_tier(["pro", "elite"])
def submit_auto_apply(job_id: str):
    """Spawn the form-filler in a background thread, return an auto_apply_id
    the client polls for status. Body:
      { dry_run: bool, edited_answers: { why_role: str, why_company: str } }
    Dry-run runs the filler but does NOT click Submit — useful for verifying
    selectors and previewing the filled state with a screenshot."""
    if not os.getenv("BROWSERBASE_API_KEY") or not os.getenv("BROWSERBASE_PROJECT_ID"):
        return jsonify({
            "error": "Browserbase is not configured. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in the environment to enable submissions.",
            "code": "BROWSERBASE_NOT_CONFIGURED",
        }), 501

    uid = request.firebase_user["uid"]
    payload = request.get_json(silent=True) or {}
    dry_run = bool(payload.get("dry_run", True))
    edited_answers = payload.get("edited_answers") or {}
    if not isinstance(edited_answers, dict):
        edited_answers = {}

    # Eligibility re-check (cheap; prevents stale prepare → submit drift)
    db = get_db()
    job_snap = db.collection("jobs").document(str(job_id)).get()
    if not job_snap.exists:
        return jsonify({"error": "job not found", "code": "JOB_NOT_FOUND"}), 404
    job_data = job_snap.to_dict() or {}
    if not is_eligible(job_data):
        return jsonify({"error": "job is not auto-apply eligible", "code": "INELIGIBLE"}), 400

    profile = get_application_profile(uid)
    if not is_acknowledged(profile) or not work_auth_complete(profile):
        return jsonify({
            "error": "application profile incomplete",
            "code": "PROFILE_REQUIRED",
        }), 409

    # Credit deduction: only on REAL submits. Dry-runs are free so users can
    # iterate without burning credits. Refund on failure.
    if not dry_run:
        ok, _ = deduct_credits_atomic(uid, AUTO_APPLY_CREDITS, "auto_apply")
        if not ok:
            return jsonify({
                "error": "insufficient credits",
                "credits_needed": AUTO_APPLY_CREDITS,
                "code": "INSUFFICIENT_CREDITS",
            }), 402

    auto_apply_id = uuid.uuid4().hex
    job_ref = db.collection("users").document(uid).collection(
        "autoApplyJobs"
    ).document(auto_apply_id)
    job_ref.set({
        "auto_apply_id": auto_apply_id,
        "job_id": str(job_id),
        "ats_platform": detect_platform(job_data),
        # Denormalized for the Auto-Submission + Needs Attention tab cards so
        # they don't have to round-trip jobs/{job_id} for every list render.
        "job_title": job_data.get("title") or "",
        "company": job_data.get("company") or "",
        "apply_url": job_data.get("apply_url") or "",
        "dry_run": dry_run,
        "status": "queued",
        "stage": "queued",
        "credits_charged": 0 if dry_run else AUTO_APPLY_CREDITS,
        "created_at": datetime.utcnow().isoformat(),
    })

    def _worker():
        from flask import current_app
        try:
            run_auto_apply_job(
                auto_apply_id=auto_apply_id,
                uid=uid,
                job_id=str(job_id),
                dry_run=dry_run,
                edited_answers=edited_answers,
            )
        finally:
            # Refund on failure (real submits only)
            if not dry_run:
                try:
                    snap = job_ref.get()
                    data = snap.to_dict() or {}
                    if data.get("status") in ("failed", "submit_failed"):
                        refund_credits_atomic(
                            uid, AUTO_APPLY_CREDITS, "auto_apply_refund"
                        )
                        job_ref.update({"credits_refunded": True})
                except Exception:
                    logger.exception("refund check failed")

    threading.Thread(target=_worker, daemon=True).start()

    return jsonify({
        "auto_apply_id": auto_apply_id,
        "job_id": str(job_id),
        "dry_run": dry_run,
        "status": "queued",
    }), 200


@auto_apply_bp.route(
    "/api/job-board/auto-apply/<auto_apply_id>/status", methods=["GET"]
)
@require_firebase_auth
@require_tier(["pro", "elite"])
def auto_apply_status(auto_apply_id: str):
    """Return the current autoApplyJobs doc so the modal can poll."""
    uid = request.firebase_user["uid"]
    snap = (
        get_db()
        .collection("users")
        .document(uid)
        .collection("autoApplyJobs")
        .document(auto_apply_id)
        .get()
    )
    if not snap.exists:
        return jsonify({"error": "not found", "code": "NOT_FOUND"}), 404
    return jsonify(snap.to_dict() or {})


# =============================================================================
# Needs Attention queue + answer-library resolution
# =============================================================================


@auto_apply_bp.route(
    "/api/job-board/auto-apply/<auto_apply_id>/resolve", methods=["POST"]
)
@require_firebase_auth
@require_tier(["pro", "elite"])
def resolve_needs_attention(auto_apply_id: str):
    """User answered some / all of the pending questions in the Needs Attention
    drawer. Body: { answers: { question_id: value, ... } }.

    Behavior:
      - Each answer is saved to the per-user applicationAnswerLibrary so the
        same question on the next job auto-fills.
      - Pending questions whose question_id is in `answers` are cleared from
        the autoApplyJobs doc.
      - If any required pending question remains, status stays
        "needs_attention" and the doc reflects the partial progress.
      - If all required pending questions are now answered, we re-spawn the
        background worker which re-runs the filler. On the second run the
        library hits make the filler resolve every field, and the actual
        submission fires.

    Credits are NOT touched here — they were deducted at the original Submit
    click and stay deducted through needs_attention.
    """
    uid = request.firebase_user["uid"]
    payload = request.get_json(silent=True) or {}
    incoming = payload.get("answers")
    if not isinstance(incoming, dict) or not incoming:
        return jsonify({"error": "answers object required", "code": "BAD_REQUEST"}), 400

    db = get_db()
    job_ref = (
        db.collection("users").document(uid)
        .collection("autoApplyJobs").document(auto_apply_id)
    )
    snap = job_ref.get()
    if not snap.exists:
        return jsonify({"error": "not found", "code": "NOT_FOUND"}), 404
    data = snap.to_dict() or {}

    if data.get("status") != "needs_attention":
        return jsonify({
            "error": f"job is in status {data.get('status')!r}, not needs_attention",
            "code": "NOT_PAUSED",
        }), 409

    pending = data.get("pending_questions") or []
    by_id = {p.get("field_id") or p.get("question_id"): p for p in pending}

    # Write each provided answer to the library. Synchronous (per
    # feedback_sync_event_writes.md — durability beats latency for the queue).
    saved_ids = []
    for qid, value in incoming.items():
        question = by_id.get(qid)
        if not question:
            continue  # Unknown question_id — silently skip
        label = question.get("label") or ""
        field_type = question.get("field_type") or "text"
        options = question.get("options")
        save_answer(
            uid=uid,
            question_text=label,
            answer=value,
            field_type=field_type,
            options=options,
            source="user_answered",
        )
        saved_ids.append(qid)

    # Recompute remaining pending: anything still required AND not in saved_ids
    remaining = [
        q for q in pending
        if (q.get("field_id") or q.get("question_id")) not in saved_ids
    ]
    required_remaining = [q for q in remaining if q.get("required") is True]

    update_payload: Dict[str, Any] = {
        "pending_questions": remaining,
        "pending_resolved_at": datetime.utcnow().isoformat(),
    }

    if required_remaining:
        # Partial resolution — stay in needs_attention until the user finishes.
        update_payload["status"] = "needs_attention"
        job_ref.update(update_payload)
        return jsonify({
            "auto_apply_id": auto_apply_id,
            "status": "needs_attention",
            "pending_questions": remaining,
            "saved_to_library": saved_ids,
        }), 200

    # All required pending questions resolved → re-run the worker. The library
    # is now populated, so the next filler pass will resolve every field and
    # actually click Submit.
    update_payload["status"] = "queued"
    update_payload["stage"] = "queued_for_resume"
    job_ref.update(update_payload)

    job_id = data.get("job_id")
    dry_run = bool(data.get("dry_run"))

    # Pass the user's drawer answers to the resume worker as edited_answers.
    # Without this, sensitive-slot answers (work auth, demographics) that
    # the library refuses to save get silently dropped, and the worker
    # re-runs with the same resolver state — leading to the "asked twice"
    # drawer loop. edited_answers wins over library+profile+LLM inside the
    # filler so user input always trumps stale stored values.
    drawer_answers = {qid: incoming[qid] for qid in saved_ids if qid in incoming}
    # Also include answers that didn't save to the library (sensitive slots)
    # so they at least flow through to this resume run, even if they won't
    # persist to the next job.
    for qid, value in incoming.items():
        if qid not in drawer_answers and by_id.get(qid):
            drawer_answers[qid] = value

    def _resume_worker():
        try:
            run_auto_apply_job(
                auto_apply_id=auto_apply_id,
                uid=uid,
                job_id=str(job_id),
                dry_run=dry_run,
                edited_answers=drawer_answers,
            )
        except Exception:
            logger.exception("resume worker crashed for %s", auto_apply_id)

    threading.Thread(target=_resume_worker, daemon=True).start()

    return jsonify({
        "auto_apply_id": auto_apply_id,
        "status": "queued",
        "pending_questions": [],
        "saved_to_library": saved_ids,
    }), 200


@auto_apply_bp.route(
    "/api/job-board/auto-apply/needs-attention", methods=["GET"]
)
@require_firebase_auth
@require_tier(["pro", "elite"])
def list_needs_attention():
    """Return all autoApplyJobs docs for this user with status=needs_attention.
    Used by the Needs Attention tab in the job board."""
    uid = request.firebase_user["uid"]
    docs = (
        get_db().collection("users").document(uid)
        .collection("autoApplyJobs")
        .where("status", "==", "needs_attention")
        .stream()
    )
    items = [d.to_dict() or {} for d in docs]
    items.sort(key=lambda x: x.get("inspect_completed_at") or x.get("created_at") or "", reverse=True)
    return jsonify({"items": items, "count": len(items)})


# =============================================================================
# Needs Verification queue + "finish in browser" resolution
# =============================================================================

@auto_apply_bp.route(
    "/api/job-board/auto-apply/needs-verification", methods=["GET"]
)
@require_firebase_auth
@require_tier(["pro", "elite"])
def list_needs_verification():
    """Return all autoApplyJobs docs for this user with status=needs_verification.

    These are jobs where the filler completed the form fill but the ATS
    (Greenhouse / Lever / Ashby) ships CAPTCHA that would reject our
    headless-browser submission. The user finishes the submit themselves
    in their own browser; reCAPTCHA / hCaptcha scores their real-device
    session as human.

    Each item carries `prepared_answers` (what we filled), `captcha`
    (vendor + sitekey), and `apply_url` (where to go). The frontend
    surfaces these in the Auto-Submission tab as "Finish in browser"
    cards."""
    uid = request.firebase_user["uid"]
    docs = (
        get_db().collection("users").document(uid)
        .collection("autoApplyJobs")
        .where("status", "==", "needs_verification")
        .stream()
    )
    items = [d.to_dict() or {} for d in docs]
    items.sort(
        key=lambda x: x.get("inspect_completed_at") or x.get("created_at") or "",
        reverse=True,
    )
    return jsonify({"items": items, "count": len(items)})


@auto_apply_bp.route(
    "/api/job-board/auto-apply/<auto_apply_id>/mark-submitted", methods=["POST"]
)
@require_firebase_auth
@require_tier(["pro", "elite"])
def mark_submitted(auto_apply_id: str):
    """The user finished a needs_verification job in their own browser and
    is confirming they hit Submit. We transition the job to `submitted`
    and stamp `completed_at` so it leaves the verification queue and shows
    up in the regular "submitted" list. Credits stay deducted — the user
    got value from the pre-fill.

    Returns 409 if the job isn't in needs_verification (no-op on stale
    clicks)."""
    uid = request.firebase_user["uid"]
    db = get_db()
    job_ref = (
        db.collection("users").document(uid)
        .collection("autoApplyJobs").document(auto_apply_id)
    )
    snap = job_ref.get()
    if not snap.exists:
        return jsonify({"error": "not found", "code": "NOT_FOUND"}), 404
    data = snap.to_dict() or {}

    if data.get("status") != "needs_verification":
        return jsonify({
            "error": f"job is in status {data.get('status')!r}, "
                     "not needs_verification",
            "code": "NOT_PAUSED",
        }), 409

    now = datetime.utcnow().isoformat()
    job_ref.update({
        "status": "submitted",
        "completed_at": now,
        "user_marked_submitted_at": now,
    })
    return jsonify({
        "auto_apply_id": auto_apply_id,
        "status": "submitted",
    }), 200


@auto_apply_bp.route(
    "/api/job-board/auto-apply/list", methods=["GET"]
)
@require_firebase_auth
@require_tier(["pro", "elite"])
def list_auto_apply_jobs():
    """Return autoApplyJobs for this user, optionally filtered by status.
    Used by the Auto-Submission tab: in-flight + submitted + failed mixed.

    Query params:
      ?status=queued,running,submitted,submit_failed,failed,needs_attention
        (comma-separated)
      ?limit=N  (default 100, max 200)
    """
    uid = request.firebase_user["uid"]
    status_filter = request.args.get("status")
    statuses = [s.strip() for s in status_filter.split(",")] if status_filter else None
    try:
        limit = min(int(request.args.get("limit") or 100), 200)
    except ValueError:
        limit = 100

    collection = (
        get_db().collection("users").document(uid).collection("autoApplyJobs")
    )
    if statuses:
        # Firestore `in` queries cap at 10 values — auto-apply has only 6
        # statuses today so we're fine.
        docs = collection.where("status", "in", statuses).stream()
    else:
        docs = collection.stream()

    items = [d.to_dict() or {} for d in docs]
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return jsonify({"items": items[:limit], "count": len(items)})
