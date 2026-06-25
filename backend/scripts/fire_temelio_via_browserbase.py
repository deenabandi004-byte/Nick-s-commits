"""
Plan A take-2 on Browserbase instead of Browserless.

Browserbase's POST /v1/sessions accepts:
  browserSettings.stealth: true        — advanced fingerprint spoofing
  browserSettings.solveCaptchas: true  — Browserbase auto-solves reCAPTCHA /
                                          hCaptcha during the session without
                                          our code intervening

If those two together actually defeat Greenhouse Enterprise reCAPTCHA on the
Temelio Founding Engineer form, Plan A's silent-submit hypothesis comes
back from the dead — and we get there for $0-20/mo instead of Browserless's
$350/mo Scale plan.

This is a REAL submit using Sid's saved profile + resume — the 4th
Temelio submission today. Mirrors the standard-fields fill that
greenhouse.py does, but skips the optional custom Qs (LinkedIn / Website
on Temelio are not required) so we don't pay the LLM-batch cost.
"""
import os
import sys
import time
import traceback

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_ROOT = os.path.dirname(_BACKEND)
sys.path.insert(0, _BACKEND)
sys.path.insert(0, _PROJECT_ROOT)

from dotenv import load_dotenv
load_dotenv()

import requests

import firebase_admin
from firebase_admin import credentials, firestore

from app.services.auto_apply.preview import build_preview, load_user_for_apply
from app.services.auto_apply.application_profile import get_application_profile
from app.services.auto_apply.runner import _download_resume_to_temp


API_BASE = "https://api.browserbase.com"
APPLY_URL = "https://job-boards.greenhouse.io/applytotemelio/jobs/4604909004"
EMAIL = "deena.bandi004@gmail.com"


def _init_firestore():
    if firebase_admin._apps:
        return firestore.client()
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def _resolve_uid(db, email: str) -> str:
    for doc in db.collection("users").where("email", "==", email).limit(1).stream():
        return doc.id
    raise SystemExit(f"no user found for {email}")


