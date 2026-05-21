# Contact Search Flow - Full Audit

Audit of contact search execution, credit deduction, and feasibility of cancel + credit refund.

---

## 1. Search Execution Flow

### 1.1 When the user clicks Search - full trace

**Frontend (Contact Search tab)**

- **Entry:** `ContactSearchPage.tsx` → `handleSubmit()` (or Enter) → `handleSearch()`.
- **Pre-checks:** Prompt non-empty, user signed in; then `getUserProfileData()` + `checkCredits()` in parallel.
- **Credit gate:** If `currentCredits < 15`, search is aborted with toast “Insufficient Credits”; no API call.
- **API call:** Single `await apiService.runPromptSearch({ prompt: searchPrompt.trim(), batchSize })`.

**API layer**

- **File:** `connect-grow-hire/src/services/api.ts`
- **Method:** `runPromptSearch(data)` → `makeRequest<SearchResult>('/prompt-search', { method: 'POST', headers, body: JSON.stringify({ prompt, batchSize }) })`.
- **HTTP:** One `fetch()` to `${API_BASE_URL}/prompt-search`. No `AbortController` or `signal` is passed; the request is not abortable from the UI.

**Backend route**

- **File:** `backend/app/routes/runs.py`
- **Route:** `@runs_bp.route("/prompt-search", methods=["POST"])` → `prompt_search()` (url_prefix is `/api`, so full path is `/api/prompt-search`).
- **Order of work:**
  1. Parse JSON: `prompt`, `batchSize`.
  2. Validate prompt (length 3–500).
  3. Load user from Firestore, `check_and_reset_credits()`, load exclusion list (cached or from `users/{uid}/contacts`).
  4. Credit check: if `credits_available < 15` → return 400, no deduction.
  5. Parse prompt: `parse_search_prompt_structured(prompt)` (OpenAI). On parse error or low confidence → return 400, no deduction.
  6. **PDL fetch:** `search_contacts_from_prompt(parsed, pdl_fetch_count, exclude_keys=seen_contact_set)`.
  7. If `contacts` is empty → return 200 with `contacts: []`, no deduction.
  8. Pre-generation dedup (Firestore); if all filtered out → return 200 with message “All found contacts have already been contacted”, no deduction.
  9. Trim to `max_contacts`.
  10. Resolve email template, generate emails (`batch_generate_emails`), create Gmail drafts (`create_drafts_parallel`).
  11. **Deduct credits:** `db.collection("users").document(user_id).update({ "credits": firestore.Increment(-15 * len(contacts)) })`.
  12. Save contacts to `users/{uid}/contacts`, invalidate exclusion cache.
  13. Return JSON: `contacts`, `successful_drafts`, `total_contacts`, `tier`, `user_email`, `parsed_query`.

**PDL/Hunter in this path**

- **Prompt-search path:** `search_contacts_from_prompt()` in `backend/app/services/pdl_client.py`:
  - Builds PDL query from parsed prompt; up to 4 attempts (relax title → drop title → drop location) on 404.
  - Single or multiple **sequential** `execute_pdl_search()` calls (one per attempt until non-404 or attempts exhausted).
- **execute_pdl_search:** One or more HTTP POSTs to PDL `person/search` (pagination if needed), then **in-function** contact extraction (batch domain prefetch, batch email verification, parallel extraction with ThreadPoolExecutor). So one “search” can be: several PDL requests + heavy in-process extraction/Hunter.
- **Hunter:** Used inside PDL extraction (email verification/find) and optionally in `runs.py` for free-run/pro-run (enrichment when PDL emails insufficient). For prompt-search, extraction is inside `execute_pdl_search` (PDL client).

### 1.2 Synchronous vs stream/poll

- **Fully synchronous.** The client issues one POST to `/api/prompt-search` and waits for the full response. There is no streaming, no polling, no partial results. The backend runs the entire pipeline (parse → PDL → emails → drafts → deduct → save) and then returns.

### 1.3 Typical duration and slow steps

