"""
Credit ledger — three-bucket spend order with injectable clock.

Three credit buckets per user:
  1. monthly  — `credits` / `maxCredits` fields. Resets at calendar boundary.
  2. bonus    — `bonusCredits`. Purchased via top-up packs. NEVER expires.
                Backed by CA prepaid-credit law + the explicit TOS promise.
  3. promo    — `promoCredits`. Granted (referrals, win-back, retention).
                Has `promoCreditsExpiresAt`. Swept on access.

Spend order is monthly → bonus → promo. The ledger spreads a deduction
across buckets when no single bucket can cover it.

Design:
  - All math lives in PURE FUNCTIONS that take a `LedgerState` snapshot + a
    clock and return a new `LedgerState`. No Firestore I/O. Unit-testable
    without mocks beyond a `FakeClock`.
  - The Firestore wrapper (`apply_ledger_op`) reads a user doc into a
    LedgerState, runs the pure function, writes the new state back atomically
    in a transaction. ONE place that touches Firestore.
  - The existing `auth.deduct_credits_atomic` delegates to this module via a
    thin shim so every existing call site keeps working.
  - Trial credits stay in `trial_service.py` — they're a SEPARATE pool that
    overrides everything during trial, not a fourth bucket here.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Optional, Protocol

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Clock — injectable so tests can fast-forward time without touching wall clock
# ---------------------------------------------------------------------------

class Clock(Protocol):
    def now(self) -> datetime: ...


class SystemClock:
    """Real wall-clock implementation. Use everywhere in prod."""
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class FakeClock:
    """Test double — `clock.advance(days=7)` to fast-forward. Always UTC."""

    def __init__(self, start: Optional[datetime] = None):
        self._t = start or datetime(2026, 1, 1, tzinfo=timezone.utc)

    def now(self) -> datetime:
        return self._t

    def advance(self, *, seconds: int = 0, hours: int = 0, days: int = 0) -> None:
        from datetime import timedelta
        self._t = self._t + timedelta(seconds=seconds, hours=hours, days=days)

    def set(self, when: datetime) -> None:
        self._t = when


# ---------------------------------------------------------------------------
# LedgerState — the snapshot the pure functions operate on
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LedgerState:
    monthly: int = 0                       # credits — monthly pool current balance
    monthly_max: int = 0                   # maxCredits — current monthly allocation
    bonus: int = 0                         # bonusCredits — purchased, never expires
    promo: int = 0                         # promoCredits — granted, has expires_at
    promo_expires_at: Optional[datetime] = None

    def total(self) -> int:
        return max(0, self.monthly) + max(0, self.bonus) + max(0, self.promo)


@dataclass(frozen=True)
class LedgerOp:
    """The result of running a pure ledger op — the new state + any
    Firestore field updates the wrapper should write. The wrapper does NOT
    need to diff the state itself; this dataclass lists exactly what changed
    so writes stay minimal."""
    new_state: LedgerState
    updates: dict = field(default_factory=dict)
    success: bool = True
    reason: Optional[str] = None
    debited: dict = field(default_factory=dict)  # bucket → amount actually deducted


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def _coerce_int(v) -> int:
    """Safe int coercion. Firestore can give us int, float, or None."""
    if v is None:
        return 0
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _coerce_dt(v) -> Optional[datetime]:
    """Coerce a Firestore-shaped value to a timezone-aware datetime."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            dt = datetime.fromisoformat(v.replace('Z', '+00:00'))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            return None
    if hasattr(v, 'timestamp'):  # Firestore Timestamp
        try:
            return datetime.fromtimestamp(v.timestamp(), tz=timezone.utc)
        except Exception:
            return None
    return None


def state_from_user_dict(user_data: dict) -> LedgerState:
    """Read a Firestore user doc dict into a LedgerState. Missing fields = 0."""
    return LedgerState(
        monthly=_coerce_int(user_data.get('credits')),
        monthly_max=_coerce_int(user_data.get('maxCredits')),
        bonus=_coerce_int(user_data.get('bonusCredits')),
        promo=_coerce_int(user_data.get('promoCredits')),
        promo_expires_at=_coerce_dt(user_data.get('promoCreditsExpiresAt')),
    )


def _expire_promo_if_needed(state: LedgerState, clock: Clock) -> tuple[LedgerState, dict]:
    """Zero out the promo bucket if its expires_at has passed. Returns
    (new_state, field_updates)."""
    if state.promo <= 0 or state.promo_expires_at is None:
        return state, {}
    if clock.now() < state.promo_expires_at:
        return state, {}
    return replace(state, promo=0, promo_expires_at=None), {
        'promoCredits': 0,
        'promoCreditsExpiresAt': None,
    }


# ---------------------------------------------------------------------------
# Pure ops — deduct, add_purchased, add_promotional, monthly_reset, expire_promos
# ---------------------------------------------------------------------------

