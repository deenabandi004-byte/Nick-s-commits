"""Quick Perplexity research on the target company so the cover letter
can open with something specific rather than generic.

We use the cheap Sonar model (~5s) - this is a lead magnet, not a paid
feature, so we keep the cost floor low. If Perplexity is unavailable or
the key isn't set, the client returns an empty dict and the letter still
generates fine (it just leans more on the resume + JD).
"""
from __future__ import annotations

import logging

from app.services.perplexity_client import quick_search

logger = logging.getLogger(__name__)


def research_company(company: str, role_title: str) -> dict:
    """Return a short brief on the company for the LLM to draw on.

    Returns:
        {"content": str, "citations": list[str]}

    Both fields are empty strings / empty list if research fails or the
    company name is missing.
    """
    company = (company or "").strip()
    if not company:
        return {"content": "", "citations": []}

    role = (role_title or "").strip() or "this role"
    query = (
        f"What does {company} do, what are they known for, and what have "
        f"they been in the news for in the last 3 months? Briefly, what "
        f"is the team or business that hires for {role}? Keep it under "
        f"200 words, factual, no marketing fluff. Cite sources."
    )

    try:
        result = quick_search(query, recency="month")
    except Exception:
        logger.warning("Perplexity research failed for %s", company, exc_info=True)
        return {"content": "", "citations": []}

    content = (result.get("content") or "").strip()
    citations = result.get("citations") or []
    logger.info(
        "Perplexity research on %s: %d chars, %d citations",
        company, len(content), len(citations),
    )
    return {"content": content, "citations": citations}
