"""
Phase 3 personalization data layer -- unit tests.

Covers the §7 (P3 row) cases that don't need real Firestore:
  - Company normalization edge cases (Goldman / GS / 'Goldman, LLC' all
    collapse to the same slug; aliases for top-100 firms hit; fallback
    slug for unknowns is deterministic).
  - should_show_prompt staleness logic (clock-mocked):
      - returns 'no_context' when nothing exists
      - returns 'inferred_only' when source is inferred-only and no answer
      - returns 'stale' after the staleness window passes
      - returns 'fresh' inside the window with a recent answer
      - returns 'unanswered_threshold' when 5+ unanswered drafts exist
  - Reason validation (route-level helper): rejects too-short, noise
    literals, repetition; accepts a real one-sentence reason.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest


# ============================================================================
# Company normalization
# ============================================================================


def test_company_to_slug_alias_hits():
    from app.utils.company import company_to_slug

    # Same canonical slug across every common spelling.
    assert company_to_slug('Goldman Sachs') == 'goldman-sachs'
    assert company_to_slug('Goldman') == 'goldman-sachs'
    assert company_to_slug('GS') == 'goldman-sachs'
    assert company_to_slug('goldman-sachs') == 'goldman-sachs'
    assert company_to_slug('GOLDMAN SACHS') == 'goldman-sachs'

    # JPMorgan family
    assert company_to_slug('JP Morgan') == 'jpmorgan'
    assert company_to_slug('JPMorgan Chase') == 'jpmorgan'
    assert company_to_slug('JPM') == 'jpmorgan'

    # MBB
    assert company_to_slug('McKinsey') == 'mckinsey'
    assert company_to_slug('McKinsey & Company') == 'mckinsey'
    assert company_to_slug('Mck') == 'mckinsey'
    assert company_to_slug('Boston Consulting Group') == 'bcg'
    assert company_to_slug('BCG') == 'bcg'
    assert company_to_slug('Bain') == 'bain-and-company'
    assert company_to_slug('Bain & Company') == 'bain-and-company'
    # Bain Capital is NOT Bain & Co -- must be a different slug.
    assert company_to_slug('Bain Capital') == 'bain-capital'

    # Tech
    assert company_to_slug('Meta') == 'meta'
    assert company_to_slug('Facebook') == 'meta'
    assert company_to_slug('Google') == 'google'
    assert company_to_slug('Alphabet') == 'google'
    assert company_to_slug('Amazon') == 'amazon'
    assert company_to_slug('AWS') == 'amazon'


def test_company_to_slug_strips_corporate_suffixes():
    from app.utils.company import company_to_slug
    # Corporate suffixes should not split a known firm into its own slug.
    assert company_to_slug('Goldman Sachs, LLC') == 'goldman-sachs'
    assert company_to_slug('Goldman Sachs Inc.') == 'goldman-sachs'
    assert company_to_slug('Apple Inc.') == 'apple'
    assert company_to_slug('Apple Corp') == 'apple'


def test_company_to_slug_unknown_falls_through_to_deterministic_slug():
    from app.utils.company import company_to_slug
    assert company_to_slug('Acme Industries') == 'acme-industries'
    # Repeated normalization is idempotent.
    once = company_to_slug('Random Boutique LLC')
    twice = company_to_slug(once or '')
    # The second pass might further strip the slug-form of "llc"; just
    # require stability across two calls when the input is already a slug.
    assert company_to_slug(once or '') == once


def test_company_to_slug_handles_empty():
    from app.utils.company import company_to_slug
    assert company_to_slug(None) is None
    assert company_to_slug('') is None
    assert company_to_slug('   ') is None


def test_models_users_normalize_company_uses_alias_map():
    """models.users.normalize_company is now a thin shim -- verify it picks
    up the alias map from utils.company."""
    from app.models.users import normalize_company
    assert normalize_company('Centerview Partners') == 'centerview-partners'
    assert normalize_company('Centerview') == 'centerview-partners'
    assert normalize_company('Evercore') == 'evercore'


# ============================================================================
# should_show_prompt staleness logic (clock-mocked)
# ============================================================================


def _patch_db_doc(existing: dict | None):
    """Helper: build a MagicMock get_db() that returns a Firestore-like
    chain whose `.document(...).get()` returns a snapshot with `existing`
    as `to_dict()` and `exists=bool(existing)`."""
    snap = MagicMock()
    snap.exists = bool(existing)
    snap.to_dict.return_value = existing or {}
    ref = MagicMock()
    ref.get.return_value = snap
    coll = MagicMock()
    coll.document.return_value = ref
    user = MagicMock()
    user.collection.return_value = coll
    coll2 = MagicMock()
    coll2.document.return_value = user
    db = MagicMock()
    db.collection.return_value = coll2
    return db


def test_should_show_prompt_no_context_returns_show_no_context():
    from app.services import company_contexts_service as svc

    with patch.object(svc, 'get_db', return_value=_patch_db_doc(None)):
        # No outboundDrafts either -- second collection chain just returns empty.
        with patch.object(svc, '_count_unanswered_outbound_at_company', return_value=0):
            decision = svc.should_show_prompt('uid1', 'goldman-sachs')
    assert decision['show'] is True
    assert decision['reason'] == 'no_context'


def test_should_show_prompt_inferred_only_returns_show():
    from app.services import company_contexts_service as svc

    existing = {
        'companyId': 'goldman-sachs',
        'reason': 'Mentioned on resume.',
        'source': 'inferred_from_resume',
        'answeredAt': None,  # never explicitly answered
        'lastUsedAt': '2026-04-01T00:00:00+00:00',
    }
    with patch.object(svc, 'get_db', return_value=_patch_db_doc(existing)):
        with patch.object(svc, '_count_unanswered_outbound_at_company', return_value=0):
            decision = svc.should_show_prompt('uid1', 'goldman-sachs')
    assert decision['show'] is True
    assert decision['reason'] == 'inferred_only'
    assert decision['priorAnswer'] == 'Mentioned on resume.'


def test_should_show_prompt_fresh_within_window():
    """Answered 30 days ago, no unanswered backlog → don't re-ask."""
    from app.services import company_contexts_service as svc

    now = datetime(2026, 4, 29, tzinfo=timezone.utc)
    answered = (now - timedelta(days=30)).isoformat()
    existing = {
        'companyId': 'goldman-sachs',
        'reason': 'Family connection in M&A.',
        'source': 'explicit',
        'answeredAt': answered,
        'lastUsedAt': answered,
    }
    with patch.object(svc, 'get_db', return_value=_patch_db_doc(existing)):
        with patch.object(svc, '_count_unanswered_outbound_at_company', return_value=0):
            decision = svc.should_show_prompt('uid1', 'goldman-sachs', now=now)
    assert decision['show'] is False
    assert decision['reason'] == 'fresh'


