# Offerloop Data Provider Strategy — Replacing People Data Labs

**Prepared:** 2026-05-22
**Repo:** `/Users/karthik/work/Offerloop`
**Context:** 50K PDL credits burned in 6 months (~8.3K/mo). PDL service paused → Hunter.io wired in as emergency fallback. Hunter cannot do school/alumni filtering, so the product's signature feature is currently broken. Need an enterprise-tier, multi-provider waterfall that preserves alumni search while cutting cost-per-search 2–3×.

**Constraints from user:**
- Enterprise-tier providers (no compromises on data quality)
- School/college alumni filtering is **must-have** (core differentiator)
- Multi-provider waterfall for maximum cost efficiency
- US-focused, ~300 users / ~40 paying
- Output format: markdown report (this document)

---

## Part 1 — Root Cause Analysis: Why 50K PDL Credits Vanished

### 1.1 The credit model nobody noticed

PDL's Person Search API bills **1 credit per *result returned*, not per request**. A single `size=50` search call costs up to 50 credits. The Offerloop code defaults to over-fetching to handle dedup:

```python
# backend/app/routes/runs.py:300
pdl_fetch_count = max_contacts + existing_contact_count + 2
```

For a Pro user with 100 existing contacts asking for 8 results, that's a `size=110` PDL call returning ~110 records → **110 credits per single search session**. The product showed the user "8 contacts" but burned 110 credits.

### 1.2 Silent multipliers — the real burn

Every visible "search" in the UI fans out to several PDL calls behind the scenes:

| Feature | PDL calls per user action | File |
|---|---|---|
| Direct contact search | 1 call, size=5–17 (5–17 credits) | `runs.py` |
| **Recruiter Finder** (job board) | **3–8 calls per company** | `recruiter_finder.py:656,845,1324` |
| **Alumni search** (school filter) | **2–4 calls** (metro + locality batched) | `school_affinity.py:121` |
| **Prompt search** with pagination | **2–3 PDL pages × 15 each = 30–45 credits** | `prompt_pdl_search.py:96` |
| Contact dedup | Loads user contacts into `pdl_fetch_count + 2` over-fetch | `runs.py:300` |

Multiply by 40 paying users doing 15–30 searches/month, plus a long tail of free users, and ~8.3K credits/month is consistent with the code paths — even with low individual user volume.

### 1.3 Zero metering

There is **no PDL cost tracking anywhere in the codebase**. No per-call counter, no daily cap, no alert when a user spikes. The internal "credits" system (`config.py:174–265`) maps to coffee-chat prep / interview prep, NOT to PDL spend. This is the most fixable problem and the prerequisite for everything else in this plan.

### 1.4 OEM licensing exposure (legal/contractual)

**You almost certainly need a PDL OEM/redistribution license, not the standard Enterprise plan.** Offerloop's 300 end-users see PDL-enriched profiles inside a multi-tenant SaaS. Per buyer reports, PDL OEM floors are **$40–70K/yr** for small SaaS, **$60–150K/yr** at 1–5M records/yr. If you stay on PDL without OEM, you're contractually non-compliant. This is the hidden ceiling.

---

## Part 2 — Provider Landscape: What Actually Supports Alumni Filtering

After researching 12+ providers, the universe of viable alumni-search APIs is much narrower than the marketing suggests:

### 2.1 Verdict matrix

