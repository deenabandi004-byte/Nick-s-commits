# Offerloop Agent Transformation

## Context

Offerloop is being reframed from a "networking platform" to a "networking agent." The core principle: **every minute the student spends configuring, typing, or deciding is a minute Offerloop failed.** The pitch becomes "we do the networking, you show up to the meetings."

Phases 1-4 (email learning loop, smart search suggestions, intelligent nudges, networking roadmap) are **already implemented** on the `feature/find-recommendation-cards` branch. This plan covers the next layer: making every touchpoint feel agent-driven rather than tool-driven.

Three tiers of automation, ordered by implementation priority:
- **Tier 1**: Maximum personalization, zero work (search results that explain themselves, emails that are ready to send)
- **Tier 2**: High personalization, minimal interaction (reply coaching, auto meeting prep)
- **Tier 3**: Proactive, no input needed (morning briefing, stuck-student intervention)

---

## Sprint 0: Metrics Event Logging (parallel with Sprint 1)

**Problem:** Without baseline metrics captured before features ship, we cannot prove the agent reframe improved reply rates, retention, or conversion. The pitch story for NVSC and UC LAUNCH depends on before/after numbers.

**Implementation:**

1. **New module** `backend/app/utils/metrics_events.py`:
   - `log_event(uid, event_type, properties)` writes to `metrics_events` Firestore collection with `{uid, event_type, properties, timestamp}`
   - Fire-and-forget pattern - wrapped in try/except, never blocks the request flow on logging failures
   - No LLM calls, just Firestore writes

2. **Instrument these events across the codebase:**

   | Event | Properties | Instrumentation point |
   |-------|-----------|----------------------|
   | `email_sent` | `{contact_id, regenerated_by_quality_gate, email_length, has_specificity_signal}` | `backend/app/routes/runs.py` (after email generation + quality gate) |
   | `reply_received` | `{contact_id, hours_since_send}` | `backend/app/routes/gmail_webhook.py` (reply detection block ~line 410) |
   | `reply_response_sent` | `{contact_id, used_auto_draft, edited_before_send}` | `backend/app/routes/contacts.py` (reply-draft/send route) |
   | `briefing_viewed` | `{sections_with_content}` | `backend/app/routes/briefing.py` (GET /api/briefing) |
   | `search_performed` | `{query, results_count, top_warmth_tier}` | `backend/app/routes/runs.py` (prompt_search return) |
   | `meeting_prep_used` | `{auto_triggered, contact_id}` | `backend/app/services/outbox_service.py` (auto-prep trigger) |

3. **Aggregation queries** (run weekly, results into `metrics_weekly` Firestore collection):
   - Reply rate per email (replies / emails sent)
   - Day-7 retention (% of users active in their second week)
   - % of emails sent without manual edits to the draft
   - Free-to-Pro conversion rate over rolling 30 days

**Cost:** Negligible. Firestore writes only, no LLM calls.

**Gating:** Backend-only. Users never see this. Internal pitch and product analytics.

**Files:** `backend/app/utils/metrics_events.py` (new), instrumentation calls added to `runs.py`, `gmail_webhook.py`, `briefing.py`, `outbox_service.py`, `contacts.py`

**Verification:** After 1 day of production traffic, query `metrics_events` collection - confirm all 6 event types are firing with correct properties. Run weekly aggregation manually - confirm reply rate calculation matches manual count from Firestore.

---

## Sprint 1: Tier 1 - Zero-Work Personalization (Week 1-2)

### 1A. Profile-Aware Contact Ranking

**Problem:** Search results come back in PDL default order. Dream company contacts are buried among irrelevant results. Warmth badges on frontend (lines 1724-1761 of `ContactSearchPage.tsx`) exist but never render because the backend doesn't attach `warmth_tier` to search results.

**Root cause:** `runs.py:429` calls `score_contacts_for_email()` which returns a side-channel dict for email gen. The warmth data never gets attached to the contact objects themselves. Meanwhile `score_and_sort_contacts()` in `warmth_scoring.py` DOES attach fields and sort - but it's only used in `runs_hunter.py`, never in `prompt_search()`.

