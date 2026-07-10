import { Zap } from "lucide-react";

import {
  CREDITS_CRITICAL_PCT,
  CREDITS_LOW_PCT,
  CREDITS_TIER_AMPLE,
  CREDITS_TIER_CRITICAL,
  CREDITS_TIER_LOW,
  type CreditsTier,
} from "@/lib/constants";

export type CreditsPanelProps = {
  /** Actual remaining balance to display. */
  remaining: number;
  /** Cap for the % bar (monthly allocation, or the daily budget during a trial). */
  total: number;
  onUpgrade: () => void;
  /** True during a Pro free trial — switches to the daily-budget presentation. */
  isTrialing?: boolean;
  /** Days left in the trial (shown in the trial subtext). */
  daysRemaining?: number;
};

type TierTheme = {
  wrap: string;
  label: string;
  pill: string;
  bar: string;
  btn: string;
  bolt: string;
  cta: string;
};

const THEMES: Record<CreditsTier, TierTheme> = {
  ample: {
    wrap: "bg-white/[0.035] border-white/[0.06]",
    label: "text-slate-400",
    pill: "text-blue-300 bg-blue-500/15",
    bar: "from-sky-500 to-blue-500",
    btn: "from-blue-600 to-blue-700 shadow-[0_4px_14px_rgba(37,99,235,0.32)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.45)]",
    bolt: "text-amber-200",
    cta: "Upgrade Plan",
  },
  low: {
    wrap: "bg-amber-500/[0.07] border-amber-500/25",
    label: "text-amber-300",
    pill: "text-amber-300 bg-amber-500/15",
    bar: "from-amber-400 to-orange-500",
    btn: "from-amber-500 to-orange-600 shadow-[0_4px_16px_rgba(245,158,11,0.4)] hover:shadow-[0_6px_22px_rgba(245,158,11,0.55)]",
    bolt: "text-amber-950",
    cta: "Get more credits",
  },
  critical: {
    wrap: "bg-rose-500/[0.08] border-rose-500/30",
    label: "text-rose-300",
    pill: "text-rose-200 bg-rose-500/15",
    bar: "from-rose-500 to-red-600",
    btn: "from-rose-500 to-red-600 shadow-[0_4px_16px_rgba(244,63,94,0.45)] hover:shadow-[0_6px_22px_rgba(244,63,94,0.6)]",
    bolt: "text-rose-950",
    cta: "Get more credits",
  },
};

function tierFor(pct: number): CreditsTier {
  if (pct > CREDITS_LOW_PCT) return CREDITS_TIER_AMPLE;
  if (pct > CREDITS_CRITICAL_PCT) return CREDITS_TIER_LOW;
  return CREDITS_TIER_CRITICAL;
}

export function CreditsPanel({ remaining, total, onUpgrade, isTrialing = false, daysRemaining }: CreditsPanelProps) {
  // Show the real balance. The % bar is clamped to [0,100] so a grandfathered
  // balance above the cap (legacy accounts carried more credits than the new
  // tier cap) reads as "full" instead of pinning the displayed number to the
  // cap — the previous math did `cap - max(0, cap - credits)`, which froze the
  // number at the cap whenever credits exceeded it.
  const safeRemaining = Math.max(0, remaining);
  const pct = total > 0 ? Math.min(100, Math.max(0, (safeRemaining / total) * 100)) : 0;

  // ── Trial mode: a one-time Pro pass, not a monthly pool. ──
  if (isTrialing) {
    return (
      <div
        className="rounded-xl border p-3.5"
        style={{ background: "rgba(37,99,235,0.10)", borderColor: "rgba(37,99,235,0.35)" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-200">
            Pro trial
          </span>
          {typeof daysRemaining === "number" && (
            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-200">
              {daysRemaining} day{daysRemaining === 1 ? "" : "s"} left
            </span>
          )}
        </div>

        <div className="mb-1 flex items-baseline gap-1.5">
          <span className="text-[19px] font-medium tracking-tight text-slate-50">
            {safeRemaining.toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-400">of {total.toLocaleString()} trial credits</span>
        </div>

        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-500"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>

        <p className="mb-3 text-[10.5px] leading-snug text-slate-400">
          Upgrade anytime for 2,000 credits a month
        </p>

        <button
          type="button"
          onClick={onUpgrade}
          className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-br from-blue-600 to-blue-700 py-2.5 text-[13px] font-medium text-white shadow-[0_4px_14px_rgba(37,99,235,0.32)] transition-transform duration-150 hover:-translate-y-px active:translate-y-0"
        >
          <Zap className="h-3.5 w-3.5 text-amber-200" />
          Keep Pro
        </button>
      </div>
    );
  }

  const theme = THEMES[tierFor(pct)];

  return (
    <div className={`rounded-xl border p-3 ${theme.wrap}`}>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-[17px] font-medium leading-none tracking-tight text-slate-50">
          {safeRemaining.toLocaleString()}
        </span>
        <span className="text-[11px] text-slate-400">of {total.toLocaleString()} credits</span>
      </div>
      <div className="mb-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${theme.bar}`}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-medium leading-none ${theme.pill}`}>
          {Math.round(pct)}%
        </span>
      </div>

      <button
        type="button"
        onClick={onUpgrade}
        className={`flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-br py-2 text-[12.5px] font-medium text-white transition-transform duration-150 hover:-translate-y-px active:translate-y-0 ${theme.btn}`}
      >
        <Zap className={`h-3.5 w-3.5 ${theme.bolt}`} />
        {theme.cta}
      </button>
    </div>
  );
}
