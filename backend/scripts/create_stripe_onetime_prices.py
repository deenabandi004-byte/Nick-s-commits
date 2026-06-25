#!/usr/bin/env python3
"""
Create the 5 one-time Offerloop Stripe Prices: Season Pass x2 + Top-Up x3.

Companion to create_stripe_prices.py (which handles the 13 recurring subscription
SKUs). These are all `mode=payment` one-time prices — no `recurring` block — so
they check out through create-season-pass-session / create-topup-session, NOT
the subscription checkout.

Usage (run in TEST first, then LIVE):
    STRIPE_SECRET_KEY=sk_test_... python backend/scripts/create_stripe_onetime_prices.py
    STRIPE_SECRET_KEY=sk_live_... python backend/scripts/create_stripe_onetime_prices.py

What it does:
  * reuses one Product per name (Offerloop Season Pass, Offerloop Credits)
  * sets metadata on each Price so the Stripe object is self-describing
  * sets lookup_key = the backend env var name, lowercased, for idempotency.
    A re-run hits the duplicate lookup_key, reports it, and continues instead
    of minting a parallel price.
  * prints MODE (TEST or LIVE) and ENV_VAR=price_... lines ready to paste

It does NOT write env files, does NOT touch Render, and is safe to re-run.
Amounts mirror SEASON_PASS and TOPUP_PACKS in backend/app/config.py
(verified against that file at authoring time: Season Pass student $99 / list
$199; Top-Up 500=$4.99, 1500=$9.99, 3000=$24.99).
"""
import os
import sys

import stripe

# (env_var, product_name, kind, audience_or_credits, dollars, metadata)
ONETIME_SKUS = [
    # Season Pass — one-time 4-month prepaid pass
    ("STRIPE_SEASON_PASS_STUDENT", "Offerloop Season Pass", "season_pass", "student", 99.00,
     {"kind": "season_pass", "audience": "student", "months": "4", "credits_per_month": "3000"}),
    ("STRIPE_SEASON_PASS_LIST",    "Offerloop Season Pass", "season_pass", "list",    199.00,
     {"kind": "season_pass", "audience": "list", "months": "4", "credits_per_month": "3000"}),
    # Top-Up credit packs — one-time, credits never expire
    ("STRIPE_TOPUP_500",  "Offerloop Credits", "topup", "500",  4.99,
     {"kind": "topup", "credits": "500", "pack": "starter"}),
    ("STRIPE_TOPUP_1500", "Offerloop Credits", "topup", "1500", 9.99,
     {"kind": "topup", "credits": "1500", "pack": "best"}),
    ("STRIPE_TOPUP_3000", "Offerloop Credits", "topup", "3000", 24.99,
     {"kind": "topup", "credits": "3000", "pack": "bulk"}),
]


def get_or_create_product(name, cache):
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
    print(f"# Offerloop ONE-TIME price creation - MODE: {mode}")
    print(f"# Creating {len(ONETIME_SKUS)} one-time prices across 2 products.\n")

    product_cache = {}
    env_lines = []

    for env_var, product_name, kind, label, dollars, metadata in ONETIME_SKUS:
        lookup_key = env_var.lower()
        product_id = get_or_create_product(product_name, product_cache)
        try:
            price = stripe.Price.create(
                product=product_id,
                currency="usd",
                unit_amount=round(dollars * 100),
                # no `recurring` => one-time price (mode=payment checkout)
                lookup_key=lookup_key,
                metadata=metadata,
            )
            print(f"# created {lookup_key} (${dollars:.2f} one-time) -> {price.id}")
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
