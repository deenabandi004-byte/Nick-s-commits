"""Role taxonomy shared between PDL contact search and Perplexity job search.

Originally inlined in pdl_client.py for retry_level=1 (family expansion) and
retry_level=2 (seniority-adjacent expansion). Lifted here verbatim so the
Perplexity job-search broadening flow (execute_find_jobs) can reuse the same
substring-match-against-family-dict heuristic without duplicating maintenance.

Behavior MUST stay byte-identical with the pre-extraction pdl_client.py code —
existing PDL retry rungs depend on the exact title list ordering and dedup
semantics.
"""


# Role-family expansion for the title-broadening retry rung (retry_level=1).
# Each key is a canonical role; the value is a list of adjacent titles that often
# overlap with the user's intent when the strict match_phrase query returns too few
# results. Used by `_expand_titles_for_broadening`.
#
# WHY: PDL's strict match_phrase on "data scientist" at Google+USC returns 6 hits.
# Expanding to {data scientist, data analyst, data engineer, data science manager}
# lifts that to 8 — a meaningful gain when the initial query has 0 new contacts
# after dedup. See /tmp/pdl_diagnostic.py for the raw counts.
_TITLE_FAMILY_EXPANSIONS = {
    # Data family
    "data scientist":   ["data scientist", "data analyst", "data engineer", "data science manager", "machine learning engineer"],
    "data analyst":     ["data analyst", "data scientist", "business analyst", "analytics manager"],
    "data engineer":    ["data engineer", "data scientist", "software engineer", "machine learning engineer"],
    # Software family
    "software engineer":        ["software engineer", "software developer", "backend engineer", "frontend engineer", "full stack engineer"],
    "software developer":       ["software developer", "software engineer", "backend developer", "frontend developer"],
    "machine learning engineer":["machine learning engineer", "ml engineer", "data scientist", "ai engineer"],
    # Product family
    "product manager":  ["product manager", "product owner", "technical program manager", "program manager", "associate product manager"],
    # Finance family
    "investment banking analyst":   ["investment banking analyst", "analyst", "financial analyst", "banking analyst"],
    "investment banking associate": ["investment banking associate", "associate", "banking associate"],
    "financial analyst":            ["financial analyst", "investment analyst", "analyst"],
    # Consulting family
    "consultant":           ["consultant", "management consultant", "associate consultant", "business analyst"],
    "management consultant":["management consultant", "consultant", "associate consultant", "strategy consultant"],
    # Recruiting family
    "recruiter":    ["recruiter", "technical recruiter", "talent acquisition specialist", "sourcer"],
}


def _expand_titles_for_broadening(title_variations):
    """
    Given the prompt parser's `title_variations` list, return a broadened list that
    adds role-family cousins from _TITLE_FAMILY_EXPANSIONS. Used by retry_level=1.

    - Preserves the original titles as the first entries (priority for scoring).
    - Adds family cousins only for titles that have a family entry; others pass
      through unchanged.
    - Deduplicates case-insensitively while preserving first-seen order.
    """
    if not title_variations:
        return []
    seen = set()
    expanded = []
    for t in title_variations:
        tl = (t or "").strip().lower()
        if not tl or tl in seen:
            continue
        expanded.append(tl)
        seen.add(tl)
    # Second pass: for each original title, pull in matching family variants
    for tl in list(expanded):
        for family_key, family_variants in _TITLE_FAMILY_EXPANSIONS.items():
            if tl == family_key or (family_key in tl) or (tl in family_key and len(tl) >= 5):
                for v in family_variants:
                    vl = v.strip().lower()
                    if vl and vl not in seen:
                        expanded.append(vl)
                        seen.add(vl)
    return expanded


_SENIORITY_ADJACENT_TITLES = {
    "analyst": ["analyst", "associate", "research associate", "junior associate", "senior analyst"],
    "associate": ["associate", "analyst", "senior analyst", "consultant", "senior associate"],
    "manager": ["manager", "director", "senior manager", "team lead", "associate director"],
    "engineer": ["engineer", "developer", "software engineer", "senior engineer", "staff engineer"],
    "consultant": ["consultant", "associate", "analyst", "advisor", "senior consultant"],
    "intern": ["intern", "co-op", "fellow", "trainee", "analyst"],
    "director": ["director", "senior director", "vice president", "manager", "head"],
    "vice president": ["vice president", "director", "senior vice president", "managing director"],
}


def _expand_titles_seniority_adjacent(title_variations):
    """
    Given title variations, expand to adjacent seniority levels.
    E.g. "analyst" → ["analyst", "associate", "research associate", "junior associate", "senior analyst"]
    Used by retry_level=2 to maintain role intent while broadening seniority.
    """
    if not title_variations:
        return []
    seen = set()
    expanded = []

    # First pass: include originals
    for t in title_variations:
        tl = (t or "").strip().lower()
        if not tl or tl in seen:
            continue
        expanded.append(tl)
        seen.add(tl)

    # Second pass: for each original, find matching seniority family
    for tl in list(expanded):
        for seniority_key, adjacent in _SENIORITY_ADJACENT_TITLES.items():
            # Match if the seniority key appears in the title or vice versa
            if seniority_key in tl or tl in seniority_key:
                for adj in adjacent:
                    adj_lower = adj.strip().lower()
                    if adj_lower and adj_lower not in seen:
                        expanded.append(adj_lower)
                        seen.add(adj_lower)
                break  # Only match one seniority family per title

    # Also include the role-family expansions from level 1
    family_expanded = _expand_titles_for_broadening(title_variations)
    for t in family_expanded:
        tl = t.strip().lower()
        if tl and tl not in seen:
            expanded.append(tl)
            seen.add(tl)

    return expanded


