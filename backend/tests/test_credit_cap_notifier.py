"""
credit_cap_notifier — out-of-credits email tests.

Mocks the Firestore client and the notification_adapter so no real
Resend traffic fires. Dedupe is the contract that matters most: a
student must get at most one out-of-credits email per billing period
no matter how many cycles land in credits_capped that month.
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services import credit_cap_notifier
from app.services.credit_cap_notifier import (
    _billing_period_key,
    notify_credits_capped,
    render_credits_capped,
)
from app.services.notification_adapter import Channel, SendResult


# ── Helpers ──────────────────────────────────────────────────────────────


def _fake_db(*, user_email: str | None = "test@example.com", already_notified: bool = False) -> MagicMock:
    """Build a Firestore stand-in that returns a user doc + tracks the
    dedupe doc's existence + captures any .set() on it."""
    user_data = {}
    if user_email:
        user_data["email"] = user_email
        user_data["firstName"] = "Sam"
    user_doc = MagicMock(exists=True, to_dict=lambda: user_data)

    dedup_doc = MagicMock()
    dedup_doc.get.return_value = MagicMock(exists=already_notified)
    dedup_writes: list[dict] = []
    dedup_doc.set.side_effect = lambda d: dedup_writes.append(d)
    dedup_doc._writes = dedup_writes  # type: ignore[attr-defined]

    user_doc_ref = MagicMock()
    user_doc_ref.get.return_value = user_doc
    user_doc_ref.collection.return_value.document.return_value.collection.return_value.document.return_value = dedup_doc

    users = MagicMock()
    users.document.return_value = user_doc_ref

    db = MagicMock()
    db.collection.return_value = users
    return db


def _ok_send_result() -> SendResult:
    return SendResult(
        success=True,
        channel=Channel.EMAIL,
        recipient="test@example.com",
        vendor_message_id="resend-msg-123",
    )


@pytest.fixture
def enable_alert_emails(monkeypatch):
    monkeypatch.setattr(credit_cap_notifier.config, "LOOPS_ALERT_EMAILS_ENABLED", True)


# ── _billing_period_key ──────────────────────────────────────────────────


def test_billing_period_key_is_yyyymm():
    """Calendar-month dedupe — December 2026 → '202612'."""
    now = datetime(2026, 12, 14, 22, 30, tzinfo=timezone.utc)
    assert _billing_period_key(now) == "202612"


def test_billing_period_key_zero_pads_single_digit_months():
    """Defensive — a March 14 datetime must dedupe under '202603', not '20263'."""
    now = datetime(2026, 3, 14, tzinfo=timezone.utc)
    assert _billing_period_key(now) == "202603"


# ── Rendering ────────────────────────────────────────────────────────────


def test_render_credits_capped_includes_loop_name_and_links():
    html, text = render_credits_capped(
        loop_name="Stripe PMs",
        recipient_first_name="Sam",
        fleet_url="https://offerloop.ai/agent",
        upgrade_url="https://offerloop.ai/pricing",
    )
    assert "Stripe PMs" in html
    assert "Stripe PMs" in text
    assert "https://offerloop.ai/agent" in html
    assert "https://offerloop.ai/agent" in text
    assert "https://offerloop.ai/pricing" in html
    # Founder voice: signed as Sid, not "the Offerloop team."
    assert "Sid" in text
    assert "Sid" in html


def test_render_credits_capped_handles_missing_first_name():
    html, text = render_credits_capped(
        loop_name="Stripe PMs",
        recipient_first_name=None,
        fleet_url="https://offerloop.ai/agent",
        upgrade_url="https://offerloop.ai/pricing",
    )
    # Both formats are acceptable — the test only asserts no "{first_name}"
    # placeholder leaked through and the doc still renders.
    assert "{{" not in html
    assert "{{" not in text
    assert "Your Loop paused" in text


# ── notify_credits_capped — happy path + dedupe ──────────────────────────


