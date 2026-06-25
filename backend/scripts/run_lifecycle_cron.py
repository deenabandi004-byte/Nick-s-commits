"""
Hourly cron entry — hits /api/lifecycle/tick on the Render service.

Render cron configuration (set in dashboard):
  Schedule:  0 * * * *           (top of every hour)
  Command:   python backend/scripts/run_lifecycle_cron.py

The script just makes an authenticated HTTP request — it doesn't run the
campaign logic locally, so we don't need to import Firebase/Flask in this
process and don't fight worker pool / connection limits.

Required env:
  LIFECYCLE_CRON_SECRET — shared secret between cron and Flask route
  LIFECYCLE_TICK_URL    — full URL to the tick endpoint (defaults to
                          https://offerloop.ai/api/lifecycle/tick)
"""
import json
import os
import sys
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError


def main():
    secret = os.getenv('LIFECYCLE_CRON_SECRET', '')
    if not secret:
        print("ERROR: LIFECYCLE_CRON_SECRET is not set. Cron cannot authenticate.")
        sys.exit(1)

    url = os.getenv('LIFECYCLE_TICK_URL', 'https://offerloop.ai/api/lifecycle/tick')
    req = urlrequest.Request(
        url,
        method='POST',
        headers={'X-Cron-Secret': secret, 'Content-Type': 'application/json'},
        data=b'{}',
    )

    try:
        with urlrequest.urlopen(req, timeout=90) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            print(f"[lifecycle-cron] {resp.status} — {body[:500]}")
            sys.exit(0 if 200 <= resp.status < 300 else 1)
    except HTTPError as e:
        print(f"[lifecycle-cron] HTTP {e.code} — {e.reason}")
        try:
            print(e.read().decode('utf-8', errors='replace')[:500])
        except Exception:
            pass
        sys.exit(1)
    except URLError as e:
        print(f"[lifecycle-cron] URL error: {e.reason}")
        sys.exit(1)


if __name__ == '__main__':
    main()
