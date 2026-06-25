"""Shared Firestore cache for PDL Job Title Enrichment.

Every unique title is enriched at most once across all callers. Backed by
`job_title_enrichments/{slug}` in Firestore so the cache survives restarts,
deploys, and worker rotation.

Budget guards (we have a fixed 50k credit pool, not per-month):
  - MAX_PER_RUN: hard cap on cache misses per process invocation
  - TOTAL_BUDGET_CIRCUIT_BREAKER: refuses calls once cumulative usage
    crosses 90% of the pool
  - Counter doc `pdl_usage/title_enrich` tracks cumulative spend for
    observability and the breaker
"""
from __future__ import annotations

import logging
import re
import threading
import time
from typing import Optional

from google.cloud.firestore import Increment, SERVER_TIMESTAMP

from app.services.pdl_client import enrich_job_title_with_pdl

logger = logging.getLogger(__name__)


PDL_TOTAL_BUDGET = 50_000
TOTAL_BUDGET_CIRCUIT_BREAKER = int(PDL_TOTAL_BUDGET * 0.90)  # 45,000
# Backfill of existing 12.9k unique slugs → ~130 runs at this cap = ~11 days
# at the 2h cron. Raise to 200 after 48h of clean burn metrics.
MAX_PER_RUN = 100

CACHE_COLLECTION = "job_title_enrichments"
USAGE_DOC_PATH = ("pdl_usage", "title_enrich")

# Per-process miss counter so MAX_PER_RUN works in a single worker invocation.
_run_misses = 0
_run_lock = threading.Lock()


def slugify_title(title: str) -> str:
    """Normalize a job title for cache lookup.

    Goal: "Sr. SWE II", "sr swe ii", "Sr SWE  II", "SR. SWE-II" all map to
    the same slug so the cache stays small. If this regresses, cardinality
    explodes and we burn the credit pool.
    """
    if not title or not isinstance(title, str):
        return ""
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _empty_payload(title: str) -> dict:
    return {
        "cleaned_name": title or "",
        "similar_titles": [],
        "levels": [],
        "role": "",
        "sub_role": "",
    }


def reset_run_counter() -> None:
    """Pipeline calls this at the start of each run so MAX_PER_RUN resets."""
    global _run_misses
    with _run_lock:
        _run_misses = 0


def get_run_misses() -> int:
    return _run_misses


def _total_credits_used(db) -> int:
    try:
        doc = db.collection(USAGE_DOC_PATH[0]).document(USAGE_DOC_PATH[1]).get()
        if doc.exists:
            return int((doc.to_dict() or {}).get("credits_used", 0))
    except Exception as exc:
        logger.warning("pdl_title_cache: failed to read usage counter: %s", exc)
    return 0


