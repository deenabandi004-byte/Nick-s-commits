# Onboarding Rewrite — Phase 3 Report

**Date:** 2026-06-03
**Scope:** Build the new 5-step flow writing exactly the approved write-map paths. Stop before Phase 4 validation.

## New flow (step 1 = Google sign-in, steps 2–5 in OnboardingFlow)

| Step | Component | Collects | Writes |
|------|-----------|----------|--------|
| 1. Google sign-in | `SignIn.tsx` | — | (Gmail OAuth removed from this path) |
| 2. Resume / LinkedIn / manual | `OnboardingSource.tsx` | resume file, LinkedIn URL, or manual choice | runs parse/enrich (server-side persists `resumeParsed`/`linkedinResumeParsed`) |
| 3. Confirm | `OnboardingConfirm.tsx` | firstName, lastName, email, phone?, university, major, degree?, graduationYear | `profile.*`, `academics.*`, top-level `university` |
| 4. Direction | `OnboardingDirection.tsx` | intent (optional), careerTrack (required), dreamCompanies (optional) | `careerTrack`+`goals.careerTrack`, `targetIndustries`+`goals.targetIndustries`, `dreamCompanies`+`goals.dreamCompanies`+`targetFirms`, `onboardingIntent` |
| 5. Trial upsell | `OnboardingTrial.tsx` | "Try for free" (per tier) or "Continue on free" | finalizes onboarding, then Stripe Checkout or app |

**Cut:** standalone Academics page (folded into Confirm), Career Preferences/Location page, jobTypes checkboxes. No `location` object is written.

## Step 2 gate (clarification #1) — confirmed

The "Continue" button gate is:

```ts
const linkedinValid = /linkedin\.com\/in\//i.test(linkedinUrl);
const canContinue = !!resumePrefill || linkedinValid;   // OnboardingSource.tsx
```

Plus a separate **"I'll enter it manually"** button that proceeds with `entryPath: "manual"`. So the three first-class ways to proceed are: a parsed résumé, a valid LinkedIn URL, or the explicit manual choice. Résumé is **not** required; no cross-nagging (a valid LinkedIn alone passes the gate, and vice-versa).

## Prefill result per entry path (clarification #2)

Single resolver: `resolvePrefill(resume, linkedin)` = resume value → LinkedIn value → empty, per field (`onboardingPrefill.ts`). Verified deterministically:

- **Resume-only** (`resolvePrefill(resumePrefill, null)`): **university, major, graduationYear all prefill.**
  `{"university":"University of Southern California","major":"Business Administration","graduationYear":"2026"}` (from `May 2026`). Bug 1's nested-shape read is what makes this work.
- **LinkedIn-only** (`resolvePrefill(null, linkedinPrefill)`): **university, major, graduationYear all prefill** — *this is the path Bug 2 was blocking.* `{"university":"New York University","major":"Finance","graduationYear":"2025"}`. The enrichment route's `backfill_education` fires when the winning scrape tier (Firecrawl) lacks education, pulling it from PDL/Bright Data, so `academics.{university,major,graduationYear}` is populated and flows through `prefillFromLinkedin`.
- **Manual** (`resolvePrefill(null, null)`): `{"university":"","major":"","graduationYear":""}` — **Confirm opens empty; the required-field gate holds** (firstName, lastName, email, university, major, graduationYear all required before Continue enables).

> Caveat: LinkedIn-only prefill is only as complete as the providers' data. If PDL/Bright Data have no education for that profile, the academics come back empty and Confirm becomes the manual fallback (by design). The resolver and gate behavior are unconditional; the data completeness depends on provider coverage.

## Gmail deferral

- **Removed from signup:** `SignIn.tsx` `handleGoogleAuth` no longer checks Gmail / triggers OAuth after sign-in — it navigates straight to `/onboarding` or `/home`. The now-unused `initiateGmailOAuth` / `checkNeedsGmailConnection` helpers and the `apiService` import were removed. The `?connected=gmail` return-handling effect stays (for when Gmail is connected later).
- **Wired to outreach:** the Find/outreach surface (`ContactSearchPage.tsx`) already checks `gmailStatus()` on mount and shows a connect banner (`:1614-1619`) whose button calls `startGmailOAuth()`. That is the deferred connection point — the user is prompted at the outreach surface, not at signup.
- **Flag:** this is a proactive banner at the outreach surface, not a hard block on the send action itself. If you want a hard "connect Gmail before this draft sends" gate, that's a small follow-up on the draft-create action.

## Other behavior preserved / changed

- `needsOnboarding` gate, `returnTo` handling, and `/home` (→ `/dashboard`) landing preserved in `OnboardingFlow.persistOnboarding` + `resolveDestination`.
- Career track is a **real JS gate** (`disabled={!valid}` where `valid = !!careerTrackLabel`), not native `required`.
- careerTrack label/value split per §3c (`careerTrackMapping.ts`): UI shows the label, Firestore stores the canonical value + derived `targetIndustries`. PE/VC are two separate chips.
- Trial: "Try for free" finalizes onboarding then opens Stripe Checkout (existing `/api/create-checkout-session`, 30-day trial added server-side); "Continue on free" finalizes and drops into the app. Both write the same onboarding data first, so abandoning checkout still lands a completed free-tier user.
- Analytics: `onboarding-event` pings use the new step names (`source`/`confirm`/`direction`/`trial`); backend allow-list updated (`users.py`) to accept them (legacy names kept).
- Free-tier credits reconciled to **300** in `config.py` and `constants.ts` (was 500). No credit-granting logic touched.

## Verification

- **Production build:** `npm run build` ✓ built in 7.33s (only the pre-existing vendor-react chunk-size warning).
- **Typecheck:** `tsc --noEmit` — no errors in any touched file (the project has many pre-existing TS6133s elsewhere; Vite/esbuild is the build gate).
- **Three-path resolver check:** outputs above, produced by mirroring the resolver logic.
- **Backend:** `config.py`, `users.py` compile; Phase 2 backend suite still 102 passed.

## Files

New: `OnboardingSource.tsx`, `OnboardingConfirm.tsx`, `OnboardingDirection.tsx`, `OnboardingTrial.tsx`, `utils/careerTrackMapping.ts` (+ `utils/onboardingPrefill.ts` extended).
Changed: `OnboardingFlow.tsx` (rewritten), `SignIn.tsx`, `backend/app/routes/users.py`, `backend/app/config.py`, `connect-grow-hire/src/lib/constants.ts`.
Orphaned (left in place, dead but valid; cleanup is a follow-up): `OnboardingProfile.tsx`, `OnboardingAcademics.tsx`, `OnboardingGoals.tsx`, `OnboardingLocationPreferences.tsx`, `OnboardingWelcome.tsx`.

## Flags for Phase 4 / later

1. Gmail deferral is a proactive banner, not a hard send-gate (above).
2. Orphaned old step components left in place — safe to delete in a cleanup pass.
3. Trial page shows $14.99 Pro / $34.99 Elite (mirrors `Pricing.tsx`); the known $14.99-display-vs-$9.99-charge gap is your separate copy task.
4. LinkedIn-only academic completeness depends on PDL/Bright Data coverage (above).
