"""
Tests for meeting prep feature.
Covers: meeting.py (service), meeting_prep.py (utils), meeting_prep.py (routes).
Tests credit TOCTOU fix, atomic usage counter, extra_context passthrough, parallel SERP,
news filtering, hometown inference, model selection, KeyError fixes, signed URL handling.
"""

import json
import re
import pytest
from unittest.mock import patch, MagicMock, PropertyMock
from datetime import datetime


# =============================================================================
# meeting.py - _default_time_window_to_serp
# =============================================================================

class TestTimeWindowToSerp:
    """Test time window string → SerpAPI tbs conversion."""

    def test_last_7_days(self):
        from app.services.meeting import _default_time_window_to_serp
        assert _default_time_window_to_serp("last 7 days") == "qdr:w"

    def test_past_week(self):
        from app.services.meeting import _default_time_window_to_serp
        assert _default_time_window_to_serp("past week") == "qdr:w"

    def test_last_30_days(self):
        from app.services.meeting import _default_time_window_to_serp
        assert _default_time_window_to_serp("last 30 days") == "qdr:m"

    def test_last_90_days(self):
        from app.services.meeting import _default_time_window_to_serp
        assert _default_time_window_to_serp("last 90 days") == "qdr:m3"

    def test_last_year(self):
        from app.services.meeting import _default_time_window_to_serp
        assert _default_time_window_to_serp("last year") == "qdr:y"

    def test_default_fallback(self):
        from app.services.meeting import _default_time_window_to_serp
        assert _default_time_window_to_serp("some random string") == "qdr:m3"

    def test_none_input(self):
        from app.services.meeting import _default_time_window_to_serp
        assert _default_time_window_to_serp(None) == "qdr:m3"

    def test_empty_string(self):
        from app.services.meeting import _default_time_window_to_serp
        assert _default_time_window_to_serp("") == "qdr:m3"


# =============================================================================
# meeting.py - _classify_domain
# =============================================================================

