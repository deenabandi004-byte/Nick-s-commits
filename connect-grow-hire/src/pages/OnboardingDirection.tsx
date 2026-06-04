import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DreamCompanyAutocomplete,
  type DreamCompanyAutocompleteHandle,
} from "@/components/DreamCompanyAutocomplete";
import { CAREER_TRACK_OPTIONS } from "@/utils/careerTrackMapping";

export interface DirectionData {
  careerTrackLabel: string; // UI label of the selected chip ("" if none)
  dreamCompanies: string[];
  intent: string; // selected intent label ("" if skipped)
}

interface OnboardingDirectionProps {
  onNext: (data: DirectionData) => void;
  onBack: () => void;
  initialData?: Partial<DirectionData>;
}

// "What brings you to Offerloop" — optional, single-select (onboardingIntent).
const INTENT_OPTIONS = [
  "Land a job through networking",
  "Break into a competitive field",
  "Find and track applications",
  "Improve my outreach and emails",
  "Just exploring",
];

const chipStyle = (selected: boolean): React.CSSProperties => ({
  padding: "7px 14px",
  borderRadius: 3,
  fontSize: 13,
  cursor: "pointer",
  fontWeight: selected ? 500 : 400,
  border: selected ? "1px solid #3B82F6" : "1px solid #E2E8F0",
  background: selected ? "#EFF6FF" : "#FFFFFF",
  color: selected ? "#2563EB" : "#475569",
  transition: "all 0.15s",
});

export const OnboardingDirection = ({ onNext, onBack, initialData }: OnboardingDirectionProps) => {
  const [intent, setIntent] = useState(initialData?.intent || "");
  const [careerTrackLabel, setCareerTrackLabel] = useState(initialData?.careerTrackLabel || "");
  const [dreamCompanies, setDreamCompanies] = useState<string[]>(initialData?.dreamCompanies || []);
  const autocompleteRef = useRef<DreamCompanyAutocompleteHandle>(null);

  // Career track is REQUIRED — real JS gate, not just native required.
  const valid = !!careerTrackLabel;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const finalCompanies = autocompleteRef.current?.flushPending() ?? dreamCompanies;
    onNext({ careerTrackLabel, dreamCompanies: finalCompanies, intent });
  };

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94A3B8", marginBottom: 8 }}>
        Step 3 of 4
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        Where are you headed?
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8">
        This personalizes your contacts, job board, and outreach.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Intent — optional */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-3 block">
            What brings you to Offerloop? <span className="text-[#94A3B8] font-normal">(optional)</span>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {INTENT_OPTIONS.map((opt) => {
              const selected = intent === opt;
              return (
                <button key={opt} type="button" onClick={() => setIntent(selected ? "" : opt)} style={chipStyle(selected)}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Career track — required */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-3 block">
            Primary career track <span className="text-[#DC2626]">*</span>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CAREER_TRACK_OPTIONS.map((opt) => {
              const selected = careerTrackLabel === opt.label;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setCareerTrackLabel(selected ? "" : opt.label)}
                  style={chipStyle(selected)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dream companies — optional */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-1 block">
            Dream companies <span className="text-[#94A3B8] font-normal">(optional)</span>
          </label>
          <p className="text-xs text-[#64748B] mb-2.5">
            We'll surface new postings at these companies in your feed.
          </p>
          <DreamCompanyAutocomplete
            ref={autocompleteRef}
            value={dreamCompanies}
            onChange={setDreamCompanies}
            careerTrack={careerTrackLabel}
          />
        </div>

        <div className="flex items-center justify-between mt-8 pt-6" style={{ borderTop: "1px solid #E2E8F0" }}>
          <button type="button" onClick={onBack} className="text-[13px] text-[#64748B] hover:text-[#0F172A] transition-colors" style={{ background: "none", border: "none", cursor: "pointer" }}>
            Back
          </button>
          <Button type="submit" disabled={!valid} className="min-w-[120px]">Continue</Button>
        </div>
      </form>
    </div>
  );
};
