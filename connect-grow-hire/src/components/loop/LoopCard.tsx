// LoopCard — one tile in the fleet grid.
//
// Editorial revision ported from `Loops Overview.html`:
//   • Quiet dot+mono status tag (top-left).
//   • Overlapping company-badge stack (top-right) — pulled from briefParsed.
//   • Serif title with italic slate-blue accent on the second clause.
//   • ONE calm progress line ("X of Y found this week" + credits hint).
//   • Single CTA: "Open it" / "Wake it up" / "Start it" + animated arrow.
//   • Pause-reason chip preserved when non-default (legal/compliance info).

import { Link } from "react-router-dom";
import { useState } from "react";
import { ArrowRight, Pause, Play, Trash2 } from "lucide-react";
import { LOOP_COPY, cadenceLabel, loopCopy, pauseReasonLabel } from "@/lib/loopCopy";
import { relativeTime } from "@/lib/relativeTime";
import type { Loop, LoopStatus } from "@/services/loops";
import { useDeleteLoop, usePauseLoop, useResumeLoop, useStartLoop } from "@/hooks/useLoops";
import { getCompanyLogo } from "@/lib/companyLogos";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// ── Status chip (dot + mono small-caps) ─────────────────────────────────────

const STATUS_META: Record<
  LoopStatus,
  { label: string; color: string; ring: string }
> = {
  running: {
    label: "Live",
    color: "#2E7D32",
    ring: "rgba(46,125,50,0.18)",
  },
  done: {
    label: LOOP_COPY.card.statusDone,
    color: "var(--action-fg)",
    ring: "rgba(224,122,62,0.16)",
  },
  paused: {
    label: LOOP_COPY.card.statusPaused,
    color: "var(--action-fg)",
    ring: "rgba(224,122,62,0.16)",
  },
  idle: {
    label: "Not started",
    color: "var(--ink-3)",
    ring: "none",
  },
};

function StatusTag({ loop }: { loop: Loop }) {
  const status = loop.status;
  const s = STATUS_META[status];

  // Sub-label answers "when does this actually fire?" without making the
  // user open the detail page. Picked per status:
  //   running + cadence=manual → "manual — Run now"
  //   running + nextRunAt set  → "Next: in 4h" (or "tomorrow 9am", etc)
  //   paused                   → reason short-label ("weekly budget hit")
  //   idle / done              → none
  let sub: string | null = null;
  if (status === "running") {
    if (loop.cadence === "manual") sub = "manual · Run now to fire";
    else if (loop.nextRunAt) sub = `Next: ${relativeTime(loop.nextRunAt)}`;
    else sub = cadenceLabel(loop.cadence);
  } else if (status === "paused") {
    sub = pauseReasonLabel(loop.pauseReason);
  }

  return (
    <span className="inline-flex items-center" style={{ gap: 8 }}>
      <span
        className="rounded-full shrink-0"
        style={{
          width: 6,
          height: 6,
          background: s.color,
          boxShadow: s.ring !== "none" ? "0 0 0 3px " + s.ring : "none",
          animation:
            status === "running" ? "om-pulse 1.6s ease-out infinite" : "none",
        }}
      />
      <span
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: "var(--ink-3)",
        }}
      >
        {s.label}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: "0.06em",
            color: "var(--ink-3)",
            opacity: 0.75,
          }}
        >
          · {sub}
        </span>
      )}
    </span>
  );
}

// ── Company badge stack — overlapping initials in tinted squares ────────────

const COMPANY_TINTS: Record<string, string> = {
  Google: "#4285F4",
  Meta: "#0866FF",
  Facebook: "#0866FF",
  Amazon: "#FF9900",
  Apple: "#111827",
  Databricks: "#FF3621",
  Microsoft: "#00A4EF",
  Netflix: "#E50914",
  Stripe: "#635BFF",
  OpenAI: "#10A37F",
  Anthropic: "#D97757",
};

function CoBadge({ name, size = 28 }: { name: string; size?: number }) {
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
  const c = COMPANY_TINTS[name] || "#4A60A8";
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flexShrink: 0,
        background: c + "1a",
        color: c,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.42,
      }}
      title={name}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

