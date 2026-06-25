"""
Tests for the authenticated Gmail-draft side effect on draft_outreach.

These exercise handle() directly (not via the JSON-RPC HTTP surface)
because passing a fake user_ctx through Flask would require either
mocking JWT verification or threading a custom auth header — both
heavier than calling the handler with a synthetic user_ctx.

create_gmail_draft_for_user is monkeypatched so we never touch real
Gmail. The fake Firestore from conftest.py is seeded with a user doc
and an integrations/gmail doc to simulate a fully-connected user.
"""
from __future__ import annotations

from typing import Any

import pytest


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def authed_user_ctx() -> dict:
    """Synthetic JWT claims for a Pro user with full scope."""
    return {"uid": "user_abc", "tier": "pro", "scope": "mcp:read mcp:write"}


@pytest.fixture
def seed_authed_user(fake_db):
    """Seed the fake Firestore with a user doc + Gmail integration."""
    fake_db.collection("users").document("user_abc").set({
        "email": "sid@usc.edu",
        "eduEmail": "sid@usc.edu",
        "academics": {
            "university": "University of Southern California",
            "major": "Data Science",
            "graduationYear": "2026",
        },
        "resumeParsed": {
            "university": "University of Southern California",
            "major": "Data Science",
            "year": "Senior",
        },
        "dreamCompanies": ["Goldman Sachs"],
        "resumeUrl": None,  # skip resume download in tests
        "resumeFileName": None,
    })
    fake_db.collection("users").document("user_abc").collection(
        "professionalInfo"
    ).document("info").set({
        "firstName": "Sid",
        "lastName": "Bandi",
        "university": "University of Southern California",
        "fieldOfStudy": "Data Science",
        "graduationYear": "2026",
        "currentDegree": "BS",
    })
    fake_db.collection("users").document("user_abc").collection(
        "integrations"
    ).document("gmail").set({
        "token": "fake_access",
        "refresh_token": "fake_refresh",
        "scopes": ["https://www.googleapis.com/auth/gmail.modify"],
    })
    return fake_db


@pytest.fixture
def mock_gmail_draft(monkeypatch):
    """Fake create_gmail_draft_for_user that records calls and returns success."""
    calls: list[dict] = []

    def fake_create(contact, *, email_subject, email_body, tier, user_email,
                    resume_url=None, resume_content=None, resume_filename=None,
                    user_info=None, user_id=None):
        calls.append({
            "contact": contact,
            "subject": email_subject,
            "body": email_body,
            "tier": tier,
            "user_email": user_email,
            "user_id": user_id,
            "user_info": user_info,
            "resume_url": resume_url,
        })
        return {
            "draft_id": "draft_xyz",
            "message_id": "msg_xyz",
            "draft_url": "https://mail.google.com/mail/u/0/#drafts?compose=msg_xyz",
            "recipient_email": contact.get("WorkEmail") or contact.get("Email"),
        }

    import app.services.gmail_client as gmail_mod
    monkeypatch.setattr(gmail_mod, "create_gmail_draft_for_user", fake_create)
    return calls


# ── Tests ────────────────────────────────────────────────────────────────────


def _payload_with_email() -> dict:
    return {
        "contact": {
            "name": "Maya Patel",
            "title": "IB Analyst",
            "company": "Goldman Sachs",
            "education": "USC",
            "email": "maya.patel@goldman.com",
        },
        "user_school": "USC",
        "user_career_track": "investment banking",
        "intent": "coffee_chat",
    }


def test_authed_caller_with_gmail_connected_creates_draft(
    fake_db, seed_authed_user, authed_user_ctx, mock_llm, mock_gmail_draft,
):
    from app.mcp_server.tools.draft_outreach import handle

    out = handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_authed_1",
        db=fake_db,
        user_ctx=authed_user_ctx,
    )

    assert out["subject"]
    assert out["body"]
    assert out["gmail_draft"] is not None
    assert out["gmail_draft"]["draft_id"] == "draft_xyz"
    assert out["gmail_draft"]["draft_url"].startswith("https://mail.google.com")
    assert out["gmail_draft"]["recipient_email"] == "maya.patel@goldman.com"
    assert out["gmail_draft_status"] is None

    assert len(mock_gmail_draft) == 1
    call = mock_gmail_draft[0]
    assert call["user_id"] == "user_abc"
    # Outreach identity prefers the .edu (eduEmail) over the primary email.
    assert call["user_email"] == "sid@usc.edu"
    # Signature uses the professionalInfo name.
    assert call["user_info"]["name"] == "Sid Bandi"
    # Contact is routed via WorkEmail (highest-priority recipient slot).
    assert call["contact"]["WorkEmail"] == "maya.patel@goldman.com"


