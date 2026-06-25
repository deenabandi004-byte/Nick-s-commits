# Job Board Elevation Plan

**Status:** Draft — 2026-06-01
**Author:** Investigation summary + fix plan
**Related docs:** `RECOMMENDER_STATUS.md`, `PERPLEXITY_FIRECRAWL_IMPLEMENTATION_PLAN.md`, `.claude/plans/jaunty-spinning-owl.md`
**Trigger:** External API credit alert (100% burn). Job board quality complaints — "jobs suggest themselves."

---

## TL;DR

We built a high-quality, student-curated job ingestion pipeline (Fantastic.jobs → Firestore) and then never plugged it into the live job board. Every `/jobs` request bypasses our curated pool and runs SerpAPI live with 4 hardcoded queries. That's why credits burned out and why the feed feels generic.

**The fix is mostly a wiring change, not new infrastructure.** Switch the live serving path to read from Firestore-curated jobs, then layer on dream-company boosts, alumni surfacing, deadline awareness, and dismissal learning — all using signals we already collect.

**Effort:** ~1 week for Phases 1-3 (the visible win). 2 weeks for Phases 4-5 (the polish). All steps are independently shippable.

---

## Part 1 — Diagnosis

### What's actually broken

#### 1. Curated pipeline is dead weight

`backend/wsgi.py:608-662` runs two daemons every 24h:
- `run_fantastic_modified()` (`backend/pipeline/main.py:178-208`) — pulls jobs modified in last 24h via RapidAPI `active-jobs-db`
- `run_sweep_expired()` (`backend/pipeline/main.py:211-229`) — marks closed jobs `expired=true`

The ingest uses **10 hand-tuned student recipes** in `fetcher.py:367-498`:

| Recipe | Filter |
|---|---|
| `tech_intern` | SWE/ML/PM, 0-2 YOE, US |
| `tech_new_grad` | New-grad full-time |
| `tech_coop` | Co-op programs |
| `ib_summer_analyst` | 18 bulge-bracket firms (whitelist) |
| `quant_intern` | 16 quant shops (whitelist) |
| `year_coded_analyst` | 2026/2027 cohorts |
| `consulting_summer` | 20 MBB + Big 4 firms (whitelist) |
| `consulting_new_grad` | BA/AC full-time |
| `visa_sponsoring_intern` | Sponsorship-tagged, US |
| `broad_entry_level` | Marketing, ops, design, data |

Quality gate (`quality_gate.py:74-143`) drops staffing agencies, MLM scams, senior-only roles, sub-50-char descriptions, jobs >60 days old.

Output: ~500 unique new jobs/day land in `db.collection("jobs")`. Firecrawl + PDL enrichment runs hourly via `.github/workflows/job-pipeline.yml`.

**Nothing reads them at serve time.** `job_board.py:6629` (`fetch_personalized_jobs()`) calls `fetch_jobs_from_serpapi()` for every page load. The Firestore `jobs` collection is touched only for dedup-during-ingest.

#### 2. SerpAPI path is the firehose

`fetch_personalized_jobs()` (`job_board.py:6387-6554`) runs 4 hardcoded queries × 2 pages = up to 8 SerpAPI calls per page load. First page is cached 6h; page 2 is uncached. Queries are templates like `"Data Scientist Internship San Francisco"` — no resume content, no target companies, no university tier.

Result: every CS sophomore gets nearly identical results; the system is keyword-matching against a generic Google Jobs scrape with no quality gating.

#### 3. Signals we collect but don't use

| Signal | Where collected | Used in ranking? |
|---|---|---|
| `dreamCompanies` | Onboarding (Track A, shipped) | ❌ No |
| `targetCompanies` | Onboarding | ❌ No |
| Parsed resume skills | Resume parser → Firestore | Partial (only top 15 keywords) |
| Resume bullet text | Firestore | ❌ Never sent to query or scorer |
| Career track (consulting/IB/tech) | Onboarding (Track A) | ❌ No |
| University tier (target/semi/non) | `companies.ts` has tier data | ❌ No |
| Alumni at company | `contacts` collection | ❌ No |
| Work auth / visa status | Onboarding (Track A) | ❌ No |
| Saved jobs | `/job-board/saved-jobs` | ❌ Not used as affinity signal |
| Dismissed jobs | `recommendation_events` (Track C, shipped) | ❌ Logged only, never read |
| Applied jobs | Tracker | ❌ No |
| Coffee chat preps | `coffee-chat-preps` subcollection | ❌ No (strong intent signal) |
| Firm search history | `firmSearches` subcollection | ❌ No |

