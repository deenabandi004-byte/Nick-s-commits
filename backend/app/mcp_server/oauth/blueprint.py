"""
Flask blueprint for the MCP OAuth 2.1 authorization server.

Endpoints:
  GET  /.well-known/oauth-authorization-server  RFC 8414 metadata
  GET  /.well-known/oauth-protected-resource    RFC 9728 metadata (RS side)
  GET  /oauth/jwks.json                         AS public keys
  POST /oauth/register                          RFC 7591 DCR
  GET  /oauth/authorize                         consent screen entry point
  POST /oauth/grant                             consent confirmation → auth code
  POST /oauth/token                             code or refresh → access token

Flow (happy path):
  1. Client GET /.well-known/oauth-protected-resource → sees AS at /oauth.
  2. Client GET /.well-known/oauth-authorization-server → sees endpoints.
  3. Client POST /oauth/register → gets a client_id.
  4. Client opens browser to /oauth/authorize?... with PKCE challenge.
  5. We store params server-side, render consent HTML at the same URL.
  6. User signs into Firebase (if needed), clicks Allow.
  7. Page POSTs Firebase ID token + txn to /oauth/grant.
  8. /oauth/grant verifies Firebase token, mints code, 200s a redirect URL.
  9. Browser follows redirect back to client with ?code=&state=.
 10. Client POST /oauth/token with code + PKCE verifier → access + refresh JWTs.
 11. Client uses access JWT as Bearer on /mcp.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Optional
from urllib.parse import urlencode, urlparse

import firebase_admin
from firebase_admin import auth as fb_auth
from flask import Blueprint, jsonify, redirect, request

from app.extensions import get_db
from app.mcp_server.oauth import metadata, storage
from app.mcp_server.oauth.tokens import (
    DEFAULT_SCOPE,
    issuer_url,
    mint_access_token,
    mint_refresh_token,
    resource_url,
    verify_refresh_token,
)

logger = logging.getLogger(__name__)


_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "[::1]"}


def _is_loopback_redirect(uri: str) -> bool:
    """OAuth 2.1 §1.5: loopback redirects are http:// with any port."""
    try:
        p = urlparse(uri)
    except Exception:
        return False
    return p.scheme == "http" and (p.hostname or "").lower() in _LOOPBACK_HOSTS


def _redirect_uri_registered(client: dict, uri: str) -> bool:
    """Match against client's registered redirect_uris.

    Loopback URIs match if any registered URI is loopback with the same host
    (port may differ per OAuth 2.1 §1.5). Non-loopback URIs must match exactly.
    """
    if not uri:
        return False
    registered = client.get("redirect_uris") or []
    if uri in registered:
        return True
    if _is_loopback_redirect(uri):
        my_host = (urlparse(uri).hostname or "").lower()
        for r in registered:
            if _is_loopback_redirect(r) and (urlparse(r).hostname or "").lower() == my_host:
                return True
    return False


def _resolve_user_tier(uid: str) -> str:
    """Read subscriptionTier from Firestore. Mirrors extensions.require_tier."""
    try:
        db = get_db()
        doc = db.collection("users").document(uid).get()
        if not doc.exists:
            return "free"
        data = doc.to_dict() or {}
        return data.get("subscriptionTier") or data.get("tier") or "free"
    except Exception as e:
        logger.warning("[MCP OAuth] tier lookup failed for %s: %s", uid, e)
        return "free"


def _verify_pkce_s256(verifier: str, challenge: str) -> bool:
    if not verifier or not challenge:
        return False
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    computed = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return computed == challenge


def _cors(resp):
    """Add permissive CORS headers. Well-known + token endpoints are called
    cross-origin by browser-based MCP clients during discovery."""
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


def _err(error: str, description: str, status: int = 400):
    """OAuth error response per RFC 6749 §5.2."""
    return _cors(jsonify({"error": error, "error_description": description})), status


