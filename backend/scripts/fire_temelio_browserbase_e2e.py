"""
End-to-end dogfood: fire the FULL production run_greenhouse_filler against
Temelio Greenhouse, now wired through:
  - Browserbase runtime (Stealth + solveCaptchas)
  - Gmail-based email-code auto-completion for Greenhouse's per-tenant
    verification gate

Expected verdict: status='submitted'. If we get there, Plan A is alive end-
to-end and the auto-apply feature actually ships its promise on Greenhouse.

This is the 6th Temelio submission today. Real application, real Gmail
read, real Browserbase session.
"""
import os
import sys
import traceback

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_ROOT = os.path.dirname(_BACKEND)
sys.path.insert(0, _BACKEND)
sys.path.insert(0, _PROJECT_ROOT)

from dotenv import load_dotenv
load_dotenv()

import firebase_admin
from firebase_admin import credentials, firestore

from app.services.auto_apply.application_profile import get_application_profile
from app.services.auto_apply.preview import build_preview, load_user_for_apply
from app.services.auto_apply.runner import _download_resume_to_temp, _build_student_context
from app.services.auto_apply.greenhouse import run_greenhouse_filler


EMAIL = "deena.bandi004@gmail.com"
APPLY_URL = "https://job-boards.greenhouse.io/applytotemelio/jobs/4604909004"
JOB_ID = "temelio-e2e-browserbase-emailcode"
JOB_DATA = {
    "apply_url": APPLY_URL,
    "ats_platform": "greenhouse",
    "title": "Founding Engineer",
    "company": "Temelio",
    "location": "New York, NY",
    "description": "Temelio grant management SaaS founding engineer role.",
}


def _init_firestore():
    if firebase_admin._apps:
        return firestore.client()
    cred = credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"])
    firebase_admin.initialize_app(cred)
    return firestore.client()


def _resolve_uid(db, email: str) -> str:
    for doc in db.collection("users").where("email", "==", email).limit(1).stream():
        return doc.id
    raise SystemExit(f"no user found for {email}")


def main() -> int:
    db = _init_firestore()
    uid = _resolve_uid(db, EMAIL)
    user = load_user_for_apply(uid)
    profile = get_application_profile(uid)
    user["applicationProfile"] = profile

    preview = build_preview(JOB_DATA, user)
    preview["_application_profile"] = profile
    resume_summary = _build_student_context(user, preview.get("fields"))

    resume_url = user.get("resumeUrl") or user.get("resumeURL")
    resume_path = _download_resume_to_temp(
        resume_url, user.get("resumeFileName") or "resume.pdf"
    ) if resume_url else None

    print(f"uid: {uid}")
    print(f"candidate email: {(preview.get('fields') or {}).get('email')}")
    print(f"resume: {resume_path}")
    print(f"\n--- firing run_greenhouse_filler (Browserbase + email-code) ---")
    print(f"apply_url: {APPLY_URL}\n")

    try:
        result = run_greenhouse_filler(
            apply_url=APPLY_URL,
            preview=preview,
            edited_answers={},
            resume_path=resume_path,
            dry_run=False,
            job_id=JOB_ID,
            answer_lookup=None,
            uid=uid,
            resume_summary=resume_summary,
            job_data=JOB_DATA,
        )
    except Exception:
        traceback.print_exc()
        return 2
    finally:
        if resume_path and os.path.exists(resume_path):
            try:
                os.remove(resume_path)
            except Exception:
                pass

    print("\n--- result ---")
    print(f"status: {result.get('status')}")
    print(f"failure_reason: {result.get('failure_reason')}")
    print(f"filled fields: {len(result.get('filled') or {})}")
    print(f"unmapped: {len(result.get('unmapped') or [])}")

    # Save the post-submit screenshot so we can see what Greenhouse actually
    # showed after the click — verification page, validation error, or
    # silently-rejected form.
    import base64
    if result.get("screenshot_b64"):
        shot_path = "/tmp/temelio_e2e_postsubmit.png"
        with open(shot_path, "wb") as f:
            f.write(base64.b64decode(result["screenshot_b64"]))
        print(f"post-submit screenshot: {shot_path}")

    status = result.get("status")
    if status == "submitted":
        print("\n🎉 PLAN A FULLY ALIVE.")
        print("Browserbase stealth + solveCaptchas + Gmail email-code auto-completion")
        print("just silently submitted on Greenhouse with the per-tenant verification gate.")
    elif status == "needs_verification":
        print("\nemail-code auto-completion didn't trigger or didn't complete in time.")
        print("Possible causes:")
        print("  - User has no Gmail connected (Gmail OAuth flow not done)")
        print("  - The verification email took >60s to arrive")
        print("  - The code regex didn't match (Greenhouse changed format?)")
        print("  - The submit-again after fill didn't reach the success page")
    elif status == "needs_attention":
        print("\nA screening question we couldn't answer escalated to drawer.")
    else:
        print(f"\nstatus={status} — see failure_reason / screenshot for forensics")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
