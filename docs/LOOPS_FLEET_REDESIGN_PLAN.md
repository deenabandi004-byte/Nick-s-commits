# Loops Fleet — Variation D Redesign

Implementation plan for the "proof-forward" Loops fleet redesign (Variation D from the
Claude Design handoff: `loops/project/Loops Setup - Redesign.html`).

## Design goals (from the chat transcript)

The user wanted the fleet screen to **pull people toward creating Loops** by leading
with proof that the existing Loops are working — not with a streak counter, and not
with an inline composer (the dedicated `/agent/setup` page owns that flow).

Variation D ships:

1. **Header** — "Your *Loops.*" serif title + `5 of 50` cap counter + dark
   "Start another Loop" button (routes to `/agent/setup`).
2. **Command bar** — a single card with three proof-tiles (found-this-week
   + sparkline · drafts waiting · weekly-goal ring) and a live activity ticker
   along the bottom. Single visual element, no stacked widgets.
3. **Refined Loop cards** — Instrument-Serif title, status pill, found-of-target
   progress bar, optional credit bar, a "Just found" line for the running Loop,
   hint + CTA arrow in the footer.
4. **New-Loop tile** — dashed-border tile with the primary "Start another Loop"
   CTA plus two one-tap quickstart chips that open `/agent/setup` pre-seeded
   with a brief.
5. **No inline composer.** The fleet view never embeds the composer — the start
   action always routes to the dedicated setup page.

## How the weekly goal works across Loops

This is the question the user flagged: how do we show "21/30 weekly goal" when
the user has 4 different Loops?

**Decision**: the fleet weekly goal is the **sum of every active Loop's
`weeklyTarget`**, surfaced as the ring's denominator. The numerator
(`foundThisWeek`) is the count of contacts the agent has surfaced *across all
Loops* in the current ISO week.

This gives us a meaningful single number without making the user invent a
fleet-level goal — it's just "the Loops you've already set up, added together."
Users can already tune per-Loop targets in the LoopDetailPage, so they can
nudge the fleet goal up or down indirectly.

If we later want a user-settable override (e.g. the user only wants to track
one of three Loops), we can add `users/{uid}.weeklyGoal` and prefer that when
present. Out of scope for this pass.

## Backend changes

### `GET /api/agent/loops/weekly-summary` (new)

Fleet-wide aggregate that powers the command bar.

```jsonc
{
  "foundThisWeek": 47,           // sum of contacts across all loops, ISO week
  "weeklySparkline": [12,19,23,28,31,39,47],  // last 7 days
  "draftsWaiting": 16,           // sum of pendingDrafts across all loops
  "weeklyGoal": 30,              // sum of weeklyTarget for non-archived loops
  "weeklyProgressPct": 70,       // min(100, round(foundThisWeek/weeklyGoal*100))
  "activeLoopsCount": 4
}
```

Implementation: `backend/app/services/loop_weekly_summary.py` —
queries `users/{uid}/agent_actions` once (status=completed, createdAt>=week_start),
buckets by day, sums result rows. Reads loop docs for `weeklyTarget` + `pendingDrafts`.

### `GET /api/agent/loops/feed` (new)

Fleet-wide activity ticker source. Returns the most recent 20 finds across
every Loop. The CommandBar rotates through them client-side.

```jsonc
{
  "items": [
    { "kind": "found", "who": "Priya Raman",
      "role": "Eng Recruiter · Linear", "when": "2m", "loopId": "abc",
      "createdAt": "2026-06-02T03:14:00Z" },
    ...
  ]
}
```

### `GET /api/agent/loops/suggested` (new)

Two-to-four quickstart templates the user can one-tap to launch a Loop from
the New-Loop tile. Each template carries a pre-seeded brief that
`/agent/setup` reads via a query param (`?seed=template-id`).

```jsonc
{
  "items": [
    {
      "id": "ai-analysts-banks",
      "title": "AI analysts at Goldman, JPMorgan & Morgan Stanley",
      "tag": "Finance",
      "brief": "I'm a USC junior recruiting for AI/quant analyst roles...",
      "loopMode": "people"
    }
  ]
}
```

Templates are static for v1 (curated from the user's school/industry on the
profile), so the endpoint is a simple lookup against
`backend/app/services/loop_templates.py`.

### Existing routes that already cover us

- `GET  /api/agent/loops` — fleet list (unchanged).
- `POST /api/agent/loops` — Loop creation (unchanged).
- Per-Loop pause/resume/run-now (unchanged).

## Frontend changes

| File | Change |
|---|---|
| `services/loops.ts` | Add `getFleetWeeklySummary`, `getFleetFeed`, `getSuggestedLoops` + types. |
| `hooks/useLoops.ts` | Add `useFleetWeeklySummary` (15s poll), `useFleetFeed` (30s poll), `useSuggestedLoops` (60s cache). |
| `components/loop/LoopsCommandBar.tsx` | **New.** Mirrors Variation D's `CommandBarD`. |
| `components/loop/LoopCard.tsx` | Serif title, "Just found {recent}" line for running Loops, hover lift, arrow CTA. Keep existing budget bar + pause-reason chip. |
| `components/loop/NewLoopTile.tsx` | Add 2 quickstart chips that route to `/agent/setup?seed={id}`. |
| `components/loop/LoopGrid.tsx` | Insert `<LoopsCommandBar />` above the grid. |
| `pages/LoopsPage.tsx` | Drop the inline composer (`setComposing` state). "Start another Loop" routes to `/agent/setup`. |

## Out of scope for this pass

- User-settable `weeklyGoal` override.
- Server-side rendering of the activity ticker (client rotates a snapshot).
- `/agent/setup` reading `?seed=` query param to pre-fill the brief — separate
  PR; for now quickstart chips will land on `/agent/setup` with the brief string
  passed via `location.state`.
