"""
loop_service.create_loop — tier-default cadence tests (Loops Setup V2).

The V2 setup wizard hides cadence from the user. The backend substitutes a
tier-default `weeklyTarget` when the client omits one, and then derives
`creditBudgetPerWeek` from that target the same way the existing wizard
path does. These tests pin that contract per-tier.

No real Firestore — mocks the client following the same pattern as
test_loops_loop_mode.py.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import loop_service
from app.services.loop_service import create_loop
from app.services.tier_defaults import (
    WEEKLY_TARGET_BY_TIER,
    weekly_target_for_tier,
)


def _fake_db_capturing_writes() -> tuple[MagicMock, list[dict]]:
    """Same shape as test_loops_loop_mode.py's helper — captures every
    `.set(doc)` payload so we can assert on the doc that landed."""
    writes: list[dict] = []
    doc_ref = MagicMock()
    doc_ref.set.side_effect = lambda d: writes.append(d)
    doc_ref.get.return_value = MagicMock(exists=False, to_dict=lambda: None)

    coll = MagicMock()
    coll.document.return_value = doc_ref
    coll.stream.return_value = []

    users = MagicMock()
    users.document.return_value.collection.return_value = coll

    db = MagicMock()
    db.collection.return_value = users
    return db, writes


# ── Pure module — weekly_target_for_tier ────────────────────────────────


def test_weekly_target_by_tier_constants():
    """Lock the starting values. Changing these is a product decision — if
    this test fails because someone tuned a default, update the test too."""
    assert WEEKLY_TARGET_BY_TIER == {"free": 2, "pro": 5, "elite": 10}


def test_weekly_target_for_tier_known_tiers():
    assert weekly_target_for_tier("free") == 2
    assert weekly_target_for_tier("pro") == 5
    assert weekly_target_for_tier("elite") == 10


def test_weekly_target_for_tier_is_case_insensitive():
    """Some callers pass 'Pro' or 'PRO' (legacy tier field). Don't punish them."""
    assert weekly_target_for_tier("PRO") == 5
    assert weekly_target_for_tier("Elite") == 10


def test_weekly_target_for_tier_falls_back_on_unknown():
    """Unknown / None / empty → free default. Never raises."""
    assert weekly_target_for_tier("legendary") == 2
    assert weekly_target_for_tier(None) == 2
    assert weekly_target_for_tier("") == 2


# ── create_loop — tier-default substitution ──────────────────────────────


@pytest.mark.parametrize(
    "tier,expected_weekly",
    [("free", 2), ("pro", 5), ("elite", 10)],
)
def test_create_loop_uses_tier_default_weekly_target_when_missing(
    monkeypatch, tier, expected_weekly,
):
    """Wizard V2 path: client omits BOTH weeklyTarget AND creditBudgetPerWeek.
    Service writes the tier-default weeklyTarget to the doc."""
    db, writes = _fake_db_capturing_writes()
    monkeypatch.setattr(loop_service, "get_db", lambda: db)
    monkeypatch.setattr(loop_service, "_migrate_legacy_config", lambda _uid: None)

    create_loop(
        uid="u1",
        tier=tier,
        payload={
            "briefText": "PMs at Stripe",
            "loopMode": "people",
            # NOTE: weeklyTarget AND creditBudgetPerWeek both omitted —
            # this is the V2 wizard's contract.
        },
    )

    assert len(writes) == 1
    assert writes[0]["weeklyTarget"] == expected_weekly


def test_create_loop_derives_budget_from_tier_default_weekly_target(monkeypatch):
    """Budget on the stored doc matches what the existing weeklyTarget-supplied
    path would produce when the value is the tier default. This is the whole
    point: hiding cadence from the user must not break server-side budget
    derivation."""
    from app.services.loop_budget import (
        BUNDLED_BUDGET_BUFFER,
        BUNDLED_COST_PER_PERSON,
    )

    db, writes = _fake_db_capturing_writes()
    monkeypatch.setattr(loop_service, "get_db", lambda: db)
    monkeypatch.setattr(loop_service, "_migrate_legacy_config", lambda _uid: None)

    create_loop(
        uid="u1",
        tier="pro",
        payload={
            "briefText": "PMs at Stripe",
            "loopMode": "people",
            # Wizard omits both.
        },
    )

    expected_weekly = WEEKLY_TARGET_BY_TIER["pro"]  # 5
    expected_budget = int(
        expected_weekly * BUNDLED_COST_PER_PERSON["people"] * BUNDLED_BUDGET_BUFFER
    )
    assert writes[0]["weeklyTarget"] == expected_weekly
    assert writes[0]["creditBudgetPerWeek"] == expected_budget


def test_create_loop_explicit_weekly_target_overrides_tier_default(monkeypatch):
    """Regression guard: passing weeklyTarget MUST still win over the tier
    default. Settings → Advanced still has to work."""
    db, writes = _fake_db_capturing_writes()
    monkeypatch.setattr(loop_service, "get_db", lambda: db)
    monkeypatch.setattr(loop_service, "_migrate_legacy_config", lambda _uid: None)

    create_loop(
        uid="u1",
        tier="free",  # tier default is 2
        payload={
            "briefText": "PMs at Stripe",
            "loopMode": "people",
            "weeklyTarget": 8,  # explicit — must win
        },
    )

    assert writes[0]["weeklyTarget"] == 8


def test_create_loop_explicit_budget_skips_tier_default(monkeypatch):
    """Regression guard: when the client supplies an explicit
    creditBudgetPerWeek, the service does NOT substitute a tier-default
    weeklyTarget or re-derive the budget. The explicit cap wins."""
    db, writes = _fake_db_capturing_writes()
    monkeypatch.setattr(loop_service, "get_db", lambda: db)
    monkeypatch.setattr(loop_service, "_migrate_legacy_config", lambda _uid: None)

    create_loop(
        uid="u1",
        tier="elite",
        payload={
            "briefText": "PMs at Stripe",
            "loopMode": "people",
            "creditBudgetPerWeek": 250,  # power-user override
        },
    )

    assert writes[0]["creditBudgetPerWeek"] == 250


def test_create_loop_tier_default_clamped_to_tier_max(monkeypatch):
    """Free tier max weekly budget = 150. The free default weeklyTarget=2 at
    people mode → 2 × 12 × 1.15 = 27, comfortably under 150. This test isn't
    here because clamping currently fires — it's here so that if someone
    later raises WEEKLY_TARGET_BY_TIER["free"] above the tier max, the
    tier-max clamp still kicks in."""
    db, writes = _fake_db_capturing_writes()
    monkeypatch.setattr(loop_service, "get_db", lambda: db)
    monkeypatch.setattr(loop_service, "_migrate_legacy_config", lambda _uid: None)

    create_loop(
        uid="u1",
        tier="free",
        payload={
            "briefText": "PMs at Stripe",
            "loopMode": "people",
        },
    )

    # Free max_credit_budget_per_week_per_loop = 150 (config.py).
    assert writes[0]["creditBudgetPerWeek"] <= 150
