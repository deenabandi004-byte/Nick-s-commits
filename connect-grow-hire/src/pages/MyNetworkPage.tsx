import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Navigate } from "react-router-dom";
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
  ChevronLeft,
  Search as SearchIcon,
  Mail,
  Linkedin,
  Trash2,
  Layers,
  List,
  StickyNote,
  Loader2,
  Share2,
  Forward,
} from "lucide-react";
import ShareScout from "@/assets/share-scout.jpeg";
import { useQueryClient } from "@tanstack/react-query";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useTour } from "@/contexts/TourContext";
import { firebaseApi, type ManualFirm } from "@/services/firebaseApi";
import { apiService, type Firm, type OutboxThread, type ShareKind } from "@/services/api";
import { getCompanyLogoUrl } from "@/utils/suggestionChips";
import { CompanyLogo } from "@/components/CompanyLogo";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// LinkedIn URLs from PDL and contact imports often arrive without a scheme
// (e.g. "linkedin.com/in/foo"). A schemeless href is treated as a relative
// path by the browser, so the "view" link silently does nothing. Normalize
// to an absolute https URL before rendering.
function normalizeLinkedInUrl(url?: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("linkedin.com") || trimmed.startsWith("www.linkedin.com")) return `https://${trimmed}`;
  if (trimmed.startsWith("/in/")) return `https://www.linkedin.com${trimmed}`;
  if (trimmed.includes("linkedin") && trimmed.includes("/in/")) {
    const match = trimmed.match(/\/in\/[^\/\s]+/);
    if (match) return `https://www.linkedin.com${match[0]}`;
  }
  return `https://www.linkedin.com/in/${trimmed}`;
}

// LinkedIn profile link, rendered as the LinkedIn "in" mark (lucide `Linkedin`).
// Replaces the old "↗ view" text link across every My Network spreadsheet so
// the affordance is uniform (identical icon size everywhere). The icon keeps
// the row's existing slate link color (NOT recolored to a new accent) and stays
// square (h-4 w-4) so the logo isn't stretched. A subtle permanent underline
// sits just beneath the icon to signal it's a link; it darkens on hover.
// Returns null when there's no URL — callers that want a "-" placeholder render
// their own (matching the old per-row behavior).
const LinkedInLink: React.FC<{ url?: string; stopRowClick?: boolean }> = ({ url, stopRowClick }) => {
  if (!url) return null;
  return (
    <a
      href={normalizeLinkedInUrl(url)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stopRowClick ? (e) => e.stopPropagation() : undefined}
      title="View LinkedIn profile"
      aria-label="View LinkedIn profile"
      className="inline-flex shrink-0 pb-px text-[#64748B] border-b border-[#CBD5E1] hover:border-[#64748B] transition-colors"
    >
      <Linkedin className="h-4 w-4" />
    </a>
  );
};

// Renders a list of company groups with a list/grid view toggle and a
// grid-mode drill-in. Used by both People and Hiring Manager tabs when
// "Group by company" is on. Each group renders inside its own bordered
// rounded card; the inner table is supplied by the caller via renderTable.
interface CompanyGroup<T> {
  company: string;
  items: T[];
}

function GroupedShell<T>({
  groups,
  renderTable,
  viewMode,
}: {
  groups: CompanyGroup<T>[];
  renderTable: (group: CompanyGroup<T>) => React.ReactNode;
  viewMode: "list" | "grid";
}) {
  const [focused, setFocused] = useState<string | null>(null);

  // Reset drill-in whenever the parent flips view modes so we don't strand
  // the user on a focused company card after switching to List.
  useEffect(() => { setFocused(null); }, [viewMode]);

  const focusedGroup = focused ? groups.find((g) => g.company === focused) : null;

  const BackBar = focusedGroup && viewMode === "grid" ? (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setFocused(null)}
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to companies
      </button>
    </div>
  ) : null;

  const CompanyCard: React.FC<{ group: CompanyGroup<T> }> = ({ group }) => (
    <div className="border border-line rounded-st-xl overflow-hidden bg-white">
      <div
        className="flex items-center gap-2.5 border-b border-line-2"
        style={{ padding: "10px 16px", background: "var(--paper-2, #FAFBFF)" }}
      >
        {group.company !== "(no company)" && (
          <CompanyLogo company={group.company} size={22} rounded={5} />
        )}
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink, #0F172A)",
          }}
        >
          {group.company === "(no company)" ? "NO COMPANY" : group.company}
        </span>
        <span className="font-mono text-[10px] text-ink-3 ml-1">
          {group.items.length}
        </span>
      </div>
      {renderTable(group)}
    </div>
  );

  if (groups.length === 0) {
    return (
      <div className="border border-line rounded-st-xl bg-white py-16 text-center">
        <p className="font-serif italic text-ink-3 text-[15px]">
          Nothing to group yet. Save some contacts and they'll bucket up here.
        </p>
      </div>
    );
  }

  // Grid mode, focused: single company card with a back affordance above.
  if (viewMode === "grid" && focusedGroup) {
    return (
      <>
        {BackBar}
        <CompanyCard group={focusedGroup} />
      </>
    );
  }

  // Grid mode, overview: tile of clickable company cards.
  if (viewMode === "grid") {
    return (
      <>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {groups.map((g) => (
            <button
              key={g.company}
              type="button"
              onClick={() => setFocused(g.company)}
              className="border border-line rounded-st-xl bg-white hover:bg-paper-2 transition-colors text-left"
              style={{ padding: "14px 14px 12px", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(91,119,153,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "white"; }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                {g.company !== "(no company)" && (
                  <CompanyLogo company={g.company} size={32} rounded={6} />
                )}
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink, #0F172A)",
                  marginBottom: 4,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {g.company === "(no company)" ? "NO COMPANY" : g.company}
              </div>
              <div className="font-mono text-[10.5px] text-ink-3">
                {g.items.length} {g.items.length === 1 ? "contact" : "contacts"}
              </div>
            </button>
          ))}
        </div>
      </>
    );
  }

  // List mode: stack of bordered cards, one per company.
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <CompanyCard key={g.company} group={g} />
      ))}
    </div>
  );
}

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
  createdAt?: string;
  // Provenance — "agent" for Loop-discovered contacts, "mcp" for
  // contacts saved via the Claude/MCP integration, "" for manual.
  source?: string;
  // True for MCP-sourced contacts the user hasn't seen yet. We render
  // a one-time faint orange highlight on the row and POST to
  // /api/contacts/clear-mcp-unseen after the page loads so the highlight
  // doesn't persist across reloads.
  mcpUnseen?: boolean;
  sharedImport?: boolean;
}

type SortCol = "name" | "company" | "role" | "school" | null;

// Compact set of styles shared by every inline-add cell. Keeps the editable
// row visually distinct from data rows (white pill on tinted background) so
// the user knows the row is in draft state.
const ADD_INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  fontSize: 12.5,
  padding: "5px 7px",
  border: "1px solid var(--line, #E2E8F0)",
  borderRadius: 4,
  background: "white",
  outline: "none",
  fontFamily: "inherit",
  color: "var(--ink, #0F172A)",
};

const ADD_ROW_BG = "rgba(91,119,153,0.06)";

const AddPersonRow: React.FC<{
  cols: string;
  onCancel: () => void;
  onSave: (draft: {
    name: string; email?: string; linkedinUrl?: string;
    company?: string; role?: string; school?: string;
  }) => Promise<void>;
}> = ({ cols, onCancel, onSave }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedin] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [school, setSchool] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ name, email, linkedinUrl, company, role, school });
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  return (
    <div
      className="grid items-center px-4 py-2.5 border-b border-line-2"
      style={{ gridTemplateColumns: cols, background: ADD_ROW_BG }}
      onKeyDown={handleKey}
    >
      <div /> {/* checkbox slot */}
      <div /> {/* logo slot */}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        style={ADD_INPUT_STYLE}
      />
      <input
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Company"
        style={ADD_INPUT_STYLE}
      />
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Role / title"
        style={ADD_INPUT_STYLE}
      />
      <input
        value={school}
        onChange={(e) => setSchool(e.target.value)}
        placeholder="School"
        style={ADD_INPUT_STYLE}
      />
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-[11px] px-2 py-1 text-ink-3 hover:text-ink-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="text-[11px] px-2.5 py-1 rounded-st-sm bg-ink text-white font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {/* Secondary line for email + LinkedIn URL - tucked under the primary
          inputs so the row stays compact. Spans from the name column to the
          end of the grid. */}
      <div
        style={{
          gridColumn: "3 / -1",
          marginTop: 6,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional)"
          style={ADD_INPUT_STYLE}
        />
        <input
          value={linkedinUrl}
          onChange={(e) => setLinkedin(e.target.value)}
          placeholder="LinkedIn URL (optional)"
          style={ADD_INPUT_STYLE}
        />
      </div>
    </div>
  );
};

interface PeopleTableProps {
  rows: PersonRow[];
  query: string;
  companyFilter: string | null;
  groupByCompany: boolean;
  groupedView: "list" | "grid";
  recencyDir: "newest" | "oldest";
  highlightSince: number;
  // Set when arriving via /my-network/people?contact=<id> from a Loop
  // draft row (or any other deep-link source). The matching row scrolls
  // into view and gets a one-time tint so the jump destination is
  // unambiguous.
  focusContactId?: string | null;
  onDelete?: (id: string) => void;
  onSaveNote?: (id: string, note: string) => void;
  // Share a single row: selects just that contact and opens the share dialog.
  onShare?: (row: PersonRow) => void;
  // Selection is controlled by the parent so the bulk-delete pill can live
  // next to "Add person" in the filter bar instead of inside the table.
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  // Inline-add row controls: when addingMode is true the table renders a
  // blank editable row above the data; onSaveNew is called on save with the
  // collected fields; onCancelAdd dismisses the row without saving.
  addingMode?: boolean;
  onCancelAdd?: () => void;
  onSaveNew?: (draft: {
    name: string; email?: string; linkedinUrl?: string;
    company?: string; role?: string; school?: string;
  }) => Promise<void>;
}

