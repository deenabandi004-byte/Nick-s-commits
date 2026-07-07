"""Unit tests for Scout's job action tools (find_jobs + auto_apply_to_job).

The execute tool's gates must hold without any network: no uid, wrong tier,
and missing job_id all short-circuit before touching the submit service.
"""
import asyncio

import pytest

from app.services.scout.tools import run_helper_tool


def _run(name, args, ctx):
    return asyncio.run(run_helper_tool(name, args, ctx))


@pytest.mark.unit
def test_auto_apply_requires_auth():
    out = _run("auto_apply_to_job", {"job_id": "j1"}, {"uid": None, "tier": "pro"})
    assert out["code"] == "AUTH_REQUIRED"


@pytest.mark.unit
def test_auto_apply_requires_pro_tier():
    out = _run("auto_apply_to_job", {"job_id": "j1"}, {"uid": "u1", "tier": "free"})
    assert out["code"] == "TIER_REQUIRED"


@pytest.mark.unit
def test_auto_apply_requires_job_id():
    out = _run("auto_apply_to_job", {}, {"uid": "u1", "tier": "elite"})
    assert out["code"] == "BAD_REQUEST"


@pytest.mark.unit
def test_find_jobs_requires_query():
    out = _run("find_jobs", {"query": ""}, {"uid": "u1", "tier": "pro"})
    assert out["count"] == 0 and out.get("error")


@pytest.mark.unit
def test_prompt_advertises_job_action_tools():
    from app.services.scout_assistant_service import _build_static_system_prompt
    prompt = _build_static_system_prompt()
    assert "find_jobs" in prompt
    assert "auto_apply_to_job" in prompt
    assert "Applying to jobs from chat" in prompt
