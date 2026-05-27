"""Perplexity Sonar API client - OpenAI-compatible wrapper.

Replaces SerpAPI for: job search, company research, person research, news.
Replaces SerpAPI+OpenAI two-step for: meeting research, firm discovery.

Uses the OpenAI SDK with base_url pointed at Perplexity's API.
All functions return dict/list and gracefully return empty results
if PERPLEXITY_API_KEY is not set or the API call fails.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from app.config import PERPLEXITY_API_KEY

logger = logging.getLogger(__name__)

# Lazy-init client singleton
_client = None


def _get_client():
    global _client
    if not PERPLEXITY_API_KEY:
        return None
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(
            api_key=PERPLEXITY_API_KEY,
            base_url="https://api.perplexity.ai",
        )
    return _client


def _extract_citations(response) -> list[str]:
    """Extract citation URLs from a Perplexity response."""
    citations = []
    if hasattr(response, "citations") and response.citations:
        citations = list(response.citations)
    return citations


def _parse_json_response(content: str) -> dict | list:
    """Try to parse JSON from response content, stripping markdown fences."""
    text = content.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return {"raw_text": content}


# ── Core search functions ────────────────────────────────────────────────


def quick_search(query: str, recency: str | None = None) -> dict:
    """Sonar - fast, cheap. Replaces single SerpAPI GoogleSearch calls.

    Args:
        query: Search query string.
        recency: Optional filter - "hour", "day", "week", "month".

    Returns:
        {"content": str, "citations": list[str]}
    """
    client = _get_client()
    if not client:
        return {"content": "", "citations": []}

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["quick", query, recency or ""]
    cached = get_cached("research", cache_key)
    if cached:
        return cached

    try:
        kwargs = {
            "model": "sonar",
            "messages": [{"role": "user", "content": query}],
        }
        if recency:
            kwargs["extra_body"] = {"search_recency_filter": recency}

        response = client.chat.completions.create(**kwargs)
        result = {
            "content": response.choices[0].message.content,
            "citations": _extract_citations(response),
        }
        set_cached("research", cache_key, result)
        return result
    except Exception:
        logger.warning("Perplexity quick_search failed", exc_info=True)
        return {"content": "", "citations": []}


def pro_search(query: str, recency: str | None = None) -> dict:
    """Sonar Pro - richer. Replaces SerpAPI + OpenAI extraction combo.

    Returns:
        {"content": str, "citations": list[str]}
    """
    client = _get_client()
    if not client:
        return {"content": "", "citations": []}

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["pro", query, recency or ""]
    cached = get_cached("research", cache_key)
    if cached:
        return cached

    try:
        kwargs = {
            "model": "sonar-pro",
            "messages": [{"role": "user", "content": query}],
        }
        if recency:
            kwargs["extra_body"] = {"search_recency_filter": recency}

        response = client.chat.completions.create(**kwargs)
        result = {
            "content": response.choices[0].message.content,
            "citations": _extract_citations(response),
        }
        set_cached("research", cache_key, result)
        return result
    except Exception:
        logger.warning("Perplexity pro_search failed", exc_info=True)
        return {"content": "", "citations": []}


def deep_research(query: str) -> dict:
    """Sonar Deep Research - comprehensive multi-source report.
    Replaces 4x SerpAPI calls in meeting.py.

    Returns:
        {"content": str, "citations": list[str]}
    """
    client = _get_client()
    if not client:
        return {"content": "", "citations": []}

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["deep", query]
    cached = get_cached("research", cache_key)
    if cached:
        return cached

    try:
        response = client.chat.completions.create(
            model="sonar-deep-research",
            messages=[{"role": "user", "content": query}],
        )
        result = {
            "content": response.choices[0].message.content,
            "citations": _extract_citations(response),
        }
        set_cached("research", cache_key, result)
        return result
    except Exception:
        logger.warning("Perplexity deep_research failed", exc_info=True)
        return {"content": "", "citations": []}


# ── Agent-specific functions ─────────────────────────────────────────────


def search_jobs_live(
    query: str,
    location: str,
    limit: int = 10,
    domain_filter: list[str] | None = None,
) -> list[dict]:
    """Search for live job postings. Replaces SerpAPI google_jobs engine.

    Returns list of dicts with: title, company, location, url, summary.
    """
    client = _get_client()
    if not client:
        return []

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["jobs", query, location, str(limit)]
    cached = get_cached("job_search", cache_key)
    if cached and isinstance(cached, list):
        return cached

    domains = domain_filter or [
        "linkedin.com", "greenhouse.io", "lever.co",
        "workday.com", "indeed.com",
    ]
    domain_str = ", ".join(domains)

    prompt = (
        f"Find {limit} current job openings matching: {query} in {location}. "
        f"Only include postings from these domains: {domain_str}. "
        f"For each job return: title, company name, location, URL to the posting, "
        f"and a brief summary. Return as a JSON array of objects with keys: "
        f"title, company, location, url, summary."
    )

    try:
        response = client.chat.completions.create(
            model="sonar",
            messages=[{"role": "user", "content": prompt}],
            extra_body={"search_recency_filter": "month"},
        )
        content = response.choices[0].message.content
        parsed = _parse_json_response(content)

        if isinstance(parsed, list):
            jobs = parsed[:limit]
        elif isinstance(parsed, dict) and "jobs" in parsed:
            jobs = parsed["jobs"][:limit]
        else:
            jobs = []

        if jobs:
            set_cached("job_search", cache_key, jobs)
        return jobs
    except Exception:
        logger.warning("Perplexity search_jobs_live failed", exc_info=True)
        return []


def discover_companies_live(
    industries: list[str],
    locations: list[str],
    roles: list[str],
    similar_to: list[str],
    university: str = "",
    career_track: str = "",
) -> list[dict]:
    """Discover companies actively hiring. Replaces static recommendation engine.

    Returns list of dicts with: name, website, industry, reason, recent_news, hiring_signal.
    """
    client = _get_client()
    if not client:
        return []

    from app.services.enrichment_cache import get_cached, set_cached
    similar_str = ", ".join(similar_to[:5]) if similar_to else "top firms"
    industry_str = ", ".join(industries[:3]) if industries else "various industries"
    location_str = ", ".join(locations[:3]) if locations else "major US cities"
    role_str = ", ".join(roles[:3]) if roles else "entry-level roles"

    cache_key = ["companies", industry_str, location_str, role_str, similar_str]
    cached = get_cached("firm_discovery", cache_key)
    if cached and isinstance(cached, list):
        return cached

    prompt = (
        f"Find 10 companies in {industry_str} in or near {location_str} "
        f"that are actively hiring for {role_str}. "
        f"Similar to companies like {similar_str}. "
        f"Include companies that have recently raised funding, expanded, "
        f"or are known for strong entry-level programs. "
        f"For each, provide: name, website, industry, why it's a good target, "
        f"and any recent news. "
        f"Return as a JSON object with a 'companies' array, each with keys: "
        f"name, website, industry, reason, recent_news, hiring_signal."
    )

    try:
        response = client.chat.completions.create(
            model="sonar-pro",
            messages=[{"role": "user", "content": prompt}],
        )
        content = response.choices[0].message.content
        parsed = _parse_json_response(content)

        if isinstance(parsed, dict) and "companies" in parsed:
            companies = parsed["companies"]
        elif isinstance(parsed, list):
            companies = parsed
        else:
            companies = []

        if companies:
            set_cached("firm_discovery", cache_key, companies)
        return companies
    except Exception:
        logger.warning("Perplexity discover_companies_live failed", exc_info=True)
        return []


def batch_enrich_contacts(contacts: list[dict]) -> dict[int, dict]:
    """Enrich contacts with real-time web data.

    Uses shared cache so the same person isn't researched twice across users.

    Returns dict keyed by index: {talking_points, recent_activity, verified_role, citations}.
    """
    client = _get_client()
    if not client:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached
    results = {}

    for idx, contact in enumerate(contacts):
        name = f"{contact.get('FirstName', '')} {contact.get('LastName', '')}".strip()
        company = (contact.get("Company") or contact.get("company") or "").strip()
        title = (contact.get("Title") or contact.get("jobTitle") or "").strip()

        if not name or not company:
            results[idx] = {}
            continue

        cache_key = ["contact", name.lower(), company.lower()]
        cached = get_cached("contact_enrichment", cache_key)
        if cached:
            results[idx] = cached
            continue

        try:
            response = client.chat.completions.create(
                model="sonar",
                messages=[{
                    "role": "user",
                    "content": (
                        f"Brief professional profile of {name}, {title} at {company}. "
                        f"What have they published, presented, or been mentioned in recently? "
                        f"What are their professional interests? Is this their current role? "
                        f"Keep it to 3-4 bullet points."
                    ),
                }],
            )
            content = response.choices[0].message.content
            talking_points = _parse_bullet_points(content)

            enrichment = {
                "talking_points": talking_points,
                "recent_activity": content,
                "verified_role": "current" in content.lower(),
                "citations": _extract_citations(response),
            }
            results[idx] = enrichment
            set_cached("contact_enrichment", cache_key, enrichment)
        except Exception:
            logger.warning("Perplexity enrichment failed for %s", name, exc_info=True)
            results[idx] = {}

    return results


def verify_hiring_managers(
    hms: list[dict],
    company: str,
    job_title: str,
) -> list[dict]:
    """Verify hiring managers are still active at the company.

    Returns list of dicts with: verified (bool), active_roles, recent_post, confidence.
    """
    client = _get_client()
    if not client:
        return [{"verified": True} for _ in hms]

    from app.services.enrichment_cache import get_cached, set_cached
    results = []

    for hm in hms:
        name = f"{hm.get('FirstName', '')} {hm.get('LastName', '')}".strip()
        if not name:
            results.append({"verified": True})
            continue

        cache_key = ["hm_verify", name.lower(), company.lower()]
        cached = get_cached("hiring_verification", cache_key)
        if cached:
            results.append(cached)
            continue

        try:
            response = client.chat.completions.create(
                model="sonar",
                messages=[{
                    "role": "user",
                    "content": (
                        f"Is {name} currently at {company}? "
                        f"Are they actively hiring for {job_title} or similar roles? "
                        f"Any recent LinkedIn posts about open positions? "
                        f"Answer briefly with: still at company (yes/no), active roles, "
                        f"any recent hiring activity."
                    ),
                }],
            )
            content = response.choices[0].message.content.lower()
            verification = {
                "verified": "no" not in content.split(".")[0] if content else True,
                "active_roles": [],
                "recent_post": "",
                "confidence": "medium",
                "raw": response.choices[0].message.content,
            }
            set_cached("hiring_verification", cache_key, verification)
            results.append(verification)
        except Exception:
            logger.warning("HM verification failed for %s", name, exc_info=True)
            results.append({"verified": True})

    return results


def get_company_news_brief(
    company: str,
    timeframe: str = "week",
) -> list[str]:
    """Get recent company news for follow-up hooks.

    Returns list of news summary strings.
    """
    client = _get_client()
    if not client:
        return []

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["news", company.lower(), timeframe]
    cached = get_cached("company_news", cache_key)
    if cached and isinstance(cached, list):
        return cached

    recency_map = {"day": "day", "week": "week", "month": "month"}
    recency = recency_map.get(timeframe, "week")

    try:
        response = client.chat.completions.create(
            model="sonar",
            messages=[{
                "role": "user",
                "content": (
                    f"What are the top 3-5 recent news items about {company}? "
                    f"Focus on: deals, hiring, leadership changes, funding, partnerships. "
                    f"Return each as a single sentence."
                ),
            }],
            extra_body={"search_recency_filter": recency},
        )
        content = response.choices[0].message.content
        news_items = _parse_bullet_points(content)
        if news_items:
            set_cached("company_news", cache_key, news_items)
        return news_items
    except Exception:
        logger.warning("Company news fetch failed for %s", company, exc_info=True)
        return []


def get_market_context(
    target_companies: list[str],
    target_industries: list[str],
) -> dict:
    """Pre-planning intelligence for the agent planner.

    Returns dict with hiring_intel and cycle_intel.
    """
    client = _get_client()
    if not client:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached
    companies_str = ", ".join(target_companies[:5]) if target_companies else ""
    industries_str = ", ".join(target_industries[:3]) if target_industries else ""
    cache_key = ["market", companies_str.lower(), industries_str.lower()]
    cached = get_cached("market_context", cache_key)
    if cached:
        return cached

    context = {}

    try:
        if target_companies:
            resp = client.chat.completions.create(
                model="sonar",
                messages=[{
                    "role": "user",
                    "content": (
                        f"Are {companies_str} actively hiring entry-level roles right now? "
                        f"Any hiring freezes, layoffs, or expansion announcements "
                        f"in the last month? Brief summary."
                    ),
                }],
                extra_body={"search_recency_filter": "month"},
            )
            context["hiring_intel"] = resp.choices[0].message.content

        if target_industries:
            resp = client.chat.completions.create(
                model="sonar",
                messages=[{
                    "role": "user",
                    "content": (
                        f"What is the current recruiting timeline for {industries_str}? "
                        f"Are applications open? When do interviews typically happen? "
                        f"Brief summary for a college student."
                    ),
                }],
            )
            context["cycle_intel"] = resp.choices[0].message.content

        if context:
            set_cached("market_context", cache_key, context)
        return context
    except Exception:
        logger.warning("Market context fetch failed", exc_info=True)
        return {}


# ── Helpers ──────────────────────────────────────────────────────────────


def _parse_bullet_points(text: str) -> list[str]:
    """Parse bullet points or numbered items from text."""
    if not text:
        return []
    lines = text.strip().split("\n")
    points = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Strip bullet markers
        for prefix in ("- ", "* ", "• "):
            if line.startswith(prefix):
                line = line[len(prefix):]
                break
        # Strip numbered markers like "1. " or "1) "
        if len(line) > 2 and line[0].isdigit() and line[1] in (".", ")"):
            line = line[2:].strip()
        elif len(line) > 3 and line[:2].isdigit() and line[2] in (".", ")"):
            line = line[3:].strip()
        if line:
            points.append(line)
    return points
