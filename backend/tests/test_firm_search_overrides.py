# backend/tests/test_firm_search_overrides.py
"""search_firms applies filter overrides after parsing, before searching."""
import json
from unittest.mock import MagicMock, patch

import pytest

from app.services import company_search

pytestmark = pytest.mark.unit

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com", "name": "Test User"}


def _fake_parse(prompt, use_cache=True):
    return {"success": True, "parsed": {
        "industry": "investment banking", "location": "New York",
        "size": "mid", "keywords": ["healthcare"]}}


def _fake_serp(**kwargs):
    # Echo what search_firms passed so the test can assert the override won.
    return {"success": True, "firms": [], "total": 0, "queryLevel": 3,
            "_echo": {"industry": kwargs.get("industry"), "size": kwargs.get("size")}}


@patch("app.services.company_search.parse_firm_search_prompt", side_effect=_fake_parse)
def test_override_wins_over_parse(mock_parse):
    with patch("app.services.serp_client.search_companies_with_serp", side_effect=lambda **kw: _fake_serp(**kw)):
        result = company_search.search_firms(
            "ibanks in nyc", limit=5,
            filter_overrides={"industry": "consulting", "size": "large"},
        )
    assert result["parsedFilters"]["industry"] == "consulting"
    assert result["parsedFilters"]["size"] == "large"
    assert result["parsedFilters"]["location"] == "New York"  # untouched


@patch("app.services.company_search.parse_firm_search_prompt", side_effect=_fake_parse)
def test_clearing_everything_returns_error_not_crash(mock_parse):
    result = company_search.search_firms(
        "ibanks in nyc", limit=5,
        filter_overrides={"industry": None, "location": None, "keywords": []},
    )
    assert result["success"] is False
    assert "filter" in result["error"].lower()
    assert result["error_code"] == "filters_cleared"


@patch("app.services.company_search.parse_firm_search_prompt", side_effect=_fake_parse)
def test_sparse_results_without_overrides_do_not_crash(mock_parse):
    """Regression: the sparse-results suggestions branch used to pass the
    normalized-location dict into _build_firm_search_suggestions (which
    expects a string) and crash with AttributeError. Organic searches (no
    filter_overrides) with sparse results must succeed."""
    with patch("app.services.serp_client.search_companies_with_serp",
               side_effect=lambda **kw: _fake_serp(**kw)):
        # firms=[] and limit=5 -> firms_found < limit*0.5, suggestions branch fires.
        result = company_search.search_firms("ibanks in nyc", limit=5)
    assert result["success"] is True


class TestSyncRouteGuardClassification:
    """The sync /api/firm-search/search route must surface the all-filters-cleared
    guard as a 400 ValidationError, not a 502 ExternalAPIError."""

    @pytest.fixture(autouse=True)
    def _bypass_firebase_auth(self):
        with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
             patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
            yield

    def test_guard_failure_returns_400_not_502(self, client):
        guard_failure = {
            "success": False, "firms": [], "total": 0,
            "parsedFilters": {"industry": None, "location": None,
                              "size": "none", "keywords": []},
            "error": "Your search needs at least one filter. Add an industry, location, or focus area.",
            "error_code": "filters_cleared",
            "fallbackApplied": False, "queryLevel": None,
        }

        # User doc does not exist -> route falls back to free-tier defaults
        # with enough credits for the pre-flight check.
        mock_db = MagicMock()
        user_doc = MagicMock()
        user_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = user_doc

        with patch("backend.app.routes.firm_search.get_db", return_value=mock_db), \
             patch("backend.app.routes.firm_search.search_firms", return_value=guard_failure):
            resp = client.post(
                "/api/firm-search/search",
                data=json.dumps({
                    "query": "ibanks in nyc",
                    "filters": {"industry": None, "location": None, "keywords": []},
                }),
                content_type="application/json",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 400
        body = resp.get_json()
        assert "needs at least one filter" in body["error"]

    def test_guard_failure_classification_ignores_copy_text(self, client):
        """Classification must key off error_code, not the error string — reword
        the copy to something arbitrary and confirm the route still returns 400."""
        guard_failure = {
            "success": False, "firms": [], "total": 0,
            "parsedFilters": {"industry": None, "location": None,
                              "size": "none", "keywords": []},
            "error": "reworded copy",
            "error_code": "filters_cleared",
            "fallbackApplied": False, "queryLevel": None,
        }

        mock_db = MagicMock()
        user_doc = MagicMock()
        user_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = user_doc

        with patch("backend.app.routes.firm_search.get_db", return_value=mock_db), \
             patch("backend.app.routes.firm_search.search_firms", return_value=guard_failure):
            resp = client.post(
                "/api/firm-search/search",
                data=json.dumps({
                    "query": "ibanks in nyc",
                    "filters": {"industry": None, "location": None, "keywords": []},
                }),
                content_type="application/json",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 400
        body = resp.get_json()
        assert "reworded copy" in body["error"]
