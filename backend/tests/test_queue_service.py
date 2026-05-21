"""
Tests for app.services.queue_service - agentic networking queue Phase 1.

Focus areas (from /plan-eng-review critical paths):
- Dedup by pdlId AND email fallback (REGRESSION-CRITICAL)
- Blocklist exact-match-on-normalized filtering
- TTL cleanup of 14-day-old queues (REGRESSION-CRITICAL)
- Credit refund paths (zero results, all filtered, failure)
- Approved contact schema matches normalize_contact (REGRESSION-CRITICAL)
- Idempotent approve (double-click)
- Dismiss feeds blocklist correctly
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, Mock, patch

import pytest

from app.services.queue_service import (
    DISMISS_NOT_NOW,
    DISMISS_WRONG_COMPANY,
    DISMISS_WRONG_PERSON,
    QUEUE_CONTACT_COUNT,
    QUEUE_GENERATION_CREDITS,
    QUEUE_STALENESS_SECONDS,
    QUEUE_TTL_DAYS,
    QUEUE_TUESDAY_WEEKDAY,
    STATUS_ARCHIVED,
    STATUS_COMPLETED_PARTIAL,
    STATUS_PENDING_REVIEW,
    _InsufficientCredits,
    _filter_candidates,
    _fetch_existing_contact_keys,
    _iso_week_key,
    _normalize_email,
    _normalize_text,
    _should_run_queue_scanner,
    _write_queue_scanner_health,
    approve_queue_contact,
    cleanup_expired_queues,
    dismiss_queue_contact,
    generate_queue_background,
    get_current_queue,
    is_free_weekly_eligible,
    is_queue_feature_enabled,
    scan_and_generate_queues,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now():
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _make_doc(doc_id: str, data: dict) -> Mock:
    doc = Mock()
    doc.id = doc_id
    doc.to_dict.return_value = data
    doc.exists = True
    doc.reference = Mock()
    doc.reference.collection = Mock(return_value=Mock())
    return doc


def _candidate(
    pdl_id: str = "pdl-1",
    email: str = "john@acme.com",
    company: str = "Acme",
    title: str = "Analyst",
    first="John",
    last="Doe",
) -> dict:
    """Build a PDL-shaped candidate contact (PascalCase fields + pdlId)."""
    return {
        "pdlId": pdl_id,
        "FirstName": first,
        "LastName": last,
        "Email": email,
        "Company": company,
        "Title": title,
        "City": "San Francisco",
        "State": "CA",
        "College": "USC",
        "LinkedIn": f"linkedin.com/in/{first.lower()}-{last.lower()}",
    }


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_normalize_text_collapses_whitespace():
    assert _normalize_text("  Goldman  Sachs  ") == "goldman sachs"
    assert _normalize_text("Goldman\tSachs\n& Co.") == "goldman sachs & co."


@pytest.mark.unit
def test_normalize_text_handles_empty():
    assert _normalize_text("") == ""
    assert _normalize_text(None) == ""


@pytest.mark.unit
def test_normalize_email_lowercases():
    assert _normalize_email("Sarah@GS.com") == "sarah@gs.com"
    assert _normalize_email("  foo@bar.com  ") == "foo@bar.com"
    assert _normalize_email(None) == ""


@pytest.mark.unit
def test_iso_week_key_format():
    key = _iso_week_key(datetime(2026, 4, 9, tzinfo=timezone.utc))
    assert key == "2026-W15"


# ---------------------------------------------------------------------------
# Dedup + blocklist filter
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_filter_dedup_by_pdl_id():
    """Candidate with pdlId matching existing contact → filtered."""
    candidates = [_candidate(pdl_id="pdl-dup", email="new@acme.com")]
    existing_pdl = {"pdl-dup"}
    existing_email = set()

    filtered, stats = _filter_candidates(candidates, existing_pdl, existing_email, {})

    assert filtered == []
    assert stats["dedup_pdl"] == 1


@pytest.mark.unit
def test_filter_dedup_by_email_fallback():
    """
    REGRESSION-CRITICAL: Historical contact without pdlId (pre-migration) must
    still be excluded via email match. Per eng review test plan line 51-52.
    """
    candidates = [_candidate(pdl_id="pdl-new", email="Sarah@GS.com")]
    existing_pdl = set()
    existing_email = {"sarah@gs.com"}  # normalized lowercase

    filtered, stats = _filter_candidates(candidates, existing_pdl, existing_email, {})

    assert filtered == []
    assert stats["dedup_email"] == 1
    assert stats["dedup_pdl"] == 0


@pytest.mark.unit
def test_filter_keeps_unmatched_candidates():
    """Candidates with no pdl/email match pass through."""
    candidates = [
        _candidate(pdl_id="pdl-a", email="a@acme.com", first="A"),
        _candidate(pdl_id="pdl-b", email="b@acme.com", first="B"),
    ]
    filtered, stats = _filter_candidates(candidates, {"pdl-other"}, {"other@acme.com"}, {})

    assert len(filtered) == 2
    assert stats["dedup_pdl"] == 0
    assert stats["dedup_email"] == 0


@pytest.mark.unit
def test_filter_blocklist_company_exact_match_only():
    """
    Per outside-voice §OV.2: exact-match-on-normalized, NOT substring.
    "Goldman Sachs" must NOT match "Goldman Sachs & Co." (substring).
    """
    candidates = [
        _candidate(pdl_id="pdl-1", company="Goldman Sachs", first="A"),
        _candidate(pdl_id="pdl-2", company="Goldman Sachs & Co.", first="B"),
    ]
    blocklist = {"companies": ["goldman sachs"], "titles": []}

    filtered, stats = _filter_candidates(candidates, set(), set(), blocklist)

    # Only exact match blocked; "& Co." variant passes
    assert len(filtered) == 1
    assert filtered[0]["FirstName"] == "B"
    assert stats["blocklist_company"] == 1


@pytest.mark.unit
def test_filter_blocklist_title_exact_match():
    candidates = [
        _candidate(pdl_id="pdl-1", title="VP", first="A"),
        _candidate(pdl_id="pdl-2", title="Vice President", first="B"),
    ]
    blocklist = {"companies": [], "titles": ["vp"]}

    filtered, stats = _filter_candidates(candidates, set(), set(), blocklist)

    assert len(filtered) == 1
    assert filtered[0]["FirstName"] == "B"
    assert stats["blocklist_title"] == 1


@pytest.mark.unit
def test_filter_blocklist_normalizes_case_and_whitespace():
    """Blocklist entries stored normalized; candidates normalized at match time."""
    candidates = [_candidate(company="  GOLDMAN  SACHS  ")]
    blocklist = {"companies": ["goldman sachs"], "titles": []}

    filtered, _ = _filter_candidates(candidates, set(), set(), blocklist)

    assert len(filtered) == 0


# ---------------------------------------------------------------------------
# _fetch_existing_contact_keys
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_fetch_existing_contact_keys_collects_both():
    """Returns (pdl_id set, normalized email set) from users/{uid}/contacts."""
    db = Mock()
    contacts_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = contacts_ref

    docs = [
        _make_doc("c1", {"pdlId": "pdl-1", "email": "A@example.com"}),
        _make_doc("c2", {"pdlId": "", "email": "b@example.com"}),  # legacy, no pdlId
        _make_doc("c3", {"pdlId": "pdl-3", "email": ""}),
        _make_doc("c4", {}),  # empty
    ]
    contacts_ref.stream.return_value = iter(docs)

    pdl_ids, emails = _fetch_existing_contact_keys(db, "uid1")

    assert pdl_ids == {"pdl-1", "pdl-3"}
    assert emails == {"a@example.com", "b@example.com"}


# ---------------------------------------------------------------------------
# TTL cleanup (REGRESSION-CRITICAL)
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_cleanup_expired_queues_deletes_old():
    """
    REGRESSION-CRITICAL: Queue older than 14 days must be deleted before
    new generation. Per eng review test plan line 54-56.
    """
    db = Mock()
    queues_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = queues_ref

    old_queue_doc = _make_doc("queue-old", {"generatedAt": _iso(_now() - timedelta(days=15))})
    # Simulate empty contacts subcollection
    old_queue_doc.reference.collection.return_value.stream.return_value = iter([])

    query = Mock()
    queues_ref.where.return_value = query
    query.stream.return_value = iter([old_queue_doc])

    deleted = cleanup_expired_queues(db, "uid1", ttl_days=QUEUE_TTL_DAYS)

    assert deleted == 1
    old_queue_doc.reference.delete.assert_called_once()


@pytest.mark.unit
def test_cleanup_expired_queues_no_old_queues():
    db = Mock()
    queues_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = queues_ref

    query = Mock()
    queues_ref.where.return_value = query
    query.stream.return_value = iter([])

    deleted = cleanup_expired_queues(db, "uid1")

    assert deleted == 0


# ---------------------------------------------------------------------------
# Feature gate + free weekly eligibility
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_is_queue_feature_enabled_free_tier():
    assert is_queue_feature_enabled("free") is False
    assert is_queue_feature_enabled("pro") is True
    assert is_queue_feature_enabled("elite") is True
    assert is_queue_feature_enabled(None) is False


@pytest.mark.unit
def test_is_free_weekly_eligible_free_tier_never_eligible():
    db = Mock()
    assert is_free_weekly_eligible(db, "uid1", "free") is False


@pytest.mark.unit
def test_is_free_weekly_eligible_no_prior_free_queue():
    """Pro user with no free queue this week → eligible."""
    db = Mock()
    queues_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = queues_ref

    query = Mock()
    queues_ref.where.return_value = query
    query.where.return_value = query
    query.limit.return_value = query
    query.stream.return_value = iter([])  # No matching docs

    assert is_free_weekly_eligible(db, "uid1", "pro") is True


# ---------------------------------------------------------------------------
# Approve queue contact - happy path, idempotent, schema
# ---------------------------------------------------------------------------


def _build_approve_db(queue_contact_data: dict):
    """
    Wire up a mock db that routes:
        users/{uid}/weekly_queues/{queue_id}/contacts/{contact_id} → q_contact_ref
        users/{uid}/contacts → contacts_ref
    """
    db = Mock()
    q_contact_ref = Mock()
    q_contact_snap = Mock()
    q_contact_snap.exists = True
    q_contact_snap.to_dict.return_value = queue_contact_data
    q_contact_ref.get.return_value = q_contact_snap

    contacts_ref = Mock()
    new_contact_ref = Mock()
    new_contact_ref.id = "new-contact-id"
    # contacts_ref.add() returns (timestamp, doc_ref)
    contacts_ref.add.return_value = (Mock(), new_contact_ref)

    # Routing: collection("users").document(uid).collection(name).document(...)
    def _collection_router(name):
        users_coll = Mock()

        def _doc_router(uid):
            user_doc = Mock()

            def _subcollection_router(sub):
                if sub == "weekly_queues":
                    wq = Mock()

                    def _wq_doc(_qid):
                        wq_doc = Mock()

                        def _wq_sub(s2):
                            q_contacts_coll = Mock()
                            q_contacts_coll.document = Mock(return_value=q_contact_ref)
                            return q_contacts_coll

                        wq_doc.collection.side_effect = _wq_sub
                        return wq_doc

                    wq.document.side_effect = _wq_doc
                    return wq
                if sub == "contacts":
                    return contacts_ref
                return Mock()

            user_doc.collection.side_effect = _subcollection_router
            return user_doc

        users_coll.document.side_effect = _doc_router
        return users_coll

    db.collection.side_effect = _collection_router
    return db, q_contact_ref, contacts_ref, new_contact_ref


@pytest.mark.unit
@patch("app.services.gmail_client.get_gmail_service_for_user", return_value=None)
def test_approve_queue_contact_writes_normalize_contact_schema(_mock_gmail):
    """
    REGRESSION-CRITICAL: After approval, contact in users/{uid}/contacts/ must
    have all fields expected by normalize_contact() so the Pipeline tab renders
    it. Per eng review test plan line 52-54.
    """
    queue_data = {
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@acme.com",
        "title": "Analyst",
        "company": "Acme",
        "city": "SF",
        "state": "CA",
        "college": "USC",
        "linkedinUrl": "linkedin.com/in/jane-doe",
        "pdlId": "pdl-jane",
        "draftSubject": "Hi Jane",
        "draftBody": "Body text here.",
        "status": "pending",
    }
    db, q_ref, contacts_ref, new_ref = _build_approve_db(queue_data)

    result = approve_queue_contact(
        db=db,
        uid="uid1",
        queue_id="queue-1",
        contact_id="qc-1",
        user_email="user@example.com",
        user_profile={},
    )

    assert result["ok"] is True
    assert result["contactId"] == "new-contact-id"

    # Verify the contact doc written to users/{uid}/contacts/
    add_call_args = contacts_ref.add.call_args
    written = add_call_args[0][0]
    # Pascal-case canonical fields from normalize_contact
    assert written["FirstName"] == "Jane"
    assert written["LastName"] == "Doe"
    assert written["Email"] == "jane@acme.com"
    assert written["Title"] == "Analyst"
    assert written["Company"] == "Acme"
    assert written["City"] == "SF"
    assert written["State"] == "CA"
    assert written["College"] == "USC"
    assert written["pdlId"] == "pdl-jane"
    # Camel-case mirror fields for the existing Pipeline tab
    assert written["firstName"] == "Jane"
    assert written["email"] == "jane@acme.com"
    assert written["company"] == "Acme"
    assert written["jobTitle"] == "Analyst"
    # Queue source tracking
    assert written["source"] == "queue"
    assert written["sourceQueueId"] == "queue-1"
    assert written["emailSubject"] == "Hi Jane"
    assert written["emailBody"] == "Body text here."
    assert written["pipelineStage"] == "draft_created"

    # Queue doc updated to approved
    q_ref.update.assert_called_once()
    update_payload = q_ref.update.call_args[0][0]
    assert update_payload["status"] == "approved"
    assert update_payload["approvedContactId"] == "new-contact-id"


@pytest.mark.unit
def test_approve_queue_contact_idempotent():
    """Double-click approve: second call returns existing state, no double-write."""
    queue_data = {
        "status": "approved",
        "gmailDraftId": "existing-draft-id",
        "approvedContactId": "existing-contact-id",
    }
    db, q_ref, contacts_ref, _ = _build_approve_db(queue_data)

    result = approve_queue_contact(
        db=db,
        uid="uid1",
        queue_id="queue-1",
        contact_id="qc-1",
        user_email="user@example.com",
        user_profile={},
    )

    assert result["ok"] is True
    assert result["already"] is True
    assert result["draftId"] == "existing-draft-id"
    assert result["contactId"] == "existing-contact-id"
    # No new contact written
    contacts_ref.add.assert_not_called()
    q_ref.update.assert_not_called()


@pytest.mark.unit
def test_approve_queue_contact_not_found():
    db = Mock()
    q_contact_ref = Mock()
    q_contact_snap = Mock()
    q_contact_snap.exists = False
    q_contact_ref.get.return_value = q_contact_snap

    # Minimal routing
    db.collection.return_value.document.return_value.collection.return_value \
        .document.return_value.collection.return_value.document.return_value = q_contact_ref

    result = approve_queue_contact(
        db=db,
        uid="uid1",
        queue_id="qx",
        contact_id="cx",
        user_email="user@example.com",
        user_profile={},
    )

    assert result["ok"] is False
    assert result["notFound"] is True


@pytest.mark.unit
@patch("app.services.gmail_client.get_gmail_service_for_user", return_value=None)
def test_approve_queue_contact_compose_url_fallback(_mock_gmail):
    """When Gmail OAuth unavailable, return a compose URL fallback."""
    queue_data = {
        "firstName": "Alex",
        "lastName": "Chen",
        "email": "alex@goldman.com",
        "draftSubject": "Hello",
        "draftBody": "Body",
        "status": "pending",
    }
    db, q_ref, _contacts_ref, _ = _build_approve_db(queue_data)

    result = approve_queue_contact(
        db=db,
        uid="uid1",
        queue_id="q1",
        contact_id="qc1",
        user_email="user@example.com",
        user_profile={},
    )

    assert result["ok"] is True
    assert result["draftId"] is None
    assert result["composeUrl"] is not None
    assert "mail.google.com" in result["composeUrl"]
    assert "alex%40goldman.com" in result["composeUrl"]


# ---------------------------------------------------------------------------
# Dismiss queue contact
# ---------------------------------------------------------------------------


def _build_dismiss_db(queue_contact_data: dict):
    """Routes queue contact gets + preference updates."""
    db = Mock()
    q_contact_ref = Mock()
    q_contact_snap = Mock()
    q_contact_snap.exists = True
    q_contact_snap.to_dict.return_value = queue_contact_data
    q_contact_ref.get.return_value = q_contact_snap

    prefs_ref = Mock()

    def _collection_router(name):
        coll = Mock()

        def _doc_router(uid):
            user_doc = Mock()

            def _sub_router(sub):
                if sub == "weekly_queues":
                    wq = Mock()

                    def _wq_doc(_qid):
                        wq_doc = Mock()
                        q_contacts_coll = Mock()
                        q_contacts_coll.document = Mock(return_value=q_contact_ref)
                        wq_doc.collection = Mock(return_value=q_contacts_coll)
                        return wq_doc

                    wq.document.side_effect = _wq_doc
                    return wq
                if sub == "settings":
                    s = Mock()
                    s.document = Mock(return_value=prefs_ref)
                    return s
                return Mock()

            user_doc.collection.side_effect = _sub_router
            return user_doc

        coll.document.side_effect = _doc_router
        return coll

    db.collection.side_effect = _collection_router
    return db, q_contact_ref, prefs_ref


@pytest.mark.unit
def test_dismiss_wrong_company_adds_to_blocklist():
    """Dismiss with 'wrong_company' → company added to blocklist.companies."""
    queue_data = {
        "status": "pending",
        "company": "Goldman Sachs",
        "title": "Analyst",
    }
    db, q_ref, prefs_ref = _build_dismiss_db(queue_data)

    result = dismiss_queue_contact(
        db=db, uid="uid1", queue_id="q1", contact_id="qc1", reason=DISMISS_WRONG_COMPANY
    )

    assert result["ok"] is True
    q_ref.update.assert_called_once()
    update_args = q_ref.update.call_args[0][0]
    assert update_args["status"] == "dismissed"
    assert update_args["dismissReason"] == DISMISS_WRONG_COMPANY

    # Blocklist update: one update call with normalized company
    prefs_update_calls = prefs_ref.update.call_args_list
    assert len(prefs_update_calls) == 1
    update_payload = prefs_update_calls[0][0][0]
    assert "blocklist.companies" in update_payload


@pytest.mark.unit
def test_dismiss_wrong_person_adds_title_to_blocklist():
    queue_data = {
        "status": "pending",
        "company": "Acme",
        "title": "Managing Director",
    }
    db, q_ref, prefs_ref = _build_dismiss_db(queue_data)

    result = dismiss_queue_contact(
        db=db, uid="uid1", queue_id="q1", contact_id="qc1", reason=DISMISS_WRONG_PERSON
    )

    assert result["ok"] is True
    prefs_update_calls = prefs_ref.update.call_args_list
    assert len(prefs_update_calls) == 1
    update_payload = prefs_update_calls[0][0][0]
    assert "blocklist.titles" in update_payload
    assert "blocklist.companies" not in update_payload


@pytest.mark.unit
def test_dismiss_not_now_does_not_touch_blocklist():
    queue_data = {"status": "pending", "company": "Acme", "title": "Analyst"}
    db, q_ref, prefs_ref = _build_dismiss_db(queue_data)

    result = dismiss_queue_contact(
        db=db, uid="uid1", queue_id="q1", contact_id="qc1", reason=DISMISS_NOT_NOW
    )

    assert result["ok"] is True
    q_ref.update.assert_called_once()
    # Blocklist never updated
    prefs_ref.update.assert_not_called()


@pytest.mark.unit
def test_dismiss_invalid_reason_rejected():
    db = Mock()
    result = dismiss_queue_contact(
        db=db, uid="uid1", queue_id="q1", contact_id="qc1", reason="bogus_reason"
    )
    assert result["ok"] is False
    assert "Invalid reason" in result["error"]


@pytest.mark.unit
def test_dismiss_idempotent_already_dismissed():
    queue_data = {"status": "dismissed"}
    db, q_ref, prefs_ref = _build_dismiss_db(queue_data)

    result = dismiss_queue_contact(
        db=db, uid="uid1", queue_id="q1", contact_id="qc1", reason=DISMISS_NOT_NOW
    )

    assert result["ok"] is True
    assert result["already"] is True
    q_ref.update.assert_not_called()


# ---------------------------------------------------------------------------
# Background generation - zero results and failure refund
# ---------------------------------------------------------------------------


def _build_generate_db():
    """
    Full mock wiring for generate_queue_background. Returns (db, queue_ref,
    contacts_ref_queue, contacts_ref_user, prefs_ref).
    """
    db = Mock()
    queue_ref = Mock()
    contacts_ref_queue = Mock()
    contacts_ref_user = Mock()
    prefs_ref = Mock()

    # prefs snap returns empty (defaults apply)
    prefs_snap = Mock()
    prefs_snap.exists = False
    prefs_ref.get.return_value = prefs_snap

    queue_contacts_add_doc = Mock()
    queue_contacts_add_doc.id = "qc-new"
    contacts_ref_queue.add.return_value = queue_contacts_add_doc
    queue_ref.collection.return_value = contacts_ref_queue

    # users/{uid}/contacts (for _fetch_existing_contact_keys) returns empty stream
    contacts_ref_user.stream.return_value = iter([])

    def _collection_router(name):
        coll = Mock()

        def _doc_router(uid):
            user_doc = Mock()

            def _sub_router(sub):
                if sub == "weekly_queues":
                    wq = Mock()
                    wq.document = Mock(return_value=queue_ref)
                    return wq
                if sub == "settings":
                    s = Mock()
                    s.document = Mock(return_value=prefs_ref)
                    return s
                if sub == "contacts":
                    return contacts_ref_user
                return Mock()

            user_doc.collection.side_effect = _sub_router
            return user_doc

        coll.document.side_effect = _doc_router
        return coll

    db.collection.side_effect = _collection_router
    return db, queue_ref, contacts_ref_queue, contacts_ref_user, prefs_ref


@pytest.mark.unit
@patch("app.services.queue_service.refund_credits_atomic", return_value=(True, 100))
@patch("app.services.queue_service.search_contacts_with_smart_location_strategy", return_value=[])
@patch("app.services.queue_service.get_db")
def test_background_zero_results_refunds_credits(mock_get_db, _mock_search, mock_refund):
    """PDL returns 0 → credits refunded, queue marked completed_partial with 0 contacts."""
    db, queue_ref, _qc, _cu, _prefs = _build_generate_db()
    mock_get_db.return_value = db

    generate_queue_background(
        uid="uid1",
        queue_id="q1",
        filters={"company": "Acme", "titleKeywords": "Analyst", "university": "USC"},
        user_profile={},
        resume_text="",
        credits_charged_on_start=QUEUE_GENERATION_CREDITS,
    )

    mock_refund.assert_called_once()
    # Verify the queue doc was updated with zero-results status
    update_calls = queue_ref.update.call_args_list
    final_updates = [c[0][0] for c in update_calls if "status" in c[0][0]]
    assert any(u["status"] == STATUS_COMPLETED_PARTIAL for u in final_updates)


@pytest.mark.unit
@patch("app.services.queue_service.refund_credits_atomic", return_value=(True, 100))
@patch(
    "app.services.queue_service.search_contacts_with_smart_location_strategy",
    side_effect=Exception("PDL 500"),
)
@patch("app.services.queue_service.get_db")
def test_background_pdl_failure_refunds_credits(mock_get_db, _mock_search, mock_refund):
    """PDL raises → credits refunded, queue marked failed_pdl."""
    db, queue_ref, _qc, _cu, _prefs = _build_generate_db()
    mock_get_db.return_value = db

    generate_queue_background(
        uid="uid1",
        queue_id="q1",
        filters={"company": "Acme"},
        user_profile={},
        resume_text="",
        credits_charged_on_start=QUEUE_GENERATION_CREDITS,
    )

    mock_refund.assert_called_once()
    # Find the failure update
    update_calls = queue_ref.update.call_args_list
    statuses = [c[0][0].get("status") for c in update_calls if "status" in c[0][0]]
    assert "failed_pdl" in statuses


@pytest.mark.unit
@patch("app.services.queue_service.refund_credits_atomic", return_value=(True, 100))
@patch("app.services.queue_service.search_contacts_with_smart_location_strategy")
@patch("app.services.queue_service.get_db")
def test_background_all_filtered_refunds_credits(mock_get_db, mock_search, mock_refund):
    """
    PDL returns candidates, but all are filtered by dedup → refund + partial status.
    """
    db, queue_ref, _qc, contacts_ref_user, _prefs = _build_generate_db()
    mock_get_db.return_value = db

    # Existing contact matches candidate's email
    existing_doc = _make_doc("c1", {"pdlId": "", "email": "john@acme.com"})
    contacts_ref_user.stream.return_value = iter([existing_doc])

    mock_search.return_value = [_candidate(pdl_id="pdl-new", email="john@acme.com")]

    generate_queue_background(
        uid="uid1",
        queue_id="q1",
        filters={"company": "Acme"},
        user_profile={},
        resume_text="",
        credits_charged_on_start=QUEUE_GENERATION_CREDITS,
    )

    mock_refund.assert_called_once()
    statuses = [
        c[0][0].get("status")
        for c in queue_ref.update.call_args_list
        if "status" in c[0][0]
    ]
    assert STATUS_COMPLETED_PARTIAL in statuses


@pytest.mark.unit
@patch("app.services.queue_service.refund_credits_atomic", return_value=(True, 100))
@patch("app.services.queue_service.batch_generate_emails")
@patch("app.services.queue_service.score_contacts_for_email", return_value={})
@patch("app.services.queue_service.search_contacts_with_smart_location_strategy")
@patch("app.services.queue_service.get_db")
def test_background_email_generation_failure_refunds(
    mock_get_db, mock_search, _mock_score, mock_batch, mock_refund
):
    """batch_generate_emails raises → credits refunded, status failed_emails."""
    db, queue_ref, _qc, _cu, _prefs = _build_generate_db()
    mock_get_db.return_value = db

    mock_search.return_value = [
        _candidate(pdl_id=f"pdl-{i}", email=f"u{i}@acme.com", first=f"U{i}") for i in range(5)
    ]
    mock_batch.side_effect = Exception("OpenAI down")

    generate_queue_background(
        uid="uid1",
        queue_id="q1",
        filters={"company": "Acme"},
        user_profile={},
        resume_text="",
        credits_charged_on_start=QUEUE_GENERATION_CREDITS,
    )

    mock_refund.assert_called_once()
    statuses = [
        c[0][0].get("status")
        for c in queue_ref.update.call_args_list
        if "status" in c[0][0]
    ]
    assert "failed_emails" in statuses


@pytest.mark.unit
@patch("app.services.queue_service.batch_generate_emails")
@patch("app.services.queue_service.score_contacts_for_email", return_value={})
@patch("app.services.queue_service.search_contacts_with_smart_location_strategy")
@patch("app.services.queue_service.get_db")
def test_background_happy_path_writes_5_contacts(
    mock_get_db, mock_search, _mock_score, mock_batch
):
    """Full happy path: 5 candidates → 5 emails → 5 queue contacts → pending_review."""
    db, queue_ref, qc_ref, _cu, _prefs = _build_generate_db()
    mock_get_db.return_value = db

    mock_search.return_value = [
        _candidate(pdl_id=f"pdl-{i}", email=f"u{i}@acme.com", first=f"U{i}") for i in range(5)
    ]
    mock_batch.return_value = {
        i: {"subject": f"Subj {i}", "body": f"Body {i}"} for i in range(5)
    }

    generate_queue_background(
        uid="uid1",
        queue_id="q1",
        filters={"company": "Acme", "titleKeywords": "Analyst", "university": "USC"},
        user_profile={},
        resume_text="",
        credits_charged_on_start=QUEUE_GENERATION_CREDITS,
    )

    # 5 contacts added to the queue subcollection
    assert qc_ref.add.call_count == QUEUE_CONTACT_COUNT

    # Final status should be pending_review
    statuses = [
        c[0][0].get("status")
        for c in queue_ref.update.call_args_list
        if "status" in c[0][0]
    ]
    assert STATUS_PENDING_REVIEW in statuses

    # Each queue contact doc has the expected shape
    first_written = qc_ref.add.call_args_list[0][0][0]
    assert "pdlId" in first_written
    assert "email" in first_written
    assert "firstName" in first_written
    assert "draftSubject" in first_written
    assert "draftBody" in first_written
    assert first_written["status"] == "pending"


# ---------------------------------------------------------------------------
# get_current_queue - skips archived
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_get_current_queue_skips_archived():
    """Archived queues are skipped; next most recent non-archived is returned."""
    db = Mock()
    queues_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = queues_ref

    archived = _make_doc("q-archived", {"status": STATUS_ARCHIVED, "generatedAt": _iso(_now())})
    current = _make_doc(
        "q-current",
        {"status": STATUS_PENDING_REVIEW, "generatedAt": _iso(_now() - timedelta(days=1))},
    )
    current.reference.collection.return_value.stream.return_value = iter([])

    query = Mock()
    queues_ref.order_by.return_value = query
    query.limit.return_value = query
    query.stream.return_value = iter([archived, current])

    result = get_current_queue(db, "uid1")

    assert result is not None
    assert result["id"] == "q-current"
    assert result["status"] == STATUS_PENDING_REVIEW


@pytest.mark.unit
def test_get_current_queue_none_when_empty():
    db = Mock()
    queues_ref = Mock()
    db.collection.return_value.document.return_value.collection.return_value = queues_ref

    query = Mock()
    queues_ref.order_by.return_value = query
    query.limit.return_value = query
    query.stream.return_value = iter([])

    result = get_current_queue(db, "uid1")
    assert result is None


# ---------------------------------------------------------------------------
# Queue scanner gate (C2 coordination PR - daemon contract)
# ---------------------------------------------------------------------------
#
# Contract: docs/designs/tracker-daemon-contract.md
# Rule: scanner runs if today is Tuesday UTC OR the last successful run was
# more than 6d 20h ago. First-ever boot on a non-Tuesday must NOT fire.

def _system_scanner_doc_mock(last_success_iso=None, exists=True):
    """Wire up a mock Firestore db that returns a system/queue_scanner doc."""
    db = Mock()
    doc = Mock()
    doc.exists = exists
    if exists and last_success_iso is not None:
        doc.to_dict.return_value = {"lastSuccessAt": last_success_iso}
    else:
        doc.to_dict.return_value = {}
    db.collection.return_value.document.return_value.get.return_value = doc
    return db


@pytest.mark.unit
def test_queue_scanner_gate_constants_match_contract():
    """Guard against silent drift of the Tuesday / 6d20h constants."""
    assert QUEUE_TUESDAY_WEEKDAY == 1  # datetime.weekday(): Tue=1
    assert QUEUE_STALENESS_SECONDS == (6 * 24 + 20) * 3600


@pytest.mark.unit
def test_queue_scanner_gate_tuesday_always_runs():
    """Tuesday UTC → gate opens regardless of last success."""
    db = _system_scanner_doc_mock(exists=False)
    tue = datetime(2026, 4, 14, 10, 0, 0, tzinfo=timezone.utc)  # Tue
    assert tue.weekday() == 1
    assert _should_run_queue_scanner(db, now=tue) is True


@pytest.mark.unit
def test_queue_scanner_gate_non_tuesday_first_boot_does_not_fire():
    """
    First-ever boot on a non-Tuesday must NOT fire - that would push the
    Monday-after-deploy queue a day early. Per contract line rationale.
    """
    db = _system_scanner_doc_mock(exists=False)
    wed = datetime(2026, 4, 15, 10, 0, 0, tzinfo=timezone.utc)  # Wed
    assert wed.weekday() == 2
    assert _should_run_queue_scanner(db, now=wed) is False


@pytest.mark.unit
def test_queue_scanner_gate_non_tuesday_fresh_run_skips():
    """Not Tuesday, last run 2 days ago → gate closed."""
    now = datetime(2026, 4, 15, 10, 0, 0, tzinfo=timezone.utc)  # Wed
    last = (now - timedelta(days=2)).isoformat().replace("+00:00", "Z")
    db = _system_scanner_doc_mock(last_success_iso=last)
    assert _should_run_queue_scanner(db, now=now) is False


@pytest.mark.unit
def test_queue_scanner_gate_non_tuesday_stale_recovers():
    """Not Tuesday, last run > 6d20h ago → gate opens (recovery path)."""
    now = datetime(2026, 4, 15, 10, 0, 0, tzinfo=timezone.utc)  # Wed
    last = (now - timedelta(days=7, hours=1)).isoformat().replace("+00:00", "Z")
    db = _system_scanner_doc_mock(last_success_iso=last)
    assert _should_run_queue_scanner(db, now=now) is True


@pytest.mark.unit
def test_queue_scanner_gate_db_error_fails_closed():
    """A Firestore error during the gate check must default to NOT running."""
    db = Mock()
    db.collection.return_value.document.return_value.get.side_effect = \
        Exception("firestore down")
    wed = datetime(2026, 4, 15, 10, 0, 0, tzinfo=timezone.utc)
    # Must not raise, must return False to be safe
    assert _should_run_queue_scanner(db, now=wed) is False


# ---------------------------------------------------------------------------
# Queue scanner health doc
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_queue_scanner_health_doc_fields_match_contract():
    """
    Health doc must contain the exact fields the watchdog + dashboards read.
    Contract: docs/designs/tracker-daemon-contract.md §health doc schema.
    """
    db = Mock()
    system_doc_ref = Mock()
    db.collection.return_value.document.return_value = system_doc_ref

    _write_queue_scanner_health(
        db,
        users_processed=42,
        queues_generated=7,
        error_count=2,
        duration_ms=1234,
    )

    # system/queue_scanner.set({...}) called once
    system_doc_ref.set.assert_called_once()
    payload = system_doc_ref.set.call_args[0][0]

    # Contract-required fields
    assert "lastSuccessAt" in payload
    assert payload["lastDurationMs"] == 1234
    assert payload["usersProcessed"] == 42
    assert payload["queuesGenerated"] == 7
    assert payload["errorCount"] == 2
    # ISO8601 with Z suffix
    assert payload["lastSuccessAt"].endswith("Z")


@pytest.mark.unit
def test_queue_scanner_health_doc_targets_system_collection():
    """Health doc is written to `system/queue_scanner`, per contract."""
    db = Mock()
    system_coll = Mock()
    db.collection.return_value = system_coll

    _write_queue_scanner_health(
        db, users_processed=0, queues_generated=0, error_count=0, duration_ms=0,
    )

    # Called as db.collection("system").document("queue_scanner").set(...)
    db.collection.assert_called_with("system")
    system_coll.document.assert_called_with("queue_scanner")


@pytest.mark.unit
def test_queue_scanner_health_doc_write_failure_is_swallowed():
    """Health doc write failure must NOT raise (daemon keeps going)."""
    db = Mock()
    db.collection.return_value.document.return_value.set.side_effect = \
        Exception("firestore write error")
    # Must not raise
    _write_queue_scanner_health(
        db, users_processed=1, queues_generated=1, error_count=0, duration_ms=1,
    )


# ---------------------------------------------------------------------------
# scan_and_generate_queues - entry point wiring
# ---------------------------------------------------------------------------

@pytest.mark.unit
@patch("app.services.queue_service.get_db", return_value=None)
def test_scan_and_generate_queues_no_db_returns_silently(_mock_db):
    """No db client → return silently; no raise, no infinite loop."""
    scan_and_generate_queues()  # must not raise


@pytest.mark.unit
@patch("app.services.queue_service._should_run_queue_scanner", return_value=False)
@patch("app.services.queue_service.get_db")
def test_scan_and_generate_queues_gate_closed_skips_everything(
    mock_get_db, _mock_gate,
):
    """
    Gate closed → must not iterate users and must not write health doc
    (a skipped run is not a successful run).
    """
    db = Mock()
    mock_get_db.return_value = db
    users_coll = Mock()
    db.collection.return_value = users_coll

    scan_and_generate_queues()

    users_coll.stream.assert_not_called()


@pytest.mark.unit
@patch("app.services.queue_service._should_run_queue_scanner", return_value=True)
@patch("app.services.queue_service.get_db")
def test_scan_and_generate_queues_writes_health_on_success(
    mock_get_db, _mock_gate,
):
    """Gate open, no users → health doc still written with zero counters."""
    db = Mock()
    mock_get_db.return_value = db
    # users collection: empty stream
    users_coll = Mock()
    users_coll.stream.return_value = iter([])
    # system/queue_scanner ref (for health doc write)
    system_doc = Mock()

    def _collection(name):
        if name == "users":
            return users_coll
        if name == "system":
            coll = Mock()
            coll.document.return_value = system_doc
            return coll
        return Mock()

    db.collection.side_effect = _collection

    scan_and_generate_queues()

    system_doc.set.assert_called_once()
    payload = system_doc.set.call_args[0][0]
    assert payload["usersProcessed"] == 0
    assert payload["queuesGenerated"] == 0
    assert payload["errorCount"] == 0


@pytest.mark.unit
@patch("app.services.queue_service._should_run_queue_scanner", return_value=True)
@patch("app.services.queue_service.is_queue_feature_enabled", return_value=False)
@patch("app.services.queue_service.get_db")
def test_scan_skips_free_tier_users(
    mock_get_db, _mock_enabled, _mock_gate,
):
    """Free-tier users → skipped (no queue eligibility)."""
    db = Mock()
    mock_get_db.return_value = db

    user_doc = Mock()
    user_doc.id = "free-uid"
    user_doc.to_dict.return_value = {"subscriptionTier": "free"}

    users_coll = Mock()
    users_coll.stream.return_value = iter([user_doc])
    system_doc = Mock()

    def _collection(name):
        if name == "users":
            return users_coll
        if name == "system":
            coll = Mock()
            coll.document.return_value = system_doc
            return coll
        return Mock()

    db.collection.side_effect = _collection

    scan_and_generate_queues()

    # Free user counted as processed but not eligible
    payload = system_doc.set.call_args[0][0]
    assert payload["usersProcessed"] == 1
    assert payload["queuesGenerated"] == 0


@pytest.mark.unit
@patch("app.services.queue_service._should_run_queue_scanner", return_value=True)
@patch("app.services.queue_service.is_free_weekly_eligible", return_value=True)
@patch("app.services.queue_service.get_queue_preferences", return_value={"enabled": True})
@patch("app.services.queue_service.is_queue_feature_enabled", return_value=True)
@patch("app.services.queue_service.get_db")
def test_scan_counts_eligible_pro_user(
    mock_get_db, _m_enabled, _m_prefs, _m_weekly, _m_gate,
):
    """Pro user, enabled, not paused, free-weekly eligible → counted."""
    db = Mock()
    mock_get_db.return_value = db

    user_doc = Mock()
    user_doc.id = "pro-uid"
    user_doc.to_dict.return_value = {"subscriptionTier": "pro"}

    users_coll = Mock()
    users_coll.stream.return_value = iter([user_doc])
    system_doc = Mock()

    def _collection(name):
        if name == "users":
            return users_coll
        if name == "system":
            coll = Mock()
            coll.document.return_value = system_doc
            return coll
        return Mock()

    db.collection.side_effect = _collection

    scan_and_generate_queues()

    payload = system_doc.set.call_args[0][0]
    assert payload["usersProcessed"] == 1
    assert payload["queuesGenerated"] == 1


@pytest.mark.unit
@patch("app.services.queue_service._should_run_queue_scanner", return_value=True)
@patch("app.services.queue_service.is_queue_feature_enabled", side_effect=Exception("boom"))
@patch("app.services.queue_service.get_db")
def test_scan_per_user_error_does_not_kill_scan(
    mock_get_db, _m_enabled, _m_gate,
):
    """One bad user doc → error_count increments, scan continues, health written."""
    db = Mock()
    mock_get_db.return_value = db

    bad_user = Mock()
    bad_user.id = "bad-uid"
    bad_user.to_dict.return_value = {"subscriptionTier": "pro"}
    good_user = Mock()
    good_user.id = "good-uid"
    good_user.to_dict.return_value = {"subscriptionTier": "pro"}

    users_coll = Mock()
    users_coll.stream.return_value = iter([bad_user, good_user])
    system_doc = Mock()

    def _collection(name):
        if name == "users":
            return users_coll
        if name == "system":
            coll = Mock()
            coll.document.return_value = system_doc
            return coll
        return Mock()

    db.collection.side_effect = _collection

    scan_and_generate_queues()  # must not raise

    payload = system_doc.set.call_args[0][0]
    # Both users attempted
    assert payload["usersProcessed"] == 2
    # Both raised via is_queue_feature_enabled side_effect
    assert payload["errorCount"] == 2
