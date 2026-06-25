"""
Match reasoning — ensure every visible job has a specific "why this matched"
sentence, never the generic "Matched to your profile" fallback.

Phase 3 of the Job Board Elevation Plan (docs/JOB_BOARD_ELEVATION_PLAN.md).

The existing system already does well:
  - rank_with_gpt() generates GPT-4o-mini reasons with anti-generic prompts
  - _derive_reason() builds data-derived reasons from real job + profile fields
  - _is_generic_reason() catches GPT fallback fluff and replaces it

The gap was first-load UX: users hitting /api/jobs/feed before the
background re-rank completes saw `match_reason: null`, which the frontend
rendered as "Matched to your profile" — the exact phrase the rest of the
system was built to avoid.

This module is the synchronous fallback. It runs on the request path and
fills any null match_reason with a data-derived sentence in microseconds.
No LLM call, no Firestore write — the background rerank handles the
higher-quality GPT pass once and caches the result.

If we later want LLM polish for first-load specifically, this is the right
place to add a batched call + (resume_hash, job_id) → reason cache. Left as
a TODO inside fill_match_reasons() so the wiring is in place.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.utils.job_ranking import _derive_reason, _is_generic_reason

logger = logging.getLogger(__name__)


def fill_match_reasons(
    jobs: list[dict],
    profile: dict,
    *,
    top_n: int = 10,
) -> int:
    """Mutate `jobs` in place so the first `top_n` have a non-generic
    match_reason. Returns the number of jobs filled.

    Mutates only when needed — jobs with a non-generic reason already set
    by rank_with_gpt are left alone. Safe to call on an empty list.
    """
    if not jobs:
        return 0
    filled = 0
    for job in jobs[:top_n]:
        existing = job.get("match_reason")
        if existing and not _is_generic_reason(existing):
            continue
        derived = _derive_reason(job, profile or {})
        if not derived:
            continue
        job["match_reason"] = derived
        filled += 1

    # TODO(phase-3-llm-polish): when we want the LLM-quality sentence on
    # first load, batch the still-null/generic top_n into one gpt-4o-mini
    # call and cache by (resume_hash, job_id) in Firestore with a 7-day TTL.
    # The derived fallback above is the ground floor for if/when that fails.

    if filled:
        logger.info("[MatchReasoning] filled %d derived match_reasons", filled)
    return filled
