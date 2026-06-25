"""Profile completeness signal for Scout's strategist briefings.

A briefing's quality is bounded by what Scout knows about the user. Sparse
profiles produce generic advice; dense ones produce anchored recommendations.
This module computes a coverage percentage and a prioritized list of missing
field groups so the strategist prompt can surface inline gap-callouts
("upload your resume to unlock better outreach examples") and the Scout panel
header can render a coverage gauge.

Field group weights are tuned to briefing-quality impact:

  resume         25  - drives skills/experience anchoring and email copy
  linkedin       20  - drives current-role context and post-aware insights
  goals          20  - drives feature triage and target-firm scope
  academics      15  - drives alumni / school-filtered recommendations
  location       10  - drives geographic scope on Find / Loop
  professional   10  - drives experience-level calibration

Two fields are flagged as critical: missing either resume or linkedin makes
briefings noticeably worse, so callers can use `has_critical_gap` to decide
whether to fire the auto-briefing at all.

The module is a pure function over a Firestore user document dict, with no
I/O. Callers handle Firestore reads and prompt assembly.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


# Field-group weights. Sum to 100 so coverage_pct is a true percentage.
_WEIGHTS: Dict[str, int] = {
    "resume": 25,
    "linkedin": 20,
    "goals": 20,
    "academics": 15,
    "location": 10,
    "professional": 10,
}

# Groups whose absence meaningfully degrades briefing quality.
_CRITICAL_GROUPS = frozenset({"resume", "linkedin"})

# Below this %, briefings would be generic enough that the strategist prompt
# should pivot to a profile-completion ask instead of producing recommendations.
COVERAGE_PIVOT_THRESHOLD = 25

# Below this %, the gauge in the panel header should be shown; at or above it
# the user's profile is dense enough that the gauge becomes ambient noise.
COVERAGE_GAUGE_HIDE_THRESHOLD = 90


def _is_nonempty_str(v: Any) -> bool:
    return isinstance(v, str) and bool(v.strip())


def _is_nonempty_list(v: Any) -> bool:
    return isinstance(v, list) and any(
        _is_nonempty_str(x) if isinstance(x, str) else bool(x) for x in v
    )


def _is_nonempty_dict(v: Any) -> bool:
    if not isinstance(v, dict) or not v:
        return False
    # A dict counts as populated when ANY value is non-empty.
    return any(
        _is_nonempty_str(val)
        or _is_nonempty_list(val)
        or _is_nonempty_dict(val)
        or isinstance(val, (int, float)) and val != 0
        for val in v.values()
    )


def _has_resume(user: Dict[str, Any]) -> bool:
    """Resume present in any of the three stored shapes."""
    if _is_nonempty_dict(user.get("resumeParsed")):
        return True
    if _is_nonempty_str(user.get("resumeText")):
        return True
    if _is_nonempty_str(user.get("originalResumeText")):
        return True
    return False


def _has_linkedin(user: Dict[str, Any]) -> bool:
    """LinkedIn enrichment present in any tracked shape."""
    if _is_nonempty_dict(user.get("linkedinResumeParsed")):
        return True
    if _is_nonempty_dict(user.get("linkedinEnrichmentData")):
        return True
    if _is_nonempty_str(user.get("linkedinUrl")):
        # URL alone is weak signal; only counts if enrichment failed but URL
        # is on file (better than nothing for the auto-backfill flow).
        return True
    return False


def _has_goals(user: Dict[str, Any]) -> bool:
    goals = user.get("goals") or {}
    if not isinstance(goals, dict):
        return False
    return (
        _is_nonempty_list(goals.get("targetIndustries"))
        or _is_nonempty_list(goals.get("targetRoles"))
        or _is_nonempty_list(goals.get("dreamCompanies"))
        or _is_nonempty_str(goals.get("recruitingFor"))
    )


def _has_academics(user: Dict[str, Any]) -> bool:
    """At least two of {university, major, graduationYear} populated."""
    academics = user.get("academics") or {}
    if not isinstance(academics, dict):
        academics = {}
    # Fall back to legacy top-level fields the existing context loader honors.
    university = (
        _is_nonempty_str(academics.get("university"))
        or _is_nonempty_str(user.get("university"))
    )
    major = _is_nonempty_str(academics.get("major"))
    grad_year = bool(academics.get("graduationYear"))
    return sum([university, major, grad_year]) >= 2


def _has_location(user: Dict[str, Any]) -> bool:
    location = user.get("location") or {}
    if not isinstance(location, dict):
        return False
    return _is_nonempty_str(location.get("preferred")) or _is_nonempty_str(
        location.get("current")
    )


def _has_professional(user: Dict[str, Any]) -> bool:
    """Any meaningful professional info beyond the basics covered elsewhere."""
    info = user.get("professionalInfo") or {}
    if not isinstance(info, dict):
        return False
    # Anything in the dict counts. Existing context loader treats it as opaque.
    return _is_nonempty_dict(info)


_GROUP_CHECKS: Dict[str, "callable"] = {
    "resume": _has_resume,
    "linkedin": _has_linkedin,
    "goals": _has_goals,
    "academics": _has_academics,
    "location": _has_location,
    "professional": _has_professional,
}


def compute_coverage(user_doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Return a coverage report for one user's Firestore doc.

    Output shape:
      {
        "coverage_pct": int (0-100),
        "present_groups": [str, ...],     # groups with data, weight order desc
        "gap_groups":     [str, ...],     # groups missing, weight order desc
        "has_critical_gap": bool,         # resume or linkedin missing
        "should_hide_gauge": bool,        # coverage >= COVERAGE_GAUGE_HIDE_THRESHOLD
        "should_pivot_briefing": bool,    # coverage < COVERAGE_PIVOT_THRESHOLD
      }

    Robust to missing / non-dict input: returns a 0% coverage report.
    """
    user = user_doc if isinstance(user_doc, dict) else {}

    present: List[Tuple[str, int]] = []
    gaps: List[Tuple[str, int]] = []
    score = 0

    for group, weight in _WEIGHTS.items():
        if _GROUP_CHECKS[group](user):
            present.append((group, weight))
            score += weight
        else:
            gaps.append((group, weight))

    # Sort highest-impact first so callers can quote the most useful gap.
    present.sort(key=lambda t: t[1], reverse=True)
    gaps.sort(key=lambda t: t[1], reverse=True)

    coverage_pct = max(0, min(100, score))
    has_critical_gap = any(g in _CRITICAL_GROUPS for g, _ in gaps)

    return {
        "coverage_pct": coverage_pct,
        "present_groups": [g for g, _ in present],
        "gap_groups": [g for g, _ in gaps],
        "has_critical_gap": has_critical_gap,
        "should_hide_gauge": coverage_pct >= COVERAGE_GAUGE_HIDE_THRESHOLD,
        "should_pivot_briefing": coverage_pct < COVERAGE_PIVOT_THRESHOLD,
    }


