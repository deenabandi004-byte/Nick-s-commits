"""
Phase 6 — Find Companies migration to Perplexity + Firecrawl.

Mock-based unit tests for the new discovery + enrichment pipeline. No real
Perplexity, Firecrawl, OpenAI, or Anthropic calls. See
backend/scripts/canary_find_companies.py for a one-shot live verification.

Covers:
- perplexity_client.discover_firms — JSON parsing, error handling, cache.
- firm_details_extraction._fetch_serp_results_only — URL regex, Firecrawl wiring.
- firm_details_extraction._extract_firms_batch_with_chatgpt — Firecrawl merge.
- serp_client.search_companies_with_serp — end-to-end with/without enrichment.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


def _make_perplexity_response(content: str) -> MagicMock:
    """Shape returned by `client.chat.completions.create(...)`."""
    msg = MagicMock()
    msg.content = content
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    resp.citations = []
    return resp


@pytest.fixture
def no_cache(monkeypatch):
    """Disable enrichment_cache so every call hits the patched client."""
    monkeypatch.setattr("app.services.enrichment_cache.get_cached", lambda *_a, **_k: None)
    monkeypatch.setattr("app.services.enrichment_cache.set_cached", lambda *_a, **_k: None)


# ── perplexity_client.discover_firms ─────────────────────────────────────


class TestDiscoverFirms:
    """Unit tests for the new live-search discovery function."""

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
    @patch("app.services.perplexity_client._client", None)
    def test_returns_companies_from_object_shape(self, monkeypatch, no_cache):
        fake_client = MagicMock()
        fake_client.chat.completions.create.return_value = _make_perplexity_response(json.dumps({
            "companies": [
                {"name": "CAA", "website": "https://caa.com", "employeeCount": 1800},
                {"name": "WME", "website": "https://wme.com", "employeeCount": 1500},
            ]
        }))
        monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)

        from app.services.perplexity_client import discover_firms
        result = discover_firms(
            industry="talent agencies",
            location={"locality": "Los Angeles", "region": "CA", "country": "US"},
            size="none", keywords=[], limit=2,
        )

        assert len(result) == 2
        assert result[0]["name"] == "CAA"
        assert result[1]["website"] == "https://wme.com"

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
    @patch("app.services.perplexity_client._client", None)
    def test_returns_companies_from_bare_array(self, monkeypatch, no_cache):
        """Perplexity sometimes returns a bare JSON array instead of {companies: [...]}."""
        fake_client = MagicMock()
        fake_client.chat.completions.create.return_value = _make_perplexity_response(json.dumps([
            {"name": "Stripe", "website": "https://stripe.com"},
        ]))
        monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)

        from app.services.perplexity_client import discover_firms
        result = discover_firms(industry="fintech", location={}, limit=1)

        assert len(result) == 1
        assert result[0]["name"] == "Stripe"

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
    @patch("app.services.perplexity_client._client", None)
    def test_filters_entries_without_name(self, monkeypatch, no_cache):
        fake_client = MagicMock()
        fake_client.chat.completions.create.return_value = _make_perplexity_response(json.dumps({
            "companies": [
                {"name": "CAA", "website": "https://caa.com"},
                {"website": "https://orphan.com"},  # missing name — drop
                {"name": "", "website": "https://blank.com"},  # blank name — drop
            ]
        }))
        monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)

        from app.services.perplexity_client import discover_firms
        result = discover_firms(industry="x", location={}, limit=3)

        assert len(result) == 1
        assert result[0]["name"] == "CAA"

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", None)
    def test_returns_empty_when_no_api_key(self, no_cache):
        from app.services.perplexity_client import discover_firms
        # Force re-evaluation of the module-level client
        with patch("app.services.perplexity_client._client", None):
            result = discover_firms(industry="x", location={}, limit=5)
        assert result == []

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
    @patch("app.services.perplexity_client._client", None)
    def test_returns_empty_on_api_exception(self, monkeypatch, no_cache):
        fake_client = MagicMock()
        fake_client.chat.completions.create.side_effect = RuntimeError("boom")
        monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)

        from app.services.perplexity_client import discover_firms
        result = discover_firms(industry="x", location={}, limit=5)
        assert result == []

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
    @patch("app.services.perplexity_client._client", None)
    def test_returns_empty_on_unparseable_json(self, monkeypatch, no_cache):
        fake_client = MagicMock()
        fake_client.chat.completions.create.return_value = _make_perplexity_response("not json at all")
        monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)

        from app.services.perplexity_client import discover_firms
        result = discover_firms(industry="x", location={}, limit=5)
        assert result == []

    @patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
    @patch("app.services.perplexity_client._client", None)
    def test_cache_hit_skips_api(self, monkeypatch):
        """When the cache returns a list, the API must not be called."""
        fake_client = MagicMock()
        monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)
        cached_data = [{"name": "Cached Co"}]
        monkeypatch.setattr("app.services.enrichment_cache.get_cached", lambda *_a, **_k: cached_data)

        from app.services.perplexity_client import discover_firms
        result = discover_firms(industry="x", location={}, limit=5)

        assert result == cached_data
        fake_client.chat.completions.create.assert_not_called()


# ── firm_details_extraction._fetch_serp_results_only ─────────────────────


class TestFetchFirmDetails:
    """Per-firm enrichment via Perplexity prose + Firecrawl."""

    def test_extracts_website_and_calls_firecrawl(self, monkeypatch):
        fake_perplexity = {
            "content": (
                "Stripe is a fintech company. "
                "Website: https://stripe.com — LinkedIn: https://linkedin.com/company/stripe"
            ),
            "citations": [],
        }
        fake_firecrawl = {"employee_count": 8000, "founded": 2010, "industries": ["Payments"]}
        monkeypatch.setattr("app.services.perplexity_client.pro_search", lambda *_a, **_k: fake_perplexity)
        monkeypatch.setattr(
            "app.services.firecrawl_client.extract_company_profile",
            lambda *_a, **_k: fake_firecrawl,
        )

        from app.services.firm_details_extraction import _fetch_serp_results_only
        result = _fetch_serp_results_only("Stripe", {"locality": "San Francisco"})

        assert result["firm_name"] == "Stripe"
        assert result["_website_url"] == "https://stripe.com"
        assert result["_linkedin_url"] == "https://linkedin.com/company/stripe"
        assert result["_firecrawl_data"] == fake_firecrawl
        assert "Stripe" in result["_perplexity_content"]

    def test_skips_firecrawl_when_no_website_url(self, monkeypatch):
        fake_perplexity = {
            "content": "Some firm with no parseable URL in this prose.",
            "citations": [],
        }
        firecrawl_calls = []
        monkeypatch.setattr("app.services.perplexity_client.pro_search", lambda *_a, **_k: fake_perplexity)
        monkeypatch.setattr(
            "app.services.firecrawl_client.extract_company_profile",
            lambda *a, **k: firecrawl_calls.append((a, k)) or {},
        )

        from app.services.firm_details_extraction import _fetch_serp_results_only
        result = _fetch_serp_results_only("MysteryCo", {})

        assert result["_website_url"] is None
        assert result["_firecrawl_data"] == {}
        assert firecrawl_calls == []  # Firecrawl never invoked

    def test_falls_back_to_citations_for_linkedin(self, monkeypatch):
        """When LinkedIn URL isn't in prose, look in citations."""
        fake_perplexity = {
            "content": "Acme Corp at https://acme.com — no LinkedIn in body.",
            "citations": ["https://linkedin.com/company/acme"],
        }
        monkeypatch.setattr("app.services.perplexity_client.pro_search", lambda *_a, **_k: fake_perplexity)
        monkeypatch.setattr(
            "app.services.firecrawl_client.extract_company_profile", lambda *_a, **_k: {}
        )

        from app.services.firm_details_extraction import _fetch_serp_results_only
        result = _fetch_serp_results_only("Acme", {})

        assert result["_linkedin_url"] == "https://linkedin.com/company/acme"

    def test_returns_none_when_perplexity_empty(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.perplexity_client.pro_search",
            lambda *_a, **_k: {"content": "", "citations": []},
        )

        from app.services.firm_details_extraction import _fetch_serp_results_only
        result = _fetch_serp_results_only("Ghost", {})
        assert result is None

    def test_returns_none_when_perplexity_raises(self, monkeypatch):
        def boom(*_a, **_k):
            raise RuntimeError("perplexity down")
        monkeypatch.setattr("app.services.perplexity_client.pro_search", boom)

        from app.services.firm_details_extraction import _fetch_serp_results_only
        result = _fetch_serp_results_only("Stripe", {})
        assert result is None


