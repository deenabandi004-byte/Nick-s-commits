import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

const CAREER_TRACKS = [
  "Investment Banking",
  "Management Consulting",
  "Private Equity / VC",
  "Product Management",
  "Software Engineering",
  "Sales & Trading",
  "Corporate Finance / FP&A",
  "Other",
];

interface GoalsData {
  careerTrack: string;
  dreamCompanies: string[];
}

interface OnboardingGoalsProps {
  onNext: (data: GoalsData) => void;
  onSkip: () => void;
  initialData?: Partial<GoalsData>;
}

export const OnboardingGoals = ({
  onNext,
  onSkip,
  initialData,
}: OnboardingGoalsProps) => {
  const [careerTrack, setCareerTrack] = useState(
    initialData?.careerTrack || ""
  );
  const [dreamCompanies, setDreamCompanies] = useState<string[]>(
    initialData?.dreamCompanies || []
  );
  const [companyInput, setCompanyInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Flush any pending company input that wasn't committed via Enter/comma
    let final = dreamCompanies;
    const pending = companyInput.trim().replace(/,$/, "");
    if (pending && !dreamCompanies.includes(pending)) {
      final = [...dreamCompanies, pending];
    }
    onNext({ careerTrack, dreamCompanies: final });
  };

  return (
    <div>
      <p
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#94A3B8",
          marginBottom: 8,
        }}
      >
        Step 3 of 4
      </p>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Where are you headed?
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8">
        We use this to personalize your contacts, job board, and outreach.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Career track */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-3 block">
            Primary career track
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CAREER_TRACKS.map((track) => {
              const isSelected = careerTrack === track;
              return (
                <button
                  key={track}
                  type="button"
                  onClick={() =>
                    setCareerTrack(isSelected ? "" : track)
                  }
                  style={{
                    padding: "7px 14px",
                    borderRadius: 3,
                    fontSize: 13,
                    cursor: "pointer",
                    fontWeight: isSelected ? 500 : 400,
                    border: isSelected
                      ? "1px solid #3B82F6"
                      : "1px solid #E2E8F0",
                    background: isSelected ? "#EFF6FF" : "#FFFFFF",
                    color: isSelected ? "#2563EB" : "#475569",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "#3B82F6";
                      e.currentTarget.style.color = "#0F172A";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "#E2E8F0";
                      e.currentTarget.style.color = "#475569";
                    }
                  }}
                >
                  {track}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dream companies */}
        <div>
          <label className="text-sm font-medium text-[#0F172A] mb-1.5 block">
            Dream companies
            <span className="text-[#94A3B8] font-normal ml-1">
              (optional - type and press Enter)
            </span>
          </label>

          {dreamCompanies.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 8,
              }}
            >
              {dreamCompanies.map((co) => (
                <span
                  key={co}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px",
                    borderRadius: 3,
                    fontSize: 12,
                    background: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    color: "#1D4ED8",
                  }}
                >
                  {co}
                  <button
                    type="button"
                    onClick={() =>
                      setDreamCompanies((prev) =>
                        prev.filter((c) => c !== co)
                      )
                    }
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <X size={11} color="#60A5FA" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <Input
            placeholder="e.g. Goldman Sachs, McKinsey, Google..."
            value={companyInput}
            onChange={(e) => setCompanyInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                (e.key === "Enter" || e.key === ",") &&
                companyInput.trim()
              ) {
                e.preventDefault();
                const val = companyInput.trim().replace(/,$/, "");
                if (val && !dreamCompanies.includes(val)) {
                  setDreamCompanies((prev) => [...prev, val]);
                }
                setCompanyInput("");
              }
              if (
                e.key === "Backspace" &&
                companyInput === "" &&
                dreamCompanies.length > 0
              ) {
                setDreamCompanies((prev) => prev.slice(0, -1));
              }
            }}
          />
          <p className="text-xs text-[#94A3B8] mt-1.5">
            Press Enter or comma after each company
          </p>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between mt-8 pt-6"
          style={{ borderTop: "1px solid #E2E8F0" }}
        >
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-[#94A3B8] hover:text-[#475569] transition-colors"
          >
            Skip for now
          </button>
          <Button
            type="submit"
            variant="default"
            size="default"
            className="min-w-[120px]"
          >
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
};
