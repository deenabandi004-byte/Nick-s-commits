"""Unit tests for the filter-override merge used by /prompt-search and firm search."""
import pytest

from app.services.filter_overrides import apply_people_filters, apply_firm_filters

pytestmark = pytest.mark.unit


def _parsed_people(**over):
    base = {
        "companies": ["Google"],
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
        assert out["companies"] == ["Airbnb"]
        assert out["title_variations"] == ["Software Engineer"]  # untouched

    def test_titles_key_maps_to_title_variations(self):
        out = apply_people_filters(_parsed_people(), {"titles": ["Product Manager"]})
        assert out["title_variations"] == ["Product Manager"]

    def test_empty_list_clears_dimension(self):
        out = apply_people_filters(_parsed_people(), {"companies": []})
        assert out["companies"] == []

    def test_absent_key_keeps_parse(self):
        out = apply_people_filters(_parsed_people(), {"locations": ["Chicago"]})
        assert out["companies"] == ["Google"]
        assert out["schools"] == ["USC"]

    def test_list_capped_at_five(self):
        out = apply_people_filters(_parsed_people(), {"companies": [f"C{i}" for i in range(9)]})
        assert len(out["companies"]) == 5

    def test_strings_truncated_to_100_chars(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["x" * 300]})
        assert len(out["companies"][0]) == 100

    def test_non_string_items_dropped(self):
        out = apply_people_filters(_parsed_people(), {"companies": [42, None, "Stripe", {"a": 1}]})
        assert out["companies"] == ["Stripe"]

    def test_blank_strings_dropped(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["  ", "Stripe"]})
        assert out["companies"] == ["Stripe"]

    def test_unknown_keys_ignored(self):
        out = apply_people_filters(_parsed_people(), {"salary": ["1M"], "companies": ["Stripe"]})
        assert "salary" not in out
        assert out["companies"] == ["Stripe"]

    def test_non_dict_filters_is_noop(self):
        parsed = _parsed_people()
        assert apply_people_filters(parsed, None) == parsed
        assert apply_people_filters(parsed, "junk") == parsed
        assert apply_people_filters(parsed, []) == parsed

    def test_does_not_mutate_input(self):
        parsed = _parsed_people()
        apply_people_filters(parsed, {"companies": ["Stripe"]})
        assert parsed["companies"] == ["Google"]

    def test_non_list_value_for_list_key_ignored(self):
        out = apply_people_filters(_parsed_people(), {"companies": "Stripe"})
        assert out["companies"] == ["Google"]  # invalid shape → keep parse


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
