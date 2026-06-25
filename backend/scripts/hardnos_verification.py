"""hardNos extraction verification pass. Read-only on rankings.

What this does:
  1. Pulls every user doc whose `hardNos` field is non-empty
  2. Runs `extract_hardnos_concepts` for each (calls gpt-4o-mini if not cached)
  3. Counts how many active jobs each extracted concept would match
  4. Samples matched jobs with the hit context so over-broad concepts are visible
  5. Confirms structurally that `apply_hardnos_penalty` cannot drop a job

What this does NOT do:
  - Trigger the ranker
  - Modify any user's feed
  - Flip the `hardnos_penalty` feature flag (that stays your call after review)

Output: Markdown report to stdout. Re-run any time the user base grows.

Usage:
    GOOGLE_APPLICATION_CREDENTIALS=path/to/creds.json \
      python -m backend.scripts.hardnos_verification

Rollout discipline (per project_hardnos_rollout_gate.md memory):
  Do not flip the `hardnos_penalty` flag above 0% rollout until at least 3
  real users have populated hardNos AND this script has been run against
  them AND a human has eyeballed the extracted concepts for over-broad
  phrases AND no concept matches more than 5% of the active job pool.
"""
import os
import re
import sys
from datetime import datetime, timezone

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))

from app.utils.hardnos_parser import (
    apply_hardnos_penalty,
    extract_hardnos_concepts,
    HARDNOS_DESC_SCAN_CHARS,
)

RED_FLAG_PCT = 5.0     # concept matching > X% of active jobs is red
YELLOW_FLAG_PCT = 1.0  # 1-5% is yellow; below 1% is OK