| Provider | Alumni search via API | Pricing model | 2026 reality | Verdict for Offerloop |
|---|---|---|---|---|
| **People Data Labs** | ✅ **Best-in-class** — only provider with structured `education.school.name` + `degrees` + `majors` + `end_date` range queries | $0.16–0.25/credit (Enterprise); OEM $40–70K/yr floor for SaaS | Most mature API, deepest alumni data model. Credit burn was a *usage* problem, not a data problem — fixable with metering + caching + smart routing | **Co-primary for precision alumni queries** (grad-year ranges, multi-degree, specific majors) |
| **Coresignal** | ✅ Compound filters work (`education.school_name` + `current_company` + `title` in one query) | $0.01–0.02/record at scale; $500–1000/mo realistic min | 839M+ profiles, daily–quarterly refresh, multi-source. Best alumni API *for the price*. Slightly weaker on graduation-year normalization vs PDL. | **Co-primary for broad alumni queries** (school + company + title) |
| **Proxycurl (NubelaLabs)** | ✅ Had Person Search with school filter | $0.10/credit PAYG | **End-of-life in 2026 after LinkedIn lawsuit Jan 2025.** Replaced by NinjaPear. | **Do not adopt** |
| **NinjaPear** (Proxycurl successor) | Partial — newer endpoints, syntax still evolving | $49/$299/$899/$1899/mo tiers | Same team, post-pivot. 5–10 credit minimum per search. | **Tertiary fallback only** |
| **Apify** (LinkedIn Sales Navigator Scraper) | ✅ Via Sales Nav URL filters (school + company + title) | ~$0.002–0.01 per extracted profile, PAYG | **Already integrated** in Offerloop (`apify_client.py`). 4–10× cheaper than Bright Data per profile. Latency higher for fresh runs (best for batch, not live). | **Use for batch prebuild of top schools** |
| **Apollo.io Enterprise** | ❌ No graduation-year range, weak structured education data | $119/seat/mo, Vendr median $15.7K/yr | Strong for sales filters (title/company/industry), weak for alumni. Education data is patchy text fields. | **Sales enrichment only, not alumni** |
| **ZoomInfo Elite** | ❌ Education on enrichment, NOT in search filters | $50–80K/yr+ for 10 seats + API | Enterprise trap: opaque, restrictive redistribution. Education not searchable via API. | **Not worth it** |
| **Cognism Diamond** | ❌ Education not searchable | $30–50K/yr | EU phone-data specialist. Wrong shape for US alumni. | **Skip** |
| **Lusha Scale** | ❌ No education search | $25–40K/yr | Cheapest of enterprise tier, but no alumni capability at all. | **Skip** |
| **Hunter.io** (already integrated) | ❌ Email/domain only | $0.002–0.004/request at scale | Best in class for email finding. No people search. | **Keep for email enrichment tier** |
| **Findymail** | ❌ (email finder) | $0.03–0.05/verified email | Best LinkedIn-URL → work-email (~44% hit rate). | **Use for personal email from LinkedIn** |
| **Anymail Finder** | ❌ (email finder) | $0.03–0.05/verified email | Pay-only-for-verified. ~37% LinkedIn hit rate. | **Tertiary email fallback** |

### 2.2 Headline conclusions

1. **Only 3 providers do real alumni search via API in 2026**: People Data Labs, Coresignal, and (in legacy form) Proxycurl/NinjaPear. None of the famous "enterprise" data vendors (Apollo, ZoomInfo, Cognism, Lusha) support school-attended as a search filter — only as an enrichment field on known persons. **PDL replacement candidates are narrower than it looks.**

2. **Run PDL and Coresignal as co-primaries with query-based routing.** Both are billed per record returned at similar effective enterprise/OEM rates ($0.01–0.02/record). PDL has the deepest, most structured education model — uniquely supports graduation-year ranges, multi-degree filters, normalized majors. Coresignal is cheaper and good enough for the broad case (school + company + title). Use each for what it's best at:
   - **PDL** when query includes: `graduation_year_range`, multi-degree combos ("MBA AND BS"), specific majors, or Pro/Elite-tier precision queries
   - **Coresignal** when query is just `school + company + title` (the bread-and-butter 70%)

   This hybrid gives you PDL's data quality where it matters AND Coresignal's price for routine queries. Bonus: avoids single-vendor risk.

3. **Proxycurl is dead.** If anything in your plan was going to lean on Proxycurl, redirect to Coresignal. NinjaPear (the successor) is too immature to bet on yet.

4. **Apify is the unlock for power users** — you already pay for Apify (for LinkedIn posts via `apify_client.py`). Run the LinkedIn Sales Navigator Scraper actor against your top 50 schools × top 500 companies, store in your own Postgres index. ~500K profiles for ~$2.5K/quarter (~$833/mo amortized) — 4–10× cheaper than Bright Data snapshots. Daily searches against your own index = $0 marginal cost.

5. **Hunter is best-in-class for what it does** (work email from name + domain, 95% accuracy). Keep it for the email-finding leg of the waterfall — do NOT use it as a PDL replacement for search.