- **Typical total:** Often in the 15–60+ second range depending on PDL response size, number of contacts, and Hunter/OpenAI usage.
- **Steps that dominate time:**
  - **PDL API:** Initial search (and any retries); 30s timeout per request.
  - **Contact extraction inside `execute_pdl_search`:** Domain prefetch, batch email verification, then parallel per-contact extraction (Hunter/OpenAI). Often the largest share.
  - **Email generation:** `batch_generate_emails` (OpenAI) for all contacts.
  - **Gmail drafts:** `create_drafts_parallel` (one Gmail API call per draft).
- Backend logs already print timing (e.g. “PDL search + extraction”, “Enrichment”) in `pdl_client.py` and `contact_search_optimized.py`.

### 1.4 Loading state on the frontend

- **State:** `isSearching` is set true at start of `handleSearch`, false in `finally`.
- **UI:** A top-of-card progress bar is shown while `isSearching`:
  - `{isSearching && ( <Progress value={progressValue} className="h-1 rounded-none bg-blue-50" /> )}` (around line 1228).
- **Progress value:** Simulated: `progressInterval` ramps from 10 to 85 over time; on success it jumps to 90 then 100. It is not tied to real backend progress. Search input and example chips are disabled when `isSearching || linkedInLoading`.
- There is **no “Cancel” button** and no abort of the in-flight request.

---

## 2. Credit System

### 2.1 When credits are deducted

- **When:** **After** the search and pipeline complete successfully on the backend, right before saving contacts to Firestore.
- **Not** before the search starts. **Not** incrementally during the search. If the request fails or returns early (no contacts, parse error, insufficient credits, etc.), no deduction happens on the backend.

### 2.2 Exact code that deducts credits

**Prompt-search (current Contact Search flow)**

- **File:** `backend/app/routes/runs.py`
- **Function:** `prompt_search()`
- **Snippet:**

```python
# After emails + drafts, before saving contacts (lines 1403–1408)
if db and user_id:
    try:
        db.collection("users").document(user_id).update({
            "credits": firestore.Increment(-15 * len(contacts))
        })
    except Exception:
        pass
```

**Free-run (e.g. legacy or alternate UI)**

- **File:** `backend/app/routes/runs.py`
- **Function:** `run_free_tier_enhanced_optimized()` (used by `/free-run` handler)
- **Snippet (lines 448–456):**

```python
if db and user_id:
    try:
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'credits': firestore.Increment(-15 * len(contacts))
        })
    except Exception:
        pass
```

**Pro-run**

- **File:** `backend/app/routes/runs.py`
- **Function:** `run_pro_tier_enhanced_final_with_text()` (used by `/pro-run`)
- **Snippet (lines 866–874):** Same pattern, `firestore.Increment(-15 * len(contacts))`.

**Hunter-backed runs**

- **File:** `backend/app/routes/runs_hunter.py`
- Free-run (lines 293–301) and pro-run (lines 569–574): same `firestore.Increment(-15 * len(contacts))`.

So the **exact** deduction is always: **Firestore `Increment(-15 * len(contacts))`** in the corresponding route handler, after contacts and drafts are ready.

### 2.3 Cost per search

- **Per contact:** **15 credits** per contact returned and charged.
- **Total:** `15 * len(contacts)` - **variable** by number of contacts in the response (capped by tier: free 3, pro 8, elite 15).
- Minimum cost for one search that returns at least one contact is 15 credits.

### 2.4 Where credits are stored

- **Backend:** Firestore document `users/{userId}`; field `credits` (integer). Read/updated by backend and by frontend via Firebase SDK.
- **Reset logic:** `backend/app/services/auth.py` → `check_and_reset_credits(user_ref, user_data)`: if 30 days since `lastCreditReset`, sets `credits` to tier default and updates `lastCreditReset`. Tier defaults come from `TIER_CONFIGS` in `backend/app/config.py` (e.g. free 300, pro 1500, elite 3000).
- **Frontend:** Same Firestore doc; `FirebaseAuthContext` exposes `user.credits` and `updateCredits(newCredits)` (writes `credits` via `updateDoc`).

### 2.5 Existing refund/credit-back mechanism

- **No** refund or credit-back is implemented. There is no endpoint or code path that adds credits back after a failed search or user cancel. Deduction happens only once, at the end of a successful pipeline; if the pipeline never reaches that point, credits are simply not deducted.

