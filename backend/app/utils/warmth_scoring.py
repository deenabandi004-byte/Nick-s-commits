"""
Warmth scoring module.

Scores contacts by relevance to the user based on shared identity,
career relevance, and data richness signals. Pure functions, no API calls.
"""

from app.utils.meeting_prep import detect_commonality
from app.utils.contact_analysis import _detect_career_transition, _detect_tenure
from app.utils.industry_classifier import INDUSTRY_KEYWORDS, normalize_career_track
from app.utils.users import get_university_shorthand


# ---------------------------------------------------------------------------
# Scoring constants
# ---------------------------------------------------------------------------

SHARED_IDENTITY_CAP = 45

TIER_THRESHOLDS = {
    "warm": 50,
    "neutral": 25,
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize(value):
    """Lowercase and strip a string, returning '' for None."""
    if not value:
        return ""
    return str(value).strip().lower()


def _get_field(contact, pdl_key, legacy_key, default=""):
    """Return the first truthy value from PDL or legacy field names."""
    return contact.get(pdl_key) or contact.get(legacy_key) or default


# Map Firestore contact field names → PDL/legacy names used by scorer
_FIRESTORE_ALIASES = {
    "college": "College",
    "jobTitle": "title",
}


def _normalize_contact_for_scoring(contact):
    """Ensure Firestore-saved contacts have the field names the scorer expects."""
    c = dict(contact)
    if "college" in c and "College" not in c:
        c["College"] = c["college"]
    if "jobTitle" in c and "title" not in c:
        c["title"] = c["jobTitle"]
    # Synthesize a headline if missing so role_matches_industry can work
    if not c.get("headline") and not c.get("Headline"):
        parts = [c.get("title") or c.get("jobTitle", ""), c.get("company", "")]
        c["headline"] = " at ".join(p for p in parts if p)
    return c


def _build_user_comparison_data(user_profile, search_context=None):
    """
    Normalize user data once per search so each contact scoring is cheap.

    Extracts university, major, past companies, career track, dream companies,
    and hometown from ``resumeParsed``, ``academics``, ``goals``, and
    top-level profile fields.

    Parameters
    ----------
    search_context : dict, optional
        Parsed query payload with ``title_variations`` and ``companies``
        from the search query.  When present, role/title match scoring
        is enabled.

    Returns a dict consumed by ``compute_warmth_score``.
    """
    resume_parsed = user_profile.get("resumeParsed") or {}
    resume_education = resume_parsed.get("education") or {}
    if not isinstance(resume_education, dict):
        resume_education = {}
    academics = user_profile.get("academics") or {}
    goals = user_profile.get("goals") or {}
    professional_info = user_profile.get("professionalInfo") or {}

    # University -----------------------------------------------------------
    university = (
        academics.get("university")
        or resume_education.get("university")
        or resume_parsed.get("university")
        or professional_info.get("university")
        or user_profile.get("university")
        or ""
    )
    university_short = get_university_shorthand(university) or university

    # Major / department ---------------------------------------------------
    major = (
        academics.get("major")
        or resume_education.get("major")
        or resume_parsed.get("major")
        or academics.get("department")
        or ""
    )

    # Past companies -------------------------------------------------------
    past_companies = set()
    for exp in resume_parsed.get("experience", []):
        if isinstance(exp, dict):
            co = exp.get("company") or exp.get("organization") or ""
            if co:
                past_companies.add(_normalize(co))
    # Also check top-level field used by some onboarding flows
    for co in user_profile.get("pastCompanies", []):
        if co:
            past_companies.add(_normalize(co))

    # Career track / target industry ---------------------------------------
    career_track = (
        goals.get("careerTrack")
        or user_profile.get("careerTrack")
        or professional_info.get("careerTrack")
        or ""
    )

    # Dream companies ------------------------------------------------------
    dream_companies = set()
    raw_dream = goals.get("dreamCompanies") or user_profile.get("dreamCompanies") or []
    if isinstance(raw_dream, str):
        raw_dream = [c.strip() for c in raw_dream.split(",") if c.strip()]
    for co in raw_dream:
        if co:
            dream_companies.add(_normalize(co))

    # Hometown / location --------------------------------------------------
    hometown = (
        user_profile.get("hometown")
        or user_profile.get("location")
        or professional_info.get("location")
        or ""
    )

    # Resume text (for detect_commonality) ---------------------------------
    resume_text = resume_parsed.get("rawText", "") or ""

    # User info dict expected by detect_commonality
    user_info = {
        "university": university,
        "company": "",  # current company not relevant for student users
    }

    # Search query role keywords -------------------------------------------
    search_titles = []
    if search_context:
        for t in search_context.get("title_variations", []):
            if t:
                search_titles.append(_normalize(t))

    return {
        "university": _normalize(university),
        "university_short": _normalize(university_short),
        "major": _normalize(major),
        "past_companies": past_companies,
        "career_track": _normalize(career_track),
        "dream_companies": dream_companies,
        "hometown": _normalize(hometown),
        "resume_text": resume_text,
        "user_info": user_info,
        "search_titles": search_titles,
    }


def _score_shared_identity(comparison, contact):
    """
    Compute shared-identity signals.

    Returns (points, signals) with the tier capped at SHARED_IDENTITY_CAP.
    """
    points = 0
    signals = []

    # Same university (+20) ------------------------------------------------
    commonality_type, details = detect_commonality(
        comparison["user_info"], contact, comparison["resume_text"]
    )
    if commonality_type == "university":
        points += 20
        signals.append({"signal": "same_university", "points": 20,
                        "detail": details.get("university", "")})

    # Same major / department (+10) ----------------------------------------
    user_major = comparison["major"]
    if user_major:
        contact_majors = []
        for edu in contact.get("educationArray", []):
            if isinstance(edu, dict):
                contact_majors.append(_normalize(edu.get("major", "")))
                contact_majors.append(_normalize(edu.get("field_of_study", "")))
        # Legacy fields
        contact_majors.append(_normalize(contact.get("Major", "")))
        contact_majors.append(_normalize(contact.get("major", "")))
        contact_majors = [m for m in contact_majors if m]

        if any(user_major in m or m in user_major for m in contact_majors):
            points += 10
            signals.append({"signal": "same_major", "points": 10,
                            "detail": user_major})

    # Same hometown / metro (+8) -------------------------------------------
    if commonality_type == "hometown":
        points += 8
        signals.append({"signal": "same_hometown", "points": 8,
                        "detail": details.get("city", "")})
    else:
        # Fallback: direct location comparison
        user_hometown = comparison["hometown"]
        if user_hometown:
            contact_location = _normalize(
                _get_field(contact, "location", "City")
            )
            if contact_location and (
                user_hometown in contact_location
                or contact_location in user_hometown
            ):
                points += 8
                signals.append({"signal": "same_hometown", "points": 8,
                                "detail": contact_location})

    # Same past employer (+15) ---------------------------------------------
    if commonality_type == "company":
        points += 15
        signals.append({"signal": "same_past_employer", "points": 15,
                        "detail": details.get("company", "")})
    else:
        contact_company = _normalize(_get_field(contact, "company", "Company"))
        if contact_company and contact_company in comparison["past_companies"]:
            points += 15
            signals.append({"signal": "same_past_employer", "points": 15,
                            "detail": contact_company})

    # Cap the tier
    if points > SHARED_IDENTITY_CAP:
        points = SHARED_IDENTITY_CAP

    return points, signals


def _role_matches_industry(contact, career_track):
    """Check if the contact's role/company matches the user's target industry."""
    if not career_track:
        return False

    # Normalize user-facing career track (e.g. "investment banking") to
    # canonical key (e.g. "investment_banking") for INDUSTRY_KEYWORDS lookup.
    canonical = normalize_career_track(career_track)
    keywords = INDUSTRY_KEYWORDS.get(canonical)
    if not keywords:
        # Treat the career track itself as a keyword
        keywords = [career_track]

    searchable = " ".join([
        _normalize(_get_field(contact, "title", "Title")),
        _normalize(_get_field(contact, "company", "Company")),
        _normalize(contact.get("headline", "")),
        _normalize(contact.get("Headline", "")),
    ])

    return any(kw in searchable for kw in keywords)


def _score_career_relevance(comparison, contact):
    """Compute career-relevance signals."""
    points = 0
    signals = []

    # Role matches target industry (+15) -----------------------------------
    if _role_matches_industry(contact, comparison["career_track"]):
        points += 15
        signals.append({"signal": "role_matches_industry", "points": 15,
                        "detail": comparison["career_track"]})

    # Career transition the user wants to make (+12) -----------------------
    transition = _detect_career_transition(contact)
    if transition is not None:
        points += 12
        signals.append({"signal": "career_transition", "points": 12,
                        "detail": transition.get("value", "")})

    # Company on dream list (+10) ------------------------------------------
    contact_company = _normalize(_get_field(contact, "company", "Company"))
    if contact_company and contact_company in comparison["dream_companies"]:
        points += 10
        signals.append({"signal": "dream_company", "points": 10,
                        "detail": contact_company})

    # Recently joined < 2 years (+8) ---------------------------------------
    tenure = _detect_tenure(contact)
    if tenure is not None:
        # _detect_tenure now returns a structured dict with numeric 'years' field
        years = tenure.get("years", 99)
        if years <= 2:
            points += 8
            signals.append({"signal": "recently_joined", "points": 8,
                            "detail": tenure.get("value", "")})

    return points, signals


def _score_role_match(comparison, contact):
    """
    Check if the contact's title matches the role keywords from the search query.

    Uses token overlap: tokenize both the search titles and the contact title,
    then check if any search title token appears in the contact title.

    Returns (points, signals, matched).  ``matched`` is a bool so callers
    can downgrade contacts that match on company/school but not role.
    """
    search_titles = comparison.get("search_titles", [])
    if not search_titles:
        # No search context available, skip role matching
        return 0, [], None  # None means "not evaluated"

    contact_title = _normalize(_get_field(contact, "title", "Title"))
    if not contact_title:
        return 0, [], False

    # Tokenize and check overlap
    contact_tokens = set(contact_title.split())
    for search_title in search_titles:
        search_tokens = set(search_title.split())
        # Match if any meaningful token overlaps (skip very short tokens like "at", "of")
        meaningful_overlap = search_tokens & contact_tokens - {"at", "of", "in", "the", "a", "an", "and", "or", "for", "to"}
        if meaningful_overlap:
            return 15, [{"signal": "role_match", "points": 15,
                         "detail": search_title}], True
        # Also check substring: "data scientist" in "senior data scientist"
        if search_title in contact_title or contact_title in search_title:
            return 15, [{"signal": "role_match", "points": 15,
                         "detail": search_title}], True

    return 0, [], False


def _score_data_richness(contact):
    """Compute data-richness signals."""
    points = 0
    signals = []

    # Has headline + title (+5) --------------------------------------------
    headline = (
        contact.get("headline") or contact.get("Headline") or ""
    )
    title = _get_field(contact, "title", "Title")
    if headline and title:
        points += 5
        signals.append({"signal": "has_headline_and_title", "points": 5})

    # Work history 2+ jobs (+8) --------------------------------------------
    experience = contact.get("experience", [])
    if not isinstance(experience, list):
        experience = []
    if len(experience) >= 2:
        points += 8
        signals.append({"signal": "rich_work_history", "points": 8,
                        "detail": f"{len(experience)} positions"})

    # Education data present (+7) ------------------------------------------
    has_education = bool(
        contact.get("educationArray")
        or contact.get("College")
        or contact.get("education")
        or contact.get("EducationTop")
    )
    if has_education:
        points += 7
        signals.append({"signal": "has_education_data", "points": 7})

    # Has skills / interests (+5) ------------------------------------------
    has_skills = bool(
        contact.get("skills")
        or contact.get("interests")
        or contact.get("Skills")
        or contact.get("Interests")
    )
    if has_skills:
        points += 5
        signals.append({"signal": "has_skills_interests", "points": 5})

    return points, signals


def _tier_label(score):
    """Return 'warm', 'neutral', or 'cold' based on score."""
    if score >= TIER_THRESHOLDS["warm"]:
        return "warm"
    if score >= TIER_THRESHOLDS["neutral"]:
        return "neutral"
    return "cold"


def _compute_warmth_label(tier, role_matched, signals):
    """
    Build a user-facing label that reflects role match quality.

    Tiers:
    - role match + warm  → "Strong fit"
    - role match + neutral → "Good fit"
    - no role match but dream_company or same_university → "Right company, different role"
    - role_matched is None (no search context) → fall back to tier-based label
    - otherwise → "" (no label)
    """
    signal_names = {s.get("signal") for s in signals}

    if role_matched is None:
        # No search query context, use legacy tier-based labels
        if tier == "warm":
            return "Strong match"
        if tier == "neutral":
            return "Good fit"
        return ""

    if role_matched:
        if tier == "warm":
            return "Strong fit"
        return "Good fit"

    # Role did NOT match
    has_company = "dream_company" in signal_names
    has_school = "same_university" in signal_names
    if has_company or has_school:
        return "Right company, different role"

    return ""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_warmth_score(user_comparison, contact):
    """
    Score a single contact against pre-built user comparison data.

    Parameters
    ----------
    user_comparison : dict
        Output of ``_build_user_comparison_data``.
    contact : dict
        Contact record (legacy, PDL, or Firestore format).

    Returns
    -------
    dict
        ``{"score": int, "tier": str, "signals": [...]}"``
    """
    # Normalize field names so Firestore-saved contacts work
    contact = _normalize_contact_for_scoring(contact)
    all_signals = []

    identity_pts, identity_signals = _score_shared_identity(user_comparison, contact)
    all_signals.extend(identity_signals)

    career_pts, career_signals = _score_career_relevance(user_comparison, contact)
    all_signals.extend(career_signals)

    role_pts, role_signals, role_matched = _score_role_match(user_comparison, contact)
    all_signals.extend(role_signals)

    richness_pts, richness_signals = _score_data_richness(contact)
    all_signals.extend(richness_signals)

    total = identity_pts + career_pts + role_pts + richness_pts
    tier = _tier_label(total)

    # Build a human-readable label that accounts for role match
    label = _compute_warmth_label(tier, role_matched, all_signals)

    return {
        "score": total,
        "tier": tier,
        "label": label,
        "signals": all_signals,
    }


def score_and_sort_contacts(user_profile, contacts, search_context=None):
    """
    Score every contact against *user_profile* and return them sorted
    descending by score.  Never filters contacts out.

    Parameters
    ----------
    user_profile : dict
        Full user document from Firestore.
    contacts : list[dict]
        Contact records (legacy or PDL format).
    search_context : dict, optional
        Parsed query payload with ``title_variations`` and ``companies``.

    Returns
    -------
    list[dict]
        Each contact dict gains ``warmth_score``, ``warmth_tier``,
        ``warmth_label``, and ``warmth_signals`` keys.
        List is sorted highest score first.
    """
    comparison = _build_user_comparison_data(user_profile, search_context)

    scored = []
    for contact in contacts:
        result = compute_warmth_score(comparison, contact)
        contact["warmth_score"] = result["score"]
        contact["warmth_tier"] = result["tier"]
        contact["warmth_label"] = result.get("label", "")
        contact["warmth_signals"] = result["signals"]
        scored.append(contact)

    scored.sort(key=lambda c: c["warmth_score"], reverse=True)
    return scored


def score_contacts_for_email(user_profile, contacts, search_context=None):
    """
    Score contacts and return warmth data dict keyed by contact index.

    This is the orchestration helper used by all callers of
    ``batch_generate_emails``.  It runs warmth scoring once per batch
    and packages the results so the email generator can select prompt
    variants per contact.

    Returns
    -------
    dict
        ``{0: {"tier": "warm", "score": 62, "signals": [...]}, 1: ...}``
        Returns empty dict on any error (email generation degrades to
        default prompt, never fails).
    """
    try:
        comparison = _build_user_comparison_data(user_profile, search_context)
        warmth_data = {}
        for i, contact in enumerate(contacts):
            result = compute_warmth_score(comparison, contact)
            warmth_data[i] = {
                "tier": result["tier"],
                "score": result["score"],
                "label": result.get("label", ""),
                "signals": result["signals"],
            }
        return warmth_data
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Warmth scoring failed, falling back to default: %s", exc
        )
        return {}


