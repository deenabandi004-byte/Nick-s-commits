# Offerloop SEO Overhaul - Phased Rollout Plan

Implementer-ready. This is the corrected version of the phased plan, with 6 fixes applied
after review (see "Changes from the draft" at the bottom). Pairs with `SEO_STRATEGY.md`
(the thesis) and the three skills (the operating system).

## Read first

1. `seo-examples/SEO_STRATEGY.md` - strategy and quality bars (source of truth for thesis).
2. The three skills: `offerloop-seo-keywords`, `offerloop-seo-article`, `offerloop-seo-strategy`.
   Load all three. When the plan and the skills disagree, the skills win.
3. `connect-grow-hire/src/App.tsx` (routes), `src/pages/seo-preview/` (7 previews + `_shared.tsx`),
   `src/data/*.ts`, `src/pages/templates/`, `public/sitemap.xml`, `src/components/SEOHead.tsx`.
4. `backend/wsgi.py` (Prerender.io middleware), `backend/app/services/perplexity_client.py`.

House rules: no em dashes anywhere, in content or commits. Builder voice. Never fabricate
facts. Use clearly fictional examples in showcases. Every prune must be a reversible commit.

## Hard rules (do not violate)

- No page ships with only a PDL count plus product showcase as unique content. That is the SEO Heist failure.
- Phase 1b conversion tracking is not optional. Without it, every later kill/scale decision is blind.
- Never fabricate names, hires, salaries, or facts.
- Never exceed the page caps per phase.
- No permanent 410 before the 14-day noindex window completes.
- Do not skip the Phase 2a pilot.

---

## PHASE 1a - Pruning (reversible, two-stage)

### 1a.1 Reconcile the page surface  [STATUS: done, see `seo-rollout-status.md`]

Canonical inventory is in `seo-rollout-status.md` at repo root. Resolved: 1,494 URLs in the
sitemap, 772 indexed by Google. Not a discrepancy: that is the submitted-vs-indexed gap, and
a ~52% indexation rate is itself the quality signal the prune fixes.

### 1a.2 Export per-URL GSC data  [USER ACTION, BLOCKS 1a.3]

Before any pruning: export Google Search Console Performance data (last 90 days), by Page,
for `/compare/*`, `/networking/*`, `/alumni/*`. One CSV. This is the fix for the draft's
biggest flaw: it killed 220 compare pages (45K impressions) on aggregate CTR alone. With the
CSV we noindex the actual losers and keep any genuine winners.

`/networking-for/*` (79 pages) does not need the export. It is near-zero and gets killed wholesale.

### 1a.3 Stage 1: noindex (reversible)

Add `noindex, nofollow` via `SEOHead.tsx`. Do not delete pages. Do not 410.

| Template | Pages | Action |
|---|---|---|
| `/networking-for/*` | 79 | noindex all. No replacement. |
| `/compare/*` | 146 | noindex the losers from the GSC CSV. Keep pages with real clicks. |
| `/alumni/*` | 192 | noindex all. Replaced by find-alumni in Phase 2. |
| `/networking/*` | 499 | noindex all. Replaced by firm pages in Phase 2. |

Remove every noindexed URL from `sitemap.xml` immediately. Pages stay live (no 404s) through
the 14-day window. Record each in the `seo-rollout-status.md` watch list with noindex date
and day-14 eligibility date.

Commit: `chore(seo): stage 1 pruning, noindex dead templates`

### 1a.4 Stage 2: redirect or remove (DO NOT RUN UNTIL DAY 14)

After 14 days, once GSC confirms traffic on these URLs has dropped to near-zero:

- **Replaced templates (`/alumni/*`, `/networking/*`): 301 redirect**, not 410. Each old URL
  redirects to its nearest new-format equivalent once those pages exist (Phase 2). This keeps
  any link equity. Until the new pages ship, leave them noindexed.
- **Killed templates (`/networking-for/*`, the `/compare/*` losers): 410 Gone.** No successor.

Build `connect-grow-hire/scripts/prune-stage2.ts`: reads the watch list, emits Flask 301/410
route handlers, removes dead React routes and template files, marks data rows deprecated,
generates the GSC Removals list. Staged, not run, in Phase 1a.

Commit: `feat(seo): stage 2 redirect/remove script (staged)`

**Stop. Report. Wait for Phase 1b approval.**

---

## PHASE 1b - Conversion tracking (one session)

### 1b.1 UTM auto-tagging

Helper `connect-grow-hire/src/seo/buildCtaUrl.ts`: takes a deep-link target plus page
metadata, returns the URL tagged with `utm_source=seo`, `utm_medium=organic`,
`utm_campaign={template}`, `utm_content={slug}`, `utm_term={firm}`. Every template imports it.
No template hand-codes a CTA URL.

