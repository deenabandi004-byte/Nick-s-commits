// LoopCard — one tile in the fleet grid.
//
// Visual goal: looks impressive at a glance, immediately readable. The eye lands
// on the title first, then the status pill (color), then the progress bar, then
// the primary action. No technical jargon visible anywhere.

import { Link } from "react-router-dom";
import { ArrowRight, Pause, Play } from "lucide-react";
import { LOOP_COPY } from "@/lib/loopCopy";
import type { Loop, LoopStatus } from "@/services/loops";
import { usePauseLoop, useResumeLoop, useStartLoop } from "@/hooks/useLoops";

const STATUS_META: Record<
  LoopStatus,
  { label: string; dot: string; bar: string; sub: string }
> = {
  running: {
    label: LOOP_COPY.card.statusRunning,
    dot: "#22c55e",
    bar: "#22c55e",
    sub: "#4b5567",
  },
  done: {
    label: LOOP_COPY.card.statusDone,
    dot: "#16a34a",
    bar: "#16a34a",
    sub: "#4b5567",
  },
  paused: {
    label: LOOP_COPY.card.statusPaused,
    dot: "#f59e0b",
    bar: "#cbd1dd",
    sub: "#8089a0",
  },
  idle: {
    label: LOOP_COPY.card.statusIdle,
    dot: "#b3b8c7",
    bar: "#cbd1dd",
    sub: "#8089a0",
  },
};

function relativeFromNow(iso: string | null): string {
  if (!iso) return "soon";
  const t = new Date(iso).getTime();
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff > 0 ? "in a moment" : "just now";
  const mins = Math.round(abs / 60_000);
  if (mins < 60) return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return diff > 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return diff > 0 ? `in ${days}d` : `${days}d ago`;
}

function StatusDot({ status }: { status: LoopStatus }) {
  const meta = STATUS_META[status];
  const animate = status === "running";
  return (
    <span className="relative inline-flex items-center" style={{ width: 8, height: 8 }}>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: meta.dot,
          animation: animate ? "om-pulse 1.6s ease-out infinite" : "none",
        }}
      />
    </span>
  );
}

function buildSubtitle(loop: Loop): string {
  const bp = loop.briefParsed;
  if (bp?.companies?.length) {
    return bp.companies.slice(0, 3).join(", ") + (bp.companies.length > 3 ? "…" : "");
  }
  if (bp?.industries?.length) return bp.industries.join(", ");
  if (loop.briefText) {
    const oneLine = loop.briefText.split("\n")[0];
    return oneLine.length > 60 ? oneLine.slice(0, 60) + "…" : oneLine;
  }
  return "No brief yet.";
}

function nextActionHint(loop: Loop): string {
  if (loop.status === "running") {
    return LOOP_COPY.card.nextRunIn(relativeFromNow(loop.nextRunAt));
  }
  if (loop.status === "done" && loop.lastSmsAt) {
    return LOOP_COPY.card.smsSentAt(relativeFromNow(loop.lastSmsAt));
  }
  if (loop.status === "paused") return LOOP_COPY.card.pausedHint;
  if (loop.status === "idle") return LOOP_COPY.card.idleHint;
  return "";
}

