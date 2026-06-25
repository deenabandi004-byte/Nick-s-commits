# Job Board: Auto-Discover Alumni Contacts for Referral Drafts

## Context

Today the Offerloop job board has a referral email preview feature (`ReferralDraftModal`) that lets a student draft an outreach email **only to a contact already saved** in `users/{uid}/contacts/`. On most jobs, the student has no saved contact at that company — so the most valuable CTA on the job card (referral) dead-ends.

This plan expands the feature so that on any job where the student has no saved contact, the same modal can **auto-discover NEW contacts via PDL** based on `(job.company × student.school × job.title-or-careerTrack)`, present a short list of alumni at that company, and plumb the chosen one through the existing referral-email generation pipeline. The product hypothesis is that turning a dead-end CTA into a working two-click path (Find alumni → Draft email) is the highest-leverage extension of an already-shipped feature.

Offerloop already has every primitive needed: `search_contacts_from_prompt()` accepts company + school + title and is metered/cached, the relationship classifier already returns "moderate" for shared-school alumni, and the modal already handles Gmail-not-connected copy-paste fallback. The work is plumbing, not new infrastructure.

## Approach

Reuse the existing `ReferralDraftModal` and add a `mode: 'saved' | 'discovery'` prop. When mode is `discovery`, render a new `AlumniDiscoveryPanel` inside the modal that walks the student through: **Confirm → Results → Draft**. The Draft phase is the unchanged existing modal body. Persist discovered contacts to `users/{uid}/contacts/` **only when the student picks one to draft**, so PDL discoveries don't pollute the contacts list.

**Feature-flagged rollout.** Ship behind `DISCOVER_ALUMNI_ENABLED` env flag (default OFF). Ramp Pro tier first, then Free, after 48h of clean metrics. The referral area has had 5 commits in the last 30 days (`referral_email.py` v1→v3); a flag lets the team kill discovery without redeploy if it interacts badly with future polish.

**Cherry-picks accepted into scope** (from CEO review):
1. **Match-strength badge** on each discovered row (e.g., "Stanford '22 + IC Eng → strong" vs "Stanford alum, title differs → weak"). Server-side scoring helper in `alumni_discovery.py`.
2. **Negative-cache** the "no alumni at {company}" result for 7 days. Button on subsequent visits shows "Already checked — no alumni" instead of disappearing; saves repeat credit burn.

### UX flow

On a `JobRow` in `JobBoardPage.tsx`, branch the referral CTA on `job.referral_contact`:
- **Has saved contact** → "Draft referral to {firstName}" (existing behavior, unchanged).
- **No saved contact** → "Find alumni at {company}" with subtitle `Uses up to {N} credits` (N = tier max for discovery: Free 3, Pro 5, Elite 8). Disabled when `credits_remaining < 1`.

Clicking opens `ReferralDraftModal` in `discovery` mode → three phases inside the existing modal chrome:

1. **Confirm phase** — "Search PDL for alumni from {school} at {company} matching {title}? Uses up to {N} credits (0 if cached)." School and title render as editable chips so the student can drop the title filter. Buttons: `Search` / `Cancel`.
2. **Results phase** — up to N alumni rows: name, title, school year, LinkedIn link, email-availability badge. `Cached — 0 credits used` pill if cache hit. Each row has a `Draft email` button.
3. **Draft phase** — identical to today's draft view (subject/body editor, Open in Gmail, Copy, Regenerate). Back button returns to results so the student can pick a different alum without re-burning credits.

**Empty state** (no PDL results after relaxation): "No {school} alumni found at {company} for {title}. Try a saved contact or another company." Zero credits charged.

**No school on profile** → first click opens inline prompt: "Add your school to find alumni at companies" with deep link to onboarding (`OnboardingAcademics.tsx`). Do NOT silently drop the school filter — it's the entire product wedge.

### Modal state machine

```
                           mode='saved'
JobRow click ──────────────────────────────────────▶ Draft view (existing)
   │
   │ mode='discovery'
   ▼
┌──────────┐  search  ┌──────────┐  select  ┌──────────┐  commit  ┌──────────┐
│ Confirm  │ ───────▶ │ Results  │ ───────▶ │  Draft   │ ───────▶ │  Gmail   │
│  phase   │ ◀─ back  │  phase   │ ◀─ back  │  phase   │          │  open    │
└──────────┘          └──────────┘          └──────────┘          └──────────┘
   │                      │                      │
   │ no-school            │ empty results        │ Gmail not connected
   ▼                      ▼                      ▼
Onboarding redirect   Empty state copy +    Copy-paste fallback
                      negative-cache write   (existing pattern)
```

### Backend: two new endpoints

Add two new endpoints in `backend/app/routes/job_board.py` rather than overloading `/job-board/referral-draft`. The existing endpoint has different credit semantics, tier limits, and failure modes — overloading entangles two flows that should stay separable.

