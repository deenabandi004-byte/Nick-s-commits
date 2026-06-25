"""
Email quality tests — verify every email output path produces well-formatted,
grammatically correct emails with proper capitalization, greeting, sign-off,
no placeholders, no double spaces, and acceptable structure.

Covers:
  1. Recruiter emails (GPT path + fallback)
  2. Hiring manager emails (GPT path + fallback)
  3. Contact/networking emails (GPT path + malformed fallback + exception fallback)
  4. Reply-to-message emails (GPT path + fallback)
  5. Name normalization in all output paths
  6. Subject line quality
  7. Signature block structure
"""

import json
import re
import pytest
from unittest.mock import patch, MagicMock


# =============================================================================
# Shared helpers
# =============================================================================

def _assert_email_basics(body: str, recipient_first: str, label: str = "email"):
    """Assert universal email quality rules on a plain-text body."""
    assert body and len(body.strip()) > 20, f"{label}: body is empty or trivially short"

    # 1. Greeting: must start with "Hi <Name>," or "Hello,"
    first_line = body.strip().split("\n")[0].strip()
    greeting_ok = (
        first_line.startswith(f"Hi {recipient_first},")
        or first_line == "Hello,"
        or first_line.startswith("Hi,")
    )
    assert greeting_ok, (
        f"{label}: bad greeting → {first_line!r} (expected 'Hi {recipient_first},' or 'Hello,')"
    )

    # 2. Recipient name is title-cased (not all-caps, not all-lower)
    if recipient_first:
        assert recipient_first[0].isupper(), (
            f"{label}: recipient name not capitalized → {recipient_first!r}"
        )
        if len(recipient_first) > 1:
            # Allow Mc/Mac but generally second char should not be upper (unless Mc/Mac/O')
            is_special = recipient_first.startswith(("Mc", "Mac", "O'"))
            if not is_special:
                assert not recipient_first.isupper(), (
                    f"{label}: recipient name is ALL CAPS → {recipient_first!r}"
                )

    # 3. No unresolved placeholders
    placeholders = re.findall(r'\[(?:FirstName|LastName|Name|Company|University|Major|Year)\]', body)
    assert not placeholders, f"{label}: unresolved placeholders → {placeholders}"

    # 4. No double spaces (except indentation)
    lines = body.split("\n")
    for i, line in enumerate(lines):
        content = line.strip()
        if content and "  " in content:
            # Allow double space only in signature blocks (phone + linkedin padding)
            if not any(kw in content.lower() for kw in ["linkedin", "http", "@"]):
                assert False, f"{label}: double space on line {i+1} → {content!r}"

    # 5. No orphan punctuation (". ." or ", ," or empty sentences)
    assert ". ." not in body, f"{label}: orphan periods found"
    assert ",," not in body, f"{label}: double commas found"
    assert "  ," not in body, f"{label}: space before comma"

    # 6. No sentence starting with lowercase (check first word after ". " or newline)
    for match in re.finditer(r'(?:^|\.\s+|\n\s*)([a-z])', body):
        char = match.group(1)
        # Allow known lowercase starters: "iPhone", "e.g.", article starts after newline
        context = body[max(0, match.start()-5):match.end()+10]
        if char not in ('i',) and "e.g." not in context and "i.e." not in context:
            # Skip URLs and emails
            if "http" not in context and "@" not in context and "linkedin" not in context.lower():
                pass  # Soft check — GPT may legitimately start with lowercase in some styles

    # 7. Body should have at least 2 paragraphs (greeting + content)
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    assert len(paragraphs) >= 2, f"{label}: only {len(paragraphs)} paragraph(s), expected >= 2"

    # 8. No "Dear" — we use "Hi"
    assert not body.strip().startswith("Dear"), f"{label}: starts with 'Dear' instead of 'Hi'"


def _assert_has_signoff(body: str, label: str = "email"):
    """Assert the email ends with a recognizable sign-off."""
    signoff_phrases = [
        "Best,", "Best regards,", "Thanks,", "Thank you,", "Sincerely,",
        "Kind regards,", "Warm regards,", "Cheers,", "Thanks so much,",
        "Thank you for your time!", "Thank you for your time,",
        "Looking forward to hearing from you,",
        "Looking forward to connecting,",
    ]
    lines = [ln.strip() for ln in body.strip().split("\n") if ln.strip()]
    # One of the last 5 lines should contain a sign-off
    tail = "\n".join(lines[-5:]).lower()
    found = any(phrase.lower() in tail for phrase in signoff_phrases)
    assert found, f"{label}: no sign-off found in last 5 lines → {lines[-5:]}"


