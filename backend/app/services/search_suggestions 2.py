"""
Smart Search Suggestions - Phase 2.

Analyzes user goals, search history, and contacts to suggest next searches.
Uses a deterministic gap-analysis approach (no LLM cost) with optional
GPT-4o-mini enhancement for richer reasoning.
"""
import logging
from datetime import datetime, timezone

from app.extensions import get_db
from app.services.company_recommendations import (
    INDUSTRY_COMPANIES,
    INDUSTRY_ALIASES,
    _resolve_industry,
)

logger = logging.getLogger(__name__)

# Seniority levels to suggest broadening to
SENIORITY_SUGGESTIONS = {
    "analyst": ["associate", "vice president"],
    "associate": ["analyst", "vice president"],
    "vice president": ["associate", "director"],
    "intern": ["analyst", "associate"],
}

# Adjacent industry mapping
ADJACENT_INDUSTRIES = {
    "Investment Banking": ["Finance", "Consulting"],
    "Consulting": ["Tech", "Investment Banking"],
    "Tech": ["Finance", "Consulting"],
    "Finance": ["Investment Banking", "Tech"],
    "Marketing": ["Tech", "Consulting"],
    "Healthcare": ["Consulting", "Tech"],
}


def _get_user_context(db, uid: str) -> dict:
    """Fetch user goals, search history, and contacted companies."""
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() or {} if user_doc.exists else {}

    goals = user_data.get("goals") or {}
    professional = user_data.get("professionalInfo") or {}

    career_track = (
        professional.get("careerTrack")
        or user_data.get("careerTrack")
        or goals.get("careerTrack")
        or ""
    )
    dream_companies = goals.get("dreamCompanies") or user_data.get("dreamCompanies") or []
    if isinstance(dream_companies, str):
        dream_companies = [c.strip() for c in dream_companies.split(",") if c.strip()]

    university = (
        user_data.get("university")
        or professional.get("university")
        or user_data.get("school")
        or ""
    )

    target_industries = []
    for source in [
        user_data.get("careerInterests"),
        professional.get("interests"),
        goals.get("targetIndustries"),
    ]:
        if isinstance(source, list):
            target_industries.extend(source)
        elif isinstance(source, str) and source.strip():
            target_industries.extend([s.strip() for s in source.split(",")])

    # Get recent search history (last 20)
    searches = []
    try:
        from firebase_admin import firestore as fs
        search_docs = list(
            db.collection("users").document(uid)
            .collection("searchHistory")
            .order_by("createdAt", direction=fs.Query.DESCENDING)
            .limit(20)
            .stream()
        )
        for doc in search_docs:
            searches.append(doc.to_dict() or {})
    except Exception:
        pass

    # Get companies already contacted
    contacted_companies = set()
    try:
        contacts = list(
            db.collection("users").document(uid)
            .collection("contacts")
            .limit(200)
            .stream()
        )
        for doc in contacts:
            data = doc.to_dict() or {}
            company = (data.get("company") or "").strip().lower()
            if company:
                contacted_companies.add(company)
    except Exception:
        pass

    return {
        "career_track": career_track,
        "dream_companies": dream_companies,
        "university": university,
        "target_industries": target_industries,
        "searches": searches,
        "contacted_companies": contacted_companies,
    }


def _extract_searched_companies(searches: list) -> set:
    """Extract company names from search history."""
    companies = set()
    for s in searches:
        company = (s.get("company") or s.get("query", {}).get("company") or "").strip().lower()
        if company:
            companies.add(company)
    return companies


def _extract_searched_titles(searches: list) -> set:
    """Extract job titles/seniority from search history."""
    titles = set()
    for s in searches:
        title = (s.get("jobTitle") or s.get("query", {}).get("jobTitle") or "").strip().lower()
        if title:
            titles.add(title)
    return titles


