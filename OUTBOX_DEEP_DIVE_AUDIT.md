# Outbox Feature - Full Deep Dive Audit

This document is the result of a full audit of the Outbox feature: backend routes, sync logic, frontend components, data flow, and gaps. It is intended to fix the Outbox and turn it into a reliable pipeline/kanban view.

---

## 1. Outbox Backend - Full Audit

### 1.1 Routes & Endpoints

All endpoints live in **`backend/app/routes/outbox.py`** (blueprint `outbox_bp`, prefix `/api/outbox`).

| Endpoint | Method | What it does | Firestore read/write | Returns |
|----------|--------|---------------|----------------------|--------|
| `/api/outbox/threads` | GET | List outbox threads for the user | **Read**: `users/{uid}/contacts` - streams all contact docs | `{ threads, pagination }` |
| `/api/outbox/threads/<id>/regenerate` | POST | Generate AI reply for a thread, create Gmail draft, update contact | **Read**: user doc, contact doc. **Write**: contact doc (suggestedReply, replyType, gmailDraftId, gmailDraftUrl, draftCreatedAt, updatedAt) | `{ success, thread, credits_used, credits_remaining }` or error |
| `/api/outbox/threads/<id>/sync` | POST | Sync one thread with Gmail (draft existence, threadId backfill, message sync) | **Read**: contact doc. **Write**: contact doc (draftStillExists, gmailThreadId, lastMessageSnippet, lastActivityAt, lastSyncAt, hasUnreadReply, threadStatus, updatedAt) | `{ thread }` |

**List threads (`GET /api/outbox/threads`):**

- **Included contacts:** A contact is included if it has **either**:
  - `gmailThreadId` or `gmail_thread_id`, **or**
  - `gmailDraftId` / `gmail_draft_id` / `gmailDraftUrl` / `gmail_draft_url`
- **Excluded:** Contacts that were saved but never had a draft created (no draft ID, no thread ID) do **not** appear in the Outbox.
- **No Gmail API on list:** The list uses only Firestore; no Gmail calls. Sync runs later when the user opens a thread (`POST .../sync`).
- **Pagination:** Supports `page` and `per_page` (default 50, max 100). Response includes `pagination: { page, per_page, total, total_pages, has_next, has_prev }`. The frontend does **not** pass `page`/`per_page` and does **not** use pagination - it only ever gets the first page (up to 50 threads).

---

### 1.2 `_build_outbox_thread()` - How `threadStatus` / `status` Is Computed

**Location:** `backend/app/routes/outbox.py` (lines 83–202).

**Input:** A Firestore contact doc (or dict with same shape).  
**Output:** A single OutboxThread-like dict with camelCase keys for the frontend.

**Status logic (priority order):**

1. **Has draft ID/URL?** (`has_draft` = any of `gmailDraftId`, `gmail_draft_id`, `gmailDraftUrl`, `gmail_draft_url`)
   - **If `draftStillExists === False`** (verified deleted/sent):
     - Use stored `threadStatus` if present.
     - Else if `gmailThreadId`: `hasUnreadReply` → `"new_reply"`, else `"waiting_on_them"`.
     - Else (draft gone, no thread yet): `"waiting_on_them"`.
   - **Else** (draft exists or not yet verified): **`"no_reply_yet"`** (treated as draft).
2. **No draft ID:**
   - Use stored `threadStatus` if present.
   - Else if `gmailThreadId`: `hasUnreadReply` → `"new_reply"`, else `"waiting_on_them"`.
   - Else: **`"no_reply_yet"`**.

**Possible `status` values from this function:**

- `no_reply_yet` - Draft pending or no thread/draft info
- `new_reply` - Thread exists, latest message from contact, unread
- `waiting_on_them` - Sent, waiting for contact
- `waiting_on_you` - Contact replied (read or unread), your turn

**Not produced by backend:** `closed`. The frontend type includes `closed`, but no backend code sets `threadStatus` to `"closed"` and `sync_thread_message()` never returns it. So `closed` is effectively dead.

