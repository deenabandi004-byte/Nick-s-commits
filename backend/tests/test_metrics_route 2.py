"""
Tests for the metrics event ingestion route.

POST /api/metrics/events
"""
import pytest
from unittest.mock import patch, MagicMock

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com"}


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


def test_valid_event_returns_202(client):
    with patch("backend.app.routes.metrics.log_event") as mock_log:
        resp = client.post(
            "/api/metrics/events",
            json={"event_type": "suggestion_shown", "properties": {"card_id": "abc"}},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert resp.status_code == 202
        mock_log.assert_called_once_with("test-user-id", "suggestion_shown", {"card_id": "abc"})


def test_invalid_event_returns_400(client):
    resp = client.post(
        "/api/metrics/events",
        json={"event_type": "not_a_real_event"},
        headers={"Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "invalid event_type"


def test_missing_auth_returns_401(client):
    resp = client.post(
        "/api/metrics/events",
        json={"event_type": "suggestion_shown"},
    )
    assert resp.status_code == 401