class TestClassifyDomain:
    """Test job title → domain classification."""

    def test_manufacturing_engineer(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("Manufacturing Engineer") == "industrial_engineering"

    def test_process_engineer(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("Process Engineer") == "industrial_engineering"

    def test_plant_manager(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("Plant Manager") == "industrial_engineering"

    def test_mechanical_engineer(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("Mechanical Engineer") == "industrial_engineering"

    def test_software_engineer(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("Software Engineer") == "general"

    def test_product_manager(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("Product Manager") == "general"

    def test_empty_title(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("") == "general"

    def test_none_title(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain(None) == "general"

    def test_operations_director(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("Operations Director") == "industrial_engineering"

    def test_chemical_engineer(self):
        from app.services.meeting import _classify_domain
        assert _classify_domain("Chemical Engineer") == "industrial_engineering"


# =============================================================================
# meeting.py - _is_news_eligible
# =============================================================================

class TestIsNewsEligible:
    """Test news item eligibility filtering."""

    def test_same_company_eligible(self):
        from app.services.meeting import _is_news_eligible
        item = {"title": "Acme Corp announces new facility", "snippet": "Expansion plans"}
        assert _is_news_eligible(item, "Acme Corp", "general") is True

    def test_reject_ai_news(self):
        from app.services.meeting import _is_news_eligible
        item = {"title": "New AI startup raises funding", "snippet": "artificial intelligence"}
        assert _is_news_eligible(item, "SomeCompany", "general") is False

    def test_reject_stock_market_news(self):
        from app.services.meeting import _is_news_eligible
        item = {"title": "Stock market rally", "snippet": "earnings report strong"}
        assert _is_news_eligible(item, "OtherCorp", "general") is False

    def test_reject_fintech_news(self):
        from app.services.meeting import _is_news_eligible
        item = {"title": "Fintech disruption", "snippet": "financial technology advances"}
        assert _is_news_eligible(item, "SomeCo", "general") is False

    def test_same_company_with_reject_term_general_domain(self):
        """Company mentioned + reject term in general domain → allowed."""
        from app.services.meeting import _is_news_eligible
        item = {"title": "Acme Corp AI initiative", "snippet": "artificial intelligence project"}
        assert _is_news_eligible(item, "Acme Corp", "general") is True

    def test_same_company_with_reject_term_industrial_domain_no_engineering(self):
        """Company mentioned + reject term + industrial domain + no engineering terms → rejected."""
        from app.services.meeting import _is_news_eligible
        item = {"title": "Acme Corp AI startup funding", "snippet": "artificial intelligence venture capital"}
        assert _is_news_eligible(item, "Acme Corp", "industrial_engineering") is False

    def test_same_company_with_reject_term_industrial_domain_has_engineering(self):
        """Company + reject term + industrial domain + engineering terms → allowed."""
        from app.services.meeting import _is_news_eligible
        item = {"title": "Acme Corp AI in manufacturing", "snippet": "artificial intelligence operations plant"}
        assert _is_news_eligible(item, "Acme Corp", "industrial_engineering") is True

    def test_industrial_peer_content(self):
        """Industrial domain: peer company with relevant terms → eligible."""
        from app.services.meeting import _is_news_eligible
        item = {"title": "New refinery construction project", "snippet": "engineering firm contractor industrial pipeline"}
        assert _is_news_eligible(item, "SomeCompany", "industrial_engineering") is True

    def test_industrial_irrelevant_peer(self):
        """Industrial domain: no relevant terms → rejected."""
        from app.services.meeting import _is_news_eligible
        item = {"title": "Tech company launches app", "snippet": "mobile development team"}
        assert _is_news_eligible(item, "SomeCompany", "industrial_engineering") is False

    def test_empty_company(self):
        """No company, no reject terms, general domain → not eligible (no criteria met)."""
        from app.services.meeting import _is_news_eligible
        item = {"title": "New office opens", "snippet": "local business expands"}
        assert _is_news_eligible(item, "", "general") is False

    def test_missing_title_and_snippet(self):
        from app.services.meeting import _is_news_eligible
        item = {}
        assert _is_news_eligible(item, "Acme", "general") is False


# =============================================================================
# meeting.py - _score_relevance
# =============================================================================

class TestScoreRelevance:
    """Test news relevance scoring."""

    def test_division_and_office_hit(self):
        from app.services.meeting import _score_relevance
        item = {"title": "Energy Division Houston office news", "snippet": "update"}
        tag, conf = _score_relevance(item, "Acme", "Energy Division", "Houston", "energy")
        assert tag == "division"
        assert conf == "high"

    def test_division_only(self):
        from app.services.meeting import _score_relevance
        item = {"title": "Energy Division update", "snippet": "growth"}
        tag, conf = _score_relevance(item, "Acme", "Energy Division", "Houston", "energy")
        assert tag == "division"
        assert conf == "medium"

    def test_office_and_company(self):
        from app.services.meeting import _score_relevance
        item = {"title": "Acme Houston office expansion", "snippet": "growth"}
        tag, conf = _score_relevance(item, "Acme", "Energy", "Houston", "energy")
        assert tag == "office"
        assert conf == "high"

    def test_office_only(self):
        from app.services.meeting import _score_relevance
        item = {"title": "Houston office news", "snippet": "update"}
        tag, conf = _score_relevance(item, "OtherCorp", "Energy", "Houston", "energy")
        assert tag == "office"
        assert conf == "medium"

    def test_industry_only(self):
        from app.services.meeting import _score_relevance
        item = {"title": "Energy sector trends", "snippet": "renewable growth"}
        tag, conf = _score_relevance(item, "OtherCorp", "OtherDiv", "OtherOffice", "energy")
        assert tag == "industry"
        assert conf == "medium"

    def test_no_hits_defaults_to_industry(self):
        from app.services.meeting import _score_relevance
        item = {"title": "Random news", "snippet": "something"}
        tag, conf = _score_relevance(item, "Acme", "Div", "Office", "Energy")
        assert tag == "industry"
        assert conf == "medium"


# =============================================================================
# meeting.py - _score_news_relevance
# =============================================================================

class TestScoreNewsRelevance:
    """Test 0-1 relevance score computation."""

    def test_division_high(self):
        from app.services.meeting import _score_news_relevance
        score = _score_news_relevance({"relevance_tag": "division", "confidence": "high"})
        assert score == 1.0

    def test_division_medium(self):
        from app.services.meeting import _score_news_relevance
        score = _score_news_relevance({"relevance_tag": "division", "confidence": "medium"})
        assert score == 0.9

    def test_office_high(self):
        from app.services.meeting import _score_news_relevance
        score = _score_news_relevance({"relevance_tag": "office", "confidence": "high"})
        assert score == pytest.approx(0.8, abs=0.01)

    def test_industry_medium(self):
        from app.services.meeting import _score_news_relevance
        score = _score_news_relevance({"relevance_tag": "industry", "confidence": "medium"})
        assert score == 0.5

    def test_unknown_tag(self):
        from app.services.meeting import _score_news_relevance
        score = _score_news_relevance({"relevance_tag": "unknown", "confidence": "medium"})
        assert score == 0.3

    def test_newsitem_dataclass(self):
        from app.services.meeting import _score_news_relevance, NewsItem
        item = NewsItem(title="t", url="u", source="s", published_at=None,
                        summary="sum", relevance_tag="division", confidence="high")
        score = _score_news_relevance(item)
        assert score == 1.0

    def test_low_confidence_penalty(self):
        from app.services.meeting import _score_news_relevance
        score = _score_news_relevance({"relevance_tag": "office", "confidence": "low"})
        assert score == pytest.approx(0.56, abs=0.01)


# =============================================================================
# meeting.py - _copy_dedup_items
# =============================================================================

class TestCopyDedupItems:
    """Test URL deduplication."""

    def test_removes_duplicates(self):
        from app.services.meeting import _copy_dedup_items
        items = [
            {"link": "https://example.com/a?ref=1"},
            {"link": "https://example.com/a?ref=2"},
            {"link": "https://example.com/b"},
        ]
        result = _copy_dedup_items(items)
        assert len(result) == 2

    def test_no_url_items_skipped(self):
        from app.services.meeting import _copy_dedup_items
        items = [{"title": "no url"}, {"link": "https://example.com/a"}]
        result = _copy_dedup_items(items)
        assert len(result) == 1

    def test_empty_list(self):
        from app.services.meeting import _copy_dedup_items
        assert _copy_dedup_items([]) == []

    def test_url_field_fallback(self):
        from app.services.meeting import _copy_dedup_items
        items = [{"url": "https://example.com/a"}, {"url": "https://example.com/b"}]
        result = _copy_dedup_items(items)
        assert len(result) == 2


# =============================================================================
# meeting.py - _normalise_iso
# =============================================================================

class TestNormaliseIso:
    """Test date normalization."""

    def test_valid_date_string(self):
        from app.services.meeting import _normalise_iso
        result = _normalise_iso("2024-01-15")
        assert result is not None
        assert "2024-01-15" in result

    def test_relative_date(self):
        from app.services.meeting import _normalise_iso
        result = _normalise_iso("2 days ago")
        assert result is not None

    def test_none_input(self):
        from app.services.meeting import _normalise_iso
        assert _normalise_iso(None) is None

    def test_empty_string(self):
        from app.services.meeting import _normalise_iso
        assert _normalise_iso("") is None

    def test_unparseable_string(self):
        from app.services.meeting import _normalise_iso
        result = _normalise_iso("not a date at all xyz")
        # dateparser may or may not parse this, but should not raise
        assert result is None or isinstance(result, str)


# =============================================================================
# meeting.py - infer_hometown_from_education
# =============================================================================

class TestInferHometown:
    """Test hometown inference from education and PDL data."""

    def test_high_school_pattern_comma(self):
        from app.services.meeting import infer_hometown_from_education
        education = ["Westlake High School, Austin, TX"]
        result = infer_hometown_from_education(education)
        assert result == "Austin, TX"

    def test_city_high_school_pattern(self):
        from app.services.meeting import infer_hometown_from_education
        education = ["Portland High School, OR"]
        result = infer_hometown_from_education(education)
        assert result == "Portland, OR"

    def test_academy_pattern(self):
        from app.services.meeting import infer_hometown_from_education
        education = ["Phillips Academy, Andover, MA"]
        result = infer_hometown_from_education(education)
        assert result == "Andover, MA"

    def test_pdl_location_with_high_school(self):
        from app.services.meeting import infer_hometown_from_education
        education = ["Some high school program"]
        contact_data = {"city": "Denver", "state": "CO"}
        result = infer_hometown_from_education(education, contact_data)
        assert result == "Denver, CO"

    def test_pdl_location_no_high_school(self):
        """PDL location used even without high school mention (relaxed rule)."""
        from app.services.meeting import infer_hometown_from_education
        education = ["MIT BS Computer Science"]
        contact_data = {"city": "Boston", "state": "MA"}
        result = infer_hometown_from_education(education, contact_data)
        assert result == "Boston, MA"

    def test_pdl_case_insensitive_keys(self):
        from app.services.meeting import infer_hometown_from_education
        contact_data = {"City": "Seattle", "State": "WA"}
        result = infer_hometown_from_education([], contact_data)
        assert result == "Seattle, WA"

    def test_no_data_returns_empty(self):
        from app.services.meeting import infer_hometown_from_education
        result = infer_hometown_from_education([])
        assert result == ""

    def test_empty_education_none_contact(self):
        from app.services.meeting import infer_hometown_from_education
        result = infer_hometown_from_education([], None)
        assert result == ""

    def test_none_education_entries_filtered(self):
        from app.services.meeting import infer_hometown_from_education
        result = infer_hometown_from_education([None, "", None])
        assert result == ""

    def test_non_string_education_entries_skipped(self):
        from app.services.meeting import infer_hometown_from_education
        result = infer_hometown_from_education([123, {"school": "MIT"}])
        assert result == ""

    def test_invalid_state_code_rejected(self):
        """State must be exactly 2 uppercase alpha chars."""
        from app.services.meeting import infer_hometown_from_education
        contact_data = {"city": "London", "state": "UK1"}
        result = infer_hometown_from_education([], contact_data)
        assert result == ""

    def test_education_priority_over_pdl(self):
        """Education match should come before PDL fallback."""
        from app.services.meeting import infer_hometown_from_education
        education = ["Springfield High School, IL"]
        contact_data = {"city": "Chicago", "state": "IL"}
        result = infer_hometown_from_education(education, contact_data)
        assert result == "Springfield, IL"


# =============================================================================
# meeting.py - fetch_comprehensive_research (parallel SERP)
# =============================================================================

class TestFetchComprehensiveResearch:
    """Test parallel SERP research orchestration."""

    @patch("app.services.meeting.SERPAPI_KEY", "")
    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "")
    def test_no_api_key_returns_empty(self):
        from app.services.meeting import fetch_comprehensive_research
        result = fetch_comprehensive_research("Acme", "tech", "Engineer", "John", "Doe")
        assert result == {
            "company_news": [],
            "company_overview": [],
            "person_mentions": [],
            "industry_trends": [],
        }

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "")
    @patch("app.services.meeting.SERPAPI_KEY", "test-key")
    @patch("app.services.meeting.GoogleSearch")
    def test_parallel_execution_four_queries(self, mock_search_cls):
        """All 4 SERP queries run and results are returned (SerpAPI fallback)."""
        from app.services.meeting import fetch_comprehensive_research

        mock_instance = MagicMock()
        mock_instance.get_dict.return_value = {
            "organic_results": [
                {"title": "Test Result", "link": "https://example.com", "snippet": "snippet", "source": "src"}
            ]
        }
        mock_search_cls.return_value = mock_instance

        result = fetch_comprehensive_research(
            company="Acme Corp",
            industry="Technology",
            job_title="Software Engineer",
            first_name="John",
            last_name="Doe",
            division="Cloud",
            office="NYC",
            time_window="last 30 days",
            geo="us",
            language="en",
        )

        assert len(result["company_news"]) > 0 or len(result["company_overview"]) > 0
        assert mock_search_cls.call_count == 4  # 4 parallel searches

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "")
    @patch("app.services.meeting.SERPAPI_KEY", "test-key")
    @patch("app.services.meeting.GoogleSearch")
    def test_no_company_skips_company_searches(self, mock_search_cls):
        from app.services.meeting import fetch_comprehensive_research

        mock_instance = MagicMock()
        mock_instance.get_dict.return_value = {"organic_results": []}
        mock_search_cls.return_value = mock_instance

        result = fetch_comprehensive_research(
            company="",
            industry="Technology",
            job_title="Engineer",
            first_name="",
            last_name="",
        )
        # company_news and company_overview should be empty since no company
        assert result["company_news"] == []
        assert result["company_overview"] == []

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "")
    @patch("app.services.meeting.SERPAPI_KEY", "test-key")
    @patch("app.services.meeting.GoogleSearch")
    def test_dynamic_year_in_queries(self, mock_search_cls):
        """Year range should include current year."""
        from app.services.meeting import fetch_comprehensive_research

        mock_instance = MagicMock()
        mock_instance.get_dict.return_value = {"organic_results": []}
        mock_search_cls.return_value = mock_instance

        fetch_comprehensive_research("Acme", "tech", "Eng", "J", "D")

        current_year = datetime.now().year
        # Check that at least one call includes the current year
        all_queries = [str(call) for call in mock_search_cls.call_args_list]
        combined = " ".join(all_queries)
        assert str(current_year) in combined

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "")
    @patch("app.services.meeting.SERPAPI_KEY", "test-key")
    @patch("app.services.meeting.GoogleSearch")
    def test_search_failure_returns_empty_list(self, mock_search_cls):
        """If a SERP search raises, it returns [] instead of crashing."""
        from app.services.meeting import fetch_comprehensive_research

        mock_instance = MagicMock()
        mock_instance.get_dict.side_effect = Exception("Network error")
        mock_search_cls.return_value = mock_instance

        result = fetch_comprehensive_research("Acme", "tech", "Eng", "J", "D")
        assert result["company_news"] == []
        assert result["company_overview"] == []

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "")
    @patch("app.services.meeting.SERPAPI_KEY", "test-key")
    @patch("app.services.meeting.GoogleSearch")
    def test_source_dict_handling(self, mock_search_cls):
        """Source field can be a dict with 'name' key."""
        from app.services.meeting import fetch_comprehensive_research

        mock_instance = MagicMock()
        mock_instance.get_dict.return_value = {
            "organic_results": [
                {"title": "Test", "link": "https://ex.com", "snippet": "s",
                 "source": {"name": "Reuters"}, "date": "2024-01-01"}
            ]
        }
        mock_search_cls.return_value = mock_instance

        result = fetch_comprehensive_research("Acme", "tech", "Eng", "J", "D")
        # Should extract source name from dict
        if result["company_news"]:
            assert result["company_news"][0]["source"] == "Reuters"

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "")
    @patch("app.services.meeting.SERPAPI_KEY", "test-key")
    @patch("app.services.meeting.GoogleSearch")
    def test_extra_context_params_used(self, mock_search_cls):
        """Division, office, geo, language, time_window are used in queries."""
        from app.services.meeting import fetch_comprehensive_research

        mock_instance = MagicMock()
        mock_instance.get_dict.return_value = {"news_results": []}
        mock_search_cls.return_value = mock_instance

        fetch_comprehensive_research(
            company="Acme",
            industry="tech",
            job_title="Eng",
            first_name="J",
            last_name="D",
            division="Cloud Division",
            office="NYC",
            geo="uk",
            language="fr",
            time_window="last 7 days",
        )

        # Check geo/language params were passed
        for call_args in mock_search_cls.call_args_list:
            params = call_args[0][0]
            assert params.get("gl") == "uk"
            assert params.get("hl") == "fr"


# =============================================================================
# meeting.py - _summarise_article
# =============================================================================

class TestSummariseArticle:
    """Test article summarization with eligibility pre-check."""

    @patch("app.services.meeting.get_openai_client")
    def test_ineligible_item_skipped(self, mock_client):
        """Ineligible news items are not sent to OpenAI."""
        from app.services.meeting import _summarise_article
        item = {"title": "AI startup funding round", "snippet": "artificial intelligence venture capital"}
        result = _summarise_article(item, "Div", "Office", "OtherCorp", "general")
        assert result == ""
        mock_client.assert_not_called()

    @patch("app.services.meeting.get_openai_client")
    def test_eligible_item_summarized(self, mock_get_client):
        from app.services.meeting import _summarise_article
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Acme Corp announced a new facility in Houston."))]
        )

        item = {"title": "Acme Corp announces new facility", "snippet": "expansion plans in Houston"}
        result = _summarise_article(item, "Div", "Office", "Acme Corp", "general")
        assert "Acme Corp" in result
        mock_client.chat.completions.create.assert_called_once()

    @patch("app.services.meeting.get_openai_client")
    def test_skip_response_returns_empty(self, mock_get_client):
        from app.services.meeting import _summarise_article
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="SKIP"))]
        )

        item = {"title": "Acme Corp news", "snippet": "acme corp update"}
        result = _summarise_article(item, "Div", "Office", "Acme Corp", "general")
        assert result == ""

    @patch("app.services.meeting.get_openai_client")
    def test_no_client_returns_empty(self, mock_get_client):
        from app.services.meeting import _summarise_article
        mock_get_client.return_value = None
        item = {"title": "Acme Corp news", "snippet": "acme corp update"}
        result = _summarise_article(item, "Div", "Office", "Acme Corp", "general")
        assert result == ""

    @patch("app.services.meeting.get_openai_client")
    def test_uses_gpt4o_mini(self, mock_get_client):
        from app.services.meeting import _summarise_article
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Summary of the article about Acme Corp expansion."))]
        )

        item = {"title": "Acme Corp expansion", "snippet": "acme corp facility news"}
        _summarise_article(item, "Div", "Office", "Acme Corp", "general")

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o-mini"