**Field handling:**

- Both camelCase and snake_case are read for: `firstName`/`first_name`, `lastName`/`last_name`, `jobTitle`/`job_title`, `gmailThreadId`/`gmail_thread_id`, `gmailDraftId`/`gmail_draft_id`, `hasUnreadReply`/`has_unread_reply`, `lastActivityAt`/`last_activity_at`, `lastMessageSnippet`/`last_message_snippet`, `emailBody`/`email_body`, `emailSubject`/`email_subject`.
- `draftStillExists` default is `True` if missing (conservative: assume draft until proven otherwise).
- Snippet: prefers `lastMessageSnippet`; if no thread, falls back to `emailBody` or "Draft is ready to send in Gmail"; else "We will sync the latest Gmail reply soon."

---

### 1.3 Sync Flow: `POST /api/outbox/threads/<id>/sync`

**Purpose:** Refresh one contact’s state from Gmail and update Firestore.

**Steps:**

1. **Load contact** from `users/{uid}/contacts/{thread_id}`. 404 if missing.
2. **Gmail service:** `_load_user_gmail_creds(uid)` then `_gmail_service(creds)`. On failure, log and continue **without** Gmail (return current Firestore state only; no error response).
3. **Draft existence (if contact has draft ID and Gmail available):**
   - Rate limit: `_check_gmail_rate_limit(uid)` (max 30 Gmail API calls per user per minute).
   - **Cached draft check:** `_check_draft_exists_cached(gmail_service, draft_id, cache_ttl_minutes=5)`.
     - Cache: process-local dict keyed by `draft_{draft_id}`; TTL 5 minutes.
     - On cache miss: `gmail_service.users().drafts().get(userId='me', id=draft_id, format='minimal')` → exists = True; on exception → exists = False.
   - Update Firestore: `draftStillExists: exists`, `updatedAt`.
   - **If draft no longer exists and we don’t have `gmailThreadId`:**
     - Search Gmail: `messages.list(userId='me', q='to:{email} subject:"{subject}"', maxResults=1)`.
     - From first message, get `threadId`; update contact with `gmailThreadId` and `updatedAt`.
     - On search error: log only; no Firestore update for threadId.
4. **Message sync (only if we have `gmail_thread_id`, Gmail service, and draft does not still exist):**
   - **Throttle:** If `lastSyncAt` exists and is &lt; 30 seconds ago, skip sync (still update response from current doc).
   - **Rate limit:** Must pass `_check_gmail_rate_limit(uid)`.
   - **Call:** `sync_thread_message(gmail_service, gmail_thread_id, contact_email, user_email)` (in `gmail_client.py`).
   - **Updates applied:** `lastMessageSnippet`, `lastActivityAt`, `lastSyncAt`, `updatedAt`; if present in result: `hasUnreadReply`, `threadStatus` (= `sync_result['status']`).
   - On exception: log; still set `lastSyncAt` and `updatedAt` so we don’t retry immediately.
5. **Response:** `_build_outbox_thread(doc)` (re-fetched after sync) → `{ thread }`.

**How “draft still exists” is checked:**  
Via Gmail `drafts.get` (with 5‑minute cache). If the draft was sent or deleted in Gmail, the API returns 404 → we set `draftStillExists = False`.

**How “email was sent” is inferred:**  
Draft no longer exists (`draftStillExists` False). Optionally we then backfill `gmailThreadId` via search.

**How `gmailThreadId` is backfilled:**  
When draft is gone and we don’t have threadId: Gmail search by `to:{contact_email}` and `subject:"{emailSubject}"` (first 50 chars), then take `threadId` from the first message. Subject mismatch or no result → no backfill.

**How replies are detected:**  
Inside `sync_thread_message()`: fetch full thread, take latest message, compare `From` to `sent_to_email` and `user_email` to set `is_from_recipient` / `is_from_user`, and check `UNREAD` in `labelIds`. Status is derived from that (see below).

