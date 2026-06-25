# Offerloop Pricing/Credit Overhaul — Cutover Guide

This document is for Nick (or anyone running the cutover). It covers everything you need to do to take the `promo-video` branch from "merged into your tree" to "running correctly in production."

Read it top to bottom once before doing anything. The order matters — especially the migration scripts (Section 7).

---

## 0. TL;DR

The `promo-video` branch contains two distinct chunks of work:

1. **Outside-the-app rebuild** — new landing page (`Index.tsx`), redesigned About, new For Students page, new Promo page, 6 SEO landing pages, all marketing assets including testimonial photos and an embedded video (`hero-product.mp4`). Pure pre-sign-in marketing surface.
2. **Pricing & credit system overhaul** — backend services for a three-bucket credit ledger, Stripe-driven pricing catalog with credit slider, post-checkout Pro→Elite upsell, refund policy backend stub, 14-day Pro free trial with daily credit rate-limit, 5 lifecycle email sequences with hourly cron, top-up purchase flow. New frontend components: credit slider, top-up modal, trial banner, post-checkout upsell. The pricing page (`Pricing.tsx`) is fully rebuilt to drive all of this.

The code is on `promo-video` as commit `5889640`. Pulling the branch gets you the code. Making it actually work in production requires Steps 1–7 below.

---

## 1. Get the code

```bash
git fetch origin
git checkout promo-video       # work directly on the branch
# OR
git merge origin/promo-video   # merge into your current branch
```

Verify your working tree is clean afterward:

```bash
git status   # should show nothing or only your own local changes
```

---

## 2. Sanity check it boots

No new npm or pip dependencies were added. The existing stack should boot as-is.

```bash
# Backend
cd backend
python3 wsgi.py
# → expect: server boots on :5001, no missing-env warnings beyond the ones you already see

# Frontend
cd connect-grow-hire
npm install   # safety net — nothing should actually install
npm run dev
# → expect: Vite dev server on :8080
```

Then open `http://localhost:8080/pricing` — you should see the new design (sliders, Season Pass card, top-up packs, vibrant magenta accents).

If anything fails to boot, check that no env vars went missing. The new code adds env-driven defaults but never *requires* a new env var at boot time.

---

## 3. Stripe dashboard setup

### 3a. Create Price IDs

The legacy `STRIPE_PRO_PRICE_ID` and `STRIPE_ELITE_PRICE_ID` you already have are still in use — they're mapped to the new default slider stops (2K Pro at $14.99/mo, 5K Elite at $34.99/mo). Existing subscribers won't break.

For new slider stops and audience variants, create the following Stripe Prices and copy their IDs. **Every one of these is optional** — if you don't create it, the frontend gracefully shows "Coming soon" instead of letting users click through to a broken Stripe page.

| Tier | Cadence | Audience | Credits | Suggested price | Env var |
|---|---|---|---|---|---|
| Pro | Monthly | Student | 1K | $9.99 | `STRIPE_PRO_MONTHLY_STUDENT_1K` |
| Pro | Monthly | Student | 2K (default) | $14.99 | `STRIPE_PRO_MONTHLY_STUDENT_2K` *(legacy `STRIPE_PRO_PRICE_ID` already covers)* |
| Pro | Monthly | Student | 3K | $19.99 | `STRIPE_PRO_MONTHLY_STUDENT_3K` |
| Pro | Monthly | Student | 4K | $24.99 | `STRIPE_PRO_MONTHLY_STUDENT_4K` |
| Pro | Monthly | List | 2K | $29 | `STRIPE_PRO_MONTHLY_LIST_2K` |
| Pro | Annual | Student | 2K | $144/yr | `STRIPE_PRO_ANNUAL_STUDENT_2K` |
| Pro | Annual | List | 2K | $279/yr | `STRIPE_PRO_ANNUAL_LIST_2K` |
| Elite | Monthly | Student | 3K | $24.99 | `STRIPE_ELITE_MONTHLY_STUDENT_3K` |
| Elite | Monthly | Student | 5K (default) | $34.99 | `STRIPE_ELITE_MONTHLY_STUDENT_5K` *(legacy `STRIPE_ELITE_PRICE_ID` already covers)* |
| Elite | Monthly | Student | 7K | $49.99 | `STRIPE_ELITE_MONTHLY_STUDENT_7K` |
| Elite | Monthly | List | 5K | $59 | `STRIPE_ELITE_MONTHLY_LIST_5K` |
| Elite | Annual | Student | 5K | $336/yr | `STRIPE_ELITE_ANNUAL_STUDENT_5K` |
| Elite | Annual | List | 5K | $566/yr | `STRIPE_ELITE_ANNUAL_LIST_5K` |
| Season Pass | One-time | Student | (entire 4-mo pass) | $99 | `STRIPE_SEASON_PASS_STUDENT` |
| Season Pass | One-time | List | | $199 | `STRIPE_SEASON_PASS_LIST` |
| Top-up | One-time | — | 500 cr | $4.99 | `STRIPE_TOPUP_500` |
| Top-up | One-time | — | 1,000 cr | $9.99 | `STRIPE_TOPUP_1000` |
| Top-up | One-time | — | 3,000 cr | $24.99 | `STRIPE_TOPUP_3000` |

