"""
Phase 8.5 — Agent Mode Perplexity swap.

Tests cover three things, all without burning API credits:

1. The new Perplexity functions in `perplexity_client.py` return the
   superset of keys consumers in `agent_actions.py` already destructure.
2. The flag-routing helper `_perplexity_only` reads from `feature_flags.is_enabled`
   with the correct default.
3. `CREDIT_COSTS` in `loop_budget.py` matches the new Phase 8.5 prices,
   and the frontend mirror in `LoopActivityFeed.tsx` would catch drift.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


# ── 1. Perplexity function shapes ────────────────────────────────────────


def _make_response(content: str) -> MagicMock:
    """Build the shape `client.chat.completions.create(...)` returns."""
    msg = MagicMock()
    msg.content = content
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    resp.citations = []
    return resp


@patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
@patch("app.services.perplexity_client._client", None)
def test_enrich_job_posting_live_returns_expected_keys(monkeypatch):
    """The function must return the keys agent_actions.execute_find_jobs
    destructures into the Firestore agent_jobs doc."""
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _make_response(json.dumps({
        "requirements": ["Python", "SQL"],
        "nice_to_have": ["AWS"],
        "responsibilities": ["Build pipelines"],
        "salary_range": "$120k-$160k (Levels.fyi 2025)",
        "team_or_department": "Data Platform",
        "experience_level": "new grad",
        "employment_type": "full_time",
    }))
    monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)
    monkeypatch.setattr("app.services.enrichment_cache.get_cached", lambda *_a, **_k: None)
    monkeypatch.setattr("app.services.enrichment_cache.set_cached", lambda *_a, **_k: None)

    from app.services.perplexity_client import enrich_job_posting_live
    result = enrich_job_posting_live(
        url="https://boards.greenhouse.io/foo/jobs/123",
        title="Software Engineer",
        company="Stripe",
        location="San Francisco",
    )

    # Keys consumers expect via job.get("...") in agent_actions.py:524-528
    assert result["requirements"] == ["Python", "SQL"]
    assert result["salary_range"] == "$120k-$160k (Levels.fyi 2025)"
    assert result["team_or_department"] == "Data Platform"
    # hiring_manager is deliberately omitted to avoid hallucinated names.
    assert "hiring_manager" not in result


@patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
def test_enrich_job_posting_live_triggers_stage2_when_salary_missing(monkeypatch):
    """When stage 1 returns blank salary, stage 2 must fire and fill it."""
    call_count = {"n": 0}

    def fake_create(**kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            # Stage 1: full schema, salary blank
            return _make_response(json.dumps({
                "requirements": ["Go"],
                "salary_range": "",
                "team_or_department": "Infra",
            }))
        # Stage 2: salary-only
        return _make_response("$180k-$240k total comp (Levels.fyi 2025)")

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = fake_create
    monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)
    monkeypatch.setattr("app.services.enrichment_cache.get_cached", lambda *_a, **_k: None)
    monkeypatch.setattr("app.services.enrichment_cache.set_cached", lambda *_a, **_k: None)

    from app.services.perplexity_client import enrich_job_posting_live
    result = enrich_job_posting_live(url=None, title="SRE", company="Cloudflare")

    assert call_count["n"] == 2, "stage 2 salary call should fire when stage 1 is blank"
    assert "Levels.fyi" in result["salary_range"]


@patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
def test_enrich_company_profile_live_returns_expected_keys(monkeypatch):
    """The function must return the keys agent_actions.execute_discover_companies
    destructures into the Firestore agent_companies doc."""
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _make_response(json.dumps({
        "description": "Payment infrastructure for the internet.",
        "hiring_signal": "Expanding engineering teams in NYC and Dublin.",
        "recent_news": ["Acquired Bridge", "Launched Stripe Connect updates"],
        "culture_keywords": ["fast-paced", "writing-heavy"],
        "headquarters": "San Francisco, CA",
        "industries": ["Payments", "Fintech"],
    }))
    monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)
    monkeypatch.setattr("app.services.enrichment_cache.get_cached", lambda *_a, **_k: None)
    monkeypatch.setattr("app.services.enrichment_cache.set_cached", lambda *_a, **_k: None)

    from app.services.perplexity_client import enrich_company_profile_live
    result = enrich_company_profile_live(name="Stripe", website="https://stripe.com")

    # Keys consumers expect at agent_actions.py:649-653
    assert result["description"].startswith("Payment")
    assert "Expanding" in result["hiring_signal"]
    assert len(result["recent_news"]) == 2
    assert len(result["culture_keywords"]) == 2


@patch("app.services.perplexity_client.PERPLEXITY_API_KEY", "test-key")
def test_enrich_professional_presence_keeps_linkedin_field_name(monkeypatch):
    """The Perplexity replacement must return the same `linkedin_recent_posts`
    field name so the consumer at agent_actions.py:221 needs no changes."""
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _make_response(json.dumps({
        "items": [
            {"text": "Spoke at QCon SF on event-driven systems.",
             "url": "https://qcon.example/talk",
             "posted_at": "2026-04-12",
             "kind": "talk"},
            {"text": "Published 'Why Postgres Won' on personal blog.",
             "url": "https://blog.example/postgres-won",
             "posted_at": "2026-03-01",
             "kind": "article"},
        ]
    }))
    monkeypatch.setattr("app.services.perplexity_client._get_client", lambda: fake_client)
    monkeypatch.setattr("app.services.enrichment_cache.get_cached", lambda *_a, **_k: None)
    monkeypatch.setattr("app.services.enrichment_cache.set_cached", lambda *_a, **_k: None)

    from app.services.perplexity_client import enrich_professional_presence
    contacts = [{
        "FirstName": "Ada", "LastName": "Lovelace",
        "Company": "Analytical Engines", "Title": "VP Engineering",
    }]
    result = enrich_professional_presence(contacts)

    assert 0 in result
    posts = result[0]["linkedin_recent_posts"]
    assert len(posts) == 2
    assert posts[0]["kind"] == "talk"
    assert "QCon" in posts[0]["text"]


# ── 2. Flag-routing helper ────────────────────────────────────────────────


def test_perplexity_only_helper_defaults_to_false(monkeypatch):
    """`_perplexity_only` must default to False so the legacy path stays
    primary until rollout completes."""
    # Force is_enabled to return its `default` arg (no Firestore in test env).
    def fake_is_enabled(flag_name, uid=None, default=False):
        assert flag_name == "AGENT_MODE_PERPLEXITY_ONLY"
        return default
    monkeypatch.setattr("app.services.feature_flags.is_enabled", fake_is_enabled)

    from app.services.agent_actions import _perplexity_only
    assert _perplexity_only("any-uid") is False


def test_perplexity_only_helper_returns_true_when_flag_on(monkeypatch):
    monkeypatch.setattr(
        "app.services.feature_flags.is_enabled",
        lambda flag_name, uid=None, default=False: True,
    )
    from app.services.agent_actions import _perplexity_only
    assert _perplexity_only("any-uid") is True


def test_perplexity_only_helper_swallows_feature_flag_errors(monkeypatch):
    """If the feature_flags service blows up, we fall back to the legacy
    path (return False) — never let an infra hiccup break Agent Mode."""
    def boom(*_a, **_k):
        raise RuntimeError("Firestore is down")
    monkeypatch.setattr("app.services.feature_flags.is_enabled", boom)
    from app.services.agent_actions import _perplexity_only
    assert _perplexity_only("any-uid") is False


# ── 3. CREDIT_COSTS values ────────────────────────────────────────────────


def test_credit_costs_match_phase_8_5_prices():
    """Phase 8.5 repricing. If you change these, also update
    LoopActivityFeed.tsx (CREDIT_COST_BY_TYPE) and loopCopy.ts (budget.tooltip)."""
    from app.services.loop_budget import CREDIT_COSTS
    assert CREDIT_COSTS == {
        "contact": 9,
        "hiring_manager": 13,
        "job": 1,
        "company": 1,
    }


def test_estimate_cycle_cost_uses_new_prices():
    """The /api/loops/estimate endpoint reads from CREDIT_COSTS via
    estimate_cycle_cost. Verify a typical (3+1+5+3) cycle costs 48 cr."""
    from app.services.loop_budget import estimate_cycle_cost
    est = estimate_cycle_cost(
        brief_parsed={
            "targetCount": 3,
            "companies": ["Stripe"],
            "roles": ["Engineer"],
        },
        cadence="every_other_day",
    )
    # 3 contacts * 9 + 1 hm * 13 + 5 jobs * 1 + 3 companies * 1 = 48
    assert est["per_cycle_credits"] == 48
    assert est["breakdown"]["contacts"] == 3
    assert est["breakdown"]["hiring_managers"] == 1
    assert est["breakdown"]["jobs"] == 5
    assert est["breakdown"]["companies"] == 3


# ── 4. Retry helper backoff ───────────────────────────────────────────────


def test_chat_with_retry_retries_on_429(monkeypatch):
    """The retry wrapper must retry up to 3 times on 429 responses,
    then surface the last exception."""
    sleeps = []
    monkeypatch.setattr("app.services.perplexity_client.time.sleep", lambda s: sleeps.append(s))

    class Fake429(Exception):
        status_code = 429

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = [
        Fake429("rate limited"),
        Fake429("rate limited"),
        _make_response("ok"),
    ]

    from app.services.perplexity_client import _chat_with_retry
    resp = _chat_with_retry(fake_client, model="sonar", messages=[])
    assert resp.choices[0].message.content == "ok"
    assert fake_client.chat.completions.create.call_count == 3
    assert sleeps == [2, 4], "should sleep 2s then 4s between attempts"


def test_chat_with_retry_does_not_retry_on_non_429(monkeypatch):
    """Non-rate-limit errors should surface immediately, not retry."""
    monkeypatch.setattr("app.services.perplexity_client.time.sleep", lambda s: None)

    class FakeAuthError(Exception):
        status_code = 401

    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = FakeAuthError("auth failed")

    from app.services.perplexity_client import _chat_with_retry
    with pytest.raises(FakeAuthError):
        _chat_with_retry(fake_client, model="sonar", messages=[])
    assert fake_client.chat.completions.create.call_count == 1
