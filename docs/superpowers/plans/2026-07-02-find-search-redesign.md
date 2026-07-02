# Find Page RocketReach-Style Layout Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `/find` into a RocketReach-style layout — left filter rail mirroring each tab's real parser output, fill-in-the-blank starter prompts, copy renames — with zero change to search behavior.

**Architecture:** The rail is a *display + override layer* on top of the existing prompt-search flows. Both backends already parse prompts into structured filters and return them (`parsed_query` for People, `parsedFilters` for Companies); we surface those as editable chips, and chip edits re-run the same endpoints with a new optional `filters` override object that the backend shallow-merges over its parse. State lives in `FindPage` (single owner); each embedded search page reports parsed filters up via callback and re-searches when a nonce bumps.

**Tech Stack:** React 18 + TypeScript (no frontend tests — verify via `tsc` + build + manual QA), Flask + pytest backend.

**Spec:** `docs/superpowers/specs/2026-07-02-find-search-redesign-design.md`

## Global Constraints

- **Search behavior is locked.** Silent dedupe of saved contacts, the find→emails→Draft flow, the search-bar-slides-up interaction, credits/tier caps (People 3/8/15, Companies 10/25/50), 0-result Scout flow: all byte-for-byte unchanged. Absent/empty `filters` must produce identical behavior to today.
- Batch-size selector stays exactly where it is (next to the search bar), both tabs.
- No scope toggle, no "Save This Search", no relocating recent searches.
- Filter dimensions are exactly the parser's: People = titles/companies/locations/schools/industries; Companies = industry/location/size(small|mid|large|none)/keywords. Nothing invented.
- Copy renames only: "View in spreadsheet" → "View in Contacts" (People) / "View in Companies" (Companies).
- Offerloop styling: reuse existing inline-style tokens (`var(--accent)`, `var(--ink)`, `var(--line)`, etc.). Mountains hero, PageTitle, TrialBanner untouched.
- Do NOT touch the dev-preview render tree in `FindPage.tsx` (the `IS_DEV_PREVIEW` branch around lines 100–230) — it's a designer sandbox with a different tab bar.
- Frontend: any new React-dependent npm package must go in the `vendor-react` chunk in `vite.config.ts` — but this plan adds **no** new packages.
- Commit after every task. Never commit unrelated modified files (the branch has many); `git add` only the paths named in the task.

---

### Task 1: Backend filter-override helper

**Files:**
- Create: `backend/app/services/filter_overrides.py`
- Test: `backend/tests/test_filter_overrides.py`

**Interfaces:**
- Produces: `apply_people_filters(parsed: dict, filters: dict | None) -> dict` and `apply_firm_filters(parsed: dict, filters: dict | None) -> dict`. Contract: a key **present** in `filters` replaces the parsed value entirely (an empty list clears that dimension); an absent key leaves the parse untouched; non-dict `filters` is a no-op. Lists capped at 5 items, strings truncated to 100 chars, non-strings dropped, `size` restricted to the parser enum.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_filter_overrides.py
"""Unit tests for the filter-override merge used by /prompt-search and firm search."""
import pytest

from app.services.filter_overrides import apply_people_filters, apply_firm_filters

pytestmark = pytest.mark.unit


def _parsed_people(**over):
    base = {
        "companies": ["Google"],
        "title_variations": ["Software Engineer"],
        "locations": ["New York"],
        "schools": ["USC"],
        "industries": ["technology"],
        "company_context": "big tech",
        "confidence": "high",
    }
    base.update(over)
    return base


class TestPeopleOverrides:
    def test_present_key_replaces_parsed_dimension(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["Airbnb"]})
        assert out["companies"] == ["Airbnb"]
        assert out["title_variations"] == ["Software Engineer"]  # untouched

    def test_titles_key_maps_to_title_variations(self):
        out = apply_people_filters(_parsed_people(), {"titles": ["Product Manager"]})
        assert out["title_variations"] == ["Product Manager"]

    def test_empty_list_clears_dimension(self):
        out = apply_people_filters(_parsed_people(), {"companies": []})
        assert out["companies"] == []

    def test_absent_key_keeps_parse(self):
        out = apply_people_filters(_parsed_people(), {"locations": ["Chicago"]})
        assert out["companies"] == ["Google"]
        assert out["schools"] == ["USC"]

    def test_list_capped_at_five(self):
        out = apply_people_filters(_parsed_people(), {"companies": [f"C{i}" for i in range(9)]})
        assert len(out["companies"]) == 5

    def test_strings_truncated_to_100_chars(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["x" * 300]})
        assert len(out["companies"][0]) == 100

    def test_non_string_items_dropped(self):
        out = apply_people_filters(_parsed_people(), {"companies": [42, None, "Stripe", {"a": 1}]})
        assert out["companies"] == ["Stripe"]

    def test_blank_strings_dropped(self):
        out = apply_people_filters(_parsed_people(), {"companies": ["  ", "Stripe"]})
        assert out["companies"] == ["Stripe"]

    def test_unknown_keys_ignored(self):
        out = apply_people_filters(_parsed_people(), {"salary": ["1M"], "companies": ["Stripe"]})
        assert "salary" not in out
        assert out["companies"] == ["Stripe"]

    def test_non_dict_filters_is_noop(self):
        parsed = _parsed_people()
        assert apply_people_filters(parsed, None) == parsed
        assert apply_people_filters(parsed, "junk") == parsed
        assert apply_people_filters(parsed, []) == parsed

    def test_does_not_mutate_input(self):
        parsed = _parsed_people()
        apply_people_filters(parsed, {"companies": ["Stripe"]})
        assert parsed["companies"] == ["Google"]

    def test_non_list_value_for_list_key_ignored(self):
        out = apply_people_filters(_parsed_people(), {"companies": "Stripe"})
        assert out["companies"] == ["Google"]  # invalid shape → keep parse


def _parsed_firm(**over):
    base = {"industry": "investment banking", "location": "New York",
            "size": "mid", "keywords": ["healthcare"]}
    base.update(over)
    return base


class TestFirmOverrides:
    def test_industry_string_override(self):
        out = apply_firm_filters(_parsed_firm(), {"industry": "consulting"})
        assert out["industry"] == "consulting"
        assert out["location"] == "New York"

    def test_industry_cleared_with_none(self):
        out = apply_firm_filters(_parsed_firm(), {"industry": None})
        assert out["industry"] is None

    def test_size_enum_enforced(self):
        assert apply_firm_filters(_parsed_firm(), {"size": "large"})["size"] == "large"
        assert apply_firm_filters(_parsed_firm(), {"size": "gigantic"})["size"] == "none"

    def test_keywords_capped_and_cleaned(self):
        out = apply_firm_filters(_parsed_firm(), {"keywords": [1, "m&a", "  ", "tech"] + ["k"] * 9})
        assert out["keywords"][:2] == ["m&a", "tech"]
        assert len(out["keywords"]) <= 5

    def test_location_string_truncated(self):
        out = apply_firm_filters(_parsed_firm(), {"location": "y" * 300})
        assert len(out["location"]) == 100

    def test_non_dict_filters_is_noop(self):
        parsed = _parsed_firm()
        assert apply_firm_filters(parsed, None) == parsed

    def test_unknown_keys_ignored(self):
        out = apply_firm_filters(_parsed_firm(), {"revenue": "huge"})
        assert "revenue" not in out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest tests/test_filter_overrides.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.filter_overrides'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/services/filter_overrides.py
"""
Merge explicit user filter-rail edits over LLM-parsed search queries.

Contract (shared by /prompt-search and firm search):
- A key PRESENT in `filters` replaces the parsed value entirely — an empty
  list deliberately clears that dimension (the user removed the chip).
- An absent key leaves the parsed value untouched.
- Non-dict `filters`, wrong-shaped values, and unknown keys are ignored.
"""
from typing import Any, Dict, Optional

