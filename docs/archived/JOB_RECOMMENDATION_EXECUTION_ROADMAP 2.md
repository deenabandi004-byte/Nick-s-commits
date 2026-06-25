# Job Recommendation System: Execution Roadmap
## Mapping Redesign to Existing Codebase

**Status:** Planning Document  
**Audience:** Engineering Team, Technical Leads  
**Based On:** Conceptual Redesign (JOB_RECOMMENDATION_SYSTEM_REDESIGN.md) + Audit (JOB_RECOMMENDATION_PIPELINE_AUDIT.md)

---

## 1️⃣ MINIMUM VIABLE ARCHITECTURE SHIFT

### New Conceptual Stages Required

Based on the redesign, the system must introduce these distinct stages:

1. **Intent Normalization** - Extract and normalize user intent from onboarding data
2. **Hard Gate Pre-Filtering** - Exclude jobs that fail hard constraints before querying
3. **Intent-Driven Query Generation** - Build queries that embed location, career domain, and job type
4. **Candidate Universe Construction** - Aggregate and deduplicate jobs from multiple queries
5. **Hard Gate Post-Filtering** - Final hard gate check on fetched jobs (redundancy/validation)
6. **Scoring & Ranking** - Rank acceptable universe by fit signals (soft preferences)
7. **Feed Assembly** - Compile final feed with confidence signals and metadata

### Pipeline Diagram (Text Form)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT PIPELINE (BROKEN)                    │
└─────────────────────────────────────────────────────────────────┘

Request → get_user_career_profile()
           ↓
        build_personalized_queries() [❌ Location ignored, careerInterests ignored]
           ↓
        build_location_query() [❌ Uses request params, not user profile]
           ↓
        fetch_personalized_jobs()
           ├─ Parallel query execution (broad queries)
           └─ filter_jobs_by_quality() [Quality only, no intent gates]
           ↓
        score_jobs_by_resume_match() [Tries to fix mismatches with scoring]
           ↓
        Return jobs [Many irrelevant jobs included]


┌─────────────────────────────────────────────────────────────────┐
│                    NEW PIPELINE (INTENT-FIRST)                   │
└─────────────────────────────────────────────────────────────────┘

