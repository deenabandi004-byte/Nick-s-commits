"""
Scout Assistant API endpoints - Product assistant for helping users navigate Offerloop.

This is a FREE feature - no credits are charged for using Scout assistant.
"""
from __future__ import annotations

import asyncio
import json
import queue
import threading

from flask import Blueprint, jsonify, request, g, Response
from cachetools import TTLCache

from app.services.scout_assistant_service import scout_assistant_service
from app.extensions import require_firebase_auth, get_db
from app.utils.async_runner import run_async

scout_assistant_bp = Blueprint("scout_assistant", __name__, url_prefix="/api/scout-assistant")

# User context cache - avoids 2 Firestore reads per message within 5 minutes
# 60s TTL: profile rarely changes, but recent_searches / recent_coffee_chat_preps
# / contacts.recent are activity-driven and feel stale at 5 min. 1 minute is the
# sweet spot - Scout reflects what the user just did without re-querying every
# turn of a single conversation.
_user_context_cache = TTLCache(maxsize=500, ttl=60)


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

    # Resume summary (compact)
    resume_parsed = user_data.get("resumeParsed") or {}
    if resume_parsed:
        summary_parts = []
        if resume_parsed.get("name"):
            summary_parts.append(f"Name: {resume_parsed['name']}")
        if resume_parsed.get("experience"):
            exp_list = resume_parsed["experience"]
            if isinstance(exp_list, list):
                recent = exp_list[:3]
                exp_strs = []
                for exp in recent:
                    if isinstance(exp, dict):
                        exp_strs.append(f"{exp.get('title', '')} at {exp.get('company', '')}")
                    elif isinstance(exp, str):
                        exp_strs.append(exp[:80])
                if exp_strs:
                    summary_parts.append("Experience: " + "; ".join(exp_strs))
        if resume_parsed.get("skills"):
            skills = resume_parsed["skills"]
            if isinstance(skills, list):
                summary_parts.append("Skills: " + ", ".join(skills[:10]))
            elif isinstance(skills, str):
                summary_parts.append(f"Skills: {skills[:150]}")
        if summary_parts:
            user_context["resume_summary"] = " | ".join(summary_parts)

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
            )
        )
        return jsonify(result)
    except Exception as exc:
        print(f"[ScoutAssistant] Chat endpoint failed: {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        # Always return a valid response, even on error
        return jsonify({
            "message": "I'm having trouble right now. Please try again!",
            "navigate_to": None,
            "action_buttons": [],
            "auto_populate": None,
        }), 200  # Return 200 so frontend doesn't show error state


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

    def _sse_generator():
        """Yield SSE events from the thread-safe queue."""
        try:
            while True:
                try:
                    item = q.get(timeout=60)  # 60s max wait per event
                except queue.Empty:
                    yield f"event: error\ndata: {json.dumps({'message': 'Stream timeout'})}\n\n"
                    return

                if item is None:
                    return  # End of stream

                event = item.get("event", "token")
                data = item.get("data", {})
                yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
        except GeneratorExit:
            # Client disconnected - thread will clean up naturally
            pass

    return Response(
        _sse_generator(),
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


@scout_assistant_bp.route("/health", methods=["GET"])
def scout_assistant_health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "scout-assistant"})

