"""LLM eval suite for the Scout strategist briefing (Phase 5).

Scores briefings produced by the live strategist prompt against five
dimensions:

  1. RATIONALE PRESENCE   - every step has 2-4 bullets anchored in user facts
  2. TIER RESPECT         - cites the correct contact-per-search cap; never
                            recommends Pro-gated features to Free users
  3. NO EXECUTION LEAKAGE - never claims to have sent emails, run searches,
                            etc; only proposes via navigate / answer
  4. ANCHOR IN USER FACTS - every step references at least one specific
                            field from the user's profile (school, target
                            company, dream role, etc.)
  5. TONE                 - direct, low-jargon, no hedging; on returning
                            users, celebrates progress without shaming

This file burns OpenAI tokens. It is marked `@pytest.mark.eval` so the
default test run skips it; CI baselines fire it on a schedule and against
PRs that touch the strategist prompt.

Run locally:
    cd backend && pytest -m eval tests/evals/test_scout_briefing_eval.py

Baseline scores are tracked in ~/.gstack/projects/.../evals/scout-briefing-
baseline.json so we can detect regressions across prompt iterations.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List

import pytest

from app.services.scout.profile_coverage import compute_coverage
from app.services.scout.strategist import build_strategist_prompt


# ---------------------------------------------------------------------------
# Fixture profiles. Curated to exercise the strategist's branches:
#   - Free / Pro / Elite tiers
#   - Sparse vs full profile coverage
#   - Tech / Consulting / Banking / Consumer industries
#   - With and without active strategy from prior session
# Counts: 10 base profiles. Add more here over time; the eval scales.
# ---------------------------------------------------------------------------

PROFILES: List[Dict[str, Any]] = [
    {
        "name": "free_cs_student_targeting_tech",
        "tier": "free",
        "user_context": {
            "academics": {"university": "USC", "major": "CS", "graduation_year": 2027},
            "goals": {
                "target_industries": ["Tech"],
                "target_roles": ["SWE Intern"],
                "dream_companies": ["Stripe", "Linear"],
                "recruiting_for": "summer-2027",
            },
            "location": {"preferred": "SF", "current": "Los Angeles"},
            "resume": "USC CS junior with internship at Lyft and a hackathon win at HackSC.",
        },
        "raw_user_doc": {
            "resumeText": "USC CS junior with internship at Lyft and a hackathon win at HackSC.",
            "linkedinUrl": "https://linkedin.com/in/test",
            "goals": {"targetIndustries": ["Tech"], "targetRoles": ["SWE Intern"]},
            "academics": {"university": "USC", "major": "CS", "graduationYear": 2027},
        },
    },
    {
        "name": "pro_consulting_aspirant",
        "tier": "pro",
        "user_context": {
            "academics": {"university": "Michigan", "major": "Economics", "graduation_year": 2026},
            "goals": {
                "target_industries": ["Consulting"],
                "target_roles": ["BA"],
                "dream_companies": ["McKinsey", "Bain", "BCG"],
                "recruiting_for": "full-time-2026",
            },
            "location": {"preferred": "NYC"},
            "resume": "Michigan Econ senior, consulting case competition winner.",
        },
        "raw_user_doc": {
            "resumeText": "Michigan Econ senior, consulting case competition winner.",
            "goals": {
                "targetIndustries": ["Consulting"],
                "targetRoles": ["BA"],
                "dreamCompanies": ["McKinsey", "Bain", "BCG"],
            },
            "academics": {"university": "Michigan", "major": "Economics", "graduationYear": 2026},
            "linkedinResumeParsed": {"name": "x"},
        },
    },
    {
        "name": "elite_banking_finalist",
        "tier": "elite",
        "user_context": {
            "academics": {"university": "Wharton", "major": "Finance", "graduation_year": 2026},
            "goals": {
                "target_industries": ["Investment Banking"],
                "target_roles": ["Analyst"],
                "dream_companies": ["Goldman", "JPMorgan", "Morgan Stanley"],
                "recruiting_for": "full-time-2026",
            },
            "location": {"preferred": "NYC"},
            "resume": "Wharton Finance, sophomore summer at Citi M&A.",
        },
        "raw_user_doc": {
            "resumeText": "Wharton Finance, sophomore summer at Citi M&A.",
            "goals": {
                "targetIndustries": ["Investment Banking"],
                "targetRoles": ["Analyst"],
                "dreamCompanies": ["Goldman", "JPMorgan", "Morgan Stanley"],
            },
            "academics": {"university": "Wharton", "major": "Finance", "graduationYear": 2026},
            "linkedinResumeParsed": {"name": "x"},
        },
    },
    {
        "name": "sparse_profile_new_user",
        "tier": "free",
        "user_context": {
            "academics": {"university": "UCLA"},
        },
        "raw_user_doc": {"academics": {"university": "UCLA"}},
    },
    {
        "name": "free_consumer_pm",
        "tier": "free",
        "user_context": {
            "academics": {"university": "USC", "major": "Comm", "graduation_year": 2027},
            "goals": {
                "target_industries": ["Consumer"],
                "target_roles": ["APM"],
                "dream_companies": ["Snap", "Meta"],
            },
            "resume": "USC Comm major with marketing internship at Snap.",
        },
        "raw_user_doc": {
            "resumeText": "USC Comm major with marketing internship at Snap.",
            "goals": {
                "targetIndustries": ["Consumer"],
                "targetRoles": ["APM"],
                "dreamCompanies": ["Snap", "Meta"],
            },
            "academics": {"university": "USC", "major": "Comm", "graduationYear": 2027},
        },
    },
    {
        "name": "pro_with_active_strategy",
        "tier": "pro",
        "user_context": {
            "academics": {"university": "Georgetown", "major": "Government"},
            "goals": {
                "target_industries": ["Consulting"],
                "target_roles": ["BA"],
                "dream_companies": ["Deloitte", "EY-Parthenon"],
            },
            "resume": "Georgetown Government student with policy internship.",
        },
        "raw_user_doc": {
            "resumeText": "Georgetown Government student.",
            "goals": {"targetIndustries": ["Consulting"], "targetRoles": ["BA"]},
            "academics": {"university": "Georgetown"},
            "linkedinResumeParsed": {"name": "x"},
        },
        "active_strategy": {
            "id": "abc",
            "goal": "Land a 2027 summer BA offer at a top consulting firm",
            "steps": [
                {"title": "Loop alumni at Deloitte", "done": True},
                {"title": "Coffee chats with EY-Parthenon staff", "done": False},
            ],
        },
        "activity_since": {"loops_created": 1, "contacts_added": 4, "emails_sent": 8},
    },
    {
        "name": "elite_quant_finance",
        "tier": "elite",
        "user_context": {
            "academics": {"university": "MIT", "major": "Math/CS", "graduation_year": 2026},
            "goals": {
                "target_industries": ["Quantitative Finance"],
                "target_roles": ["Quant Researcher"],
                "dream_companies": ["Jane Street", "Two Sigma", "Citadel"],
            },
            "resume": "MIT Math/CS, internship at Jane Street's quant desk.",
        },
        "raw_user_doc": {
            "resumeText": "MIT Math/CS, internship at Jane Street.",
            "goals": {
                "targetIndustries": ["Quantitative Finance"],
                "dreamCompanies": ["Jane Street", "Two Sigma", "Citadel"],
            },
            "academics": {"university": "MIT", "graduationYear": 2026},
            "linkedinResumeParsed": {"name": "x"},
        },
    },
    {
        "name": "pro_late_recruiter_switch",
        "tier": "pro",
        "user_context": {
            "academics": {"university": "NYU", "major": "English", "graduation_year": 2025},
            "goals": {
                "target_industries": ["Tech"],
                "target_roles": ["Product Marketing"],
                "dream_companies": ["Notion", "Figma"],
            },
            "resume": "NYU English major, switching from publishing to tech PMM.",
        },
        "raw_user_doc": {
            "resumeText": "NYU English major, switching from publishing to tech PMM.",
            "goals": {"targetIndustries": ["Tech"], "dreamCompanies": ["Notion", "Figma"]},
            "academics": {"university": "NYU", "graduationYear": 2025},
            "linkedinResumeParsed": {"name": "x"},
        },
    },
    {
        "name": "free_first_gen_unsure",
        "tier": "free",
        "user_context": {
            "academics": {"university": "CSU Long Beach", "major": "Biology"},
            "goals": {"recruiting_for": "exploring"},
        },
        "raw_user_doc": {
            "academics": {"university": "CSU Long Beach", "major": "Biology"},
            "goals": {"recruiting_for": "exploring"},
        },
    },
    {
        "name": "elite_returning_with_completed_strategy",
        "tier": "elite",
        "user_context": {
            "academics": {"university": "Stanford", "major": "CS"},
            "goals": {
                "target_industries": ["Tech"],
                "target_roles": ["SWE"],
                "dream_companies": ["Google", "OpenAI"],
            },
            "resume": "Stanford CS, completed last year's plan and got Meta offer.",
        },
        "raw_user_doc": {
            "resumeText": "Stanford CS",
            "goals": {"targetIndustries": ["Tech"]},
            "academics": {"university": "Stanford"},
            "linkedinResumeParsed": {"name": "x"},
        },
        "active_strategy": {
            "id": "old",
            "goal": "Land FTE SWE offer at top tech firm",
            "steps": [
                {"title": "Round of Loops at FAANG", "done": True},
                {"title": "Send referral asks", "done": True},
                {"title": "Prep for system design", "done": True},
            ],
        },
        "activity_since": {"loops_created": 3, "contacts_added": 22, "emails_sent": 40},
    },
]


def _build_briefing_prompt_for(profile: Dict[str, Any]) -> str:
    """Assemble the strategist system prompt for one profile fixture."""
    coverage = compute_coverage(profile.get("raw_user_doc") or {})
    return build_strategist_prompt(
        user_context=profile["user_context"],
        active_strategy=profile.get("active_strategy"),
        activity_since=profile.get("activity_since"),
        coverage=coverage,
        user_recent_posts=profile.get("recent_posts"),
        tier=profile["tier"],
    )


# ---------------------------------------------------------------------------
# Judge prompt + rubric
# ---------------------------------------------------------------------------

JUDGE_SYSTEM = """You are evaluating a recruiting strategist briefing produced \
by an AI assistant for a specific student. Score it 0-10 on each of six \
dimensions and return STRICT JSON.

