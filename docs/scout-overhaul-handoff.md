# Scout Overhaul - Session Handoff

Context for a fresh Claude Code session continuing the Scout rebuild. Read this
top to bottom before touching anything.

---

## 1. What this project is

A multi-phase rebuild of "Scout," Offerloop's in-app AI assistant. The repo had
**two** Scout backends that drifted apart:

- **Scout Assistant** (`backend/app/services/scout_assistant_service.py`, routes
  `/api/scout-assistant/*`) - the LIVE one. The panel runs on it. This is the
  one we build into.
- **Scout Chat** (`backend/app/services/scout_service.py`, 3,605 lines, routes
  `/api/scout/*`) - DEAD code, no live frontend entry point. Deleted in Phase 3.

Goal state: one Scout. The user types, Scout answers each turn by calling
exactly one tool - `navigate` (propose taking the user to a page with form
fields pre-filled), `answer` (reply in chat), or `clarify` (ask one follow-up).
A navigate becomes a "plan" the user approves; Scout never spends credits or
triggers workflows itself.

---

## 2. Key decisions already made (do not relitigate)

- **Build into `scout_assistant_service.py`; delete `scout_service.py`** in Phase 3.
- **Scout runs on the OpenAI API, model `gpt-4.1-mini`.** NOT Anthropic. There
  is no `CLAUDE_API_KEY` in the local `.env`, which made Anthropic untestable
  locally. OpenAI does automatic prompt-prefix caching, so the static-first
  prompt still earns the cache discount. Do not reintroduce the Claude path.
- **Tool schema**: `navigate` / `answer` / `clarify`, OpenAI function-calling
  format, `tool_choice="required"` + `parallel_tool_calls=false` (exactly one
  tool per turn).
- **Plan-then-approve flow** with three frontend rules (see section 5).
- **sessionStorage bridge** redesigned to `{ route, prefill, expires_at }`,
  route-keyed, 30s expiry, consume-on-read.
- **Credit rule (Phase 3, not yet implemented)**: charge 5 credits when the
  terminal tool is `answer` or `navigate`; do not charge for `clarify` or when
  no LLM call happened; one charge per turn; charge after the response is built.

---

## 3. Phase status

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Static-first prompt + prompt caching | DONE |
| Phase 2 | PAGE_REGISTRY + tool schema + approve flow + frontend | Backend DONE, frontend IN PROGRESS |
| Phase 3 | Port Scout Chat capabilities, delete `scout_service.py` | NOT STARTED (parked, gated on Phase 2) |

---

## 4. What is done

**Backend (all verified):**
- `scout_assistant_service.py` cut over to OpenAI tool-calling. `handle_chat`
  and `handle_chat_stream` (a thin shim) emit the new response shape. Model is
  `gpt-4.1-mini`.
- `backend/app/services/scout/page_registry.py` (new) - `PAGE_REGISTRY` (23
  routes), `get_page`, `valid_routes`, `build_pages_prompt_section`. The prompt's
  pages section is generated from this. Each entry has `route`, `purpose`,
  `inputs`, `required_inputs`, `send_user_here_when`, `credit_cost`,
  `tier_required`.
- `backend/app/services/scout/tools.py` (new) - the 3-tool schema +
  `to_openai_tools()`.
- `backend/wsgi.py` - fixed: it imported `events.py` and `company_contexts.py`
  which do not exist on this branch (they are WIP on
  `feat/personalization-phase-1-2`). Those two imports + registrations were
  removed. Re-add them when that branch merges.
- Bug fixes: navigate response now carries the `credit_cost` integer; a navigate
  with a missing required field and `user_was_imperative=false` is converted to
  a natural-language `clarify` in `_build_tool_response`.
- `backend/tests/test_scout_assistant_cutover.py` (new) - 10 integration tests
  hitting the real route with real `gpt-4.1-mini` calls. Last run: 10/10 pass.

