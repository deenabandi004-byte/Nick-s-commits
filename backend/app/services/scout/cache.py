"""Phase 4 Tier B: Scout semantic embedding caches.

Two caches, both keyed by an intent embedding (text-embedding-3-small):
  navigate cache - a repeated navigation intent serves a navigate plan with no
    LLM call.
  answer cache - a repeated meta-question serves a cached answer with no LLM
    call.

Both are in-memory dicts persisted to Firestore on EVERY write: Render restarts
and OOMs skip graceful shutdown, so there is no safe place to flush on exit.
The full cache loads from Firestore on startup. LRU eviction at 1000 entries.

Each entry stores the PAGE_REGISTRY version it was built against. A lookup
skips entries from an older version, and stale entries are dropped on the next
write. Bumping REGISTRY_VERSION is therefore a cache invalidation.

Promotion: an LLM result is not cached on first sight. It enters a 24h
pending-intents buffer; once the same intent (cosine >= 0.92) has been seen by
3+ distinct users, it is promoted into the cache. The buffer, not the cache,
tracks the early repeats, which solves the chicken-and-egg problem of needing
the cache to detect repeats.

Caching is best-effort: any embedding or Firestore failure degrades to "no
cache" (the turn just falls through to the LLM) and never raises.
"""
from __future__ import annotations

import math
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from app.services.scout.page_registry import REGISTRY_VERSION

EMBED_MODEL = "text-embedding-3-small"
SIMILARITY_THRESHOLD = 0.92       # a lookup at or above this is a cache hit
NEAR_MISS_FLOOR = 0.85            # 0.85 to 0.92 is logged as a near miss
MAX_ENTRIES = 1000                # LRU cap per cache
PROMOTION_HITS = 3                # distinct users before an intent is promoted
PENDING_TTL_SECONDS = 24 * 3600   # pending-intents buffer lifetime


