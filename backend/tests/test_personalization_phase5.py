"""
Phase 5 personalization data layer: recommendation engine unit tests.

Covers the section 7 (P5 row) cases that don't need real Firestore:
  - Cache hit returns same result twice in a row.
  - Cache invalidation: when a major event fires, the next read recomputes.
  - Cold-start user (no events, no derivedProfile, no saved contacts) gets
    at least 3 contacts back, never [].
  - rank_contacts respects limit.
  - RankedContact and RankedJob default predicted_outcome=None and
    path_similarity_score=None (section 9.B / section 13 stubs).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch


# ============================================================================
# Mock harness: a tiny in-memory Firestore stand-in.
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
        self._path = path  # e.g. ['users', 'uid-1', 'recommendations', 'v1']

    def _key(self) -> str:
        return '/'.join(self._path)

    def get(self) -> _Snap:
        data = self._store.get(self._key())
        return _Snap(data, doc_id=self._path[-1])

    def set(self, payload: Dict[str, Any], merge: bool = False) -> None:
        if merge and self._key() in self._store:
            self._store[self._key()].update(payload)
        else:
            self._store[self._key()] = dict(payload)

    def update(self, payload: Dict[str, Any]) -> None:
        self._store.setdefault(self._key(), {}).update(payload)

    def delete(self) -> None:
        self._store.pop(self._key(), None)

    def collection(self, name: str) -> '_CollectionRef':
        return _CollectionRef(self._store, self._path + [name])


class _CollectionRef:
    def __init__(self, store: Dict[str, Any], path: List[str]):
        self._store = store
        self._path = path  # e.g. ['users', 'uid-1', 'events']

    def document(self, doc_id: str) -> _DocRef:
        return _DocRef(self._store, self._path + [doc_id])

    def stream(self):
        prefix = '/'.join(self._path) + '/'
        for key, data in list(self._store.items()):
            if not key.startswith(prefix):
                continue
            tail = key[len(prefix):]
            if '/' in tail:
                # Deeper subcollection, not a direct child doc.
                continue
            yield _Snap(data, doc_id=tail)


class _DBStub:
    def __init__(self, store: Dict[str, Any]):
        self._store = store

    def collection(self, name: str) -> _CollectionRef:
        return _CollectionRef(self._store, [name])


def _build_db(
    *,
    user_profile: Optional[Dict[str, Any]] = None,
    derived_profile: Optional[Dict[str, Any]] = None,
    company_contexts: Optional[Dict[str, Dict[str, Any]]] = None,
    saved_contacts: Optional[Dict[str, Dict[str, Any]]] = None,
    events: Optional[List[Dict[str, Any]]] = None,
    cached_recommendations: Optional[Dict[str, Any]] = None,
    uid: str = 'uid-1',
):
    """Return (store, db_stub). Mutate `store` directly to add data after
    construction (e.g. fire an event mid-test)."""
    store: Dict[str, Any] = {}
    if user_profile is not None:
        store[f'users/{uid}'] = user_profile
    if derived_profile is not None:
        store[f'users/{uid}/derivedProfile/v1'] = derived_profile
    for cid, ctx in (company_contexts or {}).items():
        store[f'users/{uid}/companyContexts/{cid}'] = ctx
    for cid, c in (saved_contacts or {}).items():
        store[f'users/{uid}/contacts/{cid}'] = c
    for evt in (events or []):
        eid = evt.get('eventId') or f'evt-{len(store)}'
        store[f'users/{uid}/events/{eid}'] = evt
    if cached_recommendations is not None:
        store[f'users/{uid}/recommendations/v1'] = cached_recommendations
    return store, _DBStub(store)


# ============================================================================
# Section 9.B / Section 13: dataclass defaults
# ============================================================================


def test_ranked_contact_defaults_predicted_outcome_and_path_similarity_to_none():
    from app.services.recommendation_service import RankedContact, OutcomePrediction

    rc = RankedContact(contact_id='c-1', score=10.0, rationale='hi')
    assert rc.predicted_outcome is None
    assert rc.path_similarity_score is None
    # OutcomePrediction is a stub dataclass, instantiable but empty.
    assert OutcomePrediction() is not None


def test_ranked_job_defaults_predicted_outcome_and_path_similarity_to_none():
    from app.services.recommendation_service import RankedJob

    rj = RankedJob(posting_id='p-1', score=5.0, rationale='hi')
    assert rj.predicted_outcome is None
    assert rj.path_similarity_score is None


def test_ranked_contact_to_dict_excludes_predicted_outcome_payload():
    """to_dict serializes predictedOutcome=None even if a future caller
    populates the dataclass field, so the API surface stays predictable
    until the predictor is built (section 9.B note)."""
    from app.services.recommendation_service import RankedContact, OutcomePrediction

    rc = RankedContact(
        contact_id='c-1',
        score=10.0,
        rationale='hi',
        predicted_outcome=OutcomePrediction(),
        path_similarity_score=0.42,
    )
    d = rc.to_dict()
    assert d['predictedOutcome'] is None
    assert d['pathSimilarityScore'] == 0.42


# ============================================================================
# Cold-start: no events, no derivedProfile, but a structured profile.
# ============================================================================


def test_cold_start_user_gets_at_least_three_contacts_never_empty():
    """A user who confirmed their profile but has zero events and zero
    saved contacts should still get >=3 recommendations. The cold-start
    safety net (section 15 number 7) is in the service, not just the UI."""
    from app.services import recommendation_service as svc

    profile = {
        'school': 'University of Southern California',
        'schoolNormalized': 'usc',
        'targetCompanies': ['Goldman Sachs', 'McKinsey', 'Apple'],
        'targetIndustries': ['investment_banking', 'consulting'],
        'targetRoleTypes': ['analyst', 'associate'],
    }
    _, db = _build_db(user_profile=profile)
    with patch.object(svc, 'get_db', return_value=db):
        contacts = svc.rank_contacts('uid-1', limit=20)
    assert len(contacts) >= 3
    # Seeded contacts get the synthetic id prefix.
    assert all(c.contact_id.startswith('seed:') for c in contacts)
    # Rationales are non-empty so the UI has something to render.
    assert all(c.rationale for c in contacts)


def test_cold_start_user_with_completely_empty_profile_returns_seeds_or_empty():
    """A user with no school AND no target companies/industries has no
    seedable signal. The service may return empty; the UI is the layer
    that surfaces the cold-start CTA."""
    from app.services import recommendation_service as svc

    _, db = _build_db(user_profile={'uid': 'uid-1', 'email': 'x@y.com'})
    with patch.object(svc, 'get_db', return_value=db):
        contacts = svc.rank_contacts('uid-1', limit=20)
    # Empty pool, empty seeds. The frontend CTA covers this case.
    assert contacts == []


# ============================================================================
# Cache hit: idempotent reads.
# ============================================================================


def test_cache_hit_returns_same_result_twice_in_a_row():
    from app.services import recommendation_service as svc

    profile = {
        'school': 'NYU',
        'schoolNormalized': 'nyu',
        'targetCompanies': ['Goldman Sachs', 'JPMorgan'],
        'targetIndustries': ['investment_banking'],
    }
    _, db = _build_db(user_profile=profile)
    with patch.object(svc, 'get_db', return_value=db):
        first = svc.rank_contacts('uid-1', limit=5)
        second = svc.rank_contacts('uid-1', limit=5)

    assert len(first) == len(second)
    for a, b in zip(first, second):
        assert a.contact_id == b.contact_id
        assert a.score == b.score
        assert a.rationale == b.rationale


def test_cache_hit_skips_recompute(monkeypatch):
    """Once the cache is warm, _compute_contacts should NOT be called again
    until the cache expires or a major event fires."""
    from app.services import recommendation_service as svc

    profile = {
        'targetCompanies': ['Stripe'],
        'targetIndustries': ['tech_swe'],
    }
    _, db = _build_db(user_profile=profile)

    real_compute = svc._compute_contacts
    call_count = {'n': 0}

    def counting(uid):
        call_count['n'] += 1
        return real_compute(uid)

    with patch.object(svc, 'get_db', return_value=db), \
         patch.object(svc, '_compute_contacts', side_effect=counting):
        svc.rank_contacts('uid-1', limit=5)
        svc.rank_contacts('uid-1', limit=5)
        svc.rank_contacts('uid-1', limit=5)

    # 1 compute on first call, 0 on warmed cache. _compute_jobs is
    # unrelated; we only assert _compute_contacts here.
    assert call_count['n'] == 1


# ============================================================================
# Cache invalidation: clock-mocked expiresAt + major event triggers recompute.
# ============================================================================


def test_cache_invalidation_recomputes_when_expiresAt_is_in_the_past():
    """Manually set expiresAt to the past in the cached doc; the next
    rank_contacts call should recompute and overwrite the cache."""
    from app.services import recommendation_service as svc

    profile = {
        'targetCompanies': ['Apple'],
        'targetIndustries': ['tech_swe'],
    }
    past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    cached = {
        'contacts': [{
            'contactId': 'stale-id',
            'score': 999.0,
            'rationale': 'stale rationale',
            'predictedOutcome': None,
            'pathSimilarityScore': None,
            'display': {},
        }],
        'jobs': [],
        'lastComputedAt': past,
        'expiresAt': past,
    }
    store, db = _build_db(user_profile=profile, cached_recommendations=cached)
    with patch.object(svc, 'get_db', return_value=db):
        result = svc.rank_contacts('uid-1', limit=5)
    # Stale id must NOT survive the recompute.
    assert all(r.contact_id != 'stale-id' for r in result)
    # The cache doc was overwritten with a fresh expiresAt in the future.
    refreshed = store['users/uid-1/recommendations/v1']
    refreshed_expires = datetime.fromisoformat(refreshed['expiresAt'])
    assert refreshed_expires > datetime.now(timezone.utc)


def test_cache_invalidation_recomputes_after_major_event_fires():
    """Cache is fresh by TTL but a major event (reply_received) lands
    after lastComputedAt; the next read must recompute, not serve the
    stale cache."""
    from app.services import recommendation_service as svc

    profile = {
        'targetCompanies': ['McKinsey'],
        'targetIndustries': ['consulting'],
    }
    last_computed = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=55)).isoformat()
    cached = {
        'contacts': [{
            'contactId': 'pre-event',
            'score': 1.0,
            'rationale': 'pre-event',
            'predictedOutcome': None,
            'pathSimilarityScore': None,
            'display': {},
        }],
        'jobs': [],
        'lastComputedAt': last_computed,
        'expiresAt': expires,
    }
    store, db = _build_db(user_profile=profile, cached_recommendations=cached)

    # Sanity: cache still fresh; no event yet.
    with patch.object(svc, 'get_db', return_value=db):
        first = svc.rank_contacts('uid-1', limit=5)
    assert any(r.contact_id == 'pre-event' for r in first)

    # Fire a major event after lastComputedAt.
    event_ts = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    store['users/uid-1/events/evt-major'] = {
        'eventId': 'evt-major',
        'type': 'reply_received',
        'timestamp': event_ts,
        'payload': {'contactId': 'c-1', 'trackingId': 't-1'},
        'source': 'backend',
    }

    with patch.object(svc, 'get_db', return_value=db):
        second = svc.rank_contacts('uid-1', limit=5)
    # pre-event must be gone; recompute happened.
    assert all(r.contact_id != 'pre-event' for r in second)


def test_cache_invalidation_ignores_non_major_events():
    """A non-major event (contact_card_viewed) must NOT bust the cache.
    Otherwise we'd churn recompute on every contact view."""
    from app.services import recommendation_service as svc

    profile = {'targetCompanies': ['Stripe']}
    last_computed = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=55)).isoformat()
    cached = {
        'contacts': [{
            'contactId': 'pre-noise',
            'score': 1.0,
            'rationale': 'pre-noise',
            'predictedOutcome': None,
            'pathSimilarityScore': None,
            'display': {},
        }],
        'jobs': [],
        'lastComputedAt': last_computed,
        'expiresAt': expires,
    }
    store, db = _build_db(user_profile=profile, cached_recommendations=cached)
    # Fire a non-major event after lastComputedAt.
    store['users/uid-1/events/evt-noise'] = {
        'eventId': 'evt-noise',
        'type': 'contact_card_viewed',
        'timestamp': (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
        'payload': {'contactId': 'c-1'},
        'source': 'frontend',
    }
    with patch.object(svc, 'get_db', return_value=db):
        result = svc.rank_contacts('uid-1', limit=5)
    # Cache served: pre-noise is still there.
    assert any(r.contact_id == 'pre-noise' for r in result)


# ============================================================================
# Limit semantics
# ============================================================================


def test_rank_contacts_respects_limit():
    from app.services import recommendation_service as svc

    profile = {
        'school': 'NYU',
        'schoolNormalized': 'nyu',
        'targetCompanies': [
            'Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Apple',
            'Google', 'Meta', 'Stripe', 'Amazon',
        ],
        'targetIndustries': ['investment_banking', 'tech_swe'],
        'targetRoleTypes': ['analyst', 'swe'],
    }
    _, db = _build_db(user_profile=profile)
    with patch.object(svc, 'get_db', return_value=db):
        small = svc.rank_contacts('uid-1', limit=2)
        big = svc.rank_contacts('uid-1', limit=10)

    assert len(small) <= 2
    assert len(big) <= 10
    # The cache returns the same underlying list, so big should be
    # a superset prefix of small (same ordering).
    assert [c.contact_id for c in small] == [c.contact_id for c in big[:len(small)]]


def test_rank_contacts_zero_limit_returns_empty():
    from app.services import recommendation_service as svc

    profile = {'targetCompanies': ['Stripe']}
    _, db = _build_db(user_profile=profile)
    with patch.object(svc, 'get_db', return_value=db):
        assert svc.rank_contacts('uid-1', limit=0) == []


# ============================================================================
# Saved-contact scoring path
# ============================================================================


def test_saved_contact_at_target_company_outranks_unrelated_contact():
    """A saved contact whose company is in targetCompanies should rank
    above one who is not."""
    from app.services import recommendation_service as svc

    profile = {
        'school': 'USC',
        'schoolNormalized': 'usc',
        'targetCompanies': ['Goldman Sachs'],
        'targetIndustries': ['investment_banking'],
    }
    saved = {
        'c-target': {
            'name': 'Alex Target',
            'company': 'Goldman Sachs',
            'title': 'Analyst',
        },
        'c-unrelated': {
            'name': 'Pat Unrelated',
            'company': 'Random Co',
            'title': 'Manager',
        },
    }
    _, db = _build_db(user_profile=profile, saved_contacts=saved)
    with patch.object(svc, 'get_db', return_value=db):
        ranked = svc.rank_contacts('uid-1', limit=10)

    by_id = {r.contact_id: r for r in ranked}
    assert 'c-target' in by_id
    assert 'c-unrelated' in by_id
    assert by_id['c-target'].score > by_id['c-unrelated'].score


def test_jobs_seed_from_target_companies_and_role_types():
    from app.services import recommendation_service as svc

    profile = {
        'targetCompanies': ['Goldman Sachs', 'McKinsey'],
        'targetRoleTypes': ['analyst'],
    }
    _, db = _build_db(user_profile=profile)
    with patch.object(svc, 'get_db', return_value=db):
        jobs = svc.rank_jobs('uid-1', limit=10)

    assert len(jobs) >= 2
    # Every seed posting_id starts with 'seed:'.
    assert all(j.posting_id.startswith('seed:') for j in jobs)
    assert all(j.predicted_outcome is None for j in jobs)
    assert all(j.path_similarity_score is None for j in jobs)


# ============================================================================
# Feature flag
# ============================================================================


def test_is_enabled_defaults_off(monkeypatch):
    monkeypatch.delenv('RECOMMENDATIONS_ENABLED', raising=False)
    from app.services import recommendation_service as svc
    assert svc.is_enabled() is False


def test_is_enabled_respects_env(monkeypatch):
    from app.services import recommendation_service as svc
    monkeypatch.setenv('RECOMMENDATIONS_ENABLED', 'true')
    assert svc.is_enabled() is True
    monkeypatch.setenv('RECOMMENDATIONS_ENABLED', 'false')
    assert svc.is_enabled() is False
