"""
Verify Browserbase Live View is usable on the current account's tier
(Free or Developer — we want to confirm before considering migration away
from Browserless).

What it does:
  1. POST /v1/sessions to create a Browserbase session
  2. Connect Playwright to it over CDP via the returned connectUrl
  3. Navigate to a known apply form (Temelio Greenhouse) so the live view
     would show something useful if a human took over
  4. GET /v1/sessions/{id}/debug to retrieve the liveViewUrl
  5. HEAD the liveViewUrl and check X-Frame-Options / CSP frame-ancestors
     to see if it'd actually embed in an iframe inside offerloop.ai
  6. Print everything we'd need to decide whether to migrate the auto-apply
     runtime to Browserbase

No real submit, no resume upload, just page load + live-view retrieval.

Run:
    cd backend && python scripts/check_browserbase_liveview.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import requests


API_BASE = "https://api.browserbase.com"
TEST_URL = "https://job-boards.greenhouse.io/applytotemelio/jobs/4604909004"


def main() -> int:
    api_key = os.getenv("BROWSERBASE_API_KEY")
    project_id = os.getenv("BROWSERBASE_PROJECT_ID")
    if not api_key:
        print("BROWSERBASE_API_KEY not set in .env", file=sys.stderr)
        return 1
    if not project_id:
        print("BROWSERBASE_PROJECT_ID not set in .env", file=sys.stderr)
        return 1

    headers = {
        "X-BB-API-Key": api_key,
        "Content-Type": "application/json",
    }

    # 1. Create session
    print("creating browserbase session...")
    resp = requests.post(
        f"{API_BASE}/v1/sessions",
        json={"projectId": project_id},
        headers=headers,
        timeout=30,
    )
    if resp.status_code >= 400:
        print(f"session create failed: {resp.status_code} {resp.text[:300]}", file=sys.stderr)
        return 2
    session = resp.json()
    session_id = session.get("id")
    connect_url = session.get("connectUrl") or session.get("connect_url")
    print(f"session id: {session_id}")
    print(f"connect_url: {connect_url[:80] if connect_url else None}...")

    if not connect_url:
        print("FATAL: no connectUrl in session response", file=sys.stderr)
        print(f"full response keys: {list(session.keys())}", file=sys.stderr)
        return 3

    # 2. Connect Playwright + navigate
    from playwright.sync_api import sync_playwright
    print(f"\nconnecting playwright to browserbase, opening {TEST_URL}")
    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(connect_url, timeout=60_000)
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            try:
                page.goto(TEST_URL, wait_until="domcontentloaded", timeout=30_000)
                print(f"page title: {page.title()!r}")
            except Exception as exc:
                print(f"WARNING: navigation failed: {exc}")

            # 3. Fetch Live View URL
            print("\nfetching live view URL via /debug endpoint...")
            dbg = requests.get(
                f"{API_BASE}/v1/sessions/{session_id}/debug",
                headers={"X-BB-API-Key": api_key},
                timeout=30,
            )
            if dbg.status_code >= 400:
                print(f"FAILED: /debug returned {dbg.status_code} {dbg.text[:300]}", file=sys.stderr)
                print("\nVERDICT: Live View NOT available on current tier (or other gate).", file=sys.stderr)
                return 4

            payload = dbg.json()
            print(f"/debug response keys: {list(payload.keys())}")
            pages = payload.get("pages") or []
            if not pages:
                print("FAILED: /debug returned no pages", file=sys.stderr)
                print(f"full payload: {payload}", file=sys.stderr)
                return 5

            first = pages[0]
            live_url = first.get("liveViewUrl") or first.get("debuggerUrl") or first.get("url")
            print(f"\nLIVE VIEW URL: {live_url}")

            # 4. Probe iframe headers
            if live_url:
                print(f"\nprobing {live_url[:80]}... for iframe-blocking headers")
                head = requests.head(live_url, timeout=10, allow_redirects=False)
                xfo = head.headers.get("X-Frame-Options")
                csp = head.headers.get("Content-Security-Policy")
                print(f"  status: {head.status_code}")
                print(f"  X-Frame-Options: {xfo or '(none — embeddable)'}")
                print(f"  CSP: {csp[:200] if csp else '(none)'}")

                iframe_blocked = False
                if xfo and xfo.upper() in ("DENY", "SAMEORIGIN"):
                    iframe_blocked = True
                if csp and "frame-ancestors" in (csp or "").lower():
                    if "'none'" in csp or "'self'" in csp:
                        iframe_blocked = True

                print()
                if iframe_blocked:
                    print("VERDICT: Live View works on this tier BUT iframe embedding is blocked.")
                    print("Migration would still be possible — use new tab fallback for user takeover.")
                else:
                    print("VERDICT: Live View AND iframe embedding both work on this tier.")
                    print("Migration to Browserbase would unlock Option C (LiveURL takeover) cheaply.")
                return 0
        finally:
            try:
                # 5. Cleanup — release the session quickly so we don't burn the
                # free tier's 60-min/mo allowance on this test.
                requests.post(
                    f"{API_BASE}/v1/sessions/{session_id}",
                    json={"status": "REQUEST_RELEASE"},
                    headers=headers,
                    timeout=10,
                )
            except Exception:
                pass
            try:
                browser.close()
            except Exception:
                pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