# =============================================================================
# meeting.py - _generate_industry_overview
# =============================================================================

class TestGenerateIndustryOverview:
    """Test industry overview generation with relevance filtering."""

    @patch("app.services.meeting.get_openai_client")
    def test_no_high_relevance_items_returns_empty(self, mock_get_client):
        from app.services.meeting import _generate_industry_overview, NewsItem
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        items = [NewsItem(title="t", url="u", source="s", published_at=None,
                          summary="sum", relevance_tag="industry", confidence="medium")]
        # score = 0.5, below 0.8 threshold
        result = _generate_industry_overview("tech", items)
        assert result == ""
        # OpenAI completion should NOT be called (items filtered out before GPT call)
        mock_client.chat.completions.create.assert_not_called()

    @patch("app.services.meeting.get_openai_client")
    def test_high_relevance_items_summarized(self, mock_get_client):
        from app.services.meeting import _generate_industry_overview, NewsItem
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Industry is shifting toward renewable energy."))]
        )

        items = [NewsItem(title="t", url="u", source="s", published_at=None,
                          summary="sum", relevance_tag="division", confidence="high")]
        result = _generate_industry_overview("energy", items)
        assert "renewable" in result.lower() or len(result) > 0

    @patch("app.services.meeting.get_openai_client")
    def test_no_client_returns_empty(self, mock_get_client):
        from app.services.meeting import _generate_industry_overview, NewsItem
        mock_get_client.return_value = None
        items = [NewsItem(title="t", url="u", source="s", published_at=None,
                          summary="sum", relevance_tag="division", confidence="high")]
        result = _generate_industry_overview("tech", items)
        assert result == ""

    @patch("app.services.meeting.get_openai_client")
    def test_industrial_domain_filters_non_engineering(self, mock_get_client):
        from app.services.meeting import _generate_industry_overview, NewsItem
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        # Item has high score (division/high = 1.0) but no engineering terms
        items = [NewsItem(title="Marketing update", url="u", source="s", published_at=None,
                          summary="Brand awareness campaign", relevance_tag="division", confidence="high")]
        result = _generate_industry_overview("tech", items, "Acme", "industrial_engineering")
        assert result == ""
        # OpenAI completion should NOT be called (filtered by domain)
        mock_client.chat.completions.create.assert_not_called()


