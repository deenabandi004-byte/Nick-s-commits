# Job Board Audit + Perplexity/Firecrawl Integration Plan

**Date:** 2026-05-17
**Status:** v2 — supersedes prior version (which incorrectly treated `/api/job-board/jobs` as the live path).
**Goal:** Turn the job board into a real functioning tool by integrating Perplexity + Firecrawl into the *actual* pipeline, in phases that ship one at a time without breaking prod.

---

## TL;DR

The user-visible job board is powered by a 5-source ATS aggregation pipeline (Greenhouse + Lever + Ashby + FantasticJobs + Simplify) that writes to a Firestore `jobs` collection. The SPA reads from `/api/jobs/feed`, which queries that collection and ranks the top 50 with GPT-4o-mini.

**Why it "doesn't work well right now":**

1. **The pipeline has no scheduler.** `pipeline/main.py` is a manual CLI script. No GitHub Action runs it, no Render cron. The feed's "new matches" query filters `posted_at >= now - 24h`, so if nobody ran the pipeline today, that section is empty. Multi-day staleness is the dominant user complaint.
2. **Job descriptions are unstructured text blobs.** `normalizer.py` stores `description_raw[:8000]` as a flat string. There are no `requirements`, `experience_level`, `salary_range`, or `responsibilities` fields. Ranking does substring matches against the blob; JD detail rendering shows a truncated excerpt. This is exactly what `Firecrawl.extract_job_posting` was built for, but it's never called.
3. **Intent isn't gated, only soft-scored.** `preferredLocation`, `careerInterests`, `graduationYear` only contribute small score deltas in `deterministic_score`. They never filter the candidate pool.

**The discovery story:** FantasticJobs (RapidAPI active-jobs-db) + 4 ATS direct APIs already provide solid breadth. Perplexity is **not** a replacement for them — it's a personalization layer for Phase 3. Firecrawl is **not** a discovery tool — it's the JD reader that turns raw text into structured fields, which is the highest-ROI integration.

**Ordered roadmap:**

| Phase | Days | What ships | Depends on |
|---|---|---|---|
| 0 | 1–2 | Pipeline scheduler (GitHub Action), pipeline-health endpoint, "last updated" badge | — |
| 1 | 3–5 | Firecrawl JD enrichment as a pipeline post-step; structured fields in Firestore; ranker reads them | Phase 0 |
| 2 | 2–3 | Hard intent gates using the new structured fields (location, level, type) | Phase 1 |
| 3 | 3–4 | Perplexity personalization layer — "Dream company spotlight" feed | Phase 1 (uses Firecrawl for citation pages) |
| 4 | 1 | Cleanup: repurpose or delete orphan `RecommendedJobs.tsx` + `/api/job-board/jobs` route | Phase 3 |

Total: ~2 weeks of focused work, each phase shippable independently behind a feature flag.

---

## 1. The job board you actually have (corrected)

### 1.1 The data plane

```
                    ┌─────────────────────────────────────────────┐
                    │  backend/pipeline/  (CLI — manual today)     │
                    │                                              │
                    │  main.py                                     │
                    │   └─ fetcher.py                              │
                    │        ├─ Greenhouse boards API              │
                    │        ├─ Lever postings API                 │
                    │        ├─ Ashby boards API                   │
                    │        ├─ FantasticJobs (RapidAPI 10 calls)  │
                    │        └─ Simplify (GitHub JSON)             │
                    │   └─ normalizer.py  → unified schema         │
                    │   └─ writer.py      → Firestore `jobs`       │
                    └────────────────────┬─────────────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────┐
                          │  Firestore: jobs collection  │
                          │  (job_id, source, title,     │
                          │   description_raw[:8000],    │
                          │   posted_at, expires_at, …)  │
                          └────────────────┬─────────────┘
                                           │
                                           ▼
                       ┌──────────────────────────────────────┐
                       │  /api/jobs/feed     (jobs.py)        │
                       │   prefilter_candidates →             │
                       │   rank_with_gpt (gpt-4o-mini, top 20)│
                       │   30min cache in users/{uid}         │
                       └────────────────┬─────────────────────┘
                                        │
                                        ▼
                              JobBoardPage.tsx (SPA)
```

### 1.2 The orphan path

`/api/job-board/jobs` (the SerpAPI + Perplexity route I focused on in the prior version) is called only by `connect-grow-hire/src/components/RecommendedJobs.tsx` — and that component is **not rendered anywhere** in the SPA. The route powers nothing user-facing today. The Perplexity primary / SerpAPI fallback wiring inside it works, but it's dead code from the user's perspective.

