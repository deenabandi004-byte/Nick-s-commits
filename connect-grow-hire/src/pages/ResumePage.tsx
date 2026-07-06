// Resume home, rebuilt as two tabs:
//   1. "Edit resume"    — structured field editor (left) + live ResumeRenderer
//                         preview (right, sticky) driven by shared ParsedResume
//                         state. Save writes resumeParsed back to the user doc;
//                         Download renders a PDF via @react-pdf/renderer.
//   2. "Tailor to a job" — the previous page's tailor card plus a Job URL
//                         input; either a URL or a >=50-char description
//                         enables the ResumeOptimizationModal flow.
//
// Load path: users/{uid}.resumeParsed -> normalizeParsedResumeFromFirestore.
// Upload path: POST /api/parse-resume (server parses AND stores the full
// resumeParsed) -> persist the file to Storage + resumeUrl/resumeFileName/
// resumeUpdatedAt -> re-read the user doc so the editor repopulates. The old
// thin {name, year, major, university} stub write is intentionally gone — it
// clobbered the server's full parse.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Upload,
  Download,
  RefreshCw,
  Sparkles,
  Save,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { db, storage, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { BACKEND_URL } from "@/services/api";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import { toast } from "@/hooks/use-toast";
import { ResumeOptimizationModal } from "@/components/ResumeOptimizationModal";
import type {
  ParsedResume,
  ParsedResumeContact,
  ParsedResumeEducationEntry,
  ParsedResumeExperienceEntry,
  ParsedResumeProjectEntry,
  ParsedResumeExtracurricularEntry,
} from "@/types/resume";
import { emptyParsedResume, normalizeParsedResumeFromFirestore } from "@/types/resume";
import { generateResumePDF } from "@/utils/resumePDFGenerator";

// Backend minimum for /job-board/optimize-resume-v2 (see api.ts optimizeResumeV2).
const TAILOR_MIN_JD_LENGTH = 50;

type ResumeTab = "edit" | "tailor";

const TABS: { id: ResumeTab; label: string }[] = [
  { id: "edit", label: "Edit resume" },
  { id: "tailor", label: "Tailor to a job" },
];

// The 7 categories both renderers know about; extra keys from the parse still
// get editors (and save fine) even though the preview/PDF skip them.
const SKILL_CATEGORY_ORDER = [
  "programming_languages",
  "tools_frameworks",
  "databases",
  "cloud_devops",
  "core_skills",
  "soft_skills",
  "languages",
];

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  programming_languages: "Programming Languages",
  tools_frameworks: "Tools & Frameworks",
  databases: "Databases",
  cloud_devops: "Cloud / DevOps",
  core_skills: "Core Skills",
  soft_skills: "Soft Skills",
  languages: "Languages",
};

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

// ---------------------------------------------------------------------------
// Small presentational helpers (module scope so identity is stable across
// renders — nested definitions would remount inputs and drop focus).
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  "w-full bg-transparent border-0 border-b border-line focus:border-[#3B82F6] focus:ring-0 rounded-none px-0 py-1.5 text-sm text-ink placeholder:text-gray-400 focus:outline-none";

