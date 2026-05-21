"""
Job ranking utilities - pure Python, no Flask imports.
Deterministic pre-filtering, GPT-based ranking, and feedback adjustments.
"""
import re as _re
from datetime import datetime
from typing import Optional


# ---------------------------------------------------------------------------
# Data normalization helpers
# ---------------------------------------------------------------------------

def flatten_skills(skills_field) -> list[str]:
    if isinstance(skills_field, list):
        return [s for s in skills_field if isinstance(s, str)]
    if isinstance(skills_field, dict):
        flat = []
        for v in skills_field.values():
            if isinstance(v, list):
                flat.extend([s for s in v if isinstance(s, str)])
        return flat
    return []


def flatten_experience_title(title_field) -> str:
    if isinstance(title_field, str):
        return title_field
    if isinstance(title_field, dict):
        return title_field.get("name", "")
    return ""


# ---------------------------------------------------------------------------
# Field inference from careerTrack / major
# ---------------------------------------------------------------------------

# Explicit careerTrack → field key (same keys as MAJOR_FIELD_MAP values)
# These feed into FIELD_CATEGORY_MAP for matching against job categories.
CAREER_TRACK_MAP = {
    "investment banking": "finance",
    "finance": "finance",
    "banking": "finance",
    "consulting": "consulting",
    "management consulting": "consulting",
    "software engineering": "tech",
    "software": "tech",
    "engineering": "tech",
    "product management": "consulting",  # PM maps to consulting field (has product_management category)
    "product": "consulting",
    "data science": "data",
    "data analytics": "data",
    "data": "data",
    "marketing": "marketing",
    "growth": "marketing",
    "venture capital": "venture_capital",
    "private equity": "venture_capital",
    "private equity / vc": "venture_capital",
    "vc": "venture_capital",
    "pe": "venture_capital",
    "sales & trading": "finance",
    "corporate finance / fp&a": "finance",
}

MAJOR_FIELD_MAP = {
    "finance": "finance", "economics": "finance", "accounting": "finance",
    "investment": "finance", "computer science": "tech", "data science": "data",
    "information systems": "tech", "software": "tech", "electrical engineering": "tech",
    "marketing": "marketing", "business administration": "consulting",
    "management": "consulting", "statistics": "data", "mathematics": "data",
    "communications": "marketing", "psychology": "consulting",
    "real estate": "real_estate", "urban planning": "real_estate",
    "venture": "venture_capital", "entrepreneurship": "venture_capital",
}

FIELD_CATEGORY_MAP = {
    "finance":    ["finance_banking", "consulting"],
    "tech":       ["software_engineering", "data_science", "product_management"],
    "data":       ["data_science", "software_engineering", "product_management"],
    "marketing":  ["marketing_growth", "product_management"],
    "consulting": ["consulting", "finance_banking", "product_management"],
    "real_estate": ["real_estate", "finance_banking"],
    "venture_capital": ["venture_capital", "finance_banking", "consulting"],
}


def infer_field(profile: dict) -> Optional[str]:
    # 1. Explicit careerTrack from onboarding (highest priority)
    career_track = (profile.get("goals") or {}).get("careerTrack", "").lower().strip()
    if career_track:
        category = CAREER_TRACK_MAP.get(career_track)
        if category:
            return category

    # 2. Fallback: infer from major
    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    major = (education.get("major") or profile.get("major") or "").lower().strip()
    for key, field in MAJOR_FIELD_MAP.items():
        if key in major:
            return field
    return None


def infer_preferred_type(profile: dict) -> Optional[str]:
    # 1. Explicit jobTypes from onboarding (highest priority)
    job_types = (profile.get("location") or {}).get("jobTypes") or []
    if job_types:
        has_intern = "Internship" in job_types
        has_ft = "Full-Time" in job_types
        if has_intern and has_ft:
            return None  # no preference - user wants both
        if has_intern:
            return "INTERNSHIP"
        if has_ft:
            return "FULLTIME"

    # 2. Fallback: infer from graduation year
    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    grad_year = education.get("graduation_year") or profile.get("graduationYear")
    if not grad_year:
        return None
    try:
        return "FULLTIME" if int(grad_year) - datetime.now().year <= 1 else "INTERNSHIP"
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Category / title exclusions - filter out irrelevant blue-collar jobs
# ---------------------------------------------------------------------------

EXCLUDED_CATEGORIES = frozenset([
    "manufacturing", "construction", "healthcare", "retail",
    "food_service", "transportation", "agriculture",
])

