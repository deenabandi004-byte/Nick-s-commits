"""
Auto-apply orchestrator.

Called from a background thread spawned by the submit endpoint. Loads
everything the per-ATS filler needs, dispatches, persists status updates to
Firestore as the run progresses, cleans up the temp resume file, and on
real (non-dry-run) success writes `applied_at` onto users/{uid}/savedJobs.

Job-doc collection: users/{uid}/autoApplyJobs/{auto_apply_id}
  status:      "queued" | "running" | "dry_run_complete" | "submitted" | "failed"
  stage:       human-readable progress string
  job_id:      source job ID (for the savedJobs link)
  dry_run:     bool
  screenshot_b64: base64 PNG (small for now; move to Storage if it grows)
  filled_summary: { field_name: "filled" | "empty" | error_msg }
  unmapped:    [{ field_id, label }] — fields the filler couldn't map
  failure_reason: str
  created_at:  ISO timestamp
  completed_at: ISO timestamp
"""
from __future__ import annotations

import logging
import os
import tempfile
import traceback
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import requests
from firebase_admin import firestore

from app.extensions import get_db
from app.services.auto_apply.answer_library import lookup_answer as _lib_lookup
from app.services.auto_apply.application_profile import get_application_profile
from app.services.auto_apply.ats_detector import detect_platform
from app.services.auto_apply.preview import build_preview, load_user_for_apply
from app.services.auto_apply.screening_answers import summarize_resume_for_prompt


logger = logging.getLogger(__name__)


JOB_COLLECTION_NAME = "autoApplyJobs"


def _make_answer_lookup(uid: str):
    """Build the callback the form-fillers use to query this user's answer
    library. Bound to the uid so the filler is uid-agnostic."""
    def lookup(label: str, field_type: str, options):
        return _lib_lookup(uid, label, field_type, options)
    return lookup


def update_status(uid: str, auto_apply_id: str, **fields: Any) -> None:
    """Patch the job doc. Stamps `updated_at` automatically."""
    fields.setdefault("updated_at", datetime.utcnow().isoformat())
    try:
        get_db().collection("users").document(uid).collection(
            JOB_COLLECTION_NAME
        ).document(auto_apply_id).update(fields)
    except Exception:
        logger.exception("update_status failed for %s/%s", uid, auto_apply_id)


