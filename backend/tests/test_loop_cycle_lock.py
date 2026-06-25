"""Tests for the Phase 9.1 per-Loop concurrency lock.

Covers:
  - try_claim_cycle_lock: succeeds when free; refuses when held recently;
    reclaims when stale; handles Loop-deleted and timestamp-garbage cases.
  - release_cycle_lock: clears both fields; tolerates Loop-deleted.
  - run_loop_cycle_job: early-returns with reason="cycle_already_running"
    when the lock is held.

All transactions are mocked via a passthrough decorator + _FakeTransaction
so we never touch real Firestore.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.services import loop_service
from app.services.loop_service import (
    STALE_LOCK_AFTER_MINUTES,
    release_cycle_lock,
    try_claim_cycle_lock,
)


class _FakeTransaction:
    """Minimal stub matching the Firestore transactional interface."""
    def __init__(self):
        self.updates: list[tuple] = []

    def update(self, ref, fields):
        self.updates.append((ref, fields))


def _passthrough_transactional(monkeypatch):
    """Replace @firestore.transactional with identity so the inner
    function runs once with our fake transaction."""
    from firebase_admin import firestore as _fs
    monkeypatch.setattr(_fs, "transactional", lambda fn: fn)


def _mock_loop_doc(data: dict | None) -> MagicMock:
    doc = MagicMock()
    doc.exists = data is not None
    doc.to_dict.return_value = data
    return doc


def _build_db_returning(loop_data: dict | None):
    loop_ref = MagicMock()
    loop_ref.get.return_value = _mock_loop_doc(loop_data)
    db = MagicMock()
    db.collection.return_value.document.return_value.collection.return_value.document.return_value = loop_ref
    db.transaction.return_value = _FakeTransaction()
    return db, loop_ref


# ── try_claim_cycle_lock ────────────────────────────────────────────────


def test_claim_succeeds_when_lock_free(monkeypatch):
    _passthrough_transactional(monkeypatch)
    db, _ = _build_db_returning({"cycleRunning": False})
    monkeypatch.setattr(loop_service, "get_db", lambda: db)
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)

    assert try_claim_cycle_lock("u1", "L1", now=now) is True
    # Verify the txn wrote the lock claim.
    txn = db.transaction.return_value
    assert len(txn.updates) == 1
    _ref, fields = txn.updates[0]
    assert fields["cycleRunning"] is True
    assert fields["cycleStartedAt"].startswith("2026-06-03T19:00:00")


def test_claim_refuses_when_lock_held_recently(monkeypatch):
    """The exact bug we're fixing: a healthy parallel cycle started 30s
    ago must refuse the second claim. No write happens."""
    _passthrough_transactional(monkeypatch)
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    thirty_sec_ago = (now - timedelta(seconds=30)).isoformat()
    db, _ = _build_db_returning({
        "cycleRunning": True,
        "cycleStartedAt": thirty_sec_ago,
    })
    monkeypatch.setattr(loop_service, "get_db", lambda: db)

    assert try_claim_cycle_lock("u1", "L1", now=now) is False
    assert db.transaction.return_value.updates == []


def test_claim_reclaims_stale_lock(monkeypatch):
    """A lock held longer than STALE_LOCK_AFTER_MINUTES is presumed crashed.
    Reclaim and proceed — better than stalling the Loop forever."""
    _passthrough_transactional(monkeypatch)
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    stale = (now - timedelta(minutes=STALE_LOCK_AFTER_MINUTES + 5)).isoformat()
    db, _ = _build_db_returning({
        "cycleRunning": True,
        "cycleStartedAt": stale,
    })
    monkeypatch.setattr(loop_service, "get_db", lambda: db)

    assert try_claim_cycle_lock("u1", "L1", now=now) is True
    # The reclaim DID write — same shape as a fresh claim.
    txn = db.transaction.return_value
    assert len(txn.updates) == 1
    _ref, fields = txn.updates[0]
    assert fields["cycleRunning"] is True


def test_claim_reclaims_lock_with_unparseable_timestamp(monkeypatch):
    """Defense: cycleStartedAt was corrupted somehow (manual edit, prior
    bug). Treat as stale and reclaim — refusing to claim forever on bad
    data is the worse failure mode."""
    _passthrough_transactional(monkeypatch)
    db, _ = _build_db_returning({
        "cycleRunning": True,
        "cycleStartedAt": "this is not a timestamp",
    })
    monkeypatch.setattr(loop_service, "get_db", lambda: db)

    assert try_claim_cycle_lock("u1", "L1") is True


def test_claim_reclaims_lock_with_missing_timestamp(monkeypatch):
    """cycleRunning=True but no cycleStartedAt at all. Same recovery."""
    _passthrough_transactional(monkeypatch)
    db, _ = _build_db_returning({"cycleRunning": True})
    monkeypatch.setattr(loop_service, "get_db", lambda: db)

    assert try_claim_cycle_lock("u1", "L1") is True


def test_claim_returns_false_when_loop_deleted(monkeypatch):
    """The Loop was deleted between enqueue and claim. Return False so
    the caller bails — no point claiming a lock on a ghost."""
    _passthrough_transactional(monkeypatch)
    db, _ = _build_db_returning(None)  # snapshot.exists == False
    monkeypatch.setattr(loop_service, "get_db", lambda: db)

    assert try_claim_cycle_lock("u1", "L-ghost") is False
    assert db.transaction.return_value.updates == []


def test_claim_returns_false_on_transaction_failure(monkeypatch):
    """If the Firestore transaction itself raises (network, contention,
    whatever), refuse — better to skip a cycle than to silently send
    duplicate emails."""
    _passthrough_transactional(monkeypatch)
    db = MagicMock()
    db.transaction.side_effect = RuntimeError("firestore is having a moment")
    monkeypatch.setattr(loop_service, "get_db", lambda: db)

    assert try_claim_cycle_lock("u1", "L1") is False


# ── release_cycle_lock ──────────────────────────────────────────────────


def test_release_clears_both_fields(monkeypatch):
    loop_ref = MagicMock()
    db = MagicMock()
    db.collection.return_value.document.return_value.collection.return_value.document.return_value = loop_ref
    monkeypatch.setattr(loop_service, "get_db", lambda: db)

    release_cycle_lock("u1", "L1")

    loop_ref.update.assert_called_once_with({
        "cycleRunning": False,
        "cycleStartedAt": None,
    })


def test_release_tolerates_deleted_loop(monkeypatch):
    """The Loop was deleted while the cycle was running — the update
    will raise. release_cycle_lock must swallow it, not propagate."""
    loop_ref = MagicMock()
    loop_ref.update.side_effect = RuntimeError("not found")
    db = MagicMock()
    db.collection.return_value.document.return_value.collection.return_value.document.return_value = loop_ref
    monkeypatch.setattr(loop_service, "get_db", lambda: db)

    # Must not raise.
    release_cycle_lock("u1", "L-deleted")


# ── run_loop_cycle_job lock integration ────────────────────────────────


def test_run_loop_cycle_job_skips_when_lock_held(monkeypatch):
    """The end-to-end behavior: a second call to run_loop_cycle_job for
    the same Loop while one is already running returns early without
    touching the planner, agent_actions, or Gmail."""
    from app.services import loop_jobs

    loop_data = {"briefText": "find pms", "autoSendMode": "send_for_me"}
    loop_ref = MagicMock()
    loop_ref.get.return_value = _mock_loop_doc(loop_data)
    db = MagicMock()
    db.collection.return_value.document.return_value.collection.return_value.document.return_value = loop_ref
    monkeypatch.setattr("app.extensions.get_db", lambda: db)

    # Lock is already held. The job's claim attempt must return False
    # and the planner / _run_cycle must never be touched.
    monkeypatch.setattr(
        "app.services.loop_service.try_claim_cycle_lock",
        lambda *a, **k: False,
    )
    _run_cycle_mock = MagicMock()
    monkeypatch.setattr("app.services.agent_service._run_cycle", _run_cycle_mock)

    result = loop_jobs.run_loop_cycle_job("u1", "L1")

    assert result == {"status": "skipped", "reason": "cycle_already_running"}
    # Critical: the expensive work never ran.
    assert _run_cycle_mock.call_count == 0


def test_run_loop_cycle_job_proceeds_when_lock_free(monkeypatch):
    """Mirror test: when the lock is free, the planner DOES run. Locks
    in the contract that we didn't accidentally short-circuit the happy
    path with the new check."""
    from app.services import loop_jobs

    loop_data = {"briefText": "find pms", "autoSendMode": "draft_only"}
    loop_ref = MagicMock()
    loop_ref.get.return_value = _mock_loop_doc(loop_data)
    db = MagicMock()
    db.collection.return_value.document.return_value.collection.return_value.document.return_value = loop_ref
    monkeypatch.setattr("app.extensions.get_db", lambda: db)

    monkeypatch.setattr(
        "app.services.loop_service.try_claim_cycle_lock",
        lambda *a, **k: True,
    )
    monkeypatch.setattr(
        "app.services.loop_service.release_cycle_lock",
        lambda *a, **k: None,
    )
    _run_cycle_mock = MagicMock(return_value={
        "contactsFound": 0, "emailsDrafted": 0, "creditsSpent": 0,
    })
    monkeypatch.setattr("app.services.agent_service._run_cycle", _run_cycle_mock)

    result = loop_jobs.run_loop_cycle_job("u1", "L1")

    assert result["status"] == "completed"
    assert _run_cycle_mock.call_count == 1
