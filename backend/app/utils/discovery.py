"""
Discovery score reader.

Looks up per-company DISCOVERY signal computed by
backend/scripts/discovery_aggregation.py. Returns None when no entry
exists; callers default to 0 or skip the discovery component depending
on how strict they want to be.

Process-local cache with a 5-minute TTL: this function will be called
once per (company, request) pair when the bucket tagger runs, and the
underlying data only refreshes daily, so caching is cheap and safe.

Phase 1 status: this helper is in place, but no caller wires it in yet.
The bucket tagger lands in the next step. Discovery composite weight is
0 in phase 1; even after the bucket tagger lands, this signal only
tags HIDDEN GEM jobs for telemetry and does not move sort order.
"""
from __future__ import annotations

import re
import time
from typing import Dict, Optional

_TTL_SECONDS = 5 * 60
_CACHE: Dict[str, tuple] = {}  # slug -> (Optional[int], expires_at_monotonic)


def _normalize_company(name: str) -> str:
    if not isinstance(name, str):
        return ""
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def get_discovery_score(company: str) -> Optional[int]:
    """
    Return discovery score 0..100 for a company, or None if unknown.

    Read path is one Firestore document get per cache miss. Cache TTL
    five minutes. The aggregation cron writes daily so staleness within
    a five-minute window is acceptable.
    """
    slug = _normalize_company(company or "")
    if not slug:
        return None

    now = time.monotonic()
    cached = _CACHE.get(slug)
    if cached and cached[1] > now:
        return cached[0]

    try:
        from app.extensions import get_db
        db = get_db()
        if db is None:
            return None
        doc = db.collection("company_signals").document(slug).get()
    except Exception:
        return None

    if not doc.exists:
        _CACHE[slug] = (None, now + _TTL_SECONDS)
        return None

    data = doc.to_dict() or {}
    score = data.get("discovery_score")
    if not isinstance(score, int):
        _CACHE[slug] = (None, now + _TTL_SECONDS)
        return None

    _CACHE[slug] = (score, now + _TTL_SECONDS)
    return score


def prime_cache(scores: Dict[str, int]) -> None:
    """Bulk-set discovery scores in the process cache.

    Used by the feed builder to fetch all needed company scores in one
    Firestore query instead of N individual gets. Phase 1 wires this in
    after the bucket tagger lands; leaving the hook in place now.
    """
    now = time.monotonic()
    for slug_raw, score in scores.items():
        slug = _normalize_company(slug_raw)
        if slug and isinstance(score, int):
            _CACHE[slug] = (score, now + _TTL_SECONDS)


def clear_cache() -> None:
    """Test helper. Wipes the process cache. Not used in prod."""
    _CACHE.clear()
