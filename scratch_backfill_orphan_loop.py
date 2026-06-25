"""Backfill orphaned cycle results from a deleted Loop onto the user's current Loop.

Re-tag contacts/jobs/agent_cycles/agent_actions with the new loopId, then
recompute counter fields on the destination Loop doc.

USAGE:
    python scratch_backfill_orphan_loop.py          # DRY RUN (default)
    python scratch_backfill_orphan_loop.py --apply  # actually write
"""
import sys
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import Increment

UID = "LuzKRser4GcEyhadU9kZ5gvc2Q63"
ORPHAN_LOOP_ID = "fb01df16-de10-40d0-a224-5c578e41cd28"
DEST_LOOP_ID = "13115010-0f11-4019-a7c8-07b7f9a058d2"

# Counter increments (from the original cycle's complete-summary log line:
# "found=2 drafted=2 jobs=1 hms=2 cos=0").
COUNTER_DELTAS = {
    "totalContactsFound": 2,
    "totalEmailsDrafted": 2,
    "totalJobsFound": 1,
    "totalHmsContacted": 2,
    "totalCompaniesDiscovered": 0,
}

APPLY = "--apply" in sys.argv

SA_PATH = "/Users/karthik/work/Offerloop/firebase-sa.json"
cred = credentials.Certificate(SA_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()


def banner(s):
    print(f"\n{'='*60}\n{s}\n{'='*60}")


print(f"Mode: {'APPLY (writes will happen)' if APPLY else 'DRY RUN (no writes)'}")
print(f"From loopId: {ORPHAN_LOOP_ID}")
print(f"To loopId:   {DEST_LOOP_ID}")


# Pre-flight: confirm destination loop exists.
dest_ref = db.collection("users").document(UID).collection("loops").document(DEST_LOOP_ID)
dest_snap = dest_ref.get()
if not dest_snap.exists:
    print(f"ABORT: destination loop {DEST_LOOP_ID} does not exist.")
    sys.exit(1)
dest = dest_snap.to_dict() or {}
print(f"Destination Loop: name={dest.get('name')!r} status={dest.get('status')!r}")
print(f"  current counters: c={dest.get('totalContactsFound', 0)} "
      f"e={dest.get('totalEmailsDrafted', 0)} j={dest.get('totalJobsFound', 0)} "
      f"h={dest.get('totalHmsContacted', 0)}")


def retag_collection(coll_name: str, field: str = "loopId"):
    coll = db.collection("users").document(UID).collection(coll_name)
    q = coll.where(filter=firestore.FieldFilter(field, "==", ORPHAN_LOOP_ID))
    snaps = list(q.stream())
    banner(f"{coll_name}: {len(snaps)} doc(s) to re-tag ({field}: {ORPHAN_LOOP_ID} → {DEST_LOOP_ID})")
    for snap in snaps:
        print(f"  - {snap.id}")
        if APPLY:
            snap.reference.update({field: DEST_LOOP_ID})
    return len(snaps)


n_contacts = retag_collection("contacts")
n_jobs = retag_collection("agent_jobs")
n_cycles = retag_collection("agent_cycles")
n_actions = retag_collection("agent_actions")


banner(f"Loop {DEST_LOOP_ID} counter increments")
for field, delta in COUNTER_DELTAS.items():
    cur = dest.get(field, 0) or 0
    print(f"  {field}: {cur} + {delta} = {cur + delta}")

if APPLY:
    update = {
        field: Increment(delta)
        for field, delta in COUNTER_DELTAS.items()
        if delta > 0
    }
    if update:
        dest_ref.update(update)
        print("  ✓ counter increments applied")


banner("Summary")
print(f"  contacts re-tagged:      {n_contacts}")
print(f"  jobs re-tagged:          {n_jobs}")
print(f"  cycles re-tagged:        {n_cycles}")
print(f"  actions re-tagged:       {n_actions}")
print(f"  counter fields touched:  {sum(1 for v in COUNTER_DELTAS.values() if v > 0)}")
print(f"\nMode was: {'APPLY' if APPLY else 'DRY RUN — no writes occurred'}")
