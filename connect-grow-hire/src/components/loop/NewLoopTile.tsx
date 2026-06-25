// NewLoopTile — the dashed "+ Start another Loop" card at the end of the grid.
//
// Editorial revision: stripped the two lightning-bolt quickstart chips
// (Sid: "dead AI giveaway"). The tile is now just a clean plus circle,
// a serif title with italic slate-blue accent, and a one-line tagline.
// At-cap state still routes to /pricing with the same affordance.

import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Plus, Lock, ArrowUpRight } from "lucide-react";
import { LOOP_COPY } from "@/lib/loopCopy";
import type { LoopLimits } from "@/services/loops";

const SETUP_ROUTE = "/agent/setup";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function NewLoopTile({
  limits,
  onCreate,
}: {
  limits: LoopLimits;
  onCreate?: () => void;
}) {
  const canCreate = limits.canCreate;
  const navigate = useNavigate();
  const [hov, setHov] = useState(false);

  if (!canCreate) {
    return (
      <div
        className="relative flex flex-col items-center justify-center text-center"
        style={{
          borderRadius: 20,
          border: "1.5px dashed var(--line)",
          background: "var(--paper-2)",
          color: "var(--ink-3)",
          padding: 26,
          minHeight: 200,
          gap: 14,
        }}
      >
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 52,
            height: 52,
            background: "#fff",
            color: "var(--ink-3)",
            border: "1px solid var(--line)",
          }}
        >
          <Lock className="h-4 w-4" />
        </span>
        <div>
          <h3
            className="font-serif"
            style={{
              margin: 0,
              fontWeight: 500,
              fontSize: 23,
              lineHeight: 1.15,
              letterSpacing: "-0.015em",
              color: "var(--heading)",
            }}
          >
            {LOOP_COPY.newTile.titleAtCap}
          </h3>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13.5,
              color: "var(--ink-3)",
              lineHeight: 1.5,
              maxWidth: 260,
            }}
          >
            {LOOP_COPY.newTile.bodyAtCap(limits.cap)}
          </p>
        </div>
        <Link
          to="/pricing"
          className="inline-flex items-center gap-1 rounded-md border bg-white px-3 py-1.5"
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            borderColor: "var(--line)",
            color: "var(--ink)",
          }}
        >
          {LOOP_COPY.newTile.upgradeCta}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const handlePrimary = () => {
    onCreate?.();
    navigate(SETUP_ROUTE);
  };

  return (
    <button
      onClick={handlePrimary}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex flex-col items-center justify-center text-center w-full"
      style={{
        borderRadius: 20,
        border: "1.5px dashed " + (hov ? "var(--primary-200)" : "var(--line)"),
        // Solid white so the card stays legible over the mountain backdrop.
        // Hover lifts to the soft primary tint.
        background: hov ? "var(--primary-50)" : "#ffffff",
        boxShadow: hov
          ? "0 6px 24px rgba(74,96,168,0.16)"
          : "0 1px 2px rgba(15,37,69,0.05), 0 6px 16px rgba(15,37,69,0.06)",
        padding: 26,
        minHeight: 200,
        cursor: "pointer",
        transition: `background .25s ${EASE}, border-color .25s, box-shadow .25s`,
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          background: "#fff",
          border: "1px solid var(--primary-200)",
          color: "var(--accent)",
          boxShadow: "var(--shadow-sm)",
          transform: hov ? "scale(1.06)" : "none",
          transition: `transform .25s ${EASE}`,
        }}
      >
        <Plus className="h-[22px] w-[22px]" strokeWidth={1.7} />
      </span>
      <h3
        className="font-serif"
        style={{
          margin: "18px 0 0",
          fontWeight: 500,
          fontSize: 23,
          lineHeight: 1.15,
          letterSpacing: "-0.015em",
          color: "var(--heading)",
        }}
      >
        Start another{" "}
        <em
          className="italic"
          style={{ color: "var(--accent)", fontWeight: 500 }}
        >
          Loop.
        </em>
      </h3>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 13.5,
          color: "var(--ink-3)",
          lineHeight: 1.5,
          maxWidth: 260,
        }}
      >
        Tell it who to chase — takes about a minute.
      </p>
    </button>
  );
}
