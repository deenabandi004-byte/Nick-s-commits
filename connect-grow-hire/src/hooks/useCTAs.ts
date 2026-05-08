/**
 * useCTAs  Phase 8 dashboard CTA hook.
 *
 * Polls /api/dashboard/ctas every 60s and exposes dismiss / click
 * mutations that update local state without a refetch round-trip.
 * Returns isQuieted=true when the cooldown banner should render
 * instead of cards.
 *
 * The hook is safe to mount unconditionally: when CTA_CARDS_ENABLED is
 * off, it short-circuits to an empty deck and never hits the network.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';

import { API_BASE_URL } from '@/services/api';
import { CTA_CARDS_ENABLED } from '@/lib/constants';

export type CTAActionClass = 'positive' | 'opportunity' | 'reminder';

export interface CTACardDTO {
  card_id: string;
  trigger_type: string;
  title: string;
  body: string;
  action_label: string;
  action_href: string;
  action_class: CTAActionClass;
  created_at: string;
  source_event_ids: string[];
  aggregated_count: number;
}

interface CTAResponse {
  cards: CTACardDTO[];
  isQuieted: boolean;
  enabled: boolean;
}

interface UseCTAsResult {
  cards: CTACardDTO[];
  isQuieted: boolean;
  enabled: boolean;
  isLoading: boolean;
  error: string | null;
  dismiss: (cardId: string) => Promise<void>;
  click: (cardId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL_MS = 60_000;

async function authedFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const auth = getAuth();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers });
}

export function useCTAs(): UseCTAsResult {
  const [cards, setCards] = useState<CTACardDTO[]>([]);
  const [isQuieted, setIsQuieted] = useState(false);
  const [enabled, setEnabled] = useState(CTA_CARDS_ENABLED);
  const [isLoading, setIsLoading] = useState(CTA_CARDS_ENABLED);
  const [error, setError] = useState<string | null>(null);

  // Avoid setState after unmount during the long poll lifetime.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchOnce = useCallback(async () => {
    if (!CTA_CARDS_ENABLED) {
      setEnabled(false);
      setIsLoading(false);
      return;
    }
    try {
      const res = await authedFetch(`${API_BASE_URL}/dashboard/ctas`);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const payload: CTAResponse = await res.json();
      if (!mountedRef.current) return;
      setCards(Array.isArray(payload.cards) ? payload.cards : []);
      setIsQuieted(!!payload.isQuieted);
      setEnabled(!!payload.enabled);
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!CTA_CARDS_ENABLED) return;
    void fetchOnce();
    const interval = window.setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchOnce]);

  const dismiss = useCallback(
    async (cardId: string) => {
      if (!CTA_CARDS_ENABLED || !cardId) return;
      // Optimistic remove so the dismiss feels instant; the next poll
      // will reconcile if the backend disagreed.
      setCards((prev) => prev.filter((c) => c.card_id !== cardId));
      try {
        const res = await authedFetch(
          `${API_BASE_URL}/dashboard/ctas/${encodeURIComponent(cardId)}/dismiss`,
          { method: 'POST' },
        );
        if (!res.ok) throw new Error(`dismiss failed (${res.status})`);
        const body = (await res.json()) as { notificationStats?: { quietedUntil?: string | null } };
        const quietedUntil = body?.notificationStats?.quietedUntil ?? null;
        if (mountedRef.current && quietedUntil) {
          // Backend just rolled the user into the quiet window  reflect
          // that immediately so the dashboard swaps to the banner.
          const until = new Date(quietedUntil).getTime();
          if (Number.isFinite(until) && until > Date.now()) {
            setIsQuieted(true);
            setCards([]);
          }
        }
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : 'Dismiss failed');
          // Re-fetch to recover the optimistic remove on error.
          void fetchOnce();
        }
      }
    },
    [fetchOnce],
  );

  const click = useCallback(
    async (cardId: string) => {
      if (!CTA_CARDS_ENABLED || !cardId) return;
      // Click is a positive signal; remove from the visible deck so the
      // user is not nagged again on the next poll.
      setCards((prev) => prev.filter((c) => c.card_id !== cardId));
      try {
        const res = await authedFetch(
          `${API_BASE_URL}/dashboard/ctas/${encodeURIComponent(cardId)}/click`,
          { method: 'POST' },
        );
        if (!res.ok) throw new Error(`click failed (${res.status})`);
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : 'Click failed');
          void fetchOnce();
        }
      }
    },
    [fetchOnce],
  );

  return { cards, isQuieted, enabled, isLoading, error, dismiss, click, refetch: fetchOnce };
}
