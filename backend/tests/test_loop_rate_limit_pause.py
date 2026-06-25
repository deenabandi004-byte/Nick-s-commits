"""
Rate-limit 3-strike auto-pause tests.

When an upstream (Perplexity, Firecrawl, etc.) returns a rate-limit error,
the action surfaces a `rateLimited` flag in its result. loop_jobs accumulates
a streak on the Loop; after RATE_LIMIT_STRIKE_THRESHOLD consecutive cycles
the Loop is auto-paused with pauseReason="rate_limited".

This is a defensive feature: prevents a single misbehaving Loop from burning
through the user's daily PDL/Perplexity quota during a vendor outage. User
can resume manually once the upstream recovers.

All tests mock external APIs; zero real HTTP calls.
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.services import agent_actions, loop_jobs
from app.services.loop_budget import (
    RATE_LIMIT_STRIKE_THRESHOLD,
    can_run_now,
)
from app.utils.exceptions import RateLimitError


# ── loop_budget: can_run_now gates on rate-limit strikes ──────────────────


def _running_loop(**overrides) -> dict:
    """Minimum loop dict for can_run_now to pass everything else."""
    return {
        "status": "running",
        "automationEnabled": True,
        "creditBudgetPerWeek": 200,
        "weekCreditsSpent": 0,
        **overrides,
    }


# Make sure the test fires inside the quiet-hours window. UTC noon is awake
# in all reasonable timezones (worst case UTC+14 → 2am, UTC-12 → 0am — pick
# Pacific which is well inside the 8am-10pm allowed window).
_AWAKE = datetime(2026, 5, 30, 19, 0, tzinfo=timezone.utc)  # 19:00 UTC = 12pm PT


def test_can_run_now_passes_when_no_strikes():
    ok, reason = can_run_now(
        "u1",
        _running_loop(consecutiveRateLimitCycles=0),
        monthly_remaining_credits=1000,
        user_timezone="America/Los_Angeles",
        now=_AWAKE,
    )
    assert ok is True
    assert reason is None


def test_can_run_now_passes_below_threshold():
    """2 strikes < 3 threshold — Loop still allowed to run."""
    ok, reason = can_run_now(
        "u1",
        _running_loop(consecutiveRateLimitCycles=2),
        monthly_remaining_credits=1000,
        user_timezone="America/Los_Angeles",
        now=_AWAKE,
    )
    assert ok is True
    assert reason is None


def test_can_run_now_blocks_at_threshold():
    """At threshold — Loop is rate-limit-paused."""
    ok, reason = can_run_now(
        "u1",
        _running_loop(consecutiveRateLimitCycles=RATE_LIMIT_STRIKE_THRESHOLD),
        monthly_remaining_credits=1000,
        user_timezone="America/Los_Angeles",
        now=_AWAKE,
    )
    assert ok is False
    assert reason == "rate_limited"


def test_can_run_now_blocks_above_threshold():
    ok, reason = can_run_now(
        "u1",
        _running_loop(consecutiveRateLimitCycles=10),
        monthly_remaining_credits=1000,
        user_timezone="America/Los_Angeles",
        now=_AWAKE,
    )
    assert ok is False
    assert reason == "rate_limited"


def test_can_run_now_budget_capped_takes_precedence_over_rate_limit():
    """Budget cap fires first because it's earlier in can_run_now's ladder.
    Either pause reason would block; this just confirms the deterministic
    order so tests don't get flaky if both conditions are true."""
    ok, reason = can_run_now(
        "u1",
        _running_loop(
            consecutiveRateLimitCycles=5,
            weekCreditsSpent=999,  # over budget
        ),
        monthly_remaining_credits=1000,
        user_timezone="America/Los_Angeles",
        now=_AWAKE,
    )
    assert ok is False
    assert reason == "budget_capped"


def test_rate_limit_strike_threshold_is_three():
    """Plan says 3 — if anyone tunes this later they should update the plan
    + this test together."""
    assert RATE_LIMIT_STRIKE_THRESHOLD == 3


# ── loop_jobs: streak counter ─────────────────────────────────────────────