def register_oauth_blueprint(app):
    bp = Blueprint("mcp_oauth", __name__)

    # ── Discovery metadata ────────────────────────────────────────────────

    @bp.route("/.well-known/oauth-authorization-server", methods=["GET", "OPTIONS"])
    @bp.route("/.well-known/oauth-authorization-server/<path:_suffix>", methods=["GET", "OPTIONS"])
    def well_known_as(_suffix: str = ""):
        # RFC 8414 §3.1: when the issuer has a path component (ours is
        # https://www.offerloop.ai/oauth), the AS metadata location is
        # /.well-known/oauth-authorization-server/<issuer-path>. Claude.ai's
        # connector + Smithery's scanner hit the path-aware variant first and
        # only fall back to the bare path if that 404s. Without this route,
        # the path-aware variant hit the SPA index.html fallback, Claude.ai
        # parsed HTML as JSON, and DCR silently broke. Accept any suffix and
        # serve the same metadata — the issuer URL inside the JSON is the
        # canonical identifier; the request path is just discovery routing.
        if request.method == "OPTIONS":
            return _cors(jsonify({})), 204
        return _cors(jsonify(metadata.authorization_server_metadata()))

    # OpenID Connect Discovery fallback. Pure-OAuth clients shouldn't hit
    # this path, but Claude.ai's connector falls back to OIDC discovery
    # URLs when the RFC 8414 path returns a 404 or non-JSON. Serve the
    # same OAuth metadata at the OIDC paths to short-circuit that fallback.
    # An OIDC-strict client would reject this for missing OIDC-specific
    # fields (subject_types_supported, id_token_signing_alg_values_supported);
    # the MCP clients in the wild are permissive.
    @bp.route("/.well-known/openid-configuration", methods=["GET", "OPTIONS"])
    @bp.route("/.well-known/openid-configuration/<path:_suffix>", methods=["GET", "OPTIONS"])
    @bp.route("/oauth/.well-known/openid-configuration", methods=["GET", "OPTIONS"])
    def well_known_oidc(_suffix: str = ""):
        if request.method == "OPTIONS":
            return _cors(jsonify({})), 204
        return _cors(jsonify(metadata.authorization_server_metadata()))

    @bp.route("/.well-known/oauth-protected-resource", methods=["GET", "OPTIONS"])
    @bp.route("/.well-known/oauth-protected-resource/<path:_suffix>", methods=["GET", "OPTIONS"])
    def well_known_prm(_suffix: str = ""):
        # RFC 9728 §3.1: PRM URL inserts /.well-known/oauth-protected-resource
        # between host and path. Resource = https://www.offerloop.ai/mcp, so
        # the spec-compliant PRM URL is /.well-known/oauth-protected-resource/mcp.
        # Claude.ai today hits the bare path and it works, but accept the
        # path-aware variant too so spec-strict clients don't trip.
        if request.method == "OPTIONS":
            return _cors(jsonify({})), 204
        return _cors(jsonify(metadata.protected_resource_metadata()))

    @bp.route("/oauth/jwks.json", methods=["GET", "OPTIONS"])
    def jwks():
        if request.method == "OPTIONS":
            return _cors(jsonify({})), 204
        return _cors(jsonify(metadata.jwks_document()))

    # ── Dynamic Client Registration (RFC 7591) ────────────────────────────

    @bp.route("/oauth/register", methods=["POST", "OPTIONS"])
    def register():
        if request.method == "OPTIONS":
            return _cors(jsonify({})), 204
        try:
            body = request.get_json(force=True, silent=False) or {}
        except Exception as e:
            return _err("invalid_client_metadata", f"Body not JSON: {e}")

        redirect_uris = body.get("redirect_uris") or []
        if not isinstance(redirect_uris, list) or not redirect_uris:
            return _err("invalid_redirect_uri", "redirect_uris must be a non-empty list")
        for uri in redirect_uris:
            if not isinstance(uri, str):
                return _err("invalid_redirect_uri", "redirect_uris must be strings")
            p = urlparse(uri)
            if p.scheme == "https":
                continue
            if _is_loopback_redirect(uri):
                continue
            return _err(
                "invalid_redirect_uri",
                "redirect_uris must be https or http loopback",
            )

        record = storage.register_client(body)
        return _cors(jsonify(record)), 201

    # ── Authorization endpoint ────────────────────────────────────────────

    @bp.route("/oauth/authorize", methods=["GET"])
    def authorize():
        params = request.args
        client_id = params.get("client_id") or ""
        redirect_uri = params.get("redirect_uri") or ""
        response_type = params.get("response_type") or ""
        scope = params.get("scope") or DEFAULT_SCOPE
        state = params.get("state") or ""
        code_challenge = params.get("code_challenge") or ""
        code_challenge_method = params.get("code_challenge_method") or ""
        resource = params.get("resource") or ""

        client = storage.get_client(client_id)
        if client is None:
            return _err("invalid_client", f"Unknown client_id: {client_id}", 400)
        if not _redirect_uri_registered(client, redirect_uri):
            return _err("invalid_redirect_uri", "redirect_uri not registered for client", 400)

        # From here on, errors redirect back to the client per RFC 6749 §4.1.2.1.
        if response_type != "code":
            return _redirect_with_error(redirect_uri, "unsupported_response_type", state)
        if code_challenge_method != "S256":
            return _redirect_with_error(redirect_uri, "invalid_request", state,
                                        desc="code_challenge_method must be S256")
        if not code_challenge:
            return _redirect_with_error(redirect_uri, "invalid_request", state,
                                        desc="code_challenge required (PKCE S256)")
        if not resource:
            return _redirect_with_error(redirect_uri, "invalid_target", state,
                                        desc="resource parameter required (RFC 8707)")
        if resource.rstrip("/") != resource_url():
            return _redirect_with_error(redirect_uri, "invalid_target", state,
                                        desc=f"resource must equal {resource_url()}")

        txn = storage.store_pending_authz({
            "client_id": client_id,
            "client_name": client.get("client_name") or "An MCP client",
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": code_challenge_method,
            "resource": resource,
        })
        return _render_consent_page(txn, client.get("client_name") or "An MCP client")

    # ── Grant endpoint (consent confirmation) ─────────────────────────────

    @bp.route("/oauth/grant", methods=["POST", "OPTIONS"])
    def grant():
        if request.method == "OPTIONS":
            return _cors(jsonify({})), 204
        try:
            body = request.get_json(force=True, silent=False) or {}
        except Exception as e:
            return _err("invalid_request", f"Body not JSON: {e}")

        txn = body.get("txn") or ""
        firebase_id_token = body.get("firebase_id_token") or ""
        decision = body.get("decision") or "deny"

        rec = storage.get_pending_authz(txn)
        if rec is None:
            return _err("invalid_request", "Unknown or expired txn")

        if decision != "allow":
            storage.consume_pending_authz(txn)
            redirect_url = _build_error_redirect(
                rec["redirect_uri"], "access_denied", rec.get("state") or "",
            )
            return _cors(jsonify({"redirect_url": redirect_url}))

        if not firebase_admin._apps:
            return _err("server_error", "Firebase not initialized", 500)

        try:
            decoded = fb_auth.verify_id_token(firebase_id_token, clock_skew_seconds=5)
        except Exception as e:
            logger.warning("[MCP OAuth] Firebase ID token verification failed: %s", e)
            return _err("invalid_grant", "Firebase ID token invalid or expired", 401)

        uid = decoded.get("uid") or decoded.get("user_id")
        if not uid:
            return _err("invalid_grant", "Firebase token missing uid", 401)

        storage.consume_pending_authz(txn)
        code = storage.issue_auth_code(
            client_id=rec["client_id"],
            redirect_uri=rec["redirect_uri"],
            uid=uid,
            scope=rec["scope"],
            code_challenge=rec["code_challenge"],
            code_challenge_method=rec["code_challenge_method"],
            resource=rec["resource"],
        )

        qs = {"code": code}
        if rec.get("state"):
            qs["state"] = rec["state"]
        sep = "&" if "?" in rec["redirect_uri"] else "?"
        redirect_url = f"{rec['redirect_uri']}{sep}{urlencode(qs)}"
        return _cors(jsonify({"redirect_url": redirect_url}))

    # ── Token endpoint ────────────────────────────────────────────────────

    @bp.route("/oauth/token", methods=["POST", "OPTIONS"])
    def token():
        if request.method == "OPTIONS":
            return _cors(jsonify({})), 204
        # OAuth 2.1 token endpoint accepts form-urlencoded body.
        form = request.form if request.form else (request.get_json(silent=True) or {})
        grant_type = form.get("grant_type") or ""

        if grant_type == "authorization_code":
            return _token_from_code(form)
        if grant_type == "refresh_token":
            return _token_from_refresh(form)
        return _err("unsupported_grant_type", f"grant_type={grant_type}")

    def _token_from_code(form):
        code = form.get("code") or ""
        client_id = form.get("client_id") or ""
        redirect_uri = form.get("redirect_uri") or ""
        code_verifier = form.get("code_verifier") or ""
        resource = form.get("resource") or ""

        rec = storage.consume_auth_code(code)
        if rec is None:
            return _err("invalid_grant", "Code missing or expired")
        if rec["client_id"] != client_id:
            return _err("invalid_grant", "client_id mismatch")
        if rec["redirect_uri"] != redirect_uri:
            return _err("invalid_grant", "redirect_uri mismatch")
        if not _verify_pkce_s256(code_verifier, rec["code_challenge"]):
            return _err("invalid_grant", "PKCE verifier mismatch")
        # Resource is optional on /token if it was bound at /authorize, but if
        # the client does send it, it must match (RFC 8707 §2).
        if resource and resource.rstrip("/") != rec["resource"].rstrip("/"):
            return _err("invalid_target", "resource mismatch with /authorize")

        uid = rec["uid"]
        tier = _resolve_user_tier(uid)
        scope = rec["scope"]

        access, expires_in = mint_access_token(
            uid=uid, tier=tier, scope=scope, client_id=client_id,
        )
        refresh, jti = mint_refresh_token(uid=uid, client_id=client_id, scope=scope)
        storage.register_refresh_jti(jti=jti, uid=uid, client_id=client_id, scope=scope)

        return _cors(jsonify({
            "access_token": access,
            "token_type": "Bearer",
            "expires_in": expires_in,
            "refresh_token": refresh,
            "scope": scope,
        }))

    def _token_from_refresh(form):
        refresh_jwt = form.get("refresh_token") or ""
        client_id = form.get("client_id") or ""

        claims = verify_refresh_token(refresh_jwt)
        if claims is None:
            return _err("invalid_grant", "Refresh token invalid or expired")
        if not storage.is_refresh_jti_active(claims.get("jti") or ""):
            return _err("invalid_grant", "Refresh token revoked or unknown")
        # Token's client_id must match the requesting client.
        token_client = claims.get("client_id")
        if token_client and client_id and token_client != client_id:
            return _err("invalid_grant", "client_id mismatch")

        uid = claims["sub"]
        scope = claims.get("scope") or DEFAULT_SCOPE
        tier = _resolve_user_tier(uid)

        # Rotate: revoke old jti, mint new refresh.
        storage.revoke_refresh_jti(claims["jti"])
        access, expires_in = mint_access_token(
            uid=uid, tier=tier, scope=scope, client_id=token_client,
        )
        new_refresh, new_jti = mint_refresh_token(
            uid=uid, client_id=token_client, scope=scope,
        )
        storage.register_refresh_jti(
            jti=new_jti, uid=uid, client_id=token_client, scope=scope,
        )

        return _cors(jsonify({
            "access_token": access,
            "token_type": "Bearer",
            "expires_in": expires_in,
            "refresh_token": new_refresh,
            "scope": scope,
        }))

    app.register_blueprint(bp)
    logger.info("[MCP OAuth] Mounted /oauth/* and /.well-known/oauth-*")


