# Pricing Overhaul - Launch Checklist

Punch list to finish the pricing rework. Branch: `pricing-overhaul` (4 commits ahead of `main`).

What's already done is in `docs/pricing-recommendations.md`. This doc tracks what's left.

---

## Status snapshot

**Shipped on branch:**
- Tier configs: Free 500 / Pro 3,000 / Elite 12,000 credits; 5/15/30 contacts per search
- `.edu` detection at signup → `isStudent` + `verifiedEduEmail` on user doc
- Trial split: 30 days for `.edu`, 14 days otherwise
- Stripe subscription metadata: `studentLockIn` flag set at checkout
- Public `/pricing` page with two toggles (Monthly/Annual + 🎓 .edu Student Price)
- Pro = single agent + unlimited meeting; Elite = multi-agent (up to 5)
- Monthly credit-refill cron (safety net for annual subs)
- Comparison table, FAQ, money-back banner all updated
- Frontend constant-drift fixed

**Not yet done:** see below.

---

## 1. Stripe dashboard (you do this)

### 1a. Create the 4 new Price objects

Open https://dashboard.stripe.com/products. For each existing product (Offerloop Pro, Offerloop Elite), click **Add price** and create:

| Product | New price | Interval | Nickname (optional) |
|---|---|---|---|
| Offerloop Pro | **$149.00** | year | `pro-annual-student` |
| Offerloop Pro | **$29.00** | month | `pro-monthly-list` |
| Offerloop Elite | **$349.00** | year | `elite-annual-student` |
| Offerloop Elite | **$59.00** | month | `elite-monthly-list` |

Each will give you a `price_xxx` ID. Save them.

**Do NOT** use Stripe Coupons for the student discount. Use these separate Price objects.

### 1b. Add env vars

**Backend (Render dashboard + local `.env`):**
```
STRIPE_PRO_ANNUAL_PRICE_ID=price_xxx
STRIPE_ELITE_ANNUAL_PRICE_ID=price_xxx
```

**Frontend (Render env + `connect-grow-hire/.env.production`):**
```
VITE_STRIPE_PRO_ANNUAL_PRICE_ID=price_xxx
VITE_STRIPE_ELITE_ANNUAL_PRICE_ID=price_xxx
```

The list-price ($29 / $59) IDs are not used yet by checkout - see section 3a if you want to wire them.

### 1c. Confirm webhook endpoint still points at production

In Stripe → Developers → Webhooks: verify the endpoint URL is `https://offerloop.ai/api/stripe-webhook` (or whatever the current path is) and that it's listening for at minimum: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`.

---

## 2. Backend code work (I can do these - they need Stripe Price IDs to exist first)

### 2a. Map annual Price IDs to tier in `get_tier_from_price_id`

**File:** `backend/app/services/stripe_client.py:12`

Current function only knows about `STRIPE_PRO_PRICE_ID` and `STRIPE_ELITE_PRICE_ID`. When annual subscriptions arrive at the webhook, the price ID won't match - current code defaults to `'pro'`, which means **an Elite annual customer would get Pro credits**. Critical to fix before going live with annual.

Update to also check `STRIPE_PRO_ANNUAL_PRICE_ID` and `STRIPE_ELITE_ANNUAL_PRICE_ID`.

### 2b. Backfill `isStudent` on existing users

**Why:** the `.edu` detection only fires for *new* signups. ~300 existing users have no `isStudent` field - `loadUserData` defaults them to `false`, so they'd get the 14-day trial badge and lose the student-price-for-life claim.

**Fix:** a one-off Firestore migration script:

```python
# backend/scripts/backfill_is_student.py
from app.extensions import get_db
from app.models.users import _is_edu_email

db = get_db()
updated = 0
for doc in db.collection('users').stream():
    data = doc.to_dict() or {}
    if 'isStudent' in data:
        continue  # already set
    email = data.get('email') or ''
    is_student = _is_edu_email(email)
    doc.reference.update({
        'isStudent': is_student,
        'verifiedEduEmail': email if is_student else None,
    })
    updated += 1
print(f"Backfilled {updated} users")
```

Run once against prod after the branch is deployed.

### 2c. Backend feature-gate fixes to match UI claims

Two real mismatches between what the UI now claims and what backend enforces:

| Feature | UI says | `backend/app/config.py` says |
|---|---|---|
| Smart filters on Free | yes | `'smart_filters': False` at line 190 |
| Custom email templates on Free | yes | unclear - `personalized_templates: False` at line 194, but that field may be for the resume-personalized variant, not user-created template library |

**Action:**
- Flip Free's `'smart_filters'` to `True` (line 190 in `backend/app/config.py`)
- Audit what `personalized_templates` actually gates vs. what "custom email templates" means in the codebase. They may be different features. Either add a new `custom_email_templates: True` field on every tier, or change UI wording.

