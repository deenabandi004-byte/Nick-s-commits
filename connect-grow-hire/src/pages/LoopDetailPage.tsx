// LoopDetailPage — per-Loop deep view.
//
// Visual language ported from the Claude Design handoff
// "Loop Running (Option 2).html": single-scroll editorial layout —
// Hero (mascot + live narration) → Funnel → Emails sent → Replies →
// Discovered along the way (collapsed/expandable companies+roles).
// The tab structure is gone; everything reads as one calm narrative.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  ChevronDown,
  Loader2,
  Mail,
  Pause,
  Play,
  Reply,
  RotateCw,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useToast } from "@/hooks/use-toast";
import {
  useDeleteLoop,
  useLoop,
  useLoopActivity,
  useMarkLoopReviewed,
  usePauseLoop,
  useResumeLoop,
  useRunLoopNow,
  useStartLoop,
  useUpdateLoop,
} from "@/hooks/useLoops";
import { Textarea } from "@/components/ui/textarea";
import ScoutYetiFull from "@/assets/scouts/scout-yeti-full.png";
import { getCompanyLogo } from "@/lib/companyLogos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LOOP_COPY, cadenceLabel, loopCopy, pauseReasonLabel } from "@/lib/loopCopy";
import { relativeTime as relativeTimeBidi } from "@/lib/relativeTime";
import type { Loop, LoopActivityItem, LoopActivityType } from "@/services/loops";

// Editorial monospace — small caps, kickers, addresses.
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// ── Animations (one-time inject) ─────────────────────────────────────────────