def get_search_suggestions(uid: str) -> list[dict]:
    """
    Generate 3-4 search suggestions based on gap analysis.
    No LLM cost - purely deterministic.

    Returns: [{"title": str, "company": str, "location": str, "reason": str}]
    """
    db = get_db()
    ctx = _get_user_context(db, uid)

    suggestions = []
    searched_companies = _extract_searched_companies(ctx["searches"])
    searched_titles = _extract_searched_titles(ctx["searches"])
    contacted = ctx["contacted_companies"]

    # 1. Dream companies not yet searched
    for company in ctx["dream_companies"]:
        if len(suggestions) >= 4:
            break
        if company.lower() not in searched_companies and company.lower() not in contacted:
            suggestions.append({
                "title": f"Analysts at {company}",
                "company": company,
                "jobTitle": "Analyst",
                "location": "",
                "reason": f"Dream company - you haven't explored {company} yet",
            })

    # 2. Industry companies not yet searched
    resolved_industries = set()
    for interest in ctx["target_industries"]:
        resolved = _resolve_industry(interest)
        if resolved:
            resolved_industries.add(resolved)
    if ctx["career_track"]:
        resolved = _resolve_industry(ctx["career_track"])
        if resolved:
            resolved_industries.add(resolved)

    for industry in resolved_industries:
        if len(suggestions) >= 4:
            break
        companies = INDUSTRY_COMPANIES.get(industry, [])
        for comp in companies:
            if len(suggestions) >= 4:
                break
            name = comp["name"]
            if name.lower() not in searched_companies and name.lower() not in contacted:
                suggestions.append({
                    "title": f"Professionals at {name}",
                    "company": name,
                    "jobTitle": "",
                    "location": comp.get("city", ""),
                    "reason": f"Top {industry.lower()} firm you haven't explored",
                })

    # 3. Seniority broadening - if user only searched one level, suggest others
    if searched_titles and len(suggestions) < 4:
        for title in list(searched_titles)[:2]:
            title_lower = title.lower()
            for level, alts in SENIORITY_SUGGESTIONS.items():
                if level in title_lower:
                    for alt in alts:
                        if alt not in searched_titles and len(suggestions) < 4:
                            # Pick a company they've already searched
                            if searched_companies:
                                comp = next(iter(searched_companies)).title()
                                suggestions.append({
                                    "title": f"{alt.title()}s at {comp}",
                                    "company": comp,
                                    "jobTitle": alt.title(),
                                    "location": "",
                                    "reason": f"Try reaching {alt.title()}-level contacts for different perspectives",
                                })
                    break

    # 4. Adjacent industry suggestion
    if len(suggestions) < 4:
        for industry in resolved_industries:
            if len(suggestions) >= 4:
                break
            adjacent = ADJACENT_INDUSTRIES.get(industry, [])
            for adj_ind in adjacent:
                if adj_ind not in resolved_industries and len(suggestions) < 4:
                    adj_companies = INDUSTRY_COMPANIES.get(adj_ind, [])
                    if adj_companies:
                        comp = adj_companies[0]
                        suggestions.append({
                            "title": f"Explore {adj_ind}",
                            "company": comp["name"],
                            "jobTitle": "",
                            "location": comp.get("city", ""),
                            "reason": f"Adjacent to {industry.lower()} - students often explore both",
                        })

    return suggestions[:4]


def get_cached_suggestions(uid: str) -> list[dict]:
    """
    Return cached suggestions or generate fresh ones.
    Caches in Firestore for 24 hours.
    """
    db = get_db()
    cache_ref = db.collection("users").document(uid).collection("cache").document("searchSuggestions")

    try:
        cache_doc = cache_ref.get()
        if cache_doc.exists:
            data = cache_doc.to_dict() or {}
            cached_at = data.get("cachedAt", "")
            if cached_at:
                cached_dt = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - cached_dt).total_seconds() / 3600
                if age_hours < 24:
                    return data.get("suggestions", [])
    except Exception:
        pass

    suggestions = get_search_suggestions(uid)

    try:
        cache_ref.set({
            "suggestions": suggestions,
            "cachedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })
    except Exception as exc:
        logger.warning("Failed to cache search suggestions: %s", exc)

    return suggestions
