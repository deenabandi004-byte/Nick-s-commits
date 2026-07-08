// Shared React Query key + fetcher for the personalized job feed.
//
// Both the Job Board page (useQuery) and the app-level preloader
// (queryClient.prefetchQuery in App.tsx) import these so they read and write
// the SAME cache entry. If the key or fetcher diverged, the preload would warm
// a different slot and the page would still wait on its own fetch.
import { apiService, type JobFeedResponse } from "@/services/api";

// staleTime for the feed. Matches the app-wide default (5 min) and the
// page-level useQuery so a preloaded feed is considered fresh when the user
// finally navigates in.
export const JOB_FEED_STALE_MS = 5 * 60 * 1000;

export const jobFeedQueryKey = (uid?: string) => ["jobFeed", uid] as const;

// Non-refresh fetch (refresh=false). The page's own queryFn handles the
// refresh-button rotation path; the preloader only ever warms the default feed.
export const fetchJobFeed = (): Promise<JobFeedResponse> =>
  apiService.getJobFeed({ refresh: false });
