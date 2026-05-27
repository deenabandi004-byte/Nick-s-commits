"""Public, anonymous resume-review routes (lead magnet).

Mounted at /api/tools/resume-review. No auth, no credits, no Firestore
writes against user docs. Captures lead email to lead_magnet_emails.

Endpoints:
    POST /api/tools/resume-review/analyze
        multipart form:
            resume_pdf: file (PDF, <=10MB)
            job_input:  str (URL, role name, or pasted JD text)
            email:      str
        returns:
            score, score_label, score_breakdown,
            matched_keywords, missing_keywords, suggestions,
            replacements: [{id, original, optimized}],
            resume_text, job_title, company, job_source

    POST /api/tools/resume-review/rebuild
        multipart form:
            resume_pdf: file (the same PDF the user uploaded)
            patches:    JSON string of [{original_text, replacement_text, type}]
        returns:
            { pdf_base64, applied_count, skipped_count }
"""
from __future__ import annotations

import base64
import json
import logging
import re

from firebase_admin import firestore
from flask import Blueprint, jsonify, request

from app.extensions import get_db
from app.services.ats_scorer import calculate_ats_score
from app.services.firecrawl_client import extract_job_posting, scrape_url
from app.services.interview_prep.resume_parser import extract_text_from_pdf_bytes
from app.services.openai_client import get_openai_client
from app.services.pdf_patcher import patch_pdf
from app.services.perplexity_client import quick_search
from app.services.resume_recommender import generate_substantive_recommendations

logger = logging.getLogger(__name__)

resume_workshop_public_bp = Blueprint(
    "resume_workshop_public",
    __name__,
    url_prefix="/api/tools/resume-review",
)

URL_RE = re.compile(r"^https?://", re.IGNORECASE)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_PDF_BYTES = 10 * 1024 * 1024
SHORT_INPUT_THRESHOLD = 200


# ── Job-description resolution ────────────────────────────────────────

def _scrape_jd_from_url(url: str) -> dict:
    """Scrape a job URL with Firecrawl.

    Returns dict: { job_description, job_title, company }. Combines raw markdown
    (for ATS keyword matching) with structured extraction (for display labels).
    """
    # Raw markdown gives us the most signal for keyword scoring.
    raw = scrape_url(url, "general") or {}
    markdown = (raw.get("markdown") or "").strip()

    # Structured extraction gives us clean title/company + a fallback JD.
    structured = extract_job_posting(url) or {}

    jd = markdown
    if not jd or len(jd) < 200:
        # Synthesize a JD from the structured fields if markdown is thin.
        parts = []
        if structured.get("title"):
            parts.append(f"Job Title: {structured['title']}")
        if structured.get("company"):
            parts.append(f"Company: {structured['company']}")
        if structured.get("location"):
            parts.append(f"Location: {structured['location']}")
        if structured.get("responsibilities"):
            parts.append("Responsibilities:\n- " + "\n- ".join(structured["responsibilities"]))
        if structured.get("requirements"):
            parts.append("Requirements:\n- " + "\n- ".join(structured["requirements"]))
        if structured.get("nice_to_have"):
            parts.append("Nice to have:\n- " + "\n- ".join(structured["nice_to_have"]))
        synthesized = "\n\n".join(parts).strip()
        # Prefer whichever is longer / non-empty.
        if synthesized and (not jd or len(synthesized) > len(jd)):
            jd = synthesized

    return {
        "job_description": jd,
        "job_title": structured.get("title") or None,
        "company": structured.get("company") or None,
    }


