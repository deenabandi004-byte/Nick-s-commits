"""
Fetch job listings from Greenhouse, Lever, Ashby, and Fantastic.jobs APIs.
Outputs a list of pre-normalized job dicts ready for the normalizer/writer.
"""
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

# ---------------------------------------------------------------------------
# Company configs
# ---------------------------------------------------------------------------

GREENHOUSE_SLUGS = [
    # Big tech / consumer
    "stripe", "figma", "airbnb", "doordashusa", "lyft", "coinbase", "robinhood",
    "pinterest", "reddit", "dropbox", "twilio", "brex",
    "airtable", "carta", "chime", "scaleai", "verkada",
    "discord", "duolingo", "gitlab", "grammarly", "intercom", "webflow",
    "gusto", "lattice", "mercury", "faire",
    "squarespace", "hubspot", "boxinc", "cloudflare",
    "mongodb", "databricks", "spacex", "instacart",
    # FAANG / big tech
    "metacareers", "google", "microsoft", "amazon", "apple", "nvidia",
    # AI
    "anthropic",
    # Infrastructure / security / observability
    "greenhouse", "datadog", "elastic", "okta", "zscaler",
    "newrelic", "sumologic", "samsara", "toast",
    # Consulting / Big 4
    "deloitte", "pwc", "kpmg", "ey",
    # Finance / quant
    "goldmansachs", "jpmorgan", "blackrock", "citadel", "twosigma",
    "janestreet", "hudsonrivertrading", "drw", "akunacapital",
    "imctrading", "optiver", "sig", "flowtraders",
    # Fintech
    "gemini", "adyen", "marqeta", "affirm",
    # Data / analytics
    "fivetran", "hightouch", "mixpanel", "cultureamp",
    # HR / remote / fintech
    "remote", "rippling", "justworks", "oysterhr", "papayaglobal",
    "bamboohr", "personio", "hibob", "leapsome", "15five", "betterworks",
    # Biotech
    "benchling", "ginkgobioworks", "recursionpharma", "insitro",
    "10xgenomics", "virbio",
    # Defense tech
    "shieldai",
    # Aviation / space
    "jobyaviation", "archeraircraft", "boomsupersonic", "hermeus",
    "zeroavia", "lilium", "wisk",
    # Semiconductors
    "amd", "qualcomm", "texasinstruments", "appliedmaterials",
    "lamresearch", "kla", "asml", "micron",
    # Developer tools / infra
    "palantirtech", "cockroachlabs", "netlify", "fastly",
    # Databases
    "yugabyte", "timescale", "influxdata", "datastax", "couchbase", "scylladb",
    # Entertainment / media
    "hulu", "a24", "soundcloud",
]

LEVER_SLUGS = [
    # Mobility / health / AI
    "uber", "netflix", "spotify", "anduril",
    "rivian", "waymo", "aurora", "recursion", "asana", "calm", "hims",
    "ro", "oscar-health", "devoted-health", "cityblock", "quartet",
    "scale-ai", "nuro",
    # Design / productivity / dev tools
    "figma", "canva", "shopify", "twitch", "reddit", "duolingo",
    "notion", "airtable", "webflow", "zapier",
    "hubspot", "intercom", "zendesk", "freshworks", "atlassian",
    "monday", "clickup", "linear", "loom", "miro",
    "framer", "pitch", "superhuman", "fastmail", "hey",
    "basecamp", "doist", "buffer",
    # Publishing / newsletters
    "ghost", "substack", "beehiiv", "convertkit", "mailchimp",
    # Email infrastructure
    "sendgrid", "postmark", "resend", "loops", "customerio",
    "braze", "iterable", "klaviyo",
    # Data / CDP
    "segment", "rudderstack", "mparticle",
    # Analytics / product
    "amplitude", "mixpanel", "posthog", "heap", "fullstory", "hotjar",
    "contentsquare", "quantum-metric", "glassbox",
    # Feedback / surveys
    "medallia", "qualtrics", "surveymonkey", "typeform", "tally", "jotform",
]

