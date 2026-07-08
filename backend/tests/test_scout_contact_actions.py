"""Unit tests for Scout's in-chat people search + company intel tools.

find_contacts wraps the MCP pipeline (credits, caps, My Network persistence);
these tests patch that pipeline and verify the Scout-side contract: gates
hold without a uid, results map to the compact chat envelope, and paywalled
empty results surface as INSUFFICIENT_CREDITS instead of a silent zero.
"""
import asyncio
from unittest.mock import patch

import pytest

from app.services.scout import contact_actions
from app.services.scout.tools import run_helper_tool


def _run(name, args, ctx):
    return asyncio.run(run_helper_tool(name, args, ctx))


@pytest.mark.unit
def test_find_contacts_requires_auth():
    out = _run("find_contacts", {"company": "Spotify", "count": 3}, {"uid": None})
    assert out["code"] == "AUTH_REQUIRED"
    assert out["count"] == 0


@pytest.mark.unit
def test_find_contacts_requires_company():
    with patch.object(contact_actions, "_db", return_value=object()):
        out = contact_actions.find_contacts_for_chat("u1", "pro", "  ")
    assert out["code"] == "BAD_REQUEST"


@pytest.mark.unit
def test_find_contacts_maps_results():
    raw = {
        "contacts": [
            {"name": "Ada Lovelace", "title": "SWE", "company": "Spotify",
             "linkedin_url": "https://linkedin.com/in/ada", "email": "ada@spotify.com",
             "warmth": "warm", "personalization_hook": "also studied math"},
            {"name": "Grace Hopper", "title": "Staff SWE"},
        ],
        "company": "Spotify",
        "cached": False,
    }
    with patch.object(contact_actions, "_db", return_value=object()), \
         patch("app.mcp_server.tools.find_contacts.handle", return_value=raw) as m:
        out = contact_actions.find_contacts_for_chat(
            "u1", "pro", "Spotify", role="software engineer", count=3)
    assert out["count"] == 2
    assert out["contacts"][0]["name"] == "Ada Lovelace"
    assert out["contacts"][1]["company"] == "Spotify"
    assert out["saved_to_network"] is True
    assert out["credits_charged"] == 10
    assert m.call_args.kwargs["args"] == {
        "company": "Spotify", "count": 3, "role": "software engineer"}
    assert m.call_args.kwargs["user_ctx"]["uid"] == "u1"


@pytest.mark.unit
def test_find_contacts_paywalled_empty_is_insufficient_credits():
    raw = {"contacts": [], "company": "Spotify", "cached": False,
           "note": "You need 15 more credits.", "paywall": {"claim_url": "x"}}
    with patch.object(contact_actions, "_db", return_value=object()), \
         patch("app.mcp_server.tools.find_contacts.handle", return_value=raw):
        out = contact_actions.find_contacts_for_chat("u1", "free", "Spotify", count=3)
    assert out["code"] == "INSUFFICIENT_CREDITS"
    assert out["count"] == 0


@pytest.mark.unit
def test_find_contacts_zero_results_without_paywall_is_honest_zero():
    raw = {"contacts": [], "company": "Roblox", "cached": False}
    with patch.object(contact_actions, "_db", return_value=object()), \
         patch("app.mcp_server.tools.find_contacts.handle", return_value=raw):
        out = contact_actions.find_contacts_for_chat("u1", "pro", "Roblox", count=5)
    assert out["count"] == 0
    assert "code" not in out


@pytest.mark.unit
def test_company_intel_trims_payload():
    raw = {
        "company": "Databricks",
        "overview": {"what_they_do": "data + AI"},
        "recent_news": [f"news {i}" for i in range(9)],
        "recruiting_signals": {"hiring": True},
        "divisions": [f"d{i}" for i in range(12)],
        "alumni_at_your_school": {"count": 4},
        "paywall": None,
        "cached": True,
    }
    with patch.object(contact_actions, "_db", return_value=object()), \
         patch("app.mcp_server.tools.get_company_intel.handle", return_value=raw):
        out = contact_actions.company_intel_for_chat("u1", "pro", "Databricks")
    assert out["company"] == "Databricks"
    assert len(out["recent_news"]) == 5
    assert len(out["divisions"]) == 8
    assert "paywall" not in out


