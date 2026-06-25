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
from typing import Literal, TypedDict

from app.services.openai_client import get_openai_client

logger = logging.getLogger(__name__)

PARSER_MODEL = "gpt-4o-mini"
MAX_BRIEF_CHARS = 2000

# Loop modes:
#   "people" — autonomous networking (find professionals, draft outreach)
#   "roles"  — autonomous job-search (find postings, optionally outreach
#              founders at small companies)
#   "both"   — pursue BOTH pipelines in a single Loop. Returned when the
#              brief explicitly asks for both (e.g. "internships AND coffee
#              chats", "find me jobs to apply to plus analysts I can ask
#              for referrals"). Different from "people" + "roles" combined
#              into one Loop manually because the planner can balance the
#              two pipelines against one credit budget.
# Ambiguous briefs return None; the wizard's mode picker decides.
LoopMode = Literal["people", "roles", "both"]


class ParsedBrief(TypedDict):
    companies: list[str]
    industries: list[str]
    roles: list[str]
    locations: list[str]
    emailPurpose: str | None
    constraints: list[str]
    targetCount: int | None
    mode: LoopMode | None


EMPTY_BRIEF: ParsedBrief = {
    "companies": [],
    "industries": [],
    "roles": [],
    "locations": [],
    "emailPurpose": None,
    "constraints": [],
    "targetCount": None,
    "mode": None,
}


SYSTEM_PROMPT = """You extract structured search parameters from a college student's natural-language brief about networking or job-hunting.

The student is using an autonomous agent that can either (a) find professionals to email for coffee chats / referrals / advice, or (b) find open job postings to apply to. Your job is to pull out:
- companies: specific company names mentioned (expand abbreviations: "JPM" -> "JPMorgan", "GS" -> "Goldman Sachs")
- industries: broader industry categories if no specific company is given (e.g. "Investment Banking", "Consulting", "Technology")
- roles: job titles or role types they want (e.g. "Analyst", "Product Manager", "SWE Intern")
- locations: cities, regions, or "remote" if mentioned
- emailPurpose: a short phrase describing what the outreach is about (e.g. "summer internship", "full-time recruiting", "advice on breaking into PE")
- constraints: any explicit filters (e.g. "alumni only", "must be hiring now", "no recruiters")
- targetCount: if the user said a specific number of people they want, return it; otherwise null
- mode: classify the intent of the brief. Return:
    * "roles" if the student wants to find open POSTINGS to apply to. Signals: "find me internships", "looking for [role] roles", "apply to", "summer 2027 SWE internships", "open positions", "job postings", "hiring now".
    * "people" if the student wants to find PROFESSIONALS to email for networking. Signals: "reach out about", "coffee chat with", "ask for advice", "10 analysts at [bank]", "connect with", "referral from".
    * "both" if the brief explicitly asks for BOTH job postings AND networking contacts in the same Loop. The brief must make it clear the student wants the agent to do both jobs — not just two separate things mentioned in passing. Signals: "X and people to network with", "internships AND coffee chats", "jobs to apply to plus analysts I can ask", "find roles for me but also connect me with [profession]", "looking for [job] + warm intros". When the brief uses an explicit conjunction (and, plus, +, AND, also) joining a networking ask to a job-search ask, return "both".
    * null if the brief is ambiguous or could plausibly be either.

Examples of "both":
  - "I want summer SWE internships at fintech startups in NYC plus people to coffee chat with"
    -> mode="both" (explicit "plus" joining job search to networking)
  - "Find me open analyst roles AND connect me with current analysts at the same banks"
    -> mode="both" (explicit "AND" joining find-jobs to networking)
  - "Looking for marketing internships and also want intros to PMs at those companies"
    -> mode="both" (explicit "also want intros" joining job to networking)

Examples that are NOT "both" (return single mode):
  - "I want SWE internships at fintech startups" -> mode="roles" (no networking ask)
  - "10 analysts at Goldman for coffee chats" -> mode="people" (no postings ask)
  - "Find me a job" -> mode="roles" (no networking ask, even though brief is short)

Rules:
- Only include companies/roles/industries actually mentioned. Do not invent.
- Use proper, canonical names ("Morgan Stanley" not "MS", "McKinsey" not "MCK").
- If the brief is empty or gibberish, return empty arrays and null fields including mode=null.
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

    raw_mode = raw.get("mode")
    mode: LoopMode | None = raw_mode if raw_mode in ("people", "roles", "both") else None

    return {
        "companies": as_str_list(raw.get("companies"))[:20],
        "industries": as_str_list(raw.get("industries"))[:10],
        "roles": as_str_list(raw.get("roles"))[:10],
        "locations": as_str_list(raw.get("locations"))[:10],
        "emailPurpose": email_purpose,
        "constraints": as_str_list(raw.get("constraints"))[:10],
        "targetCount": target_count,
        "mode": mode,
    }
