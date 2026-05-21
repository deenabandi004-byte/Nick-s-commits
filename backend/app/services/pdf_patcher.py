"""
Standalone PDF patcher: apply bullet rewrites and text patches directly onto
an original PDF using PyMuPDF (fitz). No integration with tailor flow.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Optional

import fitz

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Font mapping: PDF subset/base names → PyMuPDF standard font names
# ---------------------------------------------------------------------------
FONT_MAP: dict[str, str] = {
    "CMR10": "times-roman",
    "CMR12": "times-roman",
    "CMBX10": "times-bold",
    "CMBX12": "times-bold",
    "CMTT10": "courier",
    "CMTI10": "times-italic",
    "Helvetica": "helvetica",
    "Helvetica-Bold": "helvetica-bold",
    "Arial": "helvetica",
    "Arial-Bold": "helvetica-bold",
    "TimesNewRomanPSMT": "times-roman",
    "TimesNewRomanPS-BoldMT": "times-bold",
    "TimesNewRomanPS-ItalicMT": "times-italic",
    "Calibri": "helvetica",
    "Calibri-Bold": "helvetica-bold",
    "Inter": "helvetica",
    "GaramondPremrPro": "times-roman",
}

# Bullet characters that start a bullet line (preserve when replacing)
BULLET_PREFIXES = ("•", "◦", "○", "▪", "●", "–", "-", " - ")
# Map Unicode bullets to glyphs that exist in standard PDF fonts (times-roman, helvetica)
BULLET_FONT_REPLACEMENTS = {
    "\u25E6": "o",   # ◦ (U+25E6) open circle → o
    "\u25CB": "o",   # ○ (U+25CB) white circle → o
    "\u25CF": "\u2022",  # ● (U+25CF) filled circle → • (U+2022, in most fonts)
    "\u25AA": "-",   # ▪ (U+25AA) small square → dash
    "\u2022": "\u2022",  # • keep as is (standard bullet)
}
MIN_FONT_SIZE = 8.0  # Allow slightly smaller text to fit longer replacements
SKILL_APPEND_MIN_FONT_SIZE = 8.0  # allow smaller when bbox expanded for wrap
# Multi-line merge heuristics
LINE_HEIGHT_GAP_RATIO = 1.5  # max gap / line_height to still merge continuation
INDENT_DECREASE_THRESHOLD = 5.0  # pt - de-indent by more = new bullet/block
INDENT_TOLERANCE = 3.0  # pt - same indent within this
FONT_SIZE_HEADER_RATIO = 1.15  # next line font size > prev * this = section header
BODY_FONT_HEADER_RATIO = 1.1  # line font size > page median * this = section header
# Common resume section titles (case-insensitive); section headers are never merged
COMMON_SECTION_NAMES = frozenset(
    [
        "education", "experience", "skills", "technical skills", "projects",
        "leadership", "activities", "summary", "certifications", "awards",
        "publications", "references", "honors", "coursework", "interests",
        "relevant coursework", "technical", "work experience", "professional experience",
    ]
)
FONT_SIZE_STEP = 0.5
LINE_Y_TOLERANCE_PX = 2.0
# skill_append: allow one extra line of wrap when gap below
LINE_HEIGHT_FACTOR = 1.2  # line_height = font_size * this
# extra_height = min(line_h, max(gap_to_next, line_h*0.6)) so we get at least 0.6*line_h when gap is small
GAP_MIN_RATIO = 0.6  # when gap < line_h, still add line_h*this so wrap can fit (may slightly overlap)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class SpanInfo:
    """One span from get_text('dict') with bbox and font info."""

    text: str
    bbox: tuple[float, float, float, float]  # x0, y0, x1, y1
    font_name: str
    font_size: float
    color: int
    page_num: int


@dataclass
class TextUnit:
    """Logical text unit (bullet or line) built from one or more spans."""

    full_text: str
    spans: list[SpanInfo]
    merged_bbox: tuple[float, float, float, float]
    page_num: int


@dataclass
class FontInfo:
    """Dominant font to use when reinserting text."""

    name: str
    size: float
    color: tuple[float, float, float]  # (r, g, b) in 0-1


@dataclass
class PatchResult:
    """Result of attempting to apply one patch."""

    fit_success: bool
    font_size_used: float | None
    status: str  # "applied" | "unsafe" | "not_found"


# ---------------------------------------------------------------------------
# Text normalization (PDF extraction quirks)
# ---------------------------------------------------------------------------


def normalize_text(text: str) -> str:
    """Normalize for matching: ligatures, whitespace, quotes, dashes."""
    if not text or not isinstance(text, str):
        return ""
    # Common ligatures
    text = (
        text.replace("\uFB01", "fi")
        .replace("\uFB02", "fl")
        .replace("\uFB00", "ff")
        .replace("\uFB03", "ffi")
        .replace("\uFB04", "ffl")
    )
    # Whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Quotes and dashes
    text = (
        text.replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201C", '"')
        .replace("\u201D", '"')
        .replace("\u2013", "-")
        .replace("\u2014", "-")
    )
    return text


# ---------------------------------------------------------------------------
# Color: integer from PDF span → (r, g, b) 0-1 for fitz
# ---------------------------------------------------------------------------


def _color_int_to_rgb(color: int) -> tuple[float, float, float]:
    """Convert PDF color int to (r, g, b) in 0-1."""
    if color is None or color < 0:
        return (0.0, 0.0, 0.0)
    r = ((color >> 16) & 0xFF) / 255.0
    g = ((color >> 8) & 0xFF) / 255.0
    b = (color & 0xFF) / 255.0
    return (r, g, b)


# ---------------------------------------------------------------------------
# Text index: build logical text units from get_text("dict")
# ---------------------------------------------------------------------------


def _span_from_dict(
    span_dict: dict[str, Any], page_num: int
) -> SpanInfo:
    """Build SpanInfo from a span dict returned by get_text('dict')."""
    bbox = tuple(span_dict["bbox"])
    color = span_dict.get("color", 0)
    if not isinstance(color, int):
        color = 0
    return SpanInfo(
        text=span_dict.get("text", ""),
        bbox=bbox,
        font_name=span_dict.get("font", "times-roman"),
        font_size=float(span_dict.get("size", 11)),
        color=color,
        page_num=page_num,
    )


def _bbox_union(bboxes: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    """Union of bounding boxes."""
    if not bboxes:
        return (0.0, 0.0, 0.0, 0.0)
    x0 = min(b[0] for b in bboxes)
    y0 = min(b[1] for b in bboxes)
    x1 = max(b[2] for b in bboxes)
    y1 = max(b[3] for b in bboxes)
    return (x0, y0, x1, y1)


def _same_line(y1: float, y2: float) -> bool:
    return abs(y1 - y2) <= LINE_Y_TOLERANCE_PX


def _is_bullet_start(text: str) -> bool:
    """True if text starts with a bullet or numbered list marker."""
    t = text.strip()
    if not t:
        return False
    if t[0] in BULLET_PREFIXES:
        return True
    if len(t) >= 2 and t[0].isdigit() and t[1] in ".)":
        return True
    return False


def _indent_x(bbox: tuple[float, float, float, float]) -> float:
    return bbox[0]


def _line_height(unit: TextUnit) -> float:
    """Height of the line's bbox."""
    b = unit.merged_bbox
    return b[3] - b[1] if b[3] > b[1] else 12.0


