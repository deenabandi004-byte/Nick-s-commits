"""
Cutover-day migration: verify every existing paying user's Stripe subscription
still points at a valid Price ID after the 2026-06-10 pricing overhaul.

Background: the overhaul introduced an env-driven Stripe Price catalog with
~20 SKU variants (slider stops × cadence × audience). The two legacy live
Price IDs (STRIPE_PRO_PRICE_ID, STRIPE_ELITE_PRICE_ID) are still in the
catalog mapped to the new default stops (2K Pro, 5K Elite at the doubled
10 cr/email math). So existing subscribers should be FINE without any action
— as long as cofounders don't archive those legacy Price IDs in Stripe.

This script:
  1. Pulls every Firestore user with subscriptionTier in ('pro', 'elite')
  2. Resolves their stripeSubscriptionId via Stripe API
  3. Verifies the active Price ID on each subscription is still in our catalog
  4. Reports any subscriptions on Price IDs we DON'T recognize — those are
     candidates for manual review (either by-design legacy SKUs, or accidents)

By design this is a READ-ONLY audit script. It does NOT modify Stripe
subscriptions. If a real swap is needed, the report it generates is the
input to a manual `stripe subscriptions modify` operation.

Usage:
  python backend/scripts/migrate_existing_subscribers.py
  python backend/scripts/migrate_existing_subscribers.py --json > audit.json
"""
import argparse
import json
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.config import STRIPE_PRICE_CATALOG, STRIPE_SECRET_KEY  # noqa: E402
from app.extensions import get_db  # noqa: E402


def _collect_known_price_ids() -> set[str]:
    """Walk the catalog and collect every Price ID we recognize."""
    known: set[str] = set()
    for tier in ('pro', 'elite'):
        tier_entry = STRIPE_PRICE_CATALOG.get(tier) or {}
        for cadence in ('monthly', 'annual'):
            cadence_entry = tier_entry.get(cadence) or {}
            for audience in ('student', 'list'):
                stops = cadence_entry.get(audience) or {}
                if isinstance(stops, dict):
                    known.update(v for v in stops.values() if v)
    # Season pass + top-ups
    sp = (STRIPE_PRICE_CATALOG.get('season_pass') or {}).get('one_time') or {}
    known.update(v for v in sp.values() if v)
    topup = STRIPE_PRICE_CATALOG.get('topup') or {}
    known.update(v for v in topup.values() if v)
    known.discard('')
    return known


def main():
    parser = argparse.ArgumentParser(description='Cutover audit for existing paying subscribers.')
    parser.add_argument('--json', action='store_true', help='Emit machine-readable JSON report.')
    args = parser.parse_args()

    if not STRIPE_SECRET_KEY:
        print("ERROR: STRIPE_SECRET_KEY is unset. Cannot query subscriptions.")
        sys.exit(1)

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    db = get_db()
    if not db:
        print("ERROR: Firestore client unavailable.")
        sys.exit(1)

    known_price_ids = _collect_known_price_ids()
    if not args.json:
        print(f"=== Subscriber Cutover Audit ===\n")
        print(f"Catalog contains {len(known_price_ids)} known Price IDs:")
        for pid in sorted(known_price_ids):
            print(f"  · {pid}")
        print()

    records: list[dict] = []
    users_ref = db.collection('users')
    pro_query = users_ref.where('subscriptionTier', 'in', ['pro', 'elite'])

    for snap in pro_query.stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email', '?')
        sub_id = user.get('stripeSubscriptionId')
        firestore_tier = user.get('subscriptionTier', '?')

        record = {
            'user_id': uid,
            'email': email,
            'firestore_tier': firestore_tier,
            'stripe_subscription_id': sub_id,
        }

        if not sub_id:
            record['status'] = 'no_stripe_sub_id'
            records.append(record)
            continue

        try:
            sub = stripe.Subscription.retrieve(sub_id)
        except stripe.error.InvalidRequestError as e:
            record['status'] = 'stripe_invalid_request'
            record['error'] = str(e)
            records.append(record)
            continue
        except stripe.error.StripeError as e:
            record['status'] = 'stripe_error'
            record['error'] = str(e)
            records.append(record)
            continue

        items = (sub.get('items') or {}).get('data') or []
        if not items:
            record['status'] = 'no_subscription_items'
            records.append(record)
            continue

        price = items[0].get('price') or {}
        price_id = price.get('id')
        record['active_price_id'] = price_id
        record['stripe_status'] = sub.get('status')

        if price_id and price_id in known_price_ids:
            record['status'] = 'ok_known_price'
        else:
            record['status'] = 'unknown_price_needs_review'

        records.append(record)

    # Summary
    counts: dict[str, int] = {}
    for r in records:
        counts[r['status']] = counts.get(r['status'], 0) + 1

    if args.json:
        print(json.dumps({'summary': counts, 'records': records}, default=str, indent=2))
        return

    print(f"=== Results ({len(records)} users with paid tier in Firestore) ===\n")
    for status, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {status:35s} {n}")

    bad = [r for r in records if r['status'] != 'ok_known_price']
    if bad:
        print(f"\n=== Users needing review ({len(bad)}) ===")
        for r in bad:
            print(f"  · {r['email']:40s} tier={r['firestore_tier']} status={r['status']}"
                  + (f" price={r.get('active_price_id', '?')}" if r.get('active_price_id') else ""))
        print(f"\nFor any 'unknown_price_needs_review', either:")
        print(f"  (a) add the Price ID to STRIPE_PRICE_CATALOG via env var, OR")
        print(f"  (b) call `stripe.Subscription.modify(id, items=[{{...new_price...}}], proration_behavior='none')`")
    else:
        print(f"\n✅ Every paid subscriber is on a Price ID we recognize. Safe to deploy.")


if __name__ == '__main__':
    main()
