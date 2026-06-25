"""
Thin wrapper around Browserless.io. Kept deliberately small so we can swap to
a self-hosted Playwright worker (or a different vendor) by reimplementing this
file without touching the form-fillers.

Browserless exposes a /function endpoint that runs an arbitrary user-supplied
JS function inside a real Chromium with a real Playwright page handle. We
ship the per-ATS Playwright script as a string and POST it here.

Env:
  BROWSERLESS_API_KEY  required
  BROWSERLESS_URL      defaults to https://production-sfo.browserless.io
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

import requests


logger = logging.getLogger(__name__)

_DEFAULT_URL = "https://production-sfo.browserless.io"
_TIMEOUT_SECONDS = 180


class BrowserlessError(Exception):
    """Raised when Browserless returns a non-2xx or the script crashes."""


def _config() -> Dict[str, str]:
    token = os.getenv("BROWSERLESS_API_KEY")
    if not token:
        raise BrowserlessError("BROWSERLESS_API_KEY not set")
    return {
        "token": token,
        "url": os.getenv("BROWSERLESS_URL", _DEFAULT_URL).rstrip("/"),
    }


def run_function(script: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a user-supplied JS function on Browserless.

    `script` must be a JS function body that receives `{ page, context }` and
    returns a JSON-serializable object. `context` is passed through verbatim
    and is the right place for ATS-specific inputs (URL, profile, answers,
    resume URL).
    """
    cfg = _config()
    endpoint = f"{cfg['url']}/function?token={cfg['token']}"
    payload = {"code": script, "context": context}

    try:
        resp = requests.post(
            endpoint,
            json=payload,
            timeout=_TIMEOUT_SECONDS,
            headers={"Content-Type": "application/json"},
        )
    except requests.RequestException as exc:
        logger.exception("browserless request failed")
        raise BrowserlessError(f"browserless transport error: {exc}") from exc

    if resp.status_code >= 400:
        logger.error(
            "browserless non-2xx status=%s body=%s",
            resp.status_code,
            resp.text[:500],
        )
        raise BrowserlessError(
            f"browserless returned {resp.status_code}: {resp.text[:200]}"
        )

    try:
        return resp.json()
    except json.JSONDecodeError as exc:
        raise BrowserlessError(
            f"browserless returned non-JSON: {resp.text[:200]}"
        ) from exc
