"""Public, anonymous cover-letter generation (lead magnet).

Mounted at /api/tools/cover-letter. No auth, no credits, no Firestore
user lookup, no library save. The resume is uploaded as multipart form
data, the job is resolved fresh (Firecrawl when given a URL, otherwise
treated as a pasted JD), and the generated PDF is returned base64-encoded
in the response body.

The widget at connect-grow-hire/src/components/widgets/CoverLetterWidget.tsx
submits `job_input` (URL or pasted JD or "Role at Company"). The legacy
standalone page at /tools/cover-letter still submits `job_url`, which is
accepted as a fallback so the existing page keeps working without changes.

Endpoints:
    POST /api/tools/cover-letter/capture-email   - email capture only
    POST /api/tools/cover-letter/generate        - resume + job -> PDF
    GET  /api/tools/cover-letter/health          - liveness check
"""
from __future__ import annotations

import base64
import hashlib
import logging
import re
import time
import uuid

from flask import Blueprint, jsonify, request

try:
    from firebase_admin import firestore as fb_firestore
    _SERVER_TIMESTAMP = fb_firestore.SERVER_TIMESTAMP
except Exception:
    _SERVER_TIMESTAMP = None

from app.extensions import get_db
from app.services.cover_letter_public.company_research import research_company
from app.services.cover_letter_public.job_extractor import extract_job
from app.services.cover_letter_public.letter_writer import generate_letter
from app.services.cover_letter_public.resume_reader import read_resume
from app.services.pdf_builder import generate_cover_letter_pdf

logger = logging.getLogger(__name__)

cover_letter_public_bp = Blueprint(
    "cover_letter_public",
    __name__,
    url_prefix="/api/tools/cover-letter",
)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LEADS_COLLECTION = "lead_magnet_emails"  # unified with resume-review widget
ALLOWED_TONES = {"professional", "conversational", "enthusiastic"}


def _is_valid_email(email: str) -> bool:
    if not email or len(email) > 254:
        return False
    return bool(EMAIL_RE.match(email))


def _normalize_tone(raw: str | None) -> str:
    """Map free-text tone input to one of the allowed values."""
    t = (raw or "").strip().lower()
    if t in ALLOWED_TONES:
        return t
    return "professional"


def _resolve_job(job_input: str) -> dict:
    """Turn the widget's `job_input` field into the structured `job` dict
    that letter_writer expects.

    Heuristics, in order:
      1. Looks like a URL (http://, https://) -> Firecrawl scrape.
      2. Long pasted text (>=120 chars) -> treat as the JD verbatim.
      3. Short text (e.g. "Software Engineer at Stripe") -> use as title
         hint; no scraping, no description body.
    """
    raw = (job_input or "").strip()
    if not raw:
        return {"title": "", "company": "", "location": "", "description": "", "raw_markdown": ""}

    lower = raw.lower()
    if lower.startswith(("http://", "https://")):
        try:
            return extract_job(raw)
        except Exception:
            logger.exception("Firecrawl extract failed in _resolve_job")
            return {"title": "", "company": "", "location": "", "description": "", "raw_markdown": ""}

    if len(raw) >= 120:
        # Pasted JD body
        return {
            "title": "",
            "company": "",
            "location": "",
            "description": raw[:8000],
            "raw_markdown": "",
        }

    # Short string like "Software Engineer at Stripe" or just a role name.
    title = raw
    company = ""
    m = re.search(r"\s+at\s+(.+)$", raw, re.IGNORECASE)
    if m:
        company = m.group(1).strip()
        title = raw[: m.start()].strip()
    return {
        "title": title,
        "company": company,
        "location": "",
        "description": "",
        "raw_markdown": "",
    }


def _log_lead(
    *,
    email: str,
    source: str,
    tone: str,
    name: str = "",
    resume_hash: str = "",
    job_meta: dict | None = None,
    extra: dict | None = None,
) -> None:
    """Best-effort write to Firestore. Never blocks the response.

    Writes to `lead_magnet_emails` with `tool='cover-letter'` to match the
    schema used by the resume-review widget. `source` identifies the page
    that embedded the widget so we can attribute conversions per SEO page.
    """
    db = get_db()
    if db is None:
        return
    try:
        doc = {
            "email": email.strip().lower(),
            "name": name.strip(),
            "tool": "cover-letter",
            "source": (source or "unknown").strip()[:120],
            "tone": tone,
            "resume_hash": resume_hash,
            "created_at": _SERVER_TIMESTAMP,
            "ip": (request.headers.get("X-Forwarded-For", request.remote_addr or "") or "").split(",")[0].strip(),
            "user_agent": (request.headers.get("User-Agent", "") or "")[:300],
            "referer": (request.headers.get("Referer", "") or "")[:300],
        }
        if job_meta:
            doc.update({
                "job_title": (job_meta.get("title") or "")[:200],
                "company": (job_meta.get("company") or "")[:200],
                "job_input_source": job_meta.get("input_source", ""),
            })
        if extra:
            doc.update(extra)
        db.collection(LEADS_COLLECTION).add(doc)
    except Exception:
        logger.warning("Failed to write cover-letter lead to Firestore", exc_info=True)


# ── Routes ───────────────────────────────────────────────────────────


@cover_letter_public_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "cover_letter_public"})


@cover_letter_public_bp.route("/capture-email", methods=["POST"])
def capture_email():
    """Capture the lead's email at the start of the flow (legacy endpoint
    used by the standalone /tools/cover-letter page's email-gate step).

    The widget at /sandbox/resume-widget does NOT hit this endpoint; it
    captures the email together with the generate request.
    """
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip()
    name = (payload.get("name") or "").strip()
    source = (payload.get("source") or "standalone-tools-email-gate").strip()
    if not _is_valid_email(email):
        return jsonify({"error": "invalid_email", "message": "Please enter a valid email address."}), 400

    _log_lead(email=email, name=name, source=source, tone="professional")
    return jsonify({"ok": True})


