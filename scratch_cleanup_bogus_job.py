"""One-shot cleanup of the Apple 'Job Posting' placeholder.

Deletes the bogus agent_jobs doc and decrements the Loop's totalJobsFound
from 1 → 0 so the dashboard no longer shows a fake role.
"""
import sys
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import Increment

UID = "LuzKRser4GcEyhadU9kZ5gvc2Q63"
LOOP_ID = "13115010-0f11-4019-a7c8-07b7f9a058d2"
BOGUS_JOB_ID = "oRS7o8F0ftFUVvGdhwE9"

APPLY = "--apply" in sys.argv
print(f"Mode: {'APPLY' if APPLY else 'DRY RUN'}")

cred = credentials.Certificate("/Users/karthik/work/Offerloop/firebase-sa.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

job_ref = db.collection("users").document(UID).collection("agent_jobs").document(BOGUS_JOB_ID)
job = job_ref.get()
if not job.exists:
    print(f"Bogus job {BOGUS_JOB_ID} already gone.")
    sys.exit(0)
d = job.to_dict() or {}
print(f"Will delete agent_jobs/{BOGUS_JOB_ID}:")
print(f"  title={d.get('title')!r} company={d.get('company')!r} url={d.get('applyLink')!r}")

loop_ref = db.collection("users").document(UID).collection("loops").document(LOOP_ID)
loop = (loop_ref.get().to_dict() or {})
print(f"Loop totalJobsFound before: {loop.get('totalJobsFound')}")
print(f"Loop totalJobsFound after:  {(loop.get('totalJobsFound') or 0) - 1}")

if APPLY:
    job_ref.delete()
    loop_ref.update({"totalJobsFound": Increment(-1)})
    print("\n✓ deleted bogus job; ✓ decremented totalJobsFound by 1")
else:
    print("\nDRY RUN — no writes. Re-run with --apply.")
