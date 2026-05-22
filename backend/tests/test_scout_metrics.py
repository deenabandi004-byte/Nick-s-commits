"""Phase 4 metrics unit tests for app/services/scout/metrics.py.

turn_cost_usd and aggregate are pure (no Firestore, no I/O), so these run fast
and deterministically.
"""
from app.services.scout.metrics import aggregate, turn_cost_usd


def test_turn_cost_usd_gpt_4_1_mini():
    # gpt-4.1-mini list price: input $0.40, cached $0.10, output $1.60 per 1M.
    assert turn_cost_usd("gpt-4.1-mini", 1_000_000, 0, 0) == 0.40
    assert turn_cost_usd("gpt-4.1-mini", 1_000_000, 1_000_000, 0) == 0.10  # all cached
    assert turn_cost_usd("gpt-4.1-mini", 0, 0, 1_000_000) == 1.60
    # Half the input cached: 0.5M @ 0.40 + 0.5M @ 0.10 = 0.25.
    assert round(turn_cost_usd("gpt-4.1-mini", 1_000_000, 500_000, 0), 4) == 0.25


def test_turn_cost_usd_unknown_model_is_free():
    assert turn_cost_usd("some-other-model", 1_000_000, 0, 1_000_000) == 0.0
    assert turn_cost_usd(None, 1_000_000, 0, 0) == 0.0


_DOCS = [
    {"served_by": "regex", "latency_ms": 2.0, "cost_usd": 0.0},
    {"served_by": "regex", "latency_ms": 4.0, "cost_usd": 0.0},
    {"served_by": "embedding_cache_navigate", "latency_ms": 60.0, "cost_usd": 1e-7},
    {"served_by": "embedding_cache_answer", "latency_ms": 55.0, "cost_usd": 1e-7},
    {"served_by": "llm", "latency_ms": 900.0, "cost_usd": 0.0006, "near_miss_cosine": 0.90},
    {"served_by": "llm", "latency_ms": 1100.0, "cost_usd": 0.0007, "near_miss_cosine": 0.86},
]


def test_aggregate_tier_breakdown():
    agg = aggregate(_DOCS)
    assert agg["turns"] == 6
    assert agg["by_tier"]["regex"]["turns"] == 2
    assert agg["by_tier"]["regex"]["pct"] == 33.3
    assert agg["by_tier"]["llm"]["turns"] == 2
    assert agg["by_tier"]["llm"]["avg_latency_ms"] == 1000.0
    assert agg["by_tier"]["embedding_cache_navigate"]["turns"] == 1
    assert round(agg["total_cost_usd"], 6) == round(0.0006 + 0.0007 + 2e-7, 6)


def test_aggregate_near_miss_buckets():
    agg = aggregate(_DOCS)
    assert agg["near_miss"]["count"] == 2
    dist = agg["near_miss"]["distribution"]
    assert dist["0.89-0.91"] == 1  # 0.90
    assert dist["0.85-0.87"] == 1  # 0.86
    assert dist["0.87-0.89"] == 0


def test_aggregate_empty():
    agg = aggregate([])
    assert agg["turns"] == 0
    assert agg["total_cost_usd"] == 0.0
    for tier in ("regex", "embedding_cache_navigate", "embedding_cache_answer", "llm"):
        assert agg["by_tier"][tier] == {
            "turns": 0, "pct": 0.0, "avg_latency_ms": 0.0, "avg_cost_usd": 0.0,
        }
    assert agg["near_miss"]["count"] == 0
