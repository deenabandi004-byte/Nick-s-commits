"""
End-to-end tests against the MCP server, driven via Flask's test_client.

These exercise the same JSON-RPC surface a real MCP client (Claude
Desktop, Cursor, etc.) would hit, but without launching gunicorn or
making real API calls. Paid APIs are mocked via conftest.py fixtures.
"""
from __future__ import annotations

import json

import pytest


JSONRPC_VERSION = "2.0"


# ── Helpers ──────────────────────────────────────────────────────────────────


def _rpc(client, method: str, params: dict | None = None, *, request_id: int = 1):
    body = {
        "jsonrpc": JSONRPC_VERSION,
        "id": request_id,
        "method": method,
        "params": params or {},
    }
    resp = client.post("/mcp", data=json.dumps(body), content_type="application/json")
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()


def _call_tool(client, name: str, args: dict, *, request_id: int = 1):
    return _rpc(client, "tools/call", {"name": name, "arguments": args}, request_id=request_id)


def _structured(envelope: dict) -> dict:
    assert envelope.get("jsonrpc") == JSONRPC_VERSION
    assert "result" in envelope, envelope
    return envelope["result"].get("structuredContent") or {}


# ── 0. OAuth challenge surface ───────────────────────────────────────────────


def _oauth_challenge_asserts(resp):
    """Common assertions for an RFC 9728 challenge response. Claude.ai's
    MCP connector + Smithery's scanner both rely on this exact shape."""
    assert resp.status_code == 401
    challenge = resp.headers.get("WWW-Authenticate", "")
    assert challenge.startswith("Bearer "), f"got: {challenge!r}"
    assert 'resource_metadata="' in challenge
    assert ".well-known/oauth-protected-resource" in challenge


def test_missing_bearer_returns_401_with_www_authenticate(unauthed_client):
    """RFC 9728 §5.3 + MCP authorization spec: servers MUST return 401 with
    a WWW-Authenticate header pointing at the PRM URL so MCP clients can
    discover the AS. Returning 200 to unauthenticated requests is what
    caused Claude.ai's connector UI to skip the Sign In flow."""
    resp = unauthed_client.post(
        "/mcp",
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}),
        content_type="application/json",
    )
    _oauth_challenge_asserts(resp)


def test_invalid_bearer_returns_401_with_www_authenticate(unauthed_client):
    """Same challenge for an invalid/expired token — lets the client know
    to refresh or re-run the OAuth handshake instead of treating tool calls
    as broken."""
    resp = unauthed_client.post(
        "/mcp",
        headers={"Authorization": "Bearer invalid"},
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}),
        content_type="application/json",
    )
    _oauth_challenge_asserts(resp)


def test_non_bearer_authorization_header_returns_401(unauthed_client):
    """A Basic / Digest / random Authorization header should still 401 —
    only `Bearer <token>` is acceptable per the AS metadata."""
    resp = unauthed_client.post(
        "/mcp",
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}),
        content_type="application/json",
    )
    _oauth_challenge_asserts(resp)


def test_valid_bearer_passes_through_to_handler(client):
    """Sanity: the authed client fixture verifies as a real user_ctx and
    can reach initialize. (All downstream tool tests rely on this.)"""
    resp = client.post(
        "/mcp",
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize"}),
        content_type="application/json",
    )
    assert resp.status_code == 200


# ── 0a. Tier-aware rate limiting ─────────────────────────────────────────────


def _make_tiered_client(mcp_app, *, tier: str, uid: str = "user-x"):
    """Build a test client whose Bearer verifies as a specific (uid, tier)."""
    from app.mcp_server import flask_mount

    def fake_verify(_token):
        return {"sub": uid, "tier": tier, "scope": "mcp:read mcp:write"}

    # Re-stub for this test only — monkeypatch.setattr above doesn't compose
    # with our caller-supplied tier, so do it directly here.
    flask_mount.verify_access_token = fake_verify  # type: ignore[assignment]
    tc = mcp_app.test_client()
    tc.environ_base["HTTP_AUTHORIZATION"] = "Bearer test"
    return tc


def test_elite_tier_does_not_hit_find_contacts_day_cap(
    mcp_app, mock_pdl, mock_warmth, call_counter,
):
    """Elite has unlimited daily calls (day_cap = None). 15 calls in a row
    should all succeed — no paywall, no rate-limit short-circuit. This is
    the regression test for the dogfood incident where an Elite user was
    seeing free-tier paywalls because the limiter ignored their JWT tier."""
    tc = _make_tiered_client(mcp_app, tier="elite", uid="elite-user")
    for i in range(15):
        env = _rpc(tc, "tools/call", {
            "name": "find_contacts",
            "arguments": {"company": f"Elite Firm {i}", "school": "USC"},
        }, request_id=i)
        result = env["result"]["structuredContent"]
        assert result.get("paywall") is None, (
            f"call {i+1} was unexpectedly paywalled: {result.get('paywall')!r}"
        )


