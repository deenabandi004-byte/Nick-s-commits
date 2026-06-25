"""SCRATCH — Strategy C hybrid (Perplexity + PDL) live test.

Not for commit. Run from the repo root:
    python3 scratch_test_hybrid_pdl.py          # real run, 60-credit cap
    python3 scratch_test_hybrid_pdl.py --dry-run  # show intended calls, no spend

Validates whether the proposed Strategy C (tight PDL query first, Perplexity
fallback for misses) produces good candidates at far lower credit cost than
the existing loose tier search. Also runs the current loose query on ONE
company (Stripe) for direct quality comparison.

Hard caps:
  - 60 PDL credits total (script self-aborts if next call would exceed)
  - 1 Perplexity sourcing call per company (no retries)
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

# Trigger app.config import so .env loads BEFORE we use env vars.
from app import config as _cfg  # noqa: F401, E402
from app.config import PEOPLE_DATA_LABS_API_KEY, PDL_BASE_URL  # noqa: E402

DRY_RUN = "--dry-run" in sys.argv
PDL_CREDIT_CAP = 60

# ─── Test inputs (do not change without thinking about cost) ─────────────

TEST_CASES = [
    {"company": "Stripe",      "role": "engineering", "max_results": 5, "compare_loose": False},
    {"company": "Anthropic",   "role": "engineering", "max_results": 5, "compare_loose": False},
    {"company": "Linear",      "role": "product",     "max_results": 3, "compare_loose": False},
    {"company": "Browserbase", "role": "engineering", "max_results": 3, "compare_loose": False},
]

# Seniority levels we consider "decision makers" — per PDL job_title_levels enum.
DECISION_MAKER_LEVELS = ["manager", "director", "vp", "head", "cxo", "owner"]

# ─── Credit tracking ─────────────────────────────────────────────────────

_total_pdl_credits = 0
_total_perplexity_calls = 0


def _spend(estimated: int, label: str):
    """Reserve credits before a PDL call. Self-aborts if budget exceeded."""
    global _total_pdl_credits
    if _total_pdl_credits + estimated > PDL_CREDIT_CAP:
        print(f"\n❌ BUDGET CAP REACHED: {_total_pdl_credits}/{PDL_CREDIT_CAP} used, "
              f"next call ({label}) would add up to {estimated}. Aborting.")
        sys.exit(0)


def _charge(actual: int):
    global _total_pdl_credits
    _total_pdl_credits += actual


# ─── PDL calls ───────────────────────────────────────────────────────────


def tight_pdl_query(company: str, role: str, size: int = 3) -> tuple[list[dict], int]:
    """Tight /person/search: filters by company + role + seniority + quality.

    Uses PDL's documented query shape: bool/must with term + nested bool/should
    for the seniority OR. PDL does NOT support multi_match or field boosting.
    Returns (contacts, credits_used).
    """
    import requests
    from app.services.pdl_client import extract_contact_from_pdl_person_enhanced

    body = {
        "query": {
            "bool": {
                "must": [
                    {"term": {"job_company_name": company.lower()}},
                    {"term": {"job_title_role": role.lower()}},
                    {"exists": {"field": "linkedin_url"}},
                    {"terms": {"job_title_levels": DECISION_MAKER_LEVELS}},
                ]
            }
        },
        "size": size,
    }
    if DRY_RUN:
        print(f"  [DRY-RUN] POST /person/search size={size} for {company}/{role}")
        return [], 0
    _spend(size, f"tight_pdl_query({company})")
    headers = {"Accept": "application/json", "Content-Type": "application/json",
               "X-Api-Key": PEOPLE_DATA_LABS_API_KEY}
    try:
        r = requests.post(f"{PDL_BASE_URL}/person/search", headers=headers,
                          json=body, timeout=30)
        if r.status_code == 404:
            return [], 0  # no matches, no charge
        if r.status_code != 200:
            print(f"  PDL {r.status_code}: {r.text[:200]}")
            return [], 0
        data = (r.json() or {}).get("data", []) or []
        _charge(len(data))
        contacts = []
        for person in data:
            try:
                c = extract_contact_from_pdl_person_enhanced(person, target_company=company)
                if c:
                    contacts.append(c)
            except Exception as e:
                print(f"  extract failed: {e}")
        return contacts, len(data)
    except Exception as e:
        print(f"  tight_pdl_query exception: {e}")
        return [], 0


def loose_pdl_query(company: str, role: str, size: int = 20) -> tuple[list[dict], int]:
    """Existing loose tier-style query (for comparison): match_phrase on titles + company."""
    import requests
    from app.services.pdl_client import extract_contact_from_pdl_person_enhanced
    from app.services.recruiter_finder import (
        get_hiring_manager_titles_for_tier, build_hiring_manager_search_query,
    )

    titles = get_hiring_manager_titles_for_tier(1, role)  # Tier 1 titles
    query_obj = build_hiring_manager_search_query(
        company_name=company.lower(), titles=titles, location=None,
        company_aliases=[company],
    )
    body = {"query": query_obj, "size": size}
    if DRY_RUN:
        print(f"  [DRY-RUN] POST /person/search size={size} LOOSE for {company}/{role}")
        return [], 0
    _spend(size, f"loose_pdl_query({company})")
    headers = {"Accept": "application/json", "Content-Type": "application/json",
               "X-Api-Key": PEOPLE_DATA_LABS_API_KEY}
    try:
        r = requests.post(f"{PDL_BASE_URL}/person/search", headers=headers,
                          json=body, timeout=30)
        if r.status_code == 404:
            return [], 0
        if r.status_code != 200:
            print(f"  PDL {r.status_code}: {r.text[:200]}")
            return [], 0
        data = (r.json() or {}).get("data", []) or []
        _charge(len(data))
        contacts = []
        for person in data:
            try:
                c = extract_contact_from_pdl_person_enhanced(person, target_company=company)
                if c:
                    contacts.append(c)
            except Exception as e:
                print(f"  extract failed: {e}")
        return contacts, len(data)
    except Exception as e:
        print(f"  loose_pdl_query exception: {e}")
        return [], 0


def pdl_enrich(first: str, last: str, company: str) -> Optional[dict]:
    """One /person/enrich call: 1 credit on HTTP 200, 0 on 404."""
    import requests
    from app.services.pdl_client import extract_contact_from_pdl_person_enhanced

    if DRY_RUN:
        print(f"    [DRY-RUN] GET /person/enrich for {first} {last} @ {company}")
        return None
    _spend(1, f"pdl_enrich({first} {last})")
    try:
        r = requests.get(f"{PDL_BASE_URL}/person/enrich", params={
            "api_key": PEOPLE_DATA_LABS_API_KEY,
            "first_name": first, "last_name": last,
            "company": company, "min_likelihood": 4, "pretty": False,
        }, timeout=20)
        if r.status_code == 200:
            body = r.json() or {}
            if body.get("status") == 200 and body.get("data"):
                _charge(1)
                contact = extract_contact_from_pdl_person_enhanced(body["data"], target_company=company)
                return contact
            return None
        elif r.status_code == 404:
            return None  # free
        else:
            print(f"    enrich {r.status_code}: {r.text[:200]}")
            return None
    except Exception as e:
        print(f"    enrich exception: {e}")
        return None


# ─── Perplexity name sourcing ────────────────────────────────────────────


_PERPLEXITY_SOURCING_SCHEMA = {
    "name": "sourced_hiring_managers",
    "schema": {
        "type": "object",
        "properties": {
            "people": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "first": {"type": "string"},
                        "last": {"type": "string"},
                        "current_title": {"type": "string"},
                    },
                    "required": ["first", "last", "current_title"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["people"],
        "additionalProperties": False,
    },
}


def perplexity_source_names(company: str, role: str) -> list[dict]:
    """Ask Perplexity for up to 5 current hiring-manager names at company.
    Uses response_format json_schema to prevent template-echo failures.
    Returns list of {'first': str, 'last': str, 'current_title': str}.
    """
    global _total_perplexity_calls
    if DRY_RUN:
        print(f"  [DRY-RUN] Perplexity: source up to 5 hiring-manager names for {company}/{role}")
        return []
    from app.services.perplexity_client import _get_client, _parse_json_response
    client = _get_client()
    if not client:
        print("  Perplexity API key not configured")
        return []
    _total_perplexity_calls += 1
    prompt = (
        f"Identify up to 5 real, currently-employed people at {company} who are "
        f"engineering managers, directors of engineering, VPs of engineering, "
        f"or other senior {role} leaders likely to be hiring-decision makers. "
        f"Include only specific named individuals you have high confidence about; "
        f"do NOT include placeholders, generic role descriptions, or guesses. "
        f"If you cannot identify any with confidence, return an empty list."
    )
    try:
        response = client.chat.completions.create(
            model="sonar",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_schema", "json_schema": _PERPLEXITY_SOURCING_SCHEMA},
        )
        content = response.choices[0].message.content or ""
        parsed = _parse_json_response(content)
        if isinstance(parsed, dict) and isinstance(parsed.get("people"), list):
            cleaned = []
            for p in parsed["people"][:5]:
                if not isinstance(p, dict):
                    continue
                first = str(p.get("first", "")).strip()
                last = str(p.get("last", "")).strip()
                if not first or not last:
                    continue
                # Filter placeholder/garbage names defensively
                if first.lower() in ("firstname", "first", "name", "n/a", "unknown"):
                    continue
                if last.lower() in ("lastname", "last", "name", "n/a", "unknown"):
                    continue
                cleaned.append({
                    "first": first,
                    "last": last,
                    "current_title": str(p.get("current_title", "")).strip(),
                })
            return cleaned
        print(f"  Perplexity returned unparseable JSON: {content[:200]}")
        return []
    except Exception as e:
        print(f"  Perplexity exception: {e}")
        return []


# ─── Strategy C orchestration ────────────────────────────────────────────


def run_strategy_c(company: str, role: str, max_results: int = 5) -> tuple[list[dict], int, str]:
    """Option D: tight query (decision-makers) + small loose top-up (recruiters).
    Mix is what the user sees — varied seniority, varied reply odds.
    """
    # Tight: 1-3 decision-makers (matches _tight_target_for)
    tight_target = 1 if max_results <= 2 else 2 if max_results <= 5 else 3
    tight, c1 = tight_pdl_query(company, role, size=tight_target)
    # Loose top-up: fill remaining slots with recruiters
    loose_needed = max(0, max_results - len(tight))
    loose, c2 = ([], 0)
    if loose_needed > 0:
        loose, c2 = loose_pdl_query(company, role, size=loose_needed)
    # Dedupe by (first, last) — tight + loose almost never overlap per our research
    seen = {(c.get("FirstName", "").lower(), c.get("LastName", "").lower()) for c in tight}
    merged = list(tight)
    for c in loose:
        k = (c.get("FirstName", "").lower(), c.get("LastName", "").lower())
        if k not in seen:
            merged.append(c)
            seen.add(k)
    return merged, c1 + c2, f"tight({len(tight)}) + loose({len(loose)})"


# ─── Output formatting ───────────────────────────────────────────────────


def _fmt_contact(c: dict, n: int) -> str:
    name = f"{c.get('FirstName', '')} {c.get('LastName', '')}".strip()
    title = c.get('Title', '')
    linkedin = c.get('LinkedIn', '') or c.get('linkedin_url', '')
    email = c.get('Email', '')
    return f"    {n}. {name:25} — {title[:45]:45} — {linkedin[:50]} ({email})"


def hr(label: str):
    print("\n" + "=" * 78)
    print(f"  {label}")
    print("=" * 78)


# ─── Main ─────────────────────────────────────────────────────────────────


def main():
    print(f"Strategy C hybrid test — {'DRY-RUN' if DRY_RUN else 'LIVE'} mode")
    print(f"PDL cap: {PDL_CREDIT_CAP} credits. Perplexity: ~$0.01 per company.")
    print(f"Companies: {[t['company'] for t in TEST_CASES]}\n")

    results = []

    for case in TEST_CASES:
        company, role = case["company"], case["role"]
        max_results = case.get("max_results", 5)
        hr(f"{company} ({role}, max_results={max_results})")

        # Option D — tight + small loose top-up
        print(f"\nOption D [tight + loose top-up]:")
        c_results, c_credits, c_source = run_strategy_c(company, role, max_results=max_results)
        print(f"  Source: {c_source}, returned {len(c_results)}, ~{c_credits} PDL credits")
        for i, c in enumerate(c_results[:max_results], 1):
            print(_fmt_contact(c, i))

        # Loose comparison (Stripe only)
        loose_results, loose_credits = [], 0
        if case.get("compare_loose"):
            print(f"\nCurrent loose query (size=20) — for comparison:")
            loose_results, loose_credits = loose_pdl_query(company, role, size=20)
            print(f"  Returned {len(loose_results)}, ~{loose_credits} PDL credits")
            for i, c in enumerate(loose_results[:10], 1):  # show top 10 only
                print(_fmt_contact(c, i))
            if len(loose_results) > 10:
                print(f"    ... and {len(loose_results) - 10} more")

            # Overlap analysis
            def _key(c):
                return ((c.get('FirstName', '') or '').lower(),
                        (c.get('LastName', '') or '').lower())
            tight_keys = {_key(c) for c in c_results}
            loose_keys = {_key(c) for c in loose_results}
            overlap = tight_keys & loose_keys
            print(f"\n  Overlap: {len(overlap)}/{len(c_results)} Strategy-C candidates "
                  f"appear in top-20 loose ({sorted(overlap)})")
            print(f"  Credit ratio: {c_credits} vs {loose_credits} "
                  f"({(loose_credits / max(c_credits, 1)):.1f}x cheaper)")

        results.append({
            "company": company, "role": role,
            "strategy_c": c_results, "c_credits": c_credits, "c_source": c_source,
            "loose": loose_results, "loose_credits": loose_credits,
        })

        print(f"\n  Running PDL total: {_total_pdl_credits}/{PDL_CREDIT_CAP}")

    # Final summary
    hr("TOTALS")
    sc_total = sum(r["c_credits"] for r in results)
    loose_total = sum(r["loose_credits"] for r in results)
    print(f"  Strategy C total:        {sc_total} PDL credits, {_total_perplexity_calls} Perplexity calls")
    print(f"  Loose comparison total:  {loose_total} PDL credits")
    print(f"  Grand total:             {_total_pdl_credits}/{PDL_CREDIT_CAP} PDL cap")
    print(f"\n  Per-company verdict (eyeball):")
    for r in results:
        print(f"    {r['company']:15} → {len(r['strategy_c']):>2} candidates "
              f"via {r['c_source']:25} ({r['c_credits']} credits)")
    hr("DONE — read output, judge quality, decide next step")


if __name__ == "__main__":
    main()
