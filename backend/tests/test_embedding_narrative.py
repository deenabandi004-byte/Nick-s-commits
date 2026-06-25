"""Tests that confirm narrative fields make it into the embedding input.

Doesn't exercise the actual embedding call (OpenAI); just verifies that
_resume_text includes directionNarrative / personalContext text, in the
right order (last) so hard signals dominate, with the right truncation.
"""
from backend.app.utils.embedding_ranker import _narrative_text, _resume_text


def test_narrative_text_pulls_both_fields():
    profile = {
        "directionNarrative": "I want IB at a tier-1 bank but open to corp dev too",
        "personalContext":    "I did a hackathon at MIT and run the trading club",
    }
    out = _narrative_text(profile)
    assert "IB at a tier-1 bank" in out
    assert "hackathon at MIT" in out
    assert "What I'm hunting for" in out
    assert "Other context" in out


def test_narrative_text_empty_when_no_fields():
    assert _narrative_text({}) == ""
    assert _narrative_text({"directionNarrative": ""}) == ""
    assert _narrative_text({"directionNarrative": "   "}) == ""


def test_narrative_text_truncates_long_inputs():
    long_text = "x" * 5000
    profile = {"directionNarrative": long_text}
    out = _narrative_text(profile)
    # Truncated to 800 chars per field plus the prefix
    assert len(out) < 900


def test_resume_text_appends_narrative_last():
    """Hard signals (skills, education) must come BEFORE narrative so the
    model attends to them more strongly. Narrative is the LAST section."""
    profile = {
        "resumeParsed": {
            "skills": ["Python", "SQL"],
            "education": {"major": "CS", "school": "USC"},
        },
        "directionNarrative": "I want to break into product management",
    }
    out = _resume_text(profile)
    # Hard signals appear
    assert "Python" in out
    assert "USC" in out
    # Narrative appears
    assert "product management" in out
    # Narrative is LAST
    skills_idx = out.find("Python")
    narrative_idx = out.find("product management")
    assert skills_idx < narrative_idx


def test_resume_text_works_without_narrative():
    """Backward compat: profiles without narrative behave exactly as before."""
    profile = {
        "resumeParsed": {"skills": ["Python"]},
    }
    out = _resume_text(profile)
    assert "Python" in out
    # No narrative markers
    assert "What I'm hunting for" not in out
    assert "Other context" not in out


def test_only_personal_context_appears_alone():
    """personalContext alone should still appear; doesn't require directionNarrative."""
    profile = {"personalContext": "I prefer mission-driven companies"}
    out = _narrative_text(profile)
    assert "mission-driven" in out
    assert "Other context" in out
