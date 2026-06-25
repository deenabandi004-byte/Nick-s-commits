"""
Agent Service — core orchestration for the autonomous networking agent.

Responsibilities:
  - Agent config CRUD (Firestore at users/{uid}/settings/agent_config)
  - run_due_agent_cycles(): scanned by daemon, runs cycles where nextCycleAt <= now
  - Per-user cycle execution with real action dispatching
  - Queue auto-pause/unpause when agent is deployed/stopped
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone, timedelta

from app.extensions import get_db


def _generate_short_code() -> str:
    """6-char base32 code for SMS reply targeting (e.g. 'K7M2P9').

    Crockford-style alphabet: no 0/O/1/I to avoid SMS typos.
    """
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(secrets.choice(alphabet) for _ in range(6))

logger = logging.getLogger(__name__)

# ── Hard caps (guardrails) ─────────────────────────────────────────────────
# Sized to match what the new cadence sliders can produce at their maximum
# daily setting. Contacts slider max is 15, daily cadence multiplies by 7,
# giving a 105 weekly ceiling. Credits ceiling is the same math against the
# per-cycle max cost in `both` mode (15 contacts × 5 + 10 roles × 2 = 95
# per cycle, × 7 = 665, rounded up to 700). These are hard upper bounds on
# the LEGACY per-Loop config; per-tier budget caps in config.py
# (max_credit_budget_per_week_per_loop: free 150, pro 600, elite None)
# clamp BELOW these for non-elite users.
MAX_CONTACTS_PER_WEEK = 105
MAX_CREDITS_PER_WEEK = 700
# Raised from 20 to 25 so a user can still do one coffee chat prep (15cr) or
# half an interview prep after the auto-pause kicks in.
MIN_CREDIT_BALANCE = 25

# ── Default config ─────────────────────────────────────────────────────────
# New fields driving the "Start a Loop" rebrand:
#   briefText / briefParsed — single natural-language goal the user typed
#   smsEnabled              — feature flag while Twilio 10DLC is pending
#   digestEnabled           — kept as fallback when smsEnabled=False
#
# Legacy fields (targetCompanies/Industries/Roles/Locations, approvalMode,
# emailTemplate*, customInstructions, signoffPhrase, signatureBlock,
# follow-up controls, the *Discovery toggles) stay readable for backwards compat
# but the new UX writes only briefText + weeklyContactTarget + reviewBeforeSend.
DEFAULT_AGENT_CONFIG = {
    # New (Loop UX)
    "briefText": "",
    "briefParsed": None,
    "reviewBeforeSend": True,
    "smsEnabled": False,
    # Legacy targets — still honored if briefParsed is None
    "targetCompanies": [],
    "targetIndustries": [],
    "targetRoles": [],
    "targetLocations": [],
    "preferAlumni": True,
    "weeklyContactTarget": 5,
    "creditBudgetPerWeek": 100,
    "approvalMode": "review_first",
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
    "digestEnabled": True,
}

MUTABLE_CONFIG_FIELDS = {
    # New
    "briefText", "briefParsed", "reviewBeforeSend",
    # Legacy
    "targetCompanies", "targetIndustries", "targetRoles", "targetLocations",
    "preferAlumni", "weeklyContactTarget", "creditBudgetPerWeek",
    "approvalMode", "autoSendUnlocked",
    "emailTemplatePurpose", "emailStylePreset",
    "customInstructions", "signoffPhrase", "signatureBlock",
    "followUpEnabled", "followUpDays", "maxFollowUps", "blocklist",
    "enableJobDiscovery", "enableHiringManagers", "enableCompanyDiscovery",
    "digestEnabled",
}


def get_agent_config(uid: str) -> dict:
    db = get_db()
    doc = db.collection("users").document(uid) \
            .collection("settings").document("agent_config").get()
    if doc.exists:
        # Merge defaults so new fields (briefText, reviewBeforeSend, etc.)
        # appear in responses even when the stored doc predates them.
        return {**DEFAULT_AGENT_CONFIG, **doc.to_dict()}
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

    # New UX writes reviewBeforeSend; cycle execution still reads approvalMode.
    # Mirror both ways so old and new clients agree.
    if "reviewBeforeSend" in filtered:
        filtered["approvalMode"] = (
            "review_first" if filtered["reviewBeforeSend"] else "autopilot"
        )
    elif "approvalMode" in filtered:
        filtered["reviewBeforeSend"] = filtered["approvalMode"] == "review_first"

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
    """Called by the agent daemon every hour. Finds active agents with due cycles.

    Uses a Firestore collection-group query on the agent_config docs so we touch
    only users with status='active' and nextCycleAt<=now, instead of streaming
    every user in the system.

    Required Firestore index (deploy alongside this code):
        Collection group: settings
        Fields: status (ASC), nextCycleAt (ASC), __name__ (ASC)
        Query scope: Collection group
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    logger.info("Agent daemon: scanning for due cycles")

    processed = 0
    errors = 0

    try:
        # Collection-group query reaches every users/{uid}/settings/agent_config
        # doc directly. Filter at the DB layer instead of streaming all users.
        query = (
            db.collection_group("settings")
              .where("status", "==", "active")
              .where("nextCycleAt", "<=", now_iso)
        )
        due_configs = list(query.stream())
    except Exception:
        # Falls back to the legacy full scan if the index hasn't been deployed.
        # Logged loudly so we notice and create the index.
        logger.exception(
            "Agent daemon: collection_group query failed (missing index?). "
            "Falling back to full user scan."
        )
        due_configs = None

    if due_configs is not None:
        for config_doc in due_configs:
            # Doc path is users/{uid}/settings/agent_config — uid is the parent
            # of the parent.
            try:
                uid = config_doc.reference.parent.parent.id
                config = config_doc.to_dict() or {}
                if config_doc.id != "agent_config":
                    continue  # other settings docs share the same collection name
                if config.get("cycleRunning"):
                    continue

                logger.info("Agent daemon: running cycle for uid=%s", uid)
                try:
                    _run_cycle(uid, config)
                    processed += 1
                except Exception:
                    logger.exception("Agent cycle failed for uid=%s", uid)
                    errors += 1
            except Exception:
                logger.exception("Agent daemon: error processing config doc")
                errors += 1
    else:
        # Legacy path — only runs if the index is missing.
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
                if not next_cycle or next_cycle > now_iso:
                    continue

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