---

## Part 3 — Recommended Architecture: 5-Tier Waterfall

### 3.1 Tier diagram

```
USER QUERY: "engineers at Stripe who went to USC"
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 0: INTERNAL CACHE (Redis + Postgres)                │
│ - Postgres `people` table, indexed by linkedin_url,      │
│   identity_key (hash of name+company_domain), school     │
│ - Redis hot cache: profile blobs, 90-day TTL             │
│ - Negative cache: `miss:{identity_key}`, 7–30 day TTL    │
│ HIT RATE TARGET: 60–70% after 90 days of warming         │
└────────────────────┬─────────────────────────────────────┘
                     │ cache miss
                     ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 1: ALUMNI POOL (your own index)                     │
│ - Prebuilt via Apify LinkedIn Sales Navigator Scraper    │
│   (already integrated: backend/app/services/apify_client │
│   .py)                                                   │
│ - Sales Nav URLs filter to top 50 schools × top 500      │
│   target companies                                       │
│ - Refreshed quarterly via Apify actor runs               │
│ - Marginal cost: $0 per user search                      │
│ HIT RATE TARGET: 20–25% of cache misses                  │
└────────────────────┬─────────────────────────────────────┘
                     │ not in pool
                     ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 2 — CO-PRIMARY ROUTING (query-shape based)          │
│                                                          │
│ Router decides PDL vs Coresignal based on query:         │
│                                                          │
│ ┌─ TIER 2a: CORESIGNAL Multi-Source Employee API ──────┐ │
│ │ Triggered when query is: school + company + title    │ │
│ │ (the broad ~70% case)                                │ │
│ │ - 1 credit per record, ~$0.01–0.02 effective         │ │
│ │ - Cap size=15, max 3 pages                           │ │
│ │ - Apply confidence threshold                         │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ TIER 2b: PDL Person Search (OEM-licensed) ──────────┐ │
│ │ Triggered when query needs PDL's unique strengths:   │ │
│ │ - graduation_year range filter                       │ │
│ │ - multi-degree combos (MBA AND BS)                   │ │
│ │ - specific majors (CS, Finance, etc.)                │ │
│ │ - Pro/Elite-tier "high precision" mode               │ │
│ │ - 1 credit per RESULT RETURNED                       │ │
│ │ - Strict caps: size=10, min_likelihood="high",       │ │
│ │   dataset="resume"                                   │ │
│ │ - Use Bulk Enrich (not Search) when LinkedIn URL     │ │
│ │   already known                                      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ HIT RATE TARGET: 95%+ between the two                    │
└────────────────────┬─────────────────────────────────────┘
                     │ both providers returned 0 (rare)
                     ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 3: CROSS-PROVIDER FALLBACK                          │
│ - If Coresignal returned 0 → retry on PDL                │
│ - If PDL returned 0 → retry on Coresignal                │
│ - If both returned 0 → write to negative cache,          │
│   surface "no results" to user                           │
│ FREQUENCY TARGET: <5% of queries                         │
└────────────────────┬─────────────────────────────────────┘
                     │ found candidates, but missing emails
                     ▼
┌──────────────────────────────────────────────────────────┐
│ TIER 4: EMAIL WATERFALL                                  │
│ 4a) Hunter.io (work email from name + domain) [primary]  │
│ 4b) Findymail (LinkedIn URL → email) [for personal]      │
│ 4c) Anymail Finder (pay-per-verified) [last resort]      │
│ + NeverBounce/ZeroBounce verification layer              │
└──────────────────────────────────────────────────────────┘
```

### 3.2 What each tier costs at Offerloop's scale

Assumed steady-state monthly volume (after caching is working): 8.3K "candidate-equivalent operations" per month (roughly what PDL was processing).

