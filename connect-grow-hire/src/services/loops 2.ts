// src/services/loops.ts
// API service for multi-Loop CRUD + lifecycle.
//
// One Loop = one natural-language brief the user kicked off. Users can have
// multiple Loops in flight (subject to their tier's max_loops cap).

import { API_BASE_URL } from "./api";
import type { ParsedBrief } from "./agent";

async function loopFetch(path: string, options: RequestInit = {}) {
  const { auth } = await import("../lib/firebase");
  await auth.authStateReady();

  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();
  const res = await fetch(`${API_BASE_URL}/agent/loops${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Surface tier-cap responses with their full payload so the UI can show
    // the upgrade prompt without a second round-trip.
    if (res.status === 402 && body.error === "tier_cap_reached") {
      const err = new Error(body.message || "Tier cap reached") as Error & {
        code?: string;
        limits?: LoopLimits;
      };
      err.code = "tier_cap_reached";
      err.limits = body.limits;
      throw err;
    }
    throw new Error(body.error || `Loops API error: ${res.status}`);
  }

  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────

export type LoopStatus = "idle" | "running" | "paused" | "done";
export type LoopCadence = "daily" | "every_other_day" | "weekly" | "manual";
export type LoopPauseReason =
  | "credits_capped"
  | "budget_capped"
  | "inactivity"
  | "quiet_hours"
  | "paused"
  | null;

export interface Loop {
  id: string;
  name: string;
  briefText: string;
  briefParsed: ParsedBrief | null;
  reviewBeforeSend: boolean;
  weeklyTarget: number;
  smsEnabled: boolean;
  status: LoopStatus;
  shortCode: string;
  createdAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastSmsAt: string | null;
  totalContactsFound: number;
  totalEmailsDrafted: number;
  totalRepliesReceived: number;
  totalJobsFound: number;
  totalHmsContacted: number;
  totalCompaniesDiscovered: number;
  pendingDrafts: number;
  unreadReplies: number;
  // Phase 8 — automation + budget
  cadence: LoopCadence;
  creditBudgetPerWeek: number;
  automationEnabled: boolean;
  lastReviewedAt: string | null;
  weekCreditsSpent: number;
  weekStartedAt: string | null;
  pauseReason: LoopPauseReason;
}

export interface CycleCostEstimate {
  per_cycle_credits: number;
  monthly_credits: number;
  cycles_per_month: number;
  breakdown: {
    contacts: number;
    hiring_managers: number;
    jobs: number;
    companies: number;
  };
}

export interface UsageBreakdown {
  total: number;
  buckets: {
    contacts: number;
    hiring_managers: number;
    jobs: number;
    companies: number;
    manual: number;
    coffee_chat_preps: number;
    interview_preps: number;
    scout: number;
    other: number;
  };
  monthStartedAt: string;
}

export interface LoopLimits {
  used: number;
  cap: number;
  canCreate: boolean;
}

export type LoopActivityType = "contact" | "draft" | "hm" | "job" | "company";

export interface LoopActivityItem {
  id: string;
  type: LoopActivityType;
  title: string;
  subtitle: string;
  linkTo: string;
  /** True when linkTo is an external URL (Gmail draft, job apply page).
   *  The feed opens these in a new tab with target=_blank. */
  external?: boolean;
  createdAt: string;
}

// ── CRUD ────────────────────────────────────────────────────────────────

export async function listLoops(): Promise<{
  loops: Loop[];
  limits: LoopLimits;
}> {
  return loopFetch("");
}

export async function getLoop(loopId: string): Promise<Loop> {
  return loopFetch(`/${loopId}`);
}

export async function createLoop(input: {
  briefText: string;
  briefParsed?: ParsedBrief | null;
  name?: string;
  reviewBeforeSend?: boolean;
  weeklyTarget?: number;
  cadence?: LoopCadence;
  creditBudgetPerWeek?: number;
  automationEnabled?: boolean;
}): Promise<Loop> {
  return loopFetch("", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateLoop(
  loopId: string,
  patch: Partial<Loop>
): Promise<Loop> {
  return loopFetch(`/${loopId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteLoop(loopId: string): Promise<{ ok: true }> {
  return loopFetch(`/${loopId}`, { method: "DELETE" });
}

// ── Lifecycle ───────────────────────────────────────────────────────────

export async function startLoop(loopId: string): Promise<Loop> {
  return loopFetch(`/${loopId}/start`, { method: "POST" });
}

export async function runLoopNow(loopId: string): Promise<Loop> {
  return loopFetch(`/${loopId}/run-now`, { method: "POST" });
}

export async function getLoopActivity(
  loopId: string
): Promise<{ items: LoopActivityItem[] }> {
  return loopFetch(`/${loopId}/activity`);
}

// Phase 8 — automation + pricing endpoints

export async function estimateCycleCost(
  briefParsed: ParsedBrief | null,
  cadence: LoopCadence
): Promise<CycleCostEstimate> {
  return loopFetch("/estimate", {
    method: "POST",
    body: JSON.stringify({ briefParsed, cadence }),
  });
}

export async function markLoopReviewed(loopId: string): Promise<{ ok: true }> {
  return loopFetch(`/${loopId}/mark-reviewed`, { method: "POST" });
}

export async function getUsageBreakdown(): Promise<UsageBreakdown> {
  return loopFetch("/usage-breakdown");
}

export async function pauseLoop(loopId: string): Promise<Loop> {
  return loopFetch(`/${loopId}/pause`, { method: "POST" });
}

export async function resumeLoop(loopId: string): Promise<Loop> {
  return loopFetch(`/${loopId}/resume`, { method: "POST" });
}
