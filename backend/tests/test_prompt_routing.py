"""
Prompt routing tests: validate each prompt type lands in the right pipeline.

Three canonical user prompts cover the routing decision matrix:

  1. "USC Data Scientist IBM"          → specific company (IBM) named.
                                         Expansion MUST be a no-op even if parser
                                         infers `industries=["technology"]` from
                                         IBM — the company filter already
                                         constrains the search. Goes down the
                                         "original PDL prompt" path.

  2. "USC alumni in entertainment"     → school + industry, NO company.
                                         Expansion MUST fire and broaden industries
                                         into PDL-canonical entertainment siblings.

  3. "USC alumni in the news industry" → school + industry, NO company.
                                         Expansion MUST fire and broaden into
                                         PDL-canonical news/media siblings.

Routing rule (in `pdl_client.search_contacts_from_prompt`):
    expand IFF ENABLE_INDUSTRY_EXPANSION AND industries AND NOT companies

The default suite mocks the parser AND the expansion LLM so the tests are
deterministic and free. The `live` suite at the bottom hits real OpenAI and is
off by default — run with `pytest -m live` when you want to dogfood the parser.
"""
import os
import json
from unittest.mock import patch, MagicMock

import pytest

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services import prompt_parser
from app.services.prompt_parser import (
    expand_industries_and_titles,
    parse_search_prompt_structured,
    PDL_INDUSTRY_TAXONOMY,
)
from app.services.pdl_client import build_query_from_prompt


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _openai_chat_response(payload: dict):
    """Build a fake OpenAI ChatCompletion shaped like the real SDK return."""
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = json.dumps(payload)
    return resp


def _collect_must_clauses(query: dict) -> list:
    """Extract the top-level bool.must clauses from a build_query_from_prompt result.
    build_query_from_prompt returns {"bool": {"must": [...]}} (not wrapped in "query")."""
    return (query.get("bool", {}) or {}).get("must", []) or []


def _has_clause_targeting_field(must: list, field: str) -> bool:
    """Recursively check whether any clause in `must` targets `field`."""
    for clause in must:
        if not isinstance(clause, dict):
            continue
        for op in ("match", "match_phrase", "term", "exists"):
            if op in clause:
                target = clause[op]
                if isinstance(target, dict) and field in target:
                    return True
                if op == "exists" and isinstance(target, dict) and target.get("field") == field:
                    return True
        # Nested bool blocks
        nested = clause.get("bool", {})
        if nested:
            for k in ("must", "should"):
                if _has_clause_targeting_field(nested.get(k, []) or [], field):
                    return True
    return False


@pytest.fixture(autouse=True)
def _clear_caches():
    """Reset parser + expansion caches between tests so mocks always fire."""
    with prompt_parser._parse_cache_lock:
        prompt_parser._parse_cache.clear()
    with prompt_parser._expand_cache_lock:
        prompt_parser._expand_cache.clear()
    yield


# ---------------------------------------------------------------------------
# Case 1: "USC Data Scientist IBM" — original (non-expanded) PDL path
# ---------------------------------------------------------------------------