def test_should_show_prompt_stale_after_window():
    """Answered 200 days ago → re-ask, stale."""
    from app.services import company_contexts_service as svc

    now = datetime(2026, 4, 29, tzinfo=timezone.utc)
    answered = (now - timedelta(days=200)).isoformat()
    existing = {
        'companyId': 'goldman-sachs',
        'reason': 'Family connection.',
        'source': 'explicit',
        'answeredAt': answered,
        'lastUsedAt': answered,
    }
    with patch.object(svc, 'get_db', return_value=_patch_db_doc(existing)):
        with patch.object(svc, '_count_unanswered_outbound_at_company', return_value=0):
            decision = svc.should_show_prompt('uid1', 'goldman-sachs', now=now)
    assert decision['show'] is True
    assert decision['reason'] == 'stale'
    # Stale re-ask must surface the prior answer for the UI.
    assert decision['priorAnswer'] == 'Family connection.'


class _FakeOutboundDraftsDB:
    """Tiny in-memory Firestore stand-in for the outboundDrafts round-trip.

    Supports the exact chain used by both `_write_outbound_draft` (writes
    via .set(merge=True)) and `_count_unanswered_outbound_at_company`
    (reads via .stream()), all scoped under
    `users/{uid}/outboundDrafts/{trackingId}`. Other collections raise so
    a wrong path during the test fails loud.
    """

    def __init__(self):
        # uid -> tracking_id -> dict
        self._drafts: dict[str, dict[str, dict]] = {}

    def collection(self, name):
        if name != 'users':
            raise AssertionError(f"unexpected top-level collection: {name}")
        return _FakeUsersCollection(self._drafts)


class _FakeUsersCollection:
    def __init__(self, drafts):
        self._drafts = drafts

    def document(self, uid):
        return _FakeUserDoc(self._drafts, uid)


class _FakeUserDoc:
    def __init__(self, drafts, uid):
        self._drafts = drafts
        self._uid = uid

    def collection(self, name):
        if name != 'outboundDrafts':
            raise AssertionError(f"unexpected user subcollection: {name}")
        return _FakeOutboundDrafts(self._drafts.setdefault(self._uid, {}))

    def get(self):  # not used by this round-trip path
        raise AssertionError("user-doc .get() not expected in this test")


