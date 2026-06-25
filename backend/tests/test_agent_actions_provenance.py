"""
agent_actions — HM provenance + mode-aware template selection.

Pins the rule for which template each HM contact's draft uses, by Loop
mode + per-action discoveredVia tag (PR1 plan D7):

  people mode → "networking"   → user's people-voice template
  roles mode  → "role_search"  → roles-mode founder-voice template
  both mode   → planner-supplied "role_search" or "networking", with
                "networking" as the safer fallback if the LLM forgets
                the tag (people-voice draft works for either context;
                founder-voice would feel off without a posting).

Pure unit tests against the resolver helper. No Firestore, no PDL, no
recruiter_finder calls.
"""
from __future__ import annotations

from app.services.agent_actions import _resolve_hm_provenance


# ── people mode ──────────────────────────────────────────────────────────


def test_people_mode_always_networking():
    """Pure people-mode Loops never produce founder-voice drafts — every
    HM is reached for networking, regardless of what the action dict says
    (defensive: in people mode the LLM shouldn't be emitting discoveredVia,
    but if it does we ignore it)."""
    assert _resolve_hm_provenance("people", {}) == "networking"
    assert _resolve_hm_provenance("people", {"discoveredVia": "role_search"}) == "networking"
    assert _resolve_hm_provenance("people", {"discoveredVia": "networking"}) == "networking"


# ── roles mode ───────────────────────────────────────────────────────────


def test_roles_mode_always_role_search():
    """Pure roles-mode Loops never produce people-voice drafts — every HM
    is reached as a founder-style outreach about a specific posting."""
    assert _resolve_hm_provenance("roles", {}) == "role_search"
    assert _resolve_hm_provenance("roles", {"discoveredVia": "networking"}) == "role_search"


# ── both mode ────────────────────────────────────────────────────────────


def test_both_mode_reads_planner_tag_role_search():
    """In both mode, the planner is instructed to emit discoveredVia per
    HM action. role_search → founder voice."""
    assert _resolve_hm_provenance("both", {"discoveredVia": "role_search"}) == "role_search"


def test_both_mode_reads_planner_tag_networking():
    """In both mode, networking → people voice."""
    assert _resolve_hm_provenance("both", {"discoveredVia": "networking"}) == "networking"


def test_both_mode_missing_tag_defaults_to_networking():
    """If the planner forgets the discoveredVia tag in both mode, fall
    back to networking. People-voice draft works in either context; the
    founder voice would feel off without a posting attached."""
    assert _resolve_hm_provenance("both", {}) == "networking"


def test_both_mode_invalid_tag_defaults_to_networking():
    """Bogus discoveredVia values (LLM hallucinations) fall back to
    networking — same reasoning as the missing-tag case."""
    for bad in ["potato", "", "ROLE_SEARCH", 42, None, [], {}]:
        action = {"discoveredVia": bad}
        assert _resolve_hm_provenance("both", action) == "networking", (
            f"expected networking fallback for discoveredVia={bad!r}, "
            f"got {_resolve_hm_provenance('both', action)!r}"
        )


# ── default / unknown mode ───────────────────────────────────────────────


def test_unknown_mode_defaults_to_networking():
    """Any unrecognized mode value falls back to people-mode behavior =
    networking provenance. Mirrors the planner's defense-in-depth fallback
    for invalid loop_mode."""
    assert _resolve_hm_provenance("", {}) == "networking"
    assert _resolve_hm_provenance("potato", {}) == "networking"
    assert _resolve_hm_provenance(None, {}) == "networking"  # type: ignore[arg-type]
