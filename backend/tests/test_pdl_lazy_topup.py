"""Tests for the PDL lazy-topup retry loop in search_contacts_from_prompt.

The retry chain inside `search_contacts_from_prompt` used to break the moment
ANY new contacts landed at the current rung. That silently dropped 3 of 5 PDL
records on hard searches (paid for, filtered out, never returned).

After Phase 3 of the deliverability plan, the break condition is "enough
VERIFIED contacts accumulated OR PDL budget cap hit," with each rung
excluding the pdlIds we've already seen via a must_not clause.

These tests pin the new behavior with mocked execute_pdl_search returns.
"""
from unittest.mock import patch, MagicMock

from app.services import pdl_client


def _mk_contact(pdl_id: str, source: str = "pdl", first: str = None, last: str = None, company: str = "Acme"):
    """Build a minimal contact dict matching the shape produced by
    extract_contact_from_pdl_person_enhanced. EmailSource drives the
    verified count via HIGH_CONFIDENCE_EMAIL_SOURCES."""
    fn = first or f"First{pdl_id}"
    ln = last or f"Last{pdl_id}"
    return {
        "pdlId": pdl_id,
        "FirstName": fn,
        "LastName": ln,
        "Company": company,
        "Title": "PM",
        "EmailSource": source,
        "Email": f"{fn.lower()}.{ln.lower()}@acme.com",
        "EmailVerified": source in pdl_client.HIGH_CONFIDENCE_EMAIL_SOURCES,
        "EmailConfidenceScore": 90 if source == "hunter_finder" else 0,
        "LinkedIn": f"https://linkedin.com/in/{fn.lower()}{ln.lower()}",
    }


def _patch_common():
    """Patch out cache + post-filter + identity helpers so the retry loop is
    exercised cleanly. Returns a list of patch context managers."""
    # Cache miss → fall through to PDL.
    cache_patch = patch.object(pdl_client, "pdl_cache", None, create=True)

    # Pass every contact through post-validation.
    match_patch = patch.object(
        pdl_client, "_contact_matches_prompt_criteria",
        return_value=(True, None),
    )
    # Identity key = pdlId (avoids dependency on name normalization edge cases).
    identity_patch = patch.object(
        pdl_client, "get_contact_identity",
        side_effect=lambda c: c.get("pdlId"),
    )
    # Build-query: don't care about the actual ES body, just that it gets called.
    build_query_spy = patch.object(
        pdl_client, "build_query_from_prompt",
        wraps=pdl_client.build_query_from_prompt,
    )
    # Cache write is best-effort; stub it.
    cache_write_patch = patch("app.services.pdl_cache.set", return_value=None, create=True)
    return cache_patch, match_patch, identity_patch, build_query_spy, cache_write_patch


def _run_with_attempts(attempt_returns, max_contacts: int = 5, exclude_keys=None):
    """Invoke search_contacts_from_prompt with execute_pdl_search mocked to
    return a different list of raw_contacts per attempt.

    attempt_returns: list of lists, one per attempt (level 0, 1, 2, 3).
    """
    parsed_prompt = {
        "companies": [{"name": "Acme"}],
        "title_variations": ["pm"],
        "industries": [],
        "schools": [],
        "locations": [],
    }
    exclude_keys = exclude_keys or set()

    # execute_pdl_search returns (raw_contacts, status_code). Cycle through
    # the attempt_returns; when exhausted return ([], 200) so further attempts
    # fall through without breaking anything.
    call_log = {"count": 0, "exclude_ids_per_call": []}

    def mock_search(*args, **kwargs):
        idx = call_log["count"]
        call_log["count"] += 1
        # Capture the query_obj's must_not so tests can assert pdlId exclusion
        # is propagated to subsequent attempts.
        query_obj = kwargs.get("query_obj") or (args[2] if len(args) > 2 else {})
        must_not = (query_obj.get("bool") or {}).get("must_not") or []
        excluded_ids = []
        for clause in must_not:
            terms = (clause.get("terms") or {}).get("id") or []
            excluded_ids.extend(terms)
        call_log["exclude_ids_per_call"].append(excluded_ids)

        if idx < len(attempt_returns):
            return attempt_returns[idx], 200
        return [], 200

    cache_patch, match_patch, identity_patch, build_query_spy, cache_write_patch = _patch_common()

    with (
        patch.object(pdl_client, "execute_pdl_search", side_effect=mock_search) as mock_exec,
        match_patch,
        identity_patch,
        build_query_spy,
        cache_write_patch,
    ):
        result = pdl_client.search_contacts_from_prompt(
            parsed_prompt=parsed_prompt,
            max_contacts=max_contacts,
            exclude_keys=exclude_keys,
            user_profile=None,
        )

    returned_contacts, retry_level_used, already_saved, adjacency_metadata = result
    return returned_contacts, retry_level_used, adjacency_metadata, call_log


