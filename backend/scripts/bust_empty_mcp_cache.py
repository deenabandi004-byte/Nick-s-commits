"""
One-shot cleanup: delete mcp_cache docs whose cached payload represents
an empty result.

Background: the MCP tools used to call cache.set() unconditionally on the
cold-path completion, including when PDL/Perplexity returned zero. With a
7- or 30-day TTL and a non-uid-bucketed cache key, those poisoned entries
locked out every subsequent same-args call from any user. The cache.set()
gates were added in the same commit that introduces this script; running
it once after deploy clears the existing poisoned entries so users stop
hitting them before TTL expiry.

Usage (from Render shell):

    cd /opt/render/project/src && python -m backend.scripts.bust_empty_mcp_cache

Add --dry-run to enumerate without deleting.

Idempotent: subsequent runs find nothing to delete because cache writes
are now gated. Safe to run multiple times.
"""
from __future__ import annotations

import argparse
import logging
import sys

logger = logging.getLogger(__name__)


def _has_content(payload: dict, tool: str) -> bool:
    """Mirror the new gating predicates in each tool. Treat anything that
    matches the predicates as 'real' content and keep the cache row.
    Everything else is empty enough to delete."""
    if not isinstance(payload, dict):
        return False
    if tool == "find_contacts":
        return bool(payload.get("contacts"))
    if tool == "draft_outreach":
        return bool(payload.get("subject")) and bool(payload.get("body"))
    if tool == "get_company_intel:stable":
        overview = payload.get("overview") or {}
        if overview.get("description") or overview.get("headquarters"):
            return True
        if payload.get("divisions"):
            return True
        if payload.get("alumni_at_your_school"):
            return True
        return payload.get("discovery_score") is not None
    if tool == "get_company_intel:fresh":
        if payload.get("recent_news"):
            return True
        signals = payload.get("recruiting_signals") or {}
        return bool(signals.get("hiring_momentum") or signals.get("cycle_intel"))
    # Unknown tool — leave it alone rather than risk deleting something
    # the predicate just doesn't recognize.
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be deleted without modifying Firestore.",
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Optional cap on docs scanned (0 = no cap).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    # Import inside main so the script can also be run as a module from
    # the repo root: python -m backend.scripts.bust_empty_mcp_cache
    from app.extensions import get_db, init_firebase
    from app.mcp_server.cache import COLLECTION

    # Standalone CLI — there's no Flask app boot that would call
    # init_firebase() for us. The `app` arg is unused inside init_firebase
    # (it's a Flask-init convention), so None is safe.
    init_firebase(None)
    db = get_db()
    if db is None:
        logger.error("get_db() returned None — Firestore not initialized.")
        return 2

    deleted = 0
    kept = 0
    scanned = 0
    for snap in db.collection(COLLECTION).stream():
        scanned += 1
        if args.limit and scanned > args.limit:
            break
        data = snap.to_dict() or {}
        tool = data.get("tool") or ""
        payload = data.get("payload") or {}
        if _has_content(payload, tool):
            kept += 1
            continue
        logger.info("delete: id=%s tool=%s%s", snap.id, tool,
                    " (dry-run)" if args.dry_run else "")
        if not args.dry_run:
            try:
                snap.reference.delete()
            except Exception as e:
                logger.warning("delete failed for %s: %s", snap.id, e)
                continue
        deleted += 1

    logger.info(
        "done: scanned=%d deleted=%d kept=%d dry_run=%s",
        scanned, deleted, kept, args.dry_run,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
