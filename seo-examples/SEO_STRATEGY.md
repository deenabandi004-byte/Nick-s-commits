# Offerloop SEO Strategy

The plan we are going forward with. This is the reference doc. The operating detail lives in
three Claude skills (see "The skills" below); this is the summary a human reads.

---

## The thesis

**Product-led SEO, not keyword-led.** Every page maps to one thing Offerloop actually does,
shows a real slice of the product, and ends in one CTA that deep-links into the app.

Why: informational SaaS content converts at roughly 0%. Product-intent pages convert about
25x higher. The closest analog (omnius, an AI tool doing programmatic SEO) hit ~23% trial
conversion because every page mapped to a product action and deep-linked into the pre-filled
product.

Greg Isenberg's 10,000-page playbook, corrected: not 10K broad articles. Hundreds to low
thousands of product-led pages, each carrying unique per-cell data.

The one-line test for any page: **if it can't end with the reader clicking into Offerloop and
finishing the job that minute, it's an article, and articles don't convert.**

---

## What started this: the GSC audit

- 72.9K impressions, 734 clicks, 1.0% CTR, ~772 indexed pages over 90 days.
- 30% of clicks are brand ("offerloop"). Real non-brand CTR is ~0.7%.
- `/compare/*` bleeds 45K impressions at 0.4% CTR: high volume, no product fit, near-zero conversion.
- `/networking-for/*`, most `/alumni/*`, most `/networking/*`: near-dead.
- One template works: `/meeting/*` firm pages at 2.5-8% CTR. That is the proof the
  product-led, firm-specific format converts.

---

## The page formats

Each maps to one Offerloop action, shows that product's real output, deep-links into the app.
Two tiers: the **showcase** formats (original 7) render a styled, sample-data artifact; the
**widget-embedded** formats (the 3 new ones) drop a fully working tool into the page so the
reader gets a real result for their actual resume / cover letter / interview, not a sample.

### Showcase formats (the original 7)

| Format | Action | Primary keyword | Deep-link |
|---|---|---|---|
| Cold email | REACH | goldman sachs cold email | /find?company=Goldman%20Sachs |
| Find alumni | FIND | USC alumni at Goldman Sachs | /find?company=Goldman%20Sachs&school=USC |
| Interview prep | PREP | goldman sachs superday questions | /interview-prep?company=Goldman%20Sachs |
| Resume checker | RESUME | investment banking resume checker | /write/resume |
| Recruiting timeline | TRACK | 2028 investment banking recruiting timeline | /find |
| Networking email generator | REACH | networking email generator for students | /find |
| Meeting prep | PREP | meeting questions to ask a mckinsey consultant | /meeting-prep?company=McKinsey |

### Widget-embedded formats (3 new clusters, May 2026)

These are the highest-converting variant. Industry data (Unbounce, Q4 2024 across 41K pages):
embedded interactive tools convert 25-80% better than static landing pages. Our model copies
Resume Worded's no-signup-required upload widget pattern (their `/resume-scanner` is the
proof) and beats Jobscan's signup-gate. The reader gets a real, personalized result on the
SEO page itself, then we convert them via the widget's own email gate (or, if they bounce,
the existing inline/exit-intent capture).

| Format | Action | Primary keyword | Embedded widget | Deep-link |
|---|---|---|---|---|
| Resume review for [role at firm] | RESUME | software engineer resume for goldman sachs | `ResumeReviewWidget` | /signin?mode=signup |
| Cover letter writer for [role at firm] | RESUME | cover letter for goldman sachs investment banking | `CoverLetterWidget` | /signin?mode=signup |
| Interview prep for [role at firm] | PREP | mckinsey case interview questions 2026 | `InterviewPrepWidget` | /signin?mode=signup |

Each widget is a drop-in React component (`src/components/widgets/*.tsx`) with a `source`
prop for per-page lead attribution. They share the same `eyebrow` / `heading` / `subhead`
override props so the widget feels native to whatever firm-and-role page hosts it. They each
hit a public, anonymous backend (`/api/tools/*`) that has its own rate limit and is not
credit-gated, so a college student can get a real result without signing up.