const LOOP_KEYFRAMES = `
@keyframes rBob       { 0%,100% { transform: translateY(0); }  50% { transform: translateY(-9px); } }
@keyframes rBobShadow { 0%,100% { transform: scaleX(1);   opacity: .18; } 50% { transform: scaleX(.78); opacity: .09; } }
@keyframes rLivePulse { 0%   { box-shadow: 0 0 0 0 rgba(224,122,62,.5); }
                        70%  { box-shadow: 0 0 0 7px rgba(224,122,62,0); }
                        100% { box-shadow: 0 0 0 0 rgba(224,122,62,0); } }
@keyframes rSpin      { to { transform: rotate(360deg); } }
@keyframes rFadeUp    { from { opacity: 0; transform: translateY(6px); }
                        to   { opacity: 1; transform: translateY(0); } }
@keyframes rSpeed     { 0%   { opacity: 0; transform: translateX(8px); }
                        40%  { opacity: .8; }
                        100% { opacity: 0; transform: translateX(-22px); } }

@media (prefers-reduced-motion: reduce) {
  .loop-anim { animation: none !important; }
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

function startedLabel(iso: string | null): string {
  if (!iso) return "today";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long" });
}

function daysRunning(iso: string | null): number {
  if (!iso) return 1;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Math.max(1, days + 1);
}

// Loop-found contact names land lowercase from the upstream feed
// ("prashant tatineni"). Title-case at display time — the contact doc
// itself stays untouched. Word boundary catches spaces, hyphens, and
// apostrophes so "o'brien" → "O'Brien" and "mary-jane" → "Mary-Jane".
function titleCaseName(s: string): string {
  if (!s) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

const TYPE_LABEL: Record<LoopActivityType, string> = {
  contact: "Person",
  draft: "Email draft",
  hm: "Hiring manager",
  job: "Job",
  company: "Company",
};

// ── Cycle hook — rotates through narration lines ─────────────────────────────

function useCycle<T>(items: T[], ms: number): [T | undefined, number] {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), ms);
    return () => clearInterval(t);
  }, [items.length, ms]);
  return [items[i % Math.max(1, items.length)], i];
}

// ── Company badge — initial in a tinted square ──────────────────────────────

const COMPANY_TINTS: Record<string, string> = {
  Google: "#4285F4",
  Meta: "#0866FF",
  Amazon: "#FF9900",
  Apple: "#111827",
  Databricks: "#FF3621",
  OpenAI: "#10A37F",
  Microsoft: "#00A4EF",
  Netflix: "#E50914",
  Stripe: "#635BFF",
  Anthropic: "#D97757",
};

function CoBadge({ name, size = 30 }: { name: string; size?: number }) {
  const logo = getCompanyLogo(name);
  if (logo) {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          flexShrink: 0,
          background: "#ffffff",
          border: "1px solid rgba(15, 37, 69, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          padding: 3,
        }}
        title={name}
      >
        <img
          src={logo}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </span>
    );
  }
  const c = COMPANY_TINTS[name] || "var(--accent)";
  const fallbackHex = c.startsWith("var(") ? "#4A60A8" : c;
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flexShrink: 0,
        background: fallbackHex + "1a",
        color: c,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.42,
        fontFamily: "var(--font-body)",
      }}
      title={name}
    >
      {initial}
    </span>
  );
}

// ── Spinner — for the running narration row ─────────────────────────────────

function Spinner({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="loop-anim"
      style={{ flexShrink: 0, animation: "rSpin 0.9s linear infinite" }}
    >
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="var(--line)" strokeWidth="2.4" />
      <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function LoopDetailPage() {
  const { loopId } = useParams<{ loopId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const query = useLoop(loopId);
  const activity = useLoopActivity(loopId || "");
  const startMut = useStartLoop();
  const pauseMut = usePauseLoop();
  const resumeMut = useResumeLoop();
  const runNowMut = useRunLoopNow();
  const deleteMut = useDeleteLoop();
  const markReviewedMut = useMarkLoopReviewed();
  const updateMut = useUpdateLoop();

  const loop = query.data;

  // Snapshot lastReviewedAt before markLoopReviewed fires (legacy behavior
  // preserved from the prior design — the activity feed used the snapshot
  // to light up "N NEW SINCE YOU LAST CHECKED"; the new layout doesn't
  // expose that feed, but we still mark reviewed on landing so the fleet
  // view "unread" badge clears).
  const reviewedSnapshotTaken = useRef(false);
  useEffect(() => {
    if (!loop || !loopId) return;
    if (reviewedSnapshotTaken.current) return;
    reviewedSnapshotTaken.current = true;
    markReviewedMut.mutate(loopId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop, loopId]);

  const items = activity.data?.items ?? [];
  const partitioned = useMemo(() => partitionItems(items), [items]);

  return (
    <SidebarProvider>
      <LoopStyles />
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title={loop?.name || "Loop"} />

          <div className="flex-1 overflow-y-auto" style={{ background: "#fff" }}>
            {/* Top-left back nav — pinned to the page edge so it doesn't read
                as part of the centered Loop-detail column. */}
            <div className="pl-4 sm:pl-6 pt-5">
              <Link
                to="/agent"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:text-[var(--ink)]"
                style={{ color: "var(--ink-2)" }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Loops
              </Link>
            </div>
            <div className="max-w-[980px] mx-auto px-4 sm:px-10 pt-3 pb-20">

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
                    background: "var(--paper)",
                    color: "var(--ink-2)",
                  }}
                >
                  We couldn't find that Loop. It may have been removed.
                </div>
              )}

              {loop && (
                <>
                  <LoopHero
                    loop={loop}
                    items={items}
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
                    busy={{
                      start: startMut.isPending,
                      pause: pauseMut.isPending,
                      resume: resumeMut.isPending,
                    }}
                  />

                  {/* Editable brief — kept accessible; the chat-driven
                      simplification trimmed visual chrome but the brief
                      is still the loop's instructions and must be
                      editable. Quiet placement below the hero. */}
                  <div className="mt-4">
                    <EditableBrief loop={loop} />
                  </div>

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
                      {(loopCopy(loop.loopMode ?? "people", { autoSendMode: loop.autoSendMode })
                        .pauseReason as Record<string, string>)[loop.pauseReason] ||
                        `Paused — ${String(loop.pauseReason).replace(/_/g, " ")}.`}
                    </div>
                  )}

                  {/* Last-cycle error banner. The cycle crashes in a worker
                      thread/process after the API has already returned 200,
                      so the runNow toast never fires for the real failure.
                      Persistent banner makes the silent state visible and
                      gives a one-click retry. Cleared automatically on the
                      next clean cycle (loop_jobs writes DELETE_FIELD), or
                      manually via Dismiss. */}
                  {loop.lastCycleError && (
                    <div
                      className="mt-5 rounded-lg p-3.5 text-[13px] leading-snug flex items-start gap-3"
                      style={{
                        background: "#fef2f2",
                        color: "#991b1b",
                        border: "1px solid #fecaca",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, marginBottom: 3 }}>
                          Last cycle failed.
                        </div>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 11.5,
                            color: "#7f1d1d",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {loop.lastCycleError}
                        </div>
                      </div>
                      <button
                        onClick={() =>
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
                        disabled={runNowMut.isPending}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: "#991b1b", color: "white" }}
                      >
                        {runNowMut.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCw className="h-3 w-3" />
                        )}
                        Try again
                      </button>
                      <button
                        onClick={() =>
                          updateMut.mutateAsync({
                            loopId: loop.id,
                            patch: { lastCycleError: null },
                          })
                        }
                        disabled={updateMut.isPending}
                        className="text-[12px] underline underline-offset-2 transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ color: "#7f1d1d" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Secondary actions row (Run-it-now / Remove) */}
                  <div className="flex items-center gap-2 mt-5 flex-wrap">
                    {loop.status === "running" && (() => {
                      // Mirror the backend's STALE_LOCK_AFTER_MINUTES (30 min,
                      // loop_service.py:190). If the lock has been held longer
                      // than that, the worker's try_claim_cycle_lock will
                      // reclaim it on the next enqueue — so we should let the
                      // user click Run it now and trust the backend to recover.
                      // Without this guard, a single crashed cycle strands the
                      // Loop until either the scheduler ticks (up to an hour
                      // away) or nextRunAt fires (could be 48+ hours away).
                      const STALE_LOCK_MIN = 30;
                      const startedAt = loop.cycleStartedAt
                        ? Date.parse(loop.cycleStartedAt)
                        : NaN;
                      const lockAgeMin = Number.isFinite(startedAt)
                        ? (Date.now() - startedAt) / 60000
                        : Infinity;
                      const lockIsStale = lockAgeMin > STALE_LOCK_MIN;
                      const cycleInFlight = !!loop.cycleRunning && !lockIsStale;
                      const disabled = runNowMut.isPending || cycleInFlight;
                      // When the lock is stale, surface the recovery affordance
                      // clearly — "Recover & run" reads as user-initiated repair
                      // rather than a normal manual trigger.
                      const label = cycleInFlight
                        ? "Cycle running…"
                        : lockIsStale && !!loop.cycleRunning
                          ? "Recover & run"
                          : "Run it now";
                      const showSpinner = runNowMut.isPending || cycleInFlight;
                      return (
                        <button
                          onClick={() =>
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
                          disabled={disabled}
                          title={
                            cycleInFlight
                              ? "A cycle is already running for this Loop."
                              : lockIsStale && !!loop.cycleRunning
                                ? `The last cycle's lock is ${Math.round(lockAgeMin)} min old — likely a stuck flag from a prior crash. Click to reclaim and run a fresh cycle.`
                                : undefined
                          }
                          className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ background: "var(--ink)", color: "white" }}
                        >
                          {showSpinner ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCw className="h-3.5 w-3.5" />
                          )}
                          {label}
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => {
                        if (
                          !confirm(
                            "Remove this Loop? Drafts already created will stay in your tracker."
                          )
                        )
                          return;
                        deleteMut.mutateAsync(loop.id).then(() => {
                          toast({ title: LOOP_COPY.toasts.loopDeleted });
                          navigate("/agent");
                        });
                      }}
                      disabled={deleteMut.isPending}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-[12.5px] transition-colors hover:bg-[var(--paper-2)] disabled:opacity-50"
                      style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>

                  <div className="mt-8">
                    <Funnel loop={loop} />
                  </div>

                  <EmailsSection items={partitioned.drafts} loop={loop} />
                  <RepliesSection loop={loop} />
                  <DiscoveredRow
                    companies={partitioned.companies}
                    jobs={partitioned.jobs}
                  />
                </>
              )}
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

