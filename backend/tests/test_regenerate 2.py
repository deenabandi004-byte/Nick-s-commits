"""Tests for regenerate_with_feedback - quality gate LLM regeneration."""
import pytest
from unittest.mock import patch, MagicMock
from app.services.reply_generation import regenerate_with_feedback


@pytest.fixture
def contact():
    return {
        "Company": "Goldman Sachs",
        "College": "USC",
        "Title": "Vice President",
        "FirstName": "Sarah",
        "LastName": "Chen",
    }


@pytest.fixture
def user_profile():
    return {
        "name": "Alex Student",
        "university": "USC",
        "goals": {"careerTrack": "Investment Banking"},
    }


@pytest.fixture
def original_email():
    return {
        "subject": "Quick question",
        "body": "Hi Sarah, I wanted to connect with you about your career.",
    }


class TestRegenerateWithFeedback:
    @patch("openai.OpenAI")
    def test_successful_regeneration(self, mock_openai_cls, contact, user_profile, original_email):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = (
            "SUBJECT: USC student interested in Goldman Sachs IB\n"
            "BODY:\nHi Sarah, as a USC finance student I admire your career at Goldman Sachs. "
            "Would you have 15 minutes for a quick chat about investment banking?"
        )
        mock_client.chat.completions.create.return_value = mock_response

        result = regenerate_with_feedback(
            contact, user_profile, original_email, ["weak_subject", "no_specificity"]
        )
        assert result["subject"] == "USC student interested in Goldman Sachs IB"
        assert "Goldman Sachs" in result["body"]

    @patch("openai.OpenAI")
    def test_uses_gpt4o_mini(self, mock_openai_cls, contact, user_profile, original_email):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "SUBJECT: test\nBODY:\ntest body"
        mock_client.chat.completions.create.return_value = mock_response

        regenerate_with_feedback(contact, user_profile, original_email, ["too_short"])
        call_args = mock_client.chat.completions.create.call_args
        assert call_args[1]["model"] == "gpt-4o-mini"
        assert call_args[1]["temperature"] == 0.3

    @patch("openai.OpenAI")
    def test_returns_original_on_api_error(self, mock_openai_cls, contact, user_profile, original_email):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API timeout")

        result = regenerate_with_feedback(contact, user_profile, original_email, ["too_short"])
        assert result["subject"] == original_email["subject"]
        assert result["body"] == original_email["body"]

    @patch("openai.OpenAI")
    def test_returns_original_on_bad_parse(self, mock_openai_cls, contact, user_profile, original_email):
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Here's an improved version without markers"
        mock_client.chat.completions.create.return_value = mock_response

        result = regenerate_with_feedback(contact, user_profile, original_email, ["weak_subject"])
        # Should return original since parsing failed to find SUBJECT:/BODY:
        assert result["subject"] == original_email["subject"]

    def test_failure_instructions_mapping(self, contact, user_profile, original_email):
        """Verify all failure types map to instructions without crashing."""
        all_failures = ["too_short", "too_long", "no_specificity", "no_clear_ask", "weak_subject", "template_leak"]
        with patch("openai.OpenAI") as mock_cls:
            mock_client = MagicMock()
            mock_cls.return_value = mock_client
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = "SUBJECT: test\nBODY:\ntest"
            mock_client.chat.completions.create.return_value = mock_response

            result = regenerate_with_feedback(contact, user_profile, original_email, all_failures)
            # Should not crash with any combination of failures
            assert "subject" in result
            assert "body" in result
            # Verify the prompt mentioned company for no_specificity
            prompt = mock_client.chat.completions.create.call_args[1]["messages"][0]["content"]
            assert "Goldman Sachs" in prompt