**Source of truth:** `backend/app/config.py` → `STRIPE_PRICE_CATALOG`. The dict structure shows exactly how each env var is mapped.

### 3b. Create coupons

| Code | Discount | Duration | Env var |
|---|---|---|---|
| `STAYHIRED` | 20% off Pro first month | `duration: once` | `STRIPE_PRICING_RECAPTURE_COUPON_ID` |
| `WARMINTRO` | 20% off Pro first month | `duration: once` | `STRIPE_CHECKOUT_RECOVERY_COUPON_ID` |
| `WELCOMEBACK` | 50% off Pro first month | `duration: once` | `STRIPE_WINBACK_COUPON_ID` |

When you create the coupon in Stripe, you get back an internal ID like `coupon_OXxxxxxxxx`. That's what goes in the env var. The `STAYHIRED` / `WARMINTRO` / `WELCOMEBACK` strings are what users type at checkout.

**Important:** The code only advertises these codes in emails and exit-intent badges when the env var is populated. Empty env var → no code shown to users, no risk of advertising something that won't work.

The post-checkout Pro→Elite upsell does **NOT** use a coupon — it uses a one-time `InvoiceItem` for $10 plus a `Subscription.modify` to switch the plan. No coupon needed there.

### 3c. Enable webhook event

In Stripe → Webhooks → your webhook endpoint → add the event type:

- `checkout.session.expired`

You should already have `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`, and `customer.subscription.updated` enabled. The new code adds a handler for `checkout.session.expired` which stamps `checkoutAbandonedAt` on the user doc so the lifecycle Sequence 2 (checkout abandonment) email can fire.

---

## 4. Environment variables

Add these to Render (production) and your local `.env` (for dev testing). Most have safe defaults if you leave them blank — the system degrades gracefully rather than crashing.

### Stripe Price IDs

See Section 3a. All 19 vars listed there.

### Stripe coupon IDs

See Section 3b. Three vars.

### Lifecycle email infrastructure

```
LIFECYCLE_CRON_SECRET            # random string (>= 32 chars). Shared between Render cron and Flask route.
LIFECYCLE_UNSUBSCRIBE_SECRET     # random string. HMAC-signs unsubscribe tokens. Don't change after launch.
LIFECYCLE_TICK_URL               # https://offerloop.ai/api/lifecycle/tick (for the cron job to hit)
PUBLIC_BASE_URL                  # https://offerloop.ai (used in email CTAs + unsubscribe links)
REFUND_ALERT_EMAIL               # support@offerloop.ai (where refund requests fire alerts to)
LIFECYCLE_SIGNATURE_NAME         # "Rylan" (the name signing lifecycle emails — change to whoever should sign)
```

### Trial config (already has defaults, but tunable)

```
TRIAL_DAYS_NON_STUDENT           # 14 (default)
TRIAL_DAYS_STUDENT               # 14 (default — currently unified, no .edu extension)
TRIAL_DAILY_CREDITS              # 600 (default — 60 emails/day max during trial)
TRIAL_DAILY_EXPORT_CAP           # 25 (default — anti-scrape)
TRIAL_CC_EXTENSION_DAYS          # 7 (default — bonus days if user adds CC at trial start)
```

