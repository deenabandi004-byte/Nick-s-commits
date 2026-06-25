"""
Brief parser — mode classification eval (50-prompt golden set).

What this file is FOR:
  - Pin the parser's mode-classification accuracy against a hand-labeled
    golden set of 50 prompts spanning {people, roles, both, None}.
  - Detect regressions when the SYSTEM_PROMPT changes (e.g. adding "both"
    must not knock "people" or "roles" accuracy below the baseline).
  - Document the prompt patterns we expect the parser to handle so future
    edits have concrete examples to think against.

What this file is NOT:
  - It does NOT burn OpenAI credits on every pytest run. The real-LLM eval
    is gated by the env var OFFERLOOP_RUN_PARSER_EVAL=1. Without it, the
    golden set is loaded and shape-validated but no API calls are made.
  - It is NOT a substitute for unit tests in test_agent_brief_parser_mode.py.
    Those tests cover the deterministic parts (schema, normalization) with
    mocked LLM responses; this file covers the *judgment* part.

Acceptance criteria (from the PR1 plan):
  - Overall mode-correct ≥ 85% on the golden set.
  - "people" accuracy does not regress by more than 2 percentage points vs
    the previous baseline.
  - "roles" accuracy does not regress by more than 2 percentage points vs
    the previous baseline.

How to run the real eval (manual / nightly CI):
  OFFERLOOP_RUN_PARSER_EVAL=1 pytest backend/tests/evals/test_parser_mode_classification.py -s

The -s flag is recommended so the per-prompt breakdown prints to the
console — useful for diagnosing which prompts the parser got wrong.
"""
from __future__ import annotations

import os
from typing import Literal

import pytest

from app.services.agent_brief_parser import parse_brief

# ── Golden set ──────────────────────────────────────────────────────────
#
# Each entry is (label, prompt). Labels are the gold-standard mode the
# parser SHOULD return. None means "ambiguous, parser should not commit."
#
# Distribution: 13 people + 13 roles + 13 both + 11 ambiguous = 50.
# When tuning the prompt, keep the distribution roughly balanced so the
# overall-accuracy number isn't dominated by one class.

GoldLabel = Literal["people", "roles", "both"] | None

GOLDEN_PROMPTS: list[tuple[GoldLabel, str]] = [
    # ── people (13) — networking-only briefs ────────────────────────────
    ("people", "10 AI analysts at Goldman, JPMorgan, and Morgan Stanley. Reach out about summer internship recruiting."),
    ("people", "I want to coffee chat with product managers at Stripe and Linear."),
    ("people", "Find me 5 analysts at McKinsey, Bain, and BCG to ask for advice on breaking into consulting."),
    ("people", "Connect me with alumni from USC who are now at Anthropic, OpenAI, or Google DeepMind."),
    ("people", "Looking for warm intros to AI researchers at the top labs."),
    ("people", "I want to network with VCs at Benchmark, Sequoia, and a16z."),
    ("people", "Find 8 software engineers at Vercel who studied at UCLA — want to ask for referrals."),
    ("people", "Reach out to bankers at boutique IB shops (Lazard, Evercore, Centerview) about full-time recruiting."),
    ("people", "I need to talk to current associates at Blackstone and KKR about the PE recruiting process."),
    ("people", "Looking for 15 analysts at Citi, BofA, and Wells Fargo for coffee chats."),
    ("people", "Help me build a network of designers at Notion, Figma, and Linear."),
    ("people", "Find product designers at AI startups in SF I can ask for portfolio feedback."),
    ("people", "I want to ask current Two Sigma engineers about the interview process."),

    # ── roles (13) — job-search-only briefs ─────────────────────────────
    ("roles", "Find me summer 2027 SWE internships at fintech startups in NYC."),
    ("roles", "I'm looking for open analyst roles at investment banks for full-time 2026."),
    ("roles", "Search for product design internships at YC companies that are hiring now."),
    ("roles", "I want to apply to AI engineering jobs at Anthropic, OpenAI, and DeepMind."),
    ("roles", "Find me trading internships at Jane Street, Citadel, and Two Sigma."),
    ("roles", "Open ML research roles at any of the top AI labs — show me what's posted."),
    ("roles", "I need a list of consulting internships for sophomore summer."),
    ("roles", "Show me posted internships in Investment Banking on the West Coast."),
    ("roles", "Find SWE intern positions at Vercel, Linear, and Ramp."),
    ("roles", "Looking for entry-level VC analyst roles at any seed-stage firm."),
    ("roles", "I want to apply to summer associate programs at MBB."),
    ("roles", "Find me open roles for new grads at series-A startups in NYC."),
    ("roles", "Search Greenhouse and Lever for SWE intern postings at fintech."),

    # ── both (13) — explicit networking + job-search briefs ─────────────
    ("both", "I want summer SWE internships at fintech startups in NYC plus people to coffee chat with."),
    ("both", "Find open analyst roles AND connect me with current analysts at the same banks."),
    ("both", "Looking for marketing internships and also want intros to PMs at those companies."),
    ("both", "Find me open ML jobs at top labs + warm intros to current researchers."),
    ("both", "I want to apply to consulting internships AND build a network of current consultants at the same firms."),
    ("both", "Show me PM intern roles at Stripe and Linear, plus 5 current PMs at each to coffee chat with."),
    ("both", "Open roles in IB + 10 analysts I can ask for referrals at each shop."),
    ("both", "Find product designer internships and also send me to designers I can ask for portfolio reviews."),
    ("both", "I need open AI engineer postings at YC startups AND founders I can email directly."),
    ("both", "VC analyst roles at seed funds + alumni at those funds to ask about getting in."),
    ("both", "Find quant trading internships and connect me with current quants for prep advice."),
    ("both", "I want both — open SWE internships at fintech AND people I can network with for referrals."),
    ("both", "Search for analyst openings at Lazard + find me current Lazard analysts to chat with."),

    # ── ambiguous / None (11) — should NOT commit to a mode ─────────────
    (None, "Help me with recruiting."),
    (None, "Find me opportunities in tech."),
    (None, "I'm interested in consulting."),
    (None, "Banking stuff in NYC."),
    (None, "What can you do?"),
    (None, "I want to break into VC."),
    (None, "AI."),
    (None, "Summer 2027 plans."),
    (None, "Looking at investment banking."),
    (None, "Career help please."),
    (None, "Networking and applications."),
]


