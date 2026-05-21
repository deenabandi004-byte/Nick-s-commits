"""Shared Firestore cache for enrichment data.

NOT per-user. 10 students targeting Goldman = 1 Perplexity call.
Cache keys based on entity (person+company, company name, job URL).
Collection: enrichment_cache/{hash} in Firestore.
"""
from __future__ import annotations

import hashlib
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

CACHE_TTLS = {
    "contact_enrichment": 7 * 86400,     # 7 days
    "company_news": 24 * 3600,           # 24 hours
    "company_profile": 7 * 86400,        # 7 days
    "job_posting": 6 * 3600,             # 6 hours
    "job_search": 4 * 3600,             # 4 hours
    "hiring_verification": 3 * 86400,    # 3 days
    "market_context": 12 * 3600,         # 12 hours
    "firm_discovery": 24 * 3600,         # 24 hours
    "research": 24 * 3600,              # 24 hours
}


def _cache_key(cache_type: str, key_parts: list[str]) -> str:
    """Generate a stable hash key from cache type and key parts."""
    raw = f"{cache_type}:{':'.join(str(p) for p in key_parts)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def get_cached(cache_type: str, key_parts: list[str]) -> dict | list | None:
    """Fetch from shared cache. Returns None if not cached or expired."""
    try:
        from app.extensions import get_db
        db = get_db()
        if not db:
            return None

        doc_id = _cache_key(cache_type, key_parts)
        doc = db.collection("enrichment_cache").document(doc_id).get()

        if not doc.exists:
            return None

        data = doc.to_dict()
        if not data:
            return None

        # Check TTL
        cached_at = data.get("cached_at", 0)
        ttl = CACHE_TTLS.get(cache_type, 24 * 3600)
        if time.time() - cached_at > ttl:
            return None

        return data.get("payload")
    except Exception:
        logger.debug("Cache read failed for %s", cache_type, exc_info=True)
        return None


def set_cached(cache_type: str, key_parts: list[str], data: dict | list) -> None:
    """Write to shared cache."""
    try:
        from app.extensions import get_db
        db = get_db()
        if not db:
            return

        doc_id = _cache_key(cache_type, key_parts)
        db.collection("enrichment_cache").document(doc_id).set({
            "cache_type": cache_type,
            "cached_at": time.time(),
            "payload": data,
        })
    except Exception:
        logger.debug("Cache write failed for %s", cache_type, exc_info=True)