function LoopHero({
  loop,
  items,
  onPause,
  onResume,
  onStart,
  busy,
}: {
  loop: Loop;
  items: LoopActivityItem[];
  onPause: () => void;
  onResume: () => void;
  onStart: () => void;
  busy: { start: boolean; pause: boolean; resume: boolean };
}) {
  const isErrored = !!loop.lastCycleError;
  // status drives the underlying state machine, but the user-facing phase
  // also pulls in lastCycleError so a crashed Loop reads as "Errored"
  // instead of the ambiguous "idle" it ends up in after a generic crash.
  const isRunning = loop.status === "running" && !isErrored;
  const isPaused = loop.status === "paused" && !isErrored;
  // Autopilot loops finish a cycle in "done" — treat them the same as
  // "idle" for hero-button purposes so the user can re-run from here.
  // Without this, a completed autopilot Loop shows no Start button at all.
  const isIdle =
    !isErrored && (loop.status === "idle" || loop.status === "done");

  // Narration cycles through the last few activity items, formatted as
  // short past-tense lines. Falls back to a steady message when nothing
  // has happened yet.
  const narrationLines = useMemo(() => {
    if (items.length === 0) {
      if (isRunning) return ["Watching for replies and new finds…"];
      if (isPaused) return ["Paused — right where you left off."];
      return ["Ready when you are."];
    }
    return items.slice(0, 5).map((it) => `${TYPE_LABEL[it.type]} · ${it.title}`);
  }, [items, isRunning, isPaused]);

  const [line, lineIndex] = useCycle(narrationLines, 2600);

  const statusKicker = isErrored
    ? `Loop ${loop.shortCode} · cycle failed`
    : isRunning
      ? `Loop ${loop.shortCode} · live now`
      : isPaused
        ? `Loop ${loop.shortCode} · paused`
        : isIdle
          ? `Loop ${loop.shortCode} · ready`
          : `Loop ${loop.shortCode}`;

  // Cadence / last-fired / next-fire line. Surfaces data the user previously
  // had no way to see (nextRunAt, lastRunAt, cadence all live in Firestore
  // but were never rendered). Shape changes per status:
  //   running, manual cadence → "Cadence: manual · Last fired Xh ago"
  //   running                 → "Cadence: every other day · Last fired Xh ago · Next in Yh"
  //   paused                  → "Paused · {reason short label} · Last fired Xh ago"
  //   idle                    → null (no useful timestamps yet)
  let rhythmLine: string | null = null;
  if (isRunning) {
    const parts = [`Cadence: ${cadenceLabel(loop.cadence)}`];
    if (loop.lastRunAt) parts.push(`Last fired ${relativeTimeBidi(loop.lastRunAt)}`);
    if (loop.cadence !== "manual" && loop.nextRunAt) {
      parts.push(`Next ${relativeTimeBidi(loop.nextRunAt)}`);
    }
    rhythmLine = parts.join(" · ");
  } else if (isPaused) {
    const parts = [`Paused · ${pauseReasonLabel(loop.pauseReason)}`];
    if (loop.lastRunAt) parts.push(`Last fired ${relativeTimeBidi(loop.lastRunAt)}`);
    rhythmLine = parts.join(" · ");
  }

  const dayCount = daysRunning(loop.createdAt);
  const startLabel = startedLabel(loop.createdAt);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 20,
        overflow: "hidden",
        border: "1px solid var(--line)",
        background: "#fff",
        boxShadow: "var(--shadow-md)",
        display: "flex",
        alignItems: "stretch",
      }}
    >
      {/* Mascot lane */}
      <div
        style={{
          position: "relative",
          width: 220,
          flexShrink: 0,
          background: "linear-gradient(180deg,#F7F8FB,#EEF1F9)",
          borderRight: "1px solid var(--line-2)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* dotted trail */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(var(--primary-200) 1.3px, transparent 1.3px)",
            backgroundSize: "20px 20px",
            opacity: 0.5,
            maskImage: "linear-gradient(180deg,transparent,#000 40%,transparent)",
            WebkitMaskImage: "linear-gradient(180deg,transparent,#000 40%,transparent)",
          }}
        />
        {/* speed-lines (only while running) */}
        {isRunning &&
          [150, 168, 186].map((y, k) => (
            <span
              key={y}
              className="loop-anim"
              style={{
                position: "absolute",
                left: 26,
                top: y,
                width: 30,
                height: 2.5,
                borderRadius: 2,
                background: "var(--primary-200)",
                animation: "rSpeed 0.7s ease-in infinite",
                animationDelay: k * 0.12 + "s",
              }}
            />
          ))}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <img
            src={ScoutYetiFull}
            alt=""
            className={isRunning ? "loop-anim" : undefined}
            style={{
              width: 140,
              objectFit: "contain",
              animation: isRunning ? "rBob 2.6s ease-in-out infinite" : undefined,
              filter: "drop-shadow(0 10px 16px rgba(30,45,77,.16))",
              opacity: isIdle ? 0.85 : 1,
            }}
          />
          {isRunning && (
            <div
              className="loop-anim"
              style={{
                width: 84,
                height: 12,
                borderRadius: "50%",
                background: "var(--heading)",
                marginTop: 4,
                filter: "blur(3px)",
                animation: "rBobShadow 2.6s ease-in-out infinite",
              }}
            />
          )}
        </div>
      </div>

      {/* Copy */}
      <div style={{ flex: 1, minWidth: 0, padding: "30px 34px 26px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          <span
            className={isRunning ? "loop-anim" : undefined}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: isErrored
                ? "#dc2626"
                : isRunning
                  ? "var(--action-fg)"
                  : isPaused
                    ? "var(--signal-wait)"
                    : "var(--ink-3)",
              animation: isRunning ? "rLivePulse 1.8s ease-out infinite" : undefined,
            }}
          />
          {statusKicker}
        </div>
        {rhythmLine && (
          <div
            style={{
              marginTop: 6,
              fontFamily: MONO,
              fontSize: 11.5,
              letterSpacing: "0.04em",
              color: "var(--ink-3)",
            }}
          >
            {rhythmLine}
          </div>
        )}
        <h1
          style={{
            margin: "12px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            fontSize: 40,
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
            color: "var(--heading)",
          }}
        >
          {isErrored ? (
            <>
              Stuck — <em style={{ fontStyle: "italic", color: "#dc2626" }}>let's look at it.</em>
            </>
          ) : isRunning ? (
            <>
              Out there working <em style={{ fontStyle: "italic", color: "var(--accent)" }}>for you.</em>
            </>
          ) : isPaused ? (
            <>
              Paused — <em style={{ fontStyle: "italic", color: "var(--accent)" }}>right where you left off.</em>
            </>
          ) : (
            <>
              Ready <em style={{ fontStyle: "italic", color: "var(--accent)" }}>when you are.</em>
            </>
          )}
        </h1>

        {/* Live narration row (spinner only when running) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, height: 22 }}>
          {isRunning && <Spinner />}
          <span
            key={lineIndex}
            className="loop-anim"
            style={{
              fontFamily: MONO,
              fontSize: 13,
              color: "var(--ink-2)",
              animation: "rFadeUp 0.5s " + EASE + " both",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {line}
          </span>
        </div>

        {/* Action row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 22,
            paddingTop: 20,
            borderTop: "1px solid var(--line-2)",
          }}
        >
          {isRunning && (
            <button
              onClick={onPause}
              disabled={busy.pause}
              className="inline-flex items-center gap-2 rounded-[10px] border bg-white px-4 py-2.5 text-[13.5px] font-semibold transition-colors hover:bg-[var(--paper-2)] disabled:opacity-50"
              style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
            >
              <Pause className="h-3.5 w-3.5" /> Pause loop
            </button>
          )}
          {isPaused && (
            <button
              onClick={onResume}
              disabled={busy.resume}
              className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              <Play className="h-3.5 w-3.5" /> Wake it up
            </button>
          )}
          {isIdle && (
            <button
              onClick={onStart}
              disabled={busy.start}
              className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              <Play className="h-3.5 w-3.5" /> Start it
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--ink-3)" }}>
            Started {startLabel} · day {dayCount}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Funnel — single source of truth for the numbers ─────────────────────────

function Funnel({ loop }: { loop: Loop }) {
  // Prefer live stats (counted from actual contact records) over the stored
  // totalContactsFound / totalEmailsDrafted counters, which drift — observed
  // over-counting 33 vs 6 real, and under-counting 0 vs 2 real. Fall back to
  // the counters only if the server didn't attach liveStats.
  const ls = loop.liveStats;
  // Honest middle-step label: a review-first Loop only DRAFTS (nothing leaves
  // the user's outbox until they approve), so calling it "Sent"/"Emailed" would
  // claim we emailed on their behalf. Only autopilot ("send_for_me") sends.
  const emailedLabel = loop.autoSendMode === "send_for_me" ? "Sent" : "Drafted";
  const steps = [
    {
      Icon: Users,
      label: "Found",
      n: ls?.found ?? loop.totalContactsFound,
      tone: "var(--accent)",
    },
    {
      Icon: Mail,
      label: emailedLabel,
      n: ls?.emailed ?? loop.totalEmailsDrafted,
      tone: "var(--accent)",
    },
    {
      Icon: Reply,
      label: "Replied",
      n: ls?.replied ?? loop.totalRepliesReceived,
      tone: "var(--action-fg)",
    },
    // "Calls booked" intentionally removed 2026-06-14 — no detection logic
    // exists yet. Re-add as a 4th step once Gmail/Calendar tracking ships;
    // remember to flip the grid template back to 4-step.
  ];
  return (
    <div>
      {/* Timeframe label — these are lifetime totals for the Loop, distinct
          from the weekly "3 found · 5/wk" pace on the fleet card. Without it,
          "Found 32" here reads as a contradiction of the card's weekly count. */}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          marginBottom: 9,
        }}
      >
        All-time · since this Loop started
      </div>
    <div
      style={{
        display: "grid",
        // 3-step funnel: Found · Emailed · Replied. "Calls booked" deferred.
        gridTemplateColumns: "1fr auto 1fr auto 1fr",
        alignItems: "center",
        border: "1px solid var(--line)",
        borderRadius: 16,
        background: "#fff",
        padding: "20px 24px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: "contents" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background:
                    s.tone === "var(--accent)"
                      ? "rgba(74,96,168,0.08)"
                      : "rgba(224,122,62,0.08)",
                  color: s.tone,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <s.Icon size={15} style={{ color: s.tone }} />
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 34,
                  fontWeight: 500,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--heading)",
                }}
              >
                {s.n}
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 500, paddingLeft: 1 }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ padding: "0 18px" }}>
              <ArrowRight size={18} style={{ color: "var(--line)" }} />
            </div>
          )}
        </div>
      ))}
    </div>
    </div>
  );
}

