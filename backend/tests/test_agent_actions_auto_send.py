"""Tests for the Phase 9 _try_auto_send helper in agent_actions.

Covers the per-contact send wiring without touching real Hunter / Gmail /
Firestore. Stubs are injected via monkeypatch on the three modules
agent_actions calls into: agent_send_gate, auth, gmail_client.

Goal: lock in the contact_doc mutations + credit return for each path:
  - Gate denies  → autoSendPausedReason stamped, 0 credits, no send call
  - Reservation lost race  → autoSendPausedReason="daily_cap", 0 credits
  - Gmail error  → autoSendError stamped, 0 credits, daily-cap slot kept
  - Success  → gmailMessageId/threadId/emailSentAt stamped, 1 credit
  - Verification cache hit refreshes contact_doc fields
"""
from unittest.mock import MagicMock

import pytest

from app.services import agent_actions
from app.services.agent_actions import _try_auto_send


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def stubs(monkeypatch):
    """Bundle the three injection points _try_auto_send touches. Each
    test mutates these MagicMocks to drive a specific path."""
    gate = MagicMock(return_value={
        "allowed": True,
        "reason": None,
        "verification": {
            "email": "alice@stripe.com",
            "status": "valid",
            "verifiedAt": "2026-06-03T18:00:00+00:00",
            "source": "hunter",
        },
        "effective_cap": 25,
    })
    increment = MagicMock(return_value=(True, 1, 25))
    send = MagicMock(return_value={
        "id": "msg-abc",
        "threadId": "thr-xyz",
        "labelIds": ["SENT"],
    })

    # _try_auto_send imports these lazily inside the function. Patch the
    # source modules so the imports resolve to our stubs.
    monkeypatch.setattr(
        "app.services.agent_send_gate.can_auto_send", gate,
    )
    monkeypatch.setattr(
        "app.services.auth.increment_sends_today_atomic", increment,
    )
    monkeypatch.setattr(
        "app.services.gmail_client.send_email_for_user", send,
    )

    return {"gate": gate, "increment": increment, "send": send}


def _config(**overrides) -> dict:
    base = {
        "autoSendMode": "send_for_me",
        "autoSendApprovedCount": 10,
        "autoSendApprovedAfter": 5,
        "hardDailySendCap": None,
    }
    base.update(overrides)
    return base


def _user(**overrides) -> dict:
    base = {
        "subscriptionTier": "pro",
        "timezone": "America/Los_Angeles",
    }
    base.update(overrides)
    return base


# ── Happy path ──────────────────────────────────────────────────────────


def test_success_stamps_message_thread_and_charges_one_credit(stubs):
    contact_doc = {}
    credits = _try_auto_send(
        uid="u1",
        config=_config(),
        user_data=_user(),
        contact_doc=contact_doc,
        email="alice@stripe.com",
        email_subject="Hi Alice",
        email_body="<p>hey</p>",
        now_iso="2026-06-03T18:00:00Z",
    )
    assert credits == 1  # AUTO_SEND_CREDIT_COST
    assert contact_doc["gmailMessageId"] == "msg-abc"
    assert contact_doc["gmailThreadId"] == "thr-xyz"
    assert contact_doc["emailSentAt"] == "2026-06-03T18:00:00Z"
    assert contact_doc["pipelineStage"] == "email_sent"
    assert contact_doc["inOutbox"] is True
    # Verification cache fields were stamped from the gate's verification.
    assert contact_doc["emailVerificationStatus"] == "valid"
    # No pause reason or error.
    assert "autoSendPausedReason" not in contact_doc
    assert "autoSendError" not in contact_doc

    stubs["gate"].assert_called_once()
    stubs["increment"].assert_called_once()
    stubs["send"].assert_called_once()


# ── Gate denials ────────────────────────────────────────────────────────


def test_gate_denial_stamps_reason_and_skips_send(stubs):
    stubs["gate"].return_value = {
        "allowed": False,
        "reason": "first_n_pending",
        "verification": None,
        "effective_cap": None,
    }
    contact_doc = {}
    credits = _try_auto_send(
        uid="u1",
        config=_config(autoSendApprovedCount=3),
        user_data=_user(),
        contact_doc=contact_doc,
        email="alice@stripe.com",
        email_subject="Hi",
        email_body="<p>hey</p>",
        now_iso="2026-06-03T18:00:00Z",
    )
    assert credits == 0
    assert contact_doc["autoSendPausedReason"] == "first_n_pending"
    # Critical: when the gate denies, no Gmail call AND no atomic reservation.
    assert stubs["send"].call_count == 0
    assert stubs["increment"].call_count == 0


