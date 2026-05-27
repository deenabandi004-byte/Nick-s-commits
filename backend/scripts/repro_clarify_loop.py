"""
Repro script for the Scout clarification loop bug.

THE BUG
-------
Scout was firing the count-clarify rule on top of a user pivot signal,
then re-firing the same count-clarify when the user deflected on turn 2:

    User:  "yes but I want to target more than just those companies"
    Scout: "How many consulting alumni should I pull to start your outreach?"
    User:  "I don't know but I want to do more than just those basic companies"
    Scout: "How many consulting alumni do you want to pull to start your outreach?"

Two failures:
  1. The pivot signal ("but I want", "more than just") was ignored on turn 1.
  2. The same clarify on the same axis was re-fired on turn 2 after a
     deflection ("I don't know") that was paired with a pivot.

THE FIX
-------
Prompt-only edit in `scout_assistant_service.py`:
  - PIVOT DETECTION FIRST: pivot signals in the user's current message
    preempt the count-clarify rule.
  - NEVER ASK THE SAME CLARIFY TWICE: deflection routes to act-with-default,
    pivot routes to the new axis.
  - Two consecutive clarifies on related axes is the cap.

HOW TO RUN
----------
From the repo root:

    OPENAI_API_KEY=sk-... python backend/scripts/repro_clarify_loop.py

If you have a populated .env at the repo root, the script will load it
automatically (no need to export the var by hand).

WHAT SUCCESS LOOKS LIKE
-----------------------
Turn 1 response:
  - Should NOT be a count clarify ("How many...?").
  - Pivot detected first. Either a navigate proposing an expanded company
    set (MBB + tier-2 strategy + Big 4 advisory), or a non-count clarify
    on the new axis if the model still thinks scope is too broad.

Turn 2 response:
  - Should NOT be a count clarify on the same axis.
  - "I don't know" plus pivot signal triggers act-with-default. Expect a
    navigate with a tier-default count (Pro: 8) baked into the prefill,
    or at minimum a different question (not "how many alumni").

If either turn's response is "How many [consulting] alumni..." the fix
did not stick. Compare both messages and report.
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# Path setup. The service module uses both `from app.services...` and
# (transitively, via openai_client) `from backend.app.config...`, so we
# put the repo root AND the backend dir on sys.path to satisfy both.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(BACKEND))

# Best-effort .env load. The Flask app loads .env via its own startup;
# this script runs outside that. Try python-dotenv first; if it is not
# installed (some shells run a system python3 without backend's venv),
# fall back to a tiny in-script parser. Either way, environment vars
# already set in the parent shell take precedence over the .env file.
def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(path)
        return
    except ImportError:
        pass
    # Minimal fallback parser: KEY=value lines, ignore comments and blanks,
    # do not override anything already in os.environ.
    try:
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v
    except Exception as e:
        print(f"[repro] .env fallback parse failed: {e}", file=sys.stderr)


_load_env_file(REPO_ROOT / ".env")

if not os.getenv("OPENAI_API_KEY"):
    print("[repro] OPENAI_API_KEY is not set in env or .env. Set it and re-run.")
    sys.exit(2)


def banner(label: str) -> None:
    print()
    print("=" * 78)
    print(label)
    print("=" * 78)


def print_response(label: str, result: dict) -> None:
    print(f"[{label}] tool: {result.get('tool')!r}")
    print(f"[{label}] mode: {result.get('mode')!r}")
    print(f"[{label}] message:")
    print(f"    {result.get('message')!r}")
    if result.get("navigate"):
        nav = result["navigate"]
        print(f"[{label}] navigate.route: {nav.get('route')!r}")
        print(f"[{label}] navigate.prefill: {json.dumps(nav.get('prefill') or {}, indent=2)}")
        print(f"[{label}] navigate.auto_submit: {nav.get('auto_submit')!r}")
    if result.get("cta"):
        print(f"[{label}] cta: {json.dumps(result.get('cta'), indent=2)}")
    if result.get("intent"):
        print(f"[{label}] intent (Haiku): {json.dumps(result.get('intent'), indent=2)}")


# Prior conversation context: Scout already suggested MBB as a starting
# point. The bug starts when the user signals they want to go beyond MBB.
PRIOR_HISTORY = [
    {
        "role": "user",
        "content": "I want to recruit for consulting at top firms",
    },
    {
        "role": "assistant",
        "content": (
            "Good target. MBB - McKinsey, Bain, BCG - is the natural "
            "starting point and the strongest alumni networks. Want me "
            "to find consulting alumni at those three to start outreach?"
        ),
    },
]

TURN_1_USER = "yes but I want to target more than just those companies"
TURN_2_USER = "I don't know but I want to do more than just those basic companies"


async def main() -> None:
    # Import here so the env-var check above can bail before paying the
    # import cost (firebase, openai client init, etc.).
    from app.services.scout_assistant_service import scout_assistant_service

    # A USC student profile so Scout has something concrete to expand
    # against. Tier=pro so the count default would be 8 if the rule fires.
    user_context = {
        "academics": {
            "university": "University of Southern California",
            "major": "Business Administration",
            "graduation_year": "2027",
        },
        "goals": {
            "target_industries": ["consulting"],
            "target_roles": ["associate consultant", "business analyst"],
            "dream_companies": ["McKinsey", "Bain", "BCG"],
            "recruiting_for": "full-time",
        },
        "location": {"preferred": "Los Angeles", "current": "Los Angeles"},
    }

    banner("TURN 1")
    print(f"user: {TURN_1_USER!r}")
    print("-" * 78)
    result_1 = await scout_assistant_service.handle_chat(
        message=TURN_1_USER,
        conversation_history=PRIOR_HISTORY,
        current_page="/find",
        user_name="Test",
        tier="pro",
        credits=1500,
        max_credits=1500,
        user_context=user_context,
        user_memory={},
        uid=None,
        chat_id=None,
    )
    print_response("turn 1", result_1)

    # Append turn 1 to history before turn 2 so the model sees its prior
    # clarify (if it fired one) and the user's deflection on turn 2.
    next_history = PRIOR_HISTORY + [
        {"role": "user", "content": TURN_1_USER},
        {"role": "assistant", "content": result_1.get("message") or ""},
    ]

    banner("TURN 2")
    print(f"user: {TURN_2_USER!r}")
    print("-" * 78)
    result_2 = await scout_assistant_service.handle_chat(
        message=TURN_2_USER,
        conversation_history=next_history,
        current_page="/find",
        user_name="Test",
        tier="pro",
        credits=1500,
        max_credits=1500,
        user_context=user_context,
        user_memory={},
        uid=None,
        chat_id=None,
    )
    print_response("turn 2", result_2)

    banner("VERIFY")
    print("- Turn 1 should NOT be a count clarify (pivot detected first).")
    print("- Turn 2 should NOT be a count clarify (anti-repeat + deflection).")
    print("- Both turns should reference the broader-than-MBB pivot.")
    print()

    # Crude pass/fail signal for the most common failure mode.
    def looks_like_count_clarify(msg: str) -> bool:
        m = (msg or "").lower()
        return ("how many" in m) and ("alumni" in m or "consultant" in m or "people" in m or "contacts" in m)

    fail_1 = result_1.get("tool") == "clarify" and looks_like_count_clarify(result_1.get("message", ""))
    fail_2 = result_2.get("tool") == "clarify" and looks_like_count_clarify(result_2.get("message", ""))

    if fail_1 or fail_2:
        print(f"FAIL: turn_1_count_clarify={fail_1} turn_2_count_clarify={fail_2}")
        sys.exit(1)
    print("PASS: neither turn fired a count clarify on the consulting-alumni axis.")


if __name__ == "__main__":
    asyncio.run(main())