def _unit_font_size(unit: TextUnit) -> float:
    """Average font size of spans in this unit."""
    if not unit.spans:
        return 0.0
    return sum(s.font_size for s in unit.spans) / len(unit.spans)


def _line_starts_with_bullet(unit: TextUnit) -> bool:
    """True if the line text starts with a bullet or numbered list marker."""
    return _is_bullet_start(unit.full_text)


def _is_section_header(unit: TextUnit, page_median_font: float) -> bool:
    """
    True if this line is a section header. Section headers are never merged
    with content above or below.
    """
    text = unit.full_text.strip()
    if len(text) > 60:
        return False  # section headers are short
    normalized = re.sub(r"\s+", " ", text).lower().strip()
    # Exact match of known section name, and line is short (not "Languages: Python, ...")
    if len(text) < 50 and normalized in COMMON_SECTION_NAMES:
        return True
    # All caps or small-caps-like (LaTeX \textsc)
    alpha_chars = [c for c in text if c.isalpha()]
    if alpha_chars and all(c.isupper() for c in alpha_chars):
        return True
    # Font size larger than body
    if page_median_font > 0 and _unit_font_size(unit) > page_median_font * BODY_FONT_HEADER_RATIO:
        return True
    return False


def _is_skill_category_line(unit: TextUnit) -> bool:
    """
    True if line starts with a label followed by colon (e.g. "Languages: ...",
    "Frameworks & Web: ..."). Each such line is its own TextUnit.
    """
    text = unit.full_text.strip()
    if ":" not in text or len(text) < 5:
        return False
    # First colon should be in first ~40 chars (label: content)
    idx = text.find(":")
    if idx > 40 or idx < 2:
        return False
    label = text[:idx].strip()
    if not label:
        return False
    # Label should start with capital and look like a category (no sentence end)
    if not label[0].isupper():
        return False
    # "Languages", "Frameworks & Web", "Tools" etc.
    return True


