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

// Loop modes:
//   "people" — autonomous networking (find professionals, draft cold outreach)
//   "roles"  — autonomous job-search (find open postings, optionally draft
//              founder outreach about specific roles)
//   "both"   — pursue BOTH pipelines in one Loop. Planner balances networking
//              and job-search against one credit budget. HM outreach is
//              template-selected per-contact by `discoveredVia` provenance.
// Set at creation and read-only afterward; backend rejects PATCH attempts
// to change it. Optional on the read-side because Loops created before the
// field existed will return without it (treat missing as "people").
export type LoopMode = "people" | "roles" | "both";

// Brief edit history entry. Snapshot of {briefText, briefParsed} captured at
// the moment a previous PATCH /loops/{id} replaced the brief. Append-only,
// capped at 20 entries (oldest drop off the front). Surfaced in the
// LoopDetailPage edit-brief affordance.
export interface BriefVersionEntry {
  briefText: string;
  briefParsed: ParsedBrief | Record<string, unknown>;
  editedAt: string;
}

// Phase 9 — Loop auto-send mode. Three points on the autonomy spectrum:
//   "approve_each" — cycles auto-run; every action queues for approval
//                    before any credits spend. Replaces today's confusing
//                    reviewBeforeSend=true / automationEnabled=false combo
//                    (which silently broke auto-cycling).
//   "draft_only"   — cycles auto-run; AI drafts to the student's Gmail
//                    drafts folder; student sends manually. This is what
//                    today's "Autopilot" actually does.
//   "send_for_me"  — cycles auto-run; AI drafts AND sends from the
//                    student's own Gmail. Gated by Hunter verification,
//                    quiet hours, first-N approval, daily cap.
export type LoopAutoSendMode = "approve_each" | "draft_only" | "send_for_me";

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
  // Contacts this Loop found during the current ISO week (server-computed,
  // source=agent + createdAt this week). Drives the LoopCard progress line
  // against weeklyTarget; older clients without it fall back to 0.
  weekContactsFound?: number;
  // Cumulative agent finds for this Loop (all-time, live from contacts). Shown
  // alongside the weekly number so the Monday weekly-reset doesn't read like
  // every find vanished.
  liveContactsFound?: number;
  // Drafts still sitting in draft_created for this Loop (live from contacts).
  // The action-first LoopCard leads with this — it never resets weekly.
  liveDraftsWaiting?: number;
  // Live Found/Emailed/Replied computed from actual contact records, attached
  // by GET /loops/:id. The detail funnel reads this instead of the drift-prone
  // totalContactsFound / totalEmailsDrafted counters. Absent on list payloads.
  liveStats?: {
    found: number;
    emailed: number;
    replied: number;
    foundThisWeek: number;
  };
  weekStartedAt: string | null;
  pauseReason: LoopPauseReason;
  loopMode?: LoopMode;
  briefVersionHistory?: BriefVersionEntry[];
  // Phase 9 — auto-send. Default "draft_only" preserves today's behavior
  // for existing Loops. autoSendApprovedCount is server-managed (bumped
  // only by POST /:loopId/contacts/:contactId/approve-send).
  autoSendMode?: LoopAutoSendMode;
  autoSendApprovedCount?: number;
  autoSendApprovedAfter?: number;
  hardDailySendCap?: number | null;
  // Phase 9.1 — per-Loop concurrency lock. True while
  // loop_jobs.run_loop_cycle_job is mid-cycle. Server-managed; the UI
  // reads this to disable Run-it-now and the like so the user can't
  // fire a parallel cycle (which the backend would correctly refuse,
  // but with no visual cue).
  cycleRunning?: boolean;
  cycleStartedAt?: string | null;
  // Persisted by loop_jobs when a cycle crashes outside the planner path.
  // Surfaced as a red "Last cycle failed" banner on LoopDetailPage; cleared
  // by the next successful cycle.
  lastCycleError?: string | null;
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

// Fleet command bar — weekly aggregate across every Loop. The ring's
// denominator is the sum of every Loop's weeklyTarget (see the
// LOOPS_FLEET_REDESIGN_PLAN doc for the rationale).
export interface FleetWeeklySummary {
  foundThisWeek: number;
  foundAllTime?: number; // cumulative across live Loops — keeps the Monday reset honest
  weeklySparkline: number[]; // 7 entries, oldest first
  draftsWaiting: number;
  weeklyGoal: number;
  weeklyProgressPct: number;
  activeLoopsCount: number;
  weekStartedAt: string;
}