LIST_CAP = 5
STR_CAP = 100

# rail key -> parsed-query key (People search)
_PEOPLE_KEY_MAP = {
    "titles": "title_variations",
    "companies": "companies",
    "locations": "locations",
    "schools": "schools",
    "industries": "industries",
}

_FIRM_SIZES = ("small", "mid", "large", "none")


def _clean_str(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    s = value.strip()[:STR_CAP]
    return s or None


def _clean_str_list(values: Any) -> Optional[list]:
    """Sanitize a list override. Returns None for wrong shapes (keep parse);
    returns a (possibly empty) list for a valid override."""
    if not isinstance(values, list):
        return None
    out = []
    for v in values:
        s = _clean_str(v)
        if s:
            out.append(s)
        if len(out) >= LIST_CAP:
            break
    return out


def apply_people_filters(parsed: Dict[str, Any], filters: Any) -> Dict[str, Any]:
    if not isinstance(filters, dict):
        return parsed
    out = dict(parsed)
    for rail_key, parsed_key in _PEOPLE_KEY_MAP.items():
        if rail_key in filters:
            cleaned = _clean_str_list(filters[rail_key])
            if cleaned is not None:
                out[parsed_key] = cleaned
    return out


def apply_firm_filters(parsed: Dict[str, Any], filters: Any) -> Dict[str, Any]:
    if not isinstance(filters, dict):
        return parsed
    out = dict(parsed)
    if "industry" in filters:
        out["industry"] = _clean_str(filters["industry"])
    if "location" in filters:
        out["location"] = _clean_str(filters["location"])
    if "size" in filters:
        out["size"] = filters["size"] if filters["size"] in _FIRM_SIZES else "none"
    if "keywords" in filters:
        cleaned = _clean_str_list(filters["keywords"])
        if cleaned is not None:
            out["keywords"] = cleaned
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest tests/test_filter_overrides.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/filter_overrides.py backend/tests/test_filter_overrides.py
git commit -m "feat(find): filter-override merge helper for prompt + firm search"
```

---

### Task 2: Wire `filters` into `/api/prompt-search`

**Files:**
- Modify: `backend/app/routes/runs.py` (parse block ~line 219–231, payload ~line 294–299)
- Test: `backend/tests/test_filter_overrides.py` (add guard test), manual curl check

**Interfaces:**
- Consumes: `apply_people_filters` from Task 1.
- Produces: `/api/prompt-search` accepts optional `filters: {titles?, companies?, locations?, schools?, industries?}` (each `string[]`); response `parsed_query` now also includes `schools` and `industries` (all five rail dims).

- [ ] **Step 1: Add the import**

In `backend/app/routes/runs.py`, alongside the existing service imports at the top of the file:

```python
from app.services.filter_overrides import apply_people_filters
```

- [ ] **Step 2: Merge overrides after the confidence gate**

Immediately after the `if parsed.get("confidence") == "low":` return block (ends ~line 230), insert:

```python
        # Filter-rail edits override the parse (spec: filter rail ⇄ prompt sync).
        # A present key replaces the parsed dimension; empty list clears it.
        filters_override = data.get("filters")
        if filters_override:
            parsed = apply_people_filters(parsed, filters_override)
            if not any(
                parsed.get(k)
                for k in ("companies", "title_variations", "locations", "schools", "industries")
            ):
                return jsonify({
                    "error": "Your search needs at least one filter. Add a job title, company, location, school, or industry.",
                    "parsed_query": {k: parsed.get(k, []) for k in ("companies", "title_variations", "locations", "schools", "industries")},
                }), 400
```

- [ ] **Step 3: Extend `parsed_query_payload` to all five dims**

At ~line 294, change:

```python
        parsed_query_payload = {
            "companies": parsed.get("companies", []),
            "title_variations": parsed.get("title_variations", []),
            "locations": parsed.get("locations", []),
            "company_context": parsed.get("company_context", ""),
        }
```

to:

```python
        parsed_query_payload = {
            "companies": parsed.get("companies", []),
            "title_variations": parsed.get("title_variations", []),
            "locations": parsed.get("locations", []),
            "schools": parsed.get("schools", []),
            "industries": parsed.get("industries", []),
            "company_context": parsed.get("company_context", ""),
        }
```

- [ ] **Step 4: Verify nothing else breaks**

Run: `cd backend && python3 -m pytest tests/test_search_pipeline.py tests/test_prompt_routing.py tests/test_filter_overrides.py -v`
Expected: all PASS (these cover the prompt-search pipeline; the payload keys are additive).

Run: `cd backend && python3 -c "import app.routes.runs"`
Expected: no import error.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/runs.py
git commit -m "feat(find): /prompt-search accepts filter-rail overrides, parsed_query exposes all 5 dims"
```

---

### Task 3: Wire `filters` into firm search

**Files:**
- Modify: `backend/app/utils/validation.py` (`FirmSearchRequest`, line 45–58)
- Modify: `backend/app/services/company_search.py` (`search_firms`, line 1083–1122)
- Modify: `backend/app/routes/firm_search.py` (both `search_firms(...)` call sites, lines 183 and 469)
- Test: `backend/tests/test_filter_overrides.py` already covers merge; add a `search_firms` override test to `backend/tests/test_firm_search_overrides.py`

**Interfaces:**
- Consumes: `apply_firm_filters` from Task 1.
- Produces: firm-search requests accept optional `filters: {industry?, location?, size?, keywords?}`; `search_firms(prompt, limit, search_id, filter_overrides=None)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_firm_search_overrides.py
"""search_firms applies filter overrides after parsing, before searching."""
from unittest.mock import patch

import pytest

from app.services import company_search

pytestmark = pytest.mark.unit


def _fake_parse(prompt, use_cache=True):
    return {"success": True, "parsed": {
        "industry": "investment banking", "location": "New York",
        "size": "mid", "keywords": ["healthcare"]}}


def _fake_serp(**kwargs):
    # Echo what search_firms passed so the test can assert the override won.
    return {"success": True, "firms": [], "total": 0, "queryLevel": 3,
            "_echo": {"industry": kwargs.get("industry"), "size": kwargs.get("size")}}


@patch("app.services.company_search.parse_firm_search_prompt", side_effect=_fake_parse)
def test_override_wins_over_parse(mock_parse):
    with patch("app.services.serp_client.search_companies_with_serp", side_effect=lambda **kw: _fake_serp(**kw)):
        result = company_search.search_firms(
            "ibanks in nyc", limit=5,
            filter_overrides={"industry": "consulting", "size": "large"},
        )
    assert result["parsedFilters"]["industry"] == "consulting"
    assert result["parsedFilters"]["size"] == "large"
    assert result["parsedFilters"]["location"] == "New York"  # untouched


@patch("app.services.company_search.parse_firm_search_prompt", side_effect=_fake_parse)
def test_clearing_everything_returns_error_not_crash(mock_parse):
    result = company_search.search_firms(
        "ibanks in nyc", limit=5,
        filter_overrides={"industry": None, "location": None, "keywords": []},
    )
    assert result["success"] is False
    assert "filter" in result["error"].lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest tests/test_firm_search_overrides.py -v`
Expected: FAIL — `TypeError: search_firms() got an unexpected keyword argument 'filter_overrides'`

- [ ] **Step 3: Add `filter_overrides` to `search_firms`**

In `backend/app/services/company_search.py`, change the signature (line 1083):

```python
def search_firms(prompt: str, limit: int = 20, search_id: Optional[str] = None,
                 filter_overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
```

Then immediately after `parsed = parse_result["parsed"]` (line 1122), insert:

```python
    # Filter-rail edits override the parse (spec: filter rail ⇄ prompt sync).
    if filter_overrides:
        from app.services.filter_overrides import apply_firm_filters
        parsed = apply_firm_filters(parsed, filter_overrides)
        if not (parsed.get("industry") or parsed.get("location") or parsed.get("keywords")):
            if search_id:
                from app.services.search_progress import fail_search_progress
                fail_search_progress(search_id, "No filters left after edits")
            return {
                "success": False, "firms": [], "total": 0,
                "parsedFilters": parsed,
                "error": "Your search needs at least one filter. Add an industry, location, or focus area.",
                "fallbackApplied": False, "queryLevel": None,
            }
```

- [ ] **Step 4: Accept `filters` in the request schema**

In `backend/app/utils/validation.py`, add a field to `FirmSearchRequest` (after `batchSize`, line 51). `Dict`/`Any` are already importable from `typing` — check the file's existing imports and extend if needed:

```python
    filters: Optional[Dict[str, Any]] = Field(None, description="Filter-rail overrides: industry/location/size/keywords")
```

- [ ] **Step 5: Pass through in both routes**

In `backend/app/routes/firm_search.py`, both call sites (line 183 sync, line 469 async), change:

```python
            result = search_firms(query, limit=batch_size, search_id=search_id)
```

to:

```python
            result = search_firms(query, limit=batch_size, search_id=search_id,
                                  filter_overrides=validated_data.get('filters'))
```

(Both routes build `validated_data` from `FirmSearchRequest` — confirm the local variable name at each site before editing; it is `validated_data` at lines 153 and 446.)

- [ ] **Step 6: Run tests**

Run: `cd backend && python3 -m pytest tests/test_firm_search_overrides.py tests/test_filter_overrides.py tests/test_firm_search.py -v`
(If `tests/test_firm_search.py` doesn't exist, run `python3 -m pytest tests/ -k "firm" -v` instead.)
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/company_search.py backend/app/routes/firm_search.py backend/app/utils/validation.py backend/tests/test_firm_search_overrides.py
git commit -m "feat(find): firm search accepts filter-rail overrides"
```

---

### Task 4: Frontend filter types + FilterGroup component

**Files:**
- Create: `connect-grow-hire/src/types/findFilters.ts`
- Create: `connect-grow-hire/src/components/find/FilterGroup.tsx`

**Interfaces:**
- Produces (consumed by Tasks 5–8):

```ts
// findFilters.ts
export type FindTab = "people" | "companies" | "hiring-managers";
export interface PeopleFilters { titles: string[]; companies: string[]; locations: string[]; schools: string[]; industries: string[]; }
export interface CompanyFilters { industry: string | null; location: string | null; size: "small" | "mid" | "large" | "none"; keywords: string[]; }
export const EMPTY_PEOPLE_FILTERS: PeopleFilters;
export const EMPTY_COMPANY_FILTERS: CompanyFilters;
export function peopleFiltersActive(f: PeopleFilters): boolean;
export function companyFiltersActive(f: CompanyFilters): boolean;
// FilterGroup.tsx
interface FilterGroupProps { label: string; values: string[]; onChange: (values: string[]) => void; suggestions?: string[]; placeholder?: string; singleValue?: boolean; }
```

- [ ] **Step 1: Write `findFilters.ts`**

```ts
// connect-grow-hire/src/types/findFilters.ts
// Shared shapes for the Find page filter rail. The dimensions deliberately
// mirror the backend parsers exactly (people: prompt_parser.py, companies:
// company_search.parse_firm_search_prompt) — nothing invented client-side.

export type FindTab = "people" | "companies" | "hiring-managers";

export interface PeopleFilters {
  titles: string[];
  companies: string[];
  locations: string[];
  schools: string[];
  industries: string[];
}

export interface CompanyFilters {
  industry: string | null;
  location: string | null;
  size: "small" | "mid" | "large" | "none";
  keywords: string[];
}

export const EMPTY_PEOPLE_FILTERS: PeopleFilters = {
  titles: [], companies: [], locations: [], schools: [], industries: [],
};

export const EMPTY_COMPANY_FILTERS: CompanyFilters = {
  industry: null, location: null, size: "none", keywords: [],
};

export function peopleFiltersActive(f: PeopleFilters): boolean {
  return f.titles.length > 0 || f.companies.length > 0 || f.locations.length > 0
    || f.schools.length > 0 || f.industries.length > 0;
}

export function companyFiltersActive(f: CompanyFilters): boolean {
  return !!f.industry || !!f.location || f.size !== "none" || f.keywords.length > 0;
}
```

- [ ] **Step 2: Write `FilterGroup.tsx`**

```tsx
// connect-grow-hire/src/components/find/FilterGroup.tsx
// One accordion group in the Find filter rail: label + chips + tag input.
import { useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

interface FilterGroupProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];      // optional autocomplete pool
  placeholder?: string;
  singleValue?: boolean;       // Companies tab: industry/location are single strings
}

const MAX_VALUES = 5;

export function FilterGroup({ label, values, onChange, suggestions = [], placeholder, singleValue = false }: FilterGroupProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (q.length < 2) return [];
    return suggestions
      .filter((s) => s.toLowerCase().includes(q) && !values.includes(s))
      .slice(0, 6);
  }, [draft, suggestions, values]);

  const add = (raw: string) => {
    const v = raw.trim().slice(0, 100);
    if (!v || values.includes(v)) return;
    onChange(singleValue ? [v] : [...values, v].slice(0, MAX_VALUES));
    setDraft("");
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  return (
    <div style={{ borderBottom: "1px solid var(--line, #E8E8E8)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between transition-colors"
        style={{
          padding: "10px 12px", fontSize: 13, fontWeight: 500,
          color: "var(--ink, #111318)", background: "transparent",
          border: "none", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span className="flex items-center" style={{ gap: 7 }}>
          {label}
          {values.length > 0 && (
            <span
              className="font-mono"
              style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 999,
                background: "var(--primary-50, #EEF1F9)", color: "var(--accent, #4A60A8)",
              }}
            >
              {values.length}
            </span>
          )}
        </span>
        <ChevronDown
          style={{
            width: 14, height: 14, color: "var(--ink-3, #94A3B8)",
            transform: open ? "rotate(180deg)" : "none", transition: "transform .15s",
          }}
        />
      </button>

      {open && (
        <div style={{ padding: "0 12px 10px" }}>
          {values.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 5, marginBottom: 7 }}>
              {values.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center"
                  style={{
                    gap: 4, padding: "3px 8px", borderRadius: 999, fontSize: 12,
                    background: "var(--primary-50, #EEF1F9)", color: "var(--accent, #4A60A8)",
                  }}
                >
                  {v}
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    aria-label={`Remove ${v}`}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "inherit" }}
                  >
                    <X style={{ width: 11, height: 11 }} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ position: "relative" }}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); add(draft); }
              }}
              placeholder={placeholder ?? `Add ${label.toLowerCase()}…`}
              style={{
                width: "100%", padding: "6px 9px", fontSize: 12.5,
                border: "1px solid var(--line, #E8E8E8)", borderRadius: 7,
                outline: "none", fontFamily: "inherit", background: "#fff",
              }}
            />
            {matches.length > 0 && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 30,
                  background: "#fff", border: "1px solid var(--line, #E8E8E8)",
                  borderRadius: 8, boxShadow: "0 6px 18px rgba(15,18,25,0.10)", overflow: "hidden",
                }}
              >
                {matches.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => add(m)}
                    className="block w-full text-left"
                    style={{
                      padding: "7px 10px", fontSize: 12.5, background: "transparent",
                      border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--ink, #111318)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-blue-subtle, #F5F8FF)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "findFilters|FilterGroup"`
Expected: no output (pre-existing repo-wide errors are unrelated; only these files must be clean).

- [ ] **Step 4: Commit**

```bash
git add connect-grow-hire/src/types/findFilters.ts connect-grow-hire/src/components/find/FilterGroup.tsx
git commit -m "feat(find): filter types + FilterGroup accordion component"
```

---

### Task 5: FindFilterRail component

**Files:**
- Create: `connect-grow-hire/src/components/find/FindFilterRail.tsx`

**Interfaces:**
- Consumes: Task 4 types/component; autocomplete pools from `@/data/companies`, `@/data/universities`, `@/data/industries` (check each file's export name before importing — e.g. `import { COMPANIES } from "@/data/companies"` may actually be a default export or differently named; open the three files and use their real exports, flattening to `string[]`).
- Produces:

```ts
interface FindFilterRailProps {
  activeTab: FindTab;
  onTabChange: (tab: FindTab) => void;
  tabFlashing: boolean;
  peopleFilters: PeopleFilters;
  onPeopleFiltersChange: (f: PeopleFilters) => void;
  companyFilters: CompanyFilters;
  onCompanyFiltersChange: (f: CompanyFilters) => void;
}
export function FindFilterRail(props: FindFilterRailProps): JSX.Element;
```

- [ ] **Step 1: Write the component**

The pill-toggle markup is **moved verbatim** from `FindPage.tsx` lines 451–489 (same styles, same `tabFlashing` flash behavior, same `hidden sm:inline` labels). Below it, the filter area renders per tab. Desktop-only in this task; mobile sheet is Task 10.

```tsx
// connect-grow-hire/src/components/find/FindFilterRail.tsx
// Left rail on /find: tab toggle + per-tab filter groups mirroring the
// backend parsers. The rail DISPLAYS what the parser understood and lets
// the user override it; it never searches on its own.
import { Search, Building2, UserCheck } from "lucide-react";
import {
  FindTab, PeopleFilters, CompanyFilters,
  EMPTY_PEOPLE_FILTERS, EMPTY_COMPANY_FILTERS,
  peopleFiltersActive, companyFiltersActive,
} from "@/types/findFilters";
import { FilterGroup } from "./FilterGroup";
// NOTE (executor): open src/data/companies.ts, universities.ts, industries.ts
// and import their real exports; normalize each to string[] below.
import { COMPANY_NAMES } from "@/data/companies";
import { UNIVERSITY_NAMES } from "@/data/universities";
import { INDUSTRY_NAMES } from "@/data/industries";

const TABS: { id: FindTab; label: string; mobileLabel: string; icon: typeof Search }[] = [
  { id: "people", label: "People", mobileLabel: "People", icon: Search },
  { id: "companies", label: "Companies", mobileLabel: "Companies", icon: Building2 },
  { id: "hiring-managers", label: "Hiring Managers", mobileLabel: "Hiring", icon: UserCheck },
];

const SIZE_OPTIONS: { id: CompanyFilters["size"]; label: string }[] = [
  { id: "small", label: "Small" }, { id: "mid", label: "Mid" }, { id: "large", label: "Large" },
];

interface FindFilterRailProps {
  activeTab: FindTab;
  onTabChange: (tab: FindTab) => void;
  tabFlashing: boolean;
  peopleFilters: PeopleFilters;
  onPeopleFiltersChange: (f: PeopleFilters) => void;
  companyFilters: CompanyFilters;
  onCompanyFiltersChange: (f: CompanyFilters) => void;
}

export function FindFilterRail({
  activeTab, onTabChange, tabFlashing,
  peopleFilters, onPeopleFiltersChange,
  companyFilters, onCompanyFiltersChange,
}: FindFilterRailProps) {
  const hasActive =
    activeTab === "people" ? peopleFiltersActive(peopleFilters)
    : activeTab === "companies" ? companyFiltersActive(companyFilters)
    : false;

  const clearAll = () => {
    if (activeTab === "people") onPeopleFiltersChange(EMPTY_PEOPLE_FILTERS);
    if (activeTab === "companies") onCompanyFiltersChange(EMPTY_COMPANY_FILTERS);
  };

  return (
    <div className="flex flex-col" style={{ position: "sticky", top: 8, gap: 6 }}>
      {/* Tab toggle — moved verbatim from FindPage (keep styles in sync if FindPage's tokens change) */}
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex items-center transition-colors"
            style={{
              gap: 10, width: "100%", padding: "11px 14px", borderRadius: 10,
              fontSize: 13.5, fontWeight: isActive ? 600 : 500, fontFamily: "inherit",
              textAlign: "left", cursor: "pointer",
              border: isActive ? "1px solid transparent" : "1px solid var(--line, #E5E5E5)",
              color: isActive ? "#fff" : "var(--ink, #111318)",
              background: isActive
                ? (tabFlashing ? "var(--brand-blue, #3B82F6)" : "var(--accent, #4A60A8)")
                : "#fff",
              boxShadow: isActive ? "0 1px 3px rgba(15,18,25,0.10)" : "none",
              transition: "background .35s ease, color .15s",
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--brand-blue-subtle, #F5F8FF)"; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#fff"; }}
          >
            <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.mobileLabel}</span>
          </button>
        );
      })}

      {/* Filter panel — People and Companies only; HM tab is toggle-only (spec) */}
      {activeTab !== "hiring-managers" && (
        <div
          className="hidden sm:block"
          style={{
            marginTop: 10, background: "#fff",
            border: "1px solid var(--line, #E5E5E5)", borderRadius: 10, overflow: "visible",
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ padding: "10px 12px", borderBottom: "1px solid var(--line, #E8E8E8)" }}
          >
            <span style={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--ink-3, #94A3B8)",
            }}>
              Search Filters
            </span>
            {hasActive && (
              <button
                type="button"
                onClick={clearAll}
                style={{
                  fontSize: 11.5, fontWeight: 500, color: "var(--accent, #4A60A8)",
                  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
                }}
              >
                Clear All
              </button>
            )}
          </div>

          {activeTab === "people" && (
            <>
              <FilterGroup label="Job Title" values={peopleFilters.titles}
                onChange={(titles) => onPeopleFiltersChange({ ...peopleFilters, titles })} />
              <FilterGroup label="Company" values={peopleFilters.companies} suggestions={COMPANY_NAMES}
                onChange={(companies) => onPeopleFiltersChange({ ...peopleFilters, companies })} />
              <FilterGroup label="Location" values={peopleFilters.locations}
                onChange={(locations) => onPeopleFiltersChange({ ...peopleFilters, locations })} />
              <FilterGroup label="School" values={peopleFilters.schools} suggestions={UNIVERSITY_NAMES}
                onChange={(schools) => onPeopleFiltersChange({ ...peopleFilters, schools })} />
              <FilterGroup label="Industry" values={peopleFilters.industries} suggestions={INDUSTRY_NAMES}
                onChange={(industries) => onPeopleFiltersChange({ ...peopleFilters, industries })} />
            </>
          )}

          {activeTab === "companies" && (
            <>
              <FilterGroup label="Industry" singleValue suggestions={INDUSTRY_NAMES}
                values={companyFilters.industry ? [companyFilters.industry] : []}
                onChange={(vals) => onCompanyFiltersChange({ ...companyFilters, industry: vals[vals.length - 1] ?? null })} />
              <FilterGroup label="Location" singleValue
                values={companyFilters.location ? [companyFilters.location] : []}
                onChange={(vals) => onCompanyFiltersChange({ ...companyFilters, location: vals[vals.length - 1] ?? null })} />
              {/* Size — enum chips, matches parse_firm_search_prompt's small|mid|large|none */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line, #E8E8E8)" }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink, #111318)", marginBottom: 7 }}>Size</div>
                <div className="flex" style={{ gap: 5 }}>
                  {SIZE_OPTIONS.map((s) => {
                    const selected = companyFilters.size === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onCompanyFiltersChange({ ...companyFilters, size: selected ? "none" : s.id })}
                        style={{
                          padding: "4px 11px", borderRadius: 999, fontSize: 12, fontWeight: 500,
                          cursor: "pointer", fontFamily: "inherit",
                          border: selected ? "1px solid transparent" : "1px solid var(--line, #E8E8E8)",
                          background: selected ? "var(--accent, #4A60A8)" : "#fff",
                          color: selected ? "#fff" : "var(--ink-2, #475569)",
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <FilterGroup label="Focus" placeholder="e.g. healthcare, M&A…"
                values={companyFilters.keywords}
                onChange={(keywords) => onCompanyFiltersChange({ ...companyFilters, keywords })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Fix the data imports**

Open `src/data/companies.ts`, `src/data/universities.ts`, `src/data/industries.ts`; replace the three import lines and, if needed, add local normalization such as:

```ts
const COMPANY_NAMES: string[] = companiesExport.map((c) => typeof c === "string" ? c : c.name);
```

(exact shape depends on the files — flatten to `string[]`, dedupe not required).

- [ ] **Step 3: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "FindFilterRail"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add connect-grow-hire/src/components/find/FindFilterRail.tsx
git commit -m "feat(find): FindFilterRail — toggle + per-tab parser-mirroring filter groups"
```

---

### Task 6: FindPage integration

**Files:**
- Modify: `connect-grow-hire/src/pages/FindPage.tsx` (real render tree only: the toggle rail at lines 445–491, the tab-content props at 502–506, and state near the other `useState` calls in the main component ~line 300)

**Interfaces:**
- Consumes: `FindFilterRail` (Task 5), types (Task 4).
- Produces (props consumed by Tasks 7–8):
  - `ContactSearchPage` gains: `railFilters: PeopleFilters`, `railFiltersNonce: number`, `onParsedQuery: (f: PeopleFilters) => void`
  - `FirmSearchPage` gains: `railFilters: CompanyFilters`, `railFiltersNonce: number`, `onParsedFilters: (f: CompanyFilters) => void`

- [ ] **Step 1: Add rail state to the main FindPage component**

Near the existing state hooks (same component that defines `setActiveTab`/`tabFlashing`):

```tsx
  // Filter-rail state. Nonce bumps ONLY on user edits (not on parse-populate),
  // signalling the embedded search page to re-run with overrides. An edit that
  // clears every dimension resets instead of re-searching (backend would 400).
  const [peopleFilters, setPeopleFilters] = useState<PeopleFilters>(EMPTY_PEOPLE_FILTERS);
  const [peopleFiltersNonce, setPeopleFiltersNonce] = useState(0);
  const [companyFilters, setCompanyFilters] = useState<CompanyFilters>(EMPTY_COMPANY_FILTERS);
  const [companyFiltersNonce, setCompanyFiltersNonce] = useState(0);

  const handlePeopleFiltersChange = (f: PeopleFilters) => {
    setPeopleFilters(f);
    if (peopleFiltersActive(f)) setPeopleFiltersNonce((n) => n + 1);
    else setPeopleFiltersNonce(0); // cleared → fresh state, no re-search
  };
  const handleCompanyFiltersChange = (f: CompanyFilters) => {
    setCompanyFilters(f);
    if (companyFiltersActive(f)) setCompanyFiltersNonce((n) => n + 1);
    else setCompanyFiltersNonce(0);
  };
```

with imports:

```tsx
import { FindFilterRail } from "@/components/find/FindFilterRail";
import {
  PeopleFilters, CompanyFilters, EMPTY_PEOPLE_FILTERS, EMPTY_COMPANY_FILTERS,
  peopleFiltersActive, companyFiltersActive,
} from "@/types/findFilters";
```

Also update FindPage's local `FindTab`/tab typing to import `FindTab` from `@/types/findFilters` if a local duplicate exists (check the `TABS` definition at lines 26–28 and the `setActiveTab` signature; delete the local type alias and import instead — keep the local `TABS` array in place for anything else that references it, or delete it if the rail was its only consumer).

- [ ] **Step 2: Replace the toggle rail block**

Replace lines 445–491 (the `{/* Left toggle rail … */}` block: outer `div.flex-shrink-0 sm:w-[200px]` and everything inside) with:

```tsx
                {/* Left rail — tab toggle + filter panel (FindFilterRail) */}
                <div className="flex-shrink-0 sm:w-[236px]">
                  <FindFilterRail
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    tabFlashing={tabFlashing}
                    peopleFilters={peopleFilters}
                    onPeopleFiltersChange={handlePeopleFiltersChange}
                    companyFilters={companyFilters}
                    onCompanyFiltersChange={handleCompanyFiltersChange}
                  />
                </div>
```

(232px→236px keeps the grid tight; the outer `maxWidth: 1120` container is unchanged.)

- [ ] **Step 3: Pass the new props to the embedded pages**

Lines 502–506, change:

```tsx
                    <div style={{ display: activeTab === "people" ? "block" : "none" }}>
                      <ContactSearchPage embedded hideSubTabs parentEmailTemplate={activeEmailTemplate} isDevPreview={IS_DEV_PREVIEW} initialQuery={peopleInitialQuery} />
                    </div>
                    <div data-tour="tour-find-companies" style={{ display: activeTab === "companies" ? "block" : "none" }}>
                      <FirmSearchPage embedded isDevPreview={IS_DEV_PREVIEW} initialQuery={companiesInitialQuery} />
                    </div>
```

to:

```tsx
                    <div style={{ display: activeTab === "people" ? "block" : "none" }}>
                      <ContactSearchPage embedded hideSubTabs parentEmailTemplate={activeEmailTemplate} isDevPreview={IS_DEV_PREVIEW} initialQuery={peopleInitialQuery}
                        railFilters={peopleFilters} railFiltersNonce={peopleFiltersNonce} onParsedQuery={setPeopleFilters} />
                    </div>
                    <div data-tour="tour-find-companies" style={{ display: activeTab === "companies" ? "block" : "none" }}>
                      <FirmSearchPage embedded isDevPreview={IS_DEV_PREVIEW} initialQuery={companiesInitialQuery}
                        railFilters={companyFilters} railFiltersNonce={companyFiltersNonce} onParsedFilters={setCompanyFilters} />
                    </div>
```

Note: `onParsedQuery={setPeopleFilters}` (the raw setter, NOT `handlePeopleFiltersChange`) — parse-populate must not bump the nonce or it would re-search in a loop.

- [ ] **Step 4: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "FindPage"`
Expected: errors ONLY about the not-yet-existing props on `ContactSearchPage`/`FirmSearchPage` (fixed in Tasks 7–8). No other new errors. If the executor prefers a clean tree per task, Tasks 6–8 may be committed together at the end of Task 8 — otherwise commit now and accept the transient prop errors.

- [ ] **Step 5: Commit**

```bash
git add connect-grow-hire/src/pages/FindPage.tsx
git commit -m "feat(find): FindPage hosts FindFilterRail + rail state/nonce"
```

---

### Task 7: ContactSearchPage + api.ts wiring (People)

**Files:**
- Modify: `connect-grow-hire/src/services/api.ts` (`runPromptSearch`, line 1381)
- Modify: `connect-grow-hire/src/pages/ContactSearchPage.tsx` (props at line 248, `handleSearch` at 1546–1623, parse readback at ~1705)

**Interfaces:**
- Consumes: props from Task 6 (`railFilters`, `railFiltersNonce`, `onParsedQuery`), backend `filters` field from Task 2.
- Produces: `apiService.runPromptSearch({ …, filters?: PeopleFilters })`.

- [ ] **Step 1: api.ts — add `filters` to `runPromptSearch`**

Change the signature and payload (line 1381):

```ts
  async runPromptSearch(data: { prompt: string; batchSize: number; emailTemplate?: EmailTemplate | null; mode?: OutreachMode; filters?: import("@/types/findFilters").PeopleFilters }): Promise<SearchResult> {
```

and after the existing `if (data.mode) { … }` block:

```ts
    if (data.filters) {
      // Filter-rail overrides; backend merges these over its prompt parse.
      payload.filters = data.filters;
    }
```

- [ ] **Step 2: ContactSearchPage — accept the new props**

Line 248, extend the component signature:

```tsx
const ContactSearchPage: React.FC<{
  embedded?: boolean; hideSubTabs?: boolean; parentEmailTemplate?: EmailTemplate | null;
  isDevPreview?: boolean; initialQuery?: string;
  railFilters?: PeopleFilters; railFiltersNonce?: number;
  onParsedQuery?: (f: PeopleFilters) => void;
}> = ({ embedded = false, hideSubTabs = false, parentEmailTemplate, isDevPreview = false, initialQuery,
        railFilters, railFiltersNonce = 0, onParsedQuery }) => {
```

with import: `import { PeopleFilters } from "@/types/findFilters";`

- [ ] **Step 3: Track override-vs-parse mode and re-search on nonce**

Near the other refs (~line 454):

```tsx
  // Overrides apply only after a rail edit (nonce > 0) AND only while the
  // prompt text is unchanged — typing a new prompt hands control back to the
  // parser and the rail repopulates from its output.
  const lastSearchedPromptRef = useRef<string>("");
  const lastRailNonceRef = useRef(0);

  useEffect(() => {
    if (railFiltersNonce === 0 || railFiltersNonce === lastRailNonceRef.current) return;
    lastRailNonceRef.current = railFiltersNonce;
    if (!isSearching) handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railFiltersNonce]);
```

- [ ] **Step 4: Send overrides + synthesize prompt in `handleSearch`**

Inside `handleSearch` (line 1547), where the prompt is validated and `runPromptSearch` is called (line 1623):

1. At the top, compute the effective prompt — if the user typed nothing but the rail has filters, synthesize one:

```tsx
    const railActive = railFilters && peopleFiltersActive(railFilters);
    let effectivePrompt = searchPrompt.trim();
    if (!effectivePrompt && railActive) {
      const f = railFilters!;
      effectivePrompt = [
        f.titles[0] ? f.titles.join(" or ") : "People",
        f.companies.length ? `at ${f.companies.join(" or ")}` : "",
        f.locations.length ? `in ${f.locations.join(" or ")}` : "",
        f.schools.length ? `who went to ${f.schools.join(" or ")}` : "",
        f.industries.length ? `in ${f.industries.join(" / ")}` : "",
      ].filter(Boolean).join(" ");
    }
```

(Adapt: the function currently reads `searchPrompt` directly in several places — thread `effectivePrompt` through to the existing validation and the `expandedPrompt` construction; do not restructure anything else.)

2. Decide whether to attach overrides — attach only when the prompt hasn't changed since the last search (i.e., this run was triggered by a rail edit or a re-search of the same text):

```tsx
    const sendOverrides = railActive && railFiltersNonce > 0 && effectivePrompt === lastSearchedPromptRef.current;
    lastSearchedPromptRef.current = effectivePrompt;
```

3. In the `runPromptSearch` call (line 1623), add the field:

```tsx
      const result = await apiService.runPromptSearch({
        prompt: expandedPrompt, batchSize, emailTemplate: activeEmailTemplate, mode: 'preview',
        ...(sendOverrides ? { filters: railFilters } : {}),
      });
```

with import of `peopleFiltersActive` added to the findFilters import.

- [ ] **Step 5: Report the parse back to the rail**

At ~line 1705 where `parsedFromServer` is read, add:

```tsx
        onParsedQuery?.({
          titles: parsedFromServer.title_variations ?? [],
          companies: parsedFromServer.companies ?? [],
          locations: parsedFromServer.locations ?? [],
          schools: parsedFromServer.schools ?? [],
          industries: parsedFromServer.industries ?? [],
        });
```

- [ ] **Step 6: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "ContactSearchPage|api\.ts"`
Expected: no new errors (compare against the pre-existing error list from Task 4 if unsure).

- [ ] **Step 7: Commit**

```bash
git add connect-grow-hire/src/services/api.ts connect-grow-hire/src/pages/ContactSearchPage.tsx
git commit -m "feat(find): People search wired to filter rail (overrides + parse readback)"
```

---

### Task 8: FirmSearchPage wiring (Companies)

**Files:**
- Modify: `connect-grow-hire/src/services/api.ts` (`searchFirmsAsync`, line 1531)
- Modify: `connect-grow-hire/src/pages/FirmSearchPage.tsx` (props, `handleSearch` at 464–503, parsedFilters readback at 528)

**Interfaces:**
- Consumes: props from Task 6 (`railFilters`, `railFiltersNonce`, `onParsedFilters`), backend `filters` field from Task 3.
- Produces: `apiService.searchFirmsAsync(query, batchSize, filters?)`.

- [ ] **Step 1: api.ts — add `filters` to `searchFirmsAsync`**

```ts
  async searchFirmsAsync(query: string, batchSize: number = 10, filters?: import("@/types/findFilters").CompanyFilters): Promise<{ searchId: string }> {
    const headers = await this.getAuthHeaders();
    const body: Record<string, unknown> = { query, batchSize };
    if (filters) body.filters = filters;
    return this.makeRequest<{ searchId: string }>('/firm-search/search-async', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }
```

- [ ] **Step 2: FirmSearchPage — props, nonce effect, overrides, readback**

Mirror Task 7 exactly, with the firm shapes:

1. Extend the component props with `railFilters?: CompanyFilters; railFiltersNonce?: number; onParsedFilters?: (f: CompanyFilters) => void;` (find the component's prop type near the top of the file — it already takes `embedded`, `isDevPreview`, `initialQuery`).
2. Add `lastSearchedQueryRef` + `lastRailNonceRef` refs and the same `useEffect` on `railFiltersNonce` calling `handleSearch()` when not already searching.
3. In `handleSearch` (line 464): synthesize a query when empty but rail active —

```tsx
    const railActive = railFilters && companyFiltersActive(railFilters);
    let effectiveQuery = (searchQuery ?? query).trim();
    if (!effectiveQuery && railActive) {
      const f = railFilters!;
      const sizeWord = f.size === "none" ? "" : `${f.size === "mid" ? "mid-sized" : f.size} `;
      effectiveQuery = `${sizeWord}${f.industry ?? "companies"}${f.location ? ` in ${f.location}` : ""}${f.keywords.length ? ` focused on ${f.keywords.join(", ")}` : ""}`;
    }
    const sendOverrides = railActive && railFiltersNonce > 0 && effectiveQuery === lastSearchedQueryRef.current;
    lastSearchedQueryRef.current = effectiveQuery;
```

4. Change the call at line 503: `const { searchId } = await apiService.searchFirmsAsync(effectiveQuery, batchSize, sendOverrides ? railFilters : undefined);`
5. At line 528 where `setParsedFilters(result.parsedFilters)` runs, add:

```tsx
              if (result.parsedFilters) {
                onParsedFilters?.({
                  industry: result.parsedFilters.industry ?? null,
                  location: result.parsedFilters.location ?? null,
                  size: (["small", "mid", "large"].includes(result.parsedFilters.size) ? result.parsedFilters.size : "none") as CompanyFilters["size"],
                  keywords: result.parsedFilters.keywords ?? [],
                });
              }
```

with imports: `import { CompanyFilters, companyFiltersActive } from "@/types/findFilters";`

- [ ] **Step 3: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "FirmSearchPage|api\.ts|FindPage"`
Expected: no new errors — including the FindPage prop errors from Task 6, which are now resolved.

- [ ] **Step 4: Commit**

```bash
git add connect-grow-hire/src/services/api.ts connect-grow-hire/src/pages/FirmSearchPage.tsx
git commit -m "feat(find): Companies search wired to filter rail"
```

---

### Task 9: Fill-in-the-blank starter prompts

**Files:**
- Create: `connect-grow-hire/src/data/searchTemplates.ts`
- Create: `connect-grow-hire/src/components/find/PromptTemplates.tsx`
- Modify: `connect-grow-hire/src/pages/ContactSearchPage.tsx` (SuggestionChips block, lines 2661–2688)
- Modify: `connect-grow-hire/src/pages/FirmSearchPage.tsx` (promptChips cards block, ~lines 995–1030)

**Interfaces:**
- Produces: `<PromptTemplates categories={…} onSubmit={(prompt: string) => void} disabled={boolean} />`

- [ ] **Step 1: Write `searchTemplates.ts`**

```ts
// connect-grow-hire/src/data/searchTemplates.ts
// Fill-in-the-blank starter prompts (Find page empty state). A template is a
// sentence with typed blanks; PromptTemplates renders blanks as inline inputs
// and composes the final prompt string.

export interface TemplateBlank { key: string; placeholder: string; example: string; }
export type TemplatePart = string | TemplateBlank;
export interface SearchTemplate { id: string; parts: TemplatePart[]; }
export interface TemplateCategory { id: string; label: string; templates: SearchTemplate[]; }

export const PEOPLE_TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: "general", label: "General",
    templates: [
      { id: "g1", parts: ["I'm looking for ", { key: "title", placeholder: "job title", example: "product managers" }, " at ", { key: "company", placeholder: "company", example: "Airbnb" }] },
      { id: "g2", parts: [{ key: "school", placeholder: "school", example: "USC" }, " alumni working in ", { key: "industry", placeholder: "industry", example: "tech" }] },
      { id: "g3", parts: ["Recruiters hiring ", { key: "title", placeholder: "job title", example: "software engineering" }, " interns in ", { key: "location", placeholder: "location", example: "New York" }] },
    ],
  },
  {
    id: "consulting", label: "Consulting",
    templates: [
      { id: "c1", parts: ["Consultants at ", { key: "company", placeholder: "firm", example: "McKinsey" }, " in ", { key: "location", placeholder: "location", example: "Chicago" }] },
      { id: "c2", parts: [{ key: "school", placeholder: "school", example: "Michigan" }, " alumni at MBB firms"] },
      { id: "c3", parts: ["Recruiters at ", { key: "company", placeholder: "firm", example: "Bain" }, " hiring for ", { key: "title", placeholder: "program", example: "summer associate" }] },
    ],
  },
  {
    id: "banking", label: "Banking",
    templates: [
      { id: "b1", parts: ["Investment banking analysts at ", { key: "company", placeholder: "bank", example: "Goldman Sachs" }] },
      { id: "b2", parts: [{ key: "school", placeholder: "school", example: "NYU" }, " alumni in ", { key: "group", placeholder: "group", example: "M&A" }, " at ", { key: "company", placeholder: "bank", example: "JPMorgan" }] },
      { id: "b3", parts: ["IB associates in ", { key: "location", placeholder: "city", example: "San Francisco" }, " who went to ", { key: "school", placeholder: "school", example: "Georgetown" }] },
    ],
  },
  {
    id: "tech", label: "Tech",
    templates: [
      { id: "t1", parts: [{ key: "title", placeholder: "role", example: "Software engineers" }, " at ", { key: "company", placeholder: "company", example: "Google" }] },
      { id: "t2", parts: ["APM program managers at ", { key: "company", placeholder: "company", example: "Meta" }] },
      { id: "t3", parts: [{ key: "school", placeholder: "school", example: "UCLA" }, " alumni who joined ", { key: "company", placeholder: "company", example: "startups" }, " as ", { key: "title", placeholder: "role", example: "designers" }] },
    ],
  },
];

export const COMPANY_TEMPLATES: SearchTemplate[] = [
  { id: "f1", parts: [{ key: "size", placeholder: "size", example: "Mid-sized" }, " ", { key: "industry", placeholder: "industry", example: "investment banks" }, " in ", { key: "location", placeholder: "location", example: "New York" }] },
  { id: "f2", parts: [{ key: "industry", placeholder: "industry", example: "Consulting firms" }, " focused on ", { key: "focus", placeholder: "specialty", example: "healthcare" }] },
  { id: "f3", parts: ["Startups in ", { key: "location", placeholder: "location", example: "Los Angeles" }, " hiring ", { key: "role", placeholder: "role", example: "new grads" }] },
];
```

- [ ] **Step 2: Write `PromptTemplates.tsx`**

```tsx
// connect-grow-hire/src/components/find/PromptTemplates.tsx
// RocketReach-style "if you need ideas" row: category tabs + fill-in-the-blank
// templates. Blanks are inline inputs; the search icon composes and submits.
import { useState } from "react";
import { Search } from "lucide-react";
import {
  SearchTemplate, TemplateCategory, TemplatePart,
} from "@/data/searchTemplates";

function isBlank(p: TemplatePart): p is Exclude<TemplatePart, string> {
  return typeof p !== "string";
}

function TemplateRow({ template, onSubmit, disabled }: {
  template: SearchTemplate; onSubmit: (prompt: string) => void; disabled?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = template.parts.every((p) => !isBlank(p) || (values[p.key] ?? "").trim());

  const compose = () =>
    template.parts.map((p) => (isBlank(p) ? (values[p.key] ?? "").trim() : p)).join("");

  return (
    <div
      className="flex items-center justify-between"
      style={{
        gap: 10, padding: "9px 12px", borderRadius: 10,
        background: "var(--paper-2, #FAFBFF)", border: "1px solid var(--line, #E8E8E8)",
      }}
    >
      <div className="flex items-center flex-wrap" style={{ gap: 4, fontSize: 13.5, color: "var(--ink, #111318)" }}>
        {template.parts.map((p, i) =>
          isBlank(p) ? (
            <input
              key={`${p.key}-${i}`}
              value={values[p.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && complete && !disabled) onSubmit(compose()); }}
              placeholder={p.placeholder}
              size={Math.max((values[p.key] ?? p.placeholder).length, 6)}
              style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 12.5, fontFamily: "inherit",
                border: "none", outline: "none",
                background: "var(--primary-50, #EEF1F9)", color: "var(--accent, #4A60A8)",
              }}
            />
          ) : (
            <span key={i}>{p}</span>
          )
        )}
      </div>
      <button
        type="button"
        disabled={!complete || disabled}
        onClick={() => onSubmit(compose())}
        aria-label="Search this template"
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          width: 30, height: 30, borderRadius: 8, cursor: complete && !disabled ? "pointer" : "default",
          border: "1px solid var(--line, #E8E8E8)",
          background: complete && !disabled ? "var(--accent, #4A60A8)" : "#fff",
          color: complete && !disabled ? "#fff" : "var(--ink-3, #94A3B8)",
        }}
      >
        <Search style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}

export function PromptTemplates({ categories, onSubmit, disabled }: {
  categories: TemplateCategory[]; onSubmit: (prompt: string) => void; disabled?: boolean;
}) {
  const [activeCat, setActiveCat] = useState(categories[0]?.id);
  const cat = categories.find((c) => c.id === activeCat) ?? categories[0];
  if (!cat) return null;

  return (
    <div className="flex flex-col sm:flex-row" style={{ gap: 14 }}>
      {categories.length > 1 && (
        <div className="flex flex-row sm:flex-col" style={{ gap: 3, flexShrink: 0 }}>
          {categories.map((c) => {
            const active = c.id === activeCat;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 13, textAlign: "left",
                  fontWeight: active ? 600 : 500, fontFamily: "inherit", cursor: "pointer",
                  border: active ? "1px solid var(--accent, #4A60A8)" : "1px solid transparent",
                  background: active ? "#fff" : "transparent",
                  color: active ? "var(--accent, #4A60A8)" : "var(--ink-2, #475569)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-col flex-1 min-w-0" style={{ gap: 7 }}>
        {cat.templates.map((t) => (
          <TemplateRow key={t.id} template={t} onSubmit={onSubmit} disabled={disabled} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Swap into ContactSearchPage**

Replace the `<SuggestionChips …/>` element (lines 2674–2685) with:

```tsx
              <PromptTemplates
                categories={PEOPLE_TEMPLATE_CATEGORIES}
                disabled={isSearching || linkedInLoading}
                onSubmit={(prompt) => {
                  pendingAutoSearch.current = true;
                  setSearchPrompt(prompt);
                }}
              />
```

(same submit mechanism SuggestionChips used: `pendingAutoSearch` + `setSearchPrompt`). Add imports for `PromptTemplates` and `PEOPLE_TEMPLATE_CATEGORIES`; remove the now-unused `SuggestionChips` import at line 43 IF no other render path in the file uses it (grep the file first — if the standalone/non-embedded tree also renders it, replace that instance identically).

- [ ] **Step 4: Swap into FirmSearchPage**

Replace the `promptChips.map(...)` recommendation-cards block (~lines 995–1030 — the horizontal scroll row) with:

```tsx
              <PromptTemplates
                categories={[{ id: "companies", label: "Companies", templates: COMPANY_TEMPLATES }]}
                disabled={isSearching}
                onSubmit={(prompt) => {
                  setQuery(prompt);
                  handleSearch(prompt);
                }}
              />
```

(same submit mechanism the cards used: `setQuery` + `handleSearch(prompt)`). Remove `promptChips` and its builder if nothing else references them (grep first).

- [ ] **Step 5: Typecheck + commit**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "PromptTemplates|searchTemplates|ContactSearchPage|FirmSearchPage"`
Expected: no new errors.

```bash
git add connect-grow-hire/src/data/searchTemplates.ts connect-grow-hire/src/components/find/PromptTemplates.tsx connect-grow-hire/src/pages/ContactSearchPage.tsx connect-grow-hire/src/pages/FirmSearchPage.tsx
git commit -m "feat(find): fill-in-the-blank starter prompts (people + companies)"
```

---

### Task 10: Copy renames + mobile filters sheet

**Files:**
- Modify: `connect-grow-hire/src/pages/ContactSearchPage.tsx` (lines 3317, 3331, 3449)
- Modify: `connect-grow-hire/src/pages/FirmSearchPage.tsx` (label near line 1509)
- Modify: `connect-grow-hire/src/components/find/FindFilterRail.tsx` (mobile sheet)

- [ ] **Step 1: ContactSearchPage renames**

- Line 3317: `navigate('/contact-directory')` → `navigate('/my-network/people')` (skips a redirect hop; same destination).
- Line 3331: `View in spreadsheet` → `View in Contacts`.
- Line 3449: `View in Spreadsheet` → `View in Contacts`.
- Run `grep -n "preadsheet" connect-grow-hire/src/pages/ContactSearchPage.tsx` and rename any remaining user-visible instances the same way (comments can stay).

- [ ] **Step 2: FirmSearchPage rename**

Around line 1509 (`navigate('/my-network/companies')`), find the button/label text and set it to `View in Companies`. Run `grep -n "preadsheet\|My Network" connect-grow-hire/src/pages/FirmSearchPage.tsx` for stragglers.

- [ ] **Step 3: Mobile filters sheet in FindFilterRail**

The filter panel from Task 5 is `hidden sm:block`. Add the mobile affordance next to it — a "Filters" button (visible `sm:hidden`, sits under the horizontal pill row) opening the same groups in a shadcn Sheet:

```tsx
// additional imports
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
```

Inside the component, wrap the existing filter-panel JSX in a small local `renderGroups()` function (so desktop panel and sheet share it), then after the desktop panel add:

```tsx
      {activeTab !== "hiring-managers" && (
        <div className="sm:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex items-center"
                style={{
                  gap: 7, padding: "8px 13px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                  border: "1px solid var(--line, #E5E5E5)", background: "#fff",
                  color: "var(--ink, #111318)", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <SlidersHorizontal style={{ width: 14, height: 14 }} />
                Filters{hasActive ? " •" : ""}
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] overflow-y-auto p-0">
              <SheetHeader className="p-4 pb-2">
                <SheetTitle style={{ fontSize: 15 }}>Search Filters</SheetTitle>
              </SheetHeader>
              {renderGroups()}
            </SheetContent>
          </Sheet>
        </div>
      )}
```

with `const [mobileOpen, setMobileOpen] = useState(false);` added to component state.

- [ ] **Step 4: Typecheck + commit**

Run: `cd connect-grow-hire && npx tsc --noEmit 2>&1 | grep -E "FindFilterRail|ContactSearchPage|FirmSearchPage"`
Expected: no new errors.

```bash
git add connect-grow-hire/src/pages/ContactSearchPage.tsx connect-grow-hire/src/pages/FirmSearchPage.tsx connect-grow-hire/src/components/find/FindFilterRail.tsx
git commit -m "feat(find): copy renames (View in Contacts/Companies) + mobile filters sheet"
```

---

### Task 11: Full build + backend suite + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run: `cd backend && python3 -m pytest tests/ -m unit -q`
Expected: PASS (same failures as `git stash && pytest` baseline, if any pre-exist — record baseline first).

- [ ] **Step 2: Frontend build**

Run: `cd connect-grow-hire && npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 3: Manual QA checklist (dev servers: `python3 backend/wsgi.py` + `npm run dev`)**

Walk each item; all must hold:

1. `/find` People: type "product managers at Airbnb in NY" → search behaves exactly as before (emails found, contacts populate under the bar, Draft works, panel on right).
2. After the search, the rail's Job Title/Company/Location groups show the parsed chips.
3. Remove the "Airbnb" chip → search re-runs automatically without it; results update; no credit anomalies.
4. Remove ALL chips → rail clears, NO auto re-search fires, no error toast.
5. Type a NEW prompt after chip edits → parser wins again, rail repopulates (stale overrides not sent — verify request payload has no `filters` in devtools).
6. Fill a starter template (all blanks) → submits and searches; incomplete template's search button is inert.
7. Companies tab: search "mid-sized investment banks in NYC" → rail shows Industry/Location/Size/Focus from `parsedFilters`; edits re-run; Size chips toggle.
8. Hiring Managers tab: toggle only, content unchanged.
9. Batch-size selector unchanged, next to the bar, both tabs.
10. Post-draft buttons read "View in Contacts" (People) / "View in Companies" (Companies) and navigate correctly.
11. Mobile viewport (≤640px): pills horizontal, "Filters" button opens sheet with the same groups.
12. Tour anchors `tour-find-companies` / `tour-find-hiring-managers` still present in the DOM.
13. 0-results path still opens Scout suggestions.

- [ ] **Step 4: Final commit if QA produced fixes**

```bash
git add <only files touched by fixes>
git commit -m "fix(find): QA fixes for filter rail rollout"
```

---

## Self-Review Notes

- **Spec coverage:** rail + per-tab parser-mirroring groups (T4–T6), chips/Clear All (T5), rail⇄prompt sync + override endpoints (T1–T3, T7–T8), synthesized prompt for filter-only search (T7–T8), starter templates w/ categories (T9), copy renames (T10), mobile sheet (T10), HM tab toggle-only (T5), batch-size untouched (constraint + QA #9), behavior-lock contract (constraints + QA #1/3/5/13). Recents untouched (non-goal). ✓
- **Type consistency:** `PeopleFilters`/`CompanyFilters`/`FindTab` defined once in T4, consumed by T5–T9 with identical names; `railFilters`/`railFiltersNonce`/`onParsedQuery`/`onParsedFilters` prop names match between T6 (producer) and T7/T8 (consumers); backend `filters` request key matches T2/T3 and api.ts payloads. ✓
- **Known judgment calls for the executor:** exact export names in `src/data/*.ts` (T5 step 2 covers), whether `SuggestionChips`/`promptChips` have other consumers (grep steps included), threading `effectivePrompt` through `handleSearch`'s existing internals (T7 step 4 note).
