"""
Jobs API routes - feed, feedback, and filters.
"""
from flask import Blueprint, jsonify, request
from backend.app.extensions import require_firebase_auth, get_db
from backend.app.utils.job_ranking import (
    prefilter_candidates,
    rank_with_gpt,
    apply_feedback_adjustments,
    cap_per_company,
    _is_excluded as _is_excluded_job,
    _is_non_us as _is_international_job,
)
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
import logging
import threading

logger = logging.getLogger(__name__)

jobs_bp = Blueprint("jobs", __name__)

_filters_cache = {"data": None, "cached_at": None}
FILTERS_CACHE_TTL = 3600

_ranking_lock = threading.Lock()
_ranking_in_progress = set()  # UIDs currently being re-ranked
_ranking_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="job-rank")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dedup_by_title_company(jobs: list[dict]) -> list[dict]:
    """Deduplicate jobs by (title, company), keeping the higher-scored one."""
    seen = {}
    for job in jobs:
        key = ((job.get("title") or "").lower().strip(), (job.get("company") or "").lower().strip())
        existing = seen.get(key)
        if existing is None or (job.get("match_score") or 0) > (existing.get("match_score") or 0):
            seen[key] = job
    return sorted(seen.values(), key=lambda j: j.get("match_score") or 0, reverse=True)


def _serialize_jobs(jobs: list[dict]) -> list[dict]:
    """Convert Firestore timestamps to ISO strings and strip description_raw."""
    cleaned = []
    for job in jobs:
        doc = dict(job)
        for ts_field in ("posted_at", "fetched_at", "expires_at"):
            val = doc.get(ts_field)
            if val is not None and hasattr(val, "isoformat"):
                doc[ts_field] = val.isoformat()
            elif val is not None and hasattr(val, "timestamp"):
                # Firestore DatetimeWithNanoseconds
                doc[ts_field] = val.isoformat()
        doc.pop("description_raw", None)
        cleaned.append(doc)
    return cleaned


