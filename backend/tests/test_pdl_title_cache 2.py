"""Tests for pdl_title_cache — slug normalization is load-bearing.

If slugify_title regresses, cache cardinality explodes and we drain the 50k
credit pool. Every realistic title variant we've seen should collapse to one
slug.
"""
import pytest
from unittest.mock import patch, MagicMock

from app.services import pdl_title_cache
from app.services.pdl_title_cache import (
    slugify_title,
    get_or_enrich_title,
    _normalize_pdl_response,
    reset_run_counter,
    MAX_PER_RUN,
)


class TestSlugifyTitle:
    """Same job, different keyboards. All must collapse."""

    @pytest.mark.parametrize("variant", [
        "Senior Software Engineer",
        "senior software engineer",
        "SENIOR SOFTWARE ENGINEER",
        "Senior  Software  Engineer",
        "  Senior Software Engineer  ",
        "Senior-Software-Engineer",
        "Senior_Software_Engineer",
    ])
    def test_basic_normalization(self, variant):
        assert slugify_title(variant) == "senior software engineer"

    @pytest.mark.parametrize("variant", [
        "Sr. SWE II",
        "sr swe ii",
        "Sr SWE  II",
        "SR. SWE-II",
        "sr. swe ii",
    ])
    def test_abbreviations_and_punctuation(self, variant):
        assert slugify_title(variant) == "sr swe ii"

    def test_handles_commas_and_slashes(self):
        assert slugify_title("Software Engineer, Backend") == "software engineer backend"
        assert slugify_title("Frontend/Backend Engineer") == "frontend backend engineer"

    def test_handles_parens(self):
        assert slugify_title("Software Engineer (Summer 2027)") == "software engineer summer 2027"

    def test_empty_inputs(self):
        assert slugify_title("") == ""
        assert slugify_title(None) == ""
        assert slugify_title("   ") == ""
        assert slugify_title("!!!") == ""

    def test_non_string_input(self):
        assert slugify_title(123) == ""
        assert slugify_title([]) == ""


class TestNormalizePdlResponse:
    def test_handles_empty(self):
        out = _normalize_pdl_response({}, "Software Engineer")
        assert out["cleaned_name"] == "Software Engineer"
        assert out["similar_titles"] == []
        assert out["levels"] == []
        assert out["role"] == ""

    def test_extracts_role_from_dict_category(self):
        raw = {
            "cleaned_name": "software engineer",
            "similar_titles": ["developer", "programmer"],
            "levels": ["entry-level"],
            "categories": [{"role": "engineering", "sub_role": "software"}],
        }
        out = _normalize_pdl_response(raw, "fallback")
        assert out["role"] == "engineering"
        assert out["sub_role"] == "software"
        assert out["similar_titles"] == ["developer", "programmer"]

    def test_filters_non_string_similar_titles(self):
        raw = {"similar_titles": ["developer", None, 42, "engineer"]}
        out = _normalize_pdl_response(raw, "fallback")
        assert out["similar_titles"] == ["developer", "engineer"]


class TestGetOrEnrichTitle:
    def setup_method(self):
        reset_run_counter()

    def test_empty_title_returns_empty_payload_no_pdl_call(self):
        with patch("app.services.pdl_title_cache.enrich_job_title_with_pdl") as mock_pdl:
            out = get_or_enrich_title("")
            assert out["cleaned_name"] == ""
            mock_pdl.assert_not_called()

    def test_cache_hit_skips_pdl(self):
        mock_db = MagicMock()
        cached_doc = MagicMock()
        cached_doc.exists = True
        cached_doc.to_dict.return_value = {
            "cleaned_name": "software engineer",
            "similar_titles": ["developer"],
            "levels": ["entry-level"],
            "role": "engineering",
            "sub_role": "software",
        }
        mock_db.collection.return_value.document.return_value.get.return_value = cached_doc

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("app.services.pdl_title_cache.enrich_job_title_with_pdl") as mock_pdl:
            out = get_or_enrich_title("Software Engineer")
            assert out["cleaned_name"] == "software engineer"
            assert out["similar_titles"] == ["developer"]
            mock_pdl.assert_not_called()

    def test_cache_miss_calls_pdl_and_writes(self):
        mock_db = MagicMock()
        missing_doc = MagicMock()
        missing_doc.exists = False
        usage_doc = MagicMock()
        usage_doc.exists = True
        usage_doc.to_dict.return_value = {"credits_used": 100}
        mock_db.collection.return_value.document.return_value.get.side_effect = [
            missing_doc,  # cache read
            usage_doc,    # budget check
        ]

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("app.services.pdl_title_cache.enrich_job_title_with_pdl") as mock_pdl:
            mock_pdl.return_value = {
                "cleaned_name": "software engineer",
                "similar_titles": ["dev"],
                "levels": ["entry-level"],
                "categories": [{"role": "engineering", "sub_role": "software"}],
            }
            out = get_or_enrich_title("Software Engineer")
            assert out["cleaned_name"] == "software engineer"
            mock_pdl.assert_called_once_with("Software Engineer")
            assert pdl_title_cache.get_run_misses() == 1

    def test_per_run_cap_blocks_further_misses(self):
        mock_db = MagicMock()
        missing_doc = MagicMock()
        missing_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = missing_doc

        # Simulate cap already hit.
        with patch("app.services.pdl_title_cache._run_misses", MAX_PER_RUN), \
             patch("app.extensions.get_db", return_value=mock_db), \
             patch("app.services.pdl_title_cache.enrich_job_title_with_pdl") as mock_pdl:
            out = get_or_enrich_title("Anything")
            assert out["cleaned_name"] == "Anything"
            mock_pdl.assert_not_called()

    def test_budget_breaker_refuses_when_over_threshold(self):
        mock_db = MagicMock()
        missing_doc = MagicMock()
        missing_doc.exists = False
        usage_doc = MagicMock()
        usage_doc.exists = True
        usage_doc.to_dict.return_value = {"credits_used": 46_000}  # > 45k breaker
        mock_db.collection.return_value.document.return_value.get.side_effect = [
            missing_doc,  # cache read
            usage_doc,    # budget read
        ]

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("app.services.pdl_title_cache.enrich_job_title_with_pdl") as mock_pdl:
            out = get_or_enrich_title("Anything")
            assert out["cleaned_name"] == "Anything"
            mock_pdl.assert_not_called()

    def test_get_db_failure_returns_empty_payload(self):
        with patch("app.extensions.get_db", side_effect=RuntimeError("boom")), \
             patch("app.services.pdl_title_cache.enrich_job_title_with_pdl") as mock_pdl:
            out = get_or_enrich_title("Software Engineer")
            assert out["cleaned_name"] == "Software Engineer"
            mock_pdl.assert_not_called()