**Fields updated on contact after sync:**

- From draft check: `draftStillExists`, `updatedAt`
- From thread backfill: `gmailThreadId`, `updatedAt`
- From message sync: `lastMessageSnippet`, `lastActivityAt`, `lastSyncAt`, `updatedAt`, and optionally `hasUnreadReply`, `threadStatus`

**Failure modes:**

- **Gmail token expired / invalid:** Credential load or refresh fails → sync runs without Gmail; returns cached Firestore state; no 4xx/5xx.
- **Draft deleted but thread not found:** Search fails or returns no match → `gmailThreadId` never set → contact stays “draft deleted” with no thread; status can remain `waiting_on_them` with no snippet from Gmail.
- **Rate limit (30/min):** `_check_gmail_rate_limit` returns False → draft check and/or message sync skipped; Firestore may not get latest state; again no error to client.
- **Sync throws:** Caught in sync block; `lastSyncAt`/`updatedAt` still written; client gets thread built from possibly stale doc.

**Caching:**  
Only the **draft existence** check is cached (in-memory, 5 min TTL per draft ID). No caching for thread fetch or message sync.

---

### 1.4 Known Bugs / Issues (Backend)

- **Race conditions:** No lock per contact. Two simultaneous syncs for the same thread can both run (multiple Firestore writes, multiple Gmail calls). No mutex or “sync in progress” flag.
- **Stuck status:** Contacts can stay in a status if: (1) user never opens the thread (sync never runs), (2) rate limit prevents sync, (3) Gmail creds fail (sync no-op), (4) draft deleted but thread search fails so we never get `gmailThreadId` and never run message sync.
- **Silent failures:** Gmail init failure or rate limit results in returning cached/stale data with 200; client cannot tell that sync didn’t run.
- **CamelCase vs snake_case:** Backend reads both; it writes camelCase. If any other code writes only snake_case, those fields are still read correctly in outbox. No evidence of writes using wrong casing in outbox itself.
- **`closed` status:** Never set by backend; frontend type includes it but it’s unused.
- **Pagination ignored by client:** Backend returns pagination; frontend never sends `page`/`per_page` and doesn’t use `pagination` - users with &gt;50 threads only see first 50 with no “Load more”.

---

## 2. Outbox Frontend - Full Audit

### 2.1 Components & Pages

| File | Role |
|------|------|
| **`connect-grow-hire/src/pages/Outbox.tsx`** | Main Outbox page; route `/outbox`. Renders full layout with sidebar, thread list, detail, and reply actions. |
| **`connect-grow-hire/src/components/OutboxEmbedded.tsx`** | Embedded Outbox for `/home?tab=outbox`; same behavior in a tab. |
| **`connect-grow-hire/src/components/AppSidebar.tsx`** | Sidebar link “Track Email Outreach” → `/outbox`. |
| **`connect-grow-hire/src/components/AppHeader.tsx`** | Header icon can navigate to `/home?tab=outbox`. |
| **`connect-grow-hire/src/components/Dashboard.tsx`** | Fetches outbox threads for dashboard stats (e.g. “emails ready”); no TanStack Query. |
| **`connect-grow-hire/src/components/Outbox.tsx`** | Deprecated static component; not used for real outbox. |

**How threads are displayed:**  
List (not table, not kanban). Left: scrollable list of thread cards (name, title, company, snippet, last activity, status badge, “Draft ready”). Right: selected thread detail + suggested reply and actions (Open Gmail draft, Copy, Regenerate).

**Status categories/tabs/filters:**  
No tabs or filters by status. Single list; status is shown as a badge per thread (`statusLabel` / `statusColor`). Stats at top: “Drafts”, “Sent”, “Credits” (counts only).

**How sync is triggered:**  
- **Not on page load.** List is loaded with `GET /api/outbox/threads` only.  
- **On click:** When user clicks a thread, the frontend calls `syncOutboxThread(t.id)` and then updates local state with the returned `thread`. So sync is per-thread, on selection.

