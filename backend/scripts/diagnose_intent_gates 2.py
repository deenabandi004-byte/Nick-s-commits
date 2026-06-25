"""Diagnose why a specific user is seeing 0 jobs through the intent gates.

Reads the user's profile from Firestore, builds their intent dict via the
same code path the live feed uses, then samples N jobs from the pipeline
and reports per-gate kept/dropped counts plus sample failure reasons.

Answers the question: "is the user's profile too tight, or are the gates
over-filtering valid jobs?"

Usage:
    python backend/scripts/diagnose_intent_gates.py <uid>
    python backend/scripts/diagnose_intent_gates.py --email=you@example.com
    python backend/scripts/diagnose_intent_gates.py <uid> --sample=200
    python backend/scripts/diagnose_intent_gates.py <uid> --pdl-expand
"""
import os
import sys
import json
from collections import Counter

# Both path styles for the transitive imports (mirrors title_enrich_dry_run.py)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))

import firebase_admin
from firebase_admin import credentials, firestore

from app.utils.intent_gates import (
    build_user_intent,
    expand_intent_with_pdl,
    _gate_by_level,
    _gate_by_location,
    _gate_by_interest,
)


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()
    return firestore.client()


def _parse_arg(name: str, default):
    for arg in sys.argv:
        if arg.startswith(f"--{name}="):
            try:
                return int(arg.split("=", 1)[1])
            except ValueError:
                pass
    return default


def _safe_str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    return str(v)


def _short(s, n=70):
    s = _safe_str(s)
    return s if len(s) <= n else s[: n - 1] + "…"


def _resolve_uid(db, args: list[str]) -> str | None:
    """Accept either a positional UID or --email=... and resolve to a UID."""
    for arg in args[1:]:
        if arg.startswith("--email="):
            email = arg.split("=", 1)[1].strip().lower()
            # firebase_admin.auth can look up by email directly — no Firestore
            # scan needed and works even if the user doc doesn't store email.
            from firebase_admin import auth as fb_auth
            try:
                return fb_auth.get_user_by_email(email).uid
            except Exception as e:
                print(f"❌ Email lookup failed for {email}: {e}")
                return None
    # First non-flag arg is the UID.
    for arg in args[1:]:
        if not arg.startswith("--"):
            return arg
    return None


