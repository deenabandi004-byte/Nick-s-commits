"""Tests for the stale meeting prep reaper.

The prep worker is a daemon thread: a dev-server auto-reload or a Render
deploy kills it mid-job with no exception handler, so the prep doc froze at
its last stage forever and the credits were never refunded (observed live:
a prep stuck at analyzing/45% while historical runs complete in ~60s). The
reaper runs on the status read path: any prep still in-flight well past the
normal runtime is marked failed and refunded, exactly once.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.routes.coffee_chat_prep import (
    PREP_STALE_AFTER_SECONDS,
    _is_stale_prep,
    _maybe_reap_stale_prep,
)


def _iso(minutes_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


@pytest.mark.unit
def test_terminal_statuses_are_never_stale():
    assert not _is_stale_prep({"status": "completed", "createdAt": _iso(60)})
    assert not _is_stale_prep({"status": "failed", "createdAt": _iso(60)})


@pytest.mark.unit
def test_fresh_processing_prep_is_not_stale():
    assert not _is_stale_prep({"status": "analyzing", "createdAt": _iso(1)})


@pytest.mark.unit
def test_old_processing_prep_is_stale():
    old = _iso((PREP_STALE_AFTER_SECONDS / 60) + 1)
    assert _is_stale_prep({"status": "analyzing", "createdAt": old})
    assert _is_stale_prep({"status": "processing", "createdAt": old})


@pytest.mark.unit
def test_unparseable_created_at_is_not_stale():
    assert not _is_stale_prep({"status": "processing", "createdAt": "not-a-date"})
    assert not _is_stale_prep({"status": "processing"})


@pytest.mark.unit
def test_reap_marks_failed_and_refunds_once():
    prep_ref = MagicMock()
    data = {"status": "analyzing", "createdAt": _iso(30), "userId": "u1"}
    with patch(
        "app.routes.coffee_chat_prep.refund_credits_atomic",
        return_value=(True, 300),
    ) as refund:
        out = _maybe_reap_stale_prep(prep_ref, data, "u1")
    assert out["status"] == "failed"
    assert out["creditsRefunded"] is True
    assert "interrupted" in out["error"]
    refund.assert_called_once()
    prep_ref.update.assert_called_once()


@pytest.mark.unit
def test_reap_skips_refund_when_already_refunded():
    prep_ref = MagicMock()
    data = {"status": "analyzing", "createdAt": _iso(30), "creditsRefunded": True}
    with patch("app.routes.coffee_chat_prep.refund_credits_atomic") as refund:
        out = _maybe_reap_stale_prep(prep_ref, data, "u1")
    assert out["status"] == "failed"
    refund.assert_not_called()


@pytest.mark.unit
def test_reap_leaves_live_prep_alone():
    prep_ref = MagicMock()
    data = {"status": "analyzing", "createdAt": _iso(1)}
    with patch("app.routes.coffee_chat_prep.refund_credits_atomic") as refund:
        out = _maybe_reap_stale_prep(prep_ref, data, "u1")
    assert out["status"] == "analyzing"
    refund.assert_not_called()
    prep_ref.update.assert_not_called()
