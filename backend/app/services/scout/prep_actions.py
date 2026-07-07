"""Scout execute action: run a real meeting prep from chat.

Powers "prep me for my call with Veronica Wittig": resolve the named person
in users/{uid}/contacts, take their stored LinkedIn URL, run the SAME guard
sequence as the HTTP route (app/routes/coffee_chat_prep.py
create_coffee_chat_prep; keep the two in sync), charge COFFEE_CHAT_CREDITS
atomically, and spawn the same background worker the Meeting Prep page uses.
Returns immediately with prep_id; the frontend polls
/api/coffee-chat-prep/<prep_id> exactly like the page does, and posts the
finished digest + PDF link back into the chat.

Every failure returns a structured `code` the model reports honestly instead
of claiming the prep started.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _db():
    try:
        from app.extensions import get_db
        return get_db()
    except Exception:
        return None


def _text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return "" if value is None else str(value)


def _contact_name(doc: Dict[str, Any]) -> str:
    first = _text(doc.get("FirstName") or doc.get("firstName")).strip()
    last = _text(doc.get("LastName") or doc.get("lastName")).strip()
    return f"{first} {last}".strip() or _text(doc.get("name")).strip()


def _contact_linkedin(doc: Dict[str, Any]) -> str:
    for key in ("LinkedIn", "linkedin", "linkedinUrl", "linkedin_url", "LinkedInUrl"):
        v = _text(doc.get(key)).strip()
        if v and "linkedin.com" in v.lower():
            return v
    return ""


def _normalize_linkedin_url(url: str) -> str:
    """Match the route's normalization (query/fragment dropped, no trailing
    slash) so dedup and enrichment agree."""
    url = (url or "").strip().split("?")[0].split("#")[0]
    return url.rstrip("/")


def _resolve_contact(db, uid: str, contact_name: str) -> Optional[Dict[str, Any]]:
    """Case-insensitive substring match on the saved contact's name, same
    matching style as outreach_actions.draft_emails_to_contacts."""
    wanted = (contact_name or "").strip().lower()
    if not wanted:
        return None
    try:
        for snap in db.collection("users").document(uid).collection("contacts").stream():
            d = snap.to_dict() or {}
            d["_id"] = snap.id
            if wanted in _contact_name(d).lower():
                return d
    except Exception as e:
        logger.warning("[ScoutPrep] contact read failed: %s", e)
    return None


def start_meeting_prep(
    uid: str,
    contact_name: str = "",
    linkedin_url: str = "",
) -> Dict[str, Any]:
    """Start a meeting prep job for a saved contact (or an explicit URL).

    Returns {"started": True, "prep_id", "contact_name", "credits_charged"}
    on success, or {"started": False, "error", "code"} on any guard failure.
    Credits are deducted before the thread spawns; the background worker
    refunds them if the job later fails (existing behavior).
    """
    failed = {"started": False}
    if not uid:
        return {**failed, "error": "sign in required", "code": "AUTH_REQUIRED"}

    from app.services.feature_flags import PDL_OUTAGE_ACTIVE
    if PDL_OUTAGE_ACTIVE:
        return {
            **failed,
            "error": "Meeting prep is temporarily unavailable due to a data provider update",
            "code": "PDL_OUTAGE",
        }

    db = _db()
    if db is None:
        return {**failed, "error": "database unavailable", "code": "UNAVAILABLE"}

    contact_name = (contact_name or "").strip()
    linkedin_url = _normalize_linkedin_url(linkedin_url)

    # ---- resolve the person --------------------------------------------
    if not linkedin_url:
        if not contact_name:
            return {**failed, "error": "no person named", "code": "CONTACT_NOT_FOUND"}
        contact = _resolve_contact(db, uid, contact_name)
        if contact is None:
            return {
                **failed,
                "error": f"{contact_name} is not in your saved contacts",
                "code": "CONTACT_NOT_FOUND",
            }
        contact_name = _contact_name(contact) or contact_name
        linkedin_url = _normalize_linkedin_url(_contact_linkedin(contact))
        if not linkedin_url:
            return {
                **failed,
                "error": f"{contact_name} is saved but has no LinkedIn URL on file",
                "code": "NO_LINKEDIN",
            }

    # ---- guard sequence (mirrors create_coffee_chat_prep) ---------------
    from app.config import COFFEE_CHAT_CREDITS, TIER_CONFIGS
    from app.services.auth import (
        can_access_feature,
        check_and_reset_credits,
        check_and_reset_usage,
        deduct_credits_atomic,
    )

    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        return {**failed, "error": "account not found", "code": "AUTH_REQUIRED"}
    user_data = user_doc.to_dict() or {}

    credits_available = check_and_reset_credits(user_ref, user_data)
    check_and_reset_usage(user_ref, user_data)

    if credits_available < COFFEE_CHAT_CREDITS:
        return {
            **failed,
            "error": (
                f"needs {COFFEE_CHAT_CREDITS} credits, "
                f"only {credits_available} available"
            ),
            "code": "INSUFFICIENT_CREDITS",
            "credits_needed": COFFEE_CHAT_CREDITS,
            "current_credits": credits_available,
        }

    tier = user_data.get("subscriptionTier") or user_data.get("tier", "free")
    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS["free"])
    allowed, reason = can_access_feature(tier, "coffee_chat_prep", user_data, tier_config)
    if not allowed:
        limit = tier_config.get("coffee_chat_preps", 0)
        return {
            **failed,
            "error": "meeting prep limit reached for this plan",
            "code": "LIMIT_REACHED",
            "current_usage": user_data.get("coffeeChatPrepsUsed", 0),
            "limit": limit,
            "tier": tier,
            "reason": reason,
        }

    resume_text = user_data.get("resumeText")
    has_profile_fallback = any(
        [
            resume_text,
            user_data.get("resumeParsed"),
            user_data.get("firstName"),
            user_data.get("name"),
        ]
    )
    if not has_profile_fallback:
        return {
            **failed,
            "error": "resume required: upload one in Account Settings first",
            "code": "NEEDS_RESUME",
        }

    success, _balance = deduct_credits_atomic(uid, COFFEE_CHAT_CREDITS, "coffee_chat_prep")
    if not success:
        return {
            **failed,
            "error": "insufficient credits",
            "code": "INSUFFICIENT_CREDITS",
            "credits_needed": COFFEE_CHAT_CREDITS,
        }

    # ---- create the prep doc + spawn the worker --------------------------
    prep_data = {
        "linkedinUrl": linkedin_url,
        "status": "processing",
        "stage": "processing",
        "stageLabel": "Starting...",
        "progressPct": 0,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "userId": uid,
        "userEmail": user_data.get("email", ""),
        "source": "scout_chat",
    }
    prep_ref = (
        db.collection("users").document(uid).collection("coffee-chat-preps").document()
    )
    prep_ref.set(prep_data)
    prep_id = prep_ref.id

    # The worker lives with the HTTP route; import lazily to keep this module
    # importable in tests without the Flask app.
    from app.routes.coffee_chat_prep import process_coffee_chat_prep_background

    thread = threading.Thread(
        target=process_coffee_chat_prep_background,
        args=(prep_id, linkedin_url, uid, resume_text, {}, user_data),
        daemon=True,
    )
    thread.start()

    try:
        from app.utils.metrics_events import log_event
        log_event(uid, "coffee_chat_prep_used", {
            "auto_triggered": False,
            "source": "scout_chat",
        })
    except Exception as e:
        logger.warning("[ScoutPrep] metrics log failed: %s", e)

    return {
        "started": True,
        "prep_id": prep_id,
        "contact_name": contact_name,
        "credits_charged": COFFEE_CHAT_CREDITS,
        "estimated_seconds": 60,
    }
