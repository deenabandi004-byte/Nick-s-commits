"""
User data models and schemas
"""
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.enums import UserTier


def _is_edu_email(email: Optional[str]) -> bool:
    if not email:
        return False
    lower = email.lower().strip()
    if lower.endswith('.edu'):
        return True
    # Catch international academic domains like .edu.au, .ac.uk-style fallback handled separately
    import re
    return bool(re.search(r'\.edu\.[a-z]{2,3}$', lower))


def create_user_data(
    uid: str,
    email: str,
    tier: str = 'free',
    name: Optional[str] = None,
    credits: Optional[int] = None,
    max_credits: Optional[int] = None
) -> Dict[str, Any]:
    """
    Create a new user data structure for Firestore

    Args:
        uid: Firebase user ID
        email: User email address
        tier: User tier ('free', 'pro', or 'elite')
        name: User display name
        credits: Initial credits (defaults based on tier)
        max_credits: Maximum credits (defaults based on tier)

    Returns:
        Dictionary with user data structure
    """
    from app.config import TIER_CONFIGS

    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    default_credits = tier_config.get('credits', 500)

    is_student = _is_edu_email(email)

    user_data = {
        'uid': uid,
        'email': email,
        'subscriptionTier': tier,  # Use subscriptionTier for consistency
        'tier': tier,  # Keep tier for backward compatibility
        'credits': credits if credits is not None else default_credits,
        'maxCredits': max_credits if max_credits is not None else default_credits,
        'createdAt': datetime.now().isoformat(),
        'lastCreditReset': datetime.now().isoformat(),
        'lastUsageReset': datetime.now().isoformat(),  # Track usage reset date
        'subscriptionStatus': 'active' if tier in ['pro', 'elite'] else None,
        # Usage tracking fields
        'alumniSearchesUsed': 0,
        'coffeeChatPrepsUsed': 0,
        'interviewPrepsUsed': 0,
        # Student verification - locks in lifetime student price
        'isStudent': is_student,
        'verifiedEduEmail': email if is_student else None,
    }

    if name:
        user_data['name'] = name

    return user_data


def update_user_tier_data(tier: str, credits: Optional[int] = None) -> Dict[str, Any]:
    """
    Create update data for tier changes
    
    Args:
        tier: New tier ('free', 'pro', or 'elite')
        credits: New credits amount (defaults based on tier)
    
    Returns:
        Dictionary with tier update data
    """
    from app.config import TIER_CONFIGS
    
    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS['free'])
    default_credits = tier_config.get('credits', 300)
    
    update_data = {
        'subscriptionTier': tier,
        'tier': tier,  # Keep for backward compatibility
        'credits': credits if credits is not None else default_credits,
        'maxCredits': default_credits,
        'subscriptionStatus': 'active' if tier in ['pro', 'elite'] else None,
        'upgraded_at': datetime.now().isoformat() if tier in ['pro', 'elite'] else None,
        'lastCreditReset': datetime.now().isoformat()
    }
    
    return update_data


def validate_user_tier(tier: str) -> bool:
    """Validate that tier is a valid value"""
    return tier in ['free', 'pro', 'elite']


def get_default_credits_for_tier(tier: str) -> int:
    """Get default credits for a tier"""
    from app.config import TIER_CONFIGS
    return TIER_CONFIGS.get(tier, TIER_CONFIGS['free']).get('credits', 300)

