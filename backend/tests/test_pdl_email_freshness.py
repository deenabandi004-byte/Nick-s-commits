"""Tests for the PDL email freshness gate (Phase 2.1).

The short-circuit at pdl_client.py:1816 trusts PDL `emails[]` without
running Hunter when no target company is set. Stale PDL records were the #1
bounce source — these tests pin the new behavior: only short-circuit when
PDL has dated evidence the person is still at the current job, otherwise
fall through to Hunter verification.
"""
from datetime import datetime, timedelta, timezone

from app.services.pdl_client import _parse_pdl_date, _pdl_email_is_fresh


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class TestParsePdlDate:
    def test_iso_8601_with_z(self):
        dt = _parse_pdl_date("2024-03-15T21:32:10Z")
        assert dt is not None
        assert dt.year == 2024 and dt.month == 3 and dt.day == 15
        assert dt.tzinfo is not None

    def test_iso_8601_with_offset(self):
        dt = _parse_pdl_date("2024-03-15T21:32:10+00:00")
        assert dt is not None
        assert dt.tzinfo is not None

    def test_partial_date_ymd(self):
        dt = _parse_pdl_date("2024-03-15")
        assert dt is not None and dt.year == 2024

    def test_partial_date_ym(self):
        dt = _parse_pdl_date("2024-03")
        assert dt is not None and dt.month == 3

    def test_empty_returns_none(self):
        assert _parse_pdl_date("") is None
        assert _parse_pdl_date(None) is None

    def test_garbage_returns_none(self):
        assert _parse_pdl_date("yesterday") is None
        assert _parse_pdl_date("not-a-date") is None


class TestPdlEmailIsFresh:
    def test_recent_job_last_updated_is_fresh(self):
        recent = datetime.now(timezone.utc) - timedelta(days=30)
        person = {"job_last_updated": _iso(recent)}
        assert _pdl_email_is_fresh(person) is True

    def test_old_job_last_updated_is_stale(self):
        old = datetime.now(timezone.utc) - timedelta(days=365)
        person = {"job_last_updated": _iso(old)}
        assert _pdl_email_is_fresh(person) is False

    def test_just_past_cutoff_is_stale(self):
        cutoff = datetime.now(timezone.utc) - timedelta(days=181)
        person = {"job_last_updated": _iso(cutoff)}
        assert _pdl_email_is_fresh(person) is False

    def test_just_inside_cutoff_is_fresh(self):
        inside = datetime.now(timezone.utc) - timedelta(days=170)
        person = {"job_last_updated": _iso(inside)}
        assert _pdl_email_is_fresh(person) is True

    def test_missing_dates_default_to_stale(self):
        # No documented freshness signals → re-verify.
        assert _pdl_email_is_fresh({}) is False
        assert _pdl_email_is_fresh({"emails": [{"address": "x@y.com"}]}) is False

    def test_experience_last_updated_fallback(self):
        recent = datetime.now(timezone.utc) - timedelta(days=20)
        person = {
            # job_last_updated missing
            "experience": [
                {
                    "is_current": True,
                    "last_updated": _iso(recent),
                    "company": {"name": "Acme"},
                }
            ],
        }
        assert _pdl_email_is_fresh(person) is True

    def test_experience_only_considers_current_job(self):
        recent = datetime.now(timezone.utc) - timedelta(days=20)
        person = {
            "experience": [
                # Most recent in array is NOT marked current — should not count.
                {"is_current": False, "last_updated": _iso(recent)},
                {"is_current": True, "last_updated": _iso(datetime.now(timezone.utc) - timedelta(days=400))},
            ],
        }
        # Loop breaks at first current entry, which is stale → False.
        # (We don't keep scanning past the first current job.)
        # Note: this is intentional — PDL puts the current job at experience[0],
        # so reordering it here is testing the documented behavior.
        assert _pdl_email_is_fresh(person) is False

    def test_garbage_date_treated_as_missing(self):
        person = {"job_last_updated": "yesterday"}
        assert _pdl_email_is_fresh(person) is False

    def test_chosen_email_arg_does_not_affect_decision(self):
        # We dropped per-email timestamp lookups (not in PDL public schema).
        # The chosen_email arg is kept for future use but must not change behavior.
        recent = datetime.now(timezone.utc) - timedelta(days=30)
        person = {"job_last_updated": _iso(recent)}
        assert _pdl_email_is_fresh(person, "anything@anywhere.com") is True
        assert _pdl_email_is_fresh(person, None) is True
        assert _pdl_email_is_fresh(person, "") is True
