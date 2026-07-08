// Recommended Changes review panel (design handoff 2026-07-08).
//
// The AI proposes bullet rewrites; the user approves or rejects each edit
// individually (or "Approve remaining"), then commits the approved set via
// the docked apply bar. Approve/reject/undo are LOCAL state only — nothing
// touches the resume until Apply, which hands the approved ids to the parent
// (ResumePage's bulk apply + auto-rescore flow).
//
// Sits in the left column of the Resume page, directly under the live PDF
// preview, on both the Edit and Tailor tabs. The apply bar is sticky within
// the page scroll (not viewport-fixed) so it never overlaps the preview.
import { useMemo, useState } from "react";
import { Check, X, ArrowDown, Loader2 } from "lucide-react";
import type { ResumeScoreRecommendation } from "@/services/api";

type EditStatus = "pending" | "approved" | "rejected";

interface RecommendedChangesPanelProps {
  recommendations: ResumeScoreRecommendation[];
  /** One-line subtitle under the title, e.g. "Approve or reject each edit
      tailored to the Databricks posting, one at a time." */
  subtitle: string;
  /** Disables all controls (either score machine mid-flight, uploading…). */
  disabled: boolean;
  /** Apply-bar button label override while the parent commits ("Applying…",
      "Rescoring…"); null when idle. */
  busyLabel: string | null;
  onApply: (approvedIds: string[]) => void;
}

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Category tints. Impact & Keywords come from the handoff; the other two
// canonical rubric categories get in-system tints (status green, slate).
const CATEGORY_COLORS: Record<string, { fg: string; bg: string }> = {
  "Impact & Results": { fg: "#34457A", bg: "#E4E9F5" },
  "Keywords / ATS Readiness": { fg: "#C9652C", bg: "#FBE6D6" },
  "Clarity & Structure": { fg: "#2E7D32", bg: "#E8F5E9" },
  "Professional Presentation": { fg: "#475569", bg: "#EFF0F3" },
};

const FALLBACK_CAT = { fg: "#34457A", bg: "#E4E9F5" };

const STATUS_META: Record<EditStatus, { label: string; fg: string; bg: string }> = {
  pending: { label: "Pending", fg: "var(--ink-3, #64748B)", bg: "var(--paper-2, #F5F6F8)" },
  approved: { label: "Approved", fg: "#2E7D32", bg: "#E8F5E9" },
  rejected: { label: "Rejected", fg: "#B4553F", bg: "#FCF2F2" },
};

