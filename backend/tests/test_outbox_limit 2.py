"""
Tests for the outbox /threads?limit= query param.

Verifies that passing limit= calls get_recent_outbox_contacts (bounded)
and omitting it calls get_outbox_contacts (unbounded).
"""
import pytest
from unittest.mock import patch, MagicMock

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com"}
FAKE_THREADS = [
    {"id": "c1", "company": "Goldman Sachs", "pipelineStage": "email_sent"},
    {"id": "c2", "company": "McKinsey", "pipelineStage": "draft_created"},
]


@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield


@pytest.fixture()
def client():
    from backend.wsgi import create_app
    app = create_app()
    app.config["TESTING"] = True
    return app.test_client()


def test_limit_param_calls_bounded_query(client):
    with patch("backend.app.routes.outbox.get_recent_outbox_contacts", return_value=FAKE_THREADS) as mock_recent, \
         patch("backend.app.routes.outbox.get_outbox_contacts") as mock_unbounded:
        resp = client.get(
            "/api/outbox/threads?limit=50",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "threads" in data
        assert len(data["threads"]) == 2
        mock_recent.assert_called_once_with("test-user-id", limit=50)
        mock_unbounded.assert_not_called()


def test_no_limit_calls_unbounded_query(client):
    with patch("backend.app.routes.outbox.get_recent_outbox_contacts") as mock_recent, \
         patch("backend.app.routes.outbox.get_outbox_contacts", return_value=FAKE_THREADS) as mock_unbounded:
        resp = client.get(
            "/api/outbox/threads",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "threads" in data
        mock_recent.assert_not_called()
        mock_unbounded.assert_called_once_with("test-user-id", include_archived=False)


def test_invalid_limit_falls_through_to_unbounded(client):
    with patch("backend.app.routes.outbox.get_recent_outbox_contacts") as mock_recent, \
         patch("backend.app.routes.outbox.get_outbox_contacts", return_value=[]) as mock_unbounded:
        resp = client.get(
            "/api/outbox/threads?limit=abc",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert resp.status_code == 200
        mock_recent.assert_not_called()
        mock_unbounded.assert_called_once()


def test_limit_zero_falls_through_to_unbounded(client):
    with patch("backend.app.routes.outbox.get_recent_outbox_contacts") as mock_recent, \
         patch("backend.app.routes.outbox.get_outbox_contacts", return_value=[]) as mock_unbounded:
        resp = client.get(
            "/api/outbox/threads?limit=0",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert resp.status_code == 200
        mock_recent.assert_not_called()
        mock_unbounded.assert_called_once()


def test_huge_limit_capped_at_200(client):
    with patch("backend.app.routes.outbox.get_recent_outbox_contacts", return_value=[]) as mock_recent:
        resp = client.get(
            "/api/outbox/threads?limit=1000000",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert resp.status_code == 200
        mock_recent.assert_called_once_with("test-user-id", limit=200)
