# Outbox: Full Report

This document describes what the **Outbox** (Email Outreach) feature does in Offerloop: purpose, data flow, UI, APIs, Gmail integration, and how it fits into the product.

---

## 1. Purpose & User Value

**Outbox** is the **email outreach pipeline** for networking and recruiting. It lets users:

- **Track** outreach from first draft to connection (drafts → sent → replied → meeting → connected).
- **View** all contacts that have a Gmail draft or an active email thread in one place.
- **Sync** with Gmail to see when drafts were sent, when contacts replied, and the latest message snippet.
- **Manage pipeline stages** manually (e.g. mark as “Replied”, “Meeting Scheduled”, “Connected”, “No Response”, “Closed”).
- **Generate AI reply drafts** when a contact has replied: the app creates a suggested reply, saves it as a Gmail draft, and optionally opens it in Gmail.

In short: **Find People** creates contacts and drafts; **Outbox** tracks those conversations and helps users reply with AI-generated follow-ups.

---

## 2. High-Level Architecture

| Layer | Components |
|-------|------------|
| **Frontend** | `connect-grow-hire/src/pages/Outbox.tsx` (main page), `OutboxEmbedded.tsx`, `Outbox.tsx` (component), sidebar/header links |
| **API** | `apiService.getOutboxThreads()`, `getOutboxStats()`, `patchOutboxStage()`, `batchSyncOutbox()`, `syncOutboxThread()`, `regenerateOutboxReply()` |
| **Backend** | `backend/app/routes/outbox.py` (Flask blueprint), `backend/app/services/gmail_client.py`, `reply_generation.py`, `background_sync.py` |
| **Data** | Firestore: `users/{uid}/contacts` (contacts with `gmailThreadId` and/or `gmailDraftId`/`gmailDraftUrl`) |
| **External** | Gmail API (drafts, threads, messages), optional Gmail push webhook (replies) |

Contacts appear in Outbox **only if** they have at least one of:

- `gmailThreadId` (or legacy `gmail_thread_id`)
- `gmailDraftId` / `gmailDraftUrl` (or legacy `gmail_draft_id` / `gmail_draft_url`)

So the **source of Outbox entries** is any flow that creates a Gmail draft or thread for a contact (e.g. **Find People** → “Generate and draft” or bulk draft creation, which writes these fields to the contact document).

---

## 3. Data Model

### 3.1 Contact fields used by Outbox

Stored under `users/{uid}/contacts/{contactId}`:

| Field | Purpose |
|-------|--------|
| `gmailThreadId` / `gmail_thread_id` | Gmail thread ID once the first email is sent (or thread exists). |
| `gmailDraftId` / `gmail_draft_id` | Current Gmail draft ID (outreach or reply draft). |
| `gmailDraftUrl` / `gmail_draft_url` | URL to open the draft in Gmail (e.g. `#drafts?compose={messageId}`). |
| `gmailMessageId` / `gmail_message_id` | Gmail message ID for the draft (used for compose URL). |
| `draftStillExists` | If `false`, backend treats draft as sent and may set `emailSentAt` and `pipelineStage` (e.g. `waiting_on_reply`). |
| `pipelineStage` / `pipeline_stage` | One of: `draft_created`, `email_sent`, `waiting_on_reply`, `replied`, `meeting_scheduled`, `connected`, `no_response`, `bounced`, `closed`. |
| `threadStatus` | Synced status from Gmail: e.g. `no_reply_yet`, `waiting_on_them`, `new_reply`, `waiting_on_you`, `closed`. |
| `lastMessageSnippet` / `last_message_snippet` | Latest message snippet shown in the list. |
| `lastActivityAt` / `last_activity_at` | Used for sorting “recent activity”. |
| `hasUnreadReply` / `has_unread_reply` | Whether the latest message is an unread reply from the contact. |
| `suggestedReply` | AI-generated reply text (after “Regenerate”). |
| `replyType` | Classification: `positive`, `referral`, `delay`, `decline`, `question`. |
| `emailSentAt` / `email_sent_at` | When the first email was considered sent (e.g. when draft disappeared). |
| `lastSyncAt` / `last_sync_at` | Last time this contact was synced with Gmail. |
| `lastSyncError` | `{ code, message, at }` when sync failed (e.g. rate limit, Gmail error). |
| `emailSubject` / `email_subject`, `emailBody` / `email_body` | Subject/body of the outreach (for display and reply context). |
| `firstName`, `lastName`, `company`, `jobTitle`, `email` | Contact identity and display. |

