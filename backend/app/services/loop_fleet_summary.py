"""
Fleet-level rollups for the Loops fleet view (LoopsCommandBar).

The fleet view's command bar shows three things in one card:
  1. "Found this week" — total contacts surfaced across every Loop, ISO week.
  2. "Drafts waiting on you" — sum of pendingDrafts across every Loop.
  3. Weekly-goal ring — foundThisWeek over the sum of per-Loop weeklyTargets.

Plus a live activity ticker at the bottom rotating through the most recent
finds across all Loops.

These rollups only read existing Firestore collections (loops, agent_actions);
no new data model.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.extensions import get_db
from app.services.loop_budget import _start_of_iso_week_utc
from app.services.loop_service import _action_to_items
from app.services.outbox_service import POST_SEND_STAGES, REPLIED_STAGES

logger = logging.getLogger(__name__)


def _within_week(created, week_start_dt: datetime) -> bool:
    """True if `created` (ISO string or datetime) falls in the current ISO week.

    Defensive about the shapes Firestore hands back — agent contacts store an
    ISO string ("…Z" or "+00:00"), but a datetime can slip through. Naive
    timestamps are assumed UTC. Anything unparseable counts as "not this week"
    so it can only ever UNDER-count, never inflate the weekly number.
    """
    if not created:
        return False
    try:
        if isinstance(created, str):
            ts = datetime.fromisoformat(created.replace("Z", "+00:00"))
        else:
            ts = created
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return False
    return ts >= week_start_dt


def get_found_counts_by_loop(uid: str) -> dict:
    """Per-Loop found counts — this ISO week AND all-time — from actual agent
    contact records.

    One pass over the contacts subcollection, bucketed by loopId. The LoopCard
    shows the weekly number against its weekly target; the all-time number is
    what keeps the Monday weekly-reset from reading like every find vanished.
    Only source=="agent" contacts carrying a loopId are counted (manual imports
    and orphaned/legacy contacts with no loopId are ignored).

    Returns { loopId: {"week": int, "all": int, "drafts": int} }, where
    `drafts` is the count still sitting in draft_created (ready for the user to
    send) — the action-first card leads with this. Loops with no finds are
    absent — the caller defaults them to 0.
    """
    db = get_db()
    week_start_dt = _start_of_iso_week_utc(datetime.now(timezone.utc))
    counts: dict = {}
    try:
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        for doc in contacts_ref.stream():
            data = doc.to_dict() or {}
            if data.get("source") != "agent":
                continue
            loop_id = data.get("loopId") or ""
            if not loop_id:
                continue
            bucket = counts.setdefault(loop_id, {"week": 0, "all": 0, "drafts": 0})
            bucket["all"] += 1
            if data.get("pipelineStage") == "draft_created":
                bucket["drafts"] += 1
            if _within_week(data.get("createdAt"), week_start_dt):
                bucket["week"] += 1
    except Exception:
        logger.exception("get_found_counts_by_loop: failed for uid=%s", uid)
    return counts


def get_loop_live_stats(uid: str, loop_id: str) -> dict:
    """Live Found / Emailed / Replied for ONE Loop, from actual contact records.

    The Loop doc carries totalContactsFound / totalEmailsDrafted counters, but
    they drift badly — observed over-counting (counter 33 vs 6 real records)
    and under-counting (counter 0 while 2 records exist). The contacts
    collection is the source of truth, so the detail-page funnel reads this
    instead of the stored counters.

    Scoped to source=="agent" contacts carrying this loopId:
      found   — every contact the Loop surfaced
      emailed — has an email (drafted or sent)
      replied — the contact replied (or has an unread reply)
      foundThisWeek — found subset created in the current ISO week
    """
    db = get_db()
    week_start_dt = _start_of_iso_week_utc(datetime.now(timezone.utc))
    found = emailed = replied = found_week = 0
    try:
        contacts_ref = db.collection("users").document(uid).collection("contacts")
        for doc in contacts_ref.stream():
            data = doc.to_dict() or {}
            if data.get("source") != "agent" or (data.get("loopId") or "") != loop_id:
                continue
            found += 1
            if _within_week(data.get("createdAt"), week_start_dt):
                found_week += 1
            stage = data.get("pipelineStage")
            if stage == "draft_created" or stage in POST_SEND_STAGES:
                emailed += 1
            if stage in REPLIED_STAGES or data.get("hasUnreadReply"):
                replied += 1
    except Exception:
        logger.exception(
            "get_loop_live_stats: failed for uid=%s loop=%s", uid, loop_id
        )
    return {
        "found": found,
        "emailed": emailed,
        "replied": replied,
        "foundThisWeek": found_week,
    }


# ── Weekly summary ─────────────────────────────────────────────────────────


def get_fleet_weekly_summary(uid: str) -> dict:
    """Aggregate fleet-wide metrics for the LoopsCommandBar.

    "Found" counts the people we've actually moved on — drafts still waiting
    on the user plus every contact whose email has already gone out. Reading
    pipelineStage on contacts means the number matches the user's pipeline
    instead of drifting against agent_actions write history.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    week_start_dt = _start_of_iso_week_utc(now)
    week_start_iso = week_start_dt.isoformat()

    # ── weeklyGoal + active loop count from loops ──
    weekly_goal = 0
    active_loops = 0
    live_loop_ids: set = set()
    try:
        loops_ref = db.collection("users").document(uid).collection("loops")
        for doc in loops_ref.stream():
            data = doc.to_dict() or {}
            # Only count non-archived Loops toward the fleet goal so deleted
            # Loops don't keep inflating the denominator.
            if data.get("status") != "archived":
                weekly_goal += int(data.get("weeklyTarget", 0) or 0)
                active_loops += 1
                live_loop_ids.add(doc.id)
    except Exception:
        logger.exception("fleet_weekly_summary: failed to read loops for uid=%s", uid)

    # ── draftsWaiting + emailsSent from contacts ──
    # One scan of the contacts subcollection tallies two DIFFERENT things:
    #
    #   foundThisWeek — contacts the Loops actually surfaced during the CURRENT
    #     ISO week. Scoped to source=="agent" so manual imports don't count as
    #     Loop finds, and gated on createdAt so the number genuinely means
    #     "this week" — it feeds the weekly-goal ring. (Previously this summed
    #     EVERY draft+sent contact ever created, so a long-lived account always
    #     pinned the ring at 100% and "Found this week" was really a lifetime
    #     total. The week_start_dt was computed but never applied.)
    #
    #   draftsWaiting — the CURRENT draft backlog still waiting on the user to
    #     send. This is a live-state count, intentionally NOT week-filtered: a
    #     draft from last week is still waiting on you today.
    #
    # Both are gated on loopId ∈ live_loop_ids, so orphaned contacts (empty
    # loopId, or pointing at a deleted/archived Loop) never inflate the fleet
    # numbers. Observed in the wild: dozens of draft_created contacts with an
    # empty loopId were padding "drafts waiting" by an order of magnitude.
    drafts_waiting = 0
    found_this_week = 0
    found_all_time = 0  # cumulative agent finds across live Loops — keeps the
    # Monday weekly-reset from looking like all progress vanished.
    try:
        contacts_ref = (
            db.collection("users").document(uid).collection("contacts")
        )
        for doc in contacts_ref.stream():
            data = doc.to_dict() or {}
            if (data.get("loopId") or "") not in live_loop_ids:
                continue
            if data.get("pipelineStage") == "draft_created":
                drafts_waiting += 1
            if data.get("source") == "agent":
                found_all_time += 1
                if _within_week(data.get("createdAt"), week_start_dt):
                    found_this_week += 1
    except Exception:
        logger.exception("fleet_weekly_summary: failed to read contacts for uid=%s", uid)

    weekly_progress_pct = 0
    if weekly_goal > 0:
        weekly_progress_pct = min(100, round((found_this_week / weekly_goal) * 100))

    return {
        "foundThisWeek": found_this_week,
        "foundAllTime": found_all_time,
        # Sparkline is no longer rendered (LoopsCommandBar dropped the graph);
        # we keep the field in the response so older clients don't break.
        "weeklySparkline": [0] * 7,
        "draftsWaiting": drafts_waiting,
        "weeklyGoal": weekly_goal,
        "weeklyProgressPct": weekly_progress_pct,
        "activeLoopsCount": active_loops,
        "weekStartedAt": week_start_iso,
    }


