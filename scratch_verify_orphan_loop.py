"""Verify whether Loop fb01df16-... is orphaned and where its cycle results landed.

Read-only — does NOT modify any Firestore data.
"""
import os
import sys
import firebase_admin
from firebase_admin import credentials, firestore

UID = "LuzKRser4GcEyhadU9kZ5gvc2Q63"
ORPHAN_LOOP_ID = "fb01df16-de10-40d0-a224-5c578e41cd28"
CYCLE_END_HINT = "2026-06-11T12:11"

SA_PATH = "/Users/karthik/work/Offerloop/firebase-sa.json"
cred = credentials.Certificate(SA_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()


def header(s):
    print(f"\n{'='*60}\n{s}\n{'='*60}")


# 1. Does the orphan loop doc actually still not exist?
header(f"1. Loop doc users/{UID}/loops/{ORPHAN_LOOP_ID}")
loop_ref = db.collection("users").document(UID).collection("loops").document(ORPHAN_LOOP_ID)
loop_snap = loop_ref.get()
if loop_snap.exists:
    d = loop_snap.to_dict() or {}
    print(f"  EXISTS. status={d.get('status')!r} name={d.get('name')!r}")
    print(f"  totalContactsFound={d.get('totalContactsFound')}")
    print(f"  totalEmailsDrafted={d.get('totalEmailsDrafted')}")
    print(f"  totalJobsFound={d.get('totalJobsFound')}")
    print(f"  totalHmsContacted={d.get('totalHmsContacted')}")
    print(f"  cycleRunning={d.get('cycleRunning')} cycleStartedAt={d.get('cycleStartedAt')}")
    print(f"  createdAt={d.get('createdAt')} lastRunAt={d.get('lastRunAt')}")
else:
    print("  MISSING — confirms the 404 from the log.")


# 2. What loops DO exist for this user right now?
header(f"2. All current loops for {UID}")
loops_coll = db.collection("users").document(UID).collection("loops")
loops = list(loops_coll.stream())
print(f"  total: {len(loops)}")
for snap in loops:
    d = snap.to_dict() or {}
    print(
        f"  - id={snap.id} name={d.get('name')!r} status={d.get('status')!r} "
        f"createdAt={d.get('createdAt')} "
        f"counters=(c={d.get('totalContactsFound', 0)}, e={d.get('totalEmailsDrafted', 0)}, "
        f"j={d.get('totalJobsFound', 0)}, h={d.get('totalHmsContacted', 0)})"
    )


# 3. Contacts tagged with the orphan loopId
header(f"3. Contacts where loopId == {ORPHAN_LOOP_ID}")
contacts_q = (
    db.collection("users").document(UID).collection("contacts")
    .where(filter=firestore.FieldFilter("loopId", "==", ORPHAN_LOOP_ID))
)
contacts = list(contacts_q.stream())
print(f"  count: {len(contacts)}")
for snap in contacts:
    d = snap.to_dict() or {}
    name = d.get("Name") or d.get("name") or f"{d.get('FirstName', '')} {d.get('LastName', '')}".strip()
    email = d.get("WorkEmail") or d.get("Email") or d.get("email")
    company = d.get("Company") or d.get("company")
    title = d.get("Title") or d.get("jobTitle") or d.get("job_title")
    src = d.get("discoveredVia") or d.get("source") or "?"
    print(f"  - {name!r} @ {company!r} | {title!r} | {email!r} | via={src!r} | id={snap.id}")


# 4. Jobs tagged with the orphan loopId
header(f"4. agent_jobs where loopId == {ORPHAN_LOOP_ID}")
jobs_q = (
    db.collection("users").document(UID).collection("agent_jobs")
    .where(filter=firestore.FieldFilter("loopId", "==", ORPHAN_LOOP_ID))
)
jobs = list(jobs_q.stream())
print(f"  count: {len(jobs)}")
for snap in jobs:
    d = snap.to_dict() or {}
    print(
        f"  - {d.get('title')!r} @ {d.get('company')!r} | {d.get('location')!r} "
        f"| {d.get('url')!r} | id={snap.id}"
    )


# 5. Cycles + actions tagged with this loopId — proves the cycle persisted itself
header(f"5. agent_cycles where loopId == {ORPHAN_LOOP_ID}")
cycles_q = (
    db.collection("users").document(UID).collection("agent_cycles")
    .where(filter=firestore.FieldFilter("loopId", "==", ORPHAN_LOOP_ID))
)
cycles = list(cycles_q.stream())
print(f"  count: {len(cycles)}")
for snap in cycles:
    d = snap.to_dict() or {}
    print(
        f"  - id={snap.id} status={d.get('status')!r} startedAt={d.get('startedAt')} "
        f"finishedAt={d.get('finishedAt')} "
        f"summary contactsFound={d.get('contactsFound')} jobsFound={d.get('jobsFound')} "
        f"hmsFound={d.get('hmsFound')} emailsDrafted={d.get('emailsDrafted')}"
    )

header("6. agent_actions for those cycles (status=completed)")
cycle_ids = [s.id for s in cycles]
if not cycle_ids:
    print("  no cycles → no actions to look up")
else:
    actions_col = db.collection("users").document(UID).collection("agent_actions")
    total_actions = 0
    for i in range(0, len(cycle_ids), 30):
        chunk = cycle_ids[i:i + 30]
        q = (
            actions_col
            .where(filter=firestore.FieldFilter("cycleId", "in", chunk))
            .where(filter=firestore.FieldFilter("status", "==", "completed"))
        )
        for snap in q.stream():
            total_actions += 1
            d = snap.to_dict() or {}
            result = d.get("result") or {}
            n_contacts = len((result.get("contacts") or [])) if isinstance(result, dict) else 0
            n_jobs = len((result.get("jobs") or [])) if isinstance(result, dict) else 0
            print(
                f"  - action={d.get('action')!r} cycleId={d.get('cycleId')} "
                f"creditsSpent={d.get('creditsSpent')} | result: contacts={n_contacts} jobs={n_jobs}"
            )
    print(f"  total completed actions: {total_actions}")


print("\nDone (read-only).")
