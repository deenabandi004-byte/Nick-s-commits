import { useMemo } from "react";
import { type ProtoContact, type ProtoSegment, PROTO_STAGES } from "@/pages/trackerAdapter";

// Sortable spreadsheet table. Renders ALL contacts including terminal-state
// ones (no_response / bounced / closed) so the complete table is honest, with
// the pipeline chip carrying their real backend label.

export type SpreadsheetSortKey = "email" | "company" | "role" | "pipeline";
export interface SpreadsheetSort {
  key: SpreadsheetSortKey;
  dir: "asc" | "desc";
}

const ROWS_PER_PAGE = 25;

interface ProtoSpreadsheetProps {
  contacts: ProtoContact[];
  activeSegment: ProtoSegment;
  onSelectSegment: (s: ProtoSegment) => void;
  sort: SpreadsheetSort | null;
  onSort: (key: SpreadsheetSortKey) => void;
  page: number;
  onChangePage: (page: number) => void;
  selectedRows: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAllVisible: (visible: ProtoContact[]) => void;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (id: string) => void;
  onDraft: (id: string) => void;
}

const SortArrow = () => (
  <span className="sort-arrows">
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 4l-2 2M5 4l2 2M5 4v8M11 12l-2-2M11 12l2-2M11 12V4" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

export function ProtoSpreadsheet({
  contacts,
  activeSegment,
  onSelectSegment,
  sort,
  onSort,
  page,
  onChangePage,
  selectedRows,
  onToggleRow,
  onToggleAllVisible,
  bookmarkedIds,
  onToggleBookmark,
  onDraft,
}: ProtoSpreadsheetProps) {
  const sortedContacts = useMemo(() => {
    if (!sort) return contacts;
    const mul = sort.dir === "asc" ? 1 : -1;
    const getVal = (c: ProtoContact): string => {
      if (sort.key === "email") return c.email;
      if (sort.key === "company") return c.company;
      if (sort.key === "role") return c.role.split(/\s*[@·]\s*/)[0];
      // pipeline: order by proto stage index, terminal contacts go last
      const idx = c.stage ? PROTO_STAGES.indexOf(c.stage) : 99;
      return String(idx).padStart(2, "0");
    };
    return [...contacts].sort((a, b) => getVal(a).localeCompare(getVal(b)) * mul);
  }, [contacts, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedContacts.length / ROWS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * ROWS_PER_PAGE;
  const visible = sortedContacts.slice(start, start + ROWS_PER_PAGE);
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selectedRows.has(c.id));

  return (
    <div className="spreadsheet-view">
      <div className="spreadsheet-card">
        <div className="spreadsheet-scroll">
          <table className="spreadsheet-table">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <input
                    type="checkbox"
                    className="row-checkbox"
                    checked={allVisibleSelected}
                    onChange={() => onToggleAllVisible(visible)}
                    aria-label="Select all visible rows"
                  />
                </th>
                <th>Contact</th>
                <th><span className="th-sortable" onClick={() => onSort("email")}>Email <SortArrow /></span></th>
                <th><span className="th-sortable" onClick={() => onSort("company")}>Company <SortArrow /></span></th>
                <th><span className="th-sortable" onClick={() => onSort("role")}>Role <SortArrow /></span></th>
                <th><span className="th-sortable" onClick={() => onSort("pipeline")}>Pipeline <SortArrow /></span></th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const roleOnly = c.role.split(/\s*[@·]\s*/)[0];
                const isBookmarked = bookmarkedIds.has(c.id);
                const isTerminal = c.stage === null;
                return (
                  <tr key={c.id}>
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        className="row-checkbox"
                        checked={selectedRows.has(c.id)}
                        onChange={() => onToggleRow(c.id)}
                        aria-label={`Select ${c.name}`}
                      />
                    </td>
                    <td>{c.name}</td>
                    <td>{c.email}</td>
                    <td>{c.company}</td>
                    <td>{roleOnly}</td>
                    <td>
                      <span className={`pipeline-chip${isTerminal ? " terminal" : ""}`}>
                        {c.pipelineLabel}
                      </span>
                    </td>
                    <td>
                      <div className="action-cell">
                        <button type="button" className="action-icon" data-tooltip="Draft email" aria-label="Draft email" onClick={() => onDraft(c.id)}>
                          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M7.25 8.74L1.25 6.07L14.58 1.4L9.92 14.74L7.25 8.74Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M14.58 1.4L7.25 8.74" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={`action-icon${isBookmarked ? " active" : ""}`}
                          data-tooltip="Bookmark"
                          aria-label="Bookmark"
                          aria-pressed={isBookmarked}
                          onClick={() => onToggleBookmark(c.id)}
                        >
                          <svg viewBox="0 0 16 16" fill={isBookmarked ? "currentColor" : "none"} xmlns="http://www.w3.org/2000/svg">
                            <path d="M12.83 14.5L8.17 11.83L3.5 14.5V3.83C3.5 3.10 4.10 2.5 4.83 2.5H11.5C12.23 2.5 12.83 3.10 12.83 3.83V14.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="spreadsheet-footer">
        <div className="segment-pills">
          <button
            type="button"
            className={`segment-pill${activeSegment === "people" ? " active" : ""}`}
            onClick={() => onSelectSegment("people")}
          >
            People
          </button>
          <button
            type="button"
            className={`segment-pill${activeSegment === "hiringManagers" ? " active" : ""}`}
            onClick={() => onSelectSegment("hiringManagers")}
          >
            Hiring Managers
          </button>
        </div>
        <div className="row-count">
          {selectedRows.size} of {sortedContacts.length} row(s) selected.
        </div>
        <div className="pagination">
          <span className="page-info">Page {safePage} of {totalPages}</span>
          <button type="button" className="page-btn" onClick={() => onChangePage(1)} disabled={safePage === 1} aria-label="First page">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 4L6 8L10 12" />
              <path d="M6 4L2 8L6 12" />
            </svg>
          </button>
          <button type="button" className="page-btn" onClick={() => onChangePage(safePage - 1)} disabled={safePage === 1} aria-label="Previous page">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 4L6 8L10 12" />
            </svg>
          </button>
          <button type="button" className="page-btn" onClick={() => onChangePage(safePage + 1)} disabled={safePage === totalPages} aria-label="Next page">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4L10 8L6 12" />
            </svg>
          </button>
          <button type="button" className="page-btn" onClick={() => onChangePage(totalPages)} disabled={safePage === totalPages} aria-label="Last page">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4L10 8L6 12" />
              <path d="M10 4L14 8L10 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
