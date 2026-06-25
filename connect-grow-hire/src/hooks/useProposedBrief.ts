import { useCallback, useEffect, useRef, useState } from "react";

import { proposeBrief, type ProposedBrief } from "@/services/agent";

export interface UseProposedBriefState {
  data: ProposedBrief | null;
  loading: boolean;
  error: Error | null;
  /**
   * Re-runs the proposal fetch. Returns the new ProposedBrief on success
   * (or null on failure / race-loss) so explicit click handlers can apply
   * the result immediately without round-tripping through React state.
   */
  refetch: () => Promise<ProposedBrief | null>;
}

/**
 * Fetch an AI-drafted starting brief for the V2 Loops setup wizard.
 *
 * Gated by `enabled` so the hook is a no-op when the LOOPS_SETUP_V2
 * feature flag is off — the network call only fires for the treatment
 * cohort. `refetch` powers the "Re-suggest" button.
 *
 * Race-safe via a request-id ref: if the user clicks "Re-suggest" before
 * the first fetch lands, the stale response is dropped.
 */
export function useProposedBrief({
  enabled,
}: {
  enabled: boolean;
}): UseProposedBriefState {
  const [data, setData] = useState<ProposedBrief | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);

  const refetch = useCallback(async (): Promise<ProposedBrief | null> => {
    if (!enabled) return null;
    const myId = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await proposeBrief();
      if (myId !== requestId.current) return null;
      setData(result);
      return result;
    } catch (e) {
      if (myId !== requestId.current) return null;
      setError(e instanceof Error ? e : new Error(String(e)));
      return null;
    } finally {
      if (myId === requestId.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    refetch();
  }, [enabled, refetch]);

  return { data, loading, error, refetch };
}
