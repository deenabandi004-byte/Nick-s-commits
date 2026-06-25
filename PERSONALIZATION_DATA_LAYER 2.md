# Personalization Data Layer — Nine-Phase Summary

**Status as of 2026-05-15** · Branch: `feat/personalization-phase-1-2`
(name predates the rest; covers P1–P9)

## What this is

A networking-tool framing of Offerloop: Clay-for-individuals. We synthesize a
durable understanding of each user (school, target firms, voice, behavior,
alumni context, intent) and feed it into emails, recommendations, and
dashboard nudges. Path A in the planning doc: build the user profile first,
then surface it everywhere.

Every phase is additive and gated behind a feature flag that defaults OFF.
Nothing in this stack is live for users yet — the code paths are deployed,
the switches are not flipped. Path was chosen specifically so we could ship
the layer in the open without product risk.

---

## Phase 1 — User schema + controlled vocab + email_generator contract

**Shipped:**
- `models/users.py` — Pydantic `UserDocument` mirror, `create_user_data()`
  emits `schemaVersion=1` on every new doc; `normalize_school` /
  `normalize_company` slug helpers used as the alumni cache key.
- `config.py` — `TARGET_INDUSTRIES`, `TARGET_ROLE_TYPES`,
  `OPEN_TO_LOCATIONS` controlled vocab. Kept in sync with TS mirror.
- `services/email_generator.py` — locked Phase 7 dataclass contract
  (`StructuredProfile`, `DerivedProfile`, `CompanyContext`, `Contact`,
  `GeneratedEmail`). `generate_email()` raises `NotImplementedError` so
  accidental P1 callers fail loudly.
- `services/derived_profile_service.py` — placeholder writer for
  `derivedProfile/v1`.
- `services/company_contexts_service.py` — writer + reader for
  `users/{uid}/companyContexts/{companyIdNormalized}`.
- `services/alumni_service.py` — read-side cache against
  `alumniCounts/{schoolId}__{companyId}__{office?}` with 7-day staleness.
- Frontend: `types/user.ts` (TS mirror), `lib/constants.ts` (TS controlled
  vocab + `EVENTS_LOGGING_ENABLED` flag).
- Follow-up: `ProfileConfirmModal`, `AlumniCountBadge`, contact-card
  alumni prop; gated `/api/users/alumni-count` and `/api/users/profile-confirm`
  with per-field provenance (`explicit` vs `inferred_from_resume_backfill`).
- Backfill script (`phase1_backfill.py`) — idempotent, resumable, throttled
  to 100 docs/sec. *Deprecated* after we found Firestore resume text is
  stored single-line; replaced by the upcoming 3-path onboarding gate
  (LinkedIn paste / resume upload / manual form).

**Flags:** new fields are nullable + additive; safe on top of any existing
user doc. New code reads structured fields first, falls back to legacy
`professionalInfo`.

**Tests:** Phase 1 + 2 unit tests in `test_personalization_phase1.py`
covering `UserDocument` validation, alias normalization, and
`create_user_data` defaults.

---

## Phase 2 — Event taxonomy + idempotent service + frontend logger + reply attribution

**Shipped (event log):**
- `models/events.py` — `EventType` enum + `IncomingEvent` validator; FE
  vs BE allowlists (frontend cannot write `reply_received` etc.).
- `services/events_service.py` — `log_event(uid, type, payload, ...)`.
  Idempotency key is the UUID frontend generates (`crypto.randomUUID()`)
  or `sha256(uid:msgid:type)` for Pub/Sub callers. `transaction.create`
  collapses retries.
- 90-day TTL: every event writes `expiresAt = createdAt + 90 days`.
  Firestore TTL service is configured against this field.
- `routes/events.py` — `POST /api/events/batch`. Per-event validation
  so a single bad envelope doesn't drop the batch.
- Frontend: `lib/events.ts` zod-validated discriminated union,
  `hooks/useEventLogger.ts` with 5s flush / 25-event cap, sendBeacon on
  visibilitychange, localStorage retry queue. `EmailEditedEvent` payload
  is structurally typed — `editTypes` + char counts only, **no raw text
  or diff** (privacy choice from eng review §3.1).

**Shipped (reply attribution):**
- Every outbound draft stamps `X-Offerloop-Tracking-Id: <uuid>` and writes
  `users/{uid}/outboundDrafts/{trackingId}` *before* the Gmail draft.
