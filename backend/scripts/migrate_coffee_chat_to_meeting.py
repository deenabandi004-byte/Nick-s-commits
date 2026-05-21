#!/usr/bin/env python3
"""
Migration: Coffee Chat Prep -> Meeting Prep (persisted data).

The "Coffee Chat Prep" feature was rebranded to "Meeting Prep" across all code
and UI. Three identifiers were intentionally left on the legacy name because
they address live production data and cannot be renamed in code without first
migrating that data:

  1. Firestore subcollection   users/{uid}/coffee-chat-preps  -> users/{uid}/meeting-preps
  2. Cloud Storage path prefix coffee_chat_preps/             -> meeting_preps/
  3. User-doc usage field      coffeeChatPrepsUsed            -> meetingPrepsUsed

This script COPIES (never deletes) that data to the new names, so it is safe
and reversible. The old data stays in place as a backup.

Procedure:
  1. Back up Firestore / Storage (or trust the copy-only behaviour below).
  2. Dry run:   python backend/scripts/migrate_coffee_chat_to_meeting.py
  3. Live run:  python backend/scripts/migrate_coffee_chat_to_meeting.py --execute
  4. After the run succeeds, flip the three identifiers in code and deploy:
       - backend/app/routes/meeting_prep.py   "coffee-chat-preps"  -> "meeting-preps"
                                              "coffee_chat_preps/" -> "meeting_preps/"
       - backend/app/routes/contacts.py       "coffee-chat-preps"  -> "meeting-preps"
       - backend/app/routes/scout_assistant.py"coffee-chat-preps"  -> "meeting-preps"
       - backend/app/services/outbox_service.py "coffee-chat-preps" -> "meeting-preps"
       - backend/app/models/users.py, services/auth.py, services/stripe_client.py,
         routes/billing.py, routes/users.py, routes/meeting_prep.py
                                              "coffeeChatPrepsUsed" -> "meetingPrepsUsed"
       - backend/app/config.py                config key "coffee_chat_preps" (optional)
     Run a repo-wide grep for the three strings to catch every reader/writer.
  5. Once the new code is verified in production, the legacy subcollection,
     storage prefix, and field can be deleted in a follow-up cleanup.

Usage:
    python backend/scripts/migrate_coffee_chat_to_meeting.py            # dry run
    python backend/scripts/migrate_coffee_chat_to_meeting.py --execute   # live run
"""
import os
import sys
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, BACKEND_DIR)

import firebase_admin
from firebase_admin import credentials, firestore, storage

OLD_SUBCOLLECTION = "coffee-chat-preps"
NEW_SUBCOLLECTION = "meeting-preps"
OLD_STORAGE_PREFIX = "coffee_chat_preps/"
NEW_STORAGE_PREFIX = "meeting_preps/"
OLD_FIELD = "coffeeChatPrepsUsed"
NEW_FIELD = "meetingPrepsUsed"

BATCH_LIMIT = 400


def _init_firebase():
    """Initialize Firebase Admin SDK; return (firestore_client, storage_bucket)."""
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        options = {
            "projectId": "offerloop-native",
            "storageBucket": "offerloop-native.firebasestorage.app",
        }
        if cred_path and os.path.exists(cred_path):
            print(f"Using credentials from: {cred_path}")
            firebase_admin.initialize_app(credentials.Certificate(cred_path), options)
        else:
            print("No GOOGLE_APPLICATION_CREDENTIALS found; using project defaults")
            firebase_admin.initialize_app(options=options)
    return firestore.client(), storage.bucket()


