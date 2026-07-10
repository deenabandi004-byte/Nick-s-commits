"""Scout execute actions: find contacts and pull company intel from chat.

Powers "find me 3 software engineers at Spotify" (and the one-beat chain
"...and email them") without leaving the panel. Both wrap the MCP tool
pipelines, which already carry the guardrails Scout needs:

- find_contacts: tier caps, shared result cache, credit deduction
  (5 credits per contact returned), PDL search + warmth scoring, and
  persistence into users/{uid}/contacts so My Network, the Inbox, and
  draft_outreach_emails all see the same saved contacts.
- get_company_intel: cached company overview + recruiting signals +
  alumni density, free.

Returns are compact envelopes the LLM reports verbatim; failures return a
structured `code` instead of raising.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Attribution string for MCP rate-limit/event logs. Authed callers are
# rate-limited by uid, so this is a label, not an identity.
_SCOUT_IP_HASH = "scout-chat"

_MAX_CONTACTS = 10


def _db():
    try:
        from app.extensions import get_db
        return get_db()
    except Exception:
        return None


def _user_ctx(uid: str, tier: Optional[str]) -> Dict[str, Any]:
    return {"uid": uid, "tier": (tier or "free").lower(), "scope": "scout"}


def find_contacts_for_chat(
    uid: str,
    tier: Optional[str],
    company: str,
    role: str = "",
    school: str = "",
    location: str = "",
    count: int = 5,
) -> Dict[str, Any]:
    """Run a live people search and save the results to My Network.

    Same pipeline as the Claude-MCP find_contacts tool: costs 5 credits per
    contact returned, clamped to the tier's per-search cap. Company is
    optional: industry-wide searches ("IB analysts in LA from USC") work
    with just role/school, optionally narrowed by location.
    """
    empty = {"count": 0, "contacts": []}
    if not uid:
        return {**empty, "error": "sign in required", "code": "AUTH_REQUIRED"}
    company = (company or "").strip()
    role = (role or "").strip()
    school = (school or "").strip()
    location = (location or "").strip()
    if not company and not role and not school:
        return {
            **empty,
            "error": "need a company, role, or school to search on",
            "code": "BAD_REQUEST",
        }
    db = _db()
    if db is None:
        return {**empty, "error": "database unavailable", "code": "UNAVAILABLE"}

    try:
        count = max(1, min(int(count or 5), _MAX_CONTACTS))
    except (TypeError, ValueError):
        count = 5

    args: Dict[str, Any] = {"company": company, "count": count}
    if role:
        args["role"] = role
    if school:
        args["school"] = school
    if location:
        args["location"] = location

    try:
        from app.mcp_server.tools.find_contacts import handle
        raw = handle(
            args=args, ip_hash=_SCOUT_IP_HASH, db=db,
            user_ctx=_user_ctx(uid, tier),
        )
    except Exception as e:
        logger.warning("[ScoutContacts] find_contacts failed: %s", e)
        return {**empty, "error": "contact search failed", "code": "INTERNAL"}

    if not isinstance(raw, dict):
        return {**empty, "error": "contact search failed", "code": "INTERNAL"}
    if raw.get("error"):
        return {**empty, "error": str(raw.get("error")), "code": "BAD_REQUEST"}

    paywall = raw.get("paywall")
    contacts = [
        {
            "name": c.get("name") or "",
            "title": c.get("title") or "",
            "company": c.get("company") or company,
            "linkedin_url": c.get("linkedin_url") or "",
            "email": c.get("email") or "",
            "warmth": c.get("warmth") or "",
            "personalization_hook": c.get("personalization_hook") or "",
        }
        for c in (raw.get("contacts") or [])
        if isinstance(c, dict)
    ]
    if not contacts and paywall:
        # The pipeline's paywall on an authed caller means credits ran out
        # (rate/budget caps surface the same way; the note says which).
        return {
            **empty,
            "error": str(raw.get("note") or "not enough credits for this search"),
            "code": "INSUFFICIENT_CREDITS",
        }

    result: Dict[str, Any] = {
        "count": len(contacts),
        "contacts": contacts,
        "company": company,
        "saved_to_network": bool(contacts),
        "credits_charged": 5 * len(contacts),
    }
    if raw.get("note"):
        result["note"] = str(raw.get("note"))
    return result


def company_intel_for_chat(
    uid: str,
    tier: Optional[str],
    company: str,
    user_school: str = "",
    career_field: str = "",
) -> Dict[str, Any]:
    """Company overview + recruiting signals + alumni density, in chat. Free."""
    if not (company or "").strip():
        return {"error": "company required", "code": "BAD_REQUEST"}
    db = _db()
    if db is None:
        return {"error": "database unavailable", "code": "UNAVAILABLE"}

    args: Dict[str, Any] = {"company": company.strip()}
    if (user_school or "").strip():
        args["user_school"] = user_school.strip()
    if (career_field or "").strip():
        args["career_field"] = career_field.strip()

    try:
        from app.mcp_server.tools.get_company_intel import handle
        raw = handle(
            args=args, ip_hash=_SCOUT_IP_HASH, db=db,
            user_ctx=_user_ctx(uid, tier) if uid else None,
        )
    except Exception as e:
        logger.warning("[ScoutContacts] get_company_intel failed: %s", e)
        return {"error": "company research failed", "code": "INTERNAL"}

    if not isinstance(raw, dict):
        return {"error": "company research failed", "code": "INTERNAL"}
    if raw.get("error"):
        return {"error": str(raw.get("error")), "code": "BAD_REQUEST"}

    # Trim to what the model needs to answer well; drop paywall plumbing.
    return {
        "company": raw.get("company") or company,
        "overview": raw.get("overview") or {},
        "recent_news": (raw.get("recent_news") or [])[:5],
        "recruiting_signals": raw.get("recruiting_signals") or {},
        "divisions": (raw.get("divisions") or [])[:8],
        "alumni_at_your_school": raw.get("alumni_at_your_school"),
    }
