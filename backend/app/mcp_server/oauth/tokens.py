"""
JWT mint + verify for MCP OAuth.

Tokens are RS256 JWTs signed with the AS's RSA private key (keys.py) and
validated by the RS using the matching public key from /.well-known/jwks.json.

Two token types:

  Access tokens (typ=access)
    - aud = canonical MCP resource URL (e.g. https://offerloop.ai/mcp)
    - sub = Firebase UID
    - tier = "free" | "pro" | "elite" (Offerloop-specific, snapshot at issuance)
    - scope = space-separated OAuth scopes
    - exp = 15 minutes
    - Used as Bearer on /mcp requests.

  Refresh tokens (typ=refresh)
    - aud = AS token endpoint (refresh tokens never leave the AS)
    - sub = Firebase UID
    - exp = 30 days
    - jti = uuid for rotation tracking
    - Exchanged at /oauth/token for a new access token; tier is re-resolved
      from Firestore on each refresh so plan upgrades propagate.

Audience binding is the spec's MUST-verify line of defense against confused
deputy (RFC 8707). The RS rejects any token whose aud doesn't equal its own
canonical URL.
"""
from __future__ import annotations

import os
import time
import uuid
from typing import Optional

from authlib.jose import JsonWebToken, JWTClaims
from authlib.jose.errors import JoseError

from app.mcp_server.oauth import keys

_JWT = JsonWebToken(["RS256"])

ACCESS_TTL_SECONDS = 15 * 60
REFRESH_TTL_SECONDS = 30 * 24 * 3600

DEFAULT_SCOPE = "mcp:read mcp:write"


def issuer_url() -> str:
    """AS issuer URL. Configurable so dev (localhost) and prod stay correct."""
    return (os.getenv("MCP_OAUTH_ISSUER") or "https://offerloop.ai/oauth").rstrip("/")


def resource_url() -> str:
    """Canonical MCP resource URL. RS validates token aud against this."""
    return (os.getenv("MCP_RESOURCE_URL") or "https://offerloop.ai/mcp").rstrip("/")


def mint_access_token(
    *,
    uid: str,
    tier: str,
    scope: str = DEFAULT_SCOPE,
    client_id: Optional[str] = None,
) -> tuple[str, int]:
    """Mint a short-lived access token. Returns (jwt, expires_in_seconds)."""
    now = int(time.time())
    claims = {
        "iss": issuer_url(),
        "aud": resource_url(),
        "sub": uid,
        "iat": now,
        "exp": now + ACCESS_TTL_SECONDS,
        "typ": "access",
        "scope": scope,
        "tier": tier,
        "jti": uuid.uuid4().hex,
    }
    if client_id:
        claims["client_id"] = client_id
    header = {"alg": "RS256", "kid": keys.KID(), "typ": "JWT"}
    token = _JWT.encode(header, claims, keys.get_private_pem()).decode("ascii")
    return token, ACCESS_TTL_SECONDS


def mint_refresh_token(
    *,
    uid: str,
    client_id: Optional[str] = None,
    scope: str = DEFAULT_SCOPE,
) -> tuple[str, str]:
    """Mint a refresh token. Returns (jwt, jti).

    Caller stores the jti in the refresh-token store so we can detect
    reuse and rotate on each /oauth/token exchange.
    """
    now = int(time.time())
    jti = uuid.uuid4().hex
    claims = {
        "iss": issuer_url(),
        "aud": issuer_url(),
        "sub": uid,
        "iat": now,
        "exp": now + REFRESH_TTL_SECONDS,
        "typ": "refresh",
        "scope": scope,
        "jti": jti,
    }
    if client_id:
        claims["client_id"] = client_id
    header = {"alg": "RS256", "kid": keys.KID(), "typ": "JWT"}
    token = _JWT.encode(header, claims, keys.get_private_pem()).decode("ascii")
    return token, jti


def _public_key_pem() -> bytes:
    from cryptography.hazmat.primitives import serialization
    return keys._private_key().public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def verify_access_token(token: str) -> Optional[dict]:
    """Verify an access token. Returns claims dict on success, None on failure.

    Validates: signature, exp, iss, aud (must equal resource_url()), typ=access.
    Never raises; failures return None.
    """
    if not token:
        return None
    try:
        claims = _JWT.decode(
            token,
            _public_key_pem(),
            claims_options={
                "iss": {"essential": True, "value": issuer_url()},
                "aud": {"essential": True, "value": resource_url()},
                "exp": {"essential": True},
                "sub": {"essential": True},
                "typ": {"essential": True, "value": "access"},
            },
        )
        claims.validate()
    except JoseError:
        return None
    except Exception:
        return None
    return dict(claims)


def verify_refresh_token(token: str) -> Optional[dict]:
    """Verify a refresh token. Returns claims dict on success, None on failure.

    Audience must equal the AS issuer (refresh tokens stay inside the AS).
    """
    if not token:
        return None
    try:
        claims = _JWT.decode(
            token,
            _public_key_pem(),
            claims_options={
                "iss": {"essential": True, "value": issuer_url()},
                "aud": {"essential": True, "value": issuer_url()},
                "exp": {"essential": True},
                "sub": {"essential": True},
                "typ": {"essential": True, "value": "refresh"},
                "jti": {"essential": True},
            },
        )
        claims.validate()
    except JoseError:
        return None
    except Exception:
        return None
    return dict(claims)