EXCLUDED_TITLE_KEYWORDS = [
    "assembly", "manufacturing", "warehouse", "forklift", "cdl",
    "nursing", "medical assistant", "dental", "hvac", "electrician",
    "plumber", "truck driver", "cashier", "barista",
    "it support", "help desk", "desktop support",
    "technical support specialist", "field technician",
    "field service", "maintenance technician",
]

# Always excluded - clearly not entry-level regardless of graduation year
SENIOR_TITLE_KEYWORDS = [
    "sr. ", "sr ", "senior ", "lead ", "principal ", "staff ",
    "director", "vp ", "vice president", "head of",
    "managing director", "partner",
]

# "Partner" is excluded UNLESS it's one of these entry-level roles
_PARTNER_EXCEPTIONS = ("channel partner", "partner manager", "partner success")

# "Manager" is excluded UNLESS preceded by "product" or "program"
_MANAGER_EXCEPTIONS = ("product manager", "program manager")

NON_US_LOCATION_KEYWORDS = [
    # Countries
    "india", "brazil", "canada", "singapore", "united kingdom",
    "australia", "germany", "france", "netherlands",
    "china", "japan", "mexico", "ireland", "poland", "spain",
    "italy", "sweden", "denmark", "finland", "norway",
    # Indian cities
    "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad",
    "chennai", "pune", "kolkata", "ahmedabad", "noida", "gurgaon",
    # Other international cities
    "toronto", "vancouver", "montreal", "london", "manchester",
    "berlin", "amsterdam", "paris", "sydney", "melbourne",
    "hong kong", "tokyo", "beijing", "shanghai",
    "mexico city", "sao paulo", "dublin", "warsaw",
]

# "uk" needs word-boundary matching to avoid false positives on substrings
_UK_RE = _re.compile(r"\buk\b", _re.IGNORECASE)


def _get_grad_year(profile: dict) -> Optional[int]:
    """Extract graduation year from profile as int, or None."""
    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    raw = education.get("graduation_year") or profile.get("graduationYear")
    if not raw:
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


def _is_excluded(job: dict) -> bool:
    """Return True if a job should be excluded from ranking entirely."""
    if job.get("category") in EXCLUDED_CATEGORIES:
        return True
    title_lower = (job.get("title") or "").lower()
    if any(kw in title_lower for kw in EXCLUDED_TITLE_KEYWORDS):
        return True
    # Always exclude senior-level titles (not entry-level)
    for kw in SENIOR_TITLE_KEYWORDS:
        if kw in title_lower:
            # "partner" has entry-level exceptions (e.g. "partner manager")
            if kw == "partner" and any(exc in title_lower for exc in _PARTNER_EXCEPTIONS):
                continue
            return True
    # Exclude "manager" unless it's "product manager" or "program manager"
    if "manager" in title_lower and not any(exc in title_lower for exc in _MANAGER_EXCEPTIONS):
        return True
    return False


def _normalize_location(loc) -> str:
    """Coerce location to a string - handles dict, str, or None."""
    if not loc:
        return ""
    if isinstance(loc, str):
        return loc
    if isinstance(loc, dict):
        parts = [loc.get("addressLocality"), loc.get("addressRegion"), loc.get("addressCountry")]
        return ", ".join(str(p) for p in parts if p)
    return str(loc)


def _is_non_us(job: dict) -> bool:
    """Return True if job is based in a non-US location.

    Keeps jobs where location is purely "Remote" or "Remote - USA" etc.
    Excludes jobs like "Remote, Singapore" where the primary location is international.
    """
    location_lower = _normalize_location(job.get("location")).lower()
    # Check keyword list AND word-boundary regex for short codes like "uk"
    has_international = (
        any(kw in location_lower for kw in NON_US_LOCATION_KEYWORDS)
        or bool(_UK_RE.search(location_lower))
    )
    if not has_international:
        return False
    # Pure remote with no international qualifier → keep
    if job.get("remote_derived") and location_lower.strip() in ("remote", "remote - usa", "remote - us"):
        return False
    return True


# ---------------------------------------------------------------------------
# Deterministic pre-filter
# ---------------------------------------------------------------------------

