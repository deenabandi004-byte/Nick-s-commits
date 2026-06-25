"""
email_templates — roles-mode draft voice tests.

Pins the contract for roles-mode founder outreach so the template stays in
voice as we iterate on the wording:
  - Banned-phrase list matches the people-mode networking voice
  - Generated instructions reference the specific posting (role title + company)
  - 5-beat structure is named so the LLM has a skeleton to follow
  - Subject-line guidance references the role

These tests assert on the INSTRUCTION block, not on real LLM output —
that would burn API credits and be flaky. The real draft will be
inspected during the post-merge dogfood run per the plan.
"""
from __future__ import annotations

from email_templates import (
    ROLES_BANNED_PHRASES,
    roles_mode_template_instructions,
)


# ── Banned phrases ────────────────────────────────────────────────────────


def test_banned_phrases_match_people_voice():
    """Same banned set as people-mode networking. If the people-mode list
    changes, this test reminds you to update the roles list too — these
    phrases are cliched cold-email patterns regardless of mode."""
    expected = {
        "I came across",
        "impressive profile",
        "I would love to",
        "aligns with my interests",
        "any advice would be appreciated",
        "your insights would mean a lot",
        "passionate about",
        "reach out and connect",
    }
    assert set(ROLES_BANNED_PHRASES) == expected


def test_banned_phrases_appear_in_instructions_verbatim():
    """The instructions must include each banned phrase as a quoted
    string, so the LLM has the exact pattern to avoid."""
    instructions = roles_mode_template_instructions("SWE Intern", "Acme")
    for phrase in ROLES_BANNED_PHRASES:
        assert f'"{phrase}"' in instructions, f"Missing banned phrase: {phrase}"


# ── 5-beat structure ──────────────────────────────────────────────────────


def test_instructions_call_out_all_five_beats():
    """The 5-beat structure (intro, posting reference, hook, ask, sign-off)
    is the heart of the roles voice. Each beat should be named so the LLM
    follows the skeleton."""
    instructions = roles_mode_template_instructions("SWE Intern", "Acme")
    for beat in ("Beat 1", "Beat 2", "Beat 3", "Beat 4", "Beat 5"):
        assert beat in instructions, f"Missing {beat} in instructions"


def test_beat_2_references_specific_posting():
    """Beat 2 is the roles-mode differentiator: the posting reference. It
    must be clearly identified as a 'Posting reference' beat that mentions
    the specific role."""
    instructions = roles_mode_template_instructions("SWE Intern", "Acme")
    # Beat 2 should explicitly name "Posting reference"
    assert "Posting reference" in instructions
    # Role title must be interpolated literally so the LLM can quote it.
    assert "SWE Intern" in instructions


# ── Posting context interpolation ─────────────────────────────────────────


def test_role_title_interpolated_into_instructions():
    """The student's posted role title flows into the instructions verbatim
    so the LLM has an exact phrase to use."""
    instructions = roles_mode_template_instructions(
        role_title="Founding Designer", company="Linear"
    )
    assert "Founding Designer" in instructions
    assert "Linear" in instructions


def test_empty_role_title_falls_back_to_generic():
    """Missing role title shouldn't crash or leave a placeholder. Falls
    back to a readable phrase the LLM can still complete coherently."""
    instructions = roles_mode_template_instructions(role_title="", company="Acme")
    # No placeholder syntax leaks through.
    assert "{role" not in instructions
    assert "{{role" not in instructions
    # A sensible generic phrase shows up instead.
    assert "the role you posted" in instructions


def test_empty_company_falls_back_to_generic():
    """Missing company name shouldn't crash. Falls back to 'your company'."""
    instructions = roles_mode_template_instructions(role_title="SWE Intern", company="")
    assert "your company" in instructions
    assert "{company" not in instructions


# ── Subject line guidance ─────────────────────────────────────────────────


def test_subject_line_guidance_references_role():
    """The plan spec calls for subjects like 'USC '27 — re: your SWE Intern
    posting'. The instructions must give that template explicitly so we
    don't get generic 'Networking inquiry' subjects."""
    instructions = roles_mode_template_instructions(
        role_title="SWE Intern", company="Acme"
    )
    assert "Subject line" in instructions
    assert "SWE Intern" in instructions
    assert "posting" in instructions


# ── Composability with user style preset ─────────────────────────────────


def test_instructions_can_be_concatenated_with_user_template():
    """The agent_actions code prepends roles_block before any user-supplied
    template_instructions. This composition must not produce conflicting
    instructions — the roles block should be a self-contained voice block."""
    roles_block = roles_mode_template_instructions("SWE Intern", "Acme")
    user_block = "STYLE: relaxed, friendly."
    combined = f"{roles_block}\n\n{user_block}"
    # The roles block carries the 5-beat structure regardless of what comes
    # after, and the user style block is preserved verbatim.
    assert "Beat 1" in combined
    assert "STYLE: relaxed, friendly." in combined