const PeopleTable: React.FC<PeopleTableProps> = ({
  rows,
  query,
  companyFilter,
  groupByCompany,
  groupedView,
  recencyDir,
  highlightSince,
  focusContactId,
  onDelete,
  onSaveNote,
  onShare,
  selected,
  onSelectionChange,
  addingMode,
  onCancelAdd,
  onSaveNew,
}) => {
  const focusRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusContactId) return;
    const el = focusRowRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusContactId, rows]);
  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Track which row's note panel is open + the in-flight draft text. Drafts
  // commit to Firestore via onSaveNote on blur or panel-close so we don't
  // hammer the network on every keystroke.
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // Mail-icon deep-link: open this contact's conversation in /outbox. If a
  // thread already exists (deduped by lowercased email against the cached
  // trackerContacts list), reuse the existing focusEmail deep-link. If not,
  // synchronously generate a cold first-touch draft via the same
  // /emails/generate-and-draft path Find uses, then navigate. The endpoint
  // server-side backfills resume / template / signoff from Firestore — we
  // send only Name/Email/Company/Title so the generator falls back to
  // title+company anchors and never re-enriches via PDL.
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [generatingMailId, setGeneratingMailId] = useState<string | null>(null);

  // Scroll the ?contact= deep-link target into view once the rows are present.
  // The row's ring-highlight comes from rowBaseBg; this just brings it on
  // screen. Re-runs when rows arrive so a freshly-fetched target still lands.
  useEffect(() => {
    if (!focusContactId) return;
    const el = document.querySelector(`[data-contact-id="${focusContactId}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusContactId, rows]);

  const handleMailClick = useCallback(async (row: PersonRow) => {
    // Inert during the tour's My Network demo. The mail icon is the hero of
    // the step — the copy points at it — so the icon still renders, but a
    // click must NEVER reach apiService.getOutboxThreads or
    // generateAndDraftEmails against a seeded founder. This is the
    // load-bearing real-action guard for this surface.
    if ((row as PersonRow & { demo?: boolean }).demo) return;
    const email = (row.email || "").trim();
    if (!email) return;
    if (generatingMailId) return;
    const targetEmail = email.toLowerCase();

    // 1) Dedupe against the cached trackerContacts list. Cold cache → fetch
    //    once and prime so the inbox sees fresh data when it mounts.
    let threads = queryClient.getQueryData<OutboxThread[]>(["trackerContacts"]);
    if (!threads) {
      const res = await apiService.getOutboxThreads();
      if ("error" in res) {
        toast({ title: "Couldn't open inbox", description: res.error, variant: "destructive" });
        return;
      }
      threads = res.threads;
      queryClient.setQueryData(["trackerContacts"], threads);
    }

    const existing = threads.find((t) => (t.email || "").toLowerCase() === targetEmail);
    if (existing) {
      navigate("/outbox", { state: { focusEmail: email, segment: "people" } });
      return;
    }

    // 2) No thread yet — generate a cold draft for this single contact, then
    //    navigate. Backend dedupes the underlying contact doc by email, so a
    //    double-click race is safe. batch_generate_emails reads FirstName /
    //    LastName / Company / Title off the contact dict (see
    //    reply_generation.py:494-497); split the saved display name so the
    //    greeting renders "Hi <first>," instead of "Hi ,".
    const trimmedName = (row.name || "").trim();
    const firstSpace = trimmedName.indexOf(" ");
    const firstName = firstSpace === -1 ? trimmedName : trimmedName.slice(0, firstSpace);
    const lastName = firstSpace === -1 ? "" : trimmedName.slice(firstSpace + 1).trim();
    setGeneratingMailId(row.id);
    try {
      const result = await apiService.generateAndDraftEmails({
        contacts: [{
          FirstName: firstName,
          LastName: lastName,
          name: trimmedName,
          Email: email,
          Company: row.company || "",
          Title: row.role || "",
        }],
      });
      if ("error" in result) {
        toast({
          title: "Couldn't draft email",
          description: result.message || result.error,
          variant: "destructive",
        });
        return;
      }
      if (!result.success || !result.draft_count) {
        toast({
          title: "Couldn't draft email",
          description: "No draft was created. Check that Gmail is connected.",
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["trackerContacts"] });
      navigate("/outbox", { state: { focusEmail: email, segment: "people" } });
    } catch (e: any) {
      toast({
        title: "Couldn't draft email",
        description: e?.message || "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setGeneratingMailId(null);
    }
  }, [generatingMailId, navigate, queryClient]);

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
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
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
    } else {
      // Default order: most recently added contacts first (or oldest first
      // if the user flipped the sort dropdown). Missing createdAt sinks to
      // the bottom rather than jumbling with newer rows.
      const dirMul = recencyDir === "oldest" ? -1 : 1;
      out = [...out].sort((a, b) => {
        // Date.parse → NaN for malformed/empty strings; coerce to 0 so a row
        // with a bad timestamp sinks predictably instead of poisoning the
        // comparator (NaN math returns NaN, which leaves order unspecified).
        const at = a.createdAt ? Date.parse(a.createdAt) || 0 : 0;
        const bt = b.createdAt ? Date.parse(b.createdAt) || 0 : 0;
        // Stable name tiebreaker so rows that share a timestamp (or both lack
        // one) keep a deterministic order rather than jumbling on every
        // re-sort - mirrors the Companies merge sort below.
        return ((bt - at) * dirMul) || a.name.localeCompare(b.name);
      });
    }
    return out;
  }, [rows, query, companyFilter, sortCol, sortDir, recencyDir]);

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) onSelectionChange(new Set());
    else onSelectionChange(new Set(filtered.map((r) => r.id)));
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

  // Column widths - 7 columns: checkbox | company logo | name+linkedin |
  // company text | role | school | actions. The logo sits in its own column
  // right after the checkbox so the row visually echoes the Companies tab.
  // Each cell uses overflow truncation so long values don't bleed into
  // adjacent cells.
  const COLS = "28px 36px minmax(180px, 1.5fr) minmax(140px, 1.1fr) minmax(140px, 1fr) minmax(150px, 1.1fr) 104px";

  const HeaderRow = (
    <div
      className="grid items-center border-b border-line"
      style={{
        gridTemplateColumns: COLS,
        gap: 14,
        padding: "10px 16px",
        background: "var(--paper-2, #FAFBFF)",
      }}
    >
      <Checkbox
        checked={selected.size === filtered.length && filtered.length > 0}
        onCheckedChange={toggleAll}
      />
      <span /> {/* logo column - no header label */}
      <button className="text-left" onClick={() => toggleSort("name")}>
        <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
          Name<SortIcon col="name" />
        </span>
      </button>
      <button className="text-left" onClick={() => toggleSort("company")}>
        <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
          Company<SortIcon col="company" />
        </span>
      </button>
      <button className="text-left" onClick={() => toggleSort("role")}>
        <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
          Role<SortIcon col="role" />
        </span>
      </button>
      <button className="text-left" onClick={() => toggleSort("school")}>
        <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">
          School<SortIcon col="school" />
        </span>
      </button>
      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3 text-right">
        Actions
      </span>
    </div>
  );

  // Rows created after the last visit get a faint blue tint so the user can
  // spot what's new at a glance. The tint replaces the normal alternating
  // background for that row.
  //
  // MCP-sourced contacts that the user hasn't seen yet get a one-time
  // faint orange highlight (the same accent the focus tint uses, dimmer).
  // After the page loads we POST to /api/contacts/clear-mcp-unseen so the
  // highlight only shows on this one visit.
  const rowBaseBg = (row: PersonRow, idx: number): string => {
    if (focusContactId && row.id === focusContactId) return "rgba(224,122,62,0.12)";
    if (row.mcpUnseen) return "rgba(224,122,62,0.08)";
    if (row.sharedImport) return "rgba(34,197,94,0.10)";
    const ts = row.createdAt ? Date.parse(row.createdAt) : 0;
    if (highlightSince && ts > highlightSince) return "rgba(59,130,246,0.08)";
    return idx % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white";
  };

  const renderRow = (row: PersonRow, isLast: boolean, idx: number) => {
    const noteOpen = openNoteId === row.id;
    const draftValue = noteDrafts[row.id] ?? row.notes ?? "";
    const hasNote = !!(row.notes && row.notes.trim());
    const isFocused = !!(focusContactId && row.id === focusContactId);
    return (
      <React.Fragment key={row.id}>
        <div
      ref={isFocused ? focusRowRef : undefined}
      data-contact-id={row.id}
      className={`grid items-center transition-colors ${
        isLast && !noteOpen ? "" : "border-b border-line-2"
      }`}
      style={{
        gridTemplateColumns: COLS,
        gap: 14,
        padding: "12px 16px",
        background: rowBaseBg(row, idx),
        // Inherit the page's sans stack explicitly, matching the Companies
        // list rows (source of truth for typography) so all three tabs render
        // identical font family/size/weight.
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(91,119,153,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = rowBaseBg(row, idx); }}
    >
      <Checkbox
        checked={selected.has(row.id)}
        onCheckedChange={() => toggleSelect(row.id)}
      />
      <div className="flex items-center justify-center">
        {row.company ? (
          <CompanyLogo company={row.company} size={32} rounded={6} />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: "var(--paper-2, #FAFBFF)",
              border: "1px dashed var(--line, #E2E8F0)",
            }}
          />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink, #0F172A)" }}>{row.name}</div>
          {row.source === "agent" && (
            <span
              title="Discovered by a Loop"
              style={{
                flexShrink: 0,
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--ink-3, #64748B)",
                background: "var(--paper-2, #FAFBFF)",
                border: "1px solid var(--line, #E2E8F0)",
                borderRadius: 4,
                padding: "0 5px",
                lineHeight: "15px",
              }}
            >
              Loop
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {row.email && (
            <span className="font-mono text-[10.5px] text-ink-3 truncate">{row.email}</span>
          )}
          <LinkedInLink url={row.linkedinUrl} stopRowClick />
        </div>
      </div>
      <div className="text-[12px] text-ink-2 truncate" style={{ minWidth: 0 }}>
        {row.company || " - "}
      </div>
      <div className="text-[12px] text-ink-2 truncate" style={{ minWidth: 0 }}>{row.role || " - "}</div>
      <div className="text-[12px] text-ink-2 truncate" style={{ minWidth: 0 }}>
        {row.school || (row.location ? <span className="text-ink-3">{row.location}</span> : " - ")}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-ink-3">
        {onShare && (
          <button
            type="button"
            title="Share"
            className="hover:text-ink p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onShare(row);
            }}
          >
            <Forward className="h-3.5 w-3.5" />
          </button>
        )}
        {row.email && (
          <button
            type="button"
            title={generatingMailId === row.id ? "Drafting first email…" : "Open conversation"}
            className="hover:text-ink p-0.5 disabled:cursor-wait disabled:opacity-60"
            disabled={generatingMailId === row.id}
            onClick={(e) => {
              e.stopPropagation();
              handleMailClick(row);
            }}
          >
            {generatingMailId === row.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
          </button>
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
                  fontFamily: "inherit",
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
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: "var(--ink-2, #475569)",
                  background: "transparent",
                  border: "1px solid var(--line, #E2E8F0)",
                  borderRadius: 4,
                  padding: "5px 14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  commitNote(row.id, row.notes);
                  setOpenNoteId(null);
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: "#fff",
                  background: "var(--accent, #4A60A8)",
                  border: "1px solid var(--accent, #4A60A8)",
                  borderRadius: 4,
                  padding: "5px 14px",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

  const AddRow = addingMode && onSaveNew ? (
    <AddPersonRow
      cols={COLS}
      onCancel={() => onCancelAdd?.()}
      onSave={onSaveNew}
    />
  ) : null;

  // Grouped view renders one bordered card per company (via GroupedShell).
  // Each card's body is HeaderRow + that company's rows; the outer table
  // wrapper is supplied by GroupedShell's CompanyCard.
  if (groupByCompany && grouped) {
    return (
      <GroupedShell
        groups={grouped.map(([company, items]) => ({ company, items }))}
        viewMode={groupedView}
        renderTable={(group) => (
          <>
            {HeaderRow}
            {group.items.map((row, i) => renderRow(row, i === group.items.length - 1, i))}
          </>
        )}
      />
    );
  }

  return (
    <div className="border border-line rounded-st-xl overflow-hidden bg-white">
      {HeaderRow}
      {AddRow}
      {filtered.length === 0 && !addingMode ? (
        <div className="py-16 text-center">
          <p className="font-serif italic text-ink-3 text-[15px]">
            No matches. Try clearing the filter or importing a CSV.
          </p>
        </div>
      ) : filtered.length === 0 && addingMode ? null : (
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
  // Set only when this row corresponds to a user-saved manual_firms doc.
  // The Companies list is a merged view (saved people + saved firms + manual
  // entries + exploring), so most rows are derived and have nothing to delete
  // server-side. Only rows with a manualFirmId can participate in bulk-delete.
  manualFirmId?: string;
  // Most recent underlying timestamp (max of contact.createdAt, manual firm
  // createdAt, exploring ts) - used for recency highlight in My Network.
  recencyTs?: number;
  sharedImport?: boolean;
}

// Soft-blue color tokens used across both the list and grid views - picked to
// echo the landing-page palette (white surface, faint blue tint, slate-blue
// accent) the user called out as the target aesthetic.
const COMPANY_BLUE = "#64748B";
const COMPANY_BLUE_TINT = "rgba(91,119,153,0.08)";
const COMPANY_BLUE_TINT_HOVER = "rgba(91,119,153,0.12)";

interface ContactAvatarProps {
  name: string;
  size: number;
}

const ContactAvatar: React.FC<ContactAvatarProps> = ({ name, size }) => {
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

const COMPANIES_LIST_COLS =
  "28px 44px minmax(180px, 1.5fr) 110px minmax(160px, 1.2fr) minmax(180px, 1.2fr) 130px";

const AddCompanyRow: React.FC<{
  onCancel: () => void;
  onSave: (draft: { name: string; industry?: string; hq?: string }) => Promise<void>;
}> = ({ onCancel, onSave }) => {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [hq, setHq] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try { await onSave({ name, industry, hq }); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="grid items-center border-b border-line-2"
      style={{
        gridTemplateColumns: COMPANIES_LIST_COLS,
        gap: 14,
        padding: "12px 16px",
        background: ADD_ROW_BG,
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); handleSave(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
    >
      <div /> {/* checkbox slot */}
      <div /> {/* logo slot */}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Company name"
        style={ADD_INPUT_STYLE}
      />
      <div /> {/* contacts badge slot */}
      <input
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        placeholder="Industry"
        style={ADD_INPUT_STYLE}
      />
      <input
        value={hq}
        onChange={(e) => setHq(e.target.value)}
        placeholder="HQ / location"
        style={ADD_INPUT_STYLE}
      />
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-[11px] px-2 py-1 text-ink-3 hover:text-ink-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="text-[11px] px-2.5 py-1 rounded-st-sm bg-ink text-white font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};

const CompaniesTable: React.FC<{
  rows: CompanyRow[];
  onSelectCompany?: (name: string) => void;
  onFindPeople?: (row: CompanyRow) => void;
  // Bulk-selection is only enabled for rows backed by a manual_firms doc -
  // the other rows are derived from saved people / exploring localStorage
  // entries and have nothing to delete server-side.
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  highlightSince?: number;
  addingMode?: boolean;
  onCancelAdd?: () => void;
  onSaveNew?: (draft: { name: string; industry?: string; hq?: string }) => Promise<void>;
}> = ({ rows, onSelectCompany, onFindPeople, selected, onSelectionChange, highlightSince = 0, addingMode, onCancelAdd, onSaveNew }) => {
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

  if (rows.length === 0 && !addingMode) {
    return (
      <div className="border border-line rounded-st-xl bg-white py-16 text-center">
        <p className="font-serif italic text-ink-3 text-[15px]">
          Save contacts from Find - companies show up here automatically.
        </p>
      </div>
    );
  }

  const addRow = addingMode && onSaveNew ? (
    <AddCompanyRow onCancel={() => onCancelAdd?.()} onSave={onSaveNew} />
  ) : null;

  // ── LIST VIEW (default) ──────────────────────────────────────────────────
  if (view === "list") {
    const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const toggleAll = () => {
      if (allSelected) onSelectionChange(new Set());
      else onSelectionChange(new Set(rows.map((r) => r.id)));
    };
    return (
      <>
        {ViewToggle}
        <div
          className="border border-line rounded-st-xl overflow-hidden bg-white"
        >
          <div
            className="grid items-center border-b border-line"
            style={{
              gridTemplateColumns: COMPANIES_LIST_COLS,
              gap: 14,
              padding: "10px 16px",
              background: "var(--paper-2, #FAFBFF)",
            }}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            </div>
            <span /> {/* logo column */}
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Company</span>
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Contacts</span>
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Industry</span>
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">HQ</span>
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3 text-right">Actions</span>
          </div>
          {addRow}
          {rows.map((row, i) => {
            const isExploring = row.industry === "exploring";
            const count = row.alumni ?? 0;
            const isLast = i === rows.length - 1;
            const rowClickable = !!onSelectCompany;
            return (
              <div
                key={row.id}
                role={rowClickable ? "button" : undefined}
                tabIndex={rowClickable ? 0 : undefined}
                onClick={() => onSelectCompany?.(row.name)}
                onKeyDown={(e) => {
                  if (!rowClickable) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectCompany?.(row.name);
                  }
                }}
                className={`w-full grid items-center transition-colors text-left ${
                  isLast ? "" : "border-b border-line-2"
                }`}
                style={{
                  gridTemplateColumns: COMPANIES_LIST_COLS,
                  gap: 14,
                  padding: "12px 16px",
                  background: row.sharedImport
                    ? "rgba(34,197,94,0.10)"
                    : (highlightSince && (row.recencyTs || 0) > highlightSince)
                    ? "rgba(59,130,246,0.08)"
                    : (i % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white"),
                  cursor: rowClickable ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (!rowClickable) return;
                  if (!row.sharedImport) e.currentTarget.style.background = COMPANY_BLUE_TINT;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = row.sharedImport
                    ? "rgba(34,197,94,0.10)"
                    : (highlightSince && (row.recencyTs || 0) > highlightSince)
                    ? "rgba(59,130,246,0.08)"
                    : (i % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white");
                }}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => {
                      const next = new Set(selected);
                      next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                      onSelectionChange(next);
                    }}
                  />
                </div>
                <ContactAvatar name={row.name} size={32} />
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
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {onFindPeople && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFindPeople(row);
                      }}
                      title={`Find people at ${row.name}`}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 500,
                        fontFamily: "inherit",
                        color: COMPANY_BLUE,
                        background: "white",
                        border: `1px solid ${COMPANY_BLUE}`,
                        borderRadius: 4,
                        padding: "5px 10px",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "background .12s, color .12s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = COMPANY_BLUE;
                        e.currentTarget.style.color = "white";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "white";
                        e.currentTarget.style.color = COMPANY_BLUE;
                      }}
                    >
                      Find people →
                    </button>
                  )}
                </div>
              </div>
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
      {addRow && (
        <div className="border border-line rounded-st-xl overflow-hidden bg-white mb-3">
          {addRow}
        </div>
      )}
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
          const cardClickable = !!onSelectCompany;
          return (
            <div
              key={row.id}
              role={cardClickable ? "button" : undefined}
              tabIndex={cardClickable ? 0 : undefined}
              onClick={() => onSelectCompany?.(row.name)}
              onKeyDown={(e) => {
                if (!cardClickable) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectCompany?.(row.name);
                }
              }}
              style={{
                textAlign: "left",
                padding: "14px 16px",
                background: "white",
                border: "1px solid var(--line, #E2E8F0)",
                borderRadius: 8,
                cursor: cardClickable ? "pointer" : "default",
                transition: "border-color .15s, background .15s",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 116,
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (!cardClickable) return;
                e.currentTarget.style.borderColor = COMPANY_BLUE;
                e.currentTarget.style.background = COMPANY_BLUE_TINT;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--line, #E2E8F0)";
                e.currentTarget.style.background = "white";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ContactAvatar name={row.name} size={32} />
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
              {onFindPeople && (
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFindPeople(row);
                    }}
                    title={`Find people at ${row.name}`}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 500,
                      fontFamily: "inherit",
                      color: COMPANY_BLUE,
                      background: "white",
                      border: `1px solid ${COMPANY_BLUE}`,
                      borderRadius: 4,
                      padding: "5px 10px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "background .12s, color .12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = COMPANY_BLUE;
                      e.currentTarget.style.color = "white";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "white";
                      e.currentTarget.style.color = COMPANY_BLUE;
                    }}
                  >
                    Find people →
                  </button>
                </div>
              )}
            </div>
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
  sharedImport?: boolean;
}

const AddManagerRow: React.FC<{
  cols: string;
  onCancel: () => void;
  onSave: (draft: {
    name: string; email?: string; linkedinUrl?: string;
    title?: string; company?: string;
  }) => Promise<void>;
}> = ({ cols, onCancel, onSave }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedin] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try { await onSave({ name, email, linkedinUrl, title, company }); }
    finally { setSaving(false); }
  };

  return (
    <div
      className="grid items-center px-4 py-2.5 border-b border-line-2"
      style={{ gridTemplateColumns: cols, background: ADD_ROW_BG }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); handleSave(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
    >
      <div /> {/* checkbox slot */}
      <div /> {/* logo slot */}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        style={ADD_INPUT_STYLE}
      />
      <input
        value={linkedinUrl}
        onChange={(e) => setLinkedin(e.target.value)}
        placeholder="LinkedIn URL"
        style={ADD_INPUT_STYLE}
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        style={ADD_INPUT_STYLE}
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        style={ADD_INPUT_STYLE}
      />
      <input
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Company"
        style={ADD_INPUT_STYLE}
      />
      <div /> {/* Added slot - empty for in-progress add row */}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-[11px] px-2 py-1 text-ink-3 hover:text-ink-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="text-[11px] px-2.5 py-1 rounded-st-sm bg-ink text-white font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};

const ManagersTable: React.FC<{
  rows: ManagerRow[];
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  groupByCompany?: boolean;
  groupedView?: "list" | "grid";
  highlightSince?: number;
  addingMode?: boolean;
  onCancelAdd?: () => void;
  onSaveNew?: (draft: {
    name: string; email?: string; linkedinUrl?: string;
    title?: string; company?: string;
  }) => Promise<void>;
}> = ({ rows, selected, onSelectionChange, groupByCompany, groupedView = "list", highlightSince = 0, addingMode, onCancelAdd, onSaveNew }) => {
  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (selected.size === rows.length && rows.length > 0) onSelectionChange(new Set());
    else onSelectionChange(new Set(rows.map((r) => r.id)));
  };

  // Mail-icon deep-link for the Hiring Managers tab. Mirrors PeopleTable's
  // handler with three deltas: deep-link uses segment "hiringManagers" to
  // match RecruiterSpreadsheetPage; the cold-generate path overrides the
  // user's saved email purpose with "referral" (more appropriate than the
  // networking default for a hiring-manager ask); and a fitContext carrying
  // roleHiringFor + company is threaded through when present so the LLM has
  // the job hook for a stronger referral ask. The override is per-call only
  // and we merge the rest of the user's saved template back in (signoff +
  // signature already have fallback in emails.py, but stylePreset and
  // customInstructions don't — without the merge the user would lose their
  // tuned voice for this single email).
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [generatingMailId, setGeneratingMailId] = useState<string | null>(null);

  const handleMailClick = useCallback(async (row: ManagerRow) => {
    const email = (row.email || "").trim();
    if (!email) return;
    if (generatingMailId) return;
    const targetEmail = email.toLowerCase();

    // 1) Dedupe against the cached trackerContacts list (same key the
    //    inbox uses).
    let threads = queryClient.getQueryData<OutboxThread[]>(["trackerContacts"]);
    if (!threads) {
      const res = await apiService.getOutboxThreads();
      if ("error" in res) {
        toast({ title: "Couldn't open inbox", description: res.error, variant: "destructive" });
        return;
      }
      threads = res.threads;
      queryClient.setQueryData(["trackerContacts"], threads);
    }

    const existing = threads.find((t) => (t.email || "").toLowerCase() === targetEmail);
    if (existing) {
      navigate("/outbox", { state: { focusEmail: email, segment: "hiringManagers" } });
      return;
    }

    // 2) No thread — fetch the user's saved email template (cached for the
    //    session), merge with our per-call purpose override, then generate
    //    a cold referral draft. The endpoint runs an OpenAI call + Gmail
    //    draft creation in series and routinely takes 15-30s. A persistent
    //    toast (use-toast.ts keeps it up until explicitly dismissed) sets
    //    expectations so the row-level spinner doesn't read as "frozen."
    //    We explicitly dismiss it on every exit path (success, both error
    //    branches, catch) so behavior doesn't depend on TOAST_LIMIT=1
    //    silently replacing it.
    setGeneratingMailId(row.id);
    const drafting = toast({
      title: "Drafting referral email…",
      description: "Generating a personalized first email — this usually takes 15–30 seconds.",
    });
    try {
      const savedTemplate = await queryClient.fetchQuery({
        queryKey: ["emailTemplate"],
        queryFn: () => apiService.getEmailTemplate(),
        staleTime: 5 * 60 * 1000,
      });

      const trimmedName = (row.name || "").trim();
      const firstSpace = trimmedName.indexOf(" ");
      const firstName = firstSpace === -1 ? trimmedName : trimmedName.slice(0, firstSpace);
      const lastName = firstSpace === -1 ? "" : trimmedName.slice(firstSpace + 1).trim();
      const roleHiringFor = (row.roleHiringFor || "").trim();

      const payload: Parameters<typeof apiService.generateAndDraftEmails>[0] & {
        emailTemplate?: Record<string, any>;
        fitContext?: { job_title: string; company: string };
      } = {
        contacts: [{
          FirstName: firstName,
          LastName: lastName,
          name: trimmedName,
          Email: email,
          Company: row.company || "",
          Title: row.title || "",
        }],
        emailTemplate: {
          ...(savedTemplate || {}),
          purpose: "referral",
        },
      };
      if (roleHiringFor) {
        payload.fitContext = { job_title: roleHiringFor, company: row.company || "" };
      }

      const result = await apiService.generateAndDraftEmails(payload as any);
      if ("error" in result) {
        drafting.dismiss();
        toast({
          title: "Couldn't draft email",
          description: result.message || result.error,
          variant: "destructive",
        });
        return;
      }
      if (!result.success || !result.draft_count) {
        drafting.dismiss();
        toast({
          title: "Couldn't draft email",
          description: "No draft was created. Check that Gmail is connected.",
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["trackerContacts"] });
      drafting.dismiss();
      navigate("/outbox", { state: { focusEmail: email, segment: "hiringManagers" } });
    } catch (e: any) {
      drafting.dismiss();
      toast({
        title: "Couldn't draft email",
        description: e?.message || "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setGeneratingMailId(null);
    }
  }, [generatingMailId, navigate, queryClient]);

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

  // 9 columns: checkbox | company logo | Name+email | LinkedIn | Title |
  // Role hiring for | Company text | Added | Actions. The Actions column
  // mirrors PeopleTable's 76px slot; today it holds only the mail icon, but
  // the cell uses the same flex container as People so note/delete can be
  // dropped in later without re-doing the grid. Minimums trimmed (Name 190→
  // 170, LinkedIn 64→56, Title 150→130, Hiring for 190→150, Company 150→
  // 130, Added 64→56) so the 9 tracks + 8×14px gaps + 32px row padding fit
  // inside the page container's max-w-[1100px] (≈1052px usable) — without
  // these trims the 76px Actions track overflows and `overflow-hidden` on
  // the table wrapper clips it off the right edge. fr max-widths are
  // unchanged so columns still expand on wider viewports.
  const COLS = "28px 36px minmax(170px, 1.5fr) 56px minmax(130px, 1.1fr) minmax(150px, 1.4fr) minmax(130px, 1.1fr) 56px 76px";

  const HeaderRow = (
    <div
      className="grid items-center border-b border-line"
      style={{
        gridTemplateColumns: COLS,
        gap: 14,
        padding: "10px 16px",
        background: "var(--paper-2, #FAFBFF)",
      }}
    >
      <Checkbox
        checked={selected.size === rows.length && rows.length > 0}
        onCheckedChange={toggleAll}
      />
      <span /> {/* logo column - no header label */}
      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Name</span>
      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">LinkedIn</span>
      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Title</span>
      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Hiring for</span>
      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3">Company</span>
      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-ink-3 text-right">Added</span>
      <span /> {/* actions column - no header label, matches People */}
    </div>
  );

  const rowBaseBg = (row: ManagerRow, i: number): string => {
    if (row.sharedImport) return "rgba(34,197,94,0.10)";
    const ts = row.dateAdded ? Date.parse(row.dateAdded) : 0;
    if (highlightSince && ts > highlightSince) return "rgba(59,130,246,0.08)";
    return i % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white";
  };

  const renderRow = (row: ManagerRow, isLast: boolean, i: number) => (
    <div
      key={row.id}
      className={`grid items-center transition-colors ${isLast ? "" : "border-b border-line-2"}`}
      style={{
        gridTemplateColumns: COLS,
        gap: 14,
        padding: "12px 16px",
        background: rowBaseBg(row, i),
        // Match the Companies list rows (typography source of truth) so the
        // Hiring Managers tab uses the same inherited font family/size/weight.
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(91,119,153,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = rowBaseBg(row, i); }}
    >
      <Checkbox
        checked={selected.has(row.id)}
        onCheckedChange={() => toggleSelect(row.id)}
      />
      <div className="flex items-center justify-center">
        {row.company ? (
          <CompanyLogo company={row.company} size={32} rounded={6} />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: "var(--paper-2, #FAFBFF)",
              border: "1px dashed var(--line, #E2E8F0)",
            }}
          />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink, #0F172A)" }}>{row.name}</div>
        {row.email && (
          <div className="font-mono text-[10.5px] text-ink-3 truncate">{row.email}</div>
        )}
      </div>
      <div>
        {row.linkedinUrl ? (
          <LinkedInLink url={row.linkedinUrl} />
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
      <div className="flex items-center justify-end gap-1.5 text-ink-3">
        {row.email && (
          <button
            type="button"
            title={generatingMailId === row.id ? "Drafting referral email…" : "Open conversation"}
            className="hover:text-ink p-0.5 disabled:cursor-wait disabled:opacity-60"
            disabled={generatingMailId === row.id}
            onClick={(e) => {
              e.stopPropagation();
              handleMailClick(row);
            }}
          >
            {generatingMailId === row.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );

  if (groupByCompany) {
    const m = new Map<string, ManagerRow[]>();
    for (const r of rows) {
      const key = (r.company || "").trim() || "(no company)";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    const groups = [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([company, items]) => ({ company, items }));
    return (
      <GroupedShell
        groups={groups}
        viewMode={groupedView}
        renderTable={(group) => (
          <>
            {HeaderRow}
            {group.items.map((row, i) => renderRow(row, i === group.items.length - 1, i))}
          </>
        )}
      />
    );
  }

  return (
    <div className="border border-line rounded-st-xl overflow-hidden bg-white">
      {HeaderRow}

      {addingMode && onSaveNew && (
        <AddManagerRow
          cols={COLS}
          onCancel={() => onCancelAdd?.()}
          onSave={onSaveNew}
        />
      )}

      {rows.length === 0 && !addingMode ? (
        <div className="py-16 text-center">
          <p className="font-serif italic text-ink-3 text-[15px]">
            No hiring managers yet. Save them from Job Board → Find Hiring Manager.
          </p>
        </div>
      ) : rows.length === 0 ? null : (
        rows.map((row, i) => renderRow(row, i === rows.length - 1, i))
      )}
    </div>
  );
};

const capitalizeName = (s: string) =>
  s.replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\.[a-z]/g, c => c.toUpperCase());

// Build a CSV from a header row + value rows and trigger a client-side
// download. Cells containing commas/quotes/newlines are RFC-4180 quoted.
const downloadCsv = (
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | undefined>>,
) => {
  const esc = (v: string | number | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ── Shared filter-bar control styling ────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for every control in the People / Companies / Hiring
// Managers filter bars. All three tabs build their controls from these tokens
// (and the render* helpers below), so they cannot drift apart in height,
// padding, radius, font, or icon size. Tabs differ ONLY in which controls
// render and their labels.
const FB_SIZE = "h-10 px-3 rounded-full text-[14px]";           // height · padding · radius · font (incl. the dark +Add)
const FB_FILL = "bg-paper-2/60 border border-line text-black";  // light pill fill + black text (every control except +Add)
const FB_ICON = "h-3.5 w-3.5";                                   // icon size, matched to the 14px text
const FB_ROW = "flex items-center justify-between gap-2 mb-3";   // one row: left filter group + right action group, hugging opposite edges
const FB_GROUP = "flex items-center gap-1.5";                    // a cluster of controls within the row

// ── Main Page ────────────────────────────────────────────────────────────────

const MyNetworkPage: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useFirebaseAuth();

  const activeTab: TabId = tab === "companies" ? "companies" : tab === "managers" ? "managers" : "people";

  // Deep-link from the Loops activity feed: /my-network/people?contact=<id>
  // opens this contact row in the People tab — PeopleTable scrolls it into
  // view and tints it on mount so the user sees what they jumped to. Only
  // honored on the People tab — companies/managers have their own surfaces.
  const focusContactId = activeTab === "people"
    ? (searchParams.get("contact") || undefined)
    : undefined;

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  // Saved firms from Find > Companies (firm-search history). The Companies tab
  // merges these with companies derived from saved People so the user sees the
  // same set Find used to display - one source of truth.
  // Saved firms from Find > Companies, each tagged with the search's
  // createdAt so the My Network sort can place freshly-found firms at the top.
  type SavedFirm = Firm & { _searchCreatedAt?: string };
  const [savedFirms, setSavedFirms] = useState<SavedFirm[]>([]);
  // Manually-added firms (users/{uid}/manual_firms). Live alongside savedFirms
  // in the Companies merge so the user-entered rows persist across reloads.
  const [manualFirms, setManualFirms] = useState<ManualFirm[]>([]);
  // Inline-add UI state - one flag per tab. Clicking "Add X" flips the
  // corresponding flag on; the table renders an empty editable row at the top.
  const [addingPerson, setAddingPerson] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);
  const [addingManager, setAddingManager] = useState(false);
  // Bumped by the "Refresh" button to re-run the data-loading effect below
  // (it's listed in that effect's dependency array) so the user can pull the
  // latest contacts/firms/managers without a full page reload.
  const [refreshNonce, setRefreshNonce] = useState(0);

  // ── Tour demo state ──────────────────────────────────────────────────────
  // Mirrors the People / Companies / HM pattern: the tour step declares
  // `demoSurface: 'my-network'`, which flips `myNetworkDemoActive` here.
  // The effect REPLACES (not appends) the People list with the three
  // founders so a real user never sees fake rows mixed in with their actual
  // network. No typing animation — this surface isn't a search; the rows
  // simply appear as the "saved network." Teardown wipes the demo rows AND
  // bumps `refreshNonce`, which re-runs the existing Firestore-load effect
  // and fully restores the user's real People list. Per-row guards on
  // `handleMailClick` (via `row.demo`) plus page-level guards on every
  // backend-touching parent handler (delete, notes save, inline-add,
  // bulk-delete, CSV export) keep the seeded rows fully inert.
  const { demoSurface } = useTour();
  const myNetworkDemoActive = demoSurface === 'my-network';
  const MY_NETWORK_DEMO_ROWS: Array<PersonRow & { demo: true }> = [
    {
      demo: true,
      id: 'demo-nick',
      name: 'Nick Wittig',
      email: 'nickwittig@offerloop.ai',
      role: 'Cofounder',
      company: 'Offerloop',
    },
    {
      demo: true,
      id: 'demo-rylan',
      name: 'Rylan Bohnett',
      email: 'rylan@offerloop.ai',
      role: 'CMO',
      company: 'Offerloop',
    },
    {
      demo: true,
      id: 'demo-deena',
      name: 'Deena Bandi',
      email: 'deena@offerloop.ai',
      role: 'CTO',
      company: 'Offerloop',
    },
  ];

  useEffect(() => {
    if (!myNetworkDemoActive) return;
    // Replace the People list with the seeded founders. Other tabs
    // (Companies, Managers) keep real data — the spotlight is on People and
    // a tour-deviation to another tab still shows the user's true state.
    setPeople(MY_NETWORK_DEMO_ROWS);
    return () => {
      // Drop the seeded rows immediately, then nudge the real-load effect
      // (deps include refreshNonce) to re-fetch contacts from Firestore.
      // The user's full real list is fully restored within one fetch.
      setPeople([]);
      setRefreshNonce((n) => n + 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myNetworkDemoActive]);

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

  // Companies the user explicitly removed via bulk-delete. Stored as a
  // lowercase-name set so the merge can filter them out. Persisted to
  // localStorage so the dismissal sticks across reloads. The underlying People
  // contacts are NEVER deleted - the user keeps the network, just hides the
  // company row from this view.
  const [dismissedCompanies, setDismissedCompanies] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("ofl_dismissed_companies") || "[]";
      const list = JSON.parse(raw);
      return new Set(Array.isArray(list) ? list.map((s: string) => s.toLowerCase()) : []);
    } catch {
      return new Set();
    }
  });
  const persistDismissed = (next: Set<string>) => {
    setDismissedCompanies(next);
    try { localStorage.setItem("ofl_dismissed_companies", JSON.stringify([...next])); } catch {}
  };
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

  // Sort direction per tab. Default newest-first so the user always sees what
  // they just added at the top. Declared before the companies useMemo because
  // that memo reads companiesSortDir.
  type SortDir = "newest" | "oldest";
  const [peopleSortDir, setPeopleSortDir] = useState<SortDir>(() => {
    try { return localStorage.getItem("ofl_my_network_people_sort") === "oldest" ? "oldest" : "newest"; } catch { return "newest"; }
  });
  const [companiesSortDir, setCompaniesSortDir] = useState<SortDir>(() => {
    try { return localStorage.getItem("ofl_my_network_companies_sort") === "oldest" ? "oldest" : "newest"; } catch { return "newest"; }
  });
  const [managersSortDir, setManagersSortDir] = useState<SortDir>(() => {
    try { return localStorage.getItem("ofl_my_network_managers_sort") === "oldest" ? "oldest" : "newest"; } catch { return "newest"; }
  });
  const persistPeopleSort = (v: SortDir) => {
    setPeopleSortDir(v);
    try { localStorage.setItem("ofl_my_network_people_sort", v); } catch {}
  };
  const persistCompaniesSort = (v: SortDir) => {
    setCompaniesSortDir(v);
    try { localStorage.setItem("ofl_my_network_companies_sort", v); } catch {}
  };
  const persistManagersSort = (v: SortDir) => {
    setManagersSortDir(v);
    try { localStorage.setItem("ofl_my_network_managers_sort", v); } catch {}
  };

  // Companies are merged from three sources into a single deduped list keyed
  // by lower-cased company name:
  //   1. Saved People → contributes the "# contacts" count and people-derived
  //      location (used only if no saved firm record has a canonical HQ).
  //   2. Saved Firms from Find > Companies → contributes canonical INDUSTRY
  //      and HQ. People-derived rows that match by name pick these up too,
  //      so a row only appears once no matter where the company came from.
  //   3. The localStorage "exploring" watch list → companies the user clicked
  //      on Find but hasn't saved any people from yet.
  // Industry is ALWAYS the real industry from the firm record (or blank) -
  // never a derived job title, which was the previous behavior and surfaced
  // titles like "investment banking analyst" in the industry column.
  const companies = useMemo<CompanyRow[]>(() => {
    const norm = (s: string) => s.trim().toLowerCase();
    type Bucket = {
      display: string;
      count: number;
      locations: Map<string, number>;
      firm?: Firm;
      manualFirmId?: string;
      latestTs: number;
      sharedImport?: boolean;
    };
    const map = new Map<string, Bucket>();
    const tsOf = (s?: string): number => (s ? Date.parse(s) || 0 : 0);

    for (const p of people) {
      const raw = (p.company || "").trim();
      if (!raw) continue;
      const key = norm(raw);
      let b = map.get(key);
      if (!b) {
        b = { display: raw, count: 0, locations: new Map(), latestTs: 0 };
        map.set(key, b);
      }
      b.count += 1;
      if (p.location) b.locations.set(p.location, (b.locations.get(p.location) || 0) + 1);
      const t = tsOf(p.createdAt);
      if (t > b.latestTs) b.latestTs = t;
    }

    for (const f of savedFirms) {
      if (!f.name) continue;
      const key = norm(f.name);
      let b = map.get(key);
      if (!b) {
        b = { display: f.name, count: 0, locations: new Map(), latestTs: 0 };
        map.set(key, b);
      }
      b.firm = f;
      const t = tsOf((f as any)._searchCreatedAt);
      if (t > b.latestTs) b.latestTs = t;
    }

    // Manually-added firms (from the inline "Add company" row). Use them only
    // to fill in industry/HQ when no firm-search record beat us to it.
    for (const mf of manualFirms) {
      if (!mf.name) continue;
      const key = norm(mf.name);
      let b = map.get(key);
      if (!b) {
        b = { display: mf.name, count: 0, locations: new Map(), latestTs: 0 };
        map.set(key, b);
      }
      if (mf.id) b.manualFirmId = mf.id;
      if ((mf as any).sharedImport) b.sharedImport = true;
      const t = tsOf(mf.createdAt);
      if (t > b.latestTs) b.latestTs = t;
      if (!b.firm) {
        b.firm = {
          id: mf.id || `manual:${key}`,
          name: mf.name,
          industry: mf.industry,
          location: mf.hq ? { display: mf.hq } : undefined,
        } as Firm;
      }
    }

    const topLocation = (m: Map<string, number>): string => {
      let best = "";
      let bestCount = 0;
      for (const [k, v] of m) {
        if (v > bestCount) { best = k; bestCount = v; }
      }
      return best;
    };

    // Tag each row with its underlying recency so the final merge can sort
    // exploring + main rows in a single most-recent-first pass. recencyTs is
    // also surfaced to consumers for the "added since last visit" highlight.
    const main: CompanyRow[] = [...map.values()].map((b) => {
      const firmHq = b.firm?.location?.display
        || [b.firm?.location?.city, b.firm?.location?.state].filter(Boolean).join(", ");
      return {
        id: b.firm?.id || `co:${norm(b.display)}`,
        name: b.display,
        industry: b.firm?.industry || "",
        hq: firmHq || topLocation(b.locations),
        alumni: b.count,
        manualFirmId: b.manualFirmId,
        recencyTs: b.latestTs,
        sharedImport: b.sharedImport,
      };
    });

    const seen = new Set(main.map((r) => norm(r.name)));
    const exploring: CompanyRow[] = exploringCompanies
      .filter((e) => !seen.has(norm(e.name)))
      .map((e) => ({
        id: `exploring:${e.name}`,
        name: e.name,
        industry: "exploring",
        hq: "",
        alumni: 0,
        recencyTs: e.ts || 0,
      }));

    const dirMul = companiesSortDir === "oldest" ? -1 : 1;
    const merged: CompanyRow[] = [...main, ...exploring]
      .sort((a, b) => (((b.recencyTs || 0) - (a.recencyTs || 0)) * dirMul) || a.name.localeCompare(b.name));
    return dismissedCompanies.size === 0
      ? merged
      : merged.filter((r) => !dismissedCompanies.has(norm(r.name)));
  }, [people, savedFirms, manualFirms, exploringCompanies, dismissedCompanies, companiesSortDir]);

  // Filter / view state for the People table (lifted to parent so the filter
  // bar and the table render from one source of truth). The same searchQuery
  // is reused across all three tabs so a single text field per tab can drive
  // filtering uniformly - tabs render only one at a time so there's no overlap.
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [managersGroupByCompany, setManagersGroupByCompany] = useState(false);
  // List/Grid view inside the grouped view, persisted per tab in localStorage.
  const [peopleGroupedView, setPeopleGroupedView] = useState<"list" | "grid">(() => {
    try { return localStorage.getItem("ofl_my_network_people_grouped_view") === "grid" ? "grid" : "list"; } catch { return "list"; }
  });
  const [managersGroupedView, setManagersGroupedView] = useState<"list" | "grid">(() => {
    try { return localStorage.getItem("ofl_my_network_managers_grouped_view") === "grid" ? "grid" : "list"; } catch { return "list"; }
  });
  const setPeopleGroupedViewPersisted = (v: "list" | "grid") => {
    setPeopleGroupedView(v);
    try { localStorage.setItem("ofl_my_network_people_grouped_view", v); } catch {}
  };
  const setManagersGroupedViewPersisted = (v: "list" | "grid") => {
    setManagersGroupedView(v);
    try { localStorage.setItem("ofl_my_network_managers_grouped_view", v); } catch {}
  };

  // Recency highlight: only the items from the *most recent batch* in each
  // tab get a faint blue background. When a fresh search adds newer items,
  // their timestamp becomes the new max and the previous batch loses its
  // highlight automatically - no localStorage tracking needed. Per-tab so
  // searches on one tab don't affect another. A 60s window catches all
  // items saved together in one search (firms share the search's createdAt
  // exactly; contacts/recruiters spread over a few seconds during bulk save).
  const HIGHLIGHT_WINDOW_MS = 60_000;
  const peopleHighlightSince = useMemo(() => {
    let m = 0;
    for (const p of people) {
      const t = p.createdAt ? Date.parse(p.createdAt) : 0;
      if (t > m) m = t;
    }
    return m > 0 ? m - HIGHLIGHT_WINDOW_MS : 0;
  }, [people]);
  const companiesHighlightSince = useMemo(() => {
    let m = 0;
    for (const c of companies) {
      const t = c.recencyTs || 0;
      if (t > m) m = t;
    }
    return m > 0 ? m - HIGHLIGHT_WINDOW_MS : 0;
  }, [companies]);
  const managersHighlightSince = useMemo(() => {
    let m = 0;
    for (const r of managers) {
      const t = r.dateAdded ? Date.parse(r.dateAdded) : 0;
      if (t > m) m = t;
    }
    return m > 0 ? m - HIGHLIGHT_WINDOW_MS : 0;
  }, [managers]);

  // Filtered companies (driven by the Companies tab search bar).
  const filteredCompanies = useMemo<CompanyRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => {
      const hay = `${c.name} ${c.industry || ""} ${c.hq || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [companies, searchQuery]);

  // Filtered managers (driven by the Hiring Managers tab search bar).
  // Default order is most recently added first.
  const filteredManagers = useMemo<ManagerRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = q
      ? managers.filter((m) => {
          const hay = `${m.name} ${m.email || ""} ${m.title || ""} ${m.company || ""} ${m.roleHiringFor || ""}`.toLowerCase();
          return hay.includes(q);
        })
      : managers;
    const tsOf = (s?: string): number => (s ? Date.parse(s) || 0 : 0);
    const dirMul = managersSortDir === "oldest" ? -1 : 1;
    return [...base].sort((a, b) => (tsOf(b.dateAdded) - tsOf(a.dateAdded)) * dirMul);
  }, [managers, searchQuery, managersSortDir]);

  useEffect(() => {
    if (!user?.uid) return;
    // Entry guard: no real fetch kicks off while the tour's My Network demo
    // is live. The teardown bumps refreshNonce, which re-fires this effect
    // once the flag is false again, fully restoring the real list.
    if (myNetworkDemoActive) return;

    // Cancellable-effect pattern. When deps change (specifically when
    // myNetworkDemoActive flips false→true), React runs this cleanup BEFORE
    // any new effect body. Setting `cancelled = true` is synchronous, and
    // the in-flight .then callbacks below all read the same closure
    // variable at resolution time — so a fetch started while demoSurface
    // was still null (during cross-route nav, before pending-step promotes
    // stepIndex/run) drops its write the moment the demo activates. This is
    // the React-canonical fix for the microtask-vs-render race that broke
    // the earlier ref-mirror attempt: a plain variable check has no
    // dependency on render scheduling.
    let cancelled = false;

    // Load people from contacts. Field names match the Firestore Contact shape
    // (firstName/lastName/jobTitle/company/email/linkedinUrl/college/location/
    // status/warmthTier) - NOT PDL's raw API names. Earlier mapping used
    // c.full_name / c.job_title which never exists in the saved docs, so every
    // row collapsed to "Unknown" / blanks.
    firebaseApi.getContacts(user.uid).then((contacts) => {
      if (cancelled) return;
      const rows = contacts.map((c: any) => {
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
          createdAt: c.createdAt || c.firstContactDate || undefined,
          source: c.source || undefined,
          mcpUnseen: !!c.mcpUnseen,
          sharedImport: !!c.sharedImport,
        };
      });
      setPeople(rows);

      // Fire-and-forget: clear mcpUnseen=true server-side so the orange
      // highlight only shows on this first visit. The local rows keep
      // mcpUnseen=true for this render; subsequent loads see the cleared
      // value from Firestore.
      if (rows.some((r) => r.mcpUnseen)) {
        apiService.clearMcpUnseen().catch(() => {});
      }
    }).catch(() => {});

    // Companies - auto-derived from saved People. The "company tracker" is a
    // who-do-I-know-where view: for every distinct company in the user's saved
    // contacts, aggregate count + a representative role/location so the user
    // can scan their network by company instead of by person.

    // Load saved firms from Find > Companies (firm-search history). This is the
    // same data Find used to render its "188 companies saved" view, so the two
    // surfaces stay in sync.
    apiService.getFirmSearchHistory(100, true).then((history: any[]) => {
      if (cancelled) return;
      console.log('[MyNetwork] firm-search/history returned', {
        searchCount: (history || []).length,
        sample: (history || []).slice(0, 2).map((h: any) => ({
          id: h?.id,
          query: h?.query,
          createdAt: h?.createdAt,
          resultsCount: Array.isArray(h?.results) ? h.results.length : 'no-results-field',
        })),
      });
      const seen = new Set<string>();
      const flat: SavedFirm[] = [];
      // Iterate history newest-first so the first occurrence of any firm (the
      // dedup winner) carries the most recent search's createdAt.
      const sortedHistory = [...(history || [])].sort((a: any, b: any) => {
        const ta = a?.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b?.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });
      for (const item of sortedHistory) {
        const itemCreatedAt = (item as any).createdAt;
        const results = Array.isArray((item as any).results) ? (item as any).results : [];
        for (const f of results) {
          const key = f.id || `${(f.name || '').toLowerCase()}|${f.location?.display || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          flat.push({ ...f, _searchCreatedAt: itemCreatedAt });
        }
      }
      console.log('[MyNetwork] savedFirms after dedup:', flat.length, 'unique firms');
      setSavedFirms(flat);
    }).catch((err) => {
      console.error('[MyNetwork] firm-search/history FAILED:', err);
    });

    // Load manually-added firms (Add company → Firestore).
    firebaseApi.getManualFirms(user.uid).then((firms) => {
      if (cancelled) return;
      setManualFirms(firms);
    }).catch(() => {});

    // Load hiring managers. Same field-mapping fix as People - Firestore docs
    // use camelCase firstName/lastName/jobTitle/etc., NOT PDL's raw schema.
    firebaseApi.getRecruiters(user.uid).then((recs: any[]) => {
      if (cancelled) return;
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
            sharedImport: !!r.sharedImport,
          };
        })
      );
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user?.uid, refreshNonce, myNetworkDemoActive]);

  // ─── Inline-add save handlers ─────────────────────────────────────────────
  // Each table opens an empty row when its adding flag is true. The table
  // collects input into a draft, then calls the matching save handler below
  // on Save. The handler writes to Firestore, then updates local state with
  // the persisted record so the row stays visible in its new state.
  const splitName = (full: string): { first: string; last: string } => {
    const parts = (full || "").trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return { first: "", last: "" };
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts[0], last: parts.slice(1).join(" ") };
  };

  const handleSavePerson = async (draft: {
    name: string; email?: string; linkedinUrl?: string;
    company?: string; role?: string; school?: string;
  }): Promise<void> => {
    // Inert during the tour's My Network demo. The inline-add row could
    // otherwise reach firebaseApi.addContact and create a real Firestore doc.
    if (myNetworkDemoActive) return;
    if (!user?.uid) return;
    if (!draft.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const { first, last } = splitName(draft.name);
    const nowIso = new Date().toISOString();
    try {
      const id = await firebaseApi.createContact(user.uid, {
        firstName: first,
        lastName: last,
        email: draft.email || "",
        linkedinUrl: draft.linkedinUrl || "",
        company: draft.company || "",
        jobTitle: draft.role || "",
        college: draft.school || "",
        location: "",
        firstContactDate: nowIso,
        status: "manual",
        lastContactDate: nowIso,
      });
      setPeople((prev) => [
        {
          id,
          name: `${first} ${last}`.trim(),
          email: draft.email || undefined,
          linkedinUrl: draft.linkedinUrl || undefined,
          role: draft.role || undefined,
          company: draft.company || undefined,
          school: draft.school || undefined,
          status: "manual",
        },
        ...prev,
      ]);
      setAddingPerson(false);
      toast({ title: "Person added", description: `${first} ${last}`.trim() });
    } catch (err) {
      console.error("Failed to save person:", err);
      toast({ title: "Save failed", description: "Try again.", variant: "destructive" });
    }
  };

  const handleSaveCompany = async (draft: {
    name: string; industry?: string; hq?: string;
  }): Promise<void> => {
    if (!user?.uid) return;
    if (!draft.name.trim()) {
      toast({ title: "Company name required", variant: "destructive" });
      return;
    }
    try {
      const id = await firebaseApi.createManualFirm(user.uid, {
        name: draft.name.trim(),
        industry: draft.industry || "",
        hq: draft.hq || "",
      });
      setManualFirms((prev) => [
        { id, name: draft.name.trim(), industry: draft.industry || "", hq: draft.hq || "" },
        ...prev,
      ]);
      setAddingCompany(false);
      toast({ title: "Company added", description: draft.name.trim() });
    } catch (err) {
      console.error("Failed to save company:", err);
      toast({ title: "Save failed", description: "Try again.", variant: "destructive" });
    }
  };

  const handleSaveManager = async (draft: {
    name: string; email?: string; linkedinUrl?: string;
    title?: string; company?: string;
  }): Promise<void> => {
    if (!user?.uid) return;
    if (!draft.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const { first, last } = splitName(draft.name);
    const nowIso = new Date().toISOString();
    try {
      await firebaseApi.bulkCreateRecruiters(user.uid, [{
        firstName: first,
        lastName: last,
        email: draft.email || "",
        linkedinUrl: draft.linkedinUrl || "",
        company: draft.company || "",
        jobTitle: draft.title || "",
        location: "",
        dateAdded: nowIso,
        status: "manual",
      }]);
      // Reload managers to get the assigned IDs.
      const recs = await firebaseApi.getRecruiters(user.uid);
      setManagers(recs.map((r: any) => {
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
      }));
      setAddingManager(false);
      toast({ title: "Hiring manager added", description: `${first} ${last}`.trim() });
    } catch (err) {
      console.error("Failed to save manager:", err);
      toast({ title: "Save failed", description: "Try again.", variant: "destructive" });
    }
  };

  // Per-tab selection state. Lifted here so the "Delete selected (N)" pill
  // can sit next to "Add X" in each tab's filter bar. Declared BEFORE the
  // bare-/my-network redirect below so the hook count stays constant across
  // the pre-redirect and post-redirect renders of the same component instance.
  const [peopleSelected, setPeopleSelected] = useState<Set<string>>(new Set());
  const [companiesSelected, setCompaniesSelected] = useState<Set<string>>(new Set());
  const [managersSelected, setManagersSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // Redirect bare /my-network to /my-network/people (AFTER all hooks)
  if (!tab) {
    return <Navigate to="/my-network/people" replace />;
  }

  const counts = {
    people: people.length,
    companies: companies.length,
    managers: managers.length,
  };

  const addLabel = activeTab === "companies" ? "Add company" : activeTab === "managers" ? "Add manager" : "Add person";
  const onClickAdd = () => {
    if (activeTab === "companies") setAddingCompany(true);
    else if (activeTab === "managers") setAddingManager(true);
    else setAddingPerson(true);
  };

  const activeSelection: Set<string> =
    activeTab === "companies" ? companiesSelected :
    activeTab === "managers" ? managersSelected :
    peopleSelected;

  const clearActiveSelection = () => {
    if (activeTab === "companies") setCompaniesSelected(new Set());
    else if (activeTab === "managers") setManagersSelected(new Set());
    else setPeopleSelected(new Set());
  };

  const runBulkDelete = async () => {
    // Inert during the tour's My Network demo. Even if the user toggled
    // checkboxes on the seeded founder rows, this must not fire
    // firebaseApi.deleteContact against ids that don't exist in Firestore.
    if (myNetworkDemoActive) return;
    if (!user?.uid || activeSelection.size === 0) return;
    setDeleting(true);
    const ids = [...activeSelection];
    try {
      if (activeTab === "people") {
        await Promise.all(ids.map((id) => firebaseApi.deleteContact(user.uid, id).catch(() => {})));
        setPeople((prev) => prev.filter((p) => !activeSelection.has(p.id)));
        toast({ title: `${ids.length} ${ids.length === 1 ? "person" : "people"} removed` });
      } else if (activeTab === "managers") {
        await Promise.all(ids.map((id) => firebaseApi.deleteRecruiter(user.uid, id).catch(() => {})));
        setManagers((prev) => prev.filter((m) => !activeSelection.has(m.id)));
        toast({ title: `${ids.length} hiring ${ids.length === 1 ? "manager" : "managers"} removed` });
      } else {
        // companies: rows can come from manual firms, saved firms, contact-
        // derived aggregates, or the exploring list. Each case is handled
        // independently; People contacts are NEVER deleted.
        const idSet = new Set(ids);
        const rowsToDelete = companies.filter((r) => idSet.has(r.id));
        const manualIds = rowsToDelete.map((r) => r.manualFirmId).filter((x): x is string => !!x);
        const exploringNames = rowsToDelete
          .filter((r) => r.id.startsWith("exploring:"))
          .map((r) => r.name);
        const nameKeys = rowsToDelete.map((r) => r.name.trim().toLowerCase());

        if (manualIds.length > 0) {
          await Promise.all(manualIds.map((id) => firebaseApi.deleteManualFirm(user.uid, id).catch(() => {})));
          const manualIdSet = new Set(manualIds);
          setManualFirms((prev) => prev.filter((mf) => !manualIdSet.has(mf.id || "")));
        }
        if (exploringNames.length > 0) {
          const exploringSet = new Set(exploringNames.map((n) => n.toLowerCase()));
          const nextExploring = exploringCompanies.filter((e) => !exploringSet.has(e.name.toLowerCase()));
          setExploringCompanies(nextExploring);
          try { localStorage.setItem("ofl_exploring_companies", JSON.stringify(nextExploring)); } catch {}
        }
        // Dismiss every selected company by name so contact-derived rows
        // (and any reincarnations after delete) stay hidden from this view.
        const nextDismissed = new Set(dismissedCompanies);
        for (const key of nameKeys) nextDismissed.add(key);
        persistDismissed(nextDismissed);

        toast({ title: `${ids.length} ${ids.length === 1 ? "company" : "companies"} removed` });
      }
      clearActiveSelection();
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  const bulkSubject =
    activeTab === "companies" ? (activeSelection.size === 1 ? "company" : "companies") :
    activeTab === "managers" ? (activeSelection.size === 1 ? "hiring manager" : "hiring managers") :
    activeSelection.size === 1 ? "person" : "people";

  // "Add X" pill — shared across all three tabs. Filled with navy/slate-blue
  // (--accent) and white text; FB_SIZE keeps it the exact height/shape/font
  // of every other control. Overrides the shadcn primary so the brand color
  // is explicit (not whatever --primary happens to resolve to globally).
  const renderAddButton = () => (
    <Button
      variant="default"
      size="sm"
      onClick={onClickAdd}
      className={FB_SIZE}
      style={{
        background: 'var(--accent, #4A60A8)',
        color: '#fff',
        border: 'none',
      }}
    >
      <Plus className={FB_ICON} />
      {addLabel}
    </Button>
  );

  // Search pill — shared by all three tabs (only the placeholder differs).
  const renderSearch = (placeholder: string) => (
    <div className={`flex items-center gap-1.5 ${FB_SIZE} ${FB_FILL}`} style={{ minWidth: 150 }}>
      <SearchIcon className={`${FB_ICON} text-ink-3`} />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-[14px] text-black placeholder:text-ink-3"
      />
    </div>
  );

  // "Group by company" toggle pill — shared by People + Hiring Managers (the
  // Companies tab doesn't render it). Active state swaps fill/border only.
  const renderGroupToggle = (active: boolean, onToggle: () => void) => (
    <button
      type="button"
      onClick={onToggle}
      title="Toggle company grouping"
      className={`inline-flex items-center gap-1.5 font-medium ${FB_SIZE} ${
        active ? "bg-[#64748B]/10 border border-[#64748B] text-black" : FB_FILL
      }`}
    >
      {active ? <Layers className={FB_ICON} /> : <List className={FB_ICON} />}
      {active ? "Grouped by company" : "Group by company"}
    </button>
  );

  // Export the active tab's rows to a CSV download. Exports the full saved
  // set for that tab (not just the current search filter) so the file is a
  // complete snapshot of that part of the network.
  const handleExportCsv = () => {
    // Inert during the tour's My Network demo. Local download only, no
    // backend reach, but exporting a CSV of three fake founders would leave
    // a confusing artifact on the user's machine.
    if (myNetworkDemoActive) return;
    if (activeTab === "companies") {
      downloadCsv(
        "my-network-companies.csv",
        ["Company", "Industry", "HQ", "Contacts"],
        companies.map((c) => [c.name, c.industry === "exploring" ? "" : c.industry, c.hq, c.alumni ?? 0]),
      );
    } else if (activeTab === "managers") {
      downloadCsv(
        "my-network-hiring-managers.csv",
        ["Name", "Email", "Title", "Hiring For", "Company", "LinkedIn", "Added"],
        managers.map((m) => [m.name, m.email, m.title, m.roleHiringFor, m.company, m.linkedinUrl, m.dateAdded]),
      );
    } else {
      downloadCsv(
        "my-network-people.csv",
        ["Name", "Email", "Company", "Role", "School", "LinkedIn", "Added"],
        people.map((p) => [p.name, p.email, p.company, p.role, p.school, p.linkedinUrl, p.createdAt]),
      );
    }
  };

  // Share helpers — map the active selection to the items array for the API.
  const shareKind = (): ShareKind =>
    activeTab === "companies" ? "companies" : activeTab === "managers" ? "hiringManagers" : "contacts";

  const selectedItems = (): any[] => {
    const ids = activeSelection;
    if (activeTab === "companies") {
      return companies.filter((c) => ids.has(c.id)).map((c) => ({
        name: c.name, industry: c.industry, hq: c.hq, alumni: c.alumni ?? 0,
      }));
    }
    if (activeTab === "managers") {
      return managers.filter((m) => ids.has(m.id)).map((m) => ({
        firstName: (m.name || "").split(" ")[0] || "", lastName: (m.name || "").split(" ").slice(1).join(" "),
        name: m.name, email: m.email, linkedinUrl: m.linkedinUrl, jobTitle: m.title,
        company: m.company, roleHiringFor: m.roleHiringFor, location: m.location,
      }));
    }
    return people.filter((p) => ids.has(p.id)).map((p) => ({
      firstName: (p.name || "").split(" ")[0] || "", lastName: (p.name || "").split(" ").slice(1).join(" "),
      name: p.name, email: p.email, linkedinUrl: p.linkedinUrl, jobTitle: p.role,
      company: p.company, college: p.school, location: p.location,
    }));
  };

  const handleShareSubmit = async () => {
    setShareError(null);
    const email = shareEmail.trim().toLowerCase();
    if (!email) { setShareError("Enter an email."); return; }
    setSharing(true);
    try {
      const res: any = await apiService.shareRecords({ toEmail: email, kind: shareKind(), items: selectedItems() });
      if (res?.error) { setShareError(res.error); return; }
      setShareOpen(false);
      setShareEmail("");
      clearActiveSelection();
      toast({ title: `Shared with ${res.toName || email}` });
    } catch (e: any) {
      setShareError(e?.message || "Something went wrong.");
    } finally {
      setSharing(false);
    }
  };

  // Pill (icon + optional label) for the Export CSV actions — shares
  // the same FB_SIZE/FB_FILL tokens as every other control.
  const renderToolButton = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    showLabel = true,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 ${FB_SIZE} ${FB_FILL} hover:bg-paper-2 transition-colors`}
    >
      {icon}
      {showLabel && label}
    </button>
  );

  // List/Grid toggle pill for the active tab's grouped view. Only renders
  // when group-by-company is on for that tab.
  const renderViewToggle = (
    value: "list" | "grid",
    onChange: (v: "list" | "grid") => void,
  ) => (
    <div
      style={{
        display: "inline-flex",
        background: "var(--paper-2, #FAFBFF)",
        border: "1px solid var(--line, #E2E8F0)",
        borderRadius: 6,
        padding: 2,
      }}
    >
      {(["list", "grid"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          style={{
            padding: "5px 10px",
            fontSize: 11.5,
            fontWeight: 500,
            background: value === v ? "white" : "transparent",
            border: value === v ? "1px solid var(--line, #E2E8F0)" : "1px solid transparent",
            borderRadius: 4,
            color: value === v ? "#3F5878" : "var(--ink-3, #94A3B8)",
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

  // Sort-direction dropdown for the active tab. Newest-first is default.
  // Shared by all three tabs via the FB_* tokens.
  const renderSortDropdown = (value: SortDir, onChange: (v: SortDir) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortDir)}
      className={`${FB_SIZE} ${FB_FILL} cursor-pointer outline-none`}
    >
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
    </select>
  );

  // "Delete selected (N)" pill - only renders when something is selected on
  // the active tab. Sits to the left of AddButton in each filter bar.
  const BulkDeleteButton = activeSelection.size > 0 ? (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setConfirmOpen(true)}
      title="Delete selected"
      aria-label="Delete selected"
      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  ) : null;

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
              </div>
            }
          />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[1100px] mx-auto px-6 py-5">
              {/* Tabs — recolored to match the Job Board palette: vibrant
                  blue active state with a soft periwinkle count badge. */}
              <div className="flex items-center gap-1 mb-5">
                {TABS.map((t) => {
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/my-network/${t.id}`, { replace: true })}
                      className="inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-all"
                      style={{
                        color: isActive
                          ? 'var(--brand-blue, #3B82F6)'
                          : 'var(--ink-3, #94A3B8)',
                        borderBottomColor: isActive
                          ? 'var(--brand-blue, #3B82F6)'
                          : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.color = 'var(--ink-2, #475569)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.color = 'var(--ink-3, #94A3B8)';
                      }}
                    >
                      {t.label}
                      {counts[t.id] > 0 && (
                        <span
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded-st-sm"
                          style={{
                            background: isActive
                              ? 'var(--primary-50, #EEF1F9)'
                              : 'var(--paper-2, #FAFBFF)',
                            color: isActive
                              ? 'var(--accent, #4A60A8)'
                              : 'var(--ink-3, #94A3B8)',
                          }}
                        >
                          {counts[t.id]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Filter bar - People */}
              {activeTab === "people" && (
                <div className={FB_ROW}>
                  {/* Left group: filters */}
                  <div className={FB_GROUP}>
                    {renderSearch("Search name, company, email...")}
                    {renderSortDropdown(peopleSortDir, persistPeopleSort)}
                    {renderGroupToggle(groupByCompany, () => setGroupByCompany((v) => !v))}

                    {/* List/Grid view toggle, only meaningful while grouped */}
                    {groupByCompany && renderViewToggle(peopleGroupedView, setPeopleGroupedViewPersisted)}

                    {/* Clear - companyFilter can still be set via the Companies-tab
                        drill-down even though the dropdown is gone. */}
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

                  {/* Right group: actions */}
                  <div className={FB_GROUP}>
                    {renderToolButton(<Share2 className={`${FB_ICON} text-muted-foreground`} />, "Share", () => { if (activeSelection.size > 0) setShareOpen(true); else toast({ title: "Select rows to share first." }); }, true)}
                    {renderToolButton(<Download className={FB_ICON} />, "Export CSV", handleExportCsv)}
                    {BulkDeleteButton}
                    {renderAddButton()}
                  </div>
                </div>
              )}

              {/* Filter bar - Companies */}
              {activeTab === "companies" && (
                <div className={FB_ROW}>
                  {/* Left group: filters */}
                  <div className={FB_GROUP}>
                    {renderSearch("Search company, industry, location...")}
                    {renderSortDropdown(companiesSortDir, persistCompaniesSort)}
                    {dismissedCompanies.size > 0 && (
                      <button
                        type="button"
                        onClick={() => persistDismissed(new Set())}
                        className="text-[12px] text-[#3B82F6] hover:underline underline-offset-2"
                        title="Show companies you've previously bulk-deleted from this view"
                      >
                        Restore {dismissedCompanies.size} hidden
                      </button>
                    )}
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="text-[12px] text-ink-3 hover:text-ink-2 underline-offset-2 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Right group: actions */}
                  <div className={FB_GROUP}>
                    {renderToolButton(<Share2 className={`${FB_ICON} text-muted-foreground`} />, "Share", () => { if (activeSelection.size > 0) setShareOpen(true); else toast({ title: "Select rows to share first." }); }, true)}
                    {renderToolButton(<Download className={FB_ICON} />, "Export CSV", handleExportCsv)}
                    {BulkDeleteButton}
                    {renderAddButton()}
                  </div>
                </div>
              )}

              {/* Filter bar - Hiring Managers */}
              {activeTab === "managers" && (
                <div className={FB_ROW}>
                  {/* Left group: filters */}
                  <div className={FB_GROUP}>
                    {renderSearch("Search name, company, title, role...")}
                    {renderSortDropdown(managersSortDir, persistManagersSort)}
                    {renderGroupToggle(managersGroupByCompany, () => setManagersGroupByCompany((v) => !v))}

                    {managersGroupByCompany && renderViewToggle(managersGroupedView, setManagersGroupedViewPersisted)}

                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="text-[12px] text-ink-3 hover:text-ink-2 underline-offset-2 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Right group: actions */}
                  <div className={FB_GROUP}>
                    {renderToolButton(<Share2 className={`${FB_ICON} text-muted-foreground`} />, "Share", () => { if (activeSelection.size > 0) setShareOpen(true); else toast({ title: "Select rows to share first." }); }, true)}
                    {renderToolButton(<Download className={FB_ICON} />, "Export CSV", handleExportCsv)}
                    {BulkDeleteButton}
                    {renderAddButton()}
                  </div>
                </div>
              )}

              {/* Table */}
              {activeTab === "people" && (
                <div data-tour="tour-network-table">
                <PeopleTable
                  rows={people}
                  query={searchQuery}
                  companyFilter={companyFilter}
                  groupByCompany={groupByCompany}
                  groupedView={peopleGroupedView}
                  recencyDir={peopleSortDir}
                  highlightSince={peopleHighlightSince}
                  focusContactId={focusContactId}
                  selected={peopleSelected}
                  onSelectionChange={setPeopleSelected}
                  onShare={(row) => {
                    setPeopleSelected(new Set([row.id]));
                    setShareOpen(true);
                  }}
                  addingMode={addingPerson}
                  onCancelAdd={() => setAddingPerson(false)}
                  onSaveNew={handleSavePerson}
                  onDelete={(id) => {
                    // Inert during the tour's My Network demo — the seeded
                    // founder rows have no Firestore doc to delete.
                    if (myNetworkDemoActive) return;
                    setPeople((prev) => prev.filter((p) => p.id !== id));
                    if (user?.uid) {
                      firebaseApi.deleteContact(user.uid, id).catch(() => {});
                    }
                  }}
                  onSaveNote={(id, note) => {
                    // Inert during the tour's My Network demo — note typing
                    // is allowed (local UI state) but commit must NOT reach
                    // firebaseApi.updateContact against a seeded id.
                    if (myNetworkDemoActive) return;
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
                </div>
              )}
              {activeTab === "companies" && (
                <>
                  <p className="text-[12px] text-ink-3 mb-3 leading-relaxed">
                    Companies where you've saved contacts, plus ones you're
                    exploring from Find. Click any card to see the people you
                    know there.
                  </p>
                  <CompaniesTable
                    rows={filteredCompanies}
                    selected={companiesSelected}
                    onSelectionChange={setCompaniesSelected}
                    highlightSince={companiesHighlightSince}
                    addingMode={addingCompany}
                    onCancelAdd={() => setAddingCompany(false)}
                    onSaveNew={handleSaveCompany}
                    onSelectCompany={(name) => {
                      // Drill down: switch to People tab with this company
                      // pre-applied as the filter. The People view's company
                      // filter dropdown reads from the parent state, so we
                      // just set it and flip the active tab.
                      setSearchQuery("");
                      setCompanyFilter(name);
                      navigate("/my-network/people", { replace: true });
                    }}
                    onFindPeople={(row) => {
                      // Pre-fill the Find > People prompt with the company +
                      // HQ and jump there. ContactSearchPage reads this key on
                      // mount (see its searchPrompt useState initializer).
                      const parts = [`People at ${row.name}`];
                      if (row.hq) parts.push(`in ${row.hq}`);
                      try {
                        localStorage.setItem("offerloop_pending_query", parts.join(" "));
                      } catch {}
                      navigate("/find?tab=people");
                    }}
                  />
                </>
              )}
              {activeTab === "managers" && (
                <ManagersTable
                  rows={filteredManagers}
                  selected={managersSelected}
                  onSelectionChange={setManagersSelected}
                  groupByCompany={managersGroupByCompany}
                  groupedView={managersGroupedView}
                  highlightSince={managersHighlightSince}
                  addingMode={addingManager}
                  onCancelAdd={() => setAddingManager(false)}
                  onSaveNew={handleSaveManager}
                />
              )}
            </div>
          </div>
        </MainContentWrapper>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !deleting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {activeSelection.size} {bulkSubject}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected {bulkSubject} from your network.
              This action can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runBulkDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? "Deleting..." : `Delete ${activeSelection.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={shareOpen}
        onOpenChange={(o) => {
          if (sharing) return;
          setShareOpen(o);
          if (!o) { setShareEmail(""); setShareError(null); }
        }}
      >
        <AlertDialogContent>
          <div className="flex flex-col items-center text-center">
            <img
              src={ShareScout}
              alt=""
              className="h-20 w-20 rounded-2xl object-contain"
              style={{ background: "#F7F5EC" }}
            />
            <AlertDialogHeader className="mt-3 space-y-1">
              <AlertDialogTitle className="text-center text-xl">
                Share {activeSelection.size} {bulkSubject}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center">
                Enter the Offerloop account email to share with. They'll get a popup to accept.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <div className="mt-4">
            <input
              type="email"
              autoFocus
              value={shareEmail}
              onChange={(e) => { setShareEmail(e.target.value); setShareError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleShareSubmit(); } }}
              placeholder="name@example.com"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/20"
            />
            {shareError && <p className="mt-2 text-sm text-red-600">{shareError}</p>}
          </div>
          <AlertDialogFooter className="mt-5 gap-2 sm:justify-center">
            <AlertDialogCancel disabled={sharing} className="mt-0 rounded-lg border-slate-200 text-ink-2 hover:bg-slate-50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleShareSubmit(); }}
              disabled={sharing}
              className="rounded-lg bg-[#3B82F6] text-white shadow-sm hover:bg-[#2563EB] gap-1.5"
            >
              <Forward className="h-4 w-4" />
              {sharing ? "Sharing…" : "Share"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default MyNetworkPage;