# ---------------------------------------------------------------------------
# Briefing line builder (deterministic, no LLM)
# ---------------------------------------------------------------------------

# Signals worth mentioning in a briefing line.  Anything not in this set
# produces too-generic text ("has education data") and gets dropped.
_MEANINGFUL_SIGNALS = frozenset({
    "dream_company",
    "same_university",
    "same_major",
    "same_hometown",
    "same_past_company",
    "recently_joined",
    "career_transition",
    "target_industry_match",
})


def build_briefing_line(contact, warmth_signals):
    """
    Build a deterministic one-line explanation of why a contact matters.

    Returns empty string when no meaningful signals exist (caller should
    not render anything).
    """
    if not warmth_signals:
        return ""

    meaningful = [s for s in warmth_signals if s.get("signal") in _MEANINGFUL_SIGNALS]
    if not meaningful:
        return ""

    parts = []
    for sig in meaningful[:3]:
        signal = sig.get("signal", "")
        detail = sig.get("detail", "")

        if signal == "dream_company":
            company = detail or (contact.get("Company") or contact.get("company") or "")
            if company:
                parts.append(f"At your dream company {company}")
        elif signal == "same_university":
            uni = detail or (contact.get("College") or "")
            if uni:
                parts.append(f"Went to {uni} like you")
            else:
                parts.append("Shared university")
        elif signal == "same_major":
            parts.append(f"Studied {detail}" if detail else "Same major")
        elif signal == "same_hometown":
            parts.append(f"From {detail}" if detail else "Same hometown")
        elif signal == "same_past_company":
            parts.append(f"Both worked at {detail}" if detail else "Shared employer")
        elif signal == "recently_joined":
            parts.append("Recently joined" + (f" {detail}" if detail else ""))
        elif signal == "career_transition":
            parts.append("Career transition match")
        elif signal == "target_industry_match":
            parts.append("In your target industry")

    if not parts:
        return ""

    return ". ".join(parts) + "."
