"""
Flask integration for the MCP server.

Mounts:
  - POST /mcp           Streamable HTTP (stateless): one JSON-RPC request per POST
  - GET  /mcp           Returns 405 for now (no SSE in stateless v1)
  - GET  /api/mcp/health Ops endpoint for budget + cap visibility

Bypasses Flask-Limiter by setting the route exempt list inside
extensions.get_rate_limit_key (separate edit). MCP enforces its own
per-IP rate limits via MCPRateLimit.
"""
from __future__ import annotations

import logging
import os

import firebase_admin
from flask import Blueprint, current_app, jsonify, request

from app.extensions import get_db
from app.mcp_server.budget import MCPBudget
from app.mcp_server.ip_utils import extract_client_ip, hash_ip
from app.mcp_server.oauth.tokens import resource_url, verify_access_token
from app.mcp_server.rate_limit import LIMITS
from app.mcp_server.server import handle_jsonrpc

logger = logging.getLogger(__name__)


_PROD_PROJECT_ID = "offerloop-native"


def _enforce_prod_firestore_guard() -> None:
    """Refuse to mount MCP against the prod Firestore project from a non-prod env.

    Offerloop has no separate dev Firebase project; FIREBASE_PROJECT_ID is
    hardcoded to offerloop-native in extensions.init_firebase. The MCP server
    writes mcp_budget / mcp_cache / mcp_rate_limits / mcp_events docs, and we
    do not want a developer laptop polluting prod attribution data or
    decrementing the daily PDL budget for real users. This raises so the
    whole app refuses to boot in that combination, surfacing the intent
    explicitly rather than silently writing to prod.

    Set MCP_LOCAL_DEV_OK=1 to bypass the guard when intentionally dogfooding
    locally against prod data. The bypass logs a warning so it is visible in
    startup logs; the guard still fires by default so a teammate's laptop
    without that env var trips the refusal.
    """
    if os.getenv("MCP_LOCAL_DEV_OK") == "1":
        logger.warning(
            "[MCP] Bypassing prod-firestore guard via MCP_LOCAL_DEV_OK=1. "
            "MCP routes will write to prod Firestore from this process."
        )
        return
    try:
        project_id = firebase_admin.get_app().project_id
    except Exception:
        project_id = None
    if project_id == _PROD_PROJECT_ID and os.getenv("FLASK_ENV") != "production":
        raise RuntimeError(
            "Refusing to mount MCP server: active Firebase project is "
            f"'{_PROD_PROJECT_ID}' (prod) but FLASK_ENV is "
            f"'{os.getenv('FLASK_ENV')}'. Set FLASK_ENV=production, "
            "set MCP_LOCAL_DEV_OK=1 to bypass, switch to a separate dev "
            "Firebase project, or remove the MCP mount for local dev."
        )


def register_mcp_blueprint(app):
    _enforce_prod_firestore_guard()

    # OAuth AS + RS metadata blueprint. Registered first so well-known routes
    # are established before the /mcp endpoint that refers to them via
    # WWW-Authenticate.
    from app.mcp_server.oauth.blueprint import register_oauth_blueprint
    register_oauth_blueprint(app)

    bp = Blueprint("mcp", __name__)

    @bp.route("/mcp", methods=["POST"])
    def mcp_endpoint():
        return _handle_mcp_post()

    @bp.route("/mcp", methods=["GET"])
    def mcp_get():
        return jsonify({
            "error": "MCP streaming GET not supported in stateless v1. Use POST.",
        }), 405

    @bp.route("/api/mcp/health", methods=["GET"])
    def mcp_health():
        try:
            db = get_db()
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 503
        budget = MCPBudget(db)
        return jsonify({
            "status": "ok",
            "budget": budget.status(),
            "limits": {f"{tool}_{window}": cap for (tool, window), cap in LIMITS.items()},
        })

    app.register_blueprint(bp)
    logger.info("[MCP] Mounted /mcp and /api/mcp/health")


def _handle_mcp_post():
    # Parse JSON body. We deliberately allow loose Content-Type so
    # cURL one-liners work without --data + Content-Type rewrites.
    try:
        body = request.get_json(force=True, silent=False)
    except Exception as e:
        return jsonify({
            "jsonrpc": "2.0", "id": None,
            "error": {"code": -32700, "message": f"Parse error: {e}"},
        }), 400

    if body is None:
        return jsonify({
            "jsonrpc": "2.0", "id": None,
            "error": {"code": -32700, "message": "Parse error: empty body"},
        }), 400

    # Bearer-token path (authenticated MCP). We 401 with WWW-Authenticate on
    # both missing AND invalid bearers — RFC 9728 §5.3 + the MCP authorization
    # spec require the 401 challenge for clients to discover the AS. Returning
    # 200 to unauthenticated requests means Claude.ai's connector + Smithery's
    # scanner never escalate to OAuth, so the user never sees a Sign In prompt
    # and every tool call hits the anonymous path with no user context.
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _unauthorized(
            "missing_token",
            "Authorization required. Discover OAuth via WWW-Authenticate.",
        )

    token = auth_header.split(" ", 1)[1].strip()
    claims = verify_access_token(token)
    if claims is None:
        return _unauthorized("invalid_token", "Access token invalid or expired")
    user_ctx = {
        "uid": claims.get("sub"),
        "tier": claims.get("tier") or "free",
        "scope": claims.get("scope") or "",
    }

    # Anonymous, IP-based identity (always computed; even authed calls log it
    # for rate-limit attribution + abuse detection).
    client_ip = extract_client_ip(request)
    ip_hash_val = hash_ip(client_ip)

    try:
        db = get_db()
    except Exception as e:
        logger.warning("[MCP] get_db failed, continuing with db=None: %s", e)
        db = None

    # Dispatch. handle_jsonrpc never raises; it returns either a
    # success-shaped or error-shaped JSON-RPC envelope.
    response = handle_jsonrpc(body, ip_hash=ip_hash_val, db=db, user_ctx=user_ctx)
    return jsonify(response)


def _unauthorized(error: str, description: str):
    """401 with RFC 9728 / RFC 6750 WWW-Authenticate pointing at the PRM URL."""
    prm_base = (os.getenv("MCP_PRM_BASE_URL") or "https://offerloop.ai").rstrip("/")
    prm_url = f"{prm_base}/.well-known/oauth-protected-resource"
    challenge = (
        f'Bearer resource_metadata="{prm_url}", '
        f'error="{error}", error_description="{description}"'
    )
    resp = jsonify({
        "jsonrpc": "2.0", "id": None,
        "error": {"code": -32001, "message": description},
    })
    resp.status_code = 401
    resp.headers["WWW-Authenticate"] = challenge
    return resp
