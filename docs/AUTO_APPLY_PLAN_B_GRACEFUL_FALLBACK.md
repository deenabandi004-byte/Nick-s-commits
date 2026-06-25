# Plan B — Status Quo + Polish (Stay on Graceful Fallback)

**Goal**: Don't add proxies, don't add CAPTCHA solvers. Keep the architecture we shipped this PR — server-side fill, detect CAPTCHA, route to `needs_verification`, user finishes in browser. Focus engineering time on making the verification UX **so good that it stops feeling like a failure path** and starts feeling like the product.

**Why this works**: The Sorce research showed that even Sorce — with 600k users, iOS app, and presumably residential proxies — fails on 15-30% of submissions and surfaces those via a "we couldn't apply" notification. Their reviews show users blame the ATS, not Sorce. **The graceful failure path IS the product for the long tail of ATSes.** The question is whether we can make our 100% fall-into-verification rate feel as good as Sorce's 15-30% feels (because their other 70-85% land silently).

The answer to that question is: **mostly yes, if the user finishes in browser in ~30 seconds with our pre-filled answers, that's a Simplify-grade experience.** Simplify went from $0 → $30M raised by ONLY pre-filling and having the user click submit. Same model, different framing.

**Legal posture**: Cleanest possible. Zero new vendor relationships beyond what's already running.

---

## End-state UX

1. User clicks Auto-apply on a Greenhouse / Lever / Ashby job.
2. Backend fills the form server-side (already shipped).
3. Job lands in "Finish in browser" tab within ~30 seconds.
4. User opens the tab → sees the company card → clicks "Open in browser" → apply URL opens in their actual browser.
5. **Chrome extension auto-fills the form** (this is the missing piece in Plan B v1, the centerpiece of Plan B v2).
6. User solves CAPTCHA in their real browser (real device = high score, no challenge OR a quick image puzzle).
7. User clicks Submit. Done. ~30 seconds elapsed.

Without the extension: same flow, but step 5 becomes "user copy-pastes our prepared answers from our verification card into the form." Slower (~2 minutes), but still functional. **This is what we shipped today.**

With the extension: 30-second experience. **Plan B v2 is the Chrome extension auto-fill addition.**

---

## Architecture changes

### What's already in place
- Three fillers complete + verification routing.
- "Finish in browser" tab with prepared-answers card + copy buttons.
- Status flips to `submitted` on user click-through.
- Chrome extension already exists at `chrome-extension/` (Manifest V3, v1.0.9) and already injects on Greenhouse and Lever job pages per CLAUDE.md.

### What changes (Plan B specifics)

Plan B has two layers — ship as separate PRs:

**Plan B v1 — Polish the copy-paste UX (~1 day)**
- Better drawer copy ("Open the application, paste, solve CAPTCHA, submit — takes 30 seconds")
- Highlight the prepared-answers blocks visually (less wall-of-text)
- Add a "Mark all copied" button so the user doesn't get prompt fatigue
- Add a small "How this works" callout explaining why we're routing through their browser (legal posture, security, etc.)
- Optional push notification when a verification card appears (works on web push, no native app needed)

**Plan B v2 — Chrome extension auto-fill (~3-5 days)**
- Extend the existing `chrome-extension/` with a new content script that activates on Greenhouse / Lever / Ashby apply pages.
- New backend endpoint: `GET /api/job-board/auto-apply/<id>/prepared-answers` — auth-gated, returns the same `prepared_answers` array the verification tab uses.
- Extension reads the auto_apply_id from a deep-link param when "Open in browser" is clicked.
- Extension fetches prepared_answers from backend.
- Extension walks the form DOM, matches labels to answers, fills in the user's real browser session.
- User just solves CAPTCHA + clicks Submit.

---

## Codebase touchpoints

### Plan B v1 — UX polish (already-shipped code, just refining)

| File | What changes |
|---|---|
| `connect-grow-hire/src/components/jobs/NeedsVerificationTab.tsx` | Better copy in the explainer box; visual polish on prepared-answer rows; "Mark all copied" UI. ~50 LOC. |
| `connect-grow-hire/src/lib/notifications.ts` (new) | Browser push notification when verification queue grows. Optional. ~80 LOC. |

### Plan B v2 — Chrome extension auto-fill