### 1b.2 PostHog event schema

Three events (PostHog is the only analytics tool wired in; see `src/lib/posthog.ts`):

- `seo_page_view` - on mount. Props: `{template, slug, firm?, school?, role?, page_intent_score, referrer, utm_source}`
- `seo_cta_click` - on CTA click. Same props plus `cta_destination`, `cta_label`.
- `seo_attributed_signup` - on signup completion when SEO first-touch UTMs exist. Props:
  `utm_campaign`, `utm_content`, `landing_page`, `time_to_signup_seconds`, `pages_viewed_before_signup`.

Attribution: on the first SEO page view, store first-touch UTMs in localStorage under
`offerloop_first_touch`. Never overwrite. On signup, read it and emit `seo_attributed_signup`.
Note: there is currently no `sign_up` event in the app at all. This phase adds the first one.

### 1b.3 Verification

Set `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` in the dev env first (PostHog
does not initialize without them). Confirm the three events land in PostHog with correct
first-touch attribution. Use PostHog's native UI to verify.

### 1b.4 Dashboard: DEFERRED

The custom `/admin/seo-performance` dashboard is deferred to the end of Phase 2a. There is no
SEO data until the pilot ships, so a custom HogQL dashboard now is tooling nobody can use.
Use PostHog's native UI until the pilot has data, then build the dashboard against real numbers.

Commit: `feat(seo): SEO conversion tracking (UTM + PostHog events)`

**Stop. Report. Wait for Phase 1c approval.**

---

## PHASE 1c - Registry, sitemap generator, production templates

### 1c.1 Registry

`connect-grow-hire/src/seo/registry.ts` - single source of truth. Each entry: `id`,
`routePattern`, `dataSource`, `productIntentScore` (from the keywords skill rubric),
`templateComponent`, `slugFn`, `metaFn`, `ctaTarget`, `status` (`active` | `pruned` | `pilot`).
Every downstream system reads the registry.

### 1c.2 Promote the 7 previews to production templates

Build data-driven templates in `src/pages/templates/` from each `seo-preview/*` page. Each
takes a data row plus a unique-data JSON payload (Phase 2a builds payloads); renders a leaner
placeholder version when the payload is missing. Each enforces the `offerloop-seo-article`
skill, including: the product-output showcase, the unique-data block, the email quality bar,
and **JSON-LD schema (Article + FAQPage + HowTo)** emitted per page. Refresh `llms.txt` to
list the new hub pages. Keep `/seo-preview/*` alive as `noindex` for format review. Add new
production routes to `App.tsx` but not to the sitemap.

### 1c.3 Sitemap generator

`connect-grow-hire/scripts/generate-sitemap.ts`: reads the registry plus the published
manifest `src/seo/published.json` (starts empty); emits `public/sitemap.xml` with only
`released: true` URLs; chunks into a sitemap index past 50K URLs; runs in `npm run build`.
This is the staggered-publish mechanism: pages exist in code (internal links work) but Google
sees them only when released.

### 1c.4 Internal linking and hub pages

Each template renders a "Related pages" block of 5-8 registry-computed sibling links. Build
hub pages: `/guides/meeting`, `/guides/cold-email`, `/guides/find-alumni`,
`/guides/interview-prep`, and `/guides` (master index). Hub pages go in the sitemap now (the
seed crawl graph). Spoke pages release in Phase 2.

### 1c.5 CI quality audit (stub)

`connect-grow-hire/scripts/audit-seo-pages.ts`, wired as `npm run lint:seo`, non-blocking in
1c. Checks: every registry entry has a template; every template imports `buildCtaUrl`; no em
dash in static content; exactly one primary CTA. Phase 2a makes it blocking and adds the
doorway-page checks.

Commit: `feat(seo): registry, sitemap generator, production templates, hub pages`

**Stop. Report. Wait for Phase 2a approval.**

---

## PHASE 2a - Pilot (200 pages, real data, 14-day gate)

### 2a.1 Unique-data layer

Build `connect-grow-hire/scripts/generate-seo-data.ts`. It uses the **existing backend
Perplexity client** (`backend/app/services/perplexity_client.py`: `quick_search`,
`pro_search`, `deep_research`), not a Perplexity MCP (there is no MCP). Call it via a thin
internal endpoint or a Python script. `meeting.py` already does firm research this way,
reuse that pattern.

Budget cap: $50 for Phase 2a. Track spend per call, abort if exceeded. Cache every response
under `scripts/.cache/perplexity/` keyed by query hash. Never re-query a cached key.

