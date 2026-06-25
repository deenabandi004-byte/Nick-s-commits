"""
Provider-call metering.

Wraps any HTTP-calling function with `@meter_call("provider", "endpoint")` and
writes one row per call to the `provider_calls` Firestore collection (on a
background thread so we don't add latency to the user's request).

Used by every external data provider client so we have one place to look for:
  - Where credits are going (PDL vs Coresignal vs Hunter vs Apify)
  - Which users / features burn the most
  - Actual $ cost trend vs the provider's billing dashboard

DESIGN PRINCIPLES
  1. Metering must NEVER break a search. Every write is try/except'd; if
     Firestore is down, we log and keep going.
  2. Metering must NEVER add user-visible latency. Writes happen on a
     daemon thread spawned in the decorator's `finally` block.
  3. Credit + cost math is centralized in this module so each provider
     client stays clean — they just decorate their function.

PROVIDER_RATES are the *effective* $/credit assumptions used for the
`est_cost_usd` column. They're approximations sized to the Pro/Standard
plans we expect to be on; refine them as contracts settle.
"""

from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from functools import wraps
from typing import Any, Callable, Dict, Optional, Tuple

from flask import g, has_app_context, has_request_context

from app.extensions import get_db

logger = logging.getLogger("metering")


# ---------------------------------------------------------------------------
# Rate sheet
#
# Effective $ per native credit. The native credit unit depends on provider:
#   - PDL:          1 credit = 1 result returned (Search) or 1 enriched record
#   - Coresignal:   Search = 1 credit / call;  Collect = 1 credit / profile.
#                   At Pro ($800/mo for 10K Collect + 20K Search), Collect is
#                   the meaningful unit; Search is essentially included.
#                   We attribute proportionally so the dashboard sums match
#                   the actual plan cost.
#   - Hunter:       1 credit = 1 request (Domain Search / Email Finder).
#   - Apify:        1 credit ≈ 1 actor-enrichment (proxy for compute units).
# ---------------------------------------------------------------------------

PROVIDER_RATES: Dict[str, Dict[str, float]] = {
    "pdl":         {"person_search": 0.20, "person_enrich": 0.20},
    "coresignal":  {"member_search": 0.04, "member_collect": 0.08},
    "hunter":      {"domain_search": 0.004, "email_finder": 0.003, "email_verify": 0.002},
    "apify":       {"linkedin_posts": 0.005, "sales_nav": 0.005},
    "neverbounce": {"single_check": 0.005},
}


# ---------------------------------------------------------------------------
# Decorator
# ---------------------------------------------------------------------------


def meter_call(provider: str, endpoint: str):
    """
    Decorator: wrap a provider-HTTP-calling function. After it returns (or
    raises), log a `provider_calls` row capturing credits, est_cost_usd,
    latency, status, plus user_id/search_id from Flask `g` if available.

    The wrapped function's return value is computed-once and not modified.
    """

    def decorator(fn: Callable):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            t0 = time.time()
            status = "ok"
            err: Optional[str] = None
            result: Any = None
            try:
                result = fn(*args, **kwargs)
                return result
            except Exception as e:  # noqa: BLE001 - re-raised below
                status = "error"
                err = str(e)[:300]
                raise
            finally:
                # Compute metering payload while still inside the request
                # context (so flask.g access works) but defer the Firestore
                # write to a daemon thread so the user sees no latency.
                try:
                    if status == "ok":
                        credits = _credits_for(provider, endpoint, result, kwargs)
                        returned = _count_returned(provider, endpoint, result)
                        cost = _cost_for(provider, endpoint, credits)
                    else:
                        credits, returned, cost = 0, 0, 0.0
                    latency_ms = int((time.time() - t0) * 1000)

                    payload = {
                        "provider": provider,
                        "endpoint": endpoint,
                        "user_id": _get_g("user_id", "unknown"),
                        "search_id": _get_g("search_id"),
                        "returned_records": returned,
                        "credits_charged": credits,
                        "est_cost_usd": cost,
                        "cache_hit": False,  # Phase 2 flips this to True for cached lookups
                        "latency_ms": latency_ms,
                        "status": status,
                        "error_msg": err,
                    }
                    threading.Thread(
                        target=_safe_write,
                        args=(payload,),
                        daemon=True,
                        name=f"meter-{provider}",
                    ).start()
                except Exception as meter_err:  # noqa: BLE001
                    # Metering itself must never break a search.
                    logger.warning("Metering instrumentation failed: %s", meter_err)

        return wrapped

    return decorator