# ── Always-on structural tests ──────────────────────────────────────────
# These run on every `pytest backend/tests/` and don't call OpenAI.


def test_golden_set_has_50_prompts():
    """The plan calls for a 50-prompt golden set. If you change this number,
    update the per-class baselines below and the PR1 acceptance threshold."""
    assert len(GOLDEN_PROMPTS) == 50


def test_golden_set_labels_are_valid():
    """Every label must be one of {people, roles, both, None}."""
    valid = {"people", "roles", "both", None}
    for label, prompt in GOLDEN_PROMPTS:
        assert label in valid, f"invalid label {label!r} for prompt {prompt!r}"


def test_golden_set_prompts_are_nonempty():
    """No accidental blank prompts — empty input is a separate code path
    (parse_brief returns 'empty' status without calling the LLM)."""
    for label, prompt in GOLDEN_PROMPTS:
        assert prompt.strip(), f"empty prompt for label {label!r}"


def test_golden_set_class_distribution():
    """Roughly balanced classes. If you tilt the distribution heavily, the
    overall-accuracy number will be dominated by the largest class — track
    per-class accuracy in eval_run() instead."""
    from collections import Counter
    counts = Counter(label for label, _ in GOLDEN_PROMPTS)
    # Document the current distribution so deliberate changes are visible.
    assert counts["people"] == 13
    assert counts["roles"] == 13
    assert counts["both"] == 13
    assert counts[None] == 11


# ── Live eval — opt-in via env var ──────────────────────────────────────


@pytest.mark.skipif(
    os.environ.get("OFFERLOOP_RUN_PARSER_EVAL") != "1",
    reason="Live parser eval gated by OFFERLOOP_RUN_PARSER_EVAL=1 (burns OpenAI credits).",
)
def test_parser_mode_classification_meets_threshold():
    """Run the parser against every golden prompt and assert accuracy meets
    the PR1 threshold:
      - Overall ≥ 85% mode-correct
      - "people" ≥ baseline - 2 percentage points
      - "roles"  ≥ baseline - 2 percentage points

    Baselines (set after the first successful run; update intentionally as
    the prompt improves):
      - PEOPLE_BASELINE = 0.92  # 12/13 — single ambiguous prompt allowed
      - ROLES_BASELINE  = 0.92  # 12/13
    """
    PEOPLE_BASELINE = 0.92
    ROLES_BASELINE = 0.92
    OVERALL_FLOOR = 0.85
    REGRESSION_TOLERANCE = 0.02

    from collections import defaultdict

    per_class_correct: dict = defaultdict(int)
    per_class_total: dict = defaultdict(int)
    misses: list[tuple[GoldLabel, str, object]] = []

    for label, prompt in GOLDEN_PROMPTS:
        parsed, status = parse_brief(prompt)
        if status != "ok":
            misses.append((label, prompt, f"<parse_status={status}>"))
            per_class_total[label] += 1
            continue
        got = parsed["mode"]
        per_class_total[label] += 1
        if got == label:
            per_class_correct[label] += 1
        else:
            misses.append((label, prompt, got))

    overall = sum(per_class_correct.values()) / max(1, len(GOLDEN_PROMPTS))
    people = per_class_correct["people"] / max(1, per_class_total["people"])
    roles = per_class_correct["roles"] / max(1, per_class_total["roles"])
    both = per_class_correct["both"] / max(1, per_class_total["both"])
    none = per_class_correct[None] / max(1, per_class_total[None])

    print()
    print(f"PARSER MODE-CLASSIFICATION EVAL — {len(GOLDEN_PROMPTS)} prompts")
    print(f"  overall:  {overall:.1%}   (floor {OVERALL_FLOOR:.0%})")
    print(f"  people:   {people:.1%}    (baseline {PEOPLE_BASELINE:.0%})")
    print(f"  roles:    {roles:.1%}     (baseline {ROLES_BASELINE:.0%})")
    print(f"  both:     {both:.1%}")
    print(f"  None:     {none:.1%}")
    if misses:
        print(f"  misses ({len(misses)}):")
        for label, prompt, got in misses:
            short = prompt if len(prompt) <= 70 else prompt[:67] + "..."
            print(f"    want={label!r:<10} got={got!r:<10} | {short}")

    assert overall >= OVERALL_FLOOR, f"overall accuracy {overall:.1%} < floor {OVERALL_FLOOR:.0%}"
    assert people >= (PEOPLE_BASELINE - REGRESSION_TOLERANCE), \
        f"people accuracy {people:.1%} regressed past tolerance (baseline {PEOPLE_BASELINE:.0%})"
    assert roles >= (ROLES_BASELINE - REGRESSION_TOLERANCE), \
        f"roles accuracy {roles:.1%} regressed past tolerance (baseline {ROLES_BASELINE:.0%})"
