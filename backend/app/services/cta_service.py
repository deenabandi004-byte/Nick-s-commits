"""
CTA service  Phase 8 of the Personalization Data Layer.

Surfaces dashboard call-to-action cards driven by recent behavior in the
event log (Phase 2). Cards are derived on every `evaluate(uid)` call;
persistence is limited to dismissal state so polling regenerates the
deck from scratch and never falls out of sync with reality.

Triggers piggyback on the existing event taxonomy (section 14 of the
briefing rules: don't invent new event types). Each trigger is a small
function registered via `@register_trigger(event_type)`. Adding a new
card class is one decorator + a few lines.

Notification fatigue (section 15.8 + spec table P8): after 5 dismissals
inside the rolling window, `quietedUntil` is set to now + 7 days and
the dashboard renders the "Notifications quieted" banner instead.

Behind the CTA_CARDS_ENABLED env flag, default OFF.
"""
from __future__ import annotations

import hashlib
import logging
import os
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.extensions import get_db

logger = logging.getLogger('cta_service')

CTA_FLAG_ENV = 'CTA_CARDS_ENABLED'

# Section 15.8: stack max 3 visible cards. The trigger evaluators are
# free to produce more; this limit applies AFTER aggregation so the most
# recent 3 land on the dashboard.
MAX_VISIBLE_CARDS = 3

# Section 15.8 + briefing P8 task table: cooldown after 5 dismissals.
# The window over which dismissals accumulate is the same length as the
# resulting quiet period, so a steady-state "always dismissing" user is
# permanently muted but a one-off bad day clears.
DISMISSAL_THRESHOLD = 5
QUIET_DURATION = timedelta(days=7)
DISMISSAL_WINDOW = timedelta(days=7)

# Lookback window for trigger evaluation. Events older than this are
# already too stale to act on. Matches the dashboard's default rolling
# window without coupling them.
EVENT_LOOKBACK = timedelta(days=14)


def _now() -> datetime:
    """Indirection so tests can mock the clock without breaking the
    datetime class used by isinstance() checks elsewhere in the module."""
    return datetime.now(timezone.utc)


# ============================================================================
# Card dataclass (returned to the route, mirrored by the frontend)
# ============================================================================


@dataclass
class CTACard:
    card_id: str
    trigger_type: str                    # 'reply_received' | 'alumni_hire' | 'coffee_chat_scheduled'
    title: str                           # short headline
    body: str                            # one-line subheadline
    action_label: str                    # button text, ONE primary action (section 15.8)
    action_href: str                     # destination route
    action_class: str                    # 'positive' | 'opportunity' | 'reminder' (color signal)
    created_at: datetime
    source_event_ids: List[str] = field(default_factory=list)
    aggregated_count: int = 1            # >1 when 3 alumni hires same day collapse to 1 card

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d['created_at'] = self.created_at.isoformat()
        return d


# ============================================================================
# Trigger registry
# ============================================================================

# event_type str -> callable(uid, events_of_type, user_doc) -> List[CTACard]
_TRIGGERS: Dict[str, Callable[..., List[CTACard]]] = {}


def register_trigger(event_type: str) -> Callable[[Callable[..., List[CTACard]]], Callable[..., List[CTACard]]]:
    """Register a trigger function for an event type.

    The function gets the uid, the list of events of that type within
    the lookback window, and the user document. It returns zero or more
    CTACard candidates. The service handles dedupe / aggregation /
    rate-limit / quiet state on top.
    """
    def _decorator(fn: Callable[..., List[CTACard]]) -> Callable[..., List[CTACard]]:
        _TRIGGERS[event_type] = fn
        return fn
    return _decorator


def registered_triggers() -> Tuple[str, ...]:
    """Test helper. Returns the event type names with a registered trigger."""
    return tuple(_TRIGGERS.keys())


# ============================================================================
# Public API
# ============================================================================


def is_enabled() -> bool:
    """Feature gate. Defaults to OFF during rollout (section 8 of the eng review)."""
    return os.getenv(CTA_FLAG_ENV, 'false').lower() == 'true'