**`POST /api/job-board/discover-alumni`**
- Decorators (order matters — `@require_tier` MUST precede `@require_firebase_auth` per CLAUDE.md):
  ```python
  @job_board_bp.route('/discover-alumni', methods=['POST'])
  @require_tier(['free', 'pro', 'elite'])
  @require_firebase_auth
  def discover_alumni():
      uid = request.firebase_user['uid']
      if not _check_user_rate_limit(uid, "discover-alumni-daily", "50 per day"):
          return jsonify({"error": "Daily limit reached"}), 429
  ```
  Rate-limit helper `_check_user_rate_limit` is the canonical Flask-Limiter wrapper at `backend/app/routes/job_board.py:7722` (also used at `:7793` find-recruiter and `:8215` referral-draft).
- Request: `{ job_id, company, title, allow_drop_title?: bool, allow_no_school_fallback?: bool }`
- Response: `{ contacts: [...], credits_used, cache_hit, tier_max, rung, try_again_in? }`
  - `rung`: `"school+company+title" | "school+company" | "no-alumni-fallback"` — surfaces which filter set produced results so UI can label honestly
  - `try_again_in`: seconds, set only on 429 from PDL upstream
- Each contact row: `{ pdl_id, first_name, last_name, title, company, school, linkedin_url, email, email_available, relationship, identity_key, match_strength, match_reasons[] }`
  - `match_strength`: `"strong" | "moderate" | "weak"` from pure helper `score_match_strength(student, contact)` in `alumni_discovery.py` (callable from both endpoints — see Email draft path).
  - `match_reasons`: 1-3 short strings, e.g., `["Stanford '22 — same grad year", "IC Eng role family match"]`
- 400 with `{ code: "no_school" }` if student profile lacks a school (UI shows onboarding deep link)
- 402 with `{ credits_required, credits_remaining }` if `credits_remaining < tier_n` before search. **Pre-check, do not rely on mid-call interrupt** — `@meter_call` only writes audit AFTER the call returns; mid-search credit cutoff is handled inside `pdl_client` retry loops and is not a reliable contract for new code. If credits < tier_n, cap `max_contacts = max(1, credits_remaining)` and proceed; if credits == 0, return 402.
- 504 with `{ code: "pdl_timeout" }` after 30s wrapper timeout
- Writes the validated response (plus a snapshot of the `job` dict at request time) to `users/{uid}/discovery_cache/{cache_key}` (15-min TTL) for `/from-discovery` to consume. **`cache_key = sha256(f"{job_id}::{filter_signature}")`** where `filter_signature = "school|none::title|none"` based on which filters were used. This isolates rung-1 results from no-school-fallback results so re-visits don't see stale cache.
- Writes a 7-day negative-cache entry at `users/{uid}/discovery_negative_cache/{company_slug}` when all rungs return empty. Invalidation: client-side write hook fires when the user updates `users/{uid}.school` (transfer case). Manual "Re-check" button deferred (see "NOT in scope").
- Audit: wrap the underlying PDL call site with the existing `@meter_call("pdl","person_search")` (already present at `pdl_client.py:1656`). Add a thin `@meter_call("offerloop","discover_alumni")` on `alumni_discovery.run_ladder` so the `provider_calls` collection captures (uid, rung, cache_hit, latency_ms, status) — matches the repo's existing audit pattern; no parallel logging system.
- Delegates to new `app/services/alumni_discovery.py` module (keeps route handler thin)

**`POST /api/job-board/referral-draft/from-discovery`**
- Decorators (same order — `@require_tier` then `@require_firebase_auth`); rate-limited via `_check_user_rate_limit(uid, "referral-draft-from-discovery-daily", "30 per day")` (mirror existing `referral-draft-daily` at `job_board.py:8215`).
- Request: `{ cache_key, pdl_id }` — **NO `job` dict, NO `pdl_contact` payload**. Server loads both the contact and the `job` snapshot from `users/{uid}/discovery_cache/{cache_key}` (A5: snapshotting `job` into the discovery cache restores the trust boundary; if we accepted `job` in the request, a malicious client could inject prompt content via crafted fields).
- Trust boundary: rejects with 410 if cache miss/expired (`{ code: "discovery_expired" }`, "rerun discovery"). Prevents forged contact fields and LLM prompt injection via crafted `title`/`note`.
- Persist-then-draft (canonical `@firestore.transactional` pattern, mirroring `deduct_credits_atomic` at `backend/app/services/auth.py:177`):
  ```python
  @firestore.transactional
  def _dedup_or_insert(tx, contacts_ref, identity_key, contact_doc):
      # Look up by identity_key inside the transaction (read-then-write atomic)
      existing = contacts_ref.where('identity_key', '==', identity_key).limit(1).get(transaction=tx)
      if existing:
          return existing[0].id, False  # reused
      new_doc = contacts_ref.document()
      tx.set(new_doc, contact_doc)
      return new_doc.id, True
  ```
  On transaction collision (parallel-tab race), Firestore retries automatically (default 5 attempts). Test T19 verifies retry semantics.