# ── Fleet activity feed (ticker source) ────────────────────────────────────


def _relative_when(iso: str, now: datetime) -> str:
    """Compact relative time string ("2m", "11m", "1h", "3h", "2d") for the
    activity ticker. Empty if the timestamp can't be parsed."""
    if not iso:
        return ""
    try:
        ts = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return ""
    delta = now - ts
    secs = int(delta.total_seconds())
    if secs < 60:
        return "just now"
    if secs < 3600:
        return f"{secs // 60}m"
    if secs < 86400:
        return f"{secs // 3600}h"
    return f"{secs // 86400}d"


def get_fleet_feed(uid: str, limit: int = 20) -> list[dict]:
    """Newest finds across every Loop, flattened into ticker-shaped rows.

    Each row matches the CommandBar's ticker contract:
        { kind, who, role, when, loopId, createdAt }

    Where `kind` is 'found' | 'draft' | 'job' | 'company'.
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    # Cap the lookback window so we don't drag through stale actions on busy
    # accounts. 7 days is more than enough — the ticker is meant to feel live.
    horizon = (now - timedelta(days=7)).isoformat()

    # Single-property order_by so Firestore uses the automatic index — no
    # composite index required. We over-fetch and filter status + horizon
    # client-side; iteration is DESC so we can break early on stale rows.
    actions_ref = (
        db.collection("users").document(uid)
          .collection("agent_actions")
          .order_by("createdAt", direction="DESCENDING")
          .limit(120)  # over-fetch — each action expands to N rows, some get
                      # filtered out as not-completed or pre-horizon
    )

    items: list[dict] = []
    try:
        for doc in actions_ref.stream():
            data = doc.to_dict() or {}
            created_at_field = data.get("createdAt") or ""
            # DESC order — once we cross the horizon, every remaining row is
            # older. Bail out instead of paging through ancient actions.
            if isinstance(created_at_field, str) and created_at_field < horizon:
                break
            if data.get("status") != "completed":
                continue
            loop_id = data.get("loopId") or ""
            # _action_to_items returns the same shape used by the per-Loop feed.
            # For the ticker we project each row into a smaller "kind/who/role"
            # form so the client renders consistently.
            sub_items = _action_to_items(doc.id, data, referenced_group_keys=None)
            for sub in sub_items:
                kind = {
                    "contact": "found",
                    "hm": "found",
                    "draft": "draft",
                    "job": "job",
                    "company": "company",
                }.get(sub.get("type", ""), "found")
                created_at = sub.get("createdAt") or data.get("completedAt") or ""
                items.append({
                    "kind": kind,
                    "who": sub.get("title", ""),
                    "role": sub.get("subtitle", ""),
                    "when": _relative_when(created_at, now),
                    "loopId": loop_id,
                    "createdAt": created_at,
                })
                if len(items) >= limit * 3:
                    break
            if len(items) >= limit * 3:
                break
    except Exception:
        logger.exception("fleet_feed: failed to read agent_actions for uid=%s", uid)

    # Re-sort newest-first (the expansion can reorder) and cap.
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return items[:limit]


# ── Suggested quickstart Loops ─────────────────────────────────────────────


# Static template set for v1. Each template carries a pre-seeded brief the
# /agent/setup page will read via location.state when the user one-taps it
# from the NewLoopTile. We keep this curated rather than LLM-generated so
# the latency is zero and the suggestions stay on-brand.
_QUICKSTART_TEMPLATES = [
    {
        "id": "ai-analysts-banks",
        "title": "AI analysts at Goldman, JPMorgan & Morgan Stanley",
        "tag": "Finance",
        "brief": (
            "Find AI/quant analyst openings at Goldman Sachs, JPMorgan, and "
            "Morgan Stanley. Surface hiring managers on their AI/ML and "
            "quant strategies teams. Draft warm outreach mentioning my "
            "background in machine learning."
        ),
        "loopMode": "both",
    },
    {
        "id": "pm-interns-stripe-ramp-notion",
        "title": "PM internships at Stripe, Ramp & Notion",
        "tag": "Product",
        "brief": (
            "Find PM internship openings at Stripe, Ramp, and Notion. "
            "Identify recruiters and PM leadership at each company. Draft "
            "outreach highlighting my product-thinking and any shipped projects."
        ),
        "loopMode": "both",
    },
    {
        "id": "usc-alumni-mbb",
        "title": "USC alumni at McKinsey, Bain & BCG",
        "tag": "Consulting",
        "brief": (
            "Find USC alumni currently working at McKinsey, Bain, and BCG. "
            "Focus on associates and consultants in offices on the West Coast. "
            "Draft warm coffee-chat outreach referencing the USC connection."
        ),
        "loopMode": "people",
    },
    {
        "id": "swe-new-grad-tech",
        "title": "New-grad SWE at Linear, Vercel & Modal",
        "tag": "Tech",
        "brief": (
            "Find new-grad and entry-level software engineering roles at "
            "Linear, Vercel, and Modal. Surface engineering managers and "
            "founding engineers. Draft outreach highlighting relevant projects."
        ),
        "loopMode": "both",
    },
]


def get_suggested_loops(uid: str, limit: int = 4) -> list[dict]:
    """Return curated quickstart Loop templates.

    v1: static set. v2 will personalize by reading the user's profile
    (school, target industries) and reordering. The shape stays stable
    across versions so the frontend doesn't change.
    """
    # Lightweight personalization stub: read the user's school and bubble
    # alumni templates if there's a match. Failures fall back to the static
    # order, which is intentionally tech-forward.
    try:
        db = get_db()
        doc = db.collection("users").document(uid).get()
        if doc.exists:
            profile = (doc.to_dict() or {}).get("professionalInfo") or {}
            school = (profile.get("school") or "").lower()
            if school and "usc" in school:
                # Move the USC template to the front.
                templates = sorted(
                    _QUICKSTART_TEMPLATES,
                    key=lambda t: 0 if "usc" in t["id"] else 1,
                )
                return templates[:limit]
    except Exception:
        logger.debug("suggested_loops: personalization read failed for uid=%s", uid)

    return _QUICKSTART_TEMPLATES[:limit]
