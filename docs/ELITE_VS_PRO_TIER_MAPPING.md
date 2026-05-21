# Why Elite Plan Signups Can Show as Pro on Offerloop

This document explains why users who sign up for the **Elite** plan may see or receive the **Pro** plan in Offerloop. It describes the flow, where tier is determined, and the main cause: **tier is derived from Stripe price IDs**, and any mismatch causes the system to default to Pro.

---

## 1. Summary

- **Observed behavior:** User selects Elite at checkout and pays for Elite, but in Offerloop they are treated as **Pro** (Pro credits, Pro limits, “Pro” in the UI).
- **Root cause:** Offerloop does **not** store “Elite” or “Pro” at checkout. After payment, it asks Stripe for the subscription and reads the **Stripe price ID** from that subscription. It then maps that price ID to a tier using a fixed list. If the price ID is **not** in that list, the code **defaults to `pro`** (by design, for “backward compatibility”). So if the Elite price ID in Stripe does not match the Elite price ID configured in Offerloop, the user is treated as Pro.
- **No bug in “sending” Elite:** The frontend correctly sends the Elite price ID when the user clicks Elite. The mismatch happens when **reading back** the subscription from Stripe and comparing that price ID to the configured IDs.

---

## 2. End-to-End Flow

1. **User chooses Elite on Pricing page**  
   Frontend calls `/api/create-checkout-session` with `priceId: STRIPE_ELITE_PRICE_ID` (e.g. `price_1ScLcfERY2WrVHp1c5rcONJ3`).

2. **Stripe Checkout**  
   User completes checkout. Stripe creates a subscription with that price (or another price, e.g. if the product was recreated or a different price is used).

3. **Tier is set in Offerloop (one or both of):**
   - **Stripe webhook**  
     `checkout.session.completed` or `customer.subscription.updated` → backend retrieves the subscription from Stripe → reads `subscription.items.data[0].price.id` → calls `get_tier_from_price_id(price_id)` → updates Firestore `tier` / `subscriptionTier`.
   - **Payment Success page**  
     Frontend calls `/api/complete-upgrade` with `session_id` → backend loads the checkout session, gets `subscription_id`, retrieves the subscription from Stripe → same: `subscription.items.data[0].price.id` → `get_tier_from_price_id(price_id)` → updates Firestore.

4. **Where the “Pro” comes from**  
   In both paths, the **only** source of truth for tier is the **price ID returned by Stripe** on the subscription object. The mapping is done in `get_tier_from_price_id`. If that price ID is not the configured Elite ID, the code falls through to the default and returns **`pro`**.

So: **Elite signups show as Pro when the price ID on the subscription (from Stripe) does not match the Elite price ID configured in Offerloop.**

---

## 3. Where Tier Is Determined (Code References)

- **Mapping:** `backend/app/services/stripe_client.py` - `get_tier_from_price_id(price_id)`  
  - Returns `'elite'` only if `price_id == STRIPE_ELITE_PRICE_ID`.  
  - Returns `'pro'` if `price_id == STRIPE_PRO_PRICE_ID` or for **any other** price ID (default).

- **Config:** `backend/app/config.py`  
  - `STRIPE_PRO_PRICE_ID` and `STRIPE_ELITE_PRICE_ID` (from env or hardcoded defaults).

- **Webhook:** `backend/app/services/stripe_client.py`  
  - `handle_checkout_completed(session)` and `handle_subscription_updated(subscription)`  
  - Both get `subscription.items.data[0].price.id` from Stripe and call `get_tier_from_price_id`, then write `tier` and `subscriptionTier` to Firestore.

- **Manual completion:** `backend/app/routes/billing.py` - `complete_upgrade()`  
  - Retrieves subscription by `subscription_id`, gets `price_id` from `subscription.items.data[0].price.id`, calls `get_tier_from_price_id(price_id)`, then updates Firestore with `tier` (and credits, etc.).  
  - Note: this path updates `tier` but does **not** set `subscriptionTier` in the same payload; the webhook path sets both.

- **Frontend:** `connect-grow-hire/src/pages/Pricing.tsx`  
  - Sends `STRIPE_ELITE_PRICE_ID` or `STRIPE_PRO_PRICE_ID` when creating the checkout session.  
  - These can be hardcoded; if they differ from backend or from what Stripe actually attaches to the subscription, tier can still resolve to Pro when the subscription is read back.