### Resend (you already have these — just verify)

```
RESEND_API_KEY                   # already configured for Loop notifications
RESEND_FROM_EMAIL                # IMPORTANT: needs DNS records (see Section 5)
```

### Season Pass gating

```
SEASON_PASS_OPEN_DATE            # 2026-08-09 (default — Season Pass is new-only until this date)
```

### Free drafts cap (currently off — credits naturally gate)

```
FREE_DRAFTS_PER_MONTH            # 0 (default — unlimited within credit budget. Bump to enforce a hard cap.)
```

**Source of truth for all env var names:** `backend/app/config.py`.

---

## 5. Resend DNS records

The `from` address on lifecycle emails (whatever you set `RESEND_FROM_EMAIL` to — e.g., `rylan@offerloop.ai` or `team@offerloop.ai`) needs three DNS records at your domain registrar:

1. **SPF** — authorizes Resend to send on your behalf
2. **DKIM** — cryptographically signs outgoing mail
3. **DMARC** — tells receiving servers what to do with unsigned mail

Resend's dashboard tells you the exact records to add (host, type, value). Without these:
- Gmail and Outlook flag the emails as spam or reject them outright
- Some providers won't even deliver them to the spam folder

**Verification:** After adding the records, Resend dashboard shows a green checkmark for each. Then send a test email to a Gmail address and a Hotmail address — both should land in the inbox, not spam.

---

## 6. Render cron setup

Lifecycle Sequences 1, 2, 3, and 5 (pricing abandonment, checkout abandonment, trial ending, win-back) are time-based — they need a cron to walk Firestore and check who's due for an email. Sequence 4 (low credits) is real-time, fired from the credit deduct path, so it doesn't need cron.

In Render dashboard → New → Cron Job:

- **Name:** `lifecycle-emails`
- **Schedule:** `0 * * * *` (top of every hour)
- **Command:** `python backend/scripts/run_lifecycle_cron.py`
- **Environment variables:** make sure `LIFECYCLE_CRON_SECRET` and `LIFECYCLE_TICK_URL` are set on the cron job (or inherited from the service if Render supports that for your setup).

Without this cron job, the lifecycle email sequences exist as code but never actually fire. Users in mid-trial don't get the "2 days left" email, canceled users don't get the 30-day win-back, etc.

---

## 7. Migration scripts (run in this order, ONCE, at cutover)

These are one-shot scripts that update existing Firestore user docs. **Run order matters. Run dry-run first, verify the counts, then run with `--apply` for real.**

### 7a. CRITICAL: Double existing credit balances

The new pricing math is 10 credits = 1 email. The old math (before doubling) was 5 credits = 1 email. So `find_contact` now costs 10 credits instead of 5. An existing Pro user has 1,000 credits in their Firestore record — under the new math, that's only 100 emails instead of 200.

This script doubles every existing user's balances so they don't lose email capacity:

```bash
# Dry run — prints what would change, writes nothing
python backend/scripts/migrate_double_credits.py

# Apply — actually doubles the balances
python backend/scripts/migrate_double_credits.py --apply
```

The script is idempotent via a `creditsDoubled20260610` flag on each user doc. Re-running won't double-double anyone.

**This must run BEFORE deploying the new code to production.** If the code goes live before the migration, every existing paid user temporarily has half their email allowance until they hit the next monthly billing cycle.

### 7b. Backfill `.edu` student status

Existing users with `.edu` emails who signed up before the `isStudent` detection was wired are flagged in Firestore. This script walks the user collection, matches `.edu` regex, and sets `isStudent: true` + `studentEmailDomain` + `studentVerifiedAt`.

```bash
# Dry run
python backend/scripts/backfill_is_student.py

# Apply
python backend/scripts/backfill_is_student.py --apply
```

Without this, legacy `.edu` users would fail the student-SKU audience validation at Stripe checkout and get redirected to list pricing.