### 2d. Wire `studentLockIn` metadata into upgrade flow

**File:** `backend/app/services/stripe_client.py` `update_subscription_tier` (~line 415) and `handle_subscription_updated` (~line 364)

Right now `studentLockIn` is set as metadata at first checkout, but the upgrade flow (Pro → Elite) doesn't read it. If we ever wire the list-price ($29/$59) checkout, we'd need this so a verified .edu user always gets routed to the student price even when their session changes plans.

Low priority until list-price checkout is wired.

---

## 3. Optional / defer until needed

### 3a. List-price ($29/$59) checkout wiring

The toggle to show list price exists in the UI, but checkout still uses the student Price IDs ($14.99/$34.99) regardless. To actually charge non-students the list price:

1. Set `STRIPE_PRO_LIST_PRICE_ID` and `STRIPE_ELITE_LIST_PRICE_ID` env vars
2. Update `handleStripeCheckout` in `connect-grow-hire/src/pages/Pricing.tsx` to route to list price when `!isStudent` (server-truth, not toggle)
3. Update `get_tier_from_price_id` to map list-price IDs to tiers

**Recommendation:** defer this. Your target market is ~100% students. The toggle is mostly a visual demo of the discount. If non-student paid signups become a meaningful slice, wire it then.

### 3b. Hide the .edu toggle for non-student logged-in users

If a logged-in user has `isStudent: false`, the toggle gives them a misleading hint that toggling on saves them money - but they can't actually unlock the student price without re-signing-up with .edu. Could hide the toggle or disable it for verified non-students. Defer.

### 3c. Pro → Elite upgrade smoke test

Verify a Pro user clicking "Upgrade to Elite" in the new pricing page flow correctly: prorates correctly, doesn't restart the trial, retains `studentLockIn` metadata. Should work with existing code, but worth one manual test in Stripe test mode.

---

## 4. Testing checklist (do before merging to main)

Run locally with `python3 backend/wsgi.py` + `cd connect-grow-hire && npm run dev`:

- [ ] Sign up with `firstname.lastname@usc.edu` → Firestore user doc has `isStudent: true`, `verifiedEduEmail: "...@usc.edu"`
- [ ] Sign up with `name@gmail.com` → `isStudent: false`, `verifiedEduEmail: null`
- [ ] Logged-out `/pricing` shows toggle ON by default, strikethrough visible, `30-day free trial` badge
- [ ] Toggle OFF → prices change to $29/$59, badge says `14-day free trial`, no `.edu required` pill
- [ ] Click "Start Free Trial" while logged out → redirects to `/signin?next=/pricing&plan=pro`
- [ ] Annual toggle pill says **"2 MONTHS FREE"**, switching shows $12.42/mo (Pro) and $29.08/mo (Elite)
- [ ] Backend log shows `Monthly credit refill thread registered (first run in 1 hour)`
- [ ] Logged-in `.edu` user sees subtitle: *"Welcome, student - your .edu unlocks ~50% off and a 30-day free trial."*
- [ ] After Stripe SKUs created + env vars set: annual checkout completes → user gets correct tier + 30-day trial
- [ ] Webhook delivers an annual `invoice.paid` event → user credits refill to tier max (not double-charged, not skipped)

---

## 5. Marketing / doc updates (low priority, do post-launch)

- [ ] **`CLAUDE.md`** Tier & Credit System section (~line 200) - table still shows old 300/1500/3000 credits and old contact caps. Update to match.
- [ ] **`connect-grow-hire/public/llms.txt`** - if it lists pricing/tier features for AI crawlers, sync.
- [ ] **`/compare/*` SEO landing pages** - they have public pricing. Sweep for old $19.99 / 1,500 credits / interview prep / founder kickoff mentions.
- [ ] **Helmet meta descriptions** on auth-gated pages mention pricing - re-check.

---

## Launch sequence (suggested order)

1. **You:** create 4 Stripe Prices in dashboard, copy IDs
2. **You:** add env vars to Render (backend + frontend) and local `.env`
3. **Me:** update `get_tier_from_price_id` to recognize the annual Price IDs (section 2a)
4. **Me:** write + run the `isStudent` backfill script (section 2b)
5. **Me:** fix Free `smart_filters: True` + audit `custom_email_templates` (section 2c)
6. **You:** run testing checklist (section 4)
7. **You:** merge `pricing-overhaul` → `main`, push
8. **You:** verify production behavior matches local (especially Stripe webhook + annual)
9. Post-launch: sweep marketing/SEO content (section 5)

Total remaining backend work after Stripe setup: ~1 focused hour. Then this is shipped.
