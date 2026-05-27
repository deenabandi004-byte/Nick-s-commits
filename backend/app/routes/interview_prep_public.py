"""Public, anonymous interview-prep routes (lead magnet).

Mounted at /api/tools/interview-prep. No auth, no credits, no user-doc
writes. Status is persisted to a top-level Firestore collection
(interview_preps_public) so it survives worker restarts and works
across multiple gunicorn workers - the in-process dict approach was
losing state every time Flask's reloader fired.

The existing authenticated /api/interview-prep flow is completely
untouched.

Endpoints:
    POST /api/tools/interview-prep/generate         -> { prep_id }
        Accepts JSON {job_input} OR multipart form-data with
        {job_input, email, source}. The form path also captures the
        email to lead_magnet_emails (tool="interview-prep"). The JSON
        path (used by the standalone /tools/interview-prep page) keeps
        working unchanged.
    GET  /api/tools/interview-prep/status/<prep_id> -> status dict
    GET  /api/tools/interview-prep/download/<prep_id> -> redirect to PDF
"""
from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any

from firebase_admin import firestore, storage
from flask import Blueprint, jsonify, redirect, request

from app.extensions import get_db
from app.services.interview_prep.reddit_scraper import search_reddit
from app.services.interview_prep_public.content_processor import process as process_content
from app.services.interview_prep_public.job_extractor import extract as extract_job
from app.services.interview_prep_public.pdf_generator import (
    generate_public_interview_prep_pdf,
)
from app.services.interview_prep_public.research import gather_research

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

logger = logging.getLogger(__name__)

interview_prep_public_bp = Blueprint(
    "interview_prep_public",
    __name__,
    url_prefix="/api/tools/interview-prep",
)


# ── Firestore status store ───────────────────────────────────────────
# Top-level collection, anonymous-keyed by prep_id. Survives worker
# restarts (Flask reloader, gunicorn rolling) and works across workers.

_COLLECTION = "interview_preps_public"


def _doc(prep_id: str):
    return get_db().collection(_COLLECTION).document(prep_id)


def _new_status() -> dict[str, Any]:
    return {
        "status": "queued",
        "progress": "Queued...",
        "progressPercent": 0,
        "currentStep": 0,
        "totalSteps": 5,
        "error": None,
        "pdf_url": None,
        "pdf_storage_path": None,
        "jobDetails": None,
        "created_at": firestore.SERVER_TIMESTAMP,
    }


def _create_status(prep_id: str) -> None:
    _doc(prep_id).set(_new_status())


def _update_status(prep_id: str, **fields) -> None:
    try:
        _doc(prep_id).update(fields)
    except Exception:
        logger.warning("Failed to update public prep %s", prep_id, exc_info=True)


def _get_status(prep_id: str) -> dict[str, Any] | None:
    snap = _doc(prep_id).get()
    if not snap.exists:
        return None
    return snap.to_dict()


# ── Lead capture ─────────────────────────────────────────────────────


def _capture_lead(
    *,
    email: str,
    source: str | None,
    prep_id: str,
    job_title: str | None = None,
    company: str | None = None,
) -> str | None:
    """Best-effort write to Firestore `lead_magnet_emails`. Never blocks
    the response. Returns the new doc id (or None on failure) so the
    background thread can patch in job_title/company once extracted.
    """
    db = get_db()
    if not db:
        return None
    try:
        ref = db.collection("lead_magnet_emails").add({
            "email": email.lower().strip(),
            "tool": "interview-prep",
            "source": (source or "unknown").strip()[:120],
            "prep_id": prep_id,
            "job_title": job_title,
            "company": company,
            "created_at": firestore.SERVER_TIMESTAMP,
            "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
            "user_agent": request.headers.get("User-Agent"),
            "referer": request.headers.get("Referer"),
        })
        # add() returns (timestamp, doc_ref) on newer SDKs
        doc_ref = ref[1] if isinstance(ref, tuple) else ref
        return getattr(doc_ref, "id", None)
    except Exception as exc:
        logger.warning("Lead capture failed: %s", exc)
        return None


def _enrich_lead(lead_doc_id: str | None, *, job_title: str | None, company: str | None) -> None:
    """Patch the lead doc with extracted job_title / company once we have
    them. Best-effort, never raises."""
    if not lead_doc_id:
        return
    db = get_db()
    if not db:
        return
    try:
        db.collection("lead_magnet_emails").document(lead_doc_id).update({
            "job_title": job_title,
            "company": company,
        })
    except Exception as exc:
        logger.warning("Lead enrichment failed for %s: %s", lead_doc_id, exc)


# ── PDF upload ───────────────────────────────────────────────────────


def _upload_pdf(prep_id: str, pdf_bytes: bytes) -> dict:
    """Upload to Firebase Storage at interview_preps_public/<prep_id>.pdf.

    Returns {pdf_url, pdf_storage_path}. Falls back to a 24-hour signed
    URL if make_public fails (common with uniform bucket-level access).
    """
    bucket = storage.bucket()
    blob_path = f"interview_preps_public/{prep_id}.pdf"
    blob = bucket.blob(blob_path)
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    try:
        blob.make_public()
        pdf_url = blob.public_url
    except Exception as exc:
        logger.info("make_public failed for %s, falling back to signed URL: %s", blob_path, exc)
        pdf_url = blob.generate_signed_url(expiration=timedelta(hours=24))
    return {"pdf_url": pdf_url, "pdf_storage_path": blob_path}


# ── Background worker ────────────────────────────────────────────────


def _run_reddit_sync(job_details: dict, timeout: int = 35) -> list[dict]:
    """search_reddit is async - wrap it for sync callers."""
    try:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(search_reddit(job_details, timeout_seconds=timeout))
        finally:
            loop.close()
    except Exception:
        logger.warning("Public reddit fetch failed", exc_info=True)
        return []