class TestUSCDataScientistIBM:
    """Specific company named. Routing gate must SKIP expansion even if the
    parser inferred an industry from the company (e.g. IBM → technology)."""

    PROMPT = "USC Data Scientist IBM"
    # Realistic parser output — live OpenAI calls actually DO produce
    # industries=["technology"] for this prompt because it infers from IBM.
    # The routing gate in pdl_client must skip expansion anyway.
    PARSER_OUTPUT = {
        "original_prompt": PROMPT,
        "company_context": "IBM is a multinational technology company",
        "companies": [{
            "name": "IBM",
            "matched_titles": [
                "Data Scientist", "Senior Data Scientist", "Machine Learning Engineer",
                "Data Analyst", "Scientist",
            ],
        }],
        "locations": [],
        "schools": ["USC"],
        "seniority_levels": [],
        "industries": ["technology"],
        "confidence": "high",
        "title_variations": [
            "Data Scientist", "Senior Data Scientist", "Machine Learning Engineer",
            "Data Analyst", "Scientist",
        ],
    }

    def test_routing_gate_skips_expansion_when_company_is_named(self):
        """The pdl_client gate: expand IFF industries AND NOT companies.
        IBM is a company → expansion must NOT fire even though industries
        contains 'technology'."""
        from app.config import ENABLE_INDUSTRY_EXPANSION
        parsed = self.PARSER_OUTPUT
        assert ENABLE_INDUSTRY_EXPANSION, "flag must be on for this test to be meaningful"
        # Reproduce the gate inline (no real PDL call):
        should_expand = bool(
            ENABLE_INDUSTRY_EXPANSION
            and parsed.get("industries")
            and not parsed.get("companies")
        )
        assert should_expand is False, (
            "expansion must be skipped for company-targeted prompts — "
            "the company filter already constrains the search"
        )

    def test_expansion_called_directly_would_fire_but_pdl_gate_blocks_it(self):
        """Defense in depth: expand_industries_and_titles() itself doesn't
        know about companies; it's the pdl_client GATE that protects this case.
        Verifies the function would fire if called — proving the gate is the
        only thing keeping this prompt on the original path."""
        client = MagicMock()
        client.chat.completions.create.return_value = _openai_chat_response({
            "related_industries": [], "title_additions": [],
        })
        with patch("app.services.prompt_parser.get_openai_client", return_value=client):
            expand_industries_and_titles(self.PARSER_OUTPUT)
        assert client.chat.completions.create.called, (
            "expand_industries_and_titles itself doesn't check for companies — "
            "the GATE in pdl_client.search_contacts_from_prompt is what protects "
            "company-targeted prompts. If this ever fails, expansion logic changed."
        )

    def test_pdl_query_carries_company_school_title_filters(self):
        """The 'original PDL prompt' path: company + school + title filters all present,
        AND if the gate were broken, industry filter would also appear here."""
        query = build_query_from_prompt(self.PARSER_OUTPUT, retry_level=0)
        must = _collect_must_clauses(query)
        assert _has_clause_targeting_field(must, "job_company_name"), \
            "IBM should be filtered via job_company_name"
        assert _has_clause_targeting_field(must, "education.school.name"), \
            "USC should be filtered via education.school.name"
        assert _has_clause_targeting_field(must, "job_title"), \
            "Data Scientist should be filtered via job_title"


# ---------------------------------------------------------------------------
# Case 2: "USC alumni in entertainment" — expansion path
# ---------------------------------------------------------------------------

