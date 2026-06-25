"""
Hunter.io-backed person search — emergency replacement for PDL-based contact search
while PDL credits are exhausted.

Exposes one entry point matching `pdl_client.search_contacts_from_prompt` signature:
    search_people_via_hunter(parsed_prompt, max_contacts, exclude_keys=None, user_profile=None)
    -> (contacts, retry_level_used, already_saved_contacts, adjacency_metadata)

Strategy: best-effort.
- If parsed_prompt has any companies, resolve each to a domain and call Hunter
  Domain Search. Filter returned emails client-side against parsed title_variations.
- Filters Hunter cannot honor (school, location-of-person, past-company) are
  reported back via adjacency_metadata["unsupported_filters"] so the frontend
  can render a disclaimer banner instead of silently dropping.
- Queries with no company at all should not reach this function — the route
  layer returns 503 PDL_OUTAGE for those.
"""
import hashlib
import os
import time

from app.services.metering import meter_call
from typing import Dict, List, Optional, Tuple

import requests

from app.services.hunter import (
    HUNTER_API_KEY,
    extract_domain_from_url,
    get_smart_company_domain,
    is_personal_email_domain,
)


HUNTER_DOMAIN_SEARCH_URL = "https://api.hunter.io/v2/domain-search"
HUNTER_TIMEOUT_SEC = 12
HUNTER_PER_COMPANY_LIMIT = 25  # max emails to fetch per company
MAX_COMPANIES_PER_QUERY = 5    # cap to bound Hunter API spend on a single search


def _hunter_domain_search(
    domain: str,
    limit: int = HUNTER_PER_COMPANY_LIMIT,
    seniority: Optional[str] = None,
    department: Optional[str] = None,
) -> Dict:
    """Raw Hunter /v2/domain-search call. Returns parsed JSON `data` dict, or {}."""
    api_key = HUNTER_API_KEY or os.getenv("HUNTER_API_KEY")
    if not api_key or not domain:
        return {}

    params = {
        "domain": domain,
        "api_key": api_key,
        "limit": max(1, min(100, int(limit))),
        "type": "personal",
    }
    if seniority:
        params["seniority"] = seniority
    if department:
        params["department"] = department

    try:
        resp = requests.get(HUNTER_DOMAIN_SEARCH_URL, params=params, timeout=HUNTER_TIMEOUT_SEC)
    except requests.exceptions.RequestException as e:
        print(f"[HunterPersonSearch] domain={domain} request failed: {e}")
        return {}

    if resp.status_code == 429:
        print(f"[HunterPersonSearch] domain={domain} rate-limited (429)")
        return {}
    if resp.status_code != 200:
        print(f"[HunterPersonSearch] domain={domain} status={resp.status_code} body={resp.text[:200]}")
        return {}

    try:
        return resp.json().get("data") or {}
    except ValueError:
        return {}


def _title_matches(position: str, title_variations: List[str]) -> bool:
    """Best-effort case-insensitive substring match between Hunter `position`
    and any of the user's parsed title variations. Empty title_variations =
    accept any position."""
    if not title_variations:
        return True
    if not position:
        return False
    p = position.lower()
    for t in title_variations:
        if not t:
            continue
        tl = str(t).lower().strip()
        if not tl:
            continue
        # Match if title variation appears in Hunter position OR vice-versa
        # for short titles (e.g. variation "Analyst" matching position "Senior Analyst").
        if tl in p or (len(tl) <= 4 and tl in p.split()):
            return True
    return False


def _make_pdl_id(email: str, linkedin: str, first_name: str, last_name: str, company: str) -> str:
    """Synthesize a stable pseudo-pdlId for Hunter-sourced contacts.
    Used by Firestore dedup and Outbox tracking which expect a stable identifier."""
    seed = (email or linkedin or f"{first_name}_{last_name}_{company}").strip().lower()
    if not seed:
        return ""
    return "hunter:" + hashlib.sha1(seed.encode()).hexdigest()[:16]


def _normalize_hunter_person(hp: Dict, company_name: str, domain: str) -> Optional[Dict]:
    """Convert one Hunter email entry into the Offerloop contact shape used
    by the frontend and downstream Firestore writes in runs.py."""
    if not isinstance(hp, dict):
        return None

    email = (hp.get("value") or "").strip()
    first_name = (hp.get("first_name") or "").strip()
    last_name = (hp.get("last_name") or "").strip()
    position = (hp.get("position") or "").strip()
    linkedin = (hp.get("linkedin") or "").strip()

    # Skip entries with no actionable identity.
    if not (email or linkedin) or not (first_name or last_name):
        return None
    if email and is_personal_email_domain(email.split("@")[-1] if "@" in email else ""):
        # Hunter occasionally returns personal-domain emails for personnel
        # at small companies — those aren't usable for outbound at this org.
        # Keep them, but only if we have a LinkedIn to back the contact up.
        if not linkedin:
            return None

    pdl_id = _make_pdl_id(email, linkedin, first_name, last_name, company_name)

    return {
        "FirstName": first_name,
        "LastName": last_name,
        "Title": position,
        "JobTitle": position,
        "Company": company_name,
        "Email": email,
        "WorkEmail": email,
        "LinkedIn": linkedin,
        "linkedinUrl": linkedin,
        "College": "",
        "City": "",
        "State": "",
        "location": "",
        "pdlId": pdl_id,
        # Mark provenance so downstream code (telemetry, debug UI) can tell
        # this contact came from Hunter, not PDL.
        "_source": "hunter",
        "_hunter_confidence": hp.get("confidence"),
        "_hunter_department": hp.get("department"),
        "_hunter_seniority": hp.get("seniority"),
        "_domain": domain,
    }


