"""Tests for build_briefing_line - deterministic 'Why this person' text."""
import pytest
from app.utils.warmth_scoring import build_briefing_line


class TestBuildBriefingLine:
    def test_empty_signals(self):
        assert build_briefing_line({}, []) == ""
        assert build_briefing_line({}, None) == ""

    def test_no_meaningful_signals(self):
        """Signals like has_headline_and_title should be filtered out."""
        signals = [
            {"signal": "has_headline_and_title", "points": 5},
            {"signal": "rich_work_history", "points": 8, "detail": "3 positions"},
        ]
        assert build_briefing_line({}, signals) == ""

    def test_dream_company(self):
        signals = [{"signal": "dream_company", "points": 10, "detail": "Goldman Sachs"}]
        result = build_briefing_line({}, signals)
        assert "Goldman Sachs" in result
        assert "dream company" in result.lower()

    def test_dream_company_fallback_to_contact(self):
        """If detail is empty, falls back to contact's Company field."""
        signals = [{"signal": "dream_company", "points": 10, "detail": ""}]
        contact = {"Company": "McKinsey"}
        result = build_briefing_line(contact, signals)
        assert "McKinsey" in result

    def test_same_university(self):
        signals = [{"signal": "same_university", "points": 20, "detail": "USC"}]
        result = build_briefing_line({}, signals)
        assert "USC" in result
        assert "like you" in result.lower()

    def test_same_university_no_detail(self):
        signals = [{"signal": "same_university", "points": 20, "detail": ""}]
        result = build_briefing_line({}, signals)
        assert "university" in result.lower()

    def test_same_major(self):
        signals = [{"signal": "same_major", "points": 10, "detail": "finance"}]
        result = build_briefing_line({}, signals)
        assert "finance" in result.lower()

    def test_same_hometown(self):
        signals = [{"signal": "same_hometown", "points": 8, "detail": "San Francisco"}]
        result = build_briefing_line({}, signals)
        assert "San Francisco" in result

    def test_recently_joined(self):
        signals = [{"signal": "recently_joined", "points": 8, "detail": "6 months"}]
        result = build_briefing_line({}, signals)
        assert "Recently joined" in result

    def test_career_transition(self):
        signals = [{"signal": "career_transition", "points": 12, "detail": "consulting to tech"}]
        result = build_briefing_line({}, signals)
        assert "Career transition" in result

    def test_multiple_signals_capped_at_3(self):
        signals = [
            {"signal": "dream_company", "points": 10, "detail": "Google"},
            {"signal": "same_university", "points": 20, "detail": "USC"},
            {"signal": "same_major", "points": 10, "detail": "CS"},
            {"signal": "same_hometown", "points": 8, "detail": "LA"},
        ]
        result = build_briefing_line({}, signals)
        # Should have at most 3 parts joined by ". "
        parts = result.rstrip(".").split(". ")
        assert len(parts) <= 3

    def test_ends_with_period(self):
        signals = [{"signal": "same_university", "points": 20, "detail": "USC"}]
        result = build_briefing_line({}, signals)
        assert result.endswith(".")

    def test_mixed_meaningful_and_not(self):
        signals = [
            {"signal": "has_education_data", "points": 7},
            {"signal": "dream_company", "points": 10, "detail": "Meta"},
            {"signal": "has_skills_interests", "points": 5},
        ]
        result = build_briefing_line({}, signals)
        assert "Meta" in result
        assert "education" not in result.lower()
        assert "skills" not in result.lower()
