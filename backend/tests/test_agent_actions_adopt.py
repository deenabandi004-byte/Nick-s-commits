"""
agent_actions — non-destructive "pure adopt" of an existing contact.

When a Loop re-discovers someone who already exists in users/{uid}/contacts
(manual add, or a sibling Loop mid-cycle), it must ENRICH them in place, not
stomp them. The locked rules:

  - fill empty fields only; never overwrite manually-entered data
  - stamp loopId only if absent (don't steal a contact from another Loop)
  - backfill draftToEmail for Gmail reply-match parity
  - never regress pipelineStage; never touch draft / thread / email body
  - leave `source` untouched (a manual contact stays manual)

Pure unit tests against the helpers. No Firestore, no PDL, no Gmail.
"""
from __future__ import annotations

from app.services.agent_actions import (
    _ADOPT_FILL_KEYS,
    _build_adopt_update,
    _find_existing_contact,
)

NOW = "2026-06-12T00:00:00Z"


# ── fill-empty-only ────────────────────────────────────────────────────────


def test_fills_only_empty_fields():
    """An empty field on the existing contact gets filled from the Loop's
    fresh data; a populated field is left exactly as-is."""
    existing = {"firstName": "Dana", "company": "", "jobTitle": "Analyst"}
    incoming = {"firstName": "Daniela", "company": "Evercore", "jobTitle": "VP"}

    update = _build_adopt_update(existing, incoming, loop_id="L1", now_iso=NOW)

    assert update["company"] == "Evercore"          # was empty → filled
    assert "firstName" not in update                # populated → untouched
    assert "jobTitle" not in update                 # populated → untouched


def test_never_overwrites_manually_entered_data():
    """Every identity field the user already set survives the adopt — the
    Loop cannot regress a hand-corrected name/company/title. (loopId is still
    stamped here since `existing` has none; that's attribution, not a stomp.)"""
    existing = {k: "user-typed" for k in _ADOPT_FILL_KEYS}
    incoming = {k: "loop-found" for k in _ADOPT_FILL_KEYS}

    update = _build_adopt_update(existing, incoming, loop_id="L1", now_iso=NOW)

    # Not one populated identity/enrichment field was overwritten.
    assert all(k not in update for k in _ADOPT_FILL_KEYS)


# ── loopId attribution ─────────────────────────────────────────────────────


def test_stamps_loop_id_when_absent():
    existing = {"firstName": "Dana"}
    update = _build_adopt_update(existing, {}, loop_id="L1", now_iso=NOW)
    assert update["loopId"] == "L1"


def test_does_not_steal_loop_id_from_another_loop():
    """A contact already owned by Loop L0 is not reassigned to L1."""
    existing = {"firstName": "Dana", "loopId": "L0"}
    update = _build_adopt_update(existing, {}, loop_id="L1", now_iso=NOW)
    assert "loopId" not in update


# ── draftToEmail reply-match parity ────────────────────────────────────────


def test_backfills_draft_to_email_when_absent():
    existing = {"email": "dana@evercore.com"}
    incoming = {"email": "Dana@Evercore.com"}
    update = _build_adopt_update(existing, incoming, loop_id="", now_iso=NOW)
    assert update["draftToEmail"] == "dana@evercore.com"   # lowercased


def test_does_not_overwrite_existing_draft_to_email():
    existing = {"draftToEmail": "old@evercore.com"}
    incoming = {"email": "new@evercore.com"}
    update = _build_adopt_update(existing, incoming, loop_id="", now_iso=NOW)
    assert "draftToEmail" not in update


# ── never touch outreach state ─────────────────────────────────────────────


def test_never_touches_stage_draft_thread_or_source():
    """Even when the Loop's fresh doc carries a draft + stage + source, the
    adopt update must not include any of those keys."""
    existing = {"firstName": "", "pipelineStage": "email_sent", "source": ""}
    incoming = {
        "firstName": "Dana",
        "pipelineStage": "draft_created",
        "emailSubject": "Quick intro",
        "emailBody": "Hi Dana ...",
        "gmailDraftId": "draft123",
        "gmailThreadId": "thread123",
        "gmailDraftUrl": "https://mail.google.com/...",
        "inOutbox": True,
        "source": "agent",
    }

    update = _build_adopt_update(existing, incoming, loop_id="L1", now_iso=NOW)

    forbidden = {
        "pipelineStage", "emailSubject", "emailBody", "gmailDraftId",
        "gmailThreadId", "gmailDraftUrl", "inOutbox", "source",
    }
    assert forbidden.isdisjoint(update.keys())
    assert update["firstName"] == "Dana"   # the one empty identity field filled


def test_activity_timestamp_only_when_something_changed():
    """lastActivityAt is bumped only when the adopt actually wrote a field,
    so a no-op adopt never reorders the tracker."""
    # nothing to fill → empty update, no timestamp
    assert _build_adopt_update({"firstName": "Dana"}, {}, "", NOW) == {}
    # one fill → timestamp present
    update = _build_adopt_update({"firstName": ""}, {"firstName": "Dana"}, "", NOW)
    assert update["lastActivityAt"] == NOW


# ── write-time re-query (race mitigation) ──────────────────────────────────


class _FakeSnap:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return self._data


class _FakeQuery:
    def __init__(self, matches):
        self._matches = matches

    def limit(self, _n):
        return self

    def stream(self):
        return iter(self._matches)


class _FakeContactsRef:
    """Minimal stand-in for a Firestore collection ref: records the equality
    filter and returns the seeded match (if its email matches, lowercased)."""

    def __init__(self, seeded):
        self.seeded = seeded   # list of (doc_id, data)
        self.last_where = None

    def where(self, field, op, value):
        self.last_where = (field, op, value)
        matches = [
            _FakeSnap(doc_id, data)
            for doc_id, data in self.seeded
            if field == "email" and op == "==" and data.get("email") == value
        ]
        return _FakeQuery(matches)


def test_find_existing_requeries_by_lowercased_email():
    ref = _FakeContactsRef([("c1", {"email": "dana@evercore.com"})])
    doc_id, data = _find_existing_contact(ref, "  Dana@Evercore.com ")
    assert doc_id == "c1"
    assert data["email"] == "dana@evercore.com"
    assert ref.last_where == ("email", "==", "dana@evercore.com")


def test_find_existing_returns_none_on_miss():
    ref = _FakeContactsRef([("c1", {"email": "someone@else.com"})])
    assert _find_existing_contact(ref, "dana@evercore.com") == (None, None)


def test_find_existing_short_circuits_blank_email():
    ref = _FakeContactsRef([("c1", {"email": "dana@evercore.com"})])
    assert _find_existing_contact(ref, "   ") == (None, None)
    assert ref.last_where is None   # never queried
