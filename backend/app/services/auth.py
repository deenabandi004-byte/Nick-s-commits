"""
Authentication services - credit management only
(require_firebase_auth is in extensions.py to avoid circular dependencies)
"""
import logging
from datetime import datetime, timezone
from firebase_admin import firestore
from app.extensions import get_db
from app.config import TIER_CONFIGS

logger = logging.getLogger(__name__)


def _parse_datetime(date_value):
    """Helper to parse datetime from various formats"""
    if not date_value:
        return None

    if hasattr(date_value, 'timestamp'):
        return datetime.fromtimestamp(date_value.timestamp())
    elif isinstance(date_value, str):
        try:
            return datetime.fromisoformat(date_value.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            try:
                from dateutil import parser  # type: ignore
                return parser.parse(date_value)
            except ImportError:
                return datetime.fromisoformat(date_value.replace('Z', ''))
    return None


def _check_reset_needed(user_data) -> tuple[bool, int, dict]:
    """
    Pure check: determine if credits need resetting.
    Returns (needs_reset, credit_value, update_fields).
    Does NOT write to Firestore — caller is responsible for applying updates.
    """
    now = datetime.now()

    # Season Pass expiry — a one-time 4-month prepaid pass has no Stripe
    # subscription, so nothing downgrades it automatically. Enforce it lazily
    # here (same model as the monthly reset below): once past its expiry, drop
    # the user to Free on their next request.
    tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
    if tier == 'season_pass':
        expires = _parse_datetime(user_data.get('seasonPassExpiresAt'))
        if expires and now >= expires:
            free_credits = TIER_CONFIGS['free']['credits']
            return True, min(user_data.get('credits', 0), free_credits), {
                'subscriptionTier': 'free',
                'tier': 'free',
                'credits': min(user_data.get('credits', 0), free_credits),
                'maxCredits': free_credits,
                'lastCreditReset': now.isoformat(),
                'seasonPassExpiredAt': now.isoformat(),
            }

    last_reset = _parse_datetime(user_data.get('lastCreditReset'))

    if not last_reset:
        # First time — set timestamp, don't reset credits
        return False, user_data.get('credits', 0), {'lastCreditReset': now.isoformat()}

    is_new_month = (now.year > last_reset.year) or (
        now.year == last_reset.year and now.month > last_reset.month
    )

    if is_new_month:
        tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')
        max_credits = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])['credits']
        return True, max_credits, {
            'credits': max_credits,
            'lastCreditReset': now.isoformat(),
        }

    return False, user_data.get('credits', 0), {}


def check_and_reset_credits(user_ref, user_data):
    """Check if a new calendar month has started and reset credits if needed.

    NOTE: For use OUTSIDE transactions only. Inside transactions, use
    _check_reset_needed() and apply updates via the transaction object.
    """
    try:
        needs_reset, credits, updates = _check_reset_needed(user_data)
        if updates:
            user_ref.update(updates)
        if needs_reset:
            logger.info("Credits reset - %d credits restored", credits)
        return credits

    except Exception as e:
        logger.error("Error checking credit reset: %s", e)
        return user_data.get('credits', 0)


def check_and_reset_usage(user_ref, user_data):
    """Check if a new calendar month has started and reset usage counters (Pro/Elite only)."""
    try:
        tier = user_data.get('subscriptionTier') or user_data.get('tier', 'free')

        # Usage counters (coffee-chat preps, alumni searches) reset monthly for
        # EVERY tier, including Free. Previously Free was lifetime-capped, which
        # created a sour note: a trial user who spent Pro's 10 preps then dropped
        # to Free could never run another without paying. Monthly Free removes that.
        last_usage_reset = _parse_datetime(user_data.get('lastUsageReset'))
        now = datetime.now()

        # If no reset date, set it to now
        if not last_usage_reset:
            user_ref.update({'lastUsageReset': now.isoformat()})
            return

        # Use calendar month boundary (consistent with credit reset)
        is_new_month = (now.year > last_usage_reset.year) or (
            now.year == last_usage_reset.year and now.month > last_usage_reset.month
        )

        if is_new_month:
            # Reset usage counters (only for Pro/Elite)
            user_ref.update({
                'alumniSearchesUsed': 0,
                'coffeeChatPrepsUsed': 0,
                'interviewPrepsUsed': 0,
                'lastUsageReset': now.isoformat()
            })
            logger.info("Usage counters reset (%s tier)", tier)

    except Exception as e:
        logger.error("Error checking usage reset: %s", e)


