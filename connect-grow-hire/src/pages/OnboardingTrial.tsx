import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";

// Live monthly Stripe price IDs (mirror Pricing.tsx). Checkout adds the 30-day
// trial server-side via stripe_client subscription_data — no trial config here.
export const STRIPE_PRO_PRICE_ID = "price_1ScLXrERY2WrVHp1bYgdMAu4";
export const STRIPE_ELITE_PRICE_ID = "price_1ScLcfERY2WrVHp1c5rcONJ3";

interface OnboardingTrialProps {
  onStartTrial: (priceId: string) => void;
  onContinueFree: () => void;
  submitting: boolean;
}

const TIERS = [
  {
    name: "Pro",
    price: "$14.99",
    priceId: STRIPE_PRO_PRICE_ID,
    recommended: true,
    perks: ["3,000 credits / mo", "8 contacts per search", "Firm search + smart filters", "Bulk drafting & export"],
  },
  {
    name: "Elite",
    price: "$34.99",
    priceId: STRIPE_ELITE_PRICE_ID,
    recommended: false,
    perks: ["12,000 credits / mo", "30 contacts per search", "Unlimited coffee chat preps", "Priority queue + weekly insights"],
  },
];

export const OnboardingTrial = ({ onStartTrial, onContinueFree, submitting }: OnboardingTrialProps) => {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5 text-center" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        Start using Offerloop
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8 text-center">
        Try Pro or Elite free for 30 days. Cancel anytime — no charge during the trial.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className="rounded-2xl border p-5 flex flex-col"
            style={{ borderColor: tier.recommended ? "#1E3A8A" : "#E2E8F0", background: tier.recommended ? "#F8FAFF" : "#FFFFFF" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-[#0F172A]">{tier.name}</span>
              {tier.recommended && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-[#1E3A8A] bg-[#EFF6FF] px-2 py-0.5 rounded">
                  Recommended
                </span>
              )}
            </div>
            <div className="mb-3">
              <span className="text-2xl font-semibold text-[#0F172A]">{tier.price}</span>
              <span className="text-xs text-[#64748B]">/mo after trial</span>
            </div>
            <ul className="space-y-1.5 mb-5 flex-1">
              {tier.perks.map((p) => (
                <li key={p} className="flex items-start gap-2 text-xs text-[#475569]">
                  <Check className="h-3.5 w-3.5 text-[#1E3A8A] mt-0.5 shrink-0" /> {p}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              className="w-full rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white font-bold"
              style={{ fontFamily: "'Lora', Georgia, serif" }}
              disabled={submitting}
              onClick={() => onStartTrial(tier.priceId)}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try for free"}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Button
          type="button"
          onClick={onContinueFree}
          disabled={submitting}
          className="w-full rounded-lg bg-[#1E3A8A] hover:bg-[#172554] text-white font-bold"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Continue on the free plan
        </Button>
      </div>
    </div>
  );
};