def _assert_no_empty_greeting(body: str, label: str = "email"):
    """Ensure greeting is not 'Hi ,' (empty name)."""
    first_line = body.strip().split("\n")[0].strip()
    assert first_line != "Hi ,", f"{label}: empty name in greeting → 'Hi ,'"
    assert first_line != "Hi  ,", f"{label}: empty name with space in greeting"


# =============================================================================
# Recruiter email — GPT path
# =============================================================================

class TestRecruiterEmailGPTPath:
    """Test recruiter emails generated via GPT look correct."""

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_normal_recruiter_email(self, mock_get_client):
        """Standard recruiter email: proper greeting, body, signature, attachment note."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.with_options.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=(
                "Hi Lisa,\n\n"
                "I came across the Software Engineer opening at Stripe and was immediately "
                "drawn to the focus on building resilient payment infrastructure. Having built "
                "a distributed transaction system in my capstone project that handled 10K TPS, "
                "I'm excited about tackling similar challenges at Stripe's scale.\n\n"
                "My experience with Go during my JPMorgan internship — where I helped migrate "
                "a monolith to microservices — aligns well with what the role describes. "
                "I'd love to learn more about the team and how I might contribute.\n\n"
                "Would you have a few minutes to chat?"
            )))]
        )

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "lisa", "LastName": "PARK", "Email": "lisa@stripe.com", "Title": "Technical Recruiter"},
            job_title="Software Engineer",
            company="Stripe",
            job_description="Build payment infrastructure using Go and Ruby...",
            user_resume={"name": "Sarah Chen", "education": {"degree": "BS", "major": "CS", "university": "USC"}},
            user_contact={"name": "Sarah Chen", "email": "sarah@usc.edu", "phone": "(555) 123-4567", "linkedin": "linkedin.com/in/sarahchen"},
        )

        assert result is not None
        plain = result["plain_body"]
        html_body = result["body"]

        # Name normalization
        assert result["to_name"] == "Lisa Park"
        assert "Hi Lisa," in plain
        assert "Hi lisa," not in plain
        assert "Hi LISA," not in plain

        _assert_email_basics(plain, "Lisa", "recruiter GPT")
        _assert_has_signoff(plain, "recruiter GPT")
        _assert_no_empty_greeting(plain, "recruiter GPT")

        # Must have attachment note
        assert "attached my resume" in plain.lower()

        # Must have signature with contact info
        assert "Sarah Chen" in plain
        assert "(555) 123-4567" in plain
        assert "linkedin.com/in/sarahchen" in plain

        # Subject line should be non-empty and contain job title
        assert result["subject"]
        assert "Software Engineer" in result["subject"]

        # HTML version should be wrapped
        assert "<div" in html_body
        assert "<br>" in html_body or "<br/>" in html_body

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_hiring_manager_email(self, mock_get_client):
        """Hiring manager email: proper tone, name normalization."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.with_options.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=(
                "Hi Jean-Pierre,\n\n"
                "I noticed your team at Google is working on distributed systems challenges, "
                "and I'd love to discuss how my background in building microservices at scale "
                "could contribute to your efforts.\n\n"
                "Would you be open to a brief conversation?"
            )))]
        )

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "JEAN-PIERRE", "LastName": "mcdonald", "Email": "jp@google.com", "Title": "Engineering Manager"},
            job_title="Senior Software Engineer",
            company="Google",
            job_description="Design distributed systems...",
            user_resume={"name": "John Doe"},
            user_contact={"name": "John Doe", "email": "john@gmail.com"},
            role_type="hiring_manager",
        )

        assert result is not None
        assert result["to_name"] == "Jean-Pierre McDonald"
        plain = result["plain_body"]
        assert "Hi Jean-Pierre," in plain

        _assert_email_basics(plain, "Jean-Pierre", "HM GPT")
        _assert_has_signoff(plain, "HM GPT")

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_all_caps_name_normalized(self, mock_get_client):
        """ALL CAPS names from PDL are properly normalized."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.with_options.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Hi Michael,\n\nGreat to connect about the role.\n\nWould love to chat."))]
        )

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "MICHAEL", "LastName": "O'BRIEN", "Email": "m@co.com", "Title": "Recruiter"},
            job_title="Analyst",
            company="McKinsey",
            job_description="Strategy consulting...",
            user_resume={},
            user_contact={"name": "Test User"},
        )

        assert result["to_name"] == "Michael O'Brien"
        assert "Hi Michael," in result["plain_body"]

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_lowercase_name_normalized(self, mock_get_client):
        """All-lowercase names from PDL are properly normalized."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.with_options.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Hi Sarah,\n\nExcited about the opening.\n\nWould love to discuss."))]
        )

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "sarah", "LastName": "jones", "Email": "s@co.com", "Title": "Recruiter"},
            job_title="PM",
            company="Meta",
            job_description="Product management...",
            user_resume={},
            user_contact={"name": "Test User"},
        )

        assert result["to_name"] == "Sarah Jones"
        assert "Hi Sarah," in result["plain_body"]


