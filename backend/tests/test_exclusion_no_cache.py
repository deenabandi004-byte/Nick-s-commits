"""Regression tests for the Find exclusion list.

The exclusion list used to be cached in-memory with a 1-hour TTL, which went
stale on delete: a contact removed from My Network stayed filtered out of
search for up to an hour. The cache was removed — the list is now rebuilt from
Firestore on every search. These tests pin that behavior.
"""
import importlib

import pytest

from app.routes import runs


class _FakeDoc:
    def __init__(self, data):
        self._data = data

    def to_dict(self):
        return dict(self._data)


class _FakeContactsCollection:
    """Streams whatever rows the backing store currently holds."""

    def __init__(self, store):
        self._store = store

    def select(self, _fields):
        return self

    def stream(self):
        return [_FakeDoc(d) for d in self._store["rows"]]


class _FakeUserDoc:
    def __init__(self, store):
        self._store = store

    def collection(self, name):
        assert name == "contacts"
        return _FakeContactsCollection(self._store)


class _FakeUsersCollection:
    def __init__(self, store):
        self._store = store

    def document(self, _uid):
        return _FakeUserDoc(self._store)


class _FakeDb:
    def __init__(self, store):
        self._store = store

    def collection(self, name):
        assert name == "users"
        return _FakeUsersCollection(self._store)


def _contact(first, last, company, email, linkedin=""):
    return {
        "firstName": first,
        "lastName": last,
        "company": company,
        "email": email,
        "linkedinUrl": linkedin,
    }


def test_exclusion_reflects_delete_on_next_call():
    """Deleting a contact must drop it from the exclusion set immediately."""
    store = {"rows": [
        _contact("Ada", "Lovelace", "Analytical Engines", "ada@ae.com"),
        _contact("Alan", "Turing", "Bletchley", "alan@bp.com"),
    ]}
    db = _FakeDb(store)

    first = runs._build_exclusion_data_from_firestore(db, "uid123")
    assert "ada@ae.com" in first["email_set"]
    assert "alan@bp.com" in first["email_set"]

    # Simulate the user deleting Ada from My Network.
    store["rows"] = [_contact("Alan", "Turing", "Bletchley", "alan@bp.com")]

    second = runs._build_exclusion_data_from_firestore(db, "uid123")
    assert "ada@ae.com" not in second["email_set"], "deleted contact still excluded — cache is stale"
    assert "ada_lovelace_analytical engines" not in second["name_company_set"]
    assert "alan@bp.com" in second["email_set"]


def test_exclusion_reflects_add_on_next_call():
    """A newly saved contact must appear in the exclusion set on the next search."""
    store = {"rows": [_contact("Alan", "Turing", "Bletchley", "alan@bp.com")]}
    db = _FakeDb(store)

    assert "grace@usn.mil" not in runs._build_exclusion_data_from_firestore(db, "u")["email_set"]

    store["rows"].append(_contact("Grace", "Hopper", "US Navy", "grace@usn.mil"))
    assert "grace@usn.mil" in runs._build_exclusion_data_from_firestore(db, "u")["email_set"]


def test_cache_machinery_is_gone():
    """The stale-prone cache and its helpers must not exist anymore."""
    importlib.reload(runs)
    for name in (
        "_exclusion_list_cache",
        "_get_cached_exclusion_list",
        "_set_cached_exclusion_list",
        "_invalidate_exclusion_cache",
        "EXCLUSION_CACHE_TTL",
        "_exclusion_cache_lock",
    ):
        assert not hasattr(runs, name), f"{name} should have been removed with the cache"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