These formats win on three fronts:
1. **Volume**: "[firm] cover letter", "[firm] [role] resume", "[firm] interview questions"
   are high-volume queries with clear job-application intent. The whole long tail of firm x
   role combinations is currently served by static example sites (livecareer, cvgenius,
   resume.io, mindsumo, glassdoor). Static examples lose to a live tool that uses *your*
   resume for *that* job.
2. **Personalization proof**: showing a tailored output for the visitor's actual application
   is the most credible demonstration of the product we have. The line-by-line edits the
   resume widget produces are unfakeable proof.
3. **Lead capture**: every widget completion produces an email gated lead in
   `lead_magnet_emails` with the source page attached. The user can convert with no commit
   beyond an email, which is a much lower bar than starting a trial.

Keyword research replaced 3 weak picks earlier: "free ATS resume checker" (DR-80 owned) became
"investment banking resume checker"; "2027 timeline" (stale) became "2028"; "free cold email
generator" (sales-tool SERP, wrong audience) became "networking email generator for students".

The firm pages (cold email, find, interview, meeting) win on the firm x school x division
long tail where DR-70 sites won't build dedicated pages. The tools (resume, timeline,
generator) win by being live interactive tools in a niche.

---

## Quality bars (non-negotiable, enforced by the skills)

1. **Product-led test** - maps to one action, shows product output, one deep-link CTA.
2. **Product-output proof** - one of two forms, never both:
   - **Showcase variant** (the original 7 formats): a fully-realized styled artifact (not a
     stub), a named realistic sample, structure mirroring the real backend output, a
     "generated from {data}" annotation on every personalized line.
   - **Widget variant** (the 3 new formats): a working `<ResumeReviewWidget>`,
     `<CoverLetterWidget>`, or `<InterviewPrepWidget>` rendered above the fold, with the
     widget's `source` prop set to the page slug and `eyebrow` / `heading` / `subhead`
     overridden with copy specific to that firm + role. The visitor gets a real result for
     their own input, not a sample.
3. **Email quality bar** - one specific factual hook, one sharp question, short (70-90 words),
   no forced openers, no generic firm commentary. In showcases, exaggerate the personalization:
   build the fictional contact a rich record and mine two almost-surprising specifics.
4. **Unique-data block** - every page carries real, page-specific, keyword-matched facts
   (the "by the numbers" strip). This is the anti-doorway-page defense. Applies to widget
   pages too: the widget alone is not enough body content. Pair it with firm-specific facts
   (recent deals, recruiting timeline, ATS quirks for that firm, etc).
5. **Copy rules** - no em dashes, no sparkle icons, builder voice, never fabricate a stat.
6. **Design** - headers in the landing-page font (`Libre Baskerville`, Georgia serif fallback),
   brand blue `#3B82F6`, body sans-serif.
7. **CTA wording** - an action phrase tied to the page, "your first ___" framing
   ("Reach out to your first Goldman analyst"). Never "Get started" / "Sign up".
8. **Widget pages: one widget per page.** All three widgets own their own polling, file
   state, and PDF preview iframes. Two on the same page race on those resources and can
   stall the browser. If a page covers two product axes (e.g. resume + cover letter for the
   same role), build two separate pages and cross-link them in the related-pages block.
9. **AEO defaults** - emit Article + FAQPage + HowTo JSON-LD on every page. Structured pages
   earn a ~2.8x citation lift in ChatGPT / Perplexity / Google AI Overviews per 2026 data.
   Refresh every page on at least a quarterly cadence (unrefreshed pages are 3x more likely
   to lose AI citations).

---

## Doorway pages and scaled content abuse (the deindex risk)

The biggest risk at scale. Google deindexes surfaces that are doorway pages (exist only to
funnel) or scaled content abuse (near-duplicate mass-produced pages).

The test: would a student bookmark this page even if Offerloop did not exist?

The defense:
- A unique-data block per page, pulled from real proprietary data (PDL alumni counts differ
  for every school x firm cell, interview questions differ per firm, etc.).
- The page fully satisfies the keyword intent.
- No two sibling pages share more than ~60-70% of body content.
- Proprietary data is both the moat and the defense.
- On widget-embedded pages, the widget itself is a strong utility signal: the page does
  something for the visitor, it isn't a doorway. But the widget is not a substitute for
  unique body content; the firm-specific facts above still ship on every widget page.
- Stagger publishing (50-200/week); prune dead weight.

