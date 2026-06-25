"""
Prompt-specific PDL search service (isolated from normal search).

Implements:
- Progressive query relaxation
- OR-based location matching
- No school filters in PDL query (alumni filtering is post-fetch)
- Retry logic with exponential backoff
- Contact transformation

This file is ONLY used by the prompt-first search flow. It does not import or
modify any existing PDL search services or shared query builders.
"""
import os
import time
import random
import logging
import json
import hashlib
import threading
from typing import Any, Dict, List, Optional, Tuple

import requests
import requests.exceptions

from app.config import PEOPLE_DATA_LABS_API_KEY, PDL_BASE_URL
from app.services.pdl_client import clean_company_name

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# P2 FIX: Short-TTL cache for PDL search results (avoids duplicate API calls
# for identical searches within a few minutes)
# ---------------------------------------------------------------------------
_PDL_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_PDL_CACHE_LOCK = threading.Lock()
_PDL_CACHE_TTL = 300  # 5 minutes
_PDL_CACHE_MAX_SIZE = 50


def _cache_key(query: Dict[str, Any]) -> str:
    """Deterministic hash of a PDL query for caching."""
    raw = json.dumps(query, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _cache_get(key: str) -> Optional[List[Dict[str, Any]]]:
    with _PDL_CACHE_LOCK:
        entry = _PDL_CACHE.get(key)
        if entry and (time.time() - entry[0]) < _PDL_CACHE_TTL:
            logger.info("[PROMPT_PDL] Cache HIT for key=%s (%d records)", key, len(entry[1]))
            return entry[1]
        if entry:
            del _PDL_CACHE[key]  # expired
        return None


def _cache_set(key: str, records: List[Dict[str, Any]]) -> None:
    with _PDL_CACHE_LOCK:
        # Evict oldest entries if cache is full
        if len(_PDL_CACHE) >= _PDL_CACHE_MAX_SIZE:
            oldest_key = min(_PDL_CACHE, key=lambda k: _PDL_CACHE[k][0])
            del _PDL_CACHE[oldest_key]
        _PDL_CACHE[key] = (time.time(), records)

# -----------------------------
# Strategies (prompt-search only)
# -----------------------------
PROMPT_SEARCH_STRATEGIES = [
    {
        "name": "strict",
        "strict_job_title": True,
        "strict_location": True,
        "include_company": True,
    },
    {
        "name": "loose_job_title",
        "strict_job_title": False,
        "strict_location": True,
        "include_company": True,
    },
    {
        "name": "loose_location",
        "strict_job_title": False,
        "strict_location": False,
        "include_company": True,
    },
    {
        "name": "no_company",
        "strict_job_title": False,
        "strict_location": False,
        "include_company": False,
    },
]

PDL_SEARCH_URL = f"{PDL_BASE_URL}/person/search" if PDL_BASE_URL else "https://api.peopledatalabs.com/v5/person/search"


def _retry_pdl_call(func, max_retries=3, initial_delay=1.0):
    """Retry wrapper for PDL API calls with exponential backoff."""
    for attempt in range(max_retries + 1):
        try:
            return func()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            if attempt < max_retries:
                delay = initial_delay * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning("[PROMPT_PDL] Retryable error (attempt %d/%d): %s. Retrying in %.2fs", 
                             attempt + 1, max_retries + 1, e, delay)
                time.sleep(delay)
            else:
                logger.error("[PROMPT_PDL] Max retries exceeded: %s", e)
                raise
        except requests.exceptions.HTTPError as e:
            # Don't retry 4xx errors (except 429 rate limit)
            if e.response and e.response.status_code == 429:
                if attempt < max_retries:
                    retry_after = e.response.headers.get('Retry-After', '60')
                    delay = float(retry_after) + random.uniform(0, 2)
                    logger.warning("[PROMPT_PDL] Rate limited. Retrying in %.2fs", delay)
                    time.sleep(delay)
                else:
                    raise
            else:
                raise


def _build_job_clause(job_titles: List[str], strict: bool, require_fallback: bool = False) -> Dict[str, Any]:
    """
    Build job title clause using ALL title variations (not just the first).
    Strict: uses match_phrase with should (any title variation matches).
    Loose: uses tokenized matches on individual tokens (OR) with minimum_should_match.

    If require_fallback=True and no job titles provided, returns an "exists" clause
    to ensure we get people with job titles (PDL requires some person filter).
    """
    # Filter to non-empty titles
    titles = [t.strip() for t in job_titles if t and t.strip()] if job_titles else []

    if not titles:
        if require_fallback:
            return {"exists": {"field": "job_title"}}
        return {}

    if strict:
        # Use ALL title variations as should clauses (any one match is sufficient)
        if len(titles) == 1:
            return {"match_phrase": {"job_title": titles[0]}}
        return {
            "bool": {
                "should": [{"match_phrase": {"job_title": t}} for t in titles[:8]],
            }
        }

    # Loose: tokenize the primary title but require most tokens to match
    # PDL doesn't support minimum_should_match — use must for required tokens
    primary = titles[0]
    tokens = [t.strip() for t in primary.replace(",", " ").split() if t.strip()]
    if not tokens:
        return {"match": {"job_title": primary}}

    # Require most tokens via must, add title variations as optional boosters via should
    required_count = max(1, len(tokens) - 1)
    must_tokens = tokens[:required_count]
    optional_tokens = tokens[required_count:]

    must_clauses = [{"match": {"job_title": t}} for t in must_tokens]
    should_clauses = [{"match": {"job_title": t}} for t in optional_tokens]
    # Also add other title variations as phrase matches (broadens recall)
    for t in titles[1:5]:
        should_clauses.append({"match_phrase": {"job_title": t}})

    query: dict = {"bool": {"must": must_clauses}}
    if should_clauses:
        query["bool"]["should"] = should_clauses
    return query


_INTERNATIONAL_INDICATORS = {
    "london", "toronto", "mumbai", "bangalore", "berlin", "paris", "tokyo",
    "singapore", "sydney", "dublin", "amsterdam", "hong kong", "shanghai",
    "beijing", "seoul", "zurich", "munich", "madrid", "barcelona",
    "uk", "united kingdom", "canada", "india", "germany", "france", "japan",
    "australia", "ireland", "netherlands", "china", "south korea", "switzerland",
    "spain", "brazil", "mexico", "israel", "uae", "dubai",
}


def _build_location_clause(location_values: List[str], strict: bool) -> Dict[str, Any]:
    """
    Prompt-search-only location logic:
    - OR-based locality/metro/region matching (always uses match, never match_phrase)
    - P1 FIX: Only adds US country filter for US locations; international searches work correctly
    """
    if not location_values:
        return {}  # Return empty clause if no location provided (allow global search)

    primary = location_values[0].strip().lower()
    if not primary:
        return {"term": {"location_country": "united states"}}

    # P1 FIX: Detect international locations — don't force US country filter
    is_international = any(indicator in primary for indicator in _INTERNATIONAL_INDICATORS)

    location_should = [
        {"match": {"location_metro": primary}},
        {"match": {"location_locality": primary}},
        {"match": {"location_region": primary}},
    ]

    if is_international:
        # International: also try matching as country name, no US restriction
        location_should.append({"match": {"location_country": primary}})
        return {
            "bool": {
                "should": location_should,
            }
        }

    # US locations: keep the country filter for precision
    return {
        "bool": {
            "should": location_should,
            "must": [
                {"term": {"location_country": "united states"}},
            ]
        }
    }


def _build_company_clause(companies: List[str]) -> Dict[str, Any]:
    """
    Build a company filter for PDL Person Search.

    PDL stores job_company_name under unpredictable canonicals — BCG is
    "boston consulting group (bcg)", JPMorgan is "jpmorgan chase & co.", etc.
    Plain match_phrase on common short-names/acronyms either returns zero or
    matches low-quality lookalike records. Searching by job_company_website is
    far more reliable when we know the domain, so we prefer the website clause
    and fall back to a name match only for firms not in the curated map (which
    lives in pdl_client.COMPANY_DOMAIN_MAP, the single source of truth).

    We do NOT call PDL's Company Cleaner here: it returns unrelated firms for
    common acronyms (e.g. /v5/company/enrich?name=BCG → NZ IT consultancy).
    """
    from app.services.pdl_client import _domain_for_company
    if not companies:
        return {}
    primary = companies[0].strip()
    if not primary:
        return {}

    domain = _domain_for_company(primary)
    if domain:
        logger.info("[PROMPT_PDL] company=%r → website=%s (mapped)", primary, domain)
        return {"match_phrase": {"job_company_website": domain}}

    logger.info("[PROMPT_PDL] company=%r not in domain map, using name match_phrase", primary)
    return {"match_phrase": {"job_company_name": primary.lower()}}


def _build_query(
    filters: Dict[str, Any],
    strategy: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Build a PDL person/search query for prompt search.
    Does NOT include school filters (alumni filtered post-fetch).
    """
    must_clauses: List[Dict[str, Any]] = []

    # Extract roles (support both "roles" and "jobTitles" keys)
    roles = filters.get("roles", []) or filters.get("jobTitles", []) or []
    
    # Company handling (check first to know if we need job fallback)
    companies = []
    has_company_filter = False
    if strategy.get("include_company", True):
        companies = filters.get("company", [])
        if isinstance(companies, str):
            companies = [companies]
        company_clause = _build_company_clause(companies)
        if company_clause:
            must_clauses.append(company_clause)
            has_company_filter = True
            # Note: job_company_name already refers to the current/primary position in PDL

    # Build job clause - use fallback if no company provided (need at least one person filter)
    need_job_fallback = len(must_clauses) == 0  # No company clause added
    job_clause = _build_job_clause(roles, strategy["strict_job_title"], require_fallback=need_job_fallback)
    if job_clause:
        must_clauses.append(job_clause)

    # Location handling (optional - only add if provided)
    locations = filters.get("location", [])
    if isinstance(locations, str):
        locations = [locations]
    if locations:
        location_clause = _build_location_clause(locations, strategy["strict_location"])
        if location_clause:
            must_clauses.append(location_clause)

    # P3 FIX: Add industry filter when specified
    industries = filters.get("industries", [])
    if isinstance(industries, str):
        industries = [industries]
    if industries:
        industry_clauses = [{"match": {"industry": ind.lower().strip()}} for ind in industries if ind and ind.strip()]
        if industry_clauses:
            if len(industry_clauses) == 1:
                must_clauses.append(industry_clauses[0])
            else:
                must_clauses.append({"bool": {"should": industry_clauses}})

    # P0 FIX: Only return contacts that have email addresses (avoids paying for unusable contacts)
    must_clauses.append({"exists": {"field": "emails"}})

    # CRITICAL: PDL requires at least one filter - if still empty, add exists filter
    if not must_clauses:
        logger.warning("[PROMPT_PDL] No valid filters - adding fallback exists filter")
        must_clauses.append({"exists": {"field": "job_title"}})

    max_results = min(int(filters.get("max_results", 15) or 15), 50)

    return {
        "query": {
            "bool": {
                "must": must_clauses
            }
        },
        "size": max_results,
    }


def _call_pdl_with_pagination(query: Dict[str, Any], desired_limit: int = 50) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Execute a PDL person/search call with pagination support.
    Returns (records, raw_response_json).
    Uses short-TTL cache to avoid duplicate API calls for identical queries.
    """
    # P2 FIX: Check cache first
    ck = _cache_key(query)
    cached = _cache_get(ck)
    if cached is not None:
        return cached[:desired_limit], {}

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY or os.getenv("PEOPLE_DATA_LABS_API_KEY", ""),
    }

    if not headers["X-Api-Key"]:
        logger.error("[PROMPT_PDL] Missing PEOPLE_DATA_LABS_API_KEY")
        return [], {}

    all_records = []
    scroll_token = None
    page_size = min(100, desired_limit)  # PDL max is 100

    def _make_request(body):
        resp = requests.post(PDL_SEARCH_URL, json=body, headers=headers, timeout=30)
        if resp.status_code == 404:
            # PDL 404 means no results - not an error, just empty
            return {"status_code": 404, "data": [], "error": resp.json().get("error", {})}
        resp.raise_for_status()
        return resp.json()

    try:
        # First page
        body = query.copy()
        body["size"] = page_size

        def _first_page():
            return _make_request(body)

        response_data = _retry_pdl_call(_first_page)
        
        if response_data.get("status_code") == 404:
            logger.info("[PROMPT_PDL] PDL returned 404 - no records found")
            return [], response_data

        records = response_data.get("data", []) or []
        all_records.extend(records)
        scroll_token = response_data.get("scroll_token")

        # Pagination: continue fetching if we need more and have a scroll token
        while scroll_token and len(all_records) < desired_limit:
            def _next_page():
                next_body = {"scroll_token": scroll_token, "size": page_size}
                # Some PDL clusters require query in subsequent pages
                try:
                    return _make_request(next_body)
                except requests.exceptions.HTTPError as e:
                    if e.response and e.response.status_code == 400:
                        # Retry with query included
                        next_body["query"] = query["query"]
                        return _make_request(next_body)
                    raise

            page_data = _retry_pdl_call(_next_page)
            page_records = page_data.get("data", []) or []
            all_records.extend(page_records)
            scroll_token = page_data.get("scroll_token")
            
            if not page_records:
                break

        # P2 FIX: Cache successful results
        if all_records:
            _cache_set(ck, all_records)
        return all_records[:desired_limit], response_data

    except requests.exceptions.HTTPError as e:
        if e.response and e.response.status_code == 404:
            logger.info("[PROMPT_PDL] PDL 404 - no records found")
            return [], {}
        # Log full error details for debugging
        status = e.response.status_code if e.response else None
        body = e.response.text[:1000] if e.response else str(e)
        logger.error("[PROMPT_PDL] PDL HTTP error status=%s", status)
        logger.error("[PROMPT_PDL] PDL error response body: %s", body)
        logger.error("[PROMPT_PDL] Query that caused error: %s", json.dumps(query, indent=2, default=str))
        return [], {}
    except Exception as e:
        logger.warning("[PROMPT_PDL] PDL call failed: %s", e, exc_info=True)
        return [], {}


def _extract_contact_from_pdl_person(person: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Transform a PDL person record into contact format.
    This is a duplicate of extract_contact_from_pdl_person_enhanced but isolated for prompt search.
    """
    try:
        # Basic identity
        first_name = person.get('first_name', '').strip()
        last_name = person.get('last_name', '').strip()
        if not first_name or not last_name:
            return None

        # Experience
        experience = person.get('experience', []) or []
        if not isinstance(experience, list):
            experience = []

        work_experience_details, current_job = [], None
        if experience:
            current_job = experience[0]
            for i, job in enumerate(experience[:5]):
                if not isinstance(job, dict):
                    continue
                company_info = job.get('company') or {}
                title_info = job.get('title') or {}
                company_name = company_info.get('name', '') if isinstance(company_info, dict) else ''
                job_title = title_info.get('name', '') if isinstance(title_info, dict) else ''
                start_date = job.get('start_date') or {}
                end_date = job.get('end_date') or {}

                def fmt(d, default_end=False):
                    if not isinstance(d, dict):
                        return ""
                    y = d.get('year')
                    m = d.get('month')
                    if y:
                        return f"{m or 1}/{y}" if m else f"{y}"
                    return "Present" if default_end else ""

                start_str = fmt(start_date)
                end_str = fmt(end_date, default_end=(i == 0))
                if company_name and job_title:
                    duration = f"{start_str} - {end_str}" if start_str else "Date unknown"
                    work_experience_details.append(f"{job_title} at {company_name} ({duration})")

        company_name = ''
        job_title = ''
        if current_job and isinstance(current_job, dict):
            company_info = current_job.get('company') or {}
            title_info = current_job.get('title') or {}
            company_name = company_info.get('name', '') if isinstance(company_info, dict) else ''
            job_title = title_info.get('name', '') if isinstance(title_info, dict) else ''

        # Location
        location_info = person.get('location') or {}
        city = location_info.get('locality', '') if isinstance(location_info, dict) else ''
        state = location_info.get('region', '') if isinstance(location_info, dict) else ''

        # Email selection
        emails = person.get('emails') or []
        if not isinstance(emails, list):
            emails = []

        recommended = person.get('recommended_personal_email') or ''
        if not isinstance(recommended, str):
            recommended = ''

        best_email = "Not available"
        if emails:
            # Prefer personal emails
            for e in emails:
                if isinstance(e, dict):
                    addr = e.get('address', '').strip()
                    if addr and '@' in addr:
                        best_email = addr
                        break

        if recommended and '@' in recommended:
            best_email = recommended

        # Phone
        phone_numbers = person.get('phone_numbers') or []
        if not isinstance(phone_numbers, list):
            phone_numbers = []
        phone = phone_numbers[0] if phone_numbers else ''

        # LinkedIn
        profiles = person.get('profiles') or []
        if not isinstance(profiles, list):
            profiles = []

        linkedin_url = ''
        for p in profiles:
            if isinstance(p, dict) and 'linkedin' in (p.get('network') or '').lower():
                linkedin_url = p.get('url', '') or ''
                break

        # Education
        education = person.get('education') or []
        if not isinstance(education, list):
            education = []

        education_details, college_name = [], ""
        for edu in education:
            if not isinstance(edu, dict):
                continue
            school_info = edu.get('school') or {}
            school_name = school_info.get('name', '') if isinstance(school_info, dict) else ''
            degrees = edu.get('degrees') or []

            if not isinstance(degrees, list):
                degrees = []

            degree = degrees[0] if degrees else ''
            start_date = edu.get('start_date') or {}
            end_date = edu.get('end_date') or {}
            syear = start_date.get('year') if isinstance(start_date, dict) else None
            eyear = end_date.get('year') if isinstance(end_date, dict) else None

            if school_name:
                entry = school_name
                if degree:
                    entry += f" - {degree}"
                if syear or eyear:
                    entry += f" ({syear or '?'} - {eyear or 'Present'})"
                education_details.append(entry)
                if not college_name and 'high school' not in school_name.lower():
                    college_name = school_name

        education_history = '; '.join(education_details) if education_details else 'Not available'

        # Volunteer
        volunteer_work = []
        interests = person.get('interests') or []
        if not isinstance(interests, list):
            interests = []

        for interest in interests:
            if isinstance(interest, str):
                if any(k in interest.lower() for k in ['volunteer', 'charity', 'nonprofit', 'community', 'mentor']):
                    volunteer_work.append(interest)
                elif len(volunteer_work) < 3:
                    volunteer_work.append(f"{interest} enthusiast")

        summary = person.get('summary') or ''
        if isinstance(summary, str):
            vk = ['volunteer', 'charity', 'nonprofit', 'community service', 'mentor', 'coach']
            for k in vk:
                if k in summary.lower():
                    for sentence in summary.split('.'):
                        if k in sentence.lower():
                            volunteer_work.append(sentence.strip())
                            break
        volunteer_history = '; '.join(volunteer_work[:5]) if volunteer_work else 'Not available'

        # Work email
        work_email = 'Not available'
        for e in emails:
            if isinstance(e, dict) and (e.get('type') or '').lower() in ('work', 'professional'):
                work_email = e.get('address', '') or 'Not available'
                break

        # Store full PDL person data for alumni checking
        contact = {
            'FirstName': first_name,
            'LastName': last_name,
            'LinkedIn': linkedin_url,
            'Email': best_email or "Not available",
            'Title': job_title,
            'Company': company_name,
            'City': city,
            'State': state,
            'College': college_name,
            'Phone': phone,
            'PersonalEmail': recommended if isinstance(recommended, str) else '',
            'WorkEmail': work_email,
            'SocialProfiles': f'LinkedIn: {linkedin_url}' if linkedin_url else 'Not available',
            'EducationTop': education_history,
            'VolunteerHistory': volunteer_history,
            'WorkSummary': '; '.join(work_experience_details[:3]) if work_experience_details else f"Professional at {company_name}",
            'Group': f"{company_name} {job_title.split()[0] if job_title else 'Professional'} Team",
            'LinkedInConnections': person.get('linkedin_connections', 0),
            'DataVersion': person.get('dataset_version', 'Unknown'),
            # Store raw PDL person for alumni checking
            '_pdl_person': person,
        }

        return contact

    except Exception as e:
        logger.warning("[PROMPT_PDL] Failed to extract contact: %s", e, exc_info=True)
        return None


def is_target_alumni(profile: Dict[str, Any], target_schools: List[str]) -> bool:
    """
    Check if a profile is an alumni of any target school.
    Delegates to the consolidated contact_matches_school in pdl_client.
    """
    if not target_schools:
        return False

    from app.services.pdl_client import _school_aliases, contact_matches_school

    # Get raw PDL person if available (prompt search stores it under _pdl_person)
    check_target = profile.get("_pdl_person") or profile

    # Build combined aliases for all target schools
    all_aliases: list[str] = []
    for school in target_schools:
        all_aliases.extend(_school_aliases(school))

    if not all_aliases:
        return False

    return contact_matches_school(check_target, all_aliases, strictness="normal")


def rank_results(results: List[Dict[str, Any]], target_schools: List[str]) -> List[Dict[str, Any]]:
    """
    Rank: alumni first, then others. Preserve original order within buckets.
    """
    if not target_schools:
        return results
    
    alumni = []
    non_alumni = []
    
    for r in results:
        if is_target_alumni(r, target_schools):
            alumni.append(r)
        else:
            non_alumni.append(r)
    
    return alumni + non_alumni


def run_prompt_search(filters: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute prompt-first PDL search with progressive relaxation.
    Returns dict with contacts, strategy_used, total, alumni_matches.
    """
    if not PEOPLE_DATA_LABS_API_KEY:
        logger.error("[PROMPT_PDL] Missing PEOPLE_DATA_LABS_API_KEY")
        return {
            "contacts": [],
            "strategy_used": None,
            "total": 0,
            "alumni_matches": 0,
            "error": "PDL API key not configured",
        }

    target_schools = filters.get("schools", []) or []
    if isinstance(target_schools, str):
        target_schools = [target_schools]
    
    max_results = min(int(filters.get("max_results", 15) or 15), 50)
    
    results: List[Dict[str, Any]] = []
    strategy_used: Optional[str] = None

    # Progressive relaxation: try each strategy until we get results
    for strat in PROMPT_SEARCH_STRATEGIES:
        query = _build_query(filters, strat)
        
        # Debug: log full query details
        logger.info("[PROMPT_PDL] Strategy=%s", strat["name"])
        logger.info("[PROMPT_PDL] Input filters: %s", json.dumps(filters, indent=2, default=str))
        logger.info("[PROMPT_PDL] Built query: %s", json.dumps(query, indent=2, default=str))
        
        # Fetch more than needed to account for filtering
        desired_limit = max_results * 2 if target_schools else max_results
        records, raw_response = _call_pdl_with_pagination(query, desired_limit=desired_limit)
        
        # Transform PDL records to contact format
        contacts = []
        for record in records:
            contact = _extract_contact_from_pdl_person(record)
            if contact:
                contacts.append(contact)
        
        logger.info("[PROMPT_PDL] Strategy=%s → %s raw records → %s valid contacts", 
                   strat["name"], len(records), len(contacts))

        if contacts:
            results = contacts
            strategy_used = strat["name"]
            break
        else:
            logger.info("[PROMPT_PDL] Strategy=%s → 0 results", strat["name"])

    if not results:
        return {
            "contacts": [],
            "strategy_used": strategy_used,
            "total": 0,
            "alumni_matches": 0,
        }

    # Post-validation: filter out contacts that don't match company or school criteria
    target_company = None
    companies = filters.get("company", [])
    if isinstance(companies, str):
        companies = [companies]
    if companies:
        target_company = (companies[0] or "").strip() or None

    # When the target company is in our domain map, PDL has already filtered
    # by exact job_company_website — the name-based post-filter would only
    # produce false negatives (e.g. "MS" vs "morgan stanley" fails the
    # substring check). Skip name comparison in that case.
    from app.services.pdl_client import _domain_for_company
    target_domain = _domain_for_company(target_company) if target_company else None

    post_filtered = []
    for contact in results:
        # Company check: if user specified company, contact's current job must match
        if target_company and not target_domain:
            actual = (contact.get("Company") or "").strip()
            if not actual:
                name = f"{contact.get('FirstName', '')} {contact.get('LastName', '')}".strip()
                logger.info("[PostFilter] Dropped %s: company mismatch (expected=%s, got=no company)", name, target_company)
                continue
            cleaned_expected = clean_company_name(target_company).lower().strip()
            cleaned_actual = clean_company_name(actual).lower().strip()
            if cleaned_expected != cleaned_actual and not (cleaned_expected in cleaned_actual and len(cleaned_expected) >= 3):
                name = f"{contact.get('FirstName', '')} {contact.get('LastName', '')}".strip()
                logger.info("[PostFilter] Dropped %s: company mismatch (expected=%s, got=%s)", name, target_company, actual)
                continue
        # School check: if user specified schools, keep only alumni
        if target_schools and not is_target_alumni(contact, target_schools):
            name = f"{contact.get('FirstName', '')} {contact.get('LastName', '')}".strip()
            logger.info("[PostFilter] Dropped %s: school mismatch (expected one of %s)", name, target_schools)
            continue
        post_filtered.append(contact)

    if post_filtered != results:
        logger.info("[PostFilter] Kept %s contacts after post-validation (dropped %s non-matching)", len(post_filtered), len(results) - len(post_filtered))

    # Rank: alumni first (only affects order when both alumni and non-alumni present; after school filter all are alumni if target_schools)
    if target_schools:
        ranked = rank_results(post_filtered, target_schools)
        alumni_count = sum(1 for r in ranked if is_target_alumni(r, target_schools))
        logger.info("[PROMPT_PDL] Alumni matches: %s / %s", alumni_count, len(ranked))
    else:
        ranked = post_filtered
        alumni_count = 0

    # Remove internal PDL person data before returning
    for contact in ranked:
        contact.pop("_pdl_person", None)

    return {
        "contacts": ranked[:max_results],
        "strategy_used": strategy_used,
        "total": len(ranked),
        "alumni_matches": alumni_count,
    }