- Pub/Sub handler matches replies via `In-Reply-To` against
  `outboundDrafts.sentMessageId` — sub-100ms indexed lookup.
- Misses logged to `users/{uid}/unattributed_replies` with
  `reply_attribution_uncertain` event for rate monitoring.

**Flags:** `EVENTS_LOGGING_ENABLED`, `VITE_EVENTS_LOGGING_ENABLED`,
`REPLY_ATTRIBUTION_ENABLED` — all default OFF. When OFF, services
short-circuit before touching Firestore.

**Tests:** `test_personalization_phase2.py` — idempotency, derived key,
allowlist enforcement, header stamping.

---

## Phase 3 — Floating prompt + cold-start intent + company contexts

**Shipped:**
- `FloatingPrompt` (frontend) — inline banner above the email composer
  asking "why this company" when a saved `companyContext` is missing or
  stale. Industry-seeded suggestion chips from `targetIndustries`.
- `ColdStartIntent` (frontend) — 5-question gated flow for thin-resume
  users. Q4 ("your wedge") is the unlock per spec §15.3.
- Backend: `company_contexts_service.should_show_prompt` — staleness +
  unanswered-threshold logic against `outboundDrafts` indexed by
  `companyIdNormalized`. Every outbound draft now stamps this id.
- `app/utils/company.py` — ~100-firm alias map (Goldman/GS/Goldman Sachs
  → `goldman-sachs`, JPM/JPMorgan → `jpmorgan`, etc.) with suffix rules.

**Flags:** `VITE_FLOATING_PROMPT_ENABLED`, `VITE_COLD_START_INTENT_ENABLED`
— default OFF.

**Tests:** `test_personalization_phase3.py` — alias resolution, staleness
detection, should_show_prompt thresholds.

---

## Phase 4 — Derived profile synthesis + voiceModel UX + feature flags

**Shipped (synthesis):**
- `derived_profile_service.synthesize(uid)` — real LLM pipeline. Reads
  last 60 days of events + structured profile + previous `derivedProfile`,
  calls `gpt-4o-mini` for compact JSON output, writes
  `users/{uid}/derivedProfile/v1`. ~$10/month at 300 active users per
  eng review §6.1. Per-user try/except so one bad user can't poison the
  cron (fix for §12 silent-failure gap).
- `write_user_voice_model()` + `voiceModelManuallyEdited` flag so synthesis
  stops overwriting fields the user has tuned.
- `scripts/derived_profile_cron.py` — event-triggered (every N=10 events)
  + nightly sweep, idempotent against double-firing.

**Shipped (feature flags — first time this infra appears):**
- `services/feature_flags.py` — Firestore-backed flag service. Deterministic
  `sha256(flag:uid) % 100` bucketing. Constants: `USE_NEW_GENERATOR`,
  `DERIVED_PROFILE_SYNTHESIS`. `is_enabled_for_user` honors per-uid
  overrides + per-flag `rollout_pct` + global env-var kill switches
  (`<FLAG>_KILL=true`). 60s in-memory TTL cache so flips propagate
  within a minute without per-worker live listeners.

**Shipped (UX):**
- `VoiceModelControls` (frontend) — 3 plain-English controls (Tone,
  Length, Opener) with live preview pane that regenerates as sliders
  move. Closer + signature tucked under "Show advanced". Mounted in
  `AccountSettings` under the Phase 4 Email Voice section.

**Shipped (admin):**
- `/api/admin/edit-rate-dashboard` (A/B old vs new generator by
  `USE_NEW_GENERATOR` assignment) and `/api/admin/feature-flags` GET +
  POST for runtime flag control. Both gated by `ADMIN_UIDS` env-var
  allowlist.

**Flags:** `DERIVED_PROFILE_ENABLED` — default OFF.

**Tests:** 14 unit tests in `test_personalization_phase4.py` — flag
bucketing, synthesis input shape, cron idempotency, voiceModel manual-edit
preservation, per-user error isolation.

**Docs:** `docs/render-cron-derived-profile.md` — Render scheduled-job
setup.

---

## Phase 5 — Recommendation engine + dashboard surface

