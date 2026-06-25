"""Tests for Phase 9 daily auto-send counter helpers in app.services.auth.

Coverage:
  - _user_local_date_str: timezone correctness + UTC-rollover edge case
  - get_sends_today: stale date returns 0; matching date returns stored count
  - increment_sends_today_atomic: cap enforcement, rollover, success path

Firestore transaction is mocked — these are pure unit tests.
"""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services import auth as auth_module
from app.services.auth import (
    _user_local_date_str,
    get_sends_today,
    increment_sends_today_atomic,
)


# ── _user_local_date_str ────────────────────────────────────────────────


def test_local_date_at_la_noon():
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)  # 12pm PT
    assert _user_local_date_str(now, "America/Los_Angeles") == "2026-06-03"


def test_local_date_crosses_utc_midnight_for_la():
    """The canonical edge case: 6am UTC is still the previous day in LA.
    If the helper used UTC date the cap would reset 5 hours early for
    West Coast users."""
    now = datetime(2026, 6, 4, 6, 0, tzinfo=timezone.utc)  # 11pm PT on the 3rd
    assert _user_local_date_str(now, "America/Los_Angeles") == "2026-06-03"


def test_local_date_falls_back_to_la_on_bad_tz():
    """Garbage tz string must not crash — default is PT."""
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    assert _user_local_date_str(now, "Atlantis/Lost") == "2026-06-03"


def test_local_date_falls_back_to_la_on_missing_tz():
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    assert _user_local_date_str(now, None) == "2026-06-03"


# ── get_sends_today ─────────────────────────────────────────────────────


def _mock_user_doc(user_data: dict | None) -> MagicMock:
    doc = MagicMock()
    doc.exists = user_data is not None
    doc.to_dict.return_value = user_data
    return doc


def _mock_db_returning(user_data: dict | None) -> MagicMock:
    db = MagicMock()
    db.collection.return_value.document.return_value.get.return_value = _mock_user_doc(user_data)
    return db


def test_get_sends_today_returns_stored_when_date_matches(monkeypatch):
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    db = _mock_db_returning({
        "timezone": "America/Los_Angeles",
        "sendsTodayDate": "2026-06-03",
        "sendsToday": 7,
    })
    monkeypatch.setattr(auth_module, "get_db", lambda: db)
    assert get_sends_today("u1", now=now) == 7


def test_get_sends_today_returns_zero_when_date_stale(monkeypatch):
    """Stored count from yesterday — get_sends_today returns 0 (the actual
    rollover write happens lazily on next increment)."""
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    db = _mock_db_returning({
        "timezone": "America/Los_Angeles",
        "sendsTodayDate": "2026-06-02",  # yesterday
        "sendsToday": 25,                # was at cap
    })
    monkeypatch.setattr(auth_module, "get_db", lambda: db)
    assert get_sends_today("u1", now=now) == 0


def test_get_sends_today_returns_zero_when_user_missing(monkeypatch):
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    db = _mock_db_returning(None)
    monkeypatch.setattr(auth_module, "get_db", lambda: db)
    assert get_sends_today("u-ghost", now=now) == 0


# ── increment_sends_today_atomic ────────────────────────────────────────


class _FakeTransaction:
    """Minimal transaction stub that records updates so tests can assert
    on the payload written to Firestore."""
    def __init__(self):
        self.updates: list[tuple] = []

    def update(self, ref, fields):
        self.updates.append((ref, fields))


def _patch_transactional_passthrough(monkeypatch):
    """Replace @firestore.transactional with an identity decorator so the
    inner function runs once with a real(-ish) transaction object."""
    from firebase_admin import firestore as fb_firestore
    monkeypatch.setattr(
        fb_firestore,
        "transactional",
        lambda fn: fn,
    )


