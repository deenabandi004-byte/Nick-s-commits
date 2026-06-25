"""
Per-user Loop alert email preferences — read/write helpers.

Schema lives on the user document at `users/{uid}.loopAlertEmail`:
  {
    enabled: bool,
    mode: "digest" | "instant",
    quietHours: {start: int 0-23, end: int 0-23},
    timezone: str (IANA),
    deliveryStatus: "ok" | "bounce" | "complaint"
  }

Defaults are sane for "user has never touched the toggle" — enabled=False
so we don't ship a surprise opt-in.
"""
from __future__ import annotations

import logging
from typing import Any

from app.extensions import get_db

logger = logging.getLogger(__name__)

DEFAULT_PREFS: dict[str, Any] = {
    "enabled": False,
    "mode": "digest",
    "quietHours": {"start": 21, "end": 8},
    "timezone": "America/Los_Angeles",
    "deliveryStatus": "ok",
}

VALID_MODES = {"digest", "instant"}
VALID_DELIVERY_STATUS = {"ok", "bounce", "complaint"}


def _user_ref(uid: str):
    return get_db().collection("users").document(uid)


def get_loop_alert_email(uid: str) -> dict:
    """Return the user's prefs merged onto DEFAULT_PREFS.

    Missing field → all defaults. Existing-but-partial field → merged so the
    client always receives a fully-populated object.
    """
    if not uid:
        raise ValueError("uid required")
    doc = _user_ref(uid).get()
    data = doc.to_dict() if doc.exists else {}
    stored = (data or {}).get("loopAlertEmail") or {}
    return _merge_prefs(DEFAULT_PREFS, stored)


def set_loop_alert_email(uid: str, prefs: dict) -> dict:
    """Validate + merge + persist the prefs patch. Returns the merged dict.

    Validation rules:
      - `enabled` must be bool
      - `mode` must be in {"digest", "instant"}
      - `timezone` must be a non-empty string
      - `quietHours.start` and `quietHours.end` must be ints in [0, 23]
      - `deliveryStatus` (if provided) must be in
        {"ok", "bounce", "complaint"}

    Raises ValueError on bad input. Always merges over existing stored
    prefs so a partial PATCH preserves untouched fields.
    """
    if not uid:
        raise ValueError("uid required")
    if not isinstance(prefs, dict):
        raise ValueError("prefs must be a dict")

    _validate_prefs(prefs)

    current = get_loop_alert_email(uid)
    merged = _merge_prefs(current, prefs)

    _user_ref(uid).set({"loopAlertEmail": merged}, merge=True)
    return merged


def disable_for_bounce(uid: str) -> dict:
    """Auto-disable sends after a bounce webhook. Idempotent."""
    return set_loop_alert_email(uid, {"enabled": False, "deliveryStatus": "bounce"})


def disable_for_complaint(uid: str) -> dict:
    """Auto-disable sends after a complaint (spam mark) webhook. Idempotent."""
    return set_loop_alert_email(uid, {"enabled": False, "deliveryStatus": "complaint"})


# ── internals ────────────────────────────────────────────────────────────────


def _merge_prefs(base: dict, patch: dict) -> dict:
    """Shallow merge with a one-level deep merge for `quietHours`."""
    out = dict(base or {})
    for key, value in (patch or {}).items():
        if key == "quietHours" and isinstance(value, dict):
            out["quietHours"] = {**(base.get("quietHours") or {}), **value}
        else:
            out[key] = value
    return out


def _validate_prefs(prefs: dict) -> None:
    if "enabled" in prefs and not isinstance(prefs["enabled"], bool):
        raise ValueError("enabled must be a bool")
    if "mode" in prefs and prefs["mode"] not in VALID_MODES:
        raise ValueError(f"mode must be one of {sorted(VALID_MODES)}")
    if "timezone" in prefs:
        tz = prefs["timezone"]
        if not isinstance(tz, str) or not tz.strip():
            raise ValueError("timezone must be a non-empty string")
    if "deliveryStatus" in prefs and prefs["deliveryStatus"] not in VALID_DELIVERY_STATUS:
        raise ValueError(
            f"deliveryStatus must be one of {sorted(VALID_DELIVERY_STATUS)}"
        )
    if "quietHours" in prefs:
        qh = prefs["quietHours"]
        if not isinstance(qh, dict):
            raise ValueError("quietHours must be a dict")
        for field in ("start", "end"):
            if field in qh:
                val = qh[field]
                if not isinstance(val, int) or isinstance(val, bool):
                    raise ValueError(f"quietHours.{field} must be an int")
                if val < 0 or val > 23:
                    raise ValueError(f"quietHours.{field} must be in [0, 23]")