def deduct(state: LedgerState, amount: int, clock: Clock) -> LedgerOp:
    """Spend `amount` credits, draining monthly → bonus → promo in order.

    Returns LedgerOp.success=False if the total balance is less than `amount`;
    in that case the state and updates are still returned with promo expiry
    applied so the caller can persist the cleanup write."""
    if amount < 0:
        return LedgerOp(new_state=state, success=False, reason='negative_amount')

    # Always sweep expired promos first — they shouldn't count toward total.
    state, expire_updates = _expire_promo_if_needed(state, clock)

    if state.total() < amount:
        return LedgerOp(
            new_state=state,
            updates=expire_updates,
            success=False,
            reason='insufficient_funds',
        )

    remaining = amount
    debited: dict[str, int] = {}
    new_monthly, new_bonus, new_promo = state.monthly, state.bonus, state.promo

    # 1. Monthly pool
    take = min(new_monthly, remaining)
    if take > 0:
        new_monthly -= take
        remaining -= take
        debited['monthly'] = take

    # 2. Bonus (purchased — never expires)
    if remaining > 0:
        take = min(new_bonus, remaining)
        if take > 0:
            new_bonus -= take
            remaining -= take
            debited['bonus'] = take

    # 3. Promo (granted — already-not-expired after the sweep above)
    if remaining > 0:
        take = min(new_promo, remaining)
        if take > 0:
            new_promo -= take
            remaining -= take
            debited['promo'] = take

    new_state = replace(state, monthly=new_monthly, bonus=new_bonus, promo=new_promo)

    updates = dict(expire_updates)
    if 'monthly' in debited:
        updates['credits'] = new_monthly
    if 'bonus' in debited:
        updates['bonusCredits'] = new_bonus
    if 'promo' in debited:
        updates['promoCredits'] = new_promo

    return LedgerOp(
        new_state=new_state,
        updates=updates,
        success=True,
        reason='ok',
        debited=debited,
    )


def add_purchased(state: LedgerState, amount: int) -> LedgerOp:
    """Add `amount` to the bonus bucket — purchased top-up credits. These
    never expire."""
    if amount <= 0:
        return LedgerOp(new_state=state, success=False, reason='non_positive_amount')
    new_state = replace(state, bonus=state.bonus + amount)
    return LedgerOp(
        new_state=new_state,
        updates={'bonusCredits': new_state.bonus},
        success=True,
        reason='ok',
        debited={'bonus': -amount},
    )


def add_promotional(state: LedgerState, amount: int, expires_at: datetime) -> LedgerOp:
    """Add `amount` to the promo bucket with an expiry. If there's already
    a promo balance, the EARLIER expiry wins (conservative: don't extend
    expiry by stacking grants)."""
    if amount <= 0:
        return LedgerOp(new_state=state, success=False, reason='non_positive_amount')
    if expires_at is None:
        return LedgerOp(new_state=state, success=False, reason='missing_expires_at')

    new_promo = state.promo + amount
    new_expires = expires_at
    if state.promo_expires_at and state.promo_expires_at < expires_at:
        new_expires = state.promo_expires_at
    new_state = replace(state, promo=new_promo, promo_expires_at=new_expires)
    return LedgerOp(
        new_state=new_state,
        updates={
            'promoCredits': new_state.promo,
            'promoCreditsExpiresAt': new_state.promo_expires_at,
        },
        success=True,
        reason='ok',
        debited={'promo': -amount},
    )


def monthly_reset(state: LedgerState, new_max: int, clock: Clock) -> LedgerOp:
    """Reset the monthly pool to `new_max`. Does NOT touch bonus or promo —
    those are explicitly preserved across resets. Sweeps expired promos."""
    if new_max < 0:
        return LedgerOp(new_state=state, success=False, reason='negative_new_max')

    state, expire_updates = _expire_promo_if_needed(state, clock)
    new_state = replace(state, monthly=new_max, monthly_max=new_max)
    updates = dict(expire_updates)
    updates['credits'] = new_max
    updates['maxCredits'] = new_max
    updates['lastCreditReset'] = clock.now().isoformat()
    return LedgerOp(new_state=new_state, updates=updates, success=True, reason='ok')


def expire_promos(state: LedgerState, clock: Clock) -> LedgerOp:
    """Standalone promo-sweep op. Idempotent — no-op if nothing expired."""
    new_state, expire_updates = _expire_promo_if_needed(state, clock)
    return LedgerOp(
        new_state=new_state,
        updates=expire_updates,
        success=True,
        reason='expired' if expire_updates else 'ok',
    )


# ---------------------------------------------------------------------------
# Firestore-facing wrapper — the single place that touches Firestore for ledger ops
# ---------------------------------------------------------------------------

