import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Check, X } from "lucide-react";
import { CAREER_TRACK_OPTIONS } from "@/utils/careerTrackMapping";
import {
  DreamCompanyAutocomplete,
  type DreamCompanyAutocompleteHandle,
} from "@/components/DreamCompanyAutocomplete";

export interface TrackData {
  // First entry is the primary track (drives the single `careerTrack` value downstream).
  careerTrackLabels: string[];
  jobTypes: string[];
  dreamCompanies: string[];
}

const JOB_TYPES = ["Internship", "Part-Time", "Full-Time"];

interface OnboardingTrackProps {
  onNext: (data: TrackData) => void;
  initial?: Partial<TrackData>;
}

export const OnboardingTrack = ({ onNext, initial }: OnboardingTrackProps) => {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(initial?.careerTrackLabels || []);
  const [open, setOpen] = useState(false);
  const [jobTypes, setJobTypes] = useState<string[]>(initial?.jobTypes || []);
  const [dreamCompanies, setDreamCompanies] = useState<string[]>(initial?.dreamCompanies || []);
  const dcRef = useRef<DreamCompanyAutocompleteHandle>(null);

  const toggleJobType = (t: string) =>
    setJobTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CAREER_TRACK_OPTIONS;
    return CAREER_TRACK_OPTIONS.filter((o) => o.label.toLowerCase().includes(q));
  }, [query]);

  // At least one career track is required.
  const valid = selected.length > 0;

  const toggleTrack = (label: string) => {
    setSelected((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
    setQuery("");
  };

  const removeTrack = (label: string) => setSelected((prev) => prev.filter((x) => x !== label));

  // The first selected track is the primary one (passed to Dream-company common picks).
  const primaryTrack = selected[0] || "";

  const handleContinue = () => {
    if (!valid) return;
    const finalCompanies = dcRef.current?.flushPending() ?? dreamCompanies;
    onNext({ careerTrackLabels: selected, jobTypes, dreamCompanies: finalCompanies });
  };

  return (
    <div>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5 text-center"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Career tracks
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-6 text-center">
        Pick the tracks you're recruiting for — choose as many as you like. They personalize your contacts, job feed, and outreach.
      </p>

      <div className="space-y-5">
        <div className="relative">
          <Label htmlFor="track">Career track</Label>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 mt-1.5">
              {selected.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] border border-[#1E3A8A] px-2.5 py-1 text-xs font-medium text-[#1E3A8A]"
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => removeTrack(label)}
                    className="text-[#1E3A8A] hover:text-[#172554]"
                    aria-label={`Remove ${label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]"
              id="track"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={selected.length ? "Add another track" : "Type or select your tracks"}
              autoComplete="off"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none" />
          </div>
          {open && filtered.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-[#E2E8F0] bg-white shadow-lg max-h-60 overflow-auto">
              {filtered.map((o) => {
                const checked = selected.includes(o.label);
                return (
                  <button
                    key={o.label}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleTrack(o.label)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#F1F5F9] flex items-center justify-between"
                    style={{ color: checked ? "#1E3A8A" : "#0F172A", fontWeight: checked ? 500 : 400 }}
                  >
                    {o.label}
                    {checked && <Check className="h-4 w-4 text-[#1E3A8A]" />}
                  </button>
                );
              })}
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
            careerTrack={primaryTrack}
          />
        </div>
      </div>

      <Button type="button" onClick={handleContinue} disabled={!valid} className="w-full bg-[#1E3A8A] hover:bg-[#172554] mt-8">
        Continue
      </Button>
    </div>
  );
};
