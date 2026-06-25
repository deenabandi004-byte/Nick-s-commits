// NewLoopTile — the dashed "+ Start another Loop" card at the end of the grid.
//
// Two states:
//   - canCreate=true  → primary CTA opens the inline brief composer
//   - canCreate=false → muted state pushing the upgrade flow

import { Link } from "react-router-dom";
import { Plus, Lock, ArrowUpRight } from "lucide-react";
import { LOOP_COPY } from "@/lib/loopCopy";
import type { LoopLimits } from "@/services/loops";

export function NewLoopTile({
  limits,
  onCreate,
}: {
  limits: LoopLimits;
  onCreate: () => void;
}) {
  const canCreate = limits.canCreate;

  if (canCreate) {
    return (
      <button
        onClick={onCreate}
        className="group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-5 transition-colors hover:bg-[var(--paper-2)]"
        style={{
          borderColor: "var(--line)",
          color: "var(--ink-3)",
          minHeight: 200,
        }}
      >
        <span
          className="inline-flex items-center justify-center rounded-full w-10 h-10 transition-colors group-hover:bg-white"
          style={{
            background: "var(--paper-2)",
            color: "var(--ink-2)",
          }}
        >
          <Plus className="h-5 w-5" />
        </span>
        <div className="text-center">
          <div
            className="text-[14px] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--ink)" }}
          >
            {LOOP_COPY.newTile.titleAvailable}
          </div>
          <div className="text-[12.5px] mt-1">
            {LOOP_COPY.newTile.bodyAvailable}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border p-5"
      style={{
        borderColor: "var(--line)",
        background: "var(--paper-2)",
        color: "var(--ink-3)",
        minHeight: 200,
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full w-10 h-10"
        style={{ background: "white", color: "var(--ink-3)" }}
      >
        <Lock className="h-4 w-4" />
      </span>
      <div className="text-center px-2">
        <div
          className="text-[14px] font-semibold tracking-[-0.01em]"
          style={{ color: "var(--ink)" }}
        >
          {LOOP_COPY.newTile.titleAtCap}
        </div>
        <div className="text-[12.5px] mt-1 leading-snug">
          {LOOP_COPY.newTile.bodyAtCap(limits.cap)}
        </div>
      </div>
      <Link
        to="/pricing"
        className="inline-flex items-center gap-1 mt-1 rounded-md border bg-white px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--paper-2)]"
        style={{ borderColor: "var(--line)", color: "var(--ink)" }}
      >
        {LOOP_COPY.newTile.upgradeCta}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
