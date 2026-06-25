"""
Brief parser — `mode` field classification tests.

The parser was extended to classify briefs as "people" (autonomous networking)
or "roles" (autonomous job-search). Ambiguous briefs return mode=None and the
wizard's manual picker decides. These tests pin the contract:

  1. EMPTY_BRIEF and parser failure paths include mode=None.
  2. _normalize() coerces invalid mode values to None (never raises).
  3. parse_brief() round-trips a mocked LLM response with mode through.

We do NOT make real OpenAI calls — every test stubs the client via monkeypatch.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from app.services.agent_brief_parser import (
    EMPTY_BRIEF,
    _normalize,
    parse_brief,
)


# ── _normalize: mode validation ──────────────────────────────────────────


def test_normalize_accepts_people_mode():
    out = _normalize({"mode": "people"})
    assert out["mode"] == "people"


def test_normalize_accepts_roles_mode():
    out = _normalize({"mode": "roles"})
    assert out["mode"] == "roles"


def test_normalize_accepts_both_mode():
    """`both` is the third valid mode — students who want networking AND
    job-search in one Loop."""
    out = _normalize({"mode": "both"})
    assert out["mode"] == "both"


def test_normalize_invalid_mode_becomes_none():
    """LLM hallucinations like mode='potato' must become None — the wizard's
    explicit picker then takes over. We never want a Loop persisted with a
    bogus mode value."""
    for bad in ["potato", "", "PEOPLE", "RECRUIT", "BOTH", "ALL", 42, [], {"a": 1}, None]:
        out = _normalize({"mode": bad})
        assert out["mode"] is None, f"expected None for mode={bad!r}, got {out['mode']!r}"


def test_normalize_missing_mode_key_becomes_none():
    """Older briefs / older LLM versions that don't return a mode key at all
    must default to None, not crash."""
    out = _normalize({"companies": ["Stripe"]})
    assert out["mode"] is None


def test_empty_brief_includes_mode_none():
    """The EMPTY_BRIEF constant is returned on parser failure and on empty
    input — both paths must carry mode=None so callers can rely on the
    key always being present."""
    assert "mode" in EMPTY_BRIEF
    assert EMPTY_BRIEF["mode"] is None


# ── parse_brief: integration with mocked LLM ─────────────────────────────


def _stub_openai_client(json_response: dict) -> MagicMock:
    """Build a MagicMock shaped like the OpenAI client's response."""
    msg = MagicMock()
    msg.content = json.dumps(json_response)
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    client = MagicMock()
    client.chat.completions.create.return_value = resp
    return client


def test_parse_brief_roles_mode_passes_through(monkeypatch):
    """When the LLM returns mode='roles', parse_brief surfaces it."""
    monkeypatch.setattr(
        "app.services.agent_brief_parser.get_openai_client",
        lambda: _stub_openai_client({
            "companies": ["Anthropic"],
            "roles": ["SWE Intern"],
            "mode": "roles",
        }),
    )
    parsed, status = parse_brief("find me summer 2027 SWE internships at YC startups")
    assert status == "ok"
    assert parsed["mode"] == "roles"
    assert parsed["roles"] == ["SWE Intern"]


def test_parse_brief_people_mode_passes_through(monkeypatch):
    """When the LLM returns mode='people', parse_brief surfaces it."""
    monkeypatch.setattr(
        "app.services.agent_brief_parser.get_openai_client",
        lambda: _stub_openai_client({
            "companies": ["Goldman Sachs", "JPMorgan"],
            "roles": ["Analyst"],
            "mode": "people",
        }),
    )
    parsed, status = parse_brief(
        "10 AI analysts at Goldman and JPMorgan. Reach out about summer internships."
    )
    assert status == "ok"
    assert parsed["mode"] == "people"


def test_parse_brief_both_mode_passes_through(monkeypatch):
    """When the brief explicitly asks for both job-search AND networking, the
    LLM returns mode='both' and parse_brief surfaces it. The planner then
    runs both pipelines off one credit budget."""
    monkeypatch.setattr(
        "app.services.agent_brief_parser.get_openai_client",
        lambda: _stub_openai_client({
            "companies": ["Stripe", "Linear"],
            "roles": ["SWE Intern"],
            "industries": ["Fintech"],
            "locations": ["NYC"],
            "mode": "both",
        }),
    )
    parsed, status = parse_brief(
        "I want summer SWE internships at fintech startups in NYC plus people to coffee chat with"
    )
    assert status == "ok"
    assert parsed["mode"] == "both"
    assert parsed["roles"] == ["SWE Intern"]
    assert parsed["companies"] == ["Stripe", "Linear"]


def test_parse_brief_ambiguous_mode_passes_through_as_none(monkeypatch):
    """The LLM is instructed to return mode=null when the brief is ambiguous.
    Verify the normalization preserves that as Python None."""
    monkeypatch.setattr(
        "app.services.agent_brief_parser.get_openai_client",
        lambda: _stub_openai_client({
            "companies": [],
            "mode": None,
        }),
    )
    parsed, status = parse_brief("find some people")
    assert status == "ok"
    assert parsed["mode"] is None


def test_parse_brief_failure_returns_empty_brief_with_mode_none(monkeypatch):
    """When the LLM client is unavailable, parse_brief returns EMPTY_BRIEF.
    Verify mode=None is part of that shape."""
    monkeypatch.setattr(
        "app.services.agent_brief_parser.get_openai_client",
        lambda: None,
    )
    parsed, status = parse_brief("anything")
    assert status == "failed"
    assert parsed["mode"] is None
    assert parsed["companies"] == []


def test_parse_brief_empty_input_returns_empty_brief_with_mode_none():
    """Whitespace-only briefs short-circuit before the LLM is called. mode=None
    must still be in the returned dict."""
    parsed, status = parse_brief("   ")
    assert status == "empty"
    assert parsed["mode"] is None
