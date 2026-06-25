// useLoops.ts — React Query hooks for the multi-Loop CRUD layer.
//
// Pattern matches useAgent.ts: short stale times so the grid feels live without
// hammering the API. Mutations invalidate the list query so the grid updates
// the moment a Loop is created/started/paused/deleted.

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createLoop,
  deleteLoop,
  estimateCycleCost,
  getFleetFeed,
  getFleetWeeklySummary,
  getLoop,
  getLoopActivity,
  getSuggestedLoops,
  getUsageBreakdown,
  listLoops,
  markLoopReviewed,
  pauseLoop,
  resumeLoop,
  runLoopNow,
  startLoop,
  updateLoop,
  type CycleCostEstimate,
  type FleetFeedItem,
  type FleetWeeklySummary,
  type Loop,
  type LoopActivityItem,
  type LoopCadence,
  type LoopLimits,
  type SuggestedLoop,
  type UsageBreakdown,
} from "@/services/loops";
import type { ParsedBrief } from "@/services/agent";

const LIST_KEY = ["loops", "list"] as const;
const detailKey = (id: string) => ["loops", "detail", id] as const;

export function useLoopsList(options?: { enabled?: boolean }) {
  return useQuery<{ loops: Loop[]; limits: LoopLimits }>({
    queryKey: LIST_KEY,
    queryFn: listLoops,
    staleTime: 15_000,
    refetchInterval: 20_000, // grid stays live while a Loop is running
    // Hold the last good payload through refetches and transient API blips
    // (e.g. a backend hot-reload) so the grid never blinks back to the
    // first-Loop empty state mid-refetch.
    placeholderData: keepPreviousData,
    // Caller can suppress the fetch (and the 20s refetch interval) while a
    // tour demo seeds the cache via queryClient.setQueryData. Cached data is
    // still returned when enabled=false, so the seed renders unimpeded.
    enabled: options?.enabled ?? true,
  });
}

export function useLoop(loopId: string | null | undefined) {
  return useQuery<Loop>({
    queryKey: loopId ? detailKey(loopId) : ["loops", "detail", "none"],
    queryFn: () => getLoop(loopId as string),
    enabled: !!loopId,
    staleTime: 3_000,
    // Poll while a cycle could be running so counters tick up as the
    // background thread writes them. Run-now returns before the thread
    // completes, so without polling the UI would freeze at the moment of
    // the click. 5s feels live without hammering Firestore.
    refetchInterval: (query) => {
      const data = query.state.data as Loop | undefined;
      if (!data) return false;
      return data.status === "running" ? 5_000 : false;
    },
  });
}

export function useLoopActivity(loopId: string | null | undefined) {
  return useQuery<{ items: LoopActivityItem[] }>({
    queryKey: loopId ? ["loops", "activity", loopId] : ["loops", "activity", "none"],
    queryFn: () => getLoopActivity(loopId as string),
    enabled: !!loopId,
    staleTime: 5_000,
    // Poll alongside the detail page so new finds surface as the cycle runs.
    refetchInterval: 10_000,
  });
}

export function useCreateLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createLoop,
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loopId, patch }: { loopId: string; patch: Partial<Loop> }) =>
      updateLoop(loopId, patch),
    onSuccess: (loop) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.setQueryData(detailKey(loop.id), loop);
    },
  });
}

export function useDeleteLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteLoop,
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useMarkLoopReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markLoopReviewed,
    onSuccess: (_data, loopId) => {
      // Invalidate so any "inactivity_paused" reason clears in the UI.
      qc.invalidateQueries({ queryKey: detailKey(loopId) });
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useEstimateCycleCost(
  briefParsed: ParsedBrief | null,
  cadence: LoopCadence,
  enabled: boolean
) {
  return useQuery<CycleCostEstimate>({
    queryKey: ["loops", "estimate", briefParsed, cadence],
    queryFn: () => estimateCycleCost(briefParsed, cadence),
    enabled,
    staleTime: 30_000,
  });
}

export function useUsageBreakdown() {
  return useQuery<UsageBreakdown>({
    queryKey: ["loops", "usage-breakdown"],
    queryFn: getUsageBreakdown,
    staleTime: 60_000,
  });
}

export function useRunLoopNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runLoopNow,
    // Don't setQueryData here — runLoopNow returns BEFORE the background
    // cycle finishes, so the response has stale 0 counters. Invalidating
    // forces a fresh fetch, and useLoop's polling picks up the real numbers
    // as the cycle writes them.
    onSuccess: (loop) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: detailKey(loop.id) });
    },
  });
}

export function useStartLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startLoop,
    // Same as runLoopNow: start triggers an async cycle. Invalidate, don't
    // overwrite, so polling can catch up to real counter values.
    onSuccess: (loop) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: detailKey(loop.id) });
    },
  });
}

export function usePauseLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: pauseLoop,
    onSuccess: (loop) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.setQueryData(detailKey(loop.id), loop);
    },
  });
}

export function useResumeLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resumeLoop,
    onSuccess: (loop) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.setQueryData(detailKey(loop.id), loop);
    },
  });
}

// ── Fleet rollups (LoopsCommandBar) ─────────────────────────────────────

// Drives the three proof tiles in the command bar (found-this-week,
// drafts waiting, weekly-goal ring). Polled at the same cadence as the
// fleet list so the bar stays in sync with the grid below it.
export function useFleetWeeklySummary() {
  return useQuery<FleetWeeklySummary>({
    queryKey: ["loops", "fleet", "weekly-summary"],
    queryFn: getFleetWeeklySummary,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
}

// Powers the live activity ticker at the bottom of the command bar.
// The component rotates locally through these items every few seconds —
// 30s server-side cadence is enough to keep new finds appearing.
export function useFleetFeed(limit: number = 20) {
  return useQuery<{ items: FleetFeedItem[] }>({
    queryKey: ["loops", "fleet", "feed", limit],
    queryFn: () => getFleetFeed(limit),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// Quickstart Loop templates shown inside the NewLoopTile.
export function useSuggestedLoops() {
  return useQuery<{ items: SuggestedLoop[] }>({
    queryKey: ["loops", "fleet", "suggested"],
    queryFn: getSuggestedLoops,
    staleTime: 5 * 60_000, // curated set; doesn't change often
  });
}
