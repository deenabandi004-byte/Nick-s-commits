#!/usr/bin/env python3
"""
Diagnose what the auto-apply LLM resolver actually sees for a user.

Reads the user doc from Firestore, surfaces the fields that feed into
`_build_student_context`, and tells you exactly where the gaps are. Use
when the drawer keeps showing questions you'd expect to auto-fill.

Usage:
    python backend/scripts/inspect_user_for_autoapply.py \\
        --email deena.bandi004@gmail.com

    # Or by uid if you already know it:
    python backend/scripts/inspect_user_for_autoapply.py --uid <uid>

    # Also render the exact context string the LLM would see:
    python backend/scripts/inspect_user_for_autoapply.py \\
        --email deena.bandi004@gmail.com --show-context
"""
import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
ROOT_DIR = os.path.dirname(BACKEND_DIR)
# Both paths so legacy `from backend.app.config import ...` resolves AND
# the modern `from app.services...` resolves. The Flask app boots from root.
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, BACKEND_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT_DIR, ".env"))
except ImportError:
    pass

import firebase_admin
from firebase_admin import credentials, firestore


def _init_firestore():
    if firebase_admin._apps:
        return firestore.client()
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()
    return firestore.client()


def _resolve_uid(db, email: str) -> str:
    snap_iter = db.collection("users").where("email", "==", email).limit(1).stream()
    for doc in snap_iter:
        return doc.id
    for doc in db.collection("users").stream():
        data = doc.to_dict() or {}
        if (data.get("email") or "").strip().lower() == email.strip().lower():
            return doc.id
    raise SystemExit(f"No user found with email {email!r}")


def _short(value, n=120):
    s = json.dumps(value, default=str) if not isinstance(value, str) else value
    if len(s) > n:
        return s[:n] + f"... ({len(s)} chars)"
    return s


def _status(present: bool, note: str = "") -> str:
    return f"  {'PRESENT' if present else 'MISSING'}{(' — ' + note) if note else ''}"