// Fleet activity ticker row. Powers the live ticker at the bottom of the
// LoopsCommandBar. `kind` decides the dot color in the ticker.
export type FleetFeedKind = "found" | "draft" | "job" | "company";

export interface FleetFeedItem {
  kind: FleetFeedKind;
  who: string;
  role: string;
  when: string;
  loopId: string;
  createdAt: string;
}

// Quickstart Loop template surfaced in the NewLoopTile's two one-tap chips.
// `brief` is the pre-seeded text the /agent/setup composer reads from
// location.state when the user lands on the setup page.
export interface SuggestedLoop {
  id: string;
  title: string;
  tag: string;
  brief: string;
  loopMode: LoopMode;
}

export interface LoopActivityItem {
  id: string;
  type: LoopActivityType;
  title: string;
  subtitle: string;
  linkTo: string;
  /** True when linkTo is an external URL (Gmail draft, job apply page).
   *  The feed opens these in a new tab with target=_blank. */
  external?: boolean;
  /** Recipient address for draft rows. Surfaced in the activity feed
   *  so users can scan who each draft went to without drilling in.
   *  Absent on non-draft items and on legacy drafts written before
   *  agent_actions started persisting it. */
  email?: string;
  /** Contact's display name. Present on draft rows so the editorial
   *  list can lead with the person, not the email subject. Absent on
   *  legacy drafts written before this field was added. */
  contactName?: string;
  /** Original email subject for draft rows. Preserved separately now
   *  that `title` carries the contact's name. */
  emailSubject?: string;
  /** Per-row phase for draft items, computed by the backend from the
   *  live contact doc: "replied" once a reply lands, "sent" after the
   *  email went out, "drafted" otherwise. Drives the colored dot in the
   *  drafts list — replaces the hardcoded "SENT" stamp. */
  state?: "drafted" | "sent" | "replied";
  createdAt: string;
  /** Firestore contact id, for the per-card action buttons (My Network /
   *  Inbox / Find) and to deep-link draft rows into
   *  /my-network/people?contact=<id>. Absent on job/company items and
   *  legacy rows. */
  contactId?: string;
  /** True when the contact has outreach (a draft, thread, or stage past new).
   *  Gates the "View in Inbox" button — bare contacts show only My Network. */
  hasOutreach?: boolean;
  /** True for hiring-manager rows — routes the card button to the Find >
   *  Hiring Managers tab instead of the My Network / Inbox pair. */
  isHm?: boolean;
  /** Pairs a job posting with its founder-draft sub-card in the activity
   *  feed. Items that share a groupKey render as a hierarchy (job primary,
   *  draft secondary) in roles mode. Absent on:
   *   - unpaired large-co postings (Apply-only)
   *   - people-mode networking contacts (today's flat row layout)
   *   - legacy items written before H shipped. */
  groupKey?: string;
  /** Broadening level reached by the find_jobs retry loop. Only present on
   *  type='job' items where the level was > 0 (a relaxed query produced the
   *  result). Used by the dashboard to render a "we widened your search"
   *  badge. Absent on level-0 items and on pre-PR data. */
  broadenLevel?: number;
  /** Original role string from the brief — surfaced in the L1/L2 badge copy
   *  ("closely related to {originalRole}"). Absent when broadenLevel is 0 or
   *  on pre-PR data. */
  originalRole?: string;
  /** Target company from the action — surfaced in the L2 badge copy
   *  ("adjacent to your brief — {originalRole} at {targetCompany}"). Absent
   *  when broadenLevel is 0 or on pre-PR data. */
  targetCompany?: string;
  /** The widened location used for L3 ("widened to {widerLocation}"). Only
   *  present when broadenLevel === 3. */
  widerLocation?: string;
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
  loopMode?: LoopMode;
  // Phase 9 — auto-send. autoSendApprovedCount is intentionally absent
  // (server-managed, rejected by the route validator). hardDailySendCap
  // omitted means "use tier cap"; pass an int 0-200 to override down.
  autoSendMode?: LoopAutoSendMode;
  autoSendApprovedAfter?: number;
  hardDailySendCap?: number | null;
}): Promise<Loop> {
  return loopFetch("", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Phase 9 — manually approve auto-send for one contact. Bumps the Loop's
// autoSendApprovedCount and (if all gate checks pass) sends the previously
// drafted email from the student's own Gmail. The Loop's default is no
// warmup (autoSendApprovedAfter = 0) — this endpoint is then just a
// per-contact override after a different gate (Hunter, daily cap, etc.)
// denied. Power users who PATCH autoSendApprovedAfter > 0 get the first-N
// warmup behavior described originally.
export interface ApproveSendResponse {
  ok: true;
  messageId: string;
  autoSendApprovedCount: number;
  autoSendApprovedAfter: number;
  firstNSatisfied: boolean;
}

export interface ApproveSendDenied {
  error: "gate_denied";
  reason: string;        // GateReason — see backend agent_send_gate.GateReason
  effective_cap?: number;
}

export async function approveContactSend(
  loopId: string,
  contactId: string,
): Promise<ApproveSendResponse> {
  return loopFetch(`/${loopId}/contacts/${contactId}/approve-send`, {
    method: "POST",
  });
}

// ── Pause-pill copy ─────────────────────────────────────────────────────
//
// Human-readable label + per-reason action affordance for the tracker
// pause pill. Mirrors GateReason in backend/app/services/agent_send_gate.py.
// The CTA tells the user what would unstick this contact:
//   - first_n_pending → "Send now" (counts toward the first-N gate)
//   - gmail_not_connected / email_unverified → "Send anyway" (overrides)
//   - daily_cap / quiet_hours → no action (the wait IS the answer)
//   - mode_not_send / tier_no_autosend / no_email → ambient pill, no action

export type AutoSendPauseCta = "send_now" | "send_anyway" | "connect_gmail" | null;

export interface PausePillDescriptor {
  label: string;     // pill copy
  detail?: string;   // optional second-line / tooltip
  cta: AutoSendPauseCta;
}

export function describeAutoSendPause(
  reason: string | null | undefined,
  ctx: { effectiveCap?: number | null; verificationStatus?: string | null } = {},
): PausePillDescriptor | null {
  if (!reason) return null;
  switch (reason) {
    case "first_n_pending":
      return {
        label: "Awaiting your approval",
        detail: "Approve to teach the loop how to send for you.",
        cta: "send_now",
      };
    case "gmail_not_connected":
      return {
        label: "Connect Gmail",
        detail: "Auto-send needs Gmail access to send from your address.",
        cta: "connect_gmail",
      };
    case "email_unverified":
      return {
        label: "Email failed verification",
        detail:
          ctx.verificationStatus === "invalid"
            ? "Hunter marked this address as invalid. Sending may bounce."
            : "Hunter couldn't confirm this address. Sending may bounce.",
        cta: "send_anyway",
      };
    case "daily_cap":
      return {
        label: ctx.effectiveCap
          ? `Daily cap hit (${ctx.effectiveCap}/day)`
          : "Daily cap hit",
        detail: "Resumes tomorrow your time.",
        cta: null,
      };
    case "quiet_hours":
      return {
        label: "Outside quiet hours",
        detail: "Will resume at 8 AM your time.",
        cta: null,
      };
    case "send_error":
      return {
        label: "Send failed",
        detail: "Gmail returned an error. You can try again manually.",
        cta: "send_anyway",
      };
    case "mode_not_send":
    case "tier_no_autosend":
    case "no_email":
      // Ambient — the user didn't ask us to auto-send, or can't.
      return null;
    default:
      return {
        label: "Auto-send paused",
        detail: reason,
        cta: "send_anyway",
      };
  }
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

// ── Fleet rollups (LoopsCommandBar) ─────────────────────────────────────

export async function getFleetWeeklySummary(): Promise<FleetWeeklySummary> {
  return loopFetch("/weekly-summary");
}

export async function getFleetFeed(
  limit: number = 20
): Promise<{ items: FleetFeedItem[] }> {
  return loopFetch(`/feed?limit=${limit}`);
}

export async function getSuggestedLoops(): Promise<{ items: SuggestedLoop[] }> {
  return loopFetch("/suggested");
}
