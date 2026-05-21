// Agent dashboard - redesigned to match Offerloop's visual language.
// Centered single column, serif italic headers, underline tabs, flat rows.
// Running state: full-content takeover with terminal stream + flip counters.

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Loader2, ExternalLink, Settings, CheckCircle2, XCircle, Check } from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import {
  useAgentSnapshot,
  useAgentApprovals,
  useAgentStats,
  useCountdown,
  useCycleRunner,
  useAgentLifecycle,
  useAgentActivityLive,
  useCycleProgress,
} from "@/hooks/useAgent";
import { useSimulatedStream } from "@/hooks/useSimulatedStream";
import type {
  AgentConfig,
  AgentAction,
  AgentJob,
  AgentCompany,
  CompanyPipeline,
} from "@/services/agent";
import type { CycleStep } from "@/hooks/useAgent";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Initial({ name, size = 28 }: { name: string; size?: number }) {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: "#f3f3f6",
        color: "#4b5567",
        fontSize: size * 0.42,
        fontWeight: 600,
      }}
    >
      {ch}
    </div>
  );
}

// ── Animations (injected once) ──────────────────────────────────────────────

const AGENT_KEYFRAMES = `
@keyframes om-pulse {
  0%   { box-shadow: 0 0 0 0   rgba(34,197,94,.55); }
  70%  { box-shadow: 0 0 0 8px rgba(34,197,94,0);   }
  100% { box-shadow: 0 0 0 0   rgba(34,197,94,0);   }
}
@keyframes om-scan {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%);  }
}
@keyframes om-bars {
  0%, 100% { transform: scaleY(0.35); }
  50%      { transform: scaleY(1); }
}
`;

function AgentStyles() {
  return <style dangerouslySetInnerHTML={{ __html: AGENT_KEYFRAMES }} />;
}

// ── Primitives ────────────────────────────────────────────────────────────

function PulseDot({ small, color = "#22c55e" }: { small?: boolean; color?: string }) {
  const size = small ? 6 : 7;
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: color,
        animation: "om-pulse 1.6s ease-out infinite",
      }} />
    </span>
  );
}

function ActivityBars({ count = 5, height = 12 }: { count?: number; height?: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "flex-end", gap: 2,
      height, verticalAlign: "middle",
    }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{
          width: 2, height, background: "#94A3B8", borderRadius: 1,
          animation: `om-bars ${1.2 + i * 0.1}s ease-in-out ${i * 0.13}s infinite`,
          transformOrigin: "bottom",
        }} />
      ))}
    </span>
  );
}

// ── Action-to-kind mapping ───────────────────────────────────────────────

const ACTION_KIND: Record<string, string> = {
  plan: "research",
  find: "scan",
  find_jobs: "discover",
  discover_companies: "discover",
  find_hiring_managers: "scan",
  draft: "draft",
  send: "verify",
  follow_up: "queue",
  monitor: "watch",
  skip: "watch",
};

const KIND_META: Record<string, { color: string; label: string }> = {
  scan:     { color: "#7d8ba6", label: "scan" },
  score:    { color: "#7d8ba6", label: "score" },
  draft:    { color: "#d4a017", label: "draft" },
  verify:   { color: "#16a34a", label: "verify" },
  discover: { color: "#7c5cff", label: "discover" },
  watch:    { color: "#7d8ba6", label: "watch" },
  research: { color: "#7d8ba6", label: "research" },
  match:    { color: "#16a34a", label: "match" },
  queue:    { color: "#7d8ba6", label: "queue" },
  tool:     { color: "#0ea5e9", label: "tool" },
};

// ── Main component ──────────────────────────────────────────────────────────

