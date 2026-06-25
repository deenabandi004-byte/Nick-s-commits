"""Tests for PDL career-interest expansion in intent_gates.

Validates:
  1. expand_intent_with_pdl unions PDL similar_titles into extra_interest_phrases
  2. _gate_by_interest reads BOTH career_interests AND extra_interest_phrases
  3. intent_hash changes when extras are added (cache invalidation)
  4. Failure modes degrade gracefully (PDL down → behaves as if expansion off)
"""
from unittest.mock import patch

from app.utils.intent_gates import (
    build_user_intent,
    expand_intent_with_pdl,
    _gate_by_interest,
    intent_hash,
    apply_intent_gates,
    _titles_for_interest,
    INTEREST_TO_TITLES,
)


def _profile(interests):
    return {"location": {"careerInterests": interests}}


def _job(title, requirements=None):
    j = {"title": title, "category": "", "structured": {}}
    if requirements:
        j["structured"]["requirements"] = requirements
    return j


class TestExpandIntentWithPdl:
    def test_no_interests_returns_intent_with_empty_extras(self):
        intent = build_user_intent(_profile([]))
        with patch("app.services.pdl_title_cache.get_or_enrich_title") as mock_pdl:
            out = expand_intent_with_pdl(intent)
            mock_pdl.assert_not_called()
            assert out["extra_interest_phrases"] == []

    def test_unions_similar_titles_and_cleaned_name(self):
        intent = build_user_intent(_profile(["Product Manager"]))
        with patch("app.services.pdl_title_cache.get_or_enrich_title") as mock_pdl:
            mock_pdl.return_value = {
                "cleaned_name": "product manager",
                "similar_titles": [
                    "Associate Product Manager",
                    "Senior Product Manager",
                    "APM",
                ],
                "levels": ["mid"],
                "role": "product",
                "sub_role": "",
            }
            out = expand_intent_with_pdl(intent)
            extras_lower = {e.lower() for e in out["extra_interest_phrases"]}
            assert "associate product manager" in extras_lower
            assert "apm" in extras_lower
            # The original "Product Manager" should NOT be duplicated.
            assert sum(1 for e in extras_lower if e == "product manager") <= 1

    def test_does_not_mutate_input(self):
        intent = build_user_intent(_profile(["Product Manager"]))
        original_extras = intent["extra_interest_phrases"]
        with patch("app.services.pdl_title_cache.get_or_enrich_title") as mock_pdl:
            mock_pdl.return_value = {
                "cleaned_name": "product manager",
                "similar_titles": ["APM"],
                "levels": [],
                "role": "",
                "sub_role": "",
            }
            out = expand_intent_with_pdl(intent)
            assert intent["extra_interest_phrases"] is original_extras
            assert intent["extra_interest_phrases"] == []
            assert out["extra_interest_phrases"]  # populated on new dict

    def test_pdl_failure_yields_empty_extras_no_crash(self):
        intent = build_user_intent(_profile(["Product Manager"]))
        with patch("app.services.pdl_title_cache.get_or_enrich_title") as mock_pdl:
            # Empty payload shape — what the cache returns on failure
            mock_pdl.return_value = {
                "cleaned_name": "Product Manager",
                "similar_titles": [],
                "levels": [],
                "role": "",
                "sub_role": "",
            }
            out = expand_intent_with_pdl(intent)
            assert out["extra_interest_phrases"] == []


class TestGateByInterestReadsBothFields:
    def test_pdl_synonym_saves_a_job_that_literal_match_would_drop(self):
        intent = build_user_intent(_profile(["Product Manager"]))
        job = _job("Associate Product Manager Intern")
        # Without expansion: gate keeps it because "product" and "manager" are
        # single-word keywords from "Product Manager" and they appear in the title.
        # That's actually the existing _interest_keywords behavior. To prove the
        # PDL pathway works, use a synonym that DOESN'T share substrings.
        job_apm = _job("APM Intern", requirements=["build roadmaps"])
        assert _gate_by_interest(job_apm, intent) is True  # dropped without PDL

        # With PDL extras adding "apm" as a phrase, the gate keeps it.
        with patch("app.services.pdl_title_cache.get_or_enrich_title") as mock_pdl:
            mock_pdl.return_value = {
                "cleaned_name": "product manager",
                "similar_titles": ["APM"],
                "levels": [],
                "role": "",
                "sub_role": "",
            }
            expanded = expand_intent_with_pdl(intent)
        assert _gate_by_interest(job_apm, expanded) is False  # kept

    def test_no_extras_no_change_in_behavior(self):
        intent = build_user_intent(_profile(["Data Science"]))
        job_match = _job("Data Science Intern")
        job_miss = _job("Marketing Coordinator")
        assert _gate_by_interest(job_match, intent) is False
        assert _gate_by_interest(job_miss, intent) is True


