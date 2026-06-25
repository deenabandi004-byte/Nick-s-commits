"""
Firestore-backed storage for OAuth artifacts.

Collections:

  mcp_oauth_clients/{client_id}
    DCR client metadata. Long-lived. No TTL policy — clients persist
    until manually pruned (each doc is tiny).

  mcp_oauth_auth_codes/{code}
    One-shot authorization codes minted at /oauth/grant, consumed at
    /oauth/token. TTL = 5 minutes. Consumed transactionally (get-then-
    delete) so two simultaneous /token calls with the same code cannot
    both succeed.

  mcp_oauth_refresh_jtis/{jti}
    Refresh-token IDs for rotation + revocation tracking. TTL = 30 days,
    matching the refresh-token JWT lifetime. `revoked` field flipped to
    True during rotation; subsequent presentation of the same jti is
    rejected.

  mcp_oauth_pending_authz/{txn}
    Authorization-endpoint transactions, stored server-side so the
    consent page's POST back to /oauth/grant doesn't have to round-trip
    OAuth params through the browser (which would let a malicious page
    edit them mid-flow). TTL = 10 minutes.

The interface mirrors the previous in-memory implementation exactly:
register_client, get_client, issue_auth_code, consume_auth_code,
register_refresh_jti, is_refresh_jti_active, revoke_refresh_jti,
store_pending_authz, get_pending_authz, consume_pending_authz.
blueprint.py and tokens.py do not change.

────────────────────────────────────────────────────────────────────────────
TTL policy setup (one-time per Firebase project)
────────────────────────────────────────────────────────────────────────────

Until Firestore TTL policies are created on these collections, expired
docs accumulate. Code still respects expires_at on read (expired docs
are treated as missing), so functionality is correct — just storage grows.

Set up TTL policies via gcloud:

  gcloud firestore fields ttls update expires_at \\
    --collection-group=mcp_oauth_auth_codes --enable-ttl

  gcloud firestore fields ttls update expires_at \\
    --collection-group=mcp_oauth_pending_authz --enable-ttl

  gcloud firestore fields ttls update expires_at \\
    --collection-group=mcp_oauth_refresh_jtis --enable-ttl

(mcp_oauth_clients has no TTL — clients persist until manually pruned.)
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Optional

from firebase_admin import firestore

from app.extensions import get_db

logger = logging.getLogger(__name__)


AUTH_CODE_TTL_SECONDS = 5 * 60
PENDING_AUTHZ_TTL_SECONDS = 10 * 60
REFRESH_JTI_TTL_SECONDS = 30 * 24 * 3600

_CLIENTS = "mcp_oauth_clients"
_AUTH_CODES = "mcp_oauth_auth_codes"
_REFRESH_JTIS = "mcp_oauth_refresh_jtis"
_PENDING_AUTHZ = "mcp_oauth_pending_authz"


def _expires_at(seconds_from_now: int) -> datetime:
    """Future timestamp for the `expires_at` field. Stored as Firestore
    Timestamp so the project's TTL policy can auto-GC the doc."""
    return datetime.fromtimestamp(time.time() + seconds_from_now, tz=timezone.utc)


def _is_expired(value) -> bool:
    """True when an expires_at timestamp is in the past (or missing/malformed)."""
    if value is None:
        return True
    try:
        if isinstance(value, datetime):
            ts = value.timestamp()
        else:
            # Defensive: handle int epoch stored from older docs, if any.
            ts = float(value)
    except Exception:
        return True
    return time.time() >= ts


def _db():
    """Lazy Firestore client. Raises if Firebase Admin isn't initialized."""
    return get_db()


# ── Clients (DCR) ────────────────────────────────────────────────────────────


def register_client(metadata: dict) -> dict:
    """Mint a new client_id, persist metadata, return the full registration record."""
    client_id = secrets.token_urlsafe(24)
    now = int(time.time())
    record = {
        "client_id": client_id,
        "client_id_issued_at": now,
        "redirect_uris": metadata.get("redirect_uris") or [],
        "client_name": metadata.get("client_name") or "Unnamed MCP client",
        "client_uri": metadata.get("client_uri"),
        "logo_uri": metadata.get("logo_uri"),
        "scope": metadata.get("scope") or "mcp:read mcp:write",
        "grant_types": metadata.get("grant_types") or ["authorization_code", "refresh_token"],
        "response_types": metadata.get("response_types") or ["code"],
        "token_endpoint_auth_method": metadata.get("token_endpoint_auth_method") or "none",
    }
    _db().collection(_CLIENTS).document(client_id).set(record)
    logger.info("[MCP OAuth] Registered client %s (%s)", client_id, record["client_name"])
    return record


