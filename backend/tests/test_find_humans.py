"""
Backend integration tests for the Find the Humans feature.

Locked scope:
  1. no_parse=true skips parse_job_url
  2. no_parse=true skips extract_job_details_with_openai
  3. no_parse=true + missing company returns 400
  4. @require_tier rejects free user (403)
  5. @require_tier accepts pro and elite
  6. derive_receipts() returns title_match + location_match for matching contact
  7. Hourly rate cap blocks 21st request in one hour (429)
  8. REGRESSION: existing recruiter-search-tab path works with no no_parse and no source
"""
import os
import pytest
from unittest.mock import patch, MagicMock

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

FAKE_USER = {"uid": "test-user-id", "email": "test@example.com"}

ENDPOINT = "/api/job-board/find-recruiter"


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _user_doc(tier="pro", credits=500):
    """Build a Firestore user document snapshot for require_tier + credit checks."""
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {
        "subscriptionTier": tier,
        "tier": tier,
        "credits": credits,
        "maxCredits": 1500,
        "email": "test@example.com",
        "displayName": "Test User",
        "resumeParsed": {},
    }
    return doc


def _wire_user_db(mock_db, tier="pro", credits=500):
    """Configure a MagicMock get_db() so user lookups return the given tier."""
    user_ref = MagicMock()
    user_ref.get.return_value = _user_doc(tier=tier, credits=credits)
    mock_db.collection.return_value.document.return_value = user_ref
    return user_ref


@pytest.fixture(autouse=True)
def _bypass_firebase_auth():
    """Bypass require_firebase_auth at the firebase_admin level."""
    with patch("firebase_admin._apps", {"[DEFAULT]": MagicMock()}), \
         patch("firebase_admin.auth.verify_id_token", return_value=FAKE_USER):
        yield



@pytest.fixture
def mock_find_recruiters():
    """Patch find_recruiters to return a deterministic shape."""
    payload = {
        "recruiters": [
            {
                "FirstName": "Alice",
                "LastName": "Lee",
                "Email": "alice@stripe.com",
                "Title": "Software Engineer",
                "Company": "Stripe",
                "City": "San Francisco",
                "State": "California",
                "findHumansReceipts": [],
            }
        ],
        "emails": [],
        "job_type_detected": "engineering",
        "company_cleaned": "Stripe",
        "search_titles": ["technical recruiter"],
        "total_found": 1,
        "credits_charged": 5,
    }
    with patch("backend.app.routes.job_board.find_recruiters", return_value=payload) as m:
        yield m


@pytest.fixture
def mock_credit_helpers():
    """Patch credit-deduction helpers so the route doesn't touch real DB ops."""
    with patch("backend.app.routes.job_board.check_and_reset_credits", return_value=500), \
         patch("backend.app.routes.job_board.deduct_credits_atomic", return_value=(True, 495)):
        yield


# ===========================================================================
# 1, 2, 3 - no_parse flag behavior
# ===========================================================================

