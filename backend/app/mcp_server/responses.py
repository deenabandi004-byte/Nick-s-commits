"""
Helpers for shaping over-cap and over-budget responses.

The MCP server NEVER hard-errors past cap. It returns whatever cached data
it can serve plus a PaywallCTA pointing at offerloop.com/claim?token=...
so the assistant can surface a one-line CTA to the user.
"""
from __future__ import annotations

import os

from app.mcp_server.attribution import build_claim_token
from app.mcp_server.schemas import PaywallCTA


def _base_url() -> str:
    return (os.getenv("MCP_CLAIM_BASE_URL") or "https://offerloop.ai").rstrip("/")


def build_paywall(
    tool: str,
    ip_hash: str,
    *,
    hit_cap_type: str,
    retry_after_seconds: int,
    message: str | None = None,
) -> PaywallCTA:
    """Mint a claim token and wrap in a PaywallCTA. Always returns a real CTA."""
    token = build_claim_token(tool, ip_hash)
    claim_url = f"{_base_url()}/claim?token={token}"
    reset_hours = max(1, int(round(retry_after_seconds / 3600))) if retry_after_seconds else 24
    default_messages = {
        "day": "You've hit the free daily limit. Sign up free to keep going.",
        "hour": "You're going fast. Sign up free to lift the hourly cap.",
        "budget": (
            "Showing cached results. Real-time results are available with a "
            "free account."
        ),
    }
    msg = message or default_messages.get(hit_cap_type, "Sign up free to keep going.")
    return PaywallCTA(
        message=msg,
        claim_url=claim_url,
        reset_in_hours=reset_hours,
        hit_cap_type=hit_cap_type,
    )
