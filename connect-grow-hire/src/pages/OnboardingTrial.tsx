import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, GraduationCap } from "lucide-react";
import { useTierConfig, resolvePriceId, percentOff } from "@/hooks/useTierConfig";

// Last-resort fallback SKUs if the catalog has not wired the default student
// monthly stop yet. Real resolution goes through the catalog (mirrors Pricing.tsx),
// so the $14.99 2K fix and any future SKU change apply here automatically.
const LEGACY_PRO_PRICE_ID = "price_1ScLXrERY2WrVHp1bYgdMAu4";
const LEGACY_ELITE_PRICE_ID = "price_1ScLcfERY2WrVHp1c5rcONJ3";

// For-Students + pop palettes — mirror Pricing.tsx so onboarding reads as the
// same design system (student .edu discount + 14-day trial emphasis).
const C_FS = { ink: "#003262", brand: "#2563EB", body: "#475569", muted: "#64748B" };
const C_POP = {
  magenta: "#EC4899",
  magentaDeep: "#DB2777",
  magentaSoft: "#FCE7F3",
  purple: "#7C3AED",
};

interface OnboardingTrialProps {
  onStartTrial: (tier: "pro" | "elite", priceId: string) => void;
  onContinueFree: () => void;
  submitting: boolean;
  // Derived from the email entered in the profile step — drives student pricing
  // display. Real checkout audience is re-validated server-side.
  isStudent?: boolean;
  // Lets the user swap in a .edu email right here if they didn't use one earlier;
  // the parent updates the onboarding profile so the discount + signal persist.
  onEduEmail?: (email: string) => void;
}

