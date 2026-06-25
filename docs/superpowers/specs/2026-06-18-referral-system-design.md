# Referral System — Design

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan

## Goal

Let users earn a free month of Elite by referring friends. A user shares a referral
link; when **5 people sign up** through it, the referrer can claim **one free month
of Elite that auto-converts to paid** (a Stripe trial month — billed at the normal
Elite price after 30 days unless cancelled).

## Key Decisions

- **Qualifying event:** a referred person just **signs up** (creates a brand-new
  account). No activation/onboarding bar.
- **Reward at 5:** the referrer unlocks a "claim" button that starts a **Stripe
  Checkout for Elite with a 30-day free trial** — card required up front, $0 today,
  auto-bills Elite after 30 days. This is what makes "free month, then we charge them
  next month" work.
- **Card required to claim:** yes. Since it converts to paid, the referrer enters a
  card at claim time.
- **If the claimer is already paying (Pro/Elite):** give them **one month of account
  credit** instead — a 100%-off one-month Stripe coupon applied to their existing
  subscription so the next invoice is $0. Same value, different mechanism (starting a
  "trial" on an active sub doesn't make sense).
- **Stripe owns the free-month clock.** Because the reward is a Stripe trial / coupon,
  we do **not** build a custom "grant + expiry cron." This removes a fragile piece the
  initial exploration assumed we'd need.

## Data Model

New fields on `users/{uid}`:

| Field | Type | Notes |
|-------|------|-------|
| `referralCode` | string | Short unique code, generated lazily on first request |
| `referredBy` | string | The code that brought this user in. Set once, at signup. |
| `referralQualifiedCount` | int | Denormalized counter of qualified signups |
| `referralRewardClaimed` | bool | One reward per referrer in v1 |
| `referralRewardClaimedAt` | timestamp | When the reward was claimed |

Helper collections:

- `referralCodes/{code}` → `{ uid }` — fast code→owner lookup at signup time.
- `users/{ownerUid}/referrals/{referredUid}` → `{ signedUpAt }` — audit trail + dedupe.
  One doc per referred person; existence of this doc makes attribution idempotent.

## Flow

### 1. Get your link
`GET /api/referrals/me` (auth required) returns:
```json
{
  "referralCode": "abc123",
  "referralLink": "https://offerloop.ai/signin?ref=abc123",
  "signupCount": 3,
  "signupTarget": 5,
  "eligible": false,
  "rewardClaimed": false,
  "rewardClaimedAt": null
}
```
Generates the `referralCode` (and the `referralCodes/{code}` lookup doc) on first call
if missing.

### 2. Capture at signup
- `SignIn.tsx` reads `?ref=CODE` from the URL and stores it in
  `localStorage('offerloop_ref')`.
- Immediately after a **brand-new** account is created (in `FirebaseAuthContext`),
  the frontend calls `POST /api/referrals/attribute { code }`.
- Backend validation, all server-side (never trusts the client):
  - code exists in `referralCodes/{code}`
  - referred uid is not the code owner (self-referral block)
  - referred user's email does not match the owner's (extra self-referral guard)
  - the new user has no `referredBy` yet (attribution happens once)
  - no existing `users/{ownerUid}/referrals/{referredUid}` doc (dedupe)
- On success: set `referredBy` on the new user, write the
  `users/{ownerUid}/referrals/{referredUid}` doc, atomically `+1` the owner's
  `referralQualifiedCount`, and create a notification for the owner ("X/5 referred").

### 3. Hit 5
When `referralQualifiedCount >= 5` and `referralRewardClaimed == false`, the owner is
`eligible`. Account settings shows a "Claim your free month" button. A notification
fires on each qualifying signup so the user sees progress.

### 4. Claim
`POST /api/referrals/claim` (auth required). Re-checks eligibility server-side, then:

- **Free user:** create a Stripe Checkout session for Elite with
  `subscription_data.trial_period_days=30` and metadata `referral_reward=true`.
  Returns the checkout URL. The existing `checkout.session.completed` webhook handler
  already sets `subscriptionTier=elite` / `subscriptionStatus=trialing`. On completion,
  mark `referralRewardClaimed=true` + `referralRewardClaimedAt`.
- **Already paying (Pro/Elite):** apply the 100%-off one-month coupon
  (`STRIPE_REFERRAL_REWARD_COUPON_ID`) to their existing subscription so the next
  invoice is $0. Mark `referralRewardClaimed=true` + `referralRewardClaimedAt`
  immediately.

## Anti-Abuse (signup-count only)

- Self-referral blocked (owner-uid check + email-match check).
- One `referrals/{referredUid}` doc per referred user → no double counting, attribution
  is idempotent.
- One claimable reward per referrer (lifetime in v1). "Repeatable every 5" is a
  deliberate future toggle, not built now (YAGNI).

## Backend Components

- New blueprint `referrals_bp` at `/api/referrals`, registered in `wsgi.py`.
  - `GET /api/referrals/me` — status
  - `POST /api/referrals/attribute` — record a signup against a code
  - `POST /api/referrals/claim` — claim the reward
- New service `services/referral_service.py` — code generation, attribution,
  eligibility check, claim logic. Function-based, matching existing service style.
- Reuse existing Stripe checkout creation + `checkout.session.completed` webhook path.
- New env var `STRIPE_REFERRAL_REWARD_COUPON_ID` (added to `config.py`).

## Frontend Components

- `SignIn.tsx` — capture `?ref=CODE` into `localStorage`.
- `FirebaseAuthContext` — after first account creation, call
  `POST /api/referrals/attribute`.
- `AccountSettings.tsx` — new "Refer & Earn" section: referral link + copy-to-clipboard,
  progress `X / 5`, claim button (when eligible), and claimed-state messaging.

## Testing (backend pytest)

- Code generation is idempotent (same code on repeat calls).
- Attribution increments the counter and writes the referral doc.
- Attribution dedupes (second call for same referred uid is a no-op).
- Self-referral is blocked (uid match and email match).
- Eligibility flips to true at 5 qualified signups.
- Free-user claim creates a trial checkout session (Stripe mocked).
- Paid-user claim applies the coupon (Stripe mocked).
- Reward can only be claimed once.

## Out of Scope (v1)

- Repeatable rewards (another month per additional 5 referrals).
- Referred-user-side incentive (e.g., the new user also gets a perk).
- Activation-based qualification (signup-only for now).
- Custom grant-expiry cron (Stripe owns the clock).