- After persist, call existing `build_referral_draft(uid, contact_id, job, user_email, commit=False)` with `job` from cache. No signature change.
- Response: existing referral-draft response shape + `contact_id` + `was_dedup: bool` (true if existing contact reused).
- Commit path stays unchanged: frontend then calls existing `POST /job-board/referral-draft/commit` with the new `contact_id`.

### PDL query

Inside `alumni_discovery.py`, build:
```python
parsed_prompt = {
    "schools":   [user.school or user["academics"]["university"]],
    "companies": [job.company],
    "title_variations": [job.title or user.careerTrack],
    "locations": [],
    "industries": [],
}
exclusion_data = _get_cached_exclusion_list(uid) or _build_exclusion_data_from_firestore(db, uid)
exclude_keys = exclusion_data["identity_set"]  # canonical helpers at backend/app/routes/runs.py:124 and :154
contacts, _, _, _ = search_contacts_from_prompt(
    parsed_prompt, max_contacts=tier_n, exclude_keys=exclude_keys, user_profile=user_data
)
# After receiving contacts, score each:
for c in contacts:
    c["match_strength"], c["match_reasons"] = score_match_strength(user_data, c)
# Normalize through the same function the main search uses so contact shape is consistent:
contacts = [extract_contact_from_pdl_person_enhanced(c) for c in contacts]  # pdl_client.py:1250
```

Tier `max_contacts` for discovery: **Free 3, Pro 5, Elite 8** (intentionally below tier search max — discovery is a wedge, not a contact-grinder).

**Relaxation ladder** (handled in `alumni_discovery.py`, each rung hits `pdl_cache` first):
1. school + company + title
2. school + company (drop title) — only if `allow_drop_title`
3. **no-alumni fallback** — company + title only, surfaced as a separate UI mode requiring explicit user click ("Try without school filter — shows recent hires, not alumni"); never silent
4. empty state → write negative-cache entry (7d)

`search_contacts_from_prompt` already does internal title-broadening retries (`pdl_client.py:3357-3361`), so rung 1 absorbs much of the noise; rungs 2-3 only fire on truly empty results. Use `pdl_client.enrich_job_title_with_pdl` to normalize the title (strip "Senior"/"Lead" seniority modifiers) before passing to the query.

**Title fallback chain**: `job.title` → `user.careerTrack` → reject with `no_title` code.

**Loading state progression** (frontend): "Searching {school} alumni at {company}..." for rung 1; on rung 1 empty, swap to "Trying without title filter..."; on rung 2 empty, offer the explicit "no-alumni fallback" button. Avoids silent 6-9s spinner.

**Defense in depth on identity reuse**: alumni_discovery reuses `_get_cached_exclusion_list(uid)` (60s LRU at `runs.py:124`) + `_build_exclusion_data_from_firestore` (cache-miss path at `runs.py:154`) — do NOT reimplement. Returns a dict with key `identity_set`.

**Sequential rung execution** (not parallel): rung 2 only fires if rung 1 returns empty AND `allow_drop_title` is true; rung 3 only fires if rung 2 returns empty AND `allow_no_school_fallback` is true. Parallel would burn credits on multi-rung calls when rung 1 succeeds.

**Failure modes (must handle in `alumni_discovery.py`):**
- PDL timeout > 30s → 504 with retry CTA
- PDL 429 → bubble `try_again_in` to client
- `pdl_cache.get` raises (Firestore outage) → log + continue to live PDL search, don't 500
- Parallel-tab dedup race on `/from-discovery` → Firestore transaction on dedup-then-insert

### Persistence of discovered contacts

Persist to `users/{uid}/contacts/{contact_id}` **only** when the user clicks `Draft email` (inside `/from-discovery`). Doc shape adds:
```python
{
    "source": "pdl_discovery",
    "discoveredVia": {
        "job_id": job_id,
        "company": company,
        "matched_on": ["school","company","title"],  # which rung
        "discovered_at": <ts>
    },
    "identity_key": get_contact_identity(pdl_contact),
    # ...normal contact fields from PDL extraction
}
```

**Dedup** before insert: query `users/{uid}/contacts where identity_key == get_contact_identity(pdl_contact)`. If hit, reuse the existing `contact_id`. Defense-in-depth: `exclude_keys` is also passed to `search_contacts_from_prompt` so results are pre-deduped at search time.

### Email draft path: save-first, reuse `build_referral_draft` unchanged

