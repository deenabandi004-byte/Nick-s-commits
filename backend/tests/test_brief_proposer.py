"""
brief_proposer — V2 Loops wizard "AI propose" service tests.

All tests mock the Anthropic client — no real Claude calls. The service
is a pure function over (resume_text, profile); the Firestore read lives
in the route handler (not tested here).
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services import brief_proposer
from app.services.brief_proposer import (
    EMPTY_PROPOSAL,
    ProposedBrief,
    propose_brief,
)


# ── helpers ──────────────────────────────────────────────────────────────


def _claude_returning(payload: dict | str) -> MagicMock:
    """Build a stand-in Anthropic client whose messages.create returns a
    response shaped like the real SDK: response.content is a list of
    content blocks, each with a .text attribute carrying the model's text."""
    text = payload if isinstance(payload, str) else json.dumps(payload)
    block = SimpleNamespace(text=text, type="text")
    response = SimpleNamespace(content=[block])
    client = MagicMock()
    client.messages.create.return_value = response
    return client


def _claude_raising(exc: Exception) -> MagicMock:
    client = MagicMock()
    client.messages.create.side_effect = exc
    return client


# ── No-input short-circuit ───────────────────────────────────────────────


def test_propose_brief_with_no_resume_or_profile_returns_empty_without_calling_claude(
    monkeypatch,
):
    """Empty resume + empty profile MUST NOT call Claude. Saves an API call
    on every Loop creation by a brand-new user."""
    client = MagicMock()
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(resume_text="", profile={})

    assert result["status"] == "empty"
    assert result == EMPTY_PROPOSAL
    client.messages.create.assert_not_called()


def test_propose_brief_with_whitespace_only_resume_treated_as_empty(monkeypatch):
    client = MagicMock()
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(resume_text="   \n  \t  ", profile=None)

    assert result["status"] == "empty"
    client.messages.create.assert_not_called()


# ── Claude unavailable / failed ──────────────────────────────────────────


def test_propose_brief_returns_failed_when_anthropic_client_unavailable(monkeypatch):
    """When CLAUDE_API_KEY is unset, openai_client.get_anthropic_client()
    returns None. The wizard needs a clean "failed" signal to show its
    fallback UI — must NOT crash and must NOT pretend the proposal worked."""
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: None)

    result = propose_brief(
        resume_text="SWE intern at Stripe summer 2024.",
        profile={"university": "USC"},
    )

    assert result["status"] == "failed"
    assert result["sentence"] == ""
    assert result["companies"] == []


def test_propose_brief_returns_failed_on_claude_exception(monkeypatch):
    """Network errors, rate limits, etc. surface as 'failed' — never as a
    silent empty proposal."""
    client = _claude_raising(RuntimeError("anthropic timeout"))
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(
        resume_text="SWE intern at Stripe.",
        profile={"university": "USC"},
    )

    assert result["status"] == "failed"


def test_propose_brief_returns_failed_when_claude_returns_non_json(monkeypatch):
    """Defensive: a Claude response that drops the JSON envelope (e.g. wraps
    it in prose despite the prompt) must be caught, not crash."""
    client = _claude_returning("Sure! Here's your brief: SWE internships at Stripe.")
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(
        resume_text="SWE intern at Stripe.",
        profile={"university": "USC"},
    )

    assert result["status"] == "failed"


def test_propose_brief_strips_markdown_json_fence(monkeypatch):
    """Production regression — Claude often wraps the JSON in a ```json …
    ``` fence even when the system prompt forbids it. Stripping the fence
    must happen before json.loads, otherwise every call fails."""
    fenced = (
        "```json\n"
        '{"sentence": "Looking for data science roles at Apple, Google, Amazon.", '
        '"companies": ["Apple", "Google", "Amazon"], '
        '"roles": ["Data Scientist", "ML Engineer"], '
        '"industries": ["Technology"], '
        '"locations": []}\n'
        "```"
    )
    client = _claude_returning(fenced)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(
        resume_text="USC senior — Data Science.",
        profile={"university": "USC"},
    )

    assert result["status"] == "ok"
    assert result["companies"] == ["Apple", "Google", "Amazon"]
    assert result["roles"] == ["Data Scientist", "ML Engineer"]
    assert result["industries"] == ["Technology"]


