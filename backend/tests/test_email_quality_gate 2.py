"""Tests for email_quality.py - deterministic quality gate checks."""
import pytest
from app.utils.email_quality import check_email_quality, has_specificity_signal


# ---------------------------------------------------------------------------
# has_specificity_signal
# ---------------------------------------------------------------------------

class TestHasSpecificitySignal:
    def test_company_in_body(self):
        body = "I noticed your work at Goldman Sachs and wanted to reach out."
        contact = {"Company": "Goldman Sachs"}
        assert has_specificity_signal(body, contact) is True

    def test_college_in_body(self):
        body = "As a fellow USC graduate, I wanted to connect."
        contact = {"College": "USC"}
        assert has_specificity_signal(body, contact) is True

    def test_role_in_body(self):
        body = "Your experience as a senior analyst caught my attention."
        contact = {"Title": "Senior Analyst"}
        assert has_specificity_signal(body, contact) is True

    def test_short_role_ignored(self):
        """Roles <= 3 chars (e.g. 'VP') should not match to avoid false positives."""
        body = "I see you work as a VP at the firm."
        contact = {"Title": "VP"}
        assert has_specificity_signal(body, contact) is False

    def test_no_match(self):
        body = "Hi there, I would love to connect with you."
        contact = {"Company": "Goldman Sachs", "College": "Harvard"}
        assert has_specificity_signal(body, contact) is False

    def test_case_insensitive(self):
        body = "Your role at MCKINSEY is impressive."
        contact = {"company": "McKinsey"}
        assert has_specificity_signal(body, contact) is True

    def test_empty_contact(self):
        body = "Some body text here."
        assert has_specificity_signal(body, {}) is False

    def test_empty_body(self):
        contact = {"Company": "Google"}
        assert has_specificity_signal("", contact) is False


# ---------------------------------------------------------------------------
# check_email_quality
# ---------------------------------------------------------------------------

class TestCheckEmailQuality:
    GOOD_BODY = (
        "Hi Sarah, I came across your profile and noticed you're working at Goldman Sachs. "
        "As a student at USC studying finance, I'm very interested in learning more about "
        "your experience in investment banking. Your career trajectory from analyst to VP is "
        "really inspiring. I would love to hear your perspective on the industry and any "
        "advice you might have for someone breaking in. Would you have 15 minutes for a "
        "quick chat sometime this week or next? I'm happy to work around your schedule. "
        "Thank you so much for considering this."
    )
    GOOD_SUBJECT = "USC finance student interested in Goldman"

    def test_good_email_passes(self):
        contact = {"Company": "Goldman Sachs", "College": "NYU"}
        result = check_email_quality(self.GOOD_SUBJECT, self.GOOD_BODY, contact)
        assert result["passed"] is True
        assert result["failures"] == []

    def test_too_short(self):
        body = "Hi, I'd love to connect. Can we chat?"
        contact = {"Company": "Google"}
        result = check_email_quality("Quick question", body, contact)
        assert "too_short" in result["failures"]

    def test_too_long(self):
        body = " ".join(["word"] * 200)
        contact = {"Company": "word"}  # ensure specificity
        result = check_email_quality("A good subject line here", body, contact)
        assert "too_long" in result["failures"]

    def test_no_specificity(self):
        body = (
            "Hi there, I would love to connect with you about your career. "
            "I'm a student interested in learning more about the industry. "
            "Would you have 15 minutes for a quick chat? "
            "I really appreciate your time and consideration for this meeting."
        )
        contact = {"Company": "Goldman Sachs"}
        result = check_email_quality("Interested in your experience", body, contact)
        assert "no_specificity" in result["failures"]

    def test_no_clear_ask(self):
        body = (
            "Hi, I noticed your work at Goldman Sachs. As a student at USC, "
            "I find your career trajectory fascinating. Your background in "
            "investment banking is really impressive. I graduated with a "
            "degree in finance and have been exploring career options in the space. "
            "The culture at Goldman seems incredible."
        )
        contact = {"Company": "Goldman Sachs"}
        result = check_email_quality("About Goldman Sachs culture", body, contact)
        assert "no_clear_ask" in result["failures"]

    def test_template_leak_brackets(self):
        body = (
            "Hi [Name], I noticed your work at Goldman Sachs and would love "
            "to hear your perspective. Would you have 15 minutes for a quick chat?"
        )
        contact = {"Company": "Goldman Sachs"}
        result = check_email_quality("Meeting with [Name]", body, contact)
        assert "template_leak" in result["failures"]

    def test_template_leak_mustache(self):
        body = (
            "Hi Sarah, I noticed {{company}} is doing great work. "
            "Would you have 15 minutes for a quick chat about your experience?"
        )
        contact = {"Company": "Google"}
        result = check_email_quality("About Google careers", body, contact)
        assert "template_leak" in result["failures"]

    def test_weak_subject_too_short(self):
        result = check_email_quality("Hi", self.GOOD_BODY, {"Company": "Goldman Sachs"})
        assert "weak_subject" in result["failures"]

    def test_weak_subject_generic(self):
        result = check_email_quality("Meeting?", self.GOOD_BODY, {"Company": "Goldman Sachs"})
        assert "weak_subject" in result["failures"]

    def test_multiple_failures(self):
        body = "Hey there!"
        contact = {"Company": "Google"}
        result = check_email_quality("Hi", body, contact)
        assert not result["passed"]
        assert len(result["failures"]) >= 2  # too_short + no_specificity + weak_subject at minimum
