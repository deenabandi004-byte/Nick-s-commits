"""Verification probe for the SEO alumni-count source (Phase 2, pre-build).

Goal: confirm three things before building the count-fetcher or the gate on
top of PDL totals:
  1. PDL /person/search returns a `total` for a company + school query.
  2. The `education.school.name` filter actually narrows by alumni.
  3. Whether size:0 returns the total at zero record cost (cheap count) or
     whether we must pay for at least one record per cell.

Run (from repo root):
  PYTHONPATH=backend .venv/bin/python backend/scripts/seo/verify_pdl_count.py

This probe hits PDL for a small fixed set of cells only. It does not write
anything. Costs at most a few credits.
"""
from __future__ import annotations

import json
import sys

import requests

from app.config import PDL_BASE_URL, PEOPLE_DATA_LABS_API_KEY
from app.services.pdl_client import clean_company_name

# A few cells spanning high-demand, mid, and a thin cell we expect to fail
# the floor. (school_display, school_query, firm_display)
TEST_CELLS = [
    ("USC", "University of Southern California", "Goldman Sachs"),
    ("NYU", "New York University", "JPMorgan"),
    ("Harvard", "Harvard University", "McKinsey"),
    ("Berkeley", "University of California, Berkeley", "Apple"),
    ("Spelman College", "Spelman College", "Evercore"),
]


def build_count_query(company: str, school: str) -> dict:
    company_clean = (clean_company_name(company) or company).strip().lower()
    school_clean = (school or "").strip().lower()
    must: list[dict] = []
    if company_clean:
        must.append({"match": {"job_company_name": company_clean}})
    if school_clean:
        must.append({"match": {"education.school.name": school_clean}})
    return {"bool": {"must": must}}


def probe(company: str, school: str, size: int) -> dict:
    query = build_count_query(company, school)
    body = {"query": query, "size": size}
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }
    resp = requests.post(
        f"{PDL_BASE_URL}/person/search", headers=headers, json=body, timeout=25
    )
    out: dict = {"status": resp.status_code}
    if resp.status_code == 200:
        payload = resp.json() or {}
        out["total"] = payload.get("total")
        out["returned"] = len(payload.get("data") or [])
        out["top_keys"] = sorted(payload.keys())
    else:
        out["body"] = resp.text[:160]
    return out


def main() -> int:
    if not PEOPLE_DATA_LABS_API_KEY:
        print("PEOPLE_DATA_LABS_API_KEY not set; cannot probe.")
        return 1

    print("Probing PDL /person/search for company + school totals.\n")
    for school_display, school_query, firm in TEST_CELLS:
        line = {"cell": f"{school_display} x {firm}"}
        # size:0 first (is the total free?), then size:1 as a fallback signal.
        line["size0"] = probe(firm, school_query, 0)
        line["size1"] = probe(firm, school_query, 1)
        print(json.dumps(line))
    return 0


if __name__ == "__main__":
    sys.exit(main())
