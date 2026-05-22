"""Phase 4 Tier B cache-engine unit tests.

These exercise the cache logic (cosine, lookup, near-miss band, registry-version
filtering, LRU eviction, promotion) with injected vectors. No OpenAI embedding
calls and no Firestore: cache.py's Firestore layer degrades to a no-op when
get_db is unavailable, so persistence is simply skipped here.
"""
import time

import pytest

from app.services.scout.cache import (
    NEAR_MISS_FLOOR,
    PROMOTION_HITS,
    REGISTRY_VERSION,
    SIMILARITY_THRESHOLD,
    PendingIntents,
    SemanticCache,
    cosine,
    deidentify,
)

# A unit vector at angle theta from [1, 0]: cosine with [1, 0] is cos(theta).
import math


def _vec(cos_with_x_axis: float):
    """A 2D unit vector whose cosine similarity with [1.0, 0.0] is the arg."""
    return [cos_with_x_axis, math.sqrt(max(0.0, 1.0 - cos_with_x_axis ** 2))]


def test_cosine():
    assert cosine([1.0, 0.0, 0.0], [1.0, 0.0, 0.0]) == 1.0
    assert cosine([1.0, 0.0], [0.0, 1.0]) == 0.0
    assert cosine([], []) == 0.0
    assert cosine([1.0, 0.0], [1.0, 0.0, 0.0]) == 0.0  # length mismatch


def test_lookup_hit_bumps_hit_count():
    c = SemanticCache("test")
    c.add([1.0, 0.0], {"name": "navigate"}, "open meeting prep")
    entry, score = c.lookup(_vec(0.95))  # 0.95 >= 0.92 threshold
    assert entry is not None
    assert score >= SIMILARITY_THRESHOLD
    assert entry.plan == {"name": "navigate"}
    assert entry.hit_count == 1  # bumped on the hit


def test_lookup_miss():
    c = SemanticCache("test")
    c.add([1.0, 0.0], {"name": "navigate"}, "x")
    entry, score = c.lookup([0.0, 1.0])
    assert entry is None
    assert score < SIMILARITY_THRESHOLD


def test_lookup_near_miss_band():
    c = SemanticCache("test")
    c.add([1.0, 0.0], {"name": "navigate"}, "x")
    entry, score = c.lookup(_vec(0.88))  # in the 0.85 to 0.92 near-miss band
    assert entry is None  # below the hit threshold
    assert NEAR_MISS_FLOOR <= score < SIMILARITY_THRESHOLD


@pytest.mark.parametrize("target_cos", [0.86, 0.88, 0.90, 0.915])
def test_near_miss_cases(target_cos):
    """Synthetic near-miss cases across the 0.85 to 0.92 band. A lookup just
    below the hit threshold returns no entry but reports the score, which
    handle_chat logs so the 0.92 threshold can be tuned from real data."""
    c = SemanticCache("test")
    c.add([1.0, 0.0], {"name": "navigate"}, "x")
    entry, score = c.lookup(_vec(target_cos))
    assert entry is None
    assert NEAR_MISS_FLOOR <= score < SIMILARITY_THRESHOLD
    assert abs(score - target_cos) < 0.01


def test_stale_registry_version_skipped():
    c = SemanticCache("test")
    c.add([1.0, 0.0], {"name": "navigate"}, "x")
    for e in c._entries.values():
        e.registry_version = REGISTRY_VERSION - 1  # simulate a registry bump
    entry, _ = c.lookup([1.0, 0.0])  # exact match, but the entry is stale
    assert entry is None


def test_lru_evicts_oldest():
    c = SemanticCache("test", max_entries=2)
    c.add([1.0, 0.0, 0.0], {"p": 1}, "one")
    time.sleep(0.01)
    c.add([0.0, 1.0, 0.0], {"p": 2}, "two")
    time.sleep(0.01)
    c.lookup([1.0, 0.0, 0.0])  # touch "one" so it is most-recently-used
    time.sleep(0.01)
    c.add([0.0, 0.0, 1.0], {"p": 3}, "three")  # over cap: evicts the LRU
    assert len(c._entries) == 2
    assert sorted(e.plan["p"] for e in c._entries.values()) == [1, 3]


def test_promotion_after_three_distinct_users():
    pending = PendingIntents("test_pending")
    emb = [1.0, 0.0]
    plan = {"name": "navigate", "args": {"route": "/job-board"}}
    assert pending.note(emb, plan, "open job board", "user-1") is None
    assert pending.note(_vec(0.99), plan, "open job board", "user-2") is None
    promoted = pending.note(_vec(0.99), plan, "open job board", "user-3")
    assert promoted is not None
    _, promoted_plan, _ = promoted
    assert promoted_plan == plan


def test_promotion_ignores_repeat_from_same_user():
    pending = PendingIntents("test_pending")
    emb = [1.0, 0.0]
    plan = {"name": "navigate"}
    for _ in range(PROMOTION_HITS + 2):
        assert pending.note(emb, plan, "x", "same-user") is None  # never promotes


def test_deidentify_strips_identifiers_and_truncates():
    out = deidentify("email me at jane@example.com or https://linkedin.com/in/jane")
    assert "jane@example.com" not in out
    assert "https://" not in out
    assert "[email]" in out and "[url]" in out
    assert len(deidentify("x" * 200)) == 80