The SEO Heist (Causal: 1,800 scraped pages, deindexed in weeks) is the cautionary tale.

---

## The skills (the operating system)

Three Claude skills run this. Invoke them by name in Claude Code.

- **offerloop-seo-keywords** - keyword research, the 11-cluster framework, the 0-100
  product-intent score (build >=60, skip <30), the keyword universe.
- **offerloop-seo-article** - writes the pages. Holds the product-led test, both proof
  variants (showcase and widget), 7 showcase templates plus 3 widget templates, copy rules,
  the unique-data-block rule, and the one-widget-per-page rule. Plus reference files:
  `templates.md`, `email-quality-bar.md`. **TODO:** the skill currently documents only the
  showcase variant; needs an update to document the widget variant before the resume / cover
  letter / interview pages scale.
- **offerloop-seo-strategy** - decides what to publish, the publish cadence, kill/scale
  criteria, the doorway-page defense, measurement (GSC + LLM citation tracking), AEO.

---

## Rollout and indexing process

The 7 pages now are `/seo-preview/*` with `noindex` - format approval only. To ship for real:

1. **Turn previews into real pages.** Pick final slugs, convert each into a data-driven
   template (firm/school as params, pulls real data), remove the `noindex` tag.
2. **Make them crawlable.** Add every URL to `sitemap.xml` (build a generator). Internal-link
   them: a hub page per cluster plus sibling links. `robots.txt` already allows them.
3. **Server rendering is handled.** `wsgi.py` runs Prerender.io middleware that serves
   pre-rendered HTML to Googlebot and 40+ bots. Confirm new routes are not excluded.
4. **Submit in Google Search Console.** Submit the sitemap; URL-inspect priority pages.
   Indexing is gradual: days to weeks per page, longer for a large set.
5. **Stagger, don't dump.** 50-200 pages/week. A mass spike of thin pages triggers
   scaled-content-abuse.
6. **Prune first.** The audit found ~700 weak pages. New pages index faster on a clean
   domain, so kill `/networking-for`, most `/alumni`, most `/networking` first.
7. **Monitor in GSC.** Watch "Crawled, not indexed" / "Discovered, not indexed". High rates
   there mean low judged value: add more unique data.

---

## Current status

- 7 showcase page formats built and live for review at `/seo-preview/*` (noindex).
- 3 widget components built and live at `/sandbox/*` and `/tools/*`. Each is frame-agnostic,
  drop-in, hits a public anonymous backend (`/api/tools/*`), and accepts an optional
  `examplePanel` prop for the side-by-side SEO layout.
- **Infrastructure for the 400-page rollout is built (Wave 0 complete):**
  - **Keyword universe** documented in `seo-examples/SEO_KEYWORD_UNIVERSE.md` (100 pages per
    cluster, 4 clusters, 400 pages total, plus the wave plan).
  - **Data layer** at `connect-grow-hire/src/seo/data/`: `types.ts`, `firms.ts` (25 Tier-1
    firms with ATS attribution), `roles.ts` (12 role variants), plus 4 cluster data files
    (`resume-review.ts`, `cover-letter.ts`, `interview-prep.ts`, `ats.ts`) seeded with 17
    fully-fleshed Wave 0 entries.
  - **4 templates** at `connect-grow-hire/src/pages/seo-preview/templates/`:
    `ResumeReviewTemplate`, `CoverLetterTemplate`, `InterviewPrepTemplate`,
    `ATSGuideTemplate`. Each reads a data row and emits a fully-realized page with
    JSON-LD (Article + FAQPage + WebApplication).
  - **Dynamic routes** wired in `App.tsx`: `/seo-preview/resume-review/:slug`,
    `/seo-preview/cover-letter/:slug`, `/seo-preview/interview-prep/:slug`,
    `/seo-preview/ats/:slug`. Adding a new page = adding a row to the cluster data file.
  - **Sitemap generator** at `connect-grow-hire/scripts/generate-seo-sitemap.cjs`. Emits
    `public/sitemap-seo.xml` with only `published: true` rows. Run via
    `node scripts/generate-seo-sitemap.cjs`. This is the staggered-release mechanism per
    `SEO_ROLLOUT_PLAN.md`: pages exist in code, Google sees them only when the flag flips.