| File | What changes |
|---|---|
| `chrome-extension/manifest.json` | Add `host_permissions` for `*.greenhouse.io`, `*.lever.co`, `*.ashbyhq.com`. Some already present per CLAUDE.md. |
| `chrome-extension/content-autofill.js` (new) | Activates on apply pages. Reads `auto_apply_id` from URL hash (e.g., `#offerloop_id=abc123`). Calls backend for prepared_answers. Walks DOM, matches labels, fills fields. Uses the same React-native setter pattern we already wrote in `_form_filler_common.py` — port the JS verbatim. ~400 LOC. |
| `chrome-extension/background.js` | Listen for new messages from content-autofill.js; relay auth tokens to API. ~30 LOC. |
| `backend/app/routes/auto_apply.py` | New endpoint: `GET /api/job-board/auto-apply/<id>/prepared-answers`. Returns the same JSON the verification tab consumes. ~30 LOC. |
| `connect-grow-hire/src/components/jobs/NeedsVerificationTab.tsx` | Change "Open in browser" link to include `#offerloop_id=<id>` so the extension knows which job to autofill. ~5 LOC. |

---

## Step-by-step implementation

### Plan B v1 — Polish (1 day)

#### Half-day 1
1. **Rewrite the explainer copy** in `NeedsVerificationTab.tsx`. Reframe from "we failed, please help" to "your applications are pre-filled and ready — 30 seconds in your browser to finish each one." Audit every word.
2. **Add per-answer copy-confirmation visual**. After clicking "Copy", show a subtle pulse, then a "Copied X seconds ago" indicator. Reduces re-click anxiety.
3. **Add "Copy all answers" master button** that builds a single concatenated string of all prepared answers labeled, copies in one click. For text-heavy forms.

#### Half-day 2
4. **Optional: web push notification** when verification queue grows. Use the Notifications API (already in browser, no native app needed). Permission ask happens on first auto-apply submission. Standard pattern.
5. **Optional: dashboard widget** counting "applications waiting on you to finish in browser" — surfaces on the main dashboard, not just the job board tab.

### Plan B v2 — Chrome extension auto-fill (3-5 days)

#### Day 1 — Backend endpoint + extension scaffold

1. **Build `/api/job-board/auto-apply/<id>/prepared-answers`** — returns prepared_answers + apply_url + auto_apply_id. Auth: same Firebase token as our other endpoints. Endpoint already partially exists via the status endpoint; we'd refactor for cleaner extension-only access.
2. **Add `auto-apply-autofill` content script** entry to extension manifest. Match patterns: `https://boards.greenhouse.io/*`, `https://jobs.lever.co/*`, `https://jobs.ashbyhq.com/*`.
3. **Wire deep-link mechanism**: Update `NeedsVerificationTab.tsx` "Open in browser" to add `#offerloop_id=<id>` to the URL. Content script reads it on page load.

#### Day 2 — Form-fill logic in browser

1. **Port `_form_filler_common.py`'s fill helpers to JS**. Specifically: `id_selector`, `check_checkbox`, `fill_combobox`, `fill_text_if_present`, `react_force_text`, `react_force_checkbox`, `fill_radio_group`, `resolve_label_text`. Maybe 250 LOC of JS. Most of this is straight port — the JS expressions are already in our Python file inside `page.evaluate()` calls; just lift them out.
2. **Walk the form DOM**, match prepared_answers to fields by label text (use `resolve_label_text` as the matcher), fire fills.

#### Day 3 — UX polish + submit detection

