"""
Tests for the MCP → My Network contact persistence layer.

Exercises:
  - find_contacts writes PDL-shaped contacts to users/{uid}/contacts/
  - Dedup against existing contacts (email | linkedinUrl | name+company)
  - draft_outreach writes the drafted contact + attaches Gmail draft
    fields (gmailDraftId, gmailDraftUrl, draftToEmail, inOutbox=true)
  - clear_mcp_unseen_for_user flips every mcpUnseen=true row

Direct-call tests against persist.py keep the fake-firestore surface
small; HTTP-level integration coverage is handled via the existing
find_contacts / draft_outreach end-to-end tests in test_local_client.py
which exercise the persist call as a side effect.
"""
from __future__ import annotations

import pytest


def _seed_existing_contact(fake_db, uid: str, *, doc_id: str, email: str = "",
                            linkedin: str = "", first: str = "", last: str = "",
                            company: str = ""):
    (
        fake_db.collection("users").document(uid)
        .collection("contacts").document(doc_id).set({
            "firstName": first,
            "lastName": last,
            "email": email,
            "linkedinUrl": linkedin,
            "company": company,
        })
    )


def test_persist_writes_new_contacts_with_source_and_mcp_unseen(fake_db):
    from app.mcp_server.persist import persist_contacts

    pdl_contacts = [
        {
            "FirstName": "Maya", "LastName": "Patel",
            "Title": "Investment Banking Analyst",
            "Company": "Goldman Sachs",
            "LinkedIn": "https://linkedin.com/in/mayapatel",
            "College": "USC",
            "Email": "maya@gs.com",
            "warmth_score": 65, "warmth_tier": "warm", "warmth_label": "USC alum",
        },
    ]
    written = persist_contacts(uid="u1", db=fake_db, contacts=pdl_contacts)

    assert written
    # Check the written contact carries source + mcpUnseen + warmth.
    contacts_coll = fake_db.store.get("users/u1/contacts", {})
    assert len(contacts_coll) == 1
    doc = next(iter(contacts_coll.values()))
    assert doc["source"] == "mcp"
    assert doc["mcpUnseen"] is True
    assert doc["email"] == "maya@gs.com"
    assert doc["company"] == "Goldman Sachs"
    assert doc["pipelineStage"] == "added"
    assert doc["inOutbox"] is False
    assert doc["warmthScore"] == 65
    assert doc["warmthTier"] == "warm"


def test_persist_dedupes_by_email_against_existing_contacts(fake_db):
    from app.mcp_server.persist import persist_contacts

    _seed_existing_contact(fake_db, "u1", doc_id="existing-1", email="maya@gs.com",
                           first="Maya", last="Patel", company="Goldman Sachs")

    pdl_contacts = [
        {
            "FirstName": "Maya", "LastName": "Patel",
            "Email": "maya@gs.com",
            "Company": "Goldman Sachs",
        },
    ]
    written = persist_contacts(uid="u1", db=fake_db, contacts=pdl_contacts)

    # No new doc was written.
    contacts_coll = fake_db.store.get("users/u1/contacts", {})
    assert len(contacts_coll) == 1
    # written map points at the existing doc id (so draft_outreach can attach).
    assert written.get("maya@gs.com") == "existing-1"


def test_persist_dedupes_by_linkedin(fake_db):
    from app.mcp_server.persist import persist_contacts

    _seed_existing_contact(fake_db, "u1", doc_id="existing-2",
                           linkedin="https://linkedin.com/in/maya",
                           first="Maya", last="Patel", company="Goldman Sachs")

    pdl_contacts = [
        {
            "FirstName": "Maya", "LastName": "Patel",
            "LinkedIn": "https://linkedin.com/in/maya",
            "Company": "Goldman Sachs",
        },
    ]
    persist_contacts(uid="u1", db=fake_db, contacts=pdl_contacts)
    assert len(fake_db.store.get("users/u1/contacts", {})) == 1


