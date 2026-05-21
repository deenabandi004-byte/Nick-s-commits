import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Upload,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Search as SearchIcon,
  Mail,
  ExternalLink,
  Trash2,
  Layers,
  List,
  StickyNote,
} from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { firebaseApi } from "@/services/firebaseApi";
import { getCompanyLogoUrl } from "@/utils/suggestionChips";

type TabId = "people" | "companies" | "managers";

const TABS: { id: TabId; label: string }[] = [
  { id: "people", label: "People" },
  { id: "companies", label: "Companies" },
  { id: "managers", label: "Hiring Managers" },
];

// ── People Table ─────────────────────────────────────────────────────────────

interface PersonRow {
  id: string;
  name: string;
  email?: string;
  linkedinUrl?: string;
  role?: string;
  company?: string;
  location?: string;
  school?: string;
  schoolYear?: string;
  status?: string;
  warmthTier?: string;
  isAlumni?: boolean;
  notes?: string;
}

type SortCol = "name" | "company" | "role" | "school" | null;

interface PeopleTableProps {
  rows: PersonRow[];
  query: string;
  companyFilter: string | null;
  groupByCompany: boolean;
  onDelete?: (id: string) => void;
  onSaveNote?: (id: string, note: string) => void;
}

const PeopleTable: React.FC<PeopleTableProps> = ({
  rows,
  query,
  companyFilter,
  groupByCompany,
  onDelete,
  onSaveNote,
}) => {
  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedCompanies, setCollapsedCompanies] = useState<Set<string>>(new Set());
  // Track which row's note panel is open + the in-flight draft text. Drafts
  // commit to Firestore via onSaveNote on blur or panel-close so we don't
  // hammer the network on every keystroke.
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const commitNote = (id: string, original: string | undefined) => {
    const draft = noteDrafts[id];
    if (draft === undefined) return;
    if ((draft || "") === (original || "")) return;
    onSaveNote?.(id, draft);
  };

  const toggleSort = (col: SortCol) => {
    if (col === null) return;
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Apply search query + company filter + sort
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (companyFilter && (r.company || "").toLowerCase() !== companyFilter.toLowerCase()) {
        return false;
      }
      if (q) {
        const hay = `${r.name} ${r.email || ""} ${r.company || ""} ${r.role || ""} ${r.school || ""} ${r.status || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sortCol) {
      const dirMul = sortDir === "asc" ? 1 : -1;
      const key = sortCol;
      out = [...out].sort((a, b) => {
        const av = ((a as any)[key] || "").toString().toLowerCase();
        const bv = ((b as any)[key] || "").toString().toLowerCase();
        return av.localeCompare(bv) * dirMul;
      });
    }
    return out;
  }, [rows, query, companyFilter, sortCol, sortDir]);

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  // Group rows by company if enabled
  const grouped = useMemo(() => {
    if (!groupByCompany) return null;
    const m = new Map<string, PersonRow[]>();
    for (const r of filtered) {
      const key = r.company || "(no company)";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    // Sort companies by count descending
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered, groupByCompany]);

  const SortIcon: React.FC<{ col: SortCol }> = ({ col }) => {
    if (sortCol !== col || col === null) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3 ml-0.5" />
    ) : (
      <ChevronDown className="inline h-3 w-3 ml-0.5" />
    );
  };

  // Column widths - 7 columns (Status also removed; not enough signal yet to
  // justify the column). Each cell uses overflow truncation so long values
  // like "investment banking analyst" don't bleed into adjacent cells.
  const COLS = "28px minmax(180px, 1.5fr) 64px minmax(140px, 1.1fr) minmax(170px, 1.25fr) minmax(150px, 1.1fr) 76px";

  const HeaderRow = (
    <div
      className="grid items-center px-4 py-2.5 border-b border-line"
      style={{ gridTemplateColumns: COLS, background: "var(--paper-2, #FAFBFF)" }}
    >
      <Checkbox
        checked={selected.size === filtered.length && filtered.length > 0}
        onCheckedChange={toggleAll}
      />
      <button className="text-left" onClick={() => toggleSort("name")}>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
          Name<SortIcon col="name" />
        </span>
      </button>
      <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
        LinkedIn
      </span>
      <button className="text-left" onClick={() => toggleSort("company")}>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
          Company<SortIcon col="company" />
        </span>
      </button>
      <button className="text-left" onClick={() => toggleSort("role")}>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
          Role<SortIcon col="role" />
        </span>
      </button>
      <button className="text-left" onClick={() => toggleSort("school")}>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
          School<SortIcon col="school" />
        </span>
      </button>
      <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3 text-right">
        Actions
      </span>
    </div>
  );

  const renderRow = (row: PersonRow, isLast: boolean, idx: number) => {
    const noteOpen = openNoteId === row.id;
    const draftValue = noteDrafts[row.id] ?? row.notes ?? "";
    const hasNote = !!(row.notes && row.notes.trim());
    return (
      <React.Fragment key={row.id}>
        <div
      className={`grid items-center px-4 py-2.5 transition-colors ${
        isLast && !noteOpen ? "" : "border-b border-line-2"
      } ${idx % 2 === 1 ? "bg-paper-2/30" : ""} hover:bg-brand/[0.03]`}
      style={{ gridTemplateColumns: COLS }}
    >
      <Checkbox
        checked={selected.has(row.id)}
        onCheckedChange={() => toggleSelect(row.id)}
      />
      <div style={{ minWidth: 0 }}>
        <div className="text-[13px] font-medium text-ink truncate">{row.name}</div>
        {row.email && (
          <div className="font-mono text-[10.5px] text-ink-3 truncate">{row.email}</div>
        )}
      </div>
      <div>
        {row.linkedinUrl ? (
          <a
            href={row.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[#64748B] hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" /> view
          </a>
        ) : (
          <span className="text-ink-3"> - </span>
        )}
      </div>
      <div className="text-[12px] text-ink-2 truncate" style={{ minWidth: 0 }}>{row.company || " - "}</div>
      <div className="text-[12px] text-ink-2 truncate" style={{ minWidth: 0 }}>{row.role || " - "}</div>
      <div className="text-[12px] text-ink-2 truncate" style={{ minWidth: 0 }}>
        {row.school || (row.location ? <span className="text-ink-3">{row.location}</span> : " - ")}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-ink-3">
        {row.email && (
          <a
            href={`mailto:${row.email}`}
            title="Email"
            className="hover:text-ink p-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Mail className="h-3.5 w-3.5" />
          </a>
        )}
        {onSaveNote && (
          <button
            type="button"
            title={hasNote ? "Edit note" : "Add note"}
            className={`p-0.5 ${hasNote ? "text-[#64748B]" : "hover:text-ink"}`}
            onClick={(e) => {
              e.stopPropagation();
              if (noteOpen) {
                commitNote(row.id, row.notes);
                setOpenNoteId(null);
              } else {
                // Seed the draft with the current saved note (if any) so the
                // textarea opens with existing content rather than blank.
                if (noteDrafts[row.id] === undefined) {
                  setNoteDrafts((d) => ({ ...d, [row.id]: row.notes || "" }));
                }
                setOpenNoteId(row.id);
              }
            }}
          >
            <StickyNote className="h-3.5 w-3.5" fill={hasNote ? "currentColor" : "none"} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            title="Delete"
            className="hover:text-red-600 p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Remove ${row.name} from your network?`)) onDelete(row.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
        {noteOpen && (
          <div
            className={`px-4 py-3 ${isLast ? "" : "border-b border-line-2"}`}
            style={{ background: "var(--paper-2, #FAFBFF)" }}
          >
            <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <StickyNote className="h-3 w-3" style={{ color: "#64748B" }} />
              <span
                style={{
                  fontSize: 9.5,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#64748B",
                }}
              >
                Note · {row.name}
              </span>
            </div>
            <textarea
              value={draftValue}
              onChange={(e) => setNoteDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
              onBlur={() => commitNote(row.id, row.notes)}
              placeholder="Met at the GS info session - said to email after Friday. Mentioned the renewables team is hiring summer 2026."
              autoFocus
              rows={3}
              style={{
                width: "100%",
                fontSize: 12.5,
                lineHeight: 1.5,
                color: "var(--ink, #0F172A)",
                background: "white",
                border: "1px solid var(--line, #E2E8F0)",
                borderRadius: 4,
                padding: "8px 10px",
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => {
                  // Discard draft
                  setNoteDrafts((d) => {
                    const next = { ...d };
                    delete next[row.id];
                    return next;
                  });
                  setOpenNoteId(null);
                }}
                className="text-[11px] text-ink-3 hover:text-ink-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  commitNote(row.id, row.notes);
                  setOpenNoteId(null);
                }}
                className="text-[11px] font-medium text-[#64748B] hover:text-[#3F5878]"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="border border-line rounded-st-xl overflow-hidden bg-white">
      {HeaderRow}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-serif italic text-ink-3 text-[15px]">
            No matches. Try clearing the filter or importing a CSV.
          </p>
        </div>
      ) : groupByCompany && grouped ? (
        grouped.map(([company, items]) => {
          const collapsed = collapsedCompanies.has(company);
          return (
            <div key={company}>
              <button
                type="button"
                onClick={() => {
                  setCollapsedCompanies((prev) => {
                    const next = new Set(prev);
                    next.has(company) ? next.delete(company) : next.add(company);
                    return next;
                  });
                }}
                className="w-full flex items-center gap-2 px-4 py-2 bg-paper-2/60 border-b border-line-2 text-left hover:bg-paper-2"
              >
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 text-ink-3" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-ink-3" />
                )}
                <span className="text-[13px] font-medium text-ink">{company}</span>
                <span className="font-mono text-[10px] text-ink-3 ml-1">
                  {items.length}
                </span>
              </button>
              {!collapsed &&
                items.map((row, i) => renderRow(row, i === items.length - 1, i))}
            </div>
          );
        })
      ) : (
        filtered.map((row, i) => renderRow(row, i === filtered.length - 1, i))
      )}
    </div>
  );
};

