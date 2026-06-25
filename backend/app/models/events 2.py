"""
Event taxonomy for the personalization data layer.

Events are user-level behavioral signals stored in Firestore at
users/{uid}/events/{event_id}. All events carry an expiresAt field
for Firestore TTL (90 days).
"""

from enum import Enum
from typing import Optional


class EventType(str, Enum):
    # --- Frontend-originating events ---
    EMAIL_EDITED = "email_edited"
    EMAIL_SENT = "email_sent"
    CONTACT_ADDED = "contact_added"
    CONTACT_VIEWED = "contact_viewed"
    PROFILE_CONFIRMED = "profile_confirmed"
    PROMPT_ANSWERED = "prompt_answered"
    COFFEE_CHAT_SCHEDULED = "coffee_chat_scheduled"
    SEARCH_EXECUTED = "search_executed"
    RECOMMENDATION_CLICKED = "recommendation_clicked"
    CTA_CLICKED = "cta_clicked"
    CTA_DISMISSED = "cta_dismissed"
    VOICE_MODEL_UPDATED = "voice_model_updated"
    PAGE_VIEW = "page_view"

    # --- Backend-only events (frontend cannot write these) ---
    EMAIL_DRAFTED = "email_drafted"
    REPLY_RECEIVED = "reply_received"
    REPLY_ATTRIBUTION_UNCERTAIN = "reply_attribution_uncertain"
    ALUMNI_GRAPH_CONSENT_CHANGED = "alumni_graph_consent_changed"
    DERIVED_PROFILE_SYNTHESIZED = "derived_profile_synthesized"


# Events the frontend is allowed to write via POST /api/events/batch
FRONTEND_ALLOWLIST = frozenset({
    EventType.EMAIL_EDITED,
    EventType.EMAIL_SENT,
    EventType.CONTACT_ADDED,
    EventType.CONTACT_VIEWED,
    EventType.PROFILE_CONFIRMED,
    EventType.PROMPT_ANSWERED,
    EventType.COFFEE_CHAT_SCHEDULED,
    EventType.SEARCH_EXECUTED,
    EventType.RECOMMENDATION_CLICKED,
    EventType.CTA_CLICKED,
    EventType.CTA_DISMISSED,
    EventType.VOICE_MODEL_UPDATED,
    EventType.PAGE_VIEW,
})

# All valid event types
ALL_EVENT_TYPES = frozenset(EventType)