The `/from-discovery` endpoint persists the contact (or reuses an existing dedup match), then calls `build_referral_draft(uid, contact_id, job, user_email, commit=False)` with no signature change. Rationale: `build_referral_draft` already pulls relationship classification, resume parsing, coffee-chat-prep lookup, and prior-thread detection from the contact doc. Extending it to accept an inline contact dict would duplicate every Firestore read pattern and create two code paths that drift.

The relationship classifier at `referral_email.py:392-462` already returns `"moderate"` when shared school is present and no prior interaction exists — exactly the PDL-discovery case. No classifier change.

### Credit + tier policy

Tier monthly credits per `backend/app/config.py:80-269` and CLAUDE.md: **Free 500 / Pro 3000 / Elite 12000.**

| Tier  | Discovery max contacts | Worst-case credit cost | Cached cost | % of monthly Free |
|-------|------------------------|------------------------|-------------|-------------------|
| Free  | 3                      | 3                      | 0           | 0.6%              |
| Pro   | 5                      | 5                      | 0           | 0.17%             |
| Elite | 8                      | 8                      | 0           | 0.07%             |

`@meter_call("pdl","person_search")` (already on `execute_pdl_search` at `pdl_client.py:1656`) deducts 1 credit per contact returned and short-circuits to 0 on cache hit. **Pre-check before calling PDL**: if `credits_remaining == 0`, return 402; if `credits_remaining < tier_n`, cap `max_contacts = credits_remaining` and proceed. Don't rely on mid-flight interrupt — `@meter_call` writes audit only AFTER the wrapped function returns, so a "partial result" contract is not robust for new code.

UI surface: button shows `Uses up to {N} credits`; confirm phase shows `~{N} credits (0 if cached)`; post-search shows `Used {X} credits` or `Cached — 0 credits used`.

### Frontend changes

- **New file** `connect-grow-hire/src/components/jobs/AlumniDiscoveryPanel.tsx` — confirm + results phases. Receives `job`, `studentSchool`, `onSelectContact(pdlId)`, `onClose`. Stateless on API; lifts up. Each row renders the match-strength badge + 1-3 match-reason chips from the server. Buttons debounce + disable while in-flight. Keyboard nav (Tab/Enter), screen-reader labels for relationship and match-strength, focus trap inside modal.
- **Modify** `connect-grow-hire/src/components/jobs/ReferralDraftModal.tsx` — accept `mode: 'saved' | 'discovery'` prop. In `discovery` mode with no `contactId` yet, render `<AlumniDiscoveryPanel>`. On row select, call `apiService.draftReferralFromDiscovery(jobId, pdlId)` (sends `pdl_id` only — no contact dict) and swap to existing draft view with returned `contact_id`. Rest of modal (commit, copy-paste fallback) unchanged. Confirm modal renders full-screen on mobile (verify existing responsive behavior).
- **Modify** `connect-grow-hire/src/pages/JobBoardPage.tsx:331-556` (`JobRow`) — branch the CTA on `(job.referral_contact, negativeCache[company])` presence. Three states: `Draft referral to {name}` (saved contact), `Find alumni at {company}` (no saved + no negative cache hit), `Already checked — no alumni` (negative cache hit, disabled). Pass `_discoveryMode: true` into existing `referralDraftJob` state at line 580.
- **Modify** `connect-grow-hire/src/services/api.ts` — add `discoverAlumniForJob(jobId, opts)` and `draftReferralFromDiscovery(jobId, pdlId)`.

## Critical files

**New:**
- `backend/app/services/alumni_discovery.py` — orchestration: relaxation ladder, dedup, response shaping.
- `backend/tests/test_alumni_discovery.py` — pytest with PDL + OpenAI mocked.
- `connect-grow-hire/src/components/jobs/AlumniDiscoveryPanel.tsx` — discovery UI.

**Edit:**
- `backend/app/routes/job_board.py` — add `/discover-alumni` and `/referral-draft/from-discovery` endpoints (~60 lines each).
- `backend/app/services/referral_email.py` — no functional change expected; verify the moderate-branch fires for `source: "pdl_discovery"` contacts (one-line classifier addition only if needed).
- `connect-grow-hire/src/components/jobs/ReferralDraftModal.tsx` — add `mode` prop + discovery render branch.
- `connect-grow-hire/src/pages/JobBoardPage.tsx` — branch `JobRow` CTA on `referral_contact`.
- `connect-grow-hire/src/services/api.ts` — new methods.

**Reused unchanged (do not modify):**
- `backend/app/services/pdl_client.py` (`search_contacts_from_prompt`, `execute_pdl_search`, `get_contact_identity`, `extract_contact_from_pdl_person_enhanced`)
- `backend/app/services/pdl_cache.py`
- `backend/app/services/auth.py` (`deduct_credits_atomic`)
- `backend/app/services/metering.py` (`@meter_call`)
- `backend/app/extensions.py` (`@require_firebase_auth`, `@require_tier`)
- `backend/app/config.py` (`TIER_CONFIGS`)

