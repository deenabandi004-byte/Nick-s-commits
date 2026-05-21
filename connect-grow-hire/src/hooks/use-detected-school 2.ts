/**
 * useDetectedSchool - async LLM-backed school detection.
 *
 * Fired only when the local SCHOOL_ALIASES + universities.ts scan can't find
 * a school in the prompt. Handles typos, regional schools, international
 * schools (Bocconi, LSE, etc.). Result is cached by prompt-hash on the backend
 * (Firestore) and per-device in localStorage.
 *
 * Returns null until the call completes, then the structured detection.
 * Debounced to 600ms so we don't fire on every keystroke.
 */

import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { BACKEND_URL } from '@/services/api';

export interface DetectedSchool {
  detected: boolean;
  school: string;       // canonical school name
  matched: string;      // the substring from the user's prompt that resolved
  city: string;
  state_or_region: string;
  country: string;
  formatted: string;    // formatted hometown ("Louisville, KY" / "Milan, Italy")
}

const LOCAL_CACHE_KEY = 'offerloop:detected_school_cache:v1';

function readLocalCache(): Record<string, DetectedSchool> {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DetectedSchool>) : {};
  } catch {
    return {};
  }
}

function writeLocalCache(promptHash: string, value: DetectedSchool) {
  try {
    const cache = readLocalCache();
    cache[promptHash] = value;
    // Cap cache size - keep the 200 most recent
    const keys = Object.keys(cache);
    if (keys.length > 200) {
      const trimmed: Record<string, DetectedSchool> = {};
      for (const k of keys.slice(-200)) trimmed[k] = cache[k];
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    // ignore
  }
}

function lightHash(s: string): string {
  // Cheap djb2 - good enough for cache keys; we just need stable buckets.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * @param prompt The user's full search prompt (will be debounced internally)
 * @param skip If true, the hook does nothing - pass true when local detection
 *             already succeeded so we don't waste an LLM call.
 */
export function useDetectedSchool(
  prompt: string,
  skip: boolean = false,
): DetectedSchool | null {
  const [result, setResult] = useState<DetectedSchool | null>(null);
  const inflightRef = useRef<string>('');

  useEffect(() => {
    if (skip || !prompt || prompt.trim().length < 8) {
      setResult(null);
      return;
    }

    // Don't fire if the prompt doesn't even mention a school keyword. Cheap
    // pre-filter - prevents wasting LLM calls on "growth analysts at Snap".
    if (!/\b(university|college|school|alumni|alum|grads?|attended|studied|undergrad)\b/i.test(prompt)) {
      setResult(null);
      return;
    }

    const trimmed = prompt.trim();
    const hash = lightHash(trimmed.toLowerCase());

    // Local cache hit
    const cache = readLocalCache();
    if (cache[hash]) {
      setResult(cache[hash]);
      return;
    }

    // Debounce: wait 600ms after the last change before firing
    const handle = setTimeout(async () => {
      if (inflightRef.current === hash) return;
      inflightRef.current = hash;
      try {
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const res = await fetch(`${BACKEND_URL}/api/search/detect-school`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ prompt: trimmed }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as DetectedSchool;
        if (inflightRef.current !== hash) return; // stale
        if (data.detected) {
          setResult(data);
          writeLocalCache(hash, data);
        } else {
          setResult(null);
          writeLocalCache(hash, data); // negative-cache too
        }
      } catch {
        // network error - leave null
      }
    }, 600);

    return () => clearTimeout(handle);
  }, [prompt, skip]);

  return result;
}
