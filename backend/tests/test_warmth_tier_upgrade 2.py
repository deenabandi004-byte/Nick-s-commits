"""Tests for warmth tier upgrade-only behavior in personalization strategy."""
import pytest
from app.utils.personalization import (
    _upgrade_warmth_tier,
    build_personalization_strategy,
    build_user_profile,
    build_contact_profile,
)


class TestWarmthTierUpgrade:
    """Warmth tier can be upgraded by lead_type but NEVER downgraded."""

    def test_cold_plus_alumni_upgrades_to_warm(self):
        result = _upgrade_warmth_tier("cold", "alumni")
        assert result == "warm"

    def test_warm_plus_general_stays_warm(self):
        result = _upgrade_warmth_tier("warm", "general")
        assert result == "warm"

    def test_cold_plus_general_stays_cold(self):
        result = _upgrade_warmth_tier("cold", "general")
        assert result == "cold"

    def test_cold_plus_dream_company_upgrades_to_neutral(self):
        result = _upgrade_warmth_tier("cold", "dream_company")
        assert result == "neutral"

    def test_cold_plus_shared_company_upgrades_to_warm(self):
        result = _upgrade_warmth_tier("cold", "shared_company")
        assert result == "warm"

    def test_neutral_plus_alumni_upgrades_to_warm(self):
        result = _upgrade_warmth_tier("neutral", "alumni")
        assert result == "warm"

    def test_warm_plus_alumni_stays_warm_no_overflow(self):
        """Warm is the ceiling - alumni +2 shouldn't crash or go beyond warm."""
        result = _upgrade_warmth_tier("warm", "alumni")
        assert result == "warm"

    def test_neutral_plus_shared_hometown_upgrades_to_warm(self):
        result = _upgrade_warmth_tier("neutral", "shared_hometown")
        assert result == "warm"

    def test_cold_plus_shared_major_upgrades_to_neutral(self):
        result = _upgrade_warmth_tier("cold", "shared_major")
        assert result == "neutral"

    def test_cold_plus_skills_overlap_stays_cold(self):
        """skills_overlap has +0 upgrade - no change."""
        result = _upgrade_warmth_tier("cold", "skills_overlap")
        assert result == "cold"


class TestWarmthTierInStrategy:
    """Integration: strategy builder uses upgraded tier, not just base."""

    def _make_user(self, **overrides):
        defaults = {
            "university": "University of Southern California",
            "major": "Finance",
            "year": "2027",
        }
        defaults.update(overrides)
        return build_user_profile(
            resume_parsed={},
            user_profile={"academics": defaults},
        )

    def test_alumni_contact_upgrades_cold_base(self):
        user = self._make_user()
        contact_data = {
            "FirstName": "Sarah",
            "LastName": "Kim",
            "Company": "Goldman Sachs",
            "Title": "Analyst",
            "educationArray": [{"school": {"name": "University of Southern California"}, "majors": ["Economics"]}],
        }
        contact = build_contact_profile(contact_data)
        strategy = build_personalization_strategy(user, contact, base_warmth_tier="cold")
        assert strategy.lead_type == "alumni"
        assert strategy.warmth_tier == "warm"  # cold + alumni (+2) = warm

    def test_general_contact_no_downgrade_from_warm(self):
        user = self._make_user()
        contact_data = {
            "FirstName": "John",
            "LastName": "Doe",
            "Company": "Random Corp",
            "Title": "Manager",
        }
        contact = build_contact_profile(contact_data)
        strategy = build_personalization_strategy(user, contact, base_warmth_tier="warm")
        assert strategy.lead_type == "general"
        assert strategy.warmth_tier == "warm"  # warm + general (+0) = warm (no downgrade)

    def test_general_contact_cold_stays_cold(self):
        user = self._make_user()
        contact_data = {
            "FirstName": "Jane",
            "LastName": "Smith",
            "Company": "Unknown LLC",
            "Title": "Director",
        }
        contact = build_contact_profile(contact_data)
        strategy = build_personalization_strategy(user, contact, base_warmth_tier="cold")
        assert strategy.lead_type == "general"
        assert strategy.warmth_tier == "cold"  # cold + general (+0) = cold