## Edge cases

- **No company on job** → button hidden, replaced with disabled `Company unknown`.
- **No school on student profile** → inline prompt with deep link to `OnboardingAcademics.tsx`. Do not drop school silently.
- **All discoveries already saved (dedup race)** → empty results with copy "You've already saved every {school} alum we found at {company}." with link to contacts list.
- **Cache hit** → `cache_hit: true` plumbed through; UI renders `Cached — 0 credits used`. No behavioral difference otherwise.
- **Discovered contact has no email** → existing copy-paste fallback in modal applies; row shows `No email on file — paste into LinkedIn DM` hint.
- **Insufficient credits before search** → 402 (`credits_remaining == 0`) OR cap `max_contacts = credits_remaining` then proceed (1 ≤ remaining < tier_n). Modal swaps to inline "Upgrade tier" CTA when 402.
- **Discovery cache expired between Find and Draft** → `/from-discovery` returns 410 `discovery_expired`; modal renders "Discovery results expired — rerun search" CTA that restarts the discovery flow.

## Observability (matches repo's `provider_calls` audit pattern)

This codebase audits via `@meter_call(provider, endpoint)` → `provider_calls` Firestore collection (see `backend/app/services/metering.py`). Adding a parallel structured-log system would fragment the audit story. Reuse the pattern:

**Decorators on the new code paths:**
- `@meter_call("offerloop", "discover_alumni")` on `alumni_discovery.run_ladder` — writes `provider_calls` rows with `uid`, `search_id`, `latency_ms`, `status`, `error_msg`.
- `@meter_call("offerloop", "referral_draft_from_discovery")` on the route handler — same row shape.
- The underlying PDL call site is already wrapped by `@meter_call("pdl","person_search")` at `pdl_client.py:1656` (already deducts 1 credit per contact). No double-metering needed; the outer `offerloop.*` row captures route-level audit, the inner `pdl.*` row captures credit consumption.

**Add these tags to the `provider_calls` row** (extend the schema if needed — `metering.py:257` is where the doc is composed):
- `rung`: `"school+company+title" | "school+company" | "no-alumni-fallback" | "empty"`
- `cache_hit`: `"firestore" | "negative" | "live"`
- `source`: `"saved" | "discovery"` (on `referral_draft.*` rows so funnel split works)
- `contact_persisted`: `"new" | "existing_dedup"` (on `referral_draft_from_discovery`)

**Sentry** (already configured per CLAUDE.md): unhandled exceptions in `alumni_discovery.run_ladder` flow into Sentry automatically. Don't add a parallel error capture.

**Dashboard panels (day-1)**: discovery funnel (find-clicks → results-shown → draft-clicks → gmail-commits), split by tier and by `source={saved|discovery}`. Queryable directly off the `provider_calls` collection (the admin endpoints at `runs.py:975-1002` already aggregate spend; extend to aggregate funnel by `source` tag).

**Alerts** (Sentry/manual Firestore query for now — formal alerting not in scope):
- PDL error rate > 5% over 5min on `/discover-alumni` (query: `provider_calls where provider='pdl' and status='error'`)
- p99 latency > 12s on `discover_alumni` route
- 429 rate > 1% (PDL upstream rate limit)

## Rollout

1. Deploy backend with `DISCOVER_ALUMNI_ENABLED=false`. Endpoints return 404 when flag off.
2. Deploy frontend; UI hides the "Find alumni" branch when `/api/flags` reports the capability off.
3. Flip flag for Pro tier only. Watch metrics 48h: PDL error rate, latency, draft-from-discovery conversion.
4. If clean, flip flag for Free tier.
5. **Rollback**: flip flag OFF. No DB migration to undo. Discovered contacts persisted to `users/{uid}/contacts/` stay — they're valid contacts.

## Verification

