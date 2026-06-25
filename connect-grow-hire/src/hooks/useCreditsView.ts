/**
 * useCreditsView — the single source of truth for "what credits to display".
 *
 * The Pro trial spends from a SEPARATE daily pool (300/day), not the monthly
 * `credits` field, which stays frozen during the trial. So any UI that reads
 * `user.credits` directly will show the wrong number while a trial is active.
 *
 * This hook resolves the correct balance + denominator + period label for the
 * current account state, so every credit surface (sidebar, search-cost chips,
 * upgrade banners) shows the same, correct numbers. Trial status is fetched via
 * React Query under a shared key, so multiple consumers dedupe to one request.
 */
import { useQuery } from "@tanstack/react-query";
import { getAuth } from "firebase/auth";
import { BACKEND_URL } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { TIER_CONFIGS } from "@/lib/constants";

interface TrialStatus {
  is_active: boolean;
  credits_remaining?: number;
  credits_total?: number;
  days_remaining?: number;
}

export interface CreditsView {
  /** True while a Pro free trial is active. */
  isTrialing: boolean;
  /** Spendable balance to display (daily pool during trial, else monthly). */
  balance: number;
  /** Denominator for the % bar / "of N" copy. */
  total: number;
  /** "today" during a trial (resets daily), "this month" otherwise. */
  periodLabel: string;
  /** Days left in the trial, when trialing. */
  daysRemaining?: number;
  loading: boolean;
}

async function fetchTrialStatus(): Promise<TrialStatus | null> {
  const fbUser = getAuth().currentUser;
  if (!fbUser) return null;
  const token = await fbUser.getIdToken();
  const res = await fetch(`${BACKEND_URL}/api/users/trial-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.status ?? null;
}

// Dev-only: `?trialpreview` (in `vite dev`) forces the trial daily-budget view
// so the UI can be eyeballed locally without flipping a real account into a
// trial. Inert in production (import.meta.env.DEV is false).
const TRIAL_PREVIEW =
  typeof window !== "undefined" &&
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).has("trialpreview");

export function useCreditsView(): CreditsView {
  const { user } = useFirebaseAuth();
  const tier = (user?.subscriptionTier || user?.tier || "free").toLowerCase();
  const tierKey = (tier in TIER_CONFIGS ? tier : "free") as keyof typeof TIER_CONFIGS;
  const isTrialingFlag = user?.subscriptionStatus === "trialing";

  const { data: trial, isLoading } = useQuery({
    queryKey: ["trial-status"],
    queryFn: fetchTrialStatus,
    // Only fetch when the account is flagged as trialing — avoids a request for
    // every free/paid user. Shared key dedupes across consumers.
    enabled: !!user && isTrialingFlag,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Dev preview short-circuit (after all hooks have run — keeps hook order stable).
  if (TRIAL_PREVIEW) {
    // Mirrors the real single-batch grant (TRIAL_CREDITS = 600 for the window).
    return { isTrialing: true, balance: 480, total: 600, periodLabel: "trial", daysRemaining: 6, loading: false };
  }

  if (isTrialingFlag && trial?.is_active) {
    return {
      isTrialing: true,
      balance: trial.credits_remaining ?? 0,
      total: trial.credits_total ?? 600,
      periodLabel: "trial",
      daysRemaining: trial.days_remaining,
      loading: isLoading,
    };
  }

  return {
    isTrialing: false,
    balance: user?.credits ?? 0,
    total: TIER_CONFIGS[tierKey].credits,
    periodLabel: "this month",
    loading: false,
  };
}
