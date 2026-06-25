# Plan A — Residential Proxy Wiring for Auto-Apply (Decodo BYO)

Status: ready to execute. ~3 dev days. ~$81/mo ongoing.

## TL;DR

| | |
|---|---|
| Goal | Lift silent-submit rate from ~0% (today, everything CAPTCHA-blocks) to ~70–85%. |
| How | Route the Browserless-hosted Chromium's outbound traffic through Decodo's US residential proxy pool. |
| Code change | One new helper (~40 LOC) + 1 line change in 3 fillers. |
| Config | 2 env vars (`DECODO_USERNAME`, `DECODO_PASSWORD`). No feature flag — credential presence is the gate. |
| Ongoing cost | $81/mo (Decodo 25 GB residential plan). Covers ~4,000 submits/mo. |
| Rollback | Unset env vars. Code is no-op without credentials. |

---

## Why this works (one paragraph)

Greenhouse, Lever and Ashby all run score-based bot defense (invisible reCAPTCHA v3 / hCaptcha). The score is dominated by **IP reputation**. Browserless's hosted Chromium ships from a fixed pool of AWS / GCP datacenter IPs that reCAPTCHA scores near zero — so every submit today trips CAPTCHA and lands in `needs_verification`. Decodo's residential pool routes the egress through real consumer ISP IPs (Comcast, Verizon, T-Mobile, etc.); reCAPTCHA scores those as human and the submit goes through silently. The 15–30% that still trip CAPTCHA (Greenhouse Enterprise mostly) fall through to the verification UX we already shipped.

---

## Current state, verified in code

| Fact | Where | Notes |
|---|---|---|
| Browserless WebSocket URL is built inline in each filler | `greenhouse.py:86`, `lever.py:85`, `ashby.py:76` | Identical string: `wss://production-sfo.browserless.io/playwright/chromium?token={token}`. |
| Playwright connect is via `chromium.connect(ws_url)` | `greenhouse.py:106`, `lever.py:98`, `ashby.py:89` | Not the `/function` REST endpoint. The `/function` endpoint in `browserless_client.py` is unused by the fillers — separate codepath. |
| Browser context creation has no proxy passed | `greenhouse.py:108`, `lever.py:100`, `ashby.py:91` | `context = browser.new_context()` — three identical lines to update. |
| Config pattern: `os.getenv(...)` at module scope | `backend/app/config.py` | See lines 14–33. New vars follow same pattern. |
| Existing failure-path refund logic | `runner.py` (status=="failed" triggers refund) | We piggy-back on this — proxy connection errors will surface as `failed` and refund. |

---

## The wiring

### Approach (decision)

