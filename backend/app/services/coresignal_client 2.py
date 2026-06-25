"""
Coresignal Multi-Source Employee API client.

Surfaces a PDL-compatible interface so this module can drop into the same
call sites as `pdl_client.search_contacts_from_prompt`. Returns contacts in
the canonical Offerloop contact schema (see hunter_person_search.py:135-157,
pdl_client.py:1489-1514).

Coresignal's API is a 2-step pattern:
  1. POST /employee_multi_source/search/es_dsl  ->  array of profile IDs (1 Search credit)
  2. GET  /employee_multi_source/collect/{id}   ->  full profile JSON      (1 Collect credit per fetch)

We minimize Collect credits by lazy collection: keep collecting from the
returned IDs only until we accumulate `max_contacts` valid contacts after
dedup, then stop.

Auth: `apikey: <key>` request header.
"""

import os
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Set, Tuple

import requests

from app.services.metering import meter_call

logger = logging.getLogger("coresignal_client")

# Inline (don't import from hunter.py — pulls in OpenAI deps we don't need).
# Mirror of hunter.is_personal_email_domain so we drop personal-domain
# emails before treating them as work emails.
_PERSONAL_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
    "icloud.com", "me.com", "protonmail.com", "mail.com", "yandex.com",
    "zoho.com", "gmx.com", "live.com", "msn.com", "inbox.com",
    "sbcglobal.net", "att.net", "verizon.net", "comcast.net",
}


def is_personal_email_domain(domain: str) -> bool:
    if not domain:
        return False
    return domain.strip().lower() in _PERSONAL_EMAIL_DOMAINS

CORESIGNAL_API_KEY = os.environ.get("CORESIGNAL_API_KEY", "")
CORESIGNAL_BASE_URL = os.environ.get(
    "CORESIGNAL_BASE_URL", "https://api.coresignal.com/cdapi/v2"
)
SEARCH_ENDPOINT = f"{CORESIGNAL_BASE_URL}/employee_multi_source/search/es_dsl"
COLLECT_ENDPOINT = f"{CORESIGNAL_BASE_URL}/employee_multi_source/collect"

_session = requests.Session()

# Cap search-side IDs we ever ask for. Each ID is 1 Search credit but the
# Pro plan has 20K Search credits/mo, so generous here is fine. Lazy collect
# below ensures we only spend Collect credits up to what we return.
DEFAULT_SEARCH_PAGE_SIZE = 50
SEARCH_TIMEOUT_SEC = 25
COLLECT_TIMEOUT_SEC = 20
COLLECT_CONCURRENCY = 4  # parallel HTTP for collect step; 4 is conservative


# ---------------------------------------------------------------------------
# Public surface (mirrors pdl_client.search_contacts_from_prompt)
# ---------------------------------------------------------------------------


