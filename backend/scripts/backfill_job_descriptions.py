"""
One-time pre-fill for job docs whose `description_raw` is empty (chiefly
Simplify-sourced internships, which ingest with no prose). Fills the field so
the job-board detail pane shows a real description instantly instead of
"No description provided" — and so the live `/api/jobs/<id>/description`
endpoint never has to scrape inside a user request.

Cost model — cheapest path first:
  1. If the doc already has an enriched `structured` map, compose the
     description from it. FREE and instant — no API call. This covers the bulk
     of the gap, since Simplify jobs get a `structured` map at enrichment time
     but had their prose discarded before the schema carried a `description`.
  2. Only if there is NO structured data do we scrape the apply URL via
     Firecrawl for real prose. Capped by --max-scrapes so the Firecrawl bill is
     bounded; --no-scrape disables this path entirely (zero API cost).

This runs offline, completely outside the live request path, so it has no
effect on website or job-board load speed. Going forward the pipeline enricher
fills `description_raw` at ingest, so the backlog does not rebuild.

Usage:
    # zero-cost preview of what would change
    python -m backend.scripts.backfill_job_descriptions --dry-run

    # free pass: fill only from existing structured data, no scraping
    python -m backend.scripts.backfill_job_descriptions --commit --no-scrape

    # full pass: structured first, then scrape bare jobs (budget-capped)
    python -m backend.scripts.backfill_job_descriptions --commit \
        --max-scrapes 300 --since-days 14

Safety rails:
  - --dry-run is the default. Nothing is written without --commit.
  - --since-days N skips jobs older than N days (the jobs collection has a
    ~14-day TTL, so there is no point paying to enrich about-to-expire docs).
  - --max-scrapes caps live Firecrawl calls per run (default 200).
  - --limit caps docs scanned in one run for canary testing.
  - Snapshot-cursor pagination (same pattern as backfill_description_entities).
  - Never overwrites a non-empty description_raw.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timezone, timedelta

# Add project root so `backend.*` imports resolve when run as a script.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.extensions import get_db
# Reuse the canonical compose logic the live endpoint uses — one source of truth.
# Imported from the dependency-free helper module so this CLI does not pull in
# the Flask blueprint package.
from backend.app.services.job_description import compose_from_structured as _compose_from_structured

logger = logging.getLogger(__name__)

COLLECTION = "jobs"
BATCH_SIZE = 400
PAGE_SIZE = 500
DEFAULT_MAX_SCRAPES = 200


def _ensure_firebase_admin() -> None:
    """Initialize Firebase Admin SDK for standalone CLI runs (mirrors the
    pattern in backfill_description_entities). No-op if already initialized."""
    import firebase_admin
    from firebase_admin import credentials
    if firebase_admin._apps:
        return
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not cred_path:
        raise SystemExit(
            "GOOGLE_APPLICATION_CREDENTIALS is not set. Source the project "
            "env first, e.g. `set -a; source .env; set +a`, or set the var "
            "to the path of your firebase-credentials.json."
        )
    firebase_admin.initialize_app(credentials.Certificate(cred_path))


def _iter_jobs(db, page_size: int = PAGE_SIZE):
    """Stream all job docs in document-key order with snapshot cursors.

    No source filter: any source can have an empty description_raw. Default
    `__name__` ordering needs no composite index and gives stable pagination.
    """
    last_snap = None
    while True:
        q = db.collection(COLLECTION).order_by("__name__").limit(page_size)
        if last_snap is not None:
            q = q.start_after(last_snap)
        docs = list(q.stream())
        if not docs:
            return
        for d in docs:
            yield d
        last_snap = docs[-1]


def _within_window(data: dict, cutoff: datetime | None) -> bool:
    """True if the job is recent enough to be worth filling (or no window set)."""
    if cutoff is None:
        return True
    posted = data.get("posted_at")
    if posted is None:
        return False
    try:
        if hasattr(posted, "tzinfo") and posted.tzinfo is None:
            posted = posted.replace(tzinfo=timezone.utc)
        return posted >= cutoff
    except Exception:
        return False


def _scrape_description(url: str) -> str:
    """Live Firecrawl scrape for real prose. Returns "" on any failure.

    Uses the render-wait so JS-rendered postings (e.g. Workday) yield their real
    description text rather than an empty loading shell — same setting the
    background enricher uses.
    """
    try:
        from backend.app.services.firecrawl_client import extract_job_posting
        wait_ms = int(os.environ.get("JOB_DESC_SCRAPE_WAIT_MS", "8000"))
        extracted = extract_job_posting(url, wait_for_ms=wait_ms) or {}
        desc = (extracted.get("description") or "").strip()
        return desc or _compose_from_structured(extracted)
    except Exception:
        logger.warning("scrape failed for %s", url, exc_info=True)
        return ""


def run(commit: bool, limit: int | None, since_days: int | None,
        max_scrapes: int, allow_scrape: bool) -> dict:
    _ensure_firebase_admin()
    db = get_db()
    if not db:
        raise RuntimeError("Firestore DB not initialized")

    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=since_days)
        if since_days is not None else None
    )

    scanned = 0
    empty = 0
    filled_from_structured = 0
    filled_from_scrape = 0
    scrapes_used = 0
    skipped_old = 0
    skipped_no_source = 0
    written = 0
    pending: list[tuple[str, str]] = []

    started_at = datetime.now(timezone.utc)
    logger.info(
        "Job-description pre-fill starting. commit=%s limit=%s since_days=%s "
        "max_scrapes=%s allow_scrape=%s",
        commit, limit, since_days, max_scrapes, allow_scrape,
    )

    for snap in _iter_jobs(db):
        scanned += 1
        if limit and scanned > limit:
            break
        data = snap.to_dict() or {}
        if (data.get("description_raw") or "").strip():
            continue  # already has prose — never overwrite
        empty += 1

        if not _within_window(data, cutoff):
            skipped_old += 1
            continue

        # 1. Free path: compose from already-enriched structured data.
        desc = _compose_from_structured(data.get("structured") or {})
        source = "structured"

        # 2. Paid path: only for jobs with no structured data, and only while
        #    we are under the per-run scrape budget.
        if not desc and allow_scrape and scrapes_used < max_scrapes:
            url = (data.get("apply_url") or data.get("url") or "").strip()
            if url:
                scrapes_used += 1
                desc = _scrape_description(url)
                source = "scrape"

        if not desc:
            if not (data.get("structured") or data.get("apply_url") or data.get("url")):
                skipped_no_source += 1
            continue

        if source == "structured":
            filled_from_structured += 1
        else:
            filled_from_scrape += 1
        pending.append((snap.id, desc))

        if commit and len(pending) >= BATCH_SIZE:
            written += _flush(db, pending)
            pending.clear()
            logger.info(
                "progress: scanned=%d empty=%d filled(struct=%d scrape=%d) written=%d",
                scanned, empty, filled_from_structured, filled_from_scrape, written,
            )

    if commit and pending:
        written += _flush(db, pending)
        pending.clear()

    result = {
        "scanned": scanned,
        "empty_description": empty,
        "filled_from_structured": filled_from_structured,
        "filled_from_scrape": filled_from_scrape,
        "scrapes_used": scrapes_used,
        "skipped_too_old": skipped_old,
        "skipped_no_source": skipped_no_source,
        "written": written if commit else 0,
        "dry_run": not commit,
        "started_at": started_at.isoformat(),
    }
    logger.info("Job-description pre-fill done: %s", result)
    return result


def _flush(db, pending: list[tuple[str, str]]) -> int:
    batch = db.batch()
    for jid, desc in pending:
        batch.update(
            db.collection(COLLECTION).document(jid),
            {"description_raw": desc},
        )
    batch.commit()
    return len(pending)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", action="store_true", help="Actually write updates")
    parser.add_argument("--dry-run", action="store_true", help="Default, scan only")
    parser.add_argument("--limit", type=int, default=None, help="Cap docs scanned")
    parser.add_argument(
        "--since-days", type=int, default=None,
        help="Only fill jobs posted within the last N days (skip near-expiry docs)",
    )
    parser.add_argument(
        "--max-scrapes", type=int, default=DEFAULT_MAX_SCRAPES,
        help="Cap live Firecrawl scrapes per run (bare jobs only)",
    )
    parser.add_argument(
        "--no-scrape", action="store_true",
        help="Fill only from existing structured data; zero API cost",
    )
    parser.add_argument(
        "--log-level", default="INFO",
        help="Logging verbosity (DEBUG / INFO / WARNING)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if args.commit and args.dry_run:
        print("Pick one: --commit OR --dry-run", file=sys.stderr)
        return 2

    result = run(
        commit=bool(args.commit),
        limit=args.limit,
        since_days=args.since_days,
        max_scrapes=args.max_scrapes,
        allow_scrape=not args.no_scrape,
    )
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
