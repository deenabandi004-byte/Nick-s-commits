"""
Agent planner — loopMode emission tests.

Pins the planner's mode-aware behavior without calling Claude. The
`_build_prompt` function is pure (string in, string out) and
`_parse_plan` is pure (string + mode in, list out). Together they cover
the full mode-branching contract:

  - People mode: prompt mentions `find` and Rules force it; parser
    accepts a `find` action through.
  - Roles mode: prompt forbids `find` in the action list AND in the
    Rules; the parser drops any `find` action the LLM produces anyway
    (defense in depth).
  - Default behavior on missing/invalid mode falls back to "people"
    so old Loop docs keep working.

No Firestore, no Claude calls.
"""
from __future__ import annotations

import json

from app.services.agent_planner import (
    ROLES_FORBIDDEN_ACTIONS,
    VALID_LOOP_MODES,
    _build_prompt,
    _build_rules_section,
    _parse_plan,
    find_action_allowed,
)


# ── Constants contract ────────────────────────────────────────────────────


def test_valid_loop_modes_complete():
    """Catches missing updates when a new mode is added."""
    assert VALID_LOOP_MODES == {"people", "roles", "both"}


def test_roles_forbidden_includes_find():
    """`find` is the PDL bulk contact search — irrelevant in roles mode."""
    assert "find" in ROLES_FORBIDDEN_ACTIONS


def test_find_action_allowed_helper():
    """One helper drives both _build_prompt's action-list gate and
    _parse_plan's defense-in-depth drop — verify the rule it encodes."""
    assert find_action_allowed("people") is True
    assert find_action_allowed("both") is True
    assert find_action_allowed("roles") is False
    # Unknown / missing mode → planner falls back to "people" upstream, so
    # the helper itself is liberal (default to allowed).
    assert find_action_allowed("") is True
    assert find_action_allowed("potato") is True


# ── _build_rules_section ──────────────────────────────────────────────────


def test_rules_people_mandates_find():
    """People mode must keep the legacy 'ALWAYS include find' rule so the
    planner doesn't skip the core action."""
    rules = _build_rules_section("people", weekly_target=5)
    assert "ALWAYS include \"find\"" in rules
    assert "REQUIRED" in rules


def test_rules_roles_forbids_find_and_promotes_find_jobs():
    """Roles mode must replace the find-mandatory rule with a find_jobs-
    mandatory rule, and must explicitly tell the LLM never to emit `find`."""
    rules = _build_rules_section("roles", weekly_target=5)
    assert "find_jobs" in rules
    assert "NEVER plan a `find` action" in rules
    # Strict: no language that would push the LLM to emit `find`.
    assert "ALWAYS include \"find\"" not in rules


def test_rules_both_requires_both_pipelines():
    """Both mode must force the LLM to run BOTH find and find_jobs every
    cycle — neither pipeline may be starved while the other runs."""
    rules = _build_rules_section("both", weekly_target=5)
    # The rule mandating both pipelines is the load-bearing one.
    assert "BOTH at least one `find` action" in rules
    assert "at least one `find_jobs` action" in rules
    # No language forbidding `find` (which would be a roles-mode leak).
    assert "NEVER plan a `find` action" not in rules
    # The half/half budget allocation rule must be present.
    assert "half" in rules.lower()


# ── _build_prompt: people vs roles framing ────────────────────────────────


def _base_config(mode: str | None) -> dict:
    cfg = {
        "targetCompanies": ["Stripe", "Linear"],
        "targetIndustries": [],
        "targetRoles": ["Product Designer"],
        "targetLocations": ["SF Bay Area"],
        "weeklyContactTarget": 5,
        "preferAlumni": True,
    }
    if mode is not None:
        cfg["loopMode"] = mode
    return cfg


def _base_user_data() -> dict:
    return {
        "professionalInfo": {
            "university": "USC",
            "careerTrack": "Design",
            "graduationYear": "2027",
        },
        "careerInterests": ["design systems"],
    }


def _base_pipeline_state() -> dict:
    return {
        "totalContacts": 0,
        "companyCounts": {},
        "jobsPipeline": {},
        "hmPipeline": {},
        "discoveredCompanies": [],
        "contacts": [],
    }


def test_prompt_people_mode_mentions_find_action():
    prompt = _build_prompt(
        _base_config("people"), _base_user_data(), _base_pipeline_state(), {}
    )
    assert "Loop Mode: PEOPLE" in prompt
    # The action types section should include the `find` action verb.
    assert '"find" — search for contacts at a company' in prompt


