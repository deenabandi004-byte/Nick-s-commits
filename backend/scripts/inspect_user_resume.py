"""Inspect a user's resume-related Firestore data.

Prints the structure and key fields of:
  - users/{uid}.resumeParsed (and nested education.major / education.university)
  - users/{uid}.academics (.major / .university)
  - users/{uid}.resumeUrl + resumeFileName

Used to debug why batch_generate_emails picks up the wrong major (resume
parse should win but onboarding-cached "Computer Science" leaks through).

Usage:
    python backend/scripts/inspect_user_resume.py --email=you@example.com
    python backend/scripts/inspect_user_resume.py <uid>
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
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
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
        print("Usage: inspect_user_resume.py --email=you@example.com  |  <uid>")
        sys.exit(1)

    # Init Firebase first so fb_auth.get_user_by_email works in resolve_uid.
    db = get_db()

    uid = resolve_uid(args)
    if not uid:
        print("No UID resolved")
        sys.exit(1)
    snap = db.collection("users").document(uid).get()
    if not snap.exists:
        print(f"No user doc for uid={uid}")
        sys.exit(1)

    data = snap.to_dict() or {}
    print(f"=== UID: {uid} ===\n")
    print(f"Top-level keys: {sorted(data.keys())}\n")

    print(f"resumeUrl: {data.get('resumeUrl') or data.get('resumeURL')!r}")
    print(f"resumeFileName: {data.get('resumeFileName')!r}\n")

    rp = data.get("resumeParsed")
    print(f"resumeParsed type: {type(rp).__name__}")
    if isinstance(rp, dict):
        print(f"resumeParsed keys: {sorted(rp.keys())}")
        edu = rp.get("education")
        print(f"resumeParsed.education type: {type(edu).__name__}")
        if isinstance(edu, dict):
            print(f"resumeParsed.education keys: {sorted(edu.keys())}")
            print(f"resumeParsed.education.major: {edu.get('major')!r}")
            print(f"resumeParsed.education.university: {edu.get('university')!r}")
            print(f"resumeParsed.education.graduation: {edu.get('graduation')!r}")
        else:
            print(f"resumeParsed.education (raw): {json.dumps(edu, default=str)[:300]}")
        print(f"resumeParsed.name: {rp.get('name')!r}")
        print(f"resumeParsed.major (top-level): {rp.get('major')!r}")
        print(f"resumeParsed.university (top-level): {rp.get('university')!r}")
    else:
        print(f"resumeParsed (raw): {json.dumps(rp, default=str)[:300]}")
    print()

    acad = data.get("academics")
    print(f"academics type: {type(acad).__name__}")
    if isinstance(acad, dict):
        print(f"academics keys: {sorted(acad.keys())}")
        print(f"academics.major: {acad.get('major')!r}")
        print(f"academics.university: {acad.get('university')!r}")
        print(f"academics.graduationYear: {acad.get('graduationYear')!r}")
    print()

    print(f"name: {data.get('name')!r}")
    print(f"email: {data.get('email')!r}")
    print(f"careerTrack: {data.get('careerTrack')!r}")
    print(f"careerInterests: {data.get('careerInterests')!r}")


if __name__ == "__main__":
    main()
