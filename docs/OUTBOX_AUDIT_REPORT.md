# Outbox / Email Outreach - Full Technical & Product Audit

**Date:** 2026-03-04
**Scope:** All code related to the Outbox (a.k.a. "Track Email Outreach") feature

---

## Files Inventoried

| File | Role |
|------|------|
| `backend/app/routes/outbox.py` (1098 lines) | Flask blueprint - list threads, sync, regenerate reply, update stage, batch sync, stats |
| `backend/app/services/background_sync.py` (91 lines) | Find stale threads, trigger sync for each |
| `backend/app/services/gmail_client.py` | Gmail API helpers: `sync_thread_message`, `get_latest_message_from_thread`, `extract_message_body` |
| `backend/app/services/reply_generation.py` | `generate_reply_to_message` - AI reply generation via OpenAI |
| `backend/app/routes/gmail_webhook.py` | Gmail push notification handler - detects sent emails and incoming replies |
| `backend/app/routes/emails.py` | `generate-and-draft` - creates Gmail drafts and saves contact docs (entry point into outbox) |
| `connect-grow-hire/src/pages/Outbox.tsx` (1422 lines) | Single-file page component - tabs, thread list, detail panel, batch draft, template picker |
| `connect-grow-hire/src/services/api.ts` | `OutboxThread` type, `OutboxStats` type, 7 API methods |
| `connect-grow-hire/src/hooks/useNotifications.ts` (67 lines) | Real-time Firestore listener for reply notifications |
| `connect-grow-hire/src/components/Dashboard.tsx` | References outbox threads for "emails ready" quick win count |
| `connect-grow-hire/src/components/AppSidebar.tsx` | Sidebar nav link to `/outbox` |
| `connect-grow-hire/src/App.tsx` | Route: `/outbox` -> `<Outbox />` |
| `outbox-rework-prompt.md` (669 lines) | Unrealized redesign spec - conversation tracking, follow-ups, resolution detection |

---

## 1. Current State Summary

The Outbox is a **draft-and-track pipeline** for cold outreach emails. Here's what it does today, in plain english:

1. **Entry:** User finds contacts via search, generates personalized emails, and creates Gmail drafts (via `generate-and-draft`). Each contact is saved as a Firestore document under `users/{uid}/contacts/{contactId}` with `gmailDraftId`, `gmailDraftUrl`, and `pipelineStage: "draft_created"`.

2. **Tracking:** The Outbox page shows all contacts that have a `gmailThreadId`, `gmailDraftId`, `gmailDraftUrl`, or `pipelineStage == "new"`. These are displayed in a two-panel layout: thread list on the left, detail on the right.

3. **Pipeline stages:** Contacts move through: `new` → `draft_created` → `email_sent` → `waiting_on_reply` → `replied` → `meeting_scheduled` → `connected`. Also: `no_response`, `bounced`, `closed`. Users can manually change stages via a dropdown.

4. **Gmail sync:** When a user opens the Outbox or clicks a thread, the backend checks Gmail to detect:
   - Whether a draft still exists (if not, assumes it was sent)
   - Whether a reply has been received
   - The latest message snippet

5. **Reply detection (push):** A Gmail webhook (`gmail_webhook.py`) receives push notifications when new emails arrive. It matches incoming messages to contacts by threadId or email, and sets `pipelineStage: "replied"` and `hasUnreadReply: true`.

6. **Reply generation:** When a contact replies, the user can click "Regenerate" to generate an AI reply (costs 10 credits), which is saved as a new Gmail draft.

7. **Batch drafting:** Users can multi-select contacts (up to 15) and generate drafts in bulk via the `generate-and-draft` endpoint.

8. **Stats:** A separate endpoint computes pipeline counts, reply rate, avg response time, meeting rate, and weekly activity.

---

## 2. Data Model

### Firestore Collection: `users/{uid}/contacts/{contactId}`

Each contact document serves double duty - it's both a **contact record** and an **outbox thread state machine**. The outbox-relevant fields are:

| Field | Type | Set By | Purpose |
|-------|------|--------|---------|
| `gmailDraftId` | string | emails.py, outbox.py | Current draft ID in Gmail |
| `gmailDraftUrl` | string | emails.py, outbox.py | URL to open draft in Gmail |
| `gmailMessageId` | string | emails.py, outbox.py | Gmail message ID (for compose URLs) |
| `gmailThreadId` | string | emails.py, webhook | Gmail thread ID |
| `pipelineStage` | string | emails.py, outbox.py, webhook | Current stage in the pipeline |
| `draftStillExists` | boolean | outbox.py sync | Whether draft was verified to still exist |
| `emailSentAt` | string (ISO) | outbox.py, webhook | When email was sent |
| `emailSubject` | string | emails.py | Original email subject |
| `emailBody` | string | emails.py | Original email body |
| `hasUnreadReply` | boolean | webhook, outbox.py | Whether contact has an unread reply |
| `threadStatus` | string | outbox.py sync | Synced status from Gmail (`new_reply`, `waiting_on_them`, etc.) |
| `lastMessageSnippet` | string | outbox.py, webhook | Preview of latest message |
| `lastActivityAt` | string (ISO) | outbox.py, webhook | Last activity timestamp |
| `lastSyncAt` | string (ISO) | outbox.py | Last Gmail sync timestamp |
| `lastSyncError` | object | outbox.py | `{code, message, at}` - last sync error |
| `suggestedReply` | string | outbox.py regenerate | AI-generated reply text |
| `replyType` | string | outbox.py regenerate | Type of reply (positive, decline, etc.) |
| `draftCreatedAt` | string (ISO) | outbox.py, emails.py | When draft was created |
| `replyReceivedAt` | string (ISO) | webhook | When first reply was received |
| `meetingScheduledAt` | string (ISO) | outbox.py | When meeting stage was set |
| `connectedAt` | string (ISO) | outbox.py | When connected stage was set |
| `updatedAt` | string (ISO) | everywhere | Last update timestamp |

### Firestore Collection: `users/{uid}/notifications/outbox`

| Field | Type | Purpose |
|-------|------|---------|
| `unreadReplyCount` | number | Badge count for notifications |
| `items` | array of objects | Up to 20 notification items: `{contactId, contactName, company, snippet, timestamp, read}` |

### Legacy Field Duplication

The codebase has a **persistent camelCase/snake_case duplication problem**. Nearly every field is read with fallback:
```python
data.get("gmailThreadId") or data.get("gmail_thread_id")
data.get("lastActivityAt") or data.get("last_activity_at")
```

The webhook even **writes both**:
```python
update_fields["emailSentAt"] = now_iso
update_fields["email_sent_at"] = now_iso  # redundant
```

This means every contact document potentially has 2x the fields it needs.

### What's Missing

| Gap | Impact |
|-----|--------|
| No `followUpCount` or `nextFollowUpAt` | No follow-up tracking whatsoever |
| No `lastMessageFrom` ("user" vs "contact") | Can't distinguish who spoke last without hitting Gmail |
| No `messageCount` | No visibility into conversation depth |
| No `conversationSummary` | No AI context about the thread |
| No `resolution` / `resolutionDetails` | No way to record outcomes (meeting booked, declined, ghosted) |
| No `archivedAt` | No archive/restore mechanism |
| No `snoozedUntil` | No snooze functionality |
| Contact doc = thread state | Mixes identity (name, email, title) with transient state (sync errors, draft IDs) |

---

## 3. Critical Issues

### 3.1 Full Collection Scan on Every Request

**File:** `outbox.py:336-337`
```python
docs = list(contacts_ref.stream())
contacts = [doc for doc in docs if _contact_belongs_in_outbox(doc.to_dict() or {})]
```

Both `list_threads()` and `outbox_stats()` stream **every contact document** for the user, then filter in Python. For a user with 500+ saved contacts and only 20 in the outbox, this reads 500 documents per request. Firestore charges per document read. This is also done on page load AND again for stats = 1000+ reads per page view.

**Fix:** Add a Firestore index query. E.g., query where `pipelineStage != null` or add an `inOutbox: true` flag.

### 3.2 Sync-on-Read Anti-Pattern

