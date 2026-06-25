"""Tests for the Loop auto-send gate (Phase 9).

Coverage:
  - One test per GateReason failure path
  - Cheap-check short-circuit: assert the Hunter fn is NOT called when an
    earlier check denies. This guards the "Hunter spend doesn't leak"
    invariant — the entire design rationale for ordering the gate
    cheapest-to-expensive.
  - Verification cache: a recent emailVerifiedAt on the contact doc
    skips Hunter entirely.
  - Approve-send happy path: all 6 checks pass, verification result is
    populated, effective_cap reflects the tier.

No Firestore, no Hunter HTTP — everything is injected via the
verify_email_fn / get_sends_today_fn kwargs.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.services.agent_send_gate import can_auto_send


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def hunter_stub():
    """Returns a MagicMock so tests can assert call counts. Default return
    is 'valid' so the happy path works without per-test config."""
    fn = MagicMock(return_value={"status": "valid", "score": 95})
    return fn


@pytest.fixture
def sends_today_stub():
    """Returns a MagicMock that defaults to 0 sends today."""
    fn = MagicMock(return_value=0)
    return fn


@pytest.fixture
def gmail_connected_stub():
    """Returns a MagicMock that defaults to True (Gmail connected). Tests
    targeting the gmail_not_connected denial override to False."""
    fn = MagicMock(return_value=True)
    return fn


def _loop(**overrides) -> dict:
    """Build a Loop doc primed for send_for_me + past-first-N. Tests
    override individual fields to drive specific failure modes."""
    base = {
        "autoSendMode": "send_for_me",
        "autoSendApprovedCount": 10,    # past the gate
        "autoSendApprovedAfter": 5,
        "hardDailySendCap": None,
    }
    base.update(overrides)
    return base


def _contact(**overrides) -> dict:
    """Minimal valid contact with email."""
    base = {"email": "alice@stripe.com"}
    base.update(overrides)
    return base


def _during_work_hours() -> datetime:
    """2pm UTC = 7am PT (still quiet) or 9am ET (open). The gate uses
    America/Los_Angeles by default, so we need 8a-10p PT. Use 6pm UTC =
    11am PT."""
    return datetime(2026, 6, 3, 18, 0, tzinfo=timezone.utc)


def _during_quiet_hours() -> datetime:
    """3am UTC = 8pm PT prior day = 7pm PT — still open. Use 11am UTC
    = 4am PT = quiet hours."""
    return datetime(2026, 6, 3, 11, 0, tzinfo=timezone.utc)


# ── Reason: mode_not_send ───────────────────────────────────────────────


def test_denied_when_mode_is_draft_only(hunter_stub, sends_today_stub):
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(autoSendMode="draft_only"),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
    )
    assert result["allowed"] is False
    assert result["reason"] == "mode_not_send"
    # Critical: no paid Hunter call when we bail this early.
    assert hunter_stub.call_count == 0
    # Also no Firestore read.
    assert sends_today_stub.call_count == 0


def test_denied_when_mode_is_approve_each(hunter_stub):
    result = can_auto_send(
        uid="u1",
        tier="elite",
        loop=_loop(autoSendMode="approve_each"),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
    )
    assert result["reason"] == "mode_not_send"
    assert hunter_stub.call_count == 0


# ── Reason: no_email ────────────────────────────────────────────────────


def test_denied_when_contact_has_no_email(hunter_stub):
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact={"email": ""},
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
    )
    assert result["reason"] == "no_email"
    assert hunter_stub.call_count == 0


def test_denied_when_contact_email_is_whitespace(hunter_stub):
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact={"email": "   "},
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
    )
    assert result["reason"] == "no_email"


# ── Reason: tier_no_autosend ────────────────────────────────────────────


def test_denied_for_free_tier(hunter_stub, sends_today_stub):
    """Even if the wizard somehow flipped a Free user's Loop to
    send_for_me, the gate must refuse. Defense in depth."""
    result = can_auto_send(
        uid="u1",
        tier="free",
        loop=_loop(),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
    )
    assert result["reason"] == "tier_no_autosend"
    assert hunter_stub.call_count == 0
    assert sends_today_stub.call_count == 0


# ── Reason: quiet_hours ─────────────────────────────────────────────────


def test_denied_during_quiet_hours_pt(hunter_stub, sends_today_stub):
    """4am Pacific is outside 8a-10p — must deny. Same window the cycle
    scheduler enforces, so a Loop that's allowed to cycle is also allowed
    to send."""
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        user_timezone="America/Los_Angeles",
        now=_during_quiet_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
    )
    assert result["reason"] == "quiet_hours"
    assert hunter_stub.call_count == 0
    assert sends_today_stub.call_count == 0


def test_allowed_during_work_hours_pt(hunter_stub, sends_today_stub, gmail_connected_stub):
    """Smoke: 11am PT is squarely inside the window — must not trip
    quiet_hours."""
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        user_timezone="America/Los_Angeles",
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["allowed"] is True


# ── Reason: first_n_pending ─────────────────────────────────────────────


def test_denied_when_first_n_not_satisfied(hunter_stub, sends_today_stub):
    """Loop is in send_for_me but the student has only manually approved
    3 of the required 5 sends — drafts continue to queue."""
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(autoSendApprovedCount=3, autoSendApprovedAfter=5),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
    )
    assert result["reason"] == "first_n_pending"
    assert hunter_stub.call_count == 0
    # First-N is cheaper than the daily-cap Firestore read.
    assert sends_today_stub.call_count == 0


def test_allowed_when_first_n_exactly_met(hunter_stub, sends_today_stub, gmail_connected_stub):
    """Edge: count == after must allow (the Nth+1 send goes through)."""
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(autoSendApprovedCount=5, autoSendApprovedAfter=5),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["allowed"] is True


def test_no_warmup_default_does_not_misfire_on_falsy_zero(
    hunter_stub, sends_today_stub, gmail_connected_stub
):
    """REGRESSION: autoSendApprovedAfter=0 is the no-warmup default we ship.
    A prior implementation used `int(loop.get('autoSendApprovedAfter', 5) or 5)`,
    which silently turns 0 into 5 because `0 or 5 == 5` in Python — making
    every send_for_me Loop forever deny with first_n_pending. This test
    locks the correct behavior: count=0, after=0 must pass the gate."""
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(autoSendApprovedCount=0, autoSendApprovedAfter=0),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["allowed"] is True, result
    assert result["reason"] is None


# ── Reason: daily_cap ───────────────────────────────────────────────────


def test_denied_at_tier_daily_cap(hunter_stub, gmail_connected_stub):
    sends_today = MagicMock(return_value=25)  # Pro cap
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today,
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["reason"] == "daily_cap"
    assert result["effective_cap"] == 25
    # Hunter must NOT be called when the cap is the blocker.
    assert hunter_stub.call_count == 0


def test_denied_at_hard_cap_below_tier(hunter_stub, gmail_connected_stub):
    """hardDailySendCap=10 on an Elite Loop — effective cap is 10 even
    though the tier allows 75."""
    sends_today = MagicMock(return_value=10)
    result = can_auto_send(
        uid="u1",
        tier="elite",
        loop=_loop(hardDailySendCap=10),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today,
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["reason"] == "daily_cap"
    assert result["effective_cap"] == 10
    assert hunter_stub.call_count == 0


# ── Reason: email_unverified ────────────────────────────────────────────


def test_denied_when_hunter_says_invalid(gmail_connected_stub):
    hunter = MagicMock(return_value={"status": "invalid", "score": 0})
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter,
        get_sends_today_fn=MagicMock(return_value=0),
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["reason"] == "email_unverified"
    # The verification result is still returned so the caller can persist it
    # (so we don't re-verify a known-invalid email next cycle).
    assert result["verification"]["status"] == "invalid"
    assert hunter.call_count == 1


def test_denied_when_hunter_says_unknown(gmail_connected_stub):
    hunter = MagicMock(return_value={"status": "unknown", "score": 50})
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter,
        get_sends_today_fn=MagicMock(return_value=0),
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["reason"] == "email_unverified"


def test_denied_when_hunter_returns_none(gmail_connected_stub):
    """Hunter returned None (API key missing / total failure). Fall back
    to draft-only — never assume a non-result is fine."""
    hunter = MagicMock(return_value=None)
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter,
        get_sends_today_fn=MagicMock(return_value=0),
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["reason"] == "email_unverified"


def test_denied_when_hunter_raises(gmail_connected_stub):
    """Hunter exception → log + treat as unverified. Never bubble up to
    the cycle."""
    hunter = MagicMock(side_effect=RuntimeError("hunter down"))
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter,
        get_sends_today_fn=MagicMock(return_value=0),
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["reason"] == "email_unverified"


# ── Reason: gmail_not_connected ────────────────────────────────────────


def test_denied_when_gmail_not_connected(hunter_stub):
    """User flipped a Loop to send_for_me but never connected Gmail. The
    gate must deny with a dedicated reason (so /tracker can render
    'Connect Gmail →') rather than letting send_email_for_user blow up
    with a generic 'No Gmail credentials' exception downstream."""
    gmail_off = MagicMock(return_value=False)
    sends_today = MagicMock(return_value=0)

    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today,
        gmail_connected_fn=gmail_off,
    )

    assert result["allowed"] is False
    assert result["reason"] == "gmail_not_connected"
    # Critical: no paid Hunter call when Gmail isn't even connected, and
    # no daily-cap read either (cheaper checks should bail first).
    assert hunter_stub.call_count == 0
    assert sends_today.call_count == 0


def test_gmail_check_runs_after_first_n(hunter_stub, sends_today_stub):
    """Defense-in-depth: a Loop still inside the first-N gate must NOT
    even invoke the Gmail-connected check. The Firestore read is more
    expensive than the in-memory first-N comparison."""
    gmail_check = MagicMock(return_value=False)

    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(autoSendApprovedCount=2, autoSendApprovedAfter=5),
        contact=_contact(),
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
        gmail_connected_fn=gmail_check,
    )

    # The cheaper reason wins.
    assert result["reason"] == "first_n_pending"
    assert gmail_check.call_count == 0


# ── Verification cache ──────────────────────────────────────────────────


def test_cached_valid_verification_skips_hunter(hunter_stub, sends_today_stub, gmail_connected_stub):
    """Contact was verified 5 days ago. Cache is fresh (<30d). Gate must
    NOT call Hunter."""
    now = _during_work_hours()
    five_days_ago = (now - timedelta(days=5)).isoformat()

    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(
            emailVerifiedAt=five_days_ago,
            emailVerificationStatus="valid",
        ),
        now=now,
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["allowed"] is True
    assert result["verification"]["source"] == "cache"
    # The critical assertion — no paid call.
    assert hunter_stub.call_count == 0


def test_stale_verification_triggers_hunter(hunter_stub, sends_today_stub, gmail_connected_stub):
    """Contact was verified 45 days ago — outside the 30-day cache
    window. Must re-verify."""
    now = _during_work_hours()
    forty_five_days_ago = (now - timedelta(days=45)).isoformat()

    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(
            emailVerifiedAt=forty_five_days_ago,
            emailVerificationStatus="valid",  # stale; can't trust
        ),
        now=now,
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["allowed"] is True
    assert result["verification"]["source"] == "hunter"
    assert hunter_stub.call_count == 1


def test_cached_invalid_verification_blocks_without_hunter(gmail_connected_stub):
    """A known-invalid email shouldn't waste a Hunter call to re-confirm
    within the cache window."""
    now = _during_work_hours()
    one_day_ago = (now - timedelta(days=1)).isoformat()
    hunter = MagicMock()

    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(
            emailVerifiedAt=one_day_ago,
            emailVerificationStatus="invalid",
        ),
        now=now,
        verify_email_fn=hunter,
        get_sends_today_fn=MagicMock(return_value=0),
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["reason"] == "email_unverified"
    assert hunter.call_count == 0


# ── Happy path ──────────────────────────────────────────────────────────


def test_all_gates_pass_returns_allowed_with_verification(hunter_stub, sends_today_stub, gmail_connected_stub):
    result = can_auto_send(
        uid="u1",
        tier="pro",
        loop=_loop(),
        contact=_contact(),
        user_timezone="America/Los_Angeles",
        now=_during_work_hours(),
        verify_email_fn=hunter_stub,
        get_sends_today_fn=sends_today_stub,
        gmail_connected_fn=gmail_connected_stub,
    )
    assert result["allowed"] is True
    assert result["reason"] is None
    assert result["verification"]["status"] == "valid"
    assert result["verification"]["email"] == "alice@stripe.com"
    assert result["effective_cap"] == 25  # Pro tier
    assert hunter_stub.call_count == 1
