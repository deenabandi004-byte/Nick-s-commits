# Browse Jobs — new home page (DoorDash/Handshake-style)

**Date:** 2026-06-29
**Status:** Approved (design), ready to build

## Goal

Add a brand-new "browse everything" job board and make it the **post-login
landing page**. The current personalized Dashboard is **kept and still
reachable** — not deleted, just no longer the default landing. The current
personalized two-pane Job Board (`/job-board`) is **untouched** and stays as
the "recommended for me" surface.

This is additive: nothing built so far is removed.

## What the user sees

**Home (the new landing):** DoorDash-style — a vertical stack of category
"rows," each a horizontally scrollable strip of job cards:

- ⭐ Recommended for you (from the personalized feed)
- 🔥 New today (`postedAfter: 24h`)
- 🎓 Internships (`type: INTERNSHIP`)
- 🏠 Remote (`location: remote`)
- 💻 Tech, 💰 Finance, etc. (keyword/company-driven rows)

Each row has a **"See all →"** that opens the Handshake-style grid for that
category. A top search box + "Browse" category pills also open the grid.

**Grid view (Handshake-style):** filters (location, type, seniority, date) +
a responsive card grid that **infinite-scrolls** via the search cursor. A
back affordance returns to the rows home.

## Architecture

New page `BrowseJobsPage.tsx` under the standard app shell
(`SidebarProvider` > `AppSidebar` + `AppHeader`), so it matches every other
authed page.

Two in-page modes (no extra routes needed for v1), toggled by component state:
1. **rows mode** (default) — the category carousels.
2. **grid mode** — entered via "See all", a Browse pill, or typing in search.
   Holds `{categoryKey | searchQuery, filters}` and pages results.

### Data

100% reuse of the existing catalog endpoint `GET /api/jobs/search` via
`apiService.searchJobs(params)`:
- `params`: `q`, `company`, `location`, `type`, `seniority`, `postedAfter`,
  `limit`, `cursor`. Response: `{ results: FeedJob[], count, scanned,
  next_cursor }`.
- **Rows:** one `searchJobs` call per category, `limit: 12`, no cursor.
- **Grid:** `searchJobs` with the category's filter + `limit: 24`, then
  append pages using `next_cursor` until it's null (infinite scroll).
- **Recommended row:** reuse the personalized feed (`getJobFeed`, already
  cached/preloaded) and show its top ~12; "See all" on that row deep-links to
  the existing `/job-board`.

All search calls are wrapped in React Query (keyed by category/filters) so
revisiting a row/grid is instant and shares the app cache.

### Components

- `BrowseJobsPage.tsx` — page shell + mode state.
- `JobRow.tsx` — one labelled horizontal carousel; takes a category def, runs
  its `useQuery`, renders compact cards + "See all".
- `JobGrid.tsx` — filters + responsive grid + infinite scroll.
- `BrowseJobCard.tsx` — compact card (logo, title, company, location, type,
  salary, match badge if present, Save + Apply). Consumes the existing
  `ProtoJob` shape via `feedJobToProto`.
- **Reused as-is:** `feedJobToProto` / `ProtoJob` (adapter), `JobDetail` (the
  detail drawer opened on card click, with the same lazy description fetch as
  the redesign page), `apiService.saveJob/unsaveJob/searchJobs/getJobFeed`,
  `AppSidebar`, `AppHeader`, `JobBoardSkeleton`.
- A `categories.ts` config: array of `{ key, label, emoji, params }`.

### Card click

Opens a right-side detail drawer rendering the existing `JobDetail` (lazy
description via `getJobDescription`, Apply, Save). Auto-apply / Find-humans are
optional props on `JobDetail` and are **omitted in v1** to keep scope tight;
they can be wired later.

## Routing changes (`App.tsx`)

- Add `/jobs` → `BrowseJobsPage` (lazy, `ProtectedRoute`).
- Change the post-login landing redirect from `/dashboard` → `/jobs` in
  `PublicRoute` and the onboarding-complete redirect.
- **Keep** the `/dashboard` route → `DashboardPage` (current home, saved &
  reachable by direct link and sidebar).
- Add a job-feed-style **prefetch** for the recommended row (already preloaded
  by `JobFeedPrefetch`).

### Sidebar (`AppSidebar.tsx`)

- "Home" points to `/jobs` (the new board).
- Keep an entry to reach the old Dashboard (e.g. a "Dashboard" item) so it's
  not orphaned.

## Known v1 limits (acceptable)

- Catalog search scans the most recent ~1,000 matching jobs per query
  (`_SEARCH_MAX_SCAN`), returns ≤100/page. Plenty for browsing; deepen later
  if needed.
- Category rows are a fixed curated set; no user-customized rows in v1.
- Auto-apply / Find-people not wired into the browse detail drawer in v1.

## Out of scope (v1)

- Backend changes (none needed).
- Saved-search / alerts on the browse board.
- Personalized ordering of the catalog grid (it's recency-ordered).

## Build checklist

1. `categories.ts` config.
2. `BrowseJobCard.tsx`.
3. `JobRow.tsx` (carousel + useQuery).
4. `JobGrid.tsx` (filters + infinite scroll).
5. `BrowseJobsPage.tsx` (shell + mode state + detail drawer).
6. Wire routing + landing redirect in `App.tsx`; keep `/dashboard`.
7. Update `AppSidebar` nav.
8. Build + typecheck; verify in browser.
