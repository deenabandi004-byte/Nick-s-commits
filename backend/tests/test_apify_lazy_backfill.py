"""Tests for the D11 lazy-on-login Apify backfill path.

Coverage:
  1. _user_needs_apify_backfill decision logic (pure, no I/O).
  2. _run_apify_backfill worker behavior on success / Apify-failure /
     LLM-failure / resume-preservation paths, with Firestore + Apify mocked.

The endpoint itself (POST /api/users/me/sync-linkedin) is a thin orchestration
layer on top of the two units above; the unit tests cover the high-leverage
decision and write logic.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.routes.enrichment import (
    _BACKFILL_RETRY_COOLDOWN_S,
    _run_apify_backfill,
    _user_needs_apify_backfill,
)


# ---------------------------------------------------------------------------
# _user_needs_apify_backfill
# ---------------------------------------------------------------------------

@pytest.fixture
def now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


def _user(**overrides):
    """A user doc with a LinkedIn URL but no Apify history (default backfill candidate)."""
    base = {"linkedinUrl": "https://linkedin.com/in/test"}
    base.update(overrides)
    return base


def test_apify_backfilled_flag_short_circuits(now_ts):
    should, reason = _user_needs_apify_backfill(
        _user(apifyBackfilled=True), now_ts
    )
    assert should is False
    assert reason == "already_apify"


def test_already_apify_source_short_circuits(now_ts):
    """User onboarded post-flip already has Apify as their source."""
    should, reason = _user_needs_apify_backfill(
        _user(linkedinEnrichmentSource="apify"), now_ts
    )
    assert should is False
    assert reason == "already_apify"


def test_missing_linkedin_url_skips(now_ts):
    """Nothing to scrape - user never gave us a URL or removed it."""
    should, reason = _user_needs_apify_backfill({}, now_ts)
    assert should is False
    assert reason == "no_url"


def test_recent_attempt_inside_cooldown_skips(now_ts):
    """A failed attempt 1 hour ago must NOT re-fire — thundering herd guard."""
    recent_iso = (
        datetime.fromtimestamp(now_ts, tz=timezone.utc)
        - timedelta(hours=1)
    ).isoformat()
    should, reason = _user_needs_apify_backfill(
        _user(apifyBackfillLastAttempt=recent_iso), now_ts
    )
    assert should is False
    assert reason == "recent_attempt"


def test_old_attempt_past_cooldown_retries(now_ts):
    """A failed attempt > 24h ago is fair game to retry."""
    old_iso = (
        datetime.fromtimestamp(now_ts, tz=timezone.utc)
        - timedelta(seconds=_BACKFILL_RETRY_COOLDOWN_S + 60)
    ).isoformat()
    should, reason = _user_needs_apify_backfill(
        _user(apifyBackfillLastAttempt=old_iso), now_ts
    )
    assert should is True
    assert reason == ""


def test_malformed_timestamp_is_treated_as_no_attempt(now_ts):
    should, reason = _user_needs_apify_backfill(
        _user(apifyBackfillLastAttempt="not-a-date"), now_ts
    )
    assert should is True
    assert reason == ""


def test_happy_path_returns_true(now_ts):
    """No Apify source yet, has URL, no recent attempt - go."""
    should, reason = _user_needs_apify_backfill(
        _user(linkedinEnrichmentSource="firecrawl"), now_ts
    )
    assert should is True
    assert reason == ""


# ---------------------------------------------------------------------------
# _run_apify_backfill worker
# ---------------------------------------------------------------------------

def _make_db_with_ref():
    """Build a mock Firestore client whose .collection().document() returns a
    captured DocumentReference whose .set() and .get() can be inspected.
    """
    user_ref = MagicMock(name="user_ref")
    snap = MagicMock(exists=False)
    snap.to_dict.return_value = {}
    user_ref.get.return_value = snap

    db = MagicMock(name="db")
    db.collection.return_value.document.return_value = user_ref
    return db, user_ref


def test_worker_success_writes_all_fields_and_sets_flag():
    db, user_ref = _make_db_with_ref()
    apify_envelope = {
        "ok": True,
        "source": "apify",
        "actor": "harvestapi~linkedin-profile",
        "data": {"name": "Sid", "experience": []},
    }
    parsed = {"name": "Sid", "education": {"university": "USC"}, "experience": []}

    with patch(
        "app.routes.enrichment.get_db", return_value=db
    ), patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=apify_envelope,
    ), patch(
        "app.routes.enrichment.llm_enrich_profile", return_value=parsed
    ):
        _run_apify_backfill("uid-1", "https://linkedin.com/in/sidsriram")

    # Find the success call (the call that contains 'apifyBackfilled': True).
    success_calls = [
        c for c in user_ref.set.call_args_list
        if c.args and isinstance(c.args[0], dict) and c.args[0].get("apifyBackfilled") is True
    ]
    assert len(success_calls) == 1
    updates = success_calls[0].args[0]
    assert updates["linkedinEnrichmentSource"] == "apify"
    assert updates["linkedinResumeParsed"] == parsed
    assert updates["linkedinEnrichmentData"] == apify_envelope["data"]
    assert updates["apifyBackfilledAt"]
    assert updates["apifyBackfillLastAttempt"]


def test_worker_apify_failure_only_writes_last_attempt_timestamp():
    db, user_ref = _make_db_with_ref()
    failure_envelope = {
        "ok": False,
        "source": "apify_timeout",
        "actor": "harvestapi~linkedin-profile",
        "data": None,
        "error": "timeout",
    }

    with patch(
        "app.routes.enrichment.get_db", return_value=db
    ), patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=failure_envelope,
    ):
        _run_apify_backfill("uid-2", "https://linkedin.com/in/test")

    assert user_ref.set.call_count == 1
    payload = user_ref.set.call_args.args[0]
    # Critical: the apifyBackfilled flag is NOT set on failure.
    assert "apifyBackfilled" not in payload
    assert "apifyBackfilledAt" not in payload
    # But last-attempt IS set so we honor the cooldown.
    assert "apifyBackfillLastAttempt" in payload


def test_worker_llm_extraction_failure_only_writes_last_attempt():
    """Apify returned data but LLM couldn't extract a name (login wall etc).
    Same handling as Apify failure: mark attempt, don't claim success."""
    db, user_ref = _make_db_with_ref()
    apify_envelope = {
        "ok": True,
        "source": "apify",
        "actor": "harvestapi~linkedin-profile",
        "data": {"garbled": "page content"},
    }

    with patch(
        "app.routes.enrichment.get_db", return_value=db
    ), patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=apify_envelope,
    ), patch(
        "app.routes.enrichment.llm_enrich_profile", return_value={"name": None}
    ):
        _run_apify_backfill("uid-3", "https://linkedin.com/in/test")

    assert user_ref.set.call_count == 1
    payload = user_ref.set.call_args.args[0]
    assert "apifyBackfilled" not in payload
    assert "apifyBackfillLastAttempt" in payload


