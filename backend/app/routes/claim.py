"""
/claim?token=xyz — attribution-tagged signup landing.

The MCP server hands out claim URLs in its over-cap CTA. When a user
follows one, we:
  1. Verify the HMAC token (mints the original tool + ip_hash + issued_at)
  2. Set a short-lived cookie so the post-signup webhook can attribute
     the new account to a specific MCP tool call
  3. Redirect to /signup?from=mcp&tool=<name>

The cookie is read by frontend signup analytics and by the backend
billing webhook to flag MCP-origin conversions in the funnel dataset
(mcp_events/).
"""
from __future__ import annotations

import logging

from flask import Blueprint, make_response, redirect, request

from app.mcp_server.attribution import verify_claim_token

logger = logging.getLogger(__name__)

claim_bp = Blueprint("claim", __name__)


_COOKIE_NAME = "ol_mcp_attribution"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


@claim_bp.route("/claim", methods=["GET"])
def claim():
    token = request.args.get("token", "") or ""
    parsed = verify_claim_token(token)

    if not parsed:
        # Bad / expired token: send to signup anyway so the user still
        # converts, just without attribution.
        return redirect("/signup?from=mcp", code=302)

    tool = parsed.get("tool") or "unknown"
    response = make_response(redirect(f"/signup?from=mcp&tool={tool}", code=302))

    # Set the attribution cookie. SameSite=Lax so the post-signup
    # webhook can read it on first-party Stripe / backend POSTs.
    response.set_cookie(
        _COOKIE_NAME,
        token,
        max_age=_COOKIE_MAX_AGE,
        secure=True,
        httponly=True,
        samesite="Lax",
        path="/",
    )
    return response
