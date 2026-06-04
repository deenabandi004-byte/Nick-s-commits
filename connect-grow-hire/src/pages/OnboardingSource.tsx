import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileText, Linkedin, Loader2, Check } from "lucide-react";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { enrichLinkedInOnboarding, BACKEND_URL } from "@/services/api";
import { auth } from "@/lib/firebase";
import {
  ResumePrefill,
  resumePrefillFromParse,
  prefillFromLinkedin,
  resolvePrefill,
  EMPTY_PREFILL,
} from "@/utils/onboardingPrefill";

export type EntryPath = "resume" | "linkedin" | "manual";

export interface SourceResult {
  resumePrefill: ResumePrefill | null;
  linkedinPrefill: ResumePrefill | null;
  resolved: ResumePrefill;
  resumeFile: File | null;
  linkedinUrl: string;
  entryPath: EntryPath;
}

interface OnboardingSourceProps {
  onNext: (data: SourceResult) => void;
  initialLinkedinUrl?: string;
}

const LINKEDIN_RE = /linkedin\.com\/in\//i;

export const OnboardingSource = ({ onNext, initialLinkedinUrl }: OnboardingSourceProps) => {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePrefill, setResumePrefill] = useState<ResumePrefill | null>(null);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState(initialLinkedinUrl || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const linkedinValid = LINKEDIN_RE.test(linkedinUrl);
  // Step 2 gate: any ONE of {resume parsed, valid LinkedIn URL, manual choice}.
  // Manual has its own button, so the Continue gate is resume OR LinkedIn.
  const canContinue = !!resumePrefill || linkedinValid;

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isValidResumeFile(file)) {
      setError("Please upload a PDF, DOCX, or DOC file.");
      return;
    }
    setError("");
    setResumeFile(file);
    setResumeParsing(true);
    try {
      const formData = new FormData();
      formData.append("resume", file);
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(`${BACKEND_URL}/api/parse-resume`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const result = await res.json();
      if (res.ok && result.data) {
        setResumePrefill(resumePrefillFromParse(result.data));
      } else {
        // Keep the file (we still attach it later); user can confirm manually.
        setResumePrefill(EMPTY_PREFILL);
      }
    } catch {
      setResumePrefill(EMPTY_PREFILL);
    } finally {
      setResumeParsing(false);
    }
  };

  const proceed = (entryPath: EntryPath, linkedinPrefill: ResumePrefill | null) => {
    const resolved = resolvePrefill(resumePrefill, linkedinPrefill);
    onNext({
      resumePrefill,
      linkedinPrefill,
      resolved,
      resumeFile,
      linkedinUrl: linkedinValid ? linkedinUrl.trim() : "",
      entryPath,
    });
  };

  const handleContinue = async () => {
    if (submitting) return;
    setError("");
    // Resume is primary when present.
    if (resumePrefill) {
      // If a LinkedIn URL was also supplied, enrich it to fill resume gaps.
      if (linkedinValid) {
        setSubmitting(true);
        try {
          const result = await enrichLinkedInOnboarding(linkedinUrl.trim());
          proceed("resume", result ? prefillFromLinkedin(result) : null);
          return;
        } catch {
          proceed("resume", null);
          return;
        } finally {
          setSubmitting(false);
        }
      }
      proceed("resume", null);
      return;
    }
    // LinkedIn-only path.
    if (linkedinValid) {
      setSubmitting(true);
      try {
        const result = await enrichLinkedInOnboarding(linkedinUrl.trim());
        proceed("linkedin", result ? prefillFromLinkedin(result) : EMPTY_PREFILL);
      } catch {
        // Enrichment failed — still proceed; Confirm becomes the manual fallback.
        proceed("linkedin", EMPTY_PREFILL);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleManual = () => proceed("manual", null);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] mb-1.5 text-center" style={{ fontFamily: "'Lora', Georgia, serif" }}>
        Add your résumé or LinkedIn
      </h1>
      <p className="text-sm text-[#475569] leading-relaxed mb-8 text-center">
        We'll prefill the rest. You can also enter it by hand.
      </p>

      <div className="space-y-4">
        {/* Resume */}
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: resumeFile ? "#1E3A8A" : "#E2E8F0", background: resumeFile ? "#EFF6FF" : "#FFFFFF" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[#1E3A8A]" />
              <div>
                <div className="text-sm font-medium text-[#0F172A]">Upload résumé</div>
                <div className="text-xs text-[#64748B]">
                  {resumeFile ? resumeFile.name : "PDF, DOCX, or DOC — highly recommended"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {resumeParsing && <Loader2 className="h-4 w-4 animate-spin text-[#1E3A8A]" />}
              {!resumeParsing && resumePrefill && resumePrefill.name && (
                <span className="flex items-center gap-1 text-xs text-[#1E3A8A]"><Check className="h-3.5 w-3.5" /> Parsed</span>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1.5" /> {resumeFile ? "Replace" : "Upload"}
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_RESUME_TYPES.accept}
            className="hidden"
            onChange={handleResumeUpload}
          />
        </div>

        {/* LinkedIn */}
        <div className="rounded-lg border p-4" style={{ borderColor: linkedinValid ? "#1E3A8A" : "#E2E8F0", background: linkedinValid ? "#EFF6FF" : "#FFFFFF" }}>
          <div className="flex items-center gap-3 mb-2">
            <Linkedin className="h-5 w-5 text-[#1E3A8A]" />
            <div className="text-sm font-medium text-[#0F172A]">Or paste your LinkedIn URL</div>
          </div>
          <Input className="focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]"
            type="url"
            placeholder="https://www.linkedin.com/in/your-handle"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
          {linkedinUrl && !linkedinValid && (
            <p className="text-xs text-[#DC2626] mt-1.5">Enter a full linkedin.com/in/… profile URL.</p>
          )}
        </div>

        {error && <p className="text-xs text-[#DC2626]">{error}</p>}
      </div>

      <Button
        type="button"
        onClick={handleContinue}
        disabled={!canContinue || submitting}
        className="w-full bg-[#1E3A8A] hover:bg-[#172554] mt-8"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
      </Button>
      <div className="text-center mt-3">
        <button
          type="button"
          onClick={handleManual}
          className="text-[13px] text-[#64748B] hover:text-[#0F172A] transition-colors"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          I'll enter it manually
        </button>
      </div>
    </div>
  );
};