### 7c. Audit existing subscribers (READ-ONLY)

This script doesn't modify anything — it walks every Firestore user with `subscriptionTier in (pro, elite)`, retrieves their Stripe subscription, and checks whether the active Price ID is in our new `STRIPE_PRICE_CATALOG`. Prints a summary and flags any subscribers on Price IDs we don't recognize.

```bash
python backend/scripts/migrate_existing_subscribers.py

# Or for machine-readable output
python backend/scripts/migrate_existing_subscribers.py --json > audit.json
```

Expected output:
- Most users on `STRIPE_PRO_PRICE_ID` or `STRIPE_ELITE_PRICE_ID` → "ok_known_price"
- Any "unknown_price_needs_review" entries are users on Price IDs you should either add to the catalog OR manually migrate via `stripe.Subscription.modify`

This is the script to run **right before** deploying the new code to production, as a final sanity check.

---

## 8. Deployment order (the actual cutover)

Once Sections 3–7 are done, here's the actual cutover sequence:

1. **Migrate first, deploy second.** Run `migrate_double_credits.py --apply` against production Firestore. Then `backfill_is_student.py --apply`. Then `migrate_existing_subscribers.py` (the audit).
2. **Deploy backend.** Merge `promo-video` into your deploy branch and push. Render redeploys.
3. **Smoke test in prod.** Hit `/api/tier-config` and verify the JSON looks right. Visit `/pricing` and drag the slider. Click "Try Pro free for 14 days" with a test account and verify a trial gets created.
4. **Enable the Render cron job.** Set it to active.
5. **Send a test lifecycle email.** Manually `POST /api/lifecycle/tick` with the secret header to verify the cron route works end-to-end and an email actually lands in a real inbox.

---

## 9. Verification checklist

Tick these off after deploy:

- [ ] `/api/tier-config` returns valid JSON with all expected tiers, slider stops, top-up packs
- [ ] `/api/active-promos` returns an object (empty `{}` is fine if no coupons wired yet)
- [ ] `/pricing` renders with sliders, Season Pass card, top-up packs
- [ ] Drag the Pro slider — credit count and `/mo` price both update
- [ ] Toggle Annual — discount badge and per-month equivalent show
- [ ] Toggle `.edu` student price off — list prices show
- [ ] As a logged-in non-paying user, click "Start 14-Day Free Trial" — lands on `/find` with the trial banner showing days remaining
- [ ] In Firestore the user's doc has `trialActive: true`, `trialEndsAt`, `trialDailyCreditsRemaining: 600`
- [ ] Existing paying user's `credits` field doubled correctly post-migration
- [ ] Refund request from account settings (when wired) writes to `refund_requests/` and fires Resend alert to `REFUND_ALERT_EMAIL`
- [ ] Top-up modal opens. Click a pack — should either route to Stripe checkout (if Price ID wired) or show "coming soon" (if not).
- [ ] After completing a Pro checkout in test mode, post-checkout upsell screen shows on `/payment-success`. Click "Add Elite for $10 more" — Stripe charges $10, subscription switches to Elite, user's `credits`/`maxCredits` bump to Elite's.
- [ ] Cron job hits `/api/lifecycle/tick` hourly and returns `{ok: true, results: {...}}`

---

## 10. Known loose ends + limitations

These are things the code is aware of but doesn't fully solve:

