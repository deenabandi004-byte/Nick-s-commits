"""
Models package - data models, schemas, and normalization functions
"""
from app.models.contact import normalize_contact
from app.models.users import (
    create_user_data,
    update_user_tier_data,
    validate_user_tier,
    get_default_credits_for_tier
)
from app.models.meeting_prep import (
    create_meeting_prep_data,
    update_meeting_prep_status,
    validate_prep_status,
    format_meeting_prep_response
)
from app.models.enums import ContactStatus, UserTier, SearchType

__all__ = [
    # Contact models
    'normalize_contact',
    # User models
    'create_user_data',
    'update_user_tier_data',
    'validate_user_tier',
    'get_default_credits_for_tier',
    # Meeting prep models
    'create_meeting_prep_data',
    'update_meeting_prep_status',
    'validate_prep_status',
    'format_meeting_prep_response',
    # Enums
    'ContactStatus',
    'UserTier',
    'SearchType'
]

