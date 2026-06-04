import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { ResumePrefill } from "@/utils/onboardingPrefill";

export interface ConfirmData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  university: string;
  major: string;
  degree: string;
  graduationYear: string;
}

interface OnboardingConfirmProps {
  initial: ResumePrefill;
  initialDegree?: string;
  onNext: (data: ConfirmData) => void;
  onBack: () => void;
}

export const OnboardingConfirm = ({ initial, initialDegree, onNext, onBack }: OnboardingConfirmProps) => {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [university, setUniversity] = useState(initial.university);
  const [major, setMajor] = useState(initial.major);
  const degree = initialDegree || "";
  const [graduationYear, setGraduationYear] = useState(initial.graduationYear);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const list: string[] = [];
    for (let y = current + 6; y >= current - 8; y--) list.push(String(y));
    return list;
  }, []);

  // Real JS gate — required fields the email engine + Find recs depend on.
  const valid =
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    university.trim() &&
    major.trim() &&
    graduationYear.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onNext({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      university: university.trim(),
      major: major.trim(),
      degree: degree.trim(),
      graduationYear: graduationYear.trim(),
    });
  };

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94A3B8", marginBottom: 8 }}>
        Step 2 of 4
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        Confirm your info
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8">
        We prefilled what we could. Double-check it and fix anything that's off.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="phone">Phone <span className="text-[#94A3B8] font-normal">(optional)</span></Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="university">University</Label>
          <Input id="university" value={university} onChange={(e) => setUniversity(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="major">Major</Label>
            <Input id="major" value={major} onChange={(e) => setMajor(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="graduationYear">Graduation year</Label>
            <select
              id="graduationYear"
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="" disabled>Select year</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 pt-6" style={{ borderTop: "1px solid #E2E8F0" }}>
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-[#64748B] hover:text-[#0F172A] transition-colors" style={{ background: "none", border: "none", cursor: "pointer" }}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <Button type="submit" disabled={!valid} className="min-w-[120px]">Continue</Button>
        </div>
      </form>
    </div>
  );
};