class _FakeOutboundDrafts:
    def __init__(self, store):
        self._store = store

    def document(self, tracking_id):
        return _FakeOutboundDoc(self._store, tracking_id)

    def stream(self):
        for tid, data in self._store.items():
            snap = MagicMock()
            snap.id = tid
            snap.exists = True
            snap.to_dict.return_value = dict(data)
            yield snap


class _FakeOutboundDoc:
    def __init__(self, store, tracking_id):
        self._store = store
        self._tid = tracking_id

    def set(self, data, merge=False):
        if merge and self._tid in self._store:
            self._store[self._tid].update(data)
        else:
            self._store[self._tid] = dict(data)

    def update(self, data):
        self._store.setdefault(self._tid, {}).update(data)


def test_should_show_prompt_unanswered_threshold(monkeypatch):
    """5+ unanswered emails at the same company → re-ask even if fresh.

    Real round-trip: write 5 outboundDrafts via the actual writer in
    routes.emails, then call should_show_prompt without mocking the
    counter. The fake DB is shared between both modules so the writes
    are visible to the streaming read.
    """
    from app.routes import emails as emails_route
    from app.services import company_contexts_service as svc

    monkeypatch.setenv('REPLY_ATTRIBUTION_ENABLED', 'true')

    fake_db = _FakeOutboundDraftsDB()

    # Write 5 real outboundDrafts via the production writer. The contact
    # dict carries Company='Goldman Sachs', which company_to_slug maps to
    # the canonical 'goldman-sachs' slug -- same key the staleness check
    # filters on.
    for i in range(5):
        emails_route._write_outbound_draft(
            fake_db,
            uid='uid1',
            tracking_id=f'tid-{i}',
            contact_id=f'contact-{i}',
            contact_email=f'analyst{i}@gs.com',
            generation_metadata={'subject': f'hi {i}'},
            contact={'Company': 'Goldman Sachs'},
        )

    # Sanity: every written doc has the canonical slug and no reply yet.
    written = fake_db._drafts.get('uid1', {})
    assert len(written) == 5
    assert all(d['companyIdNormalized'] == 'goldman-sachs' for d in written.values())
    assert all(d['replyReceivedAt'] is None for d in written.values())

    # Existing context is fresh + explicit + answered recently -- without
    # the unanswered backlog the rule would return 'fresh'. The 5
    # backlogged drafts must flip the decision to 'unanswered_threshold'.
    now = datetime(2026, 4, 29, tzinfo=timezone.utc)
    answered = (now - timedelta(days=10)).isoformat()
    existing = {
        'companyId': 'goldman-sachs',
        'reason': 'Family.',
        'source': 'explicit',
        'answeredAt': answered,
        'lastUsedAt': answered,
    }

    with patch.object(svc, 'get_company_context_by_id', return_value=existing):
        with patch.object(svc, 'get_db', return_value=fake_db):
            decision = svc.should_show_prompt('uid1', 'goldman-sachs', now=now)

    assert decision['show'] is True
    assert decision['reason'] == 'unanswered_threshold'


# ============================================================================
# Reason validator (route helper)
# ============================================================================


@pytest.mark.parametrize('bad', ['', '  ', 'short', 'asdf', 'TEST', 'idk'])
def test_validate_reason_rejects_short_or_noise(bad):
    from app.routes.users import _validate_reason_or_400
    cleaned, err = _validate_reason_or_400(bad)
    assert cleaned is None
    assert err is not None  # tuple of (response, status)


@pytest.mark.parametrize('mash', ['aaaaaaaaaaaa', 'asdfasdfasdf', 'aaaaa aaaaa aaaaa'])
def test_validate_reason_rejects_keyboard_mashing(mash):
    from app.routes.users import _validate_reason_or_400
    _, err = _validate_reason_or_400(mash)
    assert err is not None


def test_validate_reason_accepts_real_answer():
    from app.routes.users import _validate_reason_or_400
    cleaned, err = _validate_reason_or_400(
        "My uncle worked in their TMT group; I want to learn from that team."
    )
    assert err is None
    assert cleaned and cleaned.startswith('My uncle')


def test_validate_reason_truncates_max():
    from app.routes.users import _validate_reason_or_400
    long = 'A' + 'b' * 5000
    cleaned, err = _validate_reason_or_400(long)
    # Long inputs that are pure repetition will fail the "set <= 2" check;
    # use varied content to exercise the truncation path.
    assert err is not None
    cleaned, err = _validate_reason_or_400(
        'I want to learn from the team because ' * 100,
    )
    assert err is None
    assert cleaned is not None and len(cleaned) <= 1000
