# Perplexity + Firecrawl: Unified Implementation Plan

**Date**: May 15, 2026
**Goal**: Transform Offerloop from static data lookups into a real-time research-driven platform — AND deprecate SerpAPI + Jina Reader to simplify the stack and save money.

---

## Deprecation Summary

### What gets replaced

| Old service | Current cost | Used in | Replaced by | When |
|---|---|---|---|---|
| **SerpAPI** (`google-search-results` pip package) | ~$100-200/mo | 6 files, 5 workflows | Perplexity Sonar/Pro | Phases 3, 5, 7 |
| **Jina Reader** (r.jina.ai, s.jina.ai) | ~$0-20/mo | 2 files, 2 workflows | Firecrawl `/scrape` | Phases 1, 7 |

### What stays (no replacement exists)

| Service | Why it stays |
|---|---|
| **People Data Labs** | 2.2B contact database — irreplaceable |
| **Hunter.io** | Email verification/discovery — no alternative |
| **OpenAI** | Custom prompt engineering for email gen (reduced ~30% by Perplexity handling search+summarize) |
| **Anthropic Claude** | Agent planner + fallback LLM |
| **Prerender.io** | SEO bot SSR — different purpose, low cost |

### SerpAPI callsite inventory (all will be replaced)

| File | Lines | Workflow | Replaced in |
|---|---|---|---|
| `serp_client.py` | 12, 248 | Shared SERP wrapper | Phase 7 (dead code removal) |
| `job_board.py` | 78, 453-530, 6294, 6709 | Job board search | Phase 7B |
| `agent_actions.py` | 345, 358 | Agent job discovery | Phase 3 |
| `coffee_chat.py` | 14, 382-428, 515-527 | Coffee chat research | Phase 7A |
| `firm_details_extraction.py` | 15, 56, 74-166, 609-630 | Firm discovery | Phase 7C |
| `scout_service.py` | 20, 1645-1648, 2096-2098 | Scout job search + research | Phase 7D |
| `config.py` | 20 | `SERPAPI_KEY` env var | Phase 8 |

### Jina callsite inventory (all will be replaced)

| File | Lines | Workflow | Replaced in |
|---|---|---|---|
| `scout_service.py` | 22, 30-31, 707-715 | Scout URL parsing | Phase 7D |
| `linkedin_enrichment.py` | 114-189, 206, 234 | LinkedIn profile scraping | Phase 7E |
| `config.py` | 21 | `JINA_API_KEY` env var | Phase 8 |

---

## What I Need From You Before We Start

### 1. API Keys & Accounts (Blocking)