That's actually convenient: it gives us a sandbox to repurpose in Phase 3.

### 1.3 The schema you're working with

From `normalizer.py:198-220` (board-source path), each Firestore `jobs` doc has:

```
job_id, source, title, company, employer_logo, location, remote,
type, type_raw, category,
description_raw,            ← truncated text blob (8000 char), ranker reads this
apply_url,
salary_min, salary_max, salary_period,
salary_display, salary_normalized_annual, salary_extracted,
posted_at, fetched_at, expires_at  (14-day TTL)
```

What the ranker actually consumes (`job_ranking.py:247-299` + `:350-470`):
- `description_raw` substring matches against `resumeParsed.skills` (+4 each, cap +20)
- `title` regex for seniority exclusion
- `location` substring against `preferredLocation`
- `company` substring against `dreamCompanies`
- `type` for FULLTIME/INTERNSHIP fit
- That's it. No `requirements`, no `experience_level`, no `responsibilities` — because the schema has none.

What Firecrawl's `JobPostingExtract` schema produces (`backend/app/services/extraction_schemas.py:6-18`):

```
title, company, location, employment_type, salary_range,
requirements: List[str],          ← MUST-HAVES — high-signal for ranking
nice_to_have: List[str],          ← differentiation signal
responsibilities: List[str],      ← shows in SPA drawer
team_or_department, hiring_manager,
application_deadline, experience_level  ← exact field for hard-gating by level
```

**This is a clean superset.** Every field maps to either a ranker signal we can add or a SPA rendering improvement.

---

## 2. The integration plan (smooth, phased, low-risk)

### Phase 0 — Schedule the pipeline (1–2 days, zero new APIs)

The single biggest unblock. No P/F involvement.

**Work:**

1. **GitHub Action** `.github/workflows/job-pipeline.yml`:
   - `schedule: cron: '0 */2 * * *'` (every 2 hours).
   - Job 1 runs `python -m backend.pipeline.main` (full fetch+normalize+write).
   - Job 2 (daily 3am UTC) runs `python -m backend.pipeline.main --cleanup`.
   - Secrets needed: `RAPIDAPI_KEY`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` (decoded into a file at runtime), `OPENAI_API_KEY`.
2. **Pipeline run log:** new Firestore doc `pipeline_runs/{run_id}` written from `pipeline/main.py` end-of-run with `{started_at, ended_at, written, skipped_duplicates, source_breakdown, error?}`.
3. **Admin endpoint** `GET /api/admin/pipeline-health` (gated to admin UIDs): returns last 10 runs and a freshness score.
4. **SPA freshness badge** in `JobBoardPage.tsx` header: read `summary.last_pipeline_run`, show "Updated 1h ago" or "Stale — last refresh 3 days ago" in warm color if > 6h.
5. **Fix the broken `fantasticjobs_fetcher` tests** flagged in `CHANGELOG.md` — they're pre-existing failures and will mask source-drift bugs during scheduling.

**Files touched:** new `.github/workflows/job-pipeline.yml`; `backend/pipeline/main.py` (run-log write); new `backend/app/routes/admin.py` route; `backend/tests/test_fantasticjobs_fetcher.py` (un-break); `connect-grow-hire/src/pages/JobBoardPage.tsx` header.

**Done when:** pipeline runs autonomously for 24 hours without intervention; SPA shows accurate freshness; admin endpoint returns expected shape.

---

### Phase 1 — Firecrawl JD enrichment (3–5 days, the big win)

Add structured JD fields to every job in Firestore. This unlocks better ranking, better SPA detail rendering, and the foundation for Phase 2's intent gates.

**Where Firecrawl actually plugs in:**

```
fetcher → normalizer → writer → [NEW] enricher (Firecrawl)
                                   │
                                   ▼
                          Firestore `jobs` doc gets:
                          structured: {
                            requirements, nice_to_have,
                            responsibilities, experience_level,
                            salary_range_text, team,
                            enriched_at, enrichment_source: 'firecrawl'
                          }
