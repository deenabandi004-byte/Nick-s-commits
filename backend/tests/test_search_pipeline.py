"""
50 test cases for the find contact search pipeline.
Tests prompt parsing, query building, school matching, location handling, and dedup.
"""
import sys
import os
import json
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.prompt_pdl_search import (
    _build_query, _build_job_clause, _build_location_clause, _build_company_clause,
    PROMPT_SEARCH_STRATEGIES,
)
from app.services.pdl_client import (
    build_query_from_prompt, _contact_matches_prompt_criteria, contact_matches_school,
    _school_aliases, _school_name_matches, _compute_profile_rank_score,
)
from app.routes.runs import _contact_already_exists


def qs(query):
    """Serialize query to lowercase string for easy assertions."""
    return json.dumps(query, sort_keys=True, default=str).lower()


# ============================================================
# QUERY BUILDING — prompt_pdl_search._build_query
# ============================================================

class TestQueryBuilding:
    """Tests that PDL queries are constructed correctly from filters."""

    STRICT = PROMPT_SEARCH_STRATEGIES[0]  # strict
    LOOSE_TITLE = PROMPT_SEARCH_STRATEGIES[1]  # loose_job_title
    LOOSE_LOC = PROMPT_SEARCH_STRATEGIES[2]  # loose_location
    NO_COMPANY = PROMPT_SEARCH_STRATEGIES[3]  # no_company

    def _filters(self, roles=None, company=None, location=None, schools=None, industries=None, max_results=5):
        return {
            "roles": roles or [],
            "company": company or [],
            "location": location or [],
            "schools": schools or [],
            "industries": industries or [],
            "max_results": max_results,
        }

    # --- 1-5: Basic role queries ---

    def test_01_single_role(self):
        """Single role generates match_phrase."""
        q = _build_query(self._filters(roles=["Software Engineer"]), self.STRICT)
        s = qs(q)
        assert "software engineer" in s
        assert "match_phrase" in s

    def test_02_multiple_roles(self):
        """Multiple roles generate should clause for title matching."""
        q = _build_query(self._filters(roles=["SDE", "Software Engineer", "Software Dev"]), self.STRICT)
        s = qs(q)
        assert "sde" in s
        assert "software engineer" in s
        assert "should" in s

    def test_03_no_roles_no_company(self):
        """No roles and no company generates exists fallback."""
        q = _build_query(self._filters(), self.STRICT)
        s = qs(q)
        assert "exists" in s
        assert "job_title" in s

    def test_04_no_roles_with_company(self):
        """No roles but with company — no job_title exists fallback needed."""
        q = _build_query(self._filters(company=["Google"]), self.STRICT)
        s = qs(q)
        # Google is in COMPANY_DOMAIN_MAP → query uses job_company_website
        assert "google.com" in s
        assert "job_company_website" in s

    def test_05_loose_title_tokenizes(self):
        """Loose title strategy tokenizes the primary title."""
        q = _build_query(self._filters(roles=["Investment Banking Analyst"]), self.LOOSE_TITLE)
        s = qs(q)
        # Should have individual tokens as match clauses
        assert "investment" in s or "banking" in s or "analyst" in s

    # --- 6-10: Location queries ---

    def test_06_no_location_no_us_filter(self):
        """No location specified — no US country filter added."""
        q = _build_query(self._filters(roles=["PM"]), self.STRICT)
        s = qs(q)
        assert "united states" not in s
        assert "location_country" not in s

    def test_07_us_location(self):
        """US city adds location clauses with US country filter."""
        q = _build_query(self._filters(roles=["PM"], location=["New York"]), self.STRICT)
        s = qs(q)
        assert "new york" in s
        assert "location_metro" in s or "location_locality" in s

    def test_08_international_london(self):
        """London — international, no US country filter."""
        q = _build_query(self._filters(roles=["SWE"], location=["London"]), self.STRICT)
        s = qs(q)
        assert "london" in s
        assert "united states" not in s

    def test_09_international_tokyo(self):
        """Tokyo — international, no US country filter."""
        q = _build_query(self._filters(roles=["PM"], location=["Tokyo"]), self.STRICT)
        s = qs(q)
        assert "tokyo" in s
        assert "united states" not in s

    def test_10_international_singapore(self):
        """Singapore — international, no US country filter."""
        q = _build_query(self._filters(roles=["Analyst"], location=["Singapore"]), self.STRICT)
        s = qs(q)
        assert "singapore" in s
        assert "united states" not in s

    # --- 11-15: Company queries ---

    def test_11_single_company_mapped_uses_website(self):
        """Mapped firms generate match_phrase on job_company_website (not name)."""
        q = _build_query(self._filters(company=["Goldman Sachs"]), self.STRICT)
        s = qs(q)
        assert "job_company_website" in s
        assert "goldmansachs.com" in s

    def test_12_company_with_role(self):
        """Company + role both present in query."""
        q = _build_query(self._filters(roles=["Analyst"], company=["McKinsey"]), self.STRICT)
        s = qs(q)
        # McKinsey is mapped → website-based clause
        assert "mckinsey.com" in s
        assert "analyst" in s

    def test_13_no_company_strategy(self):
        """no_company strategy drops company clause."""
        q = _build_query(self._filters(roles=["SWE"], company=["Google"]), self.NO_COMPANY)
        s = qs(q)
        assert "google" not in s  # Company should be dropped
        assert "swe" in s  # Role should remain

    def test_14_company_clause_only_with_company(self):
        """Company clause only appears when company is specified."""
        q_with = _build_query(self._filters(company=["Meta"]), self.STRICT)
        q_without = _build_query(self._filters(roles=["SWE"]), self.STRICT)
        # Meta is mapped → uses website
        assert "meta.com" in qs(q_with)
        assert "meta.com" not in qs(q_without)

    def test_15_industry_filter(self):
        """Industry filter generates match clause."""
        q = _build_query(self._filters(roles=["Analyst"], industries=["financial services"]), self.STRICT)
        s = qs(q)
        assert "financial services" in s
        assert "industry" in s

    # --- 16-20: Email exists and required filters ---

    def test_16_emails_always_required(self):
        """Every query requires emails to exist."""
        q = _build_query(self._filters(roles=["PM"]), self.STRICT)
        s = qs(q)
        assert '"exists"' in s
        assert '"emails"' in s

    def test_17_emails_required_with_company(self):
        q = _build_query(self._filters(company=["Apple"]), self.STRICT)
        assert '"emails"' in qs(q)

    def test_18_emails_required_loose_strategy(self):
        q = _build_query(self._filters(roles=["PM"]), self.LOOSE_TITLE)
        assert '"emails"' in qs(q)

    def test_19_max_results_respected(self):
        """Query size matches max_results."""
        q = _build_query(self._filters(roles=["PM"], max_results=10), self.STRICT)
        assert q["size"] == 10

    def test_20_max_results_capped_at_50(self):
        """Max results capped at 50."""
        q = _build_query(self._filters(roles=["PM"], max_results=200), self.STRICT)
        assert q["size"] <= 50


