"""Integration tests for the 4-level Perplexity broadening loop in
execute_find_jobs.

Levels:
  L0: "{role} at {company}"                    (exact)
  L1: family-expanded role at {company}        (closely related)
  L2: family-expanded role only                (cross-company)
  L3: family-expanded role + widened location  (nationwide)

Each test fakes `search_jobs_live` so no real Perplexity calls happen. We
also exercise the 3 critical regressions called out in the eng-review test
plan: cache short-circuit on prior L0 hit, cache miss when only L2+ docs
exist, and pre-PR docs without `broadenLevel` defaulting to 0.
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock
from datetime import datetime, timezone, timedelta

import pytest

from app.services import agent_actions
from app.utils.exceptions import RateLimitError


# ── helpers ──────────────────────────────────────────────────────────────


def _stub_db_for_saves(saved_docs: list) -> MagicMock:
    db = MagicMock()
    jobs_coll = MagicMock()

    def fake_add(doc):
        saved_docs.append(doc)
        ref = MagicMock()
        ref.id = f"doc-{len(saved_docs)}"
        return (None, ref)

    jobs_coll.add.side_effect = fake_add
    user_doc = MagicMock()
    user_doc.collection.return_value = jobs_coll
    users_coll = MagicMock()
    users_coll.document.return_value = user_doc
    db.collection.return_value = users_coll
    return db


def _setup(monkeypatch, search_responses, no_cache: bool = True):
    """Install fakes for the Perplexity client + ranker + db.

    `search_responses` is either:
      - a list of lists (each call returns the next list), or
      - a callable (query, location, limit) -> list

    Returns (saved_docs, call_log) where call_log captures (query, location)
    pairs in the order search_jobs_live is invoked.
    """
    if no_cache:
        monkeypatch.setattr(
            agent_actions, "_has_fresh_exact_level_jobs",
            lambda *a, **kw: False,
        )

    saved_docs: list = []
    monkeypatch.setattr(
        agent_actions, "get_db", lambda: _stub_db_for_saves(saved_docs),
    )

    call_log: list[dict] = []

    if callable(search_responses):
        def fake_search(query, location, limit=10):
            call_log.append({"query": query, "location": location})
            return search_responses(query, location, limit)
    else:
        responses_iter = iter(search_responses)

        def fake_search(query, location, limit=10):
            call_log.append({"query": query, "location": location})
            try:
                return next(responses_iter)
            except StopIteration:
                return []

    fake_perplexity = MagicMock()
    fake_perplexity.search_jobs_live = fake_search
    fake_perplexity.enrich_job_posting_live = lambda **kw: {}
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_perplexity)

    # Stub firecrawl_client so enrichment is a no-op.
    fake_firecrawl = MagicMock()
    fake_firecrawl.extract_job_posting = lambda url: {}
    monkeypatch.setitem(sys.modules, "app.services.firecrawl_client", fake_firecrawl)

    # _generate_job_reasons attaches matchReasons via LLM; bypass it.
    monkeypatch.setattr(
        agent_actions, "_generate_job_reasons",
        lambda jobs, user_data: [{**j, "_matchReasons": ["llm reason"]} for j in jobs],
    )
    monkeypatch.setattr(agent_actions, "deduct_credits_atomic", lambda *a, **kw: None)

    # Ranker passes everything through unchanged.
    fake_ranker = MagicMock()
    fake_ranker.rank_for_student = lambda student, jobs, top_k: [
        (j, 80.0, ["pass"]) for j in jobs
    ]
    fake_profile = MagicMock()
    fake_profile.build_student_dict = lambda u: {}
    monkeypatch.setitem(sys.modules, "app.services.student_job_ranker", fake_ranker)
    monkeypatch.setitem(sys.modules, "app.utils.student_profile", fake_profile)

    return saved_docs, call_log


def _real_job(title: str, company: str, url: str) -> dict:
    """A job dict that passes _is_real_job_posting (specific title + URL with
    a job ID, no placeholder-description hints)."""
    return {
        "title": title,
        "company_name": company,
        "company": company,
        "location": "Cupertino, CA",
        "url": url,
        "apply_link": url,
        "summary": f"Hands-on {title} role on the team.",
    }


# ── retry-loop tier coverage ─────────────────────────────────────────────


def test_l0_hit_returns_jobs_tagged_level_0(monkeypatch):
    """Spatial DS exists at Apple → L0 wins, broadenLevel=0 on every saved row."""
    saved_docs, call_log = _setup(
        monkeypatch,
        [[_real_job("Spatial Data Scientist", "Apple", "https://jobs.apple.com/posting/12345")]],
    )

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Apple", "role": "Spatial Data Scientist",
            "count": 5, "cycleId": "c1",
        },
        config={"loopId": "L1", "targetLocations": ["Cupertino, CA"]},
        user_data={"professionalInfo": {}},
    )

    assert result["jobsFound"] == 1
    assert result["broadenLevel"] == 0
    assert len(call_log) == 1
    assert call_log[0]["query"] == "Spatial Data Scientist at Apple"
    assert saved_docs[0]["broadenLevel"] == 0
    assert saved_docs[0]["originalRole"] == "Spatial Data Scientist"
    assert saved_docs[0]["targetCompany"] == "Apple"


def test_l0_empty_l1_hit_tags_level_1(monkeypatch):
    """L0 returns no real postings → L1 with family-expanded role hits."""
    saved_docs, call_log = _setup(
        monkeypatch,
        [
            [],  # L0
            [_real_job("Data Scientist", "Apple", "https://jobs.apple.com/posting/777")],  # L1
        ],
    )

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Apple", "role": "Spatial Data Scientist",
            "count": 5, "cycleId": "c1",
        },
        config={"loopId": "L1", "targetLocations": ["Cupertino, CA"]},
        user_data={"professionalInfo": {}},
    )

    assert result["jobsFound"] == 1
    assert result["broadenLevel"] == 1
    assert call_log[0]["query"] == "Spatial Data Scientist at Apple"
    assert call_log[1]["query"] == "data scientist at Apple"
    assert saved_docs[0]["broadenLevel"] == 1
    assert saved_docs[0]["originalRole"] == "Spatial Data Scientist"
    assert saved_docs[0]["targetCompany"] == "Apple"


def test_l0_l1_l2_empty_l3_hit_tags_level_3(monkeypatch):
    """All near-rungs empty → L3 widens location and wins."""
    saved_docs, call_log = _setup(
        monkeypatch,
        [
            [],  # L0
            [],  # L1
            [],  # L2
            [_real_job("Data Scientist", "Roblox", "https://careers.roblox.com/jobs/abc")],  # L3
        ],
    )

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Apple", "role": "Spatial Data Scientist",
            "count": 5, "cycleId": "c1",
        },
        config={"loopId": "L1", "targetLocations": ["Cupertino, CA"]},
        user_data={"professionalInfo": {}},
    )

    assert result["jobsFound"] == 1
    assert result["broadenLevel"] == 3
    # Last call's location was widened to United States.
    assert call_log[-1]["location"] == "United States"
    assert "in United States" in call_log[-1]["query"]
    assert saved_docs[0]["broadenLevel"] == 3
    assert saved_docs[0]["widerLocation"] == "United States"


def test_all_four_levels_empty_returns_zero(monkeypatch):
    """No level produces anything → jobsFound=0, no docs saved."""
    saved_docs, call_log = _setup(
        monkeypatch,
        [[], [], [], []],
    )

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Apple", "role": "Spatial Data Scientist",
            "count": 5, "cycleId": "c1",
        },
        config={"loopId": "L1", "targetLocations": ["Cupertino, CA"]},
        user_data={"professionalInfo": {}},
    )

    assert result["jobsFound"] == 0
    assert result["jobs"] == []
    assert saved_docs == []
    # All 4 levels attempted (none were duplicates for this brief).
    assert len(call_log) == 4


def test_rate_limit_short_circuits_after_l0(monkeypatch):
    """RateLimitError at L1 stops the loop and surfaces rateLimited=True."""
    call_log: list = []

    def fake_search(query, location, limit=10):
        call_log.append(query)
        # L1 query is "data scientist at Apple" (family-expanded role).
        if query.lower() == "data scientist at apple":
            raise RateLimitError("perplexity 429")
        return []  # L0 empty

    saved_docs, _ = _setup(monkeypatch, fake_search)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Apple", "role": "Spatial Data Scientist",
            "count": 5, "cycleId": "c1",
        },
        config={"loopId": "L1", "targetLocations": ["Cupertino, CA"]},
        user_data={"professionalInfo": {}},
    )

    assert result["jobsFound"] == 0
    assert result.get("rateLimited") is True
    # Only L0 and L1 were attempted before the 429 short-circuit.
    assert len(call_log) == 2


def test_duplicate_query_between_levels_is_skipped(monkeypatch):
    """Role with no family entry → L1 query duplicates L0, so L1 is skipped.
    The loop jumps straight to L2 (which drops the company)."""
    saved_docs, call_log = _setup(
        monkeypatch,
        [
            [],  # L0
            # If L1 was attempted with same query, we'd run out of responses.
            # L2 with role only is the next non-dup query.
            [_real_job("Forward Deployed Engineer", "Other", "https://x.com/jobs/1")],
        ],
    )

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Palantir", "role": "Forward Deployed Engineer",
            "count": 5, "cycleId": "c1",
        },
        config={"loopId": "L1", "targetLocations": ["NYC"]},
        user_data={"professionalInfo": {}},
    )

    assert result["jobsFound"] == 1
    assert result["broadenLevel"] == 2
    assert [c["query"] for c in call_log] == [
        "Forward Deployed Engineer at Palantir",
        "forward deployed engineer",
    ]


# ── 3 CRITICAL regression tests (cache semantics) ────────────────────────


_NOW = datetime.now(timezone.utc)


def _cached_jobs_db(rows: list[dict]) -> MagicMock:
    """A db whose agent_jobs stream returns the supplied rows."""
    db = MagicMock()

    docs = []
    for row in rows:
        d = MagicMock()
        d.to_dict.return_value = row
        docs.append(d)

    query_ref = MagicMock()
    query_ref.stream.return_value = iter(docs)
    query_ref.where.return_value = query_ref

    jobs_coll = MagicMock()
    jobs_coll.where.return_value = query_ref
    # Saves go through the same collection; record into a list for inspection.
    saves: list = []
    jobs_coll.add.side_effect = lambda doc: (saves.append(doc) or (None, MagicMock(id=f"doc-{len(saves)}")))
    db._test_saves = saves

    user_doc = MagicMock()
    user_doc.collection.return_value = jobs_coll
    users_coll = MagicMock()
    users_coll.document.return_value = user_doc
    db.collection.return_value = users_coll
    return db


def test_cache_short_circuit_on_prior_level_0_hit(monkeypatch):
    """CRITICAL: prior cycle saved a level-0 doc within 3 days → next cycle
    must skip the Perplexity call entirely."""
    fresh_iso = _NOW.isoformat().replace("+00:00", "Z")
    db = _cached_jobs_db([{
        "loopId": "L1",
        "company": "Apple",
        "broadenLevel": 0,
        "createdAt": fresh_iso,
    }])
    monkeypatch.setattr(agent_actions, "get_db", lambda: db)

    perplexity_calls = []
    fake = MagicMock()
    def boom(*a, **kw):
        perplexity_calls.append((a, kw))
        return []
    fake.search_jobs_live = boom
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Apple", "role": "Spatial Data Scientist",
            "count": 5, "cycleId": "c2",
        },
        config={"loopId": "L1", "targetLocations": ["Cupertino, CA"]},
        user_data={"professionalInfo": {}},
    )

    assert result.get("cacheHit") is True
    assert perplexity_calls == []  # Perplexity was NEVER called.
    assert db._test_saves == []  # No new docs written.


def test_cache_miss_when_only_broadened_docs_exist(monkeypatch):
    """CRITICAL: prior cycle saved only L2 docs (cross-company widen). The
    next cycle should NOT short-circuit — Perplexity must be called again
    to re-attempt the exact L0 query."""
    fresh_iso = _NOW.isoformat().replace("+00:00", "Z")
    db = _cached_jobs_db([{
        "loopId": "L1",
        "company": "Apple",
        "broadenLevel": 2,  # Broadened, not exact.
        "createdAt": fresh_iso,
    }])
    monkeypatch.setattr(agent_actions, "get_db", lambda: db)

    fake_perplexity = MagicMock()
    fake_perplexity.search_jobs_live = lambda query, location, limit=10: [
        _real_job("Spatial Data Scientist", "Apple", "https://jobs.apple.com/posting/999"),
    ]
    fake_perplexity.enrich_job_posting_live = lambda **kw: {}
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_perplexity)

    fake_firecrawl = MagicMock()
    fake_firecrawl.extract_job_posting = lambda url: {}
    monkeypatch.setitem(sys.modules, "app.services.firecrawl_client", fake_firecrawl)

    monkeypatch.setattr(
        agent_actions, "_generate_job_reasons",
        lambda jobs, user_data: [{**j, "_matchReasons": []} for j in jobs],
    )
    monkeypatch.setattr(agent_actions, "deduct_credits_atomic", lambda *a, **kw: None)
    fake_ranker = MagicMock()
    fake_ranker.rank_for_student = lambda *a, **kw: []
    fake_profile = MagicMock()
    fake_profile.build_student_dict = lambda u: {}
    monkeypatch.setitem(sys.modules, "app.services.student_job_ranker", fake_ranker)
    monkeypatch.setitem(sys.modules, "app.utils.student_profile", fake_profile)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Apple", "role": "Spatial Data Scientist",
            "count": 5, "cycleId": "c2",
        },
        config={"loopId": "L1", "targetLocations": ["Cupertino, CA"]},
        user_data={"professionalInfo": {}},
    )

    # No cache hit — Perplexity was called and a fresh doc was saved.
    assert result.get("cacheHit") is not True
    assert result["jobsFound"] == 1
    assert len(db._test_saves) == 1


def test_cache_short_circuit_on_pre_pr_doc_without_field(monkeypatch):
    """CRITICAL: docs saved before this PR have no `broadenLevel` field.
    The cache check must treat the missing field as 0 (exact) so existing
    loops still see their cache hits and don't re-burn Perplexity quota."""
    fresh_iso = _NOW.isoformat().replace("+00:00", "Z")
    db = _cached_jobs_db([{
        "loopId": "L1",
        "company": "Apple",
        # No broadenLevel field — pre-PR doc.
        "createdAt": fresh_iso,
    }])
    monkeypatch.setattr(agent_actions, "get_db", lambda: db)

    perplexity_calls = []
    fake = MagicMock()
    fake.search_jobs_live = lambda *a, **kw: perplexity_calls.append(1) or []
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={
            "company": "Apple", "role": "Software Engineer",
            "count": 5, "cycleId": "c2",
        },
        config={"loopId": "L1", "targetLocations": ["Cupertino, CA"]},
        user_data={"professionalInfo": {}},
    )

    assert result.get("cacheHit") is True
    assert perplexity_calls == []