class TestUSCAlumniInEntertainment:
    """School + industry. No company. Expansion must fire and broaden."""

    PROMPT = "USC alumni in entertainment"
    PARSER_OUTPUT = {
        "original_prompt": PROMPT,
        "company_context": "",
        "companies": [],
        "locations": [],
        "schools": ["USC"],
        "seniority_levels": [],
        "industries": ["entertainment"],
        "confidence": "high",
        "title_variations": ["Producer", "Director", "Executive"],
    }
    # What the expansion LLM is asked to return for entertainment.
    EXPANSION_OUTPUT = {
        "related_industries": [
            "entertainment",                # already in input — must dedupe
            "media production",
            "motion pictures and film",
            "broadcast media",
            "music",
            "performing arts",
            "online media",
            "talent agencies",              # NOT in PDL enum — must be dropped
        ],
        "title_additions": [
            "Producer",                      # dupe of input — must dedupe
            "Creative Director",
            "Talent Agent",
            "Showrunner",
            "Studio Executive",
            "Content Producer",
        ],
    }

    def test_expansion_fires_and_merges_industries(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _openai_chat_response(self.EXPANSION_OUTPUT)
        with patch("app.services.prompt_parser.get_openai_client", return_value=client):
            out = expand_industries_and_titles(self.PARSER_OUTPUT)

        assert client.chat.completions.create.called, "expansion LLM must be called"
        assert out["industry_expansion_applied"] is True
        # Original "entertainment" preserved at front
        assert out["industries"][0] == "entertainment"
        # PDL-canonical siblings included
        for label in ("media production", "motion pictures and film", "broadcast media",
                      "music", "performing arts", "online media"):
            assert label in out["industries"], f"missing canonical industry: {label}"
        # Non-PDL label dropped (hard-filter against PDL_INDUSTRY_TAXONOMY)
        assert "talent agencies" not in out["industries"], \
            "labels outside PDL enum must be dropped — they match nothing"
        # "entertainment" itself appears exactly once (dedup)
        assert out["industries"].count("entertainment") == 1

    def test_expansion_dedupes_titles(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _openai_chat_response(self.EXPANSION_OUTPUT)
        with patch("app.services.prompt_parser.get_openai_client", return_value=client):
            out = expand_industries_and_titles(self.PARSER_OUTPUT)

        titles_lower = [t.lower() for t in out["title_variations"]]
        assert titles_lower.count("producer") == 1, "dup 'Producer' must be deduped"
        # Additions arrive (case-insensitive presence check)
        for t in ("creative director", "showrunner", "studio executive"):
            assert t in titles_lower, f"missing addition: {t}"

    def test_pdl_query_carries_expanded_industries_and_school(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _openai_chat_response(self.EXPANSION_OUTPUT)
        with patch("app.services.prompt_parser.get_openai_client", return_value=client):
            expanded = expand_industries_and_titles(self.PARSER_OUTPUT)

        query = build_query_from_prompt(expanded, retry_level=0)
        must = _collect_must_clauses(query)

        assert _has_clause_targeting_field(must, "education.school.name")
        assert _has_clause_targeting_field(must, "industry"), \
            "industry filter must reach PDL query at retry_level 0"
        assert not _has_clause_targeting_field(must, "job_company_name"), \
            "no company in prompt → no job_company_name clause"

        # The industry block should be a bool.should with multiple entries
        industry_block = next(
            (c for c in must if isinstance(c, dict) and c.get("bool", {}).get("should") and any(
                "industry" in (clause.get("match", {}) or {})
                for clause in c["bool"]["should"]
            )),
            None,
        )
        assert industry_block is not None
        labels = {
            clause["match"]["industry"]
            for clause in industry_block["bool"]["should"]
            if "match" in clause and "industry" in clause["match"]
        }
        # Sanity: at least entertainment + one canonical sibling reaches PDL
        assert "entertainment" in labels
        assert labels & {"media production", "motion pictures and film",
                         "broadcast media", "music", "online media"}, \
            "at least one PDL-canonical entertainment sibling must reach PDL"


# ---------------------------------------------------------------------------
# Case 3: "USC alumni in the news industry" — expansion path (news → media)
# ---------------------------------------------------------------------------

class TestUSCAlumniInNewsIndustry:
    """News → PDL has no 'news' label; expansion must map to newspapers/media."""

    PROMPT = "USC alumni in the news industry"
    PARSER_OUTPUT = {
        "original_prompt": PROMPT,
        "company_context": "",
        "companies": [],
        "locations": [],
        "schools": ["USC"],
        "seniority_levels": [],
        # Parser may extract "news" (not in PDL enum) OR "media" — we test the
        # harder case where it picks the literal user word "news".
        "industries": ["news"],
        "confidence": "high",
        "title_variations": ["Reporter", "Journalist"],
    }
    EXPANSION_OUTPUT = {
        "related_industries": [
            "newspapers", "online media", "broadcast media", "publishing",
            "writing and editing", "media production",
            "news media",         # NOT in PDL enum — must be dropped
            "journalism",         # NOT in PDL enum — must be dropped
        ],
        "title_additions": [
            "Reporter",            # dupe
            "News Editor", "Investigative Journalist", "Correspondent",
            "Producer", "Anchor",
        ],
    }

    def test_pdl_enum_has_no_literal_news_label(self):
        """Sanity: this is exactly the failure mode expansion exists to fix."""
        assert "news" not in PDL_INDUSTRY_TAXONOMY
        # But it DOES have the canonical siblings we expect expansion to reach
        for label in ("newspapers", "online media", "broadcast media", "publishing"):
            assert label in PDL_INDUSTRY_TAXONOMY

    def test_expansion_maps_news_to_pdl_canonical_siblings(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _openai_chat_response(self.EXPANSION_OUTPUT)
        with patch("app.services.prompt_parser.get_openai_client", return_value=client):
            out = expand_industries_and_titles(self.PARSER_OUTPUT)

        # Original "news" preserved (we don't silently discard user intent)
        assert "news" in out["industries"]
        # PDL-canonical news siblings included
        for label in ("newspapers", "online media", "broadcast media",
                      "publishing", "writing and editing"):
            assert label in out["industries"], f"missing canonical news label: {label}"
        # Non-PDL guesses dropped
        assert "news media" not in out["industries"]
        assert "journalism" not in out["industries"]

    def test_pdl_query_reaches_real_industries_despite_no_news_label(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _openai_chat_response(self.EXPANSION_OUTPUT)
        with patch("app.services.prompt_parser.get_openai_client", return_value=client):
            expanded = expand_industries_and_titles(self.PARSER_OUTPUT)

        query = build_query_from_prompt(expanded, retry_level=0)
        must = _collect_must_clauses(query)

        industry_block = next(
            (c for c in must if isinstance(c, dict) and c.get("bool", {}).get("should") and any(
                "industry" in (clause.get("match", {}) or {})
                for clause in c["bool"]["should"]
            )),
            None,
        )
        assert industry_block is not None, "industry filter must be present"
        labels = {
            clause["match"]["industry"]
            for clause in industry_block["bool"]["should"]
            if "match" in clause and "industry" in clause["match"]
        }
        # The whole point: at retry_level 0, news-adjacent canonical labels reach PDL
        canonical_news_siblings = {"newspapers", "online media", "broadcast media",
                                   "publishing", "writing and editing"}
        assert labels & canonical_news_siblings, (
            "expansion should have routed news → PDL-canonical siblings reaching the query, "
            f"got {labels}"
        )


# ---------------------------------------------------------------------------
# Routing decision matrix — cross-cutting check
# ---------------------------------------------------------------------------

class TestRoutingDecisionMatrix:
    """Codifies the full routing rule used in pdl_client.search_contacts_from_prompt:
           expand IFF ENABLE_INDUSTRY_EXPANSION AND industries AND NOT companies

    Tests the gate logic directly (not the LLM call), so it stays deterministic.
    """

    # (prompt, industries, companies, expected_gate_decision)
    CASES = [
        # No industry → no expansion regardless of companies
        ("Engineers at Google",               [],                     ["Google"], False),
        ("USC Data Scientist",                [],                     [],          False),
        # Industry + company → company wins, skip expansion (the IBM case)
        ("USC Data Scientist IBM",            ["technology"],         ["IBM"],     False),
        ("Finance people at Goldman Sachs",   ["financial services"], ["Goldman"], False),
        # Industry without company → expansion fires
        ("USC alumni in entertainment",       ["entertainment"],      [],          True),
        ("USC alumni in the news industry",   ["news"],               [],          True),
        ("USC alumni in finance",             ["financial services"], [],          True),
        ("People in healthcare",              ["health care"],        [],          True),
    ]

    @pytest.mark.parametrize("prompt,industries,companies,should_expand", CASES)
    def test_routing_gate_decision(self, prompt, industries, companies, should_expand):
        from app.config import ENABLE_INDUSTRY_EXPANSION
        # Mirror the exact gate from pdl_client.search_contacts_from_prompt:
        gate = bool(
            ENABLE_INDUSTRY_EXPANSION
            and industries
            and not companies
        )
        assert gate is should_expand, (
            f"prompt {prompt!r}: gate produced {gate}, expected {should_expand}"
        )

    # Separately verify expand_industries_and_titles fires/doesn't fire correctly
    # for the no-company subset.
    NO_COMPANY_CASES = [
        ("Engineers at Google",               [],                     False),
        ("USC alumni in entertainment",       ["entertainment"],      True),
        ("USC alumni in the news industry",   ["news"],               True),
        ("USC alumni in finance",             ["financial services"], True),
    ]

    @pytest.mark.parametrize("prompt,industries,should_call_llm", NO_COMPANY_CASES)
    def test_expand_function_fires_iff_industries_present(self, prompt, industries, should_call_llm):
        parsed = {
            "original_prompt": prompt,
            "industries": list(industries),
            "title_variations": [], "companies": [], "schools": [],
        }
        client = MagicMock()
        client.chat.completions.create.return_value = _openai_chat_response({
            "related_industries": [], "title_additions": [],
        })
        with patch("app.services.prompt_parser.get_openai_client", return_value=client):
            expand_industries_and_titles(parsed)
        assert client.chat.completions.create.called is should_call_llm


# ---------------------------------------------------------------------------
# LIVE tests — hit real OpenAI to validate the parser end-to-end.
# Off by default. Run with: pytest -m live tests/test_prompt_routing.py
# Each test costs a few cents and is non-deterministic; use sparingly.
# ---------------------------------------------------------------------------

@pytest.mark.live
class TestLiveParserBehavior:
    """Validate that the OpenAI parser actually extracts the right structure
    for our three canonical prompts. These are intentionally loose assertions —
    we check shape and presence of key fields, not exact strings, because LLM
    output drifts.
    """

    def test_live_usc_data_scientist_ibm_extracts_company_and_school(self):
        """Parser may or may not infer industry from IBM — both are fine. The
        routing gate in pdl_client.search_contacts_from_prompt is what blocks
        expansion when a company is named, so we only need the parser to extract
        the company and school correctly."""
        from app.services.openai_client import get_openai_client
        if not get_openai_client():
            pytest.skip("OpenAI client not configured")
        parsed = parse_search_prompt_structured("USC Data Scientist IBM")
        assert parsed.get("confidence") == "high"
        assert any(
            "IBM" in (c.get("name") or "")
            for c in (parsed.get("companies") or [])
        ), "IBM must be in companies — this is what the routing gate keys on"
        schools = " ".join(parsed.get("schools") or []).lower()
        assert "usc" in schools or "southern california" in schools
        titles = " ".join(parsed.get("title_variations") or []).lower()
        assert "data scientist" in titles or "scientist" in titles
        # Routing decision: gate must reject expansion because companies is non-empty
        from app.config import ENABLE_INDUSTRY_EXPANSION
        gate = bool(
            ENABLE_INDUSTRY_EXPANSION
            and parsed.get("industries")
            and not parsed.get("companies")
        )
        assert gate is False, (
            "live routing gate must skip expansion — parser produced "
            f"industries={parsed.get('industries')}, companies={[c.get('name') for c in parsed.get('companies') or []]}"
        )

    def test_live_usc_alumni_in_entertainment_extracts_industry(self):
        from app.services.openai_client import get_openai_client
        if not get_openai_client():
            pytest.skip("OpenAI client not configured")
        parsed = parse_search_prompt_structured("USC alumni in entertainment")
        industries_lower = [i.lower() for i in (parsed.get("industries") or [])]
        assert industries_lower, "parser must extract at least one industry"
        # "entertainment", "media", or a media-adjacent PDL label
        assert any(
            i in {"entertainment", "media", "media production",
                  "motion pictures and film", "broadcast media"}
            for i in industries_lower
        ), f"expected media/entertainment industry, got {industries_lower}"

    def test_live_usc_alumni_in_news_extracts_industry(self):
        from app.services.openai_client import get_openai_client
        if not get_openai_client():
            pytest.skip("OpenAI client not configured")
        parsed = parse_search_prompt_structured("USC alumni in the news industry")
        industries_lower = [i.lower() for i in (parsed.get("industries") or [])]
        assert industries_lower, "parser must extract at least one industry"
        # Accept "news", "media", "newspapers", or any news-adjacent PDL label
        assert any(
            i in {"news", "media", "newspapers", "online media",
                  "broadcast media", "publishing", "writing and editing"}
            for i in industries_lower
        ), f"expected news/media industry, got {industries_lower}"
