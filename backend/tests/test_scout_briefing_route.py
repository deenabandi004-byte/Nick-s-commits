"""Smoke tests for POST /api/scout-assistant/briefing/stream (Phase 3B).

The route is glue between:
  - build_strategist_prompt  (test_scout_strategist_prompt.py: 25 tests)
  - compute_coverage         (test_scout_profile_coverage.py: 15 tests)
  - _sse_stream_from_queue   (test_scout_sse_heartbeat.py: 4 tests)
  - create_async_openai_client (existing factory)

Full integration of the streaming Flask test client + Firebase auth + the
rate-limiter middleware that calls get_db() ahead of the route requires
either real Firebase credentials or a much more invasive patch tree than is
worth the coverage gain for a thin gluing endpoint. These smoke tests pin
the contract surface (route registration + OPTIONS preflight) that catches
the most likely regression mode: a typo or import error preventing the
endpoint from registering at all. End-to-end behavior is verified via
local dogfood against a real OpenAI key.
"""
from __future__ import annotations

import pytest


def test_briefing_route_module_imports_cleanly():
    """A typo or bad import in the route handler would break the whole
    scout_assistant blueprint, taking the chat endpoint down with it. Pin
    that the route module loads without error."""
    from app.routes import scout_assistant
    assert hasattr(scout_assistant, "scout_assistant_briefing_stream")


def test_briefing_route_constants_have_sensible_values():
    """If someone accidentally bumps the timeout to 0 or the temperature out
    of range during a refactor, this catches it before deploy."""
    from app.routes.scout_assistant import (
        _BRIEFING_GENERATE_TIMEOUT_S,
        _BRIEFING_MAX_OUTPUT_TOKENS,
        _BRIEFING_MODEL,
        _BRIEFING_TEMPERATURE,
    )
    assert _BRIEFING_MODEL == "gpt-4.1-mini"
    assert 0.0 <= _BRIEFING_TEMPERATURE <= 1.5
    assert _BRIEFING_MAX_OUTPUT_TOKENS >= 500
    assert _BRIEFING_GENERATE_TIMEOUT_S >= 30


def test_briefing_route_is_registered_on_blueprint():
    """The Flask blueprint must expose the briefing endpoint under the
    expected URL. Run a registration check by inspecting the blueprint's
    rule table after import."""
    from app.routes.scout_assistant import scout_assistant_bp

    # Flask blueprints register deferred-callbacks rather than rules until
    # they're bound to an app. Inspect the deferred functions list — each
    # @bp.route call leaves a discoverable rule signature.
    handler_names = [
        fn.__qualname__
        for fn in getattr(scout_assistant_bp, "deferred_functions", [])
        if hasattr(fn, "__qualname__")
    ]
    # The deferred callbacks are partials/closures from add_url_rule; we
    # cross-check via the registered view-function names which Flask exposes
    # via blueprint._got_registered_once-keyed dicts. Easier: build a tiny
    # Flask app, register the blueprint, and read the URL map.
    from flask import Flask
    app = Flask(__name__)
    app.register_blueprint(scout_assistant_bp)
    rules = {str(r) for r in app.url_map.iter_rules()}
    assert "/api/scout-assistant/briefing/stream" in rules


def test_options_preflight_responds_200_without_auth():
    """CORS preflight on the briefing endpoint must not require auth and
    must not hit any downstream services - just an empty 200."""
    from flask import Flask
    from app.routes.scout_assistant import scout_assistant_bp

    app = Flask(__name__)
    app.register_blueprint(scout_assistant_bp)
    client = app.test_client()
    resp = client.options("/api/scout-assistant/briefing/stream")
    # The route itself short-circuits OPTIONS to a 200 before the auth
    # decorator's main path; even without Firebase set up, this must succeed.
    assert resp.status_code in (200, 204)


def test_briefing_route_does_not_collide_with_chat_stream():
    """Easy refactor mistake: someone moves /chat/stream above /briefing/
    stream and breaks routing. Pin both register under distinct URLs."""
    from flask import Flask
    from app.routes.scout_assistant import scout_assistant_bp

    app = Flask(__name__)
    app.register_blueprint(scout_assistant_bp)
    rules = {str(r) for r in app.url_map.iter_rules()}
    assert "/api/scout-assistant/briefing/stream" in rules
    assert "/api/scout-assistant/chat/stream" in rules
