"""Perplexity research for the public interview-prep flow.

Runs four sharply-scoped queries in parallel:
  1. interview_process: rounds, format, who interviews, evaluation criteria.
  2. specific_questions: actual question examples reported by candidates.
  3. signals_and_red_flags: what gets you advanced, what gets you cut.
  4. company_news: recent moves, hiring, layoffs, strategy shifts.

We deliberately avoid one broad "tell me everything" call - those produce
the generic textbook output the lead-magnet PDF was getting before.

Returns a merged citations list (deduped, ordered by first appearance)
so the PDF can render a single Sources section.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from app.services.perplexity_client import get_company_news_brief, pro_search

logger = logging.getLogger(__name__)


def _pro(query: str, recency: str | None = "month") -> dict:
    try:
        return pro_search(query, recency=recency)
    except Exception:
        logger.warning("Perplexity pro_search failed: %s", query[:80], exc_info=True)
        return {"content": "", "citations": []}


def _interview_process(company: str, role: str) -> dict:
    role_clause = f"for the {role} role" if role else ""
    return _pro(
        f"Walk through the {company} interview process {role_clause}. "
        f"For each round give: round name, format (phone, video, onsite, "
        f"take-home, case), typical duration, who runs it (recruiter, "
        f"hiring manager, panel, executive), and what they evaluate. "
        f"Use the actual stage names this company uses internally. "
        f"Be specific about how many rounds and the timeline from "
        f"application to offer."
    )


def _specific_questions(company: str, role: str) -> dict:
    role_clause = f"for the {role} role" if role else ""
    return _pro(
        f"What specific interview questions does {company} ask {role_clause}? "
        f"Include behavioral, technical, and company-specific questions "
        f"that candidates have actually reported being asked. Quote the "
        f"questions verbatim where possible. Group by round if known."
    )


def _signals_and_red_flags(company: str, role: str) -> dict:
    role_clause = f"for the {role} role" if role else ""
    return _pro(
        f"What does {company} actually look for when hiring {role_clause}? "
        f"What red flags or mistakes cause candidates to get cut? "
        f"What do successful candidates have in common? "
        f"Cite specific behaviors, not generic advice."
    )


def _company_news(company: str) -> list[str]:
    if not company:
        return []
    try:
        return get_company_news_brief(company, timeframe="month") or []
    except Exception:
        logger.warning("get_company_news_brief failed", exc_info=True)
        return []


def _dedupe_citations(*lists: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for lst in lists:
        for c in lst or []:
            if c and c not in seen:
                seen.add(c)
                out.append(c)
    return out


def gather_research(company: str, role: str) -> dict:
    """Run all four queries in parallel; return merged payload.

    Shape:
        {
          "interview_process":   {"content": str, "citations": list[str]},
          "specific_questions":  {"content": str, "citations": list[str]},
          "signals_and_red_flags": {"content": str, "citations": list[str]},
          "company_news":        list[str],
          "citations":           list[str],   # deduped across all calls
        }
    """
    if not company:
        return {
            "interview_process": {"content": "", "citations": []},
            "specific_questions": {"content": "", "citations": []},
            "signals_and_red_flags": {"content": "", "citations": []},
            "company_news": [],
            "citations": [],
        }

    with ThreadPoolExecutor(max_workers=4) as ex:
        f_process = ex.submit(_interview_process, company, role)
        f_questions = ex.submit(_specific_questions, company, role)
        f_signals = ex.submit(_signals_and_red_flags, company, role)
        f_news = ex.submit(_company_news, company)

        process = f_process.result()
        questions = f_questions.result()
        signals = f_signals.result()
        news = f_news.result()

    citations = _dedupe_citations(
        process.get("citations") or [],
        questions.get("citations") or [],
        signals.get("citations") or [],
    )

    logger.info(
        "Perplexity research: process=%d chars, questions=%d, signals=%d, news=%d items, citations=%d",
        len(process.get("content") or ""),
        len(questions.get("content") or ""),
        len(signals.get("content") or ""),
        len(news),
        len(citations),
    )

    return {
        "interview_process": process,
        "specific_questions": questions,
        "signals_and_red_flags": signals,
        "company_news": news,
        "citations": citations,
    }
