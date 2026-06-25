"""Alumni discovery routes for the job board.

Two endpoints:
  - POST /api/job-board/discover-alumni
  - POST /api/job-board/referral-draft/from-discovery
  - GET  /api/job-board/discovery-negative-cache (batch read, mount-time)

Lives in its own blueprint (not `job_board.py`) because `job_board.py` is
already 9,300+ lines and called out in `CLAUDE.md` for splitting. Both new
endpoints share `/api/job-board` URL prefix so the SPA hits the same base.

The blueprint is registered in `wsgi.py` alongside `job_board_bp`.

Feature-flagged via `DISCOVER_ALUMNI_ENABLED`. When off, every route here
returns 404, letting the frontend hide the CTA without a redeploy.
"""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from app.extensions import require_firebase_auth, require_tier
from app.services import alumni_discovery as ad

logger = logging.getLogger(__name__)

alumni_discovery_bp = Blueprint(
    "alumni_discovery", __name__, url_prefix="/api/job-board"
)


def _flag_gated_404():
    """Return a Flask response indicating the feature isn't available.

    The 404 (not 403) is intentional: from a non-flagged client's
    perspective the endpoint does not exist, which lets the SPA hide the
    "Find alumni" CTA via the same flag without a separate capability
    API.
    """
    return jsonify({"error": "not_found"}), 404


# ---------------------------------------------------------------------------
# POST /api/job-board/discover-alumni
# ---------------------------------------------------------------------------

@alumni_discovery_bp.route("/discover-alumni", methods=["POST"])
@require_firebase_auth
@require_tier(["free", "pro", "elite"])
def discover_alumni_endpoint():
    """Discover alumni at a company for a referral draft.

    Request body:
        {
          "job_id": str (required),
          "company": str (required),
          "title": str (optional; falls back to user.careerTrack),
          "allow_drop_title": bool (optional, default False),
          "allow_no_school_fallback": bool (optional, default False)
        }

    Response (200):
        {
          "contacts": [{ pdl_id, first_name, last_name, title, company,
                         school, linkedin_url, email, email_available,
                         relationship, match_strength, match_reasons, ... }],
          "credits_used": int,
          "cache_hit": bool | "negative",
          "rung": "school+company+title" | "school+company" |
                  "no-alumni-fallback" | "empty",
          "tier_max": int,
          "partial": bool
        }

    Error responses:
        400 — { code: "no_school" | "no_title" | "no_company" | "no_job_id" }
        429 — daily rate limit hit (50/day)
        504 — { code: "pdl_timeout" }
    """
    if not ad.is_feature_enabled():
        return _flag_gated_404()

    uid = request.firebase_user.get("uid")
    tier = getattr(request, "user_tier", "free")
    data = request.get_json(force=True, silent=True) or {}

    # Daily rate cap — same backing storage as the existing job_board
    # _check_user_rate_limit helper so the per-user budget composes across
    # related endpoints.
    from app.routes.job_board import _check_user_rate_limit
    if not _check_user_rate_limit(uid, "discover-alumni-daily", "50 per day"):
        return jsonify({
            "error": "Daily limit reached",
            "message": "You've discovered alumni 50 times today. Try again tomorrow.",
        }), 429

    job = {
        "job_id": (data.get("job_id") or "").strip(),
        "company": (data.get("company") or "").strip(),
        "title": (data.get("title") or "").strip(),
    }
    allow_drop_title = bool(data.get("allow_drop_title"))
    allow_no_school_fallback = bool(data.get("allow_no_school_fallback"))

    try:
        result = ad.discover_alumni(
            uid,
            job,
            tier=tier,
            allow_drop_title=allow_drop_title,
            allow_no_school_fallback=allow_no_school_fallback,
        )
    except Exception as e:
        logger.exception("[DiscoverAlumni] uid=%s job=%s failed: %s", uid, job, e)
        return jsonify({"error": "internal_error"}), 500

    if not result.get("ok"):
        code = result.get("code", "unknown")
        if code == "pdl_timeout":
            return jsonify({"code": code}), 504
        if code in ("no_school", "no_title", "no_company", "no_job_id", "bad_request"):
            return jsonify({"code": code}), 400
        return jsonify({"code": code}), 500

    # Strip the internal `ok` flag from the success path so the wire shape
    # matches the contract in this module's docstring.
    payload = {k: v for k, v in result.items() if k != "ok"}
    return jsonify(payload), 200


