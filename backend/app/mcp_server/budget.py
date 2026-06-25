"""
Daily PDL spend ceiling for the MCP server.

One Firestore doc per UTC date: mcp_budget/{YYYY-MM-DD}. Counts cumulative
PDL credits spent; when an upcoming spend would exceed the daily USD cap
(MCP_BUDGET_DAILY_USD, default $20), find_contacts falls back to
cached-only with a note in the response.

Credit-to-USD conversion is configurable via MCP_PDL_CREDIT_USD (default
$0.20). At those defaults, $20 / day = 100 PDL credits = ~20 cold
find_contacts queries at 5 results each.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from firebase_admin import firestore

logger = logging.getLogger(__name__)


COLLECTION = "mcp_budget"


def _today_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _credit_usd() -> float:
    try:
        return float(os.getenv("MCP_PDL_CREDIT_USD", "0.20"))
    except (TypeError, ValueError):
        return 0.20


def _daily_cap_usd() -> float:
    try:
        return float(os.getenv("MCP_BUDGET_DAILY_USD", "20"))
    except (TypeError, ValueError):
        return 20.0


class MCPBudget:
    def __init__(self, db):
        self.db = db

    def _doc_ref(self, day: str | None = None):
        if self.db is None:
            return None
        return self.db.collection(COLLECTION).document(day or _today_id())

    def _read(self, day: str | None = None) -> dict:
        ref = self._doc_ref(day)
        if ref is None:
            return {"credits": 0, "spent_usd": 0.0}
        try:
            snap = ref.get()
        except Exception:
            return {"credits": 0, "spent_usd": 0.0}
        if not snap.exists:
            return {"credits": 0, "spent_usd": 0.0}
        d = snap.to_dict() or {}
        return {
            "credits": int(d.get("credits", 0)),
            "spent_usd": float(d.get("spent_usd", 0.0)),
        }

    def can_spend(self, credits: int) -> bool:
        """Return False when the projected spend would cross the daily cap."""
        if credits <= 0:
            return True
        current = self._read()
        projected_usd = current["spent_usd"] + credits * _credit_usd()
        return projected_usd <= _daily_cap_usd()

    def spend(self, credits: int) -> None:
        """Atomically add credits to today's budget doc."""
        if credits <= 0 or self.db is None:
            return
        ref = self._doc_ref()
        if ref is None:
            return
        usd_delta = credits * _credit_usd()

        @firestore.transactional
        def _txn(transaction):
            snap = ref.get(transaction=transaction)
            if snap.exists:
                d = snap.to_dict() or {}
                new_credits = int(d.get("credits", 0)) + credits
                new_usd = float(d.get("spent_usd", 0.0)) + usd_delta
                transaction.update(ref, {"credits": new_credits, "spent_usd": new_usd})
            else:
                transaction.set(ref, {
                    "credits": credits,
                    "spent_usd": usd_delta,
                    "day": _today_id(),
                })

        try:
            _txn(self.db.transaction())
        except Exception as e:
            logger.warning("[MCP budget] Firestore txn failed: %s", e)

    def status(self) -> dict:
        current = self._read()
        cap = _daily_cap_usd()
        return {
            "day": _today_id(),
            "credits": current["credits"],
            "spent_usd": round(current["spent_usd"], 4),
            "cap_usd": cap,
            "remaining_usd": round(max(cap - current["spent_usd"], 0.0), 4),
            "credit_usd": _credit_usd(),
        }