**Backend - KNOWN DEBT (not done):**
- `scout_assistant_service.py` still contains the OLD methods as DEAD,
  unreferenced code: `_call_llm_json`, `_call_with_tools`, `_stream_llm`,
  `_classify_metadata`, `_execute_tool`, `_tool_*`, `_get_tools_for_intent`,
  `_preload_contacts`, `_fetch_research_context`, old `SCOUT_TOOLS`,
  `_detect_intent`, `_INTENT_PATTERNS`, `_detect_route_from_query`,
  `_build_cached_system_blocks`, `_log_cache_usage`, the `ScoutAssistantResponse`
  dataclass. They are never called. They must be deleted (the user wants
  "delete, not bypass"). Pending.
- `backend/app/routes/scout_assistant.py` error fallbacks still return the old
  response shape. Minor; fix when convenient.

**Frontend (verified by typecheck + code review, NOT yet browser-tested):**
- `connect-grow-hire/src/lib/scoutBridge.ts` (new) - `writeScoutPrefill`,
  `readScoutPrefill`, `SCOUT_PREFILL_EVENT`. `{route, prefill, expires_at}`,
  30s window, consume-on-read.
- `connect-grow-hire/src/components/ScoutApproveCard.tsx` (new) - reasoning +
  route badge + credit-cost pill + editable prefill chips + Approve button.
- `connect-grow-hire/src/components/ScoutSidePanel.tsx` (rewritten) - consumes
  `{tool, message, navigate}`, the three-rule `decideNavAction`, auto-runs
  skip-approve and in-place navigates, renders `ScoutApproveCard`, wired to the
  bridge + toast. Search-help mode kept intact. STILL the old right-side drawer
  styling (floating restyle deferred).
- `connect-grow-hire/src/hooks/useScoutChat.ts` (rewritten) - new `ChatMessage`
  with `tool` + `navigate`; `ScoutNavigate` type; both response handlers read
  the new shape.
- `connect-grow-hire/src/pages/ContactSearchPage.tsx` and `FirmSearchPage.tsx` -
  migrated to read the new bridge via `readScoutPrefill`. They also still read
  the legacy `scout_auto_populate` key, which the failed-search recovery feature
  ("search help") still uses.

---

## 5. The contract (so you do not have to re-derive it)

Backend response from `/api/scout-assistant/chat`:
```json
{ "tool": "navigate" | "answer" | "clarify", "message": "string", "navigate": {...} | null }
```
The `navigate` object: `route`, `prefill` (Record<string,string>), `reasoning`,
`confidence` (0-1), `user_was_imperative` (bool), `credit_spending` (bool),
`credit_cost` (int | null), `missing_required` (string[]), `already_on_page` (bool).

Frontend three-rule decision (`decideNavAction` in `ScoutSidePanel.tsx`):
1. `already_on_page` -> **in-place**: write bridge, dispatch `SCOUT_PREFILL_EVENT`,
   toast, no navigation.
2. `user_was_imperative && confidence >= 0.9 && !credit_spending` ->
   **skip-approve**: write bridge, navigate, toast.
3. else -> **approve-card**: render `ScoutApproveCard`; on approve, write bridge
   + navigate.

---

## 6. What is left to do (in order)

1. **Six-page bridge fan-out.** Add a `readScoutPrefill(route)` reader (on mount
   + on `SCOUT_PREFILL_EVENT`) to each, mapping the registry `inputs` to that
   page's form fields:
   - `MeetingPrepPage.tsx` - inputs: `linkedin_url`
   - `InterviewPrepPage.tsx` - inputs: `company`, `job_title`, `job_url`
   - `CoverLetterPage.tsx` - inputs: `company`, `job_title`, `job_url`
   - `RecruiterSpreadsheetPage.tsx` - inputs: `company`, `job_title`, `location`, `job_url`
   - `JobBoardPage.tsx` - inputs: `query`
   - `NetworkTracker.tsx` (the `/outbox` page) - inputs: `query`
   The user wants a checkpoint before this fan-out; it should now be approved.
