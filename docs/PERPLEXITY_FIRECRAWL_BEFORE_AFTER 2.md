# Perplexity + Firecrawl: Before vs After Report

**Date**: 2026-05-16
**Status**: Phases 1-7 shipped (May 15). Phase 8 (legacy cleanup) deferred 2 weeks.

---

## Executive Summary

We replaced two legacy services (SerpAPI + Jina Reader) with two purpose-built alternatives (Perplexity Sonar + Firecrawl). The result is **fresher data, richer output, fewer API calls, shared caching across users, and new capabilities that didn't exist before** (contact enrichment, hiring manager verification, career page crawling).

---

## What Perplexity Does vs What Firecrawl Does

| | Perplexity (Sonar API) | Firecrawl |
|---|---|---|
| **Role** | Real-time web search + synthesis | Structured data extraction from known URLs |
| **Analogy** | "Google search that reads the pages for you and summarizes" | "A scraper that returns JSON instead of raw HTML" |
| **Input** | Natural language query | A specific URL |
| **Output** | Synthesized answer + source citations | Structured JSON matching a Pydantic schema |
| **Best for** | Discovery, news, verification, person research | Job posting parsing, company profile extraction, LinkedIn scraping |
| **Models used** | `sonar` (fast), `sonar-pro` (richer), `sonar-deep-research` (comprehensive) | Single extraction engine with schema-guided output |

**They complement each other**: Perplexity finds and synthesizes; Firecrawl extracts structure from what's found.

---

## Before vs After: Feature-by-Feature

### 1. Job Board (`job_board.py`)