def _make_fake_loop_doc_pipeline(loop_data: dict, captured_updates: dict):
    """Build a fake db.collection().document() chain that:
    - returns `loop_data` from .get().to_dict()
    - captures any .update(d) into `captured_updates`
    """
    loop_doc = MagicMock()
    loop_snap = MagicMock()
    loop_snap.exists = True
    loop_snap.to_dict.return_value = loop_data
    loop_doc.get.return_value = loop_snap

    def capture_update(d):
        captured_updates.update(d)
    loop_doc.update.side_effect = capture_update

    loops_coll = MagicMock()
    loops_coll.document.return_value = loop_doc

    user_doc = MagicMock()
    user_doc.collection.return_value = loops_coll

    # Also stub user_doc.get for the user data fetch inside run_loop_cycle_job.
    user_snap = MagicMock()
    user_snap.exists = True
    user_snap.to_dict.return_value = {"professionalInfo": {}}
    user_doc.get.return_value = user_snap

    users_coll = MagicMock()
    users_coll.document.return_value = user_doc

    db = MagicMock()
    db.collection.return_value = users_coll
    return db


def test_loop_jobs_bumps_strike_counter_on_rate_limited_result(monkeypatch):
    """A cycle that returns rateLimited=True increments consecutiveRateLimitCycles
    by 1 and writes it in the loop_ref.update."""
    captured = {}
    db = _make_fake_loop_doc_pipeline(
        {
            "status": "running",
            "briefText": "",
            "briefParsed": {},
            "loopMode": "people",
            "consecutiveRateLimitCycles": 1,  # prior streak = 1
        },
        captured,
    )
    import app.extensions
    monkeypatch.setattr(app.extensions, "get_db", lambda: db)
    # Stub run_agent_cycle so we don't actually execute a cycle — just
    # return a result with rateLimited=True.
    import app.services.agent_service
    monkeypatch.setattr(
        app.services.agent_service,
        "_run_cycle",
        lambda *a, **kw: {
            "rateLimited": True,
            "creditsSpent": 0,
            "contactsFound": 0,
            "emailsDrafted": 0,
            "companiesDiscovered": 0,
            "jobsFound": 0,
            "hmsFound": 0,
        },
    )

    loop_jobs.run_loop_cycle_job(uid="u1", loop_id="L1", cycle_id="c1")

    assert captured.get("consecutiveRateLimitCycles") == 2
    # Below threshold — status should NOT flip to paused yet.
    assert captured.get("status") != "paused"
    assert "pauseReason" not in captured


def test_loop_jobs_pauses_at_threshold(monkeypatch):
    """When the new streak hits RATE_LIMIT_STRIKE_THRESHOLD, the Loop flips
    to status=paused with pauseReason='rate_limited'."""
    captured = {}
    db = _make_fake_loop_doc_pipeline(
        {
            "status": "running",
            "briefText": "",
            "briefParsed": {},
            "loopMode": "people",
            "consecutiveRateLimitCycles": RATE_LIMIT_STRIKE_THRESHOLD - 1,
        },
        captured,
    )
    import app.extensions
    monkeypatch.setattr(app.extensions, "get_db", lambda: db)
    import app.services.agent_service
    monkeypatch.setattr(
        app.services.agent_service,
        "_run_cycle",
        lambda *a, **kw: {
            "rateLimited": True,
            "creditsSpent": 0,
            "contactsFound": 0,
            "emailsDrafted": 0,
            "companiesDiscovered": 0,
            "jobsFound": 0,
            "hmsFound": 0,
        },
    )

    loop_jobs.run_loop_cycle_job(uid="u1", loop_id="L1", cycle_id="c1")

    assert captured.get("consecutiveRateLimitCycles") == RATE_LIMIT_STRIKE_THRESHOLD
    assert captured.get("status") == "paused"
    assert captured.get("pauseReason") == "rate_limited"


def test_loop_jobs_resets_streak_on_clean_cycle(monkeypatch):
    """A successful cycle (no rateLimited flag) zeroes a non-zero streak."""
    captured = {}
    db = _make_fake_loop_doc_pipeline(
        {
            "status": "running",
            "briefText": "",
            "briefParsed": {},
            "loopMode": "people",
            "consecutiveRateLimitCycles": 2,
        },
        captured,
    )
    import app.extensions
    monkeypatch.setattr(app.extensions, "get_db", lambda: db)
    import app.services.agent_service
    monkeypatch.setattr(
        app.services.agent_service,
        "_run_cycle",
        lambda *a, **kw: {
            "creditsSpent": 5,
            "contactsFound": 1,
            "emailsDrafted": 1,
            "companiesDiscovered": 0,
            "jobsFound": 0,
            "hmsFound": 0,
        },
    )

    loop_jobs.run_loop_cycle_job(uid="u1", loop_id="L1", cycle_id="c1")

    assert captured.get("consecutiveRateLimitCycles") == 0