**File:** `outbox.py:553-573` (frontend triggers sync on thread click)

When a user clicks a thread, the frontend fires `POST /api/outbox/threads/{id}/sync` which makes multiple Gmail API calls (check draft existence, sync thread messages). This means:
- Opening the Outbox page triggers batch sync for 10 threads
- Clicking any thread triggers another sync
- Combined with the full collection scan, a single page view can make 10+ Gmail API calls and 500+ Firestore reads

This is expensive and slow. Gmail sync should be event-driven (webhook) or background-scheduled, not triggered on every UI interaction.

### 3.3 In-Memory Rate Limiting and Caching Won't Work in Production

**File:** `outbox.py:67, 122-152`
```python
gmail_api_call_tracker = {}  # {uid: [timestamps]}
```
```python
cache = getattr(_check_draft_exists_cached, '_cache', {})
```

Both the Gmail rate limiter and draft existence cache use in-memory dicts. With `gunicorn --workers 4`, each worker has its own copy. Rate limits are per-worker (4x the actual limit) and cache is per-worker (redundant API calls).

### 3.4 `_perform_sync` Does Too Many Things and Has Race Conditions

**File:** `outbox.py:733-927` (195 lines, one function)

`_perform_sync` does 6 different things in sequence:
1. Check sync lock
2. Get Gmail service
3. Check if draft still exists
4. If draft gone without threadId, search Gmail for the sent message
5. Sync thread messages
6. Clear sync errors

Each step writes to Firestore independently. If two requests hit sync simultaneously (e.g., batch sync + thread click), they can produce conflicting updates. The `SYNC_LOCK_SECONDS = 10` check uses `lastSyncAt` from the document, but there's a TOCTOU race between reading the timestamp and writing the update.

### 3.5 Duplicate Pipeline Stage Derivation Logic (3 Places)

The pipeline stage is derived/defaulted in three separate places with subtly different logic:

1. `_build_outbox_thread()` at line 267-275 - derives from `hasUnreadReply`, `hasDraft`, `draftStillExists`
2. `outbox_stats()` at line 1023-1037 - same logic but slightly different conditions
3. `Outbox.tsx:getDisplayStage()` at line 63-71 - derives from legacy `status` field

These can disagree, causing the stats badges to show different counts than the actual filtered list.

### 3.6 Legacy Status vs Pipeline Stage Confusion

The backend returns both `status` (legacy: `no_reply_yet`, `waiting_on_them`, `new_reply`, `closed`) and `pipelineStage` (new: `draft_created`, `waiting_on_reply`, `replied`, etc.). The frontend has fallback logic to convert between them (`getDisplayStage`), but this creates a confusing state where the same thread might have `status: "no_reply_yet"` AND `pipelineStage: "draft_created"`.

### 3.7 Suggested Reply is Stored on the Contact Document

**File:** `outbox.py:699`
```python
"suggestedReply": suggested_reply,
```

The full AI-generated reply text is stored as a field on the contact document. This is:
- Denormalized (the reply is also in a Gmail draft)
- Stale the moment the user edits the draft in Gmail
- Cluttering the contact document with transient data

### 3.8 Stats Endpoint Logs Every Contact (Debug Logging in Production)

**File:** `outbox.py:1039`
```python
print(f"[outbox/stats] contact {doc.id} pipelineStage={data.get('pipelineStage')} derived={stage}")
```

This prints a line for every contact in the user's collection on every stats request. For a user with 500 contacts, that's 500 log lines per stats call.

---

## 4. UX Breakdown

### 4.1 The Mental Model is Wrong: It's an Email Pipeline, Not a People Tracker

The feature is framed as "Email Outreach" with tabs like "Drafts", "Sent", "Replied". This forces users to think about **email states** rather than **relationships**. The user's actual question is "Who do I need to follow up with?" not "Show me all emails in 'waiting on reply' state."

### 4.2 No Follow-Up System

There is **zero follow-up functionality**. Once an email is sent and the contact doesn't reply:
- There's no reminder
- There's no follow-up draft generation
- The contact sits in "Awaiting Reply" forever
- The user must manually remember to follow up