# ── Phase 9: daily auto-send counter ────────────────────────────────────
#
# Loop auto-send (when autoSendMode == "send_for_me") is capped per day,
# per user, in their LOCAL timezone — sending until midnight UTC for a
# West Coast user would mean their "today" cap drains 5 hours earlier
# than it should.
#
# Two fields on users/{uid}:
#   sendsToday: int       — count of auto-sends this user-local day
#   sendsTodayDate: str   — "YYYY-MM-DD" in user's tz; mismatch triggers
#                           atomic rollover on next increment
#
# Source of truth for the cap is TIER_CONFIGS[tier]['max_auto_sends_per_day'],
# but a Loop can override downward via hardDailySendCap (checked in the
# send gate, not here — this helper just enforces the user-tier cap).

def _user_local_date_str(now_utc: datetime, tz_name: str | None) -> str:
    """Return 'YYYY-MM-DD' in the user's timezone. Falls back to PT if
    the timezone string is missing or invalid. Mirrors the pattern in
    loop_budget._user_local_hour."""
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name) if tz_name else ZoneInfo("America/Los_Angeles")
        return now_utc.astimezone(tz).strftime("%Y-%m-%d")
    except Exception:
        try:
            from zoneinfo import ZoneInfo
            return now_utc.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d")
        except Exception:
            return now_utc.strftime("%Y-%m-%d")


def get_sends_today(user_id: str, now: datetime | None = None) -> int:
    """Read the user's current auto-send count for today (user-local).

    Non-transactional. Returns 0 if the stored sendsTodayDate doesn't match
    today's user-local date (the actual rollover write happens lazily on the
    next increment_sends_today_atomic call — this read just tells callers
    what the gate would see).

    Used by the send gate for pre-flight checks. The real reservation is
    increment_sends_today_atomic, which is race-safe.
    """
    db = get_db()
    user_doc = db.collection('users').document(user_id).get()
    if not user_doc.exists:
        return 0
    user_data = user_doc.to_dict() or {}
    now_utc = now or datetime.now(timezone.utc)
    tz_name = user_data.get('timezone') or user_data.get('tz')
    today = _user_local_date_str(now_utc, tz_name)
    if user_data.get('sendsTodayDate') != today:
        return 0
    return int(user_data.get('sendsToday', 0) or 0)


def increment_sends_today_atomic(
    user_id: str,
    tier: str,
    hard_cap: int | None = None,
    now: datetime | None = None,
) -> tuple[bool, int, int]:
    """Atomically reserve one slot in today's auto-send budget.

    Args:
        user_id: Firebase uid.
        tier: 'free' | 'pro' | 'elite'.
        hard_cap: Optional per-Loop ceiling (Loop.hardDailySendCap). When set,
            the effective cap is min(tier_cap, hard_cap). When None, just tier.
        now: For test injection.

    Returns:
        (success, new_count, effective_cap)
        - success False means the cap was hit; no increment happened.
        - new_count is the post-increment value on success, or the existing
          count on failure.
        - effective_cap is the cap that gated this call (useful for the
          autoSendPausedReason copy).

    Rollover: if the stored sendsTodayDate doesn't match today (user-local),
    the increment overwrites sendsToday=1 and stamps sendsTodayDate=today in
    the same atomic write.

    Race-safe: uses a Firestore transaction so two simultaneous sends can't
    both bypass the cap.
    """
    db = get_db()
    user_ref = db.collection('users').document(user_id)
    now_utc = now or datetime.now(timezone.utc)

    tier_cap = int(TIER_CONFIGS.get(tier, TIER_CONFIGS['free']).get('max_auto_sends_per_day', 0))
    effective_cap = tier_cap if hard_cap is None else min(tier_cap, int(hard_cap))

    @firestore.transactional
    def reserve_in_transaction(transaction):
        user_doc = user_ref.get(transaction=transaction)
        if not user_doc.exists:
            return False, 0, effective_cap

        user_data = user_doc.to_dict() or {}
        tz_name = user_data.get('timezone') or user_data.get('tz')
        today = _user_local_date_str(now_utc, tz_name)
        stored_date = user_data.get('sendsTodayDate')
        stored_count = int(user_data.get('sendsToday', 0) or 0)

        current = stored_count if stored_date == today else 0

        if current >= effective_cap:
            return False, current, effective_cap

        new_count = current + 1
        transaction.update(user_ref, {
            'sendsToday': new_count,
            'sendsTodayDate': today,
            'lastAutoSendAt': now_utc.isoformat(),
        })
        return True, new_count, effective_cap

    try:
        transaction = db.transaction()
        return reserve_in_transaction(transaction)
    except Exception as e:
        logger.error("Error in atomic send-count reservation: %s", e)
        return False, 0, effective_cap


