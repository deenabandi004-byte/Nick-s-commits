"""
Regression test for the FirestoreStorage.incr transaction pattern.

Before this fix, FirestoreStorage used `@self.db.transaction` (no
parens) as a decorator. Against the real Firestore Client, that pattern
raises immediately ("Client.transaction() takes 1 positional argument
but 2 were given"), and the blanket `except Exception: return 0`
in incr() silently swallowed every such failure, returning 0 and
allowing every request to bypass rate limiting.

This test pins the corrected pattern: `@firestore.transactional`
plus `db.transaction()` to hand the txn into the wrapped function. If
someone ever reverts to the no-parens form, this test fails.
"""
from __future__ import annotations

import functools
import types

import pytest

from app.utils.firestore_limiter import FirestoreStorage, _doc_key, COLLECTION


# ── Fake Firestore (small, atomicity is moot in single-threaded tests) ──────


class _Snap:
    def __init__(self, data):
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return None if self._data is None else dict(self._data)


class _DocRef:
    def __init__(self, store, coll, doc_id):
        self._store, self._coll, self._doc_id = store, coll, doc_id

    def _bucket(self):
        return self._store.setdefault(self._coll, {})

    def get(self, transaction=None):
        return _Snap(self._bucket().get(self._doc_id))

    def set(self, data):
        self._bucket()[self._doc_id] = dict(data)

    def update(self, data):
        cur = self._bucket().get(self._doc_id, {})
        cur.update(data)
        self._bucket()[self._doc_id] = cur


class _Collection:
    def __init__(self, store, name):
        self._store, self._name = store, name

    def document(self, doc_id):
        return _DocRef(self._store, self._name, doc_id)


class _Txn:
    """The fake txn just forwards mutations directly to the doc refs."""
    def update(self, ref, data):
        ref.update(data)

    def set(self, ref, data):
        ref.set(data)


class _FakeDB:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return _Collection(self.store, name)

    def transaction(self):
        return _Txn()


def _fake_transactional(fn):
    """Stand-in for firestore.transactional. The real decorator wraps
    fn so callers can do `wrapped(transaction)` with retry behavior;
    here we just pass it through synchronously.
    """
    @functools.wraps(fn)
    def wrapper(transaction):
        return fn(transaction)
    return wrapper


@pytest.fixture
def fake_db(monkeypatch):
    from firebase_admin import firestore as fb_firestore
    monkeypatch.setattr(fb_firestore, "transactional", _fake_transactional)
    return _FakeDB()


@pytest.fixture
def storage(monkeypatch, fake_db):
    s = FirestoreStorage()
    # Inject the fake DB directly into the property's cache.
    s._db = fake_db
    return s


# ── Tests ────────────────────────────────────────────────────────────────────


def test_first_incr_returns_one_and_writes_doc(storage, fake_db):
    n = storage.incr("user:abc", expiry=60, amount=1)
    assert n == 1, "First incr must return 1, not 0 (the silent-failure value)"
    bucket = fake_db.store.get(COLLECTION) or {}
    assert _doc_key("user:abc") in bucket
    assert bucket[_doc_key("user:abc")]["count"] == 1


def test_repeated_incr_accumulates(storage):
    a = storage.incr("user:abc", expiry=60)
    b = storage.incr("user:abc", expiry=60)
    c = storage.incr("user:abc", expiry=60)
    assert (a, b, c) == (1, 2, 3)


def test_separate_keys_have_separate_counters(storage):
    a1 = storage.incr("user:alice", expiry=60)
    b1 = storage.incr("user:bob", expiry=60)
    a2 = storage.incr("user:alice", expiry=60)
    assert (a1, b1, a2) == (1, 1, 2)


def test_get_reflects_incr(storage):
    storage.incr("user:abc", expiry=60)
    storage.incr("user:abc", expiry=60)
    assert storage.get("user:abc") == 2


def test_incr_does_not_use_db_transaction_as_decorator(monkeypatch, fake_db):
    """Regression pin: the old @self.db.transaction form would have called
    db.transaction(fn) immediately at decoration time. If anyone reverts
    to that form, this test catches it.
    """
    calls_with_args = []
    original_transaction = fake_db.transaction

    def tracking_transaction(*args, **kwargs):
        calls_with_args.append((args, kwargs))
        return original_transaction()

    fake_db.transaction = tracking_transaction

    s = FirestoreStorage()
    s._db = fake_db
    s.incr("user:abc", expiry=60)

    # db.transaction() should only ever be called with NO arguments.
    # The buggy decorator form invokes it as db.transaction(_txn).
    for args, kwargs in calls_with_args:
        assert args == () and kwargs == {}, (
            f"db.transaction was called with args={args} kwargs={kwargs}; "
            "this is the buggy @self.db.transaction (no-parens) form. "
            "Use @firestore.transactional instead."
        )
