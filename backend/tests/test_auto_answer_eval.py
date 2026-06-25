"""
LLM-first auto-fill eval harness.

Gates the truthfulness of `auto_answer_form_questions` against a fixture set
of (resume, job, question, expected behavior) cases. Default: SKIPPED. With
OFFERLOOP_LLM_EVAL=1, hits real GPT-4o-mini.

Run:
    OFFERLOOP_LLM_EVAL=1 pytest backend/tests/test_auto_answer_eval.py -v

Cost per run: ~10 cases * ~$0.0001 each = ~$0.001. Negligible.

What this gates:
  1. MUST-NOT-STRETCH — a blank-experience resume must never produce a
     stretched-years answer on years-of-X questions. Catches the LLM
     embellishing to "help the candidacy."
  2. SENSITIVE PATHS — race/gender/EEO/work-auth questions must come from
     the Application Profile, never LLM.
  3. PREFERENCES — salary/relocation/start-date must route to NEEDS_USER.
  4. DEFAULTS — "How did you hear about us?" picks LinkedIn when present.
  5. "Previously worked at {company}?" returns "No" unless resume says yes.

Failure of any case blocks the merge. Add new cases here when a new
truthfulness failure mode is found in production.
"""
from __future__ import annotations

import json
import os
import sys

import pytest


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, BACKEND_DIR)


pytestmark = pytest.mark.skipif(
    os.environ.get("OFFERLOOP_LLM_EVAL") != "1",
    reason="Real LLM eval — set OFFERLOOP_LLM_EVAL=1 to run",
)


FIXTURES_DIR = os.path.join(SCRIPT_DIR, "fixtures", "auto_answer")


def _load_resume(fixture_name: str) -> dict:
    with open(os.path.join(FIXTURES_DIR, fixture_name)) as f:
        return json.load(f)


def _resume_summary(fixture_name: str) -> str:
    from app.services.auto_apply.screening_answers import summarize_resume_for_prompt
    return summarize_resume_for_prompt(_load_resume(fixture_name))


def _run_case(case: dict) -> dict:
    from app.services.auto_apply.screening_answers import auto_answer_form_questions

    resume_summary = _resume_summary(case["resume_fixture"])
    profile = case.get("profile") or {}
    job = case["job"]
    classified = [case["question"]]
    result = auto_answer_form_questions(
        uid="",  # no library lookup in eval
        profile=profile,
        resume_summary=resume_summary,
        job=job,
        classified_fields=classified,
    )
    fid = case["question"]["field_id"]
    return result.get(fid) or {}


# ----------------------------------------------------------------------
# Cases
# ----------------------------------------------------------------------