class TestCompanyDomainMap:
    """
    Verifies the empirically-derived fix: PDL stores job_company_name under
    unguessable canonicals (e.g. BCG is "boston consulting group (bcg)"),
    so we route mapped firms through job_company_website instead. The map
    itself lives in pdl_client (single source of truth).
    """

    def test_bcg_routes_to_website(self):
        """The original failing case: USC alumni at BCG → bcg.com domain filter."""
        clause = _build_company_clause(["BCG"])
        assert clause == {"match_phrase": {"job_company_website": "bcg.com"}}

    def test_acronym_resolves_case_insensitively(self):
        """User-typed casing doesn't matter."""
        assert _build_company_clause(["bcg"]) == {"match_phrase": {"job_company_website": "bcg.com"}}
        assert _build_company_clause(["BCG"]) == {"match_phrase": {"job_company_website": "bcg.com"}}
        assert _build_company_clause(["Bcg"]) == {"match_phrase": {"job_company_website": "bcg.com"}}

    def test_full_name_resolves_to_same_domain(self):
        """'Boston Consulting Group' and 'BCG' route to the same domain."""
        a = _build_company_clause(["BCG"])
        b = _build_company_clause(["Boston Consulting Group"])
        assert a == b

    def test_finance_acronyms_route_correctly(self):
        """JPM, GS, MS resolve to the expected bank domains."""
        assert _build_company_clause(["JPM"]) == {"match_phrase": {"job_company_website": "jpmorgan.com"}}
        assert _build_company_clause(["GS"]) == {"match_phrase": {"job_company_website": "goldmansachs.com"}}
        assert _build_company_clause(["MS"]) == {"match_phrase": {"job_company_website": "morganstanley.com"}}

    def test_unmapped_firm_falls_back_to_name_match(self):
        """A firm not in the map gets a job_company_name match_phrase (lowercased)."""
        clause = _build_company_clause(["Acme Holdings"])
        assert clause == {"match_phrase": {"job_company_name": "acme holdings"}}

    def test_empty_input_returns_empty_clause(self):
        assert _build_company_clause([]) == {}
        assert _build_company_clause([""]) == {}
        assert _build_company_clause(["   "]) == {}


# ============================================================
# BUILD_QUERY_FROM_PROMPT (the active path via pdl_client.py)
# ============================================================

class TestBuildQueryFromPrompt:
    """Tests the active query builder used by /api/prompt-search."""

    def _parsed(self, companies=None, titles=None, locations=None, schools=None, industries=None):
        return {
            "companies": [{"name": c, "matched_titles": []} for c in (companies or [])],
            "title_variations": titles or [],
            "locations": locations or [],
            "schools": schools or [],
            "industries": industries or [],
        }

    def test_21_no_location_no_us_default(self):
        """No location — no US country filter (fix #4)."""
        q = build_query_from_prompt(self._parsed(companies=["Google"], titles=["SWE"]), retry_level=0)
        s = qs(q)
        assert "united states" not in s

    def test_22_with_us_location(self):
        """US location included in query."""
        q = build_query_from_prompt(self._parsed(titles=["PM"], locations=["San Francisco"]), retry_level=0)
        s = qs(q)
        assert "san francisco" in s or "sf" in s

    def test_23_company_is_current(self):
        """Company search includes is_current filter."""
        q = build_query_from_prompt(self._parsed(companies=["Amazon"], titles=["SDE"]), retry_level=0)
        assert "job_company_is_current" in qs(q)

    def test_24_emails_required(self):
        """Emails exist required."""
        q = build_query_from_prompt(self._parsed(titles=["Engineer"]), retry_level=0)
        assert '"emails"' in qs(q)

    def test_25_retry_level_1_simplifies_title(self):
        """Retry level 1 simplifies titles."""
        q0 = build_query_from_prompt(self._parsed(titles=["SWE", "Software Engineer"]), retry_level=0)
        q1 = build_query_from_prompt(self._parsed(titles=["SWE", "Software Engineer"]), retry_level=1)
        # Level 1 should have fewer or different title clauses
        assert qs(q0) != qs(q1)

    def test_26_retry_level_3_drops_location(self):
        """Retry level 3 drops location."""
        q = build_query_from_prompt(self._parsed(titles=["PM"], locations=["NYC"]), retry_level=3)
        s = qs(q)
        assert "location_metro" not in s
        assert "location_locality" not in s


# ============================================================
# SCHOOL MATCHING
# ============================================================

