# SerpAPI to Perplexity Sonar + Firecrawl Migration Plan

Author: code audit, read-only session
Status: draft for Sid review
Scope: backend Python only (chrome-extension and frontend have no SerpAPI usage)

## 1. Executive Summary

Offerloop currently makes every external "search the web" call through SerpAPI. The audit found nine distinct call sites across five modules, spanning four distinct intents: Google Jobs aggregation, news synthesis, firm metadata extraction (via Google Knowledge Graph + ChatGPT), and LinkedIn URL discovery.

| | Current SerpAPI | Proposed Mix |
|---|---|---|
| Monthly volume (midpoint of 1k to 10k stated band) | ~5,000 calls | ~5,000 calls re-routed |
| Estimated monthly cost (SerpAPI Production plan, $150/mo for 30k credits, but Google Jobs costs 2x credits) | ~$75 to $150 | ~$25 to $50 (see breakdown below) |
| Endpoints that should stay on SerpAPI | n/a | Google Jobs aggregation, Google `total_results` alumni count |
| Endpoints that move to Perplexity Sonar | n/a | Meeting news + research, Scout research handler |
| Endpoints that move to Firecrawl | n/a | Firm metadata extraction, LinkedIn company URL discovery |

Two findings worth surfacing up front:

1. **Google Jobs (`engine=google_jobs`) cannot be cleanly replaced.** Both `fetch_jobs_from_serpapi` and Scout's `_search_jobs` rely on SerpAPI's parsed Google Jobs response (jobs_results array, apply_options, detected_extensions). Firecrawl can scrape individual ATS pages but does not aggregate. Recommendation: keep on SerpAPI for now, or move to a dedicated jobs aggregator (Adzuna, Fantastic.jobs, Greenhouse/Lever direct).
2. **Firm details extraction relies on Google's `knowledge_graph` field**, which is SERP-specific. The cleanest migration is to swap the SERP call for a two-step Firecrawl flow (search for firm name, then scrape the firm's actual website), but this changes the data shape feeding `_extract_firms_batch_with_chatgpt`. Treat this as a behavioral change, not a drop-in.

## 2. Audit Table

All paths are relative to `backend/`.

