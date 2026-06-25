"""
Server-side PostHog client.

Shares the same project as the frontend (VITE_PUBLIC_POSTHOG_KEY is a project
capture key — the phc_ prefix means it's safe to use from both client and server).

Usage:
    from app.utils.posthog_client import track_event
    track_event(uid, 'feature_gated', {'feature': 'firm_search', 'required_tier': 'pro'})

For attribution/billing events, pass sync=True to flush before the request returns.
This matches the project rule: funnel/attribution writes are synchronous before
responding, never fire-and-forget.
"""

import os
import threading
from typing import Optional

_client = None
_lock = threading.Lock()


def _get_client():
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is not None:
            return _client
        api_key = os.environ.get('VITE_PUBLIC_POSTHOG_KEY')
        host = os.environ.get('VITE_PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com')
        if not api_key:
            print('[posthog] VITE_PUBLIC_POSTHOG_KEY not set — server-side events disabled')
            return None
        try:
            from posthog import Posthog
            _client = Posthog(project_api_key=api_key, host=host)
        except Exception as e:
            print(f'[posthog] init failed: {e}')
            return None
    return _client


def track_event(
    uid: Optional[str],
    event: str,
    properties: Optional[dict] = None,
    sync: bool = False,
) -> None:
    """
    Fire a PostHog event server-side.

    uid: Firebase UID (or None for anonymous server events — uses 'server' as the distinct_id).
    event: event name (snake_case).
    properties: event properties dict.
    sync: when True, flushes immediately before returning. Use for billing /
          tier-change / attribution events where durability matters more than
          latency. Default False (fire-and-forget, matches metrics_events).
    """
    client = _get_client()
    if client is None:
        return
    try:
        distinct_id = uid or 'server'
        client.capture(distinct_id=distinct_id, event=event, properties=properties or {})
        if sync:
            client.flush()
    except Exception as e:
        # Telemetry must never break the request path.
        print(f'[posthog] capture failed for {event}: {e}')
