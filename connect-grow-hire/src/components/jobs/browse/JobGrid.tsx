// Handshake-style filterable grid for the Browse Jobs board. Reached from a
// row's "See all", a Browse pill, or a search query. Pages through the catalog
// search via cursor (infinite scroll) and layers user filters (location, type,
// seniority, date) on top of the base params it was opened with.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { apiService, type JobSearchParams } from "@/services/api";
import { feedJobToProto, type ProtoJob } from "@/pages/jobBoardAdapter";
import { BrowseJobCard, type BrowseCardActions } from "./BrowseJobCard";

const PAGE_SIZE = 24;

interface JobGridProps {
  title: string;
  baseParams: Partial<JobSearchParams>;
  savedIds: Set<string>;
  actions: BrowseCardActions;
  autoApplyingId: string | null;
  onBack: () => void;
}

interface GridFilters {
  location: string;
  type: "" | "FULLTIME" | "PARTTIME" | "INTERNSHIP";
  seniority: "" | "intern" | "entry" | "mid" | "senior";
  postedAfter: "" | "24h" | "7d" | "30d";
}

const EMPTY_FILTERS: GridFilters = { location: "", type: "", seniority: "", postedAfter: "" };

export const JobGrid: React.FC<JobGridProps> = ({
  title,
  baseParams,
  savedIds,
  actions,
  autoApplyingId,
  onBack,
}) => {
  const [filters, setFilters] = useState<GridFilters>(EMPTY_FILTERS);

  // Merge base params with the active filters (filters win on conflict).
  const mergedParams = useMemo<Partial<JobSearchParams>>(() => {
    const p: Partial<JobSearchParams> = { ...baseParams };
    if (filters.location) p.location = filters.location;
    if (filters.type) p.type = filters.type;
    if (filters.seniority) p.seniority = filters.seniority;
    if (filters.postedAfter) p.postedAfter = filters.postedAfter;
    return p;
  }, [baseParams, filters]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["browseGrid", mergedParams],
    queryFn: ({ pageParam }) =>
      apiService.searchJobs({ ...mergedParams, limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 5 * 60 * 1000,
  });

  const jobs = useMemo<ProtoJob[]>(
    () =>
      (data?.pages || [])
        .flatMap((pg) => pg.results || [])
        .map((j) => feedJobToProto(j, "recommended")),
    [data]
  );

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const selectStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--line, #E5E5E5)",
    background: "var(--paper, #fff)",
    fontSize: 13,
    fontFamily: "inherit",
    color: "var(--ink-1, #0F172A)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header + filters */}
      <div style={{ flexShrink: 0, paddingBottom: 16 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--brand-blue, #3B82F6)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
            marginBottom: 8,
          }}
        >
          ← Back to browse
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-1, #0F172A)", margin: "0 0 12px" }}>
          {title}
        </h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            placeholder="Location…"
            value={filters.location}
            onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
            style={{ ...selectStyle, minWidth: 160 }}
          />
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as GridFilters["type"] }))}
            style={selectStyle}
          >
            <option value="">Any type</option>
            <option value="FULLTIME">Full-time</option>
            <option value="PARTTIME">Part-time</option>
            <option value="INTERNSHIP">Internship</option>
          </select>
          <select
            value={filters.seniority}
            onChange={(e) =>
              setFilters((f) => ({ ...f, seniority: e.target.value as GridFilters["seniority"] }))
            }
            style={selectStyle}
          >
            <option value="">Any level</option>
            <option value="intern">Intern</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
          </select>
          <select
            value={filters.postedAfter}
            onChange={(e) =>
              setFilters((f) => ({ ...f, postedAfter: e.target.value as GridFilters["postedAfter"] }))
            }
            style={selectStyle}
          >
            <option value="">Any time</option>
            <option value="24h">Past 24h</option>
            <option value="7d">Past week</option>
            <option value="30d">Past month</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {isError && (
          <div style={{ padding: 24, color: "var(--ink-3, #94A3B8)", fontSize: 14 }}>
            Search is temporarily unavailable. Try again or remove a filter.
          </div>
        )}

        {!isLoading && !isError && jobs.length === 0 && (
          <div style={{ padding: 24, color: "var(--ink-3, #94A3B8)", fontSize: 14 }}>
            No roles match these filters. Try widening them.
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
            paddingBottom: 24,
          }}
        >
          {(isLoading ? Array.from({ length: 8 }) : jobs).map((job, i) =>
            isLoading ? (
              <div
                key={i}
                style={{
                  height: 150,
                  borderRadius: 14,
                  background:
                    "linear-gradient(90deg, hsl(217 20% 94%) 25%, hsl(217 20% 97%) 50%, hsl(217 20% 94%) 75%)",
                  backgroundSize: "720px 100%",
                  animation: "jbSkelShimmer 1.6s ease-in-out infinite",
                }}
              />
            ) : (
              <BrowseJobCard
                key={(job as ProtoJob).id}
                job={job as ProtoJob}
                saved={savedIds.has((job as ProtoJob).id)}
                autoApplyBusy={autoApplyingId === (job as ProtoJob).id}
                actions={actions}
              />
            )
          )}
        </div>

        {/* Infinite-scroll sentinel + load state */}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {isFetchingNextPage && (
          <div style={{ padding: 16, textAlign: "center", color: "var(--ink-3, #94A3B8)", fontSize: 13 }}>
            Loading more…
          </div>
        )}
      </div>
    </div>
  );
};

export default JobGrid;