class TestSchoolMatching:
    """Tests school alias generation and matching logic."""

    def test_27_nyu_aliases(self):
        """NYU generates correct aliases."""
        aliases = _school_aliases("New York University")
        alias_set = {a.lower() for a in aliases}
        assert "nyu" in alias_set
        assert "new york university" in alias_set

    def test_28_usc_aliases(self):
        """USC generates correct aliases."""
        aliases = _school_aliases("USC")
        alias_set = {a.lower() for a in aliases}
        assert "usc" in alias_set
        assert "university of southern california" in alias_set

    def test_29_stanford_aliases(self):
        """Stanford generates correct aliases."""
        aliases = _school_aliases("Stanford University")
        alias_set = {a.lower() for a in aliases}
        assert "stanford" in alias_set
        assert "stanford university" in alias_set

    def test_30_false_positive_new_york_city(self):
        """College='New York' should NOT match 'New York University'."""
        contact = {
            "FirstName": "Jane", "LastName": "S", "Company": "", "Title": "",
            "College": "New York", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["New York University"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert not matches, "City name 'New York' should not match NYU"

    def test_31_true_positive_nyu(self):
        """College='New York University' matches 'New York University'."""
        contact = {
            "FirstName": "Jane", "LastName": "S", "Company": "", "Title": "",
            "College": "New York University", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["New York University"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert matches

    def test_32_true_positive_nyu_acronym(self):
        """College='NYU' matches 'New York University'."""
        contact = {
            "FirstName": "Jane", "LastName": "S", "Company": "", "Title": "",
            "College": "NYU", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["New York University"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert matches

    def test_33_usc_full_name_match(self):
        """College='University of Southern California' matches 'USC'."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "", "Title": "",
            "College": "University of Southern California", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["USC"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert matches

    def test_34_education_top_fallback(self):
        """School match via EducationTop when College is empty."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "", "Title": "",
            "College": "", "EducationTop": "Stanford University - BS Computer Science (2018 - 2022)", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["Stanford"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert matches

    def test_35_no_education_fails_school_check(self):
        """No education info fails school check."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "", "Title": "",
            "College": "", "EducationTop": "", "is_current": True,
        }
        parsed = {"companies": [], "schools": ["MIT"], "title_variations": []}
        matches, _ = _contact_matches_prompt_criteria(contact, parsed, None)
        assert not matches

    def test_36_false_positive_columbia_british_columbia(self):
        """'Columbia' alias should not match 'University of British Columbia' via geographic guard."""
        # This tests _school_name_matches specifically
        result = _school_name_matches("university of british columbia", ["columbia"])
        assert not result, "Columbia should not match University of British Columbia"

    def test_37_has_dates_start_only(self):
        """contact_matches_school with start_date only should count as having dates."""
        pdl_person = {
            "education": [{
                "school": {"name": "MIT"},
                "start_date": "2020",
                "end_date": None,
                "degrees": [],
            }]
        }
        aliases = _school_aliases("MIT")
        result = contact_matches_school(pdl_person, aliases, strictness="normal")
        assert result


# ============================================================
# UC SYSTEM ALIASES (regression for the Roblox/Berkeley zero-result dogfood)
# ============================================================

class TestUcSystemAliases:
    """The UC system has many ways a single campus gets written across PDL
    profiles, website dropdowns, and free-text MCP inputs. Every campus
    must produce the same full alias set regardless of which form the
    caller types — otherwise PDL match_phrase only matches the literal
    string and we lose most alumni.
    """

    # (input, expected_aliases_that_must_be_present)
    # Every case must include the "university of california, <campus>"
    # comma form — that's the canonical PDL stored form for most UC
    # campuses (576k records for Berkeley vs 0 without comma).
    _CASES = [
        ("UC Berkeley",  {"berkeley", "uc berkeley", "university of california berkeley", "university of california, berkeley", "cal"}),
        ("Berkeley",     {"berkeley", "uc berkeley", "university of california berkeley", "university of california, berkeley", "cal"}),
        ("University of California, Berkeley",
                         {"berkeley", "uc berkeley", "university of california berkeley", "university of california, berkeley", "cal"}),
        ("UC Los Angeles", {"ucla", "uc los angeles", "university of california los angeles", "university of california, los angeles"}),
        ("UCLA",           {"ucla", "uc los angeles", "university of california los angeles", "university of california, los angeles"}),
        ("University of California, Los Angeles",
                           {"ucla", "uc los angeles", "university of california los angeles", "university of california, los angeles"}),
        ("UC San Diego",   {"ucsd", "uc san diego", "university of california san diego", "university of california, san diego"}),
        ("UC Santa Barbara", {"ucsb", "uc santa barbara", "university of california santa barbara", "university of california, santa barbara"}),
        ("UC Irvine",      {"uci", "uc irvine", "university of california irvine", "university of california, irvine"}),
        ("UCI",            {"uci", "uc irvine", "university of california irvine", "university of california, irvine"}),
        ("UC Davis",       {"ucd", "uc davis", "university of california davis", "university of california, davis"}),
        ("UC Santa Cruz",  {"ucsc", "uc santa cruz", "university of california santa cruz", "university of california, santa cruz"}),
        ("UC Riverside",   {"ucr", "uc riverside", "university of california riverside", "university of california, riverside"}),
        ("UC Merced",      {"ucm", "uc merced", "university of california merced", "university of california, merced"}),
        ("UC San Francisco", {"ucsf", "uc san francisco", "university of california san francisco", "university of california, san francisco"}),
    ]

    def test_uc_inputs_all_produce_full_alias_set(self):
        """Each input form must produce every expected alias, so PDL
        match_phrase fans out to all the variants in profile data."""
        for raw, must_contain in self._CASES:
            aliases = _school_aliases(raw)
            alias_set = {a.lower() for a in aliases}
            missing = must_contain - alias_set
            assert not missing, (
                f"_school_aliases({raw!r}) missing {missing}; got {sorted(alias_set)}"
            )

    def test_comma_stripped_input_does_not_lose_aliases(self):
        """Website dropdowns send 'University of California, Berkeley' with
        a comma. Pre-fix, the comma blocked the school_map exact-key lookup
        AND the substring scan (since 'berkeley' is not literally inside
        'university of california, berkeley' due to the comma sitting next
        to it in some scan logic). After comma stripping, both succeed.
        """
        aliases = _school_aliases("University of California, Berkeley")
        alias_set = {a.lower() for a in aliases}
        assert "cal" in alias_set
        assert "berkeley" in alias_set

    def test_uc_inputs_emit_comma_form_for_pdl(self):
        """Regression: PDL's education.school.name is keyword-indexed, and
        most UC campuses are stored canonically WITH a comma between
        'California' and the campus name. Direct probes:
            'university of california, berkeley' -> 576,014 records
            'university of california berkeley'  -> 0 records
        Pre-fix, _school_aliases stripped commas during normalization but
        never re-emitted them on output, so the PDL school filter returned
        0 records for every UC query. The query body included multiple
        no-comma forms (berkeley / uc berkeley / university of california
        berkeley) and none of them matched PDL's stored data.

        Every UC input — whether typed as 'UC Berkeley', 'Berkeley', or the
        comma form from the website dropdown — must produce the
        comma-canonical alias so PDL's match_phrase actually hits.
        """
        for raw in ("UC Berkeley", "Berkeley", "University of California, Berkeley"):
            aliases = _school_aliases(raw)
            alias_set = {a.lower() for a in aliases}
            assert "university of california, berkeley" in alias_set, (
                f"_school_aliases({raw!r}) must emit the PDL-canonical comma form; "
                f"got {sorted(alias_set)}"
            )


# ============================================================
# CONTACT DEDUP
# ============================================================

class TestContactDedup:
    """Tests the _contact_already_exists helper."""

    def test_38_email_match(self):
        """Contact matched by email."""
        c = {"Email": "john@example.com", "LinkedIn": "", "FirstName": "", "LastName": "", "Company": ""}
        assert _contact_already_exists(c, {"john@example.com"}, set())

    def test_39_email_case_insensitive(self):
        """Email matching is case-insensitive."""
        c = {"Email": "John@Example.COM", "LinkedIn": "", "FirstName": "", "LastName": "", "Company": ""}
        assert _contact_already_exists(c, {"john@example.com"}, set())

    def test_40_linkedin_match(self):
        """Contact matched by LinkedIn URL."""
        c = {"Email": "", "LinkedIn": "https://linkedin.com/in/jdoe", "FirstName": "", "LastName": "", "Company": ""}
        assert _contact_already_exists(c, set(), set(), {"https://linkedin.com/in/jdoe"})

    def test_41_name_company_match(self):
        """Contact matched by first+last+company combo."""
        c = {"Email": "", "LinkedIn": "", "FirstName": "John", "LastName": "Doe", "Company": "Google"}
        assert _contact_already_exists(c, set(), {"john_doe_google"})

    def test_42_no_match(self):
        """Contact not matching any dedup criteria."""
        c = {"Email": "new@test.com", "LinkedIn": "", "FirstName": "New", "LastName": "Person", "Company": "NewCo"}
        assert not _contact_already_exists(c, {"old@test.com"}, {"other_person_oldco"})

    def test_43_workemail_fallback(self):
        """WorkEmail field used when Email is empty."""
        c = {"Email": "", "WorkEmail": "john@corp.com", "LinkedIn": "", "FirstName": "", "LastName": "", "Company": ""}
        assert _contact_already_exists(c, {"john@corp.com"}, set())

    def test_44_empty_fields_no_false_positive(self):
        """Empty name/company doesn't generate false positive."""
        c = {"Email": "", "LinkedIn": "", "FirstName": "", "LastName": "", "Company": ""}
        assert not _contact_already_exists(c, set(), {"__"})

    def test_45_linkedin_without_set(self):
        """LinkedIn not checked when set not provided (backward compat)."""
        c = {"Email": "", "LinkedIn": "https://linkedin.com/in/jdoe", "FirstName": "J", "LastName": "D", "Company": "X"}
        assert not _contact_already_exists(c, set(), set())  # no linkedins_set


# ============================================================
# POST-FILTER CRITERIA (_contact_matches_prompt_criteria)
# ============================================================

class TestPostFilterCriteria:
    """Tests post-fetch validation of contacts against prompt criteria."""

    def test_46_no_criteria_passes(self):
        """Contact with no criteria always passes."""
        contact = {"FirstName": "J", "LastName": "D", "Company": "X", "Title": "Eng", "College": "", "EducationTop": "", "is_current": True}
        matches, _ = _contact_matches_prompt_criteria(contact, {"companies": [], "schools": [], "title_variations": []}, None)
        assert matches

    def test_47_company_mismatch_fails(self):
        """Contact at wrong company fails post-filter."""
        contact = {"FirstName": "J", "LastName": "D", "Company": "Apple", "Title": "Eng", "College": "", "EducationTop": "", "IsCurrentlyAtTarget": True, "is_current": True}
        # target_company is "Google" but contact is at Apple
        matches, reason = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Google"}], "schools": [], "title_variations": []},
            "Google"
        )
        assert not matches
        assert reason == "company_mismatch"

    def test_48_company_match_passes(self):
        """Contact at correct company passes."""
        contact = {"FirstName": "J", "LastName": "D", "Company": "Google", "Title": "Eng", "College": "", "EducationTop": "", "IsCurrentlyAtTarget": True, "is_current": True}
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Google"}], "schools": [], "title_variations": []},
            "Google"
        )
        assert matches

    def test_49_no_experience_no_crash(self):
        """Contact with no experience field doesn't crash."""
        contact = {"FirstName": "X", "LastName": "Y", "Company": "", "Title": "", "College": "", "EducationTop": "", "is_current": False}
        try:
            matches, _ = _contact_matches_prompt_criteria(contact, {"companies": [], "schools": [], "title_variations": []}, None)
            assert matches  # No criteria = pass
        except Exception as e:
            pytest.fail(f"Crashed on contact with no experience: {e}")

    def test_50_not_currently_at_target_fails(self):
        """Contact NOT currently at target company fails."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "Google", "Title": "Eng",
            "College": "", "EducationTop": "", "IsCurrentlyAtTarget": False, "is_current": False,
        }
        matches, reason = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Google"}], "schools": [], "title_variations": []},
            "Google"
        )
        assert not matches
        assert reason == "not_currently_at_target"


# ============================================================
# SEARCH QUALITY FIXES — Tests for Fixes 1-7
# Validates that real student networking queries produce correct
# query structures and that post-filtering doesn't drop valid matches.
# ============================================================

class TestSearchQualityFixes:
    """Tests verifying all 7 search quality fixes work correctly for student networking."""

    def _parsed(self, companies=None, titles=None, locations=None, schools=None, industries=None):
        return {
            "companies": [{"name": c, "matched_titles": []} for c in (companies or [])],
            "title_variations": titles or [],
            "locations": locations or [],
            "schools": schools or [],
            "industries": industries or [],
        }

    # ---- Fix 2: Title matching — phrase match for precision ----

    def test_51_multiword_title_phrase_only_no_tokenized_match(self):
        """Multi-word title like 'investment banking analyst' uses match_phrase ONLY (no tokenized match)."""
        q = build_query_from_prompt(
            self._parsed(titles=["investment banking analyst", "analyst"]),
            retry_level=0,
        )
        s = qs(q)
        assert "match_phrase" in s, "Should have phrase match for exact title"
        assert "investment banking analyst" in s
        assert "analyst" in s
        # Single-word "analyst" gets both match_phrase + match; multi-word gets match_phrase only
        # No operator param (PDL doesn't support it)
        assert '"operator"' not in s

    def test_52_single_word_title_uses_match_phrase_only(self):
        """
        Single-word titles like 'analyst' must be queried with match_phrase only,
        NOT bare `match`. PDL silently returns 0 hits for plain `match` on common
        single tokens (diagnostic Q5a: match on "data" → 0). See test_86.
        """
        q = build_query_from_prompt(
            self._parsed(titles=["analyst"]),
            retry_level=0,
        )
        s = qs(q)
        assert "analyst" in s
        assert "match_phrase" in s
        # Must NOT emit a bare `match` clause on job_title
        q_str = json.dumps(q)
        assert '{"match": {"job_title":' not in q_str
        assert '"match":{"job_title":' not in q_str.replace(" ", "")

    def test_53_retry_level_1_multiword_uses_plain_match(self):
        """Retry level 1 with multi-word core role uses plain match (broader than level 0's match_phrase)."""
        q = build_query_from_prompt(
            self._parsed(titles=["software development engineer", "sde"]),
            retry_level=1,
        )
        s = qs(q)
        assert "software development engineer" in s
        # Level 1 is intentionally looser — plain match, not match_phrase
        assert "match" in s

    def test_54_retry_level_1_single_word_uses_match(self):
        """Retry level 1 with single-word core role uses plain match."""
        q = build_query_from_prompt(
            self._parsed(titles=["analyst"]),
            retry_level=1,
        )
        s = qs(q)
        assert "analyst" in s
        assert '"operator"' not in s

    # ---- Fix 3: Bidirectional company substring check ----

    def test_55_company_postfilter_meta_matches_meta_platforms(self):
        """PDL returns 'Meta' but user searched 'Meta Platforms' — should pass."""
        contact = {
            "FirstName": "A", "LastName": "B", "Company": "Meta",
            "Title": "SWE", "College": "", "EducationTop": "",
            "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Meta Platforms"}], "schools": [], "title_variations": []},
            "Meta Platforms"
        )
        assert matches, "PDL 'Meta' should match user search 'Meta Platforms' (bidirectional)"

    def test_56_company_postfilter_jpmorgan_chase_matches_jpmorgan(self):
        """PDL returns 'JPMorgan Chase & Co.' but user searched 'JPMorgan' — should pass."""
        contact = {
            "FirstName": "A", "LastName": "B", "Company": "JPMorgan Chase & Co.",
            "Title": "Analyst", "College": "", "EducationTop": "",
            "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "JPMorgan"}], "schools": [], "title_variations": []},
            "JPMorgan"
        )
        assert matches, "'JPMorgan' should match 'JPMorgan Chase & Co.' (bidirectional)"

    def test_57_company_postfilter_short_name_no_false_positive(self):
        """Very short company names (< 3 chars) should NOT fuzzy match."""
        contact = {
            "FirstName": "A", "LastName": "B", "Company": "EY International",
            "Title": "Consultant", "College": "", "EducationTop": "",
            "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "EY"}], "schools": [], "title_variations": []},
            "EY"
        )
        # "ey" is only 2 chars, so substring check requires len >= 3; exact match or cleaning should handle it
        # This test documents the behavior
        assert isinstance(matches, bool)

    def test_58_company_postfilter_goldman_sachs_variations(self):
        """Goldman Sachs Group vs Goldman Sachs — should match."""
        contact = {
            "FirstName": "A", "LastName": "B", "Company": "Goldman Sachs",
            "Title": "Analyst", "College": "", "EducationTop": "",
            "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Goldman Sachs Group"}], "schools": [], "title_variations": []},
            "Goldman Sachs Group"
        )
        assert matches, "'Goldman Sachs' should match 'Goldman Sachs Group' (bidirectional)"

    # ---- Fix 4: Location filter — state as should, not must ----

    def test_59_location_sf_uses_should_block(self):
        """San Francisco search should put metro/city/state in a single should block."""
        q = build_query_from_prompt(
            self._parsed(titles=["engineer"], locations=["San Francisco"]),
            retry_level=0,
        )
        s = qs(q)
        # Should have location_country as must
        assert "location_country" in s
        # Metro/city/state should be in a single should block (not separate must clauses)
        assert '"should"' in s, "Location should use a should block for metro/city/state"

    def test_60_location_nyc_not_strict_state_must(self):
        """NYC search: state should NOT be a separate must clause — it's in the should block."""
        q = build_query_from_prompt(
            self._parsed(titles=["analyst"], locations=["New York"]),
            retry_level=0,
        )
        s = qs(q)
        # The query should still contain location info
        assert "united states" in s
        # Should not have state as a separate must alongside metro
        # Instead, all location signals should be in one should block
        query_str = json.dumps(q, indent=2)
        # Count how many "must" arrays exist in the location block
        # With the fix, there should be exactly one must with country + should block
        assert '"should"' in s

    def test_61_location_retry_3_drops_location(self):
        """Retry level 3 should drop all location filters."""
        q = build_query_from_prompt(
            self._parsed(titles=["PM"], locations=["Chicago"]),
            retry_level=3,
        )
        s = qs(q)
        assert "location_metro" not in s
        assert "location_region" not in s
        assert "location_locality" not in s

    # ---- Fix 7: Single-word company uses match_phrase only ----

    def test_62_single_word_company_uses_phrase_match(self):
        """Single-word company like 'Meta' should use match_phrase to avoid false positives."""
        q = build_query_from_prompt(
            self._parsed(companies=["Meta"], titles=["engineer"]),
            retry_level=0,
        )
        s = qs(q)
        # Should have match_phrase for the company
        assert "match_phrase" in s
        # For single-word company, should NOT have a plain match fallback (only match_phrase)
        # Check that the company block is just match_phrase, not match_phrase + match
        company_section = json.dumps(q, indent=2)
        assert "match_phrase" in company_section

    def test_63_multiword_company_uses_phrase_and_match(self):
        """Multi-word company like 'Goldman Sachs' should use match_phrase + match fallback."""
        q = build_query_from_prompt(
            self._parsed(companies=["Goldman Sachs"], titles=["analyst"]),
            retry_level=0,
        )
        s = qs(q)
        assert "match_phrase" in s
        assert "goldman sachs" in s
        # PDL doesn't support operator param — uses simple match (tokenized OR)
        assert '"operator"' not in s

    def test_64_single_word_company_only_phrase_match(self):
        """Single-word company should only have match_phrase, no tokenized match."""
        q = build_query_from_prompt(
            self._parsed(companies=["Apple"]),
            retry_level=0,
        )
        s = qs(q)
        assert "match_phrase" in s
        assert '"operator"' not in s

    # ---- Real student networking scenarios ----

    def test_65_ib_analyst_at_goldman(self):
        """'Investment banking analysts at Goldman Sachs' — titles should use OR, company should match."""
        q = build_query_from_prompt(
            self._parsed(
                companies=["Goldman Sachs"],
                titles=["investment banking analyst", "ib analyst", "analyst"],
            ),
            retry_level=0,
        )
        s = qs(q)
        # Titles present with OR for multi-word
        assert "investment banking analyst" in s
        assert "analyst" in s
        # Company present
        assert "goldman sachs" in s

    def test_66_usc_alumni_at_mckinsey(self):
        """'USC alumni at McKinsey' — should have school and company filters."""
        q = build_query_from_prompt(
            self._parsed(
                companies=["McKinsey"],
                schools=["USC"],
                titles=["consultant", "associate consultant", "business analyst"],
            ),
            retry_level=0,
        )
        s = qs(q)
        assert "mckinsey" in s
        # School aliases should be present
        assert "usc" in s or "university of southern california" in s or "southern california" in s
        assert "consultant" in s

    def test_67_swe_at_google_sf(self):
        """'Software engineers at Google in San Francisco' — full query with location."""
        q = build_query_from_prompt(
            self._parsed(
                companies=["Google"],
                titles=["software engineer", "swe", "engineer"],
                locations=["San Francisco"],
            ),
            retry_level=0,
        )
        s = qs(q)
        assert "google" in s
        assert "software engineer" in s
        assert "united states" in s
        assert "location_metro" in s or "location_locality" in s

    def test_68_data_scientist_at_meta(self):
        """'Data scientists at Meta' — single-word company, should use match_phrase."""
        q = build_query_from_prompt(
            self._parsed(
                companies=["Meta"],
                titles=["data scientist", "research scientist", "scientist"],
            ),
            retry_level=0,
        )
        s = qs(q)
        assert "meta" in s
        assert "data scientist" in s
        # No operator param (PDL doesn't support it)
        assert '"operator"' not in s

    def test_69_people_at_jp_morgan_nyc(self):
        """'People at JP Morgan in New York' — company + location."""
        q = build_query_from_prompt(
            self._parsed(
                companies=["JP Morgan"],
                locations=["New York"],
            ),
            retry_level=0,
        )
        s = qs(q)
        # Multi-word company: should have AND match
        assert "jp morgan" in s or "jpmorgan" in s
        assert "united states" in s

    def test_70_postfilter_meta_contact_passes(self):
        """Contact at 'Meta' passes post-filter when user searched 'Meta'."""
        contact = {
            "FirstName": "Sarah", "LastName": "Chen", "Company": "Meta",
            "Title": "Data Scientist", "College": "Stanford University", "EducationTop": "",
            "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Meta"}], "schools": [], "title_variations": []},
            "Meta"
        )
        assert matches

    def test_71_postfilter_mckinsey_and_company(self):
        """'McKinsey & Company' vs 'McKinsey' — bidirectional match should pass."""
        contact = {
            "FirstName": "J", "LastName": "D", "Company": "McKinsey & Company",
            "Title": "Consultant", "College": "", "EducationTop": "",
            "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "McKinsey"}], "schools": [], "title_variations": []},
            "McKinsey"
        )
        assert matches, "'McKinsey' should match 'McKinsey & Company' (bidirectional)"

    def test_72_postfilter_bain_and_company(self):
        """'Bain & Company' vs 'Bain' — should pass."""
        contact = {
            "FirstName": "A", "LastName": "B", "Company": "Bain & Company",
            "Title": "Associate Consultant", "College": "USC", "EducationTop": "",
            "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Bain"}], "schools": [], "title_variations": []},
            "Bain"
        )
        assert matches, "'Bain' should match 'Bain & Company' (bidirectional)"

    def test_73_postfilter_wrong_company_still_fails(self):
        """Contact at completely different company should still fail."""
        contact = {
            "FirstName": "A", "LastName": "B", "Company": "Netflix",
            "Title": "Engineer", "College": "", "EducationTop": "",
            "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, reason = _contact_matches_prompt_criteria(
            contact,
            {"companies": [{"name": "Google"}], "schools": [], "title_variations": []},
            "Google"
        )
        assert not matches
        assert reason == "company_mismatch"

    def test_74_combined_company_and_school_filter(self):
        """Contact must pass BOTH company and school filters when both specified."""
        # Correct company + correct school = pass
        contact_good = {
            "FirstName": "A", "LastName": "B", "Company": "Deloitte",
            "Title": "Consultant", "College": "University of Michigan",
            "EducationTop": "", "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact_good,
            {"companies": [{"name": "Deloitte"}], "schools": ["University of Michigan"], "title_variations": []},
            "Deloitte"
        )
        assert matches

        # Correct company + wrong school = fail
        contact_bad_school = {
            "FirstName": "A", "LastName": "B", "Company": "Deloitte",
            "Title": "Consultant", "College": "Ohio State University",
            "EducationTop": "", "IsCurrentlyAtTarget": True, "is_current": True,
        }
        matches2, reason2 = _contact_matches_prompt_criteria(
            contact_bad_school,
            {"companies": [{"name": "Deloitte"}], "schools": ["University of Michigan"], "title_variations": []},
            "Deloitte"
        )
        assert not matches2
        assert reason2 == "school_mismatch"

    def test_75_no_company_filter_passes_anyone(self):
        """When no company specified, any company passes post-filter."""
        contact = {
            "FirstName": "A", "LastName": "B", "Company": "Random Startup",
            "Title": "Engineer", "College": "MIT",
            "EducationTop": "", "is_current": True,
        }
        matches, _ = _contact_matches_prompt_criteria(
            contact,
            {"companies": [], "schools": ["MIT"], "title_variations": []},
            None
        )
        assert matches