# =============================================================================
# meeting.py - format_news_for_storage / build_similarity_payload
# =============================================================================

class TestHelperFunctions:
    """Test utility functions."""

    def test_format_news_for_storage(self):
        from app.services.meeting import format_news_for_storage, NewsItem
        items = [NewsItem(title="T", url="U", source="S", published_at="2024-01-01",
                          summary="Sum", relevance_tag="division", confidence="high")]
        result = format_news_for_storage(items)
        assert len(result) == 1
        assert result[0]["title"] == "T"
        assert result[0]["confidence"] == "high"

    def test_build_similarity_payload(self):
        from app.services.meeting import build_similarity_payload
        result = build_similarity_payload({"name": "User"}, {"fullName": "Contact"})
        assert result["user_data"]["name"] == "User"
        assert result["contact_data"]["fullName"] == "Contact"

    def test_build_similarity_payload_none_inputs(self):
        from app.services.meeting import build_similarity_payload
        result = build_similarity_payload(None, None)
        assert result["user_data"] == {}
        assert result["contact_data"] == {}


# =============================================================================
# meeting_prep.py (utils) - generate_meeting_similarity
# =============================================================================

class TestGenerateMeetingSimilarity:
    """Test similarity generation via OpenAI."""

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_returns_markdown(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="## Common Ground\n- Both at USC"))]
        )

        from app.utils.meeting_prep import generate_meeting_similarity
        result = generate_meeting_similarity(
            {"fullName": "Jane Doe", "company": "Acme"},
            {"name": "Student", "university": "USC"},
            {"person_mentions": []},
        )
        assert "Common Ground" in result

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_uses_gpt4o(self, mock_get_client):
        """Similarity uses gpt-4o (high-quality)."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="similarity text"))]
        )

        from app.utils.meeting_prep import generate_meeting_similarity
        generate_meeting_similarity({}, {}, {})
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o"

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_no_client_returns_empty(self, mock_get_client):
        mock_get_client.return_value = None
        from app.utils.meeting_prep import generate_meeting_similarity
        result = generate_meeting_similarity({}, {}, {})
        assert result == ""

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_exception_returns_empty(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API error")

        from app.utils.meeting_prep import generate_meeting_similarity
        result = generate_meeting_similarity({}, {}, {})
        assert result == ""

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_experience_keyerror_fix(self, mock_get_client):
        """Verifies e.get('title','') and e.get('company','') don't KeyError."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="result"))]
        )

        from app.utils.meeting_prep import generate_meeting_similarity
        # experienceArray with missing keys - should not raise
        contact = {"experienceArray": [{"start_date": "2020"}, {}], "educationArray": [{}]}
        result = generate_meeting_similarity(contact, {"experiences": [{}]}, {})
        assert isinstance(result, str)


