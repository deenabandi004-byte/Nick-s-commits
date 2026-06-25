"""
tier_defaults — single source of truth for tier-driven Loop defaults.

The Loops setup wizard (V2) hides cadence from the user. When the wizard
omits `weeklyTarget`, `loop_service.create_loop` reads the tier default
from here and derives `creditBudgetPerWeek` from
`BUNDLED_COST_PER_PERSON × weeklyTarget × BUNDLED_BUDGET_BUFFER`
(see loop_service.create_loop).

Starting values were picked to land safely under each tier's monthly
credit pool at typical loopMode="people" cost. Tune via the A/B
dashboard once we have data; don't tune by ear.
"""
from __future__ import annotations

WEEKLY_TARGET_BY_TIER: dict[str, int] = {
    "free":  2,
    "pro":   5,
    "elite": 10,
}

# Used when the caller hands us a tier we don't recognize. Free is the
# conservative pick — better to underdeliver and have the user upgrade
# than to overspend on a misconfigured account.
_FALLBACK_WEEKLY_TARGET = WEEKLY_TARGET_BY_TIER["free"]


def weekly_target_for_tier(tier: str | None) -> int:
    """Return the default people-per-week target for the given tier.

    Unknown / missing tier → free-tier default. Never raises.
    """
    if not tier:
        return _FALLBACK_WEEKLY_TARGET
    return WEEKLY_TARGET_BY_TIER.get(tier.lower(), _FALLBACK_WEEKLY_TARGET)