### 2.2 API Integration

**Calls (in `connect-grow-hire/src/services/api.ts`):**

- **`getOutboxThreads()`** - `GET /outbox/threads` (no query params). Returns `Promise<{ threads: OutboxThread[] } | { error: string }>`.
- **`regenerateOutboxReply(threadId)`** - `POST /outbox/threads/${threadId}/regenerate`. Returns `Promise<{ thread: OutboxThread } | { error: string }>` (and may include `credits_used`, `credits_remaining`).
- **`syncOutboxThread(threadId)`** - `POST /outbox/threads/${threadId}/sync`. Returns `Promise<{ thread: OutboxThread } | { error: string }>`.

**TanStack Query:**  
Outbox does **not** use TanStack Query. All three use raw `apiService` calls and local React state (`useState`). No query keys, no stale time, no cache.

**Optimistic updates:**  
None. After regenerate or sync, the UI updates from the API response (setState with returned thread).

### 2.3 UX Issues

- **Loading during sync:** When user clicks a thread, sync runs in the background; there’s no per-row or inline “Syncing…” indicator. If sync is slow, the user may not know.
- **50+ contacts:** List loads all (up to 50 due to missing pagination); one Firestore stream of all contacts then filter in memory. No virtualization; could get heavy with many contacts. Sync is one-at-a-time on click.
- **Empty state:** Shown when `threads.length === 0` (“No drafts yet”, CTA to Find Contacts). Search empty state when no results match.
- **Error state:** Load failure shows toast with retry (with exponential backoff in current Outbox/OutboxEmbedded). Sync failure on click is only `console.warn`; user keeps seeing previous data.
- **Manual status change:** There is no UI or API to manually set a contact’s status (e.g. “Meeting scheduled”). Status is entirely derived from Gmail + Firestore sync.

---

## 3. Data Flow - End to End

Lifecycle of a contact through the Outbox:

```
Contact created → Draft created → Draft sent (in Gmail) → Offerloop detects sent → Reply received → Reply detected → (Meeting / Closed)
```

| Transition | Trigger | Code / flow | Firestore changes | What can go wrong | Timestamp |
|-----------|--------|-------------|-------------------|--------------------|-----------|
| **Contact created** | User saves contact from search, or bulk create (runs, emails, LinkedIn import, etc.) | Various routes create/update `users/{uid}/contacts` | New or updated contact doc (often no draft/thread yet) | Duplicate contacts (same email) if created from different flows | `createdAt` / `updatedAt` |
| **Draft created** | User creates draft from app (e.g. emails route, runs, prompt_search_simple, linkedin_import) | Gmail API `drafts.create`; then contact updated/created with draft info | `gmailDraftId`, `gmailDraftUrl`, often `gmailThreadId` if Gmail returns it, `emailSubject`, `emailBody`, `draftCreatedAt`, `lastActivityAt`, etc. | Draft created but contact not found (e.g. different email) so Outbox doesn’t show it; or threadId not returned yet | `draftCreatedAt`, `lastActivityAt` |
| **Draft sent (in Gmail)** | User sends from Gmail UI | None (Offerloop doesn’t send mail) | None at send time | - | - |
| **Offerloop detects sent** | User opens thread in Outbox → sync | Sync: draft get → 404 → `draftStillExists: False`. If no threadId: search by to+subject → set `gmailThreadId` | `draftStillExists`, `gmailThreadId` (if found), `updatedAt` | Subject/recipient mismatch or search failure → no threadId; rate limit or Gmail error → no update | `updatedAt`; no dedicated `emailSentAt` |
| **Reply received** | Contact replies in Gmail | None (no push) | None until next sync | - | - |
| **Reply detected** | Same sync when user opens thread (or would be on next open) | `sync_thread_message()` → latest message from contact, unread → `new_reply`; read → `waiting_on_you` | `lastMessageSnippet`, `lastActivityAt`, `lastSyncAt`, `hasUnreadReply`, `threadStatus` | Sync skipped (rate limit, 30s throttle, Gmail error) → stale status | `lastActivityAt`, `lastSyncAt` |
| **Meeting scheduled / Closed** | - | No automated transition. No “mark as meeting” or “close” in app | - | No pipeline stage or manual status; “closed” exists in type only | - |

