import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, Upload, FileText, Linkedin, Loader2 } from "lucide-react";
import profileIllustration from "@/assets/profile-setup-illustration.png";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { enrichLinkedInOnboarding, BACKEND_URL } from "@/services/api";
import { auth } from "@/lib/firebase";
import { resumePrefillFromParse } from "@/utils/onboardingPrefill";

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatar?: string;
  resume?: File;
  linkedinUrl: string;
  linkedinEnrichment?: any;
}

interface OnboardingProfileProps {
  onNext: (data: ProfileData) => void;
  onBack: () => void;
  initialData?: ProfileData;
}

export const OnboardingProfile = ({ onNext, onBack, initialData }: OnboardingProfileProps) => {
  const [profile, setProfile] = useState<ProfileData>({
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    avatar: initialData?.avatar,
    resume: initialData?.resume,
    linkedinUrl: initialData?.linkedinUrl || "",
  });
  
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinFetched, setLinkedinFetched] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [profileAutoFilled, setProfileAutoFilled] = useState<Set<string>>(new Set());

  const handleLinkedInBlur = async () => {
    const url = profile.linkedinUrl.trim();
    if (!url || !url.includes("linkedin.com/in/") || linkedinFetched) return;

    setLinkedinLoading(true);
    try {
      const result = await Promise.race([
        enrichLinkedInOnboarding(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]) as any;

      if (result?.success) {
        setLinkedinFetched(true);
        // D9: when Apify failed but PDL caught us, surface a quiet
        // transparency toast. No user action required - we'll refresh the
        // enrichment in the background. Imported lazily so this page does
        // not pay a startup cost when the flag is off and fallback_used
        // never appears in the response.
        if (result?.fallback_used) {
          try {
            const { toast } = await import("@/hooks/use-toast");
            toast({
              title: "LinkedIn enrichment using fallback",
              description: "We'll refresh your profile data shortly.",
              duration: 5000,
            });
          } catch {}
        }
        const filled = new Set<string>();

        setProfile(prev => {
          const updated = { ...prev, linkedinEnrichment: result };
          if (result.profile) {
            if (!prev.firstName && result.profile.firstName) {
              updated.firstName = result.profile.firstName;
              filled.add("firstName");
            }
            if (!prev.lastName && result.profile.lastName) {
              updated.lastName = result.profile.lastName;
              filled.add("lastName");
            }
            if (!prev.email && result.profile.email) {
              updated.email = result.profile.email;
              filled.add("email");
            }
            if (!prev.phone && result.profile.phone) {
              updated.phone = result.profile.phone;
              filled.add("phone");
            }
          }
          return updated;
        });

        setProfileAutoFilled(filled);
      }
    } catch {
      // Silent — user can fill manually
    } finally {
      setLinkedinLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(profile);
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidResumeFile(file)) {
      console.warn('Invalid resume file type:', file.name);
    }
    setProfile(prev => ({ ...prev, resume: file }));

    // Parse resume to auto-fill profile fields
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "docx", "doc"].includes(ext)) return;

    setResumeParsing(true);
    try {
      const formData = new FormData();
      formData.append("resume", file);
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const response = await fetch(`${BACKEND_URL}/api/parse-resume`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const result = await response.json();
      if (response.ok && result.data) {
        // Bug 1 fix: read the nested parse shape (name/contact + education.*)
        // via the shared helper instead of non-existent flat fields.
        const prefill = resumePrefillFromParse(result.data);
        const filled = new Set<string>(profileAutoFilled);

        setProfile(prev => {
          const updated = { ...prev };
          if (!prev.firstName && prefill.firstName) {
            updated.firstName = prefill.firstName;
            filled.add("firstName");
          }
          if (!prev.lastName && prefill.lastName) {
            updated.lastName = prefill.lastName;
            filled.add("lastName");
          }
          if (!prev.email && prefill.email) {
            updated.email = prefill.email;
            filled.add("email");
          }
          if (!prev.phone && prefill.phone) {
            updated.phone = prefill.phone;
            filled.add("phone");
          }
          return updated;
        });

        setProfileAutoFilled(filled);

        // Persist parsed academics at upload time so the Confirm step can
        // prefill university/major/graduationYear before final submit.
        try {
          const existing = JSON.parse(localStorage.getItem("resumeData") || "{}");
          localStorage.setItem(
            "resumeData",
            JSON.stringify({
              ...existing,
              name: prefill.name || existing.name || "",
              university: prefill.university || existing.university || "",
              major: prefill.major || existing.major || "",
              graduationYear: prefill.graduationYear || existing.graduationYear || "",
              year: prefill.graduationYear || existing.year || "",
            })
          );
        } catch {
          /* ignore localStorage failures */
        }
      }
    } catch {
      // Silent — user can fill manually
    } finally {
      setResumeParsing(false);
    }
  };

  const triggerResumeUpload = () => {
    resumeInputRef.current?.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
      <div className="space-y-8">
        <div className="space-y-6">
          <h2 className="text-4xl lg:text-5xl font-bold text-foreground">
            Create Your{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Profile
            </span>
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Set up your profile to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          <div className="space-y-4 mb-6">
            <Label className="text-foreground font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Resume Upload (Highly Recommended)
            </Label>
            <div className="flex items-center space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={triggerResumeUpload}
                className="flex items-center space-x-2"
              >
                <Upload className="h-4 w-4" />
                <span>Choose Resume File</span>
              </Button>
              {profile.resume && (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  {profile.resume.name}
                  {resumeParsing && <Loader2 className="h-3 w-3 animate-spin" />}
                </span>
              )}
            </div>
            <input
              ref={resumeInputRef}
              type="file"
              accept={ACCEPTED_RESUME_TYPES.accept}
              onChange={handleResumeUpload}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground">
              Accepted formats: PDF, DOCX, DOC (Max 10MB)
              <span className="text-blue-600 ml-1">(DOCX recommended for best optimization)</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Your resume allows us to create more personalized and effective outreach emails.
            </p>
          </div>

          <div className="flex items-center gap-4 my-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm text-muted-foreground font-medium">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="linkedinUrl" className="text-foreground font-medium flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn Profile (Optional)
            </Label>
            <div className="relative">
              <Input
                id="linkedinUrl"
                value={profile.linkedinUrl}
                onChange={(e) => { setProfile(prev => ({ ...prev, linkedinUrl: e.target.value })); setLinkedinFetched(false); }}
                onBlur={handleLinkedInBlur}
                placeholder="https://linkedin.com/in/your-profile"
              />
              {linkedinLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Don't have a resume? Your LinkedIn profile helps us personalize your outreach.
            </p>
            {profile.linkedinUrl && !profile.linkedinUrl.includes("linkedin.com/in/") && (
              <p className="text-xs text-red-500">
                Please enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/your-profile)
              </p>
            )}
          </div>

          <div className="pt-4">
            <h3 className="text-lg font-semibold text-foreground mb-4">Personal</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-foreground font-medium">
                First Name
                {profileAutoFilled.has("firstName") && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Auto-filled</span>
                )}
              </Label>
              <Input
                id="firstName"
                value={profile.firstName}
                onChange={(e) => { setProfile(prev => ({ ...prev, firstName: e.target.value })); setProfileAutoFilled(prev => { const next = new Set(prev); next.delete("firstName"); return next; }); }}
                placeholder="Enter your first name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-foreground font-medium">
                Last Name
                {profileAutoFilled.has("lastName") && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Auto-filled</span>
                )}
              </Label>
              <Input
                id="lastName"
                value={profile.lastName}
                onChange={(e) => { setProfile(prev => ({ ...prev, lastName: e.target.value })); setProfileAutoFilled(prev => { const next = new Set(prev); next.delete("lastName"); return next; }); }}
                placeholder="Enter your last name"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">
                Email Address
                {profileAutoFilled.has("email") && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Auto-filled</span>
                )}
              </Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => { setProfile(prev => ({ ...prev, email: e.target.value })); setProfileAutoFilled(prev => { const next = new Set(prev); next.delete("email"); return next; }); }}
                placeholder="Enter your email address"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-foreground font-medium">
                Phone Number
                {profileAutoFilled.has("phone") && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Auto-filled</span>
                )}
              </Label>
              <Input
                id="phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => { setProfile(prev => ({ ...prev, phone: e.target.value })); setProfileAutoFilled(prev => { const next = new Set(prev); next.delete("phone"); return next; }); }}
                placeholder="Enter your phone number"
              />
            </div>
          </div>

          <div className="flex justify-between pt-8">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="px-8 py-3 rounded-full font-semibold"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            
            <Button
              type="submit"
              variant="gradient"
              className="px-12 py-3 rounded-full font-bold group"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </form>
      </div>

      <div className="hidden lg:flex items-center justify-center">
        <img 
          src={profileIllustration} 
          alt="Profile setup illustration" 
          className="w-full max-w-md h-auto object-contain"
        />
      </div>
    </div>
  );
};