def _build_find_jobs_action(company: str, role: str) -> dict:
    """Auto-add stub for a find_jobs action. Empty company is allowed — the
    executor falls back to a role-only broad Perplexity query so roles/both-
    mode Loops without explicit company targets still surface postings."""
    label = f"find postings at {company}" if company else "find postings broadly"
    return {
        "action": "find_jobs",
        "company": company,
        "role": role,
        "count": 5,
        "reason": f"Auto-added: {label}",
    }


def _build_find_action(company: str, title: str) -> dict:
    """Auto-add stub for a find (PDL contact search) action. Always
    company-scoped — PDL search without a company filter would query the
    entire 2.2B-row index."""
    return {
        "action": "find",
        "company": company,
        "title": title,
        "count": 3,
        "reason": f"Auto-added: find contacts at {company}",
    }


def _apply_plan_safety_net(
    plan: list[dict],
    loop_mode: str,
    targets: list[str],
    roles_list: list[str],
) -> None:
    """Mutate `plan` in place to enforce mode-required actions.

    Roles mode: must include find_jobs. With targets → emit per-company;
    without targets → emit one broad role-only find_jobs so the H carve-
    out's posting↔draft pairing still has postings to work with on briefs
    like "Summer 2027 SWE internships at YC tech startups" (no company
    names parsed).

    Both mode: must include both find AND find_jobs. find still requires
    targets (PDL queries are meaningless without a company filter), but
    find_jobs falls back to the broad search when targets are absent.

    People mode: must include find. Same target dependency as before.

    Empty `plan` is the most important case for the safety net to handle —
    it means the planner either regressed (Claude returned `[]` or
    `_parse_plan` failed to parse JSON) or wasn't called. Without
    synthesizing default actions here, the cycle runs to completion with
    zero work done and stamps the Loop with found=0/drafted=0. The old
    `if not plan: return` guard at the top of this function silently
    short-circuited exactly that recovery path.
    """
    if not plan:
        logger.warning(
            "Planner returned empty plan — safety net synthesizing default "
            "actions for loop_mode=%s targets=%d roles=%d. Likely a planner "
            "regression (Claude returned []) or a JSON parse failure.",
            loop_mode, len(targets or []), len(roles_list or []),
        )
    role = roles_list[0] if roles_list else ""

    has_find = any(a.get("action") == "find" for a in plan)
    has_find_jobs = any(a.get("action") == "find_jobs" for a in plan)

    if loop_mode == "roles":
        if not has_find_jobs:
            if targets:
                for company in targets[:2]:
                    plan.append(_build_find_jobs_action(company, role))
            else:
                plan.append(_build_find_jobs_action("", role))
    elif loop_mode == "both":
        if targets and not has_find:
            for company in targets[:2]:
                plan.append(_build_find_action(company, role))
        if not has_find_jobs:
            if targets:
                for company in targets[:2]:
                    plan.append(_build_find_jobs_action(company, role))
            else:
                plan.append(_build_find_jobs_action("", role))
    else:  # people mode (default)
        if targets and not has_find:
            for company in targets[:2]:
                plan.append(_build_find_action(company, role))