**Summary:**  
- “Sent” is inferred only when we see draft gone + (optionally) threadId.  
- There is **no `emailSentAt`**; sent time is not stored.  
- Reply detection and status updates happen only when sync runs (on thread open).  
- No background/periodic sync; no pipeline stages beyond the four derived statuses.

---

## 4. Missing Pieces

- **`emailSentAt`:** Does not exist. Should be set when we first detect draft deleted (and ideally when we backfill `gmailThreadId`), so the pipeline has a clear “sent” time.
- **Formal `pipelineStage`:** There is no stored pipeline stage. Status is computed in `_build_outbox_thread` from `draftStillExists`, `threadStatus`, `gmailThreadId`, `hasUnreadReply`. A stored stage (e.g. `draft` | `sent` | `replied` | `meeting_scheduled` | `closed`) would allow manual overrides and a stable kanban.
- **Manual move between stages:** Not implemented. Users cannot mark “Meeting scheduled” or “Closed”.
- **Background / periodic sync:** None. Sync only when user opens the Outbox and clicks a thread. List load does not trigger any Gmail calls.
- **Contacts without Gmail drafts:** Contacts that were only saved (e.g. from search) and never had a draft created do **not** appear in the Outbox, by design (list filters on has_draft or has_thread_id).
- **Duplicate detection:** If the same email appears as two different contact docs (e.g. one from runs, one from emails), both can show in the Outbox. No deduplication by email or threadId.

---

## 5. Performance & Scalability

- **Gmail API calls on full Outbox load:** **Zero.** List endpoint only reads Firestore. So “full Outbox load” = one Firestore stream of all contacts + in-memory filter and sort.
- **Gmail calls per user session:** One sync per thread when the user **clicks** that thread (draft get + optional search + optional thread messages get). So with 30 threads, if user opens 10, that’s up to 10 syncs (each sync: 1–3 Gmail calls depending on draft/backfill/message sync). No batching.
- **Batching / parallel:** No batching. Sync is single-thread, one contact per request. Frontend could call sync for multiple threads in parallel, but currently it only syncs the one clicked.
- **Latency:** List: dominated by Firestore stream (all contacts). Sync: one round-trip to backend + Gmail draft get (+ optional search + thread get). Typical 1–3 s for one sync.
- **N+1:** List does one Firestore stream (no N+1). Sync is one doc read + one doc write per request. No N+1 in outbox routes.

---

## 6. Output Format Deliverables

### 6.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│  Outbox.tsx / OutboxEmbedded.tsx                                              │
│  - loadThreads() → getOutboxThreads()     (on mount / refresh)                │
│  - on thread click → syncOutboxThread(id) then setState(thread)               │
│  - regenerateOutboxReply(id)             (regenerate button)                  │
└────────────────────────────┬────────────────────────────────────────────────┘
                              │
                              │ GET  /api/outbox/threads
                              │ POST /api/outbox/threads/:id/sync
                              │ POST /api/outbox/threads/:id/regenerate
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Flask)                                 │
│  backend/app/routes/outbox.py                                                 │
│  - list_threads: stream contacts → filter (has_draft | has_thread_id)         │
│    → _build_outbox_thread(doc) → sort, paginate → JSON                        │
│  - sync_thread: load contact → draft exists? (cached) → backfill threadId?    │
│    → sync_thread_message() → update contact → _build_outbox_thread → JSON     │
│  - regenerate: load contact + user → get_latest_message → generate_reply      │
│    → create Gmail draft → update contact → _build_outbox_thread → JSON       │
└────────────┬─────────────────────────────────────┬──────────────────────────┘
             │                                      │
             │ read/write                            │ drafts.get, messages.list,
             │                                      │ threads.get (sync_thread_message)
             ▼                                      ▼