def _merge_single_unit(units: list[TextUnit]) -> TextUnit:
    """Combine a list of line-level TextUnits into one TextUnit."""
    if len(units) == 1:
        return units[0]
    full_text = " ".join(u.full_text for u in units)
    all_spans: list[SpanInfo] = []
    for u in units:
        all_spans.extend(u.spans)
    merged_bbox = _bbox_union([u.merged_bbox for u in units])
    return TextUnit(
        full_text=full_text,
        spans=all_spans,
        merged_bbox=merged_bbox,
        page_num=units[0].page_num,
    )


def _merge_lines_into_units(
    lines: list[TextUnit],
    page_median_font_by_page: dict[int, float],
) -> list[TextUnit]:
    """
    Merge consecutive lines that belong to the same logical text block.

    Section headers are NEVER merged with anything (always their own unit).
    Lines starting with "Label: " (skill category) are always a new unit.
    """
    if not lines:
        return []
    from collections import defaultdict
    page_heights: dict[int, list[float]] = defaultdict(list)
    for u in lines:
        page_heights[u.page_num].append(_line_height(u))
    page_avg_height: dict[int, float] = {}
    for p, heights in page_heights.items():
        if heights:
            sorted_h = sorted(heights)
            mid = len(sorted_h) // 2
            page_avg_height[p] = sorted_h[mid] if sorted_h else 12.0
        else:
            page_avg_height[p] = 12.0

    merged: list[TextUnit] = []
    acc: list[TextUnit] = [lines[0]]

    for i in range(1, len(lines)):
        prev = acc[-1]
        curr = lines[i]
        page = curr.page_num
        avg_height = page_avg_height.get(page, 12.0)
        gap = curr.merged_bbox[1] - prev.merged_bbox[3]
        prev_indent = _indent_x(prev.merged_bbox)
        curr_indent = _indent_x(curr.merged_bbox)
        indent_decrease = prev_indent - curr_indent
        prev_font = _unit_font_size(prev)
        curr_font = _unit_font_size(curr)
        page_median_font = page_median_font_by_page.get(page, 11.0)

        # Section headers are NEVER merged: flush and make curr its own unit
        if _is_section_header(curr, page_median_font):
            merged.append(_merge_single_unit(acc))
            acc = [curr]
            continue
        # Previous line is section header: do not merge curr into it
        if _is_section_header(prev, page_median_font):
            merged.append(_merge_single_unit(acc))
            acc = [curr]
            continue
        # Skill category line ("Languages: ...", "Frameworks & Web: ...") = new unit
        if _is_skill_category_line(curr):
            merged.append(_merge_single_unit(acc))
            acc = [curr]
            continue

        if curr.page_num != prev.page_num:
            merged.append(_merge_single_unit(acc))
            acc = [curr]
            continue
        if gap > LINE_HEIGHT_GAP_RATIO * avg_height:
            merged.append(_merge_single_unit(acc))
            acc = [curr]
            continue
        if _line_starts_with_bullet(curr):
            merged.append(_merge_single_unit(acc))
            acc = [curr]
            continue
        if indent_decrease > INDENT_DECREASE_THRESHOLD:
            merged.append(_merge_single_unit(acc))
            acc = [curr]
            continue
        if prev_font > 0 and curr_font > prev_font * FONT_SIZE_HEADER_RATIO:
            merged.append(_merge_single_unit(acc))
            acc = [curr]
            continue
        if curr_indent >= prev_indent - INDENT_TOLERANCE:
            acc.append(curr)
        else:
            merged.append(_merge_single_unit(acc))
            acc = [curr]

    if acc:
        merged.append(_merge_single_unit(acc))
    return merged


