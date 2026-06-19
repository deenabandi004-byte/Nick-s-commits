// JobBoardPage.redesign.tsx
//
// Prototype-faithful copy of offerloop-job-board.html wired to live data.
// Lives behind /dev/job-board-redesign. Production /job-board is untouched.
//
// Visual reference: offerloop-job-board.html + design frames (prototype-default,
// prototype-loading, prototype-found-people, prototype-save-search,
// prototype-filters, prototype-locked).
//
// Independent-scroll architecture:
//   .jb-editorial          height: 100% + overflow: hidden  (shell, no scroll)
//     .jb-fb               flex-shrink: 0                   (filter bar pinned)
//     .jb-twopane          flex: 1 + overflow: hidden       (container, no scroll)
//       .jb-list           overflow-y: auto                 (left scrolls)
//       .jb-detail         overflow-y: auto                 (right scrolls)
//
// Data flow: getJobFeed -> buildSectionedJobs (Recent-wins dedup) -> render.
// Quick-filter chips are visual-only this pass (counts hardcoded from frames).
// People CTA opens existing FindHumansModal.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useCreditsView } from "@/hooks/useCreditsView";
import {
  apiService,
  type FeedJob,
  type JobFeedResponse,
  type JobSearchParams,
  type SavedJob,
} from "@/services/api";
import { JobBoardSkeleton } from "@/components/JobBoardSkeleton";
import {
  FindHumansModal,
  type FindHumansJob,
} from "@/components/jobs/FindHumansModal";
import { toast } from "@/hooks/use-toast";

import { JobCard } from "@/components/jobs/JobCard";
import { JobDetail, type JobDescriptionState } from "@/components/jobs/JobDetail";
import { SaveSearchModal } from "@/components/jobs/SaveSearchModal";
import {
  MoreFiltersPanel,
  type MoreFiltersState,
} from "@/components/jobs/MoreFiltersPanel";
// moreFiltersToParams is defined below the imports so it can reference the
// imported MoreFiltersState type.
import {
  IconClose,
  IconFilter,
  IconPlus,
  IconRefresh,
  IconSavedBookmark,
  IconSearch,
} from "@/components/jobs/icons";

import {
  buildSectionedJobs,
  feedJobToProto,
  type ProtoJob,
} from "./jobBoardAdapter";
import "./JobBoardEditorial.redesign.css";

// Quick-filter chips. Each chip carries the JobSearchParams delta it
// contributes when active. The handler in catalogParamsFromChips merges them
// into a single query before calling apiService.searchJobs.
//
// Counts intentionally absent: badge numbers would lie until the catalog
// query has returned, so we leave them off rather than render stale ones.
type QuickFilter = { key: string; label: string; toParams: Partial<JobSearchParams> };

const QUICK_FILTERS: QuickFilter[] = [
  { key: "Remote",      label: "Remote",      toParams: { location: "remote" } },
  { key: "Full-time",   label: "Full-time",   toParams: { type: "FULLTIME" } },
  { key: "Internship",  label: "Internship",  toParams: { type: "INTERNSHIP" } },
  { key: "Entry-level", label: "Entry-level", toParams: { seniority: "entry" } },
];

// Merge active chip params into one JobSearchParams object. Later chips win
// on key conflicts (e.g. Full-time + Internship both set `type` -> the last
// one wins). The chip UI already prevents selecting conflicting chips by
// removing one when the other is added; this is a defensive last step.
function catalogParamsFromChips(
  active: string[],
  defs: QuickFilter[],
): Partial<JobSearchParams> {
  const out: Partial<JobSearchParams> = {};
  for (const def of defs) {
    if (active.includes(def.key)) Object.assign(out, def.toParams);
  }
  return out;
}

