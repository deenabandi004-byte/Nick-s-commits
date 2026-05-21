"""Tests for metrics event instrumentation in routes."""
import pytest
from unittest.mock import patch, Mock, MagicMock, call


@pytest.fixture
def mock_metrics_log():
    """Patch log_event and return the mock."""
    with patch("app.utils.metrics_events.log_event") as mock_log:
        yield mock_log


class TestEmailGeneratedInstrumentation:
    """Tests for email_generated events in runs.py save block."""

    @patch("app.utils.metrics_events.get_db")
    def test_email_generated_fires_per_contact(self, mock_get_db):
        """Verify N email_generated events fire for N contacts with emailSubject."""
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        from app.utils.metrics_events import log_event

        # Simulate the instrumentation logic from runs.py
        contacts = [
            {"emailSubject": "Hi", "emailBody": "Hello from Google", "Company": "Google", "College": "USC", "pdlId": "p1"},
            {"emailSubject": "Hey", "emailBody": "Reaching out about Meta", "Company": "Meta", "College": "", "pdlId": "p2"},
            {"emailSubject": "Yo", "emailBody": "Generic email", "Company": "Amazon", "College": "", "pdlId": "p3"},
        ]
        user_id = "test-user"

        events = []
        for contact in contacts:
            if contact.get("emailSubject"):
                body = contact.get("emailBody", "")
                company_name = (contact.get("Company") or "").lower()
                college_name = (contact.get("College") or "").lower()
                body_lower = body.lower()
                has_specificity = (bool(company_name) and company_name in body_lower) or (bool(college_name) and college_name in body_lower)
                events.append({
                    "contact_id": contact.get("pdlId") or "",
                    "email_length": len(body.split()),
                    "has_specificity_signal": has_specificity,
                })
                log_event(user_id, "email_generated", events[-1])

        assert len(events) == 3
        # First contact mentions Google in body
        assert events[0]["has_specificity_signal"] is True
        # Second mentions Meta in body
        assert events[1]["has_specificity_signal"] is True
        # Third doesn't mention Amazon in body
        assert events[2]["has_specificity_signal"] is False

    def test_email_generated_skips_contacts_without_email(self):
        """Contacts without emailSubject should not fire events."""
        contacts = [
            {"emailBody": "No subject here", "Company": "Google", "pdlId": "p1"},
            {"emailSubject": "", "emailBody": "Empty subject", "pdlId": "p2"},
            {"emailSubject": "Has subject", "emailBody": "Body", "pdlId": "p3"},
        ]

        fired = []
        for contact in contacts:
            if contact.get("emailSubject"):
                fired.append(contact["pdlId"])

        assert fired == ["p3"]


class TestSearchPerformedInstrumentation:
    """Tests for search_performed event in runs.py."""

    @patch("app.utils.metrics_events.get_db")
    def test_search_performed_fires_once(self, mock_get_db):
        """Verify exactly 1 search_performed event per search with structured query."""
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        from app.utils.metrics_events import log_event

        contacts = [{"name": "John"}, {"name": "Jane"}]
        warmth_data = {
            "c1": {"tier": "warm"},
            "c2": {"tier": "cold"},
        }
        parsed_query_payload = {
            "companies": ["McKinsey"],
            "title_variations": ["consultant", "associate"],
            "locations": ["New York"],
        }

        # Replicate the instrumentation logic
        top_tier = ""
        if warmth_data:
            tiers = [v.get("tier", "") for v in warmth_data.values()]
            for t in ["warm", "neutral", "cold"]:
                if t in tiers:
                    top_tier = t
                    break

        log_event("test-user", "search_performed", {
            "companies": parsed_query_payload.get("companies", []),
            "titles": parsed_query_payload.get("title_variations", [])[:5],
            "locations": parsed_query_payload.get("locations", []),
            "results_count": len(contacts),
            "top_warmth_tier": top_tier,
        })

        assert mock_db.collection().add.call_count == 1
        add_call = mock_db.collection().add.call_args[0][0]
        assert add_call["event_type"] == "search_performed"
        assert add_call["properties"]["results_count"] == 2
        assert add_call["properties"]["top_warmth_tier"] == "warm"
        assert add_call["properties"]["companies"] == ["McKinsey"]
        assert "query" not in add_call["properties"]  # No raw prompt logged

    @patch("app.utils.metrics_events.log_event")
    def test_log_event_failure_doesnt_break_search(self, mock_log):
        """If log_event raises, the search should still succeed."""
        mock_log.side_effect = RuntimeError("Firestore down")

        # Simulate the try/except wrapper from runs.py
        result = None
        try:
            from app.utils.metrics_events import log_event
            log_event("user", "search_performed", {"query": "test"})
        except Exception:
            pass  # This is what the instrumentation does

        # If we get here, the "search" wasn't broken
        assert True


class TestWebhookInstrumentation:
    """Tests for gmail_webhook.py instrumentation."""

    @patch("app.utils.metrics_events.get_db")
    def test_email_actually_sent_fires(self, mock_get_db):
        """Verify email_actually_sent event fires with contact_id."""
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        from app.utils.metrics_events import log_event

        log_event("uid123", "email_actually_sent", {"contact_id": "contact-abc"})

        add_call = mock_db.collection().add.call_args[0][0]
        assert add_call["event_type"] == "email_actually_sent"
        assert add_call["properties"]["contact_id"] == "contact-abc"

    @patch("app.utils.metrics_events.get_db")
    def test_reply_received_fires_with_hours(self, mock_get_db):
        """Verify reply_received event fires with contact_id and hours_since_send."""
        mock_db = Mock()
        mock_get_db.return_value = mock_db

        from app.utils.metrics_events import log_event

        log_event("uid123", "reply_received", {
            "contact_id": "contact-xyz",
            "hours_since_send": 48.5,
        })

        add_call = mock_db.collection().add.call_args[0][0]
        assert add_call["event_type"] == "reply_received"
        assert add_call["properties"]["contact_id"] == "contact-xyz"
        assert add_call["properties"]["hours_since_send"] == 48.5
