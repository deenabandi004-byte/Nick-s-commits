# Implementation Plan - Find → Companies redesign + Personalization Layer

**Target repo:** `connect-grow-hire/` (React + Vite + TypeScript + Tailwind, shadcn/ui)
**Design reference:** `Find - Companies Aesthetic Improvements.html` in the design project
**Feature flag:** gate everything new behind `VITE_FLAG_FIND_COMPANIES_V2` (default `false`)

Work in the phase order below. Do not skip phases. Commit after each phase, run tests, show me a diff summary, and wait for approval before starting the next phase.

---

## Phase 0 - Schema + demonym table (backend, no UI change)

**Goal:** Build the data layer the Personalization Layer depends on. No user-visible change.

### 0.1 Firestore / DB schema additions

Add two new structures:

**`schools` collection (one doc per school):**
```ts
interface SchoolDoc {
  id: string;                    // e.g. "usc", "redlands", "michigan"
  name: string;                  // "USC"
  fullName: string;              // "University of Southern California"
  city: string;                  // "Los Angeles"
  color: string;                 // "#990000" - hex, single brand color
  seal: string;                  // "SC" - 1–4 char monogram for the stamp
  demonym: string | null;        // "Trojans" or null
  demonymConfidence: 'high' | 'medium' | 'low' | 'none';
  demonymProfessional: boolean;  // does it read well in "Where X have landed"
  reviewedBy: string | null;     // admin user id who approved
  reviewedAt: Timestamp | null;
  sampleSentence: string;        // "Where Trojans have landed" - for QA
}
```

**`users` doc - add fields:**
```ts
// add to existing user doc
personalization: {
  angle: string;                 // editable one-liner, default computed from resume
  preferDemonym: boolean;        // user-level override, default true
  angleEditedAt: Timestamp | null;
}
```

### 0.2 LLM seeder script

Create `scripts/seed_demonyms.ts`:

- Iterate every school currently referenced in any user's `university` field + every school in `/data/schools_seed.csv` (upload the IPEDS list; Redlands must be in there)
- For each school, call OpenAI with a strict JSON-output prompt:
  ```
  You are classifying how a US college's demonym reads in a professional
  networking context. Respond JSON only:
  {
    "demonym": "Trojans" | null,
    "confidence": "high" | "medium" | "low" | "none",
    "professional": true | false,
    "sampleSentence": "Where Trojans have landed.",
    "reasoning": "..."
  }
  Rules:
  - "high" = demonym is widely used by alumni in LinkedIn/resume contexts (USC Trojans, Michigan Wolverines)
  - "low" = technically correct but nobody leads with it professionally (Redlands Bulldogs, Reed Griffins)
  - "none" = no commonly accepted demonym (some small colleges)
  ```
- Write results to `data/demonyms_seed.json` - **do not write straight to prod**

### 0.3 Human review UI (admin-only)

Add `/admin/demonyms` route behind admin auth:
- Table view of seeded rows: `school | demonym | confidence | professional | sample | approve`
- Admin can edit confidence from `high→low`, flip `professional` boolean, or null out the demonym entirely
- "Approve & publish" button writes row to `schools` collection with `reviewedBy` + `reviewedAt`

**Acceptance:**
- `schools` collection has a doc for every school in the seed list, all `reviewedBy !== null`
- `getSchool(id)` helper exists in `src/lib/schools.ts` returning the full `SchoolDoc`
- `getUserPersonalization(uid)` returns `{school, angle, preferDemonym}` merged from user doc + school doc

---

## Phase 1 - Tokens + feature flag (no visual change when flag is off)

**Goal:** Drop in new CSS variables and the flag wrapper.

1. Add to `src/styles/tokens.css` (create if missing):
   ```css
   :root[data-find-v2="true"] {
     --paper: #FDFDFD;
     --paper-2: #F6F5F1;
     --ink: #111418; --ink-2: #4A4F57; --ink-3: #8A8F97;
     --line: #E5E3DE; --line-2: #EFEDE8;
     --brand: #1B2A44; --brand-2: #2A3D5C;
     --accent: #8B2E1F;
   }
   ```
