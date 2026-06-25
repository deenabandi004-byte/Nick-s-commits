#!/usr/bin/env python3
"""
One-shot cleanup: remove stale Mailer-Daemon / DSN entries from outbox
notification docs and mark the underlying contacts as bounced.

Before the bounce gate in gmail_webhook.py, bounce messages were treated as
real replies. This left two kinds of debris in production:

  1. `users/{uid}/notifications/outbox` documents with items whose snippet
     starts with "Address not found", "wasn't delivered", etc. These render
     as "{contact} responded to you!" toasts in the UI.
  2. The matched contact docs sitting in `pipelineStage="replied"` with
     `inOutbox=True` and `hasUnreadReply=True`, so they still show in the
     outbox/tracker as having responded.

This script finds both and cleans them up. It does NOT touch the original
Gmail thread.

Usage:
    python backend/scripts/cleanup_bounce_notifications.py            # dry run
    python backend/scripts/cleanup_bounce_notifications.py --execute  # live run

The bounce-detection helper is imported from the webhook module so the
script and the webhook agree on what counts as a bounce.
"""
import argparse
import os
import sys
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)

# Pick up GOOGLE_APPLICATION_CREDENTIALS (and friends) from repo-root .env,
# matching how backend/app/config.py boots the Flask app.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT_DIR, ".env"))
except ImportError:
    pass

import firebase_admin
from firebase_admin import credentials, firestore

from app.utils.bounce_detection import is_bounce_message


PROGRESS_EVERY = 50


def _init_firestore():
    if firebase_admin._apps:
        return firestore.client()

    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            "projectId": "offerloop-native",
            "storageBucket": "offerloop-native.firebasestorage.app",
        })
        print(f"Using credentials from: {cred_path}")
    else:
        firebase_admin.initialize_app(options={
            "projectId": "offerloop-native",
            "storageBucket": "offerloop-native.firebasestorage.app",
        })
        print("No GOOGLE_APPLICATION_CREDENTIALS found; using project defaults")
    return firestore.client()


def _item_is_bounce(item: dict) -> bool:
    """Notification items only carry snippet + name — no from-header or subject.
    Pass the snippet through both subject and snippet slots so any of the
    bounce phrases trip the detector."""
    snippet = (item or {}).get("snippet") or ""
    return is_bounce_message(from_email="", subject=snippet, snippet=snippet)


def cleanup_user(db, uid: str, dry_run: bool) -> dict:
    """Returns counters for this user."""
    stats = {
        "bounce_items_removed": 0,
        "notification_docs_updated": 0,
        "contacts_marked_bounced": 0,
        "contacts_not_found": 0,
    }

    notif_ref = db.collection("users").document(uid).collection("notifications").document("outbox")
    notif_snap = notif_ref.get()
    if not notif_snap.exists:
        return stats

    notif_data = notif_snap.to_dict() or {}
    items = list(notif_data.get("items") or [])
    if not items:
        return stats

    kept = []
    bounce_items = []
    for it in items:
        if _item_is_bounce(it):
            bounce_items.append(it)
        else:
            kept.append(it)

    if not bounce_items:
        return stats

    stats["bounce_items_removed"] = len(bounce_items)
    new_unread = sum(1 for i in kept if not i.get("read"))
    now_iso = datetime.now(timezone.utc).isoformat()

    if dry_run:
        for bi in bounce_items:
            name = bi.get("contactName") or bi.get("contactId") or "?"
            snippet_preview = (bi.get("snippet") or "")[:60]
            print(f"  [{uid[:8]}] would remove: {name!r} — {snippet_preview!r}")
    else:
        notif_ref.set(
            {
                "items": kept,
                "unreadReplyCount": new_unread,
                "updatedAt": now_iso,
            },
            merge=True,
        )
        stats["notification_docs_updated"] = 1

    contacts_ref = db.collection("users").document(uid).collection("contacts")
    for bi in bounce_items:
        contact_id = bi.get("contactId")
        if not contact_id:
            continue
        contact_ref = contacts_ref.document(contact_id)
        contact_snap = contact_ref.get()
        if not contact_snap.exists:
            stats["contacts_not_found"] += 1
            continue

        contact_data = contact_snap.to_dict() or {}
        # Only flip if the contact is still in the wrong "replied" state.
        # If the user already manually moved them, leave it alone.
        if contact_data.get("pipelineStage") != "replied":
            continue

        if dry_run:
            print(f"  [{uid[:8]}] would mark contact {contact_id} bounced (was 'replied')")
            stats["contacts_marked_bounced"] += 1
        else:
            contact_ref.update({
                "pipelineStage": "bounced",
                "inOutbox": False,
                "hasUnreadReply": False,
                "threadStatus": "bounced",
                "bouncedAt": now_iso,
                "lastActivityAt": now_iso,
                "updatedAt": now_iso,
            })
            stats["contacts_marked_bounced"] += 1

    return stats


def run(dry_run: bool):
    db = _init_firestore()
    print(f"\n{'DRY RUN' if dry_run else 'LIVE RUN'} — bounce notification cleanup\n")

    totals = {
        "users_scanned": 0,
        "users_with_bounces": 0,
        "bounce_items_removed": 0,
        "notification_docs_updated": 0,
        "contacts_marked_bounced": 0,
        "contacts_not_found": 0,
    }

    user_docs = list(db.collection("users").stream())
    print(f"Found {len(user_docs)} users\n")

    for user_doc in user_docs:
        totals["users_scanned"] += 1
        uid = user_doc.id
        try:
            stats = cleanup_user(db, uid, dry_run)
        except Exception as e:
            print(f"  [{uid[:8]}] ERROR: {e}")
            continue

        if stats["bounce_items_removed"]:
            totals["users_with_bounces"] += 1
        for k in ("bounce_items_removed", "notification_docs_updated",
                  "contacts_marked_bounced", "contacts_not_found"):
            totals[k] += stats[k]

        if totals["users_scanned"] % PROGRESS_EVERY == 0:
            print(f"  ... scanned {totals['users_scanned']} users "
                  f"({totals['users_with_bounces']} with bounces so far)")

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for k, v in totals.items():
        print(f"  {k}: {v}")
    if dry_run:
        print("\nRe-run with --execute to apply.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true",
                        help="Apply changes. Without this flag, runs as a dry run.")
    args = parser.parse_args()
    run(dry_run=not args.execute)


if __name__ == "__main__":
    main()
