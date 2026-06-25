"""Job posting enrichment via Firecrawl.

Phase 1 of the job-board audit. Reads jobs flagged
`enrichment_status='pending'` from Firestore, calls Firecrawl to extract
structured fields (requirements, experience_level, salary_range, etc.),
and writes them back to the job doc under the `structured` map.

Designed to run as a cron decoupled from the main fetch pipeline so it can
work through backlog between full-fetch cycles. Cross-user cache by
apply_url lives in `enrichment_cache` (managed inside firecrawl_client),
so duplicate-URL postings across sources only pay Firecrawl once per
TTL window.

Cost guardrails:
- MAX_FIRECRAWL_PER_RUN hard caps each cron tick at 500 scrapes
- Firecrawl is no-op if FIRECRAWL_API_KEY is unset (preserves the rest
  of the pipeline)
- failed jobs are marked enrichment_status='failed' so we don't retry
  them on every tick (manual reset clears them)
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

MAX_FIRECRAWL_PER_RUN = 500
DEFAULT_CONCURRENCY = 1     # cron path — safe, sequential
# Firecrawl Standard plan rate-limits at 175 req/min. With per-scrape time
# variance, concurrency=2 keeps us comfortably under the limit even on
# bursty Greenhouse/Lever pages. Raised concurrency burst-overruns the
# limit and causes 90%+ failures (learned the hard way on the first backfill).
BACKFILL_CONCURRENCY = 2

ENRICHMENT_PENDING = "pending"
ENRICHMENT_COMPLETED = "completed"
ENRICHMENT_FAILED = "failed"
ENRICHMENT_SKIPPED = "skipped"  # no apply_url to scrape

# Rough Firecrawl per-scrape cost for budget tracking
FIRECRAWL_COST_PER_SCRAPE = 0.003


def _extract_structured(url: str) -> dict | None:
    """Call Firecrawl on a single URL. Returns dict or None on failure."""
    if not url:
        return None
    try:
        from backend.app.services.firecrawl_client import extract_job_posting
        result = extract_job_posting(url)
        if isinstance(result, dict) and result:
            return result
    except Exception as e:
        logger.warning("extract_job_posting raised for %s: %s", url, e)
    return None


def _build_structured_field(extracted: dict) -> dict:
    """Project Firecrawl's JobPostingExtract dict into our `structured` schema."""
    return {
        "requirements": extracted.get("requirements") or [],
        "nice_to_have": extracted.get("nice_to_have") or [],
        "responsibilities": extracted.get("responsibilities") or [],
        "employment_type": extracted.get("employment_type"),
        "experience_level": extracted.get("experience_level"),
        "salary_range_text": extracted.get("salary_range"),
        "team": extracted.get("team_or_department"),
        "hiring_manager": extracted.get("hiring_manager"),
        "application_deadline": extracted.get("application_deadline"),
        "enriched_at": datetime.now(timezone.utc),
        "enrichment_source": "firecrawl",
    }


def _collect_pending(db, limit: int) -> list:
    """Return [(doc_ref, data), ...] for jobs where enrichment_status == pending.

    Note: no order_by — Firestore would require a composite index for
    (enrichment_status, fetched_at), and the cron runs every 30 min so
    FIFO ordering isn't load-bearing. Whatever Firestore returns first is fine.
    """
    from google.cloud.firestore_v1.base_query import FieldFilter
    query = (
        db.collection("jobs")
        .where(filter=FieldFilter("enrichment_status", "==", ENRICHMENT_PENDING))
        .limit(limit)
    )
    return [(d.reference, d.to_dict() or {}) for d in query.stream()]


def _collect_backfill(db, limit: int, since_days: int | None = None) -> list:
    """Return [(doc_ref, data), ...] for legacy jobs lacking enrichment_status.

    Streams the `jobs` collection (no Firestore filter — "missing field"
    queries aren't supported). Acceptable for one-shot backfill, NOT for
    the regular cron path. Jobs with pre-existing `structured` payloads
    are auto-promoted to enrichment_status=completed without burning a
    Firecrawl scrape.

    Args:
        since_days: if set, only includes jobs with posted_at >=
            (now - since_days). Avoids paying for jobs about to expire
            from the 14-day TTL or stale postings.
    """
    from datetime import datetime, timezone, timedelta
    cutoff = None
    if since_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)

    out = []
    promoted = 0
    skipped_old = 0
    seen_total = 0
    for doc in db.collection("jobs").stream():
        seen_total += 1
        data = doc.to_dict() or {}
        if data.get("enrichment_status"):
            continue
        if data.get("structured"):
            try:
                doc.reference.update({"enrichment_status": ENRICHMENT_COMPLETED})
                promoted += 1
            except Exception:
                pass
            continue
        if cutoff is not None:
            posted = data.get("posted_at")
            if posted is None:
                skipped_old += 1
                continue
            # Normalize Firestore Timestamp / naive datetime to aware UTC
            try:
                if hasattr(posted, "timestamp") and posted.tzinfo is None:
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
        "backfill scan: %d total seen, %d eligible, %d auto-promoted, %d skipped (too old)",
        seen_total, len(out), promoted, skipped_old,
    )
    return out