@meter_call("coresignal", "member_search")
def search_contacts_from_prompt(
    parsed_prompt: Dict[str, Any],
    max_contacts: int,
    exclude_keys: Optional[Set[str]] = None,
    user_profile: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], int, List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Drop-in surface for pdl_client.search_contacts_from_prompt.

    Returns the same 4-tuple shape:
        (contacts, retry_level_used, already_saved_contacts, adjacency_metadata)

    `retry_level_used` is always 0 here; Coresignal doesn't have PDL's
    multi-rung broadening (Phase 3 can layer that on top).
    """
    if not CORESIGNAL_API_KEY:
        logger.warning("CORESIGNAL_API_KEY not set; returning empty result")
        return [], 0, [], {"provider": "coresignal", "error": "missing_api_key"}

    exclude_keys = exclude_keys or set()

    query = _build_es_query(parsed_prompt)
    if query is None:
        return [], 0, [], {
            "provider": "coresignal",
            "message": "No company specified — Coresignal needs at least a company filter to return useful results.",
            "drop_reasons": {"no_company": 1},
        }

    ids = _search_ids(query, page_size=DEFAULT_SEARCH_PAGE_SIZE)
    if not ids:
        return [], 0, [], {"provider": "coresignal", "raw_count": 0}

    # Lazy collect: walk the ID list, fetching in parallel batches sized to
    # exactly what we still need. Each Collect call is 1 paid credit, so
    # over-fetching is real money. We keep concurrency for latency on the
    # bulk of the work, but the LAST batch shrinks to `remaining` so we
    # never collect profiles we won't return.
    contacts: List[Dict[str, Any]] = []
    already_saved: List[Dict[str, Any]] = []
    seen_keys: Set[str] = set(exclude_keys)
    collected_count = 0

    target_company = _target_company_name(parsed_prompt)
    target_schools = parsed_prompt.get("schools") or []

    cursor = 0
    while cursor < len(ids) and len(contacts) < max_contacts:
        remaining = max_contacts - len(contacts)
        take = min(remaining, COLLECT_CONCURRENCY, len(ids) - cursor)
        batch = ids[cursor : cursor + take]
        cursor += take

        profiles = _collect_profiles_parallel(batch)
        collected_count += len(profiles)
        for prof in profiles:
            if len(contacts) >= max_contacts:
                break
            normalized = _normalize_to_contact(prof, target_company=target_company)
            if not normalized:
                continue
            key = _contact_key(normalized)
            if key and key in seen_keys:
                already_saved.append(normalized)
                continue
            if key:
                seen_keys.add(key)
            contacts.append(normalized)

    meta = {
        "provider": "coresignal",
        "raw_count": len(ids),
        "collected_count": collected_count,
        "schools_requested": target_schools,
    }
    return contacts, 0, already_saved, meta


@meter_call("coresignal", "member_collect")
def enrich_linkedin_profile(linkedin_url: str) -> Optional[Dict[str, Any]]:
    """
    Look up a single profile by LinkedIn URL. Returns canonical contact or None.

    NOTE: Coresignal's collect endpoint keys on internal profile_id, not LinkedIn
    URL. To enrich by LinkedIn URL we run a 2-credit roundtrip: search by URL,
    then collect the first match.
    """
    if not CORESIGNAL_API_KEY or not linkedin_url:
        return None
    canonical = (linkedin_url or "").strip().lower()
    if not canonical:
        return None
    query = {
        "query": {
            "bool": {
                "must": [{"term": {"linkedin_url": canonical}}],
            }
        }
    }
    ids = _search_ids(query, page_size=1)
    if not ids:
        return None
    prof = _collect_profile(ids[0])
    if not prof:
        return None
    return _normalize_to_contact(prof)


# ---------------------------------------------------------------------------
# Query construction
# ---------------------------------------------------------------------------


def _build_es_query(parsed: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Translate Offerloop's parse_search_prompt_structured output into the
    Coresignal Elasticsearch DSL we verified against the live API.

    Returns None when the parsed prompt has no actionable filters (e.g.
    no company AND no school) — caller should short-circuit instead of
    burning a Search credit on a match_all.
    """
    must: List[Dict[str, Any]] = []

    companies = parsed.get("companies") or []
    company_names = [c.get("name") for c in companies if isinstance(c, dict) and c.get("name")]
    title_variations = parsed.get("title_variations") or []
    schools = parsed.get("schools") or []
    locations = parsed.get("locations") or []

    # Current company + title via nested experience with active filter.
    # `active_experience: 1` constrains to the person's current role only.
    if company_names:
        nested_must: List[Dict[str, Any]] = [
            {"term": {"experience.active_experience": 1}},
        ]
        if len(company_names) == 1:
            nested_must.append({"match_phrase": {"experience.company_name": company_names[0]}})
        else:
            nested_must.append({
                "bool": {
                    "should": [
                        {"match_phrase": {"experience.company_name": n}} for n in company_names
                    ],
                    "minimum_should_match": 1,
                }
            })
        if title_variations:
            # Any title variation matches (fuzzy-OR across the parsed variants).
            nested_must.append({
                "bool": {
                    "should": [
                        {"match_phrase": {"experience.position_title": t}} for t in title_variations
                    ],
                    "minimum_should_match": 1,
                }
            })
        must.append({"nested": {"path": "experience", "query": {"bool": {"must": nested_must}}}})
    elif title_variations:
        # Title-only (no company) — match any active role with that title.
        must.append({
            "nested": {
                "path": "experience",
                "query": {
                    "bool": {
                        "must": [
                            {"term": {"experience.active_experience": 1}},
                            {
                                "bool": {
                                    "should": [
                                        {"match_phrase": {"experience.position_title": t}} for t in title_variations
                                    ],
                                    "minimum_should_match": 1,
                                }
                            },
                        ]
                    }
                },
            }
        })

    # Education filter via nested education.institution_name match_phrase.
    if schools:
        must.append({
            "nested": {
                "path": "education",
                "query": {
                    "bool": {
                        "should": [
                            {"match_phrase": {"education.institution_name": s}} for s in schools
                        ],
                        "minimum_should_match": 1,
                    }
                },
            }
        })

    # Location is a flat field on the profile.
    if locations:
        must.append({
            "bool": {
                "should": [
                    {"match": {"location_full": loc}} for loc in locations
                ] + [
                    {"match": {"location_country": loc}} for loc in locations
                ],
                "minimum_should_match": 1,
            }
        })

    if not must:
        return None
    return {"query": {"bool": {"must": must}}}