def test_loop_jobs_does_not_write_streak_field_when_already_zero(monkeypatch):
    """Don't churn the doc with a no-op write when the streak was already
    0 and the cycle was clean."""
    captured = {}
    db = _make_fake_loop_doc_pipeline(
        {
            "status": "running",
            "briefText": "",
            "briefParsed": {},
            "loopMode": "people",
            # No consecutiveRateLimitCycles field at all (or 0).
        },
        captured,
    )
    import app.extensions
    monkeypatch.setattr(app.extensions, "get_db", lambda: db)
    import app.services.agent_service
    monkeypatch.setattr(
        app.services.agent_service,
        "_run_cycle",
        lambda *a, **kw: {
            "creditsSpent": 5, "contactsFound": 1, "emailsDrafted": 1,
            "companiesDiscovered": 0, "jobsFound": 0, "hmsFound": 0,
        },
    )

    loop_jobs.run_loop_cycle_job(uid="u1", loop_id="L1", cycle_id="c1")

    assert "consecutiveRateLimitCycles" not in captured


# ── agent_actions: RateLimitError surfaces rateLimited flag ───────────────


def test_execute_find_jobs_marks_rate_limited_on_perplexity_429(monkeypatch):
    """When Perplexity raises RateLimitError, execute_find_jobs returns a
    result with rateLimited=True instead of crashing the cycle."""
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: False)
    monkeypatch.setattr(agent_actions, "get_db", lambda: MagicMock())

    def _raise_rate_limit(*a, **kw):
        raise RateLimitError("Perplexity 429")

    import sys
    fake_module = MagicMock()
    fake_module.search_jobs_live = _raise_rate_limit
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_module)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={"company": "Stripe", "role": "Designer", "count": 5, "cycleId": "c1"},
        config={"loopId": "L1"},
        user_data={"professionalInfo": {}},
    )

    assert result.get("rateLimited") is True
    # Zero results because the API was rate-limited and we caught it.
    assert result.get("jobsFound") == 0


def test_execute_discover_companies_marks_rate_limited_on_perplexity_429(monkeypatch):
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: False)
    monkeypatch.setattr(agent_actions, "get_db", lambda: MagicMock())

    def _raise_rate_limit(*a, **kw):
        raise RateLimitError("Perplexity 429")

    import sys
    fake_module = MagicMock()
    fake_module.discover_companies_live = _raise_rate_limit
    fake_module.enrich_company_profile_live = lambda *a, **kw: {}
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_module)

    # Stub company_recommendations fallback so it doesn't drag in real deps.
    fake_recs = MagicMock()
    fake_recs.get_recommendations = lambda *a, **kw: {"companies": []}
    monkeypatch.setitem(sys.modules, "app.services.company_recommendations", fake_recs)

    result = agent_actions.execute_discover_companies(
        uid="u1",
        action={"sourceCompany": "Stripe", "cycleId": "c1"},
        config={"loopId": "L1", "targetCompanies": ["Stripe"]},
        user_data={"professionalInfo": {}},
    )

    assert result.get("rateLimited") is True
    assert result.get("companiesDiscovered") == 0


def test_execute_find_jobs_no_rate_limit_flag_on_clean_path(monkeypatch):
    """When Perplexity returns normally (or empty), the result has no
    rateLimited key — the streak in loop_jobs depends on absence to reset."""
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: False)
    monkeypatch.setattr(agent_actions, "get_db", lambda: MagicMock())

    import sys
    fake_module = MagicMock()
    fake_module.search_jobs_live = lambda *a, **kw: []  # No jobs, no error
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_module)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={"company": "Stripe", "role": "Designer", "count": 5, "cycleId": "c1"},
        config={"loopId": "L1"},
        user_data={"professionalInfo": {}},
    )

    assert "rateLimited" not in result
    assert result.get("jobsFound") == 0
