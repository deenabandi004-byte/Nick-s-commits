"""
OAuth discovery metadata documents.

  /.well-known/oauth-authorization-server  RFC 8414 (AS metadata)
  /.well-known/oauth-protected-resource    RFC 9728 (RS metadata)
  /oauth/jwks.json                         AS public key set

Both well-known endpoints are public and reachable cross-origin (MCP clients
fetch them from the user's browser during the initial discovery handshake),
so they need CORS open. Flask-CORS at the app level handles this once we
include these routes in the allow list (or we set them in the response).
"""
from __future__ import annotations

from app.mcp_server.oauth import keys
from app.mcp_server.oauth.tokens import issuer_url, resource_url


def authorization_server_metadata() -> dict:
    iss = issuer_url()
    return {
        "issuer": iss,
        "authorization_endpoint": f"{iss}/authorize",
        "token_endpoint": f"{iss}/token",
        "registration_endpoint": f"{iss}/register",
        "jwks_uri": f"{iss}/jwks.json",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": ["mcp:read", "mcp:write"],
        "service_documentation": "https://offerloop.ai/documentation",
    }


def protected_resource_metadata() -> dict:
    return {
        "resource": resource_url(),
        "authorization_servers": [issuer_url()],
        "scopes_supported": ["mcp:read", "mcp:write"],
        "bearer_methods_supported": ["header"],
    }


def jwks_document() -> dict:
    return {"keys": [keys.get_public_jwk()]}
