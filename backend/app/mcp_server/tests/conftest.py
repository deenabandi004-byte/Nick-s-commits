"""
Test fixtures for the MCP server.

A bespoke in-memory Firestore fake is used because the real client
requires Google credentials and the test environment shouldn't touch
prod data. The fake supports the small subset of the API the MCP
server actually uses: collection().document().{get,set,update,delete},
plus the @db.transaction decorator pattern.

Paid APIs (PDL, Perplexity, OpenAI, Anthropic) are mocked at the
function-call boundary so tests never burn real credit.
"""
from __future__ import annotations

import functools
import time
from typing import Any, Optional

import pytest


# ── Fake Firestore ───────────────────────────────────────────────────────────


class _Snap:
    def __init__(self, data: Optional[dict]):
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> Optional[dict]:
        return None if self._data is None else dict(self._data)


class _DocRef:
    def __init__(self, store: dict, coll: str, doc_id: str):
        self._store = store
        self._coll = coll
        self._doc_id = doc_id

    @property
    def id(self) -> str:
        return self._doc_id

    def _bucket(self) -> dict:
        return self._store.setdefault(self._coll, {})

    def get(self, transaction: Any = None) -> _Snap:
        data = self._bucket().get(self._doc_id)
        return _Snap(None if data is None else dict(data))

    def set(self, data: dict, merge: bool = False) -> None:
        if merge:
            cur = self._bucket().get(self._doc_id, {})
            cur.update(data)
            self._bucket()[self._doc_id] = cur
        else:
            self._bucket()[self._doc_id] = dict(data)

    def update(self, data: dict) -> None:
        cur = self._bucket().get(self._doc_id, {})
        cur.update(data)
        self._bucket()[self._doc_id] = cur

    def delete(self) -> None:
        self._bucket().pop(self._doc_id, None)

    def collection(self, name: str) -> "_Collection":
        """Subcollection support. Subcollections are namespaced under a
        synthetic top-level key 'parent/doc_id/subname' so reads/writes
        through subref.{get,set} hit a distinct bucket."""
        sub_name = f"{self._coll}/{self._doc_id}/{name}"
        return _Collection(self._store, sub_name)


class _Collection:
    def __init__(self, store: dict, name: str):
        self._store = store
        self._name = name

    def document(self, doc_id: str) -> _DocRef:
        return _DocRef(self._store, self._name, doc_id)

    def stream(self):
        for doc_id, data in list(self._store.get(self._name, {}).items()):
            yield _StreamDoc(self._store, self._name, doc_id, data)

    def add(self, data: dict) -> _DocRef:
        """Auto-generated doc id, then set the data. Returns just the
        DocumentReference (the real Firestore client returns a tuple of
        (timestamp, ref); the persist.py code handles both shapes)."""
        import uuid as _uuid
        doc_id = _uuid.uuid4().hex
        ref = _DocRef(self._store, self._name, doc_id)
        ref.set(data)
        return ref

    def where(self, field: str, op: str, value: Any) -> "_FilteredCollection":
        """Tiny .where() implementation supporting only the operators the
        persist layer uses (`==` for clear_mcp_unseen_for_user). Returns a
        filtered view that supports stream()."""
        return _FilteredCollection(self._store, self._name, [(field, op, value)])


class _FilteredCollection:
    """In-memory filtered view of a collection, supporting `where().stream()`
    and chained `.where().where().stream()`. Only the `==` operator is
    implemented — that's all the MCP persist layer uses."""

    def __init__(self, store: dict, name: str, filters: list):
        self._store = store
        self._name = name
        self._filters = filters

    def where(self, field: str, op: str, value: Any) -> "_FilteredCollection":
        return _FilteredCollection(self._store, self._name, [*self._filters, (field, op, value)])

    def stream(self):
        for doc_id, data in list(self._store.get(self._name, {}).items()):
            match = True
            for field, op, value in self._filters:
                if op == "==":
                    if data.get(field) != value:
                        match = False
                        break
                else:
                    raise NotImplementedError(f"FakeFirestore .where() op {op!r}")
            if match:
                yield _StreamDoc(self._store, self._name, doc_id, data)


