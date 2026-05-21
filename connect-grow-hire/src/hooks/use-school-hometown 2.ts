/**
 * useSchoolHometown - resolve a school name → its primary campus city.
 *
 * Lookup chain:
 *   1. localStorage cache (instant, persists across visits)
 *   2. Backend /api/school/lookup (LLM + Firestore-shared cache)
 *
 * Returns null while loading or if the school can't be resolved. The Find
 * page's CompanyAlternatives uses this to pin a school's hometown as slot 1
 * of the locations rail - works for any school in the world (not just the
 * 30-ish hardcoded in the static SCHOOL_HOMETOWN_LOCATION map).
 */

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { BACKEND_URL } from '@/services/api';

const CACHE_KEY = 'offerloop:school_hometown_cache:v1';

function readCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeCache(school: string, hometown: string) {
  try {
    const cache = readCache();
    cache[school.toLowerCase()] = hometown;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage might be full or disabled - not fatal
  }
}

function readCached(school: string): string | null {
  const cache = readCache();
  return cache[school.toLowerCase()] || null;
}

export function useSchoolHometown(school: string | null | undefined): string | null {
  const [hometown, setHometown] = useState<string | null>(() => {
    if (!school) return null;
    return readCached(school);
  });

  useEffect(() => {
    if (!school) {
      setHometown(null);
      return;
    }

    // Cache hit - set immediately
    const cached = readCached(school);
    if (cached) {
      setHometown(cached);
      return;
    }

    setHometown(null);
    let cancelled = false;

    (async () => {
      try {
        const u = auth.currentUser;
        if (!u) return; // No auth = skip lookup
        const token = await u.getIdToken();
        const res = await fetch(
          `${BACKEND_URL}/api/school/lookup?school=${encodeURIComponent(school)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          valid?: boolean;
          formatted?: string;
        };
        if (cancelled) return;
        if (data.valid && data.formatted) {
          setHometown(data.formatted);
          writeCache(school, data.formatted);
        }
      } catch {
        // network / parse error - leave hometown null
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [school]);

  return hometown;
}
