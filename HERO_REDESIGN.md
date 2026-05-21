# Hero Redesign - Asymmetric Prompt-as-CTA

An asymmetric landing hero: a punchy serif headline + prompt input on the
left, and an animated product-preview panel on the right that cycles
through the four real Offerloop phases (Search → Finding → Drafting →
Tracking). The left side is the CTA; the right side is the proof.

The visitor types who they want to meet → their query is stashed in
`localStorage` → they're redirected to sign up → after auth, their query is
automatically pre-filled in the real search bar on `/find`.

## Headline

> **Outreach without**
> ***the busywork.***  ← second line in Offerloop blue

Two lines, four words. Sets up the subcopy:

> *"Describe who you need to meet. Offerloop finds verified contacts,
> drafts the intro email, and tracks every reply - so you spend your time
> on conversations, not copy-paste."*

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [nav bar]                                                          │
│                                                                     │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐      │
│  │ ◆ eyebrow pill      │  │  🔍 USC Marshall alumni at... ▮  │      │
│  │                     │  │  ─────────────────────────────── │      │
│  │ Meet everyone       │  │  NAME     ROLE     EMAIL  DRAFT  │      │
│  │ between you and     │  │  JM James Morrison ✓ Yes  ✓ Yes  │      │
│  │ the offer.          │  │  LW Lisa Wang      ✓ Yes  ✓ Yes  │      │
│  │                     │  │  RC Robert Chen  ◄ highlighted   │      │
│  │ Describe who you…   │  │  ┌──────────────────────┐        │ bleed│
│  │                     │  │  │ DRAFT PREVIEW ·      │        │  →   │
│  │ ┌─────────────────┐ │  │  │ "Hi Robert - I'm a   │        │      │
│  │ │🔍 input         │ │  │  │  junior at USC…"     │        │      │
│  │ │      [Sign in…] │ │  │  │                      │        │      │
│  │ └─────────────────┘ │  │  DP David Park     ✓ Yes  ✓ Yes  │      │
│  │ Try: chips · chips  │  │  5 drafts ready         ● Live   │      │
│  │ Free · No card …    │  └──────────────────────────────────┘      │
│  └─────────────────────┘        ·  ·  ·  dotted grid backdrop       │
└─────────────────────────────────────────────────────────────────────┘
```

- **CSS grid** with `1.05fr 1fr` columns, gap 56px, max-width 1440, padded
  only on the left so the right panel can bleed. `overflow: hidden` on the
  hero `<section>` clips the bleed cleanly.
- **Right panel** uses `position: absolute; width: calc(100% + 40px); max-width: 640px`
  so it extends past its grid cell into the viewport's right margin.
- **Dot grid backdrop** behind the panel: `radial-gradient` CSS pattern at
  22px tile, masked by a `radial-gradient` ellipse so it fades at the edges.

## Animations - the 4-phase cycle

The right panel is a state machine that runs on a loop. Every phase adds
one more pip to the pagination dot strip at the top of the panel, morphs
the phase title, and progresses the row content. All timing is driven by a
single `useEffect` that schedules `setTimeout`s and restarts itself at the
end of the final phase.

### Phase 1 - **SEARCH** (● ○ ○ ○)
- Demo query `"USC alumni working at Goldman Sachs in New York"` types
  character-by-character into the search bar, ~42ms/char.
- Blue blinking caret (520ms interval).
- Table body is empty, header row is mounted.
- Duration: ~2400ms.

### Phase 2 - **FINDING CONTACTS** (● ● ○ ○)
- Blue **"Find people"** button fades in at the right of the search bar
  (opacity + translateX).
- Six rows (Chris Wallace · Maya Rodriguez · Aidan Murphy · Rachel Nguyen
  · Tyler Brooks · Priya Sharma) fade-up into the table body one by one,
  140ms apart.
- No statuses yet - just CONTACT / FIRM / ROLE columns populating.
- Duration: ~1100ms.

### Phase 3 - **DRAFTING OUTREACH** (● ● ● ○)
- Green chips **"6 CONTACTS"** and **"6 DRAFTED"** fade in at the right of
  the phase bar.
- Blue **"Drafted"** status pills scale-in per row, 100ms apart, filling
  the STATUS column top-to-bottom.
- Duration: ~1000ms.

### Phase 4 - **NETWORK TRACKER** (● ● ● ●)
- First wave: every row's **Drafted** pill morphs to **Sent** (yellow),
  90ms apart.
- Second wave: non-sent rows resolve to their final state, 420ms apart:
  - Aidan Murphy → **Replied** (green)
  - Rachel Nguyen → **Opened** (purple)
  - Priya Sharma → **Replied** (green)
  - Chris Wallace → **● Follow up** (red, with a pulsing notification dot
    via `@keyframes hsc-notify-pulse`). The row also picks up a soft
    cream background `#FFFBEB` to draw the eye.