class _StreamDoc:
    def __init__(self, store: dict, coll: str, doc_id: str, data: dict):
        self.id = doc_id
        self._data = data
        self.reference = _DocRef(store, coll, doc_id)

    def to_dict(self) -> dict:
        return dict(self._data)


class _FakeTxn:
    """Carries no state; the fake DB executes txns synchronously so all
    reads see committed state immediately."""

    def __init__(self, db: "FakeFirestore"):
        self._db = db

    def update(self, ref: _DocRef, data: dict) -> None:
        ref.update(data)

    def set(self, ref: _DocRef, data: dict) -> None:
        ref.set(data)

    def delete(self, ref: _DocRef) -> None:
        ref.delete()


class FakeFirestore:
    """Tiny in-memory Firestore client compatible with the small API
    surface the MCP modules use: collection().document().{get,set,update,
    delete} and transaction() returning a fake txn handle. Atomicity is
    guaranteed in tests because Python is single-threaded."""

    def __init__(self):
        self._store: dict[str, dict[str, dict]] = {}
        self._txn_singleton = _FakeTxn(self)

    def collection(self, name: str) -> _Collection:
        return _Collection(self._store, name)

    def transaction(self) -> _FakeTxn:
        return self._txn_singleton

    @property
    def store(self) -> dict[str, dict[str, dict]]:
        return self._store


# ── Fixtures ─────────────────────────────────────────────────────────────────


def _fake_transactional(fn):
    """Stand-in for firebase_admin.firestore.transactional. The real
    decorator wraps a fn so callers can do `wrapped(transaction)` and
    get retry-on-conflict behavior. The fake just calls fn(transaction).
    """
    @functools.wraps(fn)
    def wrapper(transaction):
        return fn(transaction)
    return wrapper


@pytest.fixture
def fake_db(monkeypatch):
    # Replace firestore.transactional with a passthrough so the
    # @firestore.transactional decorator used by rate_limit.py and
    # budget.py works against our fake txn handle.
    from firebase_admin import firestore as fb_firestore
    monkeypatch.setattr(fb_firestore, "transactional", _fake_transactional)
    return FakeFirestore()


@pytest.fixture
def mcp_app(fake_db, monkeypatch):
    """Flask app with the MCP blueprint mounted and Firestore replaced
    with the in-memory fake.

    Also stubs verify_access_token so tests can use a placeholder Bearer
    token without minting a real RS256 JWT. Returns:
      - valid claims for any token EXCEPT "invalid" and "expired"
      - None (→ 401) for tokens named "invalid" or "expired"
    Tests that need richer claims (specific uid, tier, scope) can override
    the patch in their own monkeypatch.setattr call.
    """
    from flask import Flask
    from app.mcp_server import flask_mount
    import app.mcp_server.cache as cache_mod
    import app.mcp_server.rate_limit as rl_mod
    import app.mcp_server.budget as budget_mod
    import app.mcp_server.events as events_mod

    # Patch get_db everywhere it's imported so the modules use the fake.
    monkeypatch.setattr(flask_mount, "get_db", lambda: fake_db)

    def fake_verify(token: str):
        if token in ("invalid", "expired"):
            return None
        return {"sub": None, "tier": "free", "scope": "mcp:read mcp:write"}

    monkeypatch.setattr(flask_mount, "verify_access_token", fake_verify)

    app = Flask(__name__)
    flask_mount.register_mcp_blueprint(app)
    return app


@pytest.fixture
def client(mcp_app):
    """Authed test client. Default Authorization header verifies as a
    sub=None ("anonymous-but-bearer") user — the post-401-cutover replacement
    for the old anonymous tier. Tests that need to assert the no-auth 401
    behavior use the `unauthed_client` fixture instead."""
    test_client = mcp_app.test_client()
    test_client.environ_base["HTTP_AUTHORIZATION"] = "Bearer test"
    return test_client