def apply_deduct_atomic(user_id: str, amount: int, reason: str = 'operation',
                        clock: Optional[Clock] = None) -> tuple[bool, int]:
    """Atomically deduct credits using a Firestore transaction.

    Returns (success, new_total_balance). On insufficient funds, success is
    False and the second element is the CURRENT balance.

    This is the function `auth.deduct_credits_atomic` delegates to.
    """
    from firebase_admin import firestore
    from app.extensions import get_db
    from app.services.auth import _check_reset_needed  # back-compat for monthly reset

    if clock is None:
        clock = SystemClock()

    db = get_db()
    if not db:
        return False, 0
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def deduct_in_tx(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            return False, 0
        user_data = snap.to_dict() or {}

        # Apply the existing monthly-reset check first so the ledger sees a
        # freshly-reset monthly pool when appropriate.
        needs_reset, _current, reset_updates = _check_reset_needed(user_data)
        if reset_updates:
            for k, v in reset_updates.items():
                user_data[k] = v

        state = state_from_user_dict(user_data)
        op = deduct(state, amount, clock)

        # Compose the full Firestore update: any monthly-reset fields + the
        # ledger's own updates + an operation audit field.
        updates = dict(reset_updates or {})
        updates.update(op.updates)
        updates['lastCreditUpdate'] = clock.now().isoformat()

        if updates:
            transaction.update(user_ref, updates)

        return op.success, op.new_state.total()

    try:
        transaction = db.transaction()
        success, new_total = deduct_in_tx(transaction)
        logger.info(
            "Ledger deduct: user=%s amount=%d success=%s new_total=%d reason=%s",
            user_id, amount, success, new_total, reason,
        )
        return success, new_total
    except Exception as e:
        logger.error("Ledger deduct error for %s: %s", user_id, e)
        # Best-effort current balance for the failure path
        try:
            snap = user_ref.get()
            if snap.exists:
                state = state_from_user_dict(snap.to_dict() or {})
                return False, state.total()
        except Exception:
            pass
        return False, 0


def apply_add_purchased_atomic(user_id: str, amount: int,
                                clock: Optional[Clock] = None) -> tuple[bool, int]:
    """Add purchased (top-up) credits to the bonus bucket. Atomic."""
    from firebase_admin import firestore
    from app.extensions import get_db

    if clock is None:
        clock = SystemClock()
    db = get_db()
    if not db:
        return False, 0
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def add_in_tx(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            return False, 0
        user_data = snap.to_dict() or {}
        state = state_from_user_dict(user_data)
        op = add_purchased(state, amount)
        if op.updates:
            op.updates['lastCreditUpdate'] = clock.now().isoformat()
            transaction.update(user_ref, op.updates)
        return op.success, op.new_state.total()

    try:
        return add_in_tx(db.transaction())
    except Exception as e:
        logger.error("Ledger add_purchased error for %s: %s", user_id, e)
        return False, 0


def apply_add_promotional_atomic(user_id: str, amount: int, expires_at: datetime,
                                  clock: Optional[Clock] = None) -> tuple[bool, int]:
    """Add granted promo credits with an expiry. Atomic."""
    from firebase_admin import firestore
    from app.extensions import get_db

    if clock is None:
        clock = SystemClock()
    db = get_db()
    if not db:
        return False, 0
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def add_in_tx(transaction):
        snap = user_ref.get(transaction=transaction)
        if not snap.exists:
            return False, 0
        user_data = snap.to_dict() or {}
        state = state_from_user_dict(user_data)
        op = add_promotional(state, amount, expires_at)
        if op.updates:
            op.updates['lastCreditUpdate'] = clock.now().isoformat()
            transaction.update(user_ref, op.updates)
        return op.success, op.new_state.total()

    try:
        return add_in_tx(db.transaction())
    except Exception as e:
        logger.error("Ledger add_promotional error for %s: %s", user_id, e)
        return False, 0


def get_balance_breakdown(user_id: str, clock: Optional[Clock] = None) -> dict:
    """Read-only — returns {monthly, monthly_max, bonus, promo, total} for UI."""
    from app.extensions import get_db
    if clock is None:
        clock = SystemClock()
    db = get_db()
    if not db:
        return {'monthly': 0, 'monthly_max': 0, 'bonus': 0, 'promo': 0, 'total': 0}
    snap = db.collection('users').document(user_id).get()
    if not snap.exists:
        return {'monthly': 0, 'monthly_max': 0, 'bonus': 0, 'promo': 0, 'total': 0}
    state = state_from_user_dict(snap.to_dict() or {})
    # Apply promo-expiry view-side but DON'T write — the next deduct will write it.
    state, _ = _expire_promo_if_needed(state, clock)
    return {
        'monthly': state.monthly,
        'monthly_max': state.monthly_max,
        'bonus': state.bonus,
        'promo': state.promo,
        'promo_expires_at': state.promo_expires_at.isoformat() if state.promo_expires_at else None,
        'total': state.total(),
    }
