"""
Feature flags -- Phase 4 of the Personalization Data Layer.

Single Firestore doc (`feature_flags/global`) holds the experiment config:

    {
      "USE_NEW_GENERATOR": {
        "enabled": true,
        "rollout_pct": 10,        # 0-100
        "overrides": {            # uid → bool, force on/off for a specific user
          "uid-of-founder": true,
          "uid-of-cofounder": true
        }
      },
      "DERIVED_PROFILE_SYNTHESIS": {
        "enabled": false,
        "rollout_pct": 0,
        "overrides": {}
      }
    }

Lookup is `is_enabled_for_user(flag, uid)`:
  1. If the global env-var kill switch is set OFF, short-circuit False.
  2. Look up `flags.{flag}.overrides[uid]`. If present, honor it.
  3. Compute `bucket = sha256(flag:uid)[:8] mod 100`. If `bucket < rollout_pct`,
     return `enabled` (so flipping `enabled` to false instantly disables
     everyone without touching `rollout_pct`).
  4. Otherwise return False.

The Firestore doc is read with a 60s in-memory TTL cache. Flag flips
propagate within a minute. We deliberately do NOT subscribe to live
Firestore listeners -- the operational cost (one connection per worker,
forever) outweighs the 60s lag.

§10.5 of the eng review: "build the minimum yourself, don't adopt a vendor."
This is that minimum. ~120 lines, no dependencies beyond Firestore.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, Dict, Optional

from app.extensions import get_db

logger = logging.getLogger('feature_flags')

# Doc path in Firestore.
FLAGS_DOC_PATH = ('feature_flags', 'global')

# In-memory cache; flag flips propagate within this window.
_CACHE_TTL_SECONDS = 5
_cache: Dict[str, Any] = {'expires_at': 0.0, 'flags': {}}


# ---------------------------------------------------------------------------
# Known flags (well-known constants -- referenced from synthesis + email gen)
# ---------------------------------------------------------------------------

USE_NEW_GENERATOR = 'USE_NEW_GENERATOR'                  # Phase 7 ramp
DERIVED_PROFILE_SYNTHESIS = 'DERIVED_PROFILE_SYNTHESIS'  # Phase 4 cron / synthesis


def _read_flags_from_firestore() -> Dict[str, Any]:
    """Read the feature_flags/global doc. Returns {} on miss/error."""
    try:
        db = get_db()
        snap = db.collection(FLAGS_DOC_PATH[0]).document(FLAGS_DOC_PATH[1]).get()
        if snap.exists:
            data = snap.to_dict() or {}
            return data
        return {}
    except Exception as exc:  # pragma: no cover -- Firestore unreachable
        logger.warning('feature_flags: read failed: %s', exc)
        return {}


def _get_flags() -> Dict[str, Any]:
    """Return the current flag map, refreshing the cache as needed."""
    now = time.time()
    if now < _cache['expires_at']:
        return _cache['flags']
    flags = _read_flags_from_firestore()
    _cache['flags'] = flags
    _cache['expires_at'] = now + _CACHE_TTL_SECONDS
    return flags


def _bucket(flag: str, uid: str) -> int:
    """Deterministic [0, 100) bucket -- same (flag, uid) always lands together."""
    raw = f'{flag}:{uid}'.encode('utf-8')
    digest = hashlib.sha256(raw).hexdigest()[:8]
    return int(digest, 16) % 100


def is_enabled_for_user(flag: str, uid: Optional[str]) -> bool:
    """Return whether `flag` is on for `uid`.

    Args:
        flag: The flag name (e.g. USE_NEW_GENERATOR).
        uid: The user's Firebase UID. None / empty returns False.

    Returns:
        True iff the flag is enabled and the user falls inside the rollout
        (or has an explicit override).
    """
    if not uid or not flag:
        return False

    # Hard kill switch via env var. `<FLAG>_KILL=true` disables for everyone
    # without touching Firestore.
    if os.getenv(f'{flag}_KILL', 'false').lower() == 'true':
        return False

    flags = _get_flags()
    cfg = flags.get(flag)
    if not isinstance(cfg, dict):
        return False

    if not cfg.get('enabled', False):
        return False

    overrides = cfg.get('overrides') or {}
    if isinstance(overrides, dict) and uid in overrides:
        return bool(overrides[uid])

    rollout_pct = cfg.get('rollout_pct', 0)
    try:
        pct = int(rollout_pct)
    except (TypeError, ValueError):
        pct = 0
    pct = max(0, min(100, pct))
    if pct == 0:
        return False
    if pct >= 100:
        return True

    return _bucket(flag, uid) < pct


def get_assignment(flag: str, uid: Optional[str]) -> Dict[str, Any]:
    """Return a richer assignment dict -- useful for the edit-rate dashboard.

    {
      'flag': str,
      'uid': str,
      'enabled': bool,        # final result
      'reason': 'override' | 'rollout' | 'flag_off' | 'kill_switch' | 'no_uid',
      'bucket': int | None,   # 0-99 if computed, else None
      'rollout_pct': int,
    }
    """
    if not uid:
        return {'flag': flag, 'uid': uid, 'enabled': False, 'reason': 'no_uid',
                'bucket': None, 'rollout_pct': 0}
    if os.getenv(f'{flag}_KILL', 'false').lower() == 'true':
        return {'flag': flag, 'uid': uid, 'enabled': False, 'reason': 'kill_switch',
                'bucket': None, 'rollout_pct': 0}

    cfg = _get_flags().get(flag) or {}
    if not cfg.get('enabled', False):
        return {'flag': flag, 'uid': uid, 'enabled': False, 'reason': 'flag_off',
                'bucket': None, 'rollout_pct': int(cfg.get('rollout_pct', 0) or 0)}

    overrides = cfg.get('overrides') or {}
    if isinstance(overrides, dict) and uid in overrides:
        return {'flag': flag, 'uid': uid, 'enabled': bool(overrides[uid]),
                'reason': 'override', 'bucket': None,
                'rollout_pct': int(cfg.get('rollout_pct', 0) or 0)}

    pct = int(cfg.get('rollout_pct', 0) or 0)
    pct = max(0, min(100, pct))
    bucket = _bucket(flag, uid)
    enabled = bucket < pct
    return {'flag': flag, 'uid': uid, 'enabled': enabled, 'reason': 'rollout',
            'bucket': bucket, 'rollout_pct': pct}


def invalidate_cache() -> None:
    """Drop the in-memory cache. Tests + admin endpoints call this so a
    flag flip is visible immediately."""
    _cache['expires_at'] = 0.0
    _cache['flags'] = {}


def set_flag(
    flag: str,
    *,
    enabled: Optional[bool] = None,
    rollout_pct: Optional[int] = None,
    overrides: Optional[Dict[str, bool]] = None,
) -> Dict[str, Any]:
    """Admin helper -- partial update of a flag config.

    Only the kwargs you pass get written. Returns the persisted config.
    Caller is responsible for any auth / audit logging.
    """
    if not flag:
        raise ValueError('flag is required')

    db = get_db()
    ref = db.collection(FLAGS_DOC_PATH[0]).document(FLAGS_DOC_PATH[1])
    snap = ref.get()
    current = (snap.to_dict() or {}) if snap.exists else {}
    cfg = current.get(flag) or {}
    if enabled is not None:
        cfg['enabled'] = bool(enabled)
    if rollout_pct is not None:
        cfg['rollout_pct'] = max(0, min(100, int(rollout_pct)))
    if overrides is not None:
        cfg['overrides'] = {k: bool(v) for k, v in overrides.items()}
    current[flag] = cfg
    ref.set(current, merge=True)
    invalidate_cache()
    return cfg
