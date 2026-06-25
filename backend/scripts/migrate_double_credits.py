"""
One-shot Firestore migration: double every user's credit balances.

Run once immediately after deploying the 2026-06-10 "marketing inflation"
change that doubled the cost-per-email from 5 → 10 cr (and matching tier
allocations, slider stops, top-up packs).

Without this migration, every existing paying user's stored `credits` and
`maxCredits` would only buy HALF the emails they paid for (since the find
action now costs 10 cr instead of 5). Doubling their balance preserves the
email throughput they had before the change.

Idempotency:
  Each user gets a `creditsDoubled20260610` boolean flag once processed.
  Re-running the script is safe — already-doubled users are skipped.

Usage:
  DRY-RUN (default, prints what would change but writes nothing):
    python backend/scripts/migrate_double_credits.py

  LIVE (writes to Firestore):
    python backend/scripts/migrate_double_credits.py --apply

Run from project root.
"""
import argparse
import os
import sys
from pathlib import Path

# Make `app` importable when running from project root
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.extensions import get_db  # noqa: E402  (requires sys.path tweak above)


FLAG_FIELD = 'creditsDoubled20260610'

# Fields to double on each user doc. Trial daily remaining is included so
# active-trial users don't suddenly run out mid-day.
CREDIT_FIELDS = (
    'credits',
    'maxCredits',
    'trialDailyCreditsRemaining',
    'bonusCredits',           # purchased top-up balance (never expires)
)


def main():
    parser = argparse.ArgumentParser(description='Double every user credit balance for the 2026-06-10 inflation.')
    parser.add_argument('--apply', action='store_true', help='Actually write to Firestore (default is dry-run).')
    parser.add_argument('--limit', type=int, default=0, help='Stop after this many users (0 = all).')
    args = parser.parse_args()

    mode = 'LIVE' if args.apply else 'DRY-RUN'
    print(f"=== Credit doubling migration ({mode}) ===\n")

    db = get_db()
    if not db:
        print("ERROR: Firestore client unavailable. Check GOOGLE_APPLICATION_CREDENTIALS.")
        sys.exit(1)

    users_ref = db.collection('users')
    stream = users_ref.stream()

    processed = 0
    skipped_already_done = 0
    skipped_no_credits = 0
    total_credits_before = 0
    total_credits_after = 0

    for snap in stream:
        if args.limit and processed >= args.limit:
            print(f"\n(limit reached: {args.limit} users)\n")
            break

        data = snap.to_dict() or {}

        if data.get(FLAG_FIELD):
            skipped_already_done += 1
            continue

        # Compute doubled values for every credit-tracking field that exists
        updates = {}
        for field in CREDIT_FIELDS:
            if field in data and isinstance(data[field], (int, float)):
                old = int(data[field])
                new = old * 2
                updates[field] = new

        if not updates:
            skipped_no_credits += 1
            continue

        updates[FLAG_FIELD] = True
        total_credits_before += int(data.get('credits', 0))
        total_credits_after += int(data.get('credits', 0)) * 2
        processed += 1

        tier = data.get('subscriptionTier') or data.get('tier') or 'unknown'
        if processed <= 20 or processed % 50 == 0:
            print(f"  user {snap.id[:12]}… tier={tier}  {updates}")

        if args.apply:
            users_ref.document(snap.id).update(updates)

    print(f"\n=== Summary ===")
    print(f"  Mode:                       {mode}")
    print(f"  Users processed:            {processed}")
    print(f"  Skipped (already done):     {skipped_already_done}")
    print(f"  Skipped (no credit fields): {skipped_no_credits}")
    print(f"  Sum of `credits` before:    {total_credits_before:,}")
    print(f"  Sum of `credits` after:     {total_credits_after:,}")
    if not args.apply:
        print(f"\n  This was a DRY-RUN. Re-run with --apply to actually write the changes.")


if __name__ == '__main__':
    main()
