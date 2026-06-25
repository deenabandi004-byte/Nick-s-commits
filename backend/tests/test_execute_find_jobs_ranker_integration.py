"""
Integration tests for the student-job ranker wired into execute_find_jobs.

The ranker is stranded in carve-out (d); this PR wires it in. Tests verify:
  - Successful ranker output replaces the LLM-scored order
  - Ranker hard-filtering everything (e.g. visa-blind student vs no-sponsor
    company) falls back to LLM order rather than saving zero jobs
  - Ranker exception falls back to LLM order without crashing the cycle

All external APIs are mocked. Zero real HTTP.
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock

from app.services import agent_actions


def _stub_db_for_saves(saved_docs: list) -> MagicMock:
    """Fake db whose jobs subcollection .add() records each saved doc."""
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


def _setup_jobs_path(monkeypatch, jobs: list, ranker_return=None, ranker_raises=False):
    """Common monkeypatching for the find_jobs live path. Returns saved_docs."""
    monkeypatch.setattr(agent_actions, "_has_fresh_cached_rows", lambda *a, **kw: False)
    saved_docs: list = []
    monkeypatch.setattr(agent_actions, "get_db", lambda: _stub_db_for_saves(saved_docs))

    fake_perplexity = MagicMock()
    fake_perplexity.search_jobs_live = lambda *a, **kw: jobs
    monkeypatch.setitem(sys.modules, "app.services.perplexity_client", fake_perplexity)

    # _generate_job_reasons attaches matchReasons via LLM; bypass it.
    monkeypatch.setattr(
        agent_actions, "_generate_job_reasons",
        lambda jobs, user_data: [{**j, "_matchReasons": ["llm reason"]} for j in jobs],
    )

    # Skip credit deduction noise.
    monkeypatch.setattr(agent_actions, "deduct_credits_atomic", lambda *a, **kw: None)

    # Override the ranker module loaded inside execute_find_jobs.
    fake_ranker = MagicMock()
    fake_profile = MagicMock()
    fake_profile.build_student_dict = lambda user_data: {"major": "CS"}

    if ranker_raises:
        def _raise(*a, **kw):
            raise RuntimeError("ranker exploded")
        fake_ranker.rank_for_student = _raise
    else:
        fake_ranker.rank_for_student = lambda student, jobs, top_k: ranker_return

    monkeypatch.setitem(sys.modules, "app.services.student_job_ranker", fake_ranker)
    monkeypatch.setitem(sys.modules, "app.utils.student_profile", fake_profile)

    return saved_docs


def test_ranker_output_replaces_llm_order(monkeypatch):
    """When the ranker returns a non-empty list, saved jobs follow ranker
    order, not LLM order. Visa-aware filtering happens here too."""
    llm_jobs = [
        {"title": "Senior Eng", "company_name": "Goldman", "apply_link": "g1"},
        {"title": "SWE Intern", "company_name": "Stripe", "apply_link": "s1"},
        {"title": "Junior Eng", "company_name": "Linear", "apply_link": "l1"},
    ]
    # Ranker keeps only the intern + reorders Linear above Stripe.
    ranker_out = [
        ({"title": "Junior Eng", "company_name": "Linear", "apply_link": "l1",
          "_matchReasons": ["llm reason"]}, 95.0, ["entry_level_fit"]),
        ({"title": "SWE Intern", "company_name": "Stripe", "apply_link": "s1",
          "_matchReasons": ["llm reason"]}, 88.0, ["industry_match"]),
    ]

    saved_docs = _setup_jobs_path(monkeypatch, llm_jobs, ranker_return=ranker_out)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={"company": "All", "role": "Engineer", "count": 5, "cycleId": "c1"},
        config={"loopId": "L1"},
        user_data={"professionalInfo": {}},
    )

    # Senior Eng was filtered out — only 2 saved
    assert result["jobsFound"] == 2
    saved_titles = [doc["title"] for doc in saved_docs]
    assert saved_titles == ["Junior Eng", "SWE Intern"]


def test_ranker_empty_result_falls_back_to_llm_order(monkeypatch):
    """If the ranker hard-filters every job (e.g. visa-blind candidate, no
    sponsors), we'd rather save the unranked set than show zero results.
    The fallback preserves access to jobs while the student fixes their
    profile."""
    llm_jobs = [
        {"title": "SWE Intern", "company_name": "A", "apply_link": "a"},
        {"title": "SWE Intern", "company_name": "B", "apply_link": "b"},
    ]
    saved_docs = _setup_jobs_path(monkeypatch, llm_jobs, ranker_return=[])

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={"company": "All", "role": "SWE", "count": 5, "cycleId": "c1"},
        config={"loopId": "L1"},
        user_data={"professionalInfo": {}},
    )

    assert result["jobsFound"] == 2
    saved_companies = [doc["company"] for doc in saved_docs]
    assert saved_companies == ["A", "B"]


def test_ranker_exception_falls_back_to_llm_order(monkeypatch):
    """A ranker bug must not break the cycle. Log + fall back."""
    llm_jobs = [
        {"title": "SWE", "company_name": "Stripe", "apply_link": "s"},
    ]
    saved_docs = _setup_jobs_path(monkeypatch, llm_jobs, ranker_raises=True)

    result = agent_actions.execute_find_jobs(
        uid="u1",
        action={"company": "Stripe", "role": "SWE", "count": 5, "cycleId": "c1"},
        config={"loopId": "L1"},
        user_data={"professionalInfo": {}},
    )

    assert result["jobsFound"] == 1
    assert saved_docs[0]["company"] == "Stripe"