#### 4. Ranker is keyword-only

`student_job_ranker.py:124-236` scores by:
- Experience level fit (+18)
- Employment type (+15)
- Visa sponsorship (+12)
- Location (+8)
- Industry (+12)
- Skill overlap (+2 per match, cap +10)
- Title-major family (+6)
- Grad year cohort (+4)
- Salary transparency (+3)
- Stale penalty (-10 if >30 days)

No embeddings. No LLM judgment. No company-tier boost. No alumni boost. No deadline urgency. `semantic_skill_match()` is substring/fuzzy — "deep learning" doesn't match "neural networks."

#### 5. UX is a bulletin board, not a recruiter

- Pagination buttons exist but are disabled (`JobBoard.tsx:1023`)
- Search/filter is client-side only over already-fetched results
- "See the hiring team" charges 5 credits silently with no warning
- `matchScore` shown without explanation ("Matched to your profile")
- No "you can apply with referral via X" CTA even when user has contacts at company
- No deadline countdown for consulting/IB cycles
- No frontend caching — every manual refresh re-hits backend

### Why credits burned through

The user-facing app credits are sound. The damage is **external API spend**:

| Operation | App credits | External cost | Margin |
|---|---|---|---|
| Resume opt | 20 | ~$0.50 | ✅ healthy |
| Find recruiter | 5 | ~$10-15 PDL + Hunter | ❌ -200x |
| Find hiring manager | 5 | ~$15-20 PDL tier loop + Hunter | ❌ -300x |
| Job feed search | **0** | ~$0.50 × 8 SerpAPI calls | ❌ unlimited free |

Compounded by:
- Background daemons (`wsgi.py` agent daemon hourly, Loop scheduler hourly)
- `.github/workflows/job-pipeline.yml` Firecrawl enrichment hourly on ingested jobs that are never served
- No per-user rate limit on `/jobs/feed?refresh=true`

---

## Part 2 — Phased Fix Plan

Each phase is independently shippable and produces a visible user win.

### Phase 1 — Make the curated pipeline the actual job board (Week 1)

**Goal:** Stop calling SerpAPI live for every search. Serve from `db.collection("jobs")`. Cut external API spend ~80% on day one.

**Changes:**
- **`backend/app/routes/job_board.py:6387-6554`** — Replace `fetch_personalized_jobs()` body. New flow:
  1. Query Firestore: `where("expired", "==", False)`, `where("ingested_at", ">", now - 30d)`, limit 500
  2. Apply hard gates (career domain, job type, location, seniority) — keep existing `job_board.py:3339-3538` logic
  3. Rank in-memory with `student_job_ranker.py` (extended in Phase 2)
  4. Paginate top 50, cache result by `user_id + filter_hash` for 1 hour
- **`backend/app/routes/job_board.py`** — Keep `fetch_jobs_from_serpapi()` as fallback. Trigger when Firestore pool returns <10 jobs after gates. Gate behind `ENABLE_SERPAPI_FALLBACK=1`.
- **`backend/wsgi.py:608-662`** — Verify daemons are still healthy. Add structured logging on ingest count per recipe.
- **`backend/app/services/job_serving.py`** (new, optional refactor) — Extract Firestore query + ranking out of `job_board.py` since the file is already 8,800 lines.

**Rate limits (add to all phases):**
- `/jobs/feed?refresh=true`: 10/day Free, 50/day Pro, 200/day Elite
- `/job-board/find-recruiter`: same caps
- `/job-board/find-hiring-manager`: same caps

**Hiring-manager spend fix (separate but parallel work):**
- `recruiter_finder.py:1555-1627` — Drop `per_tier_size` from 20 to `max_results + 2`. Break loop early when pool ≥ threshold.
- `recruiter_finder.py:1722` — Skip Hunter verification on contacts whose PDL email is already flagged verified.

**Success criteria:**
- External API spend down ≥70%
- p95 job feed latency ≤500ms (Firestore is faster than SerpAPI)
- Quality survey: ≥4/5 students rate top 10 jobs "relevant" (baseline ~2/5)

**Rollback:** Feature flag `JOB_BOARD_SERVE_FROM_FIRESTORE`. Default off in prod for first 48h, on for internal users only.

---

### Phase 2 — Wire the signals we already have (Week 1)

**Goal:** Make `dreamCompanies` + alumni + career track actually matter in ranking. Onboarding finally pays off.

