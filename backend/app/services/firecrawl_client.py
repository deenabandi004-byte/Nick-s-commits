"""Firecrawl API client — structured web extraction.

Replaces Jina Reader for: URL scraping, LinkedIn extraction.
New capability: structured extraction with Pydantic schemas.

All functions return dict/list and gracefully return empty results
if FIRECRAWL_API_KEY is not set or the API call fails.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.config import FIRECRAWL_API_KEY

logger = logging.getLogger(__name__)

# Lazy-init client singleton
_client = None


def _get_client():
    global _client
    if not FIRECRAWL_API_KEY:
        return None
    if _client is None:
        from firecrawl import Firecrawl
        _client = Firecrawl(api_key=FIRECRAWL_API_KEY)
    return _client


def _extract_json(result) -> dict:
    """Pull structured JSON from a Firecrawl response.

    The current SDK returns a `Document` object exposing `.json` directly;
    older builds returned a plain dict with `json`/`extract` keys. Handle both
    so we work regardless of SDK version.
    """
    json_payload = getattr(result, "json", None)
    if isinstance(json_payload, dict):
        return json_payload
    if isinstance(result, dict):
        cand = result.get("json")
        if isinstance(cand, dict):
            return cand
        cand = result.get("extract")
        if isinstance(cand, dict):
            return cand
    return {}


def _extract_markdown_and_meta(result) -> dict:
    """Pull markdown + metadata from a Firecrawl response (Document or dict)."""
    md = getattr(result, "markdown", None)
    if md is None and isinstance(result, dict):
        md = result.get("markdown", "")
    meta = getattr(result, "metadata", None)
    if meta is None and isinstance(result, dict):
        meta = result.get("metadata", {})
    return {"markdown": md or "", "metadata": meta or {}}


def _scrape_with_retry(
    fc, url: str, *, formats: list, timeout: int = 30000, wait_for_ms: int = 0,
):
    """Wrap Firecrawl `scrape` with a small backoff for transient 429s.

    Firecrawl SDK currently raises on rate-limit; without this, a single
    429 cascaded all the way out to the bare `except Exception: pass` in
    agent_actions and the job/company was saved un-enriched (S4.5).
    Three quick attempts is enough for transient bursts; sustained rate
    limiting should pause the Loop via the rate-limit strike counter
    (caller maps to RateLimitError on final failure).

    wait_for_ms: pass-through to Firecrawl's `wait_for` parameter for pages
    that hydrate client-side (Workday, etc.). When non-zero, extends the
    base timeout so the SDK doesn't time out before the page finishes.
    """
    import time

    scrape_kwargs = {"formats": formats, "timeout": timeout}
    if wait_for_ms:
        scrape_kwargs["wait_for"] = wait_for_ms
        scrape_kwargs["timeout"] = wait_for_ms + 45000

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            return fc.scrape(url, **scrape_kwargs)
        except Exception as e:
            last_err = e
            msg = str(e).lower()
            # SDK doesn't surface a typed RateLimitError today; sniff the
            # message. Conservative: only retry on clear rate-limit signals.
            if "429" in msg or "rate limit" in msg or "ratelimit" in msg:
                sleep_s = 0.5 * (2 ** attempt)  # 0.5, 1.0, 2.0
                logger.warning(
                    "[Firecrawl] 429 on attempt %d/3 for %s — sleeping %.1fs",
                    attempt + 1, url, sleep_s,
                )
                time.sleep(sleep_s)
                continue
            # Non-rate-limit failure — don't burn retries on it
            raise
    # Sustained rate limiting — let the loop's rate-limit-strike counter
    # see it and pause the Loop after the threshold (matches Apify path).
    if last_err is not None:
        from app.utils.exceptions import RateLimitError
        raise RateLimitError(
            message=f"Firecrawl rate limit exhausted retries for {url}",
        )
    return None


# ── Core scrape functions ────────────────────────────────────────────────


def _is_linkedin_url(url: str) -> bool:
    """True if the URL points anywhere on linkedin.com.

    Used by the extract_* helpers below to short-circuit Firecrawl and
    route to Apify instead. Firecrawl reliably 404s on LinkedIn URLs
    ("WebsiteNotSupportedError"), so calling it is pure noise.
    """
    return "linkedin.com" in (url or "").lower()


def extract_job_posting(url: str, wait_for_ms: int = 0) -> dict:
    """Extract structured job data from a posting URL.

    Works with Greenhouse, Lever, Workday, Indeed via Firecrawl, and
    LinkedIn via Apify (curious_coder~linkedin-jobs-scraper).

    Returns dict with: title, company, description, location, salary_range,
    requirements, nice_to_have, responsibilities, team_or_department,
    hiring_manager, application_deadline, experience_level, employment_type.

    wait_for_ms: how long to let the page's JavaScript render before reading it.
    Modern ATS pages (e.g. Workday) load the description client-side, so a 0ms
    scrape returns an empty shell. Pass a few seconds (e.g. 8000) on the
    full-description path to recover the real prose. Left at 0 by default so the
    fast/background callers are unchanged. Results for the two modes are cached
    under separate keys so an empty no-wait scrape never masks a good wait scrape.
    """
    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["job_posting_wait" if wait_for_ms else "job_posting", url]
    cached = get_cached("job_posting", cache_key)
    if cached:
        return cached

    # LinkedIn job postings → Apify. Firecrawl's LinkedIn support was
    # withdrawn in 2026 and every call raises WebsiteNotSupportedError.
    if _is_linkedin_url(url):
        from app.services.apify_client import enrich_linkedin_job_via_apify
        extracted = enrich_linkedin_job_via_apify(url) or {}
        if extracted:
            set_cached("job_posting", cache_key, extracted)
        return extracted

    fc = _get_client()
    if not fc:
        return {}

    from app.services.extraction_schemas import JobPostingExtract

    try:
        result = _scrape_with_retry(
            fc,
            url,
            formats=[{
                "type": "json",
                "schema": JobPostingExtract.model_json_schema(),
            }],
            timeout=30000,
            wait_for_ms=wait_for_ms,
        )
        extracted = _extract_json(result)
        if extracted:
            set_cached("job_posting", cache_key, extracted)
        return extracted
    except Exception:
        # Includes RateLimitError after retry exhaustion — bubble up so
        # the loop's rate-limit strike counter can pause the Loop. The
        # agent_actions call site catches Exception and proceeds with
        # un-enriched data, so we don't break a single cycle.
        logger.warning("Firecrawl extract_job_posting failed for %s", url, exc_info=True)
        return {}


def extract_company_profile(url: str) -> dict:
    """Extract company info from about/careers pages.

    Works with arbitrary company websites via Firecrawl, and LinkedIn
    company pages (linkedin.com/company/*) via Apify HarvestAPI.

    Returns dict with: name, description, headquarters, employee_count,
    founded, industries, culture_keywords, careers_url, leadership, recent_news.
    """
    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["company_profile", url]
    cached = get_cached("company_profile", cache_key)
    if cached:
        return cached

    if _is_linkedin_url(url):
        from app.services.apify_client import enrich_linkedin_company_via_apify
        extracted = enrich_linkedin_company_via_apify(url) or {}
        if extracted:
            set_cached("company_profile", cache_key, extracted)
        return extracted

    fc = _get_client()
    if not fc:
        return {}

    from app.services.extraction_schemas import CompanyProfileExtract

    try:
        result = _scrape_with_retry(
            fc,
            url,
            formats=[{
                "type": "json",
                "schema": CompanyProfileExtract.model_json_schema(),
            }],
            timeout=30000,
        )
        extracted = _extract_json(result)
        if extracted:
            set_cached("company_profile", cache_key, extracted)
        return extracted
    except Exception:
        logger.warning("Firecrawl extract_company_profile failed for %s", url, exc_info=True)
        return {}


def scrape_url(url: str, extract_type: str = "general") -> dict:
    """Generic URL scrape. Replaces Jina Reader in scout_service.py.

    Args:
        url: The URL to scrape.
        extract_type: One of "job_posting", "company", "person", "general".

    Returns dict with extracted content (structured if schema used, else markdown).
    """
    fc = _get_client()
    if not fc:
        return {}

    schema_map = {
        "job_posting": "JobPostingExtract",
        "company": "CompanyProfileExtract",
        "person": "PersonProfileExtract",
    }

    try:
        if extract_type in schema_map:
            from app.services import extraction_schemas
            schema_cls = getattr(extraction_schemas, schema_map[extract_type])
            result = fc.scrape(
                url,
                formats=[{
                    "type": "json",
                    "schema": schema_cls.model_json_schema(),
                }],
                timeout=30000,
            )
            return _extract_json(result)
        else:
            result = fc.scrape(url, formats=["markdown"], timeout=30000)
            return _extract_markdown_and_meta(result)
    except Exception:
        logger.warning("Firecrawl scrape_url failed for %s", url, exc_info=True)
        return {}


def scrape_linkedin_profile(url: str) -> dict:
    """LinkedIn profile extraction. Replaces Jina in linkedin_enrichment.py.

    Returns dict with: name, current_title, current_company, summary,
    recent_posts, interests.
    """
    fc = _get_client()
    if not fc:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["linkedin_profile", url]
    cached = get_cached("contact_enrichment", cache_key)
    if cached:
        return cached

    from app.services.extraction_schemas import PersonProfileExtract

    try:
        result = fc.scrape(
            url,
            formats=[{
                "type": "json",
                "schema": PersonProfileExtract.model_json_schema(),
            }],
            timeout=30000,
        )
        extracted = _extract_json(result)
        if extracted:
            set_cached("contact_enrichment", cache_key, extracted)
        return extracted
    except Exception:
        logger.warning("Firecrawl scrape_linkedin_profile failed for %s", url, exc_info=True)
        return {}


def crawl_career_page(
    careers_url: str,
    roles: list[str] | None = None,
) -> list[dict]:
    """Crawl company career pages for job listings.

    Returns list of dicts with: title, location, url, posted_date.
    """
    fc = _get_client()
    if not fc:
        return []

    try:
        result = fc.crawl(
            careers_url,
            limit=20,
            poll_interval=5,
        )

        jobs = []
        pages = result.get("data", []) if isinstance(result, dict) else []
        for page in pages:
            metadata = page.get("metadata", {})
            title = metadata.get("title", "")
            url = metadata.get("sourceURL", page.get("url", ""))
            if title and url:
                jobs.append({
                    "title": title,
                    "url": url,
                    "location": "",
                    "posted_date": "",
                })

        # Filter by roles if provided
        if roles and jobs:
            role_lower = [r.lower() for r in roles]
            filtered = [
                j for j in jobs
                if any(r in j["title"].lower() for r in role_lower)
            ]
            return filtered if filtered else jobs[:10]

        return jobs[:20]
    except Exception:
        logger.warning("Firecrawl crawl_career_page failed for %s", careers_url, exc_info=True)
        return []


def batch_scrape(urls: list[str]) -> list[dict]:
    """Bulk URL processing.

    Returns list of dicts with markdown content for each URL.
    """
    fc = _get_client()
    if not fc:
        return []

    try:
        batch_job = fc.start_batch_scrape(urls)
        status = fc.get_batch_scrape_status(batch_job.id)
        results = []
        for item in status.get("data", []):
            results.append({
                "url": item.get("metadata", {}).get("sourceURL", ""),
                "markdown": item.get("markdown", ""),
                "metadata": item.get("metadata", {}),
            })
        return results
    except Exception:
        logger.warning("Firecrawl batch_scrape failed", exc_info=True)
        return []
