import { Loader2 } from "lucide-react";
import { useTierConfig, resolvePriceId, percentOff } from "@/hooks/useTierConfig";
import { OB } from "./onboardingTheme";

// Last-resort fallback SKUs if the catalog has not wired the default student
// monthly stop yet. Real resolution goes through the catalog (mirrors Pricing.tsx),
// so any future SKU change applies here automatically.
const LEGACY_PRO_PRICE_ID = "price_1ScLXrERY2WrVHp1bYgdMAu4";
const LEGACY_ELITE_PRICE_ID = "price_1ScLcfERY2WrVHp1c5rcONJ3";

interface OnboardingTrialProps {
  onStartTrial: (tier: "pro" | "elite", priceId: string) => void;
  onContinueFree: () => void;
  submitting: boolean;
  // Derived from the .edu collected on step 1 (Slate Split moved the promo
  // there) — drives student pricing display. Checkout re-validates server-side.
  isStudent?: boolean;
}

/**
 * Pick your plan — Slate Split step 5. Two stacked cards (Pro emphasized,
 * Elite plain) + a free-plan link. Prices, credits, and Stripe Price IDs come
 * from the runtime catalog so onboarding never drifts from the pricing page.
 * No .edu promo input here: it lives on step 1; the rail hint notes the
 * discount is already applied for students.
 */
export const OnboardingTrial = ({
  onStartTrial,
  onContinueFree,
  submitting,
  isStudent = false,
}: OnboardingTrialProps) => {
  const { config: tierConfig } = useTierConfig();
  const proDefault = tierConfig.slider_stops.pro.find((s) => s.default) ?? tierConfig.slider_stops.pro[0];
  const eliteDefault =
    tierConfig.slider_stops.elite.find((s) => s.default) ?? tierConfig.slider_stops.elite[0];
  const trialDays = tierConfig.trial.days_non_student;

  // Audience follows the user's .edu status. Students see the discounted SKU;
  // everyone else sees list price.
  const audience = isStudent ? "student" : "list";

  const proPriceId =
    resolvePriceId(tierConfig.stripe_catalog, "pro", "monthly", audience, proDefault.credits) ||
    LEGACY_PRO_PRICE_ID;
  const elitePriceId =
    resolvePriceId(tierConfig.stripe_catalog, "elite", "monthly", audience, eliteDefault.credits) ||
    LEGACY_ELITE_PRICE_ID;

  const proPrice = isStudent ? proDefault.student : proDefault.list;
  const elitePrice = isStudent ? eliteDefault.student : eliteDefault.list;

  const priceRow = (name: string, nameColor: string, price: number, listPrice: number) => (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 6,
      }}
    >
      <span
        style={{
          fontFamily: OB.fontDisplay,
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: 20,
          color: nameColor,
        }}
      >
        {name}
      </span>
      <span>
        {isStudent && listPrice > price && (
          <span
            style={{
              fontSize: 15,
              color: OB.ink4,
              textDecoration: "line-through",
              marginRight: 7,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${listPrice}
          </span>
        )}
        <span style={{ fontSize: 26, fontWeight: 700, color: OB.heading, fontVariantNumeric: "tabular-nums" }}>
          ${price}
        </span>
        <span style={{ color: OB.ink3, fontSize: 13 }}>/mo</span>
      </span>
    </div>
  );

  const ctaButton = (label: string, bg: string, onClick: () => void) => (
    <button
      type="button"
      disabled={submitting}
      onClick={onClick}
      style={{
        width: "100%",
        height: 44,
        border: "none",
        borderRadius: 9,
        background: bg,
        color: "#fff",
        fontFamily: OB.fontBody,
        fontWeight: 600,
        fontSize: 14,
        cursor: submitting ? "default" : "pointer",
        marginTop: 14,
        boxShadow: bg === OB.primary ? OB.shadowBlue : "none",
        opacity: submitting ? 0.6 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {submitting ? <Loader2 size={16} className="animate-spin" /> : label}
    </button>
  );

  return (
    <div>
      {/* Pro — emphasized */}
      <div
        style={{
          border: `2px solid ${OB.primary}`,
          borderRadius: 14,
          padding: "18px 20px",
          background: OB.primary50,
          marginBottom: 12,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -11,
            right: 18,
            background: OB.primary,
            color: "#fff",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: ".05em",
            padding: "4px 10px",
            borderRadius: 99,
          }}
        >
          MOST POPULAR
        </div>
        {priceRow("Pro", OB.primary, proPrice, proDefault.list)}
        <div style={{ display: "inline-flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-block",
              background: OB.trialPillBg,
              color: OB.trialPillFg,
              fontWeight: 600,
              fontSize: 11,
              padding: "3px 9px",
              borderRadius: 99,
            }}
          >
            {trialDays}-day free trial · no card
          </span>
          {isStudent && (
            <span
              style={{
                display: "inline-block",
                background: OB.primary100,
                color: OB.primaryDark,
                fontWeight: 600,
                fontSize: 11,
                padding: "3px 9px",
                borderRadius: 99,
              }}
            >
              .edu {percentOff(proDefault.list, proDefault.student)}% off applied
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: OB.ink2, lineHeight: 1.7 }}>
          {proDefault.credits.toLocaleString()} credits · 8 contacts/search · firm search · bulk export
        </div>
        {ctaButton(`Start ${trialDays}-day free trial`, OB.primary, () => onStartTrial("pro", proPriceId))}
      </div>

      {/* Elite */}
      <div
        style={{
          border: `1px solid ${OB.border}`,
          borderRadius: 14,
          padding: "18px 20px",
          background: "#fff",
          marginBottom: 18,
        }}
      >
        {priceRow("Elite", OB.heading, elitePrice, eliteDefault.list)}
        <div style={{ fontSize: 13, color: OB.ink2, lineHeight: 1.7 }}>
          {eliteDefault.credits.toLocaleString()} credits · 15 contacts/search · unlimited preps ·
          priority queue
        </div>
        {ctaButton("Subscribe to Elite", OB.heading, () => onStartTrial("elite", elitePriceId))}
      </div>

      <div style={{ textAlign: "center" }}>
        <button
          type="button"
          onClick={onContinueFree}
          disabled={submitting}
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: OB.ink3,
            background: "none",
            border: "none",
            cursor: submitting ? "default" : "pointer",
            fontFamily: OB.fontBody,
            opacity: submitting ? 0.6 : 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = OB.heading)}
          onMouseLeave={(e) => (e.currentTarget.style.color = OB.ink3)}
        >
          Continue on the free plan →
        </button>
      </div>
    </div>
  );
};
