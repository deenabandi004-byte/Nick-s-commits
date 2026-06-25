"""Tests for the job-description detail logic.

Covers the fast `_describe` helper (stored-data-only, no network) behind
/api/jobs/<id>/description, plus the schema/compose pieces. The on-demand
/full-description scrape path passes wait_for_ms to render JS pages.
"""
import inspect

import pytest

from backend.app.routes.jobs import _compose_from_structured, _describe
from backend.app.services.extraction_schemas import JobPostingExtract
from backend.app.services.firecrawl_client import extract_job_posting


def test_schema_exposes_description_field():
    """The Firecrawl extract schema must carry prose so the scrape can recover
    the real description in the same call."""
    job = JobPostingExtract()
    assert hasattr(job, "description")
    assert job.description == ""
    assert JobPostingExtract(description="Build payments").description == "Build payments"


def test_extract_job_posting_accepts_wait_for_ms():
    """The full-description path passes wait_for_ms to render JS pages."""
    sig = inspect.signature(extract_job_posting)
    assert "wait_for_ms" in sig.parameters
    assert sig.parameters["wait_for_ms"].default == 0  # default keeps fast callers unchanged


def test_compose_from_structured_builds_readable_paragraphs():
    structured = {
        "responsibilities": ["Ship features", "Pair with eng"],
        "requirements": ["Python", "  "],  # blank entries dropped
        "nice_to_have": [],
    }
    out = _compose_from_structured(structured)
    assert "What you'll do" in out
    assert "• Ship features" in out
    assert "What we're looking for" in out
    assert "• Python" in out
    assert "Nice to have" not in out  # empty section omitted
    assert "\n\n" in out


@pytest.mark.parametrize("bad", [None, "", [], 42, {"responsibilities": []}])
def test_compose_from_structured_handles_empty_or_bad_input(bad):
    assert _compose_from_structured(bad) == ""


def test_describe_returns_prose_when_description_raw_present():
    # Prose wins over structured, trimmed.
    out = _describe({"description_raw": "  Real posting prose.  ", "structured": {"requirements": ["x"]}})
    assert out == "Real posting prose."


def test_describe_returns_bulleted_when_only_structured():
    out = _describe({"structured": {"responsibilities": ["Do the thing"]}})
    assert "• Do the thing" in out


def test_describe_returns_empty_when_nothing():
    assert _describe({"apply_url": "https://x.com/j"}) == ""


def test_describe_treats_blank_description_raw_as_absent():
    out = _describe({"description_raw": "   ", "structured": {"requirements": ["Python"]}})
    assert "• Python" in out
