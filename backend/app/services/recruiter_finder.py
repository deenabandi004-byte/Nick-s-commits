"""
Recruiter Finder Service

Finds the most relevant recruiters at a company for a specific job type.
Uses PDL person search with recruiter-specific job title queries.

Usage:
    from app.services.recruiter_finder import find_recruiters
    
    recruiters = find_recruiters(
        company_name="Google",
        job_type="engineering",  # engineering, sales, intern, general
        job_title="Software Engineer",  # Original job title for context
        location="San Francisco, CA"  # Optional, to prefer local recruiters
    )
"""

import re
import time
from typing import List, Dict, Optional, Literal, Any
from .pdl_client import (
    clean_company_name,
    clean_location_name,
    extract_contact_from_pdl_person_enhanced,
    execute_pdl_search,
    determine_location_strategy
)
from .recruiter_email_generator import generate_recruiter_emails
from .hunter import enrich_contacts_with_hunter
from ..config import (
    PDL_BASE_URL,
    PEOPLE_DATA_LABS_API_KEY,
)


# Map our internal job_type values to PDL's canonical `job_title_role` enum.
# Unmapped job_types fall through to the existing loose tier loop (which is
# title-text-based and doesn't need a canonical role).
# PDL roles confirmed from docs: engineering, sales, marketing, finance,
# operations, product, design, hr, legal, it, support, consulting, etc.
_JOB_TYPE_TO_PDL_ROLE = {
    "engineering": "engineering",
    "sales": "sales",
    "marketing": "marketing",
    "finance": "finance",
    "product": "product",
    "design": "design",
    "operations": "operations",
    "hr": "human_resources",
    # Deliberately unmapped (fall through to loose tier loop):
    #   "general" — too broad to map cleanly
    #   "intern"  — interns aren't a job_title_role; level handles this
}

# Seniority levels we consider hiring-decision-makers. Maps to PDL's
# `job_title_levels` array enum.
_DECISION_MAKER_LEVELS = ["manager", "director", "vp", "head", "cxo", "owner"]


def _tight_target_for(max_results: int) -> int:
    """How many decision-maker slots to reserve for the tight query.

    Option D mix: every search returns 1-3 decision-makers (tight) + the rest
    as recruiters (loose). Free users (max=2-3) get 1-2 decision-makers + 1
    recruiter; Pro users get 2-3 + several recruiters. Always leaves at least
    one recruiter slot so users get the reply-friendly cohort.
    """
    if max_results <= 2:
        return 1
    if max_results <= 5:
        return 2
    return 3


def _build_tight_pdl_query(company: str, pdl_role: str, size: int = 3) -> dict:
    """Build PDL /person/search body that returns precise hiring decision-makers.

    Uses bool/must with term filters — the documented PDL query shape. Does
    NOT use multi_match or field boosting (PDL rejects both). Returns up to
    `size` profiles, costing `size` credits per HIT (0 on empty).
    """
    return {
        "query": {
            "bool": {
                "must": [
                    {"term": {"job_company_name": company.lower()}},
                    {"term": {"job_title_role": pdl_role}},
                    {"exists": {"field": "linkedin_url"}},
                    {"terms": {"job_title_levels": _DECISION_MAKER_LEVELS}},
                ]
            }
        },
        "size": size,
    }


def _run_tight_pdl_query(company: str, pdl_role: str, size: int = 3) -> List[Dict]:
    """Execute the tight PDL query and extract contacts. Empty list on miss/error."""
    from .pdl_client import extract_contact_from_pdl_person_enhanced
    body = _build_tight_pdl_query(company, pdl_role, size)
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }
    try:
        r = requests.post(
            f"{PDL_BASE_URL}/person/search",
            headers=headers, json=body, timeout=30,
        )
        if r.status_code == 404:
            return []
        if r.status_code != 200:
            print(f"[TightPDL] {r.status_code}: {r.text[:200]}")
            return []
        data = (r.json() or {}).get("data", []) or []
        contacts = []
        for person in data:
            try:
                c = extract_contact_from_pdl_person_enhanced(person, target_company=company)
                if c:
                    c["_source"] = "tight_pdl"
                    contacts.append(c)
            except Exception:
                continue
        return contacts
    except Exception as e:
        print(f"[TightPDL] exception: {e}")
        return []


