#!/usr/bin/env python3
"""
Create the 13 recurring Offerloop Stripe Prices (7 Pro + 6 Elite).

Scope: recurring subscription SKUs only. The one-time SKUs (Season Pass x2,
Top-Up x3) are intentionally excluded because create-checkout-session always
runs mode='subscription' and cannot check out one-time prices yet. Those are a
separate pass.

Usage (run in TEST first, then LIVE):
    STRIPE_SECRET_KEY=sk_test_... python backend/scripts/create_stripe_prices.py
    STRIPE_SECRET_KEY=sk_live_... python backend/scripts/create_stripe_prices.py

What it does:
  * reuses one Product per name (Offerloop Pro, Offerloop Elite)
  * sets metadata {tier, credits, audience, cadence} on each Price
  * sets lookup_key = the backend env var name, lowercased, for idempotency.
    A re-run hits the duplicate lookup_key, reports it, and continues instead
    of silently minting a parallel price.
  * prints MODE (TEST or LIVE) and ENV_VAR=price_... lines ready to paste

It does NOT write env files, does NOT touch Render, and is safe to re-run.
Amounts and intervals mirror SLIDER_STOPS and ANNUAL_PRICING in
backend/app/config.py (verified against that file at authoring time).
"""
import os
import sys

import stripe

# (env_var, product_name, tier, cadence, audience, credits, dollars, interval)
# interval is the Stripe recurring interval ('month' or 'year'). cadence is the
# STRIPE_PRICE_CATALOG key ('monthly' or 'annual'), stored in metadata so the
# Stripe object is self-describing.
RECURRING_SKUS = [
    # Offerloop Pro
    ("STRIPE_PRO_MONTHLY_STUDENT_1K", "Offerloop Pro", "pro", "monthly", "student", 1000, 9.99, "month"),
    ("STRIPE_PRO_MONTHLY_STUDENT_2K", "Offerloop Pro", "pro", "monthly", "student", 2000, 14.99, "month"),
    ("STRIPE_PRO_MONTHLY_STUDENT_3K", "Offerloop Pro", "pro", "monthly", "student", 3000, 19.99, "month"),
    ("STRIPE_PRO_MONTHLY_STUDENT_4K", "Offerloop Pro", "pro", "monthly", "student", 4000, 24.99, "month"),
    ("STRIPE_PRO_MONTHLY_LIST_2K",    "Offerloop Pro", "pro", "monthly", "list",    2000, 29.00, "month"),
    ("STRIPE_PRO_ANNUAL_STUDENT_2K",  "Offerloop Pro", "pro", "annual",  "student", 2000, 144.00, "year"),
    ("STRIPE_PRO_ANNUAL_LIST_2K",     "Offerloop Pro", "pro", "annual",  "list",    2000, 279.00, "year"),
    # Offerloop Elite
    ("STRIPE_ELITE_MONTHLY_STUDENT_3K", "Offerloop Elite", "elite", "monthly", "student", 3000, 24.99, "month"),
    ("STRIPE_ELITE_MONTHLY_STUDENT_5K", "Offerloop Elite", "elite", "monthly", "student", 5000, 34.99, "month"),
    ("STRIPE_ELITE_MONTHLY_STUDENT_7K", "Offerloop Elite", "elite", "monthly", "student", 7000, 49.99, "month"),
    ("STRIPE_ELITE_MONTHLY_LIST_5K",    "Offerloop Elite", "elite", "monthly", "list",    5000, 59.00, "month"),
    ("STRIPE_ELITE_ANNUAL_STUDENT_5K",  "Offerloop Elite", "elite", "annual",  "student", 5000, 336.00, "year"),
    ("STRIPE_ELITE_ANNUAL_LIST_5K",     "Offerloop Elite", "elite", "annual",  "list",    5000, 566.00, "year"),
]


def get_or_create_product(name, cache):
    """Return a product id for name, reusing an existing active product if one
    with the exact name already exists (so re-runs do not pile up products)."""
    if name in cache:
        return cache[name]
    for prod in stripe.Product.list(limit=100, active=True).auto_paging_iter():
        if prod.get("name") == name:
            cache[name] = prod.id
            print(f"# product reused: {name} -> {prod.id}")
            return prod.id
    created = stripe.Product.create(name=name)
    cache[name] = created.id
    print(f"# product created: {name} -> {created.id}")
    return created.id


def find_price_by_lookup_key(lookup_key):
    """Return an existing price id for a lookup_key, or None."""
    data = (stripe.Price.list(lookup_keys=[lookup_key], limit=1).get("data") or [])
    return data[0].id if data else None


def main():
    secret = os.environ.get("STRIPE_SECRET_KEY")
    if not secret:
        print("ERROR: STRIPE_SECRET_KEY not set in environment.", file=sys.stderr)
        sys.exit(1)
    stripe.api_key = secret

    if secret.startswith("sk_live"):
        mode = "LIVE"
    elif secret.startswith("sk_test"):
        mode = "TEST"
    else:
        mode = "UNKNOWN"
    print(f"# Offerloop recurring price creation - MODE: {mode}")
    print(f"# Creating {len(RECURRING_SKUS)} prices across 2 products.\n")

    product_cache = {}
    env_lines = []

    for env_var, product_name, tier, cadence, audience, credits, dollars, interval in RECURRING_SKUS:
        lookup_key = env_var.lower()
        product_id = get_or_create_product(product_name, product_cache)
        try:
            price = stripe.Price.create(
                product=product_id,
                currency="usd",
                unit_amount=round(dollars * 100),
                recurring={"interval": interval},
                lookup_key=lookup_key,
                metadata={
                    "tier": tier,
                    "credits": str(credits),
                    "audience": audience,
                    "cadence": cadence,
                },
            )
            print(f"# created {lookup_key} (${dollars:.2f}/{interval}) -> {price.id}")
            env_lines.append(f"{env_var}={price.id}")
        except stripe.error.InvalidRequestError as e:
            msg = str(e)
            if "lookup_key" in msg.lower() or "already" in msg.lower():
                existing_id = find_price_by_lookup_key(lookup_key)
                print(f"# SKIP {lookup_key}: lookup_key already exists -> {existing_id or 'unknown'}")
                if existing_id:
                    env_lines.append(f"{env_var}={existing_id}")
            else:
                print(f"# ERROR {lookup_key}: {msg}")

    print("\n# ---- paste into Render backend env + local .env ----")
    for line in env_lines:
        print(line)


if __name__ == "__main__":
    main()
