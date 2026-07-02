# Find Page: RocketReach-Style Search Shell (Phase 1)

**Date:** 2026-07-02
**Status:** Draft — awaiting Nick's review
**Scope:** Phase 1 of the Find redesign: layout shell (filter rail), scope control, empty-state prompt templates, applied-filter chips. Phases 4–5 from the chat plan (results-row overhaul, company→people pivot) are separate specs.

## Goal

Make `/find` read like RocketReach's search page — persistent left filter rail, clear scope control, prompt templates — while keeping Offerloop's styling (navy/brand blue, Inter/Lora, mountains hero) and keeping the AI prompt bar as the primary input. RocketReach's clarity comes from *structure*, not their visual design; we adopt the structure only.

## What we're NOT doing (non-goals)

- No new search backend. `/api/prompt-search` stays the single People-search flow; we extend it with optional overrides, we don't replace it.
- No changes to Companies or Hiring Managers tab *content* in this phase. They render unchanged inside the new shell.
- No visual redesign of results cards (that's the phase-4 results-row spec).
- No RocketReach-style "Get Contact Info" reveal mechanic — our credit model charges per contact found, not per reveal.

## Current state (what exists today)

- `FindPage.tsx` renders a 200px left **toggle rail** (People / Companies / Hiring Managers vertical pills, commit 84a465f) + embedded tab content (`ContactSearchPage`, `FirmSearchPage`, `RecruiterSpreadsheetPage`).
- People search is **prompt-only**: textarea → `POST /api/prompt-search` → `parse_search_prompt_structured()` (OpenAI) → structured `{companies, locations, schools, industries, title_variations}` → PDL search → results. `parsed_query` is returned to the client but only surfaced in error paths.
- The backend **already excludes saved contacts** from results via `_build_exclusion_data_from_firestore` → `seen_contact_set` (runs.py:176). Today's behavior IS RocketReach's "Net New" — it's just invisible to the user.
- Recent prompts live in localStorage (`ofl_recent_prompts`); Firestore has a `searchHistory` subcollection.
- Suggestion chips + rotating placeholder hints already exist on the empty state.

## Design

### 1. Layout shell (`FindPage.tsx`)

The left rail widens (200px → 248px) and becomes a **filter rail**, top to bottom:

```
┌─────────────────────────┐
│ [People|Companies|HMs]  │  ← segmented pill toggle (moves up from vertical list)
├─────────────────────────┤
│ [All] [Net New] [Saved] │  ← scope control (People tab only, see §2)
├─────────────────────────┤
│ Search Filters  Clear   │  ← header + Clear All (only when filters active)
│ [chip] [chip] [chip]    │  ← applied filters as removable chips
├─────────────────────────┤
│ ▸ Job Title             │  ← accordion groups, collapsed by default,
│ ▸ Company               │    populated from parsed_query after a search
│ ▸ Location              │    or set manually before one
│ ▸ School                │
│ ▸ Industry              │
├─────────────────────────┤
│ (sticky bottom)         │
│ [Recent Searches ▾]     │  ← existing localStorage recents, relocated here
└─────────────────────────┘
```

- The three-tab pill toggle keeps all current tabs. On **Companies** and **Hiring Managers** the rail shows only the toggle (their filters arrive in later phases) — same as today's behavior, so nothing regresses.
- Rail is sticky (`position: sticky; top: 8`) like the current toggle. On mobile (`sm` breakpoint) it collapses to the existing horizontal pill row; filter groups fold into a "Filters" sheet button.
- Mountains hero, `PageTitle`, TrialBanner all stay exactly where they are.

### 2. Scope control (People tab)

Segmented control: **All Results / Net New / My Contacts**. Default: **Net New**.

- **Net New** = today's exact behavior (server excludes saved contacts). Zero backend change; we're labeling what already happens.
- **All Results** = Net New results + saved contacts matching the query, merged client-side from the My Contacts cache (React Query already holds it), badged "Saved" and never re-charged. No PDL/credits impact.
- **My Contacts** = pure client-side filter of saved contacts against the query terms. No API call, no credits. Links to `/my-network/people` for the full spreadsheet.
- Copy under the control (one line, muted): "Net New hides people already in My Contacts."

New optional request field: `scope: "all" | "net_new"` on `/api/prompt-search` — `all` skips the exclusion set server-side **only if** the client-side merge proves insufficient. Ship phase 1 with the client-side merge; add the param only if users report missing results. (YAGNI guard.)

### 3. Filter rail ⇄ prompt sync

The rail is a **visible mirror of the parsed query**, not a second search engine:

- After every search, populate the accordion groups from `parsed_query` (companies, locations, schools, industries, title_variations → shown as chips inside each group and in the Search Filters chip row).
- Removing a chip or editing a group **re-runs the search** with a `filters` override object: `POST /api/prompt-search { prompt, filters: { companies?, locations?, schools?, industries?, titles? } }`.
- Backend: after `parse_search_prompt_structured()`, shallow-merge `filters` over the parsed result (explicit user values win). ~15 lines in `runs.py`, no new endpoint. Validation: each list capped (5 items), strings ≤100 chars, unknown keys dropped.
- Setting filters *before* any prompt: allowed. If prompt is empty but ≥1 filter set, client synthesizes a prompt ("People at {company} in {location}") so the endpoint contract (prompt required, ≥3 chars) is untouched.
- Each group input is a free-text tag input; Company and School get the existing autocomplete data sources (`src/data/companies`, `universities`).

### 4. Empty state: prompt templates

Below the prompt bar (replacing the current rotating-hint row), RocketReach-style fill-in-the-blank templates, recruiting-flavored:

- "I'm looking for **[job title]** at **[company]**"
- "**[School]** alumni working in **[industry]**"
- "Recruiters hiring **[job title]** interns in **[location]**"

Clicking a blank chip focuses it inline; filled template → composes the prompt and fires the search. Categories (General / Consulting / Banking / Tech) as small tabs on the left of the template list, mirroring RR's General/Sales/Marketing — each category swaps in 3 templates with pre-seeded firm examples (MBB for consulting, GS/JPM for banking). Templates live in a static data file (`src/data/searchTemplates.ts`).

Existing suggestion chips row is removed (superseded); the rotating placeholder inside the prompt bar stays.

### 5. Post-search prompt placement

After a search, the big hero prompt bar collapses to a compact single-line "Keyword Search" bar pinned above the results (RR pattern), so the rail + results own the viewport. "New Search" affordance resets to hero state. This is CSS/state work inside `ContactSearchPage` — the search flow itself is untouched.

## Component plan

| Piece | Where | New/Change |
|---|---|---|
| `FindFilterRail.tsx` | `src/components/find/` | New — rail shell: toggle, scope, chip row, accordion groups, recents |
| `FilterGroup.tsx` | `src/components/find/` | New — accordion + tag input + autocomplete |
| `searchTemplates.ts` | `src/data/` | New — template definitions |
| `PromptTemplates.tsx` | `src/components/find/` | New — fill-in-the-blank empty state |
| `FindPage.tsx` | pages | Change — replace toggle rail with `FindFilterRail`, lift filter/scope state here, pass down to `ContactSearchPage` |
| `ContactSearchPage.tsx` | pages | Change — accept `filters`/`scope` props, sync `parsed_query` up, compact-bar mode, remove old suggestion chips |
| `runs.py /prompt-search` | backend | Change — optional `filters` override merge + validation |

State lives in `FindPage` (single owner), passed to `ContactSearchPage` via props; `ContactSearchPage` reports `parsed_query` back via callback. No new context/store.

## Edge cases

- **Parse failure / low confidence**: rail keeps the user's manual filters; error copy unchanged. If manual filters exist, offer "Search with filters only" (synthesized prompt path).
- **Filter-only search with 0 results**: existing 0-result Scout flow fires unchanged (it already receives `parsed_query`).
- **Tier limits**: filters don't bypass anything — same endpoint, same credit checks, same batch clamps.
- **Hiring Managers / Companies tabs**: scope control and filter groups hidden; only the pill toggle renders. No layout jump: rail width constant across tabs.
- **Mobile**: rail → horizontal pills + "Filters" button opening a Sheet (shadcn) with the same groups.

## Testing

- Backend (pytest): `filters` override merge — override wins over parse, caps enforced, unknown keys dropped, empty filters = current behavior byte-for-byte.
- Frontend: no test framework (per repo norm) — manual QA checklist: each scope mode, chip remove re-runs search, template fill → search, mobile sheet, Companies/HM tabs unchanged, tour anchors (`tour-find-*`) still resolve.

## Rollout

Single PR to `main` via upstream (prod deploy flow). No flag needed — `/find` UI-only plus one additive backend param. The old vertical toggle disappears in the same PR (no dead code kept; git history is the fallback).

## Open questions for Nick

1. Scope control naming: "My Contacts" as third segment vs. linking out to the My Contacts page — keep segment (current spec) or drop to two segments?
2. Template categories: General / Consulting / Banking / Tech — right four?
3. Should "Save This Search" (pin to Firestore `searchHistory`) ship in phase 1, or is the relocated Recent Searches dropdown enough? Spec currently ships recents only.
