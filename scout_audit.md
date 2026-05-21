# Scout Feature - Full Audit Report

**Date:** 2026-03-06
**Scope:** `backend/app/routes/scout.py`, `backend/app/routes/scout_assistant.py`, `backend/app/services/scout_service.py` (3,488 lines), `backend/app/services/scout_assistant_service.py` (1,068 lines), `backend/app/services/pdf_builder.py`, `backend/app/templates/`

---

## 1. Architecture & Data Flow

### System Overview

Scout is split across two blueprints and two services:

| Blueprint | Prefix | Auth | Service |
|-----------|--------|------|---------|
| `scout_bp` | `/api/scout` | **NONE** | `ScoutService` (3,488 lines) |
| `scout_assistant_bp` | `/api/scout-assistant` | `@require_firebase_auth` | `ScoutAssistantService` (1,068 lines) |

Registered in `wsgi.py` at lines 22, 31, 114, 123.

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/scout/chat` | POST | Main chat - URL parsing, job search, research, conversation |
| `/api/scout/analyze-job` | POST | Deep job fit analysis with resume |
| `/api/scout/firm-assist` | POST | Firm search assistant (query gen, refine, recommend, research) |
| `/api/scout/health` | GET | Health check |
| `/api/scout-assistant/chat` | POST | Product help chatbot (navigation, feature guidance) |
| `/api/scout-assistant/search-help` | POST | Failed search recovery (alternative suggestions) |
| `/api/scout-assistant/health` | GET | Health check |

### Request Lifecycle - Scout Chat (Job Search)

```
POST /api/scout/chat {"message": "python jobs in SF", "context": {"user_resume": {...}}}
  |
  v
scout.py:scout_chat() - asyncio.run() blocks Flask worker
  |
  v
scout_service.handle_chat(message, context)
  |-- _classify_intent(message, context)          [Regex, then LLM fallback]
  |     Returns: intent="JOB_SEARCH", extracted={"job_title":"python","location":"SF"}
  |
  |-- _handle_job_search(message, extracted, context)
  |     |-- _generate_job_titles_from_resume()     [OpenAI, 8s timeout, cached 1hr]
  |     |-- _search_jobs(query) x3 SEQUENTIAL      [SERP API, cached 30min each]
  |     |-- _filter_and_rank_jobs_by_resume()       [CPU scoring]
  |     |-- _aggregate_fields_from_jobs()           [Extract best fields]
  |     Returns: ScoutResponse(fields, job_listings[:10], message)
  |
  v