# ── Helpers (module level so tests can hit them if needed) ──────────────────


def _redirect_with_error(redirect_uri: str, error: str, state: str, *, desc: str = ""):
    return redirect(_build_error_redirect(redirect_uri, error, state, desc=desc))


def _build_error_redirect(redirect_uri: str, error: str, state: str, *, desc: str = "") -> str:
    qs = {"error": error}
    if desc:
        qs["error_description"] = desc
    if state:
        qs["state"] = state
    sep = "&" if "?" in redirect_uri else "?"
    return f"{redirect_uri}{sep}{urlencode(qs)}"


def _firebase_web_config_js() -> str:
    """Inline Firebase Web SDK config. Mirrors connect-grow-hire/src/lib/firebase.ts.

    These values are public by design (anon Web SDK config); hardcoding matches
    the frontend's existing pattern so the consent page works without a build step.
    The frontend's hardcoded fallbacks are the source of truth — keep these in sync.
    """
    project_id = os.getenv("FIREBASE_PROJECT_ID") or "offerloop-native"
    api_key = os.getenv("FIREBASE_WEB_API_KEY") or "AIzaSyCxcZbNwbh09DFw70tBQUSoqBIDaXNwZdE"
    auth_domain = os.getenv("FIREBASE_AUTH_DOMAIN") or "offerloop-native.firebaseapp.com"
    app_id = os.getenv("FIREBASE_APP_ID") or "1:184607281467:web:eab1b0e8be341aa8c5271e"
    return (
        f'apiKey: "{api_key}", '
        f'authDomain: "{auth_domain}", '
        f'projectId: "{project_id}", '
        f'appId: "{app_id}"'
    )


