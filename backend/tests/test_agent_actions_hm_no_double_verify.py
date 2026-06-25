"""
Regression: `execute_find_hiring_managers` must NOT call
`verify_hiring_managers` (v1) — `find_hiring_manager` already runs
`verify_hiring_managers_v2` inside `recruiter_finder.py:1689`, and v2 is
strictly stronger (structured output, parallel, filters the pool,
corrects stale titles).

Pre-fix, v1 ran a second time per HM after `find_hiring_manager` returned,
doubling Perplexity spend with a weaker free-text check. If anyone
re-adds a v1 call (or a third verification pass) this test fails loud.
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", "test-credentials.json")

from app.services.agent_actions import execute_find_hiring_managers


@pytest.fixture
def mock_world(monkeypatch):
    """Mock everything between `execute_find_hiring_managers` and the
    network: find_hiring_manager returns a single HM; v1 verify is wired
    so we can assert it never fires; Firestore is stubbed."""
    # The headline assertion: v1 must not be called. We wrap it in a
    # MagicMock so .called / .call_count are introspectable.
    v1_mock = MagicMock(
        return_value=[{"verified": True}],
        side_effect=lambda *a, **kw: [{"verified": True}],
    )
    monkeypatch.setattr(
        "app.services.perplexity_client.verify_hiring_managers",
        v1_mock,
    )

    # find_hiring_manager returns ONE HM + ONE email — already post-v2 in
    # the real world. We stand in for v2 by simulating its filtering
    # output: an annotated manager dict.
    fhm_mock = MagicMock(return_value={
        "hiringManagers": [{
            "FirstName": "Maya",
            "LastName": "Reyes",
            "Email": "maya@stripe.com",
            "Title": "Head of Product",
            "Company": "Stripe",
            "_perplexity_verified": True,
            "_perplexity_confidence": "high",
        }],
        "emails": [{"subject": "Hi Maya", "body": "Hi Maya,\n\nbody\n\nBest,\nDeena"}],
    })
    monkeypatch.setattr(
        "app.services.recruiter_finder.find_hiring_manager",
        fhm_mock,
    )

    # Cache check and Firestore — short-circuit both.
    monkeypatch.setattr(
        "app.services.agent_actions._has_fresh_cached_rows",
        lambda *a, **kw: False,
    )
    monkeypatch.setattr(
        "app.services.agent_actions._resolve_agent_template",
        lambda *a, **kw: "",
    )

    # Firestore stub — contacts subcollection write is the only thing
    # exercised on the success path.
    db_mock = MagicMock()
    contacts_ref = MagicMock()
    contacts_ref.add.return_value = (None, MagicMock(id="contact-xyz"))
    contacts_ref.document.return_value.set.return_value = None
    contacts_ref.document.return_value.update.return_value = None
    db_mock.collection.return_value.document.return_value.collection.return_value = contacts_ref
    monkeypatch.setattr("app.services.agent_actions.get_db", lambda: db_mock)

    return {"v1": v1_mock, "fhm": fhm_mock, "db": db_mock}


def _run(mock_world):
    action = {
        "type": "find_hiring_managers",
        "company": "Stripe",
        "jobTitle": "Head of Product",
        "location": "Remote",
        "count": 1,
    }
    config = {
        "loopMode": "both",
        "preferAlumni": True,
        "loopId": "loop-test",
    }
    user_data = {
        "email": "deena@example.com",
        "resumeText": "USC senior",
        "professionalInfo": {"university": "USC"},
    }
    return execute_find_hiring_managers(
        uid="test-uid",
        action=action,
        config=config,
        user_data=user_data,
    )


class TestNoDoubleHmVerification:
    def test_v1_verify_is_never_called(self, mock_world):
        """The whole point of fix #3 — v1 must not fire when v2 already ran
        inside find_hiring_manager."""
        _run(mock_world)
        assert mock_world["v1"].call_count == 0, (
            f"verify_hiring_managers (v1) was called {mock_world['v1'].call_count}× — "
            "execute_find_hiring_managers is double-billing Perplexity again"
        )

    def test_hms_from_find_hiring_manager_are_kept(self, mock_world):
        """When find_hiring_manager returns HMs, they should reach the saved
        contact list — we're not silently dropping them by removing v1."""
        result = _run(mock_world)
        assert result.get("hmsFound", 0) == 1, (
            f"expected 1 HM saved, got {result.get('hmsFound')}; "
            f"dropping v1 must not regress the success path"
        )

    def test_no_v1_import_in_execute_find_hiring_managers(self):
        """Source-level guard: a future contributor who re-imports v1 inside
        execute_find_hiring_managers will fail this test. Catches the
        regression even if the call is guarded behind an `if` that our
        runtime fixture doesn't hit."""
        import inspect

        src = inspect.getsource(execute_find_hiring_managers)
        # We deliberately accept references to v1 in comments (the comment
        # block IS the historical note explaining the fix). Strip comment
        # lines first.
        code_only = "\n".join(
            line for line in src.splitlines() if not line.strip().startswith("#")
        )
        assert "verify_hiring_managers(" not in code_only, (
            "execute_find_hiring_managers is calling verify_hiring_managers (v1) — "
            "this is the double-billing bug. v2 already runs inside find_hiring_manager."
        )
        assert "import verify_hiring_managers" not in code_only, (
            "execute_find_hiring_managers is importing v1 — even a guarded "
            "import suggests a re-introduction of the double-verify path."
        )