// ── Companies Table ──────────────────────────────────────────────────────────

interface CompanyRow {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  hq?: string;
  alumni?: number;
  size?: string;
}

// Soft-blue color tokens used across both the list and grid views - picked to
// echo the landing-page palette (white surface, faint blue tint, slate-blue
// accent) the user called out as the target aesthetic.
const COMPANY_BLUE = "#64748B";
const COMPANY_BLUE_TINT = "rgba(91,119,153,0.08)";
const COMPANY_BLUE_TINT_HOVER = "rgba(91,119,153,0.12)";

interface CompanyLogoProps {
  name: string;
  size: number;
}

const CompanyLogo: React.FC<CompanyLogoProps> = ({ name, size }) => {
  // Render the favicon if we can resolve one; otherwise show a soft-blue
  // initial badge so every card has something colorful in the leftmost slot
  // (matches the user's "icon adds color" intent).
  const logo = getCompanyLogoUrl(name);
  const [errored, setErrored] = useState(false);
  const showFallback = !logo || errored;
  if (showFallback) {
    const initials = name
      .replace(/&/g, "and")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: COMPANY_BLUE_TINT,
          color: COMPANY_BLUE,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.42),
          fontWeight: 600,
          fontFamily: "'Inter', system-ui, sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        {initials || "·"}
      </div>
    );
  }
  return (
    <img
      src={logo}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        objectFit: "contain",
        flexShrink: 0,
        background: "white",
        border: "1px solid var(--line-2, #EEF2F8)",
      }}
    />
  );
};

