"""Salary text parser (tier 2 of the salary enricher).

Parses free-text salary strings extracted by Firecrawl into structured
{min, max, period, display} for the job document's `salary` field.

Honest-blank discipline: when the input is empty, non-USD, ambiguous, or
fails sanity checks, the parser returns None. The backfill writer treats
None as "clear any prior tier-2 value" to keep results idempotent and
prevent stale numbers from carrying forward.

Multi-range strings (anything with ";") get FULL-SPAN treatment: min of
all sub-ranges to max of all sub-ranges. No zone qualifier preserved.
Reason: live-data verification on 207 multi-range parses (2026-06-02)
showed the first sub-range is HCOL-first only ~95% of the time. Okta,
Brex, Airtable, and Carta have postings where the first range is the
LOWER tier (remote / SLC / Seattle / non-SF), so "take first range"
systematically understated those by $15-$40k. Full-span is never wrong:
the displayed range covers what the role pays across all listed sub-ranges
and locations. Side effect: ranges look broader than any single zone
would suggest, but the chip never lies about the actual pay band.

Real-data format distribution observed on 200 live samples 2026-06-02:
  97.5% range_with_dollar (e.g. "$129,000 - $152,000 USD")
   1.5% single_dollar     (rejected, single value not a range)
   1.0% non_usd           (rejected, currency mismatch)

Bugs fixed after first dry-run on 17,313 active jobs 2026-06-02:
  - No-$-prefix parsing when "USD" present (was losing ~250 jobs)
  - Zero-width ranges ($110k - $110k) now accepted as fixed-comp single
  - Level/Year/Tier ladder splits now span full range
  - Sanity threshold tightened from >10x to >8x
  - Weekly rates and sign-on bonuses now rejected as ambiguous

Bugs fixed after raw-case review of 6,092 tier-2 successes 2026-06-02:
  - Bare-digit large numbers like "$65000" were truncated to "$650" by the
    comma-format regex's greedy {1,3} match; now the comma-format
    alternative REQUIRES at least one ,XXX group and bare digits fall
    cleanly to the simpler alternative
  - Annual salaries below $5,000 now rejected (catches "$20.10-$70.40"
    style strings that lack a period indicator and parsed as annual cents)
  - Multi-range full-span replaces take-first-range to eliminate the
    ~4-6% systematic understatement when first sub-range is not HCOL
"""

from __future__ import annotations

import re
from typing import Optional


_NON_USD_TOKENS = (
    "£", "€", "¥", "kr",
    " gbp", "(gbp", "[gbp", " eur", "(eur", "[eur",
    " cad", "(cad", "[cad", " aud", "(aud", "[aud",
    "cad ", "gbp ", "eur ", "aud ",
)

_AMBIGUOUS_MARKERS = (
    "doe",
    "depends on experience",
    "competitive",
    "negotiable",
    "not disclosed",
    "not provided",
    "not specified",
    "tbd",
    "up to",
    "starting at",
    # Weekly rate not currently supported by the normalizer
    "/week",
    "/wk",
    "per week",
    "weekly",
    # Bonus + base contamination produces wrong-but-confident ranges
    "sign-on",
    "signing bonus",
    "sign on bonus",
)

_HOURLY_RE = re.compile(r"(/\s*hr|/\s*hour|per\s*hour|\bhourly\b)", re.IGNORECASE)

# Dollar amount: requires $ prefix. Captures (digits, optional k/m suffix).
# First alternative requires at least one ,XXX group so bare-digit numbers
# like "$65000" fall through to the second alternative (which captures all
# digits) instead of being truncated to "$650" by the first alternative's
# greedy 1-to-3-digit prefix.
_AMOUNT_DOLLAR_RE = re.compile(
    r"\$\s*([0-9]{1,3}(?:[,][0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*([kKmM])?"
)

# Bare comma-formatted number fallback. Used ONLY when "USD" is in the
# string and the $-required pattern found nothing. Requires at least one
# thousands separator so years, phone numbers, etc. don't match.
_AMOUNT_BARE_RE = re.compile(
    r"\b([0-9]{1,3}(?:[,][0-9]{3})+(?:\.[0-9]+)?)\s*([kKmM])?"
)

# For zone/city splits, take the first range out of multi-range strings.
_FIRST_RANGE_SPLIT = re.compile(r"[;]")

# Parenthesized qualifier (e.g. "(Zone 1)") to preserve in display.
_PAREN_QUALIFIER_RE = re.compile(r"\(([^)]+)\)")


def _has_non_usd_currency(t: str) -> bool:
    if "£" in t or "€" in t or "¥" in t:
        return True
    tl = t.lower()
    for tok in _NON_USD_TOKENS:
        if tok in tl:
            return True
    return False


