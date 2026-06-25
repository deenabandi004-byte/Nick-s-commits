# For Students Landing Page — Handoff

You are picking up an in-flight landing-page redesign. This doc gives you full context so you can continue without re-reading the conversation it came from.

---

## 1. What this is

Offerloop (`/Users/rylanbohnett/Downloads/Final_offerloop`) is a Flask + React + Chrome-extension monorepo. The frontend SPA lives in `connect-grow-hire/`. See the project's `CLAUDE.md` for full architecture.

Current branch: `pr1-loops-prompt-combo`. Dev server runs on `http://localhost:8080`.

The user (Rylan, CMO, USC '27 — owns SEO/content/growth, not code) is widening the funnel by splitting the landing into two views:

- `/` → "For Anyone" view (existing `Index.tsx`, broad clado.ai-inspired pitch)
- `/for-students` → student-targeted view (new `ForStudentsPage.tsx`, built from a Figma mockup)

The two pages share a navbar with a persona toggle (`For Anyone | For Students`) absolutely centered in the banner. The active link gets a brand-blue color + underline.

---

## 2. Source of truth: Figma

- **File:** Offerloop x PS Main File
- **Key:** `mzL5XPw3VFciHDs6RG7SAb`
- **Primary node for the For Students design:** `2081:15657` (frame name: "V. 10 — HTML synced")
- **Section that contains all variants + boards:** `2081:15934`
- **Project board overview:** `1860:9499`
- **URL:**
  ```
  https://www.figma.com/design/mzL5XPw3VFciHDs6RG7SAb/Offerloop-x-PS-Main-File?node-id=2081-15657
  ```

Use the `plugin:figma:figma` MCP tools to fetch nodes — `get_design_context` for code, `get_screenshot` for visual reference. **Always invoke the `/figma-use` skill before calling `use_figma`.**

To download fresh assets: `mcp__framelink-figma__download_figma_images` with `localPath: connect-grow-hire/src/assets/for-students`.

---

## 3. Files in scope

### New
- `connect-grow-hire/src/pages/ForStudentsPage.tsx` — the new landing page (~900 lines, inline styles + Tailwind classes matching project conventions)
- `connect-grow-hire/src/assets/for-students/` — downloaded Figma assets:
  - `mountains-lake.png` (hero backdrop)
  - `cta-mountain.png` (final CTA illustration)
  - `hero-yeti.png` (Yeti character)
  - `hero-product.png` (Discover Opportunities mockup)
  - `linkedin-extension.png` (LinkedIn screenshot)
  - `scout-sticky.png` (Scout character in the sticky note)
  - `how-it-works-find.png`
  - `highlight-wash.png` (watercolor strike — used only in the pull quote)

### Modified
- `connect-grow-hire/src/App.tsx` — added lazy import + `/for-students` route under `PublicRoute` near line 233
- `connect-grow-hire/src/pages/Index.tsx` — navbar reworked: For Students link removed, persona toggle inserted, Create Account button removed, Sign in shifted right
- `connect-grow-hire/public/sitemap.xml` — added `https://www.offerloop.ai/for-students` entry near the root entry

### Deleted
- `connect-grow-hire/src/components/LandingPersonaShelf.tsx` — earlier iteration mounted a separate shelf row. User changed direction; toggle now lives in the navbar directly. Component is gone.

### Reused (no edits)
- Existing landing-page screenshots in `connect-grow-hire/src/assets/` (`findhiringmanagerlandingpage.png`, `emailoutreach.png.png`, `coffeechatlandingpage.png`, `findcompanylandingpage.png`) for the 4 How-It-Works step previews
- University logos in `connect-grow-hire/src/assets/` (USC, UCLA, NYU, Stanford, Berkeley, Michigan, Notre Dame, Wharton, Georgetown, Dartmouth)
- Real student photos: `David-Ji.jpeg`, `Jackson-Leck.jpeg`, `Sarah-Ucuzoglu.jpeg`, `Dylan-Roby.jpeg`
- Company logos: `Blackstone.png`, `PwC.png`, `Googlelogo.png`
- `landing-thumbtack.png` — used on the "With Offerloop" comparison card + Scout sticky

---

## 4. Current rendered state of `/for-students`

Top to bottom:

1. **Navbar** (shared with Index.tsx) — Offerloop logo (left), persona toggle absolutely centered, Sign in (right). No Pricing / About / Create Account.
2. **Hero** — "Your next *Offer* starts with us" + subhead + Sign up with Google button. Product mockup with Yeti peeking from behind the right edge (z-index behind, partially clipped by card). Mountains+lake backdrop with a long mask fade + atmospheric haze gradient bleeding into the trust band.
3. **University trust band** — auto-scrolling logo carousel (triplicated content for seamless loop), edge fade via CSS mask, pauses on hover. Full color, not desaturated.
4. **Pull quote** — centered, opening `"` mark in serif. Watercolor wash highlights under "Got my Deloitte offer" and "in a single afternoon" using the Figma `highlight-wash.png` asset. Scout sticky note positioned absolutely on the right, rotated 8°, with thumbtack at top.
5. **How It Works** — 4 steps clickable + hover-activated. Right panel swaps screenshot + eyebrow + description. Active step uses indigo bg on the number tile.
6. **The Math** — "20 minutes" comparison cards. Without (1, 2 muted) vs With Offerloop (200, 120 highlighted). Thumbtack with gentle pulse animation on the With card.
7. **Chrome extension** — "Offerloop works inside LinkedIn." Image is wrapped in a Chrome window frame (traffic lights + URL bar) so it doesn't read as cropped.
8. **Stories** — auto-scrolling carousel, 4 real students with matching photos (David Ji / FedEx, Jackson Leck / Blackstone, Sarah Ucuzoglu / PwC, Dylan Roby / Class of 2026). Pauses on hover.
9. **Final CTA** — mountain illustration + "Land your *next Offer.*" + Get started button.
10. **Dark navy footer** — `#0F172A` bg. Offerloop wordmark in Lora + tagline. Social row: Instagram, LinkedIn, X, TikTok. Three columns (Company / Resources / Features).

### Visual system tokens (sampled from Figma)

```ts
const C = {
  pageBg:        '#F5F6F8',
  ink:           '#003262',  // primary headings
  inkSubtle:     '#4D619F',  // italic accent words
  brand:         '#2563EB',
  primaryBtn:    '#4C62A8',
  primaryBtnHover: '#3D5293',
  body:          '#475569',
  muted:         '#64748B',
  cardBg:        '#F7F9FE',
  cardBorder:    '#E2E8F0',
  eyebrow:       '#6478B4',
  divider:       '#EEF2F8',
  navBlue:       '#4A5E80',
  mountainHaze:  '#DCE6F2',  // bleed color into trust band
};
```

Fonts: Libre Baskerville (headings, italic accents), Inter (body), Lora (big numbers + footer wordmark).

### Highlight rules (important — user has called this out twice)

- The Figma uses watercolor highlights **only on the pull quote section** (under "Got my Deloitte offer" and "in a single afternoon"). Everywhere else, italic accent words are just italic + `#4D619F` color.
- Two components:
  - `<Highlight>` — italic + muted blue, no wash. Used for `Offer`, `busy work`, `20 minutes`, `Offerloop` (in extension headline), `the offer`, `next Offer.`
  - `<Wash>` — real watercolor PNG wash. Used only in the pull quote.
- Don't add watercolor washes anywhere else. The user explicitly rejected that.

---

## 5. Iteration history (decisions made, don't undo)

1. Persona toggle started as a separate shelf row below the navbar. **User moved it into the navbar.** Pricing + About links are out of the navbar entirely; they live in the footer.
2. Create Account button removed from the navbar. **Only "Sign in" remains, right-aligned.**
3. Toggle is plain inline text links with brand-blue underline on active. Not a pill group, not a tab strip. Clado.ai-style.
4. Toggle is **absolutely centered** in the banner via `position: absolute; left: 50%; transform: translate(-50%, -50%)`.
5. Yeti went through three positions: above the product (wrong), peeking down over the top (wrong), peeking from behind the right edge (correct, matches Figma).
6. Yeti float animation **removed** — user said "stop it from floating."
7. The "300+ students" avatar cluster pill was **removed** entirely.
8. Dot grid is the actual page background (no vignette mask). `radial-gradient(rgba(15, 37, 69, 0.13) 1.4px, transparent 1.6px)` at 24px spacing.
9. Mountain backdrop transitions smoothly via a long gradient mask + a follow-on `mountainHaze` gradient that bleeds into the trust band. No more abrupt edge.
10. University logos are full-color (no grayscale filter). They carousel and pause on hover.
11. Stories carousel uses 4 students whose names match their photos. Maya Patel and Liam Chen (placeholder dupes) are gone.
12. How It Works is interactive — step buttons on the left, content panel on the right swaps on click + hover.
13. Footer is dark navy with social icons. Brand block uses Lora wordmark, not the PNG logo.

---

## 6. Known issues / placeholders

- **FedEx logo** is missing locally — the David Ji story card falls back to the text "FedEx". If you find a FedEx PNG, drop it in `connect-grow-hire/src/assets/` and pass it as `logoSrc` in the `STORIES` array in `ForStudentsPage.tsx`.
- **Pre-existing console warnings** (not from this work): `TimeComparison.tsx:83` has a React `key` warning; PostHog env vars aren't set in dev. Ignore both.
- **Sitemap canonical mismatch** is pre-existing: `sitemap.xml` uses `www.offerloop.ai` but `CLAUDE.md` says canonical is non-www. Not your problem unless asked.

---

## 7. How to verify changes

```bash
cd /Users/rylanbohnett/Downloads/Final_offerloop/connect-grow-hire
npm run dev    # http://localhost:8080
```

Then check:
- `http://localhost:8080/` — homepage, persona toggle should show "For Anyone" active (blue + underline)
- `http://localhost:8080/for-students` — student page, "For Students" active

For screenshots, prefer the `gstack browse` tool with chained commands so the server doesn't restart mid-flow:

```bash
B=~/.claude/skills/gstack/browse/dist/browse
$B chain '[
  ["goto","http://localhost:8080/for-students"],
  ["wait","--networkidle"],
  ["js","document.querySelectorAll(`.reveal`).forEach(e=>e.classList.add(`visible`))"],
  ["screenshot","/tmp/fs.png"]
]'
```

The `.reveal` force-show is important because the page uses an IntersectionObserver-based reveal animation that keeps off-screen elements at `opacity: 0`. Full-page screenshots without forcing this look mostly blank below the fold.

---

## 8. User's voice / preferences (from auto-memory)

- **No AI voice.** Content must feel human, not AI-polished. Integrate the product naturally throughout.
- **Piece-by-piece workflow.** User has a Job Board redesign and Tracker redesign on this branch already, built in sibling files awaiting a "go" to swap. Follow the same pattern when in doubt — build alongside, swap when ready.
- **No fake numbers on the job board.** Standing rule across the site: never render a number on the UI unless computed from real data we own. Doesn't apply to the For Students landing page (which uses Figma's "200" / "120" comparison numbers — those are aspirational, not user-data).
- **Direct tone.** Short responses. State results and decisions, don't narrate. End-of-turn summary is 1–2 sentences.

