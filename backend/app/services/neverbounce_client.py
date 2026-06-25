"""NeverBounce SMTP email verifier.

Single-check API: POST https://api.neverbounce.com/v4/single/check
Returns one of {valid, invalid, accept_all, disposable, unknown, catchall}.

Used to upgrade pattern-synthesized emails (Tier 3 of the email waterfall) from
"best guess" to "SMTP-confirmed deliverable" before the contact reaches the user.

Cost: ~$0.005 per check. Graceful no-op when NEVERBOUNCE_API_KEY is unset.
"""
from __future__ import annotations

import logging
import os
import threading
import time

import requests

from app.services.metering import meter_call

logger = logging.getLogger(__name__)

NEVERBOUNCE_API_KEY = os.getenv("NEVERBOUNCE_API_KEY", "")
NEVERBOUNCE_BASE_URL = "https://api.neverbounce.com/v4"

# Circuit breaker: when the account is out of credits (or auth fails), EVERY
# verify_email call returns the same account-wide failure. Re-calling the API
# for each email in each search wastes time and pollutes logs. Trip a cooldown
# on the first such failure so the whole upgrade pass is skipped until it
# elapses — self-heals once credits are topped up.
_circuit_lock = threading.Lock()
_disabled_until = 0.0  # epoch seconds; treat NeverBounce as unconfigured until then
DISABLE_COOLDOWN = 600.0  # 10 min — credit/quota issues don't resolve in seconds


def _is_disabled() -> bool:
    with _circuit_lock:
        return time.time() < _disabled_until


def _trip_disable(reason: str):
    global _disabled_until
    with _circuit_lock:
        _disabled_until = time.time() + DISABLE_COOLDOWN
    logger.warning("neverbounce disabled for %.0fs: %s", DISABLE_COOLDOWN, reason)

# NeverBounce v4 result codes (per docs). We canonicalize to a small enum so
# the caller (hunter.batch_verify_emails_for_contacts) doesn't need to know
# NeverBounce-specific values.
RESULT_VALID = "valid"
RESULT_INVALID = "invalid"
RESULT_ACCEPT_ALL = "accept_all"
RESULT_DISPOSABLE = "disposable"
RESULT_UNKNOWN = "unknown"
RESULT_CATCHALL = "catchall"

_EMPTY_RESULT = {"result": RESULT_UNKNOWN, "flags": [], "suggested_correction": None}


def is_configured() -> bool:
    # Report unconfigured during a cooldown so callers skip the upgrade pass.
    return bool(NEVERBOUNCE_API_KEY) and not _is_disabled()


@meter_call("neverbounce", "single_check")
def verify_email(email: str, *, timeout: float = 5.0) -> dict:
    """Verify a single email via NeverBounce.

    Returns: {'result': str, 'flags': list, 'suggested_correction': str|None}
    On missing API key, network error, or non-200 response: returns RESULT_UNKNOWN
    (graceful degradation — caller treats this as "leave the email as-is").
    """
    if not email or "@" not in email:
        return dict(_EMPTY_RESULT)

    if not NEVERBOUNCE_API_KEY:
        # Key not configured — no-op. Don't log on every call; would be spammy.
        return dict(_EMPTY_RESULT)

    if _is_disabled():
        # Recent account-wide failure (e.g. out of credits) — skip the API call.
        return dict(_EMPTY_RESULT)

    try:
        start = time.time()
        resp = requests.get(
            f"{NEVERBOUNCE_BASE_URL}/single/check",
            params={
                "key": NEVERBOUNCE_API_KEY,
                "email": email,
                # Don't fetch full address_info / credits_info — we don't use them
                "address_info": 0,
                "credits_info": 0,
                "timeout": int(min(15, max(3, timeout))),
            },
            timeout=timeout,
        )
        elapsed = time.time() - start

        if resp.status_code != 200:
            logger.warning(
                "neverbounce.verify_email non-200 (%s) for %s in %.2fs",
                resp.status_code, email, elapsed,
            )
            return dict(_EMPTY_RESULT)

        data = resp.json() or {}
        # NeverBounce returns status='success' on success; non-success means
        # auth / quota / param issue — treat as unknown.
        if data.get("status") != "success":
            status = data.get("status")
            message = data.get("message", "")
            logger.warning(
                "neverbounce.verify_email status=%s for %s: %s",
                status, email, message[:200],
            )
            # Account-wide failures (out of credits, bad/expired key) will hit
            # every email — trip the breaker so the rest of this search and the
            # next several skip NeverBounce entirely instead of re-calling it.
            if status in ("auth_failure", "general_failure") or "credit" in message.lower():
                _trip_disable(f"status={status}: {message[:120]}")
            return dict(_EMPTY_RESULT)

        result = data.get("result") or RESULT_UNKNOWN
        flags = data.get("flags") or []
        suggested = data.get("suggested_correction") or None
        print(f"[NeverBounce] {email} → {result} (flags={flags}, {elapsed*1000:.0f}ms)")
        return {"result": result, "flags": flags, "suggested_correction": suggested}

    except requests.exceptions.Timeout:
        logger.warning("neverbounce.verify_email timeout for %s", email)
        return dict(_EMPTY_RESULT)
    except Exception as e:  # noqa: BLE001 - graceful catch-all
        logger.warning("neverbounce.verify_email error for %s: %r", email, e)
        return dict(_EMPTY_RESULT)
