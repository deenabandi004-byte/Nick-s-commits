# Handoff - Offerloop · Stationery Aesthetic Refresh

## Overview

This handoff covers a full visual-system refresh of the Offerloop frontend (`connect-grow-hire/`) plus one information-architecture change: consolidating the user's saved records into a single **My Network** surface with three spreadsheet tabs (People · Companies · Hiring Managers).

The aesthetic direction is **Stationery** - personal letterhead, not another AI dashboard. Cream paper, ink navy, oxblood accent, Instrument Serif italics used sparingly as a signature gesture. The goal is a product that looks *human* in a category that all looks the same.

## About the Design Files

The files in this bundle are **design references created in HTML** - prototypes showing intended look, copy, and interaction. They are **not production code to copy directly**. Your task is to **recreate these designs inside the existing `connect-grow-hire/` React + Vite + TypeScript + Tailwind codebase** using its established patterns (shadcn/ui primitives, Tailwind classes, existing route structure).

All HTML in the bundle is a single-file prototype. It uses raw CSS variables and inline styles to demonstrate the aesthetic - you will port those values to `tailwind.config.ts` tokens and shadcn-style components.

## Fidelity

**High-fidelity.** Colors, typography, spacing, and interactions are final. Recreate pixel-perfectly using the codebase's shadcn/ui + Tailwind setup. Every hex, pt size, and spacing value in the README is the target value.

---

## Rollout Order (non-negotiable)

Execute phases in order. Do not start phase N+1 until phase N is merged.

1. **Tokens** - replace CSS variables in `src/index.css`, update `tailwind.config.ts`. No visual change yet if flag is off.
2. **Type** - install Inter + Instrument Serif + JetBrains Mono via `index.html`. Remove Lora, DM Sans, Libre Baskerville, IBM Plex Mono, VanquishBold.
3. **Primitives** - rebuild shadcn components (Button, Input, Badge, Card, Tabs, Table Row) against new tokens. Add new `<PageTitle>` component.
4. **Sidebar + My Network route** - add `My Network` nav item, build `/my-network/:tab` route with three tabs.
5. **Page templates** - apply to Find, Meetings, Tracker, Job Board screens.
6. **Feature flag** - gate the entire new look behind `VITE_FLAG_NEW_AESTHETIC`. Default off.
7. **Marketing** - landing page inherits the system (last).

---

## Design Tokens

### Colors (CSS variables - put in `src/styles/tokens.css`)

```css
:root[data-theme="stationery"] {
  /* Paper - page backgrounds */
  --paper:    #FDFDFD;  /* clean white, default. Cream option: #FDFBF7 */
  --paper-2:  #F4F4F4;  /* subtle surface (table header, note cards). Cream: #F7F3EA */
  --elev:     #FFFFFF;  /* elevated surfaces (cards, modals). Cream: #FFFEFB */

  /* Ink - text, primary UI */
  --ink:      #1A1D23;  /* primary text, headings */
  --ink-2:    #4A5058;  /* secondary text, labels */
  --ink-3:    #8A8F96;  /* tertiary / mono captions */

  /* Lines */
  --line:     #E8E8E8;  /* primary dividers. Cream: #E6DFCF */
  --line-2:   #F0F0F0;  /* row dividers. Cream: #EFE9DA */

  /* Brand - stationery navy */
  --brand:    #1F2B4E;  /* nav rail background, primary buttons */
  --brand-2:  #2A3862;  /* hover */

  /* Accent - oxblood (signature) */
  --accent:   #8B2E1F;  /* italic underline, single callout, never fills */

  /* Signals */
  --signal-pos: #2C5F3C;  /* replied, success */
  --signal-neg: #9B3423;  /* bounced, error */
  --signal-wait:#8C6A1F;  /* awaiting, warning */
}
```

**Paper tone variants** - `cream`, `ivory`, `manila`, `clean` (default). User-tweakable in prototype; ship with `clean`.

### Typography

| Role               | Family             | Weight | Size/Line        | Letter-spacing |
|--------------------|--------------------|--------|------------------|----------------|
| Display (H1)       | Instrument Serif   | 400    | 56/60            | -0.02em        |
| Page Title (H2)    | Instrument Serif   | 400    | 36/40            | -0.015em       |
| Section Head (H3)  | Inter              | 600    | 22/28            | -0.01em        |
| Subhead (H4)       | Inter              | 600    | 16/22            | 0              |
| Body               | Inter              | 400    | 14/22            | 0              |
| Body small         | Inter              | 400    | 13/20            | 0              |
| Label / meta       | Inter              | 500    | 12/16            | 0              |
| Mono caption       | JetBrains Mono     | 400    | 10/14            | 0.12em (upper) |
| Number             | JetBrains Mono     | 400    | varies           | 0.02em         |

