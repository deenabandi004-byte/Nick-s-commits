"""Tests for the one-time job-description pre-fill script's decision logic.

Uses a minimal fake Firestore so we exercise run() end-to-end without network.
"""
import pytest

from backend.scripts import backfill_job_descriptions as bf


class _FakeSnap:
    def __init__(self, jid, data):
        self.id = jid
        self._data = data

    def to_dict(self):
        return dict(self._data)


class _FakeQuery:
    def __init__(self, docs):
        self._docs = docs
        self._paged = False

    def order_by(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def start_after(self, *_a, **_k):
        self._paged = True  # second page is empty → pagination terminates
        return self

    def stream(self):
        return [] if self._paged else list(self._docs)


class _FakeBatch:
    def __init__(self, store):
        self._store = store
        self._ops = []

    def update(self, ref, payload):
        self._ops.append((ref["id"], payload))

    def commit(self):
        for jid, payload in self._ops:
            self._store[jid] = payload
        self._ops = []


class _FakeCollection:
    def __init__(self, docs, query):
        self._docs = docs
        self._query = query

    def order_by(self, *a, **k):
        return self._query.order_by(*a, **k)

    def document(self, jid):
        return {"id": jid}


class _FakeDb:
    def __init__(self, docs):
        self._docs = docs
        self._query = _FakeQuery(docs)
        self.writes = {}

    def collection(self, _name):
        return _FakeCollection(self._docs, self._query)

    def batch(self):
        return _FakeBatch(self.writes)


@pytest.fixture(autouse=True)
def _no_firebase(monkeypatch):
    # run() calls _ensure_firebase_admin(); stub it so tests need no credentials.
    monkeypatch.setattr(bf, "_ensure_firebase_admin", lambda: None)


def _patch_db(monkeypatch, docs):
    db = _FakeDb(docs)
    monkeypatch.setattr(bf, "get_db", lambda: db)
    return db


def test_never_overwrites_existing_description(monkeypatch):
    db = _patch_db(monkeypatch, [_FakeSnap("a", {"description_raw": "already here"})])
    res = bf.run(commit=True, limit=None, since_days=None, max_scrapes=10, allow_scrape=True)
    assert res["empty_description"] == 0
    assert db.writes == {}


def test_fills_from_structured_without_scraping(monkeypatch):
    # extract_job_posting must never be called when structured data exists.
    monkeypatch.setattr(
        "backend.app.services.firecrawl_client.extract_job_posting",
        lambda url: (_ for _ in ()).throw(AssertionError("should not scrape")),
    )
    db = _patch_db(monkeypatch, [
        _FakeSnap("a", {"structured": {"responsibilities": ["Build things"]}}),
    ])
    res = bf.run(commit=True, limit=None, since_days=None, max_scrapes=10, allow_scrape=True)
    assert res["filled_from_structured"] == 1
    assert res["scrapes_used"] == 0
    assert "• Build things" in db.writes["a"]["description_raw"]


def test_no_scrape_leaves_bare_jobs_untouched(monkeypatch):
    db = _patch_db(monkeypatch, [_FakeSnap("a", {"apply_url": "https://x.com/j"})])
    res = bf.run(commit=True, limit=None, since_days=None, max_scrapes=10, allow_scrape=False)
    assert res["filled_from_scrape"] == 0
    assert db.writes == {}


def test_scrape_budget_is_capped(monkeypatch):
    calls = {"n": 0}

    def _fake_extract(url, wait_for_ms=0):
        calls["n"] += 1
        return {"description": "Scraped prose"}

    monkeypatch.setattr(
        "backend.app.services.firecrawl_client.extract_job_posting", _fake_extract
    )
    docs = [_FakeSnap(f"j{i}", {"apply_url": f"https://x.com/{i}"}) for i in range(5)]
    db = _patch_db(monkeypatch, docs)
    res = bf.run(commit=True, limit=None, since_days=None, max_scrapes=2, allow_scrape=True)
    assert res["scrapes_used"] == 2
    assert calls["n"] == 2
    assert len(db.writes) == 2


def test_dry_run_writes_nothing(monkeypatch):
    db = _patch_db(monkeypatch, [
        _FakeSnap("a", {"structured": {"requirements": ["Python"]}}),
    ])
    res = bf.run(commit=False, limit=None, since_days=None, max_scrapes=10, allow_scrape=True)
    assert res["filled_from_structured"] == 1
    assert res["written"] == 0
    assert db.writes == {}