def run_auto_apply_job(
    auto_apply_id: str,
    uid: str,
    job_id: str,
    dry_run: bool,
    edited_answers: Dict[str, str],
) -> None:
    """Background entry point. Drives the whole run and writes status to
    Firestore so the polling endpoint can serve the UI."""
    resume_path: Optional[str] = None
    try:
        update_status(uid, auto_apply_id, status="running", stage="loading_data")

        db = get_db()
        job_snap = db.collection("jobs").document(str(job_id)).get()
        if not job_snap.exists:
            update_status(
                uid, auto_apply_id,
                status="failed",
                failure_reason="job not found",
                completed_at=datetime.utcnow().isoformat(),
            )
            return
        job_data = job_snap.to_dict() or {}

        user = load_user_for_apply(uid)
        profile = get_application_profile(uid)
        user["applicationProfile"] = profile

        preview = build_preview(job_data, user)
        # Carry the profile inside the preview dict so the form-fillers can
        # reach it without re-fetching. Underscore-prefixed so it's clearly
        # internal and never accidentally rendered in the modal payload.
        preview["_application_profile"] = profile

        resume_summary = _build_student_context(user, preview.get("fields"))

        update_status(
            uid, auto_apply_id,
            # Diagnostic: lets us see post-hoc whether the LLM had any context
            # to work with. Empty context => everything will route to drawer.
            context_chars=len(resume_summary or ""),
        )

        update_status(uid, auto_apply_id, stage="downloading_resume")

        resume_url = user.get("resumeUrl") or user.get("resumeURL")
        if resume_url:
            try:
                resume_path = _download_resume_to_temp(
                    resume_url, user.get("resumeFileName") or "resume.pdf"
                )
            except Exception as exc:
                logger.warning("resume download failed: %s", exc)
                resume_path = None

        update_status(uid, auto_apply_id, stage="filling_form")

        platform = detect_platform(job_data)
        if platform == "greenhouse":
            from app.services.auto_apply.greenhouse import run_greenhouse_filler
            result = run_greenhouse_filler(
                apply_url=job_data.get("apply_url") or "",
                preview=preview,
                edited_answers=edited_answers or {},
                resume_path=resume_path,
                dry_run=dry_run,
                job_id=str(job_id),
                answer_lookup=_make_answer_lookup(uid),
                uid=uid,
                resume_summary=resume_summary,
                job_data=job_data,
            )
        elif platform == "lever":
            from app.services.auto_apply.lever import run_lever_filler
            result = run_lever_filler(
                apply_url=job_data.get("apply_url") or "",
                preview=preview,
                edited_answers=edited_answers or {},
                resume_path=resume_path,
                dry_run=dry_run,
                job_id=str(job_id),
                answer_lookup=_make_answer_lookup(uid),
                uid=uid,
                resume_summary=resume_summary,
                job_data=job_data,
            )
        elif platform == "ashby":
            from app.services.auto_apply.ashby import run_ashby_filler
            result = run_ashby_filler(
                apply_url=job_data.get("apply_url") or "",
                preview=preview,
                edited_answers=edited_answers or {},
                resume_path=resume_path,
                dry_run=dry_run,
                job_id=str(job_id),
                answer_lookup=_make_answer_lookup(uid),
                uid=uid,
                resume_summary=resume_summary,
                job_data=job_data,
            )
        else:
            result = {
                "status": "failed",
                "failure_reason": f"no form-filler for {platform!r} yet",
            }

        # Two terminal-but-not-completed states. Both mean "filler did
        # everything it could, now waiting on the user", and neither marks
        # `completed_at`:
        #   - needs_attention: required fields the resolver couldn't answer
        #     (LLM NEEDS_USER, library miss, etc). Drawer asks the user to
        #     fill them in; on resolve we re-spawn the worker.
        #   - needs_verification: form fill succeeded but the ATS ships
        #     CAPTCHA (Greenhouse reCAPTCHA, Lever hCaptcha, Ashby
        #     reCAPTCHA v3). User finishes the submission from their own
        #     browser (real device + IP = high CAPTCHA score). Drawer
        #     shows prepared_answers as a reference.
        status = result.get("status", "failed")
        is_paused_for_user = status in ("needs_attention", "needs_verification")

        patch: Dict[str, Any] = {
            "status": status,
            "filled_summary": result.get("filled") or {},
            "unmapped": result.get("unmapped") or [],
            "inspect_completed_at": datetime.utcnow().isoformat(),
        }
        if not is_paused_for_user:
            patch["completed_at"] = datetime.utcnow().isoformat()
        if result.get("pending_questions"):
            patch["pending_questions"] = result["pending_questions"]
        if result.get("prepared_answers"):
            patch["prepared_answers"] = result["prepared_answers"]
        if result.get("captcha"):
            patch["captcha"] = result["captcha"]
        if result.get("apply_url"):
            patch["apply_url"] = result["apply_url"]
        if result.get("screenshot_b64"):
            # Firestore caps a single property value at 1,048,487 bytes.
            # Full-page Greenhouse screenshots routinely exceed that (long
            # forms scroll past 1MB of PNG base64). Inline fast-path
            # under the cap; Cloud Storage URL above it. Without the URL
            # fallback, every long-form failure ships with zero visual
            # evidence and is undebuggable.
            shot = result["screenshot_b64"]
            if isinstance(shot, str) and len(shot) <= 1_000_000:
                patch["screenshot_b64"] = shot
            elif isinstance(shot, str):
                url = _upload_screenshot_to_storage(uid, auto_apply_id, shot)
                if url:
                    patch["screenshot_url"] = url
                else:
                    logger.warning(
                        "auto_apply screenshot too large for Firestore (%d bytes); "
                        "Cloud Storage upload also failed; dropping",
                        len(shot),
                    )
        if result.get("failure_reason"):
            patch["failure_reason"] = result["failure_reason"]
        if result.get("attempted_urls"):
            patch["attempted_urls"] = result["attempted_urls"]
        if result.get("attempt_log"):
            patch["attempt_log"] = result["attempt_log"]
        update_status(uid, auto_apply_id, **patch)

        if result.get("status") == "submitted":
            try:
                db.collection("users").document(uid).collection(
                    "savedJobs"
                ).document(str(job_id)).set(
                    {"applied_at": firestore.SERVER_TIMESTAMP},
                    merge=True,
                )
            except Exception:
                logger.exception("failed to stamp savedJobs.applied_at")

    except Exception as exc:
        logger.exception("auto-apply runner crashed for %s/%s", uid, auto_apply_id)
        update_status(
            uid, auto_apply_id,
            status="failed",
            failure_reason=f"{type(exc).__name__}: {exc}",
            traceback=traceback.format_exc()[-2000:],
            completed_at=datetime.utcnow().isoformat(),
        )
    finally:
        if resume_path and os.path.exists(resume_path):
            try:
                os.unlink(resume_path)
            except Exception:
                pass