# ---------------------------------------------------------------------------
# GET /api/jobs/feed
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/feed", methods=["GET"])
@require_firebase_auth
def get_feed():
    uid = request.firebase_user["uid"]
    db = get_db()
    now = datetime.now(timezone.utc)
    refresh = request.args.get("refresh", "").lower() == "true"

    # Load user profile
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        return jsonify({"error": "User not found"}), 404

    # Clear cache on explicit refresh
    if refresh:
        user_ref.update({"jobFeedCache": None})

    profile = user_doc.to_dict()

    # Check cache
    cache = profile.get("jobFeedCache") or {}
    cache_ranked_at = cache.get("ranked_at")
    cache_valid = False
    if cache_ranked_at and not refresh:
        if hasattr(cache_ranked_at, "timestamp"):
            cache_age = (now - cache_ranked_at.replace(tzinfo=timezone.utc)).total_seconds()
        elif hasattr(cache_ranked_at, "isoformat"):
            cache_age = (now - cache_ranked_at).total_seconds()
        else:
            cache_age = float("inf")
        cache_valid = cache_age < 1800
        cache_stale_ok = not cache_valid and cache_age < 7200  # 2 hours
    else:
        cache_stale_ok = False

    # Check new_matches cache (short TTL - 5 min)
    nm_cache = cache.get("new_matches_cache") or {}
    nm_cached_at = nm_cache.get("cached_at")
    nm_valid = False
    if nm_cached_at and not refresh:
        if hasattr(nm_cached_at, "timestamp"):
            nm_age = (now - nm_cached_at.replace(tzinfo=timezone.utc)).total_seconds()
        elif hasattr(nm_cached_at, "isoformat"):
            nm_age = (now - nm_cached_at).total_seconds()
        else:
            nm_age = float("inf")
        nm_valid = nm_age < 300  # 5 minutes

    twenty_four_hours_ago = now - timedelta(hours=24)

    def _fetch_new_matches(cached_scores=None, cached_reasons=None):
        """Fetch new_matches from Firestore, or return from cache if fresh."""
        if nm_valid:
            return nm_cache.get("jobs", []), True
        new_query = (
            db.collection("jobs")
            .where("posted_at", ">=", twenty_four_hours_ago)
            .order_by("posted_at", direction="DESCENDING")
            .limit(20)
        )
        new_matches = []
        for d in new_query.stream():
            j = d.to_dict()
            if _is_international_job(j) or _is_excluded_job(j):
                continue
            jid = j.get("job_id", d.id)
            if cached_scores:
                j["match_score"] = cached_scores.get(jid)
                j["match_reason"] = (cached_reasons or {}).get(jid)
                j["ranked"] = j["match_score"] is not None
            else:
                j["match_score"] = None
                j["match_reason"] = None
                j["ranked"] = False
            new_matches.append(j)
        # Persist new_matches to cache (fire-and-forget)
        try:
            user_ref.update({
                "jobFeedCache.new_matches_cache": {
                    "jobs": _serialize_jobs(new_matches),
                    "cached_at": now,
                }
            })
        except Exception:
            pass
        return new_matches, False

    def _load_top_jobs_from_cache(cached_ids, cached_scores, cached_reasons):
        """Hydrate top_jobs from cached job IDs."""
        top_jobs = []
        if cached_ids:
            for i in range(0, len(cached_ids), 100):
                chunk = cached_ids[i:i + 100]
                refs = [db.collection("jobs").document(jid) for jid in chunk]
                docs = db.get_all(refs)
                for d in docs:
                    if d.exists:
                        j = d.to_dict()
                        jid = j.get("job_id", d.id)
                        j["match_score"] = cached_scores.get(jid)
                        j["match_reason"] = cached_reasons.get(jid)
                        j["ranked"] = j["match_score"] is not None
                        top_jobs.append(j)
            top_jobs.sort(key=lambda j: j.get("match_score") or 0, reverse=True)
        return top_jobs

    if cache_valid:
        cached_ids = cache.get("job_ids", [])
        cached_scores = cache.get("scores", {})
        cached_reasons = cache.get("reasons", {})
        top_jobs = _load_top_jobs_from_cache(cached_ids, cached_scores, cached_reasons)
        new_matches, nm_from_cache = _fetch_new_matches(cached_scores, cached_reasons)

        return jsonify({
            "new_matches": _serialize_jobs(new_matches) if not nm_from_cache else new_matches,
            "top_jobs": _serialize_jobs(top_jobs),
            "new_matches_count": len(new_matches),
            "top_jobs_count": len(top_jobs),
            "ranked": True,
            "no_resume": False,
            "cached": True,
        })

    if not cache_valid and cache_stale_ok:
        cached_ids = cache.get("job_ids", [])
        cached_scores = cache.get("scores", {})
        cached_reasons = cache.get("reasons", {})
        top_jobs = _load_top_jobs_from_cache(cached_ids, cached_scores, cached_reasons)
        new_matches, nm_from_cache = _fetch_new_matches(cached_scores, cached_reasons)

        # Trigger background re-rank if not already in progress
        if uid not in _ranking_in_progress:
            _ranking_in_progress.add(uid)
            _ranking_pool.submit(_background_rerank, uid)
            logger.info(f"Triggered background re-rank for {uid}")

        return jsonify({
            "new_matches": _serialize_jobs(new_matches) if not nm_from_cache else new_matches,
            "top_jobs": _serialize_jobs(top_jobs),
            "new_matches_count": len(new_matches),
            "top_jobs_count": len(top_jobs),
            "ranked": True,
            "no_resume": False,
            "cached": True,
            "stale": True,
        })

    # No resume - return unranked jobs by recency
    has_resume = bool(profile.get("resumeParsed") or profile.get("resumeText"))
    if not has_resume:
        new_matches, nm_from_cache = _fetch_new_matches()
        top_query = (
            db.collection("jobs")
            .order_by("posted_at", direction="DESCENDING")
            .limit(80)
        )
        top_jobs = [d.to_dict() for d in top_query.stream()]
        top_jobs = [j for j in top_jobs if not _is_international_job(j) and not _is_excluded_job(j)]
        top_jobs = cap_per_company(top_jobs, max_per_company=3)[:50]
        for j in top_jobs:
            j["match_score"] = None
            j["match_reason"] = None
            j["ranked"] = False

        return jsonify({
            "new_matches": _serialize_jobs(new_matches) if not nm_from_cache else new_matches,
            "top_jobs": _serialize_jobs(top_jobs),
            "new_matches_count": len(new_matches),
            "top_jobs_count": len(top_jobs),
            "ranked": False,
            "no_resume": True,
            "cached": False,
        })

    # Has resume but no cache - return unranked jobs immediately, rank in background
    top_query = (
        db.collection("jobs")
        .order_by("posted_at", direction="DESCENDING")
        .limit(80)
    )
    top_jobs = [d.to_dict() for d in top_query.stream()]
    top_jobs = [j for j in top_jobs if not _is_international_job(j) and not _is_excluded_job(j)]
    top_jobs = cap_per_company(top_jobs, max_per_company=3)[:50]
    for j in top_jobs:
        j["match_score"] = None
        j["match_reason"] = None
        j["ranked"] = False

    new_matches, nm_from_cache = _fetch_new_matches()

    # Trigger background ranking so next load is fast
    if uid not in _ranking_in_progress:
        _ranking_in_progress.add(uid)
        t = threading.Thread(target=_background_rerank, args=(uid,), daemon=True)
        t.start()
        logger.info(f"Triggered background ranking for {uid} (first visit)")

    return jsonify({
        "new_matches": _serialize_jobs(new_matches) if not nm_from_cache else new_matches,
        "top_jobs": _serialize_jobs(top_jobs),
        "new_matches_count": len(new_matches),
        "top_jobs_count": len(top_jobs),
        "ranked": False,
        "no_resume": False,
        "cached": False,
        "ranking_in_progress": True,
    })


