"""
agent_send_gate — pure-ish helpers for deciding whether a Loop is allowed
to send an email to a contact on the student's behalf.

The Loop pipeline today (Phase 8) creates Gmail drafts; the student opens
Gmail and clicks Send manually. Phase 9 wires the actual send path behind
this gate.

The gate runs SIX checks in cheap-to-expensive order. The most expensive
check (Hunter email verification — a paid API call) runs last so a Loop
that hits a cheaper failure (wrong mode, free tier, quiet hours, etc.)
never burns Hunter spend.

Used by:
  - agent_actions.execute_find_and_draft, right after the Gmail draft is
    created (Phase C step 7). If allowed, the caller invokes
    gmail_client.send_email_for_user and stamps the message + thread ids
    onto the contact doc.
  - routes/loops.approve_contact_send, the first-N approval endpoint. That
    caller skips the FIRST_N check (the whole point is the user is
    approving manually) but runs every other check including Hunter.

Design notes:
  - Functions are injectable (the verify_email_fn / get_sends_today_fn
    keyword args). Tests pass stubs so no Firestore / Hunter contact
    happens during unit tests.
  - Verification cache: contact docs persist `emailVerifiedAt` (ISO ts)
    and `emailVerificationStatus` ('valid' | 'invalid' | etc.). When a
    cached verification is < 30 days old, the gate uses it and skips the
    paid Hunter call. Result format is identical so callers don't need to
    care whether the verification was cached or fresh.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal

from app.services.loop_budget import (
    QUIET_HOUR_END,
    QUIET_HOUR_START,
    _user_local_hour,
)

logger = logging.getLogger(__name__)

# How long a Hunter verification result is trusted before we re-verify.
# Email-deliverability state DOES drift (people leave companies, domains
# go dark) so we don't trust forever. 30 days matches the industry norm
# for cold-outreach verification caching.
VERIFICATION_CACHE_DAYS = 30

GateReason = Literal[
    "mode_not_send",       # Loop is in approve_each or draft_only — not asking us to send
    "no_email",            # contact has no email on file (PDL find returned blank)
    "tier_no_autosend",    # free tier — auto-send is Pro/Elite only
    "quiet_hours",         # outside 8a-10p user-local; defer to next cycle
    "first_n_pending",     # student hasn't approved enough sends yet (autoSendApprovedCount < autoSendApprovedAfter)
    "gmail_not_connected", # no users/{uid}/integrations/gmail doc, or it's missing a refresh_token
    "daily_cap",           # sendsToday at the tier or hardDailySendCap ceiling
    "email_unverified",    # Hunter says risky / invalid / unknown — fall back to draft-only
]


def _default_gmail_connected(uid: str) -> bool:
    """Default Firestore-backed check for whether the user has connected
    Gmail. We require a refresh_token specifically — without it, the auto-
    refresh path in gmail_client._load_user_gmail_creds can't recover from
    an expired access token, which is the common state for background
    sends fired hours after the user last touched the browser."""
    try:
        from app.extensions import get_db
        db = get_db()
        if not db:
            return False
        snap = (
            db.collection("users").document(uid)
              .collection("integrations").document("gmail").get()
        )
        if not snap.exists:
            return False
        return bool((snap.to_dict() or {}).get("refresh_token"))
    except Exception:
        logger.exception("gmail_connected_check_failed uid=%s", uid)
        return False


def _verification_is_fresh(contact: dict, now_utc: datetime) -> bool:
    """True if the contact's cached Hunter verification is within the
    VERIFICATION_CACHE_DAYS window."""
    ts = contact.get("emailVerifiedAt")
    if not ts:
        return False
    try:
        verified_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return False
    return (now_utc - verified_at) < timedelta(days=VERIFICATION_CACHE_DAYS)


def can_auto_send(
    uid: str,
    tier: str,
    loop: dict,
    contact: dict,
    user_timezone: str | None = None,
    now: datetime | None = None,
    *,
    verify_email_fn: Callable[[str], dict | None] | None = None,
    get_sends_today_fn: Callable[[str], int] | None = None,
    gmail_connected_fn: Callable[[str], bool] | None = None,
) -> dict:
    """Run the 6-step send gate.

    Args:
        uid: Firebase uid.
        tier: 'free' | 'pro' | 'elite'.
        loop: The Loop doc (must contain autoSendMode, autoSendApprovedCount,
            autoSendApprovedAfter, optional hardDailySendCap).
        contact: The contact doc (must contain 'email'; may contain
            'emailVerifiedAt' + 'emailVerificationStatus' for cache hits).
        user_timezone: e.g. 'America/Los_Angeles'. Defaults to PT.
        now: For test injection. Defaults to UTC now.
        verify_email_fn: Stub for tests. Defaults to hunter.verify_email_hunter.
        get_sends_today_fn: Stub for tests. Defaults to auth.get_sends_today.

    Returns:
        {
            'allowed': bool,
            'reason': GateReason | None,    # None when allowed
            'verification': dict | None,    # populated only on Hunter calls
                                            # (fresh or cached); the caller can
                                            # stamp this onto the contact doc
                                            # to bump the cache window
            'effective_cap': int | None,    # the cap that gated daily_cap
                                            # (useful for pause-pill copy)
        }
    """
    now = now or datetime.now(timezone.utc)

    # 1. Loop is in the right mode
    if loop.get("autoSendMode") != "send_for_me":
        return _denied("mode_not_send")

    # 2. Contact has an email (free check — no Firestore read)
    email = (contact.get("email") or "").strip()
    if not email:
        return _denied("no_email")

    # 3. Tier supports auto-send at all
    if tier not in ("pro", "elite"):
        return _denied("tier_no_autosend")

    # 4. Quiet hours — same window the cycle scheduler uses (8a-10p user-local)
    hour = _user_local_hour(now, user_timezone)
    if hour < QUIET_HOUR_START or hour >= QUIET_HOUR_END:
        return _denied("quiet_hours")

    # 5. First-N approval gate — until the student has manually approved
    #    autoSendApprovedAfter sends, drafts queue for review even on a
    #    Loop configured as send_for_me. The approve-send endpoint is the
    #    only thing that bumps autoSendApprovedCount.
    #
    # NOTE on `is not None`: we used to write `loop.get("k", default) or default`
    # which silently turned the no-warmup value 0 into the legacy default 5,
    # because `0 or 5 == 5` in Python. Defaulting to 0 is the new norm
    # (autoSendApprovedAfter=0 = no warmup gate), so the guard has to
    # distinguish "missing" from "explicitly zero."
    raw_count = loop.get("autoSendApprovedCount")
    raw_after = loop.get("autoSendApprovedAfter")
    approved_count = int(raw_count) if raw_count is not None else 0
    approved_after = int(raw_after) if raw_after is not None else 0
    if approved_count < approved_after:
        return _denied("first_n_pending")

    # 6. Gmail must actually be connected with a refresh token. Without
    #    this, send_email_for_user would raise "No Gmail credentials" or
    #    "no refresh token available" and we'd stamp the contact with a
    #    confusing autoSendError instead of an actionable
    #    autoSendPausedReason. Fail fast here so the /tracker pill can
    #    render "Connect Gmail to enable auto-send →".
    check_gmail = gmail_connected_fn or _default_gmail_connected
    if not check_gmail(uid):
        return _denied("gmail_not_connected")

    # 7. Daily cap — pre-flight read (non-atomic). The real reservation
    #    happens in increment_sends_today_atomic at the call site; a small
    #    race window where two sends pass this check and only one
    #    increments is acceptable (the loser just doesn't send).
    from app.config import TIER_CONFIGS
    tier_cap = int(TIER_CONFIGS.get(tier, TIER_CONFIGS["free"]).get("max_auto_sends_per_day", 0))
    hard_cap = loop.get("hardDailySendCap")
    effective_cap = tier_cap if hard_cap is None else min(tier_cap, int(hard_cap))

    if get_sends_today_fn is None:
        from app.services.auth import get_sends_today as _default_sends_today
        get_sends_today_fn = _default_sends_today
    sends_today = int(get_sends_today_fn(uid))
    if sends_today >= effective_cap:
        return {
            "allowed": False,
            "reason": "daily_cap",
            "verification": None,
            "effective_cap": effective_cap,
        }

    # 7. Email verification (the only paid call — runs last).
    #    Check the per-contact cache before hitting Hunter; 30-day TTL.
    verification: dict | None = None
    if _verification_is_fresh(contact, now):
        verification = {
            "email": email,
            "status": contact.get("emailVerificationStatus", "unknown"),
            "verifiedAt": contact.get("emailVerifiedAt"),
            "source": "cache",
        }
    else:
        if verify_email_fn is None:
            from app.services.hunter import verify_email_hunter as _default_verify
            verify_email_fn = _default_verify
        try:
            raw = verify_email_fn(email)
        except Exception as e:
            logger.warning("hunter_verify_failed uid=%s email=%s err=%s", uid, email, e)
            raw = None

        if not raw:
            return _denied("email_unverified")

        verification = {
            "email": email,
            "status": raw.get("status", "unknown"),
            "score": raw.get("score"),
            "verifiedAt": now.isoformat(),
            "source": "hunter",
        }

    if verification["status"] != "valid":
        return {
            "allowed": False,
            "reason": "email_unverified",
            "verification": verification,
            "effective_cap": effective_cap,
        }

    # All checks passed.
    return {
        "allowed": True,
        "reason": None,
        "verification": verification,
        "effective_cap": effective_cap,
    }


def _denied(reason: GateReason) -> dict:
    """Shorthand for the early-return denial shape."""
    return {
        "allowed": False,
        "reason": reason,
        "verification": None,
        "effective_cap": None,
    }