def evaluate(uid: str) -> Tuple[List[CTACard], bool]:
    """Compute the visible CTA deck for the user.

    Returns (cards, is_quieted). When is_quieted is True the cards list
    is empty and the dashboard should render the "Notifications quieted"
    banner instead. Cards is otherwise the top-N (max 3) cards after
    aggregation, sorted most-recent-first.

    The function is read-only for the user doc; only `record_dismissal`
    and `record_click` write state.
    """
    if not uid or not is_enabled():
        return [], False

    db = get_db()
    user_doc = _read_user_doc(db, uid)
    if _is_quieted(user_doc):
        return [], True

    events_by_type = _load_events_by_type(db, uid)
    candidates: List[CTACard] = []
    for event_type, trigger_fn in _TRIGGERS.items():
        evs = events_by_type.get(event_type, [])
        if not evs:
            continue
        try:
            produced = trigger_fn(uid, evs, user_doc) or []
        except Exception:
            logger.exception('trigger %s failed for uid=%s', event_type, uid)
            produced = []
        candidates.extend(produced)

    # Drop anything the user already dismissed or clicked.
    suppressed = _dismissed_or_clicked_card_ids(db, uid)
    candidates = [c for c in candidates if c.card_id not in suppressed]

    # Collapse same-day same-trigger-same-target cards.
    cards = aggregate(candidates)

    # Most recent first, max 3 (section 15.8).
    cards.sort(key=lambda c: c.created_at, reverse=True)
    return cards[:MAX_VISIBLE_CARDS], False


def aggregate(cards: List[CTACard]) -> List[CTACard]:
    """Collapse cards that share the same trigger and target on the same day.

    Spec section 7 P8: "3 alumni hires same day = 1 card". For now the
    aggregation key is `(trigger_type, action_href, day_bucket)`. Same
    href on the same day means the user would be shown identical card
    text three times; we collapse them and bump aggregated_count so the
    UI can render "3 new alumni hires at Goldman today".
    """
    if not cards:
        return []
    groups: Dict[Tuple[str, str, str], List[CTACard]] = defaultdict(list)
    for c in cards:
        day_bucket = c.created_at.astimezone(timezone.utc).date().isoformat()
        groups[(c.trigger_type, c.action_href, day_bucket)].append(c)

    out: List[CTACard] = []
    for group in groups.values():
        if len(group) == 1:
            out.append(group[0])
            continue
        # Pick the most recent card as the surviving one; rewrite its
        # body to acknowledge the aggregation. Card_id stays stable so
        # dismissal of the aggregated card persists across polls.
        primary = max(group, key=lambda c: c.created_at)
        primary.aggregated_count = len(group)
        primary.source_event_ids = sorted({
            eid for c in group for eid in c.source_event_ids
        })
        out.append(primary)
    return out


def should_rate_limit(uid: str, card_type: str) -> bool:
    """Suppress new cards of `card_type` when the user is in cooldown
    or has already received many dismissals of this exact type recently.

    Used by triggers that fire frequently (e.g. coffee_chat_scheduled
    after every meeting) so a power user does not get flooded.
    """
    if not uid:
        return True
    db = get_db()
    user_doc = _read_user_doc(db, uid)
    if _is_quieted(user_doc):
        return True
    # Type-scoped throttle: count dismissals of this card_type in the
    # last DISMISSAL_WINDOW. Three or more is enough signal that this
    # class isn't landing for the user.
    cutoff = _now() - DISMISSAL_WINDOW
    recent_dismissals = _count_recent_dismissals_for_type(db, uid, card_type, cutoff)
    return recent_dismissals >= 3


