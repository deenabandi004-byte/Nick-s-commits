# Getting Started page: route and file mapping

**Why this note exists:** the sidebar label and the internal route do not match.
This is intentional. Read this before renaming files or routes so we avoid
confusion later.

## The mapping

| What the user sees | Internal route | File |
|--------------------|----------------|------|
| "Getting Started" (sidebar item, top of Workspace) | `/dashboard` | `connect-grow-hire/src/pages/DashboardPage.tsx` |

- The sidebar item is defined in `connect-grow-hire/src/components/AppSidebar.tsx`
  (`mainNavItems`). Its label is "Getting Started" but its `url` is `/dashboard`.
- The route is registered in `connect-grow-hire/src/App.tsx` as `/dashboard`.
- We kept the route on `/dashboard` on purpose. Many redirects, prefetch hooks
  (`DashboardPrefetch`), and post-login / post-onboarding navigations point at
  `/dashboard`. Renaming the route would touch all of those, so we relabeled the
  sidebar instead.

## What the page is now

The old personalized dashboard (blue hero band, discovery carousels, follow-ups,
tools) is being replaced by a Getting Started launcher: a "Help me find" surface
with a People / Companies selector and a single search box that hands the query
off to the search page at `/find`.

## If you need to change this

- To rename the label only: edit `mainNavItems` in `AppSidebar.tsx`.
- To actually move the route to `/getting-started`: update `App.tsx`, every
  `navigate("/dashboard")` and `<Navigate to="/dashboard">`, the redirect table,
  and `DashboardPrefetch`. Do not do this casually.
