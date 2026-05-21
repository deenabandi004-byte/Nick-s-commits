#!/usr/bin/env python3
"""
Offerloop Job Pipeline - entry point.

Usage:
    python pipeline/main.py                  # Full pipeline: fetch → normalize → write
    python pipeline/main.py --skip-fantastic  # Full pipeline, skip Fantastic.jobs
    python pipeline/main.py --fantastic-only  # Fantastic.jobs only (finance/consulting/big tech)
    python pipeline/main.py --cleanup        # Delete expired jobs only
    python pipeline/main.py --fix-salaries   # Recalculate WEEK salaries
"""
from dotenv import load_dotenv
load_dotenv()

import sys
import os
import logging

# Ensure project root (parent of backend/) is on sys.path so
# `from backend.app.*` and `from app.*` imports both work.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from flask import Flask
from backend.app.extensions import init_firebase

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def _bootstrap_app():
    """Create a minimal Flask app and initialize Firebase (matching existing admin script pattern)."""
    app = Flask(__name__)
    init_firebase(app)
    return app


def run_pipeline(skip_fantastic: bool = False):
    from backend.pipeline.fetcher import fetch_jobs
    from backend.pipeline.normalizer import normalize_all
    from backend.pipeline.writer import write_jobs

    sources = "Greenhouse, Lever, Ashby, Simplify" + ("" if skip_fantastic else ", Fantastic.jobs")
    logger.info("Fetching jobs from %s...", sources)
    raw = fetch_jobs(skip_fantastic=skip_fantastic)

    logger.info("Normalizing %d raw results...", len(raw))
    normalized = normalize_all(raw)

    logger.info("Writing %d normalized jobs to Firestore...", len(normalized))
    result = write_jobs(normalized)

    print()
    print("Pipeline complete.")
    print(f"  New jobs written:     {result['written']}")
    print(f"  Duplicates skipped:   {result['skipped_duplicates']}")
    print(f"  Total processed:      {result['total']}")
    return result


def run_fantastic_only():
    from backend.pipeline.fetcher import fetch_fantasticjobs
    from backend.pipeline.normalizer import normalize_all
    from backend.pipeline.writer import write_jobs

    logger.info("Fetching jobs from Fantastic.jobs only...")
    raw = fetch_fantasticjobs()

    logger.info("Normalizing %d raw results...", len(raw))
    normalized = normalize_all(raw)

    logger.info("Writing %d normalized jobs to Firestore...", len(normalized))
    result = write_jobs(normalized)

    print()
    print("Fantastic.jobs pipeline complete.")
    print(f"  New jobs written:     {result['written']}")
    print(f"  Duplicates skipped:   {result['skipped_duplicates']}")
    print(f"  Total processed:      {result['total']}")
    return result


def run_fix_salaries():
    from backend.app.extensions import get_db
    from backend.pipeline.normalizer import _format_salary_display, _salary_normalized_annual

    db = get_db()
    if not db:
        raise RuntimeError("Firestore DB not initialized")

    logger.info("Scanning jobs for WEEK salary fixes...")
    docs_to_fix = []
    for doc in db.collection("jobs").stream():
        data = doc.to_dict()
        if data.get("salary_extracted") and data.get("salary_period") == "WEEK":
            docs_to_fix.append((doc.reference, data))

    if not docs_to_fix:
        print("No WEEK-period extracted salaries found. Nothing to fix.")
        return 0

    batch = db.batch()
    for ref, data in docs_to_fix:
        sal_min = data.get("salary_min")
        sal_max = data.get("salary_max")
        batch.update(ref, {
            "salary_normalized_annual": _salary_normalized_annual(sal_min, sal_max, "WEEK"),
            "salary_display": _format_salary_display(sal_min, sal_max, "WEEK", True),
        })
    batch.commit()

    print()
    print(f"Fixed {len(docs_to_fix)} jobs with WEEK salary period.")
    return len(docs_to_fix)


def run_cleanup():
    from backend.pipeline.writer import delete_expired_jobs

    logger.info("Running expired job cleanup...")
    deleted = delete_expired_jobs()

    print()
    print("Cleanup complete.")
    print(f"  Expired jobs deleted: {deleted}")
    return deleted


if __name__ == "__main__":
    app = _bootstrap_app()

    with app.app_context():
        if "--cleanup" in sys.argv:
            run_cleanup()
        elif "--fix-salaries" in sys.argv:
            run_fix_salaries()
        elif "--fantastic-only" in sys.argv:
            run_fantastic_only()
        elif "--skip-fantastic" in sys.argv:
            run_pipeline(skip_fantastic=True)
        else:
            run_pipeline()
