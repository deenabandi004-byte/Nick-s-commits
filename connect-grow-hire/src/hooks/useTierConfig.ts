/**
 * useTierConfig — single source of truth for tiers, credit costs, Stripe SKUs,
 * slider stops, trial config, and active promos.
 *
 * Fetched from `/api/tier-config` (public, no auth). Cached 1h via React Query.
 * Falls back to `lib/constants.ts` defaults if the endpoint is unreachable so
 * the app still renders.
 */
import { useQuery } from '@tanstack/react-query';
import { BACKEND_URL } from '@/services/api';
import { TIER_CONFIGS as FALLBACK_TIERS } from '@/lib/constants';

// ---------- types ----------

export type Audience = 'student' | 'list';
export type Cadence = 'monthly' | 'annual';

export interface SliderStop {
  credits: number;
  student: number;
  list: number;
  default?: boolean;
}

export interface TopUpPack {
  id: 'starter' | 'best' | 'bulk' | string;
  credits: number;
  price: number;
  label: string;
  recommended?: boolean;
}

export interface TrialConfig {
  days_student: number;
  days_non_student: number;
  credits: number; // one-time grant for the whole trial (single-batch model)
  daily_export_cap: number;
  cc_extension_days: number;
}

export interface SeasonPassConfig {
  student: number;
  list: number;
  months: number;
  credits_per_month: number;
  new_users_only_until: string;
}

export interface AnnualPricing {
  student: number;
  list: number;
}

export interface TierConfigPayload {
  tiers: Record<string, Record<string, unknown>>;
  credit_costs: Record<string, number>;
  stripe_catalog: Record<string, unknown>;
  slider_stops: Record<'pro' | 'elite', SliderStop[]>;
  annual_pricing: Record<'pro' | 'elite', AnnualPricing>;
  season_pass: SeasonPassConfig;
  topup_packs: TopUpPack[];
  active_promos: Record<string, string>;
  trial: TrialConfig;
  free_drafts_per_month: number;
}

// ---------- fallback ----------
// Used only if the API call fails. Kept tight — real values live in the
// backend `CREDIT_COSTS` / `SLIDER_STOPS` dicts and arrive via the fetch.

const FALLBACK: TierConfigPayload = {
  tiers: FALLBACK_TIERS as unknown as Record<string, Record<string, unknown>>,
  credit_costs: {
    find_contact: 5,
    find_hiring_manager: 10,
    find_recruiter: 6,
    find_employee: 4,
    firm_search: 10,
    coffee_chat_prep: 30,
    meeting_prep: 30,
    resume_optimization: 40,
    cover_letter: 20,
    timeline: 20,
    reply_generation: 20,
    loop_contact_draft: 18,
    loop_hm_draft: 26,
    loop_job_found: 2,
    loop_auto_send: 2,
    loop_company_discovered: 2,
    scout_chat: 0,
  },
  stripe_catalog: {},
  slider_stops: {
    pro: [
      { credits: 1000, student: 9.99, list: 19 },
      { credits: 2000, student: 14.99, list: 29, default: true },
      { credits: 3000, student: 19.99, list: 39 },
      { credits: 4000, student: 24.99, list: 49 },
    ],
    elite: [
      { credits: 3000, student: 24.99, list: 44 },
      { credits: 5000, student: 34.99, list: 59, default: true },
      { credits: 7000, student: 49.99, list: 84 },
    ],
  },
  annual_pricing: {
    pro: { student: 144, list: 279 },
    elite: { student: 336, list: 566 },
  },
  season_pass: {
    student: 99,
    list: 199,
    months: 4,
    credits_per_month: 3000,
    new_users_only_until: '2026-08-09',
  },
  topup_packs: [
    { id: 'starter', credits: 500, price: 4.99, label: 'Starter' },
    { id: 'best', credits: 1000, price: 9.99, label: 'Best value', recommended: true },
    { id: 'bulk', credits: 3000, price: 24.99, label: 'Bulk' },
  ],
  active_promos: {},
  trial: {
    days_student: 7,
    days_non_student: 7,
    credits: 600,
    daily_export_cap: 25,
    cc_extension_days: 7,
  },
  free_drafts_per_month: 5,
};

// ---------- hook ----------

