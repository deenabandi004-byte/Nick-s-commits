"""
Normalize raw JSearch results into a consistent Firestore document schema.
Uses OpenAI gpt-4o-mini for salary extraction when structured data is missing.
"""
import logging
import re
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Search tokenization
# ---------------------------------------------------------------------------
#
# search_terms is a flat lowercased token array stored on every job doc so the
# /api/jobs/search route can match against it with Firestore's array_contains
# operator. v1 indexes title + company + location. v2 may add description.
#
# Kept dumb on purpose: no stemming, no synonyms, no IDF. Company aliasing
# (Amazon Web Services -> Amazon) is the C2 normalizer's job; by the time we
# tokenize here, `company` is already the canonical brand.

_SEARCH_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Common words that match thousands of jobs and add noise. Keep this list
# short on purpose; we'd rather over-match than under-match.
_SEARCH_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "of", "for", "in", "at", "to", "with",
    "on", "by", "is", "as",
})


def _stringify_for_tokens(value) -> str:
    """Coerce an arbitrary field value into a string the tokenizer can read.

    Strings pass through. Dicts flatten to a space-joined string of their
    values; the JSON-LD `@type` discriminator is excluded so its literal type
    tag (e.g. "PostalAddress") never enters search_terms. Lists and tuples
    flatten to space-joined elements. Anything else is stringified.

    Exists because ~28 percent of legacy Fantastic.jobs docs store `location`
    as a JSON-LD PostalAddress dict instead of a string. Without this, the
    tokenizer crashes on `.lower()` for those docs and the backfill skips
    them. Live writes already produce string locations, so this also
    future-proofs the tokenizer against any other source that lands a
    structured value in a tokenized field.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(
            str(v) for k, v in value.items() if v and k != "@type"
        )
    if isinstance(value, (list, tuple)):
        return " ".join(str(v) for v in value if v)
    return str(value)


def _tokenize_for_search(*texts) -> list[str]:
    """Lowercase, split on non-alphanumerics, drop stopwords and length-1
    tokens. Order-preserving dedup so the array stays small and stable for
    diff-noise when re-normalizing the same doc.
    """
    seen: set[str] = set()
    out: list[str] = []
    for text in texts:
        s = _stringify_for_tokens(text)
        if not s:
            continue
        for tok in _SEARCH_TOKEN_RE.findall(s.lower()):
            if len(tok) < 2 or tok in _SEARCH_STOPWORDS:
                continue
            if tok in seen:
                continue
            seen.add(tok)
            out.append(tok)
    return out


def build_search_terms(title: str | None, company: str | None, location: str | None) -> list[str]:
    """Public entry point. Backfill scripts import this so production and
    backfill produce byte-identical arrays.
    """
    return _tokenize_for_search(title or "", company or "", location or "")


# ---------------------------------------------------------------------------
# Company alias normalization
# ---------------------------------------------------------------------------
#
# Scrapers store whatever string the ATS surfaces, so the same brand reaches
# Firestore under many names: "Amazon" via Greenhouse, "Amazon Web Services"
# via Fantastic.jobs, "Amazon.com Services LLC" via Workday paperwork.
# `canonicalize_company` collapses those to one canonical brand string so a
# search for "amazon" hits every Amazon job, and aggregations (per-company
# rank, dedup, the cap_per_company step) stop double-counting.
#
# Rules:
#   - Lookup is case-insensitive and whitespace-stripped.
#   - The raw input is preserved on the doc as `company_raw` so analytics can
#     still see which legal entity posted the job.
#   - Unknown strings pass through unchanged. We deliberately do NOT do fuzzy
#     matching: "Open AI" -> "OpenAI" reads helpful, but "Open Doors" ->
#     "OpenAI" would be a disaster. Add aliases explicitly when you find them.
#
# The alias table is intentionally small. Grow it from observed search misses,
# not speculation.

_COMPANY_ALIASES: dict[str, str] = {
    # Amazon family
    "amazon web services": "Amazon",
    "aws": "Amazon",
    "amazon.com services llc": "Amazon",
    "amazon.com services": "Amazon",
    "amazon.com": "Amazon",
    "amazon services llc": "Amazon",
    "amazon dev center": "Amazon",
    # Meta
    "facebook": "Meta",
    "facebook inc": "Meta",
    "facebook, inc.": "Meta",
    "meta platforms": "Meta",
    "meta platforms inc": "Meta",
    "instagram": "Meta",
    "whatsapp": "Meta",
    # Alphabet / Google
    "alphabet": "Google",
    "alphabet inc": "Google",
    "google llc": "Google",
    "google inc": "Google",
    "youtube": "Google",
    # Microsoft
    "microsoft corp": "Microsoft",
    "microsoft corporation": "Microsoft",
    "linkedin": "Microsoft",
    "github": "Microsoft",
    # Apple
    "apple inc": "Apple",
    "apple inc.": "Apple",
    # X / Twitter
    "twitter": "X",
    "x corp": "X",
    "x corp.": "X",
    # Other repeats observed in scraped data
    "salesforce.com": "Salesforce",
    "salesforce inc": "Salesforce",
    "ibm corp": "IBM",
    "international business machines": "IBM",
    "jpmorgan": "JPMorgan Chase",
    "jpmorgan chase": "JPMorgan Chase",
    "jp morgan": "JPMorgan Chase",
    "jp morgan chase": "JPMorgan Chase",
    "goldman sachs group": "Goldman Sachs",
    "morgan stanley & co": "Morgan Stanley",
    "deloitte consulting": "Deloitte",
    "deloitte llp": "Deloitte",
    "ey": "EY",
    "ernst & young": "EY",
    "kpmg llp": "KPMG",
    "pwc": "PwC",
    "pricewaterhousecoopers": "PwC",
    "mckinsey": "McKinsey & Company",
    "mckinsey and company": "McKinsey & Company",
    "bcg": "Boston Consulting Group",
    "bain & co": "Bain & Company",
    "bain and company": "Bain & Company",
}


def canonicalize_company(raw_company: str | None) -> str:
    """Return the canonical brand string for a scraped company name. Unknown
    strings pass through (stripped). Public so the backfill script and other
    services can reuse the exact same mapping.
    """
    if not raw_company:
        return ""
    cleaned = raw_company.strip()
    return _COMPANY_ALIASES.get(cleaned.lower(), cleaned)

# ---------------------------------------------------------------------------
# Job type normalization
# ---------------------------------------------------------------------------

_TYPE_MAP = {
    "FULLTIME": "FULLTIME",
    "FULL_TIME": "FULLTIME",
    "PERMANENT": "FULLTIME",
    "CONTRACTOR": "FULLTIME",
    "PARTTIME": "PARTTIME",
    "PART_TIME": "PARTTIME",
    "INTERN": "INTERNSHIP",
    "INTERNSHIP": "INTERNSHIP",
}


_INTERNSHIP_KEYWORDS = (
    "intern", "internship", "co-op", "coop",
    "fellowship", "apprentice",
    "summer analyst", "summer associate",
    "winter analyst", "spring analyst",
)


def normalize_type(raw_type: str | None, title: str) -> str:
    title_lower = (title or "").lower()
    if any(kw in title_lower for kw in _INTERNSHIP_KEYWORDS):
        return "INTERNSHIP"
    if any(kw in title_lower for kw in ("part time", "part-time")):
        return "PARTTIME"
    if raw_type:
        mapped = _TYPE_MAP.get(raw_type.upper().strip())
        if mapped:
            return mapped
    return "FULLTIME"


# ---------------------------------------------------------------------------
# Salary helpers
# ---------------------------------------------------------------------------

def extract_salary_from_structured(job: dict) -> dict:
    """Pull salary from JSearch structured fields. Returns {} if both min/max are missing."""
    sal_min = job.get("job_min_salary")
    sal_max = job.get("job_max_salary")
    period = (job.get("job_salary_period") or "").upper().strip()

    if sal_min is None and sal_max is None:
        return {}

    return {
        "salary_min": float(sal_min) if sal_min is not None else None,
        "salary_max": float(sal_max) if sal_max is not None else None,
        "salary_period": period if period in ("HOUR", "YEAR") else None,
        "salary_extracted": False,
    }


_SALARY_KEYWORDS = ("salary", "$", "compensation", "pay range", "per hour", "per year", "annually", "stipend", "hourly")


def extract_salary_from_description(description: str) -> dict:
    """
    Salary extraction from description text.

    OpenAI extraction is disabled for now to keep pipeline runtime under
    2 minutes. Re-enable once a proper rate-limited queue is in place.
    Keyword detection is kept so we know which jobs *could* have salary
    data extracted later.
    """
    if not description or len(description.strip()) < 50:
        return {}

    desc_lower = description.lower()
    if not any(kw in desc_lower for kw in _SALARY_KEYWORDS):
        return {}

    # TODO: Re-enable OpenAI salary extraction with rate-limited queue
    return {}


_ANNUAL_MULTIPLIER = {
    "HOUR": 2080,
    "DAY": 260,
    "WEEK": 52,
    "MONTH": 12,
    "YEAR": 1,
}


def _salary_normalized_annual(sal_min, sal_max, period) -> int | None:
    """Convert to annual integer using period-appropriate multiplier."""
    val = sal_max or sal_min
    if val is None:
        return None
    multiplier = _ANNUAL_MULTIPLIER.get(period, 1)
    return int(val * multiplier)


def _format_salary_display(sal_min, sal_max, period, extracted: bool) -> str | None:
    prefix = "~" if extracted else ""
    if period == "HOUR":
        parts = []
        if sal_min is not None:
            parts.append(f"${int(sal_min)}")
        if sal_max is not None:
            parts.append(f"${int(sal_max)}")
        return f"{prefix}{('–').join(parts)}/hr" if parts else None
    # WEEK, MONTH, YEAR — annualize then display as $Xk/yr
    multiplier = _ANNUAL_MULTIPLIER.get(period, 1)
    parts = []
    if sal_min is not None:
        parts.append(f"${int(sal_min * multiplier / 1000)}k")
    if sal_max is not None:
        parts.append(f"${int(sal_max * multiplier / 1000)}k")
    return f"{prefix}{('–').join(parts)}/yr" if parts else None


# ---------------------------------------------------------------------------
# Skills helper
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


# ---------------------------------------------------------------------------
# Location helper
# ---------------------------------------------------------------------------

def _normalize_location(job: dict) -> tuple[str, bool]:
    remote = bool(job.get("job_is_remote"))
    city = job.get("job_city") or ""
    state = job.get("job_state") or ""
    if remote and not city:
        return "Remote", True
    parts = [p for p in (city, state) if p]
    loc = ", ".join(parts) if parts else "United States"
    return loc, remote


# ---------------------------------------------------------------------------
# Main normalize
# ---------------------------------------------------------------------------

# Advanced fields populated by the Fantastic.jobs fetcher when include_ai and
# include_li are on. Greenhouse/Lever/Ashby/Simplify don't supply these, so
# they pass through as None / empty and the student ranker treats them as
# "unknown" rather than penalizing.
_FJ_PASSTHROUGH_FIELDS = (
    "salary_currency",
    "ai_experience_level",
    "ai_employment_type",
    "ai_employment_types",
    "ai_work_arrangement",
    "ai_work_arrangement_office_days",
    "ai_visa_sponsorship",
    "ai_has_salary",
    "ai_keywords",
    "ai_key_skills",
    "ai_education_requirements",
    "ai_hiring_manager_name",
    "ai_hiring_manager_email",
    "ai_core_responsibilities",
    "ai_requirements_summary",
    "ai_taxonomies_a",
    "ai_taxonomy_primary",
    "ai_job_language",
    "linkedin_id",
    "linkedin_org_slug",
    "linkedin_org_industry",
    "linkedin_org_employees",
    "linkedin_org_size",
    "linkedin_org_specialties",
    "linkedin_org_followers",
    "linkedin_org_headquarters",
    "linkedin_org_recruitment_agency",
    "ats_platform",
    "ats_source_type",
    "ats_source_domain",
    "date_created",
    "date_validthrough",
)


def _normalize_board_job(raw: dict) -> dict | None:
    """Normalize a pre-structured job from Greenhouse/Lever/Ashby/Fantastic.jobs."""
    job_id = raw.get("job_id")
    title = raw.get("title")
    company_raw = raw.get("company")
    company = canonicalize_company(company_raw)

    if not job_id or not title or not company:
        return None

    now = datetime.now(timezone.utc)
    description = (raw.get("description_raw") or "")[:8000]
    job_type = normalize_type(None, title)

    # Posted date
    posted_str = raw.get("posted_at")
    try:
        posted_at = datetime.fromisoformat(posted_str.replace("Z", "+00:00")) if posted_str else now
    except (ValueError, AttributeError):
        posted_at = now

    # Salary — use structured fields if provided, else try AI extraction. For
    # Fantastic.jobs the fetcher already populates these from the ai_salary_*
    # fields when include_ai=true, so the description scan is a no-op.
    sal_min = raw.get("salary_min")
    sal_max = raw.get("salary_max")
    sal_period = raw.get("salary_period")
    sal_extracted = False

    if sal_min is None and sal_max is None and description:
        salary = extract_salary_from_description(description)
        if salary:
            sal_min = salary.get("salary_min")
            sal_max = salary.get("salary_max")
            sal_period = salary.get("salary_period")
            sal_extracted = salary.get("salary_extracted", False)

    has_salary = sal_min is not None or sal_max is not None

    location = raw.get("location") or "United States"
    doc = {
        "job_id": job_id,
        "source": raw.get("source", "unknown"),
        "title": title,
        "company": company,
        "company_raw": company_raw or company,
        "employer_logo": raw.get("employer_logo"),
        "location": location,
        "remote": bool(raw.get("remote")),
        "type": job_type,
        "type_raw": "",
        "category": raw.get("_category", "other"),
        "description_raw": description,
        "apply_url": raw.get("apply_url", ""),
        "salary_min": sal_min,
        "salary_max": sal_max,
        "salary_period": sal_period,
        "salary_display": _format_salary_display(sal_min, sal_max, sal_period, sal_extracted) if has_salary else None,
        "salary_normalized_annual": _salary_normalized_annual(sal_min, sal_max, sal_period) if has_salary else None,
        "salary_extracted": sal_extracted,
        "search_terms": build_search_terms(title, company, location),
        "posted_at": posted_at,
        "fetched_at": now,
        "expires_at": now + timedelta(days=14),
    }
    for field in _FJ_PASSTHROUGH_FIELDS:
        if field in raw:
            doc[field] = raw[field]
    return doc


def _normalize_jsearch_job(raw: dict) -> dict | None:
    """Convert a single raw JSearch result to normalized Firestore doc."""
    job_id = raw.get("job_id")
    title = raw.get("job_title")
    company_raw = raw.get("employer_name")
    company = canonicalize_company(company_raw)

    if not job_id or not title or not company:
        return None

    location, remote = _normalize_location(raw)
    raw_type = raw.get("job_employment_type") or ""
    job_type = normalize_type(raw_type, title)
    category = raw.get("_category", "other")
    description = (raw.get("job_description") or "")[:8000]

    now = datetime.now(timezone.utc)

    # Posted date
    posted_str = raw.get("job_posted_at_datetime_utc")
    try:
        posted_at = datetime.fromisoformat(posted_str.replace("Z", "+00:00")) if posted_str else now
    except (ValueError, AttributeError):
        posted_at = now

    # Salary
    salary = extract_salary_from_structured(raw)
    if not salary and description:
        salary = extract_salary_from_description(description)

    sal_min = salary.get("salary_min")
    sal_max = salary.get("salary_max")
    sal_period = salary.get("salary_period")
    sal_extracted = salary.get("salary_extracted", False)

    return {
        "job_id": job_id,
        "source": "jsearch",
        "title": title,
        "company": company,
        "company_raw": company_raw or company,
        "employer_logo": raw.get("employer_logo"),
        "location": location,
        "remote": remote,
        "type": job_type,
        "type_raw": raw_type,
        "category": category,
        "description_raw": description,
        "apply_url": raw.get("job_apply_link") or raw.get("job_google_link"),
        "salary_min": sal_min,
        "salary_max": sal_max,
        "salary_period": sal_period,
        "salary_display": _format_salary_display(sal_min, sal_max, sal_period, sal_extracted) if salary else None,
        "salary_normalized_annual": _salary_normalized_annual(sal_min, sal_max, sal_period) if salary else None,
        "salary_extracted": sal_extracted,
        "search_terms": build_search_terms(title, company, location),
        "posted_at": posted_at,
        "fetched_at": now,
        "expires_at": now + timedelta(days=14),
    }


def normalize_job(raw: dict) -> dict | None:
    """Normalize a raw job dict from any source. Auto-detects format."""
    if raw.get("source") in ("greenhouse", "lever", "workday", "ashby", "fantasticjobs", "simplify"):
        return _normalize_board_job(raw)
    return _normalize_jsearch_job(raw)


# Countries to exclude — jobs with these in location are filtered out even if remote,
# since "Remote, Singapore" means the job is based internationally.
_EXCLUDED_COUNTRIES = {
    "india", "canada", "united kingdom", "uk", "australia", "germany", "france",
    "netherlands", "singapore", "brazil", "mexico", "china", "japan", "ireland",
    "poland", "spain", "italy", "sweden", "denmark", "finland", "norway",
}


def _is_non_us_non_remote(job: dict) -> bool:
    """Return True if the job is based in a non-US country.

    Excludes jobs like "Remote, Singapore" where the primary location is
    international. Keeps purely "Remote" or US-based locations.
    """
    loc = job.get("location") or ""
    if isinstance(loc, dict):
        loc = loc.get("name") or loc.get("city") or str(loc)
    elif isinstance(loc, list):
        loc = " ".join(str(x) for x in loc)
    location = str(loc).lower()
    for country in _EXCLUDED_COUNTRIES:
        if country in location:
            return True
    return False


def normalize_all(raw_jobs: list[dict]) -> list[dict]:
    """Normalize a batch of raw jobs.

    Stages, in order:
      1. Source-specific normalization (Greenhouse / Lever / Ashby / FJ / etc.)
      2. Drop non-US non-remote
      3. Quality gate (staffing agencies, senior titles, YOE-inconsistent
         interns, scams, stale postings — see pipeline/quality_gate.py)
    """
    from backend.pipeline.quality_gate import apply as apply_quality_gate

    normalized = []
    skipped = 0
    filtered_location = 0
    for raw in raw_jobs:
        doc = normalize_job(raw)
        if not doc:
            skipped += 1
            continue
        if _is_non_us_non_remote(doc):
            filtered_location += 1
            continue
        normalized.append(doc)
    logger.info(
        "Normalized %d jobs, skipped %d invalid, filtered %d non-US non-remote",
        len(normalized), skipped, filtered_location,
    )
    kept, _ = apply_quality_gate(normalized)
    return kept