def main() -> int:
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path and os.path.exists(cred_path):
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        else:
            firebase_admin.initialize_app()
    db = firestore.client()
    now = datetime.now(timezone.utc)

    # -----------------------------------------------------------------------
    print("=" * 100)
    print("Loading users with non-empty hardNos...")
    print("=" * 100)

    users_with_hardnos = []
    for snap in db.collection("users").stream():
        d = snap.to_dict() or {}
        text = d.get("hardNos")
        if isinstance(text, str) and text.strip():
            users_with_hardnos.append({"uid": snap.id, "hardNos": text.strip()})

    print(f"Found {len(users_with_hardnos)} user(s) with hardNos populated.")
    if not users_with_hardnos:
        print()
        print("Nothing to verify. The hardnos_penalty path stays dormant.")
        print("Re-run this script after at least 3 users populate the field.")
        return 0

    # -----------------------------------------------------------------------
    print()
    print("Loading active jobs (expires_at > now) for match-count denominator...")
    active_jobs = []
    for snap in db.collection("jobs").where("expires_at", ">", now).stream():
        j = snap.to_dict() or {}
        j.setdefault("job_id", snap.id)
        active_jobs.append(j)
    print(f"Active jobs: {len(active_jobs):,}")

    # -----------------------------------------------------------------------
    # SECTION 1
    # -----------------------------------------------------------------------
    print()
    print("=" * 100)
    print("SECTION 1: per-user hardNos text + LLM-extracted concepts")
    print("=" * 100)

    per_user_concepts: dict = {}
    for u in users_with_hardnos:
        uid = u["uid"]
        profile = {"hardNos": u["hardNos"]}
        concepts = extract_hardnos_concepts(profile, db, uid)
        per_user_concepts[uid] = concepts
        print()
        print(f"uid: {uid[:32]}")
        print("  hardNos text:")
        for line in u["hardNos"].splitlines():
            print(f"    {line}")
        print(f"  extracted concepts: {concepts!r}")

    # -----------------------------------------------------------------------
    # Job blobs (precomputed once)
    # -----------------------------------------------------------------------
    def _blob(j):
        title = j.get("title") or ""
        company = j.get("company") or ""
        desc = j.get("description") or ""
        if not isinstance(desc, str):
            desc = str(desc)
        return f"{title} {company} {desc[:HARDNOS_DESC_SCAN_CHARS]}".lower()

    job_blobs = [(j, _blob(j)) for j in active_jobs]

    # -----------------------------------------------------------------------
    # SECTION 2
    # -----------------------------------------------------------------------
    print()
    print("=" * 100)
    print(f"SECTION 2: per-concept match count across {len(active_jobs):,} active jobs")
    print("=" * 100)
    print(f"Red flag: concept matches > {RED_FLAG_PCT}% of active pool.")
    print(f"Yellow flag: between {YELLOW_FLAG_PCT}% and {RED_FLAG_PCT}%.")
    print()

    all_concepts = sorted({c for cs in per_user_concepts.values() for c in cs})
    concept_match_counts: dict = {}
    concept_match_jobs: dict = {}
    for c in all_concepts:
        pat = re.compile(rf"\b{re.escape(c.lower())}\b")
        matches = [(j, blob) for j, blob in job_blobs if pat.search(blob)]
        concept_match_counts[c] = len(matches)
        concept_match_jobs[c] = matches

    sorted_concepts = sorted(all_concepts, key=lambda c: -concept_match_counts[c])

    if not all_concepts:
        print("No concepts extracted across any user. Nothing would be penalized.")
    else:
        print(f"  {'concept':<38} {'matches':>10} {'% of pool':>12}  flag")
        print("  " + "-" * 70)
        for c in sorted_concepts:
            n = concept_match_counts[c]
            pct = 100.0 * n / max(1, len(active_jobs))
            if pct > RED_FLAG_PCT:
                flag = "RED"
            elif pct > YELLOW_FLAG_PCT:
                flag = "yellow"
            else:
                flag = ""
            print(f"  {c[:38]:<38} {n:>10,} {pct:>11.2f}%  {flag}")

    # -----------------------------------------------------------------------
    # SECTION 3
    # -----------------------------------------------------------------------
    print()
    print("=" * 100)
    print("SECTION 3: sample matched jobs + the matching phrase in context")
    print("=" * 100)
    print("Up to 5 matches per concept with ~80 chars of surrounding text.")

    if not all_concepts:
        print("(no concepts -> no samples)")

    for c in sorted_concepts:
        matches = concept_match_jobs[c]
        if not matches:
            continue
        print()
        print(f"concept: {c!r}  ({len(matches):,} matches)")
        pat = re.compile(rf"\b{re.escape(c.lower())}\b")
        for j, blob in matches[:5]:
            m = pat.search(blob)
            start = max(0, m.start() - 40) if m else 0
            end = min(len(blob), (m.end() if m else 0) + 40)
            snippet = blob[start:end].replace("\n", " ")
            jid = j.get("job_id", "?")
            title = (j.get("title") or "")[:60]
            company = (j.get("company") or "")[:30]
            print(f"  [{jid[:30]}] {title!r} @ {company!r}")
            print(f"     ...{snippet}...")

    # -----------------------------------------------------------------------
    # SECTION 4
    # -----------------------------------------------------------------------
    print()
    print("=" * 100)
    print("SECTION 4: per-user net effect on the active job set")
    print("=" * 100)
    print("Confirms: penalty NEVER drops a job, only adjusts match_score downward.")
    print()

    for u in users_with_hardnos:
        uid = u["uid"]
        concepts = per_user_concepts.get(uid, [])
        if not concepts:
            print(f"{uid[:32]}: 0 concepts -> 0 jobs penalized (no-op)")
            continue
        synthetic = [
            {
                "job_id": j.get("job_id"),
                "title": j.get("title"),
                "company": j.get("company"),
                "description": j.get("description"),
                "match_score": 70,
            }
            for j in active_jobs
        ]
        before_len = len(synthetic)
        penalized_list, penalty_count = apply_hardnos_penalty(synthetic, concepts)
        after_len = len(penalized_list)
        drops_check = "YES (BUG)" if after_len != before_len else "no (confirmed)"
        print(
            f"{uid[:32]}: concepts={len(concepts)}  "
            f"jobs_penalized={penalty_count:,}/{before_len:,}  "
            f"penalty_drops_a_job={drops_check}"
        )

    print()
    print("=" * 100)
    print("End of verification report. No ranker invoked. No feed altered.")
    print("=" * 100)
    return 0


if __name__ == "__main__":
    sys.exit(main())