**pytest with PDL + OpenAI mocked** (`backend/tests/test_alumni_discovery.py`):
1. Happy path — mock `search_contacts_from_prompt` → 3 contacts; assert response shape, dedup of one pre-existing identity key, `cache_hit` plumbed.
2. Relaxation ladder — mock empty on rung 1, hits on rung 2; assert `rung` reflects which fired.
3. Empty state — all rungs empty; assert 200, `contacts: []`, zero credits, **negative-cache entry written at `users/{uid}/discovery_negative_cache/{company_slug}` with 7d TTL**.
4. Negative-cache hit — pre-seed negative cache; assert endpoint short-circuits to empty 200 with 0 credits and `cache_hit: "negative"`.
5. Cache hit — mock `pdl_cache.get` to return cached results; assert 0 credits, `cache_hit: true`.
6. Credit exhaustion mid-flight — mock `meter_call` to raise after 2 contacts; assert `partial: true`, 2 contacts.
7. `/from-discovery` happy path — assert (a) server reads from `discovery_cache/{job_id}`, (b) contact persisted with `source: "pdl_discovery"`, (c) `build_referral_draft` called with the new `contact_id`, (d) draft returned with `relationship: "moderate"`.
8. **Forged-payload rejection** — POST to `/from-discovery` with a `pdl_id` not present in `discovery_cache/{job_id}`; assert 410 with `code: "discovery_expired"`, no Firestore write.
9. Dedup race on `/from-discovery` — pre-seed an identity-matching contact, use `concurrent.futures` to fire two parallel requests; assert exactly one new doc, both responses return same `contact_id`.
10. No-school path — user doc has no `school` and no `academics.university`; assert 400 with `code: "no_school"`.
11. Rate-limit — 51st call within 24h returns 429.
12. PDL timeout — mock `search_contacts_from_prompt` to sleep > 30s; assert 504 with `code: "pdl_timeout"`.
13. PDL Firestore cache outage — mock `pdl_cache.get` to raise; assert endpoint falls through to live PDL, doesn't 500.
14. Match-strength scoring — unit test the helper: same school + same grad year + same role family → `strong`; same school + different role → `moderate`; no school overlap → `weak`.
15. **Filter-signature cache isolation (A4)** — call `/discover-alumni` twice for same `(uid, job_id)`: once with `allow_no_school_fallback=false`, once with `=true`. Assert two distinct `discovery_cache` doc keys and rung-3 results not served from rung-1's cache entry.
16. **Job snapshot in discovery cache (A5)** — assert `/discover-alumni` writes the `job` dict into `discovery_cache/{cache_key}.job` field, and `/from-discovery` reads it from there (NOT from the request payload).
17. **Explicit no-alumni fallback** — `allow_drop_title=true` rungs 1-2 empty, then second call with `allow_no_school_fallback=true` returns rung-3 results; assert `rung == "no-alumni-fallback"`.
18. **Match-strength reasons populated** — assert `contact.match_reasons` has 1-3 strings with concrete details (school name + grad year, role family) for `strong`/`moderate` outcomes.
19. **Firestore transaction collision** — simulate concurrent dedup-then-insert calls; assert Firestore retry kicks in and exactly 1 contact doc exists post.
20. **Discovery cache expired → 410** — call `/from-discovery` with a `cache_key` that doesn't exist; assert 410 with `code: "discovery_expired"`, no Firestore write.
21. **PDL 429 surfacing** — mock PDL 429 with `Retry-After`; assert response includes `try_again_in` and bubbles to client.
22. **`extract_contact_from_pdl_person_enhanced` normalization** — assert contact dict shape matches what existing `/runs` endpoint returns (no field drift between paths).

**Frontend tests** (extend `ReferralDraftModal` test patterns for `mode === 'discovery'`):
- F1: Mock `apiService.discoverAlumniForJob` and `apiService.draftReferralFromDiscovery`.
- F2: In-flight button disable on "Find alumni" and "Search" clicks (debounce check).
- F3: No-school inline prompt renders with deep link to `OnboardingAcademics.tsx`.
- F4: No-alumni fallback CTA appears only after rung-2 empty, and user must explicitly click it (not auto-fired).
- F5: Negative-cache hit renders disabled "Already checked — no alumni" button on subsequent JobRow render.
- F6: Discovery cache expired (410) → modal renders "Discovery results expired — rerun search" CTA.
- F7: Mobile viewport (≤640px) → modal renders full-screen.
- F8: [→E2E] Full happy path: Find → Search → results → select row → draft renders → commit creates Gmail draft (mocked).

**Manual dogfood post-merge** (one student, ≤10 real credits): one Free-tier + one Pro-tier account, search a known-alumni-rich company (own school + Goldman/Stripe). Verify cache hit on second click, empty state + negative-cache on an obscure company, and Gmail draft commit. Per project policy: no live end-to-end tests that burn meaningful PDL/OpenAI spend.

## NOT in scope (deferred)

| Item | Why deferred | Path forward |
|------|--------------|--------------|
| Lazy-prefetch alumni on job-row expand (option C from review) | Wait for v1 conversion data — only worth the cost if students actually open rows before discovering | Phase 2 after 4 weeks of metrics |
| "Refresh discovery" button | YAGNI until students ask for it | Add if support tickets surface it |
| Bulk discovery across all saved jobs | Future product surface, not MVP | Separate PR; reuses `alumni_discovery` |
| Email verification (Hunter) before "Email available" badge | New vendor + $$; PDL email field is often empty already and copy-paste fallback exists | Track bad-email rate first |
| Coresignal fallback when PDL returns empty | Mirrors `runs.py:324` pattern but adds complexity; PDL relaxation ladder likely sufficient | Add if empty-state rate > 30% |
| Per-tier discovery credit caps separate from search caps | Current tier caps already bound the cost | Revisit after spend data |