JSON response to frontend
```

### Other Intent Flows

| Intent | Handler | External APIs |
|--------|---------|---------------|
| `URL_PARSE` | `_handle_url_parse()` | Jina Reader + OpenAI |
| `JOB_SEARCH` | `_handle_job_search()` | SERP + OpenAI (if resume) |
| `RESEARCH` | `_handle_research()` | SERP + OpenAI |
| `FIELD_HELP` | `_handle_field_help()` | OpenAI |
| `CONVERSATION` | `_handle_conversation()` | OpenAI |
| Firm assist (6 sub-types) | `handle_firm_assist()` | OpenAI |

### Redundant Operations

| Issue | Locations | Impact |
|-------|-----------|--------|
| Location extraction duplicated 3x | Lines 1111-1145, 1260-1281, 1783-1793 | Subtle divergence between copies |
| `_simplify_job_title()` called on same titles repeatedly | Lines 731, 1641, 1676, 1777, 1808, 1847 | Wasted CPU |
| `_normalize_company()` called on same companies repeatedly | Lines 732, 1644, 1678, 1848 | Wasted CPU |
| Duplicate job-search heuristic in `_handle_conversation` | Lines 2117-2135 | Dead code (intent already classified) |

### Firebase Operations

**None.** Scout services do not read from or write to Firestore directly. User data (resume, context) is passed in the request body. This means Scout has no persistence layer - all state is client-managed.

---

## 2. External API Usage

### Complete API Inventory

#### OpenAI (gpt-4o-mini) - 17 call sites

| Purpose | Function | Line | Timeout | Max Tokens | Called Per Request |
|---------|----------|------|---------|------------|-------------------|
| Intent classification (LLM fallback) | `_llm_classify_intent()` | 443-455 | 10s | 150 | 0-1x |
| Job details from URL content | `_extract_job_details_from_content()` | 708-720 | 15s | 300 | 0-1x |
| Quick job fit (URL parse) | `_analyze_job_fit()` | 826-838 | 10s | 400 | 0-1x |
| Deep job fit analysis | `_analyze_job_fit_internal()` | 963-978 | 45s | 800 | 1x |
| Generate job titles from resume | `_generate_job_titles_from_resume()` | 1366-1378 | 8s | 200 | 0-1x (cached) |
| Field help | `_handle_field_help()` | 1959-1970 | 8s | 400 | 0-1x |
| Title suggestions | `_get_title_suggestions()` | 1900-1912 | 5s | 150 | 0-1x |
| Research synthesis | `_handle_research()` | 2063-2074 | 10s | 500 | 0-1x |
| Conversation | `_handle_conversation()` | 2181-2189 | 15s | 400 | 0-1x |
| Generate firm query | `_handle_generate_firm_query()` | 2840-2852 | 20s | 400 | 0-1x |
| Refine firm query | `_handle_refine_firm_query()` | 2948-2960 | 10s | 300 | 0-1x |
| Recommend firms | `_handle_firm_recommendations()` | 3056-3068 | 12s | 600 | 0-1x |
| Research firm | `_handle_firm_research()` | 3181-3192 | 12s | 500 | 0-1x |
| General firm help | `_handle_general_firm_help()` | 3345-3356 | 10s | 300 | 0-1x |
| Scout assistant chat | `handle_chat()` (assistant) | 653-662 | 28s | 350 | 1x |
| Contact search help | `_handle_contact_search_help()` | 859-868 | **NONE** | 300 | 0-1x |
| Firm search help | `_handle_firm_search_help()` | 967-977 | **NONE** | 300 | 0-1x |

**Estimated cost per request:** $0.001-0.01 (gpt-4o-mini pricing)
**Max OpenAI calls per single Scout chat:** 3 (intent classify + job titles + fit analysis)

#### Jina Reader API - 1 call site

| Purpose | Function | Line | Timeout |
|---------|----------|------|---------|
| Fetch URL content | `_fetch_url_content()` | 619-627 | 4.5s |

Content truncated to 15,000 chars. Used for URL parsing and optional job fit enrichment.

#### SERP API (SerpApi) - 2 call sites

| Purpose | Function | Line | Engine | Results |
|---------|----------|------|--------|---------|
| Job listings | `_search_jobs()` | 1561-1572 | `google_jobs` | 10 |
| Research (organic) | `_handle_research()` | 2012-2019 | `google` | 5 |

**Max SERP calls per request:** 3 (resume-based search with 3 generated titles)
**Estimated cost per call:** $0.01 (SerpApi pricing)

### Caching

| What | TTL | Cache Key |
|------|-----|-----------|
| URL parse results | 1 hour | URL string |
| SERP job search results | 30 min | Query string |
| Resume-generated job titles | 1 hour | SHA-256 of resume text |
| Research SERP queries | **NOT CACHED** | - |
| Job fit analysis | **NOT CACHED** | - |
| Firm assist responses | **NOT CACHED** | - |

---

## 3. Performance Issues

### Estimated End-to-End Latency

| Scenario | Best Case | Worst Case |
|----------|-----------|------------|
| URL parse (cached) | <50ms | <50ms |
| URL parse (cold) | 5s | 25s |
| Job search (user-specified title) | 3s | 10s |
| Job search (resume-based, 3 titles) | 9s | 25s |
| Deep job fit analysis | 5s | 50s |
| Firm assist | 3s | 20s |
| Scout assistant chat | 2s | 28s |

### Critical Performance Issues

**Issue P1 - `asyncio.run()` blocks Flask worker** (Critical)
- Location: `scout.py:41,101,165` and `scout_assistant.py:75,165`
- Every Scout request creates a new event loop and blocks the Flask worker for the full duration. With 4 Gunicorn sync workers, 4 simultaneous Scout requests fully saturate the server for all other users.
- Fix: Use `--worker-class=gthread --threads 4` in Gunicorn, or move to background tasks with polling.

**Issue P2 - 3 sequential SERP calls** (Critical)
- Location: `scout_service.py:1151-1161`
- Resume-based search calls `_search_jobs()` three times sequentially (9-18s total).
- Fix: Use `asyncio.gather()` to parallelize - cuts to 3-6s.

**Issue P3 - Static knowledge prompt rebuilt every request** (Warning)
- Location: `scout_assistant_service.py:167-543`, called at line 629
- `_build_knowledge_prompt()` returns ~4KB of static Markdown, rebuilt on every chat message.
- Fix: Cache at module level.

**Issue P4 - `TTLCache` unbounded and not thread-safe** (Warning)
- Location: `scout_service.py:145-166`
- No max size (unbounded memory growth). No `threading.Lock` (unsafe under `--threads`).
- Fix: Add LRU eviction + lock.

**Issue P5 - `asyncio.get_event_loop()` deprecated** (Warning)
- Location: `scout_service.py:1571,2018`
- Fix: Replace with `asyncio.get_running_loop()`.

**Issue P6 - Indented JSON in prompts wastes tokens** (Warning)
- Location: `scout_service.py:806,914,2777,3018`
- `json.dumps(user_resume, indent=2)[:4000]` is 30-40% larger than compact JSON, and slicing can produce malformed JSON.
- Fix: Use `separators=(',',':')` and truncate at field boundaries.

---

## 4. Error Handling

### External API Error Coverage

| API Call | Try/Catch | Timeout | Retry | User-Facing Error |
|----------|-----------|---------|-------|-------------------|
| OpenAI (intent classify) | Yes | 10s | No | Falls back to regex |
| OpenAI (job extraction) | Yes | 15s | No | "Couldn't extract" |
| OpenAI (quick fit) | Yes | 10s | No | Silently omitted |
| OpenAI (deep fit) | Yes | 45s | No | "Analysis failed" |
| OpenAI (job titles) | Yes | 8s | No | Falls back to user query |
| OpenAI (search help) | Yes | **NONE** | No | Falls back to hardcoded suggestions |
| Jina Reader | Yes | 4.5s | No | Falls back to URL fallback |
| SERP API | Yes | None (sync) | No | Returns empty list silently |

### Issues Found

**Issue E1 - SERP failures are silent** (Warning)
- Location: `scout_service.py:1693-1696`
- SERP exceptions return `[]` with no indication to the user that the API failed vs. no results exist.
- Fix: Distinguish "API error, retry" from "no results found".

**Issue E2 - Two OpenAI calls have no timeout** (Warning)
- Location: `scout_assistant_service.py:858-887,967-997`
- `_handle_contact_search_help` and `_handle_firm_search_help` can hang indefinitely.
- Fix: Add `asyncio.wait_for(..., timeout=10.0)`.

**Issue E3 - Malformed JSON from OpenAI handled but not validated** (Warning)
- Location: `scout_service.py:980-989,1038-1041`
- JSON parse errors are caught and code attempts to strip markdown fences, but required fields are not validated after parsing. Missing fields silently become `None`.

**Issue E4 - Partial failure not communicated** (Info)
- Location: `scout_service.py:1102-1176`
- If `_generate_job_titles_from_resume()` fails, the system silently falls back to the user's original query. User doesn't know they got generic results instead of resume-matched results.

**Issue E5 - Malformed fallback PDFs** (Warning)
- Location: `pdf_builder.py:152-155`, `scout_service.py:3476-3481`
- Error fallback writes `b"%PDF-1.4\n..."` which is not a valid PDF. Most readers will fail to open it.
- Fix: Return an HTTP error instead of a broken PDF.

---

## 5. Credit & Usage Tracking

### Critical Finding: Scout Has ZERO Credit Tracking

| Feature | Credits Checked | Credits Deducted | Tier Enforced |
|---------|----------------|-----------------|---------------|
| Scout Chat | No | No | No |
| Analyze Job | No | No | No |
| Firm Assist | No | No | No |
| Scout Assistant | No | No | No |
| Search Help | No | No | No |

**Comparison with other features:**
- Contact Search: checks credits, deducts before operation, enforces tier
- Meeting Prep: checks 15 credits, deducts before generation, enforces tier
- Email Templates: checks credits, deducts per generation

**Impact:** Any user (including unauthenticated - see Security) can make unlimited OpenAI + SERP API calls at zero cost to them.

### Issues

**Issue CR1 - No credit deduction anywhere in Scout** (Critical)
- No calls to credit-tracking functions in any Scout route or service.
- Fix: Add credit checks and deduction before expensive operations.

**Issue CR2 - No tier enforcement** (Critical)
- No `@require_tier(['pro'])` on any Scout endpoint.
- Fix: Add tier decorator if Scout is a paid feature.

**Issue CR3 - No credit reversal mechanism** (Warning)
- Even when credits are eventually added, there's no mechanism to refund credits on partial failure.

---

## 6. PDF Generation

### Architecture

Scout has two PDF paths:

1. **Meeting Prep** - `pdf_builder.py:generate_meeting_pdf_v2()` uses WeasyPrint + Jinja2 template `meeting_prep.html`
2. **Resume PDF** - `scout_service.py:format_resume_pdf()` (lines 3382-3481) uses WeasyPrint + Jinja2 template `resume.html`, duplicating the same stderr suppression pattern

### Issues

**Issue PDF1 - Duplicate PDF code** (Warning)
- `scout_service.py:3382-3481` duplicates the WeasyPrint stderr suppression pattern from `pdf_builder.py:136-144`.
- `format_resume_pdf` is never called from any Scout route - it's dead code.
- Fix: Delete from `ScoutService`; if needed elsewhere, move to `pdf_builder.py`.

**Issue PDF2 - Template variables not null-safe** (Warning)
- `meeting_prep.html:115` - `contact.fullName` rendered without fallback (blank if missing)
- `meeting_prep.html:116` - `contact.jobTitle` and `contact.company` joined with `·`, no fallback
- `meeting_prep.html:126` - `user.university` shows "None" if missing
- `meeting_prep.html:264` - `research.company_news[:2]` crashes if `company_news` is `None`
- `meeting_prep.html:283` - `contact.firstName` used directly in follow-up email template
- Fix: Add `{{ field or " - " }}` guards, and validate arrays before slicing.

**Issue PDF3 - Questions array items not validated** (Warning)
- `pdf_builder.py:108` - `questions_categories` defaults to `[]` but individual items are not validated for required `name` and `questions` keys.
- Fix: Validate structure before passing to template.

**Issue PDF4 - Strategy parsing fragile** (Info)
- `pdf_builder.py:54-69` - Regex requires exact `**DO THIS**` and `**AVOID THIS**` formatting from OpenAI. If format varies, sections silently empty out.
- Fix: Use structured JSON output from OpenAI instead of parsing markdown.

**Issue PDF5 - Google Fonts require internet** (Info)
- `meeting_prep.html:6` - Loads Inter and Playfair Display from Google Fonts. If network unavailable during PDF generation, fonts fall back unpredictably.

---

## 7. Security & Data Handling

### Critical Issues

**Issue S1 - No authentication on 3 Scout endpoints** (Critical)
- Location: `scout.py:15,59,118`
- `/api/scout/chat`, `/api/scout/analyze-job`, `/api/scout/firm-assist` have NO `@require_firebase_auth` decorator.
- Any anonymous internet user can call these endpoints and burn OpenAI/SERP/Jina API quota.
- Compare: `scout_assistant.py` correctly applies `@require_firebase_auth`.
- Fix: Add `@require_firebase_auth` to all three handlers.

**Issue S2 - No user data scoping** (Critical)
- Location: `scout_service.py:190-218`
- `handle_chat()` accepts `user_resume` in the request body with no verification that the resume belongs to the authenticated user. User A could pass User B's resume data.
- Fix: Fetch resume from Firestore using the authenticated `user_id` instead of trusting the request body.

**Issue S3 - PII logged without sanitization** (Warning)
- Location: `scout_service.py:222,1113,1115,1122,1133` and many more
- Prints user locations, resume content lengths, extracted job details, and intent data to stdout.
- Example: `print(f"[Scout] DEBUG: resume_location from user_resume: {resume_location}")`
- Fix: Remove DEBUG prints. Use structured logging with PII redaction.

**Issue S4 - Context injection / prompt injection risk** (Warning)
- Location: `scout_service.py:194-217`
- `context` dict from the request is passed directly into OpenAI prompts (e.g., `json.dumps(context.get('recent_topics', []))` at line 424).
- A malicious user could craft context values that manipulate LLM behavior.
- Fix: Sanitize and validate context structure before including in prompts.

**Issue S5 - Resume data not size-validated** (Warning)
- Location: `scout_service.py:806,914`
- Resume JSON is serialized and truncated by string slice (`[:4000]`), but there's no upfront validation of resume size or structure.
- Fix: Validate resume size and required fields before processing.

---

## 8. Code Quality

### Dead Code

| Location | Lines | Description |
|----------|-------|-------------|
| `scout_service.py:format_resume_pdf()` | 3382-3481 | 100-line PDF method never called from Scout routes |
| `scout_service.py:2117-2135` | 19 lines | Duplicate job-search heuristic in `_handle_conversation` (dead - intent already classified) |
| `scout_service.py:1113` | 1 line | `pass  # debug removed` |

