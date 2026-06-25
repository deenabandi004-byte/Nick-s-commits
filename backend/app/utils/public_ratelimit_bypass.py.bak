"""Local-dogfooding kill switch for public lead-magnet rate limits.

Set the env var `OFFERLOOP_PUBLIC_BYPASS_RATELIMITS=1` before starting the
backend to disable the per-IP rate limits on ALL eight public-tool routes
(/tools/cover-letter, /tools/interview-prep, /tools/find-hiring-manager,
/tools/meeting-prep, /tools/resume-review, /tools/find-jobs,
/tools/find-people, /tools/find-companies).

When enabled:
    * /search-style endpoints no longer 429 on per-IP 24h caps
    * /capture-email no longer 429s on per-IP hourly caps
    * the concurrent-search lock is bypassed
    * global cost-budget guards (e.g. find_companies) are NOT bypassed —
      those exist to protect us from runaway third-party API spend and
      should stay on

A WARNING-level log line fires exactly once per process the first time the
bypass is consulted, so it shows up loudly in dev logs and you don't
accidentally leave it on in a deployed environment.

NEVER set this env var in production. The default state (unset / "0" /
"false") preserves the original rate-limit behavior.
"""

from __future__ import annotations

import logging
import os
import threading

_logger = logging.getLogger(__name__)
_warn_lock = threading.Lock()
_warned = False

_TRUTHY = {"1", "true", "yes", "on"}


def public_ratelimits_disabled() -> bool:
    """Return True if the bypass env var is set to a truthy value.

    Safe to call on every request — the check is just an env-var read and
    a memoization-protected log statement.
    """
    raw = os.environ.get("OFFERLOOP_PUBLIC_BYPASS_RATELIMITS", "")
    if not isinstance(raw, str):
        return False
    on = raw.strip().lower() in _TRUTHY
    if on:
        global _warned
        with _warn_lock:
            if not _warned:
                _logger.warning(
                    "OFFERLOOP_PUBLIC_BYPASS_RATELIMITS is ENABLED — per-IP "
                    "rate limits on /api/tools/* are disabled. Do not run "
                    "this in production."
                )
                _warned = True
    return on
