# Scout Backend Handoff (for the mobile app backend)

**Audience:** Ryan — mobile app backend.
**Written:** 2026-07-09, against branch `perf/speed-optimization` (Scout backend fully committed as of `f0fea59`).
**Why this exists:** the web Scout backend went through ~24 commits of fixes on July 6–8 and now behaves well. This doc explains how it works end to end so the mobile Scout can match it. Where the mobile app differs (no cover letter, no resume tools, conversations live in your inbox model), those parts are flagged **[MOBILE: N/A]** or **[MOBILE: REMAP]**.

**Code locations (this repo):**

| Concern | File |
|---|---|
| HTTP endpoints | `backend/app/routes/scout_assistant.py` (~1070 lines) |
| Orchestrator (turn loop, prompts, enrichers) | `backend/app/services/scout_assistant_service.py` (~3200 lines) |
| Tool schemas + consent gates + dispatch | `backend/app/services/scout/tools.py` |
| Pre-LLM regex router (Tier A) | `backend/app/services/scout/router.py` |
| Semantic cache (Tier B) | `backend/app/services/scout/cache.py` |
| Web page/route registry | `backend/app/services/scout/page_registry.py` |
| Read-only product-state wrappers | `backend/app/services/scout/workflow_state.py` |
| Strategy (multi-step plan) memory | `backend/app/services/scout/strategy.py` |
| Execute actions (credits deducted here) | `backend/app/services/scout/{contact,company,outreach,prep,job}_actions.py` |
| Conversation persistence | `backend/app/services/scout/chat_persistence.py` |
| Per-turn metrics | `backend/app/services/scout/metrics.py` |
| Tests | `backend/tests/test_scout_*.py` |

---

## 1. The big idea

Scout is a **one-tool-per-turn** tool-calling loop. Every turn ends with the model calling exactly one **terminal tool**:

- `navigate` — propose a page + prefill (a *plan*, user approves; the destination page runs the action)
- `answer` — reply in chat, optionally with one CTA chip
- `clarify` — ask exactly one short follow-up question

Before the terminal tool, the model may call **helper tools** mid-turn (max 4 steps total): read tools (pipeline status, recent searches, applications, loops) and **execute tools** that actually run product actions *in the chat* (find contacts, discover companies, draft outreach emails, find hiring managers, meeting prep, auto-apply, cover letter, resume tailor).

The July 6–8 work moved Scout from "navigate everywhere" to "execute in chat" — that shift plus a set of guardrails (section 6) is what made it start behaving. If mobile Scout feels dumb, the guardrails section is the most likely gap.

### Turn lifecycle (handle_chat, `scout_assistant_service.py:851`)

