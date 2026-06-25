"""Tests for the email suppression service."""
from unittest.mock import MagicMock, patch

from app.services import suppression


def _make_db():
    """Build a Firestore mock with chainable collection/document calls."""
    db = MagicMock()

    user_doc = MagicMock()
    user_doc.exists = False
    user_collection_chain = (
        db.collection.return_value.document.return_value
        .collection.return_value.document.return_value
    )
    user_collection_chain.get.return_value = user_doc
    user_collection_chain.set = MagicMock()

    global_doc = MagicMock()
    global_doc.exists = False
    global_chain = db.collection.return_value.document.return_value
    # Note: collection(...).document(...) is shared between user + global paths
    # in this mock; we set separate behaviors per call below using side_effect
    # where needed. For the simple cases here the shared chain is fine.
    global_chain.get.return_value = global_doc
    global_chain.set = MagicMock()

    return db, user_collection_chain, global_chain, user_doc, global_doc


class TestRecordBounce:
    def test_writes_per_user_and_global(self):
        db = MagicMock()
        with patch.object(suppression, "get_db", return_value=db):
            suppression.record_bounce("uid-1", "bad@example.com", contact_id="c-1", reason="dsn")

        # Each .collection(...) call returns the same MagicMock chain, so we
        # check that BOTH a user path and a global path were written via .set
        # — easiest is to count total .set calls on documents.
        set_calls = []
        for call in db.mock_calls:
            if call[0].endswith(".set"):
                set_calls.append(call)
        assert len(set_calls) >= 2, f"expected >=2 set() calls, got {set_calls}"

    def test_skips_empty_email(self):
        db = MagicMock()
        with patch.object(suppression, "get_db", return_value=db):
            suppression.record_bounce("uid-1", "")
            suppression.record_bounce("uid-1", None)
        # No Firestore writes should have been attempted
        assert not any(c[0].endswith(".set") for c in db.mock_calls)

    def test_swallows_exceptions(self):
        db = MagicMock()
        db.collection.side_effect = RuntimeError("firestore down")
        with patch.object(suppression, "get_db", return_value=db):
            # Should NOT raise
            suppression.record_bounce("uid-1", "bad@example.com")

    def test_no_db_no_op(self):
        with patch.object(suppression, "get_db", return_value=None):
            suppression.record_bounce("uid-1", "bad@example.com")  # no raise


class TestIsSuppressed:
    def test_returns_true_when_per_user_doc_exists(self):
        db = MagicMock()
        user_doc = MagicMock()
        user_doc.exists = True
        # users/{uid}/suppression/{email}
        (
            db.collection.return_value.document.return_value
            .collection.return_value.document.return_value
            .get.return_value
        ) = user_doc
        with patch.object(suppression, "get_db", return_value=db):
            assert suppression.is_suppressed("uid-1", "bad@example.com") is True

    def test_returns_true_when_global_doc_exists(self):
        # Per-user lookup misses, global lookup hits. Dispatch by collection name.
        user_miss = MagicMock(); user_miss.exists = False
        global_hit = MagicMock(); global_hit.exists = True

        db = MagicMock()

        def collection_side_effect(name):
            coll = MagicMock()
            if name == "users":
                # users/{uid}/suppression/{email}.get() → missing
                (
                    coll.document.return_value
                    .collection.return_value.document.return_value.get.return_value
                ) = user_miss
            elif name == "global_suppression":
                coll.document.return_value.get.return_value = global_hit
            return coll

        db.collection.side_effect = collection_side_effect

        with patch.object(suppression, "get_db", return_value=db):
            assert suppression.is_suppressed("uid-1", "bad@example.com") is True

    def test_returns_false_when_neither_exists(self):
        db = MagicMock()
        missing = MagicMock()
        missing.exists = False
        (
            db.collection.return_value.document.return_value
            .collection.return_value.document.return_value
            .get.return_value
        ) = missing
        db.collection.return_value.document.return_value.get.return_value = missing
        with patch.object(suppression, "get_db", return_value=db):
            assert suppression.is_suppressed("uid-1", "bad@example.com") is False

    def test_returns_false_on_empty_email(self):
        with patch.object(suppression, "get_db", return_value=MagicMock()):
            assert suppression.is_suppressed("uid-1", "") is False
            assert suppression.is_suppressed("uid-1", None) is False

    def test_returns_false_on_exception(self):
        db = MagicMock()
        db.collection.side_effect = RuntimeError("firestore down")
        with patch.object(suppression, "get_db", return_value=db):
            assert suppression.is_suppressed("uid-1", "bad@example.com") is False