def _render_consent_page(txn: str, client_name: str):
    """Inline HTML consent page.

    Loads Firebase Web SDK from CDN, checks signed-in state, shows Allow/Deny,
    POSTs to /oauth/grant with the Firebase ID token. Browser then follows the
    returned redirect URL back to the client.

    This is intentionally minimal for v1. A polished React page at
    /oauth/consent is on the follow-up list.
    """
    fb_config = _firebase_web_config_js()
    # Escape client_name for HTML context.
    safe_name = (
        client_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Connect to Offerloop</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {{ font-family: -apple-system, system-ui, Segoe UI, sans-serif;
           margin: 0; min-height: 100vh; display: flex; align-items: center;
           justify-content: center; background: #f7f7f8; color: #111; }}
    .card {{ background: white; border: 1px solid #e5e7eb; border-radius: 12px;
             padding: 32px; max-width: 440px; width: calc(100% - 32px);
             box-shadow: 0 1px 3px rgba(0,0,0,0.04); }}
    h1 {{ font-size: 20px; margin: 0 0 8px; }}
    p {{ color: #555; font-size: 14px; line-height: 1.5; margin: 8px 0; }}
    .actions {{ margin-top: 24px; display: flex; gap: 8px; }}
    button {{ flex: 1; padding: 10px 16px; border-radius: 8px; font-size: 14px;
              font-weight: 500; cursor: pointer; border: 1px solid transparent; }}
    .primary {{ background: #111; color: white; }}
    .secondary {{ background: white; color: #111; border-color: #e5e7eb; }}
    .signin {{ background: #4285F4; color: white; }}
    .scopes {{ background: #f3f4f6; border-radius: 8px; padding: 12px;
               font-size: 13px; margin: 16px 0; }}
    .user {{ font-size: 13px; color: #666; margin: 8px 0; }}
    .hidden {{ display: none; }}
    .error {{ color: #b91c1c; font-size: 13px; margin-top: 8px; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect <strong id="client-name">{safe_name}</strong> to your Offerloop account</h1>
    <p>This will let the client search contacts, get company intel, and draft
    outreach using your tier's limits.</p>
    <div class="scopes">
      Permissions: <code>mcp:read</code> <code>mcp:write</code>
    </div>
    <div id="signed-in" class="hidden">
      <div class="user">Signed in as <span id="user-email"></span></div>
      <div class="actions">
        <button class="secondary" id="deny">Deny</button>
        <button class="primary" id="allow">Allow</button>
      </div>
    </div>
    <div id="signed-out" class="hidden">
      <p>Sign in to your Offerloop account to continue.</p>
      <div class="actions">
        <button class="signin" id="signin">Sign in with Google</button>
      </div>
    </div>
    <div id="error" class="error hidden"></div>
  </div>

  <script type="module">
    import {{ initializeApp }} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
    import {{ getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup }}
      from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

    const app = initializeApp({{ {fb_config} }});
    const auth = getAuth(app);

    const TXN = "{txn}";
    const $ = (id) => document.getElementById(id);
    const showError = (msg) => {{ $('error').textContent = msg; $('error').classList.remove('hidden'); }};

    onAuthStateChanged(auth, (user) => {{
      if (user) {{
        $('user-email').textContent = user.email || user.uid;
        $('signed-in').classList.remove('hidden');
        $('signed-out').classList.add('hidden');
      }} else {{
        $('signed-out').classList.remove('hidden');
        $('signed-in').classList.add('hidden');
      }}
    }});

    $('signin').addEventListener('click', async () => {{
      try {{ await signInWithPopup(auth, new GoogleAuthProvider()); }}
      catch (e) {{ showError('Sign-in failed: ' + e.message); }}
    }});

    async function postGrant(decision) {{
      const user = auth.currentUser;
      if (!user && decision === 'allow') {{ showError('Not signed in'); return; }}
      const idToken = user ? await user.getIdToken() : '';
      const r = await fetch('/oauth/grant', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ txn: TXN, firebase_id_token: idToken, decision }}),
      }});
      const j = await r.json();
      if (!r.ok || !j.redirect_url) {{
        showError(j.error_description || j.error || 'Grant failed');
        return;
      }}
      window.location = j.redirect_url;
    }}

    $('allow').addEventListener('click', () => postGrant('allow'));
    $('deny').addEventListener('click', () => postGrant('deny'));
  </script>
</body>
</html>"""
    from flask import Response
    return Response(html, mimetype="text/html")
