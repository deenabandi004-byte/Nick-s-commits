"""
Unit tests for `app.services.credit_ledger` — pure functions only.

These tests deliberately avoid Firestore / Firebase entirely. They drive the
ledger's pure ops with a `FakeClock` and assert state transitions. Coverage:

  - deduct: monthly-only, monthly→bonus spill, monthly→bonus→promo spill,
    insufficient funds, negative amount guard
  - add_purchased: positive, non-positive guard
  - add_promotional: positive, earlier-expires-wins rule, missing expires_at
  - monthly_reset: wipes monthly, preserves bonus + promo, sweeps expired promo
  - expire_promos: sweep before expiry (no-op), sweep after expiry (cleared)
  - integration: full month cycle — purchase top-up, spend monthly first,
    spill into bonus, reset month, bonus survives

The Firestore wrappers (`apply_*_atomic`) are NOT tested here — they require
a real Firestore mock that's bigger than what these tests need. Smoke them
in dev against the actual Firestore emulator instead.
"""
import pytest
from datetime import datetime, timezone, timedelta

from app.services.credit_ledger import (
    FakeClock, LedgerState,
    state_from_user_dict,
    deduct, add_purchased, add_promotional, monthly_reset, expire_promos,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def empty_state():
    return LedgerState(monthly=0, monthly_max=0, bonus=0, promo=0)


@pytest.fixture
def pro_state(clock):
    """A typical Pro user mid-month: 1500 of 2000 monthly remaining."""
    return LedgerState(monthly=1500, monthly_max=2000, bonus=0, promo=0)


@pytest.fixture
def pro_with_topup(clock):
    """Same Pro user with a Best Value top-up purchased."""
    return LedgerState(monthly=1500, monthly_max=2000, bonus=1000, promo=0)


@pytest.fixture
def pro_with_promo(clock):
    """Same Pro user with a referral promo that expires in 30 days."""
    return LedgerState(
        monthly=1500, monthly_max=2000, bonus=0, promo=500,
        promo_expires_at=clock.now() + timedelta(days=30),
    )


# ---------------------------------------------------------------------------
# state_from_user_dict — coercion behavior
# ---------------------------------------------------------------------------

class TestStateFromUserDict:
    def test_missing_fields_default_to_zero(self):
        s = state_from_user_dict({})
        assert s.monthly == 0
        assert s.monthly_max == 0
        assert s.bonus == 0
        assert s.promo == 0
        assert s.promo_expires_at is None

    def test_string_numbers_coerce_to_int(self):
        s = state_from_user_dict({'credits': '1500', 'maxCredits': '2000'})
        assert s.monthly == 1500
        assert s.monthly_max == 2000

    def test_garbage_credits_coerce_to_zero(self):
        s = state_from_user_dict({'credits': 'not-a-number'})
        assert s.monthly == 0

    def test_iso_string_expires_at_is_parsed(self, clock):
        iso = '2026-12-31T23:59:59+00:00'
        s = state_from_user_dict({'promoCredits': 100, 'promoCreditsExpiresAt': iso})
        assert s.promo == 100
        assert s.promo_expires_at == datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# deduct — the hot path
# ---------------------------------------------------------------------------

class TestDeduct:
    def test_monthly_only_deduct(self, pro_state, clock):
        op = deduct(pro_state, 100, clock)
        assert op.success
        assert op.new_state.monthly == 1400
        assert op.new_state.bonus == 0
        assert op.debited == {'monthly': 100}
        assert op.updates == {'credits': 1400}

    def test_negative_amount_rejected(self, pro_state, clock):
        op = deduct(pro_state, -50, clock)
        assert not op.success
        assert op.reason == 'negative_amount'
        assert op.new_state == pro_state  # untouched

    def test_zero_amount_succeeds_no_change(self, pro_state, clock):
        op = deduct(pro_state, 0, clock)
        assert op.success
        assert op.new_state.monthly == 1500
        assert op.updates == {}  # no fields changed
        assert op.debited == {}

    def test_insufficient_funds_returns_unchanged_state(self, pro_state, clock):
        # Only 1500 available, request 2000 → fail
        op = deduct(pro_state, 2000, clock)
        assert not op.success
        assert op.reason == 'insufficient_funds'
        assert op.new_state.monthly == 1500  # untouched

    def test_spill_monthly_into_bonus(self, pro_with_topup, clock):
        # Monthly = 1500, bonus = 1000. Spend 2000 → 1500 from monthly + 500 from bonus
        op = deduct(pro_with_topup, 2000, clock)
        assert op.success
        assert op.new_state.monthly == 0
        assert op.new_state.bonus == 500
        assert op.debited == {'monthly': 1500, 'bonus': 500}
        assert op.updates == {'credits': 0, 'bonusCredits': 500}

    def test_spill_all_three_buckets(self, clock):
        # Edge case: spill through monthly → bonus → promo
        state = LedgerState(
            monthly=100, monthly_max=2000, bonus=200, promo=300,
            promo_expires_at=clock.now() + timedelta(days=10),
        )
        op = deduct(state, 500, clock)
        assert op.success
        assert op.new_state.monthly == 0
        assert op.new_state.bonus == 0
        assert op.new_state.promo == 100
        assert op.debited == {'monthly': 100, 'bonus': 200, 'promo': 200}

    def test_expired_promo_doesnt_count_toward_balance(self, clock):
        state = LedgerState(
            monthly=100, monthly_max=2000, promo=500,
            promo_expires_at=clock.now() - timedelta(days=1),  # expired
        )
        # Even though promo says 500, after expiry sweep total should be 100
        op = deduct(state, 300, clock)
        assert not op.success
        assert op.reason == 'insufficient_funds'
        # And the returned updates reflect the promo sweep
        assert op.updates.get('promoCredits') == 0
        assert op.updates.get('promoCreditsExpiresAt') is None

    def test_spill_from_monthly_into_unexpired_promo(self, pro_with_promo, clock):
        # monthly=1500, promo=500 (unexpired). Spend 1700 = 1500 + 200 promo
        op = deduct(pro_with_promo, 1700, clock)
        assert op.success
        assert op.new_state.monthly == 0
        assert op.new_state.promo == 300
        assert op.debited == {'monthly': 1500, 'promo': 200}


# ---------------------------------------------------------------------------
# add_purchased — top-up flow
# ---------------------------------------------------------------------------

class TestAddPurchased:
    def test_purchase_adds_to_bonus(self, pro_state):
        op = add_purchased(pro_state, 1000)
        assert op.success
        assert op.new_state.bonus == 1000
        assert op.new_state.monthly == 1500  # untouched
        assert op.updates == {'bonusCredits': 1000}

    def test_subsequent_purchases_stack(self):
        s1 = LedgerState(bonus=500)
        op = add_purchased(s1, 1000)
        assert op.new_state.bonus == 1500

    def test_zero_purchase_rejected(self, pro_state):
        op = add_purchased(pro_state, 0)
        assert not op.success
        assert op.reason == 'non_positive_amount'

    def test_negative_purchase_rejected(self, pro_state):
        op = add_purchased(pro_state, -100)
        assert not op.success
        assert op.reason == 'non_positive_amount'


# ---------------------------------------------------------------------------
# add_promotional — grants with expiry
# ---------------------------------------------------------------------------

class TestAddPromotional:
    def test_grant_adds_to_promo(self, pro_state, clock):
        expires = clock.now() + timedelta(days=30)
        op = add_promotional(pro_state, 500, expires)
        assert op.success
        assert op.new_state.promo == 500
        assert op.new_state.promo_expires_at == expires

    def test_stacking_grants_use_earliest_expiry(self, clock):
        early = clock.now() + timedelta(days=10)
        late = clock.now() + timedelta(days=60)
        s1 = LedgerState(promo=300, promo_expires_at=late)
        op = add_promotional(s1, 200, early)
        # Earlier expiry wins so the entire balance expires by `early`
        assert op.new_state.promo == 500
        assert op.new_state.promo_expires_at == early

    def test_missing_expires_at_rejected(self, pro_state):
        op = add_promotional(pro_state, 500, None)
        assert not op.success
        assert op.reason == 'missing_expires_at'


# ---------------------------------------------------------------------------
# monthly_reset — preserves bonus + promo
# ---------------------------------------------------------------------------

class TestMonthlyReset:
    def test_resets_monthly_pool_only(self, pro_with_topup, clock):
        op = monthly_reset(pro_with_topup, 2000, clock)
        assert op.success
        assert op.new_state.monthly == 2000
        assert op.new_state.monthly_max == 2000
        assert op.new_state.bonus == 1000  # PRESERVED
        assert op.updates == {
            'credits': 2000,
            'maxCredits': 2000,
            'lastCreditReset': clock.now().isoformat(),
        }

    def test_reset_sweeps_expired_promo(self, clock):
        state = LedgerState(
            monthly=0, monthly_max=2000, bonus=0,
            promo=500, promo_expires_at=clock.now() - timedelta(days=1),
        )
        op = monthly_reset(state, 2000, clock)
        assert op.success
        assert op.new_state.promo == 0
        assert op.updates.get('promoCredits') == 0
        assert op.updates.get('promoCreditsExpiresAt') is None

    def test_reset_keeps_unexpired_promo(self, pro_with_promo, clock):
        op = monthly_reset(pro_with_promo, 2000, clock)
        assert op.new_state.promo == 500  # untouched
        assert op.new_state.promo_expires_at == pro_with_promo.promo_expires_at

    def test_negative_new_max_rejected(self, pro_state, clock):
        op = monthly_reset(pro_state, -10, clock)
        assert not op.success
        assert op.reason == 'negative_new_max'


# ---------------------------------------------------------------------------
# expire_promos — standalone sweep
# ---------------------------------------------------------------------------

class TestExpirePromos:
    def test_sweep_before_expiry_is_noop(self, pro_with_promo, clock):
        op = expire_promos(pro_with_promo, clock)
        assert op.success
        assert op.reason == 'ok'  # nothing to do
        assert op.new_state == pro_with_promo
        assert op.updates == {}

    def test_sweep_after_expiry_clears_promo(self, clock):
        state = LedgerState(promo=500, promo_expires_at=clock.now() + timedelta(days=10))
        # Time-travel past the expiry
        clock.advance(days=11)
        op = expire_promos(state, clock)
        assert op.success
        assert op.reason == 'expired'
        assert op.new_state.promo == 0
        assert op.new_state.promo_expires_at is None
        assert op.updates == {'promoCredits': 0, 'promoCreditsExpiresAt': None}

    def test_sweep_with_no_promo_balance_is_noop(self, pro_state, clock):
        op = expire_promos(pro_state, clock)
        assert op.success
        assert op.updates == {}


# ---------------------------------------------------------------------------
# Integration — full month cycle
# ---------------------------------------------------------------------------

class TestMonthCycle:
    def test_purchase_topup_then_spend_then_month_resets(self, clock):
        """Realistic scenario: a Pro user purchases a top-up mid-month,
        burns through their monthly pool, spills into bonus, and at the next
        monthly reset their bonus credits SURVIVE."""
        # Start of month: Pro user with full 2000 monthly.
        state = LedgerState(monthly=2000, monthly_max=2000, bonus=0, promo=0)

        # Buy a 1000 cr top-up
        op1 = add_purchased(state, 1000)
        state = op1.new_state
        assert state.monthly == 2000
        assert state.bonus == 1000

        # Spend 1500 cr over the month — all from monthly
        clock.advance(days=15)
        op2 = deduct(state, 1500, clock)
        state = op2.new_state
        assert state.monthly == 500
        assert state.bonus == 1000

        # Heavy week: spend another 1200 = 500 from monthly + 700 from bonus
        clock.advance(days=5)
        op3 = deduct(state, 1200, clock)
        state = op3.new_state
        assert state.monthly == 0
        assert state.bonus == 300
        assert op3.debited == {'monthly': 500, 'bonus': 700}

        # Monthly billing cycle resets
        clock.advance(days=11)
        op4 = monthly_reset(state, 2000, clock)
        state = op4.new_state
        # Monthly is back to full, bonus is preserved
        assert state.monthly == 2000
        assert state.bonus == 300  # THE KEY ASSERTION — top-up credits never expire

    def test_promo_expires_during_month(self, clock):
        """A promo grant that expires before the user spends all of it."""
        expires = clock.now() + timedelta(days=14)
        state = LedgerState(monthly=100, monthly_max=2000, promo=500, promo_expires_at=expires)

        # Spend 200 within the promo window → 100 monthly + 100 promo
        op1 = deduct(state, 200, clock)
        assert op1.success
        state = op1.new_state
        assert state.promo == 400

        # Travel past expiry
        clock.advance(days=20)
        # Next spend should sweep the promo first → only 0 + 0 + 0 available
        op2 = deduct(state, 50, clock)
        assert not op2.success
        assert op2.reason == 'insufficient_funds'
        # And the updates reflect the sweep so the persisted state is correct
        assert op2.updates.get('promoCredits') == 0