ASHBY_SLUGS = [
    # Core (verified with jobs)
    "linear", "notion", "ramp", "deel",
    "runway", "replit", "supabase", "ashby", "clerk", "resend", "raycast",
    # AI / ML
    "openai", "cohere", "perplexity", "cursor", "anysphere",
    "mistralai", "togetherai", "modal", "replicate", "huggingface",
    "wandb", "langchain", "pinecone", "weaviate", "trychroma", "qdrant",
    # Infrastructure / data
    "neon", "railway", "airbyte", "posthog", "inngest", "plain", "helpscout",
    "fly", "render", "netlify",
    # Productivity / dev tools
    "zapier", "doist", "buffer", "front", "intercom", "liveblocks",
    # Publishing / email
    "ghost", "beehiiv", "loops",
    # Serverless / triggers
    "calcom", "trigger",
    # CMS
    "sanity", "contentful", "storyblok", "prismic", "hygraph",
    "payload", "strapi", "directus",
    # Backend-as-a-service / databases
    "appwrite", "pocketbase", "nhost", "hasura", "fauna", "convex",
    "xata", "turso", "planetscale",
    "cockroachdb", "yugabyte", "timescale", "questdb", "scylladb", "datastax",
]

# ---------------------------------------------------------------------------
# HTML stripping helper
# ---------------------------------------------------------------------------

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = _TAG_RE.sub(" ", html)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------------------
# Greenhouse fetcher
# ---------------------------------------------------------------------------

def _fetch_greenhouse(slug: str) -> list[dict]:
    url = f"https://boards.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Greenhouse [%s] failed: %s", slug, exc)
        return []

    jobs = []
    for job in data.get("jobs", []):
        title = job.get("title", "")
        location_name = ""
        if job.get("location"):
            location_name = job["location"].get("name", "")

        content = _strip_html(job.get("content", ""))[:8000]

        jobs.append({
            "job_id": f"greenhouse_{slug}_{job['id']}",
            "source": "greenhouse",
            "title": title,
            "company": slug.replace("-", " ").title(),
            "employer_logo": None,
            "location": location_name or "United States",
            "remote": "remote" in location_name.lower(),
            "description_raw": content,
            "apply_url": job.get("absolute_url", ""),
            "posted_at": job.get("updated_at"),
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
        })

    logger.info("  Greenhouse [%s] → %d jobs", slug, len(jobs))
    return jobs


def _fetch_all_greenhouse() -> list[dict]:
    results = []
    companies_with_jobs = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_greenhouse, slug): slug for slug in GREENHOUSE_SLUGS}
        for future in as_completed(futures):
            jobs = future.result()
            if jobs:
                companies_with_jobs += 1
            results.extend(jobs)
    logger.info("Greenhouse: %d jobs from %d companies", len(results), companies_with_jobs)
    return results


# ---------------------------------------------------------------------------
# Lever fetcher
# ---------------------------------------------------------------------------

def _fetch_lever(slug: str) -> list[dict]:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Lever [%s] failed: %s", slug, exc)
        return []

    if not isinstance(data, list):
        logger.warning("Lever [%s] unexpected response type: %s", slug, type(data).__name__)
        return []

    jobs = []
    for posting in data:
        title = posting.get("text", "")
        categories = posting.get("categories", {}) or {}
        location = categories.get("location", "") or ""
        workplace = (posting.get("workplaceType") or "").lower()

        created_ms = posting.get("createdAt")
        posted_at = None
        if created_ms:
            try:
                posted_at = datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc).isoformat()
            except (ValueError, OSError, TypeError):
                pass

        description = (posting.get("descriptionPlain") or "")[:8000]

        jobs.append({
            "job_id": f"lever_{slug}_{posting['id']}",
            "source": "lever",
            "title": title,
            "company": slug.replace("-", " ").title(),
            "employer_logo": None,
            "location": location or "United States",
            "remote": workplace == "remote",
            "description_raw": description,
            "apply_url": posting.get("hostedUrl", ""),
            "posted_at": posted_at,
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
        })

    logger.info("  Lever [%s] → %d jobs", slug, len(jobs))
    return jobs


def _fetch_all_lever() -> list[dict]:
    results = []
    companies_with_jobs = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_lever, slug): slug for slug in LEVER_SLUGS}
        for future in as_completed(futures):
            jobs = future.result()
            if jobs:
                companies_with_jobs += 1
            results.extend(jobs)
    logger.info("Lever: %d jobs from %d companies", len(results), companies_with_jobs)
    return results


# ---------------------------------------------------------------------------
# Ashby fetcher
# ---------------------------------------------------------------------------

