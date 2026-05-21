# Report: Auto-Update Draft Button Using Gmail

**Date:** 2026-02-20  
**Scope:** Can the Outbox “Draft” (pipeline stage) button be automatically updated when the user sends the email in Gmail, using existing Gmail scopes and infrastructure?

---

## 1. Executive summary

**Yes.** The pipeline stage (the “• Draft” button and the rest of the funnel) can be updated automatically when the user sends a draft in Gmail, **without adding new OAuth scopes**. The app already has Gmail push (Watch) and uses it only for **incoming replies**. Extending the same webhook to handle **user-sent messages** (draft sent) will update the contact’s stage to “Sent” / “Waiting” as soon as Gmail notifies us, so the Draft button reflects reality without the user opening the thread or waiting for batch sync.

---

## 2. How the draft button gets its value

- **Source of truth:** The button shows `pipelineStage` from the Outbox API (`/api/outbox/threads` and thread detail). Values include `draft_created`, `email_sent`, `waiting_on_reply`, `replied`, `meeting_scheduled`, `connected`, etc.
- **Backend:** `pipelineStage` is stored on the contact in Firestore and returned by `_build_outbox_thread()` in `backend/app/routes/outbox.py`. It can be:
  - Set manually via `PATCH /api/outbox/stage` (dropdown on the right).
  - Set or derived during **sync** (see below).

---

## 3. How the stage is updated today (without auto-update from send)

| Trigger | What happens |
|--------|----------------|
| **User opens a thread** | `POST /api/outbox/threads/<id>/sync` runs `_perform_sync()`. We call Gmail `drafts().get(draft_id)`; if the draft no longer exists and we have a thread ID, we set `pipelineStage = "waiting_on_reply"`, `emailSentAt`, and `draftStillExists = false`. |
| **Batch sync on load** | Frontend calls `batchSyncOutbox({ mode: "stale", max: 10 })`. Backend syncs up to 10 “stale” threads (e.g. in `email_sent` / `waiting_on_reply` / `replied`). Same logic as above for draft existence. |
| **Manual** | User changes stage via the dropdown → `PATCH /api/outbox/stage`. |

So the stage **can** already be updated from Gmail (draft existence + thread), but only when a sync runs. There is no push-driven update when the user sends the draft in Gmail.

---

## 4. Gmail integration in place

### 4.1 OAuth scopes (no change needed)

Current scopes in `backend/app/config.py`:

- `https://www.googleapis.com/auth/gmail.compose` - create/send drafts
- `https://www.googleapis.com/auth/gmail.readonly` - read mail and **history**
- `https://www.googleapis.com/auth/gmail.send` - send mail
- OpenID / userinfo for email

History (used by Watch) is covered by `gmail.readonly`. **No new scopes are required** to detect that a draft was sent.

### 4.2 Gmail Watch (push)

- **Where:** `backend/app/services/gmail_client.py` - `start_gmail_watch(uid)` is called after OAuth (e.g. in `gmail_oauth.py`).
- **What:** Gmail sends a Pub/Sub notification to our webhook when the user’s mailbox changes. We receive `emailAddress` and `historyId`.
- **Webhook:** `backend/app/routes/gmail_webhook.py` - `POST /api/gmail/webhook` decodes the push, then in a background thread calls `_process_gmail_notification(email_address, history_id)`.

### 4.3 What the webhook does today

- Calls Gmail `users().history().list(userId='me', startHistoryId=..., historyTypes=['messageAdded'])` to get new messages.
- For each new message, fetches `messages().get(..., format='metadata', metadataHeaders=['From','To','Subject'])`.
- **If the message is from the contact (reply):** finds contact by `gmailThreadId`, sets `pipelineStage = "replied"`, `hasUnreadReply = true`, updates snippet and notifications.
- **If the message is from the user:** we **skip** it (see around lines 148–150: `if from_email == user_email_lower: continue`). So when the user **sends** a draft, we get the push but do nothing.

---

## 5. Gap: draft-sent is not reflected automatically

- **Current:** After the user sends the draft in Gmail, our stage stays “Draft” until:
  - the user opens that thread in Offerloop (sync runs), or
  - the thread is chosen in the next batch sync.
- **Desired:** As soon as Gmail reports the new (sent) message, we update the corresponding contact to “Sent” / “Waiting” so the Draft button and funnel update without any user action in Offerloop.

---

## 6. Recommended approach: extend the Gmail webhook

Use the **same** Gmail Watch and webhook; when a new message is **from the user** (sent message), treat it as “draft was sent” and update the contact.

### 6.1 Logic (high level)

1. In `_process_gmail_notification`, keep existing handling for **replies** (from ≠ user).
2. For each new message where **from == user**:
   - Get `threadId` and `To` from the message (we already have threadId from history; To from metadata).
   - Find the contact:
     - Prefer: contact with `gmailThreadId == threadId` (thread already linked).
     - Else: contact whose `email` matches `To` and who is in draft state (e.g. has `gmailDraftId` or `pipelineStage == "draft_created"`). If we have no threadId stored yet, this is the first send; we can set `gmailThreadId` from the message’s threadId now.
   - Update that contact:
     - `draftStillExists = false`
     - `pipelineStage = "waiting_on_reply"` (or `"email_sent"` if you prefer)
     - `emailSentAt = now` (if not already set)
     - `gmailThreadId = threadId` (if not already set)
     - `lastActivityAt`, `updatedAt`, optionally refresh snippet from the sent message.

### 6.2 Edge cases

- **Multiple contacts with same email:** Unlikely; if needed, prefer the one with `gmailDraftId` or most recent `lastActivityAt`.
- **Rate limits:** One history fetch and one message get per new message; same as today. No new Gmail scope, so no new quota concern beyond slightly more work per push.
- **Watch expiration:** Already handled (watch is renewed); no change.

### 6.3 What stays the same

- **Scopes:** No change.
- **Sync on open / batch sync:** Still useful for refreshing snippet and reply state; can stay as-is.
- **Manual stage change:** Unchanged.

---

## 7. Implementation checklist

1. **Webhook** (`gmail_webhook.py`): In the loop over `(msg_id, thread_id)`:
   - After fetching message metadata, if `from_email == user_email_lower` (user sent):
     - Find contact by `gmailThreadId == thread_id`; else by `To` + draft state.
     - Apply the contact updates above (draftStillExists, pipelineStage, emailSentAt, gmailThreadId, etc.).
   - Keep existing reply handling (from ≠ user) unchanged.
2. **Optional:** In the “user sent” branch, call existing `sync_thread_message` (or a minimal variant) to refresh snippet and thread status in one place, if desired.
3. **Frontend:** No change required; it already shows `pipelineStage` from the API. Once the backend updates the contact, the next fetch (or invalidation) will show “Sent” / “Waiting” instead of “Draft”.

---

## 8. Conclusion

The Draft button can be automatically updated using **existing Gmail scopes and the existing Gmail Watch**. The only change needed is to extend the Gmail webhook so that when a **user-sent** message appears in history, we find the matching contact and set `draftStillExists = false`, `pipelineStage = "waiting_on_reply"`, and `emailSentAt`, so the UI reflects “Sent” without the user opening the thread or waiting for batch sync.
