"""
Agent Service - core orchestration for the autonomous networking agent.

Responsibilities:
  - Agent config CRUD (Firestore at users/{uid}/settings/agent_config)
  - run_due_agent_cycles(): scanned by daemon, runs cycles where nextCycleAt <= now
  - Per-user cycle execution with real action dispatching
  - Queue auto-pause/unpause when agent is deployed/stopped
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta

from app.extensions import get_db

logger = logging.getLogger(__name__)

# ── Hard caps (guardrails) ─────────────────────────────────────────────────
MAX_CONTACTS_PER_WEEK = 15
MAX_CREDITS_PER_WEEK = 150
MIN_CREDIT_BALANCE = 20

# ── Default config ─────────────────────────────────────────────────────────
DEFAULT_AGENT_CONFIG = {
    "targetCompanies": [],
    "targetIndustries": [],
    "targetRoles": [],
    "targetLocations": [],
    "preferAlumni": True,
    "weeklyContactTarget": 5,
    "creditBudgetPerWeek": 100,
    "approvalMode": "review_first",
    "sendMode": "drafts_only",
    "autoSendUnlocked": False,
    "emailTemplatePurpose": None,
    "emailStylePreset": None,
    "customInstructions": "",
    "signoffPhrase": "",
    "signatureBlock": "",
    "followUpEnabled": True,
    "followUpDays": 7,
    "maxFollowUps": 2,
    "blocklist": {"companies": [], "titles": [], "emails": []},
    "status": "setup",
    "deployedAt": None,
    "pausedAt": None,
    "lastCycleAt": None,
    "nextCycleAt": None,
    "totalContactsFound": 0,
    "totalEmailsDrafted": 0,
    "totalRepliesReceived": 0,
    "totalJobsFound": 0,
    "totalHmsContacted": 0,
    "totalCompaniesDiscovered": 0,
    "queuePausedByAgent": False,
    "enableJobDiscovery": True,
    "enableHiringManagers": True,
    "enableCompanyDiscovery": True,
}

MUTABLE_CONFIG_FIELDS = {
    "targetCompanies", "targetIndustries", "targetRoles", "targetLocations",
    "preferAlumni", "weeklyContactTarget", "creditBudgetPerWeek",
    "approvalMode", "sendMode", "autoSendUnlocked",
    "emailTemplatePurpose", "emailStylePreset",
    "customInstructions", "signoffPhrase", "signatureBlock",
    "followUpEnabled", "followUpDays", "maxFollowUps", "blocklist",
    "enableJobDiscovery", "enableHiringManagers", "enableCompanyDiscovery",
}


def get_agent_config(uid: str) -> dict:
    db = get_db()
    doc = db.collection("users").document(uid) \
            .collection("settings").document("agent_config").get()
    if doc.exists:
        return doc.to_dict()
    return dict(DEFAULT_AGENT_CONFIG)


def update_agent_config(uid: str, updates: dict) -> dict:
    db = get_db()
    filtered = {k: v for k, v in updates.items() if k in MUTABLE_CONFIG_FIELDS}
    if not filtered:
        return get_agent_config(uid)

    # Enforce hard caps
    if "weeklyContactTarget" in filtered:
        filtered["weeklyContactTarget"] = min(
            max(int(filtered["weeklyContactTarget"]), 1),
            MAX_CONTACTS_PER_WEEK,
        )
    if "creditBudgetPerWeek" in filtered:
        filtered["creditBudgetPerWeek"] = min(
            max(int(filtered["creditBudgetPerWeek"]), 10),
            MAX_CREDITS_PER_WEEK,
        )

    ref = db.collection("users").document(uid) \
            .collection("settings").document("agent_config")
    doc = ref.get()
    if doc.exists:
        ref.update(filtered)
    else:
        ref.set({**DEFAULT_AGENT_CONFIG, **filtered})

    return get_agent_config(uid)


def deploy_agent(uid: str) -> dict:
    db = get_db()
    config = get_agent_config(uid)

    if not config.get("targetCompanies") and not config.get("targetIndustries"):
        raise ValueError("Agent requires at least one target company or industry")

    now = datetime.now(timezone.utc).isoformat()
    first_cycle = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    deploy_updates = {
        "status": "active",
        "deployedAt": now,
        "pausedAt": None,
        "nextCycleAt": first_cycle,
    }

    ref = db.collection("users").document(uid) \
            .collection("settings").document("agent_config")
    doc = ref.get()
    if doc.exists:
        ref.update(deploy_updates)
    else:
        ref.set({**DEFAULT_AGENT_CONFIG, **deploy_updates})

    # Auto-pause the weekly queue
    _pause_weekly_queue(uid, db)

    return get_agent_config(uid)


def pause_agent(uid: str) -> dict:
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    ref = db.collection("users").document(uid) \
            .collection("settings").document("agent_config")
    ref.update({
        "status": "paused",
        "pausedAt": now,
        "nextCycleAt": None,
    })
    return get_agent_config(uid)


def stop_agent(uid: str) -> dict:
    db = get_db()
    ref = db.collection("users").document(uid) \
            .collection("settings").document("agent_config")
    ref.update({
        "status": "stopped",
        "pausedAt": None,
        "nextCycleAt": None,
    })

    # Unpause the weekly queue if we paused it
    config = get_agent_config(uid)
    if config.get("queuePausedByAgent"):
        _unpause_weekly_queue(uid, db)
        ref.update({"queuePausedByAgent": False})

    return get_agent_config(uid)


def get_agent_activity(uid: str, limit: int = 20, offset: int = 0) -> list[dict]:
    db = get_db()
    query = (
        db.collection("users").document(uid)
          .collection("agent_actions")
          .order_by("createdAt", direction="DESCENDING")
          .limit(limit)
          .offset(offset)
    )
    return [{"id": doc.id, **doc.to_dict()} for doc in query.stream()]


def get_agent_stats(uid: str) -> dict:
    db = get_db()
    config = get_agent_config(uid)
    week_start = _get_week_start()

    # Weekly metrics: contacts found by agent this week
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    contacts_this_week = 0
    replies_this_week = 0
    pending_drafts = 0
    unread_replies = 0

    for doc in contacts_ref.where("source", "==", "agent").stream():
        data = doc.to_dict() or {}
        created = data.get("createdAt", "")
        if isinstance(created, str) and created >= week_start:
            contacts_this_week += 1
        if data.get("pipelineStage") == "draft_created":
            pending_drafts += 1
        if data.get("hasUnreadReply"):
            unread_replies += 1
            if isinstance(created, str) and created >= week_start:
                replies_this_week += 1

    # Weekly credits: sum from agent_actions this week
    credits_this_week = 0
    actions_ref = db.collection("users").document(uid).collection("agent_actions")
    for doc in actions_ref.where("status", "==", "completed").stream():
        data = doc.to_dict() or {}
        created = data.get("createdAt", "")
        if isinstance(created, str) and created >= week_start:
            credits_this_week += data.get("creditsSpent", 0)

    # Pending approvals count
    pending_approvals = 0
    for _ in actions_ref.where("status", "==", "pending_approval").stream():
        pending_approvals += 1

    return {
        "status": config.get("status", "setup"),
        "totalContactsFound": config.get("totalContactsFound", 0),
        "totalEmailsDrafted": config.get("totalEmailsDrafted", 0),
        "totalRepliesReceived": config.get("totalRepliesReceived", 0),
        "totalJobsFound": config.get("totalJobsFound", 0),
        "totalHmsContacted": config.get("totalHmsContacted", 0),
        "totalCompaniesDiscovered": config.get("totalCompaniesDiscovered", 0),
        "lastCycleAt": config.get("lastCycleAt"),
        "nextCycleAt": config.get("nextCycleAt"),
        "weeklyContactTarget": config.get("weeklyContactTarget", 5),
        "creditBudgetPerWeek": config.get("creditBudgetPerWeek", 100),
        # Weekly progress
        "contactsThisWeek": contacts_this_week,
        "creditsSpentThisWeek": credits_this_week,
        "repliesThisWeek": replies_this_week,
        # Attention counts
        "pendingDrafts": pending_drafts,
        "unreadReplies": unread_replies,
        "pendingApprovals": pending_approvals,
    }


def get_pending_approvals(uid: str) -> list[dict]:
    db = get_db()
    query = (
        db.collection("users").document(uid)
          .collection("agent_actions")
          .where("status", "==", "pending_approval")
    )
    results = [{"id": doc.id, **doc.to_dict()} for doc in query.stream()]
    results.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    return results


def approve_action(uid: str, action_id: str) -> dict:
    db = get_db()
    ref = db.collection("users").document(uid) \
            .collection("agent_actions").document(action_id)
    doc = ref.get()
    if not doc.exists:
        raise ValueError("Action not found")
    data = doc.to_dict()
    if data.get("status") != "pending_approval":
        raise ValueError(f"Action is not pending approval (status: {data.get('status')})")

    # Load user data and config for execution
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() or {} if user_doc.exists else {}
    config = get_agent_config(uid)

    # Execute the action
    action_dict = data.get("params") or {}
    action_dict["cycleId"] = data.get("cycleId", "")
    try:
        result = _execute_single_action(uid, action_dict, config, user_data)
        now = datetime.now(timezone.utc).isoformat()
        ref.update({
            "status": "completed",
            "completedAt": now,
            "result": result,
            "creditsSpent": result.get("creditsSpent", 0),
        })

        # Update config totals
        from google.cloud.firestore_v1 import Increment
        config_ref = (
            db.collection("users").document(uid)
              .collection("settings").document("agent_config")
        )
        increments = {}
        if result.get("contactsFound", 0) > 0:
            increments["totalContactsFound"] = Increment(result["contactsFound"])
        if result.get("emailsDrafted", 0) > 0:
            increments["totalEmailsDrafted"] = Increment(result["emailsDrafted"])
        if result.get("jobsFound", 0) > 0:
            increments["totalJobsFound"] = Increment(result["jobsFound"])
        if result.get("hmsFound", 0) > 0:
            increments["totalHmsContacted"] = Increment(result["hmsFound"])
        if result.get("companiesDiscovered", 0) > 0:
            increments["totalCompaniesDiscovered"] = Increment(result["companiesDiscovered"])
        if increments:
            config_ref.update(increments)

    except Exception as e:
        logger.exception("Approved action execution failed: %s", e)
        now = datetime.now(timezone.utc).isoformat()
        ref.update({
            "status": "execution_failed",
            "completedAt": now,
            "result": {"error": str(e)},
        })

    # Decrement pendingApprovals on config (D6 sidebar badge)
    from google.cloud.firestore_v1 import Increment
    config_ref = (
        db.collection("users").document(uid)
          .collection("settings").document("agent_config")
    )
    config_ref.update({"pendingApprovals": Increment(-1)})

    return {"id": action_id, **ref.get().to_dict()}


def reject_action(uid: str, action_id: str) -> dict:
    db = get_db()
    ref = db.collection("users").document(uid) \
            .collection("agent_actions").document(action_id)
    doc = ref.get()
    if not doc.exists:
        raise ValueError("Action not found")
    data = doc.to_dict()
    if data.get("status") != "pending_approval":
        raise ValueError(f"Action is not pending approval (status: {data.get('status')})")

    now = datetime.now(timezone.utc).isoformat()
    ref.update({"status": "rejected", "completedAt": now})

    # Decrement pendingApprovals on config (D6 sidebar badge)
    from google.cloud.firestore_v1 import Increment
    config_ref = (
        db.collection("users").document(uid)
          .collection("settings").document("agent_config")
    )
    config_ref.update({"pendingApprovals": Increment(-1)})

    return {"id": action_id, **ref.get().to_dict()}


def get_agent_cycles(uid: str, limit: int = 10) -> list[dict]:
    db = get_db()
    query = (
        db.collection("users").document(uid)
          .collection("agent_cycles")
          .order_by("startedAt", direction="DESCENDING")
          .limit(limit)
    )
    return [{"id": doc.id, **doc.to_dict()} for doc in query.stream()]


def get_agent_jobs(uid: str, limit: int = 20, offset: int = 0) -> list[dict]:
    db = get_db()
    query = (
        db.collection("users").document(uid)
          .collection("agent_jobs")
          .order_by("createdAt", direction="DESCENDING")
          .limit(limit)
          .offset(offset)
    )
    return [{"id": doc.id, **doc.to_dict()} for doc in query.stream()]


def update_agent_job_status(uid: str, job_id: str, status: str) -> dict:
    if status not in ("new", "reviewed", "applied", "skipped"):
        raise ValueError(f"Invalid job status: {status}")
    db = get_db()
    ref = db.collection("users").document(uid).collection("agent_jobs").document(job_id)
    doc = ref.get()
    if not doc.exists:
        raise ValueError("Job not found")
    ref.update({"status": status})
    return {"id": job_id, **ref.get().to_dict()}


def get_agent_companies(uid: str, limit: int = 20) -> list[dict]:
    db = get_db()
    query = (
        db.collection("users").document(uid)
          .collection("agent_companies")
          .order_by("createdAt", direction="DESCENDING")
          .limit(limit)
    )
    return [{"id": doc.id, **doc.to_dict()} for doc in query.stream()]


def trigger_cycle_background(uid: str, app) -> str:
    """Trigger an agent cycle in a background thread. Returns cycle_id for polling."""
    import threading

    config = get_agent_config(uid)
    if config.get("status") not in ("active", "paused", "setup"):
        raise ValueError("Agent must be active or paused to trigger a cycle")

    cycle_id = str(uuid.uuid4())

    def _run():
        with app.app_context():
            try:
                _run_cycle(uid, config, cycle_id=cycle_id)
            except Exception:
                logger.exception("Background cycle failed for uid=%s", uid)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return cycle_id


def get_cycle_status(uid: str, cycle_id: str) -> dict | None:
    """Poll the status of a running cycle."""
    db = get_db()
    doc = (
        db.collection("users").document(uid)
          .collection("agent_cycles").document(cycle_id).get()
    )
    if not doc.exists:
        return None
    return {"id": doc.id, **doc.to_dict()}


# ── Daemon entry point ────────────────────────────────────────────────────

def run_due_agent_cycles():
    """Called by the agent daemon every hour. Finds active agents with due cycles."""
    db = get_db()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    logger.info("Agent daemon: scanning for due cycles")

    processed = 0
    errors = 0

    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        try:
            config_ref = (
                db.collection("users").document(uid)
                  .collection("settings").document("agent_config")
            )
            config_doc = config_ref.get()
            if not config_doc.exists:
                continue

            config = config_doc.to_dict()
            if config.get("status") != "active":
                continue
            if config.get("cycleRunning"):
                continue

            next_cycle = config.get("nextCycleAt")
            if not next_cycle:
                continue

            if next_cycle <= now_iso:
                logger.info("Agent daemon: running cycle for uid=%s", uid)
                try:
                    _run_cycle(uid, config)
                    processed += 1
                except Exception:
                    logger.exception("Agent cycle failed for uid=%s", uid)
                    errors += 1

        except Exception:
            logger.exception("Agent daemon: error checking uid=%s", uid)
            errors += 1

    logger.info(
        "Agent daemon: scan complete. processed=%d errors=%d", processed, errors
    )

    # Write health doc
    try:
        db.collection("system").document("agent_daemon").set({
            "lastSuccessAt": now.isoformat().replace("+00:00", "Z"),
            "processedUsers": processed,
            "errors": errors,
        })
    except Exception:
        logger.exception("Failed to write agent daemon health doc")


# ── Daily email digest (D7) ───────────────────────────────────────────────

def send_daily_digests():
    """Scan active agent users, send daily digest via their Gmail."""
    db = get_db()
    now = datetime.now(timezone.utc)
    logger.info("Agent digest: starting scan")

    sent = 0
    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        try:
            config = get_agent_config(uid)
            if config.get("status") != "active":
                continue
            if config.get("digestEnabled") is False:
                continue

            # Skip if digest sent in last 20 hours
            last_digest = config.get("lastDigestAt")
            if last_digest:
                try:
                    last_dt = datetime.fromisoformat(last_digest.replace("Z", "+00:00"))
                    if (now - last_dt).total_seconds() < 72000:
                        continue
                except (TypeError, ValueError):
                    pass

            # Check Gmail OAuth exists
            gmail_doc = db.collection("users").document(uid) \
                .collection("integrations").document("gmail").get()
            if not gmail_doc.exists:
                continue

            # Gather last 24h stats from cycles
            yesterday = (now - timedelta(hours=24)).isoformat()
            cycles = db.collection("users").document(uid) \
                .collection("agent_cycles") \
                .where("completedAt", ">=", yesterday).stream()

            stats = {"contacts": 0, "drafts": 0, "jobs": 0, "companies": 0}
            for c in cycles:
                r = (c.to_dict() or {}).get("results", {})
                stats["contacts"] += r.get("contactsFound", 0)
                stats["drafts"] += r.get("emailsDrafted", 0)
                stats["jobs"] += r.get("jobsFound", 0)
                stats["companies"] += r.get("companiesDiscovered", 0)

            if all(v == 0 for v in stats.values()):
                continue

            subject = f"[Offerloop Agent] {stats['contacts']} contacts, {stats['drafts']} drafts ready"
            body = _build_digest_html(stats)
            user_email = (user_doc.to_dict() or {}).get("email", "")
            if not user_email:
                continue

            from app.services.gmail_client import send_email_for_user
            send_email_for_user(uid, to=user_email, subject=subject, body_html=body)

            # Mark digest sent
            db.collection("users").document(uid) \
                .collection("settings").document("agent_config") \
                .update({"lastDigestAt": now.isoformat()})
            sent += 1

        except Exception as e:
            logger.warning("Agent digest failed uid=%s: %s", uid, e)
            continue

    logger.info("Agent digest: complete, sent=%d", sent)


def _build_digest_html(stats: dict) -> str:
    """Simple HTML email for the daily digest."""
    lines = []
    if stats["contacts"] > 0:
        lines.append(f"Found <strong>{stats['contacts']}</strong> new contact{'s' if stats['contacts'] != 1 else ''}")
    if stats["drafts"] > 0:
        lines.append(f"Drafted <strong>{stats['drafts']}</strong> email{'s' if stats['drafts'] != 1 else ''} (ready for your review)")
    if stats["jobs"] > 0:
        lines.append(f"Discovered <strong>{stats['jobs']}</strong> matching job{'s' if stats['jobs'] != 1 else ''}")
    if stats["companies"] > 0:
        lines.append(f"Found <strong>{stats['companies']}</strong> new compan{'ies' if stats['companies'] != 1 else 'y'} to explore")

    bullet_html = "".join(f"<li style='margin-bottom:6px;'>{l}</li>" for l in lines)

    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 15px; color: #1a1a2e; margin-bottom: 16px;">
        Your networking agent was busy yesterday.
      </p>
      <ul style="font-size: 14px; color: #374151; padding-left: 20px; margin-bottom: 20px;">
        {bullet_html}
      </ul>
      <a href="https://offerloop.ai/agent"
         style="display: inline-block; background: #0F172A; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500;">
        Review in Offerloop &rarr;
      </a>
      <p style="font-size: 11px; color: #9ca3af; margin-top: 24px;">
        This email was sent by your Offerloop agent using your Gmail account.
        You can disable digests in Agent settings.
      </p>
    </div>
    """