def build_text_index(doc: fitz.Document) -> list[TextUnit]:
    """
    Build a list of logical text units from the document.
    Groups spans into lines, then merges consecutive lines into multi-line bullets.
    """
    line_units: list[TextUnit] = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = page.get_text("dict").get("blocks") or []
        page_spans: list[SpanInfo] = []

        for block in blocks:
            for line in block.get("lines") or []:
                for s in line.get("spans") or []:
                    if s.get("text"):
                        page_spans.append(_span_from_dict(s, page_num))

        if not page_spans:
            continue

        # Sort by vertical position then horizontal
        page_spans.sort(key=lambda s: (s.bbox[1], s.bbox[0]))

        # Group into lines (same y within tolerance)
        i = 0
        while i < len(page_spans):
            line_spans: list[SpanInfo] = [page_spans[i]]
            base_y = page_spans[i].bbox[1]
            j = i + 1
            while j < len(page_spans) and _same_line(page_spans[j].bbox[1], base_y):
                line_spans.append(page_spans[j])
                j += 1

            line_text = "".join(s.text for s in line_spans).strip()
            merged = _bbox_union([s.bbox for s in line_spans])

            # If this line looks like a new bullet (starts with bullet or indent reset),
            # emit previous accumulated bullet if any, then start/emit this line.
            # Simple strategy: treat each line as its own unit for now; merge only
            # consecutive lines that share the same left indent and are close vertically.
            if line_text:
                line_units.append(
                    TextUnit(
                        full_text=line_text,
                        spans=line_spans,
                        merged_bbox=merged,
                        page_num=page_num,
                    )
                )
            i = j

    # Per-page median font size for section header detection
    from collections import defaultdict
    page_font_sizes: dict[int, list[float]] = defaultdict(list)
    for u in line_units:
        page_font_sizes[u.page_num].append(_unit_font_size(u))
    page_median_font_by_page: dict[int, float] = {}
    for p, sizes in page_font_sizes.items():
        if sizes:
            sorted_s = sorted(sizes)
            mid = len(sorted_s) // 2
            page_median_font_by_page[p] = sorted_s[mid] if sorted_s else 11.0
        else:
            page_median_font_by_page[p] = 11.0

    merged_units = _merge_lines_into_units(line_units, page_median_font_by_page)
    logger.info(
        "[pdf_patcher] build_text_index: %d pages, %d line units -> %d merged units",
        len(doc),
        len(line_units),
        len(merged_units),
    )
    return merged_units


# ---------------------------------------------------------------------------
# Fuzzy text matching
# ---------------------------------------------------------------------------


def find_match(
    target_text: str,
    text_units: list[TextUnit],
    threshold: float = 0.85,
) -> tuple[TextUnit | None, float]:
    """Find the best matching text unit using fuzzy matching. Returns (unit, ratio)."""
    normalized_target = normalize_text(target_text)
    if not normalized_target:
        return (None, 0.0)

    best_match: TextUnit | None = None
    best_ratio = 0.0

    for unit in text_units:
        unit_norm = normalize_text(unit.full_text)

        # Try exact match first (fastest)
        if normalized_target == unit_norm:
            logger.debug("[pdf_patcher] find_match: exact match for %r", target_text[:50])
            return (unit, 1.0)

        # Substring: target in unit or unit in target (handles merged bullets)
        if normalized_target in unit_norm or unit_norm in normalized_target:
            logger.debug("[pdf_patcher] find_match: substring match for %r", target_text[:50])
            return (unit, 1.0)

        # Fuzzy match
        ratio = SequenceMatcher(None, normalized_target, unit_norm).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = unit

    if best_ratio >= threshold:
        logger.info(
            "[pdf_patcher] Fuzzy match at %.2f: %r",
            best_ratio,
            target_text[:50],
        )
        return (best_match, best_ratio)

    logger.warning(
        "[pdf_patcher] No match (best=%.2f): %r",
        best_ratio,
        target_text[:80],
    )
    return (None, best_ratio)


# ---------------------------------------------------------------------------
# Font extraction and mapping
# ---------------------------------------------------------------------------


def _base_font_name(font_name: str) -> str:
    """Strip subset prefix: 'BCDEEE+CMR10' -> 'CMR10'."""
    if "+" in font_name:
        return font_name.split("+")[-1]
    return font_name


def get_font_info(spans: list[SpanInfo]) -> FontInfo:
    """Dominant font from spans; map to standard name and average size."""
    if not spans:
        return FontInfo(name="times-roman", size=11.0, color=(0.0, 0.0, 0.0))

    # Most common (base_font, size) weighted by character count
    font_scores: dict[tuple[str, float], float] = {}
    color_sum: tuple[float, float, float] = (0.0, 0.0, 0.0)
    color_count = 0

    for s in spans:
        base = _base_font_name(s.font_name)
        mapped = FONT_MAP.get(base, "times-roman")
        key = (mapped, s.font_size)
        font_scores[key] = font_scores.get(key, 0) + len(s.text)
        rgb = _color_int_to_rgb(s.color)
        color_sum = (
            color_sum[0] + rgb[0],
            color_sum[1] + rgb[1],
            color_sum[2] + rgb[2],
        )
        color_count += 1

    best_key = max(font_scores, key=font_scores.get)
    font_name, font_size = best_key
    if color_count > 0:
        color = (
            color_sum[0] / color_count,
            color_sum[1] / color_count,
            color_sum[2] / color_count,
        )
    else:
        color = (0.0, 0.0, 0.0)

    logger.debug(
        "[pdf_patcher] get_font_info: %s %.1f %s",
        font_name,
        font_size,
        color,
    )
    return FontInfo(name=font_name, size=font_size, color=color)