# ── Perplexity job-search broadening wrapper ──────────────────────────────
#
# Levels mirror PDL's retry-rung concept but apply to a free-text query passed
# to Perplexity's `search_jobs_live` rather than a structured Elasticsearch
# bool query. Each level produces a single broadened query string; the caller
# searches and filters at that level, then advances if zero real postings come
# back.
#
# Returns None when:
# - role is empty for levels 1-3 (broadening a generic fallback like
#   "internship" just wastes Perplexity calls without changing the results)
# - the produced query would equal the prior level's query (the family-expansion
#   dict has no entry for the role, or location was already "United States"
#   at level 2). The caller skips the duplicate level instead of calling
#   Perplexity twice with the same string.

# Location escalation ladder for level 3. Heuristic: if the brief targets a
# specific metro/state, widen to the country. If the brief already targets the
# country, level 3 collapses to level 2's query and returns None.
_NATIONAL_LOCATION = "United States"


def _is_national_location(location: str) -> bool:
    if not location:
        return True
    loc = location.strip().lower()
    return loc in {
        "united states", "usa", "us", "u.s.", "u.s.a.", "america", "remote",
    }


def _widen_location(location: str) -> str:
    """Return the next-broader location for level 3. Today: any specific
    location → "United States". Future: metro → state → country ladder."""
    if _is_national_location(location):
        return location or _NATIONAL_LOCATION
    return _NATIONAL_LOCATION


def _family_expand_role(role: str) -> str:
    """Return a single broadened role string from the family-expansion dict.

    Uses the same substring-match logic as `_expand_titles_for_broadening` so
    "Spatial Data Scientist" → "data scientist" (the canonical family key).
    Falls back to the original role lowercased if no family entry matches —
    the caller treats this as a no-op level (returns None from
    broaden_query_for_perplexity to skip the duplicate Perplexity call).
    """
    if not role:
        return ""
    rl = role.strip().lower()
    if not rl:
        return ""
    # Direct match
    if rl in _TITLE_FAMILY_EXPANSIONS:
        return rl
    # Substring match (mirrors _expand_titles_for_broadening's check)
    for family_key in _TITLE_FAMILY_EXPANSIONS:
        if family_key in rl or (rl in family_key and len(rl) >= 5):
            return family_key
    return rl


def broaden_query_for_perplexity(
    role: str,
    company: str,
    location: str,
    level: int,
) -> str | None:
    """Compose a Perplexity job-search query string for the given broadening level.

    Level 0: "{role} at {company}" (or role alone if no company).
    Level 1: family-expanded role + " at {company}".
    Level 2: family-expanded role only (drop company qualifier).
    Level 3: family-expanded role with a widened location appended.

    Returns None when:
    - role is empty for levels 1-3 (skip — broadening a generic fallback is a
      waste of Perplexity calls and produces identical results).
    - the produced query would equal the prior level's query (caller can skip
      the duplicate call without burning quota).

    Location is not embedded in levels 0-2 because `search_jobs_live` accepts
    location as a separate parameter — only level 3 surfaces the widened
    location as a hint in the query string itself.
    """
    role = (role or "").strip()
    company = (company or "").strip()
    location = (location or "").strip()

    if level == 0:
        if role and company:
            return f"{role} at {company}"
        if role:
            return role
        # No role, no company: signal caller to use its "internship" fallback.
        return None

    # Levels 1-3 require a role to broaden — generic fallback would re-search
    # the same string.
    if not role:
        return None

    expanded = _family_expand_role(role)
    role_lc = role.lower()

    if level == 1:
        # Family-expand role, keep company in the query.
        if not company:
            # No company means level 1's role-family expansion is identical to
            # what level 2 would produce — caller can skip this rung.
            return None
        if expanded == role_lc:
            # No family entry — query would equal level 0's "{role} at {company}".
            return None
        return f"{expanded} at {company}"

    if level == 2:
        # Drop company qualifier entirely. Caller's level 1 query (if it ran)
        # was "{expanded} at {company}" — dropping company is always different,
        # so the dup check is vs level 0 (no company in the brief).
        if not company and expanded == role_lc:
            # Brief has no company AND no family entry: level 2 == level 0.
            return None
        return expanded

    if level == 3:
        # Family-expanded role + widened location embedded in the query.
        if _is_national_location(location):
            # Already nationwide — widening would produce the same query as
            # level 2.
            return None
        wider = _widen_location(location)
        if wider == location:
            return None
        return f"{expanded} in {wider}"

    return None
