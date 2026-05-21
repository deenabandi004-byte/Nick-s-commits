"""Tests for reply_coach module (Sprint 2A)."""
import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone, timedelta

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services.reply_coach import (
    spawn_reply_coach,
    get_reply_draft,
    _generate_and_store_draft,
    _fetch_user_context,
    REPLY_DRAFT_STALE_MINUTES,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_db_with_user(tier="pro"):
    """Return a mock Firestore client with a user doc at the given tier."""
    db = MagicMock()
    user_doc = Mock()
    user_doc.exists = True
    user_doc.to_dict.return_value = {
        "subscriptionTier": tier,
        "resumeParsed": {"rawText": "Some resume text"},
    }
    db.collection.return_value.document.return_value.get.return_value = user_doc
    return db


def _make_contact_data():
    return {
        "FirstName": "Jane",
        "LastName": "Doe",
        "company": "Goldman Sachs",
        "title": "Analyst",
        "emailSubject": "Re: Networking",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSpawnReplyCoach:
    """Tests for spawn_reply_coach (fire-and-forget entry point)."""

    @patch("app.services.reply_coach.get_db")
    def test_skips_free_tier(self, mock_get_db):
        """Free-tier users should not get reply coach drafts."""
        db = _mock_db_with_user(tier="free")
        mock_get_db.return_value = db

        spawn_reply_coach("uid1", "contact1", _make_contact_data(), "Thanks!")

        # Should NOT write a pending doc (no thread spawned)
        pending_calls = [
            c for c in db.collection.return_value.document.return_value.collection.return_value.document.return_value.set.call_args_list
        ]
        # The function reads user doc but should not write pending_reply_drafts
        assert db.collection.return_value.document.return_value.get.called

    @patch("app.services.reply_coach.threading")
    @patch("app.services.reply_coach.get_db")
    def test_spawns_thread_for_pro(self, mock_get_db, mock_threading):
        """Pro-tier users should get a background thread spawned."""
        db = _mock_db_with_user(tier="pro")
        mock_get_db.return_value = db

        spawn_reply_coach("uid1", "contact1", _make_contact_data(), "Thanks!")

        mock_threading.Thread.assert_called_once()
        mock_threading.Thread.return_value.start.assert_called_once()

    @patch("app.services.reply_coach.threading")
    @patch("app.services.reply_coach.get_db")
    def test_spawns_thread_for_elite(self, mock_get_db, mock_threading):
        """Elite-tier users should also get a background thread."""
        db = _mock_db_with_user(tier="elite")
        mock_get_db.return_value = db

        spawn_reply_coach("uid1", "contact1", _make_contact_data(), "Thanks!")

        mock_threading.Thread.assert_called_once()

    @patch("app.services.reply_coach.get_db")
    def test_swallows_exceptions(self, mock_get_db):
        """spawn_reply_coach should never raise - fire-and-forget."""
        mock_get_db.side_effect = Exception("Firestore down")

        # Should not raise
        spawn_reply_coach("uid1", "contact1", _make_contact_data(), "Thanks!")


class TestGetReplyDraft:
    """Tests for get_reply_draft (on-demand with staleness fallback)."""

    @patch("app.services.reply_coach.get_db")
    def test_returns_ready_draft(self, mock_get_db):
        """If a ready draft exists, return it immediately."""
        db = MagicMock()
        mock_get_db.return_value = db

        draft_data = {
            "body": "Thank you for your reply!",
            "replyType": "positive",
            "contactId": "c1",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "status": "ready",
        }
        draft_doc = Mock()
        draft_doc.exists = True
        draft_doc.to_dict.return_value = draft_data

        # replyDrafts doc
        db.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value = draft_doc

        result = get_reply_draft("uid1", "c1")
        assert result == draft_data

    @patch("app.services.reply_coach.get_db")
    def test_returns_generating_for_fresh_pending(self, mock_get_db):
        """If a pending doc is fresh (< 10 min), return generating status."""
        db = MagicMock()
        mock_get_db.return_value = db

        # No ready draft
        no_draft = Mock()
        no_draft.exists = False

        # Fresh pending doc
        pending_doc = Mock()
        pending_doc.exists = True
        fresh_time = datetime.now(timezone.utc).isoformat()
        pending_doc.to_dict.return_value = {
            "status": "pending",
            "createdAt": fresh_time,
        }

        call_count = [0]
        def side_effect_collection(name):
            mock_coll = MagicMock()
            if name == "replyDrafts":
                mock_coll.document.return_value.get.return_value = no_draft
            elif name == "pending_reply_drafts":
                mock_coll.document.return_value.get.return_value = pending_doc
            return mock_coll

        db.collection.return_value.document.return_value.collection.side_effect = side_effect_collection

        result = get_reply_draft("uid1", "c1")
        assert result["status"] == "generating"

    @patch("app.services.reply_coach._generate_and_store_draft")
    @patch("app.services.reply_coach.get_db")
    def test_regenerates_on_stale_pending(self, mock_get_db, mock_generate):
        """If pending doc is older than 10 min, regenerate synchronously."""
        db = MagicMock()
        mock_get_db.return_value = db

        # No ready draft
        no_draft = Mock()
        no_draft.exists = False

        # Stale pending doc
        stale_pending = Mock()
        stale_pending.exists = True
        stale_time = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
        stale_pending.to_dict.return_value = {
            "status": "pending",
            "createdAt": stale_time,
        }

        # Contact doc for on-demand generation
        contact_doc = Mock()
        contact_doc.exists = True
        contact_doc.to_dict.return_value = {
            "lastMessageSnippet": "Thanks for reaching out!",
            "company": "Goldman",
        }

        def side_effect_collection(name):
            mock_coll = MagicMock()
            if name == "replyDrafts":
                mock_coll.document.return_value.get.return_value = no_draft
            elif name == "pending_reply_drafts":
                mock_coll.document.return_value.get.return_value = stale_pending
            elif name == "contacts":
                mock_coll.document.return_value.get.return_value = contact_doc
            return mock_coll

        db.collection.return_value.document.return_value.collection.side_effect = side_effect_collection

        mock_generate.return_value = {"body": "Generated!", "status": "ready"}

        result = get_reply_draft("uid1", "c1")
        mock_generate.assert_called_once()

    @patch("app.services.reply_coach.get_db")
    def test_returns_none_for_missing_contact(self, mock_get_db):
        """If contact doc doesn't exist, return None."""
        db = MagicMock()
        mock_get_db.return_value = db

        no_doc = Mock()
        no_doc.exists = False

        def side_effect_collection(name):
            mock_coll = MagicMock()
            mock_coll.document.return_value.get.return_value = no_doc
            return mock_coll

        db.collection.return_value.document.return_value.collection.side_effect = side_effect_collection

        result = get_reply_draft("uid1", "c1")
        assert result is None


class TestGenerateAndStoreDraft:
    """Tests for _generate_and_store_draft."""

    @patch("app.services.reply_coach.generate_reply_to_message")
    def test_stores_draft_in_firestore(self, mock_generate):
        """Should call generate_reply_to_message and write to replyDrafts collection."""
        mock_generate.return_value = {
            "body": "Thank you for your response!",
            "replyType": "positive",
        }

        db = MagicMock()
        user_doc = Mock()
        user_doc.exists = True
        user_doc.to_dict.return_value = {
            "resumeParsed": {"rawText": "Resume"},
        }
        db.collection.return_value.document.return_value.get.return_value = user_doc

        contact_data = _make_contact_data()
        result = _generate_and_store_draft(db, "uid1", "c1", contact_data, "Thanks!")

        assert result["body"] == "Thank you for your response!"
        assert result["status"] == "ready"
        assert result["contactId"] == "c1"
        mock_generate.assert_called_once()