# ---------------------------------------------------------------------------
# Bullet preservation
# ---------------------------------------------------------------------------


def preserve_bullet_prefix(original_text: str, replacement_text: str) -> str:
    """
    If original starts with a bullet/number prefix and replacement doesn't,
    prepend that prefix to replacement. Also preserve leading whitespace for indent.
    """
    orig_stripped = original_text.strip()
    repl_stripped = replacement_text.strip()
    if not orig_stripped or not repl_stripped:
        return replacement_text

    prefix = ""
    i = 0
    # Leading spaces
    while i < len(original_text) and original_text[i] in " \t":
        prefix += original_text[i]
        i += 1
    # Bullet or number
    if i < len(original_text):
        c = original_text[i]
        if c in BULLET_PREFIXES:
            prefix += c
            i += 1
            if i < len(original_text) and original_text[i] in " \t":
                while i < len(original_text) and original_text[i] in " \t":
                    prefix += original_text[i]
                    i += 1
        elif c.isdigit():
            while i < len(original_text) and (original_text[i].isdigit() or original_text[i] in "."):
                prefix += original_text[i]
                i += 1
            while i < len(original_text) and original_text[i] in " \t":
                prefix += original_text[i]
                i += 1

    if not prefix:
        return replacement_text
    if repl_stripped.startswith(prefix.strip()) or repl_stripped[0] in BULLET_PREFIXES:
        return replacement_text
    return prefix + repl_stripped


def _apply_bullet_font_replacement(text: str) -> str:
    """
    Replace leading Unicode bullet with a glyph that exists in standard PDF fonts.
    Prevents ◦ from rendering as "?" when using times-roman.
    """
    if not text or not text.strip():
        return text
    stripped = text.lstrip()
    if not stripped:
        return text
    lead = text[: len(text) - len(stripped)]
    first_char = stripped[0]
    replacement = BULLET_FONT_REPLACEMENTS.get(first_char)
    if replacement is not None:
        return lead + replacement + stripped[1:]
    return text


def _is_bullet_span(span: SpanInfo) -> bool:
    """True if span is a single bullet/symbol character (e.g. ◦ from CMSY10)."""
    t = span.text.strip()
    if len(t) != 1:
        return False
    return t in BULLET_PREFIXES or t in "o•-"


def _extract_bold_prefix(text_unit: TextUnit) -> Optional[tuple[str, str]]:
    """
    Check if the text unit starts with a bold prefix (e.g. "ETL Pipeline Engineering:").
    Skips leading bullet span (e.g. ◦ in CMSY10) before checking for bold.
    Returns (bold_prefix, bold_font_name) or None.
    """
    spans_to_check = list(text_unit.spans)
    while spans_to_check and _is_bullet_span(spans_to_check[0]):
        spans_to_check = spans_to_check[1:]
    bold_spans: list[SpanInfo] = []
    first_non_bold_text = ""
    for span in spans_to_check:
        font = span.font_name.split("+")[-1] if "+" in span.font_name else span.font_name
        is_bold = "bold" in font.lower() or "bx" in font.lower()
        if is_bold:
            bold_spans.append(span)
        else:
            first_non_bold_text = span.text
            break
    if not bold_spans:
        return None
    prefix_text = "".join(s.text for s in bold_spans).strip()
    if ":" in prefix_text:
        prefix_text = prefix_text[: prefix_text.index(":") + 1]
    elif first_non_bold_text.lstrip().startswith(":"):
        prefix_text = prefix_text + ":"
    else:
        return None
    if not prefix_text:
        return None
    bold_font = get_font_info(bold_spans).name
    return (prefix_text, bold_font)


# ---------------------------------------------------------------------------
# Apply patch: redact + insert on a copy first to test fit, then on real page
# ---------------------------------------------------------------------------


def _expand_bbox_for_skill_append(
    match: TextUnit,
    text_index: list[TextUnit],
    font_size: float,
) -> Optional[tuple[float, float, float, float]]:
    """
    For skill_append, expand bbox downward and to page right when there is
    vertical space for an extra line. Returns expanded bbox or None.
    """
    x0, y0, x1, y1 = match.merged_bbox
    line_h = font_size * LINE_HEIGHT_FACTOR
    on_page = [u for u in text_index if u.page_num == match.page_num]
    on_page.sort(key=lambda u: (u.merged_bbox[1], u.merged_bbox[0]))
    next_bottom = None
    for u in on_page:
        if u is match:
            continue
        if u.merged_bbox[1] > y1:
            next_bottom = u.merged_bbox[1]
            break
    gap_to_next = (next_bottom - y1) if next_bottom is not None else 9999.0
    if gap_to_next <= 0:
        return None  # no space below
    # Use at least the available gap; when gap is small, add line_h*GAP_MIN_RATIO so wrap can fit
    extra_height = min(line_h, max(gap_to_next, line_h * GAP_MIN_RATIO))
    expanded = (float(x0), float(y0), float(x1), float(y1) + extra_height)
    page_right = max(u.merged_bbox[2] for u in on_page) if on_page else x1
    if expanded[2] < page_right:
        expanded = (expanded[0], expanded[1], float(page_right), expanded[3])
    return expanded


