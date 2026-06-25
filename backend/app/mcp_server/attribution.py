"""
Attribution tokens for the MCP server's soft paywall.

When an anonymous user hits a cap, we hand back a short URL like
offerloop.com/claim?token=xyz. The token encodes (tool_name, ip_hash,
issued_at) so when the user signs up at /claim, we can attribute the
signup back to a specific MCP tool call.

Implementation mirrors loop_notifications.build_unsubscribe_token —
HMAC-SHA256 over FLASK_SECRET, base64-urlsafe encoded, 30-day TTL.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

from app import config


_TOKEN_DELIM = "|"
_TOKEN_TTL_DAYS = 30


def _secret_bytes() -> bytes:
    return (config.FLASK_SECRET or "dev").encode("utf-8")


def _sign(payload: str) -> str:
    return hmac.new(_secret_bytes(), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def build_claim_token(
    tool: str,
    ip_hash: str,
    *,
    now: Optional[datetime] = None,
) -> str:
    """Mint a URL-safe HMAC-signed attribution token.

    Token payload: tool|ip_hash|expires_iso|signature, base64-urlsafe.
    """
    if not tool:
        raise ValueError("tool required")
    if not ip_hash:
        raise ValueError("ip_hash required")
    issued = now or datetime.now(timezone.utc)
    expires_at = issued + timedelta(days=_TOKEN_TTL_DAYS)
    expires_iso = expires_at.replace(microsecond=0).isoformat()
    body = f"{tool}{_TOKEN_DELIM}{ip_hash}{_TOKEN_DELIM}{expires_iso}"
    sig = _sign(body)
    raw = f"{body}{_TOKEN_DELIM}{sig}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def verify_claim_token(
    token: str,
    *,
    now: Optional[datetime] = None,
) -> Optional[dict]:
    """Return {tool, ip_hash, expires_at} if valid + unexpired + signature matches.

    Returns None for malformed, tampered, forged, or expired tokens.
    Constant-time comparison via hmac.compare_digest.
    """
    if not token:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except Exception:
        return None

    parts = raw.split(_TOKEN_DELIM)
    if len(parts) != 4:
        return None

    tool, ip_hash, expires_iso, sig = parts
    expected_sig = _sign(f"{tool}{_TOKEN_DELIM}{ip_hash}{_TOKEN_DELIM}{expires_iso}")
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

    return {"tool": tool, "ip_hash": ip_hash, "expires_at": expires_iso}