def test_uid_buckets_separate_so_two_users_dont_share_quota(
    mcp_app, mock_pdl, mock_warmth, call_counter,
):
    """User A burning their entire free-tier daily quota must not block
    User B from making any calls — they're separate rate-limit buckets."""
    tc_a = _make_tiered_client(mcp_app, tier="free", uid="user-a")
    tc_b = _make_tiered_client(mcp_app, tier="free", uid="user-b")

    # Recreate tc_a's client with the user-a verify stub. Switching the
    # global verify_access_token mid-test means both clients now resolve
    # to user-b's stub; rebuild both at the right moments.
    from app.mcp_server import flask_mount

    flask_mount.verify_access_token = lambda _t: {
        "sub": "user-a", "tier": "free", "scope": "mcp:read mcp:write"
    }
    tc_a = mcp_app.test_client()
    tc_a.environ_base["HTTP_AUTHORIZATION"] = "Bearer test"

    # Burn user-a's 10/day quota (11th call paywalled).
    for i in range(11):
        env = _rpc(tc_a, "tools/call", {
            "name": "find_contacts",
            "arguments": {"company": f"A Firm {i}", "school": "USC"},
        }, request_id=i)
        if env["result"]["structuredContent"].get("paywall") is not None:
            break

    flask_mount.verify_access_token = lambda _t: {
        "sub": "user-b", "tier": "free", "scope": "mcp:read mcp:write"
    }
    tc_b = mcp_app.test_client()
    tc_b.environ_base["HTTP_AUTHORIZATION"] = "Bearer test"

    # user-b's first call must NOT be paywalled despite user-a being capped.
    env = _rpc(tc_b, "tools/call", {
        "name": "find_contacts",
        "arguments": {"company": "B Firm", "school": "USC"},
    })
    result = env["result"]["structuredContent"]
    assert result.get("paywall") is None, (
        "user-b inherited user-a's quota — buckets are still shared"
    )


# ── 0b. Discovery metadata at path-aware URLs ────────────────────────────────


def _is_as_metadata(payload: dict) -> bool:
    """A minimal RFC 8414 metadata shape — what Claude.ai needs to parse."""
    return (
        isinstance(payload, dict)
        and "issuer" in payload
        and "authorization_endpoint" in payload
        and "token_endpoint" in payload
        and "registration_endpoint" in payload
    )


def test_as_metadata_at_bare_well_known_path(unauthed_client):
    resp = unauthed_client.get("/.well-known/oauth-authorization-server")
    assert resp.status_code == 200
    assert _is_as_metadata(resp.get_json())


def test_as_metadata_at_path_aware_well_known(unauthed_client):
    """RFC 8414 §3.1: with issuer = https://www.offerloop.ai/oauth, the
    metadata URL is /.well-known/oauth-authorization-server/oauth. Claude.ai
    hits this first; the bare path is only its fallback. Without this route
    the SPA 404 handler caught it and returned index.html, breaking DCR."""
    resp = unauthed_client.get("/.well-known/oauth-authorization-server/oauth")
    assert resp.status_code == 200
    assert _is_as_metadata(resp.get_json())


def test_as_metadata_at_oidc_discovery_paths(unauthed_client):
    """Claude.ai's connector falls back to OIDC discovery URLs when RFC 8414
    paths return non-JSON. Serve OAuth metadata at the OIDC paths to keep
    that fallback chain happy."""
    for path in (
        "/.well-known/openid-configuration",
        "/.well-known/openid-configuration/oauth",
        "/oauth/.well-known/openid-configuration",
    ):
        resp = unauthed_client.get(path)
        assert resp.status_code == 200, f"path {path} returned {resp.status_code}"
        assert _is_as_metadata(resp.get_json()), f"path {path} returned non-AS metadata"


def test_prm_metadata_at_path_aware_well_known(unauthed_client):
    """RFC 9728 path-aware variant. Bare path also still works."""
    resp = unauthed_client.get("/.well-known/oauth-protected-resource/mcp")
    assert resp.status_code == 200
    body = resp.get_json()
    assert "authorization_servers" in body
    assert "resource" in body


# ── 1. Tool discovery ────────────────────────────────────────────────────────


def test_initialize_returns_server_info(client):
    env = _rpc(client, "initialize", {"protocolVersion": "2025-06-18"})
    result = env["result"]
    assert result["serverInfo"]["name"] == "offerloop"
    assert result["serverInfo"]["version"]
    assert "tools" in result["capabilities"]


