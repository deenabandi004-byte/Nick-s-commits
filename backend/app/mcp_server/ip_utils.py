"""
Rate-limit-key extraction and hashing for the MCP server.

For direct traffic (no Smithery gateway): Render sits behind a reverse
proxy that sets X-Forwarded-For. The first hop in that header is the
actual client. Falls back to Flask's request.remote_addr in dev.

For Smithery gateway traffic: all installs share the gateway's
upstream IP, so IP-based limits would collapse every Smithery user
into a single rate-limit bucket. Their gateway proxies user identity
via X-Smithery-Connection (the convention established in their
public agent.pw + typescript-api source). When that header is
present, we use "smithery:{connection_id}" as the per-user key
instead of the gateway IP.

Hashing salts the resolved key with FLASK_SECRET so document IDs in
mcp_rate_limits / mcp_events can't be enumerated back to raw IPs or
Smithery connection IDs.

Returning a string (rather than splitting IP vs Smithery-id into two
fields) keeps the call site simple: every caller just hashes whatever
extract_client_ip returns and gets a stable bucket key.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Optional

from app import config

logger = logging.getLogger(__name__)


_SMITHERY_USER_HEADER = "X-Smithery-Connection"
_SMITHERY_UA_TOKEN = "smithery"
_SMITHERY_HOST_TOKENS = ("smithery.ai", "run.tools")


def extract_client_ip(req) -> str:
    """Return a stable per-user key for rate limiting.

    Resolution order:

      1. Smithery gateway (UA/Origin/Referer confirms it) AND
         X-Smithery-Connection present -> "smithery:{connection_id}".
         Both conditions required; the X-Smithery-Connection header
         alone is untrusted because anyone reading our public source
         could rotate values to mint unlimited rate-limit buckets.

      2. Smithery gateway WITHOUT X-Smithery-Connection -> gateway
         X-Forwarded-For hop, logged at WARNING. Smithery's convention
         may have changed and rate limiting will collapse onto the
         gateway IP until we catch up. Surfacing the warning lets us
         notice.

      3. Direct (non-Smithery) request -> X-Forwarded-For first hop,
         or request.remote_addr in dev.

      4. (Suspicious sub-case of path 3) X-Smithery-Connection sent
         from non-Smithery context: ignored, logged at WARNING, falls
         through to IP-based limits. Likely a scraper probing.

    Function name is preserved for backward compatibility with the
    initial v1 build, but the return value is the rate-limit key, not
    strictly an IP.
    """
    user_id = (req.headers.get(_SMITHERY_USER_HEADER, "") or "").strip()
    is_smithery = _is_smithery_request(req)
    direct_ip = _extract_direct_ip(req)

    if user_id and is_smithery:
        # Path 1: Smithery + explicit user id. Best case.
        # CRITICAL: both conditions required. Trusting X-Smithery-Connection
        # without the Smithery-context check (UA / Origin / Referer) means
        # any scraper that learns the header name can rotate its value to
        # mint unlimited per-key rate-limit buckets, bypassing the cap
        # entirely. Requiring is_smithery raises the bar to "must also
        # spoof Smithery-like context" and produces an INFO log line we
        # can audit.
        logger.info("[MCP rate-limit-key] smithery_user resolved (header=%s)",
                    _SMITHERY_USER_HEADER)
        return f"smithery:{user_id}"

    if user_id and not is_smithery:
        # Suspicious: someone sent X-Smithery-Connection but the request
        # doesn't look like it came from Smithery (no Smithery UA, no
        # smithery.ai / run.tools Origin/Referer). Most likely a scraper
        # probing the header name. Ignore the header and fall through
        # to IP-based limits. Logged at WARNING so we'll see it.
        logger.warning(
            "[MCP rate-limit-key] x_smithery_header_without_smithery_context: "
            "header=%s value_len=%d User-Agent=%r — ignoring header, "
            "falling through to IP-based limits.",
            _SMITHERY_USER_HEADER,
            len(user_id),
            req.headers.get("User-Agent"),
        )

    if is_smithery:
        # Path 2: Smithery traffic but the expected user header is
        # missing. This shouldn't happen in normal operation; log
        # loudly so we'll notice if Smithery's convention shifts.
        logger.warning(
            "[MCP rate-limit-key] smithery_gateway_no_user_header: "
            "User-Agent=%r Origin=%r Referer=%r — falling back to gateway IP %r, "
            "rate limits will collapse across Smithery users until "
            "the user header is restored.",
            req.headers.get("User-Agent"),
            req.headers.get("Origin"),
            req.headers.get("Referer"),
            direct_ip,
        )
        return direct_ip

    # Path 3: direct traffic. Logged at DEBUG so prod logs stay quiet.
    logger.debug("[MCP rate-limit-key] direct_ip resolved (ip=%s)", direct_ip)
    return direct_ip


def hash_ip(ip: str, *, secret: Optional[str] = None) -> str:
    """Hash a rate-limit key with FLASK_SECRET as salt; return 16 hex chars.

    16 chars is enough for collision-resistance at our scale and keeps
    Firestore document IDs short. Constant secret + per-input means
    the same caller always hashes the same way (so rate limits
    accumulate), but external parties can't reverse the hash without
    FLASK_SECRET. Note the input may be an IP string ("1.2.3.4") or a
    Smithery key ("smithery:conn_xyz"); both produce stable hashes.
    """
    salt = (secret if secret is not None else config.FLASK_SECRET) or "dev"
    payload = f"{ip}:{salt}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


# ── Internal helpers ─────────────────────────────────────────────────────────


def _extract_direct_ip(req) -> str:
    """The pre-Smithery extraction: X-Forwarded-For first hop, fallback to remote_addr."""
    xff = (req.headers.get("X-Forwarded-For", "") or "").strip()
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return req.remote_addr or "0.0.0.0"


def _is_smithery_request(req) -> bool:
    """Detect whether the request originated from Smithery's gateway.

    Used only when X-Smithery-Connection is absent, to decide whether
    to log "Smithery gateway, no user header" (path 2) vs "direct
    traffic" (path 3). Detection signals:

      - User-Agent contains "smithery" (case-insensitive)
      - Origin or Referer host matches *.smithery.ai or *.run.tools
        (run.tools is Smithery's externally-hosted MCP server domain)
    """
    ua = (req.headers.get("User-Agent", "") or "").lower()
    if _SMITHERY_UA_TOKEN in ua:
        return True

    for header_name in ("Origin", "Referer"):
        value = (req.headers.get(header_name, "") or "").lower()
        if any(tok in value for tok in _SMITHERY_HOST_TOKENS):
            return True

    return False
