// src/services/agent.ts
// API service for the autonomous networking agent

import { API_BASE_URL } from "./api";

async function agentFetch(path: string, options: RequestInit = {}) {
  const { auth } = await import("../lib/firebase");
  await auth.authStateReady();

  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();
  const res = await fetch(`${API_BASE_URL}/agent${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Agent API error: ${res.status}`);
  }

  return res.json();
}

// ── Config ──────────────────────────────────────────────────────────────────

export interface AgentConfig {
  targetCompanies: string[];
  targetIndustries: string[];
  targetRoles: string[];
  targetLocations: string[];
  preferAlumni: boolean;
  weeklyContactTarget: number;
  creditBudgetPerWeek: number;
  approvalMode: "review_first" | "autopilot";
  sendMode: "drafts_only" | "auto_send";
  autoSendUnlocked: boolean;
  emailTemplatePurpose: string | null;
  emailStylePreset: string | null;
  customInstructions: string;
  signoffPhrase: string;
  signatureBlock: string;
  followUpEnabled: boolean;
  followUpDays: number;
  maxFollowUps: number;
  blocklist: {
    companies: string[];
    titles: string[];
    emails: string[];
  };
  status: "active" | "paused" | "stopped" | "setup";
  deployedAt: string | null;
  pausedAt: string | null;
  lastCycleAt: string | null;
  nextCycleAt: string | null;
  totalContactsFound: number;
  totalEmailsDrafted: number;
  totalRepliesReceived: number;
  totalJobsFound: number;
  totalHmsContacted: number;
  totalCompaniesDiscovered: number;
  queuePausedByAgent: boolean;
  enableJobDiscovery: boolean;
  enableHiringManagers: boolean;
  enableCompanyDiscovery: boolean;
}

export async function getAgentConfig(): Promise<AgentConfig> {
  return agentFetch("/config");
}

export async function updateAgentConfig(
  updates: Partial<AgentConfig>
): Promise<AgentConfig> {
  return agentFetch("/config", {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function deployAgent(): Promise<AgentConfig> {
  return agentFetch("/deploy", { method: "POST" });
}

export async function pauseAgent(): Promise<AgentConfig> {
  return agentFetch("/pause", { method: "POST" });
}

export async function stopAgent(): Promise<AgentConfig> {
  return agentFetch("/stop", { method: "POST" });
}

export async function triggerAgentCycle(): Promise<{
  cycleId: string;
  status: string;
}> {
  return agentFetch("/run-now", { method: "POST" });
}

export async function getCycleStatus(
  cycleId: string
): Promise<AgentCycle> {
  return agentFetch(`/cycles/${cycleId}/status`);
}

// ── Activity & Stats ────────────────────────────────────────────────────────

export interface AgentAction {
  id: string;
  cycleId: string;
  action:
    | "find"
    | "find_jobs"
    | "discover_companies"
    | "find_hiring_managers"
    | "follow_up"
    | "monitor"
    | "skip";
  status: string;
  createdAt: string;
  completedAt: string | null;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  creditsSpent: number;
  contactId: string | null;
  contactName: string | null;
  company: string | null;
  reason: string;
}

export async function getAgentActivity(
  limit = 20,
  offset = 0
): Promise<{ actions: AgentAction[] }> {
  return agentFetch(`/activity?limit=${limit}&offset=${offset}`);
}

export interface AgentStats {
  status: string;
  totalContactsFound: number;
  totalEmailsDrafted: number;
  totalRepliesReceived: number;
  totalJobsFound: number;
  totalHmsContacted: number;
  totalCompaniesDiscovered: number;
  lastCycleAt: string | null;
  nextCycleAt: string | null;
  weeklyContactTarget: number;
  creditBudgetPerWeek: number;
  // Weekly progress
  contactsThisWeek: number;
  creditsSpentThisWeek: number;
  repliesThisWeek: number;
  // Attention counts
  pendingDrafts: number;
  unreadReplies: number;
  pendingApprovals: number;
}

export async function getAgentStats(): Promise<AgentStats> {
  return agentFetch("/stats");
}

// ── Pipeline ───────────────────────────────────────────────────────────────

export interface CompanyPipeline {
  name: string;
  logoUrl: string | null;
  contacts: number;
  hms: number;
  jobs: number;
  draftsReady: number;
  emailsSent: number;
  replies: number;
}

export async function getAgentPipeline(): Promise<{
  companies: CompanyPipeline[];
}> {
  return agentFetch("/pipeline");
}

// ── Approvals ───────────────────────────────────────────────────────────────

export async function getPendingApprovals(): Promise<{
  approvals: AgentAction[];
}> {
  return agentFetch("/approvals");
}

export async function approveAction(actionId: string): Promise<AgentAction> {
  return agentFetch(`/approvals/${actionId}/approve`, { method: "POST" });
}

export async function rejectAction(actionId: string): Promise<AgentAction> {
  return agentFetch(`/approvals/${actionId}/reject`, { method: "POST" });
}

// ── Cycles ──────────────────────────────────────────────────────────────────

export interface AgentCycle {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  plan: Record<string, unknown>[];
  results: {
    contactsFound: number;
    emailsDrafted: number;
    followUpsSent: number;
    creditsSpent: number;
    jobsFound: number;
    hmsFound: number;
    companiesDiscovered: number;
  };
  errors: string[];
}

export async function getAgentCycles(
  limit = 10
): Promise<{ cycles: AgentCycle[] }> {
  return agentFetch(`/cycles?limit=${limit}`);
}

// ── Jobs ────────────────────────────────────────────────────────────────────

export interface AgentJob {
  id: string;
  cycleId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyLink: string;
  matchReasons: string[];
  source: string;
  hmFound: boolean;
  hmContactId: string | null;
  createdAt: string;
  status: "new" | "reviewed" | "applied" | "skipped";
}

export async function getAgentJobs(
  limit = 20,
  offset = 0
): Promise<{ jobs: AgentJob[] }> {
  return agentFetch(`/jobs?limit=${limit}&offset=${offset}`);
}

export async function updateAgentJobStatus(
  jobId: string,
  status: AgentJob["status"]
): Promise<AgentJob> {
  return agentFetch(`/jobs/${jobId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

// ── Companies ───────────────────────────────────────────────────────────────

export interface AgentCompany {
  id: string;
  cycleId: string;
  name: string;
  industry: string;
  reason: string;
  sourceCompany: string;
  score: number;
  logoUrl: string | null;
  jobsFound: number;
  createdAt: string;
  status: "new" | "explored" | "skipped";
}

export async function getAgentCompanies(
  limit = 20
): Promise<{ companies: AgentCompany[] }> {
  return agentFetch(`/companies?limit=${limit}`);
}
