"""
Landability scorer for the job board ranking pipeline (phase 1).

Pure function. Reads the same job and user-intent inputs as the old
level + location gates in intent_gates.py, but emits a 0..100 score
instead of a binary drop decision.

Phase 1 wiring strategy:
  - Hard drops at landability < `hard_drop.landability_below` (default 15)
    replace the OR of the old level + location gates.
  - Above 15, jobs are kept and the score becomes part of the composite.
  - In `render_mode: "legacy"`, the composite weight for landability is 0,
    so the score is recorded for telemetry but does not change ordering.

Penalty table (provisional, locked after calibration review):
  Level (only when grad_year set AND months_until_grad <= 18):
    structured.experience_level matches non-entry          -60
    title matches PhD regex                                -65
    title matches senior regex (no intern/junior override) -50
    first 3 requirements contain PhD                       -65
    first 3 requirements contain "5+ years" etc.           -45
    (Take MAX of firing level signals, not sum)
  Location (only when preferred_locations set AND job not remote
            AND job location non-empty AND not "remote/anywhere"):
    No preference token AND no state-code match            -65
  Confidence shave (always):
    structured.experience_level is None                    -3

The signal detection helpers come from intent_gates.py so the regex
definitions stay in one place.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Dict, List, Tuple

from backend.app.utils.intent_gates import (
    _NON_ENTRY_LEVEL_VALUES,
    _PHD_RE,
    _SENIOR_TITLE_RE,
    _extract_state_codes,
    _tokenize_preference,
)


# Provisional penalties. Tuned via calibration before lock.
_LEVEL_PENALTY_STRUCTURED   = 60
_LEVEL_PENALTY_TITLE_PHD    = 65
_LEVEL_PENALTY_TITLE_SENIOR = 50
_LEVEL_PENALTY_REQ_PHD      = 65
_LEVEL_PENALTY_REQ_YEARS    = 45

_LOCATION_PENALTY_NO_MATCH  = 65

_CONFIDENCE_SHAVE_NO_LEVEL  = 3


_INTERN_OVERRIDE_RE = re.compile(
    r"\b(intern|internship|new\s*grad|entry|junior|jr)\b",
    re.IGNORECASE,
)

_YEARS_REQ_RE = re.compile(
    r"\b([5-9]|10|1[0-9])\+?\s*(years?|yrs?)\b",
    re.IGNORECASE,
)


def _level_penalty(job: dict, intent: dict) -> Tuple[int, List[str]]:
    """Return (penalty as negative int, firing-signal tags).

    Mirrors _gate_by_level: only active when graduation_year is set and the
    user is within 18 months of graduation. Among firing level signals, take
    the maximum single-signal penalty (not the sum), because one rule firing
    is one piece of evidence.
    """
    grad_year = intent.get("graduation_year")
    if grad_year is None:
        return 0, []

    now_utc = datetime.now(timezone.utc)
    grad_month = intent.get("graduation_month") or 5
    months_until_grad = (grad_year - now_utc.year) * 12 + (grad_month - now_utc.month)
    if months_until_grad > 18:
        return 0, []

    firing: List[str] = []
    penalty = 0

    structured = job.get("structured") or {}
    level = structured.get("experience_level")
    if isinstance(level, str):
        lv = level.lower().strip()
        for marker in _NON_ENTRY_LEVEL_VALUES:
            if marker in lv:
                firing.append("level:structured")
                penalty = max(penalty, _LEVEL_PENALTY_STRUCTURED)
                break

    title = job.get("title") or ""
    if isinstance(title, str):
        if _PHD_RE.search(title):
            firing.append("level:title_phd")
            penalty = max(penalty, _LEVEL_PENALTY_TITLE_PHD)
        if _SENIOR_TITLE_RE.search(title) and not _INTERN_OVERRIDE_RE.search(title):
            firing.append("level:title_senior")
            penalty = max(penalty, _LEVEL_PENALTY_TITLE_SENIOR)

    reqs = structured.get("requirements") or []
    if isinstance(reqs, list):
        for req in reqs[:3]:
            if not isinstance(req, str):
                continue
            rl = req.lower()
            if _PHD_RE.search(rl):
                firing.append("level:req_phd")
                penalty = max(penalty, _LEVEL_PENALTY_REQ_PHD)
            if _YEARS_REQ_RE.search(rl):
                firing.append("level:req_years")
                penalty = max(penalty, _LEVEL_PENALTY_REQ_YEARS)

    return -penalty, firing


def _location_penalty(job: dict, intent: dict) -> Tuple[int, List[str]]:
    """Return (penalty, firing tags). Single penalty when no match found.

    Mirrors _gate_by_location: only active when preferred_locations set,
    job is not remote-friendly, location text is non-empty and does not
    contain "remote"/"anywhere".
    """
    preferred = intent.get("preferred_locations") or []
    if not preferred:
        return 0, []

    if job.get("remote_derived") or job.get("remote"):
        return 0, []

    raw_loc = job.get("location")
    if isinstance(raw_loc, dict):
        loc_text = " ".join(
            str(v).lower() for v in raw_loc.values() if isinstance(v, str)
        )
    elif isinstance(raw_loc, str):
        loc_text = raw_loc.lower()
    else:
        return 0, []

    if not loc_text.strip():
        return 0, []

    if "remote" in loc_text or "anywhere" in loc_text or "any location" in loc_text:
        return 0, []

    # City-token match (bidirectional)
    for pref in preferred:
        for tok in _tokenize_preference(pref):
            if tok in loc_text:
                return 0, []
            if loc_text in tok:
                return 0, []

    # State-code fallback
    pref_states: set = set()
    for pref in preferred:
        pref_states.update(_extract_state_codes(pref))
    if pref_states:
        loc_states = set(_extract_state_codes(loc_text))
        if loc_states & pref_states:
            return 0, []

    return -_LOCATION_PENALTY_NO_MATCH, ["location:no_match"]


def _confidence_shave(job: dict) -> Tuple[int, List[str]]:
    structured = job.get("structured") or {}
    if structured.get("experience_level") is None:
        return -_CONFIDENCE_SHAVE_NO_LEVEL, ["confidence:no_level"]
    return 0, []


def score_landability(job: dict, intent: dict, profile: Dict | None = None) -> dict:
    """
    Compute landability 0..100 for a (job, user intent) pair.

    `profile` is the active ranking config. Currently unused. Reserved so
    we can move penalty values into the config in phase 2 without changing
    this call signature.

    Returns:
      {
        "score":      int,        # 0..100, clamped
        "components": {
          "base":             int,   # 100
          "level_penalty":    int,   # 0 or negative
          "location_penalty": int,   # 0 or negative
          "confidence_shave": int,   # 0 or negative
        },
        "fired":      [str],      # firing signal tags
        "applies": {
          "level":    bool,       # was the level rule active?
          "location": bool,       # was the location rule active?
        }
      }
    """
    _ = profile  # reserved for phase 2

    level_pen, level_fired = _level_penalty(job, intent)
    loc_pen, loc_fired = _location_penalty(job, intent)
    shave_pen, shave_fired = _confidence_shave(job)

    score = 100 + level_pen + loc_pen + shave_pen
    score = max(0, min(100, score))

    return {
        "score": score,
        "components": {
            "base": 100,
            "level_penalty": level_pen,
            "location_penalty": loc_pen,
            "confidence_shave": shave_pen,
        },
        "fired": level_fired + loc_fired + shave_fired,
        "applies": {
            "level": intent.get("graduation_year") is not None,
            "location": bool(intent.get("preferred_locations")),
        },
    }
