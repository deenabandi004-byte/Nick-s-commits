"""
Firestore-backed storage for Flask-Limiter.

Replaces in-memory storage so rate limits persist across restarts
and are shared across gunicorn workers.

Uses Firestore documents with atomic increments and TTL-based expiry.
Collection: rate_limits/{hashed_key}
"""
import hashlib
import logging
import time

from firebase_admin import firestore
from limits.storage import Storage
from google.cloud.firestore_v1 import SERVER_TIMESTAMP


logger = logging.getLogger(__name__)


COLLECTION = "rate_limits"


def _doc_key(key: str) -> str:
    """Hash the limiter key to a valid Firestore document ID."""
    return hashlib.sha256(key.encode()).hexdigest()[:40]


class FirestoreStorage(Storage):
    """limits Storage backed by Firestore."""

    STORAGE_SCHEME = ["firestore"]

    # limits >= 4.x added `base_exceptions` as an abstract property on
    # Storage. Without this, FirestoreStorage() raises TypeError at
    # instantiation, and extensions.init_app_extensions swallowed it
    # silently, falling back to in-memory storage. Empty tuple means
    # "no backend-specific recoverable exceptions"; the try/except
    # blocks in incr/get/etc. already fail-open on any error.
    base_exceptions = ()

    def __init__(self, uri: str = "firestore://", **options):
        super().__init__(uri, **options)
        self._db = None

    @property
    def db(self):
        if self._db is None:
            from app.extensions import get_db
            self._db = get_db()
        return self._db

    def check(self) -> bool:
        """Return True if the storage backend is healthy."""
        try:
            return self.db is not None
        except Exception:
            return False

    def incr(self, key: str, expiry: int, amount: int = 1) -> int:
        """Atomically increment a counter, resetting if expired.

        Uses the firestore.transactional decorator pattern (the same one
        used by services/auth.deduct_credits_atomic). The previous
        @self.db.transaction (no-parens) form silently fails against
        the real Firestore client (Client.transaction is a method, not
        a decorator factory), and the blanket except below masked it
        as a fail-open. With this fix, real atomic increments fire
        instead of every call dropping to the 0-allow path.
        """
        doc_ref = self.db.collection(COLLECTION).document(_doc_key(key))
        now = time.time()
        expires_at = now + expiry

        @firestore.transactional
        def _txn(transaction):
            snap = doc_ref.get(transaction=transaction)
            if snap.exists:
                data = snap.to_dict() or {}
                if data.get("expires_at", 0) > now:
                    new_count = data.get("count", 0) + amount
                    transaction.update(doc_ref, {"count": new_count})
                    return new_count
            # Expired or missing, start fresh
            new_count = amount
            transaction.set(doc_ref, {
                "count": new_count,
                "expires_at": expires_at,
                "key": key,
            })
            return new_count

        try:
            return _txn(self.db.transaction())
        except Exception as e:
            # Fail-open: a Firestore blip never takes Flask-Limiter down.
            # Now that the transaction pattern is correct, this branch
            # should only fire on genuine Firestore unavailability.
            logger.warning("[FirestoreStorage.incr] txn failed for key %s: %s",
                           _doc_key(key), e)
            return 0

    def get(self, key: str) -> int:
        """Get the current counter value."""
        try:
            snap = self.db.collection(COLLECTION).document(_doc_key(key)).get()
            if snap.exists:
                data = snap.to_dict() or {}
                if data.get("expires_at", 0) > time.time():
                    return data.get("count", 0)
            return 0
        except Exception:
            return 0

    def get_expiry(self, key: str) -> float:
        """Get the expiry time as a Unix timestamp."""
        try:
            snap = self.db.collection(COLLECTION).document(_doc_key(key)).get()
            if snap.exists:
                data = snap.to_dict() or {}
                return data.get("expires_at", -1)
            return -1
        except Exception:
            return -1

    def clear(self, key: str) -> None:
        """Delete a rate-limit entry."""
        try:
            self.db.collection(COLLECTION).document(_doc_key(key)).delete()
        except Exception:
            pass

    def reset(self) -> int | None:
        """Reset all rate-limit entries. Returns count deleted."""
        try:
            docs = self.db.collection(COLLECTION).stream()
            count = 0
            for doc in docs:
                doc.reference.delete()
                count += 1
            return count
        except Exception:
            return None
