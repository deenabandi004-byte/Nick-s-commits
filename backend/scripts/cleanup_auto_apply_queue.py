#!/usr/bin/env python3
"""
Wipe stale auto-apply queue entries so the Needs Attention + Auto-Submission
tabs read clean. Used during v2 dogfooding when frozen pending_questions /
failed cards from prior code revisions clutter the UI.

Usage:
    # Dry run: list what would be deleted. Targets all needs_attention +
    # failed + submit_failed docs for the user identified by --email.
    python backend/scripts/cleanup_auto_apply_queue.py \\
        --email deena.bandi004@gmail.com

    # Live run:
    python backend/scripts/cleanup_auto_apply_queue.py \\
        --email deena.bandi004@gmail.com --execute

    # Target by uid directly (skip the email lookup):
    python backend/scripts/cleanup_auto_apply_queue.py --uid <uid> --execute

    # Also wipe stuck in-flight (queued + running) jobs — useful when a
    # worker thread crashed and left a card hanging in "Running":
    python backend/scripts/cleanup_auto_apply_queue.py \\
        --email deena.bandi004@gmail.com --execute --include-in-flight

    # Wipe EVERYTHING for the user except submitted:
    python backend/scripts/cleanup_auto_apply_queue.py \\
        --email deena.bandi004@gmail.com --execute --all-except-submitted

    # Wipe EVERY autoApplyJobs doc for the user (clean slate dogfood reset):
    python backend/scripts/cleanup_auto_apply_queue.py \\
        --email deena.bandi004@gmail.com --execute --all
"""
import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT_DIR, ".env"))
except ImportError:
    pass

import firebase_admin
from firebase_admin import credentials, firestore


DEFAULT_STATUSES = {"needs_attention", "failed", "submit_failed"}
IN_FLIGHT_STATUSES = {"queued", "running"}
KEEP_STATUSES = {"submitted"}  # never delete on --all-except-submitted


def _init_firestore():
    if firebase_admin._apps:
        return firestore.client()
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()
    return firestore.client()


def _resolve_uid(db, email: str) -> str:
    """Find the Firebase uid for a given email by scanning users/.

    Falls back to a collection-wide stream because the email field isn't
    indexed for equality everywhere. Fine at our scale (sub-1k users)."""
    snap_iter = db.collection("users").where("email", "==", email).limit(1).stream()
    for doc in snap_iter:
        return doc.id
    # Fallback: linear scan
    for doc in db.collection("users").stream():
        data = doc.to_dict() or {}
        if (data.get("email") or "").strip().lower() == email.strip().lower():
            return doc.id
    raise SystemExit(f"No user found with email {email!r}")


def cleanup(uid: str, statuses: set[str], execute: bool) -> int:
    db = _init_firestore()
    collection = (
        db.collection("users").document(uid).collection("autoApplyJobs")
    )
    deleted = 0
    skipped = 0
    candidates = list(collection.stream())
    print(f"Scanning {len(candidates)} autoApplyJobs docs for uid={uid}")
    print(f"Statuses to delete: {sorted(statuses)}")
    print()
    for doc in candidates:
        data = doc.to_dict() or {}
        status = data.get("status")
        title = data.get("job_title") or data.get("job_id") or "(unknown)"
        company = data.get("company") or ""
        line = f"  [{status:<18}] {title} · {company}".rstrip(" ·")
        if status in statuses:
            if execute:
                doc.reference.delete()
                deleted += 1
                print(f"DEL{line}")
            else:
                deleted += 1
                print(f"WOULD-DEL{line}")
        else:
            skipped += 1
            print(f"KEEP    {line}")
    print()
    verb = "Deleted" if execute else "Would delete"
    print(f"{verb}: {deleted}    Kept: {skipped}")
    if not execute and deleted > 0:
        print("Re-run with --execute to actually delete.")
    return deleted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--uid", help="Firebase uid")
    target.add_argument("--email", help="User email (resolved to uid)")

    parser.add_argument(
        "--execute", action="store_true",
        help="Actually delete (default is dry-run)",
    )
    parser.add_argument(
        "--include-in-flight", action="store_true",
        help="Also wipe queued + running docs (useful for stuck workers)",
    )
    parser.add_argument(
        "--all-except-submitted", action="store_true",
        help="Wipe every autoApplyJobs doc except status=submitted",
    )
    parser.add_argument(
        "--all", dest="all_statuses", action="store_true",
        help="Wipe EVERY autoApplyJobs doc, including submitted. Use for a "
             "clean-slate dogfood reset.",
    )
    args = parser.parse_args()

    if args.all_statuses:
        # Caller has explicitly asked for a total nuke. Bypass the
        # KEEP_STATUSES guard since intent is unambiguous.
        statuses = {
            "needs_attention", "failed", "submit_failed",
            "queued", "running", "dry_run_complete", "submitted",
        }
    elif args.all_except_submitted:
        statuses = {
            "needs_attention", "failed", "submit_failed",
            "queued", "running", "dry_run_complete",
        }
        statuses -= KEEP_STATUSES
    else:
        statuses = set(DEFAULT_STATUSES)
        if args.include_in_flight:
            statuses |= IN_FLIGHT_STATUSES
        statuses -= KEEP_STATUSES

    db = _init_firestore()
    uid = args.uid or _resolve_uid(db, args.email)
    cleanup(uid, statuses, execute=args.execute)


if __name__ == "__main__":
    main()
