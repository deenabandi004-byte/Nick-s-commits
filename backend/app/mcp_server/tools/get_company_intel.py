"""
get_company_intel MCP tool.

Composes existing services: enrich_company_profile_live (overview),
get_company_news_brief (recent news), get_market_context (recruiting
signals), school_affinity.get_school_affinity (alumni density), and
company_signals/{slug} Firestore lookup (discovery score).

Cache is split into two TTL tiers:

  stable bucket  (30 days)
    overview, divisions, alumni_at_your_school, discovery_score
    These rarely change. A firm's HQ, industry mix, and alumni count
    drift on quarter-plus timescales.

  fresh bucket   (7 days)
    recent_news, recruiting_signals
    These are the "what's happening this week" surface. News goes
    stale fast.

On read we merge both buckets. If only the fresh bucket is expired,
we re-fetch just the Perplexity news + market calls. If the stable
bucket is expired, we re-fetch everything because the alumni lookup
shares the school_affinity call path.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Optional

from app.mcp_server.cache import MCPCache
from app.mcp_server.events import MCPEvents
from app.mcp_server.rate_limit import MCPRateLimit
from app.mcp_server.responses import build_paywall
from app.mcp_server.schemas import (
    AlumniAtSchool,
    CompanyOverview,
    GetCompanyIntelInput,
    GetCompanyIntelOutput,
    RecruitingSignals,
)

logger = logging.getLogger(__name__)


TOOL_NAME = "get_company_intel"
STABLE_CACHE_TTL = 30 * 24 * 3600  # overview, alumni, discovery_score
FRESH_CACHE_TTL = 7 * 24 * 3600    # news, recruiting_signals

# Distinct cache "tools" so the two buckets get distinct doc IDs even
# for identical input args.
_STABLE_KEY = "get_company_intel:stable"
_FRESH_KEY = "get_company_intel:fresh"


def handle(
    *,
    args: dict,
    ip_hash: str,
    db: Any,
    user_ctx: dict | None = None,
) -> dict:
    started = time.monotonic()
    cache = MCPCache(db)
    limiter = MCPRateLimit(db)
    events = MCPEvents(db)

    try:
        parsed = GetCompanyIntelInput.model_validate(args)
    except Exception as e:
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash="",
            error=f"input_validation: {e}",
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return {"error": "invalid input", "details": str(e)}

    cache_args = parsed.model_dump()
    args_hash = cache.key(TOOL_NAME, cache_args)

    # Per-identity hour cap (anti-scraper only; this tool is otherwise unlimited).
    from app.mcp_server.tier_caps import rate_limit_identity
    rl = limiter.check_and_increment(
        rate_limit_identity(user_ctx, ip_hash), TOOL_NAME, user_ctx=user_ctx,
    )
    if not rl.ok:
        merged = _read_merged_cache(cache, cache_args)
        paywall = build_paywall(
            TOOL_NAME, ip_hash,
            hit_cap_type=rl.hit_cap_type or "hour",
            retry_after_seconds=rl.retry_after_seconds,
            message="You're querying fast. Sign up free to lift the hourly cap.",
        )
        if merged is not None:
            merged["cached"] = True
            out = GetCompanyIntelOutput.model_validate(merged)
            out.paywall = paywall
            events.log(
                tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
                cache_hit=True, paywall_shown=True,
                claim_token=_token_from_url(paywall.claim_url),
                duration_ms=int((time.monotonic() - started) * 1000),
            )
            return out.model_dump()
        out = _empty_output(parsed, paywall)
        events.log(
            tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
            paywall_shown=True,
            claim_token=_token_from_url(paywall.claim_url),
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        return out.model_dump()

    stable = cache.get(_STABLE_KEY, cache_args)
    fresh = cache.get(_FRESH_KEY, cache_args)

    fully_cached = stable is not None and fresh is not None

    # Compute or refresh whichever bucket is missing. Gate cache writes on
    # the bucket actually containing data so a Perplexity blip or unknown
    # company doesn't lock a useless empty stable+fresh pair into the
    # cache for 30 days.
    if stable is None:
        stable = _build_stable(parsed, db)
        if _stable_has_content(stable):
            cache.set(_STABLE_KEY, cache_args, stable, STABLE_CACHE_TTL)
    if fresh is None:
        fresh = _build_fresh(parsed)
        if _fresh_has_content(fresh):
            cache.set(_FRESH_KEY, cache_args, fresh, FRESH_CACHE_TTL)

    out = _merge_to_output(parsed, stable, fresh, cached=fully_cached)
    events.log(
        tool=TOOL_NAME, ip_hash=ip_hash, args_hash=args_hash,
        cache_hit=fully_cached,
        duration_ms=int((time.monotonic() - started) * 1000),
    )
    return out.model_dump()


# ── Bucket builders ──────────────────────────────────────────────────────────


def _build_stable(parsed: GetCompanyIntelInput, db: Any) -> dict:
    """The 30-day bucket: overview + divisions + alumni density + discovery."""
    overview = _fetch_company_profile(parsed.company)
    alumni = _fetch_alumni_density(parsed.user_school, parsed.career_field, parsed.company)
    discovery = _fetch_discovery_score(db, parsed.company)
    return {
        "overview": overview,
        "divisions": [],  # v1: no live source; companies.ts seed bridge is v1.1
        "alumni_at_your_school": alumni.model_dump() if alumni is not None else None,
        "discovery_score": discovery,
    }


def _build_fresh(parsed: GetCompanyIntelInput) -> dict:
    """The 7-day bucket: recent news + recruiting signals."""
    news = _fetch_news(parsed.company)
    # Re-derive industries from a cheap second profile read is wasteful;
    # the stable bucket already has industries cached, but on a cold
    # fresh-only refresh we don't have it in hand. Falling back to []
    # is fine because get_market_context already gracefully degrades.
    signals = _fetch_market_context(parsed.company, [])
    return {
        "recent_news": news,
        "recruiting_signals": signals,
    }


def _read_merged_cache(cache: MCPCache, cache_args: dict) -> Optional[dict]:
    """Read both buckets and merge to a single payload dict, if both hit."""
    stable = cache.get(_STABLE_KEY, cache_args)
    fresh = cache.get(_FRESH_KEY, cache_args)
    if stable is None and fresh is None:
        return None
    return _merge_dicts(stable or {}, fresh or {})


def _merge_dicts(stable: dict, fresh: dict) -> dict:
    out = {}
    out.update(stable)
    out.update(fresh)
    return out


def _merge_to_output(
    parsed: GetCompanyIntelInput,
    stable: dict,
    fresh: dict,
    *,
    cached: bool,
) -> GetCompanyIntelOutput:
    overview_dict = stable.get("overview") or {}
    industries = overview_dict.get("industries") or []
    signals = fresh.get("recruiting_signals") or {}
    return GetCompanyIntelOutput(
        company=parsed.company,
        overview=CompanyOverview(
            description=overview_dict.get("description"),
            headquarters=overview_dict.get("headquarters"),
            industries=industries if isinstance(industries, list) else [],
            culture_keywords=overview_dict.get("culture_keywords") or [],
        ),
        recent_news=fresh.get("recent_news") or [],
        recruiting_signals=RecruitingSignals(
            hiring_momentum=overview_dict.get("hiring_signal") or signals.get("hiring_intel"),
            cycle_intel=signals.get("cycle_intel"),
        ),
        divisions=stable.get("divisions") or [],
        alumni_at_your_school=_alumni_from_dict(stable.get("alumni_at_your_school")),
        discovery_score=stable.get("discovery_score"),
        cached=cached,
    )


def _alumni_from_dict(d: Optional[dict]) -> Optional[AlumniAtSchool]:
    if not d:
        return None
    return AlumniAtSchool.model_validate(d)


# ── External calls (each independently guarded) ──────────────────────────────


def _fetch_company_profile(company: str) -> dict:
    from app.services import perplexity_client
    try:
        return perplexity_client.enrich_company_profile_live(company) or {}
    except Exception as e:
        logger.warning("[MCP get_company_intel] enrich_company_profile_live failed: %s", e)
        return {}


def _fetch_news(company: str) -> list[str]:
    from app.services import perplexity_client
    try:
        return (perplexity_client.get_company_news_brief(company, timeframe="week") or [])[:5]
    except Exception as e:
        logger.warning("[MCP get_company_intel] get_company_news_brief failed: %s", e)
        return []


def _fetch_market_context(company: str, industries: list[str]) -> dict:
    from app.services import perplexity_client
    try:
        return perplexity_client.get_market_context([company], industries[:3]) or {}
    except Exception as e:
        logger.warning("[MCP get_company_intel] get_market_context failed: %s", e)
        return {}


def _fetch_alumni_density(
    school: Optional[str],
    field: Optional[str],
    company: str,
) -> Optional[AlumniAtSchool]:
    if not school:
        return None
    field_norm = (field or "general").strip().lower()
    try:
        from app.services.school_affinity import get_school_affinity
        results = get_school_affinity(school, field_norm) or []
    except Exception as e:
        logger.warning("[MCP get_company_intel] school_affinity failed: %s", e)
        return None

    target = (company or "").strip().lower()
    if not target:
        return None
    for entry in results:
        name = (entry.get("company_name") or "").strip().lower()
        if name == target or target in name or name in target:
            return AlumniAtSchool(
                school=school,
                count=int(entry.get("alumni_count") or 0),
                field=field_norm,
            )
    return AlumniAtSchool(school=school, count=0, field=field_norm)


def _slugify(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def _fetch_discovery_score(db: Any, company: str) -> Optional[int]:
    if db is None:
        return None
    try:
        doc = db.collection("company_signals").document(_slugify(company)).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        val = data.get("discovery_score")
        return int(val) if val is not None else None
    except Exception:
        return None


def _empty_output(parsed: GetCompanyIntelInput, paywall) -> GetCompanyIntelOutput:
    return GetCompanyIntelOutput(
        company=parsed.company,
        overview=CompanyOverview(),
        recent_news=[],
        recruiting_signals=RecruitingSignals(),
        divisions=[],
        alumni_at_your_school=None,
        discovery_score=None,
        cached=False,
        paywall=paywall,
    )


def _token_from_url(url: str) -> Optional[str]:
    if not url or "token=" not in url:
        return None
    return url.split("token=", 1)[1].split("&", 1)[0]


def _stable_has_content(stable: dict) -> bool:
    """The stable bucket is worth caching when we have an overview blurb
    OR an alumni density count OR divisions. A bucket with all of those
    null/empty is a failed Perplexity/PDL fetch — caching it would lock
    out the next 30 days of attempts."""
    if not isinstance(stable, dict):
        return False
    overview = stable.get("overview") or {}
    if overview.get("description") or overview.get("headquarters"):
        return True
    if stable.get("divisions"):
        return True
    if stable.get("alumni_at_your_school"):
        return True
    if stable.get("discovery_score") is not None:
        return True
    return False


def _fresh_has_content(fresh: dict) -> bool:
    """The fresh bucket is worth caching when we have news items OR a
    hiring momentum signal."""
    if not isinstance(fresh, dict):
        return False
    if fresh.get("recent_news"):
        return True
    signals = fresh.get("recruiting_signals") or {}
    if signals.get("hiring_momentum") or signals.get("cycle_intel"):
        return True
    return False
