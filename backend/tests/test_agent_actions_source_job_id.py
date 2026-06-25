"""
agent_actions — sourceJobId foreign key on HM contact docs (H carve-out).

The activity feed pairs a job posting with its founder-draft sub-card by
matching the contact doc's `sourceJobId` against the find_jobs item the
planner-dispatcher correlated it with. This file pins that write:

  - role_search HM contacts carry sourceJobId from action["sourceJobId"]
  - networking HM contacts leave it empty (no pairing → standalone row)
  - the value traces back faithfully to the action dict

No Firestore, no Perplexity, no recruiter_finder calls — recruiter_finder
+ Gmail are stubbed so we can inspect the saved contact doc directly via
the captured add() argument.
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock

from app.services import agent_actions


def _stub_externals(monkeypatch, hms: list[dict], emails: list[dict] | None = None) -> dict:
    """Wire all I/O so execute_find_hiring_managers reaches the contact-doc
    write path without touching real APIs. Returns a captured dict that
    receives every contacts_ref.add() payload as captured["docs"]."""
    captured: dict = {"docs": []}

    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: False)
    monkeypatch.setattr(agent_actions, "_resolve_agent_template", lambda *a, **kw: "")
    monkeypatch.setattr(agent_actions, "deduct_credits_atomic", lambda *a, **kw: None)

    contacts_ref = MagicMock()

    def _add(doc):
        captured["docs"].append(doc)
        ref = MagicMock()
        ref.id = f"contact-{len(captured['docs'])}"
        return (None, ref)

    contacts_ref.add.side_effect = _add

    db = MagicMock()
    db.collection.return_value.document.return_value.collection.return_value = contacts_ref
    monkeypatch.setattr(agent_actions, "get_db", lambda: db)

    fake_rf = MagicMock()
    fake_rf.find_hiring_manager = lambda **kw: {
        "hiringManagers": hms,
        "emails": emails or [],
    }
    monkeypatch.setitem(sys.modules, "app.services.recruiter_finder", fake_rf)

    fake_perplexity = MagicMock()
    # Mark every HM as verified-active so the executor proceeds to save.
    fake_perplexity.verify_hiring_managers = lambda hms_, *a, **kw: [
        {"verified": True} for _ in hms_
    ]
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_perplexity)

    fake_gmail = MagicMock()
    fake_gmail.create_gmail_draft_for_user = lambda **kw: {"id": "", "url": ""}
    monkeypatch.setitem(sys.modules, "app.services.gmail_client", fake_gmail)

    return captured


def test_find_hiring_managers_writes_source_job_id_when_role_search(monkeypatch):
    """A role_search HM contact (paired with a find_jobs posting) carries the
    sourceJobId the planner/dispatcher set on the action dict."""
    captured = _stub_externals(
        monkeypatch,
        hms=[{
            "FirstName": "Jamie", "LastName": "Founder", "Email": "j@acme.test",
            "Title": "Founder",
        }],
        emails=[{"subject": "Quick question about Acme", "body": "Hi Jamie..."}],
    )

    agent_actions.execute_find_hiring_managers(
        uid="u1",
        action={
            "company": "Acme",
            "jobTitle": "Founding Engineer",
            "cycleId": "c1",
            "sourceJobId": "action-A-j0",
        },
        config={"loopId": "L1", "loopMode": "roles"},
        user_data={"professionalInfo": {}},
    )

    assert len(captured["docs"]) == 1
    contact = captured["docs"][0]
    assert contact["discoveredVia"] == "role_search"
    assert contact["sourceJobId"] == "action-A-j0"


def test_find_hiring_managers_no_source_job_id_for_networking(monkeypatch):
    """Networking-mode HMs render as standalone rows in the feed — they have
    no source posting to pair with. Even if the action dict happens to carry
    a sourceJobId (e.g. residue from a both-mode plan), the executor must
    drop it for networking provenance so the feed stays unchanged from
    today's people-mode behavior. Iron Rule regression guard."""
    captured = _stub_externals(
        monkeypatch,
        hms=[{
            "FirstName": "Riley", "LastName": "Recruiter", "Email": "r@acme.test",
            "Title": "Recruiter",
        }],
        emails=[{"subject": "Coffee chat?", "body": "Hi Riley..."}],
    )

    agent_actions.execute_find_hiring_managers(
        uid="u1",
        action={
            "company": "Acme",
            "jobTitle": "Recruiter",
            "cycleId": "c1",
            "discoveredVia": "networking",
            # Stray sourceJobId on a networking action must NOT bleed into
            # the contact doc — would falsely pair a networking person with
            # a posting row in the activity feed.
            "sourceJobId": "action-A-j0",
        },
        config={"loopId": "L1", "loopMode": "people"},
        user_data={"professionalInfo": {}},
    )

    assert len(captured["docs"]) == 1
    contact = captured["docs"][0]
    assert contact["discoveredVia"] == "networking"
    assert contact["sourceJobId"] == ""


def test_find_hiring_managers_source_job_id_traces_back_to_action_job(monkeypatch):
    """The sourceJobId value on the saved contact is exactly what was on the
    action dict the planner/dispatcher passed in — no transformation, no
    munging. Lets the activity feed render-time grouping match an unrelated
    find_jobs activity item by string equality."""
    sentinel = "find_jobs-7B3C-j2"
    captured = _stub_externals(
        monkeypatch,
        hms=[{
            "FirstName": "Sam", "LastName": "Builder", "Email": "s@acme.test",
            "Title": "Founder",
        }],
        emails=[{"subject": "About SWE Intern role", "body": "Hi Sam..."}],
    )

    agent_actions.execute_find_hiring_managers(
        uid="u1",
        action={
            "company": "Acme",
            "jobTitle": "SWE Intern",
            "cycleId": "c1",
            "sourceJobId": sentinel,
        },
        config={"loopId": "L1", "loopMode": "roles"},
        user_data={"professionalInfo": {}},
    )

    assert len(captured["docs"]) == 1
    assert captured["docs"][0]["sourceJobId"] == sentinel