class TestNoParseFlag:

    @pytest.mark.unit
    def test_no_parse_skips_parse_job_url(self, client, mock_find_recruiters, mock_credit_helpers):
        """no_parse=true must NOT call parse_job_url even when jobUrl is present."""
        mock_db = MagicMock()
        _wire_user_db(mock_db, tier="pro")

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.parse_job_url") as mock_parse:
            resp = client.post(
                ENDPOINT,
                json={
                    "company": "Stripe",
                    "jobTitle": "Software Engineer",
                    "jobUrl": "https://stripe.com/jobs/listing/swe",
                    "no_parse": True,
                    "source": "find_humans",
                    "createDrafts": False,
                    "generateEmails": False,
                },
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 200, resp.get_json()
        mock_parse.assert_not_called()

    @pytest.mark.unit
    def test_no_parse_skips_openai_extraction(self, client, mock_find_recruiters, mock_credit_helpers):
        """no_parse=true must NOT call extract_job_details_with_openai even with a description."""
        mock_db = MagicMock()
        _wire_user_db(mock_db, tier="pro")

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.extract_job_details_with_openai") as mock_extract:
            resp = client.post(
                ENDPOINT,
                json={
                    "company": "Stripe",
                    "jobTitle": "Software Engineer",
                    "jobDescription": "We are hiring a backend engineer with Python experience.",
                    "no_parse": True,
                    "source": "find_humans",
                    "createDrafts": False,
                    "generateEmails": False,
                },
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 200, resp.get_json()
        mock_extract.assert_not_called()

    @pytest.mark.unit
    def test_no_parse_missing_company_returns_400(self, client, mock_credit_helpers):
        """no_parse=true with no company field must 400 (no parser to recover the company)."""
        mock_db = MagicMock()
        _wire_user_db(mock_db, tier="pro")

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.parse_job_url") as mock_parse, \
             patch("backend.app.routes.job_board.extract_job_details_with_openai") as mock_extract:
            resp = client.post(
                ENDPOINT,
                json={
                    "jobTitle": "Software Engineer",
                    "no_parse": True,
                    "source": "find_humans",
                    "createDrafts": False,
                    "generateEmails": False,
                },
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 400
        body = resp.get_json()
        assert "company" in body.get("error", "").lower()
        mock_parse.assert_not_called()
        mock_extract.assert_not_called()


# ===========================================================================
# 4, 5 - @require_tier
# ===========================================================================

class TestRequireTier:

    @pytest.mark.unit
    def test_free_user_rejected_with_403(self, client):
        """Free-tier users must receive 403 Upgrade required."""
        mock_db = MagicMock()
        _wire_user_db(mock_db, tier="free")

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.get_db", return_value=mock_db):
            resp = client.post(
                ENDPOINT,
                json={"company": "Stripe", "no_parse": True, "source": "find_humans"},
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 403
        body = resp.get_json()
        assert body.get("required_tier") == ["pro", "elite"]

    @pytest.mark.unit
    @pytest.mark.parametrize("tier", ["pro", "elite"])
    def test_pro_and_elite_accepted(self, client, mock_find_recruiters, mock_credit_helpers, tier):
        """Pro and Elite users are accepted (not 403)."""
        mock_db = MagicMock()
        _wire_user_db(mock_db, tier=tier)

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.get_db", return_value=mock_db):
            resp = client.post(
                ENDPOINT,
                json={
                    "company": "Stripe",
                    "jobTitle": "Software Engineer",
                    "no_parse": True,
                    "source": "find_humans",
                    "createDrafts": False,
                    "generateEmails": False,
                },
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 200, resp.get_json()
        assert resp.status_code != 403


# ===========================================================================
# 6 - derive_receipts unit test
# ===========================================================================

class TestDeriveReceipts:

    @pytest.mark.unit
    def test_returns_title_match_and_location_match_for_matching_contact(self):
        from app.services.recruiter_finder import derive_receipts

        contact = {
            "FirstName": "Alice",
            "LastName": "Lee",
            "Title": "Senior Software Engineer",
            "Company": "Stripe",
            "City": "San Francisco",
            "State": "California",
        }
        receipts = derive_receipts(
            contact,
            target_title="Software Engineer",
            target_location="San Francisco, California",
        )

        types = {r["type"] for r in receipts}
        assert "title_match" in types
        assert "location_match" in types
        for r in receipts:
            assert "label" in r and r["label"]
            assert r["strength"] in {"high", "medium", "low"}
            # Phase 1: NO href field
            assert "href" not in r

    @pytest.mark.unit
    def test_returns_empty_when_nothing_matches(self):
        from app.services.recruiter_finder import derive_receipts

        contact = {
            "Title": "Marketing Director",
            "City": "New York",
            "State": "New York",
        }
        receipts = derive_receipts(
            contact,
            target_title="Software Engineer",
            target_location="San Francisco, California",
        )
        assert receipts == []


# ===========================================================================
# 7 - per-user hourly rate cap
# ===========================================================================

class TestHourlyRateCap:

    @pytest.mark.unit
    def test_21st_request_blocked_with_429(self, client, mock_find_recruiters, mock_credit_helpers):
        """20 successful requests, 21st within an hour returns 429."""
        mock_db = MagicMock()
        _wire_user_db(mock_db, tier="pro")

        # Patch the cap helper directly: True 20 times, then False on the 21st.
        side_effects = [True] * 20 + [False]

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board._check_find_humans_hourly_cap", side_effect=side_effects):
            for i in range(20):
                resp = client.post(
                    ENDPOINT,
                    json={
                        "company": "Stripe",
                        "jobTitle": "Software Engineer",
                        "no_parse": True,
                        "source": "find_humans",
                        "createDrafts": False,
                        "generateEmails": False,
                    },
                    headers={"Authorization": "Bearer fake-token"},
                )
                assert resp.status_code == 200, f"request {i + 1} should succeed: {resp.get_json()}"

            # 21st request - capped
            resp = client.post(
                ENDPOINT,
                json={
                    "company": "Stripe",
                    "jobTitle": "Software Engineer",
                    "no_parse": True,
                    "source": "find_humans",
                    "createDrafts": False,
                    "generateEmails": False,
                },
                headers={"Authorization": "Bearer fake-token"},
            )
            assert resp.status_code == 429
            body = resp.get_json()
            assert "limit" in body.get("error", "").lower() or "limit" in body.get("message", "").lower()


# ===========================================================================
# 8 - REGRESSION: existing recruiter-search-tab path
# ===========================================================================

class TestRegressionExistingRecruiterTab:

    @pytest.mark.unit
    def test_existing_path_runs_parser_and_succeeds(self, client, mock_find_recruiters, mock_credit_helpers):
        """
        Existing recruiter-search-tab callers do NOT send no_parse or source.
        They MUST still hit parse_job_url when a jobUrl is supplied AND must
        not be blocked by the find_humans gates (feature flag, hourly cap).
        """
        mock_db = MagicMock()
        _wire_user_db(mock_db, tier="pro")

        with patch("app.extensions.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.get_db", return_value=mock_db), \
             patch("backend.app.routes.job_board.parse_job_url", return_value={
                 "company": "Stripe",
                 "title": "Software Engineer",
                 "location": "San Francisco, CA",
                 "description": "Join our team",
             }) as mock_parse, \
             patch("backend.app.routes.job_board.extract_job_details_with_openai", return_value=None), \
             patch("backend.app.routes.job_board._check_find_humans_hourly_cap") as mock_cap:
            resp = client.post(
                ENDPOINT,
                json={
                    "jobUrl": "https://stripe.com/jobs/listing/swe",
                    "createDrafts": False,
                    "generateEmails": False,
                },
                headers={"Authorization": "Bearer fake-token"},
            )

        assert resp.status_code == 200, resp.get_json()
        mock_parse.assert_called_once()
        # The hourly cap helper must NOT be invoked for non-find_humans callers.
        mock_cap.assert_not_called()

