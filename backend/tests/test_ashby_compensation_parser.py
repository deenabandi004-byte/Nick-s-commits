"""Unit tests for backend.pipeline.fetcher._parse_ashby_compensation.

Locks the five branches the parser must cover so a future refactor
cannot silently regress salary extraction for Ashby jobs.

Shapes here mirror live Ashby API responses captured against
openai / ramp / notion on 2026-06-02 with ?includeCompensation=true.
"""
from backend.pipeline.fetcher import _parse_ashby_compensation


def test_usd_year_happy_path():
    """OpenAI shape: USD Salary on a 1 YEAR interval."""
    comp = {
        "summaryComponents": [
            {
                "compensationType": "Salary",
                "interval": "1 YEAR",
                "currencyCode": "USD",
                "minValue": 257000,
                "maxValue": 335000,
            },
            {
                "compensationType": "EquityCashValue",
                "interval": "1 YEAR",
                "currencyCode": "USD",
                "minValue": None,
                "maxValue": None,
            },
        ],
    }
    assert _parse_ashby_compensation(comp) == (257000.0, 335000.0, "YEAR")


def test_usd_hour_happy_path():
    """OpenAI also has a handful of 1 HOUR intervals for contract roles."""
    comp = {
        "summaryComponents": [
            {
                "compensationType": "Salary",
                "interval": "1 HOUR",
                "currencyCode": "USD",
                "minValue": 65,
                "maxValue": 95,
            },
        ],
    }
    assert _parse_ashby_compensation(comp) == (65.0, 95.0, "HOUR")


def test_non_usd_skips():
    """Ramp has GBP and CAD postings. Skip rather than mislabel as USD."""
    comp = {
        "summaryComponents": [
            {
                "compensationType": "Salary",
                "interval": "1 YEAR",
                "currencyCode": "GBP",
                "minValue": 80000,
                "maxValue": 110000,
            },
        ],
    }
    assert _parse_ashby_compensation(comp) == (None, None, None)


def test_unsupported_interval_skips():
    """Ramp has '1 MONTH' intervals. Normalizer only knows YEAR / HOUR;
    annualizing monthly correctly is a separate workstream. Skip for now."""
    comp = {
        "summaryComponents": [
            {
                "compensationType": "Salary",
                "interval": "1 MONTH",
                "currencyCode": "USD",
                "minValue": 8000,
                "maxValue": 12000,
            },
        ],
    }
    assert _parse_ashby_compensation(comp) == (None, None, None)


def test_equity_only_skips():
    """Some roles disclose equity but not base salary. Skip cleanly."""
    comp = {
        "summaryComponents": [
            {
                "compensationType": "EquityPercentage",
                "interval": "NONE",
                "currencyCode": None,
                "minValue": None,
                "maxValue": None,
            },
        ],
    }
    assert _parse_ashby_compensation(comp) == (None, None, None)


def test_none_or_missing_compensation():
    """Defensive: None, empty dict, wrong types all return null tuple."""
    assert _parse_ashby_compensation(None) == (None, None, None)
    assert _parse_ashby_compensation({}) == (None, None, None)
    assert _parse_ashby_compensation({"summaryComponents": None}) == (None, None, None)
    assert _parse_ashby_compensation({"summaryComponents": "not a list"}) == (None, None, None)
    assert _parse_ashby_compensation("not a dict") == (None, None, None)
