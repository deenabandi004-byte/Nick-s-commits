# Implementation Plan v2 - Find Companies B+ Layout + Scout Intro Sentence

---

## Pre-work Findings

### CSS Token Audit

**File**: `connect-grow-hire/src/styles/tokens.css` (93 lines)

All core tokens are **already declared** at `:root`:

| Token | Current value | B+ spec value | Status |
|-------|--------------|---------------|--------|
| `--paper` | `#FFFFFF` | `#FDFDFD` | Declared. Slight difference (pure white vs near-white). |
| `--paper-2` | `#F7F7F5` | `#F6F5F1` | Declared. Close but not identical. |
| `--ink` | `#111318` | `#111418` | Declared. 1-digit off. |
| `--ink-2` | `#4A4F5B` | `#4A4F57` | Declared. Close. |
| `--ink-3` | `#8A8F9A` | `#8A8F97` | Declared. Close. |
| `--line` | `#E5E5E0` | `#E5E3DE` | Declared. Slight warm shift in spec. |
| `--line-2` | `#F0F0ED` | `#EFEDE8` | Declared. Slight warm shift in spec. |
| `--brand` | `#1B2A44` | `#1B2A44` | **Exact match.** |
| `--brand-2` | `#243656` | `#2A3D5C` | Declared. Different. |
| `--accent` | `#1B2A44` (navy) | `#8B2E1F` (oxblood) | **Major difference.** Current = navy, spec = oxblood. |

**Tailwind wiring** (`tailwind.config.ts` lines 70-82): Already configured to consume all tokens via `var(--xxx)`. Classes like `text-ink`, `bg-paper`, `border-line` all work.

**Decision**: Update `tokens.css` `:root` values to match the B+ spec exactly. The `--accent` change from navy to oxblood is the most visible - it affects `ScribbleUnderline` (which uses `var(--accent)` for stroke color). This is intentional per the spec: "USC oxblood - underline scribble, eyebrow accent."

**Risk**: `--accent` is also used by shadcn/ui in `index.css` as an HSL value (`--accent: 220 60% 98%`). These are different variable systems - shadcn uses HSL in `hsl(var(--accent))`, our tokens use hex in `var(--accent)`. They won't conflict because they're consumed differently, but we should verify no shadcn component accidentally uses the raw `var(--accent)`.

---

### Contract Shape Resolution

The B+ spec (§06) and Scout spec (§05) use different output shapes:

| B+ spec `company.scout` | Scout spec LLM output |
|---|---|
| `rung: "R1"` | `rung_used: "R1"` |
| `headline: "..."` | _(not present - this is the R4-tier aggregate sentence)_ |
| `detail: "..."` | `paragraph: "..."` |
| `short: "..."` | _(not present)_ |
| _(not present)_ | `facts_used: [...]` |
| _(not present)_ | `facts_omitted: [...]` |

**Canonical contract** (reconciled):

```typescript
// contract: keep in sync with backend/app/services/company_recommendations.py
interface ScoutSentence {
  rung: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  headline: string;     // Always present. R1-R3: aggregate stat. R4-R5: deterministic template.
  detail: string;       // Always present. R1-R3: named-path sentence. R4-R5: fit/context sentence.
  short: string;        // Compact form for list rows (1 line).
  facts_used: string[]; // For guardrail validation when LLM is active (Phase 5).
}
```

- `headline` = the italic serif sentence on the hero (B+ spec §04, "scout headline" tag)
- `detail` = the sans paragraph below the headline (B+ spec §04, "scout detail" tag) = `paragraph` from Scout spec
- `short` = compact version for list rows (B+ spec §05, line 2)
- `facts_used` = from Scout spec §05, empty array for deterministic templates, populated when LLM runs

**Python side**: dataclass or TypedDict matching this shape exactly, with the same header comment.

---

## Phase 1 - Backend: Scout Sentence Service + API Endpoint (deterministic R4/R5 only)

**Goal**: Ship the backend that produces the full data contract. No LLM calls. Deterministic templates only.

### 1.1 Shared contract definition

**New file**: `backend/app/models/company_recommendation.py`

