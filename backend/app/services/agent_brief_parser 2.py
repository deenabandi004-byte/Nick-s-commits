"""
Brief parser — turns the user's natural-language Loop brief into structured
search parameters the planner can use.

User types something like:
    "10 AI analysts at Goldman, JPMorgan, and Morgan Stanley.
     Reach out about summer internship recruiting."

We turn it into:
    {
        "companies": ["Goldman Sachs", "JPMorgan", "Morgan Stanley"],
        "industries": ["Investment Banking"],
        "roles": ["AI Analyst"],
        "locations": [],
        "emailPurpose": "summer internship recruiting",
        "constraints": [],
        "targetCount": 10
    }

Used by:
    - POST /api/agent/brief (live parse for the setup screen)
    - _run_cycle (read from config.briefParsed when present)
"""
from __future__ import annotations

import json
import logging
from typing import TypedDict

from app.services.openai_client import get_openai_client

logger = logging.getLogger(__name__)

PARSER_MODEL = "gpt-4o-mini"
MAX_BRIEF_CHARS = 2000


class ParsedBrief(TypedDict):
    companies: list[str]
    industries: list[str]
    roles: list[str]
    locations: list[str]
    emailPurpose: str | None
    constraints: list[str]
    targetCount: int | None


EMPTY_BRIEF: ParsedBrief = {
    "companies": [],
    "industries": [],
    "roles": [],
    "locations": [],
    "emailPurpose": None,
    "constraints": [],
    "targetCount": None,
}


SYSTEM_PROMPT = """You extract structured search parameters from a job seeker's natural-language brief.

The brief describes who they want to reach out to and why. Your job is to pull out:
- companies: specific company names mentioned (expand abbreviations: "JPM" -> "JPMorgan", "GS" -> "Goldman Sachs")
- industries: broader industry categories if no specific company is given (e.g. "Investment Banking", "Consulting", "Technology")
- roles: job titles or role types they want to reach (e.g. "Analyst", "Product Manager", "AI Researcher")
- locations: cities, regions, or "remote" if mentioned
- emailPurpose: a short phrase describing what the outreach is about (e.g. "summer internship", "full-time recruiting", "advice on breaking into PE")
- constraints: any explicit filters (e.g. "alumni only", "must be hiring now", "no recruiters")
- targetCount: if the user said a specific number of people they want, return it; otherwise null

Rules:
- Only include companies/roles/industries actually mentioned. Do not invent.
- Use proper, canonical names ("Morgan Stanley" not "MS", "McKinsey" not "MCK").
- If the brief is empty or gibberish, return empty arrays and null fields.
- Return STRICT JSON matching the schema. No prose."""


ParseStatus = str  # "ok" | "empty" | "failed"


def parse_brief(brief_text: str) -> tuple[ParsedBrief, ParseStatus]:
    """Parse a free-text brief into structured search parameters.

    Returns (parsed, status):
      - ("ok",     parsed): LLM returned valid JSON we normalized
      - ("empty",  EMPTY_BRIEF): user submitted empty input — not an error
      - ("failed", EMPTY_BRIEF): LLM call failed (client missing, bad JSON,
        rate limit, etc.). Callers should surface this so the user knows the
        parse didn't happen, instead of silently treating it as empty input.
    """
    text = (brief_text or "").strip()
    if not text:
        return dict(EMPTY_BRIEF), "empty"  # type: ignore[return-value]

    if len(text) > MAX_BRIEF_CHARS:
        text = text[:MAX_BRIEF_CHARS]

    client = get_openai_client()
    if not client:
        logger.warning("Brief parser: OpenAI client unavailable")
        return dict(EMPTY_BRIEF), "failed"  # type: ignore[return-value]

    raw = "{}"
    try:
        response = client.chat.completions.create(
            model=PARSER_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=600,
        )
        raw = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.exception("Brief parser: invalid JSON from LLM, raw=%s", raw[:200])
        return dict(EMPTY_BRIEF), "failed"  # type: ignore[return-value]
    except Exception:
        logger.exception("Brief parser: LLM call failed")
        return dict(EMPTY_BRIEF), "failed"  # type: ignore[return-value]

    return _normalize(parsed), "ok"


def _normalize(raw: dict) -> ParsedBrief:
    """Coerce LLM output into the canonical shape; tolerate missing keys."""

    def as_str_list(v) -> list[str]:
        if not isinstance(v, list):
            return []
        out = []
        seen = set()
        for item in v:
            if not isinstance(item, str):
                continue
            s = item.strip()
            if s and s.lower() not in seen:
                seen.add(s.lower())
                out.append(s)
        return out

    target_count = raw.get("targetCount")
    if isinstance(target_count, (int, float)):
        target_count = max(1, min(int(target_count), 50))
    else:
        target_count = None

    email_purpose = raw.get("emailPurpose")
    if not isinstance(email_purpose, str) or not email_purpose.strip():
        email_purpose = None
    else:
        email_purpose = email_purpose.strip()[:200]

    return {
        "companies": as_str_list(raw.get("companies"))[:20],
        "industries": as_str_list(raw.get("industries"))[:10],
        "roles": as_str_list(raw.get("roles"))[:10],
        "locations": as_str_list(raw.get("locations"))[:10],
        "emailPurpose": email_purpose,
        "constraints": as_str_list(raw.get("constraints"))[:10],
        "targetCount": target_count,
    }
