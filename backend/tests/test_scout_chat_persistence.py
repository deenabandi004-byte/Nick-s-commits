"""Phase 5 Stage 3: Scout chat persistence + session memory unit tests.

Mirrors the FakeDb pattern in test_scout_strategy.py / test_scout_workflow_state.py
so the three files stay shaped the same way and share intuitions.

Covers:
  - create_chat: tier-driven expires_at, active_strategy_id stamping.
  - append_message: subcollection write, parent counter and last_active_at
    bump, message-level expires_at mirroring the parent.
  - get_chat: ordered messages, message_limit windowing.
  - list_chats: Free returns at most one, Pro returns up to limit, empty list
    when none, no errors.
  - update_chat_title, set_active_strategy.
  - Session memory (service-level): a 5-turn conversation feeds turn 6.
  - Context windowing (service-level): a 30-turn conversation only ships the
    last 20 turns to the LLM; full history stays in Firestore.
  - Title auto-generation: a stubbed LLM call writes a clean title.
  - System prompt integration: the static prompt mentions chat continuity.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.scout.chat_persistence import (
    CHAT_TTL_DAYS,
    append_message,
    chat_ttl_days,
    compute_chat_expiry,
    create_chat,
    generate_title_for_first_message,
    get_chat,
    list_chats,
    normalize_tier,
    set_active_strategy,
    update_chat_title,
)


# ============================================================================
# FakeDb (same shape as test_scout_strategy.py)
# ============================================================================

class _FakeSnap:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class _FakeDoc:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    @property
    def id(self):
        return self._path[-1]

    def collection(self, name):
        return _FakeColl(self._store, self._path + (name,))

    def get(self):
        return _FakeSnap(self.id, self._store.get(self._path))

    def set(self, data):
        self._store[self._path] = dict(data)

    def delete(self):
        self._store.pop(self._path, None)


class _FakeColl:
    def __init__(self, store, path):
        self._store = store
        self._path = path

    def document(self, doc_id):
        return _FakeDoc(self._store, self._path + (doc_id,))

    def stream(self):
        out = []
        for key, data in list(self._store.items()):
            if len(key) == len(self._path) + 1 and key[:len(self._path)] == self._path:
                out.append(_FakeSnap(key[-1], data))
        return out


class FakeDb:
    def __init__(self):
        self._store = {}

    def collection(self, name):
        return _FakeColl(self._store, (name,))


@pytest.fixture
def db():
    return FakeDb()


# ============================================================================
# Pure tier mapping
# ============================================================================

def test_normalize_tier_maps_unknowns_to_free():
    assert normalize_tier("free") == "free"
    assert normalize_tier("Pro") == "pro"
    assert normalize_tier("ELITE") == "elite"
    assert normalize_tier(None) == "free"
    assert normalize_tier("enterprise") == "free"


def test_chat_ttl_days_per_tier():
    assert chat_ttl_days("free") == 1
    assert chat_ttl_days("pro") == 14
    # Elite matches Pro today; the key is held separate so a future bump is
    # a one-line change.
    assert chat_ttl_days("elite") == 14
    assert chat_ttl_days("unknown") == 1  # treated as free


def test_compute_chat_expiry():
    now = datetime(2026, 5, 24, tzinfo=timezone.utc)
    assert compute_chat_expiry("free", now) == now + timedelta(days=1)
    assert compute_chat_expiry("pro", now) == now + timedelta(days=14)
    assert compute_chat_expiry("elite", now) == now + timedelta(days=14)


# ============================================================================
# 1, 2, 3: create_chat tier TTLs
# ============================================================================

def _parent_doc(db, uid, chat_id):
    """Direct fake-db read of the parent doc, with datetimes intact."""
    snap = (db.collection("users").document(uid)
              .collection("scoutChats").document(chat_id).get())
    return snap.to_dict()


def test_create_chat_free_24h_expiry(db):
    res = create_chat("u1", "free", db=db)
    assert res["ok"] is True
    doc = _parent_doc(db, "u1", res["chat_id"])
    assert isinstance(doc["expires_at"], datetime)
    delta = doc["expires_at"] - doc["created_at"]
    assert delta == timedelta(days=1)
    assert doc["tier_when_created"] == "free"


def test_create_chat_pro_14d_expiry(db):
    res = create_chat("u1", "pro", db=db)
    assert res["ok"] is True
    doc = _parent_doc(db, "u1", res["chat_id"])
    delta = doc["expires_at"] - doc["created_at"]
    assert delta == timedelta(days=14)
    assert doc["tier_when_created"] == "pro"


def test_create_chat_elite_14d_expiry(db):
    res = create_chat("u1", "elite", db=db)
    assert res["ok"] is True
    doc = _parent_doc(db, "u1", res["chat_id"])
    delta = doc["expires_at"] - doc["created_at"]
    assert delta == timedelta(days=14)
    assert doc["tier_when_created"] == "elite"


# ============================================================================
# 4: create_chat stamps active_strategy_id
# ============================================================================

def test_create_chat_with_active_strategy_id_persists(db):
    res = create_chat("u1", "pro", active_strategy_id="strat-abc", db=db)
    assert res["ok"] is True
    doc = _parent_doc(db, "u1", res["chat_id"])
    assert doc["active_strategy_id"] == "strat-abc"
    # Default (no strategy passed): None.
    res2 = create_chat("u1", "pro", db=db)
    doc2 = _parent_doc(db, "u1", res2["chat_id"])
    assert doc2["active_strategy_id"] is None


# ============================================================================
# 5, 6: append_message writes, bumps parent, mirrors expiry
# ============================================================================

def test_append_message_writes_and_bumps_parent(db):
    created = create_chat("u1", "pro", db=db)
    chat_id = created["chat_id"]
    parent_before = _parent_doc(db, "u1", chat_id)

    res = append_message("u1", chat_id, "user", "what should I do today?", db=db)
    assert res["ok"] is True
    assert res["message_count"] == 1

    # Subcollection has the message
    msg_coll = (db.collection("users").document("u1").collection("scoutChats")
                .document(chat_id).collection("messages"))
    msgs = list(msg_coll.stream())
    assert len(msgs) == 1
    msg = msgs[0].to_dict()
    assert msg["role"] == "user"
    assert msg["content"] == "what should I do today?"
    assert msg["created_at"] is not None

    # Parent bumped
    parent_after = _parent_doc(db, "u1", chat_id)
    assert parent_after["message_count"] == 1
    assert parent_after["last_active_at"] >= parent_before["last_active_at"]


def test_append_message_expiry_matches_parent(db):
    created = create_chat("u1", "pro", db=db)
    chat_id = created["chat_id"]
    parent = _parent_doc(db, "u1", chat_id)

    append_message("u1", chat_id, "user", "hello", db=db)
    msg_coll = (db.collection("users").document("u1").collection("scoutChats")
                .document(chat_id).collection("messages"))
    msg = list(msg_coll.stream())[0].to_dict()
    assert msg["expires_at"] == parent["expires_at"]


def test_append_message_invalid_role_rejected(db):
    created = create_chat("u1", "free", db=db)
    res = append_message("u1", created["chat_id"], "system", "x", db=db)
    assert res["ok"] is False
    assert res["error"] == "invalid_role"


def test_append_message_missing_chat_returns_not_found(db):
    res = append_message("u1", "does-not-exist", "user", "x", db=db)
    assert res["ok"] is False
    assert res["error"] == "chat_not_found"


# ============================================================================
# 7, 8: get_chat returns ordered messages, respects message_limit
# ============================================================================

def test_get_chat_returns_parent_and_ordered_messages(db):
    created = create_chat("u1", "pro", db=db)
    chat_id = created["chat_id"]
    for i in range(3):
        append_message("u1", chat_id, "user" if i % 2 == 0 else "assistant",
                       f"msg {i}", db=db)

    res = get_chat("u1", chat_id, db=db)
    assert res["ok"] is True
    assert res["chat"]["chat_id"] == chat_id
    assert len(res["messages"]) == 3
    # Oldest first.
    assert [m["content"] for m in res["messages"]] == ["msg 0", "msg 1", "msg 2"]


def test_get_chat_respects_message_limit(db):
    created = create_chat("u1", "pro", db=db)
    chat_id = created["chat_id"]
    for i in range(10):
        append_message("u1", chat_id, "user", f"msg {i}", db=db)

    # Cap at 4 -> the LAST 4 messages survive, not the first 4.
    res = get_chat("u1", chat_id, message_limit=4, db=db)
    assert len(res["messages"]) == 4
    assert [m["content"] for m in res["messages"]] == ["msg 6", "msg 7", "msg 8", "msg 9"]

    # Parent doc still says 10 messages exist; only the read is windowed.
    assert res["chat"]["message_count"] == 10


# ============================================================================
# 9, 10, 11: list_chats tier gating and ordering
# ============================================================================

def test_list_chats_free_returns_at_most_one(db):
    # Create three chats; the Free cap drops it to one (the most recently
    # active). The order of stream() is dict-insertion, so we touch them
    # deliberately to control last_active_at.
    a = create_chat("u1", "free", db=db)["chat_id"]
    b = create_chat("u1", "free", db=db)["chat_id"]
    c = create_chat("u1", "free", db=db)["chat_id"]
    append_message("u1", a, "user", "x", db=db)
    append_message("u1", c, "user", "x", db=db)  # c is the most recently active

    rows = list_chats("u1", "free", db=db)
    assert len(rows) == 1
    assert rows[0]["chat_id"] == c


def test_list_chats_pro_returns_up_to_limit_ordered_desc(db):
    ids = [create_chat("u1", "pro", db=db)["chat_id"] for _ in range(5)]
    # Touch them in a non-creation order so the sort can show its work.
    for cid in [ids[2], ids[0], ids[4], ids[1], ids[3]]:
        append_message("u1", cid, "user", "x", db=db)

    rows = list_chats("u1", "pro", limit=20, db=db)
    assert len(rows) == 5
    # Last touched (ids[3]) should be first.
    assert rows[0]["chat_id"] == ids[3]
    assert rows[-1]["chat_id"] == ids[2]

    # Limit truncates.
    rows_3 = list_chats("u1", "pro", limit=3, db=db)
    assert len(rows_3) == 3
    assert [r["chat_id"] for r in rows_3] == [ids[3], ids[1], ids[4]]


def test_list_chats_pro_empty_user_returns_empty_list_no_error(db):
    rows = list_chats("u1", "pro", db=db)
    assert rows == []


# ============================================================================
# 12, 13: update_chat_title and set_active_strategy persist
# ============================================================================

def test_update_chat_title_persists(db):
    chat_id = create_chat("u1", "pro", db=db)["chat_id"]
    res = update_chat_title("u1", chat_id, "Land an SWE internship at Stripe", db=db)
    assert res["ok"] is True
    doc = _parent_doc(db, "u1", chat_id)
    assert doc["title"] == "Land an SWE internship at Stripe"


def test_update_chat_title_strips_em_dash_and_caps_length(db):
    em = chr(0x2014)
    chat_id = create_chat("u1", "pro", db=db)["chat_id"]
    update_chat_title("u1", chat_id, f"break in {em} consulting", db=db)
    doc = _parent_doc(db, "u1", chat_id)
    assert em not in doc["title"]
    # Cap.
    long_title = "x" * 200
    update_chat_title("u1", chat_id, long_title, db=db)
    assert len(_parent_doc(db, "u1", chat_id)["title"]) <= 60


def test_set_active_strategy_persists(db):
    chat_id = create_chat("u1", "pro", db=db)["chat_id"]
    res = set_active_strategy("u1", chat_id, "strat-xyz", db=db)
    assert res["ok"] is True
    assert _parent_doc(db, "u1", chat_id)["active_strategy_id"] == "strat-xyz"

    # Clearing (the strategy was closed).
    set_active_strategy("u1", chat_id, None, db=db)
    assert _parent_doc(db, "u1", chat_id)["active_strategy_id"] is None


# ============================================================================
# 16: title auto-generation
# ============================================================================

class _StubLLMResponse:
    def __init__(self, content):
        choice = type("C", (), {"message": type("M", (), {"content": content})()})()
        self.choices = [choice]


class _StubLLMClient:
    """Mimics the shape openai_client returns. Sync-only because
    generate_title_for_first_message itself is sync (the service wraps it for
    async use)."""
    def __init__(self, content):
        self._content = content
        self.calls = []
        outer = self

        class _Completions:
            def create(self_inner, **kwargs):
                outer.calls.append(kwargs)
                return _StubLLMResponse(outer._content)

        class _Chat:
            completions = _Completions()

        self.chat = _Chat()


def test_generate_title_uses_stubbed_llm_and_cleans_output():
    stub = _StubLLMClient(
        content='"Breaking into Stripe PM ' + chr(0x2014) + ' fall 2026."'
    )
    title = generate_title_for_first_message(
        "I want to break into Stripe PM for fall 2026 recruiting.",
        llm_client=stub,
    )
    # Quotes stripped, em dash removed, trailing period removed.
    assert title.startswith("Breaking into Stripe PM")
    assert chr(0x2014) not in title
    assert not title.endswith(".")
    assert not title.startswith('"')
    assert len(stub.calls) == 1


def test_generate_title_trivial_message_skips_llm():
    stub = _StubLLMClient(content="ignored")
    # "hi" is trivial -> never calls the LLM, returns the message as title.
    title = generate_title_for_first_message("hi", llm_client=stub)
    assert title == "hi"
    assert stub.calls == []


def test_generate_title_falls_back_when_llm_raises():
    class _Raising:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    raise RuntimeError("API down")
    title = generate_title_for_first_message(
        "Land a banking SA role at Goldman", llm_client=_Raising(),
    )
    # Truncation fallback: the message itself (under 60 chars here).
    assert title == "Land a banking SA role at Goldman"


def test_generate_title_no_llm_client_truncates():
    title = generate_title_for_first_message(
        "x" * 200, llm_client=None,
    )
    assert len(title) <= 60
    assert title.endswith("...")


# ============================================================================
# 14, 15: service-level session memory and context windowing
# ============================================================================

@pytest.mark.asyncio
async def test_session_memory_loads_prior_turns_for_next_turn(db, monkeypatch):
    """Five turns persist; the next call to _load_history_window returns all
    five (the just-appended user message at the tail is dropped because the
    current message differs)."""
    from app.services.scout_assistant_service import ScoutAssistantService
    import app.services.scout.chat_persistence as cp_module

    # Patch the module's _db() so the persistence layer uses our FakeDb. This
    # is how the service reaches into Firestore behind the scenes.
    monkeypatch.setattr(cp_module, "_db", lambda: db)

    chat_id = create_chat("u1", "pro", db=db)["chat_id"]
    for i in range(5):
        role = "user" if i % 2 == 0 else "assistant"
        append_message("u1", chat_id, role, f"turn {i}", db=db)

    svc = ScoutAssistantService()
    history = await svc._load_history_window(
        uid="u1", chat_id=chat_id,
        current_user_message="turn 6 from the user",
    )
    # All five prior turns make it into the window; the tail filter only
    # fires when the last persisted user message matches the current one.
    assert len(history) == 5
    assert [m["content"] for m in history] == [f"turn {i}" for i in range(5)]


@pytest.mark.asyncio
async def test_session_memory_drops_just_appended_user_message_tail(db, monkeypatch):
    """The service appends the user message BEFORE building context. When
    that exact message lands at the tail of the loaded history, the windowing
    drops it so the caller can re-add it with the live-context block attached.
    """
    from app.services.scout_assistant_service import ScoutAssistantService
    import app.services.scout.chat_persistence as cp_module

    monkeypatch.setattr(cp_module, "_db", lambda: db)

    chat_id = create_chat("u1", "pro", db=db)["chat_id"]
    append_message("u1", chat_id, "user", "earlier question", db=db)
    append_message("u1", chat_id, "assistant", "earlier answer", db=db)
    # Simulate the just-appended user turn.
    append_message("u1", chat_id, "user", "what about Bain?", db=db)

    svc = ScoutAssistantService()
    history = await svc._load_history_window(
        uid="u1", chat_id=chat_id,
        current_user_message="what about Bain?",
    )
    # The tail user message gets dropped; only the two prior turns remain.
    assert [m["content"] for m in history] == ["earlier question", "earlier answer"]


@pytest.mark.asyncio
async def test_context_windowing_caps_at_20_messages(db, monkeypatch):
    """A 30-turn conversation persists in full; only the last 20 ride into the
    LLM context."""
    from app.services.scout_assistant_service import ScoutAssistantService
    import app.services.scout.chat_persistence as cp_module

    monkeypatch.setattr(cp_module, "_db", lambda: db)

    chat_id = create_chat("u1", "pro", db=db)["chat_id"]
    for i in range(30):
        role = "user" if i % 2 == 0 else "assistant"
        append_message("u1", chat_id, role, f"turn {i}", db=db)

    svc = ScoutAssistantService()
    history = await svc._load_history_window(
        uid="u1", chat_id=chat_id,
        current_user_message="turn 30 from the user",
    )
    assert svc.CONTEXT_MESSAGE_CAP == 20
    assert len(history) == 20
    # Oldest in the window is turn 10 (30 - 20).
    assert history[0]["content"] == "turn 10"
    assert history[-1]["content"] == "turn 29"

    # The full history is still in Firestore; the read just windows it.
    full = get_chat("u1", chat_id, db=db)
    assert full["chat"]["message_count"] == 30


@pytest.mark.asyncio
async def test_context_windowing_token_cap_caps_when_messages_are_huge(db, monkeypatch):
    """A small number of long messages can exceed the token cap before the
    message cap fires; the older ones drop first."""
    from app.services.scout_assistant_service import ScoutAssistantService
    import app.services.scout.chat_persistence as cp_module

    monkeypatch.setattr(cp_module, "_db", lambda: db)

    chat_id = create_chat("u1", "pro", db=db)["chat_id"]
    # Each message is ~4000 chars -> ~1000 tokens each. CONTEXT_TOKEN_CAP is
    # 8000, so roughly 8 messages should fit before the cap fires.
    big = "x" * 4000
    for i in range(15):
        role = "user" if i % 2 == 0 else "assistant"
        append_message("u1", chat_id, role, f"{big}{i}", db=db)

    svc = ScoutAssistantService()
    history = await svc._load_history_window(
        uid="u1", chat_id=chat_id,
        current_user_message="next user message",
    )
    # Token cap fires before the 20-message cap.
    assert len(history) < svc.CONTEXT_MESSAGE_CAP
    # And the kept window is from the tail end (newest), not the head.
    assert history[-1]["content"].endswith("14")


# ============================================================================
# System prompt integration: the static prompt acknowledges chat continuity
# ============================================================================

def test_system_prompt_mentions_chat_continuity():
    """Phase 5 Stage 3 added a ## Chat continuity section to the static
    prompt. No specific wording is required; we just need some signal that
    the prompt is aware past turns exist in the current chat."""
    from app.services.scout_assistant_service import _build_static_system_prompt

    prompt = _build_static_system_prompt().lower()
    assert "chat continuity" in prompt
    # And references some notion of the recent / prior conversation.
    assert ("recent conversation" in prompt
            or "conversation history" in prompt
            or "past turns" in prompt
            or "earlier turn" in prompt)
    # And mentions the sidebar surface (the Pro/Elite affordance).
    assert "sidebar" in prompt
