"""
Credit Management Service

Centralized credit handling for all features (contacts, firms, coffee chat, etc.)
Provides atomic credit operations with Firestore to prevent race conditions.
"""

from google.cloud import firestore
from typing import Dict, Tuple, Optional

# ===================================
# CREDIT CONFIGURATION
# ===================================

# Contact Search Credits
CREDITS_PER_CONTACT = 15

# Firm Search Credits  
CREDITS_PER_FIRM = 5

# Firm Search Batch Size Limits
FREE_FIRM_BATCH_OPTIONS = [5, 10]
FREE_FIRM_BATCH_DEFAULT = 10
FREE_FIRM_BATCH_MAX = 10

PRO_FIRM_BATCH_MIN = 5
PRO_FIRM_BATCH_MAX = 40
PRO_FIRM_BATCH_DEFAULT = 10

# Coffee Chat Credits
COFFEE_CHAT_CREDITS = 30

# Tier Definitions
TIER_FREE = 'free'
TIER_PRO = 'pro'

DEFAULT_FREE_CREDITS = 150
DEFAULT_PRO_CREDITS = 1800


# ===================================
# CREDIT OPERATIONS
# ===================================

def get_user_credits(db, user_id: str) -> Tuple[int, str, int]:
    """
    Get user's current credit balance, tier, and max credits.
    
    Args:
        db: Firestore database instance
        user_id: Firebase user ID
        
    Returns:
        Tuple of (current_credits, tier, max_credits)
    """
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        # User doesn't exist yet - return defaults
        return DEFAULT_FREE_CREDITS, TIER_FREE, DEFAULT_FREE_CREDITS
    
    user_data = user_doc.to_dict()
    credits = user_data.get('credits', DEFAULT_FREE_CREDITS)
    tier = user_data.get('tier', TIER_FREE)
    max_credits = user_data.get('maxCredits', DEFAULT_FREE_CREDITS)
    
    return credits, tier, max_credits


def has_enough_credits(db, user_id: str, required_credits: int) -> Tuple[bool, int, str]:
    """
    Check if user has sufficient credits.
    
    Args:
        db: Firestore database instance
        user_id: Firebase user ID
        required_credits: Number of credits needed
        
    Returns:
        Tuple of (has_enough, current_credits, error_message)
    """
    current_credits, tier, max_credits = get_user_credits(db, user_id)
    
    if current_credits < required_credits:
        error_msg = (
            f"Insufficient credits. You need {required_credits} credits "
            f"but only have {current_credits}."
        )
        return False, current_credits, error_msg
    
    return True, current_credits, ""


def deduct_credits(db, user_id: str, amount: int) -> int:
    """
    Atomically deduct credits from user's balance.
    
    Args:
        db: Firestore database instance
        user_id: Firebase user ID
        amount: Number of credits to deduct (positive number)
        
    Returns:
        New credit balance after deduction
        
    Raises:
        ValueError: If amount is negative or zero
    """
    if amount <= 0:
        raise ValueError(f"Credit deduction amount must be positive, got {amount}")
    
    user_ref = db.collection('users').document(user_id)
    
    # Use Firestore Increment for atomic update
    user_ref.update({
        'credits': firestore.Increment(-amount)
    })
    
    # Get updated balance
    user_doc = user_ref.get()
    if user_doc.exists:
        new_balance = user_doc.to_dict().get('credits', 0)
        # Ensure balance doesn't go negative
        if new_balance < 0:
            user_ref.update({'credits': 0})
            return 0
        return new_balance
    
    return 0


def add_credits(db, user_id: str, amount: int) -> int:
    """
    Atomically add credits to user's balance (for refunds, purchases, etc.)
    
    Args:
        db: Firestore database instance
        user_id: Firebase user ID
        amount: Number of credits to add (positive number)
        
    Returns:
        New credit balance after addition
        
    Raises:
        ValueError: If amount is negative or zero
    """
    if amount <= 0:
        raise ValueError(f"Credit addition amount must be positive, got {amount}")
    
    user_ref = db.collection('users').document(user_id)
    
    # Use Firestore Increment for atomic update
    user_ref.update({
        'credits': firestore.Increment(amount)
    })
    
    # Get updated balance
    user_doc = user_ref.get()
    if user_doc.exists:
        return user_doc.to_dict().get('credits', 0)
    
    return 0


# ===================================
# FIRM SEARCH SPECIFIC
# ===================================

def validate_firm_batch_size(tier: str, batch_size: int) -> Tuple[bool, Optional[str]]:
    """
    Validate that the requested batch size is allowed for the user's tier.
    
    Args:
        tier: User's tier ('free' or 'pro')
        batch_size: Requested number of firms
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if tier == TIER_FREE:
        if batch_size not in FREE_FIRM_BATCH_OPTIONS:
            return False, (
                f"Free tier can only request {' or '.join(map(str, FREE_FIRM_BATCH_OPTIONS))} firms. "
                f"You requested {batch_size}."
            )
    elif tier == TIER_PRO:
        if batch_size < PRO_FIRM_BATCH_MIN or batch_size > PRO_FIRM_BATCH_MAX:
            return False, (
                f"Pro tier can request between {PRO_FIRM_BATCH_MIN} and {PRO_FIRM_BATCH_MAX} firms. "
                f"You requested {batch_size}."
            )
        # Pro tier must be in increments of 5
        if batch_size % 5 != 0:
            return False, (
                f"Pro tier batch size must be in increments of 5. "
                f"You requested {batch_size}."
            )
    else:
        return False, f"Unknown tier: {tier}"
    
    return True, None


def calculate_firm_search_cost(batch_size: int) -> int:
    """
    Calculate the credit cost for a firm search.
    
    Args:
        batch_size: Number of firms requested
        
    Returns:
        Total credit cost
    """
    return batch_size * CREDITS_PER_FIRM


def get_firm_batch_options(tier: str) -> Dict:
    """
    Get the available batch size options for a tier.
    
    Args:
        tier: User's tier ('free' or 'pro')
        
    Returns:
        Dictionary with min, max, default, and options
    """
    if tier == TIER_FREE:
        return {
            'options': FREE_FIRM_BATCH_OPTIONS,
            'default': FREE_FIRM_BATCH_DEFAULT,
            'min': min(FREE_FIRM_BATCH_OPTIONS),
            'max': max(FREE_FIRM_BATCH_OPTIONS),
        }
    elif tier == TIER_PRO:
        # Pro tier can slide smoothly from 5 to 40 in increments of 5
        return {
            'options': list(range(PRO_FIRM_BATCH_MIN, PRO_FIRM_BATCH_MAX + 1, 5)),  # 5, 10, 15, 20, 25, 30, 35, 40
            'default': PRO_FIRM_BATCH_DEFAULT,
            'min': PRO_FIRM_BATCH_MIN,
            'max': PRO_FIRM_BATCH_MAX,
        }
    else:
        # Default to free tier
        return {
            'options': FREE_FIRM_BATCH_OPTIONS,
            'default': FREE_FIRM_BATCH_DEFAULT,
            'min': min(FREE_FIRM_BATCH_OPTIONS),
            'max': max(FREE_FIRM_BATCH_OPTIONS),
        }


# ===================================
# CONTACT SEARCH SPECIFIC
# ===================================

def calculate_contact_search_cost(num_contacts: int) -> int:
    """
    Calculate the credit cost for a contact search.
    
    Args:
        num_contacts: Number of contacts requested
        
    Returns:
        Total credit cost
    """
    return num_contacts * CREDITS_PER_CONTACT