export function AgentSnapshot({
  config,
  onOpenSettings,
}: {
  config: AgentConfig;
  onOpenSettings: () => void;
}) {
  const { user } = useFirebaseAuth();
  const snapshot = useAgentSnapshot();
  const approvalsQuery = useAgentApprovals();
  const countdown = useCountdown(snapshot.stats.data?.nextCycleAt);
  const cycleRunner = useCycleRunner();
  const lifecycle = useAgentLifecycle();
  const liveActions = useAgentActivityLive();
  const stepProgress = useCycleProgress(cycleRunner.cycleId);
  const streamLines = useSimulatedStream(
    cycleRunner.isRunning,
    stepProgress.currentAction,
    stepProgress.completedActions
  );

  const stats = snapshot.stats.data;
  const isActive = config.status === "active";
  const isPaused = config.status === "paused";
  const [activeTab, setActiveTab] = useState("today");

  const firstName =
    user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  // Derive display data
  const draftsReady = stats?.pendingDrafts ?? 0;
  const repliesWaiting = stats?.unreadReplies ?? 0;
  const contactsThisWeek = stats?.contactsThisWeek ?? 0;
  const weeklyTarget = stats?.weeklyContactTarget ?? 5;
  const recentJobs = snapshot.jobs.data?.jobs ?? [];
  const recentCompanies = snapshot.companies.data?.companies ?? [];
  const pipelineCompanies = snapshot.pipeline.data?.companies ?? [];

  // Extract contacts from last cycle
  const lastCycle = snapshot.cycles.data?.cycles?.[0];
  const cycleActions = snapshot.activity.data?.actions ?? [];
  const lastCycleActions = lastCycle
    ? cycleActions.filter((a) => a.cycleId === lastCycle.id)
    : [];

  const allContacts: Array<{
    name: string;
    role: string;
    company: string;
    subject: string;
    preview: string;
    isHm: boolean;
    time: string;
  }> = [];
  for (const ca of lastCycleActions) {
    if (
      (ca.action === "find" || ca.action === "find_hiring_managers") &&
      ca.status === "completed"
    ) {
      const result = ca.result as Record<string, unknown> | null;
      const contacts =
        (result?.contacts as Array<Record<string, unknown>>) ?? [];
      for (const c of contacts) {
        allContacts.push({
          name: (c.name as string) || "Unknown",
          role: (c.title as string) || (c.role as string) || "",
          company: (c.company as string) || "",
          subject: (c.emailSubject as string) || "",
          preview: (c.emailBodyPreview as string) || "",
          isHm: !!(c.isHiringManager as boolean),
          time: ca.createdAt ? relativeTime(ca.createdAt) : "",
        });
      }
    }
  }

  const cycleJobs = lastCycle
    ? recentJobs.filter((j) => j.cycleId === lastCycle.id)
    : [];
  const cycleCompanies = lastCycle
    ? recentCompanies.filter((co) => co.cycleId === lastCycle.id)
    : [];

  const pendingApprovals = approvalsQuery.data?.approvals ?? [];

  // Tab definitions
  const tabs = [
    { id: "today", label: "Overview" },
    ...(pendingApprovals.length > 0
      ? [{ id: "approvals", label: "Approvals", count: pendingApprovals.length }]
      : []),
    { id: "drafts", label: "Drafts", count: allContacts.length || undefined },
    { id: "jobs", label: "Jobs", count: recentJobs.length || undefined },
    {
      id: "companies",
      label: "Companies",
      count: recentCompanies.length || undefined,
    },
    { id: "activity", label: "Activity" },
  ];

  // ── Running state: full-content takeover ──
  if (cycleRunner.isRunning) {
    const progress = cycleRunner.cycleProgress;
    return (
      <div className="pt-10 sm:pt-14">
        {/* Header */}
        <div className="text-center">
          <h1
            className="font-serif text-[32px] sm:text-[36px] leading-[1.1] tracking-[-0.02em]"
            style={{ color: "var(--ink, #0F172A)" }}
          >
            <em className="font-serif" style={{ fontWeight: 400 }}>
              Running...
            </em>
          </h1>
          <p className="mt-3 text-[13.5px] text-muted-foreground tracking-[-0.01em]">
            {stepProgress.currentLabel || "Planning actions"}
          </p>
        </div>

        {/* Flip counters */}
        <div className="flex justify-center gap-8 mt-8">
          <FlipCounter label="Contacts" value={progress?.contactsFound ?? 0} />
          <FlipCounter label="Jobs" value={progress?.jobsFound ?? 0} />
          <FlipCounter label="Emails" value={progress?.emailsDrafted ?? 0} />
          <FlipCounter label="HMs" value={progress?.hmsFound ?? 0} />
        </div>

        {/* Terminal stream */}
        <div className="mt-8 mx-auto max-w-lg">
          <div
            className="bg-[#0f1219] rounded-lg p-4 h-[280px] overflow-hidden relative"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
          >
            <div className="absolute top-3 left-4 flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] opacity-70" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] opacity-70" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] opacity-70" />
            </div>
            <div className="pt-5 space-y-1 flex flex-col justify-end h-full overflow-hidden">
              {streamLines.map((line) => (
                <div
                  key={line.id}
                  className="text-[11.5px] leading-[1.6] animate-in fade-in slide-in-from-bottom-1 duration-300"
                  style={{
                    color:
                      line.type === "success"
                        ? "#4ade80"
                        : line.type === "info"
                          ? "#60a5fa"
                          : line.type === "dim"
                            ? "#4b5567"
                            : "#94a3b8",
                  }}
                >
                  <span className="text-[#4b5567] mr-2">{line.timestamp}</span>
                  {line.type === "success" && <span className="mr-1">✓</span>}
                  {line.text}
                </div>
              ))}
              <div className="text-[11.5px] text-[#94a3b8] animate-pulse">
                <span className="text-[#4b5567] mr-2">
                  {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </span>
                <span className="inline-block w-1.5 h-3 bg-[#94a3b8] animate-[cursor-blink_1s_infinite]" />
              </div>
            </div>
          </div>
        </div>

        {/* Step progress below terminal */}
        {(stepProgress.completedActions.length > 0 || stepProgress.currentAction) && (
          <div className="mt-6 mx-auto max-w-sm">
            <StepList
              completedActions={stepProgress.completedActions}
              currentAction={stepProgress.currentAction}
              currentLabel={stepProgress.currentLabel}
              plannedActions={stepProgress.plannedActions}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <AgentStyles />
      {/* ── Hero ── */}
      <div className="text-center pt-10 sm:pt-14">
        <h1
          className="font-serif text-[32px] sm:text-[36px] leading-[1.1] tracking-[-0.02em]"
          style={{ color: "var(--ink, #0F172A)" }}
        >
          Working on your{" "}
          <em className="font-serif" style={{ fontWeight: 400 }}>
            job search.
          </em>
        </h1>
        <p className="mt-3 text-[13.5px] text-muted-foreground tracking-[-0.01em]">
          Drafting outreach, finding jobs, watching for replies. Nothing sends
          without your approval.
        </p>
        <div className="mt-3.5 flex items-center justify-center gap-2.5 text-xs text-muted-foreground">
          {isActive && (
            <>
              <PulseDot />
              <span>
                Active · {contactsThisWeek} of {weeklyTarget} reached this week
                {countdown && ` · Next cycle ${countdown}`}
              </span>
              <span style={{ opacity: 0.5 }}>·</span>
              <ActivityBars />
            </>
          )}
          {isPaused && (
            <>
              <PulseDot color="#f59e0b" />
              <span>Paused</span>
            </>
          )}
        </div>
      </div>

      {/* ── Status italic ── */}
      <div
        className="font-serif text-center mt-8 text-[17px] italic text-muted-foreground tracking-[-0.01em]"
        style={{ fontWeight: 400 }}
      >
        {cycleRunner.lastEndStatus === "awaiting_approval" ? (
          <>Actions queued for your approval, {firstName}.</>
        ) : draftsReady > 0 || repliesWaiting > 0 ? (
          <>
            {draftsReady > 0 &&
              `${draftsReady} draft${draftsReady !== 1 ? "s" : ""} ready`}
            {draftsReady > 0 && repliesWaiting > 0 && ", "}
            {repliesWaiting > 0 &&
              `${repliesWaiting} repl${repliesWaiting !== 1 ? "ies" : "y"} waiting`}
            , {firstName}.
          </>
        ) : (
          <>All caught up, {firstName}.</>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="flex justify-center gap-2.5 mt-5 flex-wrap">
        {cycleRunner.lastEndStatus === "awaiting_approval" && (
          <button
            onClick={() => setActiveTab("approvals")}
            className="bg-[var(--ink,#0F172A)] text-white border border-[var(--ink,#0F172A)] rounded-md px-4 py-2 text-[13px] font-medium tracking-[-0.01em] cursor-pointer hover:opacity-90 transition-opacity"
          >
            Review approvals
          </button>
        )}
        {draftsReady > 0 && cycleRunner.lastEndStatus !== "awaiting_approval" && (
          <Link to="/tracker">
            <button className="bg-[var(--ink,#0F172A)] text-white border border-[var(--ink,#0F172A)] rounded-md px-4 py-2 text-[13px] font-medium tracking-[-0.01em] cursor-pointer hover:opacity-90 transition-opacity">
              Review {draftsReady} draft{draftsReady !== 1 ? "s" : ""}
            </button>
          </Link>
        )}
        {(isActive || isPaused) && (
          <button
            onClick={() => cycleRunner.runNow()}
            disabled={cycleRunner.isRunNowPending || cycleRunner.isRunning}
            className="bg-white text-[var(--ink,#0F172A)] border border-[#e9eaef] rounded-md px-4 py-2 text-[13px] font-medium tracking-[-0.01em] cursor-pointer hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            Run now
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="bg-white text-[var(--ink,#0F172A)] border border-[#e9eaef] rounded-md px-4 py-2 text-[13px] font-medium tracking-[-0.01em] cursor-pointer hover:bg-[#fafafa] transition-colors flex items-center gap-1.5"
        >
          <Settings className="h-3.5 w-3.5" /> Configure
        </button>
        {isActive && (
          <button
            onClick={() => lifecycle.pause.mutate()}
            disabled={lifecycle.pause.isPending}
            className="bg-white text-muted-foreground border border-[#e9eaef] rounded-md px-3 py-2 text-[13px] tracking-[-0.01em] cursor-pointer hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            Pause
          </button>
        )}
        {isPaused && (
          <button
            onClick={() => lifecycle.deploy.mutate()}
            disabled={lifecycle.deploy.isPending}
            className="bg-white text-[var(--ink,#0F172A)] border border-[#e9eaef] rounded-md px-3 py-2 text-[13px] font-medium tracking-[-0.01em] cursor-pointer hover:bg-[#fafafa] transition-colors disabled:opacity-50"
          >
            Resume
          </button>
        )}
      </div>

      {/* ── Telemetry strip ── */}
      {isActive && stats && (
        <div className="mt-5 grid grid-cols-4 border border-[#e9eaef] rounded-lg overflow-hidden"
          style={{ background: "var(--paper-2, #fafafa)" }}>
          {[
            { label: "contacts found", value: contactsThisWeek, sub: "this week" },
            { label: "drafts pending", value: draftsReady, sub: "awaiting review" },
            { label: "jobs matched", value: recentJobs.length, sub: "this cycle" },
            { label: "credits spent", value: stats.creditsSpentThisWeek ?? 0, sub: `of ${stats.creditBudgetPerWeek ?? 0}` },
          ].map((it, i, arr) => (
            <div key={it.label} className="flex flex-col gap-0.5" style={{
              padding: "10px 14px",
              borderRight: i < arr.length - 1 ? "1px solid #e9eaef" : "none",
            }}>
              <div className="text-[10px] tracking-[0.05em] uppercase text-[#94A3B8] font-medium">
                {it.label}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 18, fontWeight: 500, fontVariantNumeric: "tabular-nums",
                  color: "var(--ink, #0F172A)",
                }}>{it.value}</span>
                <span className="text-[11px] text-[#94A3B8]">{it.sub}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs (underline style) ── */}
      <div className="flex justify-center gap-7 mt-8 border-b border-[#e9eaef]">
        {tabs.map((t) => {
          const on = t.id === activeTab;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="relative pb-2.5 text-[13px] tracking-[-0.01em] cursor-pointer bg-transparent border-0 flex items-center gap-1.5 transition-colors"
              style={{
                fontWeight: on ? 500 : 400,
                color: on ? "var(--ink, #0F172A)" : "#94A3B8",
                borderBottom: on
                  ? "1.5px solid var(--ink, #0F172A)"
                  : "1.5px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
              {t.count != null && (
                <span
                  className="text-[11px] text-[#b3b8c7]"
                  style={{ fontWeight: 400 }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}

      {activeTab === "today" && (
        <OverviewContent
          allContacts={allContacts}
          recentJobs={
            cycleJobs.length > 0 ? cycleJobs : recentJobs.slice(0, 3)
          }
          recentCompanies={
            cycleCompanies.length > 0
              ? cycleCompanies
              : recentCompanies.slice(0, 3)
          }
          pipelineCompanies={pipelineCompanies}
          repliesWaiting={repliesWaiting}
          draftsReady={draftsReady}
        />
      )}

      {activeTab === "approvals" && (
        <div className="pt-9">
          <SectionHead title="Pending approvals" />
          {pendingApprovals.length > 0 ? (
            pendingApprovals.map((a, i) => (
              <ApprovalRow
                key={a.id}
                action={a}
                onApprove={() => lifecycle.approve.mutateAsync(a.id).then(() => approvalsQuery.refetch())}
                onReject={() => lifecycle.reject.mutateAsync(a.id).then(() => approvalsQuery.refetch())}
                last={i === pendingApprovals.length - 1}
              />
            ))
          ) : (
            <EmptyText>No pending approvals.</EmptyText>
          )}
        </div>
      )}

      {activeTab === "drafts" && (
        <div className="pt-9">
          <SectionHead title="Email drafts" />
          {allContacts.length > 0 ? (
            allContacts.map((d, i) => (
              <DraftRow key={i} d={d} last={i === allContacts.length - 1} />
            ))
          ) : (
            <EmptyText>
              No drafts yet. Run a cycle to generate outreach emails.
            </EmptyText>
          )}
        </div>
      )}

      {activeTab === "jobs" && (
        <div className="pt-9">
          <SectionHead title="Jobs matched to you" />
          {recentJobs.length > 0 ? (
            recentJobs.map((j, i) => (
              <JobRow key={j.id} j={j} last={i === recentJobs.length - 1} />
            ))
          ) : (
            <EmptyText>
              No jobs found yet. Run a cycle to discover matching roles.
            </EmptyText>
          )}
        </div>
      )}

      {activeTab === "companies" && (
        <div className="pt-9">
          <SectionHead title="Companies" />
          {recentCompanies.length > 0 ? (
            recentCompanies.map((c, i) => (
              <CompanyRow
                key={c.id}
                c={c}
                last={i === recentCompanies.length - 1}
              />
            ))
          ) : (
            <EmptyText>No companies discovered yet.</EmptyText>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="pt-9">
          <SectionHead title="Activity" />
          {liveActions.length > 0 ? (
            <ActivityList items={liveActions} />
          ) : (
            <EmptyText>No activity yet. Deploy your agent to start.</EmptyText>
          )}
        </div>
      )}

      {/* ── Footer meta ── */}
      <div className="mt-10 flex items-center gap-4 text-[11px] text-[#b3b8c7] px-1">
        <span>
          Credits: {stats?.creditsSpentThisWeek ?? 0}/
          {stats?.creditBudgetPerWeek ?? 0} this week
        </span>
        <span>
          Last cycle:{" "}
          {stats?.lastCycleAt ? relativeTime(stats.lastCycleAt) : "Never"}
        </span>
      </div>
    </div>
  );
}

// ── Overview content ──────────────────────────────────────────────────────

function OverviewContent({
  allContacts,
  recentJobs,
  recentCompanies,
  pipelineCompanies,
  repliesWaiting,
  draftsReady,
}: {
  allContacts: Array<{
    name: string;
    role: string;
    company: string;
    subject: string;
    preview: string;
    isHm: boolean;
    time: string;
  }>;
  recentJobs: AgentJob[];
  recentCompanies: AgentCompany[];
  pipelineCompanies: CompanyPipeline[];
  repliesWaiting: number;
  draftsReady: number;
}) {
  return (
    <div className="pt-9">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3.5 mb-9">
        <SummaryTile
          label="Drafts ready"
          value={draftsReady}
          sub="Saved to Gmail, awaiting your review."
          scanning={draftsReady > 0}
          delta={draftsReady > 0 ? `+${draftsReady} today` : undefined}
        />
        <SummaryTile
          label="Jobs matched"
          value={recentJobs.length}
          sub="Roles aligned with your targets."
          delta={recentJobs.length > 0 ? `+${recentJobs.length} this cycle` : undefined}
        />
        <SummaryTile
          label="Replies"
          value={repliesWaiting}
          sub="Conversations now active in your tracker."
          scanning={repliesWaiting > 0}
          delta={repliesWaiting > 0 ? "watching" : undefined}
        />
      </div>

      {/* Drafts list */}
      {allContacts.length > 0 && (
        <div className="mb-10">
          <SectionHead
            title="Drafts ready to review"
            action={<ViewAll to="/tracker" />}
          />
          {allContacts.slice(0, 3).map((d, i, arr) => (
            <DraftRow key={i} d={d} last={i === arr.length - 1} />
          ))}
        </div>
      )}

      {/* Jobs */}
      {recentJobs.length > 0 && (
        <div className="mb-10">
          <SectionHead
            title="Jobs matched to you"
            action={<ViewAll to="/job-board" />}
          />
          {recentJobs.slice(0, 3).map((j, i, arr) => (
            <JobRow key={j.id} j={j} last={i === arr.length - 1} />
          ))}
        </div>
      )}

      {/* Companies */}
      {recentCompanies.length > 0 && (
        <div className="mb-10">
          <SectionHead title="Companies you might like" />
          {recentCompanies.slice(0, 3).map((c, i, arr) => (
            <CompanyRow key={c.id} c={c} last={i === arr.length - 1} />
          ))}
        </div>
      )}

      {/* Pipeline (compact) */}
      {pipelineCompanies.length > 0 && (
        <div className="mb-4">
          <SectionHead title="Company pipeline" />
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {pipelineCompanies.map((co) => (
              <Link
                key={co.name}
                to={`/tracker?company=${encodeURIComponent(co.name)}`}
                className="shrink-0 border border-[#e9eaef] rounded-lg p-3.5 hover:shadow-sm transition-shadow"
                style={{ minWidth: 180 }}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Initial name={co.name} size={24} />
                  <span className="text-[13.5px] font-semibold tracking-[-0.01em]">
                    {co.name}
                  </span>
                </div>
                <div className="text-[11.5px] text-[#94A3B8]">
                  {co.contacts} contacts
                  {co.hms > 0 && ` · ${co.hms} HM`}
                  {co.jobs > 0 && ` · ${co.jobs} jobs`}
                </div>
                {(co.draftsReady > 0 || co.replies > 0) && (
                  <div className="text-[11.5px] mt-1">
                    {co.draftsReady > 0 && (
                      <span className="text-[#b45309] font-medium">
                        {co.draftsReady} drafts
                      </span>
                    )}
                    {co.draftsReady > 0 && co.replies > 0 && " · "}
                    {co.replies > 0 && (
                      <span className="text-[#16a34a] font-medium">
                        {co.replies} replied
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared components ────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  sub,
  scanning,
  delta,
}: {
  label: string;
  value: number;
  sub: string;
  scanning?: boolean;
  delta?: string;
}) {
  return (
    <div className="border border-[#e9eaef] rounded-[10px] p-4 relative overflow-hidden">
      {scanning && (
        <span className="absolute left-0 right-0 top-0 h-[1.5px]" style={{
          background: "linear-gradient(90deg, transparent, var(--ink, #15233a), transparent)",
          animation: "om-scan 2.4s ease-in-out infinite",
        }} />
      )}
      <div className="flex justify-between items-baseline">
        <div className="text-[11.5px] text-[#94A3B8] font-medium tracking-[0.04em] uppercase">
          {label}
        </div>
        {delta && (
          <div style={{
            fontSize: 10.5, color: "#94A3B8",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}>{delta}</div>
        )}
      </div>
      <div
        className="font-serif text-[30px] leading-none mt-2 tracking-[-0.02em]"
        style={{ color: "var(--ink, #0F172A)" }}
      >
        {value}
      </div>
      <div className="text-[12.5px] text-muted-foreground mt-2 leading-snug">
        {sub}
      </div>
    </div>
  );
}

function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-baseline mb-3.5">
      <h3
        className="text-[14px] font-semibold tracking-[-0.01em]"
        style={{ color: "var(--ink, #0F172A)" }}
      >
        {title}
      </h3>
      {action}
    </div>
  );
}

function ViewAll({
  to,
  children = "View all \u2192",
}: {
  to: string;
  children?: string;
}) {
  return (
    <Link
      to={to}
      className="text-[12px] text-[#94A3B8] hover:text-[#4b5567] transition-colors"
    >
      {children}
    </Link>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-[13px] text-[#94A3B8]">{children}</p>
    </div>
  );
}

// ── Row components ───────────────────────────────────────────────────────

function DraftRow({
  d,
  last,
}: {
  d: {
    name: string;
    role: string;
    company: string;
    subject: string;
    preview: string;
    isHm: boolean;
    time: string;
  };
  last: boolean;
}) {
  return (
    <div
      className="flex gap-3.5 py-3.5"
      style={{ borderBottom: last ? "none" : "1px solid #f1f1f4" }}
    >
      <Initial name={d.name} size={32} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-[13.5px] font-semibold tracking-[-0.01em]">
            {d.name}
          </span>
          <span className="text-[12.5px] text-[#94A3B8]">
            {d.role}
            {d.company && `, ${d.company}`}
          </span>
          {d.isHm && (
            <span
              className="font-serif text-[12px] italic text-muted-foreground"
              style={{ fontWeight: 400 }}
            >
              · hiring manager
            </span>
          )}
        </div>
        {d.subject && (
          <div className="text-[13px] font-medium tracking-[-0.01em] mb-0.5">
            {d.subject}
          </div>
        )}
        {d.preview && (
          <div className="text-[12.5px] text-[#94A3B8] leading-snug line-clamp-1">
            {d.preview}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {d.time && (
          <span className="text-[11.5px] text-[#b3b8c7] whitespace-nowrap">
            {d.time}
          </span>
        )}
        <div className="flex gap-1.5">
          <Link to="/tracker">
            <button className="bg-white text-[var(--ink,#0F172A)] border border-[#e9eaef] rounded-md px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:bg-[#fafafa] transition-colors">
              Edit
            </button>
          </Link>
          <Link to="/tracker">
            <button className="bg-[var(--ink,#0F172A)] text-white border border-[var(--ink,#0F172A)] rounded-md px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:opacity-90 transition-opacity">
              Send
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function JobRow({ j, last }: { j: AgentJob; last: boolean }) {
  return (
    <div
      className="flex items-start gap-3.5 py-3.5"
      style={{ borderBottom: last ? "none" : "1px solid #f1f1f4" }}
    >
      <Initial name={j.company} size={30} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold tracking-[-0.01em] leading-snug">
          {j.title}
        </div>
        <div className="text-[12.5px] text-[#94A3B8] mt-1">
          {j.company}
          {j.location && ` · ${j.location}`}
        </div>
        {j.matchReasons?.length > 0 && (
          <div className="text-[11.5px] text-[#b3b8c7] mt-1">
            {j.matchReasons.slice(0, 2).join(" · ")}
          </div>
        )}
      </div>
      {j.applyLink ? (
        <a
          href={j.applyLink}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 mt-0.5 bg-white text-[var(--ink,#0F172A)] border border-[#e9eaef] rounded-md px-3 py-1.5 text-[12px] font-medium hover:bg-[#fafafa] transition-colors flex items-center gap-1"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <button className="shrink-0 mt-0.5 bg-white text-[var(--ink,#0F172A)] border border-[#e9eaef] rounded-md px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:bg-[#fafafa] transition-colors">
          View
        </button>
      )}
    </div>
  );
}

function CompanyRow({ c, last }: { c: AgentCompany; last: boolean }) {
  return (
    <div
      className="flex items-center gap-3.5 py-3"
      style={{ borderBottom: last ? "none" : "1px solid #f1f1f4" }}
    >
      <Initial name={c.name} size={30} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-semibold tracking-[-0.01em]">
            {c.name}
          </span>
          {c.industry && (
            <span className="text-[11.5px] text-[#b3b8c7]">{c.industry}</span>
          )}
        </div>
        {c.reason && (
          <div className="text-[12.5px] text-[#94A3B8] mt-0.5">{c.reason}</div>
        )}
      </div>
      <Link to={`/find?tab=companies&q=${encodeURIComponent(c.name)}`}>
        <button className="shrink-0 bg-white text-[var(--ink,#0F172A)] border border-[#e9eaef] rounded-md px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:bg-[#fafafa] transition-colors">
          Add to targets
        </button>
      </Link>
    </div>
  );
}

// ── Approval row ─────────────────────────────────────────────────────────

function ApprovalRow({
  action,
  onApprove,
  onReject,
  last,
}: {
  action: AgentAction;
  onApprove: () => void;
  onReject: () => void;
  last: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const verb = ACTION_VERBS[action.action] || action.action;

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex gap-3.5 py-3.5"
      style={{ borderBottom: last ? "none" : "1px solid #f1f1f4" }}
    >
      <Initial name={action.company || action.action} size={32} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold tracking-[-0.01em] mb-0.5">
          {verb}{" "}
          <span style={{ color: "var(--ink, #0F172A)" }}>
            {action.company || ""}
          </span>
        </div>
        {action.reason && (
          <div className="text-[12.5px] text-[#94A3B8] leading-snug">
            {action.reason}
          </div>
        )}
        {action.creditsSpent > 0 && (
          <div className="text-[11.5px] text-[#b3b8c7] mt-0.5">
            ~{action.creditsSpent} credits
          </div>
        )}
      </div>
      <div className="flex gap-1.5 shrink-0 items-start">
        <button
          onClick={onReject}
          disabled={loading}
          className="bg-white text-[#94A3B8] border border-[#e9eaef] rounded-md px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:bg-[#fafafa] transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          <XCircle className="h-3 w-3" /> Skip
        </button>
        <button
          onClick={handleApprove}
          disabled={loading}
          className="bg-[var(--ink,#0F172A)] text-white border border-[var(--ink,#0F172A)] rounded-md px-3 py-1.5 text-[12px] font-medium cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
          Approve
        </button>
      </div>
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────

const ACTION_VERBS: Record<string, string> = {
  plan: "Planning actions",
  find: "Found contacts at",
  find_jobs: "Discovered job",
  discover_companies: "Discovered company",
  find_hiring_managers: "Found hiring manager at",
  draft: "Drafted email to",
  send: "Sent email to",
  follow_up: "Followed up with",
  monitor: "Monitored",
  skip: "Skipped",
};

function ActivityList({ items }: { items: AgentAction[] }) {
  return (
    <div>
      {items.map((a, idx) => (
        <div
          key={a.id}
          className="flex gap-3.5 py-2.5 text-[12.5px] animate-in slide-in-from-top duration-300"
          style={{ borderBottom: "1px solid #f1f1f4", animationDelay: `${idx * 50}ms` }}
        >
          <span className="text-[#94A3B8] w-[90px] shrink-0">
            {a.createdAt ? relativeTime(a.createdAt) : ""}
          </span>
          <span className="text-muted-foreground flex-1">
            {a.status === "executing" && (
              <Loader2 className="inline h-3 w-3 animate-spin mr-1 text-blue-500" />
            )}
            {ACTION_VERBS[a.action] || a.action}{" "}
            <span
              className="font-medium"
              style={{ color: "var(--ink, #0F172A)" }}
            >
              {a.company || ""}
            </span>
            {a.status === "failed" && (
              <span className="text-red-500 ml-1">· failed</span>
            )}
            {a.status === "executing" && (
              <span className="text-blue-500 ml-1">· running</span>
            )}
            {a.status === "pending_approval" && (
              <span className="text-amber-500 ml-1">· pending</span>
            )}
            {a.reason && (
              <span className="block text-[11.5px] text-[#b3b8c7] mt-0.5">
                {a.reason}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Flip counter (animated number with roll transition) ──────────────────

function FlipCounter({ label, value }: { label: string; value: number }) {
  const prevRef = useRef(value);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 300);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div className="text-center">
      <div
        className="text-[28px] font-semibold tabular-nums transition-transform duration-200"
        style={{
          color: "var(--ink, #0F172A)",
          transform: animating ? "translateY(-2px)" : "translateY(0)",
          opacity: animating ? 0.7 : 1,
        }}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

// ── Step list (D5 - vertical progress during "Run now") ──────────────────

const ACTION_LABELS: Record<string, string> = {
  plan: "Planning actions",
  find: "Searching for contacts",
  find_jobs: "Finding matching jobs",
  discover_companies: "Discovering companies",
  find_hiring_managers: "Finding hiring managers",
  follow_up: "Preparing follow-ups",
  draft: "Drafting emails",
};

function StepList({
  completedActions,
  currentAction,
  currentLabel,
  plannedActions,
}: {
  completedActions: CycleStep[];
  currentAction: string | null;
  currentLabel: string | null;
  plannedActions: string[];
}) {
  // Derive upcoming from planned minus completed and current
  const doneSet = new Set(completedActions.map((a) => a.action));
  const upcoming = plannedActions.filter(
    (a) => !doneSet.has(a) && a !== currentAction
  );

  return (
    <div className="space-y-2.5">
      {completedActions.map((step, i) => (
        <div key={i} className="flex items-start gap-2.5 animate-in slide-in-from-top duration-300">
          <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
          <div>
            <span className="text-[13px] text-[var(--ink,#0F172A)]">
              {step.label || ACTION_LABELS[step.action] || step.action}
            </span>
            {step.resultSummary && (
              <span className="text-[11.5px] text-[#94A3B8] ml-1.5">
                 - {step.resultSummary}
              </span>
            )}
          </div>
        </div>
      ))}
      {currentAction && (
        <div className="flex items-start gap-2.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 mt-0.5 shrink-0" />
          <span className="text-[13px] text-[var(--ink,#0F172A)]">
            {currentLabel || ACTION_LABELS[currentAction] || currentAction}
          </span>
        </div>
      )}
      {upcoming.map((action, i) => (
        <div key={i} className="flex items-start gap-2.5 opacity-40">
          <div className="h-3.5 w-3.5 rounded-full border border-[#d1d5dc] mt-0.5 shrink-0" />
          <span className="text-[13px]">{ACTION_LABELS[action] || action}</span>
        </div>
      ))}
    </div>
  );
}

// ── Right rail - agent activity tracker ─────────────────────────────────────

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[#e9eaef] rounded-md p-2.5" style={{ background: "#fff" }}>
      <div className="text-[9.5px] uppercase tracking-[0.06em] text-[#94A3B8] font-medium">
        {label}
      </div>
      <div style={{
        fontSize: 16, fontWeight: 500,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontVariantNumeric: "tabular-nums", marginTop: 2,
        color: "var(--ink, #0F172A)",
      }}>{value}</div>
    </div>
  );
}

export function AgentActivityRail() {
  const liveActions = useAgentActivityLive();
  const stats = useAgentStats();
  const countdown = useCountdown(stats.data?.nextCycleAt);

  const pendingCount = liveActions.filter((a) => a.status === "executing" || a.status === "pending_approval").length;
  const runningCount = liveActions.filter((a) => a.status === "executing").length;

  return (
    <aside className="hidden lg:flex w-[300px] shrink-0 border-l border-[#e9eaef] flex-col sticky top-0 h-screen overflow-y-auto"
      style={{ background: "var(--paper-2, #fafafa)", padding: "16px 18px" }}>
      <AgentStyles />
      <div className="flex items-center gap-2 mb-1">
        <PulseDot />
        <span className="text-[11px] uppercase tracking-[0.06em] text-[#4b5567] font-medium">
          Agent · running
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 mt-3">
        <MiniStat label="queued" value={pendingCount} />
        <MiniStat label="running" value={runningCount} />
      </div>

      <div className="text-[11px] uppercase tracking-[0.06em] text-[#94A3B8] font-medium mb-2">
        Activity
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {liveActions.length === 0 && (
          <div className="text-[12px] text-[#94A3B8] py-4">No activity yet.</div>
        )}
        {liveActions.slice(0, 20).map((a, i, arr) => {
          const kind = ACTION_KIND[a.action] || "watch";
          const meta = KIND_META[kind];
          const verb = ACTION_VERBS[a.action] || a.action;
          return (
            <div key={a.id} style={{
              padding: "8px 0",
              borderBottom: i === arr.length - 1 ? "none" : "1px solid #f1f1f4",
            }}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="rounded-full shrink-0" style={{ width: 5, height: 5, background: meta.color }} />
                <span style={{
                  fontSize: 9.5,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: meta.color, textTransform: "uppercase", letterSpacing: "0.06em",
                }}>{meta.label}</span>
                <span className="ml-auto" style={{
                  fontSize: 10, color: "#b3b8c7",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}>{a.createdAt ? relativeTime(a.createdAt) : ""}</span>
              </div>
              <div className="text-[12px] text-[#4b5567] leading-snug pl-[13px]">
                {verb} {a.company || ""}
                {a.status === "failed" && <span className="text-red-500 ml-1">· failed</span>}
                {a.status === "executing" && <span className="text-blue-500 ml-1">· running</span>}
              </div>
            </div>
          );
        })}
      </div>

      {countdown && (
        <div className="mt-3 pt-3 border-t border-[#e9eaef] text-[11px] text-[#94A3B8]">
          Next cycle in <span className="text-[#4b5567] font-medium">{countdown}</span>
        </div>
      )}
    </aside>
  );
}
