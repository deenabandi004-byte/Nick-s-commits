"""Deadline extraction for consulting / IB / quant jobs via Perplexity.

Phase 4 of the Job Board Elevation Plan (docs/JOB_BOARD_ELEVATION_PLAN.md).

The Firecrawl enricher already extracts an `application_deadline` field
when one is explicit in the job posting (see pipeline/enricher.py line 71).
That covers tech postings with deadlines listed in the JD, but finance and
consulting cycles often don't put the deadline on the individual posting —
it's a global recruiting cycle date ("MBB summer 2027 closes Oct 1") that
Perplexity can synthesize from web context.

This module fills the gap. It targets a fixed set of cycle-driven categories
and only runs on jobs that don't yet have a deadline extracted. One
Perplexity sonar call per job, ~$0.005 each, cached forever on the job doc.

Cost guardrails:
- MAX_PERPLEXITY_PER_RUN caps each cron tick at 50 calls (~$0.25 / hour)
- Skips jobs already marked deadline_extraction_status='completed' or 'failed'
- Skips jobs not in the cycle-driven category set
- No-op when PERPLEXITY_API_KEY is unset
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# Categories whose deadlines are usually cycle-driven and not on the posting.
# We don't waste Perplexity calls on tech/co-op roles where Firecrawl usually
# catches the date when it exists, and rolling-deadline roles where there's
# no useful answer.
CYCLE_DRIVEN_CATEGORIES = frozenset({
    "ib_summer_analyst",
    "consulting_summer",
    "consulting_new_grad",
    "quant_intern",
    "year_coded_analyst",
})

# Per-run cap. Hourly cron × 50 = 1200/day max, but in practice most jobs
# hit the skip path after the first pass.
MAX_PERPLEXITY_PER_RUN = 50

# Per-call cost estimate for budget tracking.
PERPLEXITY_DEADLINE_COST_PER_CALL = 0.005

DEADLINE_PENDING = "pending"
DEADLINE_COMPLETED = "completed"
DEADLINE_FAILED = "failed"
DEADLINE_SKIPPED = "skipped"

# Accept either a clean ISO date (YYYY-MM-DD) or one of these sentinels.
_ROLLING_SENTINELS = frozenset({"rolling", "unknown", "n/a", "no deadline"})
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _build_prompt(company: str, title: str, category: str) -> str:
    """One-line user message asking Perplexity for the deadline.

    Constrained output format so the response is trivially parseable. The
    cycle hint lets Perplexity reason about the real recruiting calendar
    (e.g., "MBB Summer 2027 typically closes early October").
    """
    cycle_hint = {
        "ib_summer_analyst": "investment banking summer analyst cycle",
        "consulting_summer": "MBB / consulting summer associate cycle",
        "consulting_new_grad": "consulting full-time analyst / associate cycle",
        "quant_intern": "quant trading / research internship cycle",
        "year_coded_analyst": "year-coded analyst program cycle",
    }.get(category, "recruiting cycle")

    return (
        f"What is the application deadline for the {title} role at {company} "
        f"({cycle_hint})? Reply with exactly ONE of:\n"
        f"  - an ISO date in YYYY-MM-DD format, OR\n"
        f"  - the word 'rolling' if applications are accepted on a rolling basis, OR\n"
        f"  - the word 'unknown' if you cannot find a reliable date.\n"
        f"No other text, no explanation, no punctuation. Just one of those three answers."
    )


def _parse_response(content: str) -> tuple[Optional[str], str]:
    """Parse Perplexity's response into (deadline_value, status).

    Accepted shapes:
      "2026-10-01"        → ("2026-10-01", "completed")
      "rolling"           → ("rolling", "completed")
      "unknown"           → (None, "completed")  ← cached so we don't retry
      anything else       → (None, "failed")
    """
    if not isinstance(content, str):
        return None, DEADLINE_FAILED
    cleaned = content.strip().strip("'\"").lower()
    if not cleaned:
        return None, DEADLINE_FAILED

    if cleaned in _ROLLING_SENTINELS:
        return ("rolling" if cleaned == "rolling" else None), DEADLINE_COMPLETED

    # Sometimes Perplexity prefixes the date with prose; pull out the first
    # ISO-shaped substring as a last-resort recovery.
    m = re.search(r"\d{4}-\d{2}-\d{2}", cleaned)
    if m:
        candidate = m.group(0)
        if _ISO_DATE_RE.match(candidate):
            return candidate, DEADLINE_COMPLETED

    return None, DEADLINE_FAILED


def _eligible(data: dict) -> bool:
    """Return True if the job is in scope and hasn't been processed."""
    if data.get("expired"):
        return False
    if (data.get("category") or "").lower() not in CYCLE_DRIVEN_CATEGORIES:
        return False
    # Skip if Firecrawl already pulled a deadline from the posting.
    structured = data.get("structured") or {}
    if structured.get("application_deadline"):
        return False
    # Skip if we already extracted (success or failure both terminal).
    status = data.get("deadline_extraction_status")
    if status in (DEADLINE_COMPLETED, DEADLINE_FAILED, DEADLINE_SKIPPED):
        return False
    return True


