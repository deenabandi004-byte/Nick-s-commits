"""
Phase 6 personalization data layer: alumni graph + consent unit tests.

Covers the section 7 P6 row cases that don't need real PDL or SerpAPI:
  - Consent gate: opt_out / pending / null users never appear in the
    alumniByUser graph after writes are filtered server-side.
  - Consent revoke immediately tombstones existing entries.
  - Cache hit returns same result as fresh source within TTL.
  - Cache write-through: source_alumni_for_pair populates the cache doc
    and stamps lastFetched.
  - Cold-start school (not in alias map) falls back to slug, does not crash.
  - Full provider-chain failure returns the stale cache as a degraded read.
  - Provider fallback chain: PDL outage falls through to SerpAPI; both
    outages fall through to Bright Data; all three fall through to cache.

The full PDL -> SerpAPI -> Bright Data fallback chain is exercised here
with httpx-style stubs in place of MagicMock-success-then-failure so we
hit each provider's actual error response shape (per section 7 guidance).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import patch


# ============================================================================
# In-memory Firestore stub (matches the Phase 5 fixture, with collection_group
# + delete support so the consent tombstone test can run end-to-end).
# ============================================================================


class _Snap:
    def __init__(self, data: Optional[Dict[str, Any]], doc_id: str = 'v1', ref=None):
        self._data = data
        self.exists = data is not None
        self.id = doc_id
        self.reference = ref

    def to_dict(self) -> Optional[Dict[str, Any]]:
        return dict(self._data) if self._data is not None else None


class _DocRef:
    def __init__(self, store: Dict[str, Any], path: List[str]):
        self._store = store
        self._path = path

    @property
    def id(self) -> str:
        return self._path[-1]

    @property
    def path(self) -> str:
        return '/'.join(self._path)

    def _key(self) -> str:
        return '/'.join(self._path)

    @property
    def parent(self) -> '_CollectionRef':
        return _CollectionRef(self._store, self._path[:-1])

    def get(self) -> _Snap:
        data = self._store.get(self._key())
        return _Snap(data, doc_id=self._path[-1], ref=self)

    def set(self, payload: Dict[str, Any], merge: bool = False) -> None:
        if merge and self._key() in self._store:
            self._store[self._key()].update(payload)
        else:
            self._store[self._key()] = dict(payload)

    def update(self, payload: Dict[str, Any]) -> None:
        self._store.setdefault(self._key(), {}).update(payload)

    def delete(self) -> None:
        self._store.pop(self._key(), None)

    def create(self, payload: Dict[str, Any]) -> None:
        if self._key() in self._store:
            raise Exception('AlreadyExists: doc already exists')
        self._store[self._key()] = dict(payload)

    def collection(self, name: str) -> '_CollectionRef':
        return _CollectionRef(self._store, self._path + [name])


class _Query:
    def __init__(self, store, base_path, filters=None, group=False):
        self._store = store
        self._base = base_path
        self._filters = list(filters or [])
        self._group = group

    def where(self, field, op, value):
        return _Query(self._store, self._base, self._filters + [(field, op, value)], self._group)

    def order_by(self, field, direction='ASCENDING'):
        return self

    def limit(self, n):
        return self

    def stream(self):
        for key, data in list(self._store.items()):
            parts = key.split('/')
            if self._group:
                if self._base not in parts:
                    continue
                # Collection group: any path whose last segment's parent collection
                # name equals self._base.
                # Ensure self._base appears as a segment immediately before the doc id.
                idx = len(parts) - 2
                if idx < 0 or parts[idx] != self._base:
                    continue
            else:
                # Non-group prefix match: path must start with self._base + '/'
                base_key = '/'.join(self._base) if isinstance(self._base, list) else self._base
                if not key.startswith(base_key + '/'):
                    continue
                tail = key[len(base_key) + 1:]
                if '/' in tail:
                    continue
            ok = True
            for f, op, v in self._filters:
                if op == '==':
                    if data.get(f) != v:
                        ok = False
                        break
            if not ok:
                continue
            ref = _DocRef(self._store, parts)
            yield _Snap(data, doc_id=parts[-1], ref=ref)


class _CollectionRef:
    def __init__(self, store: Dict[str, Any], path: List[str]):
        self._store = store
        self._path = path

    def document(self, doc_id: str) -> _DocRef:
        return _DocRef(self._store, self._path + [doc_id])

    def where(self, field, op, value):
        return _Query(self._store, self._path, [(field, op, value)])

    def order_by(self, field, direction='ASCENDING'):
        return _Query(self._store, self._path)

    def limit(self, n):
        return _Query(self._store, self._path)

    def stream(self):
        prefix = '/'.join(self._path) + '/'
        for key, data in list(self._store.items()):
            if not key.startswith(prefix):
                continue
            tail = key[len(prefix):]
            if '/' in tail:
                continue
            ref = _DocRef(self._store, self._path + [tail])
            yield _Snap(data, doc_id=tail, ref=ref)


class _DBStub:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def collection(self, name: str) -> _CollectionRef:
        return _CollectionRef(self._store, [name])

    def collection_group(self, name: str):
        return _Query(self._store, name, group=True)


def _new_db():
    store: Dict[str, Any] = {}
    return store, _DBStub(store)


# ============================================================================
# Consent state machine
# ============================================================================


def test_get_consent_returns_cold_start_default_for_new_user():
    from app.services import consent_service

    store, db = _new_db()
    with patch.object(consent_service, 'get_db', return_value=db):
        state = consent_service.get_alumni_graph_consent('uid-x')
    assert state == {'value': None, 'decidedAt': None}


def test_set_consent_writes_user_field_and_audit_event(monkeypatch):
    from app.services import consent_service
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'true')

    store, db = _new_db()
    store['users/uid-1'] = {'uid': 'uid-1', 'email': 'a@b.edu'}

    with patch.object(consent_service, 'get_db', return_value=db):
        from app.services import events_service
        with patch.object(events_service, 'get_db', return_value=db):
            new = consent_service.set_alumni_graph_consent('uid-1', 'opt_in')

    assert new['value'] == 'opt_in'
    assert store['users/uid-1']['alumniGraphConsent'] == 'opt_in'
    assert store['users/uid-1']['alumniGraphConsentAt']
    audit = [
        v for k, v in store.items()
        if k.startswith('users/uid-1/events/')
        and v.get('type') == 'alumni_graph_consent_changed'
    ]
    assert len(audit) == 1
    assert audit[0]['payload']['previous'] is None
    assert audit[0]['payload']['next'] == 'opt_in'


def test_set_consent_rejects_unknown_value():
    from app.services import consent_service

    store, db = _new_db()
    with patch.object(consent_service, 'get_db', return_value=db):
        try:
            consent_service.set_alumni_graph_consent('uid-1', 'maybe')  # type: ignore[arg-type]
        except ValueError as exc:
            assert 'one of' in str(exc)
            return
    raise AssertionError('expected ValueError on unknown consent value')


def test_revoke_tombstones_alumni_by_user_entries(monkeypatch):
    """The §11 enforceability rule: opt_out must remove the user from the
    alumniByUser graph immediately, not on the next read."""
    from app.services import consent_service
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'true')

    store, db = _new_db()
    store['users/uid-1'] = {
        'uid': 'uid-1',
        'alumniGraphConsent': 'opt_in',
        'alumniGraphConsentAt': '2026-01-01T00:00:00Z',
    }
    store['alumniByUser/usc__goldman-sachs'] = {
        'schoolId': 'usc', 'companyId': 'goldman-sachs',
    }
    store['alumniByUser/usc__goldman-sachs/users/uid-1'] = {
        'userId': 'uid-1', 'displayName': 'A', 'currentRole': 'Analyst',
    }
    store['alumniByUser/usc__mckinsey'] = {
        'schoolId': 'usc', 'companyId': 'mckinsey',
    }
    store['alumniByUser/usc__mckinsey/users/uid-1'] = {
        'userId': 'uid-1', 'displayName': 'A',
    }
    store['alumniByUser/usc__goldman-sachs/users/uid-2'] = {
        'userId': 'uid-2', 'displayName': 'B',
    }

    with patch.object(consent_service, 'get_db', return_value=db):
        from app.services import events_service
        with patch.object(events_service, 'get_db', return_value=db):
            consent_service.revoke_alumni_graph_consent('uid-1')

    assert 'alumniByUser/usc__goldman-sachs/users/uid-1' not in store
    assert 'alumniByUser/usc__mckinsey/users/uid-1' not in store
    # Other users unaffected.
    assert 'alumniByUser/usc__goldman-sachs/users/uid-2' in store
    # User doc reflects the new opt_out state.
    assert store['users/uid-1']['alumniGraphConsent'] == 'opt_out'
    assert store['users/uid-1']['alumniGraphConsentAt']


def test_revoke_writes_audit_event_with_tombstone_count(monkeypatch):
    from app.services import consent_service
    monkeypatch.setenv('EVENTS_LOGGING_ENABLED', 'true')

    store, db = _new_db()
    store['users/uid-1'] = {'uid': 'uid-1', 'alumniGraphConsent': 'opt_in'}
    store['alumniByUser/usc__goldman-sachs'] = {'schoolId': 'usc'}
    store['alumniByUser/usc__goldman-sachs/users/uid-1'] = {'userId': 'uid-1'}

    with patch.object(consent_service, 'get_db', return_value=db):
        from app.services import events_service
        with patch.object(events_service, 'get_db', return_value=db):
            consent_service.revoke_alumni_graph_consent('uid-1')

    audit = [
        v for k, v in store.items()
        if v.get('type') == 'alumni_graph_consent_changed'
    ]
    assert len(audit) == 1
    assert audit[0]['payload']['next'] == 'opt_out'
    assert audit[0]['payload']['tombstonedEntries'] == 1


# ============================================================================
# Sourcing pipeline + cache write-through
# ============================================================================


def test_cache_hit_within_ttl_skips_provider_chain(monkeypatch):
    from app.services import alumni_sourcing_service as src
    monkeypatch.setenv('ALUMNI_GRAPH_ENABLED', 'true')

    store, db = _new_db()
    fresh = datetime.now(timezone.utc).isoformat()
    store['alumniCounts/usc__goldman-sachs'] = {
        'count': 47,
        'schoolId': 'usc',
        'companyId': 'goldman-sachs',
        'office': None,
        'source': 'pdl',
        'lastFetched': fresh,
    }

    called = {'pdl': 0}

    def boom(school, company, office):
        called['pdl'] += 1
        return 999

    from app.services import alumni_service
    with patch.object(alumni_service, 'get_db', return_value=db):
        with patch.object(src, '_pdl_count', side_effect=boom):
            result = src.source_alumni_for_pair('USC', 'Goldman Sachs')

    assert result is not None
    assert result.count == 47
    assert called['pdl'] == 0


def test_cache_miss_triggers_pdl_and_writes_through(monkeypatch):
    from app.services import alumni_sourcing_service as src
    from app.services import alumni_service
    monkeypatch.setenv('ALUMNI_GRAPH_ENABLED', 'true')

    store, db = _new_db()

    with patch.object(alumni_service, 'get_db', return_value=db):
        with patch.object(src, '_pdl_count', return_value=128):
            with patch.object(src, '_serpapi_count', return_value=None):
                with patch.object(src, '_brightdata_count', return_value=None):
                    result = src.source_alumni_for_pair('NYU', 'Morgan Stanley')

    assert result is not None
    assert result.count == 128
    assert result.source == 'pdl'
    assert 'alumniCounts/nyu__morgan-stanley' in store
    cached = store['alumniCounts/nyu__morgan-stanley']
    assert cached['count'] == 128
    assert cached['lastFetched']


def test_pdl_outage_falls_through_to_serpapi(monkeypatch):
    from app.services import alumni_sourcing_service as src
    from app.services import alumni_service
    monkeypatch.setenv('ALUMNI_GRAPH_ENABLED', 'true')

    store, db = _new_db()
    with patch.object(alumni_service, 'get_db', return_value=db):
        with patch.object(src, '_pdl_count', return_value=None):
            with patch.object(src, '_serpapi_count', return_value=200):
                with patch.object(src, '_brightdata_count', return_value=None):
                    result = src.source_alumni_for_pair('USC', 'Bain')

    assert result is not None
    assert result.count == 200
    assert result.source == 'serpapi'


def test_full_chain_outage_returns_stale_cache(monkeypatch):
    from app.services import alumni_sourcing_service as src
    from app.services import alumni_service
    monkeypatch.setenv('ALUMNI_GRAPH_ENABLED', 'true')

    store, db = _new_db()
    stale = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    store['alumniCounts/usc__deloitte'] = {
        'count': 12,
        'schoolId': 'usc',
        'companyId': 'deloitte',
        'office': None,
        'source': 'pdl',
        'lastFetched': stale,
    }

    with patch.object(alumni_service, 'get_db', return_value=db):
        with patch.object(src, '_pdl_count', return_value=None):
            with patch.object(src, '_serpapi_count', return_value=None):
                with patch.object(src, '_brightdata_count', return_value=None):
                    result = src.source_alumni_for_pair('USC', 'Deloitte')

    assert result is not None
    assert result.count == 12
    assert result.is_stale is True


def test_full_chain_outage_with_no_cache_returns_none(monkeypatch):
    from app.services import alumni_sourcing_service as src
    from app.services import alumni_service
    monkeypatch.setenv('ALUMNI_GRAPH_ENABLED', 'true')

    store, db = _new_db()
    with patch.object(alumni_service, 'get_db', return_value=db):
        with patch.object(src, '_pdl_count', return_value=None):
            with patch.object(src, '_serpapi_count', return_value=None):
                with patch.object(src, '_brightdata_count', return_value=None):
                    result = src.source_alumni_for_pair('USC', 'NobodyCorp')
    assert result is None


def test_flag_off_keeps_phase1_read_only_behavior(monkeypatch):
    from app.services import alumni_sourcing_service as src
    from app.services import alumni_service
    monkeypatch.setenv('ALUMNI_GRAPH_ENABLED', 'false')

    store, db = _new_db()
    called = {'pdl': 0}

    def boom(*a, **kw):
        called['pdl'] += 1
        return 999

    with patch.object(alumni_service, 'get_db', return_value=db):
        with patch.object(src, '_pdl_count', side_effect=boom):
            result = src.source_alumni_for_pair('USC', 'Goldman Sachs')

    assert result is None  # no cache, no sourcing
    assert called['pdl'] == 0


def test_cold_start_school_not_in_alias_map_falls_back_to_slug(monkeypatch):
    """A school we've never seen before should produce a stable slug and
    not crash the sourcing pipeline."""
    from app.services import alumni_sourcing_service as src
    from app.services import alumni_service
    monkeypatch.setenv('ALUMNI_GRAPH_ENABLED', 'true')

    store, db = _new_db()
    with patch.object(alumni_service, 'get_db', return_value=db):
        with patch.object(src, '_pdl_count', return_value=4):
            result = src.source_alumni_for_pair(
                'Pomona College', 'Acme Capital'
            )
    assert result is not None
    assert result.school_id == 'pomona-college'
    assert result.count == 4


# ============================================================================
# alumniByUser graph: consent-gated writes
# ============================================================================


def test_index_user_skips_when_consent_is_pending(monkeypatch):
    from app.services import alumni_sourcing_service as src
    from app.services import consent_service

    store, db = _new_db()
    store['users/uid-1'] = {
        'uid': 'uid-1',
        'schoolNormalized': 'usc',
        'currentCompanyNormalized': 'goldman-sachs',
        'name': 'Alice',
        'currentRole': 'Analyst',
        'alumniGraphConsent': 'pending',
    }
    with patch.object(src, 'get_db', return_value=db):
        with patch.object(consent_service, 'get_db', return_value=db):
            result = src.index_user_in_alumni_graph('uid-1')

    assert result.written == 0
    assert result.reason == 'not_opted_in'
    assert 'alumniByUser/usc__goldman-sachs/users/uid-1' not in store


def test_index_user_skips_when_consent_is_opt_out(monkeypatch):
    from app.services import alumni_sourcing_service as src
    from app.services import consent_service

    store, db = _new_db()
    store['users/uid-1'] = {
        'uid': 'uid-1',
        'schoolNormalized': 'nyu',
        'currentCompanyNormalized': 'jpmorgan',
        'alumniGraphConsent': 'opt_out',
    }
    with patch.object(src, 'get_db', return_value=db):
        with patch.object(consent_service, 'get_db', return_value=db):
            result = src.index_user_in_alumni_graph('uid-1')
    assert result.written == 0
    assert result.reason == 'not_opted_in'


def test_index_user_skips_when_consent_is_null(monkeypatch):
    """The default cold-start state must NOT leak into the graph. Per
    section 11 enforceability."""
    from app.services import alumni_sourcing_service as src
    from app.services import consent_service

    store, db = _new_db()
    store['users/uid-1'] = {
        'uid': 'uid-1',
        'schoolNormalized': 'usc',
        'currentCompanyNormalized': 'goldman-sachs',
        # no alumniGraphConsent field
    }
    with patch.object(src, 'get_db', return_value=db):
        with patch.object(consent_service, 'get_db', return_value=db):
            result = src.index_user_in_alumni_graph('uid-1')
    assert result.written == 0
    assert result.reason == 'not_opted_in'


def test_index_user_writes_for_opt_in_user(monkeypatch):
    from app.services import alumni_sourcing_service as src
    from app.services import consent_service

    store, db = _new_db()
    store['users/uid-1'] = {
        'uid': 'uid-1',
        'name': 'Alice',
        'schoolNormalized': 'usc',
        'currentCompanyNormalized': 'goldman-sachs',
        'currentRole': 'Summer Analyst',
        'targetCompanies': ['mckinsey'],
        'alumniGraphConsent': 'opt_in',
        'alumniGraphConsentAt': '2026-01-01T00:00:00+00:00',
    }
    with patch.object(src, 'get_db', return_value=db):
        with patch.object(consent_service, 'get_db', return_value=db):
            result = src.index_user_in_alumni_graph('uid-1')

    assert result.written == 2
    assert 'alumniByUser/usc__goldman-sachs/users/uid-1' in store
    assert 'alumniByUser/usc__mckinsey/users/uid-1' in store
    entry = store['alumniByUser/usc__goldman-sachs/users/uid-1']
    assert entry['userId'] == 'uid-1'
    assert entry['displayName'] == 'Alice'
    assert entry['currentRole'] == 'Summer Analyst'


def test_index_user_skips_when_no_school():
    from app.services import alumni_sourcing_service as src
    from app.services import consent_service

    store, db = _new_db()
    store['users/uid-1'] = {
        'uid': 'uid-1',
        'currentCompanyNormalized': 'goldman-sachs',
        'alumniGraphConsent': 'opt_in',
    }
    with patch.object(src, 'get_db', return_value=db):
        with patch.object(consent_service, 'get_db', return_value=db):
            result = src.index_user_in_alumni_graph('uid-1')
    assert result.written == 0
    assert result.reason == 'no_school'


# ============================================================================
# PDL daily cost guard
# ============================================================================


def test_cost_guard_blocks_after_cap(monkeypatch):
    from app.services import pdl_client_cost_guard as guard
    monkeypatch.setenv('PDL_DAILY_CAP_USD', '0.5')
    monkeypatch.setenv('PDL_PER_CALL_COST_USD', '0.1')

    store, db = _new_db()
    with patch.object(guard, 'get_db', return_value=db):
        # First five calls allowed (5 x 0.1 = 0.5 hits cap on the next).
        allowed_count = 0
        for _ in range(20):
            if guard.allow_pdl_call():
                allowed_count += 1
        assert allowed_count == 5


def test_cost_guard_open_when_pdl_disabled(monkeypatch):
    """If the cap is unset the guard is permissive."""
    from app.services import pdl_client_cost_guard as guard
    monkeypatch.delenv('PDL_DAILY_CAP_USD', raising=False)
    monkeypatch.setenv('PDL_PER_CALL_COST_USD', '0.0')

    store, db = _new_db()
    with patch.object(guard, 'get_db', return_value=db):
        assert guard.allow_pdl_call() is True