class TestDomainToTitleMapping:
    """The map bridges onboarding's domain phrases ("Data Science & Analytics")
    to canonical titles ("Data Scientist") so PDL has something to enrich."""

    def test_mapped_domain_returns_canonical_titles(self):
        out = _titles_for_interest("Data Science & Analytics")
        assert "Data Scientist" in out
        assert len(out) > 1

    def test_case_insensitive_lookup(self):
        a = _titles_for_interest("Investment Banking")
        b = _titles_for_interest("INVESTMENT BANKING")
        c = _titles_for_interest("investment   banking")  # extra whitespace
        assert a == b == c

    def test_unmapped_interest_falls_back_to_self(self):
        out = _titles_for_interest("Some Niche Domain We Don't Map")
        assert out == ["Some Niche Domain We Don't Map"]

    def test_empty_returns_empty(self):
        assert _titles_for_interest("") == []
        assert _titles_for_interest("   ") == []

    def test_expansion_includes_canonical_title_even_when_pdl_returns_nothing(self):
        """If PDL returns no synonyms (e.g., title too rare in PDL's dataset),
        we still inject the canonical titles from the map so the gate has SOME
        signal beyond the original domain phrase."""
        intent = build_user_intent(_profile(["Data Science & Analytics"]))
        with patch("app.services.pdl_title_cache.get_or_enrich_title") as mock_pdl:
            mock_pdl.return_value = {
                "cleaned_name": "",
                "similar_titles": [],
                "levels": [],
                "role": "",
                "sub_role": "",
            }
            out = expand_intent_with_pdl(intent)
            extras_lower = {e.lower() for e in out["extra_interest_phrases"]}
            # All canonical titles from the map should be in extras even with
            # zero PDL synonyms.
            assert "data scientist" in extras_lower
            assert "data analyst" in extras_lower

    def test_expansion_unions_pdl_synonyms_across_canonical_titles(self):
        intent = build_user_intent(_profile(["Investment Banking"]))
        # Different PDL response per call (different canonical titles).
        def pdl_side_effect(title):
            return {
                "cleaned_name": title.lower(),
                "similar_titles": [f"{title} synonym 1"],
                "levels": [],
                "role": "",
                "sub_role": "",
            }
        with patch("app.services.pdl_title_cache.get_or_enrich_title",
                   side_effect=pdl_side_effect) as mock_pdl:
            out = expand_intent_with_pdl(intent)
            # Should call PDL once per canonical title in the map.
            mapped = INTEREST_TO_TITLES["investment banking"]
            assert mock_pdl.call_count == len(mapped)
            # Each mapped title appears in extras.
            extras_lower = {e.lower() for e in out["extra_interest_phrases"]}
            for t in mapped:
                assert t.lower() in extras_lower


class TestIntentHashChangesWithExtras:
    def test_hash_changes_when_extras_are_added(self):
        base = build_user_intent(_profile(["Product Manager"]))
        with patch("app.services.pdl_title_cache.get_or_enrich_title") as mock_pdl:
            mock_pdl.return_value = {
                "cleaned_name": "product manager",
                "similar_titles": ["Associate Product Manager"],
                "levels": [],
                "role": "",
                "sub_role": "",
            }
            expanded = expand_intent_with_pdl(base)
        assert intent_hash(base) != intent_hash(expanded)

    def test_hash_stable_for_same_extras_in_different_order(self):
        intent_a = {"career_interests": ["pm"], "extra_interest_phrases": ["apm", "spm"]}
        intent_b = {"career_interests": ["pm"], "extra_interest_phrases": ["spm", "apm"]}
        assert intent_hash(intent_a) == intent_hash(intent_b)
