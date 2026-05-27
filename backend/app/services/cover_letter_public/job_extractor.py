"""Pull a job posting from a URL using Firecrawl.

Strategy:
    1. Try Firecrawl's structured extraction (JobPostingExtract schema).
    2. If that comes back empty or missing the basics, fall back to a
       plain markdown scrape and shove the raw markdown into the prompt
       downstream - GPT-4o is more than capable of working from raw JD text.
"""
from __future__ import annotations

import logging

from app.services.firecrawl_client import extract_job_posting, scrape_url

logger = logging.getLogger(__name__)


def _is_usable(structured: dict) -> bool:
    if not structured:
        return False
    title = (structured.get("title") or "").strip()
    company = (structured.get("company") or "").strip()
    # We need at least one of: title or company. The description is the
    # most important signal but Firecrawl sometimes returns it under
    # different keys, so we check separately below.
    return bool(title or company)


def extract_job(url: str) -> dict:
    """Scrape a job posting URL.

    Returns a dict with at minimum:
        title:        str
        company:      str
        location:     str
        description:  str (may be a concatenation of requirements + responsibilities)
        raw_markdown: str (only set on fallback path; empty otherwise)

    All fields default to "" when missing. Never raises - downstream code
    decides what to do with sparse output.
    """
    url = (url or "").strip()
    if not url:
        return {
            "title": "", "company": "", "location": "",
            "description": "", "raw_markdown": "",
        }

    structured = {}
    try:
        structured = extract_job_posting(url) or {}
    except Exception:
        logger.warning("Firecrawl structured extract failed for %s", url, exc_info=True)
        structured = {}

    if _is_usable(structured):
        title = (structured.get("title") or "").strip()
        company = (structured.get("company") or "").strip()
        location = (structured.get("location") or "").strip()

        # Build a single description blob from whatever fields Firecrawl gave us.
        parts: list[str] = []
        responsibilities = structured.get("responsibilities")
        if responsibilities:
            if isinstance(responsibilities, list):
                parts.append("Responsibilities:\n" + "\n".join(f"- {r}" for r in responsibilities))
            elif isinstance(responsibilities, str):
                parts.append(f"Responsibilities:\n{responsibilities}")

        requirements = structured.get("requirements")
        if requirements:
            if isinstance(requirements, list):
                parts.append("Requirements:\n" + "\n".join(f"- {r}" for r in requirements))
            elif isinstance(requirements, str):
                parts.append(f"Requirements:\n{requirements}")

        nice = structured.get("nice_to_have")
        if nice:
            if isinstance(nice, list):
                parts.append("Nice to have:\n" + "\n".join(f"- {r}" for r in nice))
            elif isinstance(nice, str):
                parts.append(f"Nice to have:\n{nice}")

        description = "\n\n".join(parts).strip()

        logger.info(
            "Firecrawl structured: title=%r company=%r location=%r desc=%d chars",
            title, company, location, len(description),
        )

        return {
            "title": title,
            "company": company,
            "location": location,
            "description": description,
            "raw_markdown": "",
        }

    # Fallback: plain markdown scrape
    logger.info("Firecrawl structured extract empty; falling back to markdown scrape for %s", url)
    try:
        scraped = scrape_url(url) or {}
    except Exception:
        logger.warning("Firecrawl markdown scrape failed for %s", url, exc_info=True)
        scraped = {}

    markdown = (scraped.get("markdown") or "").strip()
    metadata = scraped.get("metadata") or {}
    title = (metadata.get("title") or metadata.get("ogTitle") or "").strip()
    company = (metadata.get("ogSiteName") or "").strip()

    return {
        "title": title,
        "company": company,
        "location": "",
        "description": "",
        "raw_markdown": markdown[:8000],  # cap to keep prompt bounded
    }
