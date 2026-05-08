"""
Phase 7 personalization data layer: dispatch + edit-rate metric tests.

Covers section 7 (P7 row) cases that don't need real OpenAI:
  - A/B assignment is deterministic per user (same uid → same bucket).
  - Dispatch routes correctly based on USE_NEW_GENERATOR flag state.
  - Dispatch falls back to legacy when the new generator raises
    (NotImplementedError + generic Exception both tagged 'new_unavailable').
  - email_drafted-style payloads carry generatorVersion through the
    metric pipeline.
  - Edit-rate metric bucketing prefers the per-event generatorVersion
    field and falls back to the user assignment when missing.
  - 20-profile snapshot dispatch run (mocked OpenAI) does not crash on
    the variety of profile shapes a real user base produces.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch


# ============================================================================
# In-memory Firestore stub (mirrors the Phase 5/6 fixtures).
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
            self._store[self._key()].update(payload)
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


def _build_db(
    *,
    users: Optional[Dict[str, Dict[str, Any]]] = None,
    events_per_user: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    flags_doc: Optional[Dict[str, Any]] = None,
):
    store: Dict[str, Any] = {}
    for uid, profile in (users or {}).items():
        store[f'users/{uid}'] = profile
    for uid, evs in (events_per_user or {}).items():
        for evt in evs:
            eid = evt.get('eventId') or f'evt-{uid}-{len(store)}'
            store[f'users/{uid}/events/{eid}'] = evt
    if flags_doc is not None:
        store['feature_flags/global'] = flags_doc
    return store, _DBStub(store)


def _make_event(
    *,
    ev_type: str,
    timestamp: datetime,
    payload: Optional[Dict[str, Any]] = None,
    event_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        'eventId': event_id or f'{ev_type}-{timestamp.isoformat()}',
        'type': ev_type,
        'timestamp': timestamp,
        'payload': payload or {},
    }


def _flush_flag_cache():
    """Reset feature_flags's in-memory cache between tests so flag
    flips made via flags_doc on the stub take effect immediately."""
    from app.services import feature_flags
    feature_flags.invalidate_cache()


# ============================================================================
# Section 7 P7: A/B assignment is deterministic per user.
# ============================================================================


def test_assignment_is_deterministic_for_same_uid():
    """sha256(flag:uid) bucketing means the same uid always lands in
    the same bucket. The dashboard relies on this so a user's old
    drafts and new drafts all show up in the same A/B column."""
    from app.services.feature_flags import (
        USE_NEW_GENERATOR,
        _bucket,
        get_assignment,
        invalidate_cache,
    )

    flags_doc = {USE_NEW_GENERATOR: {'enabled': True, 'rollout_pct': 50}}
    _, db = _build_db(flags_doc=flags_doc)
    invalidate_cache()
    with patch('app.services.feature_flags.get_db', return_value=db):
        a1 = get_assignment(USE_NEW_GENERATOR, 'uid-stable-a')
        a2 = get_assignment(USE_NEW_GENERATOR, 'uid-stable-a')
        b1 = get_assignment(USE_NEW_GENERATOR, 'uid-stable-b')
    assert a1['bucket'] == a2['bucket']
    assert a1['enabled'] == a2['enabled']
    # Different uids may or may not land in the same bucket; only
    # determinism per-uid is the contract. Verify the bucket itself is
    # the deterministic hash, not random.
    assert a1['bucket'] == _bucket(USE_NEW_GENERATOR, 'uid-stable-a')
    assert b1['bucket'] == _bucket(USE_NEW_GENERATOR, 'uid-stable-b')


def test_assignment_respects_overrides():
    """`overrides` map wins over rollout_pct so founders can be force-
    enabled on the new generator regardless of their hash bucket."""
    from app.services.feature_flags import USE_NEW_GENERATOR, get_assignment, invalidate_cache

    flags_doc = {
        USE_NEW_GENERATOR: {
            'enabled': True,
            'rollout_pct': 0,                 # nobody bucketed in
            'overrides': {'uid-founder': True},
        }
    }
    _, db = _build_db(flags_doc=flags_doc)
    invalidate_cache()
    with patch('app.services.feature_flags.get_db', return_value=db):
        founder = get_assignment(USE_NEW_GENERATOR, 'uid-founder')
        random_user = get_assignment(USE_NEW_GENERATOR, 'uid-someone-else')
    assert founder['enabled'] is True
    assert founder['reason'] == 'override'
    assert random_user['enabled'] is False
    assert random_user['reason'] == 'rollout'


# ============================================================================
# Section 7 P7: Dispatch routes correctly based on flag state.
# ============================================================================


def test_dispatch_routes_to_legacy_when_flag_is_off():
    """USE_NEW_GENERATOR off (default) means the legacy generator runs
    unconditionally. generator_version on the result is 'old'."""
    from app.services import email_generator_dispatch as disp

    legacy_results = {0: {'subject': 's', 'body': 'b', 'personalization': {}}}
    flags_doc = {disp.USE_NEW_GENERATOR if False else 'USE_NEW_GENERATOR': {'enabled': False}}
    _, db = _build_db(flags_doc=flags_doc)
    _flush_flag_cache()

    with patch('app.services.feature_flags.get_db', return_value=db), \
         patch.object(disp, '_run_legacy_generator', return_value=legacy_results) as legacy_mock, \
         patch.object(disp, '_run_new_generator') as new_mock:
        out = disp.dispatch_email_generation(
            'uid-1',
            contacts=[{'id': 'c-1', 'Email': 'x@y.com'}],
            resume_text=None,
            user_profile={'name': 'A', 'email': 'a@b.com'},
            career_interests=[],
        )
    legacy_mock.assert_called_once()
    new_mock.assert_not_called()
    assert out.generator_version == disp.GENERATOR_VERSION_OLD
    assert out.results == legacy_results


def test_dispatch_routes_to_new_when_flag_on_and_returns_results():
    """USE_NEW_GENERATOR on means the new generator runs. When it
    returns results, generator_version is 'new'."""
    from app.services import email_generator_dispatch as disp

    new_results = {0: {'subject': 'new-s', 'body': 'new-b', 'personalization': {}}}
    flags_doc = {'USE_NEW_GENERATOR': {'enabled': True, 'rollout_pct': 100}}
    _, db = _build_db(flags_doc=flags_doc)
    _flush_flag_cache()

    with patch('app.services.feature_flags.get_db', return_value=db), \
         patch.object(disp, '_run_new_generator', return_value=new_results) as new_mock, \
         patch.object(disp, '_run_legacy_generator') as legacy_mock:
        out = disp.dispatch_email_generation(
            'uid-1',
            contacts=[{'id': 'c-1', 'Email': 'x@y.com'}],
            resume_text=None,
            user_profile={'name': 'A', 'email': 'a@b.com'},
            career_interests=[],
        )
    new_mock.assert_called_once()
    legacy_mock.assert_not_called()
    assert out.generator_version == disp.GENERATOR_VERSION_NEW
    assert out.results == new_results
    assert out.per_contact_versions == {0: disp.GENERATOR_VERSION_NEW}


def test_dispatch_falls_back_to_legacy_on_not_implemented_error():
    """The new generator is a stub that raises NotImplementedError per
    section 4.3. Dispatch must catch it and fall back to legacy with
    generator_version='new_unavailable' so the dashboard surfaces the
    fallback rate without dirtying the A/B numbers."""
    from app.services import email_generator_dispatch as disp

    legacy_results = {0: {'subject': 's', 'body': 'b', 'personalization': {}}}
    flags_doc = {'USE_NEW_GENERATOR': {'enabled': True, 'rollout_pct': 100}}
    _, db = _build_db(flags_doc=flags_doc)
    _flush_flag_cache()

    with patch('app.services.feature_flags.get_db', return_value=db), \
         patch.object(disp, '_run_new_generator', side_effect=NotImplementedError('stub')), \
         patch.object(disp, '_run_legacy_generator', return_value=legacy_results) as legacy_mock:
        out = disp.dispatch_email_generation(
            'uid-1',
            contacts=[{'id': 'c-1'}],
            resume_text=None,
            user_profile={'name': 'A', 'email': 'a@b.com'},
            career_interests=[],
        )
    legacy_mock.assert_called_once()
    assert out.generator_version == disp.GENERATOR_VERSION_NEW_UNAVAILABLE
    assert out.results == legacy_results
    assert out.per_contact_versions == {0: disp.GENERATOR_VERSION_NEW_UNAVAILABLE}


def test_dispatch_falls_back_to_legacy_on_generic_exception():
    """ANY exception from the new path falls back to legacy. Section 12
    risk #1 (generator-divergence) and section 8 (P7 rollback risk):
    dispatch must never be the reason an email fails to generate."""
    from app.services import email_generator_dispatch as disp

    legacy_results = {0: {'subject': 's', 'body': 'b', 'personalization': {}}}
    flags_doc = {'USE_NEW_GENERATOR': {'enabled': True, 'rollout_pct': 100}}
    _, db = _build_db(flags_doc=flags_doc)
    _flush_flag_cache()

    with patch('app.services.feature_flags.get_db', return_value=db), \
         patch.object(disp, '_run_new_generator', side_effect=RuntimeError('boom')), \
         patch.object(disp, '_run_legacy_generator', return_value=legacy_results):
        out = disp.dispatch_email_generation(
            'uid-1',
            contacts=[{'id': 'c-1'}],
            resume_text=None,
            user_profile={'name': 'A', 'email': 'a@b.com'},
            career_interests=[],
        )
    assert out.generator_version == disp.GENERATOR_VERSION_NEW_UNAVAILABLE
    assert out.results == legacy_results


def test_dispatch_new_path_uses_real_email_generator_stub():
    """Without mocking, the new generator stub raises NotImplementedError
    so dispatch falls back. This is the actual production codepath today;
    keep it green so the kill-switch behavior is exercised end-to-end."""
    from app.services import email_generator_dispatch as disp

    legacy_results = {0: {'subject': 's', 'body': 'b', 'personalization': {}}}
    flags_doc = {'USE_NEW_GENERATOR': {'enabled': True, 'rollout_pct': 100}}
    _, db = _build_db(flags_doc=flags_doc)
    _flush_flag_cache()

    with patch('app.services.feature_flags.get_db', return_value=db), \
         patch.object(disp, '_run_legacy_generator', return_value=legacy_results) as legacy_mock:
        out = disp.dispatch_email_generation(
            'uid-1',
            contacts=[{'id': 'c-1', 'Company': 'Goldman Sachs', 'FirstName': 'Alex'}],
            resume_text=None,
            user_profile={'name': 'A', 'email': 'a@b.com', 'school': 'USC'},
            career_interests=[],
        )
    legacy_mock.assert_called_once()
    assert out.generator_version == disp.GENERATOR_VERSION_NEW_UNAVAILABLE


# ============================================================================
# Section 7 P7: Edit-rate metric pipeline (event log -> dashboard).
# ============================================================================


def _ts(days_ago: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago)


def test_compute_edit_rate_buckets_by_payload_generator_version():
    """The metric pipeline prefers per-event generatorVersion over
    user-level assignment so historical drafts under prior rollout pcts
    bucket correctly."""
    from app.services import edit_rate_metrics as metrics

    events_per_user = {
        'uid-old': [
            _make_event(
                ev_type='email_drafted', timestamp=_ts(2),
                payload={'generatorVersion': 'old', 'trackingId': 't1', 'contactId': 'c1'},
            ),
            _make_event(
                ev_type='email_edited', timestamp=_ts(2),
                payload={'generatorVersion': 'old', 'trackingId': 't1', 'contactId': 'c1'},
            ),
        ],
        'uid-new': [
            _make_event(
                ev_type='email_drafted', timestamp=_ts(2),
                payload={'generatorVersion': 'new', 'trackingId': 't2', 'contactId': 'c2'},
            ),
            _make_event(
                ev_type='email_drafted', timestamp=_ts(2),
                payload={'generatorVersion': 'new', 'trackingId': 't3', 'contactId': 'c3'},
            ),
            _make_event(
                ev_type='email_edited', timestamp=_ts(2),
                payload={'generatorVersion': 'new', 'trackingId': 't2', 'contactId': 'c2'},
            ),
        ],
    }
    users = {uid: {'uid': uid, 'email': f'{uid}@test'} for uid in events_per_user}
    _, db = _build_db(users=users, events_per_user=events_per_user, flags_doc={})
    _flush_flag_cache()

    with patch('app.services.feature_flags.get_db', return_value=db):
        out = metrics.compute_edit_rate(db, window_days=14)

    assert out['old_generator']['drafts'] == 1
    assert out['old_generator']['edits'] == 1
    assert out['old_generator']['edit_rate'] == 1.0
    assert out['new_generator']['drafts'] == 2
    assert out['new_generator']['edits'] == 1
    assert out['new_generator']['edit_rate'] == 0.5
    assert out['new_unavailable']['drafts'] == 0


def test_compute_edit_rate_separates_new_unavailable_bucket():
    """Drafts where the new path threw and fell back to legacy are
    counted in their own bucket, not folded into 'new_generator'. The
    A/B comparison should not be polluted by the fallback rate."""
    from app.services import edit_rate_metrics as metrics

    events = {
        'uid-x': [
            _make_event(
                ev_type='email_drafted', timestamp=_ts(1),
                payload={'generatorVersion': 'new_unavailable', 'trackingId': 'ta', 'contactId': 'c1'},
            ),
            _make_event(
                ev_type='email_edited', timestamp=_ts(1),
                payload={'generatorVersion': 'new_unavailable', 'trackingId': 'ta', 'contactId': 'c1'},
            ),
        ],
    }
    _, db = _build_db(users={'uid-x': {'uid': 'uid-x'}}, events_per_user=events, flags_doc={})
    _flush_flag_cache()

    with patch('app.services.feature_flags.get_db', return_value=db):
        out = metrics.compute_edit_rate(db, window_days=14)

    assert out['new_generator']['drafts'] == 0
    assert out['old_generator']['drafts'] == 0
    assert out['new_unavailable']['drafts'] == 1
    assert out['new_unavailable']['edits'] == 1
    assert out['new_unavailable']['edit_rate'] == 1.0


def test_compute_edit_rate_falls_back_to_user_assignment_for_legacy_events():
    """Events written before the dispatcher landed don't have
    generatorVersion in their payload. Bucket those by the user's
    current USE_NEW_GENERATOR assignment so the metric isn't blank
    during the migration window."""
    from app.services import edit_rate_metrics as metrics

    events = {
        'uid-legacy': [
            _make_event(
                ev_type='email_drafted', timestamp=_ts(2),
                payload={'trackingId': 't1', 'contactId': 'c1'},  # no generatorVersion
            ),
            _make_event(
                ev_type='email_edited', timestamp=_ts(2),
                payload={'trackingId': 't1', 'contactId': 'c1'},
            ),
        ],
    }
    flags_doc = {
        'USE_NEW_GENERATOR': {
            'enabled': True,
            'rollout_pct': 0,
            'overrides': {'uid-legacy': True},
        }
    }
    _, db = _build_db(
        users={'uid-legacy': {'uid': 'uid-legacy'}},
        events_per_user=events,
        flags_doc=flags_doc,
    )
    _flush_flag_cache()

    with patch('app.services.feature_flags.get_db', return_value=db):
        out = metrics.compute_edit_rate(db, window_days=14)
    # Override forces uid-legacy into 'new'; missing payload field
    # falls back to that assignment.
    assert out['new_generator']['drafts'] == 1
    assert out['old_generator']['drafts'] == 0


def test_compute_edit_rate_window_clamps_to_max_90():
    """Even if the route passes a huge `days` value through, the metric
    pipeline clamps to [1, 90] so a single accidental call can't
    iterate all-of-time."""
    from app.services import edit_rate_metrics as metrics

    _, db = _build_db(users={'u': {}}, flags_doc={})
    _flush_flag_cache()
    with patch('app.services.feature_flags.get_db', return_value=db):
        out = metrics.compute_edit_rate(db, window_days=999)
    assert out['window_days'] == 90


def test_compute_edit_rate_window_drops_events_outside_window():
    """An old draft outside the window should not be counted, even if
    the user's current bucket would otherwise include it."""
    from app.services import edit_rate_metrics as metrics

    events = {
        'uid-recent': [
            _make_event(
                ev_type='email_drafted', timestamp=_ts(2),
                payload={'generatorVersion': 'new', 'trackingId': 'tr', 'contactId': 'c'},
            ),
            _make_event(
                ev_type='email_drafted', timestamp=_ts(60),
                payload={'generatorVersion': 'new', 'trackingId': 'told', 'contactId': 'c'},
            ),
        ],
    }
    _, db = _build_db(
        users={'uid-recent': {'uid': 'uid-recent'}},
        events_per_user=events,
        flags_doc={},
    )
    _flush_flag_cache()
    with patch('app.services.feature_flags.get_db', return_value=db):
        out = metrics.compute_edit_rate(db, window_days=14)
    assert out['new_generator']['drafts'] == 1


