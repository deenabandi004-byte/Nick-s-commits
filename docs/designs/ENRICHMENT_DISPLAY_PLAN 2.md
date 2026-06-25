# Contact Spreadsheet: Enrichment Data Display

**Date**: 2026-05-16
**Scope**: Show Perplexity enrichment data (talking points, recent activity) in Contact Spreadsheet
**Status**: Design approved, ready to implement

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout | Expand-in-place (accordion row) | Lightweight, keeps spreadsheet context, content is short |
| Trigger | Chevron icon in leftmost column | Avoids conflict with cell editing/selection |
| Empty state | Chevron only on enriched contacts | No disappointing empty expansions |

---

## Data Contract

Firestore fields on `users/{uid}/contacts/{contactId}`:

```
enrichmentTalkingPoints: string[]   // 3-5 items, e.g. "Recently promoted to VP"
enrichmentRecentActivity: string    // 1 sentence, e.g. "Led JPMorgan's Q1 analyst class"
```

These are written by `runs.py` (Find People) and `agent_actions.py` (Agent).
Older/imported contacts will NOT have these fields.

---

## UI Specification

### 1. Column Addition

Add a narrow (28px) column BEFORE the existing checkbox column:

```
| (chevron) | (checkbox) | A Name | B LinkedIn | C Email | D Company | E Role | F Match | G Status |
```

- The chevron column has NO header letter/label
- Contains a `ChevronRight` (16px, #9CA3AF) icon ONLY for rows where `enrichmentTalkingPoints` has 1+ items
- On expand: icon rotates 90deg to `ChevronDown` with a 150ms CSS transition
- Rows without enrichment: blank cell (no icon, no placeholder)

### 2. Expanded Row Content

When chevron is clicked, a detail section slides open below the row with `150ms ease-out` height animation.

```
┌──────────────────────────────────────────────────────────────┐
│  [Sparkles icon] Conversation Starters                       │
│                                                              │
│    * Recently promoted to VP of Equity Research              │
│    * Spoke at Wharton Finance Conference 2026                │
│    * Published paper on AI in trading                        │
│                                                              │
│  [Clock icon] Recent: Led JPMorgan's Q1 analyst class        │
└──────────────────────────────────────────────────────────────┘
```

**Visual specs:**
- Background: `#F8FAFC` (slightly lighter than the `#FAFBFF` page bg)
- Left border: 2px solid `#3B82F6` (brand blue, indented 28px from left)
- Padding: 12px 16px
- Font: DM Sans, 13px, color `#374151`
- Section label ("Conversation Starters"): 12px, `#6B7280`, uppercase tracking
- Bullet points: 13px, `#1F2937`, `list-style: disc`, `padding-left: 16px`
- Recent activity: 13px, `#4B5563`, italic, with a Clock icon (12px, `#9CA3AF`)
- Max height when expanded: none (content determines height)
- Only ONE row can be expanded at a time (expanding another collapses the previous)

### 3. Interactions

- **Click chevron**: Toggle expand/collapse for that row
- **Expanding a row**: Collapses any other expanded row (accordion behavior)
- **Keyboard**: Enter/Space on focused chevron toggles
- **No hover state** on the chevron — just cursor:pointer

### 4. Frontend Type Changes

Add to `Contact` interface in `firebaseApi.ts`:
```typescript
enrichmentTalkingPoints?: string[];
enrichmentRecentActivity?: string;
```

Add to `normalizeFromServer()` in `ContactDirectory.tsx`:
```typescript
enrichmentTalkingPoints: serverContact.enrichmentTalkingPoints || [],
enrichmentRecentActivity: serverContact.enrichmentRecentActivity || '',
```

### 5. Responsive (Mobile)

- On screens < 768px: the chevron column stays (28px is acceptable)
- The expanded detail section is full-width, same padding
- Bullet text wraps normally
- No behavioral changes

### 6. Accessibility

- Chevron button: `aria-expanded="true|false"`, `aria-controls="enrichment-{contactId}"`
- Expanded panel: `role="region"`, `aria-labelledby="enrichment-trigger-{contactId}"`
- Screen reader: "Show conversation starters for [Name]"

---

## NOT in scope

| Deferred | Rationale |
|----------|-----------|
| Showing warmthSignals in expansion | Already visible via Match column color |
| Showing email draft in expansion | Available via the email icon action |
| Showing user notes in expansion | Separate feature, different edit flow |
| "Refresh insights" button | Would require re-running Perplexity per contact |
| Agent dashboard enrichment display | Different component, different UX |

---

## Implementation Checklist

- [ ] Add `enrichmentTalkingPoints` and `enrichmentRecentActivity` to Contact type
- [ ] Update `normalizeFromServer()` to read the fields
- [ ] Add chevron column to `COL_DEFS` (or outside it, as a fixed narrow col)
- [ ] Add `expandedRowId` state to track which row is open
- [ ] Render expanded detail section conditionally below the active row
- [ ] Add 150ms height transition animation
- [ ] Test with 0, 1, 3, and 5 talking points
- [ ] Test with contacts that have NO enrichment (no chevron visible)
- [ ] Verify mobile layout at 375px
