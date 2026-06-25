"""Alumni-count fetcher for the find-people SEO cluster (Phase 2).

For each school x firm cell, runs one PDL /person/search (size 1) and reads
the response `total`, which is the count of alumni of that school currently
at that firm. This is the primary data_density input for the scoring gate.

Verified beforehand (verify_pdl_count.py): `total` is returned, the school
filter narrows correctly, empty cells 404 at 0 cost, non-empty cells cost
about 1 credit each.

Cost control:
  - Only fetches cells at or above the given school and firm tier cutoffs.
  - Caches every result to alumni_counts.json and skips cells already cached,
    so reruns and expansions are incremental and free.

Run (from repo root):
  PYTHONPATH="$(pwd):$(pwd)/backend" .venv/bin/python \\
    backend/scripts/seo/fetch_alumni_counts.py --min-school-tier 3 --min-firm-tier 3

Writes: backend/scripts/seo/data/alumni_counts.json
"""
from __future__ import annotations

import argparse
import json
import os
import time

import requests

from app.config import PDL_BASE_URL, PEOPLE_DATA_LABS_API_KEY
from app.services.pdl_client import clean_company_name

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
COUNTS_PATH = os.path.join(DATA_DIR, "alumni_counts.json")


def load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_counts() -> dict:
    if os.path.exists(COUNTS_PATH):
        with open(COUNTS_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return {}


def save_counts(counts: dict) -> None:
    with open(COUNTS_PATH, "w", encoding="utf-8") as fh:
        json.dump(counts, fh, indent=2, sort_keys=True)


def fetch_total(firm_pdl: str, school_pdl: str) -> int | None:
    """Return the PDL total for this cell, or None on a hard error (so the
    caller can retry later). A genuine zero-match cell returns 0, not None."""
    company_clean = (clean_company_name(firm_pdl) or firm_pdl).strip().lower()
    query = {
        "bool": {
            "must": [
                {"match": {"job_company_name": company_clean}},
                {"match": {"education.school.name": school_pdl.strip().lower()}},
            ]
        }
    }
    body = {"query": query, "size": 1}
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }
    try:
        resp = requests.post(
            f"{PDL_BASE_URL}/person/search", headers=headers, json=body, timeout=25
        )
    except requests.RequestException:
        return None
    if resp.status_code == 404:
        return 0
    if resp.status_code != 200:
        return None
    try:
        payload = resp.json() or {}
    except ValueError:
        return None
    total = payload.get("total")
    return int(total) if isinstance(total, int) else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-school-tier", type=int, default=3)
    parser.add_argument("--min-firm-tier", type=int, default=3)
    parser.add_argument("--sleep", type=float, default=0.3)
    args = parser.parse_args()

    if not PEOPLE_DATA_LABS_API_KEY:
        print("PEOPLE_DATA_LABS_API_KEY not set; cannot fetch.")
        return 1

    schools = [s for s in load_json(os.path.join(DATA_DIR, "schools.json"))["schools"] if s["tier"] >= args.min_school_tier]
    firms = [f for f in load_json(os.path.join(DATA_DIR, "firms.json"))["firms"] if f["tier"] >= args.min_firm_tier]

    counts = load_counts()
    cells = [(s, f) for s in schools for f in firms]
    todo = [(s, f) for (s, f) in cells if f"{s['slug']}|{f['slug']}" not in counts]
    print(f"{len(cells)} cells in band; {len(counts)} already cached; {len(todo)} to fetch.")

    fetched = 0
    for i, (s, f) in enumerate(todo, 1):
        key = f"{s['slug']}|{f['slug']}"
        total = fetch_total(f["pdl"], s["pdl"])
        if total is None:
            print(f"  [{i}/{len(todo)}] {key}: error, will retry on next run")
            continue
        counts[key] = total
        fetched += 1
        if i % 10 == 0 or i == len(todo):
            save_counts(counts)
            print(f"  [{i}/{len(todo)}] saved; last {key} = {total}")
        time.sleep(args.sleep)

    save_counts(counts)
    print(f"Done. Fetched {fetched} new cells. Total cached: {len(counts)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
