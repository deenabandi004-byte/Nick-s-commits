"""Shared auto-apply submission entrypoint.

Extracted from the /api/job-board/auto-apply/<id>/submit route body so two
callers share ONE implementation of the eligibility / profile / credit
checks and the worker spawn:
  1. the HTTP route (routes/auto_apply.py), and
  2. Scout's auto_apply_to_job chat tool (services/scout/tools.py).

Returns (payload dict, http-ish status int). The status doubles as the HTTP
status for the route caller; Scout reads the payload's "code" field.
"""
from __future__ import annotations

import logging
import os
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from app.config import AUTO_APPLY_CREDITS
from app.extensions import get_db
from app.services.auth import deduct_credits_atomic, refund_credits_atomic
from app.services.auto_apply.application_profile import (
    get_application_profile,
    is_acknowledged,
    work_auth_complete,
)
from app.services.auto_apply.ats_detector import detect_platform, is_eligible
from app.services.auto_apply.runner import run_auto_apply_job

logger = logging.getLogger(__name__)


def submit_auto_apply_for_user(
    uid: str,
    job_id: str,
    *,
    dry_run: bool = True,
    edited_answers: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], int]:
    """Validate and queue one auto-apply submission for `uid`.

    Spawns the form-filler in a background thread and returns an
    auto_apply_id the caller can poll. Dry-run runs the filler but does NOT
    click Submit, and is free; real submits charge AUTO_APPLY_CREDITS with a
    refund on failure.
    """
    if not os.getenv("BROWSERBASE_API_KEY") or not os.getenv("BROWSERBASE_PROJECT_ID"):
        return {
            "error": (
                "Browserbase is not configured. Set BROWSERBASE_API_KEY and "
                "BROWSERBASE_PROJECT_ID in the environment to enable submissions."
            ),
            "code": "BROWSERBASE_NOT_CONFIGURED",
        }, 501

    edited_answers = edited_answers if isinstance(edited_answers, dict) else {}

    # Eligibility re-check (cheap; prevents stale prepare → submit drift)
    db = get_db()
    job_snap = db.collection("jobs").document(str(job_id)).get()
    if not job_snap.exists:
        return {"error": "job not found", "code": "JOB_NOT_FOUND"}, 404
    job_data = job_snap.to_dict() or {}
    if not is_eligible(job_data):
        return {"error": "job is not auto-apply eligible", "code": "INELIGIBLE"}, 400

    profile = get_application_profile(uid)
    if not is_acknowledged(profile) or not work_auth_complete(profile):
        return {
            "error": "application profile incomplete",
            "code": "PROFILE_REQUIRED",
        }, 409

    # Credit deduction: only on REAL submits. Dry-runs are free so users can
    # iterate without burning credits. Refund on failure.
    if not dry_run:
        ok, _ = deduct_credits_atomic(uid, AUTO_APPLY_CREDITS, "auto_apply")
        if not ok:
            return {
                "error": "insufficient credits",
                "credits_needed": AUTO_APPLY_CREDITS,
                "code": "INSUFFICIENT_CREDITS",
            }, 402

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

    return {
        "auto_apply_id": auto_apply_id,
        "job_id": str(job_id),
        "job_title": job_data.get("title") or "",
        "company": job_data.get("company") or "",
        "dry_run": dry_run,
        "status": "queued",
    }, 200
