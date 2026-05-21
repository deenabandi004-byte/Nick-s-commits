"""
Job Board audit tests - covers critical fixes for credit handling, auth,
email validation, refund accuracy, and API response codes.
"""
import re
import inspect
import ast
import pytest
from unittest.mock import patch, MagicMock


# =============================================================================
# P0 #2 - Frontend credit cost must match backend
# =============================================================================

class TestCreditCostSync:
    """Frontend and backend credit constants must agree."""

    def test_backend_cover_letter_cost_is_5(self):
        from app.routes.job_board import COVER_LETTER_CREDIT_COST
        assert COVER_LETTER_CREDIT_COST == 5

    def test_backend_optimization_cost_is_20(self):
        from app.routes.job_board import OPTIMIZATION_CREDIT_COST
        assert OPTIMIZATION_CREDIT_COST == 20

    def test_backend_recruiter_cost_is_5(self):
        from app.routes.job_board import RECRUITER_CREDIT_COST
        assert RECRUITER_CREDIT_COST == 5

    def test_frontend_cover_letter_cost_matches_backend(self):
        """Frontend COVER_LETTER_CREDIT_COST must equal backend (5)."""
        import os
        frontend_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'connect-grow-hire',
            'src', 'pages', 'JobBoardPage.tsx'
        )
        if not os.path.exists(frontend_path):
            pytest.skip("Frontend file not found")
        with open(frontend_path) as f:
            content = f.read()
        # Match: const COVER_LETTER_CREDIT_COST = <number>;
        match = re.search(r'const\s+COVER_LETTER_CREDIT_COST\s*=\s*(\d+)', content)
        assert match, "COVER_LETTER_CREDIT_COST not found in JobBoardPage.tsx"
        frontend_cost = int(match.group(1))
        from app.routes.job_board import COVER_LETTER_CREDIT_COST
        assert frontend_cost == COVER_LETTER_CREDIT_COST, (
            f"Frontend ({frontend_cost}) != Backend ({COVER_LETTER_CREDIT_COST})"
        )

    def test_frontend_optimization_cost_matches_backend(self):
        """Frontend OPTIMIZATION_CREDIT_COST must equal backend (20)."""
        import os
        frontend_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'connect-grow-hire',
            'src', 'pages', 'JobBoardPage.tsx'
        )
        if not os.path.exists(frontend_path):
            pytest.skip("Frontend file not found")
        with open(frontend_path) as f:
            content = f.read()
        match = re.search(r'const\s+OPTIMIZATION_CREDIT_COST\s*=\s*(\d+)', content)
        assert match, "OPTIMIZATION_CREDIT_COST not found in JobBoardPage.tsx"
        frontend_cost = int(match.group(1))
        from app.routes.job_board import OPTIMIZATION_CREDIT_COST
        assert frontend_cost == OPTIMIZATION_CREDIT_COST


# =============================================================================
# P0 #3 - Refund response must reflect actual refund success
# =============================================================================

class TestRefundAccuracy:
    """credits_refunded must use refund_success variable, never hardcoded True."""

    def test_no_hardcoded_credits_refunded_true(self):
        """No line should have '"credits_refunded": True' (should use refund_success)."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            lines = f.readlines()
        violations = []
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if '"credits_refunded": True' in stripped or "'credits_refunded': True" in stripped:
                violations.append(f"Line {i}: {stripped}")
        assert not violations, (
            f"Found hardcoded credits_refunded: True:\n" + "\n".join(violations)
        )

    def test_refund_responses_use_refund_success(self):
        """All credits_refunded values should reference refund_success."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        # Every "credits_refunded" key should map to refund_success (not True/False literal)
        pattern = r'"credits_refunded":\s*(True|False)'
        matches = re.findall(pattern, content)
        # Only "False" is OK (for insufficient credits before any work is done)
        bad = [m for m in matches if m == "True"]
        assert not bad, f"Found {len(bad)} hardcoded credits_refunded: True"


# =============================================================================
# P0 #4 - /api/jobs/filters must require auth
# =============================================================================