---

## 3. Cancellation Feasibility

### 3.1 Can the backend API call be cancelled mid-flight?

- **Client:** `makeRequest` in `api.ts` uses plain `fetch(url, options)`. No `AbortController` or `signal` is passed. So the browser may cancel the TCP connection if the user navigates away or closes the tab, but the frontend does not expose a “Cancel” button that aborts the request.
- **Backend:** One long-running synchronous request (single Flask request handler). There is no check for a “cancelled” flag or request context. If the client disconnects, Flask/gunicorn may close the request, but the handler is not explicitly written to stop work or refund on disconnect. So:
  - **Single long request:** Yes for prompt-search; no chunked or streaming response.
  - **Multiple sequential calls:** PDL and extraction are sequential (or parallel only inside one request). So “cancel” would mean aborting that one HTTP request.
- **Conclusion:** Cancellation is **feasible on the client** (add `AbortController`, pass `signal` to `fetch`, wire to a Cancel button). The backend would see a client disconnect; it does **not** today detect disconnect or stop work or refund.

### 3.2 User closes the browser tab during a search

- **Credits:** If the backend has **not** yet reached the deduction block, no deduction occurs (e.g. PDL or email step still running). If the backend **has** already run `update({ "credits": firestore.Increment(...) })`, the deduction has already been applied; closing the tab does not revert it. So:
  - Close before deduction → no charge.
  - Close after deduction → credits already spent; no automatic refund.

### 3.3 Database transactions / atomicity

- **No** multi-step transaction. Deduction is a single Firestore `update` with `Increment(-15 * len(contacts))`. There is no “reserve then confirm” or two-phase flow. So there is no partial state like “credits reserved but search failed”; it’s either “deduct once at the end” or “don’t deduct”.

### 3.4 PDL/Hunter error - are credits still deducted?

- **No.** Deduction runs only after the pipeline has built a non-empty `contacts` list and run emails/drafts. If:
  - `search_contacts_from_prompt()` raises or returns [],
  - or any earlier return (parse error, insufficient credits, “all already contacted”),
  the handler returns without reaching the `update(credits: Increment(...))` block. So on PDL/Hunter/OpenAI errors that prevent reaching that block, credits are **not** deducted.

---

## 4. Current Error Handling

### 4.1 What happens when a search fails

- **API error / timeout / no results:** Backend may return 4xx/5xx or 200 with `contacts: []` or an `error` message. Frontend in `handleSearch`:
  - Treats non–search-result responses as error: clears progress, sets `isSearching` false, shows toast “Search Failed” with `errMsg`, and optionally calls `checkCredits()` if the message suggests insufficient credits.
  - On network/exception: catches, shows “Search Failed” and clears progress.
- **No results (contacts.length === 0):** Treated as success (no error toast for “no results”); `triggerScoutForNoResults()` may run. Backend did not deduct (because either it returned early with empty contacts or, if it somehow reached deduction with 0 contacts, `-15*0` is 0).

### 4.2 Are credits refunded on failure?

- **No.** There is no refund path. If the backend never deducts (early return or exception before the update), the user simply is not charged. If the backend has already deducted and then something fails after (e.g. save contacts fails), the code still does not refund; the `update` is in a try/pass block and is not reverted on later errors.

### 4.3 User feedback on search failure

- Toasts: “Search Failed” with message from API or “Please try again.” For insufficient credits, “Insufficient Credits” with current balance. For Gmail reauth, “Gmail session expired” with link to Account Settings. No specific “credits refunded” message because refunds do not exist.

---

## 5. File Map