def test_tools_list_returns_three_tools(client):
    env = _rpc(client, "tools/list")
    tools = env["result"]["tools"]
    names = sorted(t["name"] for t in tools)
    assert names == ["draft_outreach", "find_contacts", "get_company_intel"]
    for t in tools:
        assert t["description"]
        assert "inputSchema" in t
        assert t["inputSchema"]["type"] == "object"


# ── 2. find_contacts golden path ─────────────────────────────────────────────


def test_find_contacts_returns_personalization_hooks(
    client, mock_pdl, mock_warmth, call_counter
):
    env = _call_tool(client, "find_contacts", {
        "company": "Goldman Sachs",
        "school": "University of Southern California",
        "role": "Investment Banking Analyst",
    })
    result = _structured(env)
    assert result["company"] == "Goldman Sachs"
    assert result["cached"] is False
    assert len(result["contacts"]) == 5
    for c in result["contacts"]:
        assert c["name"]
        assert "personalization_hook" in c
        assert "warmth" in c
        # email is part of the schema even when null — needed so Claude can
        # chain find_contacts → draft_outreach without prompting the user
        # for an email it could have just passed through.
        assert "email" in c
    # Alumni signal should fire for USC-tagged contacts
    rel_types = [c.get("relationship_type") for c in result["contacts"]]
    assert "alumni" in rel_types
    assert call_counter.pdl == 1


def test_find_contacts_surfaces_pdl_email_with_workemail_preference(
    client, monkeypatch, mock_warmth, call_counter,
):
    """When PDL has emails, find_contacts must include them in the output so
    Claude can pass them through to draft_outreach.contact.email. Preference:
    WorkEmail > Email > PersonalEmail. Matches gmail_client._select_recipient_email
    so anything we surface here can actually drive a Gmail draft downstream."""
    import app.services.pdl_client as pdl_mod

    def fake_search(parsed_prompt, max_contacts, exclude_keys=None, user_profile=None):
        call_counter.pdl += 1
        contacts = [
            {
                "FirstName": "Has", "LastName": "WorkEmail", "Title": "Engineer",
                "Company": "Goldman Sachs", "College": "USC",
                "WorkEmail": "has.workemail@gs.com",
                "Email": "fallback@gs.com",
                "PersonalEmail": "personal@gmail.com",
            },
            {
                "FirstName": "Only", "LastName": "Primary", "Title": "Analyst",
                "Company": "Goldman Sachs", "College": "USC",
                "WorkEmail": "Not available",
                "Email": "only.primary@gs.com",
            },
            {
                "FirstName": "Personal", "LastName": "Only", "Title": "Associate",
                "Company": "Goldman Sachs", "College": "USC",
                "WorkEmail": "",
                "Email": "placeholder@domain.com",  # blocked by gmail_client guard
                "PersonalEmail": "personal.only@gmail.com",
            },
            {
                "FirstName": "No", "LastName": "Email", "Title": "VP",
                "Company": "Goldman Sachs", "College": "USC",
            },
        ]
        return contacts, 0, [], {"provider": "pdl"}

    monkeypatch.setattr(pdl_mod, "search_contacts_from_prompt", fake_search)

    env = _call_tool(client, "find_contacts", {
        "company": "Goldman Sachs",
        "school": "USC",
        "count": 4,
    })
    result = _structured(env)
    by_name = {c["name"]: c for c in result["contacts"]}
    assert by_name["Has WorkEmail"]["email"] == "has.workemail@gs.com"
    assert by_name["Only Primary"]["email"] == "only.primary@gs.com"
    assert by_name["Personal Only"]["email"] == "personal.only@gmail.com"
    assert by_name["No Email"]["email"] is None


# ── 2c. My Network persist fires on both cache-hit and cold path ────────────


def test_find_contacts_persists_to_my_network_on_cache_hit(
    mcp_app, fake_db, mock_pdl, mock_warmth, call_counter, monkeypatch,
):
    """The mcp_cache isn't bucketed by uid, so the same args from a SECOND
    user must serve from cache AND still write that user's My Network.

    Regression test for the bug where the cold path called persist_contacts
    but the cache-hit branch returned early — meaning users who hit a
    warmed cache got search results back but their My Network stayed empty.
    """
    from app.mcp_server import flask_mount

    def _client_for(uid: str):
        # Override verify_access_token for THIS uid; rebuild client so the
        # next post() reads the new stub.
        flask_mount.verify_access_token = lambda _t: {
            "sub": uid, "tier": "elite", "scope": "mcp:read mcp:write",
        }
        tc = mcp_app.test_client()
        tc.environ_base["HTTP_AUTHORIZATION"] = "Bearer test"
        return tc

    args = {"company": "Goldman Sachs", "school": "USC", "role": "Investment Banking Analyst"}

    # User A: cold path → contacts go to A's My Network + cache warms.
    _call_tool(_client_for("user-a"), "find_contacts", args, request_id=1)
    a_contacts = fake_db.store.get("users/user-a/contacts", {})
    assert a_contacts, "cold path should have persisted to user-a's My Network"
    a_count = len(a_contacts)

    # User B (later): same args → cache hit. Mock PDL is reset so if the
    # cache hit triggered another PDL call, this test would fail with
    # call_counter.pdl == 2 (but cache hit means no second call).
    pdl_calls_before = call_counter.pdl
    _call_tool(_client_for("user-b"), "find_contacts", args, request_id=2)
    assert call_counter.pdl == pdl_calls_before, (
        "second call should have hit cache; PDL was called again"
    )

    # The real assertion: user-b's My Network ALSO gets the contacts.
    b_contacts = fake_db.store.get("users/user-b/contacts", {})
    assert b_contacts, (
        "cache-hit path failed to persist to user-b's My Network — "
        "they got contacts in the response but nothing landed in Firestore"
    )
    assert len(b_contacts) == a_count, (
        f"user-b should have the same {a_count} contacts user-a got; "
        f"got {len(b_contacts)}"
    )


