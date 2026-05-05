"""
Phase 3 Decision Gate (per §5 of the eng review, Week 3 step).

Reads from `users/{*}/events/{*}` (already-shipped Phase 2 collection) and
computes two metrics:

  1. prompt_answered_rate = answered / shown
     If >50%, the floating prompt is doing useful work.

  2. email_edit_rate (current vs pre-Phase-3 baseline)
     Counted per (user, contact) pair. Trend is computed by splitting the
     event window at the FloatingPrompt rollout date — events before that
     are "baseline," events after are "phase 3."

Gate logic:
   answered_rate > 50% AND edit_rate trending DOWN  → COMMIT Phase 4
   else                                              → STOP, re-scope

Run from project root with the venv:
    backend/.venv/bin/python -m backend.scripts.phase3_decision_gate \
        --rollout-date 2026-04-29 \
        --since 2026-04-01

The script is read-only. Safe to run any time. Prints a JSON report and
exits 0 on a CLEAR gate, 1 on a STOP gate, 2 on insufficient data.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

# Make `app.*` importable when this script is invoked as a module.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.extensions import get_db  # noqa: E402

# Minimum events needed to make the call. Below this, gate returns 'insufficient_data'.
MIN_PROMPT_SHOWN = 50
MIN_EDIT_OBSERVATIONS = 30
ANSWERED_THRESHOLD = 0.50


def _parse_iso(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, 'to_datetime'):  # Firestore Timestamp
        return value.to_datetime().replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            v = value.replace('Z', '+00:00')
            parsed = datetime.fromisoformat(v)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _iter_all_events(db, since: Optional[datetime]) -> Iterable[Dict[str, Any]]:
    """Stream every users/*/events/* doc. For 300 users × ~30/wk events
    we're well under 100k docs — a streaming scan is fine."""
    users = db.collection('users').stream()
    for u in users:
        events = (
            db.collection('users')
            .document(u.id)
            .collection('events')
            .stream()
        )
        for ev in events:
            data = ev.to_dict() or {}
            ts = _parse_iso(data.get('timestamp')) or _parse_iso(data.get('createdAt'))
            if since and ts and ts < since:
                continue
            data['_uid'] = u.id
            data['_timestamp'] = ts
            yield data


def compute_gate(
    rollout_date: Optional[datetime] = None,
    since: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Pure compute. Returns the report dict — caller decides exit code."""
    db = get_db()

    prompt_shown = 0
    prompt_answered = 0
    edits_pre = 0
    edits_post = 0
    drafts_pre = 0
    drafts_post = 0

    for ev in _iter_all_events(db, since):
        ev_type = ev.get('type')
        ts = ev.get('_timestamp')
        is_post = (rollout_date is not None and ts is not None and ts >= rollout_date)

        if ev_type == 'prompt_shown':
            prompt_shown += 1
        elif ev_type == 'prompt_answered':
            prompt_answered += 1
        elif ev_type == 'email_drafted':
            if is_post:
                drafts_post += 1
            else:
                drafts_pre += 1
        elif ev_type == 'email_edited':
            if is_post:
                edits_post += 1
            else:
                edits_pre += 1

    answered_rate = (prompt_answered / prompt_shown) if prompt_shown else 0.0
    edit_rate_pre = (edits_pre / drafts_pre) if drafts_pre else None
    edit_rate_post = (edits_post / drafts_post) if drafts_post else None

    enough_prompt_data = prompt_shown >= MIN_PROMPT_SHOWN
    enough_edit_data = (drafts_pre >= MIN_EDIT_OBSERVATIONS
                       and drafts_post >= MIN_EDIT_OBSERVATIONS)

    decision = 'insufficient_data'
    reasons = []
    if not enough_prompt_data:
        reasons.append(f'prompt_shown={prompt_shown} < {MIN_PROMPT_SHOWN}')
    if not enough_edit_data:
        reasons.append(
            f'drafts_pre={drafts_pre}, drafts_post={drafts_post} '
            f'(need >= {MIN_EDIT_OBSERVATIONS} each)'
        )

    if enough_prompt_data and enough_edit_data:
        edit_trend_down = (
            edit_rate_pre is not None
            and edit_rate_post is not None
            and edit_rate_post < edit_rate_pre
        )
        if answered_rate > ANSWERED_THRESHOLD and edit_trend_down:
            decision = 'commit_phase_4'
            reasons.append('answered_rate above threshold and edit-rate trending down')
        else:
            decision = 'stop_re_scope'
            if answered_rate <= ANSWERED_THRESHOLD:
                reasons.append(
                    f'answered_rate={answered_rate:.2%} <= {ANSWERED_THRESHOLD:.0%}'
                )
            if not edit_trend_down:
                reasons.append('edit-rate not trending down')

    return {
        'decision': decision,
        'answered_rate': answered_rate,
        'prompt_shown': prompt_shown,
        'prompt_answered': prompt_answered,
        'edit_rate_pre': edit_rate_pre,
        'edit_rate_post': edit_rate_post,
        'drafts_pre': drafts_pre,
        'drafts_post': drafts_post,
        'edits_pre': edits_pre,
        'edits_post': edits_post,
        'thresholds': {
            'min_prompt_shown': MIN_PROMPT_SHOWN,
            'min_edit_observations': MIN_EDIT_OBSERVATIONS,
            'answered_threshold': ANSWERED_THRESHOLD,
        },
        'reasons': reasons,
    }


def main() -> int:
    p = argparse.ArgumentParser(description='Phase 3 Decision Gate')
    p.add_argument(
        '--rollout-date',
        help='ISO date the FloatingPrompt was enabled in prod (e.g. 2026-04-29)',
    )
    p.add_argument(
        '--since',
        help='Only consider events at or after this ISO date (default: 60 days back)',
    )
    args = p.parse_args()

    rollout = _parse_iso(args.rollout_date) if args.rollout_date else None
    since = _parse_iso(args.since)

    report = compute_gate(rollout_date=rollout, since=since)
    print(json.dumps(report, indent=2, default=str))

    if report['decision'] == 'commit_phase_4':
        return 0
    if report['decision'] == 'stop_re_scope':
        return 1
    return 2


if __name__ == '__main__':
    sys.exit(main())