// Map the drawer state into backend params.
//
// Experience Level: "Internship" routes to `type` (the backend treats
// internships as an employment type, not a seniority). The rest route to
// `seniority`. Company Size and Visa Sponsorship were not re-added because
// the data audit found 0% coverage; this helper does not need to handle them.
//
// Date Posted maps the human label to the backend's relative-window token
// vocabulary ("24h" / "7d" / "30d"). "Any time" means no filter, so we omit
// the param entirely rather than send an empty string.
function moreFiltersToParams(
  state: MoreFiltersState | null,
): Partial<JobSearchParams> {
  if (!state) return {};
  const out: Partial<JobSearchParams> = {};
  const exp = state.experience[0];
  if (exp === "Internship") out.type = "INTERNSHIP";
  else if (exp === "Entry Level") out.seniority = "entry";
  else if (exp === "Mid Level") out.seniority = "mid";
  else if (exp === "Senior") out.seniority = "senior";
  if (state.datePosted === "Past 24h") out.postedAfter = "24h";
  else if (state.datePosted === "Past week") out.postedAfter = "7d";
  else if (state.datePosted === "Past month") out.postedAfter = "30d";
  return out;
}

// Cards rendered on the first synchronous paint after a feed loads. The rest
// are revealed on the next idle tick (see revealAll). Keeps first paint cheap
// without dropping any job from the final list.
const INITIAL_RENDER = 30;

// Session cache of fetched job descriptions, keyed by job id. Lives at module
// scope so it survives navigating away from and back to the board within the
// SPA session. Loaded and empty results are cached; errors are not, so a
// transient failure can be retried.
const descriptionCache = new Map<string, JobDescriptionState>();

