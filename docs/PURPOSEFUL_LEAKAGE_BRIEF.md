# Purposeful Leakage / Direction Looseness — Backend Implementation Brief

## Problem

The Profile page (`/profile`, rendered by `connect-grow-hire/src/pages/ProfilePreview.tsx`) now captures rich personalization data including:

- Structured fields the user explicitly sets: `extractedRoles`, `targetFirms`, `preferredLocations`, `userIndustries`, `careerTrack`, `recruitingCycle`
- Free-form narrative blurbs: `directionNarrative` ("what you're hunting for"), `personalContext` ("anything we missed"), `hardNos` ("what to filter out" — **brand new field**)
- Attached personal-context files (PDFs, essays, etc.) at `personalContextFiles`

**Current risk:** the job-ranking pipeline treats all these inputs as hard constraints. Users who type "I want IB at a tier-1 bank" in their direction narrative will only ever see IB roles at tier-1 banks, never a corporate-strategy role at a startup that could be a great fit. The exploration surface collapses to whatever the user has explicitly told us, killing serendipity.

The product instinct is: **personalization should sharpen the top of the feed but never close off the rest of it.** We want users to feel like the recommendations know them AND show them paths they hadn't considered.

## Three Principles to Enforce

### 1. Free-text narrative = soft semantic signal only, never a hard filter

- `directionNarrative`, `personalContext`, and `hardNos` are free-form text
- Use them as **embedding similarity boosts** during ranking (score adjustment), not as filters that drop jobs
- **Do not** auto-extract structured chips (roles, firms, locations) from narrative fields and silently promote them into `extractedRoles` / `targetFirms`. The user has the chip-row UI to do that explicitly; auto-promotion blurs the line between "the user said so" and "we guessed."
- `hardNos` is the one narrative field that CAN reduce scores aggressively — but still as a soft penalty (e.g. -0.3 to the composite score) rather than a hard drop, in case the parsing misinterprets a phrase.

### 2. Chip rows = user-owned hard signals

If a user explicitly types "Goldman" into their target firms chip row, they're saying "yes, optimize for this." That's an unambiguous signal — treat it as a hard boost. Same for `extractedRoles`, `preferredLocations`, `userIndustries`. These are intentional inputs and we should trust them.

The principle: **hard constraints come from typing-into-a-chip-row, never from narrative text.**

### 3. Reserve ~15–20% of the recommended feed for "stretch" / exploration jobs

Even with strong signals across the profile, the recommended feed should always contain some non-obvious jobs. These are:

- **Adjacent role** matches (similar function, different titles)
- **Adjacent industry** matches (e.g. user has "consulting" → show some "strategy at tech co" roles)
- **Wider geography** matches (user has "NYC" → show some Boston/SF roles)
- **Lower-match-score** jobs that the ranker scored 35–55% but might surprise the user

Right now the ranker takes the top 150 jobs by composite score and that's that. The "stretch" slots should be **carved out explicitly** — e.g. take top 130 by score + 20 from a different pool (lower-scored, semantically-adjacent, or random-from-target-industry).

The UI already supports two visible match tiers (`/components/jobs/JobCard.tsx`):
- Green "Strong fit" (60+)
- Blue "Similar to you" (30–59)

Below 30 is currently hidden. The stretch slots could surface some <30 jobs deliberately and label them appropriately, OR keep them as "Similar to you" but expand that tier's source pool.

## Files to Investigate

The job-ranking pipeline lives in:

- **`backend/app/routes/jobs.py`** — `/api/jobs/feed` endpoint. Contains the orchestration: prefilter → GPT-rank → feedback adjust → dedupe → cap → write to cache. Lines around 670–700 are the hot path.
- **`backend/app/utils/job_ranking.py`** — `prefilter_candidates(all_jobs, profile, top_n)` and `rank_with_gpt(candidates, profile)`. These two functions decide which jobs make it into the ranked pool and how they're scored.
- **`backend/app/utils/embedding_ranker.py`** — `embedding_rank(all_jobs, profile, uid, top_n)`. Feature-flag-gated alternative to the deterministic prefilter. This is where to plug in semantic similarity from narrative fields.
- **`backend/app/job_ranking_config.py`** — `get_active_profile()`. Contains the composite-score weights (relevance, landability, discovery, etc.). The "stretch slot" allocation could live here as a new tunable.
- **`backend/app/utils/intent_gates.py`** — `apply_intent_gates(jobs, user_intent)`. Gates jobs based on user intent. **This is currently where hard filtering happens** — be careful not to harden this further; the principle says narrative should never gate here.
- **`backend/pipeline/fetcher.py`** — upstream job pull. Probably no changes needed, but worth knowing it exists.

