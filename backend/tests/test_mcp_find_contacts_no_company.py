"""Company-less people search through the MCP find_contacts pipeline.

Scout chat queries like "find investment banking analysts in Los Angeles that
graduated from USC" have no target company. The underlying PDL prompt search
supports industry/location/school queries without a company target; these
tests pin the MCP input schema + prompt synthesis + Scout action wrapper to
that capability.
"""
import pytest
from unittest.mock import patch

from app.mcp_server.schemas import FindContactsInput
from app.mcp_server.tools.find_contacts import (
    _build_parsed_prompt_manual,
    _synthesize_prompt,
)


# ── Input schema ─────────────────────────────────────────────────────────────

class TestFindContactsInputNoCompany:
    def test_role_and_location_without_company_validates(self):
        parsed = FindContactsInput.model_validate({
            "role": "investment banking analyst",
            "location": "Los Angeles",
            "school": "USC",
            "count": 1,
        })
        assert parsed.company == ""
        assert parsed.location == "Los Angeles"

    def test_company_only_still_validates(self):
        parsed = FindContactsInput.model_validate({"company": "Goldman Sachs", "count": 3})
        assert parsed.company == "Goldman Sachs"

    def test_no_search_criteria_rejected(self):
        with pytest.raises(Exception):
            FindContactsInput.model_validate({"count": 3})

    def test_location_only_rejected(self):
        # Location alone is too broad to spend credits on.
        with pytest.raises(Exception):
            FindContactsInput.model_validate({"location": "Los Angeles", "count": 3})


# ── Prompt synthesis ─────────────────────────────────────────────────────────

class TestSynthesizePromptNoCompany:
    def _parsed(self, **kw):
        return FindContactsInput.model_validate({"count": 1, **kw})

    def test_role_school_location_no_company(self):
        prompt = _synthesize_prompt(self._parsed(
            role="investment banking analyst", school="USC", location="Los Angeles",
        ))
        low = prompt.lower()
        assert "investment banking analyst" in low
        assert "usc" in low
        assert "los angeles" in low
        assert " at " not in f" {low} "  # no dangling "at <company>"

    def test_company_present_keeps_original_shape(self):
        prompt = _synthesize_prompt(self._parsed(
            company="Goldman Sachs", role="analyst", school="USC",
        ))
        assert "Goldman Sachs" in prompt

    def test_location_appended_to_company_search(self):
        prompt = _synthesize_prompt(self._parsed(
            company="Goldman Sachs", role="analyst", location="Los Angeles",
        ))
        assert "Los Angeles" in prompt


class TestManualParsedPromptNoCompany:
    def test_no_company_yields_empty_companies_and_location(self):
        parsed = FindContactsInput.model_validate({
            "role": "investment banking analyst",
            "location": "Los Angeles",
            "count": 1,
        })
        out = _build_parsed_prompt_manual(parsed)
        assert out["companies"] == []
        assert out["locations"] == ["Los Angeles"]


# ── Scout chat wrapper ───────────────────────────────────────────────────────

class TestScoutFindContactsNoCompany:
    def test_company_less_search_passes_through(self):
        from app.services.scout import contact_actions

        captured = {}

        def fake_handle(*, args, ip_hash, db, user_ctx):
            captured.update(args)
            return {"contacts": [{"name": "Jane Doe", "title": "IB Analyst"}]}

        with patch.object(contact_actions, "_db", return_value=object()), \
             patch("app.mcp_server.tools.find_contacts.handle", fake_handle):
            result = contact_actions.find_contacts_for_chat(
                "uid1", "free",
                company="",
                role="investment banking analyst",
                school="USC",
                location="Los Angeles",
                count=1,
            )
        assert result["count"] == 1
        assert captured["role"] == "investment banking analyst"
        assert captured["location"] == "Los Angeles"
        assert "company" not in captured or captured["company"] == ""

    def test_no_criteria_rejected(self):
        from app.services.scout import contact_actions
        result = contact_actions.find_contacts_for_chat(
            "uid1", "free", company="", role="", school="", location="", count=1,
        )
        assert result["count"] == 0
        assert result.get("code") == "BAD_REQUEST"
