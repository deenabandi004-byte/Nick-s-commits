# Offerloop Programmatic SEO: Gated Execution Log

The live record of the gated programmatic-SEO build. Strategy and constraints
are fixed elsewhere; this file tracks state and decisions. No em dashes.

## Core principle

The target is not a page count. It is the largest footprint of pages Google
keeps and that convert. Page count is an output of two gates: a per-page value
gate (is this cell worth building) and a domain authority ceiling (can the site
absorb more indexable pages now). Build only cells that clear the gate. Stagger.
Real per-cell data, never LLM output presented as fact.

## State as of 2026-06-15

- find-people pipeline built: scoring gate, PDL count fetcher, aggregate-only
  enrichment, data-first generator (`backend/scripts/seo/`).
- 100-cell find-people pilot generated, all `published:false` (noindex, out of
  the sitemap). Data-density standard locked: ~44% unique token share with
  strong per-cell variance (role-title overlap 0.05, prior-employer overlap
  0.01, function-mix overlap 0.29 across the 100).
- Old-page prune executed: 1,241 dead template pages (zero clicks, GSC last 90
  days) served 410 Gone and removed from the sitemap (1,494 to 253 URLs). The
  242 earners carrying all ~947 clicks were untouched.
- Pending: GSC validate-fix on 33 transient 5xx (April 14 to 17 outage, no code
  needed). First-batch flip of 10 to 15 pilot cells, awaiting approval, then a 2
  to 3 week index watch.

## WAVE 2 CANDIDATE: quant / hedge fund / PE / VC find-people

Recorded 2026-06-15. Do not build yet. Gated on the pilot watch result.

The kept `/compare` earners (real clicks, our own GSC traffic) cluster hard in a
vertical the find-people matrix does not cover. The original firm set was
banking, consulting, and big tech. The measured demand says quant funds, hedge
funds, PE, and VC are a real gap:

- Citadel, Two Sigma, Jane Street, Millennium, Point72, DE Shaw, Renaissance
  (quant and hedge funds)
- Vista, Thoma Bravo, Apollo, Blackstone, KKR, Carlyle, Bain Capital, TPG (PE)
- Sequoia, a16z, Kleiner Perkins, Tiger Global, Coatue, General Atlantic, Insight
  (VC)

Top single signals: `citadel-vs-two-sigma` 43 clicks, `openai-vs-anthropic` 39,
`jane-street-vs-two-sigma` 26, `pwc-vs-kpmg` 25, `citadel-vs-millennium` 23.

This contradicts part of the original firm-selection bet and is the
highest-confidence Wave 2 if the pilot holds. If the first batch holds in the
index for 2 to 3 weeks, build a quant/HF/PE/VC firm set for find-people, same
gated, aggregate-only, data-dense method. If it does not hold, we are glad we
did not build 200 more pages on an unproven method.

## Data source

The find-people pages no longer name any third-party data provider in their
copy; counts and role breakdowns read as live professional-profile data.

Going forward, new cells must NOT be created using People Data Labs tokens. The
existing 100 cells used already-paid, cached data and regenerate for free. Any
new vertical (the Wave 2 quant/HF/PE/VC set) needs an alternate data source
chosen and approved before build.

## Holds

- All rebuilds held. Do not rebuild the `/compare` earners. Do not build the
  quant vertical. Everything past the pilot is gated on the watch result.
- Nothing indexed without explicit approval.