1. **Inject a Offerloop banner** at the top of the apply page: "Offerloop pre-filled X fields. Solve the security check and click Submit." Style as a subtle bar, dismissible.
2. **Listen for the Submit button click** in the page. POST to `/mark-submitted` automatically when the user clicks Submit (don't wait for them to come back to our app). Cleanest UX: extension does the bookkeeping.
3. **Handle the SPA navigation case**: Lever and Ashby pages can re-render. Extension needs to debounce + re-walk on URL change.

#### Day 4 — Testing across the three ATSes

1. **Lever** Renegade URL — full E2E with extension installed in dev profile.
2. **Ashby** FutureFit URL — same.
3. **Greenhouse** — pick a tenant we haven't bot-flagged yet.

#### Day 5 — Production rollout

1. **Bump extension version** to v1.1.0. Submit to Chrome Web Store (their review is typically 1-3 days but can be longer for permission additions).
2. **Add install-prompt UX** to the "Finish in browser" tab for users who don't have the extension. Single click → Chrome Web Store listing.
3. **Telemetry**: log extension vs. no-extension auto-submit rates.

**Total Plan B v1 + v2: ~4-6 days of focused work.**

---

## External services & config

**None.** That's the entire point of Plan B.

- No Bright Data residential proxy upgrade
- No CapSolver / 2Captcha subscription
- No new vendor relationships
- No new ToS to read

The existing stack (Browserless, Firebase, Stripe, the LLMs, the existing extension) covers everything.

---

## Cost

- **Ongoing monthly: $0** beyond what we're already spending.
- **One-time: ~4-6 days of engineering** (Plan B v1 + v2 combined).
- **Refunds remain**: existing logic on failure paths unchanged.

---

## Risks & unknowns

| Risk | Likelihood | Mitigation |
|---|---|---|
| Users perceive "have to finish each one in browser" as a worse product than competitors who claim full auto | Medium-High | Plan B v2 (extension) reduces "finish in browser" to ~30 seconds, matching Simplify's UX. Without the extension, friction is real. |
| Push-notification permission ask annoys users | Low | Make it opt-in after first verification card appears. Default off. |
| Chrome extension install rate is low (~30-50% of users install when prompted) | Medium-High | A no-install fallback (copy-paste UX from Plan B v1) means non-installers still have a path. Higher friction but functional. |
| Greenhouse / Lever / Ashby change their DOM and break the extension content script | Medium (ongoing) | Same risk we have in server-side fillers. Same mitigation: fixture-based regression tests on the captured HTMLs. The fixtures from this PR (`backend/tests/fixtures/auto_apply/New_LEVER.html`, etc.) can be reused as extension-side test fixtures. |
| reCAPTCHA on Lever / Ashby is annoying for users to solve | Low | Most users see the invisible v3 variant (no interaction). Visible reCAPTCHA v2 is occasional, maybe 10% of submits. |
| Users churn because "I'm doing the same work as before" | Medium | Plan B v1's copy reframe is critical. The product must SELL the value of pre-fill — even saving 90% of typing per app is huge if framed right. |

---

## Success metrics

After Plan B v1 ships:

| Metric | Target |
|---|---|
| Time from "click Auto-apply" to "submitted" | <3 min (user finishes in browser quickly) |
| % users who finish a needs_verification card within 24h | 60%+ |
| User-reported friction rating in NPS | Mixed (acceptable) |

After Plan B v2 (extension) ships:

| Metric | Target |
|---|---|
| Extension install rate among auto-apply users | 50%+ |
| Time from "click Auto-apply" to "submitted" (extension users) | <60 seconds |
| % submitted-via-extension out of total submits | 50%+ |
| User-reported friction rating (extension users) | High (close to "it just works") |

---

## What this DOES NOT fix

- **Full automation.** Even with the extension, the user still solves CAPTCHA (in 5 seconds, but it's an interaction). Plan A is the only path to zero-touch submission, with the caveat that even Plan A only reaches ~70-85%.
- **Users who refuse to install the extension.** Maybe 30-50% of users. They live on the copy-paste path.
- **Mobile users.** Chrome extension only works on desktop Chrome. Mobile users on Safari/iOS Chrome can't get the extension speedup. They use the copy-paste flow.

---

## Why this could actually be the right answer

The whole conversation that got us here started with "how does Sorce do it?" The research confirmed: **Sorce doesn't do magic.** They server-fill + gracefully fail + tell the user. Their reviews show ~15-30% of submissions fail. They've absorbed that as part of the model.

Plan B says: we already have Sorce's architecture, plus a Chrome extension already running on these exact pages. If we lean into the extension as the auto-fill mechanism (instead of competing with Sorce on server-side IP gymnastics), we end up with a product that:

- Costs $0/month to run at scale
- Has zero legal exposure
- Reaches Simplify-grade UX (30-second submission, two clicks)
- Doesn't depend on Bright Data, CapSolver, or any third party
- Ages well — extension auto-fill is a moat that compounds, proxy spend is a cost that compounds

The downside is that we never claim "full auto-submit." We claim "we pre-fill everything; you click submit." Same as Simplify. Same posture as Grammarly, 1Password, LastPass. **That's good company.**

---

## Comparison sources

- [Simplify Chrome Web Store listing](https://chromewebstore.google.com/detail/simplify-copilot-autofill/pbanhockgagggenencehbnadejlgchfc) — the autofill-only model
- [Sorce honest-review page](https://www.sorce.jobs/articles/sorce-review) — admits graceful failure
- Internal: `chrome-extension/` directory — existing infrastructure to extend
- Internal: `docs/AUTO_APPLY_PLAN_A_RESIDENTIAL_PROXIES.md` — the alternative path

---

## TL;DR

**~0 lines of new infrastructure. ~4-6 days of engineering for the extension + UX polish. $0/month ongoing. Lifts UX from "decent" (copy-paste path) to "Simplify-grade" (extension auto-fill path). Legally cleanest possible posture. Doesn't depend on any new vendor or ATS-detection arms race. Caps theoretical max success rate at "every submission needs one user click" — which IS the legitimate-services market today.**

This is the path where Offerloop = the responsible auto-apply tool that doesn't pretend to be a human, with the same UX as the leader (Simplify) plus better pre-fill quality than the leader (because we have the resolver brain Simplify doesn't).
