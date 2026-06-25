# Contact Sharing — Design

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan

## Goal

Let a user select records in **My Network** and share them to another Offerloop
user by email. The recipient gets a popup on their next login/refresh to accept
the share. Accepted records land in their own spreadsheet with a green "imported"
highlight. Receiving shared records is a Pro/Elite feature; free users are pushed
through a free-trial upsell at accept time.

Applies to all three My Network tabs: **People (contacts), Companies, Hiring Managers.**

## Part A — My Network action bar cleanup

Applies to the bulk-selection action bar on all three tabs.

- **Remove the refresh/reload button** on all three tabs.
- **"Delete Selected (#)"** → replace with a **red trash icon only** (no text, count
  conveyed by the selection state already shown).
- **Keep "Export CSV"** as-is.
- **Add "Share Selected"** button.
- **Add a grey share icon** (TikTok-style share glyph, grey) in the top actions row
  of My Network — an alternate entry point to the same share flow when rows are
  selected.

These are frontend-only changes. Exact component(s) and the existing
"new contact" blue-highlight class will be confirmed against the code at
implementation time so the green highlight matches the same pattern.

## Part B — Share flow (sender)

1. With rows selected, user clicks **Share Selected** (or the top share icon).
2. A small dialog opens with a single **"Share to" email** field.
3. On submit, backend validates the email maps to a real Offerloop user account.
   - **No matching account** → inline error: **"Not an Offerloop account."** Nothing
     is sent.
   - **Match** → write a pending-share record, close dialog, confirm
     "Shared with {name}."

## Part C — Data model

New top-level Firestore collection `pendingShares/{shareId}`:

| Field | Type | Notes |
|-------|------|-------|
| `fromUid` | string | Sender uid |
| `fromName` | string | Sender display name (for the recipient popup) |
| `toUid` | string | Resolved recipient uid (lookup by email at share time) |
| `toEmail` | string | Recipient email as entered |
| `kind` | string | `contacts` \| `companies` \| `hiringManagers` |
| `items` | array | Snapshot of the selected records at share time |
| `status` | string | `pending` \| `accepted` \| `declined` |
| `createdAt` | timestamp | Server timestamp |

Notes:
- `items` is a **snapshot** — later edits/deletes by the sender don't affect a
  pending share.
- Recipient is resolved to `toUid` at share time. If no account exists for the
  email, the share is never created (see Part B).
- Firestore rules: a user may read shares where `toUid == me`; the backend writes
  them (sender cannot directly write to another user's data).

## Part D — Recipient side

1. On login/refresh, query `pendingShares` where `toUid == me && status == pending`.
2. If any exist, show a popup: **"{fromName} shared {N} {kind} with you — Accept / Decline."**
   - Multiple pending shares → show them one at a time (or a stacked list; single
     decision per share).
3. **Decline** → set `status: declined`. Nothing imported.
4. **Accept** — behavior depends on recipient tier:
   - **Pro / Elite:** copy each item into the recipient's own subcollection by kind:
     - `contacts` → `users/{uid}/contacts`
     - `companies` → `users/{uid}/manual_firms`
     - `hiringManagers` → `users/{uid}/recruiters`

     Set `status: accepted`. Flag each imported record `sharedImport: true`.
   - **Free:** clicking **Accept** fires the **upgrade / free-trial modal** (Pro).
     The share stays `pending`. After the user upgrades, accept completes and the
     import runs as above. (Confirmed: accept-first, then prompt — option A.)

## Part E — Highlight + post-accept actions

- Imported records render with a **faint green highlight** (distinct from the
  existing faint-blue "new" highlight), driven by the `sharedImport: true` flag.
  Reuse the same highlight mechanism/pattern as the blue one, swapping the color.
- After a successful accept, show a banner/toast on the spreadsheet:
  **"{N} contacts added — Draft emails · View in inbox."**
  - **Draft emails** → reuses the existing **bulk drafting** flow (Pro feature) for
    the imported set.
  - **View in inbox** → opens the imported set in the tracker/inbox view.
- The exact "draft email to everyone imported" UI is intentionally light in v1:
  it routes into the existing bulk-draft path rather than introducing a new
  composer.

## Out of scope (v1)

- Sharing to non-Offerloop emails / invite-on-share (returns error instead).
- Sender-side history of who they shared with.
- Re-share / forwarding of received contacts.
- De-duplication against records the recipient already has (imports may create
  duplicates; acceptable for v1).
