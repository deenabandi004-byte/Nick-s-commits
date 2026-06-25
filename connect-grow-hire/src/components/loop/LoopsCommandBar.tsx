// LoopsCommandBar — fleet-wide proof + live ticker, sits above the grid.
//
// Editorial revision (ported from Loops Overview.html handoff):
//   • Sparkline removed per Sid's "get rid of the graph" feedback.
//   • Hard internal dividers replaced with breathing whitespace.
//   • Number style is editorial serif; labels are mono small-caps.
//   • Live ticker keeps its green pulse but reads quieter.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  useFleetFeed,
  useFleetWeeklySummary,
} from "@/hooks/useLoops";
import type { FleetFeedItem } from "@/services/loops";

const TICKER_INTERVAL_MS = 3200;
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function LoopsCommandBar() {
  const summaryQuery = useFleetWeeklySummary();
  const feedQuery = useFleetFeed(20);

  const summary = summaryQuery.data ?? {
    foundThisWeek: 0,
    weeklySparkline: [0, 0, 0, 0, 0, 0, 0],
    draftsWaiting: 0,
    weeklyGoal: 0,
    weeklyProgressPct: 0,
    activeLoopsCount: 0,
    weekStartedAt: "",
  };
  const items = feedQuery.data?.items ?? [];
  // The ring shows fleet *momentum*, not raw weekly progress (which sits at 0
  // every Monday). It blends this-week progress with the live draft backlog and
  // cumulative output, floored so an active fleet never reads as a dead ring.
  // The honest "{foundThisWeek}/{weeklyGoal}" count stays as the side label.
  const hasActivity =
    summary.draftsWaiting > 0 || (summary.foundAllTime ?? 0) > 0 || summary.foundThisWeek > 0;
  const goalPct = hasActivity
    ? Math.round(
        Math.min(
          97,
          Math.max(
            12,
            10 +
              summary.weeklyProgressPct * 0.4 +
              (summary.draftsWaiting > 0 ? 25 : 0) +
              Math.min(30, summary.foundAllTime ?? 0),
          ),
        ),
      )
    : 0;

  return (
    <div
      className="mb-[22px] rounded-[20px] border bg-white overflow-hidden"
      style={{
        borderColor: "var(--line-2)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Roll-up — found / drafts / weekly goal. No internal dividers; the
          whitespace and column rhythm separate them instead. */}
      <div
        className="flex items-center flex-wrap"
        style={{ gap: 48, padding: "24px 30px" }}
      >
        {/* Hero — what needs the user. Drafts to send never reset weekly, so
            the bar always leads with real, actionable progress instead of a
            "0 found this week" that reads as if nothing happened. */}
        <div className="flex-1" style={{ minWidth: 240 }}>
          <div className="flex items-baseline gap-3">
            <span
              className="font-serif"
              style={{
                fontSize: 46,
                fontWeight: 500,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: "var(--heading)",
              }}
            >
              {summary.draftsWaiting}
            </span>
            <span style={{ fontSize: 14, color: "var(--ink-2)", fontWeight: 500 }}>
              draft{summary.draftsWaiting === 1 ? "" : "s"} waiting on you
            </span>
          </div>
          {/* Context — cumulative finds, this-week momentum, fleet size. */}
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
            {summary.foundAllTime ?? 0} found
            {` · ${summary.foundThisWeek} this week`}
            {summary.activeLoopsCount > 0
              ? ` · across ${summary.activeLoopsCount} ${
                  summary.activeLoopsCount === 1 ? "Loop" : "Loops"
                }`
              : ""}
          </div>
        </div>

        {/* Weekly goal — ring + number */}
        <div className="flex items-center" style={{ gap: 14 }}>
          <GoalRing pct={goalPct} />
          <div>
            <div
              className="font-serif tabular-nums"
              style={{
                fontSize: 22,
                fontWeight: 500,
                lineHeight: 1,
                color: "var(--heading)",
              }}
            >
              {summary.foundThisWeek}
              <span style={{ fontSize: 15, color: "var(--ink-3)" }}>
                /{summary.weeklyGoal || 0}
              </span>
            </div>
            <div
              style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}
            >
              weekly goal
            </div>
          </div>
        </div>
      </div>

      <Ticker items={items} />
    </div>
  );
}

// ── Goal ring ──────────────────────────────────────────────────────────────

function GoalRing({ pct }: { pct: number }) {
  const size = 50;
  const stroke = 4;
  const r = (size - stroke - 2) / 2;
  const c = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDash(pct), 120);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (dash / 100) * c}
          style={{
            transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 600,
            color: "var(--ink-3)",
          }}
        >
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

// ── Live activity ticker ──────────────────────────────────────────────────

const KIND_COLOR: Record<FleetFeedItem["kind"], string> = {
  found: "#2E7D32",
  draft: "#E07A3E",
  job: "var(--ink-2)",
  company: "var(--ink-2)",
};

const KIND_LABEL: Record<FleetFeedItem["kind"], string> = {
  found: "Just found",
  draft: "Drafted",
  job: "Surfaced",
  company: "Spotted",
};

function Ticker({ items }: { items: FleetFeedItem[] }) {
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % items.length),
      TICKER_INTERVAL_MS
    );
    return () => clearInterval(t);
  }, [items.length]);

  const current = items[idx];

  return (
    <div
      className="flex items-center border-t"
      style={{
        gap: 14,
        padding: "13px 26px",
        borderColor: "var(--line-2)",
        background:
          "linear-gradient(100deg, #FCFDFE 0%, var(--primary-50) 160%)",
      }}
    >
      <span
        className="inline-flex items-center"
        style={{ gap: 8, flexShrink: 0 }}
      >
        <span
          className="relative inline-flex"
          style={{ width: 7, height: 7 }}
        >
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: "#2E7D32",
              animation: "om-pulse 2s ease-out infinite",
            }}
          />
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#2E7D32",
            fontWeight: 600,
          }}
        >
          Live
        </span>
      </span>
      <div
        className="flex-1 min-w-0 truncate"
        style={{ fontSize: 13, color: "var(--ink-2)" }}
      >
        {current ? (
          <TickerLine item={current} />
        ) : (
          <span style={{ color: "var(--ink-3)" }}>
            Your Loops will start filling this in as they run.
          </span>
        )}
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 shrink-0"
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--accent)",
        }}
        onClick={() => navigate("/tracker")}
      >
        View all
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function TickerLine({ item }: { item: FleetFeedItem }) {
  const hideRole = /sent|draft/i.test(item.who);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block rounded-full shrink-0"
        style={{ width: 6, height: 6, background: KIND_COLOR[item.kind] }}
      />
      <span className="truncate">
        <b style={{ fontWeight: 600, color: "var(--ink)" }}>
          {KIND_LABEL[item.kind]}
        </b>{" "}
        <span style={{ textTransform: "capitalize" }}>{item.who}</span>
        {hideRole || !item.role ? "" : ` — ${item.role}`}{" "}
        <span style={{ color: "var(--ink-3)" }}>· {item.when}</span>
      </span>
    </span>
  );
}
