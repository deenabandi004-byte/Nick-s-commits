"""
School affinity service - queries PDL for alumni of a school working in a field,
aggregates by company, and caches in Firestore for 30 days.
"""
import json
import hashlib
import time
from collections import Counter
from typing import List, Dict, Any

from app.config import PEOPLE_DATA_LABS_API_KEY, PDL_BASE_URL
from app.services.pdl_client import _school_aliases
from app.extensions import get_db

CACHE_TTL_SECONDS = 30 * 24 * 3600  # 30 days
PDL_FETCH_LIMIT = 500  # Max profiles to scan (balances cost vs accuracy)

# Title keywords by field - maps user-facing field names to PDL title search terms
FIELD_TITLE_KEYWORDS: Dict[str, List[str]] = {
    "data scientists": ["data scientist", "data analyst", "machine learning", "data engineer", "analytics"],
    "data science": ["data scientist", "data analyst", "machine learning", "data engineer", "analytics"],
    "software engineers": ["software engineer", "software developer", "sde", "backend engineer", "frontend engineer", "full stack"],
    "software engineering": ["software engineer", "software developer", "sde", "backend engineer", "frontend engineer"],
    "investment banking analysts": ["investment banking", "analyst", "ib analyst", "financial analyst"],
    "investment banking": ["investment banking", "analyst", "associate", "financial analyst"],
    "consultants": ["consultant", "management consultant", "strategy consultant", "associate consultant"],
    "consulting": ["consultant", "management consultant", "strategy consultant", "associate consultant"],
    "product managers": ["product manager", "product lead", "apm", "program manager"],
    "product management": ["product manager", "product lead", "apm", "program manager"],
    "marketing professionals": ["marketing", "brand manager", "content", "growth", "marketing manager"],
    "marketing": ["marketing", "brand manager", "content", "growth", "marketing manager"],
    "finance professionals": ["finance", "financial analyst", "fp&a", "treasury", "corporate finance"],
    "finance": ["finance", "financial analyst", "fp&a", "treasury", "corporate finance"],
    "accountants": ["accountant", "auditor", "tax", "cpa", "accounting"],
    "accounting": ["accountant", "auditor", "tax", "cpa", "accounting"],
}


def _cache_key(university: str, field: str) -> str:
    raw = f"{university.lower().strip()}_{field.lower().strip()}"
    return hashlib.md5(raw.encode()).hexdigest()


def _get_firestore_cache(university: str, field: str) -> list | None:
    """Check Firestore cache. Returns cached companies list or None."""
    db = get_db()
    if not db:
        return None
    try:
        key = _cache_key(university, field)
        doc_ref = db.collection("schoolAffinity").document(key)
        doc = doc_ref.get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        cached_at = data.get("cachedAt", 0)
        if isinstance(cached_at, (int, float)) and time.time() - cached_at < CACHE_TTL_SECONDS:
            print(f"[SchoolAffinity] Firestore cache hit for {university} / {field}")
            return data.get("companies", [])
        return None
    except Exception as e:
        print(f"[SchoolAffinity] Cache read error: {e}")
        return None


def _set_firestore_cache(university: str, field: str, companies: list):
    """Write results to Firestore cache."""
    db = get_db()
    if not db:
        return
    try:
        key = _cache_key(university, field)
        doc_ref = db.collection("schoolAffinity").document(key)
        doc_ref.set({
            "university": university,
            "field": field,
            "companies": companies,
            "cachedAt": time.time(),
        })
        print(f"[SchoolAffinity] Cached {len(companies)} companies for {university} / {field}")
    except Exception as e:
        print(f"[SchoolAffinity] Cache write error: {e}")


