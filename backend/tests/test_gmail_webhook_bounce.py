"""Tests for bounce / DSN detection in the Gmail webhook.

The webhook treats any non-self message in an outbound thread as a reply. Without
the bounce gate, Mailer-Daemon "Address not found" messages get surfaced as
"{contact} responded to you!" notifications.
"""
import pytest

from app.utils.bounce_detection import is_bounce_message as _is_bounce_message


class TestIsBounceMessage:
    def test_mailer_daemon_sender(self):
        assert _is_bounce_message(
            "mailer-daemon@googlemail.com",
            "Delivery Status Notification (Failure)",
            "Address not found Your message wasn't delivered to milves@aegworldwide.com",
        ) is True

    def test_postmaster_sender(self):
        assert _is_bounce_message("postmaster@example.com", "", "") is True

    def test_subject_only_dsn(self):
        # Some bounces come from rewritten senders but keep DSN subject.
        assert _is_bounce_message(
            "bounces+abc@mail.example.com",
            "Undelivered Mail Returned to Sender",
            "",
        ) is True

    def test_snippet_only_address_not_found(self):
        # Mirrors the exact text from the bug screenshot.
        assert _is_bounce_message(
            "noreply@somewhere.com",
            "Re: Quick question",
            "Address not found Your message wasn't delivered to milves@aegworldwide.com because the address couldn't be found",
        ) is True

    def test_real_reply_not_bounce(self):
        assert _is_bounce_message(
            "michael.ilves@aegworldwide.com",
            "Re: Quick question",
            "Hi Rylan, happy to chat next week. How does Tuesday at 3pm work?",
        ) is False

    def test_empty_inputs(self):
        assert _is_bounce_message("", "", "") is False
        assert _is_bounce_message(None, None, None) is False

    def test_case_insensitive_sender(self):
        assert _is_bounce_message("MAILER-DAEMON@googlemail.com", "", "") is True

    def test_smtp_code_in_snippet(self):
        assert _is_bounce_message(
            "user@gmail.com",
            "Re: hello",
            "Final-Recipient: rfc822; foo@bar.com 550 5.1.1 The email account does not exist",
        ) is True
