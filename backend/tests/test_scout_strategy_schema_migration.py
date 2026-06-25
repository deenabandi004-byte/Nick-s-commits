"""Tests for the D2 additive strategy-schema migration.

Pins:
  - clean_steps() carries the five new fields (rationale, feature,
    prefill_payload, completed_at, created_artifact_id) when callers
    provide them.
  - Empty / missing values default cleanly (no crashes) so strategies
    saved before the migration ship still load.
  - update_strategy_progress sets completed_at on the done-edge only,
    not on re-marks of an already-done step.

These are the contracts the E2 recommendation-memory narrative depends on.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.scout.strategy import clean_steps, update_strategy_progress


# --- clean_steps -----------------------------------------------------------

def test_clean_steps_carries_new_fields_when_provided():
    raw = [{
        "title": "Loop targeting Snap PMs",
        "detail": "Snap is on dream-companies list; PM matches target roles.",
        "rationale": "USC alumni at Snap (4) + 12 open PM roles in feed",
        "feature": "loop",
        "prefill_payload": {"target_company": "Snap", "target_role": "PM"},
        "created_artifact_id": "loop_abc123",
    }]
    out = clean_steps(raw)
    assert len(out) == 1
    step = out[0]
    assert step["title"] == "Loop targeting Snap PMs"
    assert step["rationale"].startswith("USC alumni at Snap")
    assert step["feature"] == "loop"
    assert step["prefill_payload"] == {"target_company": "Snap", "target_role": "PM"}
    assert step["created_artifact_id"] == "loop_abc123"
    assert step["completed_at"] is None
    assert step["done"] is False


def test_clean_steps_defaults_missing_new_fields_safely():
    """Old caller shape (just title + detail) must still produce a valid step."""
    out = clean_steps([{"title": "Just a title", "detail": "Just a detail"}])
    assert len(out) == 1
    step = out[0]
    assert step["rationale"] == ""
    assert step["feature"] == ""
    assert step["prefill_payload"] == {}
    assert step["completed_at"] is None
    assert step["created_artifact_id"] == ""


def test_clean_steps_drops_non_dict_prefill_payload():
    """A model that returns prefill_payload as a string or list (which the
    save_strategy schema doesn't allow but the LLM might hallucinate) must
    not crash; we just drop to {}."""
    raw = [{
        "title": "test",
        "prefill_payload": "not-a-dict",
    }]
    out = clean_steps(raw)
    assert out[0]["prefill_payload"] == {}


def test_clean_steps_caps_feature_length():
    raw = [{"title": "x", "feature": "f" * 100}]
    out = clean_steps(raw)
    assert len(out[0]["feature"]) <= 40


# --- update_strategy_progress sets completed_at on the done-edge ----------

class _FakeColl:
    """Minimal stand-in for a Firestore collection that captures writes."""

    def __init__(self, initial_docs=None):
        self.docs = dict(initial_docs or {})
        self.writes = []

    def stream(self):
        for sid, data in self.docs.items():
            captured = dict(data)
            snap = type("Snap", (), {
                "id": sid,
                "to_dict": staticmethod(lambda c=captured: dict(c)),
            })()
            yield snap

    def document(self, sid):
        coll = self

        class _Ref:
            def set(self, doc):
                coll.docs[sid] = dict(doc)
                coll.writes.append(("set", sid, dict(doc)))

            def delete(self):
                coll.docs.pop(sid, None)
                coll.writes.append(("delete", sid, None))

        return _Ref()


class _FakeDB:
    def __init__(self, coll):
        self._coll = coll

    def collection(self, name):  # "users"
        outer = self

        class _UserDoc:
            def collection(self, sub):  # "scoutStrategies"
                return outer._coll

            def document(self, uid):
                return self

        return _UserDoc()


def _seed_strategy_with_pending_step():
    initial = {
        "abc": {
            "id": "abc",
            "status": "active",
            "goal": "Land an SWE internship",
            "steps": [{"title": "Apply to Stripe", "done": False, "completed_at": None}],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "tier_at_creation": "pro",
        }
    }
    return _FakeDB(_FakeColl(initial))


def test_marking_step_done_sets_completed_at_timestamp():
    db = _seed_strategy_with_pending_step()
    result = update_strategy_progress("uid", "pro", completed_steps=[1], db=db)
    assert result["ok"] is True
    saved_doc = db._coll.docs["abc"]
    assert saved_doc["steps"][0]["done"] is True
    assert isinstance(saved_doc["steps"][0]["completed_at"], datetime)


def test_re_marking_already_done_step_preserves_original_completed_at():
    """The recommendation-memory narrative depends on accurate timing -
    don't overwrite an old completion timestamp on a no-op re-mark."""
    original_time = datetime(2026, 6, 1, tzinfo=timezone.utc)
    coll = _FakeColl({
        "abc": {
            "id": "abc",
            "status": "active",
            "goal": "Land internship",
            "steps": [
                {"title": "First", "done": True, "completed_at": original_time},
                {"title": "Second", "done": False, "completed_at": None},
            ],
            "created_at": original_time,
            "updated_at": original_time,
            "tier_at_creation": "pro",
        }
    })
    db = _FakeDB(coll)
    # Re-mark step 1 (already done) AND mark step 2 (the done-edge).
    update_strategy_progress("uid", "pro", completed_steps=[1, 2], db=db)
    saved = coll.docs["abc"]
    # Step 1's original timestamp preserved.
    assert saved["steps"][0]["completed_at"] == original_time
    # Step 2 got a fresh timestamp.
    assert isinstance(saved["steps"][1]["completed_at"], datetime)
    assert saved["steps"][1]["completed_at"] != original_time
