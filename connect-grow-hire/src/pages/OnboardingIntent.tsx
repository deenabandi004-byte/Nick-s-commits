import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export interface IntentData {
  intent: string;
}

interface OnboardingIntentProps {
  onNext: (data: IntentData) => void;
  initial?: string;
}

// Placeholder options — these will change later.
const INTENT_OPTIONS = [
  "Land a job through networking",
  "Break into a competitive field",
  "Find and track applications",
  "Improve my outreach and emails",
  "Just exploring",
];

export const OnboardingIntent = ({ onNext, initial }: OnboardingIntentProps) => {
  const [intent, setIntent] = useState(initial || "");

  return (
    <div>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5 text-center"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        What brings you to Offerloop?
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-6 text-center">
        Pick what fits best — we'll tailor your experience around it.
      </p>

      <div className="space-y-3">
        {INTENT_OPTIONS.map((opt) => {
          const selected = intent === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => setIntent(selected ? "" : opt)}
              className="w-full text-left rounded-lg border p-4 flex items-center justify-between transition-all"
              style={{ borderColor: selected ? "#1E3A8A" : "#E2E8F0", background: selected ? "#EFF6FF" : "#FFFFFF" }}
            >
              <span className="text-[15px] font-medium" style={{ color: selected ? "#1E3A8A" : "#0F172A" }}>
                {opt}
              </span>
              {selected && <Check className="h-5 w-5 text-[#1E3A8A]" />}
            </button>
          );
        })}
      </div>

      <Button type="button" onClick={() => onNext({ intent })} className="w-full bg-[#1E3A8A] hover:bg-[#172554] mt-8">
        Continue
      </Button>
    </div>
  );
};
