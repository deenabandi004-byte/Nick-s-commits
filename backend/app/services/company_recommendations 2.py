# contract: keep in sync with connect-grow-hire/src/types/companyRecommendation.ts
"""
Company recommendations service - deterministic R4/R5 scout sentences.
Phase 5 adds LLM variation for the hero detail paragraph.
"""
import logging
from ..models.company_recommendation import ScoutSentence, CompanyMark, CompanyRecommendation
from ..data.company_marks import get_company_mark
from ..services.school_affinity import get_school_affinity

logger = logging.getLogger(__name__)

# ── Industry → company mapping (mirrors frontend suggestionChips.ts) ──────

INDUSTRY_COMPANIES = {
    "Investment Banking": [
        {"name": "Goldman Sachs", "city": "New York"},
        {"name": "JPMorgan", "city": "New York"},
        {"name": "Morgan Stanley", "city": "New York"},
        {"name": "Citi", "city": "New York"},
        {"name": "Barclays", "city": "New York"},
        {"name": "Deutsche Bank", "city": "New York"},
    ],
    "Consulting": [
        {"name": "McKinsey", "city": "New York"},
        {"name": "BCG", "city": "Boston"},
        {"name": "Bain", "city": "Boston"},
        {"name": "Deloitte", "city": "New York"},
        {"name": "Oliver Wyman", "city": "New York"},
    ],
    "Tech": [
        {"name": "Google", "city": "Mountain View"},
        {"name": "Meta", "city": "Menlo Park"},
        {"name": "Apple", "city": "Cupertino"},
        {"name": "Microsoft", "city": "Redmond"},
        {"name": "Stripe", "city": "San Francisco"},
        {"name": "Airbnb", "city": "San Francisco"},
    ],
    "Finance": [
        {"name": "BlackRock", "city": "New York"},
        {"name": "Fidelity", "city": "Boston"},
        {"name": "Citadel", "city": "Chicago"},
        {"name": "Two Sigma", "city": "New York"},
        {"name": "Point72", "city": "Stamford"},
    ],
    "Marketing": [
        {"name": "WPP", "city": "London"},
        {"name": "Omnicom", "city": "New York"},
        {"name": "Publicis", "city": "New York"},
        {"name": "Ogilvy", "city": "New York"},
    ],
    "Healthcare": [
        {"name": "Johnson & Johnson", "city": "New Brunswick"},
        {"name": "Pfizer", "city": "New York"},
        {"name": "CVS Health", "city": "Woonsocket"},
    ],
}

INDUSTRY_ALIASES = {
    "investment banking": "Investment Banking",
    "ib": "Investment Banking",
    "banking": "Investment Banking",
    "management consulting": "Consulting",
    "consulting": "Consulting",
    "strategy consulting": "Consulting",
    "technology": "Tech",
    "tech": "Tech",
    "software": "Tech",
    "software engineering": "Tech",
    "product management": "Tech",
    "data science": "Tech",
    "data science & analytics": "Tech",
    "data analytics": "Tech",
    "machine learning": "Tech",
    "artificial intelligence": "Tech",
    "ai": "Tech",
    "engineering": "Tech",
    "computer science": "Tech",
    "cybersecurity": "Tech",
    "ux design": "Tech",
    "product design": "Tech",
    "finance": "Finance",
    "asset management": "Finance",
    "hedge funds": "Finance",
    "private equity": "Finance",
    "venture capital": "Finance",
    "wealth management": "Finance",
    "financial services": "Finance",
    "marketing": "Marketing",
    "marketing and advertising": "Marketing",
    "advertising": "Marketing",
    "healthcare": "Healthcare",
    "health": "Healthcare",
    "biotech": "Healthcare",
    "media": "Marketing",
    "entertainment": "Marketing",
}