def can_access_feature(tier: str, feature: str, user_data: dict, tier_config: dict) -> tuple[bool, str]:
    """
    Check if user can access a feature based on tier and usage limits
    
    Returns:
        Tuple of (allowed: bool, reason: str)
    """
    # Feature access based on tier
    feature_map = {
        'firm_search': 'firm_search',
        'smart_filters': 'smart_filters',
        'bulk_drafting': 'bulk_drafting',
        'export': 'export_enabled',
        'priority_queue': 'priority_queue',
        'personalized_templates': 'personalized_templates',
        'weekly_insights': 'weekly_insights',
        'early_access': 'early_access',
    }
    
    # Check tier-based features
    if feature in feature_map:
        config_key = feature_map[feature]
        if not tier_config.get(config_key, False):
            required_tier = 'pro' if feature in ['firm_search', 'smart_filters', 'bulk_drafting', 'export'] else 'elite'
            return False, f'This feature requires {required_tier} tier'
        return True, 'allowed'
    
    # Check usage-based features
    usage_map = {
        'alumni_search': ('alumniSearchesUsed', 'alumni_searches'),
        'coffee_chat_prep': ('coffeeChatPrepsUsed', 'coffee_chat_preps'),
    }
    
    if feature in usage_map:
        used_field, limit_key = usage_map[feature]
        used = user_data.get(used_field, 0)
        limit = tier_config.get(limit_key, 0)
        
        if limit == 'unlimited':
            return True, 'allowed'
        
        if used >= limit:
            return False, f'Monthly limit reached ({limit} uses)'
        
        return True, 'allowed'
    
    return True, 'allowed'  # Default: allow if not specifically restricted


def _maybe_fire_low_credits(user_id: str, user_ref) -> None:
    """Re-read user doc post-deduct and fire the low-credits lifecycle email
    when the *total* across all buckets dips below 10% of monthly max.
    Best-effort — never raises into the caller."""
    try:
        snap = user_ref.get()
        if not snap.exists:
            return
        udata = snap.to_dict() or {}
        max_cr = max(1, int(udata.get('maxCredits') or 0))
        # Use the LEDGER's total (monthly + bonus + promo), not just monthly,
        # so users with healthy bonus balances don't get spammed.
        from app.services.credit_ledger import state_from_user_dict
        total = state_from_user_dict(udata).total()
        if total > 0 and total / max_cr < 0.10:
            from app.services.lifecycle_emails import notify_low_credits
            notify_low_credits(user_id, total, max_cr)
    except Exception as e:
        logger.warning("Low-credits notify failed for %s: %s", user_id, e)