```python
# contract: keep in sync with connect-grow-hire/src/types/companyRecommendation.ts

@dataclass
class ScoutSentence:
    rung: str           # 'R1'–'R5'
    headline: str       # italic serif headline (hero) or aggregate stat
    detail: str         # sans detail paragraph (hero) or fit sentence
    short: str          # compact 1-liner for list rows
    facts_used: list    # empty for R4/R5 deterministic, populated for LLM

@dataclass
class CompanyMark:
    letters: str        # 1-2 char monogram
    color: str          # hex color

@dataclass
class CompanyRecommendation:
    rank: int
    id: str
    name: str
    mark: CompanyMark
    sector: str
    city: str
    scout: ScoutSentence
```

### 1.2 Company marks (hand-coded, 15 companies)

**New file**: `backend/app/data/company_marks.py`

Hand-code marks for companies that will actually appear in hero slots:

```python
# Only the companies most likely to appear as hero for common user profiles.
# Everyone else falls back to first letter + --brand (#1B2A44).
COMPANY_MARKS = {
    "google":       {"letters": "G",  "color": "#4285F4"},
    "meta":         {"letters": "M",  "color": "#0668E1"},
    "apple":        {"letters": "A",  "color": "#000000"},
    "openai":       {"letters": "O",  "color": "#111418"},
    "anthropic":    {"letters": "A",  "color": "#D4A27F"},
    "disney":       {"letters": "D",  "color": "#0B1E3F"},
    "sequoia":      {"letters": "S",  "color": "#1B2A44"},
    "electronic arts": {"letters": "EA", "color": "#D93A2F"},
    "netflix":      {"letters": "N",  "color": "#E50914"},
    "stripe":       {"letters": "S",  "color": "#635BFF"},
    "amazon":       {"letters": "A",  "color": "#FF9900"},
    "microsoft":    {"letters": "M",  "color": "#00A4EF"},
    "goldman sachs": {"letters": "GS", "color": "#6F9CDE"},
    "jpmorgan":     {"letters": "JP", "color": "#003A70"},
    "mckinsey":     {"letters": "M",  "color": "#00457C"},
}
```

Fallback: `{"letters": name[0].upper(), "color": "#1B2A44"}`

### 1.3 Scout ladder (R4/R5 deterministic)

**New file**: `backend/app/services/company_recommendations.py`

```python
# contract: keep in sync with connect-grow-hire/src/types/companyRecommendation.ts

def run_scout_ladder(company, user, alumni_signal) -> ScoutSentence:
    """
    R1-R3: return None (no alumni-level data yet - stubs for future)
    R4: cohort stat available (alumni_count >= 3)
    R5: sector-only fallback
    """
```

**R4 templates** (deterministic, no LLM):
- headline: `"{count} {school} alumni work here in {field} roles - {recent} started this fall."`
- detail: `"A deep pipeline for {school} {field} students. No single warmest intro yet - but the numbers are strong."`
- short: `"{count} {school} alumni in {field} roles."`

**R5 templates** (deterministic, no LLM):
- headline: `"A {sector} company on your radar - tight fit for your {major} coursework."`
- detail: `"No tracked {school} alumni here yet - but the sector and location match your profile."`
- short: `"Tight fit for your {major} coursework."`

### 1.4 Recommendation scoring

Move the existing frontend scoring logic (`suggestionChips.ts:getRecommendedCompanies()`) to the backend service. Enrich with school affinity data (existing `school_affinity.py` service). Return top 5.

### 1.5 API endpoint

**New file**: `backend/app/routes/company_recommendations.py`

```
GET /api/companies/recommendations
Auth: @require_firebase_auth
Credit cost: 0

Response: {
  user: { name, school, seal, sealColor, major, location, demonym, demonymConfidence },
  stats: { alumni_tracked, jobs_indexed, last_updated },
  companies: CompanyRecommendation[5]
}
```

Register blueprint in `wsgi.py`.

**Files touched**:
- `backend/app/models/company_recommendation.py` (new)
- `backend/app/data/company_marks.py` (new)
- `backend/app/services/company_recommendations.py` (new)
- `backend/app/routes/company_recommendations.py` (new)
- `backend/wsgi.py` (register blueprint)

---

## Phase 2 - CSS Token Update + Frontend API Wiring + Types

**Goal**: Align tokens with B+ spec, wire the API, define the shared TS contract.

### 2.1 CSS token update

Update `connect-grow-hire/src/styles/tokens.css` `:root` values to match B+ spec:

```css
--paper:   #FDFDFD;    /* was #FFFFFF */
--paper-2: #F6F5F1;    /* was #F7F7F5 */
--ink:     #111418;    /* was #111318 */
--ink-2:   #4A4F57;    /* was #4A4F5B */
--ink-3:   #8A8F97;    /* was #8A8F9A */
--line:    #E5E3DE;    /* was #E5E5E0 */
--line-2:  #EFEDE8;    /* was #F0F0ED */
--brand-2: #2A3D5C;    /* was #243656 */
--accent:  #8B2E1F;    /* was #1B2A44 - oxblood replaces navy */
```

Also update the `legacy`, `stationery`, and `stationery-cream` theme blocks to stay consistent (or remove them if unused - check first).

**Verify**: No shadcn component breaks from the `--accent` change. shadcn uses `hsl(var(--accent))` where `--accent` is defined as HSL values in `index.css` (line 42: `--accent: 220 60% 98%`). Our tokens.css `--accent` is a hex value consumed via `var(--accent)` directly. These are two different `--accent` declarations - tokens.css `:root` will win over the `index.css` `:root`. Need to verify this doesn't break shadcn Accent colors. If it does, rename our token to `--st-accent` and update all references.

### 2.2 Shared TypeScript contract

**New file**: `connect-grow-hire/src/types/companyRecommendation.ts`

```typescript
// contract: keep in sync with backend/app/models/company_recommendation.py

export interface ScoutSentence {
  rung: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  headline: string;
  detail: string;
  short: string;
  facts_used: string[];
}

export interface CompanyMark {
  letters: string;
  color: string;
}

export interface CompanyRecommendation {
  rank: number;
  id: string;
  name: string;
  mark: CompanyMark;
  sector: string;
  city: string;
  scout: ScoutSentence;
}

export interface CompanyRecommendationsResponse {
  user: {
    name: string;
    school: string;
    seal: string;
    sealColor: string;
    major: string;
    location: string;
    demonym: string | null;
    demonymConfidence: string;
  };
  stats: {
    alumni_tracked: number;
    jobs_indexed: number;
    last_updated: string;
  };
  companies: CompanyRecommendation[];
}
```

### 2.3 API service method

Add to `connect-grow-hire/src/services/api.ts`:

```typescript
async getCompanyRecommendations(): Promise<CompanyRecommendationsResponse>
```

**Files touched**:
- `connect-grow-hire/src/styles/tokens.css` (update values)
- `connect-grow-hire/src/types/companyRecommendation.ts` (new)
- `connect-grow-hire/src/services/api.ts` (new method)

---

## Phase 3 - HeroCard + ListRow Components

**Goal**: Build the two core visual components per B+ spec §04 and §05.

### 3.1 `HeroCard` component

**New file**: `connect-grow-hire/src/components/find/HeroCard.tsx`

Props: `{ company: CompanyRecommendation }`

Layout per B+ spec §04 measurements:
- Eyebrow: `01 · START HERE` - mono 10px, 0.16em tracking, `--accent`, mb 14px
- Mark: 28px circle, company `mark.color` fill, serif italic letter 14px white, gap 12px to name
- Name: serif 28px, `--ink`, mb 16px
- Headline: serif italic 20px, `--ink`, lh 1.4, mb 12px - renders `scout.headline`
- Detail: sans 13px, `--ink-2`, lh 1.6, mb 18px - renders `scout.detail` with digit emphasis
- Meta: mono 9px, `--ink-3`, uppercase, city in `--brand` 500, mb 10px
- CTA: sans 12px, `--brand` 500, "Find contacts →"

### 3.2 Refactor `ArchiveRow` to match ListRow spec

**Modify**: `connect-grow-hire/src/components/find/ArchiveRow.tsx`

Changes from current:
- **Remove**: ArrowRight icon, company logo img, sector tag
- **Add**: Mark circle (22px, same as hero but smaller)
- **Grid**: `24px 22px 1fr` (number, mark, content)
- **Line 1**: name (sans 13px 500 `--ink`) + city (mono 9px uppercase `--ink-3`), flex space-between, mb 6px
- **Line 2**: `scout.short` in serif italic 13px `--ink-2`, lh 1.5, with digit emphasis
- **Hover**: name color → `--brand`, 120ms transition. No background change.
- **Focus**: 2px `--accent` outline, offset 2px
- **Dividers**: `border-top: 1px solid var(--line-2)` between rows only. No border on first row top or last row bottom.

