"""Scout execute action: discover companies from chat.

Powers "find 10 smaller telecom startups on the west coast" without leaving
the panel. Wraps the same pipeline as the Companies tab
(/api/firm-search/search): natural language parse, live search, tier batch
cap, CREDITS_PER_FIRM per company returned, and persistence into
users/{uid}/firmSearches so the Companies tab history shows the run.

Returns are compact envelopes the LLM reports verbatim; failures return a
structured `code` instead of raising.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_DEFAULT_COUNT = 10


def _db():
    try:
        from app.extensions import get_db
        return get_db()
    except Exception:
        return None


def _trim_firm(firm: Dict[str, Any]) -> Dict[str, Any]:
    """Compact one firm to what the model needs to present it well."""
    location = firm.get("location")
    display = ""
    if isinstance(location, dict):
        display = str(location.get("display") or "")
    elif location:
        display = str(location)
    return {
        "name": firm.get("name") or "",
        "industry": firm.get("industry") or "",
        "location": display,
        "size": firm.get("sizeBucket") or "",
        "employee_count": firm.get("employeeCount"),
        "website": firm.get("website") or "",
        "founded": firm.get("founded"),
    }


def discover_companies_for_chat(
    uid: str,
    tier: Optional[str],
    query: str,
    count: int = _DEFAULT_COUNT,
) -> Dict[str, Any]:
    """Run a live company discovery search and save it to history.

    Mirrors the /api/firm-search/search guard sequence: tier batch cap,
    upfront credit check, search, charge for actual results only, save to
    users/{uid}/firmSearches.
    """
    empty = {"count": 0, "companies": []}
    if not uid:
        return {**empty, "error": "sign in required", "code": "AUTH_REQUIRED"}
    query = (query or "").strip()
    if not query:
        return {**empty, "error": "search query required", "code": "BAD_REQUEST"}
    db = _db()
    if db is None:
        return {**empty, "error": "database unavailable", "code": "UNAVAILABLE"}

    from app.routes.firm_search import (
        CREDITS_PER_FIRM,
        company_batch_cap_for_tier,
        save_search_to_history,
    )
    from app.services.auth import check_and_reset_credits, deduct_credits_atomic
    from app.services.company_search import search_firms

    tier_cap = company_batch_cap_for_tier((tier or "free").lower())
    try:
        count = max(1, min(int(count or _DEFAULT_COUNT), tier_cap))
    except (TypeError, ValueError):
        count = min(_DEFAULT_COUNT, tier_cap)

    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        return {**empty, "error": "account not found", "code": "AUTH_REQUIRED"}
    user_data = user_doc.to_dict() or {}
    credits_available = check_and_reset_credits(user_ref, user_data)
    if credits_available < CREDITS_PER_FIRM:
        return {
            **empty,
            "error": (
                f"needs at least {CREDITS_PER_FIRM} credits, "
                f"only {credits_available} available"
            ),
            "code": "INSUFFICIENT_CREDITS",
        }
    count = min(count, credits_available // CREDITS_PER_FIRM)

    try:
        result = search_firms(query, limit=count) or {}
    except Exception as e:
        logger.warning("[ScoutCompanies] search_firms failed: %s", e)
        return {**empty, "error": "company search failed", "code": "INTERNAL"}

    if not result.get("success"):
        error_msg = str(result.get("error") or "company search failed")
        if ("Missing required fields" in error_msg
                or "Failed to understand" in error_msg):
            return {**empty, "error": error_msg, "code": "BAD_REQUEST"}
        return {**empty, "error": error_msg, "code": "INTERNAL"}

    firms = result.get("firms") or []
    if not firms:
        # Nothing matched: no charge, the model reports it honestly.
        return {**empty, "query": query}

    # Largest firms first, mirroring the Companies tab ordering.
    firms.sort(
        key=lambda f: f.get("employeeCount") if f.get("employeeCount") is not None else 0,
        reverse=True,
    )

    charged = CREDITS_PER_FIRM * len(firms)
    success, _balance = deduct_credits_atomic(uid, charged, "firm_search")
    if not success:
        return {**empty, "error": "insufficient credits", "code": "INSUFFICIENT_CREDITS"}

    history_id = save_search_to_history(
        uid=uid,
        query=query,
        parsed_filters=result.get("parsedFilters") or {},
        results=firms,
    )

    envelope: Dict[str, Any] = {
        "count": len(firms),
        "companies": [_trim_firm(f) for f in firms],
        "query": query,
        "credits_charged": charged,
        "saved_to_history": bool(history_id),
    }
    if result.get("partial") and result.get("error"):
        envelope["note"] = str(result["error"])
    return envelope