def main():
    sample_size = _parse_arg("sample", 200)
    use_pdl_expansion = "--pdl-expand" in sys.argv

    db = get_db()
    uid = _resolve_uid(db, sys.argv)
    if not uid:
        print(__doc__)
        sys.exit(2)

    # 1. Fetch the user's profile.
    user_doc = db.collection("users").document(uid).get()
    if not user_doc.exists:
        print(f"❌ No user document for uid={uid}")
        sys.exit(1)
    profile = user_doc.to_dict() or {}

    # 2. Build intent using the same code path the live feed uses.
    intent = build_user_intent(profile)
    if use_pdl_expansion:
        print("→ Applying PDL career-interest expansion...")
        intent = expand_intent_with_pdl(intent)

    print()
    print("=" * 72)
    print(f"User intent for uid={uid[:12]}...")
    print("=" * 72)
    # Print intent without dumping huge fields
    printable = {
        k: v for k, v in intent.items()
        if k not in ("dream_companies",) or v
    }
    print(json.dumps(printable, indent=2, default=str))
    print()

    if not any([
        intent.get("preferred_locations"),
        intent.get("career_interests"),
        intent.get("graduation_year"),
    ]):
        print("⚠️  Intent has NO gate-relevant fields set. All gates will pass-through.")
        print("    User probably skipped onboarding or hit a profile-write bug.")
        sys.exit(0)

    # 3. Sample jobs from the pipeline.
    print(f"Sampling {sample_size} jobs from Firestore...")
    jobs: list[dict] = []
    # Sample by limit-only (no ordering) — Firestore returns whatever's fastest.
    # For a true random sample we'd need cardinality info; this is a
    # reasonable proxy for "what the feed is seeing right now."
    for doc in db.collection("jobs").limit(sample_size).stream():
        d = doc.to_dict() or {}
        d["_id"] = doc.id
        jobs.append(d)

    if not jobs:
        print("❌ No jobs in collection — pipeline hasn't written anything.")
        sys.exit(1)

    # 4. Run each gate independently.
    failures = {"level": [], "location": [], "interest": []}
    pass_all = []
    structured_present = 0
    title_meta_present = 0

    for j in jobs:
        if j.get("structured"):
            structured_present += 1
        if (j.get("structured") or {}).get("title_meta"):
            title_meta_present += 1

        fails_level = _gate_by_level(j, intent)
        fails_loc = _gate_by_location(j, intent)
        fails_int = _gate_by_interest(j, intent)

        if fails_level:
            failures["level"].append(j)
        if fails_loc:
            failures["location"].append(j)
        if fails_int:
            failures["interest"].append(j)

        if not (fails_level or fails_loc or fails_int):
            pass_all.append(j)

    # 5. Report.
    print()
    print("=" * 72)
    print(f"Gate results across {len(jobs)} sampled jobs")
    print("=" * 72)
    print(f"  PASSED all gates:           {len(pass_all)} ({len(pass_all)*100//len(jobs)}%)")
    print(f"  Dropped by LEVEL gate:      {len(failures['level'])}")
    print(f"  Dropped by LOCATION gate:   {len(failures['location'])}")
    print(f"  Dropped by INTEREST gate:   {len(failures['interest'])}")
    print()
    print("Job data quality (lower = ranker/gates have less to work with):")
    print(f"  with structured field:      {structured_present}/{len(jobs)} ({structured_present*100//len(jobs)}%)")
    print(f"  with structured.title_meta: {title_meta_present}/{len(jobs)} ({title_meta_present*100//len(jobs)}%)")
    print()

    # Per-gate samples. Show 5 failures and 5 nearest-passes so we can
    # eyeball "is this gate working as intended?"
    for gate_name in ("level", "location", "interest"):
        fails = failures[gate_name]
        if not fails:
            continue
        print(f"--- Sample {gate_name.upper()} failures (first 5) ---")
        for j in fails[:5]:
            loc = _short(j.get("location"), 40)
            title = _short(j.get("title"), 50)
            company = _short(j.get("company"), 20)
            extra = ""
            if gate_name == "level":
                lvl = (j.get("structured") or {}).get("experience_level") or "?"
                extra = f"  experience_level={lvl!r}"
            elif gate_name == "location":
                remote = j.get("remote")
                extra = f"  remote={remote}"
            elif gate_name == "interest":
                reqs = (j.get("structured") or {}).get("requirements") or []
                extra = f"  reqs[0:2]={reqs[:2]}"
            print(f"  · {company:<20} | {title:<50} | {loc:<40}{extra}")
        print()

    print(f"--- Sample SURVIVORS (first 5) ---")
    for j in pass_all[:5]:
        loc = _short(j.get("location"), 40)
        title = _short(j.get("title"), 50)
        company = _short(j.get("company"), 20)
        print(f"  · {company:<20} | {title:<50} | {loc:<40}")
    if not pass_all:
        print("  (none — every sampled job failed at least one gate)")
    print()

    # 6. Decision banner.
    pass_pct = len(pass_all) * 100 // len(jobs)
    print("=" * 72)
    if pass_pct >= 30:
        print(f"✓ {pass_pct}% of jobs survive gates. Gates are healthy for this user.")
        print("  If the live feed shows 0, the prefilter/ranker is the bottleneck, not the gates.")
    elif pass_pct >= 5:
        print(f"⚠ Only {pass_pct}% of jobs survive. User's profile is tight but workable.")
        print("  Suggest: relax location preference OR add broader career interests.")
    else:
        print(f"✗ {pass_pct}% pass-through. The combination of profile + gates is starving the feed.")
        print("  Either the profile is unrealistically narrow OR a gate is over-zealous.")
        print("  Look at the failure samples above to decide.")
    print("=" * 72)


if __name__ == "__main__":
    main()