Use **Playwright-native** `browser.new_context(proxy={...})`. Browserless explicitly documents this pattern on their Playwright customizations page (https://docs.browserless.io/baas/advanced-configurations/playwright-customizations). One Playwright API, one place to debug, no URL encoding gymnastics.

If `new_context(proxy=...)` ever turns out to be silently ignored by Browserless's hosted Chromium (an outside chance flagged in research), the fallback is to encode the proxy into the WebSocket URL as `&externalProxyServer=...&externalProxyUsername=...&externalProxyPassword=...` query params. Day-2 IP-egress check catches this before production.

### Decodo connection facts

| Field | Value |
|---|---|
| Gateway hostname | `gate.decodo.com` |
| Gateway port | `7000` (rotating + sticky both go through 7000; mode is in the username) |
| Username for 10-min US sticky session | `user-{BASE_USERNAME}-country-us-session-{SESSION_ID}-sessionduration-10` |
| `BASE_USERNAME` | One static value from Decodo dashboard (looks like `spXXXXXXXX`) |
| `SESSION_ID` | We generate. Use `auto_apply_id` so retries on the same job reuse the same IP for 10 min. |
| Password | One static value from Decodo dashboard |

---

## Files that change

### Modify

| File | What | LOC |
|---|---|---|
| `backend/app/config.py` | Add `DECODO_USERNAME`, `DECODO_PASSWORD` env reads. | ~3 |
| `backend/app/services/auto_apply/browserless_client.py` | Add `build_residential_proxy_config(session_id)` helper. | ~40 |
| `backend/app/services/auto_apply/greenhouse.py` | Replace one `browser.new_context()` call. | ~3 |
| `backend/app/services/auto_apply/lever.py` | Same. | ~3 |
| `backend/app/services/auto_apply/ashby.py` | Same. | ~3 |
| `backend/.env` | Add 2 secrets (NOT committed). | n/a |
| `docs/AUTO_APPLY_PLAN_A_RESIDENTIAL_PROXIES.md` | This file (already updated). | n/a |

### Do not touch

`_form_filler_common.py`, `runner.py`, `routes/auto_apply.py`, frontend, runner refund logic. The proxy lives entirely under the form-filler boundary; everything above it is transparent.

---

## Code shapes

### `config.py` — append near other env reads

```python
DECODO_USERNAME = os.getenv("DECODO_USERNAME", "")
DECODO_PASSWORD = os.getenv("DECODO_PASSWORD", "")
```

No feature flag. Presence of credentials is the gate. Empty creds means helper returns `None` and the filler falls through to the unproxied path. Same shape as `JINA_API_KEY`, `BRIGHTDATA_API_KEY`, etc.

### `browserless_client.py` — append at end of file

```python
import uuid

def build_residential_proxy_config(
    session_id: Optional[str] = None,
) -> Optional[Dict[str, str]]:
    """Playwright-compatible proxy config for Decodo's residential pool.

    Returns None when DECODO_USERNAME or DECODO_PASSWORD is unset, so the
    fillers can safely use:
        proxy = build_residential_proxy_config(session_id=job_id)
        context = browser.new_context(proxy=proxy) if proxy else browser.new_context()

    session_id is Decodo's stickiness key. Same job retries (refill+resubmit)
    reuse the same residential IP for `sessionduration` minutes. Different
    jobs get different IPs naturally, which avoids cross-job correlation
    that ATSes use to fingerprint.
    """
    from app.config import DECODO_USERNAME, DECODO_PASSWORD
    if not DECODO_USERNAME or not DECODO_PASSWORD:
        return None
    sid = session_id or uuid.uuid4().hex[:16]
    username = (
        f"user-{DECODO_USERNAME}"
        f"-country-us"
        f"-session-{sid}"
        f"-sessionduration-10"
    )
    return {
        "server": "http://gate.decodo.com:7000",
        "username": username,
        "password": DECODO_PASSWORD,
    }
```

### Each filler — one replacement, identical pattern

In `greenhouse.py:108`, `lever.py:100`, `ashby.py:91`:

```python
# before
context = browser.new_context()

# after
from app.services.auto_apply.browserless_client import build_residential_proxy_config
proxy = build_residential_proxy_config(session_id=job_id)
context = browser.new_context(proxy=proxy) if proxy else browser.new_context()
```

Move the import to the top of the file with the other imports rather than inline. `job_id` is already in scope at each call site (it's a filler param).

### `.env` — local dev

```
DECODO_USERNAME=spXXXXXXXX
DECODO_PASSWORD=<from dashboard>
```

Render: add as environment variables in dashboard. Same names. Don't commit.

---

## Day-by-day execution

### Day 1 — Provisioning + helper

1. Sign up at decodo.com. Pick "Residential 25 GB" plan ($81/mo). Auth method = user/pass (NOT IP whitelist — we can't whitelist Browserless's rotating IP pool).
2. From Decodo dashboard, copy the base username and password into `backend/.env`.
3. Add the two `os.getenv` lines to `config.py`.
4. Add `build_residential_proxy_config` to `browserless_client.py`.
5. Smoke check: open a Python REPL, `from app.services.auto_apply.browserless_client import build_residential_proxy_config; build_residential_proxy_config("test-123")` should return the dict. Empty env should return `None`.

Exit: helper returns correct shape, unit-testable in isolation.

### Day 2 — Wire into fillers + verify egress IP

1. Update the three `browser.new_context()` call sites.
2. Add a one-time bootstrap IP-egress log (REMOVE before merge — leaving it in production wastes ~1s of Browserless time per submit):

   ```python
   # TEMPORARY — remove before merge
   page.goto("https://api.ipify.org?format=json", timeout=10_000)
   logger.info(f"[auto_apply] egress IP via proxy={bool(proxy)}: {page.text_content('body')[:120]}")
   ```

3. Restart `python main.py` with the new env vars set.
4. Fire one auto-apply against the Renegade Lever URL (the one from earlier dogfood).
5. Verify the logged IP is in a residential ISP range (Comcast `73.x`, Verizon `108.x`, T-Mobile `172.58.x`, etc.) — NOT in Browserless's AWS/GCP ranges (`54.x`, `35.x`).
6. Fire against the FutureFit Ashby URL.
7. Fire against a non-Zscaler Greenhouse tenant (Zscaler is already bot-flagged from earlier dogfood; use a different test job).
8. If egress IP is wrong: see "Fallback" section below.
9. Remove the IP-egress log block.

Exit: all three ATSes load via residential IP and the form-fill works identically to before.

### Day 3 — Production rollout + watch the dial

1. Set `DECODO_USERNAME` and `DECODO_PASSWORD` in Render env vars. Redeploy.
2. Watch the first 50 production submits. Key telemetry:
   - **Today's baseline**: 0% `submitted`, ~100% `needs_verification`.
   - **Target after rollout**: 60%+ `submitted` (anything above 40% justifies the spend; 70%+ is the comfort zone).
3. Use whatever Loops/Job-board admin view we already have for status distribution, or run a quick Firestore query against `autoApplyJobs` filtered to the last 24h.
4. If silent-submit rate is below 40%, debug: residential pool reputation may be temporarily flagged on a specific ATS (Greenhouse Enterprise tenants are the usual suspect). Sanity check by running the same fill from a personal home IP — if THAT also CAPTCHAs, it's not a proxy problem.
5. Monitor Decodo bandwidth at https://dashboard.decodo.com weekly. Plan covers ~4,000 submits at ~6 MB each. Pay-as-you-go above the plan is $4/GB.

Exit: feature is live, silent-submit rate is at or above 60% across the three ATSes combined.

---

## Verification

| Check | How |
|---|---|
| Helper returns `None` without creds | REPL, no env set. |
| Helper returns dict with correct sticky username format | REPL, env set, verify the string contains `country-us` and `sessionduration-10`. |
| Browserless accepts the proxy config | Day-2 IP-egress log shows residential IP. |
| Same job reuses same IP within 10 min | Day-2 manual: fire same `auto_apply_id` twice, IP should match. |
| Different jobs get different IPs | Day-2 manual: fire two different `auto_apply_id` values, IPs should differ. |
| Fillers work identically when proxy is unset | Day-2: unset `DECODO_USERNAME`, fire a job, should match pre-change behavior. |
| Refund path still fires on proxy failure | Day-2: set `DECODO_PASSWORD=invalid`, fire a job, status should be `failed` and credits refunded. |

---

## Risks and what to do

| Risk | Likelihood | Plan |
|---|---|---|
| `browser.new_context(proxy=...)` is silently ignored by Browserless's hosted Chromium | Low (Browserless explicitly documents this) | Day-2 egress check catches it. Fallback: encode proxy into the WebSocket URL via `&externalProxyServer=`, `&externalProxyUsername=`, `&externalProxyPassword=` query params. |
| Greenhouse Enterprise still CAPTCHAs even with residential IPs | Medium (Zapply's writeup confirms this) | We don't need 100%. `needs_verification` UX is the catch-all. |
| Decodo IP gets poisoned by another customer | Low | Sticky session per job means one bad IP only kills one job. Next job rotates. |
| Decodo username format changes (they rebranded from Smartproxy recently) | Low | Format is in one function. One file edit if it ever breaks. |
| Bandwidth overrun if MB-per-session creeps up | Low | Decodo PAYG at $4/GB above plan. Monitor dashboard weekly. |
| Token expiry / network blip during fill | Medium | Existing try/except in each filler catches and surfaces as `failed`, runner refunds. No new error handling required. |
| Cross-job IP correlation if we accidentally reuse session IDs | Low | `auto_apply_id` is unique per job by construction; helper falls back to `uuid.uuid4().hex` if missing. |

---

## Out of scope

- Workday / iCIMS / SmartRecruiters fillers — backend doesn't have them yet.
- Chrome extension auto-fill — separate Plan B v2 doc. Plan A and Plan B v2 are complementary, not exclusive.
- Per-tier proxy gating (free vs pro using different pools). Premature.
- Country-specific targeting beyond US. Add when we have non-US users.
- LLM-driven CAPTCHA solving. Wrong layer.

---

## Why not Browserless's own residential proxy add-on

The previous version of this doc recommended `&proxy=residential&proxyCountry=us` (Browserless's bundled pool). Two reasons we're going BYO Decodo instead:

1. **Cost.** Browserless residential is billed at 6 Units/MB on top of session units. Decodo is $81/mo flat for 25 GB. At our volume, Decodo is ~3–5x cheaper.
2. **Separation of concerns.** Decoupling the proxy vendor from the browser vendor means we can swap either independently. If Browserless ever quietly degrades residential quality (vendor pools do this), we have no visibility.

We can always fall back to Browserless's pool by setting `proxy=residential` on the WebSocket URL if Decodo has an outage.

---

## What this changes for users

| Before | After |
|---|---|
| Click Auto-apply. 30s later, see "Finish in browser" tab with prepared answers. Open URL, paste each answer, solve CAPTCHA, submit. | Click Auto-apply. 30s later, status flips to `submitted`. Done. |
| 100% of jobs require manual verification step. | ~70–85% silent. The 15–30% that still trip get the same verification UX as today. |

No frontend changes. No marketing change. No tier change. The feature just starts working.