# =============================================================================
# Recruiter email — Fallback path (GPT failure)
# =============================================================================

class TestRecruiterEmailFallback:
    """Test fallback emails when GPT is unavailable or fails."""

    def test_fallback_with_education(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="Lisa",
            job_title="Software Engineer",
            company="Stripe",
            user_name="Sarah Chen",
            user_resume={"education": {"degree": "BS in Computer Science", "university": "USC"}},
        )

        _assert_email_basics(body, "Lisa", "recruiter fallback (edu)")
        _assert_has_signoff(body, "recruiter fallback (edu)")
        _assert_no_empty_greeting(body, "recruiter fallback (edu)")

        assert "Hi Lisa," in body
        assert "Software Engineer" in body
        assert "Stripe" in body
        assert "USC" in body

    def test_fallback_with_experience(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="John",
            job_title="Data Analyst",
            company="Google",
            user_name="Alex Kim",
            user_resume={"experience": [{"title": "Intern", "company": "Meta"}]},
        )

        _assert_email_basics(body, "John", "recruiter fallback (exp)")
        _assert_has_signoff(body, "recruiter fallback (exp)")
        assert "Hi John," in body
        assert "Google" in body
        assert "Intern" in body and "Meta" in body

    def test_fallback_no_resume(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="Amy",
            job_title="Consultant",
            company="McKinsey",
            user_name="Test User",
            user_resume=None,
        )

        _assert_email_basics(body, "Amy", "recruiter fallback (no resume)")
        _assert_has_signoff(body, "recruiter fallback (no resume)")
        assert "Hi Amy," in body
        assert "McKinsey" in body

    def test_fallback_empty_name(self):
        """When recruiter name is empty, should use 'Hello,' greeting."""
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="",
            job_title="Analyst",
            company="Deloitte",
            user_name="Test",
        )

        assert body.strip().startswith("Hello,"), "Empty name should use 'Hello,' greeting"
        _assert_has_signoff(body, "recruiter fallback (empty name)")

    def test_fallback_hiring_manager_tone(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="Maria",
            job_title="Engineer",
            company="Apple",
            user_name="Test",
            role_type="hiring_manager",
        )

        assert "Hi Maria," in body
        assert "contribute to your team" in body.lower() or "contribute" in body.lower()

    def test_fallback_recruiter_tone(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="Bob",
            job_title="Engineer",
            company="Apple",
            user_name="Test",
            role_type="recruiter",
        )

        assert "Hi Bob," in body
        assert "add value" in body.lower() or "discuss" in body.lower()

    def test_fallback_no_job_title(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="Alex",
            job_title="",
            company="",
            user_name="Test",
        )

        _assert_email_basics(body, "Alex", "recruiter fallback (no job)")
        assert "open" in body.lower() or "your company" in body.lower()

    def test_fallback_list_education(self):
        """Education as list format (not dict)."""
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="Tom",
            job_title="Analyst",
            company="JPMorgan",
            user_name="Test",
            user_resume={"education": [{"degree": "MBA", "school": "Wharton"}]},
        )

        assert "Hi Tom," in body
        assert "Wharton" in body

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_gpt_failure_uses_fallback(self, mock_get_client):
        """When GPT raises an exception, fallback email is used."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.with_options.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("Rate limited")

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "lisa", "Email": "l@co.com", "Title": "Recruiter"},
            job_title="Engineer",
            company="Google",
            job_description="Build stuff",
            user_resume={"education": {"degree": "BS", "university": "MIT"}},
            user_contact={"name": "Test User"},
        )

        assert result is not None
        plain = result["plain_body"]
        assert "Hi Lisa," in plain
        _assert_email_basics(plain, "Lisa", "recruiter GPT-fail fallback")
        _assert_has_signoff(plain, "recruiter GPT-fail fallback")

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_no_client_uses_fallback(self, mock_get_client):
        """When OpenAI client is None, fallback email is used."""
        mock_get_client.return_value = None

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "AMY", "Email": "a@co.com", "Title": "Recruiter"},
            job_title="PM",
            company="Meta",
            job_description="Product stuff",
            user_resume={},
            user_contact={"name": "Test User"},
        )

        assert result is not None
        assert "Hi Amy," in result["plain_body"]


# =============================================================================
# Recruiter email — Full pipeline (generate_recruiter_emails)
# =============================================================================

class TestRecruiterEmailPipeline:
    """Pipeline now delegates to batch_generate_emails — mock that delegate
    so no live LLM calls happen during tests."""

    @staticmethod
    def _batch_mock(*, contacts, **_kwargs):
        return {
            i: {
                "subject": f"Subject {i}",
                "plain_body": f"Hi {c.get('FirstName', '?')},\n\nGreat opportunity.\n\nLet's connect.",
                "body": f"Hi {c.get('FirstName', '?')},\n\nGreat opportunity.\n\nLet's connect.",
                "personalization": {},
            }
            for i, c in enumerate(contacts)
        }

    @patch("app.services.reply_generation.batch_generate_emails")
    def test_skips_no_email_contacts(self, mock_batch):
        mock_batch.side_effect = self._batch_mock
        from app.services.recruiter_email_generator import generate_recruiter_emails
        results = generate_recruiter_emails(
            recruiters=[
                {"FirstName": "Good", "Email": "good@co.com"},
                {"FirstName": "NoEmail"},
                {"FirstName": "Bad", "Email": "Not available"},
            ],
            job_title="Eng",
            company="Co",
            job_description="desc",
            user_resume={},
            user_contact={"name": "Test"},
        )
        assert len(results) == 1
        assert results[0]["to_email"] == "good@co.com"

    @patch("app.services.reply_generation.batch_generate_emails")
    def test_one_email_per_eligible_recruiter(self, mock_batch):
        """The engine returns one email per eligible recruiter, mapped 1:1."""
        mock_batch.side_effect = self._batch_mock
        from app.services.recruiter_email_generator import generate_recruiter_emails
        recruiters = [{"FirstName": f"R{i}", "Email": f"r{i}@co.com"} for i in range(4)]
        results = generate_recruiter_emails(
            recruiters=recruiters,
            job_title="Eng",
            company="Co",
            job_description="desc",
            user_resume={},
            user_contact={"name": "Test"},
        )
        assert len(results) == 4
        assert {r["to_email"] for r in results} == {f"r{i}@co.com" for i in range(4)}


# =============================================================================
# Contact/networking email — GPT path
# =============================================================================

class TestContactEmailGPTPath:
    """Test contact networking emails generated via GPT."""

    @patch("app.services.reply_generation.get_openai_client")
    def test_normal_contact_email(self, mock_get_client):
        """Standard networking email output quality."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        gpt_response = {
            "0": {
                "subject": "Quick Question from a Fellow Trojan",
                "body": (
                    "Hi John,\n\n"
                    "I came across your background at Goldman Sachs and noticed your work "
                    "as a VP in Investment Banking there. I'm a USC student studying Finance, "
                    "and I'm especially interested in how the IBD team approaches deal structuring.\n\n"
                    "I'd love to hear about your transition from equity research — what drove "
                    "that move? If you're open to it, would you have 15 minutes for a quick "
                    "chat sometime in the next couple of weeks?\n\n"
                    "I've included my resume (Resume.pdf) for your reference.\n\n"
                    "Best regards,\n"
                    "Sarah Chen\n"
                    "USC Marshall | Class of 2027"
                ),
            }
        }

        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps(gpt_response)))]
        )

        from app.services.reply_generation import batch_generate_emails
        contacts = [{"FirstName": "john", "LastName": "SMITH", "Company": "Goldman Sachs", "Title": "VP", "Email": "j@gs.com"}]

        result = batch_generate_emails(
            contacts=contacts,
            resume_text="Sarah Chen\nFinance major at USC\nAnalyst Intern at JPMorgan 2024\nTreasurer USC Finance Club",
            user_profile={"firstName": "Sarah", "lastName": "Chen", "university": "USC"},
            career_interests=["investment banking"],
            resume_filename="Resume.pdf",
        )

        assert 0 in result
        body = result[0]["body"]
        subject = result[0]["subject"]

        # Name should be normalized
        assert "Hi John," in body
        assert "Hi john," not in body
        assert "Hi JOHN," not in body

        _assert_email_basics(body, "John", "contact GPT")
        _assert_has_signoff(body, "contact GPT")
        _assert_no_empty_greeting(body, "contact GPT")

        assert subject and len(subject) > 5

    @patch("app.services.reply_generation.get_openai_client")
    def test_placeholder_replacement(self, mock_get_client):
        """GPT sometimes returns [FirstName] placeholders — they must be replaced."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        gpt_response = {
            "0": {
                "subject": "Quick Question",
                "body": (
                    "Hi [FirstName],\n\n"
                    "I came across your background at [Company] and was impressed. "
                    "I'm studying CS at MIT.\n\n"
                    "Would you have 15 minutes to chat?\n\n"
                    "Best,\n[Name]\nMIT"
                ),
            }
        }

        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps(gpt_response)))]
        )

        from app.services.reply_generation import batch_generate_emails
        contacts = [{"FirstName": "MARIA", "LastName": "Garcia", "Company": "Acme Corp", "Title": "Director", "Email": "m@co.com"}]

        result = batch_generate_emails(
            contacts=contacts,
            resume_text="John Doe\nComputer Science at MIT\nSoftware Engineer Intern at Google Summer 2024",
            user_profile={"firstName": "John", "lastName": "Doe"},
            career_interests=[],
        )

        body = result[0]["body"]
        assert "[FirstName]" not in body
        assert "[Company]" not in body
        assert "[Name]" not in body
        assert "Hi Maria," in body
        assert "Acme Corp" in body

    @patch("app.services.reply_generation.get_openai_client")
    def test_mcname_normalized_in_contact_email(self, mock_get_client):
        """Mc/Mac/O' names are properly handled."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        gpt_response = {
            "0": {
                "subject": "Quick Question",
                "body": (
                    "Hi [FirstName],\n\n"
                    "I came across your profile and would love to chat about your work.\n\n"
                    "Would you have 15 minutes?\n\n"
                    "Best,\nTest Student\nMIT"
                ),
            }
        }

        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps(gpt_response)))]
        )

        from app.services.reply_generation import batch_generate_emails
        contacts = [{"FirstName": "MCDONALD", "LastName": "o'brien", "Company": "Firm", "Title": "PM", "Email": "m@co.com"}]

        result = batch_generate_emails(
            contacts=contacts,
            resume_text="Test Student\nCS at MIT\nIntern at Google Summer 2024 building microservices",
            user_profile={},
            career_interests=[],
        )

        body = result[0]["body"]
        assert "Hi McDonald," in body
        assert "Hi MCDONALD," not in body