function CoStack({ names, max = 3 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const extra = Math.max(0, names.length - shown.length);
  if (shown.length === 0) return null;
  return (
    <div className="flex items-center shrink-0">
      {shown.map((n, idx) => (
        <span
          key={n + idx}
          style={{
            marginLeft: idx ? -10 : 0,
            zIndex: 10 - idx,
            borderRadius: 10,
            padding: 2,
            background: "#fff",
            boxShadow: "0 2px 5px rgba(30,45,77,.12)",
          }}
        >
          <CoBadge name={n} size={28} />
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{
            marginLeft: -10,
            width: 33,
            height: 33,
            borderRadius: 10,
            background: "var(--accent)",
            color: "#fff",
            border: "2px solid #fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            zIndex: 1,
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function splitTitle(name: string): { lead: string; accent: string } {
  // Split a Loop name into a serif lead + italic slate-blue accent. If the
  // name reads as "Foo · Bar" or "Foo — Bar", lift the second clause; else
  // fall back to a quiet accent ("Loop").
  const sep = name.match(/^(.+?)\s*[·—-]\s*(.+)$/);
  if (sep) return { lead: sep[1].trim(), accent: sep[2].trim() };
  const space = name.lastIndexOf(" ");
  if (space > 8 && space < name.length - 1) {
    return {
      lead: name.slice(0, space).trim(),
      accent: name.slice(space + 1).trim(),
    };
  }
  return { lead: name, accent: "" };
}

function deriveCompanies(loop: Loop): { names: string[]; label: string } {
  const bp = loop.briefParsed;
  if (bp?.companies?.length) {
    const names = bp.companies.slice(0, 4);
    const more = bp.companies.length > 4 ? "…" : "";
    return {
      names,
      label: bp.companies.slice(0, 3).join(", ") + more,
    };
  }
  if (bp?.industries?.length) {
    return { names: bp.industries.slice(0, 3), label: bp.industries.join(", ") };
  }
  return { names: [], label: "" };
}

function ctaFor(loop: Loop, copy: ReturnType<typeof loopCopy>): string {
  if (loop.status === "done" && loop.pendingDrafts > 0) return copy.card.readEmailsCta;
  if (loop.status === "paused") return LOOP_COPY.card.wakeCta;
  if (loop.status === "idle") return LOOP_COPY.card.startCta;
  return LOOP_COPY.card.openCta;
}

// ── Card ────────────────────────────────────────────────────────────────────

export function LoopCard({ loop }: { loop: Loop }) {
  const [hov, setHov] = useState(false);
  const startMut = useStartLoop();
  const pauseMut = usePauseLoop();
  const resumeMut = useResumeLoop();
  const deleteMut = useDeleteLoop();

  // Weekly found (this ISO week) vs the weekly target — so the progress line
  // and bar speak the same cadence as the "/wk target" label and the fleet
  // command bar. Falls back to 0 if the server hasn't supplied the weekly
  // count (older payloads). Previously this used totalContactsFound (lifetime),
  // which pinned the bar at 100% on any established Loop.
  const found = loop.weekContactsFound ?? 0;
  // Cumulative all-time finds — context line, so a fresh week (weekly resets
  // every Monday) never looks like progress vanished.
  const allTime = loop.liveContactsFound ?? 0;
  // Drafts the Loop has written and is holding for the user to send — the
  // action-first hero. Live from contacts, never resets weekly.
  const drafts = loop.liveDraftsWaiting ?? 0;

  const credits = loop.weekCreditsSpent || 0;
  const creditCap = loop.creditBudgetPerWeek || 0;

  // "Momentum" fill — a feel of progress, not a strict metric. Blends this
  // week's spend (the Loop actively working) with cumulative output, floored
  // so an active Loop never reads as a dead empty bar and a busier Loop reads
  // fuller. Zero only for a Loop that's done literally nothing.
  const spendRatio = creditCap > 0 ? Math.min(1, credits / creditCap) : 0;
  const momentum =
    drafts > 0 || allTime > 0 || found > 0
      ? Math.round(
          Math.min(96, Math.max(12, 12 + spendRatio * 52 + Math.min(1, allTime / 10) * 34)),
        )
      : 0;

  const copy = loopCopy(loop.loopMode ?? "people", { autoSendMode: loop.autoSendMode });
  const cta = ctaFor(loop, copy);

  const { lead, accent } = splitTitle(loop.name);
  const { names: coNames, label: coLabel } = deriveCompanies(loop);

  const showLifecycleButton = loop.status !== "done";

  const handleLifecycleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (loop.status === "running") pauseMut.mutate(loop.id);
    else if (loop.status === "paused") resumeMut.mutate(loop.id);
    else if (loop.status === "idle") startMut.mutate(loop.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`Remove "${loop.name}"? Drafts already created stay in your tracker.`)) return;
    deleteMut.mutate(loop.id);
  };

  return (
    <Link
      to={`/agent/${loop.id}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="group relative flex flex-col"
      style={{
        borderRadius: 20,
        background: "#fff",
        border: "1px solid " + (hov ? "var(--primary-200)" : "var(--line)"),
        boxShadow: hov ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hov ? "translateY(-3px)" : "none",
        transition: `box-shadow .25s ${EASE}, border-color .25s, transform .25s ${EASE}`,
        padding: "26px 26px 24px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {/* Top row: status (left) + company stack (right) — with hover lifecycle
          buttons sitting on top of the badges. */}
      <div className="flex items-center justify-between" style={{ gap: 10 }}>
        <StatusTag loop={loop} />
        <div className="flex items-center gap-2">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
            {showLifecycleButton && (
              <button
                onClick={handleLifecycleClick}
                disabled={pauseMut.isPending || resumeMut.isPending || startMut.isPending}
                className="rounded-md border px-2 py-1 text-[11px] flex items-center gap-1 bg-white hover:bg-[var(--paper-2)] disabled:opacity-50"
                style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
                aria-label={loop.status === "running" ? "Pause Loop" : "Start Loop"}
              >
                {loop.status === "running" ? (
                  <>
                    <Pause className="h-3 w-3" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" />{" "}
                    {loop.status === "idle" ? "Start" : "Wake"}
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleDeleteClick}
              disabled={deleteMut.isPending}
              className="rounded-md border p-1.5 bg-white hover:bg-[#fef2f2] hover:border-[#fecaca] hover:text-[#b91c1c] disabled:opacity-50"
              style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
              aria-label={`Remove ${loop.name}`}
              title="Remove Loop"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <CoStack names={coNames} />
        </div>
      </div>

      {/* Title — serif lead + italic slate-blue accent. */}
      <h3
        className="font-serif"
        style={{
          margin: "20px 0 0",
          fontWeight: 500,
          fontSize: 25,
          lineHeight: 1.18,
          letterSpacing: "-0.018em",
          color: "var(--heading)",
        }}
      >
        {lead}
        {accent && (
          <>
            {" "}
            <em
              className="italic"
              style={{ color: "var(--accent)", fontWeight: 500 }}
            >
              {accent}
            </em>
          </>
        )}
      </h3>
      {coLabel && (
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            color: "var(--ink-3)",
          }}
        >
          {coLabel}
        </div>
      )}

      {/* Action-first progress. Lead with the backlog that needs the user
          (drafts to send — never resets weekly), then found context, then
          spend. No empty weekly bar to read as "no progress" on a fresh week. */}
      <div style={{ marginTop: 24 }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 5 }}>
          {drafts > 0 ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 14.5,
                fontWeight: 600,
                color: "var(--accent)",
              }}
            >
              {drafts} draft{drafts === 1 ? "" : "s"} ready to send
              <ArrowRight size={14} />
            </span>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)" }}>
              {allTime > 0 ? "All caught up" : "Warming up…"}
            </span>
          )}
          {creditCap > 0 && (
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {credits} / {creditCap} credits
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
          {allTime} found all-time · {found} new this week
        </div>
        {/* Momentum bar — visual progress, blended from real spend + output. */}
        <div
          style={{
            marginTop: 11,
            height: 5,
            borderRadius: 999,
            background: "var(--line-2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: momentum + "%",
              borderRadius: 999,
              background: "var(--accent)",
              transition: "width .6s cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>
      </div>

      {/* Pause-reason chip — only renders for non-default pause reasons
          (compliance / quiet-hours-with-context). Kept because it carries
          state information the user needs and the editorial tier doesn't
          convey it. */}
      {loop.pauseReason && loop.pauseReason !== "quiet_hours" && (
        <div
          style={{
            marginTop: 14,
            fontSize: 11.5,
            lineHeight: 1.4,
            borderRadius: 8,
            padding: "6px 10px",
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
          }}
        >
          {copy.pauseReason[loop.pauseReason] || copy.pauseReason.paused}
        </div>
      )}

      {/* CTA — sits at the foot, arrow nudges on hover. */}
      <div style={{ marginTop: 22 }}>
        <span
          className="inline-flex items-center"
          style={{
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--accent)",
            letterSpacing: "-0.01em",
          }}
        >
          {cta}
          <span
            className="inline-flex"
            style={{
              transition: `transform .25s ${EASE}`,
              transform: hov ? "translateX(4px)" : "none",
            }}
          >
            <ArrowRight className="h-4 w-4" />
          </span>
        </span>
      </div>
    </Link>
  );
}
