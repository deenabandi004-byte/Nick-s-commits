// Standalone home for cover letters: generate one from a job posting (URL or
// pasted description) against the user's stored resume, edit it inline, copy
// it, or download it as a PDF. Hits the same job-board endpoints the Chrome
// extension already uses (generate-cover-letter, cover-letter-pdf) — see
// api.ts's generateCoverLetter / downloadCoverLetterPdf.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { readScoutPrefill, SCOUT_PREFILL_EVENT } from "@/lib/scoutBridge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Copy, Download, FileText } from "lucide-react";
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

  // Scout handoff: the "Open the Cover Letter workshop" chip after an
  // in-chat cover letter carries the job context (posting URL, title,
  // company) AND the generated letter itself through the bridge. Setting
  // `letter` here makes the finished letter and its PDF preview render on
  // arrival — no empty form, no paying credits to regenerate.
  const location = useLocation();
  useEffect(() => {
    const applyHandoff = () => {
      const prefill = readScoutPrefill(location.pathname + location.search);
      if (!prefill) return;
      if (prefill.job_url) setJobUrl(prefill.job_url);
      if (prefill.job_title) setJobTitle(prefill.job_title);
      if (prefill.company) setCompany(prefill.company);
      if (prefill.letter) setLetter(prefill.letter);
    };
    applyHandoff();
    window.addEventListener(SCOUT_PREFILL_EVENT, applyHandoff);
    return () => window.removeEventListener(SCOUT_PREFILL_EVENT, applyHandoff);
  }, [location.pathname, location.search]);

  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [needsResume, setNeedsResume] = useState(false);

  // Paper preview: render the letter through the real /cover-letter-pdf
  // endpoint (free, no credits) so what the user sees is the exact PDF they
  // download. Debounced so typing in Edit mode doesn't spam the backend;
  // the previous preview stays up until the new blob is ready.
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (letter === null) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const blob = await apiService.downloadCoverLetterPdf(letter, company.trim() || undefined);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        // Keep the last good preview; the next edit retries.
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter]);
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

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
      // Backfill fields the server resolved from the URL/pasted text so the
      // PDF filename and the form reflect the real target company/role.
      if (!company.trim() && res.company) setCompany(res.company);
      if (!jobTitle.trim() && res.jobTitle) setJobTitle(res.jobTitle);
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
              <h1
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: 30,
                  fontWeight: 400,
                  lineHeight: "36px",
                  color: "#1e2d4d",
                  margin: 0,
                }}
              >
                Generate a cover letter
              </h1>

              <div className="rounded-xl border border-line bg-white p-5">
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
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h2 className="text-[15px] font-semibold text-ink">Your cover letter</h2>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={viewMode === "preview" ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setViewMode("preview")}
                      >
                        Preview
                      </Button>
                      <Button
                        variant={viewMode === "edit" ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setViewMode("edit")}
                      >
                        Edit text
                      </Button>
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
                  {viewMode === "preview" ? (
                    <div
                      className="rounded-lg border border-line overflow-hidden"
                      style={{ background: "#525659" }}
                    >
                      {previewUrl ? (
                        <iframe
                          src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                          title="Cover letter PDF preview"
                          style={{
                            width: "100%",
                            aspectRatio: "8.5 / 11",
                            border: "none",
                            display: "block",
                          }}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center text-sm text-white/80"
                          style={{ width: "100%", aspectRatio: "8.5 / 11" }}
                        >
                          Rendering preview…
                        </div>
                      )}
                    </div>
                  ) : (
                    <Textarea
                      value={letter}
                      onChange={(e) => setLetter(e.target.value)}
                      className="min-h-[380px] font-mono text-[13px] leading-relaxed"
                    />
                  )}
                  <p className="text-[12px] text-muted-foreground mt-2">
                    Generated from your stored resume. The preview is the exact PDF you'll download.
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