| File | Role |
|-----|------|
| **Frontend** | |
| `connect-grow-hire/src/pages/ContactSearchPage.tsx` | Search UI, handleSearch, credit check, progress bar, calls runPromptSearch, **deducts locally** (updateCredits after success). **Add cancel button + AbortController here.** |
| `connect-grow-hire/src/services/api.ts` | runPromptSearch → POST /prompt-search; makeRequest (no abort). **Add optional AbortSignal support here.** |
| `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx` | updateCredits(newCredits), checkCredits(); reads/writes Firestore `users/{uid}.credits`. Refund would go through updateCredits or a dedicated endpoint. |
| **Backend routes** | |
| `backend/app/routes/runs.py` | prompt_search(), free-run, pro-run; credit check; **deduct credits** (Increment -15*len(contacts)); save contacts. **Add cancel detection + refund logic here if desired.** |
| `backend/app/routes/runs_hunter.py` | Hunter-based free-run/pro-run; same credit deduction pattern. Same refund/cancel considerations. |
| **Backend services** | |
| `backend/app/services/auth.py` | check_and_reset_credits(); no refund. |
| `backend/app/services/pdl_client.py` | search_contacts_from_prompt(), execute_pdl_search(); PDL HTTP + in-request extraction (Hunter/OpenAI). Long-running; no cancel hook today. **Cancel/refund would need request-scoped “cancelled” check or disconnect detection.** |
| `backend/app/services/contact_search_optimized.py` | Used by free-run (runs.py); contact_search_optimized() → PDL + parallel verification. Same “one request” model. |
| `backend/app/services/prompt_parser.py` | parse_search_prompt_structured(prompt); used before PDL in prompt_search. |
| `backend/app/config.py` | TIER_CONFIGS (credits per tier, max_contacts). |
| **Other** | |
| `backend/app/models/users.py` | User model / tier helpers; default credits. |
| `backend/app/routes/billing.py` | /check-credits, tier/credit admin. |

**Where to add cancel + refund**

- **Frontend:** ContactSearchPage - Cancel button, AbortController, pass signal into runPromptSearch → makeRequest. On abort, optionally call a “refund” endpoint if backend supports it.
- **API (optional):** api.ts - makeRequest and runPromptSearch accept optional AbortSignal and pass it to fetch.
- **Backend:** runs.py (and optionally runs_hunter.py) - Either: (1) detect client disconnect (e.g. request.environ or worker-level) and skip deduction or refund if already deducted; and/or (2) New endpoint e.g. POST /prompt-search-cancel or /refund-search that records a job id and refunds (if you introduce job ids). Today there is no job id; refund would need to be by convention (e.g. “last search for this user within N seconds”) or by adding a search-job id to the flow.

---

## Code Snippets (Credit Deduction and Search Entry)

### Backend: prompt-search credit deduction

```python
# backend/app/routes/runs.py, inside prompt_search(), lines 1403–1408
if db and user_id:
    try:
        db.collection("users").document(user_id).update({
            "credits": firestore.Increment(-15 * len(contacts))
        })
    except Exception:
        pass
```

### Backend: free-run credit deduction

```python
# backend/app/routes/runs.py, inside run_free_tier_enhanced_optimized(), lines 448–456
if db and user_id:
    try:
        user_ref = db.collection('users').document(user_id)
        user_ref.update({
            'credits': firestore.Increment(-15 * len(contacts))
        })
    except Exception:
        pass
```

### Frontend: post-search credit update (sync with backend deduction)

```ts
// connect-grow-hire/src/pages/ContactSearchPage.tsx, inside handleSearch(), after result
const creditsUsed = result.contacts.length * 15;
const newCredits = Math.max(0, currentCredits - creditsUsed);
if (updateCredits) {
  await updateCredits(newCredits).catch(() => {});
}
```

### Frontend: search request (no abort)

```ts
// connect-grow-hire/src/services/api.ts
async runPromptSearch(data: { prompt: string; batchSize: number }): Promise<SearchResult> {
  const headers = await this.getAuthHeaders();
  return this.makeRequest<SearchResult>('/prompt-search', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: data.prompt.trim(), batchSize: data.batchSize }),
  });
}
// makeRequest uses fetch(url, options) with no signal
```

---

**Summary**

- One synchronous POST to `/api/prompt-search`; backend runs parse → PDL → emails → drafts → **deduct 15 per contact** → save. Credits are stored in Firestore `users/{uid}.credits`; no refund path. Cancellation is feasible on the client (AbortController + Cancel button); backend does not yet detect disconnect or refund. Adding cancel + refund would touch ContactSearchPage, api.ts (signal), and runs.py (and optionally runs_hunter.py) for disconnect handling and/or a small refund endpoint.