# ---------------------------------------------------------------------------
# POST /api/job-board/referral-draft/from-discovery
# ---------------------------------------------------------------------------

@alumni_discovery_bp.route("/referral-draft/from-discovery", methods=["POST"])
@require_firebase_auth
@require_tier(["free", "pro", "elite"])
def referral_draft_from_discovery_endpoint():
    """Persist a discovered alum and generate a referral draft.

    Trust boundary: takes ONLY `pdl_id` from the client. The server
    re-reads the matching contact from `users/{uid}/discovery_cache/{job_id}`
    (written by `/discover-alumni`, 60-min TTL). This prevents the client
    from forging title/note fields to poison the LLM prompt or persist
    arbitrary data to the contacts collection.

    Request body:
        { "job_id": str, "pdl_id": str, "job": {company, title, ...} }

    Response (200): { ok: True, ...build_referral_draft response,
                      contact_id, was_new }

    Error responses:
        410 — { code: "discovery_expired" } cache miss or expired
        404 — { code: "pdl_id_not_in_cache" }
        429 — daily rate limit
    """
    if not ad.is_feature_enabled():
        return _flag_gated_404()

    uid = request.firebase_user.get("uid")
    user_email = request.firebase_user.get("email") or ""
    data = request.get_json(force=True, silent=True) or {}

    job_id = (data.get("job_id") or "").strip()
    pdl_id = (data.get("pdl_id") or "").strip()
    job = data.get("job") or {}

    if not job_id or not pdl_id:
        return jsonify({"code": "missing_required_fields"}), 400
    if not isinstance(job, dict) or not job.get("company"):
        return jsonify({"code": "no_company"}), 400

    # Rate cap parallels the existing /referral-draft endpoint (30/day).
    from app.routes.job_board import _check_user_rate_limit
    if not _check_user_rate_limit(uid, "referral-draft-from-discovery-daily", "30 per day"):
        return jsonify({
            "error": "Daily limit reached",
            "message": "You've drafted 30 referral emails from discovery today. Try again tomorrow.",
        }), 429

    # ---- Trust boundary: cache lookup -------------------------------
    cache_doc = ad.read_discovery_cache(uid, job_id)
    if not cache_doc:
        return jsonify({"code": "discovery_expired"}), 410

    pdl_contact = ad.find_cached_contact(cache_doc, pdl_id)
    if not pdl_contact:
        return jsonify({"code": "pdl_id_not_in_cache"}), 404

    # ---- Persist (txn dedup) ----------------------------------------
    try:
        contact_id, was_new = ad.persist_discovered_contact(
            uid,
            pdl_contact,
            job_id=job_id,
            company=cache_doc.get("company") or job.get("company"),
            matched_on=(cache_doc.get("rung") or "").split("+"),
        )
    except Exception as e:
        logger.exception("[DiscoveryDraft] persist failed uid=%s job=%s: %s", uid, job_id, e)
        return jsonify({"error": "internal_error"}), 500

    # ---- Generate referral draft (existing pipeline, unchanged) -----
    try:
        from app.services.referral_email import build_referral_draft
        draft_result = build_referral_draft(
            uid=uid,
            user_email=user_email,
            contact_id=contact_id,
            job=job,
            commit=False,
        )
    except Exception as e:
        logger.exception("[DiscoveryDraft] build_referral_draft failed: %s", e)
        return jsonify({"error": "internal_error"}), 500

    if not draft_result.get("ok"):
        err = draft_result.get("error", "unknown")
        status = 404 if err == "contact_not_found" else 500
        return jsonify({"error": err, "contact_id": contact_id}), status

    payload = {
        **draft_result,
        "contact_id": contact_id,
        "was_new": was_new,
    }
    return jsonify(payload), 200


# ---------------------------------------------------------------------------
# POST /api/job-board/referral-draft/from-find-recruiter
#
# Phase 6 (June 2026) — unifies "Find the Connection" with the saved-contact
# and alumni-discovery referral-draft workflows. Mirrors /from-discovery
# almost exactly; the only differences are the cache it reads from
# (`recruiter_cache` vs `discovery_cache`) and the contact `source` stamp.
#
# Crucially this endpoint is NOT behind DISCOVER_ALUMNI_ENABLED — Find the
# Connection has been GA for months and the rewire shouldn't gate it.
# ---------------------------------------------------------------------------