def main() -> int:
    api_key = os.getenv("BROWSERBASE_API_KEY")
    project_id = os.getenv("BROWSERBASE_PROJECT_ID")
    if not api_key or not project_id:
        print("BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID missing", file=sys.stderr)
        return 1

    db = _init_firestore()
    uid = _resolve_uid(db, EMAIL)
    user = load_user_for_apply(uid)
    user["applicationProfile"] = get_application_profile(uid)
    # Use the same preview-builder the production runner uses, so the field
    # name normalization (firstName -> first_name etc.) is identical.
    preview = build_preview({"apply_url": APPLY_URL, "ats_platform": "greenhouse"}, user)
    f = preview.get("fields") or {}
    first_name = f.get("first_name") or ""
    last_name = f.get("last_name") or ""
    email = f.get("email") or ""
    phone = f.get("phone") or "555-123-4567"  # placeholder if profile lacks it
    location = f.get("location") or "Los Angeles, CA"
    print(f"uid: {uid}  name: {first_name!r} {last_name!r}  email: {email!r}  phone: {phone!r}  loc: {location!r}")

    resume_url = user.get("resumeUrl") or user.get("resumeURL")
    if not resume_url:
        print("no resumeUrl on user doc — bailing", file=sys.stderr)
        return 2
    resume_path = _download_resume_to_temp(
        resume_url, user.get("resumeFileName") or "resume.pdf"
    )
    print(f"resume: {resume_path}")

    # Create Browserbase session with both magic knobs ON
    print("\ncreating browserbase session (stealth=true, solveCaptchas=true)...")
    headers = {"X-BB-API-Key": api_key, "Content-Type": "application/json"}
    resp = requests.post(
        f"{API_BASE}/v1/sessions",
        json={
            "projectId": project_id,
            "browserSettings": {
                "stealth": True,
                "solveCaptchas": True,
            },
        },
        headers=headers,
        timeout=30,
    )
    if resp.status_code >= 400:
        print(f"session create failed: {resp.status_code} {resp.text[:400]}", file=sys.stderr)
        # Common failure: stealth requires a paid plan. Show the body so we know.
        return 3
    session = resp.json()
    session_id = session.get("id")
    connect_url = session.get("connectUrl") or session.get("connect_url")
    print(f"session id: {session_id}")

    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    status_verdict = "unknown"
    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(connect_url, timeout=60_000)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            print(f"\nopening {APPLY_URL}")
            page.goto(APPLY_URL, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_selector("#first_name", timeout=20_000)
            print(f"form rendered, title: {page.title()!r}")

            # Standard fields
            for selector, value in [
                ("#first_name", first_name),
                ("#last_name", last_name),
                ("#email", email),
                ("#phone", phone),
            ]:
                if value and page.query_selector(selector):
                    page.fill(selector, str(value))
                    print(f"  filled {selector} = {str(value)[:30]!r}")
                elif page.query_selector(selector):
                    print(f"  WARN: {selector} present but no value to fill")

            # Comboboxes — reuse the same react-select handler greenhouse.py
            # uses in production (it falls back through several open strategies
            # because the input itself is often hidden behind a wrapper).
            from app.services.auto_apply.greenhouse import _fill_combobox
            filled_log: dict = {}
            unmapped_log: list = []
            if page.query_selector("#country"):
                _fill_combobox(page, "#country", "United States", filled_log, unmapped_log)
                print(f"  combobox #country result: {filled_log.get('#country', '???')}")
            if page.query_selector("#candidate-location"):
                _fill_combobox(page, "#candidate-location", location, filled_log, unmapped_log)
                print(f"  combobox #candidate-location result: {filled_log.get('#candidate-location', '???')}")

            # Resume upload
            if page.query_selector("#resume"):
                page.set_input_files("#resume", resume_path)
                print(f"  uploaded resume")

            # Pre-submit diagnostic: what's still aria-invalid / empty?
            print("\npre-submit field state:")
            field_state = page.evaluate(
                """() => {
                    const out = [];
                    document.querySelectorAll(
                        'input[required], input[aria-required="true"], select[required], select[aria-required="true"]'
                    ).forEach(el => {
                        out.push({
                            id: el.id || el.name || '?',
                            value: (el.value || '').slice(0, 40),
                            aria_invalid: el.getAttribute('aria-invalid') === 'true',
                        });
                    });
                    return out;
                }"""
            )
            for fs in field_state:
                marker = "❌" if (not fs["value"] or fs["aria_invalid"]) else "✓"
                print(f"  {marker} {fs['id']}: value={fs['value']!r} aria_invalid={fs['aria_invalid']}")

            # Submit
            print("\nclicking Submit...")
            submit = page.query_selector('button[type="submit"]')
            if not submit:
                print("no submit button found", file=sys.stderr)
                return 4
            submit.click()

            # Give solveCaptchas time to do its thing if reCAPTCHA appears
            print("waiting up to 60s for submit + solveCaptchas...")
            start = time.time()
            try:
                page.wait_for_load_state("networkidle", timeout=60_000)
            except PWTimeout:
                pass
            elapsed = time.time() - start
            print(f"  elapsed: {elapsed:.1f}s")

            # Verdict signals — same as greenhouse.py end-of-submit:
            #   - URL changed to a thank-you / confirmation page → submitted
            #   - #first_name still on page → form rejected our submit
            #   - aria-invalid count → validation failures
            final_url = (page.url or "").lower()
            print(f"  final URL: {final_url[:100]}")
            page_text = (page.text_content("body") or "")[:300].lower()
            success_url = any(kw in final_url for kw in ("thank", "confirmation", "success", "complete"))
            form_still_there = page.query_selector("#first_name") is not None
            captcha_in_view = "verification" in page_text or "verify" in page_text or "captcha" in page_text

            print(f"  success URL marker: {success_url}")
            print(f"  form still present: {form_still_there}")
            print(f"  captcha/verify text: {captcha_in_view}")

            if success_url:
                status_verdict = "submitted"
            elif form_still_there and not captcha_in_view:
                status_verdict = "form_rejected (validation)"
            elif captcha_in_view:
                status_verdict = "needs_verification (Browserbase solveCaptchas did NOT defeat reCAPTCHA)"
            else:
                status_verdict = "ambiguous — check screenshot"

            # Always grab a screenshot for forensics
            shot_path = "/tmp/temelio_browserbase_result.png"
            page.screenshot(path=shot_path, full_page=True)
            print(f"\nscreenshot: {shot_path}")
    except Exception:
        traceback.print_exc()
        return 5
    finally:
        try:
            requests.post(
                f"{API_BASE}/v1/sessions/{session_id}",
                json={"status": "REQUEST_RELEASE"},
                headers=headers,
                timeout=10,
            )
        except Exception:
            pass
        if resume_path and os.path.exists(resume_path):
            try:
                os.remove(resume_path)
            except Exception:
                pass

    print(f"\n=== VERDICT: {status_verdict} ===")
    if status_verdict == "submitted":
        print("\nPLAN A REVIVED. Browserbase stealth + solveCaptchas defeats Greenhouse")
        print("Enterprise reCAPTCHA. Migrate the auto-apply runtime from Browserless")
        print("to Browserbase. Drop from $35/mo Browserless to $0-20/mo Browserbase.")
    else:
        print("\nStealth + solveCaptchas did NOT silently submit. Migration would still")
        print("give us Option C (LiveURL takeover, free tier confirmed earlier), so")
        print("user-side CAPTCHA solving is still on the table — just no full silent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