// ── Section header (kicker hairline + serif title) ──────────────────────────

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
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}
      >
        <span style={{ width: 16, height: 1, background: "var(--ink-3)" }} />
        {kicker}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 9,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            fontSize: 24,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            color: "var(--heading)",
          }}
        >
          {title}
          {italic && (
            <em style={{ fontStyle: "italic", color: "var(--accent)" }}> {italic}</em>
          )}
        </h3>
        {right}
      </div>
    </div>
  );
}

// ── Emails section — numbered editorial rows ────────────────────────────────

function EmailsSection({ items, loop }: { items: LoopActivityItem[]; loop: Loop }) {
  const copy = loopCopy(loop.loopMode ?? "people", { autoSendMode: loop.autoSendMode });
  // Long lists collapse to the first 5 to keep the page scannable. The
  // "Show N more" toggle reveals the rest in one click.
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_CAP = 5;
  const overflow = Math.max(0, items.length - COLLAPSED_CAP);
  const shown = expanded || overflow === 0 ? items : items.slice(0, COLLAPSED_CAP);
  return (
    <div style={{ marginTop: 36 }}>
      <SectionHead
        // Use the mode-aware kicker so it always pairs with the title below.
        // Previously hardcoded "01 · Already out the door", which contradicted
        // the draft/approve-mode titles ("Drafts ready for review." /
        // "Holds waiting your call.") — same section claiming both "sent" and
        // "not sent". loopCopy pairs each kicker with its title per mode.
        kicker={copy.overview.mailKicker}
        title={copy.overview.mailTitle}
        italic={copy.overview.mailItalic}
        right={
          // Live counts so this header agrees with the funnel above, instead
          // of the drift-prone totalEmailsDrafted counter. "emailed" mirrors
          // the funnel label (an email exists — drafted or sent).
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--ink-3)" }}>
            {loop.liveStats?.emailed ?? loop.totalEmailsDrafted}{" "}
            {loop.autoSendMode === "send_for_me" ? "sent" : "drafted"} ·{" "}
            {loop.liveStats?.replied ?? loop.totalRepliesReceived} replied
          </span>
        }
      />
      {items.length === 0 ? (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 16,
            background: "#fff",
            padding: "22px 24px",
            color: "var(--ink-3)",
            fontStyle: "italic",
            fontSize: 13,
            textAlign: "center",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {copy.overview.mailEmpty}
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 16,
            background: "#fff",
            padding: "6px 18px",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {shown.map((it, i) => (
            <EmailRow
              key={it.id}
              item={it}
              index={i + 1}
              last={i === shown.length - 1 && overflow === 0}
            />
          ))}
          {overflow > 0 && (
            <CollapseToggle
              expanded={expanded}
              hiddenCount={overflow}
              onToggle={() => setExpanded((e) => !e)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Collapse toggle row used at the bottom of long numbered lists (emails,
// found-not-emailed contacts). Sits inside the same card border so it reads
// as part of the list.
function CollapseToggle({
  expanded,
  hiddenCount,
  onToggle,
}: {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        all: "unset",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: "100%",
        padding: "14px 0",
        borderTop: "1px solid var(--line-2)",
        cursor: "pointer",
        fontFamily: MONO,
        fontSize: 12,
        color: "var(--ink-2)",
        transition: "color 0.15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-2)")}
    >
      {expanded ? "Show less" : `Show ${hiddenCount} more`}
      <ChevronDown
        className="h-3.5 w-3.5"
        style={{
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s ease",
        }}
      />
    </button>
  );
}

// Small bordered-pill action button used on the email/contact cards. Mirrors
function EmailRow({
  item,
  index,
  last,
}: {
  item: LoopActivityItem;
  index: number;
  last: boolean;
}) {
  // The row's leading slot is the contact's display name; the email
  // address sits underneath in monospace. Two explicit action buttons
  // on the right send the user to either the actual Gmail draft/thread
  // or to that contact's row in /my-network/people — the whole-row
  // click target is gone so the two destinations are unambiguous.
  const name = titleCaseName(item.contactName || item.title);
  const email = item.email || item.subtitle || "";
  const draftHref = item.linkTo;
  const draftExternal = !!item.external;
  const networkHref = item.contactId
    ? `/my-network/people?contact=${encodeURIComponent(item.contactId)}`
    : "/my-network/people";

  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "center",
        padding: "16px 14px",
        margin: "0 -10px",
        borderRadius: 10,
        borderBottom: last ? "none" : "1px solid var(--line-2)",
        transition: "background-color .15s ease",
      }}
      className="hover:bg-[var(--paper-2)]"
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          color: "var(--ink-3)",
          width: 30,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.3,
          flexShrink: 0,
        }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 3,
            minWidth: 0,
          }}
        >
          <StateDot state={item.state} />
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {name}
          </span>
        </div>
        {email && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Mail size={12} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: "var(--ink-3)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {email}
            </span>
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <EmailRowButton
          icon={<Mail size={13} />}
          label={
            item.state === "sent" || item.state === "replied" ? "Thread" : "Email Draft"
          }
          href={draftHref}
          external={draftExternal}
          variant="primary"
        />
        <EmailRowButton
          icon={<UserRound size={13} />}
          label="Contact"
          href={networkHref}
          external={false}
          variant="ghost"
        />
        <span
          style={{
            fontSize: 11,
            color: "var(--ink-3)",
            marginLeft: 4,
            minWidth: 44,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {relativeTime(item.createdAt)}
        </span>
      </div>
    </div>
  );
}

function StateDot({ state }: { state?: "drafted" | "sent" | "replied" }) {
  // Per-row phase chip on draft list rows. Replaces the old hardcoded "SENT"
  // stamp — drives off the backend-computed state field, so a row reads as
  // Drafted / Sent / Replied based on the live contact doc.
  const meta =
    state === "replied"
      ? { dot: "#16a34a", label: "Replied", fg: "#15803d", bg: "rgba(22,163,74,0.10)" }
      : state === "sent"
        ? { dot: "var(--ink-3)", label: "Sent", fg: "var(--ink-2)", bg: "rgba(91,119,153,0.08)" }
        : { dot: "var(--accent)", label: "Drafted", fg: "var(--accent)", bg: "rgba(224,122,62,0.10)" };
  return (
    <span
      title={meta.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 7px 2px 6px",
        borderRadius: 999,
        background: meta.bg,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: meta.dot,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: meta.fg,
        }}
      >
        {meta.label}
      </span>
    </span>
  );
}

function EmailRowButton({
  icon,
  label,
  href,
  external,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  external: boolean;
  variant: "primary" | "ghost";
}) {
  const isPrimary = variant === "primary";
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    border: "1px solid",
    borderColor: isPrimary ? "var(--ink)" : "var(--line)",
    background: isPrimary ? "var(--ink)" : "#fff",
    color: isPrimary ? "#fff" : "var(--ink-2)",
    transition: "opacity .15s ease, background-color .15s ease",
  };
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={stop}
        style={style}
        className={isPrimary ? "hover:opacity-90" : "hover:bg-[var(--paper-2)]"}
      >
        {icon}
        {label}
      </a>
    );
  }
  return (
    <Link
      to={href}
      onClick={stop}
      style={style}
      className={isPrimary ? "hover:opacity-90" : "hover:bg-[var(--paper-2)]"}
    >
      {icon}
      {label}
    </Link>
  );
}

