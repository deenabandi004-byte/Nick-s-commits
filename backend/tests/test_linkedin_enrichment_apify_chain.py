"""Tests for the Apify-first user-LinkedIn enrichment chain (D9).

Two layers covered:
  1. get_enrichment_tiers(prefer_scrape=True) composition: user-LinkedIn
     onboarding is Apify -> PDL; contact-search (prefer_scrape=False) is
     unchanged.
  2. The _try_apify wrapper around enrich_user_linkedin_profile_via_apify,
     covering happy path and every envelope.ok=False shape.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.utils.linkedin_enrichment import (
    _try_apify,
    _try_brightdata,
    _try_pdl,
    get_enrichment_tiers,
)


# ---------------------------------------------------------------------------
# Chain composition
# ---------------------------------------------------------------------------

def test_user_onboarding_chain_is_apify_then_pdl():
    """prefer_scrape=True: user-LinkedIn onboarding uses Apify -> PDL only.
    Firecrawl is policy-blocked from LinkedIn; Bright Data was expensive
    and broken — both removed from this path."""
    chain = get_enrichment_tiers(prefer_scrape=True)
    assert chain == [_try_apify, _try_pdl]


def test_contact_search_chain_is_pdl_then_brightdata():
    """prefer_scrape=False is the contact-enrichment path. Stays on
    PDL -> Bright Data (the Apify swap is for user-onboarding only)."""
    chain = get_enrichment_tiers(prefer_scrape=False)
    assert chain == [_try_pdl, _try_brightdata]


# ---------------------------------------------------------------------------
# _try_apify wrapper
# ---------------------------------------------------------------------------

def test_try_apify_passes_through_happy_envelope():
    """When the Apify client returns ok=True, the tier returns the raw data
    and a fixed source string of 'apify' that llm_enrich_profile routes on."""
    happy_envelope = {
        "ok": True,
        "source": "apify",
        "actor": "harvestapi~linkedin-profile",
        "data": {"name": "Test User", "education": [{"school": "USC"}]},
    }
    with patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=happy_envelope,
    ):
        raw, source = _try_apify("https://linkedin.com/in/test")

    assert source == "apify"
    assert raw == happy_envelope["data"]


@pytest.mark.parametrize(
    "envelope_error",
    [
        "bad_url",
        "no_api_key",
        "http_429",
        "http_500",
        "timeout",
        "no_data",
        "bad_shape",
    ],
)
def test_try_apify_returns_no_source_on_envelope_failure(envelope_error):
    """Every Apify envelope failure mode must fall through cleanly to PDL —
    the tier loop in enrichment.py treats source=='' as 'skip this tier'."""
    failure_envelope = {
        "ok": False,
        "source": f"apify_{envelope_error}",
        "actor": "harvestapi~linkedin-profile",
        "data": None,
        "error": envelope_error,
    }
    with patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=failure_envelope,
    ):
        raw, source = _try_apify("https://linkedin.com/in/test")

    assert raw is None
    assert source == ""


def test_try_apify_swallows_unexpected_exceptions():
    """Onboarding is on the critical signup path; this wrapper must never
    propagate an exception even if the underlying client misbehaves."""
    with patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        side_effect=RuntimeError("client exploded"),
    ):
        raw, source = _try_apify("https://linkedin.com/in/test")

    assert raw is None
    assert source == ""
