// Standalone home for cover letters: generate one from a job posting (URL or
// pasted description) against the user's stored resume, edit it inline, copy
// it, or download it as a PDF. Hits the same job-board endpoints the Chrome
// extension already uses (generate-cover-letter, cover-letter-pdf) — see
// api.ts's generateCoverLetter / downloadCoverLetterPdf.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Copy, Download, FileText, Sparkles } from "lucide-react";
import { apiService } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { toast } from "@/hooks/use-toast";

// Backend minimum for a usable pasted job description when no URL is given.
const MIN_JD_LENGTH = 30;

const CoverLetterPage = () => {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();

  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");

  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [needsResume, setNeedsResume] = useState(false);

  const canGenerate =
    !generating && (!!jobUrl.trim() || jobDescription.trim().length >= MIN_JD_LENGTH);

  const handleGenerate = async () => {
    if (!user?.uid) return;
    setGenerating(true);
    setNeedsResume(false);
    try {
      const res = await apiService.generateCoverLetter({
        userId: user.uid,
        jobUrl: jobUrl.trim() || undefined,
        jobDescription: jobDescription.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
      });
      setLetter(res.coverLetter.content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate cover letter";
      if (msg.includes("No resume")) {
        setNeedsResume(true);
      } else {
        toast({ title: "Generation failed", description: msg, variant: "destructive" });
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!letter) return;
    await navigator.clipboard.writeText(letter);
    toast({ title: "Copied", description: "Cover letter copied to clipboard" });
  };

  const handleDownload = async () => {
    if (!letter) return;
    setDownloading(true);
    try {
      const blob = await apiService.downloadCoverLetterPdf(letter, company.trim() || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(company.trim() || "cover").replace(/\s+/g, "_")}_cover_letter.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to download PDF";
      toast({ title: "Download failed", description: msg, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Cover Letter" />
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[900px] mx-auto px-6 py-6 space-y-6">
              <div className="rounded-xl border border-line bg-white p-5">
                <h2 className="text-[15px] font-semibold text-ink mb-1">Generate a cover letter</h2>
                <p className="text-[12.5px] text-muted-foreground mb-4">
                  Paste a job posting URL or the job description and we'll write one from your stored resume.
                </p>
                <div className="space-y-3">
                  <Input
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    placeholder="Paste a job posting URL (optional)"
                  />
                  <Textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="…or paste the job description"
                    className="min-h-[160px]"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Job title (optional)"
                    />
                    <Input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Company (optional)"
                    />
                  </div>
                  <Button className="w-full" disabled={!canGenerate} onClick={handleGenerate}>
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    {generating ? "Generating..." : "Generate cover letter · 5 credits"}
                  </Button>

                  {needsResume && (
                    <div className="rounded-lg border border-line bg-paper p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-[13px] text-ink">Upload your resume first</p>
                      </div>
                      <Button size="sm" onClick={() => navigate("/resume")}>
                        Go to Resume
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {letter !== null && (
                <div className="rounded-xl border border-line bg-white p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[15px] font-semibold text-ink">Your cover letter</h2>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleCopy}>
                        <Copy className="w-4 h-4 mr-1.5" />
                        Copy
                      </Button>
                      <Button size="sm" disabled={downloading} onClick={handleDownload}>
                        <Download className="w-4 h-4 mr-1.5" />
                        {downloading ? "Preparing..." : "Download PDF"}
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={letter}
                    onChange={(e) => setLetter(e.target.value)}
                    className="min-h-[380px] font-mono text-[13px] leading-relaxed"
                  />
                  <p className="text-[12px] text-muted-foreground mt-2">
                    Generated from your stored resume. Edits here appear in the PDF.
                  </p>
                </div>
              )}
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default CoverLetterPage;