def _propagate_source_job_id_to_plan(
    plan: list[dict],
    current_index: int,
    find_jobs_action_id: str,
    find_jobs_result: dict,
) -> None:
    """After a find_jobs action completes, stamp sourceJobId on subsequent
    find_hiring_managers actions whose company matches a fetched job's
    company.

    The id format `f"{find_jobs_action_id}-j{idx}"` matches what
    loop_service._action_to_items emits as each job item's groupKey, so the
    activity feed's render-time pairing finds the same string on both the
    job item (groupKey) and the contact item (groupKey from contact's
    sourceJobId).

    execute_find_hiring_managers drops sourceJobId for networking-
    provenance HMs at write time, so stamping eagerly here is safe — only
    role_search HMs end up with a non-empty sourceJobId on the contact doc.
    """
    jobs = (find_jobs_result or {}).get("jobs") or []
    if not jobs:
        return

    company_to_index: dict[str, int] = {}
    for i, job in enumerate(jobs):
        if not isinstance(job, dict):
            continue
        company = (job.get("company") or "").strip().lower()
        if company and company not in company_to_index:
            company_to_index[company] = i

    if not company_to_index:
        return

    for downstream in plan[current_index + 1:]:
        if not isinstance(downstream, dict):
            continue
        if downstream.get("action") != "find_hiring_managers":
            continue
        if downstream.get("sourceJobId"):
            continue  # an earlier find_jobs claim wins
        hm_company = (downstream.get("company") or "").strip().lower()
        if hm_company in company_to_index:
            downstream["sourceJobId"] = (
                f"{find_jobs_action_id}-j{company_to_index[hm_company]}"
            )


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

    # Do NOT read `reviewBeforeSend` here. For Loops V2, that flag is a
    # send-time signal (derived into autoSendMode in loop_service); it
    # must not gate action execution. loop_jobs.py hardcodes
    # approvalMode="autopilot" precisely so this stays False. Reading
    # reviewBeforeSend re-arms the dormant `if is_review_first: continue`
    # block below and silently no-ops every cycle (found=0/drafted=0).
    is_review_first = config.get("approvalMode") == "review_first"

    # Create cycle doc. shortCode is what users will text back to send drafts
    # ("SEND K7M2P9") — too short to collide meaningfully within one user's
    # history of ~hundreds of cycles, and the SMS handler scopes by uid first.
    cycle_ref = (
        db.collection("users").document(uid)
          .collection("agent_cycles").document(cycle_id)
    )
    cycle_ref.set({
        "shortCode": _generate_short_code(),
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

        # Safety net: ensure plan always includes the mode's primary action(s).
        # See _apply_plan_safety_net docstring for the exact mode rules.
        # No-targets briefs (e.g. "Summer 2027 SWE internships at YC tech
        # startups") still get a find_jobs auto-added in roles/both mode so
        # the H carve-out's posting↔draft pairing has postings to work
        # with — without targets, the executor falls back to a broad
        # role-only Perplexity search.
        loop_mode = config.get("loopMode") or "people"
        targets = config.get("targetCompanies", [])
        roles_list = config.get("targetRoles", [""])
        _apply_plan_safety_net(plan, loop_mode, targets, roles_list)

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

        # Execute each action. enumerate so we can look downstream from the
        # current index when stamping H pairing keys on find_hiring_managers
        # actions after a find_jobs completes.
        for action_index, action in enumerate(plan):
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

                # H carve-out wire-up: when find_jobs successfully fetches
                # postings, stamp the matching sourceJobId on any subsequent
                # find_hiring_managers actions targeting the same company.
                # That key flows into contact.sourceJobId at write time and
                # matches the find_jobs item's groupKey at read time so the
                # activity feed renders the founder draft as an indented
                # sub-card under its source posting.
                if action_type == "find_jobs":
                    _propagate_source_job_id_to_plan(
                        plan, action_index, action_id, result,
                    )

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
    from app.services.agent_actions import _company_to_logo_url

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
            companies[key] = {
                "name": co,
                "logoUrl": _company_to_logo_url(co),
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
            companies[key] = {
                "name": co,
                "logoUrl": _company_to_logo_url(co),
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