def enrich_jobs(limit: int = 200, backfill: bool = False, since_days: int | None = None) -> dict:
    """Enrich up to `limit` pending jobs (capped at MAX_FIRECRAWL_PER_RUN).

    Args:
        limit: max jobs to enrich this run
        backfill: True = scan whole collection for legacy entries; False = use
            the indexed enrichment_status='pending' query (regular cron path)
        since_days: backfill-only — only enrich jobs with posted_at within
            the last N days. Prevents spending on stale postings.

    Returns {processed, enriched, failed, skipped, cost_estimate_usd, mode}.
    """
    from backend.app.extensions import get_db
    from backend.app.config import FIRECRAWL_API_KEY

    if not FIRECRAWL_API_KEY:
        logger.warning("FIRECRAWL_API_KEY not set; enricher is a no-op")
        return {
            "processed": 0, "enriched": 0, "failed": 0, "skipped": 0,
            "cost_estimate_usd": 0.0, "mode": "noop_no_api_key",
        }

    db = get_db()
    if not db:
        raise RuntimeError("Firestore not initialized")

    # Cron is hard-capped for safety; manual --backfill-enrich runs use the
    # user-specified limit so a one-shot backfill can do thousands in one pass.
    if backfill:
        capped = max(1, limit)
    else:
        capped = min(max(1, limit), MAX_FIRECRAWL_PER_RUN)
    mode = "backfill" if backfill else "cron"

    if backfill:
        logger.info(
            "Backfill mode: scanning jobs collection (since_days=%s)",
            since_days if since_days is not None else "all",
        )
        candidates = _collect_backfill(db, capped, since_days=since_days)
    else:
        candidates = _collect_pending(db, capped)

    if not candidates:
        logger.info("No %s jobs to enrich", "legacy" if backfill else "pending")
        return {
            "processed": 0, "enriched": 0, "failed": 0, "skipped": 0,
            "cost_estimate_usd": 0.0, "mode": mode,
        }

    concurrency = BACKFILL_CONCURRENCY if backfill else DEFAULT_CONCURRENCY
    logger.info("Enriching %d jobs (mode=%s, concurrency=%d)",
                len(candidates), mode, concurrency)

    enriched = 0
    failed = 0
    skipped = 0
    processed = 0

    def _process_one(ref, data):
        url = data.get("apply_url") or data.get("url")
        if not url:
            try:
                ref.update({"enrichment_status": ENRICHMENT_SKIPPED})
            except Exception:
                pass
            return "skipped"

        extracted = _extract_structured(url)
        if extracted:
            structured = _build_structured_field(extracted)
            try:
                ref.update({
                    "structured": structured,
                    "enrichment_status": ENRICHMENT_COMPLETED,
                })
                return "enriched"
            except Exception as e:
                logger.warning("Failed to write structured for %s: %s", url, e)
                return "failed"

        try:
            ref.update({
                "enrichment_status": ENRICHMENT_FAILED,
                "enrichment_failed_at": datetime.now(timezone.utc),
            })
        except Exception:
            pass
        return "failed"

    if concurrency <= 1:
        for ref, data in candidates:
            outcome = _process_one(ref, data)
            enriched += outcome == "enriched"
            failed += outcome == "failed"
            skipped += outcome == "skipped"
            processed += 1
    else:
        with ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix="enrich") as pool:
            futures = [pool.submit(_process_one, ref, data) for ref, data in candidates]
            for fut in as_completed(futures):
                try:
                    outcome = fut.result()
                except Exception as e:
                    logger.warning("worker raised: %s", e)
                    outcome = "failed"
                enriched += outcome == "enriched"
                failed += outcome == "failed"
                skipped += outcome == "skipped"
                processed += 1
                if processed % 100 == 0:
                    logger.info("  progress: %d/%d (enriched=%d failed=%d skipped=%d)",
                                processed, len(candidates), enriched, failed, skipped)

    result = {
        "processed": len(candidates),
        "enriched": enriched,
        "failed": failed,
        "skipped": skipped,
        "cost_estimate_usd": round(enriched * FIRECRAWL_COST_PER_SCRAPE, 4),
        "mode": mode,
    }
    logger.info("Enrichment complete: %s", result)
    return result
