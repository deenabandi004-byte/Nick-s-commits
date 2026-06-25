"""
Loop service — briefVersionHistory append on PATCH.

When a user edits their Loop's briefText, the service snapshots the previous
{briefText, briefParsed, editedAt} into a capped append-only log. Lets the
LoopDetailPage show how the brief has evolved and gives us parser-tuning data.

Rules:
  1. New Loops default to an empty briefVersionHistory.
  2. PATCH that changes briefText appends ONE entry of the PREVIOUS state.
  3. PATCH that touches only briefParsed (not briefText) does NOT append —
     that's a backfill, not a user edit.
  4. PATCH that sends the same briefText as current does NOT append.
  5. History is capped at the last 20 entries.

Pure-service tests with mocked Firestore.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import loop_service
from app.services.loop_service import _loop_defaults, update_loop


def test_loop_defaults_includes_empty_brief_version_history():
    """Brand-new Loops carry the empty history field so reads always find
    it (no `.get("briefVersionHistory", [])` defense needed downstream)."""
    defaults = _loop_defaults()
    assert defaults["briefVersionHistory"] == []


# ── Mocked Firestore helpers ──────────────────────────────────────────────


def _mock_ref(current_doc: dict) -> tuple[MagicMock, list[dict]]:
    """Build a Firestore doc reference mock that captures `.update()` calls.

    Returns (ref, updates) — updates is a list that grows as `.update(patch)`
    is called. Each entry is the dict passed to `.update()`.
    """
    updates: list[dict] = []
    ref = MagicMock()
    ref.get.return_value = MagicMock(exists=True, to_dict=lambda: current_doc)
    ref.update.side_effect = lambda patch: updates.append(dict(patch))
    return ref, updates


def _wire_db(monkeypatch, current_doc: dict) -> list[dict]:
    """Glue helper: wire get_db + get_loop to a single-loop fixture, return
    the captured updates list."""
    ref, updates = _mock_ref(current_doc)

    db = MagicMock()
    db.collection.return_value.document.return_value \
        .collection.return_value.document.return_value = ref

    monkeypatch.setattr(loop_service, "get_db", lambda: db)
    # get_loop is called by update_loop at the end to return the fresh doc.
    # The result doesn't drive the test assertions — return None to keep the
    # mock simple.
    monkeypatch.setattr(loop_service, "get_loop", lambda uid, lid: None)
    return updates


# ── Append on real edits ──────────────────────────────────────────────────


def test_patch_changing_brief_text_appends_previous_state(monkeypatch):
    """The history entry captures the OLD briefText + OLD briefParsed."""
    current = {
        "briefText": "10 analysts at Goldman",
        "briefParsed": {"companies": ["Goldman Sachs"], "mode": "people"},
        "briefVersionHistory": [],
    }
    updates = _wire_db(monkeypatch, current)

    update_loop(
        uid="u1",
        loop_id="l1",
        patch={
            "briefText": "10 analysts at Goldman AND open SWE roles",
            "briefParsed": {
                "companies": ["Goldman Sachs"],
                "roles": ["SWE"],
                "mode": "both",
            },
        },
    )

    assert len(updates) == 1
    patch = updates[0]
    hist = patch["briefVersionHistory"]
    assert len(hist) == 1
    entry = hist[0]
    assert entry["briefText"] == "10 analysts at Goldman"
    assert entry["briefParsed"]["companies"] == ["Goldman Sachs"]
    assert entry["briefParsed"]["mode"] == "people"
    assert isinstance(entry["editedAt"], str) and entry["editedAt"]


def test_patch_brief_parsed_only_does_not_append(monkeypatch):
    """Re-parsing a brief without changing the text (backfill) must NOT
    pollute the history. Only user-visible edits count."""
    current = {
        "briefText": "10 analysts at Goldman",
        "briefParsed": {"companies": ["Goldman Sachs"]},
        "briefVersionHistory": [],
    }
    updates = _wire_db(monkeypatch, current)

    update_loop(
        uid="u1",
        loop_id="l1",
        patch={
            # No briefText — just refreshing briefParsed.
            "briefParsed": {"companies": ["Goldman Sachs"], "mode": "people"},
        },
    )

    patch = updates[0]
    assert "briefVersionHistory" not in patch


def test_patch_same_brief_text_does_not_append(monkeypatch):
    """A PATCH that resubmits the same briefText (e.g., user clicked save
    without editing) must not append to history."""
    current = {
        "briefText": "10 analysts at Goldman",
        "briefParsed": {"companies": ["Goldman Sachs"]},
        "briefVersionHistory": [],
    }
    updates = _wire_db(monkeypatch, current)

    update_loop(
        uid="u1",
        loop_id="l1",
        patch={"briefText": "10 analysts at Goldman"},
    )

    patch = updates[0]
    assert "briefVersionHistory" not in patch


# ── Cap at 20 entries ─────────────────────────────────────────────────────


def test_history_capped_at_20_entries(monkeypatch):
    """The 21st edit drops the oldest entry off the front so history stays
    at 20. Keeps the Firestore doc under the 1MB cap."""
    twenty_old_entries = [
        {"briefText": f"v{i}", "briefParsed": {}, "editedAt": f"2025-01-{i:02d}T00:00:00Z"}
        for i in range(1, 21)
    ]
    current = {
        "briefText": "current text",
        "briefParsed": {},
        "briefVersionHistory": twenty_old_entries,
    }
    updates = _wire_db(monkeypatch, current)

    update_loop(
        uid="u1",
        loop_id="l1",
        patch={"briefText": "current text edited"},
    )

    patch = updates[0]
    hist = patch["briefVersionHistory"]
    assert len(hist) == 20
    # The oldest entry (v1) must have dropped off the front.
    assert hist[0]["briefText"] == "v2"
    # The newly-appended entry sits at the end and captures the PRE-PATCH
    # briefText ("current text"), not the post-PATCH ("current text edited").
    assert hist[-1]["briefText"] == "current text"


# ── Pre-existing missing field ────────────────────────────────────────────


def test_history_appended_on_loop_without_existing_history(monkeypatch):
    """Old Loop docs predate briefVersionHistory. PATCHing them must seed
    a fresh history list rather than crash."""
    current = {
        "briefText": "ancient brief",
        "briefParsed": {"companies": ["Apple"]},
        # NOTE: no briefVersionHistory key — pre-PR1 Loop docs look like this.
    }
    updates = _wire_db(monkeypatch, current)

    update_loop(
        uid="u1",
        loop_id="l1",
        patch={"briefText": "ancient brief edited"},
    )

    patch = updates[0]
    hist = patch["briefVersionHistory"]
    assert len(hist) == 1
    assert hist[0]["briefText"] == "ancient brief"
