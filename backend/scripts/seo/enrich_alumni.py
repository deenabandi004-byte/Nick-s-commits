"""Per-cell enrichment fetcher for the find-people data-density upgrade
(Workstream B). For each school x firm cell it pulls a real sample of profiles
and aggregates genuine per-cell data that becomes the page body:

  - top_titles: the actual job titles those alumni hold at that firm, with
    real counts (varies cell to cell)
  - seniority: distribution across PDL job-title levels
  - sample_size: how many profiles the aggregate is computed from

This is aggregate data only. It does not store or publish individual names,
so no real person's PII lands on an indexed page.

Run (from repo root), enriching the lowest and highest cells in the build list:
  PYTHONPATH="$(pwd):$(pwd)/backend" .venv/bin/python \\
    backend/scripts/seo/enrich_alumni.py --lowest 5 --highest 5 --sample 30

Writes: backend/scripts/seo/data/alumni_enrichment.json
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import time

import requests

from app.config import PDL_BASE_URL, PEOPLE_DATA_LABS_API_KEY
from app.services.pdl_client import clean_company_name

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
ENRICH_PATH = os.path.join(DATA_DIR, "alumni_enrichment.json")


def load(name: str) -> dict:
    with open(os.path.join(DATA_DIR, name), "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_enrichment() -> dict:
    if os.path.exists(ENRICH_PATH):
        with open(ENRICH_PATH, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return {}


def save_enrichment(data: dict) -> None:
    with open(ENRICH_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)


def title_case(s: str) -> str:
    parts = s.split()
    keep = {"ii", "iii", "iv"}
    out = []
    for w in parts:
        if w.lower() in keep:
            out.append(w.upper())
        elif w.isupper() and 2 <= len(w) <= 4:
            out.append(w)
        else:
            out.append(w.capitalize())
    return " ".join(out)


def enrich_cell(firm_pdl: str, school_pdl: str, sample: int) -> dict | None:
    company = (clean_company_name(firm_pdl) or firm_pdl).strip().lower()
    query = {
        "bool": {
            "must": [
                {"match": {"job_company_name": company}},
                {"match": {"education.school.name": school_pdl.strip().lower()}},
            ]
        }
    }
    body = {"query": query, "size": max(1, min(int(sample), 100))}
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }
    try:
        resp = requests.post(f"{PDL_BASE_URL}/person/search", headers=headers, json=body, timeout=30)
    except requests.RequestException:
        return None
    if resp.status_code == 404:
        return {"top_titles": [], "seniority": {}, "sample_size": 0}
    if resp.status_code != 200:
        return None
    data = (resp.json() or {}).get("data") or []

    titles: collections.Counter = collections.Counter()
    levels: collections.Counter = collections.Counter()
    functions: collections.Counter = collections.Counter()
    prior: collections.Counter = collections.Counter()
    for person in data:
        exp = person.get("experience") or []
        if not exp or not isinstance(exp[0], dict):
            continue
        cur = exp[0]
        tinfo = cur.get("title") or {}
        name = (tinfo.get("name") or "").strip()
        if name:
            titles[title_case(name)] += 1
        for lvl in (tinfo.get("levels") or []):
            if isinstance(lvl, str) and lvl.strip():
                levels[lvl.strip().lower()] += 1
        role = (tinfo.get("role") or "").strip()
        if role:
            functions[title_case(role.replace("_", " "))] += 1
        cur_company = ((cur.get("company") or {}).get("name") or "").strip().lower()
        for e in exp[1:]:
            if not isinstance(e, dict):
                continue
            nm = ((e.get("company") or {}).get("name") or "").strip()
            if nm and nm.lower() != cur_company:
                prior[title_case(nm)] += 1
                break  # only the immediately-previous distinct employer

    return {
        "top_titles": [[t, c] for t, c in titles.most_common(6)],
        "seniority": dict(levels.most_common()),
        "top_functions": [[t, c] for t, c in functions.most_common(6)],
        "top_prior_employers": [[t, c] for t, c in prior.most_common(6)],
        "sample_size": len(data),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lowest", type=int, default=0)
    parser.add_argument("--highest", type=int, default=0)
    parser.add_argument("--sample", type=int, default=30)
    parser.add_argument("--sleep", type=float, default=0.3)
    parser.add_argument("--force", action="store_true", help="re-fetch even if cached")
    args = parser.parse_args()

    if not PEOPLE_DATA_LABS_API_KEY:
        print("PEOPLE_DATA_LABS_API_KEY not set; cannot enrich.")
        return 1

    schools = {s["slug"]: s for s in load("schools.json")["schools"]}
    firms = {f["slug"]: f for f in load("firms.json")["firms"]}
    cells = load("find_people_buildlist.json")["cells"]
    by_count = sorted(cells, key=lambda c: c["alumni_count"])
    targets = by_count[: args.lowest] + (by_count[-args.highest:] if args.highest else [])

    enrichment = load_enrichment()
    todo = targets if args.force else [c for c in targets if c["slug"] not in enrichment]
    print(f"{len(targets)} target cells; {len(todo)} to enrich (sample {args.sample}).")

    for i, c in enumerate(todo, 1):
        s, f = schools[c["school"]], firms[c["firm"]]
        result = enrich_cell(f["pdl"], s["pdl"], args.sample)
        if result is None:
            print(f"  [{i}/{len(todo)}] {c['slug']}: error, skipping")
            continue
        enrichment[c["slug"]] = result
        save_enrichment(enrichment)
        top = ", ".join(f"{t}({n})" for t, n in result["top_titles"][:3])
        print(f"  [{i}/{len(todo)}] {c['slug']} (count {c['alumni_count']}): n={result['sample_size']} top: {top}")
        time.sleep(args.sleep)

    print(f"Done. Enriched cells cached: {len(enrichment)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
