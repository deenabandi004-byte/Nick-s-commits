"""
RSA keypair management for the MCP OAuth authorization server.

Production: set MCP_OAUTH_PRIVATE_KEY_PEM to a PEM-encoded RSA private key.
Generate once with `openssl genrsa 2048` and stash in the Render env var.

Dev: if the env var is unset, an ephemeral 2048-bit key is generated at
import time. Every process restart rotates the key, which invalidates all
issued tokens. That is the right behavior for dev (loud, obvious) and the
wrong behavior for prod (silent logouts), so we log a WARNING when this
fallback fires.

We expose the key three ways:
  - get_private_pem()  PEM bytes for Authlib JWT signing
  - get_public_jwk()   dict suitable for /.well-known/jwks.json
  - KID                stable key ID stamped in JWT headers
"""
from __future__ import annotations

import hashlib
import logging
import os
from functools import lru_cache

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

logger = logging.getLogger(__name__)


_ENV_VAR = "MCP_OAUTH_PRIVATE_KEY_PEM"
_KEY_SIZE = 2048
_PUBLIC_EXPONENT = 65537


def _load_private_key():
    """Load the RSA private key from env var, else generate an ephemeral one."""
    pem = os.getenv(_ENV_VAR)
    if pem:
        try:
            return serialization.load_pem_private_key(
                pem.encode("utf-8"),
                password=None,
                backend=default_backend(),
            )
        except Exception as e:
            raise RuntimeError(
                f"{_ENV_VAR} is set but cannot be parsed as PEM RSA private key: {e}"
            )
    logger.warning(
        "[MCP OAuth] %s not set; generating ephemeral RSA key. All OAuth tokens "
        "will be invalidated on the next process restart. Set the env var for prod.",
        _ENV_VAR,
    )
    return rsa.generate_private_key(
        public_exponent=_PUBLIC_EXPONENT,
        key_size=_KEY_SIZE,
        backend=default_backend(),
    )


@lru_cache(maxsize=1)
def _private_key():
    return _load_private_key()


@lru_cache(maxsize=1)
def get_private_pem() -> bytes:
    """Return the private key as PEM bytes for Authlib JWT signing."""
    return _private_key().private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


@lru_cache(maxsize=1)
def _public_numbers():
    return _private_key().public_key().public_numbers()


def _b64url_uint(value: int) -> str:
    import base64
    byte_length = (value.bit_length() + 7) // 8
    raw = value.to_bytes(byte_length, "big")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


@lru_cache(maxsize=1)
def KID() -> str:
    """Stable key ID = first 16 hex chars of SHA-256(public modulus)."""
    n = _public_numbers().n
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return hashlib.sha256(raw).hexdigest()[:16]


@lru_cache(maxsize=1)
def get_public_jwk() -> dict:
    """Return the public key as a JWK dict for /.well-known/jwks.json."""
    pn = _public_numbers()
    return {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": KID(),
        "n": _b64url_uint(pn.n),
        "e": _b64url_uint(pn.e),
    }