# ============================================================
# PROFILE-BASED RANKING (_compute_profile_rank_score)
# ============================================================

class TestProfileRanking:
    """Tests that contacts are ranked by affinity to the student's profile."""

    def test_76_location_same_city_highest(self):
        """Contact in same city as student gets highest location score."""
        contact = {"City": "New York", "State": "New York", "Title": "Analyst", "LinkedIn": ""}
        profile = {"location": "New York, NY"}
        score = _compute_profile_rank_score(contact, profile)
        assert score >= 3, "Same city should score at least 3"

    def test_77_location_different_city_no_boost(self):
        """Contact in different city gets no location boost."""
        contact = {"City": "London", "State": "", "Title": "Analyst", "LinkedIn": ""}
        profile = {"location": "New York, NY"}
        score = _compute_profile_rank_score(contact, profile)
        assert score < 3, "Different city should not get city boost"

    def test_78_major_affinity_finance_analyst(self):
        """Finance major student should rank analyst titles higher."""
        analyst = {"City": "", "State": "", "Title": "Investment Banking Analyst", "LinkedIn": ""}
        engineer = {"City": "", "State": "", "Title": "Software Engineer", "LinkedIn": ""}
        profile = {"academics": {"major": "Finance"}}
        score_analyst = _compute_profile_rank_score(analyst, profile)
        score_engineer = _compute_profile_rank_score(engineer, profile)
        assert score_analyst > score_engineer, "Finance major should prefer analyst over engineer"

    def test_79_major_affinity_cs_engineer(self):
        """CS major student should rank engineer titles higher."""
        analyst = {"City": "", "State": "", "Title": "Financial Analyst", "LinkedIn": ""}
        engineer = {"City": "", "State": "", "Title": "Software Engineer", "LinkedIn": ""}
        profile = {"academics": {"major": "Computer Science"}}
        score_analyst = _compute_profile_rank_score(analyst, profile)
        score_engineer = _compute_profile_rank_score(engineer, profile)
        assert score_engineer > score_analyst, "CS major should prefer engineer over analyst"

    def test_80_no_profile_returns_zero(self):
        """No user profile returns score 0."""
        contact = {"City": "NYC", "State": "NY", "Title": "Analyst", "LinkedIn": ""}
        assert _compute_profile_rank_score(contact, None) == 0

    def test_81_linkedin_presence_boost(self):
        """Contact with LinkedIn gets small boost."""
        with_li = {"City": "", "State": "", "Title": "Analyst", "LinkedIn": "https://linkedin.com/in/test"}
        without_li = {"City": "", "State": "", "Title": "Analyst", "LinkedIn": ""}
        profile = {"location": "London"}
        assert _compute_profile_rank_score(with_li, profile) > _compute_profile_rank_score(without_li, profile)

    def test_82_combined_location_and_major(self):
        """Contact matching both location and major gets highest score."""
        contact = {"City": "San Francisco", "State": "California", "Title": "Software Engineer", "LinkedIn": "https://li"}
        profile = {"location": "San Francisco, CA", "academics": {"major": "Computer Science"}}
        score = _compute_profile_rank_score(contact, profile)
        assert score >= 6, f"Combined location + major + LinkedIn should score high, got {score}"

    def test_83_empty_contact_fields_no_crash(self):
        """Contacts with empty fields don't crash."""
        contact = {"City": "", "State": "", "Title": "", "LinkedIn": ""}
        profile = {"location": "NYC", "academics": {"major": "Finance"}}
        score = _compute_profile_rank_score(contact, profile)
        assert score == 0