def _increment_usage(db) -> None:
    try:
        db.collection(USAGE_DOC_PATH[0]).document(USAGE_DOC_PATH[1]).set(
            {
                "credits_used": Increment(1),
                "last_call_at": SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception as exc:
        logger.warning("pdl_title_cache: failed to increment usage counter: %s", exc)


def _read_cache(db, slug: str) -> Optional[dict]:
    try:
        doc = db.collection(CACHE_COLLECTION).document(slug).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        # Bump hit_count opportunistically; failures don't break the read.
        try:
            db.collection(CACHE_COLLECTION).document(slug).set(
                {"hit_count": Increment(1)}, merge=True
            )
        except Exception:
            pass
        return {
            "cleaned_name": data.get("cleaned_name", ""),
            "similar_titles": data.get("similar_titles") or [],
            "levels": data.get("levels") or [],
            "role": data.get("role", ""),
            "sub_role": data.get("sub_role", ""),
        }
    except Exception as exc:
        logger.warning("pdl_title_cache: cache read failed for %s: %s", slug, exc)
        return None


def _write_cache(db, slug: str, original_title: str, payload: dict) -> None:
    try:
        db.collection(CACHE_COLLECTION).document(slug).set(
            {
                "slug": slug,
                "original_title_sample": original_title,
                "cleaned_name": payload.get("cleaned_name", ""),
                "similar_titles": payload.get("similar_titles") or [],
                "levels": payload.get("levels") or [],
                "role": payload.get("role", ""),
                "sub_role": payload.get("sub_role", ""),
                "enriched_at": SERVER_TIMESTAMP,
                "hit_count": 0,
            },
            merge=True,
        )
    except Exception as exc:
        logger.warning("pdl_title_cache: cache write failed for %s: %s", slug, exc)


def _normalize_pdl_response(raw: dict, fallback_title: str) -> dict:
    """pdl_client.enrich_job_title_with_pdl returns {cleaned_name, similar_titles,
    levels, categories}. Split categories into role + sub_role for our schema."""
    if not isinstance(raw, dict):
        return _empty_payload(fallback_title)
    categories = raw.get("categories") or []
    role = ""
    sub_role = ""
    if isinstance(categories, list) and categories:
        first = categories[0]
        if isinstance(first, dict):
            role = first.get("role", "") or ""
            sub_role = first.get("sub_role", "") or ""
        elif isinstance(first, str):
            role = first
    return {
        "cleaned_name": raw.get("cleaned_name") or fallback_title,
        "similar_titles": [t for t in (raw.get("similar_titles") or []) if isinstance(t, str)],
        "levels": [l for l in (raw.get("levels") or []) if isinstance(l, str)],
        "role": role,
        "sub_role": sub_role,
    }


def get_or_enrich_title(title: str) -> dict:
    """Return enrichment for `title`, hitting PDL only on a cache miss.

    Returns the empty payload shape on:
      - empty/invalid title
      - Firestore unavailable
      - per-run cap exceeded
      - total-budget breaker tripped
      - PDL call failure

    Callers can safely use the result without None checks.
    """
    global _run_misses

    if not title or not isinstance(title, str):
        return _empty_payload(title or "")

    slug = slugify_title(title)
    if not slug:
        return _empty_payload(title)

    try:
        from app.extensions import get_db
        db = get_db()
    except Exception as exc:
        logger.warning("pdl_title_cache: get_db failed: %s", exc)
        return _empty_payload(title)

    if db is None:
        return _empty_payload(title)

    cached = _read_cache(db, slug)
    if cached is not None:
        return cached

    # Cache miss — check guards before calling PDL.
    with _run_lock:
        if _run_misses >= MAX_PER_RUN:
            logger.warning(
                "pdl_title_cache: MAX_PER_RUN (%s) hit; deferring '%s'",
                MAX_PER_RUN, title,
            )
            return _empty_payload(title)

    if _total_credits_used(db) >= TOTAL_BUDGET_CIRCUIT_BREAKER:
        logger.error(
            "pdl_title_cache: total-budget circuit breaker tripped at %s/%s; "
            "refusing to enrich '%s'",
            TOTAL_BUDGET_CIRCUIT_BREAKER, PDL_TOTAL_BUDGET, title,
        )
        return _empty_payload(title)

    # Safe to call.
    raw = enrich_job_title_with_pdl(title) or {}
    payload = _normalize_pdl_response(raw, title)

    _increment_usage(db)
    with _run_lock:
        _run_misses += 1
    _write_cache(db, slug, title, payload)

    # Burn-rate alerts. Re-reading the counter after the increment is fine —
    # this only logs once per cron miss, not per call. Coarse-grained
    # threshold logs let us see the burn in Render logs without polling
    # the admin endpoint.
    try:
        used = _total_credits_used(db)
        if used > 40_000:
            logger.error(
                "PDL_BURN_RED: %s/%s credits used (>80%%); breaker fires at %s",
                used, PDL_TOTAL_BUDGET, TOTAL_BUDGET_CIRCUIT_BREAKER,
            )
        elif used > 25_000:
            logger.warning(
                "PDL_BURN_HIGH: %s/%s credits used (>50%%)",
                used, PDL_TOTAL_BUDGET,
            )
        elif used > 5_000:
            logger.warning(
                "PDL_BURN_WARN: %s/%s credits used (>10%%)",
                used, PDL_TOTAL_BUDGET,
            )
    except Exception:
        pass

    return payload