def _resolve_domain(company: Dict) -> Optional[str]:
    """Resolve a parsed-prompt company entry to a Hunter-usable email domain."""
    name = ""
    website = None
    if isinstance(company, dict):
        name = (company.get("name") or "").strip()
        website = company.get("website")
    elif isinstance(company, str):
        name = company.strip()
    if not name:
        return None
    domain = get_smart_company_domain(name, company_website=website)
    if not domain:
        return None
    # Sanity: refuse personal-email domains as a company domain (e.g. if
    # OpenAI hallucinated "gmail.com" for an obscure company).
    if is_personal_email_domain(domain):
        return None
    return domain


def get_unsupported_filters(parsed_prompt: Dict) -> List[str]:
    """Return list of filter names present in the parsed prompt that Hunter
    Domain Search cannot honor. Surfaced to the frontend so users see why
    results are unfiltered."""
    unsupported = []
    if parsed_prompt.get("schools"):
        unsupported.append("school")
    if parsed_prompt.get("locations"):
        unsupported.append("location")
    # "industries" is implicit when company is named, so don't flag it.
    return unsupported


@meter_call("hunter", "domain_search")
def search_people_via_hunter(
    parsed_prompt: Dict,
    max_contacts: int,
    exclude_keys=None,
    user_profile=None,
) -> Tuple[List[Dict], int, List[Dict], Optional[Dict]]:
    """
    Drop-in replacement for `pdl_client.search_contacts_from_prompt` while PDL is offline.

    Returns the same 4-tuple shape:
        (contacts, retry_level_used, already_saved_contacts, adjacency_metadata)

    Important: this function only runs when parsed_prompt has at least one company.
    Callers must short-circuit no-company queries with a 503 before invoking us.
    """
    exclude_keys = exclude_keys or set()
    companies = parsed_prompt.get("companies") or []
    if not companies:
        # Defensive — the route should have guarded against this.
        return [], 0, [], {
            "message": "No company specified — Hunter person search requires a company.",
            "drop_reasons": {"no_company": 1},
            "unsupported_filters": get_unsupported_filters(parsed_prompt),
        }

    title_variations = parsed_prompt.get("title_variations") or []
    unsupported_filters = get_unsupported_filters(parsed_prompt)
    # Cap how many companies we hit in one search to bound Hunter spend
    # (each domain-search call is one Hunter credit).
    companies = companies[:MAX_COMPANIES_PER_QUERY]

    collected: List[Dict] = []
    seen_pdl_ids: set = set()
    per_company_log: List[Dict] = []

    # Lazy import to avoid circular dep with pdl_client.
    from app.services.pdl_client import get_contact_identity

    t0 = time.time()
    for company in companies:
        name = company.get("name", "") if isinstance(company, dict) else str(company)
        domain = _resolve_domain(company)
        if not domain:
            per_company_log.append({"company": name, "status": "no_domain"})
            print(f"[HunterPersonSearch] Skipping {name!r} — could not resolve domain")
            continue

        data = _hunter_domain_search(
            domain=domain,
            limit=HUNTER_PER_COMPANY_LIMIT,
        )
        emails = data.get("emails") or []
        per_company_log.append({"company": name, "domain": domain, "fetched": len(emails)})

        # Two-pass: prefer title matches, but fall back to unfiltered Hunter
        # results if strict matching would return too few. Hunter's data skews
        # toward executives so most companies return <5 IC-level title matches
        # for a given role query — best-effort means returning *something*.
        title_matches: List[Dict] = []
        title_misses: List[Dict] = []
        for hp in emails:
            position = hp.get("position") or ""
            contact = _normalize_hunter_person(hp, company_name=name or data.get("organization") or "", domain=domain)
            if not contact:
                continue
            identity = get_contact_identity(contact)
            if identity in exclude_keys:
                continue
            if contact["pdlId"] and contact["pdlId"] in seen_pdl_ids:
                continue
            (title_matches if _title_matches(position, title_variations) else title_misses).append(contact)

        # Title matches first, then misses to top up if we're under-quota.
        ranked = title_matches + title_misses
        title_filter_relaxed = bool(title_variations) and len(title_matches) < max_contacts and title_misses
        for contact in ranked:
            if contact["pdlId"]:
                if contact["pdlId"] in seen_pdl_ids:
                    continue
                seen_pdl_ids.add(contact["pdlId"])
            collected.append(contact)
            if len(collected) >= max_contacts * 3:
                break

        if title_filter_relaxed:
            per_company_log[-1]["title_filter_relaxed"] = True

        if len(collected) >= max_contacts * 3:
            break

    elapsed = time.time() - t0
    print(
        f"[HunterPersonSearch] companies={len(companies)} elapsed={elapsed:.2f}s "
        f"collected={len(collected)} max_contacts={max_contacts} per_company={per_company_log}"
    )

    # Adjacency metadata carries unsupported_filters so the frontend can banner.
    adjacency_metadata = None
    if unsupported_filters or not collected:
        adjacency_metadata = {
            "unsupported_filters": unsupported_filters,
            "source": "hunter",
            "per_company": per_company_log,
        }
        if not collected:
            adjacency_metadata["drop_reasons"] = {"hunter_no_match": 1}
            adjacency_metadata["message"] = (
                "No matches at the requested company via our backup provider. "
                "Try a different company or broaden the role."
            )
        elif unsupported_filters:
            companies_named = ", ".join(
                c.get("name", "") if isinstance(c, dict) else str(c) for c in companies
            )
            adjacency_metadata["message"] = (
                f"Showing all matches at {companies_named}; "
                f"{', '.join(unsupported_filters)} filter(s) temporarily unavailable."
            )

    # No retry chain (Hunter has no equivalent of PDL's broadening rungs).
    return collected[:max_contacts], 0, [], adjacency_metadata