_ASHBY_TYPE_MAP = {
    "FullTime": "FULLTIME",
    "PartTime": "PARTTIME",
    "Intern": "INTERNSHIP",
}


def _fetch_ashby(slug: str) -> list[dict]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Ashby [%s] failed: %s", slug, exc)
        return []

    jobs = []
    for job in data.get("jobs", []):
        title = job.get("title", "")
        location = job.get("locationName") or "Remote"
        description = _strip_html(job.get("descriptionHtml") or "")[:8000]
        employment_type = job.get("employmentType") or ""

        jobs.append({
            "job_id": f"ashby_{slug}_{job['id']}",
            "source": "ashby",
            "title": title,
            "company": slug.replace("-", " ").title(),
            "employer_logo": None,
            "location": location,
            "remote": bool(job.get("isRemote")),
            "description_raw": description,
            "apply_url": job.get("jobUrl", ""),
            "posted_at": job.get("publishedAt"),
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
            "_employment_type": _ASHBY_TYPE_MAP.get(employment_type, ""),
        })

    logger.info("  Ashby [%s] → %d jobs", slug, len(jobs))
    return jobs


def _fetch_all_ashby() -> list[dict]:
    results = []
    companies_with_jobs = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_ashby, slug): slug for slug in ASHBY_SLUGS}
        for future in as_completed(futures):
            jobs = future.result()
            if jobs:
                companies_with_jobs += 1
            results.extend(jobs)
    logger.info("Ashby: %d jobs from %d companies", len(results), companies_with_jobs)
    return results


# ---------------------------------------------------------------------------
# Fantastic.jobs (RapidAPI active-jobs-db) fetcher - category-based strategy
# ---------------------------------------------------------------------------

FANTASTICJOBS_BASE_URL = "https://active-jobs-db.p.rapidapi.com/active-ats-24h"
FANTASTICJOBS_HOST = "active-jobs-db.p.rapidapi.com"

# Each call: (label, extra_params). All share agency=false, limit=100.
FANTASTICJOBS_CALLS = [
    ("tech_roles_us", {
        "title_filter": "software engineer OR data scientist OR product manager OR data analyst OR machine learning",
        "location_filter": "United States",
    }),
    ("finance_roles_us", {
        "title_filter": "financial analyst OR investment analyst OR banking OR finance OR accounting",
        "location_filter": "United States",
    }),
    ("consulting_roles_us", {
        "title_filter": "consultant OR strategy OR business analyst OR management consulting",
        "location_filter": "United States",
    }),
    ("big_tech_companies", {
        "organization_filter": "Google,Meta,Apple,Amazon,Microsoft,Netflix,Salesforce,Adobe,Oracle,Nvidia,LinkedIn,Uber,Airbnb",
        "location_filter": "United States",
    }),
    ("finance_companies", {
        "organization_filter": "Goldman Sachs,JPMorgan Chase & Co.,Morgan Stanley,Bank of America,Wells Fargo,BlackRock,Vanguard,Fidelity Investments,Capital One,American Express",
        "location_filter": "United States",
    }),
    ("consulting_companies", {
        "organization_filter": "McKinsey,Boston Consulting Group,Bain,Accenture,PwC,EY,KPMG,Deloitte",
        "location_filter": "United States",
    }),
    ("internships_us", {
        "ai_employment_type_filter": "INTERN",
        "ai_taxonomies_a_filter": "Technology,Finance & Accounting,Consulting,Data & Analytics,Software,Marketing",
        "location_filter": "United States",
    }),
    ("entry_level_us", {
        "ai_experience_level_filter": "0-2",
        "ai_taxonomies_a_filter": "Technology,Finance & Accounting,Consulting,Data & Analytics,Software",
        "location_filter": "United States",
    }),
    ("marketing_design_ops", {
        "title_filter": "marketing OR designer OR UX OR growth OR operations analyst OR product designer",
        "location_filter": "United States",
    }),
    ("remote_jobs", {
        "title_filter": "software engineer OR data analyst OR product manager OR financial analyst OR consultant",
        "remote": "true",
    }),
]


def _fantasticjobs_headers() -> dict:
    return {
        "x-rapidapi-key": os.getenv("RAPIDAPI_KEY"),
        "x-rapidapi-host": FANTASTICJOBS_HOST,
    }