def test_prompt_roles_mode_excludes_find_action():
    prompt = _build_prompt(
        _base_config("roles"), _base_user_data(), _base_pipeline_state(), {}
    )
    assert "Loop Mode: ROLES" in prompt
    # `find` MUST NOT appear in the offered action types — listing it
    # invites the LLM to emit it even when rules forbid it.
    assert '"find" — search for contacts at a company' not in prompt
    # `find_jobs` MUST still be offered (postings are the primary output).
    assert '"find_jobs"' in prompt


def test_prompt_both_mode_includes_find_and_find_jobs():
    """Both mode must keep `find` on the menu (networking is alive) AND
    have `find_jobs` (job-search is alive)."""
    prompt = _build_prompt(
        _base_config("both"), _base_user_data(), _base_pipeline_state(), {}
    )
    assert "Loop Mode: BOTH" in prompt
    assert '"find" — search for contacts at a company' in prompt
    assert '"find_jobs"' in prompt
    # The mode_block must mention the BOTH pipelines explicitly so the LLM
    # doesn't drift into a one-pipeline cycle.
    assert "balance" in prompt.lower() or "both" in prompt.lower()


def test_prompt_default_mode_is_people():
    """Missing loopMode → BOTH (loops-setup-v2 default). _build_prompt now
    defaults to "both" to match create_loop's persisted loopMode:"both" and
    loop_jobs' "both" fallback; assertion updated from PEOPLE. (Function name
    kept for now — flagged for rename to ..._is_both upstream.)"""
    prompt = _build_prompt(
        _base_config(None), _base_user_data(), _base_pipeline_state(), {}
    )
    assert "Loop Mode: BOTH" in prompt


def test_prompt_invalid_mode_falls_back_to_people():
    """Bogus loopMode in config falls back to BOTH (loops-setup-v2 default,
    defense in depth); assertion updated from PEOPLE. (Function name kept for
    now — flagged for rename to ..._falls_back_to_both upstream.)"""
    prompt = _build_prompt(
        _base_config("potato"), _base_user_data(), _base_pipeline_state(), {}
    )
    assert "Loop Mode: BOTH" in prompt


# ── _parse_plan: roles-mode guardrail ─────────────────────────────────────


def _plan_json(actions: list[dict]) -> str:
    return json.dumps(actions)


def test_parse_plan_roles_drops_find_action():
    """If the LLM emits `find` despite the rules, the parser drops it
    silently in roles mode so the dispatcher never runs PDL bulk search."""
    raw = _plan_json([
        {"action": "find", "company": "Stripe", "title": "Designer", "count": 3},
        {"action": "find_jobs", "company": "Stripe", "role": "Designer", "count": 5},
    ])
    plan = _parse_plan(raw, loop_mode="roles")
    assert [a["action"] for a in plan] == ["find_jobs"]


def test_parse_plan_people_keeps_find_action():
    """Regression: people mode must continue accepting `find`."""
    raw = _plan_json([
        {"action": "find", "company": "Stripe", "title": "Designer", "count": 3},
    ])
    plan = _parse_plan(raw, loop_mode="people")
    assert len(plan) == 1
    assert plan[0]["action"] == "find"


def test_parse_plan_both_keeps_find_and_find_jobs():
    """In both mode, neither `find` nor `find_jobs` is filtered — the
    student wants both pipelines to run."""
    raw = _plan_json([
        {"action": "find", "company": "Stripe", "title": "Designer", "count": 3},
        {"action": "find_jobs", "company": "Stripe", "role": "Designer", "count": 5},
    ])
    plan = _parse_plan(raw, loop_mode="both")
    assert [a["action"] for a in plan] == ["find", "find_jobs"]


def test_parse_plan_default_mode_keeps_find_action():
    """No mode passed = legacy people behavior."""
    raw = _plan_json([
        {"action": "find", "company": "Stripe", "title": "Designer", "count": 3},
    ])
    plan = _parse_plan(raw)
    assert plan[0]["action"] == "find"


def test_parse_plan_roles_keeps_other_actions():
    """Only `find` is forbidden in roles mode — other action verbs pass
    through normally."""
    raw = _plan_json([
        {"action": "discover_companies", "sourceCompany": "Stripe"},
        {"action": "find_jobs", "company": "Stripe", "role": "Designer", "count": 5},
        {"action": "find_hiring_managers", "company": "Stripe", "jobTitle": "Designer"},
        {"action": "follow_up", "contact_ids": ["c1"]},
        {"action": "skip", "reason": "weekly target met"},
    ])
    plan = _parse_plan(raw, loop_mode="roles")
    assert {a["action"] for a in plan} == {
        "discover_companies", "find_jobs", "find_hiring_managers", "follow_up", "skip",
    }
