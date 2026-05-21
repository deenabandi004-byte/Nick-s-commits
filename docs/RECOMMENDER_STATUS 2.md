# Recommender Engine - Implementation Status

Last updated: 2026-05-10

Plan file: `.claude/plans/jaunty-spinning-owl.md`

---

## Resume Here

**Status:** Pre-Phase-0 complete. All six tracks shipped to production and smoke-tested.

**Shipped tracks:**
1. Track A1: Goals step re-added (skippable) - `be65d32`
2. Track A2: GoalsPromptBanner for legacy users - `be65d32`
3. dreamCompanies pending-input flush fix - `fa50157`
4. Track B: cooldown writes - `9029530`
5. Track C: event logger + middleware + impression backfill - `ab3837d`, `23ccad0`
6. Track A bonus: onboarding analytics - `670f081`

**Next milestone:** Phase 1 (feature store + embedding cache + weekly Parquet export)

**When to resume:** May 15–17, 2026 - wait 5–7 days for real impression and outcome data to accumulate.

**What to verify before starting Phase 1:**
1. `email_quality_logs` fallback rate stays near zero
2. `recommendation_events` grows steadily with real user activity
3. `global_contact_outreach` has reasonable distribution (no contact saturated above 5 sends/30d)
4. Onboarding funnel data is collecting and shows where real drop-off is happening

**Phase 1's first concrete task:** Create `backend/app/services/embedding_service.py` with `text-embedding-3-small` batch embedding and content-hash Firestore cache.

---

## Pre-Phase 0 - COMPLETE

All tracks shipped and smoke-tested on production.

### Track A: Goals Data Capture (Frontend)

**Commit `be65d32`** - Pre-Phase-0 Track A: re-add Goals step + legacy user banner

- **A1: Goals step re-added to onboarding (skippable)**
  - `OnboardingFlow.tsx` - added `"goals"` step between academics and location, wired `handleGoalsData` and `handleGoalsSkip`
  - `OnboardingGoals.tsx` - trimmed to 2 fields: `careerTrack` (select, 8 options) and `dreamCompanies` (tag input). Removed `personalNote`.
  - `OnboardingShell.tsx` - updated step count from 3 to 4
  - `OnboardingWelcome.tsx` - fixed stale copy ("3. Career" to "3. Goals")
  - Goals fields written as flat top-level keys on user doc (`careerTrack`, `dreamCompanies`), not nested under `goals.*`

- **A2: Find page banner for legacy users**
  - `GoalsPromptBanner.tsx` (new) - dismissible banner on Find page, shows when `!user.careerTrack && onboarding complete`, links to Account Settings, localStorage dismiss with 7-day re-show
  - `FindPage.tsx` - renders `GoalsPromptBanner` after `<AppHeader>`

### dreamCompanies Bug Fix

**Commit `fa50157`** - fix: flush pending dreamCompanies input on Goals submit

- `OnboardingGoals.tsx` - flushes any text in `companyInput` into `dreamCompanies` array at submit time, so typing a company and clicking Continue without pressing Enter no longer loses the entry

### Track B: Cooldown Writes (Backend)

**Commit `9029530`** - feat: add global contact cooldown tracking (Track B)

- `cooldown_service.py` (new) - `record_outreach(email, uid)` and `get_outreach_count(email)`. Uses `global_contact_outreach/{contact_email}` Firestore collection with 30-day rolling window, pruned on read and write. Fire-and-forget.
- `gmail_webhook.py` - hooked `record_outreach(to_email, uid)` into send detection path, right after existing `email_actually_sent` metric event

**Schema note:** The plan specified `outreach_user_ids_30d` (flat array of UIDs). The implementation uses `outreach_entries` (array of `{uid, ts}` objects) instead. This is an intentional improvement - preserving per-send timestamps enables time-decay weighting in the Phase 2 heuristic scorer and makes debugging easier. `outreach_count_30d` remains as a denormalized count for fast reads at scoring time.