# ── 2b. LLM parser routing (matches the website's search expansion) ──────────


def test_find_contacts_routes_through_llm_parser_for_title_expansion(
    client, mock_pdl, mock_warmth, call_counter, monkeypatch,
):
    """The MCP must route through parse_search_prompt_structured the same way
    the website's natural-language search does. Otherwise PDL sees only the
    literal role string the user typed ("software engineer") and misses
    profiles listed as "SWE", "SDE", "Engineer II", etc.

    This test pins:
      - parse_search_prompt_structured is called once per cold find_contacts
      - the synthesized prompt the parser receives carries company + school + role
      - the LLM-expanded title_variations reach PDL (not the narrow manual list)
    """
    captured = {}

    def fake_parse(prompt: str) -> dict:
        captured["prompt"] = prompt
        return {
            "original_prompt": prompt,
            "company_context": "Roblox is a gaming platform company.",
            "companies": [{"name": "Roblox", "matched_titles": [
                "Software Engineer", "Software Engineer II", "Engineer", "SWE",
            ]}],
            "locations": [],
            "schools": ["UC Berkeley"],
            "industries": ["technology"],
            "confidence": "high",
            "title_variations": [
                "Software Engineer", "Software Engineer II", "Engineer", "SWE", "SDE",
            ],
        }

    import app.services.prompt_parser as parser_mod
    monkeypatch.setattr(parser_mod, "parse_search_prompt_structured", fake_parse)

    captured_search = {}

    def fake_search(parsed_prompt, max_contacts, exclude_keys=None, user_profile=None):
        captured_search["parsed_prompt"] = parsed_prompt
        return [], 0, [], None

    import app.services.pdl_client as pdl_mod
    monkeypatch.setattr(pdl_mod, "search_contacts_from_prompt", fake_search)

    _call_tool(client, "find_contacts", {
        "company": "Roblox",
        "school": "UC Berkeley",
        "role": "software engineer",
    })

    # Synthetic prompt carries all three structured inputs.
    assert "Roblox" in captured["prompt"]
    assert "UC Berkeley" in captured["prompt"]
    assert "software engineer" in captured["prompt"].lower()

    # PDL received the LLM-expanded title list, NOT just ["software engineer"].
    pp = captured_search["parsed_prompt"]
    titles = [t.lower() for t in pp.get("title_variations", [])]
    assert "software engineer" in titles
    assert "swe" in titles or "sde" in titles or "engineer" in titles, (
        f"expected LLM-expanded titles in parsed_prompt; got {pp.get('title_variations')!r}"
    )

    # Caller's structured fields are preserved exactly (not LLM-rewritten).
    assert pp["companies"][0]["name"] == "Roblox"
    assert pp["schools"] == ["UC Berkeley"]


def test_find_contacts_falls_back_to_manual_prompt_when_llm_unavailable(
    client, mock_pdl, mock_warmth, monkeypatch,
):
    """If parse_search_prompt_structured can't reach OpenAI (no API key,
    network error), find_contacts must still work — falling back to the
    original manual parsed_prompt construction with the narrow title list.
    """
    def fake_parse_failing(prompt: str) -> dict:
        return {"error": "OpenAI client not available"}

    import app.services.prompt_parser as parser_mod
    monkeypatch.setattr(parser_mod, "parse_search_prompt_structured", fake_parse_failing)

    captured_search = {}

    def fake_search(parsed_prompt, max_contacts, exclude_keys=None, user_profile=None):
        captured_search["parsed_prompt"] = parsed_prompt
        return [], 0, [], None

    import app.services.pdl_client as pdl_mod
    monkeypatch.setattr(pdl_mod, "search_contacts_from_prompt", fake_search)

    env = _call_tool(client, "find_contacts", {
        "company": "Roblox",
        "school": "UC Berkeley",
        "role": "software engineer",
        "career_track": "tech",
    })

    # Tool didn't crash — returned a normal (empty) response.
    result = _structured(env)
    assert result["company"] == "Roblox"

    # Manual fallback narrow list — exactly what the original MCP built.
    pp = captured_search["parsed_prompt"]
    assert pp["title_variations"] == ["software engineer", "tech"]
    assert pp["schools"] == ["UC Berkeley"]


