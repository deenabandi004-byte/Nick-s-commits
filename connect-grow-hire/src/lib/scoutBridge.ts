/**
 * Scout prefill bridge.
 *
 * When Scout proposes a navigate, the destination route's form fields are
 * carried across the navigation in sessionStorage. The envelope is route-keyed
 * and time-boxed: a page applies prefill only when it is addressed to that
 * page's own route AND it is within a 30s window. sessionStorage persists
 * across intra-session navigation, so without the window a stale Scout
 * suggestion would ghost-fill a form the user reached on their own minutes
 * later. The 30s window plus consume-on-read prevents that.
 *
 * This replaces the legacy `scout_auto_populate` key, which was discriminated
 * by `search_type` (contact / firm only) and could not scale to every page.
 */

const KEY = 'scout_prefill';
const TTL_MS = 30_000;

export interface ScoutPrefillEnvelope {
  route: string;
  prefill: Record<string, string>;
  expires_at: number;
}

/**
 * Event a page already mounted listens for, so an in-place populate (Scout
 * navigate where the user is already on the destination route) re-reads the
 * bridge without a route change.
 */
export const SCOUT_PREFILL_EVENT = 'scout-prefill';

/** Store prefill addressed to `route`, valid for the next 30 seconds. */
export function writeScoutPrefill(route: string, prefill: Record<string, string>): void {
  try {
    const envelope: ScoutPrefillEnvelope = {
      route: (route || '').split('?')[0],
      prefill: prefill || {},
      expires_at: Date.now() + TTL_MS,
    };
    sessionStorage.setItem(KEY, JSON.stringify(envelope));
  } catch (e) {
    console.error('[ScoutBridge] write failed:', e);
  }
}

/**
 * Read and consume prefill addressed to `route`.
 *
 * Returns null when there is no prefill, it is addressed to a different route,
 * or it has expired. A matching envelope is always removed (applied at most
 * once); an envelope for a different route is left in place so that page can
 * still read it.
 */
export function readScoutPrefill(route: string): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as ScoutPrefillEnvelope;
    const here = (route || '').split('?')[0];
    if ((env.route || '') !== here) return null; // addressed to another page
    sessionStorage.removeItem(KEY); // consume on match
    if (Date.now() >= env.expires_at) return null; // stale, ignore
    return env.prefill || {};
  } catch (e) {
    console.error('[ScoutBridge] read failed:', e);
    return null;
  }
}