def _split_name(full_name: str) -> tuple[str, str]:
    """Split 'Jane Van Doe' -> ('Jane', 'Van Doe'). First word is first name,
    everything after is last name. Handles common edge cases (extra whitespace,
    single names).
    """
    parts = (full_name or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


# Role/title tokens we expect to see in things that look like job descriptions
# rather than person names. Firecrawl's `hiring_manager` field sometimes returns
# titles ("Chief Technology Officer") instead of names ("Jane Doe"); we reject
# those so they don't poison the candidate pool with garbage synthetic records.
_ROLE_TOKENS = frozenset({
    "ceo", "cto", "cfo", "coo", "cmo", "cpo", "ciso", "cro", "chro",
    "vp", "svp", "evp", "avp", "vice",
    "director", "head", "chief", "officer", "president", "chairman",
    "chairwoman", "founder", "co-founder", "cofounder", "owner", "executive",
    "manager", "supervisor", "lead", "principal", "senior",
    "engineer", "engineering", "scientist", "developer", "designer", "analyst",
    "consultant", "specialist", "recruiter", "partner", "associate",
    "department", "team", "hiring",
})


def _looks_like_person_name(s: str) -> bool:
    """Heuristic: does this string look like a real person's name?

    Rejects role descriptions ('Chief Technology Officer'), team labels
    ('Hiring Team'), empty strings, and single-word strings (too ambiguous
    to seed PDL with). Accepts typical First Last and multi-part names.
    """
    if not isinstance(s, str):
        return False
    cleaned = s.strip()
    if not cleaned:
        return False
    # Strip trailing role context after a comma — "Jane Doe, CTO" -> "Jane Doe"
    if "," in cleaned:
        cleaned = cleaned.split(",", 1)[0].strip()
        if not cleaned:
            return False
    parts = cleaned.split()
    # Must be 2-5 words. Single-word "names" (Madonna) are too risky as PDL
    # seeds; 6+ words is almost certainly a description.
    if not (2 <= len(parts) <= 5):
        return False
    # Reject if any word matches a role token (case-insensitive).
    lowered = [p.lower().strip(".,") for p in parts]
    if any(tok in _ROLE_TOKENS for tok in lowered):
        return False
    # Reject if no word starts uppercase — proper names are title-cased.
    if not any(p[:1].isupper() for p in parts):
        return False
    return True


def _seed_from_firecrawl_name(name: str, company: str, company_aliases: List[str]) -> List[Dict]:
    """Look up a Firecrawl-extracted hiring-manager name in PDL.

    Uses /person/enrich (1 credit per HTTP 200, 404 misses are free) instead of
    /person/search (which charges 1 credit per profile returned). The name came
    from the actual job posting — high-confidence ground truth — so we want the
    single best PDL match, not a candidate list.

    Returns a list of seed candidates. Returns [] (no synthetic fallback) when
    the extracted string doesn't look like a person name — Firecrawl sometimes
    returns titles like "Chief Technology Officer" in the hiring_manager field,
    and we don't want those poisoning the candidate pool.
    """
    if not _looks_like_person_name(name):
        print(f"[HiringManagerFinder] Skipping Firecrawl seed — '{name}' doesn't look like a person name (likely a title or role description)")
        return []
    first, last = _split_name(name)
    if not first or not last:
        # /person/enrich requires both first_name AND last_name for name-based
        # matching. Single-name strings can't be enriched reliably.
        return []

    seeds: List[Dict] = []
    try:
        from .pdl_client import enrich_by_name, extract_contact_from_pdl_person_enhanced
        # enrich_by_name is decorated with @meter_call so credits show up in
        # observability. 1 credit on HIT, 0 on 404.
        pdl_person = enrich_by_name(first, last, company, min_likelihood=4)
        if pdl_person:
            contact = extract_contact_from_pdl_person_enhanced(pdl_person, target_company=company)
            if contact:
                contact["_source"] = "firecrawl_seed"
                seeds.append(contact)
    except Exception as e:
        print(f"[HiringManagerFinder] PDL seed enrich failed for '{name}' @ {company}: {e}")

    if not seeds:
        # PDL miss (404 = no charge) — keep the name anyway so Hunter can try
        # to derive an email from name + company.
        seeds.append({
            "FirstName": first,
            "LastName": last,
            "Title": "Hiring Manager",
            "Company": company,
            "Email": "",
            "IsCurrentlyAtTarget": True,
            "_source": "firecrawl_seed_synthetic",
        })
    return seeds
import requests

# Job type to recruiter title mapping
RECRUITER_TITLES_BY_JOB_TYPE = {
    "engineering": [
        "technical recruiter",
        "engineering recruiter", 
        "software recruiter",
        "tech recruiter",
        "technology recruiter",
        "IT recruiter",
    ],
    "sales": [
        "sales recruiter",
        "business development recruiter",
        "commercial recruiter",
        "revenue recruiter",
    ],
    "marketing": [
        "marketing recruiter",
        "creative recruiter",
        "brand recruiter",
    ],
    "finance": [
        "finance recruiter",
        "financial recruiter",
        "accounting recruiter",
    ],
    "intern": [
        "university recruiter",
        "campus recruiter",
        "college recruiter",
        "early career recruiter",
        "internship recruiter",
        "university relations",
        "campus relations",
        "early talent",
        "emerging talent",
    ],
    "general": [
        # Prioritize actual recruiting managers first
        "recruiting manager",
        "talent acquisition manager",
        "recruiting director",
        "talent acquisition director",
        # Then recruiting-focused titles
        "talent acquisition",
        "recruiter",
        "talent partner",
        "talent sourcer",
        "sourcer",
        # HR titles with recruiting focus (lower priority)
        "HR recruiter",
        # General HR/people ops (lowest priority, only as fallback)
        "people operations",
    ]
}

# Keywords that indicate job type
JOB_TYPE_KEYWORDS = {
    "engineering": [
        "engineer", "developer", "software", "backend", "frontend", 
        "full stack", "fullstack", "devops", "sre", "infrastructure",
        "data engineer", "ml engineer", "machine learning", "platform",
        "systems", "embedded", "firmware", "mobile", "ios", "android",
        "web developer", "programmer", "architect"
    ],
    "sales": [
        "sales", "account executive", "business development", "bdr", "sdr",
        "account manager", "customer success", "revenue"
    ],
    "marketing": [
        "marketing", "brand", "content", "social media", "growth",
        "product marketing", "demand generation", "communications"
    ],
    "finance": [
        "finance", "financial", "accounting", "accountant", "controller",
        "treasury", "tax", "audit", "analyst"
    ],
    "intern": [
        "intern", "internship", "co-op", "coop", "summer", "new grad",
        "entry level", "early career", "graduate", "student"
    ]
}


def determine_job_type(job_title: str, job_description: str = "") -> str:
    """
    Determine the job type based on title and description.
    
    Returns one of: engineering, sales, marketing, finance, intern, general
    """
    combined_text = f"{job_title} {job_description}".lower()
    
    # Check for intern first (highest priority)
    for keyword in JOB_TYPE_KEYWORDS["intern"]:
        if keyword in combined_text:
            return "intern"
    
    # Check other job types
    for job_type, keywords in JOB_TYPE_KEYWORDS.items():
        if job_type == "intern":
            continue
        for keyword in keywords:
            if keyword in combined_text:
                return job_type
    
    return "general"


# Hiring Manager Priority Tiers (5 tiers, 18 priority levels)
HIRING_MANAGER_PRIORITY_TIERS = {
    1: {  # Tier 1: Direct Hiring Pipeline (Priority 1-4) - Highest Priority
        "priority_range": (1, 4),
        "titles": [
            "hiring manager",
            "recruiter",
            "talent acquisition specialist",
            "recruiting coordinator"
        ],
        "base_score": 100
    },
    2: {  # Tier 2: Team Decision Makers (Priority 5-8) - High Priority
        "priority_range": (5, 8),
        "titles": [
            "team lead",
            "engineering manager",  # Will be replaced with job-type-specific manager
            "department head",
            "hr manager"
        ],
        "base_score": 70
    },
    3: {  # Tier 3: Organizational Influence (Priority 9-12) - Medium Priority
        "priority_range": (9, 12),
        "titles": [
            "hr business partner",
            "staffing manager",
            "director",
            "vp"
        ],
        "base_score": 40
    },
    4: {  # Tier 4: Referral Sources (Priority 13-15) - Lower Priority
        "priority_range": (13, 15),
        "titles": [
            "people operations",
            "employee in similar role",  # Generic - will be job-type-specific
            "executive assistant"
        ],
        "base_score": 20
    },
    5: {  # Tier 5: Executives (Priority 16-18) - Only for Small Companies
        "priority_range": (16, 18),
        "titles": [
            "founder",
            "ceo",
            "coo"
        ],
        "base_score": 10
    }
}

# Job type to department manager mapping
DEPARTMENT_MANAGER_BY_JOB_TYPE = {
    "engineering": ["engineering manager", "software engineering manager", "tech manager", "development manager"],
    "sales": ["sales manager", "business development manager", "account manager"],
    "marketing": ["marketing manager", "brand manager", "growth manager"],
    "finance": ["finance manager", "accounting manager", "financial manager"],
    "intern": ["university recruiter", "campus recruiter", "early career manager"],
    "general": ["manager", "department manager", "team manager"]
}


COMPANY_ALIASES = {
    "mckinsey": "McKinsey & Company",
    "goldman": "Goldman Sachs",
    "jp morgan": "JPMorgan Chase & Co.",
    "jpmorgan": "JPMorgan Chase & Co.",
    "morgan stanley": "Morgan Stanley",
    "bofa": "Bank of America",
    "bank of america": "Bank of America",
    "bcg": "Boston Consulting Group",
    "bain": "Bain & Company",
    "deloitte": "Deloitte",
    "pwc": "PricewaterhouseCoopers",
    "ey": "Ernst & Young",
    "kpmg": "KPMG",
    "google": "Google",
    "meta": "Meta",
    "facebook": "Meta",
    "amazon": "Amazon",
    "apple": "Apple",
    "microsoft": "Microsoft",
    "netflix": "Netflix",
    "uber": "Uber",
    "airbnb": "Airbnb",
    "stripe": "Stripe",
    "palantir": "Palantir Technologies",
    "citadel": "Citadel",
    "jane street": "Jane Street",
    "two sigma": "Two Sigma",
    "blackrock": "BlackRock",
    "kkr": "KKR & Co.",
    "blackstone": "Blackstone",
    "carlyle": "The Carlyle Group",
}


def _resolve_company_alias(company_name: str) -> list:
    """Return [user_input, canonical_name] if alias exists, else [cleaned_name]."""
    cleaned = clean_company_name(company_name)
    lower = (company_name or "").strip().lower()
    canonical = COMPANY_ALIASES.get(lower)
    if canonical and canonical.lower() != cleaned.lower():
        return [cleaned, canonical]
    return [cleaned] if cleaned else [company_name]


def get_recruiter_titles_for_job_type(job_type: str) -> List[str]:
    """
    Get list of recruiter titles to search for based on job type.

    Always includes general recruiter titles as fallback.
    """
    titles = RECRUITER_TITLES_BY_JOB_TYPE.get(job_type, []).copy()
    
    # Add general titles as fallback (but they'll rank lower)
    if job_type != "general":
        titles.extend(RECRUITER_TITLES_BY_JOB_TYPE["general"])
    
    return titles


def build_recruiter_search_query(
    company_name: str,
    recruiter_titles: List[str],
    location: Optional[str] = None,
    company_aliases: List[str] = None
) -> Dict:
    """
    Build PDL Elasticsearch query for recruiter search.

    Note: We intentionally do NOT filter by state/city because:
    1. Recruiters may be at HQ, regional offices, or remote
    2. The person applying doesn't care where the recruiter is located
    3. State filtering causes too many false negatives (0 results when recruiters exist)

    Args:
        company_name: Cleaned company name
        recruiter_titles: List of recruiter job titles to search for
        location: Optional location (NOT used for filtering, only for logging)
        company_aliases: Optional list of company name variants to match against

    Returns:
        PDL query dictionary
    """
    # Build job title should clause
    title_should = []
    for title in recruiter_titles:
        title_should.append({"match_phrase": {"job_title": title}})
        title_should.append({"match": {"job_title": title}})

    # Build company should clause — expand with aliases if available
    if company_aliases and len(company_aliases) > 1:
        company_should = []
        for name in company_aliases:
            company_should.append({"match_phrase": {"job_company_name": name.lower()}})
            company_should.append({"match": {"job_company_name": name.lower()}})
    else:
        company_should = [
            {"match_phrase": {"job_company_name": company_name}},
            {"match": {"job_company_name": company_name}}
        ]

    # Base query structure - NO location filter
    must_clauses = [
        {"bool": {"should": title_should}},
        {"bool": {"should": company_should}},
        {"term": {"location_country": "united states"}}  # US only
    ]

    # Log location for informational purposes (not used for filtering)
    if location:
        print(f"[RecruiterSearch] Location provided: '{location}' (NOT used for filtering - recruiters can be anywhere)")
    else:
        print(f"[RecruiterSearch] No location provided - searching all US recruiters at company")

    query_obj = {
        "bool": {
            "must": must_clauses
        }
    }

    print(f"[RecruiterSearch] Query: company={company_name}, aliases={company_aliases}, country=US, NO state/city filter")

    return query_obj


def parse_location_for_ranking(location_string: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """
    Parse location string and return (city, state) for ranking purposes.
    
    Handles edge cases:
    - "Los Angeles, CA, United States" -> ("los angeles", "california")
    - "Los Gatos, CA, United States (+1 other)" -> ("los gatos", "california")
    - "New York, NY" -> ("new york", "new york")
    - "California, United States" -> (None, "california")
    
    Returns: (city, state) both lowercase, state as full name
    """
    if not location_string:
        return None, None
    
    # State abbreviation to full name mapping (lowercase for PDL)
    STATE_ABBREV_TO_FULL = {
        "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas",
        "ca": "california", "co": "colorado", "ct": "connecticut", "de": "delaware",
        "fl": "florida", "ga": "georgia", "hi": "hawaii", "id": "idaho",
        "il": "illinois", "in": "indiana", "ia": "iowa", "ks": "kansas",
        "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
        "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
        "mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada",
        "nh": "new hampshire", "nj": "new jersey", "nm": "new mexico", "ny": "new york",
        "nc": "north carolina", "nd": "north dakota", "oh": "ohio", "ok": "oklahoma",
        "or": "oregon", "pa": "pennsylvania", "ri": "rhode island", "sc": "south carolina",
        "sd": "south dakota", "tn": "tennessee", "tx": "texas", "ut": "utah",
        "vt": "vermont", "va": "virginia", "wa": "washington", "wv": "west virginia",
        "wi": "wisconsin", "wy": "wyoming", "dc": "district of columbia"
    }
    
    # Clean up common suffixes like "(+1 other)"
    location = location_string.lower().strip()
    location = re.sub(r'\s*\(\+\d+\s*other\).*', '', location)
    
    parts = [p.strip() for p in location.split(',')]
    
    city = None
    state = None
    
    if len(parts) >= 3:
        # "Los Angeles, CA, United States"
        city = parts[0]
        state_abbrev = parts[1].strip()
        # Convert abbreviation to full name
        state = STATE_ABBREV_TO_FULL.get(state_abbrev, state_abbrev)
    elif len(parts) == 2:
        # Could be "Los Angeles, CA" or "California, United States"
        second_part = parts[1].strip()
        if second_part in STATE_ABBREV_TO_FULL:
            # "Los Angeles, CA"
            city = parts[0]
            state = STATE_ABBREV_TO_FULL[second_part]
        elif "united states" in second_part or "usa" in second_part:
            # "California, United States"
            state = parts[0]
        else:
            # Assume "City, State" where state is full name
            city = parts[0]
            state = second_part
    elif len(parts) == 1:
        # Just a state or city
        if parts[0] in STATE_ABBREV_TO_FULL:
            state = STATE_ABBREV_TO_FULL[parts[0]]
        else:
            # Could be a full state name or city - assume state
            state = parts[0]
    
    return city, state


def rank_recruiters(
    recruiters: List[Dict],
    job_type: str,
    target_company: str,
    job_location: Optional[str] = None
) -> List[Dict]:
    """
    Rank recruiters by relevance to the job type and location.
    
    Ranking factors (in priority order):
    1. Currently at target company (vs past employment) - +50 points
    2. Recruiting managers/leaders (recruiting manager, talent acquisition manager, etc.) - +40 points
       (Prioritized over general HR people)
    3. Location match (same city/state as job posting) - +20/+10 points
    4. Title match specificity (technical recruiter > recruiter for eng jobs) - +30 points
    5. Recruiting-focused titles (recruiter, talent acquisition, etc.) - +25 points
    6. Title seniority (senior, lead, manager, director, head) - +10 points
    7. HR-only titles (without recruiting focus) - -20 points penalty
    
    Returns sorted list with best matches first.
    """
    primary_titles = RECRUITER_TITLES_BY_JOB_TYPE.get(job_type, [])
    
    # Parse job location for ranking (not filtering)
    job_city, job_state = parse_location_for_ranking(job_location)
    
    def score_recruiter(recruiter: Dict) -> int:
        score = 0
        title = recruiter.get("Title", "").lower()
        company = recruiter.get("Company", "").lower()
        target = target_company.lower()
        recruiter_city = (recruiter.get("City", "") or "").lower()
        recruiter_state = (recruiter.get("State", "") or "").lower()
        
        # +50 points if currently at target company (verified by IsCurrentlyAtTarget flag)
        if recruiter.get('IsCurrentlyAtTarget', False):
            score += 50
        elif target in company:
            # Historical employment still gets some points, but less
            score += 10
        
        # +20 points for location match (same city)
        if job_city and recruiter_city and job_city in recruiter_city:
            score += 20
        # +10 points for state match (if city doesn't match)
        elif job_state and recruiter_state and job_state in recruiter_state:
            score += 10
        
        # PRIORITIZE RECRUITING MANAGERS OVER HR PEOPLE
        # +40 points for recruiting manager/leadership titles (highest priority for actual recruiting managers)
        recruiting_manager_keywords = ["recruiting manager", "talent acquisition manager", "recruiting director", 
                                       "talent acquisition director", "head of recruiting", "head of talent acquisition",
                                       "vp of recruiting", "vp of talent acquisition", "director of recruiting"]
        if any(keyword in title for keyword in recruiting_manager_keywords):
            score += 40
        
        # +30 points for specific recruiter title match
        for i, primary_title in enumerate(primary_titles):
            if primary_title in title:
                score += 30 - i  # Earlier titles in list = higher priority
                break
        
        # +25 points for other recruiting-focused titles (but lower than recruiting managers)
        recruiting_titles = ["recruiter", "talent acquisition", "talent partner", "talent sourcer", "sourcer"]
        if any(rt in title for rt in recruiting_titles) and "hr" not in title:
            score += 25
        
        # +10 points for seniority indicators (but only if not already counted above)
        if any(word in title for word in ["senior", "lead", "manager", "director", "head"]):
            score += 10
        
        # PENALIZE HR-ONLY TITLES (prioritize recruiting managers over general HR)
        # -20 points for HR titles that aren't recruiting-focused
        hr_only_keywords = ["hr manager", "hr director", "human resources", "people operations"]
        if any(keyword in title for keyword in hr_only_keywords) and "recruit" not in title:
            score -= 20
        
        # +15 points for "technical" or "engineering" in title (for eng jobs)
        if job_type == "engineering" and any(word in title for word in ["technical", "engineering", "tech"]):
            score += 15
        
        # +15 points for "campus" or "university" (for intern jobs)
        if job_type == "intern" and any(word in title for word in ["campus", "university", "college", "early"]):
            score += 15
        
        return score
    
    # Sort by score descending
    ranked = sorted(recruiters, key=score_recruiter, reverse=True)
    
    return ranked


_TITLE_STOPWORDS = {
    "senior", "junior", "jr", "sr", "lead", "principal", "staff",
    "associate", "assistant", "head", "of", "the", "and", "a", "an",
    "i", "ii", "iii", "iv", "for", "to", "at", "-", "&",
}


def _title_tokens(title: str) -> set:
    if not title:
        return set()
    tokens = re.split(r"[^a-z0-9]+", title.lower())
    return {t for t in tokens if t and t not in _TITLE_STOPWORDS and len(t) > 1}


def _parse_target_city_state(target_location: Optional[str]):
    """Parse a target location string into (city, state) lowercase tuple."""
    if not target_location:
        return None, None
    parts = [p.strip().lower() for p in target_location.split(",") if p.strip()]
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1]


def derive_receipts(
    contact: Dict[str, Any],
    target_title: Optional[str],
    target_location: Optional[str],
) -> List[Dict[str, Any]]:
    """
    Derive per-contact evidence receipts for the Find the Humans flow.

    Phase 1 supports two types only (no deep links):
      - title_match: contact Title shares non-stopword tokens with target_title
      - location_match: contact City+State matches target_location city+state

    Returns a list of receipt dicts:
        {"type": str, "label": str, "strength": "high"|"medium"|"low"}

    Callers should wrap individual invocations in try/except so a single
    bad contact cannot drop others.
    """
    receipts: List[Dict[str, Any]] = []

    # --- title_match ---------------------------------------------------------
    contact_title = (contact.get("Title") or "").strip()
    target_title_str = (target_title or "").strip()
    if contact_title and target_title_str:
        c_tokens = _title_tokens(contact_title)
        t_tokens = _title_tokens(target_title_str)
        if c_tokens and t_tokens:
            overlap = c_tokens & t_tokens
            if overlap:
                strength = "high" if len(overlap) >= 2 else "medium"
                # Pick a readable label: use the contact's actual title
                receipts.append({
                    "type": "title_match",
                    "label": f"Title: {contact_title}",
                    "strength": strength,
                })

    # --- location_match ------------------------------------------------------
    target_city, target_state = _parse_target_city_state(target_location)
    contact_city = (contact.get("City") or "").strip().lower()
    contact_state = (contact.get("State") or "").strip().lower()
    if target_city and contact_city:
        # City must match; if target has state, state must also match
        if contact_city == target_city:
            if target_state:
                if contact_state and contact_state == target_state:
                    loc_label = ", ".join(
                        [p for p in (contact.get("City"), contact.get("State")) if p]
                    )
                    receipts.append({
                        "type": "location_match",
                        "label": f"Based in {loc_label}",
                        "strength": "high",
                    })
                # City matches but state differs or is missing -> no receipt
            else:
                loc_label = ", ".join(
                    [p for p in (contact.get("City"), contact.get("State")) if p]
                )
                receipts.append({
                    "type": "location_match",
                    "label": f"Based in {loc_label}",
                    "strength": "medium",
                })

    return receipts


def find_recruiters(
    company_name: str,
    job_type: Optional[str] = None,
    job_title: str = "",
    job_description: str = "",
    location: Optional[str] = None,
    max_results: int = 5,
    generate_emails: bool = False,
    user_resume: Dict = None,
    user_contact: Dict = None,
    resume_text: str = "",
    template_instructions: str = "",
    role_type: str = "recruiter",
    titles_override: Optional[List[str]] = None
) -> Dict:
    """
    Main function to find recruiters at a company.
    
    Args:
        company_name: Company name from job posting
        job_type: Optional explicit job type (engineering, sales, intern, etc.)
        job_title: Job title from posting (used to determine job type if not provided)
        job_description: Job description (used to determine job type if not provided)
        location: Optional location to prefer local recruiters
        max_results: Maximum number of recruiters to return (default 5)
    
    Returns:
        {
            "recruiters": [...],  # List of recruiter contacts
            "job_type_detected": "engineering",
            "company_cleaned": "Google LLC",
            "search_titles": ["technical recruiter", ...],
            "total_found": 12,
            "credits_charged": 75  # 15 per contact
        }
    """
    if not PEOPLE_DATA_LABS_API_KEY:
        return {
            "recruiters": [],
            "job_type_detected": job_type or "general",
            "company_cleaned": company_name,
            "search_titles": [],
            "total_found": 0,
            "credits_charged": 0,
            "error": "PDL API key not configured"
        }
    
    # Clean company name with alias expansion
    company_names = _resolve_company_alias(company_name)
    cleaned_company = company_names[0]
    if not cleaned_company:
        cleaned_company = company_name

    # Determine job type if not provided
    if not job_type:
        job_type = determine_job_type(job_title, job_description)

    # Get titles to search for. An explicit titles_override (e.g. employee peer
    # titles derived by the LLM for the Find People flow) bypasses the recruiter
    # title mapping so the rest of this pipeline (current-employee filter,
    # ranking, Hunter verification, email generation, receipts) is reused for a
    # non-recruiter search.
    if titles_override:
        recruiter_titles = titles_override
    else:
        recruiter_titles = get_recruiter_titles_for_job_type(job_type)

    # Build query with alias expansion for better matching
    query_obj = build_recruiter_search_query(
        company_name=cleaned_company.lower(),
        recruiter_titles=recruiter_titles,
        location=location,
        company_aliases=company_names,
    )
    
    # Execute PDL search using existing execute_pdl_search function
    PDL_URL = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }
    
    try:
        # CREDIT-EFFICIENCY FIX (2026-06): PDL Person Search bills 1 credit
        # PER RECORD returned in `data`. The old desired_limit=20 burned 20
        # credits for a 3-recruiter card (85% waste). We need SOME buffer
        # because the post-fetch filter drops ex-employees (IsCurrentlyAtTarget)
        # — without buffer a single historical contaminated batch returns 0
        # current employees. max_results + 3 covers the typical historical
        # rate (~30-50%) without over-fetching. For max_results=3 this is 6
        # credits/call instead of 20.
        recruiter_fetch_limit = max(max_results + 3, 6)
        raw_recruiters, _ = execute_pdl_search(
            headers=headers,
            url=PDL_URL,
            query_obj=query_obj,
            desired_limit=recruiter_fetch_limit,
            search_type="recruiter_search",
            page_size=recruiter_fetch_limit,
            verbose=False,
            target_company=cleaned_company  # Pass target company for correct domain extraction
        )
        
        if not raw_recruiters:
            # No recruiters found - try fallback search
            print(f"[RecruiterSearch] No recruiters found for {cleaned_company}, trying fallback search...")
            return search_recruiters_with_fallback(
                company_name=cleaned_company,
                job_type=job_type,
                job_title=job_title,
                job_description=job_description,
                location=location,
                max_results=max_results,
                generate_emails=generate_emails,
                user_resume=user_resume,
                user_contact=user_contact
            )
        
        # Filter for current employees only (prioritize accuracy)
        current_recruiters = [r for r in raw_recruiters if r.get('IsCurrentlyAtTarget', False)]
        historical_recruiters = [r for r in raw_recruiters if not r.get('IsCurrentlyAtTarget', False)]
        
        print(f"[RecruiterFinder] Found {len(current_recruiters)} current employees and {len(historical_recruiters)} historical employees")
        
        # If we have enough current employees, only use those. Otherwise, fall back to historical.
        if len(current_recruiters) >= max_results:
            print(f"[RecruiterFinder] Using only current employees ({len(current_recruiters)} found)")
            recruiters_to_rank = current_recruiters
        elif len(current_recruiters) > 0:
            print(f"[RecruiterFinder] Using {len(current_recruiters)} current employees + {max_results - len(current_recruiters)} historical employees")
            # Mix: current first, then historical up to max_results
            recruiters_to_rank = current_recruiters + historical_recruiters[:max_results - len(current_recruiters)]
        else:
            print(f"[RecruiterFinder] ⚠️ No current employees found, falling back to historical employees")
            recruiters_to_rank = historical_recruiters
        
        # Rank recruiters (include location for ranking)
        ranked_recruiters = rank_recruiters(recruiters_to_rank, job_type, cleaned_company, location)

        # Limit results
        final_recruiters = ranked_recruiters[:max_results]

        # Attach Find the Humans receipts (phase 1: title_match + location_match only).
        # Wrapped per-contact so a single failure can never drop other recruiters.
        for recruiter in final_recruiters:
            try:
                recruiter["findHumansReceipts"] = derive_receipts(
                    recruiter, job_title, location
                )
            except Exception as receipt_error:
                print(f"[RecruiterFinder] derive_receipts failed for {recruiter.get('FirstName', '?')}: {receipt_error}")
                recruiter["findHumansReceipts"] = []

        # ✅ HUNTER.IO ENRICHMENT - VERIFY ALL RECRUITER EMAILS (including PDL emails)
        if generate_emails and final_recruiters:
            # Ensure Company field is set for Hunter.io (uses cleaned_company)
            for recruiter in final_recruiters:
                if not recruiter.get('Company'):
                    recruiter['Company'] = cleaned_company
            
            # ✅ VERIFY ALL RECRUITER EMAILS (not just those without emails)
            # This ensures PDL emails are verified before use
            print(f"[RecruiterFinder] 🔍 Verifying emails for {len(final_recruiters)} recruiters using Hunter.io...")
            try:
                # enrich_contacts_with_hunter now verifies ALL emails (including PDL emails)
                # Uses Email Finder API (1 API call per person instead of 10+)
                # skip_personal_emails=True ensures we only accept emails from target company
                final_recruiters = enrich_contacts_with_hunter(
                    contacts=final_recruiters,
                    max_enrichments=len(final_recruiters),  # Verify/enrich all recruiters
                    target_company=cleaned_company,  # Pass for batch summary logging and target domain
                    skip_personal_emails=True  # Skip personal emails - only accept target company emails
                )
                print(f"[RecruiterFinder] ✅ Email verification/enrichment complete")
            except Exception as hunter_error:
                print(f"[RecruiterFinder] ⚠️ Hunter.io verification/enrichment failed: {hunter_error}")
                # Continue with original recruiters (some may still have emails from PDL)
        
        # Generate emails if requested
        emails = []
        if generate_emails and user_resume and user_contact and final_recruiters:
            try:
                emails = generate_recruiter_emails(
                    recruiters=final_recruiters,
                    job_title=job_title,
                    company=cleaned_company,
                    job_description=job_description,
                    user_resume=user_resume,
                    user_contact=user_contact,
                    resume_text=resume_text,
                    template_instructions=template_instructions,
                    role_type=role_type
                )
                print(f"[RecruiterFinder] Generated {len(emails)} emails for {len(final_recruiters)} recruiters")
            except Exception as e:
                print(f"[RecruiterFinder] Error generating emails: {e}")
                emails = []
        
        return {
            "recruiters": final_recruiters,
            "emails": emails,
            "job_type_detected": job_type,
            "company_cleaned": cleaned_company,
            "search_titles": recruiter_titles[:5],
            "total_found": len(raw_recruiters),
            "credits_charged": 5 * len(final_recruiters)
        }
        
    except requests.exceptions.HTTPError as e:
        if e.response and e.response.status_code == 404:
            return {
                "recruiters": [],
                "job_type_detected": job_type,
                "company_cleaned": cleaned_company,
                "search_titles": recruiter_titles[:5],
                "total_found": 0,
                "credits_charged": 0,
                "message": f"No recruiters found at {cleaned_company}. Try reaching out via LinkedIn."
            }
        return {
            "recruiters": [],
            "job_type_detected": job_type,
            "company_cleaned": cleaned_company,
            "search_titles": recruiter_titles[:5],
            "total_found": 0,
            "credits_charged": 0,
            "error": f"PDL API error: {str(e)}"
        }
    except Exception as e:
        return {
            "recruiters": [],
            "job_type_detected": job_type,
            "company_cleaned": cleaned_company,
            "search_titles": recruiter_titles[:5],
            "total_found": 0,
            "credits_charged": 0,
            "error": str(e)
        }