def deterministic_score(job: dict, profile: dict) -> float:
    score = 0.0
    user_field = infer_field(profile)
    preferred_type = infer_preferred_type(profile)
    user_skills = set(s.lower() for s in flatten_skills(
        (profile.get("resumeParsed") or {}).get("skills", [])
    ))

    # Field alignment (careerTrack or major → job category)
    if user_field and job.get("category") in FIELD_CATEGORY_MAP.get(user_field, []):
        score += 40
    if preferred_type and job.get("type") == preferred_type:
        score += 30
    elif not preferred_type:
        score += 15
    if user_skills:
        desc_lower = job.get("description_raw", "").lower()
        score += min(sum(1 for s in user_skills if s in desc_lower) * 4, 20)

    # Graduation year fit
    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    grad_year = education.get("graduation_year") or profile.get("graduationYear")
    if grad_year:
        try:
            years_left = int(grad_year) - datetime.now().year
            if years_left <= 1 and job.get("type") == "FULLTIME":
                score += 10
            elif years_left >= 2 and job.get("type") == "INTERNSHIP":
                score += 10
            else:
                score += 4
        except (ValueError, TypeError):
            pass

    # Dream company bonus
    dream_companies = (profile.get("goals") or {}).get("dreamCompanies") or []
    if dream_companies:
        job_company = (job.get("company") or "").lower().strip()
        if job_company and any(dc.lower().strip() in job_company or job_company in dc.lower().strip()
                               for dc in dream_companies):
            score += 15

    # Location preference bonus
    pref_location = ((profile.get("location") or {}).get("preferredLocation") or "").strip()
    job_location = _normalize_location(job.get("location")).lower()
    if job.get("remote_derived") or "remote" in job_location:
        score += 5
    if pref_location and pref_location.lower() not in ("", "remote"):
        if pref_location.lower() in job_location:
            score += 10

    return score


def prefilter_candidates(jobs: list[dict], profile: dict, top_n: int = 30) -> list[dict]:
    import logging
    _logger = logging.getLogger(__name__)

    # Exclude irrelevant categories, titles, senior roles, and non-US jobs
    excluded_count = 0
    non_us_count = 0
    eligible = []
    for j in jobs:
        if _is_excluded(j):
            excluded_count += 1
        elif _is_non_us(j):
            non_us_count += 1
        else:
            eligible.append(j)
    _logger.info("Excluded %d senior/irrelevant jobs, %d non-US jobs from %d total", excluded_count, non_us_count, len(jobs))

    scored = sorted(
        [(job, deterministic_score(job, profile)) for job in eligible],
        key=lambda x: x[1], reverse=True
    )

    # Apply minimum score threshold to avoid sending junk to GPT
    MIN_RESULTS = 20
    filtered = [(job, s) for job, s in scored if s >= 15]
    if len(filtered) < MIN_RESULTS:
        filtered = [(job, s) for job, s in scored if s >= 10]
    if len(filtered) < MIN_RESULTS:
        filtered = scored[:MIN_RESULTS]

    return [job for job, _ in filtered[:top_n]]


# ---------------------------------------------------------------------------
# GPT ranking
# ---------------------------------------------------------------------------

def _mark_unranked(jobs: list[dict]) -> list[dict]:
    """Mark all jobs as unranked and return them."""
    for job in jobs:
        job["match_score"] = None
        job["match_reason"] = None
        job["ranked"] = False
    return jobs


GPT_RANK_COUNT = 20  # Send only top N to GPT; rest get deterministic scores


