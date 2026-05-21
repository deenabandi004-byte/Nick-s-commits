# Scout Conversational Upgrade - Implementation Plan

This plan maps the spec in `scout-conversational-upgrade.md` to the Offerloop codebase and orders work so we can implement in one sitting (items 1–7) with optional follow-ups (8–9).

**Important:** The spec says "Molt Bolt" in the system prompt; we will use **Offerloop** everywhere in code.

---

## Summary Table

| # | Change | Location | Effort |
|---|--------|----------|--------|
| 1 | Replace system prompt with conversational persona | Backend: `scout_assistant_service.py` | Small |
| 2 | Update greeting (empty message) + empty state copy | Backend + Frontend: same file + `ScoutSidePanel.tsx` | Small |
| 3 | Rewrite suggestion chips | Frontend: `scout-knowledge.ts` | Small |
| 4 | Rotate loading messages | Frontend: `ScoutSidePanel.tsx` | Small |
| 5 | Add error recovery lines | Backend + Frontend: `scout_assistant_service.py` + `useScoutChat.ts` | Small |
| 6 | Post-navigation toast | Frontend: `ScoutSidePanel.tsx` | Small |
| 7 | (Covered in 1 - current_page already in prompt) | - | - |
| 8 | Context-aware suggestion chips | Frontend: `scout-knowledge.ts` + `ScoutSidePanel.tsx` | Medium |
| 9 | Align search-help prompts with Scout voice | Backend: `scout_assistant_service.py` | Medium |

---

## 1. System Prompt - "Conversational Teammate" Persona

**File:** `backend/app/services/scout_assistant_service.py`

**Function:** `_build_system_prompt(user_name, tier, credits, max_credits, current_page)`

**What to do:**

- Replace the current personality/instructions block (from "You are Scout, Offerloop's friendly product assistant…" through "CRITICAL INSTRUCTIONS") with the spec’s conversational persona text.
- **Keep:** Product name as **Offerloop** (spec says Molt Bolt).
- **Keep:** Existing technical blocks so the API contract and parsing still work:
  - `USER CONTEXT:` (name, plan, credits, current_page)
  - The `{knowledge}` block (from `_build_knowledge_prompt()`)
  - `AVAILABLE ROUTES FOR NAVIGATION:` and `{routes_list}`
  - `AUTO-POPULATE INSTRUCTIONS` (contact/firm examples and rules)
  - `RESPONSE FORMAT` (JSON with `message`, `navigate_to`, `action_buttons`, `auto_populate`)
- **Merge:** Add explicit instruction that when suggesting navigation, the model must still populate `navigate_to` (and optionally `action_buttons`, `auto_populate`) in the JSON - the new “offer, don’t command” wording is about the *message* text, not removing the fields.

**Result:** One updated system prompt: persona + context + knowledge + routes + auto-populate + JSON format.

---

## 2. Greeting + Empty State Copy

**2a. Greeting (when user sends empty message)**

**File:** `backend/app/services/scout_assistant_service.py`

**Where:** In `handle_chat()`, the `if not message:` branch that returns `ScoutAssistantResponse(...)`.

**Current:**
```text
message=f"Hi{', ' + user_name if user_name != 'there' else ''}! I'm Scout, your Offerloop assistant. Ask me anything about the platform!"
```

**New:**
```text
message=f"Hey{', ' + user_name if user_name != 'there' else ''}! I'm Scout - I know the platform inside and out. What are you trying to do right now?"
```

**2b. Empty state placeholder (UI, before any messages)**

**File:** `connect-grow-hire/src/components/ScoutSidePanel.tsx`

**Where:** Inside the empty state block, the Scout bubble text (around line 394).

**Current:** `Ask me anything about Offerloop.`

**New (spec recommendation - Option B):** `Need help finding people, companies, or something else?`

(Optional: make this configurable or A/B test Options A/C later.)

---

## 3. Suggestion Chips

**File:** `connect-grow-hire/src/data/scout-knowledge.ts`

**Constant:** `SUGGESTED_QUESTIONS`

**Current:**
```ts
export const SUGGESTED_QUESTIONS = [
  "How do I find contacts?",
  "What does each plan include?",
  "How do I connect my Gmail?",
  "How do credits work?"
] as const;
```

