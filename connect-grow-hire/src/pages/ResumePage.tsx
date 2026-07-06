// Resume home, two tabs:
//   1. "Edit resume"    — the live real-PDF preview (dominant element) + a
//                         score rail: score the resume against a Harvard
//                         rubric, review path-targeted recommendations,
//                         approve a subset, apply them, and watch the PDF +
//                         score update. The structured field-by-field form
//                         editor that used to live here is gone (see git
//                         history) — approving a recommendation is now the
//                         only way to edit resume text on this page.
//   2. "Tailor to a job" — the previous page's tailor card plus a Job URL
//                         input; either a URL or a >=50-char description
//                         enables the ResumeOptimizationModal flow.
//
// Load path: users/{uid}.resumeParsed -> normalizeParsedResumeFromFirestore.
// Also loads resumeScore/resumeScoreLabel/resumeScoredAt so the last score
// persists across visits.
// Upload path: POST /api/parse-resume (server parses AND stores the full
// resumeParsed) -> persist the file to Storage + resumeUrl/resumeFileName/
// resumeUpdatedAt -> re-read the user doc so the preview repopulates.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Download,
  RefreshCw,
  Sparkles,
  Loader2,
  Wand2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { db, storage, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { apiService, BACKEND_URL } from "@/services/api";
import type { ResumeScoreRecommendation, ResumeScoreResponse } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { toast } from "@/hooks/use-toast";
import { ResumeOptimizationModal } from "@/components/ResumeOptimizationModal";
import type { ParsedResume } from "@/types/resume";
import { emptyParsedResume, normalizeParsedResumeFromFirestore } from "@/types/resume";
import { generateResumePDF } from "@/utils/resumePDFGenerator";

// Backend minimum for /job-board/optimize-resume-v2 (see api.ts optimizeResumeV2).
const TAILOR_MIN_JD_LENGTH = 50;

type ResumeTab = "edit" | "tailor";

const TABS: { id: ResumeTab; label: string }[] = [
  { id: "edit", label: "Edit resume" },
  { id: "tailor", label: "Tailor to a job" },
];

// Rail state machine for the score-and-approve loop.
type ScoreState = "idle" | "scoring" | "scored" | "applying" | "rescoring";

function isPlausibleUrl(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

function normalizeWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// Verify-then-replace: apply every APPROVED recommendation to `data`,
// building one new object immutably. A recommendation is skipped (not
// applied) if the live text at its target no longer matches `current`
// (whitespace-normalized) — e.g. the resume changed since scoring.
function applyRecommendations(
  data: ParsedResume,
  recs: ResumeScoreRecommendation[]
): { next: ParsedResume; applied: number; skipped: number } {
  let next = data;
  let applied = 0;
  let skipped = 0;

  for (const rec of recs) {
    const target = rec.target;
    if (target.section === "experience") {
      const exp = next.experience?.[target.index];
      const current = exp?.bullets?.[target.bullet];
      if (
        exp &&
        typeof current === "string" &&
        normalizeWhitespace(current) === normalizeWhitespace(rec.current)
      ) {
        const bullets = [...exp.bullets];
        bullets[target.bullet] = rec.proposed;
        const experience = [...next.experience];
        experience[target.index] = { ...exp, bullets };
        next = { ...next, experience };
        applied += 1;
      } else {
        skipped += 1;
      }
    } else if (target.section === "projects") {
      const proj = next.projects?.[target.index];
      if (
        proj &&
        normalizeWhitespace(proj.description || "") === normalizeWhitespace(rec.current)
      ) {
        const projects = [...next.projects];
        projects[target.index] = { ...proj, description: rec.proposed };
        next = { ...next, projects };
        applied += 1;
      } else {
        skipped += 1;
      }
    } else {
      skipped += 1;
    }
  }

  return { next, applied, skipped };
}

function scoreColor(score: number): string {
  if (score >= 90) return "#16A34A";
  if (score >= 75) return "#3B82F6";
  if (score >= 60) return "#D97706";
  return "#DC2626";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ResumePage = () => {
  const { user } = useFirebaseAuth();
  const uid = user?.uid;

  const [activeTab, setActiveTab] = useState<ResumeTab>("edit");

  // Resume state (source of truth for the preview + PDF download).
  const [resumeData, setResumeData] = useState<ParsedResume>(() => emptyParsedResume());
  const [loading, setLoading] = useState(true);
  const [hasStoredResume, setHasStoredResume] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeUpdatedAt, setResumeUpdatedAt] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tailor state
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // ---- Score-and-approve state ---------------------------------------------
  const [scoreState, setScoreState] = useState<ScoreState>("idle");
  const [scoreResult, setScoreResult] = useState<ResumeScoreResponse | null>(null);
  const [selectedRecIds, setSelectedRecIds] = useState<Set<string>>(new Set());
  // Persisted last-score chip, read from the user doc and updated after every
  // successful score.
  const [resumeScore, setResumeScore] = useState<number | null>(null);
  const [resumeScoreLabel, setResumeScoreLabel] = useState<string | null>(null);
  const [resumeScoredAt, setResumeScoredAt] = useState<string | null>(null);
  // Shown once, right after an apply+rescore cycle completes.
  const [scoreDelta, setScoreDelta] = useState<{ prev: number; next: number } | null>(null);

  const loadResume = useCallback(async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      const parsed = data?.resumeParsed
        ? normalizeParsedResumeFromFirestore(data.resumeParsed)
        : null;
      const next = parsed || emptyParsedResume();
      setResumeData(next);
      setHasStoredResume(!!parsed);
      setResumeFileName((data?.resumeFileName as string) || null);
      setResumeUpdatedAt((data?.resumeUpdatedAt as string) || null);
      setResumeScore(typeof data?.resumeScore === "number" ? (data.resumeScore as number) : null);
      setResumeScoreLabel((data?.resumeScoreLabel as string) || null);
      setResumeScoredAt((data?.resumeScoredAt as string) || null);
    } catch (e) {
      console.error("Failed to load resume from Firestore", e);
      toast({ title: "Failed to load resume", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (uid) loadResume(uid);
  }, [uid, loadResume]);

  // Real-PDF live preview: regenerate the ACTUAL ResumePDF document (the same
  // one Download saves) shortly after resumeData changes (e.g. once approved
  // edits are applied), and display it in the browser's PDF viewer so it
  // reads as a true paginated sheet of paper. The previous blob stays on
  // screen while the next renders — no blank flash.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRendering, setPreviewRendering] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewRendering(true);
    const timer = setTimeout(async () => {
      try {
        const blob = await generateResumePDF(resumeData);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch {
        // Keep the last good preview; the next edit retries.
      } finally {
        if (!cancelled) setPreviewRendering(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resumeData]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  // ---- Actions --------------------------------------------------------------

  // Minimal internal save used only by the apply flow (no manual field
  // editing exists anymore, so there's no separate dirty-tracked Save button).
  const persistResumeParsed = useCallback(
    async (next: ParsedResume) => {
      if (!uid) return;
      const updatedAt = new Date().toISOString();
      await updateDoc(doc(db, "users", uid), {
        resumeParsed: next,
        resumeUpdatedAt: updatedAt,
      });
      setResumeUpdatedAt(updatedAt);
      setHasStoredResume(true);
    },
    [uid]
  );

  const persistScore = useCallback(
    async (result: ResumeScoreResponse) => {
      if (!uid) return;
      const scoredAt = new Date().toISOString();
      await updateDoc(doc(db, "users", uid), {
        resumeScore: result.score,
        resumeScoreLabel: result.score_label,
        resumeScoredAt: scoredAt,
      });
      setResumeScore(result.score);
      setResumeScoreLabel(result.score_label);
      setResumeScoredAt(scoredAt);
    },
    [uid]
  );

  const handleScore = useCallback(async () => {
    if (!hasStoredResume || scoreState === "scoring" || scoreState === "applying" || scoreState === "rescoring") {
      return;
    }
    setScoreState("scoring");
    setScoreDelta(null);
    try {
      const result = await apiService.scoreResume(resumeData);
      setScoreResult(result);
      setSelectedRecIds(new Set(result.recommendations.map((r) => r.id)));
      await persistScore(result);
      setScoreState("scored");
    } catch (e) {
      console.error("Resume scoring failed", e);
      toast({
        title: "Couldn't score your resume",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
      setScoreState("idle");
    }
  }, [hasStoredResume, resumeData, scoreState, persistScore]);

  const toggleRec = useCallback((id: string) => {
    setSelectedRecIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleApplySelected = useCallback(async () => {
    if (!scoreResult || scoreState !== "scored") return;
    const selected = scoreResult.recommendations.filter((r) => selectedRecIds.has(r.id));
    if (selected.length === 0) {
      toast({ title: "Select at least one change to apply" });
      return;
    }

    setScoreState("applying");
    const { next, applied, skipped } = applyRecommendations(resumeData, selected);

    if (applied === 0) {
      toast({
        title: "Nothing applied",
        description: "Your resume changed since scoring — try re-scoring first.",
        variant: "destructive",
      });
      setScoreState("scored");
      return;
    }

    try {
      // One atomic state update, then one save. The existing debounced
      // preview effect picks up the resumeData change automatically.
      setResumeData(next);
      await persistResumeParsed(next);

      toast({
        title: skipped > 0 ? `${applied} applied, ${skipped} skipped` : `${applied} applied`,
        description:
          skipped > 0 ? "Some changes no longer matched your resume and were skipped." : undefined,
      });

      const prevScore = scoreResult.score;
      setScoreState("rescoring");
      try {
        // Pass the freshly-computed resume directly rather than relying on
        // resumeData state having settled.
        const rescored = await apiService.scoreResume(next);
        setScoreResult(rescored);
        setSelectedRecIds(new Set(rescored.recommendations.map((r) => r.id)));
        await persistScore(rescored);
        setScoreDelta({ prev: prevScore, next: rescored.score });
        setScoreState("scored");
      } catch (e) {
        console.error("Auto-rescore failed", e);
        toast({
          title: "Changes applied, but rescoring failed",
          description: e instanceof Error ? e.message : "Click Score my resume to try again.",
          variant: "destructive",
        });
        setScoreState("idle");
      }
    } catch (e) {
      console.error("Failed to save applied changes", e);
      toast({
        title: "Failed to save your resume",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
      setScoreState("scored");
    }
  }, [scoreResult, scoreState, selectedRecIds, resumeData, persistResumeParsed, persistScore]);

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const blob = await generateResumePDF(resumeData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = resumeData.name.trim().replace(/[\\/:*?"<>|]+/g, "").trim();
      a.href = url;
      a.download = `${base || "resume"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF downloaded" });
    } catch (e) {
      console.error("PDF generation failed", e);
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isValidResumeFile(file)) {
      setUploadError("Please upload a PDF, DOCX, or DOC file");
      event.target.value = "";
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error("Not signed in");
      const token = await auth.currentUser?.getIdToken();

      // The authed parse endpoint stores the full resumeParsed server-side.
      const formData = new FormData();
      formData.append("resume", file);
      const response = await fetch(`${BACKEND_URL}/api/parse-resume`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to parse resume");

      // Persist the original file + metadata (NO resumeParsed stub — the
      // server already stored the full parse; a stub would clobber it).
      const ts = Date.now();
      const storageRef = ref(storage, `resumes/${userId}/${ts}-${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "users", userId), {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
      });

      // Re-read the user doc so the preview + score chip repopulate from the
      // fresh parse. A new upload invalidates any prior score/recommendations.
      setScoreResult(null);
      setScoreState("idle");
      setScoreDelta(null);
      await loadResume(userId);

      toast({ title: "Resume uploaded", description: "We filled in the preview from your file." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setUploadError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const canTailor =
    isPlausibleUrl(jobUrl) || jobDescription.trim().length >= TAILOR_MIN_JD_LENGTH;

  const selectedCount = useMemo(
    () => (scoreResult ? scoreResult.recommendations.filter((r) => selectedRecIds.has(r.id)).length : 0),
    [scoreResult, selectedRecIds]
  );

  const isBusy = scoreState === "scoring" || scoreState === "applying" || scoreState === "rescoring";

  // ---- Render -------------------------------------------------------------

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Resume" />
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[1240px] mx-auto px-6 py-5">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_RESUME_TYPES.accept}
                className="hidden"
                onChange={handleFileSelected}
              />

              {/* Underline tab strip (MyNetworkPage pattern) */}
              <div className="flex items-center gap-1 mb-5">
                {TABS.map((t) => {
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className="inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-all"
                      style={{
                        color: isActive ? "var(--brand-blue, #3B82F6)" : "var(--ink-3, #94A3B8)",
                        borderBottomColor: isActive
                          ? "var(--brand-blue, #3B82F6)"
                          : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.color = "var(--ink-2, #475569)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.color = "var(--ink-3, #94A3B8)";
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : activeTab === "edit" ? (
                <>
                  {/* Upload CTA banner when there's no stored parse yet */}
                  {!hasStoredResume && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 mb-5">
                      <p className="text-[13px] text-ink">
                        Upload your resume to get started — we&apos;ll score it against a Harvard
                        rubric.
                      </p>
                      <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                        {uploading ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-1.5" />
                        )}
                        {uploading ? "Uploading..." : "Upload resume"}
                      </Button>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div className="min-w-0">
                      {resumeFileName && (
                        <p className="text-[13px] font-medium text-ink truncate max-w-[320px]">
                          {resumeFileName}
                        </p>
                      )}
                      {resumeUpdatedAt && (
                        <p className="text-[12px] text-muted-foreground">
                          Updated {new Date(resumeUpdatedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <RefreshCw className="w-4 h-4 mr-1.5" />
                        {uploading ? "Uploading..." : hasStoredResume ? "Replace file" : "Upload file"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloading}
                        onClick={handleDownloadPdf}
                      >
                        {isDownloading ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-1.5" />
                        )}
                        Download PDF
                      </Button>
                    </div>
                  </div>
                  {uploadError && (
                    <p className="text-[12px] text-destructive -mt-3 mb-4">{uploadError}</p>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* Left/main: live PDF preview — the real document,
                        rendered by the browser's PDF viewer so it looks like
                        the paper page you'd actually submit. */}
                    <div className="lg:col-span-2 lg:sticky lg:top-4 self-start">
                      <div className="rounded-xl border border-line bg-white overflow-hidden">
                        <div className="px-4 py-2 border-b border-line bg-paper-2 flex items-center justify-between">
                          <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                            Live preview
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {previewRendering ? "Updating…" : "This is the exact PDF you'll download"}
                          </span>
                        </div>
                        {previewUrl ? (
                          <iframe
                            src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                            title="Resume PDF preview"
                            style={{
                              width: "100%",
                              height: "calc(100vh - 200px)",
                              border: "none",
                              display: "block",
                            }}
                          />
                        ) : (
                          <div
                            className="flex items-center justify-center text-[13px] text-muted-foreground"
                            style={{ height: "calc(100vh - 200px)" }}
                          >
                            Rendering preview…
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: score rail */}
                    <div className="lg:sticky lg:top-4 self-start space-y-4">
                      {scoreState === "idle" && (
                        <div className="rounded-xl border border-line bg-white p-5">
                          <div className="flex items-center gap-2 mb-1">
                            <Wand2 className="h-4 w-4 text-[#3B82F6]" />
                            <h2 className="text-[15px] font-semibold text-ink">Score my resume</h2>
                          </div>
                          <p className="text-[12.5px] text-muted-foreground mb-4">
                            We&apos;ll grade it against a Harvard resume rubric and suggest exact
                            bullet rewrites you can approve one by one.
                          </p>
                          {resumeScore !== null && (
                            <div className="flex items-center justify-between rounded-lg bg-paper-2 px-3 py-2 mb-4">
                              <div>
                                <span
                                  className="text-[18px] font-bold"
                                  style={{ color: scoreColor(resumeScore) }}
                                >
                                  {resumeScore}
                                </span>
                                <span className="text-[12px] text-muted-foreground ml-1.5">
                                  {resumeScoreLabel}
                                </span>
                              </div>
                              {resumeScoredAt && (
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(resumeScoredAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          )}
                          <Button
                            className="w-full"
                            disabled={!hasStoredResume}
                            onClick={handleScore}
                          >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            Score my resume
                          </Button>
                          {!hasStoredResume && (
                            <p className="text-[11px] text-muted-foreground mt-2">
                              Upload a resume first to enable scoring.
                            </p>
                          )}
                        </div>
                      )}

                      {scoreState === "scoring" && (
                        <div className="rounded-xl border border-line bg-white p-8 flex flex-col items-center justify-center text-center">
                          <Loader2 className="h-6 w-6 animate-spin text-[#3B82F6] mb-3" />
                          <p className="text-[13px] text-ink font-medium">
                            Scoring against Harvard resume standards…
                          </p>
                        </div>
                      )}

                      {(scoreState === "scored" ||
                        scoreState === "applying" ||
                        scoreState === "rescoring") &&
                        scoreResult && (
                          <>
                            <div className="rounded-xl border border-line bg-white p-5">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-baseline gap-2">
                                  <span
                                    className="text-[32px] font-bold leading-none"
                                    style={{ color: scoreColor(scoreResult.score) }}
                                  >
                                    {scoreResult.score}
                                  </span>
                                  <span className="text-[13px] font-medium text-muted-foreground">
                                    {scoreResult.score_label}
                                  </span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={handleScore}
                                >
                                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                  Re-score
                                </Button>
                              </div>

                              {scoreDelta && (
                                <div
                                  className="flex items-center gap-1.5 text-[12.5px] font-medium mb-3 rounded-md px-2.5 py-1.5"
                                  style={{
                                    color:
                                      scoreDelta.next >= scoreDelta.prev ? "#16A34A" : "#DC2626",
                                    background:
                                      scoreDelta.next >= scoreDelta.prev ? "#F0FDF4" : "#FEF2F2",
                                  }}
                                >
                                  {scoreDelta.next >= scoreDelta.prev ? (
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  )}
                                  {scoreDelta.prev} → {scoreDelta.next} (
                                  {scoreDelta.next >= scoreDelta.prev ? "+" : ""}
                                  {scoreDelta.next - scoreDelta.prev})
                                </div>
                              )}

                              <p className="text-[12.5px] text-ink-2 mb-4">{scoreResult.summary}</p>

                              <div className="space-y-2.5">
                                {scoreResult.categories.map((cat) => (
                                  <div key={cat.name}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[12px] font-medium text-ink">
                                        {cat.name}
                                      </span>
                                      <span
                                        className="text-[12px] font-semibold"
                                        style={{ color: scoreColor(cat.score) }}
                                      >
                                        {cat.score}
                                      </span>
                                    </div>
                                    <Progress value={cat.score} className="h-1.5" />
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                      {cat.explanation}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {scoreResult.recommendations.length > 0 && (
                              <div className="rounded-xl border border-line bg-white p-5">
                                <h3 className="text-[13px] font-semibold text-ink mb-3">
                                  Recommended changes ({scoreResult.recommendations.length})
                                </h3>
                                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                                  {scoreResult.recommendations.map((rec) => (
                                    <label
                                      key={rec.id}
                                      className="flex gap-2.5 items-start rounded-lg border border-line p-3 cursor-pointer hover:bg-paper-2"
                                    >
                                      <Checkbox
                                        checked={selectedRecIds.has(rec.id)}
                                        onCheckedChange={() => toggleRec(rec.id)}
                                        disabled={isBusy}
                                        className="mt-0.5"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="inline-block text-[10.5px] font-semibold uppercase tracking-wide text-[#3B82F6] bg-[#EFF6FF] rounded px-1.5 py-0.5">
                                            {rec.category}
                                          </span>
                                        </div>
                                        <p className="text-[11.5px] text-muted-foreground mb-1.5">
                                          {rec.reason}
                                        </p>
                                        <p className="text-[12px] text-red-700 bg-red-50 rounded px-2 py-1 line-through decoration-red-400 mb-1">
                                          {rec.current}
                                        </p>
                                        <p className="text-[12px] text-green-800 bg-green-50 rounded px-2 py-1">
                                          {rec.proposed}
                                        </p>
                                      </div>
                                    </label>
                                  ))}
                                </div>
                                <Button
                                  className="w-full mt-4"
                                  disabled={selectedCount === 0 || isBusy}
                                  onClick={handleApplySelected}
                                >
                                  {scoreState === "applying" ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                      Applying…
                                    </>
                                  ) : scoreState === "rescoring" ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                      Rescoring…
                                    </>
                                  ) : (
                                    `Apply ${selectedCount} selected change${selectedCount === 1 ? "" : "s"}`
                                  )}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                    </div>
                  </div>
                </>
              ) : (
                /* Tailor tab */
                <div className="max-w-[560px]">
                  <div className="rounded-xl border border-line bg-white p-5">
                    <h2 className="text-[15px] font-semibold text-ink mb-1">Tailor to a job</h2>
                    <p className="text-[12.5px] text-muted-foreground mb-4">
                      Paste a job posting URL or the description and we&apos;ll tailor your resume
                      to match it.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <Input
                          value={jobUrl}
                          onChange={(e) => setJobUrl(e.target.value)}
                          placeholder="Job posting URL — we'll read it for you"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          If you provide a URL, we read the posting directly and it takes
                          precedence over the pasted description.
                        </p>
                      </div>
                      <Textarea
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        placeholder="...or paste the job description here"
                        className="min-h-[160px]"
                      />
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
                      <Button className="w-full" disabled={!canTailor} onClick={() => setModalOpen(true)}>
                        <Sparkles className="w-4 h-4 mr-1.5" />
                        Tailor resume · 20 credits
                      </Button>
                      {!canTailor && (
                        <p className="text-[12px] text-muted-foreground">
                          Add a job URL or paste at least {TAILOR_MIN_JD_LENGTH} characters of the
                          description to enable tailoring.
                        </p>
                      )}
                      {!hasStoredResume && (
                        <p className="text-[12px] text-muted-foreground">
                          No resume on file yet — upload one in the Edit tab first.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </MainContentWrapper>
      </div>

      <ResumeOptimizationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        jobDescription={jobDescription}
        jobTitle={jobTitle || undefined}
        company={company || undefined}
        jobUrl={jobUrl.trim() || undefined}
      />
    </SidebarProvider>
  );
};

export default ResumePage;