# ── Follow-up daemon ──────────────────────────────────────────────────────

def run_followup_scan():
    """Scan for active agents with stale outreach and queue follow-up actions."""
    db = get_db()
    now = datetime.now(timezone.utc)
    logger.info("Agent followup scan: starting")

    processed = 0
    for user_doc in db.collection("users").stream():
        uid = user_doc.id
        try:
            config_doc = (
                db.collection("users").document(uid)
                  .collection("settings").document("agent_config").get()
            )
            if not config_doc.exists:
                continue
            config = config_doc.to_dict()
            if config.get("status") != "active":
                continue
            if not config.get("followUpEnabled", True):
                continue

            follow_up_days = config.get("followUpDays", 7)
            cutoff = now - timedelta(days=follow_up_days)
            cutoff_iso = cutoff.isoformat().replace("+00:00", "Z")

            # Find contacts with emails sent before cutoff and no nudge
            contacts_ref = db.collection("users").document(uid).collection("contacts")
            eligible = []
            for doc in contacts_ref.where("source", "==", "agent").stream():
                data = doc.to_dict() or {}
                if data.get("lastNudgeAt"):
                    continue
                sent_at = data.get("emailGeneratedAt") or data.get("emailSentAt")
                if not sent_at:
                    continue
                if isinstance(sent_at, str) and sent_at <= cutoff_iso:
                    eligible.append(doc.id)

            if eligible:
                # Trigger a follow-up cycle
                from app.services.agent_actions import execute_follow_up
                user_data = db.collection("users").document(uid).get().to_dict() or {}
                action = {
                    "action": "follow_up",
                    "contact_ids": eligible[:5],
                    "reason": "Automated follow-up scan",
                    "cycleId": f"followup-{uuid.uuid4()}",
                }
                result = execute_follow_up(uid, action, config, user_data)
                if result.get("followUpsSent", 0) > 0:
                    processed += 1
                    logger.info("Agent followup: uid=%s sent %d nudges", uid, result["followUpsSent"])

        except Exception:
            logger.exception("Agent followup scan error uid=%s", uid)

    logger.info("Agent followup scan: complete, processed=%d", processed)


