"""
rq_queue — durable background jobs for Loop cycles.

Design:
  - In prod (REDIS_URL set), enqueue jobs onto an RQ queue; a separate Render
    service runs `rq worker loops` to actually execute them.
  - In dev/local (no REDIS_URL), fall back to running the job in a daemon
    thread on the same process — same shape, just no durability. Lets
    developers run the app without Redis installed.

The fallback path is identical to what loop_service.trigger_loop_cycle was
doing before this module existed. The win is purely operational: under
Gunicorn worker recycling, the RQ worker survives because it's a separate
process. Lost-cycle bug goes away.

Use:
    from app.services.rq_queue import enqueue
    enqueue("run_loop_cycle", uid=uid, loop_id=loop_id)

Naming note: this file is rq_queue.py (not job_queue.py) because the latter
is already used for the Firestore-backed analysis job tracker.
"""
from __future__ import annotations

import importlib
import logging
import os
import threading
from typing import Any, Callable

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL")
QUEUE_NAME = os.getenv("RQ_QUEUE_NAME", "loops")
JOB_TIMEOUT_SECONDS = int(os.getenv("LOOP_JOB_TIMEOUT", "900"))  # 15 min ceiling


# ── RQ-backed path (prod) ───────────────────────────────────────────────────

_rq_queue = None
_rq_initialized = False
_rq_available = False


def _init_rq() -> bool:
    """Lazy-init the RQ client. Returns True if RQ is usable.

    Imports are inside the function so the dev fallback doesn't require the
    rq/redis packages to be importable at module load time.
    """
    global _rq_queue, _rq_initialized, _rq_available
    if _rq_initialized:
        return _rq_available
    _rq_initialized = True
    if not REDIS_URL:
        _rq_available = False
        return False
    try:
        from redis import Redis
        from rq import Queue

        conn = Redis.from_url(REDIS_URL)
        # Touch the server so we fail loudly here, not later inside a worker.
        conn.ping()
        _rq_queue = Queue(QUEUE_NAME, connection=conn, default_timeout=JOB_TIMEOUT_SECONDS)
        _rq_available = True
        logger.info("rq_queue: RQ ready (queue=%s)", QUEUE_NAME)
    except Exception:
        logger.exception("rq_queue: failed to initialize RQ; falling back to threads")
        _rq_available = False
    return _rq_available


# ── Dispatch table ──────────────────────────────────────────────────────────
#
# RQ enqueues by importable string ("module.function"). We keep a small
# registry here so callers don't have to know the exact import path of
# every job function — they say "run_loop_cycle" and the registry handles
# the mapping. Top-level jobs MUST live at importable module paths (no
# closures or lambdas) because RQ pickles the reference.

JOB_REGISTRY: dict[str, str] = {
    "run_loop_cycle": "app.services.loop_jobs.run_loop_cycle_job",
}


def enqueue(job_name: str, **kwargs: Any) -> str:
    """Enqueue a named job. Returns the RQ job id (or a synthetic dev id).

    The job function is resolved by name through JOB_REGISTRY so callers
    don't have to import worker code from request handlers.
    """
    if job_name not in JOB_REGISTRY:
        raise ValueError(f"unknown job: {job_name}")
    dotted = JOB_REGISTRY[job_name]

    if _init_rq() and _rq_queue is not None:
        job = _rq_queue.enqueue(dotted, kwargs=kwargs, job_timeout=JOB_TIMEOUT_SECONDS)
        logger.info("rq_queue: enqueued %s job=%s", job_name, job.id)
        return job.id

    # Dev fallback — run in a daemon thread on this process. Not durable,
    # but lets devs work without Redis installed.
    target = _resolve_dotted(dotted)
    t = threading.Thread(
        target=_safe_call,
        args=(target, kwargs),
        daemon=True,
        name=f"job-{job_name}",
    )
    t.start()
    synthetic_id = f"dev-{job_name}-{id(t)}"
    logger.info("rq_queue: ran %s in-process (no REDIS_URL) thread=%s", job_name, synthetic_id)
    return synthetic_id


def _resolve_dotted(dotted: str) -> Callable[..., Any]:
    """Import a dotted module.function string and return the callable."""
    module_path, func_name = dotted.rsplit(".", 1)
    module = importlib.import_module(module_path)
    return getattr(module, func_name)


def _safe_call(target: Callable[..., Any], kwargs: dict) -> None:
    try:
        target(**kwargs)
    except Exception:
        logger.exception("rq_queue: background job crashed: %s", target.__name__)


# ── Health / introspection ──────────────────────────────────────────────────


def is_durable() -> bool:
    """True if we're using RQ + Redis (durable). False = thread fallback."""
    return _init_rq()


def queue_info() -> dict:
    """Returns basic queue stats for /api/admin or a health endpoint."""
    if not _init_rq() or _rq_queue is None:
        return {"durable": False, "backend": "thread"}
    return {
        "durable": True,
        "backend": "rq",
        "queue": QUEUE_NAME,
        "size": _rq_queue.count,
    }
