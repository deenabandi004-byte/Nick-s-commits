"""Unit tests for Scout's run_meeting_prep execute tool.

The guards must hold without any network: no uid, unknown contact, contact
with no LinkedIn, insufficient credits, and tier limits all short-circuit
before any credits move or any thread spawns. The success path deducts
credits BEFORE spawning the worker and returns the prep_id the frontend
polls.
"""
import asyncio
from unittest.mock import MagicMock, patch

import pytest

from app.services.scout import prep_actions
from app.services.scout.tools import run_helper_tool


def _run(name, args, ctx):
    return asyncio.run(run_helper_tool(name, args, ctx))


# ---------------------------------------------------------------------------
# Fake Firestore: just enough for _resolve_contact + the user doc read +
# the prep doc create.
# ---------------------------------------------------------------------------

class _FakeSnap:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data or {})


class _FakeDocRef:
    def __init__(self, db, doc_id, data=None):
        self._db = db
        self.id = doc_id
        self._data = data

    def get(self):
        return _FakeSnap(self.id, self._data)

    def set(self, data):
        self._db.created_docs.append((self.id, dict(data)))

    def update(self, data):
        pass

    def collection(self, name):
        return self._db.collections.get(name, _FakeCollection(self._db, []))


class _FakeCollection:
    def __init__(self, db, snaps, user_data=None):
        self._db = db
        self._snaps = snaps
        self._user_data = user_data

    def document(self, doc_id=None):
        if doc_id is None:
            return _FakeDocRef(self._db, "new-prep-id")
        return _FakeDocRef(self._db, doc_id, self._user_data)

    def stream(self):
        return list(self._snaps)


class _FakeDb:
    """users/{uid} resolves to user_data; contacts and coffee-chat-preps are
    subcollections keyed in self.collections."""

    def __init__(self, user_data, contacts):
        self.created_docs = []
        contact_snaps = [_FakeSnap(f"c{i}", d) for i, d in enumerate(contacts)]
        self.collections = {
            "contacts": _FakeCollection(self, contact_snaps),
            "coffee-chat-preps": _FakeCollection(self, []),
        }
        self._users = _FakeCollection(self, [], user_data=user_data)

    def collection(self, name):
        if name == "users":
            return self._users
        return self.collections.get(name, _FakeCollection(self, []))


_USER = {
    "email": "student@usc.edu",
    "subscriptionTier": "pro",
    "credits": 100,
    "resumeText": "resume text long enough to count",
}

_CONTACTS = [
    {
        "FirstName": "Veronica",
        "LastName": "Wittig",
        "LinkedIn": "https://www.linkedin.com/in/veronica-wittig/?utm=x",
    },
    {"FirstName": "Bo", "LastName": "NoUrl"},
]


def _patched_env(db, credits=100, allowed=(True, None), deduct=(True, 85)):
    """Patch every collaborator start_meeting_prep touches."""
    return [
        patch.object(prep_actions, "_db", return_value=db),
        patch("app.services.feature_flags.PDL_OUTAGE_ACTIVE", False),
        patch("app.services.auth.check_and_reset_credits", return_value=credits),
        patch("app.services.auth.check_and_reset_usage"),
        patch("app.services.auth.can_access_feature", return_value=allowed),
        patch("app.services.auth.deduct_credits_atomic", return_value=deduct),
        patch("app.routes.coffee_chat_prep.process_coffee_chat_prep_background"),
        patch.object(prep_actions.threading, "Thread"),
        patch("app.utils.metrics_events.log_event"),
    ]


def _start(db=None, credits=100, allowed=(True, None), deduct=(True, 85), **kwargs):
    db = db if db is not None else _FakeDb(_USER, _CONTACTS)
    patches = _patched_env(db, credits=credits, allowed=allowed, deduct=deduct)
    started = [p.start() for p in patches]
    try:
        result = prep_actions.start_meeting_prep(kwargs.pop("uid", "u1"), **kwargs)
        return result, db, started
    finally:
        for p in patches:
            p.stop()


