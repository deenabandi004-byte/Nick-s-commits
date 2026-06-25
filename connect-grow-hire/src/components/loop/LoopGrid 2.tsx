// LoopGrid — fleet view. Top 4 Loops as large cards; the rest as compact rows.
//
// Sort order is meant to surface what needs the user's attention first:
//   1. Done with unread drafts/replies (the dopamine ones)
//   2. Running
//   3. Paused
//   4. Idle
//   5. Done (no unreads)
// Within each bucket, newer first.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { LOOP_COPY } from "@/lib/loopCopy";
import type { Loop, LoopLimits } from "@/services/loops";
import { LoopCard } from "./LoopCard";
import { NewLoopTile } from "./NewLoopTile";

const VISIBLE_LIMIT = 4;

function sortKey(loop: Loop): number {
  const hasUnread = loop.pendingDrafts > 0 || loop.unreadReplies > 0;
  if (loop.status === "done" && hasUnread) return 0;
  if (loop.status === "running") return 1;
  if (loop.status === "paused") return 2;
  if (loop.status === "idle") return 3;
  return 4; // done with no unreads
}

function sortLoops(loops: Loop[]): Loop[] {
  return [...loops].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    if (ka !== kb) return ka - kb;
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
}

export function LoopGrid({
  loops,
  limits,
  onCreate,
}: {
  loops: Loop[];
  limits: LoopLimits;
  onCreate: () => void;
}) {
  const sorted = useMemo(() => sortLoops(loops), [loops]);
  const visible = sorted.slice(0, VISIBLE_LIMIT);
  const overflow = sorted.slice(VISIBLE_LIMIT);
  const [showOverflow, setShowOverflow] = useState(false);

  // Whether to show the "+ New Loop" tile inside the grid. We always show it
  // when there's room visually (i.e. <4 visible Loops) so the call-to-action
  // doesn't disappear. If there are 4+ Loops, we move the New Loop button
  // up next to the header instead.
  const newTileInGrid = visible.length < VISIBLE_LIMIT;

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
      {/* ── Header strip ── */}
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1
            className="font-serif text-[34px] leading-tight tracking-[-0.02em]"
            style={{ color: "var(--ink)" }}
          >
            Your{" "}
            <em className="font-serif" style={{ fontWeight: 400 }}>
              Loops.
            </em>
          </h1>
          <p
            className="text-[13.5px] mt-1.5"
            style={{ color: "var(--ink-3)" }}
          >
            {LOOP_COPY.fleetSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-[12.5px] tabular-nums"
            style={{ color: "var(--ink-3)" }}
          >
            {limits.used} of {limits.cap}
          </span>
          {!newTileInGrid && limits.canCreate && (
            <button
              onClick={onCreate}
              className="rounded-md px-3.5 py-2 text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--ink)", color: "white" }}
            >
              + Start another Loop
            </button>
          )}
          {!newTileInGrid && !limits.canCreate && (
            <Link
              to="/pricing"
              className="rounded-md border bg-white px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--paper-2)]"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            >
              {LOOP_COPY.newTile.upgradeCta}
            </Link>
          )}
        </div>
      </div>

      {/* ── Grid (top 4) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
        {visible.map((loop) => (
          <LoopCard key={loop.id} loop={loop} />
        ))}
        {newTileInGrid && (
          <NewLoopTile limits={limits} onCreate={onCreate} />
        )}
      </div>

      {/* ── Overflow (compact rows) ── */}
      {overflow.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowOverflow((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
            style={{ color: "var(--ink-2)" }}
          >
            {showOverflow ? (
              <>
                Hide {overflow.length} more
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Show {overflow.length} more Loop{overflow.length === 1 ? "" : "s"}
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>

          {showOverflow && (
            <div
              className="mt-3 rounded-xl border bg-white overflow-hidden"
              style={{ borderColor: "var(--line)" }}
            >
              {overflow.map((loop, i) => (
                <CompactLoopRow
                  key={loop.id}
                  loop={loop}
                  last={i === overflow.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Compact row used in the overflow list ──────────────────────────────────

function CompactLoopRow({ loop, last }: { loop: Loop; last: boolean }) {
  const meta = {
    running: { dot: "#22c55e", label: LOOP_COPY.card.statusRunning },
    done: { dot: "#16a34a", label: LOOP_COPY.card.statusDone },
    paused: { dot: "#f59e0b", label: LOOP_COPY.card.statusPaused },
    idle: { dot: "#b3b8c7", label: LOOP_COPY.card.statusIdle },
  }[loop.status];

  return (
    <Link
      to={`/agent/${loop.id}`}
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--paper-2)]"
      style={{
        borderBottom: last ? "none" : "1px solid var(--line-2)",
      }}
    >
      <span
        className="inline-block rounded-full shrink-0"
        style={{
          width: 8,
          height: 8,
          background: meta.dot,
          animation:
            loop.status === "running" ? "om-pulse 1.6s ease-out infinite" : "none",
        }}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-[13.5px] font-medium tracking-[-0.01em] truncate"
          style={{ color: "var(--ink)" }}
        >
          {loop.name}
        </div>
        <div
          className="text-[12px] truncate"
          style={{ color: "var(--ink-3)" }}
        >
          {meta.label} · {loop.totalContactsFound} found
        </div>
      </div>
      <span
        className="text-[12px] shrink-0 hidden sm:inline"
        style={{ color: "var(--ink-3)" }}
      >
        Open →
      </span>
    </Link>
  );
}
