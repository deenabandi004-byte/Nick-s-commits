// LoopGrid — fleet view.
//
// Editorial revision (Loops Overview.html):
//   • Header: serif "Your Loops." + tagline + Scout companion on the right.
//   • The "X of Y" capacity counter is dropped — the enforcement still
//     lives on NewLoopTile (lock state) so we don't need to print it twice.
//   • Top-right "Start another Loop" button only shows when the grid is
//     already full of cards (i.e. NewLoopTile won't appear inline).

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { LOOP_COPY } from "@/lib/loopCopy";
import type { Loop, LoopLimits } from "@/services/loops";
import { LoopCard } from "./LoopCard";
import { LoopsCommandBar } from "./LoopsCommandBar";
import { NewLoopTile } from "./NewLoopTile";
import { ScoutGuide } from "./ScoutGuide";

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

  const newTileInGrid = visible.length < VISIBLE_LIMIT;

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 1040, padding: "44px 44px 80px" }}
    >
      {/* ── Editorial header strip ───────────────────────────────────── */}
      <div
        className="flex items-end justify-between flex-wrap"
        style={{ gap: 24, marginBottom: 28 }}
      >
        <div className="min-w-0">
          <h1
            className="font-serif"
            style={{
              margin: 0,
              fontWeight: 500,
              fontSize: 52,
              lineHeight: 1,
              letterSpacing: "-0.028em",
              color: "var(--heading)",
            }}
          >
            Your{" "}
            <em
              className="italic"
              style={{ color: "var(--accent)", fontWeight: 500 }}
            >
              Loops.
            </em>
          </h1>
          <p
            style={{
              margin: "14px 0 0",
              fontSize: 15.5,
              color: "var(--ink-3)",
              lineHeight: 1.5,
            }}
          >
            Walk away. We'll text you when there's something to look at.
          </p>
        </div>
        <ScoutGuide />
      </div>

      {/* ── Top-right "Start another Loop" — only when grid is full ── */}
      {!newTileInGrid && (
        <div className="flex justify-end" style={{ marginBottom: 16 }}>
          {limits.canCreate ? (
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-1.5"
              style={{
                background: "var(--accent)",
                color: "white",
                borderRadius: 10,
                padding: "10px 18px",
                fontSize: 13.5,
                fontWeight: 600,
                boxShadow: "0 2px 8px rgba(74,96,168,0.20)",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Start another Loop
            </button>
          ) : (
            <Link
              to="/pricing"
              className="rounded-md border bg-white"
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 500,
                borderColor: "var(--line)",
                color: "var(--ink)",
              }}
            >
              {LOOP_COPY.newTile.upgradeCta}
            </Link>
          )}
        </div>
      )}

      {/* ── Fleet command bar (proof + ticker) ── */}
      <LoopsCommandBar />

      {/* ── Grid (top 4) ── */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 20,
          marginTop: 24,
        }}
      >
        {visible.map((loop) => (
          <LoopCard key={loop.id} loop={loop} />
        ))}
        {newTileInGrid && <NewLoopTile limits={limits} onCreate={onCreate} />}
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
