"""
Company contexts service -- Phase 1 + Phase 3 of the Personalization Data Layer.

A "company context" is the user's reason for caring about a particular
company ("My grandfather was a partner at GS, that's why I care about
M&A"). They feed the email generator at draft time so outreach reads
personalized instead of generic.

Phase 1 shipped the writer + reader.
Phase 3 adds `should_show_prompt(uid, company_id)` for the floating
prompt UX, with staleness rules per §10.3 of the eng review:
    - re-ask after 6 months OR
    - re-ask after 5 unanswered emails at this company OR
    - re-ask if the only context source is `inferred_from_resume` and the
      user hasn't explicitly answered yet (extraction is best-effort).

Subcollection layout (per §2.2 of the eng review):
    users/{uid}/companyContexts/{companyIdNormalized}
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from app.extensions import get_db
from app.models.users import normalize_company

CompanyContextSource = Literal['explicit', 'inferred_from_resume', 'inferred_from_behavior']

REASON_MAX_CHARS = 1000

# §10.3 staleness rules -- exposed so tests can monkeypatch.
STALENESS_WINDOW = timedelta(days=180)        # 6 months
UNANSWERED_REPLIES_THRESHOLD = 5              # 5 unanswered emails → re-ask


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_reason(reason: str) -> str:
    cleaned = (reason or '').strip()
    if not cleaned:
        raise ValueError('reason is required and cannot be empty')
    if len(cleaned) > REASON_MAX_CHARS:
        cleaned = cleaned[:REASON_MAX_CHARS]
    return cleaned


def write_company_context(
    uid: str,
    company_name: str,
    reason: str,
    source: CompanyContextSource = 'explicit',
    company_aliases: Optional[List[str]] = None,
    related_role_types: Optional[List[str]] = None,
    answered: bool = True,
    company_id_normalized: Optional[str] = None,
) -> Dict[str, Any]:
    """Write a company context for a user. Idempotent (uses set with merge).

    Args:
        uid: Firebase user ID.
        company_name: Display name (e.g. "Goldman Sachs").
        reason: The user's answer / extracted reason. Truncated to 1000 chars.
        source: How the context was obtained.
        company_aliases: Known aliases the user uses for this company.
        related_role_types: Role types the user is targeting at this company.
        answered: True if this represents a real answer (vs. just an `askedAt`
            placeholder written when the prompt is shown).
        company_id_normalized: Override slug (otherwise computed from `company_name`).

    Returns:
        The persisted document data.
    """
    if not uid:
        raise ValueError('uid is required')
    if not company_name:
        raise ValueError('company_name is required')

    cleaned_reason = _validate_reason(reason)
    company_id = company_id_normalized or normalize_company(company_name)
    if not company_id:
        raise ValueError(f'could not normalize company name: {company_name!r}')

    now = _now_iso()
    payload: Dict[str, Any] = {
        'companyId': company_id,
        'companyName': company_name.strip(),
        'companyAliases': sorted({a.strip() for a in (company_aliases or []) if a and a.strip()}),
        'reason': cleaned_reason,
        'askedAt': now,
        'answeredAt': now if answered else None,
        'source': source,
        'relatedRoleTypes': list(related_role_types or []),
        'lastUsedAt': now,
        'reaskAfter': None,
        'updatedAt': now,
    }

    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection('companyContexts')
        .document(company_id)
    )
    # Preserve original `askedAt` if doc already exists.
    existing = ref.get()
    if existing.exists:
        existing_data = existing.to_dict() or {}
        if existing_data.get('askedAt'):
            payload['askedAt'] = existing_data['askedAt']
        if not answered and existing_data.get('answeredAt'):
            payload['answeredAt'] = existing_data['answeredAt']

    ref.set(payload, merge=True)
    return payload


def get_company_context(uid: str, company_name: str) -> Optional[Dict[str, Any]]:
    """Read a company context by company display name (normalized internally)."""
    if not uid or not company_name:
        return None
    company_id = normalize_company(company_name)
    if not company_id:
        return None
    return get_company_context_by_id(uid, company_id)


def get_company_context_by_id(uid: str, company_id_normalized: str) -> Optional[Dict[str, Any]]:
    """Read by an already-normalized slug (avoids re-running normalize)."""
    if not uid or not company_id_normalized:
        return None
    db = get_db()
    doc = (
        db.collection('users')
        .document(uid)
        .collection('companyContexts')
        .document(company_id_normalized)
        .get()
    )
    if not doc.exists:
        return None
    return doc.to_dict()


def list_company_contexts(uid: str) -> List[Dict[str, Any]]:
    """Return all company contexts for a user, ordered by lastUsedAt desc."""
    if not uid:
        return []
    db = get_db()
    contexts: List[Dict[str, Any]] = []
    for snap in (
        db.collection('users')
        .document(uid)
        .collection('companyContexts')
        .stream()
    ):
        data = snap.to_dict() or {}
        data['_id'] = snap.id
        contexts.append(data)

    def _sort_key(ctx: Dict[str, Any]) -> str:
        return ctx.get('lastUsedAt') or ctx.get('answeredAt') or ''

    contexts.sort(key=_sort_key, reverse=True)
    return contexts


def touch_company_context(uid: str, company_id_normalized: str) -> None:
    """Bump lastUsedAt on a context (called when fed into a generation)."""
    if not uid or not company_id_normalized:
        return
    db = get_db()
    ref = (
        db.collection('users')
        .document(uid)
        .collection('companyContexts')
        .document(company_id_normalized)
    )
    if ref.get().exists:
        ref.update({'lastUsedAt': _now_iso()})


# ============================================================================
# Phase 3 -- should_show_prompt staleness logic
# ============================================================================


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse a stored ISO-8601 timestamp; return None if missing/invalid."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        # Python's fromisoformat handles "+00:00" but not the trailing "Z" on
        # older Python versions. Replace defensively.
        normalized = value.replace('Z', '+00:00') if isinstance(value, str) else value
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except (ValueError, TypeError):
        return None


def _count_unanswered_outbound_at_company(
    uid: str,
    company_id: str,
    since: Optional[datetime] = None,
) -> int:
    """Count outboundDrafts at this company that have not yet received a reply.

    Used by the staleness check -- 5 unanswered outbound emails to a company
    is a strong "your reason isn't compelling" signal, per §10.3, and
    triggers a re-ask of the floating prompt.

    Reads `users/{uid}/outboundDrafts` and filters in-memory by
    `companyIdNormalized`. The collection stays small per user (drafts are
    short-lived; a few hundred max even for power users) so a streaming
    scan is acceptable. If this becomes hot, add a (companyIdNormalized,
    replyReceivedAt) index and switch to a where-clause query.

    Args:
        uid: Firebase user ID.
        company_id: Normalized slug for the company.
        since: Only count drafts created at or after this time. None = all.

    Returns:
        Count of outboundDrafts where companyIdNormalized matches AND
        replyReceivedAt is null. Returns 0 on read failure (best-effort).
    """
    if not uid or not company_id:
        return 0

    db = get_db()
    try:
        snaps = (
            db.collection('users')
            .document(uid)
            .collection('outboundDrafts')
            .stream()
        )
    except Exception:  # pragma: no cover -- Firestore failure
        return 0

    count = 0
    for snap in snaps:
        data = snap.to_dict() or {}
        if data.get('companyIdNormalized') != company_id:
            continue
        if data.get('replyReceivedAt'):
            continue
        if since is not None:
            created = _parse_iso(data.get('createdAt'))
            if created and created < since:
                continue
        count += 1
    return count


def should_show_prompt(
    uid: str,
    company_id_normalized: str,
    *,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Return the prompt-decision for a (user, company) pair.

    Decision rules (§10.3):
      1. No context exists yet → SHOW (`reason: 'no_context'`)
      2. Context exists but `source == 'inferred_from_resume'` and user has
         never explicitly answered → SHOW (`reason: 'inferred_only'`)
      3. Context is older than STALENESS_WINDOW → SHOW (`reason: 'stale'`)
      4. User has UNANSWERED_REPLIES_THRESHOLD+ unanswered outbound emails
         at this company since the context was answered → SHOW
         (`reason: 'unanswered_threshold'`)
      5. Otherwise → HIDE.

    Args:
        uid: Firebase user ID.
        company_id_normalized: Already-normalized slug. Callers should run
            `app.utils.company.company_to_slug` on raw input.
        now: Inject for clock-mocking in tests.

    Returns:
        {
            'show': bool,
            'reason': 'no_context' | 'inferred_only' | 'stale'
                      | 'unanswered_threshold' | 'fresh',
            'priorContext': dict | None,    # the existing doc, if any
            'priorAnswer': str | None,       # the user's last reason text
                                              # (for stale re-ask UI per §15)
        }
    """
    if not uid or not company_id_normalized:
        return {
            'show': False,
            'reason': 'invalid_input',
            'priorContext': None,
            'priorAnswer': None,
        }

    now = now or datetime.now(timezone.utc)
    existing = get_company_context_by_id(uid, company_id_normalized)

    # Rule 1 -- no context.
    if not existing:
        return {
            'show': True,
            'reason': 'no_context',
            'priorContext': None,
            'priorAnswer': None,
        }

    source = existing.get('source')
    answered_at = _parse_iso(existing.get('answeredAt'))
    prior_answer = existing.get('reason') if existing.get('reason') else None

    # Rule 2 -- inferred-from-resume only and never explicitly answered.
    if source == 'inferred_from_resume' and not answered_at:
        return {
            'show': True,
            'reason': 'inferred_only',
            'priorContext': existing,
            'priorAnswer': prior_answer,
        }

    # Rule 3 -- staleness window. The reference timestamp is whichever is
    # most recent of `answeredAt` and `lastUsedAt` so re-asks happen when
    # the context has gone unused for the staleness window, not when the
    # context was created.
    last_active = answered_at or _parse_iso(existing.get('lastUsedAt'))
    if last_active is None:
        # Doc exists but no usable timestamp -- treat as stale defensively.
        return {
            'show': True,
            'reason': 'stale',
            'priorContext': existing,
            'priorAnswer': prior_answer,
        }
    if (now - last_active) >= STALENESS_WINDOW:
        return {
            'show': True,
            'reason': 'stale',
            'priorContext': existing,
            'priorAnswer': prior_answer,
        }

    # Rule 4 -- unanswered emails at this company since the context was
    # answered. We count from `answeredAt` so old ignored emails don't
    # accumulate forever and triple-fire the prompt.
    unanswered = _count_unanswered_outbound_at_company(
        uid, company_id_normalized, since=answered_at,
    )
    if unanswered >= UNANSWERED_REPLIES_THRESHOLD:
        return {
            'show': True,
            'reason': 'unanswered_threshold',
            'priorContext': existing,
            'priorAnswer': prior_answer,
        }

    return {
        'show': False,
        'reason': 'fresh',
        'priorContext': existing,
        'priorAnswer': prior_answer,
    }
