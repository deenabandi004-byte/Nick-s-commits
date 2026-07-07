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


# ---------------------------------------------------------------------------
# find_jobs must survive job docs whose fields are not strings (a dict
# location once raised KeyError(slice(...)) and killed the whole search).
# ---------------------------------------------------------------------------

class _FakeJobSnap:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return dict(self._data)


class _FakeJobQuery:
    def __init__(self, snaps):
        self._snaps = snaps

    def order_by(self, *a, **k):
        return self

    def where(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def stream(self):
        return list(self._snaps)


class _FakeJobsDb:
    def __init__(self, snaps):
        self._snaps = snaps

    def collection(self, name):
        return _FakeJobQuery(self._snaps)


@pytest.mark.unit
def test_find_jobs_tolerates_dict_fields(monkeypatch):
    from app.services.scout import tools as scout_tools

    snaps = [
        _FakeJobSnap("j1", {
            "title": "Data Science Intern",
            "company": {"name": "Snap"},
            "location": {"city": "Los Angeles", "state": "CA"},
            "ats_platform": "greenhouse",
        }),
        _FakeJobSnap("j2", {
            "title": "Data Analyst",
            "company": "Netflix",
            "location": None,
        }),
    ]
    import app.extensions as extensions
    monkeypatch.setattr(extensions, "get_db", lambda: _FakeJobsDb(snaps))

    out = scout_tools._find_jobs("data science intern", 5)
    assert "error" not in out, out
    assert out["count"] == 2
    by_id = {j["job_id"]: j for j in out["jobs"]}
    assert by_id["j1"]["company"] == "Snap"
    assert by_id["j1"]["location"] == "Los Angeles"
    # Higher token overlap ranks first.
    assert out["jobs"][0]["job_id"] == "j1"


# ---------------------------------------------------------------------------
# draft_outreach_emails gates
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_draft_outreach_requires_auth():
    out = _run("draft_outreach_emails", {"contact_names": ["a b"]}, {"uid": None, "tier": "pro"})
    assert out["code"] == "AUTH_REQUIRED"
    assert out["count"] == 0


@pytest.mark.unit
def test_prompt_advertises_draft_tool():
    from app.services.scout_assistant_service import _build_static_system_prompt
    prompt = _build_static_system_prompt()
    assert "draft_outreach_emails" in prompt
    assert "Drafting emails from chat" in prompt