# ── Internal helpers ───────────────────────────────────────────────────────

def _execute_single_action(uid: str, action: dict, config: dict, user_data: dict) -> dict:
    """Dispatch a single action to its executor. Returns result dict."""
    from app.services.agent_actions import (
        execute_find_and_draft,
        execute_find_jobs,
        execute_discover_companies,
        execute_find_hiring_managers,
        execute_follow_up,
    )

    action_type = action.get("action", "unknown")

    if action_type == "find":
        return execute_find_and_draft(uid, action, config, user_data)
    elif action_type == "find_jobs":
        return execute_find_jobs(uid, action, config, user_data)
    elif action_type == "discover_companies":
        return execute_discover_companies(uid, action, config, user_data)
    elif action_type == "find_hiring_managers":
        return execute_find_hiring_managers(uid, action, config, user_data)
    elif action_type == "follow_up":
        return execute_follow_up(uid, action, config, user_data)
    elif action_type == "skip":
        return {"skipped": True, "creditsSpent": 0}
    else:
        return {"creditsSpent": 0}


def _run_cycle(uid: str, config: dict, cycle_id: str | None = None) -> dict:
    """Execute one agent cycle: plan → execute actions → save results."""
    db = get_db()
    now = datetime.now(timezone.utc)
    if not cycle_id:
        cycle_id = str(uuid.uuid4())

    # Set cycleRunning flag to prevent daemon double-triggers
    config_ref = (
        db.collection("users").document(uid)
          .collection("settings").document("agent_config")
    )
    config_ref.update({"cycleRunning": True})

    # Load user data
    user_doc = db.collection("users").document(uid).get()
    user_data = user_doc.to_dict() or {} if user_doc.exists else {}

    # Check credit balance guardrail
    credits = user_data.get("credits", 0)
    if credits < MIN_CREDIT_BALANCE:
        logger.warning("Agent paused for uid=%s: credits=%d < %d", uid, credits, MIN_CREDIT_BALANCE)
        config_ref.update({"cycleRunning": False})
        pause_agent(uid)
        return {"cycleId": cycle_id, "status": "paused", "reason": "Insufficient credits"}

    is_review_first = config.get("approvalMode") == "review_first"

    # Create cycle doc
    cycle_ref = (
        db.collection("users").document(uid)
          .collection("agent_cycles").document(cycle_id)
    )
    cycle_ref.set({
        "startedAt": now.isoformat(),
        "completedAt": None,
        "status": "running",
        "plan": [],
        "results": {
            "contactsFound": 0,
            "emailsDrafted": 0,
            "followUpsSent": 0,
            "creditsSpent": 0,
            "jobsFound": 0,
            "hmsFound": 0,
            "companiesDiscovered": 0,
        },
        "errors": [],
    })

    errors = []
    plan = []
    total_found = 0
    total_drafted = 0
    total_credits = 0
    total_jobs = 0
    total_hms = 0
    total_companies = 0
    total_followups = 0

    # Write a "planning" action so the activity rail shows something immediately
    actions_col = db.collection("users").document(uid).collection("agent_actions")
    planning_action_id = str(uuid.uuid4())
    actions_col.document(planning_action_id).set({
        "cycleId": cycle_id,
        "action": "plan",
        "status": "executing",
        "createdAt": now.isoformat(),
        "completedAt": None,
        "params": {},
        "result": None,
        "creditsSpent": 0,
        "company": None,
        "reason": "Analyzing targets and planning actions",
    })

    try:
        # Load pipeline state for planner
        pipeline_state = _load_pipeline_state(uid, db)

        # Run the planner
        from app.services.agent_planner import generate_action_plan
        plan_result = generate_action_plan(uid, config, user_data, pipeline_state)
        plan = plan_result.get("plan", [])

        # Safety net: ensure plan always includes at least one "find" action
        has_find = any(a.get("action") == "find" for a in plan)
        if not has_find and plan:
            targets = config.get("targetCompanies", [])
            roles = config.get("targetRoles", [""])
            if targets:
                for company in targets[:2]:
                    plan.append({
                        "action": "find",
                        "company": company,
                        "title": roles[0] if roles else "",
                        "count": 3,
                        "reason": f"Auto-added: find contacts at {company}",
                    })

        # Mark planning action complete
        actions_col.document(planning_action_id).update({
            "status": "completed",
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "result": {"actionsPlanned": len(plan)},
            "reason": f"Planned {len(plan)} action{'s' if len(plan) != 1 else ''}",
        })

        # Log planner output
        cycle_ref.update({
            "plan": plan,
            "plannerLog": plan_result.get("plannerLog"),
        })

        # Write planned actions to cycle doc for frontend stepped progress (D5)
        cycle_ref.update({
            "plannedActions": [a.get("action", "unknown") for a in plan],
        })

        # Execute each action
        for action in plan:
            action_type = action.get("action", "unknown")
            action_id = str(uuid.uuid4())
            action_started = datetime.now(timezone.utc).isoformat()
            action["cycleId"] = cycle_id

            # Check weekly credit cap
            if total_credits >= MAX_CREDITS_PER_WEEK:
                logger.info("Agent weekly credit cap reached for uid=%s", uid)
                break

            # Friendly label for frontend step progress
            friendly_label = _action_friendly_label(action_type, action)

            # In review_first mode, save as pending instead of executing
            if is_review_first:
                action_doc = _make_action_doc(
                    cycle_id, action_type, "pending_approval", action_started,
                    action, None,
                    company=action.get("company"),
                    reason=action.get("reason", ""),
                )
                db.collection("users").document(uid) \
                  .collection("agent_actions").document(action_id).set(action_doc)
                continue

            # Write "executing" status for live feed (D3) + step progress (D5)
            cycle_ref.update({
                "currentAction": action_type,
                "currentLabel": friendly_label,
            })
            action_doc_executing = _make_action_doc(
                cycle_id, action_type, "executing", action_started,
                action, None,
                company=action.get("company"),
                reason=action.get("reason", ""),
            )
            action_ref = db.collection("users").document(uid) \
              .collection("agent_actions").document(action_id)
            action_ref.set(action_doc_executing)

            # Autopilot mode: execute immediately
            try:
                result = _execute_single_action(uid, action, config, user_data)
                total_found += result.get("contactsFound", 0)
                total_drafted += result.get("emailsDrafted", 0)
                total_credits += result.get("creditsSpent", 0)
                total_jobs += result.get("jobsFound", 0)
                total_hms += result.get("hmsFound", 0)
                total_companies += result.get("companiesDiscovered", 0)
                total_followups += result.get("followUpsSent", 0)

                action_doc = _make_action_doc(
                    cycle_id, action_type, "completed", action_started, action, result,
                    credits=result.get("creditsSpent", 0),
                    company=action.get("company"),
                    reason=action.get("reason", ""),
                )
                result_summary = _action_result_summary(action_type, result)
            except Exception as e:
                logger.exception("%s action failed: %s", action_type, e)
                errors.append(f"{action_type} {action.get('company', '')}: {e}")
                action_doc = _make_action_doc(
                    cycle_id, action_type, "failed", action_started, action,
                    {"error": str(e)},
                    company=action.get("company"),
                    reason=action.get("reason", ""),
                )
                result_summary = "Failed"

            # Update action doc from "executing" to final status
            action_ref.set(action_doc)

            # Update cycle progress: clear currentAction, append to completedActions (D5)
            from google.cloud.firestore_v1 import ArrayUnion
            cycle_ref.update({
                "currentAction": None,
                "currentLabel": None,
                "completedActions": ArrayUnion([{
                    "action": action_type,
                    "label": friendly_label,
                    "resultSummary": result_summary,
                    "completedAt": datetime.now(timezone.utc).isoformat(),
                }]),
                "results": {
                    "contactsFound": total_found,
                    "emailsDrafted": total_drafted,
                    "followUpsSent": total_followups,
                    "creditsSpent": total_credits,
                    "jobsFound": total_jobs,
                    "hmsFound": total_hms,
                    "companiesDiscovered": total_companies,
                },
            })

    except Exception as e:
        logger.exception("Agent cycle failed for uid=%s", uid)
        errors.append(str(e))
        # Mark planning action as failed if it's still "executing"
        try:
            planning_doc = actions_col.document(planning_action_id).get()
            if planning_doc.exists and (planning_doc.to_dict() or {}).get("status") == "executing":
                actions_col.document(planning_action_id).update({
                    "status": "failed",
                    "completedAt": datetime.now(timezone.utc).isoformat(),
                    "result": {"error": str(e)},
                })
        except Exception:
            pass

    # Complete the cycle
    completed_at = datetime.now(timezone.utc).isoformat()
    cycle_status = "awaiting_approval" if is_review_first else "completed"

    cycle_ref.update({
        "completedAt": completed_at,
        "status": cycle_status,
        "currentAction": None,
        "currentLabel": None,
        "errors": errors,
        "results": {
            "contactsFound": total_found,
            "emailsDrafted": total_drafted,
            "followUpsSent": total_followups,
            "creditsSpent": total_credits,
            "jobsFound": total_jobs,
            "hmsFound": total_hms,
            "companiesDiscovered": total_companies,
        },
    })

    # Update pendingApprovals count on config for sidebar badge (D6)
    if is_review_first:
        pending_count = len([a for a in plan if a.get("action") != "skip"])
        config_ref.update({"pendingApprovals": pending_count})

    # Update config with totals and schedule next cycle
    from google.cloud.firestore_v1 import Increment
    next_cycle_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    config_updates = {
        "lastCycleAt": completed_at,
        "nextCycleAt": next_cycle_at,
        "cycleRunning": False,
        "totalContactsFound": Increment(total_found),
        "totalEmailsDrafted": Increment(total_drafted),
        "totalJobsFound": Increment(total_jobs),
        "totalHmsContacted": Increment(total_hms),
        "totalCompaniesDiscovered": Increment(total_companies),
    }
    config_ref.update(config_updates)

    logger.info(
        "Agent cycle complete uid=%s: found=%d drafted=%d jobs=%d hms=%d cos=%d credits=%d errors=%d mode=%s",
        uid, total_found, total_drafted, total_jobs, total_hms, total_companies,
        total_credits, len(errors), "review_first" if is_review_first else "autopilot",
    )

    return {
        "cycleId": cycle_id,
        "status": cycle_status,
        "contactsFound": total_found,
        "emailsDrafted": total_drafted,
        "jobsFound": total_jobs,
        "hmsFound": total_hms,
        "companiesDiscovered": total_companies,
        "creditsSpent": total_credits,
        "errors": errors,
    }