| # | File:fn | Engine / Params | Plain English | Trigger | Downstream | Category | Target |
|---|---|---|---|---|---|---|---|
| 1 | `app/routes/job_board.py:454` `fetch_jobs_from_serpapi` | `engine=google_jobs`, q, location, num<=10, next_page_token | Pull Google Jobs listings (with apply_options, salary, posted_at) | Per personalized job board load (4 queries x 2 pages, with Firestore stale-while-revalidate cache) | Firestore cache, then transform + serve to `/api/job-board/personalized` | (d) KEEP ON SERP | SerpAPI (or jobs aggregator) |
| 2 | `app/services/scout_service.py:1635` `_search_jobs` | `engine=google_jobs`, q, num=10 | Same as #1 but from Scout chat | Scout AI handles a "find me jobs" intent | Returns JobListing[] to Scout response | (d) KEEP ON SERP | SerpAPI |
| 3 | `app/services/meeting.py:367` `fetch_serp_research` | `engine=google`, `tbm=nws`, q, num=10, tbs (time window) | Up to 4 Google News queries about a contact's company/division/office, deduped to 5 news items, then summarized by OpenAI | One meeting prep run (background thread) | News items + industry overview written into prep PDF | (a) SYNTHESIS | Perplexity Sonar |
| 4 | `app/services/meeting.py:490` `fetch_comprehensive_research` | `engine=google` and `tbm=nws`, 4 parallel searches: company_news, company_overview, person_mentions, industry_trends | Four targeted searches per meeting prep, snippets fed back into the LLM | One meeting prep run (background thread) | Snippets piped into the prep generation prompt | (a) SYNTHESIS | Perplexity Sonar |
| 5 | `app/services/firm_details_extraction.py:69` `_search_linkedin_url` | `engine=google`, q=`{firm} LinkedIn company`, num=5 | Fallback to find LinkedIn company URL when the primary firm search did not surface it | Per-firm during firm search, only when LinkedIn not found in the main fetch | LinkedIn URL stored on Firm record | (c) LINK LIST | Firecrawl `/search` or Perplexity Search API |
| 6 | `app/services/firm_details_extraction.py:142` `_fetch_serp_results_only` | `engine=google`, q=`{firm} company {city} {region}`, num=20 | The workhorse: fetches knowledge_graph + organic_results for a firm name, then ChatGPT extracts structured firm data (website, employees, hq, industry, description) | Per firm in `get_firm_details_batch`, called from `serp_client.search_companies_with_serp` with overfetch multipliers | Knowledge graph + organic_results passed to `_extract_firms_batch_with_chatgpt` | (b) STRUCTURED EXTRACTION (with caveat: uses Google Knowledge Graph) | Firecrawl (search + scrape) |
| 7 | `app/services/firm_details_extraction.py:609` `search_firm_details_with_serp` | Same as #6 | Synchronous single-firm variant of #6 | Same as #6, single-firm callers | Same as #6 | (b) STRUCTURED EXTRACTION | Firecrawl (search + scrape) |
| 8 | `app/services/scout_service.py:2081` `_handle_research` | `engine=google`, q, num=5 | Generic web search for Scout research questions ("what's the interview process at X", "skills needed for Y"), snippets passed to OpenAI for summary | Scout AI handles a "research" intent | OpenAI summarizes snippets, returned in Scout response | (a) SYNTHESIS | Perplexity Sonar |
| 9 | `app/services/alumni_sourcing_service.py:140` `_serpapi_count` | `engine=google`, q=`site:linkedin.com/in/ "{company}" "{school}"`, num=10 | Alumni count fallback: reads Google's `search_information.total_results`, rounds to 2 sig figs | Phase 6 alumni sourcing, only when PDL misses | Written into the alumni count cache | (d) KEEP ON SERP (Google-specific `total_results`) | SerpAPI |

Feature flag: `_serpapi_count` only fires when `ALUMNI_GRAPH_ENABLED=true`, which currently defaults OFF. Volume today is effectively zero.

## 3. Per-Call-Site Migration Notes

### Job Board (#1, #2): keep on SerpAPI

Both call sites depend on parsed Google Jobs fields: `jobs_results`, `apply_options`, `detected_extensions.posted_at`, `job_highlights`, `serpapi_pagination.next_page_token`. Firecrawl scraping individual ATS sites (Greenhouse, Lever, Ashby, Workday) would produce a different shape and would not give you aggregated cross-board results in one call.

Two viable long-term paths if you want off SerpAPI:
- Per-board ingestion: Firecrawl `/crawl` on Greenhouse, Lever, Ashby boards (Greenhouse and Lever have public job board JSON APIs, no scraping needed). Aggregate in Firestore. Higher engineering cost, lower per-call cost.
- Jobs API vendor: Adzuna (free for low volume), Fantastic.jobs, or Apify Indeed scraper. Some have generous free tiers.

For now: do not migrate.

### Meeting (#3, #4): Perplexity Sonar, one call replaces four

Today: `fetch_comprehensive_research` fires 4 parallel SerpAPI queries, then `fetch_serp_research` fires up to 4 more sequential queries, then OpenAI summarizes the snippets. That is 8 SerpAPI calls per meeting prep, plus an OpenAI summarize call.

Proposed: replace both functions with a single Perplexity Sonar call per "research surface" (company news, company overview, person mentions, industry trends). Sonar returns synthesis with citations in one shot, eliminating the SerpAPI + OpenAI summarize chain. 8 SerpAPI calls becomes 4 Perplexity calls.

Token estimate per Perplexity call: ~500 input, ~1500 output.
- Sonar base: ($0.5 + $1.5)/1k + $5/1k request fee = ~$0.007 per call.
- Sonar Pro: ($1.5 + $22.5)/1k + $8/1k = ~$0.032 per call. Not needed for news synthesis.

Latency: Sonar's 3 to 8 second response time is fine here because meeting prep already runs in a background thread.

### Scout research (#8): Perplexity Sonar

