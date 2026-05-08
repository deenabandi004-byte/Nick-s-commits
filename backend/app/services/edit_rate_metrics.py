"""
Edit-rate metrics  Phase 7 of the Personalization Data Layer.

Pure-function module that turns the append-only event log
(`users/{uid}/events`) into the A/B comparison the admin edit-rate
dashboard needs. Extracted from `routes/admin.py:edit_rate_dashboard`
so the metric pipeline is unit-testable in isolation per spec section 7
P7 ("edit-rate metric pipeline event log dashboard").

Bucketing rule (in order of precedence):
  1. If the email_drafted event payload has `generatorVersion`
     ('old' | 'new' | 'new_unavailable'), bucket on that. This is the
     most accurate signal because it reflects which path actually
     produced the draft.
  2. Otherwise, fall back to the user's current USE_NEW_GENERATOR
     assignment via feature_flags.get_assignment. Useful for events
     written before the dispatcher landed in Phase 7.

Events with no recognizable signal are dropped from the comparison.

The 'new_unavailable' bucket is reported separately, NOT folded into
'new_generator', so the dashboard can surface fallback rate without
dirtying the A/B numbers.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional, Tuple

from app.services.feature_flags import USE_NEW_GENERATOR, _get_flags, get_assignment

logger = logging.getLogger('edit_rate_metrics')

GENERATOR_OLD = 'old'
GENERATOR_NEW = 'new'
GENERATOR_NEW_UNAVAILABLE = 'new_unavailable'

_BUCKET_OLD = 'old_generator'
_BUCKET_NEW = 'new_generator'
_BUCKET_NEW_UNAVAILABLE = 'new_unavailable'


def _coerce_dt(value: Any) -> Optional[datetime]:
    """Coerce a Firestore timestamp / ISO string into a UTC datetime.

    Mirrors `derived_profile_service._coerce_dt` so we don't pull a
    cross-module dependency just for one helper. Returns None if the
    value is unrecognizable or missing.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, 'isoformat'):  # firestore Timestamp / google-protobuf
        try:
            return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
        except Exception:
            pass
    if isinstance(value, str):
        try:
            # fromisoformat tolerates 'Z' suffix as of 3.11; strip just in case.
            v = value.rstrip('Z')
            dt = datetime.fromisoformat(v)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _bucket_from_payload(payload: Optional[Dict[str, Any]]) -> Optional[str]:
    """Map the event payload's `generatorVersion` to a dashboard bucket.

    Returns None when the field is missing or has an unknown value, so
    callers can fall back to the user-level assignment.
    """
    if not isinstance(payload, dict):
        return None
    version = payload.get('generatorVersion')
    if version == GENERATOR_OLD:
        return _BUCKET_OLD
    if version == GENERATOR_NEW:
        return _BUCKET_NEW
    if version == GENERATOR_NEW_UNAVAILABLE:
        return _BUCKET_NEW_UNAVAILABLE
    return None


def _bucket_from_user_assignment(uid: str) -> str:
    """Fallback bucket when an event predates the generatorVersion field.

    Reads the user's CURRENT assignment, which is wrong for old drafts
    written under a previous rollout pct, but is the best signal we
    have without payload metadata. The dashboard surfaces window_days
    so callers can pick a window that mostly post-dates the dispatcher
    rollout.
    """
    assignment = get_assignment(USE_NEW_GENERATOR, uid)
    return _BUCKET_NEW if assignment.get('enabled') else _BUCKET_OLD


def _empty_bucket() -> Dict[str, Any]:
    return {'drafts': 0, 'edits': 0, 'users': set()}


def _iter_user_events(db, uid: str) -> Iterable[Tuple[str, Dict[str, Any], Optional[datetime]]]:
    """Yield (type, payload, ts) for each event in users/{uid}/events.

    Errors per-user (e.g. permission denied) are swallowed so one bad
    user can't poison the dashboard for everyone.
    """
    try:
        snaps = (
            db.collection('users')
            .document(uid)
            .collection('events')
            .stream()
        )
    except Exception as exc:  # pragma: no cover  Firestore unreachable
        logger.warning('events stream failed for uid=%s: %s', uid, exc)
        return
    for snap in snaps:
        data = snap.to_dict() or {}
        ts = _coerce_dt(data.get('timestamp') or data.get('createdAt'))
        yield (
            data.get('type') or '',
            data.get('payload') or {},
            ts,
        )


def compute_edit_rate(db, *, window_days: int = 14) -> Dict[str, Any]:
    """Compute the edit-rate dashboard payload.

    Args:
        db: Firestore client (`get_db()`).
        window_days: Only count events with `timestamp` within the last
            N days. Clamped to [1, 90] by callers; we re-clamp here so
            a unit test passing a literal value can't blow past 90.

    Returns:
        {
          'old_generator':       {drafts, edits, edit_rate, users},
          'new_generator':       {drafts, edits, edit_rate, users},
          'new_unavailable':     {drafts, edits, edit_rate, users},
          'rollout_pct':         int,
          'window_days':         int,
          'sample_size': {
            'old_generator':     int,
            'new_generator':     int,
            'new_unavailable':   int,
          },
        }
    """
    window_days = max(1, min(90, int(window_days)))
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

    buckets: Dict[str, Dict[str, Any]] = {
        _BUCKET_OLD: _empty_bucket(),
        _BUCKET_NEW: _empty_bucket(),
        _BUCKET_NEW_UNAVAILABLE: _empty_bucket(),
    }

    try:
        users_iter = db.collection('users').stream()
    except Exception as exc:  # pragma: no cover  Firestore unreachable
        logger.warning('users stream failed: %s', exc)
        users_iter = iter(())

    for u in users_iter:
        uid = u.id
        # Pre-compute user-level fallback once; only used for events that
        # don't carry generatorVersion.
        fallback_bucket: Optional[str] = None

        for ev_type, payload, ts in _iter_user_events(db, uid):
            if ts is None or ts < cutoff:
                continue
            if ev_type not in ('email_drafted', 'email_edited'):
                continue
            bucket_key = _bucket_from_payload(payload)
            if bucket_key is None:
                if fallback_bucket is None:
                    fallback_bucket = _bucket_from_user_assignment(uid)
                bucket_key = fallback_bucket
            bucket = buckets[bucket_key]
            if ev_type == 'email_drafted':
                bucket['drafts'] += 1
            elif ev_type == 'email_edited':
                bucket['edits'] += 1
            bucket['users'].add(uid)

    flags = _get_flags()
    rollout_pct = int((flags.get(USE_NEW_GENERATOR) or {}).get('rollout_pct', 0) or 0)

    def _summary(b: Dict[str, Any]) -> Dict[str, Any]:
        d = b['drafts']
        e = b['edits']
        return {
            'drafts': d,
            'edits': e,
            'edit_rate': round((e / d) if d else 0.0, 4),
            'users': len(b['users']),
        }

    sample_size = {
        _BUCKET_OLD: buckets[_BUCKET_OLD]['drafts'],
        _BUCKET_NEW: buckets[_BUCKET_NEW]['drafts'],
        _BUCKET_NEW_UNAVAILABLE: buckets[_BUCKET_NEW_UNAVAILABLE]['drafts'],
    }

    return {
        _BUCKET_OLD: _summary(buckets[_BUCKET_OLD]),
        _BUCKET_NEW: _summary(buckets[_BUCKET_NEW]),
        _BUCKET_NEW_UNAVAILABLE: _summary(buckets[_BUCKET_NEW_UNAVAILABLE]),
        'rollout_pct': rollout_pct,
        'window_days': window_days,
        'sample_size': sample_size,
    }