LOCATION_INDUSTRY_HINTS = {
    "new york": ["Investment Banking", "Finance"],
    "san francisco": ["Tech"],
    "chicago": ["Consulting", "Finance"],
    "los angeles": ["Tech", "Marketing"],
    "boston": ["Consulting", "Healthcare"],
    "dallas": ["Finance"],
    "houston": ["Finance"],
    "seattle": ["Tech"],
}

# ── University abbreviations ──────────────────────────────────────────

UNIVERSITY_SHORT = {
    "University of Southern California": "USC",
    "University of California, Los Angeles": "UCLA",
    "University of Michigan": "UMich",
    "University of Pennsylvania": "UPenn",
    "New York University": "NYU",
    "Georgetown University": "Georgetown",
    "University of California, Berkeley": "UC Berkeley",
    "Massachusetts Institute of Technology": "MIT",
    "Stanford University": "Stanford",
    "Columbia University": "Columbia",
    "Harvard University": "Harvard",
    "Yale University": "Yale",
    "Princeton University": "Princeton",
    "Cornell University": "Cornell",
    "Duke University": "Duke",
    "Northwestern University": "Northwestern",
    "University of Chicago": "UChicago",
    "University of Virginia": "UVA",
    "University of Texas at Austin": "UT Austin",
}

# ── Demonym mapping ───────────────────────────────────────────────────

UNIVERSITY_DEMONYMS = {
    "University of Southern California": ("Trojans", "high"),
    "University of California, Los Angeles": ("Bruins", "high"),
    "University of Michigan": ("Wolverines", "high"),
    "University of Pennsylvania": ("Quakers", "high"),
    "New York University": ("Violets", "medium"),
    "Georgetown University": ("Hoyas", "high"),
    "Stanford University": ("Cardinal", "high"),
    "Columbia University": ("Lions", "medium"),
    "Harvard University": ("Crimson", "high"),
    "Yale University": ("Bulldogs", "high"),
    "Princeton University": ("Tigers", "high"),
    "Cornell University": ("Big Red", "medium"),
    "Duke University": ("Blue Devils", "high"),
    "Northwestern University": ("Wildcats", "high"),
    "University of Chicago": ("Maroons", "medium"),
}

# ── Seal colors (school brand color for UI) ───────────────────────────

UNIVERSITY_SEAL_COLORS = {
    "University of Southern California": "#990000",
    "University of California, Los Angeles": "#2774AE",
    "University of Michigan": "#00274C",
    "University of Pennsylvania": "#011F5B",
    "New York University": "#57068C",
    "Georgetown University": "#041E42",
    "Stanford University": "#8C1515",
    "Columbia University": "#B9D9EB",
    "Harvard University": "#A41034",
    "Yale University": "#00356B",
    "Princeton University": "#E77500",
    "Cornell University": "#B31B1B",
    "Duke University": "#003087",
    "Northwestern University": "#4E2A84",
    "University of Chicago": "#800000",
    "University of Virginia": "#232D4B",
    "University of Texas at Austin": "#BF5700",
    "MIT": "#A31F34",
}


def _short_university(uni: str) -> str:
    return UNIVERSITY_SHORT.get(uni, uni)


def _resolve_industry(raw: str) -> str | None:
    lower = raw.lower().strip()
    # Exact match first
    if lower in INDUSTRY_ALIASES:
        return INDUSTRY_ALIASES[lower]
    # Substring match fallback - e.g. "Data Science & Analytics" contains "data science"
    for alias, industry in INDUSTRY_ALIASES.items():
        if alias in lower or lower in alias:
            return industry
    return None