def inspect(uid: str, show_context: bool) -> None:
    db = _init_firestore()
    snap = db.collection("users").document(uid).get()
    if not snap.exists:
        raise SystemExit(f"User doc not found at users/{uid}")
    user = snap.to_dict() or {}

    print(f"=== users/{uid} ===\n")
    print(f"name:  {user.get('name') or '(missing)'}")
    print(f"email: {user.get('email') or '(missing)'}")
    print()

    # --- resumeParsed ---
    rp = user.get("resumeParsed") or {}
    if not isinstance(rp, dict):
        rp = {}
    print("=== resumeParsed ===")
    print(_status(bool(rp), f"keys: {list(rp.keys())}" if rp else "no data"))

    summary = rp.get("summary")
    print(f"  summary:    {_short(summary or '(missing)', 80)}")

    skills = rp.get("skills")
    skills_kind = (
        "dict (v2 format)" if isinstance(skills, dict)
        else "list (legacy)" if isinstance(skills, list)
        else type(skills).__name__
    )
    skills_count = 0
    if isinstance(skills, dict):
        for v in skills.values():
            if isinstance(v, list):
                skills_count += len(v)
    elif isinstance(skills, list):
        skills_count = len(skills)
    print(f"  skills:     {skills_kind}, count={skills_count}")

    experience = rp.get("experience")
    if isinstance(experience, list):
        print(f"  experience: list of {len(experience)} entries")
        for i, exp in enumerate(experience[:3]):
            if isinstance(exp, dict):
                title = exp.get("title") or "(no title)"
                company = exp.get("company") or "(no company)"
                print(f"    [{i}] {title} @ {company}")
            else:
                print(f"    [{i}] {_short(exp, 80)}")
    else:
        print(f"  experience: {type(experience).__name__} (expected list)")

    education = rp.get("education")
    if isinstance(education, list):
        print(f"  education:  list of {len(education)} entries")
        for i, edu in enumerate(education[:2]):
            if isinstance(edu, dict):
                school = edu.get("school") or "(no school)"
                degree = edu.get("degree") or "(no degree)"
                print(f"    [{i}] {degree} @ {school}")
    else:
        print(f"  education:  {type(education).__name__}")

    print()

    # --- professionalInfo (fallback for current job) ---
    prof = user.get("professionalInfo") or {}
    print("=== professionalInfo ===")
    if prof:
        for k, v in prof.items():
            print(f"  {k}: {_short(v, 60)}")
    else:
        print("  (empty)")
    print()

    # --- academics ---
    acad = user.get("academics") or {}
    print("=== academics ===")
    if acad:
        for k, v in acad.items():
            print(f"  {k}: {_short(v, 60)}")
    else:
        print("  (empty)")
    print()

    # --- location ---
    loc = user.get("location") or {}
    print("=== location ===")
    if isinstance(loc, dict) and loc:
        for k, v in loc.items():
            print(f"  {k}: {_short(v, 60)}")
    elif loc:
        print(f"  {_short(loc, 60)}")
    else:
        print("  (empty)")
    print()

    # --- applicationProfile (the auto-apply Application Profile) ---
    ap = user.get("applicationProfile") or {}
    print("=== applicationProfile ===")
    if ap:
        wa = ap.get("workAuthorization") or {}
        print(f"  workAuthorization:")
        print(f"    authorizedToWorkUS: {wa.get('authorizedToWorkUS')}")
        print(f"    requiresSponsorship: {wa.get('requiresSponsorship')}")
        print(f"    visaStatus: {wa.get('visaStatus')}")
        demo = ap.get("demographics") or {}
        print(f"  demographics: gender={demo.get('gender')} race={demo.get('race')} ethnicity={demo.get('ethnicity')}")
        print(f"  veteranStatus: {ap.get('veteranStatus')}")
        print(f"  disabilityStatus: {ap.get('disabilityStatus')}")
        prefs = ap.get("preferences") or {}
        print(f"  preferences:")
        for k, v in prefs.items():
            print(f"    {k}: {v}")
        contact = ap.get("contactInfo") or {}
        print(f"  contactInfo: phone={contact.get('phone')} linkedinUrl={contact.get('linkedinUrl')}")
        print(f"  acknowledgedAt: {ap.get('acknowledgedAt')}")
    else:
        print("  (empty — profile modal hasn't been completed)")
    print()

    # --- resume URL / file ---
    print("=== resume upload ===")
    print(f"  resumeUrl:      {('SET' if (user.get('resumeUrl') or user.get('resumeURL')) else 'MISSING')}")
    print(f"  resumeFileName: {user.get('resumeFileName') or '(missing)'}")
    print()

    # --- verdict ---
    print("=== verdict ===")
    issues = []
    if not isinstance(rp, dict) or not rp:
        issues.append("resumeParsed is empty — upload a resume in /account-settings")
    elif not (isinstance(experience, list) and experience):
        issues.append("resumeParsed.experience is empty — parser didn't extract jobs")
    elif not any(isinstance(e, dict) and (e.get("company") or e.get("title")) for e in experience):
        issues.append("resumeParsed.experience has entries but no company/title fields")
    if not (prof.get("currentCompany") or prof.get("company")):
        if not (isinstance(experience, list) and experience):
            issues.append("professionalInfo also lacks currentCompany — LLM will route Current Company to NEEDS_USER")
    if not ap:
        issues.append("applicationProfile is missing — work auth + EEO will be NEEDS_USER on every form")
    elif (ap.get("workAuthorization") or {}).get("authorizedToWorkUS") is None:
        issues.append("applicationProfile.workAuthorization.authorizedToWorkUS is unset — work-auth questions will drawer")
    if issues:
        for i in issues:
            print(f"  ! {i}")
    else:
        print("  no gaps found — LLM has enough context to answer most questions")
    print()

    if show_context:
        print("=== _build_student_context output (what the LLM actually sees) ===")
        # The auto_apply.runner module pulls openai_client which has a stale
        # `from backend.app.config import ...` import path. Inline-import the
        # two functions we need and short-circuit the dependency.
        try:
            from app.services.auto_apply.preview import build_structured_fields
            from app.services.auto_apply.runner import _build_student_context
        except ModuleNotFoundError as exc:
            print(f"  (context render unavailable: {exc})")
            print("  (this is a stale `from backend.app.config import ...` in openai_client.py,")
            print("   not an auto-apply bug — fix it in a follow-up)")
            return

        user_for_ctx = {
            "name": user.get("name"),
            "email": user.get("email"),
            "resumeParsed": rp,
            "professionalInfo": prof,
            "academics": acad,
            "location": loc,
            "applicationProfile": ap,
            "resumeUrl": user.get("resumeUrl") or user.get("resumeURL"),
            "resumeFileName": user.get("resumeFileName"),
        }
        preview_fields = build_structured_fields(user_for_ctx)
        ctx = _build_student_context(user_for_ctx, preview_fields)
        print(ctx)
        print()
        print(f"(total: {len(ctx)} characters)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--uid", help="Firebase uid")
    target.add_argument("--email", help="User email (resolved to uid)")
    parser.add_argument(
        "--show-context", action="store_true",
        help="Also print the exact student context string the LLM resolver would see.",
    )
    args = parser.parse_args()

    db = _init_firestore()
    uid = args.uid or _resolve_uid(db, args.email)
    inspect(uid, args.show_context)


if __name__ == "__main__":
    main()
