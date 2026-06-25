"""Reserve a fraction of the recommended feed for "stretch" / exploration jobs.

Per PURPOSEFUL_LEAKAGE_BRIEF.md, personalization should sharpen the top of
the feed but never close off the rest. With a strong profile the ranker
otherwise converges on a narrow band of look-alike roles. Carving out
~15-20% of the slots for adjacent jobs preserves serendipity.

This module is intentionally simple: deterministic split, no LLM call. The
adjacency signal is the embedding score (when available, from embedding_rank
pre-pass). Industry/geo adjacency follow-ups can layer in later.
"""

from __future__ import annotations

import logging
from typing import Iterable

logger = logging.getLogger(__name__)


DEFAULT_TOTAL_SLOTS = 150     # final cap on top_jobs
DEFAULT_STRICT_SLOTS = 130    # top N by composite
DEFAULT_STRETCH_SLOTS = 20    # carved from the next 30-55% band
DEFAULT_STRETCH_LOW = 30      # composite floor for stretch eligibility
DEFAULT_STRETCH_HIGH = 55     # composite ceiling for stretch eligibility


def _composite(job: dict) -> int:
    """Read the composite score (match_score), defaulting to 0."""
    s = job.get("match_score")
    if isinstance(s, (int, float)):
        return int(s)
    return 0


def _embedding_score(job: dict) -> float:
    """Read the embedding-rank score if present (set by embedding_rank)."""
    s = job.get("_embedding_score")
    if isinstance(s, (int, float)):
        return float(s)
    return 0.0


def carve_stretch_slots(
    jobs: list,
    *,
    total: int = DEFAULT_TOTAL_SLOTS,
    strict_n: int = DEFAULT_STRICT_SLOTS,
    stretch_n: int = DEFAULT_STRETCH_SLOTS,
    stretch_low: int = DEFAULT_STRETCH_LOW,
    stretch_high: int = DEFAULT_STRETCH_HIGH,
) -> tuple:
    """Split a ranked pool into strict + stretch sub-pools.

    `jobs` is expected to be sorted by composite score descending. Returns
    (top_jobs, counts) where:
      - top_jobs is the final list of length up to `total`, each tagged with
        a "slot" field of "strict" or "stretch"
      - counts is {"strict": int, "stretch": int} for telemetry

    Algorithm:
      1. strict = first `strict_n` jobs from the input
      2. eligible_stretch = remaining jobs whose composite is in
         [stretch_low, stretch_high]
      3. stretch = top `stretch_n` of eligible_stretch sorted by embedding
         score descending (the embedding adjacency signal). When embedding
         scores are absent (deterministic prefilter path), this falls back
         to composite descending, which still gives the highest-relevance
         non-top-130 jobs and is a reasonable proxy.
      4. top_jobs = strict + stretch
      5. Tag each job with its slot label

    The strict pool always keeps its sort order. The stretch pool follows
    after; the FE preserves backend order and the stretch jobs naturally
    surface at the bottom of the feed.
    """
    if not jobs:
        return [], {"strict": 0, "stretch": 0}

    # Defensive: re-sort by composite so callers can pass any pool.
    pool = sorted(jobs, key=_composite, reverse=True)

    strict = pool[:strict_n]
    remaining = pool[strict_n:]

    eligible_stretch = [
        j for j in remaining
        if stretch_low <= _composite(j) <= stretch_high
    ]
    # Prefer embedding-adjacent first. Falls back to composite descending
    # when no embeddings are present (deterministic prefilter path).
    eligible_stretch.sort(
        key=lambda j: (_embedding_score(j), _composite(j)),
        reverse=True,
    )
    stretch = eligible_stretch[:stretch_n]

    for j in strict:
        j["slot"] = "strict"
    for j in stretch:
        j["slot"] = "stretch"

    top_jobs = (strict + stretch)[:total]
    counts = {
        "strict": sum(1 for j in top_jobs if j.get("slot") == "strict"),
        "stretch": sum(1 for j in top_jobs if j.get("slot") == "stretch"),
    }
    logger.info(
        "stretch carve: strict=%d stretch=%d (eligible_pool=%d, input=%d)",
        counts["strict"], counts["stretch"], len(eligible_stretch), len(pool),
    )
    return top_jobs, counts


def count_narrative_boosted(jobs: Iterable[dict], profile: dict) -> int:
    """Best-effort count of jobs whose ranking benefited from narrative input.

    Honest measure: we don't have a perfect "this job got +N from narrative"
    signal because the narrative is embedded once with the rest of the
    profile. As a proxy, count jobs whose embedding score is non-zero AND
    the user has populated either narrative field. Below the embedding-rank
    feature flag (deterministic path) the count is always 0, which is the
    truthful answer.
    """
    has_narrative = bool(
        (profile.get("directionNarrative") or "").strip()
        or (profile.get("personalContext") or "").strip()
    )
    if not has_narrative:
        return 0
    return sum(1 for j in jobs if _embedding_score(j) > 0)