| Tier | Provider | Calls/mo | Cost | Notes |
|---|---|---|---|---|
| 0 | Internal cache | 5,500 (66%) | $0 | Pure savings |
| 1 | Apify Sales Nav Scraper (prebuilt pool) | 1,200 (14%) | ~$200–500/mo amortized | ~$2K/quarter for top 50 schools × top 500 companies; reuses existing `apify_client.py` |
| 2a | Coresignal API (broad alumni) | 850 (10%) | ~$500–1,000/mo | Minimum monthly commit; covers school+company+title queries |
| 2b | PDL Person Search (precision alumni) | 500 (6%) | ~$60–150/mo at runtime, plus OEM floor | Grad-year ranges, multi-degree, majors. Strict caps + dedup. |
| 3 | Cross-provider fallback | 50 (<1%) | minimal | Retry on the other primary when one returns 0 |
| 4a | Hunter Enterprise | 800 emails | ~$200–400/mo | Email enrichment on found candidates |
| 4b | Findymail | 250 emails | ~$100–150/mo | Personal email from LinkedIn |
| 4c | Anymail Finder | 50 emails | ~$25–50/mo | Pay-per-verified backstop |
| - | NeverBounce verifier | ~1,000 verifications | ~$50–100/mo | Required for cold outreach |

**Estimated total: $1,200–2,100/month** vs current PDL Pro implied ~$1,600–2,000/mo and OEM-required ~$3,300–5,800/mo. Critically: **3–5× more search capacity** at the same or lower cost, and **alumni filtering is restored**.

PDL OEM gives you ~8,300 credits/mo on a $40–70K/yr floor; this waterfall delivers an estimated effective capacity of **~25,000–40,000 search operations/mo** for the same money, by burning paid-vendor calls only on the ~14% of traffic that escapes cache + prebuilt pool.

### 3.3 Sample query trace — "engineers at Stripe who went to USC"

1. **Tier 0 cache lookup:** Postgres query on `school='USC' AND company_domain='stripe.com' AND title ILIKE '%software engineer%'`. If ≥3 results found and `last_verified > 60d ago`, return immediately. *Cost: $0.*
2. **Tier 1 alumni pool:** If Stripe + USC is in your prebuilt pool, hit your own Elasticsearch / Postgres index. *Cost: $0.*
3. **Tier 2 routing decision:** Query is `school + company + title` only — no grad-year range, no degree filter → route to **Coresignal** (Tier 2a). POST to Multi-Source Employee API with compound filter `{current_company_name: 'Stripe', current_title_contains: 'Software Engineer', education_school_name_contains: 'University of Southern California'}`. Returns ~8 candidates. *Cost: 8 credits × $0.015 = $0.12.*
4. **Tier 4a email enrichment:** For each new candidate, Hunter `email-finder?domain=stripe.com&first_name=X&last_name=Y`. *Cost: 8 × $0.003 = $0.024.*
5. **Verifier:** NeverBounce on 8 emails. *Cost: 8 × $0.008 = $0.064.*
6. **Writeback:** Insert/update `people` table with identity_key, set `last_verified_at=now()`. Cache to Redis with 90-day TTL.

**Total cost for this query: ~$0.21**, vs current PDL path ~$2.20 (110-credit over-fetch × $0.02). **~10× cost reduction on a typical alumni query.**

### 3.4 Sample query trace — PDL-routed query (precision alumni)

User query: "Find Stanford CS grads from 2018–2022 with MBA from Wharton, currently SWE at FAANG"

1. **Tier 0/1 cache + pool:** Likely miss — this is a high-precision query with rare overlap.
2. **Tier 2 routing decision:** Query contains `graduation_year_range` AND multi-degree (`MBA` + `BS in CS`) → route to **PDL** (Tier 2b). Coresignal can't reliably do grad-year range filtering.
3. **Tier 2b PDL Person Search:**
   ```json
   POST /v5/person/search
   {
     "query": {
       "education.school.name": ["Stanford University"],
       "education.majors": ["Computer Science"],
       "education.end_date": ">=2018-01-01,<=2022-12-31",
       "education.degrees": ["bs", "ms", "mba"],
       "job_title_role": "engineering",
       "job_company_name": ["Meta", "Apple", "Amazon", "Netflix", "Google"]
     },
     "size": 10,
     "min_likelihood": "high",
     "dataset": "resume"
   }
   ```
   Returns 6 high-confidence candidates. *Cost: 6 credits × $0.02 (Enterprise rate) = $0.12.*
4. Continue to Tier 4 email enrichment, verifier, writeback.