function EditorSection({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-line pb-1.5 mb-3">
        {title}
      </h2>
      {children}
      {footer}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      {label && <label className="text-xs text-gray-500 block mb-0.5">{label}</label>}
      <input
        className={INPUT_CLASS}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function RemoveEntryButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      className="shrink-0 h-8 w-8 text-gray-400 hover:text-red-600"
      onClick={onClick}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function AddEntryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="outline" size="sm" className="gap-2 mt-2" onClick={onClick}>
      <Plus className="h-4 w-4" /> {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ResumePage = () => {
  const { user } = useFirebaseAuth();
  const uid = user?.uid;

  const [activeTab, setActiveTab] = useState<ResumeTab>("edit");

  // Editor state
  const [resumeData, setResumeData] = useState<ParsedResume>(() => emptyParsedResume());
  const [loading, setLoading] = useState(true);
  const [hasStoredResume, setHasStoredResume] = useState(false);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeUpdatedAt, setResumeUpdatedAt] = useState<string | null>(null);
  // Snapshot of the last loaded/saved state for dirty-tracking.
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(emptyParsedResume())
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  // Raw text drafts for comma-separated skill inputs so typing "a, b," isn't
  // eaten by the split/trim round-trip; cleared whenever fresh data loads.
  const [skillsDraft, setSkillsDraft] = useState<Record<string, string>>({});

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

  const loadResume = useCallback(async (userId: string) => {
    try {
      const snap = await getDoc(doc(db, "users", userId));
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      const parsed = data?.resumeParsed
        ? normalizeParsedResumeFromFirestore(data.resumeParsed)
        : null;
      const next = parsed || emptyParsedResume();
      setResumeData(next);
      setSavedSnapshot(JSON.stringify(next));
      setSkillsDraft({});
      setHasStoredResume(!!parsed);
      setResumeFileName((data?.resumeFileName as string) || null);
      setResumeUpdatedAt((data?.resumeUpdatedAt as string) || null);
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

  const isDirty = useMemo(
    () => JSON.stringify(resumeData) !== savedSnapshot,
    [resumeData, savedSnapshot]
  );

  // Real-PDF live preview: regenerate the ACTUAL ResumePDF document (the same
  // one Download saves) shortly after the user stops typing, and display it in
  // the browser's PDF viewer so it reads as a true paginated sheet of paper.
  // The previous blob stays on screen while the next renders — no blank flash.
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

  // ---- Immutable updaters -------------------------------------------------

  const updateResume = useCallback((updater: (prev: ParsedResume) => ParsedResume) => {
    setResumeData((prev) => updater(prev));
  }, []);

  const updateContact = useCallback(
    (field: keyof ParsedResumeContact, value: string) => {
      updateResume((prev) => ({ ...prev, contact: { ...prev.contact, [field]: value } }));
    },
    [updateResume]
  );

  const updateEducation = useCallback(
    (index: number, field: keyof ParsedResumeEducationEntry, value: string) => {
      updateResume((prev) => {
        const list = [...(prev.education || [])];
        if (!list[index]) return prev;
        list[index] = { ...list[index], [field]: value };
        return { ...prev, education: list };
      });
    },
    [updateResume]
  );

  const addEducation = useCallback(() => {
    updateResume((prev) => ({
      ...prev,
      education: [
        ...(prev.education || []),
        { university: "", degree: "", major: "", graduation: "", gpa: "", location: "", minor: "" },
      ],
    }));
  }, [updateResume]);

  const removeEducation = useCallback(
    (index: number) => {
      updateResume((prev) => ({
        ...prev,
        education: (prev.education || []).filter((_, i) => i !== index),
      }));
    },
    [updateResume]
  );

  const updateExperience = useCallback(
    (index: number, field: keyof ParsedResumeExperienceEntry, value: string) => {
      updateResume((prev) => {
        const list = [...(prev.experience || [])];
        if (!list[index]) return prev;
        list[index] = { ...list[index], [field]: value };
        return { ...prev, experience: list };
      });
    },
    [updateResume]
  );

  const addExperience = useCallback(() => {
    updateResume((prev) => ({
      ...prev,
      experience: [
        ...(prev.experience || []),
        { company: "", title: "", dates: "", location: "", bullets: [] },
      ],
    }));
  }, [updateResume]);

  const removeExperience = useCallback(
    (index: number) => {
      updateResume((prev) => ({
        ...prev,
        experience: (prev.experience || []).filter((_, i) => i !== index),
      }));
    },
    [updateResume]
  );

  const updateExperienceBullet = useCallback(
    (expIndex: number, bulletIndex: number, value: string) => {
      updateResume((prev) => {
        const list = [...(prev.experience || [])];
        const exp = list[expIndex];
        if (!exp) return prev;
        const bullets = [...(exp.bullets || [])];
        bullets[bulletIndex] = value;
        list[expIndex] = { ...exp, bullets };
        return { ...prev, experience: list };
      });
    },
    [updateResume]
  );

  const addExperienceBullet = useCallback(
    (expIndex: number) => {
      updateResume((prev) => {
        const list = [...(prev.experience || [])];
        const exp = list[expIndex];
        if (!exp) return prev;
        list[expIndex] = { ...exp, bullets: [...(exp.bullets || []), ""] };
        return { ...prev, experience: list };
      });
    },
    [updateResume]
  );

  const removeExperienceBullet = useCallback(
    (expIndex: number, bulletIndex: number) => {
      updateResume((prev) => {
        const list = [...(prev.experience || [])];
        const exp = list[expIndex];
        if (!exp) return prev;
        list[expIndex] = { ...exp, bullets: (exp.bullets || []).filter((_, i) => i !== bulletIndex) };
        return { ...prev, experience: list };
      });
    },
    [updateResume]
  );

  const updateProject = useCallback(
    (index: number, field: keyof ParsedResumeProjectEntry, value: string) => {
      updateResume((prev) => {
        const list = [...(prev.projects || [])];
        if (!list[index]) return prev;
        list[index] = { ...list[index], [field]: value };
        return { ...prev, projects: list };
      });
    },
    [updateResume]
  );

  const addProject = useCallback(() => {
    updateResume((prev) => ({
      ...prev,
      projects: [
        ...(prev.projects || []),
        { name: "", description: "", technologies: "", date: "", link: "" },
      ],
    }));
  }, [updateResume]);

  const removeProject = useCallback(
    (index: number) => {
      updateResume((prev) => ({
        ...prev,
        projects: (prev.projects || []).filter((_, i) => i !== index),
      }));
    },
    [updateResume]
  );

  const updateExtracurricular = useCallback(
    (index: number, field: keyof ParsedResumeExtracurricularEntry, value: string) => {
      updateResume((prev) => {
        const list = [...(prev.extracurriculars || [])];
        if (!list[index]) return prev;
        list[index] = { ...list[index], [field]: value };
        return { ...prev, extracurriculars: list };
      });
    },
    [updateResume]
  );

  const addExtracurricular = useCallback(() => {
    updateResume((prev) => ({
      ...prev,
      extracurriculars: [
        ...(prev.extracurriculars || []),
        { organization: "", role: "", dates: "", description: "" },
      ],
    }));
  }, [updateResume]);

  const removeExtracurricular = useCallback(
    (index: number) => {
      updateResume((prev) => ({
        ...prev,
        extracurriculars: (prev.extracurriculars || []).filter((_, i) => i !== index),
      }));
    },
    [updateResume]
  );

  const updateSkillsCategory = useCallback(
    (category: string, raw: string) => {
      setSkillsDraft((d) => ({ ...d, [category]: raw }));
      updateResume((prev) => ({
        ...prev,
        skills: {
          ...(prev.skills || {}),
          [category]: raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }));
    },
    [updateResume]
  );

  // ---- Actions ------------------------------------------------------------

  const handleSave = async () => {
    if (!uid || isSaving || !isDirty) return;
    setIsSaving(true);
    try {
      const updatedAt = new Date().toISOString();
      await updateDoc(doc(db, "users", uid), {
        resumeParsed: resumeData,
        resumeUpdatedAt: updatedAt,
      });
      setSavedSnapshot(JSON.stringify(resumeData));
      setHasStoredResume(true);
      setResumeUpdatedAt(updatedAt);
      toast({ title: "Resume saved" });
    } catch (e) {
      console.error("Save failed", e);
      toast({ title: "Failed to save resume", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

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

      // Re-read the user doc so the editor repopulates from the fresh parse.
      await loadResume(userId);

      toast({ title: "Resume uploaded", description: "We filled in the editor from your file." });
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

  const skillKeys = useMemo(() => {
    const keys = new Set<string>(SKILL_CATEGORY_ORDER);
    Object.keys(resumeData.skills || {}).forEach((k) => keys.add(k));
    return Array.from(keys);
  }, [resumeData.skills]);

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
                        Upload your resume to get started — we&apos;ll fill this in for you.
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
                      <Button size="sm" disabled={!isDirty || isSaving} onClick={handleSave}>
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-1.5" />
                        )}
                        {isSaving ? "Saving..." : isDirty ? "Save" : "Saved"}
                      </Button>
                    </div>
                  </div>
                  {uploadError && (
                    <p className="text-[12px] text-destructive -mt-3 mb-4">{uploadError}</p>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {/* Left: structured editor */}
                    <div className="rounded-xl border border-line bg-white p-6">
                      <EditorSection title="Name & Contact">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field
                            label="Name"
                            value={resumeData.name}
                            onChange={(v) => updateResume((p) => ({ ...p, name: v }))}
                            placeholder="Full name"
                          />
                          <Field
                            label="Email"
                            type="email"
                            value={resumeData.contact.email}
                            onChange={(v) => updateContact("email", v)}
                            placeholder="email@example.com"
                          />
                          <Field
                            label="Phone"
                            value={resumeData.contact.phone}
                            onChange={(v) => updateContact("phone", v)}
                            placeholder="Phone"
                          />
                          <Field
                            label="Location"
                            value={resumeData.contact.location}
                            onChange={(v) => updateContact("location", v)}
                            placeholder="City, State"
                          />
                          <Field
                            label="LinkedIn"
                            value={resumeData.contact.linkedin}
                            onChange={(v) => updateContact("linkedin", v)}
                            placeholder="https://linkedin.com/in/..."
                          />
                          <Field
                            label="GitHub"
                            value={resumeData.contact.github}
                            onChange={(v) => updateContact("github", v)}
                            placeholder="https://github.com/..."
                          />
                          <Field
                            label="Website"
                            value={resumeData.contact.website}
                            onChange={(v) => updateContact("website", v)}
                            placeholder="https://..."
                          />
                        </div>
                      </EditorSection>

                      <EditorSection title="Summary / Objective">
                        <textarea
                          className={`${INPUT_CLASS} min-h-[90px] resize-y`}
                          value={resumeData.objective}
                          onChange={(e) =>
                            updateResume((p) => ({ ...p, objective: e.target.value }))
                          }
                          placeholder="Brief summary or objective"
                        />
                      </EditorSection>

                      <EditorSection
                        title="Education"
                        footer={<AddEntryButton onClick={addEducation} label="Add education" />}
                      >
                        {(resumeData.education || []).map((edu, i) => (
                          <div key={i} className="mb-4 pl-3 border-l-2 border-line flex gap-2">
                            <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1">
                              <div className="col-span-2">
                                <Field
                                  value={edu.university}
                                  onChange={(v) => updateEducation(i, "university", v)}
                                  placeholder="University"
                                />
                              </div>
                              <Field
                                value={edu.degree}
                                onChange={(v) => updateEducation(i, "degree", v)}
                                placeholder="Degree"
                              />
                              <Field
                                value={edu.major}
                                onChange={(v) => updateEducation(i, "major", v)}
                                placeholder="Major"
                              />
                              <Field
                                value={edu.minor || ""}
                                onChange={(v) => updateEducation(i, "minor", v)}
                                placeholder="Minor (optional)"
                              />
                              <Field
                                value={edu.graduation}
                                onChange={(v) => updateEducation(i, "graduation", v)}
                                placeholder="Graduation (e.g. May 2027)"
                              />
                              <Field
                                value={edu.gpa}
                                onChange={(v) => updateEducation(i, "gpa", v)}
                                placeholder="GPA"
                              />
                              <Field
                                value={edu.location}
                                onChange={(v) => updateEducation(i, "location", v)}
                                placeholder="Location"
                              />
                            </div>
                            <RemoveEntryButton
                              onClick={() => removeEducation(i)}
                              title="Remove education"
                            />
                          </div>
                        ))}
                        {(resumeData.education || []).length > 1 && (
                          <p className="text-[11px] text-muted-foreground mb-1">
                            All entries are saved; the preview and PDF currently show the first one.
                          </p>
                        )}
                      </EditorSection>

                      <EditorSection
                        title="Experience"
                        footer={<AddEntryButton onClick={addExperience} label="Add experience" />}
                      >
                        {(resumeData.experience || []).map((exp, i) => (
                          <div key={i} className="mb-5 pl-3 border-l-2 border-line">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1">
                                <Field
                                  value={exp.company}
                                  onChange={(v) => updateExperience(i, "company", v)}
                                  placeholder="Company"
                                />
                                <Field
                                  value={exp.title}
                                  onChange={(v) => updateExperience(i, "title", v)}
                                  placeholder="Title"
                                />
                                <Field
                                  value={exp.dates}
                                  onChange={(v) => updateExperience(i, "dates", v)}
                                  placeholder="Dates"
                                />
                                <Field
                                  value={exp.location}
                                  onChange={(v) => updateExperience(i, "location", v)}
                                  placeholder="Location"
                                />
                              </div>
                              <RemoveEntryButton
                                onClick={() => removeExperience(i)}
                                title="Remove experience"
                              />
                            </div>
                            <ul className="mt-2 space-y-1">
                              {(exp.bullets || []).map((bullet, bi) => (
                                <li key={bi} className="flex gap-2 items-start">
                                  <span className="text-gray-400 mt-1.5">•</span>
                                  <input
                                    className={`${INPUT_CLASS} flex-1`}
                                    value={bullet}
                                    onChange={(e) =>
                                      updateExperienceBullet(i, bi, e.target.value)
                                    }
                                    placeholder="Bullet point"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    title="Remove bullet"
                                    className="shrink-0 h-6 w-6 text-gray-400 hover:text-red-600"
                                    onClick={() => removeExperienceBullet(i, bi)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </li>
                              ))}
                              <li>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-gray-500"
                                  onClick={() => addExperienceBullet(i)}
                                >
                                  <Plus className="h-3 w-3" /> Add bullet
                                </Button>
                              </li>
                            </ul>
                          </div>
                        ))}
                      </EditorSection>

                      <EditorSection
                        title="Projects"
                        footer={<AddEntryButton onClick={addProject} label="Add project" />}
                      >
                        {(resumeData.projects || []).map((proj, i) => (
                          <div key={i} className="mb-4 pl-3 border-l-2 border-line flex gap-2">
                            <div className="flex-1 space-y-1">
                              <Field
                                value={proj.name}
                                onChange={(v) => updateProject(i, "name", v)}
                                placeholder="Project name"
                              />
                              <textarea
                                className={`${INPUT_CLASS} min-h-[56px] resize-y`}
                                value={proj.description}
                                onChange={(e) => updateProject(i, "description", e.target.value)}
                                placeholder="Description"
                              />
                              <div className="grid grid-cols-2 gap-x-3">
                                <Field
                                  value={proj.technologies}
                                  onChange={(v) => updateProject(i, "technologies", v)}
                                  placeholder="Technologies (comma-separated)"
                                />
                                <Field
                                  value={proj.date}
                                  onChange={(v) => updateProject(i, "date", v)}
                                  placeholder="Date"
                                />
                              </div>
                              <Field
                                value={proj.link}
                                onChange={(v) => updateProject(i, "link", v)}
                                placeholder="Link"
                              />
                            </div>
                            <RemoveEntryButton
                              onClick={() => removeProject(i)}
                              title="Remove project"
                            />
                          </div>
                        ))}
                      </EditorSection>

                      <EditorSection title="Skills">
                        <div className="space-y-3">
                          {skillKeys.map((key) => {
                            const values = resumeData.skills?.[key];
                            const display =
                              skillsDraft[key] ??
                              (Array.isArray(values) ? values.join(", ") : "");
                            return (
                              <div key={key}>
                                <label className="text-xs text-gray-500 block mb-0.5">
                                  {SKILL_CATEGORY_LABELS[key] || key.replace(/_/g, " ")}
                                </label>
                                <input
                                  className={INPUT_CLASS}
                                  value={display}
                                  onChange={(e) => updateSkillsCategory(key, e.target.value)}
                                  placeholder="Comma-separated"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </EditorSection>

                      <EditorSection
                        title="Extracurriculars"
                        footer={<AddEntryButton onClick={addExtracurricular} label="Add entry" />}
                      >
                        {(resumeData.extracurriculars || []).map((extra, i) => (
                          <div key={i} className="mb-4 pl-3 border-l-2 border-line flex gap-2">
                            <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1">
                              <Field
                                value={extra.organization}
                                onChange={(v) => updateExtracurricular(i, "organization", v)}
                                placeholder="Organization"
                              />
                              <Field
                                value={extra.role}
                                onChange={(v) => updateExtracurricular(i, "role", v)}
                                placeholder="Role"
                              />
                              <Field
                                value={extra.dates}
                                onChange={(v) => updateExtracurricular(i, "dates", v)}
                                placeholder="Dates"
                              />
                              <Field
                                value={extra.description}
                                onChange={(v) => updateExtracurricular(i, "description", v)}
                                placeholder="Description"
                              />
                            </div>
                            <RemoveEntryButton
                              onClick={() => removeExtracurricular(i)}
                              title="Remove entry"
                            />
                          </div>
                        ))}
                      </EditorSection>
                    </div>

                    {/* Right: live PDF preview (sticky) — the real document,
                        rendered by the browser's PDF viewer so it looks like
                        the paper page you'd actually submit. */}
                    <div className="lg:sticky lg:top-4 self-start">
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
