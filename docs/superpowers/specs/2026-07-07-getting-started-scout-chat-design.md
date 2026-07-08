# Getting Started = Scout Chat (one shared conversation)

**Date:** 2026-07-07
**Status:** Approved approach — Option 1 (one shared chat instance, two views)

## Goal

Replace the Getting Started page (`/dashboard`) content with a single centered
Scout chat box (Lovable-style landing). The conversation that happens there is
the *same* conversation as the Ask Scout side panel — one chat, two views.
Same functionality in both: streaming replies, approve cards, CTA chips, plan
checklists, tool pills, suggestion chips.

## What changes for the user

- **Getting Started, empty state:** watercolor backdrop stays; the "Help me
  find" launcher, People/Companies dropdown, the two "Other ways to get
  started" cards, and Recent activity are all removed. In their place: a short
  serif heading and one big prompt box with a few suggestion chips — the same
  prompt-box styling already used on the page (white box, circular send
  button).
- **Getting Started, after first send:** the page becomes a full-height Scout
  chat — thread in the middle column, composer pinned at the bottom.
- **Side panel everywhere else:** unchanged behavior, but it now displays the
  same live conversation. Type on the page, open the panel on another screen,
  and the thread is there (and vice versa).
- **On `/dashboard`:** the Ask Scout header button and Cmd+K focus the page's
  composer instead of sliding the panel open over an identical chat.
  Navigating to `/dashboard` while the panel is open closes the panel — the
  page *is* the chat there.

## Architecture

### 1. Shared chat state: `ScoutChatProvider`

New provider component (new file, e.g. `src/contexts/ScoutChatContext.tsx`)
mounted inside the existing `ScoutProvider` in `App.tsx` (already inside
`BrowserRouter`, so router hooks work). It owns the single `useScoutChat()`
instance and everything that must run exactly once regardless of how many
views are mounted:

- The `useScoutChat(scoutCurrentPage)` call. Page context (`pathname` +
  `tab` param) is derived from `useLocation` inside the provider — same logic
  ScoutSidePanel uses today.
- `resolvedIds` state, `runNavigate`, and the **navigate auto-execute
  effect** (in-place populate / skip-approve + undo toast). Living in the
  provider guarantees a navigate fires once even with both views mounted.
- The **post-search celebration listener** (`SCOUT_SEARCH_COMPLETED_EVENT` →
  `appendSyntheticAssistant`). Also singleton for the same reason.
- Handlers shared by both views: `handleApprove`, `handleCtaAction`,
  `handlePlanStep` (CTA/plan handlers take an optional "close panel" concern —
  the panel passes its `closePanel`, the page passes a no-op).
- The `pendingMessage` auto-send effect moves here too (fires when either
  surface is the active one), so `openPanelWithMessage` keeps working from
  briefing chips.

Exposes all of the above plus the `useScoutChat` return surface via a
`useScoutChatShared()` hook. `ScoutSidePanel` and `DashboardPage` both consume
it; neither calls `useScoutChat` directly anymore.

### 2. Shared UI: `ScoutChatThread`

New component (e.g. `src/components/scout/ScoutChatThread.tsx`) extracted from
`ScoutSidePanel`'s chat-mode JSX:

- Message list: user/assistant bubbles, `formatMessage` rendering, mode
  receipts, tool-event pills, approve cards (`ScoutApproveCard`), CTA chips,
  plan checklist, briefing content (coverage / active strategy pieces that
  render inline in the thread), streaming/loading states.
- Composer: input + send button, Enter-to-send, disabled-while-loading.
- Empty state: greeting + suggestion chips (chip click sends the message).
- `variant: 'panel' | 'page'` prop for layout differences only (max-width,
  paddings, empty-state scale — the page variant gets the big Lovable-style
  centered box and larger heading; the panel keeps its current compact look).

### 3. `ScoutSidePanel` keeps its chrome

Stays the owner of: slide-in panel + overlay + Esc-to-close, the persisted
chat-history sidebar (history stays panel-only), search-help mode (legacy
failed-search recovery), the tried-and-failed hint, and the tour's seeded
Scout demo. Its chat area becomes `<ScoutChatThread variant="panel" />`.

Panel-closing rule: an effect (in `App.tsx` or the panel) closes the panel
when `location.pathname === '/dashboard'`.

### 4. `DashboardPage` rewrite

Keeps: `SidebarProvider`/`AppSidebar`/`AppHeader` frame, auth gate, watercolor
backdrop. Everything else is replaced by `<ScoutChatThread variant="page" />`
in a centered column. The mode dropdown, type-and-delete example animation,
enrich dialog, activity query, and their imports are deleted. The
`/find?tab=...&q=...` handoff disappears — prompts go to Scout, which already
routes searches via its navigate tool.

### 5. Shortcut / button behavior

In `App.tsx`'s Cmd+K handler and the Ask Scout header button: if on
`/dashboard`, focus the shared `inputRef` (the page composer) instead of
`togglePanel()`. Everywhere else, unchanged.

## Out of scope

- No backend changes. Scout's API, persistence (`scoutChats`), and tools are
  untouched.
- Chat-history sidebar stays panel-only (no history UI on the page).
- The tour demo keeps seeding through the panel as today.
- `useScoutChat` internals unchanged apart from where it's called from.

## Risks / edge cases

- **Two views mounted at once** (panel open while on `/dashboard`): prevented
  by the panel-closing rule; singleton effects live in the provider anyway, so
  even a transient double-mount can't double-fire navigations or duplicate
  celebration messages.
- **Refs:** `useScoutChat` exposes one `inputRef`/`messagesEndRef`. With the
  panel-closing rule only one thread view is mounted at a time, so the refs
  bind unambiguously.
- **Tour demo:** unchanged — it opens the panel and seeds synthetic messages
  through the shared instance. If the tour runs while on `/dashboard`, the
  seeded thread simply shows on the page too (acceptable; same conversation by
  design). The panel-close-on-dashboard effect must not fight the tour's
  `openPanel()` — gate it on `demoSurface !== 'scout'`.

## Testing

No frontend test framework exists; verification is manual:
1. Getting Started empty state renders heading + box + chips; send works.
2. Send on page → reply streams in; approve card / CTA chip actions navigate.
3. Type on page, go to `/find`, open panel → same thread. Reverse direction too.
4. Cmd+K and Ask Scout button on `/dashboard` focus the page box; on other
   pages they open the panel.
5. Panel closes when navigating to `/dashboard`.
6. Failed-search help (panel) and onboarding tour Scout step still work.
