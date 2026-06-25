"""
Funnel attribution event log.

One Firestore doc per MCP tool call in mcp_events/. Written
**synchronously** before the response returns, NOT fire-and-forget.
Gunicorn worker recycles will silently drop in-flight async writes;
50-100ms of added latency is acceptable, losing attribution data is not.

Queries this dataset supports:
  - Cache hit rate per tool
  - Paywall conversion (paywall_shown true vs subsequent /claim hits
    with matching claim_token)
  - Tool mix
  - Per-IP repeat usage
"""
from __future__ import annotations

import time
import uuid
from typing import Optional


COLLECTION = "mcp_events"


class MCPEvents:
    def __init__(self, db):
        self.db = db

    def log(
        self,
        *,
        tool: str,
        ip_hash: str,
        args_hash: str,
        cache_hit: bool = False,
        paywall_shown: bool = False,
        claim_token: Optional[str] = None,
        result_count: int = 0,
        duration_ms: int = 0,
        error: Optional[str] = None,
        extra: Optional[dict] = None,
    ) -> Optional[str]:
        """Write one event. Synchronous.

        `extra` is a small dict of tool-specific telemetry (e.g.
        gmail_draft_status). Merged into the top-level payload so it's
        queryable directly without unpacking a sub-doc.

        Returns the new doc ID on success, None on any failure. Failure
        is silent so a Firestore blip never breaks an MCP response.
        """
        if self.db is None:
            return None
        doc_id = uuid.uuid4().hex
        payload = {
            "tool": tool,
            "ip_hash": ip_hash,
            "args_hash": args_hash,
            "cache_hit": bool(cache_hit),
            "paywall_shown": bool(paywall_shown),
            "claim_token": claim_token,
            "result_count": int(result_count),
            "duration_ms": int(duration_ms),
            "error": error,
            "ts": time.time(),
        }
        if extra:
            for k, v in extra.items():
                # Don't let extras clobber the canonical fields.
                if k not in payload:
                    payload[k] = v
        try:
            self.db.collection(COLLECTION).document(doc_id).set(payload)
            return doc_id
        except Exception:
            return None