---

## Stashed

- **AgentSetupInline styling changes** - pre-existing work, unrelated to recommender. Recover via `git stash list` then `git stash pop` or `git stash apply`.

---

## Observations for Phase 1

These were discovered during Pre-Phase-0 implementation and should be addressed when building `feature_service.py`:

1. **Empty `interests`/`careerInterests` arrays** - collected during onboarding Location step but never consumed by any backend service. Plan says wire them into `target_industries`/`target_functions` features.
2. **`linkedinResumeParsed` vs `resumeParsed` precedence** - both may exist on user docs from different enrichment paths. `feature_service.py` needs a clear precedence rule when extracting user features.
3. **Conditional spread `?.length` pattern** - `OnboardingFlow.tsx:174` silently drops empty arrays (e.g. `dreamCompanies: []` becomes absent from the Firestore write). Not a bug now (the flush fix ensures the array is non-empty when companies are entered), but fragile. Revisit if more array fields are added to the onboarding write.

### Track C: Event Logger + Request Context Middleware (Backend)

**Commit `ab3837d`** - feat: Track C - recommendation event logger + request context middleware

- `request_context.py` (new) - Flask middleware attaching `request_id` (UUID) and `session_id` (from `X-Session-Id` header) to every request via `flask.g`
- `recommendation_events.py` (new) - fire-and-forget logger writing to Firestore `recommendation_events` with full 18-field schema
- `wsgi.py` - registers request context middleware before all blueprints
- `runs.py` - logs `recommendation_shown` per contact in search results (rank, warmth score, feature snapshot)
- `gmail_webhook.py` - logs `email_sent` and `email_replied` recommendation events
- `api.ts` - generates per-session UUID in sessionStorage, sends as `X-Session-Id` header

**Firestore index:** Composite index on `recommendation_events` for `(event_type, uid, contact_email, server_timestamp DESC)` - auto-created on first query.

### Impression Context Backfill Fix

**Commit `23ccad0`** - fix: backfill impression context on email_sent recommendation events

- `gmail_webhook.py` - `_lookup_impression_context()` queries most recent `recommendation_shown` for same `(uid, contact_email)`, copies `request_id`, `session_id`, `rank`, `score` onto `email_sent` event. Tracks `has_impression: false` when no matching impression exists.

---

## Observations for Phase 1 Cleanup

4. **reply_coach triggers on bounce messages** - `mailer-daemon@googlemail.com` triggered draft generation. Filter bounce-pattern senders (mailer-daemon, postmaster, noreply) before invoking reply_coach.
5. **Firestore deprecation warnings** - positional `filter()` args in `gmail_webhook.py` (lines 55, 56, 433, 439) and `base_collection.py`. Migrate to keyword `filter=` syntax.

---

### Track A Bonus: Onboarding Analytics

**Commit `670f081`** - feat: onboarding step analytics via metrics_events

- `metrics_events.py` - added `onboarding_step_viewed` and `onboarding_step_completed` to valid event types
- `users.py` - new `/api/users/onboarding-event` endpoint accepting `{ event, step, skipped }`
- `OnboardingFlow.tsx` - `useEffect` fires `viewed` on step mount, `completed` on each handler before advancing. Goals skip passes `skipped: true`. All fire-and-forget.

---

## Next Up

### Remaining Phases

- Phase 1: Feature Computation + Embedding Cache (Weeks 2-4)
- Phase 2: Heuristic Baseline (Weeks 4-6)
- Phase 3: Data Accumulation + Dashboard (Weeks 6-8)
- Phase 4: Learned Model (Weeks 8-11)
- Phase 5: Automation (Weeks 11-12)

---

## Protocol

- Every commit must be followed by `git push origin main`.
- Every smoke test must target production (`offerloop.ai`), not localhost.
- Render auto-deploys on push to main (2-5 min).