# ============================================================================
# Section 7 P7 (mock-danger note 4): 20-profile snapshot dispatch run.
# ============================================================================


def _profile_snapshot(i: int) -> Dict[str, Any]:
    """Twenty roughly-realistic profile shapes spanning the variation we
    see in the 41 paying subs: missing graduation year, missing target
    industries, USC vs Wharton vs Michigan, occasional non-list types."""
    schools = ['University of Southern California', 'University of Pennsylvania', 'University of Michigan',
               'New York University', 'Georgetown University', 'Duke University', 'Stanford University',
               None]
    base = {
        'uid': f'snapshot-{i}',
        'email': f'user{i}@test.edu',
        'name': f'User {i}',
        'school': schools[i % len(schools)],
        'major': 'Finance' if i % 2 else 'Computer Science',
        'graduationYear': 2026 if i % 3 else None,
        'targetIndustries': ['investment_banking'] if i % 2 else [],
        'targetCompanies': ['Goldman Sachs', 'JPMorgan'] if i % 4 == 0 else [],
        'targetRoleTypes': ['analyst'] if i % 5 else [],
    }
    # Sprinkle in non-list types / nulls to match the real-world variety
    # so the dispatch adapter must handle them gracefully.
    if i % 7 == 0:
        base['targetIndustries'] = None
    return base