- **17 template-driven pages live (Wave 0):** 5 resume review (Goldman IB, JPM IB,
  McKinsey BA, Google SWE, Stripe SWE) + 4 cover letter (McKinsey BA, Goldman IB,
  Centerview IB, Bain BA) + 3 interview prep (McKinsey BA, Goldman IB superday, Google SWE)
  + 5 ATS (the generic "what is an ATS" + Goldman Workday + Anthropic Lever + ATS keywords
  for SWE + ATS keywords for IB analyst).
- 3 skills enforce quality bars. `offerloop-seo-article` carries the widget variant
  documentation. Companion file `ranking-playbook.md` captures the Quick-Answer formula,
  H1/H2 patterns, freshness rule, factual library, and the JSX-text writer trap.
- Keyword research complete for the 4 widget clusters per `SEO_KEYWORD_UNIVERSE.md`.

## Next steps

1. Approve the 17 Wave 0 pages by clicking through the URLs in the Review links section.
2. Fill in Wave 1 (next 100 pages, 25 per cluster) by adding rows to the cluster data
   files. Each new row needs the same rich per-cell content as the seeded rows: tailored
   Quick-Answer, statStrip, uniqueDataBlock, examplePanel data, and FAQ. Approximate cost
   per row: 25-40 minutes of focused authoring with the firm's recent recruiting data.
   The data file comments name the rows expected in each wave.
3. Pull real proprietary data (PDL alumni counts per firm-school cell, Firestore response
   rates) and surface in `statStrip` so no two sibling rows share the same numbers.
4. Update `offerloop-seo-article` `templates.md` to reference the new templates and the
   data-row schema (the SKILL.md, ranking-playbook.md, and data layer are done).
5. Prune the ~700 dead pages from the old surface (per `SEO_ROLLOUT_PLAN.md` Phase 1a).
6. Flip the `noindex` flag on the templates and add internal linking blocks (related-pages
   sibling links) once the format is approved.
7. Point production `sitemap.xml` at `sitemap-seo.xml` once the noindex comes off.
8. Submit to GSC, monitor indexing rate and CTR per row, kill any URL hitting 50+
   impressions with <0.5% CTR over 14 days (per `SEO_ROLLOUT_PLAN.md` Phase 2 gates).
9. Quarterly refresh every published row per the playbook's 90-day checklist.

---

## Review links (local dev server, port 8080)

Showcase format previews:

- http://localhost:8080/seo-preview/cold-email-goldman
- http://localhost:8080/seo-preview/find-usc-goldman
- http://localhost:8080/seo-preview/interview-prep-goldman-superday
- http://localhost:8080/seo-preview/resume-checker
- http://localhost:8080/seo-preview/ib-recruiting-timeline
- http://localhost:8080/seo-preview/networking-email-generator
- http://localhost:8080/seo-preview/meeting-mckinsey

Widget-embedded format previews (legacy hand-built static pages):

- http://localhost:8080/seo-preview/resume-review-goldman-ib
- http://localhost:8080/seo-preview/what-is-an-ats
- http://localhost:8080/seo-preview/cover-letter-mckinsey-ba
- http://localhost:8080/seo-preview/interview-prep-mckinsey-case

Template-driven preview pages (Wave 0, 17 live):

- Resume review (5): `/seo-preview/resume-review/{goldman-sachs-ib-analyst,jpmorgan-ib-analyst,mckinsey-ba,google-swe,stripe-swe}`
- Cover letter (4): `/seo-preview/cover-letter/{mckinsey-ba,goldman-sachs-ib-analyst,centerview-ib-analyst,bain-ba}`
- Interview prep (3): `/seo-preview/interview-prep/{mckinsey-ba,goldman-sachs-ib-analyst,google-swe}`
- ATS (5): `/seo-preview/ats/{what-is-an-ats,goldman-sachs,anthropic,keywords-swe,keywords-ib-analyst}`

Widget sandboxes (no marketing chrome, raw widget):

- http://localhost:8080/sandbox/resume-widget
- http://localhost:8080/sandbox/cover-letter-widget
- http://localhost:8080/sandbox/interview-prep-widget

Standalone tool pages (production, indexable):

- http://localhost:8080/tools/resume-review
- http://localhost:8080/tools/cover-letter
- http://localhost:8080/tools/interview-prep
