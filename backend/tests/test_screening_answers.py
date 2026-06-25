"""Unit coverage for `_match_option` and the LLM batch prompt.

Gates the bug-handoff fixes (2026-06-22):
  - Robinhood gender "Male" must map to option "Man" and vice versa.
  - When the LLM returns an answer outside the options list (e.g.
    "I Acknowledge" against a Citizenship-Status combobox whose options are
    six (a)…(f) immigration statuses), `_match_option` returns None so the
    caller routes to NEEDS_USER instead of typing garbage.
  - `_BATCH_PROMPT` carries an explicit OPTIONS CONSTRAINT rule that
    overrides the auto-agree path — without this, the LLM falls back to
    "I Acknowledge" / "Yes" on combobox-shaped questions.

Pure-Python tests; no Playwright, no LLM, no external services.
"""
from __future__ import annotations

from app.services.auto_apply.screening_answers import (
    _BATCH_PROMPT,
    _match_option,
)


class TestMatchOptionGenderSynonyms:
    """Bug #2 from the handoff: profile gender 'Male' / 'Female' must map
    to Greenhouse tenants that label options 'Man' / 'Woman' (Robinhood)
    and vice versa."""

    def test_male_matches_man(self):
        assert _match_option("Male", ["Man", "Woman", "Non-binary"]) == "Man"

    def test_man_matches_male(self):
        assert _match_option("Man", ["Male", "Female", "Decline to answer"]) == "Male"

    def test_female_matches_woman(self):
        assert _match_option("Female", ["Man", "Woman"]) == "Woman"

    def test_woman_matches_female(self):
        assert _match_option("Woman", ["Male", "Female"]) == "Female"

    def test_case_insensitive(self):
        assert _match_option("male", ["Man", "Woman"]) == "Man"
        assert _match_option("MALE", ["Man", "Woman"]) == "Man"


class TestMatchOptionDeclineSynonyms:
    """Bug #2-adjacent: decline-flavored phrasings already worked. Lock
    them in so the gender step doesn't accidentally regress this."""

    def test_decline_to_self_identify(self):
        opts = ["Male", "Female", "I don't wish to answer"]
        assert _match_option("Decline to self-identify", opts) == "I don't wish to answer"

    def test_prefer_not_to_answer(self):
        opts = ["Yes, I have a disability", "No, I don't have a disability",
                "I don't wish to answer"]
        assert _match_option("Prefer not to answer", opts) == "I don't wish to answer"


class TestMatchOptionNoMatch:
    """Bug #1b: LLM returns 'I Acknowledge' against a Citizenship-Status
    combobox whose options are (a)…(f) immigration statuses. Must return
    None so the caller drops to NEEDS_USER. Typing a literal hallucination
    into a strict-validate select bounces the whole form."""

    def test_acknowledge_against_citizenship_options(self):
        opts = [
            "(a) U.S. citizen or U.S. national",
            "(b) Lawful permanent resident",
            "(c) Refugee or asylee",
            "(d) Other temporary work authorization",
            "(e) None of the above",
        ]
        assert _match_option("I Acknowledge", opts) is None

    def test_unrelated_string_returns_none(self):
        assert _match_option("Octopus", ["Yes", "No", "Maybe"]) is None

    def test_empty_options_returns_none(self):
        assert _match_option("Yes", []) is None
        assert _match_option("Yes", None) is None


class TestMatchOptionExactAndSubstring:
    """Sanity: the existing exact / substring matching steps still fire
    (so the new gender step doesn't shadow them)."""

    def test_exact_match(self):
        assert _match_option("Yes", ["Yes", "No"]) == "Yes"

    def test_substring_match(self):
        assert _match_option("Los Angeles", ["Los Angeles, California, United States"]) == \
            "Los Angeles, California, United States"


class TestBatchPromptOptionsConstraint:
    """Bug #1b prompt-side: the LLM kept ignoring `Options:` and returning
    free-text answers (e.g. 'I Acknowledge' on a six-option Citizenship
    combobox). Lock in that the prompt contains an explicit constraint
    overriding the auto-agree rule."""

    def test_prompt_has_options_constraint_section(self):
        assert "OPTIONS CONSTRAINT" in _BATCH_PROMPT

    def test_prompt_forbids_paraphrasing_options(self):
        assert "verbatim" in _BATCH_PROMPT.lower()

    def test_prompt_overrides_auto_agree_for_options(self):
        # The constraint must explicitly disable the auto-agree shortcut
        # when a field has options — otherwise the LLM defaults to
        # 'I Agree' on options-backed questions.
        assert "auto-agree" in _BATCH_PROMPT.lower()
        assert "Options:" in _BATCH_PROMPT  # the placeholder we tell the LLM to look for