# ── 3. Cache hit on repeat ───────────────────────────────────────────────────


def test_find_contacts_caches_repeat_call(
    client, mock_pdl, mock_warmth, call_counter
):
    args = {"company": "Goldman Sachs", "school": "USC", "role": "Analyst"}
    first = _structured(_call_tool(client, "find_contacts", args, request_id=1))
    second = _structured(_call_tool(client, "find_contacts", args, request_id=2))
    assert first["cached"] is False
    assert second["cached"] is True
    assert call_counter.pdl == 1  # PDL hit once total


# ── 3b. Cache normalization across whitespace + case ────────────────────────


def test_find_contacts_cache_normalizes_string_args(
    client, mock_pdl, mock_warmth, call_counter
):
    _structured(_call_tool(client, "find_contacts", {
        "company": "Goldman Sachs", "school": "USC",
    }, request_id=1))
    out = _structured(_call_tool(client, "find_contacts", {
        "company": "  goldman   sachs ", "school": "usc",
    }, request_id=2))
    assert out["cached"] is True
    assert call_counter.pdl == 1


# ── 4. find_contacts per-hour rate limit ─────────────────────────────────────


def test_find_contacts_hour_cap_returns_paywall(
    client, mock_pdl, mock_warmth, call_counter
):
    # Vary args each call so we miss cache and exercise the limiter.
    last = None
    for i in range(11):
        args = {"company": f"Firm {i}", "school": "USC"}
        last = _structured(_call_tool(client, "find_contacts", args, request_id=i))
    # 11th call should be paywalled
    assert last.get("paywall") is not None
    assert last["paywall"]["claim_url"].startswith("http")
    assert "token=" in last["paywall"]["claim_url"]


# ── 5. find_contacts per-day cap fires before hour cap ───────────────────────


def test_find_contacts_day_cap_blocks_after_three(
    client, mock_pdl, mock_warmth, call_counter
):
    # Free-tier day cap is 10 (see tier_caps._CALL_LIMITS). Call 11 times
    # so the 11th trips the cap and surfaces a paywall.
    paywalled = None
    for i in range(11):
        args = {"company": f"Daily Firm {i}", "school": "USC"}
        out = _structured(_call_tool(client, "find_contacts", args, request_id=i))
        if out.get("paywall") is not None:
            paywalled = out
            break
    assert paywalled is not None
    assert paywalled["paywall"]["hit_cap_type"] in ("day", "hour")
    assert call_counter.pdl == 10  # PDL hit only for the 10 allowed queries


# ── 6. get_company_intel golden path ─────────────────────────────────────────


def test_get_company_intel_returns_full_bundle(
    client, mock_perplexity, mock_school_affinity, call_counter
):
    env = _call_tool(client, "get_company_intel", {
        "company": "Goldman Sachs",
        "user_school": "USC",
        "career_field": "investment banking",
    })
    result = _structured(env)
    assert result["company"] == "Goldman Sachs"
    assert result["overview"]["description"]
    assert result["recent_news"]
    assert result["recruiting_signals"]["hiring_momentum"]
    alumni = result["alumni_at_your_school"]
    assert alumni is not None
    assert alumni["school"] == "USC"
    assert alumni["count"] == 47  # from mock fixture


# ── 7. get_company_intel cache (two-tier TTL) ────────────────────────────────


def test_get_company_intel_cache_hits_second_call(
    client, mock_perplexity, mock_school_affinity, call_counter
):
    """When both stable + fresh buckets are warm, second call is a full cache hit."""
    args = {"company": "Jane Street", "user_school": "USC"}
    _structured(_call_tool(client, "get_company_intel", args, request_id=1))
    out = _structured(_call_tool(client, "get_company_intel", args, request_id=2))
    assert out["cached"] is True
    assert call_counter.perplexity_profile == 1
    assert call_counter.perplexity_news == 1
    assert call_counter.perplexity_market == 1
    assert call_counter.school_affinity == 1