2. In `src/App.tsx`, read `VITE_FLAG_FIND_COMPANIES_V2` and set `data-find-v2` on `<body>`.
3. Add Google Fonts to `index.html` if not already present:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
   ```

**Acceptance:** app builds, no visual change when flag off, tokens available when flag on.

---

## Phase 2 - Personalization primitives

**Goal:** Build the four reusable pieces the redesigned page (and eventually every page) will consume.

Create `src/components/personalization/`:

### 2.1 `<SchoolSeal />`
```tsx
interface Props { school: SchoolDoc; size?: 24 | 32 | 40; }
```
- Circle, BG = `school.color`, text = `school.seal` in Instrument Serif italic, white text
- Fallback: if no school, render a neutral `"?"` seal in `--ink-3`

### 2.2 `<PersonalizationStrip />`
- Takes the current user; renders seal + `{firstName} · {schoolName}` + the angle (mono uppercase)
- Inline "edit" link that opens `<AngleEditor />` modal
- Always visible on Find pages; persists across tabs

### 2.3 `<AngleEditor />` modal
- Single textarea, 80-char soft limit, placeholder = computed-from-resume angle
- Saves to `users.personalization.angle`

### 2.4 `useSchoolTitle()` hook
```ts
function useSchoolTitle(variant: 'companies' | 'people'):
  { lead: string; accent: string }
```
Logic:
```ts
const s = useSchool();
const { preferDemonym } = useUserPersonalization();
const useDemonym =
  preferDemonym
  && s.demonym
  && s.demonymConfidence === 'high'
  && s.demonymProfessional;

if (variant === 'companies') {
  return useDemonym
    ? { lead: `Where ${s.demonym} have`, accent: 'landed.' }
    : { lead: `Where your ${s.name} network`, accent: 'went.' };
}
// ... people variant omitted for brevity - same pattern
```

### 2.5 `<PageTitle />` - revise existing

Existing component stays, but accepts `lead` + `accent` props driven by `useSchoolTitle()`. Scribble SVG stays.

### 2.6 `<ScoutNote />`
- Cream card, Instrument Serif italic body
- Props: `{ firstName, schoolName, resumeHook?, demonymOrAlumni }` - the demonymOrAlumni is computed in parent
- Never pass in a raw "Trojans" string - always compute via the confidence gate

**Acceptance:** Storybook stories for each primitive. Unit test: `useSchoolTitle` returns "Bulldogs" title when Redlands has confidence changed to `high` in a test fixture, and falls back to "your Redlands network" otherwise.

---

## Phase 3 - Find → Companies page rebuild

**Goal:** Replace the current `FirmSearchPage` contents (when embedded in Find tab) with the **Editorial Index** direction from the canvas.

### 3.1 Remove

From the current Find Companies panel, delete:
- "Here's where to start" collapsible card
- "Have somewhere in mind?" empty search-box widget
- Redundant "Search companies" button
- "Browse by category" three-tile grid
- Any orange "Best match" badge (replace with the `◆` diamond mark - single-color, oxblood)

### 3.2 Build

New page structure (single scrolling column, max-width 760px):

```
<PersonalizationStrip />            // seal + angle
<PageTitle lead={t.lead} accent={t.accent} />   // "Where your Redlands network went."
<Tabs active="companies" />
<StatsBar />                        // "3,200+ Redlands alumni tracked · ..."

<ScoutLede />                       // italic serif sentence, one line:
                                    //   "We'll start where Redlands alumni have landed before."

<ArchiveList>                       // the numbered list from Editorial Index
  {recommendations.map((r, i) => (
    <ArchiveRow
      num={String(i+1).padStart(2,'0')}
      name={r.company}
      sentence={r.scoutSentence}     // italic serif; { number } spans use brand navy
      sector={r.sector}
      city={r.city}
      onClick={() => openCompanyDrawer(r.id)}
    />
  ))}
</ArchiveList>