@pytest.fixture
def unauthed_client(mcp_app):
    """Test client with NO Authorization header. Used to verify that
    /mcp 401s correctly with WWW-Authenticate per RFC 9728."""
    return mcp_app.test_client()


# ── Mocks for paid APIs ──────────────────────────────────────────────────────


class APICallCounter:
    def __init__(self):
        self.pdl = 0
        self.perplexity_profile = 0
        self.perplexity_news = 0
        self.perplexity_market = 0
        self.school_affinity = 0
        self.llm = 0
        self.prompt_parser = 0


@pytest.fixture
def call_counter():
    return APICallCounter()


@pytest.fixture(autouse=True)
def mock_prompt_parser(monkeypatch, call_counter):
    """The MCP find_contacts handler now routes through the LLM-backed
    parse_search_prompt_structured to expand title_variations (so the MCP
    matches the website's search behavior). Without a mock, every test
    that exercises find_contacts would hit OpenAI.

    This default mock returns a richer parsed_prompt than the manual
    fallback used to build, so tests verify the new code path. Tests that
    need to exercise the manual-fallback path (LLM down, low confidence)
    can override this fixture in their own monkeypatch.setattr call.
    """
    def fake_parse(prompt: str) -> dict:
        call_counter.prompt_parser += 1
        # Cheap heuristic — pull a company-ish noun out of the prompt and
        # generate the same shape parse_search_prompt_structured returns.
        # The real LLM produces richer titles; for tests we just need the
        # field to be present and non-empty.
        return {
            "original_prompt": prompt,
            "company_context": "",
            "companies": [{"name": "", "matched_titles": ["Software Engineer", "Engineer"]}],
            "locations": [],
            "schools": [],
            "industries": [],
            "confidence": "high",
            "title_variations": ["Software Engineer", "Software Engineer II", "Engineer", "SWE"],
        }

    import app.services.prompt_parser as parser_mod
    monkeypatch.setattr(parser_mod, "parse_search_prompt_structured", fake_parse)
    return fake_parse


@pytest.fixture
def mock_pdl(monkeypatch, call_counter):
    """Mock pdl_client.search_contacts_from_prompt with a fixed fixture set."""
    def fake_search(parsed_prompt, max_contacts, exclude_keys=None, user_profile=None):
        call_counter.pdl += 1
        contacts = [
            {
                "FirstName": "Maya",
                "LastName": "Patel",
                "Title": "Investment Banking Analyst",
                "Company": "Goldman Sachs",
                "LinkedIn": "https://linkedin.com/in/mayapatel",
                "College": "University of Southern California",
                "Email": "",
            },
            {
                "FirstName": "Jordan",
                "LastName": "Kim",
                "Title": "Associate",
                "Company": "Goldman Sachs",
                "LinkedIn": "https://linkedin.com/in/jordankim",
                "College": "USC Marshall",
                "Email": "",
            },
            {
                "FirstName": "Avery",
                "LastName": "Chen",
                "Title": "VP, M&A",
                "Company": "Goldman Sachs",
                "LinkedIn": "https://linkedin.com/in/averychen",
                "College": "UCLA Anderson",
                "Email": "",
            },
            {
                "FirstName": "Sam",
                "LastName": "Lopez",
                "Title": "Analyst",
                "Company": "Goldman Sachs",
                "LinkedIn": "",
                "College": "NYU Stern",
                "Email": "",
            },
            {
                "FirstName": "Priya",
                "LastName": "Singh",
                "Title": "Associate",
                "Company": "Goldman Sachs",
                "LinkedIn": "https://linkedin.com/in/priyasingh",
                "College": "Wharton",
                "Email": "",
            },
        ][:max_contacts]
        return contacts, 0, [], {"provider": "pdl"}

    import app.services.pdl_client as pdl_mod
    monkeypatch.setattr(pdl_mod, "search_contacts_from_prompt", fake_search)

    # Also patch the import-from-call-site inside find_contacts tool
    # (the tool does `from app.services.pdl_client import ...` at call
    # time, so the module-level patch above is sufficient).
    return fake_search