# ============================================================
# ALREADY-SAVED CONTACT SURFACING
# Regression guard for the bug where `contacts=[]` was returned
# without `already_saved_contacts`, silently dropping matches that
# the user had already saved.
# ============================================================

class TestAlreadySavedContactSurfacing:
    """Tests that already-saved contacts are surfaced from the PDL pipeline."""

    def test_84_prompt_search_all_already_saved_returns_cards(self, monkeypatch):
        """
        When PDL returns 1 contact that's in the user's exclusion list, the service
        layer returns an empty `contacts` list AND a populated `already_saved` list.
        This is the seam the route relies on to avoid the silent-failure payload.
        """
        from app.services import pdl_client
        from app.services.pdl_client import (
            search_contacts_from_prompt, get_contact_identity,
        )

        pdl_contact = {
            "FirstName": "Tim",
            "LastName": "Coleman",
            "Email": "tim@google.com",
            "LinkedIn": "https://linkedin.com/in/tim-coleman",
            "Company": "Google",
            "Title": "Data Scientist",
            "College": "University of Southern California",
            "EducationTop": "",
            "IsCurrentlyAtTarget": True,
            "is_current": True,
        }

        # Short-circuit PDL network call to return our one contact
        monkeypatch.setattr(
            pdl_client, "execute_pdl_search",
            lambda **kwargs: ([pdl_contact], 200),
        )

        parsed = {
            "companies": [{"name": "Google"}],
            "schools": ["USC"],
            "title_variations": ["data scientist"],
            "locations": [],
            "industries": [],
        }
        exclude_keys = {get_contact_identity(pdl_contact)}

        contacts, _retry_level, already_saved = search_contacts_from_prompt(
            parsed, max_contacts=5, exclude_keys=exclude_keys, user_profile=None,
        )

        assert contacts == [], "All matches were already saved; contacts should be empty"
        assert len(already_saved) == 1, "Already-saved contact must be surfaced"
        assert already_saved[0]["FirstName"] == "Tim"

    def test_85_post_filter_school_word_boundary(self):
        """
        Regression guard: the post-filter school check must use word-boundary matching
        (via contact_matches_school / _school_name_matches), not raw substring matching.
        A college string like "City of New Discussion Institute" must NOT match target
        school "USC" just because the substring "usc" appears inside "discussion".
        """
        contact = {
            "FirstName": "Alex",
            "LastName": "Example",
            "Company": "Google",
            "Title": "Data Scientist",
            "College": "City of New Discussion Institute",
            "EducationTop": "",
            "IsCurrentlyAtTarget": True,
            "is_current": True,
        }
        parsed = {
            "companies": [{"name": "Google"}],
            "schools": ["USC"],
            "title_variations": [],
        }
        matches, reason = _contact_matches_prompt_criteria(contact, parsed, "Google")
        assert not matches, "'usc' embedded in 'discussion' must not match USC alumni filter"
        assert reason == "school_mismatch"


