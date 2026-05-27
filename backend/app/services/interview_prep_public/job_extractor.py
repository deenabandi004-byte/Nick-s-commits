"""Extract structured job details from a posting.

Accepts either a URL (uses Firecrawl) or raw pasted text (uses OpenAI).
Always returns the same normalized shape so downstream modules don't care
which path produced it.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional
from urllib.parse import urlparse

import requests

from app.services.firecrawl_client import extract_job_posting
from app.services.openai_client import get_openai_client

logger = logging.getLogger(__name__)


URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def _looks_like_url(value: str) -> bool:
    if not value:
        return False
    candidate = value.strip().split()[0]
    if not URL_RE.match(candidate):
        return False
    try:
        parsed = urlparse(candidate)
        return bool(parsed.netloc)
    except Exception:
        return False


def _company_domain(company: str) -> str:
    if not company:
        return ""
    slug = re.sub(r"[^a-z0-9]", "", company.lower())
    return f"{slug}.com" if slug else ""


def _normalize(payload: dict) -> dict:
    """Normalize Firecrawl/LLM output into the shape the rest of the
    pipeline expects (mirrors fields the existing interview_prep code
    uses, minus the per-user pieces)."""
    company = (payload.get("company") or "").strip()
    title = (payload.get("title") or "").strip()
    return {
        "company_name": company,
        "company_domain": _company_domain(company),
        "job_title": title,
        "level": payload.get("experience_level"),
        "team_division": payload.get("team_or_department"),
        "location": payload.get("location"),
        "remote_policy": None,
        "required_skills": payload.get("requirements") or [],
        "preferred_skills": payload.get("nice_to_have") or [],
        "years_experience": None,
        "job_type": payload.get("employment_type") or "Full-time",
        "key_responsibilities": payload.get("responsibilities") or [],
        "interview_hints": None,
        "salary_range": payload.get("salary_range"),
        "role_category": _infer_role_category(title, payload.get("requirements") or []),
    }


def _infer_role_category(title: str, requirements: list[str]) -> str:
    """Very lightweight bucketing - mirrors the SUBREDDIT_MAP keys in
    the existing reddit_scraper so we hit the right communities."""
    haystack = " ".join([title or "", " ".join(requirements or [])]).lower()

    if any(k in haystack for k in ("consultant", "consulting", "mckinsey", "bain", "bcg")):
        return "Consulting"
    if any(k in haystack for k in ("investment banking", "ib analyst", "trader", "private equity", "hedge fund", "finance analyst")):
        return "Finance"
    if any(k in haystack for k in ("product manager", "product management", " pm ", "associate product")):
        return "Product Management"
    if any(k in haystack for k in ("data scientist", "machine learning", "ml engineer", "data analyst")):
        return "Data Science"
    if any(k in haystack for k in ("software", "engineer", "developer", "swe", "backend", "frontend", "full stack")):
        return "Software Engineering"
    if any(k in haystack for k in ("marketing", "growth", "brand")):
        return "Marketing"
    if any(k in haystack for k in ("designer", "ux", "ui")):
        return "Design"
    return "Other"


def _extract_from_url(url: str) -> Optional[dict]:
    logger.info("public interview-prep: extracting job posting from URL: %s", url)
    try:
        raw = extract_job_posting(url)
    except Exception:
        # Defensive: extract_job_posting only wraps the .scrape call in
        # try/except, not the lazy `from firecrawl import Firecrawl` or
        # the API-key check. A missing package or bad key would otherwise
        # bubble all the way up and kill the whole background thread.
        logger.warning("Firecrawl client crashed for %s; falling through to HTTP fallback", url, exc_info=True)
        return None
    if not raw:
        logger.warning("Firecrawl returned no data for %s (likely API failure or blocked page)", url)
        return None
    if not raw.get("company") and not raw.get("title"):
        logger.warning(
            "Firecrawl returned data but no company/title for %s. keys=%s",
            url, list(raw.keys()),
        )
        return None
    logger.info(
        "Firecrawl extracted: company=%r title=%r from %s",
        raw.get("company"), raw.get("title"), url,
    )
    return _normalize(raw)


_HTML_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _html_to_text(html: str) -> str:
    """Strip tags and collapse whitespace. Cheap, no BeautifulSoup needed."""
    if not html:
        return ""
    no_script = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    no_tags = re.sub(r"<[^>]+>", " ", no_script)
    return re.sub(r"\s+", " ", no_tags).strip()


def _extract_from_url_via_http(url: str) -> Optional[dict]:
    """Fallback when Firecrawl returns nothing: fetch the URL directly and
    let OpenAI extract structured fields from the visible text. Won't work
    on JS-rendered SPAs that ship empty HTML, but handles most static-ish
    career pages and HTML-form Greenhouse / Lever postings."""
    try:
        resp = requests.get(url, headers=_HTML_FETCH_HEADERS, timeout=10, allow_redirects=True)
    except Exception:
        logger.warning("HTTP fallback fetch failed for %s", url, exc_info=True)
        return None
    if resp.status_code >= 400:
        logger.info("HTTP fallback got status %s for %s", resp.status_code, url)
        return None
    text = _html_to_text(resp.text)
    if len(text) < 400:
        logger.info("HTTP fallback for %s yielded only %d chars of visible text", url, len(text))
        return None
    logger.info("HTTP fallback for %s extracted %d chars, sending to OpenAI", url, len(text))
    return _extract_from_text(text)


def _extract_from_text(text: str) -> Optional[dict]:
    """Fall back to OpenAI when the user pasted raw job posting text."""
    client = get_openai_client()
    if not client:
        return None

    prompt = (
        "You are extracting structured fields from a pasted job posting. "
        "Return ONLY a JSON object with these keys: company, title, location, "
        "employment_type, salary_range, requirements (array of strings), "
        "nice_to_have (array of strings), responsibilities (array of strings), "
        "team_or_department, experience_level. Use empty string or empty array "
        "if a field is not present.\n\n"
        "JOB POSTING:\n"
        f"{text[:12000]}"
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        payload = json.loads(response.choices[0].message.content or "{}")
    except Exception:
        logger.warning("OpenAI job-text extraction failed", exc_info=True)
        return None

    if not payload.get("company") and not payload.get("title"):
        return None
    return _normalize(payload)


def extract(job_input: str) -> Optional[dict]:
    """Public entry point. `job_input` is either a URL or pasted text.

    Returns the normalized job details dict, or None if extraction failed
    badly enough that the rest of the pipeline can't run.
    """
    if not job_input or not job_input.strip():
        return None

    if _looks_like_url(job_input):
        url = job_input.strip().split()[0]
        result = _extract_from_url(url)
        if result:
            return result
        # Firecrawl came back empty (the API key isn't set, the page is
        # JS-rendered, rate-limited, or behind a login). Try fetching the
        # raw HTML ourselves and letting OpenAI extract from visible text.
        logger.info("Firecrawl miss for %s, trying HTTP fallback", url)
        result = _extract_from_url_via_http(url)
        if result:
            return result
        logger.warning("All URL extractors failed for %s", url)
        return None

    return _extract_from_text(job_input)