def _build_student_context(
    user: Dict[str, Any],
    preview_fields: Optional[Dict[str, Any]] = None,
) -> str:
    """Compose the context the LLM uses to answer form questions.

    Pulls from EVERY surface the runner has access to:
      - `preview.fields` — name/email/phone/location/LinkedIn/GitHub/
        most_recent_company/most_recent_title (computed by build_structured_fields
        from resume + profile, this is the highest-quality denormalization)
      - `user.resumeParsed` — long-form experience/education/skills
      - `user.academics` — school/major/year (when resume parsing missed it)
      - `user.applicationProfile.workAuthorization` — work auth + sponsorship +
        visa status. Critical context so the LLM can answer "Do you have the
        legal right to work?" without seeing a blank `<student>` block.

    The LLM gets one cohesive view of the candidate, named sections so it can
    quote them ("CURRENT ROLE", "LOCATION", "WORK AUTHORIZATION") in answers."""
    parts: list[str] = []
    pf = preview_fields or {}

    name = pf.get("full_name") or user.get("name")
    if name:
        parts.append(f"NAME: {name}")

    email = pf.get("email") or user.get("email")
    if email:
        parts.append(f"EMAIL: {email}")

    phone = pf.get("phone")
    if phone:
        parts.append(f"PHONE: {phone}")

    # Location — preview.fields uses resume.location merged with profile.
    location = pf.get("location")
    if not location:
        loc_doc = user.get("location") or {}
        if isinstance(loc_doc, dict):
            location = loc_doc.get("currentLocation") or loc_doc.get("city")
            if not location:
                pref = loc_doc.get("preferredLocation")
                if isinstance(pref, list) and pref:
                    location = pref[0]
                elif isinstance(pref, str):
                    location = pref
        elif isinstance(loc_doc, str):
            location = loc_doc
    if location:
        parts.append(f"LOCATION: {location}")

    # Current role — preview.fields derives this from resume.experience[0].
    # If the resume parser hasn't filled experience yet, fall back to
    # professionalInfo on the user doc (some Offerloop users set
    # currentCompany / currentTitle during onboarding).
    cur_company = pf.get("most_recent_company")
    cur_title = pf.get("most_recent_title")
    prof = user.get("professionalInfo") or {}
    if not cur_company:
        cur_company = prof.get("currentCompany") or prof.get("company")
    if not cur_title:
        cur_title = prof.get("currentTitle") or prof.get("title") or prof.get("role")
    if cur_company or cur_title:
        parts.append(
            f"CURRENT ROLE: {cur_title or 'unknown title'} at {cur_company or 'unknown company'}"
        )

    # Links — preview.fields merges profile overrides for LinkedIn (profile wins).
    link_bits = []
    for key, label in (
        ("linkedin_url", "LinkedIn"),
        ("github_url", "GitHub"),
        ("portfolio_url", "Portfolio"),
    ):
        val = pf.get(key)
        if val:
            link_bits.append(f"{label}={val}")
    if link_bits:
        parts.append("LINKS: " + " | ".join(link_bits))

    # Work authorization — critical, currently the most-missed field. Surface
    # explicit YES/NO/UNSET so the LLM can answer dropdown questions ("Do you
    # have the legal right to work?") truthfully.
    profile = user.get("applicationProfile") or {}
    wa = profile.get("workAuthorization") or {}
    wa_bits = []
    auth_us = wa.get("authorizedToWorkUS")
    if auth_us is True:
        wa_bits.append("authorized to work in US=YES")
    elif auth_us is False:
        wa_bits.append("authorized to work in US=NO")
    req_sp = wa.get("requiresSponsorship")
    if req_sp is True:
        wa_bits.append("requires visa sponsorship=YES")
    elif req_sp is False:
        wa_bits.append("requires visa sponsorship=NO")
    visa = wa.get("visaStatus")
    if visa:
        wa_bits.append(f"visa status={visa}")
    if wa_bits:
        parts.append("WORK AUTHORIZATION: " + " | ".join(wa_bits))

    # Resume long-form (experience + education + skills + summary).
    resume_summary = summarize_resume_for_prompt(user.get("resumeParsed") or {})
    if resume_summary:
        parts.append("RESUME:\n" + resume_summary)

    # Academics — only adds info when resume parsing missed it.
    academics = user.get("academics") or {}
    acad_bits = []
    for key in ("school", "major", "minor", "degree", "graduationYear", "gpa"):
        val = academics.get(key)
        if val:
            acad_bits.append(f"{key}={val}")
    if acad_bits:
        parts.append("ACADEMICS: " + " | ".join(acad_bits))

    return "\n\n".join(parts)


