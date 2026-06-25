"""Dry-run for PDL title pre-enrichment — answers "is it safe to ship Step 2?"

Walks the `jobs` collection, slugifies every title with the SAME function the
pipeline will use, reports unique cardinality. No PDL calls. No Firestore
writes. Read-only.

Decision rule:
  cardinality < 5k    → ship Step 2 as-is
  cardinality 5k–15k  → ship Step 2 but lower MAX_PER_RUN to 100
  cardinality > 15k   → slug is broken, do not ship

Usage:
    python backend/scripts/title_enrich_dry_run.py
"""
import os
import random
import sys
from collections import Counter, defaultdict

# Allow running from repo root. The transitive import chain
# (pdl_title_cache → pdl_client → openai_client) uses both styles:
# `from app.services...` (needs backend/) and `from backend.app.config...`
# (needs repo root). Add both.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))           # backend/
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))     # repo root

import firebase_admin
from firebase_admin import credentials, firestore

from app.services.pdl_title_cache import slugify_title


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()
    return firestore.client()


def main():
    db = get_db()

    total_jobs = 0
    titles_missing = 0
    slug_counts: Counter = Counter()
    # slug -> set of original titles that map to it. Catches normalization
    # bugs (if the same slug has 50 wildly different originals, something
    # is over-collapsing).
    slug_originals: dict[str, set[str]] = defaultdict(set)

    print("Scanning jobs collection (read-only, no PDL calls)...")
    for doc in db.collection("jobs").stream():
        total_jobs += 1
        data = doc.to_dict() or {}
        title = data.get("title")
        if not title or not isinstance(title, str):
            titles_missing += 1
            continue
        slug = slugify_title(title)
        if not slug:
            titles_missing += 1
            continue
        slug_counts[slug] += 1
        slug_originals[slug].add(title)

    unique_slugs = len(slug_counts)
    valid_titles = total_jobs - titles_missing

    print()
    print("=" * 64)
    print("Title cardinality dry-run")
    print("=" * 64)
    print(f"Total jobs scanned:      {total_jobs:,}")
    print(f"Jobs missing/empty title: {titles_missing:,}")
    print(f"Valid titles:            {valid_titles:,}")
    print(f"Unique slugs:            {unique_slugs:,}")
    if valid_titles:
        dedup_ratio = valid_titles / unique_slugs
        print(f"Dedup ratio:             {dedup_ratio:.2f}× (higher = better)")
    print()

    print("Top 20 slugs by frequency:")
    for slug, count in slug_counts.most_common(20):
        sample = next(iter(slug_originals[slug]))
        print(f"  {count:>5}  {slug!r:<50}  (sample original: {sample!r})")
    print()

    print("20 random slugs (sanity check for normalization weirdness):")
    sample = random.sample(list(slug_counts.items()), min(20, unique_slugs))
    for slug, count in sample:
        originals = list(slug_originals[slug])
        sample_str = originals[0] if originals else ""
        print(f"  {count:>5}  {slug!r:<50}  (sample original: {sample_str!r})")
    print()

    # Catch over-collapsing: any slug that maps to >10 visually distinct
    # originals is a normalization smell.
    over_collapsed = sorted(
        ((slug, len(orig)) for slug, orig in slug_originals.items() if len(orig) > 10),
        key=lambda x: -x[1],
    )[:10]
    if over_collapsed:
        print("⚠️ Slugs collapsing >10 distinct originals (look for normalization bugs):")
        for slug, orig_count in over_collapsed:
            samples = list(slug_originals[slug])[:5]
            print(f"  {orig_count:>3} originals  {slug!r}")
            for s in samples:
                print(f"               example: {s!r}")
        print()
    else:
        print("✓ No slug collapses >10 distinct originals.")
        print()

    # Decision banner.
    print("=" * 64)
    if unique_slugs < 5_000:
        print(f"✓ DECISION: SHIP Step 2 as-is. {unique_slugs:,} slugs is well under "
              f"the 50k credit budget.")
    elif unique_slugs < 15_000:
        print(f"⚠ DECISION: SHIP Step 2 BUT lower MAX_PER_RUN to 100. "
              f"{unique_slugs:,} slugs is moderate; backfill more slowly.")
    else:
        print(f"✗ DECISION: DO NOT SHIP. {unique_slugs:,} slugs is suspicious — "
              f"the slug function is likely over-fragmenting. Investigate before "
              f"calling PDL.")
    print("=" * 64)


if __name__ == "__main__":
    main()