async def embed(text: str) -> Optional[List[float]]:
    """Embed text with text-embedding-3-small. Returns None on any failure."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        from app.services.openai_client import get_async_openai_client
        client = get_async_openai_client()
        resp = await client.embeddings.create(model=EMBED_MODEL, input=text[:2000])
        return list(resp.data[0].embedding)
    except Exception as e:  # any failure degrades to "no cache"
        print(f"[ScoutCache] embed failed: {type(e).__name__}: {e}")
        return None


def cosine(a: List[float], b: List[float]) -> float:
    """Cosine similarity of two equal-length vectors. 0.0 on bad input."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def deidentify(text: str) -> str:
    """Truncated, identifier-stripped intent text for the metrics view.

    Strips URLs and email addresses and caps length at 80 chars. Names are not
    reliably detectable without NER; the 80-char cap bounds any exposure.
    """
    t = (text or "").strip()
    t = re.sub(r"https?://\S+", "[url]", t)
    t = re.sub(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", "[email]", t)
    return t[:80]


@dataclass
class CacheEntry:
    embedding: List[float]
    plan: Dict[str, Any]              # navigate tool-call dict, or {"answer": str}
    hit_count: int = 0
    created_at: float = field(default_factory=time.time)
    last_hit_at: float = field(default_factory=time.time)
    registry_version: int = REGISTRY_VERSION
    intent_text: str = ""            # truncated, de-identified; for metrics

    def to_doc(self) -> Dict[str, Any]:
        return {
            "embedding": self.embedding,
            "plan": self.plan,
            "hit_count": self.hit_count,
            "created_at": self.created_at,
            "last_hit_at": self.last_hit_at,
            "registry_version": self.registry_version,
            "intent_text": self.intent_text,
        }

    @classmethod
    def from_doc(cls, d: Dict[str, Any]) -> "CacheEntry":
        return cls(
            embedding=list(d.get("embedding") or []),
            plan=d.get("plan") or {},
            hit_count=int(d.get("hit_count") or 0),
            created_at=float(d.get("created_at") or time.time()),
            last_hit_at=float(d.get("last_hit_at") or time.time()),
            registry_version=int(d.get("registry_version") or 0),
            intent_text=str(d.get("intent_text") or ""),
        )


class SemanticCache:
    """An embedding-keyed cache with LRU eviction and Firestore write-through."""

    def __init__(self, collection: str, max_entries: int = MAX_ENTRIES):
        self.collection = collection          # Firestore collection name
        self.max_entries = max_entries
        self._entries: Dict[str, CacheEntry] = {}

    # --- Firestore (best-effort) ----------------------------------------
    def _db(self):
        try:
            from app.extensions import get_db
            return get_db()
        except Exception:
            return None

    def load(self) -> None:
        """Load the full cache from Firestore. Best-effort; called on startup."""
        db = self._db()
        if db is None:
            return
        try:
            for doc in db.collection(self.collection).stream():
                self._entries[doc.id] = CacheEntry.from_doc(doc.to_dict() or {})
            print(f"[ScoutCache] loaded {len(self._entries)} from {self.collection}")
        except Exception as e:
            print(f"[ScoutCache] load {self.collection} failed: {e}")

    def _persist(self, entry_id: str, entry: CacheEntry) -> None:
        db = self._db()
        if db is None:
            return
        try:
            db.collection(self.collection).document(entry_id).set(entry.to_doc())
        except Exception as e:
            print(f"[ScoutCache] persist {self.collection}/{entry_id} failed: {e}")

    def _remove_remote(self, entry_id: str) -> None:
        db = self._db()
        if db is None:
            return
        try:
            db.collection(self.collection).document(entry_id).delete()
        except Exception as e:
            print(f"[ScoutCache] delete {self.collection}/{entry_id} failed: {e}")

    # --- lookup / add ---------------------------------------------------
    def lookup(self, embedding: List[float]) -> Tuple[Optional[CacheEntry], float]:
        """Best match for `embedding`.

        Returns (entry, cosine). entry is None unless cosine is at or above
        SIMILARITY_THRESHOLD and the entry's registry version is current. The
        cosine returned is always the best score seen, so the caller can log a
        near miss (NEAR_MISS_FLOOR to SIMILARITY_THRESHOLD). On a hit, hit_count
        and last_hit_at are bumped and the change is persisted.
        """
        best_id, best_entry, best_score = "", None, 0.0
        for eid, entry in self._entries.items():
            if entry.registry_version != REGISTRY_VERSION:
                continue
            score = cosine(embedding, entry.embedding)
            if score > best_score:
                best_id, best_entry, best_score = eid, entry, score
        if best_entry is not None and best_score >= SIMILARITY_THRESHOLD:
            best_entry.hit_count += 1
            best_entry.last_hit_at = time.time()
            self._persist(best_id, best_entry)
            return best_entry, best_score
        return None, best_score

    def add(self, embedding: List[float], plan: Dict[str, Any], intent_text: str) -> None:
        """Insert a new entry, evicting stale and LRU entries, then persist."""
        entry = CacheEntry(
            embedding=embedding,
            plan=plan,
            intent_text=deidentify(intent_text),
        )
        entry_id = uuid.uuid4().hex
        self._entries[entry_id] = entry
        self._evict()
        if entry_id in self._entries:   # survived eviction
            self._persist(entry_id, entry)

    def _evict(self) -> None:
        """Drop stale-version entries first, then LRU down to max_entries."""
        stale = [eid for eid, e in self._entries.items()
                 if e.registry_version != REGISTRY_VERSION]
        for eid in stale:
            del self._entries[eid]
            self._remove_remote(eid)
        if len(self._entries) <= self.max_entries:
            return
        # LRU: evict the entries with the oldest last_hit_at.
        ordered = sorted(self._entries.items(), key=lambda kv: kv[1].last_hit_at)
        for eid, _ in ordered[: len(self._entries) - self.max_entries]:
            del self._entries[eid]
            self._remove_remote(eid)

    def stats(self) -> Dict[str, Any]:
        """Aggregate snapshot for the metrics endpoint (no raw embeddings)."""
        live = [e for e in self._entries.values()
                if e.registry_version == REGISTRY_VERSION]
        top = sorted(live, key=lambda e: e.hit_count, reverse=True)[:20]
        return {
            "size": len(self._entries),
            "live_entries": len(live),
            "total_hits": sum(e.hit_count for e in live),
            "top_intents": [
                {"intent": e.intent_text, "hit_count": e.hit_count} for e in top
            ],
        }


@dataclass
class _Pending:
    embedding: List[float]
    plan: Dict[str, Any]
    intent_text: str
    uids: Set[str]
    created_at: float = field(default_factory=time.time)

    def to_doc(self) -> Dict[str, Any]:
        return {
            "embedding": self.embedding,
            "plan": self.plan,
            "intent_text": self.intent_text,
            "uids": sorted(self.uids),
            "created_at": self.created_at,
        }

    @classmethod
    def from_doc(cls, d: Dict[str, Any]) -> "_Pending":
        return cls(
            embedding=list(d.get("embedding") or []),
            plan=d.get("plan") or {},
            intent_text=str(d.get("intent_text") or ""),
            uids=set(d.get("uids") or []),
            created_at=float(d.get("created_at") or time.time()),
        )


class PendingIntents:
    """24h buffer of LLM-produced plans awaiting promotion to a cache.

    An intent is promoted once PROMOTION_HITS distinct users have produced a
    semantically-matching plan (cosine >= SIMILARITY_THRESHOLD).

    Persisted to Firestore on every write (a new intent, a uid added, a
    promotion, an expiry). The distinct-user counter MUST survive Render
    restarts: held only in memory, every restart would reset progress and no
    intent that spans a restart would ever reach the threshold.
    """

    def __init__(self, collection: str):
        self.collection = collection
        self._items: Dict[str, _Pending] = {}

    def _db(self):
        try:
            from app.extensions import get_db
            return get_db()
        except Exception:
            return None

    def load(self) -> None:
        """Load the buffer from Firestore, dropping anything already expired."""
        db = self._db()
        if db is not None:
            try:
                for doc in db.collection(self.collection).stream():
                    self._items[doc.id] = _Pending.from_doc(doc.to_dict() or {})
            except Exception as e:
                print(f"[ScoutCache] load {self.collection} failed: {e}")
        self._prune()

    def _persist(self, item_id: str, item: _Pending) -> None:
        db = self._db()
        if db is None:
            return
        try:
            db.collection(self.collection).document(item_id).set(item.to_doc())
        except Exception as e:
            print(f"[ScoutCache] persist {self.collection}/{item_id} failed: {e}")

    def _remove_remote(self, item_id: str) -> None:
        db = self._db()
        if db is None:
            return
        try:
            db.collection(self.collection).document(item_id).delete()
        except Exception as e:
            print(f"[ScoutCache] delete {self.collection}/{item_id} failed: {e}")

    def _prune(self) -> None:
        cutoff = time.time() - PENDING_TTL_SECONDS
        for iid in [i for i, p in self._items.items() if p.created_at < cutoff]:
            del self._items[iid]
            self._remove_remote(iid)

    def note(
        self,
        embedding: List[float],
        plan: Dict[str, Any],
        intent_text: str,
        uid: str,
    ) -> Optional[Tuple[List[float], Dict[str, Any], str]]:
        """Record an LLM-produced intent.

        Returns (embedding, plan, intent_text) when this note pushes the intent
        to PROMOTION_HITS distinct users (the caller then adds it to the
        cache), else None. Every state change is written through to Firestore.
        """
        self._prune()
        user = uid or "anon"
        for iid, p in self._items.items():
            if cosine(embedding, p.embedding) >= SIMILARITY_THRESHOLD:
                if user in p.uids:
                    return None  # this user already counted; nothing changed
                p.uids.add(user)
                if len(p.uids) >= PROMOTION_HITS:
                    del self._items[iid]
                    self._remove_remote(iid)
                    return p.embedding, p.plan, p.intent_text
                self._persist(iid, p)  # distinct-user count advanced
                return None
        # A new intent.
        new_id = uuid.uuid4().hex
        item = _Pending(
            embedding=embedding,
            plan=plan,
            intent_text=intent_text,
            uids={user},
        )
        self._items[new_id] = item
        self._persist(new_id, item)
        return None


# Module-level singletons. load_all() is called once at app startup (wsgi.py).
navigate_cache = SemanticCache("scout_cache_navigate")
answer_cache = SemanticCache("scout_cache_answer")
pending_navigate = PendingIntents("scout_pending_navigate")
pending_answer = PendingIntents("scout_pending_answer")


def load_all() -> None:
    """Load both caches and both pending buffers from Firestore (startup)."""
    navigate_cache.load()
    answer_cache.load()
    pending_navigate.load()
    pending_answer.load()