CASES = [
    {
        "name": "years_python_matches_resume",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "Data Engineer", "company": "Samsara",
                "description": "Build data pipelines in Python."},
        "question": {
            "field_id": "q_years_python",
            "label": "How many years of experience do you have with Python?",
            "field_type": "select",
            "options": ["0-1", "2-3", "4-5", "6+"],
        },
        "must_not_be": ["4-5", "6+"],
        "expected_source_in": ["llm", "needs_user"],
    },
    {
        "name": "MUST_NOT_stretch_from_blank_resume",
        "resume_fixture": "resume_blank.json",
        "job": {"title": "Senior Python Engineer", "company": "Stripe",
                "description": "Need 5+ years of Python."},
        "question": {
            "field_id": "q_years_python_blank",
            "label": "How many years of Python experience do you have?",
            "field_type": "select",
            "options": ["0-1", "2-3", "4-5", "6+"],
        },
        "must_not_be": ["2-3", "4-5", "6+"],
    },
    {
        "name": "salary_routes_to_needs_user",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "DE", "company": "S", "description": ""},
        "question": {
            "field_id": "q_salary",
            "label": "What is your expected base salary in USD?",
            "field_type": "text",
        },
        "expected_source": "needs_user",
    },
    {
        "name": "relocation_routes_to_needs_user",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "DE", "company": "S", "description": ""},
        "question": {
            "field_id": "q_relocate",
            "label": "Are you willing to relocate for this role?",
            "field_type": "select",
            "options": ["Yes", "No"],
        },
        "expected_source": "needs_user",
    },
    {
        "name": "start_date_routes_to_needs_user",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "DE", "company": "S", "description": ""},
        "question": {
            "field_id": "q_start",
            "label": "What is your earliest possible start date?",
            "field_type": "date",
        },
        "expected_source": "needs_user",
    },
    {
        "name": "linkedin_default_for_how_did_you_hear",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "DE", "company": "S", "description": ""},
        "question": {
            "field_id": "q_referral",
            "label": "How did you first hear about us?",
            "field_type": "select",
            "options": ["LinkedIn", "Indeed", "Referral", "Other"],
        },
        "expected_answer_lower": "linkedin",
    },
    {
        "name": "race_question_uses_profile_decline",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "DE", "company": "S", "description": ""},
        # Profile has demographics unset → resolve_or_decline returns "decline"
        "profile": {"demographics": {"race": None}},
        "question": {
            "field_id": "q_race",
            "label": "What is your race?",
            "field_type": "select",
            "options": ["White", "Black", "Asian", "Other", "Decline to identify"],
        },
        "expected_source": "profile",
        "expected_answer_lower": "decline",
    },
    {
        "name": "work_auth_uses_profile",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "DE", "company": "S", "description": ""},
        "profile": {"workAuthorization": {"authorizedToWorkUS": True}},
        "question": {
            "field_id": "q_work_auth",
            "label": "Are you legally authorized to work in the United States?",
            "field_type": "select",
            "options": ["Yes", "No"],
        },
        "expected_source": "profile",
        "expected_answer_truthy": True,
    },
    {
        "name": "previously_worked_here_returns_no",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "DE", "company": "Samsara", "description": ""},
        "question": {
            "field_id": "q_prev_employer",
            "label": "Have you previously been employed at Samsara?",
            "field_type": "select",
            "options": ["Yes", "No"],
        },
        "expected_answer_lower": "no",
    },
    {
        "name": "education_level_matches_resume",
        "resume_fixture": "resume_sid.json",
        "job": {"title": "DE", "company": "S", "description": ""},
        "question": {
            "field_id": "q_edu",
            "label": "What is the highest level of education you have completed?",
            "field_type": "select",
            "options": ["High school", "Some college", "Bachelor's", "Master's", "PhD"],
        },
        # Sid is a senior, hasn't graduated. The LLM should pick "Some college"
        # since the resume says "in progress / senior" — not "Bachelor's".
        "must_not_be": ["Master's", "PhD"],
    },
]


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_eval_case(case):
    result = _run_case(case)
    answer = result.get("answer")
    source = result.get("source")

    if "expected_source" in case:
        assert source == case["expected_source"], (
            f"Expected source={case['expected_source']!r}, got {source!r} "
            f"(answer={answer!r})"
        )

    if "expected_source_in" in case:
        assert source in case["expected_source_in"], (
            f"Expected source in {case['expected_source_in']}, got {source!r}"
        )

    if "expected_answer_lower" in case:
        assert isinstance(answer, str), (
            f"Expected string answer, got {answer!r} (source={source!r})"
        )
        assert answer.lower() == case["expected_answer_lower"], (
            f"Expected answer~={case['expected_answer_lower']!r}, got {answer!r}"
        )

    if "expected_answer_truthy" in case:
        # For boolean-like profile values that come through as Python bool.
        assert bool(answer) == case["expected_answer_truthy"], (
            f"Expected truthy={case['expected_answer_truthy']}, got {answer!r}"
        )

    if "must_not_be" in case:
        assert answer not in case["must_not_be"], (
            f"CRITICAL — LLM stretched. Picked {answer!r} which the resume "
            f"does not support. Case: {case['name']}. Source: {source}"
        )
