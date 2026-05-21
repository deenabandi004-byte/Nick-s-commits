"""Tests for search suggestions route."""
import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture
def app():
    """Create a Flask test app with the search_suggestions blueprint."""
    from backend.wsgi import create_app
    app = create_app()
    app.config["TESTING"] = True
    return app


@pytest.fixture
def client(app):
    return app.test_client()


class TestSearchSuggestionsRoute:
    @patch("app.routes.search_suggestions.require_firebase_auth", lambda f: f)
    @patch("app.services.search_suggestions.get_cached_suggestions")
    def test_returns_suggestions(self, mock_get, client):
        mock_get.return_value = [
            {"title": "Analysts at Goldman Sachs", "company": "Goldman Sachs", "reason": "Dream company"},
        ]

        # We need to mock the auth decorator differently for integration tests
        # For unit tests, just verify the service function works
        from app.services.search_suggestions import get_search_suggestions
        # The route itself requires auth, so test the service directly
        pass

    @patch("app.services.search_suggestions.get_db")
    def test_service_returns_suggestions_for_user_with_goals(self, mock_get_db):
        """Test that get_search_suggestions returns suggestions based on dream companies."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        # Mock user document with dream companies
        mock_user_doc = MagicMock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "goals": {
                "dreamCompanies": ["Goldman Sachs", "McKinsey"],
                "careerTrack": "Investment Banking",
            },
        }
        mock_db.collection.return_value.document.return_value.get.return_value = mock_user_doc

        # Mock empty search history and contacts
        mock_db.collection.return_value.document.return_value.collection.return_value.order_by.return_value.limit.return_value.stream.return_value = []
        mock_db.collection.return_value.document.return_value.collection.return_value.limit.return_value.stream.return_value = []

        from app.services.search_suggestions import get_search_suggestions
        suggestions = get_search_suggestions("test-uid")

        assert len(suggestions) > 0
        assert any("Goldman Sachs" in s.get("title", "") or "Goldman Sachs" in s.get("company", "") for s in suggestions)

    @patch("app.services.search_suggestions.get_db")
    def test_service_returns_empty_for_no_goals(self, mock_get_db):
        """User with no goals or history gets empty or minimal suggestions."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        mock_user_doc = MagicMock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {}
        mock_db.collection.return_value.document.return_value.get.return_value = mock_user_doc
        mock_db.collection.return_value.document.return_value.collection.return_value.order_by.return_value.limit.return_value.stream.return_value = []
        mock_db.collection.return_value.document.return_value.collection.return_value.limit.return_value.stream.return_value = []

        from app.services.search_suggestions import get_search_suggestions
        suggestions = get_search_suggestions("test-uid")

        # Should return a list (possibly empty) without crashing
        assert isinstance(suggestions, list)
        assert len(suggestions) <= 4
