"""
Discovery: programmatically find Greenhouse's email-verification security
code field selector.

Approach:
  1. Browserbase session (stealth + solveCaptchas) — same setup that just
     triggered the verification email on Temelio.
  2. Open Temelio's apply URL, fill standard fields, click submit.
  3. After submit settles, dump the full form state: every input/select/
     textarea on the page with its tag, id, name, type, label, visibility,
     and a short snippet of nearby text.
  4. Score each field for "is this the verification code field?" using
     keyword patterns (code, verification, security, otp, token).
  5. Save a full-page screenshot + a stripped DOM dump for inspection.

What this tells us:
  - The exact CSS selector for the security code input.
  - Whether the field is on the same URL or a different one after submit.
  - Whether the field is hidden until verification mode is triggered.
  - The labels / aria attributes we'd use to match it robustly across
    Greenhouse tenants.

Cost: ~30 sec of Browserbase Free tier, generates ONE more verification
email from Greenhouse to Sid's inbox (5th Temelio submit today).
"""
import json
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

VERIFICATION_KEYWORDS = (
    "code", "verification", "verify", "security", "otp", "token",
    "confirm", "validate", "auth", "two-factor", "2fa",
)


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
    preview = build_preview({"apply_url": APPLY_URL, "ats_platform": "greenhouse"}, user)
    f = preview.get("fields") or {}
    first_name = f.get("first_name") or ""
    last_name = f.get("last_name") or ""
    email = f.get("email") or ""
    phone = f.get("phone") or "555-123-4567"
    location = f.get("location") or "Los Angeles, CA"

    resume_url = user.get("resumeUrl") or user.get("resumeURL")
    resume_path = _download_resume_to_temp(
        resume_url, user.get("resumeFileName") or "resume.pdf"
    ) if resume_url else None

    print(f"firing submit on {APPLY_URL}\n")
    headers = {"X-BB-API-Key": api_key, "Content-Type": "application/json"}
    resp = requests.post(
        f"{API_BASE}/v1/sessions",
        json={
            "projectId": project_id,
            "browserSettings": {"stealth": True, "solveCaptchas": True},
        },
        headers=headers,
        timeout=30,
    )
    session = resp.json()
    session_id = session["id"]
    connect_url = session.get("connectUrl") or session.get("connect_url")

    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(connect_url, timeout=60_000)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(APPLY_URL, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_selector("#first_name", timeout=20_000)

            # Fill the same fields as the previous Browserbase run
            for sel, val in (("#first_name", first_name), ("#last_name", last_name),
                             ("#email", email), ("#phone", phone)):
                if val and page.query_selector(sel):
                    page.fill(sel, str(val))

            from app.services.auto_apply.greenhouse import _fill_combobox
            if page.query_selector("#country"):
                _fill_combobox(page, "#country", "United States", {}, [])
            if page.query_selector("#candidate-location"):
                _fill_combobox(page, "#candidate-location", location, {}, [])

            if resume_path and page.query_selector("#resume"):
                page.set_input_files("#resume", resume_path)

            # SNAPSHOT 1: pre-submit form state, so we can diff
            pre_submit_inputs = _dump_form_fields(page)

            print("clicking submit and waiting up to 30s for verification UI...")
            submit = page.query_selector('button[type="submit"]')
            if not submit:
                print("no submit button found", file=sys.stderr)
                return 2
            submit.click()

            # Wait for either: URL change, page-text change, or new fields
            try:
                page.wait_for_load_state("networkidle", timeout=30_000)
            except PWTimeout:
                pass
            time.sleep(2)  # give dynamic JS time to render any verification UI

            # SNAPSHOT 2: post-submit form state
            post_submit_inputs = _dump_form_fields(page)
            page_url = page.url
            page_title = page.title()
            body_text_sample = (page.text_content("body") or "")[:600]

            # NEW fields appearing post-submit (the smoking gun)
            pre_ids = {f["composite_id"] for f in pre_submit_inputs}
            new_fields = [f for f in post_submit_inputs if f["composite_id"] not in pre_ids]

            # Score every post-submit field for verification-code likelihood
            scored = []
            for fld in post_submit_inputs:
                blob = " ".join(filter(None, [
                    fld.get("id"), fld.get("name"), fld.get("label"),
                    fld.get("aria_label"), fld.get("placeholder"),
                    fld.get("parent_text_50"),
                ])).lower()
                score = sum(1 for kw in VERIFICATION_KEYWORDS if kw in blob)
                if score > 0:
                    scored.append({**fld, "score": score, "match_blob": blob[:200]})
            scored.sort(key=lambda x: -x["score"])

            shot_path = "/tmp/temelio_verification_discovery.png"
            page.screenshot(path=shot_path, full_page=True)

            dump = {
                "post_submit_url": page_url,
                "post_submit_title": page_title,
                "url_changed": page_url != APPLY_URL,
                "body_text_sample": body_text_sample,
                "pre_submit_field_count": len(pre_submit_inputs),
                "post_submit_field_count": len(post_submit_inputs),
                "new_fields_appearing_post_submit": new_fields,
                "verification_keyword_matches_ranked": scored[:10],
                "screenshot_path": shot_path,
            }
            print("\n========= DISCOVERY REPORT =========")
            print(json.dumps(dump, indent=2, default=str)[:6000])
            print("\n========= END REPORT =========")
            print(f"\nfull screenshot: {shot_path}")
            if scored:
                top = scored[0]
                print(f"\nMOST LIKELY VERIFICATION CODE FIELD:")
                print(f"  tag: {top.get('tag')}")
                print(f"  id: {top.get('id')!r}")
                print(f"  name: {top.get('name')!r}")
                print(f"  label: {top.get('label')!r}")
                print(f"  selector suggestion: [id=\"{top.get('id')}\"]" if top.get('id') else
                      f"  selector suggestion: [name=\"{top.get('name')}\"]")
            else:
                print("\nNO field with verification keywords found on the post-submit page.")
                print("The verification UI might be:")
                print("  - On a different URL (check post_submit_url above)")
                print("  - Rendered as a button/CTA the user clicks to reveal a code input")
                print("  - In a modal/iframe we didn't capture")

    except Exception:
        traceback.print_exc()
        return 3
    finally:
        try:
            requests.post(
                f"{API_BASE}/v1/sessions/{session_id}",
                json={"status": "REQUEST_RELEASE"},
                headers=headers, timeout=10,
            )
        except Exception:
            pass
        if resume_path and os.path.exists(resume_path):
            try:
                os.remove(resume_path)
            except Exception:
                pass

    return 0


def _dump_form_fields(page):
    return page.evaluate(
        """() => {
            function visible(el) {
                if (!el) return false;
                const cs = window.getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') return false;
                if (el.offsetParent === null && cs.position !== 'fixed') return false;
                return true;
            }
            const out = [];
            document.querySelectorAll('input, select, textarea').forEach(el => {
                const id = el.id || '';
                const name = el.name || '';
                let label = '';
                try {
                    const esc = CSS.escape(id);
                    const lbl = id ? document.querySelector(`label[for="${esc}"]`) : null;
                    if (lbl) label = (lbl.textContent || '').trim();
                } catch (e) {}
                if (!label) {
                    const parentLabel = el.closest('label');
                    if (parentLabel) label = (parentLabel.textContent || '').trim();
                }
                const aria_label = el.getAttribute('aria-label') || '';
                const placeholder = el.getAttribute('placeholder') || '';
                let parent_text_50 = '';
                try {
                    parent_text_50 = (el.parentElement?.textContent || '').trim().slice(0, 50);
                } catch (e) {}
                out.push({
                    composite_id: `${el.tagName}:${id}:${name}`,
                    tag: el.tagName.toLowerCase(),
                    id, name,
                    type: el.getAttribute('type') || el.tagName.toLowerCase(),
                    label, aria_label, placeholder,
                    parent_text_50,
                    visible: visible(el),
                });
            });
            return out;
        }"""
    )


if __name__ == "__main__":
    raise SystemExit(main())