def test_worker_preserves_existing_resume_parsed():
    """User has uploaded a resume already. Backfill upgrades LinkedIn data
    but must NOT overwrite resumeParsed - the resume is the source of truth."""
    db, user_ref = _make_db_with_ref()
    user_ref.get.return_value = MagicMock(
        exists=True,
        to_dict=MagicMock(return_value={"resumeParsed": {"name": "From Resume PDF"}}),
    )
    apify_envelope = {
        "ok": True,
        "source": "apify",
        "actor": "harvestapi~linkedin-profile",
        "data": {"name": "Sid"},
    }

    with patch(
        "app.routes.enrichment.get_db", return_value=db
    ), patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=apify_envelope,
    ), patch(
        "app.routes.enrichment.llm_enrich_profile",
        return_value={"name": "Sid From LinkedIn"},
    ):
        _run_apify_backfill("uid-4", "https://linkedin.com/in/test")

    success_calls = [
        c for c in user_ref.set.call_args_list
        if c.args and isinstance(c.args[0], dict) and c.args[0].get("apifyBackfilled") is True
    ]
    assert len(success_calls) == 1
    payload = success_calls[0].args[0]
    # linkedinResumeParsed updated...
    assert payload["linkedinResumeParsed"]["name"] == "Sid From LinkedIn"
    # ...but resumeParsed NOT touched (would shadow the uploaded resume).
    assert "resumeParsed" not in payload


def test_worker_writes_resume_parsed_when_user_has_none():
    """User without any resume gets the Apify-derived LinkedIn parsed both as
    linkedinResumeParsed AND as resumeParsed (mirror of onboarding behavior)."""
    db, user_ref = _make_db_with_ref()
    user_ref.get.return_value = MagicMock(exists=True, to_dict=MagicMock(return_value={}))
    apify_envelope = {
        "ok": True,
        "source": "apify",
        "actor": "harvestapi~linkedin-profile",
        "data": {"name": "Sid"},
    }
    parsed = {"name": "Sid", "education": {"university": "USC"}}

    with patch(
        "app.routes.enrichment.get_db", return_value=db
    ), patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        return_value=apify_envelope,
    ), patch(
        "app.routes.enrichment.llm_enrich_profile", return_value=parsed
    ):
        _run_apify_backfill("uid-5", "https://linkedin.com/in/test")

    success_calls = [
        c for c in user_ref.set.call_args_list
        if c.args and isinstance(c.args[0], dict) and c.args[0].get("apifyBackfilled") is True
    ]
    payload = success_calls[0].args[0]
    assert payload["resumeParsed"] == parsed


def test_worker_swallows_unexpected_exception():
    """The worker must never propagate - it's a daemon thread; an unhandled
    exception there would just be silently lost. Best-effort still tries to
    write a last-attempt timestamp so the cooldown engages."""
    db, user_ref = _make_db_with_ref()

    with patch(
        "app.routes.enrichment.get_db", return_value=db
    ), patch(
        "app.services.apify_client.enrich_user_linkedin_profile_via_apify",
        side_effect=RuntimeError("boom"),
    ):
        # Must not raise.
        _run_apify_backfill("uid-6", "https://linkedin.com/in/test")

    # At least one set() call: the last-attempt write in the except branch.
    assert user_ref.set.call_count >= 1