def test_propose_brief_strips_bare_triple_backticks(monkeypatch):
    """Variant: Claude sometimes drops the language tag — `\\`\\`\\`\\n…\\n\\`\\`\\``.
    Same fix path."""
    fenced = '```\n{"sentence": "ok", "companies": [], "roles": [], "industries": [], "locations": []}\n```'
    client = _claude_returning(fenced)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(resume_text="x", profile={})

    # status == "ok" only if sentence + chips parse cleanly
    assert result["status"] == "ok"
    assert result["sentence"] == "ok"


# ── Happy path: shape + normalization ────────────────────────────────────


def test_propose_brief_happy_path_returns_normalized_shape(monkeypatch):
    """The wizard expects sentence + four chip lists + status. Claude's
    output is trusted only after normalization caps + dedupes."""
    payload = {
        "sentence": "I'm reaching out to PMs at Stripe and Plaid about summer internships.",
        "companies": ["Stripe", "Plaid"],
        "roles": ["Product Manager"],
        "industries": ["Fintech"],
        "locations": ["New York"],
    }
    client = _claude_returning(payload)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(
        resume_text="SWE intern at Stripe summer 2024. USC sophomore.",
        profile={"university": "USC", "careerTrack": "Tech"},
    )

    assert result["status"] == "ok"
    assert result["sentence"] == payload["sentence"]
    assert result["companies"] == ["Stripe", "Plaid"]
    assert result["roles"] == ["Product Manager"]
    assert result["industries"] == ["Fintech"]
    assert result["locations"] == ["New York"]


def test_propose_brief_normalizer_dedupes_case_insensitively(monkeypatch):
    """If Claude emits 'Stripe' AND 'stripe', we keep the first one — the
    chip row must not render the same company twice."""
    payload = {
        "sentence": "Targeting Stripe PMs.",
        "companies": ["Stripe", "stripe", "STRIPE"],
        "roles": [],
        "industries": [],
        "locations": [],
    }
    client = _claude_returning(payload)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(resume_text="SWE", profile={})

    assert result["companies"] == ["Stripe"]


def test_propose_brief_normalizer_caps_each_list_to_10(monkeypatch):
    """Defensive cap — Claude was prompted to return ≤10 of each but a
    badly-tuned future model could blow this out and break the chip row layout."""
    payload = {
        "sentence": "Many companies.",
        "companies": [f"Co{i}" for i in range(20)],
        "roles": [],
        "industries": [],
        "locations": [],
    }
    client = _claude_returning(payload)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(resume_text="anything", profile={})

    assert len(result["companies"]) == 10


def test_propose_brief_normalizer_ignores_non_string_chips(monkeypatch):
    """Type-defense: if Claude returns numbers or nulls in a chip list, drop them."""
    payload = {
        "sentence": "Mixed list.",
        "companies": ["Stripe", 123, None, {"name": "X"}, "Plaid"],
        "roles": [],
        "industries": [],
        "locations": [],
    }
    client = _claude_returning(payload)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(resume_text="anything", profile={})

    assert result["companies"] == ["Stripe", "Plaid"]


def test_propose_brief_missing_fields_default_safely(monkeypatch):
    """If Claude only emits sentence + companies, the other chip lists must
    still come back as empty arrays — not raise KeyError."""
    payload = {"sentence": "Networking at MBB.", "companies": ["McKinsey"]}
    client = _claude_returning(payload)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(resume_text="anything", profile={})

    assert result["sentence"] == "Networking at MBB."
    assert result["companies"] == ["McKinsey"]
    assert result["roles"] == []
    assert result["industries"] == []
    assert result["locations"] == []
    assert result["status"] == "ok"