### 3.2 OutboxThread (API response)

The backend maps each contact doc to an **OutboxThread** object (see `_build_outbox_thread` in `outbox.py`). The frontend type `OutboxThread` in `api.ts` includes:

- `id` (contact ID), `contactName`, `jobTitle`, `company`, `email`
- `status`, `pipelineStage`, `lastMessageSnippet`, `lastActivityAt`
- `hasDraft`, `suggestedReply`, `gmailDraftUrl`, `gmailDraftId`, `gmailMessageId`, `replyType`
- `lastSyncError`, `emailSentAt`, `hasUnreadReply`, `lastSyncAt`, `duplicateOf`

Pipeline stage is derived from `pipelineStage` when present; otherwise from legacy fields (`threadStatus`, `hasUnreadReply`, draft/thread existence).

---

## 4. Pipeline Stages

Stages represent the outreach lifecycle:

| Stage | Meaning |
|-------|--------|
| **draft_created** | User has a Gmail draft (outreach or reply) not yet sent. |
| **email_sent** | First email sent (draft no longer exists; may be set manually). |
| **waiting_on_reply** | Email sent, waiting for contact to reply. |
| **replied** | Contact replied; user can generate/regenerate a reply draft. |
| **meeting_scheduled** | User marked that a meeting was scheduled. |
| **connected** | User marked as connected. |
| **no_response** | User marked as no response (e.g. gave up). |
| **bounced** | Email bounced. |
| **closed** | Conversation closed. |

Frontend tabs filter by these (All, Drafts, Sent, Replied, Meeting, Connected, No Reply). Stats (e.g. reply rate, “Sent”, “Replied”) are computed from these stages.

---

## 5. Backend API (Flask)

All under `/api/outbox`, Firebase auth required.

### 5.1 GET `/api/outbox/threads`

- **Purpose**: List contacts that have a Gmail thread or draft (Outbox list).
- **Query**: `page`, `per_page` (capped 100), `stage` (comma-separated), `sort`, `sort_dir`.
- **Behavior**: Reads `users/{uid}/contacts`, keeps only contacts with `gmailThreadId` or draft IDs/URLs, builds `OutboxThread` for each, deduplicates by email (marks `duplicateOf`), filters by stage, sorts (default `lastActivityAt` desc), paginates.
- **Response**: `{ threads, pagination }`. No Gmail calls here; sync is done lazily on open or via batch-sync.

### 5.2 GET `/api/outbox/stats`

- **Purpose**: Aggregate counts and metrics for the pipeline.
- **Behavior**: Same contact filter (thread or draft). Counts by `pipelineStage`, plus:
  - `total`, `replyRate`, `avgResponseTimeDays`, `meetingRate`
  - `thisWeekSent` (emailSentAt in last 7 days), `thisWeekReplied` (replied/meeting/connected with activity in last 7 days).
- **Response**: JSON with counts and rates.

### 5.3 PATCH `/api/outbox/threads/<contact_id>/stage`

- **Purpose**: Manually set `pipelineStage` (and optional timestamps for meeting_scheduled / connected).
- **Body**: `{ "pipelineStage": "replied" }` (or another allowed stage).
- **Response**: `{ thread }` (updated OutboxThread).

### 5.4 POST `/api/outbox/threads/batch-sync`

- **Purpose**: Sync multiple contacts with Gmail (rate-limited, 1s delay between each).
- **Body**: Either `{ "contactIds": ["id1", "id2", ...] }` (max 10) or `{ "mode": "stale", "max": 10 }`.
- **Stale mode**: Uses `background_sync.get_stale_thread_ids(uid, max_threads)` to pick contacts in `email_sent` / `waiting_on_reply` / `replied` with `gmailThreadId`, sorted by `lastSyncAt` (oldest first).
- **Response**: `{ results: [ { contactId, synced, pipelineStage?, error? } ] }`.

### 5.5 POST `/api/outbox/threads/<thread_id>/sync`

