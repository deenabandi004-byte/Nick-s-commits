import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ProfileBasicsData {
  fullName: string;
  email: string;
  phone: string;
}

interface OnboardingProfileBasicsProps {
  onNext: (data: ProfileBasicsData) => void;
  initial?: Partial<ProfileBasicsData>;
}

export const OnboardingProfileBasics = ({ onNext, initial }: OnboardingProfileBasicsProps) => {
  const [fullName, setFullName] = useState(initial?.fullName || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone || "");

  const valid = !!fullName.trim() && !!email.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onNext({ fullName: fullName.trim(), email: email.trim(), phone: phone.trim() });
  };

  return (
    <div>
      <h1
        className="text-3xl font-semibold tracking-tight text-[#0F172A] mb-2 text-center"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Welcome to Offerloop
      </h1>
      <p className="text-sm text-[#0F172A] mb-8 text-center">
        Let's start your profile! Fill out a few quick details to get started.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="fullName">Full Legal Name</Label>
          <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]" id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@university.edu" required />
        </div>
        <div>
          <Label htmlFor="phone">
            Phone Number <span className="text-[#94A3B8] font-normal">(optional)</span>
          </Label>
          <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]" id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>

        <Button type="submit" disabled={!valid} className="w-full bg-[#1E3A8A] hover:bg-[#172554] mt-2">
          Next
        </Button>
      </form>
    </div>
  );
};