# ── firm_details_extraction._extract_firms_batch_with_chatgpt ────────────


class TestExtractFirmsBatch:
    """LLM batch normalization with Firecrawl merge."""

    def test_firecrawl_employee_count_overrides_llm(self, monkeypatch):
        """Firecrawl scraped the site directly — its headcount wins."""
        serp_data = [{
            "firm_name": "Stripe",
            "location": {},
            "_perplexity_content": "Stripe info...",
            "_perplexity_citations": [],
            "_website_url": "https://stripe.com",
            "_linkedin_url": None,
            "_firecrawl_data": {"employee_count": 8000, "founded": 2010, "industries": ["Payments"]},
        }]
        llm_output = json.dumps([{
            "name": "Stripe",
            "website": "https://stripe.com",
            "employeeCount": 50,  # LLM guessed wrong; Firecrawl says 8000
            "founded": None,
            "industry": None,
            "location": {"city": "San Francisco", "state": "CA", "country": "US"},
        }])
        monkeypatch.setattr(
            "app.services.firm_details_extraction._call_ai",
            lambda *_a, **_k: llm_output,
        )

        from app.services.firm_details_extraction import _extract_firms_batch_with_chatgpt
        firms = _extract_firms_batch_with_chatgpt(serp_data)

        assert len(firms) == 1
        assert firms[0]["employeeCount"] == 8000  # Firecrawl wins
        assert firms[0]["founded"] == 2010  # filled from Firecrawl
        assert firms[0]["industry"] == "Payments"  # filled from Firecrawl
        assert firms[0]["sizeBucket"] == "large"  # computed from 8000

    def test_fills_missing_urls_from_regex_matches(self, monkeypatch):
        """If the LLM omits website/linkedin, fall back to the regex-extracted URLs."""
        serp_data = [{
            "firm_name": "Acme",
            "location": {},
            "_perplexity_content": "Acme prose",
            "_perplexity_citations": [],
            "_website_url": "https://acme.com",
            "_linkedin_url": "https://linkedin.com/company/acme",
            "_firecrawl_data": {},
        }]
        # LLM returns the firm but omits both URLs
        llm_output = json.dumps([{"name": "Acme", "location": {}, "industry": "widgets"}])
        monkeypatch.setattr(
            "app.services.firm_details_extraction._call_ai",
            lambda *_a, **_k: llm_output,
        )

        from app.services.firm_details_extraction import _extract_firms_batch_with_chatgpt
        firms = _extract_firms_batch_with_chatgpt(serp_data)

        assert firms[0]["website"] == "https://acme.com"
        assert firms[0]["linkedinUrl"] == "https://linkedin.com/company/acme"

    def test_returns_minimal_dict_when_llm_returns_nothing(self, monkeypatch):
        serp_data = [{
            "firm_name": "Stripe",
            "location": {},
            "_perplexity_content": "x",
            "_perplexity_citations": [],
            "_website_url": None,
            "_linkedin_url": None,
            "_firecrawl_data": {},
        }]
        monkeypatch.setattr(
            "app.services.firm_details_extraction._call_ai",
            lambda *_a, **_k: None,
        )

        from app.services.firm_details_extraction import _extract_firms_batch_with_chatgpt
        firms = _extract_firms_batch_with_chatgpt(serp_data)

        assert firms == []  # _call_ai returning None short-circuits to empty list

    def test_computes_size_bucket_from_employee_count(self, monkeypatch):
        serp_data = [
            {"firm_name": f"Co{i}", "location": {}, "_perplexity_content": "x",
             "_perplexity_citations": [], "_website_url": None, "_linkedin_url": None,
             "_firecrawl_data": {}}
            for i in range(3)
        ]
        llm_output = json.dumps([
            {"name": "Co0", "employeeCount": 20, "location": {}},   # small
            {"name": "Co1", "employeeCount": 200, "location": {}},  # mid
            {"name": "Co2", "employeeCount": 2000, "location": {}}, # large
        ])
        monkeypatch.setattr(
            "app.services.firm_details_extraction._call_ai",
            lambda *_a, **_k: llm_output,
        )

        from app.services.firm_details_extraction import _extract_firms_batch_with_chatgpt
        firms = _extract_firms_batch_with_chatgpt(serp_data)

        assert firms[0]["sizeBucket"] == "small"
        assert firms[1]["sizeBucket"] == "mid"
        assert firms[2]["sizeBucket"] == "large"

    def test_strips_markdown_fences_from_llm_output(self, monkeypatch):
        """LLMs sometimes wrap JSON in ```json ... ``` despite being told not to."""
        serp_data = [{
            "firm_name": "Stripe", "location": {}, "_perplexity_content": "x",
            "_perplexity_citations": [], "_website_url": None, "_linkedin_url": None,
            "_firecrawl_data": {},
        }]
        fenced = '```json\n[{"name": "Stripe", "location": {}}]\n```'
        monkeypatch.setattr(
            "app.services.firm_details_extraction._call_ai",
            lambda *_a, **_k: fenced,
        )

        from app.services.firm_details_extraction import _extract_firms_batch_with_chatgpt
        firms = _extract_firms_batch_with_chatgpt(serp_data)

        assert len(firms) == 1
        assert firms[0]["name"] == "Stripe"