This is the cleanest swap. Today: SerpAPI gives 5 snippets, OpenAI summarizes them. Tomorrow: one Sonar call returns synthesis + sources directly. Drop the second OpenAI call entirely.

Latency concern: Scout is user-facing (Cmd+K, real-time chat). Sonar's median latency is ~3s, ~8s p95. That is slower than the current SerpAPI (~1s) + OpenAI streaming. Two options:
- Accept the latency, show a "researching..." state. Cleanest UX.
- Stream Sonar's response (Perplexity supports streaming) to mask the time-to-first-token.

### Firm details (#6, #7): Firecrawl with redesign

This is the call site that needs the most thought. Today the flow is:

1. `_fetch_serp_results_only({firm} company)` returns knowledge_graph + organic_results.
2. `_extract_firms_batch_with_chatgpt` packs 8 firms' worth of SERP data into one ChatGPT call and asks it to extract structured fields.

The Knowledge Graph is the highest-signal input. Replacing it with Firecrawl needs a new shape:

Proposed flow:
1. Firecrawl `/search` for `{firm} company {city}`, get top 5 result URLs. 2 credits.
2. Identify the firm's official website (heuristic: shortest domain match) and LinkedIn company URL from the search results.
3. Firecrawl `/scrape` the official website's homepage or `/about` page. 1 credit.
4. Pass the scraped markdown to ChatGPT for extraction.

Cost per firm: ~3 Firecrawl credits. At Standard tier ($83/mo for 100k credits = $0.00083/credit), that is ~$0.0025 per firm. SerpAPI at ~$0.005 per call was higher.

Behavioral risk: scraped homepage content is messier than knowledge_graph. Recommend running both paths in parallel for one week and diffing the extracted fields before cutting over.

### LinkedIn URL fallback (#5): Firecrawl /search

Today: one SerpAPI call, scan organic_results for `linkedin.com/company`.
Tomorrow: Firecrawl `/search` (2 credits per 10 results), filter results client-side.

Alternative: Perplexity Search API at $5/1K requests, same shape (list of URLs). Slightly cheaper per call than Firecrawl /search at scale (Search API is $0.005/call vs Firecrawl /search at ~$0.00166/call on Standard tier). Firecrawl wins on price.

### Alumni count (#9): keep on SerpAPI

Uses Google's `search_information.total_results` field, which is a SERP-specific signal. No other vendor exposes Google's reported result count for a query. Since the feature is flag-gated OFF today, the cost is zero. Re-evaluate only if the flag is turned on.

## 4. Cost Projection

Volume assumption: 5,000 SerpAPI calls/month total (midpoint of the stated 1k to 10k band).

Distribution (assumed proportional to user actions and code path frequency; see Open Questions for verification):

| Call site bucket | Today's calls/mo | After migration | New provider | New cost/mo |
|---|---|---|---|---|
| Job Board #1+#2 (Google Jobs) | 3,000 | 3,000 | SerpAPI (unchanged) | ~$45 |
| Firm details #5+#6+#7 | 1,500 | ~1,500 Firecrawl credits (search + scrape, ~3 credits per firm = 4,500 credits) | Firecrawl Standard | ~$3.74 (4,500 of 100k credits, plan is $83/mo flat) |
| Meeting #3+#4 | 300 (consolidated to ~150 Perplexity calls after dedup) | 150 | Perplexity Sonar base | ~$1.05 |
| Scout research #8 | 150 | 150 | Perplexity Sonar base | ~$1.05 |
| Alumni #9 | 0 (flag off) | 0 | SerpAPI (unchanged) | $0 |
| Total | 4,950 | | | SerpAPI ~$45, Perplexity ~$2.10, Firecrawl plan fee ($83/mo Standard or $16/mo Hobby) |

Firecrawl plan sizing: 4,500 credits/mo fits in the Hobby tier (5,000 credits at $16/mo yearly). If firm search volume grows or new Firecrawl use cases land (resume scraping, job posting parsing), step up to Standard at $83/mo for 100k credits.

**Bottom line scenarios**:

