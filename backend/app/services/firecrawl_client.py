"""Firecrawl API client - structured web extraction.

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


# ── Core scrape functions ────────────────────────────────────────────────


def extract_job_posting(url: str) -> dict:
    """Extract structured job data from a posting URL.

    Works with Greenhouse, Lever, LinkedIn, Workday, Indeed.

    Returns dict with: title, company, location, salary_range, requirements,
    nice_to_have, responsibilities, team_or_department, hiring_manager,
    application_deadline, experience_level, employment_type.
    """
    fc = _get_client()
    if not fc:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["job_posting", url]
    cached = get_cached("job_posting", cache_key)
    if cached:
        return cached

    from app.services.extraction_schemas import JobPostingExtract

    try:
        result = fc.scrape(
            url,
            formats=[{
                "type": "json",
                "schema": JobPostingExtract.model_json_schema(),
            }],
            timeout=30000,
        )
        extracted = result.get("json", result.get("extract", {})) if isinstance(result, dict) else {}
        if extracted:
            set_cached("job_posting", cache_key, extracted)
        return extracted
    except Exception:
        logger.warning("Firecrawl extract_job_posting failed for %s", url, exc_info=True)
        return {}


def extract_company_profile(url: str) -> dict:
    """Extract company info from about/careers pages.

    Returns dict with: name, description, headquarters, employee_count,
    founded, industries, culture_keywords, careers_url, leadership, recent_news.
    """
    fc = _get_client()
    if not fc:
        return {}

    from app.services.enrichment_cache import get_cached, set_cached
    cache_key = ["company_profile", url]
    cached = get_cached("company_profile", cache_key)
    if cached:
        return cached

    from app.services.extraction_schemas import CompanyProfileExtract

    try:
        result = fc.scrape(
            url,
            formats=[{
                "type": "json",
                "schema": CompanyProfileExtract.model_json_schema(),
            }],
            timeout=30000,
        )
        extracted = result.get("json", result.get("extract", {})) if isinstance(result, dict) else {}
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
            return result.get("json", result.get("extract", {})) if isinstance(result, dict) else {}
        else:
            result = fc.scrape(url, formats=["markdown"], timeout=30000)
            if isinstance(result, dict):
                return {
                    "markdown": result.get("markdown", ""),
                    "metadata": result.get("metadata", {}),
                }
            return {"markdown": str(result)}
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
        extracted = result.get("json", result.get("extract", {})) if isinstance(result, dict) else {}
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