const RecommendedChangesPanel = ({
  recommendations,
  subtitle,
  disabled,
  busyLabel,
  onApply,
}: RecommendedChangesPanelProps) => {
  const [statuses, setStatuses] = useState<Record<string, EditStatus>>({});
  const [filter, setFilter] = useState<string>("All");

  // A fresh scoring run replaces the recommendations (new ids) — stale
  // entries in `statuses` simply stop matching, so every new rec starts
  // pending without an explicit reset. The parent also remounts the panel
  // via `key` on each run for full hygiene.
  const statusOf = (id: string): EditStatus => statuses[id] ?? "pending";

  const setStatus = (id: string, status: EditStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: status }));

  const approveRemaining = () =>
    setStatuses((prev) => {
      const next = { ...prev };
      for (const rec of recommendations) {
        if ((next[rec.id] ?? "pending") === "pending") next[rec.id] = "approved";
      }
      return next;
    });

  const { approvedIds, approvedCount, rejectedCount, pendingCount, progressPct } =
    useMemo(() => {
      const approved = recommendations.filter((r) => statusOf(r.id) === "approved");
      const rejected = recommendations.filter((r) => statusOf(r.id) === "rejected");
      const decided = approved.length + rejected.length;
      return {
        approvedIds: approved.map((r) => r.id),
        approvedCount: approved.length,
        rejectedCount: rejected.length,
        pendingCount: recommendations.length - decided,
        progressPct:
          recommendations.length === 0
            ? 0
            : Math.round((decided / recommendations.length) * 100),
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recommendations, statuses]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const rec of recommendations) {
      if (rec.category && !seen.includes(rec.category)) seen.push(rec.category);
    }
    return seen;
  }, [recommendations]);

  if (recommendations.length === 0) return null;

  const visible = recommendations.filter(
    (r) => filter === "All" || r.category === filter
  );

  const filterPills = ["All", ...categories].map((label) => {
    const active = filter === label;
    const c = label === "All" ? FALLBACK_CAT : CATEGORY_COLORS[label] ?? FALLBACK_CAT;
    const count =
      label === "All"
        ? recommendations.length
        : recommendations.filter((r) => r.category === label).length;
    return { label, active, c, count };
  });

  const total = recommendations.length;

  return (
    <div className="max-w-[820px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-5 flex-wrap mb-1">
        <div>
          <h2
            className="m-0"
            style={{
              fontFamily: "'Lora', 'Instrument Serif', Georgia, serif",
              fontWeight: 600,
              fontSize: 24,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: "var(--heading, #1E2D4D)",
            }}
          >
            Recommended{" "}
            <em style={{ fontStyle: "italic", color: "var(--accent, #4A60A8)" }}>
              changes
            </em>
          </h2>
          <p className="text-[13.5px] leading-[1.5] text-[#64748B] mt-1 mb-0 max-w-[540px]">
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || pendingCount === 0}
          onClick={approveRemaining}
          className="cursor-pointer select-none font-semibold text-[13px] px-3.5 py-2 rounded-[10px] border bg-white transition-all duration-200 hover:border-[#B6C3E8] hover:bg-[#EEF1F9] disabled:opacity-50 disabled:cursor-default motion-reduce:transition-none"
          style={{
            color: "var(--accent, #4A60A8)",
            borderColor: "var(--line, #E5E7EC)",
            transitionTimingFunction: EASE,
          }}
        >
          Approve remaining
        </button>
      </div>

      {/* Progress row */}
      <div className="flex items-center gap-4 flex-wrap my-3.5">
        <div className="flex-1 min-w-[200px] h-[7px] rounded-full overflow-hidden bg-[#E4E9F5]">
          <div
            className="h-full rounded-full motion-reduce:transition-none"
            style={{
              width: `${progressPct}%`,
              background: "var(--accent, #4A60A8)",
              transition: `width .4s ${EASE}`,
            }}
          />
        </div>
        <div className="flex items-center gap-3.5 text-[13px] font-medium">
          <span className="text-[#2E7D32]">{approvedCount} approved</span>
          <span className="text-[#B4553F]">{rejectedCount} rejected</span>
          <span className="text-[#94A3B8]">{pendingCount} pending</span>
        </div>
      </div>

      {/* Category filter row */}
      <div className="flex gap-2 flex-wrap mb-4">
        {filterPills.map((pill) => (
          <button
            key={pill.label}
            type="button"
            onClick={() => setFilter(pill.label)}
            className="cursor-pointer select-none flex items-center gap-[7px] font-semibold text-[12.5px] px-[13px] py-[7px] rounded-full border transition-all duration-200 motion-reduce:transition-none"
            style={{
              transitionTimingFunction: EASE,
              color: pill.active ? pill.c.fg : "var(--ink-2, #475569)",
              background: pill.active ? pill.c.bg : "var(--paper, #FFFFFF)",
              borderColor: pill.active ? "transparent" : "var(--line, #E5E7EC)",
            }}
          >
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: pill.label === "All" ? "#94A3B8" : pill.c.fg }}
            />
            {pill.label}
            <span className="opacity-60 font-medium">{pill.count}</span>
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3">
        {visible.map((rec) => {
          const status = statusOf(rec.id);
          const cat = CATEGORY_COLORS[rec.category] ?? FALLBACK_CAT;
          const sm = STATUS_META[status];
          const approved = status === "approved";
          const rejected = status === "rejected";
          return (
            <div
              key={rec.id}
              className="bg-white rounded-2xl px-5 py-[18px] border motion-reduce:transition-none"
              style={{
                borderColor: approved ? "#B7DBC2" : "var(--line, #E5E7EC)",
                boxShadow: approved ? "0 1px 2px rgba(26,26,26,0.05)" : "none",
                opacity: rejected ? 0.62 : 1,
                transition: `border-color .25s ${EASE}, box-shadow .25s ${EASE}, opacity .25s`,
              }}
            >
              {/* Top row: category + status pills */}
              <div className="flex items-center justify-between gap-3 mb-[11px]">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{ background: cat.bg }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: cat.fg }}
                  />
                  <span
                    className="font-semibold text-[11px] uppercase"
                    style={{ letterSpacing: "0.06em", color: cat.fg }}
                  >
                    {rec.category}
                  </span>
                </div>
                <div
                  className="inline-flex items-center px-[11px] py-1 rounded-full"
                  style={{ background: sm.bg }}
                >
                  <span
                    className="font-semibold text-[11px] uppercase"
                    style={{ letterSpacing: "0.04em", color: sm.fg }}
                  >
                    {sm.label}
                  </span>
                </div>
              </div>

              <p className="text-[14px] leading-[1.5] m-0" style={{ color: "var(--ink-2, #475569)" }}>
                {rec.reason}
              </p>

              {/* Diff */}
              <div className="mt-4 flex flex-col">
                <div
                  className="px-[15px] py-[11px]"
                  style={{
                    borderLeft: "2px solid #E0A0A0",
                    background: "#FCF2F2",
                    borderRadius: "0 10px 10px 0",
                  }}
                >
                  <div
                    className="font-semibold text-[10.5px] uppercase mb-[5px] text-[#B4553F]"
                    style={{ letterSpacing: "0.07em" }}
                  >
                    Current
                  </div>
                  <p
                    className="text-[13.5px] leading-[1.6] m-0 line-through text-[#64748B]"
                    style={{ textDecorationColor: "rgba(180,85,63,0.45)" }}
                  >
                    {rec.current}
                  </p>
                </div>
                <div className="flex items-center gap-2 py-1.5 pl-1 text-[#94A3B8]">
                  <ArrowDown className="w-3.5 h-3.5" strokeWidth={2} />
                  <span className="text-[11.5px] font-medium">Rewrites to</span>
                </div>
                <div
                  className="px-[15px] py-[11px]"
                  style={{
                    borderLeft: "2px solid #7FB89A",
                    background: "#F1F8F3",
                    borderRadius: "0 10px 10px 0",
                  }}
                >
                  <div
                    className="font-semibold text-[10.5px] uppercase mb-[5px] text-[#2E7D32]"
                    style={{ letterSpacing: "0.07em" }}
                  >
                    Suggested
                  </div>
                  <p className="text-[13.5px] leading-[1.6] m-0" style={{ color: "var(--ink, #0A0A0A)" }}>
                    {rec.proposed}
                  </p>
                </div>
              </div>

              {/* Action row */}
              <div
                className="mt-3.5 pt-3.5 flex items-center justify-end gap-2.5"
                style={{ borderTop: "1px solid var(--line-2, #EFF0F3)" }}
              >
                {status === "pending" ? (
                  <>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setStatus(rec.id, "rejected")}
                      className="cursor-pointer inline-flex items-center gap-[7px] font-semibold text-[13px] bg-transparent border rounded-[10px] px-4 py-[9px] transition-all duration-200 hover:bg-[#F5F6F8] hover:border-[#E0A0A0] hover:text-[#B4553F] disabled:opacity-50 disabled:cursor-default motion-reduce:transition-none"
                      style={{
                        color: "var(--ink-2, #475569)",
                        borderColor: "var(--line, #E5E7EC)",
                        transitionTimingFunction: EASE,
                      }}
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2.2} />
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setStatus(rec.id, "approved")}
                      className="cursor-pointer inline-flex items-center gap-[7px] font-semibold text-[13px] text-white border-0 rounded-[10px] px-[18px] py-[9px] transition-all duration-200 hover:bg-[#3C4F8E] disabled:opacity-50 disabled:cursor-default motion-reduce:transition-none"
                      style={{
                        background: "var(--accent, #4A60A8)",
                        boxShadow: "0 2px 8px rgba(74,96,168,0.20)",
                        transitionTimingFunction: EASE,
                      }}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                      Approve
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[12.5px] text-[#64748B]">
                      {approved ? "This edit will be applied" : "Kept the original"}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setStatus(rec.id, "pending")}
                      className="cursor-pointer font-semibold text-[13px] bg-transparent border-0 px-2 py-1.5 rounded-lg transition-all duration-200 hover:bg-[#EEF1F9] disabled:opacity-50 disabled:cursor-default motion-reduce:transition-none"
                      style={{ color: "var(--accent, #4A60A8)" }}
                    >
                      Undo
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Apply bar — sticky within the page scroll (not viewport-fixed) so it
          docks to the bottom of the tailoring column without covering the
          resume preview. */}
      <div
        className="sticky bottom-0 z-20 mt-4 -mx-1 px-6 py-4 rounded-t-2xl"
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid var(--line, #E5E7EC)",
        }}
      >
        <div className="flex items-center justify-between gap-5">
          <div className="text-[14px]" style={{ color: "var(--ink-2, #475569)" }}>
            <span className="font-semibold" style={{ color: "var(--heading, #1E2D4D)" }}>
              {approvedCount}
            </span>{" "}
            of {total} changes approved
          </div>
          <button
            type="button"
            disabled={disabled || approvedCount === 0}
            onClick={() => onApply(approvedIds)}
            className="cursor-pointer inline-flex items-center gap-[7px] font-semibold text-[14px] text-white border-0 rounded-[10px] px-[22px] py-[11px] transition-all duration-200 hover:bg-[#3C4F8E] disabled:opacity-50 disabled:cursor-default motion-reduce:transition-none"
            style={{
              background: "var(--accent, #4A60A8)",
              boxShadow: "0 2px 8px rgba(74,96,168,0.20)",
              transitionTimingFunction: EASE,
            }}
          >
            {busyLabel ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {busyLabel}
              </>
            ) : approvedCount > 0 ? (
              `Apply ${approvedCount} approved change${approvedCount === 1 ? "" : "s"}`
            ) : (
              "No changes approved"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecommendedChangesPanel;