**New:**
```ts
export const SUGGESTED_QUESTIONS = [
  "I want to find people to reach out to",
  "What do I get on each plan?",
  "Help me set up my Gmail",
  "What's the deal with credits?"
] as const;
```

No API or type changes; only copy. Used by `ScoutSidePanel.tsx` and `ScoutPage.tsx`.

---

## 4. Loading Messages (Rotate)

**File:** `connect-grow-hire/src/components/ScoutSidePanel.tsx`

**Where:** The loading indicator that currently shows "Thinking..." (around line 503).

**Implementation:**

- Define a small array at the top of the file (or in a shared constants file if you prefer):

  ```ts
  const SCOUT_LOADING_MESSAGES = [
    "One sec…",
    "Looking that up…",
    "Let me check…",
    "On it…",
  ];
  ```

- When rendering the loading state, pick one at random, e.g.:

  ```ts
  SCOUT_LOADING_MESSAGES[Math.floor(Math.random() * SCOUT_LOADING_MESSAGES.length)]
  ```

- Use that string instead of the hardcoded `"Thinking..."`.

**Note:** Random each time is enough; no need to avoid repeating on consecutive loads.

---

## 5. Error Recovery Lines

**5a. Backend (timeout + generic exception)**

**File:** `backend/app/services/scout_assistant_service.py`

**Where:**

- Timeout: the `except asyncio.TimeoutError` block that returns "I'm taking too long to think! Could you try asking that again?"
- Generic exception: the `except Exception` block that returns "I'm having a moment! Could you try asking that again?"

**Implementation:**

- Add a small list of recovery lines, e.g.:

  ```python
  _ERROR_RECOVERY_LINES = [
      "Try again in a sec?",
      "Want to try rephrasing that?",
      "Give it another shot - I should be back.",
  ]
  ```

- When returning these error responses, append a random recovery line to the message (e.g. `message = base_message + " " + random.choice(_ERROR_RECOVERY_LINES)`).

**5b. Frontend (network/API errors)**

**File:** `connect-grow-hire/src/hooks/useScoutChat.ts`

**Where:** The `catch` block that adds an assistant message: "I ran into an issue, but I'm here to help! What would you like to know about Offerloop?"

**Optional:** Add a recovery line there too, e.g. "Try again in a sec?" so frontend errors feel consistent with backend errors. Low priority if we want to ship 1–7 first.

---

## 6. Post-Navigation Confirmation (Toast)

**File:** `connect-grow-hire/src/components/ScoutSidePanel.tsx`

**Where:** `handleNavigate(route, autoPopulate)` - after storing auto-populate (if any), calling `navigate(route)`, and `closePanel()`.

**Implementation:**

- Import toast: `import { toast } from "@/hooks/use-toast";`
- Build a short route → display name map (or reuse `PAGES` from `@/data/scout-knowledge` by route). For example: `/contact-search` → "Contact Search", `/firm-search` → "Firm Search", etc. Use the existing `PAGES` object and `getPageByRoute(route)` (or a simple `routeToPageName` map) to get the label.
- After `navigate(route)` (and before or after `closePanel()`), call:

  ```ts
  toast({
    title: `Taking you to ${pageName}`,
    description: "Let me know if you need help once you're there.",
  });
  ```

- Handle unknown routes with a fallback label (e.g. "that page") so the toast never shows a raw path.

**Result:** User sees a brief confirmation toast when they click "Take me there", and the conversation doesn’t just “end” with no feedback.

---

## 7. current_page in Prompt

Already covered in **Step 1**: the new system prompt in the spec includes “Context awareness” and “You receive the user’s current page as current_page”. Our `_build_system_prompt` already injects `current_page` in USER CONTEXT. No separate change needed beyond adopting the spec’s wording for how to use it (offer, don’t command; reference page when relevant).

---

## 8. Context-Aware Suggestion Chips (Optional / Follow-up)

**Files:** `connect-grow-hire/src/data/scout-knowledge.ts`, `connect-grow-hire/src/components/ScoutSidePanel.tsx`

