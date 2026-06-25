"""
One-time backfill that fixes Greenhouse job docs whose `description_raw` was
written with HTML entities still encoded (`&lt;p&gt;...` instead of `<p>...`
or stripped plain text). New writes are clean now that fetcher._fetch_greenhouse
runs html.unescape before _strip_html; this script repairs the historical docs.

Usage:
    python -m backend.scripts.backfill_description_entities --dry-run
    python -m backend.scripts.backfill_description_entities --commit
    python -m backend.scripts.backfill_description_entities --limit 500 --commit

Safety rails:
  - --dry-run is the default. Nothing is written without --commit.
  - Targets `source == "greenhouse"` only. Other sources have not exhibited
    this issue in the audit sample; if they ever do, add their source string
    to the SOURCES tuple below and re-run.
  - Skips docs whose description_raw does not contain `&lt;`, `&gt;`, `&amp;`,
    or `&#`. Re-running on top of a previous run is a near no-op.
  - Snapshot-cursor pagination (the same cursor pattern as the search-index
    backfill) so same-timestamp tie groups are not dropped.
  - Batches writes at BATCH_SIZE per commit with progress logs.
  - --limit N caps the docs scanned in one run for canary testing.

This script is intentionally separate from the pipeline run so we can verify
the diff on a small slice (e.g. --limit 200 --commit) before sweeping the
whole collection.
"""
from __future__ import annotations

import argparse
import html
import logging
import os
import re
import sys
from datetime import datetime, timezone

# Add project root so `backend.*` imports resolve when run as a script.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.extensions import get_db

logger = logging.getLogger(__name__)


def _ensure_firebase_admin() -> None:
    """Initialize Firebase Admin SDK for standalone CLI runs.

    The Flask app calls `init_firebase()` at boot, but this script is a CLI
    entry point that bypasses that path. Reads the service-account JSON from
    GOOGLE_APPLICATION_CREDENTIALS. No-op if already initialized.
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
SOURCES = ("greenhouse",)

_TAG_RE = re.compile(r"<[^>]+>")
_ENTITY_MARKER_RE = re.compile(r"&(?:lt|gt|amp|quot|#\d+);", re.IGNORECASE)


def _strip_html(text: str) -> str:
    """Mirror of fetcher._strip_html so this script is self-contained."""
    return re.sub(r"\s+", " ", _TAG_RE.sub(" ", text)).strip()


def _clean_description(raw: str) -> str:
    """Same pipeline the live scraper now uses: unescape entities first, then
    strip any tags the decode reveals, then collapse whitespace. Idempotent
    on already-clean text (entities decode to themselves, no tags survive).
    """
    return _strip_html(html.unescape(raw))


def _needs_repair(raw: str | None) -> bool:
    """Cheap pre-check. If the field has no entity markers at all we already
    skip the write; checking up-front lets us avoid even computing the clean
    value for the majority of already-correct docs.
    """
    if not isinstance(raw, str) or not raw:
        return False
    return bool(_ENTITY_MARKER_RE.search(raw))


def _iter_greenhouse_jobs(db, page_size: int = PAGE_SIZE):
    """Stream greenhouse docs in document-key order with snapshot cursors.

    A backfill does not need any particular sort, just one visit per doc.
    Using the default `__name__` ordering avoids needing a composite index
    on (source, posted_at), which this one-time job would never use again
    after the sweep. Snapshot-based start_after still produces stable
    pagination.
    """
    last_snap = None
    while True:
        q = (
            db.collection(COLLECTION)
            .where(filter=FieldFilter("source", "==", "greenhouse"))
            .limit(page_size)
        )
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
    needs_repair = 0
    written = 0
    pending: list[tuple[str, str]] = []

    started_at = datetime.now(timezone.utc)
    logger.info(
        "Description backfill starting. commit=%s limit=%s sources=%s started_at=%s",
        commit, limit, SOURCES, started_at.isoformat(),
    )

    for snap in _iter_greenhouse_jobs(db):
        scanned += 1
        if limit and scanned > limit:
            break
        data = snap.to_dict() or {}
        raw = data.get("description_raw")
        if not _needs_repair(raw):
            continue
        cleaned = _clean_description(raw)
        # Guard: if cleaning a non-empty input produced an empty string the
        # original was probably all-markup. Skip rather than wipe data; a
        # rare anomaly worth keeping the original of.
        if not cleaned and raw.strip():
            logger.warning(
                "skip %s: cleaning produced empty string; original len=%d",
                snap.id, len(raw),
            )
            continue
        if cleaned == raw:
            # Entities present but unescaping was a no-op (e.g. unknown entity).
            # Nothing to do.
            continue
        needs_repair += 1
        pending.append((snap.id, cleaned))

        if commit and len(pending) >= BATCH_SIZE:
            written += _flush(db, pending)
            pending.clear()
            logger.info(
                "Backfill progress: scanned=%d written=%d",
                scanned, written,
            )

    if commit and pending:
        written += _flush(db, pending)
        pending.clear()

    result = {
        "scanned": scanned,
        "needs_repair": needs_repair,
        "written": written if commit else 0,
        "dry_run": not commit,
        "started_at": started_at.isoformat(),
    }
    logger.info("Description backfill done: %s", result)
    return result


def _flush(db, pending: list[tuple[str, str]]) -> int:
    batch = db.batch()
    for jid, cleaned in pending:
        batch.update(
            db.collection(COLLECTION).document(jid),
            {"description_raw": cleaned},
        )
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
