"""Tests for the Phase 9 auto-send field validator on POST /api/agent/loops
and PATCH /api/agent/loops/:id.

The validator is a pure function (`_validate_auto_send_fields`) returning
either None on success or (error_code, error_message) on failure. The
route handlers map success → continue, failure → 400.

This file covers every accept/reject branch. Flask-level route tests are
deferred — the route is a thin wrapper around already-tested building
blocks (can_auto_send, increment_sends_today_atomic, send_email_for_user).
The end-to-end approve-send path is covered by the post-merge dogfood
verification in the medium-scope plan.
"""
import pytest

from app.routes.loops import _validate_auto_send_fields


# ── Empty / no-op body ──────────────────────────────────────────────────


def test_empty_body_passes():
    assert _validate_auto_send_fields({}) is None


def test_unrelated_fields_pass():
    """The validator only inspects auto-send fields. Any other key is
    ignored so it doesn't gate non-Phase-9 PATCH bodies."""
    assert _validate_auto_send_fields({
        "briefText": "Find 5 PMs",
        "weeklyTarget": 8,
        "cadence": "every_other_day",
    }) is None


# ── autoSendMode ─────────────────────────────────────────────────────────


def test_valid_auto_send_modes_accepted():
    for mode in ("approve_each", "draft_only", "send_for_me"):
        assert _validate_auto_send_fields({"autoSendMode": mode}) is None, mode


def test_invalid_auto_send_mode_rejected():
    err = _validate_auto_send_fields({"autoSendMode": "rocket_mode"})
    assert err is not None
    code, _msg = err
    assert code == "invalid_autoSendMode"


def test_null_auto_send_mode_rejected():
    """null isn't a valid enum value. We require explicit omission, not
    null, to fall through to the service default."""
    err = _validate_auto_send_fields({"autoSendMode": None})
    assert err is not None
    assert err[0] == "invalid_autoSendMode"


# ── autoSendApprovedAfter ───────────────────────────────────────────────


def test_valid_first_n_range():
    """0 is the shipping default — no warmup gate. Power users who want a
    warmup ramp set 1-50 manually."""
    for n in (0, 1, 5, 10, 25, 50):
        assert _validate_auto_send_fields({"autoSendApprovedAfter": n}) is None, n


def test_first_n_below_zero_rejected():
    err = _validate_auto_send_fields({"autoSendApprovedAfter": -1})
    assert err is not None
    assert err[0] == "invalid_autoSendApprovedAfter"


def test_first_n_above_50_rejected():
    err = _validate_auto_send_fields({"autoSendApprovedAfter": 51})
    assert err is not None
    assert err[0] == "invalid_autoSendApprovedAfter"


def test_first_n_non_int_rejected():
    """Floats, strings, lists, etc. all rejected."""
    for v in (5.0, "5", [5], {"n": 5}):
        err = _validate_auto_send_fields({"autoSendApprovedAfter": v})
        assert err is not None, v
        assert err[0] == "invalid_autoSendApprovedAfter"


def test_first_n_bool_rejected():
    """Python bools are ints (True == 1), so a naive `isinstance(v, int)`
    would let `True` through and quietly set the first-N gate to 1.
    Defensive bool check guards that."""
    err = _validate_auto_send_fields({"autoSendApprovedAfter": True})
    assert err is not None
    assert err[0] == "invalid_autoSendApprovedAfter"


# ── hardDailySendCap ────────────────────────────────────────────────────


def test_null_hard_cap_accepted():
    """null means 'use tier cap' — that's a legitimate config value, not
    a missing field."""
    assert _validate_auto_send_fields({"hardDailySendCap": None}) is None


def test_valid_hard_cap_range():
    for v in (0, 10, 25, 75, 200):
        assert _validate_auto_send_fields({"hardDailySendCap": v}) is None, v


def test_negative_hard_cap_rejected():
    err = _validate_auto_send_fields({"hardDailySendCap": -1})
    assert err is not None
    assert err[0] == "invalid_hardDailySendCap"


def test_hard_cap_above_200_rejected():
    """200 is Elite's tier ceiling × ~2.5. Beyond that we're guaranteed
    to exceed Gmail's free-account 500/day soft throttle and pose a real
    risk to the student's Gmail reputation."""
    err = _validate_auto_send_fields({"hardDailySendCap": 201})
    assert err is not None
    assert err[0] == "invalid_hardDailySendCap"


def test_hard_cap_bool_rejected():
    err = _validate_auto_send_fields({"hardDailySendCap": True})
    assert err is not None
    assert err[0] == "invalid_hardDailySendCap"


# ── autoSendApprovedCount — must always reject ──────────────────────────


def test_auto_send_approved_count_always_rejected():
    """Critical invariant: clients must never set this. Allowing it would
    let a user POST {autoSendApprovedCount: 999} and bypass the first-N
    gate entirely. The approve-send endpoint is the only writer."""
    err = _validate_auto_send_fields({"autoSendApprovedCount": 999})
    assert err is not None
    assert err[0] == "autoSendApprovedCount_read_only"


def test_auto_send_approved_count_rejected_even_with_valid_fields():
    """Mixing the server-managed field with legitimate ones still fails
    the whole request — fail-closed."""
    err = _validate_auto_send_fields({
        "autoSendMode": "send_for_me",
        "autoSendApprovedAfter": 5,
        "autoSendApprovedCount": 0,  # client trying to "reset" the counter
    })
    assert err is not None
    assert err[0] == "autoSendApprovedCount_read_only"


# ── Combined valid body ─────────────────────────────────────────────────


def test_full_valid_auto_send_body_passes():
    assert _validate_auto_send_fields({
        "autoSendMode": "send_for_me",
        "autoSendApprovedAfter": 5,
        "hardDailySendCap": 15,
    }) is None