- Panel holds on this final state for 4.5s.
- Duration: ~2100ms + 4500ms hold.

### Loop
After the hold, the effect calls itself recursively - all state is reset
(`setTypedQuery('')`, `setVisibleRows([])`, etc.) and Phase 1 starts again.
`clearTimeout`s from the previous run are flushed in the effect cleanup so
there are no dangling timers on unmount.

### Other animations
- **Caret blink** in the panel search bar: 520ms interval.
- **"Live" dot** in the footer: continuous `hsc-live-pulse` keyframe.
- **Notification dot** on the Follow up pill: continuous `hsc-notify-pulse`.
- **Placeholder rotation** on the left input: cycles through 5 sample
  queries every 3.2s, stops as soon as the visitor starts typing.

All keyframes are injected via a single `<style>` tag at the top of the
component. Class names are prefixed `hsc-` so nothing bleeds into the rest
of the app.

## Left column: pitch + prompt

1. **Eyebrow pill** - `Sparkles` icon + "For college students landing their
   first offer" on soft blue.
2. **Headline** (Libre Baskerville, 40–68px, 3 lines):
   > *Meet everyone*
   > *between you and*
   > **the offer.** ← the last line in Offerloop blue `#2563EB`
3. **Subheadline** - "Describe who you need to meet - alumni, analysts,
   recruiters at any firm. Offerloop surfaces verified contacts, drafts the
   intro email, and tracks every reply."
4. **Prompt input card** - white with soft shadow, 14px radius, blue search
   icon, rotating placeholder, focus ring glow. Submit button is
   dark-navy with a `Search` icon and reads **"Sign in to search"** (exact
   Clado-style phrasing). On hover it shifts to Offerloop blue.
5. **Example chips** - 4 clickable pill buttons that populate the input.
6. **Trust microcopy** - "Free to start · No credit card · 300 credits on
   signup".

## Right column: animated Network Tracker preview

A white rounded card that mimics the real product's Network Tracker UI:

- **Top bar** - blue search icon + typed query + blinking caret + a blue
  **"Find people"** pill button that fades in once typing is done.
- **Phase label strip** - four pagination dots (● ● ○ ○) + the current
  phase name in uppercase (`SEARCH`, `FINDING CONTACTS`, `DRAFTING OUTREACH`,
  `NETWORK TRACKER`) + a pair of green **"6 CONTACTS"** / **"6 DRAFTED"**
  chips that fade in at the Drafting phase and stay through Tracking.
- **Header row** - `CONTACT / FIRM / ROLE / STATUS`
- **6 result rows** - no avatars, just bold name + firm + role + status
  pill. Row 1 (Chris Wallace · Evercore · IB Analyst) is the "hero" row
  and ends the cycle on a red ● **Follow up** pill.
- **Footer** - "6 drafts ready · all tracked in one place" on the left, a
  pulsing blue dot + "Live" on the right.

### Status pill palette

| Status | Colors | When |
|---|---|---|
| **Drafted** | blue `#1D4ED8` on `rgba(37,99,235,0.10)` | Phase 3 only |
| **Sent** | amber `#92400E` on `#FEF3C7` | First wave of Phase 4 |
| **Opened** | violet `#6D28D9` on `#EDE9FE` | Final state (some rows) |
| **Replied** | emerald `#047857` on `#DCFCE7` | Final state (some rows) |
| **Follow up** | red `#B91C1C` on `#FEE2E2` + pulsing dot | Final state, highlighted row only |

## Responsive behavior

| Viewport | Behavior |
|---|---|
| ≥ 1100px | Full asymmetric 2-col, panel bleeds 40px past grid cell |
| 900–1099px | 2-col, panel contained in its cell (no bleed) |
| 560–899px | Single column stack: left pitch on top, right panel below, both centered |
| < 560px | Right panel hidden entirely - mobile shows only the pitch + input |

## Query handoff: how "try it" becomes a real search

