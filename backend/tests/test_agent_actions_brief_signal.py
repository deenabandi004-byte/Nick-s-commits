"""
Regression tests for `execute_find_and_draft` — confirms the parsed brief's
signal actually reaches PDL.

Before fix #2, `briefParsed.industries` was silently dropped when building
the PDL `parsed_prompt`. A Loop like "PMs at Stripe about breaking into
fintech" would query PDL with company=Stripe + title=PM and lose the
fintech narrowing entirely. These tests lock the wiring in place so future
refactors can't quietly regress it.
"""
from __future__ import annotations

import os
from unittest.mock import patch, MagicMock

import pytest

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services.agent_actions import execute_find_and_draft


@pytest.fixture
def captured_search_calls(monkeypatch):
    """Capture every `parsed_prompt` passed to `search_contacts_from_prompt`,
    returning empty results so `execute_find_and_draft` hits its early
    return path and skips email-gen / Firestore writes."""
    calls: list[dict] = []

    def fake_search(parsed_prompt, max_contacts, exclude_keys=None, user_profile=None):
        calls.append(dict(parsed_prompt))
        # (filtered_list, retry_level, already_saved, adjacency_metadata)
        return ([], 0, [], {})

    monkeypatch.setattr(
        "app.services.agent_actions.search_contacts_from_prompt",
        fake_search,
    )

    # The function reads from Firestore for exclusion sets — short-circuit
    # the db call so we don't need a live client.
    monkeypatch.setattr(
        "app.services.agent_actions._build_exclusion_sets",
        lambda uid, db: {"identity_set": set(), "email_set": set()},
    )
    monkeypatch.setattr(
        "app.services.agent_actions.get_db",
        lambda: MagicMock(),
    )

    return calls


def _run(config_overrides=None, action_overrides=None):
    """Drive execute_find_and_draft with a minimal Stripe-PMs-fintech brief."""
    config = {
        "briefText": "I want to chat with PMs at Stripe about breaking into fintech.",
        "briefParsed": {
            "companies": ["Stripe"],
            "roles": ["Product Manager"],
            "industries": ["fintech"],
            "locations": ["New York"],
        },
        "targetCompanies": ["Stripe"],
        "targetIndustries": ["fintech"],
        "targetRoles": ["Product Manager"],
        "targetLocations": ["New York"],
        "preferAlumni": True,
    }
    config.update(config_overrides or {})
    action = {
        "type": "find",
        "company": "Stripe",
        "title": "Product Manager",
        "count": 3,
    }
    action.update(action_overrides or {})
    user_data = {
        "email": "deena@example.com",
        "professionalInfo": {"university": "University of Southern California"},
    }
    return execute_find_and_draft(
        uid="test-uid",
        action=action,
        config=config,
        user_data=user_data,
    )


class TestBriefSignalReachesPdl:
    def test_industries_land_in_parsed_prompt(self, captured_search_calls):
        """briefParsed.industries (via config.targetIndustries) must show up
        in the parsed_prompt PDL receives. This is the headline fix #2."""
        _run()
        assert captured_search_calls, "search_contacts_from_prompt was not called"
        first = captured_search_calls[0]
        assert first.get("industries") == ["fintech"], (
            f"expected industries=['fintech'] in the first PDL call, "
            f"got {first.get('industries')}"
        )

    def test_locations_still_land(self, captured_search_calls):
        """Sanity: locations (already worked pre-fix) keep working alongside
        the new industries plumbing."""
        _run()
        first = captured_search_calls[0]
        assert first.get("locations") == ["New York"]

    def test_alumni_school_still_lands(self, captured_search_calls):
        """Sanity: schools (already worked pre-fix) keep working."""
        _run()
        first = captured_search_calls[0]
        assert first.get("schools") == ["University of Southern California"]

    def test_industries_capped_at_5(self, captured_search_calls):
        """Defensive cap — a manually-edited brief with 10 industries should
        only forward 5, matching the comment in execute_find_and_draft."""
        many = ["fintech", "saas", "consumer", "infra", "ai", "health", "biotech", "edtech", "climate", "crypto"]
        _run(config_overrides={"targetIndustries": many})
        first = captured_search_calls[0]
        assert len(first.get("industries", [])) == 5
        assert first.get("industries") == many[:5]

    def test_relaxed_retry_drops_industries(self, captured_search_calls):
        """When the first attempt finds nothing, the relaxed retry should
        broaden by dropping schools/locations AND industries — keeping only
        company+title. Otherwise the retry is identical to the first call
        and recovery is impossible."""
        _run()
        # First call attempted with full filters; second call is the relaxed
        # retry because we returned [] from search_contacts_from_prompt.
        assert len(captured_search_calls) == 2, (
            f"expected 2 PDL calls (initial + relaxed retry), got {len(captured_search_calls)}"
        )
        relaxed = captured_search_calls[1]
        assert relaxed.get("industries") == []
        assert relaxed.get("schools") == []
        assert relaxed.get("locations") == []
        # Company + title must survive the relaxation
        assert relaxed.get("companies") == [{"name": "Stripe"}]
        assert relaxed.get("title_variations") == ["product manager"]

    def test_no_industries_means_empty_list_not_missing_key(self, captured_search_calls):
        """When the user's brief has no industries at all, the key still
        exists in parsed_prompt (set to []), so downstream readers don't
        hit a KeyError."""
        _run(config_overrides={"targetIndustries": []})
        first = captured_search_calls[0]
        assert "industries" in first
        assert first["industries"] == []