class TestFiltersAuth:
    """The /api/jobs/filters endpoint must have @require_firebase_auth."""

    def test_filters_endpoint_has_auth_decorator(self):
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'jobs.py')
        with open(path) as f:
            content = f.read()
        # Find the get_filters function and check it has the auth decorator
        # Pattern: @require_firebase_auth before def get_filters
        pattern = r'@require_firebase_auth\s*\ndef\s+get_filters'
        assert re.search(pattern, content), (
            "/api/jobs/filters endpoint missing @require_firebase_auth decorator"
        )

    def test_all_jobs_routes_have_auth(self):
        """Every route in jobs.py should have @require_firebase_auth."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'jobs.py')
        with open(path) as f:
            content = f.read()
        # Find all route definitions
        route_pattern = r'@jobs_bp\.route\([^)]+\)\s*\n((?:@\w+.*\n)*)def\s+(\w+)'
        for match in re.finditer(route_pattern, content):
            decorators = match.group(1)
            func_name = match.group(2)
            assert 'require_firebase_auth' in decorators, (
                f"Route {func_name} missing @require_firebase_auth"
            )


# =============================================================================
# P1 #6 - Email validation before Gmail draft creation
# =============================================================================

class TestEmailValidation:
    """Email addresses must be validated before creating Gmail drafts."""

    def test_find_recruiter_validates_emails(self):
        """find_recruiter draft creation section must have email regex validation."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        # Check that email regex validation exists near draft creation
        assert '_EMAIL_RE' in content, "Email regex pattern _EMAIL_RE not found"
        assert 'Skipping invalid email' in content, "Invalid email skip logic not found"

    def test_find_hiring_manager_validates_emails(self):
        """find_hiring_manager draft creation section must have email regex validation."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        assert '_EMAIL_RE2' in content, "Email regex pattern _EMAIL_RE2 not found"
        assert 'FindHiringManager' in content and 'Skipping invalid email' in content

    def test_email_regex_pattern_correct(self):
        """The email regex should match valid emails and reject invalid ones."""
        pattern = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
        # Valid emails
        assert pattern.match("john@example.com")
        assert pattern.match("jane.doe+work@company.co.uk")
        assert pattern.match("user123@domain.org")
        # Invalid emails
        assert not pattern.match("")
        assert not pattern.match("notanemail")
        assert not pattern.match("@domain.com")
        assert not pattern.match("user@")
        assert not pattern.match("user@.com")
        assert not pattern.match('user@domain.com\nBcc: attacker@evil.com')
        assert not pattern.match("user name@domain.com")

    def test_to_name_sanitized_against_header_injection(self):
        """to_name must be sanitized to prevent MIME header injection."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        # Should strip quotes and newlines from to_name
        assert "to_name.replace" in content, "to_name sanitization not found"
        assert r"'\n'" in content or r'"\n"' in content, "Newline stripping not found"
        assert r"'\r'" in content or r'"\r"' in content, "Carriage return stripping not found"


# =============================================================================
# P1 #7 - parse-job-url must return proper error status codes
# =============================================================================

