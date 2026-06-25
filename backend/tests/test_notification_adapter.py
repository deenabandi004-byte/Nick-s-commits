"""
Tests for app.services.notification_adapter — Resend HTTP + channel enum.

Mocks all HTTP via monkeypatch on `requests.post`. No real network calls.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
import requests

from app import config
from app.services import notification_adapter
from app.services.notification_adapter import Channel, SendResult, send


def _mock_response(status_code: int, body: dict | None = None) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = body or {}
    resp.text = "" if body is None else str(body)
    return resp


@pytest.fixture(autouse=True)
def _configured_api_key(monkeypatch):
    """Default: API key configured. Individual tests can unset it."""
    monkeypatch.setattr(config, "RESEND_API_KEY", "test_key_abc")
    monkeypatch.setattr(config, "RESEND_FROM_EMAIL", "test@example.com")


def test_email_200_returns_success(monkeypatch):
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        return _mock_response(200, {"id": "msg_123"})

    monkeypatch.setattr(requests, "post", fake_post)
    result = send(
        Channel.EMAIL,
        recipient="user@example.com",
        subject="hi",
        html_body="<p>hi</p>",
        text_body="hi",
    )

    assert isinstance(result, SendResult)
    assert result.success is True
    assert result.channel == Channel.EMAIL
    assert result.recipient == "user@example.com"
    assert result.vendor_message_id == "msg_123"
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["json"]["to"] == ["user@example.com"]
    assert captured["headers"]["Authorization"] == "Bearer test_key_abc"


def test_email_400_returns_invalid_recipient(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *a, **kw: _mock_response(400))
    result = send(
        Channel.EMAIL,
        recipient="bad",
        subject="x",
        html_body="x",
        text_body="x",
    )
    assert result.success is False
    assert result.error_code == "invalid_recipient"


def test_email_500_returns_vendor_5xx(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *a, **kw: _mock_response(500))
    result = send(
        Channel.EMAIL,
        recipient="user@example.com",
        subject="x",
        html_body="x",
        text_body="x",
    )
    assert result.success is False
    assert result.error_code == "vendor_5xx"


def test_email_429_returns_rate_limit(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *a, **kw: _mock_response(429))
    result = send(
        Channel.EMAIL,
        recipient="user@example.com",
        subject="x",
        html_body="x",
        text_body="x",
    )
    assert result.success is False
    assert result.error_code == "rate_limit"


def test_email_timeout_returns_timeout(monkeypatch):
    def fake_post(*a, **kw):
        raise requests.Timeout("simulated")

    monkeypatch.setattr(requests, "post", fake_post)
    result = send(
        Channel.EMAIL,
        recipient="user@example.com",
        subject="x",
        html_body="x",
        text_body="x",
    )
    assert result.success is False
    assert result.error_code == "timeout"


def test_email_with_no_api_key_short_circuits(monkeypatch):
    """No HTTP call when key is missing — return not_configured immediately."""
    monkeypatch.setattr(config, "RESEND_API_KEY", "")
    called = {"hit": False}

    def fake_post(*a, **kw):
        called["hit"] = True
        return _mock_response(200)

    monkeypatch.setattr(requests, "post", fake_post)
    result = send(
        Channel.EMAIL,
        recipient="user@example.com",
        subject="x",
        html_body="x",
        text_body="x",
    )
    assert called["hit"] is False
    assert result.success is False
    assert result.error_code == "not_configured"


def test_sms_channel_raises_not_implemented(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *a, **kw: _mock_response(200))
    with pytest.raises(NotImplementedError):
        send(
            Channel.SMS,
            recipient="+15551234567",
            subject="x",
            html_body="x",
            text_body="x",
        )


def test_slack_channel_raises_not_implemented(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *a, **kw: _mock_response(200))
    with pytest.raises(NotImplementedError):
        send(
            Channel.SLACK,
            recipient="#alerts",
            subject="x",
            html_body="x",
            text_body="x",
        )


def test_email_passes_optional_headers(monkeypatch):
    """List-Unsubscribe and friends flow through to the Resend payload."""
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["payload"] = json
        return _mock_response(200, {"id": "ok"})

    monkeypatch.setattr(requests, "post", fake_post)
    send(
        Channel.EMAIL,
        recipient="user@example.com",
        subject="x",
        html_body="x",
        text_body="x",
        headers={"List-Unsubscribe": "<https://example.com/unsub>"},
    )
    assert captured["payload"]["headers"]["List-Unsubscribe"] == "<https://example.com/unsub>"