def record_dismissal(uid: str, card_id: str) -> Dict[str, Any]:
    """Persist a dismissal and update the cooldown tally.

    Returns the new notificationStats so callers can update their local
    state without a round-trip.
    """
    if not uid or not card_id:
        return {}
    db = get_db()
    now = _now()

    # Persist the per-card dismissal record. Card_type is derived from
    # the card_id prefix so should_rate_limit can scan by type without
    # re-deriving the cards.
    card_type = _card_type_from_id(card_id)
    db.collection('users').document(uid).collection('ctaDismissals').document(card_id).set({
        'cardId': card_id,
        'cardType': card_type,
        'dismissedAt': now.isoformat(),
    })

    user_doc = _read_user_doc(db, uid) or {}
    stats = dict(user_doc.get('notificationStats') or {})

    # Roll the tally if the previous dismissal was outside the window;
    # otherwise increment.
    last = _coerce_dt(stats.get('lastDismissedAt'))
    if last and (now - last) > DISMISSAL_WINDOW:
        stats['dismissedCount'] = 1
    else:
        stats['dismissedCount'] = int(stats.get('dismissedCount') or 0) + 1
    stats['lastDismissedAt'] = now.isoformat()

    if stats['dismissedCount'] >= DISMISSAL_THRESHOLD:
        stats['quietedUntil'] = (now + QUIET_DURATION).isoformat()
        stats['dismissedCount'] = 0

    db.collection('users').document(uid).set(
        {'notificationStats': stats}, merge=True
    )
    return stats


def record_click(uid: str, card_id: str) -> None:
    """Persist a click so the same card doesn't reappear on the next
    poll. A click is a positive signal, so it does NOT count toward the
    cooldown threshold."""
    if not uid or not card_id:
        return
    db = get_db()
    now = _now()
    db.collection('users').document(uid).collection('ctaClicks').document(card_id).set({
        'cardId': card_id,
        'cardType': _card_type_from_id(card_id),
        'clickedAt': now.isoformat(),
    })


# ============================================================================
# Internals
# ============================================================================


def _read_user_doc(db, uid: str) -> Dict[str, Any]:
    try:
        snap = db.collection('users').document(uid).get()
        return snap.to_dict() or {} if snap.exists else {}
    except Exception:  # pragma: no cover  Firestore unreachable
        logger.exception('user doc read failed for uid=%s', uid)
        return {}


def _is_quieted(user_doc: Dict[str, Any]) -> bool:
    stats = (user_doc or {}).get('notificationStats') or {}
    until = _coerce_dt(stats.get('quietedUntil'))
    if not until:
        return False
    return _now() < until


def _load_events_by_type(db, uid: str) -> Dict[str, List[Dict[str, Any]]]:
    cutoff = _now() - EVENT_LOOKBACK
    out: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    try:
        snaps = db.collection('users').document(uid).collection('events').stream()
    except Exception:  # pragma: no cover
        return out
    for snap in snaps:
        data = snap.to_dict() or {}
        ts = _coerce_dt(data.get('timestamp') or data.get('createdAt'))
        if ts is None or ts < cutoff:
            continue
        ev_type = data.get('type')
        if not ev_type:
            continue
        out[ev_type].append({
            'eventId': data.get('eventId') or snap.id,
            'type': ev_type,
            'timestamp': ts,
            'payload': data.get('payload') or {},
        })
    return out


def _dismissed_or_clicked_card_ids(db, uid: str) -> set:
    """Read users/{uid}/ctaDismissals + ctaClicks card IDs to filter."""
    out: set = set()
    for sub in ('ctaDismissals', 'ctaClicks'):
        try:
            for snap in db.collection('users').document(uid).collection(sub).stream():
                out.add(snap.id)
        except Exception:  # pragma: no cover
            continue
    return out


def _count_recent_dismissals_for_type(db, uid: str, card_type: str, cutoff: datetime) -> int:
    try:
        snaps = db.collection('users').document(uid).collection('ctaDismissals').stream()
    except Exception:  # pragma: no cover
        return 0
    count = 0
    for snap in snaps:
        data = snap.to_dict() or {}
        if (data.get('cardType') or _card_type_from_id(snap.id)) != card_type:
            continue
        ts = _coerce_dt(data.get('dismissedAt'))
        if ts and ts >= cutoff:
            count += 1
    return count


def _card_type_from_id(card_id: str) -> str:
    """Card IDs are `<type>:<rest>`; the prefix is the type. Used so
    should_rate_limit doesn't need to hold the full card object to
    classify."""
    if ':' in card_id:
        return card_id.split(':', 1)[0]
    return card_id


def _coerce_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            v = value.rstrip('Z')
            dt = datetime.fromisoformat(v)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _hash_id(*parts: str) -> str:
    raw = '|'.join(parts).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()[:16]