**Italic serif is a signature - use only for:**
- One word inside a PageTitle (the accented noun)
- Marketing headlines
- Empty-state whisper copy
- The ` - with care` footer sign-off

Never use italic serif for body, buttons, or chrome.

**Google Fonts import** - put in `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Remove from the codebase:** Lora, DM Sans, Libre Baskerville, IBM Plex Mono, VanquishBold (and their font files under `src/assets/fonts/` if no longer referenced).

### Spacing scale (Tailwind-compatible)

```
0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80 (px)
```

### Border radii

| Token  | Value | Usage                          |
|--------|-------|--------------------------------|
| r-sm   | 4px   | small chips, kbd keys          |
| r-md   | 6px   | inputs, small buttons          |
| r-lg   | 8px   | buttons, badges                |
| r-xl   | 10px  | cards, tables, primary surfaces|
| r-2xl  | 14px  | modals, large containers       |

**Never exceed 14px.** Current 3px radius is too tight; pill/rounded-full is AI-slop.

### Shadows

```css
--shadow-sm: 0 1px 2px rgba(26, 29, 35, 0.04);
--shadow-md: 0 2px 6px rgba(26, 29, 35, 0.06), 0 1px 2px rgba(26, 29, 35, 0.04);
--shadow-lg: 0 8px 24px rgba(26, 29, 35, 0.08), 0 2px 6px rgba(26, 29, 35, 0.04);
```

Shadows are used sparingly - paper doesn't hover. Primary surfaces sit on the paper with a `1px solid var(--line)` border instead.

### Signature gesture - scribble underline

A hand-drawn SVG underline under the accented word in PageTitles. Inline SVG, stroked with `var(--accent)`, 2px, rough path. Ships as a reusable component.

```tsx
// src/components/ScribbleUnderline.tsx
export const ScribbleUnderline = () => (
  <svg className="absolute left-0 -bottom-1 w-full h-[8px]" viewBox="0 0 200 8" preserveAspectRatio="none">
    <path
      d="M2,5 Q30,1 60,4 T120,3 T180,5 T198,4"
      stroke="var(--accent)"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);