def _target_company_name(parsed: Dict[str, Any]) -> Optional[str]:
    companies = parsed.get("companies") or []
    if companies and isinstance(companies[0], dict):
        name = (companies[0].get("name") or "").strip()
        return name or None
    return None


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _headers() -> Dict[str, str]:
    return {"apikey": CORESIGNAL_API_KEY, "Content-Type": "application/json"}


def _search_ids(query: Dict[str, Any], page_size: int = DEFAULT_SEARCH_PAGE_SIZE) -> List[int]:
    """
    Run the ES DSL search. Returns up to `page_size` profile IDs.
    Coresignal caps responses at 1000 IDs in our experimentation.
    """
    # Coresignal `from`/`size` aren't part of the public DSL; the API simply
    # returns up to its internal cap. We truncate client-side.
    try:
        resp = _session.post(
            SEARCH_ENDPOINT, headers=_headers(), json=query, timeout=SEARCH_TIMEOUT_SEC
        )
    except requests.RequestException as e:
        logger.warning("Coresignal search HTTP error: %s", e)
        return []
    if resp.status_code != 200:
        logger.warning(
            "Coresignal search non-200: status=%s body=%s",
            resp.status_code, resp.text[:200],
        )
        return []
    try:
        ids = resp.json()
    except ValueError:
        logger.warning("Coresignal search returned non-JSON body")
        return []
    if not isinstance(ids, list):
        logger.warning("Coresignal search returned unexpected shape: %r", type(ids))
        return []
    return [i for i in ids[:page_size] if isinstance(i, int)]


def _collect_profile(profile_id: int) -> Optional[Dict[str, Any]]:
    try:
        resp = _session.get(
            f"{COLLECT_ENDPOINT}/{profile_id}",
            headers=_headers(),
            timeout=COLLECT_TIMEOUT_SEC,
        )
    except requests.RequestException as e:
        logger.warning("Coresignal collect HTTP error for id=%s: %s", profile_id, e)
        return None
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        logger.warning(
            "Coresignal collect non-200 for id=%s: status=%s body=%s",
            profile_id, resp.status_code, resp.text[:200],
        )
        return None
    try:
        return resp.json()
    except ValueError:
        return None


def _collect_profiles_parallel(ids: List[int]) -> List[Dict[str, Any]]:
    """Fetch a batch of profiles in parallel. Preserves input order."""
    if not ids:
        return []
    out: List[Optional[Dict[str, Any]]] = [None] * len(ids)
    with ThreadPoolExecutor(max_workers=min(COLLECT_CONCURRENCY, len(ids))) as ex:
        futures = {ex.submit(_collect_profile, pid): idx for idx, pid in enumerate(ids)}
        for fut in as_completed(futures):
            idx = futures[fut]
            try:
                out[idx] = fut.result()
            except Exception as e:
                logger.warning("Coresignal collect exception: %s", e)
                out[idx] = None
    return [p for p in out if p]


# ---------------------------------------------------------------------------
# Normalization (Coresignal profile -> Offerloop canonical contact)
# ---------------------------------------------------------------------------


