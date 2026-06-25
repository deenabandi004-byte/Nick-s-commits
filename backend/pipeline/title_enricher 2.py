"""Job title pre-enrichment via PDL Job Title Enrichment.

Cheap, universal level/role signal for every job — runs as a separate cron
pass that mirrors enricher.py's contract. Where Firecrawl is the expensive,
high-fidelity layer that fills `structured.{requirements, responsibilities,
nice_to_have, experience_level}` for the priority head, PDL title enrich is
the cheap layer that fills `structured.title_meta.{cleaned_name, levels,
role, sub_role}` for 100% of jobs (within budget).

Why a separate pass instead of inline at write-time:
- decouples PDL latency from the main fetch cron
- lets us backfill the existing 12.9k jobs independently
- matches the shape of the existing Firecrawl enricher (one mental model)

Cost guardrails live in `pdl_title_cache` (persistent Firestore cache,
per-run cap, 45k circuit breaker). This module just iterates and calls.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


TITLE_ENRICHMENT_PENDING = "pending"
TITLE_ENRICHMENT_COMPLETED = "completed"
TITLE_ENRICHMENT_SKIPPED = "skipped"  # no usable title
TITLE_ENRICHMENT_NOOP = "noop"        # PDL returned empty payload (no synonyms found)


def _build_title_meta(payload: dict) -> dict:
    """Project the PDL cache payload into the shape stored on each job."""
    return {
        "cleaned_name": payload.get("cleaned_name") or "",
        "levels": payload.get("levels") or [],
        "role": payload.get("role") or "",
        "sub_role": payload.get("sub_role") or "",
        "similar_titles": payload.get("similar_titles") or [],
        "enriched_at": datetime.now(timezone.utc),
        "enrichment_source": "pdl",
    }


def _collect_pending(db, limit: int) -> list:
    """Jobs flagged `title_enrichment_status='pending'`."""
    from google.cloud.firestore_v1.base_query import FieldFilter
    query = (
        db.collection("jobs")
        .where(filter=FieldFilter("title_enrichment_status", "==", TITLE_ENRICHMENT_PENDING))
        .limit(limit)
    )
    return [(d.reference, d.to_dict() or {}) for d in query.stream()]


def _collect_backfill(db, limit: int, since_days: int | None = None) -> list:
    """Scan for legacy jobs lacking title_enrichment_status (one-shot backfill).

    Same pattern as enricher._collect_backfill — Firestore doesn't support
    "missing field" queries, so this streams the collection. Use only for
    the initial backfill, not on the regular cron path.
    """
    from datetime import timedelta

    cutoff = None
    if since_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)

    out = []
    seen_total = 0
    skipped_old = 0
    for doc in db.collection("jobs").stream():
        seen_total += 1
        data = doc.to_dict() or {}
        if data.get("title_enrichment_status"):
            continue
        if cutoff is not None:
            posted = data.get("posted_at")
            if posted is None:
                skipped_old += 1
                continue
            try:
                if hasattr(posted, "timestamp") and getattr(posted, "tzinfo", None) is None:
                    posted = posted.replace(tzinfo=timezone.utc)
                if posted < cutoff:
                    skipped_old += 1
                    continue
            except Exception:
                skipped_old += 1
                continue
        out.append((doc.reference, data))
        if len(out) >= limit:
            break

    logger.info(
        "title-enrich backfill scan: %d total seen, %d eligible, %d skipped (too old)",
        seen_total, len(out), skipped_old,
    )
    return out


def enrich_titles(limit: int = 200, backfill: bool = False, since_days: int | None = None) -> dict:
    """Enrich up to `limit` jobs' titles via PDL (capped by the cache helper's MAX_PER_RUN).

    Sequential — PDL cache is the bottleneck, not the network. Concurrency
    would only race writes on the same cache slug for no speedup.

    Returns {processed, enriched, skipped, noop, mode}.
    """
    from backend.app.extensions import get_db
    from app.services.pdl_title_cache import (
        get_or_enrich_title,
        reset_run_counter,
        get_run_misses,
        MAX_PER_RUN,
    )

    db = get_db()
    if not db:
        raise RuntimeError("Firestore not initialized")

    capped = max(1, limit)
    mode = "backfill" if backfill else "cron"

    if backfill:
        candidates = _collect_backfill(db, capped, since_days=since_days)
    else:
        candidates = _collect_pending(db, capped)

    if not candidates:
        logger.info("No %s jobs to title-enrich", "legacy" if backfill else "pending")
        return {"processed": 0, "enriched": 0, "skipped": 0, "noop": 0, "mode": mode}

    reset_run_counter()
    logger.info("Title-enriching %d jobs (mode=%s, MAX_PER_RUN=%d)",
                len(candidates), mode, MAX_PER_RUN)

    enriched = 0
    skipped = 0
    noop = 0

    for ref, data in candidates:
        title = data.get("title")
        if not title or not isinstance(title, str):
            try:
                ref.update({"title_enrichment_status": TITLE_ENRICHMENT_SKIPPED})
            except Exception:
                pass
            skipped += 1
            continue

        payload = get_or_enrich_title(title)
        # Empty payload (no synonyms) is still a meaningful result — we record
        # it as 'noop' so we don't re-pay to learn it's still empty next run.
        has_signal = (
            payload.get("similar_titles")
            or payload.get("levels")
            or payload.get("role")
        )

        title_meta = _build_title_meta(payload)
        updates: dict = {
            "structured.title_meta": title_meta,
            "title_enrichment_status": (
                TITLE_ENRICHMENT_COMPLETED if has_signal else TITLE_ENRICHMENT_NOOP
            ),
        }

        # Only fill structured.experience_level if Firecrawl hasn't already.
        # Firecrawl's reading of the JD is higher fidelity than PDL's title
        # heuristic, so we never overwrite it.
        existing_structured = data.get("structured") or {}
        if not existing_structured.get("experience_level") and payload.get("levels"):
            updates["structured.experience_level"] = payload["levels"][0]

        try:
            ref.update(updates)
            if has_signal:
                enriched += 1
            else:
                noop += 1
        except Exception as e:
            logger.warning("Failed to write title_meta for %s: %s", title, e)

    result = {
        "processed": len(candidates),
        "enriched": enriched,
        "skipped": skipped,
        "noop": noop,
        "pdl_calls": get_run_misses(),
        "mode": mode,
    }
    logger.info("Title enrichment complete: %s", result)
    return result
