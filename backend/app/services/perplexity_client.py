"""Perplexity Sonar API client — OpenAI-compatible wrapper.

Replaces SerpAPI for: job search, company research, person research, news.
Replaces SerpAPI+OpenAI two-step for: coffee chat research, firm discovery.

Uses the OpenAI SDK with base_url pointed at Perplexity's API.
All functions return dict/list and gracefully return empty results
if PERPLEXITY_API_KEY is not set or the API call fails.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Optional

from app.config import PERPLEXITY_API_KEY

logger = logging.getLogger(__name__)

# Lazy-init client singleton
_client = None

# Structured-output schema for verify_hiring_managers_v2.
# Module-level so Perplexity warms it once per process (first request with a
# new schema incurs a 10-30s prep delay per their structured-outputs docs).
_HM_VERIFY_SCHEMA = {
    "name": "hm_verification",
    "schema": {
        "type": "object",
        "properties": {
            "still_at_company": {"type": "string", "enum": ["yes", "no", "unknown"]},
            "current_title": {"type": "string"},
            "actively_hiring": {"type": "string", "enum": ["yes", "no", "unknown"]},
            "recent_hiring_signal": {"type": "string"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        },
        "required": [
            "still_at_company",
            "current_title",
            "actively_hiring",
            "recent_hiring_signal",
            "confidence",
        ],
        "additionalProperties": False,
    },
}


def _chat_with_retry(client, **kwargs):
    """Wrap a chat.completions.create call with exponential backoff on 429s.

    Sonar-pro is typically capped at 50 req/min — bursts during cron cycle
    dispatch can briefly exceed that. 3 attempts with 2/4/8 second waits.
    """
    last_exc = None
    for attempt in range(3):
        try:
            return client.chat.completions.create(**kwargs)
        except Exception as e:
            last_exc = e
            status = getattr(getattr(e, "response", None), "status_code", None) or getattr(e, "status_code", None)
            name = e.__class__.__name__.lower()
            if status == 429 or "rate" in name or "ratelimit" in name:
                if attempt < 2:
                    time.sleep(2 ** (attempt + 1))
                    continue
            raise
    if last_exc:
        raise last_exc


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


# Hedging phrases Perplexity returns when it can't find recent news but doesn't
# obey the "reply NONE" instruction. Any bullet containing one of these is
# filler, not signal — drop before injecting into outreach prompts.
_HEDGE_PATTERNS = (
    "no major", "closest notable", "outside the requested",
    "i can't verify", "i cannot verify", "not a major",
    "the result only confirms", "no specific", "could not find",
    "couldn't find", "no announcement", "no notable", "no recent",
    "no search results", "no direct evidence", "unable to verify",
)


def _is_hedging_bullet(item: str) -> bool:
    """True if a news bullet is hedging language rather than a concrete fact."""
    if not isinstance(item, str):
        return True
    return any(p in item.lower() for p in _HEDGE_PATTERNS)


# ── Core search functions ────────────────────────────────────────────────


def quick_search(query: str, recency: str | None = None) -> dict:
    """Sonar — fast, cheap. Replaces single SerpAPI GoogleSearch calls.

    Args:
        query: Search query string.
        recency: Optional filter — "hour", "day", "week", "month".

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
        extra = {}
        if recency:
            extra["search_recency_filter"] = recency
        if extra:
            kwargs["extra_body"] = extra

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


