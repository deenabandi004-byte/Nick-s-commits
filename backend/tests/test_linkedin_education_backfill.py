"""
Bug 2 verification: LinkedIn enrichment must reliably return education
(university / major / graduationYear) for the onboarding Confirm step.

Firecrawl is first in the scrape chain but its minimal schema omits education,
and the tier loop accepts the first source that yields a name — so Firecrawl
wins and education is empty. `backfill_education` fixes this by pulling
education from an education-capable provider (PDL, then Bright Data) when the
winning tier lacks a university.

These tests mock the providers and the LLM structuring so they run offline.
"""
import pytest

import app.utils.linkedin_enrichment as le


@pytest.mark.unit
def test_backfill_education_fills_from_pdl_when_missing(monkeypatch):
    """Firecrawl-shaped result (name present, education empty) gets education
    backfilled from PDL."""
    parsed = {
        "name": "Jane Doe",
        "education": {"university": None, "major": None, "degree": None, "graduation": None},
    }

    monkeypatch.setattr(le, "_try_pdl", lambda url: ({"raw": "pdl"}, "pdl"))
    monkeypatch.setattr(le, "_try_brightdata", lambda url: (None, "brightdata"))
    monkeypatch.setattr(
        le,
        "llm_enrich_profile",
        lambda raw, src: {
            "education": {
                "university": "UCLA",
                "major": "Economics",
                "degree": "BA",
                "graduation": "May 2026",
            }
        },
    )

    out = le.backfill_education(parsed, "https://www.linkedin.com/in/janedoe")

    assert out["education"]["university"] == "UCLA"
    assert out["education"]["major"] == "Economics"
    assert out["education"]["degree"] == "BA"
    assert out["education"]["graduation"] == "May 2026"


@pytest.mark.unit
def test_backfill_education_falls_through_to_brightdata(monkeypatch):
    """When PDL returns nothing usable, Bright Data supplies education."""
    parsed = {"name": "Sam Lee", "education": {"university": None}}

    monkeypatch.setattr(le, "_try_pdl", lambda url: (None, "pdl"))
    monkeypatch.setattr(le, "_try_brightdata", lambda url: ({"raw": "bd"}, "brightdata"))

    def fake_llm(raw, src):
        if src == "brightdata":
            return {"education": {"university": "NYU", "major": "Finance", "graduation": "2025"}}
        return {"education": {}}

    monkeypatch.setattr(le, "llm_enrich_profile", fake_llm)

    out = le.backfill_education(parsed, "https://www.linkedin.com/in/samlee")

    assert out["education"]["university"] == "NYU"
    assert out["education"]["major"] == "Finance"


@pytest.mark.unit
def test_backfill_education_noop_when_already_present(monkeypatch):
    """If education already has a university (e.g. PDL/Bright Data won the tier
    loop), no extra provider call is made."""
    parsed = {"name": "Pat Kim", "education": {"university": "MIT", "major": "CS"}}

    called = {"pdl": False, "brightdata": False}

    def pdl(url):
        called["pdl"] = True
        return (None, "pdl")

    def bd(url):
        called["brightdata"] = True
        return (None, "brightdata")

    monkeypatch.setattr(le, "_try_pdl", pdl)
    monkeypatch.setattr(le, "_try_brightdata", bd)

    out = le.backfill_education(parsed, "https://www.linkedin.com/in/patkim")

    assert out["education"]["university"] == "MIT"
    assert called["pdl"] is False
    assert called["brightdata"] is False


@pytest.mark.unit
def test_backfill_education_handles_no_education_anywhere(monkeypatch):
    """No provider has education -> structure unchanged, no crash."""
    parsed = {"name": "No Edu", "education": {"university": None}}

    monkeypatch.setattr(le, "_try_pdl", lambda url: ({"raw": "pdl"}, "pdl"))
    monkeypatch.setattr(le, "_try_brightdata", lambda url: ({"raw": "bd"}, "brightdata"))
    monkeypatch.setattr(le, "llm_enrich_profile", lambda raw, src: {"education": {}})

    out = le.backfill_education(parsed, "https://www.linkedin.com/in/noedu")

    assert out["education"]["university"] is None