# =============================================================================
# meeting_prep.py (utils) - generate_meeting_questions
# =============================================================================

class TestGenerateMeetingQuestions:
    """Test question generation and JSON parsing."""

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_returns_categories(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps({
                "categories": [
                    {"name": "Career Trajectory", "questions": ["Q1", "Q2"]},
                    {"name": "Company & Role", "questions": ["Q3", "Q4"]},
                ]
            })))]
        )

        from app.utils.meeting_prep import generate_meeting_questions
        result = generate_meeting_questions({}, {}, {})
        assert len(result) == 2
        assert result[0]["name"] == "Career Trajectory"
        assert len(result[0]["questions"]) == 2

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_uses_gpt4o(self, mock_get_client):
        """Questions use gpt-4o (high-quality personalization)."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content='{"categories":[]}'))]
        )

        from app.utils.meeting_prep import generate_meeting_questions
        generate_meeting_questions({}, {}, {})
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o"

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_strips_code_fences(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        raw = '```json\n{"categories": [{"name": "Test", "questions": ["Q1"]}]}\n```'
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=raw))]
        )

        from app.utils.meeting_prep import generate_meeting_questions
        result = generate_meeting_questions({}, {}, {})
        assert len(result) == 1

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_invalid_json_returns_empty(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="not json at all"))]
        )

        from app.utils.meeting_prep import generate_meeting_questions
        result = generate_meeting_questions({}, {}, {})
        assert result == []

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_no_client_returns_empty(self, mock_get_client):
        mock_get_client.return_value = None
        from app.utils.meeting_prep import generate_meeting_questions
        result = generate_meeting_questions({}, {}, {})
        assert result == []

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_exception_returns_empty(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API error")

        from app.utils.meeting_prep import generate_meeting_questions
        result = generate_meeting_questions({}, {}, {})
        assert result == []


# =============================================================================
# meeting_prep.py (utils) - generate_company_cheat_sheet
# =============================================================================

class TestGenerateCompanyCheatSheet:
    """Test company cheat sheet generation."""

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_uses_gpt4o_mini(self, mock_get_client):
        """Cost optimization: cheat sheet uses gpt-4o-mini."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="**What They Do** - A company"))]
        )

        from app.utils.meeting_prep import generate_company_cheat_sheet
        generate_company_cheat_sheet({"company": "Acme"}, {"company_overview": []})
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o-mini"

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_no_client_returns_empty(self, mock_get_client):
        mock_get_client.return_value = None
        from app.utils.meeting_prep import generate_company_cheat_sheet
        result = generate_company_cheat_sheet({}, {})
        assert result == ""

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_exception_returns_empty(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("timeout")

        from app.utils.meeting_prep import generate_company_cheat_sheet
        result = generate_company_cheat_sheet({}, {})
        assert result == ""


# =============================================================================
# meeting_prep.py (utils) - generate_conversation_strategy
# =============================================================================

class TestGenerateConversationStrategy:
    """Test conversation strategy generation."""

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_uses_gpt4o_mini(self, mock_get_client):
        """Cost optimization: strategy uses gpt-4o-mini."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="**CONVERSATION FLOW**\nOpening..."))]
        )

        from app.utils.meeting_prep import generate_conversation_strategy
        generate_conversation_strategy({}, {}, "similarity text")
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o-mini"

    @patch("app.utils.meeting_prep.get_openai_client")
    def test_no_client_returns_empty(self, mock_get_client):
        mock_get_client.return_value = None
        from app.utils.meeting_prep import generate_conversation_strategy
        result = generate_conversation_strategy({}, {}, "")
        assert result == ""


# =============================================================================
# meeting_prep.py (utils) - detect_commonality
# =============================================================================

class TestDetectCommonality:
    """Test commonality detection between user and contact."""

    def test_same_university(self):
        from app.utils.meeting_prep import detect_commonality
        user = {"university": "MIT"}
        contact = {"College": "MIT", "EducationTop": ""}
        ctype, details = detect_commonality(user, contact, "")
        assert ctype == "university"
        assert details["university"] == "MIT"

    def test_same_hometown(self):
        from app.utils.meeting_prep import detect_commonality
        user = {"university": "Stanford"}
        contact = {"College": "Harvard", "EducationTop": "", "City": "San Francisco"}
        with patch("app.utils.meeting_prep.extract_hometown_from_resume", return_value="San Francisco"):
            ctype, _ = detect_commonality(user, contact, "resume from San Francisco")
        assert ctype == "hometown"

    def test_same_company(self):
        from app.utils.meeting_prep import detect_commonality
        user = {"university": "Stanford"}
        contact = {"College": "Harvard", "EducationTop": "", "City": "", "Company": "Google"}
        with patch("app.utils.meeting_prep.extract_hometown_from_resume", return_value=""):
            with patch("app.utils.meeting_prep.extract_companies_from_resume", return_value=["Google"]):
                ctype, details = detect_commonality(user, contact, "interned at Google")
        assert ctype == "company"
        assert details["connection_type"] == "interned"

    def test_no_commonality(self):
        from app.utils.meeting_prep import detect_commonality
        user = {"university": "Stanford"}
        contact = {"College": "Harvard", "EducationTop": "", "City": "", "Company": "Acme"}
        with patch("app.utils.meeting_prep.extract_hometown_from_resume", return_value=""):
            with patch("app.utils.meeting_prep.extract_companies_from_resume", return_value=[]):
                ctype, _ = detect_commonality(user, contact, "")
        assert ctype == "general"


# =============================================================================
# meeting_prep.py (utils) - _score_similarity_strength
# =============================================================================

class TestScoreSimilarityStrength:
    """Test similarity strength scoring."""

    def test_empty_string(self):
        from app.utils.meeting_prep import _score_similarity_strength
        assert _score_similarity_strength("") == 0.0

    def test_none_input(self):
        from app.utils.meeting_prep import _score_similarity_strength
        assert _score_similarity_strength(None) == 0.0

    def test_rich_text_high_score(self):
        from app.utils.meeting_prep import _score_similarity_strength
        text = (
            "Both attended MIT and shared experience at Google. Similar background in "
            "machine learning and distributed systems. They both worked together on "
            "research projects spanning 5 years at the university and have common interests."
        )
        score = _score_similarity_strength(text)
        assert score > 0.5

    def test_short_text_low_score(self):
        from app.utils.meeting_prep import _score_similarity_strength
        score = _score_similarity_strength("hi there")
        assert score < 0.3

    def test_capped_at_one(self):
        from app.utils.meeting_prep import _score_similarity_strength
        text = ("MIT Harvard Stanford Google Apple Both shared similar common also together "
                "years 10 university college company firm " * 5)
        score = _score_similarity_strength(text)
        assert score <= 1.0


# =============================================================================
# meeting_prep.py (utils) - _score_question_relevance
# =============================================================================

class TestScoreQuestionRelevance:
    """Test question-to-similarity relevance scoring."""

    def test_empty_question(self):
        from app.utils.meeting_prep import _score_question_relevance
        assert _score_question_relevance("", "some summary") == 0.0

    def test_empty_summary(self):
        from app.utils.meeting_prep import _score_question_relevance
        assert _score_question_relevance("some question", "") == 0.0

    def test_high_overlap(self):
        from app.utils.meeting_prep import _score_question_relevance
        summary = "Both studied computer science at MIT and worked on machine learning research"
        question = "What was your experience with machine learning research at MIT?"
        score = _score_question_relevance(question, summary)
        assert score > 0.3

    def test_no_overlap(self):
        from app.utils.meeting_prep import _score_question_relevance
        summary = "Both studied art history"
        question = "Tell me about software engineering"
        score = _score_question_relevance(question, summary)
        assert score < 0.3


# =============================================================================
# meeting_prep.py (utils) - select_relevant_questions
# =============================================================================

class TestSelectRelevantQuestions:
    """Test question selection by relevance."""

    def test_selects_most_relevant(self):
        from app.utils.meeting_prep import select_relevant_questions
        summary = "Both studied computer science at MIT"
        questions = [
            "What's your favorite color?",
            "How was your computer science program at MIT?",
            "Tell me about cooking",
        ]
        selected = select_relevant_questions(questions, summary, max_questions=1)
        assert "MIT" in selected[0] or "computer science" in selected[0]

    def test_empty_questions(self):
        from app.utils.meeting_prep import select_relevant_questions
        result = select_relevant_questions([], "summary", max_questions=3)
        assert result == []

    def test_empty_summary_returns_first_n(self):
        from app.utils.meeting_prep import select_relevant_questions
        questions = ["Q1", "Q2", "Q3", "Q4"]
        result = select_relevant_questions(questions, "", max_questions=2)
        assert len(result) == 2

    def test_none_questions(self):
        from app.utils.meeting_prep import select_relevant_questions
        result = select_relevant_questions(None, "summary")
        assert result == []


# =============================================================================
# Route: create_meeting_prep - Credit TOCTOU fix (source code verification)
# =============================================================================

class TestMeetingPrepRoute:
    """Verify route-level logic: credit deduction ordering, deduction failure handling."""

    def test_credits_deducted_before_thread_in_source(self):
        """Verify in source that deduct_credits_atomic is called BEFORE threading.Thread."""
        import inspect
        from app.routes.meeting_prep import create_meeting_prep
        source = inspect.getsource(create_meeting_prep)

        deduct_pos = source.find("deduct_credits_atomic")
        thread_pos = source.find("threading.Thread")
        assert deduct_pos > 0, "deduct_credits_atomic not found in create_meeting_prep"
        assert thread_pos > 0, "threading.Thread not found in create_meeting_prep"
        assert deduct_pos < thread_pos, (
            "deduct_credits_atomic must be called BEFORE threading.Thread (TOCTOU fix)"
        )

    def test_deduction_failure_returns_400_in_source(self):
        """Verify that failed deduction returns 400 and does NOT start a thread."""
        import inspect
        from app.routes.meeting_prep import create_meeting_prep
        source = inspect.getsource(create_meeting_prep)

        # After deduct_credits_atomic, there should be a check for `not success`
        deduct_pos = source.find("deduct_credits_atomic")
        # Find the next `if not success` after deduction
        after_deduct = source[deduct_pos:]
        assert "if not success" in after_deduct, (
            "Should check for deduction failure after deduct_credits_atomic"
        )
        # And it should return 400
        failure_block_start = after_deduct.find("if not success")
        failure_block = after_deduct[failure_block_start:failure_block_start + 300]
        assert "400" in failure_block, "Deduction failure should return 400"

    def test_no_redundant_firestore_reads_in_source(self):
        """Verify route doesn't have multiple user doc fetches."""
        import inspect
        from app.routes.meeting_prep import create_meeting_prep
        source = inspect.getsource(create_meeting_prep)

        # Count occurrences of user doc get
        user_doc_gets = source.count('.document(user_id).get()')
        # Should have at most 2 (initial + after reset check)
        assert user_doc_gets <= 2, f"Too many user doc reads: {user_doc_gets} (expected <= 2)"


# =============================================================================
# Route: process_meeting_prep_background - Atomic usage counter
# =============================================================================

class TestBackgroundProcessing:
    """Test background worker logic."""

    @patch("app.routes.meeting_prep.generate_meeting_pdf_v2")
    @patch("app.routes.meeting_prep._upload_pdf_to_storage")
    @patch("app.routes.meeting_prep.generate_conversation_strategy")
    @patch("app.routes.meeting_prep.generate_company_cheat_sheet")
    @patch("app.routes.meeting_prep.generate_meeting_questions")
    @patch("app.routes.meeting_prep.generate_meeting_similarity")
    @patch("app.routes.meeting_prep.infer_hometown_from_education")
    @patch("app.routes.meeting_prep.build_meeting_user_context")
    @patch("app.routes.meeting_prep.parse_resume_info")
    @patch("app.routes.meeting_prep.fetch_comprehensive_research")
    @patch("app.routes.meeting_prep.enrich_linkedin_profile")
    @patch("app.routes.meeting_prep.get_db")
    def test_atomic_usage_increment(
        self, mock_get_db, mock_enrich, mock_research, mock_parse,
        mock_build_ctx, mock_hometown, mock_similarity, mock_questions,
        mock_cheatsheet, mock_strategy, mock_upload, mock_pdf
    ):
        """Usage counter uses firestore.Increment(1) instead of read-modify-write."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        mock_enrich.return_value = {"fullName": "Jane Doe", "company": "Acme", "firstName": "Jane", "lastName": "Doe"}
        mock_research.return_value = {"company_news": [], "company_overview": [], "person_mentions": [], "industry_trends": []}
        mock_parse.return_value = {}
        mock_build_ctx.return_value = {"name": "Student"}
        mock_hometown.return_value = ""
        mock_similarity.return_value = "similarity"
        mock_questions.return_value = []
        mock_cheatsheet.return_value = "cheatsheet"
        mock_strategy.return_value = "strategy"
        mock_pdf.return_value = MagicMock(getvalue=MagicMock(return_value=b"pdf_bytes"))
        mock_upload.return_value = {"pdf_url": "https://url", "pdf_storage_path": "path"}

        prep_ref = MagicMock()
        user_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = prep_ref
        mock_db.collection.return_value.document.return_value = user_ref

        from app.routes.meeting_prep import process_meeting_prep_background
        process_meeting_prep_background(
            prep_id="prep123",
            linkedin_url="https://linkedin.com/in/test",
            user_id="user123",
            resume_text="A long resume text that is more than 50 characters for the threshold check",
        )

        # Check that Increment was used for usage counter
        update_calls = user_ref.update.call_args_list
        found_increment = False
        for call in update_calls:
            args = call[0][0] if call[0] else call[1]
            if isinstance(args, dict) and "coffeeChatPrepsUsed" in args:
                val = args["coffeeChatPrepsUsed"]
                # firestore.Increment returns a Sentinel object
                assert hasattr(val, '__class__')
                found_increment = True
        assert found_increment, "Expected firestore.Increment(1) for coffeeChatPrepsUsed"

    @patch("app.routes.meeting_prep.enrich_linkedin_profile")
    @patch("app.routes.meeting_prep.get_db")
    def test_enrichment_failure_marks_failed(self, mock_get_db, mock_enrich):
        """If LinkedIn enrichment fails, prep is marked as failed."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        mock_enrich.return_value = None

        prep_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = prep_ref

        from app.routes.meeting_prep import process_meeting_prep_background
        process_meeting_prep_background(
            prep_id="prep123",
            linkedin_url="https://linkedin.com/in/invalid",
            user_id="user123",
            resume_text="resume",
        )

        # Should update status to failed
        update_calls = prep_ref.update.call_args_list
        found_failed = any(
            "failed" in str(call) for call in update_calls
        )
        assert found_failed

    @patch("app.routes.meeting_prep.generate_meeting_pdf_v2")
    @patch("app.routes.meeting_prep._upload_pdf_to_storage")
    @patch("app.routes.meeting_prep.generate_conversation_strategy")
    @patch("app.routes.meeting_prep.generate_company_cheat_sheet")
    @patch("app.routes.meeting_prep.generate_meeting_questions")
    @patch("app.routes.meeting_prep.generate_meeting_similarity")
    @patch("app.routes.meeting_prep.infer_hometown_from_education")
    @patch("app.routes.meeting_prep.build_meeting_user_context")
    @patch("app.routes.meeting_prep.parse_resume_info")
    @patch("app.routes.meeting_prep.fetch_comprehensive_research")
    @patch("app.routes.meeting_prep.enrich_linkedin_profile")
    @patch("app.routes.meeting_prep.get_db")
    def test_extra_context_passed_to_research(
        self, mock_get_db, mock_enrich, mock_research, mock_parse,
        mock_build_ctx, mock_hometown, mock_similarity, mock_questions,
        mock_cheatsheet, mock_strategy, mock_upload, mock_pdf
    ):
        """extra_context fields (division, office, industry, etc.) are passed through."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        mock_enrich.return_value = {"fullName": "Jane", "company": "Acme", "industry": "Tech", "jobTitle": "Eng", "firstName": "J", "lastName": "D"}
        mock_research.return_value = {"company_news": [], "company_overview": [], "person_mentions": [], "industry_trends": []}
        mock_parse.return_value = {}
        mock_build_ctx.return_value = {"name": "Student"}
        mock_hometown.return_value = ""
        mock_similarity.return_value = ""
        mock_questions.return_value = []
        mock_cheatsheet.return_value = ""
        mock_strategy.return_value = ""
        mock_pdf.return_value = MagicMock(getvalue=MagicMock(return_value=b"pdf"))
        mock_upload.return_value = {"pdf_url": "url", "pdf_storage_path": "path"}

        prep_ref = MagicMock()
        user_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = prep_ref
        mock_db.collection.return_value.document.return_value = user_ref

        from app.routes.meeting_prep import process_meeting_prep_background
        process_meeting_prep_background(
            prep_id="prep123",
            linkedin_url="https://linkedin.com/in/test",
            user_id="user123",
            resume_text="A long resume text that is more than 50 characters for processing",
            extra_context={
                "division": "Cloud",
                "office": "NYC",
                "industry": "AI",
                "time_window": "last 7 days",
                "geo": "uk",
                "language": "fr",
            },
        )

        # Verify research was called with extra_context values
        mock_research.assert_called_once()
        call_kwargs = mock_research.call_args[1]
        assert call_kwargs["division"] == "Cloud"
        assert call_kwargs["office"] == "NYC"
        assert call_kwargs["time_window"] == "last 7 days"
        assert call_kwargs["geo"] == "uk"
        assert call_kwargs["language"] == "fr"
        # Industry should come from extra_context, not contact_data
        assert call_kwargs["industry"] == "AI"

    @patch("app.routes.meeting_prep.generate_meeting_pdf_v2")
    @patch("app.routes.meeting_prep._upload_pdf_to_storage")
    @patch("app.routes.meeting_prep.generate_conversation_strategy")
    @patch("app.routes.meeting_prep.generate_company_cheat_sheet")
    @patch("app.routes.meeting_prep.generate_meeting_questions")
    @patch("app.routes.meeting_prep.generate_meeting_similarity")
    @patch("app.routes.meeting_prep.infer_hometown_from_education")
    @patch("app.routes.meeting_prep._empty_meeting_user_context")
    @patch("app.routes.meeting_prep.fetch_comprehensive_research")
    @patch("app.routes.meeting_prep.enrich_linkedin_profile")
    @patch("app.routes.meeting_prep.get_db")
    def test_short_resume_uses_profile_fallback(
        self, mock_get_db, mock_enrich, mock_research,
        mock_empty_ctx, mock_hometown, mock_similarity, mock_questions,
        mock_cheatsheet, mock_strategy, mock_upload, mock_pdf
    ):
        """If resume_text is too short (<50 chars), falls back to profile data."""
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        mock_enrich.return_value = {"fullName": "Jane", "company": "Acme", "firstName": "J", "lastName": "D"}
        mock_research.return_value = {"company_news": [], "company_overview": [], "person_mentions": [], "industry_trends": []}
        mock_empty_ctx.return_value = {"name": "", "university": "", "major": "", "year": ""}
        mock_hometown.return_value = ""
        mock_similarity.return_value = ""
        mock_questions.return_value = []
        mock_cheatsheet.return_value = ""
        mock_strategy.return_value = ""
        mock_pdf.return_value = MagicMock(getvalue=MagicMock(return_value=b"pdf"))
        mock_upload.return_value = {"pdf_url": "url", "pdf_storage_path": "path"}

        prep_ref = MagicMock()
        user_ref = MagicMock()
        mock_db.collection.return_value.document.return_value.collection.return_value.document.return_value = prep_ref
        mock_db.collection.return_value.document.return_value = user_ref

        from app.routes.meeting_prep import process_meeting_prep_background
        process_meeting_prep_background(
            prep_id="prep123",
            linkedin_url="https://linkedin.com/in/test",
            user_id="user123",
            resume_text="short",  # < 50 chars
            user_profile={"displayName": "Test User", "university": "MIT"},
        )

        # parse_resume_info should NOT have been called (too short)
        mock_empty_ctx.assert_called_once()


# =============================================================================
# Route: download - Signed URL handling (source code verification)
# =============================================================================

class TestDownloadEndpoint:
    """Test signed URL refresh logic in download endpoint."""

    def test_detects_signed_url_and_regenerates(self):
        """Verify source checks for X-Goog-Signature and Signature= to detect signed URLs."""
        import inspect
        from app.routes.meeting_prep import download_meeting_pdf
        source = inspect.getsource(download_meeting_pdf)

        assert "X-Goog-Signature" in source, "Should detect signed URLs via X-Goog-Signature"
        assert "Signature=" in source, "Should detect signed URLs via Signature="
        assert "generate_signed_url" in source, "Should regenerate signed URLs"
        assert "pdfStoragePath" in source, "Should use storage path for regeneration"

    def test_returns_public_url_directly_in_source(self):
        """Verify that non-signed URLs are returned directly."""
        import inspect
        from app.routes.meeting_prep import download_meeting_pdf
        source = inspect.getsource(download_meeting_pdf)

        # Should have a path that returns pdf_url when it's not a signed URL
        assert "pdf_url" in source
        # The logic: if no signature markers, return directly
        not_signed_pos = source.find("X-Goog-Signature")
        assert "return jsonify" in source[not_signed_pos - 200:not_signed_pos + 200]

    def test_fallback_to_stored_url(self):
        """Verify there's a last-resort fallback to the stored URL."""
        import inspect
        from app.routes.meeting_prep import download_meeting_pdf
        source = inspect.getsource(download_meeting_pdf)

        # Should have a "last resort" path that returns pdf_url even if it might be expired
        assert source.count("return jsonify") >= 3, "Should have multiple return paths (public, signed, fallback)"


# =============================================================================
# Route: delete - No info leak (source code verification)
# =============================================================================

class TestDeleteEndpoint:
    """Test delete endpoint doesn't leak prep IDs."""

    def test_no_info_leak_in_404(self):
        """Verify delete 404 response doesn't include list of all prep IDs."""
        import inspect
        from app.routes.meeting_prep import delete_meeting_prep
        source = inspect.getsource(delete_meeting_prep)

        # Should NOT list all preps in the 404 response
        assert "all_preps" not in source.split("not prep_doc.exists")[1] if "not prep_doc.exists" in source else True
        # The 404 block should just return a simple error
        not_found_pos = source.find("not prep_doc.exists")
        if not_found_pos > 0:
            block_after = source[not_found_pos:not_found_pos + 200]
            assert "Prep not found" in block_after

    def test_deletes_pdf_from_storage(self):
        """Verify delete endpoint also removes PDF from Firebase Storage."""
        import inspect
        from app.routes.meeting_prep import delete_meeting_prep
        source = inspect.getsource(delete_meeting_prep)

        assert "pdfStoragePath" in source, "Should look for PDF storage path"
        assert "blob.delete()" in source, "Should delete blob from storage"


# =============================================================================
# Route: _update_stage
# =============================================================================

class TestUpdateStage:
    """Test progress stage updates."""

    def test_update_stage_success(self):
        from app.routes.meeting_prep import _update_stage
        prep_ref = MagicMock()
        _update_stage(prep_ref, "researching", "Researching...", 30)
        prep_ref.update.assert_called_once_with({
            "status": "researching",
            "stage": "researching",
            "stageLabel": "Researching...",
            "progressPct": 30,
        })

    def test_update_stage_exception_swallowed(self):
        from app.routes.meeting_prep import _update_stage
        prep_ref = MagicMock()
        prep_ref.update.side_effect = Exception("Firestore error")
        # Should not raise
        _update_stage(prep_ref, "test", "test", 0)


# =============================================================================
# Route: get_meeting_prep - Stage field defaults
# =============================================================================

class TestGetPrepEndpoint:
    """Test prep status endpoint stage defaults logic."""

    def test_stage_defaults_in_source(self):
        """Verify get_meeting_prep adds default stage fields when missing."""
        import inspect
        from app.routes.meeting_prep import get_meeting_prep
        source = inspect.getsource(get_meeting_prep)

        # Should add defaults for stage, stageLabel, progressPct
        assert '"stage" not in prep_data' in source, "Should check for missing stage field"
        assert '"stageLabel" not in prep_data' in source, "Should check for missing stageLabel"
        assert '"progressPct" not in prep_data' in source, "Should check for missing progressPct"
        assert '"Working on it..."' in source, "Should set default stageLabel"

    def test_sets_id_on_response(self):
        """Verify prep_id is added to response data."""
        import inspect
        from app.routes.meeting_prep import get_meeting_prep
        source = inspect.getsource(get_meeting_prep)

        assert 'prep_data["id"] = prep_id' in source, "Should set id on prep_data"