def _process_background(prep_id: str, job_input: str, lead_doc_id: str | None = None) -> None:
    start_total = time.time()
    try:
        # Step 1: extract job posting
        _update_status(
            prep_id,
            status="parsing_job",
            progress="Reading the job posting...",
            progressPercent=10,
            currentStep=1,
        )
        job_details = extract_job(job_input)
        if not job_details or not job_details.get("company_name") or not job_details.get("job_title"):
            _update_status(
                prep_id,
                status="failed",
                error=(
                    "Could not extract the company and role from that input. "
                    "Paste a job posting URL from LinkedIn, Greenhouse, Lever, "
                    "or the company's career page, or paste the full job posting text."
                ),
            )
            return

        company = job_details["company_name"]
        title = job_details["job_title"]
        logger.info("Public prep %s: extracted %s @ %s", prep_id, title, company)
        _update_status(prep_id, jobDetails=job_details)
        _enrich_lead(lead_doc_id, job_title=title, company=company)

        # Step 2: parallel research (Perplexity) + Reddit
        _update_status(
            prep_id,
            status="researching",
            progress=f"Researching {company} interviews...",
            progressPercent=30,
            currentStep=2,
        )
        with ThreadPoolExecutor(max_workers=2) as ex:
            f_research = ex.submit(gather_research, company, title)
            f_reddit = ex.submit(_run_reddit_sync, job_details, 35)
            try:
                research = f_research.result(timeout=60)
            except Exception:
                logger.warning("Public prep %s: research gather failed", prep_id, exc_info=True)
                research = {"interview_process": {"content": "", "citations": []}, "company_news": []}
            try:
                reddit_posts = f_reddit.result(timeout=60)
            except Exception:
                logger.warning("Public prep %s: reddit gather failed", prep_id, exc_info=True)
                reddit_posts = []

        _update_status(
            prep_id,
            progress=f"Found {len(reddit_posts)} Reddit threads. Analyzing...",
            progressPercent=55,
            currentStep=3,
        )

        # Step 3: aggregate into structured insights
        insights = process_content(job_details, research, reddit_posts)

        _update_status(
            prep_id,
            progress="Building your PDF...",
            progressPercent=80,
            currentStep=4,
        )

        # Step 4: PDF
        pdf_buf = generate_public_interview_prep_pdf(
            prep_id=prep_id,
            job_details=job_details,
            insights=insights,
        )
        pdf_bytes = pdf_buf.getvalue()

        # Step 5: upload + done
        upload = _upload_pdf(prep_id, pdf_bytes)
        elapsed = time.time() - start_total
        logger.info("Public prep %s: completed in %.1fs", prep_id, elapsed)
        _update_status(
            prep_id,
            status="completed",
            progress="Ready to download.",
            progressPercent=100,
            currentStep=5,
            pdf_url=upload["pdf_url"],
            pdf_storage_path=upload["pdf_storage_path"],
        )
    except Exception as exc:
        logger.exception("Public prep %s: background failure", prep_id)
        _update_status(prep_id, status="failed", error=str(exc) or "Unexpected error.")


# ── Routes ───────────────────────────────────────────────────────────


def _read_field(name: str) -> str:
    """Read a field from either a JSON body or multipart form. The widget
    sends multipart (with email + source); the standalone page sends JSON
    (without email). Both paths must keep working."""
    payload = request.get_json(silent=True) or {}
    value = payload.get(name)
    if value is None:
        value = request.form.get(name)
    return (value or "").strip() if isinstance(value, str) else ""


@interview_prep_public_bp.route("/generate", methods=["POST"])
def generate():
    job_input = _read_field("job_input")
    if not job_input:
        return jsonify({"error": "job_input is required"}), 400
    if len(job_input) > 50_000:
        return jsonify({"error": "job_input is too long"}), 400

    email = _read_field("email")
    source = _read_field("source") or None

    # Email is optional. If provided, it must be valid (we surface a
    # clear 400 rather than silently dropping the lead capture).
    if email and not EMAIL_RE.match(email):
        return jsonify({"error": "valid email required"}), 400

    prep_id = uuid.uuid4().hex
    _create_status(prep_id)
    # Stamp the source onto the status doc for traceability.
    if source:
        _update_status(prep_id, source=source)

    # Best-effort lead capture BEFORE the background thread starts, so
    # we don't lose the lead if extraction fails. The background thread
    # patches in job_title/company once known.
    lead_doc_id: str | None = None
    if email:
        lead_doc_id = _capture_lead(
            email=email,
            source=source,
            prep_id=prep_id,
        )

    thread = threading.Thread(
        target=_process_background,
        args=(prep_id, job_input, lead_doc_id),
        daemon=True,
        name=f"public-interview-prep-{prep_id[:8]}",
    )
    thread.start()

    return jsonify({"prep_id": prep_id, "status": "queued"})


def _json_safe(value):
    if hasattr(value, "isoformat"):  # datetime or Firestore Timestamp
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    return value


@interview_prep_public_bp.route("/status/<prep_id>", methods=["GET"])
def status(prep_id: str):
    entry = _get_status(prep_id)
    if entry is None:
        return jsonify({"error": "not_found"}), 404
    entry = {k: _json_safe(v) for k, v in entry.items()}
    return jsonify(entry)


@interview_prep_public_bp.route("/download/<prep_id>", methods=["GET"])
def download(prep_id: str):
    entry = _get_status(prep_id)
    if entry is None:
        return jsonify({"error": "not_found"}), 404
    if entry.get("status") != "completed" or not entry.get("pdf_url"):
        return jsonify({"error": "not_ready", "status": entry.get("status")}), 409
    return redirect(entry["pdf_url"], code=302)