def _build_db_with_user(user_data: dict | None):
    user_ref = MagicMock()
    user_ref.get.return_value = _mock_user_doc(user_data)
    db = MagicMock()
    db.collection.return_value.document.return_value = user_ref
    db.transaction.return_value = _FakeTransaction()
    return db, user_ref


def test_increment_first_send_of_day_succeeds(monkeypatch):
    """No prior sendsTodayDate or stale date — increment writes
    sendsToday=1 and stamps today's date."""
    _patch_transactional_passthrough(monkeypatch)
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    db, user_ref = _build_db_with_user({
        "timezone": "America/Los_Angeles",
        "sendsTodayDate": "2026-06-02",  # yesterday — rollover triggers
        "sendsToday": 25,
    })
    monkeypatch.setattr(auth_module, "get_db", lambda: db)

    success, count, cap = increment_sends_today_atomic("u1", "pro", now=now)

    assert success is True
    assert count == 1
    assert cap == 25
    # Verify the transaction wrote the right payload
    txn = db.transaction.return_value
    assert len(txn.updates) == 1
    _ref, fields = txn.updates[0]
    assert fields["sendsToday"] == 1
    assert fields["sendsTodayDate"] == "2026-06-03"
    assert "lastAutoSendAt" in fields


def test_increment_blocked_at_pro_cap(monkeypatch):
    """Pro user at exactly the 25/day cap — increment must refuse."""
    _patch_transactional_passthrough(monkeypatch)
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    db, _ = _build_db_with_user({
        "timezone": "America/Los_Angeles",
        "sendsTodayDate": "2026-06-03",
        "sendsToday": 25,
    })
    monkeypatch.setattr(auth_module, "get_db", lambda: db)

    success, count, cap = increment_sends_today_atomic("u1", "pro", now=now)

    assert success is False
    assert count == 25
    assert cap == 25
    # No write should have happened
    assert db.transaction.return_value.updates == []


def test_increment_free_tier_cap_is_zero(monkeypatch):
    """Free tier has max_auto_sends_per_day=0 — the first increment must
    refuse. This is the per-tier guard layered on top of the wizard's
    mode-disable on Free."""
    _patch_transactional_passthrough(monkeypatch)
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    db, _ = _build_db_with_user({
        "timezone": "America/Los_Angeles",
        "sendsTodayDate": "2026-06-03",
        "sendsToday": 0,
    })
    monkeypatch.setattr(auth_module, "get_db", lambda: db)

    success, count, cap = increment_sends_today_atomic("u1", "free", now=now)

    assert success is False
    assert count == 0
    assert cap == 0


def test_increment_respects_hard_cap_override(monkeypatch):
    """A power-user Loop sets hardDailySendCap=10 on an Elite account.
    Effective cap is min(75, 10) = 10. Increment refuses at 10 even though
    the tier cap is 75."""
    _patch_transactional_passthrough(monkeypatch)
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    db, _ = _build_db_with_user({
        "timezone": "America/Los_Angeles",
        "sendsTodayDate": "2026-06-03",
        "sendsToday": 10,
    })
    monkeypatch.setattr(auth_module, "get_db", lambda: db)

    success, count, cap = increment_sends_today_atomic(
        "u1", "elite", hard_cap=10, now=now,
    )

    assert success is False
    assert count == 10
    assert cap == 10


def test_increment_rollover_resets_yesterdays_cap(monkeypatch):
    """Pro user was at 25/25 yesterday — today, rollover lets them send
    again. Counter resets to 1, not 26."""
    _patch_transactional_passthrough(monkeypatch)
    now = datetime(2026, 6, 3, 19, 0, tzinfo=timezone.utc)
    db, _ = _build_db_with_user({
        "timezone": "America/Los_Angeles",
        "sendsTodayDate": "2026-06-02",
        "sendsToday": 25,
    })
    monkeypatch.setattr(auth_module, "get_db", lambda: db)

    success, count, cap = increment_sends_today_atomic("u1", "pro", now=now)

    assert success is True
    assert count == 1
    assert cap == 25