def _action_friendly_label(action_type: str, action: dict) -> str:
    """Human-readable label for stepped progress UI."""
    company = action.get("company", "")
    labels = {
        "find": f"Searching for contacts at {company}" if company else "Searching for contacts",
        "find_jobs": "Finding matching jobs",
        "discover_companies": "Discovering companies",
        "find_hiring_managers": f"Finding hiring managers at {company}" if company else "Finding hiring managers",
        "follow_up": "Preparing follow-ups",
        "draft": f"Drafting email to {company}" if company else "Drafting emails",
    }
    return labels.get(action_type, action_type)


def _action_result_summary(action_type: str, result: dict) -> str:
    """One-line result for stepped progress UI."""
    if action_type == "find":
        n = result.get("contactsFound", 0)
        d = result.get("emailsDrafted", 0)
        parts = []
        if n: parts.append(f"Found {n} contact{'s' if n != 1 else ''}")
        if d: parts.append(f"{d} draft{'s' if d != 1 else ''}")
        return ", ".join(parts) if parts else "Done"
    elif action_type == "find_jobs":
        n = result.get("jobsFound", 0)
        return f"Found {n} job{'s' if n != 1 else ''}" if n else "No new jobs"
    elif action_type == "discover_companies":
        n = result.get("companiesDiscovered", 0)
        return f"Discovered {n} compan{'ies' if n != 1 else 'y'}" if n else "No new companies"
    elif action_type == "find_hiring_managers":
        n = result.get("hmsFound", 0)
        return f"Found {n} hiring manager{'s' if n != 1 else ''}" if n else "No new HMs"
    elif action_type == "follow_up":
        n = result.get("followUpsSent", 0)
        return f"Sent {n} follow-up{'s' if n != 1 else ''}" if n else "No follow-ups needed"
    return "Done"