### Functions Too Large

| Function | Lines | Count | Should Split Into |
|----------|-------|-------|-------------------|
| `_classify_intent()` | 252-407 | 155 lines | Regex classifier + LLM classifier |
| `_simplify_job_title()` | 2245-2371 | 127 lines | dash splitter + comma splitter + qualifier stripper |
| `_handle_job_search()` | 1078-1217 | 140 lines | resume-based path + direct path + result assembly |
| `_normalize_location()` | 2373-2496 | 124 lines | state lookup + format normalizer |
| `_normalize_company()` | 2498-2609 | 112 lines | legal suffix stripper + brand extractor |
| `_analyze_job_fit_internal()` | 877-1046 | 170 lines | prompt builder + API caller + response parser |

### Inconsistent Patterns

| Pattern | Location | Issue |
|---------|----------|-------|
| Inline imports | `scout_service.py:1135,1277` | `from app.utils.users import extract_hometown_from_resume` inside function bodies |
| Debug prints vs logging | `scout_service.py:1113-1133` | `print()` statements mixed with no `logger` usage in Scout |
| OpenAI client init | `scout_service.py:178-180` | Created at import time - crashes app if `OPENAI_API_KEY` missing |
| Firm assist response shape | `scout_service.py:3218-3225` | `suggestions` dict has different keys per action type, no typed schema |