def _contact_snapshot(i: int) -> Dict[str, Any]:
    return {
        'id': f'c-{i}',
        'FirstName': f'First{i}',
        'LastName': f'Last{i}',
        'Company': ['Goldman Sachs', 'McKinsey', 'Apple', 'Meta', None][i % 5] or 'Unknown',
        'Title': 'Analyst' if i % 2 else 'Associate',
        'Email': f'contact{i}@firm.com',
    }


def test_dispatch_handles_twenty_realistic_profiles_without_crashing():
    """Section 7 mock-danger #4: don't mock the input data. Snapshot 20
    real-shaped profiles, run dispatch, ensure none crash. The new
    generator is the stub so every call falls back to legacy; the test
    is for the adapter, not the generator output quality."""
    from app.services import email_generator_dispatch as disp

    legacy_results_template = {0: {'subject': 's', 'body': 'b', 'personalization': {}}}
    flags_doc = {'USE_NEW_GENERATOR': {'enabled': True, 'rollout_pct': 100}}
    _, db = _build_db(flags_doc=flags_doc)
    _flush_flag_cache()

    failures: List[str] = []
    with patch('app.services.feature_flags.get_db', return_value=db), \
         patch.object(disp, '_run_legacy_generator', return_value=legacy_results_template):
        for i in range(20):
            try:
                out = disp.dispatch_email_generation(
                    f'snapshot-{i}',
                    contacts=[_contact_snapshot(i)],
                    resume_text=None,
                    user_profile=_profile_snapshot(i),
                    career_interests=[],
                )
                # Every call should fall back to legacy since the new
                # generator is the stub.
                assert out.generator_version == disp.GENERATOR_VERSION_NEW_UNAVAILABLE
            except Exception as exc:
                failures.append(f'profile {i}: {exc!r}')

    assert not failures, f'dispatch crashed on {len(failures)} profiles: {failures[:3]}'


# ============================================================================
# Section 7 P7: email_drafted event includes generatorVersion.
# ============================================================================


def test_email_drafted_payload_carries_generator_version_through_metric_pipeline():
    """End-to-end: write an email_drafted event with generatorVersion
    in its payload, run the metric pipeline, observe it landed in the
    correct bucket. This is the contract the dashboard depends on."""
    from app.services import edit_rate_metrics as metrics

    payload_with_version = {
        'trackingId': 't-1',
        'contactId': 'c-1',
        'templateUsed': 'alumni_school',
        'subjectChars': 42,
        'bodyChars': 300,
        'generatorVersion': 'new',
    }
    events = {
        'uid-1': [
            _make_event(ev_type='email_drafted', timestamp=_ts(1), payload=payload_with_version),
        ],
    }
    _, db = _build_db(users={'uid-1': {}}, events_per_user=events, flags_doc={})
    _flush_flag_cache()
    with patch('app.services.feature_flags.get_db', return_value=db):
        out = metrics.compute_edit_rate(db, window_days=7)
    assert out['new_generator']['drafts'] == 1
    assert out['sample_size']['new_generator'] == 1