@pytest.mark.unit
def test_requires_auth():
    out = _run("run_meeting_prep", {"contact_name": "Veronica"}, {"uid": None})
    assert out["code"] == "AUTH_REQUIRED"
    assert out["started"] is False


@pytest.mark.unit
def test_contact_not_found():
    result, _, _ = _start(contact_name="Someone Unknown")
    assert result["code"] == "CONTACT_NOT_FOUND"
    assert result["started"] is False


@pytest.mark.unit
def test_contact_without_linkedin():
    result, _, _ = _start(contact_name="Bo NoUrl")
    assert result["code"] == "NO_LINKEDIN"
    assert "Bo NoUrl" in result["error"]


@pytest.mark.unit
def test_insufficient_credits():
    result, db, _ = _start(contact_name="Veronica", credits=5)
    assert result["code"] == "INSUFFICIENT_CREDITS"
    assert result["credits_needed"] == 30
    assert db.created_docs == []


@pytest.mark.unit
def test_tier_limit_reached():
    result, db, _ = _start(contact_name="Veronica", allowed=(False, "limit"))
    assert result["code"] == "LIMIT_REACHED"
    assert db.created_docs == []


@pytest.mark.unit
def test_success_starts_job_with_resolved_url():
    result, db, mocks = _start(contact_name="veronica wittig")
    assert result["started"] is True
    assert result["prep_id"] == "new-prep-id"
    assert result["contact_name"] == "Veronica Wittig"
    assert result["credits_charged"] == 30
    # The prep doc stores the normalized LinkedIn URL (query string stripped).
    assert db.created_docs
    _, prep_data = db.created_docs[0]
    assert prep_data["linkedinUrl"] == "https://www.linkedin.com/in/veronica-wittig"
    assert prep_data["source"] == "scout_chat"
    # The worker thread was spawned.
    thread_cls = mocks[7]
    assert thread_cls.call_count == 1
    assert thread_cls.call_args.kwargs.get("daemon") is True


@pytest.mark.unit
def test_explicit_url_skips_contact_resolution():
    db = _FakeDb(_USER, [])  # empty network: resolution would fail
    result, db, _ = _start(
        db=db,
        contact_name="Someone New",
        linkedin_url="https://linkedin.com/in/someone-new/",
    )
    assert result["started"] is True
    _, prep_data = db.created_docs[0]
    assert prep_data["linkedinUrl"] == "https://linkedin.com/in/someone-new"


@pytest.mark.unit
def test_prompt_advertises_meeting_prep_tool():
    from app.services.scout_assistant_service import _build_static_system_prompt
    prompt = _build_static_system_prompt()
    assert "run_meeting_prep" in prompt
    assert "Meeting prep from chat" in prompt


@pytest.mark.unit
def test_enrich_prep_report_stamps_prep_job():
    from app.services.scout_assistant_service import ScoutAssistantService
    svc = ScoutAssistantService.__new__(ScoutAssistantService)
    result = {"tool": "answer", "message": "On it", "cta": None}
    helpers = [{
        "name": "run_meeting_prep",
        "result": {"started": True, "prep_id": "p9", "contact_name": "Veronica Wittig"},
    }]
    out = svc._enrich_prep_report(result, helpers)
    assert out["prep_job"] == {"prep_id": "p9", "contact_name": "Veronica Wittig"}


@pytest.mark.unit
def test_enrich_prep_report_ignores_failed_start():
    from app.services.scout_assistant_service import ScoutAssistantService
    svc = ScoutAssistantService.__new__(ScoutAssistantService)
    result = {"tool": "answer", "message": "no dice", "cta": None}
    helpers = [{
        "name": "run_meeting_prep",
        "result": {"started": False, "code": "CONTACT_NOT_FOUND"},
    }]
    out = svc._enrich_prep_report(result, helpers)
    assert "prep_job" not in out
