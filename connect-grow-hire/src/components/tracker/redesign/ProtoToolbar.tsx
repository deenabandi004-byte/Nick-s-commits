import { MoreFiltersDropdown, type SortKey } from "./MoreFiltersDropdown";

// Toolbar row: search + More Filters + view-specific buttons + view toggle.
// Bookmarked toggle shows only in default view (proto line 1676).
// Import CSV / Export show only in spreadsheet view (proto line 1682-1695).

interface ProtoToolbarProps {
  view: "default" | "spreadsheet";
  onChangeView: (view: "default" | "spreadsheet") => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortKey: SortKey | null;
  activeFilters: Set<string>;
  onSortChange: (key: SortKey | null) => void;
  onFilterToggle: (id: string) => void;
  onClearFilters: () => void;
  bookmarkedOnly: boolean;
  onToggleBookmarkedOnly: () => void;
  // Stubbed-to-toast in PR1.
  onImportCsv: () => void;
  onExport: () => void;
}

export function ProtoToolbar({
  view,
  onChangeView,
  searchQuery,
  onSearchChange,
  sortKey,
  activeFilters,
  onSortChange,
  onFilterToggle,
  onClearFilters,
  bookmarkedOnly,
  onToggleBookmarkedOnly,
  onImportCsv,
  onExport,
}: ProtoToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="search-wrap">
          <svg width="17.575" height="17.575" viewBox="0 0 17.575 17.575" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6.5 13C4.68333 13 3.146 12.3707 1.888 11.112C0.63 9.85333 0.000667196 8.316 5.29101e-07 6.5C-0.000666138 4.684 0.628667 3.14667 1.888 1.888C3.14733 0.629333 4.68467 0 6.5 0C8.31533 0 9.853 0.629333 11.113 1.888C12.373 3.14667 13.002 4.684 13 6.5C13 7.23333 12.8833 7.925 12.65 8.575C12.4167 9.225 12.1 9.8 11.7 10.3L17.3 15.9C17.4833 16.0833 17.575 16.3167 17.575 16.6C17.575 16.8833 17.4833 17.1167 17.3 17.3C17.1167 17.4833 16.8833 17.575 16.6 17.575C16.3167 17.575 16.0833 17.4833 15.9 17.3L10.3 11.7C9.8 12.1 9.225 12.4167 8.575 12.65C7.925 12.8833 7.23333 13 6.5 13ZM6.5 11C7.75 11 8.81267 10.5627 9.688 9.688C10.5633 8.81333 11.0007 7.75067 11 6.5C10.9993 5.24933 10.562 4.187 9.688 3.313C8.814 2.439 7.75133 2.00133 6.5 2C5.24867 1.99867 4.18633 2.43633 3.313 3.313C2.43967 4.18967 2.002 5.252 2 6.5C1.998 7.748 2.43567 8.81067 3.313 9.688C4.19033 10.5653 5.25267 11.0027 6.5 11Z" fill="#64748B" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search by Name, Company or Title..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <MoreFiltersDropdown
          sortKey={sortKey}
          activeFilters={activeFilters}
          onSortChange={onSortChange}
          onFilterToggle={onFilterToggle}
          onClearAll={onClearFilters}
        />

        {view === "default" && (
          <button
            type="button"
            className={`toolbar-pill toolbar-pill-bookmark${bookmarkedOnly ? " active" : ""}`}
            onClick={onToggleBookmarkedOnly}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.8333 14.5L8.16667 11.8333L3.5 14.5V3.83333C3.5 3.47971 3.64048 3.14057 3.89052 2.89052C4.14057 2.64048 4.47971 2.5 4.83333 2.5H11.5C11.8536 2.5 12.1928 2.64048 12.4428 2.89052C12.6929 3.14057 12.8333 3.47971 12.8333 3.83333V14.5Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Bookmarked
          </button>
        )}

        {view === "spreadsheet" && (
          <>
            <button type="button" className="toolbar-pill" onClick={onImportCsv}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 10V2M8 2L5 5M8 2L11 5" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.67 10v2.67c0 .74.6 1.33 1.33 1.33h8c.74 0 1.33-.6 1.33-1.33V10" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Import CSV
            </button>
            <button type="button" className="toolbar-pill" onClick={onExport}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.67 10v2.67c0 .74.6 1.33 1.33 1.33h8c.74 0 1.33-.6 1.33-1.33V10" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export
            </button>
          </>
        )}
      </div>

      <div className="view-toggle">
        <button
          type="button"
          className={`view-toggle-btn${view === "default" ? " active" : ""}`}
          onClick={() => onChangeView("default")}
        >
          Default
        </button>
        <button
          type="button"
          className={`view-toggle-btn${view === "spreadsheet" ? " active" : ""}`}
          onClick={() => onChangeView("spreadsheet")}
        >
          Spreadsheet
        </button>
      </div>
    </div>
  );
}
