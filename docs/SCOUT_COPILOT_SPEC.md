# Scout Copilot + Dashboard Spec — From Chat Sidebar to Agentic Copilot

**Author:** Nick + Claude CEO Review
**Date:** 2026-04-09
**Status:** Draft — ready for co-founder review
**Branch context:** main
**Scope:** Two features — (1) Scout agent backend + frontend integration, (2) Dashboard as new home screen. Both are needed for the copilot experience to work.

---

## 1. What This Is

Scout is Offerloop's AI assistant. Today it's a chat sidebar that answers questions and suggests navigation. This spec evolves Scout into an agentic copilot that can execute multi-step workflows on behalf of the student — finding contacts, drafting emails, managing outreach — while the student retains full manual control at all times.

**The principle:** Same product, two modes, fluid switching. The existing pages stay. Students can click around manually. Scout can also drive the product for them. Both modes operate on the same data, same pages, same actions.

**Reference products:** Linear (AI embedded in product, not chatbot), Cursor (manual + agent mode on same interface), Notion (AI at point of action).

---

## 2. Current State of Scout

### Backend (`backend/app/routes/scout.py`, `backend/app/services/scout_service.py`)

Three endpoints:
- `POST /api/scout/chat` — Main conversational endpoint (5 credits)
- `POST /api/scout/analyze-job` — Resume-to-job fit analysis (5 credits)
- `POST /api/scout/firm-assist` — Multi-turn firm search assistant (5 credits)

Scout classifies user intent into five types: `URL_PARSE`, `JOB_SEARCH`, `FIELD_HELP`, `RESEARCH`, `CONVERSATION`. Each routes to a specific handler. Uses GPT-4o-mini.

**What Scout CAN do today:**
- Parse job posting URLs via Jina Reader
- Search jobs via SerpAPI
- Answer questions conversationally
- Analyze resume-to-job fit with scoring
- Suggest navigation to /find with auto-populated search fields

**What Scout CANNOT do today:**
- Execute actions (draft emails, save contacts, trigger workflows)
- Persist conversation history across sessions (sessionStorage only)
- Access real-time platform data (contacts, outreach status, tracker)
- Execute multi-step workflows

### Frontend (`ScoutContext.tsx`, `ScoutSidePanel.tsx`, `useScoutChat.ts`)

ScoutContext manages minimal state: panel open/closed + search help context.

The chat hook sends:
```json
{
  "message": "user input",
  "conversation_history": [...],
  "current_page": "/find",
  "user_info": { "name", "tier", "credits", "max_credits" }
}
```