The `outbox-rework-prompt.md` file describes an elaborate follow-up system (Day 4, 8, 14 auto-drafts) but **none of it is implemented**.

### 4.3 8 Tabs is Too Many

```typescript
const tabs = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "drafts", label: "Drafts" },
  { id: "sent", label: "Sent" },
  { id: "replied", label: "Replied" },
  { id: "meeting", label: "Meeting" },
  { id: "connected", label: "Connected" },
  { id: "no_response", label: "No Reply" },
];
```

Eight tabs for what is typically 5-30 threads creates cognitive overload. Most tabs will have 0-2 items. The user has to click through tabs to find things instead of seeing everything at a glance.

### 4.4 Detail Panel is Underwhelming

The right panel shows:
1. Contact name, title, company, email
2. Pipeline stage dropdown
3. "Latest Message" - a single snippet
4. "Suggested Reply" - a read-only textarea (only populated after "Regenerate")
5. Three buttons: Open Gmail Draft, Copy Reply, Regenerate

There's no conversation timeline, no message history, no context about the relationship. The user sees one snippet and has to go to Gmail to understand what happened.

### 4.5 "Regenerate" is Confusing

The "Regenerate" button only works when the contact has replied, but it's always visible (just disabled). Users don't understand:
- What it regenerates
- When they can use it
- That it costs 10 credits
- That it creates a new Gmail draft (potentially duplicating an existing one)

### 4.6 No Archive or Close Mechanism

There's no way to remove a thread from the active list. Once a contact is in the outbox, they stay forever. The only way to "close" is to manually change the pipeline stage to "Closed" or "No Response" - but those still show up in tabs.

### 4.7 Batch Draft UX is Disconnected

The batch draft flow (select contacts → Quick Draft / Draft with Template) goes through the `generate-and-draft` email endpoint, which is the same endpoint used from the contact search page. This works, but:
- It's confusing to draft emails for contacts already in the outbox (they already have drafts)
- The progress indicator (`Drafting 3/5...`) is inaccurate because the backend processes all contacts in one request
- Template picker only shows the default template

### 4.8 Journey Visualization is Defined But Barely Used

```typescript
const JOURNEY_STAGES = ["new", "draft_created", "email_sent", "waiting_on_reply", "replied", "meeting_scheduled", "connected"];
```

These journey stages are defined as constants but there is no visual journey/stepper component in the detail panel. The only visualization is the pipeline badge.

---

## 5. Redesign Recommendations

### 5.1 Reframe Around PEOPLE, Not Emails

**Current:** "Email Outreach - Track your pipeline from draft to connection"
**Proposed:** "Network Tracker - Stay on top of every conversation"

The fundamental unit should be a **person**, not an email thread. Each card should answer: "What's happening with this person and what should I do next?"

### 5.2 Three Buckets Instead of Eight Tabs

Replace 8 tabs with 3 smart buckets:

| Bucket | Contains | Sort |
|--------|----------|------|
| **Needs Attention** | Reply received (draft ready), Follow-up due, Draft unsent for 3+ days | Most urgent first |
| **Waiting** | Email sent, waiting for reply, follow-up not yet due | Oldest wait first |
| **Done** | Connected, meeting scheduled, declined, ghosted, archived | Most recent first |

Each bucket shows a count badge. "Needs Attention" gets a red indicator when non-zero.

### 5.3 Contact Cards Show Only the Next Action

Each card in the list should show:
- Name, title, company
- **One-line status:** "Replied 2h ago - draft ready" or "Sent 5 days ago - follow-up in 2 days"
- **Primary action button:** "Review Draft" or "Send Follow-up" or "View in Gmail"

No pipeline stage dropdown in the list. No multi-select. Keep it scannable.

### 5.4 Conversation Timeline in Detail Panel

Replace the current detail panel (snippet + textarea) with:
- **Contact header** (name, title, company, email, LinkedIn)
- **AI Summary** - 1-2 sentence summary of the relationship ("You reached out about PM roles. They asked about your background.")
- **Message timeline** - chronological list of messages with sender, date, and snippet
- **Action bar** - context-aware: "Review Draft in Gmail", "Mark as Won", "Archive", "Snooze"