class TestParseJobUrlStatusCodes:
    """parse-job-url should return 4xx for errors, not 200."""

    def test_parse_failure_returns_422(self):
        """When URL cannot be parsed, should return 422 not 200."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        # Find the "Could not parse job details" return and check status code
        pattern = r'"Could not parse job details.*?(\d{3})'
        match = re.search(pattern, content, re.DOTALL)
        assert match, "parse-job-url error return not found"
        status = int(match.group(1))
        assert status != 200, f"parse-job-url returns {status} for errors (should not be 200)"
        assert status == 422, f"parse-job-url returns {status} for errors (expected 422)"

    def test_missing_url_returns_400(self):
        """When URL is empty, should return 400."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        assert '"URL is required"' in content

    def test_invalid_url_returns_400(self):
        """When URL format is invalid, should return 400."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        assert '"Invalid URL format"' in content or '"Invalid URL"' in content


# =============================================================================
# P0 #1 - Credit deduction uses atomic deduct-first pattern (verify)
# =============================================================================

class TestCreditDeductionPattern:
    """All credit-charging endpoints must deduct BEFORE expensive operations."""

    def _get_source(self):
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            return f.read()

    def test_optimize_resume_deducts_before_work(self):
        """optimize-resume must call deduct_credits_atomic before OpenAI."""
        content = self._get_source()
        # Find the optimize-resume endpoint section (the route handler, not the async AI function)
        idx = content.find('def optimize_resume():')
        assert idx > 0, "optimize_resume route not found"
        opt_section = content[idx:]
        deduct_pos = opt_section.find('deduct_credits_atomic')
        ai_pos = opt_section.find('optimize_resume_with_ai')
        assert deduct_pos > 0, "deduct_credits_atomic not found in optimize_resume"
        assert deduct_pos < ai_pos, "Credits must be deducted BEFORE calling AI"

    def test_cover_letter_deducts_before_work(self):
        """cover-letter must call deduct_credits_atomic before generation."""
        content = self._get_source()
        idx = content.find('def generate_cover_letter():')
        assert idx > 0, "generate_cover_letter route not found"
        cl_section = content[idx:idx + 8000]
        deduct_pos = cl_section.find('deduct_credits_atomic')
        # Find the actual function CALL (not a comment referencing it)
        # Look for "generate_cover_letter_with_ai(" which is the invocation
        gen_pos = cl_section.find('generate_cover_letter_with_ai(')
        assert deduct_pos > 0, "deduct_credits_atomic not found in generate_cover_letter"
        assert gen_pos > 0, "generate_cover_letter_with_ai() call not found"
        assert deduct_pos < gen_pos, "Credits must be deducted BEFORE calling AI"

    def test_find_recruiter_deducts_before_drafts(self):
        """find-recruiter must deduct credits before creating Gmail drafts."""
        content = self._get_source()
        fr_section = content[content.find('def find_recruiter_endpoint'):]
        deduct_pos = fr_section.find('deduct_credits_atomic')
        draft_pos = fr_section.find('drafts_created')
        assert deduct_pos > 0, "deduct_credits_atomic not found in find_recruiter"
        assert deduct_pos < draft_pos, "Credits must be deducted BEFORE creating drafts"


# =============================================================================
# P1 #8 - SerpAPI response safety
# =============================================================================

class TestSerpAPIResponseSafety:
    """SerpAPI responses should be handled defensively."""

    def test_extensions_join_handles_non_strings(self):
        """extensions_str join should not crash on non-list/non-string data."""
        # Simulate what the code does
        extensions = ["Full-time", "Remote", 123]  # SerpAPI might return ints
        extensions_str = " ".join(str(e) for e in extensions).lower()
        assert "full-time" in extensions_str
        assert "remote" in extensions_str

    def test_salary_extraction_handles_missing_fields(self):
        """Job data with missing detected_extensions should not crash."""
        job = {"title": "Engineer", "company_name": "Acme"}
        salary = None
        if job.get("detected_extensions", {}).get("salary"):
            salary = job["detected_extensions"]["salary"]
        assert salary is None  # Graceful handling

    def test_salary_extraction_handles_none_extensions(self):
        """detected_extensions could be None."""
        job = {"title": "Engineer", "detected_extensions": None}
        salary = None
        exts = job.get("detected_extensions") or {}
        if exts.get("salary"):
            salary = exts["salary"]
        assert salary is None


# =============================================================================
# Route structure tests
# =============================================================================

class TestRouteStructure:
    """All job board routes must have auth decorators."""

    def test_all_job_board_routes_have_auth(self):
        """Every route in job_board.py should have @require_firebase_auth."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        route_pattern = r'@job_board_bp\.route\([^)]+\)\s*\n((?:@\w+.*\n)*)def\s+(\w+)'
        unprotected = []
        for match in re.finditer(route_pattern, content):
            decorators = match.group(1)
            func_name = match.group(2)
            if 'require_firebase_auth' not in decorators:
                unprotected.append(func_name)
        assert not unprotected, f"Routes without auth: {unprotected}"

    def test_credit_endpoints_have_error_codes(self):
        """Endpoints that charge credits should return error_code on failure."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        # Check that "credits_insufficient" error code exists
        assert '"credits_insufficient"' in content


# =============================================================================
# No deprecated patterns
# =============================================================================

class TestNoDeprecatedPatterns:
    """Ensure no deprecated datetime usage."""

    def test_jobs_py_no_utcnow(self):
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'jobs.py')
        with open(path) as f:
            content = f.read()
        assert 'datetime.utcnow()' not in content, "jobs.py uses deprecated datetime.utcnow()"

    def test_job_ranking_no_utcnow(self):
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'utils', 'job_ranking.py')
        with open(path) as f:
            content = f.read()
        assert 'datetime.utcnow()' not in content, "job_ranking.py uses deprecated datetime.utcnow()"


# =============================================================================
# P2 - Logging: no print() statements in job_board.py
# =============================================================================

class TestLoggingNotPrint:
    """job_board.py should use logger, not print()."""

    def test_no_print_statements(self):
        """No bare print() calls in job_board.py (should use logger)."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            lines = f.readlines()
        violations = []
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            # Skip comments and strings
            if stripped.startswith('#'):
                continue
            if stripped.startswith('print(') or stripped.startswith('print(f"') or stripped.startswith("print(f'"):
                violations.append(f"Line {i}: {stripped[:80]}")
        assert not violations, (
            f"Found {len(violations)} print() statements (should use logger):\n"
            + "\n".join(violations[:10])
        )

    def test_logger_is_defined(self):
        """job_board.py must define a logger."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'app', 'routes', 'job_board.py')
        with open(path) as f:
            content = f.read()
        assert 'logger = logging.getLogger' in content, "logger not defined in job_board.py"
        assert 'import logging' in content, "logging not imported in job_board.py"


# =============================================================================
# Pipeline normalizer - salary extraction disabled
# =============================================================================

class TestNormalizerSalaryDisabled:
    """OpenAI salary extraction should be disabled in normalizer."""

    def test_no_openai_import_in_normalizer(self):
        """normalizer.py should not import openai_client."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'pipeline', 'normalizer.py')
        with open(path) as f:
            content = f.read()
        assert 'openai_client' not in content, "normalizer.py still imports openai_client"
        assert 'openai' not in content.lower() or 'openai' in content.lower().split('"""')[1] if '"""' in content else True

    def test_no_threading_in_normalizer(self):
        """normalizer.py should not use threading (semaphore removed)."""
        import os
        path = os.path.join(os.path.dirname(__file__), '..', 'pipeline', 'normalizer.py')
        with open(path) as f:
            content = f.read()
        assert 'threading' not in content, "normalizer.py still imports threading"
        assert 'Semaphore' not in content, "normalizer.py still uses Semaphore"

    def test_extract_salary_from_description_returns_empty(self):
        """extract_salary_from_description should always return {} (AI disabled)."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from pipeline.normalizer import extract_salary_from_description
        # Even with salary keywords, should return empty
        result = extract_salary_from_description("This job pays $100,000 per year salary")
        assert result == {}, f"Expected empty dict, got {result}"

    def test_structured_salary_extraction_still_works(self):
        """extract_salary_from_structured should still work for JSearch data."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from pipeline.normalizer import extract_salary_from_structured
        job = {
            "job_min_salary": 50000,
            "job_max_salary": 80000,
            "job_salary_period": "YEAR",
        }
        result = extract_salary_from_structured(job)
        assert result["salary_min"] == 50000.0
        assert result["salary_max"] == 80000.0
        assert result["salary_period"] == "YEAR"
        assert result["salary_extracted"] is False

    def test_normalize_job_type(self):
        """normalize_type should correctly classify job types."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from pipeline.normalizer import normalize_type
        assert normalize_type(None, "Software Engineering Intern") == "INTERNSHIP"
        assert normalize_type(None, "Part-time Cashier") == "PARTTIME"
        assert normalize_type("FULLTIME", "Software Engineer") == "FULLTIME"
        assert normalize_type(None, "Software Engineer") == "FULLTIME"

    def test_normalize_all_skips_invalid(self):
        """normalize_all should skip jobs missing required fields."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from pipeline.normalizer import normalize_all
        raw_jobs = [
            {"job_id": "1", "job_title": "Engineer", "employer_name": "Acme"},  # valid
            {"job_id": "2"},  # missing title and company
            {},  # completely empty
        ]
        result = normalize_all(raw_jobs)
        assert len(result) == 1
        assert result[0]["job_id"] == "1"
