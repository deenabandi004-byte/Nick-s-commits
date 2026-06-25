"""
Backfill `draftToEmail` on existing Loop (agent-sourced) contacts.

Phase 1 of the Loops <-> Tracker unification stamps `draftToEmail` on every
new agent-discovered contact so the Gmail reply webhook can match replies by
the same failsafe key manual outreach already uses. This script backfills the
field on agent contacts written BEFORE that change.

Targets contacts under users/{uid}/contacts where:
    source == "agent"            (Loop / agent-discovered; HM agent contacts too)
    draftToEmail is missing/empty
    email is present

Sets:  draftToEmail = email.strip().lower()

Dry-run by default — prints counts and a sample, writes nothing. Re-run with
--apply to commit. Idempotent: re-running after --apply finds nothing to do.

Usage:
    python backend/scripts/backfill_loop_draft_to_email.py            # dry-run
    python backend/scripts/backfill_loop_draft_to_email.py --apply    # live
    python backend/scripts/backfill_loop_draft_to_email.py --limit 50 # cap users
"""
import argparse
import os
import sys

# Allow running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import firebase_admin
from firebase_admin import credentials, firestore

# Firestore allows up to 500 writes per batch; stay under it.
BATCH_LIMIT = 450


def get_db():
    """Initialize Firebase and return Firestore client, or None on failure."""
    try:
        if not firebase_admin._apps:
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            else:
                firebase_admin.initialize_app()
        return firestore.client()
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: could not init Firestore: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Backfill draftToEmail on agent-sourced contacts."
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Actually write to Firestore (default is dry-run).",
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Stop after this many users (0 = all).",
    )
    args = parser.parse_args()
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== draftToEmail backfill ({mode}) ===\n")

    db = get_db()
    if db is None:
        print("ERROR: Firestore client unavailable. Check GOOGLE_APPLICATION_CREDENTIALS.")
        sys.exit(1)

    users_ref = db.collection("users")

    users_scanned = 0
    agent_contacts = 0          # source == "agent"
    already_set = 0             # draftToEmail already present
    skipped_no_email = 0        # agent contact with no email to copy
    to_fill = 0                 # would be / was written
    samples = []

    batch = db.batch()
    pending = 0

    for user_snap in users_ref.stream():
        if args.limit and users_scanned >= args.limit:
            print(f"\n(limit reached: {args.limit} users)\n")
            break
        users_scanned += 1
        uid = user_snap.id
        contacts_ref = users_ref.document(uid).collection("contacts")

        # Single-field index on `source` is automatic in Firestore, so this
        # per-user filtered read needs no manual index.
        try:
            agent_iter = contacts_ref.where("source", "==", "agent").stream()
        except Exception as e:  # noqa: BLE001
            print(f"  WARN: query failed for uid={uid[:12]}…: {e}")
            continue

        for c_snap in agent_iter:
            agent_contacts += 1
            data = c_snap.to_dict() or {}
            existing = (data.get("draftToEmail") or "").strip()
            if existing:
                already_set += 1
                continue
            email = (data.get("email") or "").strip()
            if not email:
                skipped_no_email += 1
                continue

            to_fill += 1
            if len(samples) < 10:
                samples.append(f"{uid[:10]}…/{c_snap.id[:8]}… → {email.lower()}")

            if args.apply:
                batch.update(c_snap.reference, {"draftToEmail": email.lower()})
                pending += 1
                if pending >= BATCH_LIMIT:
                    batch.commit()
                    batch = db.batch()
                    pending = 0

    if args.apply and pending:
        batch.commit()

    print("=== Summary ===")
    print(f"  Mode:                          {mode}")
    print(f"  Users scanned:                 {users_scanned}")
    print(f"  Agent contacts seen:           {agent_contacts}")
    print(f"  Already had draftToEmail:      {already_set}")
    print(f"  Skipped (no email to copy):    {skipped_no_email}")
    print(f"  draftToEmail {'written' if args.apply else 'to write'}:           {to_fill}")
    if samples:
        print("\n  Sample (up to 10):")
        for s in samples:
            print(f"    {s}")
    if not args.apply:
        print("\n  This was a DRY-RUN. Re-run with --apply to write the changes.")


if __name__ == "__main__":
    main()
