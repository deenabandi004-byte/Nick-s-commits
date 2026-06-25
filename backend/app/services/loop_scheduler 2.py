"""
loop_scheduler — hourly daemon that fires due Loop cycles.

Drops into the same shape as agent_service.run_due_agent_cycles() but reads
from the new users/{uid}/loops/{loopId} collection. The legacy daemon stays
running for users still on the singleton agent_config; eventually it can be
retired.

Per Loop, the gate logic in loop_budget.can_run_now() decides if we fire
this tick. When gated, the reason is stamped on the Loop doc so the UI can
explain the pause.

Required Firestore index for the collection-group query:
    Collection group: loops
    Fields: status (ASC), nextRunAt (ASC), __name__ (ASC)
    Query scope: Collection group
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.extensions import get_db
from app.services.loop_budget import (
    can_run_now,
    maybe_reset_week_counter,
)
from app.services.rq_queue import enqueue

logger = logging.getLogger(__name__)


def run_due_loops() -> None:
    """Scan every Loop with status='running' AND nextRunAt<=now. Gate-check
    each one; if clear, enqueue a cycle. If gated, stamp pauseReason on the
    Loop.

    Falls back to a per-user scan if the collection-group index isn't
    deployed yet.
    """
    db = get_db()
    if not db:
        logger.warning("loop_scheduler: db not available, skipping scan")
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    logger.info("loop_scheduler: scanning for due loops")

    processed = 0
    paused = 0
    errors = 0

    try:
        # Collection-group query so we touch only due Loops, not every user.
        query = (
            db.collection_group("loops")
              .where("status", "==", "running")
              .where("nextRunAt", "<=", now_iso)
        )
        due_docs = list(query.stream())
    except Exception:
        logger.exception(
            "loop_scheduler: collection_group query failed (missing index?). "
            "Falling back to full user scan."
        )
        due_docs = None

    iterator = due_docs if due_docs is not None else _legacy_full_scan(db, now_iso)

    for doc in iterator:
        try:
            # users/{uid}/loops/{loopId} — uid is the parent of the parent
            uid = doc.reference.parent.parent.id
            loop_id = doc.id
            loop = doc.to_dict() or {}

            # Phase 8: Monday reset — clear weekly counter + budget_capped
            # pause before the gate check, so a fresh week unsticks a Loop.
            reset_patch = maybe_reset_week_counter(loop, now=now)
            if reset_patch:
                doc.reference.update(reset_patch)
                loop = {**loop, **{
                    k: v for k, v in reset_patch.items() if not callable(v)
                }}

            # Pull user's tier + timezone + monthly remaining for the gate.
            user_doc = (
                db.collection("users").document(uid).get()
            )
            user_data = user_doc.to_dict() or {} if user_doc.exists else {}
            tz_name = user_data.get("timezone") or user_data.get("tz") or None
            monthly_remaining = int(user_data.get("credits", 0) or 0)

            allowed, reason = can_run_now(
                uid=uid,
                loop=loop,
                monthly_remaining_credits=monthly_remaining,
                user_timezone=tz_name,
                now=now,
            )

            if not allowed:
                # Quiet hours is a transient defer, not a state change.
                if reason == "quiet_hours":
                    continue
                # Update pauseReason + flip status when it's a real pause.
                update = {"pauseReason": reason}
                if reason in ("budget_capped", "inactivity", "credits_capped"):
                    update["status"] = "paused"
                doc.reference.update(update)
                paused += 1
                continue

            # Clear to fire. Enqueue the cycle and bump nextRunAt forward by
            # the cadence delta so we don't double-fire on the next tick
            # while this cycle is still running.
            from app.services.loop_service import cadence_delta_hours
            cadence = loop.get("cadence", "every_other_day")
            hours = cadence_delta_hours(cadence)
            if hours is not None:
                from datetime import timedelta
                next_run = (now + timedelta(hours=hours)).isoformat()
                doc.reference.update({
                    "nextRunAt": next_run,
                    "pauseReason": None,
                })

            try:
                enqueue("run_loop_cycle", uid=uid, loop_id=loop_id)
                processed += 1
            except Exception:
                logger.exception(
                    "loop_scheduler: enqueue failed uid=%s loop=%s", uid, loop_id
                )
                errors += 1
        except Exception:
            logger.exception("loop_scheduler: error processing loop doc")
            errors += 1

    logger.info(
        "loop_scheduler: scan complete. processed=%d paused=%d errors=%d",
        processed, paused, errors,
    )

    # Health doc so the watchdog can spot a stalled scheduler.
    try:
        db.collection("system").document("loop_scheduler").set({
            "lastRunAt": now.isoformat(),
            "processed": processed,
            "paused": paused,
            "errors": errors,
        })
    except Exception:
        logger.exception("loop_scheduler: failed to write health doc")


def _legacy_full_scan(db, now_iso: str):
    """Fallback when the collection-group index isn't deployed: iterate every
    user and check their loops subcollection. Slow but safe."""
    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        try:
            loops_ref = (
                db.collection("users").document(uid).collection("loops")
            )
            for loop_doc in loops_ref.stream():
                data = loop_doc.to_dict() or {}
                if data.get("status") != "running":
                    continue
                next_run = data.get("nextRunAt")
                if not next_run or str(next_run) > now_iso:
                    continue
                yield loop_doc
        except Exception:
            logger.exception("loop_scheduler: legacy scan failed for uid=%s", uid)
            continue
