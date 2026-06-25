"""
Per-identity, per-tool, per-tier rate limits for the MCP server.

Identity is the user's Firebase UID for authed callers and an IP hash for
anonymous (now only reachable from raw HTTP, not from MCP clients after the
401 cutover). Bucketing by uid means a user behind a corporate NAT isn't
sharing a quota with strangers and tier upgrades take effect on the next call.

Caps live in tier_caps.call_limits_for so all tier-aware numbers stay in
one place. Two windows enforced together: per-day caps gate total spend,
per-hour caps deter scrapers. Counters live in Firestore at
mcp_rate_limits/{identity}_{tool}_{window}, atomic-incremented via
transactions (same pattern as utils/firestore_limiter.FirestoreStorage).

This is intentionally separate from the Flask-Limiter rate_limits/
collection so the MCP server can be tuned independently and so a
Flask-Limiter reset doesn't wipe MCP counters.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

from firebase_admin import firestore

from app.mcp_server.tier_caps import call_limits_for

logger = logging.getLogger(__name__)


COLLECTION = "mcp_rate_limits"


# Backwards-compat surface for the /api/mcp/health endpoint, which
# enumerates LIMITS for ops visibility. Numbers shown are the FREE-tier
# caps; the per-tier matrix lives in tier_caps._CALL_LIMITS.
LIMITS = {
    ("find_contacts", "day"): 10,
    ("find_contacts", "hour"): 20,
    ("draft_outreach", "day"): 10,
    ("draft_outreach", "hour"): 10,
    ("get_company_intel", "hour"): 50,
}

_WINDOW_SECONDS = {
    "day": 86400,
    "hour": 3600,
}


@dataclass
class RateLimitResult:
    ok: bool
    hit_cap_type: Optional[str]  # "day" or "hour" or None
    retry_after_seconds: int
    remaining_day: Optional[int]
    remaining_hour: Optional[int]


class MCPRateLimit:
    def __init__(self, db):
        self.db = db

    def _doc_id(self, identity: str, tool: str, window: str) -> str:
        return f"{identity}_{tool}_{window}"

    def _peek(self, identity: str, tool: str, window: str) -> tuple[int, float]:
        """Read current count and expires_at. Returns (count, expires_at).

        If the doc is missing or expired, returns (0, 0.0).
        """
        if self.db is None:
            return 0, 0.0
        try:
            doc = self.db.collection(COLLECTION).document(
                self._doc_id(identity, tool, window)
            ).get()
        except Exception:
            return 0, 0.0
        if not doc.exists:
            return 0, 0.0
        data = doc.to_dict() or {}
        expires_at = data.get("expires_at", 0) or 0
        if expires_at <= time.time():
            return 0, 0.0
        return int(data.get("count", 0)), float(expires_at)

    def check_and_increment(
        self, identity: str, tool: str, user_ctx: Optional[dict] = None,
    ) -> RateLimitResult:
        """Check both day + hour windows, increment if both pass, return result.

        `identity` is the bucket key (uid for authed, ip_hash for anonymous)
        and `user_ctx` carries the tier used to look up tier-specific caps.

        Fail-open on Firestore errors (returns ok=True). We never want a
        Firestore blip to take the MCP server down.
        """
        now = time.time()
        day_cap, hour_cap = call_limits_for(tool, user_ctx)

        # Read current state first to surface hit_cap_type without doing
        # any writes when we're already over either cap.
        day_count, day_expires = self._peek(identity, tool, "day") if day_cap else (0, 0.0)
        hour_count, hour_expires = self._peek(identity, tool, "hour") if hour_cap else (0, 0.0)

        if day_cap is not None and day_count >= day_cap:
            retry = max(int(day_expires - now), 1)
            return RateLimitResult(
                ok=False,
                hit_cap_type="day",
                retry_after_seconds=retry,
                remaining_day=0,
                remaining_hour=(None if hour_cap is None else max(hour_cap - hour_count, 0)),
            )

        if hour_cap is not None and hour_count >= hour_cap:
            retry = max(int(hour_expires - now), 1)
            return RateLimitResult(
                ok=False,
                hit_cap_type="hour",
                retry_after_seconds=retry,
                remaining_day=(None if day_cap is None else max(day_cap - day_count, 0)),
                remaining_hour=0,
            )

        # Within both caps, do the atomic increments.
        new_day = self._increment(identity, tool, "day") if day_cap is not None else None
        new_hour = self._increment(identity, tool, "hour") if hour_cap is not None else None

        return RateLimitResult(
            ok=True,
            hit_cap_type=None,
            retry_after_seconds=0,
            remaining_day=(None if day_cap is None or new_day is None else max(day_cap - new_day, 0)),
            remaining_hour=(None if hour_cap is None or new_hour is None else max(hour_cap - new_hour, 0)),
        )

    def _increment(self, identity: str, tool: str, window: str) -> Optional[int]:
        if self.db is None:
            return None
        doc_ref = self.db.collection(COLLECTION).document(self._doc_id(identity, tool, window))
        ttl = _WINDOW_SECONDS[window]
        now = time.time()
        new_expires_at = now + ttl

        @firestore.transactional
        def _txn(transaction):
            snap = doc_ref.get(transaction=transaction)
            if snap.exists:
                data = snap.to_dict() or {}
                if data.get("expires_at", 0) > now:
                    count = int(data.get("count", 0)) + 1
                    transaction.update(doc_ref, {"count": count})
                    return count
            count = 1
            transaction.set(doc_ref, {
                "count": count,
                "expires_at": new_expires_at,
                "tool": tool,
                "window": window,
                "identity": identity,
            })
            return count

        try:
            return _txn(self.db.transaction())
        except Exception as e:
            logger.warning("[MCP rate_limit] Firestore txn failed for %s/%s: %s",
                           tool, window, e)
            return None
