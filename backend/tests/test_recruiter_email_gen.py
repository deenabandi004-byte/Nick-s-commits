"""
Tests for recruiter/hiring manager email generation.
Covers: recruiter_email_generator.py fixes — model switch, resume_text passthrough,
template_instructions, role_type, build_resume_summary, fallback emails, user_contact fallback.
"""

import pytest
from unittest.mock import patch, MagicMock


# =============================================================================
# Test _normalize_name
# =============================================================================

class TestNormalizeName:
    """Test name capitalization and normalization."""

    def test_lowercase(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("john") == "John"

    def test_all_caps(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("JOHN") == "John"

    def test_already_correct(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("John") == "John"

    def test_extra_whitespace(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("  john  ") == "John"

    def test_empty_string(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("") == ""

    def test_none(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name(None) == ""

    def test_mc_prefix(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("mcdonald") == "McDonald"

    def test_mc_prefix_caps(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("MCDONALD") == "McDonald"

    def test_mac_prefix(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("macdonald") == "MacDonald"

    def test_o_apostrophe(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("o'brien") == "O'Brien"

    def test_o_apostrophe_caps(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("O'BRIEN") == "O'Brien"

    def test_hyphenated(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("jean-pierre") == "Jean-Pierre"

    def test_hyphenated_caps(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("JEAN-PIERRE") == "Jean-Pierre"

    def test_multi_word(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("mary jane") == "Mary Jane"

    def test_full_name_all_caps(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("JOHN") == "John"

    def test_whitespace_only(self):
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("   ") == ""

    def test_short_mc(self):
        """'Mc' alone should just capitalize."""
        from app.services.recruiter_email_generator import _normalize_name
        assert _normalize_name("mc") == "Mc"


# =============================================================================
# Test build_resume_summary
# =============================================================================

class TestBuildResumeSummary:
    """Test build_resume_summary handles all resume formats correctly."""

    def test_dict_education_format(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {
            "name": "Jane Doe",
            "education": {
                "degree": "Bachelor of Science",
                "major": "Computer Science",
                "university": "MIT"
            }
        }
        result = build_resume_summary(resume)
        assert "MIT" in result
        assert "Computer Science" in result
        assert "Bachelor of Science" in result

    def test_list_education_with_school_field(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {
            "education": [{"degree": "BS", "school": "Stanford", "major": "Math"}]
        }
        result = build_resume_summary(resume)
        assert "Stanford" in result
        assert "Math" in result

    def test_list_education_with_university_field(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {
            "education": [{"degree": "MS", "university": "Harvard"}]
        }
        result = build_resume_summary(resume)
        assert "Harvard" in result

    def test_education_with_gpa(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {
            "education": {"degree": "BS", "major": "CS", "university": "MIT", "gpa": "3.9"}
        }
        result = build_resume_summary(resume)
        assert "3.9" in result

    def test_experience_with_bullets(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {
            "experience": [
                {
                    "title": "Software Engineer",
                    "company": "Google",
                    "bullets": ["Led migration of 10M user system", "Reduced latency by 40%"]
                }
            ]
        }
        result = build_resume_summary(resume)
        assert "Software Engineer" in result
        assert "Google" in result
        assert "Led migration" in result

    def test_experience_without_bullets(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {"experience": [{"title": "Analyst", "company": "JPMorgan"}]}
        result = build_resume_summary(resume)
        assert "Analyst at JPMorgan" in result

    def test_experience_with_achievements_key(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {
            "experience": [
                {"title": "PM", "company": "Meta", "achievements": ["Shipped feature to 1B users"]}
            ]
        }
        result = build_resume_summary(resume)
        assert "Shipped feature" in result

    def test_skills_dict_format(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {"skills": {"languages": ["Python", "Java"], "frameworks": ["React"]}}
        result = build_resume_summary(resume)
        assert "Python" in result
        assert "React" in result

    def test_skills_list_format(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {"skills": ["Python", "SQL", "Docker"]}
        result = build_resume_summary(resume)
        assert "Python" in result

    def test_projects(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {"projects": [{"name": "ChatBot AI", "description": "Built an NLP chatbot"}]}
        result = build_resume_summary(resume)
        assert "ChatBot AI" in result

    def test_empty_resume(self):
        from app.services.recruiter_email_generator import build_resume_summary
        assert "No resume data" in build_resume_summary({})

    def test_none_resume(self):
        from app.services.recruiter_email_generator import build_resume_summary
        assert "No resume data" in build_resume_summary(None)

    def test_limits_experience_to_three(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {
            "experience": [
                {"title": f"Role{i}", "company": f"Co{i}"} for i in range(10)
            ]
        }
        result = build_resume_summary(resume)
        assert "Role0" in result
        assert "Role2" in result
        assert "Role3" not in result  # Only top 3

    def test_limits_projects_to_two(self):
        from app.services.recruiter_email_generator import build_resume_summary
        resume = {
            "projects": [{"name": f"Proj{i}", "description": f"Desc{i}"} for i in range(5)]
        }
        result = build_resume_summary(resume)
        assert "Proj0" in result
        assert "Proj1" in result
        assert "Proj2" not in result


# =============================================================================
# Test fallback email
# =============================================================================

class TestGenerateFallbackEmail:

    def test_with_recruiter_name(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        result = generate_fallback_email("Sarah", "SWE", "Google", "John")
        assert "Hi Sarah," in result
        assert "SWE" in result
        assert "Google" in result

    def test_without_recruiter_name(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        result = generate_fallback_email("", "SWE", "Google", "John")
        assert "Hello," in result
        assert "Hi ," not in result

    def test_without_job_title(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        result = generate_fallback_email("Sarah", "", "Google", "John")
        assert "open" in result

    def test_without_company(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        result = generate_fallback_email("Sarah", "SWE", "", "John")
        assert "your company" in result

    def test_with_resume_education_dict(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        resume = {"education": {"degree": "BS in CS", "university": "Stanford"}}
        result = generate_fallback_email("Sarah", "SWE", "Google", "John", user_resume=resume)
        assert "Stanford" in result

    def test_with_resume_education_list(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        resume = {"education": [{"degree": "MBA", "school": "Wharton"}]}
        result = generate_fallback_email("Sarah", "SWE", "Google", "John", user_resume=resume)
        assert "Wharton" in result

    def test_with_resume_experience_fallback(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        resume = {"experience": [{"title": "Lead Engineer", "company": "Meta"}]}
        result = generate_fallback_email("Sarah", "SWE", "Google", "John", user_resume=resume)
        assert "Lead Engineer" in result
        assert "Meta" in result

    def test_hiring_manager_tone(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        result = generate_fallback_email("Sarah", "SWE", "Google", "John", role_type="hiring_manager")
        assert "contribute to your team" in result

    def test_recruiter_tone(self):
        from app.services.recruiter_email_generator import generate_fallback_email
        result = generate_fallback_email("Sarah", "SWE", "Google", "John", role_type="recruiter")
        assert "add value" in result


# =============================================================================
# Test generate_single_email (GPT mocked)
# =============================================================================

class TestGenerateSingleEmail:

    def _recruiter(self, first="Sarah", last="Smith", email="sarah@google.com", title="Recruiter"):
        return {"FirstName": first, "LastName": last, "Email": email, "Title": title}

    def _resume(self):
        return {
            "name": "John Doe",
            "education": {"degree": "BS", "major": "CS", "university": "MIT"},
            "experience": [{"title": "SWE", "company": "Meta", "bullets": ["Built scalable systems"]}],
            "skills": {"languages": ["Python", "Java"]}
        }

    def _contact(self):
        return {"name": "John Doe", "email": "john@x.com", "phone": "555-0100", "linkedin": "linkedin.com/in/johndoe"}

    def _setup_mock(self, mock_client_fn, body="Hi Sarah,\n\nGreat email."):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.choices = [MagicMock()]
        mock_resp.choices[0].message.content = body
        mock_client.with_options.return_value.chat.completions.create.return_value = mock_resp
        mock_client_fn.return_value = mock_client
        return mock_client

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_uses_gpt4o_mini(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = self._setup_mock(mock_fn)
        generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                              job_description="Build", user_resume=self._resume(), user_contact=self._contact())
        call_kwargs = mc.with_options.return_value.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o-mini"

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_max_retries_zero(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = self._setup_mock(mock_fn)
        generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                              job_description="Build", user_resume=self._resume(), user_contact=self._contact())
        mc.with_options.assert_called_once_with(max_retries=0)

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_resume_text_in_prompt(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = self._setup_mock(mock_fn)
        generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                              job_description="Build", user_resume=self._resume(), user_contact=self._contact(),
                              resume_text="John Doe\nSoftware Engineer with 5 years experience in distributed systems, microservices architecture, and cloud infrastructure. Previously at Meta and Amazon.")
        prompt = mc.with_options.return_value.chat.completions.create.call_args[1]["messages"][1]["content"]
        assert "Full Resume:" in prompt
        assert "microservices architecture" in prompt

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_no_resume_text_uses_summary(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = self._setup_mock(mock_fn)
        generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                              job_description="Build", user_resume=self._resume(), user_contact=self._contact(),
                              resume_text="")
        prompt = mc.with_options.return_value.chat.completions.create.call_args[1]["messages"][1]["content"]
        assert "Resume Summary:" in prompt
        assert "MIT" in prompt

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_template_instructions_in_prompt(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = self._setup_mock(mock_fn)
        generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                              job_description="Build", user_resume=self._resume(), user_contact=self._contact(),
                              template_instructions="Mention my passion for open source")
        prompt = mc.with_options.return_value.chat.completions.create.call_args[1]["messages"][1]["content"]
        assert "CUSTOM INSTRUCTIONS" in prompt
        assert "open source" in prompt

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_empty_instructions_not_in_prompt(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = self._setup_mock(mock_fn)
        generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                              job_description="Build", user_resume=self._resume(), user_contact=self._contact(),
                              template_instructions="")
        prompt = mc.with_options.return_value.chat.completions.create.call_args[1]["messages"][1]["content"]
        assert "CUSTOM INSTRUCTIONS" not in prompt

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_hiring_manager_tone_in_prompt(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = self._setup_mock(mock_fn)
        generate_single_email(recruiter=self._recruiter(title="Engineering Manager"), job_title="SWE",
                              company="Google", job_description="Build", user_resume=self._resume(),
                              user_contact=self._contact(), role_type="hiring_manager")
        prompt = mc.with_options.return_value.chat.completions.create.call_args[1]["messages"][1]["content"]
        assert "hiring manager" in prompt
        assert "contribute to their team" in prompt

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_recruiter_tone_in_prompt(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = self._setup_mock(mock_fn)
        generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                              job_description="Build", user_resume=self._resume(), user_contact=self._contact(),
                              role_type="recruiter")
        prompt = mc.with_options.return_value.chat.completions.create.call_args[1]["messages"][1]["content"]
        assert "recruiter/talent acquisition" in prompt

    def test_skip_no_email(self):
        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "X", "Email": "Not available"},
            job_title="SWE", company="G", job_description="B",
            user_resume={"name": "J"}, user_contact={"name": "J"})
        assert result is None

    def test_skip_empty_email(self):
        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "X", "Email": ""},
            job_title="SWE", company="G", job_description="B",
            user_resume={"name": "J"}, user_contact={"name": "J"})
        assert result is None

    def test_skip_missing_email_field(self):
        from app.services.recruiter_email_generator import generate_single_email
        result = generate_single_email(
            recruiter={"FirstName": "X"},
            job_title="SWE", company="G", job_description="B",
            user_resume={"name": "J"}, user_contact={"name": "J"})
        assert result is None

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_workemail_fallback(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        self._setup_mock(mock_fn)
        result = generate_single_email(
            recruiter={"FirstName": "X", "Email": "", "WorkEmail": "x@co.com"},
            job_title="SWE", company="G", job_description="B",
            user_resume=self._resume(), user_contact=self._contact())
        assert result is not None
        assert result["to_email"] == "x@co.com"

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_gpt_failure_uses_fallback(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mc = MagicMock()
        mc.with_options.return_value.chat.completions.create.side_effect = Exception("API error")
        mock_fn.return_value = mc
        result = generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                                       job_description="Build", user_resume=self._resume(), user_contact=self._contact())
        assert result is not None
        assert "Hi Sarah," in result["plain_body"]
        assert "SWE" in result["plain_body"]

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_no_client_uses_fallback(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        mock_fn.return_value = None
        result = generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                                       job_description="Build", user_resume=self._resume(), user_contact=self._contact())
        assert result is not None
        assert "Hi Sarah," in result["plain_body"]

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_email_structure(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        self._setup_mock(mock_fn)
        result = generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                                       job_description="Build", user_resume=self._resume(), user_contact=self._contact())
        assert result["to_email"] == "sarah@google.com"
        assert result["to_name"] == "Sarah Smith"
        assert "subject" in result
        assert "body" in result
        assert "plain_body" in result
        assert "approach_used" in result

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_signature_includes_contact_info(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        self._setup_mock(mock_fn)
        result = generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                                       job_description="Build", user_resume=self._resume(), user_contact=self._contact())
        assert "555-0100" in result["plain_body"]
        assert "linkedin.com/in/johndoe" in result["plain_body"]
        assert "John Doe" in result["plain_body"]

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_empty_contact_no_blank_sig_lines(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        self._setup_mock(mock_fn)
        result = generate_single_email(
            recruiter=self._recruiter(), job_title="SWE", company="Google", job_description="Build",
            user_resume=self._resume(), user_contact={"name": "John", "email": "j@x.com", "phone": "", "linkedin": ""})
        # No blank lines from empty phone/linkedin
        lines = result["plain_body"].split("\n")
        # Last lines should be sign-off then name, no empty between
        sig_start = None
        for i, line in enumerate(lines):
            if line.strip() in ["Best,", "Best regards,", "Thanks so much,", "Looking forward to hearing from you,",
                                "Warm regards,", "Thank you for your time,", "Cheers,"]:
                sig_start = i
                break
        if sig_start is not None:
            assert lines[sig_start + 1].strip() == "John"

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_attachment_note_present(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        self._setup_mock(mock_fn)
        result = generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                                       job_description="Build", user_resume=self._resume(), user_contact=self._contact())
        assert "attached my resume" in result["plain_body"]

    @patch('app.services.recruiter_email_generator.get_openai_client')
    def test_html_body_is_html(self, mock_fn):
        from app.services.recruiter_email_generator import generate_single_email
        self._setup_mock(mock_fn)
        result = generate_single_email(recruiter=self._recruiter(), job_title="SWE", company="Google",
                                       job_description="Build", user_resume=self._resume(), user_contact=self._contact())
        assert result["body"].startswith("<div")
        assert "<br>" in result["body"]


# =============================================================================
# Test batch generation
# =============================================================================

class TestGenerateRecruiterEmails:
    """The recruiter draft engine now delegates to batch_generate_emails.
    These tests mock that delegate so no live LLM calls happen."""

    @staticmethod
    def _mock_batch(subject_prefix="Re", body_prefix="Body"):
        """Return a callable that produces a dict keyed 0..N-1 matching the
        recruiters list passed in. Each value mimics batch_generate_emails'
        plain-body output."""
        def _impl(*, contacts, **_kwargs):
            return {
                i: {
                    "subject": f"{subject_prefix} {i}",
                    "plain_body": f"{body_prefix} for {c.get('FirstName', '?')}",
                    "body": f"{body_prefix} for {c.get('FirstName', '?')}",
                    "personalization": {},
                }
                for i, c in enumerate(contacts)
            }
        return _impl

    @patch("app.services.reply_generation.batch_generate_emails")
    def test_skips_no_email_contacts(self, mock_batch):
        from app.services.recruiter_email_generator import generate_recruiter_emails
        mock_batch.side_effect = self._mock_batch()
        emails = generate_recruiter_emails(
            recruiters=[
                {"FirstName": "Jane", "Email": "jane@co.com"},
                {"FirstName": "Bob", "Email": "Not available"},
                {"FirstName": "Tom"},
            ],
            job_title="SWE", company="Google", job_description="Build",
            user_resume={"name": "J"},
            user_contact={"name": "J", "email": "", "phone": "", "linkedin": ""},
        )
        assert len(emails) == 1
        # The engine should only have been called with the one eligible recruiter
        assert mock_batch.call_count == 1
        passed_contacts = mock_batch.call_args.kwargs["contacts"]
        assert len(passed_contacts) == 1
        assert passed_contacts[0]["FirstName"] == "Jane"

    @patch("app.services.reply_generation.batch_generate_emails")
    def test_one_output_per_eligible_recruiter(self, mock_batch):
        from app.services.recruiter_email_generator import generate_recruiter_emails
        mock_batch.side_effect = self._mock_batch()
        recruiters = [{"FirstName": f"P{i}", "Email": f"p{i}@co.com"} for i in range(5)]
        emails = generate_recruiter_emails(
            recruiters=recruiters, job_title="SWE", company="G", job_description="B",
            user_resume={"name": "J"},
            user_contact={"name": "J", "email": "", "phone": "", "linkedin": ""},
        )
        assert len(emails) == 5
        # Each output is mapped to the right recruiter
        for i, em in enumerate(emails):
            assert em["recruiter"]["FirstName"] == f"P{i}"
            assert em["to_email"] == f"p{i}@co.com"
            assert em["subject"] and em["plain_body"]

    @patch("app.services.reply_generation.batch_generate_emails")
    def test_passes_new_params(self, mock_batch):
        from app.services.recruiter_email_generator import generate_recruiter_emails
        mock_batch.side_effect = self._mock_batch()
        generate_recruiter_emails(
            recruiters=[{"FirstName": "J", "Email": "j@co.com"}],
            job_title="SWE", company="G", job_description="Build distributed systems serving millions of users.",
            user_resume={"name": "X"},
            user_contact={"name": "X", "email": "", "phone": "", "linkedin": ""},
            resume_text="Experienced engineer with 10 years of backend development.",
            template_instructions="Be casual",
            role_type="hiring_manager",
        )
        kwargs = mock_batch.call_args.kwargs
        assert kwargs["resume_text"] == "Experienced engineer with 10 years of backend development."
        # template_instructions now flows through get_template_instructions, which
        # wraps the caller's "Be casual" into a longer template scaffold. We just
        # confirm the user's instruction is preserved somewhere in the result.
        assert "Be casual" in kwargs["template_instructions"]
        assert kwargs["email_template_purpose"] == "referral"
        assert kwargs["fit_context"]["job_title"] == "SWE"
        assert kwargs["fit_context"]["company"] == "G"
        assert "distributed systems serving millions" in kwargs["fit_context"]["pitch"]

    @patch("app.services.reply_generation.batch_generate_emails")
    def test_handles_large_recruiter_batch(self, mock_batch):
        """Sanity: 7-recruiter batch returns 7 outputs (no implicit cap)."""
        from app.services.recruiter_email_generator import generate_recruiter_emails
        mock_batch.side_effect = self._mock_batch()
        recruiters = [{"FirstName": f"P{i}", "Email": f"p{i}@co.com"} for i in range(7)]
        emails = generate_recruiter_emails(
            recruiters=recruiters, job_title="SWE", company="G", job_description="B",
            user_resume={"name": "J"},
            user_contact={"name": "J", "email": "", "phone": "", "linkedin": ""},
        )
        assert len(emails) == 7


# =============================================================================
# Test plain_to_html
# =============================================================================

class TestPlainToHtml:

    def test_newlines_to_br(self):
        from app.services.recruiter_email_generator import plain_to_html
        assert "<br>" in plain_to_html("A\nB")

    def test_html_escaping(self):
        from app.services.recruiter_email_generator import plain_to_html
        result = plain_to_html("<script>alert('x')</script>")
        assert "&lt;script&gt;" in result

    def test_wraps_in_div(self):
        from app.services.recruiter_email_generator import plain_to_html
        result = plain_to_html("Hello")
        assert result.startswith("<div")
        assert result.endswith("</div>")


# =============================================================================
# Test user_contact fallback logic (mirrors job_board.py construction)
# =============================================================================

class TestUserContactFallback:

    def _build_contact(self, user_data):
        """Mirrors the user_contact construction in job_board.py."""
        user_resume = user_data.get('resumeParsed', {})
        resume_phone = user_resume.get('contact', {}).get('phone', '') if isinstance(user_resume.get('contact'), dict) else ''
        resume_linkedin = user_resume.get('contact', {}).get('linkedin', '') if isinstance(user_resume.get('contact'), dict) else ''
        return {
            "name": user_resume.get('name', user_data.get('displayName', '')),
            "email": user_data.get('email', ''),
            "phone": resume_phone or user_data.get('phone', ''),
            "linkedin": resume_linkedin or user_data.get('linkedin', '')
        }

    def test_phone_from_resume(self):
        contact = self._build_contact({
            "resumeParsed": {"name": "J", "contact": {"phone": "555-1234"}},
            "phone": "555-9999"
        })
        assert contact["phone"] == "555-1234"

    def test_phone_fallback_to_profile(self):
        contact = self._build_contact({
            "resumeParsed": {"name": "J", "contact": {}},
            "phone": "555-9999"
        })
        assert contact["phone"] == "555-9999"

    def test_phone_fallback_no_contact_dict(self):
        contact = self._build_contact({
            "resumeParsed": {"name": "J"},
            "phone": "555-0000"
        })
        assert contact["phone"] == "555-0000"

    def test_linkedin_from_resume(self):
        contact = self._build_contact({
            "resumeParsed": {"name": "J", "contact": {"linkedin": "linkedin.com/in/j"}},
            "linkedin": "linkedin.com/in/old"
        })
        assert contact["linkedin"] == "linkedin.com/in/j"

    def test_linkedin_fallback_to_profile(self):
        contact = self._build_contact({
            "resumeParsed": {"name": "J"},
            "linkedin": "linkedin.com/in/j"
        })
        assert contact["linkedin"] == "linkedin.com/in/j"

    def test_name_from_resume(self):
        contact = self._build_contact({
            "resumeParsed": {"name": "John Doe"},
            "displayName": "Johnny"
        })
        assert contact["name"] == "John Doe"

    def test_name_fallback_to_displayname(self):
        contact = self._build_contact({
            "resumeParsed": {},
            "displayName": "Johnny"
        })
        assert contact["name"] == "Johnny"

    def test_all_empty(self):
        contact = self._build_contact({"resumeParsed": {}})
        assert contact["name"] == ""
        assert contact["phone"] == ""
        assert contact["linkedin"] == ""
