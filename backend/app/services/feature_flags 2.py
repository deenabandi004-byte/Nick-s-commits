"""
Feature flags service - Firestore-backed with per-uid overrides.

Flags live in Firestore at `feature_flags/{flag_name}` with shape:
    {
        "enabled": bool,           # global on/off
        "rollout_pct": int,        # 0-100, percentage of users to enable for
        "overrides": {             # per-uid force on/off
            "<uid>": true/false
        },
        "updatedAt": str           # ISO timestamp
    }

Resolution order (first match wins):
    1. Per-uid override in Firestore   (force on or off for a specific user)
    2. Env-var kill switch             (<FLAG>_KILL=true → off for everyone)
    3. Env-var enable                  (<FLAG>=true → on for everyone)
    4. Firestore rollout_pct           (deterministic hash bucketing)
    5. Firestore enabled               (global default)
    6. Code default                    (passed to is_enabled)

Deterministic bucketing: sha256(flag_name:uid) mod 100 < rollout_pct.
This means a user's assignment is stable across requests and workers.

In-memory cache with 60s TTL keeps Firestore reads low while allowing
flag changes to propagate within a minute.
"""

import hashlib
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

from app.extensions import get_db

logger = logging.getLogger("feature_flags")

# ---------------------------------------------------------------------------
# In-memory cache (per-worker, 60s TTL)
# ---------------------------------------------------------------------------

_cache: dict[str, dict] = {}
_cache_ts: dict[str, float] = {}
_CACHE_TTL = 60  # seconds


def _get_flag_doc(flag_name: str) -> dict:
    """Read a flag document from Firestore with caching."""
    now = time.time()
    if flag_name in _cache and (now - _cache_ts.get(flag_name, 0)) < _CACHE_TTL:
        return _cache[flag_name]

    try:
        db = get_db()
        doc = db.collection("feature_flags").document(flag_name).get()
        data = doc.to_dict() if doc.exists else {}
    except Exception as e:
        logger.warning("Failed to read feature flag %s: %s", flag_name, e)
        # Return cached value if available, else empty
        return _cache.get(flag_name, {})

    _cache[flag_name] = data
    _cache_ts[flag_name] = now
    return data


def invalidate_cache(flag_name: Optional[str] = None):
    """Clear the in-memory cache. Pass flag_name to clear one, or None for all."""
    if flag_name:
        _cache.pop(flag_name, None)
        _cache_ts.pop(flag_name, None)
    else:
        _cache.clear()
        _cache_ts.clear()


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def _bucket(flag_name: str, uid: str) -> int:
    """Deterministic 0-99 bucket for a (flag, uid) pair."""
    raw = hashlib.sha256(f"{flag_name}:{uid}".encode()).hexdigest()
    return int(raw, 16) % 100


def is_enabled(flag_name: str, uid: Optional[str] = None, default: bool = False) -> bool:
    """
    Check whether a feature flag is enabled.

    Args:
        flag_name: The flag identifier (e.g. "EVENTS_LOGGING_ENABLED").
        uid: Optional user ID for per-uid overrides and rollout bucketing.
        default: Fallback if no Firestore doc and no env var.

    Returns:
        True if the flag is on for this context, False otherwise.
    """
    env_key = flag_name.upper()

    # 1. Per-uid override (Firestore)
    if uid:
        override = get_user_override(flag_name, uid)
        if override is not None:
            return override

    # 2. Env-var kill switch (<FLAG>_KILL=true)
    if os.environ.get(f"{env_key}_KILL", "").lower() == "true":
        return False

    # 3. Env-var enable (<FLAG>=true/false)
    env_val = os.environ.get(env_key, "").lower()
    if env_val == "true":
        return True
    if env_val == "false":
        return False

    # 4-5. Firestore doc
    doc = _get_flag_doc(flag_name)
    if not doc:
        return default

    # 4. Rollout percentage (requires uid)
    rollout_pct = doc.get("rollout_pct")
    if rollout_pct is not None and uid:
        return _bucket(flag_name, uid) < int(rollout_pct)

    # 5. Global enabled field
    enabled = doc.get("enabled")
    if enabled is not None:
        return bool(enabled)

    return default


