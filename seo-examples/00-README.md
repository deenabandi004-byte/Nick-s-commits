# SEO Example Articles, For Review (v2: product-led)

Seven example pages, one per format. **v2 reframes every page to be product-led**, after
research confirmed that informational SEO content converts at ~0% for SaaS, while pages
mapped to a real product action convert 25× higher. **Nothing here is live.** These are
review drafts.

## What changed from v1, and why

v1 chased recruiting keywords broadly. The founder flagged that the articles felt
disconnected from what Offerloop does. Research confirmed it:

- Informational SaaS content converts at **~0%**. Product-intent ("BOFU") keywords convert **25× higher**.
- The closest analog, omnius, an AI tool doing programmatic SEO, hit **23% trial conversion** because every page mapped to a product action and deep-linked into the pre-filled product.
- Eli Schwartz's product-led SEO rule: **"make your product the content."** A page should *be* a slice of the product, not an article about the topic.
- AI Overviews now answer informational queries in-place, so "McKinsey vs BCG"-type pages lose the click anyway.

**The test every page must pass:** *if it can't end with the reader clicking into Offerloop
and finishing the job that minute, it's an article, and articles don't convert.*

So every v2 page: (1) maps to one Offerloop action, (2) shows a real slice of product
output, (3) ends in **one** CTA that deep-links into the pre-filled product.

**Cut from the set:** the "McKinsey vs BCG" comparison example. It's a career-decision query
with no product fit, exactly the `/compare/*` pages bleeding 45K impressions at 0.4% CTR in
your audit. Comparison/"vs" pages survive only as internal-link/AI-citation support, never as
destination pages worth original effort. It was replaced with a resume ATS-check example.

## The product-intent score

Every keyword/page is now scored 0–100 before it gets built:

| Signal | Points |
|---|---|
| Query names a job the product does ("find", "email", "prep for") | 0–40 |
| Query is constrained (firm × school × role) | 0–30 |
| Searcher is in execution mode, not research mode | 0–20 |
| The page can end in a one-click product action | 0–10 |

**≥60 = build it as a use-case page. 30–59 = MOFU, build only to support a cluster.
<30 = informational, deprioritize (write only for AI citations).**

## The 7 examples, each maps to one Offerloop action

| # | File | Offerloop action | Format | Product-intent |
|---|---|---|---|---|
| 01 | `01-cold-email-goldman-usc.md` | REACH (+ FIND) | Cold-email use-case page, firm × school | ~90 |
| 02 | `02-meeting-mckinsey.md` | PREP, meeting | Prep-doc preview page. **Proven winner** (audit: 2.5–8% CTR) | ~85 |
| 03 | `03-recruiting-usc-goldman.md` | FIND, contact search | Find-alumni use-case page. Highest defensibility (unique PDL count) | ~90 |
| 04 | `04-firm-deep-dive-goldman-superday.md` | PREP, interview | Interview-prep preview page | ~70 |
| 05 | `05-resume-ib-ats-check.md` | RESUME, ATS score | Free-tool magnet (replaces the cut compare page) | ~80 |
| 06 | `06-timeline-ib-2027.md` | TRACK, deadlines + find | Live tracker product surface | ~60 |
| 07 | `07-free-tool-cold-email-generator.md` | REACH, email generation | Free-tool magnet, the page IS the tool | ~95 |

Every page is deliberately a **different shape** (length, structure, how much product it
embeds) so you can compare formats. Each header comment explains what it tests.

## The placeholder types

The drafts deliberately **invent no statistics**. Markers:

- `[[DATA: ...]]`, a number that must come from PDL or Firestore (alumni counts, reply
  rates, timeline dates). These are the proprietary-data moat; fabricating them defeats the purpose.
- `[[AUTHOR: ...]]` / `[[CASE STUDY: ...]]`, needs a real student byline and a real n=1
  story. The anonymous "Offerloop Team" voice fails Google's Experience signal.
- `[[BUILD: ...]]`, needs a real interactive component (files 05 and 06).

## How each format scales, and where it deep-links

| Format | Programmatic pattern | Deep-link target | Pages at scale |
|---|---|---|---|
| FIND, contact search | `/find/{firm}-alumni-{school}` | `/find?company=X&school=Y` | ~150–300 |
| REACH, cold email | `/cold-email/{firm}` or `{school}-to-{firm}` | `/find` (find + draft) | ~150–300 |
| PREP, meeting | `/meeting/{firm}` | `/meeting-prep?company=X` | ~150 firms |
| PREP, interview | `/interview-prep/{firm}` | `/interview-prep?company=X` | ~150–200 |
| RESUME, ATS check | `/resume-check`, `/resume-check/{industry}` | `/write/resume` | ~5–10 |
| TRACK, tracker | `/recruiting/{industry}-{year}-tracker` | `/find` | ~5–10, refreshed |

## How to open these files

From the repo root, type one of these into your prompt (the `!` runs it in this session):

```
!open seo-examples
```
```
!cursor seo-examples
```

Or ask me to paste any of them inline in the chat.

## The decision in front of you

1. **Which formats to scale?** All 7 now pass the product-led test, pick the priority order.
2. **Any structural changes** to a format, length, how much product to embed, CTA wording.
3. **Who writes the `[[AUTHOR]]` bylines?** Real students are required for the Experience signal.
4. **Who pulls the `[[DATA]]` numbers?** Backend task, PDL queries + Firestore aggregates.
5. **Who builds the `[[BUILD]]` components?** Files 05 and 06 need real interactive widgets.

Once formats are approved: (a) build the data-pull so `[[DATA]]` fills automatically,
(b) wire the deep-link routes (`/find?company=…&school=…` must accept pre-fill params),
(c) wire winning formats into React templates, (d) run the prune of the dead pages,
(e) start the staggered publish. **Nothing scales until you approve the formats here.**