**Changes to `backend/app/services/student_job_ranker.py`:**

Add the following boosts to the scoring function:

| Signal | Boost | Source |
|---|---|---|
| Dream company hit | **+25** | `user.dreamCompanies` (case-insensitive name match) |
| Target company hit | **+15** | `user.targetCompanies` |
| Career track match | **hard gate** | `user.careerTrack` → maps to recipe set |
| Alumni at company | **+20** | `count(contacts where company == job.company) > 0` |
| Saved company affinity | **+10** | `count(saved_jobs where company == job.company) ≥ 2` |
| Dismissed pattern | **-30** | `count(dismissals where company == job.company OR title_pattern matches) ≥ 3` in last 14d |
| University tier × company tier | **+5 to +15** | `university.tier × companies.ts:tier` (target school + target firm = max) |

**New helper functions:**
- `backend/app/services/job_ranker_signals.py` — `load_user_signals(uid) -> UserSignals` (single Firestore round-trip; cache 5 min). Loads dream/target companies, alumni-by-company map, recent dismissals, saved company counts.
- Update ranker to accept `UserSignals` instead of fetching ad-hoc.

**Frontend (`connect-grow-hire/src/pages/JobBoard.tsx`):**
- Show "⭐ Dream company" badge on rows where boost fired
- Show "🎓 3 alumni you know" badge with click → opens contacts at that company
- Show "↗ You saved 2 jobs here" badge for affinity-boosted rows

**Success criteria:**
- ≥40% of top 10 results for a given user contain at least one dream/target company or alumni signal
- Click-through-rate on "alumni you know" badge >15%

**Rollback:** Per-signal feature flags so any single boost can be disabled if it skews rankings badly.

---

### Phase 3 — Make match reasoning visible (Week 2)

**Goal:** Replace "Matched to your profile" with one-line explanations on the top 10 only.

**Changes:**
- **New service** `backend/app/services/match_reasoning.py` — single OpenAI call per page load (batch top 10 in one prompt). ~$0.01 per page load. Cache by `(user_resume_hash, job_id)` for 7 days in Firestore.
- **Prompt template:** `"Given this student profile and this job posting, write one sentence (max 20 words) explaining why it's a fit. Reference specific skills, experience, or matched criteria. No marketing voice."`
- **Frontend (`JobBoard.tsx:314`)** — Replace generic "why" text with reasoning string. Keep skeleton state while loading.

**Success criteria:**
- ≥80% of top 10 rows show a reasoning sentence by p95
- Survey: students self-report job board "knows them" (≥4/5)

**Cost:** ~$0.001/student/page load × ~50 page loads/day × 300 users = ~$15/day = **~$450/month**. Acceptable given Phase 1 saves >$3k/month.

---

### Phase 4 — Deadline awareness + cycle playbook (Week 2)

**Goal:** Surface application urgency for consulting/IB. This is the single feature that separates a student job board from Indeed.

**Changes:**
- **`backend/pipeline/enrichment/deadline_extractor.py`** (new) — Run during ingest enrichment (`.github/workflows/job-pipeline.yml` hourly slot). For each new job in `ib_summer_analyst`, `consulting_summer`, `consulting_new_grad`, `quant_intern` recipes, call Perplexity once: `"Find application deadline for this role: {company} {title}. Return ISO date or 'rolling' or 'unknown'."` Store as `job.application_deadline` in Firestore. One-shot per job, cached forever.
- **`backend/app/services/cycle_playbook.py`** (new, static data) — Hardcoded JSON of cycle context per (career_track, role_class):
  ```
  {
    "consulting_summer_analyst": {
      "opens": "August",
      "closes": "October",
      "process": ["Behavioral", "Case interview", "Partner round"],
      "prep": "Start case prep 4 months out. Use Case in Point + Victor Cheng."
    },
    ...
  }
  ```
- **Frontend (`JobBoard.tsx`)** — Add deadline badge with countdown: "🔥 Closes in 12 days". Click opens cycle playbook drawer with prep checklist + "add to calendar" button.

**Success criteria:**
- ≥80% of curated consulting/IB jobs have a non-null `application_deadline`
- Students self-report deadline visibility "useful" (≥4/5)

---

### Phase 5 — Referral pathway + saved-search digest (Week 3)

**Goal:** Convert "I know someone here" into a one-click action. Add retention loop via weekly email.

