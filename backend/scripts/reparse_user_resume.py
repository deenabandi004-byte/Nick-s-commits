"""Re-parse a user's stored resume text and write the rich resumeParsed back.

Use this to repair a user whose `resumeParsed` Firestore field got clobbered
into a flat {name,year,major,university} stub by the (now-fixed) frontend
overwrite bug in AccountSettings.tsx / ContactSearchPage.tsx.

Reads `originalResumeText` (preferred) or `resumeText` from the user doc,
re-runs `parse_resume_info`, and writes the result as `resumeParsed`. Also
bumps `resumeParseVersion = 2` to match the rich save path.

Usage:
    python backend/scripts/reparse_user_resume.py --email=you@example.com
    python backend/scripts/reparse_user_resume.py <uid>
    python backend/scripts/reparse_user_resume.py --email=you@example.com --dry-run
"""
import os
import sys
import json

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))

import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path:
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        else:
            firebase_admin.initialize_app()
    return firestore.client()


def resolve_uid(args):
    for arg in args:
        if arg.startswith("--email="):
            email = arg.split("=", 1)[1].strip().lower()
            return fb_auth.get_user_by_email(email).uid
    for arg in args:
        if not arg.startswith("--"):
            return arg
    return None


def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: reparse_user_resume.py --email=you@example.com [--dry-run]")
        sys.exit(1)
    dry_run = "--dry-run" in args

    db = get_db()
    uid = resolve_uid(args)
    if not uid:
        print("No UID resolved")
        sys.exit(1)

    user_ref = db.collection("users").document(uid)
    snap = user_ref.get()
    if not snap.exists:
        print(f"No user doc for uid={uid}")
        sys.exit(1)
    data = snap.to_dict() or {}

    resume_text = data.get("originalResumeText") or data.get("resumeText") or ""
    if not resume_text or len(resume_text.strip()) < 50:
        print(f"No usable resume text in Firestore (len={len(resume_text)}). "
              f"Re-upload via the UI instead.")
        sys.exit(1)
    print(f"Found resume text: {len(resume_text)} chars\n")

    from app.utils.users import parse_resume_info
    parsed = parse_resume_info(resume_text)
    if not parsed or not isinstance(parsed, dict):
        print("parse_resume_info returned nothing. Aborting.")
        sys.exit(1)

    edu = parsed.get("education") or {}
    print(f"Parsed keys: {sorted(parsed.keys())}")
    print(f"education.major:      {edu.get('major')!r}")
    print(f"education.university: {edu.get('university')!r}")
    print(f"education.graduation: {edu.get('graduation')!r}")
    print(f"experience entries:   {len(parsed.get('experience') or [])}")
    print(f"projects entries:     {len(parsed.get('projects') or [])}")
    skills = parsed.get("skills") or {}
    if isinstance(skills, dict):
        total = sum(len(v) if isinstance(v, list) else 0 for v in skills.values())
        print(f"skills (dict):        {total} total")
    elif isinstance(skills, list):
        print(f"skills (list):        {len(skills)}")
    print()

    current = data.get("resumeParsed")
    current_edu = (current or {}).get("education") if isinstance(current, dict) else None
    print(f"Current Firestore resumeParsed keys: "
          f"{sorted(current.keys()) if isinstance(current, dict) else type(current).__name__}")
    print(f"Current Firestore education: {current_edu!r}\n")

    if dry_run:
        print("--dry-run: not writing")
        return

    user_ref.update({
        "resumeParsed": parsed,
        "resumeParseVersion": 2,
    })
    print(f"Wrote resumeParsed ({len(parsed)} top-level keys) to users/{uid}")


if __name__ == "__main__":
    main()