def _extract_fj_location(job: dict) -> str:
    """Extract location from Fantastic.jobs job data."""
    locations = job.get("locations_derived") or []
    if locations and isinstance(locations[0], dict):
        parts = []
        city = locations[0].get("city")
        state = locations[0].get("state")
        if city:
            parts.append(city)
        if state:
            parts.append(state)
        if parts:
            return ", ".join(parts)
    raw_locs = job.get("locations_raw") or []
    if raw_locs and isinstance(raw_locs[0], dict):
        addr = raw_locs[0].get("address")
        if addr:
            return addr
    return ""


def _normalize_fj_job(job: dict) -> dict:
    """Convert a single Fantastic.jobs API result to our pre-normalized format."""
    return {
        "job_id": f"fantasticjobs_{job['id']}",
        "source": "fantasticjobs",
        "title": job.get("title", ""),
        "company": job.get("organization", ""),
        "employer_logo": job.get("organization_logo"),
        "location": _extract_fj_location(job) or "United States",
        "remote": bool(job.get("remote_derived", False)),
        "description_raw": (job.get("description") or "")[:8000],
        "apply_url": job.get("url", ""),
        "posted_at": job.get("date_posted"),
        "salary_min": None,
        "salary_max": None,
        "salary_period": None,
    }


def _fj_fetch_page(params: dict, label: str) -> list[dict]:
    """Fetch a single page from Fantastic.jobs with 429 retry. Returns raw job dicts."""
    headers = _fantasticjobs_headers()
    try:
        resp = requests.get(
            FANTASTICJOBS_BASE_URL,
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 429:
            logger.warning("Fantastic.jobs [%s] rate limited, waiting 60s...", label)
            time.sleep(60)
            resp = requests.get(
                FANTASTICJOBS_BASE_URL,
                headers=headers,
                params=params,
                timeout=REQUEST_TIMEOUT,
            )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Fantastic.jobs [%s] failed: %s", label, exc)
        return []
    jobs_data = data if isinstance(data, list) else data.get("data", [])
    return [j for j in jobs_data if j.get("id") and j.get("title")]


def fetch_fantasticjobs() -> list[dict]:
    """Fetch jobs from Fantastic.jobs using 10 targeted category calls.

    Uses the 24h endpoint with broad filters instead of company-by-company
    fetching. Runs sequentially with 1.5s sleep between requests.
    """
    if not os.getenv("RAPIDAPI_KEY"):
        logger.info("Fantastic.jobs: skipped (no API key)")
        return []

    # Let Greenhouse/Lever/Ashby finish their burst first
    time.sleep(3)

    results = []
    calls_with_results = 0

    for i, (label, extra_params) in enumerate(FANTASTICJOBS_CALLS):
        if i > 0:
            time.sleep(1.5)

        params = {"limit": "100", "agency": "false", **extra_params}
        raw = _fj_fetch_page(params, label)
        jobs = [_normalize_fj_job(j) for j in raw]

        if jobs:
            calls_with_results += 1
        results.extend(jobs)
        logger.info("  Fantastic.jobs [%s] → %d jobs", label, len(jobs))

    # Deduplicate by job_id (categories overlap)
    seen = set()
    deduped = []
    for job in results:
        if job["job_id"] not in seen:
            seen.add(job["job_id"])
            deduped.append(job)

    logger.info(
        "Fantastic.jobs: %d unique jobs from %d category calls (%d raw before dedup)",
        len(deduped), calls_with_results, len(results),
    )
    return deduped


# ---------------------------------------------------------------------------
# Simplify (GitHub-hosted internship listings)
# ---------------------------------------------------------------------------

SIMPLIFY_LISTINGS_URL = (
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2025-Internships"
    "/dev/.github/scripts/listings.json"
)


_SIMPLIFY_SEARCH_FILTERS = [
    "software",
    "finance",
    "data",
    "marketing",
    "consulting",
    "product manager",
    "research",
]


def _simplify_item_to_job(item: dict) -> dict | None:
    """Convert a single Simplify listing to our pre-normalized format."""
    if not item.get("active") or not item.get("is_visible"):
        return None

    title = (item.get("title") or "").strip()
    company = (item.get("company_name") or "").strip()
    if not title or not company:
        return None

    locations = item.get("locations") or []
    location_str = ", ".join(locations) if locations else ""

    return {
        "job_id": f"simplify_{item['id']}",
        "source": "simplify",
        "title": title,
        "company": company,
        "employer_logo": None,
        "location": location_str,
        "remote": "remote" in location_str.lower(),
        "description_raw": "",
        "apply_url": item.get("url") or "",
        "posted_at": item.get("date_posted"),
        "job_employment_type": "INTERNSHIP",
        "_category": _simplify_category(item.get("category", "")),
        "_terms": item.get("terms", []),
        "_sponsorship": item.get("sponsorship", ""),
    }


def fetch_simplify() -> list[dict]:
    """Fetch active internship listings from the Simplify GitHub repo.

    Downloads the full JSON once, then applies keyword filters to surface
    targeted subsets (software, finance, data, etc.). Deduplicates by job_id.
    """
    try:
        resp = requests.get(SIMPLIFY_LISTINGS_URL, timeout=30)
        resp.raise_for_status()
        raw = resp.json()
    except Exception as e:
        logger.warning("Simplify: fetch failed: %s", e)
        return []

    # Convert all active/visible items
    all_valid: list[dict] = []
    for item in raw:
        job = _simplify_item_to_job(item)
        if job:
            all_valid.append(job)

    # Phase 1: Take up to 2,000 from the full list (equivalent to 20 pages × 100)
    main_batch = all_valid[:2000]
    logger.info("  Simplify [main] → %d jobs (of %d active)", len(main_batch), len(all_valid))

    seen: set[str] = {j["job_id"] for j in main_batch}
    results = list(main_batch)
    total_pages = len(main_batch) // 100 + (1 if len(main_batch) % 100 else 0)

    # Phase 2: Keyword-filtered passes to surface relevant jobs beyond the top 2,000
    for search_term in _SIMPLIFY_SEARCH_FILTERS:
        matched = []
        for job in all_valid:
            if job["job_id"] in seen:
                continue
            title_lower = job["title"].lower()
            company_lower = job["company"].lower()
            cat_lower = job.get("_category", "").lower()
            if search_term in title_lower or search_term in company_lower or search_term in cat_lower:
                matched.append(job)
                if len(matched) >= 300:  # 3 pages × 100
                    break

        for job in matched:
            seen.add(job["job_id"])
        results.extend(matched)
        pages = len(matched) // 100 + (1 if len(matched) % 100 else 0)
        total_pages += pages
        logger.info("  Simplify [search=%s] → %d jobs (%d pages)", search_term, len(matched), pages)
        time.sleep(1)

    logger.info("Simplify: %d internship jobs fetched (%d pages)", len(results), total_pages)
    return results


def _simplify_category(raw_cat: str) -> str:
    """Map Simplify category strings to our internal categories."""
    cat = raw_cat.lower()
    if "software" in cat:
        return "engineering"
    if "data" in cat:
        return "data"
    if "design" in cat:
        return "design"
    if "product" in cat or "pm" in cat:
        return "product"
    if "marketing" in cat:
        return "marketing"
    if "finance" in cat or "accounting" in cat:
        return "finance"
    if "hardware" in cat or "electrical" in cat or "mechanical" in cat:
        return "engineering"
    if "research" in cat or "science" in cat:
        return "research"
    if "sales" in cat or "business" in cat:
        return "business"
    return "other"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def fetch_jobs(skip_fantastic: bool = False) -> list[dict]:
    """Fetch jobs from all sources concurrently.
    Returns a list of pre-normalized job dicts."""
    with ThreadPoolExecutor(max_workers=5) as pool:
        gh_future = pool.submit(_fetch_all_greenhouse)
        lv_future = pool.submit(_fetch_all_lever)
        ab_future = pool.submit(_fetch_all_ashby)
        fj_future = None if skip_fantastic else pool.submit(fetch_fantasticjobs)
        si_future = pool.submit(fetch_simplify)

        greenhouse_jobs = gh_future.result()
        lever_jobs = lv_future.result()
        ashby_jobs = ab_future.result()
        fantasticjobs = [] if fj_future is None else fj_future.result()
        simplify_jobs = si_future.result()

    if skip_fantastic:
        logger.info("Skipped Fantastic.jobs (--skip-fantastic)")
    all_jobs = greenhouse_jobs + lever_jobs + ashby_jobs + fantasticjobs + simplify_jobs
    logger.info("Total: %d jobs fetched", len(all_jobs))
    return all_jobs
