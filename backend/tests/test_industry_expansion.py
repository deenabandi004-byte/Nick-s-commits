"""Tests for industry-aware semantic expansion in prompt_parser."""
import os
import json
from unittest.mock import patch, MagicMock

import pytest

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services import prompt_parser
from app.services.prompt_parser import (
    expand_industries_and_titles,
    PDL_INDUSTRY_TAXONOMY,
    _expansion_cache_key,
)


@pytest.fixture(autouse=True)
def _clear_expansion_cache():
    with prompt_parser._expand_cache_lock:
        prompt_parser._expand_cache.clear()
    yield
    with prompt_parser._expand_cache_lock:
        prompt_parser._expand_cache.clear()


def _mock_openai_response(payload: dict):
    """Build a fake OpenAI ChatCompletion response object."""
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = json.dumps(payload)
    return response


# ---------------------------------------------------------------------------
# Taxonomy sanity
# ---------------------------------------------------------------------------

def test_taxonomy_loads_with_expected_entries():
    assert len(PDL_INDUSTRY_TAXONOMY) > 100
    for label in (
        "media production", "broadcast media", "financial services",
        "management consulting", "investment banking", "computer software",
    ):
        assert label in PDL_INDUSTRY_TAXONOMY


# ---------------------------------------------------------------------------
# No-op when industries empty
# ---------------------------------------------------------------------------

def test_noop_when_industries_empty_does_not_call_openai():
    parsed = {
        "industries": [],
        "title_variations": ["Engineer"],
        "original_prompt": "engineers at google",
        "companies": [{"name": "Google", "matched_titles": ["Engineer"]}],
    }
    with patch("app.services.prompt_parser.get_openai_client") as mock_client:
        out = expand_industries_and_titles(parsed)
        mock_client.assert_not_called()
    assert out is parsed


def test_noop_when_industries_missing_key():
    parsed = {"title_variations": [], "original_prompt": "p"}
    with patch("app.services.prompt_parser.get_openai_client") as mock_client:
        out = expand_industries_and_titles(parsed)
        mock_client.assert_not_called()
    assert out is parsed


# ---------------------------------------------------------------------------
# Expansion + filtering against PDL enum
# ---------------------------------------------------------------------------

def test_expansion_merges_industries_and_titles():
    parsed = {
        "industries": ["media"],
        "title_variations": ["Producer"],
        "original_prompt": "USC alumni in media",
        "companies": [],
    }
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response({
        "related_industries": [
            "media production", "broadcast media", "online media",
            "entertainment", "motion pictures and film",
        ],
        "title_additions": [
            "Producer", "Editor", "Reporter", "Journalist",
            "Content Manager", "Director of Content",
        ],
    })
    with patch("app.services.prompt_parser.get_openai_client",
               return_value=fake_client):
        out = expand_industries_and_titles(parsed)

    assert out is not parsed
    assert out["industry_expansion_applied"] is True
    # Original "media" preserved at front
    assert out["industries"][0] == "media"
    # Related entries that exist in PDL taxonomy are included
    assert "media production" in out["industries"]
    assert "broadcast media" in out["industries"]
    assert "online media" in out["industries"]
    assert "entertainment" in out["industries"]
    # Titles deduped — original "Producer" appears exactly once
    titles_lower = [t.lower() for t in out["title_variations"]]
    assert titles_lower.count("producer") == 1
    assert "Editor" in out["title_variations"]
    assert "Reporter" in out["title_variations"]
    # Original parsed dict unmodified
    assert parsed["industries"] == ["media"]
    assert parsed["title_variations"] == ["Producer"]


def test_expansion_drops_labels_not_in_pdl_enum():
    parsed = {
        "industries": ["media"],
        "title_variations": [],
        "original_prompt": "media folks",
    }
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response({
        "related_industries": [
            "media production",       # valid
            "tv and radio",            # NOT in PDL enum — must be dropped
            "social media influencers",  # NOT in PDL enum — must be dropped
            "entertainment",           # valid
        ],
        "title_additions": [],
    })
    with patch("app.services.prompt_parser.get_openai_client",
               return_value=fake_client):
        out = expand_industries_and_titles(parsed)

    assert "media production" in out["industries"]
    assert "entertainment" in out["industries"]
    assert "tv and radio" not in out["industries"]
    assert "social media influencers" not in out["industries"]


# ---------------------------------------------------------------------------
# Soft-fail behavior
# ---------------------------------------------------------------------------

def test_soft_fails_on_llm_error_returns_input_unchanged():
    parsed = {
        "industries": ["media"],
        "title_variations": ["Editor"],
        "original_prompt": "media",
    }
    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = RuntimeError("boom")
    with patch("app.services.prompt_parser.get_openai_client",
               return_value=fake_client):
        out = expand_industries_and_titles(parsed)
    assert out is parsed


def test_soft_fails_when_no_openai_client():
    parsed = {"industries": ["media"], "original_prompt": "p"}
    with patch("app.services.prompt_parser.get_openai_client", return_value=None):
        out = expand_industries_and_titles(parsed)
    assert out is parsed


def test_soft_fails_on_empty_response():
    parsed = {"industries": ["media"], "original_prompt": "p"}
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response({})
    fake_client.chat.completions.create.return_value.choices[0].message.content = ""
    with patch("app.services.prompt_parser.get_openai_client",
               return_value=fake_client):
        out = expand_industries_and_titles(parsed)
    assert out is parsed


# ---------------------------------------------------------------------------
# Cache behavior
# ---------------------------------------------------------------------------

def test_cache_hit_avoids_second_openai_call():
    parsed = {
        "industries": ["media"],
        "title_variations": [],
        "original_prompt": "media",
    }
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _mock_openai_response({
        "related_industries": ["entertainment"],
        "title_additions": ["Editor"],
    })
    with patch("app.services.prompt_parser.get_openai_client",
               return_value=fake_client):
        first = expand_industries_and_titles(parsed)
        second = expand_industries_and_titles(parsed)
    assert fake_client.chat.completions.create.call_count == 1
    assert first == second


def test_cache_key_normalizes_case_and_order():
    a = {
        "industries": ["Media", "Finance"],
        "companies": [{"name": "Disney"}, {"name": "Netflix"}],
        "original_prompt": "Find People in MEDIA",
    }
    b = {
        "industries": ["finance", "media"],
        "companies": [{"name": "netflix"}, {"name": "disney"}],
        "original_prompt": "find people in media",
    }
    assert _expansion_cache_key(a) == _expansion_cache_key(b)


def test_cache_key_distinguishes_different_industries():
    a = {"industries": ["media"], "companies": [], "original_prompt": "p"}
    b = {"industries": ["finance"], "companies": [], "original_prompt": "p"}
    assert _expansion_cache_key(a) != _expansion_cache_key(b)


# ---------------------------------------------------------------------------
# Regression guard — non-industry prompt path stays untouched
# ---------------------------------------------------------------------------

def test_regression_guard_non_industry_prompt_passes_through_pdl_path():
    """
    The pdl_client call site must skip expansion entirely when industries is
    empty — no OpenAI call, no mutation. Mirrors the production hot path for
    company-or-title-only prompts.
    """
    parsed = {
        "industries": [],
        "title_variations": ["Software Engineer"],
        "companies": [{"name": "Google", "matched_titles": ["Software Engineer"]}],
        "original_prompt": "engineers at google",
    }
    with patch("app.services.prompt_parser.get_openai_client") as mock_client:
        out = expand_industries_and_titles(parsed)
        mock_client.assert_not_called()
    assert out == parsed
