"""
One-shot Firestore migration: backfill the `isStudent` flag on every user
whose email ends with `.edu`.

Why this exists: the .edu detection on signup is wired in
`FirebaseAuthContext.tsx` and `OnboardingProfile.tsx`, but everyone who
signed up BEFORE that wiring has `isStudent` unset. The Stripe checkout
audience validation (in `stripe_client.create_checkout_session`) rejects
student-SKU purchases for users where `isStudent` is false — so those
legacy users would fail at checkout even though they have a .edu email.

This script walks the users collection, finds anyone with a .edu email and
no `isStudent` flag, and sets:
  - isStudent: True
  - studentEmailDomain: the school's domain (e.g. "usc.edu")
  - studentVerifiedAt: <now>
  - studentVerificationSource: "backfill_2026_06_10"

Idempotency: users with `isStudent` already set are skipped.

Usage:
  DRY-RUN:  python backend/scripts/backfill_is_student.py
  LIVE:     python backend/scripts/backfill_is_student.py --apply
"""
import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.extensions import get_db  # noqa: E402


# Match the school's domain, e.g. "usc.edu" or "g.harvard.edu". We don't
# want the username part — just the school domain — so we'll grab everything
# after the @ and any subdomain stripping the user wants.
EMAIL_DOMAIN_RE = re.compile(r'^[^@]+@(.+\.edu)$', re.IGNORECASE)

VERIFICATION_SOURCE = 'backfill_2026_06_10'


def main():
    parser = argparse.ArgumentParser(description='Backfill isStudent for existing .edu users.')
    parser.add_argument('--apply', action='store_true', help='Actually write to Firestore (default is dry-run).')
    parser.add_argument('--limit', type=int, default=0, help='Stop after this many users (0 = all).')
    args = parser.parse_args()

    mode = 'LIVE' if args.apply else 'DRY-RUN'
    print(f"=== isStudent backfill ({mode}) ===\n")

    db = get_db()
    if not db:
        print("ERROR: Firestore client unavailable. Check GOOGLE_APPLICATION_CREDENTIALS.")
        sys.exit(1)

    users_ref = db.collection('users')

    processed = 0
    skipped_already_set = 0
    skipped_no_edu = 0
    skipped_no_email = 0
    domains: dict[str, int] = {}

    for snap in users_ref.stream():
        if args.limit and processed >= args.limit:
            print(f"\n(limit reached: {args.limit} users)\n")
            break

        data = snap.to_dict() or {}

        # Already verified — skip
        if data.get('isStudent') is not None:
            skipped_already_set += 1
            continue

        email = (data.get('email') or '').strip().lower()
        if not email:
            skipped_no_email += 1
            continue

        match = EMAIL_DOMAIN_RE.match(email)
        if not match:
            skipped_no_edu += 1
            continue

        domain = match.group(1).lower()
        domains[domain] = domains.get(domain, 0) + 1

        updates = {
            'isStudent': True,
            'studentEmailDomain': domain,
            'studentVerifiedAt': datetime.now(timezone.utc),
            'studentVerificationSource': VERIFICATION_SOURCE,
        }
        processed += 1

        if processed <= 20 or processed % 25 == 0:
            print(f"  {snap.id[:12]}… {email} → {domain}")

        if args.apply:
            users_ref.document(snap.id).update(updates)

    print(f"\n=== Summary ===")
    print(f"  Mode:                       {mode}")
    print(f"  Users marked isStudent:     {processed}")
    print(f"  Skipped (already set):      {skipped_already_set}")
    print(f"  Skipped (no .edu email):    {skipped_no_edu}")
    print(f"  Skipped (no email at all):  {skipped_no_email}")
    print(f"\n  Top school domains:")
    for domain, count in sorted(domains.items(), key=lambda kv: -kv[1])[:10]:
        print(f"    {domain:30s} {count}")
    if not args.apply:
        print(f"\n  This was a DRY-RUN. Re-run with --apply to actually write the changes.")


if __name__ == '__main__':
    main()
