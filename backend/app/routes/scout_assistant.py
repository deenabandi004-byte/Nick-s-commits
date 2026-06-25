"""
Scout Assistant API endpoints - Product assistant for helping users navigate Offerloop.

This is a FREE feature - no credits are charged for using Scout assistant.
"""
from __future__ import annotations

import asyncio
import json
import os
import queue
import threading

from flask import Blueprint, jsonify, request, g, Response
from cachetools import TTLCache

from app.services.scout_assistant_service import scout_assistant_service
from app.services.scout.chat_persistence import (
    get_chat as chat_get_chat,
    list_chats as chat_list_chats,
)
from app.extensions import require_firebase_auth, get_db
from app.utils.async_runner import run_async

scout_assistant_bp = Blueprint("scout_assistant", __name__, url_prefix="/api/scout-assistant")

# Admin endpoints live on a prefix-less blueprint so the path is exactly
# /api/admin/scout-assistant/... rather than under /api/scout-assistant.
scout_admin_bp = Blueprint("scout_admin", __name__)

# User context cache - avoids 2 Firestore reads per message within 5 minutes
# 60s TTL: profile rarely changes, but recent_searches / recent_coffee_chat_preps
# / contacts.recent are activity-driven and feel stale at 5 min. 1 minute is the
# sweet spot - Scout reflects what the user just did without re-querying every
# turn of a single conversation.
_user_context_cache = TTLCache(maxsize=500, ttl=60)


def _sse_stream_from_queue(q, heartbeat_interval_s: float = 15.0,
                            real_timeout_s: float = 120.0):
    """Yield SSE frames from a thread-safe queue with keepalive heartbeats.

    Browsers and proxies drop SSE connections after ~60s of idle. We poll the
    queue every heartbeat_interval_s; on timeout we emit `event: heartbeat`
    instead of bailing out. We only declare a true `Stream timeout` after
    real_timeout_s of total silence (the LLM is actually stuck, not just slow).

    Stops when the producer puts `None` on the queue, when the client
    disconnects (GeneratorExit), or on real timeout.
    """
    elapsed_silence_s = 0.0
    try:
        while True:
            try:
                item = q.get(timeout=heartbeat_interval_s)
            except queue.Empty:
                elapsed_silence_s += heartbeat_interval_s
                if elapsed_silence_s >= real_timeout_s:
                    yield f"event: error\ndata: {json.dumps({'message': 'Stream timeout'})}\n\n"
                    return
                yield f"event: heartbeat\ndata: {json.dumps({})}\n\n"
                continue

            elapsed_silence_s = 0.0
            if item is None:
                return

            event = item.get("event", "token")
            data = item.get("data", {})
            yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
    except GeneratorExit:
        return


def _resume_to_text(user_data: dict) -> str:
    """Best resume representation for Scout.

    Prefers the full raw resume text (everything actually on the resume);
    falls back to a readable summary assembled from the structured
    resumeParsed fields (e.g. a LinkedIn-only profile with no uploaded
    resume). Capped so it cannot blow the prompt budget.
    """
    rp = user_data.get("resumeParsed")
    rp = rp if isinstance(rp, dict) else {}
    raw = (
        rp.get("rawText")
        or user_data.get("originalResumeText")
        or user_data.get("resumeText")
        or user_data.get("rawText")
        or (user_data.get("profile") or {}).get("resumeText")
        or ""
    )
    if isinstance(raw, str) and raw.strip():
        return raw.strip()[:6000]

    # No raw text - assemble from the structured resumeParsed fields.
    lines = []
    if rp.get("name"):
        lines.append(f"Name: {rp['name']}")
    edu = rp.get("education")
    if isinstance(edu, dict):
        e = ", ".join(
            str(edu[k])
            for k in ("school", "university", "degree", "major", "graduationYear")
            if edu.get(k)
        )
        if e:
            lines.append(f"Education: {e}")
    elif isinstance(edu, str) and edu.strip():
        lines.append(f"Education: {edu.strip()}")
    exp = rp.get("experience")
    if isinstance(exp, list) and exp:
        lines.append("Experience:")
        for item in exp[:6]:
            if isinstance(item, dict):
                head = " ".join(
                    p for p in [item.get("title"), "at" if item.get("company") else "", item.get("company")] if p
                ).strip()
                if head:
                    lines.append(f"  - {head}")
                desc = item.get("description") or item.get("summary") or ""
                if isinstance(desc, str) and desc.strip():
                    lines.append(f"    {desc.strip()[:300]}")
            elif isinstance(item, str) and item.strip():
                lines.append(f"  - {item.strip()[:200]}")
    skills = rp.get("skills")
    if isinstance(skills, list) and skills:
        lines.append("Skills: " + ", ".join(str(s) for s in skills[:30]))
    elif isinstance(skills, str) and skills.strip():
        lines.append("Skills: " + skills.strip()[:400])
    return "\n".join(lines)[:6000]