| Scenario | Monthly cost |
|---|---|
| Status quo (SerpAPI Production estimate) | $75 to $150 |
| Migrate synthesis + structured to Perplexity + Firecrawl Hobby, keep Job Board on SerpAPI | ~$45 SerpAPI + $16 Firecrawl + $2 Perplexity = **~$63/mo** |
| Same but Firecrawl Standard (room to grow) | ~$45 + $83 + $2 = **~$130/mo** |
| Aggressive: also migrate Job Board to direct ATS ingestion via Firecrawl | $0 SerpAPI + $83 Firecrawl + $2 Perplexity = **~$85/mo** (plus engineering cost) |

Assumptions called out:
- 5k/mo midpoint. If real volume is 1k, all numbers drop 5x. If real volume is 10k, double them.
- Job board volume is the largest unknown. Firestore cache hit rate determines actual SerpAPI burn.
- Firecrawl pricing is annualized ("billed yearly"). Monthly billing may be 20 to 30% higher per their pricing page.
- Perplexity request fee scales with `search_context_size` (Low/Med/High); the $5/1k estimate uses Low which is fine for short-context lookups.

## 5. Recommended Migration Order

Lowest risk first, user-facing hot paths last.

| Order | Call site | Why this order | Risk |
|---|---|---|---|
| 1 | Meeting (#3, #4) | Background job, no UX latency exposure. Easy A/B by writing both providers' output to Firestore and comparing for a week. | Low |
| 2 | Alumni count (#9) | Feature is flag-off. Migrate only if/when re-enabled; otherwise defer. | None today |
| 3 | LinkedIn URL fallback (#5) | Tiny volume, single field returned, easy to validate. | Low |
| 4 | Firm details (#6, #7) | Highest volume after job board. Significant data shape change. Run dual-path for one week. | Medium (data quality risk) |
| 5 | Scout research (#8) | User-facing real-time. Migrate only after confirming Sonar's latency profile works for chat UX. Use streaming. | Medium (latency risk) |
| 6 | Job board (#1, #2) | Do not migrate to Firecrawl/Perplexity. Either keep on SerpAPI or move to a dedicated jobs API (separate project). | n/a |

## 6. Firecrawl Integration Plan

The codebase pattern for external clients is consistent:

- `app/services/openai_client.py`: a thin helper exposing `get_openai_client()` and `get_anthropic_client()`, both reading env vars at module load.
- `app/services/serp_client.py`: requests.Session-based wrapper, in-memory caching by domain hash, function-based public API.
- `app/services/hunter.py`: similar shape, function-style.

**Proposed file**: `backend/app/services/firecrawl_client.py`

**Env vars** (matching existing style):
- `FIRECRAWL_API_KEY` (required)
- `FIRECRAWL_BASE_URL` (default `https://api.firecrawl.dev/v1`, allow override for self-hosted)

Register in `backend/app/config.py` alongside `SERPAPI_KEY`, `JINA_API_KEY`, etc.

**SDK vs HTTP**: use direct `requests` with `requests.Session()`. Matches the SerpAPI and Hunter patterns. The Firecrawl Python SDK adds dependency surface for no real ergonomic gain on Flask backends. Direct HTTP is also what the existing codebase does for PDL.

**Public API shape**:

```python
def firecrawl_search(query: str, limit: int = 10, timeout: int = 10) -> List[Dict]:
    """Return [{url, title, snippet}, ...]. Wraps POST /v1/search."""

def firecrawl_scrape(url: str, timeout: int = 15, formats: List[str] = ['markdown']) -> Optional[Dict]:
    """Return {markdown, html, metadata}. Wraps POST /v1/scrape."""

def firecrawl_map(url: str, timeout: int = 15) -> List[str]:
    """Return list of discovered URLs. Wraps POST /v1/map."""
```

**Retry + error handling** (match `firm_details_extraction._fetch_serp_results_only`):
- One `requests.Session()` at module scope for connection pooling.
- Per-call timeout (5 to 15 seconds, caller-specified).
- Catch `requests.exceptions.Timeout` and `requests.exceptions.RequestException` separately.
- Return `None` or `[]` on failure, do not raise. Log via `logger.warning` with structured `extra={search_id, url, duration_seconds, error}`.
- No automatic retry inside the client. Retries are caller-controlled via the existing `app/utils/retry.py` if needed (matches OpenAI/Anthropic pattern).
- Rate limiting: Firecrawl Standard tier has generous concurrency; no client-side rate limit needed initially. Add `concurrent.futures.ThreadPoolExecutor` with `max_workers=15` in the firm search caller, matching the SERP pattern.

**Perplexity wrapper**: add `backend/app/services/perplexity_client.py` in the same shape:
- Env: `PERPLEXITY_API_KEY`
- One function: `perplexity_sonar(query: str, system: Optional[str], model: str = 'sonar') -> Optional[Dict]`
- Returns `{answer, citations, model, usage}`. Used by meeting and Scout.

## 7. Open Questions for Sid

1. **Current SerpAPI bill**: confirm actual monthly spend and plan tier (Developer $75/mo, Production $150/mo, Big Data $275/mo). The audit assumes Production-ish, but the real number changes the ROI math.
2. **Per-endpoint volume**: is there a SerpAPI usage dashboard you can pull last month's breakdown by `engine`? No per-endpoint logging exists in code today. If you can export, we can replace the 5k assumption with real numbers.
3. **Job board migration appetite**: are we willing to take on a per-ATS ingestion project (Greenhouse/Lever/Ashby public APIs + Firecrawl for Workday/Indeed) to fully exit SerpAPI? Or is keeping Google Jobs on SerpAPI fine indefinitely?
4. **Firm search data quality bar**: knowledge_graph today gives clean "employees: 25,000, founded: 1907, hq: New York" fields. Are you OK with potentially noisier extraction from homepage scraping? Acceptable if we keep the ChatGPT extraction step strict.
5. **Scout latency floor**: what is the max acceptable p95 for Scout research responses? Sonar streams at ~600ms TTFT but full responses take 3 to 8 seconds. The current SerpAPI+OpenAI pipeline is faster but lower quality.
6. **Alumni flag**: is `ALUMNI_GRAPH_ENABLED` going to ship soon? If so, factor the alumni count call back into volume planning. If not, defer.
7. **Caching strategy**: today the firm search has both an in-memory LRU (1-hour TTL) and Firestore cache. Firecrawl scrape responses are larger (full markdown vs structured fields). Confirm Firestore document size limits are OK or plan for Cloud Storage.
8. **Hobby vs Standard Firecrawl plan**: starting on Hobby ($16/mo) limits growth runway. Standard ($83/mo) is justified if firm search alone uses >5k credits/mo, or if we plan to use Firecrawl for resume parsing or job posting parsing soon.

## 8. Verified Pricing Snapshot

Captured during this audit; verify against vendor pricing pages before commit.

| Provider | Plan / endpoint | Price |
|---|---|---|
| Perplexity Sonar (base) | per request | $1/M input tokens + $1/M output tokens + $5 to $12 per 1K requests |
| Perplexity Sonar Pro | per request | $3/M input + $15/M output + $6 to $14 per 1K requests |
| Perplexity Sonar Reasoning Pro | per request | $2/M input + $8/M output + $6 to $14 per 1K requests |
| Perplexity Search API | per request | $5 per 1K requests, no token costs |
| Firecrawl Free | n/a | $0/mo, 1,000 credits |
| Firecrawl Hobby | yearly billed | $16/mo, 5,000 credits, $9 per 1.5k overage |
| Firecrawl Standard | yearly billed | $83/mo, 100,000 credits, $47 per 35k overage |
| Firecrawl Growth | yearly billed | $333/mo, 500,000 credits |
| Firecrawl Scale | yearly billed | $599/mo, 1,000,000 credits |
| Firecrawl credit costs | /scrape, /crawl, /map | 1 credit per page |
| Firecrawl credit costs | /search | 2 credits per 10 results |
| Firecrawl credit costs | /interact | 2 credits per browser minute |

Credits do not roll over month to month on Firecrawl.

End of report.
