"""Real-network smoke tests for Perplexity-backed hiring-manager enrichment.

These tests hit the live Perplexity API and cost real money (~$0.01-0.02 per
test). Opt-in only — they will NOT run during a normal pytest invocation.
Run manually before deploying changes to perplexity_client.verify_hiring_managers_v2
or its schema.

Run with:
    RUN_PERPLEXITY_LIVE_TESTS=1 pytest backend/tests/test_perplexity_integration.py -v -s

Requires PERPLEXITY_API_KEY set in the environment.
"""
import os
import pytest


pytestmark = pytest.mark.slow


@pytest.fixture(scope="module", autouse=True)
def require_perplexity_key():
    if os.getenv("RUN_PERPLEXITY_LIVE_TESTS") != "1":
        pytest.skip(
            "Live Perplexity tests are opt-in. "
            "Set RUN_PERPLEXITY_LIVE_TESTS=1 to enable."
        )
    if not os.getenv("PERPLEXITY_API_KEY"):
        pytest.skip("PERPLEXITY_API_KEY not set — cannot run live tests")


def test_verify_hiring_managers_v2_returns_valid_schema():
    """One real call. Confirms structured output round-trips with all required fields."""
    from app.services.perplexity_client import verify_hiring_managers_v2

    out = verify_hiring_managers_v2(
        hms=[{"FirstName": "Sundar", "LastName": "Pichai"}],
        company="Google",
        job_title="Chief Executive Officer",
    )

    assert len(out) == 1
    entry = out[0]
    # All required fields present
    for field in ("still_at_company", "current_title", "actively_hiring",
                  "recent_hiring_signal", "confidence"):
        assert field in entry, f"Missing required field: {field}"
    # Enum values constrained
    assert entry["still_at_company"] in ("yes", "no", "unknown")
    assert entry["actively_hiring"] in ("yes", "no", "unknown")
    assert entry["confidence"] in ("high", "medium", "low")
    # Sundar is famously still CEO of Google — sanity check the answer
    # (loose assertion; Perplexity may answer "yes" or "unknown" but never "no")
    assert entry["still_at_company"] != "no", \
        f"Perplexity returned 'no' for Sundar Pichai @ Google: {entry}"
