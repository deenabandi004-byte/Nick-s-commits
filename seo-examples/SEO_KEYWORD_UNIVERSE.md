# Offerloop SEO Keyword Universe (400-page rollout)

Target: 100 pages per cluster, 4 clusters, 400 pages total. Pairs with
`SEO_STRATEGY.md` (thesis), `SEO_ROLLOUT_PLAN.md` (phasing), and the
`offerloop-seo-article` skill's `ranking-playbook.md` (how to write each page).

This doc lists the explicit 400-page universe by cluster, firm, role, and slug.
Every entry maps to a single product action and a single widget. The data files
under `connect-grow-hire/src/seo/data/` hold the live registry; this doc is the
human-readable plan and the source of truth when seeding new rows.

## Why these niches rank

Three filters were applied to pick the universe:

1. **ICP fit.** Offerloop's ICP is college students recruiting into consulting,
   IB, and tech (per `CLAUDE.md`). Every firm in the universe employs that ICP.
2. **Long-tail winnability.** Per 2026 research, 91.8% of searches are long-tail,
   conversion is 2.5x higher than head terms, KD <30 is the typical threshold
   for ranking from a DR-30 site (we're newer). All entries are 3+ word
   firm-and-role phrases at low to moderate KD; head terms ("resume builder")
   are explicitly excluded because they're DR-80 owned territory.
3. **White space.** Per the SERP audits in `ranking-playbook.md`, no major
   competitor runs programmatic per-firm pages for resume scoring, cover
   letters, or interview prep. The static-example sites (livecareer, cvgenius,
   mindsumo) lose to a live, tailored widget. The ATS-by-firm cluster is
   completely uncovered.

## Stagger plan (per `SEO_ROLLOUT_PLAN.md` Phase 2a / 2b)

Pages live: ship in waves of 50-150 per week. First wave seeds ~10-15 entries
per cluster (~50 pages) so we can measure indexing and CTR before the rest go
live. The remaining ~350 pages release on the 14-day-after-pilot validation
gate from the rollout plan.

| Wave | Cluster 1 | Cluster 2 | Cluster 3 | Cluster 4 | Total | Trigger |
|---|---|---|---|---|---|---|
| Wave 0 (pilot, live now) | 12 | 12 | 12 | 14 | ~50 | n/a |
| Wave 1 (post-2a gate) | 25 | 25 | 25 | 25 | 100 | indexing >= 60%, CTR >= 0.7% in 14 days |
| Wave 2 | 25 | 25 | 25 | 25 | 100 | same gates |
| Wave 3 | 25 | 25 | 25 | 25 | 100 | same gates |
| Wave 4 (long tail) | 13 | 13 | 13 | 11 | 50 | top-tier templates only |
| **Total** | **100** | **100** | **100** | **100** | **400** |  |

Kill criteria per template per the rollout plan: any URL hitting 50+ impressions
with <0.5% CTR over 14 days indexed gets noindexed and replaced with a better
angle. Same kill logic per firm-cell.

---

## The firm tiers (used across clusters 1, 2, 3)

### Tier 1: Investment Banking (10 firms)

| Firm | Pop weight | Notes |
|---|---|---|
| Goldman Sachs | 1.0 | Highest IB search volume; ~250K applications/year for 2,900 internship slots (1.16% acceptance) |
| JPMorgan | 0.95 | Comparable volume to Goldman; Workday ATS |
| Morgan Stanley | 0.9 | Strong on S&T queries too |
| Bank of America | 0.7 | Volume but less branded urgency |
| Citi | 0.7 | Similar to BofA |
| Evercore | 0.6 | Boutique, high prestige, high search velocity for "Evercore IB analyst" |
| Lazard | 0.5 | Boutique, restructuring focus |
| Centerview | 0.5 | Most prestigious boutique; high "centerview cover letter" volume |
| Moelis | 0.4 | Boutique, MM coverage |
| Houlihan Lokey | 0.4 | Restructuring leader |

### Tier 1: Consulting (5 firms)

| Firm | Pop weight | Notes |
|---|---|---|
| McKinsey | 1.0 | Pulled recruiting earlier in 2026; biggest "case interview" volume |
| Bain | 0.95 | High "Bain BA" volume |
| BCG | 0.95 | Comparable to Bain |
| Deloitte (S&O) | 0.7 | Big 4 with consulting practice |
| EY-Parthenon | 0.5 | Strategy arm of EY |

### Tier 1: Tech (10 firms)

| Firm | Pop weight | Notes |
|---|---|---|
| Google | 1.0 | Highest SWE volume; multiple ATS paths |
| Meta | 0.9 | Strong on PM and SWE queries |
| Amazon | 0.9 | Massive cohort; LP-style behavioral has dedicated search volume |
| Microsoft | 0.85 | High volume across roles |
| Apple | 0.85 | Less programmatic application path (referrals matter) but high search |
| Stripe | 0.8 | High applicant interest; Greenhouse ATS; "Stripe interview" is a strong query |
| Anthropic | 0.75 | Surging 2026 demand; Lever ATS |
| OpenAI | 0.75 | Surging 2026 demand |
| Nvidia | 0.7 | Hardware-and-AI overlap; strong search post-2024 |
| Tesla | 0.65 | High volume, harder-to-rank because of brand noise |

**Total Tier 1 firms: 25**, used as the firm dimension in Clusters 1, 2, 3.

---

## The role universe per industry

### Banking roles (4)

| Role | Slug | Notes |
|---|---|---|
| Investment Banking Analyst | `ib-analyst` | Primary role, highest volume |
| Sales & Trading Analyst | `st-analyst` | Distinct keyword set (markets, trading, quant) |
| Tech IB Analyst | `tech-ib-analyst` | TMT-focused, distinct from generic IB |
| Asset Management Analyst | `am-analyst` | AM track, lower volume but defensible |

### Consulting roles (4)

| Role | Slug | Notes |
|---|---|---|
| Business Analyst (BA) | `ba` | Undergrad entry point |
| Senior Associate / Consultant | `consultant` | Post-MBA / experienced hire |
| Implementation Consultant | `implementation` | McKinsey Implementation practice specifically |
| Tech Analyst | `tech-analyst` | Digital / technology consulting arm |

### Tech roles (4)

| Role | Slug | Notes |
|---|---|---|
| Software Engineer | `swe` | Highest volume |
| Product Manager | `pm` | Distinct keyword set, lower competition than SWE |
| Data Scientist | `ds` | High volume, distinct interview format |
| ML Engineer | `mle` | Surging post-2024; high "[firm] ML interview" volume |

**Total roles: 4 per industry x 3 industries = 12 role variants.** Pages
combine firm x role per industry only (no McKinsey SWE pages), giving:

- 10 banks x 4 banking roles = 40 firm-role pairs
- 5 consulting x 4 consulting roles = 20 firm-role pairs
- 10 tech x 4 tech roles = 40 firm-role pairs
- **Total firm-role pairs: 100**

This is the universe replicated across clusters 1, 2, and 3.

---

## Cluster 1: Resume Review (100 pages)

**Pattern:** `[role] resume for [firm]` (e.g. "investment banking analyst resume
for goldman sachs"). Embeds `<ResumeReviewWidget>` with a firm-and-role-tailored
example panel.

**Slug pattern:** `/seo-preview/resume-review/[firm-slug]-[role-slug]`
(e.g. `resume-review/goldman-sachs-ib-analyst`)

**Primary keyword per page:** `[role keyword] resume for [firm]`
**Secondary keywords:** `[firm] [role] resume tips`, `[firm] [role] resume template`,
`how to write a [firm] [role] resume`

**Wave 0 picks (12 pages live now):**
| # | Firm | Role | Slug |
|---|---|---|---|
| 1 | Goldman Sachs | IB Analyst | `goldman-sachs-ib-analyst` *(already live as hand-built mock)* |
| 2 | JPMorgan | IB Analyst | `jpmorgan-ib-analyst` |
| 3 | Morgan Stanley | IB Analyst | `morgan-stanley-ib-analyst` |
| 4 | Evercore | IB Analyst | `evercore-ib-analyst` |
| 5 | McKinsey | BA | `mckinsey-ba` |
| 6 | Bain | BA | `bain-ba` |
| 7 | BCG | BA | `bcg-ba` |
| 8 | Google | SWE | `google-swe` |
| 9 | Meta | SWE | `meta-swe` |
| 10 | Stripe | SWE | `stripe-swe` |
| 11 | Anthropic | SWE | `anthropic-swe` |
| 12 | Google | PM | `google-pm` |

All 100 firm-role pairs are valid resume-review URLs in waves 1-4.

---

## Cluster 2: Cover Letter (100 pages)

**Pattern:** `[role] cover letter for [firm]` (e.g. "business analyst cover
letter for mckinsey"). Embeds `<CoverLetterWidget>` with a firm-and-role-tailored
example panel mirroring the widget's READY ResultsLayout.

**Slug pattern:** `/seo-preview/cover-letter/[firm-slug]-[role-slug]`

**Primary keyword per page:** `[role] cover letter for [firm]`
**Secondary keywords:** `[firm] cover letter example`, `[firm] [role] cover letter`,
`how to write a cover letter for [firm]`

**Wave 0 picks (12 pages live now):**
| # | Firm | Role | Slug |
|---|---|---|---|
| 1 | McKinsey | BA | `mckinsey-ba` *(already live as hand-built mock)* |
| 2 | Bain | BA | `bain-ba` |
| 3 | BCG | BA | `bcg-ba` |
| 4 | Goldman Sachs | IB Analyst | `goldman-sachs-ib-analyst` |
| 5 | JPMorgan | IB Analyst | `jpmorgan-ib-analyst` |
| 6 | Morgan Stanley | IB Analyst | `morgan-stanley-ib-analyst` |
| 7 | Evercore | IB Analyst | `evercore-ib-analyst` |
| 8 | Lazard | IB Analyst | `lazard-ib-analyst` |
| 9 | Centerview | IB Analyst | `centerview-ib-analyst` |
| 10 | Google | PM | `google-pm` |
| 11 | Meta | PM | `meta-pm` |
| 12 | Stripe | PM | `stripe-pm` |

Cover letter intent is strongest for banking + consulting (where firms still
require letters); tech is lighter so we lead with PM where letters still matter.

---

## Cluster 3: Interview Prep (100 pages)

**Pattern:** `[firm] [role] interview prep` (e.g. "mckinsey case interview
prep", "goldman superday prep"). Embeds `<InterviewPrepWidget>` with a
firm-and-role-tailored example panel including round breakdown, case bank
preview, PEI sample, math drill, firm intel, 48-hour study plan.

**Slug pattern:** `/seo-preview/interview-prep/[firm-slug]-[role-slug]`

**Primary keyword per page:** `[firm] [role] interview questions` OR
`[firm] [role] interview prep` (whichever has higher SERP volume per cell)
**Secondary keywords:** `[firm] [interview format] prep` (e.g. `goldman superday`,
`mckinsey case`), `[firm] [role] interview tips`

**Wave 0 picks (12 pages live now):**
| # | Firm | Role | Slug |
|---|---|---|---|
| 1 | McKinsey | BA (Case) | `mckinsey-ba` *(already live as hand-built mock)* |
| 2 | Bain | BA (Case) | `bain-ba` |
| 3 | BCG | BA (Case) | `bcg-ba` |
| 4 | Goldman Sachs | IB Analyst (Superday) | `goldman-sachs-ib-analyst` |
| 5 | JPMorgan | IB Analyst | `jpmorgan-ib-analyst` |
| 6 | Morgan Stanley | IB Analyst | `morgan-stanley-ib-analyst` |
| 7 | Evercore | IB Analyst | `evercore-ib-analyst` |
| 8 | Google | SWE (LeetCode + System Design) | `google-swe` |
| 9 | Meta | SWE | `meta-swe` |
| 10 | Amazon | SWE (Leadership Principles) | `amazon-swe` |
| 11 | Stripe | SWE | `stripe-swe` |
| 12 | Google | PM | `google-pm` |

---

## Cluster 4: ATS Explainer (100 pages)

Hybrid sub-variant per `SEO_STRATEGY.md`: leads with an informational ATS
query, pivots to the `<ResumeReviewWidget>`. Higher search volume than direct
"resume review for [firm]" queries.

Split across two patterns:

### Cluster 4a: ATS-by-firm (50 pages)

**Pattern:** `[ATS name] at [firm]` (e.g. "workday at goldman sachs",
"greenhouse at anthropic"). Each page covers how that specific firm's ATS
parses resumes, the firm-specific keyword set, the firm-specific format quirks.

**Slug pattern:** `/seo-preview/ats/[firm-slug]`

**Wave 0 picks (8 pages live now):**
| # | Firm | ATS | Slug |
|---|---|---|---|
| 1 | (generic ATS guide) | n/a | `what-is-an-ats` *(already live as hand-built mock)* |
| 2 | Goldman Sachs | Workday | `goldman-sachs` |
| 3 | JPMorgan | Workday | `jpmorgan` |
| 4 | Morgan Stanley | Workday | `morgan-stanley` |
| 5 | McKinsey | Internal/Workday | `mckinsey` |
| 6 | Google | Internal | `google` |
| 7 | Anthropic | Lever | `anthropic` |
| 8 | Stripe | Greenhouse | `stripe` |

Remaining 42 firm slots fill from the Tier 1 universe in waves 1-4.

### Cluster 4b: ATS-by-role (50 pages)

**Pattern:** `ats keywords for [role] resume` (e.g. "ats keywords for software
engineer resume"). Each page covers role-specific ATS keyword sets, role-specific
common parser failures, role-specific bullet conventions.

**Slug pattern:** `/seo-preview/ats/keywords-[role-slug]`

**Wave 0 picks (6 pages live now):**
| # | Role | Slug |
|---|---|---|
| 1 | Investment Banking Analyst | `keywords-ib-analyst` |
| 2 | Sales & Trading Analyst | `keywords-st-analyst` |
| 3 | Business Analyst (Consulting) | `keywords-consulting-ba` |
| 4 | Software Engineer | `keywords-swe` |
| 5 | Product Manager | `keywords-pm` |
| 6 | Data Scientist | `keywords-ds` |

Remaining 44 role variants (more granular like "ATS keywords for new grad SWE",
"ATS keywords for TMT IB analyst", "ATS keywords for ML engineer") fill in
waves 1-4.

---

## What gets shipped now vs later

### Live in this commit (~50 pages, Wave 0)

- 4 hand-built mocks already live (Goldman IB resume, McKinsey BA cover letter,
  McKinsey case interview prep, generic ATS guide)
- ~46 more pages generated from the 4 cluster templates + data rows seeded
  to the Wave 0 picks above

### Stays in code for Waves 1-4 (~350 pages)

- Templates remain identical
- Adding more pages = adding more rows to the cluster data files
- The dynamic route already serves any seeded slug
- Sitemap generator only emits slugs marked `published: true`, so unfinished
  rows can sit in the data file with `published: false` and never get crawled

This is the staggered-publish mechanism. Pages exist in code (the registry,
the templates, even the data rows) but Google sees them only when the row
flips to `published: true`.

---

## Per-cell data needed for each row

Every row in the data file carries the per-cell facts that defend against
doorway-page flagging (per `ranking-playbook.md`):

```ts
{
  slug: 'goldman-sachs-ib-analyst',
  firm: { name: 'Goldman Sachs', shortName: 'Goldman', ats: 'Workday' },
  role: { name: 'Investment Banking Analyst', shortName: 'IB Analyst' },
  cluster: 'resume-review',
  primaryKeyword: 'goldman sachs ib analyst resume',
  metaDescription: '...',  // <=160 chars
  quickAnswer: '...',      // 40-60 words for AEO citation
  statStrip: [...],        // 3 firm-specific stats with sources
  uniqueDataBlock: [...],  // 6-8 firm/role-specific "what we check" facts
  examplePanel: { ... },   // firm/role-tailored example data
  faq: [...],              // 6-8 firm/role-specific Q&A
  publishedAt: '2026-05-26',
  published: true,
}
```

The 4 templates read this row and render the page. No two rows share more
than ~60% of body content because the per-cell content (quickAnswer,
statStrip, uniqueDataBlock, examplePanel, faq) is firm-and-role-specific.

---

## Refresh cadence (per `ranking-playbook.md`)

Every published row gets a quarterly refresh: rewrite the Quick-Answer block,
bump one fact in the unique-data block, refresh one FAQ, bump the `publishedAt`
and the visible "Updated" byline. The article skill audit script flags rows
that have gone >90 days since refresh.