def _build_pdl_query(university: str, field: str) -> dict:
    """Build PDL Elasticsearch query for alumni at a school in a given field."""
    # School name matching - use aliases for broad coverage
    # Cap at 6 aliases to avoid PDL 400 errors from too many clauses
    aliases = _school_aliases(university)
    if not aliases:
        aliases = [university.lower().strip()]
    aliases = aliases[:6]

    school_clauses = [{"match": {"education.school.name": alias}} for alias in aliases]

    # Title matching - use field-specific keywords
    field_lower = field.lower().strip()
    title_keywords = FIELD_TITLE_KEYWORDS.get(field_lower, [field_lower])
    title_clauses = [{"match": {"job_title": kw}} for kw in title_keywords]

    query = {
        "bool": {
            "must": [
                # School: match any alias
                {"bool": {"should": school_clauses}},
                # Title: match any keyword
                {"bool": {"should": title_clauses}},
                # Currently employed
                {"exists": {"field": "job_company_name"}},
            ]
        }
    }
    return query


def _query_pdl(university: str, field: str) -> List[Dict[str, Any]]:
    """Query PDL for alumni, aggregate by company, return top 15."""
    import requests as req

    query_obj = _build_pdl_query(university, field)
    url = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }

    print(f"[SchoolAffinity] Querying PDL for {university} / {field}")

    company_counter: Counter = Counter()
    company_linkedin: Dict[str, str] = {}  # company_name → first linkedin_url found
    total_fetched = 0
    page_size = 100

    # Paginate up to PDL_FETCH_LIMIT
    while total_fetched < PDL_FETCH_LIMIT:
        body = {
            "query": query_obj,
            "size": min(page_size, PDL_FETCH_LIMIT - total_fetched),
        }
        if total_fetched > 0:
            body["from"] = total_fetched

        try:
            r = req.post(url, headers=headers, json=body, timeout=30)
        except Exception as e:
            print(f"[SchoolAffinity] PDL request error: {e}")
            break

        if r.status_code == 400 and total_fetched == 0:
            # Too many clauses - retry with just the core alias
            print(f"[SchoolAffinity] PDL 400 - retrying with simplified query")
            core = university.lower().strip()
            query_obj = {
                "bool": {
                    "must": [
                        {"bool": {"should": [{"match": {"education.school.name": core}}]}},
                        query_obj["bool"]["must"][1],  # keep title clauses
                        query_obj["bool"]["must"][2],  # keep exists clause
                    ]
                }
            }
            body["query"] = query_obj
            try:
                r = req.post(url, headers=headers, json=body, timeout=30)
            except Exception as e:
                print(f"[SchoolAffinity] PDL retry error: {e}")
                break
        if r.status_code == 404:
            print(f"[SchoolAffinity] PDL 404 - no results for this query")
            break
        if r.status_code != 200:
            print(f"[SchoolAffinity] PDL error {r.status_code}: {r.text[:200]}")
            break

        data = r.json()
        people = data.get("data", [])
        if not people:
            break

        for person in people:
            company = (person.get("job_company_name") or "").strip()
            if not company:
                continue
            company_counter[company] += 1
            if company not in company_linkedin:
                li = (person.get("linkedin_url") or "").strip()
                # Store company LinkedIn page if available (from company data, not person)
                company_li = (person.get("job_company_linkedin_url") or "").strip()
                if company_li:
                    company_linkedin[company] = company_li

        total_fetched += len(people)
        total_available = data.get("total", 0)
        print(f"[SchoolAffinity] Fetched {total_fetched}/{total_available} profiles")

        if total_fetched >= total_available:
            break

    if not company_counter:
        return []

    # Build ranked list - top 15 companies by alumni count
    top_companies = []
    for company_name, count in company_counter.most_common(15):
        entry: Dict[str, Any] = {
            "company_name": company_name,
            "alumni_count": count,
        }
        if company_name in company_linkedin:
            entry["linkedin_url"] = company_linkedin[company_name]
        top_companies.append(entry)

    print(f"[SchoolAffinity] Found {len(company_counter)} unique companies, returning top {len(top_companies)}")
    return top_companies


def get_school_affinity(university: str, field: str) -> List[Dict[str, Any]]:
    """
    Get top companies where alumni of a school work in a given field.
    Checks Firestore cache first (30-day TTL), falls back to PDL query.
    """
    # Check cache
    cached = _get_firestore_cache(university, field)
    if cached is not None:
        return cached

    # Query PDL
    companies = _query_pdl(university, field)

    # Cache if we got results
    if companies:
        _set_firestore_cache(university, field, companies)

    return companies