class TestLazyTopup:
    def test_enough_verified_at_level_0_no_topup(self):
        """5 of 5 PDL records at level 0 are verified → no further attempts fire."""
        level_0 = [_mk_contact(str(i), source="pdl") for i in range(5)]
        returned, level_used, adj, log = _run_with_attempts([level_0], max_contacts=5)

        assert len(returned) == 5
        assert level_used == 0
        assert log["count"] == 1, f"expected 1 PDL call, got {log['count']}"
        assert (adj or {}).get("email_quality") == "high"

    def test_short_at_level_0_topup_fills_to_target(self):
        """2 verified at level 0, 3 more verified arrive at level 1 → 5 total, level 1 used."""
        level_0 = [_mk_contact("a", "pdl"), _mk_contact("b", "pdl"),
                   _mk_contact("c", "pattern"), _mk_contact("d", "pattern")]
        level_1 = [_mk_contact("e", "hunter_finder"), _mk_contact("f", "hunter_finder"),
                   _mk_contact("g", "hunter_finder")]
        returned, level_used, adj, log = _run_with_attempts([level_0, level_1], max_contacts=5)

        # 5 verified ([a, b, e, f, g]) returned; verified-only filter is the
        # default behavior at the end of search_contacts_from_prompt.
        returned_sources = [c.get("EmailSource") for c in returned]
        assert all(s in pdl_client.HIGH_CONFIDENCE_EMAIL_SOURCES for s in returned_sources), (
            f"expected only high-confidence sources in return, got {returned_sources}"
        )
        assert len(returned) == 5
        assert level_used == 1, f"expected retry_level_used=1, got {level_used}"
        assert log["count"] == 2, f"expected 2 PDL calls (level 0 + topup), got {log['count']}"

    def test_topup_excludes_prior_pdl_ids_on_subsequent_attempts(self):
        """Each topup call must carry the prior cumulative pdlIds in must_not."""
        level_0 = [_mk_contact("a", "pdl"), _mk_contact("b", "pattern")]
        level_1 = [_mk_contact("c", "hunter_finder"), _mk_contact("d", "hunter_finder")]
        level_2 = [_mk_contact("e", "neverbounce_verified")]

        _run_with_attempts([level_0, level_1, level_2], max_contacts=5)

        excl = _last_run_excludes._captured
        # First call has no exclusions
        assert excl[0] == []
        # Second call excludes pdlIds from level 0 (both a and b survived dedup/post-filter)
        assert set(excl[1]) == {"a", "b"}
        # Third call excludes cumulative: a, b, c, d
        assert set(excl[2]) == {"a", "b", "c", "d"}

    def test_budget_cap_stops_topup(self):
        """When records_fetched_total hits the budget cap, retry stops even
        if verified count is still short."""
        # max_contacts=2, buffer ≈ max(1, 2//4)=1, fetch_limit=3, cap=2*2+1=5.
        # Level 0: 3 raw → records=3. 1 verified → still short, but cap not yet hit.
        # Level 1: 3 raw → records=6 → cap hit. Stop.
        # Level 2 should NOT be called.
        level_0 = [_mk_contact("a", "pdl"), _mk_contact("b", "pattern"), _mk_contact("c", "pattern")]
        level_1 = [_mk_contact("d", "pattern"), _mk_contact("e", "pattern"), _mk_contact("f", "pattern")]
        level_2 = [_mk_contact("g", "hunter_finder")]  # never reached

        returned, level_used, adj, log = _run_with_attempts(
            [level_0, level_1, level_2], max_contacts=2,
        )

        assert log["count"] == 2, (
            f"budget cap should stop retry after level 1; got {log['count']} PDL calls"
        )
        assert level_used in (0, 1)
        # Only "a" is verified; the rest are pattern. So return is just [a].
        assert len(returned) == 1
        assert returned[0]["pdlId"] == "a"


# --- Helper to capture exclude_pdl_ids across calls ---------------------------
class _LastRunExcludes:
    _captured = []


_last_run_excludes = _LastRunExcludes()


# Re-wire _run_with_attempts so test_topup_excludes_prior_pdl_ids_on_subsequent_attempts
# can read the captured ids. We can't reach into the closure of _run_with_attempts
# from outside, so reassign here.
_original_run = _run_with_attempts


def _run_with_attempts(attempt_returns, max_contacts: int = 5, exclude_keys=None):  # noqa: F811
    parsed_prompt = {
        "companies": [{"name": "Acme"}],
        "title_variations": ["pm"],
        "industries": [],
        "schools": [],
        "locations": [],
    }
    exclude_keys = exclude_keys or set()
    captured = []

    def mock_search(*args, **kwargs):
        idx = mock_search.calls
        mock_search.calls += 1
        query_obj = kwargs.get("query_obj") or (args[2] if len(args) > 2 else {})
        must_not = (query_obj.get("bool") or {}).get("must_not") or []
        excluded_ids = []
        for clause in must_not:
            terms = (clause.get("terms") or {}).get("id") or []
            excluded_ids.extend(terms)
        captured.append(excluded_ids)
        if idx < len(attempt_returns):
            return attempt_returns[idx], 200
        return [], 200

    mock_search.calls = 0

    cache_patch, match_patch, identity_patch, build_query_spy, cache_write_patch = _patch_common()

    with (
        patch.object(pdl_client, "execute_pdl_search", side_effect=mock_search),
        match_patch,
        identity_patch,
        build_query_spy,
        cache_write_patch,
    ):
        result = pdl_client.search_contacts_from_prompt(
            parsed_prompt=parsed_prompt,
            max_contacts=max_contacts,
            exclude_keys=exclude_keys,
            user_profile=None,
        )

    _last_run_excludes._captured = captured
    returned_contacts, retry_level_used, already_saved, adjacency_metadata = result
    return returned_contacts, retry_level_used, adjacency_metadata, {"count": mock_search.calls}