def _cost_for(provider: str, endpoint: str, credits: int) -> float:
    """
    USD cost for `credits` units of `endpoint`. Most endpoints have a flat
    per-credit rate. Coresignal member_search is special: credits=1+N where
    1 is a Search credit ($0.04) and N are Collect credits ($0.08 each).
    """
    if credits <= 0:
        return 0.0
    if provider == "coresignal" and endpoint == "member_search":
        # First credit is the Search call, rest are Collects.
        search_rate = PROVIDER_RATES["coresignal"]["member_search"]
        collect_rate = PROVIDER_RATES["coresignal"]["member_collect"]
        collect_credits = max(0, credits - 1)
        return round(search_rate + collect_credits * collect_rate, 6)
    rate = PROVIDER_RATES.get(provider, {}).get(endpoint, 0.0)
    return round(credits * rate, 6)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_g(name: str, default=None):
    """Read a value from flask.g if a request/app context exists, else default."""
    if has_request_context() or has_app_context():
        return getattr(g, name, default)
    return default


def new_search_id() -> str:
    """Generate a stable short search_id. Call once per route entry and set on g."""
    return uuid.uuid4().hex[:12]


def attach_request_context(user_id: Optional[str] = None, search_id: Optional[str] = None) -> str:
    """
    Stash user_id + search_id on flask.g so the meter_call decorator can pick
    them up. Returns the search_id (newly minted if not provided).

    Routes call this once at entry:
        from app.services.metering import attach_request_context
        attach_request_context(user_id=request.firebase_user["uid"])
    """
    if not (has_request_context() or has_app_context()):
        return search_id or new_search_id()
    if user_id is not None:
        g.user_id = user_id
    sid = search_id or getattr(g, "search_id", None) or new_search_id()
    g.search_id = sid
    return sid


# ---------------------------------------------------------------------------
# Credit + return-count calculators (centralized so provider clients stay clean)
# ---------------------------------------------------------------------------


def _credits_for(provider: str, endpoint: str, result: Any, kwargs: Dict[str, Any]) -> int:
    """
    Compute how many native provider credits this call consumed.

    Heuristics:
      - PDL Search: bills per result returned (1 credit per record).
      - PDL Enrich: 1 credit on hit (response present), 0 on miss.
      - Coresignal member_search (our public surface): 1 Search credit +
        N Collect credits, where N = meta.collected_count from the result.
      - Coresignal member_collect: 1 credit per call.
      - Hunter / Apify: 1 credit per call (refined in later phases).
    """
    try:
        if provider == "pdl" and endpoint == "person_search":
            # execute_pdl_search returns (raw_contacts, status_code)
            if isinstance(result, tuple) and result and isinstance(result[0], list):
                return len(result[0])
            return 0
        if provider == "pdl" and endpoint == "person_enrich":
            return 1 if result else 0
        if provider == "coresignal" and endpoint == "member_search":
            # search_contacts_from_prompt returns
            # (contacts, retry_level, saved, meta)
            if isinstance(result, tuple) and len(result) >= 4:
                meta = result[3] or {}
                return 1 + int(meta.get("collected_count", 0) or 0)
            return 1
        if provider == "coresignal" and endpoint == "member_collect":
            return 1 if result else 0
        # Default: 1 credit per call. Good enough until refined.
        return 1
    except Exception:
        return 1