def _build_scout_sentence(company_name: str, sector: str, user_ctx: dict, alumni_count: int = 0) -> ScoutSentence:
    """
    Deterministic scout ladder. Phase 1: R4/R5 only.
    R4: cohort stat available (alumni count >= 3) with real data
    R5: sector-only fallback
    """
    school = _short_university(user_ctx.get("university", ""))
    major = user_ctx.get("major", "your field")

    # R5: sector-only fallback (default) - vary by company name hash
    r5_shorts = [
        f"{sector} company that recruits {major} students.",
        f"Strong {sector.lower()} presence - relevant to your {major} background.",
        f"Actively hiring in {sector.lower()} roles that match your profile.",
        f"Well-known {sector.lower()} employer with {major}-relevant teams.",
        f"{sector} firm aligned with your career interests.",
    ]
    short = r5_shorts[hash(company_name) % len(r5_shorts)]
    headline = f"{company_name} - {short}"
    detail = f"No tracked {school} alumni here yet - but the sector and location match your profile." if school else f"The sector matches your profile."
    rung = "R5"
    stat_value = " - "
    stat_label = "on your radar"

    # R4: fires when real alumni count >= 3
    if alumni_count >= 3 and school:
        recent = max(1, alumni_count // 4)
        rung = "R4"
        stat_value = str(alumni_count)
        stat_label = "alumni"
        headline = f"{alumni_count} {school} alumni work here in {sector.lower()} roles - {recent} joined this year."
        detail = f"A deep pipeline for {school} {major} students. No single warmest intro yet - but the numbers are strong."
        short = f"{alumni_count} {school} alumni in {sector.lower()} roles."

    return ScoutSentence(
        rung=rung,
        headline=headline,
        detail=detail,
        short=short,
        stat_value=stat_value,
        stat_label=stat_label,
        facts_used=[],
    )


def _score_company(company: dict, sector: str, user_ctx: dict, alumni_count: int = 0) -> float:
    """Score a company for recommendation ranking."""
    score = 0.0
    resolved_industries = []
    for interest in user_ctx.get("target_industries", []):
        resolved = _resolve_industry(interest)
        if resolved:
            resolved_industries.append(resolved)

    # +2 for industry match
    if sector in resolved_industries:
        score += 2.0

    # +1 for location match
    preferred_locations = user_ctx.get("preferred_locations", [])
    for loc in preferred_locations:
        loc_lower = loc.lower()
        for hint_loc, hint_industries in LOCATION_INDUSTRY_HINTS.items():
            if hint_loc in loc_lower and sector in hint_industries:
                score += 1.0
                break

    # +1 for career track match
    career_track = user_ctx.get("career_track", "")
    if career_track:
        track_industry = _resolve_industry(career_track)
        if track_industry == sector:
            score += 1.0

    # +0.5 max for alumni count (saturates at 10)
    if alumni_count > 0:
        score += 0.5 * min(alumni_count / 10, 1.0)

    return score


def get_recommendations(user_data: dict) -> dict:
    """
    Build company recommendations for a user.
    Returns the full response shape matching the API contract.
    """
    # Extract user context from Firestore user document
    professional = user_data.get("professionalInfo") or {}
    goals = user_data.get("goals") or {}
    location_data = user_data.get("location") or {}

    university = (
        user_data.get("university")
        or professional.get("university")
        or user_data.get("school")
        or ""
    )
    major = (
        professional.get("major")
        or user_data.get("major")
        or ""
    )
    name = user_data.get("name") or user_data.get("displayName") or ""
    first_name = name.split()[0] if name else ""

    # Collect target industries from multiple sources
    target_industries = []
    for source in [
        user_data.get("careerInterests"),
        professional.get("interests"),
        goals.get("targetIndustries"),
        user_data.get("targetIndustries"),
    ]:
        if isinstance(source, list):
            target_industries.extend(source)
        elif isinstance(source, str) and source.strip():
            target_industries.extend([s.strip() for s in source.split(",")])

    # Deduplicate
    seen = set()
    unique_industries = []
    for ind in target_industries:
        low = ind.lower().strip()
        if low and low not in seen:
            seen.add(low)
            unique_industries.append(ind)
    target_industries = unique_industries

    # Collect preferred locations
    preferred_locations = []
    for source in [
        location_data.get("interests"),
        user_data.get("preferredLocations"),
        goals.get("targetLocations"),
    ]:
        if isinstance(source, list):
            preferred_locations.extend(source)
        elif isinstance(source, str) and source.strip():
            preferred_locations.extend([s.strip() for s in source.split(",")])

    career_track = (
        professional.get("careerTrack")
        or user_data.get("careerTrack")
        or ""
    )

    user_ctx = {
        "university": university,
        "major": major or "your field",
        "target_industries": target_industries,
        "preferred_locations": preferred_locations,
        "career_track": career_track,
        "name": name,
    }

    # Fetch real alumni counts via school_affinity (Firestore-cached 30 days)
    alumni_counts: dict[str, int] = {}
    if university:
        resolved_set = set()
        for interest in target_industries[:3]:
            resolved = _resolve_industry(interest)
            if resolved and resolved not in resolved_set:
                resolved_set.add(resolved)
                try:
                    affinity = get_school_affinity(university, interest)
                    for entry in affinity:
                        name_lower = entry.get("company_name", "").lower().strip()
                        count = entry.get("alumni_count", 0)
                        if name_lower and count > 0:
                            alumni_counts[name_lower] = max(
                                alumni_counts.get(name_lower, 0), count
                            )
                except Exception as e:
                    logger.warning("school_affinity failed for %s/%s: %s", university, interest, e)

    # Build candidate list
    candidates = []
    seen_companies = set()
    for sector, companies in INDUSTRY_COMPANIES.items():
        for comp in companies:
            if comp["name"] not in seen_companies:
                seen_companies.add(comp["name"])
                ac = alumni_counts.get(comp["name"].lower(), 0)
                score = _score_company(comp, sector, user_ctx, alumni_count=ac)
                candidates.append({
                    "name": comp["name"],
                    "city": comp["city"],
                    "sector": sector,
                    "score": score,
                    "alumni_count": ac,
                })

    # Sort by score desc, then alphabetically
    candidates.sort(key=lambda c: (-c["score"], c["name"]))

    # Take top 5
    top = candidates[:5]

    # Build recommendations
    recommendations = []
    for i, comp in enumerate(top):
        mark_data = get_company_mark(comp["name"])
        scout = _build_scout_sentence(
            comp["name"], comp["sector"], user_ctx,
            alumni_count=comp.get("alumni_count", 0),
        )

        rec = CompanyRecommendation(
            rank=i + 1,
            id=comp["name"].lower().replace(" ", "-").replace("&", "and"),
            name=comp["name"],
            mark=CompanyMark(**mark_data),
            sector=comp["sector"],
            city=comp["city"],
            scout=scout,
        )
        recommendations.append(rec)

    # Build user context for response
    school_short = _short_university(university)
    demonym_entry = UNIVERSITY_DEMONYMS.get(university)
    demonym = demonym_entry[0] if demonym_entry else None
    demonym_confidence = demonym_entry[1] if demonym_entry else "low"
    seal_color = UNIVERSITY_SEAL_COLORS.get(university, "#1B2A44")

    # Log rung distribution
    rung_dist = {}
    for rec in recommendations:
        rung_dist[rec.scout.rung] = rung_dist.get(rec.scout.rung, 0) + 1
    logger.info(
        "company_recommendations: uid=%s, count=%d, rung_distribution=%s",
        user_data.get("uid", "?"), len(recommendations), rung_dist
    )

    return {
        "user": {
            "name": first_name,
            "school": school_short,
            "seal": school_short[0] if school_short else "?",
            "sealColor": seal_color,
            "major": major,
            "location": preferred_locations[0] if preferred_locations else "",
            "demonym": demonym,
            "demonymConfidence": demonym_confidence,
        },
        "stats": {
            "alumni_tracked": sum(alumni_counts.values()),
            "jobs_indexed": 0,
            "last_updated": "",
        },
        "companies": [rec.to_dict() for rec in recommendations],
    }