def _fetch_user_context(uid: str) -> dict:
    """Fetch user profile + contacts summary from Firestore for Scout context.
    Results are cached per uid for 5 minutes."""
    cached = _user_context_cache.get(uid)
    if cached is not None:
        return cached

    db = get_db()
    user_data = {}
    try:
        user_doc = db.collection("users").document(uid).get()
        if user_doc.exists:
            user_data = user_doc.to_dict() or {}
    except Exception as e:
        print(f"[ScoutAssistant] Failed to fetch user doc: {e}")
        return {}

    # Build compact user context
    user_context = {}

    # Academics
    academics = user_data.get("academics") or user_data.get("professionalInfo", {}).get("academics") or {}
    if academics:
        user_context["academics"] = {
            "university": academics.get("university", ""),
            "major": academics.get("major", ""),
            "graduation_year": academics.get("graduationYear", ""),
        }

    # Goals
    goals = user_data.get("goals") or {}
    if goals:
        user_context["goals"] = {
            "target_industries": goals.get("targetIndustries", []),
            "target_roles": goals.get("targetRoles", []),
            "dream_companies": goals.get("dreamCompanies", []),
            "recruiting_for": goals.get("recruitingFor", ""),
        }

    # Location
    location = user_data.get("location") or {}
    if location:
        user_context["location"] = {
            "preferred": location.get("preferred", ""),
            "current": location.get("current", ""),
        }

    # Email template preferences
    email_template = user_data.get("emailTemplate") or {}
    if email_template:
        user_context["email_template"] = {
            "purpose": email_template.get("purpose", "networking"),
            "style_preset": email_template.get("stylePreset"),
            "custom_instructions": (email_template.get("customInstructions") or "")[:200],
        }

    # Professional info
    prof_info = user_data.get("professionalInfo") or {}
    if prof_info:
        user_context["professional_info"] = {
            "current_role": prof_info.get("currentRole", ""),
            "experience_level": prof_info.get("experienceLevel", ""),
        }

    # Personal note (used for email personalization)
    personal_note = user_data.get("personalNote") or ""
    if personal_note:
        user_context["personal_note"] = personal_note[:300]

    # Resume - the full resume text so Scout can tailor answers to the user's
    # actual experience, skills, and education, not just a title one-liner.
    resume_full = _resume_to_text(user_data)
    if resume_full:
        user_context["resume"] = resume_full

    # Contacts summary (count + top companies + 5 most recent for naming)
    try:
        contacts_ref = db.collection("users").document(uid).collection("contacts").limit(50)
        contacts_docs = contacts_ref.get()
        contacts = [doc.to_dict() for doc in contacts_docs if doc.exists]
        if contacts:
            companies = {}
            for c in contacts:
                comp = (c.get("company") or c.get("job_company_name") or "").strip()
                if comp:
                    companies[comp] = companies.get(comp, 0) + 1
            top_companies = sorted(companies.items(), key=lambda x: -x[1])[:5]
            # Recent named contacts so Scout can say "you saved Riya Dhir at JPMorgan
            # last week" instead of just dumping aggregate counts.
            def _ts_of(c):
                t = c.get("savedAt") or c.get("createdAt") or c.get("addedAt")
                try:
                    return t.timestamp() if hasattr(t, "timestamp") else 0
                except Exception:
                    return 0
            recent = sorted(contacts, key=_ts_of, reverse=True)[:5]
            recent_named = []
            for c in recent:
                first = (c.get("FirstName") or c.get("firstName") or "").strip()
                last = (c.get("LastName") or c.get("lastName") or "").strip()
                title = (c.get("Title") or c.get("JobTitle") or c.get("jobTitle") or "").strip()
                comp = (c.get("Company") or c.get("company") or c.get("job_company_name") or "").strip()
                stage = (c.get("stage") or c.get("status") or "").strip()
                if first or last or comp:
                    recent_named.append({
                        "name": f"{first} {last}".strip() or "(unnamed)",
                        "title": title,
                        "company": comp,
                        "stage": stage,
                    })
            user_context["contacts_summary"] = {
                "total": len(contacts),
                "top_companies": [{"name": name, "count": count} for name, count in top_companies],
                "recent": recent_named,
            }
    except Exception as e:
        print(f"[ScoutAssistant] Failed to fetch contacts summary: {e}")

    # Recent search history - what the user has been looking for lately. The
    # client also passes this in user_memory (localStorage), but pulling from
    # Firestore here means Scout knows about searches done on other devices.
    try:
        history_ref = (
            db.collection("users").document(uid).collection("searchHistory")
            .limit(10)
        )
        history_docs = history_ref.get()
        history_items = []
        for d in history_docs:
            if not d.exists:
                continue
            data = d.to_dict() or {}
            prompt = (data.get("prompt") or data.get("query") or "").strip()
            if not prompt:
                continue
            history_items.append({
                "prompt": prompt[:140],
                "results": data.get("resultCount") or data.get("count"),
            })
        if history_items:
            user_context["recent_searches"] = history_items[:8]
    except Exception as e:
        print(f"[ScoutAssistant] Failed to fetch search history: {e}")

    # Recent meeting / interview prep - signals the user is actively
    # preparing for specific people, which Scout should reference.
    try:
        ccp_ref = (
            db.collection("users").document(uid).collection("coffee-chat-preps")
            .limit(5)
        )
        ccp_docs = ccp_ref.get()
        ccp_items = []
        for d in ccp_docs:
            if not d.exists:
                continue
            data = d.to_dict() or {}
            target = (data.get("contactName") or data.get("targetName")
                      or data.get("name") or "").strip()
            comp = (data.get("contactCompany") or data.get("company") or "").strip()
            if target or comp:
                ccp_items.append({"name": target, "company": comp})
        if ccp_items:
            user_context["recent_coffee_chat_preps"] = ccp_items
    except Exception as e:
        print(f"[ScoutAssistant] Failed to fetch meeting preps: {e}")

    # Account age - gives Scout a sense of whether this is a brand-new user
    # ("welcome to Offerloop") or a repeat user ("you've been here a while").
    try:
        created = user_data.get("createdAt") or user_data.get("created_at")
        if created and hasattr(created, "timestamp"):
            from datetime import datetime, timezone
            age_days = (datetime.now(timezone.utc).timestamp() - created.timestamp()) / 86400
            user_context["account_age_days"] = round(age_days, 1)
    except Exception:
        pass

    _user_context_cache[uid] = user_context
    return user_context