def _normalize_to_contact(
    prof: Dict[str, Any],
    target_company: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Map a Coresignal multi-source employee profile into Offerloop's canonical
    contact dict (same keys the frontend and Firestore writes expect — see
    hunter_person_search.py:135-157 and pdl_client.py:1489-1514).
    """
    if not isinstance(prof, dict):
        return None
    if prof.get("is_deleted") == 1:
        return None

    first_name = (prof.get("first_name") or "").strip()
    last_name = (prof.get("last_name") or "").strip()
    if not (first_name or last_name):
        return None

    linkedin = (prof.get("linkedin_url") or "").strip()

    # Current role: prefer active_experience_* flat fields; fall back to the
    # most recent experience array entry.
    title = (prof.get("active_experience_title") or "").strip()
    company = ""
    if not title:
        for exp in prof.get("experience") or []:
            if exp.get("active_experience") == 1:
                title = (exp.get("position_title") or "").strip()
                company = (exp.get("company_name") or "").strip()
                break
    if not company:
        for exp in prof.get("experience") or []:
            if exp.get("active_experience") == 1:
                company = (exp.get("company_name") or "").strip()
                break
    if not company and (prof.get("experience") or []):
        company = (prof["experience"][0].get("company_name") or "").strip()

    # Email: keep only professional emails; skip personal-domain emails so
    # we don't burn outreach on @gmail.com etc. (matches Hunter's policy at
    # hunter_person_search.py:126-131).
    email = ""
    primary = (prof.get("primary_professional_email") or "").strip()
    if primary and "@" in primary:
        domain = primary.split("@")[-1]
        if not is_personal_email_domain(domain):
            email = primary
    if not email:
        for entry in prof.get("professional_emails_collection") or []:
            cand = (entry.get("professional_email") or "").strip() if isinstance(entry, dict) else ""
            if cand and "@" in cand and not is_personal_email_domain(cand.split("@")[-1]):
                email = cand
                break

    # Education: pick the highest-signal school (prefer first entry in array,
    # which Coresignal orders by recency).
    college = ""
    education_top = ""
    educations = prof.get("education") or []
    if educations:
        top = educations[0] if isinstance(educations[0], dict) else {}
        college = (top.get("institution_name") or "").strip()
        education_top = _format_education(educations[:3])

    # Location: flatten Coresignal's city/state into Offerloop's shape.
    city = (prof.get("location_city") or "").strip()
    state = (prof.get("location_state") or "").strip()
    location_full = (prof.get("location_full") or "").strip()

    # Synthesize a stable pseudo-pdlId so existing dedup / Firestore writes
    # work unchanged. Prefix-scoped so we can tell provenance from the key.
    coresignal_id = prof.get("id")
    pdl_id = f"coresignal:{coresignal_id}" if coresignal_id is not None else _synthesize_id(
        email, linkedin, first_name, last_name, company
    )

    contact = {
        "pdlId": pdl_id,
        "FirstName": first_name,
        "LastName": last_name,
        "LinkedIn": linkedin,
        "linkedinUrl": linkedin,
        "Email": email,
        "WorkEmail": email,
        "PersonalEmail": "",
        "Title": title,
        "JobTitle": title,
        "Company": company,
        "City": city,
        "State": state,
        "location": location_full,
        "College": college,
        "EducationTop": education_top,
        "WorkSummary": _format_experience((prof.get("experience") or [])[:3]),
        "experience": _summarize_experience((prof.get("experience") or [])[:2]),
        "Phone": "",  # Coresignal multi-source doesn't expose phone in standard plan
        "_source": "coresignal",
        "_coresignal_profile_score": prof.get("profile_score"),
        "_coresignal_is_decision_maker": prof.get("is_decision_maker"),
        "EmailSource": "coresignal" if email else "",
        "EmailVerified": bool(email and prof.get("primary_professional_email_status") == "valid"),
    }
    # IsCurrentlyAtTarget mirrors the PDL flag used downstream by the
    # frontend's "still at target company" UI badge.
    if target_company and company:
        contact["IsCurrentlyAtTarget"] = (
            company.strip().lower() == target_company.strip().lower()
        )
    return contact


def _format_education(educations: List[Dict[str, Any]]) -> str:
    parts = []
    for edu in educations:
        if not isinstance(edu, dict):
            continue
        school = (edu.get("institution_name") or "").strip()
        degree = (edu.get("degree") or "").strip()
        if not school:
            continue
        if degree:
            parts.append(f"{school} - {degree}")
        else:
            parts.append(school)
    return "; ".join(parts)


def _format_experience(experience: List[Dict[str, Any]]) -> str:
    parts = []
    for exp in experience:
        if not isinstance(exp, dict):
            continue
        title = (exp.get("position_title") or "").strip()
        company = (exp.get("company_name") or "").strip()
        if not (title or company):
            continue
        date_from = exp.get("date_from") or ""
        date_to = exp.get("date_to") or "Present"
        when = f" ({date_from} - {date_to})" if date_from else ""
        parts.append(f"{title} at {company}{when}".strip())
    return "; ".join(parts)


def _summarize_experience(experience: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Minimal experience array kept on the contact for downstream UI/exports."""
    out = []
    for exp in experience:
        if not isinstance(exp, dict):
            continue
        out.append({
            "title": exp.get("position_title") or "",
            "company": exp.get("company_name") or "",
            "date_from": exp.get("date_from") or "",
            "date_to": exp.get("date_to") or "",
        })
    return out


def _synthesize_id(email: str, linkedin: str, first: str, last: str, company: str) -> str:
    seed = (email or linkedin or f"{first}_{last}_{company}").strip().lower()
    if not seed:
        return ""
    return "coresignal:" + hashlib.sha1(seed.encode()).hexdigest()[:16]


def _contact_key(contact: Dict[str, Any]) -> str:
    """Dedup key — prefer LinkedIn URL, fall back to pdlId."""
    return (contact.get("LinkedIn") or "").strip().lower() or contact.get("pdlId", "")