def test_get_company_intel_fresh_bucket_refresh_keeps_stable(
    client, fake_db, mock_perplexity, mock_school_affinity, call_counter
):
    """When the 7-day fresh bucket expires but the 30-day stable bucket is
    still warm, only Perplexity news + market are re-fetched. The 30-day
    profile + school_affinity calls are NOT repeated."""
    from app.mcp_server.cache import COLLECTION as CACHE_COL, _key as cache_key
    from app.mcp_server.schemas import GetCompanyIntelInput

    args = {"company": "Jane Street", "user_school": "USC"}
    _structured(_call_tool(client, "get_company_intel", args, request_id=1))
    assert call_counter.perplexity_profile == 1
    assert call_counter.perplexity_news == 1
    assert call_counter.school_affinity == 1

    # Cache args mirror what the tool used: parsed.model_dump() includes
    # all schema fields with their defaults (career_field=None, etc.).
    cache_args = GetCompanyIntelInput.model_validate(args).model_dump()

    # Expire the fresh bucket by forcing its expires_at into the past.
    fresh_doc_id = cache_key("get_company_intel:fresh", cache_args)
    ref = fake_db.collection(CACHE_COL).document(fresh_doc_id)
    snap = ref.get()
    assert snap.exists
    data = snap.to_dict()
    data["expires_at"] = 1.0  # epoch ~1970
    ref.set(data)

    _structured(_call_tool(client, "get_company_intel", args, request_id=2))

    # Fresh bucket refetched (news + market both bumped):
    assert call_counter.perplexity_news == 2
    assert call_counter.perplexity_market == 2
    # Stable bucket reused (profile + school_affinity unchanged):
    assert call_counter.perplexity_profile == 1
    assert call_counter.school_affinity == 1


# ── 8. draft_outreach golden path ────────────────────────────────────────────


def test_draft_outreach_returns_subject_and_body(
    client, mock_llm, call_counter
):
    env = _call_tool(client, "draft_outreach", {
        "contact": {
            "name": "Maya Patel",
            "title": "IB Analyst",
            "company": "Goldman Sachs",
            "education": "USC",
        },
        "user_school": "USC",
        "user_major": "Finance",
        "user_year": "Junior",
        "user_career_track": "investment banking",
        "intent": "coffee_chat",
    })
    result = _structured(env)
    assert result["subject"]
    assert result["body"]
    assert "Maya" in result["body"]
    # Anti-hallucination smoke check: no em dashes
    assert "—" not in result["subject"]
    assert "—" not in result["body"]
    assert call_counter.llm == 1


# ── 9. draft_outreach per-day cap (2/day) ────────────────────────────────────


def test_draft_outreach_day_cap_kicks_in(client, mock_llm, call_counter):
    payload = lambda i: {
        "contact": {"name": f"Person {i}", "title": "Analyst", "company": "Firm"},
        "user_school": "USC",
    }
    # Free-tier day cap for draft_outreach is 10. Call 11 times.
    paywalled = None
    for i in range(11):
        out = _structured(_call_tool(client, "draft_outreach", payload(i), request_id=i))
        if out.get("paywall") is not None:
            paywalled = out
            break
    assert paywalled is not None
    assert paywalled["paywall"]["claim_url"].startswith("http")


# ── 10. Budget exhaustion returns cached-only fallback ───────────────────────


def test_find_contacts_budget_exhaustion_returns_cta(
    client, fake_db, mock_pdl, mock_warmth, call_counter
):
    from datetime import datetime, timezone
    from app.mcp_server.budget import COLLECTION as BUDGET_COL
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fake_db.collection(BUDGET_COL).document(today).set({
        "credits": 200,
        "spent_usd": 100.0,
        "day": today,
    })
    out = _structured(_call_tool(client, "find_contacts", {
        "company": "Fresh Firm", "school": "USC",
    }))
    assert out.get("paywall") is not None
    assert out["paywall"]["hit_cap_type"] == "budget"
    assert call_counter.pdl == 0  # never reached PDL


# ── 11. Attribution token roundtrip ──────────────────────────────────────────


def test_paywall_token_decodes_to_origin_tool_and_ip(
    client, mock_pdl, mock_warmth
):
    # Burn the daily quota to trigger a paywall (free tier = 10/day).
    paywalled = None
    for i in range(11):
        out = _structured(_call_tool(client, "find_contacts", {
            "company": f"Token Firm {i}", "school": "USC",
        }, request_id=i))
        if out.get("paywall") is not None:
            paywalled = out
            break
    assert paywalled is not None
    url = paywalled["paywall"]["claim_url"]
    token = url.split("token=", 1)[1]
    from app.mcp_server.attribution import verify_claim_token
    decoded = verify_claim_token(token)
    assert decoded is not None
    assert decoded["tool"] == "find_contacts"
    assert len(decoded["ip_hash"]) == 16


# ── 12. /api/mcp/health smoke ────────────────────────────────────────────────