Response format:
```json
{
  "message": "conversational text",
  "navigate_to": "/find?tab=companies",
  "action_buttons": [{ "label": "...", "route": "..." }],
  "auto_populate": { "search_type": "contact", "job_title": "...", "location": "..." }
}
```

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        FRONTEND                               │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  Dashboard   │  │  Cmd+K       │  │  Existing Pages     │  │
│  │  (new home)  │  │  Overlay     │  │  (manual mode)      │  │
│  │  - Prompt bar│  │  (every page)│  │  - /find/search     │  │
│  │  - Action    │  │  - Context-  │  │  - /tracker         │  │
│  │    cards     │  │    aware     │  │  - /job-board        │  │
│  │  - Pulse     │  │  - Commands  │  │  - /coffee-chat-prep│  │
│  │    metrics   │  │  - Actions   │  │  - /write/*         │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────────────────┘  │
│         │                │                                     │
│         └────────┬───────┘                                     │
│                  ▼                                             │
│         ┌────────────────┐                                     │
│         │  ScoutContext   │  (evolved: agent state, page       │
│         │  (React)        │   context, action queue, autonomy) │
│         └────────┬───────┘                                     │
│                  │                                             │
└──────────────────┼─────────────────────────────────────────────┘
                   │ SSE stream or WebSocket
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                        BACKEND                                │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Scout Agent Service (NEW)                              │   │
│  │  - Intent classification (expanded)                     │   │
│  │  - Tool selection & execution                           │   │
│  │  - Multi-step workflow orchestration                    │   │
│  │  - Action receipt generation                            │   │
│  │  - Context management (page, history, user profile)     │   │
│  └────────────────────┬───────────────────────────────────┘   │
│                       │                                       │
│           ┌───────────┼───────────┐                           │
│           ▼           ▼           ▼                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │ Existing │ │ Existing │ │ Existing │                     │
│  │ Routes   │ │ Services │ │ External │                     │
│  │          │ │          │ │ APIs     │                     │
│  │ contacts │ │ pdl      │ │ Gmail    │                     │
│  │ emails   │ │ hunter   │ │ OpenAI   │                     │
│  │ outbox   │ │ gmail    │ │ PDL      │                     │
│  │ job_board│ │ openai   │ │ SerpAPI  │                     │
│  │ coffee   │ │ coffee   │ │ Hunter   │                     │
│  └──────────┘ └──────────┘ └──────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

**Key architectural decision:** Scout Agent Service calls existing services/routes internally. We do NOT rebuild contact search, email generation, etc. Scout is an orchestration layer that composes existing capabilities.

---

## 4. Scout Action Types

Each action type maps to existing backend functionality.

### 4.1 Contact Actions

| Action | Existing Endpoint | Trigger Examples | Credit Cost |
|--------|-------------------|------------------|-------------|
| Search contacts | Internal call to PDL service (`pdl_client.py`) | "Find people at Bain in Chicago" | Per existing tier limits |
| Save contact | `POST /api/contacts/bulk` | "Save Sarah Chen" | 0 (credits on search) |
| Update contact stage | `PUT /api/outbox/threads/{id}/stage` | "Mark Sarah as replied" | 0 |
| View contact details | Internal Firestore read | "Show me Sarah's info" | 0 |

### 4.2 Email Actions

| Action | Existing Endpoint | Trigger Examples | Credit Cost |
|--------|-------------------|------------------|-------------|
| Draft email | `POST /api/emails/generate-and-draft` | "Draft an email to Sarah" | Per existing |
| Edit email | Frontend-only (populate editor) | "Make it more casual" | 0 |
| Send email | Gmail API (existing `gmail_client.py`) | "Send it" | 0 |
| Draft follow-up | Same as draft, with thread context | "Follow up with James" | Per existing |
| Bulk draft | Same endpoint, multiple contacts | "Email all 3 contacts" | Per contact |

### 4.3 Research Actions

| Action | Existing Endpoint | Trigger Examples | Credit Cost |
|--------|-------------------|------------------|-------------|
| Coffee chat prep | `POST /api/coffee-chat-prep` | "Prep me for Sarah" | 15 credits |
| Interview prep | `POST /api/interview-prep` | "Prep me for McKinsey" | 25 credits |
| Job search | `POST /api/job-board/jobs` | "Find IB jobs in NYC" | 0 |
| Analyze job fit | `POST /api/scout/analyze-job` | "How do I match this role?" | 5 credits |
| Company research | `POST /api/scout/firm-assist` | "Tell me about Bain" | 5 credits |

### 4.4 Tracker Actions

| Action | Existing Endpoint | Trigger Examples | Credit Cost |
|--------|-------------------|------------------|-------------|
| Get outreach stats | `GET /api/outbox/stats` | "How's my outreach going?" | 0 |
| List active threads | `GET /api/outbox/threads` | "Who hasn't replied?" | 0 |
| Archive thread | `POST /api/outbox/threads/{id}/archive` | "Archive cold contacts" | 0 |
| Check replies | Gmail webhook data | "Any new replies?" | 0 |

### 4.5 Navigation Actions (existing, keep as-is)

| Action | Mechanism | Trigger Examples |
|--------|-----------|------------------|
| Go to page | Frontend router `navigate()` | "Take me to the tracker" |
| Auto-populate search | Existing `auto_populate` response field | "Search for analysts at JPM" |
| Open external | `window.open()` | "Open Sarah's LinkedIn" |

---

## 5. Communication Protocol

### 5.1 New Endpoint: `POST /api/scout/agent`

This is the primary agentic endpoint. It replaces `/api/scout/chat` for agent-mode interactions (keep the old endpoint for backwards compatibility during migration).

**Request:**
```json
{
  "message": "Reach out to contacts at McKinsey in Chicago",
  "conversation_id": "conv_abc123",
  "page_context": {
    "current_page": "/dashboard",
    "visible_data": {}
  },
  "autonomy_level": 1
}
```

**Response: Server-Sent Events (SSE) stream**

Each event is a JSON object with a `type` field:

```
event: thinking
data: {"type": "thinking", "message": "Searching for contacts at McKinsey, Chicago office..."}

event: tool_start
data: {"type": "tool_start", "tool": "contact_search", "params": {"company": "McKinsey", "location": "Chicago"}}

event: tool_result
data: {"type": "tool_result", "tool": "contact_search", "status": "success", "data": {"contacts": [{"name": "Sarah Chen", "title": "Associate", "email": "s.chen@mckinsey.com", "linkedin": "..."}, ...], "total_found": 3, "no_email_count": 1}}

event: thinking
data: {"type": "thinking", "message": "Found 3 contacts. Drafting personalized email for Sarah Chen..."}

event: tool_start
data: {"type": "tool_start", "tool": "email_draft", "params": {"contact_id": "...", "contact_name": "Sarah Chen"}}

event: tool_result
data: {"type": "tool_result", "tool": "email_draft", "status": "success", "data": {"draft_id": "draft_123", "subject": "...", "body": "Hi Sarah, ...", "gmail_url": "https://mail.google.com/..."}}

event: confirmation_required
data: {"type": "confirmation_required", "action": "send_email", "description": "Send email to Sarah Chen at McKinsey", "data": {"draft_id": "draft_123"}, "options": ["approve", "edit", "skip"]}

event: complete
data: {"type": "complete", "summary": "Found 3 contacts at McKinsey Chicago. Drafted 2 emails (1 contact had no email found).", "actions_taken": [{"tool": "contact_search", "result": "3 found"}, {"tool": "email_draft", "result": "2 drafted"}], "pending_actions": [{"action": "send_email", "contact": "Sarah Chen"}, {"action": "send_email", "contact": "James Park"}]}
```

### 5.2 Event Types

| Event Type | Purpose | Frontend Behavior |
|-----------|---------|-------------------|
| `thinking` | Scout is processing | Show loading indicator with message |
| `tool_start` | Scout is calling a tool | Show "Searching for contacts..." card |
| `tool_result` | Tool returned data | Render result card (contacts, draft, etc.) |
| `confirmation_required` | Scout needs approval (autonomy level < 3) | Show action card with Approve/Edit/Skip |
| `error` | Something failed | Show error card with retry option |
| `navigate` | Scout wants to open a page | Programmatic `navigate()` or show link |
| `complete` | Workflow finished | Show summary card + receipt |

### 5.3 Confirmation Flow

For actions that have side effects (sending emails, deducting credits), Scout asks before executing — unless the user's autonomy level allows auto-execution.

**How confirmations work (SSE is server→client only):**
When Scout hits a `confirmation_required` event, the SSE stream includes a `workflow_id`. The stream then sends a `waiting` event and pauses. The frontend shows Approve/Edit/Skip buttons. When the user clicks, the frontend sends:

`POST /api/scout/agent/{workflow_id}/confirm`
```json
{ "action": "approve" | "edit" | "skip", "edit_data": {} }
```

The backend resumes the workflow from Firestore-persisted state (NOT in-memory — this is critical for multi-worker Gunicorn). The SSE stream continues from where it left off. If the user never confirms, the workflow expires after 30 minutes and becomes a dashboard card ("Unfinished workflow").

**Cancellation:** At any point during a workflow, the frontend can send:
`POST /api/scout/agent/{workflow_id}/cancel`
This stops execution, rolls back any reversible actions not yet confirmed, and generates a partial receipt.

```
AUTONOMY 0 (Suggest):
  Scout: "I found 3 contacts. Want me to draft emails?" → [Yes] [No]
  Scout: "Here's a draft for Sarah. Send it?" → [Send] [Edit] [Skip]

AUTONOMY 1 (Draft):
  Scout drafts automatically, shows results
  Scout: "Draft ready for Sarah. [Send] [Edit] [Skip]"

AUTONOMY 2 (Batch):
  Scout: "5 emails ready. [Approve All] [Review Each]"

AUTONOMY 3 (Autopilot):
  Scout sends on approved schedules with a 30-second undo window.
  Scout: "Sending 5 follow-ups... [Undo] (28s remaining)"
  After 30s: "Sent 5 follow-ups. [View All]"
  Note: Level 3 DOES auto-send (unlike levels 0-2), but the undo window
  provides a safety net. This is the only level where sends happen without
  explicit per-email approval.
```

### 5.4 Conversation Persistence

**Current:** `sessionStorage` (lost on tab close)

**New:** Firestore subcollection `users/{uid}/scoutConversations/` (already exists in the data model but underused)

Each conversation:
```json
{
  "id": "conv_abc123",
  "created_at": "2026-04-09T...",
  "updated_at": "2026-04-09T...",
  "messages": [
    { "role": "user", "content": "Find contacts at McKinsey", "timestamp": "..." },
    { "role": "assistant", "content": "Found 3 contacts...", "timestamp": "...", "actions": [...] }
  ],
  "actions_taken": [
    { "tool": "contact_search", "timestamp": "...", "result": "3 found" },
    { "tool": "email_draft", "timestamp": "...", "result": "2 drafted" }
  ]
}
```

---

## 6. Scout Agent Service (Backend)

### 6.1 Architecture

```python
# backend/app/services/scout_agent.py (NEW)

class ScoutAgent:
    """
    Orchestrates multi-step workflows by composing existing services.
    Does NOT reimplement contact search, email generation, etc.
    Calls existing service functions directly.
    """

    TOOLS = {
        "contact_search": {
            "description": "Search for professional contacts by company, role, location",
            "handler": "_tool_contact_search",
            "requires_confirmation": False,
            "credit_cost": "per_tier_limits"
        },
        "email_draft": {
            "description": "Generate a personalized outreach email for a contact",
            "handler": "_tool_email_draft",
            "requires_confirmation": False,
            "credit_cost": "per_existing"
        },
        "email_send": {
            "description": "Send a drafted email via Gmail",
            "handler": "_tool_email_send",
            "requires_confirmation": True,  # Always confirm sends
            "credit_cost": 0
        },
        "coffee_chat_prep": {
            "description": "Generate coffee chat preparation document",
            "handler": "_tool_coffee_chat_prep",
            "requires_confirmation": True,  # Costs 15 credits
            "credit_cost": 15
        },
        "job_search": {
            "description": "Search for job listings",
            "handler": "_tool_job_search",
            "requires_confirmation": False,
            "credit_cost": 0
        },
        "outbox_status": {
            "description": "Check outreach pipeline status and stats",
            "handler": "_tool_outbox_status",
            "requires_confirmation": False,
            "credit_cost": 0
        },
        "contact_update": {
            "description": "Update a contact's stage or information",
            "handler": "_tool_contact_update",
            "requires_confirmation": False,
            "credit_cost": 0
        },
        "navigate": {
            "description": "Navigate the user to a specific page",
            "handler": "_tool_navigate",
            "requires_confirmation": False,
            "credit_cost": 0
        }
    }
```

### 6.2 Implementation Notes

**Async strategy:** The code samples below use `async def` for clarity, but the existing
backend is Flask 3.0 + Gunicorn (WSGI). Two options for the co-founder:
- **Option A (recommended):** Use `concurrent.futures.ThreadPoolExecutor` to run tool handlers
  in threads, same pattern as coffee chat prep's background processing.
- **Option B:** Migrate the scout agent endpoint to Quart or use Flask's async view support
  with an ASGI server (Hypercorn). More work, better long-term.

The pseudocode below is illustrative. For the actual multi-turn tool-calling loop,
see OpenAI's function calling docs or Anthropic's tool use docs — the LLM returns
tool calls, you execute them, feed results back, and the LLM decides the next step.

**Workflow state persistence:** Workflows MUST be persisted to Firestore
(`users/{uid}/scoutWorkflows/{workflow_id}`), NOT held in memory. With 4 Gunicorn
workers, the confirmation request may hit a different worker. The resume handler
reconstructs workflow state from Firestore.

**Rate limiting:** The agent endpoint is subject to existing per-user rate limits
(2000/day, 500/hour). Additionally, each agent request is capped at 10 tool
invocations max to prevent runaway workflows. Requests exceeding this return a
`complete` event with a note: "Reached action limit. Here's what I did so far."

### 6.3 Tool Execution Pattern

Each tool handler wraps an existing service call:

```python
def _tool_contact_search(self, params, user_context):
    """Wraps existing PDL search."""
    from app.services.pdl_client import search_contacts

    results = search_contacts(
        company=params.get("company"),
        location=params.get("location"),
        title=params.get("title"),
        uid=user_context["uid"],
        tier=user_context["tier"]
    )
    return {
        "contacts": results["contacts"],
        "total_found": len(results["contacts"]),
        "no_email_count": results.get("no_email_count", 0)
    }

def _tool_email_draft(self, params, user_context):
    """Wraps existing email generation + Gmail draft creation."""
    from app.services.openai_client import generate_email
    from app.services.gmail_client import create_draft

    email = generate_email(
        contact=params["contact"],
        resume_text=user_context["resume_text"],
        user_profile=user_context["profile"],
        career_interests=user_context["career_interests"]
    )

    draft = create_draft(
        uid=user_context["uid"],
        to=params["contact"]["email"],
        subject=email["subject"],
        body=email["body"]
    )

    return {
        "draft_id": draft["id"],
        "subject": email["subject"],
        "body": email["body"],
        "gmail_url": draft.get("gmail_url")
    }
```

### 6.4 LLM Orchestration

Scout uses an LLM (GPT-4 or Claude) with tool-calling to decide which tools to use and in what order.

**This is simplified pseudocode.** The actual implementation requires a multi-turn
tool-calling loop where tool results are fed back to the LLM for the next decision.
See OpenAI's function calling docs for the full pattern.

```python
def handle_agent_request(self, message, conversation_id, page_context, user_context):
    """
    Main entry point. Streams SSE events back to the frontend.
    """
    # 1. Build system prompt with available tools and user context
    system_prompt = self._build_system_prompt(user_context, page_context)

    # 2. Load conversation history from Firestore
    history = self._load_conversation(conversation_id)

    # 3. Call LLM with tool definitions
    # LLM decides: which tools to call, in what order, with what params
    response_stream = await self.llm.chat_with_tools(
        system=system_prompt,
        messages=history + [{"role": "user", "content": message}],
        tools=self.TOOLS
    )

    # 4. Execute tool calls as LLM requests them, streaming events
    for event in response_stream:
        if event.type == "tool_call":
            tool = self.TOOLS[event.tool_name]

            # Check autonomy level for confirmation
            if tool["requires_confirmation"] and user_context["autonomy_level"] < 3:
                yield {"type": "confirmation_required", ...}
                # Wait for user response before continuing
            else:
                yield {"type": "tool_start", "tool": event.tool_name}
                result = await self._execute_tool(event.tool_name, event.params, user_context)
                yield {"type": "tool_result", "tool": event.tool_name, "data": result}

        elif event.type == "text":
            yield {"type": "thinking", "message": event.content}

    # 5. Generate summary
    yield {"type": "complete", "summary": self._generate_summary(actions_taken)}

    # 6. Persist conversation + actions to Firestore
    self._save_conversation(conversation_id, message, actions_taken)
```

### 6.5 System Prompt Template

```python
SCOUT_SYSTEM_PROMPT = """You are Scout, the AI copilot for Offerloop. You help college
students find professional contacts, draft personalized outreach emails, prepare for
networking conversations, and manage their outreach pipeline.

ABOUT THE STUDENT:
- Name: {name}
- University: {university}
- Graduation: {grad_year}
- Major: {major}
- Target industries: {industries}
- Target firms: {target_firms}
- Resume summary: {resume_summary}

CURRENT CONTEXT:
- Page: {current_page}
- Active outreach threads: {active_threads}
- Pending follow-ups: {pending_followups}
- Credits remaining: {credits}/{max_credits}
- Gmail connected: {gmail_connected}
- Autonomy level: {autonomy_level}

AVAILABLE TOOLS:
{tool_definitions}

RULES:
1. Always use the student's resume data and profile to personalize emails.
2. Never send an email without explicit student approval (unless autonomy level 3).
3. When drafting emails: no AI-slop language (no "impressed," "fascinated," "intrigued").
   Emails should read like a sharp student wrote them.
4. When searching contacts: prioritize alumni connections when available.
5. Always report what you did and where the results are (Gmail, tracker, etc.).
6. If a requested action would cost credits, state the cost before executing.
7. If Gmail is not connected and user requests email actions, guide them to connect first.
8. For multi-step requests ("reach out to 5 people at Bain"), execute sequentially
   and stream progress. Don't wait for all steps to complete before showing results.
"""
```

---

## 7. Dashboard Data Model

The dashboard is the primary surface where Scout's work appears. It needs a backend source of truth for the action cards.

### 7.1 Dashboard Feed Endpoint

**`GET /api/dashboard/feed`**

Returns prioritized action cards for the authenticated user.

```json
{
  "cards": [
    {
      "id": "card_001",
      "type": "reply_received",
      "priority": 1,
      "created_at": "2026-04-09T10:30:00Z",
      "data": {
        "contact_name": "Sarah Chen",
        "contact_company": "McKinsey",
        "reply_preview": "Thanks for reaching out! I'd be happy to...",
        "thread_id": "gmail_thread_abc",
        "contact_id": "contact_123"
      },
      "actions": ["view_thread", "suggest_reply", "schedule_meeting"]
    },
    {
      "id": "card_002",
      "type": "followup_due",
      "priority": 2,
      "created_at": "2026-04-09T08:00:00Z",
      "data": {
        "contact_name": "James Park",
        "contact_company": "Bain",
        "days_since_sent": 5,
        "original_email_subject": "Quick question about...",
        "contact_id": "contact_456"
      },
      "actions": ["draft_followup", "snooze", "skip", "archive"]
    },
    {
      "id": "card_003",
      "type": "new_matches",
      "priority": 3,
      "created_at": "2026-04-09T06:00:00Z",
      "data": {
        "match_count": 4,
        "firms": ["McKinsey", "BCG"],
        "preview_contacts": [
          {"name": "...", "title": "...", "company": "..."}
        ]
      },
      "actions": ["view_all", "draft_emails", "dismiss"]
    },
    {
      "id": "card_004",
      "type": "scout_insight",
      "priority": 4,
      "data": {
        "message": "Your response rate at consulting firms (35%) is higher than tech (12%). Consider focusing more outreach on consulting.",
        "insight_type": "strategy"
      },
      "actions": ["apply_suggestion", "dismiss"]
    }
  ],
  "pulse": {
    "emails_sent_this_week": 12,
    "emails_sent_trend": "up",
    "response_rate": 0.25,
    "response_rate_trend": "stable",
    "active_conversations": 8,
    "followups_due": 3
  }
}
```

### 7.2 Card Types

| Type | Source | Priority Logic |
|------|--------|---------------|
| `reply_received` | Gmail webhook (Pub/Sub) | Always top priority. Time-sensitive. |
| `followup_due` | Calculated from outbox send dates | Priority increases with days elapsed |
| `new_matches` | Background job matching resume to new jobs | Daily, lower priority |
| `scout_insight` | Analytics over outreach data | Lowest priority, strategic |
| `action_receipt` | Scout agent actions | Appears after Scout executes something |
| `onboarding_prompt` | One-time for new users | Only shown during first week |
| `credit_warning` | Credit balance check | When credits < 20% of max |

### 7.3 Background Job: Dashboard Feed Generation

**Execution mechanism:** Daemon thread in `wsgi.py`, same pattern as the existing
Gmail watch renewal thread. Runs every 30 minutes, iterates active users, computes
feed cards. Additionally triggered on-demand by Gmail webhooks (when a reply arrives).

**Limitation:** Same as Gmail watch renewal — if the thread throws an unhandled
exception, it dies silently. Add try/except with logging around the main loop.

A periodic background job (or triggered by events) pre-computes the dashboard feed:

```python
# Run every 30 minutes + triggered by Gmail webhooks
def refresh_dashboard_feed(uid):
    """
    Computes action cards for a user's dashboard.
    Writes to Firestore: users/{uid}/dashboard_feed
    """
    cards = []

    # 1. Check for new Gmail replies (via stored thread data)
    replies = check_for_replies(uid)
    for reply in replies:
        cards.append(make_reply_card(reply))

    # 2. Check for due follow-ups (contacts sent > 3-5 days ago, no reply)
    followups = get_due_followups(uid, days_threshold=5)
    for followup in followups:
        cards.append(make_followup_card(followup))

    # 3. Match new jobs against user profile (daily)
    if should_refresh_matches(uid):
        matches = match_jobs_to_profile(uid)
        if matches:
            cards.append(make_matches_card(matches))

    # 4. Generate insights (weekly)
    if should_generate_insights(uid):
        insight = generate_outreach_insight(uid)
        if insight:
            cards.append(make_insight_card(insight))

    # 5. Sort by priority and save
    cards.sort(key=lambda c: c["priority"])
    save_dashboard_feed(uid, cards)
```

---

## 8. Autonomy Levels

Stored per-user in Firestore at `users/{uid}`.autonomyLevel (integer 0-3, default 0).

### 8.1 Level Definitions

```
LEVEL 0: SUGGEST ONLY (default for new users)
─────────────────────────────────────────────
Scout suggests actions but never executes without explicit approval.
Every tool call that has side effects requires a confirmation_required event.
User experience: Scout says "I can draft an email to Sarah. Want me to?"

LEVEL 1: DRAFT AUTOMATICALLY (unlocked after 5+ successful interactions)
─────────────────────────────────────────────
Scout executes read actions and draft creation without asking.
Still requires confirmation for: sending emails, spending credits > 10.
User experience: Scout drafts the email and shows it. "Ready to send?"

LEVEL 2: BATCH APPROVE (unlocked after 20+ successful interactions)
─────────────────────────────────────────────
Scout executes sequences and presents batch results for approval.
Single confirmation for the entire batch, not per-item.
User experience: "5 emails ready. [Approve All] [Review Each]"

LEVEL 3: FULL AUTOPILOT (user explicitly enables in settings)
─────────────────────────────────────────────
Scout executes everything including sends on approved schedules.
Shows receipts after the fact. Undo available for 30 seconds.
User experience: "Sent 5 follow-ups this morning. [View] [Undo]"
```

### 8.2 Level Progression

```python
def maybe_upgrade_autonomy(uid, interaction_count, success_rate):
    """
    Called after each successful Scout interaction.
    Never auto-upgrades to level 3 (requires explicit user opt-in).
    """
    current = get_autonomy_level(uid)

    if current == 0 and interaction_count >= 5 and success_rate > 0.8:
        # Suggest upgrade, don't auto-apply
        return {"suggest_upgrade": True, "new_level": 1,
                "message": "You've used Scout 5 times successfully. Want to let Scout draft emails automatically?"}

    if current == 1 and interaction_count >= 20 and success_rate > 0.85:
        return {"suggest_upgrade": True, "new_level": 2,
                "message": "You trust Scout's drafts. Want to enable batch approvals?"}

    # Level 3 is NEVER auto-suggested. Must be explicitly enabled in settings.
    return {"suggest_upgrade": False}
```

---

## 9. Context Awareness

### 9.1 Page Context Object

Every Scout interaction includes page context so Scout knows where the user is and what they're looking at.

```typescript
// Frontend sends this with every Scout request
interface PageContext {
  current_page: string;           // "/find", "/tracker", "/job-board", etc.
  visible_data?: {
    // Page-specific context
    search_results?: Contact[];   // If on contact search with results visible
    selected_contact?: Contact;   // If viewing a specific contact
    current_job?: Job;            // If viewing a job listing
    draft_email?: EmailDraft;     // If editing an email
    tracker_filter?: string;      // If filtering tracker view
  };
}
```

### 9.2 Context-Aware Suggestions

Scout adjusts its behavior based on page context:

```python
PAGE_CONTEXT_PROMPTS = {
    "/dashboard": "User is on the dashboard. Suggest next actions based on their outreach status.",
    "/find": "User is searching for contacts. Help refine search or draft emails for results.",
    "/find/search": "User is manually searching. Offer to help narrow results or act on them.",
    "/tracker": "User is reviewing their outreach pipeline. Help with follow-ups or status updates.",
    "/job-board": "User is browsing jobs. Offer to find contacts at companies they're interested in.",
    "/coffee-chat-prep": "User is preparing for a conversation. Offer research and talking points.",
    "/write/resume": "User is working on their resume. Offer optimization suggestions.",
    "/write/cover-letter": "User is writing a cover letter. Offer to tailor it to a specific job.",
}
```

---

## 10. Frontend Integration Points

### 10.1 ScoutContext Evolution

```typescript
// connect-grow-hire/src/contexts/ScoutContext.tsx (EVOLVED)

interface ScoutState {
  // Existing (keep)
  isPanelOpen: boolean;

  // New: Agent state
  isProcessing: boolean;
  currentWorkflow: WorkflowState | null;
  actionQueue: ActionCard[];
  autonomyLevel: 0 | 1 | 2 | 3;

  // New: Page context
  currentPageContext: PageContext;

  // New: Conversation
  activeConversationId: string | null;
}

interface WorkflowState {
  id: string;
  status: 'thinking' | 'executing' | 'waiting_confirmation' | 'complete' | 'error';
  steps: WorkflowStep[];
  currentStepIndex: number;
  summary?: string;
}

interface WorkflowStep {
  tool: string;
  status: 'pending' | 'running' | 'complete' | 'error' | 'skipped';
  params: Record<string, any>;
  result?: Record<string, any>;
  confirmation?: ConfirmationRequest;
}

interface ActionCard {
  id: string;
  type: 'reply_received' | 'followup_due' | 'new_matches' | 'scout_insight' |
        'action_receipt' | 'onboarding_prompt' | 'credit_warning';
  priority: number;
  created_at: string;
  data: Record<string, any>;
  actions: string[];
}
```

### 10.2 Cmd+K Integration

```typescript
// The Cmd+K overlay uses the existing cmdk library (already installed).
// It becomes context-aware by reading ScoutContext.currentPageContext.

// Suggested commands change per page:
const PAGE_COMMANDS: Record<string, CommandSuggestion[]> = {
  "/dashboard": [
    { label: "Draft emails for new matches", icon: Mail },
    { label: "Follow up with cold contacts", icon: Clock },
    { label: "Show my outreach stats", icon: BarChart },
  ],
  "/find": [
    { label: "Email the top results", icon: Mail },
    { label: "Save all to contacts", icon: Save },
    { label: "Find similar people", icon: Search },
  ],
  "/tracker": [
    { label: "Draft follow-ups for stale threads", icon: RefreshCw },
    { label: "Archive contacts with no response", icon: Archive },
  ],
  "/job-board": [
    { label: "Find contacts at this company", icon: Users },
    { label: "Analyze my fit for this role", icon: Target },
  ],
};
```

### 10.3 Inline Nudge Component

```typescript
// A lightweight component that can be embedded in any existing page component.
// Shows contextual Scout suggestions without opening the full overlay.

interface ScoutNudgeProps {
  context: string;          // e.g., "contact_card", "email_draft", "tracker_row"
  contextData: any;         // The relevant data for this context
  position?: 'inline' | 'tooltip' | 'banner';
}

// Examples:
// On a contact card: "Scout suggests: good time to follow up (5 days since send)"
// On an email draft: "Scout: this email mentions 'fascinated' — consider more natural language"
// On the tracker: "Scout: 3 conversations went cold this week. Want to send follow-ups?"
```

---

## 11. Onboarding for Scout

### 11.1 First-Time Dashboard Experience

When a new user completes onboarding and lands on the dashboard, Scout has ALREADY done background work using their resume and profile data from onboarding:

```
Step 1: User completes onboarding (resume + interests + target firms)
Step 2: Background job triggers immediately:
        - Match resume against active job listings
        - Identify potential contacts at target firms
        - Pre-compute dashboard cards
Step 3: User lands on dashboard and sees:
        "Scout found 12 contacts at your target firms and 8 matching jobs."
        [Show Contacts] [Show Jobs] [Tell me more]
```

This is how users discover Scout's value on day one.

### 11.2 Progressive Feature Discovery

```
Day 1:   Dashboard cards + "Try asking Scout" prompt bar placeholder text
Day 2-3: Cmd+K tooltip appears: "Pro tip: press ⌘K anywhere to ask Scout"
Day 4-7: Scout proactively suggests follow-ups for sent emails
Week 2:  Autonomy upgrade suggestion (Level 0 → 1)
Week 3+: Batch approve suggestion (Level 1 → 2)
```

---

## 12. Error Handling & Edge Cases

### 12.1 Error Types

| Error | Scout Response | User Sees |
|-------|---------------|-----------|
| Gmail not connected | Guide to connect | "I need Gmail access to draft emails. [Connect Gmail]" |
| Contact has no email | Report and skip | "No email found for {name}. [Try different source] [Skip]" |
| Insufficient credits | Report cost, suggest upgrade | "This would cost 15 credits. You have 5 left. [Upgrade] [Skip]" |
| PDL rate limit | Retry with backoff | "Contact search is busy. Retrying in a moment..." |
| Email generation fails | Retry once, then report | "Had trouble drafting that email. [Try again] [Draft manually]" |
| Gmail send fails | Report with details | "Couldn't send — Gmail returned an error. [Retry] [View draft]" |
| LLM timeout | Graceful degradation | "Scout is thinking hard about this one. [Wait] [Try simpler request]" |
| User navigates away mid-workflow | Persist state, resume on return | Dashboard card: "Unfinished: 2 of 5 emails drafted. [Resume]" |

### 12.2 Reversibility

| Action | Reversible? | Mechanism | Time Limit |
|--------|-------------|-----------|------------|
| Contact search | N/A | Read-only | — |
| Save contact | Yes | Delete from Firestore | Anytime |
| Draft email | Yes | Delete Gmail draft | Anytime |
| Send email | No | Cannot unsend Gmail | — |
| Stage update | Yes | Revert to previous stage | Anytime |
| Coffee chat prep | No | Credits already deducted | — |
| Archive contact | Yes | Unarchive | Anytime |

**Rule: At autonomy levels 0-2, every irreversible action (send email, spend credits) requires explicit confirmation. At level 3 (Autopilot), sends execute automatically but with a 30-second undo window before becoming final. Level 3 is never auto-suggested — the user must explicitly opt in via settings.**

---

## 13. Credit Model for Scout

Scout actions consume credits through the existing credit system. Scout itself is free to talk to — credits are consumed when Scout uses tools that cost credits.

| Scout Action | Credits | Source |
|-------------|---------|--------|
| Conversation (chat) | 5 | Existing scout chat cost |
| Contact search | Per tier limits | Existing PDL search cost |
| Email draft | Per existing | Existing email gen cost |
| Email send | 0 | Free (Gmail API) |
| Coffee chat prep | 15 | Existing coffee chat cost |
| Interview prep | 25 | Existing interview prep cost |
| Job search | 0 | Free |
| Outbox/tracker queries | 0 | Free (reads only) |

**Tier gating:** The agent endpoint (`/api/scout/agent`) is available to ALL tiers.
Free tier users get the same Scout experience but hit credit limits faster. This is
intentional — Scout's value should drive upgrades, not access restrictions. The
existing `/api/scout/chat` (5 credits per message) remains for backwards compatibility.

**Agent invocation cost:** The agent endpoint itself has NO per-invocation base cost.
Credits are consumed only when Scout uses credit-costing tools (email draft, coffee
chat prep, etc.). Conversational responses within the agent flow are free.

**Credit costs reference:** Contact search costs are defined in `backend/app/config.py`
under `TIER_LIMITS` (varies by tier — Free: 15 credits/search, Pro: 10, Elite: 8).
Email generation and other costs are defined in the same config. Scout should read
these constants, not hardcode costs.

**Important:** Scout MUST check credit balance before executing credit-costing tools and report the cost to the user. Never silently deduct credits.

```python
# Before executing a credit-costing tool:
if tool_credit_cost > 0:
    current_credits = get_user_credits(uid)
    if current_credits < tool_credit_cost:
        yield {
            "type": "error",
            "message": f"This requires {tool_credit_cost} credits. You have {current_credits}.",
            "action": "upgrade_prompt"
        }
        return
    # If autonomy allows auto-execution, deduct. Otherwise, confirm first.
```

---

## 14. Migration Path

### Phase 1: Scout Agent Backend (co-founder builds)
1. Implement `ScoutAgent` class with tool-calling orchestration
2. Add `POST /api/scout/agent` SSE endpoint
3. Wire existing services as tools (contact search, email draft, etc.)
4. Add conversation persistence to Firestore
5. Add `autonomyLevel` field to user document
6. Implement dashboard feed endpoint + background job

### Phase 2: Dashboard Frontend (Nick builds)
1. Build dashboard page with action cards and prompt bar
2. Evolve ScoutContext with agent state management
3. Build SSE consumer hook (`useScoutAgent`)
4. Replace /find as default authenticated route with dashboard
5. Move contact search to /find/search

### Phase 3: Cmd+K + Nudges (Nick builds)
1. Upgrade Cmd+K from Scout chat toggle to context-aware command palette
2. Build ScoutNudge inline component
3. Add page context reporting to ScoutContext
4. Integrate nudges into existing page components (contact cards, tracker rows)

### Phase 4: Trust Ladder (both)
1. Implement autonomy level progression logic (backend)
2. Build upgrade prompts and settings UI (frontend)
3. Add batch approval flow for Level 2
4. Design and implement receipts for Level 3 autopilot

---

## 15. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Scout adoption | 60%+ of active users interact with Scout weekly | Track /api/scout/agent calls per user |
| Manual → Scout migration | 40%+ of email drafts initiated via Scout (not manual) | Compare draft sources |
| Dashboard engagement | 3+ dashboard visits per week per active user | Page view analytics |
| Cmd+K usage | 20%+ of active users use Cmd+K weekly | Track Cmd+K opens |
| Autonomy progression | 30%+ of users reach Level 1 within 2 weeks | Track autonomy level changes |
| Email edit rate | 40%+ approved without editing | Track edit vs. approve on Scout-drafted emails |
| Time to first outreach | Under 10 minutes from login to first email sent | Track session timing |

---

## Appendix A: Full Action Receipt Example

When Scout completes a multi-step workflow, it generates a receipt card:

```
┌─────────────────────────────────────────────┐
│  ✅ Scout completed your request             │
│                                              │
│  "Reach out to contacts at McKinsey Chicago" │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 🔍 Searched: McKinsey, Chicago       │    │
│  │    → Found 3 contacts                │    │
│  │                                      │    │
│  │ ✉️  Drafted: Sarah Chen (Associate)   │    │
│  │    → "Hi Sarah, I'm a junior at..."  │    │
│  │    → [View in Gmail] [Edit]          │    │
│  │                                      │    │
│  │ ✉️  Drafted: James Park (Analyst)     │    │
│  │    → "Hi James, I noticed we both..."│    │
│  │    → [View in Gmail] [Edit]          │    │
│  │                                      │    │
│  │ ⚠️  Alex Rivera — no email found      │    │
│  │    → [Try LinkedIn] [Skip]           │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Credits used: 35 (search: 15, drafts: 20)   │
│  [Send All] [Review Each] [Save for Later]   │
└─────────────────────────────────────────────┘
```

---

## Appendix B: Existing Backend Services Scout Wraps

Scout's agent layer composes these existing services. **Do not reimplement them.**

| Service | File | Key Functions |
|---------|------|---------------|
| Contact search | `app/services/pdl_client.py` | `search_contacts()` — PDL API with metro area mappings |
| Email generation | `app/services/openai_client.py` | Email generation via GPT-4, uses resume context |
| Gmail operations | `app/services/gmail_client.py` | `create_draft()`, `send_message()`, `get_thread()` |
| Email verification | `app/services/hunter.py` | `find_email()`, `verify_email()` |
| Coffee chat prep | `app/services/coffee_chat.py` | Full prep generation (background thread) |
| Job search | `app/routes/job_board.py` | SerpAPI integration, 6-hour cache |
| Resume parsing | `app/services/resume_parser_v2.py` | PDF/DOCX resume extraction |
| Outbox tracking | `app/routes/outbox.py` | Thread status, reply detection |
| Stripe billing | `app/services/stripe_client.py` | Credit checks, tier verification |

---

*This spec is a living document. Update it as implementation reveals new requirements or edge cases.*
