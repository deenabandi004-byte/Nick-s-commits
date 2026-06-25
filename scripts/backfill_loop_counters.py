"""Reconcile a Loop's counter fields with its actual cycle results.

Use when loop_jobs._write_loop_counters_with_retry logged a final ERROR — the
cycle's contacts/jobs/HMs/drafts are persisted to subcollections but the
Loop doc's totalContactsFound/etc. are stale.

Also handles the "user deleted Loop X mid-cycle, recreated it as Loop Y"
recovery case: pass --from to re-tag orphaned subcollection docs onto Y.

USAGE:
    # Just recompute counters for one Loop from its own cycle results
    python scripts/backfill_loop_counters.py --uid <UID> --loop <LOOP_ID>

    # Re-tag orphaned docs from a deleted Loop onto a destination Loop
    # AND recompute the destination's counters
    python scripts/backfill_loop_counters.py --uid <UID> --loop <DEST> --from <ORPHAN>

    # Add --apply to actually write (default is dry-run)
    python scripts/backfill_loop_counters.py --uid <UID> --loop <LOOP_ID> --apply
"""
from __future__ import annotations

import argparse
import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore


def _init_db() -> firestore.Client:
    sa_path = os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS",
        os.path.join(os.path.dirname(__file__), "..", "firebase-sa.json"),
    )
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(sa_path))
    return firestore.client()


def _retag(db, uid: str, coll: str, from_loop: str, to_loop: str, apply: bool) -> int:
    q = (
        db.collection("users").document(uid).collection(coll)
        .where(filter=firestore.FieldFilter("loopId", "==", from_loop))
    )
    n = 0
    for snap in q.stream():
        n += 1
        if apply:
            snap.reference.update({"loopId": to_loop})
    print(f"  {coll}: {n} doc(s) re-tagged {from_loop} → {to_loop}")
    return n


def _recompute_counters(db, uid: str, loop_id: str) -> dict:
    # Sum contactsFound/jobsFound/hmsFound/emailsDrafted across this Loop's
    # cycles (joined via loopId). Mirrors the read path the dashboard uses
    # for the activity feed, so the recomputed numbers stay consistent.
    cycles_q = (
        db.collection("users").document(uid).collection("agent_cycles")
        .where(filter=firestore.FieldFilter("loopId", "==", loop_id))
    )
    totals = {
        "totalContactsFound": 0,
        "totalEmailsDrafted": 0,
        "totalJobsFound": 0,
        "totalHmsContacted": 0,
        "totalCompaniesDiscovered": 0,
    }
    for snap in cycles_q.stream():
        r = (snap.to_dict() or {}).get("results") or {}
        totals["totalContactsFound"] += int(r.get("contactsFound") or 0)
        totals["totalEmailsDrafted"] += int(r.get("emailsDrafted") or 0)
        totals["totalJobsFound"] += int(r.get("jobsFound") or 0)
        totals["totalHmsContacted"] += int(r.get("hmsFound") or 0)
        totals["totalCompaniesDiscovered"] += int(r.get("companiesDiscovered") or 0)
    return totals


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--uid", required=True)
    ap.add_argument("--loop", required=True, help="destination Loop id")
    ap.add_argument("--from", dest="from_loop", help="orphan Loop id to re-tag from")
    ap.add_argument("--apply", action="store_true", help="actually write (default: dry-run)")
    args = ap.parse_args()

    db = _init_db()
    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"Mode: {mode}")

    dest_ref = db.collection("users").document(args.uid).collection("loops").document(args.loop)
    dest_snap = dest_ref.get()
    if not dest_snap.exists:
        print(f"ABORT: destination Loop {args.loop} does not exist for uid={args.uid}")
        return 1
    dest = dest_snap.to_dict() or {}
    print(f"Destination: {args.loop} name={dest.get('name')!r}")

    if args.from_loop:
        print(f"\nRe-tagging orphans from {args.from_loop} → {args.loop}")
        for coll in ("contacts", "agent_jobs", "agent_cycles", "agent_actions"):
            _retag(db, args.uid, coll, args.from_loop, args.loop, args.apply)

    print(f"\nRecomputing counters for {args.loop} from agent_cycles.results...")
    new_totals = _recompute_counters(db, args.uid, args.loop)
    print("  current → recomputed:")
    for k, v in new_totals.items():
        print(f"    {k}: {dest.get(k, 0)} → {v}")

    if args.apply:
        dest_ref.update(new_totals)
        print("  ✓ counters written")

    print(f"\n{mode} complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
