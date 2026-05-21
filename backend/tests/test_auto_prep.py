"""Tests for auto-prep trigger in outbox_service (Sprint 2B)."""
import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services.outbox_service import _maybe_trigger_auto_prep, trigger_auto_prep


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_db_for_auto_prep(tier="pro", credits=300, has_linkedin=True, has_existing_prep=False):
    """Return a mock Firestore client configured for auto-prep tests."""
    db = MagicMock()

    # User doc
    user_doc = Mock()
    user_doc.exists = True
    user_doc.to_dict.return_value = {
        "subscriptionTier": tier,
        "credits": credits,
    }

    # Existing prep check
    prep_docs = []
    if has_existing_prep:
        prep_doc = Mock()
        prep_doc.id = "existing-prep-id"
        prep_docs = [prep_doc]

    prep_query = MagicMock()
    prep_query.limit.return_value.stream.return_value = prep_docs

    # Pending auto prep doc
    pending_doc = Mock()
    pending_doc.exists = False

    def collection_side_effect(name):
        mock_coll = MagicMock()
        if name == "users":
            user_doc_ref = MagicMock()
            user_doc_ref.get.return_value = user_doc

            def subcoll_side_effect(subcoll_name):
                subcoll = MagicMock()
                if subcoll_name == "coffee-chat-preps":
                    subcoll.where.return_value = prep_query
                elif subcoll_name == "pending_auto_preps":
                    subcoll.document.return_value.get.return_value = pending_doc
                    subcoll.document.return_value.set = Mock()
                return subcoll

            user_doc_ref.collection.side_effect = subcoll_side_effect
            mock_coll.document.return_value = user_doc_ref
        return mock_coll

    db.collection.side_effect = collection_side_effect
    return db


def _make_contact_data(linkedin_url="https://linkedin.com/in/janedoe"):
    return {
        "FirstName": "Jane",
        "LastName": "Doe",
        "company": "McKinsey",
        "title": "Consultant",
        "linkedinUrl": linkedin_url,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestMaybeTriggerAutoPrep:
    """Tests for _maybe_trigger_auto_prep (fire-and-forget from stage change)."""

    @patch("app.services.outbox_service.get_db")
    def test_skips_free_tier(self, mock_get_db):
        """Free-tier users should not trigger auto-prep."""
        db = _mock_db_for_auto_prep(tier="free")
        mock_get_db.return_value = db

        # Should not raise, should silently skip
        _maybe_trigger_auto_prep("uid1", "c1", _make_contact_data())

    @patch("app.services.outbox_service.get_db")
    def test_skips_without_linkedin(self, mock_get_db):
        """Contacts without LinkedIn URL should not trigger auto-prep."""
        db = _mock_db_for_auto_prep(tier="pro")
        mock_get_db.return_value = db

        contact = _make_contact_data(linkedin_url="")
        _maybe_trigger_auto_prep("uid1", "c1", contact)

    @patch("app.services.outbox_service.get_db")
    def test_skips_if_existing_prep(self, mock_get_db):
        """Should not trigger if a meeting prep already exists for this contact."""
        db = _mock_db_for_auto_prep(tier="pro", has_existing_prep=True)
        mock_get_db.return_value = db

        _maybe_trigger_auto_prep("uid1", "c1", _make_contact_data())

    @patch("app.services.auth.deduct_credits_atomic", return_value=(True, 285))
    @patch("app.services.outbox_service.get_db")
    def test_spawns_thread_for_pro_with_credits(self, mock_get_db, mock_deduct):
        """Pro user with credits and LinkedIn should spawn background thread."""
        db = _mock_db_for_auto_prep(tier="pro", credits=300)
        mock_get_db.return_value = db

        with patch("threading.Thread") as mock_thread:
            _maybe_trigger_auto_prep("uid1", "c1", _make_contact_data())
            mock_deduct.assert_called_once()

    @patch("app.services.auth.deduct_credits_atomic", return_value=(False, 5))
    @patch("app.services.outbox_service.get_db")
    def test_skips_if_insufficient_credits(self, mock_get_db, mock_deduct):
        """Should not spawn thread if credit deduction fails."""
        db = _mock_db_for_auto_prep(tier="pro", credits=5)
        mock_get_db.return_value = db

        _maybe_trigger_auto_prep("uid1", "c1", _make_contact_data())


class TestTriggerAutoPrep:
    """Tests for trigger_auto_prep (on-demand from GET endpoint)."""

    @patch("app.services.outbox_service.get_db")
    def test_returns_not_available_for_free(self, mock_get_db):
        """Free-tier should get not_available status."""
        db = _mock_db_for_auto_prep(tier="free")
        mock_get_db.return_value = db

        result = trigger_auto_prep("uid1", "c1", _make_contact_data())
        assert result["status"] == "tier_required"
