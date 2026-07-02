"""Unit tests for the filter-override merge used by /prompt-search and firm search."""
import json

import pytest
from unittest.mock import MagicMock, patch

from app.services.filter_overrides import apply_people_filters, apply_firm_filters

pytestmark = pytest.mark.unit


def _parsed_people(**over):
    base = {
        "companies": [{"name": "Google", "matched_titles": ["Software Engineer"]}],
        "title_variations": ["Software Engineer"],
        "locations": ["New York"],
        "schools": ["USC"],
        "industries": ["technology"],
        "company_context": "big tech",
        "confidence": "high",
    }
    base.update(over)
    return base


class TestPeopleOverrides:
    def test_present_key_replaces_parsed_dimension(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["Airbnb"]})
        assert out["companies"] == [{"name": "Airbnb", "matched_titles": []}]
        assert out["title_variations"] == ["Software Engineer"]  # untouched

    def test_titles_key_maps_to_title_variations(self):
        out = apply_people_filters(_parsed_people(), {"titles": ["Product Manager"]})
        assert out["title_variations"] == ["Product Manager"]

    def test_empty_list_clears_dimension(self):
        out = apply_people_filters(_parsed_people(), {"companies": []})
        assert out["companies"] == []

    def test_absent_key_keeps_parse(self):
        out = apply_people_filters(_parsed_people(), {"locations": ["Chicago"]})
        assert out["companies"] == [{"name": "Google", "matched_titles": ["Software Engineer"]}]
        assert out["schools"] == ["USC"]

    def test_list_capped_at_five(self):
        out = apply_people_filters(_parsed_people(), {"companies": [f"C{i}" for i in range(9)]})
        assert len(out["companies"]) == 5

    def test_strings_truncated_to_100_chars(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["x" * 300]})
        assert len(out["companies"][0]["name"]) == 100

    def test_non_string_items_dropped(self):
        out = apply_people_filters(_parsed_people(), {"companies": [42, None, "Stripe", {"a": 1}]})
        assert out["companies"] == [{"name": "Stripe", "matched_titles": []}]

    def test_blank_strings_dropped(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["  ", "Stripe"]})
        assert out["companies"] == [{"name": "Stripe", "matched_titles": []}]

    def test_unknown_keys_ignored(self):
        out = apply_people_filters(_parsed_people(), {"salary": ["1M"], "companies": ["Stripe"]})
        assert "salary" not in out
        assert out["companies"] == [{"name": "Stripe", "matched_titles": []}]

    def test_non_dict_filters_is_noop(self):
        parsed = _parsed_people()
        assert apply_people_filters(parsed, None) == parsed
        assert apply_people_filters(parsed, "junk") == parsed
        assert apply_people_filters(parsed, []) == parsed

    def test_does_not_mutate_input(self):
        parsed = _parsed_people()
        apply_people_filters(parsed, {"companies": ["Stripe"]})
        assert parsed["companies"] == [{"name": "Google", "matched_titles": ["Software Engineer"]}]

    def test_non_list_value_for_list_key_ignored(self):
        out = apply_people_filters(_parsed_people(), {"companies": "Stripe"})
        assert out["companies"] == [{"name": "Google", "matched_titles": ["Software Engineer"]}]  # invalid shape → keep parse

    def test_companies_override_wraps_in_parser_object_shape(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["Airbnb"]})
        assert out["companies"] == [{"name": "Airbnb", "matched_titles": []}]

    def test_companies_override_mixed_junk_wraps_valid_entries(self):
        out = apply_people_filters(_parsed_people(), {"companies": [42, "Stripe"]})
        assert out["companies"] == [{"name": "Stripe", "matched_titles": []}]


def _parsed_firm(**over):
    base = {"industry": "investment banking", "location": "New York",
            "size": "mid", "keywords": ["healthcare"]}
    base.update(over)
    return base


class TestFirmOverrides:
    def test_industry_string_override(self):
        out = apply_firm_filters(_parsed_firm(), {"industry": "consulting"})
        assert out["industry"] == "consulting"
        assert out["location"] == "New York"

    def test_industry_cleared_with_none(self):
        out = apply_firm_filters(_parsed_firm(), {"industry": None})
        assert out["industry"] is None

    def test_size_enum_enforced(self):
        assert apply_firm_filters(_parsed_firm(), {"size": "large"})["size"] == "large"
        assert apply_firm_filters(_parsed_firm(), {"size": "gigantic"})["size"] == "none"

    def test_keywords_capped_and_cleaned(self):
        out = apply_firm_filters(_parsed_firm(), {"keywords": [1, "m&a", "  ", "tech"] + ["k"] * 9})
        assert out["keywords"][:2] == ["m&a", "tech"]
        assert len(out["keywords"]) <= 5

    def test_location_string_truncated(self):
        out = apply_firm_filters(_parsed_firm(), {"location": "y" * 300})
        assert len(out["location"]) == 100

    def test_non_dict_filters_is_noop(self):
        parsed = _parsed_firm()
        assert apply_firm_filters(parsed, None) == parsed

    def test_unknown_keys_ignored(self):
        out = apply_firm_filters(_parsed_firm(), {"revenue": "huge"})
        assert "revenue" not in out


# ---------------------------------------------------------------------------
# Route-level guard: /api/prompt-search must 400 when filter-rail overrides
# clear every search dimension (the guard fires BEFORE any provider call).
# ---------------------------------------------------------------------------

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com", "name": "Test User"}

FIVE_DIMS = ("companies", "title_variations", "locations", "schools", "industries")


class TestPromptSearchFilterGuard:
    @pytest.fixture(autouse=True)
    def _bypass_firebase_auth(self):
        """Bypass Firebase token verification at the firebase_admin layer."""
        with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
             patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
            yield

    def test_filters_clearing_all_dims_returns_400(self, client):
        # LLM parse succeeds with high confidence and populated dims — the 400
        # must come from the filter-override guard, not the confidence gate.
        parsed = {
            "confidence": "high",
            "companies": ["Google"],
            "title_variations": ["software engineer"],
            "locations": ["San Francisco"],
            "schools": [],
            "industries": [],
            "company_context": "",
        }

        # User doc does not exist → route falls back to free-tier defaults
        # (credits >= 5), skipping credit-reset and exclusion-list Firestore
        # reads. The guard fires before any provider call, so nothing beyond
        # the parse and the user-doc lookup needs mocking.
        mock_db = MagicMock()
        user_doc = MagicMock()
        user_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = user_doc

        # Patch the registered route module (wsgi imports backend.app.routes.runs).
        # search_contacts_from_prompt raises if reached: the guard must 400
        # BEFORE any provider call.
        with patch("backend.app.routes.runs.get_db", return_value=mock_db), \
             patch("backend.app.routes.runs.parse_search_prompt_structured", return_value=parsed), \
             patch("backend.app.routes.runs.search_contacts_from_prompt",
                   side_effect=AssertionError("provider called before filter guard")):
            resp = client.post(
                "/api/prompt-search",
                data=json.dumps({
                    "prompt": "software engineers at Google in SF",
                    "filters": {"titles": [], "companies": [], "locations": [],
                                "schools": [], "industries": []},
                }),
                content_type="application/json",
                headers={"Authorization": "Bearer test-token"},
            )

        assert resp.status_code == 400
        body = resp.get_json()
        assert "needs at least one filter" in body["error"]
        # parsed_query echoes all five (now cleared) dims so the rail can render.
        assert body["parsed_query"] == {k: [] for k in FIVE_DIMS}