def _make_action_doc(
    cycle_id: str,
    action_type: str,
    status: str,
    started_at: str,
    params: dict,
    result: dict | None,
    credits: int = 0,
    company: str | None = None,
    reason: str = "",
) -> dict:
    return {
        "cycleId": cycle_id,
        "action": action_type,
        "status": status,
        "createdAt": started_at,
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "params": params,
        "result": result,
        "creditsSpent": credits,
        "company": company,
        "reason": reason,
    }


def _load_pipeline_state(uid: str, db) -> dict:
    """Load current pipeline state for the planner."""
    contacts = []
    for doc in db.collection("users").document(uid).collection("contacts").stream():
        data = doc.to_dict()
        contacts.append({
            "id": doc.id,
            "company": data.get("company", ""),
            "title": data.get("title", ""),
            "stage": data.get("pipelineStage", "unknown"),
            "source": data.get("source", "manual"),
            "email": data.get("email", ""),
            "lastNudgeAt": data.get("lastNudgeAt"),
            "emailSentAt": data.get("emailSentAt"),
            "isHiringManager": data.get("isHiringManager", False),
        })

    # Count contacts per company
    company_counts = {}
    hm_counts = {}
    for c in contacts:
        co = (c.get("company") or "").strip().lower()
        if co:
            company_counts[co] = company_counts.get(co, 0) + 1
            if c.get("isHiringManager"):
                hm_counts[co] = hm_counts.get(co, 0) + 1

    # Count jobs per company
    jobs_pipeline = {}
    try:
        for doc in db.collection("users").document(uid).collection("agent_jobs").stream():
            data = doc.to_dict() or {}
            co = (data.get("company") or "").strip().lower()
            if co:
                jobs_pipeline[co] = jobs_pipeline.get(co, 0) + 1
    except Exception:
        pass

    # Get discovered companies
    discovered_companies = []
    try:
        for doc in db.collection("users").document(uid).collection("agent_companies").stream():
            data = doc.to_dict() or {}
            name = data.get("name", "")
            if name:
                discovered_companies.append(name)
    except Exception:
        pass

    return {
        "totalContacts": len(contacts),
        "companyCounts": company_counts,
        "hmPipeline": hm_counts,
        "jobsPipeline": jobs_pipeline,
        "discoveredCompanies": discovered_companies,
        "contacts": contacts,
    }