def pro_search(query: str, recency: str | None = None, timeout: float = 45.0) -> dict:
    """Sonar Pro — richer. Replaces SerpAPI + OpenAI extraction combo.

    `timeout` caps the HTTP call so a slow Sonar response can't stall a
    caller indefinitely (the OpenAI SDK defaults to 600s). On timeout the
    call raises, is caught below, and returns empty content so callers
    degrade gracefully rather than hang.

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
        extra = {}
        if recency:
            extra["search_recency_filter"] = recency
        if extra:
            kwargs["extra_body"] = extra

        response = client.with_options(timeout=timeout, max_retries=1).chat.completions.create(**kwargs)
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
    """Sonar-pro comprehensive research. Replaces 4x SerpAPI calls in coffee_chat.py.

    Originally used `sonar-deep-research`, but that model is a multi-step
    research agent that routinely runs 2-5+ minutes per call and hung the
    coffee-chat-prep flow at Step 2. `sonar-pro` returns the same shape in
    ~5-15s with citations and is sufficient for the 4 short prep sections.

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
        # Hard 30s cap, zero SDK retries: this runs in the user-facing
        # coffee-chat-prep flow, so a slow Perplexity response should fall
        # through to empty results rather than block the UI for minutes.
        response = client.with_options(timeout=30.0, max_retries=0).chat.completions.create(
            model="sonar-pro",
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

    # Three things matter for quality here:
    # 1. NO domain whitelist in the prompt. The old list excluded every FAANG
    #    careers system (jobs.apple.com, careers.google.com, etc.) so niche
    #    queries at big-tech targets came back empty — and Sonar would then
    #    hallucinate a placeholder to satisfy the "find N" instruction.
    # 2. Empty-on-miss instruction. Without "return [] if nothing matches",
    #    the LLM invents a generic "Job Posting" row pointing at the company's
    #    careers landing page rather than admitting zero results.
    # 3. URL-shape instruction. A real posting has a job ID; a careers search
    #    page does not. Telling the model to skip landing/search pages weeds
    #    out the most common placeholder pattern at source.
    # Caller-supplied domain_filter is still honored if explicitly passed —
    # via Perplexity's actual API param, not as a soft prompt hint.
    prompt = (
        f"Find up to {limit} SPECIFIC current job postings matching: {query} "
        f"in {location}. Each result MUST be a concrete posting with its own "
        f"unique URL (a job ID in the path). Do NOT return careers landing "
        f"pages, search-result pages, or generic placeholders. If you cannot "
        f"find any real specific postings, return an empty JSON array. "
        f"For each job return: title (the actual role title — never "
        f"'Job Posting' or similar generic text), company name, location, "
        f"URL to the specific posting, and a brief summary. Return as a JSON "
        f"array of objects with keys: title, company, location, url, summary."
    )

    # `year` recency, not `month`. Diagnostic runs (scratch_diag_perplexity_jobs.py
    # on 2026-06-11) showed Sonar returns a literal empty array on ~half of
    # niche-role calls under `month`, but consistently returns 3-5 real
    # postings under `year`. FAANG/big-co job postings sit open for weeks to
    # months, so a 30-day window was buying nothing real and was doubling our
    # flake rate. The placeholder validator + URL-shape prompt still filter
    # out stale/closed postings at the boundary.
    extra: dict = {"search_recency_filter": "year"}
    if domain_filter:
        extra["search_domain_filter"] = list(domain_filter)

    try:
        response = client.chat.completions.create(
            model="sonar",
            messages=[{"role": "user", "content": prompt}],
            extra_body=extra,
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


def discover_firms(
    industry: str,
    location: dict | None,
    size: str = "none",
    keywords: list[str] | None = None,
    limit: int = 20,
    original_query: str = "",
) -> list[dict]:
    """Discover firms matching a structured filter set via live web search.

    Primary discovery for the Find Companies pipeline. One Sonar Pro call
    returns enriched company records, so most firms skip the per-firm
    Perplexity+Firecrawl enrichment round-trip downstream.

    Args:
        industry: Industry string (e.g., "talent agencies", "fintech").
        location: {"locality": str|None, "region": str|None, "country": str|None}.
        size: "small" | "mid" | "large" | "none".
        keywords: Optional extra keywords from the parsed prompt.
        limit: Target number of firms to return.
        original_query: The raw user query, used as the strongest matching signal.

    Returns:
        list of dicts shaped for transform_serp_company_to_firm:
        {name, website, linkedinUrl, location:{city,state,country},
         industry, employeeCount, sizeBucket, founded}
    """
    client = _get_client()
    if not client:
        return []

    keywords = keywords or []
    location = location or {}
    loc_parts = [v for v in (
        location.get("locality"),
        location.get("region"),
        location.get("country"),
    ) if v]
    location_str = ", ".join(loc_parts) if loc_parts else ""

    size_clause = ""
    if size == "small":
        size_clause = "Prefer small companies (1-50 employees)."
    elif size == "mid":
        size_clause = "Prefer mid-sized companies (51-500 employees)."
    elif size == "large":
        size_clause = "Prefer large companies (500+ employees)."

    keyword_clause = f"Keywords to match: {', '.join(keywords)}." if keywords else ""
    query_clause = f'The user\'s original query: "{original_query}". Match this exactly.' if original_query else ""

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = [
        "discover_firms",
        industry or "",
        location_str,
        size,
        ",".join(sorted(keywords)),
        original_query[:120],
        str(limit),
    ]
    cached = get_cached("firm_discovery", cache_key)
    if cached and isinstance(cached, list):
        return cached

    prompt = (
        f"Find {limit} real, currently-operating companies matching these filters.\n"
        f"Industry: {industry or 'any'}\n"
        f"Location: {location_str or 'any'}\n"
        f"{size_clause}\n"
        f"{keyword_clause}\n"
        f"{query_clause}\n\n"
        "CRITICAL: Return only real companies that match the EXACT type the user asked for. "
        "If the query says 'talent agencies', return talent agencies (CAA, WME, UTA), "
        "not movie studios or production companies.\n\n"
        "For each company, look up and return verified data — do not guess. "
        "Return ONLY a JSON object with a 'companies' array. Each entry must have:\n"
        '  - name (string): official company name\n'
        '  - website (string|null): official website URL with https:// prefix\n'
        '  - linkedinUrl (string|null): https://linkedin.com/company/<slug>\n'
        '  - location: {"city": string|null, "state": string|null, "country": string|null}\n'
        '  - industry (string|null): primary industry\n'
        '  - employeeCount (integer|null): current headcount\n'
        '  - sizeBucket (string|null): "small" | "mid" | "large"\n'
        '  - founded (integer|null): 4-digit founding year\n'
        'No markdown, no commentary — JSON only.'
    )

    try:
        response = _chat_with_retry(
            client,
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

        cleaned = [c for c in companies if isinstance(c, dict) and c.get("name")]

        if cleaned:
            set_cached("firm_discovery", cache_key, cleaned)
        return cleaned
    except Exception:
        logger.warning("Perplexity discover_firms failed", exc_info=True)
        return []


# ── Agent Mode replacements for Firecrawl + Apify ────────────────────────


def enrich_job_posting_live(
    url: str | None,
    title: str,
    company: str,
    location: str = "",
) -> dict:
    """Replaces firecrawl_client.extract_job_posting() in Agent Mode.

    Two-stage extraction: full schema via sonar-pro, then a narrow sonar
    follow-up if salary_range is blank (compensation often lives on
    Levels.fyi / Built In / Glassdoor, not the canonical posting). The
    `hiring_manager` field is deliberately omitted to avoid hallucinating
    named individuals — verified HM data comes only from the dedicated
    find_hiring_managers action's verify_hiring_managers path.

    Returns the same superset of keys consumers expect at
    agent_actions.execute_find_jobs.
    """
    client = _get_client()
    if not client:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["job_posting_pplx", url or "", title.lower(), company.lower()]
    cached = get_cached("job_posting_pplx", cache_key)
    if cached:
        return cached

    prompt = (
        f"You are extracting structured data about a job posting. Search "
        f"the web for this posting and return a single JSON object — no "
        f"commentary, no markdown fences.\n\n"
        f"Job: {title}\n"
        f"Company: {company}\n"
        f"Location: {location}\n"
        f"Posting URL (if known): {url or ''}\n\n"
        f"Cross-reference:\n"
        f"- The official posting (if reachable)\n"
        f"- Levels.fyi, Built In, Glassdoor for salary\n"
        f"- The company's careers page for team naming\n\n"
        f"Return EXACTLY this schema. Use \"\" or [] for fields you can't "
        f"find with high confidence — never invent.\n\n"
        f"{{\n"
        f'  "requirements": ["..."],\n'
        f'  "nice_to_have": ["..."],\n'
        f'  "responsibilities": ["..."],\n'
        f'  "salary_range": "$X-$Y or \'Not disclosed\'",\n'
        f'  "team_or_department": "...",\n'
        f'  "experience_level": "intern | new grad | mid | senior | ...",\n'
        f'  "employment_type": "full_time | intern | contract"\n'
        f"}}"
    )

    try:
        response = _chat_with_retry(
            client,
            model="sonar-pro",
            messages=[{"role": "user", "content": prompt}],
        )
        content = response.choices[0].message.content or ""
        parsed = _parse_json_response(content)
        if not isinstance(parsed, dict) or "raw_text" in parsed:
            return {}

        # Stage 2: narrow salary lookup if stage 1 missed it.
        salary = (parsed.get("salary_range") or "").strip()
        if not salary or salary.lower() in ("not disclosed", "n/a", "tbd", "unknown"):
            backfill = _stage2_salary_only(title, company, location)
            if backfill:
                parsed["salary_range"] = backfill

        # Strip empty optional fields to keep Firestore docs lean.
        clean = {k: v for k, v in parsed.items() if v not in ("", [], None)}
        if clean:
            set_cached("job_posting_pplx", cache_key, clean)
        return clean
    except Exception:
        logger.warning("Perplexity enrich_job_posting_live failed for %s @ %s", title, company, exc_info=True)
        return {}


def _stage2_salary_only(title: str, company: str, location: str) -> str:
    """Narrow sonar call for salary range when stage 1 returned blank.

    Cached at (title, company, location) granularity since compensation
    bands are role-level, not posting-level. Returns a short string or "".
    """
    client = _get_client()
    if not client:
        return ""

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["salary_lookup", title.lower(), company.lower(), (location or "").lower()]
    cached = get_cached("salary_lookup", cache_key)
    if cached is not None:
        return cached if isinstance(cached, str) else ""

    prompt = (
        f"What is the typical compensation range for {title} at {company}"
        f"{' in ' + location if location else ''}? "
        f"Cite Levels.fyi, Built In, Glassdoor, or Pave with the year of the data. "
        f"Return a single short string like '$X-$Y total comp (Levels.fyi 2025)' "
        f"or exactly 'Not disclosed' if no public data exists. No commentary."
    )

    try:
        response = _chat_with_retry(
            client,
            model="sonar",
            messages=[{"role": "user", "content": prompt}],
        )
        text = (response.choices[0].message.content or "").strip()
        # Strip surrounding quotes/markdown the model sometimes adds.
        text = text.strip("`").strip('"').strip("'").strip()
        result = "" if text.lower().startswith("not disclosed") else text[:200]
        set_cached("salary_lookup", cache_key, result)
        return result
    except Exception:
        logger.warning("Perplexity _stage2_salary_only failed for %s @ %s", title, company, exc_info=True)
        return ""


def enrich_company_profile_live(name: str, website: str | None = None) -> dict:
    """Replaces firecrawl_client.extract_company_profile() in Agent Mode.

    Returns the same keys consumed at agent_actions.execute_discover_companies:
    description, hiring_signal, recent_news, culture_keywords, headquarters,
    industries.
    """
    client = _get_client()
    if not client:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["company_profile_pplx", name.lower(), (website or "")]
    cached = get_cached("company_profile_pplx", cache_key)
    if cached:
        return cached

    prompt = (
        f"Research {name}"
        f"{' (website: ' + website + ')' if website else ''} "
        f"and return structured JSON. No commentary, no markdown fences.\n\n"
        f"{{\n"
        f'  "description": "2-3 sentence neutral company description",\n'
        f'  "hiring_signal": "One sentence on hiring momentum (recent layoffs vs '
        f'expansion, new funding, named expansion teams)",\n'
        f'  "recent_news": ["..."],\n'
        f'  "culture_keywords": ["..."],\n'
        f'  "headquarters": "City, State/Country",\n'
        f'  "industries": ["..."]\n'
        f"}}\n\n"
        f"Anchor on official sources first (careers page, press releases) before "
        f"secondary coverage. If a field is unknown, return \"\" or [] — do not guess."
    )

    try:
        response = _chat_with_retry(
            client,
            model="sonar-pro",
            messages=[{"role": "user", "content": prompt}],
        )
        content = response.choices[0].message.content or ""
        parsed = _parse_json_response(content)
        if not isinstance(parsed, dict) or "raw_text" in parsed:
            return {}

        # Cap list sizes to keep payloads small.
        if isinstance(parsed.get("recent_news"), list):
            parsed["recent_news"] = [s for s in parsed["recent_news"] if isinstance(s, str) and s.strip()][:5]
        if isinstance(parsed.get("culture_keywords"), list):
            parsed["culture_keywords"] = [s for s in parsed["culture_keywords"] if isinstance(s, str) and s.strip()][:5]
        if isinstance(parsed.get("industries"), list):
            parsed["industries"] = [s for s in parsed["industries"] if isinstance(s, str) and s.strip()][:3]

        clean = {k: v for k, v in parsed.items() if v not in ("", [], None)}
        if clean:
            set_cached("company_profile_pplx", cache_key, clean)
        return clean
    except Exception:
        logger.warning("Perplexity enrich_company_profile_live failed for %s", name, exc_info=True)
        return {}


def enrich_professional_presence(contacts: list[dict]) -> dict[int, dict]:
    """Replaces apify_client.batch_enrich_linkedin_posts_via_apify in Agent Mode.

    Perplexity cannot read LinkedIn directly. Instead surfaces public
    signal that's functionally equivalent for email personalization:
    conference talks, podcast appearances, GitHub activity, public posts
    on personal blogs / X / Substack, press quotes.

    Returns dict[idx] -> {"linkedin_recent_posts": [{text, url, posted_at, kind}]}.
    Field name is kept as `linkedin_recent_posts` even though sources broaden,
    so the consumer at agent_actions.py:221 and the contactDoc.linkedinRecentPosts
    Firestore field need no changes.
    """
    client = _get_client()
    if not client:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached
    results: dict[int, dict] = {}

    for idx, contact in enumerate(contacts):
        name = f"{contact.get('FirstName', '')} {contact.get('LastName', '')}".strip()
        company = (contact.get("Company") or contact.get("company") or "").strip()
        title = (contact.get("Title") or contact.get("jobTitle") or "").strip()

        if not name or not company:
            continue

        cache_key = ["pro_presence", name.lower(), company.lower()]
        cached = get_cached("pro_presence", cache_key)
        if cached:
            results[idx] = cached
            continue

        prompt = (
            f"Find {name}'s most recent PUBLIC professional activity in the last "
            f"6 months. Context: {title} at {company}. Sources to check: personal "
            f"blogs, Twitter/X, Substack, Medium, GitHub, conference websites, "
            f"podcast feeds, press coverage.\n\n"
            f"DO NOT include LinkedIn URLs or LinkedIn-only signal (the LinkedIn "
            f"API blocks us). DO include public mirrors of LinkedIn posts when "
            f"reposted elsewhere.\n\n"
            f"Return JSON: {{\"items\": [\n"
            f'  {{"text": "...", "url": "...", "posted_at": "YYYY-MM-DD", '
            f'"kind": "talk|article|post|repo|press"}}\n'
            f"]}}\n\n"
            f"Cap at 5 items. If none found, return {{\"items\": []}}. Never invent."
        )

        try:
            response = _chat_with_retry(
                client,
                model="sonar-pro",
                messages=[{"role": "user", "content": prompt}],
            )
            content = response.choices[0].message.content or ""
            parsed = _parse_json_response(content)

            items = []
            if isinstance(parsed, dict) and isinstance(parsed.get("items"), list):
                for it in parsed["items"][:5]:
                    if not isinstance(it, dict):
                        continue
                    text = (it.get("text") or "").strip()
                    if not text:
                        continue
                    items.append({
                        "text": text[:300],
                        "url": (it.get("url") or "").strip(),
                        "posted_at": (it.get("posted_at") or "").strip(),
                        "kind": (it.get("kind") or "post").strip(),
                    })

            payload = {"linkedin_recent_posts": items}
            results[idx] = payload
            if items:
                set_cached("pro_presence", cache_key, payload)
        except Exception:
            logger.warning("Perplexity enrich_professional_presence failed for %s", name, exc_info=True)
            continue

    return results


def batch_enrich_contacts(contacts: list[dict]) -> dict[int, dict]:
    """Enrich contacts with NON-LinkedIn web presence.

    LinkedIn-sourced data is covered by the Apify pipeline; this call
    deliberately excludes LinkedIn to avoid duplicate signals. Asks
    Perplexity for podcast/talk/article/news/GitHub mentions, returns
    structured categories with a bullet-list fallback when the model
    doesn't produce clean JSON.

    Returns dict keyed by index:
        media_appearances, published_writing, news_mentions,
        talking_points (union, back-compat),
        recent_activity (raw), verified_role (bool), citations.
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

        # v2 cache key — old payloads had a LinkedIn-overlapping shape.
        cache_key = ["contact_v2", name.lower(), company.lower()]
        cached = get_cached("contact_enrichment", cache_key)
        if cached:
            results[idx] = cached
            continue

        prompt = (
            f"Find NON-LinkedIn web presence of {name}, {title} at {company} "
            f"from the last 12 months. IGNORE LinkedIn entirely — that source "
            f"is covered separately and any LinkedIn-sourced item is a duplicate. "
            f"Look for: (1) podcast appearances or interviews; (2) conference "
            f"talks, keynotes, or panels; (3) published articles, blog posts, "
            f"or papers they authored; (4) news coverage or press mentions; "
            f"(5) public GitHub projects; (6) substantive X/Twitter activity.\n\n"
            f"Return ONLY a JSON object in this exact shape (omit any category "
            f"with no items, but always include verified_role):\n"
            f'{{\n'
            f'  "media_appearances": ["one factual sentence per item with source name"],\n'
            f'  "published_writing": ["..."],\n'
            f'  "news_mentions": ["..."],\n'
            f'  "verified_role": true\n'
            f'}}\n'
            f"verified_role = true if {title} at {company} appears to still "
            f"be their current role, false if you find evidence they moved.\n"
            f"If nothing notable beyond LinkedIn, return only "
            f'{{"verified_role": true}} or {{"verified_role": false}}.'
        )

        try:
            response = client.chat.completions.create(
                model="sonar",
                messages=[{"role": "user", "content": prompt}],
            )
            content = response.choices[0].message.content or ""
            parsed = _parse_json_response(content)

            if isinstance(parsed, dict) and "raw_text" not in parsed:
                media = [s for s in (parsed.get("media_appearances") or []) if isinstance(s, str) and s.strip()]
                writing = [s for s in (parsed.get("published_writing") or []) if isinstance(s, str) and s.strip()]
                news = [s for s in (parsed.get("news_mentions") or []) if isinstance(s, str) and s.strip()]
                verified = bool(parsed.get("verified_role", True))
                talking_points = media + writing + news
            else:
                media = []
                writing = []
                news = []
                talking_points = _parse_bullet_points(content)
                verified = "current" in content.lower() or "still" in content.lower()

            enrichment = {
                "media_appearances": media,
                "published_writing": writing,
                "news_mentions": news,
                "talking_points": talking_points,
                "recent_activity": content,
                "verified_role": verified,
                "citations": _extract_citations(response),
            }
            results[idx] = enrichment
            set_cached("contact_enrichment", cache_key, enrichment)
        except Exception:
            logger.warning("Perplexity enrichment failed for %s", name, exc_info=True)
            results[idx] = {}

    return results


def batch_enrich_company_news(contacts: list[dict]) -> dict[int, dict]:
    """Fetch recent company news via Perplexity, batched per unique company.

    Groups contacts by normalized company name; one search per company.
    Shared cache means cross-user/cross-batch dedup too.

    Returns dict keyed by contact index:
        {company_recent_news: list[str], company_description: str}
    """
    client = _get_client()
    if not client:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached

    name_to_indices: dict[str, list[int]] = {}
    for idx, c in enumerate(contacts):
        name = (c.get("Company") or c.get("company") or "").strip()
        if not name:
            continue
        name_to_indices.setdefault(name.lower(), []).append(idx)

    if not name_to_indices:
        return {}

    results: dict[int, dict] = {}
    for key, indices in name_to_indices.items():
        display_name = (contacts[indices[0]].get("Company") or contacts[indices[0]].get("company") or key).strip()

        # v2 cache key — old "company_news" entries had hedging bullets that
        # leaked through ("no major announcement", "outside the window", etc).
        # See _HEDGE_PATTERNS below + the tightened prompt for the fix.
        cache_key = ["company_news_v2", key]
        cached = get_cached("company_enrichment", cache_key)
        if cached:
            payload = cached
        else:
            try:
                response = client.chat.completions.create(
                    model="sonar",
                    messages=[{
                        "role": "user",
                        "content": (
                            f"What notable developments has {display_name} announced "
                            f"in the last 60 days? Cover product launches, funding "
                            f"rounds, leadership changes, major hires, or notable news. "
                            f"Reply as 3-5 short bullet points, each one specific and "
                            f"factual. If nothing notable, reply with EXACTLY 'NONE'. "
                            f"DO NOT include hedging or meta-commentary like 'no major "
                            f"announcement', 'closest notable item is', 'outside the "
                            f"requested window', 'I can't verify', 'the result only "
                            f"confirms', or anything that admits the lack of a fact. "
                            f"Only return concrete, dated, verifiable announcements."
                        ),
                    }],
                    extra_body={"search_recency_filter": "month"},
                )
                content = response.choices[0].message.content or ""
                if "NONE" in content.upper()[:20]:
                    news = []
                else:
                    news = _parse_bullet_points(content)
                    # Defensive: drop any bullet that's actually hedging rather
                    # than a fact. Belt-and-suspenders with the tightened prompt.
                    news = [item for item in news if not _is_hedging_bullet(item)]
                payload = {
                    "company_recent_news": news,
                    "company_description": content[:500] if news else "",
                }
                if news:
                    set_cached("company_enrichment", cache_key, payload)
            except Exception:
                logger.warning("Perplexity batch_enrich_company_news failed for %s", display_name, exc_info=True)
                payload = {}

        if payload:
            for idx in indices:
                results[idx] = payload

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


def verify_hiring_managers_v2(
    hms: list[dict],
    company: str,
    job_title: str,
    max_workers: int = 5,
) -> list[dict]:
    """Verify hiring managers via Perplexity with structured output + parallelism.

    Returns a list aligned with `hms`. Each entry:
        {still_at_company: "yes"|"no"|"unknown",
         current_title: str,
         actively_hiring: "yes"|"no"|"unknown",
         recent_hiring_signal: str,
         confidence: "high"|"medium"|"low"}

    Conservative on failure: unknown candidates are kept by callers. If
    PERPLEXITY_API_KEY is unset, every entry returns still_at_company=unknown
    so the pipeline degrades to PDL-only behavior.
    """
    client = _get_client()
    if not client:
        return [
            {
                "still_at_company": "unknown",
                "current_title": "",
                "actively_hiring": "unknown",
                "recent_hiring_signal": "",
                "confidence": "low",
            }
            for _ in hms
        ]

    from concurrent.futures import ThreadPoolExecutor
    from app.services.enrichment_cache import get_cached, set_cached

    def _default_result() -> dict:
        return {
            "still_at_company": "unknown",
            "current_title": "",
            "actively_hiring": "unknown",
            "recent_hiring_signal": "",
            "confidence": "low",
        }

    def _verify_one(hm: dict) -> dict:
        name = f"{hm.get('FirstName', '')} {hm.get('LastName', '')}".strip()
        if not name or not company:
            return _default_result()

        cache_key = ["hm_verify_v2", name.lower(), company.lower()]
        cached = get_cached("hiring_verification", cache_key)
        if cached:
            return cached

        prompt = (
            f"Is {name} currently employed at {company}? "
            f"What is their current title? "
            f"Is {company} actively hiring for {job_title} or similar roles right now? "
            f"Any recent LinkedIn/news signal of hiring activity from this person "
            f"or their team in the last 30 days?"
        )

        try:
            response = _chat_with_retry(
                client,
                model="sonar",
                messages=[{"role": "user", "content": prompt}],
                response_format={
                    "type": "json_schema",
                    "json_schema": _HM_VERIFY_SCHEMA,
                },
                extra_body={"search_recency_filter": "month"},
            )
            content = response.choices[0].message.content or ""
            parsed = _parse_json_response(content)

            if not isinstance(parsed, dict) or "still_at_company" not in parsed:
                return _default_result()

            result = {
                "still_at_company": parsed.get("still_at_company", "unknown"),
                "current_title": (parsed.get("current_title") or "").strip(),
                "actively_hiring": parsed.get("actively_hiring", "unknown"),
                "recent_hiring_signal": (parsed.get("recent_hiring_signal") or "").strip(),
                "confidence": parsed.get("confidence", "low"),
            }
            set_cached("hiring_verification", cache_key, result)
            return result
        except Exception:
            logger.warning("HM verify v2 failed for %s", name, exc_info=True)
            return _default_result()

    if not hms:
        return []

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        return list(pool.map(_verify_one, hms))


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
        response = client.with_options(timeout=30.0, max_retries=1).chat.completions.create(
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
