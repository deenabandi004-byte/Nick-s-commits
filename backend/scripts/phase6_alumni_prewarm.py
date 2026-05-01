"""
Alumni cache prewarm cron, Phase 6 of the Personalization Data Layer.

Section 6.2 PDL cost projection: cold-start week 1 has ~6,000 unseen
(school, company, office) triples and naively hits PDL on every miss
($600 spike). The mitigation is a prewarm script that fans out the most
predictable pairs offline at controlled concurrency and writes them
through the alumniCounts cache before any user can trigger a paying
read.

Two modes:

  --mode warm
      Walk every paying user, take their (school, top targetCompanies)
      pairs, dedupe across users, and source each pair through
      alumni_sourcing_service.source_alumni_for_pair. This is the bulk
      cold-start sweep. Caps at MAX_PAIRS to keep one run bounded.

  --mode user --uid <uid>
      Warm one user's pairs. Useful for the post-profileConfirmedAt
      lifecycle hook.

Per-user error isolation + Sentry capture per failure so one bad row
does not abort the sweep (section 12 critical gap, mirrored from the
Phase 4 derived-profile cron pattern).

Behind ALUMNI_GRAPH_ENABLED env flag, default OFF. The cron does
nothing when the flag is off so the script is safe to schedule before
the rollout flips.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from typing import Iterable, List, Set, Tuple

# Make `app.*` resolvable when invoked directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.extensions import init_firebase, get_db  # noqa: E402
from app.models.users import normalize_company, normalize_school  # noqa: E402

logger = logging.getLogger('phase6_alumni_prewarm')

MAX_PAIRS_PER_RUN = 200
PER_CALL_SLEEP_SECONDS = 0.25


def _is_paying(user: dict) -> bool:
    """Per the strategic-pivot note, both subscriptionTier and legacy tier
    must be checked."""
    sub = (user.get('subscriptionTier') or '').lower()
    legacy = (user.get('tier') or '').lower()
    return sub in ('pro', 'elite') or legacy in ('pro', 'elite')


def _user_pairs(user: dict, top_n: int = 5) -> List[Tuple[str, str]]:
    school_id = user.get('schoolNormalized') or normalize_school(user.get('school'))
    if not school_id:
        return []
    pairs: List[Tuple[str, str]] = []
    seen: Set[str] = set()
    for c in (user.get('targetCompanies') or [])[:top_n]:
        slug = normalize_company(c) if isinstance(c, str) else None
        if slug and slug not in seen:
            seen.add(slug)
            pairs.append((school_id, slug))
    cur = user.get('currentCompanyNormalized') or (
        normalize_company(user.get('currentCompany'))
    )
    if cur and cur not in seen:
        pairs.append((school_id, cur))
    return pairs


def _collect_pairs(only_uid: str = None) -> List[Tuple[str, str]]:
    db = get_db()
    out: List[Tuple[str, str]] = []
    seen: Set[Tuple[str, str]] = set()
    if only_uid:
        snap = db.collection('users').document(only_uid).get()
        users: Iterable[dict] = [snap.to_dict() or {}] if snap.exists else []
    else:
        users = (
            (s.to_dict() or {}) for s in db.collection('users').stream()
        )
    for user in users:
        if not only_uid and not _is_paying(user):
            continue
        for pair in _user_pairs(user):
            if pair in seen:
                continue
            seen.add(pair)
            out.append(pair)
            if len(out) >= MAX_PAIRS_PER_RUN:
                return out
    return out


def _capture_sentry(exc: Exception, **tags) -> None:
    try:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            for k, v in tags.items():
                scope.set_tag(k, v)
            sentry_sdk.capture_exception(exc)
    except Exception:
        pass


def run(mode: str, uid: str = None) -> None:
    if os.getenv('ALUMNI_GRAPH_ENABLED', 'false').lower() != 'true':
        logger.info('phase6_alumni_prewarm: ALUMNI_GRAPH_ENABLED is off; exiting')
        return

    init_firebase()

    from app.services.alumni_sourcing_service import source_alumni_for_pair

    if mode == 'user':
        if not uid:
            raise SystemExit('--mode user requires --uid')
        pairs = _collect_pairs(only_uid=uid)
    else:
        pairs = _collect_pairs()

    logger.info('phase6_alumni_prewarm: warming %d pair(s) in mode=%s', len(pairs), mode)
    written = 0
    failed = 0
    for school_id, company_id in pairs:
        try:
            res = source_alumni_for_pair(school_id, company_id)
            if res is not None:
                written += 1
        except Exception as exc:
            failed += 1
            logger.exception(
                'phase6_alumni_prewarm: pair failed school=%s company=%s',
                school_id, company_id,
            )
            _capture_sentry(exc, school_id=school_id, company_id=company_id, mode=mode)
        if PER_CALL_SLEEP_SECONDS > 0:
            time.sleep(PER_CALL_SLEEP_SECONDS)

    logger.info(
        'phase6_alumni_prewarm: done mode=%s written=%d failed=%d total=%d',
        mode, written, failed, len(pairs),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('warm', 'user'), default='warm')
    parser.add_argument('--uid', default=None, help='Required when --mode user.')
    parser.add_argument(
        '--log-level', default='INFO',
        choices=('DEBUG', 'INFO', 'WARNING', 'ERROR'),
    )
    args = parser.parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format='%(asctime)s %(levelname)s %(name)s %(message)s',
    )
    run(args.mode, uid=args.uid)


if __name__ == '__main__':
    main()