def test_health_endpoint(client):
    resp = client.get("/api/mcp/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert "budget" in data
    assert "limits" in data


# ── 13. Prod-Firestore guard ─────────────────────────────────────────────────


def test_prod_guard_raises_when_pointed_at_prod_in_dev(monkeypatch):
    """When the active Firebase project is offerloop-native and FLASK_ENV
    is not 'production', register_mcp_blueprint must raise so the app
    refuses to boot rather than silently writing to prod."""
    from flask import Flask
    from app.mcp_server import flask_mount

    class _FakeApp:
        project_id = "offerloop-native"

    monkeypatch.setattr(flask_mount.firebase_admin, "get_app", lambda: _FakeApp())
    monkeypatch.setenv("FLASK_ENV", "development")

    app = Flask(__name__)
    with pytest.raises(RuntimeError, match="Refusing to mount MCP server"):
        flask_mount.register_mcp_blueprint(app)


def test_prod_guard_allows_when_flask_env_is_production(monkeypatch):
    from flask import Flask
    from app.mcp_server import flask_mount

    class _FakeApp:
        project_id = "offerloop-native"

    monkeypatch.setattr(flask_mount.firebase_admin, "get_app", lambda: _FakeApp())
    monkeypatch.setenv("FLASK_ENV", "production")

    app = Flask(__name__)
    flask_mount.register_mcp_blueprint(app)
    assert "mcp" in app.blueprints


def test_prod_guard_allows_when_pointed_at_non_prod_project(monkeypatch):
    from flask import Flask
    from app.mcp_server import flask_mount

    class _FakeApp:
        project_id = "offerloop-dev"

    monkeypatch.setattr(flask_mount.firebase_admin, "get_app", lambda: _FakeApp())
    monkeypatch.setenv("FLASK_ENV", "development")

    app = Flask(__name__)
    flask_mount.register_mcp_blueprint(app)
    assert "mcp" in app.blueprints


# ── 14. Smithery gateway: rate-limit key resolution ──────────────────────────


class _FakeReq:
    """Minimal Flask-request-like object for extract_client_ip tests.

    extract_client_ip only touches req.headers.get(name) and
    req.remote_addr; nothing else.
    """
    def __init__(self, headers: dict | None = None, remote_addr: str = "10.0.0.1"):
        self.headers = headers or {}
        self.remote_addr = remote_addr


def test_smithery_request_with_user_header_uses_connection_id(caplog):
    """Path 1: Smithery gateway request with X-Smithery-Connection sets
    the rate-limit key to 'smithery:{connection_id}' so each Smithery
    user lands in their own bucket regardless of shared gateway IP."""
    from app.mcp_server.ip_utils import extract_client_ip, hash_ip

    req = _FakeReq(headers={
        "X-Smithery-Connection": "conn_alice_123",
        "User-Agent": "SmitheryBot/1.0",
        "X-Forwarded-For": "203.0.113.7",  # gateway IP, shared across all Smithery users
    })

    with caplog.at_level("INFO"):
        key = extract_client_ip(req)

    assert key == "smithery:conn_alice_123"
    assert any("smithery_user resolved" in r.message for r in caplog.records)

    # And confirm two different Smithery users get distinct hash buckets
    # despite hitting from the same gateway IP.
    other = _FakeReq(headers={
        "X-Smithery-Connection": "conn_bob_456",
        "User-Agent": "SmitheryBot/1.0",
        "X-Forwarded-For": "203.0.113.7",
    })
    other_key = extract_client_ip(other)
    assert other_key == "smithery:conn_bob_456"
    assert hash_ip(key) != hash_ip(other_key)


def test_direct_request_without_smithery_header_uses_xff(caplog):
    """Path 3: a direct (non-Smithery) request uses X-Forwarded-For
    first hop, preserving the pre-Smithery behavior. Logged at DEBUG
    (not INFO) so prod logs stay quiet."""
    from app.mcp_server.ip_utils import extract_client_ip

    req = _FakeReq(headers={
        "X-Forwarded-For": "198.51.100.42, 10.0.0.1",
        "User-Agent": "curl/8.4.0",
    })

    with caplog.at_level("DEBUG"):
        key = extract_client_ip(req)

    assert key == "198.51.100.42"
    assert any("direct_ip resolved" in r.message and r.levelname == "DEBUG"
               for r in caplog.records)


def test_x_smithery_header_from_non_smithery_traffic_is_ignored(caplog):
    """Trust-boundary regression: a request that sends
    X-Smithery-Connection but does NOT look like Smithery traffic
    (no Smithery UA, no smithery.ai / run.tools Origin/Referer) must
    have the header IGNORED. Otherwise a scraper reading our public
    source could rotate the header value to mint unlimited
    rate-limit buckets and bypass the cap entirely.

    The key returned must be the X-Forwarded-For IP, never
    'smithery:{anything}'. A WARNING is logged so the attempt is
    auditable.
    """
    from app.mcp_server.ip_utils import extract_client_ip

    req = _FakeReq(headers={
        "X-Smithery-Connection": "attacker_chosen_1",
        "User-Agent": "curl/8.4.0",  # clearly not Smithery
        "X-Forwarded-For": "198.51.100.42",
    })

    with caplog.at_level("WARNING"):
        key = extract_client_ip(req)

    assert not key.startswith("smithery:"), (
        f"untrusted X-Smithery-Connection must be ignored; got {key!r}"
    )
    assert key == "198.51.100.42"
    warnings = [r for r in caplog.records if r.levelname == "WARNING"]
    assert any("x_smithery_header_without_smithery_context" in r.message
               for r in warnings), (
        "expected a WARNING audit log when the header is sent without "
        f"Smithery context; got: {[(r.levelname, r.message) for r in caplog.records]}"
    )

    # And rotating attacker-chosen values must keep landing in the
    # same IP-based bucket, not unique per-value buckets.
    from app.mcp_server.ip_utils import hash_ip
    bucket_a = hash_ip(key)
    req2 = _FakeReq(headers={
        "X-Smithery-Connection": "attacker_chosen_2",
        "User-Agent": "curl/8.4.0",
        "X-Forwarded-For": "198.51.100.42",
    })
    bucket_b = hash_ip(extract_client_ip(req2))
    assert bucket_a == bucket_b, (
        "rotating X-Smithery-Connection without Smithery context must NOT "
        "split into separate rate-limit buckets"
    )


def test_smithery_request_without_user_header_falls_back_with_warning(caplog):
    """Path 2 (edge case): a request that LOOKS like Smithery (UA / host
    signal) but is missing X-Smithery-Connection must fall back to the
    gateway IP and emit a WARNING so we notice if Smithery's convention
    changes. Rate limits collapse onto the gateway IP until fixed; that
    is the correct fail-safe, with the warning making it visible."""
    from app.mcp_server.ip_utils import extract_client_ip

    req = _FakeReq(headers={
        # No X-Smithery-Connection. But UA reveals it's Smithery traffic.
        "User-Agent": "Smithery/0.5 (gateway)",
        "X-Forwarded-For": "203.0.113.7",
    })

    with caplog.at_level("WARNING"):
        key = extract_client_ip(req)

    assert key == "203.0.113.7", "must fall back to gateway IP, not return empty/None"
    warnings = [r for r in caplog.records if r.levelname == "WARNING"]
    assert any("smithery_gateway_no_user_header" in r.message for r in warnings), (
        f"expected a 'smithery_gateway_no_user_header' WARNING; got: "
        f"{[(r.levelname, r.message) for r in caplog.records]}"
    )


# ── 15. find_contacts education display reflects the matched school ─────────


def test_find_contacts_education_field_uses_matched_school_when_alumni_signal_fires():
    """When PDL returns a contact whose educationArray contains BOTH the
    user's school (e.g. USC) AND another school (e.g. BYU), and warmth
    scoring fires same_university because USC appears in their full
    education history, the displayed `education` field must surface
    USC's entry (with degree + year context from EducationTop), NOT
    the contact's `College` field — which PDL sets to the chronological-
    first non-high-school entry (typically undergrad).

    Without this fix, a BYU-undergrad + USC-MBA contact returned by a
    "USC alumni at Goldman" query would show education="Brigham Young
    University" alongside relationship_type="alumni", which looks like
    a false positive even though the alumni connection is real.
    """
    from app.mcp_server.tools.find_contacts import _build_contacts

    contact = {
        "FirstName": "Jordan",
        "LastName": "Kim",
        "Title": "Associate",
        "Company": "Goldman Sachs",
        "LinkedIn": "https://linkedin.com/in/jordankim",
        # PDL's normalized contact: College = chronological-first (undergrad)
        "College": "Brigham Young University",
        # EducationTop preserves the full history with degree + year context
        "EducationTop": (
            "Brigham Young University - bachelor's degree (2016 - 2020); "
            "University of Southern California - master's degree (2020 - 2022)"
        ),
    }
    warmth = {
        0: {
            "tier": "warm",
            "score": 62,
            "label": "Fellow Trojan",
            "signals": [
                {
                    "signal": "same_university",
                    "points": 20,
                    "detail": "University of Southern California",
                },
            ],
        },
    }

    [out] = _build_contacts([contact], warmth)

    assert out.relationship_type == "alumni"
    # Displayed education must reflect USC (the matched school), NOT BYU
    assert out.education is not None
    assert "Southern California" in out.education, (
        f"education must surface the matched school (USC); got: {out.education!r}"
    )
    assert "Brigham Young" not in out.education, (
        f"education must not show the unrelated undergrad (BYU); got: {out.education!r}"
    )
    # Degree + year context from EducationTop must be preserved
    assert "master" in out.education.lower() or "2022" in out.education, (
        f"override must preserve degree/year context, not just the school name; "
        f"got: {out.education!r}"
    )
