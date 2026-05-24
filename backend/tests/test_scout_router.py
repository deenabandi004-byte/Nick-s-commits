"""Phase 4 Tier A harness: tests for app/services/scout/router.py.

try_pre_llm is pure (regex, no I/O, no LLM call), so these are fast and
deterministic. Each case is (message, expected_tier, route, prefill,
imperative). expected_tier is "regex" for a high-confidence hit or None for a
fall-through to the LLM. Per the Phase 4 spec, if a rule fails one of its own
cases the fix is to tighten the regex, not loosen the case.

The embedding-cache near-miss cases land with Tier B; this file is Tier A.
"""
import pytest

from app.services.scout.router import try_pre_llm

_HIT = "regex"

# message, expected_tier, route, prefill, user_was_imperative.
# For a fall-through (tier=None) the last three fields are unused.
CASES = [
    # --- Rule (a): a pasted LinkedIn profile URL --------------------------
    ("https://linkedin.com/in/jane-doe",
     _HIT, "/meeting-prep", {"linkedin_url": "https://linkedin.com/in/jane-doe"}, False),
    ("https://www.linkedin.com/in/john-smith-12345/",
     _HIT, "/meeting-prep",
     {"linkedin_url": "https://www.linkedin.com/in/john-smith-12345"}, False),
    ("prep for https://linkedin.com/in/maya-r",
     _HIT, "/meeting-prep", {"linkedin_url": "https://linkedin.com/in/maya-r"}, False),
    # --- Rule (b): a route mention behind a navigation verb ---------------
    ("open meeting prep", _HIT, "/meeting-prep", {}, True),
    ("take me to contact search", _HIT, "/contact-search", {}, True),
    ("go to the job board", _HIT, "/job-board", {}, True),
    ("show me my outbox", _HIT, "/outbox", {}, True),
    # --- Rule (c): find <role> at <company> -------------------------------
    ("find engineers at Datadog",
     _HIT, "/contact-search", {"company": "Datadog", "job_title": "engineers"}, False),
    ("find people at Stripe",
     _HIT, "/contact-search", {"company": "Stripe"}, False),
    ("find product managers at Notion in NYC",
     _HIT, "/contact-search",
     {"company": "Notion", "job_title": "product managers", "location": "NYC"}, False),
    # --- Ambiguous: must fall through to the LLM --------------------------
    ("can you explain to me how the meeting prep feature actually works, here is "
     "my linkedin profile just for context https://linkedin.com/in/x",
     None, None, None, None),
    ("i have an interview coming up next week and i am not sure whether i should "
     "open interview prep now or wait until i hear back",
     None, None, None, None),
    ("https://job-boards.greenhouse.io/acme/jobs/4567", None, None, None, None),
    ("https://www.lever.co/acme/abc-def-123", None, None, None, None),
    ("can you help me find a job somewhere", None, None, None, None),
    ("help me find people", None, None, None, None),
    ("what does the job board even do and is it worth my time", None, None, None, None),
    ("i was wondering if you could take a look at my situation and tell me what to do",
     None, None, None, None),
    ("find someone at the gym to talk to about my career", None, None, None, None),
    # --- Prefill extraction edge cases -----------------------------------
    ("https://linkedin.com/in/jane-doe.",
     _HIT, "/meeting-prep", {"linkedin_url": "https://linkedin.com/in/jane-doe"}, False),
    ("HTTPS://LINKEDIN.COM/IN/JaneDoe",
     _HIT, "/meeting-prep", {"linkedin_url": "HTTPS://LINKEDIN.COM/IN/JaneDoe"}, False),
    ("https://linkedin.com/in/jane-doe?utm_source=share",
     _HIT, "/meeting-prep", {"linkedin_url": "https://linkedin.com/in/jane-doe"}, False),
    ("https://linkedin.com/in/first-person and https://linkedin.com/in/second-person",
     None, None, None, None),
    ("find designers at Figma in San Francisco",
     _HIT, "/contact-search",
     {"company": "Figma", "job_title": "designers", "location": "San Francisco"}, False),
    ("find data scientists at Two Sigma",
     _HIT, "/contact-search",
     {"company": "Two Sigma", "job_title": "data scientists"}, False),
    # --- Alias map cases --------------------------------------------------
    ("open coffee chat prep", _HIT, "/meeting-prep", {}, True),
    ("take me to the network tracker", _HIT, "/outbox", {}, True),
    ("go to hiring managers", _HIT, "/recruiter-spreadsheet", {}, True),
    ("pull up pricing", _HIT, "/pricing", {}, True),
]


@pytest.mark.parametrize(
    "message,tier,route,prefill,imperative",
    CASES,
    ids=[c[0][:48] for c in CASES],
)
def test_router(message, tier, route, prefill, imperative):
    plan = try_pre_llm(message, "/dashboard")
    if tier is None:
        assert plan is None, f"expected an LLM fall-through, got a regex hit: {plan}"
        return
    assert plan is not None, "expected a regex hit, got an LLM fall-through"
    assert plan["name"] == "navigate", plan
    args = plan["args"]
    assert args["route"] == route, f"route: got {args['route']!r}"
    assert args["prefill"] == prefill, f"prefill: got {args['prefill']!r}"
    assert args["confidence"] == 1.0, args
    assert args["user_was_imperative"] is imperative, args


def test_empty_message_falls_through():
    assert try_pre_llm("", "/dashboard") is None
    assert try_pre_llm("   ", "/dashboard") is None