## Risks & known gaps

- **Live polish trajectory.** `referral_email.py` had 5 commits in 30 days (v1→v3). This plan layers on top of v3. Risk: v4 changes the relationship classifier or prompt structure mid-implementation. **Mitigation:** feature flag + small surface area (no changes to `referral_email.py` beyond verifying the moderate branch fires correctly).
- **PDL alumni precision.** PDL's `education.school.name` field has alias noise ("Stanford University" vs "Stanford" vs "Leland Stanford Junior University"). Existing `_school_aliases()` in `pdl_client.py:2261` handles this — verify in implementation.
- **First-month credit blast.** A single Free-tier student discovering across 20 saved jobs at 3 credits each = 60 credits = 12% of monthly. With 50/day rate limit, sustained heavy use can drain Free in a week. **Acceptable** — drives Pro upgrades, which is the business model — but watch the metric.
- **Prompt-injection via contact title.** Even with the discovery-cache trust boundary, PDL itself is upstream-trusted; a malicious PDL record could in principle inject content into the LLM prompt via `title`/`note` fields. Low likelihood, but worth a sentinel: strip control chars and cap field lengths in `extract_contact_from_pdl_person_enhanced` (verify already done).

## What already exists (reused, not rebuilt)

| Primitive | Location | How this plan reuses it |
|-----------|----------|--------------------------|
| `search_contacts_from_prompt` | `backend/app/services/pdl_client.py:3251` | Single call per rung; the relaxation ladder lives in `alumni_discovery`, not duplicated in PDL client. |
| `pdl_search_cache` (Firestore, 30d TTL) | `backend/app/services/pdl_cache.py` | Hit-check at each rung before live PDL call. |
| `_get_cached_exclusion_list` + `_build_exclusion_data_from_firestore` | `backend/app/routes/runs.py:124, :154` | Identity-key dedup. 60s LRU. |
| `get_contact_identity` | `backend/app/services/pdl_client.py:366` | `identity_key` for contact dedup. |
| `extract_contact_from_pdl_person_enhanced` | `backend/app/services/pdl_client.py:1250` | Normalize contact shape so discovery and saved-contact paths produce identical dicts. |
| `@meter_call` + `provider_calls` | `backend/app/services/metering.py:72, :257` | All audit/observability. No parallel logging system. |
| `_check_user_rate_limit` (Flask-Limiter wrapper) | `backend/app/routes/job_board.py:7722` | Per-user daily caps on both new endpoints. |
| `@firestore.transactional` | `backend/app/services/auth.py:177` (`deduct_credits_atomic`) | Persist-or-dedup contact insert. |
| `@require_firebase_auth`, `@require_tier` | `backend/app/extensions.py` | Auth (note order: `@require_tier` BEFORE `@require_firebase_auth` per CLAUDE.md). |
| `build_referral_draft` | `backend/app/services/referral_email.py:882` | Email drafting. Zero signature changes. |
| `ReferralDraftModal` | `connect-grow-hire/src/components/jobs/ReferralDraftModal.tsx` | Draft phase + Gmail commit. Zero behavior changes; only adds `mode` prop branch. |

## Failure modes registry

| Codepath | Failure mode | Rescued? | Test? | User sees | Logged via |
|----------|--------------|----------|-------|-----------|------------|
| `alumni_discovery.run_ladder` rung 1-3 | PDL timeout > 30s | Y (504) | T12 | "Discovery is slow — try again" | `provider_calls.status="error"` |
| same | PDL 429 (rate limit upstream) | Y (429 + `try_again_in`) | T21 | "PDL is busy — try again in N seconds" | `provider_calls` + Sentry if recurring |
| same | PDL malformed JSON | N (would 500) | — GAP — | 500 error | Sentry |
| `pdl_cache.get` | Firestore outage on cache read | Y (fall through to live PDL) | T13 | nothing (transparent) | `provider_calls` |
| `discovery_cache` write | Firestore outage on cache write | N (would surface as 500) | — GAP — | 500 error | Sentry |
| `_dedup_or_insert` | Transaction collision | Y (Firestore auto-retry) | T19 | nothing (transparent) | `provider_calls` |
| `_dedup_or_insert` | Both retries exhausted | N (raises) | — GAP — | 500 error | Sentry |
| `build_referral_draft` | OpenAI failure | Y (existing path) | existing | existing copy-paste fallback | existing |
| `score_match_strength` | Missing student fields (no grad year) | Y (returns "weak" + reason) | T18 | weak badge | n/a |
| `/from-discovery` | cache_key not in discovery_cache | Y (410) | T20 | "Discovery expired — rerun" | `provider_calls.status="error"` |
| Front: out-of-credits state | Credit balance updates mid-modal | Y (existing useSubscription poll) | F6 | upgrade CTA | n/a |

