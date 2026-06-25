"""
Count auto-apply eligibility across the live `jobs` Firestore collection.

Uses the same is_eligible / detect_platform logic the SPA's Auto-apply
button gate uses, so the count matches what users actually see.
"""
import os
import sys
from collections import Counter

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_ROOT = os.path.dirname(_BACKEND)
sys.path.insert(0, _BACKEND)
sys.path.insert(0, _PROJECT_ROOT)

from dotenv import load_dotenv
load_dotenv()

import firebase_admin
from firebase_admin import credentials, firestore

from app.services.auto_apply.ats_detector import detect_platform, is_eligible


def _init_firestore():
    if firebase_admin._apps:
        return firestore.client()
    cred = credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"])
    firebase_admin.initialize_app(cred)
    return firestore.client()


def main() -> int:
    db = _init_firestore()
    total = 0
    eligible = 0
    expired = 0
    by_platform: Counter = Counter()
    by_source_tag: Counter = Counter()
    eligibility_path: Counter = Counter()

    print("scanning jobs collection (this can take 30-60s)...")
    for doc in db.collection("jobs").stream():
        total += 1
        job = doc.to_dict() or {}
        if job.get("expired") is True:
            expired += 1
        platform = detect_platform(job)
        if is_eligible(job):
            eligible += 1
            by_platform[platform] += 1
            # Figure out which signal got us here
            if (job.get("ats_platform") or "").lower().strip() in ("greenhouse", "lever", "ashby"):
                eligibility_path["ats_platform_tag"] += 1
            elif (job.get("ats_source_domain") or "").lower().strip() in (
                "boards.greenhouse.io", "job-boards.greenhouse.io",
                "jobs.lever.co", "jobs.ashbyhq.com",
            ):
                eligibility_path["ats_source_domain_tag"] += 1
            elif "_" in str(job.get("job_id") or ""):
                eligibility_path["job_id_prefix"] += 1
            else:
                eligibility_path["apply_url_hostname_fallback"] += 1
        by_source_tag[(job.get("ats_platform") or "").lower().strip() or "(none)"] += 1

    print(f"\n=== AUTO-APPLY ELIGIBILITY ===")
    print(f"Total jobs in `jobs` collection: {total:,}")
    print(f"  Expired (excluded): {expired:,}")
    print(f"  Auto-apply ELIGIBLE: {eligible:,} ({eligible/total*100:.1f}% of all)")
    print(f"  Not eligible: {total - eligible:,}")

    print(f"\n=== ELIGIBLE BY ATS ===")
    for platform, count in by_platform.most_common():
        print(f"  {platform:12s}: {count:,}")

    print(f"\n=== HOW ELIGIBILITY WAS DETERMINED ===")
    for path, count in eligibility_path.most_common():
        print(f"  {path:40s}: {count:,}")

    print(f"\n=== TOP `ats_platform` SOURCE TAGS (eligible+ineligible) ===")
    for tag, count in by_source_tag.most_common(15):
        print(f"  {tag:30s}: {count:,}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