- **Purpose**: Sync one thread when the user opens it in the UI.
- **Behavior**: Calls `_perform_sync(uid, thread_id, user_email)`. Returns updated `thread` and `synced` (and possibly `error` / `authUrl` for Gmail disconnect).
- **Response**: `{ thread, synced }` or error (404, 401, 429, 502).

### 5.6 POST `/api/outbox/threads/<thread_id>/regenerate`

- **Purpose**: Generate a new AI reply for a contact who has already replied, save it as a Gmail draft, and update the contact with `suggestedReply` and draft URLs.
- **Checks**: User exists, credits ≥ 10, contact exists, has `gmailThreadId`, Gmail connected, latest message in thread is from the contact (not the user).
- **Flow**:
  1. Deduct 10 credits (reply generation cost).
  2. Fetch latest message from Gmail thread (contact’s message).
  3. Call `reply_generation.generate_reply_to_message(...)` to get `body` and `replyType`.
  4. Create a Gmail draft (reply in same thread), then update contact with `suggestedReply`, `replyType`, `gmailDraftUrl`, `gmailDraftId`, `gmailMessageId`, `pipelineStage: "draft_created"`.
  5. On AI failure: refund credits and return 500.
- **Response**: `{ success, thread, credits_used, credits_remaining }` or error (e.g. insufficient_credits, gmail_not_connected, no_contact_reply).

---

## 6. Gmail Sync Logic (`_perform_sync`)

`_perform_sync(uid, contact_id, user_email)` in `outbox.py`:

1. **Sync lock**: If `lastSyncAt` is within last 10 seconds, return cached thread and `synced=False` (avoid thundering herd).
2. **Gmail service**: Load user Gmail creds; if missing or invalid, set `lastSyncError`, return `gmail_disconnected` or `gmail_error`.
3. **Draft existence** (if contact has draft ID): Rate limit (30 Gmail API calls/min per user). Optionally use cached “draft exists” for 5 minutes. Call Gmail to check if draft still exists:
   - If **draft no longer exists** and we have `gmailThreadId`: set `draftStillExists: false`, `pipelineStage: "waiting_on_reply"`, and `emailSentAt` if not set.
   - If draft was deleted and we **don’t** have `gmailThreadId`: try to find the sent message by `to:contact_email` and subject, then backfill `gmailThreadId` and sent timestamps.
4. **Thread message sync** (if we have `gmailThreadId` and draft is gone): Respect 30s “cooldown” since last sync, then call `gmail_client.sync_thread_message(...)`. That returns latest snippet, who sent it, and whether there’s an unread reply from the contact. Backend updates:
   - `lastMessageSnippet`, `lastActivityAt`, `lastSyncAt`, `lastSyncError = null`
   - `hasUnreadReply`, `threadStatus`
   - If status is new reply or waiting_on_you, set `pipelineStage: "replied"`.
5. **Success**: Clear `lastSyncError`, return built thread and `synced=True`.

So: **single-thread sync** runs on open; **batch-sync** runs on page load (stale mode, up to 10 threads) to refresh counts and snippets without opening each thread.

---

## 7. How Contacts Get Into Outbox

A contact appears in Outbox when it has **either** a Gmail thread ID **or** a draft ID/URL. Those are set by:

- **Find People → “Generate and draft”** (`POST /api/emails/generate-and-draft` in `emails.py`): Creates Gmail drafts for selected contacts and writes to Firestore `gmailDraftId`, `gmailMessageId`, `gmailDraftUrl`, `emailSubject`, `emailBody`, `pipelineStage: "draft_created"`, and optionally `gmailThreadId` if the API returns it.
- **Bulk draft creation** (e.g. from runs or other flows that call `create_gmail_draft_for_user` / `create_drafts_batch` in `gmail_client.py`): Same idea - create draft, then save contact with draft and thread IDs where available.
- **Regenerate reply** (Outbox): Creates a **new** Gmail draft (the reply) and updates the same contact with the new draft IDs and `suggestedReply`; the contact already had `gmailThreadId` from the first sent email.

So: **drafts and threads are created elsewhere**; Outbox only **lists**, **syncs**, and **updates** those contacts and adds **reply-generation** on top.

---

## 8. Gmail Push (Webhook)