def _resolve_job(job_input: str) -> dict:
    """Resolve job_input to job description text + optional title/company.

    URL          -> Firecrawl (markdown + structured)
    Short text   -> Perplexity for a URL -> Firecrawl
    Long text    -> use as the description directly
    """
    job_input = (job_input or "").strip()
    if not job_input:
        return {"job_description": "", "job_title": None, "company": None, "source": "none"}

    if URL_RE.match(job_input):
        try:
            scraped = _scrape_jd_from_url(job_input)
            return {
                **scraped,
                "source": "firecrawl",
                "resolved_url": job_input,
            }
        except Exception as exc:
            logger.warning("Firecrawl failed for %s: %s", job_input, exc)
            return {"job_description": "", "job_title": None, "company": None, "source": "firecrawl_failed"}

    if len(job_input) < SHORT_INPUT_THRESHOLD:
        # Short input: probably "SWE at Google". Find a URL via Perplexity, then scrape.
        try:
            search_result = quick_search(
                f"Find a real, currently-posted job listing URL for: {job_input}. "
                "Prefer Greenhouse, Lever, Workday, or the company's careers page. "
                "Return ONLY the URL."
            ) or {}
            citations = search_result.get("citations") or []
            url = next((c for c in citations if URL_RE.match(c)), None)
            if not url:
                answer = (search_result.get("answer") or "").strip()
                url_match = re.search(r"https?://\S+", answer)
                if url_match:
                    url = url_match.group(0).rstrip(".,);]")
            if url:
                try:
                    scraped = _scrape_jd_from_url(url)
                    return {
                        "job_description": scraped["job_description"],
                        "job_title": scraped["job_title"] or job_input,
                        "company": scraped["company"],
                        "source": "perplexity+firecrawl",
                        "resolved_url": url,
                    }
                except Exception as exc:
                    logger.warning("Firecrawl scrape of %s failed: %s", url, exc)
        except Exception as exc:
            logger.warning("Perplexity search failed for %s: %s", job_input, exc)
        return {
            "job_description": job_input,
            "job_title": job_input,
            "company": None,
            "source": "name_fallback",
        }

    # Long text -> assume the user pasted a JD.
    return {"job_description": job_input, "job_title": None, "company": None, "source": "pasted"}


# ── Lead capture ──────────────────────────────────────────────────────

def _capture_lead(email: str, resume_hash: str, job_meta: dict, source: str | None) -> None:
    """Best-effort write to Firestore. Never blocks the response.

    `source` identifies the page/surface that embedded the widget so we can
    attribute conversions by SEO page (e.g. "standalone-tools", "sandbox",
    "goldman-cover-letter").
    """
    db = get_db()
    if not db:
        return
    try:
        db.collection("lead_magnet_emails").add({
            "email": email.lower().strip(),
            "tool": "resume-review",
            "source": (source or "unknown").strip()[:120],
            "resume_hash": resume_hash,
            "job_input_source": job_meta.get("source"),
            "job_title": job_meta.get("job_title"),
            "company": job_meta.get("company"),
            "resolved_url": job_meta.get("resolved_url"),
            "created_at": firestore.SERVER_TIMESTAMP,
            "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
            "user_agent": request.headers.get("User-Agent"),
            "referer": request.headers.get("Referer"),
        })
    except Exception as exc:
        logger.warning("Lead capture failed: %s", exc)


# ── Routes ────────────────────────────────────────────────────────────