export const JobBoardPage: React.FC = () => {
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const creditsView = useCreditsView();

  // ---- Server data --------------------------------------------------------
  const [feed, setFeed] = useState<JobFeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  // Progressive render gate. False on each fresh load so the first paint is
  // capped to INITIAL_RENDER cards; flipped true on the next idle tick to
  // render the remainder.
  const [revealAll, setRevealAll] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // ---- Local UI state -----------------------------------------------------
  const [search, setSearch] = useState("");
  // No chips active on first render. Earlier the chips defaulted to "all on"
  // because they were visual-only and the user had no way to "turn them on"
  // anyway; now that each chip narrows the query, we start neutral so the
  // initial paint shows the personalized feed rather than a 4-way filtered
  // catalog query.
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  // Chips coming from the More Filters drawer (experience, date, size, visa).
  // These are removable just like quick filters; visual-only.
  const [moreFilterChips, setMoreFilterChips] = useState<string[]>([]);
  const [moreFiltersState, setMoreFiltersState] = useState<MoreFiltersState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [findHumansJob, setFindHumansJob] = useState<FindHumansJob | null>(null);
  // Which search the Find the Humans modal runs, plus the requested count for
  // the employee / hiring-manager flows.
  const [findHumansKind, setFindHumansKind] = useState<"employee" | "hiring-manager">("hiring-manager");
  const [findHumansCount, setFindHumansCount] = useState(3);

  // Saved snapshots (full job data, not just IDs). Drive the Saved
  // top-level tab. Storing the full snapshot means a bookmarked job stays
  // viewable even if the original posting expires upstream and rotates out
  // of the live feed.
  //
  // The Applied tab was deliberately removed: clicking the Apply URL only
  // proves the user opened the link, not that they actually submitted an
  // application. Auto-tracking it created false memory ("oh, I already
  // applied"). If we ever want apply tracking, it should be an explicit
  // action — not a side-effect of opening a tab.
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);

  // Top-level tab. "discover" = the existing Recent + Recommended view.
  // "saved" swaps the entire job list for the bookmarked bin, mirroring
  // the Outbox tab pattern (always-visible at the top of the page).
  const [activeJobTab, setActiveJobTab] = useState<"discover" | "saved">("discover");

  // Collapsible section state. Default: Recent collapsed, Recommended open
  // so the better-matching list is visible without scrolling. User's choice
  // is persisted to localStorage so it survives reload and tab switches.
  const [collapsedSections, setCollapsedSections] = useState<{
    recent: boolean;
    recommended: boolean;
    saved: boolean;
    applied: boolean;
  }>(() => {
    try {
      const raw = localStorage.getItem("jb_collapsed_sections");
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          recent: typeof parsed.recent === "boolean" ? parsed.recent : true,
          recommended: typeof parsed.recommended === "boolean" ? parsed.recommended : false,
          saved: typeof parsed.saved === "boolean" ? parsed.saved : true,
          applied: typeof parsed.applied === "boolean" ? parsed.applied : true,
        };
      }
    } catch {
      /* localStorage may be unavailable; fall through to defaults */
    }
    return { recent: true, recommended: false, saved: true, applied: true };
  });

  const toggleSection = useCallback((key: "recent" | "recommended" | "saved" | "applied") => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("jb_collapsed_sections", JSON.stringify(next));
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  }, []);

  const addDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAddDropdown) return;
    const onClick = (e: MouseEvent) => {
      if (
        addDropdownRef.current &&
        !addDropdownRef.current.contains(e.target as Node)
      ) {
        setShowAddDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showAddDropdown]);

  // ---- Data loaders -------------------------------------------------------
  const loadFeed = useCallback(async (refresh = false) => {
    try {
      setFeedLoading(true);
      setRevealAll(false);
      const data = await apiService.getJobFeed({ refresh });
      setFeed(data);
      // Refresh-rotation toast. The backend advances an offset into the
      // user's cached ranked list on every refresh and signals feed_wrapped
      // when that offset wraps back to the top. Show the user a brief
      // notice so a wrap does not look like "nothing changed".
      if (refresh && data.feed_wrapped) {
        toast({
          title: "Back to your top picks",
          description: "You have seen the freshest matches. Starting over from the top of your ranking.",
        });
      }
    } catch (err) {
      console.error("getJobFeed failed", err);
      toast({
        title: "Couldn't load jobs",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const r = await apiService.listSavedJobs();
      setSavedJobs(r.saved);
      setSavedIds(new Set(r.saved.map((s) => s.job_id)));
    } catch (err) {
      console.warn("saved jobs fetch failed", err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadFeed();
    loadSaved();
  }, [user, loadFeed, loadSaved]);

  // ---- Adapter ------------------------------------------------------------
  const sections = useMemo(() => buildSectionedJobs(feed), [feed]);

  // ---- Catalog mode (search + filter chips hit /api/jobs/search) ---------
  // The discover view shows the personalized, ranked, capped feed. When the
  // user types a query or activates any chip we switch to "catalog mode":
  // the same UI renders results returned by the catalog query over the full
  // jobs store, with no per-company cap. Empty query AND no active chips
  // means the personalized feed renders.
  const isCatalogMode =
    search.trim().length > 0 ||
    activeFilters.length > 0 ||
    moreFilterChips.length > 0;

  const [catalogResults, setCatalogResults] = useState<ProtoJob[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogScanned, setCatalogScanned] = useState(0);
  const [catalogNextCursor, setCatalogNextCursor] = useState<string | null>(null);

  useEffect(() => {
    if (!isCatalogMode) {
      // Drop any prior catalog state when leaving the mode so a re-entry
      // does not render stale results for a moment before the new query
      // returns.
      setCatalogResults([]);
      setCatalogError(null);
      setCatalogScanned(0);
      setCatalogNextCursor(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const params: JobSearchParams = {
          ...catalogParamsFromChips(activeFilters, QUICK_FILTERS),
          ...moreFiltersToParams(moreFiltersState),
          q: search.trim() || undefined,
          limit: 50,
        };
        const r = await apiService.searchJobs(params);
        if (cancelled) return;
        setCatalogResults(r.results.map((j: FeedJob) => feedJobToProto(j, "recommended")));
        setCatalogScanned(r.scanned);
        setCatalogNextCursor(r.next_cursor);
      } catch (err) {
        if (cancelled) return;
        console.error("searchJobs failed", err);
        setCatalogError("Search is temporarily unavailable.");
        setCatalogResults([]);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isCatalogMode, search, activeFilters, moreFilterChips, moreFiltersState]);

  // When in catalog mode the personalized sections collapse to empty so the
  // existing render code naturally hides them; results flow through what was
  // previously the Recommended section, retitled below.
  const searchedRecent: ProtoJob[] = isCatalogMode ? [] : sections.recent;
  const searchedRecommended: ProtoJob[] = isCatalogMode ? catalogResults : sections.recommended;

  const allProtoJobs = useMemo(
    () => (isCatalogMode ? catalogResults : [...sections.recent, ...sections.recommended]),
    [isCatalogMode, catalogResults, sections]
  );

  // Once the feed is loaded, reveal the full list on the next idle tick. The
  // first synchronous paint renders at most INITIAL_RENDER cards (see the
  // capped slices below); this unblocks that paint and then fills in the rest.
  useEffect(() => {
    if (feedLoading || revealAll) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;
    if (w.requestIdleCallback) {
      idleId = w.requestIdleCallback(() => setRevealAll(true));
    } else {
      timeoutId = setTimeout(() => setRevealAll(true), 0);
    }
    return () => {
      if (idleId !== undefined && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [feedLoading, revealAll]);

  // Cap the rendered cards on first paint by depleting a shared budget across
  // the expanded, searched sections in render order (Recent then Recommended).
  // Collapsed sections render nothing regardless, so they consume no budget.
  // Section counts still use the full searched lengths, so the badges stay
  // honest while only the DOM is trimmed until revealAll flips true.
  const { recentToRender, recommendedToRender } = useMemo(() => {
    if (revealAll) {
      return { recentToRender: searchedRecent, recommendedToRender: searchedRecommended };
    }
    let budget = INITIAL_RENDER;
    const recentSlice = collapsedSections.recent ? [] : searchedRecent.slice(0, budget);
    budget -= recentSlice.length;
    const recommendedSlice = collapsedSections.recommended
      ? []
      : searchedRecommended.slice(0, budget);
    return { recentToRender: recentSlice, recommendedToRender: recommendedSlice };
  }, [
    revealAll,
    collapsedSections.recent,
    collapsedSections.recommended,
    searchedRecent,
    searchedRecommended,
  ]);

  // Default-select first Recent on first load; reselect when current selection
  // drops out of the visible list (e.g. dismissed or filtered away).
  useEffect(() => {
    const flat = [...searchedRecent, ...searchedRecommended].filter(
      (j) => !dismissedIds.has(j.id)
    );
    if (flat.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !flat.some((j) => j.id === selectedId)) {
      setSelectedId(flat[0].id);
    }
  }, [searchedRecent, searchedRecommended, dismissedIds, selectedId]);

  const selectedJob = useMemo(
    () => allProtoJobs.find((j) => j.id === selectedId) ?? null,
    [allProtoJobs, selectedId]
  );

  // Lazy-load the description for the open job. The feed omits descriptions to
  // stay lean, so we fetch the single job's prose when its detail is shown.
  const [descRetryTick, setDescRetryTick] = useState(0);
  const [, setDescVersion] = useState(0);
  const bumpDesc = () => setDescVersion((v) => v + 1);

  useEffect(() => {
    const id = selectedId;
    if (!id) return;
    const cached = descriptionCache.get(id);
    if (cached && cached.status !== "error") return;
    let cancelled = false;
    descriptionCache.set(id, { status: "loading" });
    bumpDesc();
    apiService
      .getJobDescription(id)
      .then((res) => {
        const text = (res.description ?? "").trim();
        descriptionCache.set(id, text ? { status: "loaded", text } : { status: "empty" });
      })
      .catch(() => {
        descriptionCache.set(id, { status: "error" });
      })
      .finally(() => {
        if (!cancelled) bumpDesc();
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, descRetryTick]);

  const displayedDesc: JobDescriptionState =
    (selectedId ? descriptionCache.get(selectedId) : undefined) ?? { status: "loading" };

  const retryDescription = () => {
    if (!selectedId) return;
    descriptionCache.delete(selectedId);
    setDescRetryTick((t) => t + 1);
  };

  // ---- Chip operations (visual only) --------------------------------------
  const removeFilter = (k: string) => {
    setActiveFilters((prev) => prev.filter((x) => x !== k));
    setMoreFilterChips((prev) => prev.filter((x) => x !== k));
  };
  const addFilter = (k: string) =>
    setActiveFilters((prev) => (prev.includes(k) ? prev : [...prev, k]));
  const clearFilters = () => {
    setActiveFilters([]);
    setMoreFilterChips([]);
  };

  const available = QUICK_FILTERS.filter((f) => !activeFilters.includes(f.key));

  const handleApplyMoreFilters = (state: MoreFiltersState) => {
    setMoreFiltersState(state);
    // Render the picker selections as removable chips in the chip bar.
    // "Any time" is the no-filter default and should not appear as a chip.
    const chips: string[] = [...state.experience];
    if (state.datePosted && state.datePosted !== "Any time") {
      chips.push(state.datePosted);
    }
    setMoreFilterChips(chips);
  };

  // ---- Action handlers ----------------------------------------------------
  // Apply just opens the URL — no auto-tracking. Opening a tab doesn't
  // mean the user submitted an application, so tracking it would create
  // false memory.
  const handleApply = (j: ProtoJob) => {
    if (j.applyUrl) window.open(j.applyUrl, "_blank", "noopener,noreferrer");
  };

  const toFindHumansJob = (j: ProtoJob): FindHumansJob => {
    // Reuse the lazily fetched description when it is already loaded; never
    // refetch here and never fall back to filler.
    const cached = descriptionCache.get(j.id);
    return {
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      description: cached && cached.status === "loaded" ? cached.text : undefined,
      url: j.applyUrl,
    };
  };

  const openFindHumans = (
    j: ProtoJob,
    kind: "employee" | "hiring-manager" = "hiring-manager",
    count = 3,
  ) => {
    setFindHumansKind(kind);
    setFindHumansCount(count);
    setFindHumansJob(toFindHumansJob(j));
  };

  // Minimal converter for rendering Saved / Applied snapshots in JobCard.
  // Live feed enrichment (tags, match signals, salary, description) isn't
  // preserved in the snapshot — those fields default to empty / null.
  const snapshotToProto = (s: SavedJob): ProtoJob => ({
    id: s.job_id,
    section: "recommended",
    title: s.title ?? "",
    company: s.company ?? "",
    logoUrl: s.logo_url ?? null,
    logoMonogram: (s.company ?? "?").charAt(0).toUpperCase(),
    posted: "",
    postedISO: null,
    location: s.location ?? "",
    jobType: "",
    category: "",
    match: s.match_score ?? null,
    matchSignals: [],
    whyLine: "",
    ranked: true,
    salary: null,
    salaryAnnual: null,
    tags: [],
    applyUrl: s.apply_url ?? "",
    isNew: false,
    isStale: false,
    detailPosted: "",
    detailMatch: s.match_score ?? null,
    detailLocation: s.location ?? "",
    structured: undefined,
  });

  const savedProtoJobs = useMemo(
    () => applySearch(savedJobs.map(snapshotToProto), search),
    [savedJobs, search]
  );

  const handleSave = async (j: ProtoJob) => {
    const already = savedIds.has(j.id);
    try {
      if (already) {
        await apiService.unsaveJob(j.id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(j.id);
          return next;
        });
        setSavedJobs((prev) => prev.filter((p) => p.job_id !== j.id));
      } else {
        const snap: SavedJob = {
          job_id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          apply_url: j.applyUrl,
          match_score: j.match ?? undefined,
          logo_url: j.logoUrl ?? undefined,
        };
        await apiService.saveJob(snap);
        setSavedIds((prev) => new Set(prev).add(j.id));
        setSavedJobs((prev) => [snap, ...prev.filter((p) => p.job_id !== j.id)]);
      }
    } catch (err) {
      console.error("save toggle failed", err);
      toast({
        title: "Couldn't update saved jobs",
        variant: "destructive",
      });
    }
  };

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const handleUndoDismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // ---- Render -------------------------------------------------------------
  if (authLoading) return <JobBoardSkeleton />;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <AppHeader title="Job Board" />
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="jb-editorial">
              {/* ---- FilterBar (pinned) ---- */}
              <div className="jb-fb">
                <div className="jb-fb-row">
                  <div>
                    <h1 className="jb-fb-title">Discover Opportunities</h1>
                  </div>
                </div>

                {/* Top-level tabs — Outbox-style segmented control */}
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    marginTop: 12,
                    marginBottom: 4,
                    borderBottom: "1px solid var(--line, #E5E5E5)",
                  }}
                >
                  {([
                    { id: "discover", label: "Discover", count: sections.recent.length + sections.recommended.length },
                    { id: "saved", label: "Saved", count: savedJobs.length },
                  ] as const).map((t) => {
                    const isActive = activeJobTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveJobTab(t.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "10px 16px",
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? "var(--brand-blue, #3B82F6)" : "var(--ink-3, #94A3B8)",
                          background: "transparent",
                          border: "none",
                          borderBottom: isActive
                            ? "2px solid var(--brand-blue, #3B82F6)"
                            : "2px solid transparent",
                          marginBottom: -1,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "color .15s, border-color .15s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-2, #475569)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-3, #94A3B8)";
                        }}
                      >
                        {t.label}
                        {t.count > 0 && (
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 10,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: isActive ? "var(--primary-50, #EEF1F9)" : "var(--paper-2, #FAFBFF)",
                              color: isActive ? "var(--accent, #4A60A8)" : "var(--ink-3, #94A3B8)",
                            }}
                          >
                            {t.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="jb-fb-actions" data-tour="tour-job-board-filters">
                  <div className="jb-search">
                    <span className="jb-search-icon"><IconSearch /></span>
                    <input
                      type="text"
                      placeholder="Search for jobs by Name, Company or Title..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <button
                    className="jb-fb-btn"
                    type="button"
                    onClick={() => setShowSaveSearch(true)}
                  >
                    <IconSavedBookmark />
                    Save Search
                  </button>
                  <button
                    className="jb-fb-btn"
                    type="button"
                    onClick={() => setShowMoreFilters(true)}
                  >
                    <IconFilter />
                    More Filters
                  </button>
                  <button
                    className="jb-fb-btn jb-fb-btn-icon"
                    type="button"
                    title="Refresh and reshuffle"
                    onClick={() => loadFeed(true)}
                    disabled={feedLoading}
                  >
                    <IconRefresh />
                  </button>
                </div>

                <div className="jb-chips">
                  <span className="jb-chips-label">Active filters:</span>
                  {(activeFilters.length + moreFilterChips.length) > 0 ? (
                    <>
                      {activeFilters.map((k) => {
                        const def = QUICK_FILTERS.find((q) => q.key === k);
                        const label = def ? def.label : k;
                        return (
                          <span key={`q-${k}`} className="jb-chip">
                            {label}
                            <button
                              type="button"
                              className="jb-chip-close"
                              onClick={() => removeFilter(k)}
                              aria-label={`Remove ${k}`}
                            >
                              <IconClose />
                            </button>
                          </span>
                        );
                      })}
                      {moreFilterChips.map((k) => (
                        <span key={`m-${k}`} className="jb-chip">
                          {k}
                          <button
                            type="button"
                            className="jb-chip-close"
                            onClick={() => removeFilter(k)}
                            aria-label={`Remove ${k}`}
                          >
                            <IconClose />
                          </button>
                        </span>
                      ))}
                      {available.length > 0 && (
                        <div className="jb-chip-add-wrap" ref={addDropdownRef}>
                          <button
                            type="button"
                            className="jb-chip-add"
                            onClick={() => setShowAddDropdown((v) => !v)}
                          >
                            <IconPlus />
                            Add Filter
                          </button>
                          {showAddDropdown && (
                            <div className="jb-dropdown">
                              {available.map((f) => (
                                <button
                                  key={f.key}
                                  type="button"
                                  onClick={() => {
                                    addFilter(f.key);
                                    setShowAddDropdown(false);
                                  }}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className="jb-chip-clear"
                        onClick={clearFilters}
                      >
                        Clear all
                      </button>
                    </>
                  ) : (
                    <div className="jb-chip-add-wrap" ref={addDropdownRef}>
                      <button
                        type="button"
                        className="jb-chip-add"
                        onClick={() => setShowAddDropdown((v) => !v)}
                      >
                        <IconPlus />
                        Add Filter
                      </button>
                      {showAddDropdown && (
                        <div className="jb-dropdown">
                          {QUICK_FILTERS.map((f) => (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => {
                                addFilter(f.key);
                                setShowAddDropdown(false);
                              }}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ---- Two-pane body (independent scroll) ---- */}
              <div className="jb-twopane">
                <div className="jb-list" data-tour="tour-job-board-list">
                  {!feedLoading &&
                    feed?.summary?.freshness_label &&
                    feed.summary.freshness_label !== "Unknown" && (
                      <div
                        style={{
                          padding: "12px 12px 0",
                          fontSize: 11,
                          color: "var(--ink-3, #94A3B8)",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>Updated {feed.summary.freshness_label}</span>
                        {feed.cached && (
                          <span style={{ color: "var(--ink-3, #94A3B8)", opacity: 0.7 }}>
                            · cached
                          </span>
                        )}
                      </div>
                    )}

                  {((feedLoading && !isCatalogMode) ||
                    (isCatalogMode && catalogLoading)) && (
                    <>
                      <div className="jb-loading-note">
                        <span className="spin" aria-hidden />
                        Finding the best roles for you — give it a few seconds.
                      </div>
                      <ListSkeleton />
                    </>
                  )}

                  {isCatalogMode && catalogError && (
                    <div className="jb-empty" style={{ margin: "16px 8px" }}>
                      <div className="h">{catalogError}</div>
                      <div className="b">
                        Try again, or remove some filters. The catalog index
                        may still be warming up after a recent deploy.
                      </div>
                    </div>
                  )}

                  {!feedLoading &&
                    !catalogLoading &&
                    !catalogError &&
                    searchedRecent.length === 0 &&
                    searchedRecommended.length === 0 && (
                      <div className="jb-empty" style={{ margin: "16px 8px" }}>
                        <div className="h">No roles match your search.</div>
                        <div className="b">
                          {isCatalogMode
                            ? `Scanned ${catalogScanned} jobs. Try a different keyword or remove a filter.`
                            : "Try clearing the search box or check back after the next pipeline run."}
                        </div>
                      </div>
                    )}

                  {activeJobTab === "discover" && !feedLoading && searchedRecent.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="jb-section-heading jb-section-toggle"
                        onClick={() => toggleSection("recent")}
                        aria-expanded={!collapsedSections.recent}
                      >
                        <span
                          className={`jb-section-chevron ${collapsedSections.recent ? "collapsed" : "expanded"}`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                        Recent job postings
                        <span className="jb-section-count">{searchedRecent.length}</span>
                      </button>
                      {!collapsedSections.recent && recentToRender.map((j) => (
                        <JobCard
                          key={j.id}
                          job={j}
                          selected={selectedId === j.id}
                          dismissed={dismissedIds.has(j.id)}
                          onClick={() => !dismissedIds.has(j.id) && setSelectedId(j.id)}
                          onDismiss={() => handleDismiss(j.id)}
                          onUndo={() => handleUndoDismiss(j.id)}
                        />
                      ))}
                    </>
                  )}

                  {activeJobTab === "discover" && !feedLoading && searchedRecommended.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="jb-section-heading jb-section-toggle"
                        onClick={() => toggleSection("recommended")}
                        aria-expanded={!collapsedSections.recommended}
                      >
                        <span
                          className={`jb-section-chevron ${collapsedSections.recommended ? "collapsed" : "expanded"}`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                        {isCatalogMode ? "Search results" : "Recommended for you"}
                        <span className="jb-section-count">{searchedRecommended.length}</span>
                        {isCatalogMode && catalogNextCursor && (
                          <span
                            className="jb-section-more"
                            style={{ marginLeft: 8, color: "var(--ink-3, #94A3B8)", fontSize: 12 }}
                          >
                            more available
                          </span>
                        )}
                      </button>
                      {!collapsedSections.recommended && recommendedToRender.map((j) => (
                        <JobCard
                          key={j.id}
                          job={j}
                          selected={selectedId === j.id}
                          dismissed={dismissedIds.has(j.id)}
                          onClick={() => !dismissedIds.has(j.id) && setSelectedId(j.id)}
                          onDismiss={() => handleDismiss(j.id)}
                          onUndo={() => handleUndoDismiss(j.id)}
                        />
                      ))}
                    </>
                  )}

                  {/* Saved tab: list of bookmarked jobs */}
                  {activeJobTab === "saved" && (
                    savedProtoJobs.length > 0 ? (
                      savedProtoJobs.map((j) => (
                        <JobCard
                          key={`saved-${j.id}`}
                          job={j}
                          selected={selectedId === j.id}
                          dismissed={false}
                          onClick={() => setSelectedId(j.id)}
                          onDismiss={() => {}}
                          onUndo={() => {}}
                        />
                      ))
                    ) : (
                      <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--ink-3, #94A3B8)", fontSize: 13 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-2, #475569)", marginBottom: 6 }}>
                          No saved jobs yet
                        </div>
                        Click the bookmark icon on any job to save it here.
                      </div>
                    )
                  )}
                </div>

                <div className="jb-detail">
                  {selectedJob ? (
                    <JobDetail
                      job={selectedJob}
                      description={displayedDesc}
                      onRetryDescription={retryDescription}
                      isSaved={savedIds.has(selectedJob.id)}
                      onApply={() => handleApply(selectedJob)}
                      onSave={() => handleSave(selectedJob)}
                      onShare={() => {
                        if (selectedJob.applyUrl) {
                          navigator.clipboard?.writeText(selectedJob.applyUrl);
                          toast({ title: "Job link copied" });
                        }
                      }}
                      onFindPeople={() => openFindHumans(selectedJob, "hiring-manager")}
                      onFindEmployees={(count) => openFindHumans(selectedJob, "employee", count)}
                      userPlan={user?.tier ?? "free"}
                      currentCredits={creditsView.balance}
                    />
                  ) : feedLoading || catalogLoading ? (
                    <div className="jb-loading-note" style={{ paddingTop: 48 }}>
                      <span className="spin" aria-hidden />
                      Loading jobs — give it a few seconds…
                    </div>
                  ) : (
                    <div className="jb-loading">Select a role to see details.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SaveSearchModal
        open={showSaveSearch}
        onClose={() => setShowSaveSearch(false)}
        currentFilters={activeFilters}
      />
      <MoreFiltersPanel
        open={showMoreFilters}
        onClose={() => setShowMoreFilters(false)}
        onApply={handleApplyMoreFilters}
        initial={moreFiltersState ?? undefined}
      />
      <FindHumansModal
        open={!!findHumansJob}
        onOpenChange={(o) => !o && setFindHumansJob(null)}
        job={findHumansJob}
        kind={findHumansKind}
        count={findHumansCount}
      />
    </SidebarProvider>
  );
};

export default JobBoardPage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// In-pane loading state for the 479px list column. The exported
// JobBoardSkeleton is a 3-col grid built for the old full-width page and
// overflows this narrow pane, so we render lightweight per-card shimmer rows
// shaped like a JobCard instead. Keyframe is injected inline so this stays
// self-contained, mirroring how JobBoardSkeleton ships its own animation.
const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div style={{ padding: "24px 4px 8px" }} aria-busy="true" aria-label="Loading roles">
    <style>{`
      @keyframes jbSkelShimmer {
        0% { background-position: -360px 0; }
        100% { background-position: 360px 0; }
      }
    `}</style>
    {[...Array(rows)].map((_, i) => (
      <ListSkeletonRow key={i} index={i} />
    ))}
  </div>
);

const SkelBlock: React.FC<{
  w?: number | string;
  h?: number;
  r?: number;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ w = "100%", h = 12, r = 4, delay = 0, style }) => (
  <div
    style={{
      width: w,
      height: h,
      borderRadius: r,
      background:
        "linear-gradient(90deg, hsl(217 20% 93%) 25%, hsl(217 20% 97%) 50%, hsl(217 20% 93%) 75%)",
      backgroundSize: "720px 100%",
      animation: "jbSkelShimmer 1.6s ease-in-out infinite",
      animationDelay: `${delay}ms`,
      ...style,
    }}
  />
);

const ListSkeletonRow: React.FC<{ index: number }> = ({ index }) => {
  const d = index * 120;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "16px 12px",
        borderBottom: "1px solid var(--line, #E5E5E5)",
      }}
    >
      <SkelBlock w={41} h={41} r={8} delay={d} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <SkelBlock w="70%" h={14} delay={d + 40} />
        <SkelBlock w="45%" h={12} delay={d + 80} />
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <SkelBlock w={64} h={18} r={9} delay={d + 120} />
          <SkelBlock w={48} h={18} r={9} delay={d + 160} />
        </div>
        <SkelBlock w="30%" h={10} delay={d + 200} />
      </div>
    </div>
  );
};

function applySearch(list: ProtoJob[], search: string): ProtoJob[] {
  if (!search.trim()) return list;
  const q = search.trim().toLowerCase();
  return list.filter(
    (j) =>
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q)
  );
}
