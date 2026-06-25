"""
Tests for the contact/company/hiring-manager sharing endpoint.

Covers:
  POST /api/shares  — create a share between two users

Test 1 (RED → GREEN): unknown recipient returns 404
Test 2 (GREEN):        known recipient returns 201 with shareId + toName
"""
import json
import pytest
from unittest.mock import MagicMock, patch


FAKE_USER = {"uid": "test-user-id", "email": "test@example.com", "name": "Test User"}


def _auth_headers():
    return {"Authorization": "Bearer test-token"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    """Bypass Firebase token verification at the firebase_admin layer."""
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


@pytest.fixture()
def db():
    """Provide a fresh MagicMock Firestore client patched into shares route."""
    mock_db = MagicMock()
    with patch("backend.app.routes.shares.get_db", return_value=mock_db):
        yield mock_db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_create_share_unknown_recipient_returns_404(client, db):
    # Sender profile lookup (document().get())
    me_doc = MagicMock()
    me_doc.exists = True
    me_doc.to_dict.return_value = {"email": "test@example.com", "name": "Test User"}
    db.collection.return_value.document.return_value.get.return_value = me_doc

    # No user matches the recipient email -> query returns empty
    db.collection.return_value.where.return_value.limit.return_value.stream.return_value = iter([])

    resp = client.post(
        "/api/shares",
        data=json.dumps({
            "toEmail": "nobody@example.com",
            "kind": "contacts",
            "items": [{"name": "A", "email": "a@x.com"}],
        }),
        content_type="application/json",
        headers=_auth_headers(),
    )

    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Not an Offerloop account."


def test_create_share_success_writes_pending_doc(client, db):
    # Sender profile lookup
    me_doc = MagicMock()
    me_doc.exists = True
    me_doc.to_dict.return_value = {"email": "test@example.com", "name": "Test User"}
    db.collection.return_value.document.return_value.get.return_value = me_doc

    # Recipient lookup returns one user
    recip = MagicMock()
    recip.id = "recip-uid"
    recip.to_dict.return_value = {"email": "friend@x.com", "name": "Friend"}
    db.collection.return_value.where.return_value.limit.return_value.stream.return_value = iter([recip])

    # add() returns (timestamp, ref) where ref.id is the new share id
    fake_ref = MagicMock()
    fake_ref.id = "share-123"
    db.collection.return_value.add.return_value = (None, fake_ref)

    resp = client.post(
        "/api/shares",
        data=json.dumps({
            "toEmail": "friend@x.com",
            "kind": "contacts",
            "items": [{"name": "A", "email": "a@x.com"}],
        }),
        content_type="application/json",
        headers=_auth_headers(),
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["shareId"] == "share-123"
    assert body["toName"] == "Friend"

    # Assert the route actually wrote the pending-share doc to Firestore
    db.collection.return_value.add.assert_called_once()
    written_payload = db.collection.return_value.add.call_args[0][0]
    assert written_payload["status"] == "pending"
    assert written_payload["kind"] == "contacts"


def test_list_pending_returns_only_my_pending(client, db):
    share_doc = type("Doc", (), {
        "id": "s1",
        "to_dict": lambda self: {"fromName": "Pat", "kind": "contacts",
                                  "items": [{}, {}, {}], "status": "pending",
                                  "createdAt": "2026-06-18T00:00:00Z"},
    })()
    (db.collection.return_value.where.return_value
        .where.return_value.stream.return_value) = iter([share_doc])

    resp = client.get("/api/shares/pending", headers=_auth_headers())
    assert resp.status_code == 200
    shares = resp.get_json()["shares"]
    assert len(shares) == 1
    assert shares[0]["count"] == 3
    assert shares[0]["fromName"] == "Pat"
    assert shares[0]["id"] == "s1"
    assert "createdAt" in shares[0]

    # Assert the route applied both Firestore filters (toUid and status==pending).
    # The route chains: collection("pendingShares").where("toUid", ...).where("status", "==", "pending")
    # so toUid appears in the first .where() call_args and pending in the second .where() call_args.
    first_where_calls = db.collection.return_value.where.call_args_list
    assert any("toUid" in str(c) for c in first_where_calls), "Route must filter by toUid"
    second_where_calls = db.collection.return_value.where.return_value.where.call_args_list
    assert any("pending" in str(c) for c in second_where_calls), "Route must filter by status=pending"


def test_decline_marks_status(client, db):
    share = type("Doc", (), {
        "exists": True,
        "id": "s1",
        "to_dict": lambda self: {"toUid": "test-user-id", "status": "pending",
                                  "kind": "contacts", "items": []},
    })()
    db.collection.return_value.document.return_value.get.return_value = share

    resp = client.post("/api/shares/s1/decline", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.get_json()["ok"] is True

    # Assert the ref was mutated with status == "declined"
    ref = db.collection.return_value.document.return_value
    ref.set.assert_called_once()
    call_payload = ref.set.call_args[0][0]
    assert call_payload["status"] == "declined"


def test_accept_share_imports_contacts(client, db):
    """Happy path: pending share owned by caller, kind=contacts, 1 item → 200."""
    share = type("Doc", (), {
        "exists": True,
        "id": "s1",
        "to_dict": lambda self: {
            "toUid": "test-user-id",
            "status": "pending",
            "kind": "contacts",
            "items": [{"name": "Alice", "email": "alice@x.com"}],
        },
    })()

    # require_tier (inner decorator after @require_firebase_auth) fetches the user doc
    # from Firestore via extensions.get_db() to verify the subscription tier.
    # Wire the mock so collection("users").document(uid).get() returns a pro-tier doc,
    # and the share document lookup also resolves correctly via the same mock chain.
    user_doc = MagicMock()
    user_doc.exists = True
    user_doc.to_dict.return_value = {"subscriptionTier": "pro"}

    call_counter = {"n": 0}

    def _get_side_effect():
        call_counter["n"] += 1
        # First call: require_tier fetching the user document
        if call_counter["n"] == 1:
            return user_doc
        # Subsequent calls: _load_owned_pending fetching the share document
        return share

    db.collection.return_value.document.return_value.get.side_effect = _get_side_effect

    # Stub db.batch() to return a controllable mock
    mock_batch = MagicMock()
    db.batch.return_value = mock_batch

    # require_tier's get_db lookup resolves through backend.app.extensions
    # (shares.py uses relative imports → backend.app.extensions).
    # Patch that namespace so require_tier sees the mock db.
    with patch("backend.app.extensions.get_db", return_value=db):
        resp = client.post("/api/shares/s1/accept", headers=_auth_headers())

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["imported"] == 1
    assert body["kind"] == "contacts"

    # Assert the batch was committed exactly once
    mock_batch.commit.assert_called_once()