def migrate_firestore(db, dry_run: bool):
    """Copy the usage field and the preps subcollection for every user."""
    users = list(db.collection("users").stream())
    print(f"\nFirestore: scanning {len(users)} users")

    fields_copied = 0
    preps_copied = 0
    preps_skipped = 0
    errors = []
    batch = db.batch()
    batch_count = 0

    for user_doc in users:
        uid = user_doc.id
        data = user_doc.to_dict() or {}

        # 1. Copy the usage counter field.
        if OLD_FIELD in data:
            new_value = data.get(OLD_FIELD, 0)
            if data.get(NEW_FIELD) != new_value:
                fields_copied += 1
                if not dry_run:
                    batch.update(user_doc.reference, {NEW_FIELD: new_value})
                    batch_count += 1
                    if batch_count >= BATCH_LIMIT:
                        batch.commit()
                        batch = db.batch()
                        batch_count = 0

        # 2. Copy the preps subcollection (preserving document IDs).
        src = db.collection("users").document(uid).collection(OLD_SUBCOLLECTION)
        dst = db.collection("users").document(uid).collection(NEW_SUBCOLLECTION)
        try:
            for prep in src.stream():
                if dst.document(prep.id).get().exists:
                    preps_skipped += 1
                    continue
                preps_copied += 1
                if not dry_run:
                    dst.document(prep.id).set(prep.to_dict() or {})
        except Exception as e:  # noqa: BLE001
            errors.append(f"user={uid}: {e}")

    if not dry_run and batch_count > 0:
        batch.commit()

    print(f"  usage fields to copy ({OLD_FIELD} -> {NEW_FIELD}): {fields_copied}")
    print(f"  prep docs to copy:    {preps_copied}")
    print(f"  prep docs skipped (already migrated): {preps_skipped}")
    if errors:
        print(f"  errors: {len(errors)}")
        for e in errors:
            print(f"    {e}")
    return fields_copied, preps_copied, errors


def migrate_storage(bucket, dry_run: bool):
    """Copy every Cloud Storage blob from the old prefix to the new prefix."""
    blobs = list(bucket.list_blobs(prefix=OLD_STORAGE_PREFIX))
    print(f"\nStorage: found {len(blobs)} blobs under '{OLD_STORAGE_PREFIX}'")

    copied = 0
    skipped = 0
    errors = []
    for blob in blobs:
        new_name = NEW_STORAGE_PREFIX + blob.name[len(OLD_STORAGE_PREFIX):]
        try:
            if bucket.blob(new_name).exists():
                skipped += 1
                continue
            copied += 1
            if not dry_run:
                bucket.copy_blob(blob, bucket, new_name)
        except Exception as e:  # noqa: BLE001
            errors.append(f"blob={blob.name}: {e}")

    print(f"  blobs to copy: {copied}")
    print(f"  blobs skipped (already migrated): {skipped}")
    if errors:
        print(f"  errors: {len(errors)}")
        for e in errors:
            print(f"    {e}")
    return copied, errors


def main():
    parser = argparse.ArgumentParser(
        description="Migrate Coffee Chat Prep persisted data to Meeting Prep names."
    )
    parser.add_argument(
        "--execute", action="store_true",
        help="Actually copy data (default is a dry run that writes nothing).",
    )
    args = parser.parse_args()
    dry_run = not args.execute

    db, bucket = _init_firebase()

    print("=" * 64)
    print(f"{'DRY RUN (no writes)' if dry_run else 'LIVE RUN'} - coffee-chat -> meeting migration")
    print("=" * 64)

    f_fields, f_preps, f_errors = migrate_firestore(db, dry_run)
    s_blobs, s_errors = migrate_storage(bucket, dry_run)

    print("\n" + "=" * 64)
    print("SUMMARY")
    print("=" * 64)
    print(f"  Firestore usage fields copied: {f_fields}")
    print(f"  Firestore prep docs copied:    {f_preps}")
    print(f"  Storage blobs copied:          {s_blobs}")
    print(f"  Errors:                        {len(f_errors) + len(s_errors)}")
    if dry_run:
        print("\nThis was a DRY RUN. Nothing was written. Re-run with --execute to apply.")
    else:
        print("\nLIVE RUN complete. Old data was left in place as a backup.")
        print("Next: flip the three legacy identifiers in code and deploy (see docstring).")


if __name__ == "__main__":
    main()