# Strings the strategist prompt and the gauge UI use to describe each gap.
# Kept here so the copy and the gauge label stay in sync.
GAP_LABELS: Dict[str, str] = {
    "resume": "Upload your resume",
    "linkedin": "Add your LinkedIn URL",
    "goals": "Tell us your target industries and roles",
    "academics": "Add your school, major, and graduation year",
    "location": "Set your preferred location",
    "professional": "Add your professional background",
}

# Deep-link routes for each gap. The strategist prompt can render a gap-call
# chip that jumps the user to the right onboarding step.
GAP_DEEP_LINKS: Dict[str, str] = {
    "resume": "/account-settings?tab=resume",
    "linkedin": "/onboarding/profile",
    "goals": "/onboarding/goals",
    "academics": "/onboarding/academics",
    "location": "/onboarding/location",
    "professional": "/account-settings?tab=profile",
}


def gap_callouts(report: Dict[str, Any], limit: int = 2) -> List[Dict[str, str]]:
    """Top gap-callouts ready for prompt rendering and UI display.

    Each callout has {label, deep_link, group}. The strategist prompt embeds
    these inline as "Upload your resume to unlock... [+]" chips; the panel
    header gauge uses the same list in its hover/tap surface.
    """
    items: List[Dict[str, str]] = []
    for group in report.get("gap_groups") or []:
        if group not in GAP_LABELS:
            continue
        items.append({
            "group": group,
            "label": GAP_LABELS[group],
            "deep_link": GAP_DEEP_LINKS[group],
        })
        if len(items) >= max(1, limit):
            break
    return items
