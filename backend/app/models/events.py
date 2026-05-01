"""
Event taxonomy — Phase 2 of the Personalization Data Layer.

This is the canonical type list for the append-only event log written to
`users/{uid}/events/{eventId}`. Both frontend-originated events
(POST /api/events/batch) and backend-originated events (Pub/Sub handlers,
existing route hooks) flow through `events_service.log_event`.

Discriminated unions match the TypeScript side in
`connect-grow-hire/src/lib/events.ts` — keep them in sync. EmailEdited
payload is intentionally typed (no raw text, no raw diff) per the eng
review critical comment in §3.1.

Idempotency: every event has a unique `eventId`. Frontend uses
`crypto.randomUUID()`; backend Pub/Sub callers derive a deterministic
sha256 so retries of the same source message become the same write.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

try:
    from pydantic import BaseModel, Field, ConfigDict
    _HAS_PYDANTIC_V2 = True
except ImportError:  # pragma: no cover
    _HAS_PYDANTIC_V2 = False
    BaseModel = object  # type: ignore
    Field = lambda *a, **kw: None  # type: ignore
    ConfigDict = dict  # type: ignore


class EventType(str, Enum):
    # === Selection signals (frontend) ===
    CONTACT_SAVED = 'contact_saved'
    CONTACT_SKIPPED = 'contact_skipped'
    JOB_SAVED = 'job_saved'
    JOB_SKIPPED = 'job_skipped'
    CONTACT_CARD_VIEWED = 'contact_card_viewed'

    # === Email composition signals (frontend) ===
    EMAIL_DRAFTED = 'email_drafted'
    EMAIL_EDITED = 'email_edited'
    EMAIL_SENT_CLICKED = 'email_sent_clicked'  # proxy until Pub/Sub confirms
    EMAIL_DISCARDED = 'email_discarded'

    # === Prompt UX (frontend, P3) ===
    PROMPT_SHOWN = 'prompt_shown'
    PROMPT_ANSWERED = 'prompt_answered'
    PROMPT_DISMISSED = 'prompt_dismissed'

    # === Dashboard (frontend, P5/P8) ===
    DASHBOARD_CTA_CLICKED = 'dashboard_cta_clicked'
    DASHBOARD_CTA_DISMISSED = 'dashboard_cta_dismissed'
    DASHBOARD_RECOMMENDATION_VIEWED = 'dashboard_recommendation_viewed'
    DASHBOARD_RECOMMENDATION_CLICKED = 'dashboard_recommendation_clicked'

    # === Profile (frontend) ===
    PROFILE_FIELD_EDITED = 'profile_field_edited'
    PROFILE_CONFIRMED = 'profile_confirmed'

    # === Alumni surface (frontend, P6) ===
    ALUMNI_CONSENT_DECISION = 'alumni_consent_decision'
    ALUMNI_CARD_VIEWED = 'alumni_card_viewed'
    ALUMNI_CARD_CLICKED = 'alumni_card_clicked'

    # === Backend-originated only ===
    EMAIL_SENT_VIA_GMAIL = 'email_sent_via_gmail'
    REPLY_RECEIVED = 'reply_received'
    DRAFT_CREATED = 'draft_created'
    CONTACT_ADDED = 'contact_added'
    JOB_APPLIED = 'job_applied'
    COFFEE_CHAT_SCHEDULED = 'coffee_chat_scheduled'
    MEETING_BOOKED = 'meeting_booked'
    BOUNCE_RECEIVED = 'bounce_received'
    REPLY_ATTRIBUTION_UNCERTAIN = 'reply_attribution_uncertain'
    ALUMNI_GRAPH_CONSENT_CHANGED = 'alumni_graph_consent_changed'


# Subset of event types that the backend is allowed to write itself.
BACKEND_EVENT_TYPES = frozenset([
    EventType.EMAIL_SENT_VIA_GMAIL,
    EventType.REPLY_RECEIVED,
    EventType.DRAFT_CREATED,
    EventType.CONTACT_ADDED,
    EventType.JOB_APPLIED,
    EventType.COFFEE_CHAT_SCHEDULED,
    EventType.MEETING_BOOKED,
    EventType.BOUNCE_RECEIVED,
    EventType.REPLY_ATTRIBUTION_UNCERTAIN,
    EventType.ALUMNI_GRAPH_CONSENT_CHANGED,
])

# Frontend-originated event types accepted via /api/events/batch.
FRONTEND_EVENT_TYPES = frozenset([
    EventType.CONTACT_SAVED,
    EventType.CONTACT_SKIPPED,
    EventType.JOB_SAVED,
    EventType.JOB_SKIPPED,
    EventType.CONTACT_CARD_VIEWED,
    EventType.EMAIL_DRAFTED,
    EventType.EMAIL_EDITED,
    EventType.EMAIL_SENT_CLICKED,
    EventType.EMAIL_DISCARDED,
    EventType.PROMPT_SHOWN,
    EventType.PROMPT_ANSWERED,
    EventType.PROMPT_DISMISSED,
    EventType.DASHBOARD_CTA_CLICKED,
    EventType.DASHBOARD_CTA_DISMISSED,
    EventType.DASHBOARD_RECOMMENDATION_VIEWED,
    EventType.DASHBOARD_RECOMMENDATION_CLICKED,
    EventType.PROFILE_FIELD_EDITED,
    EventType.PROFILE_CONFIRMED,
    EventType.ALUMNI_CONSENT_DECISION,
    EventType.ALUMNI_CARD_VIEWED,
    EventType.ALUMNI_CARD_CLICKED,
])


# ============================================================================
# Base model + payloads
# ============================================================================

class BaseEvent(BaseModel):
    """Common envelope for every event written to Firestore."""

    event_id: str = Field(alias='eventId')
    type: EventType
    timestamp: datetime
    source: Literal['frontend', 'backend']
    schema_version: int = Field(default=1, alias='schemaVersion')
    session_id: Optional[str] = Field(default=None, alias='sessionId')

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True, extra='allow')


# === Highest-signal payloads (typed) ========================================

class EmailEditedPayloadDelta(BaseModel):
    before_chars: int = Field(alias='beforeChars')
    after_chars: int = Field(alias='afterChars')
    words_changed: int = Field(alias='wordsChanged')

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)


class EmailEditedPayload(BaseModel):
    """CRITICAL: NO raw email text, NO raw diff. Typed edits only."""
    contact_id: str = Field(alias='contactId')
    tracking_id: str = Field(alias='trackingId')
    edit_types: List[Literal['tone', 'length', 'opener', 'closer', 'body', 'subject']] = Field(
        alias='editTypes', default_factory=list
    )
    delta: EmailEditedPayloadDelta
    time_spent_seconds: float = Field(alias='timeSpentSeconds')

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)


class ReplyReceivedPayload(BaseModel):
    tracking_id: str = Field(alias='trackingId')
    contact_id: Optional[str] = Field(default=None, alias='contactId')
    sent_message_id: str = Field(alias='sentMessageId')
    inbound_message_id: str = Field(alias='inboundMessageId')
    in_reply_to: str = Field(alias='inReplyTo')
    received_at: datetime = Field(alias='receivedAt')
    reply_class: Literal['positive', 'negative', 'question', 'autoresponder', 'other'] = 'other'
    snippet: str = Field(default='', max_length=500)

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)


class EmailSentViaGmailPayload(BaseModel):
    tracking_id: str = Field(alias='trackingId')
    sent_message_id: str = Field(alias='sentMessageId')
    contact_id: Optional[str] = Field(default=None, alias='contactId')
    contact_email: Optional[str] = Field(default=None, alias='contactEmail')
    sent_at: datetime = Field(alias='sentAt')

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Backend-write API
# ============================================================================

class ReplyReceivedEvent(BaseEvent):
    type: Literal[EventType.REPLY_RECEIVED] = EventType.REPLY_RECEIVED
    payload: ReplyReceivedPayload
    source: Literal['frontend', 'backend'] = 'backend'


class EmailSentViaGmailEvent(BaseEvent):
    type: Literal[EventType.EMAIL_SENT_VIA_GMAIL] = EventType.EMAIL_SENT_VIA_GMAIL
    payload: EmailSentViaGmailPayload
    source: Literal['frontend', 'backend'] = 'backend'


# ============================================================================
# Generic incoming-event validator (used by /api/events/batch)
# ============================================================================

class IncomingEvent(BaseModel):
    """Structural validator for any frontend-originated event.

    Strict typing per-payload happens for the high-signal types (above);
    other types are accepted with `extra='allow'` so the frontend can
    iterate on payload schemas without backend deploys. Unknown event
    types are rejected.
    """
    event_id: str = Field(alias='eventId')
    type: EventType
    timestamp: datetime
    source: Literal['frontend', 'backend'] = 'frontend'
    schema_version: int = Field(default=1, alias='schemaVersion')
    session_id: Optional[str] = Field(default=None, alias='sessionId')
    payload: Dict[str, Any] = Field(default_factory=dict)

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True, extra='allow')
