"""
Phase 8 personalization data layer: CTA service unit tests.

Covers section 7 (P8 row) cases:
  - CTA aggregation (3 alumni hires same day = 1 card).
  - Notification cooldown after 5 dismissals (clock-mocked).
  - Triggers fire from real event log entries (not mocked-out).

Plus the supporting safety tests:
  - Disabled flag short-circuits evaluate to empty / not-quieted.
  - Quieted user gets isQuieted=True and zero cards.
  - Dismissed cards do not reappear on the next evaluate.
  - Click does NOT count toward the cooldown threshold.
  - The contact_added alumni-hire trigger only fires when the contact
    is BOTH alumni of the user's school AND at one of their target
    firms; other contact_added events are silent.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import patch


# ============================================================================
# In-memory Firestore stub (matches phase 5/6/7 fixtures, with .set merge
# semantics so cta_service can update notificationStats without
# clobbering the rest of the user doc).
# ============================================================================


class _Snap:
    def __init__(self, data: Optional[Dict[str, Any]], doc_id: str = 'v1'):
        self._data = data
        self.exists = data is not None
        self.id = doc_id

    def to_dict(self) -> Optional[Dict[str, Any]]:
        return dict(self._data) if self._data is not None else None


class _DocRef:
    def __init__(self, store: Dict[str, Any], path: List[str]):
        self._store = store
        self._path = path

    def _key(self) -> str:
        return '/'.join(self._path)

    def get(self) -> _Snap:
        data = self._store.get(self._key())
        return _Snap(data, doc_id=self._path[-1])

    def set(self, payload: Dict[str, Any], merge: bool = False) -> None:
        if merge and self._key() in self._store:
            for k, v in payload.items():
                if isinstance(v, dict) and isinstance(self._store[self._key()].get(k), dict):
                    self._store[self._key()][k].update(v)
                else:
                    self._store[self._key()][k] = v
        else:
            self._store[self._key()] = dict(payload)

    def collection(self, name: str) -> '_CollectionRef':
        return _CollectionRef(self._store, self._path + [name])


class _CollectionRef:
    def __init__(self, store: Dict[str, Any], path: List[str]):
        self._store = store
        self._path = path

    def document(self, doc_id: str) -> _DocRef:
        return _DocRef(self._store, self._path + [doc_id])

    def stream(self):
        prefix = '/'.join(self._path) + '/'
        for key, data in list(self._store.items()):
            if not key.startswith(prefix):
                continue
            tail = key[len(prefix):]
            if '/' in tail:
                continue
            yield _Snap(data, doc_id=tail)


class _DBStub:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def collection(self, name: str) -> _CollectionRef:
        return _CollectionRef(self._store, [name])


def _make_event(ev_type: str, payload: Dict[str, Any], when: datetime, eid: Optional[str] = None) -> Dict[str, Any]:
    return {
        'eventId': eid or f'{ev_type}-{when.isoformat()}-{len(payload)}',
        'type': ev_type,
        'timestamp': when,
        'payload': payload,
    }


def _build_db(
    *,
    user: Optional[Dict[str, Any]] = None,
    events: Optional[List[Dict[str, Any]]] = None,
    dismissals: Optional[Dict[str, Dict[str, Any]]] = None,
    uid: str = 'uid-1',
):
    store: Dict[str, Any] = {}
    if user is not None:
        store[f'users/{uid}'] = user
    for evt in (events or []):
        eid = evt.get('eventId') or f'evt-{len(store)}'
        store[f'users/{uid}/events/{eid}'] = evt
    for cid, d in (dismissals or {}).items():
        store[f'users/{uid}/ctaDismissals/{cid}'] = d
    return store, _DBStub(store)


def _enabled():
    return patch.dict(os.environ, {'CTA_CARDS_ENABLED': 'true'})


# ============================================================================
# Disabled flag short-circuit.
# ============================================================================


def test_evaluate_short_circuits_when_flag_off():
    """Default OFF means evaluate returns empty without touching the DB."""
    from app.services import cta_service as svc

    # Don't patch the env var; CTA_CARDS_ENABLED defaults to off.
    with patch.dict(os.environ, {'CTA_CARDS_ENABLED': 'false'}, clear=False):
        cards, is_quieted = svc.evaluate('uid-1')
    assert cards == []
    assert is_quieted is False


# ============================================================================
# Trigger registry exposes the launch set.
# ============================================================================


def test_launch_triggers_are_registered():
    """The Phase 8 launch deck registers reply_received, contact_added,
    and coffee_chat_scheduled. Adding more triggers should not silently
    drop these."""
    from app.services import cta_service as svc

    registered = svc.registered_triggers()
    assert 'reply_received' in registered
    assert 'contact_added' in registered
    assert 'coffee_chat_scheduled' in registered


# ============================================================================
# Section 7 P8: trigger fires from real event log.
# ============================================================================


def test_reply_received_event_produces_a_card():
    from app.services import cta_service as svc

    when = datetime.now(timezone.utc) - timedelta(hours=2)
    evt = _make_event(
        'reply_received',
        {'trackingId': 't-1', 'contactId': 'c-1'},
        when,
    )
    _, db = _build_db(user={'uid': 'uid-1'}, events=[evt])
    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        cards, quiet = svc.evaluate('uid-1')
    assert quiet is False
    assert len(cards) == 1
    assert cards[0].trigger_type == 'reply_received'
    assert cards[0].action_label == 'Draft follow up'
    assert cards[0].action_class == 'positive'
    # Card_id stable across polls so dismissal sticks.
    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        cards2, _ = svc.evaluate('uid-1')
    assert cards[0].card_id == cards2[0].card_id


def test_coffee_chat_scheduled_event_produces_a_card():
    from app.services import cta_service as svc

    when = datetime.now(timezone.utc) - timedelta(hours=1)
    evt = _make_event(
        'coffee_chat_scheduled',
        {'contactId': 'c-77'},
        when,
    )
    _, db = _build_db(user={'uid': 'uid-1'}, events=[evt])
    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        cards, _ = svc.evaluate('uid-1')
    assert len(cards) == 1
    assert cards[0].trigger_type == 'coffee_chat_scheduled'
    assert cards[0].action_label == 'Open prep'
    assert '/coffee-chat-prep' in cards[0].action_href


def test_contact_added_alumni_hire_only_fires_when_alumni_and_target_firm():
    """The contact_added trigger is precise: alumni at a NON-target firm
    is silent; non-alumni at a target firm is silent. Both signals must
    line up for the card to render."""
    from app.services import cta_service as svc

    user = {
        'uid': 'uid-1',
        'school': 'University of Southern California',
        'targetCompanies': ['Goldman Sachs', 'McKinsey'],
    }
    when = datetime.now(timezone.utc) - timedelta(hours=3)

    # Match: alumni + target.
    match_evt = _make_event(
        'contact_added',
        {
            'school': 'University of Southern California',
            'company': 'Goldman Sachs',
            'companyIdNormalized': 'goldman-sachs',
        },
        when,
        eid='match',
    )
    # Alumni but not at a target firm.
    alum_only = _make_event(
        'contact_added',
        {'school': 'University of Southern California', 'company': 'Random Co'},
        when,
        eid='alum-only',
    )
    # Target firm but not alumni.
    target_only = _make_event(
        'contact_added',
        {'school': 'Other University', 'company': 'McKinsey'},
        when,
        eid='target-only',
    )
    _, db = _build_db(user=user, events=[match_evt, alum_only, target_only])
    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        cards, _ = svc.evaluate('uid-1')
    assert len(cards) == 1
    assert cards[0].trigger_type == 'alumni_hire'
    assert 'Goldman' in cards[0].title


# ============================================================================
# Section 7 P8: aggregation (3 alumni hires same day = 1 card).
# ============================================================================


def test_three_alumni_hires_same_day_collapse_to_one_card():
    from app.services import cta_service as svc

    user = {
        'uid': 'uid-1',
        'school': 'University of Southern California',
        'targetCompanies': ['Goldman Sachs'],
    }
    base = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0) - timedelta(hours=2)
    events = []
    for i, hours_offset in enumerate([0, 1, 2]):
        events.append(_make_event(
            'contact_added',
            {
                'school': 'University of Southern California',
                'company': 'Goldman Sachs',
                'companyIdNormalized': 'goldman-sachs',
            },
            base - timedelta(hours=hours_offset),
            eid=f'hire-{i}',
        ))
    _, db = _build_db(user=user, events=events)
    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        cards, _ = svc.evaluate('uid-1')
    assert len(cards) == 1
    assert cards[0].aggregated_count == 3
    # All three event IDs are preserved on the surviving card so a
    # downstream consumer can trace which hires triggered the card.
    assert sorted(cards[0].source_event_ids) == ['hire-0', 'hire-1', 'hire-2']


def test_aggregate_is_a_noop_for_single_cards():
    from app.services import cta_service as svc

    only = svc.CTACard(
        card_id='alumni_hire:abc',
        trigger_type='alumni_hire',
        title='t', body='b',
        action_label='go', action_href='/x', action_class='opportunity',
        created_at=datetime.now(timezone.utc),
    )
    out = svc.aggregate([only])
    assert len(out) == 1
    assert out[0].aggregated_count == 1


# ============================================================================
# Section 7 P8: notification cooldown after 5 dismissals (clock-mocked).
# ============================================================================


def test_record_dismissal_quiets_user_after_five_dismissals():
    """The fifth dismissal inside the rolling window flips quietedUntil
    to now + 7 days and resets the count. Subsequent evaluate calls
    must return isQuieted=True with no cards."""
    from app.services import cta_service as svc

    store, db = _build_db(user={'uid': 'uid-1'})
    base = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)

    # Fire 5 dismissals 1 minute apart (well within DISMISSAL_WINDOW).
    for i in range(5):
        with _enabled(), \
             patch('app.services.cta_service.get_db', return_value=db), \
             patch('app.services.cta_service._now', return_value=base + timedelta(minutes=i)):
            svc.record_dismissal('uid-1', f'reply_received:fake-{i}')

    user_doc = store['users/uid-1']
    stats = user_doc['notificationStats']
    assert stats['dismissedCount'] == 0  # reset after threshold trip
    assert stats['quietedUntil']  # set
    quieted_until = datetime.fromisoformat(stats['quietedUntil'])
    assert quieted_until > base + timedelta(days=6)

    # While quieted, evaluate returns isQuieted=True with no cards.
    with _enabled(), \
         patch('app.services.cta_service.get_db', return_value=db), \
         patch('app.services.cta_service._now', return_value=base + timedelta(hours=1)):
        cards, is_quieted = svc.evaluate('uid-1')
    assert cards == []
    assert is_quieted is True


def test_record_dismissal_rolls_count_when_last_dismissal_outside_window():
    """A dismissal more than DISMISSAL_WINDOW after the previous one
    resets the rolling count to 1, so a user who dismisses once a
    month never trips the cooldown."""
    from app.services import cta_service as svc

    store, db = _build_db(user={'uid': 'uid-1'})
    base = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)

    # First dismissal.
    with _enabled(), \
         patch('app.services.cta_service.get_db', return_value=db), \
         patch('app.services.cta_service._now', return_value=base):
        svc.record_dismissal('uid-1', 'reply_received:fake-a')
    assert store['users/uid-1']['notificationStats']['dismissedCount'] == 1

    # Second dismissal 30 days later  count rolls back to 1, NOT 2.
    with _enabled(), \
         patch('app.services.cta_service.get_db', return_value=db), \
         patch('app.services.cta_service._now', return_value=base + timedelta(days=30)):
        svc.record_dismissal('uid-1', 'reply_received:fake-b')
    assert store['users/uid-1']['notificationStats']['dismissedCount'] == 1
    assert store['users/uid-1']['notificationStats'].get('quietedUntil') in (None, '')


def test_record_click_does_not_count_toward_cooldown():
    """Click is a positive engagement signal. It must NOT increment the
    dismiss tally or trip the cooldown."""
    from app.services import cta_service as svc

    store, db = _build_db(user={'uid': 'uid-1'})

    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        for i in range(10):
            svc.record_click('uid-1', f'reply_received:click-{i}')

    user_doc = store.get('users/uid-1') or {}
    stats = user_doc.get('notificationStats') or {}
    assert stats.get('dismissedCount', 0) == 0
    assert not stats.get('quietedUntil')


# ============================================================================
# Dismissed cards do not reappear.
# ============================================================================


def test_dismissed_card_does_not_reappear_in_evaluate():
    from app.services import cta_service as svc

    when = datetime.now(timezone.utc) - timedelta(hours=2)
    evt = _make_event('reply_received', {'trackingId': 't-9', 'contactId': 'c-9'}, when)
    _, db = _build_db(user={'uid': 'uid-1'}, events=[evt])

    # First poll -> get the card_id.
    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        cards, _ = svc.evaluate('uid-1')
    assert len(cards) == 1
    card_id = cards[0].card_id

    # Dismiss it.
    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        svc.record_dismissal('uid-1', card_id)

    # Next poll -> empty deck (card was suppressed by ctaDismissals).
    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        cards2, _ = svc.evaluate('uid-1')
    assert cards2 == []


def test_clicked_card_does_not_reappear_in_evaluate():
    from app.services import cta_service as svc

    when = datetime.now(timezone.utc) - timedelta(hours=2)
    evt = _make_event('reply_received', {'trackingId': 't-99', 'contactId': 'c-99'}, when)
    _, db = _build_db(user={'uid': 'uid-1'}, events=[evt])

    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        cards, _ = svc.evaluate('uid-1')
    card_id = cards[0].card_id

    with _enabled(), patch('app.services.cta_service.get_db', return_value=db):
        svc.record_click('uid-1', card_id)
        cards2, _ = svc.evaluate('uid-1')
    assert cards2 == []
