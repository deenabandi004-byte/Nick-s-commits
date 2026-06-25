"""
Firestore-backed cache for MCP tool responses.

Collection: mcp_cache/{sha256(tool + normalized_args)}.
TTL is stored on the document; expiry is checked lazily on read.
String args are normalized (lowercase, strip, collapse whitespace) so
"Goldman Sachs" and "goldman  sachs " hash identically.
"""
from __future__ import annotations

import hashlib
import json
import time
from typing import Optional

from app.mcp_server.normalize import normalize_args


COLLECTION = "mcp_cache"


def _key(tool: str, args: dict) -> str:
    canonical = json.dumps(
        {"tool": tool, "args": normalize_args(args)},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class MCPCache:
    """Lazy-expiry Firestore cache. One row per (tool, normalized args)."""

    def __init__(self, db):
        self.db = db

    def key(self, tool: str, args: dict) -> str:
        return _key(tool, args)

    def get(self, tool: str, args: dict) -> Optional[dict]:
        if self.db is None:
            return None
        try:
            doc = self.db.collection(COLLECTION).document(_key(tool, args)).get()
        except Exception:
            return None
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        expires_at = data.get("expires_at", 0)
        if not isinstance(expires_at, (int, float)) or expires_at <= time.time():
            return None
        return data.get("payload")

    def set(
        self,
        tool: str,
        args: dict,
        payload: dict,
        ttl_seconds: int,
    ) -> None:
        if self.db is None:
            return
        try:
            self.db.collection(COLLECTION).document(_key(tool, args)).set({
                "tool": tool,
                "payload": payload,
                "expires_at": time.time() + ttl_seconds,
                "written_at": time.time(),
            })
        except Exception:
            pass
