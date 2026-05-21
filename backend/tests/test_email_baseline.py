"""Tests for email_baseline service (A0 baseline reply rate measurement)."""
import pytest
import os
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services.email_baseline import (
    AGGREGATION_HOUR_END,
    AGGREGATION_HOUR_START,
    AGGREGATION_STALENESS_SECONDS,
    AGGREGATION_SUNDAY_WEEKDAY,
    compute_email_baseline,
    aggregate_email_outcomes,
    ELIGIBLE_STAGES,
    _classify_industry,
    _make_segment_key,
    _should_run_aggregation_scanner,
    _write_aggregation_scanner_health,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_contact(stage, email_sent_at=None, reply_received_at=None):
    """Build a mock contact dict."""
    data = {"pipelineStage": stage}
    if email_sent_at:
        data["emailSentAt"] = email_sent_at
    if reply_received_at:
        data["replyReceivedAt"] = reply_received_at
    return data


def _make_firestore_doc(doc_id, data):
    """Build a mock Firestore document."""
    doc = MagicMock()
    doc.id = doc_id
    doc.to_dict.return_value = data
    doc.exists = True
    return doc


def _build_mock_db(users):
    """
    Build a mock Firestore db from a list of user specs.

    Each user spec: {
        "uid": str,
        "user_data": dict (user doc fields),
        "has_gmail": bool,
        "contacts": [dict] (contact data dicts),
    }
    """
    db = MagicMock()

    # Build user docs
    user_docs = []
    for u in users:
        user_docs.append(_make_firestore_doc(u["uid"], u.get("user_data", {})))

    # Track subcollection lookups
    gmail_docs = {}
    contact_streams = {}
    for u in users:
        uid = u["uid"]
        gmail_doc = MagicMock()
        gmail_doc.exists = u.get("has_gmail", False)
        gmail_doc.to_dict.return_value = (
            {"token": "tok", "refresh_token": "ref"} if u.get("has_gmail") else {}
        )
        gmail_docs[uid] = gmail_doc

        # Contact docs
        c_docs = []
        for i, c_data in enumerate(u.get("contacts", [])):
            c_docs.append(_make_firestore_doc(f"contact_{i}", c_data))
        contact_streams[uid] = c_docs

    # Wire up db.collection("users").stream()
    users_collection = MagicMock()
    users_collection.stream.return_value = iter(user_docs)

    # Wire up subcollections per user
    def collection_side_effect(name):
        if name == "users":
            return users_collection
        if name == "analytics":
            analytics_col = MagicMock()
            analytics_col.document.return_value = MagicMock()
            return analytics_col
        return MagicMock()

    db.collection.side_effect = collection_side_effect

    # Wire up db.collection("users").document(uid).collection(...)
    def user_document(uid):
        user_doc_ref = MagicMock()

        def user_subcollection(sub_name):
            if sub_name == "integrations":
                integrations = MagicMock()
                def gmail_document(doc_name):
                    if doc_name == "gmail":
                        gmail_ref = MagicMock()
                        gmail_ref.get.return_value = gmail_docs.get(uid, MagicMock(exists=False))
                        return gmail_ref
                    return MagicMock()
                integrations.document.side_effect = gmail_document
                return integrations
            elif sub_name == "contacts":
                contacts_col = MagicMock()
                contacts_col.stream.return_value = iter(contact_streams.get(uid, []))
                return contacts_col
            return MagicMock()

        user_doc_ref.collection.side_effect = user_subcollection
        return user_doc_ref

    users_collection.document.side_effect = user_document

    return db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestComputeEmailBaseline:

    @patch("app.services.email_baseline.get_db")
    def test_empty_database(self, mock_get_db):
        """No users at all returns zero metrics."""
        db = _build_mock_db([])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["usersWithGmail"] == 0
        assert result["sampleSize"]["totalEligible"] == 0
        assert result["metrics"]["replyRate"] == 0.0
        assert result["metrics"]["avgResponseTimeHours"] is None

    @patch("app.services.email_baseline.get_db")
    def test_users_without_gmail_skipped(self, mock_get_db):
        """Users without Gmail integration are not sampled."""
        db = _build_mock_db([
            {"uid": "u1", "has_gmail": False, "contacts": [
                _make_contact("email_sent", "2026-03-01T12:00:00Z"),
            ]},
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["usersWithGmail"] == 0
        assert result["sampleSize"]["totalContactsEmailed"] == 0

    @patch("app.services.email_baseline.get_db")
    def test_basic_reply_rate(self, mock_get_db):
        """Two contacts: one replied, one waiting. Reply rate should be 50%."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "user_data": {"subscriptionTier": "pro"},
                "contacts": [
                    _make_contact("replied", "2026-03-01T12:00:00Z", "2026-03-02T12:00:00Z"),
                    _make_contact("email_sent", "2026-03-01T12:00:00Z"),
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["usersWithGmail"] == 1
        assert result["sampleSize"]["usersWithEmails"] == 1
        assert result["sampleSize"]["totalEligible"] == 2
        assert result["metrics"]["replyRate"] == 0.5
        assert result["metrics"]["totalReplied"] == 1

    @patch("app.services.email_baseline.get_db")
    def test_response_time_calculation(self, mock_get_db):
        """Average response time computed from sent-to-reply delta."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    _make_contact("replied", "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z"),  # 24h
                    _make_contact("replied", "2026-03-01T00:00:00Z", "2026-03-03T00:00:00Z"),  # 48h
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["metrics"]["avgResponseTimeHours"] == 36.0  # avg of 24 and 48
        assert result["metrics"]["responseTimeSampleSize"] == 2

    @patch("app.services.email_baseline.get_db")
    def test_meeting_rate(self, mock_get_db):
        """Meeting rate: meetings / (replied + meetings)."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    _make_contact("replied", "2026-03-01T00:00:00Z"),
                    _make_contact("meeting_scheduled", "2026-03-01T00:00:00Z"),
                    _make_contact("connected", "2026-03-01T00:00:00Z"),
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        # meeting_scheduled(1) + connected(1) = 2 meetings
        # replied(1) + meeting_scheduled(1) + connected(1) = 3 replied_denom
        assert result["metrics"]["meetingRate"] == round(2 / 3, 4)

    @patch("app.services.email_baseline.get_db")
    def test_tier_breakdown(self, mock_get_db):
        """Per-tier stats are computed correctly."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "user_data": {"subscriptionTier": "pro"},
                "contacts": [
                    _make_contact("replied", "2026-03-01T00:00:00Z"),
                    _make_contact("email_sent", "2026-03-01T00:00:00Z"),
                ],
            },
            {
                "uid": "u2",
                "has_gmail": True,
                "user_data": {"tier": "free"},  # legacy field
                "contacts": [
                    _make_contact("no_response", "2026-03-01T00:00:00Z"),
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert "pro" in result["tierBreakdown"]
        assert "free" in result["tierBreakdown"]
        assert result["tierBreakdown"]["pro"]["replyRate"] == 0.5
        assert result["tierBreakdown"]["free"]["replyRate"] == 0.0

    @patch("app.services.email_baseline.get_db")
    def test_contacts_without_email_sent_skipped(self, mock_get_db):
        """Contacts with no emailSentAt are not counted."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    _make_contact("new"),  # no emailSentAt
                    _make_contact("draft_created"),  # no emailSentAt
                    _make_contact("email_sent", "2026-03-01T00:00:00Z"),
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["totalContactsEmailed"] == 1
        assert result["sampleSize"]["totalEligible"] == 1

    @patch("app.services.email_baseline.get_db")
    def test_bias_field_present(self, mock_get_db):
        """Result includes bias acknowledgment."""
        db = _build_mock_db([])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert "bias" in result
        assert "Gmail" in result["bias"]

    @patch("app.services.email_baseline.get_db")
    def test_measured_at_timestamp(self, mock_get_db):
        """Result includes ISO timestamp."""
        db = _build_mock_db([])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert "measuredAt" in result
        assert "Z" in result["measuredAt"]

    @patch("app.services.email_baseline.get_db")
    def test_firestore_write(self, mock_get_db):
        """Baseline is written to analytics/email_baseline."""
        db = _build_mock_db([])
        mock_get_db.return_value = db

        compute_email_baseline()

        # Verify the set() call on the analytics document
        db.collection.assert_any_call("analytics")


# ---------------------------------------------------------------------------
# _classify_industry
# ---------------------------------------------------------------------------

class TestClassifyIndustry:

    def test_goldman_sachs_analyst_is_investment_banking(self):
        """Goldman Sachs + Analyst should hit investment_banking, not finance."""
        assert _classify_industry("Goldman Sachs", "Analyst") == "investment_banking"

    def test_mckinsey_consultant_is_consulting(self):
        assert _classify_industry("McKinsey", "Consultant") == "consulting"

    def test_google_swe_is_tech(self):
        assert _classify_industry("Google", "Software Engineer") == "tech"

    def test_blackstone_vp_is_private_equity(self):
        """Blackstone is a known PE firm in the unified industry classifier."""
        assert _classify_industry("Blackstone", "VP") == "private_equity"

    def test_private_equity_in_title_is_pe(self):
        """Explicit 'Private Equity' in title maps to private_equity."""
        assert _classify_industry("Blackstone", "Private Equity Analyst") == "private_equity"

    def test_unknown_company_is_other(self):
        assert _classify_industry("Acme Corp", "Manager") == "other"

    def test_case_insensitive(self):
        assert _classify_industry("GOLDMAN SACHS", "ANALYST") == "investment_banking"

    def test_keyword_in_title_only(self):
        """A consulting title at a generic company should match consulting."""
        assert _classify_industry("Some Firm", "Strategy Consultant") == "consulting"


# ---------------------------------------------------------------------------
# _make_segment_key
# ---------------------------------------------------------------------------

class TestMakeSegmentKey:

    def test_normal_input(self):
        assert _make_segment_key("industry", "consulting") == "industry:consulting"

    def test_empty_value_becomes_unknown(self):
        assert _make_segment_key("industry", "") == "industry:unknown"

    def test_none_value_becomes_unknown(self):
        assert _make_segment_key("industry", None) == "industry:unknown"

    def test_long_value_truncated_to_60(self):
        long_val = "a" * 100
        result = _make_segment_key("school", long_val)
        # dimension: + 60 chars
        assert result == f"school:{'a' * 60}"
        assert len(result) == len("school:") + 60

    def test_whitespace_trimmed(self):
        assert _make_segment_key("school", "  USC  ") == "school:usc"

    def test_uppercased_value_lowered(self):
        assert _make_segment_key("industry", "TECH") == "industry:tech"


# ---------------------------------------------------------------------------
# Dimensional segments (analytics/email_outcomes)
# ---------------------------------------------------------------------------

class TestDimensionalSegments:

    @patch("app.services.email_baseline.get_db")
    def test_segments_written_to_email_outcomes(self, mock_get_db):
        """Segment data should be written to analytics/email_outcomes."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "user_data": {"academics": {"university": "USC"}},
                "contacts": [
                    {
                        "pipelineStage": "replied",
                        "emailSentAt": "2026-03-01T12:00:00Z",
                        "replyReceivedAt": "2026-03-02T12:00:00Z",
                        "company": "McKinsey",
                        "jobTitle": "Consultant",
                        "college": "Stanford",
                    },
                    {
                        "pipelineStage": "email_sent",
                        "emailSentAt": "2026-03-01T12:00:00Z",
                        "company": "Google",
                        "jobTitle": "Software Engineer",
                        "college": "",
                    },
                ],
            },
        ])
        mock_get_db.return_value = db

        # We need to capture the set() call on email_outcomes
        outcomes_doc = MagicMock()
        baseline_doc = MagicMock()

        def analytics_document(name):
            if name == "email_outcomes":
                return outcomes_doc
            if name == "email_baseline":
                return baseline_doc
            return MagicMock()

        # Rewire the analytics collection to capture document calls
        analytics_col = MagicMock()
        analytics_col.document.side_effect = analytics_document

        original_side_effect = db.collection.side_effect

        def patched_collection(name):
            if name == "analytics":
                return analytics_col
            return original_side_effect(name)

        db.collection.side_effect = patched_collection

        compute_email_baseline()

        # Verify email_outcomes document was written
        outcomes_doc.set.assert_called_once()
        written = outcomes_doc.set.call_args[0][0]

        assert "segments" in written
        assert "segmentCount" in written
        assert "measuredAt" in written

        segments = written["segments"]

        # Should have industry segments
        assert "industry:consulting" in segments
        assert "industry:tech" in segments

        # Consulting contact replied, tech did not
        assert segments["industry:consulting"]["replyCount"] == 1
        assert segments["industry:consulting"]["totalSent"] == 1
        assert segments["industry:tech"]["replyCount"] == 0
        assert segments["industry:tech"]["totalSent"] == 1

        # Should have user_school segment for USC
        assert "user_school:usc" in segments
        assert segments["user_school:usc"]["totalSent"] == 2

        # Should have contact_school for Stanford (first contact only)
        assert "contact_school:stanford" in segments
        assert segments["contact_school:stanford"]["totalSent"] == 1


# ---------------------------------------------------------------------------
# emailGeneratedAt fallback
# ---------------------------------------------------------------------------

class TestEmailGeneratedAtFallback:

    @patch("app.services.email_baseline.get_db")
    def test_emailGeneratedAt_preferred_over_emailSentAt(self, mock_get_db):
        """emailGeneratedAt should be read first when both fields exist."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    {
                        "pipelineStage": "replied",
                        "emailGeneratedAt": "2026-03-01T10:00:00Z",
                        "emailSentAt": "2026-03-01T12:00:00Z",
                        "replyReceivedAt": "2026-03-02T10:00:00Z",
                    },
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        # Contact should be counted (emailGeneratedAt is present)
        assert result["sampleSize"]["totalContactsEmailed"] == 1
        assert result["sampleSize"]["totalEligible"] == 1
        assert result["metrics"]["totalReplied"] == 1
        # Response time: reply at 2026-03-02T10:00 minus generated at 2026-03-01T10:00 = 24h
        assert result["metrics"]["avgResponseTimeHours"] == 24.0

    @patch("app.services.email_baseline.get_db")
    def test_falls_back_to_emailSentAt(self, mock_get_db):
        """When emailGeneratedAt is absent, emailSentAt is used."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    {
                        "pipelineStage": "replied",
                        "emailSentAt": "2026-03-01T12:00:00Z",
                        "replyReceivedAt": "2026-03-02T12:00:00Z",
                    },
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["totalContactsEmailed"] == 1
        assert result["metrics"]["totalReplied"] == 1
        # Response time: 24h based on emailSentAt
        assert result["metrics"]["avgResponseTimeHours"] == 24.0

    @patch("app.services.email_baseline.get_db")
    def test_neither_timestamp_skips_contact(self, mock_get_db):
        """If both emailGeneratedAt and emailSentAt are absent, contact is skipped."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "contacts": [
                    {
                        "pipelineStage": "email_sent",
                        # no emailGeneratedAt, no emailSentAt
                    },
                ],
            },
        ])
        mock_get_db.return_value = db

        result = compute_email_baseline()

        assert result["sampleSize"]["totalContactsEmailed"] == 0


# ---------------------------------------------------------------------------
# get_user_school integration
# ---------------------------------------------------------------------------

class TestGetUserSchoolIntegration:

    @patch("app.services.email_baseline.get_db")
    def test_reads_from_academics_university(self, mock_get_db):
        """User school from academics.university should appear in user_school segments."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "user_data": {"academics": {"university": "University of Michigan"}},
                "contacts": [
                    {
                        "pipelineStage": "email_sent",
                        "emailSentAt": "2026-03-01T12:00:00Z",
                        "company": "Acme",
                        "jobTitle": "Manager",
                    },
                ],
            },
        ])
        mock_get_db.return_value = db

        # Capture analytics write
        outcomes_doc = MagicMock()
        baseline_doc = MagicMock()

        def analytics_document(name):
            if name == "email_outcomes":
                return outcomes_doc
            if name == "email_baseline":
                return baseline_doc
            return MagicMock()

        analytics_col = MagicMock()
        analytics_col.document.side_effect = analytics_document
        original_side_effect = db.collection.side_effect

        def patched_collection(name):
            if name == "analytics":
                return analytics_col
            return original_side_effect(name)

        db.collection.side_effect = patched_collection

        compute_email_baseline()

        written = outcomes_doc.set.call_args[0][0]
        segments = written["segments"]
        assert "user_school:university of michigan" in segments

    @patch("app.services.email_baseline.get_db")
    def test_falls_back_to_resumeParsed_education(self, mock_get_db):
        """Falls back to resumeParsed.education.university."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "user_data": {
                    "resumeParsed": {"education": {"university": "NYU"}},
                },
                "contacts": [
                    {
                        "pipelineStage": "email_sent",
                        "emailSentAt": "2026-03-01T12:00:00Z",
                        "company": "Acme",
                        "jobTitle": "Manager",
                    },
                ],
            },
        ])
        mock_get_db.return_value = db

        outcomes_doc = MagicMock()
        baseline_doc = MagicMock()

        def analytics_document(name):
            if name == "email_outcomes":
                return outcomes_doc
            if name == "email_baseline":
                return baseline_doc
            return MagicMock()

        analytics_col = MagicMock()
        analytics_col.document.side_effect = analytics_document
        original_side_effect = db.collection.side_effect

        def patched_collection(name):
            if name == "analytics":
                return analytics_col
            return original_side_effect(name)

        db.collection.side_effect = patched_collection

        compute_email_baseline()

        written = outcomes_doc.set.call_args[0][0]
        segments = written["segments"]
        assert "user_school:nyu" in segments

    @patch("app.services.email_baseline.get_db")
    def test_no_school_omits_user_school_segment(self, mock_get_db):
        """If user has no school data, user_school segment should not appear."""
        db = _build_mock_db([
            {
                "uid": "u1",
                "has_gmail": True,
                "user_data": {},  # no school info
                "contacts": [
                    {
                        "pipelineStage": "email_sent",
                        "emailSentAt": "2026-03-01T12:00:00Z",
                        "company": "Acme",
                        "jobTitle": "Manager",
                    },
                ],
            },
        ])
        mock_get_db.return_value = db

        outcomes_doc = MagicMock()
        baseline_doc = MagicMock()

        def analytics_document(name):
            if name == "email_outcomes":
                return outcomes_doc
            if name == "email_baseline":
                return baseline_doc
            return MagicMock()

        analytics_col = MagicMock()
        analytics_col.document.side_effect = analytics_document
        original_side_effect = db.collection.side_effect

        def patched_collection(name):
            if name == "analytics":
                return analytics_col
            return original_side_effect(name)

        db.collection.side_effect = patched_collection

        compute_email_baseline()

        written = outcomes_doc.set.call_args[0][0]
        segments = written["segments"]
        # No key starting with "user_school:" should exist
        user_school_keys = [k for k in segments if k.startswith("user_school:")]
        assert user_school_keys == []


# ---------------------------------------------------------------------------
# Aggregation scanner gate (C2 coordination PR - daemon contract)
# ---------------------------------------------------------------------------
#
# Contract: docs/designs/tracker-daemon-contract.md
# Rule: scanner runs iff today is Sunday UTC AND current UTC hour is in
# [3, 9) AND the last successful run was more than 6 days ago. The AND
# gates give a narrow weekly window; the staleness check prevents multiple
# runs within the same 6-hour dispatch window.

def _aggregation_system_doc_mock(last_success_iso=None, exists=True):
    db = MagicMock()
    doc = MagicMock()
    doc.exists = exists
    if exists and last_success_iso is not None:
        doc.to_dict.return_value = {"lastSuccessAt": last_success_iso}
    else:
        doc.to_dict.return_value = {}
    db.collection.return_value.document.return_value.get.return_value = doc
    return db


class TestAggregationScannerGate:
    """Gate logic for aggregate_email_outcomes - Sunday AND 3-9am AND >6d."""

    def test_gate_constants_match_contract(self):
        assert AGGREGATION_SUNDAY_WEEKDAY == 6  # Sun=6
        assert AGGREGATION_HOUR_START == 3
        assert AGGREGATION_HOUR_END == 9
        assert AGGREGATION_STALENESS_SECONDS == 6 * 24 * 3600

    def test_non_sunday_returns_false(self):
        """Monday 5am UTC → no."""
        db = _aggregation_system_doc_mock(exists=False)
        mon = datetime(2026, 4, 13, 5, 0, 0, tzinfo=timezone.utc)
        assert mon.weekday() == 0
        assert _should_run_aggregation_scanner(db, now=mon) is False

    def test_sunday_before_window_returns_false(self):
        """Sunday 2am UTC - before 3am window."""
        db = _aggregation_system_doc_mock(exists=False)
        sun_early = datetime(2026, 4, 12, 2, 0, 0, tzinfo=timezone.utc)
        assert sun_early.weekday() == 6
        assert _should_run_aggregation_scanner(db, now=sun_early) is False

    def test_sunday_after_window_returns_false(self):
        """Sunday 9am UTC - AT the upper bound, half-open [3,9)."""
        db = _aggregation_system_doc_mock(exists=False)
        sun_nine = datetime(2026, 4, 12, 9, 0, 0, tzinfo=timezone.utc)
        assert _should_run_aggregation_scanner(db, now=sun_nine) is False

    def test_sunday_in_window_first_boot_fires(self):
        """Sunday 5am UTC, no prior run → run (first-ever)."""
        db = _aggregation_system_doc_mock(exists=False)
        sun = datetime(2026, 4, 12, 5, 0, 0, tzinfo=timezone.utc)
        assert _should_run_aggregation_scanner(db, now=sun) is True

    def test_sunday_in_window_fresh_run_skips(self):
        """Sunday 5am UTC, ran 3 days ago → skip (stale gate not met)."""
        now = datetime(2026, 4, 12, 5, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=3)).isoformat().replace("+00:00", "Z")
        db = _aggregation_system_doc_mock(last_success_iso=last)
        assert _should_run_aggregation_scanner(db, now=now) is False

    def test_sunday_in_window_stale_fires(self):
        """Sunday 5am UTC, ran 6d12h ago → run (stale gate met)."""
        now = datetime(2026, 4, 12, 5, 0, 0, tzinfo=timezone.utc)
        last = (now - timedelta(days=6, hours=12)).isoformat().replace("+00:00", "Z")
        db = _aggregation_system_doc_mock(last_success_iso=last)
        assert _should_run_aggregation_scanner(db, now=now) is True

    def test_db_error_fails_closed(self):
        """Firestore error during gate check → default False (don't raise)."""
        db = MagicMock()
        db.collection.return_value.document.return_value.get.side_effect = \
            Exception("boom")
        sun = datetime(2026, 4, 12, 5, 0, 0, tzinfo=timezone.utc)
        assert _should_run_aggregation_scanner(db, now=sun) is False

    def test_all_hours_in_window(self):
        """3am, 4am, ..., 8am UTC Sunday all fire with empty system doc."""
        db = _aggregation_system_doc_mock(exists=False)
        for hour in range(3, 9):
            sun = datetime(2026, 4, 12, hour, 0, 0, tzinfo=timezone.utc)
            assert _should_run_aggregation_scanner(db, now=sun) is True, (
                f"hour={hour} should open gate"
            )


# ---------------------------------------------------------------------------
# Aggregation scanner health doc
# ---------------------------------------------------------------------------

class TestAggregationScannerHealth:
    """Health doc fields match the daemon contract exactly."""

    def test_health_doc_fields_match_contract(self):
        db = MagicMock()
        system_doc = MagicMock()
        db.collection.return_value.document.return_value = system_doc

        _write_aggregation_scanner_health(
            db,
            contacts_scanned=9876,
            segments_written=42,
            doc_size_bytes=12345,
            error_count=0,
            duration_ms=5678,
        )

        system_doc.set.assert_called_once()
        payload = system_doc.set.call_args[0][0]
        # Contract-required fields
        assert payload["contactsScanned"] == 9876
        assert payload["segmentsWritten"] == 42
        assert payload["docSizeBytes"] == 12345
        assert payload["errorCount"] == 0
        assert payload["lastDurationMs"] == 5678
        assert "lastSuccessAt" in payload
        assert payload["lastSuccessAt"].endswith("Z")

    def test_health_doc_targets_aggregation_scanner_doc(self):
        db = MagicMock()
        system_coll = MagicMock()
        db.collection.return_value = system_coll

        _write_aggregation_scanner_health(
            db,
            contacts_scanned=0,
            segments_written=0,
            doc_size_bytes=0,
            error_count=0,
            duration_ms=0,
        )

        db.collection.assert_called_with("system")
        system_coll.document.assert_called_with("aggregation_scanner")

    def test_health_write_failure_does_not_raise(self):
        db = MagicMock()
        db.collection.return_value.document.return_value.set.side_effect = \
            Exception("firestore down")
        # Must not raise
        _write_aggregation_scanner_health(
            db,
            contacts_scanned=1,
            segments_written=1,
            doc_size_bytes=1,
            error_count=0,
            duration_ms=1,
        )


# ---------------------------------------------------------------------------
# aggregate_email_outcomes - scanner entry point
# ---------------------------------------------------------------------------

class TestAggregateEmailOutcomes:
    """Scanner entry point delegates to compute_email_baseline() when gated open."""

    @patch("app.services.email_baseline.get_db", return_value=None)
    def test_no_db_returns_silently(self, _mock_db):
        """No db client → bail silently, no raise."""
        aggregate_email_outcomes()  # must not raise

    @patch("app.services.email_baseline._should_run_aggregation_scanner", return_value=False)
    @patch("app.services.email_baseline.compute_email_baseline")
    @patch("app.services.email_baseline.get_db")
    def test_gate_closed_skips_compute(self, mock_db, mock_compute, _mock_gate):
        """Gate closed → never call compute_email_baseline, no health write."""
        db = MagicMock()
        mock_db.return_value = db
        system_doc = MagicMock()
        db.collection.return_value.document.return_value = system_doc

        aggregate_email_outcomes()

        mock_compute.assert_not_called()
        # No health write on a skipped run (a skip is not a success)
        system_doc.set.assert_not_called()

    @patch("app.services.email_baseline._should_run_aggregation_scanner", return_value=True)
    @patch("app.services.email_baseline.compute_email_baseline")
    @patch("app.services.email_baseline.get_db")
    def test_gate_open_calls_compute_and_writes_health(
        self, mock_db, mock_compute, _mock_gate,
    ):
        """Gate open → compute runs, health doc is written."""
        db = MagicMock()
        mock_db.return_value = db

        # compute returns a baseline with the sampleSize field
        mock_compute.return_value = {
            "sampleSize": {"totalContactsEmailed": 123},
        }

        # Route system/aggregation_scanner to its own doc ref and
        # analytics/email_outcomes to a doc with segmentCount.
        system_doc = MagicMock()
        outcomes_doc = MagicMock()
        outcomes_doc.exists = True
        outcomes_doc.to_dict.return_value = {
            "segmentCount": 7,
            "segments": {"industry:consulting": {}},
        }

        def _collection(name):
            coll = MagicMock()
            if name == "system":
                coll.document.return_value = system_doc
            elif name == "analytics":
                def _analytics_doc(doc_name):
                    if doc_name == "email_outcomes":
                        d = MagicMock()
                        d.get.return_value = outcomes_doc
                        return d
                    return MagicMock()
                coll.document.side_effect = _analytics_doc
            return coll

        db.collection.side_effect = _collection

        aggregate_email_outcomes()

        mock_compute.assert_called_once()
        system_doc.set.assert_called_once()
        payload = system_doc.set.call_args[0][0]
        assert payload["contactsScanned"] == 123
        assert payload["segmentsWritten"] == 7
        assert payload["errorCount"] == 0
        assert payload["docSizeBytes"] > 0

    @patch("app.services.email_baseline._should_run_aggregation_scanner", return_value=True)
    @patch("app.services.email_baseline.compute_email_baseline",
           side_effect=Exception("pdl down"))
    @patch("app.services.email_baseline.get_db")
    def test_compute_failure_increments_error_count(
        self, mock_db, _mock_compute, _mock_gate,
    ):
        """compute_email_baseline raises → errorCount=1 in health doc, no raise."""
        db = MagicMock()
        mock_db.return_value = db
        system_doc = MagicMock()

        def _collection(name):
            coll = MagicMock()
            if name == "system":
                coll.document.return_value = system_doc
            return coll

        db.collection.side_effect = _collection

        aggregate_email_outcomes()  # must not raise

        system_doc.set.assert_called_once()
        payload = system_doc.set.call_args[0][0]
        assert payload["errorCount"] == 1