Per-fact JSON: `{fact, source (url), retrieved_at, confidence}`. Only `high` confidence
renders. `medium` renders hedged ("reportedly"). `low` is dropped. If a cell yields nothing
usable, mark it `data_insufficient` and skip the page. Never pad with filler.

### 2a.2 Pilot universe: exactly 200 pages

Meeting 50 (top firms, proven winner), cold email 50, find alumni 50 (10 firms x 5
schools: USC, Berkeley, NYU, Michigan, UCLA), interview prep 30, single tool pages 3, buffer 17.

### 2a.3 Staggered release

`scripts/release-pages.ts`: Week 1 release 100, Week 2 release the rest. Each release updates
`published.json`, regenerates the sitemap, and prints GSC submission instructions.

### 2a.4 CI audit: now blocking

Expand `audit-seo-pages.ts` to fail the build on: fewer than 4 unique-data facts; body
shingle similarity above 70% with any sibling (use MinHash, not pairwise, for speed); missing
source on any rendered fact; any em dash; more than one primary CTA; missing related-pages
block; CTA URL missing UTM params; `active` registry entry with no data file.

### 2a.5 Pilot gate (14 days minimum after week-2 release)

Build the deferred `/admin/seo-performance` dashboard here, once there is data. Then judge:

**Proceed to 2b if:** at least one template shows >=1% page-to-attributed-signup over >=200
pageviews; no template under 0.3% CTR with >50 impressions/page after 14 days indexed; CI
passes; no GSC spam action.

**Kill any template** over 50 impressions/page and under 0.5% CTR after 14 days. If all
templates are weak, 2b does not run, iterate the templates instead.

### 2a.6 Email capture (second-chance layer)

Add email capture to the pilot pages: an exit-intent popup plus one quiet inline block per
page, value-specific, segmented by cluster (banking, consulting, tech). Use the existing
`ExitIntentPopup.tsx` pattern and the beehiiv embed. Do not use the scroll/timer
`BeehiivPopup` (intrusive-interstitial penalty, cannibalizes trial starts). Add a
`seo_email_capture` PostHog event. The 2a.5 gate measures whether capture pages convert worse
on trial starts: if the hit is large, drop capture before 2b; if clean, keep and scale it.
Full rules in `offerloop-seo-article` and `offerloop-seo-strategy`.

Commit: `feat(seo): phase 2a pilot, 200 product-led pages`

**Stop. Wait 14 days. Review the dashboard. 2b triggers only on positive signal.**

---

## PHASE 2b - Scale validated templates (~1,800 pages)

Runs only if the 2a gate passes. Scale only templates that passed: meeting 50 to 500,
cold email 50 to 500, find alumni 50 to 800, interview prep 30 to 150 (only if it passed).
Perplexity budget: $400. Release cap: 150 URLs/week to the sitemap, ~12 weeks. Weekly
per-template review; monthly prune of any page 30+ days indexed, >50 impressions, <0.5% CTR.

---

## PHASE 3 - Scale gate (data-triggered)

Triggers when 2b is fully released and there are 60+ days of post-release data. Per template
after 60 days: >=2% CTR and >=1% page-to-signup scales aggressively; middling goes to 60 more
days probation; <0.5% CTR or <0.3% conversion kills the template (410).

Hard cap 10,000 live pages. Realistic defensible universe is 5,000-8,000. Programmatic SEO
follows a power law: roughly 1% of pages drive ~50% of traffic. The goal is 10K pages each
with genuine unique value and a ruthless gate that kills non-performers, not a 100% click
rate, which is not achievable. New expansion dimensions (class-year, verticals) each need
their own pilot.

---

## Changes from the draft (the 6 fixes)

1. **Per-URL GSC export before pruning `/compare/*`.** The draft killed 220 pages on
   aggregate CTR. Phase 1a.2 now requires the CSV first, then noindexes only the losers.
2. **No Perplexity MCP.** Phase 2a now uses the existing backend `perplexity_client.py`.
3. **301, not 410, for replaced templates.** `/alumni/*` and `/networking/*` 301-redirect to
   their new-format successors. 410 only the truly-killed templates.
4. **Custom dashboard deferred** from Phase 1b to end of Phase 2a. Use PostHog native UI
   until there is data.
5. **Schema and llms.txt scheduled.** Phase 1c now explicitly emits Article + FAQPage + HowTo
   JSON-LD per template and refreshes `llms.txt`.
6. **Path and env corrections.** Strategy doc is `seo-examples/SEO_STRATEGY.md`. PostHog needs
   `VITE_PUBLIC_POSTHOG_KEY` / `VITE_PUBLIC_POSTHOG_HOST` set before Phase 1b verification.