```

**Work:**

1. **New file `backend/pipeline/enricher.py`** with:
   - `enrich_unstructured_jobs(limit: int = 200) -> dict` — queries Firestore for jobs where `structured` is missing and `expires_at > now`, oldest-first.
   - Calls `firecrawl_client.batch_scrape(urls)` in chunks of 25–50.
   - For each result, parses against `JobPostingExtract` and writes back to the `jobs` doc under a new `structured` map. Existing fields untouched.
   - Caches by `apply_url` in `enrichment_cache` (already exists) so the same posting is never paid for twice across users.
2. **New CLI flag** `pipeline/main.py --enrich-only` runs just this step.
3. **GitHub Action** adds a second cron `15,45 * * * *` (twice an hour) running `--enrich-only`, decoupled from the main fetch.
4. **Ranker updates** (`backend/app/utils/job_ranking.py`):
   - `deterministic_score`: if `job.structured.requirements` is present, score skill matches against that list at +6 each (cap +30) *instead of* the description_raw substring at +4. Fall back to current behavior if `structured` is missing.
   - `rank_with_gpt`: when building `jobs_str`, prefer `structured.requirements[:3]` joined as a one-liner over the 100-char description excerpt. Tighter, higher-signal context for GPT.
5. **SPA drawer enhancement** (`JobBoardPage.tsx JobRow` expanded view): when `structured` is present, render three sections — "Requirements", "Nice to have", "What you'll do" — replacing the 380-char text excerpt. Falls back gracefully if `structured` is missing.
6. **Backfill script** `backend/pipeline/main.py --backfill-enrich` to run once after rollout, hitting the existing ~5–10k jobs in Firestore (rate-limited, ~2 hour wall time).

**Cost guardrails (important):**
- Firecrawl per-scrape ≈ $0.001–0.005. At ~3,000 new jobs/day (estimated pipeline yield) that's $3–15/day steady state.
- Global cache by `apply_url` means duplicate-URL postings across sources (Greenhouse listing also surfaced by FantasticJobs) only pay once.
- Hard cap in `enricher.py`: `MAX_FIRECRAWL_PER_RUN = 500`. Surface the count in the run log so we can graph spend.
- Fail-safe: if `FIRECRAWL_API_KEY` is unset, enricher is a no-op; the rest of the pipeline still ships jobs (unstructured, same as today).

**Files touched:** new `backend/pipeline/enricher.py`; `backend/pipeline/main.py` (new CLI flags); `backend/app/utils/job_ranking.py` (read `structured` when present); `backend/app/routes/jobs.py` (`_serialize_jobs` keeps `structured`); `connect-grow-hire/src/pages/JobBoardPage.tsx JobRow`; `connect-grow-hire/src/types/...` (add `JobStructured` type).

**Schema migration:** purely additive. Old jobs without `structured` continue to work via the existing code path. No backfill blocker.

**Done when:** ≥80% of jobs in Firestore have a populated `structured` field; SPA drawer renders structured sections; ranker logs show the new weights firing.

---

### Phase 2 — Hard intent gates (2–3 days, depends on Phase 1)

Now that we have `structured.experience_level`, `structured.employment_type`, and a clean `requirements` list, we can finally enforce the onboarding intent the SPA already collects.

**Work:**

1. **Hydrate intent in `_background_rerank`** (`jobs.py:386-470`) — read `users/{uid}` fields: `preferredLocation`, `careerInterests`, `major`, `graduationYear`, `careerTrack`, `dreamCompanies`. Bundle into a `UserIntent` dict passed to `prefilter_candidates`.
2. **Update `prefilter_candidates`** (`job_ranking.py:301`):
   - Drop if `structured.experience_level` ∈ {"senior", "5+ years", "principal", "staff"} AND user graduates within 18 months.
   - Drop if `preferredLocation` is set AND `job.location` doesn't intersect it AND `job.remote != True`.
   - Drop if `careerInterests` is non-empty AND none of the user's interests appear in `structured.requirements` ∪ `category` ∪ `title`.
3. **Surface gated counts in the feed response** — new field `gated: {by_location: 12, by_level: 5, by_interest: 8}`. Helps debugging *and* lets the SPA show "We filtered N jobs that didn't match — change preferences" link.
4. **"Show all" escape hatch** in the SPA toolbar — when toggled, sends `?ungated=true` to `/api/jobs/feed`, which skips the new hard gates.
5. **Cache key includes intent vector** — `jobFeedCache.intent_hash = sha1(json.dumps(UserIntent, sort_keys=True))`. Invalidates when the user updates preferences.
6. **Feature flag** `users/{uid}.featureFlags.hardIntentGating` — default false initially, flip on for internal users + 10% of new sign-ups for a week before rolling out broadly.

**Files touched:** `backend/app/routes/jobs.py`, `backend/app/utils/job_ranking.py`, `connect-grow-hire/src/pages/JobBoardPage.tsx` (Show all toggle), feature-flag plumbing.

**Done when:** dismiss rate on first 5 standout jobs measurably drops for users in the flag bucket; gated counts surface in the response payload.

---

### Phase 3 — Perplexity personalization layer (3–4 days, depends on Phase 1)

Perplexity now earns its keep as the *personalization and gap-fill* layer, not as primary discovery.

**Three concrete insertions:**

#### 3a. Dream-company spotlight feed

For each Pro/Elite user with non-empty `dreamCompanies`, run one `perplexity.search_jobs_live(query, location)` per company per day (cached in `enrichment_cache` keyed by `[uid, company, day]`). Returns ~5 jobs per call.

For each returned job:
- Pick the best ATS-domain URL from Perplexity's citations (new — see 3c).
- Call `firecrawl_client.extract_job_posting(url)` immediately so the job has the same `structured` shape as pipeline-sourced jobs.
- Insert into Firestore `jobs` collection with `source: 'perplexity'` and a 7-day TTL.
- Tag with `discovered_via: { mechanism: 'dream_company', uid: '...', company: '...' }` so we can attribute relevance.

SPA: new "From your dream companies" section above "All matches", rendered only when this list is non-empty.

#### 3b. Niche-fit semantic discovery

For users whose `careerInterests` include terms underrepresented in the pipeline (e.g. "developer relations", "biotech ops", "civic tech"), run one `perplexity.search_jobs_live(careerInterests_query, preferredLocation)` per `_background_rerank` cycle. Same Firecrawl follow-up + insert pattern as 3a.

#### 3c. Wire Perplexity citations through

Current `perplexity_client.search_jobs_live` (`perplexity_client.py:173-228`) returns `[{title, company, location, url, summary}]` but throws the response's `.citations` array on the floor.

Modify the return to `[{..., url, alternate_urls: [<citations>]}]`. Then in the consumer (the new dream-company code path), pick the first citation whose host ∈ {greenhouse.io, lever.co, ashbyhq.com, workday.com, jobs.workable.com}. This is the canonical scrape target for Firecrawl. Fall back to Perplexity's chosen URL if no ATS citation exists.

**Why this matters:** Perplexity sometimes picks an aggregator (Indeed, Glassdoor) as the job's `url` even when the original ATS posting is in its citations. Picking the ATS URL improves Firecrawl extraction reliability dramatically.

**Cost guardrails:**
- Dream-company runs are per-user per-day, capped at `min(len(dreamCompanies), 3)` calls. ~3,000 active users × 3 calls × $0.01 ≈ $90/day worst case.
- Niche-fit runs are once per `_background_rerank`, which already triggers on cache miss every 30min max. Bounded.
- Both go through `enrichment_cache` so cache hits are free.

**Files touched:** `backend/app/services/perplexity_client.py` (return citations); new `backend/app/services/dream_company_feed.py`; `backend/app/routes/jobs.py` (call into 3a/3b inside `_background_rerank`); `connect-grow-hire/src/pages/JobBoardPage.tsx` (new section); `connect-grow-hire/src/services/api.ts` (response type additions).

**Done when:** Pro users see ≥3 dream-company jobs per day on average; pipeline-only users see no regression; Perplexity cost ledger tracks in admin endpoint.

---

### Phase 4 — Cleanup (1 day)

1. **Repurpose** `RecommendedJobs.tsx` as the "Dream company spotlight" rendering from Phase 3 (since its API shape already matches), OR delete it + the `/api/job-board/jobs` route. Recommend repurposing — the UI shape works.
2. Delete dead code in `job_board.py` for the SerpAPI/Perplexity discovery path if not reused (~1,500 lines safely deletable).
3. Move remaining used endpoints (`/job-board/find-recruiter`, `/job-board/parse-job-url`, `/job-board/optimize-resume`, etc.) into smaller route files — `routes/recruiters.py`, `routes/resume_tools.py`. This finally chips at the 9k-line monolith without a dedicated refactor PR.
4. Update CHANGELOG and CLAUDE.md to reflect that `/api/jobs/feed` is canonical and the pipeline is the discovery primary.

---

## 3. Schema migration & contracts

**Firestore `jobs` doc — fields added by Phase 1 (all optional, additive):**

```python
{
  # ... existing fields ...
  "structured": {
    "requirements": ["Python", "Excel", "0-2 years finance"],
    "nice_to_have": ["CFA Level 1", "SQL"],
    "responsibilities": ["Build pitch decks", "Run client models"],
    "experience_level": "entry-level",   # entry-level | mid | senior
    "employment_type": "INTERNSHIP",     # mirrors top-level `type` if accurate
    "salary_range_text": "$80,000 – $95,000",
    "team": "Investment Banking",
    "enriched_at": <timestamp>,
    "enrichment_source": "firecrawl",    # | "perplexity" | "manual"
  },
  "discovered_via": {                    # Phase 3 only
    "mechanism": "pipeline" | "dream_company" | "niche_fit",
    "uid": "...",                        # if user-specific
    "context": "Goldman Sachs",
  }
}
```

**`/api/jobs/feed` response — fields added (all additive):**

```json
{
  "new_matches": [...],
  "top_jobs": [...],
  "dream_company_jobs": [...],          // Phase 3
  "summary": {
    "last_pipeline_run": "2026-05-17T14:00:00Z",  // Phase 0
    "freshness_label": "1h ago"                    // Phase 0
  },
  "gated": { "by_location": 12, "by_level": 5 },   // Phase 2
  "intent_hash": "abc123…"                          // Phase 2
}
```

No fields removed. Existing SPA renders continue to work at every phase boundary.

---

## 4. Cost guardrails (consolidated)

| Source | Cost shape | Per-day estimate | Cap |
|---|---|---|---|
| FantasticJobs (RapidAPI) | Monthly subscription (existing) | flat | n/a |
| Firecrawl enrichment | Per-scrape, global URL cache | $3–15/day steady state | `MAX_FIRECRAWL_PER_RUN=500` per cron tick |
| Perplexity dream-company | Per-call, per-user-per-day cache | ~$90/day at 3k Pro users | 3 calls/user/day max |
| Perplexity niche-fit | Per-call, per-user-per-30min cache | bounded by user activity | n/a |
| OpenAI ranking (existing) | gpt-4o-mini, top 20 jobs per user | unchanged | unchanged |

Admin dashboard reads from `pipeline_runs` and `enrichment_cache` stats to track spend.

---

## 5. Observability & rollout

**Per phase:**

- Phase 0: pipeline-health endpoint with run log; SPA shows freshness; alert on no-run > 6h.
- Phase 1: log Firecrawl spend per run; track `% jobs with structured field`; alert if < 60% after 48h.
- Phase 2: log gated counts; track dismiss rate before/after flag flip.
- Phase 3: log Perplexity citation-pick success rate (ATS vs aggregator); track dream-company-job CTR.

**Feature flags** (all in `users/{uid}.featureFlags`, with global defaults):

- `hardIntentGating` — Phase 2 gate. Default false → 10% → 100% over a week.
- `dreamCompanyFeed` — Phase 3 gate. Pro/Elite only.
- `useFirecrawlStructured` — Phase 1 ranker switch. Once stable, deprecate the flag.

**Rollback:** each phase's new code is additive. Rolling back = unset the feature flag or comment out the enricher cron. No data needs to be reverted; old jobs without `structured` continue to be served via the legacy ranker path.

---

## 6. Risks & open questions

| Risk | Mitigation |
|---|---|
| Firecrawl rate limits / outages | `firecrawl_client` already returns `{}` on failure; ranker falls back to `description_raw`. No user-visible break. |
| Pipeline cron in GitHub Action exceeds 6-hour job limit | Use a step that runs only one source at a time; or move to Render cron when funded. |
| Pre-existing `fantasticjobs_fetcher` tests broken — source may already be drifting silently | Phase 0 explicitly fixes these and adds source-yield assertions to the test. |
| Hard gates too aggressive, hide good jobs | "Show all" escape hatch + gated-counts in response payload + 10% rollout. |
| Perplexity hallucinated job URLs | Always validate via Firecrawl extraction; if Firecrawl returns `{}`, skip the job rather than insert a phantom. |
| Cost spike from a misbehaving cron | Hard caps per run (`MAX_FIRECRAWL_PER_RUN`, dream-company `max 3/user/day`); admin dashboard surfaces ledger. |

**Open questions to resolve before Phase 1:**

1. Is `RAPIDAPI_KEY` already in Render's environment? If so, GitHub Action secret is the only new credential. If not, both need plumbing.
2. What's the current cardinality of the `jobs` Firestore collection? Determines backfill cost.
3. Should `dream_company_jobs` jobs be deduplicated against pipeline jobs at the same company? Recommend yes — merge into `top_jobs` if exact URL match exists.

---

## 7. Phase 1 file-target reference (deepest detail, since this is the linchpin)

```
NEW  backend/pipeline/enricher.py
       enrich_unstructured_jobs(limit=200) -> dict
         ├─ query: jobs where structured == null AND expires_at > now ORDER BY fetched_at LIMIT N
         ├─ for chunk of 25: firecrawl_client.batch_scrape(urls)
         ├─ for each result: validate against JobPostingExtract, write back
         └─ return {processed, enriched, failed, skipped_no_url, cost_estimate}

