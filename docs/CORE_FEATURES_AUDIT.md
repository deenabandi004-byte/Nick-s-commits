# Offerloop Core Features Audit

**Date**: 2026-03-02
**Scope**: Company Search, Contact/Hiring Manager Discovery, Gmail Outreach, Outbox, Chrome Extension, Shared Infrastructure

---

## Table of Contents

1. [Company Search](#1-company-search)
2. [Contact/Hiring Manager Discovery](#2-contacthiring-manager-discovery)
3. [Gmail Outreach](#3-gmail-outreach)
4. [Outbox](#4-outbox)
5. [Chrome Extension](#5-chrome-extension)
6. [Shared Infrastructure](#6-shared-infrastructure)
7. [Cross-Cutting Priority Matrix](#7-cross-cutting-priority-matrix)

---

## 1. Company Search

### Current State

Users search for companies via natural language queries (e.g., "Mid-sized investment banks in New York focused on healthcare M&A"). The system uses OpenAI (gpt-4o-mini) to parse queries, generates firm names via ChatGPT, then enriches via SERP API + ChatGPT extraction.

**Key Files**:
| Layer | Files |
|-------|-------|
| Backend routes | `backend/app/routes/firm_search.py` (6 endpoints) |
| Backend services | `backend/app/services/company_search.py`, `serp_client.py`, `company_extraction.py`, `firm_details_extraction.py` |
| Frontend | `connect-grow-hire/src/pages/FirmSearchPage.tsx` (~1800 lines), `CompanyTrackerPage.tsx`, `components/FirmSearchResults.tsx` |
| API calls | `api.ts`: `searchFirms`, `deleteFirm`, `getFirmSearchHistory`, `getFirmSearchStatus`, `getFirmSearchById` |

### UX Flow

1. User navigates to `/firm-search` → sees "Find Companies" and "Company Tracker" tabs
2. Types natural language query in textarea
3. Client validates: `query.length > 20` AND location indicator regex match
4. Selects batch size (5/10/20/40) → clicks "Find Companies"
5. Full-screen loading modal with animated (fake) progress bar
6. Backend: OpenAI parses query → ChatGPT generates firm names → SERP API fetches in parallel (15 workers) → ChatGPT extracts structured details → location filter + dedup
7. Credits deducted: `firms_returned × 5`
8. Results table renders with sorting and inline search
9. "View Contacts" links to `/contact-search?company=X&location=Y`

### Bugs

| # | Severity | Description |
|---|----------|-------------|
| 1 | **Critical** | `CompanyTrackerPage` calls two nonexistent API methods (`deleteFirmFromSearch`, `deleteFirmSearch`) - standalone `/company-tracker` route is completely broken for deletions |
| 2 | **Critical** | `Firm` interface missing `searchId` field that `CompanyTrackerPage` relies on - TypeScript doesn't catch it due to `noImplicitAny: false` |
| 3 | High | Progress bar is fake - backend search is synchronous, frontend simulates 2%/500ms increments, polls after response already arrived |
| 4 | High | History item click immediately fires a new search and charges credits - no confirmation, no "inspect previous query" affordance |
| 5 | Medium | `hasIndustry` check is just `query.length > 10` - meaningless validation |
| 6 | Medium | `isValidQuery` requires "in" keyword but OpenAI can parse "New York investment banks" fine - blocks valid queries |
| 7 | Medium | "Delete All" fires N parallel `deleteFirm` calls, each doing a full Firestore collection scan - O(N × all_searches) |
| 8 | Medium | `time.sleep(0.5)` blocking Flask worker thread inside delete handler |
| 9 | Low | Tier/batch-size inconsistency: frontend gates 20/40 behind pro but backend allows any size for all tiers |

### Performance Concerns

- **Search latency: 15-45 seconds** for 40 firms (OpenAI + SERP + extraction pipeline) with no async/streaming
- `_filter_stats`, `_firm_cache`, `@lru_cache` are all process-local - don't share across Gunicorn workers
- `delete_firm` iterates all search history docs for every single deletion
- CompanyTrackerPage loads up to 100 search batches with full firm arrays on mount
- No pagination or virtualization on results table

### UI/UX Quality

- **Rough**: Fake progress bar, no real-time feedback during 15-45s wait
- `FirmSearchPage` is 1800 lines - contains both search AND a duplicate Company Tracker tab
- `CompanyTrackerPage` exists as a separate route with diverged dedup logic
- Debug `console.log` with emojis left in production API code
- Backend uses `print()` instead of structured `logger` calls

### Top Improvements

1. **Fix broken `CompanyTrackerPage` API calls** - critical, users can't delete firms
2. **Make search async** with real progress (background task + polling/SSE)
3. **Merge or clearly separate** `FirmSearchPage` tracker tab vs `CompanyTrackerPage`
4. **Fix `delete_firm` N+1 performance** - index by firmId, remove `time.sleep()`
5. **Fix query validation** - remove fake "hasIndustry" check, allow location without "in"
6. **Make history clicks non-destructive** - populate field without firing search

---

## 2. Contact/Hiring Manager Discovery

### Current State

Three search systems coexist (two legacy, one active):

| System | Route | Status |
|--------|-------|--------|
| Free-run (form-based) | `POST /api/free-run` | Legacy, unused |
| Pro-run (form-based) | `POST /api/pro-run` | Legacy, unused |
| **Prompt-search (NLP)** | `POST /api/prompt-search` | **Active - used by all tiers** |
| Elite prompt-run | `POST /api/search/prompt-run` | Dead code |

The active flow: user types NLP query → OpenAI parses → PDL (People Data Labs) search → Hunter.io email verification → OpenAI email generation → Gmail draft creation → save to Firestore.

**Key Files**:
| Layer | Files |
|-------|-------|
| Backend routes | `backend/app/routes/runs.py` (all 3 search endpoints), `contacts.py` (CRUD) |
| Backend services | `pdl_client.py`, `contact_search_optimized.py`, `hunter.py`, `auth.py` |
| Frontend | `connect-grow-hire/src/pages/ContactSearchPage.tsx` (~1681 lines), `HiringManagerTrackerPage.tsx`, `ContactDirectory.tsx` |
| API calls | `api.ts`: `runPromptSearch`, `runFreeSearch` (unused), `runProSearch` (unused) |

### UX Flow

1. User arrives at `/contact-search` → "Search" tab with NLP input
2. Types query (e.g., "USC alumni in investment banking at Goldman Sachs in NYC") or pastes LinkedIn URL
3. Adjusts "Number of Contacts" slider (1 to `min(tierMax, floor(credits/15))`)
4. Clicks "Discover Contacts" → simulated progress bar starts
5. Backend: parse prompt → PDL search with dedup exclusion → email verification → batch email generation → Gmail draft creation → credit deduction → save to Firestore
6. **Frontend shows only a count message** - no contact cards, no names, no details
7. Two buttons: "Open Gmail Drafts" and "View in Networking Tracker"
8. User must navigate to Tracker tab or Gmail to see who was found

### Credit System

- **Cost**: 15 credits per contact returned
- **Tiers**: Free (300 credits, 3 contacts/search), Pro (1500 credits, 8 contacts/search), Elite (3000 credits, 15 contacts/search)
- **Deduction**: `firestore.Increment(-15 * len(contacts))` - NOT atomic
- `deduct_credits_atomic()` exists in `auth.py` but is **never called** by any search endpoint

### Bugs

| # | Severity | Description |
|---|----------|-------------|
| 1 | **Critical** | Credit deduction is non-atomic - two concurrent requests can both pass the credit check and double-deduct, causing overdraft |
| 2 | **Critical** | No contact cards shown after search - users can't see who was found without navigating to Gmail or Tracker |
| 3 | High | Success message hardcodes "Gmail drafts created" even when `successful_drafts === 0` or Gmail isn't connected |
| 4 | High | Triple Firestore `contacts_ref.stream()` in same request - 3x document reads per search for dedup/count |
| 5 | High | `generate-reply` returns hardcoded boilerplate text: "Thank you for your reply! I appreciate you taking the time to respond." - creates useless Gmail drafts |
| 6 | High | Debug `print()` statements in `contacts.py` dump full PII (emails, names) to stdout in production |
| 7 | Medium | Slider division by zero when `maxBatchSize = 1` → `(0/0) * 100 = NaN%` breaks slider track width |
| 8 | Medium | Firestore offset-based pagination in `contacts.py` → O(N) read cost for deep pages (should use cursor) |
| 9 | Medium | CORS preflight on `batch-check-replies` hits auth decorator before OPTIONS handler |
| 10 | Medium | `subscriptionTier` vs `tier` field inconsistency - two field names for same concept |
| 11 | Low | `prompt_search.py`, `prompt_pdl_search.py` are dead code registered in wsgi.py |

### Performance Concerns

- **Email verification dominates latency**: 8-25 seconds via Hunter.io (6 parallel workers)
- Resume PDF downloaded from Firebase Storage on every search - no caching
- Sequential Firestore writes for contact saving (should use WriteBatch)
- `ContactDirectory` reloads full contact list on every tab switch - no caching or TanStack Query
- Reply polling every 2 minutes with `contacts` as a dependency → callback recreated on every state change

### UI/UX Quality

- **Major gap**: No in-page results display - this is the #1 UX issue across the entire product
- No email verification quality indicator (verified vs pattern-generated)
- No credit cost preview before committing to search
- "Create Your Own Email Template" button shown to non-Elite users but always gates them
- "Tracker" vs "Networking Tracker" naming confusion across pages
- CSV export function exists but is dead code (no button)

### Top Improvements

1. **Show contact cards after search** - name, company, title, email with verified badge, LinkedIn link
2. **Use `deduct_credits_atomic()`** in all search endpoints - prevent double-spend
3. **Consolidate Firestore reads** - one `stream()` call reused for count, exclusion set, and dedup
4. **Show credit cost before search** - "This search costs 45 credits. You have 120 remaining."
5. **Remove production debug logs** - especially PII-leaking `print()` in contacts.py
6. **Implement real reply generation** - replace boilerplate with OpenAI call using actual message body

---

## 3. Gmail Outreach

### Current State

Full pipeline: Gmail OAuth connection → AI email generation (GPT-4o-mini) → MIME message construction with resume attachment → Gmail draft creation → webhook-based send detection → reply detection → AI reply generation.

**Key Files**:
| Layer | Files |
|-------|-------|
| OAuth | `backend/app/routes/gmail_oauth.py`, `backend/app/services/gmail_client.py` |
| Email gen | `backend/app/services/reply_generation.py`, `recruiter_email_generator.py`, `email_templates.py` |
| Draft creation | `backend/app/routes/emails.py` |
| Webhook | `backend/app/routes/gmail_webhook.py` |
| Frontend | `Outbox.tsx`, `EmailTemplatesPage.tsx`, `AccountSettings.tsx`, `GmailBanner.tsx`, `ContactSearchPage.tsx` |

### UX Flow

1. User connects Gmail via OAuth in Account Settings
2. Google OAuth consent screen → callback → token stored in Firestore → Gmail watch started
3. User searches for contacts → backend generates personalized emails → creates Gmail drafts
4. User opens Gmail, reviews/sends drafts
5. Webhook detects sent email → updates pipeline stage
6. Contact replies → webhook fires → notification appears → AI can generate reply draft

### Bugs

| # | Severity | Description |
|---|----------|-------------|
| 1 | **Critical** | `client_secret` (app-level OAuth secret) stored per-user in Firestore - if Firestore is compromised, all users' Gmail access + app secret exposed |
| 2 | **Critical** | `uid` falls back to `"local_test"` string if Firebase auth fails in production - credentials saved under fake UID |
| 3 | High | Full OAuth URL with state token printed to production logs (~200 lines of debug prints) |
| 4 | High | ASCII stripping `encode('ascii', 'ignore')` destroys international characters in names (Maria → Mara, Francois → Franois) |
| 5 | High | `resumeText` always sent as empty string from frontend - AI never personalizes emails based on resume content |
| 6 | High | No Gmail watch renewal - watches expire after 7 days, real-time reply detection silently stops |
| 7 | High | Resume downloaded per-contact in a loop - 10 contacts = 10 Firebase Storage downloads |
| 8 | Medium | All drafts created sequentially in single request - 15 contacts = 30-60 seconds of blocking |
| 9 | Medium | `batch_generate_emails` failure is unhandled - entire request fails with 500 |
| 10 | Medium | Signature duplication possible when LLM includes signoff + backend appends another |
| 11 | Medium | 3 separate implementations of Gmail OAuth initiation in frontend (ContactSearchPage, AccountSettings, GmailBanner) |
| 12 | Low | `GmailBanner` cache never invalidated on token expiry - silently hides banner on API errors |

### Security Concerns

| Concern | Location | Severity |
|---------|----------|----------|
| `client_secret` in Firestore per-user | `gmail_client.py:58` | **High** |
| OAuth URL + state token in production logs | `gmail_oauth.py:307-313` | Medium |
| No email content sanitization | `emails.py` throughout | Medium |
| Webhook relies only on static `GMAIL_WEBHOOK_SECRET` query param | `gmail_webhook.py` | Medium |
| CSRF state fallback proceeds without validation | `gmail_oauth.py:443-447` | Medium |
| `custom_instructions` passed directly to LLM | `email_templates.py:162-167` | Low |

### Performance Concerns

- Resume download per contact (10 contacts = 5-15 seconds wasted)
- All drafts created sequentially (15 contacts → 30-60s blocking, risks Gunicorn timeout)
- `/api/google/gmail/status` makes live Gmail API call every time (3 separate frontend implementations)
- No retry on Gmail API transient failures

### UI/UX Quality

- **Email Template previews are hardcoded** - don't reflect actual GPT output
- `EmailTemplatesPage` purpose pills disconnected from backend `EMAIL_PURPOSE_PRESETS`
- Elite gating for custom templates is hardcoded `user?.tier === "elite"` (fragile)
- No empty state in Outbox when Gmail isn't connected
- No indication that emails were actually personalized based on resume (they aren't - `resumeText: ""`)

### Top Improvements

1. **Remove `client_secret` from Firestore** - use env var on reconstruction (already done as fallback)
2. **Remove 200+ lines of debug prints** from `gmail_oauth.py`
3. **Fix `"local_test"` UID fallback** - redirect to error page instead
4. **Download resume once** before the draft creation loop - reuse bytes
5. **Implement Gmail watch renewal** - scheduled endpoint callable from cron
6. **Fix ASCII stripping** - use `unicodedata.normalize('NFKC', text)` instead
7. **Pass `resumeText` to email generator** - load from Firestore on frontend

---

## 4. Outbox

### Current State

The Outbox tracks email lifecycle: draft created → sent → waiting on reply → replied → meeting scheduled → connected. Uses Gmail Pub/Sub webhooks for real-time send/reply detection, plus lazy batch sync on page load.

**Key Files**:
| Layer | Files |
|-------|-------|
| Backend | `backend/app/routes/outbox.py` (1115 lines), `gmail_webhook.py`, `gmail_client.py`, `reply_generation.py`, `background_sync.py` |
| Frontend | `connect-grow-hire/src/pages/Outbox.tsx` (1001 lines), `components/OutboxEmbedded.tsx` (667 lines), `components/Outbox.tsx` (deprecated, dead) |
| API calls | `api.ts`: `getOutboxThreads`, `getOutboxStats`, `patchOutboxStage`, `batchSyncOutbox`, `regenerateOutboxReply`, `syncOutboxThread` |

### Data Model (Firestore)

Each contact doc in `users/{uid}/contacts/{contactId}` becomes an outbox entry when it has `gmailDraftId` or `gmailThreadId`. Key fields: `pipelineStage`, `draftStillExists`, `hasUnreadReply`, `lastMessageSnippet`, `suggestedReply`, `replyType`.

### UX Flow

1. Draft created during contact search → `pipelineStage: "draft_created"`
2. User sends in Gmail → webhook fires → sets `pipelineStage: "waiting_on_reply"`
3. Outbox page: `GET /api/outbox/threads` streams all contacts, filters to those with Gmail data
4. Batch sync on page load: syncs 10 oldest contacts (1-second sleep between each)
5. Click thread → sync with Gmail → show snippet in detail panel
6. Contact replies → webhook fires → `hasUnreadReply: true` → notification badge
7. "Regenerate" → GPT-4o-mini generates reply draft → 10 credits

### Bugs

| # | Severity | Description |
|---|----------|-------------|
| 1 | High | Journey progress bar and manual stage picker built but never rendered - `JOURNEY_STAGES`, `JOURNEY_LABELS`, `handleStageChange` are all dead code |
| 2 | High | `duplicateOf` flag set by backend dedup but frontend never filters - same contact appears twice in thread list |
| 3 | High | `email_sent` stage defined in `ALLOWED_PIPELINE_STAGES` but never assigned by any code path - ghost stage |
| 4 | High | Frontend fetches max 50-100 threads but ignores `pagination.has_next` - users with 150+ contacts silently lose visibility |
| 5 | Medium | Batch sync blocks Flask worker for 10 seconds (sequential `time.sleep(1)` × 10 contacts) |
| 6 | Medium | Draft existence cache (`_check_draft_exists_cached`) is unbounded dict on function object - memory leak |
| 7 | Medium | `_perform_sync` accesses `request.firebase_user` - would crash if called outside request context |
| 8 | Medium | `find_uid_by_gmail_address` scans ALL users on cache miss - O(N) Firestore operation |
| 9 | Medium | Webhook daemon thread silently drops failed notifications (200 already returned to Google) |
| 10 | Medium | `OutboxEmbedded.tsx` and `pages/Outbox.tsx` are diverged clones with different state management |
| 11 | Low | `components/Outbox.tsx` is dead hardcoded demo file - should be deleted |
| 12 | Low | `sync_thread_message` uses `format='full'` - downloads full bodies + attachments (1-5MB per sync) |

### Performance Concerns

- **Full Firestore collection scan on every request** - both `/threads` and `/stats` stream all contacts
- Batch sync blocks worker for 10 seconds with sequential `time.sleep(1)`
- `format='full'` on Gmail thread fetch downloads entire email bodies + attachments
- `find_uid_by_gmail_address` does full users table scan on cold cache
- `staleTime: 30_000` means reply notifications update badge immediately but thread data is stale for 30s

### UI/UX Quality

- **Major gap**: No way to manually change pipeline stage - backend supports it but UI has no stage picker
- Only snippet shown, not full email body - no "View in Gmail" for sent threads (only for drafts)
- Duplicate contacts visible in thread list (confusing)
- No follow-up scheduling or reminders
- Two separate Outbox UIs (page vs embedded) with different layouts, data fetching, and status types
- Disabled "Regenerate" button gives no tooltip explaining why

### Top Improvements

1. **Wire up the stage picker UI** - backend is fully implemented, just render the dropdown
2. **Filter duplicate threads** - add `threads.filter(t => !t.duplicateOf)`
3. **Fix pagination** - increase per_page or implement lazy loading
4. **Replace blocking batch sync** - use ThreadPoolExecutor, return immediately
5. **Add "View in Gmail" link** for sent/replied threads (not just drafts)
6. **Consolidate `OutboxEmbedded` with `Outbox.tsx`** - extract shared component
7. **Delete dead `components/Outbox.tsx`**

---

## 5. Chrome Extension

### Current State

Manifest V3 extension (v1.0.8) with LinkedIn profile scraping, job board integration (9 platforms), and direct backend API calls. Content scripts inject an "Add to Offerloop" button on LinkedIn profiles and job pages.

**Key Files**:
| File | Size | Role |
|------|------|------|
| `chrome-extension/manifest.json` | 1.8 KB | Permissions, scripts, OAuth config |
| `chrome-extension/background.js` | 9.1 KB | Service worker - auth, API calls |
| `chrome-extension/content.js` | **218 KB** | Content script - button injection, job scraping |
| `chrome-extension/popup.html` | 12.7 KB | Two-tab popup UI |
| `chrome-extension/popup.js` | 60.5 KB | All popup logic |

### UX Flow

1. Install extension → open LinkedIn profile → see "Add to Offerloop" button
2. Click button or open popup → sign in via Google OAuth (Chrome identity API)
3. **On LinkedIn profiles**: Extract profile data → import contact → find email → create Gmail draft
4. **On job boards**: Scrape job posting → find recruiters → generate cover letter → prep for interview/meeting
5. All data syncs to main web app via backend API

### Bugs

| # | Severity | Description |
|---|----------|-------------|
| 1 | **Critical** | `content.js` contains a **200KB base64-encoded PNG icon** on line 5 - injected into every matched page (LinkedIn, Indeed, Greenhouse, etc.). Extension is 12x larger than needed |
| 2 | **Critical** | `gmail_draft_url` dropped in background→popup message passing - "Open Email Draft" always opens generic Gmail drafts list, never the specific draft |
| 3 | High | MutationObserver never disconnected on SPA navigation - accumulates N observers after N profile views (memory leak) |
| 4 | High | Retry timers never cleared - 5 retries × N navigations = up to 15+ overlapping setTimeout calls |
| 5 | High | No request timeouts on any fetch call - Render cold starts cause popup to hang 30-60 seconds with no feedback |
| 6 | High | Glassdoor, ZipRecruiter, Wellfound, Workday have no dedicated scrapers - fall through to broken generic selectors |
| 7 | High | No sign-in button on Job tab - user must switch to Contact tab to authenticate |
| 8 | Medium | Token refresh logic duplicated between `background.js` and `popup.js` (50+ lines each, already diverging) |
| 9 | Medium | Firebase tokens stored in `chrome.storage.local` instead of `chrome.storage.session` - persist across browser restarts |
| 10 | Medium | Auth route `auth_extension.py` echoes back any Origin header in CORS preflight - bypasses Flask-CORS restrictions |
| 11 | Medium | Every popup open makes 2 blocking network calls before showing any content |
| 12 | Low | Logo filename: `iconinvertcolor-removebg-preview.png` - clearly an unprocessed design tool export |
| 13 | Low | Build.js dev/prod OAuth client ID switch is manual - easy to ship wrong ID |

### Security Concerns

| Concern | Severity |
|---------|----------|
| Manual CORS handler in `auth_extension.py` echoes any Origin | Medium |
| Backend returns raw Python exception strings to extension | Medium |
| Tokens in `chrome.storage.local` persist permanently | Medium |
| Content script (214KB) injected on all matched pages including non-job pages | Low |

### Performance Concerns

- **content.js is 218KB** - 200KB of which is a base64 icon. Injected on every LinkedIn, Indeed, Greenhouse, etc. page
- MutationObserver leak - N observers watching `document.body` with `subtree: true` on LinkedIn's highly dynamic DOM
- Two sequential network round-trips before popup shows any content
- No AbortController timeouts on any fetch

### Top Improvements

1. **Remove base64 icon** - use `chrome.runtime.getURL('icons/icon48.png')` → reduces content.js from 218KB to ~18KB
2. **Fix `gmail_draft_url` passthrough** - add to background.js return object, update popup link href
3. **Add request timeouts** (8-10s for auth, 30s for long ops) with user-friendly cold-start message
4. **Fix MutationObserver leak** - disconnect before reconnect, clear retry timers
5. **Add sign-in button to Job tab**
6. **Add dedicated scrapers** for Glassdoor, ZipRecruiter, Wellfound, Workday
7. **Move tokens to `chrome.storage.session`**
8. **Deduplicate `refreshAuthToken()`** - single implementation in background.js

---

## 6. Shared Infrastructure

### Authentication

**Backend**: `@require_firebase_auth` in `extensions.py` verifies Firebase ID tokens from `Authorization: Bearer` headers. Has 3-retry logic with exponential backoff. `@require_tier` fetches tier from Firestore on every request (extra DB round-trip per guarded call).

**Frontend**: `FirebaseAuthContext.tsx` uses `onIdTokenChanged`, `api.ts` `getIdToken()` creates a new `onAuthStateChanged` listener per API call (very expensive).

| # | Severity | Issue |
|---|----------|-------|
| 1 | **Critical** | **`/api/user/update-tier` privilege escalation** - any authenticated user can call this endpoint to grant themselves Elite tier and unlimited credits. No admin check. |
| 2 | **Critical** | **Decorator order wrong in `prompt_search.py`** - `@require_firebase_auth` is above `@require_tier`, so `@require_tier` runs first before auth is set, always returning 401 |
| 3 | High | `getIdToken()` creates a new Firebase auth listener per API call - O(N) listeners per page |
| 4 | Medium | `rate_limit_by_user` has a double-execution bug (calls `fn()` twice) - dead code, never applied to any route |

### Rate Limiting

- 500/day, 200/hour per user via Flask-Limiter with `storage_uri="memory://"` (in-memory)
- **Resets on every deploy/restart** (Render restarts containers on deploy)
- Fixed-window strategy allows burst attacks at window boundaries
- `rate_limit_by_user` is dead code with a double-execution bug

### Credit System

| Tier | Credits | Max Contacts/Search |
|------|---------|-------------------|
| Free | 300 | 3 |
| Pro | 1500 | 8 |
| Elite | 3000 | 15 |

**Issues**:
- Credit reset uses 30-day rolling window, frontend uses calendar month - misaligned
- `check_credits` returns `maxCredits: 300` for new users but `maxCredits: 150` for existing users without the field
- `deduct_credits_atomic()` exists but most search endpoints use bare `firestore.Increment()` instead
- Reset check runs on every credit-deducting request (extra Firestore read each time)

### CORS

| # | Severity | Issue |
|---|----------|-------|
| 1 | High | Hardcoded ngrok URL (`d33d83bb2e38.ngrok-free.app`) in default CORS origins - whoever controls that tunnel can make credentialed API requests |
| 2 | Medium | Dev and prod CORS configs are identical - production allows localhost origins |
| 3 | Low | CORS applied to `/*` (all routes including static) instead of just `/api/*` |

### Error Handling

- Custom exception hierarchy in `backend/app/utils/exceptions.py` (good)
- **Frontend `ErrorBoundary` doesn't report to any monitoring** - Sentry call is commented out
- Inconsistent error response formats: `{error}`, `{error, error_code, details}`, `{error, retry}`, `{error, current_credits}`
- No global error interceptor or retry logic on frontend API layer

### Environment & Config

| # | Severity | Issue |
|---|----------|-------|
| 1 | High | `FLASK_SECRET` defaults to `"dev"` if not set - session cookies forgeable in production |
| 2 | High | `/api/debug/frontend` endpoint is unauthenticated - reveals internal file paths |
| 3 | Medium | Firebase config (apiKey, appId) hardcoded in source instead of env vars |
| 4 | Medium | No validation of required environment variables at startup |
| 5 | Low | CLAUDE.md says "Free (150 credits)" but actual value is 300 - stale docs |

### Blueprint Registration

- 27+ blueprints registered in `wsgi.py` (canonical entry point)
- `backend/app/__init__.py` has a parallel, inconsistent app factory (registers only 3 blueprints)
- `billing_bp` uses `/api` prefix (no sub-path) - pollutes top-level namespace
- `linkedin_import_bp` has fragile ordering dependency (must register before `contacts_bp`)

---

## 7. Cross-Cutting Priority Matrix

### P0 - Fix Immediately (Security / Data Loss)

| # | Feature | Issue | Impact |
|---|---------|-------|--------|
| 1 | Infrastructure | `/api/user/update-tier` privilege escalation - any user can grant themselves Elite + unlimited credits | **Security: Critical** |
| 2 | Gmail | `client_secret` stored per-user in Firestore - app OAuth secret exposed | **Security: High** |
| 3 | Gmail | `uid` fallback to `"local_test"` in production | **Data corruption** |
| 4 | Infrastructure | Hardcoded ngrok URL in CORS defaults | **Security: Medium** |
| 5 | Infrastructure | `/api/debug/frontend` unauthenticated endpoint leaks internals | **Security: Medium** |
| 6 | Infrastructure | `FLASK_SECRET` defaults to `"dev"` | **Security: Medium** |

### P1 - High Impact (Core UX / Correctness)

| # | Feature | Issue | Impact |
|---|---------|-------|--------|
| 7 | Contact Search | **No contact cards shown after search** - #1 UX gap across the entire product | User experience |
| 8 | Contact Search | Non-atomic credit deduction - concurrent requests can overdraft | Financial |
| 9 | Company Search | `CompanyTrackerPage` API calls broken (nonexistent methods) | Feature broken |
| 10 | Chrome Extension | 200KB base64 icon in content.js - 12x oversized | Performance |
| 11 | Chrome Extension | `gmail_draft_url` dropped - "Open Draft" link always generic | User experience |
| 12 | Gmail | No watch renewal - real-time detection stops after 7 days | Feature decay |
| 13 | Gmail | 200+ lines of debug prints in `gmail_oauth.py` including OAuth URLs | Security/Noise |
| 14 | Infrastructure | `getIdToken()` creates new auth listener per API call | Performance |
| 15 | Outbox | Stage picker built but not rendered - users can't manually advance stages | Feature incomplete |
| 16 | Outbox | Duplicate contacts visible in thread list | User experience |

### P2 - Medium Impact (Performance / Polish)

| # | Feature | Issue | Impact |
|---|---------|-------|--------|
| 17 | Company Search | Search is synchronous 15-45s with fake progress | User experience |
| 18 | Contact Search | Triple Firestore reads per search | Cost/Performance |
| 19 | Contact Search | Credit cost not shown before committing | User trust |
| 20 | Gmail | Resume downloaded per-contact (not cached) | Performance |
| 21 | Gmail | ASCII stripping destroys international characters | Correctness |
| 22 | Gmail | `resumeText` always empty - no resume-based personalization | Quality |
| 23 | Outbox | Batch sync blocks Flask worker for 10 seconds | Performance |
| 24 | Outbox | Full Firestore collection scan on every page load | Cost/Performance |
| 25 | Chrome Extension | MutationObserver memory leak | Performance |
| 26 | Chrome Extension | No request timeouts - 30-60s hangs on cold start | User experience |
| 27 | Infrastructure | In-memory rate limiting resets on restart | Security |
| 28 | Infrastructure | Frontend ErrorBoundary doesn't report to monitoring | Observability |

### P3 - Lower Impact (Tech Debt / Polish)

| # | Feature | Issue | Impact |
|---|---------|-------|--------|
| 29 | Company Search | Merge diverged FirmSearchPage/CompanyTrackerPage | Maintenance |
| 30 | Contact Search | Dead code: `prompt_search.py`, `prompt_pdl_search.py` | Cleanup |
| 31 | Contact Search | Debug prints with PII in contacts.py | Security |
| 32 | Gmail | Unify 3 separate Gmail OAuth initiation implementations | Maintenance |
| 33 | Outbox | Consolidate `OutboxEmbedded` + `Outbox.tsx` | Maintenance |
| 34 | Outbox | Delete dead `components/Outbox.tsx` | Cleanup |
| 35 | Chrome Extension | Deduplicate `refreshAuthToken()` | Maintenance |
| 36 | Chrome Extension | Add scrapers for Glassdoor, ZipRecruiter, Wellfound, Workday | Feature completeness |
| 37 | Infrastructure | Credit reset 30-day vs calendar month misalignment | Correctness |
| 38 | Infrastructure | `check_credits` returns inconsistent `maxCredits` defaults | Correctness |
| 39 | Infrastructure | Parallel app factory in `__init__.py` vs `wsgi.py` | Maintenance |
| 40 | Infrastructure | Decorator order wrong in `prompt_search.py` | Bug (dead code route) |

---

*Total issues identified: 40 prioritized items across 6 feature areas*
*Critical security issues: 6 (P0)*
*High-impact UX/correctness issues: 10 (P1)*
*Performance/polish issues: 12 (P2)*
*Tech debt/cleanup items: 12 (P3)*