def apply_patch(
    doc: fitz.Document,
    page_num: int,
    text_unit: TextUnit,
    replacement_text: str,
    font_info: FontInfo,
    preserve_bullet: bool = True,
    insert_bbox_override: Optional[tuple[float, float, float, float]] = None,
) -> tuple[PatchResult, fitz.Document]:
    """
    Cover original text with white rectangle and insert replacement. Test fit
    on a temporary document first; only apply to the real page when we know it fits.
    Uses white cover rectangles (no apply_redactions) to preserve coordinates for
    multi-patch. Returns (PatchResult, doc).
    """
    bullet_in_separate_span = (
        text_unit.spans
        and _is_bullet_span(text_unit.spans[0])
        and text_unit.spans[0].bbox[2] < text_unit.merged_bbox[2]
    )
    if preserve_bullet and not bullet_in_separate_span:
        replacement_text = preserve_bullet_prefix(text_unit.full_text, replacement_text)
        replacement_text = _apply_bullet_font_replacement(replacement_text)

    bullet_part = ""
    remainder = replacement_text
    if remainder and (
        remainder[0] in "o•-– - "
        or (len(remainder) >= 2 and remainder[0].isdigit() and remainder[1] in ".)")
    ):
        i = 0
        if remainder[0] in "o•-– - ":
            bullet_part = remainder[0]
            i = 1
            while i < len(remainder) and remainder[i] in " \t":
                bullet_part += remainder[i]
                i += 1
        else:
            while i < len(remainder) and (remainder[i].isdigit() or remainder[i] in ".)"):
                bullet_part += remainder[i]
                i += 1
            while i < len(remainder) and remainder[i] in " \t":
                bullet_part += remainder[i]
                i += 1
        remainder = remainder[i:]
    if bullet_part and not bullet_part.endswith(" "):
        bullet_part += " "

    bold_prefix = ""
    bold_font = "times-bold"
    body_text = remainder
    bold_prefix_info = _extract_bold_prefix(text_unit)
    if bold_prefix_info:
        bp_text, bold_font = bold_prefix_info
        bp_stripped = bp_text.strip()
        if remainder.strip().startswith(bp_stripped):
            bold_prefix = bp_text + (" " if not bp_text.endswith(" ") else "")
            body_text = remainder.strip()[len(bp_stripped):].lstrip()
        else:
            bold_prefix = bp_text + " "
            body_text = remainder
        # Ensure exactly one space between prefix and body for both overlay and textbox
        bold_prefix = bold_prefix.rstrip() + " "

    insert_prefix = bullet_part + bold_prefix
    x0, y0, x1, y1 = text_unit.merged_bbox
    if bullet_in_separate_span:
        first_text_span = next((s for s in text_unit.spans if not _is_bullet_span(s)), None)
        text_left_x = first_text_span.bbox[0] if first_text_span else text_unit.spans[0].bbox[2]
        bbox_redact = (float(text_left_x), float(y0), float(x1), float(y1))
    else:
        bbox_redact = (float(x0), float(y0), float(x1), float(y1))
    bbox_insert = insert_bbox_override if insert_bbox_override is not None else bbox_redact
    font_size = font_info.size

    page = doc[page_num]
    temp_doc = fitz.open()
    temp_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)
    page_copy = temp_doc[0]
    rect_redact = fitz.Rect(bbox_redact)
    annot = page_copy.add_redact_annot(rect_redact)
    annot.set_colors(fill=(1, 1, 1))
    page_copy.apply_redactions()

    used_size: float | None = None
    # For skill_append, don't shrink more than 1pt below original (avoid visibly smaller Tools line)
    if insert_bbox_override is not None:
        min_size = max(font_info.size - 1.0, MIN_FONT_SIZE)
    else:
        min_size = MIN_FONT_SIZE
    if bold_prefix:
        # Always ensure exactly one space between bold_prefix and body_text (lstrip on body loses leading space)
        full_text = bold_prefix.rstrip() + " " + body_text.lstrip()
        bold_prefix = bold_prefix.rstrip() + " "  # for overlay/width calc, include trailing space
    elif insert_prefix:
        full_text = insert_prefix + body_text
    else:
        full_text = replacement_text
    text_to_fit = full_text
    while font_size >= min_size:
        rect_insert_test = fitz.Rect(bbox_insert)
        if insert_prefix and not bold_prefix:
            pw = fitz.get_text_length(bullet_part, fontname=font_info.name, fontsize=font_size)
            rect_insert_test = fitz.Rect(
                bbox_insert[0] + pw,
                bbox_insert[1],
                bbox_insert[2],
                bbox_insert[3],
            )
        rc = page_copy.insert_textbox(
            rect_insert_test,
            text_to_fit,
            fontname=font_info.name,
            fontsize=font_size,
            color=font_info.color,
            align=fitz.TEXT_ALIGN_LEFT,
        )
        if rc >= 0:
            used_size = font_size
            break
        font_size -= FONT_SIZE_STEP

    temp_doc.close()

    if used_size is None:
        logger.warning(
            "[pdf_patcher] apply_patch: text does not fit in bbox (min font %.1f)",
            min_size,
        )
        return (
            PatchResult(
                fit_success=False,
                font_size_used=None,
                status="unsafe",
            ),
            doc,
        )

    # White cover approach: draw filled white rectangle over original text
    # (no apply_redactions - it invalidates coordinates for multi-patch)
    page = doc[page_num]
    rect_cover = fitz.Rect(bbox_redact)
    shape = page.new_shape()
    shape.draw_rect(rect_cover)
    shape.finish(width=0, color=None, fill=(1, 1, 1))  # no stroke, white fill
    shape.commit()

    # When using expanded bbox, real page can measure differently; use one step smaller to avoid overflow
    insert_size = used_size
    if insert_bbox_override is not None and used_size > min_size:
        insert_size = max(min_size, used_size - FONT_SIZE_STEP)

    if bold_prefix:
        # Step 1: Insert full text in regular font (handles wrapping)
        rect_insert_real = fitz.Rect(bbox_insert)
        rc_real = page.insert_textbox(
            rect_insert_real,
            full_text,
            fontname=font_info.name,
            fontsize=insert_size,
            color=font_info.color,
            align=fitz.TEXT_ALIGN_LEFT,
        )
        # Step 2: Overlay bold prefix on top (no white-out; bold stroke covers regular)
        bold_y = bbox_insert[1] + insert_size
        page.insert_text(
            fitz.Point(bbox_insert[0], bold_y),
            bold_prefix,
            fontsize=insert_size,
            fontname=bold_font,
            color=font_info.color,
        )
    elif insert_prefix:
        point = fitz.Point(bbox_insert[0], bbox_insert[1] + insert_size)
        if bullet_part:
            page.insert_text(
                point,
                bullet_part,
                fontsize=insert_size,
                fontname=font_info.name,
                color=font_info.color,
            )
            point = fitz.Point(
                point.x + fitz.get_text_length(bullet_part, fontname=font_info.name, fontsize=insert_size),
                point.y,
            )
        rect_body = fitz.Rect(point.x, bbox_insert[1], bbox_insert[2], bbox_insert[3])
        rc_real = page.insert_textbox(
            rect_body,
            body_text,
            fontname=font_info.name,
            fontsize=insert_size,
            color=font_info.color,
            align=fitz.TEXT_ALIGN_LEFT,
        )
    else:
        rect_insert_real = fitz.Rect(bbox_insert)
        rc_real = page.insert_textbox(
            rect_insert_real,
            replacement_text,
            fontname=font_info.name,
            fontsize=insert_size,
            color=font_info.color,
            align=fitz.TEXT_ALIGN_LEFT,
        )
    if rc_real < 0:
        logger.warning(
            "[pdf_patcher] apply_patch: insert_textbox failed on real page rc=%s bbox=%s",
            rc_real,
            list(bbox_insert),
        )
        return (
            PatchResult(
                fit_success=False,
                font_size_used=used_size,
                status="unsafe",
            ),
            doc,
        )
    used_size = insert_size
    logger.info(
        "[pdf_patcher] apply_patch: applied at font_size=%.1f bbox=%s rc=%s",
        used_size,
        list(bbox_insert),
        rc_real,
    )
    return (
        PatchResult(
            fit_success=True,
            font_size_used=used_size,
            status="applied",
        ),
        doc,
    )


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


