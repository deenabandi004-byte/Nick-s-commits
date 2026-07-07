// One labelled horizontal carousel on the Browse Jobs home. Runs its own
// query (catalog search for normal categories, the personalized feed for the
// special "recommended" row), maps results to the shared ProtoJob shape, and
// renders a scrollable strip of BrowseJobCard with left/right arrows.
//
// An empty row renders nothing — we never show an empty "New today" header.
import React, { useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiService, type FeedJob, type JobFeedResponse } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { jobFeedQueryKey, fetchJobFeed, JOB_FEED_STALE_MS } from "@/lib/jobFeedQuery";
import { feedJobToProto, type ProtoJob } from "@/pages/jobBoardAdapter";
import { BrowseJobCard, type BrowseCardActions } from "./BrowseJobCard";
import type { BrowseCategory } from "./categories";

const CARD_WIDTH = 280;
const ROW_LIMIT = 12;

interface JobRowProps {
  category: BrowseCategory;
  savedIds: Set<string>;
  actions: BrowseCardActions;
  autoApplyingId: string | null;
  onSeeAll: (category: BrowseCategory) => void;
}

async function fetchCategoryJobs(category: BrowseCategory): Promise<ProtoJob[]> {
  const r = await apiService.searchJobs({ ...category.params, limit: ROW_LIMIT });
  return (r.results || []).map((j) => feedJobToProto(j, "recommended"));
}

export const JobRow: React.FC<JobRowProps> = ({
  category,
  savedIds,
  actions,
  autoApplyingId,
  onSeeAll,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { user } = useFirebaseAuth();
  const isRecommended = category.special === "recommended";

  // The Recommended row reads the SAME cache entry the app-level
  // JobFeedPrefetch warms at login (jobFeedQueryKey), so it paints instantly
  // instead of refetching the feed under its own key.
  const feedQuery = useQuery({
    queryKey: jobFeedQueryKey(user?.uid),
    queryFn: fetchJobFeed,
    staleTime: JOB_FEED_STALE_MS,
    enabled: isRecommended && !!user,
    select: (feed: JobFeedResponse) =>
      ((feed.top_jobs || []) as FeedJob[])
        .slice(0, ROW_LIMIT)
        .map((j) => feedJobToProto(j, "recommended")),
  });

  const categoryQuery = useQuery({
    queryKey: ["browseRow", category.key],
    queryFn: () => fetchCategoryJobs(category),
    staleTime: 5 * 60 * 1000,
    enabled: !isRecommended,
  });

  const data = isRecommended ? feedQuery.data : categoryQuery.data;
  const isLoading = isRecommended ? feedQuery.isLoading : categoryQuery.isLoading;

  const scrollBy = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * CARD_WIDTH * 2, behavior: "smooth" });
  };

  // Hide the whole row when it resolves empty — no empty headers.
  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          paddingRight: 4,
        }}
      >
        <h2
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--ink-1, #0F172A)",
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <category.icon
            size={17}
            strokeWidth={2}
            style={{ color: "var(--ink-3, #94A3B8)", flexShrink: 0 }}
          />
          {category.label}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => onSeeAll(category)}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--brand-blue, #3B82F6)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            See all →
          </button>
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollBy(-1)}
            style={arrowStyle}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollBy(1)}
            style={arrowStyle}
          >
            ›
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        style={{
          display: "flex",
          gap: 14,
          overflowX: "auto",
          scrollSnapType: "x proximity",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}
      >
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: CARD_WIDTH,
                  height: 150,
                  flexShrink: 0,
                  borderRadius: 14,
                  background:
                    "linear-gradient(90deg, hsl(217 20% 94%) 25%, hsl(217 20% 97%) 50%, hsl(217 20% 94%) 75%)",
                  backgroundSize: "720px 100%",
                  animation: "jbSkelShimmer 1.6s ease-in-out infinite",
                }}
              />
            ))
          : (data || []).map((job) => (
              <div
                key={job.id}
                style={{ width: CARD_WIDTH, flexShrink: 0, scrollSnapAlign: "start" }}
              >
                <BrowseJobCard
                  job={job}
                  saved={savedIds.has(job.id)}
                  autoApplyBusy={autoApplyingId === job.id}
                  actions={actions}
                />
              </div>
            ))}
      </div>
    </section>
  );
};

const arrowStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid var(--line, #E5E5E5)",
  background: "var(--paper, #fff)",
  color: "var(--ink-2, #475569)",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export default JobRow;
