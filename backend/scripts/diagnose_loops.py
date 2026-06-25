"""
Read-only Loop diagnostic.

Reconciles the data sources that can drift apart for a user's Loops and prints
aggregate counts only (no contact PII). Touches nothing — pure reads.

Per Loop it lines up:
  counter   loop.totalContactsFound          (stored counter on the Loop doc)
  live      contacts (source=agent, loopId)  (actual saved records — truth)
  draft     of those, pipelineStage=draft_created
  sent      of those, a post-send stage
  actions   agent_actions joined via agent_cycles(loopId)→action(cycleId)
  listRows  result rows those actions carry  (what the activity list renders)

When these disagree you're looking at drift (e.g. a stale counter, or
agent_actions rows for contacts that no longer exist). It also surfaces
"orphan" agent contacts whose loopId is empty or points at a deleted Loop —
the usual cause of inflated "drafts waiting" and phantom list rows.

Usage (from the repo root, with the project venv):
    PYTHONPATH=backend:. ./venv/bin/python backend/scripts/diagnose_loops.py you@email.com
"""
import sys
from datetime import datetime, timezone

import app.config  # noqa: F401  — import triggers load_dotenv() before Firestore init
from app.extensions import get_db, init_firebase
from app.services.loop_budget import _start_of_iso_week_utc
from firebase_admin import auth

POST_SEND = {"email_sent", "waiting_on_reply", "replied", "meeting_scheduled",
             "connected", "no_response", "bounced", "closed"}


def _within_week(created, week_start) -> bool:
    if not created:
        return False
    try:
        ts = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts >= week_start
    except (TypeError, ValueError):
        return False


def main(email: str) -> None:
    init_firebase(None)  # arg is ignored; init reads env credentials
    db = get_db()
    uid = auth.get_user_by_email(email).uid
    user_ref = db.collection("users").document(uid)
    week_start = _start_of_iso_week_utc(datetime.now(timezone.utc))

    loops = {d.id: (d.to_dict() or {}) for d in user_ref.collection("loops").stream()}

    # contacts (source of truth), bucketed by loopId
    contacts: dict = {}
    total_agent = 0
    for d in user_ref.collection("contacts").stream():
        c = d.to_dict() or {}
        if c.get("source") != "agent":
            continue
        total_agent += 1
        b = contacts.setdefault(
            c.get("loopId") or "", {"all": 0, "week": 0, "draft": 0, "sent": 0}
        )
        b["all"] += 1
        if _within_week(c.get("createdAt"), week_start):
            b["week"] += 1
        stage = c.get("pipelineStage")
        if stage == "draft_created":
            b["draft"] += 1
        elif stage in POST_SEND:
            b["sent"] += 1

    # agent_actions joined the way the activity list joins them: via cycles
    cycle_loop = {
        d.id: (d.to_dict() or {}).get("loopId") or ""
        for d in user_ref.collection("agent_cycles").stream()
    }
    actions: dict = {}
    rows: dict = {}
    for d in user_ref.collection("agent_actions").stream():
        a = d.to_dict() or {}
        lid = cycle_loop.get(a.get("cycleId") or "", a.get("loopId") or "")
        actions[lid] = actions.get(lid, 0) + 1
        res = a.get("result") or {}
        rows[lid] = rows.get(lid, 0) + sum(
            len(res.get(k) or []) for k in ("contacts", "drafts", "jobs", "hms", "companies")
            if isinstance(res.get(k), list)
        )

    # ── report ──
    print(f"\nAccount: {email}  (uid {uid[:8]}…)")
    print(f"ISO week start: {week_start.isoformat()}")
    print(f"source=agent contacts: {total_agent} "
          f"(orphans: {sum(v['all'] for k, v in contacts.items() if k not in loops)})\n")

    print(f"{'Loop':22} {'counter':>8} {'live':>5} {'week':>5} "
          f"{'draft':>6} {'sent':>5} {'actions':>8} {'listRows':>9}")
    print("-" * 78)
    for lid, lp in loops.items():
        c = contacts.get(lid, {"all": 0, "week": 0, "draft": 0, "sent": 0})
        print(f"{(lp.get('name') or '?')[:22]:22} {lp.get('totalContactsFound', 0):>8} "
              f"{c['all']:>5} {c['week']:>5} {c['draft']:>6} {c['sent']:>5} "
              f"{actions.get(lid, 0):>8} {rows.get(lid, 0):>9}")

    orphans = {k: v for k, v in contacts.items() if k not in loops}
    if orphans:
        print("\nOrphan agent contacts (loopId empty or pointing at a deleted Loop):")
        for k, v in orphans.items():
            print(f"  loopId={(k[:12] or '(empty)'):12} all={v['all']} "
                  f"draft={v['draft']} sent={v['sent']}")

    u = user_ref.get().to_dict() or {}
    print("\nCredits:")
    for k in ("subscriptionTier", "credits", "maxCredits", "bonusCredits",
              "promoCredits", "isProTrialActive", "lastCreditReset"):
        if k in u:
            print(f"  {k}: {u[k]}")
    for lid, lp in loops.items():
        print(f"  {(lp.get('name') or '?')[:18]:18} weekCreditsSpent="
              f"{lp.get('weekCreditsSpent', 0)} / budget={lp.get('creditBudgetPerWeek')}")
    print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: PYTHONPATH=backend:. ./venv/bin/python "
              "backend/scripts/diagnose_loops.py you@email.com")
        raise SystemExit(1)
    main(sys.argv[1])