# ── end-to-end: serp_client.search_companies_with_serp ───────────────────


class TestSearchCompaniesEndToEnd:
    """Verify the post-Phase-5 unconditional Perplexity path."""

    def test_complete_discovery_skips_enrichment(self, monkeypatch):
        """When every discovered firm has website + employeeCount,
        get_firm_details_batch is never invoked."""
        discovered = [
            {"name": "CAA", "website": "https://caa.com",
             "linkedinUrl": "https://linkedin.com/company/caa",
             "location": {"city": "Los Angeles", "state": "CA", "country": "US"},
             "industry": "talent agency", "employeeCount": 1800,
             "sizeBucket": "large", "founded": 1995},
            {"name": "WME", "website": "https://wme.com",
             "linkedinUrl": "https://linkedin.com/company/wme",
             "location": {"city": "Beverly Hills", "state": "CA", "country": "US"},
             "industry": "talent agency", "employeeCount": 1500,
             "sizeBucket": "large", "founded": 2009},
        ]
        enrich_calls = []
        monkeypatch.setattr(
            "app.services.perplexity_client.discover_firms",
            lambda **_kw: discovered,
        )
        monkeypatch.setattr(
            "app.services.firm_details_extraction.get_firm_details_batch",
            lambda *a, **kw: enrich_calls.append((a, kw)) or [],
        )

        from app.services.serp_client import search_companies_with_serp
        result = search_companies_with_serp(
            industry="talent agencies",
            location={"locality": "Los Angeles", "region": "CA", "country": "US"},
            size="none", keywords=[], limit=2, original_query="talent agencies in LA",
        )

        assert result["success"] is True
        assert len(result["firms"]) == 2
        assert enrich_calls == []  # complete discovery → no enrichment

    def test_incomplete_discovery_triggers_enrichment_for_missing_only(self, monkeypatch):
        """Only firms missing website or employeeCount go to enrichment."""
        discovered = [
            {"name": "CAA", "website": "https://caa.com", "employeeCount": 1800,
             "location": {"city": "LA", "state": "CA", "country": "US"}},
            # incomplete — missing employeeCount → triggers enrichment
            {"name": "Gersh", "website": "https://gersh.com",
             "location": {"city": "LA", "state": "CA", "country": "US"}},
        ]
        enrich_calls = []

        def fake_enrich(firm_names, *_a, **_kw):
            enrich_calls.append(list(firm_names))
            return [{
                "name": "Gersh", "website": "https://gersh.com", "employeeCount": 100,
                "sizeBucket": "mid", "founded": 1949,
                "location": {"city": "Beverly Hills", "state": "CA", "country": "US"},
            }]

        monkeypatch.setattr(
            "app.services.perplexity_client.discover_firms", lambda **_kw: discovered
        )
        monkeypatch.setattr(
            "app.services.firm_details_extraction.get_firm_details_batch", fake_enrich
        )

        from app.services.serp_client import search_companies_with_serp
        result = search_companies_with_serp(
            industry="talent agencies",
            location={"locality": "Los Angeles", "region": "CA", "country": "US"},
            size="none", keywords=[], limit=2, original_query="talent agencies in LA",
        )

        assert result["success"] is True
        assert len(enrich_calls) == 1
        assert enrich_calls[0] == ["Gersh"]  # only the incomplete firm

    def test_empty_discovery_breaks_iteration(self, monkeypatch):
        """When Perplexity returns no firms, the loop should exit cleanly."""
        monkeypatch.setattr(
            "app.services.perplexity_client.discover_firms", lambda **_kw: []
        )

        from app.services.serp_client import search_companies_with_serp
        result = search_companies_with_serp(
            industry="impossible niche",
            location={"locality": "Nowhere", "region": "", "country": ""},
            size="none", keywords=[], limit=5, original_query="impossible niche",
        )

        # Pipeline should not crash; just return empty firms
        assert result.get("firms") == []