2. **Floating restyle of `ScoutSidePanel`** - bottom-right floating panel,
   collapsible to a button. Currently it is the old right-side drawer. OPEN
   DECISION: do this before or after the fan-out. It overlaps the existing
   header "Ask Scout" button - a UX wrinkle to resolve deliberately.
3. **Part C browser verification** - `docs/scout-phase2-frontend-checklist.md`.
   Needs the dev servers + an authenticated session.
4. **Backend dead-code deletion** (section 4 debt).
5. **Phase 3** - inventory `scout_service.py` (PORT-AS-TOOL: `parse_job_url`,
   `search_jobs`; KEEP-AS-STANDALONE: fit analysis; DELETE the rest), implement
   the credit rule, delete `scout_service.py` + its routes + the 6 dead frontend
   files (`ScoutChatbot.tsx`, `ScoutBubble.tsx`, `ScoutHelperChatbot.tsx`,
   `ScoutFirmAssistant.tsx`, `ScoutFirmAssistantButton.tsx`, `ScoutPage.tsx`).
   The `/api/scout/generate-edited-resume` orphan is in `application_lab.py`,
   NOT `scout_service.py`, so deleting `scout_service.py` does not break fit
   analysis.

---

## 7. Open flags

- **Floating restyle**: deferred; decision pending (before/after the fan-out).
- **Search help on legacy channel**: failed-search recovery still writes
  `scout_auto_populate`. ContactSearch/FirmSearch read both keys. Deliberate, to
  avoid destabilizing that feature mid-refactor. Unifying it is a clean follow-up.
- **`ScoutPage.tsx`** currently fails `tsc` (uses the old `ChatMessage` shape).
  It is dead, unrouted code, deleted in Phase 3. Harmless until then.
- **wsgi.py** `events.py` / `company_contexts.py`: belong to the personalization
  feature, re-add when `feat/personalization-phase-1-2` merges.

---

## 8. How to test / run

- The Python venv with deps: `.venv/bin/python` at the repo root.
- Backend integration tests:
  `cd backend && ../.venv/bin/python -m pytest tests/test_scout_assistant_cutover.py -v`
  (real OpenAI calls; `OPENAI_API_KEY` is in `.env`; `CLAUDE_API_KEY` is NOT,
  and that is intentional).
- Frontend typecheck: `cd connect-grow-hire && npx tsc --noEmit`. There are ~293
  pre-existing `noUnusedLocals` errors across the codebase; they are noise. The
  project ships via `vite build`, which does not typecheck. Judge your changes
  by whether they add NEW errors in files you touched.

---

## 9. Constraints and working style

- **No em dashes** (Unicode U+2014) anywhere - code, comments, commits, PRs, UI
  copy, LLM prompts. Use commas, colons, parens, or a spaced hyphen.
- **No Sparkles icon** in the UI.
- App-interior color: cool-slate neutral, brand blue `#3B82F6` the only accent;
  prefer `--c-*` tokens from `connect-grow-hire/src/index.css`.
- Scout uses OpenAI `gpt-4.1-mini`. Never reintroduce Anthropic for Scout.
- Git: push to `origin` (personal repo), never `upstream`.
- Work decisively; prefer free-form questions over multiple-choice; no closing
  ceremony, deliver and stop.
- Ship phases one PR each, stop and show results after each phase, do not chain.

---

## 10. For the Claude picking this up

Read sections 1-9 above. Then **confirm you understand** by restating, briefly:
(a) which phase is active and what is done vs. not done,
(b) the immediate next task and the open decision attached to it,
(c) the non-negotiable constraints (model, no em dashes, delete-not-bypass).

Do not make any code changes until you have confirmed understanding and the
user has given an explicit go.