def test_propose_brief_empty_sentence_and_empty_chips_resolves_to_empty(monkeypatch):
    """If Claude returns a structurally valid but content-empty payload
    (no sentence, no chips), surface that as 'empty' rather than a misleading
    'ok' that paints a blank textarea."""
    payload = {
        "sentence": "",
        "companies": [],
        "roles": [],
        "industries": [],
        "locations": [],
    }
    client = _claude_returning(payload)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(resume_text="anything", profile={})

    assert result["status"] == "empty"


# ── Prompt assembly: profile cleaning + resume cap ───────────────────────


def test_propose_brief_passes_resume_and_profile_into_prompt(monkeypatch):
    """The user message must contain BOTH the resume text and the profile
    block — checks they aren't accidentally dropped between caller and Claude."""
    captured: dict = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(text=json.dumps({
                "sentence": "ok", "companies": [], "roles": [],
                "industries": [], "locations": [],
            }))]
        )

    client = MagicMock()
    client.messages.create.side_effect = fake_create
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    propose_brief(
        resume_text="USC senior, SWE intern at Stripe.",
        profile={"university": "USC", "careerTrack": "Tech"},
    )

    user_msg = captured["messages"][0]["content"]
    assert "USC senior, SWE intern at Stripe." in user_msg
    assert "USC" in user_msg
    assert "careerTrack" in user_msg


def test_propose_brief_caps_long_resume(monkeypatch):
    """A 50k-char resume must be truncated before it lands in the prompt —
    otherwise we burn 12k+ input tokens per Loop creation for marginal signal."""
    captured: dict = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(text=json.dumps({
                "sentence": "ok", "companies": [], "roles": [],
                "industries": [], "locations": [],
            }))]
        )

    client = MagicMock()
    client.messages.create.side_effect = fake_create
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    huge_resume = "Stripe SWE intern. " * 5000  # ~95k chars
    propose_brief(resume_text=huge_resume, profile={})

    user_msg = captured["messages"][0]["content"]
    # MAX_RESUME_CHARS = 6000; the user_msg also has wrapper tags so the
    # total is bounded by 6000 + the wrapper overhead (~150 chars).
    assert len(user_msg) < 7000


def test_propose_brief_drops_non_string_profile_fields(monkeypatch):
    """Profile cleaner must not crash on unexpected types (a manually-edited
    Firestore doc with nested objects)."""
    captured: dict = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(text=json.dumps({
                "sentence": "ok", "companies": [], "roles": [],
                "industries": [], "locations": [],
            }))]
        )

    client = MagicMock()
    client.messages.create.side_effect = fake_create
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    profile = {
        "university": "USC",
        "careerTrack": "Tech",
        "weirdNested": {"a": 1},  # ignored
        "interests": ["Fintech", "AI"],
        "graduationYear": 2027,  # ignored — not a string
    }
    result = propose_brief(resume_text="anything", profile=profile)

    user_msg = captured["messages"][0]["content"]
    assert "USC" in user_msg
    assert "weirdNested" not in user_msg
    assert result["status"] == "ok"


# ── Profile-only path (no resume) ────────────────────────────────────────


def test_propose_brief_with_profile_but_no_resume_still_calls_claude(monkeypatch):
    """Onboarded user with no resume on file should still get a draft —
    the careerTrack alone is enough signal."""
    payload = {
        "sentence": "Targeting analyst roles at top consulting firms.",
        "companies": ["McKinsey", "Bain", "BCG"],
        "roles": ["Analyst"],
        "industries": ["Consulting"],
        "locations": [],
    }
    client = _claude_returning(payload)
    monkeypatch.setattr(brief_proposer, "get_anthropic_client", lambda: client)

    result = propose_brief(
        resume_text=None,
        profile={"university": "USC", "careerTrack": "Consulting"},
    )

    assert result["status"] == "ok"
    assert result["companies"] == ["McKinsey", "Bain", "BCG"]
    client.messages.create.assert_called_once()
