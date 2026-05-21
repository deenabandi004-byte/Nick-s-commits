"""
Personalization strategy for email generation.

Builds normalized profiles from raw data sources (resumeParsed, PDL, legacy fields)
and detects the strongest connection points between user and contact.

Lead-type priority order:
    alumni > dream_company > shared_company > career_path > shared_major >
    recent_transition > skills_overlap > shared_hometown > role_match > general

Warmth tier integration:
    warmth_scoring.py runs first and produces a base tier (warm/neutral/cold).
    The lead_type can UPGRADE the tier but NEVER downgrade it.
    Upgrade rules are documented in _TIER_UPGRADES.
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from datetime import datetime

from app.utils.users import get_university_shorthand, get_university_variants

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Skills stoplist -- too generic to count as meaningful overlap
# ---------------------------------------------------------------------------

SKILLS_STOPLIST = frozenset({
    "excel", "microsoft excel", "powerpoint", "microsoft powerpoint",
    "word", "microsoft word", "microsoft office", "google suite",
    "google docs", "google sheets",
    "communication", "leadership", "teamwork", "team player",
    "problem solving", "problem-solving", "critical thinking",
    "time management", "organization", "organizational skills",
    "english", "writing", "public speaking", "presentation",
    "presentations", "detail oriented", "detail-oriented",
    "self-motivated", "hard working", "hardworking", "fast learner",
    "research", "analysis", "management", "project management",
    "customer service", "sales", "marketing",
})

SKILLS_OVERLAP_THRESHOLD = 2


# ---------------------------------------------------------------------------
# Major alias map
# ---------------------------------------------------------------------------

_MAJOR_ALIASES: dict[str, str] = {
    # Business
    "business": "business administration",
    "biz admin": "business administration",
    "mba": "business administration",
    # CS
    "cs": "computer science",
    "comp sci": "computer science",
    "computer sci": "computer science",
    # Economics
    "econ": "economics",
    # Engineering
    "ee": "electrical engineering",
    "ece": "electrical and computer engineering",
    "me": "mechanical engineering",
    "ie": "industrial engineering",
    "biomed": "biomedical engineering",
    "bme": "biomedical engineering",
    "cheme": "chemical engineering",
    # Math / Stats
    "math": "mathematics",
    "maths": "mathematics",
    "stats": "statistics",
    "stat": "statistics",
    # Sciences
    "chem": "chemistry",
    "bio": "biology",
    "psych": "psychology",
    # Social Sciences
    "poli sci": "political science",
    "polisci": "political science",
    "ir": "international relations",
    # Finance
    "fin": "finance",
    "acct": "accounting",
}

# Reverse map: canonical -> {canonical, alias1, alias2, ...}
_MAJOR_CANONICAL: dict[str, set[str]] = {}
for _alias, _canonical in _MAJOR_ALIASES.items():
    _MAJOR_CANONICAL.setdefault(_canonical, {_canonical}).add(_alias)
for _c in list(_MAJOR_CANONICAL):
    _MAJOR_CANONICAL[_c].add(_c)


# ---------------------------------------------------------------------------
# Company normalization
# ---------------------------------------------------------------------------

_COMPANY_SUFFIXES = re.compile(
    r',?\s*(?:Inc\.?|LLC|Ltd\.?|Co\.?|Corp\.?|Corporation|'
    r'Incorporated|Limited|PLC|LP|LLP|NA|N\.A\.)$',
    re.IGNORECASE,
)

_COMPANY_ALIASES: dict[str, str] = {
    # Investment banks
    "the goldman sachs group": "goldman sachs",
    "goldman sachs group": "goldman sachs",
    "goldman sachs & co": "goldman sachs",
    "jpmorgan chase": "jpmorgan",
    "jpmorgan chase & co": "jpmorgan",
    "j.p. morgan": "jpmorgan",
    "jp morgan": "jpmorgan",
    "j.p. morgan chase": "jpmorgan",
    "morgan stanley & co": "morgan stanley",
    "bank of america merrill lynch": "bank of america",
    "bofa securities": "bank of america",
    "citigroup": "citi",
    "citibank": "citi",
    "credit suisse group": "credit suisse",
    "deutsche bank ag": "deutsche bank",
    "ubs group": "ubs",
    "barclays capital": "barclays",
    "lazard freres": "lazard",
    "lazard freres & co": "lazard",
    "evercore partners": "evercore",
    # Consulting
    "mckinsey & company": "mckinsey",
    "mckinsey and company": "mckinsey",
    "boston consulting group": "bcg",
    "bain & company": "bain",
    "bain and company": "bain",
    "deloitte consulting": "deloitte",
    "deloitte touche tohmatsu": "deloitte",
    "pricewaterhousecoopers": "pwc",
    "ernst & young": "ey",
    "ernst and young": "ey",
    "kpmg llp": "kpmg",
    "a.t. kearney": "kearney",
    "at kearney": "kearney",
    # PE / VC
    "blackstone group": "blackstone",
    "the blackstone group": "blackstone",
    "kkr & co": "kkr",
    "carlyle group": "carlyle",
    "the carlyle group": "carlyle",
    "apollo global management": "apollo",
    # Tech
    "meta platforms": "meta",
    "facebook": "meta",
    "alphabet": "google",
    "amazon.com": "amazon",
    "amazon web services": "aws",
    "microsoft corporation": "microsoft",
    "apple inc": "apple",
    "salesforce.com": "salesforce",
    "the walt disney company": "disney",
    "walt disney": "disney",
    "accenture plc": "accenture",
}


# ---------------------------------------------------------------------------
# Lead-type priority and warmth upgrade rules
# ---------------------------------------------------------------------------

LEAD_TYPE_PRIORITY = [
    "alumni",
    "dream_company",
    "shared_company",
    "career_path",
    "shared_major",
    "recent_transition",
    "skills_overlap",
    "shared_hometown",
    "role_match",
    "general",
]

_LEAD_TYPE_RANK = {t: i for i, t in enumerate(LEAD_TYPE_PRIORITY)}

_TIER_ORDER = ["cold", "neutral", "warm"]

# Lead type -> number of tier steps to upgrade (applied on top of
# warmth_scoring.py base tier; never downgrades).
#   alumni:          +2  (cold->warm,    neutral->warm)
#   dream_company:   +1  (cold->neutral, neutral->warm)
#   shared_company:  +2  (cold->warm,    neutral->warm)
#   shared_major:    +1  (cold->neutral, neutral->warm)
#   shared_hometown: +1  (cold->neutral, neutral->warm)
#   everything else: +0
_TIER_UPGRADES: dict[str, int] = {
    "alumni": 2,
    "dream_company": 1,
    "shared_company": 2,
    "career_path": 0,
    "shared_major": 1,
    "recent_transition": 0,
    "skills_overlap": 0,
    "shared_hometown": 1,
    "role_match": 0,
    "general": 0,
}


# ---------------------------------------------------------------------------
# Personal-note fact extraction
# ---------------------------------------------------------------------------

_PERSONAL_FACT_PATTERNS = [
    (re.compile(
        r'(?:from|grew up in|raised in|born in)\s+'
        r'([A-Z][a-zA-Z\s,]+?)(?:\.|,|;|$)', re.IGNORECASE),
     "from {}"),
    (re.compile(
        r'(?:moved to|living in|based in|relocated to)\s+'
        r'([A-Z][a-zA-Z\s,]+?)(?:\.|,|;|$)', re.IGNORECASE),
     "based in {}"),
    (re.compile(
        r'(?:love|enjoy|into|fan of|play|passionate about)\s+'
        r'([a-zA-Z\s]+?)(?:\.|,|;|\s+and\s|$)', re.IGNORECASE),
     "{} enthusiast"),
    (re.compile(
        r'(?:big|huge)\s+([a-zA-Z\s]+?)\s+fan', re.IGNORECASE),
     "{} fan"),
]

RECENT_TRANSITION_MONTHS = 9
PERSONAL_FACTS_CAP = 3


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class NormalizedUserProfile:
    """Canonical user profile, built once per email batch."""
    name: str = ""
    university: str = ""
    university_short: str = ""
    major: str = ""
    major_variants: set = field(default_factory=set)
    year: str = ""
    hometown: str = ""
    current_location: str = ""

    past_roles: list[dict] = field(default_factory=list)
    past_companies_normalized: set = field(default_factory=set)

    skills_lower: set = field(default_factory=set)

    extracurriculars_lower: set = field(default_factory=set)

    career_track: str = ""
    dream_companies_normalized: set = field(default_factory=set)

    personal_note: str = ""
    personal_facts: list = field(default_factory=list)


@dataclass
class NormalizedContactProfile:
    """Canonical contact profile, built per contact from PDL + legacy."""
    first_name: str = ""
    last_name: str = ""
    company: str = ""
    company_normalized: str = ""
    title: str = ""
    title_lower: str = ""
    industry: str = ""
    location: str = ""
    location_lower: str = ""

    schools: list[dict] = field(default_factory=list)
    schools_normalized: set = field(default_factory=set)

    career_path: list[dict] = field(default_factory=list)

    skills_lower: set = field(default_factory=set)

    tenure_years: int | None = None
    recently_joined: bool = False
    transition: dict | None = None


@dataclass
class PersonalizationStrategy:
    """Output of lead-type detection for one contact."""
    lead_hook: str = ""
    lead_type: str = "general"
    supporting_details: list = field(default_factory=list)
    prompt_instruction: str = ""
    avoid: list = field(default_factory=list)
    warmth_tier: str = "cold"
    label: str = ""
    commonality_types: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

def _normalize_company(name: str) -> str:
    """Strip legal suffixes, lowercase, apply alias map. Exact match only."""
    if not name:
        return ""
    cleaned = _COMPANY_SUFFIXES.sub("", name.strip()).strip()
    # Strip trailing "&" or "& " left after suffix removal (e.g. "Chase & Co." -> "Chase &")
    cleaned = re.sub(r'\s*&\s*$', '', cleaned).strip()
    lower = cleaned.lower()
    return _COMPANY_ALIASES.get(lower, lower)


def _split_and_normalize_majors(major: str) -> set[str]:
    """Split double majors on 'and', '&', '/', ',' and resolve aliases."""
    if not major:
        return set()
    parts = re.split(r'\s+and\s+|\s*&\s*|\s*/\s*|\s*,\s*', major.lower().strip())
    result = set()
    for p in parts:
        p = p.strip()
        if not p:
            continue
        canonical = _MAJOR_ALIASES.get(p, p)
        result.add(canonical)
        if p != canonical:
            result.add(p)
    return result


def _extract_personal_facts(note: str) -> list[str]:
    """Deterministic extraction from personalNote. Capped at PERSONAL_FACTS_CAP."""
    if not note or not note.strip():
        return []
    facts = []
    for pattern, template in _PERSONAL_FACT_PATTERNS:
        for match in pattern.finditer(note):
            value = match.group(1).strip().rstrip(",;.")
            if value and len(value) > 2:
                facts.append(template.format(value))
                if len(facts) >= PERSONAL_FACTS_CAP:
                    return facts
    return facts


def _schools_match(user_university: str, contact_school_name: str) -> bool:
    """Exact match via university variant sets.

    "USC" matches "University of Southern California" (alias map).
    "University of Southern California" does NOT match "University of
    Southern Mississippi" (different variant sets, no intersection).
    """
    if not user_university or not contact_school_name:
        return False
    return bool(get_university_variants(user_university)
                & get_university_variants(contact_school_name))


def _majors_match(user_variants: set[str], contact_variants: set[str]) -> bool:
    """Exact match on canonical forms after alias resolution."""
    if not user_variants or not contact_variants:
        return False
    return bool(user_variants & contact_variants)


def _compute_skills_overlap(
    user_skills: set[str], contact_skills: set[str],
) -> set[str]:
    """Meaningful skill overlap, stoplist already removed from both inputs."""
    if not user_skills or not contact_skills:
        return set()
    return user_skills & contact_skills


def _upgrade_warmth_tier(base_tier: str, lead_type: str) -> str:
    """Apply lead-type upgrade to base warmth tier. Never downgrades."""
    delta = _TIER_UPGRADES.get(lead_type, 0)
    if delta == 0:
        return base_tier
    base_idx = _TIER_ORDER.index(base_tier) if base_tier in _TIER_ORDER else 0
    new_idx = min(base_idx + delta, len(_TIER_ORDER) - 1)
    return _TIER_ORDER[new_idx]


# ---------------------------------------------------------------------------
# Profile builders
# ---------------------------------------------------------------------------

def build_user_profile(
    resume_parsed: dict | None,
    user_profile: dict | None,
    personal_note: str = "",
    dream_companies: list | None = None,
) -> NormalizedUserProfile:
    """Build NormalizedUserProfile from all available user data sources.

    Sources (priority order per field):
        resumeParsed > academics > professionalInfo > user_profile top-level
    """
    rp = resume_parsed or {}
    up = user_profile or {}
    academics = up.get("academics") or {}
    goals = up.get("goals") or {}
    prof = up.get("professionalInfo") or {}
    rp_edu = rp.get("education") or {}
    if not isinstance(rp_edu, dict):
        rp_edu = {}

    # Name
    name = (
        rp.get("name")
        or up.get("name")
        or f"{up.get('firstName', '')} {up.get('lastName', '')}".strip()
        or ""
    )

    # University
    university = (
        academics.get("university")
        or rp_edu.get("university")
        or rp.get("university")
        or prof.get("university")
        or up.get("university")
        or ""
    )

    # Major
    major = (
        academics.get("major")
        or rp_edu.get("major")
        or rp.get("major")
        or ""
    )

    # Year
    year = (
        academics.get("graduationYear")
        or up.get("year")
        or up.get("graduationYear")
        or ""
    )
    if not year and rp_edu.get("graduation"):
        m = re.search(r'20\d{2}', str(rp_edu["graduation"]))
        year = m.group() if m else ""

    # Hometown / location (location may be a dict from onboarding or a string)
    def _loc_str(val):
        if isinstance(val, dict):
            parts = [val.get("city", ""), val.get("state", "")]
            return ", ".join(p for p in parts if p).strip().lower()
        return (val or "").strip().lower()

    hometown = _loc_str(up.get("hometown") or prof.get("hometown") or "")
    current_location = _loc_str(up.get("location") or prof.get("location") or "")

    # Past roles -- from resumeParsed.experience (structured, not regex)
    past_roles = []
    past_companies_normalized: set[str] = set()
    for exp in rp.get("experience", []):
        if not isinstance(exp, dict):
            continue
        co = exp.get("company") or exp.get("organization") or ""
        ttl = exp.get("title") or ""
        if not co:
            continue
        norm = _normalize_company(co)
        past_roles.append({
            "company": co,
            "company_normalized": norm,
            "title": ttl,
            "was_intern": "intern" in ttl.lower() if ttl else False,
        })
        if norm:
            past_companies_normalized.add(norm)
    for co in up.get("pastCompanies", []):
        if co:
            norm = _normalize_company(co)
            if norm:
                past_companies_normalized.add(norm)

    # Skills (flattened, lowercased, stoplist-filtered)
    skills_data = rp.get("skills") or {}
    skills_lower: set[str] = set()
    if isinstance(skills_data, dict):
        for cat_list in skills_data.values():
            if isinstance(cat_list, list):
                for s in cat_list:
                    if isinstance(s, str) and s.strip():
                        skills_lower.add(s.strip().lower())
    elif isinstance(skills_data, list):
        for s in skills_data:
            if isinstance(s, str) and s.strip():
                skills_lower.add(s.strip().lower())
    skills_lower -= SKILLS_STOPLIST

    # Extracurriculars
    extras_lower: set[str] = set()
    for ext in rp.get("extracurriculars", []):
        if isinstance(ext, dict):
            act = ext.get("activity") or ext.get("organization") or ""
            if act:
                extras_lower.add(act.strip().lower())
        elif isinstance(ext, str) and ext.strip():
            extras_lower.add(ext.strip().lower())

    # Career track
    career_track = (
        goals.get("careerTrack")
        or up.get("careerTrack")
        or prof.get("careerTrack")
        or ""
    ).strip().lower()

    # Dream companies
    raw_dream = dream_companies or goals.get("dreamCompanies") or up.get("dreamCompanies") or []
    if isinstance(raw_dream, str):
        raw_dream = [c.strip() for c in raw_dream.split(",") if c.strip()]
    dream_norm: set[str] = set()
    for co in raw_dream:
        if co:
            dream_norm.add(_normalize_company(co))

    # Personal facts
    note = personal_note or up.get("personalNote") or ""
    facts = _extract_personal_facts(note)

    return NormalizedUserProfile(
        name=name,
        university=university,
        university_short=get_university_shorthand(university) or university,
        major=major,
        major_variants=_split_and_normalize_majors(major),
        year=str(year),
        hometown=hometown,
        current_location=current_location,
        past_roles=past_roles,
        past_companies_normalized=past_companies_normalized,
        skills_lower=skills_lower,
        extracurriculars_lower=extras_lower,
        career_track=career_track,
        dream_companies_normalized=dream_norm,
        personal_note=note,
        personal_facts=facts,
    )


def build_contact_profile(contact: dict) -> NormalizedContactProfile:
    """Build NormalizedContactProfile from PDL or legacy contact data.

    Handles both formats. Gracefully returns an empty-ish profile when
    data is missing (no errors, just fewer signals downstream).
    """
    from app.utils.users import determine_industry

    first_name = (
        contact.get("FirstName") or contact.get("first_name")
        or contact.get("firstName") or ""
    )
    last_name = (
        contact.get("LastName") or contact.get("last_name")
        or contact.get("lastName") or ""
    )
    company = contact.get("Company") or contact.get("company") or ""
    title = contact.get("Title") or contact.get("title") or contact.get("jobTitle") or ""
    location = contact.get("location") or contact.get("City") or contact.get("city") or ""
    industry = determine_industry(company, title)

    # --- Education -------------------------------------------------------
    schools: list[dict] = []
    schools_normalized: set[str] = set()

    for edu in contact.get("educationArray", []):
        if not isinstance(edu, dict):
            continue
        school_raw = edu.get("school", "")
        if isinstance(school_raw, dict):
            school_raw = school_raw.get("name", "")
        if not school_raw:
            continue

        major_raw = ""
        majors = edu.get("majors") or []
        if isinstance(majors, list) and majors and isinstance(majors[0], str):
            major_raw = majors[0]
        if not major_raw:
            major_raw = edu.get("major", "") or ""

        degree_raw = ""
        degrees = edu.get("degrees") or []
        if isinstance(degrees, list) and degrees and isinstance(degrees[0], str):
            degree_raw = degrees[0]
        if not degree_raw:
            degree_raw = edu.get("degree", "") or ""

        norm = school_raw.strip().lower()
        schools.append({
            "name": school_raw,
            "name_lower": norm,
            "major": major_raw,
            "major_lower": major_raw.lower().strip() if major_raw else "",
            "major_variants": _split_and_normalize_majors(major_raw),
            "degree": degree_raw,
        })
        if norm:
            schools_normalized.add(norm)

    # Legacy College field
    legacy_college = contact.get("College") or contact.get("college") or ""
    if legacy_college:
        norm = legacy_college.strip().lower()
        if norm not in schools_normalized:
            schools.append({
                "name": legacy_college,
                "name_lower": norm,
                "major": "",
                "major_lower": "",
                "major_variants": set(),
                "degree": "",
            })
            schools_normalized.add(norm)

    # --- Career path (oldest first) --------------------------------------
    career_path: list[dict] = []
    experience = contact.get("experience", [])
    if not isinstance(experience, list):
        experience = []

    for exp in experience:
        if not isinstance(exp, dict):
            continue
        exp_co = exp.get("company", "")
        if isinstance(exp_co, dict):
            exp_co = exp_co.get("name", "")
        exp_ttl = exp.get("title", "")
        if isinstance(exp_ttl, dict):
            exp_ttl = exp_ttl.get("name", "")

        sd = exp.get("start_date") or {}
        ed = exp.get("end_date")
        is_current = bool(exp.get("is_primary") or not ed)

        start_year = sd.get("year") if isinstance(sd, dict) else None
        start_month = sd.get("month") if isinstance(sd, dict) else None
        end_year = ed.get("year") if isinstance(ed, dict) else None

        career_path.append({
            "company": exp_co,
            "company_normalized": _normalize_company(exp_co),
            "title": exp_ttl,
            "start_year": start_year,
            "start_month": start_month,
            "end_year": end_year,
            "is_current": is_current,
        })

    # PDL returns newest-first; reverse to oldest-first
    if len(career_path) >= 2:
        first_yr = career_path[0].get("start_year") or 0
        last_yr = career_path[-1].get("start_year") or 0
        if first_yr > last_yr:
            career_path = list(reversed(career_path))
        elif first_yr == last_yr:
            # Years missing or equal - check is_current flag
            # If first entry is current job, PDL gave us newest-first → reverse
            if career_path[0].get("is_current") and not career_path[-1].get("is_current"):
                career_path = list(reversed(career_path))

    # --- Skills ----------------------------------------------------------
    skills_lower: set[str] = set()
    for s in (contact.get("skills") or contact.get("Skills") or []):
        if isinstance(s, str) and s.strip():
            skills_lower.add(s.strip().lower())
    for s in (contact.get("interests") or contact.get("Interests") or []):
        if isinstance(s, str) and s.strip():
            skills_lower.add(s.strip().lower())
    skills_lower -= SKILLS_STOPLIST

    # --- Derived signals -------------------------------------------------
    tenure_years = None
    recently_joined = False
    if career_path:
        current_job = career_path[-1]
        sy = current_job.get("start_year")
        if sy:
            now = datetime.now()
            sm = current_job.get("start_month") or 1
            months_since = (now.year - sy) * 12 + (now.month - sm)
            tenure_years = max(0, now.year - sy)
            recently_joined = months_since <= RECENT_TRANSITION_MONTHS

    transition = None
    if len(career_path) >= 2:
        cur = career_path[-1]
        prev = career_path[-2]
        if (cur.get("company_normalized") and prev.get("company_normalized")
                and cur["company_normalized"] != prev["company_normalized"]):
            transition = {
                "from_company": prev.get("company", ""),
                "from_title": prev.get("title", ""),
                "to_company": cur.get("company", ""),
                "to_title": cur.get("title", ""),
            }

    return NormalizedContactProfile(
        first_name=first_name,
        last_name=last_name,
        company=company,
        company_normalized=_normalize_company(company),
        title=title,
        title_lower=title.lower().strip() if title else "",
        industry=industry,
        location=location,
        location_lower=location.lower().strip() if location else "",
        schools=schools,
        schools_normalized=schools_normalized,
        career_path=career_path,
        skills_lower=skills_lower,
        tenure_years=tenure_years,
        recently_joined=recently_joined,
        transition=transition,
    )


# ---------------------------------------------------------------------------
# Lead-type detection
# ---------------------------------------------------------------------------

def _detect_all_signals(
    user: NormalizedUserProfile,
    contact: NormalizedContactProfile,
) -> list[dict]:
    """Detect all commonality signals between user and contact.

    Returns list of signal dicts. NOT yet sorted by priority -- caller
    sorts via LEAD_TYPE_PRIORITY.

    Each signal: {type, hook, detail, instruction, avoid}
    """
    signals: list[dict] = []

    # 1. Alumni -----------------------------------------------------------
    for school in contact.schools:
        if _schools_match(user.university, school["name"]):
            contact_major = school.get("major", "")
            hook_parts = [f"Fellow {user.university_short} alum"]
            if contact_major:
                hook_parts.append(f"studied {contact_major}")
            hook = " -- ".join(hook_parts)

            instruction = (
                f"Lead with the {user.university_short} alumni connection."
            )
            if contact_major and user.major:
                if contact_major.lower().strip() != user.major.lower().strip():
                    instruction += (
                        f" They studied {contact_major} while you're in "
                        f"{user.major} -- acknowledge the different paths."
                    )
                else:
                    instruction += (
                        f" You both studied {user.major} -- reference the "
                        f"shared department."
                    )
            instruction += " One question only."

            signals.append({
                "type": "alumni",
                "hook": hook,
                "detail": f"now {contact.title} at {contact.company}" if contact.title else "",
                "instruction": instruction,
                "avoid": [
                    f"Don't explain what {user.university_short} is",
                    "Don't say 'I came across your profile'",
                ],
            })
            break

    # 2. Dream company ----------------------------------------------------
    if (contact.company_normalized
            and contact.company_normalized in user.dream_companies_normalized):
        hook = (
            f"{contact.company} is one of your target companies -- "
            f"they're a {contact.title} there"
        )
        instruction = (
            f"Show genuine interest in {contact.company} specifically -- "
            f"not prestige, but something concrete about the company or "
            f"their role as {contact.title}. Be direct that this is a "
            f"company you're targeting."
        )
        if contact.transition:
            instruction += (
                f" Ask about their move from "
                f"{contact.transition['from_company']}."
            )

        signals.append({
            "type": "dream_company",
            "hook": hook,
            "detail": "",
            "instruction": instruction,
            "avoid": [
                "Don't be sycophantic about the firm's prestige",
                "Don't say 'top-tier' or 'prestigious'",
            ],
        })

    # 3. Shared company ---------------------------------------------------
    contact_cos = {
        e.get("company_normalized", "") for e in contact.career_path
    }
    contact_cos.add(contact.company_normalized)
    contact_cos.discard("")

    for role in user.past_roles:
        if role["company_normalized"] in contact_cos:
            co_name = role["company"]
            u_title = role["title"]
            was_intern = role["was_intern"]

            # Find contact's role at that company
            c_role = contact.title
            for entry in contact.career_path:
                if entry.get("company_normalized") == role["company_normalized"]:
                    c_role = entry.get("title") or contact.title
                    break

            verb = "interned" if was_intern else "worked"
            hook = (
                f"Both at {co_name} -- you {verb} as {u_title}, "
                f"they're a {c_role}"
            )
            instruction = (
                f"Lead with the {co_name} connection. Mention your "
                f"{'internship' if was_intern else 'time'} there "
                f"specifically. Ask about their experience as {c_role}."
            )
            signals.append({
                "type": "shared_company",
                "hook": hook,
                "detail": "",
                "instruction": instruction,
                "avoid": ["Don't pretend you overlapped if you didn't"],
            })
            break

    # 4. Career path (>= 2 entries) ---------------------------------------
    if len(contact.career_path) >= 2:
        recent = contact.career_path[-4:]
        path_parts = []
        for entry in recent:
            t = entry.get("title", "")
            c = entry.get("company", "")
            if t and c:
                path_parts.append(f"{t} at {c}")
            elif c:
                path_parts.append(c)

        if path_parts:
            path_str = " -> ".join(path_parts)
            first_year = recent[0].get("start_year")
            span = ""
            if first_year:
                span = f" over {datetime.now().year - first_year} years"

            hook = f"{path_str}{span}"

            ask = (
                f"Ask about the move from "
                f"{recent[-2].get('company', 'their previous role')} to "
                f"{recent[-1].get('company', 'their current role')}."
            )

            prev_co = recent[-2].get('company', 'their previous role')
            curr_co = recent[-1].get('company', 'their current role')
            prev_title = recent[-2].get('title', '')
            curr_title = recent[-1].get('title', '')
            # Build a concrete fact string from the data we actually have
            concrete_fact = f"their move from {prev_co} to {curr_co}"
            if span:
                concrete_fact += f" ({span.strip()})"
            if prev_title and curr_title:
                concrete_fact = (
                    f"their move from {prev_title} at {prev_co} to "
                    f"{curr_title} at {curr_co}"
                )
            instruction = (
                f"Four parts: (1) Position yourself - who you are and what "
                f"you're exploring. (2) Reference {concrete_fact} - state the "
                f"fact of the move itself, then say what makes you curious about "
                f"it. Do NOT invent commentary about either firm's reputation, "
                f"culture, or market position. (3) One thoughtful question about "
                f"that specific move. (4) The ask."
            )
            signals.append({
                "type": "career_path",
                "hook": hook,
                "detail": "",
                "instruction": instruction,
                "avoid": [
                    "Don't summarize their whole career back to them",
                    "Don't say 'Your background is impressive'",
                    "Don't write generic firm reputation commentary "
                    "(e.g., 'known for elite M&A,' 'culture of collaboration,' "
                    "'reputation for senior-level relationships')",
                ],
            })

    # 5. Shared major -----------------------------------------------------
    if user.major_variants:
        for school in contact.schools:
            if (school.get("major_variants")
                    and _majors_match(user.major_variants,
                                     school["major_variants"])):
                c_school = school["name"]
                c_major = school.get("major", "") or user.major
                hook = f"Both studied {c_major}"
                if c_school:
                    hook += (
                        f" -- they at {c_school}, "
                        f"you at {user.university_short}"
                    )

                instruction = (
                    f"Reference the shared {c_major} background naturally."
                )
                if contact.title:
                    instruction += (
                        f" Ask how their {c_major} degree shaped their "
                        f"path to {contact.title}."
                    )

                signals.append({
                    "type": "shared_major",
                    "hook": hook,
                    "detail": "",
                    "instruction": instruction,
                    "avoid": [
                        "Don't just say 'fellow CS student' -- "
                        "be specific about the connection",
                    ],
                })
                break

    # 6. Recent transition ------------------------------------------------
    if contact.recently_joined and contact.transition:
        from_co = contact.transition["from_company"]
        to_co = contact.transition["to_company"]
        to_ttl = contact.transition["to_title"]

        hook = f"Recently joined {to_co} as {to_ttl}"
        if from_co:
            hook += f" (from {from_co})"

        instruction = (
            f"They just started at {to_co} -- ask how the transition "
            f"has been"
        )
        if from_co:
            instruction += f" and what drew them from {from_co}"
        instruction += (
            ". This is a natural, timely question that shows you're "
            "paying attention."
        )

        signals.append({
            "type": "recent_transition",
            "hook": hook,
            "detail": "",
            "instruction": instruction,
            "avoid": ["Don't be presumptuous about why they switched"],
        })

    # 7. Skills overlap ---------------------------------------------------
    overlap = _compute_skills_overlap(user.skills_lower, contact.skills_lower)
    if len(overlap) >= SKILLS_OVERLAP_THRESHOLD:
        top = sorted(overlap)[:4]
        hook = f"Shared skills: {', '.join(top)}"
        instruction = (
            f"You share these skills: {', '.join(top)}. Reference a "
            f"specific project or experience where you used one, then "
            f"ask about their work with it. Be concrete."
        )
        signals.append({
            "type": "skills_overlap",
            "hook": hook,
            "detail": f"{len(overlap)} shared skills",
            "instruction": instruction,
            "avoid": [
                "Don't list your skills",
                "Don't say 'I noticed we share similar skills'",
            ],
        })

    # 8. Shared hometown --------------------------------------------------
    if user.hometown:
        u_city = user.hometown.split(",")[0].strip()
        c_city = contact.location_lower.split(",")[0].strip()
        if u_city and c_city and u_city == c_city:
            hook = f"Both from {contact.location or user.hometown}"
            instruction = (
                f"Mention the shared {c_city.title()} connection "
                f"naturally. Don't make it the whole email -- use it "
                f"as a warm opener, then pivot to their work."
            )
            signals.append({
                "type": "shared_hometown",
                "hook": hook,
                "detail": "",
                "instruction": instruction,
                "avoid": [],
            })

    # 9. Role match -------------------------------------------------------
    if user.career_track and contact.title_lower:
        from app.utils.industry_classifier import (
            INDUSTRY_KEYWORDS, normalize_career_track,
        )
        canonical = normalize_career_track(user.career_track)
        keywords = INDUSTRY_KEYWORDS.get(canonical, [user.career_track])
        searchable = f"{contact.title_lower} {contact.company_normalized}"
        if any(kw in searchable for kw in keywords):
            hook = (
                f"{contact.title} at {contact.company} -- matches your "
                f"{user.career_track} interest"
            )
            # Build a concrete fact from the data we have
            role_fact = f"their role as {contact.title} at {contact.company}"
            if contact.tenure_years is not None and contact.tenure_years >= 1:
                role_fact = (
                    f"their {contact.tenure_years}+ years as "
                    f"{contact.title} at {contact.company}"
                )
            instruction = (
                f"Four parts: (1) Position yourself and your interest in "
                f"{user.career_track}. (2) Reference {role_fact} - state the "
                f"fact, then say what makes you curious. Do NOT invent "
                f"commentary about the firm's reputation, culture, or market "
                f"position. Only reference facts from their record. "
                f"(3) One thoughtful question about their specific experience "
                f"in that role. (4) The ask."
            )
            signals.append({
                "type": "role_match",
                "hook": hook,
                "detail": "",
                "instruction": instruction,
                "avoid": [
                    "Don't say 'Your work caught my attention'",
                    "Don't write generic firm reputation commentary "
                    "(e.g., 'known for elite M&A,' 'collaborative culture,' "
                    "'strength in middle-market')",
                ],
            })

    return signals


# ---------------------------------------------------------------------------
# Strategy builder
# ---------------------------------------------------------------------------

def _build_label(
    lead_type: str,
    user: NormalizedUserProfile,
    contact: NormalizedContactProfile,
) -> str:
    """UI-facing label."""
    if lead_type == "alumni":
        return f"{user.university_short} alumni connection"
    if lead_type == "dream_company":
        return "At your target company"
    if lead_type == "shared_company":
        return f"Both at {contact.company}" if contact.company else "Shared employer"
    if lead_type == "shared_major":
        return f"Shared {user.major} background" if user.major else "Same major"
    if lead_type == "recent_transition":
        return (
            f"Recently joined {contact.company}"
            if contact.company else "Recent transition"
        )
    if lead_type == "skills_overlap":
        return "Shared technical skills"
    if lead_type == "shared_hometown":
        return f"Both from {contact.location}" if contact.location else "Same hometown"
    # career_path, role_match, general -> no label
    return ""


def build_personalization_strategy(
    user: NormalizedUserProfile,
    contact: NormalizedContactProfile,
    base_warmth_tier: str = "cold",
) -> PersonalizationStrategy:
    """Build PersonalizationStrategy for one contact.

    Args:
        user: Normalized user profile (built once per batch).
        contact: Normalized contact profile.
        base_warmth_tier: Base tier from warmth_scoring.py. Lead type
            can upgrade but never downgrade.

    Returns:
        PersonalizationStrategy. Gracefully returns a ``general``
        strategy when no signals are detected.
    """
    signals = _detect_all_signals(user, contact)

    # --- General fallback ------------------------------------------------
    if not signals:
        role_desc = ""
        if contact.title and contact.company:
            role_desc = f"{contact.title} at {contact.company}"
        elif contact.title:
            role_desc = contact.title
        elif contact.company:
            role_desc = f"professional at {contact.company}"
        else:
            role_desc = "this professional"

        # General fallback: no real signal about this contact. Use honest
        # 3-part structure - don't fake a research sentence with firm-PR.
        instruction = f"You're a {user.university_short} student"
        if user.career_track:
            instruction += f" exploring {user.career_track}"
        instruction += (
            f". Three parts, in order: "
            f"(1) One or two sentences positioning yourself - who you are, "
            f"what you're exploring, and why their specific role as {role_desc} "
            f"is relevant to your interests. "
            f"(2) One thoughtful question about their experience as {role_desc} - "
            f"ask about their day-to-day, what surprised them, how they got into "
            f"the role, or what they'd tell someone exploring this career. "
            f"Do NOT write generic firm reputation commentary "
            f"(e.g., 'known for elite M&A,' 'collaborative culture'). "
            f"(3) The ask. "
            f"Keep it honest and direct - at least 60 words."
        )

        return PersonalizationStrategy(
            lead_hook=role_desc,
            lead_type="general",
            supporting_details=[],
            prompt_instruction=instruction,
            avoid=[
                "Don't pretend you have a connection",
                "Don't pad with filler",
                "Don't use 'I came across your background'",
            ],
            warmth_tier=base_warmth_tier,
            label="",
            commonality_types=[],
        )

    # --- Sort by priority and pick lead ----------------------------------
    signals.sort(key=lambda s: _LEAD_TYPE_RANK.get(s["type"], 999))

    lead = signals[0]
    lead_type = lead["type"]

    # Supporting details from remaining signals (up to 2)
    supporting = []
    for s in signals[1:3]:
        text = s["hook"]
        if s.get("detail"):
            text += f" ({s['detail']})"
        supporting.append(text)

    # Warmth upgrade
    final_tier = _upgrade_warmth_tier(base_warmth_tier, lead_type)

    # Avoid list: lead-specific + universal
    avoid = list(lead.get("avoid", []))
    if "Don't use 'I came across your background'" not in avoid:
        avoid.append("Don't use 'I came across your background'")

    return PersonalizationStrategy(
        lead_hook=lead["hook"],
        lead_type=lead_type,
        supporting_details=supporting,
        prompt_instruction=lead["instruction"],
        avoid=avoid,
        warmth_tier=final_tier,
        label=_build_label(lead_type, user, contact),
        commonality_types=[s["type"] for s in signals],
    )


# ---------------------------------------------------------------------------
# Batch orchestration
# ---------------------------------------------------------------------------

def build_batch_strategies(
    user: NormalizedUserProfile,
    contacts: list[dict],
    warmth_data: dict | None = None,
) -> dict[int, PersonalizationStrategy]:
    """Build PersonalizationStrategy for every contact in a batch.

    Args:
        user: Normalized user profile (built once).
        contacts: Raw contact dicts (PDL or legacy format).
        warmth_data: Output of ``score_contacts_for_email``
            (keyed by index).

    Returns:
        {0: PersonalizationStrategy, 1: ..., ...}
    """
    warmth_data = warmth_data or {}
    result: dict[int, PersonalizationStrategy] = {}

    for i, raw_contact in enumerate(contacts):
        try:
            cp = build_contact_profile(raw_contact)
            base_tier = warmth_data.get(i, {}).get("tier", "cold")
            strategy = build_personalization_strategy(user, cp, base_tier)
            result[i] = strategy
        except Exception as exc:
            logger.warning(
                "Personalization failed for contact %d: %s -- "
                "falling back to general",
                i, exc,
            )
            result[i] = PersonalizationStrategy(
                lead_type="general",
                warmth_tier=warmth_data.get(i, {}).get("tier", "cold"),
                prompt_instruction=(
                    f"Be direct and concise. Mention their role at "
                    f"{raw_contact.get('Company', 'their company')}. "
                    f"One question, then the ask."
                ),
                avoid=["Don't pretend you have a connection"],
            )

    return result