**Fix (backend only, ~5 lines):**

In `backend/app/routes/runs.py` ~line 429, replace:
```python
warmth_data = score_contacts_for_email(user_profile, contacts)
```
with:
```python
from app.utils.warmth_scoring import score_and_sort_contacts
contacts = score_and_sort_contacts(user_profile, contacts)
warmth_data = {i: {"tier": c.get("warmth_tier",""), "score": c.get("warmth_score",0), "signals": c.get("warmth_signals",[])} for i, c in enumerate(contacts)}
```

This sorts contacts by relevance (dream companies first) AND attaches `warmth_tier`/`warmth_signals` so the existing frontend badges activate.

**Files:** `backend/app/routes/runs.py`
**Reuses:** `score_and_sort_contacts()` from `backend/app/utils/warmth_scoring.py`

---

### 1B. Contact Briefing Lines ("Why This Person")

**Problem:** Cards show name/title/company but no explanation of why the student should care. All the signals exist (warmth scoring, dream company flags, shared university) but aren't synthesized into a human sentence.

**Implementation:**

1. **New function** `build_briefing_line(contact, warmth_signals)` in `backend/app/utils/warmth_scoring.py`:
   - Deterministic (no LLM cost) - combines top 2-3 warmth signals into a sentence
   - Examples: "VP at your dream company Goldman Sachs. Went to USC like you." / "Recently joined McKinsey - good timing for a warm intro."
   - Pattern exists in `_build_personalization_label()` at `reply_generation.py:290`

2. **Attach in `runs.py`** after scoring: `contact["briefing"] = build_briefing_line(contact, contact.get("warmth_signals", []))`

3. **Render in `ContactSearchPage.tsx`** below the title/company line (~line 1763):
   ```tsx
   {c.briefing && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3 }}>{c.briefing}</div>}
   ```

**Files:** `backend/app/utils/warmth_scoring.py`, `backend/app/routes/runs.py`, `connect-grow-hire/src/pages/ContactSearchPage.tsx`

---

### 1C. Email Preview on Contact Cards

**Problem:** Emails are already generated during search (attached as `emailSubject`/`emailBody` on each contact). But the card rendering (lines 1682-1801) doesn't show them. Users must navigate to the tracker to see their emails.

**Implementation (frontend only):**

In `ContactSearchPage.tsx` contact card (after line 1789), add collapsible email preview:
- Show subject line (bold, 12px, truncated)
- First 2 lines of body, faded
- "View full email" expander
- Action buttons: "Open Draft" (if Gmail connected) / "Copy Email"

**Files:** `connect-grow-hire/src/pages/ContactSearchPage.tsx`

---

### 1D. Smart Default Search from Profile

**Problem:** New users land on an empty search bar. Their dream companies and career goals (collected in onboarding) aren't used to pre-populate.

**Implementation:**

1. In `ContactSearchPage.tsx`, when `SmartSuggestions` data loads (React Query), use the first suggestion's title as the search bar placeholder text
2. On first visit (no search history), auto-populate the search bar with top SmartSuggestion but don't auto-execute

**Files:** `connect-grow-hire/src/pages/ContactSearchPage.tsx`

---

### 1E. Silent Email Quality Gate

**Problem:** Email generation quality is inconsistent - some drafts are too long, lack specificity, miss a clear ask, or use generic openers. Students see whatever the first generation produces. There's no quality floor.

**Principle:** The student should never see a bad email. If the first draft fails quality criteria, regenerate silently. The student doesn't know it happened.

**Quality criteria (deterministic, no LLM):**
- **Length:** body between 60–180 words
- **Specificity:** contains at least one concrete reference to the recipient (company, role, school from PDL profile) as substring match
- **Clear ask:** contains ≥1 ask phrase ("15 minutes", "quick chat", "meeting", "your time", "would love to hear", "would appreciate", etc.) via regex
- **No template tells:** no `[Name]`, `[Company]`, `{{`, empty brackets
- **Subject line:** 3–8 words, not generic ("Meeting?", "Quick question", "Hi" alone fail)