def test_daily_cap_reason_carries_effective_cap(stubs):
    stubs["gate"].return_value = {
        "allowed": False,
        "reason": "daily_cap",
        "verification": None,
        "effective_cap": 25,
    }
    contact_doc = {}
    _try_auto_send(
        uid="u1",
        config=_config(),
        user_data=_user(),
        contact_doc=contact_doc,
        email="alice@stripe.com",
        email_subject="Hi",
        email_body="<p>hey</p>",
        now_iso="2026-06-03T18:00:00Z",
    )
    assert contact_doc["autoSendPausedReason"] == "daily_cap"
    assert contact_doc["autoSendDailyCap"] == 25


def test_unverified_email_persists_verification_for_cache(stubs):
    """Hunter returned 'invalid'. The gate denies, but the verification
    dict is still populated so the next cycle's cache hits instead of
    re-paying Hunter."""
    stubs["gate"].return_value = {
        "allowed": False,
        "reason": "email_unverified",
        "verification": {
            "email": "alice@stripe.com",
            "status": "invalid",
            "verifiedAt": "2026-06-03T18:00:00+00:00",
            "source": "hunter",
        },
        "effective_cap": 25,
    }
    contact_doc = {}
    _try_auto_send(
        uid="u1",
        config=_config(),
        user_data=_user(),
        contact_doc=contact_doc,
        email="alice@stripe.com",
        email_subject="Hi",
        email_body="<p>hey</p>",
        now_iso="2026-06-03T18:00:00Z",
    )
    assert contact_doc["autoSendPausedReason"] == "email_unverified"
    assert contact_doc["emailVerificationStatus"] == "invalid"
    assert contact_doc["emailVerifiedAt"] == "2026-06-03T18:00:00+00:00"


# ── Reservation race ────────────────────────────────────────────────────


def test_lost_race_falls_back_to_daily_cap_reason(stubs):
    """The gate said OK (sends_today was 24) but a parallel request
    incremented to 25 before our atomic call. The reservation refuses,
    and we treat it as if the gate had returned daily_cap."""
    stubs["increment"].return_value = (False, 25, 25)
    contact_doc = {}
    credits = _try_auto_send(
        uid="u1",
        config=_config(),
        user_data=_user(),
        contact_doc=contact_doc,
        email="alice@stripe.com",
        email_subject="Hi",
        email_body="<p>hey</p>",
        now_iso="2026-06-03T18:00:00Z",
    )
    assert credits == 0
    assert contact_doc["autoSendPausedReason"] == "daily_cap"
    assert contact_doc["autoSendDailyCap"] == 25
    # The race meant we never reached Gmail.
    assert stubs["send"].call_count == 0


# ── Gmail failure ───────────────────────────────────────────────────────


def test_gmail_error_stamps_error_and_keeps_slot(stubs):
    """Gmail flapped after we reserved a daily-cap slot. The slot stays
    consumed (don't refund — if Gmail is unhealthy, don't immediately
    retry against the same throttle). The contact_doc records the error."""
    stubs["send"].side_effect = RuntimeError("quota_exceeded")
    contact_doc = {}
    credits = _try_auto_send(
        uid="u1",
        config=_config(),
        user_data=_user(),
        contact_doc=contact_doc,
        email="alice@stripe.com",
        email_subject="Hi",
        email_body="<p>hey</p>",
        now_iso="2026-06-03T18:00:00Z",
    )
    assert credits == 0
    assert contact_doc["autoSendError"] == "quota_exceeded"
    assert contact_doc["autoSendPausedReason"] == "send_error"
    # We did try — increment fired before the failed send.
    assert stubs["increment"].call_count == 1


# ── No-email short circuit ──────────────────────────────────────────────


def test_blank_email_is_a_noop(stubs):
    contact_doc = {}
    credits = _try_auto_send(
        uid="u1",
        config=_config(),
        user_data=_user(),
        contact_doc=contact_doc,
        email="   ",
        email_subject="Hi",
        email_body="<p>hey</p>",
        now_iso="2026-06-03T18:00:00Z",
    )
    assert credits == 0
    # No gate call at all — the check is even cheaper than the gate's
    # own no_email guard.
    assert stubs["gate"].call_count == 0
    assert contact_doc == {}


def test_blank_body_is_a_noop(stubs):
    contact_doc = {}
    credits = _try_auto_send(
        uid="u1",
        config=_config(),
        user_data=_user(),
        contact_doc=contact_doc,
        email="alice@stripe.com",
        email_subject="Hi",
        email_body="",
        now_iso="2026-06-03T18:00:00Z",
    )
    assert credits == 0
    assert stubs["gate"].call_count == 0