def test_authed_caller_without_contact_email_skips_gmail_with_status(
    fake_db, seed_authed_user, authed_user_ctx, mock_llm, mock_gmail_draft,
):
    from app.mcp_server.tools.draft_outreach import handle

    payload = _payload_with_email()
    payload["contact"].pop("email")

    out = handle(
        args=payload,
        ip_hash="ip_hash_authed_no_email",
        db=fake_db,
        user_ctx=authed_user_ctx,
    )

    assert out["subject"]
    assert out["gmail_draft"] is None
    assert out["gmail_draft_status"] == "no_recipient_email"
    assert len(mock_gmail_draft) == 0


def test_authed_caller_without_gmail_integration_reports_status(
    fake_db, authed_user_ctx, mock_llm, mock_gmail_draft,
):
    # Seed user doc but NO integrations/gmail.
    fake_db.collection("users").document("user_abc").set({
        "email": "sid@usc.edu",
    })

    from app.mcp_server.tools.draft_outreach import handle

    out = handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_no_gmail",
        db=fake_db,
        user_ctx=authed_user_ctx,
    )

    assert out["subject"]
    assert out["gmail_draft"] is None
    assert out["gmail_draft_status"] == "gmail_not_connected"
    assert len(mock_gmail_draft) == 0


def test_authed_caller_without_write_scope_skips_gmail(
    fake_db, seed_authed_user, mock_llm, mock_gmail_draft,
):
    from app.mcp_server.tools.draft_outreach import handle

    read_only_ctx = {"uid": "user_abc", "tier": "pro", "scope": "mcp:read"}
    out = handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_read_only",
        db=fake_db,
        user_ctx=read_only_ctx,
    )

    assert out["subject"]
    assert out["gmail_draft"] is None
    assert out["gmail_draft_status"] == "scope_missing"
    assert len(mock_gmail_draft) == 0


def test_anonymous_caller_never_creates_gmail_draft(
    fake_db, mock_llm, mock_gmail_draft,
):
    from app.mcp_server.tools.draft_outreach import handle

    out = handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_anon",
        db=fake_db,
        user_ctx=None,
    )

    assert out["subject"]
    assert out["gmail_draft"] is None
    # Status fields are not set for anonymous callers — nothing to nudge about.
    assert out.get("gmail_draft_status") is None
    assert len(mock_gmail_draft) == 0


def test_authed_cache_does_not_leak_to_anonymous_caller(
    fake_db, seed_authed_user, authed_user_ctx, mock_llm, mock_gmail_draft,
):
    """Authed and anon must hit separate cache buckets so anon never gets
    an authed user's resume-personalized draft (and vice versa)."""
    from app.mcp_server.tools.draft_outreach import handle

    # First call: authed user warms their cache bucket.
    handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_warm_1",
        db=fake_db,
        user_ctx=authed_user_ctx,
    )
    llm_calls_after_first = mock_llm  # function ref, calls tracked via call_counter elsewhere

    # Second call: anonymous caller with identical args should NOT hit the
    # authed cache and should re-invoke the LLM. We verify this by checking
    # that two different cache documents exist under mcp_cache.
    out_anon = handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_warm_anon",
        db=fake_db,
        user_ctx=None,
    )
    assert out_anon["subject"]
    assert out_anon.get("gmail_draft") is None

    cache_docs = list(fake_db.store.get("mcp_cache", {}).keys())
    # One bucket per identity (authed + anon).
    assert len(cache_docs) == 2, (
        f"expected separate cache buckets per uid; got {cache_docs}"
    )


def test_authed_cache_hit_still_creates_fresh_gmail_draft(
    fake_db, seed_authed_user, authed_user_ctx, mock_llm, mock_gmail_draft,
):
    """Gmail draft is a side effect: cache hits must NOT skip draft creation."""
    from app.mcp_server.tools.draft_outreach import handle

    payload = _payload_with_email()

    handle(
        args=payload, ip_hash="ip_hash_cache_1", db=fake_db, user_ctx=authed_user_ctx,
    )
    handle(
        args=payload, ip_hash="ip_hash_cache_2", db=fake_db, user_ctx=authed_user_ctx,
    )

    # Two calls → two Gmail drafts, even though the second one hit cache for
    # subject/body.
    assert len(mock_gmail_draft) == 2