**Referral pathway:**
- For each job, check `contacts` collection for user. If hit at `job.company`:
  - Primary CTA changes from "Apply →" to "Apply with referral via {contact.name} →"
  - Click → opens existing email-generation flow pre-loaded with referral template + that contact
- Falls back to standard "Apply →" if no contact at company

**Weekly digest (Pro/Elite only):**
- **`backend/app/services/weekly_digest.py`** — Cron Sunday 9am user-local. For each Pro/Elite user with `dreamCompanies` set:
  1. Query last-7-day ingested jobs at dream + target companies
  2. Rank with Phase 2 signals
  3. If ≥3 hits, send Gmail-API-drafted email: `"5 new roles at your dream companies this week."`
- Uses existing Gmail integration; no new infra.

**Success criteria:**
- Referral CTA shown on ≥15% of job rows for users with ≥10 contacts
- Weekly digest open rate ≥40%, click-through ≥10%

---

### Phase 6 — Embeddings polish (Weeks 4-5, optional)

**Goal:** Beat keyword-based skill matching. This is the recommender plan's Phase 1.

**Changes:**
- `text-embedding-3-small` on resume (per user, cached by resume hash) and on each job description (per job, cached forever)
- Cosine similarity → +20 max boost in ranker
- Replaces / supplements `semantic_skill_match()`

Defer until Phase 1-5 ship and we have baseline metrics. Embeddings are expensive only on cold-start; cached cost is negligible.

---

### Phase 7 — UX cleanup (parallel to all phases)

Quick wins to ship alongside backend changes:

- **`JobBoard.tsx:1023`** — Re-enable pagination buttons (API supports it; frontend just doesn't call it)
- **`JobBoard.tsx`** — Show credit balance in header + "(5 credits)" annotation on "See the hiring team" button
- **`JobBoard.tsx:805-855`** — Surface hard-gate stats upfront: "Showing 12 of 50 jobs · 38 filtered (15 too senior, 12 wrong location, 11 off-topic)"
- **`JobBoard.tsx`** — Wrap `/jobs/feed` in React Query with `staleTime: 5min` to prevent refresh hammering
- Real-time client-side filter (debounce 200ms) over the already-fetched pool — no API hit

---

## Part 3 — File-by-File Change Matrix

| File | Phase | Change |
|---|---|---|
| `backend/app/routes/job_board.py:6387-6554` | 1 | Replace `fetch_personalized_jobs()` body with Firestore query |
| `backend/app/routes/job_board.py` | 1 | Gate SerpAPI behind fallback flag |
| `backend/app/routes/job_board.py` | 1 | Add per-user daily rate limits |
| `backend/app/services/recruiter_finder.py:1555-1722` | 1 | Shrink PDL tier pool, skip Hunter on verified emails |
| `backend/app/services/student_job_ranker.py:124-236` | 2 | Add dream/target/alumni/dismissal boosts |
| `backend/app/services/job_ranker_signals.py` | 2 | New file — load all user signals in one round-trip |
| `backend/app/services/match_reasoning.py` | 3 | New file — one-line reasoning via OpenAI |
| `backend/pipeline/enrichment/deadline_extractor.py` | 4 | New file — Perplexity deadline extraction at ingest |
| `backend/app/services/cycle_playbook.py` | 4 | New file — static cycle context data |
| `backend/app/services/weekly_digest.py` | 5 | New file — Sunday cron, Gmail drafts |
| `connect-grow-hire/src/pages/JobBoard.tsx:314` | 3 | Show reasoning sentence |
| `connect-grow-hire/src/pages/JobBoard.tsx` | 2 | Badges: ⭐ Dream, 🎓 alumni, ↗ saved affinity |
| `connect-grow-hire/src/pages/JobBoard.tsx` | 4 | Deadline countdown + playbook drawer |
| `connect-grow-hire/src/pages/JobBoard.tsx` | 5 | Referral CTA replacement |
| `connect-grow-hire/src/pages/JobBoard.tsx:1023` | 7 | Re-enable pagination |
| `connect-grow-hire/src/pages/JobBoard.tsx` | 7 | React Query wrapping + filter debounce |
| `backend/wsgi.py:608-662` | 1 | Add ingest count metrics + alerting |

---

## Part 4 — Success Metrics

### Cost
- **External API spend (weekly):** baseline ~$X → target -70% after Phase 1
- **Per-user external API spend (Pro):** baseline ~$Y → target -80%
- **Free-tier abuse surface:** zero unlimited endpoints after Phase 1 rate limits

### Quality
- **Top-10 relevance survey (1-5):** baseline ~2 → target ≥4 after Phase 2
- **Click-through rate on top 5 jobs:** baseline X% → target +50%
- **Save rate per session:** baseline X% → target +100%
- **Dismissal rate per session:** baseline X% → target -30%

### Engagement
- **Job board WAU:** baseline → target +30% by end of Phase 5
- **Weekly digest open rate:** target ≥40% (industry benchmark for recruiting emails: 25-35%)
- **Referral CTA click rate:** target ≥10% of jobs where shown

### Conversion (north star)
- **Free → Pro conversion attributed to job board:** baseline 22% (all-product) → target lift in cohort that sees Phase 2-5 features

---

## Part 5 — Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Firestore pool too small for niche queries (e.g., "marine biology intern in Texas") | Phase 1 SerpAPI fallback when pool <10 after gates |
| Dream-company boost surfaces stale jobs (already ranked +25 even at 60 days old) | Stale penalty stays; cap dream boost to active-30d jobs |
| Alumni boost incorrect because contact's company is outdated | Trust most recent contact entry; re-verify monthly via PDL freshness |
| LLM reasoning hallucinates skill matches | Prompt requires citation to specific resume bullets; show "—" if confidence low |
| Deadline extraction returns wrong date | Show "unknown" or "rolling" when Perplexity isn't confident; never bluff |
| Digest email triggers spam complaints | Pro/Elite only, single weekly cadence, explicit unsubscribe per the consent we already have |
| Background daemon credit burn continues | Audit `wsgi.py` agent daemon + Loop scheduler in Phase 1; confirm they're not fanning out to all users |

---

## Part 6 — What Ships First

If approved, ship order (each independently deployable):

1. **Day 1-2:** Phase 1 wiring switch — Firestore serving with SerpAPI fallback gated. Daemon audit. Rate limits.
2. **Day 3:** Phase 1 hiring-manager fix — PDL tier shrink, Hunter skip-verified.
3. **Day 4-5:** Phase 2 — dream/target/alumni/dismissal boosts. Frontend badges.
4. **Day 6:** Phase 3 — match reasoning sentence.
5. **Week 2 day 1-2:** Phase 4 — deadline extraction + countdown badge.
6. **Week 2 day 3-4:** Phase 5 — referral CTA pathway.
7. **Week 2 day 5:** Phase 5 — weekly digest cron.
8. **Week 3+:** Phase 6 embeddings (optional), Phase 7 UX cleanup (parallel throughout).

---

## Part 7 — Open Questions

These should be answered before kicking off Phase 1:

1. **Daemon audit** — Are `wsgi.py` agent daemon and Loop scheduler the actual source of the credit burn, or is it user-driven? Need 7-day API call logs broken down by endpoint + user.
2. **Tier-aware ingest** — Should Free tier see all ingested jobs or only "broad_entry_level"? Argument for paid-tier-only premium recipes (IB whitelist, quant whitelist, MBB whitelist).
3. **Search refresh pricing** — Charge 1-2 credits for `refresh=true`, or cache 24h per user with no charge? Recommendation: 24h cache, no charge — better UX.
4. **Deadline-extractor cost ceiling** — Perplexity call per ingested IB/consulting job is ~$0.005. Over 30 days × 200 such jobs/day = ~$30/month. Acceptable.

---

## Appendix — Reference Data

### Recipe whitelists (`backend/pipeline/fetcher.py:367-498`)
- IB bulge brackets (18): GS, MS, JPM, BofA, Citi, Barclays, CS, UBS, DB, etc.
- Quant shops (16): Jane Street, Citadel, Two Sigma, DE Shaw, etc.
- MBB + Big 4 (20): McKinsey, BCG, Bain, Deloitte, PwC, EY, KPMG, etc.

### Ranker score components (`backend/app/services/student_job_ranker.py:124-236`)
- Max possible score today: ~95 (without proposed boosts)
- Max possible score with Phase 2 boosts: ~165
- Need to renormalize to 0-100 for display

### External API per-call costs (approximate)
- SerpAPI: ~$0.005 per call
- Perplexity: ~$0.005 per call
- Firecrawl: ~$0.01-0.02 per call
- PDL: ~$0.05 per contact returned
- Hunter.io: ~$0.04 per verification
- OpenAI gpt-4o (3.5k tokens): ~$0.05
- OpenAI text-embedding-3-small: ~$0.00002 per 1k tokens