**This query is impossible on Coresignal alone with current API surface** — that's why PDL stays in the architecture. The cost is the same (~$0.12) for ~10× more filter precision.

### 3.5 Router pseudocode

```python
# backend/app/services/enrichment_router.py
def route_alumni_search(query: AlumniQuery) -> Provider:
    # Tier 2b: PDL when query needs PDL's unique strengths
    needs_pdl = any([
        query.graduation_year_range is not None,
        query.degree_filters and len(query.degree_filters) > 1,  # multi-degree
        query.major_filter is not None,
        query.precision_mode == "elite",  # Pro/Elite tier opt-in
    ])
    if needs_pdl:
        return Provider.PDL

    # Tier 2a: Coresignal for the broad case (~70% of queries)
    return Provider.CORESIGNAL
```

---

## Part 4 — Credit Efficiency Patterns (provider-agnostic)

These deliver 2–3× more searches per dollar **regardless of which providers you pick**. Implement these FIRST.

### 4.1 Identity keys & canonical dedup
- LinkedIn URL canonicalization: lowercase, strip `www.`, strip `?originalSubdomain=...`, strip trailing slash. Use `linkedin.com/in/john-doe-12345` as the canonical key.
- Email normalization: lowercase, strip `+tag` for Gmail. Store both raw + normalized.
- Identity hash: `sha256(lower(first)+lower(last)+normalized_company_domain)` as backup key when LinkedIn missing.

### 4.2 Cache TTLs by data type

| Field | TTL | Why |
|---|---|---|
| Profile (name, title, company) | 180 days | Job changes ~1.5yr avg |
| Education (school, degree, year) | 365 days | Effectively immutable |
| Work email | 90–180 days | Stable unless company change |
| Personal email | 180 days | Rarely changes |
| Phone | 90 days | Carrier/line shifts |
| Negative result | 7–30 days | Re-attempt occasionally |

### 4.3 Pre-flight gates (kill bad queries before they cost anything)

```python
def should_skip_provider_call(query, segment):
    # Skip if no usable identity
    if not query.last_name and not query.linkedin_url:
        return True, "no_identity"
    # Skip free-webmail domains for work-email finders
    if query.company_domain in FREE_WEBMAIL_DOMAINS:
        return True, "free_webmail"
    # Skip if negative cache fresh
    if redis.exists(f"miss:{query.identity_key}"):
        return True, "negative_cache_hit"
    # Skip if per-segment hit rate < 5%
    hit_rate = get_segment_hit_rate(provider, segment)
    if hit_rate < 0.05 and monthly_spend_pct > 0.7:
        return True, "low_segment_hit_rate"
    return False, None
```

### 4.4 Bound the cost surface

- `size` cap: 15 (was implicitly ~17 with `+ existing + 2`)
- `max_pages`: 3 (was unbounded in prompt search pagination)
- `min_likelihood: "high"` on PDL fallback (cuts 20–40% low-confidence noise)
- Use Enrichment, not Search, when LinkedIn URL is known (1 credit vs 10+)
- Recruiter finder per-company cap: 3 candidates (was 3–8)

### 4.5 Quarterly prebuild for top schools
Use Apify's LinkedIn Sales Navigator Scraper actor (already integrated) once per quarter to ingest profiles for top 50 target schools × top 500 target companies. Sales Nav URLs let you filter by `school + current_company + title` natively in LinkedIn's own search. ~500K profiles, ~$2K per Apify run (~$0.004/profile), amortized ~$650/mo. Daily searches against this index = $0 marginal cost, instant latency. PDL/Coresignal only used for tail queries (companies/schools not in your prebuilt pool, or freshness updates).

**Implementation note:** Apify Sales Nav scrapers require LinkedIn cookies/accounts; the actor handles session rotation. Reliability is good but lower than a paid dataset — bake in retries and accept ~5–10% drop rate per run.

### 4.6 Metering (NON-NEGOTIABLE prerequisite)
Add per-call cost tracking BEFORE switching providers. You cannot manage what you don't measure. Add:
- `provider_calls` table: `provider, endpoint, credits_charged, est_cost_usd, user_id, search_id, returned_records, cache_hit, timestamp`
- Per-user spend dashboard
- Alert on >$1/day spent by any single user
- Daily cost-per-search KPI by tier

