"""Firestore-backed PDL Person Search response cache.

PDL Person Search charges 1 credit per record in the response `data` array,
and PDL FAQ confirms repeat queries are re-billed. This cache turns repeat
queries into 0-credit reads.

Collection: `pdl_search_cache`
Doc ID:     sha256(normalized_query_json)
TTL:        30 days, enforced by Firestore native TTL on `expires_at`.
            Setup once in console: Firestore -> Time-to-live -> add policy on
            collection `pdl_search_cache`, field `expires_at`.

Cache key intentionally excludes the user — two students with the same query
share the cache. Per-user dedup (exclude_keys) is applied AFTER read.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from google.cloud.firestore import SERVER_TIMESTAMP

from app.extensions import get_db

logger = logging.getLogger(__name__)

CACHE_COLLECTION = "pdl_search_cache"
CACHE_TTL_DAYS = 30


def _norm_list(items: Optional[Iterable[Any]]) -> list[str]:
    if not items:
        return []
    out = []
    for x in items:
        if isinstance(x, dict):
            v = x.get("name") or x.get("school") or ""
        else:
            v = x
        s = str(v).strip().lower()
        if s:
            out.append(s)
    return sorted(set(out))


def make_query_hash(parsed: dict, max_contacts: int) -> str:
    """Stable hash of the search intent. Same intent -> same key.

    Normalizes to the dimensions that affect PDL results: schools, companies,
    title_variations, locations, industries, plus max_contacts (because
    cached `results` length depends on `size`).
    """
    norm = {
        "schools":   _norm_list(parsed.get("schools")),
        "companies": _norm_list(parsed.get("companies")),
        "titles":    _norm_list(parsed.get("title_variations")),
        "locations": _norm_list(parsed.get("locations")),
        "industries": _norm_list(parsed.get("industries")),
        "size":      int(max_contacts),
    }
    payload = json.dumps(norm, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _query_meta(parsed: dict, max_contacts: int) -> dict:
    return {
        "schools":   _norm_list(parsed.get("schools")),
        "companies": _norm_list(parsed.get("companies")),
        "titles":    _norm_list(parsed.get("title_variations")),
        "locations": _norm_list(parsed.get("locations")),
        "industries": _norm_list(parsed.get("industries")),
        "size":      int(max_contacts),
    }


def get(parsed: dict, max_contacts: int) -> Optional[dict]:
    """Return cached payload {results, retry_level_used, adjacency_metadata}
    or None on miss / expired / any Firestore error.
    """
    db = get_db()
    if not db:
        return None
    try:
        key = make_query_hash(parsed, max_contacts)
        snap = db.collection(CACHE_COLLECTION).document(key).get()
        if not snap.exists:
            return None
        doc = snap.to_dict() or {}
        # Client-side expiry guard: Firestore TTL deletion can lag up to ~24h.
        exp = doc.get("expires_at")
        if exp is not None:
            try:
                # Firestore returns DatetimeWithNanoseconds (tz-aware)
                if exp <= datetime.now(timezone.utc):
                    return None
            except Exception:
                pass
        return {
            "results": doc.get("results") or [],
            "retry_level_used": int(doc.get("retry_level_used") or 0),
            "adjacency_metadata": doc.get("adjacency_metadata") or None,
            "cached_at": doc.get("created_at"),
        }
    except Exception as e:
        logger.warning("pdl_cache.get failed: %s", e)
        return None


def put(parsed: dict, max_contacts: int, *, results: list,
        retry_level_used: int = 0,
        adjacency_metadata: Optional[dict] = None) -> None:
    """Write/overwrite cache entry. Best-effort; never raises."""
    if not results:
        return  # don't cache empty results (next search may be different timing)
    db = get_db()
    if not db:
        return
    try:
        key = make_query_hash(parsed, max_contacts)
        expires_at = datetime.now(timezone.utc) + timedelta(days=CACHE_TTL_DAYS)
        payload = {
            "query_hash": key,
            "query_meta": _query_meta(parsed, max_contacts),
            "results": results,
            "credit_cost": len(results),
            "retry_level_used": int(retry_level_used or 0),
            "adjacency_metadata": adjacency_metadata or None,
            "created_at": SERVER_TIMESTAMP,
            "expires_at": expires_at,
        }
        db.collection(CACHE_COLLECTION).document(key).set(payload)
    except Exception as e:
        logger.warning("pdl_cache.set failed: %s", e)


def filter_excluded(results: list, exclude_keys: Optional[set]) -> list:
    """Apply per-user exclusion (already-saved contacts) to cached results."""
    if not exclude_keys or not results:
        return list(results or [])
    from app.services.pdl_client import get_contact_identity
    out = []
    for c in results:
        try:
            if get_contact_identity(c) in exclude_keys:
                continue
        except Exception:
            pass
        out.append(c)
    return out