def _collect_pending(db, limit: int) -> list:
    """Return [(doc_ref, data), ...] for cycle-driven jobs needing a deadline.

    No composite Firestore filter — the category set is fixed and small, so
    we scan recent jobs and filter in Python. Cheap because the `jobs`
    collection is already bounded by the 30-day lookback and we cap at
    `limit` candidates.
    """
    candidates: list = []
    # Pull the newest first so we prioritize active postings over stale ones.
    query = (
        db.collection("jobs")
        .order_by("posted_at", direction="DESCENDING")
        .limit(min(limit * 8, 1000))  # scan up to 8x for filtering headroom
    )
    for d in query.stream():
        data = d.to_dict() or {}
        if _eligible(data):
            candidates.append((d.reference, data))
            if len(candidates) >= limit:
                break
    return candidates


def extract_deadlines(limit: int = MAX_PERPLEXITY_PER_RUN) -> dict:
    """Extract application deadlines for up to `limit` cycle-driven jobs.

    Returns {processed, completed, failed, skipped, cost_estimate_usd}.
    """
    from app.config import PERPLEXITY_API_KEY
    from app.extensions import get_db
    from app.services.perplexity_client import quick_search

    if not PERPLEXITY_API_KEY:
        logger.warning("PERPLEXITY_API_KEY not set; deadline extractor is a no-op")
        return {
            "processed": 0, "completed": 0, "failed": 0, "skipped": 0,
            "cost_estimate_usd": 0.0,
        }

    db = get_db()
    if not db:
        raise RuntimeError("Firestore not initialized")

    capped = min(max(1, limit), MAX_PERPLEXITY_PER_RUN)
    candidates = _collect_pending(db, capped)
    if not candidates:
        logger.info("No cycle-driven jobs needing deadline extraction")
        return {
            "processed": 0, "completed": 0, "failed": 0, "skipped": 0,
            "cost_estimate_usd": 0.0,
        }

    logger.info("Extracting deadlines for %d jobs", len(candidates))

    completed = 0
    failed = 0
    skipped = 0
    now = datetime.now(timezone.utc)

    for ref, data in candidates:
        company = (data.get("company") or "").strip()
        title = (data.get("title") or "").strip()
        category = (data.get("category") or "").strip()
        if not company or not title:
            try:
                ref.update({"deadline_extraction_status": DEADLINE_SKIPPED})
            except Exception:
                pass
            skipped += 1
            continue

        prompt = _build_prompt(company, title, category)
        try:
            result = quick_search(prompt)
            content = (result or {}).get("content") or ""
            deadline_value, status = _parse_response(content)
        except Exception as e:
            logger.warning("Perplexity call failed for %s @ %s: %s", title, company, e)
            deadline_value, status = None, DEADLINE_FAILED

        update = {
            "deadline_extraction_status": status,
            "deadline_extracted_at": now,
        }
        if deadline_value is not None:
            update["application_deadline"] = deadline_value
            update["deadline_source"] = "perplexity"

        try:
            ref.update(update)
        except Exception as e:
            logger.warning("Failed to write deadline for %s @ %s: %s", title, company, e)
            failed += 1
            continue

        if status == DEADLINE_COMPLETED:
            completed += 1
        else:
            failed += 1

    result = {
        "processed": len(candidates),
        "completed": completed,
        "failed": failed,
        "skipped": skipped,
        "cost_estimate_usd": round(len(candidates) * PERPLEXITY_DEADLINE_COST_PER_CALL, 4),
    }
    logger.info("Deadline extraction complete: %s", result)
    return result
