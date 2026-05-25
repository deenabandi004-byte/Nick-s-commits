"""Scout tool schema: the three tools the model must pick exactly one of, every
turn.

Phase 2 of the Scout consolidation. This replaces the old "respond with valid
JSON in this exact format" prose contract. The model now answers by calling one
tool, and the tool's input schema enforces the structure, so the response can
never be missing a field or malformed.

The three tools map one to one onto what Scout can do on a turn:
  navigate  - propose taking the user somewhere (a plan, not an action).
  answer    - reply in chat, no navigation.
  clarify   - ask one short follow-up question.

Definitions are in Anthropic tool-use format. to_openai_tools() converts them
for the OpenAI fallback path (and for local testing without an Anthropic key).
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

NAVIGATE_TOOL: Dict[str, Any] = {
    "name": "navigate",
    "description": (
        "Propose taking the user to a page, optionally with form fields "
        "pre-filled. Use when what the user wants is handled by a specific "
        "Offerloop page. This proposes a plan only: the user approves it "
        "before anything happens, and the user (never you) triggers the "
        "page's own action button. You never spend the user's credits."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "route": {
                "type": "string",
                "description": (
                    "Destination route. Must be exactly one of the routes "
                    "listed in the PAGES YOU CAN NAVIGATE TO section of the "
                    "system prompt."
                ),
            },
            "prefill": {
                "type": "object",
                "description": (
                    "Form fields to pre-fill on the destination page. Keys "
                    "must be field names from that route's 'Prefillable "
                    "fields' line. Use an empty object {} when there is "
                    "nothing to prefill."
                ),
                "additionalProperties": {"type": "string"},
            },
            "reasoning": {
                "type": "string",
                "description": (
                    "One short, human-readable sentence describing what this "
                    "does. Shown to the user verbatim on the approve card. "
                    "Example: 'Search for product managers at Google in New York.'"
                ),
            },
            "confidence": {
                "type": "number",
                "description": (
                    "How sure you are this route and prefill match what the "
                    "user wants, from 0.0 to 1.0. Use 0.9 or higher only when "
                    "the user was explicit. Use 0.6 to 0.9 when you inferred "
                    "the navigation from what they described. Use below 0.6 "
                    "when you are mostly guessing (prefer the clarify tool "
                    "instead in that case)."
                ),
            },
            "user_was_imperative": {
                "type": "boolean",
                "description": (
                    "True if the user gave a direct command to go somewhere "
                    "('take me to', 'go to', 'open', 'navigate to', 'show me "
                    "the X page'). False if you inferred the navigation from "
                    "what they described rather than an explicit command."
                ),
            },
            "auto_submit": {
                "type": "boolean",
                "description": (
                    "When true, the destination page populates the form AND "
                    "runs the search/action automatically - the user does not "
                    "have to click Search. Set true ONLY when the query is "
                    "complete: a clear target (company/role/people) AND a "
                    "specific count (or the count slider can default sanely). "
                    "Set false when the user might still want to tweak the "
                    "search before running it (broad query, ambiguous scope). "
                    "Currently honored by /contact-search and /firm-search."
                ),
            },
        },
        "required": [
            "route",
            "prefill",
            "reasoning",
            "confidence",
            "user_was_imperative",
        ],
    },
}

ANSWER_TOOL: Dict[str, Any] = {
    "name": "answer",
    "description": (
        "Reply to the user in chat without navigating anywhere. Use for "
        "questions, explanations, how-to help, and general conversation."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "Your reply to the user, in Scout's voice.",
            },
            "cta": {
                "type": "object",
                "description": (
                    "Optional. EXACTLY ONE end-of-message chip that bridges "
                    "the answer to a runnable Offerloop workflow. Omit "
                    "entirely when no relevant workflow exists. NEVER write "
                    "prose bridges like 'want me to...' or 'you might want "
                    "to...' instead of this chip - the chip IS the bridge. "
                    "Pick a route from PAGES YOU CAN NAVIGATE TO and prefill "
                    "fields the user named or that follow from the question."
                ),
                "properties": {
                    "label": {
                        "type": "string",
                        "description": (
                            "Short, concrete chip label, ideally under 10 "
                            "words. Example: 'Find 5 Bain alumni at USC'."
                        ),
                    },
                    "route": {
                        "type": "string",
                        "description": (
                            "Destination route. Must be exactly one of the "
                            "routes from PAGES YOU CAN NAVIGATE TO."
                        ),
                    },
                    "prefill": {
                        "type": "object",
                        "description": (
                            "Form fields to pre-fill on the destination "
                            "page. Same rules as navigate.prefill: only that "
                            "route's prefillable field names, only values "
                            "the user gave or that follow obviously."
                        ),
                        "additionalProperties": {"type": "string"},
                    },
                },
                "required": ["label", "route"],
            },
        },
        "required": ["text"],
    },
}

CLARIFY_TOOL: Dict[str, Any] = {
    "name": "clarify",
    "description": (
        "Ask the user one short follow-up question. Use when their intent is "
        "ambiguous, when a navigation could reasonably go to two different "
        "pages, or when a detail you need is missing."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "One short, specific follow-up question.",
            },
        },
        "required": ["question"],
    },
}

# ---------------------------------------------------------------------------
# Helper tool. Not a reply to the user: the model may call this mid-turn to
# gather data, then still finishes the turn with exactly one terminal tool.
# ---------------------------------------------------------------------------

PARSE_JOB_URL_TOOL: Dict[str, Any] = {
    "name": "parse_job_url",
    "description": (
        "Helper tool, not a reply. Fetch a job-posting URL and extract its "
        "company, job title, and location. Call this when the user gives a "
        "link to a job posting and you need those details to fill in a "
        "navigate (for example, to the cover letter or interview prep page). "
        "After it returns, you still finish the turn with navigate, answer, "
        "or clarify."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The job-posting URL to fetch and parse.",
            },
        },
        "required": ["url"],
    },
}

# Strategy memory helper tools (Phase 5, Stage 1). Like parse_job_url these
# are not a reply: the model calls one to write the user's multi-step plan to
# memory, then still finishes the turn with navigate, answer, or clarify.

SAVE_STRATEGY_TOOL: Dict[str, Any] = {
    "name": "save_strategy",
    "description": (
        "Helper tool, not a reply. Save the user's single active multi-step "
        "recruiting plan to memory, replacing any existing one. Call this when "
        "the user has a real goal that takes more than one step and more than "
        "one sitting (breaking into a field, landing interviews across a set "
        "of firms, a recruiting season), and they have agreed to the plan. Do "
        "not call it for a one-off task. After it returns you still finish the "
        "turn with answer."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "goal": {
                "type": "string",
                "description": (
                    "The user's goal in one plain sentence, concrete enough "
                    "to act on. Example: 'Land a 2027 summer analyst offer in "
                    "investment banking at a bulge bracket or elite boutique.'"
                ),
            },
            "steps": {
                "type": "array",
                "description": (
                    "The plan as an ordered list of 2 to 10 concrete steps, "
                    "sequenced by real recruiting timing."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "What to do, one short line.",
                        },
                        "detail": {
                            "type": "string",
                            "description": (
                                "Optional. One or two sentences of specifics: "
                                "which firms, which months, why this step."
                            ),
                        },
                        "route": {
                            "type": "string",
                            "description": (
                                "Optional. The Offerloop route this step maps "
                                "to, taken exactly from PAGES YOU CAN NAVIGATE "
                                "TO (for example /contact-search). Omit it "
                                "when the step is not a single Offerloop page."
                            ),
                        },
                    },
                    "required": ["title"],
                },
            },
        },
        "required": ["goal", "steps"],
    },
}

UPDATE_STRATEGY_PROGRESS_TOOL: Dict[str, Any] = {
    "name": "update_strategy_progress",
    "description": (
        "Helper tool, not a reply. Update the user's active strategy: mark "
        "steps done, or close the whole plan out. Call it when the user "
        "reports finishing a step, or when the goal is reached or the user is "
        "walking away from it. After it returns you still finish the turn "
        "with answer."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "completed_steps": {
                "type": "array",
                "description": (
                    "Step numbers that are now done, 1-based, matching the "
                    "numbering in the ACTIVE STRATEGY block."
                ),
                "items": {"type": "integer"},
            },
            "close": {
                "type": "string",
                "enum": ["completed", "abandoned"],
                "description": (
                    "Set only to close the whole plan: 'completed' when the "
                    "goal is reached, 'abandoned' when the user is dropping "
                    "it. Leave unset for a normal progress update."
                ),
            },
        },
        "required": [],
    },
}

# Workflow state read tools (Phase 5, Stage 2). Read-only Firestore wrappers
# that let Scout pull state from across the product when grounding a reply or
# a strategy discussion. The returned summaries are JSON-safe and compact (one
# limit knob per tool, no raw documents).

GET_OUTBOX_STATUS_TOOL: Dict[str, Any] = {
    "name": "get_outbox_status",
    "description": (
        "Read-only. Returns the user's email outreach pipeline summary: "
        "total contacts in the outbox, how many are awaiting a reply, how "
        "many have replied, and the most recent ones with status and "
        "days-since-last-send. Call this whenever the answer depends on the "
        "user's actual outreach state (\"how many people did I email?\", "
        "\"did anyone reply?\", \"who has gone quiet?\"). Read only, no "
        "writes."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Max recent contacts to return (default 10).",
            },
        },
        "required": [],
    },
}

GET_RECENT_SEARCHES_TOOL: Dict[str, Any] = {
    "name": "get_recent_searches",
    "description": (
        "Read-only. Returns the user's recent natural-language contact "
        "searches (the prompt-search history on the Find page), newest "
        "first. Call this when the answer depends on what the user has been "
        "looking for lately."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Max recent searches to return (default 5).",
            },
        },
        "required": [],
    },
}

GET_RECENT_COVER_LETTERS_TOOL: Dict[str, Any] = {
    "name": "get_recent_cover_letters",
    "description": (
        "Read-only. Returns metadata for the user's recent cover letters "
        "(company, role, created_at, length), newest first. The letter body "
        "itself is not included; ask for it separately if needed."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Max recent cover letters to return (default 5).",
            },
        },
        "required": [],
    },
}

GET_MEETING_PREP_DRAFTS_TOOL: Dict[str, Any] = {
    "name": "get_meeting_prep_drafts",
    "description": (
        "Read-only. Returns the user's recent meeting prep drafts (coffee "
        "chats and informational meetings) with the contact name, meeting "
        "type, scheduled date, and created date, newest first."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Max recent meeting preps to return (default 5).",
            },
        },
        "required": [],
    },
}

GET_RECENT_FIRM_SEARCHES_TOOL: Dict[str, Any] = {
    "name": "get_recent_firm_searches",
    "description": (
        "Read-only. Returns the user's recent firm searches (structured "
        "company-discovery searches with filters and result counts), newest "
        "first. Distinct from get_recent_searches, which covers people."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Max recent firm searches to return (default 5).",
            },
        },
        "required": [],
    },
}

# Terminal tools end a turn (exactly one per turn). Helper tools gather data
# or write memory mid-turn and the model keeps going. parallel_tool_calls=False
# caps each step at one tool; the caller offers only terminal tools on the
# final step so a turn can never end without one.
TERMINAL_TOOLS: List[Dict[str, Any]] = [NAVIGATE_TOOL, ANSWER_TOOL, CLARIFY_TOOL]
HELPER_TOOLS: List[Dict[str, Any]] = [
    PARSE_JOB_URL_TOOL,
    SAVE_STRATEGY_TOOL,
    UPDATE_STRATEGY_PROGRESS_TOOL,
    GET_OUTBOX_STATUS_TOOL,
    GET_RECENT_SEARCHES_TOOL,
    GET_RECENT_COVER_LETTERS_TOOL,
    GET_MEETING_PREP_DRAFTS_TOOL,
    GET_RECENT_FIRM_SEARCHES_TOOL,
]
SCOUT_TOOLS: List[Dict[str, Any]] = TERMINAL_TOOLS + HELPER_TOOLS

TERMINAL_TOOL_NAMES = {t["name"] for t in TERMINAL_TOOLS}
HELPER_TOOL_NAMES = {t["name"] for t in HELPER_TOOLS}
TOOL_NAMES = {t["name"] for t in SCOUT_TOOLS}


def to_openai_tools(terminal_only: bool = False) -> List[Dict[str, Any]]:
    """Tool set in OpenAI function-tool format.

    terminal_only=True returns just navigate/answer/clarify; the caller uses it
    on the final step to force the turn to end on a terminal tool.
    """
    tools = TERMINAL_TOOLS if terminal_only else SCOUT_TOOLS
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in tools
    ]


# ---------------------------------------------------------------------------
# Helper tool implementations
# ---------------------------------------------------------------------------


async def parse_job_url(url: str) -> Dict[str, Any]:
    """Fetch a job posting and return {company, job_title, location}.

    Thin wrapper over firecrawl_client.extract_job_posting. Returns empty
    strings on any failure (no API key, fetch error, unparseable page) so the
    model can still navigate without prefill or ask the user.
    """
    cleaned = (url or "").strip()
    if not cleaned:
        return {"company": "", "job_title": "", "location": "", "error": "no url provided"}
    try:
        from app.services.firecrawl_client import extract_job_posting
        # extract_job_posting is synchronous; keep it off the event loop.
        data = await asyncio.to_thread(extract_job_posting, cleaned)
    except Exception as e:  # any failure degrades to empty fields
        return {"company": "", "job_title": "", "location": "", "error": str(e)}
    data = data if isinstance(data, dict) else {}
    return {
        "company": str(data.get("company") or "").strip(),
        "job_title": str(data.get("title") or "").strip(),
        "location": str(data.get("location") or "").strip(),
    }


async def _run_save_strategy(
    args: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Helper-tool wrapper around strategy.save_strategy.

    Marks context["strategy_touched"] = True on success so handle_chat knows
    this turn wrote the strategy and can skip caching the answer.
    """
    from app.services.scout import strategy as strategy_mod
    uid = context.get("uid")
    tier = context.get("tier")
    if not uid:
        return {"ok": False, "error": "not_signed_in"}
    result = await asyncio.to_thread(
        strategy_mod.save_strategy,
        uid, tier, args.get("goal"), args.get("steps"),
    )
    if result.get("ok"):
        context["strategy_touched"] = True
    return result