Frontend / display side (no changes expected, just for context):
- **`connect-grow-hire/src/pages/JobBoardPage.redesign.tsx`** — renders the recommended feed.
- **`connect-grow-hire/src/components/jobs/JobCard.tsx`** — match label tiers (Strong fit / Similar to you).

## Data Shape — what to read from Firestore

The user's profile lives at `users/{uid}` with these relevant fields:

```
{
  // Structured (hard signals)
  university: string,
  preferredJobRole: string,
  extractedRoles: string[],         // user-owned chip row
  targetFirms: string[],            // user-owned chip row
  dreamCompanies: string[],         // legacy/fallback for targetFirms
  preferredLocations: string[],
  targetIndustries: string[],
  careerTrack: string,
  recruitingCycle: string,
  cycleYear: number,

  // Free-form (soft signals — TREAT AS SUCH)
  directionNarrative: string,       // "what you're hunting for"
  personalContext: string,          // "anything the resume doesn't say"
  hardNos: string,                  // NEW — "what to filter out", suppression hints
  personalContextFiles: Array<{ name, url, storagePath, uploadedAt, contentType, size }>,
}
```

`personalContextFiles` is a list of uploaded essays/papers/docs the user attached. Worth considering whether to read these into the ranker context (likely via embeddings — they're stored in Cloud Storage; backend can fetch + chunk + embed).

## Suggested Implementation Order

1. **Add narrative soft-signal scoring**: in `embedding_rank` (or in a new helper called by `rank_with_gpt`), compute embeddings for `directionNarrative` + `personalContext` and use them to boost scores for semantically-similar jobs. The boost should be small enough that a user with a strong direction narrative + matching chips sees their top jobs but also still sees adjacent ones.

2. **Add `hardNos` soft-penalty**: parse the user's `hardNos` text (LLM extraction is fine — small model, cheap call, cache the parsed list per profile version) into a list of negative keywords. Penalize matching jobs (e.g. -0.3 composite) but do not drop.

3. **Carve out exploration slots in the final feed**: after the existing top-150 selection in `jobs.py`, reserve some slots (start with 15%) for jobs that are semantically adjacent but didn't make the top-150 cut. Could pull from:
   - Top-30 by `_embedding_score` among jobs scored 30–55%
   - Jobs in industries adjacent to the user's `targetIndustries`
   - Jobs in cities adjacent to the user's `preferredLocations`

4. **Do NOT auto-extract chips from narrative**: explicitly verify no code path reads `directionNarrative` and writes to `extractedRoles` / `targetFirms`. If one exists, remove it.

## Success Criteria

A user with a strong profile (everything filled, chip rows full, narrative blurbs written) should see:
- Top 60-70% of their recommended feed clearly fits their profile (Strong fit + most of Similar to you tier)
- Bottom 15-20% of recommended feed is "interesting but not obvious" — adjacent industries, adjacent roles, different geos
- Anything matching their `hardNos` list is suppressed but not gone (rank-penalized, surfaces only if otherwise excellent)
- No job in the feed has been there only because we auto-extracted chips from their narrative text

Instrument with a simple log per ranking call: `composition: top_strict=N, top_adjacent=N, narrative_boosted=N, hardnos_penalized=N`. Add to the cache write so you can audit retrospectively.

## Out of Scope

- Frontend changes — the UI already supports the two match tiers and the hidden-below-30 floor. The brief is about backend ranking only.
- `intent_gates.py` widening — don't add new gates here. Narrative should never gate.
- Removing existing structured chip fields — the chip rows are the user's hard signal and stay as-is.
- The `dismissedIds` / `negativeFeedback` collection — keep working as a hard filter (user explicitly dismissed = remove forever, separate concern from narrative).
- Touching the embedding cache TTL or storage strategy unless you find a real bug.

## Context Already Done (No Re-Work Needed)

The frontend Profile page is shipped:
- `/profile` route is live, protected, free-flow design
- `hardNos` field exists and persists to Firestore
- Home widget on `/dashboard` rotates CTAs through 7 tiers including all narrative gaps
- Match tiers in `JobCard.tsx` already use word labels (Strong fit / Similar to you) and hide < 30% scores
- Job pool was recently widened from 50 → 150 (`jobs.py`, top_n=150 in both embedding_rank and prefilter_candidates)

If the backend ranker starts reading `hardNos` and gets it wrong, the data shape is forgiving — the user can clear / edit the field at any time on `/profile`, and it's a simple string field in Firestore.

---

**Net ask for this work block:** make narrative fields a soft semantic input, leave chip rows as hard signals, and carve out ~15-20% of the feed for exploration jobs. Instrument the composition so we can tune from data.
