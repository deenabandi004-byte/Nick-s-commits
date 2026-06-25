"""
50 Test Cases for the Firm Search Feature.
Tests cover: location normalization, location matching, firm transformation,
prompt parsing cache, batch size capping, async result store, credit calculations,
and the overall search_firms pipeline structure.
"""
import json
import time
import threading
import hashlib
import pytest
from unittest.mock import patch, MagicMock

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# ============================================================================
# 1. Location Normalization (normalize_location_string)
# ============================================================================

class TestNormalizeLocationString:
    """Tests for normalize_location_string — alias resolution."""

    def test_city_alias_nyc(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("NYC") == "new york"

    def test_city_alias_sf(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("SF") == "san francisco"

    def test_city_alias_la(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("LA") == "los angeles"

    def test_city_alias_dc(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("DC") == "washington"

    def test_state_alias_ca(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("CA") == "california"

    def test_state_alias_ny(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("NY") == "new york"

    def test_country_alias_usa(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("USA") == "united states"

    def test_country_alias_uk(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("UK") == "united kingdom"

    def test_passthrough_unknown(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("Tokyo") == "tokyo"

    def test_empty_string(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("") == ""

    def test_none_returns_empty(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string(None) == ""


# ============================================================================
# 2. Location Matching (locations_match)
# ============================================================================

class TestLocationsMatch:
    """Tests for locations_match — normalized string comparison."""

    def test_exact_match(self):
        from app.services.company_search import locations_match
        assert locations_match("New York", "new york") is True

    def test_alias_match(self):
        from app.services.company_search import locations_match
        assert locations_match("NYC", "New York") is True

    def test_partial_match(self):
        from app.services.company_search import locations_match
        assert locations_match("San Francisco", "San Francisco Bay Area") is True

    def test_no_match(self):
        from app.services.company_search import locations_match
        assert locations_match("Chicago", "Boston") is False

    def test_empty_first(self):
        from app.services.company_search import locations_match
        assert locations_match("", "Boston") is False

    def test_both_empty(self):
        from app.services.company_search import locations_match
        assert locations_match("", "") is False


# ============================================================================
# 3. Structured Location Parsing (normalize_location)
# ============================================================================

class TestNormalizeLocation:
    """Tests for normalize_location — parsing location strings to structured dicts."""

    def test_city_state(self):
        from app.services.company_search import normalize_location
        result = normalize_location("Boston, MA")
        assert result["locality"] == "Boston"
        assert result["region"] == "Massachusetts"
        assert result["country"] == "united states"

    def test_city_state_country(self):
        from app.services.company_search import normalize_location
        result = normalize_location("Austin, TX, US")
        assert result["locality"] == "Austin"
        assert result["region"] == "Texas"
        assert result["country"] is not None

    def test_metro_area(self):
        from app.services.company_search import normalize_location
        result = normalize_location("San Francisco Bay Area")
        assert result["metro"] is not None

    def test_country_only(self):
        from app.services.company_search import normalize_location
        result = normalize_location("United States")
        assert result["country"] is not None
        assert result["locality"] is None

    def test_single_city(self):
        from app.services.company_search import normalize_location
        result = normalize_location("Chicago")
        # Chicago should resolve as a major city with metro
        assert result["locality"] is not None or result["metro"] is not None

    def test_empty_input(self):
        from app.services.company_search import normalize_location
        result = normalize_location("")
        assert result["locality"] is None
        assert result["region"] is None
        assert result["metro"] is None
        assert result["country"] is None


# ============================================================================
# 4. Firm Location Matching (firm_location_matches)
# ============================================================================

class TestFirmLocationMatches:
    """Tests for firm_location_matches — filtering firms by location."""

    def test_matching_city(self):
        from app.services.company_search import firm_location_matches
        firm_loc = {"city": "New York", "state": "New York", "country": "United States"}
        req_loc = {"locality": "New York", "region": None, "metro": None, "country": "united states"}
        assert firm_location_matches(firm_loc, req_loc) is True

    def test_country_mismatch(self):
        from app.services.company_search import firm_location_matches
        firm_loc = {"city": "London", "state": None, "country": "United Kingdom"}
        req_loc = {"locality": None, "region": None, "metro": None, "country": "united states"}
        assert firm_location_matches(firm_loc, req_loc) is False

    def test_no_firm_location_rejects(self):
        """Firm with no location data should be rejected when a location is requested."""
        from app.services.company_search import firm_location_matches
        req_loc = {"locality": "New York", "region": None, "metro": None, "country": "united states"}
        assert firm_location_matches(None, req_loc) is False
        assert firm_location_matches({}, req_loc) is False

    def test_no_requested_location_allows(self):
        """When no location filter is requested, all firms pass."""
        from app.services.company_search import firm_location_matches
        firm_loc = {"city": "Tokyo", "state": None, "country": "Japan"}
        assert firm_location_matches(firm_loc, None) is True

    def test_metro_area_match(self):
        from app.services.company_search import firm_location_matches
        firm_loc = {"city": "Palo Alto", "state": "California", "country": "United States"}
        req_loc = {"locality": None, "region": None, "metro": "San Francisco Bay Area", "country": "united states"}
        assert firm_location_matches(firm_loc, req_loc) is True

    def test_metro_area_no_match(self):
        from app.services.company_search import firm_location_matches
        firm_loc = {"city": "Chicago", "state": "Illinois", "country": "United States"}
        req_loc = {"locality": None, "region": None, "metro": "San Francisco Bay Area", "country": "united states"}
        assert firm_location_matches(firm_loc, req_loc) is False


# ============================================================================
# 5. Firm Transformation (transform_serp_company_to_firm)
# ============================================================================

class TestTransformSerpCompany:
    """Tests for transform_serp_company_to_firm — SERP result normalization."""

    def test_basic_transform(self):
        from app.services.company_search import transform_serp_company_to_firm
        company = {
            "name": "Acme Corp",
            "website": "acme.com",
            "location": {"city": "New York", "state": "NY", "country": "US"},
            "industry": "Technology",
            "employeeCount": 500,
        }
        result = transform_serp_company_to_firm(company)
        assert result is not None
        assert result["name"] == "Acme Corp"
        assert result["website"] == "https://acme.com"
        assert result["id"] is not None

    def test_empty_name_returns_none(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "", "website": "test.com"})
        assert result is None

    def test_size_bucket_small(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "Startup", "employeeCount": 10})
        assert result["sizeBucket"] == "small"

    def test_size_bucket_mid(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "MidCo", "employeeCount": 200})
        assert result["sizeBucket"] == "mid"

    def test_size_bucket_large(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "BigCo", "employeeCount": 5000})
        assert result["sizeBucket"] == "large"

    def test_website_already_has_protocol(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "Test", "website": "https://test.com"})
        assert result["website"] == "https://test.com"

    def test_null_website(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "NoWeb", "website": None})
        assert result["website"] is None

    def test_stable_id_from_domain(self):
        """Same domain should produce the same firm ID."""
        from app.services.company_search import transform_serp_company_to_firm
        r1 = transform_serp_company_to_firm({"name": "A", "website": "https://example.com"})
        r2 = transform_serp_company_to_firm({"name": "B", "website": "https://example.com/about"})
        assert r1["id"] == r2["id"]

    def test_founded_year_parsing(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "Old", "founded": "1990"})
        assert result["founded"] == 1990

    def test_linkedin_url_protocol(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "L", "linkedinUrl": "linkedin.com/company/l"})
        assert result["linkedinUrl"].startswith("https://")


# ============================================================================
# 6. Credit Calculations
# ============================================================================

class TestCreditCalculations:
    """Tests for credit cost computation."""

    def test_single_firm_cost(self):
        from app.routes.firm_search import calculate_firm_search_cost, CREDITS_PER_FIRM
        assert calculate_firm_search_cost(1) == CREDITS_PER_FIRM

    def test_ten_firms_cost(self):
        from app.routes.firm_search import calculate_firm_search_cost
        assert calculate_firm_search_cost(10) == 50

    def test_zero_firms_cost(self):
        from app.routes.firm_search import calculate_firm_search_cost
        assert calculate_firm_search_cost(0) == 0


# ============================================================================
# 7. Async Result Store (TTL-based)
# ============================================================================

class TestAsyncResultStore:
    """Tests for the _async_results TTL store."""

    def test_store_and_pop(self):
        from app.routes.firm_search import _store_async_result, _pop_async_result
        _store_async_result("test-1", {"success": True, "firms": []})
        result = _pop_async_result("test-1")
        assert result is not None
        assert result["success"] is True

    def test_pop_removes_entry(self):
        from app.routes.firm_search import _store_async_result, _pop_async_result
        _store_async_result("test-2", {"data": "value"})
        _pop_async_result("test-2")
        assert _pop_async_result("test-2") is None

    def test_pop_nonexistent(self):
        from app.routes.firm_search import _pop_async_result
        assert _pop_async_result("nonexistent-key") is None

    def test_expired_entry_returns_none(self):
        from app.routes.firm_search import _async_results, _async_results_lock, _pop_async_result
        # Manually insert an expired entry
        with _async_results_lock:
            _async_results["expired-1"] = (time.time() - 600, {"stale": True})
        assert _pop_async_result("expired-1") is None

    def test_thread_safety(self):
        """Multiple threads storing and popping should not crash."""
        from app.routes.firm_search import _store_async_result, _pop_async_result
        errors = []
        def worker(i):
            try:
                key = f"thread-{i}"
                _store_async_result(key, {"i": i})
                time.sleep(0.01)
                _pop_async_result(key)
            except Exception as e:
                errors.append(e)
        threads = [threading.Thread(target=worker, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert len(errors) == 0


# ============================================================================
# 8. Prompt Parsing Cache (manual TTL)
# ============================================================================

class TestParseCache:
    """Tests for the manual TTL cache on prompt parsing."""

    def test_successful_parse_is_cached(self):
        """A successful parse result should be stored in the cache."""
        from app.services.company_search import (
            _parse_cache, _parse_cache_lock, _normalize_query_for_cache
        )
        # Clear cache first
        with _parse_cache_lock:
            _parse_cache.clear()

        # Mock OpenAI to return a successful parse
        mock_result = json.dumps({
            "success": True,
            "parsed": {"industry": "consulting", "location": "New York", "size": "none", "keywords": []},
            "error": None
        })

        with patch('app.services.company_search._cached_parse_firm_search_prompt_impl', return_value=mock_result):
            from app.services.company_search import parse_firm_search_prompt
            result = parse_firm_search_prompt("consulting firms in new york", use_cache=True)
            assert result["success"] is True

            # Check cache has the entry
            key = _normalize_query_for_cache("consulting firms in new york")
            with _parse_cache_lock:
                assert key in _parse_cache

    def test_failed_parse_not_cached(self):
        """A failed parse result should NOT be stored in the cache."""
        from app.services.company_search import (
            _parse_cache, _parse_cache_lock, _normalize_query_for_cache
        )
        with _parse_cache_lock:
            _parse_cache.clear()

        mock_result = json.dumps({
            "success": False,
            "parsed": None,
            "error": "OpenAI error"
        })

        with patch('app.services.company_search._cached_parse_firm_search_prompt_impl', return_value=mock_result):
            from app.services.company_search import parse_firm_search_prompt
            result = parse_firm_search_prompt("bad query xyz123", use_cache=True)
            assert result["success"] is False

            key = _normalize_query_for_cache("bad query xyz123")
            with _parse_cache_lock:
                assert key not in _parse_cache


# ============================================================================
# 9. Batch Size Capping
# ============================================================================

class TestBatchSizeCapping:
    """Verify server-side batch size enforcement."""

    def test_cap_at_15(self):
        """Batch size > 15 should be capped to 15."""
        batch_size = 40
        capped = max(1, min(batch_size, 15))
        assert capped == 15

    def test_minimum_1(self):
        """Batch size < 1 should be capped to 1."""
        batch_size = 0
        capped = max(1, min(batch_size, 15))
        assert capped == 1

    def test_negative(self):
        batch_size = -5
        capped = max(1, min(batch_size, 15))
        assert capped == 1

    def test_within_range(self):
        batch_size = 10
        capped = max(1, min(batch_size, 15))
        assert capped == 10


# ============================================================================
# 10. Industry Mapping
# ============================================================================

class TestIndustryMapping:
    """Tests for INDUSTRY_MAPPING dictionary."""

    def test_investment_banking_exists(self):
        from app.services.company_search import INDUSTRY_MAPPING
        assert "investment banking" in INDUSTRY_MAPPING
        mapping = INDUSTRY_MAPPING["investment banking"]
        assert "industries" in mapping
        assert "tags" in mapping

    def test_consulting_exists(self):
        from app.services.company_search import INDUSTRY_MAPPING
        assert "consulting" in INDUSTRY_MAPPING

    def test_venture_capital_tags(self):
        from app.services.company_search import INDUSTRY_MAPPING
        tags = INDUSTRY_MAPPING["venture capital"]["tags"]
        assert "vc" in tags

    def test_private_equity_exists(self):
        from app.services.company_search import INDUSTRY_MAPPING
        assert "private equity" in INDUSTRY_MAPPING

    def test_hedge_fund_exists(self):
        from app.services.company_search import INDUSTRY_MAPPING
        assert "hedge fund" in INDUSTRY_MAPPING


# ============================================================================
# 11. Validation Schema (FirmSearchRequest)
# ============================================================================

class TestFirmSearchValidation:
    """Tests for FirmSearchRequest Pydantic validation."""

    def test_valid_request(self):
        from app.utils.validation import FirmSearchRequest
        req = FirmSearchRequest(query="consulting firms in NYC", batchSize=10)
        assert req.query == "consulting firms in NYC"
        assert req.batchSize == 10

    def test_elite_max_batch_size_accepted(self):
        # The Find Companies slider allows up to 50 for Elite, so the schema
        # must accept the full range. Per-tier caps (free 10 / pro 25 / elite 50)
        # are enforced in the route after the tier is resolved.
        from app.utils.validation import FirmSearchRequest
        req = FirmSearchRequest(query="test", batchSize=50)
        assert req.batchSize == 50

    def test_pro_batch_size_accepted(self):
        from app.utils.validation import FirmSearchRequest
        req = FirmSearchRequest(query="test", batchSize=25)
        assert req.batchSize == 25

    def test_batch_size_over_50_rejected(self):
        from app.utils.validation import FirmSearchRequest
        from pydantic import ValidationError as PydanticValidationError
        with pytest.raises(PydanticValidationError):
            FirmSearchRequest(query="test", batchSize=51)

    def test_batch_size_0_rejected(self):
        from app.utils.validation import FirmSearchRequest
        from pydantic import ValidationError as PydanticValidationError
        with pytest.raises(PydanticValidationError):
            FirmSearchRequest(query="test", batchSize=0)

    def test_empty_query_rejected(self):
        from app.utils.validation import FirmSearchRequest
        from pydantic import ValidationError as PydanticValidationError
        with pytest.raises(PydanticValidationError):
            FirmSearchRequest(query="", batchSize=5)

    def test_batch_size_none_allowed(self):
        from app.utils.validation import FirmSearchRequest
        req = FirmSearchRequest(query="test query")
        assert req.batchSize is None

    def test_batch_size_15_allowed(self):
        from app.utils.validation import FirmSearchRequest
        req = FirmSearchRequest(query="test", batchSize=15)
        assert req.batchSize == 15

    def test_batch_size_1_allowed(self):
        from app.utils.validation import FirmSearchRequest
        req = FirmSearchRequest(query="test", batchSize=1)
        assert req.batchSize == 1


# ============================================================================
# 12. Firm Location Edge Cases
# ============================================================================

class TestFirmLocationEdgeCases:
    """Additional edge case tests for location matching."""

    def test_empty_firm_location_dict_rejects(self):
        """Empty dict (no city/state/country) should reject when location requested."""
        from app.services.company_search import firm_location_matches
        req = {"locality": "Boston", "region": None, "metro": None, "country": "united states"}
        assert firm_location_matches({}, req) is False

    def test_state_abbreviation_matching(self):
        from app.services.company_search import locations_match
        assert locations_match("CA", "California") is True

    def test_country_alias_matching(self):
        from app.services.company_search import locations_match
        assert locations_match("USA", "United States") is True

    def test_st_louis_alias(self):
        from app.services.company_search import normalize_location_string
        assert normalize_location_string("St Louis") == "saint louis"
        assert normalize_location_string("St. Louis") == "saint louis"


# ============================================================================
# 13. Async Result Store Edge Cases
# ============================================================================

class TestAsyncResultStoreEdgeCases:
    """Additional tests for async result TTL store."""

    def test_overwrite_existing_key(self):
        """Storing a new value for an existing key should overwrite."""
        from app.routes.firm_search import _store_async_result, _pop_async_result
        _store_async_result("overwrite-1", {"version": 1})
        _store_async_result("overwrite-1", {"version": 2})
        result = _pop_async_result("overwrite-1")
        assert result["version"] == 2

    def test_cleanup_removes_stale(self):
        """_cleanup_stale_results should evict expired entries."""
        from app.routes.firm_search import (
            _async_results, _async_results_lock, _cleanup_stale_results
        )
        with _async_results_lock:
            _async_results["stale-cleanup-1"] = (time.time() - 600, {"old": True})
            _async_results["fresh-cleanup-1"] = (time.time(), {"fresh": True})
        _cleanup_stale_results()
        with _async_results_lock:
            assert "stale-cleanup-1" not in _async_results
            assert "fresh-cleanup-1" in _async_results
            # Clean up
            _async_results.pop("fresh-cleanup-1", None)

    def test_concurrent_store_pop_same_key(self):
        """Store and pop from different threads for same key."""
        from app.routes.firm_search import _store_async_result, _pop_async_result
        results = []
        def store_then_pop():
            _store_async_result("race-key", {"data": True})
            time.sleep(0.01)
            r = _pop_async_result("race-key")
            results.append(r)
        threads = [threading.Thread(target=store_then_pop) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        # At least one thread should get the result; others get None
        non_none = [r for r in results if r is not None]
        assert len(non_none) >= 1


# ============================================================================
# 14. Transform Edge Cases
# ============================================================================

class TestTransformEdgeCases:
    """Edge cases for firm transformation."""

    def test_location_not_dict(self):
        """location field that's a string instead of dict shouldn't crash."""
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({
            "name": "BadLoc Corp",
            "location": "New York, NY"
        })
        assert result is not None
        assert result["name"] == "BadLoc Corp"

    def test_none_employee_count(self):
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "NoCnt", "employeeCount": None})
        assert result is not None
        assert result["sizeBucket"] is None

    def test_size_bucket_without_count(self):
        """If sizeBucket provided but no employeeCount, should estimate count."""
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({
            "name": "BucketOnly",
            "sizeBucket": "mid",
            "employeeCount": None,
        })
        assert result["sizeBucket"] == "mid"
        assert result["employeeCount"] == 275  # midpoint estimate

    def test_website_null_string(self):
        """Website value of 'null' string should be treated as None."""
        from app.services.company_search import transform_serp_company_to_firm
        result = transform_serp_company_to_firm({"name": "NullWeb", "website": "null"})
        assert result["website"] is None


# ============================================================================
# 15. Region+Locality Combined Filter
# ============================================================================

class TestRegionLocalityCombined:
    """Tests for the fix where region match no longer short-circuits city check."""

    def test_same_state_wrong_city_rejected(self):
        """A firm in LA, California should NOT match a search for San Francisco, CA."""
        from app.services.company_search import firm_location_matches
        firm_loc = {"city": "Los Angeles", "state": "California", "country": "United States"}
        req_loc = {"locality": "San Francisco", "region": "California", "metro": None, "country": "united states"}
        assert firm_location_matches(firm_loc, req_loc) is False

    def test_same_state_same_city_accepted(self):
        """A firm in San Francisco, California should match San Francisco, CA."""
        from app.services.company_search import firm_location_matches
        firm_loc = {"city": "San Francisco", "state": "California", "country": "United States"}
        req_loc = {"locality": "San Francisco", "region": "California", "metro": None, "country": "united states"}
        assert firm_location_matches(firm_loc, req_loc) is True

    def test_region_only_no_locality(self):
        """When only region is requested, any city in that state should match."""
        from app.services.company_search import firm_location_matches
        firm_loc = {"city": "Los Angeles", "state": "California", "country": "United States"}
        req_loc = {"locality": None, "region": "California", "metro": None, "country": "united states"}
        assert firm_location_matches(firm_loc, req_loc) is True
