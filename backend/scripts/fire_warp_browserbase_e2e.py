"""
Second-tenant ship-validation: fire run_greenhouse_filler against Warp's
Greenhouse listing to confirm the Browserbase + email-code pipeline works
on a tenant we haven't seen yet.

Two possible paths:
  - Warp doesn't use email verification: filler reaches success URL
    directly, status='submitted', no Gmail polling needed.
  - Warp does use email verification: same path as Temelio — Browserbase
    triggers email send, Gmail poll grabs code, fill+resubmit, success.

Either way the expected verdict is 'submitted'. ~2-3 min Browserbase Free
tier time. One real application to Warp's pipeline.
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
APPLY_URL = "https://job-boards.greenhouse.io/warp/jobs/4324888004"
JOB_ID = "warp-e2e-browserbase-shipvalidate"
JOB_DATA = {
    "apply_url": APPLY_URL,
    "ats_platform": "greenhouse",
    "company": "Warp",
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
    print(f"company: Warp  apply_url: {APPLY_URL}")
    print(f"resume: {resume_path}\n")

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

    import base64
    if result.get("screenshot_b64"):
        shot_path = "/tmp/warp_e2e_postsubmit.png"
        with open(shot_path, "wb") as f:
            f.write(base64.b64decode(result["screenshot_b64"]))
        print(f"post-submit screenshot: {shot_path}")

    status = result.get("status")
    if status == "submitted":
        print("\n🎉 SECOND TENANT CONFIRMED. Plan A pipeline ships.")
    elif status == "needs_verification":
        print("\nFell through to needs_verification — either Warp uses a different gate")
        print("type we don't handle, or the user doesn't have Gmail connected (shouldn't")
        print("be the case since Temelio worked). Check screenshot.")
    elif status == "needs_attention":
        print("\nA screening Q escalated to drawer. Acceptable outcome but means Warp's")
        print("form has a custom Q we can't auto-answer.")
    elif status == "submit_failed":
        print("\nSomething different about Warp's form. Check screenshot + failure_reason.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