def deduct_credits_atomic(user_id: str, amount: int, operation_name: str = "operation") -> tuple[bool, int]:
    """
    Atomically deduct credits from user account using Firestore transaction.
    Prevents race conditions when multiple requests try to deduct credits simultaneously.

    Trial-aware: if the user has an active Pro trial, deduction runs against the
    trial daily pool instead of the monthly pool. If the trial has expired but
    hasn't been processed yet, we run the lazy expiry transition first, then
    deduct from the (now Free) monthly pool.

    Ledger-aware (Wave 2): non-trial deduction runs through the three-bucket
    ledger (monthly → bonusCredits → promoCredits) so purchased top-up credits
    survive monthly resets and never expire — matching the TOS promise.

    Returns:
        Tuple of (success: bool, remaining_credits: int)
        If success is False, remaining_credits is the current balance
    """
    # Trial fast-path — checked before the transaction so we can route to the
    # trial-specific deduct helper which manages its own transaction.
    db = get_db()
    user_ref = db.collection('users').document(user_id)
    try:
        snap = user_ref.get()
        if snap.exists:
            user_data = snap.to_dict() or {}
            # Lazy import to avoid circular dependency at module load
            from app.services.trial_service import get_trial_status, deduct_trial_credits, apply_trial_expiry
            trial_status = get_trial_status(user_data)

            if trial_status.get('is_active'):
                success, remaining = deduct_trial_credits(user_id, amount)
                if success or remaining > 0:
                    _maybe_fire_low_credits(user_id, user_ref)
                    return success, remaining
                # Fall through to normal monthly pool if trial deduct returned (False, 0)
                # — shouldn't happen for active trials but defensive.

            if trial_status.get('is_expired_unprocessed'):
                # Auto-downgrade to Free before charging credits
                apply_trial_expiry(user_id)
                # Continue to normal monthly flow below — user is now Free tier
    except Exception as e:
        logger.warning(f"Trial fast-path failed for {user_id}, falling back to monthly: {e}")

    # Three-bucket ledger deduct (monthly → bonus → promo)
    try:
        from app.services.credit_ledger import apply_deduct_atomic
        success, remaining = apply_deduct_atomic(user_id, amount, reason=operation_name)
        if success:
            _maybe_fire_low_credits(user_id, user_ref)
        return success, remaining
    except Exception as e:
        logger.error("Ledger deduct failed for %s, falling back to legacy path: %s", user_id, e)

    # Legacy fallback path follows — only reached if the ledger module throws
    # something unexpected. Preserved verbatim from the pre-Wave-2 behavior.
    db = get_db()
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def deduct_in_transaction(transaction):
        user_doc = user_ref.get(transaction=transaction)

        if not user_doc.exists:
            logger.warning("User not found for credit deduction")
            return False, 0

        user_data = user_doc.to_dict()

        # Check reset inside transaction — returns updates to apply atomically
        needs_reset, current_credits, reset_updates = _check_reset_needed(user_data)

        if current_credits < amount:
            # Still apply reset updates (so timestamp gets set) even if insufficient
            if reset_updates:
                transaction.update(user_ref, reset_updates)
            logger.info("Insufficient credits for %s: need %d, have %d", operation_name, amount, current_credits)
            return False, current_credits

        # Merge reset updates with deduction in a single atomic write
        new_credits = current_credits - amount
        update_fields = {
            'credits': new_credits,
            'lastCreditUpdate': datetime.now().isoformat(),
        }
        # Include any reset fields (lastCreditReset) in same write
        if reset_updates:
            update_fields.update(reset_updates)
            # Override credits if reset happened — deduct from reset amount
            if needs_reset:
                update_fields['credits'] = new_credits

        transaction.update(user_ref, update_fields)

        logger.info("Deducted %d credits for %s: %d -> %d", amount, operation_name, current_credits, new_credits)
        return True, new_credits

    try:
        transaction = db.transaction()
        success, credits = deduct_in_transaction(transaction)

        # Low-credits lifecycle email trigger — fire once when the balance
        # crosses the 10% threshold. Idempotent per billing month via the
        # campaign step key. Best-effort: don't fail the deduction if the
        # notify call errors.
        if success and credits > 0:
            try:
                snap = user_ref.get()
                if snap.exists:
                    udata = snap.to_dict() or {}
                    max_cr = max(1, int(udata.get('maxCredits') or 0))
                    if credits / max_cr < 0.10:
                        from app.services.lifecycle_emails import notify_low_credits
                        notify_low_credits(user_id, credits, max_cr)
            except Exception as e:
                logger.warning("Low-credits notify failed for %s: %s", user_id, e)

        return success, credits
    except Exception as e:
        logger.error("Error in atomic credit deduction: %s", e)
        # Fallback to non-transactional (less safe but won't crash)
        try:
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                current_credits = check_and_reset_credits(user_ref, user_data)
                return False, current_credits
        except Exception:
            pass
        return False, 0


def refund_credits_atomic(user_id: str, amount: int, operation_name: str = "refund") -> tuple[bool, int]:
    """
    Atomically refund credits to user account using Firestore transaction.

    Returns:
        Tuple of (success: bool, new_credits: int)
    """
    db = get_db()
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def refund_in_transaction(transaction):
        user_doc = user_ref.get(transaction=transaction)

        if not user_doc.exists:
            logger.warning("User not found for credit refund")
            return False, 0

        user_data = user_doc.to_dict()

        # Check reset inside transaction — apply atomically
        _needs_reset, current_credits, reset_updates = _check_reset_needed(user_data)

        new_credits = current_credits + amount
        update_fields = {
            'credits': new_credits,
            'lastCreditUpdate': datetime.now().isoformat(),
        }
        if reset_updates:
            update_fields.update(reset_updates)
            update_fields['credits'] = new_credits  # our refund takes precedence

        transaction.update(user_ref, update_fields)

        logger.info("Refunded %d credits for %s: %d -> %d", amount, operation_name, current_credits, new_credits)
        return True, new_credits

    try:
        transaction = db.transaction()
        success, credits = refund_in_transaction(transaction)
        return success, credits
    except Exception as e:
        logger.error("Error in atomic credit refund: %s", e)
        return False, 0
