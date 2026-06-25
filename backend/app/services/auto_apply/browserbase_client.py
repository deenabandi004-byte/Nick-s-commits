"""
Browserbase session lifecycle for the auto-apply form-fillers.

Replaces the legacy Browserless connect path. Browserbase requires creating
a session via REST before connecting Playwright over CDP — different shape
from Browserless's "WebSocket URL with token in query string." This module
abstracts both halves: create_session() returns the (session_id, connect_url)
tuple the filler uses, release_session() shuts it down to stop the per-second
billing clock.

Why Browserbase over Browserless: their `browserSettings.stealth` defeats
the headless-Chrome fingerprint signals reCAPTCHA scores against, and
`browserSettings.solveCaptchas` auto-solves reCAPTCHA / hCaptcha during the
session without our code intervening. Together those two unlock submit-time
silent-pass on the majority of Greenhouse tenants; per-tenant email-code
gates are handled separately in the filler (gmail_client lookup + 8-input
fill).

Env:
  BROWSERBASE_API_KEY     required
  BROWSERBASE_PROJECT_ID  required
"""
from __future__ import annotations

import logging
from typing import Optional, Tuple

import requests


logger = logging.getLogger(__name__)

_API_BASE = "https://api.browserbase.com"
_DEFAULT_TIMEOUT = 30


class BrowserbaseError(Exception):
    """Raised when Browserbase session create / release fails."""


def _config() -> Tuple[str, str]:
    from app.config import BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID
    if not BROWSERBASE_API_KEY:
        raise BrowserbaseError("BROWSERBASE_API_KEY not set")
    if not BROWSERBASE_PROJECT_ID:
        raise BrowserbaseError("BROWSERBASE_PROJECT_ID not set")
    return BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID


def create_session(
    *,
    stealth: bool = True,
    solve_captchas: bool = True,
) -> Tuple[str, str]:
    """POST /v1/sessions and return (session_id, connect_url).

    The connect_url is a WebSocket URL the filler passes to
    `playwright.chromium.connect_over_cdp(connect_url)`. It already carries
    a short-lived signing key — no further auth required for the connect.

    stealth=True activates Browserbase's advanced fingerprint spoofing
    (the missing piece our Browserless+playwright-stealth attempts didn't
    cover). solve_captchas=True is on-by-default per the docs but we set
    it explicitly so future Browserbase default flips don't silently break
    our submit rate.
    """
    api_key, project_id = _config()
    payload = {
        "projectId": project_id,
        "browserSettings": {
            "stealth": stealth,
            "solveCaptchas": solve_captchas,
        },
    }
    try:
        resp = requests.post(
            f"{_API_BASE}/v1/sessions",
            json=payload,
            headers={"X-BB-API-Key": api_key, "Content-Type": "application/json"},
            timeout=_DEFAULT_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise BrowserbaseError(f"browserbase session create transport error: {exc}") from exc

    if resp.status_code >= 400:
        raise BrowserbaseError(
            f"browserbase session create returned {resp.status_code}: {resp.text[:300]}"
        )

    try:
        data = resp.json()
    except ValueError as exc:
        raise BrowserbaseError(f"browserbase session create returned non-JSON: {resp.text[:200]}") from exc

    session_id = data.get("id")
    connect_url = data.get("connectUrl") or data.get("connect_url")
    if not session_id or not connect_url:
        raise BrowserbaseError(f"browserbase response missing id/connectUrl: keys={list(data.keys())}")
    return session_id, connect_url


def release_session(session_id: str) -> None:
    """Tell Browserbase we're done with the session.

    Used in the filler's finally block. Best-effort; we swallow errors
    so a release failure can't mask the real result from the filler.
    Browserbase charges per-second the session is open, so leaving an
    orphan session would burn unit budget until their plan-side max
    timeout fires (still bounded, just wasteful).
    """
    if not session_id:
        return
    try:
        api_key, _ = _config()
    except BrowserbaseError:
        return
    try:
        requests.post(
            f"{_API_BASE}/v1/sessions/{session_id}",
            json={"status": "REQUEST_RELEASE"},
            headers={"X-BB-API-Key": api_key, "Content-Type": "application/json"},
            timeout=10,
        )
    except Exception as exc:
        logger.warning("browserbase release_session %s failed: %s", session_id, exc)


def get_live_view_url(session_id: str) -> Optional[str]:
    """GET /v1/sessions/{id}/debug → return the human-shareable live view URL.

    Used when the filler hands off to user takeover (e.g. user has no
    Gmail connected and we can't auto-fetch the verification code, so we
    surface an embeddable iframe URL instead of asking the user to
    re-fill the form from scratch).

    Returns None if the call fails — caller falls back to the legacy
    apply-URL handoff.
    """
    if not session_id:
        return None
    try:
        api_key, _ = _config()
    except BrowserbaseError:
        return None
    try:
        resp = requests.get(
            f"{_API_BASE}/v1/sessions/{session_id}/debug",
            headers={"X-BB-API-Key": api_key},
            timeout=10,
        )
        if resp.status_code >= 400:
            return None
        data = resp.json()
        pages = data.get("pages") or []
        if pages:
            first = pages[0]
            return first.get("liveViewUrl") or first.get("debuggerUrl")
    except Exception as exc:
        logger.warning("browserbase get_live_view_url %s failed: %s", session_id, exc)
    return None
