"""
DerivedProfile synthesis cron -- Phase 4 of the Personalization Data Layer.

Two trigger modes (per §6.1 of the eng review):

  1. EVENT-TRIGGERED: when a user has logged N=10 new events since their
     last synthesis (`derivedProfile/v1.synthesizedFromEventCount` vs the
     current event count), we kick off a synth for that user.

  2. NIGHTLY SWEEP: once a day, run synth for every active user whose
     last synthesis is older than 24h. Catches users with low event volume
     so their profile stays current.

Cost projection at 300 active users × N=10 trigger + nightly sweep:
   ~3,000 synth runs / week × ~$0.00075 / run = ~$10/month on gpt-4o-mini.

§12 critical gap: per-user try/except + Sentry capture per failure so one
user's bad data doesn't abort the whole sweep.

This script can run in two ways:
  A. As a Render scheduled job (recommended): cron entry calls
     `python -m backend.scripts.derived_profile_cron --mode nightly`.
  B. As a daemon thread inside wsgi.py -- wakes every 30 minutes and runs
     `--mode event-triggered`. Add it to wsgi.py:265-style daemon list.

Behind `DERIVED_PROFILE_ENABLED` env flag -- defaults OFF.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

# Make `app.*` importable when invoked as `python -m backend.scripts.X`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.extensions import get_db  # noqa: E402
from app.services import derived_profile_service  # noqa: E402

logger = logging.getLogger('derived_profile_cron')

# How many new events trigger an event-driven resynth.
EVENT_TRIGGER_THRESHOLD = int(os.getenv('DERIVED_PROFILE_TRIGGER_N', '10'))

# Skip users whose lastSynthesizedAt is fresher than this (nightly mode only).
NIGHTLY_FRESHNESS_HOURS = int(os.getenv('DERIVED_PROFILE_NIGHTLY_HOURS', '24'))

# Hard cap on users processed per run -- guard against runaway batches.
MAX_USERS_PER_RUN = int(os.getenv('DERIVED_PROFILE_MAX_USERS', '500'))


def _capture_exception(exc: Exception, *, uid: str, mode: str) -> None:
    """Send to Sentry if configured, else log. Per-user isolation per §12."""
    try:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    except Exception:  # pragma: no cover -- sentry not installed or not init'd
        pass
    logger.exception('derived_profile_cron: synth failed uid=%s mode=%s exc=%s',
                     uid, mode, exc)


def _iter_active_user_ids(db) -> Iterable[str]:
    """Yield uids that have at least one event (proxy for "active")."""
    for u in db.collection('users').stream():
        yield u.id


def _count_events_since(db, uid: str, since: Optional[datetime]) -> int:
    """Cheap scan count. Bounded by the events-collection 90-day TTL."""
    coll = db.collection('users').document(uid).collection('events')
    count = 0
    try:
        for snap in coll.stream():
            if since:
                data = snap.to_dict() or {}
                ts = data.get('timestamp') or data.get('createdAt')
                if ts is None:
                    continue
                # Lazy parse -- only if we care to filter.
                from app.services.derived_profile_service import _coerce_dt as parse
                ts_dt = parse(ts)
                if ts_dt is None or ts_dt < since:
                    continue
            count += 1
    except Exception as exc:  # pragma: no cover
        logger.warning('count_events_since[%s] failed: %s', uid, exc)
    return count


def _last_synth_at(profile: Optional[dict]) -> Optional[datetime]:
    if not profile:
        return None
    raw = profile.get('lastSynthesizedAt')
    from app.services.derived_profile_service import _coerce_dt
    return _coerce_dt(raw)


def run_event_triggered(*, dry_run: bool = False) -> dict:
    """Run synth for every user whose new-event count >= threshold.

    The DERIVED_PROFILE_ENABLED gate is checked per-uid so a per-uid override
    of `true` can force-enable synthesis for specific users (e.g. founders)
    while the env var is still globally false during rollout.
    """
    db = get_db()
    processed = 0
    triggered = 0
    failed = 0
    started = time.time()

    for uid in _iter_active_user_ids(db):
        if processed >= MAX_USERS_PER_RUN:
            break
        processed += 1

        if not derived_profile_service.is_enabled(uid):
            continue

        try:
            profile = derived_profile_service.get_derived_profile(uid)
            last = _last_synth_at(profile)
            new_count = _count_events_since(db, uid, last) if last else _count_events_since(db, uid, None)
            if new_count < EVENT_TRIGGER_THRESHOLD:
                continue

            if dry_run:
                triggered += 1
                logger.info('event-triggered dry-run: uid=%s new_events=%d', uid, new_count)
                continue

            derived_profile_service.synthesize(uid)
            triggered += 1
            logger.info('event-triggered synth ok: uid=%s new_events=%d', uid, new_count)
        except Exception as exc:
            failed += 1
            _capture_exception(exc, uid=uid, mode='event-triggered')

    return {
        'mode': 'event-triggered',
        'processed': processed,
        'triggered': triggered,
        'failed': failed,
        'duration_seconds': round(time.time() - started, 2),
    }


def run_nightly(*, dry_run: bool = False) -> dict:
    """Run synth for every user whose last synth is older than the freshness window.

    The DERIVED_PROFILE_ENABLED gate is checked per-uid so a per-uid override
    of `true` can force-enable synthesis for specific users while the env var
    is still globally false.
    """
    db = get_db()
    processed = 0
    triggered = 0
    skipped_fresh = 0
    failed = 0
    started = time.time()
    freshness = datetime.now(timezone.utc) - timedelta(hours=NIGHTLY_FRESHNESS_HOURS)

    for uid in _iter_active_user_ids(db):
        if processed >= MAX_USERS_PER_RUN:
            break
        processed += 1

        if not derived_profile_service.is_enabled(uid):
            continue

        try:
            profile = derived_profile_service.get_derived_profile(uid)
            last = _last_synth_at(profile)
            if last is not None and last >= freshness:
                # Already synthesized within the window -- could have been
                # an event-triggered run earlier today. Skip.
                skipped_fresh += 1
                continue

            if dry_run:
                triggered += 1
                continue

            derived_profile_service.synthesize(uid)
            triggered += 1
            logger.info('nightly synth ok: uid=%s', uid)
        except Exception as exc:
            failed += 1
            _capture_exception(exc, uid=uid, mode='nightly')

    return {
        'mode': 'nightly',
        'processed': processed,
        'triggered': triggered,
        'skipped_fresh': skipped_fresh,
        'failed': failed,
        'duration_seconds': round(time.time() - started, 2),
    }


def main() -> int:
    p = argparse.ArgumentParser(description='derivedProfile synthesis cron')
    p.add_argument(
        '--mode',
        choices=('event-triggered', 'nightly'),
        default='event-triggered',
        help='Trigger mode (default: event-triggered).',
    )
    p.add_argument('--dry-run', action='store_true', help='Skip writes; just report counts.')
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s %(name)s %(levelname)s %(message)s')

    if args.mode == 'nightly':
        result = run_nightly(dry_run=args.dry_run)
    else:
        result = run_event_triggered(dry_run=args.dry_run)

    import json
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == '__main__':
    sys.exit(main())