---

## Part 5 — Implementation Roadmap

### Week 1 — Metering & visibility (no provider changes)
- Add `provider_calls` table + middleware that logs every Hunter/PDL/future-provider call with estimated cost
- Build internal dashboard showing $-per-search by user and by feature (search vs recruiter-finder vs alumni)
- Fix the `pdl_fetch_count + existing + 2` over-fetch in `runs.py:300` (just cap at `max_contacts + 5`)
- **Expected savings on its own: ~30% PDL credits**

### Week 2 — Cache layer
- Postgres `people` table with identity_key, linkedin_url, canonical fields, per-field `last_verified_at` timestamps
- Redis hot cache: profile blob keyed by linkedin_url and identity_key, 90-day TTL
- Negative cache: `miss:{key}` with 7-day TTL on full waterfall failure
- LinkedIn URL canonicalization helper
- **Expected savings: another 30–40% reduction in PDL traffic**

### Week 3 — Coresignal integration (behind feature flag)
- Sign Coresignal contract (target: $500–$1K/mo minimum, $0.01–0.02/record)
- Build `coresignal_client.py` with same surface as `pdl_client.py` (`search_persons`, `enrich_person`)
- Normalize Coresignal results to Offerloop contact schema (same as Hunter normalizer in `hunter_person_search.py`)
- Feature flag: `PRIMARY_PROVIDER=coresignal|pdl` (default pdl, ramp coresignal at 10% → 50% → 100%)

### Week 4 — Routing rules
- Implement Tier 0–4 waterfall in a `enrichment_router.py` module
- Per-tier metrics emitted (cache hit, tier 1 hit, ..., tier 4 cost)
- Replace direct PDL calls in `runs.py`, `prompt_search.py`, `recruiter_finder.py`, `school_affinity.py` with calls to the router

### Month 2 — Apify prebuild
- Identify top 50 target schools and top 500 target companies (use existing Offerloop usage data)
- Generate Sales Nav search URLs: one per `school × company-batch` pair, filtered by relevant titles
- Extend `backend/app/services/apify_client.py` with a `run_sales_nav_scraper(sales_nav_url, max_results)` method (or use an existing actor like `apify/linkedin-sales-navigator-scraper`)
- Ingest into Postgres `people` table; normalize school names against an alias map (e.g., "USC" / "University of Southern California" / "USC Marshall")
- Add Tier 1 (prebuilt pool) lookup to the router
- Quarterly refresh cron job
- Budget: ~$2K per quarterly run; first run captures historical baseline

**Why Apify over Bright Data:** Already integrated, 4–10× cheaper per profile, PAYG (no $500/mo minimum), and Sales Nav URL filters give you native LinkedIn search semantics for free. Tradeoff: more engineering than a packaged dataset, slightly higher failure rate per run.

### Month 3 — Email waterfall optimization
- Keep Hunter as primary (already integrated)
- Add Findymail integration (LinkedIn URL → email)
- Add Anymail Finder as last-resort pay-per-verified
- Add NeverBounce/ZeroBounce verification layer before sending
- All cached, all metered

### Month 4 — Negotiate PDL OEM at right-sized volume
- By now your PDL volume has dropped to ~500 calls/month (Tier 2b only)
- Negotiate a small OEM contract: ~$25–35K/yr floor with ~50K credits/yr commit
- This is significantly cheaper than the $40–70K/yr "small SaaS" floor because your usage is predictably narrow (precision queries only)
- Keep PDL contract structured so credits roll over or convert easily; you'll burn unevenly based on user query mix
- Result: PDL stays as Tier 2b co-primary at a fraction of its previous cost-per-search, doing what only PDL can do

---

## Part 6 — Cost Comparison

