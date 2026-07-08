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
     _HIT, "/coffee-chat-prep", {"linkedin_url": "https://linkedin.com/in/jane-doe"}, False),
    ("https://www.linkedin.com/in/john-smith-12345/",
     _HIT, "/coffee-chat-prep",
     {"linkedin_url": "https://www.linkedin.com/in/john-smith-12345"}, False),
    ("prep for https://linkedin.com/in/maya-r",
     _HIT, "/coffee-chat-prep", {"linkedin_url": "https://linkedin.com/in/maya-r"}, False),
    # --- Rule (b): a route mention behind a navigation verb ---------------
    ("open meeting prep", _HIT, "/coffee-chat-prep", {}, True),
    ("take me to contact search", _HIT, "/find", {}, True),
    ("go to the job board", _HIT, "/job-board", {}, True),
    ("show me my outbox", _HIT, "/outbox", {}, True),
    # --- Rule (c) retired: find <role> at <company> falls through to the
    # LLM, which executes the search in the chat via find_contacts. --------
    ("find engineers at Datadog", None, None, None, None),
    ("find people at Stripe", None, None, None, None),
    ("find product managers at Notion in NYC", None, None, None, None),
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
     _HIT, "/coffee-chat-prep", {"linkedin_url": "https://linkedin.com/in/jane-doe"}, False),
    ("HTTPS://LINKEDIN.COM/IN/JaneDoe",
     _HIT, "/coffee-chat-prep", {"linkedin_url": "HTTPS://LINKEDIN.COM/IN/JaneDoe"}, False),
    ("https://linkedin.com/in/jane-doe?utm_source=share",
     _HIT, "/coffee-chat-prep", {"linkedin_url": "https://linkedin.com/in/jane-doe"}, False),
    ("https://linkedin.com/in/first-person and https://linkedin.com/in/second-person",
     None, None, None, None),
    # Find-people asks now fall through to the LLM: the find_contacts
    # execute tool runs the search in the chat (rule (c) retired).
    ("find designers at Figma in San Francisco", None, None, None, None),
    ("find data scientists at Two Sigma", None, None, None, None),
    ("find me 5 usc alumni at bain in los angeles", None, None, None, None),
    # --- Alias map cases --------------------------------------------------
    ("open coffee chat prep", _HIT, "/coffee-chat-prep", {}, True),
    ("take me to the network tracker", _HIT, "/outbox", {}, True),
    # Bare "hiring managers" means the saved people (My Network Managers
    # tab), not the search form; "hiring manager search" still hits /find.
    ("go to hiring managers", _HIT, "/my-network/managers", {}, True),
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
