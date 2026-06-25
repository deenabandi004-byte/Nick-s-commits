"""One-shot: flip a Loop's cadence in Firestore.

Why: cadence editing isn't exposed in the UI yet (the picker copy exists
in lib/loopCopy.ts but no component renders it). To flip an existing
Loop's cadence, edit the field directly.

Usage:
    python -m backend.scripts.flip_loop_cadence CFCQSH daily
    python -m backend.scripts.flip_loop_cadence CFCQSH daily --fire-now

--fire-now also nudges nextRunAt to 1 minute in the past so the next
hourly scheduler tick picks the Loop up immediately, instead of waiting
out the old (weekly) interval.
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import firebase_admin
from firebase_admin import credentials, firestore


VALID_CADENCES = {"daily", "every_other_day", "weekly", "manual"}


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path:
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        else:
            firebase_admin.initialize_app()
    return firestore.client()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("short_code", help="Loop shortCode (e.g. CFCQSH)")
    ap.add_argument("cadence", choices=sorted(VALID_CADENCES))
    ap.add_argument("--fire-now", action="store_true",
                    help="Also set nextRunAt to ~now so it fires next tick")
    args = ap.parse_args()

    db = get_db()
    code = args.short_code.upper()

    # collection_group hits every users/{uid}/loops/* — same pattern the
    # scheduler uses.
    matches = list(
        db.collection_group("loops").where("shortCode", "==", code).stream()
    )
    if not matches:
        print(f"No Loop found with shortCode={code}")
        sys.exit(1)
    if len(matches) > 1:
        print(f"Ambiguous: {len(matches)} Loops match shortCode={code}")
        for m in matches:
            print(f"  {m.reference.path}")
        sys.exit(1)

    doc = matches[0]
    loop = doc.to_dict() or {}
    print(f"Found: {doc.reference.path}")
    print(f"  name:       {loop.get('name')}")
    print(f"  cadence:    {loop.get('cadence')} → {args.cadence}")
    print(f"  nextRunAt:  {loop.get('nextRunAt')}")

    patch = {"cadence": args.cadence}
    if args.fire_now:
        nudge = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        patch["nextRunAt"] = nudge
        print(f"  nextRunAt → {nudge} (will fire next hourly tick)")

    doc.reference.update(patch)
    print("Done.")


if __name__ == "__main__":
    main()