`backend/app/routes/gmail_webhook.py` receives Gmail push notifications (Pub/Sub). On history change it:

- Finds the user by Gmail address, loads Gmail service, fetches history (messageAdded).
- For each new/changed message, finds the matching contact by thread ID and updates Firestore (e.g. `hasUnreadReply`, snippet, status). This can surface new replies in Outbox without the user opening the thread or running batch-sync.

Outbox itself does not call the webhook; it benefits from the fact that contacts are updated when new mail arrives.

---

## 9. Frontend Behavior

### 9.1 Outbox page (`Outbox.tsx`)

- **Layout**: Two columns - left: list of threads (tabs, search, sort); right: selected thread detail.
- **Data**:
  - `getOutboxThreads()` → list of threads (with optional pagination params).
  - `getOutboxStats()` → stats for cards and tab counts.
- **On load**: Triggers `batchSyncOutbox({ mode: "stale", max: 10 })` once, then invalidates threads and stats so the list and counts refresh.
- **Tabs**: All, Drafts, Sent, Replied, Meeting, Connected, No Reply. Filtering uses `pipelineStage` (with legacy fallback via `getDisplayStage`).
- **Sort**: Recent activity (default), Oldest first, Recently sent.
- **Search**: Debounced search over contact name, company, job title, email, snippet.
- **Selecting a thread**: Calls `syncOutboxThread(threadId)` to refresh that thread; marks unread as read (notifications).
- **Detail panel**: Shows contact info, “Latest message” (or “Draft content”), suggested reply (read-only textarea), and actions:
  - **Open Gmail draft**: Opens `gmailDraftUrl` or `#drafts?compose={gmailMessageId}` in a new tab.
  - **Copy reply text**: Copies `suggestedReply` to clipboard.
  - **Regenerate**: Calls `regenerateOutboxReply(threadId)` (costs 10 credits); shows toasts for errors (e.g. insufficient credits, Gmail not connected).
- **Per-thread dropdown**: “Mark as Sent / Replied / Meeting Scheduled / Connected / No Response / Closed”, “Open in Gmail”. Stage changes call `patchOutboxStage(contactId, stage)` with optimistic updates.

### 9.2 Notifications

`useNotifications` and `markOneRead` are used when the user opens a thread that has an unread reply, so the app can mark that conversation as read in the notification state.

---

## 10. Credits & Rate Limits

- **Reply generation** (Regenerate): **10 credits** per request. Deducted before calling OpenAI; refunded if AI or draft creation fails after deduction.
- **Gmail API**: Backend enforces **30 calls per minute per user** for Gmail (draft check + thread/message fetch). Sync lock (10s) and batch-sync (1s between contacts, max 10) limit load.

---

## 11. Files Reference

| Area | Path |
|------|------|
| Outbox page | `connect-grow-hire/src/pages/Outbox.tsx` |
| Outbox components | `connect-grow-hire/src/components/Outbox.tsx`, `OutboxEmbedded.tsx` |
| API types & calls | `connect-grow-hire/src/services/api.ts` (OutboxThread, getOutboxThreads, getOutboxStats, patchOutboxStage, batchSyncOutbox, syncOutboxThread, regenerateOutboxReply) |
| Backend routes | `backend/app/routes/outbox.py` |
| Gmail sync / draft | `backend/app/services/gmail_client.py` (sync_thread_message, get_latest_message_from_thread, draft creation) |
| Reply AI | `backend/app/services/reply_generation.py` (generate_reply_to_message) |
| Stale batch sync | `backend/app/services/background_sync.py` (get_stale_thread_ids, sync_stale_threads) |
| Gmail push | `backend/app/routes/gmail_webhook.py` |
| Creating drafts (entry into Outbox) | `backend/app/routes/emails.py` (generate-and-draft), `gmail_client.py` (create_gmail_draft_for_user, create_drafts_batch) |

---

## 12. Summary

**Outbox** is the **email outreach pipeline**: it lists contacts that have a Gmail draft or thread, syncs with Gmail to reflect “draft sent” and “contact replied,” lets users manage pipeline stages and see stats, and **generates AI reply drafts** (saved to Gmail) when a contact has replied. Data lives in Firestore contacts; Gmail is the source of truth for thread state and message content; the backend coordinates sync, rate limits, and credits for reply generation.
