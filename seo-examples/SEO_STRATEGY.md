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

## The 7 page formats

Each maps to one Offerloop action, shows that product's real output, deep-links into the app.

| Format | Action | Primary keyword | Deep-link |
|---|---|---|---|
| Cold email | REACH | goldman sachs cold email | /find?company=Goldman%20Sachs |
| Find alumni | FIND | USC alumni at Goldman Sachs | /find?company=Goldman%20Sachs&school=USC |
| Interview prep | PREP | goldman sachs superday questions | /interview-prep?company=Goldman%20Sachs |
| Resume checker | RESUME | investment banking resume checker | /write/resume |
| Recruiting timeline | TRACK | 2028 investment banking recruiting timeline | /find |
| Networking email generator | REACH | networking email generator for students | /find |
| Meeting prep | PREP | meeting questions to ask a mckinsey consultant | /meeting-prep?company=McKinsey |

Keyword research replaced 3 weak picks: "free ATS resume checker" (DR-80 owned) became
"investment banking resume checker"; "2027 timeline" (stale) became "2028"; "free cold email
generator" (sales-tool SERP, wrong audience) became "networking email generator for students".

The firm pages (cold email, find, interview, meeting) win on the firm x school x division
long tail where DR-70 sites won't build dedicated pages. The tools (resume, timeline,
generator) win by being live interactive tools in a niche.

---

## Quality bars (non-negotiable, enforced by the skills)

1. **Product-led test** - maps to one action, shows product output, one deep-link CTA.
2. **Product-output showcase** - a fully-realized styled artifact (not a stub), a named
   realistic sample, structure mirroring the real backend output, a "generated from {data}"
   annotation on every personalized line to make personalization visible.
3. **Email quality bar** - one specific factual hook, one sharp question, short (70-90 words),
   no forced openers, no generic firm commentary. In showcases, exaggerate the personalization:
   build the fictional contact a rich record and mine two almost-surprising specifics.
4. **Unique-data block** - every page carries real, page-specific, keyword-matched facts
   (the "by the numbers" strip). This is the anti-doorway-page defense.
5. **Copy rules** - no em dashes, no sparkle icons, builder voice, never fabricate a stat.
6. **Design** - headers in the landing-page font (`Libre Baskerville`, Georgia serif fallback),
   brand blue `#3B82F6`, body sans-serif.
7. **CTA wording** - an action phrase tied to the page, "your first ___" framing
   ("Reach out to your first Goldman analyst"). Never "Get started" / "Sign up".

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
- Stagger publishing (50-200/week); prune dead weight.

The SEO Heist (Causal: 1,800 scraped pages, deindexed in weeks) is the cautionary tale.

---

## The skills (the operating system)

Three Claude skills run this. Invoke them by name in Claude Code.

- **offerloop-seo-keywords** - keyword research, the 11-cluster framework, the 0-100
  product-intent score (build >=60, skip <30), the keyword universe.
- **offerloop-seo-article** - writes the pages. Holds the product-led test, the showcase
  quality bar, 7 templates, copy rules, the unique-data-block rule. Plus reference files:
  `templates.md`, `email-quality-bar.md`.
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

- 7 product-led page formats built and live for review at `/seo-preview/*` (noindex).
- 3 skills built and enforcing the quality bars.
- Keyword research complete and validated.

## Next steps

1. Approve the 7 formats.
2. Build the data-driven templates (firm x school) from the approved formats.
3. Pull the real proprietary data (PDL counts, Firestore aggregates) for the unique-data blocks.
4. Prune the ~700 dead pages from the old surface.
5. Build the sitemap generator; wire internal linking.
6. Stagger-publish, submit to GSC, monitor and scale what indexes well.

---

## Review links (local dev server, port 8080)

- http://localhost:8080/seo-preview/cold-email-goldman
- http://localhost:8080/seo-preview/find-usc-goldman
- http://localhost:8080/seo-preview/interview-prep-goldman-superday
- http://localhost:8080/seo-preview/resume-checker
- http://localhost:8080/seo-preview/ib-recruiting-timeline
- http://localhost:8080/seo-preview/networking-email-generator
- http://localhost:8080/seo-preview/meeting-mckinsey