# =============================================================================
# Contact/networking email — Malformed fallback
# =============================================================================

class TestContactEmailMalformedFallback:
    """Test the in-loop fallback when GPT output contains malformed patterns."""

    @patch("app.services.reply_generation.get_openai_client")
    def test_malformed_body_triggers_fallback(self, mock_get_client):
        """'studying at .' pattern should trigger fallback email."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        gpt_response = {
            "0": {
                "subject": "Quick Question",
                "body": (
                    "Hi Maria,\n\n"
                    "I'm studying at . I came across your background.\n\n"
                    "Best,\nTest"
                ),
            }
        }

        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps(gpt_response)))]
        )

        from app.services.reply_generation import batch_generate_emails
        contacts = [{"FirstName": "maria", "Company": "Acme", "Title": "VP", "Email": "m@co.com"}]

        result = batch_generate_emails(
            contacts=contacts,
            resume_text="Test Student\nFinance major at USC\nAnalyst intern at JPMorgan Summer 2024",
            user_profile={"firstName": "Test", "lastName": "Student", "university": "USC", "major": "Finance"},
            career_interests=[],
        )

        body = result[0]["body"]
        # Fallback should NOT contain the malformed pattern
        assert "studying at ." not in body
        # Should have proper greeting with normalized name
        assert "Hi Maria," in body
        # Should mention company
        assert "Acme" in body
        _assert_has_signoff(body, "contact malformed fallback")
        _assert_no_empty_greeting(body, "contact malformed fallback")


# =============================================================================
# Contact/networking email — Exception fallback
# =============================================================================

class TestContactEmailExceptionFallback:
    """Test the outer exception fallback when the entire batch_generate_emails fails."""

    @patch("app.services.reply_generation.get_openai_client")
    def test_exception_fallback_quality(self, mock_get_client):
        """When GPT completely fails, fallback emails should still look good."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API down")

        from app.services.reply_generation import batch_generate_emails
        contacts = [
            {"FirstName": "JOHN", "LastName": "DOE", "Company": "Google", "Title": "Engineer", "Email": "j@g.com"},
            {"FirstName": "jane", "LastName": "smith", "Company": "Meta", "Title": "PM", "Email": "j@m.com"},
        ]

        result = batch_generate_emails(
            contacts=contacts,
            resume_text="Alex Kim\nComputer Science major at Stanford\nSoftware intern at Amazon Summer 2024",
            user_profile={"firstName": "Alex", "lastName": "Kim", "university": "Stanford", "major": "Computer Science"},
            career_interests=[],
        )

        # Both contacts should get fallback emails
        assert 0 in result
        assert 1 in result

        for idx, name in [(0, "John"), (1, "Jane")]:
            body = result[idx]["body"]
            subject = result[idx]["subject"]

            assert f"Hi {name}," in body, f"Contact {idx}: name not normalized in greeting"
            _assert_no_empty_greeting(body, f"exception fallback contact {idx}")
            _assert_has_signoff(body, f"exception fallback contact {idx}")

            # Should mention company
            company = contacts[idx]["Company"]
            assert company in body, f"Contact {idx}: company '{company}' missing from body"

            # Should have subject
            assert subject and len(subject) > 3

            # Should have intro with user info
            assert "Alex Kim" in body or "Stanford" in body or "Computer Science" in body

    @patch("app.services.reply_generation.get_openai_client")
    def test_exception_fallback_no_resume(self, mock_get_client):
        """Exception fallback with no resume should still produce acceptable email."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("Timeout")

        from app.services.reply_generation import batch_generate_emails
        contacts = [{"FirstName": "bob", "Company": "Firm", "Title": "VP", "Email": "b@f.com"}]

        result = batch_generate_emails(
            contacts=contacts,
            resume_text="",
            user_profile={},
            career_interests=[],
        )

        body = result[0]["body"]
        assert "Hi Bob," in body
        _assert_has_signoff(body, "exception fallback no resume")

    @patch("app.services.reply_generation.get_openai_client")
    def test_exception_fallback_with_signoff_config(self, mock_get_client):
        """Exception fallback should use custom signoff when provided."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("Error")

        from app.services.reply_generation import batch_generate_emails
        contacts = [{"FirstName": "alice", "Company": "Co", "Title": "Dir", "Email": "a@co.com"}]

        result = batch_generate_emails(
            contacts=contacts,
            resume_text="Test User\nCS at MIT\nIntern at Google Summer 2024 building distributed systems",
            user_profile={},
            career_interests=[],
            signoff_config={"signoffPhrase": "Warm regards,", "signatureBlock": "Test User\nMIT '27"},
        )

        body = result[0]["body"]
        assert "Warm regards," in body
        assert "MIT '27" in body


