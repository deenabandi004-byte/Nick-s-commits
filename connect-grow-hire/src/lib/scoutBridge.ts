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
  // When true, the destination page runs its primary action automatically
  // (e.g. fires handleSearch on /contact-search and /firm-search) once the
  // prefill has been applied. Used by the Scout "drive the whole workflow"
  // flow so the user does not have to click Search after approving the
  // navigate. Honored only by pages that have opted in.
  auto_submit?: boolean;
}

export interface ScoutPrefillResult {
  prefill: Record<string, string>;
  auto_submit: boolean;
}

/**
 * Event a page already mounted listens for, so an in-place populate (Scout
 * navigate where the user is already on the destination route) re-reads the
 * bridge without a route change.
 */
export const SCOUT_PREFILL_EVENT = 'scout-prefill';

/**
 * Event a destination page emits when its primary action (search, lookup,
 * etc.) finished and results are on-screen. ScoutSidePanel listens and posts
 * a synthetic follow-up message into the chat so the user sees the full
 * round trip without leaving Scout's flow. detail = { count, route,
 * results_route? }.
 */
export const SCOUT_SEARCH_COMPLETED_EVENT = 'scout-search-completed';

export interface ScoutSearchCompletedDetail {
  count: number;
  route: string;
  results_route?: string;
}

/** Store prefill addressed to `route`, valid for the next 30 seconds. */
export function writeScoutPrefill(
  route: string,
  prefill: Record<string, string>,
  options?: { auto_submit?: boolean },
): void {
  try {
    const envelope: ScoutPrefillEnvelope = {
      route: (route || '').split('?')[0],
      prefill: prefill || {},
      expires_at: Date.now() + TTL_MS,
      auto_submit: !!options?.auto_submit,
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
 *
 * Returns just the prefill map for backward compatibility; callers that need
 * auto_submit should use readScoutPrefillEnvelope instead.
 */
export function readScoutPrefill(route: string): Record<string, string> | null {
  const env = readScoutPrefillEnvelope(route);
  return env ? env.prefill : null;
}

/**
 * Read and consume the full envelope (prefill + auto_submit flag). Same
 * route-keyed + 30s TTL + consume-on-match semantics as readScoutPrefill.
 */
export function readScoutPrefillEnvelope(route: string): ScoutPrefillResult | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as ScoutPrefillEnvelope;
    const here = (route || '').split('?')[0];
    if ((env.route || '') !== here) return null; // addressed to another page
    sessionStorage.removeItem(KEY); // consume on match
    if (Date.now() >= env.expires_at) return null; // stale, ignore
    return {
      prefill: env.prefill || {},
      auto_submit: !!env.auto_submit,
    };
  } catch (e) {
    console.error('[ScoutBridge] read failed:', e);
    return null;
  }
}