def _count_returned(provider: str, endpoint: str, result: Any) -> int:
    """How many records the call returned (for the dashboard's
    avg-records-per-call column)."""
    try:
        if isinstance(result, tuple) and result and isinstance(result[0], list):
            return len(result[0])
        if isinstance(result, list):
            return len(result)
        if isinstance(result, dict):
            return 1
        return 0
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Firestore write (background thread)
# ---------------------------------------------------------------------------


def _safe_write(payload: Dict[str, Any]) -> None:
    """Background-thread Firestore write. Adds timestamp and never raises."""
    try:
        payload["timestamp"] = datetime.now(timezone.utc)
        db = get_db()
        if db is None:
            logger.debug("get_db() returned None; skipping metering write")
            return
        db.collection("provider_calls").add(payload)
    except Exception as e:  # noqa: BLE001
        logger.warning("provider_calls write failed: %s", e)


# ---------------------------------------------------------------------------
# Admin dashboard helpers (called from admin routes)
# ---------------------------------------------------------------------------


def spend_summary(days: int = 7) -> Dict[str, Any]:
    """
    Aggregate provider_calls for the last `days` days, grouped by provider
    and endpoint. Returns a dict suitable for JSON serialization.
    """
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    db = get_db()
    if db is None:
        return {"error": "firestore_unavailable", "days": days, "by_provider": {}}

    by_provider: Dict[str, Dict[str, Any]] = {}
    total_calls = 0
    total_cost = 0.0
    try:
        docs = db.collection("provider_calls").where("timestamp", ">=", cutoff).stream()
        for doc in docs:
            d = doc.to_dict() or {}
            total_calls += 1
            cost = float(d.get("est_cost_usd") or 0.0)
            total_cost += cost
            prov = d.get("provider", "unknown")
            ep = d.get("endpoint", "unknown")
            p = by_provider.setdefault(prov, {"calls": 0, "credits": 0, "cost_usd": 0.0, "by_endpoint": {}})
            p["calls"] += 1
            p["credits"] += int(d.get("credits_charged") or 0)
            p["cost_usd"] += cost
            e = p["by_endpoint"].setdefault(ep, {"calls": 0, "credits": 0, "cost_usd": 0.0})
            e["calls"] += 1
            e["credits"] += int(d.get("credits_charged") or 0)
            e["cost_usd"] += cost
    except Exception as exc:
        return {"error": f"query_failed: {exc}", "days": days, "by_provider": {}}

    # Round dollars for display
    for p in by_provider.values():
        p["cost_usd"] = round(p["cost_usd"], 4)
        for e in p["by_endpoint"].values():
            e["cost_usd"] = round(e["cost_usd"], 4)

    return {
        "days": days,
        "total_calls": total_calls,
        "total_cost_usd": round(total_cost, 4),
        "by_provider": by_provider,
    }


def spend_by_user(days: int = 7, limit: int = 25) -> Dict[str, Any]:
    """Top users by est_cost_usd over the window."""
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    db = get_db()
    if db is None:
        return {"error": "firestore_unavailable", "days": days, "users": []}

    by_user: Dict[str, Dict[str, Any]] = {}
    try:
        docs = db.collection("provider_calls").where("timestamp", ">=", cutoff).stream()
        for doc in docs:
            d = doc.to_dict() or {}
            uid = d.get("user_id") or "unknown"
            cost = float(d.get("est_cost_usd") or 0.0)
            u = by_user.setdefault(uid, {"user_id": uid, "calls": 0, "credits": 0, "cost_usd": 0.0})
            u["calls"] += 1
            u["credits"] += int(d.get("credits_charged") or 0)
            u["cost_usd"] += cost
    except Exception as exc:
        return {"error": f"query_failed: {exc}", "days": days, "users": []}

    users = sorted(by_user.values(), key=lambda x: x["cost_usd"], reverse=True)[:limit]
    for u in users:
        u["cost_usd"] = round(u["cost_usd"], 4)
    return {"days": days, "users": users}