def search_by_titles(
    company_name: str,
    titles: List[str],
    location: Optional[str] = None,
    max_results: int = 10
) -> List[Dict]:
    """
    Search PDL for people at a company with specific job titles.
    """
    # Build title clauses
    title_should = []
    for title in titles:
        title_should.append({"match_phrase": {"job_title": title}})
        title_should.append({"match": {"job_title": title}})
    
    # Build company should clause
    company_should = [
        {"match_phrase": {"job_company_name": company_name}},
        {"match": {"job_company_name": company_name}}
    ]
    
    query_obj = {
        "bool": {
            "must": [
                {"bool": {"should": title_should}},
                {"bool": {"should": company_should}},
                {"term": {"location_country": "united states"}}
            ]
        }
    }
    
    # Execute PDL search
    PDL_URL = f"{PDL_BASE_URL}/person/search"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
    }
    
    try:
        contacts, _ = execute_pdl_search(
            headers=headers,
            url=PDL_URL,
            query_obj=query_obj,
            desired_limit=max_results,
            search_type="title_search",
            page_size=max_results,
            verbose=False,
            target_company=company_name
        )
        return contacts or []
    except Exception as e:
        print(f"[RecruiterSearch] Error in fallback search: {e}")
        return []


def search_recruiters_with_fallback(
    company_name: str,
    job_type: Optional[str] = None,
    job_title: str = "",
    job_description: str = "",
    location: Optional[str] = None,
    max_results: int = 5,
    generate_emails: bool = False,
    user_resume: Dict = None,
    user_contact: Dict = None
) -> Dict:
    """
    Search for recruiters with fallback to HR/founders for small companies.
    """
    cleaned_company = clean_company_name(company_name) or company_name
    
    # Fallback 1: Try HR titles
    print(f"[RecruiterSearch] Fallback 1: Searching for HR contacts at {cleaned_company}...")
    hr_titles = [
        "HR Manager",
        "HR Director",
        "Human Resources",
        "People Operations",
        "Head of People",
        "HR Business Partner",
        "HR Generalist",
        "Talent Acquisition Manager",
        "People Manager"
    ]
    
    hr_contacts = search_by_titles(cleaned_company, hr_titles, location, max_results)
    
    if hr_contacts and len(hr_contacts) > 0:
        print(f"[RecruiterSearch] ✅ Found {len(hr_contacts)} HR contacts")
        
        # Rank by location if provided
        if location:
            hr_contacts = rank_recruiters(hr_contacts, "general", cleaned_company, location)
        
        final_contacts = hr_contacts[:max_results]
        
        # Generate emails if requested
        emails = []
        if generate_emails and user_resume and user_contact and final_contacts:
            try:
                emails = generate_recruiter_emails(
                    recruiters=final_contacts,
                    job_title=job_title,
                    company=cleaned_company,
                    job_description=job_description,
                    user_resume=user_resume,
                    user_contact=user_contact,
                    resume_text=resume_text,
                    template_instructions=template_instructions,
                    role_type=role_type
                )
            except Exception as e:
                print(f"[RecruiterSearch] Error generating emails: {e}")
                emails = []

        return {
            "recruiters": final_contacts,
            "emails": emails,
            "job_type_detected": job_type or "general",
            "company_cleaned": cleaned_company,
            "search_titles": hr_titles[:5],
            "total_found": len(hr_contacts),
            "credits_charged": 5 * len(final_contacts),
            "search_type": "hr",
            "message": f"No dedicated recruiters found. Found {len(final_contacts)} HR contacts at {cleaned_company} who may help with hiring."
        }
    
    # Fallback 2: Try founders/executives for small companies
    print(f"[RecruiterSearch] Fallback 2: Searching for executives at {cleaned_company}...")
    executive_titles = [
        "CEO",
        "CTO",
        "COO",
        "Founder",
        "Co-Founder",
        "President",
        "VP Engineering",
        "VP of Engineering",
        "Engineering Manager",
        "Hiring Manager",
        "Head of Engineering",
        "Director of Engineering"
    ]
    
    exec_contacts = search_by_titles(cleaned_company, executive_titles, location, max_results // 2)
    
    if exec_contacts and len(exec_contacts) > 0:
        print(f"[RecruiterSearch] ✅ Found {len(exec_contacts)} executives")
        
        # Rank by location if provided
        if location:
            exec_contacts = rank_recruiters(exec_contacts, "general", cleaned_company, location)
        
        final_contacts = exec_contacts[:max_results // 2]  # Limit executives
        
        # Generate emails if requested
        emails = []
        if generate_emails and user_resume and user_contact and final_contacts:
            try:
                emails = generate_recruiter_emails(
                    recruiters=final_contacts,
                    job_title=job_title,
                    company=cleaned_company,
                    job_description=job_description,
                    user_resume=user_resume,
                    user_contact=user_contact,
                    resume_text=resume_text,
                    template_instructions=template_instructions,
                    role_type=role_type
                )
            except Exception as e:
                print(f"[RecruiterSearch] Error generating emails: {e}")
                emails = []
        
        return {
            "recruiters": final_contacts,
            "emails": emails,
            "job_type_detected": job_type or "general",
            "company_cleaned": cleaned_company,
            "search_titles": executive_titles[:5],
            "total_found": len(exec_contacts),
            "credits_charged": 5 * len(final_contacts),
            "search_type": "executives",
            "message": f"Small company - no recruiters or HR found. Found {len(final_contacts)} executives who may handle hiring at {cleaned_company}."
        }
    
    # No contacts found at all
    print(f"[RecruiterSearch] ❌ No contacts found after all fallback searches")
    return {
        "recruiters": [],
        "emails": [],
        "job_type_detected": job_type or "general",
        "company_cleaned": cleaned_company,
        "search_titles": [],
        "total_found": 0,
        "credits_charged": 0,
        "search_type": "none",
        "message": f"No recruiters, HR, or executives found at {cleaned_company}. This company may be too small or not in our database."
    }


def get_hiring_manager_titles_for_tier(tier: int, job_type: str) -> List[str]:
    """
    Get list of hiring manager titles for a specific tier, customized by job type.
    
    Args:
        tier: Tier number (1-5)
        job_type: Job type (engineering, sales, etc.)
    
    Returns:
        List of job titles to search for
    """
    if tier not in HIRING_MANAGER_PRIORITY_TIERS:
        return []
    
    tier_data = HIRING_MANAGER_PRIORITY_TIERS[tier]
    titles = tier_data["titles"].copy()
    
    # Replace generic titles with job-type-specific ones
    if "engineering manager" in titles and job_type in DEPARTMENT_MANAGER_BY_JOB_TYPE:
        # Replace "engineering manager" with job-type-specific manager
        titles = [t if t != "engineering manager" else DEPARTMENT_MANAGER_BY_JOB_TYPE[job_type][0] 
                 for t in titles]
        # Also add other department managers for this job type
        titles.extend(DEPARTMENT_MANAGER_BY_JOB_TYPE[job_type][1:])
    
    if "employee in similar role" in titles:
        # For Tier 4, we'll search for people with similar job titles
        # This is handled separately in the search logic
        titles.remove("employee in similar role")
    
    return titles


def detect_company_size(company_name: str, all_contacts: List[Dict]) -> str:
    """
    Detect if company is small (<50 employees) or large.
    
    Uses heuristic: If we find <5 people total at company, likely small company.
    
    Args:
        company_name: Company name
        all_contacts: All contacts found at the company
    
    Returns:
        "small" or "large"
    """
    # Heuristic: If we found very few people, likely a small company
    if len(all_contacts) < 5:
        return "small"
    
    # Otherwise assume large
    return "large"


def should_include_executives(company_name: str, all_contacts: List[Dict]) -> bool:
    """
    Determine if we should include executives (Tier 5) in search.
    
    Only include executives for small companies.
    """
    company_size = detect_company_size(company_name, all_contacts)
    return company_size == "small"


def build_hiring_manager_search_query(
    company_name: str,
    titles: List[str],
    location: Optional[str] = None,
    company_aliases: List[str] = None
) -> Dict:
    """
    Build PDL Elasticsearch query for hiring manager search.

    Similar to build_recruiter_search_query but for hiring managers.
    """
    # Build job title should clause
    title_should = []
    for title in titles:
        title_should.append({"match_phrase": {"job_title": title}})
        title_should.append({"match": {"job_title": title}})

    # Build company should clause — expand with aliases if available
    if company_aliases and len(company_aliases) > 1:
        company_should = []
        for name in company_aliases:
            company_should.append({"match_phrase": {"job_company_name": name.lower()}})
            company_should.append({"match": {"job_company_name": name.lower()}})
    else:
        company_should = [
            {"match_phrase": {"job_company_name": company_name}},
            {"match": {"job_company_name": company_name}}
        ]

    # Base query structure - NO location filter (like recruiters)
    must_clauses = [
        {"bool": {"should": title_should}},
        {"bool": {"should": company_should}},
        {"term": {"location_country": "united states"}}  # US only
    ]

    query_obj = {
        "bool": {
            "must": must_clauses
        }
    }

    print(f"[HiringManagerSearch] Query: company={company_name}, aliases={company_aliases}, titles={titles[:3]}...")

    return query_obj


def rank_hiring_managers(
    hiring_managers: List[Dict],
    job_type: str,
    target_company: str,
    job_location: Optional[str] = None,
    job_title: str = ""
) -> List[Dict]:
    """
    Rank hiring managers by priority tier and relevance.
    
    Scoring system:
    - Base priority scores by tier (Tier 1: +100, Tier 2: +70, etc.)
    - +50 points: Currently at target company
    - +30 points: Exact title match for job type (Engineering Manager for engineering jobs)
    - +20 points: Location match (same city)
    - +10 points: State match
    - +10 points: Seniority indicators (Senior, Lead, Head)
    - -50 points: Tier 5 (executives) at large companies (penalty to deprioritize)
    
    Returns sorted list with best matches first.
    """
    # Parse job location for ranking
    job_city, job_state = parse_location_for_ranking(job_location)
    
    # Get department manager titles for this job type
    dept_managers = DEPARTMENT_MANAGER_BY_JOB_TYPE.get(job_type, [])
    
    def get_tier_for_title(title: str) -> Optional[int]:
        """Determine which tier a title belongs to."""
        title_lower = title.lower()
        for tier_num, tier_data in HIRING_MANAGER_PRIORITY_TIERS.items():
            for tier_title in tier_data["titles"]:
                if tier_title in title_lower:
                    return tier_num
        return None
    
    def score_hiring_manager(manager: Dict) -> int:
        score = 0
        title = (manager.get("Title", "") or "").lower()
        company = (manager.get("Company", "") or "").lower()
        target = target_company.lower()
        manager_city = (manager.get("City", "") or "").lower()
        manager_state = (manager.get("State", "") or "").lower()
        
        # Determine tier and get base score
        tier = get_tier_for_title(title)
        if tier:
            tier_data = HIRING_MANAGER_PRIORITY_TIERS[tier]
            score += tier_data["base_score"]
            
            # Penalty for Tier 5 (executives) at large companies
            if tier == 5:
                # We'll check company size later, but for now assume penalty if we have many results
                # This will be adjusted based on actual company size detection
                pass
        
        # +50 points if currently at target company
        if manager.get('IsCurrentlyAtTarget', False):
            score += 50
        elif target in company:
            score += 10  # Historical employment
        
        # +30 points for exact title match for job type (e.g., Engineering Manager for engineering jobs)
        for dept_manager_title in dept_managers:
            if dept_manager_title in title:
                score += 30
                break
        
        # +20 points for location match (same city)
        if job_city and manager_city and job_city in manager_city:
            score += 20
        # +10 points for state match (if city doesn't match)
        elif job_state and manager_state and job_state in manager_state:
            score += 10
        
        # +10 points for seniority indicators
        if any(word in title for word in ["senior", "lead", "head", "director", "vp"]):
            score += 10
        
        return score
    
    # Sort by score descending
    ranked = sorted(hiring_managers, key=score_hiring_manager, reverse=True)
    
    return ranked


def find_hiring_manager(
    company_name: str,
    job_type: Optional[str] = None,
    job_title: str = "",
    job_description: str = "",
    location: Optional[str] = None,
    max_results: int = 3,
    generate_emails: bool = False,
    user_resume: Dict = None,
    user_contact: Dict = None,
    resume_text: str = "",
    template_instructions: str = "",
    role_type: str = "hiring_manager",
    uid: Optional[str] = None,
    seed_hiring_manager_name: Optional[str] = None,
) -> Dict:
    """
    Find hiring managers at a company using tiered search strategy.
    
    Search Strategy:
    1. Start with Tier 1 (most likely to respond)
    2. If insufficient results, search Tier 2
    3. Continue down tiers until we have enough results
    4. For Tier 5 (executives), only search if company appears small
    
    Args:
        company_name: Company name from job posting
        job_type: Optional explicit job type (engineering, sales, intern, etc.)
        job_title: Job title from posting (used to determine job type if not provided)
        job_description: Job description (used to determine job type if not provided)
        location: Optional location to prefer local hiring managers
        max_results: Maximum number of hiring managers to return (default 3)
        generate_emails: Whether to generate personalized emails
        user_resume: User's parsed resume data
        user_contact: User's contact information
    
    Returns:
        {
            "hiringManagers": [...],  # List of hiring manager contacts
            "emails": [...],  # Generated emails (if requested)
            "job_type_detected": "engineering",
            "company_cleaned": "Google LLC",
            "total_found": 5,
            "credits_charged": 45,  # 15 per contact
            "search_tier_used": 2  # Highest tier that contributed results
        }
    """
    if not PEOPLE_DATA_LABS_API_KEY:
        return {
            "hiringManagers": [],
            "emails": [],
            "job_type_detected": job_type or "general",
            "company_cleaned": company_name,
            "total_found": 0,
            "credits_charged": 0,
            "error": "PDL API key not configured"
        }
    
    # Clean company name with alias expansion
    company_names = _resolve_company_alias(company_name)
    cleaned_company = company_names[0]
    if not cleaned_company:
        cleaned_company = company_name

    # Determine job type if not provided
    if not job_type:
        job_type = determine_job_type(job_title, job_description)

    print(f"[HiringManagerFinder] Searching for hiring managers at {cleaned_company} for {job_type} role")
    
    # ✅ FIX: Build larger candidate pool for email verification prioritization
    # Calculate candidate pool size: max(10, max_results * 5)
    CANDIDATE_POOL_SIZE = max(10, max_results * 5)
    print(f"[HiringManagerFinder] Candidate pool target: {CANDIDATE_POOL_SIZE} contacts (max_results={max_results})")
    
    # Track all contacts found for company size detection
    all_contacts_found = []
    candidate_pool = []  # ✅ Changed: Build candidate pool instead of final list
    final_hiring_managers = []  # Initialize before conditional block
    highest_tier_used = 0
    all_search_titles = []
    firecrawl_seed_used = False

    # Tier 0: Firecrawl-extracted hiring-manager name from the job posting itself.
    # Ground truth when present — gets priority over tier-based PDL discovery.
    if seed_hiring_manager_name and seed_hiring_manager_name.strip():
        seeds = _seed_from_firecrawl_name(
            name=seed_hiring_manager_name,
            company=cleaned_company,
            company_aliases=company_names,
        )
        if seeds:
            firecrawl_seed_used = True
            candidate_pool.extend(seeds)
            all_contacts_found.extend(seeds)
            sources = [s.get("_source") for s in seeds]
            print(f"[HiringManagerFinder] Firecrawl seed '{seed_hiring_manager_name}' -> {len(seeds)} candidates {sources}")

    # Option D — mixed cohort: tight first (1-3 decision-makers), tier loop
    # second (recruiters who reply). Together they give the user a richer
    # result set than either alone, while costing FAR less PDL when tight
    # supplies the precise candidates and the loose loop only tops up.
    tight_pdl_used = False
    tight_pdl_count = 0
    tight_target = _tight_target_for(max_results)
    tight_pdl_role = _JOB_TYPE_TO_PDL_ROLE.get((job_type or "").lower())
    if tight_pdl_role:
        print(f"[HiringManagerFinder] Tight PDL query: company={cleaned_company}, role={tight_pdl_role}, size={tight_target}")
        tight_results = _run_tight_pdl_query(cleaned_company, tight_pdl_role, size=tight_target)
        if tight_results:
            tight_pdl_used = True
            tight_pdl_count = len(tight_results)
            candidate_pool.extend(tight_results)
            all_contacts_found.extend(tight_results)
            highest_tier_used = 1  # treat as tier 1 for downstream telemetry
            print(f"[HiringManagerFinder] Tight PDL returned {len(tight_results)} decision-makers")
        else:
            print(f"[HiringManagerFinder] Tight PDL returned 0 — full tier-loop fallback")

    # Tier-loop sizing.
    # - Tight path: tight PDL already supplied precise candidates, so the loose
    #   tier loop just tops up to max_results.
    # - Loose-only path: pre-Phase-1 this fetched 20 contacts per tier × 5
    #   tiers = up to 100 PDL credits per request, even though we only return
    #   max_results (typically 3-5) at the end. Phase 1 of the Job Board
    #   Elevation Plan shrinks this so the buffer is sized to the actual
    #   ranking + email-verification dropout rate, not to a fixed 20.
    if tight_pdl_used:
        pool_target = max_results               # tight already supplied best — just top up
        per_tier_size = max(3, max_results - len(candidate_pool))  # don't over-fetch
    else:
        # Keep enough buffer for ranking + Hunter dropouts (~50% verification
        # rate, plus a couple slots for Perplexity "no longer here" drops).
        # max_results=3 → pool_target=12, per_tier_size=8 (so we usually
        # break after 1-2 tiers instead of running all 5).
        pool_target = max(max_results * 4, 12)
        per_tier_size = max(max_results * 2, 8)

    # Tiered search: Start with Tier 1, fallback to lower tiers if needed.
    for tier in range(1, 6):  # Tiers 1-5
        if len(candidate_pool) >= pool_target:
            break
        
        # Skip Tier 5 (executives) unless company is small
        if tier == 5:
            # We'll check company size after we've searched other tiers
            # For now, do a quick check: if we found many contacts, skip executives
            if len(all_contacts_found) >= 5:
                print(f"[HiringManagerFinder] Skipping Tier 5 (executives) - company appears large")
                continue
        
        # Get titles for this tier
        tier_titles = get_hiring_manager_titles_for_tier(tier, job_type)
        if not tier_titles:
            continue
        all_search_titles.extend(tier_titles)
        
        print(f"[HiringManagerFinder] Searching Tier {tier} with titles: {tier_titles[:3]}...")
        
        # Build query for this tier
        query_obj = build_hiring_manager_search_query(
            company_name=cleaned_company.lower(),
            titles=tier_titles,
            location=location,
            company_aliases=company_names,
        )
        
        # Execute PDL search
        PDL_URL = f"{PDL_BASE_URL}/person/search"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Api-Key": PEOPLE_DATA_LABS_API_KEY,
        }
        
        try:
            raw_managers, _ = execute_pdl_search(
                headers=headers,
                url=PDL_URL,
                query_obj=query_obj,
                desired_limit=per_tier_size,  # Shrunk when tight already supplied precise candidates
                search_type="hiring_manager_search",
                page_size=per_tier_size,
                verbose=False,
                target_company=cleaned_company
            )

            if raw_managers:
                all_contacts_found.extend(raw_managers)
                highest_tier_used = tier

                # ✅ FIX: Add all managers to candidate pool (up to pool size limit)
                # Filter for current employees first
                current_managers = [m for m in raw_managers if m.get('IsCurrentlyAtTarget', False)]
                historical_managers = [m for m in raw_managers if not m.get('IsCurrentlyAtTarget', False)]

                # Add current employees first, then historical, up to pool size
                remaining_slots = pool_target - len(candidate_pool)
                if remaining_slots > 0:
                    if len(current_managers) >= remaining_slots:
                        managers_to_add = current_managers[:remaining_slots]
                    elif len(current_managers) > 0:
                        managers_to_add = current_managers + historical_managers[:remaining_slots - len(current_managers)]
                    else:
                        managers_to_add = historical_managers[:remaining_slots]
                    
                    candidate_pool.extend(managers_to_add)
                    print(f"[HiringManagerFinder] Tier {tier}: Found {len(raw_managers)} total, added {len(managers_to_add)} to candidate pool (pool size: {len(candidate_pool)})")
            
        except Exception as e:
            print(f"[HiringManagerFinder] Error searching Tier {tier}: {e}")
            continue
    
    # ✅ FIX: Rank candidate pool, then verify emails BEFORE final selection
    if candidate_pool:
        # Rank all candidates by title relevance
        candidate_pool = rank_hiring_managers(
            candidate_pool,
            job_type,
            cleaned_company,
            location,
            job_title
        )

        # Firecrawl seeds are ground-truth from the actual posting — float to
        # the top regardless of rank_hiring_managers' title-based score.
        if firecrawl_seed_used:
            seeds = [c for c in candidate_pool if c.get("_source", "").startswith("firecrawl_seed")]
            others = [c for c in candidate_pool if not c.get("_source", "").startswith("firecrawl_seed")]
            candidate_pool = seeds + others

        # Apply penalty to Tier 5 (executives) if company is large
        company_size = detect_company_size(cleaned_company, all_contacts_found)
        if company_size == "large":
            # Re-rank to deprioritize executives
            non_executives = []
            executives = []
            executive_titles = ["founder", "ceo", "coo", "president"]
            
            for manager in candidate_pool:
                title = manager.get("Title", "").lower()
                if any(exec_title in title for exec_title in executive_titles):
                    executives.append(manager)
                else:
                    non_executives.append(manager)
            
            # Prefer non-executives in candidate pool
            candidate_pool = non_executives + executives
        
        print(f"[HiringManagerFinder] Candidate pool: {len(candidate_pool)} contacts (from Tier 1-{highest_tier_used})")

        # Perplexity verification — drop stale PDL candidates before Hunter so we
        # don't burn email-verify quota on people who already left. Behind a flag;
        # falls through cleanly on any failure.
        perplexity_dropped = 0
        perplexity_title_corrections = 0
        if candidate_pool:
            from .perplexity_client import verify_hiring_managers_v2
            pool_before = len(candidate_pool)
            perplexity_start = time.time()
            try:
                verifications = verify_hiring_managers_v2(
                    hms=candidate_pool,
                    company=cleaned_company,
                    job_title=job_title,
                )
                kept = []
                for manager, v in zip(candidate_pool, verifications):
                    still_there = v.get("still_at_company", "unknown")
                    conf = v.get("confidence", "low")
                    # Conservative drop rule: only drop on explicit "no" with non-low confidence.
                    if still_there == "no" and conf != "low":
                        perplexity_dropped += 1
                        continue
                    manager["_perplexity_verified"] = still_there == "yes"
                    manager["_perplexity_confidence"] = conf
                    manager["_actively_hiring"] = v.get("actively_hiring", "unknown")
                    signal = v.get("recent_hiring_signal", "")
                    if signal:
                        manager["_recent_hiring_signal"] = signal
                    fresh_title = v.get("current_title", "")
                    pdl_title = manager.get("Title", "")
                    if fresh_title and fresh_title.lower() != pdl_title.lower():
                        manager["_pdl_title"] = pdl_title
                        manager["Title"] = fresh_title
                        perplexity_title_corrections += 1
                    kept.append(manager)
                candidate_pool = kept
                perplexity_elapsed = time.time() - perplexity_start
                print(
                    f"[HiringManagerFinder] Perplexity verify: {pool_before} -> {len(candidate_pool)} "
                    f"(dropped {perplexity_dropped}, title-corrected {perplexity_title_corrections}) "
                    f"in {perplexity_elapsed:.2f}s"
                )
            except Exception as e:
                print(f"[HiringManagerFinder] Perplexity verification failed, continuing without: {e}")

        # ✅ FIX: Verify emails for the full candidate pool BEFORE selecting final results
        # This allows us to prioritize verified emails even when not generating emails
        for manager in candidate_pool:
            if not manager.get('Company'):
                manager['Company'] = cleaned_company

        # Phase 1 (Job Board Elevation Plan): skip Hunter on contacts whose
        # email is already flagged verified upstream (PDL high-confidence,
        # Perplexity confirmation, etc.). Pre-Phase-1 we ran Hunter on every
        # candidate including the ~30-40% with already-verified PDL emails,
        # burning Hunter quota for no incremental signal.
        # enrich_contacts_with_hunter mutates contact dicts in place, so we
        # rely on those mutations rather than the function's returned (possibly
        # reordered) list — keeps the original ranking intact.
        def _already_verified(m: dict) -> bool:
            email = m.get('Email')
            if not email or email == "Not available":
                return False
            return bool(
                m.get('EmailVerified') or
                m.get('is_verified_email') or
                m.get('email_verified')
            )

        needs_hunter = [m for m in candidate_pool if not _already_verified(m)]
        already_verified_count = len(candidate_pool) - len(needs_hunter)

        print(
            f"[HiringManagerFinder] Hunter scope: {len(needs_hunter)} need verification, "
            f"{already_verified_count} skipped (already verified)"
        )
        verify_start = time.time()
        try:
            if needs_hunter:
                enrich_contacts_with_hunter(
                    contacts=needs_hunter,
                    max_enrichments=len(needs_hunter),
                    target_company=cleaned_company,
                    skip_personal_emails=True,
                )
            verify_time = time.time() - verify_start
            print(
                f"[HiringManagerFinder] Email verification complete: {verify_time:.2f}s "
                f"for {len(needs_hunter)} contacts (skipped {already_verified_count})"
            )
        except Exception as hunter_error:
            print(f"[HiringManagerFinder] Hunter.io verification failed: {hunter_error}")
            verify_time = time.time() - verify_start
        
        # ✅ FIX: Sort by verified emails first, then by existing ranking
        verified_contacts = []
        unverified_contacts = []
        
        for manager in candidate_pool:
            # Check if email is verified (enrich_contacts_with_hunter sets EmailVerified and is_verified_email)
            email_verified = (
                manager.get('EmailVerified', False) or 
                manager.get('is_verified_email', False) or
                manager.get('email_verified', False)
            )
            
            # Also check if email exists and is not "Not available"
            has_email = manager.get('Email') and manager.get('Email') != "Not available"
            
            # Only consider verified if both email exists and is verified
            if has_email and email_verified:
                verified_contacts.append(manager)
            else:
                unverified_contacts.append(manager)
        
        print(f"[HiringManagerFinder] After verification: {len(verified_contacts)} verified, {len(unverified_contacts)} unverified")
        
        # ✅ FIX: Select final results - verified first, then unverified as fallback
        # Firecrawl seeds always make the final cut (they came from the actual
        # job posting — user explicitly opted in by pasting the URL).
        final_hiring_managers = []
        seen_ids = set()

        def _key(c):
            return (c.get("FirstName", ""), c.get("LastName", ""), c.get("Company", ""))

        for contact in candidate_pool:
            if (contact.get("_source") or "").startswith("firecrawl_seed"):
                k = _key(contact)
                if k not in seen_ids:
                    final_hiring_managers.append(contact)
                    seen_ids.add(k)

        # Add verified contacts next (up to max_results)
        for contact in verified_contacts:
            if len(final_hiring_managers) >= max_results:
                break
            k = _key(contact)
            if k in seen_ids:
                continue
            final_hiring_managers.append(contact)
            seen_ids.add(k)

        # If we still need more, add unverified contacts
        for contact in unverified_contacts:
            if len(final_hiring_managers) >= max_results:
                break
            k = _key(contact)
            if k in seen_ids:
                continue
            final_hiring_managers.append(contact)
            seen_ids.add(k)
        
        verified_count = len([c for c in final_hiring_managers if (
            c.get('EmailVerified', False) or 
            c.get('is_verified_email', False) or
            c.get('email_verified', False)
        )])
        print(f"[HiringManagerFinder] Selected {len(final_hiring_managers)} contacts: {verified_count} verified, {len(final_hiring_managers) - verified_count} unverified")
    
    # Generate emails if requested
    emails = []
    if generate_emails and user_resume and user_contact and final_hiring_managers:
        # Enrich with recent company news so the email prompt has a natural hook.
        # Batched per unique company, 24h cache (see batch_enrich_company_news).
        from .perplexity_client import batch_enrich_company_news
        try:
            news_by_idx = batch_enrich_company_news(final_hiring_managers)
            for idx, payload in news_by_idx.items():
                if 0 <= idx < len(final_hiring_managers) and payload:
                    final_hiring_managers[idx]["company_recent_news"] = payload.get("company_recent_news", [])
                    final_hiring_managers[idx]["company_description"] = payload.get("company_description", "")
            hit_count = sum(1 for h in final_hiring_managers if h.get("company_recent_news"))
            print(f"[HiringManagerFinder] Company-news enrichment: {hit_count}/{len(final_hiring_managers)} candidates have news context")
        except Exception as e:
            print(f"[HiringManagerFinder] Company-news enrichment failed, continuing without: {e}")
        try:
            emails = generate_recruiter_emails(
                recruiters=final_hiring_managers,
                job_title=job_title,
                company=cleaned_company,
                job_description=job_description,
                user_resume=user_resume,
                user_contact=user_contact,
                resume_text=resume_text,
                template_instructions=template_instructions,
                role_type=role_type
            )
            print(f"[HiringManagerFinder] Generated {len(emails)} emails for {len(final_hiring_managers)} hiring managers")
        except Exception as e:
            print(f"[HiringManagerFinder] Error generating emails: {e}")
            emails = []
    
    result = {
        "hiringManagers": final_hiring_managers,
        "emails": emails,
        "job_type_detected": job_type,
        "company_cleaned": cleaned_company,
        "total_found": len(all_contacts_found),
        "credits_charged": 5 * len(final_hiring_managers),
        "search_tier_used": highest_tier_used,
        "search_titles": all_search_titles[:10],
        "enrichment_meta": {
            "candidates_dropped": perplexity_dropped if 'perplexity_dropped' in locals() else 0,
            "candidates_title_corrected": perplexity_title_corrections if 'perplexity_title_corrections' in locals() else 0,
            "firecrawl_seed_used": firecrawl_seed_used,
            "firecrawl_seed_name": seed_hiring_manager_name if firecrawl_seed_used else None,
            "tight_pdl_used": tight_pdl_used,
            "tight_pdl_count": tight_pdl_count,
            "tight_pdl_role": tight_pdl_role,
            "tight_target": tight_target,
            "mix_mode": "tight+loose" if tight_pdl_used else "loose_only",
        },
    }

    # Add fallback messaging when no results or only low-tier results
    if not final_hiring_managers:
        result["fallback_message"] = f"No direct hiring managers found at {cleaned_company} for {job_type} roles. Consider searching for recruiters instead."
        result["suggestions"] = [{
            "type": "switch_tab",
            "label": f"Search recruiters at {cleaned_company}",
            "tab": "recruiters",
            "prefill": {"company": cleaned_company}
        }]
    elif highest_tier_used >= 4:
        result["fallback_message"] = f"Found {len(final_hiring_managers)} people in adjacent roles (People Operations, executives) who may influence hiring at {cleaned_company}."

    return result

