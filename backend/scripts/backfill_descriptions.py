"""Backfill description_raw for jobs missing it. Idempotent.

Scope:
  - greenhouse, lever, ashby: refetch from the public ATS list endpoint and
    fill description_raw in place. Free per call.
  - simplify: SKIP. The source listing JSON does not carry a description,
    so the fetcher writes "" at ingestion. Nothing to backfill.
  - fantasticjobs: SKIP. Paid per call; we are not paying to recover
    descriptions that were dropped at ingestion time.

For each in-scope (source, slug) pair we call the existing pipeline
fetcher exactly once, build a {job_id -> description_raw} lookup, then
update only the docs that need it. Jobs whose IDs are no longer in the
live ATS response are counted as `delisted` and left untouched.

We touch only the `description_raw` field via `.update()`, so
`enrichment_status` and `title_enrichment_status` are not reset. This is
the explicit reason we are not using a writer-level upsert.

Usage:
  python -m backend.scripts.backfill_descriptions --dry-run
  python -m backend.scripts.backfill_descriptions --dry-run --verbose
  python -m backend.scripts.backfill_descriptions --source=greenhouse --dry-run
  python -m backend.scripts.backfill_descriptions
"""
import logging
import os
import sys
from collections import defaultdict

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))

from pipeline.fetcher import _fetch_greenhouse, _fetch_lever, _fetch_ashby

logger = logging.getLogger("backfill_descriptions")

COLLECTION = "jobs"
BATCH_WRITE_SIZE = 400
FETCHERS = {
    "greenhouse": _fetch_greenhouse,
    "lever": _fetch_lever,
    "ashby": _fetch_ashby,
}
IN_SCOPE_SOURCES = tuple(FETCHERS.keys())


def _parse_flag(name: str) -> bool:
    return f"--{name}" in sys.argv


def _parse_value(name: str, default=None):
    for arg in sys.argv:
        if arg.startswith(f"--{name}="):
            return arg.split("=", 1)[1]
    return default


def _scan_missing(db, source_filter: str | None) -> tuple[dict, dict]:
    """Walk the jobs collection. Return (grouped, counters).

    grouped: {(source, slug): [{"job_id": ..., "remote_id": ...}, ...]}
    counters: {has_desc, simplify, fantasticjobs, unparseable, in_scope}
    """
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    counters: dict[str, int] = defaultdict(int)

    for doc in db.collection(COLLECTION).stream():
        data = doc.to_dict() or {}
        desc = data.get("description_raw")
        if desc:
            counters["has_desc"] += 1
            continue

        source = data.get("source") or ""
        if source == "simplify":
            counters["simplify"] += 1
            continue
        if source == "fantasticjobs":
            counters["fantasticjobs"] += 1
            continue
        if source not in IN_SCOPE_SOURCES:
            counters["unparseable_source"] += 1
            continue
        if source_filter and source != source_filter:
            counters["filtered_out"] += 1
            continue

        parts = doc.id.split("_", 2)
        if len(parts) != 3 or parts[0] != source:
            counters["unparseable_id"] += 1
            continue
        _, slug, remote_id = parts
        grouped[(source, slug)].append({"job_id": doc.id, "remote_id": remote_id})
        counters["in_scope"] += 1

    return grouped, counters


def _log_scan(grouped: dict, counters: dict) -> None:
    logger.info("Scan complete:")
    logger.info("  has description (skip):     %d", counters.get("has_desc", 0))
    logger.info("  simplify (no source desc):  %d", counters.get("simplify", 0))
    logger.info("  fantasticjobs (paid):       %d", counters.get("fantasticjobs", 0))
    logger.info("  unparseable source:         %d", counters.get("unparseable_source", 0))
    logger.info("  unparseable id:             %d", counters.get("unparseable_id", 0))
    if counters.get("filtered_out"):
        logger.info("  filtered out (--source):    %d", counters["filtered_out"])
    logger.info("  in scope to backfill:       %d jobs across %d (source, slug) pairs",
                counters.get("in_scope", 0), len(grouped))

    if grouped:
        by_source: dict[str, int] = defaultdict(int)
        for (source, _slug), jobs in grouped.items():
            by_source[source] += len(jobs)
        for src, n in sorted(by_source.items()):
            logger.info("    %-12s %d jobs", src, n)

        sample_key = next(iter(grouped))
        sample_jobs = grouped[sample_key]
        logger.info("  Sample group: %s -> %d jobs (first job_id: %s)",
                    sample_key, len(sample_jobs), sample_jobs[0]["job_id"])


def _refetch_company(source: str, slug: str) -> dict[str, str]:
    """Call the pipeline fetcher for one company. Return {job_id: description_raw}."""
    fetcher = FETCHERS[source]
    jobs = fetcher(slug)
    return {j["job_id"]: (j.get("description_raw") or "") for j in jobs}


def _commit_batch(db, pending: list[tuple[str, str]]) -> None:
    """Flush a list of (job_id, description) pairs as a single Firestore batch."""
    if not pending:
        return
    batch = db.batch()
    for job_id, description in pending:
        ref = db.collection(COLLECTION).document(job_id)
        batch.update(ref, {"description_raw": description})
    batch.commit()


def _init_firestore():
    """Standalone Firestore client (no Flask app). Mirrors salary_backfill_t1_t2.py."""
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        else:
            firebase_admin.initialize_app()
    return firestore.client()


def backfill(dry_run: bool, source_filter: str | None, verbose: bool) -> dict:
    db = _init_firestore()
    if not db:
        raise RuntimeError("Firestore not initialized")

    grouped, counters = _scan_missing(db, source_filter)
    _log_scan(grouped, counters)

    if not grouped:
        return {"updated": 0, "delisted": 0, "no_op": True}

    if dry_run:
        logger.info("[DRY RUN] No refetch, no writes.")
        return {"updated": 0, "delisted": 0, "dry_run": True, "would_update": counters["in_scope"]}

    updated = 0
    delisted_count = 0
    refetch_failures = 0
    pending: list[tuple[str, str]] = []

    for (source, slug), jobs in grouped.items():
        logger.info("Refetching %s [%s] (%d jobs to fill)", source, slug, len(jobs))
        try:
            live = _refetch_company(source, slug)
        except Exception as exc:
            logger.warning("  refetch failed for %s [%s]: %s", source, slug, exc)
            refetch_failures += 1
            continue

        for job_meta in jobs:
            jid = job_meta["job_id"]
            desc = live.get(jid)
            if desc:
                pending.append((jid, desc))
                updated += 1
                if verbose:
                    logger.info("  + %s (%d chars)", jid, len(desc))
            else:
                delisted_count += 1
                if verbose:
                    logger.info("  - %s delisted at source", jid)

            if len(pending) >= BATCH_WRITE_SIZE:
                _commit_batch(db, pending)
                logger.info("  Flushed %d updates", len(pending))
                pending = []

    if pending:
        _commit_batch(db, pending)
        logger.info("  Flushed final %d updates", len(pending))

    result = {
        "updated": updated,
        "delisted": delisted_count,
        "refetch_failures": refetch_failures,
    }
    logger.info("Backfill complete: %s", result)
    return result


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    dry_run = _parse_flag("dry-run")
    verbose = _parse_flag("verbose")
    source_filter = _parse_value("source")
    if source_filter and source_filter not in IN_SCOPE_SOURCES:
        logger.error("--source must be one of %s, got %r", IN_SCOPE_SOURCES, source_filter)
        return 2

    result = backfill(dry_run=dry_run, source_filter=source_filter, verbose=verbose)
    logger.info("Result: %s", result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
