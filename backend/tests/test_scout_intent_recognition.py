"""Phase 4 P0 regression: Scout intent recognition.

A message that describes a recruiting/networking need must produce a navigate,
not an answer that just restates the need back. This grew out of the production
bug where "email ey portland auditors" returned the text answer "Search for
auditors at EY in Portland to email them." instead of navigating to the find
page.

Two layers:
  - Tier A cases call try_pre_llm directly: fast, deterministic, no API.
  - LLM cases call handle_chat end to end via run_async (the same path the
    Flask route uses): real gpt-4.1-mini, marked integration. OPENAI_API_KEY
    is required, loaded from the repo .env.

LLM output is non-deterministic, so a case with a genuinely ambiguous target
accepts a set of routes. The hard assertion every LLM case makes is
tool == "navigate" - that is the P0 this file guards.
"""
import os

import pytest

from app.services.scout.router import try_pre_llm
from app.services.scout_assistant_service import scout_assistant_service
from app.utils.async_runner import run_async

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
except Exception:
    pass


# --- Tier A: the broadened find-people rule (regex, deterministic) ----------

# message, required prefill subset. All resolve to /contact-search.
_TIER_A = [
    ("reach out to PMs at stripe", {"company": "stripe", "job_title": "PMs"}),
    ("find consultants at mckinsey", {"company": "mckinsey", "job_title": "consultants"}),
    ("find me a recruiter at apple", {"company": "apple", "job_title": "recruiter"}),
    ("looking for engineers at Anthropic", {"company": "Anthropic", "job_title": "engineers"}),
    ("need to connect with recruiters at Meta", {"company": "Meta", "job_title": "recruiters"}),
    ("connect with analysts at Goldman in Chicago",
     {"company": "Goldman", "job_title": "analysts", "location": "Chicago"}),
]


@pytest.mark.unit
@pytest.mark.parametrize("message,prefill", _TIER_A, ids=[c[0][:42] for c in _TIER_A])
def test_tier_a_find_people(message, prefill):
    plan = try_pre_llm(message, "/dashboard")
    assert plan is not None, f"{message!r} should be a Tier A regex hit"
    assert plan["name"] == "navigate"
    args = plan["args"]
    assert args["route"] == "/contact-search"
    for key, value in prefill.items():
        assert args["prefill"].get(key) == value, (
            f"prefill[{key}]: got {args['prefill'].get(key)!r}, want {value!r}")


@pytest.mark.unit
def test_tier_a_ignores_find_out():
    # "find out ... at ..." is not a contact search and must not mis-fire.
    assert try_pre_llm("find out what happened at the meeting", "/dashboard") is None


# --- LLM tier: end to end, real gpt-4.1-mini -------------------------------

# message, accepted routes. Every case must navigate, never answer/clarify the
# need away. A genuinely ambiguous target accepts more than one route.
_LLM_NAVIGATE = [
    ("email ey portland auditors", ("/contact-search",)),
    # Removed Jane Street interview prep case: /interview-prep no longer
    # exists in the page registry after the Phase 5 cleanup.
    ("draft a cover letter for the stripe pm role", ("/write/cover-letter",)),
    ("who do i know at anthropic", ("/contact-directory", "/contact-search")),
    ("auto apply to swe jobs in nyc", ("/job-board",)),
]


@pytest.mark.integration
@pytest.mark.parametrize("message,routes", _LLM_NAVIGATE,
                         ids=[c[0][:42] for c in _LLM_NAVIGATE])
def test_llm_navigates_for_need(message, routes):
    result = run_async(scout_assistant_service.handle_chat(
        message=message, current_page="/dashboard"))
    assert result["tool"] == "navigate", (
        f"{message!r} returned tool={result['tool']!r}, expected navigate "
        f"(message was: {result.get('message')!r})")
    assert result["navigate"]["route"] in routes, (
        f"{message!r} navigated to {result['navigate']['route']!r}, "
        f"expected one of {routes}")


@pytest.mark.integration
def test_llm_does_not_hallucinate_linkedin_url():
    # meeting-prep requires a linkedin_url; "sarah" is a name, not a URL. The
    # model must not stuff the name into linkedin_url - it should clarify, or
    # navigate with that field left empty.
    result = run_async(scout_assistant_service.handle_chat(
        message="i have a coffee chat with sarah at goldman tomorrow",
        current_page="/dashboard"))
    assert result["tool"] in ("navigate", "clarify"), result.get("tool")
    if result["tool"] == "navigate":
        prefill = result["navigate"].get("prefill") or {}
        assert not prefill.get("linkedin_url"), (
            f"linkedin_url must not be a name: got {prefill.get('linkedin_url')!r}")
