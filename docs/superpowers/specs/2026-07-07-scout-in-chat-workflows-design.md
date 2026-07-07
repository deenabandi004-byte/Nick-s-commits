# Scout in-chat workflow execution: meeting prep in the chat

Date: 2026-07-07
Status: approved (Nick), implementing on perf/speed-optimization

## Goal

Scout workflows execute inside the side panel chat and report their results
there, with a single navigate button underneath the result for the user who
wants the full page view. Meeting prep is the workflow being added; the
existing execute workflows (contact search, draft outreach, job search,
auto-apply) get a consistency pass against the same pattern:

    execute in chat -> result in chat -> navigate chip underneath

Example: "I have a call with Veronica Wittig, prep me for the call" ->
Scout resolves Veronica in the user's saved network, runs the real meeting
prep job with her stored LinkedIn URL, shows progress in the chat, and when
it completes posts the result in the chat with the PDF link right there
plus a View PDF button that lands on the Meeting Prep page.

## Backend

### New execute tool: run_meeting_prep (scout/prep_actions.py + scout/tools.py)

- Input: `contact_name` (required), optional `linkedin_url` (used when the
  user pasted one; skips contact resolution).
- Resolution: case-insensitive substring match against
  users/{uid}/contacts (same matching style as outreach_actions). Uses the
  contact's stored LinkedIn URL. Not found or no LinkedIn on file ->
  structured error code (CONTACT_NOT_FOUND / NO_LINKEDIN) so the model asks
  once for the URL (one clarify per missing fact).
- Guards, in order, mirroring the HTTP route create_coffee_chat_prep:
  PDL outage flag, tier limit via can_access_feature, resume/profile
  presence, atomic 30-credit deduction (config COFFEE_CHAT_CREDITS is 30;
  the 15 in CLAUDE.md is stale).
  Failures return structured codes (INSUFFICIENT_CREDITS, LIMIT_REACHED,
  NEEDS_RESUME, PDL_OUTAGE) the model reports honestly.
- Execution: creates the prep doc in users/{uid}/coffee-chat-preps and
  spawns process_coffee_chat_prep_background, exactly like the route.
  Returns {started: true, prep_id, contact_name, credits_charged}
  immediately. The job itself refunds credits on failure (existing
  behavior).
- Dedup shared logic: extract the guard + doc-create + thread-spawn body
  into a service function both the route and the tool call
  (app/services/coffee_chat_prep_start.py) so the two paths cannot drift.
- Consent per product rule 2: an explicit ask ("prep me for my call with
  X") IS consent; the tool runs immediately in DO mode, no approve card.

### Response envelope: prep_job

_enrich_prep_report in scout_assistant_service (mirror of
_enrich_draft_report): when this turn's helper results contain a
successful run_meeting_prep, stamp result["prep_job"] =
{prep_id, contact_name} deterministically so the frontend can poll,
regardless of model verbosity. Flows through both the SSE done event and
the non-streaming response unchanged. Mark workflow_state_touched so the
turn is never cached.

### Prompt guidance

- New EXECUTE ACTION block for run_meeting_prep: when the user asks to be
  prepped for a meeting/call/coffee chat with a NAMED person, call
  run_meeting_prep with that name; only ask for a LinkedIn URL after a
  CONTACT_NOT_FOUND/NO_LINKEDIN result. Costs 15 credits; say so naturally.
  After a started result, the answer says the prep is running and takes
  about a minute; never claim it is ready.
- Update the existing clarify rule (which today always asks for the URL)
  to reflect contact resolution.
- Tier A router rule (a) (pasted LinkedIn URL -> navigate
  /coffee-chat-prep) stays; a bare pasted URL keeps the page flow.

## Frontend

### Polling + result message (useScoutChat.ts + ScoutSidePanel.tsx)

- ChatMessage gains prepJob?: {prep_id, contact_name}. The done/fallback
  handlers copy data.prep_job onto the message.
- A polling effect in useScoutChat watches for an unresolved prepJob:
  polls apiService.getCoffeeChatPrepStatus every 4s, up to 5 minutes.
  Stage labels (already in the status doc: stageLabel, progressPct) render
  as a live progress line on that message (reusing the tool-event pill
  style).
- On completion, append a synthetic assistant message: short digest built
  from the finished prep (2-3 coffeeQuestions + a similarity hook when
  present), a [View the PDF](pdfUrl) link, and cta
  {label: "View PDF", route: "/coffee-chat-prep?prepId=<id>"}.
- On failure: honest failure message including that credits were refunded.
  On poll timeout: say it is still running and point to the Meeting Prep
  page.
- Poller is keyed by prep_id and survives route changes within the SPA
  (panel state lives above routes); a page reload drops it, acceptable v1.

### Meeting Prep page deep link (CoffeeChatPrepPage.tsx)

- Read ?prepId= on mount / param change; when present, open the library
  tab and select that prep (existing library selection path) so the PDF
  is immediately viewable.

## Consistency pass (existing workflows)

- draft_outreach_emails: already conforms (Gmail links + Inbox chip). No
  change.
- Contact search celebration (SCOUT_SEARCH_COMPLETED_EVENT): verify the
  synthetic message carries a navigate chip (My Network / results page);
  add if missing.
- find_jobs / auto_apply: verify prompt-mandated cta to /job-board (with
  prefill.query) and /applications respectively; tighten tool descriptions
  if the chip is not reliably attached.

## Testing

- backend/tests/test_scout_prep_actions.py: guard order, credit deduction
  called before thread spawn, contact resolution (found / not found / no
  linkedin), structured error codes, uid required (AUTH_REQUIRED).
- Behavior probe: handle_chat("prep me for my call with Veronica Wittig")
  with prep_actions patched -> asserts run_meeting_prep called with the
  name, answer mode do, prep_job stamped on the result.
- Existing deterministic scout suites must stay green.

## Out of scope

- Sending email from chat, rich contact/job cards, briefing path grounding
  (tracked as open threads in docs/scout-context.md).
- Rendering the PDF inline in the panel (the chat shows the link + digest;
  the page shows the PDF).