**Implementation:**

1. **New module** `backend/app/utils/email_quality.py`:
   - `check_email_quality(email_subject, email_body, contact) -> QualityResult` returning `{passed: bool, failures: list[str]}`
   - Pure Python, no LLM calls, millisecond execution
   - Failures named for logging: `["too_short", "no_specificity", "no_clear_ask", "weak_subject", "template_leak"]`

2. **New function** `regenerate_with_feedback(contact, user_profile, original_email, failures)` in `backend/app/services/reply_generation.py`:
   - Calls **GPT-4o-mini specifically** (not the OpenAI/Anthropic cascade) with: original email, failure list, instructions to fix only those issues
   - Returns new `{subject, body}`
   - Hard cap: 1 regeneration attempt. Ship the better of the two (fewer failures)

3. **Hook into `runs.py`** after email generation (~line 451), before contacts are returned:
   ```python
   for i, contact in enumerate(contacts):
       quality = check_email_quality(contact.get("emailSubject",""), contact.get("emailBody",""), contact)
       if not quality.passed:
           improved = regenerate_with_feedback(contact, user_profile,
               {"subject": contact["emailSubject"], "body": contact["emailBody"]},
               quality.failures)
           new_quality = check_email_quality(improved["subject"], improved["body"], contact)
           if len(new_quality.failures) < len(quality.failures):
               contact["emailSubject"] = improved["subject"]
               contact["emailBody"] = improved["body"]
           contact["_qualityRegenerated"] = True
   ```

4. **Logging:** Write to `email_quality_logs` Firestore collection: `{uid, contactId, originalFailures, regenerated, finalFailures, timestamp}`. Dataset for tuning criteria and proving quality improvements.

**Cost:** ~30-50% of emails may fail v1 criteria. Each regen is one GPT-4o-mini call at ~$0.0005. For 15 contacts where 6 need regen: $0.003/search. Under $5/month at current scale.

**Gating:** All tiers. This is baseline quality, not a feature.

**Files:** `backend/app/utils/email_quality.py` (new), `backend/app/services/reply_generation.py`, `backend/app/routes/runs.py`

**Verification:**
- Generate emails for 10 contacts, log how many regenerate
- Inspect 5 regenerated pairs - confirm v2 is better on named failures
- After 1 week: query `email_quality_logs` for most common failures, regen success rate, and contacts where both v1+v2 failed (prompt engineering targets)
- Plan a criteria tuning pass for week 3 based on production data

---

## Sprint 2: Tier 2 - Reply Coach + Auto-Prep (Week 3-4)

### 2A. Reply Coach (Auto-Draft on Reply Detection)

**Problem:** When a contact replies, the student gets a notification but must manually compose a response. The infrastructure to auto-generate replies already exists (`generate_reply_to_message` at `reply_generation.py:1296`) but requires manual triggering via `POST /api/contacts/<id>/generate-reply`.

**Implementation:**

1. **New service** `backend/app/services/reply_coach.py`:
   - `auto_generate_reply_draft(uid, contact_id, thread_id, message_snippet)`:
     - Load Gmail creds via `gmail_client._load_user_gmail_creds(uid)`
     - Fetch full thread via Gmail API
     - Call existing `generate_reply_to_message()` from `reply_generation.py`
     - Store draft in `users/{uid}/replyDrafts/{contactId}` with: `draftBody`, `contactName`, `company`, `messageSnippet`, `createdAt`, `status` (pending/sent/dismissed)
   - `generate_reply_draft_on_demand(uid, contact_id)` - synchronous version for the fallback path:
     - Check if draft already exists in Firestore → return it
     - Otherwise generate synchronously (same logic as above), store, and return