### 3.3 Update `ArchiveList` interface

**Modify**: `connect-grow-hire/src/components/find/ArchiveList.tsx`

- Change `ArchiveItem` to accept `CompanyRecommendation` directly
- Remove outer border/border-radius container (spec says no card backgrounds)
- Pass `company` object to `ArchiveRow` instead of destructured strings

### 3.4 Digit emphasis utility

```typescript
// Wraps runs of digits in scout sentences with emphasized styling.
// v1: emphasize ALL digit runs (serif italic → sans + --brand + 600).
// Known limitation: when R1-R3 with facts_used is active, revisit to
// emphasize only digits corresponding to real facts.
function renderScoutSentence(text: string): ReactNode
```

**Files touched**:
- `connect-grow-hire/src/components/find/HeroCard.tsx` (new)
- `connect-grow-hire/src/components/find/ArchiveRow.tsx` (refactor)
- `connect-grow-hire/src/components/find/ArchiveList.tsx` (update interface)

---

## Phase 4 - Page Assembly + States + Responsive

**Goal**: Wire everything into FirmSearchPage landing state. Do NOT touch the search results view.

### 4.1 FirmSearchPage landing state

When the user lands on Companies tab with no active search, render:

```tsx
<ResultsGrid>  {/* grid: 1.15fr 1fr, gap 48px, border-top 1px solid var(--line) */}
  <HeroCard company={companies[0]} />
  <ListColumn>
    <ListHeader />  {/* "Four more, ranked by fit" - mono 9px uppercase --ink-3 */}
    {companies.slice(1).map(c => <ListRow key={c.id} company={c} />)}
  </ListColumn>
</ResultsGrid>
<FooterSearch />  {/* existing component - text link "Search for a specific company →", expands on click */}
```

Data fetch: React Query calling `apiService.getCompanyRecommendations()`, stale 5min, cache 10min.

### 4.2 States (B+ spec §08 + error state)

| State | Render |
|-------|--------|
| **Default** | Hero + 4 list rows + footer link (collapsed) |
| **Loading** | Skeleton blocks in `--paper-2` matching text heights. No spinner. |
| **No companies** | Italic serif centered: "Scout is still reading your resume - check back in a minute." |
| **Error** | Same copy as no-companies: "Scout is still reading your resume - check back in a minute." No stack trace, no blank page. |
| **Hero only (1 company)** | Single column, hero spans full width, max-width 720px |
| **Search expanded** | Footer link replaced by input with bottom border, autofocus |
| **Row hover** | Name color → `--brand`, 120ms. No background change, no scale. |
| **Row focus (keyboard)** | 2px `--accent` outline, offset 2px |

### 4.3 Responsive (B+ spec §09)

| Width | Behavior |
|-------|----------|
| >= 960px | Full 2-col layout as specified |
| 720-959px | Single column. Hero on top, list below. 48px vertical gap. |
| < 720px | Content padding 32px 20px. Row grid 20px 18px 1fr. Hero name 24px. |

### 4.4 Accessibility (B+ spec §10)

- Every row is `<a>` or `<button>` with semantic role, not a div with onClick
- Hero mark: `aria-hidden="true"`
- Focus visible on all interactive elements
- Tab order: Topbar → tabs → Ask Scout → Hero CTA → List rows → Footer search

### 4.5 Scope discipline

The two-column layout is the **landing state only**. Once a search is triggered (via row click, hero CTA, or footer search), the existing search results UI takes over unchanged. If anything in the build surfaces a reason to change the search results view, flag it and stop.

**Files touched**:
- `connect-grow-hire/src/pages/FirmSearchPage.tsx` (refactor landing state)
- Possibly `connect-grow-hire/src/pages/FindPage.tsx` (minor, if needed)

---

## Phase 5 - LLM Variation for Hero Detail (post-UI ship)

**Goal**: Add LLM-assisted phrasing variation to the hero detail paragraph. Ship after the deterministic UI is live and rendering real data.

### 5.1 LLM call for hero detail