// ── Replies — the per-reply preview list is in the tracker; surface a
//    headline card here that mirrors the design's quiet treatment. ─────────

function RepliesSection({ loop }: { loop: Loop }) {
  const unread = loop.unreadReplies;
  const total = loop.totalRepliesReceived;
  return (
    <div style={{ marginTop: 38 }}>
      <SectionHead kicker="Waiting on you" title="Replies" italic="that landed." />
      {total === 0 ? (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 14,
            background: "#fff",
            padding: 18,
            boxShadow: "var(--shadow-sm)",
            color: "var(--ink-3)",
            fontStyle: "italic",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          All caught up — no replies yet.
        </div>
      ) : (
        <Link
          to="/tracker"
          style={{
            display: "block",
            border: "1px solid var(--line)",
            borderRadius: 14,
            background: "#fff",
            padding: 18,
            boxShadow: "var(--shadow-sm)",
            borderLeft: "3px solid var(--action-fg)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 36,
                lineHeight: 1,
                color: "var(--heading)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {unread}
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
              unread {unread === 1 ? "reply" : "replies"} · {total} total
            </span>
          </div>
          <div
            style={{
              marginTop: 11,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--accent)",
            }}
          >
            Open in tracker <ArrowRight size={14} />
          </div>
        </Link>
      )}
    </div>
  );
}

// ── Discovered along the way (Option 2 — collapsed, expandable) ─────────────

// Copy for the "we widened your search" chip rendered on L1/L2/L3 job rows.
// Returns null at L0 so the chip is skipped on exact-match results.
function broadenChipCopy(j: LoopActivityItem): string | null {
  const level = j.broadenLevel;
  if (!level || level <= 0) return null;
  const role = j.originalRole || "your role";
  const company = j.targetCompany || "your target";
  const wider = j.widerLocation || "a wider area";
  if (level === 1) return `closely related to ${role}`;
  if (level === 2) return `adjacent to your brief — ${role} at ${company}`;
  if (level === 3) return `widened to ${wider}`;
  return null;
}

function DiscoveredRow({
  companies,
  jobs,
}: {
  companies: LoopActivityItem[];
  jobs: LoopActivityItem[];
}) {
  const [open, setOpen] = useState(false);
  const [hov, setHov] = useState(false);
  const nCo = companies.length;
  const nJobs = jobs.length;

  // Empty discovery → don't surface the row at all. No teaser to expand
  // means no value to expose.
  if (nCo === 0 && nJobs === 0) return null;

  const preview = companies.slice(0, 4);

  return (
    <div style={{ marginTop: 34 }}>
      <div
        style={{
          borderRadius: 16,
          overflow: "hidden",
          background: "#fff",
          border: "1px solid " + (open || hov ? "var(--primary-200)" : "var(--line)"),
          boxShadow: hov && !open ? "var(--shadow-md)" : "var(--shadow-sm)",
          transform: hov && !open ? "translateY(-2px)" : "none",
          transition: `box-shadow .25s ${EASE}, border-color .25s, transform .25s ${EASE}`,
        }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          aria-expanded={open}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "16px 20px",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "var(--font-body)",
            background: open
              ? "#fff"
              : "linear-gradient(100deg,#FFFFFF 0%, var(--primary-50) 125%)",
            transition: "background .25s",
          }}
        >
          {/* Company-badge stack */}
          {preview.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              {preview.map((c, idx) => (
                <span
                  key={c.id}
                  style={{
                    marginLeft: idx ? -12 : 0,
                    zIndex: 10 - idx,
                    borderRadius: 10,
                    padding: 2.5,
                    background: "#fff",
                    boxShadow: "0 2px 5px rgba(30,45,77,.13)",
                  }}
                >
                  <CoBadge name={c.title} size={32} />
                </span>
              ))}
              {nCo > preview.length && (
                <span
                  style={{
                    marginLeft: -12,
                    width: 37,
                    height: 37,
                    borderRadius: 10,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "2.5px solid #fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12.5,
                    fontWeight: 700,
                    fontFamily: "var(--font-body)",
                    zIndex: 1,
                  }}
                >
                  +{nCo - preview.length}
                </span>
              )}
            </div>
          )}

          {/* Value line */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 6,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              <span style={{ width: 16, height: 1, background: "var(--primary-200)" }} />
              Discovered along the way
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 19,
                fontWeight: 500,
                color: "var(--heading)",
                letterSpacing: "-0.01em",
                lineHeight: 1.25,
              }}
            >
              {nJobs > 0 && nCo > 0 && (
                <>
                  <em style={{ fontStyle: "italic", color: "var(--accent)" }}>
                    {nJobs} {nJobs === 1 ? "role" : "roles"}
                  </em>{" "}
                  and{" "}
                  <em style={{ fontStyle: "italic", color: "var(--accent)" }}>
                    {nCo} new {nCo === 1 ? "company" : "companies"}
                  </em>
                </>
              )}
              {nJobs > 0 && nCo === 0 && (() => {
                const broadenedCount = jobs.filter(
                  (j) => (j.broadenLevel ?? 0) >= 1,
                ).length;
                if (broadenedCount > 0) {
                  return (
                    <em style={{ fontStyle: "italic", color: "var(--accent)" }}>
                      {nJobs} {nJobs === 1 ? "role" : "roles"} to explore — including{" "}
                      {broadenedCount} closely related
                    </em>
                  );
                }
                return (
                  <em style={{ fontStyle: "italic", color: "var(--accent)" }}>
                    {nJobs} {nJobs === 1 ? "role" : "roles"} to explore
                  </em>
                );
              })()}
              {nJobs === 0 && nCo > 0 && (
                <em style={{ fontStyle: "italic", color: "var(--accent)" }}>
                  {nCo} new {nCo === 1 ? "company" : "companies"}
                </em>
              )}
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                  fontWeight: 400,
                  color: "var(--ink-3)",
                }}
              >
                {" "}
                — worth a look.
              </span>
            </div>
          </div>

          {/* Show/Hide pill */}
          <span
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 999,
              background: open || hov ? "var(--accent)" : "#fff",
              color: open || hov ? "#fff" : "var(--accent)",
              border:
                "1px solid " + (open || hov ? "var(--accent)" : "var(--primary-200)"),
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              boxShadow: hov ? "0 4px 14px rgba(74,96,168,0.18)" : "none",
              transition: `background .2s ${EASE}, color .2s, border-color .2s`,
            }}
          >
            {open ? "Hide" : "Show all"}
            <span
              style={{
                display: "inline-flex",
                transition: `transform .25s ${EASE}`,
                transform: open ? "rotate(180deg)" : "none",
              }}
            >
              <ChevronDown size={15} />
            </span>
          </span>
        </button>

        {open && (
          <div
            className="loop-anim"
            style={{
              borderTop: "1px solid var(--line-2)",
              padding: "18px 22px 20px",
              display: "grid",
              gridTemplateColumns: nCo > 0 && nJobs > 0 ? "1fr 1fr" : "1fr",
              gap: 40,
              animation: `rFadeUp .4s ${EASE} both`,
            }}
          >
            {nCo > 0 && (
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                    marginBottom: 4,
                  }}
                >
                  Companies
                </div>
                <CompactList
                  items={companies}
                  renderRow={(c, _idx, last) => (
                    <Link
                      key={c.id}
                      to={c.linkTo}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "11px 4px",
                        borderBottom: last ? "none" : "1px solid var(--line-2)",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <CoBadge name={c.title} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                          {c.title}
                        </div>
                        {c.subtitle && (
                          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                            {c.subtitle}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        {relativeTime(c.createdAt)}
                      </span>
                    </Link>
                  )}
                />
              </div>
            )}
            {nJobs > 0 && (
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                    marginBottom: 4,
                  }}
                >
                  Roles
                </div>
                <CompactList
                  items={jobs}
                  renderRow={(j, _idx, last) => {
                    const linkProps = j.external
                      ? {
                          href: j.linkTo,
                          target: "_blank" as const,
                          rel: "noreferrer",
                        }
                      : null;
                    const content = (
                      <>
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: "var(--primary-100)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Briefcase size={14} style={{ color: "var(--accent)" }} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: "var(--ink)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {j.title}
                          </div>
                          {j.subtitle && (
                            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                              {j.subtitle}
                            </div>
                          )}
                          {(() => {
                            const copy = broadenChipCopy(j);
                            return copy ? (
                              <Badge
                                variant="secondary"
                                style={{
                                  marginTop: 4,
                                  fontSize: 10.5,
                                  fontWeight: 500,
                                  letterSpacing: "-0.005em",
                                }}
                              >
                                {copy}
                              </Badge>
                            ) : null;
                          })()}
                        </div>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          {relativeTime(j.createdAt)}
                        </span>
                      </>
                    );
                    const rowStyle = {
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "11px 4px",
                      borderBottom: last ? "none" : "1px solid var(--line-2)",
                      textDecoration: "none",
                      color: "inherit",
                    } as const;
                    return linkProps ? (
                      <a key={j.id} {...linkProps} style={rowStyle}>
                        {content}
                      </a>
                    ) : (
                      <Link key={j.id} to={j.linkTo} style={rowStyle}>
                        {content}
                      </Link>
                    );
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CompactList({
  items,
  renderRow,
}: {
  items: LoopActivityItem[];
  renderRow: (item: LoopActivityItem, index: number, last: boolean) => React.ReactNode;
}) {
  return <div>{items.map((it, i) => renderRow(it, i, i === items.length - 1))}</div>;
}

// ── Editable brief — preserved from prior design ────────────────────────────

const MAX_BRIEF_EDIT_CHARS = 2000;

function EditableBrief({ loop }: { loop: Loop }) {
  const { toast } = useToast();
  const update = useUpdateLoop();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(loop.briefText || "");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const hasUnsavedChanges = editing && draft !== (loop.briefText || "");
  const overLimit = draft.length > MAX_BRIEF_EDIT_CHARS;

  const startEdit = () => {
    setDraft(loop.briefText || "");
    setEditing(true);
    setSavedAt(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(loop.briefText || "");
  };

  const saveEdit = async () => {
    if (overLimit) return;
    const trimmed = draft.trim();
    if (trimmed === (loop.briefText || "").trim()) {
      setEditing(false);
      return;
    }
    try {
      await update.mutateAsync({
        loopId: loop.id,
        patch: { briefText: trimmed },
      });
      setEditing(false);
      setSavedAt(Date.now());
      toast({
        title: "Brief updated",
        description:
          "Applies to the next cycle. In-flight cycles finish with the old brief.",
      });
    } catch (err) {
      toast({
        title: "Couldn't save brief",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (editing) {
    return (
      <div
        className="pl-4 border-l-2"
        style={{ borderColor: "var(--accent)" }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          aria-label="Edit loop brief"
          className="font-serif italic text-[14px] leading-relaxed resize-none"
          style={{
            color: "var(--ink)",
            background: "var(--paper)",
            borderColor: overLimit ? "#b91c1c" : "var(--line)",
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            Saving applies to the <em className="italic">next</em> cycle. In-flight cycles
            finish with the current brief.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="font-mono text-[10px] tracking-wide"
              style={{ color: overLimit ? "#b91c1c" : "var(--ink-3)" }}
            >
              {draft.length} / {MAX_BRIEF_EDIT_CHARS}
            </span>
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={update.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveEdit}
              disabled={update.isPending || overLimit || !hasUnsavedChanges}
            >
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!loop.briefText) {
    return (
      <div className="pl-4 border-l-2" style={{ borderColor: "var(--line)" }}>
        <div className="text-[13px] italic" style={{ color: "var(--ink-3)" }}>
          No brief yet.{" "}
          <button
            onClick={startEdit}
            className="underline underline-offset-2 not-italic"
            style={{ color: "var(--ink-2)" }}
          >
            Add one
          </button>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="pl-4 border-l-2" style={{ borderColor: "var(--line)" }}>
      <blockquote
        className="text-[13.5px] italic leading-relaxed"
        style={{ color: "var(--ink-2)" }}
      >
        {loop.briefText}
      </blockquote>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          onClick={startEdit}
          className="font-mono text-[10.5px] uppercase tracking-wide underline-offset-4 hover:underline"
          style={{ color: "var(--ink-3)" }}
        >
          edit brief
        </button>
        {savedAt && (
          <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
            · applies on next cycle
          </span>
        )}
      </div>
    </div>
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