@resume_workshop_public_bp.route("/analyze", methods=["POST"])
def analyze():
    if "resume_pdf" not in request.files:
        return jsonify({"error": "resume_pdf file required"}), 400

    pdf_file = request.files["resume_pdf"]
    if not pdf_file or not pdf_file.filename:
        return jsonify({"error": "resume_pdf file is empty"}), 400

    pdf_bytes = pdf_file.read()
    if not pdf_bytes:
        return jsonify({"error": "PDF is empty"}), 400
    if len(pdf_bytes) > MAX_PDF_BYTES:
        return jsonify({"error": f"PDF exceeds {MAX_PDF_BYTES // (1024 * 1024)}MB limit"}), 400

    job_input = (request.form.get("job_input") or "").strip()
    if not job_input:
        return jsonify({"error": "job_input required (URL, role name, or pasted JD)"}), 400

    email = (request.form.get("email") or "").strip()
    if not email or not EMAIL_RE.match(email):
        return jsonify({"error": "valid email required"}), 400

    source = (request.form.get("source") or "").strip() or None

    # 1. Resume text
    try:
        resume_text = extract_text_from_pdf_bytes(pdf_bytes)
    except Exception as exc:
        logger.error("PDF parse failed: %s", exc)
        return jsonify({
            "error": "Could not read PDF. Make sure it is a text-based PDF, not a scanned image."
        }), 400

    if not resume_text or len(resume_text.strip()) < 100:
        return jsonify({
            "error": "Resume PDF has too little text. Make sure it isn't a scanned image."
        }), 400

    import hashlib
    resume_hash = hashlib.sha256(pdf_bytes).hexdigest()[:16]

    # 2. Job description
    job_meta = _resolve_job(job_input)
    job_description = job_meta.get("job_description", "")
    if not job_description or len(job_description.strip()) < 100:
        return jsonify({
            "error": "Could not get enough job description content. Paste the full job description directly, or try a different URL.",
            "job_source": job_meta.get("source"),
        }), 400

    # 3. Lead capture (fire and forget, never blocks)
    _capture_lead(email, resume_hash, job_meta, source)

    # 4. Score
    score_result = calculate_ats_score(resume_text, job_description)
    overall = score_result.get("overall", 0)
    label = "Strong" if overall >= 80 else "Good" if overall >= 60 else "Needs work"

    # 5. Substantive recommendations (full bullet rewrites, missing skills, etc).
    try:
        openai_client = get_openai_client()
        recommendations = generate_substantive_recommendations(
            resume_text=resume_text,
            job_description=job_description,
            openai_client=openai_client,
            job_title=job_meta.get("job_title") or "",
            company=job_meta.get("company") or "",
        )
    except Exception as exc:
        logger.error("Recommender failed: %s", exc)
        recommendations = []

    return jsonify({
        "score": overall,
        "score_label": label,
        "score_breakdown": {
            "keywords": score_result.get("keywords"),
            "formatting": score_result.get("formatting"),
            "relevance": score_result.get("relevance"),
        },
        "matched_keywords": score_result.get("details", {}).get("matched_keywords", []),
        "missing_keywords": score_result.get("details", {}).get("missing_keywords", []),
        "suggestions": score_result.get("details", {}).get("suggestions", []),
        "recommendations": recommendations,
        "resume_text": resume_text,
        "job_title": job_meta.get("job_title"),
        "company": job_meta.get("company"),
        "job_source": job_meta.get("source"),
    })


@resume_workshop_public_bp.route("/rebuild", methods=["POST"])
def rebuild():
    """Patch the user's original PDF with the accepted replacements.

    The client re-uploads the original PDF so the server holds no state.
    """
    if "resume_pdf" not in request.files:
        return jsonify({"error": "resume_pdf file required"}), 400

    pdf_file = request.files["resume_pdf"]
    pdf_bytes = pdf_file.read() if pdf_file else b""
    if not pdf_bytes:
        return jsonify({"error": "resume_pdf file is empty"}), 400
    if len(pdf_bytes) > MAX_PDF_BYTES:
        return jsonify({"error": f"PDF exceeds {MAX_PDF_BYTES // (1024 * 1024)}MB limit"}), 400

    raw_patches = request.form.get("patches")
    if not raw_patches:
        return jsonify({"error": "patches JSON required"}), 400
    try:
        parsed = json.loads(raw_patches)
    except json.JSONDecodeError:
        return jsonify({"error": "patches must be valid JSON"}), 400
    if not isinstance(parsed, list) or not parsed:
        return jsonify({"error": "patches must be a non-empty list"}), 400

    patch_list = []
    for i, p in enumerate(parsed):
        if not isinstance(p, dict):
            return jsonify({"error": f"patch {i} must be an object"}), 400
        original = p.get("original_text") or p.get("original")
        replacement = p.get("replacement_text") or p.get("optimized")
        if not original or not replacement:
            return jsonify({"error": f"patch {i} needs original_text and replacement_text"}), 400
        patch_list.append({
            "type": p.get("type", "bullet_rewrite"),
            "original_text": original,
            "replacement_text": replacement,
        })

    try:
        result = patch_pdf(pdf_bytes, patch_list) or {}
    except Exception as exc:
        logger.error("PDF patch failed: %s", exc)
        return jsonify({"error": "PDF patch failed"}), 500

    patched_bytes = result.get("patched_pdf_bytes")
    if not patched_bytes:
        return jsonify({"error": "PDF patch produced no output"}), 500

    return jsonify({
        "pdf_base64": base64.b64encode(patched_bytes).decode("utf-8"),
        "applied_count": len([p for p in result.get("patch_log", []) if p.get("applied")]),
        "skipped_count": len([p for p in result.get("patch_log", []) if not p.get("applied")]),
    })


@resume_workshop_public_bp.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})
