# Onboarding Rewrite — Phase 4 Validation

**Date:** 2026-06-03
**Goal:** For each entry path, confirm the user doc carries the email engine's minimum field set (name, university, graduationYear, major, careerTrack, + a resumeParsed source), reads correctly through existing consumer paths, and that no consumer read path changed except the parse fixes.

**Method:** Live end-to-end (signed-in browser writing to Firestore) is not runnable in this environment (no Firebase creds; browse tool blocked by an unrelated bun bug). Validation is deterministic: simulate the exact `buildFinalData` doc per path, map fields to consumer read paths, and prove the stored careerTrack values normalize through the real backend functions.

## What each path writes (exact `buildFinalData` output)

### Minimum-field-set check per path

| Min field | Read path (consumer) | Resume path | LinkedIn path | Manual path |
|-----------|----------------------|-------------|---------------|-------------|
| name | `profile.fullName`/`firstName`+`lastName` → email (`users.py:773`, `reply_generation.py:420-429`) | ✅ Maya Patel | ✅ Sam Lee | ✅ Alex Kim |
| university | `academics.university` (email P1, `personalization.py:489`; warmth `warmth_scoring.py:89`) **+** top-level `university` (company-rec P1 `company_recommendations.py:285`, loader `firebaseApi.ts:266`) | ✅ USC | ✅ NYU | ✅ UCLA |
| graduationYear | `academics.graduationYear` (email `personalization.py:507`; loader `firebaseApi.ts:277`) | ✅ 2026 | ✅ 2025 | ✅ 2027 |
| major | `academics.major` (email `personalization.py:499`) | ✅ Business Administration | ✅ Finance | ✅ Economics |
| careerTrack | `goals.careerTrack` (email/warmth P1 `personalization.py:578`,`warmth_scoring.py:121`) **+** flat `careerTrack` (P2; company-rec `company_recommendations.py:334`; loader) | ✅ investment banking | ✅ tech | ✅ consulting |
| resumeParsed source | `resumeParsed` written server-side by `/api/parse-resume` / `/api/enrich-linkedin-onboarding`; read by email (`personalization.py:530-575`), job board, coffee chat | ✅ from résumé | ✅ from LinkedIn (Bug 2 backfill) | ❌ none (manual — by design) |

All three paths populate **name, university, graduationYear, major, careerTrack**. The résumé and LinkedIn paths also have a **resumeParsed source**; the **manual path has none** — the documented, accepted tradeoff (manual = no parse), so the email engine degrades to profile-only personalization (alumni/major/track still fire; résumé-derived skills/experience/shared-company signals don't).

### Fields left empty per path

- **Résumé path:** `profile.linkedinUrl` empty (no LinkedIn given). Everything else populated (incl. degree, dreamCompanies, intent in the sample).
- **LinkedIn path:** `profile.phone` empty (LinkedIn rarely returns phone), `academics.degree` empty (provider-dependent), `dreamCompanies`/`targetFirms` omitted (optional, user skipped), `onboardingIntent` omitted (optional, user skipped). Minimum set complete.
- **Manual path:** `profile.phone`, `profile.linkedinUrl`, `academics.degree` empty; `dreamCompanies`/`targetFirms` omitted; **no `resumeParsed`** (above). Minimum set minus resumeParsed complete.

## careerTrack values normalize through the real consumer function

Proven live via `normalize_career_track` (`industry_classifier.py`, the function email + warmth use to derive industry from the stored careerTrack):

```
stored 'investment banking'  -> 'investment_banking'
stored 'consulting'          -> 'consulting'
stored 'tech'                -> 'tech'
stored 'private equity'      -> 'private_equity'
stored 'venture capital'     -> 'venture_capital'
stored 'product management'  -> 'tech'
stored 'finance'             -> 'finance'
stored 'Sales & Trading'     -> 'sales & trading'   (no canonical bucket — accepted; tone won't fire)
stored 'Other'               -> 'other'             (no bucket — accepted)
```

`targetIndustries` values (`Investment Banking`, `Consulting`, `Technology`, `Private Equity`, `Venture Capital`, `Product Management`, `Finance`) all resolve through `_resolve_industry` / `INDUSTRY_ALIASES` to real sectors (e.g. `technology→Tech`, `private equity→Finance`). (Live import of that function hit a pre-existing `from backend.app.config` path quirk in the `school_affinity→pdl_client` chain, unrelated to these changes; verified against the alias map.)

## No consumer read path changed except the parse fixes

Full changed-file set (`git status`):

| File | Change | Category |
|------|--------|----------|
| `backend/app/routes/resume.py` | `@require_firebase_auth` + read `request.firebase_user` | **parse fix (allowed)** |
| `backend/app/utils/linkedin_enrichment.py` | `backfill_education` helper | **parse fix (allowed)** |
| `backend/app/routes/enrichment.py` | call `backfill_education` | **parse fix (allowed)** |
| `backend/app/routes/users.py` | onboarding-event step allow-list | analytics endpoint (not a profile read) |
| `backend/app/config.py` | free credits 500→300 | constant (Part-2 cleanup) |
| `connect-grow-hire/src/lib/constants.ts` | free credits 500→300 | constant |
| `connect-grow-hire/src/pages/OnboardingFlow.tsx` | rewritten flow | writer |
| `connect-grow-hire/src/pages/OnboardingProfile.tsx` | Phase-2 parse read (now orphaned) | writer |
| `connect-grow-hire/src/pages/SignIn.tsx` | Gmail deferral | auth/nav |
| new: `OnboardingSource/Confirm/Direction/Trial.tsx`, `careerTrackMapping.ts`, `onboardingPrefill.ts` | new flow | writer/util |

**None** of the consumer read modules was touched: `warmth_scoring.py`, `personalization.py`, `reply_generation.py`, `company_recommendations.py`, `scout_assistant*.py`, `job_board.py`, `job_ranking.py`, `coffee_chat_prep.py`, `recruiter_finder.py`, `networking_roadmap.py`, `nudge_service.py`, `briefing.py`, `agent_actions.py`, `firebaseApi.ts` (`getUserOnboardingData`), `DashboardPage.tsx`, `RecommendedJobs.tsx`, `suggestionChips.ts`, `promptGallery.ts`. The `users.py` and `config.py` diffs were inspected line-by-line and contain only the analytics allow-list and the credit constant respectively.

## Verdict

- **Résumé path:** full minimum set + resumeParsed. ✅
- **LinkedIn path:** full minimum set + resumeParsed (via Bug 2 education backfill). ✅
- **Manual path:** minimum set minus resumeParsed (accepted, by design); required-field gate guarantees name/university/major/graduationYear/careerTrack are present. ✅
- **No consumer read path changed** beyond the allowed parse fixes. ✅

## Not covered by deterministic validation (needs a live signed-in run)

These are correct by construction but unverified against a real Firestore write + live providers:
1. `/api/parse-resume` and `/api/enrich-linkedin-onboarding` actually persisting `resumeParsed` for an authenticated user (the server-side writes exist in code; not exercised here).
2. Real PDL/Bright Data education coverage for an arbitrary LinkedIn profile (backfill logic is unit-tested with mocks; real coverage varies by profile).
3. Stripe Checkout redirect on "Try for free" end-to-end.

Recommend a single manual smoke test (sign in as a throwaway user, run all three paths, inspect the `users/{uid}` doc) before shipping.