---

## 4. Why the Price ID Might Not Match (Elite → Pro)

1. **Different Elite price in Stripe**  
   The Elite product or price was recreated in Stripe (e.g. new price ID), but Offerloop’s config (backend env or frontend constant) still has the old Elite price ID. Stripe returns the **new** ID; `get_tier_from_price_id` doesn’t recognize it → default → Pro.

2. **Environment variable wrong or missing**  
   Backend uses `STRIPE_ELITE_PRICE_ID` from the environment. If it’s unset, a default is used. If the default is wrong for this Stripe account, or if production has a different/old value, Elite subscriptions (with the real Elite price ID from Stripe) won’t match → Pro.

3. **Frontend vs backend vs Stripe**  
   Frontend might send a price ID that does create an Elite subscription in Stripe, but Stripe could still return a different ID (e.g. normalized, or a different price object). If that returned ID is not the one backend considers Elite, tier becomes Pro.

4. **Multiple prices for the same product**  
   If the Elite product in Stripe has more than one price (e.g. legacy vs current), and the subscription is created with one price but the app only recognizes another, again the returned price ID won’t match → Pro.

5. **Default-to-pro behavior**  
   The code explicitly defaults any **unknown** price ID to `pro` (see comment: “Default to pro for backward compatibility”). So every “unrecognized” Elite case becomes Pro, not Free.

---

## 5. How to Verify (Without Code Changes)

- **Stripe Dashboard**  
  For an affected user: find their subscription and note the **price ID** on the subscription (e.g. under subscription → line items → price). Compare it to:
  - Backend: `STRIPE_ELITE_PRICE_ID` (env or default in `config.py`).
  - Frontend: `STRIPE_ELITE_PRICE_ID` in `Pricing.tsx`.

- **Logs**  
  If you can add or already have logs: when handling checkout or complete-upgrade, log the `price_id` from Stripe and the result of `get_tier_from_price_id(price_id)`. That will show “Elite price ID from Stripe” vs “what we mapped to” (e.g. pro).

- **Firestore**  
  For a user who signed up for Elite but has Pro: check `users/{uid}` and see `tier` and `subscriptionTier`. Then in Stripe, confirm the price ID on their subscription. If they don’t match the configured Elite ID, that explains Pro.

---

## 6. Fix Direction (Reference Only)

Fixes are not implemented in this doc; this is for context.

- **Align price IDs:** Ensure the Elite price ID in Stripe (the one actually on subscriptions) is exactly the one in:
  - Backend: `STRIPE_ELITE_PRICE_ID` (env or default).
  - Frontend: `STRIPE_ELITE_PRICE_ID` in Pricing (and any other place that starts checkout).
- **Avoid silent Pro fallback for paid plans:** Consider not defaulting unknown price IDs to Pro (e.g. default to a safe tier or flag for support), and/or support multiple Elite price IDs if Stripe has several.
- **Consistency:** In `complete_upgrade`, set `subscriptionTier` in the same update as `tier` so both paths (webhook and manual completion) leave the document in the same shape.
- **UI:** Payment Success and any “already upgraded” checks should consider `tier === 'elite'` as well as `tier === 'pro'`, and message the user with the actual tier (e.g. “Pro” vs “Elite”) from the API response.

---

## 7. Quick Reference

| What | Where |
|------|--------|
| Tier from Stripe price ID | `stripe_client.get_tier_from_price_id(price_id)` |
| Elite only if | `price_id == STRIPE_ELITE_PRICE_ID` |
| Otherwise | Returns `'pro'` (default) |
| Config (backend) | `config.STRIPE_ELITE_PRICE_ID` / `STRIPE_PRO_PRICE_ID` (env + defaults) |
| Config (frontend) | `Pricing.tsx` constants `STRIPE_ELITE_PRICE_ID`, `STRIPE_PRO_PRICE_ID` |
| Webhook tier update | `stripe_client.handle_checkout_completed`, `handle_subscription_updated` |
| Post-checkout tier update | `billing.complete_upgrade` |

---

*Document created to explain Elite → Pro behavior without making code changes. Last updated: Feb 2025.*
