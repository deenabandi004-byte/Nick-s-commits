"""Unit tests for the shared role taxonomy module.

Covers:
  - `_expand_titles_for_broadening` (used by PDL retry_level=1 and the
    Perplexity job-search broadening level 1)
  - `_expand_titles_seniority_adjacent` (used by PDL retry_level=2)
  - `broaden_query_for_perplexity` (level 0-3 query composer for the
    Perplexity job-search broadening flow)

No real Perplexity or PDL calls — pure dict/heuristic exercises.
"""
from __future__ import annotations

import pytest

from app.utils.role_taxonomy import (
    _TITLE_FAMILY_EXPANSIONS,
    _expand_titles_for_broadening,
    _expand_titles_seniority_adjacent,
    broaden_query_for_perplexity,
)


# ── _expand_titles_for_broadening ────────────────────────────────────────


def test_expand_for_broadening_empty():
    assert _expand_titles_for_broadening([]) == []
    assert _expand_titles_for_broadening(None) == []


def test_expand_for_broadening_direct_family_match():
    """A title that is itself a canonical family key pulls in the full list."""
    out = _expand_titles_for_broadening(["data scientist"])
    assert out[0] == "data scientist"
    # Cousins from the data-family list should follow.
    for cousin in ("data analyst", "data engineer", "machine learning engineer"):
        assert cousin in out


def test_expand_for_broadening_substring_match():
    """Niche role with a family key as substring expands to the family."""
    out = _expand_titles_for_broadening(["Spatial Data Scientist"])
    # Original normalized first.
    assert out[0] == "spatial data scientist"
    # And the data-family cousins appended.
    for cousin in ("data scientist", "data analyst", "data engineer"):
        assert cousin in out


def test_expand_for_broadening_no_family_passthrough():
    """A title with no family entry passes through unchanged (just normalized)."""
    out = _expand_titles_for_broadening(["Forward Deployed Engineer"])
    assert out == ["forward deployed engineer"]


def test_expand_for_broadening_dedup_preserves_order():
    """Duplicates collapse and first-seen order is preserved."""
    out = _expand_titles_for_broadening(
        ["Data Scientist", "data scientist", "Data Analyst"]
    )
    # Both originals appear before family cousins; no double entry.
    assert out[0] == "data scientist"
    assert "data analyst" in out
    assert out.count("data scientist") == 1
    assert out.count("data analyst") == 1


# ── _expand_titles_seniority_adjacent ────────────────────────────────────


def test_expand_seniority_analyst_expands_to_associate_family():
    out = _expand_titles_seniority_adjacent(["analyst"])
    # Original first, then the adjacent seniority family.
    assert out[0] == "analyst"
    for adj in ("associate", "research associate", "junior associate", "senior analyst"):
        assert adj in out


def test_expand_seniority_includes_level1_family_expansion():
    """Level-2 (seniority-adjacent) also bundles in the level-1 family expansion."""
    out = _expand_titles_seniority_adjacent(["data scientist"])
    # Seniority key "engineer" doesn't match "data scientist", but the family
    # expansion bundle still kicks in.
    assert "data scientist" in out
    assert "data analyst" in out


def test_expand_seniority_empty():
    assert _expand_titles_seniority_adjacent([]) == []
    assert _expand_titles_seniority_adjacent(None) == []


# ── broaden_query_for_perplexity ─────────────────────────────────────────


def test_broaden_level_0_role_and_company():
    assert broaden_query_for_perplexity(
        "Spatial Data Scientist", "Apple", "Cupertino, CA", 0,
    ) == "Spatial Data Scientist at Apple"


def test_broaden_level_0_role_only():
    assert broaden_query_for_perplexity(
        "Software Engineer", "", "New York, NY", 0,
    ) == "Software Engineer"


def test_broaden_level_0_no_role_no_company_is_none():
    """Empty role + empty company at L0 signals caller to fall back to
    its own placeholder (e.g. "internship")."""
    assert broaden_query_for_perplexity("", "", "United States", 0) is None


def test_broaden_level_1_family_expands_role_keeps_company():
    out = broaden_query_for_perplexity(
        "Spatial Data Scientist", "Apple", "Cupertino, CA", 1,
    )
    assert out == "data scientist at Apple"


def test_broaden_level_1_no_family_match_returns_none():
    """Role with no family entry produces a query identical to L0 — return
    None so the caller skips the duplicate Perplexity call."""
    assert broaden_query_for_perplexity(
        "Forward Deployed Engineer", "Palantir", "NYC", 1,
    ) is None


def test_broaden_level_1_no_company_returns_none():
    """Without a company, L1 collapses into L2 — skip it."""
    assert broaden_query_for_perplexity(
        "Data Scientist", "", "NYC", 1,
    ) is None


def test_broaden_level_2_drops_company():
    out = broaden_query_for_perplexity(
        "Spatial Data Scientist", "Apple", "Cupertino, CA", 2,
    )
    assert out == "data scientist"


def test_broaden_level_2_no_family_no_company_returns_none():
    """No family expansion and no company means L2's query equals L0's —
    skip it."""
    assert broaden_query_for_perplexity(
        "Forward Deployed Engineer", "", "NYC", 2,
    ) is None


def test_broaden_level_3_widens_location():
    out = broaden_query_for_perplexity(
        "Spatial Data Scientist", "Apple", "Cupertino, CA", 3,
    )
    # Wider location embedded in the query string.
    assert out == "data scientist in United States"


def test_broaden_level_3_already_national_returns_none():
    """If the brief was already nationwide, L3 collapses into L2 — skip."""
    assert broaden_query_for_perplexity(
        "Data Scientist", "Apple", "United States", 3,
    ) is None
    assert broaden_query_for_perplexity(
        "Data Scientist", "Apple", "Remote", 3,
    ) is None


def test_broaden_levels_1_to_3_skipped_when_role_empty():
    """Empty role + non-empty company should still skip 1-3 — broadening a
    "no role" brief just re-runs the same generic search."""
    for level in (1, 2, 3):
        assert broaden_query_for_perplexity("", "Apple", "NYC", level) is None


def test_broaden_unknown_level_returns_none():
    assert broaden_query_for_perplexity("Engineer", "Apple", "NYC", 7) is None


# ── _TITLE_FAMILY_EXPANSIONS sanity ──────────────────────────────────────


def test_title_family_canonical_keys_lowercase():
    """Family keys must be lowercase or the substring match in level 1
    won't find them."""
    for key in _TITLE_FAMILY_EXPANSIONS:
        assert key == key.lower()
