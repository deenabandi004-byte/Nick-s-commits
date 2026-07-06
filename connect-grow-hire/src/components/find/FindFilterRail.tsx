// connect-grow-hire/src/components/find/FindFilterRail.tsx
// Left rail on /find: tab toggle + per-tab filter groups mirroring the
// backend parsers. The rail DISPLAYS what the parser understood and lets
// the user override it; it never searches on its own.
import { useState } from "react";
import { Search, Building2, UserCheck, SlidersHorizontal } from "lucide-react";
import {
  FindTab, PeopleFilters, CompanyFilters,
  EMPTY_PEOPLE_FILTERS, EMPTY_COMPANY_FILTERS,
  peopleFiltersActive, companyFiltersActive,
} from "@/types/findFilters";
import { FilterGroup } from "./FilterGroup";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
// Data imports adapted to each file's real exports (none export a plain
// string[] named *_NAMES except universities):
// - src/data/companies.ts exports `companies: Company[]` (objects with a
//   `name` field) — flattened to string[] below.
// - src/data/universities.ts exports `UNIVERSITIES: string[]` directly —
//   used as-is.
// - src/data/industries.ts exports `industries: Industry[]` (objects with
//   a `name` field) — flattened to string[] below.
import { companies } from "@/data/companies";
import { UNIVERSITIES } from "@/data/universities";
import { industries } from "@/data/industries";

const COMPANY_NAMES: string[] = companies.map((c) => c.name);
const UNIVERSITY_NAMES: string[] = UNIVERSITIES;
const INDUSTRY_NAMES: string[] = industries.map((i) => i.name);

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
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasActive =
    activeTab === "people" ? peopleFiltersActive(peopleFilters)
    : activeTab === "companies" ? companyFiltersActive(companyFilters)
    : false;

  const clearAll = () => {
    if (activeTab === "people") onPeopleFiltersChange(EMPTY_PEOPLE_FILTERS);
    if (activeTab === "companies") onCompanyFiltersChange(EMPTY_COMPANY_FILTERS);
  };

  // Shared between the desktop panel and the mobile Sheet — groups only.
  // Header + Clear All stay in the desktop wrapper (below) and get a
  // separate Clear All row inside the Sheet so we don't duplicate the
  // "Search Filters" title (SheetHeader already renders one).
  const renderGroups = () => (
    <>
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
    </>
  );

  return (
    <div className="flex flex-row sm:flex-col" style={{ position: "sticky", top: 8, gap: 6 }}>
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

          {renderGroups()}
        </div>
      )}

      {/* Mobile filters trigger — sits inline with the tab pills since the
          outer container is flex-row on mobile (RocketReach-style compact row). */}
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
                <div className="flex items-center justify-between">
                  <SheetTitle style={{ fontSize: 15 }}>Search Filters</SheetTitle>
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
              </SheetHeader>
              {renderGroups()}
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}