| Scenario | Monthly cost | Notes |
|---|---|---|
| **Status quo** (PDL Pro, no metering) | $1,600–2,000 | Plus legal exposure: not OEM-licensed |
| **Status quo + OEM (PDL only, legal)** | $3,300–5,800 | Same data quality, no waterfall savings |
| **Single-provider switch** (Coresignal only, no waterfall) | $1,500–2,500 | Loses PDL's grad-year/multi-degree precision |
| **Recommended hybrid** (Apify pool + Coresignal + PDL co-primary + Hunter/Findymail) | $2,500–4,000/mo first 90 days; $1,500–2,500 steady state | PDL Tier 2b ~$25–35K/yr OEM amortized adds ~$2K/mo. **3–5× more capacity per dollar**, both alumni quality tiers preserved |
| **Same hybrid + cache at 70% hit rate** | $1,000–1,500 | Steady state after 90 days of warming |

The waterfall is cheaper *and* more capable. The catch: ~2 months of engineering work to get the routing, caching, and Bright Data prebuild operational.

---

## Part 7 — Risks & Open Questions

### 7.1 Legal / ToS
- **LinkedIn ToS:** Coresignal, Bright Data, and NinjaPear all surface LinkedIn-derived data. Post-hiQ-v-LinkedIn, scraping public profiles isn't per se illegal, but LinkedIn's ToS still prohibit it. **Risk mitigation:** use vendor-licensed data (vendor bears the scraping), do not market as "powered by LinkedIn," DPA in place, candidate opt-out flow.
- **PDL OEM:** If you keep PDL, you legally need OEM. Confirm with PDL sales whether your existing contract allows multi-tenant SaaS display of their data.
- **GDPR/CCPA:** All providers claim compliance; you still need a privacy policy update covering data sources and candidate rights.

### 7.2 Provider risks
- **Coresignal as primary:** Newer than PDL, less battle-tested for OEM scenarios. Negotiate redistribution rights explicitly in contract. Validate alumni coverage with a 1K-record evaluation before committing.
- **Apify Sales Nav scraper reliability:** Lower than a paid dataset — expect ~5–10% failure rate per actor run, occasional rate-limit / cookie-rotation issues. Mitigate with retries, error monitoring, and quarterly (not real-time) usage. LinkedIn's anti-scraping posture is the biggest risk; have a contingency to swap to Bright Data dataset (~$3–6K/quarter, 5–10× cost) if Apify becomes unreliable.
- **Apify ToS:** Using Apify means you're orchestrating LinkedIn scraping (vs Bright Data taking that responsibility on as a vendor). Your DPA / privacy policy must cover this. Get counsel sign-off.
- **NinjaPear maturity:** Don't depend on it as a critical-path provider in 2026.

### 7.3 What to validate before signing contracts
- [ ] Get Coresignal eval account → run 100 alumni queries from your test set → measure coverage vs PDL baseline. Pass criterion: ≥80% of PDL hits also returned by Coresignal on broad (no grad-year) queries.
- [ ] Validate that Coresignal CANNOT reliably do grad-year-range filtering — this confirms PDL's role as Tier 2b co-primary (rather than allowing Coresignal to fully replace PDL).
- [ ] Confirm Coresignal contract permits multi-tenant SaaS display (this is their normal use case but verify).
- [ ] Open conversation with PDL sales: request OEM quote sized to ~50K credits/yr (down from current 100K-track). Use the lower volume to negotiate down from $40–70K/yr floor.
- [ ] Pilot Apify Sales Nav scraper run for 3 schools × 10 companies before committing to full quarterly cron. Measure: actual cost-per-profile, success rate, time-to-completion.
- [ ] Audit current PDL contract for redistribution clauses. Decide: renew with OEM, drop entirely, or move to PAYG for residual lookups.

### 7.4 Things to test in production before full rollout
- A/B test Coresignal vs PDL for 2 weeks with 10% of users → compare result quality (subjective recruiter feedback) and email deliverability
- Verify Hunter + Findymail + verifier chain achieves >90% deliverability before allowing cold outreach
- Confirm cache hit rate reaches >50% within 60 days; if not, debug query normalization

---

## Part 8 — Files That Will Change

Critical files to modify (no code changes yet — plan-mode):