```

### Paper grain (optional)

A very-low-opacity inline SVG noise applied as `background-image` on `<body>`. ~40% opacity, additive. Keep off by default; expose as user preference later.

---

## Tailwind Config Updates

```ts
// tailwind.config.ts
export default {
  // ...existing
  theme: {
    extend: {
      colors: {
        paper:   'var(--paper)',
        'paper-2': 'var(--paper-2)',
        elev:    'var(--elev)',
        ink:     { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        line:    { DEFAULT: 'var(--line)', 2: 'var(--line-2)' },
        brand:   { DEFAULT: 'var(--brand)', 2: 'var(--brand-2)' },
        accent:  'var(--accent)',
        signal:  {
          pos:  'var(--signal-pos)',
          neg:  'var(--signal-neg)',
          wait: 'var(--signal-wait)',
        },
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm:  '4px',
        md:  '6px',
        lg:  '8px',
        xl:  '10px',
        '2xl': '14px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(26,29,35,0.04)',
        md: '0 2px 6px rgba(26,29,35,0.06), 0 1px 2px rgba(26,29,35,0.04)',
        lg: '0 8px 24px rgba(26,29,35,0.08), 0 2px 6px rgba(26,29,35,0.04)',
      },
    },
  },
};
```

---

## Primitives to Rebuild

Rebuild these shadcn components (in `src/components/ui/`) against the new tokens. Keep existing APIs so consumers don't break.

### Button

| Variant    | BG                 | Text          | Border                    | Hover                  |
|------------|--------------------|---------------|---------------------------|------------------------|
| `primary`  | `var(--ink)`       | `var(--paper)`| none                      | BG lightens to #2A2E36 |
| `secondary`| `var(--elev)`      | `var(--ink)`  | `1px solid var(--line)`   | BG → `var(--paper-2)`  |
| `ghost`    | transparent        | `var(--ink-2)`| none                      | BG → `var(--paper-2)`  |
| `brand`    | `var(--brand)`     | white         | none                      | BG → `var(--brand-2)`  |
| `accent`   | transparent        | `var(--accent)`| `1px solid var(--accent)` | BG → `var(--accent)`, text white |

Sizes: `xs` (28px h, 12px font), `sm` (32px h, 13px), `md` (36px h, 14px, default), `lg` (44px h, 15px).
Radius: `rounded-lg` (8px). Padding-x: 1.25× height.
Kbd shortcut support: optional `<kbd>` child, right-aligned, `JetBrains Mono` 10px.

### Input

- Height 36px, radius `rounded-md` (6px)
- Border `1px solid var(--line)`, BG `var(--elev)`
- Focus: `1px solid var(--ink)` + `0 0 0 3px rgba(26,29,35,0.06)` glow
- Placeholder color `var(--ink-3)`
- Inner padding 12px h × 8px v

### Badge

- Default: BG `var(--paper-2)`, text `var(--ink-2)`, border `1px solid var(--line)`, radius `rounded-lg` (8px, NOT pill)
- `brand`: BG `rgba(31,43,78,0.08)`, text `var(--brand)`, border `1px solid rgba(31,43,78,0.15)`
- `pos`/`neg`/`wait`: text + border use `--signal-*`, BG 8% opacity of same
- `.dot` modifier: 6px circle prefix, same color as text
- Font: Inter 500, 11px, no text-transform

### Card

- BG `var(--elev)`, border `1px solid var(--line)`, radius `rounded-xl` (10px)
- No shadow by default; add `shadow-sm` only when elevating (modals, popovers)
- Padding 20px all sides default

### Tabs

- Horizontal list, no background fill
- Each tab: 13px Inter 500, padding 10px 14px, radius 0 (no pill!)
- Active: `var(--ink)` text + `2px solid var(--ink)` bottom border
- Inactive: `var(--ink-3)` text, no border
- Optional count pill: 10px mono in 4px-radius paper-2 bg

### Table Row

- Grid-based, not `<table>` (easier responsive)
- Header row: BG `var(--paper-2)`, 9px mono uppercase labels `var(--ink-3)`, letter-spacing 0.12em, padding 10px 20px
- Body row: 12px 20px padding, border-bottom `1px solid var(--line-2)`
- First column: 32px checkbox gutter
- Hover row: BG `rgba(31,43,78,0.02)`
- Last row: no border-bottom

### PageTitle (new)

```tsx
interface PageTitleProps {
  children: React.ReactNode;    // "Who do you want to"
  accent?: React.ReactNode;     // "meet?" - gets italic + scribble
  subtitle?: string;
}

export const PageTitle = ({ children, accent, subtitle }: PageTitleProps) => (
  <div>
    <h1 className="font-serif text-[44px] leading-[1.05] text-ink">
      {children}{' '}
      {accent && (
        <span className="italic relative inline-block">
          {accent}
          <ScribbleUnderline />
        </span>
      )}
    </h1>
    {subtitle && (
      <p className="mt-2 text-ink-2 text-[15px]">{subtitle}</p>
    )}
  </div>
);
```

**Usage rules:**
- Only on Find screen, Meetings landing, marketing hero
- **Never on My Network, Tracker, Job Board** - those are work surfaces and stay utilitarian (breadcrumb-only header)

---

## Screen: My Network

### Purpose

Single destination for the user's saved records - the Rolodex. Replaces what used to be scattered across the topbar and a "View Contacts" button. Contains three spreadsheets, each with distinct columns.

### Routes

```
/my-network                    → redirect to /my-network/people
/my-network/people
/my-network/companies
/my-network/managers
```

Tab switching updates the URL (not just state) so refresh + share-URL work.

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Sidebar (240px)  │ Main (flex)                                  │
│ ────────────────│──────────────────────────────────────────────│
│ Offerloop logo  │ Topbar: Workspace / My Network / {tab}        │
│                 │         [Import CSV] [Export] [Add {type}]    │
│ ▫ Find          │ ────────────────────────────────────────────  │
│ ■ My Network 183│ Tabs: People (124) · Companies (38) ·         │
│ ▫ Meetings  │        Hiring Managers (21)                   │
│ ▫ Tracker       │ ────────────────────────────────────────────  │
│ ▫ Job Board     │ Table: grid rows, sticky header               │
│                 │                                                │
│ Credits 0/300   │                                                │
│ [Upgrade]       │                                                │
└────────────────────────────────────────────────────────────────┘
```

### No greeting

Unlike Find, My Network has **no italic PageTitle, no "Who do you want to meet?" copy, no scribble underline**. The breadcrumb (`Workspace / My Network / People`) is the label. This is intentional - Find is the front door (warm, inviting), My Network is the filing cabinet (utilitarian, dense).

### Topbar actions (per tab)

| Tab              | Primary CTA   | Secondary        |
|------------------|---------------|------------------|
| People           | Add person    | Import CSV, Export |
| Companies        | Add company   | Import CSV, Export |
| Hiring Managers  | Add manager   | Import CSV, Export |

### Table: People

Columns: `[checkbox 32px] [Name 1.3fr] [Role · Company 1fr] [Location 1fr] [School 1fr] [Connection 110px]`

- **Name**: 13px Inter 600 primary + 11px JetBrains Mono email secondary
- **Role · Company**: 12px Inter, `--ink-2`
- **Location**: 12px Inter, `--ink-2`
- **School**: Badge component - `brand` variant if alumni match, default otherwise. Format: `USC · '22`
- **Connection**: 10px JetBrains Mono uppercase, `--ink-3`. Values: `ALUMNI`, `PRIOR CO.`, `INTRO`, `MANUAL`, `LINKEDIN`

No status column. No "Last" column. No avatars (use the checkbox gutter instead - cleaner, avoids fake initials).

### Table: Companies

Columns: `[checkbox 32px] [Company 1.4fr] [Industry 1fr] [HQ 1fr] [Alumni 90px right] [Size 90px right]`

- **Company**: 13px Inter 600 + 11px mono domain
- **Industry**: 12px Inter, `--ink-2`
- **HQ**: 12px Inter `City, ST`
- **Alumni**: JetBrains Mono, `--ink`, right-aligned (numeric)
- **Size**: JetBrains Mono, `--ink-2`, right-aligned, abbreviated (`45k`, `1.7k`, `800`)

### Table: Hiring Managers

Columns: `[checkbox 32px] [Name 1.2fr] [Title 1fr] [Role hiring for 1.2fr] [Company 1fr] [Posted 80px right]`

- **Name**: 13px Inter 600 + 11px mono email
- **Title**: 12px Inter, `--ink-2`
- **Role hiring for**: 12px Inter, `--ink-2`
- **Company**: 12px Inter, `--ink-2`
- **Posted**: JetBrains Mono `--ink-2`, format `12d`, `4d`, `20d`

### Empty states

Paper-toned card, center-aligned, italic Instrument Serif whisper copy:
- People: *"No one here yet. Add someone from Find, or import a CSV."*
- Companies: *"No companies saved. Star one from Find to add it here."*
- Hiring Managers: *"No active hiring managers. We'll surface new posts from companies you follow."*

### Interactions

- **Row click** → opens a right-side drawer (not a new route) with full record detail + edit form
- **Checkbox select** → bulk action bar slides up from bottom: `Delete · Tag · Export selected`
- **Column header click** → sort asc/desc (chevron icon appears)
- **Tab switch** → URL updates, scroll resets, column count + labels swap, primary CTA label updates (`Add person` → `Add company` etc.)
- **Keyboard**: `/` focuses search, `F` opens filter, `N` opens Add modal, `Esc` closes drawer

### State (React Query + URL)

```ts
// useMyNetwork hook
const { tab } = useParams();  // 'people' | 'companies' | 'managers'
const { data } = useQuery({
  queryKey: ['my-network', tab, filters],
  queryFn: () => api.getMyNetwork(tab, filters),
});
```

Filters live in URL search params so they survive refresh and are shareable.

---

## Screen: Find (updates only)

The Find screen is where the **PageTitle with scribble underline** lives. Keep its existing structure; update:

1. Replace current title with `<PageTitle>Who do you want to <em>meet?</em></PageTitle>` (or whatever the product copy is - italic word should be the accented noun/verb).
2. Remove the redundant "View Contacts · N" topbar button - that data now lives at `/my-network`.
3. Subtitle (if present): 15px Inter, `--ink-2`.
4. Suggestion chips below title: 13px Inter, BG `--paper-2`, border `1px solid --line`, radius `rounded-lg`. Hover: BG lightens.

---

## Sidebar (updated)

Order: `Find`, `My Network`, `Meetings`, `Tracker`, `Job Board`. Resources section below divider: `Documentation`.

- Width 240px, BG `var(--brand)` (navy), text `rgba(255,255,255,0.78)`
- Active item: text white, BG `rgba(255,255,255,0.08)`, `2px` left accent bar `var(--accent)`
- Hover: text white, BG `rgba(255,255,255,0.04)`
- Counts: right-aligned, 10px mono, `rgba(255,255,255,0.55)` inactive / `0.75` active
- Bottom: credits card with progress bar + Upgrade CTA

---

## Feature Flag

Wrap everything:

```tsx
// src/App.tsx
const flag = import.meta.env.VITE_FLAG_NEW_AESTHETIC === 'true';

<body data-theme={flag ? 'stationery' : 'legacy'}>
```

Tokens live under `:root[data-theme="stationery"]`; legacy keeps existing vars untouched. Rollout: your account → 10% → 50% → 100%.

---

## Interactions & Behavior - Summary Table

| Surface          | Interaction            | Behavior                                                    |
|------------------|------------------------|-------------------------------------------------------------|
| Sidebar item     | Click                  | Navigate to route; active state updates                      |
| My Network tab   | Click                  | Navigate to `/my-network/:tab`; scroll reset; columns swap   |
| Table row        | Click                  | Open right drawer with detail                                |
| Table row        | Checkbox               | Toggle select; bulk bar appears when ≥1 selected             |
| Column header    | Click                  | Sort asc/desc                                                |
| Search input     | Focus shortcut `/`      | From anywhere in the app                                     |
| Primary CTA      | Click                  | Open Add modal (form matches columns)                        |
| Tweak panel      | (Dev only, not shipped)| Not part of production                                       |

Animations: 150ms ease-out for most transitions. No spring bounces. Drawer slide-in: 200ms ease-out.

---

## Accessibility

- All interactive elements: focus-visible ring, `2px solid var(--ink)` + 2px offset
- Tab order: sidebar → topbar → tabs → table → pagination
- Table rows: `role="row"`, header `role="columnheader"`, sortable headers `aria-sort`
- Color contrast: all ink levels pass WCAG AA against paper; accent on paper passes AA large (use only for italic display, not body)
- Respect `prefers-reduced-motion`: disable slide-in animations

---

## Assets

- **Fonts**: Google Fonts (Inter, Instrument Serif, JetBrains Mono) - no local font files needed. Remove `src/assets/fonts/` entries for Lora/DM Sans/Libre Baskerville/IBM Plex/Vanquish.
- **ScribbleUnderline**: inline SVG component (no asset file)
- **Paper grain**: inline SVG noise `background-image`, generate with feTurbulence (provided below if needed)
- **Logo seal**: existing "O" mark; recolor to `var(--paper)` on `var(--brand)` bg

---

## Files in This Bundle

- `Aesthetic Audit v2.html` - the full aesthetic prototype (tokens, type, primitives, screens, My Network click-through flow). Open in a browser to reference the target look.
- `Aesthetic Audit.html` - v1 audit (superseded; kept for context on what was rejected and why)

---

## Acceptance Criteria

Implementation is done when:

1. `VITE_FLAG_NEW_AESTHETIC=true` renders the new system everywhere; `=false` renders the legacy UI unchanged.
2. All five old font families are removed from the bundle; Inter/Instrument Serif/JetBrains Mono load from Google Fonts.
3. `/my-network/people` `/my-network/companies` `/my-network/managers` all render with correct columns, tab highlighting, and breadcrumb.
4. The Find screen title renders Instrument Serif with a scribble underline under the accented word. No other screen uses the italic-underline gesture.
5. Button, Input, Badge, Card, Tabs, Table Row primitives pass Storybook/visual-regression against the HTML prototype.
6. All color values in the rendered app match the `--ink`, `--paper`, `--accent`, `--brand` CSS variables exactly - no hardcoded hexes in component code.
7. Keyboard shortcuts `/`, `F`, `N`, `Esc` work on `/my-network`.

---

## Kickoff Prompt for Claude Code

Paste this into Claude Code at the repo root:

> I'm implementing a design-system refresh in `connect-grow-hire/`. The full spec is in `design_handoff_stationery_aesthetic/README.md` - read it end to end before doing anything.
>
> Work in phases, committing after each:
> 1. Add Google Fonts to `index.html` + create `src/styles/tokens.css` with the new CSS variables under `[data-theme="stationery"]` + update `tailwind.config.ts`. Wrap the entire app in `<body data-theme={flag?'stationery':'legacy'}>`. Add `VITE_FLAG_NEW_AESTHETIC` env var (default false).
> 2. Remove unused font families (Lora, DM Sans, Libre Baskerville, IBM Plex Mono, VanquishBold) from `index.html`, `src/index.css`, and `src/assets/fonts/`.
> 3. Rebuild shadcn primitives: Button, Input, Badge, Card, Tabs, Table Row - matching the specs in the README. Keep existing APIs.
> 4. Add `PageTitle` + `ScribbleUnderline` components. Wire them into the Find screen only.
> 5. Add "My Network" sidebar nav item and the `/my-network/:tab` route with People/Companies/Hiring Managers tables. Each tab has the columns listed in the README.
> 6. Stop. Ask me to review before you touch Tracker, Meetings, Job Board, or marketing.
>
> Don't skip phases. Don't touch anything outside each phase's scope. After each phase, run the existing tests, show me a diff summary, and wait for approval before the next phase.