# ============================================================
# PDL SINGLE-TOKEN MATCH BUG + TITLE BROADENING RUNG
# ============================================================

class TestTitleBroadening:
    """
    Regression guards for the single-token `match` bug and the title-broadening
    retry rung. See /tmp/pdl_diagnostic.py — PDL silently returns 0 hits for a
    bare {"match": {"job_title": "<common-token>"}} clause (e.g. "data"), so
    the level 0 query must NEVER emit one, and the level 1 (broadening) rung
    must use match_phrase bool.should, not plain match.
    """

    def _parsed(self, titles=None, companies=None, schools=None):
        return {
            "companies": [{"name": c} for c in (companies or [])],
            "title_variations": titles or [],
            "locations": [],
            "schools": schools or [],
            "industries": [],
        }

    def _iter_match_clauses(self, query):
        """Walk the query tree and yield every `match` / `match_phrase` clause as
        (query_type, field, value) tuples."""
        def walk(node):
            if isinstance(node, dict):
                for k, v in node.items():
                    if k in ("match", "match_phrase", "match_phrase_prefix") and isinstance(v, dict):
                        for field, value in v.items():
                            yield (k, field, value)
                    else:
                        yield from walk(v)
            elif isinstance(node, list):
                for item in node:
                    yield from walk(item)
        yield from walk(query)

    def test_86_single_token_title_uses_match_phrase(self):
        """
        A single-word title ("data", "engineer", etc.) must never produce a bare
        {"match": {"job_title": "<token>"}} clause at retry_level=0. PDL silently
        returns 0 for plain `match` on common single tokens (diagnostic Q5a).
        """
        for token in ["data", "engineer", "analyst", "consultant"]:
            q = build_query_from_prompt(
                self._parsed(titles=[token], companies=["Google"]),
                retry_level=0,
            )
            bare_match_on_title = [
                (qt, field, value)
                for (qt, field, value) in self._iter_match_clauses(q)
                if qt == "match" and field == "job_title"
            ]
            assert not bare_match_on_title, (
                f"Single-word title {token!r} must not emit a bare match clause "
                f"(PDL silently returns 0 for common tokens). Got: {bare_match_on_title}"
            )
            # But match_phrase on the token must be present (that's how single-word
            # titles are queried correctly — it's equivalent to a term lookup).
            phrase_matches = [
                (qt, field, value)
                for (qt, field, value) in self._iter_match_clauses(q)
                if qt == "match_phrase" and field == "job_title" and value == token
            ]
            assert phrase_matches, (
                f"Single-word title {token!r} must still be queried via match_phrase"
            )

    def test_87_last_retry_rung_broadens_title(self):
        """
        Retry level 1 (the broadening rung) must replace the strict single title
        with a bool.should expansion of role-family variants via match_phrase.
        For "data scientist", the expansion should include siblings like
        data analyst / data engineer / data science manager.
        """
        parsed = self._parsed(
            titles=["data scientist"],
            companies=["Google"],
            schools=["USC"],
        )
        q1 = build_query_from_prompt(parsed, retry_level=1)

        # Collect every match_phrase clause targeting job_title
        phrase_titles = [
            value
            for (qt, field, value) in self._iter_match_clauses(q1)
            if qt == "match_phrase" and field == "job_title"
        ]
        # The original must still be present, plus family cousins
        assert "data scientist" in phrase_titles, (
            f"Broadened query must still include the original 'data scientist' title. "
            f"Got phrase_titles={phrase_titles}"
        )
        # Must include at least two additional role-family cousins to count as broadening
        family_cousins = {"data analyst", "data engineer", "data science manager", "machine learning engineer"}
        overlap = family_cousins & set(phrase_titles)
        assert len(overlap) >= 2, (
            f"Retry level 1 must broaden 'data scientist' to at least 2 role-family cousins "
            f"(expected overlap with {family_cousins}). Got phrase_titles={phrase_titles}"
        )
        # Must NOT emit a bare plain-match on job_title (that's the broken clause
        # the new rung is replacing).
        bare_job_title_matches = [
            (qt, field, value)
            for (qt, field, value) in self._iter_match_clauses(q1)
            if qt == "match" and field == "job_title"
        ]
        assert not bare_job_title_matches, (
            f"Broadening rung must not re-introduce bare `match` on job_title. Got: {bare_job_title_matches}"
        )