- **`backend/app/routes/runs.py`** (line 300) — fix over-fetch, route through new enrichment_router
- **`backend/app/routes/prompt_search.py`** — replace direct PDL call with router
- **`backend/app/services/recruiter_finder.py`** — cap per-company calls, route through router
- **`backend/app/services/school_affinity.py`** — replace batched PDL calls with Coresignal compound filter
- **`backend/app/services/pdl_client.py`** — keep, but downgrade to Tier 3 fallback only
- **`backend/app/services/hunter_person_search.py`** — keep, but only for email tier (4a)
- **NEW: `backend/app/services/coresignal_client.py`** — primary search/enrich
- **NEW: `backend/app/services/enrichment_router.py`** — Tier 0–4 routing logic
- **NEW: `backend/app/services/identity_key.py`** — canonicalization helpers
- **EXTEND: `backend/app/services/apify_client.py`** — add `run_sales_nav_scraper(sales_nav_url, max_results)` method for quarterly alumni-pool prebuild (currently only used for LinkedIn posts)
- **NEW: `backend/app/services/alumni_pool_builder.py`** — quarterly cron job that orchestrates Apify runs across top-school × top-company matrix and writes to `people` table
- **NEW: `backend/app/services/findymail_client.py`** — personal email tier
- **NEW: `backend/migrations/NNN_people_canonical.sql`** — `people` table, indexes, `provider_calls` table

---

## Part 9 — Sources

Web research (Perplexity + web search), 2025–2026:

- **Apollo enterprise pricing:** Vendr marketplace (median $15.7K/yr from 83 verified buys); Apollo public pricing page; G2 reviews
- **PDL pricing model:** PDL official docs (`support.peopledatalabs.com/hc/en-us/articles/25794271805211-Pricing-credits`); Nubela blog comparison; crustdata.com PDL alternatives
- **Proxycurl end-of-life:** NinjaPear founder blog (`nubela.co/blog/what-is-proxycurl-api-now-in-2026-im-the-founder/`); LinkdAPI blog on Proxycurl alternatives
- **Coresignal vs PDL:** Coresignal's own comparison page (`coresignal.com/coresignal-vs-peopledatalabs/`); crustdata Coresignal review
- **Email finder benchmarks:** Cleanlist 2025 shootout; community LinkedIn-URL conversion tests
- **ZoomInfo / Cognism / Lusha:** G2 + Vendr buyer reports; ZoomInfo API docs (no education search documented); Cognism phone-verified positioning
- **Bright Data LinkedIn People dataset:** Bright Data datasets page + 2025 buyer Slack reports
- **Waterfall enrichment patterns:** Landbase, Coresignal, Instantly, Datablist, Bettercontact, ZoomInfo Operations blog (industry-standard architecture)

---

## TL;DR

1. **PDL alone is no longer the right answer**, but PDL **belongs in the architecture** for what only it can do — graduation-year ranges, multi-degree filters, structured majors. The silent multipliers in your code burned credits 3–8× faster than the UX suggested; that's fixable.
2. **None of the famous enterprise vendors (Apollo, ZoomInfo, Cognism, Lusha) support alumni search in their API.** Skip them for your core use case.
3. **Run PDL and Coresignal as co-primaries** (Tier 2a / Tier 2b) with router-based query-shape decisions:
   - **Coresignal** (Tier 2a): broad `school + company + title` queries — 70% of traffic, cheaper
   - **PDL** (Tier 2b): grad-year ranges, multi-degree, specific majors, Pro/Elite precision — 30% of traffic
4. **Build a 5-tier waterfall:** internal cache → prebuilt LinkedIn pool (via Apify Sales Nav scraper, already integrated) → Coresignal + PDL co-primary → cross-provider fallback → Hunter/Findymail email enrichment. Estimated **3–5× more search capacity** at lower steady-state cost.
5. **Add metering FIRST, before any provider change.** Every PDL/Hunter/Coresignal call should log estimated $ cost to a `provider_calls` table. You can't manage what you can't see.
6. **Right-size PDL contract** during the migration: drop from ~100K credits/yr trajectory to ~50K/yr OEM commit (~$25–35K/yr), since you're only using PDL for precision queries.
7. **Engineering effort:** ~3 months to fully operational hybrid; Week 1 metering + over-fetch fix alone saves ~30%.

This report is written to the plan file at `/Users/karthik/.claude/plans/file-string-line-tidy-moon.md` (you can move/rename it post-approval, e.g., to `Offerloop/docs/DATA_PROVIDER_STRATEGY.md`).
