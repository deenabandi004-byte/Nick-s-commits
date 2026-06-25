"""
loop_budget — pure-ish helpers for deciding whether a Loop is allowed to run
and what its expected cost looks like.

Used by:
  - loop_scheduler.run_due_loops() to gate each due Loop
  - routes/loops.py /estimate to power the cost-estimate strip in the UI
  - routes/loops.py /usage-breakdown to power Account Settings

These functions are deliberately small and have no Flask dependencies so they
can be called from the RQ worker process and from request handlers without
extra plumbing.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Literal

from app.config import TIER_CONFIGS
from app.extensions import get_db

logger = logging.getLogger(__name__)

# Phase 8.5 — Agent Mode credit prices. Single source of truth: agent_actions.py
# reads from this dict directly via `from app.services.loop_budget import CREDIT_COSTS`.
# Frontend mirror lives in LoopActivityFeed.tsx (CREDIT_COST_BY_TYPE) — keep in sync.
CREDIT_COSTS = {
    "contact": 9,          # find + draft via execute_find_and_draft  (was 15)
    "hiring_manager": 13,  # find + draft via execute_find_hiring_managers  (was 20)
    "job": 1,              # execute_find_jobs (per saved job)  (was 2)
    "company": 1,          # execute_discover_companies (per saved company)  (was 2)
}

# Hours per cycle by cadence. None = manual, never auto-fires.
CADENCE_HOURS = {
    "daily": 24,
    "every_other_day": 48,
    "weekly": 24 * 7,
    "manual": None,
}

PauseReason = Literal[
    "credits_capped",   # monthly pool exhausted (or below floor)
    "budget_capped",    # this Loop hit its weekly cap
    "inactivity",       # user hasn't reviewed drafts in N days
    "quiet_hours",      # outside 8am-10pm in user timezone
    "paused",           # explicitly paused by user
]

# Phase 8 — quiet-hours window (user-local).
QUIET_HOUR_START = 8   # 8 AM
QUIET_HOUR_END = 22    # 10 PM

# Inactivity threshold matches the user decision in the plan file.
INACTIVITY_DAYS = 5

# Hard floor — keep enough credits for at least one coffee chat prep (15) +
# a small buffer. Mirrors MIN_CREDIT_BALANCE in agent_service.py.
MIN_RESERVE = 25


# ── Estimation ─────────────────────────────────────────────────────────────


def estimate_cycle_cost(brief_parsed: dict | None, cadence: str = "every_other_day") -> dict:
    """Estimate credits per cycle based on what the planner will likely
    produce for this brief. Used by the Loop creation hero so users see
    expected cost before they hit Start.

    The numbers below are heuristics from the legacy agent's behavior:
    typical cycle yields 2-3 contacts, 1 HM, 4-5 jobs, 3 companies.
    """
    bp = brief_parsed or {}
    target_count = bp.get("targetCount") or 3
    has_companies = bool(bp.get("companies"))
    has_roles = bool(bp.get("roles"))

    # Per cycle the planner usually emits ~1 find action against the top
    # company. If multiple companies are listed, it may rotate through them
    # across cycles but typically picks 1 per cycle.
    contacts = min(target_count, 3)  # planner caps at 3 per find action

    # HM action fires for ~70% of cycles when target_count >= 3
    hms = 1 if contacts >= 3 else 0

    # Job and company discovery fire whenever flags are on (default true).
    # Yield ~5 jobs and ~3 companies per cycle.
    jobs = 5 if (has_roles or has_companies) else 0
    companies = 3 if has_companies else 4  # discover more if no targets named

    per_cycle = (
        contacts * CREDIT_COSTS["contact"]
        + hms * CREDIT_COSTS["hiring_manager"]
        + jobs * CREDIT_COSTS["job"]
        + companies * CREDIT_COSTS["company"]
    )

    # Cycles per ~30-day month based on cadence
    hours = CADENCE_HOURS.get(cadence) or (24 * 7)  # manual ≈ assume weekly
    cycles_per_month = max(1, (24 * 30) // hours) if hours else 0

    return {
        "per_cycle_credits": per_cycle,
        "monthly_credits": per_cycle * cycles_per_month,
        "cycles_per_month": cycles_per_month,
        "breakdown": {
            "contacts": contacts,
            "hiring_managers": hms,
            "jobs": jobs,
            "companies": companies,
        },
    }


# ── Gating ─────────────────────────────────────────────────────────────────


def _start_of_iso_week_utc(now: datetime) -> datetime:
    """Monday 00:00:00 UTC of the week containing `now`."""
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _user_local_hour(now_utc: datetime, tz_name: str | None) -> int:
    """Return the hour-of-day in the user's timezone. Falls back to PT if the
    timezone string is missing or invalid."""
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name) if tz_name else ZoneInfo("America/Los_Angeles")
        return now_utc.astimezone(tz).hour
    except Exception:
        # zoneinfo failure (bad tz string, etc.) — assume PT.
        try:
            from zoneinfo import ZoneInfo
            return now_utc.astimezone(ZoneInfo("America/Los_Angeles")).hour
        except Exception:
            return now_utc.hour  # last-resort: pretend UTC is local


def can_run_now(
    uid: str,
    loop: dict,
    monthly_remaining_credits: int,
    user_timezone: str | None = None,
    now: datetime | None = None,
) -> tuple[bool, PauseReason | None]:
    """Return (allowed, reason).

    The scheduler calls this on each candidate Loop. The reason (when not None)
    is also written to the Loop doc so the UI can show why it's stuck.

    Order matters — we check cheapest reasons first.
    """
    now = now or datetime.now(timezone.utc)

    # 1. Status / automation flag
    if loop.get("status") not in ("running",):
        return False, "paused"
    if loop.get("automationEnabled") is False:
        return False, "paused"

    # 2. Quiet hours
    hour = _user_local_hour(now, user_timezone)
    if hour < QUIET_HOUR_START or hour >= QUIET_HOUR_END:
        # Deliberately don't write pauseReason for quiet hours — it's a
        # transient defer, not a state. Scheduler tries again next tick.
        return False, "quiet_hours"

    # 3. Monthly credit floor
    if monthly_remaining_credits < MIN_RESERVE:
        return False, "credits_capped"

    # 4. Weekly per-Loop budget
    budget = int(loop.get("creditBudgetPerWeek", 200) or 200)
    spent = int(loop.get("weekCreditsSpent", 0) or 0)
    if spent >= budget:
        return False, "budget_capped"

    # 5. Inactivity — only pause if there's pending work the user is ignoring
    last_reviewed = loop.get("lastReviewedAt")
    pending = int(loop.get("pendingDrafts", 0) or 0)
    if pending > 0 and last_reviewed:
        try:
            last_dt = datetime.fromisoformat(str(last_reviewed).replace("Z", "+00:00"))
            if (now - last_dt) > timedelta(days=INACTIVITY_DAYS):
                return False, "inactivity"
        except (TypeError, ValueError):
            pass

    return True, None


def maybe_reset_week_counter(loop: dict, now: datetime | None = None) -> dict | None:
    """If the Loop's weekStartedAt is in a prior ISO week, return the patch
    that should be written to reset the counter. None if no reset needed.

    The scheduler applies this BEFORE checking budget, so a fresh week clears
    any budget_capped pause automatically.
    """
    now = now or datetime.now(timezone.utc)
    current_week_start = _start_of_iso_week_utc(now).isoformat()
    week_started = loop.get("weekStartedAt")
    if not week_started or str(week_started) < current_week_start:
        patch = {
            "weekCreditsSpent": 0,
            "weekStartedAt": current_week_start,
        }
        if loop.get("pauseReason") == "budget_capped":
            patch["pauseReason"] = None
        return patch
    return None


# ── Usage breakdown for Account Settings ───────────────────────────────────


def usage_breakdown_this_month(uid: str) -> dict:
    """Aggregate credit spend this month, grouped by source, for the Account
    Settings 'Where my credits went' panel.

    Reads from agent_actions and credit_history (if it exists). Falls back to
    just agent_actions when credit_history isn't populated.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    buckets = {
        "contacts": 0,
        "hiring_managers": 0,
        "jobs": 0,
        "companies": 0,
        "manual": 0,
        "coffee_chat_preps": 0,
        "scout": 0,
        "other": 0,
    }

    # Walk agent_actions for this month.
    try:
        actions_ref = (
            db.collection("users").document(uid)
              .collection("agent_actions")
              .where("status", "==", "completed")
              .where("createdAt", ">=", month_start)
        )
        for doc in actions_ref.stream():
            data = doc.to_dict() or {}
            credits = int(data.get("creditsSpent", 0) or 0)
            if credits <= 0:
                continue
            action = data.get("action", "")
            if action == "find":
                buckets["contacts"] += credits
            elif action == "find_hiring_managers":
                buckets["hiring_managers"] += credits
            elif action == "find_jobs":
                buckets["jobs"] += credits
            elif action == "discover_companies":
                buckets["companies"] += credits
            else:
                buckets["other"] += credits
    except Exception:
        logger.exception("usage_breakdown: failed to read agent_actions for uid=%s", uid)

    # Walk credit_history for manual operations (coffee chat, scout).
    try:
        hist_ref = (
            db.collection("users").document(uid)
              .collection("credit_history")
              .where("createdAt", ">=", month_start)
        )
        for doc in hist_ref.stream():
            data = doc.to_dict() or {}
            amount = int(data.get("amount", 0) or 0)
            if amount <= 0:
                continue
            source = (data.get("source") or "").lower()
            if "coffee" in source:
                buckets["coffee_chat_preps"] += amount
            elif "scout" in source:
                buckets["scout"] += amount
            elif source.startswith("agent_"):
                # Already counted via agent_actions stream above.
                pass
            elif "prompt_search" in source or "contact_search" in source:
                buckets["manual"] += amount
            else:
                buckets["other"] += amount
    except Exception:
        # credit_history may not exist for older users; not fatal.
        pass

    total = sum(buckets.values())
    return {"total": total, "buckets": buckets, "monthStartedAt": month_start}
