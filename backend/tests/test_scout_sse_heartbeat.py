"""Unit tests for the Scout SSE generator's heartbeat + real-timeout behavior.

Covers the fix for the "Stream timeout" error visible in the side panel when
the LLM takes longer than 60s to emit a first token. The generator now polls
the producer queue every heartbeat_interval_s and emits SSE heartbeat frames
to keep browser/proxy SSE connections warm past their 60s idle cutoff. A real
timeout fires only after real_timeout_s of true silence.

Tests use millisecond timing constants so the suite stays fast.
"""
from __future__ import annotations

import json
import queue
import threading
import time

import pytest

from app.routes.scout_assistant import _sse_stream_from_queue


def _consume(gen, max_frames: int = 50, deadline_s: float = 5.0):
    """Drain a generator into a list of frames, with a wall-clock safety net.

    The generator is itself time-bounded; deadline_s only catches a runaway
    test, not normal operation.
    """
    frames = []
    start = time.monotonic()
    for frame in gen:
        frames.append(frame)
        if len(frames) >= max_frames:
            break
        if time.monotonic() - start > deadline_s:
            pytest.fail(f"generator did not terminate within {deadline_s}s")
    return frames


def test_passes_through_token_events_then_terminates_on_none():
    q = queue.Queue()
    q.put({"event": "token", "data": {"text": "hi"}})
    q.put({"event": "done", "data": {"message": "hello"}})
    q.put(None)

    frames = _consume(_sse_stream_from_queue(q, heartbeat_interval_s=1.0, real_timeout_s=5.0))

    assert len(frames) == 2
    assert frames[0].startswith("event: token\n")
    assert json.loads(frames[0].split("data: ")[1].strip()) == {"text": "hi"}
    assert frames[1].startswith("event: done\n")


def test_emits_heartbeat_after_idle_interval():
    """No producer events for one interval => one heartbeat frame, then a real
    token after that resets the silence counter."""
    q = queue.Queue()

    def producer():
        # Wait long enough to force one heartbeat, then deliver a token + end.
        time.sleep(0.15)
        q.put({"event": "token", "data": {"text": "delayed"}})
        q.put(None)

    threading.Thread(target=producer, daemon=True).start()

    frames = _consume(_sse_stream_from_queue(q, heartbeat_interval_s=0.05, real_timeout_s=5.0))

    heartbeats = [f for f in frames if f.startswith("event: heartbeat\n")]
    tokens = [f for f in frames if f.startswith("event: token\n")]
    assert len(heartbeats) >= 1, f"expected at least one heartbeat, got frames={frames!r}"
    assert len(tokens) == 1
    # Real-timeout error must NOT appear when the token eventually arrives.
    assert not any("Stream timeout" in f for f in frames)


def test_declares_real_timeout_after_total_silence():
    """No producer events ever => after real_timeout_s, generator yields the
    real Stream timeout error and stops."""
    q = queue.Queue()

    frames = _consume(_sse_stream_from_queue(q, heartbeat_interval_s=0.05, real_timeout_s=0.2))

    # Some heartbeats first, then exactly one error frame at the end.
    assert any(f.startswith("event: heartbeat\n") for f in frames)
    assert frames[-1].startswith("event: error\n")
    payload = json.loads(frames[-1].split("data: ")[1].strip())
    assert payload == {"message": "Stream timeout"}


def test_silence_counter_resets_when_event_arrives():
    """Heartbeats must not accumulate across event arrivals: a real event
    resets the silence counter so the next heartbeat cycle starts fresh."""
    q = queue.Queue()

    def producer():
        # Two near-real-timeout silences separated by one real event.
        time.sleep(0.15)  # >= 3 heartbeat intervals at 0.05
        q.put({"event": "token", "data": {"text": "ping"}})
        time.sleep(0.15)
        q.put(None)

    threading.Thread(target=producer, daemon=True).start()

    # real_timeout_s is comfortably larger than each individual silence period
    # (0.15) so we should NOT see a Stream timeout even though combined silence
    # exceeds it. This is the regression case for "60s combined silence kills
    # otherwise-healthy streams."
    frames = _consume(_sse_stream_from_queue(q, heartbeat_interval_s=0.05, real_timeout_s=0.2))

    assert not any("Stream timeout" in f for f in frames), \
        "silence counter must reset on each event"
    assert any(f.startswith("event: token\n") for f in frames)
