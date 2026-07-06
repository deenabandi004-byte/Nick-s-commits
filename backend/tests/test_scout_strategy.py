"""Phase 5 Stage 1: Scout strategy memory unit tests.

The pure helpers (tier gating, cleaning, rendering, stall detection) need
nothing and are tested directly. The Firestore CRUD is tested against a small
in-process fake db so the archive-vs-delete behavior is exercised without
touching real Firestore.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.scout.strategy import (
    STALL_DAYS,
    archive_retention_days,
    clean_goal,
    clean_steps,
    compute_expiry,
    get_active_strategy,
    is_stalled,
    keeps_archive,
    list_archived_strategies,
    normalize_tier,
    render_active_strategy_block,
    save_strategy,
    update_strategy_progress,
)


# ============================================================================
# Fake Firestore. Supports just what strategy.py uses:
#   db.collection(name).document(id).collection(name).document(id).set/get/delete
#   coll.stream()
# Everything lives in one flat dict keyed by the tuple path.
# ============================================================================

class _FakeSnap:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _FakeDoc:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    @property
    def id(self):
        return self._path[-1]

    def collection(self, name):
        return _FakeColl(self._store, self._path + (name,))

    def get(self):
        return _FakeSnap(self.id, self._store.get(self._path))

    def set(self, data):
        self._store[self._path] = dict(data)

    def delete(self):
        self._store.pop(self._path, None)


class _FakeColl:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    def document(self, doc_id):
        return _FakeDoc(self._store, self._path + (doc_id,))

    def stream(self):
        out = []
        for key, data in list(self._store.items()):
            if len(key) == len(self._path) + 1 and key[:len(self._path)] == self._path:
                out.append(_FakeSnap(key[-1], data))
        return out


class FakeDb:
    def __init__(self):
        self._store = {}

    def collection(self, name):
        return _FakeColl(self._store, (name,))


@pytest.fixture
def db():
    return FakeDb()


# ============================================================================
# Pure tier-gating
# ============================================================================

def test_normalize_tier_maps_unknowns_to_free():
    assert normalize_tier("free") == "free"
    assert normalize_tier("Pro") == "pro"
    assert normalize_tier("ELITE") == "elite"
    assert normalize_tier(None) == "free"
    assert normalize_tier("") == "free"
    assert normalize_tier("enterprise") == "free"


def test_archive_retention_days_per_tier():
    assert archive_retention_days("free") == 0
    assert archive_retention_days("pro") == 14
    assert archive_retention_days("elite") == 30


def test_keeps_archive_only_pro_and_elite():
    assert keeps_archive("free") is False
    assert keeps_archive("pro") is True
    assert keeps_archive("elite") is True


def test_compute_expiry():
    now = datetime(2026, 5, 1, tzinfo=timezone.utc)
    assert compute_expiry("free", now) is None
    assert compute_expiry("pro", now) == now + timedelta(days=14)
    assert compute_expiry("elite", now) == now + timedelta(days=30)


# ============================================================================
# clean_goal / clean_steps
# ============================================================================

def test_clean_goal_trims_and_caps():
    assert clean_goal("  hi  ") == "hi"
    assert len(clean_goal("x" * 500)) == 300
    assert clean_goal(None) == ""


def test_clean_goal_strips_em_dash():
    em = chr(0x2014)
    out = clean_goal(f"Break in {em} summer 2027")
    assert em not in out
    assert "-" in out


def test_clean_steps_drops_empty_titles():
    steps = clean_steps([
        {"title": "Map firms"},
        {"title": ""},
        {"title": "  "},
        {"detail": "no title"},
        {"title": "Outreach"},
    ])
    assert [s["title"] for s in steps] == ["Map firms", "Outreach"]
    assert all(s["done"] is False for s in steps)


def test_clean_steps_caps_at_max():
    steps = clean_steps([{"title": f"step {i}"} for i in range(50)])
    assert len(steps) == 10


def test_clean_steps_validates_route():
    steps = clean_steps([
        {"title": "search", "route": "/find"},
        {"title": "bad", "route": "/not-a-real-route"},
        {"title": "no-route"},
    ])
    assert steps[0].get("route") == "/find"
    assert "route" not in steps[1]
    assert "route" not in steps[2]


def test_clean_steps_rejects_non_list():
    assert clean_steps(None) == []
    assert clean_steps("oops") == []
    assert clean_steps({"not": "list"}) == []


# ============================================================================
# Stall detection and rendering
# ============================================================================

def test_is_stalled_true_when_not_updated_and_open_step():
    now = datetime(2026, 5, 10, tzinfo=timezone.utc)
    strat = {
        "updated_at": now - timedelta(days=STALL_DAYS + 1),
        "steps": [{"done": False, "title": "x"}],
    }
    assert is_stalled(strat, now) is True


def test_is_stalled_false_when_recent():
    now = datetime(2026, 5, 10, tzinfo=timezone.utc)
    strat = {
        "updated_at": now - timedelta(days=1),
        "steps": [{"done": False, "title": "x"}],
    }
    assert is_stalled(strat, now) is False


def test_is_stalled_false_when_all_done():
    now = datetime(2026, 5, 10, tzinfo=timezone.utc)
    strat = {
        "updated_at": now - timedelta(days=STALL_DAYS + 5),
        "steps": [{"done": True, "title": "x"}],
    }
    assert is_stalled(strat, now) is False


def test_is_stalled_handles_naive_datetime():
    now = datetime(2026, 5, 10, tzinfo=timezone.utc)
    strat = {
        "updated_at": (now - timedelta(days=STALL_DAYS + 1)).replace(tzinfo=None),
        "steps": [{"done": False, "title": "x"}],
    }
    assert is_stalled(strat, now) is True


def test_render_empty_when_no_strategy():
    assert render_active_strategy_block(None) == ""
    assert render_active_strategy_block({}) == ""
    assert render_active_strategy_block({"goal": "", "steps": []}) == ""


def test_render_includes_goal_progress_and_steps():
    now = datetime(2026, 5, 10, tzinfo=timezone.utc)
    strat = {
        "goal": "Break into IB",
        "steps": [
            {"title": "Map firms", "done": True},
            {"title": "Build contacts", "done": False, "route": "/find"},
            {"title": "Outreach", "done": False, "detail": "Start with Evercore"},
        ],
        "updated_at": now - timedelta(days=1),
    }
    out = render_active_strategy_block(strat, now)
    assert "ACTIVE STRATEGY" in out
    assert "Break into IB" in out
    assert "1 of 3 steps done" in out
    assert "[done]" in out
    assert "[next]" in out
    assert "[page: /find]" in out
    assert "Start with Evercore" in out
    assert "stalled" not in out


def test_render_marks_stalled_plan():
    now = datetime(2026, 5, 10, tzinfo=timezone.utc)
    strat = {
        "goal": "Land tech PM offers",
        "steps": [{"title": "x", "done": False}],
        "updated_at": now - timedelta(days=STALL_DAYS + 2),
    }
    out = render_active_strategy_block(strat, now)
    assert "stalled" in out
    assert "has not moved" in out


# ============================================================================
# Firestore CRUD with the fake db
# ============================================================================

def test_save_strategy_creates_active_doc(db):
    res = save_strategy("u1", "free", "Goal text", [{"title": "step a"}], db=db)
    assert res["ok"] is True
    assert res["step_count"] == 1
    assert res["replaced_previous"] is False

    active = get_active_strategy("u1", db=db)
    assert active is not None
    assert active["goal"] == "Goal text"
    assert active["status"] == "active"
    assert active["steps"][0]["title"] == "step a"


def test_save_strategy_rejects_empty_goal_or_steps(db):
    assert save_strategy("u1", "free", "", [{"title": "x"}], db=db)["error"] == "empty_goal"
    assert save_strategy("u1", "free", "g", [], db=db)["error"] == "no_steps"
    assert save_strategy("u1", "free", "g", [{"title": ""}], db=db)["error"] == "no_steps"


def test_save_strategy_free_wipes_old(db):
    save_strategy("u1", "free", "Old plan", [{"title": "old1"}], db=db)
    res = save_strategy("u1", "free", "New plan", [{"title": "new1"}], db=db)
    assert res["replaced_previous"] is True
    assert res["previous_kept_in_archive"] is False

    active = get_active_strategy("u1", db=db)
    assert active["goal"] == "New plan"
    assert list_archived_strategies("u1", db=db) == []


def test_save_strategy_pro_archives_old(db):
    save_strategy("u1", "pro", "Old plan", [{"title": "old1"}], db=db)
    res = save_strategy("u1", "pro", "New plan", [{"title": "new1"}], db=db)
    assert res["replaced_previous"] is True
    assert res["previous_kept_in_archive"] is True

    archived = list_archived_strategies("u1", db=db)
    assert len(archived) == 1
    arc = archived[0]
    assert arc["goal"] == "Old plan"
    assert arc["status"] == "archived"
    assert arc["outcome"] == "switched"
    assert arc["expires_at"] is not None
    assert (arc["expires_at"] - arc["archived_at"]).days == 14


def test_save_strategy_elite_archives_with_30_day_ttl(db):
    save_strategy("u1", "elite", "Old", [{"title": "x"}], db=db)
    save_strategy("u1", "elite", "New", [{"title": "y"}], db=db)
    archived = list_archived_strategies("u1", db=db)
    assert len(archived) == 1
    arc = archived[0]
    assert arc["outcome"] == "switched"
    assert (arc["expires_at"] - arc["archived_at"]).days == 30


def test_goal_switch_outcome_matrix(db):
    """One condensed check across all three tiers that a goal switch produces
    the expected outcome value (or no archive at all on Free)."""
    # Pro.
    save_strategy("u_pro", "pro", "Old pro", [{"title": "a"}], db=db)
    save_strategy("u_pro", "pro", "New pro", [{"title": "b"}], db=db)
    arc_pro = list_archived_strategies("u_pro", db=db)
    assert len(arc_pro) == 1 and arc_pro[0]["outcome"] == "switched"

    # Elite.
    save_strategy("u_elite", "elite", "Old e", [{"title": "a"}], db=db)
    save_strategy("u_elite", "elite", "New e", [{"title": "b"}], db=db)
    arc_elite = list_archived_strategies("u_elite", db=db)
    assert len(arc_elite) == 1 and arc_elite[0]["outcome"] == "switched"

    # Free: the old strategy is deleted, no archive write happens.
    save_strategy("u_free", "free", "Old f", [{"title": "a"}], db=db)
    save_strategy("u_free", "free", "New f", [{"title": "b"}], db=db)
    assert list_archived_strategies("u_free", db=db) == []


def test_save_strategy_validates_step_routes(db):
    save_strategy("u1", "pro", "g", [
        {"title": "real", "route": "/find"},
        {"title": "bad", "route": "/imaginary"},
    ], db=db)
    active = get_active_strategy("u1", db=db)
    assert active["steps"][0]["route"] == "/find"
    assert "route" not in active["steps"][1]


def test_update_strategy_progress_marks_steps_done(db):
    save_strategy("u1", "pro", "Plan", [
        {"title": "a"}, {"title": "b"}, {"title": "c"},
    ], db=db)
    res = update_strategy_progress("u1", "pro", completed_steps=[1, 3], db=db)
    assert res["ok"] is True
    assert res["done_steps"] == 2
    assert res["total_steps"] == 3
    assert res["all_done"] is False
    assert res["closed"] is None

    active = get_active_strategy("u1", db=db)
    assert active["steps"][0]["done"] is True
    assert active["steps"][1]["done"] is False
    assert active["steps"][2]["done"] is True


def test_update_strategy_progress_close_completed_pro_archives(db):
    save_strategy("u1", "pro", "Plan", [{"title": "a"}], db=db)
    res = update_strategy_progress(
        "u1", "pro", completed_steps=[1], close="completed", db=db,
    )
    assert res["closed"] == "completed"
    assert res["kept_in_archive"] is True
    assert get_active_strategy("u1", db=db) is None
    archived = list_archived_strategies("u1", db=db)
    assert len(archived) == 1
    assert archived[0]["outcome"] == "completed"


def test_update_strategy_progress_close_abandoned_free_deletes(db):
    save_strategy("u1", "free", "Plan", [{"title": "a"}], db=db)
    res = update_strategy_progress("u1", "free", close="abandoned", db=db)
    assert res["closed"] == "abandoned"
    assert res["kept_in_archive"] is False
    assert get_active_strategy("u1", db=db) is None
    assert list_archived_strategies("u1", db=db) == []


def test_update_strategy_progress_errors_with_no_active(db):
    res = update_strategy_progress("u1", "pro", completed_steps=[1], db=db)
    assert res["ok"] is False
    assert res["error"] == "no_active_strategy"


def test_update_strategy_progress_all_done_flag(db):
    save_strategy("u1", "pro", "Plan", [{"title": "a"}, {"title": "b"}], db=db)
    res = update_strategy_progress("u1", "pro", completed_steps=[1, 2], db=db)
    assert res["all_done"] is True
    # Leaving close unset keeps the strategy active so the user can confirm.
    assert get_active_strategy("u1", db=db) is not None


def test_expired_archives_get_pruned_on_next_save(db):
    save_strategy("u1", "pro", "Old", [{"title": "x"}], db=db)
    save_strategy("u1", "pro", "Middle", [{"title": "y"}], db=db)
    # Backdate the archived doc's expiry so the next prune-on-write drops it.
    coll = db.collection("users").document("u1").collection("scoutStrategies")
    for snap in coll.stream():
        data = snap.to_dict()
        if data.get("status") == "archived":
            data["expires_at"] = datetime.now(timezone.utc) - timedelta(days=1)
            coll.document(snap.id).set(data)
    save_strategy("u1", "pro", "New", [{"title": "z"}], db=db)
    archived = list_archived_strategies("u1", db=db)
    assert len(archived) == 1
    assert archived[0]["goal"] == "Middle"


def test_get_active_strategy_degrades_without_db():
    assert get_active_strategy("u1", db=None) is None
    assert get_active_strategy("", db=FakeDb()) is None


def test_save_strategy_without_uid_returns_not_signed_in():
    res = save_strategy("", "free", "g", [{"title": "x"}], db=FakeDb())
    assert res == {"ok": False, "error": "not_signed_in"}