- **`PricingExitPopup.tsx`** — exists in the codebase but is NOT mounted. Rylan removed the mount from `Pricing.tsx`. The component is kept as a file in case we want to re-enable. As long as it's unmounted, no exit-intent capture happens on `/pricing` and Sequence 1 (pricing abandonment) emails will never fire because no leads enter `lifecycle_leads`.
- **Server-side PostHog** — the `posthog` Python package isn't in `requirements.txt`. Server-side events like `trial_ending_48h`, `trial_ending_24h`, `checkout_abandoned` are not currently captured to PostHog. Frontend PostHog events work fine — `analytics.ts` has 12 new event helpers wired. If we want server-side parity, add `posthog` to `requirements.txt` and wire calls in `lifecycle_emails.py`.
- **Refund self-serve UI** — the backend route `POST /api/billing/request-refund` exists and writes to `refund_requests/` + alerts the team. The frontend hasn't built a form for users to submit requests. Until then, refunds flow via `support@offerloop.ai` email. Building the form is a small follow-up.
- **Season Pass new-user gate** — the `season_pass.new_users_only_until` field defaults to `2026-08-09`. After that date, existing paying users can also see the Season Pass. If we want to flip earlier or later, change the `SEASON_PASS_OPEN_DATE` env var.
- **Trial CC extension** — code mentions a +7-day extension if the user adds a credit card at trial start. Not currently wired through the UI. Easy to add when we want.
- **`.edu` magic-link verification** — for users without `.edu` emails who claim student status (e.g., international students), there's a planned magic-link flow that's not built yet. Currently only auto-detects from email TLD.

---

## 11. Where to look if something breaks

| Problem | First file to check |
|---|---|
| Pricing page won't render | `connect-grow-hire/src/pages/Pricing.tsx`, `connect-grow-hire/src/hooks/useTierConfig.ts` |
| Slider doesn't move | `connect-grow-hire/src/components/CreditSlider.tsx` |
| Credit deduction returning wrong balance | `backend/app/services/credit_ledger.py` (pure logic), `backend/app/services/auth.py` (wrapper) |
| Trial not starting | `backend/app/routes/users.py` (`/start-trial` route), `backend/app/services/trial_service.py` |
| Post-checkout upsell not appearing | `connect-grow-hire/src/pages/PaymentSuccess.tsx`, `backend/app/services/stripe_client.py` (`apply_post_checkout_upsell`) |
| Lifecycle emails not sending | `backend/app/services/lifecycle_emails.py`, `backend/app/routes/lifecycle.py`, `backend/scripts/run_lifecycle_cron.py`. Check Render cron logs. |
| Top-up purchase 404s | `backend/app/services/topup_service.py`, `backend/app/routes/billing.py` (`/create-topup-session` route). Likely the Stripe Price ID env var isn't set. |
| Refund request silent | `backend/app/services/refund_service.py`, `backend/app/routes/billing.py` (`/request-refund` route). Verify `REFUND_ALERT_EMAIL` env var. |
| Stripe webhook not firing | Stripe dashboard → Webhooks → recent deliveries. Check whether `checkout.session.expired` is enabled. |
| Stripe subscription rejected at checkout | `backend/app/services/stripe_client.py` audience validation. User probably has `isStudent: false` and is trying to use a student SKU. Run `backfill_is_student.py`. |

---

## 12. Single source of truth for product config

If you ever wonder "what does the system actually believe the price/credits/cost is for X":

| Question | File |
|---|---|
| Tier credit allocations + features | `backend/app/config.py` → `TIER_CONFIGS` |
| Slider stops + prices | `backend/app/config.py` → `SLIDER_STOPS` |
| Per-action credit costs | `backend/app/config.py` → `CREDIT_COSTS` |
| Top-up packs | `backend/app/config.py` → `TOPUP_PACKS` |
| Season Pass | `backend/app/config.py` → `SEASON_PASS` |
| Annual pricing | `backend/app/config.py` → `ANNUAL_PRICING` |
| Stripe SKU matrix | `backend/app/config.py` → `STRIPE_PRICE_CATALOG` |
| Stripe coupon mappings | `backend/app/config.py` → `STRIPE_COUPONS` |
| Trial duration + daily credits | `backend/app/config.py` → `TRIAL_*` constants |
| Refund windows | `backend/app/services/refund_service.py` → `REFUND_WINDOWS` |
| Three-bucket credit ledger | `backend/app/services/credit_ledger.py` |

The frontend reads most of this at runtime from `GET /api/tier-config` via the `useTierConfig` hook (`connect-grow-hire/src/hooks/useTierConfig.ts`). If you change a number in `config.py`, no frontend redeploy is needed — the next page load picks it up.

---

That's the whole thing. Once Sections 3–7 are done and the verification checklist (Section 9) is green, the overhaul is live.

Questions or things that don't make sense: ping Rylan, or open the relevant file from Section 11 and grep.
