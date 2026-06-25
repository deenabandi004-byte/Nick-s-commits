"""
loop_jobs — RQ worker entrypoints for Loop background work.

These functions are imported by name by the RQ worker process via
rq_queue.JOB_REGISTRY. Each one is a self-contained execution unit:
loads its own Firestore client, doesn't rely on Flask request context.

Don't import this module from request handlers — go through rq_queue.enqueue
instead. That way the dev-fallback (no Redis) still works.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _write_loop_counters_with_retry(loop_ref, updates: dict, loop_id: str) -> None:
    # Two failure modes look the same as "Exception" but mean very different
    # things. NotFound = user deleted the Loop mid-cycle; counters are gone
    # for good but the cycle's contacts/jobs/drafts still saved to their own
    # subcollections. Anything else (most often grpc RemoteDisconnected on
    # the SA token refresh) is transient — one retry fixes it ~always.
    import time
    from google.api_core import exceptions as gax

    for attempt in (1, 2):
        try:
            loop_ref.update(updates)
            return
        except gax.NotFound as e:
            logger.info(
                "Loop %s deleted mid-cycle; counter update skipped "
                "(cycle results saved to subcollections). err=%s",
                loop_id, e,
            )
            return
        except Exception as e:
            if attempt == 1:
                logger.warning(
                    "Loop %s counter update attempt %d failed (will retry): %s",
                    loop_id, attempt, e,
                )
                time.sleep(0.5)
                continue
            logger.error(
                "Loop %s counter update FAILED after retry; Loop totals are "
                "stale but cycle results are persisted. Run "
                "scripts/backfill_loop_counters.py to reconcile. err=%s",
                loop_id, e,
            )
            return


def run_loop_cycle_job(uid: str, loop_id: str, cycle_id: str | None = None) -> dict:
    """RQ worker entrypoint: run one Loop cycle end-to-end.

    Steps:
      1. Load the Loop doc; bail if it's gone (deleted between enqueue and run).
      2. Build the synthetic config that the legacy _run_cycle expects.
      3. Run the cycle.
      4. Stamp the cycle doc with loopId so the activity feed can join.
      5. Atomically increment the Loop's counter fields with deltas.
      6. Flip status to 'done' (autopilot) or keep 'running' (review-first).

    Idempotency: cycles are created with a UUID, and counter writes are
    Firestore Increments — re-running this job on the same cycle_id is
    harmless on the cycle doc but WILL double-count on the Loop totals.
    RQ retries are disabled by default for that reason; if we add retries
    later we'll need a cycle-level guard.
    """
    import uuid as _uuid
    from firebase_admin import firestore as _fs
    from google.cloud.firestore_v1 import Increment

    from app.extensions import get_db
    from app.services.agent_service import DEFAULT_AGENT_CONFIG, _run_cycle
    from app.services.loop_service import (
        release_cycle_lock,
        try_claim_cycle_lock,
    )

    db = get_db()
    loop_ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    loop_doc = loop_ref.get()
    if not loop_doc.exists:
        logger.info("run_loop_cycle_job: loop=%s already deleted, skipping", loop_id)
        return {"status": "skipped", "reason": "loop_deleted"}

    # Phase 9.1 — per-Loop concurrency lock. Refuses to start a second
    # cycle when one is already running. Stale recovery handled inside
    # try_claim_cycle_lock — a crashed prior run won't strand the Loop.
    if not try_claim_cycle_lock(uid, loop_id):
        logger.info(
            "run_loop_cycle_job: loop=%s cycle already running — skipping",
            loop_id,
        )
        return {"status": "skipped", "reason": "cycle_already_running"}

    loop = loop_doc.to_dict() or {}
    bp = loop.get("briefParsed") or {}
    # Default mirrors the wizard's "both" — every Loop pursues networking +
    # job-search. Old loop_service default was "people"; new default is
    # "both" (loop_service._loop_defaults updated alongside). This fallback
    # only fires for pre-V2 docs that never persisted loopMode at all.
    loop_mode = loop.get("loopMode") or "both"
    synthetic_config = {
        **DEFAULT_AGENT_CONFIG,
        "briefText": loop.get("briefText", ""),
        "briefParsed": bp,
        "loopMode": loop_mode,
        "loopId": loop_id,
        "targetCompanies": bp.get("companies") or [],
        "targetIndustries": bp.get("industries") or [],
        "targetRoles": bp.get("roles") or [],
        "targetLocations": bp.get("locations") or [],
        "weeklyContactTarget": loop.get("weeklyTarget", 5),
        # Always autopilot — reviewBeforeSend controls send mode, not action
        # execution. See loop_service.trigger_loop_cycle for the same logic.
        "approvalMode": "autopilot",
        "reviewBeforeSend": loop.get("reviewBeforeSend", True),
        "status": "active",
        # Phase 9 — auto-send state. agent_actions._try_auto_send reads
        # these per-contact to drive can_auto_send. Pre-Phase-9 Loops
        # default to draft_only (today's behavior).
        "autoSendMode": loop.get("autoSendMode", "draft_only"),
        "autoSendApprovedCount": loop.get("autoSendApprovedCount", 0),
        # 0 = no warmup gate (shipping default). See note in
        # agent_actions._try_auto_send loop_view block.
        "autoSendApprovedAfter": loop.get("autoSendApprovedAfter", 0),
        "hardDailySendCap": loop.get("hardDailySendCap"),
    }

    if not cycle_id:
        cycle_id = str(_uuid.uuid4())

    try:
        result = _run_cycle(uid, synthetic_config, cycle_id=cycle_id)
    except Exception as cycle_err:
        # Distinguish "planner can't run" (config issue, recoverable by
        # ops) from a generic cycle crash. The planner-unavailable case
        # gets a specific pauseReason so the user sees a real status
        # instead of an ambiguous "idle".
        from app.services.agent_planner import PlannerUnavailableError

        is_planner_unavailable = isinstance(cycle_err, PlannerUnavailableError)
        logger.exception("run_loop_cycle_job: _run_cycle crashed uid=%s loop=%s", uid, loop_id)
        try:
            if is_planner_unavailable:
                loop_ref.update({
                    "status": "paused",
                    "pauseReason": "planner_unavailable",
                    "lastCycleError": _fs.DELETE_FIELD,
                })
            else:
                # Generic crash: surface via the lastCycleError banner, not
                # via pauseReason — a crashed Loop is "Errored", not "Paused".
                # Clear any stale pauseReason so the user sees one canonical
                # phase (Errored) instead of "Paused" + an unrelated reason.
                loop_ref.update({
                    "status": "idle",
                    "lastCycleError": str(cycle_err)[:300],
                    "pauseReason": _fs.DELETE_FIELD,
                })
        except Exception:
            pass

        # Also push a notification so the user actually finds out (S2.3).
        # Wrapped — if the bell write fails, the cycle's real status flip
        # above is already saved.
        #
        # NOTE: do NOT add `from datetime import datetime, timezone` here.
        # `datetime` is already imported at module scope; re-importing it
        # inside this function makes it a function-local name, which then
        # raises UnboundLocalError at the module-scope use below (line 197
        # `now_iso = datetime.now(...)`) even when this branch never runs.
        try:
            from app.services.loop_notifications import write_loop_run_notification

            failure_kind = "planner_unavailable" if is_planner_unavailable else "cycle_error"
            failure_snippet = (
                "Your Loop couldn't plan its next moves — check Settings or contact support."
                if is_planner_unavailable
                else "Your Loop hit an unexpected error mid-cycle. Try Run it now from the fleet view."
            )
            write_loop_run_notification(
                uid=uid,
                db=db,
                items=[{
                    "kind": "loop_run",
                    "failureKind": failure_kind,
                    "loopId": loop_id,
                    "cycleId": cycle_id,
                    "contactId": f"loop:{loop_id}",
                    "contactName": loop.get("name") or "Untitled Loop",
                    "loopName": loop.get("name") or "Untitled Loop",
                    "company": "",
                    "snippet": failure_snippet,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "read": False,
                }],
            )
        except Exception:
            logger.exception(
                "Failure-notification write failed (non-fatal) uid=%s loop=%s",
                uid, loop_id,
            )

        # Release the concurrency lock so the next scheduler tick can
        # actually run this Loop — without this, a crashed cycle would
        # leave cycleRunning=True until STALE_LOCK_AFTER_MINUTES elapsed.
        release_cycle_lock(uid, loop_id)
        raise

    # Stamp the cycle so the activity feed can join cycles → actions by loopId.
    try:
        db.collection("users").document(uid) \
          .collection("agent_cycles").document(cycle_id) \
          .update({"loopId": loop_id})
    except Exception:
        logger.exception("Failed to stamp loopId on cycle %s", cycle_id)

    # Mirror counters onto the Loop. Wrapped — the Loop may have been deleted
    # mid-cycle; the cycle's drafts/contacts are still saved to the tracker.
    deltas: dict = {}
    if result.get("contactsFound", 0):
        deltas["totalContactsFound"] = Increment(result["contactsFound"])
    if result.get("emailsDrafted", 0):
        deltas["totalEmailsDrafted"] = Increment(result["emailsDrafted"])
    if result.get("jobsFound", 0):
        deltas["totalJobsFound"] = Increment(result["jobsFound"])
    if result.get("hmsFound", 0):
        deltas["totalHmsContacted"] = Increment(result["hmsFound"])
    if result.get("companiesDiscovered", 0):
        deltas["totalCompaniesDiscovered"] = Increment(result["companiesDiscovered"])
    # Phase 8: roll weekly credit spend onto the Loop doc atomically so the
    # scheduler's budget gate has the right number on its next pass.
    cycle_credits = int(result.get("creditsSpent", 0) or 0)
    if cycle_credits > 0:
        deltas["weekCreditsSpent"] = Increment(cycle_credits)

    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {
        **deltas,
        "lastRunAt": now_iso,
        "status": "running" if loop.get("reviewBeforeSend", True) else "done",
        # Phase 9.1 — release the concurrency lock in the same atomic
        # write that records counters. Cheaper than a separate
        # release_cycle_lock call and guarantees the lock can't outlive
        # the cycle if the final update lands.
        "cycleRunning": False,
        "cycleStartedAt": None,
        # A clean cycle wipes any prior pause reason / error banner the user
        # might still see on the detail page. The rate-limit branch below
        # re-sets pauseReason if we're tripping the 3-strike threshold.
        "pauseReason": _fs.DELETE_FIELD,
        "lastCycleError": _fs.DELETE_FIELD,
    }

    # Rate-limit 3-strike: if THIS cycle hit a rate limit anywhere, bump the
    # streak; otherwise reset to 0. After the threshold we pause the Loop with
    # pauseReason="rate_limited". loop_budget.can_run_now also gates on the
    # field independently, so a stuck Loop can't keep rescheduling.
    from app.services.loop_budget import RATE_LIMIT_STRIKE_THRESHOLD
    if result.get("rateLimited"):
        prior = int(loop.get("consecutiveRateLimitCycles", 0) or 0)
        new_streak = prior + 1
        updates["consecutiveRateLimitCycles"] = new_streak
        if new_streak >= RATE_LIMIT_STRIKE_THRESHOLD:
            updates["status"] = "paused"
            updates["pauseReason"] = "rate_limited"
            logger.warning(
                "loop=%s paused after %d consecutive rate-limited cycles",
                loop_id, new_streak,
            )
    elif loop.get("consecutiveRateLimitCycles"):
        # Clean cycle resets the streak.
        updates["consecutiveRateLimitCycles"] = 0

    _write_loop_counters_with_retry(loop_ref, updates, loop_id)

    # Surface a single "Loop ran" notification per cycle into the user's
    # in-app bell. Independent of LOOPS_ALERT_EMAILS_ENABLED — this is the
    # in-product surface, not outbound email. Failures here never
    # propagate; the cycle's real work is already saved.
    try:
        from app.services.loop_notifications import (
            assess_cycle_results,
            write_loop_run_notification,
        )
        items = assess_cycle_results(
            loop_id=loop_id,
            loop_name=loop.get("name") or "Untitled Loop",
            cycle_id=cycle_id,
            result=result,
        )
        if items:
            write_loop_run_notification(uid=uid, items=items, db=db)
    except Exception:
        logger.exception(
            "Loop run notification failed (non-fatal) uid=%s loop=%s cycle=%s",
            uid, loop_id, cycle_id,
        )

    # Surface a single "Loop ran" notification per cycle into the user's
    # in-app bell. Independent of LOOPS_ALERT_EMAILS_ENABLED — this is the
    # in-product surface, not outbound email. Failures here never
    # propagate; the cycle's real work is already saved.
    try:
        from app.services.loop_notifications import (
            assess_cycle_results,
            write_loop_run_notification,
        )
        items = assess_cycle_results(
            loop_id=loop_id,
            loop_name=loop.get("name") or "Untitled Loop",
            cycle_id=cycle_id,
            result=result,
        )
        if items:
            write_loop_run_notification(uid=uid, items=items, db=db)
    except Exception:
        logger.exception(
            "Loop run notification failed (non-fatal) uid=%s loop=%s cycle=%s",
            uid, loop_id, cycle_id,
        )

    return {
        "status": "completed",
        "cycleId": cycle_id,
        "loopId": loop_id,
        **{k: v for k, v in result.items() if k != "contacts"},
    }