| | Before (SerpAPI) | After (Perplexity) |
|---|---|---|
| **How it worked** | Called SerpAPI's `google_jobs` engine -> returned raw Google Jobs index | Perplexity `sonar` with `search_recency_filter="month"` searches live web |
| **Freshness** | Stale (Google's crawl lag, sometimes days behind) | Real-time web search, always current |
| **Data richness** | Title, company, location, apply link. No summary. | Title, company, location, URL, **AI-generated summary** of the role |
| **Domain control** | None (whatever Google indexed) | Filtered to LinkedIn, Greenhouse, Lever, Workday, Indeed |
| **Cost** | $50/5000 searches (SerpAPI) | Lower per-query (Perplexity sonar is ~$5/1000 searches) |
| **Pagination** | Opaque `next_page_token`, stale on subsequent pages | Single cached response, simpler model |
| **Failure mode** | Hard fail if SerpAPI quota hit | Graceful fallback to SerpAPI (still wired as backup) |

**New capability**: `discover_companies_live()` — finds companies actively hiring in the student's target industry/location, with reasons and hiring signals. This didn't exist before.

---

### 2. Firm Search / Company Research (`firm_details_extraction.py`)

| | Before (SerpAPI + Jina) | After (Perplexity + Firecrawl) |
|---|---|---|
| **Pipeline** | 3-step: SerpAPI search -> get URLs -> Jina scrape each URL -> OpenAI extract | 1-step: Perplexity `pro_search` returns synthesized content + citations |
| **API calls** | 1 SerpAPI + 2-3 Jina + 1 OpenAI = 4-5 calls per firm | 1 Perplexity call (or 1 Firecrawl if we have a URL) |
| **Latency** | ~8-12 seconds (serial pipeline) | ~3-5 seconds (single call) |
| **Quality** | Often scraped irrelevant pages; Jina struggled with JS-rendered sites | Perplexity reads multiple sources and synthesizes; always returns coherent text |
| **LinkedIn discovery** | Unreliable (SerpAPI sometimes didn't surface LinkedIn URLs) | Perplexity citations often include LinkedIn; fallback to SerpAPI |
| **Company profile** | Unstructured text blob | Firecrawl `extract_company_profile()` returns structured JSON: name, description, HQ, employee count, founded year, industries, culture keywords, careers URL, leadership, recent news |

**New capability**: `crawl_career_page()` via Firecrawl — crawls a company's careers page and returns structured job listings. Previously impossible without building a custom scraper per ATS.

---

### 3. Contact Enrichment / Find People (`runs.py`, `agent_actions.py`)

| | Before | After (Perplexity) |
|---|---|---|
| **What existed** | PDL data only — static profile (title, company, education, email) | PDL data + **live web research** per contact |
| **Talking points** | None | 3-5 bullet points per contact (e.g., "Recently promoted to VP", "Spoke at Wharton Finance Conference") |
| **Recent activity** | None | 1-sentence summary (e.g., "Led JPMorgan's Q1 analyst class") |
| **Role verification** | Trusted PDL (often 6-12 months stale) | Perplexity verifies if person is still at company |
| **Shared cache** | N/A | `enrichment_cache` — 10 students looking up the same Goldman VP = 1 API call, cached 7 days |

This is the data now displayed in the Contact Directory enrichment accordion (chevron expand UI).

---

### 4. Coffee Chat Prep (`coffee_chat.py`)

| | Before (4x SerpAPI + Jina + OpenAI) | After (Perplexity deep_research) |
|---|---|---|
| **Pipeline** | SerpAPI person search + SerpAPI company search + SerpAPI industry search + SerpAPI news search -> Jina scrape top results -> OpenAI synthesize | 1 Perplexity `sonar-deep-research` call with comprehensive prompt |
| **API calls** | 4 SerpAPI + 3-4 Jina + 1 OpenAI = 8-9 calls | 1 Perplexity call |
| **Latency** | 15-25 seconds (all serial, background thread) | 5-10 seconds |
| **Company context** | `quick_search` now provides focused company intel for the prep doc | Previously needed separate SerpAPI + Jina pipeline |
| **Quality** | Depended on which pages Jina could scrape (many blocked) | Deep research synthesizes across many sources, includes citations |

---

### 5. Hiring Manager Verification (`perplexity_client.verify_hiring_managers`)

| | Before | After (Perplexity) |
|---|---|---|
| **What existed** | No verification — returned PDL results as-is | Perplexity verifies each hiring manager is still active |
| **Stale HMs** | Students would email people who left 6 months ago | Catches role changes, provides confidence level |
| **Recent activity** | None | Detects recent LinkedIn posts about open positions |
| **Cache** | N/A | 3-day cache per person+company |

**Entirely new capability**. Didn't exist before the integration.

---

### 6. Scout AI (`scout_service.py`, `scout_assistant_service.py`)

| | Before (SerpAPI + Jina) | After (Perplexity + Firecrawl) |
|---|---|---|
| **Web search** | SerpAPI -> get links -> Jina scrape each link | Perplexity `quick_search` or `pro_search` — search + read in one call |
| **URL reading** | Jina Reader (struggled with JS sites, LinkedIn, paywalled content) | Firecrawl `scrape_url()` with anti-bot stealth, handles JS-rendered pages |
| **Market context** | None | `get_market_context()` — pre-planning intel on hiring freezes, recruiting timelines |
| **Company news** | Manual SerpAPI news search | `get_company_news_brief()` — real-time news with recency filter |

---

### 7. Email Generation (`reply_generation.py`)

| | Before | After |
|---|---|---|
| **Personalization source** | Static PDL profile data only | Perplexity enrichment talking points feed directly into email prompts |
| **"Why them" hook** | Generic (same title + company mention) | Specific (references their recent conference talk, paper, promotion) |
| **Company context** | None | `get_company_news_brief()` can inform timely hooks ("Congrats on the Series B!") |

---

## Architecture: Shared Enrichment Cache

A key architectural improvement is the **shared, cross-user cache** (`enrichment_cache.py`):

```
Firestore collection: enrichment_cache/{sha256_hash}

Cache entry:
  cache_type: "contact_enrichment" | "company_news" | "job_search" | ...
  cached_at: unix timestamp
  payload: dict | list (the actual data)
```

**TTLs by type:**
| Cache type | TTL | Rationale |
|---|---|---|
| `contact_enrichment` | 7 days | Person data changes slowly |
| `company_profile` | 7 days | Company info changes slowly |
| `hiring_verification` | 3 days | Role changes need moderate freshness |
| `company_news` | 24 hours | News is time-sensitive |
| `market_context` | 12 hours | Hiring intel changes frequently |
| `job_posting` | 6 hours | Job postings appear/disappear |
| `job_search` | 4 hours | Search results change frequently |
| `firm_discovery` | 24 hours | Company discovery is stable |
| `research` | 24 hours | General research |

**Cost savings**: With 300+ active users, many target the same companies and contacts. 10 students researching "Goldman Sachs VP in Equity Research" = 1 Perplexity call + 9 cache hits.

---

## Cost Comparison

| Service | Before (monthly est.) | After (monthly est.) |
|---|---|---|
| SerpAPI | ~$100-150 (5000-7500 searches @ $50/5k) | $0 (fallback only, rarely fires) |
| Jina Reader | ~$30 (free tier + overages) | $0 (replaced entirely) |
| OpenAI (for extraction) | ~$20 (GPT-4 calls for extracting data from scraped text) | ~$5 (less needed; Perplexity returns synthesized) |
| Perplexity | $0 | ~$50-80 (sonar + sonar-pro calls) |
| Firecrawl | $0 | ~$20-30 (scrape calls for URLs) |
| **Total** | **~$150-200/mo** | **~$75-115/mo** |

Net savings: ~$50-100/month with significantly better output quality.

---

## New Capabilities (didn't exist before)

1. **Contact enrichment talking points** — 3-5 personalized conversation starters per contact
2. **Hiring manager verification** — confirms people still work where PDL says they do
3. **Company news briefs** — real-time news for email hooks
4. **Market context intelligence** — hiring freeze/expansion awareness for the agent planner
5. **Company discovery** — finds companies actively hiring (vs static list)
6. **Career page crawling** — Firecrawl crawls company career pages for role listings
7. **Structured job posting extraction** — Firecrawl returns salary, requirements, nice-to-haves, team, hiring manager from any job URL
8. **Structured company profiles** — Firecrawl extracts leadership, culture, employee count from about pages
9. **LinkedIn profile extraction** — Firecrawl extracts structured data from LinkedIn profiles

---

## Failure Modes & Resilience

Every Perplexity/Firecrawl call is wrapped in try/except with:
1. **Shared cache check first** — most calls are cache hits
2. **Graceful degradation** — returns empty dict/list on failure, never crashes
3. **SerpAPI fallback** — all major paths still have the old SerpAPI code wired as fallback (marked `# DEPRECATED: remove in Phase 8`)
4. **Lazy client init** — if API key is missing, the client never initializes and functions return empty results silently

---

## Phase 8 (Pending — deferred 2 weeks for stability)

Once 2 weeks of stable operation confirms no issues:
- Delete `serp_client.py`
- Remove all SerpAPI fallback paths
- Remove `google-search-results` from `requirements.txt`
- Remove `SERPAPI_KEY` from config
- Clean up Jina references in `config.py`

---

## File Inventory

| File | Lines | Role |
|---|---|---|
| `backend/app/services/perplexity_client.py` | 542 | All Perplexity API calls (8 functions) |
| `backend/app/services/firecrawl_client.py` | 262 | All Firecrawl API calls (6 functions) |
| `backend/app/services/enrichment_cache.py` | 81 | Shared Firestore cache layer |
| `backend/app/services/extraction_schemas.py` | 41 | Pydantic schemas for Firecrawl structured extraction |

---

## Perplexity Function Inventory

| Function | Model | Replaces | Used by |
|---|---|---|---|
| `quick_search(query)` | sonar | Single SerpAPI call | firm_details, coffee_chat, scout |
| `pro_search(query)` | sonar-pro | SerpAPI + OpenAI extraction combo | firm_details (deep company research) |
| `deep_research(query)` | sonar-deep-research | 4x SerpAPI + Jina + OpenAI | coffee_chat (person research) |
| `search_jobs_live(query, location)` | sonar | SerpAPI google_jobs engine | job_board |
| `discover_companies_live(...)` | sonar-pro | Nothing (new) | agent_planner, firm search |
| `batch_enrich_contacts(contacts)` | sonar | Nothing (new) | runs.py, agent_actions |
| `verify_hiring_managers(hms)` | sonar | Nothing (new) | recruiter finder |
| `get_company_news_brief(company)` | sonar | SerpAPI news search | email generation, agent |
| `get_market_context(companies, industries)` | sonar | Nothing (new) | agent_planner |

## Firecrawl Function Inventory

| Function | Replaces | Used by |
|---|---|---|
| `extract_job_posting(url)` | Jina + OpenAI parsing | job_board (detailed view) |
| `extract_company_profile(url)` | Jina + OpenAI parsing | firm_details, scout |
| `scrape_url(url, type)` | Jina Reader generic | scout_service |
| `scrape_linkedin_profile(url)` | Jina LinkedIn scraping | contact enrichment |
| `crawl_career_page(careers_url)` | Nothing (new) | agent_actions, firm search |
| `batch_scrape(urls)` | Multiple Jina calls | scout bulk research |