**Idea:** When the user is on a specific page (e.g. Contact Search, Firm Search, Job Board), show 2–4 chips tailored to that page; otherwise show the default `SUGGESTED_QUESTIONS`.

**Implementation outline:**

- In `scout-knowledge.ts`, add something like:

  ```ts
  export const SCOUT_CHIPS_BY_PAGE: Record<string, readonly string[]> = {
    "/contact-search": ["Help me narrow my search", "What filters work best?"],
    "/firm-search": ["How do I find firms in my industry?", "What info do firm profiles show?"],
    "/job-board": ["Find contacts at these companies", "How do I prep for a role?"],
  };
  ```

- In `ScoutSidePanel.tsx`, when rendering the suggestion chips:
  - Get `currentPage` from `location.pathname` (or existing page context).
  - If `SCOUT_CHIPS_BY_PAGE[currentPage]` exists and has length > 0, use it; otherwise use `SUGGESTED_QUESTIONS`.
- **Fallback:** Always use `SUGGESTED_QUESTIONS` for any route not in the map so the chip tray is never empty.

**Effort:** Medium (mapping routes, testing a few pages).

---

## 9. Search-Help Prompts Alignment (Optional / Follow-up)

**File:** `backend/app/services/scout_assistant_service.py`

**Functions:** `_handle_contact_search_help`, `_handle_firm_search_help`

**What to do:**

- **Contact search help:** Update the system prompt and any fallback message so the tone matches the spec:
  - Acknowledge the miss, then suggest alternatives, then offer to help.
  - Example pattern: “That combo didn’t return anything - here’s what I’d try next: [alternatives]. Want me to adjust the search for you?”
  - Keep the same JSON response shape (`message`, `suggestions`, `auto_populate`, etc.) and the same company/title logic; only change the wording instructions and the fallback `message` strings.

- **Firm search help:** Same idea:
  - “I couldn’t find a match for that. A few things that might help: [alternatives]. Want to try a different angle?”
  - Keep response structure; align voice with the main Scout and with contact search help.

**Effort:** Medium (two prompt blocks + fallback messages, plus a quick test for 0-results flows).

---

## Implementation Order (Recommended)

1. **Backend prompt + greeting + errors (1, 2a, 5a)**  
   Single file: `scout_assistant_service.py`. Deploy and test assistant chat and error paths.

2. **Frontend copy + loading + toast (2b, 3, 4, 6)**  
   `scout-knowledge.ts` (chips), `ScoutSidePanel.tsx` (empty state, loading, toast). Test panel open, empty state, send message, loading state, and “Take me there” toast.

3. **Frontend error recovery (5b)**  
   Optional: update `useScoutChat.ts` so network errors also get a recovery line.

4. **Optional: context-aware chips (8)**  
   After 1–3 are stable.

5. **Optional: search-help alignment (9)**  
   After 1–3 (and optionally 8) are done.

---

## Things to Watch (from spec)

- **“Good question” syndrome:** If the model starts every reply with the same phrase, soften or remove the acknowledgment examples in the prompt and say only “briefly acknowledge the ask before answering - vary your phrasing.”
- **Over-personalization:** Use the user’s name at most once per conversation (e.g. in the greeting).
- **Context cramming:** Only reference `current_page` when it genuinely changes the answer.
- **Chip fallback:** For context-aware chips, always fall back to `SUGGESTED_QUESTIONS` so the chip tray is never empty.

---

## Files Touched (Checklist)

| File | Changes |
|------|--------|
| `backend/app/services/scout_assistant_service.py` | System prompt, empty-message greeting, timeout/exception messages + recovery, (optional) search-help prompts |
| `connect-grow-hire/src/data/scout-knowledge.ts` | `SUGGESTED_QUESTIONS` rewrite; (optional) `SCOUT_CHIPS_BY_PAGE` |
| `connect-grow-hire/src/components/ScoutSidePanel.tsx` | Empty state copy, loading message rotation, route→name map + toast in `handleNavigate`; (optional) context-aware chips |
| `connect-grow-hire/src/hooks/useScoutChat.ts` | (Optional) error message + recovery line in catch block |

No new API contracts; no database or config changes. All changes are copy, prompt text, and small UI/UX logic.