Dimensions:
  rationale_presence: every step has 3-5 specific bullets anchored in user \
    facts (school, role, target firm, recent activity). 10 = every step has \
    rich rationale; 5 = some steps have it; 0 = none.
  tier_respect: cites the right contact-per-search cap (Free=3, Pro=8, \
    Elite=15) and never pushes Pro-gated features (Firm Search, Smart Filters, \
    Bulk Drafting) at Free users.
  no_execution_leakage: NEVER claims to have sent emails, run searches, \
    queued contacts, scheduled meetings. Only proposes via navigate / answer.
  anchor_in_user_facts: each step references AT LEAST ONE specific field from \
    the user's profile (university, major, target company, dream role, etc.).
  tone: direct, low-jargon, no hedging. On returning users with an active \
    strategy: celebrates progress, never shames inaction. 10 = perfect; 5 = \
    flat; 0 = condescending / generic.
  loops_mentioned_by_name: Loops is Offerloop's flagship feature. The briefing \
    MUST name "Loop" / "Loops" explicitly when recommending autonomous \
    outreach to a target cohort. 10 = at least one step says "Start a Loop" / \
    "Set up a Loop" or similar and briefly explains what the Loop does for \
    the user; 5 = mentions Loops but doesn't teach; 0 = treats /agent/setup \
    as generic "outreach setup" without naming Loops. Banned words inside \
    briefings (auto-fail to <=5 if present): "agent" (the page), "deploy", \
    "configure", "campaign", "workflow".