def _get_week_start() -> str:
    """Return ISO string for Monday 00:00 UTC of the current week."""
    now = datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    start = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return start.isoformat()


def get_agent_pipeline(uid: str) -> dict:
    """Return per-company pipeline breakdown for the dashboard."""
    from app.services.agent_actions import _company_to_domain

    db = get_db()
    companies: dict[str, dict] = {}

    # Aggregate contacts by company
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    for doc in contacts_ref.where("source", "==", "agent").stream():
        data = doc.to_dict() or {}
        co = (data.get("company") or "").strip()
        if not co:
            continue
        key = co.lower()
        if key not in companies:
            domain = _company_to_domain(co)
            companies[key] = {
                "name": co,
                "logoUrl": f"https://logo.clearbit.com/{domain}" if domain else None,
                "contacts": 0,
                "hms": 0,
                "jobs": 0,
                "draftsReady": 0,
                "emailsSent": 0,
                "replies": 0,
            }
        entry = companies[key]
        entry["contacts"] += 1
        if data.get("isHiringManager"):
            entry["hms"] += 1
        if data.get("pipelineStage") == "draft_created":
            entry["draftsReady"] += 1
        if data.get("emailSentAt"):
            entry["emailsSent"] += 1
        if data.get("hasUnreadReply"):
            entry["replies"] += 1

    # Aggregate jobs by company
    jobs_ref = db.collection("users").document(uid).collection("agent_jobs")
    for doc in jobs_ref.stream():
        data = doc.to_dict() or {}
        co = (data.get("company") or "").strip()
        if not co:
            continue
        key = co.lower()
        if key not in companies:
            domain = _company_to_domain(co)
            companies[key] = {
                "name": co,
                "logoUrl": f"https://logo.clearbit.com/{domain}" if domain else None,
                "contacts": 0,
                "hms": 0,
                "jobs": 0,
                "draftsReady": 0,
                "emailsSent": 0,
                "replies": 0,
            }
        companies[key]["jobs"] += 1

    # Sort: replies first, then drafts ready, then fewest contacts
    sorted_companies = sorted(
        companies.values(),
        key=lambda c: (-c["replies"], -c["draftsReady"], c["contacts"]),
    )

    return {"companies": sorted_companies}


def _pause_weekly_queue(uid: str, db):
    """Pause the weekly queue and mark that the agent did it."""
    prefs_ref = (
        db.collection("users").document(uid)
          .collection("settings").document("queue_preferences")
    )
    prefs_doc = prefs_ref.get()
    if prefs_doc.exists:
        prefs_ref.update({"paused": True})
    else:
        prefs_ref.set({"paused": True})

    config_ref = (
        db.collection("users").document(uid)
          .collection("settings").document("agent_config")
    )
    config_ref.update({"queuePausedByAgent": True})

    logger.info("Weekly queue paused by agent for uid=%s", uid)


def _unpause_weekly_queue(uid: str, db):
    """Unpause the weekly queue (only if agent paused it)."""
    prefs_ref = (
        db.collection("users").document(uid)
          .collection("settings").document("queue_preferences")
    )
    prefs_doc = prefs_ref.get()
    if prefs_doc.exists:
        prefs_ref.update({"paused": False})

    logger.info("Weekly queue unpaused by agent for uid=%s", uid)
