"""
credit_cap_notifier — out-of-credits email when a Loop pauses with
pauseReason="credits_capped".

Today the silent pause is the failure: a student's Loop runs out of
credits and they only learn about it when they next open the fleet view
(if they remember to). This module closes that loop with a single email
per user per billing period.

Contract:
  notify_credits_capped(uid, loop_id, loop_name) -> SendResult | None

Idempotency:
  Dedupe key: f"{uid}:{billing_period_start_yyyymm}". Stored at
  users/{uid}/notifications/credits_capped/{yyyymm} with a tiny doc
  recording the timestamp + the Loop that tipped them over. Subsequent
  calls in the same billing period short-circuit and return None.

Send path:
  Reuses the existing notification_adapter (Resend HTTP). The email is
  flag-gated by LOOPS_ALERT_EMAILS_ENABLED — same gate as the daily
  digest — so a single env-var flip silences all outbound Loops mail.

Why standalone:
  Could have folded into loop_notifications, but the digest module is
  scoped to per-cycle results. Out-of-credits is per-user-per-month and
  needs its own dedupe surface; lumping them together would either
  pollute the digest's idempotency key or require a second key.
  Standalone keeps both modules small.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app import config
from app.extensions import get_db
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


def _billing_period_key(now: Optional[datetime] = None) -> str:
    """Return YYYYMM for the user's current billing period.

    Credits reset at the calendar month boundary (see CLAUDE.md) so the
    billing period is calendar-month-aligned. If billing ever shifts to
    Stripe subscription start dates, replace this with a per-user lookup.
    """
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y%m")


def _dedup_ref(db, uid: str, period_key: str):
    return (
        db.collection("users")
        .document(uid)
        .collection("notifications")
        .document("credits_capped_log")
        .collection("periods")
        .document(period_key)
    )


def _already_notified(db, uid: str, period_key: str) -> bool:
    try:
        snap = _dedup_ref(db, uid, period_key).get()
        return bool(snap.exists)
    except Exception:
        # On Firestore read failure, default to "not yet" — a duplicate
        # send is better than a silent miss for a student about to bail.
        logger.exception(
            "credit_cap_notifier: dedupe read failed uid=%s period=%s",
            uid, period_key,
        )
        return False


def _record_notification(
    db,
    uid: str,
    period_key: str,
    loop_id: str,
    loop_name: str,
    vendor_message_id: Optional[str],
) -> None:
    try:
        _dedup_ref(db, uid, period_key).set({
            "sentAt": datetime.now(timezone.utc).isoformat(),
            "triggeringLoopId": loop_id,
            "triggeringLoopName": loop_name,
            "vendorMessageId": vendor_message_id,
        })
    except Exception:
        logger.exception(
            "credit_cap_notifier: dedupe write failed uid=%s period=%s",
            uid, period_key,
        )


def render_credits_capped(
    *,
    loop_name: str,
    recipient_first_name: str | None,
    fleet_url: str,
    upgrade_url: str,
) -> tuple[str, str]:
    """Render the HTML + text bodies for the out-of-credits email."""
    ctx = {
        "loop_name": loop_name,
        "first_name": (recipient_first_name or "").strip() or None,
        "fleet_url": fleet_url,
        "upgrade_url": upgrade_url,
    }
    html = _jinja_env.get_template("credits_capped.html.j2").render(**ctx)
    text = _jinja_env.get_template("credits_capped.txt.j2").render(**ctx)
    return html, text


def notify_credits_capped(
    uid: str,
    loop_id: str,
    loop_name: str,
    *,
    now: Optional[datetime] = None,
) -> SendResult | None:
    """Send the out-of-credits email, deduped per user per billing period.

    Returns:
        SendResult on a fresh attempt (success OR a structured failure).
        None when the user was already notified this billing period.
    """
    if not config.LOOPS_ALERT_EMAILS_ENABLED:
        logger.info(
            "credit_cap_notifier: send skipped (flag disabled) uid=%s loop=%s",
            uid, loop_id,
        )
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient="",
            error_code="disabled",
        )

    db = get_db()
    period_key = _billing_period_key(now)

    if _already_notified(db, uid, period_key):
        logger.info(
            "credit_cap_notifier: deduped uid=%s period=%s loop=%s",
            uid, period_key, loop_id,
        )
        return None

    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() if user_doc.exists else {}
    recipient = (user_data.get("email") or "").strip()
    if not recipient:
        logger.warning("credit_cap_notifier: no email on file uid=%s", uid)
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient="",
            error_code="invalid_recipient",
        )
    first_name = user_data.get("firstName") or (user_data.get("name") or "").split(" ")[0]

    base = "https://offerloop.ai"
    fleet_url = f"{base}/agent"
    upgrade_url = f"{base}/pricing"

    html, text = render_credits_capped(
        loop_name=loop_name or "your Loop",
        recipient_first_name=first_name,
        fleet_url=fleet_url,
        upgrade_url=upgrade_url,
    )
    subject = f'Your Loop "{loop_name or "Untitled Loop"}" paused — out of credits this month'

    result = adapter_send(
        Channel.EMAIL,
        recipient=recipient,
        subject=subject,
        html_body=html,
        text_body=text,
    )

    # Only record the dedupe doc on a successful send so a transient Resend
    # failure doesn't lock out next attempt's retry on a future pause event.
    if result.success:
        _record_notification(
            db,
            uid=uid,
            period_key=period_key,
            loop_id=loop_id,
            loop_name=loop_name or "Untitled Loop",
            vendor_message_id=result.vendor_message_id,
        )
    return result