### 5.5 Built-in Follow-Up System

Implement the follow-up system described in `outbox-rework-prompt.md`:
- Auto-generate follow-up drafts at Day 4, 8, 14
- Show follow-up countdown in the contact card ("Follow-up in 2 days")
- After 3 unanswered follow-ups, auto-mark as "ghosted" and move to Done
- Allow snoozing follow-ups

### 5.6 Resolution Tracking

Add explicit outcomes:
- **Meeting Booked** - celebration state, shows in "Wins" section
- **Soft No** - "not right now", auto-archive with snooze
- **Hard No** - "not interested", archive permanently
- **Ghosted** - no response after 3 follow-ups
- **Completed** - conversation reached natural end

### 5.7 Separate Thread State from Contact Identity

Create a dedicated subcollection or separate fields namespace for outbox state. The contact document shouldn't be polluted with `draftStillExists`, `lastSyncError`, `suggestedReply`, etc.

**Proposed structure:**
```
users/{uid}/contacts/{contactId}
  → identity fields (name, email, company, title, linkedin)
  → outbox state fields (grouped, prefixed, or in subcollection)
    → threadId, draftId, pipelineStage, followUpCount, resolution, etc.
```

### 5.8 Fix the Sync Architecture

1. **Primary:** Gmail webhook handles send detection and reply detection (already works)
2. **Secondary:** Background sync for stale threads (already exists, needs scheduling)
3. **Remove:** Sync-on-click and sync-on-page-load. These are expensive and unnecessary with webhooks working.

Keep a manual "Refresh" button for edge cases, but don't auto-sync on every interaction.

---

## 6. File-by-File Refactor Plan

### `backend/app/routes/outbox.py` - REWRITE

**Current:** 1098 lines, handles everything (list, sync, regenerate, stage update, batch sync, stats)
**Problems:** Full collection scan, sync-on-read, in-memory caching, duplicate logic, 195-line sync function

**New version should:**
- Split into route file (thin) + service file (`outbox_service.py`)
- Use Firestore queries with indexes instead of full scans
- Remove `_perform_sync` from the list endpoint - let webhooks + background sync handle it
- Remove `_build_outbox_thread` duplication (consolidate field normalization)
- Remove legacy snake_case field fallbacks (do a one-time migration instead)
- Keep: `list_threads`, `update_stage`, `stats` endpoints
- Add: `archive`, `unarchive`, `mark_won`, `snooze` endpoints
- Move: `regenerate` to reply_generation service
- Move: `_perform_sync` to `gmail_sync_service.py`

### `backend/app/services/background_sync.py` - MODIFY

**Current:** Works fine but only triggered by frontend batch-sync call
**Change:** Add a scheduled trigger (Cloud Function or cron). Remove the `time.sleep(1)` between syncs (use async or batch). Add a `sync_one_thread` method that the webhook can also call.

### `backend/app/routes/gmail_webhook.py` - KEEP AS-IS (minor fixes)

**Current:** Correctly detects sent emails and incoming replies
**Fixes needed:**
- Remove dual snake_case/camelCase field writes
- Add follow-up count tracking on reply detection
- Add resolution detection on reply (call AI to detect "let's schedule" / "not interested")

### `backend/app/routes/emails.py` - KEEP AS-IS

**Current:** `generate-and-draft` works correctly as the entry point into the outbox
**No changes needed** for the outbox redesign. This is the drafting flow, not the tracking flow.

### `connect-grow-hire/src/pages/Outbox.tsx` - REWRITE

**Current:** 1422 lines, single monolithic component with inline styles
**Problems:** 8 tabs, no follow-up UI, underwhelming detail panel, batch draft complexity, 500+ lines of inline CSS

**New version should be split into:**
- `pages/NetworkTracker.tsx` - page shell, data fetching, routing
- `components/tracker/TrackerBuckets.tsx` - three-bucket layout (Needs Attention / Waiting / Done)
- `components/tracker/ContactCard.tsx` - single contact card with status + next action
- `components/tracker/ConversationPanel.tsx` - detail panel with timeline, summary, actions
- `components/tracker/ActionBar.tsx` - context-aware action buttons