def _is_recent(posted_at, cutoff: datetime) -> bool:
    """Check if a posted_at value is after the cutoff."""
    if posted_at is None:
        return False
    if hasattr(posted_at, "timestamp"):
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    return posted_at >= cutoff


def _get_posted_at_ts(job: dict) -> datetime:
    """Get posted_at as a timezone-aware datetime for sorting."""
    val = job.get("posted_at")
    if val is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if hasattr(val, "timestamp") and val.tzinfo is None:
        return val.replace(tzinfo=timezone.utc)
    return val


def _background_rerank(uid: str):
    """Re-rank jobs in background thread and update cache."""
    try:
        from backend.app.extensions import get_db
        db = get_db()
        now = datetime.now(timezone.utc)

        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return
        profile = user_doc.to_dict()

        has_resume = bool(profile.get("resumeParsed") or profile.get("resumeText"))
        if not has_resume:
            return

        all_query = (
            db.collection("jobs")
            .order_by("posted_at", direction="DESCENDING")
            .limit(500)
        )
        all_jobs = [doc.to_dict() for doc in all_query.stream()]

        # Filter out international and senior/irrelevant jobs
        all_jobs = [j for j in all_jobs if not _is_international_job(j) and not _is_excluded_job(j)]

        prefs_query = user_ref.collection("jobPreferences").limit(100)
        preferences = [doc.to_dict() for doc in prefs_query.stream()]

        candidates = prefilter_candidates(all_jobs, profile, top_n=50)
        ranked = rank_with_gpt(candidates, profile)
        adjusted = apply_feedback_adjustments(ranked, preferences)

        # Deduplicate by title + company, cap per company, then take top 50
        deduped = _dedup_by_title_company(adjusted)
        top_jobs = cap_per_company(deduped, max_per_company=3)[:50]
        cache_data = {
            "job_ids": [j["job_id"] for j in top_jobs],
            "scores": {j["job_id"]: j.get("match_score") for j in top_jobs},
            "reasons": {j["job_id"]: j.get("match_reason") for j in top_jobs},
            "ranked_at": datetime.now(timezone.utc),
        }
        user_ref.update({"jobFeedCache": cache_data})
        logger.info(f"Background re-rank complete for {uid}")
    except Exception as e:
        logger.warning(f"Background re-rank failed for {uid}: {e}")
    finally:
        _ranking_in_progress.discard(uid)


# ---------------------------------------------------------------------------
# GET /api/jobs/<job_id>
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/<job_id>", methods=["GET"])
@require_firebase_auth
def get_job_detail(job_id: str):
    db = get_db()
    doc = db.collection("jobs").document(job_id).get()
    if not doc.exists:
        return jsonify({"error": "Job not found"}), 404
    job = doc.to_dict()
    # Serialize timestamps
    for ts_field in ("posted_at", "fetched_at", "expires_at"):
        val = job.get(ts_field)
        if val is not None and hasattr(val, "isoformat"):
            job[ts_field] = val.isoformat()
    return jsonify(job)


# ---------------------------------------------------------------------------
# POST /api/jobs/feedback
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/feedback", methods=["POST"])
@require_firebase_auth
def post_feedback():
    uid = request.firebase_user["uid"]
    db = get_db()
    data = request.get_json(silent=True) or {}

    job_id = data.get("job_id")
    signal = data.get("signal")

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400
    if signal not in ("positive", "negative"):
        return jsonify({"error": "signal must be 'positive' or 'negative'"}), 400

    pref_doc = {
        "job_id": job_id,
        "signal": signal,
        "company": data.get("company"),
        "category": data.get("category"),
        "created_at": datetime.now(timezone.utc),
    }
    db.collection("users").document(uid).collection("jobPreferences").document(job_id).set(pref_doc)

    # Invalidate cache
    db.collection("users").document(uid).update({"jobFeedCache.ranked_at": None})

    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# GET /api/jobs/filters
# ---------------------------------------------------------------------------

@jobs_bp.route("/api/jobs/filters", methods=["GET"])
@require_firebase_auth
def get_filters():
    now = datetime.now(timezone.utc)

    # Check module-level cache
    if (
        _filters_cache["data"] is not None
        and _filters_cache["cached_at"] is not None
        and (now - _filters_cache["cached_at"]).total_seconds() < FILTERS_CACHE_TTL
    ):
        return jsonify(_filters_cache["data"])

    db = get_db()
    types = set()
    categories = set()
    total = 0

    query = db.collection("jobs").limit(500)
    for doc in query.stream():
        d = doc.to_dict()
        total += 1
        if d.get("type"):
            types.add(d["type"])
        if d.get("category"):
            categories.add(d["category"])

    result = {
        "types": sorted(types),
        "categories": sorted(categories),
        "total_jobs": total,
    }
    _filters_cache["data"] = result
    _filters_cache["cached_at"] = now

    return jsonify(result)
