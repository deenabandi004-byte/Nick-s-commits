"""Phase 5 Stage 2: Scout workflow-state read tools unit tests.

Each of the six read functions is exercised against a small in-process fake
Firestore (the same shape as test_scout_strategy uses) in four configurations:
empty state, populated state with limit truncation, field-shape contract, and
tier independence. Plus one integration check that the system prompt advertises
the tools by name.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.scout.workflow_state import (
    get_meeting_prep_drafts,
    get_outbox_status,
    get_recent_cover_letters,
    get_recent_firm_searches,
    get_recent_searches,
)


# ============================================================================
# Fake Firestore (mirrors test_scout_strategy.py so the two stay in sync)
# ============================================================================

class _FakeSnap:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _FakeDoc:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    @property
    def id(self):
        return self._path[-1]

    def collection(self, name):
        return _FakeColl(self._store, self._path + (name,))

    def get(self):
        return _FakeSnap(self.id, self._store.get(self._path))

    def set(self, data):
        self._store[self._path] = dict(data)

    def delete(self):
        self._store.pop(self._path, None)


class _FakeColl:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    def document(self, doc_id):
        return _FakeDoc(self._store, self._path + (doc_id,))

    def stream(self):
        out = []
        for key, data in list(self._store.items()):
            if len(key) == len(self._path) + 1 and key[:len(self._path)] == self._path:
                out.append(_FakeSnap(key[-1], data))
        return out


class FakeDb:
    def __init__(self):
        self._store = {}

    def collection(self, name):
        return _FakeColl(self._store, (name,))


@pytest.fixture
def db():
    return FakeDb()


# ============================================================================
# Tiny seeding helpers (the production writers do all the heavy lifting; here
# we only need the field shapes those writers persist)
# ============================================================================

def _now():
    return datetime(2026, 5, 22, 12, 0, tzinfo=timezone.utc)


def _put(db, uid: str, coll: str, doc_id: str, data: dict) -> None:
    db.collection("users").document(uid).collection(coll).document(doc_id).set(data)


def _seed_contact(db, uid, cid, *, stage, days_ago_sent=None, name="Jane Doe",
                  company="Acme", title="Engineer", in_outbox=True, last_activity=None):
    sent_at = _now() - timedelta(days=days_ago_sent) if days_ago_sent is not None else None
    _put(db, uid, "contacts", cid, {
        "inOutbox": in_outbox,
        "pipelineStage": stage,
        "firstName": name.split()[0],
        "lastName": name.split()[-1],
        "company": company,
        "jobTitle": title,
        "emailSentAt": sent_at,
        "lastActivityAt": last_activity or sent_at or _now(),
    })


# ============================================================================
# 1. Outbox
# ============================================================================

def test_outbox_empty_when_no_contacts(db):
    out = get_outbox_status("u", db=db)
    assert out == {"total_contacts": 0, "awaiting_reply": 0, "replied": 0, "recent": []}


def test_outbox_filters_to_in_outbox(db):
    _seed_contact(db, "u", "a", stage="email_sent", days_ago_sent=2, in_outbox=True)
    _seed_contact(db, "u", "b", stage="email_sent", days_ago_sent=2, in_outbox=False)
    out = get_outbox_status("u", db=db)
    assert out["total_contacts"] == 1


def test_outbox_counts_awaiting_and_replied(db):
    _seed_contact(db, "u", "a", stage="email_sent", days_ago_sent=2)
    _seed_contact(db, "u", "b", stage="waiting_on_reply", days_ago_sent=4)
    _seed_contact(db, "u", "c", stage="replied", days_ago_sent=5)
    _seed_contact(db, "u", "d", stage="meeting_scheduled", days_ago_sent=10)
    _seed_contact(db, "u", "e", stage="bounced", days_ago_sent=8)
    out = get_outbox_status("u", db=db)
    assert out["total_contacts"] == 5
    assert out["awaiting_reply"] == 2
    assert out["replied"] == 2  # replied + meeting_scheduled


def test_outbox_status_synthesis(db):
    # Seed timestamps relative to the real wall clock so the days_since math
    # matches the production code path (which uses datetime.now()).
    real_now = datetime.now(timezone.utc)

    def _seed_at(cid, *, stage, days_ago, name):
        sent = real_now - timedelta(days=days_ago) if days_ago is not None else None
        _put(db, "u", "contacts", cid, {
            "inOutbox": True, "pipelineStage": stage,
            "firstName": name.split()[0], "lastName": name.split()[-1],
            "company": "Acme", "jobTitle": "Engineer",
            "emailSentAt": sent, "lastActivityAt": sent or real_now,
        })

    _seed_at("fresh", stage="email_sent", days_ago=2, name="Fresh One")
    _seed_at("stale", stage="waiting_on_reply", days_ago=9, name="Stale One")
    _seed_at("rep", stage="replied", days_ago=1, name="Rep One")
    _seed_at("drf", stage="draft_created", days_ago=None, name="Draft One")

    out = get_outbox_status("u", db=db)
    by_id = {r["id"]: r for r in out["recent"]}
    assert by_id["fresh"]["status"] == "sent"
    # A 9-day stale contact must surface as the no_reply_Nd label; exact N
    # depends on wall-clock seconds since seeding, so match the prefix.
    assert by_id["stale"]["status"].startswith("no_reply_")
    assert by_id["stale"]["days_since_last_send"] >= 7
    assert by_id["rep"]["status"] == "replied"
    assert by_id["drf"]["status"] == "drafting"


def test_outbox_truncates_to_limit_and_orders_by_recency(db):
    # Twelve sent contacts, days_ago_sent 1..12 (oldest = 12).
    for i in range(1, 13):
        _seed_contact(db, "u", f"c{i:02d}", stage="email_sent", days_ago_sent=i)
    out = get_outbox_status("u", db=db, limit=5)
    assert len(out["recent"]) == 5
    # Most recent (smallest days_ago) first.
    days = [r["days_since_last_send"] for r in out["recent"]]
    assert days == sorted(days)
    assert out["total_contacts"] == 12  # totals cover all, not just the truncated tail


def test_outbox_field_shape(db):
    _seed_contact(db, "u", "x", stage="email_sent", days_ago_sent=3,
                  name="Sam Hill", company="Bain", title="Consultant")
    out = get_outbox_status("u", db=db)
    row = out["recent"][0]
    assert set(row.keys()) == {
        "id", "contact_name", "contact_company", "contact_role",
        "last_sent_at", "status", "days_since_last_send",
    }
    assert row["contact_name"] == "Sam Hill"
    assert row["contact_company"] == "Bain"
    assert row["contact_role"] == "Consultant"
    assert row["status"] == "sent"
    assert isinstance(row["last_sent_at"], str)
    assert row["days_since_last_send"] >= 3


# ============================================================================
# 2. Recent contact searches
# ============================================================================

def test_recent_searches_empty(db):
    assert get_recent_searches("u", db=db) == {"count": 0, "recent": []}


def test_recent_searches_field_shape_and_order(db):
    _put(db, "u", "searchHistory", "s1", {
        "prompt": "PMs at Stripe", "resultCount": 12, "createdAt": _now(),
    })
    _put(db, "u", "searchHistory", "s2", {
        "prompt": "consultants at BCG", "resultCount": 8,
        "createdAt": _now() - timedelta(days=2),
    })
    out = get_recent_searches("u", db=db)
    assert out["count"] == 2
    assert out["recent"][0]["query"] == "PMs at Stripe"  # newest first
    assert out["recent"][0]["result_count"] == 12
    assert set(out["recent"][0].keys()) == {"id", "query", "result_count", "searched_at"}


def test_recent_searches_truncates_to_limit(db):
    for i in range(10):
        _put(db, "u", "searchHistory", f"s{i}", {
            "prompt": f"query {i}", "resultCount": i,
            "createdAt": _now() - timedelta(days=i),
        })
    out = get_recent_searches("u", db=db, limit=3)
    assert len(out["recent"]) == 3
    assert out["count"] == 10


# ============================================================================
# 3. Recent cover letters
# ============================================================================

def test_cover_letters_empty(db):
    assert get_recent_cover_letters("u", db=db) == {"count": 0, "recent": []}


def test_cover_letters_field_shape_and_no_body(db):
    body = "Dear hiring team, " + "x" * 1500
    _put(db, "u", "cover_letter_library", "c1", {
        "company": "BCG", "job_title": "Associate Consultant",
        "cover_letter_text": body, "created_at": _now().isoformat(),
    })
    out = get_recent_cover_letters("u", db=db)
    row = out["recent"][0]
    assert set(row.keys()) == {"id", "company", "role", "created_at", "length_chars"}
    assert row["company"] == "BCG"
    assert row["role"] == "Associate Consultant"
    assert row["length_chars"] == len(body)
    # The body must NOT be in the response.
    assert "cover_letter_text" not in row
    assert "body" not in row


def test_cover_letters_ordered_by_created_at_desc(db):
    _put(db, "u", "cover_letter_library", "old", {
        "company": "Old Co", "job_title": "x", "cover_letter_text": "",
        "created_at": (_now() - timedelta(days=10)).isoformat(),
    })
    _put(db, "u", "cover_letter_library", "new", {
        "company": "New Co", "job_title": "x", "cover_letter_text": "",
        "created_at": _now().isoformat(),
    })
    out = get_recent_cover_letters("u", db=db)
    assert [r["company"] for r in out["recent"]] == ["New Co", "Old Co"]


# ============================================================================
# 4. Meeting prep drafts
# ============================================================================

def test_meeting_prep_empty(db):
    assert get_meeting_prep_drafts("u", db=db) == {"count": 0, "recent": []}


def test_meeting_prep_uses_background_filled_name(db):
    _put(db, "u", "coffee-chat-preps", "p1", {
        "contactName": "Riya Dhir", "contactCompany": "JPMorgan",
        "createdAt": _now().isoformat(),
    })
    out = get_meeting_prep_drafts("u", db=db)
    row = out["recent"][0]
    assert row["contact_name"] == "Riya Dhir"
    assert set(row.keys()) == {
        "id", "contact_name", "meeting_type", "scheduled_for", "created_at",
    }
    assert row["meeting_type"] == "coffee_chat"  # default when feature only ships one type


def test_meeting_prep_falls_back_to_linkedin_when_no_name(db):
    _put(db, "u", "coffee-chat-preps", "p1", {
        "linkedinUrl": "https://linkedin.com/in/janedoe",
        "createdAt": _now().isoformat(),
    })
    row = get_meeting_prep_drafts("u", db=db)["recent"][0]
    assert "linkedin.com/in/janedoe" in row["contact_name"]


def test_meeting_prep_truncates_and_orders(db):
    for i in range(7):
        _put(db, "u", "coffee-chat-preps", f"p{i}", {
            "contactName": f"Person {i}",
            "createdAt": (_now() - timedelta(hours=i)).isoformat(),
        })
    out = get_meeting_prep_drafts("u", db=db, limit=3)
    assert len(out["recent"]) == 3
    assert [r["contact_name"] for r in out["recent"]] == ["Person 0", "Person 1", "Person 2"]


# ============================================================================
# 5. Recent firm searches
# ============================================================================

def test_firm_searches_empty(db):
    assert get_recent_firm_searches("u", db=db) == {"count": 0, "recent": []}


def test_firm_searches_resolves_count_from_results_when_missing(db):
    _put(db, "u", "firmSearches", "f1", {
        "query": "boutique IBs in nyc",
        "results": [{"name": "a"}, {"name": "b"}, {"name": "c"}],
        "createdAt": _now(),
    })
    row = get_recent_firm_searches("u", db=db)["recent"][0]
    assert row["query"] == "boutique IBs in nyc"
    assert row["result_count"] == 3


def test_firm_searches_uses_resultsCount_when_present(db):
    _put(db, "u", "firmSearches", "f1", {
        "query": "MBB", "resultsCount": 11,
        "createdAt": _now(),
    })
    assert get_recent_firm_searches("u", db=db)["recent"][0]["result_count"] == 11


# ============================================================================
# Tier independence: same data, three tiers, same output
# ============================================================================

@pytest.mark.parametrize("tier", ["free", "pro", "elite"])
def test_outbox_is_tier_independent(db, tier):
    # Tier is not an input to any workflow read tool. Seeding identical data
    # under each tier-named user must produce identical results.
    uid = f"u_{tier}"
    _seed_contact(db, uid, "a", stage="email_sent", days_ago_sent=3)
    _seed_contact(db, uid, "b", stage="replied", days_ago_sent=2)
    out = get_outbox_status(uid, db=db)
    assert out["total_contacts"] == 2
    assert out["replied"] == 1


# ============================================================================
# No-db / no-uid degradation
# ============================================================================

@pytest.mark.parametrize("fn,empty", [
    (get_outbox_status, {"total_contacts": 0, "awaiting_reply": 0, "replied": 0, "recent": []}),
    (get_recent_searches, {"count": 0, "recent": []}),
    (get_recent_cover_letters, {"count": 0, "recent": []}),
    (get_meeting_prep_drafts, {"count": 0, "recent": []}),
    (get_recent_firm_searches, {"count": 0, "recent": []}),
])
def test_degrades_with_no_uid(fn, empty):
    assert fn("", db=FakeDb()) == empty


@pytest.mark.parametrize("fn,empty", [
    (get_outbox_status, {"total_contacts": 0, "awaiting_reply": 0, "replied": 0, "recent": []}),
    (get_recent_searches, {"count": 0, "recent": []}),
])
def test_degrades_with_no_db(fn, empty):
    assert fn("u", db=None) == empty


# ============================================================================
# System prompt integration: the section names every shipped tool
# ============================================================================

def test_system_prompt_mentions_every_workflow_tool():
    from app.services.scout_assistant_service import _build_static_system_prompt
    prompt = _build_static_system_prompt()
    assert "## Workflow state" in prompt
    for tool_name in (
        "get_outbox_status",
        "get_recent_searches",
        "get_recent_cover_letters",
        "get_meeting_prep_drafts",
        "get_recent_firm_searches",
    ):
        assert tool_name in prompt, f"system prompt is missing {tool_name}"
    # Interview prep tool is held back from Phase 5 (feature not shipping yet).
    assert "get_interview_prep_drafts" not in prompt