const CompaniesTable: React.FC<{
  rows: CompanyRow[];
  onSelectCompany?: (name: string) => void;
}> = ({ rows, onSelectCompany }) => {
  // Companies sub-tab - defaults to list view (denser, scannable, matches the
  // rest of the network), with a toggle for grid view (visual cards).
  // Persists the user's choice in localStorage so it survives reloads.
  const [view, setView] = useState<"list" | "grid">(() => {
    try {
      const saved = localStorage.getItem("ofl_my_network_companies_view");
      if (saved === "grid") return "grid";
    } catch {}
    return "list";
  });
  const setViewPersisted = (next: "list" | "grid") => {
    setView(next);
    try {
      localStorage.setItem("ofl_my_network_companies_view", next);
    } catch {}
  };

  const ViewToggle = (
    <div
      style={{
        display: "inline-flex",
        background: "var(--paper-2, #FAFBFF)",
        border: "1px solid var(--line, #E2E8F0)",
        borderRadius: 6,
        padding: 2,
        marginBottom: 12,
      }}
    >
      {(["list", "grid"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setViewPersisted(v)}
          style={{
            padding: "5px 10px",
            fontSize: 11.5,
            fontWeight: 500,
            background: view === v ? "white" : "transparent",
            border: view === v ? "1px solid var(--line, #E2E8F0)" : "1px solid transparent",
            borderRadius: 4,
            color: view === v ? COMPANY_BLUE : "var(--ink-3, #94A3B8)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontFamily: "inherit",
            transition: "color .12s, background .12s",
          }}
        >
          {v === "list" ? <List className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
          {v === "list" ? "List" : "Grid"}
        </button>
      ))}
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="border border-line rounded-st-xl bg-white py-16 text-center">
        <p className="font-serif italic text-ink-3 text-[15px]">
          Save contacts from Find - companies show up here automatically.
        </p>
      </div>
    );
  }

  // ── LIST VIEW (default) ──────────────────────────────────────────────────
  if (view === "list") {
    return (
      <>
        {ViewToggle}
        <div
          className="border border-line rounded-st-xl overflow-hidden bg-white"
        >
          {rows.map((row, i) => {
            const isExploring = row.industry === "exploring";
            const count = row.alumni ?? 0;
            const isLast = i === rows.length - 1;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelectCompany?.(row.name)}
                disabled={!onSelectCompany}
                className={`w-full grid items-center transition-colors text-left ${
                  isLast ? "" : "border-b border-line-2"
                }`}
                style={{
                  gridTemplateColumns:
                    "44px minmax(180px, 1.5fr) 110px minmax(160px, 1.2fr) minmax(180px, 1.2fr)",
                  gap: 14,
                  padding: "12px 16px",
                  background: i % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white",
                  cursor: onSelectCompany ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (!onSelectCompany) return;
                  e.currentTarget.style.background = COMPANY_BLUE_TINT;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    i % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white";
                }}
              >
                <CompanyLogo name={row.name} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "var(--ink, #0F172A)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textTransform: "capitalize",
                    }}
                    title={row.name}
                  >
                    {row.name}
                  </div>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.04em",
                      padding: "3px 9px",
                      borderRadius: 4,
                      background: isExploring ? "transparent" : COMPANY_BLUE_TINT,
                      color: isExploring ? "var(--ink-3, #94A3B8)" : COMPANY_BLUE,
                      border: isExploring ? "1px dashed var(--line, #E2E8F0)" : "none",
                      textTransform: isExploring ? "uppercase" : "none",
                    }}
                  >
                    {isExploring
                      ? "exploring"
                      : `${count} ${count === 1 ? "contact" : "contacts"}`}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-2, #475569)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={row.industry || ""}
                >
                  {!isExploring && row.industry ? row.industry : " - "}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3, #94A3B8)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={row.hq || ""}
                >
                  {row.hq || " - "}
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  // ── GRID VIEW ────────────────────────────────────────────────────────────
  return (
    <>
      {ViewToggle}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {rows.map((row) => {
          const isExploring = row.industry === "exploring";
          const count = row.alumni ?? 0;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectCompany?.(row.name)}
              disabled={!onSelectCompany}
              style={{
                textAlign: "left",
                padding: "14px 16px",
                background: "white",
                border: "1px solid var(--line, #E2E8F0)",
                borderRadius: 8,
                cursor: onSelectCompany ? "pointer" : "default",
                transition: "border-color .15s, background .15s",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 116,
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (!onSelectCompany) return;
                e.currentTarget.style.borderColor = COMPANY_BLUE;
                e.currentTarget.style.background = COMPANY_BLUE_TINT;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--line, #E2E8F0)";
                e.currentTarget.style.background = "white";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CompanyLogo name={row.name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink, #0F172A)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textTransform: "capitalize",
                    }}
                    title={row.name}
                  >
                    {row.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: isExploring ? COMPANY_BLUE : "var(--ink-3, #94A3B8)",
                      marginTop: 2,
                    }}
                  >
                    {isExploring
                      ? "exploring"
                      : `${count} ${count === 1 ? "contact" : "contacts"}`}
                  </div>
                </div>
              </div>
              {(row.industry && !isExploring) || row.hq ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    fontSize: 11.5,
                    color: "var(--ink-2, #475569)",
                    lineHeight: 1.4,
                    borderTop: "1px solid var(--line-2, #EEF2F8)",
                    paddingTop: 8,
                  }}
                >
                  {row.industry && !isExploring && (
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={row.industry}
                    >
                      {row.industry}
                    </div>
                  )}
                  {row.hq && (
                    <div
                      style={{
                        color: "var(--ink-3, #94A3B8)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={row.hq}
                    >
                      {row.hq}
                    </div>
                  )}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
};

// ── Hiring Managers Table ────────────────────────────────────────────────────

interface ManagerRow {
  id: string;
  name: string;
  email?: string;
  linkedinUrl?: string;
  title?: string;
  roleHiringFor?: string;
  jobUrl?: string;
  company?: string;
  location?: string;
  dateAdded?: string;
}

const ManagersTable: React.FC<{ rows: ManagerRow[] }> = ({ rows }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  // Format dateAdded → "3d", "2w", "1mo" relative
  const formatAdded = (iso: string | undefined): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
    if (days < 1) return "today";
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  };

  // 7 columns: checkbox | Name+email | LinkedIn | Title | Role hiring for | Company | Added.
  // Location dropped - it isn't captured for most rows so the column was just
  // a sea of em-dashes that wasted horizontal space.
  const COLS = "28px minmax(190px, 1.5fr) 64px minmax(150px, 1.1fr) minmax(190px, 1.4fr) minmax(150px, 1.1fr) 64px";

  return (
    <div className="border border-line rounded-st-xl overflow-hidden bg-white">
      <div
        className="grid items-center px-4 py-2.5 border-b border-line"
        style={{ gridTemplateColumns: COLS, background: "var(--paper-2, #FAFBFF)" }}
      >
        <Checkbox
          checked={selected.size === rows.length && rows.length > 0}
          onCheckedChange={toggleAll}
        />
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Name</span>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">LinkedIn</span>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Title</span>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Hiring for</span>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Company</span>
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3 text-right">Added</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-serif italic text-ink-3 text-[15px]">
            No hiring managers yet. Save them from Job Board → Find Hiring Manager.
          </p>
        </div>
      ) : (
        rows.map((row, i) => (
          <div
            key={row.id}
            className={`grid items-center px-4 py-2.5 transition-colors hover:bg-brand/[0.03] ${
              i % 2 === 1 ? "bg-paper-2/30" : ""
            } ${i < rows.length - 1 ? "border-b border-line-2" : ""}`}
            style={{ gridTemplateColumns: COLS }}
          >
            <Checkbox
              checked={selected.has(row.id)}
              onCheckedChange={() => toggleSelect(row.id)}
            />
            <div style={{ minWidth: 0 }}>
              <div className="text-[13px] font-medium text-ink truncate">{row.name}</div>
              {row.email && (
                <div className="font-mono text-[10.5px] text-ink-3 truncate">{row.email}</div>
              )}
            </div>
            <div>
              {row.linkedinUrl ? (
                <a
                  href={row.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#64748B] hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> view
                </a>
              ) : (
                <span className="text-ink-3"> - </span>
              )}
            </div>
            <div className="text-[12px] text-ink-2 truncate" style={{ minWidth: 0 }}>
              {row.title || " - "}
            </div>
            <div className="truncate" style={{ minWidth: 0 }}>
              {row.jobUrl ? (
                <a
                  href={row.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-[#64748B] hover:underline truncate inline-block max-w-full align-bottom"
                  title={row.roleHiringFor || ""}
                >
                  {row.roleHiringFor || "view posting"}
                </a>
              ) : (
                <span className="text-[12px] text-ink-2 truncate inline-block max-w-full align-bottom">
                  {row.roleHiringFor || " - "}
                </span>
              )}
            </div>
            <div className="text-[12px] text-ink-2 truncate" style={{ minWidth: 0 }}>
              {row.company || " - "}
            </div>
            <div className="font-mono text-[10.5px] text-ink-3 text-right">
              {formatAdded(row.dateAdded)}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

const capitalizeName = (s: string) =>
  s.replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\.[a-z]/g, c => c.toUpperCase());

// ── Main Page ────────────────────────────────────────────────────────────────

const MyNetworkPage: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();

  const activeTab: TabId = tab === "companies" ? "companies" : tab === "managers" ? "managers" : "people";

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);

  // "Exploring" companies - a localStorage watch-list populated when the user
  // clicks a company card on Find > Companies. These bubble to the top of the
  // Companies sub-tab as candidates the user is investigating but hasn't yet
  // saved any people from. Reset on every render so the list stays fresh
  // when a user navigates back from the Find page.
  const [exploringCompanies, setExploringCompanies] = useState<Array<{ name: string; ts: number }>>(
    () => {
      try {
        const raw = localStorage.getItem("ofl_exploring_companies") || "[]";
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    },
  );
  useEffect(() => {
    // Re-read on every focus so newly-explored companies show up after the
    // user navigates back from Find without a full page reload.
    const handler = () => {
      try {
        const raw = localStorage.getItem("ofl_exploring_companies") || "[]";
        const list = JSON.parse(raw);
        setExploringCompanies(Array.isArray(list) ? list : []);
      } catch {}
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, []);

  // Companies are derived from saved People + the "exploring" watch list.
  // Saved-people companies always come first (sorted by count); exploring
  // companies that aren't already in the saved set fill in below with a
  // count of 0 and a "exploring" indicator.
  const companies = useMemo<CompanyRow[]>(() => {
    const buckets = new Map<string, { count: number; roles: Map<string, number>; locations: Map<string, number> }>();
    for (const p of people) {
      const co = (p.company || "").trim();
      if (!co) continue;
      let bucket = buckets.get(co);
      if (!bucket) {
        bucket = { count: 0, roles: new Map(), locations: new Map() };
        buckets.set(co, bucket);
      }
      bucket.count += 1;
      if (p.role) bucket.roles.set(p.role, (bucket.roles.get(p.role) || 0) + 1);
      if (p.location) bucket.locations.set(p.location, (bucket.locations.get(p.location) || 0) + 1);
    }
    const top = (m: Map<string, number>): string => {
      let best = "";
      let bestCount = 0;
      for (const [k, v] of m) {
        if (v > bestCount) { best = k; bestCount = v; }
      }
      return best;
    };
    const saved = [...buckets.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .map(([name, b]) => ({
        id: name,
        name,
        industry: top(b.roles),
        hq: top(b.locations),
        alumni: b.count,
      }));
    const savedKeys = new Set(saved.map((s) => s.name.toLowerCase()));
    const exploring = exploringCompanies
      .filter((e) => !savedKeys.has(e.name.toLowerCase()))
      .map((e) => ({
        id: `exploring:${e.name}`,
        name: e.name,
        industry: "exploring",
        hq: "",
        alumni: 0,
      }));
    return [...saved, ...exploring];
  }, [people, exploringCompanies]);

  // Filter / view state for the People table (lifted to parent so the filter
  // bar and the table render from one source of truth).
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [groupByCompany, setGroupByCompany] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    // Load people from contacts. Field names match the Firestore Contact shape
    // (firstName/lastName/jobTitle/company/email/linkedinUrl/college/location/
    // status/warmthTier) - NOT PDL's raw API names. Earlier mapping used
    // c.full_name / c.job_title which never exists in the saved docs, so every
    // row collapsed to "Unknown" / blanks.
    firebaseApi.getContacts(user.uid).then((contacts) => {
      setPeople(
        contacts.map((c: any) => {
          const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim();
          return {
            id: c.id || c.contactId || Math.random().toString(),
            name: fullName || c.name || "Unknown",
            email: c.email || undefined,
            linkedinUrl: c.linkedinUrl || c.linkedin_url || c.LinkedIn || undefined,
            role: c.jobTitle || c.title || c.Title || undefined,
            company: c.company || c.Company || undefined,
            location: c.location || undefined,
            school: c.college || c.College || undefined,
            schoolYear: c.schoolYear || undefined,
            status: c.status || undefined,
            warmthTier: c.warmthTier || undefined,
            isAlumni: !!c.isAlumni,
            notes: c.notes || undefined,
          };
        })
      );
    }).catch(() => {});

    // Companies - auto-derived from saved People. The "company tracker" is a
    // who-do-I-know-where view: for every distinct company in the user's saved
    // contacts, aggregate count + a representative role/location so the user
    // can scan their network by company instead of by person.

    // Load hiring managers. Same field-mapping fix as People - Firestore docs
    // use camelCase firstName/lastName/jobTitle/etc., NOT PDL's raw schema.
    firebaseApi.getRecruiters(user.uid).then((recs: any[]) => {
      setManagers(
        recs.map((r: any) => {
          const fullName = `${r.firstName || ""} ${r.lastName || ""}`.trim();
          return {
            id: r.id || Math.random().toString(),
            name: fullName || r.name || "Unknown",
            email: r.email || r.workEmail || undefined,
            linkedinUrl: r.linkedinUrl || undefined,
            title: r.jobTitle || r.title || undefined,
            roleHiringFor: r.associatedJobTitle || r.roleHiringFor || undefined,
            jobUrl: r.associatedJobUrl || undefined,
            company: r.company || undefined,
            location: r.location || undefined,
            dateAdded: r.dateAdded || r.createdAt || undefined,
          };
        })
      );
    }).catch(() => {});
  }, [user?.uid]);

  // Redirect bare /my-network to /my-network/people (AFTER all hooks)
  if (!tab) {
    return <Navigate to="/my-network/people" replace />;
  }

  const counts = {
    people: people.length,
    companies: companies.length,
    managers: managers.length,
  };

  const ctaLabel = activeTab === "companies" ? "Add company" : activeTab === "managers" ? "Add manager" : "Add person";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader
            title="My Network"
            rightContent={
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm">
                  <Upload className="h-3.5 w-3.5" />
                  Import CSV
                </Button>
                <Button variant="secondary" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button variant="default" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  {ctaLabel}
                </Button>
              </div>
            }
          />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[1100px] mx-auto px-6 py-5">
              {/* Tabs */}
              <div className="flex items-center gap-1 mb-5">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/my-network/${t.id}`, { replace: true })}
                    className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-all ${
                      activeTab === t.id
                        ? "text-ink border-ink"
                        : "text-ink-3 border-transparent hover:text-ink-2"
                    }`}
                  >
                    {t.label}
                    {counts[t.id] > 0 && (
                      <span className="font-mono text-[10px] bg-paper-2 px-1.5 py-0.5 rounded-st-sm">
                        {counts[t.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Filter bar (people only) */}
              {activeTab === "people" && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {/* Search */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-paper-2/60 border border-line rounded-md"
                    style={{ minWidth: 240 }}
                  >
                    <SearchIcon className="h-3.5 w-3.5 text-ink-3" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name, company, email..."
                      className="flex-1 bg-transparent outline-none text-[12.5px] text-ink placeholder:text-ink-3"
                    />
                  </div>

                  {/* Company filter */}
                  <select
                    value={companyFilter ?? ""}
                    onChange={(e) => setCompanyFilter(e.target.value || null)}
                    className="px-3 py-2 bg-paper-2/60 border border-line rounded-md text-[12.5px] text-ink-2 cursor-pointer outline-none"
                    style={{ minWidth: 180 }}
                  >
                    <option value="">All companies</option>
                    {(() => {
                      const counts = new Map<string, number>();
                      for (const p of people) {
                        const c = (p.company || "").trim();
                        if (!c) continue;
                        counts.set(c, (counts.get(c) || 0) + 1);
                      }
                      return [...counts.entries()]
                        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                        .map(([co, n]) => (
                          <option key={co} value={co}>
                            {co} ({n})
                          </option>
                        ));
                    })()}
                  </select>

                  {/* Group toggle */}
                  <button
                    type="button"
                    onClick={() => setGroupByCompany((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-md text-[12px] font-medium transition-colors ${
                      groupByCompany
                        ? "bg-[#64748B]/10 border-[#64748B] text-[#3F5878]"
                        : "bg-paper-2/60 border-line text-ink-3 hover:text-ink-2"
                    }`}
                    title="Toggle company grouping"
                  >
                    {groupByCompany ? (
                      <Layers className="h-3.5 w-3.5" />
                    ) : (
                      <List className="h-3.5 w-3.5" />
                    )}
                    {groupByCompany ? "Grouped by company" : "Group by company"}
                  </button>

                  {/* Clear */}
                  {(searchQuery || companyFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setCompanyFilter(null);
                      }}
                      className="text-[12px] text-ink-3 hover:text-ink-2 underline-offset-2 hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {/* Table */}
              {activeTab === "people" && (
                <PeopleTable
                  rows={people}
                  query={searchQuery}
                  companyFilter={companyFilter}
                  groupByCompany={groupByCompany}
                  onDelete={(id) => {
                    setPeople((prev) => prev.filter((p) => p.id !== id));
                    if (user?.uid) {
                      firebaseApi.deleteContact(user.uid, id).catch(() => {});
                    }
                  }}
                  onSaveNote={(id, note) => {
                    // Optimistic - patch local state immediately so the
                    // sticky-note icon goes "filled" without waiting on
                    // Firestore. Backend write fires in the background.
                    setPeople((prev) =>
                      prev.map((p) => (p.id === id ? { ...p, notes: note } : p)),
                    );
                    if (user?.uid) {
                      firebaseApi
                        .updateContact(user.uid, id, { notes: note })
                        .catch((err) => console.error("Failed to save note:", err));
                    }
                  }}
                />
              )}
              {activeTab === "companies" && (
                <>
                  <p className="text-[12px] text-ink-3 mb-3 leading-relaxed">
                    Companies where you've saved contacts, plus ones you're
                    exploring from Find. Click any card to see the people you
                    know there.
                  </p>
                  <CompaniesTable
                    rows={companies}
                    onSelectCompany={(name) => {
                      // Drill down: switch to People tab with this company
                      // pre-applied as the filter. The People view's company
                      // filter dropdown reads from the parent state, so we
                      // just set it and flip the active tab.
                      setSearchQuery("");
                      setCompanyFilter(name);
                      navigate("/my-network/people", { replace: true });
                    }}
                  />
                </>
              )}
              {activeTab === "managers" && <ManagersTable rows={managers} />}
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default MyNetworkPage;