async def _run_update_strategy_progress(
    args: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Helper-tool wrapper around strategy.update_strategy_progress."""
    from app.services.scout import strategy as strategy_mod
    uid = context.get("uid")
    tier = context.get("tier")
    if not uid:
        return {"ok": False, "error": "not_signed_in"}
    result = await asyncio.to_thread(
        strategy_mod.update_strategy_progress,
        uid, tier, args.get("completed_steps"), args.get("close"),
    )
    if result.get("ok"):
        context["strategy_touched"] = True
    return result


async def _run_workflow_read(
    fn_name: str,
    args: Dict[str, Any],
    context: Dict[str, Any],
    default_limit: int,
    empty_envelope: Dict[str, Any],
) -> Dict[str, Any]:
    """Shared body for the six workflow-state read tools.

    Resolves uid, normalizes the limit, dispatches to the named function in
    workflow_state, and marks context["workflow_state_touched"] so handle_chat
    refuses to cache an answer colored by user-specific workflow state.
    """
    from app.services.scout import workflow_state
    uid = context.get("uid")
    if not uid:
        return dict(empty_envelope)
    try:
        limit = int(args.get("limit") or default_limit)
    except (TypeError, ValueError):
        limit = default_limit
    fn = getattr(workflow_state, fn_name, None)
    if fn is None:
        return dict(empty_envelope)
    result = await asyncio.to_thread(fn, uid, limit)
    context["workflow_state_touched"] = True
    return result


# Per-tool defaults and empty envelopes. Kept here (not imported from
# workflow_state) so the dispatch table stays self-contained.
_OUTBOX_EMPTY = {"total_contacts": 0, "awaiting_reply": 0, "replied": 0, "recent": []}
_LIST_EMPTY = {"count": 0, "recent": []}


async def run_helper_tool(
    name: str,
    args: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Execute a helper (non-terminal) tool by name and return its result.

    The optional context carries per-turn state the helper may need (uid,
    tier, and the strategy_touched / workflow_state_touched flags the
    write-side and read-side helpers set). Older helpers (parse_job_url)
    ignore context, so it stays optional.
    """
    args = args if isinstance(args, dict) else {}
    ctx = context if context is not None else {}
    if name == "parse_job_url":
        return await parse_job_url(str(args.get("url") or ""))
    if name == "save_strategy":
        return await _run_save_strategy(args, ctx)
    if name == "update_strategy_progress":
        return await _run_update_strategy_progress(args, ctx)
    if name == "get_outbox_status":
        return await _run_workflow_read(
            "get_outbox_status", args, ctx, 10, _OUTBOX_EMPTY)
    if name == "get_recent_searches":
        return await _run_workflow_read(
            "get_recent_searches", args, ctx, 5, _LIST_EMPTY)
    if name == "get_recent_cover_letters":
        return await _run_workflow_read(
            "get_recent_cover_letters", args, ctx, 5, _LIST_EMPTY)
    if name == "get_meeting_prep_drafts":
        return await _run_workflow_read(
            "get_meeting_prep_drafts", args, ctx, 5, _LIST_EMPTY)
    if name == "get_recent_firm_searches":
        return await _run_workflow_read(
            "get_recent_firm_searches", args, ctx, 5, _LIST_EMPTY)
    return {"error": f"unknown helper tool: {name}"}