def test_authed_caller_uses_firestore_profile_when_school_omitted(
    fake_db, seed_authed_user, authed_user_ctx, mock_llm, mock_gmail_draft,
):
    """An authed user can omit user_school; the tool reads it from their profile."""
    from app.mcp_server.tools.draft_outreach import handle

    payload = _payload_with_email()
    payload.pop("user_school")

    out = handle(
        args=payload, ip_hash="ip_hash_no_school", db=fake_db, user_ctx=authed_user_ctx,
    )

    assert out["subject"]
    assert out["body"]
    # Body should still mention the user's actual school from Firestore.
    assert "University of Southern California" in out["body"] or "USC" in out["body"]


def test_resume_downloaded_once_per_call_not_twice(
    fake_db, seed_authed_user, authed_user_ctx, mock_llm, mock_gmail_draft, monkeypatch,
):
    """Regression test: LLM gen + Gmail draft must SHARE the resume download.

    Previously the tool downloaded the resume once for text extraction and
    again for the Gmail attachment. The refactor consolidates into a single
    _AuthedContext load. This test pins that contract.
    """
    fake_db.collection("users").document("user_abc").set({
        "email": "sid@usc.edu",
        "eduEmail": "sid@usc.edu",
        "academics": {"university": "University of Southern California"},
        "resumeUrl": "https://storage.example.com/resume.pdf",
        "resumeFileName": "sid_resume.pdf",
    }, merge=True)

    download_count = {"n": 0}

    def fake_download(url):
        download_count["n"] += 1
        # 100 bytes is enough to bypass the empty-content branch; the
        # extract_text mock below replaces text extraction so we don't
        # need a real PDF.
        return b"%PDF-1.4 fake bytes" * 20, "sid_resume.pdf"

    import app.services.gmail_client as gmail_mod
    monkeypatch.setattr(gmail_mod, "download_resume_from_url", fake_download)

    # Skip real PDF parsing in the resume_parser module.
    import app.services.resume_parser as parser_mod
    monkeypatch.setattr(
        parser_mod, "extract_text_from_pdf_bytes",
        lambda _: "Sid Bandi — USC Data Science. Investment banking interest.",
    )

    from app.mcp_server.tools.draft_outreach import handle

    out = handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_dl_check",
        db=fake_db,
        user_ctx=authed_user_ctx,
    )

    assert out["gmail_draft"] is not None
    assert download_count["n"] == 1, (
        f"resume must be downloaded exactly once per authed call; "
        f"got {download_count['n']}"
    )

    # The bytes from the single download should reach create_gmail_draft_for_user.
    assert mock_gmail_draft[0].get("resume_url") == "https://storage.example.com/resume.pdf"


def test_event_log_records_gmail_draft_outcome(
    fake_db, seed_authed_user, authed_user_ctx, mock_llm, mock_gmail_draft,
):
    """mcp_events docs for authed calls must carry gmail_draft_status +
    gmail_draft_created flags so the ops dashboard can chart funnel drop-off."""
    from app.mcp_server.tools.draft_outreach import handle

    handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_event_log",
        db=fake_db,
        user_ctx=authed_user_ctx,
    )

    events = list(fake_db.store.get("mcp_events", {}).values())
    assert len(events) == 1
    ev = events[0]
    assert ev["tool"] == "draft_outreach"
    assert ev["authed"] is True
    assert ev["gmail_draft_created"] is True
    assert ev["gmail_draft_status"] is None  # success path leaves status unset


def test_event_log_anonymous_call_omits_gmail_extras(
    fake_db, mock_llm, mock_gmail_draft,
):
    """Anonymous calls shouldn't pollute the event row with authed-only fields."""
    from app.mcp_server.tools.draft_outreach import handle

    handle(
        args=_payload_with_email(),
        ip_hash="ip_hash_anon_event",
        db=fake_db,
        user_ctx=None,
    )

    events = list(fake_db.store.get("mcp_events", {}).values())
    assert len(events) == 1
    ev = events[0]
    assert "authed" not in ev
    assert "gmail_draft_created" not in ev
    assert "gmail_draft_status" not in ev
