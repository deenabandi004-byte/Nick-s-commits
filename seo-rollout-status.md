# SEO Rollout Status

Canonical inventory and live status tracker for the SEO overhaul. Plan: `seo-examples/SEO_ROLLOUT_PLAN.md`.
Last updated: 2026-05-20.

## Phase 1a.1 - Page surface inventory

Every programmatic route, its data source, and its sitemap footprint.

| Template | Route | Data file | Data rows | Sitemap URLs | Disposition |
|---|---|---|---|---|---|
| Meeting | `/meeting/:slug` | `companies.ts` | 500 | 499 | KEEP + scale. The one proven winner (2.5-8% CTR). |
| Networking | `/networking/:slug` | `companies.ts` | 500 | 499 | PRUNE. Rebuilt as product-led firm pages in Phase 2. |
| Alumni | `/alumni/:slug` | `seo-universities.ts` | 196 | 192 | PRUNE. Rebuilt as find-alumni in Phase 2. |
| Cold email (industry) | `/cold-email/:slug` | `industries.ts` | 60 | 59 | KEEP. Industry-level; the new firm-level cold-email format is additive, not a replacement. |
| Role networking | `/networking-for/:slug` | `roles.ts` | 80 | 79 | KILL. No replacement. |
| Comparison | `/compare/:comparison` | `comparisons.ts` | 150 | 146 | TRIAGE. Noindex losers after per-URL GSC export; keep proven winners. |
| Blog | `/blog/:slug` | markdown files | ~18 | 9 | KEEP. |
| Static / misc | various | n/a | n/a | ~10 | KEEP (`/`, `/pricing`, `/about`, `/glossary`, etc.). |

**Sitemap total: 1,494 URLs. Google-indexed (GSC): 772. Indexation rate: ~52%.**

Not a discrepancy. 1,494 is what we submitted; 772 is what Google chose to index. The ~52%
rate is the quality signal: Google is already declining to index half the surface. The prune
removes the weakest pages so the survivors index and rank better.

## Phase 1a.2 - Per-URL GSC export  [BLOCKING, USER ACTION]

**Status: NOT DONE. Required before Stage 1 noindex of `/compare/*`.**

Action: in Google Search Console, Performance report, last 90 days, group by Page, export a
CSV covering `/compare/*`, `/networking/*`, `/alumni/*`. Drop it in the repo or paste the
data. This lets us noindex the actual losers and keep any genuine winners, instead of killing
220 compare pages (45K impressions) on aggregate CTR alone.

`/networking-for/*` does not need the export. 79 near-zero pages, killed wholesale.

## Phase 1a.3 - Stage 1 noindex watch list

**Status: NOT EXECUTED.** Populated when Stage 1 runs.

| Template | Pages to noindex | Noindex date | Day-14 eligible | Stage 2 action |
|---|---|---|---|---|
| `/networking-for/*` | 79 (all) | pending | pending | 410 Gone |
| `/compare/*` | losers only (count pending GSC export) | pending | pending | 410 Gone |
| `/alumni/*` | 192 (all) | pending | pending | 301 to find-alumni successors |
| `/networking/*` | 499 (all) | pending | pending | 301 to firm-page successors |

Stage 1 noindexes and removes from sitemap (pages stay live, no 404s). Stage 2, after the
14-day window and GSC traffic confirmation, redirects or removes. Replaced templates get 301
to their new-format equivalents; killed templates get 410.

## Open items

- [ ] USER: export per-URL GSC CSV (Phase 1a.2). Blocks Stage 1.
- [ ] Stage 1 noindex commit (Phase 1a.3). Not started.
- [ ] Stage 2 redirect/remove script, staged not run (Phase 1a.4). Not built.
- [ ] Phase 1b conversion tracking. Not started.
- [ ] Phase 1c registry + sitemap generator + production templates. Not started.

## Notes

- 7 product-led page formats are built and live for review at `/seo-preview/*` (noindex).
- 3 skills (`offerloop-seo-keywords`, `offerloop-seo-article`, `offerloop-seo-strategy`) are
  the operating system. The plan defers to the skills on any conflict.
- Backend has a working Perplexity client (`backend/app/services/perplexity_client.py`); the
  Phase 2a data layer uses it, there is no Perplexity MCP.
