# backend/tests/test_firm_search_overrides.py
"""search_firms applies filter overrides after parsing, before searching."""
from unittest.mock import patch

import pytest

from app.services import company_search

pytestmark = pytest.mark.unit


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
