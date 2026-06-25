"""
MCP server core. Implements JSON-RPC 2.0 over HTTP (the Streamable HTTP
stateless profile), hand-rolled so it runs on sync gunicorn workers
without an ASGI bridge.

Methods supported:
  - initialize        (handshake; returns server info + capabilities)
  - tools/list        (returns the three tool schemas)
  - tools/call        (dispatches to one of the three tool handlers)

Anything else returns a JSON-RPC method-not-found error.

Tool descriptions are intentionally written to answer the question
"what problem does this solve" rather than "what API does this call,"
because AI assistants pick which tool to call based on the description.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.mcp_server.schemas import (
    DraftOutreachInput,
    FindContactsInput,
    GetCompanyIntelInput,
)
from app.mcp_server.tools import (
    draft_outreach as draft_outreach_tool,
    find_contacts as find_contacts_tool,
    get_company_intel as get_company_intel_tool,
)

logger = logging.getLogger(__name__)


PROTOCOL_VERSION = "2025-06-18"
SERVER_NAME = "offerloop"
SERVER_VERSION = "0.1.0"


_FIND_CONTACTS_DESCRIPTION = (
    "Find real, verified professionals at a target company who match the "
    "user's school, role interests, or career goals. Returns names, titles, "
    "LinkedIn URLs, recent career moves, personalization hooks (alumni "
    "connection, shared employer, dream company), and — when available — "
    "the contact's email address. When you follow up with draft_outreach "
    "for one of these contacts, pass the email from this result through as "
    "draft_outreach.contact.email so the draft can be created in the user's "
    "Gmail with their resume attached. Use this when the user wants to know "
    "who to reach out to for networking, informational interviews, coffee "
    "chats, or job referrals."
)

_GET_COMPANY_INTEL_DESCRIPTION = (
    "Get a strategic overview of a company for interview prep, recruiter "
    "conversations, or deciding where to apply. Returns recent news, "
    "recruiting timeline signals, divisions or teams, and (if the user's "
    "school is provided) how many alumni from that school work at the "
    "company. Use this when the user is researching a firm for an "
    "interview, comparing offers, or trying to sound informed in a "
    "conversation."
)

_DRAFT_OUTREACH_DESCRIPTION = (
    "Draft a personalized cold email or coffee chat ask to a specific "
    "person, grounded in their real career history and the user's "
    "relationship to them (alumni, dream company, shared employer, career "
    "path). Returns a complete draft email with subject line and body. "
    "If the caller is signed into offerloop.ai and has connected Gmail, "
    "and the contact has an email address, this tool ALSO creates a real "
    "Gmail draft in their account with the user's resume attached and a "
    "proper signature. When that happens, tell the user the draft is "
    "waiting in their Gmail drafts folder and surface gmail_draft.draft_url "
    "so they can open it. Use this when the user has identified someone "
    "they want to reach out to and needs a specific email written."
)


TOOLS = [
    {
        "name": "find_contacts",
        "title": "Find Contacts",
        "description": _FIND_CONTACTS_DESCRIPTION,
        "inputSchema": FindContactsInput.model_json_schema(),
        "annotations": {
            "title": "Find Contacts",
            "readOnlyHint": True,
        },
        "handler": find_contacts_tool.handle,
    },
    {
        "name": "get_company_intel",
        "title": "Get Company Intel",
        "description": _GET_COMPANY_INTEL_DESCRIPTION,
        "inputSchema": GetCompanyIntelInput.model_json_schema(),
        "annotations": {
            "title": "Get Company Intel",
            "readOnlyHint": True,
        },
        "handler": get_company_intel_tool.handle,
    },
    {
        "name": "draft_outreach",
        "title": "Draft Outreach",
        "description": _DRAFT_OUTREACH_DESCRIPTION,
        "inputSchema": DraftOutreachInput.model_json_schema(),
        "annotations": {
            "title": "Draft Outreach",
            "readOnlyHint": True,
        },
        "handler": draft_outreach_tool.handle,
    },
]

_TOOLS_BY_NAME = {t["name"]: t for t in TOOLS}


def handle_jsonrpc(
    body: dict,
    *,
    ip_hash: str,
    db: Any,
    user_ctx: dict | None = None,
) -> dict:
    """Dispatch a single JSON-RPC 2.0 request and return its response dict.

    `body` is the already-parsed JSON request. Caller (flask_mount) is
    responsible for the HTTP envelope and for catching JSON parse errors.

    `user_ctx` is None for anonymous callers; otherwise a dict with
    `uid`, `tier`, and `scope` keys (set by flask_mount after JWT verify).
    """
    if not isinstance(body, dict):
        return _error(None, -32600, "Invalid Request: not a JSON object")

    request_id = body.get("id")
    method = body.get("method") or ""
    params = body.get("params") or {}

    if method == "initialize":
        return _ok(request_id, _initialize_result(params))

    if method == "tools/list":
        return _ok(request_id, {
            "tools": [
                {
                    "name": t["name"],
                    "title": t["title"],
                    "description": t["description"],
                    "inputSchema": t["inputSchema"],
                    "annotations": t["annotations"],
                }
                for t in TOOLS
            ],
        })

    if method == "tools/call":
        return _handle_tools_call(
            request_id, params, ip_hash=ip_hash, db=db, user_ctx=user_ctx,
        )

    if method in ("notifications/initialized", "ping"):
        # No-op notifications. Return empty success.
        return _ok(request_id, {})

    return _error(request_id, -32601, f"Method not found: {method}")


def _initialize_result(params: dict) -> dict:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {
            "tools": {"listChanged": False},
        },
        "serverInfo": {
            "name": SERVER_NAME,
            "version": SERVER_VERSION,
        },
        "instructions": (
            "Offerloop helps job seekers network into competitive jobs. "
            "Three tools: find_contacts (who to reach out to at a target "
            "company), get_company_intel (firm overview + alumni density at "
            "the user's school), draft_outreach (personalized cold email "
            "draft). Anonymous use is free with daily limits. Users who "
            "sign in via OAuth and connect Gmail get drafts written straight "
            "into their Gmail account, with resume attached."
        ),
    }


def _handle_tools_call(
    request_id: Any,
    params: dict,
    *,
    ip_hash: str,
    db: Any,
    user_ctx: dict | None = None,
) -> dict:
    name = (params or {}).get("name") or ""
    args = (params or {}).get("arguments") or {}

    tool = _TOOLS_BY_NAME.get(name)
    if tool is None:
        return _error(request_id, -32602, f"Unknown tool: {name}")

    try:
        result = tool["handler"](
            args=args, ip_hash=ip_hash, db=db, user_ctx=user_ctx,
        )
    except Exception as e:
        logger.exception("[MCP] tool '%s' raised: %s", name, e)
        return _error(request_id, -32000, f"Tool error: {e}")

    # MCP tools return their structured payload inside `content[].text`
    # (JSON-stringified) plus a `structuredContent` mirror that clients
    # can read directly. Both surfaces present the same data so any
    # client implementation works.
    payload_json = json.dumps(result, ensure_ascii=False)
    return _ok(request_id, {
        "content": [{"type": "text", "text": payload_json}],
        "structuredContent": result,
        "isError": bool(isinstance(result, dict) and result.get("error")),
    })


def _ok(request_id: Any, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: Any, code: int, message: str, data: Any = None) -> dict:
    err: dict = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": err}