---

## Top 10 Priorities

| # | Severity | Issue | Fix | Impact |
|---|----------|-------|-----|--------|
| 1 | **Critical** | No auth on 3 Scout endpoints (S1) | Add `@require_firebase_auth` to `scout.py:15,59,118` | Prevents unauthenticated API abuse |
| 2 | **Critical** | No credit tracking at all (CR1) | Add credit checks + deduction before OpenAI/SERP calls | Prevents unlimited free API usage |
| 3 | **Critical** | `asyncio.run()` blocks Flask workers (P1) | Use `gthread` workers or background tasks | Prevents 4 Scout users from DoS-ing the server |
| 4 | **Critical** | 3 sequential SERP calls (P2) | Replace loop with `asyncio.gather()` | Cuts job search from 9-18s to 3-6s |
| 5 | **Critical** | No user data scoping (S2) | Fetch resume from Firestore by `user_id`, don't trust request body | Prevents cross-user data access |
| 6 | **Warning** | PII in logs (S3) | Remove DEBUG prints, use structured logging | Privacy compliance |
| 7 | **Warning** | TTLCache unbounded + not thread-safe (P4) | Add max size, LRU eviction, `threading.Lock` | Prevents memory leak + race conditions |
| 8 | **Warning** | 2 OpenAI calls with no timeout (E2) | Add `asyncio.wait_for(..., timeout=10)` | Prevents indefinite hangs |
| 9 | **Warning** | Malformed fallback PDFs (E5) | Return HTTP error instead of broken PDF bytes | Users get clear error instead of broken file |
| 10 | **Warning** | 100 lines of dead PDF code (W3) | Delete `format_resume_pdf` from ScoutService | Reduces confusion in 3,488-line file |