def is_enabled_for_user(flag_name: str, uid: str, default: bool = False) -> bool:
    """Convenience alias - same as is_enabled(flag_name, uid, default)."""
    return is_enabled(flag_name, uid, default)


def get_user_override(flag_name: str, uid: str) -> Optional[bool]:
    """
    Check for a per-uid override on a flag.
    Returns True/False if an override exists, None otherwise.
    """
    doc = _get_flag_doc(flag_name)
    overrides = doc.get("overrides")
    if not overrides or not isinstance(overrides, dict):
        return None
    if uid in overrides:
        return bool(overrides[uid])
    return None


# ---------------------------------------------------------------------------
# Flag management (admin)
# ---------------------------------------------------------------------------

def set_flag(
    flag_name: str,
    *,
    enabled: Optional[bool] = None,
    rollout_pct: Optional[int] = None,
):
    """Update a flag's global settings."""
    db = get_db()
    ref = db.collection("feature_flags").document(flag_name)
    updates = {
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    if enabled is not None:
        updates["enabled"] = enabled
    if rollout_pct is not None:
        updates["rollout_pct"] = max(0, min(100, int(rollout_pct)))

    ref.set(updates, merge=True)
    invalidate_cache(flag_name)
    logger.info("Flag %s updated: %s", flag_name, updates)


def set_user_override(flag_name: str, uid: str, value: bool):
    """Set a per-uid override on a flag."""
    db = get_db()
    ref = db.collection("feature_flags").document(flag_name)
    ref.set(
        {
            "overrides": {uid: value},
            "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
        merge=True,
    )
    invalidate_cache(flag_name)
    logger.info("Flag %s override for uid=%s set to %s", flag_name, uid, value)


def remove_user_override(flag_name: str, uid: str):
    """Remove a per-uid override."""
    from google.cloud.firestore_v1 import transforms
    db = get_db()
    ref = db.collection("feature_flags").document(flag_name)
    ref.update({
        f"overrides.{uid}": transforms.DELETE_FIELD,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    })
    invalidate_cache(flag_name)
    logger.info("Flag %s override for uid=%s removed", flag_name, uid)


def get_all_flags() -> list[dict]:
    """Return all flag documents (for admin dashboard)."""
    try:
        db = get_db()
        docs = db.collection("feature_flags").stream()
        flags = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["name"] = doc.id
            # Don't expose full overrides map, just count
            overrides = data.pop("overrides", {}) or {}
            data["override_count"] = len(overrides)
            flags.append(data)
        return flags
    except Exception as e:
        logger.error("Failed to list feature flags: %s", e)
        return []


# ---------------------------------------------------------------------------
# Known flag constants
# ---------------------------------------------------------------------------

# Personalization data layer flags
EVENTS_LOGGING_ENABLED = "EVENTS_LOGGING_ENABLED"
DERIVED_PROFILE_ENABLED = "DERIVED_PROFILE_ENABLED"
RECOMMENDATIONS_ENABLED = "RECOMMENDATIONS_ENABLED"
NUDGES_ENABLED = "NUDGES_ENABLED"
USE_NEW_GENERATOR = "USE_NEW_GENERATOR"
ALUMNI_GRAPH_ENABLED = "ALUMNI_GRAPH_ENABLED"
FLOATING_PROMPT_ENABLED = "FLOATING_PROMPT_ENABLED"
COLD_START_INTENT_ENABLED = "COLD_START_INTENT_ENABLED"
REPLY_ATTRIBUTION_ENABLED = "REPLY_ATTRIBUTION_ENABLED"
PDL_OUTAGE = "PDL_OUTAGE"
# Hard-coded kill switch - set to True when PDL API is down, False when restored.
PDL_OUTAGE_ACTIVE = True