2. **Background execution (primary path)** - hook into `gmail_webhook.py` at line 446 (after notification update, before history pointer advance):
   - Write a job document to `users/{uid}/pending_reply_drafts/{contactId}` with `{threadId, messageSnippet, status: "pending", createdAt}`
   - Spawn a background thread wrapped in try/except:
     ```python
     import threading
     def _auto_draft_reply_safe(app, uid, contact_id, thread_id, snippet):
         try:
             with app.app_context():
                 auto_generate_reply_draft(uid, contact_id, thread_id, snippet)
                 # On success, delete the pending job doc
                 get_db().document(f"users/{uid}/pending_reply_drafts/{contact_id}").delete()
         except Exception as e:
             logger.error(f"[reply_coach] Background draft failed: {e}")
             # Update pending doc status to "failed" so on-demand path knows to retry
             get_db().document(f"users/{uid}/pending_reply_drafts/{contact_id}").set(
                 {"status": "failed", "error": str(e)[:200]}, merge=True)
     threading.Thread(target=_auto_draft_reply_safe, args=(app, uid, contact_id, thread_id, snippet), daemon=True).start()
     ```
   - The pending doc ensures crash recovery - if the thread dies silently, the on-demand path detects it

3. **On-demand fallback path** - new routes in existing `contacts.py` blueprint:
   - `GET /api/contacts/<id>/reply-draft`:
     - Check `users/{uid}/replyDrafts/{contactId}` → if exists with status "pending" or "sent", return it
     - If not found OR pending_reply_drafts status is "failed": call `generate_reply_draft_on_demand(uid, contact_id)` synchronously (~3-5s), return result
     - Frontend shows a brief loading state during on-demand generation
   - `POST /api/contacts/<id>/reply-draft/send` - send via `gmail_client.create_gmail_draft_for_user`

4. **Frontend** - new `ReplyDraftCard` in `NudgePanel.tsx`:
   - Shows: contact name, snippet of their reply, auto-generated draft
   - Actions: "Send Reply" / "Edit & Send" (opens ConversationPanel with draft pre-filled)
   - If draft is still loading (on-demand path), show skeleton/spinner for up to 5s

**Gating:** Pro/Elite only. Free tier sees reply notification but no auto-draft (upsell prompt).

**Files:** `backend/app/services/reply_coach.py` (new), `backend/app/routes/gmail_webhook.py`, `backend/app/routes/contacts.py`, `connect-grow-hire/src/components/tracker/NudgePanel.tsx`, `connect-grow-hire/src/services/api.ts`

---

### 2B. Meeting Auto-Prep

**Problem:** Meeting prep requires manual navigation to `/meeting-prep`, pasting a LinkedIn URL, and paying 15 credits. When a meeting is scheduled, prep should trigger automatically.

**Implementation:**

1. **Background execution (primary path)** - in `backend/app/services/outbox_service.py` `update_contact_stage()`, after the `meeting_scheduled` handling (~line 342):
   - Check: user is Pro/Elite, has 15+ credits, contact has LinkedIn URL, no existing prep
   - If all met: write a pending job doc to `users/{uid}/pending_auto_preps/{contactId}` with `{status: "pending", createdAt}`
   - Spawn background thread wrapped in try/except (same crash-safe pattern as 2A):
     - Deduct credits via existing `deduct_credits_atomic`
     - Call existing `process_meeting_prep_background` from `meeting_prep.py`
     - On success: update contact doc with `autoPrepId`, create notification, delete pending doc
     - On failure: update pending doc status to `"failed"`, refund credits

2. **On-demand fallback path** - new route `GET /api/contacts/<id>/auto-prep`:
   - Check `users/{uid}/coffee-chat-preps/` for existing prep for this contact → return if found
   - If not found AND pending doc status is "failed" or missing: trigger prep synchronously (existing `process_meeting_prep_background` runs in-request, returns job ID for polling)
   - Frontend polls for completion using existing meeting prep status endpoint

3. **Frontend** - in `ConversationPanel.tsx`, when viewing a `meeting_scheduled` contact:
   - If `autoPrepId` exists: show inline "Meeting Prep Ready" with view/download link
   - If no prep exists: show "Generating prep..." with loading state, trigger on-demand via the fallback route

**Gating:** Pro/Elite only (credit-gated).

**Files:** `backend/app/services/outbox_service.py`, `backend/app/services/reply_coach.py`, `backend/app/routes/contacts.py`, `connect-grow-hire/src/components/tracker/ConversationPanel.tsx`

---

