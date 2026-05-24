"""
Authentication services - credit management only
(require_firebase_auth is in extensions.py to avoid circular dependencies)
"""
import logging
from datetime import datetime
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
    Does NOT write to Firestore - caller is responsible for applying updates.
    """
    now = datetime.now()
    last_reset = _parse_datetime(user_data.get('lastCreditReset'))

    if not last_reset:
        # First time - set timestamp, don't reset credits
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

        # Free tier limits are LIFETIME - never reset
        if tier == 'free':
            return

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
                'lastUsageReset': now.isoformat()
            })
            logger.info("Usage counters reset (%s tier)", tier)

    except Exception as e:
        logger.error("Error checking usage reset: %s", e)


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
        'meeting_prep': ('coffeeChatPrepsUsed', 'coffee_chat_preps'),
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


def deduct_credits_atomic(user_id: str, amount: int, operation_name: str = "operation") -> tuple[bool, int]:
    """
    Atomically deduct credits from user account using Firestore transaction.
    Prevents race conditions when multiple requests try to deduct credits simultaneously.

    Returns:
        Tuple of (success: bool, remaining_credits: int)
        If success is False, remaining_credits is the current balance
    """
    db = get_db()
    user_ref = db.collection('users').document(user_id)

    @firestore.transactional
    def deduct_in_transaction(transaction):
        user_doc = user_ref.get(transaction=transaction)

        if not user_doc.exists:
            logger.warning("User not found for credit deduction")
            return False, 0

        user_data = user_doc.to_dict()

        # Check reset inside transaction - returns updates to apply atomically
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
            # Override credits if reset happened - deduct from reset amount
            if needs_reset:
                update_fields['credits'] = new_credits

        transaction.update(user_ref, update_fields)

        logger.info("Deducted %d credits for %s: %d -> %d", amount, operation_name, current_credits, new_credits)
        return True, new_credits

    try:
        transaction = db.transaction()
        success, credits = deduct_in_transaction(transaction)
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

        # Check reset inside transaction - apply atomically
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
