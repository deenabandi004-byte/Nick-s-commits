"""
Regression tests for the don't-cache-empty-results gate.

Before this fix, every MCP tool called cache.set() on the cold-path
completion regardless of whether the result was empty. With a 7-day
TTL on find_contacts/draft_outreach and 30-day TTL on
get_company_intel, a single 0-result call locked out the same args
for every subsequent caller (the cache key is not uid-bucketed).

These tests pin: empty results don't write to cache; non-empty
results still cache normally.
"""
from __future__ import annotations

import json

import pytest


JSONRPC_VERSION = "2.0"


def _rpc(client, method: str, params: dict | None = None):
    body = {"jsonrpc": JSONRPC_VERSION, "id": 1, "method": method, "params": params or {}}
    return client.post(
        "/mcp", data=json.dumps(body), content_type="application/json",
    ).get_json()


def _call_tool(client, name: str, args: dict):
    return _rpc(client, "tools/call", {"name": name, "arguments": args})


def _cache_docs(fake_db) -> dict:
    return fake_db.store.get("mcp_cache", {})


# ── find_contacts ────────────────────────────────────────────────────────────


def test_find_contacts_does_not_cache_empty_result(
    client, fake_db, monkeypatch, mock_warmth,
):
    """Cold path returns []; cache must NOT be written."""
    import app.services.pdl_client as pdl_mod

    def fake_search(*_args, **_kwargs):
        return [], 0, [], None
    monkeypatch.setattr(pdl_mod, "search_contacts_from_prompt", fake_search)

    out = _call_tool(client, "find_contacts", {
        "company": "EmptyCorp", "school": "USC",
    })
    result = out["result"]["structuredContent"]
    assert result["contacts"] == []
    assert _cache_docs(fake_db) == {}, (
        "empty find_contacts result was cached — would poison subsequent same-args calls"
    )


def test_find_contacts_caches_non_empty_result(
    client, fake_db, mock_pdl, mock_warmth,
):
    """Sanity check: caching still works for normal (non-empty) results."""
    _call_tool(client, "find_contacts", {
        "company": "Goldman Sachs", "school": "USC",
    })
    cache_docs = _cache_docs(fake_db)
    assert len(cache_docs) == 1, (
        f"non-empty result should have written one cache doc; got {len(cache_docs)}"
    )


# ── draft_outreach ───────────────────────────────────────────────────────────


def test_draft_outreach_does_not_cache_empty_llm_output(
    client, fake_db, monkeypatch,
):
    """If batch_generate_emails returns nothing, the empty subject+body
    response must NOT be cached."""
    import app.services.reply_generation as rg

    def fake_empty_batch(*_args, **_kwargs):
        return {}  # no drafts produced

    monkeypatch.setattr(rg, "batch_generate_emails", fake_empty_batch)

    _call_tool(client, "draft_outreach", {
        "contact": {"name": "Maya Patel", "company": "Goldman Sachs"},
        "user_school": "USC",
    })
    assert _cache_docs(fake_db) == {}, (
        "empty draft_outreach result was cached — same-args calls would lock in the empty draft"
    )


def test_draft_outreach_caches_non_empty_result(
    client, fake_db, mock_llm,
):
    """Sanity: when the LLM produces a real subject + body, cache works."""
    _call_tool(client, "draft_outreach", {
        "contact": {"name": "Maya Patel", "company": "Goldman Sachs"},
        "user_school": "USC",
    })
    cache_docs = _cache_docs(fake_db)
    assert len(cache_docs) == 1


# ── get_company_intel ────────────────────────────────────────────────────────


def test_get_company_intel_does_not_cache_empty_buckets(
    client, fake_db, monkeypatch,
):
    """If Perplexity returns nothing for both overview AND news,
    both buckets must skip cache.set."""
    import app.services.perplexity_client as ppx

    monkeypatch.setattr(ppx, "enrich_company_profile_live", lambda *a, **k: {})
    monkeypatch.setattr(ppx, "get_company_news_brief", lambda *a, **k: [])
    monkeypatch.setattr(ppx, "get_market_context", lambda *a, **k: {})

    import app.services.school_affinity as sa
    monkeypatch.setattr(sa, "get_school_affinity", lambda *a, **k: [])

    _call_tool(client, "get_company_intel", {"company": "UnknownCo"})
    assert _cache_docs(fake_db) == {}, (
        f"empty get_company_intel buckets were cached; got {list(_cache_docs(fake_db).keys())}"
    )


def test_get_company_intel_caches_when_overview_present(
    client, fake_db, mock_perplexity, mock_school_affinity,
):
    """Sanity: when Perplexity gives us a real overview, both buckets cache."""
    _call_tool(client, "get_company_intel", {
        "company": "Goldman Sachs", "user_school": "USC",
    })
    cache_docs = _cache_docs(fake_db)
    # Two buckets: stable + fresh.
    assert len(cache_docs) == 2, (
        f"expected stable + fresh cache writes; got {len(cache_docs)}"
    )