## Sprint 3: Tier 3 - Proactive Agent (Week 5-6)

### 3A. Morning Briefing as Home Screen

**Problem:** Users land on an empty search page. There's no summary of overnight replies, due follow-ups, or progress against their roadmap.

**Implementation:**

1. **New endpoint** `GET /api/briefing` in `backend/app/routes/briefing.py`:
   - Aggregates in one call:
     - Unread replies from `users/{uid}/notifications/outbox`
     - Due follow-ups via `_get_eligible_contacts()` from `nudge_service.py`
     - Pipeline stats via `get_outbox_stats()` from `outbox_service.py`
     - Roadmap progress via `get_cached_roadmap()` from `networking_roadmap.py`
     - Recruiting calendar deadlines from `RECRUITING_CALENDARS` in `networking_roadmap.py`
   - Register blueprint in `wsgi.py`

2. **New component** `MorningBriefing.tsx`:
   - Section 1: Replies (with auto-draft from 2A)
   - Section 2: Follow-ups due (top 3 priority nudges)
   - Section 3: Roadmap progress bars (emails sent vs. target, replies vs. target)
   - Section 4: Upcoming recruiting deadlines

3. **Add "Briefing" tab** to `FindPage.tsx` as the first tab (before People/Companies/Hiring Managers). Default to it when navigating to `/find` without `?tab=` param.

**Gating:** Core briefing for all tiers. Auto-draft section Pro/Elite. Roadmap section Pro/Elite.

**Files:** `backend/app/routes/briefing.py` (new), `backend/wsgi.py`, `connect-grow-hire/src/components/briefing/MorningBriefing.tsx` (new), `connect-grow-hire/src/pages/FindPage.tsx`, `connect-grow-hire/src/services/api.ts`

---

### 3B. Stuck-Student Intervention

**Problem:** If a student goes inactive, nothing happens. They silently churn. New users and established users have different failure modes and need different nudge timing.

**Implementation:**

1. **Add `_check_student_activity()`** to `backend/app/services/nudge_service.py` (inside existing `_run_scan` loop):
   - Read `user_data["createdAt"]` to determine user age (days since signup)
   - Two trigger branches:

   **Established users (>14 days since signup):**
   - Trigger after 7 days of no search activity AND no emails sent
   - Generate a `"stuck_student"` nudge with 3 specific search suggestions via GPT-4o-mini using user's dream companies / career track
   - Copy: "Let's get you back on track - here are 3 contacts worth reaching out to this week."

   **New users (≤14 days since signup):**
   - Trigger A: 3 days post-signup with zero emails sent
     - Copy: "Ready to send your first email? Here are 3 great people to start with."
   - Trigger B: 5 days post-first-email with zero replies received (check `replyReceivedAt` across contacts)
     - Copy: "First emails are tough - let's try a different angle. Here are 3 new contacts."

   - All branches: store as nudge with `type: "stuck_student"`, `subtype: "established_inactive" | "new_no_emails" | "new_no_replies"`, `suggestions: [{title, company, reason}]`
   - Each user only triggers once per state (deduplicate by checking existing nudges with same subtype)
   - Both branches use GPT-4o-mini to generate the 3 specific suggestions based on dream companies and career track

2. **New `StuckStudentCard`** in `NudgePanel.tsx`:
   - Encouraging tone (not warning), copy varies by subtype
   - 3 clickable suggestion cards that navigate to `/find` with pre-filled search

**Gating:** All tiers (engagement recovery reduces churn).

**Cost:** Same as before - each user triggers at most once per state, GPT-4o-mini at ~$0.001/call.

**Files:** `backend/app/services/nudge_service.py`, `connect-grow-hire/src/components/tracker/NudgePanel.tsx`, `connect-grow-hire/src/services/api.ts`

---

### 3C. Ambient Goal Progress

**Problem:** Students can't see how they're tracking against their networking roadmap.

**Implementation:**

1. **New function** `compute_roadmap_progress(uid)` in `backend/app/services/networking_roadmap.py`:
   - Read cached roadmap, determine current week
   - Count actual contacts/emails/replies this week from Firestore
   - Return: `{currentWeek, emailsSent, emailTarget, repliesReceived, replyTarget, status: "on_track"|"behind"|"ahead"}`