def get_client(client_id: str) -> Optional[dict]:
    if not client_id:
        return None
    snap = _db().collection(_CLIENTS).document(client_id).get()
    if not snap.exists:
        return None
    return snap.to_dict()


# ── Auth codes ───────────────────────────────────────────────────────────────


def issue_auth_code(
    *,
    client_id: str,
    redirect_uri: str,
    uid: str,
    scope: str,
    code_challenge: str,
    code_challenge_method: str,
    resource: str,
) -> str:
    code = secrets.token_urlsafe(32)
    _db().collection(_AUTH_CODES).document(code).set({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "uid": uid,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "resource": resource,
        "expires_at": _expires_at(AUTH_CODE_TTL_SECONDS),
    })
    return code


def consume_auth_code(code: str) -> Optional[dict]:
    """One-shot: returns the record and deletes it. None if missing or expired.

    Transactional so two simultaneous /token calls with the same code can't
    both succeed.
    """
    if not code:
        return None
    db = _db()
    ref = db.collection(_AUTH_CODES).document(code)

    @firestore.transactional
    def _txn(transaction):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        if _is_expired(data.get("expires_at")):
            transaction.delete(ref)
            return None
        transaction.delete(ref)
        return data

    try:
        return _txn(db.transaction())
    except Exception as e:
        logger.warning("[MCP OAuth] consume_auth_code transaction failed: %s", e)
        return None


# ── Refresh token IDs ────────────────────────────────────────────────────────


def register_refresh_jti(
    *,
    jti: str,
    uid: str,
    client_id: Optional[str],
    scope: str,
) -> None:
    _db().collection(_REFRESH_JTIS).document(jti).set({
        "uid": uid,
        "client_id": client_id,
        "scope": scope,
        "issued_at": int(time.time()),
        "revoked": False,
        "expires_at": _expires_at(REFRESH_JTI_TTL_SECONDS),
    })


def is_refresh_jti_active(jti: str) -> bool:
    if not jti:
        return False
    snap = _db().collection(_REFRESH_JTIS).document(jti).get()
    if not snap.exists:
        return False
    data = snap.to_dict() or {}
    if data.get("revoked"):
        return False
    if _is_expired(data.get("expires_at")):
        return False
    return True


def revoke_refresh_jti(jti: str) -> None:
    """Mark a refresh token's jti revoked. Used during rotation."""
    if not jti:
        return
    ref = _db().collection(_REFRESH_JTIS).document(jti)
    try:
        ref.update({"revoked": True})
    except Exception as e:
        # NotFound — the jti was never registered or already expired. Either
        # way the revoke is a no-op; don't raise into the token endpoint.
        logger.debug("[MCP OAuth] revoke_refresh_jti(%s) skipped: %s", jti, e)


# ── Pending authorization transactions ───────────────────────────────────────


def store_pending_authz(params: dict) -> str:
    txn = secrets.token_urlsafe(24)
    _db().collection(_PENDING_AUTHZ).document(txn).set({
        **params,
        "expires_at": _expires_at(PENDING_AUTHZ_TTL_SECONDS),
    })
    return txn


def get_pending_authz(txn: str) -> Optional[dict]:
    if not txn:
        return None
    snap = _db().collection(_PENDING_AUTHZ).document(txn).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    if _is_expired(data.get("expires_at")):
        return None
    return data


def consume_pending_authz(txn: str) -> Optional[dict]:
    """One-shot: returns the record and deletes it. None if missing or expired."""
    if not txn:
        return None
    db = _db()
    ref = db.collection(_PENDING_AUTHZ).document(txn)

    @firestore.transactional
    def _txn(transaction):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        if _is_expired(data.get("expires_at")):
            transaction.delete(ref)
            return None
        transaction.delete(ref)
        return data

    try:
        return _txn(db.transaction())
    except Exception as e:
        logger.warning("[MCP OAuth] consume_pending_authz transaction failed: %s", e)
        return None
