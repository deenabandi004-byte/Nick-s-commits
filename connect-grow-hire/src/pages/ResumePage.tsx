// Standalone home for the resume: preview the current PDF, replace it, and
// tailor it to a specific job posting. Upload/replace flow mirrors
// AccountSettings.tsx's handleResumeUpload (parse via /api/parse-resume,
// then persist the file to Storage + resumeUrl/resumeFileName/resumeUpdatedAt
// on the user doc) — copied here rather than imported since AccountSettings
// keeps that logic inline.
import React, { useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FileText, Upload, Download, RefreshCw, Sparkles } from "lucide-react";
import { db, storage, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { BACKEND_URL } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { toast } from "@/hooks/use-toast";
import { ResumeOptimizationModal } from "@/components/ResumeOptimizationModal";

// Backend minimum for /job-board/optimize-resume-v2 (see api.ts optimizeResumeV2 docstring).
const TAILOR_MIN_JD_LENGTH = 50;

const ResumePage = () => {
  const { user } = useFirebaseAuth();

  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeUpdatedAt, setResumeUpdatedAt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Bumped after every successful upload so the iframe src changes and the
  // browser refetches instead of showing a cached copy of the old PDF.
  const [cacheBust, setCacheBust] = useState<number>(() => Date.now());

  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadResume = async (uid: string) => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        setResumeUrl((data.resumeUrl as string) || null);
        setResumeFileName((data.resumeFileName as string) || null);
        setResumeUpdatedAt((data.resumeUpdatedAt as string) || null);
      } else {
        setResumeUrl(null);
        setResumeFileName(null);
        setResumeUpdatedAt(null);
      }
    } catch (e) {
      console.error("Failed to load resume from Firestore", e);
    }
  };

  useEffect(() => {
    if (user?.uid) {
      loadResume(user.uid);
    }
  }, [user?.uid]);

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
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not signed in");
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const formData = new FormData();
      formData.append("resume", file);

      const response = await fetch(`${BACKEND_URL}/api/parse-resume`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to parse resume");

      const ts = Date.now();
      const storagePath = `resumes/${uid}/${ts}-${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const userRef = doc(db, "users", uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
        resumeParsed: {
          name: result.data?.name || "",
          year: result.data?.year || "",
          major: result.data?.major || "",
          university: result.data?.university || "",
        },
      });

      await loadResume(uid);
      setCacheBust(Date.now());

      toast({ title: "Success", description: "Resume uploaded successfully" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setUploadError(msg);
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const previewSrc = resumeUrl
    ? `${resumeUrl}${resumeUrl.includes("?") ? "&" : "?"}cb=${cacheBust}#toolbar=0`
    : null;

  const canTailor = jobDescription.trim().length >= TAILOR_MIN_JD_LENGTH && !!resumeUrl;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Resume" />
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[1100px] mx-auto px-6 py-6">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_RESUME_TYPES.accept}
                className="hidden"
                onChange={handleFileSelected}
              />

              <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6">
                {/* Left: preview */}
                <div className="rounded-xl border border-line bg-white p-5">
                  {resumeUrl ? (
                    <>
                      <iframe
                        src={previewSrc || undefined}
                        title="Resume preview"
                        style={{ width: "100%", height: "72vh", border: "none" }}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-line">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ink truncate max-w-[260px]">
                            {resumeFileName || "Resume.pdf"}
                          </p>
                          {resumeUpdatedAt && (
                            <p className="text-[12px] text-muted-foreground">
                              Updated {new Date(resumeUpdatedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => window.open(resumeUrl, "_blank")}>
                            <Download className="w-4 h-4 mr-1.5" />
                            Download
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <RefreshCw className="w-4 h-4 mr-1.5" />
                            {uploading ? "Uploading..." : "Replace"}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-20">
                      <FileText className="w-10 h-10 text-muted-foreground mb-3" />
                      <h2 className="text-[15px] font-semibold text-ink mb-1">No resume yet</h2>
                      <p className="text-[13px] text-muted-foreground mb-4 max-w-[320px]">
                        Upload your resume to preview it here and tailor it to job postings.
                      </p>
                      <Button disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                        <Upload className="w-4 h-4 mr-1.5" />
                        {uploading ? "Uploading..." : "Upload resume"}
                      </Button>
                    </div>
                  )}
                  {uploadError && <p className="text-[12px] text-destructive mt-2">{uploadError}</p>}
                </div>

                {/* Right: tailor to a job */}
                <div className="rounded-xl border border-line bg-white p-5 h-fit">
                  <h2 className="text-[15px] font-semibold text-ink mb-1">Tailor to a job</h2>
                  <p className="text-[12.5px] text-muted-foreground mb-4">
                    Paste a job posting and we'll tailor your resume to match it.
                  </p>
                  <div className="space-y-3">
                    <Textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste the job posting here..."
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
                    {!resumeUrl && (
                      <p className="text-[12px] text-muted-foreground">Upload a resume to enable tailoring.</p>
                    )}
                  </div>
                </div>
              </div>
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
      />
    </SidebarProvider>
  );
};

export default ResumePage;
