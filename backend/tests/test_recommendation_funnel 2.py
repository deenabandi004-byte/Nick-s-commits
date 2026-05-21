"""
Tests for GET /api/admin/recommendation-funnel.

Covers the auth gate, date validation, and aggregation shape.
"""
import os
import pytest
from unittest.mock import patch, MagicMock


FAKE_ADMIN = {"uid": "admin-uid"}
FAKE_NON_ADMIN = {"uid": "regular-uid"}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("ADMIN_UIDS", "admin-uid")
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}):
        from backend.wsgi import create_app
        app = create_app()
        app.config["TESTING"] = True
        yield app.test_client()


def test_missing_auth_returns_401(client):
    resp = client.get("/api/admin/recommendation-funnel")
    assert resp.status_code == 401


def test_non_admin_returns_403(client):
    with patch("firebase_admin.auth.verify_id_token", return_value=FAKE_NON_ADMIN):
        resp = client.get(
            "/api/admin/recommendation-funnel",
            headers={"Authorization": "Bearer fake-token"},
        )
    assert resp.status_code == 403


def test_admin_uids_not_configured_returns_500(client, monkeypatch):
    monkeypatch.setenv("ADMIN_UIDS", "")
    resp = client.get(
        "/api/admin/recommendation-funnel",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 500


def test_invalid_date_returns_400(client):
    with patch("firebase_admin.auth.verify_id_token", return_value=FAKE_ADMIN), \
         patch("backend.app.routes.recommendation_funnel.get_db", return_value=MagicMock()):
        resp = client.get(
            "/api/admin/recommendation-funnel?from=not-a-date",
            headers={"Authorization": "Bearer fake-token"},
        )
    assert resp.status_code == 400


def test_from_after_to_returns_400(client):
    with patch("firebase_admin.auth.verify_id_token", return_value=FAKE_ADMIN), \
         patch("backend.app.routes.recommendation_funnel.get_db", return_value=MagicMock()):
        resp = client.get(
            "/api/admin/recommendation-funnel?from=2026-05-10&to=2026-05-01",
            headers={"Authorization": "Bearer fake-token"},
        )
    assert resp.status_code == 400


def test_range_too_long_returns_400(client):
    with patch("firebase_admin.auth.verify_id_token", return_value=FAKE_ADMIN), \
         patch("backend.app.routes.recommendation_funnel.get_db", return_value=MagicMock()):
        resp = client.get(
            "/api/admin/recommendation-funnel?from=2026-01-01&to=2026-05-01",
            headers={"Authorization": "Bearer fake-token"},
        )
    assert resp.status_code == 400


def _stream_returning(events):
    """Helper: build a mock query whose stream() yields the given event dicts."""
    def _make_doc(d):
        doc = MagicMock()
        doc.to_dict.return_value = d
        return doc
    mock_query = MagicMock()
    mock_query.where.return_value = mock_query
    mock_query.stream.return_value = iter([_make_doc(e) for e in events])
    mock_db = MagicMock()
    mock_db.collection.return_value = mock_query
    return mock_db


def test_aggregates_funnel_counts_and_rates(client):
    events = [
        # Two warm impressions, one converts to send + reply
        {"event_type": "recommendation_shown", "surface": "find_search",
         "features_snapshot": {"warmth_tier": "warm"}, "model_version": "heuristic_v0"},
        {"event_type": "recommendation_shown", "surface": "find_search",
         "features_snapshot": {"warmth_tier": "warm"}, "model_version": "heuristic_v0"},
        {"event_type": "email_drafted", "surface": "find_search",
         "features_snapshot": {"warmth_tier": "warm"}, "model_version": "heuristic_v0"},
        {"event_type": "email_sent", "surface": "find_search",
         "features_snapshot": {"warmth_tier": "warm"}, "model_version": "heuristic_v0"},
        {"event_type": "email_replied", "surface": "gmail_webhook",
         "features_snapshot": {"warmth_tier": "warm"}, "model_version": "heuristic_v0"},
        # A cold impression that goes nowhere
        {"event_type": "recommendation_shown", "surface": "find_search",
         "features_snapshot": {"warmth_tier": "cold"}, "model_version": "heuristic_v0"},
        # Garbage event_type ignored
        {"event_type": "garbage", "surface": "find_search"},
    ]
    mock_db = _stream_returning(events)

    with patch("firebase_admin.auth.verify_id_token", return_value=FAKE_ADMIN), \
         patch("backend.app.routes.recommendation_funnel.get_db", return_value=mock_db):
        resp = client.get(
            "/api/admin/recommendation-funnel?from=2026-05-01&to=2026-05-17",
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 200
    body = resp.get_json()

    # Total funnel
    assert body["total"]["counts"]["recommendation_shown"] == 3
    assert body["total"]["counts"]["email_drafted"] == 1
    assert body["total"]["counts"]["email_sent"] == 1
    assert body["total"]["counts"]["email_replied"] == 1

    # Rates
    assert body["total"]["rates"]["shown_to_drafted"] == round(1 / 3, 4)
    assert body["total"]["rates"]["sent_to_replied"] == 1.0
    assert body["total"]["rates"]["shown_to_replied"] == round(1 / 3, 4)

    # Warm tier breakdown
    warm = body["by_warmth_tier"]["warm"]["counts"]
    assert warm["recommendation_shown"] == 2
    assert warm["email_replied"] == 1

    # Surface breakdown
    assert body["by_surface"]["find_search"]["counts"]["recommendation_shown"] == 3
    assert body["by_surface"]["gmail_webhook"]["counts"]["email_replied"] == 1


def test_surface_filter_narrows_results(client):
    events = [
        {"event_type": "recommendation_shown", "surface": "find_search",
         "features_snapshot": {"warmth_tier": "warm"}},
        {"event_type": "recommendation_shown", "surface": "other",
         "features_snapshot": {"warmth_tier": "warm"}},
    ]
    mock_db = _stream_returning(events)
    with patch("firebase_admin.auth.verify_id_token", return_value=FAKE_ADMIN), \
         patch("backend.app.routes.recommendation_funnel.get_db", return_value=mock_db):
        resp = client.get(
            "/api/admin/recommendation-funnel?from=2026-05-01&to=2026-05-17&surface=find_search",
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"]["counts"]["recommendation_shown"] == 1
    assert body["surface_filter"] == "find_search"
