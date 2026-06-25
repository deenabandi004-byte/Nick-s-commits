"""
worker.py — entrypoint for the RQ worker process on Render.

Deploy as a second Render service pointing at the same repo:
    Build:  pip install -r backend/requirements.txt
    Start:  python backend/worker.py

The worker shares Firestore credentials (GOOGLE_APPLICATION_CREDENTIALS) and
the REDIS_URL with the web service. It does NOT need any Flask app, just
Firebase + the OpenAI/Claude/PDL clients that the job functions import.

Why a separate process?
  Loop cycles take 30s-5min. Running them on the Gunicorn web workers means
  a worker recycle (deploy, OOM, scale-down) kills the cycle silently. Users
  see "Running…" forever. Pulling cycle execution into a dedicated worker
  process makes it survive everything except the worker itself crashing,
  and RQ requeues failed jobs.
"""
from __future__ import annotations

import logging
import os
import sys

# Add backend/ to sys.path so `app.*` imports resolve the same way Flask's
# wsgi.py resolves them. Running from project root: `python backend/worker.py`.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from redis import Redis
from rq import Connection, Worker

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("rq_worker")


def main() -> None:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        raise SystemExit(
            "REDIS_URL is not set. The RQ worker needs Redis to pull jobs. "
            "Add REDIS_URL to your Render service env vars."
        )

    queue_names = [os.getenv("RQ_QUEUE_NAME", "loops")]
    logger.info("Starting RQ worker on queue(s): %s", queue_names)

    # Initialize Firebase eagerly so the first job doesn't pay the cost.
    # init_firebase takes an `app` param that it doesn't actually use; pass
    # None so we don't have to construct a fake Flask app in the worker.
    try:
        from app.extensions import init_firebase, get_db
        init_firebase(None)
        get_db()  # touch the client
        logger.info("Firebase initialized in worker process")
    except Exception:
        logger.exception("Worker failed to initialize Firebase; jobs will likely fail")

    conn = Redis.from_url(redis_url)
    with Connection(conn):
        worker = Worker(queue_names)
        worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
