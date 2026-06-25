// LoopDetailPage — per-Loop deep view.
//
// Phase 4c: this is the "per-Loop AgentSnapshot" the original placeholder
// promised. Visual language is ported from the Claude Design handoff
// (Variant C — editorial masthead + underline tabs: Overview · Drafts ·
// Replies · Jobs · Pipeline · Activity). Real data comes from useLoop +
// useLoopActivity; tab filters subset the activity feed.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pause, Play, RotateCw, Trash2 } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useToast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import {
  useDeleteLoop,
  useLoop,
  useLoopActivity,
  useMarkLoopReviewed,
  usePauseLoop,
  useResumeLoop,
  useRunLoopNow,
  useStartLoop,
} from "@/hooks/useLoops";
import { LOOP_COPY } from "@/lib/loopCopy";
import type { Loop, LoopActivityItem, LoopActivityType } from "@/services/loops";

// ── Animations (one-time inject) ─────────────────────────────────────────────

const LOOP_KEYFRAMES = `
@keyframes loop-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(34,197,94,.55); }
  70%  { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
  100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
}
@keyframes loop-stream {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

const LoopStyles = () => <style dangerouslySetInnerHTML={{ __html: LOOP_KEYFRAMES }} />;

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function greetingPart(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

const TYPE_COLOR: Record<LoopActivityType, string> = {
  contact: "#4338ca",
  draft: "#92400e",
  hm: "#15803d",
  job: "#0369a1",
  company: "#6d28d9",
};

const TYPE_LABEL: Record<LoopActivityType, string> = {
  contact: "Person",
  draft: "Email draft",
  hm: "Hiring manager",
  job: "Job",
  company: "Company",
};

type TabKey = "overview" | "drafts" | "replies" | "jobs" | "pipeline" | "activity";

export default function LoopDetailPage() {
  const { loopId } = useParams<{ loopId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const query = useLoop(loopId);
  const activity = useLoopActivity(loopId || "");
  const startMut = useStartLoop();
  const pauseMut = usePauseLoop();
  const resumeMut = useResumeLoop();
  const runNowMut = useRunLoopNow();
  const deleteMut = useDeleteLoop();
  const markReviewedMut = useMarkLoopReviewed();

  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (loopId) markReviewedMut.mutate(loopId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopId]);

  const loop = query.data;
  const items = activity.data?.items ?? [];
  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  // Live ticker — most recent activity item, animated on change
  const tickerItem = items[0];

  // Partitions for tabs
  const partitioned = useMemo(() => partitionItems(items), [items]);

  const draftsCount = partitioned.drafts.length;
  const jobsCount = partitioned.jobs.length;
  const companiesCount = partitioned.companies.length;
  const repliesWaiting = loop?.unreadReplies ?? 0;

  const tabs: Array<{ id: TabKey; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "drafts", label: "Drafts", count: draftsCount || undefined },
    { id: "replies", label: "Replies", count: repliesWaiting || undefined },
    { id: "jobs", label: "Jobs", count: jobsCount || undefined },
    { id: "pipeline", label: "Pipeline", count: companiesCount || undefined },
    { id: "activity", label: "Activity" },
  ];

  return (
    <SidebarProvider>
      <LoopStyles />
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title={loop?.name || "Loop"} />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[1080px] mx-auto px-4 sm:px-8 py-7">
              <Link
                to="/agent"
                className="inline-flex items-center gap-1.5 text-[12.5px] mb-6 transition-colors hover:text-[var(--ink)]"
                style={{ color: "var(--ink-3)" }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Loops
              </Link>

              {query.isLoading && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {query.isError && (
                <div
                  className="rounded-lg border p-5 text-[13.5px]"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--paper-2)",
                    color: "var(--ink-2)",
                  }}
                >
                  We couldn't find that Loop. It may have been removed.
                </div>
              )}

              {loop && (
                <>
                  {/* ── Editorial masthead hero (Variant C) ── */}
                  <Hero
                    loop={loop}
                    firstName={firstName}
                    draftsReady={draftsCount}
                    repliesWaiting={repliesWaiting}
                    tickerItem={tickerItem}
                    onPause={() =>
                      pauseMut.mutateAsync(loop.id).then(() =>
                        toast({ title: LOOP_COPY.toasts.loopPaused })
                      )
                    }
                    onResume={() =>
                      resumeMut.mutateAsync(loop.id).then(() =>
                        toast({ title: LOOP_COPY.toasts.loopResumed })
                      )
                    }
                    onStart={() =>
                      startMut
                        .mutateAsync(loop.id)
                        .then(() => toast({ title: LOOP_COPY.toasts.loopStarted }))
                        .catch((e) =>
                          toast({
                            title: LOOP_COPY.toasts.somethingBroke,
                            description: (e as Error).message,
                            variant: "destructive",
                          })
                        )
                    }
                    onRunNow={() =>
                      runNowMut
                        .mutateAsync(loop.id)
                        .then(() => toast({ title: "Running it again now." }))
                        .catch((e) =>
                          toast({
                            title: LOOP_COPY.toasts.somethingBroke,
                            description: (e as Error).message,
                            variant: "destructive",
                          })
                        )
                    }
                    onRemove={() => {
                      if (!confirm("Remove this Loop? Drafts already created will stay in your tracker.")) return;
                      deleteMut.mutateAsync(loop.id).then(() => {
                        toast({ title: LOOP_COPY.toasts.loopDeleted });
                        navigate("/agent");
                      });
                    }}
                    busy={{
                      start: startMut.isPending,
                      pause: pauseMut.isPending,
                      resume: resumeMut.isPending,
                      runNow: runNowMut.isPending,
                      remove: deleteMut.isPending,
                    }}
                  />

                  {/* Pause reason banner */}
                  {loop.pauseReason && loop.pauseReason !== "quiet_hours" && (
                    <div
                      className="mt-5 rounded-lg p-3.5 text-[13px] leading-snug"
                      style={{
                        background: "#fffbeb",
                        color: "#92400e",
                        border: "1px solid #fde68a",
                      }}
                    >
                      {LOOP_COPY.pauseReason[loop.pauseReason] || LOOP_COPY.pauseReason.paused}
                    </div>
                  )}

                  {/* ── Tabs (underline, left-aligned) ── */}
                  <div
                    className="flex gap-7 mt-8 border-b"
                    style={{ borderColor: "var(--line)" }}
                  >
                    {tabs.map((t) => {
                      const on = t.id === tab;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTab(t.id)}
                          className="relative pb-2.5 text-[13px] tracking-[-0.01em] cursor-pointer bg-transparent border-0 flex items-center gap-1.5 transition-colors"
                          style={{
                            fontWeight: on ? 600 : 400,
                            color: on ? "var(--ink)" : "var(--ink-3)",
                            borderBottom: on ? "1.5px solid var(--ink)" : "1.5px solid transparent",
                            marginBottom: -1,
                          }}
                        >
                          {t.label}
                          {t.count != null && t.count > 0 && (
                            <span
                              style={{
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                fontSize: 10,
                                color: "var(--ink-3)",
                                background: "var(--paper-3, #f4f5fb)",
                                border: "1px solid var(--line-2, #f0f0ed)",
                                borderRadius: 100,
                                padding: "1px 6px",
                                marginLeft: 2,
                              }}
                            >
                              {t.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* ── Tab content ── */}
                  {tab === "overview" && (
                    <OverviewTab loop={loop} items={items} partitioned={partitioned} />
                  )}
                  {tab === "drafts" && (
                    <DraftsTab items={partitioned.drafts} contactsCount={partitioned.contacts.length} />
                  )}
                  {tab === "replies" && (
                    <RepliesTab loop={loop} />
                  )}
                  {tab === "jobs" && (
                    <JobsTab items={partitioned.jobs} />
                  )}
                  {tab === "pipeline" && (
                    <PipelineTab partitioned={partitioned} />
                  )}
                  {tab === "activity" && (
                    <ActivityTab items={items} loading={activity.isLoading} />
                  )}
                </>
              )}
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}

// ── Hero (masthead, Variant C) ───────────────────────────────────────────────

function Hero({
  loop,
  firstName,
  draftsReady,
  repliesWaiting,
  tickerItem,
  onPause,
  onResume,
  onStart,
  onRunNow,
  onRemove,
  busy,
}: {
  loop: Loop;
  firstName: string;
  draftsReady: number;
  repliesWaiting: number;
  tickerItem?: LoopActivityItem;
  onPause: () => void;
  onResume: () => void;
  onStart: () => void;
  onRunNow: () => void;
  onRemove: () => void;
  busy: { start: boolean; pause: boolean; resume: boolean; runNow: boolean; remove: boolean };
}) {
  const isRunning = loop.status === "running";
  const isPaused = loop.status === "paused";
  const isIdle = loop.status === "idle";

  const statusColor = isRunning ? "#22c55e" : isPaused ? "#f59e0b" : "#8089a0";
  const statusLabel = isRunning ? "Running" : isPaused ? "Paused" : isIdle ? "Idle" : "Done";

  const tickerText = tickerItem
    ? `${TYPE_LABEL[tickerItem.type]} · ${tickerItem.title}`
    : isRunning
      ? "Watching for replies and new finds"
      : isPaused
        ? "Paused — resume to continue"
        : "Idle. Start it to begin.";

  return (
    <div className="pb-6 border-b" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-start justify-between gap-8 flex-wrap">
        {/* Left: kicker + big editorial headline + live ticker */}
        <div className="flex-1 min-w-0" style={{ minWidth: 280 }}>
          <div
            className="mb-3"
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 10,
              color: "var(--ink-3)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            Loop · {loop.shortCode} · {new Date().toLocaleDateString(undefined, { weekday: "long" })}
          </div>
          <h1
            className="font-serif leading-[1.05] tracking-[-0.025em]"
            style={{
              color: "var(--ink)",
              fontSize: "clamp(28px, 4vw, 38px)",
              fontWeight: 400,
            }}
          >
            {draftsReady > 0 || repliesWaiting > 0 ? (
              <>
                Good {greetingPart()}, {firstName}. You have{" "}
                <em className="italic" style={{ fontWeight: 400 }}>
                  {draftsReady === 1 ? "one draft" : `${draftsReady} drafts`}
                </em>
                {" "}and{" "}
                <em className="italic" style={{ fontWeight: 400 }}>
                  {repliesWaiting === 1 ? "one reply" : `${repliesWaiting} replies`}
                </em>
                .
              </>
            ) : isRunning ? (
              <>
                {loop.name} <em className="italic" style={{ fontWeight: 400 }}>is running.</em>
              </>
            ) : (
              <>
                {loop.name} <em className="italic" style={{ fontWeight: 400 }}>— ready when you are.</em>
              </>
            )}
          </h1>

          {/* Brief blockquote */}
          {loop.briefText && (
            <blockquote
              className="mt-4 pl-4 border-l-2 text-[13.5px] italic leading-relaxed"
              style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
            >
              {loop.briefText}
            </blockquote>
          )}

          {/* Live ticker line */}
          <div
            className="mt-4 flex items-center gap-2.5"
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              color: "var(--ink-2)",
            }}
          >
            <span
              style={{
                position: "relative",
                width: 7,
                height: 7,
                display: "inline-block",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: statusColor,
                  animation: isRunning ? "loop-pulse 1.6s ease-out infinite" : undefined,
                }}
              />
            </span>
            <span
              key={tickerItem?.id || "idle"}
              className="animate-in fade-in slide-in-from-bottom-1 duration-300"
              style={{ color: tickerItem ? "var(--ink-2)" : "var(--ink-3)" }}
            >
              {tickerText}
            </span>
          </div>
        </div>

        {/* Right: big serif counters + status column */}
        <div className="flex items-start gap-6">
          <BigCounter n={draftsReady} label="drafts ready" />
          <BigCounter n={repliesWaiting} label="replies waiting" />
          <div
            className="pl-5"
            style={{ borderLeft: "1px solid var(--line-2, #f1f1f4)", minWidth: 130 }}
          >
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 10,
                color: "var(--ink-3)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Status
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span
                style={{
                  position: "relative",
                  width: 7,
                  height: 7,
                  display: "inline-block",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: statusColor,
                  }}
                />
              </span>
              <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {statusLabel}
              </span>
            </div>
            {isRunning && (
              <button
                onClick={onPause}
                disabled={busy.pause}
                className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--paper-2)] disabled:opacity-50"
                style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
              >
                <Pause className="h-3 w-3" /> Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={onResume}
                disabled={busy.resume}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--ink)", color: "white" }}
              >
                <Play className="h-3 w-3" /> Wake up
              </button>
            )}
            {isIdle && (
              <button
                onClick={onStart}
                disabled={busy.start}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--ink)", color: "white" }}
              >
                <Play className="h-3 w-3" /> Start it
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action row (Run now / Remove + stat strip) */}
      <div className="flex items-center gap-2 mt-5 flex-wrap">
        {isRunning && (
          <button
            onClick={onRunNow}
            disabled={busy.runNow}
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--ink)", color: "white" }}
          >
            {busy.runNow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            Run it now
          </button>
        )}
        <button
          onClick={onRemove}
          disabled={busy.remove}
          className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-[12.5px] transition-colors hover:bg-[var(--paper-2)] disabled:opacity-50"
          style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </button>
      </div>

      {/* 4-up stat strip */}
      <div
        className="grid grid-cols-4 mt-6 rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--line)", background: "var(--paper-2, #fafafa)" }}
      >
        {[
          { label: "People found", value: loop.totalContactsFound, sub: "total" },
          { label: "Emails written", value: loop.totalEmailsDrafted, sub: "total" },
          { label: "Jobs matched", value: loop.totalJobsFound, sub: "total" },
          { label: "Credits / week", value: loop.weekCreditsSpent, sub: `of ${loop.creditBudgetPerWeek}` },
        ].map((it, i, arr) => (
          <div
            key={it.label}
            className="flex flex-col gap-0.5"
            style={{
              padding: "10px 14px",
              borderRight: i < arr.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <div
              className="font-medium"
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 10,
                color: "var(--ink-3)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {it.label}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 18,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink)",
                }}
              >
                {it.value}
              </span>
              <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>{it.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BigCounter({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ minWidth: 88 }}>
      <div
        className="font-serif tracking-[-0.03em]"
        style={{
          color: "var(--ink)",
          fontSize: "clamp(40px, 5vw, 56px)",
          lineHeight: 0.95,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 400,
        }}
      >
        {n}
      </div>
      <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
    </div>
  );
}

// ── Tab content ─────────────────────────────────────────────────────────────

function OverviewTab({
  loop,
  items,
  partitioned,
}: {
  loop: Loop;
  items: LoopActivityItem[];
  partitioned: ReturnType<typeof partitionItems>;
}) {
  const recentDrafts = partitioned.drafts.slice(0, 4);
  const recentJobs = partitioned.jobs.slice(0, 4);
  const recentCompanies = partitioned.companies.slice(0, 4);
  return (
    <div className="pt-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-9">
        {/* Today's mail */}
        <section>
          <SectionHead kicker="01 · Today's mail" title="Drafts" italic="ready for review." />
          {recentDrafts.length === 0 ? (
            <EmptyText>No drafts yet. They appear here as the agent writes outreach.</EmptyText>
          ) : (
            recentDrafts.map((d, i) => (
              <NumberedItem key={d.id} item={d} index={i + 1} last={i === recentDrafts.length - 1} />
            ))
          )}
        </section>

        {/* Right column: replies stub + recent jobs + companies */}
        <section>
          <SectionHead kicker="02 · Waiting on you" title="Replies" italic="that landed." />
          {loop.unreadReplies > 0 ? (
            <Link
              to="/tracker"
              className="block rounded-lg border p-4 mb-7 transition-colors hover:bg-[var(--paper-2)]"
              style={{ borderColor: "var(--line)" }}
            >
              <div
                className="font-serif"
                style={{ fontSize: 28, color: "var(--ink)", lineHeight: 1, marginBottom: 6, fontWeight: 400 }}
              >
                {loop.unreadReplies}
              </div>
              <div className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                unread {loop.unreadReplies === 1 ? "reply" : "replies"} · open in tracker →
              </div>
            </Link>
          ) : (
            <div className="mb-7">
              <EmptyText>All caught up.</EmptyText>
            </div>
          )}

          {recentJobs.length > 0 && (
            <>
              <SectionHead kicker="03 · Fresh on the wire" title="Jobs" italic="matched." />
              {recentJobs.map((j, i) => (
                <CompactRow
                  key={j.id}
                  item={j}
                  last={i === recentJobs.length - 1}
                />
              ))}
            </>
          )}

          {recentCompanies.length > 0 && (
            <div className="mt-7">
              <SectionHead kicker="04 · The long game" title="Companies" italic="discovered." />
              {recentCompanies.map((c, i) => (
                <CompactRow
                  key={c.id}
                  item={c}
                  last={i === recentCompanies.length - 1}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {items.length === 0 && (
        <div className="mt-10 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Nothing yet. As this Loop finds people, jobs, and companies, they'll show up here.
        </div>
      )}
    </div>
  );
}

function DraftsTab({ items, contactsCount }: { items: LoopActivityItem[]; contactsCount: number }) {
  return (
    <div className="pt-8">
      <SectionHead
        kicker="The queue"
        title="Drafts"
        italic="awaiting your send."
        right={
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: "var(--ink-3)",
            }}
          >
            {items.length} ready · {contactsCount} contacts
          </span>
        }
      />
      {items.length === 0 ? (
        <EmptyText>
          No drafts yet. The Loop writes outreach as it finds contacts — give it a moment.
        </EmptyText>
      ) : (
        items.map((d, i) => (
          <NumberedItem key={d.id} item={d} index={i + 1} last={i === items.length - 1} />
        ))
      )}
    </div>
  );
}

function RepliesTab({ loop }: { loop: Loop }) {
  return (
    <div className="pt-8 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <aside
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "var(--line)", background: "#fff" }}
      >
        <div
          className="px-3.5 py-3 border-b"
          style={{
            borderColor: "var(--line-2, #f1f1f4)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          Reply counters
        </div>
        <div className="px-4 py-4">
          <div
            className="font-serif"
            style={{ fontSize: 42, color: "var(--ink)", lineHeight: 1, fontWeight: 400 }}
          >
            {loop.unreadReplies}
          </div>
          <div className="text-[12.5px] mt-1.5" style={{ color: "var(--ink-2)" }}>
            unread {loop.unreadReplies === 1 ? "reply" : "replies"}
          </div>
          <div
            className="mt-4 pt-4 border-t"
            style={{ borderColor: "var(--line-2, #f1f1f4)" }}
          >
            <div
              className="font-serif"
              style={{ fontSize: 26, color: "var(--ink-2)", lineHeight: 1, fontWeight: 400 }}
            >
              {loop.totalRepliesReceived}
            </div>
            <div className="text-[12.5px] mt-1" style={{ color: "var(--ink-3)" }}>
              total received
            </div>
          </div>
        </div>
      </aside>
      <section
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--line)", background: "#fff" }}
      >
        <div
          className="mb-3"
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          How replies work
        </div>
        <p
          className="font-serif italic mb-3"
          style={{ fontSize: 18, color: "var(--ink)", fontWeight: 400, lineHeight: 1.4 }}
        >
          When a contact responds, Offerloop drafts a suggested reply and moves them into your tracker.
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Open the tracker to see full conversations, the agent's suggested response, and approve or
          edit before sending.
        </p>
        <Link
          to="/tracker"
          className="inline-block mt-4 text-[12.5px] font-medium"
          style={{ color: "var(--ink)" }}
        >
          Open tracker →
        </Link>
      </section>
    </div>
  );
}

function JobsTab({ items }: { items: LoopActivityItem[] }) {
  return (
    <div className="pt-8">
      <SectionHead
        kicker="Fresh on the wire"
        title="Jobs"
        italic="surfaced by this Loop."
        right={
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: "var(--ink-3)",
            }}
          >
            {items.length} matches
          </span>
        }
      />
      {items.length === 0 ? (
        <EmptyText>No jobs found yet. Run the Loop to discover matching roles.</EmptyText>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: "var(--line)", background: "#fff" }}
        >
          {items.map((j, i) => (
            <EditorialJobRow key={j.id} item={j} index={i + 1} last={i === items.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineTab({
  partitioned,
}: {
  partitioned: ReturnType<typeof partitionItems>;
}) {
  // Derive a per-company stage from what the Loop has actually found.
  // Replied isn't in the per-Loop activity feed (only counts on the Loop itself),
  // so we use four columns: Researching · Drafted · Closed (HM found) · Companies.
  // The richest signal we have is per-type item counts grouped by company name.
  type Card = {
    company: string;
    contacts: number;
    drafts: number;
    hms: number;
    jobs: number;
  };
  const byCompany = new Map<string, Card>();
  function bump(name: string, key: keyof Omit<Card, "company">) {
    if (!name) return;
    const cur = byCompany.get(name) || { company: name, contacts: 0, drafts: 0, hms: 0, jobs: 0 };
    cur[key] = (cur[key] as number) + 1;
    byCompany.set(name, cur);
  }
  for (const c of partitioned.contacts) bump(extractCompany(c.subtitle), "contacts");
  for (const d of partitioned.drafts) bump(extractCompany(d.subtitle), "drafts");
  for (const h of partitioned.hms) bump(extractCompany(h.subtitle), "hms");
  for (const j of partitioned.jobs) bump(extractCompany(j.subtitle), "jobs");
  // Also surface companies that were discovered with no contacts yet
  for (const co of partitioned.companies) {
    if (!byCompany.has(co.title)) {
      byCompany.set(co.title, { company: co.title, contacts: 0, drafts: 0, hms: 0, jobs: 0 });
    }
  }

  const cards = Array.from(byCompany.values());
  const cols = {
    Researching: cards.filter((c) => c.contacts > 0 && c.drafts === 0),
    Drafted: cards.filter((c) => c.drafts > 0),
    "HM identified": cards.filter((c) => c.hms > 0 && c.drafts === 0),
    Discovered: cards.filter((c) => c.contacts === 0 && c.drafts === 0 && c.hms === 0),
  };
  const order: Array<keyof typeof cols> = ["Researching", "Drafted", "HM identified", "Discovered"];

  if (cards.length === 0) {
    return (
      <div className="pt-8">
        <SectionHead kicker="The long game" title="Pipeline" italic="by stage." />
        <EmptyText>No pipeline yet. As the Loop finds contacts, drafts appear here grouped by company.</EmptyText>
      </div>
    );
  }

  return (
    <div className="pt-8">
      <SectionHead
        kicker="The long game"
        title="Pipeline"
        italic="by company."
        right={
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: "var(--ink-3)",
            }}
          >
            {cards.length} companies
          </span>
        }
      />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {order.map((col) => (
          <div
            key={col}
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--line)", background: "#fff", minHeight: 240 }}
          >
            <div
              className="flex items-baseline justify-between pb-2 mb-2.5"
              style={{ borderBottom: "1px solid var(--line-2, #f1f1f4)" }}
            >
              <span className="text-[13px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                {col}
              </span>
              <span
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 11,
                  color: "var(--ink-3)",
                }}
              >
                {cols[col].length}
              </span>
            </div>
            {cols[col].length === 0 ? (
              <div className="text-[12px] italic py-1" style={{ color: "var(--ink-3)" }}>—</div>
            ) : (
              <div className="space-y-1.5">
                {cols[col].map((c) => (
                  <Link
                    key={c.company}
                    to={`/tracker?company=${encodeURIComponent(c.company)}`}
                    className="block rounded-md p-2 transition-colors hover:bg-[var(--paper-2)]"
                    style={{ border: "1px solid var(--line-2, #f1f1f4)" }}
                  >
                    <div className="text-[12.5px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                      {c.company}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                      {c.contacts > 0 && `${c.contacts} contact${c.contacts !== 1 ? "s" : ""}`}
                      {c.hms > 0 && ` · ${c.hms} HM`}
                      {c.jobs > 0 && ` · ${c.jobs} job${c.jobs !== 1 ? "s" : ""}`}
                      {c.drafts > 0 && ` · ${c.drafts} draft${c.drafts !== 1 ? "s" : ""}`}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTab({ items, loading }: { items: LoopActivityItem[]; loading: boolean }) {
  // Group by day
  const groups: Array<[string, LoopActivityItem[]]> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const labelFor = (iso: string): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(+d)) return "—";
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    if (+day === +today) return "Today";
    if (+day === +yesterday) return "Yesterday";
    return day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };
  for (const a of items) {
    const label = labelFor(a.createdAt);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(a);
    else groups.push([label, [a]]);
  }

  if (loading) {
    return (
      <div className="pt-8 flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="pt-8">
        <SectionHead kicker="The log" title="Activity" italic="reverse-chronological." />
        <EmptyText>No activity yet. Run the Loop to start logging events.</EmptyText>
      </div>
    );
  }

  return (
    <div className="pt-8">
      <SectionHead
        kicker="The log"
        title="Activity"
        italic="reverse-chronological."
        right={
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              color: "var(--ink-3)",
            }}
          >
            {items.length} events
          </span>
        }
      />
      <div className="space-y-7">
        {groups.map(([day, entries]) => (
          <div key={day}>
            <div
              className="flex items-center gap-3 mb-3.5"
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 10,
                color: "var(--ink-3)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ flex: 1, height: 1, background: "var(--line-2, #f1f1f4)" }} />
              {day}
              <span style={{ flex: 1, height: 1, background: "var(--line-2, #f1f1f4)" }} />
            </div>
            <div className="pl-5 ml-1.5" style={{ borderLeft: "1px solid var(--line-2, #f1f1f4)" }}>
              {entries.map((a) => {
                const ts = a.createdAt
                  ? new Date(a.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : "";
                return (
                  <div key={a.id} className="relative pb-3.5" style={{ paddingLeft: 4 }}>
                    <span
                      style={{
                        position: "absolute",
                        left: -27,
                        top: 6,
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: TYPE_COLOR[a.type],
                        border: "2px solid #fff",
                      }}
                    />
                    <div className="flex items-baseline gap-3">
                      <span
                        style={{
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 11,
                          color: "var(--ink-3)",
                          width: 56,
                          flexShrink: 0,
                        }}
                      >
                        {ts}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                          <span className="font-semibold">{TYPE_LABEL[a.type]}</span>
                          <span style={{ color: "var(--ink-2)" }}> · {a.title}</span>
                        </div>
                        {a.subtitle && (
                          <div className="text-[11.5px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                            {a.subtitle}
                          </div>
                        )}
                      </div>
                      {a.external ? (
                        <a
                          href={a.linkTo}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11.5px] shrink-0"
                          style={{ color: "var(--ink-2)" }}
                        >
                          open →
                        </a>
                      ) : (
                        <Link to={a.linkTo} className="text-[11.5px] shrink-0" style={{ color: "var(--ink-2)" }}>
                          view →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Small shared components ─────────────────────────────────────────────────

function SectionHead({
  kicker,
  title,
  italic,
  right,
}: {
  kicker: string;
  title: string;
  italic?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 10,
          color: "var(--ink-3)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ width: 14, height: 1, background: "var(--ink-3)" }} />
        {kicker}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className="font-serif tracking-[-0.015em]"
          style={{ margin: 0, fontSize: 22, lineHeight: 1.1, color: "var(--ink)", fontWeight: 400 }}
        >
          {title}
          {italic && <em className="italic" style={{ fontWeight: 400 }}> {italic}</em>}
        </h3>
        {right}
      </div>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-6 text-center text-[13px] italic"
      style={{
        borderColor: "var(--line-2, #f1f1f4)",
        background: "var(--paper-2, #fafafa)",
        color: "var(--ink-3)",
      }}
    >
      {children}
    </div>
  );
}

function NumberedItem({
  item,
  index,
  last,
}: {
  item: LoopActivityItem;
  index: number;
  last: boolean;
}) {
  const linkProps = item.external
    ? { href: item.linkTo, target: "_blank" as const, rel: "noreferrer" }
    : null;
  const inner = (
    <div
      className="flex gap-5 py-4 transition-colors hover:bg-[var(--paper-2)] rounded-md"
      style={{ borderBottom: last ? "none" : "1px solid var(--line-2, #f1f1f4)" }}
    >
      <span
        className="font-serif shrink-0"
        style={{
          fontSize: 28,
          color: "var(--ink-3)",
          width: 36,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          paddingTop: 4,
          fontWeight: 400,
        }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span
            className="text-[10px] uppercase tracking-[0.06em] font-medium rounded"
            style={{
              padding: "1.5px 6px",
              background: TYPE_COLOR[item.type] + "1a",
              color: TYPE_COLOR[item.type],
            }}
          >
            {TYPE_LABEL[item.type]}
          </span>
          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            {relativeTime(item.createdAt)}
          </span>
        </div>
        <div
          className="font-serif tracking-[-0.01em] mb-1"
          style={{ fontSize: 17, color: "var(--ink)", fontWeight: 400 }}
        >
          {item.title}
        </div>
        {item.subtitle && (
          <div className="text-[12.5px] line-clamp-2" style={{ color: "var(--ink-2)" }}>
            {item.subtitle}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[12px] mt-1" style={{ color: "var(--ink-2)" }}>
        {item.external ? "Open →" : "View →"}
      </span>
    </div>
  );
  return linkProps ? <a {...linkProps}>{inner}</a> : <Link to={item.linkTo}>{inner}</Link>;
}

function CompactRow({ item, last }: { item: LoopActivityItem; last: boolean }) {
  const inner = (
    <div
      className="flex items-center gap-3 py-2.5 transition-colors hover:bg-[var(--paper-2)] rounded-md"
      style={{ borderBottom: last ? "none" : "1px solid var(--line-2, #f1f1f4)" }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: TYPE_COLOR[item.type],
          flexShrink: 0,
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium tracking-[-0.01em] truncate" style={{ color: "var(--ink)" }}>
          {item.title}
        </div>
        {item.subtitle && (
          <div className="text-[11.5px] truncate" style={{ color: "var(--ink-3)" }}>
            {item.subtitle}
          </div>
        )}
      </div>
      <span className="text-[10.5px] shrink-0" style={{ color: "var(--ink-3)" }}>
        {relativeTime(item.createdAt)}
      </span>
    </div>
  );
  return item.external ? (
    <a href={item.linkTo} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link to={item.linkTo}>{inner}</Link>
  );
}

function EditorialJobRow({
  item,
  index,
  last,
}: {
  item: LoopActivityItem;
  index: number;
  last: boolean;
}) {
  const inner = (
    <div
      className="flex items-center gap-5 px-5 py-4 transition-colors hover:bg-[var(--paper-2)]"
      style={{ borderBottom: last ? "none" : "1px solid var(--line-2, #f1f1f4)" }}
    >
      <span
        className="font-serif shrink-0"
        style={{
          fontSize: 42,
          color: index <= 3 ? "var(--ink)" : "var(--ink-3)",
          width: 60,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 400,
        }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="font-serif tracking-[-0.015em] mb-1"
          style={{ fontSize: 17, color: "var(--ink)", fontWeight: 400 }}
        >
          {item.title}
        </div>
        {item.subtitle && (
          <div className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            {item.subtitle}
          </div>
        )}
      </div>
      <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--ink)" }}>
        {item.external ? "Apply →" : "View →"}
      </span>
    </div>
  );
  return item.external ? (
    <a href={item.linkTo} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <Link to={item.linkTo}>{inner}</Link>
  );
}

// ── Partition helpers ───────────────────────────────────────────────────────

function partitionItems(items: LoopActivityItem[]) {
  const contacts: LoopActivityItem[] = [];
  const drafts: LoopActivityItem[] = [];
  const hms: LoopActivityItem[] = [];
  const jobs: LoopActivityItem[] = [];
  const companies: LoopActivityItem[] = [];
  for (const it of items) {
    if (it.type === "contact") contacts.push(it);
    else if (it.type === "draft") drafts.push(it);
    else if (it.type === "hm") hms.push(it);
    else if (it.type === "job") jobs.push(it);
    else if (it.type === "company") companies.push(it);
  }
  return { contacts, drafts, hms, jobs, companies };
}

/**
 * Activity subtitles encode useful detail like "PM at Notion" or
 * "Notion — productivity tools". Best-effort extraction of a company name
 * so we can group cards in the Pipeline tab.
 */
function extractCompany(subtitle: string): string {
  if (!subtitle) return "";
  // "Role at Company" or "Role @ Company"
  const at = subtitle.match(/\s(?:at|@)\s+([^·,—-]+)/i);
  if (at) return at[1].trim();
  // "Company — descriptor"
  const dash = subtitle.split(/[—-]/)[0];
  if (dash && dash.length < 60) return dash.trim();
  return "";
}
