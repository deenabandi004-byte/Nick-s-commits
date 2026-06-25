"""
Tests for app.services.loop_alert_prefs — defaults, merge, validation,
auto-disable on webhook events.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import loop_alert_prefs
from app.services.loop_alert_prefs import (
    DEFAULT_PREFS,
    disable_for_bounce,
    disable_for_complaint,
    get_loop_alert_email,
    set_loop_alert_email,
)


class _FakeDoc:
    def __init__(self, data):
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return self._data


class _FakeDocRef:
    def __init__(self):
        self._data = None
        self.set_calls = []

    def get(self):
        return _FakeDoc(self._data)

    def set(self, payload, merge=False):
        self.set_calls.append((payload, merge))
        if self._data is None:
            self._data = {}
        if merge:
            # shallow merge
            for k, v in payload.items():
                if isinstance(v, dict) and isinstance(self._data.get(k), dict):
                    self._data[k] = {**self._data[k], **v}
                else:
                    self._data[k] = v
        else:
            self._data = dict(payload)


class _FakeCollection:
    def __init__(self):
        self.docs: dict[str, _FakeDocRef] = {}

    def document(self, uid):
        if uid not in self.docs:
            self.docs[uid] = _FakeDocRef()
        return self.docs[uid]


class _FakeDB:
    def __init__(self):
        self._collections: dict[str, _FakeCollection] = {}

    def collection(self, name):
        if name not in self._collections:
            self._collections[name] = _FakeCollection()
        return self._collections[name]


@pytest.fixture
def fake_db(monkeypatch):
    db = _FakeDB()
    monkeypatch.setattr(loop_alert_prefs, "get_db", lambda: db)
    return db


def _seed_user(db, uid, user_data):
    ref = db.collection("users").document(uid)
    ref._data = user_data


# ── get ─────────────────────────────────────────────────────────────────────


def test_get_returns_defaults_when_field_absent(fake_db):
    _seed_user(fake_db, "uid-1", {"email": "x@y.com"})  # no loopAlertEmail
    prefs = get_loop_alert_email("uid-1")
    assert prefs == DEFAULT_PREFS


def test_get_returns_defaults_when_user_doc_absent(fake_db):
    prefs = get_loop_alert_email("nope")
    assert prefs == DEFAULT_PREFS


def test_get_returns_stored_merged_over_defaults(fake_db):
    _seed_user(
        fake_db,
        "uid-1",
        {
            "loopAlertEmail": {
                "enabled": True,
                "mode": "instant",
                "timezone": "America/New_York",
            }
        },
    )
    prefs = get_loop_alert_email("uid-1")
    assert prefs["enabled"] is True
    assert prefs["mode"] == "instant"
    assert prefs["timezone"] == "America/New_York"
    # Defaults preserved for fields not in the stored value.
    assert prefs["quietHours"] == DEFAULT_PREFS["quietHours"]
    assert prefs["deliveryStatus"] == "ok"


# ── set / merge ─────────────────────────────────────────────────────────────


def test_set_merges_partial_patch(fake_db):
    _seed_user(
        fake_db,
        "uid-1",
        {
            "loopAlertEmail": {
                "enabled": True,
                "mode": "digest",
                "timezone": "America/Chicago",
                "quietHours": {"start": 22, "end": 7},
                "deliveryStatus": "ok",
            }
        },
    )
    merged = set_loop_alert_email("uid-1", {"mode": "instant"})
    # Only mode changed; everything else preserved.
    assert merged["mode"] == "instant"
    assert merged["enabled"] is True
    assert merged["timezone"] == "America/Chicago"
    assert merged["quietHours"] == {"start": 22, "end": 7}


def test_set_merges_partial_quiet_hours(fake_db):
    _seed_user(
        fake_db,
        "uid-1",
        {"loopAlertEmail": {"quietHours": {"start": 22, "end": 7}}},
    )
    merged = set_loop_alert_email("uid-1", {"quietHours": {"end": 9}})
    assert merged["quietHours"] == {"start": 22, "end": 9}


def test_set_creates_field_when_absent(fake_db):
    _seed_user(fake_db, "uid-1", {})
    merged = set_loop_alert_email("uid-1", {"enabled": True})
    assert merged["enabled"] is True
    assert merged["mode"] == "digest"  # default preserved


# ── validation ──────────────────────────────────────────────────────────────


def test_set_rejects_invalid_mode(fake_db):
    _seed_user(fake_db, "uid-1", {})
    with pytest.raises(ValueError, match="mode"):
        set_loop_alert_email("uid-1", {"mode": "weekly"})


def test_set_rejects_invalid_quiet_hours_start(fake_db):
    _seed_user(fake_db, "uid-1", {})
    with pytest.raises(ValueError, match="quietHours.start"):
        set_loop_alert_email("uid-1", {"quietHours": {"start": 25}})


def test_set_rejects_invalid_quiet_hours_negative(fake_db):
    _seed_user(fake_db, "uid-1", {})
    with pytest.raises(ValueError):
        set_loop_alert_email("uid-1", {"quietHours": {"end": -1}})


def test_set_rejects_non_bool_enabled(fake_db):
    _seed_user(fake_db, "uid-1", {})
    with pytest.raises(ValueError):
        set_loop_alert_email("uid-1", {"enabled": "yes"})


def test_set_rejects_empty_timezone(fake_db):
    _seed_user(fake_db, "uid-1", {})
    with pytest.raises(ValueError):
        set_loop_alert_email("uid-1", {"timezone": ""})


# ── auto-disable on webhook ─────────────────────────────────────────────────


def test_disable_for_bounce_flips_flags(fake_db):
    _seed_user(
        fake_db,
        "uid-1",
        {"loopAlertEmail": {"enabled": True, "deliveryStatus": "ok"}},
    )
    merged = disable_for_bounce("uid-1")
    assert merged["enabled"] is False
    assert merged["deliveryStatus"] == "bounce"


def test_disable_for_complaint_flips_flags(fake_db):
    _seed_user(
        fake_db,
        "uid-1",
        {"loopAlertEmail": {"enabled": True, "deliveryStatus": "ok"}},
    )
    merged = disable_for_complaint("uid-1")
    assert merged["enabled"] is False
    assert merged["deliveryStatus"] == "complaint"
