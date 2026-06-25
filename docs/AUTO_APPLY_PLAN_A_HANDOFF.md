# Plan A — Handoff to next Claude session

You are picking up an in-flight piece of work. Read this top to bottom before doing anything.

## What this is

Offerloop's auto-apply feature submits job applications server-side through a Browserless-hosted Chromium. Every submit currently CAPTCHAs and lands in the "Finish in browser" verification tab because Browserless's datacenter IPs score as bot. Plan A routes the egress through Decodo's residential proxy pool to lift the silent-submit rate from ~0% to ~70-85%.

The plan is already designed. **Source of truth: `docs/AUTO_APPLY_PLAN_A_RESIDENTIAL_PROXIES.md`.** Read it before reading this handoff. Don't redesign anything — the wiring decisions are locked.

## Where we are right now

| | Status |
|---|---|
| Plan doc written and reviewed | Done. `docs/AUTO_APPLY_PLAN_A_RESIDENTIAL_PROXIES.md`. |
| Decodo account | NOT signed up. Sid will sign up for PAYG ($4/GB) after the code framework is built. |
| Code framework | NOT started. This is what you're building. |
| Production rollout | Blocked on framework + Sid's go-ahead. |

## Your job in this session

Build the code framework so that the moment Sid signs up for Decodo PAYG and drops credentials in `.env`, the feature lights up. Stop before production rollout. Do not spend any money. Do not sign up for anything on Sid's behalf.

## Decisions already locked — do not relitigate

| Decision | Why |
|---|---|
| BYO Decodo, not Browserless's bundled residential pool | ~3-5x cheaper at our scale; separation of concerns. |
| Playwright-native `browser.new_context(proxy={...})` | Documented by Browserless; cleaner than URL query params. Fallback to query params if Day-2 egress check fails. |
| No feature flag. Credential presence is the gate. | Matches Sid's no-feature-flags policy. Empty creds → helper returns `None` → fillers use unproxied path. |
| Sticky session per `auto_apply_id` for 10 min | Same job retry reuses IP; different jobs get different IPs. Avoids cross-job correlation. |
| US-only targeting | All Offerloop users are US students. Revisit when international. |

## What you can build without Decodo credentials

Everything except the IP-egress verification and the production rollout. The helper function returns `None` when creds are absent and the fillers fall through to today's behavior — so the diff is safe to merge.

| Step | Requires Decodo creds? |
|---|---|
| Add `DECODO_USERNAME` / `DECODO_PASSWORD` to `config.py` | No (just env reads with empty defaults) |
| Write `build_residential_proxy_config()` in `browserless_client.py` | No |
| Unit test the helper | No (test both cases: creds absent → returns `None`; creds present → returns dict with correct sticky username format) |
| Wire the 3 filler call sites | No (helper returns `None`, no behavior change) |
| Smoke test: run an auto-apply against Renegade Lever URL with creds absent | No — should match pre-change behavior exactly. This proves the framework is safe. |
| Day-2 IP-egress check (verify residential IP) | **Yes** — stop here, hand back to Sid. |
| Production rollout | **Yes** — Sid's decision. |

## Concrete touchpoints

All line numbers verified against current `~/work/Offerloop` HEAD.

| File | Change |
|---|---|
| `backend/app/config.py` | Append `DECODO_USERNAME = os.getenv("DECODO_USERNAME", "")` and `DECODO_PASSWORD = os.getenv("DECODO_PASSWORD", "")` near other env reads (around line 30). |
| `backend/app/services/auto_apply/browserless_client.py` | Append `build_residential_proxy_config(session_id)` at end of file. Full code shape is in the plan doc under "Code shapes → browserless_client.py". |
| `backend/app/services/auto_apply/greenhouse.py:108` | Replace `context = browser.new_context()` with the proxy-aware variant. Move the `build_residential_proxy_config` import to the top of the file. |
| `backend/app/services/auto_apply/lever.py:100` | Same. |
| `backend/app/services/auto_apply/ashby.py:91` | Same. |
| `backend/tests/` | Add a unit test for `build_residential_proxy_config`. Pattern: mock `app.config` values, assert return shape. No network. |

## Exit criterion for this session

You are done when ALL of these are true:

1. Helper exists in `browserless_client.py` and returns the documented shape.
2. All three fillers call the helper, with the `if proxy else` fallthrough.
3. Unit test passes. `cd backend && pytest tests/ -k "residential_proxy"` is green.
4. Smoke test: with `DECODO_USERNAME` unset, run `python main.py` and fire an auto-apply through the existing job-board UI. Status should match today's behavior (CAPTCHA → `needs_verification`). The framework changes must not regress anything.
5. Diff committed to a feature branch (DO NOT push to main; DO NOT open a PR — leave that to Sid).
6. You report back to Sid: "framework done, ready for Decodo signup. Here's the branch name and the smoke-test result."

## What to do when Sid comes back with Decodo credentials

(This is for a FUTURE session, not this one. Documenting so the trigger is obvious.)

1. Sid will paste `DECODO_USERNAME` and `DECODO_PASSWORD` into `backend/.env`.
2. Restart `python main.py`.
3. Add the temporary IP-egress log block to ONE filler (Lever is the most reliable for dogfood):
   ```python
   page.goto("https://api.ipify.org?format=json", timeout=10_000)
   logger.info(f"[auto_apply] egress IP via proxy={bool(proxy)}: {page.text_content('body')[:120]}")
   ```
4. Fire one auto-apply against the Renegade Lever URL. Check the log for a residential-ISP IP (Comcast `73.x`, Verizon `108.x`, T-Mobile `172.58.x`). NOT Browserless's `54.x` / `35.x` AWS ranges.
5. If IP is correct: remove the log block, repeat against Ashby + a non-Zscaler Greenhouse. Report success rate to Sid.
6. If IP is wrong (still datacenter): the Playwright-native `proxy=` is being ignored. Switch to the URL-query-param fallback documented in the plan doc under "Risks → mitigation".

## Hard constraints

| | |
|---|---|
| Don't spend money | Don't sign Sid up for Decodo. Don't run live tests against production ATSes until creds are in. |
| Don't break the unproxied path | Empty creds MUST result in identical behavior to today. The smoke test proves it. |
| Don't push, don't PR | Feature branch only. Sid reviews and merges. |
| Don't add a feature flag | Credential presence is the gate. See "Decisions already locked." |
| Don't redesign | If something in the plan doc seems wrong, ASK Sid. Don't pick a different approach unilaterally. |

## How to run things

Per Sid's stored preference (the project's `CLAUDE.md` is stale on this):

```bash
cd ~/work/Offerloop
python main.py           # backend, port 5001. NOT python3 backend/wsgi.py.

cd connect-grow-hire
npm run dev              # frontend, port 8080 (you almost certainly don't need this — no UI changes)

cd backend && pytest tests/ -k "residential_proxy"   # the new unit test
```

## Context Sid expects you to already know

- Auto-apply works on Greenhouse, Lever, Ashby today via Browserless + Playwright.
- The "Finish in browser" verification tab is the existing fallback. Plan A complements it; doesn't replace it.
- Sid is bandwidth-constrained on this feature (he called it "minor in the grand scheme"). Don't oversell it. Don't add scope.
- Decodo billing concern: the smallest commitment is PAYG at $4/GB. ~6 MB per session means $0.024 per test submit. 50 test submits ≈ $1.20. Sid will not commit to the $81/mo flat plan until silent-submit rate is proven on live traffic.

## If something blocks you

Ask Sid. Do not guess. Do not ship a half-fix. The framework being broken silently is worse than not shipping the framework at all, because future you won't know to debug it.
