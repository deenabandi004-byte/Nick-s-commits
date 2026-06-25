"""Tests for hardnos_parser. Exercises the penalty math (no LLM call) and
the cache key hashing. The actual LLM extraction has its own integration
test surface (manual probe against a real user)."""
from backend.app.utils.hardnos_parser import (
    HARDNOS_PENALTY,
    _hash_text,
    _job_search_blob,
    apply_hardnos_penalty,
)


def test_apply_penalty_reduces_matching_job_score():
    jobs = [
        {"job_id": "a", "title": "Sales Development Rep", "company": "X", "match_score": 80},
        {"job_id": "b", "title": "Backend Engineer",      "company": "Y", "match_score": 75},
    ]
    out, count = apply_hardnos_penalty(jobs, ["sales development"])
    assert count == 1
    a = next(j for j in out if j["job_id"] == "a")
    assert a["match_score"] == 80 - HARDNOS_PENALTY


def test_no_concepts_no_penalty():
    jobs = [{"job_id": "a", "title": "T", "company": "C", "match_score": 80}]
    out, count = apply_hardnos_penalty(jobs, [])
    assert count == 0
    assert out[0]["match_score"] == 80


def test_word_boundary_match_avoids_false_positives():
    """Concept 'ads' must not match 'address' or 'load'."""
    jobs = [
        {"job_id": "a", "title": "Mailing Address Manager", "company": "X", "match_score": 70},
        {"job_id": "b", "title": "Load Balancer Engineer",  "company": "Y", "match_score": 60},
    ]
    out, count = apply_hardnos_penalty(jobs, ["ads"])
    assert count == 0


def test_penalty_clamped_at_zero():
    jobs = [{"job_id": "a", "title": "Sales", "company": "X", "match_score": 10}]
    out, count = apply_hardnos_penalty(jobs, ["sales"])
    assert count == 1
    assert out[0]["match_score"] == 0  # 10 - 30 clamped to 0


def test_penalty_reorders_by_score():
    jobs = [
        {"job_id": "a", "title": "Sales Dev", "company": "X", "match_score": 80},
        {"job_id": "b", "title": "Backend",   "company": "Y", "match_score": 70},
    ]
    out, _ = apply_hardnos_penalty(jobs, ["sales"])
    # a was 80 -> 50; b stays 70. b should now lead.
    assert out[0]["job_id"] == "b"
    assert out[1]["job_id"] == "a"


def test_match_in_company_name():
    jobs = [{"job_id": "a", "title": "Backend", "company": "AdAgency Inc", "match_score": 70}]
    out, count = apply_hardnos_penalty(jobs, ["adagency"])
    assert count == 1


def test_match_in_description_within_500_chars():
    jobs = [{
        "job_id": "a",
        "title": "Backend",
        "company": "X",
        "match_score": 70,
        "description": "We are a stealth crypto startup looking for engineers.",
    }]
    out, count = apply_hardnos_penalty(jobs, ["crypto startup"])
    assert count == 1


def test_match_beyond_description_scan_window_ignored():
    """Anything past 500 chars of description is intentionally not scanned
    to bound cost. Concepts in extremely-long descriptions slip through."""
    long = "x " * 300 + " crypto startup"  # 'crypto startup' lands at ~600 chars
    jobs = [{
        "job_id": "a",
        "title": "Backend",
        "company": "X",
        "match_score": 70,
        "description": long,
    }]
    out, count = apply_hardnos_penalty(jobs, ["crypto startup"])
    assert count == 0


def test_hash_text_stable_across_whitespace_and_case():
    """Cache key should be stable across leading/trailing whitespace and
    case changes so re-saving the same hardNos text reuses the cache."""
    assert _hash_text("  No sales roles  ") == _hash_text("no sales roles")
    assert _hash_text("NO SALES ROLES") == _hash_text("no sales roles")


def test_hash_text_differs_for_different_content():
    assert _hash_text("no sales") != _hash_text("no marketing")


def test_search_blob_lowercases_once():
    blob = _job_search_blob({"title": "Senior", "company": "ACME", "description": "FAST"})
    assert "senior" in blob
    assert "acme" in blob
    assert "fast" in blob


def test_jobs_with_no_match_score_are_skipped():
    """Defensive: jobs without a numeric match_score (e.g., unranked) skip
    the penalty step rather than crashing or getting None - 30."""
    jobs = [
        {"job_id": "a", "title": "Sales", "company": "X", "match_score": None},
        {"job_id": "b", "title": "Sales", "company": "Y", "match_score": 70},
    ]
    out, count = apply_hardnos_penalty(jobs, ["sales"])
    assert count == 1  # only b was penalized
    a = next(j for j in out if j["job_id"] == "a")
    assert a["match_score"] is None  # left alone


