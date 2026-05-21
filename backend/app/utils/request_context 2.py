"""
Request context middleware - attaches request_id and session_id to Flask g.

request_id: UUID generated per request (server-side).
session_id: read from X-Session-Id header (client-generated, rotated per browser session).

Both are available via flask.g for downstream logging and event attribution.
"""
import uuid
from flask import g, request


def init_request_context(app):
    """Register before/after request hooks on the Flask app."""

    @app.before_request
    def _set_request_context():
        g.request_id = str(uuid.uuid4())
        g.session_id = request.headers.get("X-Session-Id", "")

    @app.after_request
    def _expose_request_id(response):
        response.headers["X-Request-Id"] = getattr(g, "request_id", "")
        return response
