"""
Firestore-backed storage for Flask-Limiter.

Replaces in-memory storage so rate limits persist across restarts
and are shared across gunicorn workers.

Uses Firestore documents with atomic increments and TTL-based expiry.
Collection: rate_limits/{hashed_key}
"""
import hashlib
import time

from limits.storage import Storage
from google.cloud.firestore_v1 import SERVER_TIMESTAMP


COLLECTION = "rate_limits"


def _doc_key(key: str) -> str:
    """Hash the limiter key to a valid Firestore document ID."""
    return hashlib.sha256(key.encode()).hexdigest()[:40]


class FirestoreStorage(Storage):
    """limits Storage backed by Firestore."""

    STORAGE_SCHEME = ["firestore"]

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
        """Atomically increment a counter, resetting if expired."""
        doc_ref = self.db.collection(COLLECTION).document(_doc_key(key))
        now = time.time()
        expires_at = now + expiry

        @self.db.transaction
        def _txn(txn):
            snap = doc_ref.get(transaction=txn)
            if snap.exists:
                data = snap.to_dict() or {}
                if data.get("expires_at", 0) > now:
                    new_count = data.get("count", 0) + amount
                    txn.update(doc_ref, {"count": new_count})
                    return new_count
            # Expired or missing - start fresh
            new_count = amount
            txn.set(doc_ref, {
                "count": new_count,
                "expires_at": expires_at,
                "key": key,
            })
            return new_count

        try:
            return _txn(self.db.transaction())
        except Exception:
            # On Firestore error, allow the request (fail-open)
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
