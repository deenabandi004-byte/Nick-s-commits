import { useMemo, useState } from "react";
import { OB, obFieldLabel, obInput, obPrimaryButton, obFocus } from "./onboardingTheme";

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
 * they need. Name/email are already collected on the Profile step and career
 * track on the Track step, so this form only fills the gap.
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
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <label style={obFieldLabel} htmlFor="m-university">University</label>
        <input
          id="m-university"
          style={obInput}
          {...obFocus}
          value={university}
          onChange={(e) => setUniversity(e.target.value)}
          placeholder="University of Southern California"
          required
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <div>
          <label style={obFieldLabel} htmlFor="m-major">Major</label>
          <input
            id="m-major"
            style={obInput}
            {...obFocus}
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder="Business Administration"
            required
          />
        </div>
        <div>
          <label style={obFieldLabel} htmlFor="m-degree">
            Degree <span style={{ color: OB.ink4, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="m-degree"
            style={obInput}
            {...obFocus}
            value={degree}
            onChange={(e) => setDegree(e.target.value)}
            placeholder="Bachelor of Science"
          />
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={obFieldLabel} htmlFor="m-gradYear">Graduation year</label>
        <select
          id="m-gradYear"
          value={graduationYear}
          onChange={(e) => setGraduationYear(e.target.value)}
          required
          style={{ ...obInput, appearance: "auto", color: graduationYear ? OB.ink : OB.ink4 }}
          {...obFocus}
        >
          <option value="" disabled>Select year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={!valid}
        style={{ ...obPrimaryButton, opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "default" }}
        onMouseEnter={(e) => valid && (e.currentTarget.style.background = OB.primaryDark)}
        onMouseLeave={(e) => (e.currentTarget.style.background = OB.primary)}
      >
        Continue
      </button>
    </form>
  );
};
