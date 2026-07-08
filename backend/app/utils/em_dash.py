"""Em dash removal for generated user-facing prose (cover letters).

Cover letters must NEVER contain an em dash: it is the single most-cited
"written by AI" tell in recruiter research (see the human-cover-letters
skill). The generation prompts already ban them, but models still leak
them, so every cover letter path runs through this deterministic backstop:
both generators (job_board.generate_cover_letter_with_ai and
cover_letter_public.letter_writer.generate_letter) and the shared PDF
builder, which also catches user-edited text round-tripped from the client.
"""
from __future__ import annotations

import re

# Em dash family: em dash, horizontal bar, two-em dash, three-em dash.
_EM_DASHES = "—―⸺⸻"

# Clause-joining dash (with or without surrounding spaces) → ", ".
# [ \t] instead of \s so a dash at end-of-line never swallows the newline.
_EM_DASH_RE = re.compile(rf"[ \t]*[{_EM_DASHES}][ \t]*")
# Double hyphen used as an em dash stand-in ("word -- word"). Requires word
# characters on both sides so signature/divider lines like "---" survive.
_DOUBLE_HYPHEN_RE = re.compile(r"(?<=\w)[ \t]*-{2,}[ \t]*(?=\w)")
# A SPACED en dash reads as an em dash ("fast – and cheap"); unspaced en
# dashes (date ranges like 2019–2021) are legitimate and left alone.
_SPACED_EN_DASH_RE = re.compile(r"(?<=\S)[ \t]+–[ \t]+(?=\S)")

# Artifact cleanup for the substitutions above.
_COMMA_BEFORE_PUNCT_RE = re.compile(r",\s*(?=[,.;:!?])")
_LEADING_COMMA_RE = re.compile(r"(?m)^, ?")
_SPACE_BEFORE_COMMA_RE = re.compile(r"[ \t]+,")
_TRAILING_WS_RE = re.compile(r"[ \t]+(?=\n)")


def strip_em_dashes(text: str) -> str:
    """Rewrite every em dash (and em-dash stand-in) as natural punctuation.

    "specific — evidence-led — writing" → "specific, evidence-led, writing".
    Idempotent, newline-preserving, and a no-op on text without dashes.
    """
    if not text or not isinstance(text, str):
        return text
    if not _EM_DASH_RE.search(text) and "--" not in text and "–" not in text:
        return text
    text = _EM_DASH_RE.sub(", ", text)
    text = _DOUBLE_HYPHEN_RE.sub(", ", text)
    text = _SPACED_EN_DASH_RE.sub(", ", text)
    text = _COMMA_BEFORE_PUNCT_RE.sub("", text)
    text = _LEADING_COMMA_RE.sub("", text)
    text = _SPACE_BEFORE_COMMA_RE.sub(",", text)
    text = _TRAILING_WS_RE.sub("", text)
    return text