Only the hero (#1 ranked) company gets an LLM-varied detail paragraph. List rows always use deterministic `short`.

Use the prompt from Scout Spec §05, adapted for R4/R5:
- System prompt: "You are Scout, a careful editorial voice..."
- User prompt: rung, user context, company, alumni signal
- Output: strict JSON `{ paragraph, rung_used, facts_used, facts_omitted }`
- If LLM returns `paragraph: null`, fall back to deterministic template

### 5.2 Cache key

Key: `{company_id}_{school}_{major}_{rung}` - **not per-user**. R4/R5 output doesn't vary per user, only per school+major+company. This gives cross-user cache hits at scale.

TTL: 7 days. Store in Firestore `scoutSentenceCache` collection.

### 5.3 Render-time guardrails (Scout Spec §06)

Before painting the LLM paragraph:
- **Number whitelist**: every digit/spelled-out number must correspond to a value in `facts_used`
- **Name whitelist**: only names from `alumni_signal.closest_path.name` allowed (R1-R3 only, N/A for R4/R5)
- **Rejection cascade**: if validation fails twice at the same rung, drop to deterministic template. Do not retry LLM a third time.

### 5.4 Staleness stamp

If a fact comes from a record with `verified_at > 90 days`, append "(verified in {month})" in mono 9px under the paragraph.

**Files touched**:
- `backend/app/services/company_recommendations.py` (add LLM call + cache + guardrails)
- `backend/app/services/openai_client.py` (if new helper needed)

---

## Phase 6 - Observability + Polish

**Goal**: Metrics from Scout Spec §07, analytics, final QA.

### 6.1 Backend logging

| Metric | Target | Alert |
|--------|--------|-------|
| R4 fire rate | 60-80% (expected for v1) | < 40% - school affinity broken |
| R5 fire rate | 20-40% (expected for v1) | > 60% - thin user profiles |
| LLM call latency (Phase 5) | < 2s | > 5s - model/prompt issue |
| Cache hit rate (Phase 5) | > 70% | < 40% - TTL too short or key too specific |
| Guardrail rejection (Phase 5) | < 2% | > 5% - prompt drifting |

### 6.2 Frontend PostHog events

- `companies_recommendations_loaded` - `{ company_count, rung_distribution: {R4: n, R5: n} }`
- `companies_hero_cta_clicked` - `{ company_id, rung }`
- `companies_list_row_clicked` - `{ company_id, rank, rung }`
- `companies_footer_search_expanded`

### 6.3 Visual QA matrix

| User | School | Expected title | Expected hero rung |
|------|--------|---------------|-------------------|
| Deena | USC | Where Trojans have *landed.* | R4 (school affinity data) |
| Marcus | Michigan | Where Wolverines have *landed.* | R4 |
| Jordan | Redlands | Where your Redlands network *went.* | R5 (thin affinity) |
| - | Reed | Where your Reed network *went.* | R5 |
| - | (no school) | NoSchoolEmptyState | - |

For each: seal color, hero headline text, list row sentences, digit emphasis, responsive at 3 breakpoints. Screenshots attached to PR.

**Files touched**:
- Backend: logging additions in `company_recommendations.py`
- Frontend: PostHog calls in `FirmSearchPage.tsx`

---

## Explicitly Out of Scope

- R1-R3 of the scout ladder (requires alumni-level data: team, responsiveness, privacy consent)
- Demonym admin review UI / seeder script (from previous implementation plan - deferred)
- Search results view changes - if something needs to change there, flag and stop
- Re-skinning other tabs (People, Hiring Managers)
- PersonalizationStrip, AngleEditor, ScoutNote components (from previous plan - deferred)
- Feature flag gating - ship directly, no flag wrapper

---

## Non-negotiables

1. **One canonical contract shape** defined in both `backend/app/models/company_recommendation.py` and `connect-grow-hire/src/types/companyRecommendation.ts` with header comments pointing to each other.
2. **No LLM calls in Phases 1-4.** Deterministic R4/R5 templates only. LLM added in Phase 5.
3. **Digit emphasis v1**: emphasize all digit runs. Document as known limitation for R1-R3.
4. **Error state = empty state copy.** No stack traces, no blank pages.
5. **Landing state only.** Do not touch the search results view.
6. **15 hand-coded company marks.** Everyone else gets first-letter + `--brand` fallback.
