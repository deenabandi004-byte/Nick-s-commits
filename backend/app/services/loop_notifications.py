"""
Loop notifications — digest assembly, unsubscribe tokens, send dispatch.

Scope of this file (PR2 scaffold):
  - HMAC-signed unsubscribe tokens (build + verify, expiry-checked)
  - Jinja2 daily digest rendering (html + text)
  - `send_daily_digest_email` — flag-gated dispatch through
    `notification_adapter.send(Channel.EMAIL, ...)`
  - `assess_cycle_results` — stubbed `[]`; PR3 implements scoring
  - `idempotency_key` — `cycle_id:user_id` (NOT `+send_day`; midnight-spanning
    collision per spec review)

This module never short-circuits when called — the `LOOPS_ALERT_EMAILS_ENABLED`
flag is the gate, and `send_daily_digest_email` returns a structured
`SendResult(success=False, error_code="disabled")` so PR3 callers can branch
without try/except.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app import config
from app.services.notification_adapter import Channel, SendResult, send as adapter_send

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "templates",
    "notifications",
)

_jinja_env = Environment(
    loader=FileSystemLoader(_TEMPLATE_DIR),
    autoescape=select_autoescape(["html", "html.j2"]),
    trim_blocks=False,
    lstrip_blocks=False,
)


# ── Unsubscribe tokens ───────────────────────────────────────────────────────

_TOKEN_DELIM = "|"


def _secret_bytes() -> bytes:
    """FLASK_SECRET as bytes; default 'dev' in non-prod is fine here."""
    return (config.FLASK_SECRET or "dev").encode("utf-8")


def _sign(payload: str) -> str:
    return hmac.new(_secret_bytes(), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def build_unsubscribe_token(uid: str, now: Optional[datetime] = None) -> str:
    """Mint a URL-safe HMAC-signed unsubscribe token for `uid`.

    Token payload: `uid|expires_at_iso|signature_hex`, base64-urlsafe encoded.
    The signature is HMAC-SHA256 of `uid|expires_at_iso` using FLASK_SECRET.
    Tokens expire after LOOPS_UNSUBSCRIBE_TOKEN_TTL_DAYS (default 30).
    """
    if not uid:
        raise ValueError("uid required")
    issued = now or datetime.now(timezone.utc)
    expires_at = issued + timedelta(days=config.LOOPS_UNSUBSCRIBE_TOKEN_TTL_DAYS)
    expires_iso = expires_at.replace(microsecond=0).isoformat()
    body = f"{uid}{_TOKEN_DELIM}{expires_iso}"
    sig = _sign(body)
    raw = f"{body}{_TOKEN_DELIM}{sig}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def verify_unsubscribe_token(token: str, now: Optional[datetime] = None) -> Optional[str]:
    """Return the uid if the token is valid + unexpired + signature matches.

    Returns None for malformed, tampered, forged (wrong secret), or expired
    tokens. Constant-time comparison via `hmac.compare_digest`.
    """
    if not token:
        return None
    try:
        # restore padding
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except Exception:
        return None

    parts = raw.split(_TOKEN_DELIM)
    if len(parts) != 3:
        return None

    uid, expires_iso, sig = parts
    expected_sig = _sign(f"{uid}{_TOKEN_DELIM}{expires_iso}")
    if not hmac.compare_digest(expected_sig, sig):
        return None

    try:
        expires_at = datetime.fromisoformat(expires_iso)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

    current = now or datetime.now(timezone.utc)
    if current >= expires_at:
        return None

    return uid


# ── Render ───────────────────────────────────────────────────────────────────


def render_daily_digest(
    uid: str,
    items: list[dict],
    unsubscribe_url: str = "",
) -> tuple[str, str]:
    """Render the daily digest as (html, text).

    `items` shape: list of dicts with keys `company`, `title`, `context`,
    `loop_id`, `result_kind` ∈ {"job", "contact", "hm"}. Empty `items` is
    allowed — the caller is responsible for skip-sending empty digests.
    `loop_url` is an optional per-item deep link; templates handle absence.
    """
    ctx = {
        "uid": uid,
        "items": items or [],
        "unsubscribe_url": unsubscribe_url or "",
    }
    html = _jinja_env.get_template("daily_digest.html.j2").render(**ctx)
    text = _jinja_env.get_template("daily_digest.txt.j2").render(**ctx)
    return html, text


# ── Send ─────────────────────────────────────────────────────────────────────


def send_daily_digest_email(
    uid: str,
    recipient_email: str,
    items: list[dict],
    unsubscribe_url: str,
) -> SendResult:
    """Send the daily digest, flag-gated by LOOPS_ALERT_EMAILS_ENABLED.

    This is the only public send entry point in PR2. Returns
    `SendResult(success=False, error_code="disabled")` when the flag is off
    so PR3's cycle pipeline caller can log a structured no-op instead of
    blowing up. Adds a `List-Unsubscribe` header (RFC 2369) for one-click
    inbox unsubscribe.
    """
    if not config.LOOPS_ALERT_EMAILS_ENABLED:
        logger.info("Loop digest send skipped (flag disabled) uid=%s", uid)
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient=recipient_email,
            error_code="disabled",
        )

    html, text = render_daily_digest(uid, items, unsubscribe_url)
    subject = "Your loop digest"
    headers = {}
    if unsubscribe_url:
        headers["List-Unsubscribe"] = f"<{unsubscribe_url}>"

    return adapter_send(
        Channel.EMAIL,
        recipient=recipient_email,
        subject=subject,
        html_body=html,
        text_body=text,
        headers=headers,
    )


# ── In-app loop-run notifications ────────────────────────────────────────────
#
# These run on every successful cycle, independent of the
# LOOPS_ALERT_EMAILS_ENABLED flag (which gates outbound email). The in-app
# bell + sidebar badge already wire up to `users/{uid}/notifications/outbox`
# via the `useNotifications` hook, so we append items there with a
# `kind: "loop_run"` discriminator instead of inventing a new doc and
# wiring a new Firestore listener. A separate `unreadLoopRunCount` counter
# keeps loop-run unreads from polluting the reply-toast badge.


def _result_to_summary_items(
    *,
    loop_id: str,
    loop_name: str,
    cycle_id: str,
    result: dict,
    now_iso: str,
) -> list[dict]:
    """Turn the cycle's result counters into one or more notification items.

    Returns at most one item per cycle today — a single "Loop ran" summary
    line. Returns [] when the cycle produced no user-visible output so we
    don't spam the bell for empty cycles.
    """
    contacts = int(result.get("contactsFound", 0) or 0)
    emails = int(result.get("emailsDrafted", 0) or 0)
    jobs = int(result.get("jobsFound", 0) or 0)
    hms = int(result.get("hmsFound", 0) or 0)
    cos = int(result.get("companiesDiscovered", 0) or 0)

    chunks: list[str] = []
    if contacts:
        chunks.append(f"{contacts} contact{'s' if contacts != 1 else ''}")
    if hms:
        chunks.append(f"{hms} hiring manager{'s' if hms != 1 else ''}")
    if jobs:
        chunks.append(f"{jobs} job{'s' if jobs != 1 else ''}")
    if cos:
        chunks.append(f"{cos} compan{'ies' if cos != 1 else 'y'}")
    if emails and (contacts or hms):
        # Emails are implied by contacts/HMs; only mention when no other
        # surface is in the summary.
        pass
    elif emails:
        chunks.append(f"{emails} email draft{'s' if emails != 1 else ''}")

    if not chunks:
        return []

    snippet = "Found " + ", ".join(chunks) + "."
    return [{
        "kind": "loop_run",
        "loopId": loop_id,
        "cycleId": cycle_id,
        # `contactId` / `contactName` / `company` exist for back-compat with
        # the existing useNotifications schema — the UI can still iterate
        # `items[]` without crashing on missing fields. Loop-run items
        # surface `loopName` instead.
        "contactId": f"loop:{loop_id}",
        "contactName": loop_name or "Untitled Loop",
        "loopName": loop_name or "Untitled Loop",
        "company": "",
        "snippet": snippet,
        "timestamp": now_iso,
        "read": False,
    }]


def assess_cycle_results(
    *,
    loop_id: str,
    loop_name: str,
    cycle_id: str,
    result: dict,
    now_iso: Optional[str] = None,
) -> list[dict]:
    """Score the cycle's results and return notification items to push.

    Today: a single summary line per successful cycle. Hooks here for
    future per-result-kind items (e.g. one item per HM with a hiring
    signal, one per high-score contact, etc.) without re-wiring callers.
    """
    when = now_iso or datetime.now(timezone.utc).isoformat()
    return _result_to_summary_items(
        loop_id=loop_id,
        loop_name=loop_name,
        cycle_id=cycle_id,
        result=result,
        now_iso=when,
    )


# Cap on retained items in the outbox doc — keeps the doc small (Firestore
# 1 MB doc limit) and matches the existing reply-notification cap.
_MAX_NOTIFICATION_ITEMS = 20


def write_loop_run_notification(
    *,
    uid: str,
    items: list[dict],
    db=None,
) -> bool:
    """Append loop-run items to `users/{uid}/notifications/outbox`.

    Bumps a NEW counter `unreadLoopRunCount` (NOT `unreadReplyCount`) so the
    reply-toast logic in AppHeader is unaffected. Returns True on a
    successful write, False on any failure — never raises.

    Empty `items` short-circuits: the caller already filtered "nothing
    happened" cycles via `assess_cycle_results`.
    """
    if not items:
        return True

    if db is None:
        from app.extensions import get_db
        db = get_db()

    try:
        ref = (
            db.collection("users")
            .document(uid)
            .collection("notifications")
            .document("outbox")
        )
        snap = ref.get()
        data = snap.to_dict() if snap.exists else {}
        existing = list(data.get("items") or [])
        merged = items + existing
        merged = merged[:_MAX_NOTIFICATION_ITEMS]
        unread_loop = max(0, int(data.get("unreadLoopRunCount", 0) or 0)) + len(items)
        ref.set(
            {
                "items": merged,
                "unreadLoopRunCount": unread_loop,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            },
            merge=True,
        )
        return True
    except Exception:
        logger.exception(
            "write_loop_run_notification: failed uid=%s items=%d",
            uid, len(items),
        )
        return False


def idempotency_key(cycle_id: str, uid: str) -> str:
    """Deduplication key for digest sends.

    Note: deliberately does NOT include `send_day` — that would let a single
    cycle's digest send twice across the user's midnight boundary. Per spec
    review.
    """
    return f"{cycle_id}:{uid}"