Return ONLY JSON with this shape (no prose):
  {"rationale_presence": int, "tier_respect": int, "no_execution_leakage": int, \
"anchor_in_user_facts": int, "tone": int, "loops_mentioned_by_name": int, \
"notes": "one short sentence on the weakest dimension or what would make it a 10"}
"""

THRESHOLD = 7  # Average across dimensions must be >= 7 for the fixture to pass.


def _call_briefing(system_prompt: str) -> str:
    """Hit OpenAI with the same prompt the live endpoint uses."""
    from app.services.openai_client import client
    if client is None:
        pytest.skip("OPENAI_API_KEY not set; cannot run live eval")
    resp = client.chat.completions.create(
        model="gpt-4.1-mini",
        temperature=0.5,
        max_tokens=1800,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Produce my briefing now."},
        ],
    )
    return resp.choices[0].message.content or ""


def _judge(briefing_text: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    """Score one briefing via the judge model. Returns the rubric dict."""
    from app.services.openai_client import client
    if client is None:
        pytest.skip("OPENAI_API_KEY not set; cannot run live eval")
    judge_user = (
        f"USER PROFILE:\nTier: {profile['tier']}\n"
        f"Academics: {profile['user_context'].get('academics')}\n"
        f"Goals: {profile['user_context'].get('goals')}\n"
        f"Has prior strategy: {bool(profile.get('active_strategy'))}\n\n"
        f"BRIEFING TO SCORE:\n{briefing_text}"
    )
    resp = client.chat.completions.create(
        model="gpt-4.1-mini",
        temperature=0.0,
        max_tokens=400,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM},
            {"role": "user", "content": judge_user},
        ],
    )
    return json.loads(resp.choices[0].message.content or "{}")


# ---------------------------------------------------------------------------
# The eval test, parametrized across all 10 fixtures
# ---------------------------------------------------------------------------

@pytest.mark.eval
@pytest.mark.parametrize("profile", PROFILES, ids=[p["name"] for p in PROFILES])
def test_briefing_meets_rubric_threshold(profile):
    """Generate one briefing and verify the judge scores it above THRESHOLD.

    Skipped by default. Runs when -m eval is passed.
    """
    system_prompt = _build_briefing_prompt_for(profile)
    briefing = _call_briefing(system_prompt)
    scores = _judge(briefing, profile)

    dims = (
        "rationale_presence",
        "tier_respect",
        "no_execution_leakage",
        "anchor_in_user_facts",
        "tone",
        "loops_mentioned_by_name",
    )
    numeric = {d: int(scores.get(d, 0)) for d in dims}
    avg = sum(numeric.values()) / len(numeric)

    # Persist the per-fixture scores into ~/.gstack/projects/<slug>/evals/
    # so subsequent runs can diff against the baseline. Best-effort.
    try:
        eval_root = Path.home() / ".gstack" / "projects" / "scout-briefing-eval"
        eval_root.mkdir(parents=True, exist_ok=True)
        (eval_root / f"{profile['name']}.json").write_text(
            json.dumps({"scores": numeric, "avg": avg, "notes": scores.get("notes", "")}, indent=2),
        )
    except Exception:
        pass

    assert avg >= THRESHOLD, (
        f"{profile['name']}: avg score {avg:.1f} below threshold {THRESHOLD}. "
        f"Scores: {numeric}. Notes: {scores.get('notes', '(none)')}"
    )


# ---------------------------------------------------------------------------
# Cheap structural tests that don't burn LLM tokens. Run by default.
# Pinning these here keeps the fixtures + builder in sync without an eval run.
# ---------------------------------------------------------------------------

def test_every_fixture_assembles_a_nonempty_prompt():
    for p in PROFILES:
        prompt = _build_briefing_prompt_for(p)
        assert prompt and len(prompt) > 500, f"{p['name']} produced an empty / too-short prompt"


def test_tier_is_cited_in_every_prompt():
    for p in PROFILES:
        prompt = _build_briefing_prompt_for(p)
        assert f"USER TIER: {p['tier']}" in prompt, f"{p['name']} missing tier line"


def test_sparse_profile_triggers_pivot_instruction():
    """The 'sparse_profile_new_user' fixture has only one field; the strategist
    prompt must include the pivot instruction so the briefing falls back to
    profile-completion guidance rather than producing generic advice."""
    sparse = next(p for p in PROFILES if p["name"] == "sparse_profile_new_user")
    prompt = _build_briefing_prompt_for(sparse)
    assert "DO NOT produce thin recommendations" in prompt


def test_full_profile_does_not_trigger_pivot():
    """The elite_quant_finance fixture has full coverage; the prompt must
    use the gap-callout guidance (above pivot) instead of the pivot block."""
    full = next(p for p in PROFILES if p["name"] == "elite_quant_finance")
    prompt = _build_briefing_prompt_for(full)
    assert "DO NOT produce thin recommendations" not in prompt
