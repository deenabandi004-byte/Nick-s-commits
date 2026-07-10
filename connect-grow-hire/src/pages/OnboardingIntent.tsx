import { useState } from "react";
import { Check } from "lucide-react";
import { OB, obPrimaryButton } from "./onboardingTheme";

export interface IntentData {
  intent: string;
}

interface OnboardingIntentProps {
  onNext: (data: IntentData) => void;
  initial?: string;
}

// "How did you hear about us?" — acquisition source, single-select. Saved to
// Firestore as `referralSource` for marketing attribution. No preselection so
// the attribution data stays honest.
const INTENT_OPTIONS = [
  "Instagram",
  "TikTok",
  "LinkedIn",
  "From a friend",
  "In person",
  "Other",
];

export const OnboardingIntent = ({ onNext, initial }: OnboardingIntentProps) => {
  const [intent, setIntent] = useState(initial || "");

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} role="radiogroup">
        {INTENT_OPTIONS.map((opt) => {
          const selected = intent === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setIntent(opt)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                border: selected ? `1.5px solid ${OB.primary}` : `1px solid ${OB.border}`,
                background: selected ? OB.primary50 : "#fff",
                borderRadius: 11,
                padding: "14px 16px",
                fontSize: 14,
                fontFamily: OB.fontBody,
                fontWeight: selected ? 600 : 400,
                color: selected ? OB.heading : OB.ink,
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color .15s, background .15s",
                width: "100%",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...(selected
                    ? { background: OB.primary, color: "#fff" }
                    : { border: `1.5px solid ${OB.border}` }),
                }}
              >
                {selected && <Check size={12} strokeWidth={3} />}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!intent}
        onClick={() => onNext({ intent })}
        style={{
          ...obPrimaryButton,
          marginTop: 20,
          opacity: intent ? 1 : 0.5,
          cursor: intent ? "pointer" : "default",
        }}
        onMouseEnter={(e) => intent && (e.currentTarget.style.background = OB.primaryDark)}
        onMouseLeave={(e) => (e.currentTarget.style.background = OB.primary)}
      >
        Continue
      </button>
    </div>
  );
};