<FooterSearch />                    // single inked input, ⌘K hint, replaces all old search UI
```

### 3.3 Data

- Recommendations come from the existing firm-search backend. Extend the response with:
  - `scoutSentence: string` - pre-computed server-side (or via a lightweight client LLM call at request time), referencing the user's school *by name* and any resume specifics
  - `sector: string`
  - `city: string` (uppercased in display)
- Hard rule in the sentence generator: never output a demonym. The title is the only place demonyms appear. Sentences always use school name.

### 3.4 Keep

- Existing Tabs component (People / Companies / Hiring Managers)
- StatsBar is unchanged, just re-skinned
- Ask Scout button top-right

**Acceptance:** on a Redlands test user, the page renders with "UR" seal, Redlands-maroon color, title reads *"Where your Redlands network went."* (italic "went." with oxblood scribble), and the archive list shows Esri / Loma Linda / Kaiser with italic serif sentences that reference Redlands by name.

---

## Phase 4 - Visual QA matrix

Before merging, verify across at least **six** test users in a dev fixture:

| User | School | Expected title |
|---|---|---|
| Deena | USC | Where Trojans have *landed.* |
| Marcus | Michigan | Where Wolverines have *landed.* |
| Jordan | Redlands | Where your Redlands network *went.* |
| - | Reed | Where your Reed network *went.* (even though demonym=Griffins, confidence=low) |
| - | Macalester | Where your Macalester network *went.* |
| - | (no school set) | Existing no-school empty state |

For each: seal color, angle text, Scout note opening line, archive sentence language. Take screenshots; attach to the PR.

---

## Phase 5 - Rollout

1. Ship with flag **off** in prod. Enable for your own account first.
2. Enable for Redlands pilot cohort (query by `user.schoolId === "redlands"`).
3. Monitor: Scout-note read time, archive-row click rate, "edit angle" open rate. If angle edit rate is >40%, the resume-derived default is bad; investigate.
4. Enable for USC, then everyone.

---

## Explicitly out of scope for this PR

- Letterhead and Atlas directions from the canvas - park those as follow-ups
- Re-skinning My Network, Tracker, Meetings
- The Hiring Managers tab redesign
- Marketing pages

---

## Files touched (approximate)

**New:**
- `src/components/personalization/SchoolSeal.tsx`
- `src/components/personalization/PersonalizationStrip.tsx`
- `src/components/personalization/AngleEditor.tsx`
- `src/components/personalization/ScoutNote.tsx`
- `src/hooks/useSchool.ts`, `useSchoolTitle.ts`, `useUserPersonalization.ts`
- `src/lib/schools.ts`
- `src/pages/admin/DemonymReview.tsx`
- `scripts/seed_demonyms.ts`
- `data/schools_seed.csv`
- `src/styles/tokens.css`

**Modified:**
- `src/pages/FindPage.tsx` - inject `<PersonalizationStrip />` above title
- `src/pages/FirmSearchPage.tsx` - remove old widgets, render new ArchiveList
- `src/components/PageTitle.tsx` - accept `lead` / `accent` props
- `src/App.tsx` - wire feature flag to `<body data-find-v2>`
- `index.html` - fonts
- `tailwind.config.ts` - token extensions if using Tailwind classes

---

## Non-negotiables

1. **Never hardcode a demonym in component code.** Every demonym comes from `schools` collection via `useSchoolTitle()`.
2. **No runtime LLM calls** for demonym lookup. Ever. The LLM runs once in the seeder; prod reads a DB row.
3. **"Scout" sentences never use the demonym.** Only the page title is demonym-aware.
4. **The user can always override.** Settings → Personalization → "Call me a {demonym}" toggle, writes `users.personalization.preferDemonym`.
5. **Ship with the flag off.** No big-bang releases.

---

## Kickoff prompt (paste into Claude Code)

> I'm implementing the Find → Companies redesign + a Personalization Layer in `connect-grow-hire/`. Read `IMPLEMENTATION_PLAN_Find_Companies.md` end to end before doing anything. Also read `Find - Companies Aesthetic Improvements.html` from the design project to see the target look.
>
> Work phase by phase (0 → 5). Commit after each phase. After each phase, run existing tests, show me a diff summary, and wait for approval before starting the next.
>
> Start with Phase 0 - schema additions + the seeder script + the admin review UI. Do not touch any UI outside `/admin/demonyms` in Phase 0. Do not proceed to Phase 1 until I approve the seeded demonym data.
>
> Gate everything behind `VITE_FLAG_FIND_COMPANIES_V2`, default false. Ship with it off.
