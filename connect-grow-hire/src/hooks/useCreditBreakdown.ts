/**
 * useCreditBreakdown — fetches the three-bucket credit breakdown.
 *
 * Backed by `GET /api/billing/credits/breakdown` which returns:
 *   { monthly, monthly_max, bonus, promo, promo_expires_at, total }
 *
 * Refreshes every 60s while mounted. Used by AppSidebar to show "+ N bonus"
 * next to the monthly credit count when a user has purchased top-ups.
 *
 * On error or while loading, returns null — callers should treat that as
 * "show only the monthly bucket from the user object" (no breakdown).
 */
import { useEffect, useState, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { BACKEND_URL } from '@/services/api';

export interface CreditBreakdown {
  monthly: number;
  monthly_max: number;
  bonus: number;
  promo: number;
  promo_expires_at: string | null;
  total: number;
}

export function useCreditBreakdown(): {
  breakdown: CreditBreakdown | null;
  refetch: () => void;
} {
  const [breakdown, setBreakdown] = useState<CreditBreakdown | null>(null);

  const fetchBreakdown = useCallback(async () => {
    try {
      const auth = getAuth();
      const fbUser = auth.currentUser;
      if (!fbUser) return;
      const token = await fbUser.getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/credits/breakdown`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as CreditBreakdown;
      setBreakdown(json);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    fetchBreakdown();
    const id = setInterval(fetchBreakdown, 60_000);
    return () => clearInterval(id);
  }, [fetchBreakdown]);

  return { breakdown, refetch: fetchBreakdown };
}