```
Landing (/)
  │  user types → Enter / "Sign in to search"
  │  localStorage.setItem('offerloop_pending_query', query)
  │  navigate('/signin?mode=signup')
  ▼
/signin?mode=signup → Google OAuth → Gmail OAuth → /signin?connected=gmail
  │  (full-page redirects; localStorage survives because same-origin)
  ▼
/onboarding (new user) OR /home → /find (existing user)
  │  (onboarding doesn't touch localStorage)
  ▼
/find → ContactSearchPage
  │  useState(() => {
  │    const pending = localStorage.getItem('offerloop_pending_query')
  │    if (pending) {
  │      localStorage.removeItem('offerloop_pending_query')
  │      return pending
  │    }
  │    return ""
  │  })
  ▼
Search bar is pre-filled with the exact query the visitor typed.
```

### Why localStorage (not URL params)

Google/Gmail OAuth is a full-page redirect, not a popup. URL params are
dropped somewhere across the `/signin` → Google → Gmail → `/signin` → `/find`
chain. `localStorage` is same-origin and persists through every redirect.
It's one-shot: ContactSearchPage reads *and* removes on mount so old prompts
don't resurface later.

### Storage contract

| Key | Type | Written by | Consumed by | Lifetime |
|-----|------|------------|-------------|----------|
| `offerloop_pending_query` | `string` (trimmed) | `HeroSearchCTA.handleSubmit` | `ContactSearchPage` initial state | One-shot, cleared on first read |

The constant `PENDING_QUERY_KEY` is exported from `HeroSearchCTA.tsx` - any
other page that needs to pre-seed a search should import from there rather
than hardcoding the key.

## Files changed

| File | Change |
|---|---|
| `connect-grow-hire/src/components/HeroSearchCTA.tsx` | **New.** Two-column grid, typing animation, 4-phase cycling state machine, responsive breakpoints, status pill components. No new dependencies - uses only existing `lucide-react` icons (`Sparkles`, `Search`). |
| `connect-grow-hire/src/pages/Index.tsx` | Added `HeroSearchCTA` import. Swapped the old hero (headline + lede + single "Create account" button) for `<HeroSearchCTA />`. Widened the hero section: removed `max-width: 980` constraint, added `overflow: hidden`. **Removed `FeatureShowcase`** from below the hero - the new panel's cycling animation made the second animated element redundant and created an awkward gap. `FeatureShowcase.tsx` still exists in the repo (other pages may use it), it's just no longer on the landing page. |
| `connect-grow-hire/src/pages/ContactSearchPage.tsx` | `searchPrompt` `useState("")` → `useState(() => ...)` that reads and clears `offerloop_pending_query` from `localStorage` on mount, wrapped in try/catch for private-browsing mode. |

No changes to: `SignIn.tsx`, `FirebaseAuthContext`, onboarding pages,
router, `FeatureShowcase`, header, or any SEO/comparison page. No new npm
packages. Header "Sign In" and "Create account" buttons still route to
`/signin?mode=signin` and `/signin?mode=signup` respectively.

## Testing checklist

- [x] `npx tsc --noEmit` - no new errors introduced (all pre-existing)
- [x] Desktop 1440×900 screenshot - asymmetric grid, panel bleed, typing
  query, rows all faded in, tooltip pointing at highlighted row
- [x] Tablet 1024×900 - 2-col layout without bleed, panel fits in cell
- [x] Mobile 390×844 - right panel hidden, left column centered, input usable
- [ ] End-to-end query handoff - requires real Google OAuth session; manual:
  1. `cd connect-grow-hire && npm run dev`
  2. Open http://localhost:8080
  3. Type any query, press Enter (or click "Sign in to search")
  4. DevTools → Local Storage → confirm `offerloop_pending_query` is set
  5. Sign in with Google, complete onboarding if prompted
  6. On `/find`, People tab search bar should show your query, and the
     localStorage key should be gone.

## Known constraints

- The tooltip's `top: 248; left: 156` is absolutely positioned in pixels
  against the right wrap. It's tuned to the current row heights (~58px) and
  panel padding. If the demo rows change height or count, the tooltip needs
  to be re-tuned. A future version could measure the highlighted row with a
  `ref` and position the tooltip dynamically.
- The bleed-past-viewport look requires `overflow: hidden` on the hero
  `<section>`. The old hero didn't need it; I added it explicitly.
