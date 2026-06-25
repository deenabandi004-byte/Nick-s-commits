"""
Loop Service — multi-Loop layer on top of the existing agent infrastructure.

A Loop is one autonomous search the user kicked off with a natural-language
brief. Users can have multiple Loops running in parallel (subject to their
tier's max_loops cap). Each Loop runs cycles, drafts emails, and produces
its own SMS notification.

Data model:
    users/{uid}/loops/{loopId}
        id, name, briefText, briefParsed,
        reviewBeforeSend, weeklyTarget, smsEnabled,
        status (idle | running | paused | done),
        createdAt, lastRunAt, nextRunAt,
        totalContactsFound, totalEmailsDrafted, totalJobsFound, ...

Cycles/actions/jobs/companies stay at users/{uid}/agent_cycles, etc., but get
a loopId field so we can filter by Loop. Old documents without a loopId belong
to the "default" Loop created during migration.

This module is the source of truth for everything user-visible called a "Loop."
The legacy agent_service is now treated as plumbing — it knows how to execute
one cycle, but it doesn't decide which Loop the cycle belongs to.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta

from app.config import TIER_CONFIGS
from app.extensions import get_db
from app.services.agent_service import (
    DEFAULT_AGENT_CONFIG,
    _generate_short_code,
)

logger = logging.getLogger(__name__)

# Fields the client is allowed to write. Counters and timestamps are managed
# server-side and rejected if posted by the client.
MUTABLE_LOOP_FIELDS = {
    "name",
    "briefText",
    "briefParsed",
    "reviewBeforeSend",
    "weeklyTarget",
    "smsEnabled",
    # Phase 8 — automation + budget
    "cadence",
    "creditBudgetPerWeek",
    "automationEnabled",
}

LOOP_STATUS = {"idle", "running", "paused", "done"}

# Phase 8 — Loop cadence options. User picks at creation; default in
# _loop_defaults below is every_other_day.
LOOP_CADENCE = {"daily", "every_other_day", "weekly", "manual"}


def cadence_delta_hours(cadence: str) -> int | None:
    """Hours between scheduled cycles for a given cadence. None means manual
    (no scheduled runs — only fires when the user clicks Run it now)."""
    return {
        "daily": 24,
        "every_other_day": 48,
        "weekly": 24 * 7,
        "manual": None,
    }.get(cadence, 48)


def _loop_defaults() -> dict:
    """Default shape for a freshly-created Loop. Counters start at zero."""
    return {
        "name": "Untitled Loop",
        "briefText": "",
        "briefParsed": None,
        "reviewBeforeSend": True,
        "weeklyTarget": 5,
        "smsEnabled": False,
        "status": "idle",
        "shortCode": _generate_short_code(),
        "createdAt": None,
        "lastRunAt": None,
        "nextRunAt": None,
        "lastSmsAt": None,
        "totalContactsFound": 0,
        "totalEmailsDrafted": 0,
        "totalRepliesReceived": 0,
        "totalJobsFound": 0,
        "totalHmsContacted": 0,
        "totalCompaniesDiscovered": 0,
        "pendingDrafts": 0,
        "unreadReplies": 0,
        # Phase 8 — automation + budget. Tier defaults override
        # creditBudgetPerWeek at create_loop time.
        "cadence": "every_other_day",
        "creditBudgetPerWeek": 200,
        "automationEnabled": True,
        "lastReviewedAt": None,
        "weekCreditsSpent": 0,
        "weekStartedAt": None,
        "pauseReason": None,
    }


def _max_loops_for_tier(tier: str) -> int:
    """Look up the per-tier Loop cap. Defaults to 1 for unknown tiers."""
    cfg = TIER_CONFIGS.get(tier) or TIER_CONFIGS.get("free", {})
    return int(cfg.get("max_loops", 1))


def _auto_name_from_brief(brief_parsed: dict | None, brief_text: str) -> str:
    """Generate a short, human-readable name from the parsed brief.

    Examples:
        roles=["Analyst"], industries=["Investment Banking"]
            -> "Analyst roles in Investment Banking"
        companies=["Stripe","Linear"]
            -> "Roles at Stripe, Linear"
        empty brief
            -> first 40 chars of briefText, or "Untitled Loop"
    """
    if isinstance(brief_parsed, dict):
        roles = brief_parsed.get("roles") or []
        companies = brief_parsed.get("companies") or []
        industries = brief_parsed.get("industries") or []
        if roles and companies:
            return f"{roles[0]} at {', '.join(companies[:2])}"
        if roles and industries:
            return f"{roles[0]} roles in {industries[0]}"
        if companies:
            return f"Roles at {', '.join(companies[:2])}"
        if roles:
            return f"{roles[0]} roles"
        if industries:
            return industries[0]

    snippet = (brief_text or "").strip().splitlines()[0] if brief_text else ""
    if snippet:
        return snippet[:40] + ("…" if len(snippet) > 40 else "")
    return "Untitled Loop"


# ── CRUD ────────────────────────────────────────────────────────────────────

def list_loops(uid: str) -> list[dict]:
    """Return all Loops for the user, newest first.

    Triggers a one-time migration from the legacy agent_config singleton on
    first call: if the user has no loops/ docs but does have a stored
    agent_config, create a default Loop from it.
    """
    db = get_db()
    coll = db.collection("users").document(uid).collection("loops")
    docs = [{"id": d.id, **d.to_dict()} for d in coll.stream()]

    if not docs:
        migrated = _migrate_legacy_config(uid)
        if migrated:
            docs = [migrated]

    docs.sort(key=lambda d: d.get("createdAt") or "", reverse=True)
    return docs


def get_loop(uid: str, loop_id: str) -> dict | None:
    db = get_db()
    doc = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id).get()
    )
    if not doc.exists:
        return None
    return {"id": doc.id, **doc.to_dict()}


def create_loop(uid: str, tier: str, payload: dict) -> dict:
    """Create a new Loop after checking the tier cap.

    Raises:
        ValueError("tier_cap_reached") — user is at their tier's max_loops.
    """
    db = get_db()
    existing = list_loops(uid)
    cap = _max_loops_for_tier(tier)
    if len(existing) >= cap:
        raise ValueError("tier_cap_reached")

    now = datetime.now(timezone.utc).isoformat()
    loop_id = str(uuid.uuid4())

    # Filter to mutable fields, then layer on top of defaults.
    payload_clean = {k: v for k, v in (payload or {}).items() if k in MUTABLE_LOOP_FIELDS}

    # Phase 8: set tier-default weekly budget unless user supplied one.
    # Enforce the tier max on whatever they did supply.
    tier_cfg = TIER_CONFIGS.get(tier) or TIER_CONFIGS["free"]
    default_budget = int(tier_cfg.get("default_credit_budget_per_week_per_loop", 75))
    max_budget = tier_cfg.get("max_credit_budget_per_week_per_loop")  # None = unbounded
    if "creditBudgetPerWeek" in payload_clean:
        budget = int(payload_clean["creditBudgetPerWeek"])
        if max_budget is not None:
            budget = min(budget, max_budget)
        payload_clean["creditBudgetPerWeek"] = max(budget, 25)  # floor — at least 1 contact
    else:
        payload_clean["creditBudgetPerWeek"] = default_budget

    # Validate cadence
    if payload_clean.get("cadence") and payload_clean["cadence"] not in LOOP_CADENCE:
        payload_clean["cadence"] = "every_other_day"

    doc = {
        **_loop_defaults(),
        **payload_clean,
        "createdAt": now,
    }
    if not doc.get("name") or doc["name"] == "Untitled Loop":
        doc["name"] = _auto_name_from_brief(doc.get("briefParsed"), doc.get("briefText", ""))

    db.collection("users").document(uid) \
      .collection("loops").document(loop_id).set(doc)

    return {"id": loop_id, **doc}


def update_loop(uid: str, loop_id: str, patch: dict) -> dict | None:
    db = get_db()
    ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    doc = ref.get()
    if not doc.exists:
        return None

    filtered = {k: v for k, v in (patch or {}).items() if k in MUTABLE_LOOP_FIELDS}
    # If the brief changed and the name was auto-generated, refresh the name.
    if "briefParsed" in filtered or "briefText" in filtered:
        current = doc.to_dict() or {}
        if not patch.get("name"):
            new_name = _auto_name_from_brief(
                filtered.get("briefParsed", current.get("briefParsed")),
                filtered.get("briefText", current.get("briefText", "")),
            )
            filtered["name"] = new_name

    if filtered:
        ref.update(filtered)
    return get_loop(uid, loop_id)


def delete_loop(uid: str, loop_id: str) -> bool:
    """Hard-delete a Loop. Cycles/actions/contacts created under it stay; they
    just become orphaned by loopId. This keeps the Tracker history intact for
    contacts the user already reached out to."""
    db = get_db()
    ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    if not ref.get().exists:
        return False
    ref.delete()
    return True


# ── Lifecycle ───────────────────────────────────────────────────────────────

def start_loop(uid: str, loop_id: str, app=None) -> dict | None:
    """Mark a Loop as running and trigger its first cycle immediately.

    The cycle runs in a background thread so the API call returns fast.
    Phase 2 (RQ worker) will replace this thread with a durable job queue;
    until then this still works on Render but dies if the worker is recycled
    mid-cycle. The Loop's status stays 'running' so the user can retry.

    Returns the updated Loop doc, or None if the Loop doesn't exist.
    """
    db = get_db()
    ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    doc = ref.get()
    if not doc.exists:
        return None

    loop = doc.to_dict() or {}
    if not loop.get("briefText") and not (loop.get("briefParsed") or {}).get("companies"):
        raise ValueError("brief_required")

    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()

    # Phase 8: next scheduled run is driven by cadence, not a hardcoded 24h.
    # `manual` Loops never have a nextRunAt — they only fire on Run it now.
    cadence = (loop or {}).get("cadence", "every_other_day")
    hours = cadence_delta_hours(cadence)
    next_run = (now_dt + timedelta(hours=hours)).isoformat() if hours else None

    ref.update({
        "status": "running",
        "lastRunAt": now,
        "nextRunAt": next_run,
        "startedAt": now,
        "pauseReason": None,
    })

    trigger_loop_cycle(uid, loop_id, app)
    return get_loop(uid, loop_id)


def trigger_loop_cycle(uid: str, loop_id: str, app=None) -> str | None:
    """Enqueue one cycle for this Loop.

    In production (REDIS_URL set), this hands the cycle to a separate RQ
    worker process — the cycle survives Gunicorn worker recycling, which
    was the silent-failure mode the threading.Thread version had.

    In dev (no REDIS_URL), the rq_queue module falls back to running the
    job in a daemon thread on this process, so local dev keeps working
    without Redis installed.

    The `app` parameter is kept for backwards compatibility with callers
    that still pass current_app; it's unused now because the job function
    runs in a separate process with its own Firestore client.

    Returns the job id, or None if the Loop doesn't exist.
    """
    del app  # legacy param, no longer needed

    db = get_db()
    loop_ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    if not loop_ref.get().exists:
        return None

    from app.services.rq_queue import enqueue
    return enqueue("run_loop_cycle", uid=uid, loop_id=loop_id)


def get_loop_activity(uid: str, loop_id: str, limit: int = 50) -> list[dict]:
    """Build a chronological activity feed for one Loop.

    Joins through agent_cycles (filtered by loopId) → agent_actions (filtered
    by cycleId in that loop's cycle list) → per-action result rows. Each row
    is one *thing* the Loop found: a person, a job, a hiring manager, or a
    company. Items are sorted newest first.

    Shape per item:
        {
            "id": str,           # unique within the feed
            "type": "contact" | "job" | "hm" | "company" | "draft",
            "title": str,        # primary line (person name, job title, ...)
            "subtitle": str,     # secondary line (company, location, role, ...)
            "linkTo": str,       # frontend route to drill into this find
            "createdAt": str,    # ISO timestamp
        }
    """
    db = get_db()

    # Cycles for this Loop. The loopId field is stamped in trigger_loop_cycle.
    cycles_q = (
        db.collection("users").document(uid)
          .collection("agent_cycles")
          .where("loopId", "==", loop_id)
    )
    cycle_ids = [doc.id for doc in cycles_q.stream()]
    if not cycle_ids:
        return []

    items: list[dict] = []

    # agent_actions hold the executed work. result contains the contacts/jobs
    # arrays returned by each action type. Firestore 'in' caps at 30 values,
    # so for users with more cycles we iterate in chunks.
    actions_col = db.collection("users").document(uid).collection("agent_actions")
    for chunk_start in range(0, len(cycle_ids), 30):
        chunk = cycle_ids[chunk_start:chunk_start + 30]
        for doc in actions_col.where("cycleId", "in", chunk).where("status", "==", "completed").stream():
            data = doc.to_dict() or {}
            items.extend(_action_to_items(doc.id, data))

    # Sort newest first, cap.
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return items[:limit]


# Names that almost certainly came from a scraper hitting a broken page.
# Filtered at the feed layer so users never see "404 – Page Not Found" as
# a company. The upstream discover_companies action should also be cleaned
# up, but until then this catches the common garbage strings.
_GARBAGE_NAME_TOKENS = (
    "404",
    "not found",
    "page not found",
    "access denied",
    "forbidden",
    "error 4",
    "error 5",
    "untitled",
)


def _looks_like_garbage(name: str) -> bool:
    if not name:
        return True
    lowered = name.strip().lower()
    if not lowered:
        return True
    return any(tok in lowered for tok in _GARBAGE_NAME_TOKENS)


def _action_to_items(action_id: str, action: dict) -> list[dict]:
    """Expand one completed agent_action into 0..N activity feed items."""
    result = action.get("result") or {}
    if not isinstance(result, dict):
        return []
    created_at = action.get("completedAt") or action.get("createdAt") or ""
    action_type = action.get("action")
    out: list[dict] = []

    # find / find_hiring_managers — produce contact rows
    if action_type in ("find", "find_hiring_managers"):
        contacts = result.get("contacts") or []
        is_hm = action_type == "find_hiring_managers"
        for i, c in enumerate(contacts):
            if not isinstance(c, dict):
                continue
            name = c.get("name") or c.get("fullName") or "Someone"
            if _looks_like_garbage(name):
                continue
            role = c.get("title") or c.get("role") or ""
            company = c.get("company") or action.get("company") or ""
            subtitle = ", ".join([s for s in [role, company] if s])
            contact_id = c.get("contactId") or c.get("id") or ""

            # Deep-link to the exact record. /tracker?contact=<id> tells the
            # tracker page to scroll to and highlight that one contact.
            base = "/hiring-manager-tracker" if is_hm else "/tracker"
            link = f"{base}?contact={contact_id}" if contact_id else base
            out.append({
                "id": f"{action_id}-c{i}",
                "type": "hm" if is_hm else "contact",
                "title": name,
                "subtitle": subtitle or "—",
                "linkTo": link,
                "createdAt": created_at,
            })
            # If a draft was generated alongside, surface it as its own row.
            # gmailDraftUrl, when present, is the deep link to the actual
            # Gmail draft; the frontend opens it in a new tab.
            if c.get("emailSubject") or c.get("emailBodyPreview"):
                draft_url = c.get("gmailDraftUrl") or ""
                out.append({
                    "id": f"{action_id}-d{i}",
                    "type": "draft",
                    "title": c.get("emailSubject") or f"Draft to {name}",
                    "subtitle": (c.get("emailBodyPreview") or "")[:120],
                    "linkTo": draft_url or (f"/tracker?contact={contact_id}" if contact_id else "/tracker"),
                    "external": bool(draft_url),
                    "createdAt": created_at,
                })

    # find_jobs — produce job rows. If the job has an apply link, route the
    # "View" click straight to it (external). Otherwise drop the user on the
    # job board filtered to this job.
    elif action_type == "find_jobs":
        jobs = result.get("jobs") or []
        for i, j in enumerate(jobs):
            if not isinstance(j, dict):
                continue
            title = j.get("title") or "Job"
            if _looks_like_garbage(title):
                continue
            company = j.get("company") or action.get("company") or ""
            location = j.get("location") or ""
            subtitle = " · ".join([s for s in [company, location] if s])
            apply_link = j.get("applyLink") or j.get("url") or ""
            job_id = j.get("id") or ""
            if apply_link:
                link, external = apply_link, True
            elif job_id:
                link, external = f"/job-board?job={job_id}", False
            else:
                link, external = "/job-board", False
            out.append({
                "id": f"{action_id}-j{i}",
                "type": "job",
                "title": title,
                "subtitle": subtitle or "—",
                "linkTo": link,
                "external": external,
                "createdAt": created_at,
            })

    # discover_companies — produce company rows
    elif action_type == "discover_companies":
        companies = result.get("companies") or []
        for i, co in enumerate(companies):
            if not isinstance(co, dict):
                continue
            name = co.get("name") or "Company"
            if _looks_like_garbage(name):
                continue
            reason = co.get("reason") or co.get("industry") or ""
            out.append({
                "id": f"{action_id}-co{i}",
                "type": "company",
                "title": name,
                "subtitle": reason or "—",
                "linkTo": f"/find?tab=companies&q={name}",
                "createdAt": created_at,
            })

    return out


def run_loop_now(uid: str, loop_id: str, app=None) -> dict | None:
    """Manually trigger another cycle for a Loop already in 'running' state.

    Used by the "Run now" button on the detail page. Doesn't change status —
    if the Loop was running, it stays running; if it was paused, the caller
    should resume_loop instead.
    """
    db = get_db()
    ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    if not ref.get().exists:
        return None
    trigger_loop_cycle(uid, loop_id, app)
    return get_loop(uid, loop_id)


def pause_loop(uid: str, loop_id: str) -> dict | None:
    db = get_db()
    ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    if not ref.get().exists:
        return None
    ref.update({"status": "paused", "nextRunAt": None})
    return get_loop(uid, loop_id)


def resume_loop(uid: str, loop_id: str, app=None) -> dict | None:
    db = get_db()
    ref = (
        db.collection("users").document(uid)
          .collection("loops").document(loop_id)
    )
    doc = ref.get()
    if not doc.exists:
        return None
    loop = doc.to_dict() or {}
    # Phase 8: respect cadence on resume just like start.
    cadence = loop.get("cadence", "every_other_day")
    hours = cadence_delta_hours(cadence)
    next_run = (
        (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()
        if hours else None
    )
    ref.update({
        "status": "running",
        "nextRunAt": next_run,
        "pauseReason": None,
    })
    # Resume = the user wants something to happen now, not on the next tick.
    trigger_loop_cycle(uid, loop_id, app)
    return get_loop(uid, loop_id)


# ── Tier caps ───────────────────────────────────────────────────────────────

def get_loop_limits(uid: str, tier: str) -> dict:
    """Used by the frontend to decide whether to disable the '+ New Loop' tile."""
    existing = list_loops(uid)
    cap = _max_loops_for_tier(tier)
    return {
        "used": len(existing),
        "cap": cap,
        "canCreate": len(existing) < cap,
    }


# ── Legacy migration ────────────────────────────────────────────────────────

def _migrate_legacy_config(uid: str) -> dict | None:
    """Convert a legacy users/{uid}/settings/agent_config singleton into the
    user's first Loop. Returns the new Loop doc, or None if there was no
    legacy config to migrate.

    Runs at most once per user — after migration, the legacy config is marked
    with migratedToLoops=True so we don't re-migrate on every list call.
    """
    db = get_db()
    legacy_ref = (
        db.collection("users").document(uid)
          .collection("settings").document("agent_config")
    )
    legacy = legacy_ref.get()
    if not legacy.exists:
        return None
    legacy_data = legacy.to_dict() or {}
    if legacy_data.get("migratedToLoops"):
        return None
    # Only migrate if there's actually something there worth preserving.
    has_targets = bool(
        legacy_data.get("targetCompanies")
        or legacy_data.get("targetIndustries")
        or legacy_data.get("briefText")
    )
    if not has_targets:
        legacy_ref.update({"migratedToLoops": True})
        return None

    brief_text = legacy_data.get("briefText") or ""
    brief_parsed = legacy_data.get("briefParsed")

    # If the user predates briefs entirely, synthesize one from legacy targets
    # so the Loop has something meaningful to plan against.
    if not brief_text and not brief_parsed:
        targets = legacy_data.get("targetCompanies") or []
        roles = legacy_data.get("targetRoles") or []
        industries = legacy_data.get("targetIndustries") or []
        parts = []
        if roles:
            parts.append(f"{roles[0]} roles")
        if targets:
            parts.append(f"at {', '.join(targets[:3])}")
        elif industries:
            parts.append(f"in {industries[0]}")
        brief_text = " ".join(parts) or "Networking outreach"
        brief_parsed = {
            "companies": targets,
            "industries": industries,
            "roles": roles,
            "locations": legacy_data.get("targetLocations") or [],
            "emailPurpose": None,
            "constraints": [],
            "targetCount": None,
        }

    now = datetime.now(timezone.utc).isoformat()
    loop_id = str(uuid.uuid4())
    loop_doc = {
        **_loop_defaults(),
        "name": _auto_name_from_brief(brief_parsed, brief_text),
        "briefText": brief_text,
        "briefParsed": brief_parsed,
        "reviewBeforeSend": legacy_data.get("approvalMode", "review_first") == "review_first",
        "weeklyTarget": legacy_data.get("weeklyContactTarget", 5),
        "smsEnabled": legacy_data.get("smsEnabled", False),
        "status": legacy_data.get("status", "idle") if legacy_data.get("status") in LOOP_STATUS else "idle",
        "createdAt": legacy_data.get("deployedAt") or now,
        "lastRunAt": legacy_data.get("lastCycleAt"),
        "nextRunAt": legacy_data.get("nextCycleAt"),
        "totalContactsFound": legacy_data.get("totalContactsFound", 0),
        "totalEmailsDrafted": legacy_data.get("totalEmailsDrafted", 0),
        "totalRepliesReceived": legacy_data.get("totalRepliesReceived", 0),
        "totalJobsFound": legacy_data.get("totalJobsFound", 0),
        "totalHmsContacted": legacy_data.get("totalHmsContacted", 0),
        "totalCompaniesDiscovered": legacy_data.get("totalCompaniesDiscovered", 0),
    }
    db.collection("users").document(uid) \
      .collection("loops").document(loop_id).set(loop_doc)

    legacy_ref.update({"migratedToLoops": True, "primaryLoopId": loop_id})
    logger.info("Loop migration: created loop=%s for uid=%s", loop_id, uid)
    return {"id": loop_id, **loop_doc}
