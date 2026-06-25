"""Hard intent gates — Phase 2 of the job-board audit.

Where the deterministic + GPT + embedding rankers only *score* jobs, intent
gates *drop* jobs that fail explicit user-stated intent. Three gates:

  1. Level gate — a graduating senior shouldn't see PhD / Senior / Staff /
     Principal postings. Read from structured.experience_level (populated by
     the Phase 1 Firecrawl enricher) and the job title as a fallback.

  2. Location gate — if user set preferredLocation, drop jobs whose location
     doesn't intersect any of those AND aren't remote-friendly.

  3. Interest gate — if user has non-empty careerInterests, drop jobs that
     don't show any of those interests in (structured.requirements ∪
     category ∪ title).

Each gate is conservative: only drops when we have high confidence the job
mismatches user-stated intent. When data is ambiguous (no structured field,
no preferences set, etc.), the gate keeps the job.

Gates return both the kept jobs AND a count of dropped jobs per gate so the
SPA can show "We filtered N jobs that didn't match — change preferences or
Show all".
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_lower(val) -> str:
    if isinstance(val, str):
        return val.lower()
    if isinstance(val, list):
        return " ".join(v.lower() for v in val if isinstance(v, str))
    return ""


def _safe_str_list(val) -> list[str]:
    if isinstance(val, list):
        return [v.strip().lower() for v in val if isinstance(v, str) and v.strip()]
    if isinstance(val, str) and val.strip():
        return [val.strip().lower()]
    return []


# Split a free-text preference like "Los Angeles, CA" or "Data Science & Analytics"
# into the meaningful tokens we want to match against.
_PREF_TOKEN_SPLIT_RE = re.compile(r"[,&/]| and ", re.IGNORECASE)
_GENERIC_TOKENS = {
    # tokens too short/common to be discriminating
    "ca", "ny", "tx", "wa", "ma", "il", "fl", "co", "ga", "pa", "nc", "va",
    "and", "or", "the", "of", "in", "at", "for",
    "usa", "us", "united", "states",
}


def _tokenize_preference(text: str) -> list[str]:
    """Break a multi-word preference into discriminating tokens.

    Examples:
      "Los Angeles, CA" → ["los angeles"]
      "Data Science & Analytics" → ["data science", "analytics"]
      "Finance (Wealth Management, Private Equity, Hedge Funds)" → ["finance", "wealth management", "private equity", "hedge funds"]
    """
    if not text:
        return []
    t = text.lower().replace("(", " ").replace(")", " ")
    raw_tokens = _PREF_TOKEN_SPLIT_RE.split(t)
    tokens = []
    for tok in raw_tokens:
        tok = tok.strip()
        if not tok or tok in _GENERIC_TOKENS:
            continue
        if len(tok) < 3:
            continue
        tokens.append(tok)
    return tokens


_STATE_CODES = {
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
    "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
    "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok",
    "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
    "wi", "wy", "dc",
}


def _extract_state_codes(text: str) -> list[str]:
    """Pull 2-letter US state codes from a location preference.

    "Los Angeles, CA" → ["ca"]
    "Boston, MA / Remote" → ["ma"]
    "New York, NY, Chicago, IL" → ["ny", "il"]
    Returns lowercase codes. Used as a relaxed-match fallback so a user who
    picked specific cities in a state still sees other cities in that state
    (Mountain View matches a "San Francisco, CA" preference via the "ca" state).
    """
    if not isinstance(text, str):
        return []
    out = []
    # Look for 2-letter codes after a comma boundary (the canonical "City, ST" pattern)
    for match in re.finditer(r"[,\s]([a-z]{2})\b", text.lower()):
        code = match.group(1)
        if code in _STATE_CODES and code not in out:
            out.append(code)
    return out


# Title-pattern detection for senior roles (when structured.experience_level is missing)
_SENIOR_TITLE_RE = re.compile(
    r"\b(senior|sr\.?|staff|principal|lead|director|head of|vp of|vice president|"
    r"manager|architect|distinguished|fellow|chief|founding)\b",
    re.IGNORECASE,
)

_PHD_RE = re.compile(r"\b(ph\.?d|doctorate|doctoral)\b", re.IGNORECASE)

# experience_level values from Firecrawl that signal "not entry-level"
_NON_ENTRY_LEVEL_VALUES = {
    "senior", "staff", "principal", "lead", "director", "executive",
    "5+ years", "6+ years", "7+ years", "8+ years", "10+ years",
    "manager", "architect",
}


# ---------------------------------------------------------------------------
# UserIntent extraction
# ---------------------------------------------------------------------------

def build_user_intent(profile: dict) -> dict:
    """Extract the gate-relevant fields from a user profile.

    The onboarding flow writes intent fields to several different paths
    (legacy schema vs current schema vs partial writes). Read every known
    path so the gates work for users onboarded at any point in history.

    Audited 2026-05-18:
      - careerInterests lives in `location.careerInterests` for 45.5% of users,
        `location.interests` for 50.8%, top-level `careerInterests` for 6.2%,
        and `goals.careerInterests` for 0% (despite what the audit doc assumed)
      - dreamCompanies adoption is 2.1% — separate UX issue, not a path issue
    """
    goals = profile.get("goals") or {}
    rp = profile.get("resumeParsed") or {}
    edu = rp.get("education") or {}
    loc = profile.get("location") or {}

    # graduation year — accept multiple field names (top-level + academics + resumeParsed)
    academics = profile.get("academics") or {}
    grad_year = (
        edu.get("graduationYear")
        or edu.get("graduation_year")
        or academics.get("graduationYear")
        or profile.get("graduationYear")
    )
    try:
        grad_year = int(grad_year) if grad_year is not None else None
    except (TypeError, ValueError):
        grad_year = None
    # graduation month — used to compute months_until_grad accurately
    grad_month_raw = (
        edu.get("graduationMonth")
        or academics.get("graduationMonth")
        or profile.get("graduationMonth")
    )
    grad_month: int | None = None
    if isinstance(grad_month_raw, int):
        if 1 <= grad_month_raw <= 12:
            grad_month = grad_month_raw
    elif isinstance(grad_month_raw, str):
        s = grad_month_raw.strip().lower()
        if s.isdigit():
            try:
                n = int(s)
                if 1 <= n <= 12:
                    grad_month = n
            except ValueError:
                pass
        else:
            month_names = {
                "january": 1, "february": 2, "march": 3, "april": 4,
                "may": 5, "june": 6, "july": 7, "august": 8,
                "september": 9, "october": 10, "november": 11, "december": 12,
                "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
                "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
            }
            grad_month = month_names.get(s)

    # preferredLocation may be a string OR a list (multi-city onboarding)
    pref_loc = loc.get("preferredLocation") or profile.get("preferredLocation")
    preferred_locations = _safe_str_list(pref_loc)

    # careerInterests: union across every path the onboarding flow has
    # written to. Dedup is downstream — gate just needs the membership set.
    interest_sources = [
        goals.get("careerInterests"),
        loc.get("careerInterests"),
        loc.get("interests"),
        loc.get("career_interests"),
        profile.get("careerInterests"),
    ]
    seen = set()
    career_interests: list[str] = []
    for src in interest_sources:
        for v in _safe_str_list(src):
            if v not in seen:
                seen.add(v)
                career_interests.append(v)

    # Career track lives under goals; tolerate accidental top-level write too
    raw_track = goals.get("careerTrack") or profile.get("careerTrack")
    career_track = raw_track.lower().strip() if isinstance(raw_track, str) else ""

    # Dream companies — same union pattern in case any user has them top-level
    dream_sources = [goals.get("dreamCompanies"), profile.get("dreamCompanies")]
    seen_dc = set()
    dream_companies: list[str] = []
    for src in dream_sources:
        for v in _safe_str_list(src):
            if v not in seen_dc:
                seen_dc.add(v)
                dream_companies.append(v)

    major_raw = edu.get("major") or profile.get("major")
    major = major_raw.lower().strip() if isinstance(major_raw, str) else ""

    return {
        "preferred_locations": preferred_locations,
        "career_interests": career_interests,
        # Optional PDL-derived synonyms. Populated by expand_intent_with_pdl()
        # when the pdlInterestExpansion flag is on; empty otherwise. Kept
        # separate from career_interests so the user's literal input stays
        # intact for display and intent_hash stability.
        "extra_interest_phrases": [],
        "career_track": career_track,
        "dream_companies": dream_companies,
        "major": major,
        "graduation_year": grad_year,
        "graduation_month": grad_month,
    }


# Onboarding's "Industries of Interest" list (OnboardingLocationPreferences.tsx)
# stores domain phrases like "Data Science & Analytics" that nobody literally
# holds as a job title — so PDL Job Title Enrichment returns no synonyms for
# them. This map bridges the gap: each domain expands into canonical titles
# that PDL CAN enrich. Coverage focused on Offerloop's target verticals
# (consulting / IB / tech / finance / quant / design). Unmapped domains fall
# through to passing the literal string to PDL (current behavior), so this
# is purely additive — never a regression.
#
# Keys lowercased + space-normalized; matched via the same _norm() helper.
INTEREST_TO_TITLES: dict[str, list[str]] = {
    # Consulting
    "management consulting":       ["Management Consultant", "Strategy Consultant", "Business Analyst", "Associate Consultant"],
    "strategy consulting":         ["Strategy Consultant", "Management Consultant", "Business Analyst"],
    "environmental consulting":    ["Environmental Consultant", "Sustainability Consultant"],

    # Finance — IB / PE / VC / HF
    "investment banking":          ["Investment Banking Analyst", "Investment Banking Associate", "IBD Analyst", "Financial Analyst"],
    "banking":                     ["Investment Banking Analyst", "Banking Analyst", "Financial Analyst"],
    "private equity":              ["Private Equity Analyst", "Private Equity Associate", "Investment Analyst"],
    "venture capital":             ["Venture Capital Analyst", "Venture Capital Associate", "Investment Analyst"],
    "hedge funds":                 ["Quantitative Analyst", "Investment Analyst", "Hedge Fund Analyst", "Trader"],
    "wealth management":           ["Wealth Manager", "Financial Advisor", "Investment Advisor"],
    "finance (wealth management, private equity, hedge funds)":
                                   ["Investment Analyst", "Financial Analyst", "Wealth Manager", "Private Equity Analyst"],
    "real estate finance":         ["Real Estate Analyst", "Investment Analyst", "Real Estate Associate"],
    "fintech":                     ["Software Engineer", "Product Manager", "Quantitative Analyst", "Financial Analyst"],
    "accounting":                  ["Accountant", "Auditor", "Tax Accountant", "Financial Analyst"],
    "tax services":                ["Tax Accountant", "Tax Analyst", "Tax Associate"],
    "auditing":                    ["Auditor", "Audit Associate", "Internal Auditor"],
    "insurance":                   ["Insurance Analyst", "Underwriter", "Actuary"],

    # Tech — engineering
    "software development":        ["Software Engineer", "Software Developer", "Backend Engineer", "Frontend Engineer", "Full Stack Engineer"],
    "artificial intelligence / machine learning":
                                   ["Machine Learning Engineer", "AI Engineer", "Research Scientist", "ML Engineer", "Data Scientist"],
    "data science & analytics":    ["Data Scientist", "Data Analyst", "Analytics Engineer", "Machine Learning Engineer", "Business Intelligence Analyst"],
    "cybersecurity":               ["Security Engineer", "Security Analyst", "SOC Analyst", "Information Security Engineer"],
    "cloud computing":             ["Cloud Engineer", "Site Reliability Engineer", "DevOps Engineer", "Cloud Architect"],
    "blockchain & web3":           ["Blockchain Engineer", "Smart Contract Engineer", "Cryptocurrency Analyst"],
    "robotics":                    ["Robotics Engineer", "Mechatronics Engineer", "Software Engineer"],
    "gaming & esports":            ["Game Developer", "Software Engineer", "Game Designer"],

    # Design
    "ux/ui design":                ["UX Designer", "UI Designer", "Product Designer"],
    "graphic design":              ["Graphic Designer", "Visual Designer"],

    # Marketing / Sales
    "marketing & advertising":     ["Marketing Manager", "Marketing Analyst", "Brand Manager", "Marketing Coordinator"],
    "advertising technology (adtech)":
                                   ["Software Engineer", "Marketing Analyst", "Ad Operations Analyst"],

    # Healthcare / Bio
    "biotech research":            ["Research Scientist", "Biotech Researcher", "Lab Technician"],
    "biotechnology":               ["Research Scientist", "Bioengineer", "Scientist"],
    "pharmaceuticals":             ["Pharmaceutical Scientist", "Research Scientist", "Clinical Research Associate"],
    "healthtech":                  ["Software Engineer", "Product Manager", "Clinical Data Scientist"],
    "medical devices":             ["Biomedical Engineer", "Quality Engineer", "Product Manager"],

    # Law / Policy / Gov
    "law (corporate, criminal, civil)":
                                   ["Legal Analyst", "Paralegal", "Associate Attorney"],
    "legal tech":                  ["Software Engineer", "Legal Analyst", "Product Manager"],
    "public policy":               ["Policy Analyst", "Research Analyst", "Government Affairs Associate"],
    "political campaigns":         ["Campaign Manager", "Political Analyst", "Field Organizer"],

    # Other major categories
    "supply chain & logistics":    ["Supply Chain Analyst", "Operations Analyst", "Logistics Coordinator"],
    "real estate development":     ["Real Estate Analyst", "Development Associate", "Acquisitions Analyst"],
    "commercial real estate":      ["Real Estate Analyst", "Commercial Real Estate Broker", "Investment Analyst"],
}


def _norm_interest(s: str) -> str:
    """Lowercase + collapse whitespace for case-insensitive map lookup."""
    return re.sub(r"\s+", " ", s.strip().lower()) if isinstance(s, str) else ""


def _titles_for_interest(interest: str) -> list[str]:
    """Return the canonical job titles for a given interest, or [interest]
    as a fallback if not mapped. Always returns ≥1 string so callers can
    iterate uniformly."""
    key = _norm_interest(interest)
    mapped = INTEREST_TO_TITLES.get(key)
    if mapped:
        return mapped
    return [interest] if interest and interest.strip() else []


def expand_intent_with_pdl(intent: dict) -> dict:
    """Augment intent with PDL Job Title Enrichment synonyms.

    For each career_interest, first expands to canonical job titles via
    INTEREST_TO_TITLES (since onboarding stores domain phrases, not titles),
    then calls PDL for each title and unions the cleaned_name + similar_titles
    into `extra_interest_phrases`. The downstream interest gate reads both
    career_interests AND extra_interest_phrases, so an interest of
    "Data Science & Analytics" matches jobs titled "Data Analyst",
    "ML Engineer", etc.

    Returns a NEW intent dict (does not mutate). Safe to call when PDL is
    unreachable — failures just yield no extras, so the gate behaves
    exactly as it did pre-expansion.
    """
    if not isinstance(intent, dict):
        return intent

    interests = intent.get("career_interests") or []
    if not interests:
        return dict(intent)

    from app.services.pdl_title_cache import get_or_enrich_title

    extras: list[str] = []
    # Dedup set seeded with the user's literal interests AND their normalized
    # forms so we don't re-add what they already typed.
    seen: set[str] = set(s.lower().strip() for s in interests if isinstance(s, str))

    for interest in interests:
        if not isinstance(interest, str) or not interest.strip():
            continue
        # Domain → canonical titles (or [interest] if not mapped).
        canonical_titles = _titles_for_interest(interest)
        for title in canonical_titles:
            payload = get_or_enrich_title(title)
            candidates: list[str] = []
            # The canonical title itself is high-signal — add it even if PDL
            # returns nothing else.
            candidates.append(title)
            cleaned = payload.get("cleaned_name")
            if isinstance(cleaned, str) and cleaned.strip():
                candidates.append(cleaned)
            for sim in payload.get("similar_titles") or []:
                if isinstance(sim, str) and sim.strip():
                    candidates.append(sim)
            for c in candidates:
                key = c.lower().strip()
                if key and key not in seen:
                    seen.add(key)
                    extras.append(c)

    out = dict(intent)
    out["extra_interest_phrases"] = extras
    return out


# ---------------------------------------------------------------------------
# Individual gates — each returns True if the job should be DROPPED
# ---------------------------------------------------------------------------

def _gate_by_level(job: dict, intent: dict) -> bool:
    """Drop senior/staff/PhD postings when user graduates within 18 months.

    Conservative: only drops when the user has a graduation year close enough
    AND we have positive evidence the role isn't entry-level.
    """
    grad_year = intent.get("graduation_year")
    if grad_year is None:
        return False

    # Use UTC for consistency across deploy regions; assume May (month 5) when
    # only year is known — typical US undergrad graduation month.
    now_utc = datetime.now(timezone.utc)
    grad_month = intent.get("graduation_month") or 5
    months_until_grad = (grad_year - now_utc.year) * 12 + (grad_month - now_utc.month)
    if months_until_grad > 18:
        return False

    structured = job.get("structured") or {}
    level = structured.get("experience_level")
    if isinstance(level, str):
        lv = level.lower().strip()
        for marker in _NON_ENTRY_LEVEL_VALUES:
            if marker in lv:
                return True

    # Fallback: pattern-match the title
    title = job.get("title") or ""
    if isinstance(title, str):
        if _PHD_RE.search(title):
            return True
        # Title-based seniority — only drop if title clearly says senior+
        # (not just "Lead Frontend Engineer Intern" — context matters)
        if _SENIOR_TITLE_RE.search(title) and not re.search(r"\b(intern|internship|new\s*grad|entry|junior|jr)\b", title, re.IGNORECASE):
            return True

    # Requirements list — if it explicitly says "5+ years" / PhD etc.
    reqs = structured.get("requirements") or []
    if isinstance(reqs, list):
        for req in reqs[:3]:  # only check first few — those are usually load-bearing
            if not isinstance(req, str):
                continue
            req_lower = req.lower()
            if _PHD_RE.search(req_lower):
                return True
            if re.search(r"\b([5-9]|10|1[0-9])\+?\s*(years?|yrs?)\b", req_lower):
                return True

    return False


def _gate_by_location(job: dict, intent: dict) -> bool:
    """Drop jobs whose location doesn't intersect preferredLocation and aren't remote.

    Tokenizes preferences so "Los Angeles, CA" matches a job in "Los Angeles"
    even though the comma+state suffix differs. Also matches bidirectionally
    — pref-in-loc OR loc-in-pref — so "LA" matches "Los Angeles" via the
    common-prefix path.
    """
    preferred = intent.get("preferred_locations") or []
    if not preferred:
        return False

    # Remote-friendly jobs always pass
    if job.get("remote_derived") or job.get("remote"):
        return False

    raw_loc = job.get("location")
    if isinstance(raw_loc, dict):
        loc_text = " ".join(
            str(v).lower() for v in raw_loc.values() if isinstance(v, str)
        )
    elif isinstance(raw_loc, str):
        loc_text = raw_loc.lower()
    else:
        return False

    # Empty location string — we can't evaluate the gate, so keep conservatively
    # rather than silently dropping. Better to show a job we can't verify than
    # to hide one the user might want.
    if not loc_text.strip():
        return False

    if "remote" in loc_text or "anywhere" in loc_text or "any location" in loc_text:
        return False

    # 1) Match on discriminating city tokens (high confidence)
    for pref in preferred:
        for tok in _tokenize_preference(pref):
            if tok in loc_text:
                return False
            if loc_text and loc_text in tok:
                return False

    # 2) State-level fallback: if user picked any city in a state, keep
    #    other jobs in that same state. Respects metro-area intent without
    #    requiring a metro lookup table. ("San Francisco, CA" pref →
    #    Mountain View, CA job keeps via the "ca" state code.)
    pref_states = set()
    for pref in preferred:
        pref_states.update(_extract_state_codes(pref))
    if pref_states:
        loc_states = set(_extract_state_codes(loc_text))
        if loc_states & pref_states:
            return False

    return True


_INTEREST_STOPWORDS = {
    "and", "or", "the", "of", "in", "at", "for", "with", "to", "a", "an",
    "&", "/", ",",
}


def _interest_keywords(interests: list[str]) -> set[str]:
    """Expand interest phrases into a flat set of discriminating keywords.

    "Data Science & Analytics" → {"data science", "analytics", "data", "science"}

    Includes both multi-word tokens (precise) and their individual words
    (loose), so a job titled "Engineering Intern - AI Agents - Data & Models"
    still matches via the single-word "data" keyword.
    """
    keywords: set[str] = set()
    for interest in interests:
        for tok in _tokenize_preference(interest):
            keywords.add(tok)
            for word in tok.split():
                w = word.strip(",.()/&-")
                if len(w) >= 3 and w not in _INTEREST_STOPWORDS:
                    keywords.add(w)
    return keywords


def _gate_by_interest(job: dict, intent: dict) -> bool:
    """Drop jobs that don't show any user career interest in title/category/requirements.

    Two-stage keyword build: multi-word phrases ("data science") AND their
    individual words ("data", "science"). Drops only when zero overlap with
    the job's title/category/requirements/team.

    Also reads `extra_interest_phrases` (populated by expand_intent_with_pdl)
    so PDL-derived synonyms widen the match set without weakening precision.
    """
    interests = (intent.get("career_interests") or []) + (
        intent.get("extra_interest_phrases") or []
    )
    if not interests:
        return False

    haystack_parts = []
    title = job.get("title")
    if isinstance(title, str):
        haystack_parts.append(title.lower())
    category = job.get("category")
    if isinstance(category, str):
        haystack_parts.append(category.lower())
    structured = job.get("structured") or {}
    reqs = structured.get("requirements") or []
    if isinstance(reqs, list):
        haystack_parts.extend(r.lower() for r in reqs if isinstance(r, str))
    team = structured.get("team")
    if isinstance(team, str):
        haystack_parts.append(team.lower())
    haystack = " ".join(haystack_parts)
    if not haystack:
        return False

    keywords = _interest_keywords(interests)
    if not keywords:
        return False
    for kw in keywords:
        if kw in haystack:
            return False
    return True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def apply_intent_gates(jobs: list[dict], intent: dict) -> tuple[list[dict], dict]:
    """Run all three gates against the candidate pool.

    Each gate is evaluated independently per job so a job that fails multiple
    gates is counted in EACH bucket, not just the first one. This makes the
    SPA banner ("12 too senior · 5 wrong location · 8 off-topic") truthful:
    those counts now reflect actual gate failures, not "which gate happened
    to short-circuit first".

    A job is kept only if it passes all three gates. `dropped` (total unique
    jobs removed from the feed) is also returned so the SPA can show an
    accurate "N filtered" headline that isn't the sum of overlapping buckets.
    """
    if not jobs:
        return [], {"by_level": 0, "by_location": 0, "by_interest": 0, "dropped": 0}

    kept = []
    counts = {"by_level": 0, "by_location": 0, "by_interest": 0, "dropped": 0}

    for job in jobs:
        fails_level = _gate_by_level(job, intent)
        fails_location = _gate_by_location(job, intent)
        fails_interest = _gate_by_interest(job, intent)

        if fails_level:
            counts["by_level"] += 1
        if fails_location:
            counts["by_location"] += 1
        if fails_interest:
            counts["by_interest"] += 1

        if fails_level or fails_location or fails_interest:
            counts["dropped"] += 1
        else:
            kept.append(job)

    logger.info(
        "intent gates: kept %d/%d (dropped=%d, by_level=%d, by_location=%d, by_interest=%d)",
        len(kept), len(jobs), counts["dropped"],
        counts["by_level"], counts["by_location"], counts["by_interest"],
    )
    return kept, counts


def intent_hash(intent: dict) -> str:
    """Stable hash of the gate-relevant intent for cache keying."""
    import hashlib
    import json
    # Sort lists so order doesn't change the hash
    norm = {
        "preferred_locations": sorted(intent.get("preferred_locations") or []),
        "career_interests": sorted(intent.get("career_interests") or []),
        # Include PDL extras so flipping pdlInterestExpansion invalidates the cache.
        "extra_interest_phrases": sorted(intent.get("extra_interest_phrases") or []),
        "career_track": intent.get("career_track") or "",
        "graduation_year": intent.get("graduation_year"),
    }
    raw = json.dumps(norm, sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()[:16]
