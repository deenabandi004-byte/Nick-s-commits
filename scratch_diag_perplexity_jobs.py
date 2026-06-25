"""Diagnose why search_jobs_live returned 0 for the Geospatial × Amazon brief.

Calls Perplexity directly with:
  1. The exact L0 query the broadening loop sent.
  2. The L2 query (drop company).
  3. A FAANG control to confirm the API + prompt aren't globally broken.
  4. A recency-loosened L2 (year vs month) to test hypothesis #1.

Run from ~/work/Offerloop:
    python3 scratch_diag_perplexity_jobs.py
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.services.perplexity_client import search_jobs_live, _get_client


def call(label: str, query: str, location: str):
    print(f"\n── {label} ──")
    print(f"   query={query!r}  location={location!r}")
    try:
        jobs = search_jobs_live(query=query, location=location, limit=10)
    except Exception as e:
        print(f"   EXC: {type(e).__name__}: {e}")
        return
    print(f"   returned: {len(jobs)} job(s)")
    for i, j in enumerate(jobs[:3]):
        title = j.get("title", "")
        company = j.get("company", "")
        url = j.get("url", "")
        print(f"     [{i}] {title!r} @ {company!r} → {url}")


def call_raw(label: str, query: str, location: str, recency: str | None):
    """Bypass search_jobs_live's caller-facing wrapping and the cache so we see
    exactly what Sonar returns. Lets us A/B the recency filter."""
    print(f"\n── RAW: {label} (recency={recency!r}) ──")
    print(f"   query={query!r}  location={location!r}")
    client = _get_client()
    if not client:
        print("   no Perplexity client (PERPLEXITY_API_KEY unset?)")
        return
    prompt = (
        f"Find up to 10 SPECIFIC current job postings matching: {query} "
        f"in {location}. Each result MUST be a concrete posting with its own "
        f"unique URL (a job ID in the path). Do NOT return careers landing "
        f"pages, search-result pages, or generic placeholders. If you cannot "
        f"find any real specific postings, return an empty JSON array. "
        f"For each job return: title (the actual role title — never "
        f"'Job Posting' or similar generic text), company name, location, "
        f"URL to the specific posting, and a brief summary. Return as a JSON "
        f"array of objects with keys: title, company, location, url, summary."
    )
    extra: dict = {}
    if recency:
        extra["search_recency_filter"] = recency
    try:
        resp = client.chat.completions.create(
            model="sonar",
            messages=[{"role": "user", "content": prompt}],
            extra_body=extra,
        )
        content = resp.choices[0].message.content
        print(f"   raw content (first 800 chars):\n{content[:800]}")
        # Try to count by counting top-level objects
        try:
            cleaned = content.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```", 2)[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.rsplit("```", 1)[0]
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                print(f"   parsed: {len(parsed)} item(s)")
            else:
                print(f"   parsed: not a list ({type(parsed).__name__})")
        except Exception as e:
            print(f"   parse failed: {e}")
    except Exception as e:
        print(f"   EXC: {type(e).__name__}: {e}")


def trace_wrapper(label: str, query: str, location: str):
    """Mirror search_jobs_live's body line-by-line so we can see WHERE the
    wrapper drops the result that the raw call returns."""
    from app.services.perplexity_client import _parse_json_response
    print(f"\n── TRACE: {label} ──")
    print(f"   query={query!r}  location={location!r}")
    client = _get_client()
    if not client:
        print("   no Perplexity client"); return
    prompt = (
        f"Find up to 10 SPECIFIC current job postings matching: {query} "
        f"in {location}. Each result MUST be a concrete posting with its own "
        f"unique URL (a job ID in the path). Do NOT return careers landing "
        f"pages, search-result pages, or generic placeholders. If you cannot "
        f"find any real specific postings, return an empty JSON array. "
        f"For each job return: title (the actual role title — never "
        f"'Job Posting' or similar generic text), company name, location, "
        f"URL to the specific posting, and a brief summary. Return as a JSON "
        f"array of objects with keys: title, company, location, url, summary."
    )
    resp = client.chat.completions.create(
        model="sonar",
        messages=[{"role": "user", "content": prompt}],
        extra_body={"search_recency_filter": "month"},
    )
    content = resp.choices[0].message.content
    print(f"   raw content len={len(content)}")
    print(f"   first 300: {content[:300]!r}")
    print(f"   last 200:  {content[-200:]!r}")
    parsed = _parse_json_response(content)
    print(f"   parsed type: {type(parsed).__name__}")
    if isinstance(parsed, dict):
        print(f"   parsed keys: {list(parsed.keys())[:5]}")
        if "raw_text" in parsed:
            print(f"   → parser PUNTED to raw_text (json.loads failed)")
    elif isinstance(parsed, list):
        print(f"   parsed list len: {len(parsed)}")


if __name__ == "__main__":
    # The two queries that actually ran in the dogfood cycle.
    call("L0 (exact)", "Geospatial Engineer at Amazon", "United States")
    call("L2 (drop co)", "geospatial engineer", "United States")

    # Control: a query that should definitely have postings, to confirm the
    # API + prompt + parser aren't broken end-to-end.
    call("Control: SWE at Amazon", "software engineer at Amazon", "United States")

    # Recency A/B on L2. Hypothesis: 30-day window is too tight for niche roles.
    call_raw("L2 (month)", "geospatial engineer", "United States", recency="month")
    call_raw("L2 (year)",  "geospatial engineer", "United States", recency="year")
    call_raw("L2 (none)",  "geospatial engineer", "United States", recency=None)

    # Trace the wrapper to see whether _parse_json_response is the culprit.
    trace_wrapper("L2 wrapper trace", "geospatial engineer", "United States")
    trace_wrapper("SWE wrapper trace", "software engineer at Amazon", "United States")
