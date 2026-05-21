/**
 * Tracks and queries (school, company) pairs that returned zero new contacts
 * even after the backend dropped the company filter (retry level >= 4). When
 * a pair is known-thin, the right-rail recommendations deprioritize it so we
 * stop suggesting combinations that PDL coverage can't actually reach (the
 * canonical example: international students at US-centric firms - Bocconi ×
 * Morgan Stanley, HEC Paris × Goldman, etc.).
 *
 * Storage is plain localStorage so it's per-device and ephemeral; no backend
 * round-trip on the read path. The writer (ContactSearchPage's search response
 * handler) trims to the most recent 100 entries to bound storage growth.
 */

const STORAGE_KEY = 'ofl_thin_pairs';
// 30 days - long enough to remember thin combos, short enough that PDL
// coverage improvements naturally re-enable suggestions over time.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function safeRead(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function makeKey(school: string, company: string): string {
  return `${school.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
}

export function isThinPair(school: string | null | undefined, company: string | null | undefined): boolean {
  if (!school || !company) return false;
  const map = safeRead();
  const ts = map[makeKey(school, company)];
  if (!ts) return false;
  return Date.now() - ts < TTL_MS;
}
