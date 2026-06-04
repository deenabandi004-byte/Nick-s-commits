import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Check } from "lucide-react";
import { CAREER_TRACK_OPTIONS } from "@/utils/careerTrackMapping";
import {
  DreamCompanyAutocomplete,
  type DreamCompanyAutocompleteHandle,
} from "@/components/DreamCompanyAutocomplete";

export interface TrackData {
  careerTrackLabel: string;
  jobTypes: string[];
  dreamCompanies: string[];
}

const JOB_TYPES = ["Internship", "Part-Time", "Full-Time"];

interface OnboardingTrackProps {
  onNext: (data: TrackData) => void;
  initial?: Partial<TrackData>;
}

export const OnboardingTrack = ({ onNext, initial }: OnboardingTrackProps) => {
  const [query, setQuery] = useState(initial?.careerTrackLabel || "");
  const [selected, setSelected] = useState(initial?.careerTrackLabel || "");
  const [open, setOpen] = useState(false);
  const [jobTypes, setJobTypes] = useState<string[]>(initial?.jobTypes || []);
  const [dreamCompanies, setDreamCompanies] = useState<string[]>(initial?.dreamCompanies || []);
  const dcRef = useRef<DreamCompanyAutocompleteHandle>(null);

  const toggleJobType = (t: string) =>
    setJobTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || query === selected) return CAREER_TRACK_OPTIONS;
    return CAREER_TRACK_OPTIONS.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, selected]);

  // Career track is required.
  const valid = !!selected && CAREER_TRACK_OPTIONS.some((o) => o.label === selected);

  const choose = (label: string) => {
    setSelected(label);
    setQuery(label);
    setOpen(false);
  };

  const handleContinue = () => {
    if (!valid) return;
    const finalCompanies = dcRef.current?.flushPending() ?? dreamCompanies;
    onNext({ careerTrackLabel: selected, jobTypes, dreamCompanies: finalCompanies });
  };

  return (
    <div>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5 text-center"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Primary career track
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-6 text-center">
        Pick the track you're recruiting for — it personalizes your contacts, job feed, and outreach.
      </p>

      <div className="space-y-5">
        <div className="relative">
          <Label htmlFor="track">Career track</Label>
          <div className="relative">
            <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]"
              id="track"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected("");
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Type or select your track"
              autoComplete="off"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none" />
          </div>
          {open && filtered.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-[#E2E8F0] bg-white shadow-lg max-h-60 overflow-auto">
              {filtered.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => choose(o.label)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#F1F5F9] flex items-center justify-between"
                >
                  {o.label}
                  {selected === o.label && <Check className="h-4 w-4 text-[#1E3A8A]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label>
            Looking for <span className="text-[#94A3B8] font-normal">(optional)</span>
          </Label>
          <div className="flex flex-col gap-2 mt-1.5">
            {JOB_TYPES.map((t) => {
              const checked = jobTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleJobType(t)}
                  className="flex items-center gap-3 rounded-lg border p-3 text-left transition-all"
                  style={{ borderColor: checked ? "#1E3A8A" : "#E2E8F0", background: checked ? "#EFF6FF" : "#FFFFFF" }}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded border shrink-0"
                    style={{ borderColor: checked ? "#1E3A8A" : "#CBD5E1", background: checked ? "#1E3A8A" : "#FFFFFF" }}
                  >
                    {checked && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <span className="text-sm font-medium" style={{ color: checked ? "#1E3A8A" : "#0F172A" }}>
                    {t}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>
            Dream companies <span className="text-[#94A3B8] font-normal">(optional)</span>
          </Label>
          <DreamCompanyAutocomplete
            ref={dcRef}
            value={dreamCompanies}
            onChange={setDreamCompanies}
            careerTrack={selected}
          />
        </div>
      </div>

      <Button type="button" onClick={handleContinue} disabled={!valid} className="w-full bg-[#1E3A8A] hover:bg-[#172554] mt-8">
        Continue
      </Button>
    </div>
  );
};