def rank_with_gpt(jobs: list[dict], profile: dict) -> list[dict]:
    from backend.app.services.openai_client import client
    from openai import RateLimitError
    import json
    import re
    import time
    import logging

    logger = logging.getLogger(__name__)

    # Split: top 20 go to GPT, remainder get deterministic scores
    gpt_jobs = jobs[:GPT_RANK_COUNT]
    fallback_jobs = jobs[GPT_RANK_COUNT:]

    education = (profile.get("resumeParsed") or {}).get("education", {}) or {}
    skills = flatten_skills((profile.get("resumeParsed") or {}).get("skills", []))
    experience = (profile.get("resumeParsed") or {}).get("experience", []) or []

    exp_lines = ", ".join([
        f'{flatten_experience_title(e.get("title", ""))} at {e.get("company", "")}'
        for e in experience[:3]
        if flatten_experience_title(e.get("title", "")) and e.get("company")
    ]) or "None listed"

    goals = profile.get("goals") or {}
    career_track = goals.get("careerTrack", "")
    dream_companies = goals.get("dreamCompanies") or []
    pref_location = (profile.get("location") or {}).get("preferredLocation", "")

    profile_str = f"""STUDENT PROFILE:
- Major: {education.get("major") or profile.get("major", "Not specified")}
- Graduation: {education.get("graduation_year") or profile.get("graduationYear", "Not specified")}
- University: {education.get("school") or profile.get("university", "Not specified")}
- Career goal: {career_track or "Not specified"}
- Dream companies: {", ".join(dream_companies) or "None listed"}
- Preferred location: {pref_location or "Not specified"}
- Skills: {", ".join(skills[:15]) or "None listed"}
- Experience: {exp_lines}"""

    jobs_str = "JOBS:\n"
    for job in gpt_jobs:
        title = (job.get("title") or "")[:60]
        company = (job.get("company") or "")[:30]
        location = (_normalize_location(job.get("location")) or "")[:30]
        desc = (job.get("description_raw") or "")[:100]
        jobs_str += (
            f'[{job["job_id"]}] {title} @ {company} | {location}\n'
            f'  {job.get("type")} | {desc}\n'
        )

    system_prompt = """You are a job matching assistant for college students.
Rank jobs by fit: 1) Field alignment with major 2) Job type fit 3) Skills match 4) Seniority fit.
match_reason: max 12 words, mention their major OR a specific skill.
Return ONLY JSON array: [{"job_id":"...","match_score":85,"match_reason":"..."}]
Include every job_id. Order by match_score descending."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": profile_str + "\n\n" + jobs_str},
    ]

    def _call_gpt():
        return client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=8000,
            temperature=0.3,
        )

    try:
        try:
            response = _call_gpt()
        except RateLimitError:
            logger.warning("GPT ranking hit 429 - retrying in 10s")
            time.sleep(10)
            response = _call_gpt()

        raw = re.sub(
            r"```(?:json)?", "",
            response.choices[0].message.content.strip()
        ).strip().rstrip("`").strip()
        ranking_map = {
            item["job_id"]: {
                "match_score": int(item.get("match_score", 50)),
                "match_reason": item.get("match_reason", "")
            }
            for item in json.loads(raw) if "job_id" in item
        }

        # Apply GPT scores to top 20
        ranked = []
        for job in gpt_jobs:
            if job["job_id"] in ranking_map:
                job["match_score"] = ranking_map[job["job_id"]]["match_score"]
                job["match_reason"] = ranking_map[job["job_id"]]["match_reason"]
                job["ranked"] = True
            else:
                job["match_score"] = None
                job["match_reason"] = None
                job["ranked"] = False
            ranked.append(job)

        # Apply deterministic scores (scaled to 0-100) for jobs 21-50
        if fallback_jobs:
            det_scored = [(j, deterministic_score(j, profile)) for j in fallback_jobs]
            max_det = max((s for _, s in det_scored), default=1) or 1
            for job, det_s in det_scored:
                # Scale deterministic score to 0-49 range (always below GPT-ranked)
                job["match_score"] = int((det_s / max_det) * 49)
                job["match_reason"] = "Matched by skills and profile"
                job["ranked"] = True
                ranked.append(job)

        return sorted(ranked, key=lambda j: j.get("match_score") or 0, reverse=True)
    except RateLimitError:
        logger.warning("GPT ranking hit 429 twice - returning unranked")
        return _mark_unranked(jobs)
    except Exception as e:
        logger.warning(f"GPT ranking failed: {e}")
        return _mark_unranked(jobs)


# ---------------------------------------------------------------------------
# Feedback adjustments
# ---------------------------------------------------------------------------

def apply_feedback_adjustments(ranked_jobs: list[dict], preferences: list[dict]) -> list[dict]:
    from collections import Counter

    liked = Counter()
    disliked = Counter()
    hidden = set()

    for p in preferences:
        cat = p.get("category", "")
        if p.get("signal") == "positive":
            liked[cat] += 1
        elif p.get("signal") == "negative":
            disliked[cat] += 1
            hidden.add(p.get("job_id", ""))

    adjusted = []
    for job in ranked_jobs:
        if job["job_id"] in hidden:
            continue
        if job.get("ranked") and job.get("match_score") is not None:
            score = job["match_score"]
            cat = job.get("category", "")
            score += min(liked.get(cat, 0) * 5, 15)
            score -= min(disliked.get(cat, 0) * 8, 24)
            job["match_score"] = max(0, min(100, score))
        adjusted.append(job)

    return sorted(adjusted, key=lambda j: j.get("match_score") or 0, reverse=True)


def cap_per_company(jobs: list[dict], max_per_company: int = 3) -> list[dict]:
    """Limit results to max N jobs per company, keeping highest-scored."""
    from collections import defaultdict
    counts: dict[str, int] = defaultdict(int)
    result = []
    for job in jobs:
        company_key = (job.get("company") or "").lower().strip()
        if counts[company_key] < max_per_company:
            result.append(job)
            counts[company_key] += 1
    return result