**Shipped (backend):**
- `recommendation_service.rank_contacts(uid, limit)` — scores saved
  contacts on (school match + target-firm match + warmth). Tops the list
  with synthetic seeded picks from structured profile when the saved
  pool is thin. Cold-start safety net per spec §15.7: never returns `[]`
  when the user has school OR target companies/industries.
- `rank_jobs` — same shape over saved jobs.
- `RankedContact` / `RankedJob` dataclasses include
  `predicted_outcome: Optional[OutcomePrediction] = None` and
  `path_similarity_score: Optional[float] = None` per §9.B. The predictor
  is a stub dataclass — full predictor lands once the data lake has
  signal (architect-now, build-later, stretch verdict B).
- Cache at `users/{uid}/recommendations/v1`. Busted by major events:
  `profile_confirmed`, `prompt_answered`, `email_sent`, `reply_received`.
- `routes/recommendations.py` — `GET /api/recommendations/contacts` and
  `/api/recommendations/jobs`, both gated by `RECOMMENDATIONS_ENABLED`.

**Shipped (frontend):**
- `EmptyRecommendations` — maturity-aware copy (profile-seeded → mixed
  → steady). Never renders an empty state; falls back to cold-start CTA
  only when no school AND no target companies AND no target industries.
  Mounted on `Dashboard.tsx` above the workflow shortcuts.
- Brand-blue accents via existing primary CSS variables. No new tokens,
  no font changes.

**Flags:** `RECOMMENDATIONS_ENABLED`, `VITE_RECOMMENDATIONS_ENABLED` —
default OFF.

**Tests:** 16 unit tests in `test_personalization_phase5.py` — cache
hit / invalidation on major event, cold-start coverage, ranking
determinism, dataclass defaults, limit param.

---

## Phase 6 — Alumni consent + sourcing pipeline + cache prewarm

**Shipped (consent):**
- `services/consent_service.py` — `alumniGraphConsent` state machine
  (`opt_in` / `opt_out` / `pending`) with audit event logging
  (`ALUMNI_GRAPH_CONSENT_CHANGED`) and **tombstone-on-opt-out** behavior
  (revoking removes the user from the directory immediately).

**Shipped (sourcing chain):**
- `services/alumni_sourcing_service.py` — write-through provider chain
  on top of the Phase 1 cache. PDL primary, SerpAPI fallback, Bright
  Data placeholder. Cache hits within TTL skip the chain; full-chain
  failure returns stale cache as a degraded read. Indexes opt-in users
  into `alumniByUser` for the future v1.1 directory surface.
- `services/pdl_client_cost_guard.py` — daily PDL spend cap (default
  $100, env-overridable) per §12 risk plan. Over-cap → `allow_pdl_call`
  returns False, sourcing chain falls through to next provider.

**Shipped (prewarm):**
- `scripts/phase6_alumni_prewarm.py` — warms popular (school, company)
  pairs offline so the cold-start week-1 PDL spike lands under the daily
  cap. Two modes: `--mode warm` sweeps all paying users' top
  `targetCompanies`; `--mode user --uid <id>` warms one user post
  `profileConfirmedAt`. Per-user try/except with Sentry capture (same
  pattern as the Phase 4 cron).

**Shipped (routes):**
- `GET /api/alumni/at-company` — count for `(school, company[, office])`.
- `GET /api/users/consent/alumni-graph`.
- `POST /api/users/consent/alumni-graph` — `{ value: opt_in | opt_out }`.
- `routes/users.alumni_count` — flag-gated fall-through: on cache
  miss/stale, sources synchronously through `alumni_sourcing_service`.
- `AlumniConsent` UX + `AccountSettings` wiring.

**Flags:** `ALUMNI_GRAPH_ENABLED` — default OFF.

**Tests:** `test_personalization_phase6.py` covers consent state machine,
revoke-tombstones-immediately, write-through cache, provider fallback
chain (PDL outage → SerpAPI), full-chain outage returning stale cache,
cold-start school slug fallback, PDL daily cost guard.

---

## Phase 7 — Email generator dispatch + edit-rate metrics

**Shipped (dispatch):**
- `services/email_generator_dispatch.py` — `dispatch_email_generation`,
  the per-request A/B router. On `USE_NEW_GENERATOR=on`, calls
  `email_generator.generate_email` per contact and adapts the
  `GeneratedEmail` dataclass to the legacy results shape. On **any**
  exception (`NotImplementedError` or otherwise), falls back to
  `reply_generation.batch_generate_emails` and tags
  `generator_version='new_unavailable'`. Per §12.1
  (generator-divergence): the dispatcher must NEVER be the reason an
  email send fails.

