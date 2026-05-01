"""
Alumni sourcing service, Phase 6 of the Personalization Data Layer.

This is the writer side of the Phase 1 read-cache. The Phase 1 cut shipped
get_alumni_count + write_alumni_count and stopped there. Phase 6 wires the
sourcing pipeline (PDL primary, SerpAPI fallback, Bright Data placeholder)
in front of the cache, so a cache miss can be resolved by hitting external
providers and writing through.

Public API:

    source_alumni_for_pair(school, company, office=None)
        Look up the alumni count for (school, company[, office]). Cache hit
        within TTL returns immediately. Cache miss (or stale) triggers the
        provider chain, persists the result, and returns it. Full-chain
        failure returns the stale cache if any, else None.

    index_user_in_alumni_graph(uid)
        For an opt-in user, write users/{uid}'s public-facing summary into
        alumniByUser/{schoolId}__{companyId}/users/{uid}. Caller must have
        already confirmed consent == 'opt_in'.

    is_enabled()
        Feature gate. Defaults OFF. Read-only callers (Phase 1
        get_alumni_count) keep working with the flag off; only the
        write-through pipeline is gated.

Provider chain failure semantics: each provider returns Optional[int] and
logs its own errors. The orchestrator tries them in order and stops on
the first int return value. If all three return None, we fall through to
the stale cache (if any) and tag the response with `is_stale=True`.

Cost guard: PDL spend is metered through pdl_client_cost_guard. When the
daily cap is hit, the PDL provider returns None immediately and the
chain falls through to the next provider.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.extensions import get_db
from app.models.users import normalize_company, normalize_school
from app.services.alumni_service import (
    AlumniCountData,
    AlumniSource,
    get_alumni_count,
    make_cache_key,
    write_alumni_count,
)
from app.services.consent_service import get_alumni_graph_consent

logger = logging.getLogger('alumni_sourcing_service')

ENV_FLAG = 'ALUMNI_GRAPH_ENABLED'


def is_enabled() -> bool:
    """Phase 6 sourcing flag. Defaults OFF per the rollout pattern in section 8."""
    return os.getenv(ENV_FLAG, 'false').lower() == 'true'


# ---------------------------------------------------------------------------
# Provider adapters. Each returns Optional[int] (the alumni count) or None on
# failure. The orchestrator never raises; it absorbs provider exceptions and
# moves on to the next.
# ---------------------------------------------------------------------------

def _pdl_count(school_id: str, company_id: str, office: Optional[str]) -> Optional[int]:
    """Primary provider, PDL person search.

    Builds a filter for "degree at school AND current company" and asks PDL
    for the total. Uses size=1 so we pay for the count, not the rows.
    """
    try:
        from app.services.pdl_client_cost_guard import allow_pdl_call
    except Exception:  # pragma: no cover, file lands alongside this one
        def allow_pdl_call() -> bool:
            return True

    if not allow_pdl_call():
        logger.warning('alumni_sourcing: PDL daily cap exceeded; skipping PDL')
        return None

    api_key = os.getenv('PEOPLE_DATA_LABS_API_KEY')
    if not api_key:
        logger.info('alumni_sourcing: PEOPLE_DATA_LABS_API_KEY not set; skipping PDL')
        return None

    try:
        import requests
        from app.config import PDL_BASE_URL

        company_term = company_id.replace('-', ' ')
        school_term = school_id.replace('-', ' ')
        must: List[Dict[str, Any]] = [
            {'term': {'job_company_name': company_term}},
            {'term': {'education.school.name': school_term}},
        ]
        if office:
            must.append({'term': {'job_company_location_locality': office.replace('-', ' ')}})

        body = {
            'query': {'bool': {'must': must}},
            'size': 1,
        }
        resp = requests.post(
            f'{PDL_BASE_URL}/person/search',
            headers={'X-Api-Key': api_key, 'Content-Type': 'application/json'},
            json=body,
            timeout=15,
        )
        if resp.status_code == 404:
            return 0
        if resp.status_code == 429:
            logger.warning('alumni_sourcing: PDL rate-limited; falling through')
            return None
        if resp.status_code >= 500:
            logger.warning('alumni_sourcing: PDL %s; falling through', resp.status_code)
            return None
        if resp.status_code != 200:
            logger.warning(
                'alumni_sourcing: PDL non-200 %s body=%s',
                resp.status_code, resp.text[:200],
            )
            return None
        payload = resp.json() or {}
        total = payload.get('total')
        if total is None:
            return None
        return max(0, int(total))
    except Exception:
        logger.exception('alumni_sourcing: PDL call raised')
        return None


def _serpapi_count(school_id: str, company_id: str, office: Optional[str]) -> Optional[int]:
    """Secondary provider, SerpAPI Google scrape.

    Estimates the alumni count from the search result total Google reports
    for "site:linkedin.com/in/ {school} {company}". This is noisy by design,
    rounded to two significant figures, and only used when PDL fails.
    """
    api_key = os.getenv('SERPAPI_KEY')
    if not api_key:
        logger.info('alumni_sourcing: SERPAPI_KEY not set; skipping SerpAPI')
        return None
    try:
        import requests
        company_term = company_id.replace('-', ' ')
        school_term = school_id.replace('-', ' ')
        q = f'site:linkedin.com/in/ "{company_term}" "{school_term}"'
        if office:
            q += f' "{office.replace("-", " ")}"'
        resp = requests.get(
            'https://serpapi.com/search.json',
            params={'engine': 'google', 'q': q, 'api_key': api_key, 'num': 10},
            timeout=20,
        )
        if resp.status_code != 200:
            return None
        data = resp.json() or {}
        info = data.get('search_information') or {}
        total = info.get('total_results')
        if total is None:
            return None
        n = int(total)
        if n <= 0:
            return 0
        # Round to 2 significant figures so we don't claim spurious precision.
        magnitude = 10 ** (max(0, len(str(n)) - 2))
        return (n // magnitude) * magnitude
    except Exception:
        logger.exception('alumni_sourcing: SerpAPI call raised')
        return None


def _brightdata_count(school_id: str, company_id: str, office: Optional[str]) -> Optional[int]:
    """Tertiary provider placeholder.

    Bright Data's current dataset is single-profile fetch, not a counting
    surface. Reserved for future use; today this returns None so the chain
    falls through to the stale-cache branch.
    """
    return None


# Provider chain: keep the function names here, not the function objects, so
# tests that patch _pdl_count / _serpapi_count / _brightdata_count on this
# module pick up the substitution at call time.
_PROVIDER_ORDER = (
    ('pdl', '_pdl_count'),
    ('serpapi', '_serpapi_count'),
    ('brightdata', '_brightdata_count'),
)


def _resolve_providers():
    import sys
    module = sys.modules[__name__]
    for name, attr in _PROVIDER_ORDER:
        fn = getattr(module, attr, None)
        if fn is not None:
            yield name, fn


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def source_alumni_for_pair(
    school: str,
    company: str,
    office: Optional[str] = None,
    *,
    force_refresh: bool = False,
) -> Optional[AlumniCountData]:
    """Resolve the alumni count for (school, company[, office]) with the
    write-through cache.

    Args:
        school: Display name or slug. Normalized via normalize_school.
        company: Display name or slug. Normalized via normalize_company.
        office: Optional metro filter ('nyc', 'sf', etc.).
        force_refresh: If True, bypass the cache hit check and re-source.

    Returns:
        AlumniCountData on cache hit (within TTL), on a successful source,
        or as a degraded read of stale cache. None when there's no cache
        and every provider returned None.
    """
    school_id = normalize_school(school)
    company_id = normalize_company(company)
    if not school_id or not company_id:
        return None

    if not is_enabled():
        return get_alumni_count(school, company, office)

    cached = get_alumni_count(school, company, office)
    if not force_refresh and cached is not None and not cached.is_stale:
        return cached

    sourced_count: Optional[int] = None
    sourced_from: Optional[AlumniSource] = None
    for name, provider in _resolve_providers():
        try:
            n = provider(school_id, company_id, office)
        except Exception:
            logger.exception('alumni_sourcing: %s provider raised', name)
            n = None
        if n is not None:
            sourced_count = n
            sourced_from = name  # type: ignore[assignment]
            break

    if sourced_count is None:
        if cached is not None:
            logger.warning(
                'alumni_sourcing: full-chain miss for %s, %s; returning stale cache',
                school_id, company_id,
            )
            return cached
        return None

    return write_alumni_count(
        school=school,
        company=company,
        count=sourced_count,
        office=office,
        source=sourced_from or 'pdl',
    )


# ---------------------------------------------------------------------------
# alumniByUser graph (consenting users, our internal directory seed)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class GraphIndexResult:
    written: int
    skipped: int
    reason: Optional[str] = None


def index_user_in_alumni_graph(uid: str) -> GraphIndexResult:
    """Write a consenting user's entry into alumniByUser/{key}/users/{uid}.

    Caller is responsible for having checked consent. We re-check here
    defensively so a stale call site cannot leak a non-consenting user
    into the directory.

    Indexes both currentCompany (if set) and any targetCompanies the user
    declared. Each (school, company) pair gets its own doc.

    Returns:
        GraphIndexResult with the count of entries written and skipped.
    """
    if not uid:
        return GraphIndexResult(written=0, skipped=0, reason='no_uid')

    consent = get_alumni_graph_consent(uid)
    if consent.get('value') != 'opt_in':
        return GraphIndexResult(written=0, skipped=0, reason='not_opted_in')

    db = get_db()
    user_snap = db.collection('users').document(uid).get()
    if not user_snap.exists:
        return GraphIndexResult(written=0, skipped=0, reason='no_user')
    data = user_snap.to_dict() or {}

    school_id = data.get('schoolNormalized') or normalize_school(data.get('school'))
    if not school_id:
        return GraphIndexResult(written=0, skipped=0, reason='no_school')

    display_name = data.get('name') or data.get('email') or uid
    current_role = data.get('currentRole')
    consented_at = consent.get('decidedAt') or datetime.now(timezone.utc).isoformat()

    companies: List[str] = []
    if data.get('currentCompanyNormalized'):
        companies.append(data['currentCompanyNormalized'])
    elif data.get('currentCompany'):
        slug = normalize_company(data['currentCompany'])
        if slug:
            companies.append(slug)
    for c in data.get('targetCompanies') or []:
        if c and c not in companies:
            companies.append(c)

    if not companies:
        return GraphIndexResult(written=0, skipped=0, reason='no_companies')

    written = 0
    for company_id in companies:
        try:
            key = make_cache_key(school_id, company_id)
            parent = db.collection('alumniByUser').document(key)
            parent.set(
                {'schoolId': school_id, 'companyId': company_id},
                merge=True,
            )
            parent.collection('users').document(uid).set(
                {
                    'userId': uid,
                    'displayName': display_name,
                    'currentRole': current_role,
                    'consentedAt': consented_at,
                },
                merge=True,
            )
            written += 1
        except Exception:
            logger.exception(
                'alumni_sourcing: index write failed uid=%s key=%s',
                uid, f'{school_id}__{company_id}',
            )
    return GraphIndexResult(written=written, skipped=0)