def _has_ambiguous_marker(t: str) -> bool:
    tl = t.lower()
    for marker in _AMBIGUOUS_MARKERS:
        if marker in tl:
            return True
    return False


def _apply_multiplier(value: float, suffix: Optional[str]) -> float:
    if not suffix:
        return value
    s = suffix.lower()
    if s == "k":
        return value * 1_000
    if s == "m":
        return value * 1_000_000
    return value


def _extract_amounts(text: str, allow_no_dollar: bool = False) -> list[float]:
    """Return dollar amounts in document order. Honors k/m suffix.

    When allow_no_dollar is True and the $-required pattern finds nothing,
    falls back to bare comma-formatted numbers. Only enabled when the
    caller is confident the string is USD (e.g., 'USD' suffix present).
    """
    out: list[float] = []
    for m in _AMOUNT_DOLLAR_RE.finditer(text):
        try:
            val = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        out.append(_apply_multiplier(val, m.group(2)))
    if out or not allow_no_dollar:
        return out
    for m in _AMOUNT_BARE_RE.finditer(text):
        try:
            val = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        out.append(_apply_multiplier(val, m.group(2)))
    return out


def _normalize_dashes(t: str) -> str:
    return t.replace("—", "-").replace("–", "-")


def _format_display(mn: int, mx: int, period: str, qualifier: str = "") -> str:
    """Build the chip display string. Handles single-value case (mn == mx)."""
    suffix = f" {qualifier.strip()}" if qualifier and qualifier.strip() else ""
    if period == "hourly":
        hr_min = mn / 2080
        hr_max = mx / 2080
        if hr_min == hr_max:
            return f"${hr_min:.0f}/hr{suffix}"
        return f"${hr_min:.0f}/hr - ${hr_max:.0f}/hr{suffix}"
    # Annual
    if mn == mx:
        if mn % 1000 == 0:
            return f"${mn // 1000}k{suffix}"
        return f"${mn:,}{suffix}"
    if mn % 1000 == 0 and mx % 1000 == 0:
        return f"${mn // 1000}k - ${mx // 1000}k{suffix}"
    return f"${mn:,} - ${mx:,}{suffix}"


def parse_salary_text(text: Optional[str]) -> Optional[dict]:
    """
    Parse a free-text salary string into a structured dict.

    Returns dict on clean success:
      {
        "min":     int,        # annualized
        "max":     int,        # annualized (== min for fixed-comp roles)
        "period":  "annual" | "hourly",
        "display": str,        # chip text; "$Xk" for fixed comp, range otherwise
      }

    Returns None on any of:
      - empty / None / whitespace input
      - non-USD currency mentioned
      - ambiguous text marker present (DOE, weekly, sign-on bonus, etc.)
      - fewer than 2 dollar amounts found
      - max < min, max > 8 * min, or min <= 0
    """
    if not isinstance(text, str):
        return None
    t = text.strip()
    if not t:
        return None

    if _has_non_usd_currency(t):
        return None
    if _has_ambiguous_marker(t):
        return None

    normalized = _normalize_dashes(t)
    allow_no_dollar = "USD" in t.upper()

    # Multi-range strings (containing ";") get FULL-SPAN treatment: min of
    # all sub-ranges to max of all sub-ranges. Single-range strings take
    # the two amounts in document order and preserve any parenthesized
    # qualifier in the display.
    is_multi_range = ";" in normalized

    amounts = _extract_amounts(normalized, allow_no_dollar=allow_no_dollar)
    if len(amounts) < 2:
        return None

    if is_multi_range:
        mn_raw = min(amounts)
        mx_raw = max(amounts)
        qualifier = ""
    else:
        mn_raw = amounts[0]
        mx_raw = amounts[1]
        q_match = _PAREN_QUALIFIER_RE.search(normalized)
        qualifier = f"({q_match.group(1)})" if q_match else ""

    # Sanity checks: accept fixed-comp (mn == mx); reject inverted;
    # reject extreme spreads likely caused by equity/bonus contamination.
    if mn_raw <= 0 or mx_raw < mn_raw:
        return None
    if mn_raw > 0 and mx_raw > 8 * mn_raw:
        return None

    is_hourly = bool(_HOURLY_RE.search(normalized))
    period = "hourly" if is_hourly else "annual"
    multiplier = 2080 if is_hourly else 1
    mn = int(round(mn_raw * multiplier))
    mx = int(round(mx_raw * multiplier))

    # Implausibly-low annual salary floor: catches strings like
    # "$20.10-$70.40" with no period indicator that parsed as annual
    # dollars when they were likely hourly with no /hr suffix.
    if period == "annual" and mx < 5000:
        return None

    return {
        "min": mn,
        "max": mx,
        "period": period,
        "display": _format_display(mn, mx, period, qualifier),
    }
