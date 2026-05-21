"""Tests for _persist_warmth_on_send in emails.py."""
import os
import pytest
from unittest.mock import MagicMock, patch, call

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.routes.emails import _persist_warmth_on_send


def _mock_db_with_contact(uid, email, existing_data=None):
    """Build a mock Firestore db that has one contact doc matching email."""
    db = MagicMock()
    contact_ref = MagicMock()
    contact_doc = MagicMock()
    contact_doc.reference = contact_ref

    contacts_col = MagicMock()
    query = MagicMock()
    query.limit.return_value = query

    if existing_data is not None:
        query.stream.return_value = iter([contact_doc])
    else:
        query.stream.return_value = iter([])

    contacts_col.where.return_value = query

    def user_doc(u):
        doc_ref = MagicMock()
        def subcol(name):
            if name == "contacts":
                return contacts_col
            return MagicMock()
        doc_ref.collection.side_effect = subcol
        return doc_ref

    users_col = MagicMock()
    users_col.document.side_effect = user_doc

    def collection(name):
        if name == "users":
            return users_col
        return MagicMock()

    db.collection.side_effect = collection
    return db, contact_ref


class TestPersistWarmthOnSend:

    def test_writes_warmth_and_seniority(self):
        db, ref = _mock_db_with_contact("uid1", "test@example.com", {})
        warmth_info = {"tier": "warm", "score": 62}

        _persist_warmth_on_send(db, "uid1", "test@example.com", warmth_info, "VP of Sales")

        ref.update.assert_called_once()
        written = ref.update.call_args[0][0]
        assert written["warmthTier"] == "warm"
        assert written["warmthScore"] == 62
        assert written["seniorityBucket"] == "vp"

    def test_seniority_only_when_no_warmth_info(self):
        db, ref = _mock_db_with_contact("uid1", "test@example.com", {})

        _persist_warmth_on_send(db, "uid1", "test@example.com", None, "Analyst")

        ref.update.assert_called_once()
        written = ref.update.call_args[0][0]
        assert "warmthTier" not in written
        assert written["seniorityBucket"] == "analyst"

    def test_no_contact_found_does_nothing(self):
        db, ref = _mock_db_with_contact("uid1", "nobody@example.com", None)

        _persist_warmth_on_send(db, "uid1", "nobody@example.com", {"tier": "cold", "score": 10}, "Intern")

        ref.update.assert_not_called()

    def test_empty_email_does_nothing(self):
        db = MagicMock()

        _persist_warmth_on_send(db, "uid1", "", {"tier": "warm", "score": 50}, "Analyst")

        # Should not even try to query
        db.collection.assert_not_called()

    def test_none_email_does_nothing(self):
        db = MagicMock()

        _persist_warmth_on_send(db, "uid1", None, {"tier": "warm", "score": 50}, "Analyst")

        db.collection.assert_not_called()

    def test_firestore_error_does_not_raise(self):
        """_persist_warmth_on_send must never raise - it swallows exceptions."""
        db, ref = _mock_db_with_contact("uid1", "test@example.com", {})
        ref.update.side_effect = Exception("Firestore down")

        # Should not raise
        _persist_warmth_on_send(db, "uid1", "test@example.com", {"tier": "warm", "score": 50}, "Analyst")

    def test_seniority_classification_for_director(self):
        db, ref = _mock_db_with_contact("uid1", "test@example.com", {})

        _persist_warmth_on_send(db, "uid1", "test@example.com", {"tier": "neutral", "score": 30}, "Director of Engineering")

        written = ref.update.call_args[0][0]
        assert written["seniorityBucket"] == "director"

    def test_email_normalized_to_lowercase(self):
        db, ref = _mock_db_with_contact("uid1", "Test@Example.COM", {})

        _persist_warmth_on_send(db, "uid1", "Test@Example.COM", {"tier": "cold", "score": 5}, "Manager")

        # Verify the where clause was called with lowercased email
        users_col = db.collection("users")
        doc_ref = users_col.document("uid1")
        contacts_col = doc_ref.collection("contacts")
        contacts_col.where.assert_called_once_with("email", "==", "test@example.com")