1. Empty message → greeting (names the user's active strategy if one exists).
2. Persistence bootstrap: ensure chat doc exists, append the **user** message first, spawn background title generation on first turn.
3. Load history window from Firestore: last **20 messages / 8,000 tokens** max (anonymous users: last 6 client-supplied turns).
4. Kick off the intent classifier concurrently (Claude Haiku, 4s timeout) → `{intent: chat|plan|do|clarify, confidence}`. Drives the mode pill only, **not** routing. Failure is fine — mode falls back to the terminal tool.
5. **Tier A — regex router** (`router.py:225`): two live rules resolve with no LLM call: pasted LinkedIn URL → meeting prep; explicit "open <page>" → route alias.
6. **Tier B — semantic cache** (`cache.py`): one `text-embedding-3-small` embedding; cosine ≥ 0.92 against cached navigate/answer plans serves without the LLM.
7. Prompt assembly: static system prompt (byte-identical for prefix caching) + dynamic per-user context + per-turn live tail (date, current page, tier, credits).
8. Tool loop (`_call_scout_tools`, `:1409`): `tool_choice="required"`, `parallel_tool_calls=False`, max 4 steps; final step offers terminal tools only so the turn always ends.
9. Response assembly (`_build_tool_response`, `:1659`) then **deterministic chip enrichers** (section 7).
10. Cache promotion, assistant-message persistence, metrics logging.
11. Any exception anywhere → friendly answer, HTTP 200, not persisted. **The route never returns an error status for a chat turn.**

---

## 2. HTTP API

Blueprint: `url_prefix="/api/scout-assistant"`, registered in `wsgi.py`. Auth: `Authorization: Bearer <firebase-id-token>` on everything except `/health`. **No rate limiting on these routes.**

| Method | Path | Purpose |
|---|---|---|
| POST | `/chat` | Main chat turn — single JSON response. **Recommended surface.** |
| POST | `/chat/stream` | Same turn over SSE. Marked for retirement; does NOT token-stream the answer. |
| POST | `/briefing/stream` | Daily briefing, real token streaming (gpt-4.1-mini). |
| POST | `/search-help` | Suggestions after a failed contact/firm search. |
| GET | `/chats?limit=20` | List chats (limit clamped 1–50). **Free tier gets at most 1 chat back.** |
| GET | `/chats/<chat_id>` | One chat + messages. **Never 404s** — missing chat returns 200 with nulls. |
| GET | `/health` | Public liveness. |
| GET | `/api/admin/scout-assistant/metrics` | Last-24h cost/latency; uid must be in `ADMIN_UIDS` env. |

### Request (both `/chat` and `/chat/stream`)

```json
{
  "message": "find me 3 software engineers at Spotify",     // capped 2000 chars
  "conversation_history": [{"role": "user", "content": "..."}],  // optional; server history wins for signed-in users
  "current_page": "/find",                                   // default "/home"
  "chat_id": "abc123",                                       // omit/null to start a new chat
  "user_memory": {},                                          // optional client signals
  "user_info": {"name": "John", "subscriptionTier": "pro", "credits": 150, "max_credits": 3000}
}
```

- Tier precedence: `user_info.subscriptionTier` → `user_info.tier` → `"free"`. For list/retention, tier is **re-read from the user doc**, never trusted from the client.
- Echo back the returned `chat_id` on every subsequent turn; omit it to start fresh.

### Response (single JSON on `/chat`; the `done` event payload on `/chat/stream`)

```json
{
  "tool": "answer",            // "answer" | "navigate" | "clarify"
  "message": "Here are 3 engineers at Spotify…",
  "navigate": null,            // navigate object when tool == "navigate" (route, prefill, auto_submit, credit_cost…)
  "mode": "do",                // chat | plan | do | clarify (mode pill)
  "intent": {"intent": "do", "confidence": 0.9, "reason": "…"},
  "cta": {"label": "View in My Network", "route": "/my-network/people", "prefill": {}, "credit_spending": false, "credit_cost": null},
  "ctas": [ /* present on draft turns: [Inbox chip, My Network chip] */ ],
  "plan": null,                // active-strategy checklist when a strategy was written this turn
  "chat_id": "abc123"
}
```

**Do not trust the endpoint docstrings** — fields like `action_buttons`, `contacts_results`, `navigate_to` appear only in stale docstrings and the error fallback, never on the live success path.

**Tool results are not returned as structured arrays.** Found contacts, drafted emails, prep status, etc. are woven into `message` (markdown, including `[View draft in Gmail](url)` links) and into the chips. Contacts land in `users/{uid}/contacts` (My Network), companies in `firmSearches`, managers in `recruiters` — the chat narrates, the product collections hold the data. **[MOBILE: REMAP]** — if the mobile app wants structured cards, either parse the persisted `tool_results` on message docs (they're stored, section 8) or add a mobile response variant; don't scrape the markdown.

### SSE events on `/chat/stream`

`mode` → `tool_start` `{id,name,label}` → `tool_end` `{id,name,summary}` → `heartbeat` (every 15s) → `done` (full response object) or `error`. There is **no token streaming of the answer text** on the chat stream (only the briefing stream emits `token` events). Headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no`.

### Stop/cancel

**There is no server-side stop.** The web stop button (commit `f0fea59`) is an `AbortController` in `useScoutChat.ts` — the client stops awaiting, keeps partial text, and the server turn runs to completion (including its Firestore writes). Mobile can do the same: close the connection; nothing else needed.

---

## 3. Credits — Scout chat is FREE

Scout messages cost **zero credits** (route docstring: "This is a FREE feature"). The `credits`/`max_credits` you pass in are informational only; the prompt explicitly forbids Scout from refusing actions over low balance. Credits are deducted **atomically inside each execute action** (same guard sequence as the equivalent web page), with structured error codes and refunds on failure:

| Action | Cost | Deducted in | Failure behavior |
|---|---|---|---|
| `find_contacts` | 5 / contact | MCP `find_contacts.handle` | `INSUFFICIENT_CREDITS` |
| `discover_companies` | 2 / company | `company_actions.py:90` | charged only for actual results |
| `find_hiring_managers` | recruiter cost / manager (default 3, max 5) | `job_actions.py:126` | — |
| `run_meeting_prep` | 30 | `prep_actions.py:143` (before worker spawn) | worker refunds on failure |
| `generate_cover_letter` | 5 | `job_actions.py:299` | **auto-refund** on empty/failed generation |
| `auto_apply_to_job` | inside submit service | Pro/Elite gate first | `TIER_REQUIRED` etc. |
| Everything else (reads, `draft_outreach_emails`, `tailor_resume_to_job`, `get_company_intel`) | free | — | — |

---

## 4. Models & prompts

- **Chat loop:** `SCOUT_MODEL` env, default **`gpt-5-mini`** (upgraded 07-06, commit `5261ae2`).
- **Utility (titles, search-help, resume tailor):** `SCOUT_UTILITY_MODEL`, default `gpt-4.1-mini`.
- **Embeddings:** `text-embedding-3-small`. **Intent classifier:** `claude-haiku-4-5` (Anthropic), only place Anthropic is used.
- **gpt-5 family param quirk** (`_chat_params`, `service:813`): gpt-5 models reject `temperature`/`max_tokens` — use `max_completion_tokens = max_tokens + 600` (reasoning headroom) and pass `reasoning_effort` via **`extra_body`** (the pinned SDK rejects it as a kwarg). Default effort `"minimal"`; override with `SCOUT_REASONING_EFFORT` (`"omit"` drops it). Non-gpt-5 models get plain `{temperature: 0.3, max_tokens: 600}`. **This bit us — copy it exactly or gpt-5-mini calls 400.**
- **System prompt** (`_SCOUT_IDENTITY_AND_BEHAVIOR`, `service:244–527`): identity, one-tool-per-turn discipline, the count-clarify rule, prefill-must-match-reasoning, workflow-state read discipline, strategy memory, CTA-chip-over-prose. Page knowledge is generated from the page registry. Static parts are `@lru_cache`d to stay byte-identical → OpenAI prefix caching. Em dashes are stripped from every model output (house style).
- **Context budget:** 20 messages / 8,000 tokens into the LLM regardless of how long the stored chat is.

---

## 5. Tool inventory

### Terminal (exactly one ends every turn)
`navigate`, `answer`, `clarify` — see section 1.

### Read helpers (free, read-only, never write)
`get_outbox_status`, `get_recent_searches`, `get_recent_cover_letters`, `get_meeting_prep_drafts`, `get_recent_firm_searches`, `get_applications_status`, `get_loops_status`, `parse_job_url` (Firecrawl job-posting extract), `find_jobs` (Firestore `jobs` + auto-apply eligibility). All return compact <2KB envelopes with empty-shape fallbacks when the DB is down. `workflow_state.py` stores nothing — product pages remain source of truth.

### Strategy
`save_strategy`, `update_strategy_progress` — persist a multi-step plan in a separate store; the chat doc carries only `active_strategy_id`.

### Execute helpers (the in-chat actions)

| Tool | Wraps | Gate |
|---|---|---|
| `find_contacts` | PDL search via MCP handler; saves to My Network | **count required** in the current user message |
| `get_company_intel` | Perplexity/PDL company overview + alumni density | none |
| `discover_companies` | `company_search.search_firms`; saves to `firmSearches` | count required |
| `draft_outreach_emails` | `reply_generation.batch_generate_emails` + Gmail draft creation, attaches draft to contact | draft keywords consent; **Gmail must be connected** (`GMAIL_NOT_CONNECTED`) |
| `find_hiring_managers` | `recruiter_finder`; saves to `recruiters` | HM keywords consent |
| `run_meeting_prep` | spawns the real coffee-chat-prep background worker; returns `prep_id` for polling | prep keywords consent |
| `auto_apply_to_job` | `submit_auto_apply_for_user` (Browserbase) | Pro/Elite; apply keywords; max 3/turn; job_id must come from this chat's `find_jobs` |
| `generate_cover_letter` | `job_board.generate_cover_letter_with_ai` | keywords consent. **[MOBILE: N/A]** |
| `tailor_resume_to_job` | one utility-model JSON call → fit_score/gaps/edits | **[MOBILE: N/A]** |

**[MOBILE: N/A] removal note:** to drop cover letter + resume tailoring, remove the two tools from `HELPER_TOOLS`, their enrichers (`_enrich_cover_letter_report`, `_ensure_cover_letter_prefill`), the broken-promise guard (section 6), and the `/cover-letter` + `/resume` registry entries. Everything else stands alone.

Every action module returns structured `{error, code}` — codes include `AUTH_REQUIRED`, `BAD_REQUEST`, `CONSENT_REQUIRED`, `COUNT_REQUIRED`, `INSUFFICIENT_CREDITS`, `GMAIL_NOT_CONNECTED`, `NEEDS_RESUME`, `NEEDS_JOB_DESCRIPTION`, `PDL_OUTAGE`, `TIER_REQUIRED`, `LIMIT_REACHED`, `INTERNAL`. **Nothing raises.** The model receives the envelope and explains it conversationally.

---

## 6. Guardrails — the part that made Scout behave

These fixed real production bugs. Port all of them; they're cheap and they're the difference between "works" and "fires a 30-credit prep off a one-word reply."

1. **One tool per turn, `tool_choice="required"`, no parallel calls, max 4 steps, terminal-only on the last step.** The turn always ends in navigate/answer/clarify.
2. **Consent gates** (`_user_authorized`, `tools.py:1126`): execute tools require a trigger keyword in recent *user* text OR an affirmative reply to an assistant offer — otherwise `CONSENT_REQUIRED`. Fixed the bug where a bare count answer triggered a draft AND a meeting prep the user never asked for (commit `82be724`).
3. **Count gate** (`COUNT_REQUIRED`): `find_contacts` / `discover_companies` refuse unless the *current* user message contains a count token. The model literally cannot invent a count (commits `1ff0827`, `48e8214`).
4. **Clarify resume is stateless.** There is no pending-workflow document. A clarify answer ("3") works because the transcript is replayed each turn and the prompt says: consume the answer, run the pending find with exactly that count, never re-ask. State machine = conversation history + prompt discipline + hard tool gates.
5. **Names required for specific people** — drafting to a *specific* person requires their name (commit `0debaed`).
6. **Broken-promise guard** (`f0fea59`): if the terminal answer *claims* a cover letter exists/is being generated but `generate_cover_letter` never ran this turn, the loop rejects it once and forces the model to actually run the tool or answer honestly. **[MOBILE: N/A]** for cover letters, but the *pattern* (verify claimed side effects actually happened before letting the answer through) is worth stealing for any execute tool.
7. **Prompt-level query discipline** for job search + intent-based apply consent (commit `b402990`); `find_jobs` survives malformed job docs (`e627807`).
8. **Never error to the client**: turn exceptions → friendly answer, HTTP 200, not persisted. Helper failures → error envelope to the model, which explains it. Firestore/cache/metrics writes are all best-effort.

---

## 7. Chips / CTAs — [MOBILE: REMAP]

Model-authored chips are validated against the page registry (`_sanitize_cta`, `service:1800`) — invalid route or malformed prefill → chip dropped. Then **deterministic enrichers** run in order (`service:1068–1073`) so the right chip appears even when the model forgets:

- **Draft turns** → markdown Gmail links per draft + `ctas: [Open your Inbox (/outbox or /outbox?contact=<id>), View in My Network]`.
- **Find-only turns** → single "View in My Network" chip (replaces any wrong Inbox chip).
- **Per-execute fallbacks**: auto-apply → Applications; find_jobs → Job Board with query prefill; discover_companies → Companies tab; company intel → "Find people at X" (carries `chat_message` so tapping runs the find *in chat*, not navigation — commit `b256f26`); hiring managers → My Network saved managers view (`3fed0e5`); cover letter → workshop chip carrying the full letter; resume tailor → `/resume?tab=tailor` with job URL (`e957583`).
- **Meeting prep** → response carries `prep_job = {prep_id, contact_name}`; client polls prep status and renders the finished packet.

All payloads are **web routes + web prefill field names** from `page_registry.py` (~25 routes, `REGISTRY_VERSION = 5`). For mobile you need an equivalent registry mapping to native screens/deep links; the `credit_cost` / `tier_required` / `required_inputs` metadata on each entry is surface-agnostic and portable. Bumping the registry version invalidates the semantic cache (each cache entry is version-stamped) — keep that coupling if you cache.

---

## 8. Conversation persistence — the part that maps to your inbox model

**Two systems exist. Only one is live.**

### `users/{uid}/scoutChats/{chatId}` — LIVE, backend-owned
- **The backend writes everything via Admin SDK.** There is **no Firestore rule** for `scoutChats` — it falls to default-deny, so clients can't touch it directly. Web reads history only through `GET /chats` / `GET /chats/<id>`. Recommendation: keep the mobile inbox server-mediated the same way.
- **Chat doc fields:** `chat_id` (uuid4 hex = doc id), `title` (default "New chat", background LLM titling ≤60 chars on first turn; trivial "hi"-type messages skip the LLM), `created_at`, `last_active_at`, `message_count`, `active_strategy_id`, `tier_when_created`, `expires_at`.
- **Message docs** (`messages/` subcollection): `message_id`, `role` (`user`|`assistant` only — `system` rejected), `content` (em dashes stripped), `tool_calls`, **`tool_results`** (the helper trail — this is your structured data source for rendering what Scout did), `created_at`, `metrics`, `expires_at`.
- **Write order:** user message persisted **before** the model runs; assistant message after the pipeline completes. No content dedupe on write (a retried append duplicates); the context loader dedupes the just-appended tail so the model doesn't see the current message twice.
- **TTL:** `expires_at = created_at + TTL` — **Free 1 day, Pro/Elite 14 days**; unknown tier fails safe to 1 day. Firestore TTL doesn't cascade, so `expires_at` is mirrored onto every message doc. ⚠️ **The TTL policies are manual console/gcloud setup** (collection groups `scoutChats` and `messages`, field `expires_at`) — if the mobile project has its own Firestore, this must be configured or chats never expire.
- **No delete endpoint, no feedback endpoint.** Chats only expire.
- **Storage vs context are decoupled:** full transcript in Firestore (read cap 200, drops oldest); only the last 20 messages / 8K tokens ride into the LLM.

### `users/{uid}/scoutConversations/…` — LEGACY, do not model against
Old client-writable store (messages as an array field on the doc, plus a rolling `active` doc capped at 60 messages). Only `clearActiveThread` is still called, purely to wipe stale data. It has an owner-scoped Firestore rule because clients used to write it directly — exactly the pattern the redesign moved away from.

### Cross-turn state
There is **no** `pending_action` / `clarify_context` field anywhere. A resumed conversation is fully reconstructable from (a) the ordered message list and (b) the user's active-strategy doc (pointer on the chat: `active_strategy_id`). For your inbox model that means: store ordered turns + the strategy pointer, and you have everything.

---

## 9. Caching & metrics (optional to port, but explains latency)

- **Tier A regex** and **Tier B semantic cache** let repeat intents skip the LLM. Tier B: cosine ≥ 0.92 hit, LRU 1000 entries, write-through to Firestore (`scout_cache_navigate` / `scout_cache_answer`), loaded on boot. **Promotion rule:** a result is only cached after **3 distinct users** produce the same intent within 24h — and never when the turn touched strategy or workflow state (user-specific), and never for navigates with message-specific prefill. This prevents cross-user leakage; if you port the cache, port the promotion rule with it.
- **Metrics:** one Firestore doc per turn in `scout_metrics` (30-day TTL): `served_by` (regex / cache / llm), latency, final tool, token counts, `cost_usd`. Aggregated by the admin endpoint. Best-effort.

---

## 10. What changed July 6–8 (the "why it works now" timeline)

| Commit | What it fixed |
|---|---|
| `4379ed9`, `2bcf4bc` | Page registry rebuilt against the live route table; Find tabs treated as distinct pages |
| `5261ae2` | Chat model → **gpt-5-mini** with per-family param compat |
| `5522544` | Read tools for Applications queues + Loops fleet |
| `3789f1d`, `b402990`, `e627807` | Auto-apply from chat; query discipline + intent-based apply consent; find_jobs robust to bad docs |
| `6be90ee`, `0debaed` | Draft outreach from chat; draft reports link Gmail + exact Inbox conversation; names required |
| `1ff0827`, `48e8214` | Clarify count answers consumed exactly once, run with that exact count |
| `9e4bfd1`, `186bcaa`, `9ca430e` | Job discovery surfaces in chat; real meeting prep from chat; deterministic navigate chip |
| `38e443a`, `a4bfa8b`, `c78f637` | People search, company intel, hiring managers, cover letters, resume tailoring, company discovery all execute in chat |
| `82be724` | **Execute tools refuse workflows the user never asked for** (consent gates) |
| `3fed0e5`, `9ecbc98`, `b256f26`, `e957583` | Chip routing: HM results → My Network saved view; find-only → My Network chip; draft turns → both chips; Find-people chip runs in chat; resume/cover-letter chips carry the job URL |
| `f0fea59` | Client-side stop button (partial text kept); cover-letter broken-promise guard; em-dash sanitizer everywhere |

---

## 11. Tests worth mirroring

`backend/tests/test_scout_chat_persistence.py` pins: tier→TTL mapping, message `expires_at` == parent, role validation, oldest-first reads, last-N windowing, Free-gets-one-chat listing, title cleanup, and the context-window invariants (20-message cap, token cap fires first on huge messages, tail dedupe). Other `test_scout_*` files cover the router, cache promotion, strategy, workflow-state wrappers, and metrics. If you port the guardrails, port these invariants as tests — most of them encode a specific production bug.

---

## 12. Checklist: likely reasons a Scout port misbehaves

1. Missing **consent gates** → clarify answers trigger unrequested actions.
2. Missing **count gate** → model invents contact counts.
3. Allowing **multiple tools per step** or unlimited steps → runaway turns.
4. Trusting the **docstring response shape** instead of `_build_tool_response`.
5. gpt-5-mini called with `temperature`/`max_tokens` → API errors → silent fallback to a worse model.
6. No **deterministic chip enrichers** → users never find what Scout just did.
7. Sending the whole transcript to the LLM instead of the 20-msg/8K window → cost + drift.
8. Not passing `chat_id` back → every turn starts a fresh conversation, clarifies never resolve.
9. Returning non-200s on turn failures → error states in the client instead of a graceful answer.
10. Caching answers without the 3-distinct-users promotion rule → cross-user data leakage.
