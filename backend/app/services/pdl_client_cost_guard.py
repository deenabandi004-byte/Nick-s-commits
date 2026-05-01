"""
PDL daily cost guard, Phase 6 of the Personalization Data Layer.

Per section 12 of the eng review (risk #3), an unbounded PDL spend is the
high-blast-radius failure mode of the alumni sourcing pipeline. A bug in
cache-key construction or invalidation can 10x the call volume in an
afternoon. This module is the kill switch.

Design:

    Daily call counter lives in a single Firestore doc:
        pdl_cost_guard/{YYYY-MM-DD}
            {
              calls: int,
              estCostUsd: float,
              capUsd: float,
              capExceededAt: ISO8601 | None,
            }

    On each call, the orchestrator calls allow_pdl_call() which:
      1. Reads the current day's doc.
      2. If estCostUsd >= capUsd, returns False and logs.
      3. Otherwise increments calls + estCostUsd by PDL_CALL_COST_USD.

    The cap defaults to $100/day (PDL_DAILY_CAP_USD env override). Cost per
    call defaults to $0.10 (PDL_PER_CALL_COST_USD env override) and is the
    midpoint of the section 6.2 estimate.

This is a soft cap, not a hard one: the increment is racy under
concurrent workers. That is fine for a $100 ceiling. A 10x miss on a
$100 cap is still much smaller than the unbounded failure.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict

from app.extensions import get_db

logger = logging.getLogger('pdl_cost_guard')

DEFAULT_CAP_USD = 100.0
DEFAULT_CALL_COST_USD = 0.10


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def _cap_usd() -> float:
    try:
        return float(os.getenv('PDL_DAILY_CAP_USD', str(DEFAULT_CAP_USD)))
    except (TypeError, ValueError):
        return DEFAULT_CAP_USD


def _call_cost_usd() -> float:
    try:
        return float(os.getenv('PDL_PER_CALL_COST_USD', str(DEFAULT_CALL_COST_USD)))
    except (TypeError, ValueError):
        return DEFAULT_CALL_COST_USD


def _read(doc_ref) -> Dict[str, Any]:
    snap = doc_ref.get()
    if not snap.exists:
        return {}
    return snap.to_dict() or {}


def allow_pdl_call() -> bool:
    """Increment the daily counter and return whether the call is allowed.

    Returns False once the day's running cost meets or exceeds the cap.
    On any unexpected error, returns True (the cost guard should never
    block the read path more aggressively than the underlying provider).
    """
    cap = _cap_usd()
    cost_per = _call_cost_usd()
    if cap <= 0:
        return False

    try:
        db = get_db()
        ref = db.collection('pdl_cost_guard').document(_today_key())
        current = _read(ref)
        running = float(current.get('estCostUsd') or 0.0)
        if running >= cap:
            if not current.get('capExceededAt'):
                ref.set(
                    {
                        'capExceededAt': datetime.now(timezone.utc).isoformat(),
                        'capUsd': cap,
                    },
                    merge=True,
                )
            logger.error(
                'pdl_cost_guard: daily cap reached running=%.2f cap=%.2f',
                running, cap,
            )
            return False
        ref.set(
            {
                'calls': int(current.get('calls') or 0) + 1,
                'estCostUsd': running + cost_per,
                'capUsd': cap,
                'lastCallAt': datetime.now(timezone.utc).isoformat(),
            },
            merge=True,
        )
        return True
    except Exception:
        logger.exception('pdl_cost_guard: error reading/incrementing cap')
        return True


def get_today_state() -> Dict[str, Any]:
    """Read-only helper for /admin observability."""
    try:
        db = get_db()
        ref = db.collection('pdl_cost_guard').document(_today_key())
        return {**_read(ref), 'date': _today_key(), 'capUsd': _cap_usd()}
    except Exception:
        logger.exception('pdl_cost_guard: state read failed')
        return {'date': _today_key(), 'capUsd': _cap_usd()}