**Remove from current:**
- `handleCopy` and copy button
- `handleRegenerate` and regenerate button (replace with smarter "Generate Follow-up" action)
- `suggestedReply` textarea
- 8-tab system
- Multi-select batch draft UI (move to contact search page where it belongs)
- All inline `style={{}}` objects (use Tailwind classes)
- `JOURNEY_STAGES` / `JOURNEY_LABELS` (unused)
- `getDisplayStage` legacy fallback
- `PIPELINE_BADGE_STYLES` (replace with simpler status-based styles)

**Keep from current:**
- Search functionality
- Refresh button
- `formatLastActivity` helper
- Toast notifications
- Loading/error states
- TanStack Query patterns

### `connect-grow-hire/src/services/api.ts` - MODIFY

**Changes:**
- Update `OutboxThread` interface to match new data model (add `followUpCount`, `resolution`, `lastMessageFrom`, `conversationSummary`)
- Remove `suggestedReply`, `replyType` from interface
- Add API methods: `archiveThread`, `unarchiveThread`, `markThreadWon`, `snoozeThread`
- Remove: `regenerateOutboxReply` (replaced by follow-up draft generation)
- Rename type from `OutboxThread` to `TrackerContact` or similar

### `connect-grow-hire/src/hooks/useNotifications.ts` - KEEP AS-IS

**Current:** Clean, simple, works well. Real-time Firestore listener for reply notifications.
**No changes needed.**

### `connect-grow-hire/src/components/Dashboard.tsx` - MODIFY (minor)

**Changes:** Update outbox thread references to use new tracker data model. Update the "emails ready" quick win to use the new "Needs Attention" bucket count instead.

### `outbox-rework-prompt.md` - DELETE after implementation

**Current:** 669-line redesign spec that describes the intended end state
**Status:** Good spec, but none of it is implemented. It should be used as the design doc for the rewrite, then deleted once the work is done.

---

## 7. Migration Plan

### Phase 1: Data Cleanup (non-breaking)
1. Write a one-time Firestore migration script to:
   - Normalize all snake_case fields to camelCase
   - Remove duplicate fields (`email_sent_at` → keep only `emailSentAt`)
   - Set `pipelineStage` on all contacts that have it derived but not stored
   - Add `inOutbox: true` flag to all contacts currently in the outbox
2. Add Firestore composite index on `inOutbox` + `pipelineStage`

### Phase 2: Backend Refactor (non-breaking)
1. Create `outbox_service.py` with clean query-based data access
2. Add `archive`, `unarchive`, `mark_won`, `snooze` endpoints
3. Update `list_threads` to use indexed queries instead of full scan
4. Remove sync-on-read from `list_threads`
5. Add follow-up tracking fields to webhook handler

### Phase 3: Frontend Rewrite
1. Build new `NetworkTracker` page with three-bucket layout
2. Build `ContactCard` and `ConversationPanel` components
3. Wire up new API methods
4. Replace `/outbox` route with `/tracker` (keep redirect)

### Phase 4: Follow-Up System
1. Implement auto-follow-up draft generation (backend scheduled task)
2. Add follow-up countdown display to contact cards
3. Add resolution detection AI
4. Add conversation summary generation

---

## Summary

The Outbox feature is functional but architecturally strained. It suffers from:

- **Performance:** Full collection scans + sync-on-every-interaction = expensive and slow
- **Data model:** Contact documents are overloaded with transient outbox state; legacy field duplication doubles storage
- **UX:** Email-centric pipeline model (8 tabs) instead of people-centric tracker; no follow-ups; underwhelming detail panel
- **Code quality:** 1098-line backend route + 1422-line frontend component; duplicate derivation logic in 3 places; in-memory caching that breaks with multiple workers
- **Unrealized potential:** A detailed redesign spec (`outbox-rework-prompt.md`) exists with conversation tracking, auto follow-ups, and resolution detection - but none of it is built

The core recommendation is to reframe the feature around **people and next actions** rather than email states, implement the follow-up system, and fix the sync architecture to be event-driven rather than poll-on-every-click.