export function LoopCard({ loop }: { loop: Loop }) {
  const meta = STATUS_META[loop.status];
  const startMut = useStartLoop();
  const pauseMut = usePauseLoop();
  const resumeMut = useResumeLoop();

  const found = loop.totalContactsFound;
  const target = Math.max(1, loop.weeklyTarget);
  const pct = Math.min(100, Math.round((found / target) * 100));

  const primaryCta =
    loop.status === "done" && loop.pendingDrafts > 0
      ? LOOP_COPY.card.readEmailsCta
      : loop.status === "paused"
      ? LOOP_COPY.card.wakeCta
      : loop.status === "idle"
      ? LOOP_COPY.card.startCta
      : LOOP_COPY.card.openCta;

  const handleLifecycleClick = (e: React.MouseEvent) => {
    // Inline play/pause button stops the card click from firing.
    e.stopPropagation();
    e.preventDefault();
    if (loop.status === "running") pauseMut.mutate(loop.id);
    else if (loop.status === "paused") resumeMut.mutate(loop.id);
    else if (loop.status === "idle") startMut.mutate(loop.id);
  };

  const showLifecycleButton = loop.status !== "done";

  return (
    <Link
      to={`/agent/${loop.id}`}
      className="group relative flex flex-col gap-3 rounded-2xl border bg-white p-5 transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{
        borderColor: "var(--line)",
        minHeight: 200,
      }}
    >
      {/* Top row: status pill + lifecycle button */}
      <div className="flex items-center justify-between">
        <div
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11.5px] font-medium tracking-wide"
          style={{
            background: loop.status === "running" ? "#ecfdf5" : "var(--paper-2)",
            color: meta.sub,
          }}
        >
          <StatusDot status={loop.status} />
          {meta.label}
        </div>
        {showLifecycleButton && (
          <button
            onClick={handleLifecycleClick}
            disabled={pauseMut.isPending || resumeMut.isPending || startMut.isPending}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-md border px-2 py-1 text-[11px] flex items-center gap-1 bg-white hover:bg-[var(--paper-2)] disabled:opacity-50"
            style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
            aria-label={loop.status === "running" ? "Pause Loop" : "Start Loop"}
          >
            {loop.status === "running" ? (
              <>
                <Pause className="h-3 w-3" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3 w-3" /> {loop.status === "idle" ? "Start" : "Wake"}
              </>
            )}
          </button>
        )}
      </div>

      {/* Title + subtitle */}
      <div>
        <h3
          className="text-[17px] font-semibold tracking-[-0.01em] leading-tight"
          style={{ color: "var(--ink)" }}
        >
          {loop.name}
        </h3>
        <p
          className="mt-1 text-[12.5px] leading-snug line-clamp-2"
          style={{ color: "var(--ink-3)" }}
        >
          {buildSubtitle(loop)}
        </p>
      </div>

      {/* Progress */}
      <div>
        <div
          className="text-[11.5px] mb-1.5"
          style={{ color: "var(--ink-3)" }}
        >
          {LOOP_COPY.card.foundLabel(found, target)}
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--line-2)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: meta.bar,
            }}
          />
        </div>
      </div>

      {/* Phase 8 — pause-reason chip (only when paused with a reason). */}
      {loop.pauseReason && loop.pauseReason !== "quiet_hours" && (
        <div
          className="text-[11.5px] leading-snug rounded-md px-2 py-1.5"
          style={{
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
          }}
        >
          {LOOP_COPY.pauseReason[loop.pauseReason] || LOOP_COPY.pauseReason.paused}
        </div>
      )}

      {/* Phase 8 — weekly credit budget bar. */}
      <BudgetBar
        spent={loop.weekCreditsSpent || 0}
        cap={loop.creditBudgetPerWeek || 0}
      />

      {/* Footer: next-action hint + primary CTA */}
      <div className="mt-auto flex items-end justify-between gap-3">
        <span
          className="text-[12px] leading-snug"
          style={{ color: "var(--ink-3)" }}
        >
          {nextActionHint(loop)}
        </span>
        <span
          className="inline-flex items-center gap-1 text-[12.5px] font-medium whitespace-nowrap"
          style={{ color: "var(--ink)" }}
        >
          {primaryCta}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

// ── Phase 8 — weekly budget bar ──────────────────────────────────────────

function BudgetBar({ spent, cap }: { spent: number; cap: number }) {
  if (!cap) return null;
  const pct = Math.min(100, Math.round((spent / cap) * 100));
  // Color shifts as we approach the cap so users see the pressure.
  const barColor =
    pct >= 90 ? "var(--signal-neg)" : pct >= 70 ? "var(--signal-wait)" : "var(--ink-3)";
  return (
    <div title={LOOP_COPY.budget.tooltip}>
      <div
        className="text-[10.5px] mb-1 tabular-nums"
        style={{ color: "var(--ink-3)" }}
      >
        {LOOP_COPY.budget.label(spent, cap)}
      </div>
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: "var(--line-2)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}