def test_notify_credits_capped_sends_and_records_dedup_doc(
    monkeypatch, enable_alert_emails,
):
    db = _fake_db()
    monkeypatch.setattr(credit_cap_notifier, "get_db", lambda: db)
    monkeypatch.setattr(
        credit_cap_notifier, "adapter_send", lambda *a, **k: _ok_send_result(),
    )

    result = notify_credits_capped(
        uid="u1", loop_id="L1", loop_name="Stripe PMs",
    )

    assert result is not None
    assert result.success is True
    # Dedupe doc was written exactly once.
    dedup_doc = (
        db.collection.return_value.document.return_value
        .collection.return_value.document.return_value
        .collection.return_value.document.return_value
    )
    assert len(dedup_doc._writes) == 1
    payload = dedup_doc._writes[0]
    assert payload["triggeringLoopId"] == "L1"
    assert payload["triggeringLoopName"] == "Stripe PMs"
    assert payload["vendorMessageId"] == "resend-msg-123"


def test_notify_credits_capped_dedupes_within_same_period(
    monkeypatch, enable_alert_emails,
):
    """The contract: a user must NOT get a second out-of-credits email
    within the same billing period even if 5 of their Loops trip the
    cap in the same week."""
    db = _fake_db(already_notified=True)
    sends: list[dict] = []
    monkeypatch.setattr(credit_cap_notifier, "get_db", lambda: db)
    monkeypatch.setattr(
        credit_cap_notifier,
        "adapter_send",
        lambda *a, **k: sends.append(k) or _ok_send_result(),
    )

    result = notify_credits_capped(
        uid="u1", loop_id="L2", loop_name="MBB networking",
    )

    assert result is None
    assert sends == []  # No send attempt at all


def test_notify_credits_capped_does_not_write_dedup_on_send_failure(
    monkeypatch, enable_alert_emails,
):
    """If Resend 5xx's, we MUST NOT mark the user as notified — otherwise
    they'd never get the email this billing period. Retry on the next
    cycle's pause-flip is the recovery path."""
    db = _fake_db()
    failing = SendResult(
        success=False,
        channel=Channel.EMAIL,
        recipient="test@example.com",
        error_code="vendor_5xx",
    )
    monkeypatch.setattr(credit_cap_notifier, "get_db", lambda: db)
    monkeypatch.setattr(credit_cap_notifier, "adapter_send", lambda *a, **k: failing)

    result = notify_credits_capped(
        uid="u1", loop_id="L1", loop_name="Stripe PMs",
    )

    assert result is not None
    assert result.success is False
    dedup_doc = (
        db.collection.return_value.document.return_value
        .collection.return_value.document.return_value
        .collection.return_value.document.return_value
    )
    assert dedup_doc._writes == []


# ── Flag gating + missing email guards ──────────────────────────────────


def test_notify_credits_capped_short_circuits_when_flag_disabled(monkeypatch):
    """Master kill switch — if LOOPS_ALERT_EMAILS_ENABLED is off, no
    Firestore reads, no Resend call. Returns a structured disabled result
    so the scheduler can log the no-op cleanly."""
    monkeypatch.setattr(credit_cap_notifier.config, "LOOPS_ALERT_EMAILS_ENABLED", False)
    db = MagicMock()
    monkeypatch.setattr(credit_cap_notifier, "get_db", lambda: db)
    sent = MagicMock()
    monkeypatch.setattr(credit_cap_notifier, "adapter_send", sent)

    result = notify_credits_capped(uid="u1", loop_id="L1", loop_name="Stripe PMs")

    assert result is not None
    assert result.success is False
    assert result.error_code == "disabled"
    sent.assert_not_called()
    # Did NOT read Firestore — the kill switch must be a fast-path.
    db.collection.assert_not_called()


def test_notify_credits_capped_skips_send_when_user_has_no_email(
    monkeypatch, enable_alert_emails,
):
    """A user doc without an email field shouldn't crash the scheduler —
    return a structured 'invalid_recipient' result and don't write a
    dedupe doc that would suppress future attempts."""
    db = _fake_db(user_email=None)
    sent = MagicMock()
    monkeypatch.setattr(credit_cap_notifier, "get_db", lambda: db)
    monkeypatch.setattr(credit_cap_notifier, "adapter_send", sent)

    result = notify_credits_capped(uid="u1", loop_id="L1", loop_name="Stripe PMs")

    assert result is not None
    assert result.success is False
    assert result.error_code == "invalid_recipient"
    sent.assert_not_called()
    dedup_doc = (
        db.collection.return_value.document.return_value
        .collection.return_value.document.return_value
        .collection.return_value.document.return_value
    )
    assert dedup_doc._writes == []