# ============================================================================
# Built-in triggers (Phase 8 launch set)
# ============================================================================


@register_trigger('reply_received')
def _on_reply_received(uid: str, events: List[Dict[str, Any]], user_doc: Dict[str, Any]) -> List[CTACard]:
    """Reply to a sent email -> "draft a follow up" card per reply.

    Card_id is keyed on the trackingId so the same reply doesn't issue a
    new card every poll. Aggregation collapses replies received the
    same day into a single card.
    """
    cards: List[CTACard] = []
    for evt in events:
        payload = evt.get('payload') or {}
        tracking_id = payload.get('trackingId') or payload.get('tracking_id')
        contact_id = payload.get('contactId') or payload.get('contact_id')
        if not tracking_id and not contact_id:
            continue
        target = contact_id or tracking_id
        cards.append(CTACard(
            card_id=f'reply_received:{_hash_id(target, str(tracking_id or ""))}',
            trigger_type='reply_received',
            title='You got a reply',
            body='Draft a follow up while the conversation is warm.',
            action_label='Draft follow up',
            action_href=f'/tracker?contact={target}',
            action_class='positive',
            created_at=evt['timestamp'],
            source_event_ids=[evt['eventId']],
        ))
    return cards


@register_trigger('contact_added')
def _on_contact_added(uid: str, events: List[Dict[str, Any]], user_doc: Dict[str, Any]) -> List[CTACard]:
    """Contact added that is alumni AND at one of the user's target firms
    -> "see other alumni at X" card.

    Other contact_added events do not produce a card; the trigger is
    specifically the alumni-hire signal called out in the briefing.
    """
    user_school = (user_doc or {}).get('school')
    user_school_norm = ((user_doc or {}).get('schoolNormalized') or '').lower()
    target_companies_lower = {
        str(t).strip().lower()
        for t in (user_doc or {}).get('targetCompanies') or []
        if t
    }
    if not (user_school or user_school_norm) or not target_companies_lower:
        return []

    cards: List[CTACard] = []
    for evt in events:
        payload = evt.get('payload') or {}
        contact_school = (payload.get('school') or '').lower()
        contact_company = (payload.get('company') or '').lower()
        if not contact_school or not contact_company:
            continue
        is_alumni = (
            contact_school == (user_school or '').lower()
            or contact_school == user_school_norm
        )
        if not is_alumni:
            continue
        if contact_company not in target_companies_lower:
            continue
        company_id = payload.get('companyIdNormalized') or contact_company.replace(' ', '-')
        cards.append(CTACard(
            card_id=f'alumni_hire:{_hash_id(company_id)}',
            trigger_type='alumni_hire',
            title=f'New alumni at {payload.get("company") or contact_company}',
            body='See who else from your school works there.',
            action_label='See alumni',
            action_href=f'/find?tab=people&company={company_id}',
            action_class='opportunity',
            created_at=evt['timestamp'],
            source_event_ids=[evt['eventId']],
        ))
    return cards


@register_trigger('coffee_chat_scheduled')
def _on_coffee_chat_scheduled(uid: str, events: List[Dict[str, Any]], user_doc: Dict[str, Any]) -> List[CTACard]:
    """Coffee chat booked -> "prep your questions" card. Card_id keyed
    on contactId + day so multiple chats with the same contact same day
    collapse, but different contacts each get their own card."""
    cards: List[CTACard] = []
    for evt in events:
        payload = evt.get('payload') or {}
        contact_id = payload.get('contactId') or payload.get('contact_id')
        if not contact_id:
            continue
        day = evt['timestamp'].astimezone(timezone.utc).date().isoformat()
        cards.append(CTACard(
            card_id=f'coffee_chat_scheduled:{_hash_id(contact_id, day)}',
            trigger_type='coffee_chat_scheduled',
            title='Prep for your coffee chat',
            body='Generate talking points before the call.',
            action_label='Open prep',
            action_href=f'/coffee-chat-prep?contact={contact_id}',
            action_class='reminder',
            created_at=evt['timestamp'],
            source_event_ids=[evt['eventId']],
        ))
    return cards
