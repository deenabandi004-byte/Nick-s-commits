"""Cover letters must never contain em dashes — strip_em_dashes is the
deterministic backstop behind the prompt-level ban."""
import pytest

from app.utils.em_dash import strip_em_dashes


pytestmark = pytest.mark.unit


class TestStripEmDashes:
    def test_spaced_em_dash_becomes_comma(self):
        assert strip_em_dashes("I shipped it — two weeks early.") == \
            "I shipped it, two weeks early."

    def test_unspaced_em_dash_becomes_comma(self):
        assert strip_em_dashes("fast—and correct") == "fast, and correct"

    def test_paired_em_dashes(self):
        assert strip_em_dashes("the fix — a one-liner — landed") == \
            "the fix, a one-liner, landed"

    def test_horizontal_bar_variant(self):
        assert strip_em_dashes("done ― mostly") == "done, mostly"

    def test_double_hyphen_stand_in(self):
        assert strip_em_dashes("built it -- then broke it") == \
            "built it, then broke it"

    def test_spaced_en_dash_treated_as_clause_dash(self):
        assert strip_em_dashes("cheap – and fast") == "cheap, and fast"

    def test_unspaced_en_dash_date_range_preserved(self):
        assert strip_em_dashes("Analyst, 2019–2021") == "Analyst, 2019–2021"

    def test_em_dash_before_period_leaves_no_dangling_comma(self):
        assert strip_em_dashes("it worked —.") == "it worked."

    def test_em_dash_at_line_end_preserves_newline(self):
        result = strip_em_dashes("First line —\nSecond line")
        assert "\n" in result
        assert "—" not in result

    def test_newlines_and_paragraphs_preserved(self):
        text = "Dear Team,\n\nI build things — carefully.\n\nSincerely,\nSam"
        result = strip_em_dashes(text)
        assert result == "Dear Team,\n\nI build things, carefully.\n\nSincerely,\nSam"

    def test_no_dash_text_returned_unchanged(self):
        text = "Plain text, hyphen-ated, nothing to do."
        assert strip_em_dashes(text) is text

    def test_idempotent(self):
        once = strip_em_dashes("a — b — c")
        assert strip_em_dashes(once) == once

    def test_empty_and_none_safe(self):
        assert strip_em_dashes("") == ""
        assert strip_em_dashes(None) is None

    def test_never_leaves_any_em_dash(self):
        nasty = "a—b ― c ⸺ d ⸻ e -- f – g"
        result = strip_em_dashes(nasty)
        for ch in "—―⸺⸻":
            assert ch not in result