@pytest.fixture
def mock_warmth(monkeypatch):
    """Mock warmth_scoring.score_contacts_for_email with deterministic tiers."""
    def fake_score(user_profile, contacts, search_context=None):
        out = {}
        for i, c in enumerate(contacts):
            college = (c.get("College") or "").lower()
            target_school = (
                (user_profile or {}).get("academics", {}).get("university", "") or ""
            ).lower()
            is_alum = (
                target_school
                and (target_school in college or college in target_school)
            )
            out[i] = {
                "tier": "warm" if is_alum else "neutral",
                "score": 65 if is_alum else 30,
                "label": (
                    f"Fellow {user_profile['academics']['university']} alum"
                    if is_alum else f"{c.get('Title','')} at {c.get('Company','')}"
                ),
                "signals": (
                    [{"signal": "same_university", "detail": user_profile["academics"]["university"]}]
                    if is_alum else []
                ),
            }
        return out

    import app.utils.warmth_scoring as warmth_mod
    monkeypatch.setattr(warmth_mod, "score_contacts_for_email", fake_score)
    return fake_score


@pytest.fixture
def mock_perplexity(monkeypatch, call_counter):
    """Mock the three perplexity_client functions used by get_company_intel."""
    import app.services.perplexity_client as ppx

    def fake_profile(name, website=None):
        call_counter.perplexity_profile += 1
        return {
            "description": f"{name} is a global investment firm.",
            "hiring_signal": "Actively hiring entry-level analysts.",
            "recent_news": [f"{name} announced expansion."],
            "culture_keywords": ["fast-paced", "collaborative"],
            "headquarters": "New York, NY",
            "industries": ["Financial Services"],
        }

    def fake_news(company, timeframe="week"):
        call_counter.perplexity_news += 1
        return [
            f"{company} reported strong Q3 earnings.",
            f"{company} hired a new head of M&A.",
        ]

    def fake_market(target_companies, target_industries):
        call_counter.perplexity_market += 1
        return {
            "hiring_intel": f"{(target_companies or ['firms'])[0]} is hiring.",
            "cycle_intel": "On-cycle recruiting opens August.",
        }

    monkeypatch.setattr(ppx, "enrich_company_profile_live", fake_profile)
    monkeypatch.setattr(ppx, "get_company_news_brief", fake_news)
    monkeypatch.setattr(ppx, "get_market_context", fake_market)
    return ppx


@pytest.fixture
def mock_school_affinity(monkeypatch, call_counter):
    """Mock school_affinity.get_school_affinity."""
    import app.services.school_affinity as sa

    def fake_affinity(university, field):
        call_counter.school_affinity += 1
        return [
            {"company_name": "Goldman Sachs", "alumni_count": 47},
            {"company_name": "Jane Street", "alumni_count": 12},
            {"company_name": "Morgan Stanley", "alumni_count": 31},
        ]

    monkeypatch.setattr(sa, "get_school_affinity", fake_affinity)
    return fake_affinity


@pytest.fixture
def mock_llm(monkeypatch, call_counter):
    """Mock reply_generation.batch_generate_emails so we don't hit OpenAI."""
    import app.services.reply_generation as rg

    def fake_batch(contacts, resume_text, user_profile, career_interests, **kwargs):
        call_counter.llm += 1
        out = {}
        for i, c in enumerate(contacts):
            name = f"{c.get('FirstName','')} {c.get('LastName','')}".strip()
            school = (user_profile or {}).get("academics", {}).get("university", "your school")
            out[i] = {
                "subject": f"Quick question about your path at {c.get('Company','')}",
                "body": (
                    f"Hi {name},\n\n"
                    f"I'm a student at {school} exploring "
                    f"{career_interests or 'this space'}. Would love to learn "
                    f"about your work at {c.get('Company','')}.\n\n"
                    f"Open to a quick chat?\n\n"
                    f"Thanks,\nSid"
                ),
                "html": "",
            }
        return out

    monkeypatch.setattr(rg, "batch_generate_emails", fake_batch)
    return fake_batch