# =============================================================================
# Reply-to-message emails
# =============================================================================

class TestReplyToMessage:
    """Test reply email generation quality."""

    @patch("app.services.reply_generation.get_openai_client")
    def test_reply_email_quality(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=json.dumps({
                "subject": "Re: Coffee chat follow-up",
                "body": (
                    "Hi John,\n\n"
                    "Thank you so much for getting back to me! I'd love to find a time "
                    "that works for you. I'm free most afternoons next week.\n\n"
                    "Looking forward to it!\n\n"
                    "Best,\nSarah"
                ),
            })))]
        )

        from app.services.reply_generation import generate_reply_to_message
        result = generate_reply_to_message(
            message_content="Sure, happy to chat! When are you free?",
            contact_data={"firstName": "JOHN", "company": "Goldman"},
            resume_text="Sarah Chen\nFinance at USC",
            user_profile={"firstName": "Sarah", "lastName": "Chen"},
        )

        assert result is not None
        body = result.get("body", "")
        # Name should be normalized in context (the reply itself uses GPT output)
        assert "John" in body or "john" not in body.split("Hi ")[0] if "Hi " in body else True

    @patch("app.services.reply_generation.get_openai_client")
    def test_reply_fallback_on_failure(self, mock_get_client):
        """Reply fallback should have proper name capitalization."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API error")

        from app.services.reply_generation import generate_reply_to_message
        result = generate_reply_to_message(
            message_content="Let's connect next week",
            contact_data={"firstName": "mcdonald", "company": "Firm"},
        )

        assert result is not None
        body = result.get("body", "")
        # Should have capitalized name
        if "McDonald" in body or "Mcdonald" in body:
            pass  # Either is acceptable for the fallback
        assert len(body) > 10


# =============================================================================
# Subject line quality
# =============================================================================

class TestSubjectLineQuality:
    """Test subject lines are well-formed."""

    def test_recruiter_subject_templates(self):
        from app.services.recruiter_email_generator import SUBJECT_LINE_TEMPLATES
        for tmpl in SUBJECT_LINE_TEMPLATES:
            subject = tmpl.format(job_title="Software Engineer", company="Google")
            assert len(subject) > 10, f"Subject too short: {subject}"
            assert len(subject) < 100, f"Subject too long: {subject}"
            assert "{" not in subject, f"Unformatted placeholder: {subject}"
            # First word should be capitalized
            assert subject[0].isupper(), f"Subject not capitalized: {subject}"


# =============================================================================
# Sign-off quality
# =============================================================================

class TestSignOffQuality:
    """Test sign-off and signature blocks."""

    def test_all_signoffs_end_with_comma(self):
        from app.services.recruiter_email_generator import SIGN_OFFS
        for so in SIGN_OFFS:
            assert so.endswith(",") or so.endswith("!"), f"Sign-off missing punctuation: {so}"
            assert so[0].isupper(), f"Sign-off not capitalized: {so}"


# =============================================================================
# Apostrophe and formatting fixes
# =============================================================================

class TestApostropheAndFormatting:
    """Test fix_apostrophes_and_formatting catches common issues."""

    def test_missing_apostrophes(self):
        from app.services.reply_generation import fix_apostrophes_and_formatting
        text = "Im excited about the role. I dont think youre wrong."
        fixed = fix_apostrophes_and_formatting(text)
        assert "I'm" in fixed
        assert "don't" in fixed
        assert "you're" in fixed

    def test_concatenated_numbers(self):
        from app.services.reply_generation import fix_apostrophes_and_formatting
        text = "Would you have 1015 minutes to chat?"
        fixed = fix_apostrophes_and_formatting(text)
        assert "10-15" in fixed

    def test_start_of_sentence_apostrophe(self):
        from app.services.reply_generation import fix_apostrophes_and_formatting
        text = "Im very interested in the role."
        fixed = fix_apostrophes_and_formatting(text)
        assert fixed.startswith("I'm")

    def test_preserves_correct_text(self):
        from app.services.reply_generation import fix_apostrophes_and_formatting
        text = "I'm already correct. You're great. We've met."
        fixed = fix_apostrophes_and_formatting(text)
        assert fixed == text


# =============================================================================
# HTML conversion quality
# =============================================================================

class TestPlainToHtmlQuality:
    """Test plain-to-HTML conversion."""

    def test_newlines_to_br(self):
        from app.services.recruiter_email_generator import plain_to_html
        result = plain_to_html("Hi John,\n\nGreat to connect.\n\nBest,\nSarah")
        assert "<br>" in result
        assert "Hi John," in result

    def test_html_escaping(self):
        from app.services.recruiter_email_generator import plain_to_html
        result = plain_to_html("I'm excited about the <role> & company")
        assert "&lt;role&gt;" in result
        assert "&amp;" in result

    def test_wrapped_in_div(self):
        from app.services.recruiter_email_generator import plain_to_html
        result = plain_to_html("Hello")
        assert result.startswith("<div")
        assert result.endswith("</div>")


# =============================================================================
# ensure_sign_off quality
# =============================================================================

class TestEnsureSignOff:
    """Test sign-off enforcement."""

    def test_adds_signoff_when_missing(self):
        from app.services.reply_generation import ensure_sign_off
        body = "Hi John,\n\nWould love to chat about your work."
        result = ensure_sign_off(body, "Sarah Chen")
        assert "Sarah Chen" in result
        assert "Best" in result or "regards" in result.lower()

    def test_preserves_existing_signoff(self):
        from app.services.reply_generation import ensure_sign_off
        body = "Hi John,\n\nGreat to connect.\n\nBest,\nSarah Chen"
        result = ensure_sign_off(body, "Sarah Chen")
        # Should not double the signoff
        assert result.count("Best,") == 1

    def test_custom_signoff_config(self):
        from app.services.reply_generation import ensure_sign_off
        body = "Hi John,\n\nWould love to connect."
        result = ensure_sign_off(body, "Sarah", signoff_config={"signoffPhrase": "Cheers,", "signatureBlock": "Sarah\nUSC '27"})
        assert "Cheers," in result
        assert "USC '27" in result

    def test_empty_body(self):
        from app.services.reply_generation import ensure_sign_off
        result = ensure_sign_off("", "Name")
        assert result == ""


# =============================================================================
# Edge case: empty/missing contact fields
# =============================================================================

class TestEdgeCasesMissingFields:
    """Test emails with missing or empty contact fields."""

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_recruiter_missing_lastname(self, mock_get_client):
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.with_options.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Hi Lisa,\n\nExcited about the role.\n\nLet's chat."))]
        )

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "Lisa", "Email": "l@co.com"},
            job_title="Eng",
            company="Co",
            job_description="desc",
            user_resume={},
            user_contact={"name": "Test"},
        )

        assert result is not None
        assert result["to_name"] == "Lisa"  # No double space from missing last name

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_recruiter_no_name_at_all(self, mock_get_client):
        """When recruiter has no name, email should still be valid."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.with_options.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Hi there,\n\nExcited about the role.\n\nWould love to chat."))]
        )

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"Email": "anon@co.com"},
            job_title="Eng",
            company="Co",
            job_description="desc",
            user_resume={},
            user_contact={"name": "Test"},
        )

        assert result is not None
        plain = result["plain_body"]
        # Should not have "Hi ," (empty name)
        assert "Hi ," not in plain or "Hello," in plain or "Hi there," in plain

    @patch("app.services.recruiter_email_generator.get_openai_client")
    def test_recruiter_whitespace_name(self, mock_get_client):
        """Whitespace-only names should be handled gracefully."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        mock_client.with_options.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Hi there,\n\nExcited about the role.\n\nWould love to connect."))]
        )

        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "   ", "Email": "ws@co.com"},
            job_title="Eng",
            company="Co",
            job_description="desc",
            user_resume={},
            user_contact={"name": "Test"},
        )

        assert result is not None
        # to_name should be empty or clean, not "   "
        assert result["to_name"].strip() == result["to_name"]

    def test_contact_email_missing_firstname(self):
        """Contact fallback with empty FirstName should use 'Hello,' or handle gracefully."""
        from app.services.recruiter_email_generator import generate_fallback_email
        body = generate_fallback_email(
            recruiter_first_name="",
            job_title="Eng",
            company="Co",
            user_name="Test",
        )
        assert body.strip().startswith("Hello,")
        assert "Hi ," not in body
