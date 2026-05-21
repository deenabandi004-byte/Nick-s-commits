import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import firebaseApi from '../services/firebaseApi';
import apiService, { type OutboxThread } from '../services/api';
import { generateSuggestions, type Suggestion } from '../lib/suggestionEngine';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const DISMISSED_KEY = 'suggestion_dismissed_ids';

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function writeDismissed(id: string): void {
  try {
    const current = readDismissed();
    current.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...current]));
  } catch {
    // Silent failure: localStorage may be full or unavailable
  }
}

interface UseSuggestionsResult {
  suggestions: Suggestion[];
  loading: false;
  error: null;
}

const EMPTY: UseSuggestionsResult = { suggestions: [], loading: false, error: null };

export function useSuggestions(context: 'find' | 'email'): UseSuggestionsResult {
  const { user } = useFirebaseAuth();
  const uid = user?.uid;

  const { data: flags } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => firebaseApi.getFeatureFlags(),
    staleTime: STALE_TIME,
    enabled: !!uid,
  });

  const enabled = !!uid && flags?.suggestions_enabled === true;

  const { data: goalsData } = useQuery({
    queryKey: ['onboardingData', uid],
    queryFn: () => firebaseApi.getUserOnboardingData(uid!),
    staleTime: STALE_TIME,
    enabled,
  });

  const { data: threadsData } = useQuery({
    queryKey: ['outboxThreads', { limit: 50 }],
    queryFn: async (): Promise<OutboxThread[]> => {
      const res = await apiService.getOutboxThreads({ limit: 50 });
      if ('error' in res) return [];
      return res.threads;
    },
    staleTime: STALE_TIME,
    enabled,
  });

  const suggestions = useMemo(() => {
    if (!enabled) return [];
    if (!goalsData || !threadsData) return [];

    const goals = { dreamCompanies: goalsData.dreamCompanies || [] };
    const dismissed = readDismissed();

    return generateSuggestions(context, goals, threadsData, dismissed);
  }, [enabled, goalsData, threadsData, context]);

  if (!enabled || suggestions.length === 0) return EMPTY;

  return { suggestions, loading: false, error: null };
}
