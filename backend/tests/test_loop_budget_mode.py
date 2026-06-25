"""
loop_budget — mode-aware estimate tests.

Covers:
  - estimate_cycle_cost("people", ...) keeps today's heuristic (contacts-led)
  - estimate_cycle_cost("roles", ...)  swaps to jobs-led, no PDL contacts
  - estimate_cycle_cost default arg ("people") preserves legacy callers

No Firestore. Pure functions.
"""
from __future__ import annotations

from app.services.loop_budget import (
    CREDIT_COSTS,
    estimate_cycle_cost,
)


# ── estimate_cycle_cost ───────────────────────────────────────────────────


def test_estimate_people_mode_unchanged():
    """Regression: typical people-mode brief still produces today's mix
    (contacts-led). Numbers match _build_prompt heuristics in the plan."""
    est = estimate_cycle_cost(
        {"companies": ["Stripe"], "roles": ["Designer"]},
        cadence="every_other_day",
        loop_mode="people",
    )
    breakdown = est["breakdown"]
    assert breakdown["contacts"] >= 1
    assert breakdown["jobs"] >= 1
    # People mode never expects 10 jobs/cycle — that's roles territory.
    assert breakdown["jobs"] <= 5


def test_estimate_roles_mode_jobs_led():
    """Roles cycle mix: 10 companies + 10 jobs + 3 HMs, zero contacts.
    Total ≈ 59 credits per the plan's worked example."""
    est = estimate_cycle_cost(
        {"companies": ["YC Startup"], "roles": ["SWE Intern"]},
        cadence="every_other_day",
        loop_mode="roles",
    )
    breakdown = est["breakdown"]
    assert breakdown["contacts"] == 0  # PDL contact search not emitted
    assert breakdown["jobs"] == 10
    assert breakdown["hiring_managers"] == 3
    assert breakdown["companies"] == 10
    # Match the plan's expected per-cycle credit total within ±2 (math is
    # exact, but if CREDIT_COSTS shift in the future this gives one
    # credit of slack).
    expected = (
        breakdown["contacts"] * CREDIT_COSTS["contact"]
        + breakdown["hiring_managers"] * CREDIT_COSTS["hiring_manager"]
        + breakdown["jobs"] * CREDIT_COSTS["job"]
        + breakdown["companies"] * CREDIT_COSTS["company"]
    )
    assert est["per_cycle_credits"] == expected
    # Plan's worked example: 10 + 10 + 39 = 59 credits.
    assert est["per_cycle_credits"] == 59


def test_estimate_default_mode_is_people():
    """Legacy callers (no loop_mode kwarg) still get people-mode estimates."""
    legacy = estimate_cycle_cost(
        {"companies": ["Stripe"], "roles": ["Designer"]},
        cadence="every_other_day",
    )
    explicit = estimate_cycle_cost(
        {"companies": ["Stripe"], "roles": ["Designer"]},
        cadence="every_other_day",
        loop_mode="people",
    )
    assert legacy == explicit


def test_estimate_both_mode_half_and_half():
    """Both mode runs networking + job-search against one budget, with
    half-and-half allocation. Expected mix: 2 contacts + 2 HMs (mixed
    founder/people) + 5 jobs + 5 companies."""
    est = estimate_cycle_cost(
        {"companies": ["Stripe"], "roles": ["Designer"]},
        cadence="every_other_day",
        loop_mode="both",
    )
    breakdown = est["breakdown"]
    assert breakdown["contacts"] == 2  # half of pure-people contacts
    assert breakdown["hiring_managers"] == 2  # 1 founder-style + 1 people-style
    assert breakdown["jobs"] == 5  # half of pure-roles jobs
    assert breakdown["companies"] == 5  # shared discovery
    expected = (
        breakdown["contacts"] * CREDIT_COSTS["contact"]
        + breakdown["hiring_managers"] * CREDIT_COSTS["hiring_manager"]
        + breakdown["jobs"] * CREDIT_COSTS["job"]
        + breakdown["companies"] * CREDIT_COSTS["company"]
    )
    assert est["per_cycle_credits"] == expected


def test_estimate_both_mode_sits_between_people_and_roles():
    """Sanity: both-mode credit cost should land between pure people and
    pure roles. The half/half allocation is what makes both mode the
    default-acceptable choice for students who want it all."""
    bp = {"companies": ["Stripe"], "roles": ["Designer"]}
    people = estimate_cycle_cost(bp, "every_other_day", "people")["per_cycle_credits"]
    roles = estimate_cycle_cost(bp, "every_other_day", "roles")["per_cycle_credits"]
    both = estimate_cycle_cost(bp, "every_other_day", "both")["per_cycle_credits"]
    # both must not undercut the cheaper mode or overshoot the pricier one.
    assert min(people, roles) <= both <= max(people, roles)
