"""
Notification adapter — channel-aware send abstraction.

PR2 (this file): EMAIL implementation only, via Resend HTTP. SMS and SLACK
exist as enum members + NotImplementedError stubs so future channels are a
single-file change. This matches the spec-review rename from
`email_adapter` → `notification_adapter` with a channel enum.

Resend is called directly over HTTPS (no `resend` Python SDK — kept out of
requirements.txt per the "no new pip packages" constraint). The adapter
swallows vendor failures into a `SendResult` so callers can surface
deliverability state without try/except boilerplate.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import requests

from app import config

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"
RESEND_TIMEOUT_SEC = 10


class Channel(str, Enum):
    EMAIL = "email"
    SMS = "sms"
    SLACK = "slack"


@dataclass
class SendResult:
    success: bool
    channel: Channel
    recipient: str
    error_code: Optional[str] = None
    vendor_message_id: Optional[str] = None


def send(
    channel: Channel,
    recipient: str,
    subject: str,
    html_body: str,
    text_body: str,
    headers: Optional[dict] = None,
) -> SendResult:
    """Dispatch a notification on the given channel.

    EMAIL is the only implemented channel in PR2. SMS and SLACK raise
    NotImplementedError per spec — surface the enum now so callers can
    forward-reference them, but fail loudly if anyone tries to use them
    before PR3+.
    """
    if channel == Channel.EMAIL:
        return _send_email(recipient, subject, html_body, text_body, headers or {})
    if channel == Channel.SMS:
        raise NotImplementedError("channel deferred — see TODOS T3")
    if channel == Channel.SLACK:
        raise NotImplementedError("channel deferred — see TODOS T3")
    raise ValueError(f"Unknown channel: {channel}")


def _send_email(
    recipient: str,
    subject: str,
    html_body: str,
    text_body: str,
    headers: dict,
) -> SendResult:
    """POST to Resend and translate vendor responses into SendResult.

    Error taxonomy mirrors the Section 2 Error & Rescue Map:
      - missing API key      → "not_configured" (don't even try)
      - 4xx                  → "invalid_recipient" (auto-disable upstream)
      - 429                  → "rate_limit"      (backoff upstream)
      - 5xx                  → "vendor_5xx"      (retry upstream)
      - requests.Timeout     → "timeout"
      - anything else         → "vendor_error"
    """
    api_key = config.RESEND_API_KEY
    if not api_key:
        # Fast-path: don't burn a network call when we know we'll 401.
        logger.warning("Resend API key not configured — skipping email send")
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient=recipient,
            error_code="not_configured",
        )

    payload = {
        "from": config.RESEND_FROM_EMAIL,
        "to": [recipient],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }
    if headers:
        payload["headers"] = headers

    try:
        response = requests.post(
            RESEND_ENDPOINT,
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=RESEND_TIMEOUT_SEC,
        )
    except requests.Timeout:
        logger.warning("Resend send timed out (recipient=%s)", recipient)
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient=recipient,
            error_code="timeout",
        )
    except requests.RequestException as exc:
        logger.warning("Resend send failed (recipient=%s): %s", recipient, exc)
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient=recipient,
            error_code="vendor_error",
        )

    status = response.status_code

    if 200 <= status < 300:
        vendor_id = None
        try:
            body = response.json() or {}
            vendor_id = body.get("id")
        except ValueError:
            pass
        return SendResult(
            success=True,
            channel=Channel.EMAIL,
            recipient=recipient,
            vendor_message_id=vendor_id,
        )

    if status == 429:
        logger.warning("Resend rate-limited (recipient=%s)", recipient)
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient=recipient,
            error_code="rate_limit",
        )

    if 500 <= status < 600:
        logger.warning(
            "Resend 5xx (recipient=%s status=%d body=%s)",
            recipient,
            status,
            (response.text or "")[:200],
        )
        return SendResult(
            success=False,
            channel=Channel.EMAIL,
            recipient=recipient,
            error_code="vendor_5xx",
        )

    # All other 4xx → treat as bad recipient/payload. Auto-disable upstream.
    logger.warning(
        "Resend 4xx (recipient=%s status=%d body=%s)",
        recipient,
        status,
        (response.text or "")[:200],
    )
    return SendResult(
        success=False,
        channel=Channel.EMAIL,
        recipient=recipient,
        error_code="invalid_recipient",
    )