┌─────────────────────────────┐    ┌─────────────────────────────────────────┐
│       FIRESTORE              │    │            GMAIL API                      │
│  users/{uid}/contacts/{id}   │    │  - drafts.get (draft existence, 5m cache)│
│  - gmailDraftId, gmailThreadId│   │  - messages.list (to+subject backfill)   │
│  - draftStillExists,         │    │  - threads.get (full thread for sync)     │
│    threadStatus,             │    │  Rate limit: 30 calls/min per user         │
│    lastMessageSnippet,       │    └─────────────────────────────────────────┘
│    lastSyncAt, ...           │
└─────────────────────────────┘
```

### 6.2 Bug List (by severity)

| Severity | Issue | Location / note |
|----------|--------|------------------|
| **High** | Sync can fail silently (no Gmail, rate limit) but still return 200 with stale data | outbox sync; client can’t tell sync didn’t run |
| **High** | Pagination not used: frontend never sends page/per_page and ignores pagination; users with &gt;50 threads only see first 50 | api.ts getOutboxThreads; Outbox.tsx, OutboxEmbedded, Dashboard |
| **High** | No `emailSentAt`; “sent” is inferred, not stored; no reliable “sent at” for pipeline/analytics | Contact model; sync when draft first seen gone |
| **Medium** | No background/periodic sync; status updates only when user opens thread | Backend + product; could add cron or background job |
| **Medium** | Stuck status when threadId backfill fails (subject/recipient mismatch or search error) | outbox sync backfill step |
| **Medium** | Duplicate contacts (same email, multiple docs) both show in Outbox | List logic; no dedupe by email/threadId |
| **Medium** | No loading indicator when syncing on thread click | Outbox.tsx, OutboxEmbedded.tsx |
| **Low** | Race: two syncs for same thread can run concurrently | outbox sync; add per-contact lock or idempotency |
| **Low** | `closed` status in frontend type never set by backend | Backend never sets threadStatus to "closed" |
| **Low** | Draft existence cache is process-local; not shared across workers | _check_draft_exists_cached |

### 6.3 Status Mapping Table

| status / threadStatus | Stored or computed? | Trigger / source |
|----------------------|---------------------|-------------------|
| `no_reply_yet` | Computed (and can be stored by sync) | Has draft and draft still exists (or not verified gone); or no thread and no synced status. Also from sync when no reply from recipient yet. |
| `new_reply` | Can be stored by sync (`threadStatus`) | Latest message from contact and unread. |
| `waiting_on_them` | Can be stored by sync | Draft gone / thread exists; latest from user; or default when draft gone but no threadId. |
| `waiting_on_you` | Can be stored by sync | Latest message from contact, read; or any reply from contact in thread but latest from user. |
| `closed` | Not stored; not set by backend | In frontend type only; no backend path to set it. |

Stored fields that affect status: `draftStillExists`, `threadStatus`, `gmailThreadId`, `hasUnreadReply`, and presence of draft ID/URL.

### 6.4 File Inventory

| File | One-line description |
|------|----------------------|
| `backend/app/routes/outbox.py` | Outbox API: list threads, sync thread, regenerate reply; _build_outbox_thread, draft cache, rate limit. |
| `backend/app/services/gmail_client.py` | Gmail OAuth, drafts/threads/messages API; sync_thread_message, get_latest_message_from_thread, extract_message_body. |
| `backend/app/services/reply_generation.py` | generate_reply_to_message (AI reply). |
| `backend/app/services/auth.py` | deduct_credits_atomic, check_and_reset_credits, refund_credits_atomic. |
| `backend/wsgi.py` | Registers outbox_bp. |
| `backend/app/__init__.py` | Also registers outbox_bp (SPA app). |
| `connect-grow-hire/src/pages/Outbox.tsx` | Full-page Outbox: thread list, detail, sync on click, regenerate, open draft. |
| `connect-grow-hire/src/components/OutboxEmbedded.tsx` | Same as Outbox.tsx but embedded in home tab. |
| `connect-grow-hire/src/services/api.ts` | getOutboxThreads, syncOutboxThread, regenerateOutboxReply; OutboxThread / OutboxStatus types. |
| `connect-grow-hire/src/components/AppSidebar.tsx` | Nav link to /outbox. |
| `connect-grow-hire/src/components/AppHeader.tsx` | Header icon → /home?tab=outbox. |
| `connect-grow-hire/src/components/Dashboard.tsx` | Fetches outbox threads for “emails ready” and follow-up list. |
| `connect-grow-hire/src/components/Outbox.tsx` | Deprecated static Outbox; not used. |
| `backend/app/routes/emails.py` | Creates Gmail drafts and writes gmailDraftId, gmailThreadId, etc., to contacts. |
| `backend/app/routes/contacts.py` | Reads gmailThreadId; CSV import can set gmailDraftId/gmailDraftUrl. |
| `backend/app/routes/dashboard.py` | Uses threadStatus for “new reply” / follow-ups. |
| `backend/app/routes/runs.py` | Writes gmailDraftId (and related) when creating drafts. |
| `backend/app/routes/linkedin_import.py` | Writes gmailDraftId, gmailDraftUrl, gmailThreadId. |
| `backend/app/routes/runs_hunter.py` | Writes gmailDraftId, gmailDraftUrl. |
| `backend/app/routes/prompt_search_simple.py` | Writes gmailDraftId, gmailDraftUrl. |

### 6.5 Recommended Fixes (Prioritized)

1. **Add `emailSentAt`**  
   When sync first sets `draftStillExists: False` (and optionally when we backfill `gmailThreadId`), set `emailSentAt` to current time (or message date from Gmail if available). Enables “sent” column and reliable pipeline ordering.

2. **Use pagination on the frontend**  
   Pass `page` and `per_page` to `getOutboxThreads` (e.g. page size 50) and use response `pagination` (has_next, total) to show “Load more” or paginated list so users with many threads see all of them.

3. **Surface sync failures**  
   Return a flag or structure from sync endpoint when Gmail wasn’t used (e.g. `synced: false`, `reason: 'gmail_unavailable' | 'rate_limited'`) so the client can show “Couldn’t refresh from Gmail” and optionally retry.

4. **Introduce stored `pipelineStage` (optional manual override)**  
   Add a field like `pipelineStage`: `draft` | `sent` | `replied` | `meeting_scheduled` | `closed`. Compute default from current logic; allow UI (and optionally API) to set/override so users can mark “Meeting scheduled” or “Closed” and get a stable kanban.

5. **Background or periodic sync**  
   Add a lightweight job (cron or queue) that periodically syncs recent/active threads so status updates don’t depend only on opening the Outbox and clicking each thread.

6. **Per-thread sync loading state**  
   When user clicks a thread, show a small “Syncing…” on that row or in the detail panel until `syncOutboxThread` resolves, then update.

7. **Deduplicate by email or threadId in list**  
   When building the list, prefer one contact per email (or per gmailThreadId) so the same conversation doesn’t appear twice.

8. **Optional: per-contact sync lock**  
   Use a short-lived lock (e.g. in Firestore or Redis) per contact id so two simultaneous syncs for the same thread don’t run in parallel.

9. **Remove or implement `closed`**  
   Either remove `closed` from the frontend type or add a path to set it (e.g. manual “Mark as closed” that sets `threadStatus` or `pipelineStage` to closed).

10. **Draft cache across workers**  
    If you run multiple app workers, move draft-existence cache to Redis (or similar) with same TTL so draft checks are consistent across processes.

Implementing 1–4 will make the Outbox a much more reliable and usable pipeline view; 5–10 improve robustness and UX further.
