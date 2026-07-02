# Find Page: RocketReach-Style Search Shell (Phase 1)

**Date:** 2026-07-02
**Status:** Draft — awaiting Nick's review
**Scope:** Phase 1 of the Find redesign: layout/organization only — filter rail that mirrors each tab's real query dimensions, applied-filter chips, starter prompts. Search *behavior* is untouched. Phases 4–5 from the chat plan (results-row overhaul, company→people pivot) are separate specs.

## Goal

Reorganize `/find` with RocketReach's *structure* — persistent left filter rail, visible applied filters, starter prompts — while keeping Offerloop's styling (navy/brand blue, Inter/Lora, mountains hero) AND keeping today's search behavior exactly as-is. This is a layout change, not a search change.

## Behavior we keep EXACTLY as-is (Nick, 2026-07-02)

This list is the contract. If a change here isn't purely cosmetic/positional, it's out of scope:

- **Silent dedupe stays silent.** Search already hides people the user has saved and surfaces only new people. No scope toggle, no "Net New" label, no user-facing switch. (Earlier draft's scope control: deleted.)
- **The full find→draft flow**: search finds people, finds their emails automatically, contacts populate with the panel on the right, user clicks **Draft** and emails are drafted. Untouched.
- **Post-draft links** ("view in your Inbox", "View in Spreadsheet") stay — copy only updates to match the new sidebar naming (My Network → My Contacts / My Companies; e.g. "View in Contacts", "View in Companies"). No behavior change.
- **The search bar slides up after a search and results populate underneath.** That interaction stays. (Earlier draft's RocketReach-style compact "Keyword Search" bar: deleted.)
- **Batch size selector stays right next to the search bar** in both states, on both People and Companies tabs. We pay per PDL/Perplexity call — RocketReach owns its database, we don't — so contacts-per-search is a cost control the user sees before searching.
- Credits, tier caps, 0-result Scout flow, email templates: untouched.

## What we're NOT doing (non-goals)

- No new search backend. `/api/prompt-search` (People) and firm search (Companies) stay the search flows; we extend each with an optional filter-override field, nothing more.
- No changes to Hiring Managers tab content in this phase; it renders unchanged inside the new shell (toggle only, no filter groups).
- No visual redesign of results cards (that's the phase-4 results-row spec).
- No RocketReach-style "Get Contact Info" reveal mechanic — our credit model charges per contact found, not per reveal.
- No "Save This Search" / saved-search pinning. Every contact a search finds is auto-saved into My Contacts, so a saved-search library solves a problem we don't have. This is a deliberate divergence from RocketReach.
- No relocating recent searches. Wherever recents exist today (Companies has a recent-searches list; People feeds recents to Scout), they stay put. The rail doesn't grow a recents section.

## Current state (what exists today)

- `FindPage.tsx` renders a 200px left **toggle rail** (People / Companies / Hiring Managers vertical pills, commit 84a465f) + embedded tab content (`ContactSearchPage`, `FirmSearchPage`, `RecruiterSpreadsheetPage`).
- **People search** is prompt-only: textarea → `POST /api/prompt-search` → `parse_search_prompt_structured()` (OpenAI) → structured `{companies, locations, schools, industries, title_variations}` → PDL search → results. `parsed_query` is returned to the client but only surfaced in error paths.
- **Companies search** is also prompt-only: `searchFirmsAsync(query, batchSize)` → `parse_firm_search_prompt()` → structured `{industry, location, size (small|mid|large), keywords}` → Perplexity discovery. `parsedFilters` is already returned in the response and already saved to Firestore search history (`save_search_to_history`).
- The backend **already excludes saved contacts** from People results via `_build_exclusion_data_from_firestore` → `seen_contact_set` (runs.py:176) — and per Nick this stays silent and unchanged.
- Suggestion chips + rotating placeholder hints already exist on both empty states.

## Design

### 1. Layout shell (`FindPage.tsx`)

The left rail widens (200px → 248px) and becomes a **filter rail**, top to bottom:

```
┌─────────────────────────┐          People tab groups   Companies tab groups
│ [People|Companies|HMs]  │          ▸ Job Title         ▸ Industry
├─────────────────────────┤          ▸ Company           ▸ Location
│ Search Filters  Clear   │          ▸ Location          ▸ Size (S/M/L)
│ [chip] [chip] [chip]    │          ▸ School            ▸ Focus / Keywords
├─────────────────────────┤          ▸ Industry
│ ▸ (per-tab groups)      │
└─────────────────────────┘
```

- Top: segmented pill toggle keeping all three current tabs. Below: "Search Filters" header with Clear All + removable applied-filter chips, then accordion filter groups.
- **The groups mirror each tab's real query dimensions, nothing invented.** People search parses prompts into `{title_variations, companies, locations, schools, industries}` — those are the five People groups. Companies search parses into `{industry, location, size, keywords}` — those are the four Companies groups (Size renders as Small/Mid/Large chips, matching the parser's enum). Hiring Managers gets no filter groups in phase 1 — toggle only.
- Rail is sticky (`position: sticky; top: 8`) like the current toggle. On mobile (`sm` breakpoint) it collapses to the existing horizontal pill row; filter groups fold into a "Filters" sheet button.
- Mountains hero, `PageTitle`, TrialBanner, and the search-bar-slides-up-then-results-populate interaction all stay exactly where and how they are.

### 2. Filter rail ⇄ prompt sync

The rail is a **visible mirror of the parsed query**, not a second search engine:

- After every search, populate the accordion groups from what the backend already returns — `parsed_query` (People) / `parsedFilters` (Companies) — shown as chips inside each group and in the Search Filters chip row.
- Removing a chip or editing a group **re-runs the search** with a `filters` override object:
  - People: `POST /api/prompt-search { prompt, filters: { companies?, locations?, schools?, industries?, titles? } }`
  - Companies: same additive pattern on the firm-search request: `{ query, batchSize, filters: { industry?, location?, size?, keywords? } }`
- Backend: after each parser runs, shallow-merge `filters` over the parsed result (explicit user values win). ~15 lines in `runs.py`, ~15 in `firm_search.py`; no new endpoints. Validation: lists capped (5 items), strings ≤100 chars, `size` restricted to the parser enum, unknown keys dropped.
- Setting filters *before* any prompt: allowed. If prompt is empty but ≥1 filter set, client synthesizes a prompt ("People at {company} in {location}" / "{size} {industry} companies in {location}") so both endpoint contracts stay untouched.
- Each group input is a free-text tag input; Company and School get the existing autocomplete data sources (`src/data/companies`, `universities`).

### 3. Empty state: fill-in-the-blank starter prompts

We already have suggestion chips + rotating hints; this upgrades them to RocketReach-style fill-in-the-blank templates, recruiting-flavored:

- "I'm looking for **[job title]** at **[company]**"
- "**[School]** alumni working in **[industry]**"
- "Recruiters hiring **[job title]** interns in **[location]**"

Clicking a blank chip focuses it inline; filled template → composes the prompt and fires the search (same endpoints, nothing new). Categories (General / Consulting / Banking / Tech) as small tabs beside the template list — each swaps in 3 templates with pre-seeded firm examples (MBB for consulting, GS/JPM for banking). Templates live in `src/data/searchTemplates.ts`. Companies tab gets its own template set ("**[size]** **[industry]** firms in **[location]**").

Old suggestion-chip row is superseded by this; the rotating placeholder inside the prompt bar stays.

### 4. Copy renames (My Network → My Contacts / My Companies)

Post-search links and toasts that say "Network" or "Spreadsheet" update to the new nouns: "View in Spreadsheet" → "View in Contacts" (People results) / "View in Companies" (Companies results); toast "…view in your Inbox" unchanged. Pure copy; the links keep pointing where they point today (`/my-network/people`, `/my-network/companies`, `/outbox`).

## Component plan

| Piece | Where | New/Change |
|---|---|---|
| `FindFilterRail.tsx` | `src/components/find/` | New — rail shell: toggle, chip row, per-tab accordion groups |
| `FilterGroup.tsx` | `src/components/find/` | New — accordion + tag input + autocomplete |
| `searchTemplates.ts` | `src/data/` | New — template definitions (People + Companies sets) |
| `PromptTemplates.tsx` | `src/components/find/` | New — fill-in-the-blank empty state |
| `FindPage.tsx` | pages | Change — replace toggle rail with `FindFilterRail`, lift filter state here, pass down to both search pages |
| `ContactSearchPage.tsx` | pages | Change — accept `filters` prop, report `parsed_query` up, swap suggestion chips for templates, copy renames |
| `FirmSearchPage.tsx` | pages | Change — accept `filters` prop, report `parsedFilters` up, template row, copy renames |
| `runs.py /prompt-search` | backend | Change — optional `filters` override merge + validation |
| `firm_search.py` | backend | Change — same optional `filters` override merge + validation |

State lives in `FindPage` (single owner), passed down via props; each search page reports its parsed filters back via callback. No new context/store.

## Edge cases

- **Parse failure / low confidence**: rail keeps the user's manual filters; error copy unchanged. If manual filters exist, offer "Search with filters only" (synthesized prompt path).
- **Filter-only search with 0 results**: existing 0-result Scout flow fires unchanged (it already receives `parsed_query`).
- **Tier limits**: filters don't bypass anything — same endpoints, same credit checks, same batch clamps (People 3/8/15, Companies 10/25/50).
- **Hiring Managers tab**: no filter groups; only the pill toggle renders. No layout jump: rail width constant across tabs.
- **Mobile**: rail → horizontal pills + "Filters" button opening a Sheet (shadcn) with the same groups.

## Testing

- Backend (pytest): `filters` override merge on both routes — override wins over parse, caps enforced, unknown keys dropped, `size` enum enforced, empty/absent filters = current behavior byte-for-byte.
- Frontend: no test framework (per repo norm) — manual QA checklist: find→draft flow end-to-end unchanged, dedupe still silent, chip remove re-runs search, template fill → search, batch size next to bar on both tabs, mobile sheet, HM tab unchanged, tour anchors (`tour-find-*`) still resolve.

## Rollout

Single PR to `main` via upstream (prod deploy flow). No flag needed — `/find` layout-only plus one additive backend param per route. The old vertical toggle disappears in the same PR (no dead code kept; git history is the fallback).

## Decisions log (Nick, 2026-07-02)

- No scope toggle — silent dedupe stays silent; search behavior is untouchable (see contract section).
- No "Save This Search" — auto-save to My Contacts makes it redundant.
- Batch size stays right next to the search bar (metered API calls, unlike RocketReach's owned database).
- Search bar keeps the slide-up-then-results behavior; no compact-bar mode.
- Filter panel approved, but it must mirror each tab's actual parser output (People: 5 dims; Companies: 4 dims).
- Recents: leave wherever they already exist; no rail section. (Claude's call, per "you decide".)
- Template categories General / Consulting / Banking / Tech. (Claude's call — flag at review if wrong.)
