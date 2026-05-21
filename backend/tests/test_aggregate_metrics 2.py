"""Tests for the weekly metrics aggregation script."""
import pytest
from unittest.mock import patch, Mock, MagicMock
from datetime import datetime, timedelta, timezone


@pytest.fixture
def mock_db():
    return Mock()


def _make_event_doc(event_type, properties=None):
    """Helper: create a mock Firestore doc snapshot for a metrics event."""
    doc = Mock()
    doc.to_dict.return_value = {
        "event_type": event_type,
        "properties": properties or {},
        "uid": "user1",
        "event_date": "2026-04-27",
    }
    return doc


class TestReplyRateComputation:

    def test_reply_rate_computation(self, mock_db):
        """Seed events and verify correct ratio."""
        from scripts.aggregate_metrics import compute_reply_rate

        sent_docs = [_make_event_doc("email_actually_sent") for _ in range(10)]
        reply_docs = [_make_event_doc("reply_received") for _ in range(3)]

        def fake_collection(name):
            coll = Mock()

            def fake_where(field, op, value):
                query = Mock()
                if value == "email_actually_sent":
                    query.where.return_value = query
                    query.stream.return_value = iter(sent_docs)
                elif value == "reply_received":
                    query.where.return_value = query
                    query.stream.return_value = iter(reply_docs)
                else:
                    query.where.return_value = query
                    query.stream.return_value = iter([])
                return query

            coll.where = fake_where
            return coll

        mock_db.collection = fake_collection
        since = datetime.now(timezone.utc) - timedelta(days=7)

        result = compute_reply_rate(mock_db, since)
        assert result["sent_count"] == 10
        assert result["reply_count"] == 3
        assert result["reply_rate"] == 0.3

    def test_division_by_zero_handled(self, mock_db):
        """No email_actually_sent events should return 0.0, not crash."""
        from scripts.aggregate_metrics import compute_reply_rate

        def fake_collection(name):
            coll = Mock()

            def fake_where(field, op, value):
                query = Mock()
                query.where.return_value = query
                query.stream.return_value = iter([])
                return query

            coll.where = fake_where
            return coll

        mock_db.collection = fake_collection
        since = datetime.now(timezone.utc) - timedelta(days=7)

        result = compute_reply_rate(mock_db, since)
        assert result["sent_count"] == 0
        assert result["reply_count"] == 0
        assert result["reply_rate"] == 0.0

    def test_empty_collection_writes_zeros(self, mock_db):
        """Empty metrics_events should produce a metrics_weekly doc with zeros."""
        from scripts.aggregate_metrics import compute_reply_rate, compute_conversion_rate

        def fake_collection(name):
            coll = Mock()
            if name == "metrics_events":
                def fake_where(field, op, value):
                    query = Mock()
                    query.where.return_value = query
                    query.stream.return_value = iter([])
                    return query
                coll.where = fake_where
            elif name == "users":
                coll.stream.return_value = iter([])
            return coll

        mock_db.collection = fake_collection
        since = datetime.now(timezone.utc) - timedelta(days=7)
        since_30d = datetime.now(timezone.utc) - timedelta(days=30)

        reply_data = compute_reply_rate(mock_db, since)
        conversion_data = compute_conversion_rate(mock_db, since_30d)

        assert reply_data["reply_rate"] == 0.0
        assert conversion_data["conversion_rate"] == 0.0
        assert conversion_data["free_count"] == 0
        assert conversion_data["upgraded_count"] == 0