@scout_assistant_bp.route("/chat", methods=["POST", "OPTIONS"])
@require_firebase_auth
def scout_assistant_chat():
    """
    Main Scout assistant chat endpoint.

    NO CREDIT COST - This is a helper feature.

    Request body:
    {
        "message": "user's question",
        "conversation_history": [
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ],
        "current_page": "/contact-search",
        "user_info": {
            "name": "John",
            "tier": "free",
            "credits": 150,
            "max_credits": 300
        }
    }

    Response:
    {
        "message": "Scout's response text",
        "navigate_to": "/contact-search" or null,
        "action_buttons": [
            {"label": "Go to Contact Search", "route": "/contact-search"}
        ],
        "contacts_results": [...] or null,
        "email_preview": {...} or null,
        "tool_used": "search_saved_contacts" or null
    }
    """
    # Handle OPTIONS preflight
    if request.method == "OPTIONS":
        return jsonify({}), 200

    payload = request.get_json(force=True, silent=True) or {}

    # Extract request data
    message = (payload.get("message") or "")[:2000]
    conversation_history = payload.get("conversation_history", [])
    current_page = (payload.get("current_page") or "/home")[:200]
    user_info = payload.get("user_info", {})
    # chat_id resumes an existing persisted chat; None starts a fresh one
    # (the service creates the parent doc and returns the id in the response).
    chat_id_in = payload.get("chat_id")
    if isinstance(chat_id_in, str):
        chat_id_in = chat_id_in.strip()[:64] or None
    else:
        chat_id_in = None
    # user_memory: client-derived signals (recent searches, tried-and-failed
    # prompts, school×company combos exhausted in PDL). Cross-session context
    # the chat thread itself doesn't capture. Validated/sanitized in the
    # service when rendered into the system prompt.
    user_memory = payload.get("user_memory") or {}
    if not isinstance(user_memory, dict):
        user_memory = {}

    # Validate conversation_history: cap entries, cap content length, validate roles
    VALID_ROLES = {"user", "assistant"}
    MAX_HISTORY = 20
    MAX_ENTRY_CHARS = 2000
    if not isinstance(conversation_history, list):
        conversation_history = []
    sanitized_history = []
    for entry in conversation_history[:MAX_HISTORY]:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role", "")
        if role not in VALID_ROLES:
            continue
        content = (entry.get("content") or "")[:MAX_ENTRY_CHARS]
        sanitized_history.append({"role": role, "content": content})
    conversation_history = sanitized_history

    # Get user info from Firebase auth or request
    user_name = user_info.get("name", "there")
    tier = user_info.get("subscriptionTier", user_info.get("tier", "free"))
    credits = user_info.get("credits", 0)
    max_credits = user_info.get("max_credits", 300)

    # Try to get user info from Firebase context if available
    uid = None
    if hasattr(request, "firebase_user"):
        firebase_user = request.firebase_user
        uid = firebase_user.get("uid")
        if not user_name or user_name == "there":
            user_name = firebase_user.get("name", firebase_user.get("email", "").split("@")[0])

    # Fetch rich user context from Firestore
    user_context = _fetch_user_context(uid) if uid else {}
    print(f"[ScoutChat] uid={uid!r} user_context_keys={list(user_context.keys())}")

    try:
        result = run_async(
            scout_assistant_service.handle_chat(
                message=message,
                conversation_history=conversation_history,
                current_page=current_page,
                user_name=user_name,
                tier=tier,
                credits=credits,
                max_credits=max_credits,
                user_context=user_context,
                user_memory=user_memory,
                uid=uid,
                chat_id=chat_id_in,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[ScoutAssistant] Chat endpoint failed: {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        # Always return a valid response, even on error
        return jsonify({
            "tool": "answer",
            "message": "I'm having trouble right now. Please try again!",
            "navigate": None,
            "navigate_to": None,
            "action_buttons": [],
            "auto_populate": None,
            "chat_id": chat_id_in,
            "mode": "chat",
            "intent": None,
            "cta": None,
            "plan": None,
        }), 200  # Return 200 so frontend doesn't show error state


# ── D3: Briefing intent stream (Phase 3B) ─────────────────────────────────────
#
# Dedicated endpoint for the strategist briefing. Sits alongside /chat/stream
# rather than branching inside the chat handler so the bypass-Haiku decision
# is structural, not conditional - the briefing path simply never goes near
# the intent classifier. Reuses _sse_stream_from_queue from the chat path so
# the browser-side stream handling is identical (heartbeats included).

# Briefing-specific model + temperature. Same model the chat service uses; a
# slightly higher temperature than the chat default because briefings benefit
# from a touch of variety across openers.
_BRIEFING_MODEL = "gpt-4.1-mini"
_BRIEFING_TEMPERATURE = 0.5
# Max output tokens for the briefing prose. Each step renders as a header +
# 2-4 rationale bullets + CTA hint, so 5 steps fit comfortably in ~1500 toks.
_BRIEFING_MAX_OUTPUT_TOKENS = 1800
# Hard wall on how long we keep the queue alive for the streaming generator.
# Longer than the typical 4-8s briefing latency but short enough to bound
# stragglers; the route's heartbeat helper will still emit keepalives until
# this triggers.
_BRIEFING_GENERATE_TIMEOUT_S = 90


def _serialize_active_strategy(strategy):
    """Convert an active-strategy dict to JSON-safe primitives.

    strategy.get_active_strategy returns a dict containing datetime fields
    (created_at, updated_at, plus per-step completed_at after the D2
    migration). The SSE 'done' payload is JSON-encoded so the datetimes must
    become ISO strings before they leave the route.

    Returns None when there is no active strategy so the frontend can use a
    cheap truthy check (`active_strategy ? ... : null`).
    """
    if not strategy or not isinstance(strategy, dict):
        return None

    def _iso(v):
        return v.isoformat() if hasattr(v, "isoformat") else v

    safe_steps = []
    for step in (strategy.get("steps") or []):
        if not isinstance(step, dict):
            continue
        safe_steps.append({
            "title": step.get("title", ""),
            "detail": step.get("detail", ""),
            "rationale": step.get("rationale", ""),
            "feature": step.get("feature", ""),
            "route": step.get("route"),
            "prefill_payload": step.get("prefill_payload") or {},
            "done": bool(step.get("done")),
            "completed_at": _iso(step.get("completed_at")),
            "created_artifact_id": step.get("created_artifact_id") or None,
        })

    return {
        "id": strategy.get("id"),
        "goal": strategy.get("goal", ""),
        "steps": safe_steps,
        "created_at": _iso(strategy.get("created_at")),
        "updated_at": _iso(strategy.get("updated_at")),
    }


@scout_assistant_bp.route("/briefing/stream", methods=["POST", "OPTIONS"])
@require_firebase_auth
def scout_assistant_briefing_stream():
    """Stream the strategist briefing.

    The briefing path is structurally separate from /chat/stream: there is no
    Haiku intent classification, no helper-tool calls mid-turn, and no save_
    strategy auto-call (yet - that lands when the frontend reads the response
    and the strategy schema migration ships in a follow-up). The model gets
    the strategist prompt + a single user turn ("Produce my briefing now.")
    and we stream the prose back as `token` events with a final `done`.

    Payload (all optional except auth provides uid):
      {
        "user_info":  {"name", "subscriptionTier", "credits", "max_credits"},
        "current_page": str,
        "dontAutoSave": bool,   # reserved for later; not consumed yet
      }

    SSE events emitted:
      event: token       {"text": "chunk"}            (many)
      event: heartbeat   {}                            (every 15s of silence)
      event: done        {"message": full text, "coverage": {...}}
      event: error       {"message": str}
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    # Lazy imports: keep the module import cycle clean and let the route file
    # boot even when the LLM/Apify deps are unavailable in some environments.
    from app.services.openai_client import create_async_openai_client
    from app.services.scout.profile_coverage import compute_coverage
    from app.services.scout.strategist import build_strategist_prompt
    from app.services.scout import strategy as strategy_mod

    payload = request.get_json(force=True, silent=True) or {}
    user_info = payload.get("user_info") or {}
    if not isinstance(user_info, dict):
        user_info = {}
    tier = str(
        user_info.get("subscriptionTier") or user_info.get("tier") or "free"
    ).lower()

    uid = None
    if hasattr(request, "firebase_user"):
        uid = (request.firebase_user or {}).get("uid")

    # Load user context the same way /chat/stream does, then derive coverage
    # and active strategy. activity_since + recent posts intentionally land in
    # follow-up commits - they require additional reads and an Apify call we
    # do not want to gate the first briefing on while we are still validating
    # the strategist prompt against real users.
    user_context = _fetch_user_context(uid) if uid else {}
    coverage = None
    active_strategy = None
    if uid:
        try:
            raw_doc = get_db().collection("users").document(uid).get(timeout=8.0)
            raw_user = raw_doc.to_dict() if raw_doc.exists else {}
            coverage = compute_coverage(raw_user)
        except Exception as e:
            print(f"[ScoutBriefing] coverage read failed: {e}")
        try:
            active_strategy = strategy_mod.get_active_strategy(uid)
        except Exception as e:
            print(f"[ScoutBriefing] strategy read failed: {e}")

    system_prompt = build_strategist_prompt(
        user_context=user_context,
        active_strategy=active_strategy,
        activity_since=None,
        coverage=coverage,
        user_recent_posts=None,
        tier=tier,
    )

    q: queue.Queue = queue.Queue(maxsize=200)

    def _run_streaming():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            async def _run():
                client = create_async_openai_client()
                if client is None:
                    q.put({
                        "event": "error",
                        "data": {"message": "OpenAI client not configured."},
                    })
                    return

                accumulated_parts: list[str] = []
                try:
                    stream = await client.chat.completions.create(
                        model=_BRIEFING_MODEL,
                        temperature=_BRIEFING_TEMPERATURE,
                        max_tokens=_BRIEFING_MAX_OUTPUT_TOKENS,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {
                                "role": "user",
                                "content": (
                                    "Produce my briefing now. Follow the "
                                    "output shape rules in the system prompt: "
                                    "5-7 numbered steps, each with 3-5 "
                                    "rationale bullets that cite specific "
                                    "facts about me. Lead with Loop "
                                    "recommendations - that's how I get value "
                                    "from Offerloop. Name Loops by name and "
                                    "tell me what each Loop will do for me."
                                ),
                            },
                        ],
                        stream=True,
                    )
                    async for chunk in stream:
                        delta = chunk.choices[0].delta if chunk.choices else None
                        if not delta:
                            continue
                        token = getattr(delta, "content", None)
                        if token:
                            accumulated_parts.append(token)
                            q.put({"event": "token", "data": {"text": token}})

                    # Final structured payload. coverage is included so the
                    # gauge UI can render without a second round-trip; the
                    # active_strategy is serialized to JSON-safe primitives
                    # (datetimes -> ISO strings) so the strategy card can
                    # render checkboxes + completed_at timestamps inline.
                    q.put({
                        "event": "done",
                        "data": {
                            "message": "".join(accumulated_parts),
                            "coverage": coverage or {},
                            "active_strategy": _serialize_active_strategy(active_strategy),
                        },
                    })
                    # Phase 5 observability: success event. Lazy import keeps
                    # the route boot-resilient when events_service is down.
                    if uid:
                        try:
                            from app.services.events_service import log_event
                            log_event(
                                uid,
                                "scout.briefing.generated",
                                {
                                    "coverage_pct": (coverage or {}).get("coverage_pct", 0),
                                    "tier": tier,
                                    "tokens_out": len("".join(accumulated_parts)),
                                    "had_active_strategy": bool(active_strategy),
                                },
                            )
                        except Exception:
                            pass
                except Exception as e:
                    print(f"[ScoutBriefing] OpenAI stream error: {e}")
                    q.put({
                        "event": "error",
                        "data": {"message": "Briefing failed - try again."},
                    })

            loop.run_until_complete(
                asyncio.wait_for(_run(), timeout=_BRIEFING_GENERATE_TIMEOUT_S)
            )
        except asyncio.TimeoutError:
            q.put({
                "event": "error",
                "data": {"message": "Briefing took too long. Try again."},
            })
        except Exception as e:
            print(f"[ScoutBriefing] runner error: {e}")
            q.put({
                "event": "error",
                "data": {"message": "Something went wrong."},
            })
        finally:
            q.put(None)
            loop.close()

    threading.Thread(target=_run_streaming, daemon=True).start()

    return Response(
        _sse_stream_from_queue(q),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@scout_assistant_bp.route("/chat/stream", methods=["POST", "OPTIONS"])
@require_firebase_auth
def scout_assistant_chat_stream():
    """
    Streaming Scout assistant chat endpoint (SSE via POST).

    NO CREDIT COST - This is a helper feature.

    SSE events:
      event: intent   {"intent": "contacts"|"email"|"strategy"|"general"}
      event: token    {"text": "chunk of text"}
      event: done     {full response with message, navigate_to, action_buttons, etc.}
      event: error    {"message": "error description"}
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    payload = request.get_json(force=True, silent=True) or {}

    message = (payload.get("message") or "")[:2000]
    conversation_history = payload.get("conversation_history", [])
    current_page = (payload.get("current_page") or "/home")[:200]
    user_info = payload.get("user_info", {})
    chat_id_in = payload.get("chat_id")
    if isinstance(chat_id_in, str):
        chat_id_in = chat_id_in.strip()[:64] or None
    else:
        chat_id_in = None
    user_memory = payload.get("user_memory") or {}
    if not isinstance(user_memory, dict):
        user_memory = {}

    # Sanitize conversation history
    VALID_ROLES = {"user", "assistant"}
    MAX_HISTORY = 12
    MAX_ENTRY_CHARS = 2000
    if not isinstance(conversation_history, list):
        conversation_history = []
    sanitized_history = []
    for entry in conversation_history[:MAX_HISTORY]:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role", "")
        if role not in VALID_ROLES:
            continue
        content = (entry.get("content") or "")[:MAX_ENTRY_CHARS]
        sanitized_history.append({"role": role, "content": content})
    conversation_history = sanitized_history

    user_name = user_info.get("name", "there")
    tier = user_info.get("subscriptionTier", user_info.get("tier", "free"))
    credits = user_info.get("credits", 0)
    max_credits = user_info.get("max_credits", 300)

    uid = None
    if hasattr(request, "firebase_user"):
        firebase_user = request.firebase_user
        uid = firebase_user.get("uid")
        if not user_name or user_name == "there":
            user_name = firebase_user.get("name", firebase_user.get("email", "").split("@")[0])

    user_context = _fetch_user_context(uid) if uid else {}

    # Use a thread-safe queue to bridge async streaming to Flask's sync generator
    q = queue.Queue(maxsize=100)

    def _run_streaming():
        """Run the async streaming in a background thread with its own event loop."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            async_queue = asyncio.Queue()

            async def _run():
                """Producer: run handle_chat_stream which pushes events to async_queue.
                Consumer: drain async_queue to the thread-safe queue."""

                async def _produce():
                    try:
                        await scout_assistant_service.handle_chat_stream(
                            message=message,
                            conversation_history=conversation_history,
                            current_page=current_page,
                            user_name=user_name,
                            tier=tier,
                            credits=credits,
                            max_credits=max_credits,
                            user_context=user_context,
                            user_memory=user_memory,
                            uid=uid,
                            chat_id=chat_id_in,
                            queue=async_queue,
                        )
                    except Exception as exc:
                        print(f"[ScoutAssistant] Stream producer error: {exc}")
                        await async_queue.put({"event": "error", "data": {"message": "Something went wrong"}})
                        await async_queue.put(None)

                async def _consume():
                    while True:
                        item = await async_queue.get()
                        q.put(item)
                        if item is None:
                            break

                # Run producer and consumer concurrently
                await asyncio.gather(_produce(), _consume())

            loop.run_until_complete(_run())
        except Exception as exc:
            print(f"[ScoutAssistant] Streaming thread error: {exc}")
            q.put({"event": "error", "data": {"message": "Something went wrong"}})
            q.put(None)
        finally:
            loop.close()

    thread = threading.Thread(target=_run_streaming, daemon=True)
    thread.start()

    return Response(
        _sse_stream_from_queue(q),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@scout_assistant_bp.route("/search-help", methods=["POST", "OPTIONS"])
@require_firebase_auth
def scout_search_help():
    """
    Scout assistant endpoint for failed search help.
    
    NO CREDIT COST - This is a helper feature.
    
    Request body:
    {
        "search_type": "contact" or "firm",
        "failed_search_params": {
            "job_title": "...",  // for contact search
            "company": "...",
            "location": "...",
            // OR for firm search:
            "industry": "...",
            "location": "...",
            "size": "..."
        },
        "error_type": "no_results" or "error",
        "user_info": {
            "name": "John"
        }
    }
    
    Response:
    {
        "message": "Scout's helpful message",
        "suggestions": ["Alternative 1", "Alternative 2", ...],
        "auto_populate": {
            "job_title": "...",  // for contact
            "company": "...",
            "location": "..."
            // OR for firm:
            "industry": "...",
            "location": "...",
            "size": "..."
        },
        "search_type": "contact" or "firm",
        "action": "retry_search"
    }
    """
    # Handle OPTIONS preflight
    if request.method == "OPTIONS":
        return jsonify({}), 200
    
    payload = request.get_json(force=True, silent=True) or {}
    
    # Extract request data
    search_type = payload.get("search_type", "contact")
    failed_search_params = payload.get("failed_search_params", {})
    error_type = payload.get("error_type", "no_results")
    user_info = payload.get("user_info", {})
    
    # Get user name
    user_name = user_info.get("name", "there")
    
    # Try to get user info from Firebase context if available
    if hasattr(request, "firebase_user"):
        firebase_user = request.firebase_user
        if not user_name or user_name == "there":
            user_name = firebase_user.get("name", firebase_user.get("email", "").split("@")[0])
    
    try:
        result = run_async(
            scout_assistant_service.handle_search_help(
                search_type=search_type,
                failed_search_params=failed_search_params,
                error_type=error_type,
                user_name=user_name,
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[ScoutAssistant] Search help endpoint failed: {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        
        # Return a basic fallback response
        if search_type == "contact":
            return jsonify({
                "message": "I couldn't find contacts matching your search. Try using different job titles or a broader location.",
                "suggestions": [],
                "auto_populate": failed_search_params,
                "search_type": "contact",
                "action": "retry_search",
            }), 200
        else:
            return jsonify({
                "message": "I couldn't find firms matching your search. Try using different industry terms or a broader location.",
                "suggestions": [],
                "auto_populate": failed_search_params,
                "search_type": "firm",
                "action": "retry_search",
            }), 200


@scout_assistant_bp.route("/chats", methods=["GET", "OPTIONS"])
@require_firebase_auth
def scout_assistant_list_chats():
    """List recent persisted chats for the sidebar (Pro/Elite).

    Tier gating happens inside chat_persistence.list_chats: Free callers get
    at most one chat back, Pro/Elite get up to ?limit (default 20). The
    sidebar is a Pro/Elite surface; we still serve Free here so the panel
    can show the current chat row consistently.

    Query params:
      limit  - optional, max chats to return for Pro/Elite (default 20)
    Response:
      { "chats": [ {chat_id, title, created_at, last_active_at,
                    message_count, active_strategy_id, tier_when_created,
                    expires_at}, ... ] }
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    uid = None
    if hasattr(request, "firebase_user"):
        uid = request.firebase_user.get("uid")
    if not uid:
        return jsonify({"chats": []}), 401

    tier = (request.firebase_user.get("subscriptionTier")
            or request.firebase_user.get("tier")
            or "free")
    # The token's tier claim is informational; treat the user doc as the
    # source of truth so a stale token does not show the wrong sidebar.
    try:
        snap = get_db().collection("users").document(uid).get()
        data = snap.to_dict() or {}
        tier = data.get("subscriptionTier") or data.get("tier") or tier or "free"
    except Exception as e:
        print(f"[ScoutAssistant] list_chats tier read failed: {e}")

    try:
        raw_limit = int(request.args.get("limit", 20))
    except (TypeError, ValueError):
        raw_limit = 20
    limit = max(1, min(50, raw_limit))

    try:
        chats = chat_list_chats(uid, tier, limit=limit)
    except Exception as exc:
        print(f"[ScoutAssistant] list_chats failed: {type(exc).__name__}: {exc}")
        return jsonify({"chats": []}), 200

    return jsonify({"chats": chats, "tier": tier})


@scout_assistant_bp.route("/chats/<chat_id>", methods=["GET", "OPTIONS"])
@require_firebase_auth
def scout_assistant_get_chat(chat_id: str):
    """Load a single chat's parent doc + messages for resume in the sidebar.

    Returns 200 with the chat envelope on success, or 200 with {"chat": null,
    "messages": []} when the chat does not exist (the frontend recovers by
    starting a fresh thread; never serve a 404 here, which would route the
    user into the global error path).
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    uid = None
    if hasattr(request, "firebase_user"):
        uid = request.firebase_user.get("uid")
    if not uid:
        return jsonify({"chat": None, "messages": []}), 401

    chat_id = (chat_id or "").strip()[:64]
    if not chat_id:
        return jsonify({"chat": None, "messages": []}), 200

    try:
        result = chat_get_chat(uid, chat_id)
    except Exception as exc:
        print(f"[ScoutAssistant] get_chat failed: {type(exc).__name__}: {exc}")
        return jsonify({"chat": None, "messages": []}), 200

    if not result.get("ok"):
        return jsonify({"chat": None, "messages": []}), 200

    return jsonify({
        "chat": result.get("chat"),
        "messages": result.get("messages") or [],
    })


@scout_assistant_bp.route("/health", methods=["GET"])
def scout_assistant_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "scout-assistant"})


def _check_scout_admin():
    """(is_admin, error_response_or_None). Mirrors the audit-endpoint guard: a
    Bearer Firebase token whose uid is in the ADMIN_UIDS env var."""
    admin_uids = {u.strip() for u in os.getenv("ADMIN_UIDS", "").split(",") if u.strip()}
    if not admin_uids:
        return False, (jsonify({"error": "ADMIN_UIDS not configured"}), 500)
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return False, (jsonify({"error": "Unauthorized"}), 401)
    from firebase_admin import auth as fb_auth
    try:
        decoded = fb_auth.verify_id_token(
            auth_header.split("Bearer ", 1)[1], clock_skew_seconds=5
        )
    except Exception:
        return False, (jsonify({"error": "Invalid token"}), 401)
    if decoded.get("uid") not in admin_uids:
        return False, (jsonify({"error": "Forbidden"}), 403)
    return True, None


@scout_admin_bp.route("/api/admin/scout-assistant/metrics", methods=["GET"])
def scout_assistant_metrics():
    """Admin-only Scout cost/latency metrics, last 24h. No PII in the response.

    Aggregates the scout_metrics collection: turn share, average cost, and
    average latency per tier (regex / navigate cache / answer cache / llm),
    the near-miss cosine distribution, and the top cached intents (each a
    de-identified, 80-char-truncated message).
    """
    is_admin, err = _check_scout_admin()
    if not is_admin:
        return err
    from app.services.scout import metrics
    from app.services.scout.cache import navigate_cache, answer_cache
    summary = metrics.summary_last_24h()
    summary["cache"] = {
        "navigate": navigate_cache.stats(),
        "answer": answer_cache.stats(),
    }
    return jsonify(summary)

