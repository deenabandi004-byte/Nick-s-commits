"""
Unit tests for resolve_email_for_linkedin_import after the canonical-helper
refactor. We mock Hunter and the company-domain helper so no paid APIs are hit.

Focuses on the freshness-gate behavior:
- Fresh PDL email → returned with source='pdl'
- Stale PDL email → suppressed, falls through to Hunter
- No PDL email → goes straight to Hunter

The Hunter waterfall itself is covered by hunter.py's own tests; here we
just confirm the linkedin_import wrapper hands off the right pdl_email.
"""
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

from app.routes.linkedin_import import resolve_email_for_linkedin_import


def _iso_days_ago(n):
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


PDL_CONTACT = {
    "FirstName": "Jane",
    "LastName": "Doe",
    "Company": "Acme Corp",
    "Title": "VP",
}


def _person_data(email=None, job_last_updated_days_ago=10):
    return {
        "emails": [{"address": email, "type": "work"}] if email else [],
        "job_last_updated": _iso_days_ago(job_last_updated_days_ago),
        "experience": [],
    }


@patch("app.routes.linkedin_import.get_smart_company_domain", return_value="acme.com")
@patch("app.routes.linkedin_import.get_verified_email")
def test_fresh_pdl_email_passes_through(mock_verify, _mock_domain):
    """Fresh PDL email is handed to Hunter unchanged."""
    mock_verify.return_value = {
        "email": "jane@acme.com",
        "email_source": "pdl",
        "email_verified": True,
    }
    result = resolve_email_for_linkedin_import(
        PDL_CONTACT,
        _person_data(email="jane@acme.com", job_last_updated_days_ago=10),
    )
    assert result == {"email": "jane@acme.com", "email_source": "pdl"}
    # Confirm get_verified_email saw the PDL email (freshness gate didn't suppress it)
    assert mock_verify.call_args.kwargs["pdl_email"] == "jane@acme.com"


@patch("app.routes.linkedin_import.get_smart_company_domain", return_value="acme.com")
@patch("app.routes.linkedin_import.get_verified_email")
def test_stale_pdl_email_suppressed_for_hunter(mock_verify, _mock_domain):
    """PDL email older than _PDL_EMAIL_MAX_AGE_DAYS (180) is dropped — Hunter sees pdl_email=None."""
    mock_verify.return_value = {
        "email": "jane.doe@acme.com",
        "email_source": "hunter.io",
        "email_verified": True,
    }
    result = resolve_email_for_linkedin_import(
        PDL_CONTACT,
        _person_data(email="stale@acme.com", job_last_updated_days_ago=250),
    )
    assert result["email_source"] == "hunter.io"
    assert mock_verify.call_args.kwargs["pdl_email"] is None


@patch("app.routes.linkedin_import.get_smart_company_domain", return_value="acme.com")
@patch("app.routes.linkedin_import.get_verified_email")
def test_no_pdl_email_goes_to_hunter(mock_verify, _mock_domain):
    """No PDL email at all → Hunter gets pdl_email=None and may pattern-generate."""
    mock_verify.return_value = {
        "email": "jane.doe@acme.com",
        "email_source": "hunter.io",
        "email_verified": False,
    }
    result = resolve_email_for_linkedin_import(PDL_CONTACT, _person_data(email=None))
    assert result["email"] == "jane.doe@acme.com"
    assert mock_verify.call_args.kwargs["pdl_email"] is None


@patch("app.routes.linkedin_import.get_smart_company_domain", return_value="acme.com")
@patch("app.routes.linkedin_import.get_verified_email")
def test_hunter_returns_no_email_returns_none(mock_verify, _mock_domain):
    """When Hunter also can't find an email, the wrapper returns None (not 'Not available')."""
    mock_verify.return_value = {
        "email": "Not available",
        "email_source": None,
        "email_verified": False,
    }
    result = resolve_email_for_linkedin_import(PDL_CONTACT, _person_data(email=None))
    assert result["email"] is None
    assert result["email_source"] is None