@alumni_discovery_bp.route(
    "/referral-draft/from-find-recruiter", methods=["POST"]
)
@require_firebase_auth
@require_tier(["free", "pro", "elite"])
def referral_draft_from_find_recruiter_endpoint():
    """Persist a find-recruiter result and generate a referral draft.

    Trust boundary: takes ONLY `search_id` + `recruiter_email`. The server
    re-reads the matching recruiter from `users/{uid}/recruiter_cache/{search_id}`
    (written by `/find-recruiter`, 60-min TTL). This prevents the client
    from forging title/note fields that would poison the LLM prompt or
    persist arbitrary data to the contacts collection.

    Request body:
        { "search_id": str,
          "recruiter_email": str,
          "job": {company, title, ...} }

    Response (200): { ok: True, ...build_referral_draft response,
                      contact_id, was_new }

    Error responses:
        410 — { code: "recruiter_cache_expired" } cache miss or expired
        404 — { code: "recruiter_email_not_in_cache" }
        429 — daily rate limit
    """
    uid = request.firebase_user.get("uid")
    user_email = request.firebase_user.get("email") or ""
    data = request.get_json(force=True, silent=True) or {}

    search_id = (data.get("search_id") or "").strip()
    recruiter_email = (data.get("recruiter_email") or "").strip()
    job = data.get("job") or {}

    if not search_id or not recruiter_email:
        return jsonify({"code": "missing_required_fields"}), 400
    if not isinstance(job, dict) or not job.get("company"):
        return jsonify({"code": "no_company"}), 400

    # Rate cap matches /from-discovery (30/day).
    from app.routes.job_board import _check_user_rate_limit
    if not _check_user_rate_limit(
        uid, "referral-draft-from-find-recruiter-daily", "30 per day"
    ):
        return jsonify({
            "error": "Daily limit reached",
            "message": "You've drafted 30 referral emails from Find the Connection today. Try again tomorrow.",
        }), 429

    # ---- Trust boundary: cache lookup -----------------------------------
    cache_doc = ad.read_recruiter_cache(uid, search_id)
    if not cache_doc:
        return jsonify({"code": "recruiter_cache_expired"}), 410

    pdl_recruiter = ad.find_cached_recruiter(cache_doc, recruiter_email)
    if not pdl_recruiter:
        return jsonify({"code": "recruiter_email_not_in_cache"}), 404

    # ---- Persist (txn dedup) --------------------------------------------
    try:
        contact_id, was_new = ad.persist_find_recruiter_contact(
            uid,
            pdl_recruiter,
            search_id=search_id,
            company=cache_doc.get("company") or job.get("company"),
            job_title=cache_doc.get("job_title") or job.get("title") or "",
        )
    except Exception as e:
        logger.exception(
            "[FindRecruiterDraft] persist failed uid=%s search_id=%s: %s",
            uid, search_id, e,
        )
        return jsonify({"error": "internal_error"}), 500

    # ---- Generate referral draft (same pipeline as saved + discovery) ---
    try:
        from app.services.referral_email import build_referral_draft
        draft_result = build_referral_draft(
            uid=uid,
            user_email=user_email,
            contact_id=contact_id,
            job=job,
            commit=False,
        )
    except Exception as e:
        logger.exception("[FindRecruiterDraft] build_referral_draft failed: %s", e)
        return jsonify({"error": "internal_error"}), 500

    if not draft_result.get("ok"):
        err = draft_result.get("error", "unknown")
        status = 404 if err == "contact_not_found" else 500
        return jsonify({"error": err, "contact_id": contact_id}), status

    return jsonify({
        **draft_result,
        "contact_id": contact_id,
        "was_new": was_new,
    }), 200


# ---------------------------------------------------------------------------
# GET /api/job-board/discovery-negative-cache
# ---------------------------------------------------------------------------

@alumni_discovery_bp.route("/discovery-negative-cache", methods=["GET"])
@require_firebase_auth
@require_tier(["free", "pro", "elite"])
def negative_cache_endpoint():
    """Return companies the user has already "no alumni" cached.

    Batch-loaded ONCE on JobBoardPage mount so the UI can branch each
    JobRow CTA into the disabled "Already checked — no alumni" state
    without N Firestore reads per row.
    """
    if not ad.is_feature_enabled():
        return _flag_gated_404()

    uid = request.firebase_user.get("uid")
    try:
        companies = ad.list_negative_cache_companies(uid)
    except Exception as e:
        logger.exception("[NegativeCache] list failed uid=%s: %s", uid, e)
        return jsonify({"companies": []}), 200

    return jsonify({"companies": companies}), 200