---

## 9. What might come next

Possible follow-ups the user could ask for (based on the conversation trajectory):

- More Figma-fidelity passes (compare rendered page against `get_screenshot` of node `2081:15657`)
- Dropping the Stories carousel back to a static 3-card row if they decide to match Figma over carousel
- Pulling in more real student photos to expand the carousel
- Hooking the For Students page into specific SEO landing template routes (`/networking/:slug`, `/alumni/:slug`) — possibly canonicaling those at `/for-students` instead of `/`
- Building the same banner pattern (persona toggle, dark footer) on other public pages so the site feels cohesive
- A "Build approach" decision: per memory, user prefers sibling-file workflows. If they want to redo any section, build it as a sibling and swap.

---

## 10. Quick reference — commands you'll use

```bash
# Type-check (uses project tsconfig)
cd connect-grow-hire && npx tsc --noEmit

# Backend tests (not relevant to this work but listed for completeness)
cd backend && pytest tests/

# Look at routes
LIST_ROUTES=1 python backend/wsgi.py

# Dev server
cd connect-grow-hire && npm run dev

# Browse (gstack skill)
B=~/.claude/skills/gstack/browse/dist/browse
$B goto http://localhost:8080/for-students
$B snapshot -i           # interactive elements with @e refs
$B click @e3             # click by ref
$B screenshot /tmp/x.png
```

That's the lot. Read `ForStudentsPage.tsx` end-to-end before making any structural change — it has a lot of inline-styled sections that look repetitive but each one matches a specific Figma block.
