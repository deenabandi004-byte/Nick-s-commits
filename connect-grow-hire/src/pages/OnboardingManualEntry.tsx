import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ManualEntryData {
  university: string;
  major: string;
  degree: string;
  graduationYear: string;
}

interface OnboardingManualEntryProps {
  onNext: (data: ManualEntryData) => void;
  initial?: Partial<ManualEntryData>;
}

/**
 * Manual fallback for users who don't upload a résumé or LinkedIn. Collects the
 * academic fields the parse would otherwise provide (university, major,
 * graduation year) so the email engine, Find recs, and job board still have what
 * they need. Name/email/phone are already collected on the Profile step and
 * career track on the Track step, so this form only fills the gap.
 */
export const OnboardingManualEntry = ({ onNext, initial }: OnboardingManualEntryProps) => {
  const [university, setUniversity] = useState(initial?.university || "");
  const [major, setMajor] = useState(initial?.major || "");
  const [degree, setDegree] = useState(initial?.degree || "");
  const [graduationYear, setGraduationYear] = useState(initial?.graduationYear || "");

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const list: string[] = [];
    for (let y = current + 6; y >= current - 8; y--) list.push(String(y));
    return list;
  }, []);

  const valid = !!university.trim() && !!major.trim() && !!graduationYear.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onNext({
      university: university.trim(),
      major: major.trim(),
      degree: degree.trim(),
      graduationYear: graduationYear.trim(),
    });
  };

  return (
    <div>
      <h1
        className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5 text-center"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Enter your details
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8 text-center">
        Fill these in so we can personalize your contacts, emails, and job feed.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="m-university">University</Label>
          <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]" id="m-university" value={university} onChange={(e) => setUniversity(e.target.value)} placeholder="University of Southern California" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="m-major">Major</Label>
            <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]" id="m-major" value={major} onChange={(e) => setMajor(e.target.value)} placeholder="Business Administration" required />
          </div>
          <div>
            <Label htmlFor="m-degree">
              Degree <span className="text-[#94A3B8] font-normal">(optional)</span>
            </Label>
            <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]" id="m-degree" value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="Bachelor of Science" />
          </div>
        </div>

        <div>
          <Label htmlFor="m-gradYear">Graduation year</Label>
          <select
            id="m-gradYear"
            value={graduationYear}
            onChange={(e) => setGraduationYear(e.target.value)}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-2"
          >
            <option value="" disabled>Select year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <Button type="submit" disabled={!valid} className="w-full bg-[#1E3A8A] hover:bg-[#172554] mt-2">
          Continue
        </Button>
      </form>
    </div>
  );
};
