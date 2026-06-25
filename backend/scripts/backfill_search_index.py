"""
One-time backfill that populates `search_terms`, rewrites `company` to the
canonical brand, and preserves the original under `company_raw` on every job
document.

Usage:
    python -m backend.scripts.backfill_search_index --dry-run
    python -m backend.scripts.backfill_search_index --commit

Safety rails:
  - --dry-run is the default. Nothing is written without --commit.
  - Skips docs that already match what the normalizer would produce, so
    re-running on top of a previous run is a near-no-op.
  - Batches writes at BATCH_SIZE per commit, with progress logs.
  - --limit N caps the number of docs touched in a single run for testing.
  - Reads in chunks via `posted_at` cursor so the script does not have to
    hold the whole collection in memory.

This script is intentionally separate from the pipeline run so we can verify
the diff on a small slice (e.g. --limit 200 --commit) before sweeping the
whole collection.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timezone

# Add project root so `backend.*` imports resolve when run as a script.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.extensions import get_db
from backend.pipeline.normalizer import build_search_terms, canonicalize_company

logger = logging.getLogger(__name__)


def _ensure_firebase_admin() -> None:
    """Initialize Firebase Admin SDK for standalone CLI runs.

    The Flask app calls `init_firebase()` at boot, but this script is a CLI
    entry point that bypasses that path. Reads the service-account JSON from
    GOOGLE_APPLICATION_CREDENTIALS (the same env var the Flask app uses).
    No-op if Firebase Admin is already initialized.
    """
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

COLLECTION = "jobs"
BATCH_SIZE = 400
PAGE_SIZE = 500


def _compute_update(doc: dict) -> dict | None:
    """Return the dict of fields the doc is missing or has wrong, or None if
    nothing needs to change. We always recompute against the live normalizer
    so a single script handles both initial backfill and re-runs after the
    alias table grows.
    """
    raw_company = doc.get("company_raw") or doc.get("company")
    canonical = canonicalize_company(raw_company)
    terms = build_search_terms(doc.get("title"), canonical, doc.get("location"))

    update: dict = {}
    if doc.get("company") != canonical and canonical:
        update["company"] = canonical
    # company_raw is set the first time we see this doc, then never overwritten.
    if not doc.get("company_raw") and raw_company:
        update["company_raw"] = raw_company
    if doc.get("search_terms") != terms:
        update["search_terms"] = terms
    return update or None


def _iter_jobs(db, page_size: int = PAGE_SIZE):
    """Stream the jobs collection in posted_at-descending pages so the
    script tolerates restart without re-scanning the head of the index.

    Cursors via the last DocumentSnapshot (not just its posted_at value).
    A dict cursor like start_after({"posted_at": X}) skips EVERY doc whose
    posted_at equals X, which silently drops tie groups when a page
    boundary lands inside one. Snapshot-based cursors carry Firestore's
    implicit __name__ tiebreaker so ties are paginated through doc by doc.
    """
    last_snap = None
    while True:
        q = db.collection(COLLECTION).order_by(
            "posted_at", direction="DESCENDING"
        ).limit(page_size)
        if last_snap is not None:
            q = q.start_after(last_snap)
        docs = list(q.stream())
        if not docs:
            return
        for d in docs:
            yield d
        last_snap = docs[-1]


def run(commit: bool, limit: int | None) -> dict:
    _ensure_firebase_admin()
    db = get_db()
    if not db:
        raise RuntimeError("Firestore DB not initialized")

    scanned = 0
    needs_update = 0
    written = 0
    company_rewrites = 0
    pending: list[tuple[str, dict]] = []

    started_at = datetime.now(timezone.utc)
    logger.info(
        "Backfill starting. commit=%s limit=%s started_at=%s",
        commit, limit, started_at.isoformat(),
    )

    for snap in _iter_jobs(db):
        scanned += 1
        if limit and scanned > limit:
            break
        data = snap.to_dict() or {}
        update = _compute_update(data)
        if not update:
            continue
        needs_update += 1
        if "company" in update:
            company_rewrites += 1
        pending.append((snap.id, update))

        if commit and len(pending) >= BATCH_SIZE:
            written += _flush(db, pending)
            pending.clear()
            logger.info(
                "Backfill progress: scanned=%d written=%d company_rewrites=%d",
                scanned, written, company_rewrites,
            )

    if commit and pending:
        written += _flush(db, pending)
        pending.clear()

    result = {
        "scanned": scanned,
        "needs_update": needs_update,
        "company_rewrites": company_rewrites,
        "written": written if commit else 0,
        "dry_run": not commit,
        "started_at": started_at.isoformat(),
    }
    logger.info("Backfill done: %s", result)
    return result


def _flush(db, pending: list[tuple[str, dict]]) -> int:
    batch = db.batch()
    for jid, update in pending:
        batch.update(db.collection(COLLECTION).document(jid), update)
    batch.commit()
    return len(pending)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", action="store_true", help="Actually write updates")
    parser.add_argument("--dry-run", action="store_true", help="Default, scan only")
    parser.add_argument("--limit", type=int, default=None, help="Cap docs scanned")
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
    commit = bool(args.commit)
    result = run(commit=commit, limit=args.limit)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
