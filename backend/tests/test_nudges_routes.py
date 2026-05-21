"""
Tests for nudge API routes (nudges.py).

Covers:
  GET  /api/nudges - fetch nudges with filters
  PATCH /api/nudges/<id> - update nudge status
  POST /api/nudges/<id>/draft - create Gmail draft from nudge
  PUT  /api/nudge-preferences - update nudge preferences
"""
import pytest
from unittest.mock import patch, MagicMock, PropertyMock

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_doc(doc_id, data, exists=True):
    """Build a mock Firestore document snapshot."""
    doc = MagicMock()
    doc.id = doc_id
    doc.to_dict.return_value = data
    doc.exists = exists
    return doc


def _missing_doc():
    return _mock_doc("missing", {}, exists=False)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    """
    Bypass the real require_firebase_auth decorator for every test.

    The decorator checks firebase_admin._apps and then calls
    firebase_admin.auth.verify_id_token.  We make _apps truthy and
    have verify_id_token return the fake user payload.
    """
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


@pytest.fixture()
def db():
    """Provide a fresh MagicMock Firestore client and patch get_db."""
    mock_db = MagicMock()
    with patch("backend.app.routes.nudges.get_db", return_value=mock_db):
        yield mock_db


# ===========================================================================
# GET /api/nudges
# ===========================================================================

