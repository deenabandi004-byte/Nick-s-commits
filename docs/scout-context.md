# Context: Scout chat functionality overhaul (Offerloop)

You are continuing an in-progress effort to make Scout (the AI assistant side panel) a genuinely functional agent: it executes workflows from chat, reports results with specifics, and never claims actions it didn't take. Work happens on branch `perf/speed-optimization`. Another terminal may be editing the same files concurrently; before committing shared files, run `git diff` and stage only your own hunks (use `git apply --cached` with a filtered patch when a file carries someone else's uncommitted work). Commit per logical change, no em dashes anywhere in code, comments, or commit messages.

## Architecture map (verified, current as of 2026-07-07)

**Backend brain:** `backend/app/services/scout_assistant_service.py`. Chat loop runs on OpenAI `gpt-5-mini` (env-overridable via `SCOUT_MODEL`; side tasks like chat titles use `SCOUT_UTILITY_MODEL` = gpt-4.1-mini). gpt-5-family params go through `ScoutAssistantService._chat_params`: `max_completion_tokens` with +600 headroom (reasoning tokens count against the cap; without headroom long answers truncate mid tool-call JSON and degrade to a parse fallback) and `reasoning_effort` sent via `extra_body` because the pinned openai SDK 1.54 predates the kwarg. `SCOUT_REASONING_EFFORT=omit` drops the param (needed for gpt-5.4-mini, which rejects it alongside function tools on Chat Completions).

**Turn pipeline:** Tier A regex router (`scout/router.py`) -> Tier B semantic cache (`scout/cache.py`) -> LLM tool loop (max 4 steps, one tool per step, terminal tools: navigate / answer / clarify). A Haiku intent classifier runs concurrently producing do/plan/chat/clarify; it drives the frontend mode pill and the auto-execute decision.

**Page knowledge:** `scout/page_registry.py` is the single source of truth for navigable routes, rebuilt against the live route table (24 entries including /applications, /agent, /upload-list, /integrations, /mcp-server, /resume, /cover-letter, /coffee-chat-prep). The three Find tabs are distinct entries (`/find`, `/find?tab=companies`, `/find?tab=hiring-managers`); `page_identity()` treats path+tab as page identity, and `get_page` prefers exact query-string matches. `REGISTRY_VERSION` bump invalidates the semantic caches; bump it on any registry change.

**Tools** (`scout/tools.py`): read tools (outbox status, recent searches, cover letters, meeting preps, firm searches, `get_applications_status`, `get_loops_status`), plus execute tools:

- `find_jobs`: lean catalog search; fields coerced via `_job_text` because some job docs store company/location as dicts (a dict once killed every lookup with KeyError(slice)).
- `auto_apply_to_job`: shared implementation with the HTTP route via `auto_apply/submit_service.py`; Pro/Elite gated.
- `draft_outreach_emails` (`scout/outreach_actions.py`): reuses the MCP draft path; generates with the user's stored template + resume, creates real Gmail drafts, attaches them to contact docs so the Inbox shows threads; requires Gmail connected; free (search credits already covered drafting).

**Frontend surface:** `ScoutSidePanel.tsx`, `useScoutChat.ts`, `lib/scoutBridge.ts`. The bridge carries prefill across navigation via a sessionStorage envelope keyed by page identity (path + Find tab); consumers: ContactSearchPage (`/find`), FirmSearchPage (`/find?tab=companies`), both job board views (`/job-board` -> search box). Destination pages dispatch `SCOUT_SEARCH_COMPLETED_EVENT` with count + top result names; the panel posts a synthetic "Found N contacts: names..." message with a cta chip. `current_page` sent to the backend includes `?tab=`. Per-page suggestion chips in `data/scout-knowledge.ts` cover every sidebar surface.

## Product rules established (enforce these in any new work)

1. **Never claim an unperformed action.** Answers must not say "I'll open X" or "queued" unless the tool ran and returned success this turn. Draft reports are enforced harness-side (`_enrich_draft_report` appends View-in-Gmail links and the Inbox deep-link cta deterministically because gpt-5-mini under-reports).
2. **Explicit ask = consent.** DO-mode navigations execute immediately (no approve card), credit-spending included; the undo toast is the escape hatch. Auto-apply consent is intent-based: an imperative with a count applies immediately to eligible matches (max 3/turn); exploratory asks list matches and confirm first.
3. **Find vs act.** "Draft emails to them" after a search means THOSE contacts (pass `contact_names`, resolve pronouns); never re-run a search for it. "Find me a job at X" surfaces matches in chat via `find_jobs`; bare navigation to /job-board is only for browsing.
4. **One clarify per missing fact, ever.** A bare-number reply to a count question IS the answer; proceed immediately.
5. **Vocabulary:** the page at route `/outbox` is called the **Inbox** to users. Meeting Prep, not coffee chat. Credit numbers mirror `backend/app/config.py` CREDIT_COSTS exactly.
6. **Chats never start with unrequested output.** The briefing auto-fire was removed; cold open is the greeting + chips. The strategist briefing is opt-in via its button.

## Verification workflow (use it)

- Deterministic tests: `cd backend && FLASK_ENV=testing python3 -m pytest tests/test_scout_router.py tests/test_scout_cache.py tests/test_scout_strategy.py tests/test_scout_workflow_state.py tests/test_scout_action_tools.py -q` (fast, no network).
- Live-LLM suites: `tests/test_scout_assistant_cutover.py tests/test_scout_intent_recognition.py` (hit real OpenAI; a couple of cases flake on model variance, rerun once before diagnosing).
- Behavior probes: call `ScoutAssistantService().handle_chat(message=..., conversation_history=..., uid="probe-user", tier="pro", ...)` directly with `unittest.mock.patch` on tool implementations (e.g. patch `scout.outreach_actions.draft_emails_to_contacts` or `scout.tools._find_jobs`) to replay exact user scenarios and inspect tool/route/prefill/cta/message. **Always pass a uid or the execute tools short-circuit with AUTH_REQUIRED.** Local Firestore is unavailable, so unpatched reads return empty envelopes.
- The user's dev server auto-reloads files: never leave a file in a broken syntax state between edits (it crashed the backend once); run `python3 -c "import ast; ast.parse(open('<file>').read())"` immediately after scripted edits.

## Known open threads (likely next asks)

- Chaining search -> draft in one beat ("find 3 people and email them" currently takes two chat turns).
- Sending from chat (drafts only today; send stays in the Inbox deliberately).
- Rich contact/job cards rendered in the panel instead of text lists.
- Migrating to OpenAI's Responses API would unlock gpt-5.4-mini with reasoning control.
- The briefing/strategist path (`scout/strategist.py`) still builds its own separate prompt; it has not received the grounding passes the chat path got.
- If a scout test fails, check for LLM variance (rerun once) before assuming a regression.

## Recent commit trail

`4379ed9` registry rebuild against live routes; `656eb72` prefill bridge wired into Find pages; `51f3688` tab-aware page context + full chip coverage; `5522544` applications/loops read tools; `5261ae2` gpt-5-mini upgrade + param compat; `2014b63` router prompt carrier; `2bcf4bc` Find-tab page identity + names in celebrations; `3789f1d` auto-apply from chat; `6be90ee` draft outreach from chat; `0debaed` Gmail links + Inbox deep links + names-required; `35c02db` approve card removal for DO mode + visible card; `1ff0827` clarify-loop fix; `9e4bfd1` job discovery surfaces in chat + job board consumes query handoffs.