Request → get_user_career_profile() + normalize_intent()
           ↓
        construct_intent_contract()
           ├─ Extract: careerInterests, preferredLocation, jobTypes, graduationYear
           ├─ Normalize: Location hierarchies, career domain mapping, seniority boundaries
           └─ Validate: Missing data handling, ambiguity resolution
           ↓
        apply_hard_gates_pre_query() [NEW STAGE]
           ├─ Career domain gate (block wrong domains)
           ├─ Job type gate (block wrong types)
           ├─ Location gate (block wrong cities) - BUT this is embedded in queries now
           ├─ Seniority gate (block wrong levels) - BUT this is embedded in queries now
           └─ Note: Location/seniority gates now happen via query construction, not post-filter
           ↓
        build_intent_driven_queries() [REFACTORED]
           ├─ Location embedded per query (primary signal)
           ├─ Career interests drive keywords (primary signal)
           ├─ Job type embedded (primary signal)
           ├─ Major refines keywords (secondary signal)
           └─ Skills add specificity (tertiary signal)
           ↓
        fetch_jobs_with_intent_gates() [REFACTORED]
           ├─ Execute queries (location-specific, domain-specific)
           ├─ Aggregate results (deduplicate across queries)
           └─ Initial quality check (spam, description length)
           ↓
        apply_hard_gates_post_fetch() [NEW STAGE]
           ├─ Career domain validation (double-check query didn't leak)
           ├─ Job type validation (double-check)
           ├─ Location validation (double-check normalization worked)
           ├─ Seniority validation (double-check graduation year logic)
           └─ Quality gates (existing is_job_quality_acceptable)
           ↓
        construct_candidate_universe() [NEW STAGE]
           ├─ Count universe size
           ├─ Log universe composition (for debugging)
           └─ Handle sparse markets (<10 jobs)
           ↓
        score_acceptable_universe() [REFACTORED]
           ├─ Role fit (0-40 points) - Skills, major, experience
           ├─ Company signal (0-20 points) - Prestige, quality
           ├─ Resume alignment (0-25 points) - Skills coverage, experience match
           ├─ Timing (0-5 points) - Graduation alignment
           ├─ Location preference (0-5 points) - Within acceptable cities
           └─ Interest alignment (0-5 points) - Within acceptable domains
           ↓
        assemble_feed() [NEW STAGE]
           ├─ Apply feed size limits (20-50 jobs)
           ├─ Add confidence signals (high/medium/low match)
           ├─ Add metadata (universe size, query info, filters applied)
           └─ Handle edge cases (sparse markets, missing data)
           ↓
        Return feed [Only acceptable jobs, ranked by fit]
```

### Existing Functions → New Stages Mapping

| Existing Function | Current Location | Maps To New Stage | Status |
|-------------------|------------------|-------------------|--------|
| `get_user_career_profile()` | `job_board.py:743` | Intent Normalization | ✅ Keep, extend |
| `build_personalized_queries()` | `job_board.py:1288` | Intent-Driven Query Generation | ⚠️ Refactor completely |
| `build_location_query()` | `job_board.py:1522` | Intent-Driven Query Generation | ⚠️ Refactor (embed in queries) |
| `fetch_personalized_jobs()` | `job_board.py:3469` | Fetch Jobs + Candidate Universe | ⚠️ Refactor |
| `filter_jobs_by_quality()` | `job_board.py:1993` | Hard Gate Post-Filtering | ✅ Keep, extend |
| `is_job_quality_acceptable()` | `job_board.py:1944` | Hard Gate Post-Filtering | ✅ Keep, extend |
| `score_job_for_user()` | `job_board.py:1650` | Score Acceptable Universe | ⚠️ Refactor (remove mismatch fixing) |
| `score_jobs_by_resume_match()` | `job_board.py:2027` | Score Acceptable Universe | ⚠️ Refactor |

### New Functions Required

| New Function | Purpose | Stage | Priority |
|--------------|---------|-------|----------|
| `normalize_intent()` | Extract and normalize intent from user profile | Intent Normalization | P0 |
| `construct_intent_contract()` | Build intent contract (hard constraints vs soft preferences) | Intent Normalization | P0 |
| `apply_hard_gate_career_domain()` | Check if job matches career domain | Hard Gate Pre/Post | P0 |
| `apply_hard_gate_job_type()` | Check if job type matches user preference | Hard Gate Pre/Post | P0 |
| `apply_hard_gate_location()` | Check if job location matches preferredLocation | Hard Gate Post | P0 |
| `apply_hard_gate_seniority()` | Check if job seniority matches graduation year | Hard Gate Post | P0 |
| `build_location_embedded_queries()` | Generate queries with location embedded | Query Generation | P0 |
| `construct_candidate_universe()` | Aggregate, deduplicate, and size universe | Universe Construction | P1 |
| `assemble_feed()` | Final feed assembly with confidence signals | Feed Assembly | P1 |

---

## 2️⃣ REDESIGN CONCEPTS → EXISTING CODE MAPPING

### Concept 1: Career Domain Hard Gate

**Current Implementation:**
- **Location:** `calculate_field_affinity()` in `job_board.py:1576`
- **Current Behavior:** Returns 0.0-1.0 affinity score, used in scoring (20 points max)
- **Called From:** `score_job_for_user()` at line 1688
- **Issue:** This is SOFT scoring, not HARD gating. Jobs with 0.15 affinity (Finance major → SWE job) still get 3 points and appear in results.

**Why Insufficient:**
- No hard rejection - all jobs get scored regardless of domain mismatch
- Field affinity is a multiplier (0.15 = weak match) but job still passes through
- Finance major can see SWE jobs if they score high on other signals (quality, company)

**Where It Should Live Conceptually:**
- **Pre-Query:** In query generation - don't query for wrong domains
  - File: `job_board.py` (refactor `build_personalized_queries()`)
  - Function: Should filter query keywords by career domain
  - Example: Finance major → Don't generate "software engineer" queries
  
- **Post-Fetch:** In hard gate validation - reject jobs from wrong domains
  - File: `job_board.py` (new function `apply_hard_gate_career_domain()`)
  - Function: Should reject jobs that don't match career domain
  - Called from: `fetch_personalized_jobs()` after job aggregation, before scoring
  - Example: If query somehow returned SWE job for Finance major, reject it here

**Boundary:** 
- Hard gate should reject jobs with field_affinity < 0.3 (weak threshold)
- OR: Use explicit domain mapping (Finance → finance/banking domain, reject tech domain)

---

### Concept 2: Job Type Hard Gate

**Current Implementation:**
- **Location:** `build_personalized_queries()` at line 1300 - job type used as query prefix
- **Current Behavior:** Adds "internship" or "entry level" prefix to queries
- **Also:** `score_job_for_user()` at line 1682 - checks job type match for 5 points
- **Issue:** Job type is used in query (good) but also checked in scoring (redundant). More importantly, if query returns wrong type job, it still gets scored (just loses 5 points).

**Why Insufficient:**
- Job type is embedded in query prefix, but SerpAPI may return mismatched jobs
- Post-fetch, there's no hard gate - wrong type jobs get scored (just lower)
- User wants ONLY internships, but full-time jobs can still appear if they score high

**Where It Should Live Conceptually:**
- **Pre-Query:** Already exists (job type in query prefix) ✅
  - File: `job_board.py` (in `build_personalized_queries()`)
  - Function: Lines 1300-1304 - job type becomes query prefix
  - Status: Working, but could be more explicit (e.g., "-full-time" exclusion)
  
- **Post-Fetch:** NEW hard gate needed
  - File: `job_board.py` (new function `apply_hard_gate_job_type()`)
  - Function: Should reject jobs if `job.type` doesn't match `user_profile.job_types`
  - Called from: `filter_jobs_by_quality()` or new `apply_hard_gates_post_fetch()` wrapper
  - Example: User wants ["Internship"] but job.type = "Full-Time" → REJECT

**Boundary:**
- Hard gate: Exact match required (or normalized match: "internship" = "summer analyst" = "co-op")
- If user wants ["Internship", "Full-Time"], allow both
- Remove job type from scoring (redundant if gate works)

---

### Concept 3: Location Hard Gate

**Current Implementation:**
- **Location:** `build_location_query()` at line 1522
- **Current Behavior:** Takes `locations` from request parameters, returns single location string
- **Called From:** `fetch_personalized_jobs()` at line 3491
- **Issue:** `locations` comes from API request, NOT from user profile `preferredLocation`. User's saved location preference is NEVER used.

**Why Insufficient:**
- `preferredLocation` saved in `users/{uid}.location.preferredLocation` but never read
- `build_location_query()` uses `locations` parameter (from request), not user profile
- No post-fetch location validation - jobs in wrong cities get scored

**Where It Should Live Conceptually:**
- **Pre-Query:** PRIMARY - Location embedded in EVERY query
  - File: `job_board.py` (refactor `build_personalized_queries()`)
  - Function: Should read `preferredLocation` from user profile, generate per-location queries
  - Example: `preferredLocation = ["NYC", "SF"]` → Generate separate queries for each city
  - Current: `build_location_query()` only used once, should be called per query
  
- **Post-Fetch:** Secondary validation
  - File: `job_board.py` (new function `apply_hard_gate_location()`)
  - Function: Should reject jobs not in `preferredLocation` OR remote
  - Called from: After job fetch, before scoring
  - Example: Job in Chicago but user wants NYC/SF → REJECT (unless remote)

**Boundary:**
- Hard gate: Job location must match `preferredLocation` (with normalization: "New York, NY" = "Manhattan, NY")
- Exception: Remote jobs always pass (location-agnostic)
- If `preferredLocation = []`, no constraint (allow all locations)

**Critical Fix Needed:**
- `get_user_career_profile()` must read `preferredLocation` from `location.preferredLocation`
- `build_personalized_queries()` must use profile's `preferredLocation`, not request params
- Each query must be location-specific (not one location for all queries)

---

### Concept 4: Seniority / Graduation Timing Gate

**Current Implementation:**
- **Location:** `score_job_for_user()` at lines 1790-1801
- **Current Behavior:** Graduation timing gives 0-2 points in scoring (soft signal)
- **Also:** `get_user_career_profile()` at lines 794-800 extracts graduation year
- **Issue:** Seniority is SOFT scoring only - senior roles can appear for sophomores if they score high elsewhere.

**Why Insufficient:**
- No hard gate - "Senior Analyst" jobs can appear for sophomores
- Graduation timing is only 2 points (minimal impact)
- Job titles like "Senior", "Lead", "Principal" are not filtered before scoring

**Where It Should Live Conceptually:**
- **Pre-Query:** Embedded in query generation - exclude seniority terms
  - File: `job_board.py` (refactor `build_personalized_queries()`)
  - Function: Should exclude seniority keywords from queries based on graduation year
  - Example: Sophomore (2027) → Queries exclude "Senior", "Lead", "Principal"
  - Logic: Years until graduation > 1 → Only "internship", "junior", "entry level" terms
  
- **Post-Fetch:** Hard gate validation
  - File: `job_board.py` (new function `apply_hard_gate_seniority()`)
  - Function: Should reject jobs with seniority keywords that don't match graduation year
  - Called from: After job fetch, before scoring
  - Example: Job title contains "Senior" but user is sophomore → REJECT

**Boundary:**
- Hard gate: Extract seniority from job title ("Senior", "Lead", "Manager", "Principal", "Director")
- Compare to graduation year: years_until_grad > 1 → Block senior roles
- Keep graduation timing in scoring (minor boost, 2 points) but remove from hard gate responsibility

---

### Concept 5: Candidate Job Universe

**Current Implementation:**
- **Location:** `fetch_personalized_jobs()` at line 3469
- **Current Behavior:** Fetches jobs, filters by quality, scores, returns top N
- **Issue:** No concept of "universe" - just fetch, filter, score, return. No size tracking, no sparse market handling, no universe composition logging.

**Why Insufficient:**
- Can't detect sparse markets (<10 jobs)
- Can't provide transparency to users ("We found X jobs matching your criteria")
- No guardrails for over-filtering
- No fallback strategy when universe is too small

**Where It Should Live Conceptually:**
- **New Stage:** After hard gate post-filtering, before scoring
  - File: `job_board.py` (new function `construct_candidate_universe()`)
  - Function: Should aggregate filtered jobs, count universe, log composition, handle sparse markets
  - Called from: `fetch_personalized_jobs()` after `apply_hard_gates_post_fetch()`
  - Returns: Universe dict with {jobs, size, composition, sparse_market_flag}

**Responsibilities:**
1. Count universe size
2. Log composition (career domains, locations, companies, job types)
3. Detect sparse markets (<10 jobs)
4. Trigger fallback suggestions if sparse (but require user opt-in)
5. Return metadata for feed assembly (transparency)

**Boundary:**
- Universe = jobs that passed all hard gates
- Size tracking happens here (not in scoring)
- Sparse market detection triggers user-facing messages
- But don't auto-relax gates - require user opt-in

---

### Concept 6: Query Generation Hierarchy

**Current Implementation:**
- **Location:** `build_personalized_queries()` at line 1288
- **Current Hierarchy (Current):**
  1. Major (Query 1, weight 1.2) - PRIMARY
  2. Skills (Query 2, weight 1.1) - SECONDARY
  3. Extracurriculars (Query 3, weight 1.15) - SECONDARY
  4. Target industries (Query 4, weight 1.0) - TERTIARY
  5. Interests (Query 5, weight 1.0) - TERTIARY (only first interest)
  6. Top companies (Query 6, weight 1.25) - SPECIAL
- **Location:** `build_location_query()` at line 1522 - Single location for all queries
- **Issue:** Location is separate, not embedded. Career interests not used in queries (only scoring). Job type is prefix but not enforced in query logic.

**Why Insufficient:**
- Location applied once to all queries (not per-query)
- Career interests ignored in query generation (only used in scoring)
- Query hierarchy doesn't reflect intent priority (location and career interests should be PRIMARY)

**Where It Should Live Conceptually:**
- **Refactored Function:** `build_intent_driven_queries()` (rename/refactor `build_personalized_queries()`)
  - File: `job_board.py`
  - New Hierarchy:
    1. **Location (PRIMARY)** - Generate separate queries per location
    2. **Career Interests (PRIMARY)** - Drive keywords in every query
    3. **Job Type (PRIMARY)** - Embedded in every query
    4. **Major (SECONDARY)** - Refines keywords
    5. **Skills (SECONDARY)** - Adds specificity
    6. **Top Companies (TERTIARY)** - Quality signal

**New Query Structure:**
```
For each location in preferredLocation:
  For each career interest (or major if no interests):
    Query = f"{job_type} {career_interest_keywords} {major_keywords} {top_companies}"
    Location = specific_location
```

**Boundary:**
- Queries are location-specific (not one location for all)
- Career interests drive primary keywords (not just major)
- Job type is embedded (not just prefix)
- Fallback: If no career interests, use major-based inference

---

### Concept 7: Scoring Responsibilities

**Current Implementation:**
- **Location:** `score_job_for_user()` at line 1650
- **Current Responsibilities:**
  - Base relevance (20 points) - includes job type check
  - Field/major affinity (20 points) - domain matching
  - Skills match (30 points)
  - Experience relevance (15 points)
  - Additional signals (15 points) - interests, ECs, timing, industry
- **Issue:** Scoring tries to "fix" mismatches (e.g., low field affinity = 3 points, but job still shown). Scoring should only rank acceptable jobs, not determine if job is acceptable.

**Why Insufficient:**
- Scoring includes signals that should be hard gates (job type, domain mismatch)
- Low scores don't exclude jobs - they just rank lower
- Scoring tries to compensate for mismatches instead of hard gates preventing them

**Where It Should Live Conceptually:**
- **Refactored Function:** `score_acceptable_universe()` (refactor `score_job_for_user()`)
  - File: `job_board.py`
  - New Responsibilities (assumes all jobs passed hard gates):
    1. **Role Fit (0-40 points)** - Skills, major alignment, experience relevance
    2. **Company Signal (0-20 points)** - Prestige, quality, target company status
    3. **Resume Alignment (0-25 points)** - Skills coverage, experience match, projects
    4. **Timing (0-5 points)** - Graduation alignment (minor boost)
    5. **Location Preference (0-5 points)** - Within acceptable cities (NYC vs SF)
    6. **Interest Alignment (0-5 points)** - Within acceptable domains (IB vs PE)

**Removed from Scoring:**
- Job type match (hard gate responsibility)
- Career domain match (hard gate responsibility)
- Location match (hard gate responsibility)
- Seniority check (hard gate responsibility)

**Boundary:**
- Scoring only ranks jobs that passed all hard gates
- Low scores (<40) = "lower priority but still acceptable"
- High scores (70+) = "strong match, high confidence"
- Never use scoring to exclude jobs (that's hard gate job)

---

## 3️⃣ PHASE-BY-PHASE IMPLEMENTATION

### Phase 1: Fix Intent Plumbing (Foundation)

**Goal:** Ensure user intent signals flow correctly from onboarding to job matching.

**What Changes Logically:**
1. **Fix `get_user_career_profile()` to read all intent fields:**
   - Read `preferredLocation` from `location.preferredLocation` (currently never read)
   - Read `careerInterests` from `location.interests` OR `location.careerInterests` (currently path mismatch)
   - Read `jobTypes` from `location.jobTypes` (currently reads from top-level, inconsistent)
   - Extract `graduationYear` and `graduationMonth` correctly (handle "May 2026" format)

2. **Create `normalize_intent()` function:**
   - Extract intent contract from user profile
   - Normalize location hierarchies (NYC = Manhattan + Brooklyn, etc.)
   - Map career interests to canonical domains (Finance → finance/banking domain)
   - Handle missing data with sensible defaults

3. **Add logging for intent extraction:**
   - Log what intent signals were found
   - Log what signals are missing
   - Log normalization decisions (for debugging)

**User-Visible Improvement:**
- No immediate change (foundation work)
- But enables all subsequent phases
- Users won't see improvement yet, but system now has correct intent data

**Failure Modes Reduced:**
- ✅ `preferredLocation` now accessible (was never read before)
- ✅ `careerInterests` now accessible (was path mismatch before)
- ✅ Intent data flows correctly (was broken plumbing before)

**Backwards Compatibility:**
- ✅ Existing API responses unchanged
- ✅ Only internal data extraction improved
- ✅ No breaking changes to request/response format

**Risk Level:** LOW - Internal refactoring, no behavior changes yet

---

### Phase 2: Enforce Hard Gates (Trust Foundation)

**Goal:** Introduce hard gates that prevent wrong jobs from being shown.

**What Changes Logically:**
1. **Create hard gate functions:**
   - `apply_hard_gate_career_domain(job, intent_contract)` - Reject wrong domains
   - `apply_hard_gate_job_type(job, intent_contract)` - Reject wrong job types
   - `apply_hard_gate_location(job, intent_contract)` - Reject wrong locations
   - `apply_hard_gate_seniority(job, intent_contract)` - Reject wrong seniority

2. **Integrate hard gates into `fetch_personalized_jobs()`:**
   - After job aggregation, before scoring
   - Apply all hard gates sequentially
   - Log rejected jobs (for debugging and metrics)
   - Count rejections by gate type

3. **Refactor `filter_jobs_by_quality()` to include intent gates:**
   - Existing quality gates (spam, description length) stay
   - Add intent gates (domain, type, location, seniority)
   - Return filtered jobs + rejection stats

4. **Update scoring to remove redundant checks:**
   - Remove job type check from `score_job_for_user()` (hard gate handles it)
   - Keep field affinity in scoring but raise threshold (0.3 minimum, not 0.15)
   - Remove location check from scoring (hard gate handles it)

**User-Visible Improvement:**
- ✅ **Dramatically fewer wrong jobs** - Finance majors no longer see SWE jobs
- ✅ **Location respect** - Jobs only in preferred cities (or remote)
- ✅ **Job type respect** - Internship seekers only see internships
- ✅ **Seniority respect** - Sophomores don't see Senior roles

**Failure Modes Reduced:**
- ✅ Career domain mismatches eliminated (was: Finance major seeing SWE jobs)
- ✅ Location mismatches eliminated (was: NYC seeker seeing Chicago jobs)
- ✅ Job type mismatches eliminated (was: Internship seeker seeing full-time)
- ✅ Seniority mismatches eliminated (was: Sophomore seeing Senior roles)

**Backwards Compatibility:**
- ✅ API response format unchanged (still returns jobs list)
- ✅ Only job content changes (fewer, more relevant jobs)
- ⚠️ **Feed size may decrease** (by design - quality over quantity)

**Risk Level:** MEDIUM - Behavior changes, but only removes bad jobs (safer than adding)

**Guardrails:**
- Monitor feed size - if <10 jobs for many users, investigate over-filtering
- Log all rejections - track which gates reject most jobs
- A/B test if possible - compare old vs new feed quality

---

### Phase 3: Redesign Query Generation (Efficiency & Precision)

**Goal:** Generate queries that embed location and career interests, reducing wasted API calls.

**What Changes Logically:**
1. **Refactor `build_personalized_queries()` to `build_intent_driven_queries()`:**
   - **Location embedded:** Generate separate queries per location (not one location for all)
   - **Career interests drive keywords:** Use `careerInterests` as PRIMARY signal (not just major)
   - **Job type embedded:** More explicit job type terms in queries
   - **Query hierarchy changed:** Location + Career Interests = PRIMARY, Major = SECONDARY

2. **Refactor `build_location_query()`:**
   - Remove (location now embedded per query)
   - OR: Rename to `get_location_for_query()` and call per query

3. **Update `fetch_personalized_jobs()`:**
   - Execute location-specific queries (not one location for all)
   - Aggregate results with location metadata
   - Fewer API calls needed (queries are more targeted)

4. **Add query metadata logging:**
   - Log which queries were generated
   - Log which queries returned jobs
   - Log location coverage (did we query all preferred locations?)

**User-Visible Improvement:**
- ✅ **More relevant jobs fetched** - Queries target user's actual interests and locations
- ✅ **Faster results** - Fewer API calls (more targeted queries)
- ✅ **Better location coverage** - Jobs from all preferred cities (not just one)

**Failure Modes Reduced:**
- ✅ Location ignored in queries (was: All queries used "United States", now: Per-city queries)
- ✅ Career interests ignored in queries (was: Only major used, now: Interests drive keywords)
- ✅ Wasted API calls (was: Broad queries return many irrelevant jobs, now: Targeted queries)

**Backwards Compatibility:**
- ✅ API response format unchanged
- ✅ Jobs still returned in same structure
- ⚠️ **Query execution changes** (internal, but may affect cache keys)

**Risk Level:** MEDIUM-HIGH - Query generation is core logic, but changes are isolated to query building

**Guardrails:**
- Monitor API call volume - should decrease (more targeted queries)
- Monitor cache hit rates - may change (different query structure)
- Test with various user profiles - ensure queries generate correctly
- Fallback: If new query generation fails, fall back to old logic (feature flag)

---

### Phase 4: Simplify Scoring & Add Universe Construction (Polish)

**Goal:** Refactor scoring to only rank acceptable jobs, add universe tracking and feed assembly.

**What Changes Logically:**
1. **Create `construct_candidate_universe()` function:**
   - Aggregate jobs that passed all hard gates
   - Count universe size
   - Log composition (domains, locations, companies, types)
   - Detect sparse markets (<10 jobs)
   - Return universe metadata

2. **Refactor `score_job_for_user()` to `score_acceptable_universe()`:**
   - Remove redundant checks (job type, location, domain - handled by gates)
   - Focus on: Role fit, company signal, resume alignment, timing, preferences
   - Simplify scoring logic (fewer edge cases)

3. **Create `assemble_feed()` function:**
   - Apply feed size limits (20-50 jobs)
   - Add confidence signals (high/medium/low match based on scores)
   - Add metadata (universe size, filters applied, query info)
   - Handle sparse markets (show message, suggest broadening)
   - Handle missing data (graceful degradation messages)

4. **Update API response:**
   - Add `feed_metadata` field (universe size, confidence signals, filters)
   - Add `sparse_market` flag (if universe <10 jobs)
   - Add `suggestions` field (if sparse market, suggest relaxations)

**User-Visible Improvement:**
- ✅ **Transparency** - Users see "We found X jobs matching your criteria"
- ✅ **Confidence signals** - Jobs marked as "Strong Match", "Good Match", etc.
- ✅ **Sparse market handling** - Users informed if market is sparse, with suggestions
- ✅ **Feed quality** - Only 20-50 jobs shown (curated, not overwhelming)

**Failure Modes Reduced:**
- ✅ Over-filtering (was: No detection, now: Sparse market detection + suggestions)
- ✅ Missing data (was: Silent failures, now: Graceful degradation messages)
- ✅ Unclear ranking (was: Scores unclear, now: Confidence signals explain ranking)

**Backwards Compatibility:**
- ⚠️ **API response extended** (new fields added, but old fields still present)
- ✅ Jobs list structure unchanged
- ⚠️ **Feed size may change** (20-50 jobs instead of 50-150, but this is improvement)

**Risk Level:** LOW-MEDIUM - Mostly additive (new metadata), scoring refactor is simplification (less risky)

**Guardrails:**
- Monitor feed size - ensure it's reasonable (20-50 jobs)
- Monitor sparse market frequency - if too common, investigate over-filtering
- Test confidence signals - ensure they align with scores
- A/B test if possible - compare user engagement with/without confidence signals

---

## 4️⃣ SUCCESS METRICS PER PHASE

### Phase 1: Fix Intent Plumbing

**Metrics to Improve:**
- **Intent Signal Extraction Rate:**
  - % of users with `preferredLocation` successfully extracted (target: 95%+)
  - % of users with `careerInterests` successfully extracted (target: 90%+)
  - % of users with valid `graduationYear` extracted (target: 98%+)

**Logs/Signals:**
- Log intent extraction: `[Intent] Extracted preferredLocation: ['NYC', 'SF'] from user {uid}`
- Log missing signals: `[Intent] WARNING: preferredLocation missing for user {uid}, using default`
- Log normalization: `[Intent] Normalized 'New York' → 'New York, NY'`

**Regressions to Watch:**
- ❌ Intent extraction rate drops (<90%)
- ❌ Null/empty values in intent fields (should be rare)
- ❌ Normalization errors (location mismatches, domain mismatches)

**Validation:**
- Unit tests: Test `normalize_intent()` with various user profiles
- Integration tests: Test `get_user_career_profile()` returns correct intent
- Manual testing: Check logs for 10-20 users, verify intent extracted correctly

---

### Phase 2: Enforce Hard Gates

**Metrics to Improve:**
- **Trust Violations (Primary Metric):**
  - % of jobs shown that fail hard gates (target: <1%)
  - Career domain mismatch rate (target: 0%)
  - Location mismatch rate (target: 0% when preferredLocation specified)
  - Job type mismatch rate (target: 0%)
  - Seniority mismatch rate (target: 0%)

- **Feed Relevance:**
  - Average match score (should increase, as irrelevant jobs removed)
  - % of jobs with match score >60 (target: 70%+, up from ~40%)

- **Feed Size:**
  - Average jobs per feed (target: 20-50, may decrease from current)
  - % of users with <10 jobs (target: <5%, indicates over-filtering)

**Logs/Signals:**
- Log gate rejections: `[HardGate] REJECTED job {job_id}: career_domain mismatch (Finance major, SWE job)`
- Log gate stats: `[HardGate] Stats: domain_rejected=15, type_rejected=8, location_rejected=23, seniority_rejected=5`
- Log feed composition: `[Feed] User {uid}: 32 jobs, avg_score=72, domain=Finance, locations=['NYC','SF']`

**Regressions to Watch:**
- ❌ Feed size drops too low (<5 jobs for >10% of users) - indicates over-filtering
- ❌ Hard gate rejection rate >50% - indicates query generation issues
- ❌ Match scores don't increase - indicates gates not working or scoring broken

**Validation:**
- Manual spot checks: Review 50 feeds, verify no wrong-domain/location/type jobs
- A/B test: Compare old vs new feeds, measure user engagement
- Log analysis: Track rejection rates, ensure they're reasonable (<20% rejection rate)

---

### Phase 3: Redesign Query Generation

**Metrics to Improve:**
- **API Efficiency:**
  - Average API calls per feed (target: decrease 30-50% due to targeted queries)
  - Cache hit rate (may change, monitor)
  - Jobs per API call (should increase, as queries more targeted)

- **Query Quality:**
  - % of queries that return 0 jobs (target: <10%, indicates over-specific queries)
  - % of jobs from wrong location (target: 0% when preferredLocation specified)
  - % of jobs from wrong domain (target: <5%, down from ~20%)

- **Location Coverage:**
  - % of preferred locations queried (target: 100% - all user locations queried)
  - Jobs per location (should be balanced across preferred locations)

**Logs/Signals:**
- Log query generation: `[QueryGen] Generated 4 queries for user {uid}: ['internship investment banking NYC', 'internship investment banking SF', ...]`
- Log query results: `[QueryGen] Query 'internship investment banking NYC' returned 12 jobs`
- Log location coverage: `[QueryGen] User {uid} preferredLocation=['NYC','SF'], queried both locations`

**Regressions to Watch:**
- ❌ API calls increase (should decrease)
- ❌ Query generation fails (should always generate at least 1 query)
- ❌ Location coverage <100% (should query all preferred locations)
- ❌ Cache hit rate drops dramatically (indicates query structure changed too much)

**Validation:**
- Unit tests: Test `build_intent_driven_queries()` with various user profiles
- Integration tests: Test queries execute correctly, return jobs
- Log analysis: Review query logs for 100+ users, verify location embedding works
- API monitoring: Track SerpAPI usage, verify decrease in calls

---

### Phase 4: Simplify Scoring & Universe Construction

**Metrics to Improve:**
- **Feed Quality:**
  - Average confidence score (target: >70, as only acceptable jobs scored)
  - % of jobs marked "Strong Match" (score 70+) (target: 50%+, up from ~20%)
  - Feed size consistency (target: 20-50 jobs for 80% of users)

- **User Transparency:**
  - % of users who see universe size metadata (target: 100%)
  - % of sparse markets detected correctly (target: 95%+)
  - User engagement with suggestions (if sparse market) (target: 20%+ click-through)

- **Scoring Efficiency:**
  - Scoring time per job (should decrease, as simpler logic)
  - Scoring time per feed (should decrease, as fewer jobs to score)

**Logs/Signals:**
- Log universe construction: `[Universe] User {uid}: universe_size=32, composition={domain:'Finance', locations:['NYC','SF'], companies:['Goldman','JP Morgan']}`
- Log sparse markets: `[Universe] WARNING: Sparse market detected for user {uid}, universe_size=5`
- Log feed assembly: `[Feed] User {uid}: assembled 25 jobs, avg_score=75, confidence_distribution={high:12, medium:10, low:3}`

**Regressions to Watch:**
- ❌ Feed size inconsistent (too many <10 or >100 job feeds)
- ❌ Confidence signals don't align with scores (e.g., low score marked "Strong Match")
- ❌ Sparse market detection false positives (>10% of users flagged incorrectly)
- ❌ Scoring time increases (should decrease with simplification)

**Validation:**
- Manual testing: Review 20 feeds, verify confidence signals make sense
- Log analysis: Check universe sizes, ensure they're reasonable
- User testing: Survey users on feed relevance, confidence signals helpfulness
- Performance testing: Measure scoring time, ensure it's faster

---

## 5️⃣ FINAL RISK ASSESSMENT

### Top 5 Risks in Implementing This Redesign

#### Risk 1: Over-Filtering (Feed Size Too Small)

**Risk Level:** MEDIUM-HIGH  
**Impact:** Users see <5 jobs, think system is broken, lose engagement

**Why It's Risky:**
- Hard gates are strict (career domain, location, job type, seniority)
- Combined, they may filter out too many jobs
- Sparse markets (e.g., IB internships in specific cities) naturally have few jobs
- If gates are too strict, even sparse markets become empty

**Mitigation:**
- **Phase 2:** Monitor feed size closely, set alert if <10 jobs for >10% of users
- **Phase 4:** Implement sparse market detection, show transparent messages
- **Guardrail:** If universe <10 jobs, trigger fallback suggestions (user opt-in)
- **Rollback Plan:** Feature flag to disable specific gates if needed

**Safest Approach:**
- Start with lenient gate thresholds (e.g., field_affinity >0.2, not >0.3)
- Gradually tighten based on metrics
- Always allow user to opt-in to relaxation

---

#### Risk 2: Query Generation Breaks (No Jobs Returned)

**Risk Level:** MEDIUM  
**Impact:** Users see empty feeds, system appears broken

**Why It's Risky:**
- Phase 3 refactors core query generation logic
- New location-embedded queries may not work with SerpAPI
- Career interest keywords may not match job posting terminology
- Query structure changes may break caching

**Mitigation:**
- **Phase 3:** Implement feature flag, fallback to old query generation
- **Testing:** Extensive integration tests with real SerpAPI (or mocked)
- **Monitoring:** Alert if query generation returns 0 jobs for >5% of users
- **Gradual Rollout:** A/B test new query generation (10% → 50% → 100%)

**Safest Approach:**
- Keep old query generation as fallback
- Test new queries extensively before switching
- Monitor API response rates closely during rollout

---

#### Risk 3: Location Normalization Failures

**Risk Level:** MEDIUM  
**Impact:** Jobs in correct cities rejected, or jobs in wrong cities accepted

**Why It's Risky:**
- Location normalization is complex (NYC = Manhattan + Brooklyn, SF = SF city only)
- User may specify "New York" but jobs posted as "Manhattan, NY"
- Location hierarchies need careful mapping
- Edge cases: Metro areas, suburbs, remote jobs

**Mitigation:**
- **Phase 1:** Build comprehensive location normalization mapping
- **Testing:** Test with 100+ location variations
- **Logging:** Log all location normalizations, review for errors
- **Fallback:** If normalization uncertain, be lenient (allow job through)

**Safest Approach:**
- Start with exact matches only, gradually add normalization
- Use geocoding APIs for location matching (more accurate)
- Log all normalizations for manual review

---

#### Risk 4: Career Domain Mapping Too Strict

**Risk Level:** MEDIUM  
**Impact:** Valid adjacent jobs rejected (e.g., FinTech SWE rejected for Finance major)

**Why It's Risky:**
- Career domain mapping is binary (Finance vs Tech), but reality is nuanced
- FinTech, EdTech, HealthTech are cross-domain
- Some majors are interdisciplinary (e.g., "Data Science and Economics")
- Too strict = reject valid jobs, too lenient = allow wrong jobs

**Mitigation:**
- **Phase 2:** Start with lenient thresholds (adjacent domains allowed)
- **Domain Mapping:** Build explicit adjacent domain rules (Finance → FinTech OK, Finance → Pure SWE not OK)
- **User Override:** Allow users to specify "Also interested in [adjacent domain]"
- **Logging:** Track domain rejections, review edge cases

**Safest Approach:**
- Use explicit domain mapping (not fuzzy matching)
- Allow adjacent domains (Finance → FinTech, CS → FinTech)
- Block clear mismatches only (Finance → Pure SWE)

---

#### Risk 5: Backwards Compatibility Breaks

**Risk Level:** LOW-MEDIUM  
**Impact:** Frontend breaks, API clients break, user experience degrades

**Why It's Risky:**
- API response format may change (new fields, different structure)
- Feed size changes may break frontend pagination
- Confidence signals require frontend changes
- Caching may break if query structure changes

**Mitigation:**
- **All Phases:** Maintain backwards-compatible API responses
- **Phase 4:** Add new fields (feed_metadata) but don't remove old fields
- **Frontend Coordination:** Coordinate with frontend team on feed size changes
- **Versioning:** Consider API versioning if breaking changes needed

**Safest Approach:**
- Additive changes only (new fields, not removing old)
- Feature flags for new behavior (can roll back)
- Gradual rollout (10% → 50% → 100%)

---

### Safest Parts to Change First

**1. Phase 1: Intent Plumbing (LOWEST RISK)**
- ✅ Internal refactoring only
- ✅ No behavior changes
- ✅ Easy to test (unit tests)
- ✅ Easy to roll back (no user impact)
- **Start Here**

**2. Phase 2: Hard Gates - Quality Gates (LOW RISK)**
- ✅ Quality gates already exist (`is_job_quality_acceptable`)
- ✅ Just extending existing logic
- ✅ Only removes bad jobs (safer than adding)
- **Second Priority**

**3. Phase 2: Hard Gates - Intent Gates (MEDIUM RISK)**
- ⚠️ New logic, but only removes jobs (safer)
- ⚠️ Need careful testing (ensure not over-filtering)
- **Third Priority**

**4. Phase 4: Universe Construction (LOW-MEDIUM RISK)**
- ✅ Mostly additive (new metadata)
- ⚠️ Feed assembly changes behavior (size limits)
- **Fourth Priority**

**5. Phase 3: Query Generation (HIGHEST RISK)**
- ⚠️ Core logic refactor
- ⚠️ May break job fetching entirely
- ⚠️ Need extensive testing
- **Last Priority** (but highest impact)

---

### Parts Requiring Most Testing/Guardrails

**1. Query Generation (Phase 3)**
- **Why:** Core logic, affects all job fetching
- **Testing Needed:**
  - Unit tests: Query generation with various user profiles
  - Integration tests: Real SerpAPI calls (or mocked)
  - Load tests: Ensure query execution doesn't break under load
  - Edge case tests: Missing data, ambiguous interests, empty locations
- **Guardrails:**
  - Feature flag with fallback to old logic
  - Monitoring: Alert if 0 jobs returned for >5% of users
  - Gradual rollout: 10% → 50% → 100%
  - Rollback plan: Switch back to old queries if issues

**2. Hard Gates (Phase 2)**
- **Why:** May over-filter, causing empty feeds
- **Testing Needed:**
  - Unit tests: Each gate with edge cases
  - Integration tests: Gate application on real jobs
  - Regression tests: Ensure valid jobs not rejected
  - Edge case tests: Adjacent domains, location variations, job type variations
- **Guardrails:**
  - Monitoring: Alert if feed size <10 for >10% of users
  - Lenient thresholds initially, tighten gradually
  - Feature flags per gate (can disable individually)
  - Logging: Track all rejections, review weekly

**3. Location Normalization (Phase 1)**
- **Why:** Complex, many edge cases
- **Testing Needed:**
  - Unit tests: 100+ location variations
  - Integration tests: Real job locations vs user preferences
  - Manual review: Test with real user data
- **Guardrails:**
  - Comprehensive location mapping (city → metro, variations)
  - Geocoding API for accuracy
  - Fallback: Be lenient if normalization uncertain
  - Logging: Track all normalizations for review

**4. Career Domain Mapping (Phase 2)**
- **Why:** Nuanced, risk of over/under-filtering
- **Testing Needed:**
  - Unit tests: Domain mapping for all major types
  - Edge case tests: Combined majors, adjacent domains, interdisciplinary
  - Manual review: Test with real user profiles
- **Guardrails:**
  - Explicit domain mapping (not fuzzy)
  - Adjacent domain rules (Finance → FinTech OK)
  - User override option (specify additional interests)
  - Logging: Track domain rejections, review weekly

**5. Feed Assembly (Phase 4)**
- **Why:** Affects user experience directly
- **Testing Needed:**
  - Unit tests: Feed size limits, confidence signals
  - Integration tests: End-to-end feed generation
  - User testing: Survey on feed quality, confidence signals
- **Guardrails:**
  - Feed size limits (20-50 jobs) with monitoring
  - Confidence signal validation (align with scores)
  - Sparse market detection (accurate, not false positives)
  - A/B testing: Compare old vs new feed engagement

---

## EXECUTION CHECKLIST

### Pre-Implementation

- [ ] Review this roadmap with engineering team
- [ ] Get alignment on phased approach
- [ ] Set up monitoring/alerting for key metrics
- [ ] Create feature flags infrastructure
- [ ] Set up A/B testing framework (if possible)

### Phase 1: Fix Intent Plumbing

- [ ] Implement `normalize_intent()` function
- [ ] Fix `get_user_career_profile()` to read all intent fields
- [ ] Add intent extraction logging
- [ ] Unit tests for intent normalization
- [ ] Integration tests for profile extraction
- [ ] Deploy and monitor intent extraction rates

### Phase 2: Enforce Hard Gates

- [ ] Implement hard gate functions (domain, type, location, seniority)
- [ ] Integrate gates into `fetch_personalized_jobs()`
- [ ] Add gate rejection logging
- [ ] Update scoring to remove redundant checks
- [ ] Unit tests for each gate
- [ ] Integration tests for gate application
- [ ] Deploy with feature flag (10% → 50% → 100%)
- [ ] Monitor feed size and rejection rates

### Phase 3: Redesign Query Generation

- [ ] Refactor `build_personalized_queries()` to `build_intent_driven_queries()`
- [ ] Implement location-embedded queries
- [ ] Implement career interest-driven keywords
- [ ] Add query metadata logging
- [ ] Unit tests for query generation
- [ ] Integration tests with SerpAPI (or mocked)
- [ ] Deploy with feature flag and fallback (10% → 50% → 100%)
- [ ] Monitor API call volume and query success rates

### Phase 4: Simplify Scoring & Universe Construction

- [ ] Implement `construct_candidate_universe()`
- [ ] Refactor `score_job_for_user()` to `score_acceptable_universe()`
- [ ] Implement `assemble_feed()` with confidence signals
- [ ] Update API response with metadata
- [ ] Unit tests for universe construction
- [ ] Unit tests for simplified scoring
- [ ] Integration tests for feed assembly
- [ ] Deploy and monitor feed quality metrics

### Post-Implementation

- [ ] Review metrics across all phases
- [ ] Conduct user testing/surveys
- [ ] Document learnings and edge cases
- [ ] Plan follow-up improvements
- [ ] Celebrate success! 🎉

---

**END OF EXECUTION ROADMAP**