2. Include in `/api/briefing` response (Sprint 3A)

3. **`RoadmapProgress.tsx` component** in `MorningBriefing.tsx`:
   - Horizontal progress bars, current week milestone text, on-track indicator

**Gating:** Pro/Elite (roadmap is tier-gated).

**Files:** `backend/app/services/networking_roadmap.py`, `backend/app/routes/briefing.py`, `connect-grow-hire/src/components/briefing/RoadmapProgress.tsx` (new)

---

## Future (Not This Sprint): Advanced Agent Features

These require new infrastructure and should be evaluated after Sprints 1-3 ship:

- **Referral Chain Auto-Pickup**: NLP extraction from reply text to detect "talk to my colleague John." Auto-search PDL, pre-generate referral email. Needs `referral_detector.py` service + GPT extraction.
- **Job Change Triggers**: Weekly PDL re-enrichment of saved contacts to detect promotions/moves. Elite-only due to PDL API cost (~$0.01-0.10/call × N contacts).
- **Auto Resume Tailoring**: Enhance email prompt to select relevant resume experiences per target industry/role. Backend-only prompt engineering in `reply_generation.py`.

---

## Cost Control

| Feature | LLM Cost | Approach |
|---------|----------|----------|
| Contact ranking + briefings | $0 | Deterministic (warmth scoring) |
| Email preview | $0 | Already generated during search |
| Silent quality gate | ~$0.0005/regen | GPT-4o-mini only when first draft fails deterministic checks; <$5/mo |
| Reply coach | ~$0.001/reply | GPT-4o-mini via existing `generate_reply_to_message` |
| Meeting auto-prep | $0 extra | Uses existing prep system (already costs 15 credits) |
| Morning briefing | $0 | Aggregation of existing data |
| Stuck-student suggestions | ~$0.001/user/week | GPT-4o-mini, only when inactive 7+ days |
| Roadmap progress | $0 | Deterministic comparison |
| Metrics events | $0 | Firestore writes only |

---

## Implementation Sequence

| Sprint | Features | Effort | Key Principle |
|--------|----------|--------|---------------|
| 0 (parallel) | Metrics event logging - 6 event types + weekly aggregation | ~2 days | "Measure before you change" - runs parallel with Sprint 1 |
| 1 | 1A ranking + 1B briefings + 1C email preview + 1D smart defaults + 1E quality gate | ~1.5 weeks | "Search results that explain themselves, emails that are always good" |
| 2 | 2A reply coach + 2B meeting auto-prep (with on-demand fallbacks) | ~2 weeks | "We handle your replies, you show up to meetings" |
| 3 | 3A morning briefing + 3B stuck-student (age-differentiated) + 3C goal progress | ~2 weeks | "Open Offerloop, see what matters today" |

---

## Verification

1. **Sprint 1**: Search for contacts → verify results sorted by warmth (dream companies first), briefing lines appear on cards, warmth badges render, email preview visible. Check `email_quality_logs` - verify regeneration fires for low-quality drafts and v2 has fewer failures than v1
2. **Sprint 0**: After 1 day of traffic, query `metrics_events` - confirm all 6 event types fire with correct properties. Run weekly aggregation - confirm reply rate matches manual Firestore count
3. **Sprint 2**: Send test email via Gmail → have someone reply → verify auto-draft appears either pre-generated or generates on first view within 5s, with no silent failures. Move contact to `meeting_scheduled` → verify meeting prep auto-triggers (or generates on-demand when viewing contact)
4. **Sprint 3**: Navigate to `/find` → verify briefing tab appears first with replies, follow-ups, and roadmap progress. Test stuck-student triggers: new user with 0 emails after 3 days → nudge fires with "Ready to send your first email?" copy. Established user inactive 7 days → nudge fires with "back on track" copy
5. **All sprints**: `cd backend && pytest tests/` - no regressions. `cd connect-grow-hire && npx tsc --noEmit` - no type errors