@cover_letter_public_bp.route("/generate", methods=["POST"])
def generate():
    """Generate a cover letter from an uploaded resume + a job input.

    Multipart form-data fields:
        resume      file (PDF or DOCX, max 10 MB) - required
        email       string - required (used for lead capture, not auth)
        job_input   string - preferred; URL, pasted JD, or "Role at Company"
        job_url     string - legacy fallback (used by standalone page)
        name        string - optional, signs the letter if provided
        source      string - optional, identifies the embedding surface
        tone        string - optional; professional|conversational|enthusiastic

    Response (200):
        {
          "cover_letter_text": "...",
          "pdf_base64": "...",
          "job": {"title": "...", "company": "...", "location": "..."},
          "request_id": "..."
        }
    """
    request_id = uuid.uuid4().hex[:12]
    started = time.time()

    # ── 1. Validate inputs ──────────────────────────────────────────
    email = (request.form.get("email") or "").strip()
    name = (request.form.get("name") or "").strip()
    source = (request.form.get("source") or "").strip() or "unknown"
    tone = _normalize_tone(request.form.get("tone"))

    job_input = (request.form.get("job_input") or "").strip()
    if not job_input:
        # Legacy fallback for the standalone /tools/cover-letter page,
        # which sends `job_url` and never sends `job_input`.
        job_input = (request.form.get("job_url") or "").strip()

    if not _is_valid_email(email):
        return jsonify({"error": "invalid_email", "message": "A valid email is required."}), 400
    if not job_input:
        return jsonify({
            "error": "invalid_job_input",
            "message": "Please paste a job URL, role name, or the full job description.",
        }), 400

    if "resume" not in request.files:
        return jsonify({"error": "missing_resume", "message": "Please upload your resume."}), 400
    file = request.files["resume"]
    if not file or not file.filename:
        return jsonify({"error": "missing_resume", "message": "Please upload your resume."}), 400

    # ── 2. Read the resume ──────────────────────────────────────────
    try:
        resume = read_resume(file, file.filename)
    except ValueError as e:
        return jsonify({"error": "resume_read_failed", "message": str(e)}), 400
    except Exception:
        logger.exception("[%s] Unexpected resume read failure", request_id)
        return jsonify({"error": "resume_read_failed", "message": "We couldn't read that resume. Try a different file."}), 400

    applicant_name = name or resume["name"]
    resume_hash = hashlib.sha256(resume["text"].encode("utf-8", errors="ignore")).hexdigest()[:16]
    logger.info("[%s] resume ok: %d chars, name=%r", request_id, len(resume["text"]), applicant_name)

    # ── 3. Resolve the job posting ──────────────────────────────────
    job = _resolve_job(job_input)

    if not job.get("description") and not job.get("raw_markdown") and not job.get("title"):
        return jsonify({
            "error": "job_scrape_failed",
            "message": (
                "We couldn't make sense of that job input. Try a direct job posting URL "
                "from Greenhouse, Lever, or the company's career page, or paste the full "
                "job description as text."
            ),
        }), 422
    logger.info(
        "[%s] job: title=%r company=%r desc=%d md=%d",
        request_id, job.get("title"), job.get("company"),
        len(job.get("description", "")), len(job.get("raw_markdown", "")),
    )

    # ── 4. Quick company research (best effort) ─────────────────────
    research = research_company(job.get("company", ""), job.get("title", ""))
    logger.info(
        "[%s] research: %d chars, %d citations",
        request_id, len(research.get("content", "")), len(research.get("citations", [])),
    )

    # ── 5. Generate the letter ──────────────────────────────────────
    try:
        cover_letter_text = generate_letter(
            applicant_name=applicant_name,
            resume_text=resume["text"],
            job=job,
            company_research=research,
            tone=tone,
        )
    except RuntimeError as e:
        logger.error("[%s] LLM unavailable: %s", request_id, e)
        return jsonify({"error": "llm_unavailable", "message": "Our writing engine is briefly unavailable. Try again in a minute."}), 503
    except Exception:
        logger.exception("[%s] Letter generation failed", request_id)
        return jsonify({"error": "generation_failed", "message": "Something went wrong generating the letter. Try again."}), 500

    # ── 6. Build the PDF ────────────────────────────────────────────
    try:
        pdf_buffer = generate_cover_letter_pdf(cover_letter_text)
        pdf_bytes = pdf_buffer.read() if hasattr(pdf_buffer, "read") else bytes(pdf_buffer)
        if not pdf_bytes:
            raise ValueError("Empty PDF buffer")
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
    except Exception:
        logger.exception("[%s] PDF build failed", request_id)
        pdf_base64 = ""

    # ── 7. Lead capture (best effort, after success) ────────────────
    _log_lead(
        email=email,
        name=applicant_name,
        source=source,
        tone=tone,
        resume_hash=resume_hash,
        job_meta=job,
        extra={"request_id": request_id},
    )

    elapsed = time.time() - started
    logger.info("[%s] cover letter completed in %.1fs", request_id, elapsed)

    return jsonify({
        "cover_letter_text": cover_letter_text,
        "pdf_base64": pdf_base64,
        "job": {
            "title": job.get("title", ""),
            "company": job.get("company", ""),
            "location": job.get("location", ""),
        },
        "request_id": request_id,
    })