MOD  backend/pipeline/main.py
       + def run_enrich(limit: int = 500)
       + CLI flag: --enrich-only, --backfill-enrich

MOD  backend/app/utils/job_ranking.py
       deterministic_score():
         + if job.get("structured", {}).get("requirements"):
             match against requirements list (+6 each, cap +30)
         + else: existing description_raw path (+4 each, cap +20)
       rank_with_gpt():
         + jobs_str: prefer structured.requirements[:3] joined over description excerpt

MOD  backend/app/routes/jobs.py
       _serialize_jobs(): no change needed (passes dict through)
       _derive_match_signals(): use structured.experience_level if present

MOD  connect-grow-hire/src/pages/JobBoardPage.tsx
       JobRow expanded view: render structured.requirements + nice_to_have + responsibilities
                              when present; existing description excerpt as fallback

MOD  connect-grow-hire/src/types/<jobs>.ts  (wherever FeedJob lives)
       + structured?: JobStructured

NEW  .github/workflows/job-pipeline.yml  (also Phase 0 dependency)
       schedule: '15,45 * * * *' for --enrich-only
       schedule: '0 */2 * * *' for full pipeline
```

---

## 8. The one composition that ties it together

Across all three integration phases, the working pattern is:

```
Pipeline (discovery: real ATSes, real coverage)
    ↓
