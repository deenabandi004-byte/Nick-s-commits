"""Phase 4 per-turn metrics for Scout.

One Firestore doc per Scout turn in the `scout_metrics` collection. The admin
metrics endpoint aggregates the last 24h. Every doc carries an `expires_at`
Timestamp; a Firestore TTL policy on that field drops docs after 30 days.

ONE-TIME SETUP (Firestore TTL policies are project config, not code):
  Firebase console -> Firestore Database -> TTL -> add a policy on collection
  `scout_metrics` with timestamp field `expires_at`. Or via gcloud:
    gcloud firestore fields ttls update expires_at \\
      --collection-group=scout_metrics --enable-ttl
The `expires_at` field is written regardless, so enabling the policy later
retroactively expires old docs. Until then, `scout_metrics` grows unbounded.

All writes are best-effort and never raise.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

_COLLECTION = "scout_metrics"
_TTL_DAYS = 30

# OpenAI list price, USD per 1M tokens.
_PRICE = {
    "gpt-4.1-mini": {"input": 0.40, "cached_input": 0.10, "output": 1.60},
    "text-embedding-3-small": {"input": 0.02, "cached_input": 0.02, "output": 0.0},
}

# The four tiers a turn can be served by, in cost order.
TIERS = ["regex", "embedding_cache_navigate", "embedding_cache_answer", "llm"]


def turn_cost_usd(
    model: Optional[str],
    input_tokens: int,
    cached_input_tokens: int,
    output_tokens: int,
) -> float:
    """Cost of one model call. Cached input tokens bill at the cached rate."""
    rate = _PRICE.get(model or "")
    if not rate:
        return 0.0
    uncached = max(0, int(input_tokens) - int(cached_input_tokens))
    return (
        uncached / 1_000_000 * rate["input"]
        + int(cached_input_tokens) / 1_000_000 * rate["cached_input"]
        + int(output_tokens) / 1_000_000 * rate["output"]
    )


def _db():
    try:
        from app.extensions import get_db
        return get_db()
    except Exception:
        return None


def log_turn(
    *,
    served_by: str,
    latency_ms: float,
    final_tool: str,
    model: Optional[str] = None,
    input_tokens: int = 0,
    cached_input_tokens: int = 0,
    output_tokens: int = 0,
    embed_tokens: int = 0,
    near_miss_cosine: Optional[float] = None,
) -> None:
    """Record one Scout turn. Best-effort; never raises."""
    cost = turn_cost_usd(model, input_tokens, cached_input_tokens, output_tokens)
    cost += turn_cost_usd("text-embedding-3-small", embed_tokens, 0, 0)
    now = datetime.now(timezone.utc)
    doc = {
        "served_by": served_by,
        "latency_ms": round(latency_ms, 1),
        "final_tool": final_tool,
        "model": model,
        "input_tokens": int(input_tokens),
        "cached_input_tokens": int(cached_input_tokens),
        "output_tokens": int(output_tokens),
        "embed_tokens": int(embed_tokens),
        "near_miss_cosine": near_miss_cosine,
        "cost_usd": round(cost, 8),
        "created_at": now,
        "expires_at": now + timedelta(days=_TTL_DAYS),  # Firestore TTL field
    }
    print(f"[ScoutMetrics] served_by={served_by} tool={final_tool} "
          f"latency_ms={doc['latency_ms']} cost_usd={doc['cost_usd']}")
    db = _db()
    if db is None:
        return
    try:
        db.collection(_COLLECTION).add(doc)
    except Exception as e:
        print(f"[ScoutMetrics] write failed: {e}")


def aggregate(docs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pure aggregation over metric docs. No Firestore, no I/O - fully testable."""
    total = len(docs)
    by_tier: Dict[str, Any] = {}
    for tier in TIERS:
        rows = [d for d in docs if d.get("served_by") == tier]
        n = len(rows)
        by_tier[tier] = {
            "turns": n,
            "pct": round(100.0 * n / total, 1) if total else 0.0,
            "avg_latency_ms": (
                round(sum(d.get("latency_ms", 0) or 0 for d in rows) / n, 1)
                if n else 0.0
            ),
            "avg_cost_usd": (
                round(sum(d.get("cost_usd", 0) or 0 for d in rows) / n, 8)
                if n else 0.0
            ),
        }
    near = [d.get("near_miss_cosine") for d in docs
            if d.get("near_miss_cosine") is not None]
    buckets = {"0.85-0.87": 0, "0.87-0.89": 0, "0.89-0.91": 0, "0.91-0.92": 0}
    for v in near:
        if v < 0.87:
            buckets["0.85-0.87"] += 1
        elif v < 0.89:
            buckets["0.87-0.89"] += 1
        elif v < 0.91:
            buckets["0.89-0.91"] += 1
        else:
            buckets["0.91-0.92"] += 1
    return {
        "turns": total,
        "total_cost_usd": round(sum(d.get("cost_usd", 0) or 0 for d in docs), 6),
        "by_tier": by_tier,
        "near_miss": {"count": len(near), "distribution": buckets},
    }


def summary_last_24h() -> Dict[str, Any]:
    """Aggregate the last 24h of turns from Firestore."""
    db = _db()
    if db is None:
        return {"turns": 0, "note": "metrics store unavailable"}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    try:
        docs = [d.to_dict() for d in
                db.collection(_COLLECTION).where("created_at", ">=", cutoff).stream()]
    except Exception as e:
        return {"turns": 0, "error": str(e)}
    return aggregate(docs)
