"""
Tests for app.services.loop_notifications — tokens, rendering, send-gate.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app import config
from app.services import loop_notifications
from app.services.loop_notifications import (
    assess_cycle_results,
    build_unsubscribe_token,
    idempotency_key,
    render_daily_digest,
    send_daily_digest_email,
    verify_unsubscribe_token,
)
from app.services.notification_adapter import Channel, SendResult


# ── Unsubscribe tokens ──────────────────────────────────────────────────────


def test_token_roundtrip_returns_uid(monkeypatch):
    monkeypatch.setattr(config, "FLASK_SECRET", "test_secret")
    monkeypatch.setattr(config, "LOOPS_UNSUBSCRIBE_TOKEN_TTL_DAYS", 30)
    token = build_unsubscribe_token("uid-123")
    assert verify_unsubscribe_token(token) == "uid-123"


def test_tampered_token_returns_none(monkeypatch):
    monkeypatch.setattr(config, "FLASK_SECRET", "test_secret")
    token = build_unsubscribe_token("uid-123")
    # Flip a character near the middle.
    tampered = token[:10] + ("X" if token[10] != "X" else "Y") + token[11:]
    assert verify_unsubscribe_token(tampered) is None


def test_expired_token_returns_none(monkeypatch):
    monkeypatch.setattr(config, "FLASK_SECRET", "test_secret")
    monkeypatch.setattr(config, "LOOPS_UNSUBSCRIBE_TOKEN_TTL_DAYS", 1)
    past = datetime.now(timezone.utc) - timedelta(days=5)
    token = build_unsubscribe_token("uid-123", now=past)
    assert verify_unsubscribe_token(token) is None


def test_forged_token_with_different_secret_returns_none(monkeypatch):
    monkeypatch.setattr(config, "FLASK_SECRET", "secret_one")
    token = build_unsubscribe_token("uid-123")
    monkeypatch.setattr(config, "FLASK_SECRET", "secret_two")
    assert verify_unsubscribe_token(token) is None


def test_garbage_token_returns_none():
    assert verify_unsubscribe_token("not-a-token") is None
    assert verify_unsubscribe_token("") is None


# ── Render ──────────────────────────────────────────────────────────────────


def _item(company="Stripe", title="SWE Intern"):
    return {
        "company": company,
        "title": title,
        "context": "Strong fit",
        "loop_id": "loop1",
        "result_kind": "job",
        "loop_url": "https://offerloop.ai/agent/loop1",
    }


def test_render_daily_digest_one_item():
    html, text = render_daily_digest("uid-1", [_item()], "https://x/u/abc")
    assert html.strip()
    assert text.strip()
    assert "Stripe" in html
    assert "SWE Intern" in html


def test_render_daily_digest_five_items():
    items = [_item(f"Co{i}", f"Role{i}") for i in range(5)]
    html, text = render_daily_digest("uid-1", items, "https://x/u/abc")
    assert html.strip()
    assert text.strip()
    for i in range(5):
        assert f"Co{i}" in html
        assert f"Role{i}" in text


def test_render_daily_digest_zero_items_still_renders():
    html, text = render_daily_digest("uid-1", [], "https://x/u/abc")
    assert html.strip()
    assert text.strip()
    # Empty count message should still be there.
    assert "0" in html


def test_render_daily_digest_contains_company_and_title_verbatim():
    html, _text = render_daily_digest(
        "uid-1",
        [{"company": "Plaid", "title": "Software Engineer", "context": "ctx", "loop_id": "l", "result_kind": "job"}],
        "https://x/u/abc",
    )
    assert "Plaid" in html
    assert "Software Engineer" in html


# ── Send (flag gate) ────────────────────────────────────────────────────────


def test_send_disabled_when_flag_false(monkeypatch):
    """The critical flag-gate test — PR2 ships dead at merge."""
    monkeypatch.setattr(config, "LOOPS_ALERT_EMAILS_ENABLED", False)
    # Ensure adapter is NEVER called.
    called = {"hit": False}

    def boom(*a, **kw):
        called["hit"] = True
        raise AssertionError("adapter must not be called when flag is off")

    monkeypatch.setattr(loop_notifications, "adapter_send", boom)
    result = send_daily_digest_email(
        uid="uid-1",
        recipient_email="u@x.com",
        items=[_item()],
        unsubscribe_url="https://x/u/abc",
    )
    assert called["hit"] is False
    assert isinstance(result, SendResult)
    assert result.success is False
    assert result.error_code == "disabled"
    assert result.channel == Channel.EMAIL


def test_send_calls_adapter_when_flag_true(monkeypatch):
    monkeypatch.setattr(config, "LOOPS_ALERT_EMAILS_ENABLED", True)

    captured = {}

    def fake_send(channel, recipient, subject, html_body, text_body, headers=None):
        captured["channel"] = channel
        captured["recipient"] = recipient
        captured["subject"] = subject
        captured["html_body"] = html_body
        captured["headers"] = headers or {}
        return SendResult(
            success=True,
            channel=channel,
            recipient=recipient,
            vendor_message_id="m1",
        )

    monkeypatch.setattr(loop_notifications, "adapter_send", fake_send)
    result = send_daily_digest_email(
        uid="uid-1",
        recipient_email="u@x.com",
        items=[_item()],
        unsubscribe_url="https://x/u/abc",
    )
    assert result.success is True
    assert captured["channel"] == Channel.EMAIL
    assert captured["recipient"] == "u@x.com"
    assert captured["subject"]
    assert "Stripe" in captured["html_body"]
    assert captured["headers"]["List-Unsubscribe"] == "<https://x/u/abc>"


# ── assess_cycle_results ────────────────────────────────────────────────────


def test_assess_cycle_results_summarizes_a_real_cycle():
    """Happy path: a cycle that found contacts + hms produces one summary
    item with a human-readable snippet, kind='loop_run', and stable keys
    the frontend useNotifications hook can read."""
    items = assess_cycle_results(
        loop_id="loop-1",
        loop_name="JPMorgan IB",
        cycle_id="cycle-abc",
        result={
            "contactsFound": 3,
            "emailsDrafted": 3,
            "hmsFound": 1,
            "jobsFound": 0,
            "companiesDiscovered": 0,
        },
    )
    assert len(items) == 1
    it = items[0]
    assert it["kind"] == "loop_run"
    assert it["loopId"] == "loop-1"
    assert it["loopName"] == "JPMorgan IB"
    assert it["cycleId"] == "cycle-abc"
    assert it["read"] is False
    assert "3 contacts" in it["snippet"]
    assert "1 hiring manager" in it["snippet"]


def test_assess_cycle_results_empty_for_empty_cycles():
    """Don't spam the bell when a cycle did nothing — empty result means
    no notification, even if the cycle technically succeeded."""
    assert assess_cycle_results(
        loop_id="l", loop_name="n", cycle_id="c",
        result={"contactsFound": 0, "emailsDrafted": 0, "jobsFound": 0,
                "hmsFound": 0, "companiesDiscovered": 0},
    ) == []


def test_assess_cycle_results_plural_grammar():
    """Snippet uses correct singular/plural forms — 1 contact, 1 hiring
    manager (not 'contacts' or 'managers')."""
    items = assess_cycle_results(
        loop_id="l", loop_name="n", cycle_id="c",
        result={"contactsFound": 1, "hmsFound": 1, "jobsFound": 1,
                "companiesDiscovered": 1, "emailsDrafted": 0},
    )
    assert len(items) == 1
    snip = items[0]["snippet"]
    assert "1 contact," in snip and "1 contacts" not in snip
    assert "1 hiring manager," in snip and "managers" not in snip
    assert "1 job," in snip and "jobs" not in snip
    assert "1 company." in snip and "companies." not in snip


def test_idempotency_key_format_no_date():
    import re
    assert idempotency_key("c1", "u1") == "c1:u1"
    key = idempotency_key("cycle_abc_123", "uid_xyz")
    assert key == "cycle_abc_123:uid_xyz"
    # No date-shaped substring (YYYY-MM-DD or YYYYMMDD) should sneak in.
    assert not re.search(r"\d{4}-\d{2}-\d{2}", key)
    assert not re.search(r"\d{8}", key)