// Bumped v6→v7 when all credit values doubled (10 cr = 1 email now). Same
// dollar prices, same email outputs — just inflated credit numbers. Stale
// localStorage with the v5/v6 numbers would dramatically misrepresent the math.
const LS_KEY = 'offerloop:tier-config:v7';

function readLocalStorage(): TierConfigPayload | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { value, fetchedAt } = JSON.parse(raw) as { value: TierConfigPayload; fetchedAt: number };
    // Ignore localStorage older than 7 days (defensive against schema drift)
    if (Date.now() - fetchedAt > 7 * 24 * 60 * 60 * 1000) return null;
    return value;
  } catch {
    return null;
  }
}

function writeLocalStorage(value: TierConfigPayload) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ value, fetchedAt: Date.now() }));
  } catch {
    /* quota / disabled — ignore */
  }
}

export function useTierConfig() {
  const query = useQuery<TierConfigPayload>({
    queryKey: ['tier-config'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/api/tier-config`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`tier-config ${res.status}`);
      const data = (await res.json()) as TierConfigPayload;
      writeLocalStorage(data);
      return data;
    },
    initialData: readLocalStorage() ?? FALLBACK,
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 24 * 60 * 60 * 1000, // 24h
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    config: query.data ?? FALLBACK,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

// ---------- helpers ----------

/**
 * Resolve a Stripe Price ID from the catalog. Returns empty string if no
 * matching SKU exists (cofounders haven't wired it yet) — callers should fall
 * back to a sensible default or block the CTA.
 */
export function resolvePriceId(
  catalog: Record<string, unknown>,
  tier: 'pro' | 'elite',
  cadence: Cadence,
  audience: Audience,
  credits: number,
): string {
  // catalog shape: pro.monthly.student.{credits} -> price_id string
  const tierEntry = catalog[tier] as
    | Record<Cadence, Record<Audience, Record<number, string>>>
    | undefined;
  return tierEntry?.[cadence]?.[audience]?.[credits] ?? '';
}

export function resolveSeasonPassPriceId(
  catalog: Record<string, unknown>,
  audience: Audience,
): string {
  const sp = catalog['season_pass'] as
    | { one_time: Record<Audience, string> }
    | undefined;
  return sp?.one_time?.[audience] ?? '';
}

export function resolveTopupPriceId(
  catalog: Record<string, unknown>,
  credits: number,
): string {
  const topup = catalog['topup'] as Record<number, string> | undefined;
  return topup?.[credits] ?? '';
}

/** Round monthly-equivalent price for annual stops (annual price ÷ 12). */
export function annualMonthlyEquivalent(annualPrice: number): number {
  return Math.round((annualPrice / 12) * 100) / 100;
}

/** Compute "% off" for the strikethrough anchor. Rounded to nearest 1%. */
export function percentOff(list: number, actual: number): number {
  if (!list || list <= actual) return 0;
  return Math.round(((list - actual) / list) * 100);
}

/** Compute annual savings vs paying monthly (12× monthly − annual price). */
export function annualSavings(monthlyPrice: number, annualPrice: number): number {
  return Math.max(0, monthlyPrice * 12 - annualPrice);
}

/** Whether Season Pass should be visible (date-gated to new users only until X). */
export function seasonPassVisible(seasonPass: SeasonPassConfig, isNewUser: boolean): boolean {
  const opened = new Date() >= new Date(seasonPass.new_users_only_until);
  return opened || isNewUser;
}

/**
 * Convert a credit allocation to the equivalent number of emails the user can
 * send, using the Find Contact bundled action cost (5 cr = 1 contact found +
 * verified email + AI draft = 1 outbound email). This is marketing math —
 * actual usage varies by feature mix (recruiters cost 6 cr, employees cost 4),
 * so this is a conservative estimate that holds for the standard flow.
 *
 * Tunable via the runtime `credit_costs.find_contact` if we change pricing.
 */
export const DEFAULT_EMAIL_COST = 5;

export function emailsFromCredits(credits: number, costPerEmail: number = DEFAULT_EMAIL_COST): number {
  if (!costPerEmail || costPerEmail <= 0) return 0;
  return Math.floor(credits / costPerEmail);
}

/** Format an email-count nicely for marketing copy. */
export function formatEmailCount(emails: number): string {
  if (emails >= 1000) {
    return `${(emails / 1000).toFixed(emails % 1000 === 0 ? 0 : 1)}k`;
  }
  return emails.toLocaleString();
}
