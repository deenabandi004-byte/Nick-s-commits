"""
Tests for app.services.nudge_service - follow-up nudge generation and lifecycle.
"""
import os
import time
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, MagicMock, patch, call

from app.services.nudge_service import (
    _acquire_lock,
    _release_lock,
    _get_eligible_contacts,
    _generate_nudge_text,
    _generate_template_nudge,
    _create_nudge,
    _cleanup_old_nudges,
    scan_and_generate_nudges,
    dismiss_pending_nudges_for_contact,
    LOCK_TTL_SECONDS,
    DEFAULT_FOLLOWUP_DAYS,
    MAX_NUDGES_PER_USER_PER_DAY,
    NUDGE_TTL_DAYS,
    NUDGE_ELIGIBLE_STAGES,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _now():
    return datetime.now(timezone.utc)


def _make_contact_doc(doc_id, data):
    """Build a mock Firestore document snapshot."""
    doc = Mock()
    doc.id = doc_id
    doc.to_dict.return_value = data
    doc.reference = Mock()
    return doc


def _make_nudge_doc(doc_id, data):
    doc = Mock()
    doc.id = doc_id
    doc.to_dict.return_value = data
    doc.reference = Mock()
    return doc


# ---------------------------------------------------------------------------
# _acquire_lock
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_acquire_lock_no_existing_lock(mock_db):
    """Lock should be acquired when no lock document exists."""
    lock_snap = Mock()
    lock_snap.exists = False
    lock_ref = Mock()
    lock_ref.get.return_value = lock_snap

    mock_db.collection.return_value.document.return_value = lock_ref

    # We need to simulate the transactional decorator behavior.
    # The function uses @transactional which expects a real transaction object.
    # We patch the whole flow: db.transaction() returns a mock, and we patch
    # transactional to just call through.
    mock_transaction = Mock()
    mock_db.transaction.return_value = mock_transaction

    with patch("app.services.nudge_service.transactional", lambda fn: fn):
        result = _acquire_lock(mock_db)

    assert result is True


@pytest.mark.unit
def test_acquire_lock_held_not_expired(mock_db):
    """Lock should NOT be acquired when another worker holds a non-expired lock."""
    lock_snap = Mock()
    lock_snap.exists = True
    lock_snap.to_dict.return_value = {"acquiredAt": time.time() - 100}  # 100s ago, well within TTL

    lock_ref = Mock()
    lock_ref.get.return_value = lock_snap

    mock_db.collection.return_value.document.return_value = lock_ref
    mock_transaction = Mock()
    mock_db.transaction.return_value = mock_transaction

    with patch("app.services.nudge_service.transactional", lambda fn: fn):
        result = _acquire_lock(mock_db)

    assert result is False


@pytest.mark.unit
def test_acquire_lock_expired(mock_db):
    """Lock should be acquired when existing lock has expired."""
    lock_snap = Mock()
    lock_snap.exists = True
    lock_snap.to_dict.return_value = {"acquiredAt": time.time() - LOCK_TTL_SECONDS - 100}

    lock_ref = Mock()
    lock_ref.get.return_value = lock_snap

    mock_db.collection.return_value.document.return_value = lock_ref
    mock_transaction = Mock()
    mock_db.transaction.return_value = mock_transaction

    with patch("app.services.nudge_service.transactional", lambda fn: fn):
        result = _acquire_lock(mock_db)

    assert result is True


@pytest.mark.unit
def test_acquire_lock_exception_returns_false(mock_db):
    """Lock acquisition should return False on any exception."""
    # The try/except wraps db.transaction() and the transactional call,
    # so we make the transaction creation fail.
    mock_db.collection.return_value.document.return_value = Mock()
    mock_db.transaction.side_effect = Exception("Firestore unavailable")

    with patch("app.services.nudge_service.transactional", lambda fn: fn):
        result = _acquire_lock(mock_db)

    assert result is False


# ---------------------------------------------------------------------------
# _release_lock
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_release_lock_deletes_document(mock_db):
    """Release should delete the lock document."""
    lock_ref = Mock()
    mock_db.collection.return_value.document.return_value = lock_ref

    _release_lock(mock_db)

    lock_ref.delete.assert_called_once()


@pytest.mark.unit
def test_release_lock_handles_exception(mock_db):
    """Release should not raise even if delete fails."""
    mock_db.collection.return_value.document.return_value.delete.side_effect = Exception("fail")

    # Should not raise
    _release_lock(mock_db)


# ---------------------------------------------------------------------------
# _get_eligible_contacts
# ---------------------------------------------------------------------------

def _setup_contacts_query(mock_db, uid, docs, use_fallback=False):
    """Wire up the mock db for _get_eligible_contacts."""
    contacts_ref = Mock()
    mock_db.collection.return_value.document.return_value.collection.return_value = contacts_ref

    if use_fallback:
        # Server-side query raises, triggering fallback full-scan
        query = Mock()
        contacts_ref.where.return_value = query
        query.where.side_effect = Exception("index missing")
        contacts_ref.stream.return_value = iter(docs)
    else:
        query = Mock()
        contacts_ref.where.return_value = query
        query.where.return_value = query
        query.stream.return_value = iter(docs)


@pytest.mark.unit
def test_get_eligible_contacts_server_side_filter():
    """Contacts returned by server-side filter with valid stage should be eligible."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=10)  # Within window (> 7 days ago, < 30 days ago)

    doc = _make_contact_doc("c1", {
        "pipelineStage": "email_sent",
        "emailGeneratedAt": _iso(sent_at),
    })

    _setup_contacts_query(db, "uid1", [doc])

    result = _get_eligible_contacts(db, "uid1")
    assert len(result) == 1
    assert result[0]["id"] == "c1"


@pytest.mark.unit
def test_get_eligible_contacts_fallback_path():
    """When server-side filter fails, fallback to full scan should still work."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=10)

    doc = _make_contact_doc("c1", {
        "pipelineStage": "waiting_on_reply",
        "emailGeneratedAt": _iso(sent_at),
    })

    _setup_contacts_query(db, "uid1", [doc], use_fallback=True)

    result = _get_eligible_contacts(db, "uid1")
    assert len(result) == 1
    assert result[0]["id"] == "c1"


@pytest.mark.unit
def test_get_eligible_contacts_stage_filtering():
    """Only contacts in NUDGE_ELIGIBLE_STAGES should be included."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=10)

    docs = [
        _make_contact_doc("c1", {"pipelineStage": "email_sent", "emailGeneratedAt": _iso(sent_at)}),
        _make_contact_doc("c2", {"pipelineStage": "waiting_on_reply", "emailGeneratedAt": _iso(sent_at)}),
        _make_contact_doc("c3", {"pipelineStage": "draft_created", "emailGeneratedAt": _iso(sent_at)}),
        _make_contact_doc("c4", {"pipelineStage": "replied", "emailGeneratedAt": _iso(sent_at)}),
        _make_contact_doc("c5", {"pipelineStage": "meeting_scheduled", "emailGeneratedAt": _iso(sent_at)}),
        _make_contact_doc("c6", {"pipelineStage": "", "emailGeneratedAt": _iso(sent_at)}),
    ]

    _setup_contacts_query(db, "uid1", docs)

    result = _get_eligible_contacts(db, "uid1")
    ids = {c["id"] for c in result}
    assert ids == {"c1", "c2", "c3"}


@pytest.mark.unit
def test_get_eligible_contacts_archived_excluded():
    """Archived contacts should be excluded."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=10)

    doc = _make_contact_doc("c1", {
        "pipelineStage": "email_sent",
        "emailGeneratedAt": _iso(sent_at),
        "archivedAt": _iso(now - timedelta(days=1)),
    })

    _setup_contacts_query(db, "uid1", [doc])

    result = _get_eligible_contacts(db, "uid1")
    assert len(result) == 0


@pytest.mark.unit
def test_get_eligible_contacts_active_snooze_excluded():
    """Contact with an active (future) snooze should be excluded."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=10)

    doc = _make_contact_doc("c1", {
        "pipelineStage": "email_sent",
        "emailGeneratedAt": _iso(sent_at),
        "snoozedUntil": _iso(now + timedelta(days=2)),  # Future = active snooze
    })

    _setup_contacts_query(db, "uid1", [doc])

    result = _get_eligible_contacts(db, "uid1")
    assert len(result) == 0


@pytest.mark.unit
def test_get_eligible_contacts_expired_snooze_included():
    """Contact with an expired snooze should be included."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=10)

    doc = _make_contact_doc("c1", {
        "pipelineStage": "email_sent",
        "emailGeneratedAt": _iso(sent_at),
        "snoozedUntil": _iso(now - timedelta(days=1)),  # Past = expired
    })

    _setup_contacts_query(db, "uid1", [doc])

    result = _get_eligible_contacts(db, "uid1")
    assert len(result) == 1


@pytest.mark.unit
def test_get_eligible_contacts_too_recent_skipped():
    """Contact emailed less than followup_days ago should be skipped."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=3)  # Only 3 days ago, default is 7

    doc = _make_contact_doc("c1", {
        "pipelineStage": "email_sent",
        "emailGeneratedAt": _iso(sent_at),
    })

    _setup_contacts_query(db, "uid1", [doc])

    result = _get_eligible_contacts(db, "uid1")
    assert len(result) == 0


@pytest.mark.unit
def test_get_eligible_contacts_too_old_skipped():
    """Contact emailed more than 30 days ago should be skipped."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=35)

    doc = _make_contact_doc("c1", {
        "pipelineStage": "email_sent",
        "emailGeneratedAt": _iso(sent_at),
    })

    _setup_contacts_query(db, "uid1", [doc])

    result = _get_eligible_contacts(db, "uid1")
    assert len(result) == 0


@pytest.mark.unit
def test_get_eligible_contacts_last_nudge_dedup():
    """Contact with a recent lastNudgeAt should be skipped (dedup)."""
    db = Mock()
    now = _now()
    sent_at = now - timedelta(days=10)

    doc = _make_contact_doc("c1", {
        "pipelineStage": "email_sent",
        "emailGeneratedAt": _iso(sent_at),
        "lastNudgeAt": _iso(now - timedelta(days=2)),  # Nudged 2 days ago, within cutoff
    })

    _setup_contacts_query(db, "uid1", [doc])

    result = _get_eligible_contacts(db, "uid1")
    assert len(result) == 0


# ---------------------------------------------------------------------------
# _generate_nudge_text
# ---------------------------------------------------------------------------

@pytest.mark.unit
@patch("app.services.nudge_service.get_openai_client")
@patch("app.services.nudge_service.get_user_name", return_value="Alex Kim")
@patch("app.services.nudge_service.get_user_school", return_value="USC")
@patch("app.services.nudge_service.get_user_major", return_value="Business")
@patch("app.services.nudge_service.get_user_career_track", return_value="consulting")
def test_generate_nudge_text_success(mock_career, mock_major, mock_school, mock_name, mock_get_client):
    """Successful generation should parse SUGGESTION/DRAFT format."""
    mock_client = Mock()
    mock_get_client.return_value = mock_client

    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = (
        "SUGGESTION: Follow up with Sarah since she works at McKinsey and you share a consulting interest.\n"
        "DRAFT: Hi Sarah,\n\nI wanted to follow up on my earlier email. I'm really interested in consulting at McKinsey.\n\nBest,\nAlex"
    )
    mock_client.chat.completions.create.return_value = mock_response

    contact = {
        "firstName": "Sarah",
        "lastName": "Jones",
        "company": "McKinsey",
        "jobTitle": "Associate",
        "emailGeneratedAt": _iso(_now() - timedelta(days=10)),
    }

    result = _generate_nudge_text(contact, {"name": "Alex Kim"})

    assert result is not None
    assert "suggestion" in result
    assert "followUpDraft" in result
    assert "Sarah" in result["suggestion"]
    assert "Alex" in result["followUpDraft"]


@pytest.mark.unit
@patch("app.services.nudge_service.get_openai_client")
@patch("app.services.nudge_service.get_user_name", return_value="Alex")
@patch("app.services.nudge_service.get_user_school", return_value="")
@patch("app.services.nudge_service.get_user_major", return_value="")
@patch("app.services.nudge_service.get_user_career_track", return_value="")
def test_generate_nudge_text_fallback_format(mock_career, mock_major, mock_school, mock_name, mock_get_client):
    """When response doesn't match SUGGESTION/DRAFT format, use entire text as suggestion."""
    mock_client = Mock()
    mock_get_client.return_value = mock_client

    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = "Just a plain text response without the expected format."
    mock_client.chat.completions.create.return_value = mock_response

    contact = {"firstName": "Bob", "lastName": "Smith", "company": "Google"}

    result = _generate_nudge_text(contact, {})

    assert result is not None
    assert result["suggestion"] == "Just a plain text response without the expected format."
    assert result["followUpDraft"] == ""


@pytest.mark.unit
@patch("app.services.nudge_service.get_openai_client", return_value=None)
def test_generate_nudge_text_no_client(mock_get_client):
    """Should return None when OpenAI client is unavailable."""
    result = _generate_nudge_text({"firstName": "Test"}, {})
    assert result is None


@pytest.mark.unit
@patch("app.services.nudge_service.get_openai_client")
@patch("app.services.nudge_service.get_user_name", return_value="Alex")
@patch("app.services.nudge_service.get_user_school", return_value="")
@patch("app.services.nudge_service.get_user_major", return_value="")
@patch("app.services.nudge_service.get_user_career_track", return_value="")
def test_generate_nudge_text_api_error(mock_career, mock_major, mock_school, mock_name, mock_get_client):
    """Should return None when OpenAI API call fails."""
    mock_client = Mock()
    mock_get_client.return_value = mock_client
    mock_client.chat.completions.create.side_effect = Exception("API error")

    contact = {"firstName": "Test", "company": "Acme"}
    result = _generate_nudge_text(contact, {})

    assert result is None


# ---------------------------------------------------------------------------
# _generate_template_nudge
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_generate_template_nudge_content():
    """Template nudge should include contact name and company."""
    contact = {
        "firstName": "Jane",
        "lastName": "Doe",
        "company": "Goldman Sachs",
        "emailGeneratedAt": _iso(_now() - timedelta(days=8)),
    }

    result = _generate_template_nudge(contact)

    assert "Jane Doe" in result["suggestion"]
    assert "Goldman Sachs" in result["suggestion"]
    assert result["followUpDraft"] == ""


@pytest.mark.unit
def test_generate_template_nudge_missing_name():
    """Template nudge should fall back to 'Unknown' for missing names."""
    contact = {"company": "Bain"}

    result = _generate_template_nudge(contact)

    assert "Unknown" in result["suggestion"]
    assert "Bain" in result["suggestion"]


# ---------------------------------------------------------------------------
# _create_nudge
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_create_nudge_success(mock_db):
    """Normal creation should write nudge doc and update lastNudgeAt on contact."""
    nudges_ref = Mock()
    contacts_ref = Mock()

    # Wire up mock_db collection paths
    def _collection_router(name):
        coll = Mock()
        def _doc_router(uid):
            doc_mock = Mock()
            def _subcoll_router(sub_name):
                if sub_name == "nudges":
                    return nudges_ref
                return contacts_ref
            doc_mock.collection.side_effect = _subcoll_router
            return doc_mock
        coll.document.side_effect = _doc_router
        return coll
    mock_db.collection.side_effect = _collection_router

    # No existing pending nudge
    query = Mock()
    nudges_ref.where.return_value = query
    query.where.return_value = query
    query.limit.return_value = query
    query.stream.return_value = iter([])

    # add() returns (timestamp, doc_ref)
    new_ref = Mock()
    new_ref.id = "nudge-123"
    nudges_ref.add.return_value = (Mock(), new_ref)

    contact = {"id": "c1", "firstName": "Sarah", "lastName": "Lee", "company": "Deloitte"}
    nudge_text = {"suggestion": "Follow up with Sarah", "followUpDraft": "Hi Sarah..."}

    result = _create_nudge(mock_db, "uid1", contact, nudge_text)

    assert result == "nudge-123"
    nudges_ref.add.assert_called_once()
    contacts_ref.document.return_value.update.assert_called_once()


@pytest.mark.unit
def test_create_nudge_dedup_existing_pending(mock_db):
    """Should skip creation when a pending nudge already exists for this contact."""
    nudges_ref = Mock()

    def _collection_router(name):
        coll = Mock()
        def _doc_router(uid):
            doc_mock = Mock()
            doc_mock.collection.return_value = nudges_ref
            return doc_mock
        coll.document.side_effect = _doc_router
        return coll
    mock_db.collection.side_effect = _collection_router

    # Existing pending nudge found
    existing_nudge = _make_nudge_doc("existing-1", {"status": "pending", "contactId": "c1"})
    query = Mock()
    nudges_ref.where.return_value = query
    query.where.return_value = query
    query.limit.return_value = query
    query.stream.return_value = iter([existing_nudge])

    contact = {"id": "c1", "firstName": "Sarah", "company": "Deloitte"}
    nudge_text = {"suggestion": "test", "followUpDraft": ""}

    result = _create_nudge(mock_db, "uid1", contact, nudge_text)

    assert result is None
    nudges_ref.add.assert_not_called()


# ---------------------------------------------------------------------------
# _cleanup_old_nudges
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_cleanup_old_nudges_deletes_old_dismissed():
    """Old dismissed and acted_on nudges should be deleted."""
    db = Mock()
    nudges_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = nudges_ref

    old_dismissed = _make_nudge_doc("n1", {"status": "dismissed", "createdAt": _iso(_now() - timedelta(days=40))})
    old_acted = _make_nudge_doc("n2", {"status": "acted_on", "createdAt": _iso(_now() - timedelta(days=35))})

    # First call (dismissed), second call (acted_on)
    query = Mock()
    nudges_ref.where.return_value = query
    query.where.return_value = query
    query.limit.return_value = query
    query.stream.side_effect = [iter([old_dismissed]), iter([old_acted])]

    _cleanup_old_nudges(db, "uid1")

    assert old_dismissed.reference.delete.call_count == 1
    assert old_acted.reference.delete.call_count == 1


@pytest.mark.unit
def test_cleanup_old_nudges_retains_pending():
    """Pending nudges should NOT be cleaned up regardless of age."""
    db = Mock()
    nudges_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = nudges_ref

    # The cleanup only queries "dismissed" and "acted_on" statuses,
    # so pending nudges are never returned by the query.
    query = Mock()
    nudges_ref.where.return_value = query
    query.where.return_value = query
    query.limit.return_value = query
    query.stream.side_effect = [iter([]), iter([])]

    _cleanup_old_nudges(db, "uid1")

    # No deletions should happen
    # (nothing returned from queries)


# ---------------------------------------------------------------------------
# scan_and_generate_nudges
# ---------------------------------------------------------------------------

@pytest.mark.unit
@patch.dict(os.environ, {"NUDGES_ENABLED": "false"})
@patch("app.services.nudge_service.get_db")
def test_scan_kill_switch(mock_get_db):
    """When NUDGES_ENABLED=false, scan should exit immediately."""
    scan_and_generate_nudges()
    mock_get_db.assert_not_called()


@pytest.mark.unit
@patch.dict(os.environ, {"NUDGES_ENABLED": "true"})
@patch("app.services.nudge_service._release_lock")
@patch("app.services.nudge_service._acquire_lock", return_value=True)
@patch("app.services.nudge_service._cleanup_old_nudges")
@patch("app.services.nudge_service._update_healthcheck")
@patch("app.services.nudge_service.get_db")
def test_scan_user_opt_out(mock_get_db, mock_healthcheck, mock_cleanup, mock_acquire, mock_release):
    """Users with nudgesEnabled=False should be skipped."""
    db = Mock()
    mock_get_db.return_value = db
    mock_acquire.return_value = True

    user_doc = Mock()
    user_doc.id = "uid1"
    user_doc.to_dict.return_value = {"nudgesEnabled": False}
    db.collection.return_value.stream.return_value = iter([user_doc])

    scan_and_generate_nudges()

    # Healthcheck should be called with 0 nudges generated
    mock_healthcheck.assert_called_once()
    args = mock_healthcheck.call_args[0]
    assert args[1] == 0  # nudges_generated
    assert args[2] == 1  # users_scanned


@pytest.mark.unit
@patch.dict(os.environ, {"NUDGES_ENABLED": "true"})
@patch("app.services.nudge_service._release_lock")
@patch("app.services.nudge_service._acquire_lock", return_value=True)
@patch("app.services.nudge_service._cleanup_old_nudges")
@patch("app.services.nudge_service._get_eligible_contacts", return_value=[])
@patch("app.services.nudge_service._update_healthcheck")
@patch("app.services.nudge_service.get_db")
def test_scan_user_preferences_wired_in(mock_get_db, mock_healthcheck, mock_get_eligible, mock_cleanup, mock_acquire, mock_release):
    """User's nudgeFollowUpDays and nudgeMaxPerDay should be passed through."""
    db = Mock()
    mock_get_db.return_value = db

    user_doc = Mock()
    user_doc.id = "uid1"
    user_doc.to_dict.return_value = {
        "nudgeFollowUpDays": 5,
        "nudgeMaxPerDay": 10,
    }
    db.collection.return_value.stream.return_value = iter([user_doc])

    scan_and_generate_nudges()

    mock_get_eligible.assert_called_once_with(db, "uid1", followup_days=5)


@pytest.mark.unit
@patch.dict(os.environ, {"NUDGES_ENABLED": "true"})
@patch("app.services.nudge_service._release_lock")
@patch("app.services.nudge_service._acquire_lock", return_value=True)
@patch("app.services.nudge_service._cleanup_old_nudges")
@patch("app.services.nudge_service._create_nudge", return_value=None)
@patch("app.services.nudge_service._generate_nudge_text", return_value=None)
@patch("app.services.nudge_service._generate_template_nudge", return_value={"suggestion": "tmpl", "followUpDraft": ""})
@patch("app.services.nudge_service._get_eligible_contacts")
@patch("app.services.nudge_service._update_healthcheck")
@patch("app.services.nudge_service.get_db")
def test_scan_frequency_cap(mock_get_db, mock_healthcheck, mock_get_eligible, mock_tmpl, mock_gen, mock_create, mock_cleanup, mock_acquire, mock_release):
    """When a user has already hit the daily cap, no nudges should be created."""
    db = Mock()
    mock_get_db.return_value = db

    user_doc = Mock()
    user_doc.id = "uid1"
    user_doc.to_dict.return_value = {"nudgeMaxPerDay": 2}
    db.collection.return_value.stream.return_value = iter([user_doc])

    # 5 eligible contacts
    mock_get_eligible.return_value = [
        {"id": f"c{i}", "firstName": f"Contact{i}", "company": "Co"} for i in range(5)
    ]

    # Already 2 nudges created today (at the cap of 2)
    nudges_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = nudges_ref
    query = Mock()
    nudges_ref.where.return_value = query
    query.limit.return_value = query
    existing_today = [_make_nudge_doc(f"n{i}", {}) for i in range(2)]
    query.stream.return_value = iter(existing_today)

    scan_and_generate_nudges()

    # No nudges should be created because cap is hit
    mock_create.assert_not_called()


# ---------------------------------------------------------------------------
# dismiss_pending_nudges_for_contact
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_dismiss_pending_nudges_for_contact():
    """Pending nudges should be updated to dismissed with reason."""
    db = Mock()
    nudges_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = nudges_ref

    pending1 = _make_nudge_doc("n1", {"status": "pending", "contactId": "c1"})
    pending2 = _make_nudge_doc("n2", {"status": "pending", "contactId": "c1"})

    query = Mock()
    nudges_ref.where.return_value = query
    query.where.return_value = query
    query.stream.return_value = iter([pending1, pending2])

    dismiss_pending_nudges_for_contact(db, "uid1", "c1")

    assert pending1.reference.update.call_count == 1
    assert pending2.reference.update.call_count == 1

    # Verify update payload includes dismissed status and reason
    update_args = pending1.reference.update.call_args[0][0]
    assert update_args["status"] == "dismissed"
    assert update_args["dismissReason"] == "reply_received"
    assert "dismissedAt" in update_args


@pytest.mark.unit
def test_dismiss_pending_nudges_no_pending():
    """When there are no pending nudges, should be a no-op."""
    db = Mock()
    nudges_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = nudges_ref

    query = Mock()
    nudges_ref.where.return_value = query
    query.where.return_value = query
    query.stream.return_value = iter([])

    dismiss_pending_nudges_for_contact(db, "uid1", "c1")

    # No updates should have been called


# ---------------------------------------------------------------------------
# Shared helper usage verification
# ---------------------------------------------------------------------------

@pytest.mark.unit
@patch("app.services.nudge_service.get_openai_client")
@patch("app.services.nudge_service.get_university_variants", return_value={"usc", "university of southern california"})
@patch("app.services.nudge_service.get_user_career_track", return_value="consulting")
@patch("app.services.nudge_service.get_user_major", return_value="Business Administration")
@patch("app.services.nudge_service.get_user_school", return_value="USC")
@patch("app.services.nudge_service.get_user_name", return_value="Karthik B")
def test_generate_nudge_text_calls_user_helpers(mock_name, mock_school, mock_major, mock_career, mock_variants, mock_get_client):
    """_generate_nudge_text should call all user helper functions."""
    mock_client = Mock()
    mock_get_client.return_value = mock_client

    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = "SUGGESTION: test\nDRAFT: test email"
    mock_client.chat.completions.create.return_value = mock_response

    user_data = {"name": "Karthik B", "academics": {"university": "USC"}}
    contact = {"firstName": "Test", "company": "Bain", "college": "USC"}

    _generate_nudge_text(contact, user_data)

    mock_name.assert_called_once_with(user_data)
    mock_school.assert_called_once_with(user_data)
    mock_major.assert_called_once_with(user_data)
    mock_career.assert_called_once_with(user_data)
    # get_university_variants called for both user school and contact college
    assert mock_variants.call_count == 2