@pytest.mark.unit
def test_prompt_advertises_people_tools():
    from app.services.scout_assistant_service import _build_static_system_prompt
    prompt = _build_static_system_prompt()
    assert "find_contacts" in prompt
    assert "get_company_intel" in prompt
    assert "Finding people from chat" in prompt


@pytest.mark.unit
def test_router_no_longer_intercepts_find_people():
    from app.services.scout.router import try_pre_llm
    assert try_pre_llm("find me 3 software engineers at spotify", "/dashboard") is None


def _svc():
    from app.services.scout_assistant_service import ScoutAssistantService
    return ScoutAssistantService.__new__(ScoutAssistantService)


@pytest.mark.unit
def test_workflow_cta_fallback_for_found_contacts():
    result = {"tool": "answer", "message": "found them", "cta": None}
    helpers = [{"name": "find_contacts", "result": {"count": 3, "contacts": []}}]
    out = _svc()._enrich_workflow_ctas(result, helpers)
    assert out["cta"]["route"] == "/my-network/people"


@pytest.mark.unit
def test_workflow_cta_fallback_for_company_intel():
    result = {"tool": "answer", "message": "intel", "cta": None}
    helpers = [{"name": "get_company_intel", "result": {"company": "Databricks"}}]
    out = _svc()._enrich_workflow_ctas(result, helpers)
    assert out["cta"]["route"] == "/find"
    assert out["cta"]["prefill"] == {"prompt": "people at Databricks"}


@pytest.mark.unit
def test_find_and_draft_chain_prefers_inbox_chip():
    """The find -> draft chain reports drafts; the draft enrichment owns the
    chip, so the workflow fallback must respect the already-set cta."""
    svc = _svc()
    result = {"tool": "answer", "message": "done", "cta": None}
    helpers = [
        {"name": "find_contacts", "result": {"count": 2, "contacts": []}},
        {"name": "draft_outreach_emails", "result": {
            "count": 2, "skipped": [],
            "drafted": [
                {"name": "Ada", "gmail_draft_url": "https://mail.google.com/d/1", "contact_id": "c1"},
                {"name": "Grace", "gmail_draft_url": "https://mail.google.com/d/2", "contact_id": "c2"},
            ],
        }},
    ]
    result = svc._enrich_draft_report(result, helpers)
    result = svc._enrich_workflow_ctas(result, helpers)
    assert result["cta"]["route"] == "/outbox"


# ---------------------------------------------------------------------------
# Harness-enforced count rule: the model must not invent a count the user
# never gave (each contact costs credits). The dispatcher refuses when the
# triggering message names no quantity.
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_find_contacts_refuses_uncounted_message():
    ctx = {"uid": "u1", "tier": "pro",
           "user_message": "find me software engineers at stripe"}
    out = _run("find_contacts", {"company": "Stripe", "count": 5}, ctx)
    assert out["code"] == "COUNT_REQUIRED"
    assert out["count"] == 0


@pytest.mark.unit
def test_find_contacts_allows_counted_message():
    ctx = {"uid": "u1", "tier": "pro",
           "user_message": "find me 3 software engineers at stripe"}
    with patch(
        "app.services.scout.contact_actions.find_contacts_for_chat",
        return_value={"count": 1, "contacts": [{"name": "Ada"}]},
    ) as m:
        out = _run("find_contacts", {"company": "Stripe", "count": 3}, ctx)
    assert m.called
    assert out["count"] == 1
    assert ctx.get("workflow_state_touched") is True


@pytest.mark.unit
def test_find_contacts_allows_bare_number_reply():
    ctx = {"uid": "u1", "tier": "pro", "user_message": "3"}
    with patch(
        "app.services.scout.contact_actions.find_contacts_for_chat",
        return_value={"count": 3, "contacts": []},
    ) as m:
        out = _run("find_contacts", {"company": "Stripe", "count": 3}, ctx)
    assert m.called and out["count"] == 3


@pytest.mark.unit
def test_find_contacts_year_is_not_a_count():
    ctx = {"uid": "u1", "tier": "pro",
           "user_message": "find swes at stripe for my 2026 internship"}
    out = _run("find_contacts", {"company": "Stripe", "count": 5}, ctx)
    assert out["code"] == "COUNT_REQUIRED"