[Firecrawl enrichment]  (structure: requirements, level, etc.)
    ↓
Firestore `jobs`
    ↓
[Perplexity personalization]  (gap-fill + dream-company)
    ↓                 ↑
    └────── Firecrawl on citation URLs ──┘
    ↓
GPT ranker (now reading structured fields)
    ↓
Intent gates (now using structured fields)
    ↓
SPA feed (now rendering structured fields)
```

Perplexity and Firecrawl don't replace the pipeline. They sit upstream (Firecrawl, enriching pipeline output) and downstream (Perplexity, personalizing on top, with Firecrawl as its reader). Each phase is independently valuable. Each is independently reversible.

---

## Appendix A — Current Perplexity surface

`backend/app/services/perplexity_client.py`:

- `quick_search`, `pro_search`, `deep_research` — generic web Q&A
- `search_jobs_live(query, location, limit, domain_filter)` — used in Phase 3
- `discover_companies_live(...)` — usable in Phase 3 niche-fit
- `batch_enrich_contacts`, `verify_hiring_managers` — for hiring-manager tracker, out of scope here
- `get_company_news_brief`, `get_market_context` — drawer enhancement in Phase 4+

All cache via `enrichment_cache`; safe no-op if `PERPLEXITY_API_KEY` is unset.

## Appendix B — Current Firecrawl surface

`backend/app/services/firecrawl_client.py`:

- `extract_job_posting(url) -> JobPostingExtract` — **Phase 1 primary**
- `extract_company_profile(url)` — drawer "About this company" in Phase 4+
- `scrape_url`, `scrape_linkedin_profile` — out of scope here
- `crawl_career_page(careers_url, roles)` — possible Phase 3+ for dream companies that aren't on any indexed ATS
- `batch_scrape(urls)` — **Phase 1 workhorse**

Safe no-op if `FIRECRAWL_API_KEY` is unset.

## Appendix C — Existing pipeline reference

```
backend/pipeline/
  main.py        — entry point, CLI flags (--cleanup, --fix-salaries,
                   --fantastic-only, --skip-fantastic, [NEW: --enrich-only,
                   --backfill-enrich])
  fetcher.py     — 5 source fetchers; runs in ThreadPoolExecutor(max_workers=5)
  normalizer.py  — board-source vs jsearch paths; non-US filtering;
                   salary normalization (OpenAI extraction is gated off)
  writer.py      — batched Firestore writes (400/batch), dedup by job_id,
                   14-day TTL via expires_at
  [NEW] enricher.py — Phase 1
```
