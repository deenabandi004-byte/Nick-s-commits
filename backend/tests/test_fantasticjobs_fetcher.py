"""
Tests for the Fantastic.jobs (RapidAPI active-jobs-db) fetcher.
"""
import os
import pytest
from unittest.mock import patch, MagicMock


# =============================================================================
# Fetcher unit tests
# =============================================================================

class TestFantasticjobsGating:
    """fetch_fantasticjobs() must be gated behind RAPIDAPI_KEY."""

    def test_skips_when_no_api_key(self):
        from pipeline.fetcher import fetch_fantasticjobs
        with patch.dict(os.environ, {}, clear=True):
            # Remove RAPIDAPI_KEY if present
            os.environ.pop("RAPIDAPI_KEY", None)
            result = fetch_fantasticjobs()
        assert result == []

    def test_returns_jobs_when_key_present(self):
        """With a key set, the function attempts API calls (mocked)."""
        from pipeline.fetcher import fetch_fantasticjobs
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = []

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test-key"}):
            with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
                result = fetch_fantasticjobs()
        assert isinstance(result, list)


class TestFantasticjobsCallConfig:
    """Category calls must be configured correctly."""

    def test_has_10_calls(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        assert len(FANTASTICJOBS_CALLS) == 10

    def test_call_labels_unique(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        labels = [label for label, _ in FANTASTICJOBS_CALLS]
        assert len(labels) == len(set(labels))

    def test_ib_summer_analyst_org_filter(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        orgs = calls["ib_summer_analyst"]["organization_filter"]
        assert "Goldman Sachs" in orgs
        assert "JPMorgan Chase & Co." in orgs
        assert "Morgan Stanley" in orgs
        assert "Evercore" in orgs

    def test_consulting_summer_org_filter(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        orgs = calls["consulting_summer"]["organization_filter"]
        assert "McKinsey & Company" in orgs
        assert "Boston Consulting Group" in orgs
        assert "Deloitte" in orgs

    def test_quant_intern_org_filter(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        orgs = calls["quant_intern"]["organization_filter"]
        assert "Citadel" in orgs
        assert "Jane Street" in orgs
        assert "Two Sigma" in orgs

    def test_tech_intern_uses_advanced_title_filter(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        params = calls["tech_intern"]
        # Advanced filter must include intern keyword cluster + tech-role cluster
        assert "advanced_title_filter" in params
        assert "title_filter" not in params  # mutually exclusive per FJ docs
        assert "Intern" in params["advanced_title_filter"]
        assert "Software Engineer" in params["advanced_title_filter"]
        assert params["ai_employment_type_filter"] == "INTERN"
        assert params["ai_experience_level_filter"] == "0-2"

    def test_visa_sponsoring_intern_filter(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        params = calls["visa_sponsoring_intern"]
        assert params["ai_visa_sponsorship_filter"] == "true"
        assert params["ai_employment_type_filter"] == "INTERN"

    def test_year_coded_analyst_covers_both_cohorts(self):
        from pipeline.fetcher import FANTASTICJOBS_CALLS
        calls = {label: params for label, params in FANTASTICJOBS_CALLS}
        f = calls["year_coded_analyst"]["advanced_title_filter"]
        assert "2026" in f and "2027" in f

    def test_uses_7d_endpoint(self):
        from pipeline.fetcher import FANTASTICJOBS_BASE_URL
        assert "active-ats-7d" in FANTASTICJOBS_BASE_URL


class TestFantasticjobsNormalization:
    """Job data normalization from Fantastic.jobs format."""

    def test_normalize_fj_job_basic(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {
            "id": "abc123",
            "title": "Software Engineer",
            "organization": "Goldman Sachs",
            "organization_logo": "https://example.com/logo.png",
            "url": "https://example.com/apply",
            "description": "Build things" * 100,
            "date_posted": "2025-01-15",
            "remote_derived": False,
            "locations_derived": [{"city": "New York", "state": "NY"}],
        }
        result = _normalize_fj_job(raw)
        assert result["job_id"] == "fantasticjobs_abc123"
        assert result["source"] == "fantasticjobs"
        assert result["title"] == "Software Engineer"
        assert result["company"] == "Goldman Sachs"
        assert result["employer_logo"] == "https://example.com/logo.png"
        assert result["location"] == "New York, NY"
        assert result["remote"] is False
        assert result["apply_url"] == "https://example.com/apply"
        assert result["posted_at"] == "2025-01-15"
        assert result["salary_min"] is None
        assert result["salary_max"] is None
        assert result["salary_period"] is None

    def test_normalize_fj_job_remote(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {
            "id": "remote1",
            "title": "Remote Dev",
            "organization": "Acme",
            "url": "",
            "remote_derived": True,
        }
        result = _normalize_fj_job(raw)
        assert result["remote"] is True

    def test_normalize_fj_job_fallback_location(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {
            "id": "no-loc",
            "title": "Analyst",
            "organization": "Acme",
            "url": "",
            "locations_derived": [],
            "locations_raw": [{"address": "123 Main St, Chicago, IL"}],
        }
        result = _normalize_fj_job(raw)
        assert result["location"] == "123 Main St, Chicago, IL"

    def test_normalize_fj_job_no_location(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {"id": "x", "title": "Analyst", "organization": "Acme", "url": ""}
        result = _normalize_fj_job(raw)
        assert result["location"] == "United States"

    def test_description_truncated_to_8000(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = {
            "id": "long",
            "title": "Dev",
            "organization": "Acme",
            "url": "",
            "description": "x" * 10000,
        }
        result = _normalize_fj_job(raw)
        assert len(result["description_raw"]) == 8000


class TestFantasticjobsHeaders:
    """API headers must be correct."""

    def test_headers_structure(self):
        from pipeline.fetcher import _fantasticjobs_headers
        with patch.dict(os.environ, {"RAPIDAPI_KEY": "my-key-123"}):
            headers = _fantasticjobs_headers()
        assert headers["x-rapidapi-key"] == "my-key-123"
        assert headers["x-rapidapi-host"] == "active-jobs-db.p.rapidapi.com"


class TestFantasticjobsDedup:
    """Deduplication of overlapping category results."""

    def test_dedup_removes_duplicates(self):
        from pipeline.fetcher import fetch_fantasticjobs
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        # Return same job from multiple category calls
        mock_resp.json.return_value = [
            {"id": "dup1", "title": "Intern", "organization": "Goldman Sachs", "url": ""},
        ]

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test"}):
            with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
                result = fetch_fantasticjobs()

        # Should have only 1 copy despite being returned by multiple calls
        ids = [j["job_id"] for j in result]
        assert ids.count("fantasticjobs_dup1") == 1


class TestFantasticjobsErrorHandling:
    """API errors should be handled gracefully."""

    def test_fetch_page_handles_http_error(self):
        from pipeline.fetcher import _fj_fetch_page
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.raise_for_status.side_effect = Exception("500 Server Error")

        with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
            result = _fj_fetch_page({"limit": "100"}, "test")
        assert result == []

    def test_skips_jobs_without_id(self):
        """Jobs missing 'id' field should be skipped."""
        from pipeline.fetcher import _fj_fetch_page
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = [
            {"id": "valid1", "title": "Engineer", "organization": "Acme", "url": ""},
            {"title": "No ID Job", "organization": "Acme", "url": ""},  # missing id
            {"id": "valid2", "title": "Analyst", "organization": "Acme", "url": ""},
        ]

        with patch("pipeline.fetcher.requests.get", return_value=mock_resp):
            result = _fj_fetch_page({"limit": "100"}, "test")
        assert len(result) == 2


class TestFetchJobsIntegration:
    """fetch_jobs() must include Fantastic.jobs."""

    def test_fetch_jobs_calls_fantasticjobs(self):
        """fetch_jobs() should call fetch_fantasticjobs."""
        import inspect
        from pipeline.fetcher import fetch_jobs
        source = inspect.getsource(fetch_jobs)
        assert "fetch_fantasticjobs" in source

    def test_fetch_jobs_has_5_workers(self):
        """ThreadPoolExecutor should have 5 workers (Greenhouse, Lever, Ashby, Simplify, Fantastic.jobs)."""
        import inspect
        from pipeline.fetcher import fetch_jobs
        source = inspect.getsource(fetch_jobs)
        assert "max_workers=5" in source


class TestNormalizerRecognizesSource:
    """Normalizer must route fantasticjobs to _normalize_board_job."""

    def test_fantasticjobs_in_board_sources(self):
        import inspect
        from pipeline.normalizer import normalize_job
        source = inspect.getsource(normalize_job)
        assert '"fantasticjobs"' in source

    def test_fantasticjobs_normalizes_correctly(self):
        from pipeline.normalizer import normalize_job
        raw = {
            "source": "fantasticjobs",
            "job_id": "fantasticjobs_abc",
            "title": "Analyst",
            "company": "Goldman Sachs",
            "location": "New York, NY",
            "remote": False,
            "description_raw": "Analyze things",
            "apply_url": "https://example.com",
            "posted_at": "2025-06-01T00:00:00+00:00",
            "salary_min": None,
            "salary_max": None,
            "salary_period": None,
        }
        result = normalize_job(raw)
        assert result is not None
        assert result["job_id"] == "fantasticjobs_abc"
        assert result["source"] == "fantasticjobs"
        assert result["company"] == "Goldman Sachs"


class TestFantasticjobsAIFieldCapture:
    """include_ai=true / include_li=true field plumbing through fetcher + normalizer."""

    def _sample_raw(self):
        return {
            "id": "xyz789",
            "title": "Software Engineer Intern",
            "organization": "Stripe",
            "organization_logo": "https://logo",
            "url": "https://stripe.com/jobs/123",
            "date_posted": "2026-05-20T12:00:00+00:00",
            "date_created": "2026-05-20T13:00:00+00:00",
            "date_validthrough": None,
            "description_text": "Build payment systems. Pursuing a Bachelor's in CS.",
            "remote_derived": False,
            "locations_derived": [{"city": "San Francisco", "state": "California"}],
            "source": "greenhouse",
            "source_type": "ats",
            "source_domain": "boards.greenhouse.io",
            # AI fields
            "ai_salary_minvalue": 50,
            "ai_salary_maxvalue": 60,
            "ai_salary_unittext": "HOUR",
            "ai_salary_currency": "USD",
            "ai_experience_level": "0-2",
            "ai_employment_type": ["INTERN"],
            "ai_work_arrangement": "Hybrid",
            "ai_work_arrangement_office_days": 3,
            "ai_visa_sponsorship": True,
            "ai_keywords": ["python", "rust", "payments"],
            "ai_key_skills": ["Python", "Distributed Systems"],
            "ai_education_requirements": ["bachelor degree"],
            "ai_hiring_manager_name": "Jane Doe",
            "ai_hiring_manager_email_address": "jane@stripe.com",
            "ai_core_responsibilities": "Build APIs. Ship code.",
            "ai_requirements_summary": "CS major. Python.",
            "ai_taxonomies_a": ["Software", "Technology"],
            "ai_job_language": "en",
            # LI fields
            "linkedin_id": "4012345",
            "linkedin_org_slug": "stripe",
            "linkedin_org_industry": "Financial Services",
            "linkedin_org_employees": 8000,
            "linkedin_org_size": "5001-10000",
            "linkedin_org_specialties": ["payments", "fintech"],
            "linkedin_org_followers": 500000,
            "linkedin_org_headquarters": "South San Francisco",
            "linkedin_org_recruitment_agency_derived": False,
        }

    def test_fetcher_captures_ai_and_li_fields(self):
        from pipeline.fetcher import _normalize_fj_job
        out = _normalize_fj_job(self._sample_raw())
        assert out["salary_min"] == 50.0
        assert out["salary_max"] == 60.0
        assert out["salary_period"] == "HOUR"
        assert out["salary_currency"] == "USD"
        assert out["ai_experience_level"] == "0-2"
        assert out["ai_employment_type"] == "INTERN"
        assert out["ai_employment_types"] == ["INTERN"]
        assert out["ai_work_arrangement"] == "Hybrid"
        assert out["ai_visa_sponsorship"] is True
        assert out["ai_has_salary"] is True
        assert out["ai_hiring_manager_email"] == "jane@stripe.com"
        assert out["ai_education_requirements"] == ["bachelor degree"]
        assert out["ai_taxonomy_primary"] == "Software"
        assert out["linkedin_org_slug"] == "stripe"
        assert out["linkedin_org_employees"] == 8000
        assert out["linkedin_org_recruitment_agency"] is False
        assert out["ats_platform"] == "greenhouse"
        assert out["ats_source_type"] == "ats"
        assert out["description_raw"].startswith("Build payment")

    def test_normalizer_passes_through_ai_and_li_fields(self):
        from pipeline.fetcher import _normalize_fj_job
        from pipeline.normalizer import normalize_job
        raw = _normalize_fj_job(self._sample_raw())
        doc = normalize_job(raw)
        assert doc is not None
        # Salary should be populated from AI fields without keyword scan fallback
        assert doc["salary_min"] == 50.0
        assert doc["salary_period"] == "HOUR"
        assert doc["salary_extracted"] is False
        # All advanced fields should reach the Firestore doc
        for field in (
            "ai_experience_level", "ai_employment_type", "ai_work_arrangement",
            "ai_visa_sponsorship", "ai_has_salary", "ai_keywords",
            "ai_education_requirements", "ai_hiring_manager_email",
            "ai_taxonomy_primary", "linkedin_org_industry",
            "linkedin_org_employees", "linkedin_org_slug",
            "linkedin_org_recruitment_agency", "ats_platform",
        ):
            assert field in doc, f"missing {field} in normalized doc"

    def test_single_ai_salary_value_fills_both_min_and_max(self):
        from pipeline.fetcher import _normalize_fj_job
        raw = self._sample_raw()
        raw["ai_salary_minvalue"] = None
        raw["ai_salary_maxvalue"] = None
        raw["ai_salary_value"] = 120000
        raw["ai_salary_unittext"] = "YEAR"
        out = _normalize_fj_job(raw)
        assert out["salary_min"] == 120000.0
        assert out["salary_max"] == 120000.0
        assert out["salary_period"] == "YEAR"

    def test_default_params_include_ai_and_li(self):
        from pipeline.fetcher import FANTASTICJOBS_DEFAULT_PARAMS
        assert FANTASTICJOBS_DEFAULT_PARAMS["include_ai"] == "true"
        assert FANTASTICJOBS_DEFAULT_PARAMS["include_li"] == "true"
        assert FANTASTICJOBS_DEFAULT_PARAMS["description_type"] == "text"

    def test_endpoint_is_7d(self):
        from pipeline.fetcher import FANTASTICJOBS_BASE_URL
        assert FANTASTICJOBS_BASE_URL.endswith("/active-ats-7d")

    def test_ratelimit_headers_captured(self):
        from pipeline.fetcher import _capture_ratelimit, _FJ_RATELIMIT_SNAPSHOT
        mock_resp = MagicMock()
        mock_resp.headers = {
            "x-ratelimit-jobs-remaining": "19500",
            "x-ratelimit-jobs-limit": "20000",
            "x-ratelimit-requests-remaining": "19950",
            "x-ratelimit-jobs-reset": "2505077",
        }
        _capture_ratelimit(mock_resp)
        assert _FJ_RATELIMIT_SNAPSHOT["x-ratelimit-jobs-remaining"] == "19500"
        assert _FJ_RATELIMIT_SNAPSHOT["x-ratelimit-jobs-limit"] == "20000"


class TestFantasticjobsModified:
    """fetch_fantasticjobs_modified hits the /modified-ats-24h delta endpoint."""

    def test_endpoint_constant_is_modified_24h(self):
        from pipeline.fetcher import FANTASTICJOBS_MODIFIED_URL
        assert FANTASTICJOBS_MODIFIED_URL.endswith("/modified-ats-24h")

    def test_uses_modified_url_and_limit_500(self):
        from pipeline.fetcher import fetch_fantasticjobs_modified, FANTASTICJOBS_MODIFIED_URL

        captured_calls = []

        def fake_get(url, headers=None, params=None, timeout=None):
            captured_calls.append((url, params))
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            resp.raise_for_status = MagicMock()
            resp.json.return_value = []
            return resp

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test-key"}):
            with patch("pipeline.fetcher.requests.get", side_effect=fake_get):
                with patch("pipeline.fetcher.time.sleep"):  # skip 1.5s waits
                    fetch_fantasticjobs_modified()

        # Every call must hit the modified URL with limit=500
        assert len(captured_calls) >= 1
        for url, params in captured_calls:
            assert url == FANTASTICJOBS_MODIFIED_URL
            assert params["limit"] == "500"
            assert params["agency"] == "false"
            assert params["include_ai"] == "true"

    def test_returns_normalized_jobs_with_ai_fields(self):
        from pipeline.fetcher import fetch_fantasticjobs_modified
        sample = {
            "id": "mod123",
            "title": "Data Engineer Intern",
            "organization": "Snowflake",
            "url": "https://snowflake.com/jobs/mod123",
            "description_text": "Build data pipelines. " * 10,
            "date_posted": "2026-05-28T00:00:00+00:00",
            "ai_experience_level": "0-2",
            "ai_employment_type": "INTERN",
            "ai_visa_sponsorship": True,
        }

        def fake_get(url, headers=None, params=None, timeout=None):
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            resp.raise_for_status = MagicMock()
            resp.json.return_value = [sample]
            return resp

        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test-key"}):
            with patch("pipeline.fetcher.requests.get", side_effect=fake_get):
                with patch("pipeline.fetcher.time.sleep"):
                    out = fetch_fantasticjobs_modified()
        # 10 recipes × same sample → after dedup, just 1 unique
        assert len(out) == 1
        assert out[0]["job_id"] == "fantasticjobs_mod123"
        assert out[0]["ai_experience_level"] == "0-2"


class TestFantasticjobsExpired:
    """fetch_expired_job_ids hits /active-ats-expired with no params."""

    def test_endpoint_constant_is_expired(self):
        from pipeline.fetcher import FANTASTICJOBS_EXPIRED_URL
        assert FANTASTICJOBS_EXPIRED_URL.endswith("/active-ats-expired")

    def test_returns_id_list_from_bare_array(self):
        from pipeline.fetcher import fetch_expired_job_ids
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {}
        resp.raise_for_status = MagicMock()
        resp.json.return_value = ["abc", "def", "ghi"]
        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test-key"}):
            with patch("pipeline.fetcher.requests.get", return_value=resp):
                ids = fetch_expired_job_ids()
        assert ids == ["abc", "def", "ghi"]

    def test_handles_wrapped_data_envelope(self):
        from pipeline.fetcher import fetch_expired_job_ids
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {}
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {"data": ["x", "y"]}
        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test-key"}):
            with patch("pipeline.fetcher.requests.get", return_value=resp):
                ids = fetch_expired_job_ids()
        assert ids == ["x", "y"]

    def test_handles_dict_entries(self):
        from pipeline.fetcher import fetch_expired_job_ids
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {}
        resp.raise_for_status = MagicMock()
        resp.json.return_value = [{"id": "j1"}, {"id": "j2"}]
        with patch.dict(os.environ, {"RAPIDAPI_KEY": "test-key"}):
            with patch("pipeline.fetcher.requests.get", return_value=resp):
                ids = fetch_expired_job_ids()
        assert ids == ["j1", "j2"]

    def test_skipped_without_api_key(self):
        from pipeline.fetcher import fetch_expired_job_ids
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("RAPIDAPI_KEY", None)
            ids = fetch_expired_job_ids()
        assert ids == []