def patch_pdf(
    original_pdf_bytes: bytes,
    patches: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Patch the PDF with the given list of replacements.
    Returns patched_pdf_bytes, patch_log, and all_safe.
    """
    patch_log: list[dict[str, Any]] = []
    patched_bytes: bytes | None = None

    try:
        doc = fitz.open(stream=original_pdf_bytes, filetype="pdf")
    except Exception as e:
        logger.exception("[pdf_patcher] patch_pdf: failed to open PDF: %s", e)
        for p in patches:
            patch_log.append(
                {
                    "type": p.get("type", "unknown"),
                    "original_text_matched": "",
                    "replacement_text": p.get("replacement_text", ""),
                    "page_number": 0,
                    "bbox": [0, 0, 0, 0],
                    "font_name": "times-roman",
                    "font_size_original": 0.0,
                    "font_size_used": None,
                    "fit_success": False,
                    "status": "not_found",
                }
            )
        return {
            "patched_pdf_bytes": None,
            "patch_log": patch_log,
            "all_safe": False,
        }

    try:
        text_index = build_text_index(doc)

        # Phase 1: Match all patches against the ORIGINAL text index (no rebuild between patches)
        match_results: list[dict[str, Any]] = []
        for patch_idx, patch in enumerate(patches):
            patch_type = patch.get("type", "bullet_rewrite")
            original_text = patch.get("original_text", "")
            replacement_text = patch.get("replacement_text", "")

            threshold = 0.75 if patch_type == "skill_append" else 0.85
            match, _ = find_match(original_text, text_index, threshold=threshold)
            if match is None:
                logger.warning(
                    "[pdf_patcher] patch_pdf: no match for original_text=%r",
                    original_text[:80],
                )
                match_results.append(
                    {
                        "patch": patch,
                        "patch_idx": patch_idx,
                        "match": None,
                        "font_info": None,
                        "insert_bbox_override": None,
                    }
                )
                continue

            font_info = get_font_info(match.spans)
            insert_bbox_override = None
            if patch_type == "skill_append":
                insert_bbox_override = _expand_bbox_for_skill_append(
                    match, text_index, font_info.size
                )
            match_results.append(
                {
                    "patch": patch,
                    "patch_idx": patch_idx,
                    "match": match,
                    "font_info": font_info,
                    "insert_bbox_override": insert_bbox_override,
                }
            )

        # Phase 2: Sort by page then bottom-to-top (negative y) so earlier patches don't shift coordinates
        def _sort_key(mr: dict[str, Any]) -> tuple[int, float]:
            m = mr.get("match")
            if m is None:
                return (9999, 0.0)
            return (m.page_num, -m.merged_bbox[1])

        match_results.sort(key=_sort_key)

        # Phase 3: Apply all patches using pre-computed matches (no index rebuild)
        log_by_idx: dict[int, dict[str, Any]] = {}
        for mr in match_results:
            patch = mr["patch"]
            patch_idx = mr["patch_idx"]
            patch_type = patch.get("type", "bullet_rewrite")
            replacement_text = patch.get("replacement_text", "")

            if mr["match"] is None:
                log_by_idx[patch_idx] = {
                    "type": patch_type,
                    "original_text_matched": "",
                    "replacement_text": replacement_text,
                    "page_number": 0,
                    "bbox": [0, 0, 0, 0],
                    "font_name": "times-roman",
                    "font_size_original": 0.0,
                    "font_size_used": None,
                    "fit_success": False,
                    "status": "not_found",
                }
                continue

            match = mr["match"]
            font_info = mr["font_info"]
            insert_bbox_override = mr["insert_bbox_override"]

            result, doc = apply_patch(
                doc,
                match.page_num,
                match,
                replacement_text,
                font_info,
                preserve_bullet=(patch_type == "bullet_rewrite"),
                insert_bbox_override=insert_bbox_override,
            )
            log_by_idx[patch_idx] = {
                "type": patch_type,
                "original_text_matched": match.full_text,
                "replacement_text": replacement_text,
                "page_number": match.page_num + 1,
                "bbox": list(match.merged_bbox),
                "font_name": font_info.name,
                "font_size_original": font_info.size,
                "font_size_used": result.font_size_used,
                "fit_success": result.fit_success,
                "status": result.status,
            }

        patch_log = [log_by_idx[i] for i in range(len(patches))]

        patched_bytes = doc.write()
    except Exception as e:
        logger.exception("[pdf_patcher] patch_pdf: error during patching: %s", e)
        patched_bytes = None
        for entry in patch_log:
            if entry.get("status") == "applied":
                pass
            elif "status" not in entry:
                entry["status"] = "not_found"
    finally:
        doc.close()

    all_safe = all(p.get("status") == "applied" for p in patch_log)
    return {
        "patched_pdf_bytes": patched_bytes,
        "patch_log": patch_log,
        "all_safe": all_safe,
    }