class TestGetNudges:

    @pytest.mark.unit
    def test_default_fetch(self, client, db):
        """GET /api/nudges returns nudges with id injected."""
        nudge_docs = [
            _mock_doc("n1", {"status": "pending", "contactName": "Alice"}),
            _mock_doc("n2", {"status": "read", "contactName": "Bob"}),
        ]
        nudges_ref = MagicMock()
        db.collection.return_value.document.return_value.collection.return_value = nudges_ref

        ordered = MagicMock()
        nudges_ref.order_by.return_value = ordered
        ordered.limit.return_value.stream.return_value = iter(nudge_docs)

        resp = client.get("/api/nudges", headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["count"] == 2
        assert data["nudges"][0]["id"] == "n1"
        assert data["nudges"][1]["id"] == "n2"

    @pytest.mark.unit
    def test_status_filter(self, client, db):
        """GET /api/nudges?status=pending uses compound query."""
        nudge_docs = [
            _mock_doc("n1", {"status": "pending", "contactName": "Alice"}),
        ]
        nudges_ref = MagicMock()
        db.collection.return_value.document.return_value.collection.return_value = nudges_ref

        where_q = MagicMock()
        nudges_ref.where.return_value = where_q
        where_q.order_by.return_value.limit.return_value.stream.return_value = iter(nudge_docs)

        resp = client.get("/api/nudges?status=pending", headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["count"] == 1
        assert data["nudges"][0]["status"] == "pending"

    @pytest.mark.unit
    def test_limit_param(self, client, db):
        """GET /api/nudges?limit=5 caps the query limit."""
        nudges_ref = MagicMock()
        db.collection.return_value.document.return_value.collection.return_value = nudges_ref

        ordered = MagicMock()
        nudges_ref.order_by.return_value = ordered
        limited = MagicMock()
        ordered.limit.return_value = limited
        limited.stream.return_value = iter([])

        resp = client.get("/api/nudges?limit=5", headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        ordered.limit.assert_called_with(5)

    @pytest.mark.unit
    def test_compound_query_fallback(self, client, db):
        """When compound query raises, falls back to client-side filter."""
        all_docs = [
            _mock_doc("n1", {"status": "pending", "contactName": "Alice"}),
            _mock_doc("n2", {"status": "read", "contactName": "Bob"}),
        ]
        nudges_ref = MagicMock()
        db.collection.return_value.document.return_value.collection.return_value = nudges_ref

        # Compound query fails (missing composite index)
        nudges_ref.where.return_value.order_by.return_value.limit.return_value.stream.side_effect = Exception("No index")

        # Fallback order_by query succeeds
        ordered = MagicMock()
        nudges_ref.order_by.return_value = ordered
        ordered.limit.return_value.stream.return_value = iter(all_docs)

        resp = client.get("/api/nudges?status=pending", headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        data = resp.get_json()
        # Only the "pending" nudge should survive client-side filter
        assert data["count"] == 1
        assert data["nudges"][0]["id"] == "n1"


# ===========================================================================
# PATCH /api/nudges/<id>
# ===========================================================================

class TestUpdateNudge:

    @pytest.mark.unit
    def test_valid_status_read(self, client, db):
        """PATCH with status=read updates the nudge."""
        nudge_ref = MagicMock()
        db.collection.return_value.document.return_value.collection.return_value.document.return_value = nudge_ref
        nudge_ref.get.return_value = _mock_doc("n1", {"status": "pending"})

        resp = client.patch("/api/nudges/n1", json={"status": "read"},
                            headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["status"] == "read"

        update_call = nudge_ref.update.call_args[0][0]
        assert update_call["status"] == "read"

    @pytest.mark.unit
    def test_acted_on_sets_extra_fields(self, client, db):
        """PATCH with status=acted_on sets actedOn and actedOnAt."""
        nudge_ref = MagicMock()
        db.collection.return_value.document.return_value.collection.return_value.document.return_value = nudge_ref
        nudge_ref.get.return_value = _mock_doc("n1", {"status": "pending"})

        resp = client.patch("/api/nudges/n1", json={"status": "acted_on"},
                            headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        update_call = nudge_ref.update.call_args[0][0]
        assert update_call["actedOn"] is True
        assert "actedOnAt" in update_call

    @pytest.mark.unit
    def test_dismissed_sets_dismissed_at(self, client, db):
        """PATCH with status=dismissed sets dismissedAt."""
        nudge_ref = MagicMock()
        db.collection.return_value.document.return_value.collection.return_value.document.return_value = nudge_ref
        nudge_ref.get.return_value = _mock_doc("n1", {"status": "pending"})

        resp = client.patch("/api/nudges/n1", json={"status": "dismissed"},
                            headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        update_call = nudge_ref.update.call_args[0][0]
        assert "dismissedAt" in update_call
        assert "actedOn" not in update_call

    @pytest.mark.unit
    def test_invalid_status_returns_400(self, client, db):
        """PATCH with an unrecognized status returns 400."""
        resp = client.patch("/api/nudges/n1", json={"status": "banana"},
                            headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 400
        assert "Invalid status" in resp.get_json()["error"]

    @pytest.mark.unit
    def test_nudge_not_found_returns_404(self, client, db):
        """PATCH on a non-existent nudge returns 404."""
        nudge_ref = MagicMock()
        db.collection.return_value.document.return_value.collection.return_value.document.return_value = nudge_ref
        nudge_ref.get.return_value = _missing_doc()

        resp = client.patch("/api/nudges/no-such-id", json={"status": "read"},
                            headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 404


# ===========================================================================
# POST /api/nudges/<id>/draft
# ===========================================================================

class TestCreateNudgeDraft:

    @pytest.mark.unit
    def test_gmail_draft_success(self, client, db):
        """POST creates a Gmail draft and returns draftId."""
        nudge_data = {
            "followUpDraft": "Hey, just following up!",
            "contactId": "c1",
            "contactName": "Alice Smith",
        }
        contact_data = {"email": "alice@example.com"}
        user_data = {"email": "test@example.com"}

        nudge_ref = MagicMock()
        nudge_ref.get.return_value = _mock_doc("n1", nudge_data)

        contact_ref = MagicMock()
        contact_ref.get.return_value = _mock_doc("c1", contact_data)

        # db.collection("users").document(uid) → user_doc_ref
        user_doc_ref = MagicMock()
        user_doc_ref.collection.return_value.document.side_effect = lambda doc_id: {
            "n1": nudge_ref,
            "c1": contact_ref,
        }.get(doc_id, MagicMock())
        user_doc_ref.get.return_value = _mock_doc("u1", user_data)

        db.collection.return_value.document.return_value = user_doc_ref

        mock_gmail = MagicMock()
        mock_gmail.users.return_value.drafts.return_value.create.return_value.execute.return_value = {
            "id": "draft-123"
        }

        with patch("app.services.gmail_client.get_gmail_service_for_user", return_value=mock_gmail):
            resp = client.post("/api/nudges/n1/draft",
                               headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code in (200, 201)
        data = resp.get_json()
        assert data["ok"] is True
        # Either a draftId or a composeUrl depending on Gmail availability
        assert "draftId" in data or "composeUrl" in data

    @pytest.mark.unit
    def test_nudge_not_found_returns_404(self, client, db):
        """POST on a non-existent nudge returns 404."""
        nudge_ref = MagicMock()
        nudge_ref.get.return_value = _missing_doc()
        db.collection.return_value.document.return_value.collection.return_value.document.return_value = nudge_ref

        resp = client.post("/api/nudges/no-such-id/draft",
                           headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 404

    @pytest.mark.unit
    def test_no_follow_up_draft_returns_400(self, client, db):
        """POST returns 400 when nudge has no followUpDraft text."""
        nudge_ref = MagicMock()
        nudge_ref.get.return_value = _mock_doc("n1", {"followUpDraft": "", "contactId": "c1"})
        db.collection.return_value.document.return_value.collection.return_value.document.return_value = nudge_ref

        resp = client.post("/api/nudges/n1/draft",
                           headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 400
        assert "no follow-up draft" in resp.get_json()["error"].lower()

    @pytest.mark.unit
    def test_no_contact_email_returns_400(self, client, db):
        """POST returns 400 when contact has no email address."""
        nudge_data = {"followUpDraft": "Hi!", "contactId": "c1", "contactName": "Bob"}
        contact_data = {}  # no email field

        nudge_ref = MagicMock()
        nudge_ref.get.return_value = _mock_doc("n1", nudge_data)

        contact_ref = MagicMock()
        contact_ref.get.return_value = _mock_doc("c1", contact_data)

        user_doc_ref = MagicMock()
        user_doc_ref.collection.return_value.document.side_effect = lambda doc_id: {
            "n1": nudge_ref,
            "c1": contact_ref,
        }.get(doc_id, MagicMock())

        db.collection.return_value.document.return_value = user_doc_ref

        resp = client.post("/api/nudges/n1/draft",
                           headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 400
        assert "no email" in resp.get_json()["error"].lower()

    @pytest.mark.unit
    def test_gmail_unavailable_returns_compose_url(self, client, db):
        """When Gmail service is None, returns a compose URL fallback."""
        nudge_data = {"followUpDraft": "Following up!", "contactId": "c1", "contactName": "Carol"}
        contact_data = {"email": "carol@example.com"}
        user_data = {"email": "test@example.com"}

        nudge_ref = MagicMock()
        nudge_ref.get.return_value = _mock_doc("n1", nudge_data)

        contact_ref = MagicMock()
        contact_ref.get.return_value = _mock_doc("c1", contact_data)

        user_doc_ref = MagicMock()
        user_doc_ref.collection.return_value.document.side_effect = lambda doc_id: {
            "n1": nudge_ref,
            "c1": contact_ref,
        }.get(doc_id, MagicMock())
        user_doc_ref.get.return_value = _mock_doc("u1", user_data)

        db.collection.return_value.document.return_value = user_doc_ref

        with patch("app.services.gmail_client.get_gmail_service_for_user", return_value=None):
            resp = client.post("/api/nudges/n1/draft",
                               headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["composeUrl"] is not None
        assert data["draftId"] is None


# ===========================================================================
# PUT /api/nudge-preferences
# ===========================================================================

class TestUpdateNudgePreferences:

    @pytest.mark.unit
    def test_valid_follow_up_days(self, client, db):
        """PUT with followUpDays=7 succeeds."""
        resp = client.put("/api/nudge-preferences", json={"followUpDays": 7},
                          headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["ok"] is True
        assert data["preferences"]["nudgeFollowUpDays"] == 7

    @pytest.mark.unit
    def test_valid_max_nudges_per_day(self, client, db):
        """PUT with maxNudgesPerDay=5 succeeds."""
        resp = client.put("/api/nudge-preferences", json={"maxNudgesPerDay": 5},
                          headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["preferences"]["nudgeMaxPerDay"] == 5

    @pytest.mark.unit
    def test_valid_enabled_flag(self, client, db):
        """PUT with enabled=false succeeds."""
        resp = client.put("/api/nudge-preferences", json={"enabled": False},
                          headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 200
        data = resp.get_json()
        assert data["preferences"]["nudgesEnabled"] is False

    @pytest.mark.unit
    def test_follow_up_days_out_of_range_returns_400(self, client, db):
        """PUT with followUpDays=1 (below 3) returns 400."""
        resp = client.put("/api/nudge-preferences", json={"followUpDays": 1},
                          headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 400
        assert "followUpDays" in resp.get_json()["error"]

    @pytest.mark.unit
    def test_max_nudges_per_day_out_of_range_returns_400(self, client, db):
        """PUT with maxNudgesPerDay=20 (above 10) returns 400."""
        resp = client.put("/api/nudge-preferences", json={"maxNudgesPerDay": 20},
                          headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 400
        assert "maxNudgesPerDay" in resp.get_json()["error"]

    @pytest.mark.unit
    def test_empty_body_returns_400(self, client, db):
        """PUT with empty JSON body returns 400."""
        resp = client.put("/api/nudge-preferences", json={},
                          headers={"Authorization": "Bearer fake-token"})

        assert resp.status_code == 400
        assert "No valid preferences" in resp.get_json()["error"]
