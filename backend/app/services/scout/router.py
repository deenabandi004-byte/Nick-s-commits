"""Scout pre-LLM router (Phase 4, Tier A).

Cheap, high-precision regex rules that resolve a Scout turn before any LLM
call. try_pre_llm returns a navigate tool-call dict - the same {name, args}
shape the LLM path produces, so handle_chat runs it through the identical
_build_tool_response - when a rule fires, else None so handle_chat falls
through to the model.

Precision over recall: a false positive (a wrong navigation) is worse than a
miss (a clean LLM fallback). Every rule checks that the matched content is the
PRIMARY intent of the message, not a mention buried in a longer question,
using a word-budget heuristic around the match.

Tier B (the embedding caches) is a separate concern and lands in its own
module; this file is Tier A only.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

from app.services.scout.page_registry import ROUTE_ALIASES, valid_routes

# A regex hit is, by construction, certain about the route it resolved.
_REGEX_CONFIDENCE = 1.0

# If more than this many words of non-URL, non-route content surround a match,
# the match is probably context inside a larger question, so fall through to
# the LLM rather than risk a wrong navigation.
_WORD_BUDGET = 12

_URL_RE = re.compile(r"https?://[^\s]+", re.I)

_LINKEDIN_RE = re.compile(
    r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+/?",
    re.I,
)

_NAV_VERB_RE = re.compile(
    r"\b(?:open|go to|take me to|bring me to|navigate to|show me|pull up|jump to)\b",
    re.I,
)

# A "find people at a company" request: a lead-in verb, then
# <role> at <company> [in <location>], as the whole message. "email" and
# "message" are deliberately excluded - "email my saved contacts at google" is
# not a contact search, and a bare "email <company> <location> <role>" (no
# delimiter) cannot be slotted by regex without a gazetteer. Those stay the
# LLM's job. "find out ..." is excluded so "find out what happened at the
# meeting" does not mis-fire as a contact search.
_FIND_PEOPLE_RE = re.compile(
    r"^\s*(?:find(?!\s+out\b)|reach out to|connect (?:me )?with|looking for|"
    r"look for|get in touch with|network with|need to connect with)"
    r"\s+(?:me\s+)?(.+?)\s+at\s+(.+?)\s*$",
    re.I,
)

# Generic "who" words in a find-people request that name no real job title;
# when the role slot is one of these, leave job_title unset for the user.
_GENERIC_PEOPLE_WORDS = {
    "people", "contacts", "someone", "anyone", "somebody", "connections",
    "contact", "connection", "person", "folks",
}


def _word_count(text: str) -> int:
    return len([w for w in re.split(r"\s+", text) if w.strip()])


def _surrounding_word_count(message: str, *matched: str) -> int:
    """Count words in `message` outside the matched spans and outside any URL.

    The precision guard: a short message that is basically just the match
    fires; a long sentence with the match embedded does not.
    """
    leftover = message
    for span in matched:
        if span:
            leftover = leftover.replace(span, " ", 1)
    leftover = _URL_RE.sub(" ", leftover)
    return _word_count(leftover)


def _navigate_plan(
    *,
    route: str,
    prefill: Dict[str, str],
    reasoning: str,
    user_was_imperative: bool,
    auto_submit: bool = False,
) -> Dict[str, Any]:
    """A navigate tool-call dict, identical in shape to what the LLM path
    produces, so _build_tool_response handles a regex hit the same way."""
    return {
        "name": "navigate",
        "args": {
            "route": route,
            "prefill": prefill,
            "reasoning": reasoning,
            "confidence": _REGEX_CONFIDENCE,
            "user_was_imperative": user_was_imperative,
            "auto_submit": auto_submit,
        },
    }


def _resolve_route_phrase(phrase: str) -> Optional[str]:
    """Map a short destination phrase to a registry route, via the curated
    alias map or a route name derived from the path itself."""
    phrase = phrase.strip().lower()
    if not phrase:
        return None
    if phrase in ROUTE_ALIASES:
        return ROUTE_ALIASES[phrase]
    # Derive a name from the path: "/meeting-prep" -> "meeting prep".
    for route in valid_routes():
        if phrase == route.lstrip("/").replace("/", " ").replace("-", " "):
            return route
    return None


# --- Rule (a): a pasted LinkedIn profile URL --------------------------------

def _rule_linkedin_url(message: str) -> Optional[Dict[str, Any]]:
    # findall on this group-less pattern returns full match strings.
    matches = _LINKEDIN_RE.findall(message)
    if len(matches) != 1:
        return None  # zero matches, or 2+ (ambiguous which profile)
    raw = matches[0]
    # The URL must be the primary content, not context inside a question.
    if _surrounding_word_count(message, raw) > _WORD_BUDGET:
        return None
    url = raw.rstrip("/.,);:")
    return _navigate_plan(
        route="/coffee-chat-prep",
        prefill={"linkedin_url": url},
        reasoning="Open meeting prep for this LinkedIn profile.",
        user_was_imperative=False,
    )


# --- Rule (b): a direct route mention behind a navigation verb --------------

def _rule_route_mention(message: str) -> Optional[Dict[str, Any]]:
    verb = _NAV_VERB_RE.search(message)
    if not verb:
        return None
    # Words before the verb are the only surrounding content; the tail is
    # expected to be just the destination phrase.
    if _word_count(message[: verb.start()]) > _WORD_BUDGET:
        return None
    tail = message[verb.end():].strip().lower().strip(" .!?\"'")
    tail = re.sub(r"^(?:the|my|a)\s+", "", tail)
    tail = re.sub(r"\s+(?:page|tab|screen|section)$", "", tail)
    tail = re.sub(r"\s+(?:please|now|for me|thanks|thank you)$", "", tail)
    route = _resolve_route_phrase(tail)
    if not route:
        return None
    return _navigate_plan(
        route=route,
        prefill={},
        reasoning=f"Take you to {route}.",
        user_was_imperative=True,
    )


# --- Rule (c): the find-people family, "<verb> <role> at <company>" ---------

def _rule_find_people(message: str) -> Optional[Dict[str, Any]]:
    m = _FIND_PEOPLE_RE.match(message)
    if not m:
        return None
    role = m.group(1).strip(" .,!?\"'")
    # Strip a leading article or quantifier: "a recruiter" -> "recruiter".
    role = re.sub(r"^(?:a|an|the|some)\s+", "", role, flags=re.I).strip()
    rest = m.group(2).strip(" .,!?\"'")
    if not rest:
        return None
    # Split a trailing "in <location>" off the company.
    company, location = rest, ""
    loc_m = re.search(r"\s+in\s+(.+)$", rest, re.I)
    if loc_m:
        company = rest[: loc_m.start()].strip()
        location = loc_m.group(1).strip(" .,!?\"'")
    # Company should be a name, not a clause. Keep it short and present.
    if not company or _word_count(company) > 5:
        return None
    # Prompt carrier: rebuild the natural search ("5 usc alumni at bain in
    # los angeles") instead of forcing count/school fragments into structured
    # fields. Matches the LLM path's default-to-prompt rule, so school, year,
    # and count context survive into the search bar verbatim.
    descriptor = ""
    if role and role.lower() not in _GENERIC_PEOPLE_WORDS and _word_count(role) <= 5:
        descriptor = role
    prompt = f"{descriptor or 'people'} at {company}"
    if location:
        prompt += f" in {location}"
    # An explicit count means the query is complete; fire the search on
    # landing (the approve card still gates it, since the action spends
    # credits).
    has_count = bool(re.search(r"\b\d+\b", descriptor))
    return _navigate_plan(
        route="/find",
        prefill={"prompt": prompt},
        reasoning=f"Search for {descriptor or 'contacts'} at {company}.",
        user_was_imperative=False,
        auto_submit=has_count,
    )


# Rule (d): job-board posting URLs (Greenhouse, Lever, LinkedIn jobs) are
# deliberately NOT matched by any rule. The same posting could mean interview
# prep, a cover letter, or a recruiter lookup; the right page is genuinely
# ambiguous, so these fall through to the LLM, which has the parse_job_url
# helper tool to disambiguate. There is intentionally no rule for them.
#
# _rule_find_people is retired from the active set: "find me 3 SWEs at
# Spotify" is now an in-chat execute (the find_contacts tool surfaces the
# results in the panel and saves them to My Network), so it must reach the
# LLM instead of being short-circuited into a /find navigate. The function
# stays for reference / quick revert.
_RULES = (_rule_linkedin_url, _rule_route_mention)


def try_pre_llm(
    message: str,
    current_page: str = "/home",
    user_profile: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Tier A: try the regex rules in order.

    Returns a navigate tool-call dict ({"name": "navigate", "args": {...}}) on
    a high-confidence hit, else None so handle_chat falls through to the LLM.
    current_page and user_profile are accepted for parity with the later tiers;
    Tier A does not need them.
    """
    msg = (message or "").strip()
    if not msg:
        return None
    for rule in _RULES:
        plan = rule(msg)
        if plan is not None:
            return plan
    return None
