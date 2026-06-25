# Handoff — Onboarding polish, credit-display parity, single-batch trial

**Date:** 2026-06-15
**Branch:** `swap/onboarding-on-main`
**Scope:** Frontend (React) + backend (Flask). **No Stripe SKU/key changes.** Backend changes require a deploy to take effect.

---

## TL;DR

Three buckets of work, all building green:

1. **Onboarding polish** — `.edu` nudge, resume copy fixes, multi-select career tracks, trial step matched to the pricing system.
2. **Credit-display parity + correctness** — every credit surface now reads from one trial-aware source; fixed a chip that showed half the real cost.
3. **Trial overhaul** — replaced the daily-credit-drip trial with a **single-batch grant (600 credits, 7 days)**, and fixed two bugs that broke the trial→paid upgrade.

---

## 1. Onboarding

- **Resume/LinkedIn step** (`OnboardingSource.tsx`): dropped the French "résumé" spelling → "resume"; reframed "résumé **or** LinkedIn" to encourage **both** (resume strongly recommended, LinkedIn even better paired), kept optional.
- **`.edu` capture** (`OnboardingProfileBasics.tsx`, `OnboardingFlow.tsx`): colored nudge to use a `.edu` email at sign-up; green confirmation when detected. Stored as a **separate `eduEmail` field** so it never overwrites the user's primary/login email. Sets `isStudent` for student pricing.
- **Career tracks** (`OnboardingTrack.tsx`): single-select → **multi-select** (chips + searchable dropdown). First pick is "primary" (drives the single `careerTrack` value the backend expects); target industries union across all picks. Persists `careerTracks[]` + `careerTrackLabels[]`.
- **Trial step** (`OnboardingTrial.tsx`): matched the Pricing page system — student `.edu` discount (strikethrough + % off), green trial pill, animated CTA, inline `.edu` re-entry, free plan demoted to a quiet link.

## 2. Credit-display parity

- **New `useCreditsView()` hook** (`hooks/useCreditsView.ts`): single source of truth for "what credits to show." Trial-aware (returns the trial pool during a trial, normal balance otherwise). For non-trial users it's behavior-identical to before.
- Routed **every** credit surface through it: sidebar (`AppSidebar`/`CreditsPanel`), Find contact chip, Companies chip, Coffee-chat upgrade banner, Job-board banner, Dashboard stat, Pricing manage-subscription banner.
- **Bug fixed:** the Find contact-cost chip showed `batchSize × 5` but the real cost is **10/contact** — it was displaying half price. Now reads `CREDIT_COSTS.find_contact`.
- Synced a stale fallback (`initialCreditsByTier`: pro 1500→2000, elite 3000→5000).

## 3. Trial model — daily drip → single batch

**Why we changed it.** The old model gave **300→600 credits/day for 14 days** (~8,400 total). That created three problems:
- It **punished early conversion** — upgrading meant forfeiting the remaining days of free credits, so the rational move was to wait out the trial.
- It **stacked** — exhaust ~8,400 free, then buy Pro for 2,000 more.
- It **gave away ~4× a paid month** (~$63 of value) with no credit card.

**New model (`trial_service.py`, `config.py`):**
- **One-time grant of 600 credits, 7-day window.** No daily refill.
- 7 days lets the find→send→reply loop close so the payoff lands before the window ends.
- Converting is now **always a gain, never a loss** — the upgrade trigger becomes "you ran out," fired exactly when the user is engaged.
- Give-away dropped **8,400 → 600** (~$63 → ~$4.50).

**Two upgrade bugs fixed (`stripe_client.py`, `Pricing.tsx`):**
- `trialActive` was **never cleared on upgrade**, so a user who *paid* for Pro/Elite stayed throttled to the trial pool until the window elapsed. Now cleared on all five paid-write paths.
- The Pricing page routed trial users (no Stripe sub) to the subscription-modify endpoint, which **400s** ("No active subscription"). Now gates on a real Stripe `subscriptionId` and sends them to checkout.

**Free tier is now monthly (`auth.py`):** Free coffee-chat preps (and alumni searches) reset each month instead of being lifetime-capped. Removes the sour note where a trial user spends Pro's preps and lands on Free with zero left forever.

**`.edu` in outreach (`utils/users.py` + email routes):** new `get_outreach_email()` resolver makes signatures, the clickable mailto, and recruiter outreach use the `.edu` when present. NOTE: this is the **displayed identity** only — Gmail always sends from the connected OAuth account, so the literal envelope sender is unchanged (can't be spoofed to `.edu`).

---

## ⚠️ Action items for you (cofounder)

| # | Item | Owner | Why it matters |
|---|------|-------|----------------|
| 1 | **Deploy the backend** | you | All trial/credit/Stripe/`.edu` logic is server-side and only takes effect after Render rebuilds. |
| 2 | **Verify Stripe SKUs charge the displayed price** | you | Pre-existing: if a catalog SKU isn't wired, checkout falls back to a legacy Price ID that may charge a different amount than the page shows. The trial now converts via checkout, so confirm Pro/Elite charge what's displayed. |
| 3 | **Decide trial numbers** (currently 600 cr / 7 days) | both | Env-driven: `TRIAL_CREDITS`, `TRIAL_DAYS_NON_STUDENT`. Change without a deploy if env-configured. |
| 4 | **(Optional) Firm-search cost chip** | eng | Uses a hardcoded `creditsPerFirm = 2` vs backend `firm_search = 10` — may have the same half-price issue the contact chip had. Not verified this session. |
| 5 | **(Optional) Add a `test_trial_service.py`** | eng | The new single-batch trial logic was verified by hand + compile, but has no automated test. |

---

## Verification status

- `vite build` — green. `tsc` — clean for all changed files (pre-existing unused-var warnings remain; build doesn't gate on them).
- Backend — `py_compile` clean on all changed files.
- The `trial_service.py` rewrite broke **no** tests. 4 pre-existing test failures are unrelated (a stale `COFFEE_CHAT_CREDITS == 15` assertion — it's 30 now — and 3 mocked-"API down" refund tests).

## Files touched

**Backend (11):** `config.py`, `routes/billing.py`, `routes/contact_import.py`, `routes/emails.py`, `routes/job_board.py`, `routes/linkedin_import.py`, `routes/runs.py`, `services/auth.py`, `services/stripe_client.py`, `services/trial_service.py`, `utils/users.py`

**Frontend (17):** `hooks/useCreditsView.ts` (new), `hooks/useTierConfig.ts`, `contexts/FirebaseAuthContext.tsx`, `components/AppSidebar.tsx`, `components/TrialBanner.tsx`, `components/sidebar/CreditsPanel.tsx`, `pages/OnboardingFlow.tsx`, `pages/OnboardingProfileBasics.tsx`, `pages/OnboardingSource.tsx`, `pages/OnboardingTrack.tsx`, `pages/OnboardingTrial.tsx`, `pages/Pricing.tsx`, `pages/ContactSearchPage.tsx`, `pages/FirmSearchPage.tsx`, `pages/CoffeeChatPrepPage.tsx`, `pages/JobBoardPage.redesign.tsx`, `pages/DashboardPage.tsx`