export const OnboardingTrial = ({ onStartTrial, onContinueFree, submitting, isStudent = false, onEduEmail }: OnboardingTrialProps) => {
  const [eduEmail, setEduEmail] = useState("");
  const [eduError, setEduError] = useState("");

  const applyEdu = (e: React.FormEvent) => {
    e.preventDefault();
    const v = eduEmail.toLowerCase().trim();
    if (!v.includes("@") || !v.endsWith(".edu")) {
      setEduError("Enter a valid .edu email (e.g. you@university.edu).");
      return;
    }
    setEduError("");
    onEduEmail?.(eduEmail.trim());
  };

  // Mirror the Pricing default view: monthly cadence, default credit stop.
  // Prices, credit counts, and Stripe Price IDs all come from the runtime
  // catalog so onboarding never drifts from the pricing page.
  const { config: tierConfig } = useTierConfig();
  const proDefault = tierConfig.slider_stops.pro.find((s) => s.default) ?? tierConfig.slider_stops.pro[0];
  const eliteDefault = tierConfig.slider_stops.elite.find((s) => s.default) ?? tierConfig.slider_stops.elite[0];
  const trialDays = tierConfig.trial.days_non_student;

  // Audience follows the user's .edu status. Students see the discounted SKU;
  // everyone else sees list price (and is nudged to add a .edu).
  const audience = isStudent ? "student" : "list";

  const proPriceId =
    resolvePriceId(tierConfig.stripe_catalog, "pro", "monthly", audience, proDefault.credits) || LEGACY_PRO_PRICE_ID;
  const elitePriceId =
    resolvePriceId(tierConfig.stripe_catalog, "elite", "monthly", audience, eliteDefault.credits) || LEGACY_ELITE_PRICE_ID;

  const proPrice = isStudent ? proDefault.student : proDefault.list;
  const elitePrice = isStudent ? eliteDefault.student : eliteDefault.list;
  const proOff = percentOff(proDefault.list, proDefault.student);

  const TIERS = [
    {
      name: "Pro",
      tierKey: "pro" as const,
      cta: "Start free trial",
      price: proPrice,
      listPrice: proDefault.list,
      priceId: proPriceId,
      recommended: true,
      suffix: "/mo after trial",
      perks: [
        `${proDefault.credits.toLocaleString()} credits / mo`,
        "8 contacts per search",
        "Firm search + smart filters",
        "Bulk drafting & export",
      ],
    },
    {
      name: "Elite",
      tierKey: "elite" as const,
      cta: "Subscribe",
      price: elitePrice,
      listPrice: eliteDefault.list,
      priceId: elitePriceId,
      recommended: false,
      suffix: "/mo",
      perks: [
        `${eliteDefault.credits.toLocaleString()} credits / mo`,
        "15 contacts per search",
        "Unlimited coffee chat preps",
        "Priority queue + weekly insights",
      ],
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5 text-center" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        Start using Offerloop
      </h1>
      <p className="text-sm leading-relaxed mb-3 text-center" style={{ color: C_FS.body }}>
        Try <strong style={{ color: C_FS.ink }}>Pro free for {trialDays} days</strong> — no credit card. Elite starts right away.
      </p>

      {/* CTA pulse + gradient-shine keyframes (respects reduced-motion). */}
      <style>{`
        @keyframes olTrialPulse {
          0%, 100% { box-shadow: 0 10px 28px -8px ${C_POP.magenta}55, 0 6px 14px -6px ${C_FS.brand}55; transform: translateY(0); }
          50%      { box-shadow: 0 16px 38px -6px ${C_POP.magenta}88, 0 9px 20px -6px ${C_FS.brand}77; transform: translateY(-1.5px); }
        }
        @keyframes olTrialShine { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        .ol-trial-cta {
          background-size: 200% 100% !important;
          animation: olTrialPulse 2.2s ease-in-out infinite, olTrialShine 3.5s linear infinite;
        }
        .ol-trial-cta:hover { animation-play-state: paused; transform: scale(1.02); }
        @media (prefers-reduced-motion: reduce) { .ol-trial-cta { animation: none; } }
      `}</style>

      {/* Student-status banner — confirms the .edu discount, or lets the user add
          a .edu right here to unlock it without going back a step. */}
      {isStudent ? (
        <div
          className="flex items-center justify-center gap-2 mx-auto mb-6 px-3 py-2 rounded-full text-xs font-semibold"
          style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1D4ED8", maxWidth: "fit-content" }}
        >
          <GraduationCap className="h-4 w-4" />
          .edu verified — student pricing applied (~{proOff}% off)
        </div>
      ) : (
        <div
          className="mx-auto mb-6 rounded-xl p-3.5"
          style={{ background: C_POP.magentaSoft, border: `1px solid ${C_POP.magenta}55`, maxWidth: 460 }}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: C_POP.magentaDeep }}>
            <GraduationCap className="h-4 w-4 shrink-0" />
            Have a .edu? Add it to unlock ~{proOff}% off and stronger outreach.
          </p>
          <form onSubmit={applyEdu} className="flex gap-2">
            <Input
              type="email"
              value={eduEmail}
              onChange={(e) => { setEduEmail(e.target.value); setEduError(""); }}
              placeholder="you@university.edu"
              className="h-9 bg-white text-sm focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]"
            />
            <Button
              type="submit"
              className="h-9 shrink-0 text-white font-semibold"
              style={{ background: `linear-gradient(135deg, ${C_POP.magenta} 0%, ${C_POP.magentaDeep} 100%)` }}
            >
              Apply
            </Button>
          </form>
          {eduError && <p className="text-xs mt-1.5" style={{ color: "#DC2626" }}>{eduError}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        {TIERS.map((tier) => {
          const showDiscount = isStudent && tier.listPrice > tier.price;
          return (
            <div
              key={tier.name}
              className="relative rounded-2xl border p-7 pt-8 flex flex-col"
              style={{
                borderColor: tier.recommended ? C_FS.brand : "#E2E8F0",
                background: tier.recommended ? "#F8FAFF" : "#FFFFFF",
                boxShadow: tier.recommended ? `0 10px 28px -12px ${C_FS.brand}40` : "none",
              }}
            >
              {/* Most-popular ribbon — magenta pop, matches Pricing.tsx */}
              {tier.recommended && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 -top-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white px-3 py-1 rounded-full whitespace-nowrap"
                  style={{
                    background: `linear-gradient(135deg, ${C_POP.magenta} 0%, ${C_POP.magentaDeep} 100%)`,
                    boxShadow: `0 6px 16px -4px ${C_POP.magenta}66, 0 0 0 3px #F8FAFF`,
                  }}
                >
                  ★ Most Popular
                </span>
              )}

              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-lg font-extrabold italic"
                  style={
                    tier.recommended
                      ? {
                          fontFamily: "'Lora', Georgia, serif",
                          background: `linear-gradient(135deg, ${C_FS.brand} 0%, ${C_POP.purple} 55%, ${C_POP.magenta} 100%)`,
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }
                      : { fontFamily: "'Lora', Georgia, serif", color: C_FS.ink }
                  }
                >
                  {tier.name}
                </span>
                {showDiscount && (
                  <span
                    className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-white px-2 py-0.5 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${C_POP.magenta} 0%, ${C_POP.magentaDeep} 100%)` }}
                  >
                    {percentOff(tier.listPrice, tier.price)}% off
                  </span>
                )}
              </div>

              <div className="mb-3 flex items-baseline gap-1.5">
                {showDiscount && (
                  <span className="text-base text-[#94A3B8] line-through" style={{ fontVariantNumeric: "tabular-nums" }}>
                    ${tier.listPrice}
                  </span>
                )}
                <span className="text-3xl font-semibold" style={{ color: C_FS.ink, fontVariantNumeric: "tabular-nums" }}>
                  ${tier.price}
                </span>
                <span className="text-xs" style={{ color: C_FS.muted }}>{tier.suffix}</span>
              </div>

              {/* Trust pills — green trial on Pro, .edu marker when student */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {tier.tierKey === "pro" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200">
                    {trialDays}-day free trial · no card
                  </span>
                )}
                {isStudent && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200">
                    🎓 .edu
                  </span>
                )}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {tier.perks.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm" style={{ color: C_FS.body }}>
                    <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: C_FS.brand }} /> {p}
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                className={`w-full rounded-lg text-white font-bold py-5 text-[15px] transition-transform ${tier.recommended ? "ol-trial-cta" : ""}`}
                style={
                  tier.recommended
                    ? {
                        fontFamily: "'Lora', Georgia, serif",
                        background: `linear-gradient(110deg, ${C_FS.brand} 0%, ${C_POP.purple} 35%, ${C_POP.magenta} 60%, ${C_POP.purple} 80%, ${C_FS.brand} 100%)`,
                      }
                    : { fontFamily: "'Lora', Georgia, serif", background: "#1E3A8A" }
                }
                disabled={submitting}
                onClick={() => onStartTrial(tier.tierKey, tier.priceId)}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : tier.cta}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Free plan — de-emphasized secondary option so the trial leads */}
      <div className="mt-5 text-center">
        <button
          type="button"
          onClick={onContinueFree}
          disabled={submitting}
          className="text-sm font-medium transition-colors disabled:opacity-50"
          style={{ color: C_FS.muted, background: "none", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C_FS.ink)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C_FS.muted)}
        >
          Continue on the free plan
        </button>
      </div>
    </div>
  );
};
