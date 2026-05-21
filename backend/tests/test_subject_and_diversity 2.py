"""Tests for P1a (subject specificity) and P1b (batch diversity)."""
import pytest
from app.utils.email_quality import (
    subject_has_contact_proper_noun,
    check_email_quality,
    check_batch_diversity,
)


class TestSubjectSpecificity:
    """P1a: Subject must reference at least one contact proper noun
    beyond the user's own university."""

    def test_company_in_subject(self):
        contact = {"Company": "Goldman Sachs", "FirstName": "Sarah", "Title": "VP"}
        assert subject_has_contact_proper_noun("Interested in Goldman Sachs culture", contact) is True

    def test_company_partial_word(self):
        """'Goldman' alone should match 'Goldman Sachs'."""
        contact = {"Company": "Goldman Sachs", "FirstName": "Sarah", "Title": "VP"}
        assert subject_has_contact_proper_noun("USC student interested in Goldman", contact) is True

    def test_first_name_in_subject(self):
        contact = {"Company": "Bain", "FirstName": "Sarah", "Title": "Consultant"}
        assert subject_has_contact_proper_noun("Quick question for Sarah", contact) is True

    def test_title_keyword_in_subject(self):
        contact = {"Company": "Deloitte", "FirstName": "Tom", "Title": "Senior Consultant"}
        assert subject_has_contact_proper_noun("Question for a Senior Consultant", contact) is True

    def test_only_user_university_fails(self):
        """If subject only has the user's university and nothing from the contact, fail."""
        contact = {"Company": "Random Corp", "FirstName": "Alex", "Title": "Manager"}
        assert subject_has_contact_proper_noun(
            "USC student interested in finance",
            contact,
            user_university="USC",
        ) is False

    def test_user_university_plus_company_passes(self):
        contact = {"Company": "McKinsey", "FirstName": "Alex", "Title": "Associate"}
        assert subject_has_contact_proper_noun(
            "USC student interested in McKinsey",
            contact,
            user_university="USC",
        ) is True

    def test_short_title_word_ignored(self):
        """Title words < 4 chars (VP, PM) should not match to avoid false positives."""
        contact = {"Company": "Unknown", "FirstName": "Bo", "Title": "VP"}
        assert subject_has_contact_proper_noun(
            "VP role at your company",
            contact,
        ) is False

    def test_empty_subject(self):
        contact = {"Company": "Google"}
        assert subject_has_contact_proper_noun("", contact) is False

    def test_quality_gate_catches_no_contact_noun(self):
        """Integration: check_email_quality flags subject_no_contact_noun."""
        body = (
            "Hi Alex, I'm a student at USC and noticed you work at Random Corp. "
            "I'd love to learn more about your experience there. "
            "Would you have 15 minutes for a quick chat? Thank you. " * 2
        )
        contact = {"Company": "Random Corp", "FirstName": "Alex", "Title": "Manager"}
        result = check_email_quality(
            "USC student exploring career paths",
            body,
            contact,
            user_university="USC",
        )
        assert "subject_no_contact_noun" in result["failures"]

    def test_quality_gate_passes_with_contact_noun(self):
        body = (
            "Hi Alex, I noticed you work at Random Corp. I'm a student at USC "
            "studying finance. I'd love to learn more about your experience as "
            "a Manager there. Would you have 15 minutes for a quick chat? "
            "Thank you for considering this."
        )
        contact = {"Company": "Random Corp", "FirstName": "Alex", "Title": "Manager"}
        result = check_email_quality(
            "Random Corp career question from USC student",
            body,
            contact,
            user_university="USC",
        )
        assert "subject_no_contact_noun" not in result["failures"]


class TestBatchDiversity:
    """P1b: No two emails in a batch share subject prefix or opener."""

    def test_diverse_batch_returns_empty(self):
        results = {
            0: {"subject": "Goldman Sachs banking question", "body": "Hi Sarah,\n\nAs a fellow USC alum..."},
            1: {"subject": "Exploring consulting at McKinsey", "body": "Hi Tom,\n\nYour career path caught my eye..."},
            2: {"subject": "Stripe engineering culture", "body": "Hi Priya,\n\nI noticed we both studied CS..."},
        }
        dups = check_batch_diversity(results, [{}, {}, {}])
        assert dups == []

    def test_duplicate_subject_prefix_detected(self):
        results = {
            0: {"subject": "USC student interested in Goldman", "body": "Hi Sarah,\n\nYour work at Goldman..."},
            1: {"subject": "USC student interested in McKinsey", "body": "Hi Tom,\n\nI've been following McKinsey..."},
            2: {"subject": "Stripe engineering question", "body": "Hi Priya,\n\nAs a CS student..."},
        }
        dups = check_batch_diversity(results, [{}, {}, {}])
        assert 1 in dups  # second "USC student interested" is the dup
        assert 0 not in dups  # first one is kept

    def test_duplicate_opener_detected(self):
        results = {
            0: {"subject": "Goldman question", "body": "Hi Sarah,\n\nAs a fellow USC alum, I'd love to connect. Your work at Goldman is inspiring."},
            1: {"subject": "McKinsey question", "body": "Hi Tom,\n\nAs a fellow USC alum, I'd love to connect. Your consulting career is fascinating."},
            2: {"subject": "Stripe question", "body": "Hi Priya,\n\nI noticed we share a CS background from Michigan."},
        }
        dups = check_batch_diversity(results, [{}, {}, {}])
        assert 1 in dups  # second "as a fellow usc alum, i'd love to connect." shares first 60 chars

    def test_single_email_batch_no_duplicates(self):
        results = {0: {"subject": "Quick question about Goldman", "body": "Hi Sarah,\n\nYour work caught my attention."}}
        dups = check_batch_diversity(results, [{}])
        assert dups == []

    def test_identical_positioning_sentence_detected(self):
        """8-word prefix check catches 'I'm Sarah, a Finance student at USC' pattern."""
        results = {
            0: {"subject": "Centerview question", "body": "Hi Brian,\n\nI'm Sarah, a Finance student at USC exploring investment banking careers. Your transition from Moelis caught my attention."},
            1: {"subject": "PJT Partners question", "body": "Hi Natalie,\n\nI'm Sarah, a Finance student at USC exploring investment banking careers. Your move from Barclays to PJT Partners was interesting."},
            2: {"subject": "Guggenheim question", "body": "Hi Claire,\n\nCurrently a junior at USC studying Finance, I'm curious about your work at Guggenheim."},
        }
        dups = check_batch_diversity(results, [{}, {}, {}])
        assert 1 in dups  # second "i'm sarah, a finance student at usc exploring" is a dup
        assert 0 not in dups  # first one kept
        assert 2 not in dups  # different opener

    def test_short_opener_not_flagged(self):
        """Openers under 15 chars are too short to be meaningful for dedup."""
        results = {
            0: {"subject": "Goldman question", "body": "Hi Sarah,\n\nHi there!"},
            1: {"subject": "McKinsey question", "body": "Hi Tom,\n\nHi there!"},
        }
        dups = check_batch_diversity(results, [{}, {}])
        # "hi there!" is < 15 chars, should not trigger dup
        assert dups == []
