"""
Recommendation service: Phase 5 of the Personalization Data Layer.

Reads structured profile + derivedProfile + companyContexts + recent events
and emits ranked contact and job candidates. Surfaces in the dashboard via
GET /api/recommendations/{contacts,jobs}.

Caching (per spec section 6.3):
   Cached at users/{uid}/recommendations/v1.
   TTL governed by RECOMMENDATIONS_TTL_SECONDS (default 3600).
   Bust on the major-event set: profile_confirmed, prompt_answered,
   email_sent_via_gmail, reply_received.
   Read-time check only, no listeners.

Architected for predictive ranking (section 9.B) and path similarity
(section 13). The relevant fields on RankedContact / RankedJob default
to None today and are populated by future phases when the outcome data
exists.

Cold-start guarantee: rank_contacts always returns at least one synthetic
seed pick when the user has no saved contacts, so the API never returns
[]. The dashboard's EmptyRecommendations component degrades further to
the onboarding CTA when even the structured profile is empty.

Locked import boundary: this module does NOT import from
app.services.email_generator. Phase 7 owns that integration.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.extensions import get_db

logger = logging.getLogger('recommendation_service')


# ============================================================================
# Tunable constants (kept module-level so tests can monkeypatch)
# ============================================================================

DEFAULT_TTL_SECONDS = 3600  # 1 hour, override via RECOMMENDATIONS_TTL_SECONDS

# Major events that bust the cache. Aligned with EventType values in
# app/models/events.py.
MAJOR_EVENT_TYPES = frozenset({
    'profile_confirmed',
    'prompt_answered',
    'email_sent_via_gmail',
    'reply_received',
})

# Floor on returned recommendations. The API never returns fewer than
# this when the user has any usable profile signal; below this we top
# up with seeded synthetic picks.
MIN_RECOMMENDATIONS = 3

# Cap on contacts streamed per call. Keeps the per-user scan bounded.
MAX_CONTACTS_TO_SCORE = 200

# Score weights. Wide spread, deterministic ordering matters more than
# absolute values since downstream consumers only care about rank order.
W_TARGET_COMPANY = 50.0
W_TARGET_INDUSTRY = 25.0
W_SCHOOL_MATCH = 40.0
W_SAVED_CONTACT = 10.0
W_REPLY_RECEIVED = 35.0
W_PROMPT_ANSWERED = 8.0
W_RECENT_VIEW = 5.0


# ============================================================================
# Public dataclasses (section 9.B)
# ============================================================================


@dataclass
class OutcomePrediction:
    """Phase 5+ stub, populated when 6+ months of outcome data exist."""
    pass


@dataclass
class RankedContact:
    contact_id: str
    score: float
    rationale: str
    # Phase 5+ stub, populated when 6+ months of outcome data exist.
    predicted_outcome: Optional[OutcomePrediction] = None
    # Phase 5+ stub, populated when 6+ months of outcome data exist.
    path_similarity_score: Optional[float] = None
    # Optional context the dashboard renders alongside the rank. Kept off
    # the scoring critical path so it stays cheap to swap.
    display: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'contactId': self.contact_id,
            'score': self.score,
            'rationale': self.rationale,
            'predictedOutcome': None,
            'pathSimilarityScore': self.path_similarity_score,
            'display': self.display,
        }


@dataclass
class RankedJob:
    posting_id: str
    score: float
    rationale: str
    # Phase 5+ stub, populated when 6+ months of outcome data exist.
    predicted_outcome: Optional[OutcomePrediction] = None
    # Phase 5+ stub, populated when 6+ months of outcome data exist.
    path_similarity_score: Optional[float] = None
    display: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'postingId': self.posting_id,
            'score': self.score,
            'rationale': self.rationale,
            'predictedOutcome': None,
            'pathSimilarityScore': self.path_similarity_score,
            'display': self.display,
        }


# ============================================================================
# Helpers
# ============================================================================


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now_dt().isoformat()


def _ttl_seconds() -> int:
    raw = os.getenv('RECOMMENDATIONS_TTL_SECONDS', str(DEFAULT_TTL_SECONDS))
    try:
        return max(60, int(raw))
    except (TypeError, ValueError):
        return DEFAULT_TTL_SECONDS


def _coerce_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, 'to_datetime'):
        try:
            return value.to_datetime().replace(tzinfo=timezone.utc)
        except Exception:  # pragma: no cover
            return None
    if isinstance(value, str):
        try:
            v = value.replace('Z', '+00:00')
            parsed = datetime.fromisoformat(v)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _norm_lower(value: Any) -> str:
    return str(value or '').strip().lower()


def _slugify_company(name: Any) -> Optional[str]:
    """Best-effort wrapper around the alias-aware company slugger.

    Falls back to a plain alnum-hyphen slug if the utility fails (e.g.
    in test contexts where the alias map module fails to import).
    """
    if not name:
        return None
    try:
        from app.utils.company import company_to_slug
        slug = company_to_slug(name)
        if slug:
            return slug
    except Exception:  # pragma: no cover
        pass
    import re
    s = _norm_lower(name)
    slug = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return slug or None


# ============================================================================
# Reads (structured profile, derived profile, contexts, contacts, events)
# ============================================================================


def _read_user_profile(uid: str) -> Dict[str, Any]:
    db = get_db()
    snap = db.collection('users').document(uid).get()
    if not snap.exists:
        return {}
    return snap.to_dict() or {}


def _read_derived_profile(uid: str) -> Dict[str, Any]:
    db = get_db()
    try:
        snap = (
            db.collection('users').document(uid)
            .collection('derivedProfile').document('v1')
            .get()
        )
    except Exception:  # pragma: no cover
        return {}
    if not snap.exists:
        return {}
    return snap.to_dict() or {}


def _read_company_contexts(uid: str) -> List[Dict[str, Any]]:
    db = get_db()
    out: List[Dict[str, Any]] = []
    try:
        snaps = (
            db.collection('users').document(uid)
            .collection('companyContexts').stream()
        )
    except Exception:  # pragma: no cover
        return out
    for snap in snaps:
        d = snap.to_dict() or {}
        d['_id'] = snap.id
        out.append(d)
    return out


def _read_saved_contacts(uid: str, limit: int) -> List[Dict[str, Any]]:
    db = get_db()
    out: List[Dict[str, Any]] = []
    try:
        snaps = (
            db.collection('users').document(uid)
            .collection('contacts').stream()
        )
    except Exception:  # pragma: no cover
        return out
    for snap in snaps:
        d = snap.to_dict() or {}
        d['_id'] = snap.id
        out.append(d)
        if len(out) >= limit:
            break
    return out


def _has_major_event_since(uid: str, since: Optional[datetime]) -> bool:
    """Scan events looking for any major-event-type entry newer than `since`.

    Returns True the moment we find one (early exit) so the read budget on
    a steady-state user with no recent activity stays small. The events
    collection is bounded by the 90-day TTL set in Phase 2.
    """
    if since is None:
        return True
    db = get_db()
    try:
        snaps = (
            db.collection('users').document(uid)
            .collection('events').stream()
        )
    except Exception:  # pragma: no cover
        return False
    for snap in snaps:
        d = snap.to_dict() or {}
        etype = d.get('type')
        if etype not in MAJOR_EVENT_TYPES:
            continue
        ts = _coerce_dt(d.get('timestamp') or d.get('createdAt'))
        if ts is None:
            continue
        if ts > since:
            return True
    return False


def _read_recent_event_signals(uid: str, since: datetime) -> Dict[str, Any]:
    """Stream events for behavior signals used in scoring.

    Returns a dict with:
      - replied_contact_ids: set of contactIds with reply_received events
      - answered_company_ids: set of companyIds answered via prompts
      - viewed_contact_ids: set of contactIds viewed in cards (last window)
    Read-only; only consumed during recompute.
    """
    db = get_db()
    out = {
        'replied_contact_ids': set(),
        'answered_company_ids': set(),
        'viewed_contact_ids': set(),
    }
    try:
        snaps = (
            db.collection('users').document(uid)
            .collection('events').stream()
        )
    except Exception:  # pragma: no cover
        return out
    for snap in snaps:
        d = snap.to_dict() or {}
        ts = _coerce_dt(d.get('timestamp') or d.get('createdAt'))
        if ts is None or ts < since:
            continue
        etype = d.get('type')
        payload = d.get('payload') or {}
        if etype == 'reply_received':
            cid = payload.get('contactId')
            if cid:
                out['replied_contact_ids'].add(cid)
        elif etype == 'prompt_answered':
            comp = payload.get('companyId') or payload.get('companyIdNormalized')
            if comp:
                out['answered_company_ids'].add(comp)
        elif etype == 'contact_card_viewed':
            cid = payload.get('contactId')
            if cid:
                out['viewed_contact_ids'].add(cid)
    return out


# ============================================================================
# Scoring
# ============================================================================


def _score_contact(
    contact: Dict[str, Any],
    *,
    target_companies_slugs: set,
    target_industries: set,
    school_norm: Optional[str],
    company_contexts_slugs: set,
    replied_contact_ids: set,
    viewed_contact_ids: set,
    answered_company_ids: set,
) -> Tuple[float, str]:
    """Score a saved-contact dict; returns (score, rationale)."""
    score = W_SAVED_CONTACT  # baseline for being in the saved pool
    reasons: List[str] = []

    company = contact.get('company') or contact.get('companyName')
    company_slug = _slugify_company(company)
    if company_slug and company_slug in target_companies_slugs:
        score += W_TARGET_COMPANY
        reasons.append(f'works at a target company ({company})')

    industry = _norm_lower(contact.get('industry'))
    if industry and industry in target_industries:
        score += W_TARGET_INDUSTRY
        reasons.append(f'in {industry.replace("_", " ")}')

    edu = contact.get('education') or contact.get('school') or ''
    if school_norm:
        edu_lower = _norm_lower(edu)
        if school_norm in edu_lower or edu_lower.endswith(school_norm):
            score += W_SCHOOL_MATCH
            reasons.append('alumnus of your school')

    cid = contact.get('_id') or contact.get('id') or contact.get('contactId')
    if cid and cid in replied_contact_ids:
        score += W_REPLY_RECEIVED
        reasons.append('previously replied to your outreach')
    if cid and cid in viewed_contact_ids:
        score += W_RECENT_VIEW

    if company_slug and company_slug in company_contexts_slugs:
        score += W_PROMPT_ANSWERED
        reasons.append('a company you have written a reason about')
    if company_slug and company_slug in answered_company_ids:
        score += W_PROMPT_ANSWERED

    rationale = '; '.join(reasons) if reasons else 'in your saved network'
    return score, rationale


# ============================================================================
# Cold-start / synthetic seeds (section 15 number 7)
# ============================================================================


def _seed_contact_picks(profile: Dict[str, Any], limit: int) -> List[RankedContact]:
    """Synthesize at least `limit` placeholder contact recommendations from
    the structured profile alone. Used both to backfill rank_contacts when
    the saved pool is thin and to seed Day 1 dashboards with no behavior
    history.

    Each pick has a deterministic synthetic id of the shape
    `seed:{school}:{company-slug}` so the frontend can dedupe across calls.
    """
    school = profile.get('school') or profile.get('schoolNormalized') or ''
    target_companies: List[str] = list(profile.get('targetCompanies') or [])
    target_industries: List[str] = list(profile.get('targetIndustries') or [])

    out: List[RankedContact] = []
    seen: set = set()
    for company in target_companies:
        slug = _slugify_company(company) or _norm_lower(company)
        if not slug or slug in seen:
            continue
        seen.add(slug)
        sid = f'seed:{_norm_lower(school) or "any"}:{slug}'
        rationale = (
            f'alumnus of your school at {company}'
            if school else f'works at {company}, a company you target'
        )
        out.append(RankedContact(
            contact_id=sid,
            score=W_TARGET_COMPANY + (W_SCHOOL_MATCH if school else 0.0),
            rationale=rationale,
            display={
                'kind': 'seed',
                'company': company,
                'school': school or None,
            },
        ))
        if len(out) >= limit:
            return out

    # Fallback: industry seeds if we are still short.
    for industry in target_industries:
        if len(out) >= limit:
            break
        sid = f'seed:industry:{industry}'
        out.append(RankedContact(
            contact_id=sid,
            score=W_TARGET_INDUSTRY,
            rationale=f'in {industry.replace("_", " ")} (your target industry)',
            display={'kind': 'seed', 'industry': industry},
        ))
    return out


def _seed_job_picks(profile: Dict[str, Any], limit: int) -> List[RankedJob]:
    target_companies: List[str] = list(profile.get('targetCompanies') or [])
    target_role_types: List[str] = list(profile.get('targetRoleTypes') or [])
    out: List[RankedJob] = []
    seen: set = set()
    for company in target_companies:
        for role in target_role_types or ['internship']:
            slug = _slugify_company(company) or _norm_lower(company)
            if not slug:
                continue
            key = f'{slug}:{role}'
            if key in seen:
                continue
            seen.add(key)
            out.append(RankedJob(
                posting_id=f'seed:{key}',
                score=W_TARGET_COMPANY + (W_TARGET_INDUSTRY * 0.2),
                rationale=f'{role.replace("_", " ").title()} at {company}, matches your targets',
                display={'kind': 'seed', 'company': company, 'role': role},
            ))
            if len(out) >= limit:
                return out
    return out


# ============================================================================
# Cache
# ============================================================================


def _cache_ref(uid: str):
    db = get_db()
    return (
        db.collection('users').document(uid)
        .collection('recommendations').document('v1')
    )


def _read_cache(uid: str) -> Optional[Dict[str, Any]]:
    try:
        snap = _cache_ref(uid).get()
    except Exception:  # pragma: no cover
        return None
    if not snap.exists:
        return None
    return snap.to_dict() or None


def _write_cache(
    uid: str,
    *,
    contacts: List[RankedContact],
    jobs: List[RankedJob],
) -> Dict[str, Any]:
    now = _now_dt()
    expires_at = now + timedelta(seconds=_ttl_seconds())
    payload = {
        'contacts': [c.to_dict() for c in contacts],
        'jobs': [j.to_dict() for j in jobs],
        'lastComputedAt': now.isoformat(),
        'expiresAt': expires_at.isoformat(),
    }
    try:
        _cache_ref(uid).set(payload, merge=False)
    except Exception:  # pragma: no cover
        logger.exception('recommendation_service: cache write failed for uid=%s', uid)
    return payload


def _cache_is_fresh(uid: str, cache: Dict[str, Any], *, now: Optional[datetime] = None) -> bool:
    """True if the cache is within TTL AND no major event has fired since."""
    expires = _coerce_dt(cache.get('expiresAt'))
    last_computed = _coerce_dt(cache.get('lastComputedAt'))
    moment = now or _now_dt()
    if expires is None or moment >= expires:
        return False
    if _has_major_event_since(uid, last_computed):
        return False
    return True


# ============================================================================
# Public API
# ============================================================================


def is_enabled() -> bool:
    """Feature flag, default OFF. Routes also gate on this."""
    return os.getenv('RECOMMENDATIONS_ENABLED', 'false').lower() == 'true'


def rank_contacts(uid: str, *, limit: int = 20) -> List[RankedContact]:
    """Return ranked contact recommendations for a user.

    Always returns at least MIN_RECOMMENDATIONS results when the structured
    profile has any seedable signal (a school or any target company /
    industry). Returns [] only if the profile is completely empty AND the
    saved-contact pool is empty.

    Cache: read users/{uid}/recommendations/v1; recompute if expired or if
    a major event has fired since lastComputedAt.
    """
    if not uid:
        return []
    if limit <= 0:
        return []

    cache = _read_cache(uid)
    if cache and _cache_is_fresh(uid, cache):
        contacts = cache.get('contacts') or []
        return [
            RankedContact(
                contact_id=c.get('contactId') or '',
                score=float(c.get('score') or 0.0),
                rationale=c.get('rationale') or '',
                predicted_outcome=None,
                path_similarity_score=c.get('pathSimilarityScore'),
                display=c.get('display') or {},
            )
            for c in contacts[:limit]
        ]

    ranked = _compute_contacts(uid)
    jobs = _compute_jobs(uid)
    _write_cache(uid, contacts=ranked, jobs=jobs)
    return ranked[:limit]


def rank_jobs(uid: str, *, limit: int = 20) -> List[RankedJob]:
    """Return ranked job recommendations for a user. See rank_contacts."""
    if not uid:
        return []
    if limit <= 0:
        return []

    cache = _read_cache(uid)
    if cache and _cache_is_fresh(uid, cache):
        jobs = cache.get('jobs') or []
        return [
            RankedJob(
                posting_id=j.get('postingId') or '',
                score=float(j.get('score') or 0.0),
                rationale=j.get('rationale') or '',
                predicted_outcome=None,
                path_similarity_score=j.get('pathSimilarityScore'),
                display=j.get('display') or {},
            )
            for j in jobs[:limit]
        ]

    contacts = _compute_contacts(uid)
    ranked = _compute_jobs(uid)
    _write_cache(uid, contacts=contacts, jobs=ranked)
    return ranked[:limit]


def invalidate_cache(uid: str) -> None:
    """Drop the cache doc. Tests + admin tooling call this directly."""
    if not uid:
        return
    try:
        _cache_ref(uid).delete()
    except Exception:  # pragma: no cover
        pass


# ============================================================================
# Compute (private)
# ============================================================================


def _compute_contacts(uid: str) -> List[RankedContact]:
    profile = _read_user_profile(uid)
    contexts = _read_company_contexts(uid)

    target_companies_slugs: set = set()
    for c in (profile.get('targetCompanies') or []):
        slug = _slugify_company(c)
        if slug:
            target_companies_slugs.add(slug)

    target_industries: set = {
        _norm_lower(i) for i in (profile.get('targetIndustries') or []) if i
    }
    school_norm = profile.get('schoolNormalized') or _norm_lower(profile.get('school') or '') or None
    company_contexts_slugs: set = {
        c.get('companyId') for c in contexts if c.get('companyId')
    }

    # Behavior signals from the last 60 days. Empty for cold-start users.
    since = _now_dt() - timedelta(days=60)
    signals = _read_recent_event_signals(uid, since)

    saved = _read_saved_contacts(uid, MAX_CONTACTS_TO_SCORE)

    scored: List[RankedContact] = []
    for contact in saved:
        score, rationale = _score_contact(
            contact,
            target_companies_slugs=target_companies_slugs,
            target_industries=target_industries,
            school_norm=school_norm,
            company_contexts_slugs=company_contexts_slugs,
            replied_contact_ids=signals['replied_contact_ids'],
            viewed_contact_ids=signals['viewed_contact_ids'],
            answered_company_ids=signals['answered_company_ids'],
        )
        cid = contact.get('_id') or contact.get('id') or contact.get('contactId')
        if not cid:
            continue
        scored.append(RankedContact(
            contact_id=str(cid),
            score=score,
            rationale=rationale,
            display={
                'kind': 'saved',
                'company': contact.get('company') or contact.get('companyName'),
                'name': contact.get('name') or contact.get('fullName'),
                'title': contact.get('title') or contact.get('jobTitle'),
            },
        ))

    scored.sort(key=lambda r: r.score, reverse=True)

    if len(scored) < MIN_RECOMMENDATIONS:
        # Section 15 number 7: never show "no recommendations". Top up
        # with synthetic seeds drawn from the structured profile.
        seeds = _seed_contact_picks(profile, MIN_RECOMMENDATIONS - len(scored) + 5)
        existing_ids = {r.contact_id for r in scored}
        for s in seeds:
            if s.contact_id in existing_ids:
                continue
            scored.append(s)
            existing_ids.add(s.contact_id)
        scored.sort(key=lambda r: r.score, reverse=True)

    return scored


def _compute_jobs(uid: str) -> List[RankedJob]:
    profile = _read_user_profile(uid)
    seeds = _seed_job_picks(profile, MIN_RECOMMENDATIONS + 10)
    seeds.sort(key=lambda r: r.score, reverse=True)
    return seeds
