"""Tests for metrics event logging utility."""
import pytest
from unittest.mock import patch, Mock, call
from datetime import datetime


class TestLogEvent:
    """Tests for app.utils.metrics_events.log_event."""

    @patch("app.utils.metrics_events.get_db")
    def test_log_event_writes_correct_schema(self, mock_get_db):
        from app.utils.metrics_events import log_event
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        log_event("user123", "email_generated", {"contact_id": "c1", "email_length": 50})

        mock_db.collection.assert_called_once_with("metrics_events")
        add_call = mock_db.collection().add.call_args[0][0]
        assert add_call["uid"] == "user123"
        assert add_call["event_type"] == "email_generated"
        assert add_call["properties"]["contact_id"] == "c1"
        assert add_call["properties"]["email_length"] == 50
        assert "timestamp" in add_call
        assert "event_date" in add_call
        # event_date should be YYYY-MM-DD format
        datetime.strptime(add_call["event_date"], "%Y-%m-%d")

    @patch("app.utils.metrics_events.get_db")
    def test_log_event_swallows_firestore_error(self, mock_get_db):
        from app.utils.metrics_events import log_event
        mock_get_db.side_effect = RuntimeError("Firestore unavailable")

        # Should not raise
        log_event("user123", "search_performed", {"query": "test"})

    @patch("app.utils.metrics_events.get_db")
    def test_log_event_rejects_unknown_event_type(self, mock_get_db):
        from app.utils.metrics_events import log_event
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        log_event("user123", "emial_generated", {"key": "val"})

        # Should not write to Firestore
        mock_db.collection.assert_not_called()

    @patch("app.utils.metrics_events.get_db")
    def test_log_event_with_none_uid(self, mock_get_db):
        from app.utils.metrics_events import log_event
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        log_event(None, "email_generated", {})

        add_call = mock_db.collection().add.call_args[0][0]
        assert add_call["uid"] == "unknown"

    @patch("app.utils.metrics_events.get_db")
    def test_log_event_with_empty_properties(self, mock_get_db):
        from app.utils.metrics_events import log_event
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        log_event("user123", "reply_received")

        add_call = mock_db.collection().add.call_args[0][0]
        assert add_call["properties"] == {}

    @patch("app.utils.metrics_events.get_db")
    def test_log_event_with_valid_event_types(self, mock_get_db):
        from app.utils.metrics_events import log_event
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        event_types = [
            "email_generated",
            "email_actually_sent",
            "reply_received",
            "search_performed",
        ]
        for et in event_types:
            log_event("user123", et, {"key": "val"})

        assert mock_db.collection().add.call_count == len(event_types)