def _download_resume_to_temp(url: str, filename: str) -> str:
    """Pull the resume PDF to a temp file. The form-filler needs a local path
    for Playwright's set_input_files."""
    suffix = os.path.splitext(filename)[1] or ".pdf"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    fd, path = tempfile.mkstemp(suffix=suffix, prefix="autoapply_resume_")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(resp.content)
        return path
    except Exception:
        try:
            os.unlink(path)
        except Exception:
            pass
        raise


def _upload_screenshot_to_storage(
    uid: str, auto_apply_id: str, b64: str
) -> Optional[str]:
    """Upload a base64-encoded PNG screenshot to Firebase Cloud Storage and
    return a URL. Returns None on any failure so the caller can fall back
    to dropping the screenshot.

    Used when the screenshot is too large for Firestore's per-property 1MB
    cap. Tries `make_public()` first (matches resume.py upload pattern); if
    that raises — typically a missing `roles/storage.legacyObjectReader`
    grant on the Render service account — falls back to a 7-day signed URL,
    which doesn't require legacy ACL permissions. Without this fallback,
    every long-form failure shipped with zero visual evidence."""
    try:
        import base64 as _base64
        from firebase_admin import storage

        png_bytes = _base64.b64decode(b64)
        bucket = storage.bucket()
        blob = bucket.blob(
            f"auto_apply_screenshots/{uid}/{auto_apply_id}.png"
        )
        blob.upload_from_string(png_bytes, content_type="image/png")
    except Exception as exc:
        logger.warning(
            "auto_apply screenshot Cloud Storage upload failed for %s/%s: %r",
            uid, auto_apply_id, exc,
        )
        return None

    try:
        blob.make_public()
        return blob.public_url
    except Exception as exc:
        logger.info(
            "auto_apply screenshot make_public failed for %s/%s (%r); "
            "falling back to signed URL",
            uid, auto_apply_id, exc,
        )

    try:
        return blob.generate_signed_url(
            expiration=timedelta(days=7),
            method="GET",
            version="v4",
        )
    except Exception as exc:
        logger.warning(
            "auto_apply screenshot signed URL fallback failed for %s/%s: %r",
            uid, auto_apply_id, exc,
        )
        return None
