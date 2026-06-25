"""Unit tests for profile_coverage.compute_coverage.

Covers the weighting rubric, gap ordering, critical-gap flag, and the
strategist-prompt-facing pivot + gauge-hide thresholds. Pure function tests:
no Firestore, no fixtures needed.
"""
from __future__ import annotations

import pytest

from app.services.scout.profile_coverage import (
    COVERAGE_GAUGE_HIDE_THRESHOLD,
    COVERAGE_PIVOT_THRESHOLD,
    GAP_LABELS,
    compute_coverage,
    gap_callouts,
)


# Full profile reaches 100% by satisfying every weighted group.
FULL_PROFILE = {
    "resumeParsed": {
        "name": "Test",
        "education": {"university": "USC"},
        "experience": [{"company": "X", "title": "Eng"}],
    },
    "linkedinResumeParsed": {"name": "Test", "education": {}},
    "linkedinUrl": "https://linkedin.com/in/test",
    "goals": {
        "targetIndustries": ["Consulting"],
        "targetRoles": ["Analyst"],
        "dreamCompanies": ["McKinsey"],
        "recruitingFor": "summer-2027",
    },
    "academics": {"university": "USC", "major": "CS", "graduationYear": 2027},
    "location": {"preferred": "NYC", "current": "LA"},
    "professionalInfo": {"yearsExperience": 1, "summary": "student"},
}


def test_empty_dict_reports_zero_coverage():
    report = compute_coverage({})
    assert report["coverage_pct"] == 0
    assert report["present_groups"] == []
    assert set(report["gap_groups"]) == set(GAP_LABELS.keys())
    assert report["has_critical_gap"] is True
    assert report["should_pivot_briefing"] is True
    assert report["should_hide_gauge"] is False


def test_non_dict_input_is_handled_safely():
    """None / wrong-type input should not raise; just return a 0% report."""
    for bad in (None, "not a dict", 42, []):
        report = compute_coverage(bad)
        assert report["coverage_pct"] == 0
        assert report["has_critical_gap"] is True


def test_full_profile_reaches_100_with_no_gaps():
    report = compute_coverage(FULL_PROFILE)
    assert report["coverage_pct"] == 100
    assert report["gap_groups"] == []
    assert report["has_critical_gap"] is False
    assert report["should_pivot_briefing"] is False
    assert report["should_hide_gauge"] is True


def test_resume_text_falls_back_when_parsed_is_absent():
    """resumeText alone (no resumeParsed) should still count as a resume."""
    user = {"resumeText": "Hi I am a candidate with experience..."}
    report = compute_coverage(user)
    assert "resume" in report["present_groups"]
    assert "resume" not in report["gap_groups"]
    # Resume weight is 25 and nothing else is set.
    assert report["coverage_pct"] == 25


def test_linkedin_url_alone_counts_as_linkedin():
    """When enrichment failed but URL is on file (backfill case), credit it."""
    user = {"linkedinUrl": "https://linkedin.com/in/x"}
    report = compute_coverage(user)
    assert "linkedin" in report["present_groups"]
    assert report["coverage_pct"] == 20


def test_partial_academics_needs_two_of_three():
    """One field populated is not enough; two is."""
    one = {"academics": {"university": "USC"}}
    two = {"academics": {"university": "USC", "graduationYear": 2027}}
    assert compute_coverage(one)["coverage_pct"] == 0  # below the 2-of-3 bar
    assert compute_coverage(two)["coverage_pct"] == 15


def test_university_legacy_top_level_field_is_honored():
    """Some older user docs store university at the root; honor that too."""
    user = {"university": "USC", "academics": {"major": "CS"}}
    report = compute_coverage(user)
    assert "academics" in report["present_groups"]


def test_gap_groups_are_sorted_by_weight_desc():
    """The strategist prompt cites the highest-impact gap first."""
    # Only academics is present; resume / linkedin / goals / location /
    # professional are gaps. Order by descending weight should be:
    # resume(25), linkedin(20), goals(20), location(10), professional(10).
    user = {"academics": {"university": "USC", "major": "CS", "graduationYear": 2027}}
    report = compute_coverage(user)
    gaps = report["gap_groups"]
    # First gap must be resume (highest weight).
    assert gaps[0] == "resume"
    # All ordered by weight desc (ties are stable by insertion order).
    weights = {"resume": 25, "linkedin": 20, "goals": 20, "location": 10, "professional": 10}
    assert sorted(gaps, key=lambda g: -weights[g]) == gaps


def test_has_critical_gap_only_when_resume_or_linkedin_missing():
    """Critical gap = the briefing can't anchor in real-user signal."""
    full = compute_coverage(FULL_PROFILE)
    assert full["has_critical_gap"] is False

    no_resume = {**FULL_PROFILE}
    no_resume.pop("resumeParsed", None)
    no_resume.pop("resumeText", None)
    no_resume.pop("originalResumeText", None)
    assert compute_coverage(no_resume)["has_critical_gap"] is True

    only_resume = {"resumeParsed": {"name": "X"}}
    # Has resume; missing linkedin AND everything else but still critical
    # because linkedin is missing.
    assert compute_coverage(only_resume)["has_critical_gap"] is True


def test_pivot_threshold_below_25_pct():
    """The strategist prompt should pivot from recommendations to onboarding
    asks when the profile is too thin to ground specific advice."""
    # Just location (weight 10) is below the 25% pivot.
    user = {"location": {"preferred": "NYC"}}
    report = compute_coverage(user)
    assert report["coverage_pct"] == 10
    assert report["coverage_pct"] < COVERAGE_PIVOT_THRESHOLD
    assert report["should_pivot_briefing"] is True


def test_gauge_hides_at_high_coverage():
    """Above the gauge-hide threshold, the panel header stops showing it."""
    report = compute_coverage(FULL_PROFILE)
    assert report["coverage_pct"] >= COVERAGE_GAUGE_HIDE_THRESHOLD
    assert report["should_hide_gauge"] is True


def test_gap_callouts_returns_top_n_with_labels_and_routes():
    user = {"academics": {"university": "USC", "major": "CS", "graduationYear": 2027}}
    report = compute_coverage(user)
    callouts = gap_callouts(report, limit=2)
    assert len(callouts) == 2
    assert callouts[0]["group"] == "resume"
    assert callouts[0]["label"] == GAP_LABELS["resume"]
    assert callouts[0]["deep_link"].startswith("/")


def test_gap_callouts_limit_is_clamped_to_at_least_one():
    user = {}
    callouts = gap_callouts(compute_coverage(user), limit=0)
    assert len(callouts) == 1


def test_empty_goals_dict_does_not_count_as_goals_present():
    """A goals dict with no populated fields is not "having goals"."""
    user = {"goals": {"targetIndustries": [], "targetRoles": []}}
    report = compute_coverage(user)
    assert "goals" in report["gap_groups"]


def test_empty_location_dict_does_not_count_as_location_present():
    user = {"location": {"preferred": "", "current": ""}}
    report = compute_coverage(user)
    assert "location" in report["gap_groups"]
