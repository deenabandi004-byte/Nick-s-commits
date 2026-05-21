# Firestore Composite Indexes for Outbox/Tracker

These indexes are required after running the Phase 1 migration (`migrate_outbox_schema.py`).
They replace the full collection scan in `list_threads()` and support the new tracker queries.

## How to deploy

Option A: Add to `firestore.indexes.json` at the repo root and deploy with:
```bash
firebase deploy --only firestore:indexes
```

Option B: Create manually in the Firebase Console under Firestore > Indexes.

## Required indexes

All indexes are on the **subcollection** `contacts` under `users/{uid}`.
In `firestore.indexes.json`, subcollection indexes use `collectionGroup: "contacts"`.

### 1. Main outbox listing (replaces full collection scan)

**Purpose:** `list_threads()` - fetch only outbox contacts, filtered by stage, sorted by activity.

Fields:
- `inOutbox` ASC
- `pipelineStage` ASC
- `lastActivityAt` DESC

### 2. Needs Attention bucket

**Purpose:** Fast query for contacts with unread replies (the "Needs Attention" bucket).

Fields:
- `inOutbox` ASC
- `hasUnreadReply` ASC

### 3. Follow-up system (Phase 4)

**Purpose:** Query contacts due for follow-up, ordered by follow-up date.

Fields:
- `inOutbox` ASC
- `nextFollowUpAt` ASC

## `firestore.indexes.json`

```json
{
  "indexes": [
    {
      "collectionGroup": "contacts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "inOutbox", "order": "ASCENDING" },
        { "fieldPath": "pipelineStage", "order": "ASCENDING" },
        { "fieldPath": "lastActivityAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "contacts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "inOutbox", "order": "ASCENDING" },
        { "fieldPath": "hasUnreadReply", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "contacts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "inOutbox", "order": "ASCENDING" },
        { "fieldPath": "nextFollowUpAt", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

## Notes

- These are **collection-scope** indexes (not collection group), since contacts are
  always queried under a specific user: `users/{uid}/contacts`.
- The `inOutbox` field is set to `true` by the migration script for all contacts that
  have `gmailDraftId`, `gmailDraftUrl`, `gmailThreadId`, or a non-empty `pipelineStage`.
- Future code should set `inOutbox: true` whenever a contact enters the outbox
  (e.g., in `emails.py` generate-and-draft, `gmail_webhook.py`, etc.).