def test_persist_dedupes_by_name_company_when_no_email_or_linkedin(fake_db):
    from app.mcp_server.persist import persist_contacts

    _seed_existing_contact(fake_db, "u1", doc_id="existing-3",
                           first="Maya", last="Patel", company="Goldman Sachs")

    pdl_contacts = [
        {"FirstName": "Maya", "LastName": "Patel", "Company": "Goldman Sachs"},
    ]
    persist_contacts(uid="u1", db=fake_db, contacts=pdl_contacts)
    assert len(fake_db.store.get("users/u1/contacts", {})) == 1


def test_persist_dedupes_within_same_batch(fake_db):
    """The same contact appearing twice in one find_contacts result should
    only land in Firestore once."""
    from app.mcp_server.persist import persist_contacts

    duplicate = {
        "FirstName": "Maya", "LastName": "Patel",
        "Email": "maya@gs.com", "Company": "Goldman Sachs",
    }
    persist_contacts(uid="u1", db=fake_db, contacts=[duplicate, duplicate])
    assert len(fake_db.store.get("users/u1/contacts", {})) == 1


def test_attach_gmail_draft_flips_inoutbox_and_writes_draft_fields(fake_db):
    from app.mcp_server.persist import attach_gmail_draft_to_contact, persist_contacts

    written = persist_contacts(uid="u1", db=fake_db, contacts=[{
        "FirstName": "Alex", "LastName": "Cracraft",
        "Email": "alex@gs.com",
        "Company": "Goldman Sachs",
    }])
    doc_id = written["alex@gs.com"]

    attach_gmail_draft_to_contact(
        uid="u1", db=fake_db, contact_doc_id=doc_id,
        draft_id="draft_xyz",
        draft_url="https://mail.google.com/mail/u/0/#drafts?compose=msg_xyz",
        thread_id="thread_xyz",
        recipient_email="alex@gs.com",
        subject="USC student curious about your path to Goldman",
        body="Hi Alex,\n\n...",
    )

    contacts_coll = fake_db.store.get("users/u1/contacts", {})
    doc = contacts_coll[doc_id]
    assert doc["pipelineStage"] == "draft_created"
    assert doc["inOutbox"] is True
    assert doc["gmailDraftId"] == "draft_xyz"
    assert doc["gmailDraftUrl"].startswith("https://mail.google.com")
    assert doc["gmailThreadId"] == "thread_xyz"
    assert doc["draftToEmail"] == "alex@gs.com"
    assert doc["emailSubject"].startswith("USC student")
    assert doc["draftStillExists"] is True


def test_clear_mcp_unseen_flips_all_true_to_false(fake_db):
    from app.mcp_server.persist import clear_mcp_unseen_for_user, persist_contacts

    persist_contacts(uid="u1", db=fake_db, contacts=[
        {"FirstName": "A", "LastName": "A", "Company": "X", "Email": "a@x.com"},
        {"FirstName": "B", "LastName": "B", "Company": "X", "Email": "b@x.com"},
    ])

    # Both freshly-written contacts have mcpUnseen=True.
    contacts_coll = fake_db.store.get("users/u1/contacts", {})
    assert all(c["mcpUnseen"] is True for c in contacts_coll.values())

    cleared = clear_mcp_unseen_for_user("u1", fake_db)
    assert cleared == 2
    assert all(c["mcpUnseen"] is False for c in contacts_coll.values())


def test_persist_is_noop_when_db_is_none(fake_db):
    """Persistence must never raise on a missing db (matches find_contacts
    behavior of fail-open on Firestore unavailability)."""
    from app.mcp_server.persist import persist_contacts
    written = persist_contacts(uid="u1", db=None, contacts=[{
        "FirstName": "A", "LastName": "A", "Email": "a@x.com",
    }])
    assert written == {}


def test_persist_is_noop_when_uid_missing(fake_db):
    """No uid (anonymous-but-bearer test fixture) → don't persist."""
    from app.mcp_server.persist import persist_contacts
    written = persist_contacts(uid="", db=fake_db, contacts=[{"FirstName": "A"}])
    assert written == {}
    assert fake_db.store == {}