**3 GAPS** (PDL malformed JSON, discovery_cache write failure, dedup retries exhausted): add try/except around each in `alumni_discovery.py`, log via `provider_calls.status="error"`, surface a generic "Discovery failed — try again" 500 to the user. These belong in the same try/except block as the PDL timeout handler.

## Worktree parallelization strategy

| Step | Modules touched | Depends on |
|------|----------------|------------|
| S1: `alumni_discovery.py` service + unit tests | `backend/app/services/`, `backend/tests/` | — |
| S2: `score_match_strength` helper (subset of S1) | `backend/app/services/` | — |
| S3: route handlers in `job_board.py` + integration tests | `backend/app/routes/`, `backend/tests/` | S1 |
| S4: `AlumniDiscoveryPanel.tsx` | `connect-grow-hire/src/components/jobs/` | — |
| S5: `ReferralDraftModal.tsx` mode prop + `JobBoardPage.tsx` CTA branch | `connect-grow-hire/src/components/jobs/`, `connect-grow-hire/src/pages/` | S4 (panel exists) |
| S6: `services/api.ts` new methods + frontend tests | `connect-grow-hire/src/services/` | — |

**Parallel lanes:**
- **Lane A (backend service):** S1 + S2 sequential (both touch `services/`).
- **Lane B (frontend UI):** S4 → S5 sequential (S5 imports S4).
- **Lane C (frontend api):** S6 independent (just adds methods; types can use any during dev).
- **Lane D (backend routes):** S3, **must wait for A** (imports `alumni_discovery`).

**Execution order:** Launch A + B + C in parallel worktrees. Merge A. Then D. Final merge once all are green.

**Conflict flag:** B and C both touch `connect-grow-hire/src/components/jobs/` — low risk (different files: ReferralDraftModal vs AlumniDiscoveryPanel), but coordinate the `ReferralDraftModal` edit in B and any prop-type updates in C.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (SELECTIVE EXPANSION) | 8 candidates, 2 accepted (match-strength badge, negative-cache), 6 deferred. 22 findings folded in. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required gate) | 1 | CLEAR | 6 architecture + 4 code-quality + 4 perf + 9 test gaps = 23 findings. All folded into plan. Reused existing primitives confirmed; named `_get_cached_exclusion_list`, `@firestore.transactional`, `_check_user_rate_limit`, `@meter_call`. Failure-modes table: 3 critical gaps surfaced + mitigated. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Recommended next: modal 3-phase flow + mobile + a11y warrant a deeper design pass. |
| Outside Voice | `/codex review` | Independent 2nd opinion | 0 | — | Skipped per user directive. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | N/A (no developer-facing surface). |

- **CROSS-REVIEW:** CEO and Eng both surfaced and resolved: feature flag, security trust boundary, observability, mobile/a11y. Eng additionally caught: wrong helper names (`_existing_identity_keys` → `_get_cached_exclusion_list`), wrong observability pattern (structured logs → `@meter_call`/`provider_calls`), wrong decorator order (`@require_firebase_auth` first → `@require_tier` MUST be first per CLAUDE.md), unreliable mid-flight credit exhaustion contract → pre-check pattern instead, cache stale-data bug (filter signature in cache key), `/from-discovery` request shape gap (`job` dict missing from cache).
- **UNRESOLVED:** 0 (auto-decided per user directive).
- **CRITICAL GAPS RESOLVED:** PDL timeout, `/from-discovery` trust boundary, observability scope, mid-flight credit handling, cache filter isolation, transaction collision retry.
- **VERDICT:** CEO + ENG CLEARED — ready to implement. Recommended next: `/plan-design-review` before implementation if you want UI polish locked in, OR `/ship` after implementation. Eng review should be re-run if scope changes during implementation.

## Completion summary

```
+====================================================================+
|              ENG REVIEW — COMPLETION SUMMARY                       |
+====================================================================+
| Step 0 (scope)       | Accepted; 8 files (at threshold), no cut    |
| Architecture         | 6 issues found, 6 fixed in plan             |
| Code Quality         | 4 issues found, 4 fixed in plan             |
| Test Coverage        | Diagram: ~32 paths, 9 gaps, +8 tests added  |
| Performance          | 4 notes, 0 blocking                         |
| Failure Modes        | 11 paths mapped, 3 gaps → mitigated         |
| Reuse Audit          | 10 existing primitives named, 0 rebuilt     |
| Parallelization      | 4 lanes (A+B+C parallel, D depends on A)    |
| Outside voice        | Skipped                                     |
| TODOS                | Match-strength badge accepted (from CEO);   |
|                      |   "Re-check" button + email verify deferred |
+====================================================================+
```