**Shipped (metrics):**
- `services/edit_rate_metrics.py` — pure-function pipeline that buckets
  `email_drafted` vs `email_edited` events by per-event
  `generatorVersion` (preferred) or by the user's current
  `USE_NEW_GENERATOR` assignment (fallback for events written before the
  dispatcher landed). Reports a separate `new_unavailable` bucket so
  fallback rate doesn't dirty the A/B numbers.
- `routes/admin.edit_rate_dashboard` — delegates to the metrics module.
  Response shape is a strict superset of the pre-Phase-7 payload
  (adds `new_unavailable` + `sample_size` keys).

**Shipped (events):**
- `routes/emails.py` — replaces direct `batch_generate_emails` call with
  `dispatch_email_generation`. Writes an `email_drafted` backend event
  per draft, idempotent on `tracking_id`. Only logged for drafts produced
  this turn (cached drafts don't dirty the A/B counts).

**Shipped (frontend):**
- `EditRateDashboardPage` at `/admin/edit-rate`. Linear-clean admin
  surface, brand-blue accents only. Backend route also gated by
  `ADMIN_UIDS` allowlist (returns 403 for non-admins).
- `lib/events.ts` — `EmailDraftedPayloadSchema` extends with optional
  `generatorVersion` enum (`old` / `new` / `new_unavailable`).

**Flags:** `USE_NEW_GENERATOR` (Firestore-backed, ramped via
`rollout_pct`); `VITE_EDIT_RATE_DASHBOARD_ENABLED` — default OFF.

**Tests:** 14 unit tests in `test_personalization_phase7.py` —
deterministic A/B assignment, dispatch routing both flag states,
`NotImplementedError` + generic `Exception` fallback to legacy with
`new_unavailable` tag, edit-rate bucketing precedence (payload > user
assignment), `new_unavailable` separation, window clamping to `[1, 90]`,
20-profile snapshot run exercising the adapter against realistic
`StructuredProfile` shapes.

---

## Phase 8 — Dashboard CTA cards + notification fatigue

**Shipped (CTA service):**
- `services/cta_service.evaluate(uid) -> (cards, isQuieted)` — derives
  the visible deck from the last 14 days of `users/{uid}/events`. Cards
  are stateless on the read path; persistence is limited to
  `ctaDismissals` + `ctaClicks` subcollections so polling reconciles
  cleanly. Max 3 visible after aggregation.
- `register_trigger(event_type)` decorator registry with the launch set:
  - `reply_received` → "draft a follow up" (positive)
  - alumni-hire-at-target-firm → "see other alumni" (opportunity)
  - `coffee_chat_scheduled` → "prep your questions" (reminder)
- Triggers are precise. `contact_added` only fires when the contact is
  **both** alumni of the user's school AND at one of their
  `targetCompanies`.
- `aggregate(cards)` collapses same-trigger / same-target / same-day
  cards. Three alumni hires at Goldman in one day → one card with
  `aggregated_count=3`.

**Shipped (notification fatigue):**
- `record_dismissal(uid, card_id)` — per-card dismissal record + rolling
  tally on `user.notificationStats`. The **fifth** dismissal inside a
  7-day window flips `quietedUntil` to `now+7d` and resets the count.
- `record_click` does NOT count toward the cooldown.

**Shipped (routes):**
- `GET /api/dashboard/ctas`
- `POST /api/dashboard/ctas/<id>/dismiss`
- `POST /api/dashboard/ctas/<id>/click`
- All mirror dismiss/click to the Phase 2 event log so metrics can
  compute dismiss-rate per `card_type`.

**Flags:** CTA cards default OFF behind the standard dashboard flag.

**Tests:** `test_personalization_phase8.py` — CTA aggregation (3 alumni
hires same day = 1 card), notification cooldown after 5 dismissals
(clock-mocked), triggers fire from real event log entries, disabled flag
short-circuits, quieted user gets `isQuieted=True`, dismissed cards do
not reappear, click does NOT count toward cooldown, `contact_added`
trigger precision.

---

## Phase 9 — Per-uid Firestore overrides on the four env-gated flags

**Why:** Spec §8 step 2 requires per-uid overrides. `USE_NEW_GENERATOR`
already had them; the four env-gated flags (`DERIVED_PROFILE_ENABLED`,
`EVENTS_LOGGING_ENABLED`, `RECOMMENDATIONS_ENABLED`, `NUDGES_ENABLED`)
did not. This phase closes that gap.

**Shipped:**
- `feature_flags.get_user_override(flag, uid) -> Optional[bool]` —
  reads `feature_flags/global.{flag}.overrides[uid]` (same Firestore
  shape as `USE_NEW_GENERATOR`).
- `derived_profile_service.is_enabled(uid=None)`,
  `events_service.is_enabled(uid=None)`,
  `recommendation_service.is_enabled(uid=None)` — accept optional uid;
  when provided, per-uid Firestore override beats the env var in both
  directions (force-on when env is off, force-off when env is on).
- Call sites updated: `routes/events.py`, `routes/recommendations.py`,
  `events_service.log_event` now pass `uid` into `is_enabled`.
- `scripts/derived_profile_cron.py` — moved the gate inside the per-uid
  loop so override=true can force-enable synthesis for specific users
  (the founders-onboard pattern) while the env var is still globally
  false during rollout.
- `services/nudge_service._run_scan` — per-uid override=false skips a
  user. **Asymmetry called out in code comment:** because
  `NUDGES_ENABLED` defaults true and the wsgi daemon doesn't start when
  env is off, override=true cannot re-enable a user under a global env
  kill. This matches realistic ops use (per-uid kill for a problem
  user) and avoids touching daemon startup.

**Tests:** 9 new tests in `test_uid_overrides.py` covering the helper
+ per-uid behavior across all four flags + nudge-scan integration.
Two existing cron tests in `test_personalization_phase4.py` updated to
match the new per-uid contract (no global short-circuit).

**Result:** 135/135 tests pass across phases 1–9 + nudge service.

---

## Rollout posture (today)

Every feature flag in this stack is **OFF in production**. The data
layer is deployed code; nothing is rendering to users until we flip the
switches.

When we ramp, the path is:

1. Per-uid override = true for founders (`deena.bandi004@gmail.com`,
   me, and one or two real users).
2. Observe edit-rate dashboard + Sentry for one week.
3. Flip global env to true at a target rollout %.
4. Use `<FLAG>_KILL=true` as the emergency stop.

Backend reads `subscriptionTier` as the source of truth for tier (Phase
0 invariant). Frontend `constants.ts` mirrors the controlled vocab; if
we add an industry or role type, we update both.

## What's not in this stack

- Outcome predictor (Phase 5 stretch B) — dataclass shape locked, no model.
- v1.1 alumni directory surface (`alumniByUser`) — index is populated,
  no UI.
- Bright Data sourcing — placeholder, never called.
- Phase 1 backfill script — deprecated; superseded by the 3-path
  onboarding gate (LinkedIn paste / resume upload / manual form).

## Files of interest for review

```
backend/app/services/
  feature_flags.py
  derived_profile_service.py
  events_service.py
  recommendation_service.py
  consent_service.py
  alumni_service.py
  alumni_sourcing_service.py
  pdl_client_cost_guard.py
  email_generator.py            # Phase 7 contract
  email_generator_dispatch.py
  edit_rate_metrics.py
  cta_service.py
  nudge_service.py
  company_contexts_service.py

backend/app/routes/
  events.py
  recommendations.py
  alumni.py
  cta.py
  admin.py                       # edit-rate + flag control
  users.py                       # voice-model + profile-confirm

backend/scripts/
  derived_profile_cron.py
  phase6_alumni_prewarm.py
  phase1_backfill.py             # deprecated, kept for reference

backend/tests/
  test_personalization_phase1.py ... phase8.py
  test_uid_overrides.py          # phase 9

connect-grow-hire/src/
  components/ProfileConfirmModal.tsx
  components/VoiceModelControls.tsx
  components/FloatingPrompt.tsx
  components/ColdStartIntent.tsx
  components/AlumniCountBadge.tsx
  components/AlumniConsent.tsx
  components/EmptyRecommendations.tsx
  pages/EditRateDashboardPage.tsx
  hooks/useEventLogger.ts
  lib/events.ts
  lib/constants.ts
  types/user.ts
```