| Service | What to do | Est. cost |
|---------|-----------|-----------|
| **Perplexity API** | Sign up at [perplexity.ai/settings/api](https://docs.perplexity.ai). Get an API key (`pplx-...`). Pay-as-you-go. | ~$120-200/mo at scale |
| **Firecrawl API** | Sign up at [firecrawl.dev](https://www.firecrawl.dev). Get an API key (`fc-...`). Standard plan ($99/mo, 100K credits). | $99/mo |

Add to `.env`:
```
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxx
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxx
```

### 2. Decisions (Non-blocking, but needed by Phase 3)

| Decision | Options | My recommendation |
|----------|---------|-------------------|
| **Credit cost for enriched emails** | Same 1 credit/contact, or more? | Keep at 1 — enrichment makes Elite worth the price |
| **Enrichment scope** | Agent-only first, or all Find results? | Agent-only first, expand later |
| **Firecrawl on free tier?** | Free users get enriched company cards? | No — Pro/Elite value add |
| **Cache location** | Firestore vs Redis | Firestore (no new infra) |
| **When to cancel SerpAPI** | After Phase 7 or keep as emergency fallback? | Keep key alive 2 weeks after Phase 7, then cancel |

---

## The Plan: 8 Phases, 25 Days

```
Phase 1: Foundation             (Days 1-3)   — API clients, cache, env vars
Phase 2: Agent Contact Enrichment (Days 4-6)   — Enriched emails (biggest ROI)
Phase 3: Agent Job Discovery     (Days 7-9)   — Perplexity replaces SerpAPI for agent jobs
Phase 4: Agent Company Discovery (Days 10-12)  — Live market intelligence
Phase 5: Agent Planner Intelligence (Days 13-15) — Market-aware planning
Phase 6: Agent HM + Follow-ups  (Days 16-18)  — Verified HMs, news-hook follow-ups
Phase 7: Workflow Migration      (Days 19-22)  — Migrate ALL SerpAPI/Jina callsites
Phase 8: Cleanup + Polish        (Days 23-25)  — Remove dead code, cancel SerpAPI, ship UI
```

---

## Phase 1: Foundation (Days 1-3)

**Goal**: Create the two API client wrappers and a shared enrichment cache. Nothing calls them yet.

### New files

**File 1: `backend/app/services/perplexity_client.py`**

```python
"""Perplexity Sonar API client — OpenAI-compatible wrapper.

Replaces SerpAPI for: job search, company research, person research, news.
Replaces SerpAPI+OpenAI two-step for: coffee chat research, firm discovery.
"""

from openai import OpenAI
from app.config import PERPLEXITY_API_KEY
import logging, json

logger = logging.getLogger(__name__)

def _get_client():
    if not PERPLEXITY_API_KEY:
        return None
    return OpenAI(api_key=PERPLEXITY_API_KEY, base_url="https://api.perplexity.ai")

def quick_search(query: str, recency: str | None = None) -> dict:
    """Sonar — fast, cheap ($0.01). Replaces single SerpAPI GoogleSearch calls."""

def pro_search(query: str, recency: str | None = None) -> dict:
    """Sonar Pro — richer ($0.03). Replaces SerpAPI + OpenAI extraction combo."""

def deep_research(query: str) -> dict:
    """Sonar Deep Research ($0.10). Replaces 4x SerpAPI calls in coffee_chat.py."""

def search_jobs_live(query, location, limit=10, domain_filter=None) -> list[dict]:
    """Replaces SerpAPI google_jobs engine in agent_actions.py and job_board.py."""

def discover_companies_live(industries, locations, roles, similar_to,
                            university, career_track) -> list[dict]:
    """Replaces SerpAPI + OpenAI in firm_details_extraction.py."""

def batch_enrich_contacts(contacts: list[dict]) -> dict[int, dict]:
    """NEW capability — no SerpAPI equivalent exists."""

def verify_hiring_managers(hms, company, job_title) -> list[dict]:
    """NEW capability — no SerpAPI equivalent exists."""

def get_company_news_brief(company, timeframe="week") -> list[str]:
    """Replaces SerpAPI news search in coffee_chat.py and scout_service.py."""

def get_market_context(target_companies, target_industries) -> dict:
    """NEW capability — pre-planning intelligence for agent planner."""
```

**File 2: `backend/app/services/firecrawl_client.py`**

```python
"""Firecrawl API client — structured web extraction.

Replaces Jina Reader for: URL scraping, LinkedIn extraction.
New capability: structured extraction with Pydantic schemas.
"""

from firecrawl import FirecrawlApp
from app.config import FIRECRAWL_API_KEY
import logging

logger = logging.getLogger(__name__)

def _get_client():
    if not FIRECRAWL_API_KEY:
        return None
    return FirecrawlApp(api_key=FIRECRAWL_API_KEY)

def extract_job_posting(url: str) -> dict:
    """Extract structured job data from Greenhouse, Lever, LinkedIn, Workday URLs."""

def extract_company_profile(url: str) -> dict:
    """Extract company info from about/careers pages."""

def scrape_url(url: str, extract_type: str = "general") -> dict:
    """Generic URL scrape. Replaces Jina Reader (r.jina.ai) in scout_service.py."""

def scrape_linkedin_profile(url: str) -> dict:
    """LinkedIn profile extraction. Replaces Jina in linkedin_enrichment.py."""

def crawl_career_page(careers_url, roles=None) -> list[dict]:
    """NEW capability — crawl company career pages for job listings."""

def batch_scrape(urls: list[str]) -> list[dict]:
    """Bulk URL processing."""
```

**File 3: `backend/app/services/enrichment_cache.py`**

```python
"""Shared Firestore cache for enrichment data.

NOT per-user. 10 students targeting Goldman = 1 Perplexity call.
Cache keys based on entity (person+company, company name, job URL).
"""

CACHE_TTLS = {
    "contact_enrichment": 7 * 86400,    # 7 days
    "company_news": 24 * 3600,          # 24 hours
    "company_profile": 7 * 86400,       # 7 days
    "job_posting": 6 * 3600,            # 6 hours
    "job_search": 4 * 3600,             # 4 hours (replaces SerpAPI job caching)
    "hiring_verification": 3 * 86400,   # 3 days
    "market_context": 12 * 3600,        # 12 hours
    "firm_discovery": 24 * 3600,        # 24 hours (replaces SerpAPI firm cache)
    "research": 24 * 3600,              # 24 hours (replaces SerpAPI research cache)
}

def get_cached(cache_type: str, key_parts: list[str]) -> dict | None: ...
def set_cached(cache_type: str, key_parts: list[str], data: dict) -> None: ...
def _cache_key(cache_type: str, key_parts: list[str]) -> str: ...
```

**File 4: `backend/app/services/extraction_schemas.py`**

```python
"""Pydantic schemas for Firecrawl structured extraction."""
from pydantic import BaseModel
from typing import Optional, List

class JobPostingExtract(BaseModel):
    title: str
    company: str
    location: str
    employment_type: Optional[str] = None
    salary_range: Optional[str] = None
    requirements: List[str] = []
    nice_to_have: List[str] = []
    responsibilities: List[str] = []
    team_or_department: Optional[str] = None
    hiring_manager: Optional[str] = None
    application_deadline: Optional[str] = None
    experience_level: Optional[str] = None

class CompanyProfileExtract(BaseModel):
    name: str
    description: str
    headquarters: Optional[str] = None
    employee_count: Optional[int] = None
    founded: Optional[int] = None
    industries: List[str] = []
    culture_keywords: List[str] = []
    careers_url: Optional[str] = None
    leadership: List[dict] = []
    recent_news: List[str] = []

class PersonProfileExtract(BaseModel):
    name: str
    current_title: Optional[str] = None
    current_company: Optional[str] = None
    summary: Optional[str] = None
    recent_posts: List[str] = []
    interests: List[str] = []
```

### Changes to existing files

| File | Change |
|------|--------|
| `backend/app/config.py` | Add `PERPLEXITY_API_KEY = os.getenv('PERPLEXITY_API_KEY')` and `FIRECRAWL_API_KEY = os.getenv('FIRECRAWL_API_KEY')` |
| `backend/requirements.txt` | Add `firecrawl-py>=1.0` (keep `google-search-results==2.4.2` until Phase 8) |
| `.env` | Add the two new API keys |

### Definition of done
- [ ] Both clients return data from their respective APIs
- [ ] Cache writes and reads work (verify in Firestore console)
- [ ] Graceful degradation: missing API key = return `None`/`{}`

---

## Phase 2: Agent Contact Enrichment (Days 4-6)

**Goal**: Agent-found contacts get enriched before email generation. Biggest ROI change.

**SerpAPI/Jina impact**: None — this is a new capability. No old code changes.

### What changes

**`agent_actions.py`** — `execute_find_and_draft()` (line 76)

Insert between dedup (line 170) and email gen (line 218):

```python
# NEW: Enrich contacts with real-time web data
enrichment_data = {}
try:
    from app.services.perplexity_client import batch_enrich_contacts
    enrichment_data = batch_enrich_contacts(filtered)
    for idx, contact in enumerate(filtered):
        enrich = enrichment_data.get(idx, {})
        contact["enrichment_talking_points"] = enrich.get("talking_points", [])
        contact["enrichment_recent_activity"] = enrich.get("recent_activity", "")
except Exception:
    logger.warning("Contact enrichment failed, continuing without", exc_info=True)
```

**`reply_generation.py`** — `batch_generate_emails()`: Add enrichment to prompt.

**Firestore**: Add `enrichmentTalkingPoints`, `enrichmentRecentActivity`, `enrichedAt` to contact docs.

### Definition of done
- [ ] Agent emails reference real person details
- [ ] Cache prevents redundant calls for same person
- [ ] Emails still generate if Perplexity is down

---

## Phase 3: Agent Job Discovery — First SerpAPI Replacement (Days 7-9)

**Goal**: Replace SerpAPI in `execute_find_jobs()` with Perplexity + Firecrawl.

### SerpAPI removal: `agent_actions.py` lines 345-358

**Before** (current):
```python
from app.routes.job_board import fetch_jobs_from_serpapi  # line 345
jobs, _ = fetch_jobs_from_serpapi(query, location, num_results=10, user_id=uid)  # line 358
```

**After**:
```python
def execute_find_jobs(uid, action, config, user_data):
    company = action.get("company", "")
    role = action.get("role", "")
    location = (config.get("targetLocations") or ["United States"])[0]
    query = f"{role} at {company}" if company else role or "internship"

    # PRIMARY: Perplexity job search (replaces SerpAPI google_jobs)
    try:
        from app.services.perplexity_client import search_jobs_live
        from app.services.firecrawl_client import extract_job_posting

        raw_jobs = search_jobs_live(
            query=query, location=location,
            domain_filter=["linkedin.com", "greenhouse.io", "lever.co", "workday.com"]
        )

        # Enrich top 5 with Firecrawl structured extraction
        enriched_jobs = []
        for job in (raw_jobs or [])[:5]:
            enriched = dict(job)
            if job.get("url"):
                try:
                    structured = extract_job_posting(job["url"])
                    enriched.update(structured)
                except Exception:
                    pass
            enriched_jobs.append(enriched)

        if enriched_jobs:
            # ... save enriched jobs to Firestore ...
            return {"jobsFound": len(saved), "jobs": saved, "creditsSpent": 0}

    except Exception:
        logger.warning("Perplexity job search failed, falling back to SerpAPI")

    # FALLBACK: SerpAPI (kept temporarily until Phase 7B removes it entirely)
    from app.routes.job_board import fetch_jobs_from_serpapi
    jobs, _ = fetch_jobs_from_serpapi(query, location, num_results=10, user_id=uid)
    # ... existing save logic ...
```

### New Firestore fields on `agent_jobs`
- `requirements`, `salaryRange`, `teamOrDepartment`, `hiringManagerName`, `sourceUrl`, `enrichedAt`

### Definition of done
- [ ] Agent jobs have real requirements/salary when Perplexity+Firecrawl succeed
- [ ] Falls back to SerpAPI if both fail
- [ ] `source` field shows `"perplexity"` or `"serpapi"` so we can track migration

---

## Phase 4: Agent Company Discovery (Days 10-12)

**Goal**: Replace static recommendation engine with Perplexity-powered discovery.

**SerpAPI impact**: None directly — `execute_discover_companies()` currently uses `company_recommendations.py`, not SerpAPI. But this sets up Perplexity as the company research engine that will later replace SerpAPI in `firm_details_extraction.py`.

### What changes

**`agent_actions.py`** — `execute_discover_companies()` (line 406):

```python
# PRIMARY: Perplexity discovers companies with live market data
try:
    from app.services.perplexity_client import discover_companies_live
    from app.services.firecrawl_client import extract_company_profile
    companies = discover_companies_live(...)
    for co in companies[:3]:
        if co.get("website"):
            try:
                profile = extract_company_profile(co["website"])
                co.update(profile)
            except Exception:
                pass
except Exception:
    # FALLBACK: existing recommendation engine
    from app.services.company_recommendations import get_recommendations
    companies = get_recommendations(user_data).get("companies", [])
```

### Definition of done
- [ ] Discovered companies include hiring signals and recent news
- [ ] Falls back to recommendation engine on failure

---

## Phase 5: Agent Planner Intelligence (Days 13-15)

**Goal**: Planner gets real-time market context before making decisions.

**SerpAPI impact**: None — planner currently has no web access at all. This is pure addition.

### What changes

**`agent_planner.py`** — `generate_action_plan()` (line 27):

```python
# NEW: Pre-planning market research via Perplexity
market_context = {}
try:
    from app.services.perplexity_client import get_market_context
    market_context = get_market_context(
        target_companies=config.get("targetCompanies", []),
        target_industries=config.get("targetIndustries", []),
    )
except Exception:
    logger.warning("Market context fetch failed, planning without")

prompt = _build_prompt(config, user_data, pipeline_state, market_context)
```

**`_build_prompt()`** gets new section with market intelligence and adaptive rules.

### Definition of done
- [ ] Planner adapts to hiring freezes/surges
- [ ] Market context cached (12h TTL)

---

## Phase 6: Agent HM Verification + Smart Follow-ups (Days 16-18)

**Goal**: Verify HMs are active. Follow-ups use news hooks.

**SerpAPI impact**: None — these are new Perplexity capabilities.

### What changes

**`execute_find_hiring_managers()`**: Add `verify_hiring_managers()` call after PDL, filter inactive HMs.

**`execute_follow_up()`**: Add `get_company_news_brief()` call, pass `news_hook` to nudge generator.

### Definition of done
- [ ] Inactive HMs filtered out
- [ ] Follow-ups reference real news
- [ ] Both degrade gracefully

---

## Phase 7: Full SerpAPI + Jina Migration (Days 19-22)

**Goal**: Replace EVERY remaining SerpAPI and Jina callsite. After this phase, neither service is needed for any feature.

### 7A. Coffee Chat Prep — Replace SerpAPI (Day 19)

**File**: `backend/app/services/coffee_chat.py`
**SerpAPI callsites**: lines 14, 382-428, 515-527

**What to do**:

1. Replace `from serpapi import GoogleSearch` (line 14) — no longer needed
2. Replace `fetch_serp_research()` (lines 382-428): 1 SerpAPI news search → Perplexity `quick_search()`
3. Replace `fetch_comprehensive_research()` (lines 515-527): 4 parallel SerpAPI `GoogleSearch()` calls → 1 Perplexity `deep_research()` call

```python
# BEFORE (coffee_chat.py lines 515-527):
# 4 parallel SerpAPI calls: company_news, company_overview, person_mentions, industry_trends
# Each does: GoogleSearch({"engine": "google", "q": ..., "api_key": SERPAPI_KEY}).get_json()
# Then: OpenAI summarizes each result

# AFTER:
def fetch_comprehensive_research(company, industry, job_title, first_name, last_name, ...):
    try:
        from app.services.perplexity_client import deep_research
        result = deep_research(
            f"Research {first_name} {last_name}, {job_title} at {company}. "
            f"Career trajectory, publications, talks, recent activity. "
            f"Also: {company} recent news, {industry} trends. "
            f"For a college student preparing for a networking coffee chat."
        )
        return parse_deep_research_for_coffee_chat(result)
    except Exception:
        return {}  # No SerpAPI fallback — Perplexity IS the upgrade
```

**Saves**: 4 SerpAPI calls + 4 OpenAI summarization calls per coffee chat → 1 Perplexity call. Both cheaper and better.

### 7B. Job Board — Replace SerpAPI (Day 20)

**File**: `backend/app/routes/job_board.py`
**SerpAPI callsites**: lines 78, 453-530, 6294, 6709

**What to do**:

1. Replace `fetch_jobs_from_serpapi()` (lines 453-530) with a new `fetch_jobs()` function:

```python
# NEW: Primary job search via Perplexity
def fetch_jobs(query, location, num_results=10, user_id=None):
    """Job search — Perplexity primary, SerpAPI fallback during transition."""
    try:
        from app.services.perplexity_client import search_jobs_live
        from app.services.enrichment_cache import get_cached, set_cached

        cache_key = [query, location, str(num_results)]
        cached = get_cached("job_search", cache_key)
        if cached:
            return cached["jobs"], cached.get("next_token")

        jobs = search_jobs_live(query, location, limit=num_results,
                                domain_filter=["linkedin.com", "greenhouse.io",
                                               "lever.co", "workday.com", "indeed.com"])
        set_cached("job_search", cache_key, {"jobs": jobs})
        return jobs, None

    except Exception:
        logger.warning("Perplexity job search failed, falling back to SerpAPI")
        return fetch_jobs_from_serpapi(query, location, num_results, user_id)
```

2. Update callers at lines 376, 6294, 6709 to use `fetch_jobs()` instead of `fetch_jobs_from_serpapi()`
3. Keep `fetch_jobs_from_serpapi()` as a private fallback function during transition

### 7C. Firm Discovery — Replace SerpAPI (Day 21)

**File**: `backend/app/services/firm_details_extraction.py`
**SerpAPI callsites**: lines 15, 56, 74-84, 154-166, 609-630

**What to do**:

1. Replace `_search_serp_firms()` (lines 74-84) with Perplexity:

```python
# BEFORE: SerpAPI search → OpenAI/Claude extraction
# requests.get("https://serpapi.com/search", params={"api_key": SERPAPI_KEY, ...})

# AFTER:
def _search_firms_perplexity(query, location, industry):
    from app.services.perplexity_client import pro_search
    result = pro_search(
        f"List companies in {industry} in {location} matching: {query}. "
        f"For each: name, website, employee count, recent news, why good target."
    )
    return parse_firms_from_perplexity(result)
```

2. Replace `_fetch_firm_details_serp()` (lines 154-166) with Firecrawl website extraction:

```python
# BEFORE: SerpAPI search for "{company} about" → OpenAI extraction from snippets

# AFTER:
def _fetch_firm_details(company_name, website_url):
    from app.services.firecrawl_client import extract_company_profile
    if website_url:
        return extract_company_profile(website_url)
    # If no URL, use Perplexity to research
    from app.services.perplexity_client import pro_search
    return pro_search(f"Company profile: {company_name}. Description, HQ, size, culture.")
```

3. Replace `_search_company_serp()` (lines 609-630) similarly

### 7D. Scout — Replace SerpAPI + Jina (Day 22, morning)

**File**: `backend/app/services/scout_service.py`
**SerpAPI callsites**: lines 20, 1645-1648, 2096-2098
**Jina callsites**: lines 22, 30-31, 707-715

**What to do**:

1. **Replace Jina URL parsing** (lines 707-715) — `_fetch_url_content()`:

```python
# BEFORE (line 707):
# jina_url = f"{JINA_READER_URL}{url}"
# response = await client.get(jina_url, headers=headers, timeout=4.5)
# content = response.text[:15000]  # Raw text, truncated

# AFTER:
async def _fetch_url_content(self, url):
    try:
        from app.services.firecrawl_client import scrape_url
        if "linkedin.com/jobs" in url or "greenhouse.io" in url or "lever.co" in url:
            extract_type = "job_posting"
        elif "linkedin.com/company" in url:
            extract_type = "company"
        else:
            extract_type = "general"
        result = scrape_url(url, extract_type=extract_type)
        return json.dumps(result) if isinstance(result, dict) else str(result)
    except Exception:
        return None  # No Jina fallback needed
```

2. **Replace SerpAPI job search** (lines 1645-1648) — `_search_jobs()`:

```python
# BEFORE:
# search = GoogleSearch({"engine": "google_jobs", "q": query, "api_key": SERPAPI_KEY, ...})

# AFTER:
from app.services.perplexity_client import search_jobs_live
jobs = search_jobs_live(query, location, limit=10)
```

3. **Replace SerpAPI research** (lines 2096-2098) — `_handle_research()`:

```python
# BEFORE:
# search = GoogleSearch({"engine": "google", "q": query, "api_key": SERPAPI_KEY})

# AFTER:
from app.services.perplexity_client import quick_search
result = quick_search(query, recency="month")
```

4. **Remove imports**: Delete `from serpapi import GoogleSearch` (line 20) and `from app.config import SERPAPI_KEY, JINA_API_KEY` (line 22)
5. **Remove constants**: Delete `JINA_READER_URL` (line 30) and `JINA_SEARCH_URL` (line 31)

### 7E. LinkedIn Enrichment — Replace Jina (Day 22, afternoon)

**File**: `backend/app/utils/linkedin_enrichment.py`
**Jina callsites**: lines 114-189, 206, 234

**What to do**:

1. Replace `fetch_linkedin_jina()` (lines 114-133) with Firecrawl:

```python
# BEFORE:
# jina_url = f"https://r.jina.ai/{linkedin_url}"
# response = requests.get(jina_url, headers=headers, timeout=20)

# AFTER:
def fetch_linkedin_firecrawl(linkedin_url: str) -> dict | None:
    from app.services.firecrawl_client import scrape_linkedin_profile
    try:
        return scrape_linkedin_profile(linkedin_url)
    except Exception:
        return None
```

2. Update `_try_jina()` (line 184) → `_try_firecrawl()`:

```python
# BEFORE: def _try_jina(url): result = fetch_linkedin_jina(url)
# AFTER:
def _try_firecrawl(url):
    result = fetch_linkedin_firecrawl(url)
    if result:
        return result, "firecrawl"
    return None, "firecrawl_fail"
```

3. Update strategy lists (lines 206, 234): replace `_try_jina` with `_try_firecrawl`
4. Update source checks (lines 512, 518): `"jina"` → `"firecrawl"`

### Phase 7 Definition of done
- [ ] `grep -r "serpapi\|GoogleSearch\|SERPAPI_KEY" backend/app/` returns ZERO results in non-fallback code
- [ ] `grep -r "jina\|JINA_API_KEY\|JINA_READER\|r\.jina\.ai" backend/app/` returns ZERO results
- [ ] All 5 workflows work with Perplexity/Firecrawl as primary
- [ ] SerpAPI fallbacks exist but are clearly marked as `# DEPRECATED: remove in Phase 8`
- [ ] Run full test suite: `cd backend && pytest tests/`

---

## Phase 8: Cleanup + Polish (Days 23-25)

**Goal**: Remove all dead code, cancel deprecated services, ship frontend.

### 8A. Dead Code Removal (Day 23)

1. **Delete `backend/app/services/serp_client.py`** — entire file (596 lines). No longer imported anywhere.

2. **Remove SerpAPI fallbacks** in:
   - `agent_actions.py` — remove the `except` block that calls `fetch_jobs_from_serpapi`
   - `job_board.py` — remove `fetch_jobs_from_serpapi()` function (lines 453-530)
   - `coffee_chat.py` — remove old `fetch_serp_research()` and `fetch_comprehensive_research()` legacy functions
   - `firm_details_extraction.py` — remove `_search_serp_firms()`, `_fetch_firm_details_serp()`, `_search_company_serp()`

3. **Remove Jina references**:
   - `scout_service.py` — delete `_fetch_url_content_jina()` if kept as fallback
   - `linkedin_enrichment.py` — delete `fetch_linkedin_jina()` and `_try_jina()`

4. **Clean up config**:
   - `config.py` — remove `SERPAPI_KEY` (line 20), remove `JINA_API_KEY` (line 21)
   - `.env` — remove `SERPAPI_KEY`, remove `JINA_API_KEY`
   - Render dashboard — remove `SERPAPI_KEY`, `JINA_API_KEY` env vars

5. **Clean up requirements.txt**:
   - Remove `google-search-results==2.4.2` (line 7 of requirements.txt)
   - No Jina package to remove (it was called via HTTP, not a pip package)

6. **Update imports everywhere**: Run `grep -r "serp_client\|SERPAPI\|JINA" backend/` to catch stragglers.

### 8B. Cancel Services (Day 23)

- [ ] Cancel SerpAPI subscription (or downgrade to free plan as emergency fallback)
- [ ] Remove Jina API key from all environments
- [ ] Verify production still works after env var removal

### 8C. Frontend Polish (Days 24-25)

**Agent Dashboard (`AgentSnapshot.tsx`)**:
- Contact cards: show enrichment talking points
- Job cards: show salary range, requirements, team
- Company cards: show hiring signal badge, recent news
- Follow-up cards: show the news hook being used
- Activity rail: "Enriched 3 contacts", "Verified 2 HMs"

**Agent Jobs List**: salary range, requirements match %, actual job posting URL

### 8D. Final Verification

- [ ] `grep -r "serpapi\|GoogleSearch\|SERPAPI_KEY\|serp_client" backend/` → **zero results**
- [ ] `grep -r "jina\|JINA_API_KEY\|JINA_READER\|r\.jina\.ai\|s\.jina\.ai" backend/` → **zero results**
- [ ] `google-search-results` not in `requirements.txt`
- [ ] All features work end-to-end on production
- [ ] `cd backend && pytest tests/` passes (update any tests that mock SerpAPI/Jina)

---

## Integration Architecture (Final State)

```
BEFORE (7 paid services):                 AFTER (6 paid services):
├── People Data Labs  ──────────────►     ├── People Data Labs (unchanged)
├── Hunter.io         ──────────────►     ├── Hunter.io (unchanged)
├── OpenAI            ──────────────►     ├── OpenAI (30% fewer tokens)
├── Anthropic Claude  ──────────────►     ├── Anthropic Claude (unchanged)
├── SerpAPI           ──── REMOVED        ├── Perplexity (NEW — replaces SerpAPI + adds enrichment)
├── Jina Reader       ──── REMOVED        ├── Firecrawl (NEW — replaces Jina + adds extraction)
└── Prerender.io      ──────────────►     └── Prerender.io (unchanged)
```

### Dependency tree (final)

```
agent_service.py
  └── agent_planner.py
       └── perplexity_client.py  (market context)
  └── agent_actions.py
       ├── perplexity_client.py  (enrich, verify, news, jobs, companies)
       ├── firecrawl_client.py   (extract jobs, extract companies)
       └── enrichment_cache.py   (shared cache)

coffee_chat.py
  └── perplexity_client.py  (deep research — was 4x SerpAPI + OpenAI)

firm_details_extraction.py
  ├── perplexity_client.py  (firm discovery — was SerpAPI + OpenAI)
  └── firecrawl_client.py   (website extraction — was SerpAPI snippets)

scout_service.py
  ├── perplexity_client.py  (job search, research — was SerpAPI)
  └── firecrawl_client.py   (URL scraping — was Jina Reader)

linkedin_enrichment.py
  └── firecrawl_client.py   (LinkedIn scraping — was Jina Reader)

job_board.py
  └── perplexity_client.py  (job search — was SerpAPI)
```

---

## Cost Comparison (Final)

### Monthly cost at current scale (300 users, 20 Elite agents)

| Service | Before | After | Change |
|---|---|---|---|
| SerpAPI | ~$150/mo | $0 (cancelled) | **-$150** |
| Jina Reader | ~$10/mo | $0 (removed) | **-$10** |
| OpenAI | ~$225/mo | ~$150/mo (30% fewer tokens) | **-$75** |
| Perplexity (new) | $0 | ~$160/mo | +$160 |
| Firecrawl (new) | $0 | ~$99/mo | +$99 |
| PDL | ~$150/mo | ~$150/mo | $0 |
| Hunter.io | ~$75/mo | ~$75/mo | $0 |
| Anthropic | ~$40/mo | ~$40/mo | $0 |
| Prerender | ~$10/mo | ~$10/mo | $0 |
| **Total** | **~$660/mo** | **~$684/mo** | **+$24/mo** |

**Net impact: +$24/mo for a dramatically better product.** Essentially cost-neutral.

The real win is quality: enriched emails, structured job data, market-aware planning, verified HMs, news-hook follow-ups, deep research coffee chat preps — all for the same budget.

### Where OpenAI savings come from

| Workflow | Before (SerpAPI → OpenAI) | After (Perplexity alone) |
|---|---|---|
| Coffee chat research | 4 SerpAPI + 4 OpenAI summarize calls | 1 Perplexity deep_research |
| Firm discovery | 2-3 SerpAPI + OpenAI extraction | 1 Perplexity pro_search |
| Scout research | 1 SerpAPI + OpenAI summarize | 1 Perplexity quick_search |
| Company extraction | SerpAPI snippets + OpenAI/Claude parse | 1 Perplexity + Firecrawl structured |

Perplexity does search AND summarization in one call. You were paying for search (SerpAPI) + LLM (OpenAI) separately.

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Perplexity API outage | Phase 7 keeps SerpAPI fallbacks; Phase 8 removes them only after 2 weeks of stable Perplexity |
| Firecrawl rate limited | Batch operations respect rate limit headers; career page crawls run off-peak |
| Costs spike | Per-cycle budget caps; shared cache; monitor daily spend |
| LinkedIn blocks Firecrawl | LinkedIn scraping is optional enrichment; BrightData fallback exists in `linkedin_enrichment.py` |
| Tests break from SerpAPI removal | Update test mocks in Phase 8 — mock `perplexity_client` and `firecrawl_client` instead |

---

## Suggested Starting Point

Get the two API keys (`PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`), and I'll build Phase 1. The whole thing is designed so each phase ships independently — you can stop after any phase and still have a working, improved product.
