import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AppHeader } from '@/components/AppHeader';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { Button } from '@/components/ui/button';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { db, auth, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getBlob } from 'firebase/storage';
import { toast } from '@/hooks/use-toast';
import {
  Upload,
  Download,
  Save,
  FileText,
  Trash2,
  Plus,
  Loader2,
  FolderPlus,
  Eye,
  AlertCircle,
} from 'lucide-react';
import type {
  ParsedResume,
  ParsedResumeContact,
  ParsedResumeEducationEntry,
  ParsedResumeExperienceEntry,
  ParsedResumeProjectEntry,
  ParsedResumeExtracurricularEntry,
} from '@/types/resume';
import {
  emptyParsedResume,
  normalizeParsedResumeFromFirestore,
} from '@/types/resume';
import { generatePlainTextResume } from '@/utils/resumeTextGenerator';
import { generateResumePDF } from '@/utils/resumePDFGenerator';
import { saveToResumeLibrary, getResumeLibrary } from '@/services/resumeWorkshop';
import type { LibraryEntry } from '@/services/resumeWorkshop';
import { TailorTab } from '@/components/resume/TailorTab';
import { LibraryTab } from '@/components/resume/LibraryTab';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UniversitySelect } from '@/components/UniversitySelect';
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from '@/utils/resumeFileTypes';
import ResumePDF from '@/components/ResumePDF';
import { pdf } from '@react-pdf/renderer';
import { parseResumeToPdfPayload } from '@/utils/resumePDFGenerator';
import { getResumePdfFilename } from '@/utils/resumeFilename';

import { BACKEND_URL as API_BASE_URL } from '@/services/api';

/** Extract storage path from Firebase Storage URL for getBlob (avoids CORS with raw fetch). */
function getStoragePathFromUrl(url: string): string | null {
  try {
    if (!url) return null;
    // Format 1: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH?...
    const match1 = url.match(/\/o\/(.+?)(\?|$)/);
    if (match1) return decodeURIComponent(match1[1]);
    // Format 2: https://storage.googleapis.com/BUCKET/PATH
    const match2 = url.match(/storage\.googleapis\.com\/[^/]+\/(.+?)(\?|$)/);
    if (match2) return decodeURIComponent(match2[1]);
    // Format 3: https://BUCKET.storage.googleapis.com/PATH
    const match3 = url.match(/\.storage\.googleapis\.com\/(.+?)(\?|$)/);
    if (match3) return decodeURIComponent(match3[1]);
    return null;
  } catch {
    return null;
  }
}

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  programming_languages: 'Programming Languages',
  tools_frameworks: 'Tools & Frameworks',
  databases: 'Databases',
  cloud_devops: 'Cloud / DevOps',
  core_skills: 'Core Skills',
  soft_skills: 'Soft Skills',
  languages: 'Languages',
};

/** Convert ParsedResume to format expected by ResumePDF - use shared util for preview/download */
function resumeDataToPdfPayload(data: ParsedResume | null): any {
  return parseResumeToPdfPayload(data);
}

type ResumeTab = 'editor' | 'tailor' | 'library';

const RESUME_TABS: { id: ResumeTab; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'tailor', label: 'Tailor' },
  { id: 'library', label: 'Library' },
];

/** Pill-style tab bar: filled pill for active, text-only labels, light container */
function ResumeTabBar({
  activeTab,
  onTabChange,
  libraryCount,
}: {
  activeTab: ResumeTab;
  onTabChange: (tab: ResumeTab) => void;
  libraryCount: number;
}) {
  return (
    <div className="shrink-0 px-6 pt-4 pb-4 flex justify-center overflow-x-auto max-w-full scrollbar-hide">
      <div className="inline-flex gap-0 rounded-[3px] p-1 bg-[#EEF2F8]">
        {RESUME_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-[3px] border-none cursor-pointer
                text-sm font-medium transition-all duration-200 ease-out
                focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F0F4FD]
                ${isActive
                  ? 'bg-[#3B82F6] text-white shadow-[0_1px_3px_rgba(59,130,246,0.2)]'
                  : 'bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }
              `}
            >
              <span>{tab.label}</span>
              {tab.id === 'library' && libraryCount > 0 && (
                <span
                  className={`
                    ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium
                    ${isActive ? 'bg-white/20 text-white' : 'bg-[#DBEAFE] text-[#3B82F6]'}
                  `}
                >
                  {libraryCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ResumePage() {
  const { user, updateCredits } = useFirebaseAuth();
  const uid = user?.uid;
  const [resumeData, setResumeData] = useState<ParsedResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showSaveToLibraryDialog, setShowSaveToLibraryDialog] = useState(false);
  const [saveToLibraryVersionName, setSaveToLibraryVersionName] = useState('');
  const [saveToLibraryJobTitle, setSaveToLibraryJobTitle] = useState('');
  const [saveToLibraryCompany, setSaveToLibraryCompany] = useState('');
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [originalPdfUrl, setOriginalPdfUrl] = useState<string | null>(null);
  const [originalPdfBlobUrl, setOriginalPdfBlobUrl] = useState<string | null>(null);
  const originalPdfBlobUrlRef = useRef<string | null>(null);
  const tailorPatchedPdfBlobUrlRef = useRef<string | null>(null);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [buildFromScratch, setBuildFromScratch] = useState(false);

  const [activeTab, setActiveTab] = useState<ResumeTab>('editor');
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryPreviewEntry, setLibraryPreviewEntry] = useState<LibraryEntry | null>(null);
  const [hasStoredResume, setHasStoredResume] = useState(false);
  const [tailorPreviewBlobUrl, setTailorPreviewBlobUrl] = useState<string | null>(null);
  const [tailorPatchedPdfUrl, setTailorPatchedPdfUrl] = useState<string | null>(null);
  const [tailorPatchedPdfBlobUrl, setTailorPatchedPdfBlobUrl] = useState<string | null>(null);
  const [tailorPreviewState, setTailorPreviewState] = useState<{
    acceptedCount: number;
    isShowingPreview: boolean;
  } | null>(null);
  const [tailorPatchResult, setTailorPatchResult] = useState<{
    unsafeCount: number;
    notFoundCount: number;
  } | null>(null);
  const [isTailorPreviewLoading, setIsTailorPreviewLoading] = useState(false);

  const loadResume = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      const data = snap.exists() ? snap.data() : null;
      const parsed = data?.resumeParsed ? normalizeParsedResumeFromFirestore(data.resumeParsed) : null;
      setResumeData(parsed || emptyParsedResume());
      setHasStoredResume(!!(data?.resumeParsed || data?.resumeUrl));
      const resumeUrl = data?.resumeUrl || null;
      console.log('[DEBUG] resumeUrl:', resumeUrl);
      setOriginalPdfUrl(resumeUrl);
      if (resumeUrl) {
        const path = getStoragePathFromUrl(resumeUrl);
        console.log('[DEBUG] extracted path:', path);
        if (path) {
          console.log('[DEBUG] calling getBlob...');
          getBlob(ref(storage, path))
            .then((blob) => {
              console.log('[DEBUG] getBlob SUCCESS, size:', blob.size);
              const pdfBlob = new Blob([blob], { type: 'application/pdf' });
              const blobUrl = URL.createObjectURL(pdfBlob);
              setOriginalPdfBlobUrl((old) => {
                if (old) URL.revokeObjectURL(old);
                originalPdfBlobUrlRef.current = blobUrl;
                return blobUrl;
              });
            })
            .catch((err) => console.error('[DEBUG] getBlob FAILED:', err));
        } else {
          console.log('[DEBUG] path extraction returned null');
        }
      } else {
        setOriginalPdfBlobUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          originalPdfBlobUrlRef.current = null;
          return null;
        });
      }
    } catch (e) {
      console.error('Failed to load resume', e);
      toast({ title: 'Failed to load resume', variant: 'destructive' });
      setResumeData(emptyParsedResume());
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadResume();
  }, [loadResume]);

  const loadLibrary = useCallback(async () => {
    if (!uid) return;
    setIsLoadingLibrary(true);
    try {
      const result = await getResumeLibrary();
      if (result.status === 'ok' && result.entries) setLibraryEntries(result.entries);
    } catch (e) {
      console.error('Failed to load library', e);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [uid]);

  useEffect(() => {
    if (activeTab === 'library') loadLibrary();
  }, [activeTab, loadLibrary]);

  useEffect(() => {
    if (activeTab !== 'library') setLibraryPreviewEntry(null);
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (originalPdfBlobUrlRef.current) URL.revokeObjectURL(originalPdfBlobUrlRef.current);
      if (tailorPatchedPdfBlobUrlRef.current) URL.revokeObjectURL(tailorPatchedPdfBlobUrlRef.current);
    };
  }, []);

  const updateResume = useCallback((updater: (prev: ParsedResume) => ParsedResume) => {
    setResumeData((prev) => {
      const next = prev ? updater(prev) : updater(emptyParsedResume());
      return next;
    });
  }, []);

  const updateContact = useCallback((field: keyof ParsedResumeContact, value: string) => {
    updateResume((prev) => ({
      ...prev,
      contact: { ...prev.contact, [field]: value },
    }));
  }, [updateResume]);

  const updateEducation = useCallback((index: number, field: keyof ParsedResumeEducationEntry, value: any) => {
    updateResume((prev) => {
      const list = [...(prev.education || [])];
      while (list.length <= index) list.push({ university: '', degree: '', major: '', graduation: '', gpa: '', location: '' });
      list[index] = { ...list[index], [field]: value };
      return { ...prev, education: list };
    });
  }, [updateResume]);

  const addEducation = useCallback(() => {
    updateResume((prev) => ({
      ...prev,
      education: [...(prev.education || []), { university: '', degree: '', major: '', graduation: '', gpa: '', location: '' }],
    }));
  }, [updateResume]);

  const removeEducation = useCallback((index: number) => {
    updateResume((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  }, [updateResume]);

  const updateExperience = useCallback((index: number, field: keyof ParsedResumeExperienceEntry, value: any) => {
    updateResume((prev) => {
      const list = [...(prev.experience || [])];
      while (list.length <= index) list.push({ company: '', title: '', dates: '', location: '', bullets: [] });
      list[index] = { ...list[index], [field]: value };
      return { ...prev, experience: list };
    });
  }, [updateResume]);

  const addExperienceBullet = useCallback((expIndex: number) => {
    updateResume((prev) => {
      const list = prev.experience ? [...prev.experience] : [];
      const exp = list[expIndex];
      if (!exp) return prev;
      list[expIndex] = { ...exp, bullets: [...(exp.bullets || []), ''] };
      return { ...prev, experience: list };
    });
  }, [updateResume]);

  const updateExperienceBullet = useCallback((expIndex: number, bulletIndex: number, value: string) => {
    updateResume((prev) => {
      const list = prev.experience ? [...prev.experience] : [];
      const exp = list[expIndex];
      if (!exp) return prev;
      const bullets = [...(exp.bullets || [])];
      bullets[bulletIndex] = value;
      list[expIndex] = { ...exp, bullets };
      return { ...prev, experience: list };
    });
  }, [updateResume]);

  const removeExperienceBullet = useCallback((expIndex: number, bulletIndex: number) => {
    updateResume((prev) => {
      const list = prev.experience ? [...prev.experience] : [];
      const exp = list[expIndex];
      if (!exp) return prev;
      const bullets = (exp.bullets || []).filter((_, i) => i !== bulletIndex);
      list[expIndex] = { ...exp, bullets };
      return { ...prev, experience: list };
    });
  }, [updateResume]);

  const addExperience = useCallback(() => {
    updateResume((prev) => ({
      ...prev,
      experience: [...(prev.experience || []), { company: '', title: '', dates: '', location: '', bullets: [] }],
    }));
  }, [updateResume]);

  const removeExperience = useCallback((index: number) => {
    updateResume((prev) => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index),
    }));
  }, [updateResume]);

  const updateProject = useCallback((index: number, field: keyof ParsedResumeProjectEntry, value: string) => {
    updateResume((prev) => {
      const list = [...(prev.projects || [])];
      while (list.length <= index) list.push({ name: '', description: '', technologies: '', date: '', link: '' });
      list[index] = { ...list[index], [field]: value };
      return { ...prev, projects: list };
    });
  }, [updateResume]);

  const addProject = useCallback(() => {
    updateResume((prev) => ({
      ...prev,
      projects: [...(prev.projects || []), { name: '', description: '', technologies: '', date: '', link: '' }],
    }));
  }, [updateResume]);

  const removeProject = useCallback((index: number) => {
    updateResume((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index),
    }));
  }, [updateResume]);

  const updateExtracurricular = useCallback((index: number, field: keyof ParsedResumeExtracurricularEntry, value: string) => {
    updateResume((prev) => {
      const list = [...(prev.extracurriculars || [])];
      while (list.length <= index) list.push({ organization: '', role: '', dates: '', description: '' });
      list[index] = { ...list[index], [field]: value };
      return { ...prev, extracurriculars: list };
    });
  }, [updateResume]);

  const addExtracurricular = useCallback(() => {
    updateResume((prev) => ({
      ...prev,
      extracurriculars: [...(prev.extracurriculars || []), { organization: '', role: '', dates: '', description: '' }],
    }));
  }, [updateResume]);

  const removeExtracurricular = useCallback((index: number) => {
    updateResume((prev) => ({
      ...prev,
      extracurriculars: prev.extracurriculars.filter((_, i) => i !== index),
    }));
  }, [updateResume]);

  const updateSkillsCategory = useCallback((category: string, values: string[]) => {
    updateResume((prev) => ({
      ...prev,
      skills: { ...(prev.skills || {}), [category]: values },
    }));
  }, [updateResume]);

  const addSkillsCategory = useCallback(() => {
    const key = 'custom_' + Date.now();
    updateResume((prev) => ({
      ...prev,
      skills: { ...(prev.skills || {}), [key]: [] },
    }));
  }, [updateResume]);

  const handleSave = async () => {
    if (!uid || !resumeData) return;
    setIsSaving(true);
    try {
      const resumeText = generatePlainTextResume(resumeData);
      const pdfBlob = await generateResumePDF(resumeData);
      const storagePath = `resumes/${uid}/resume-${Date.now()}.pdf`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, pdfBlob);
      const downloadUrl = await getDownloadURL(storageRef);
      await setDoc(
        doc(db, 'users', uid),
        {
          resumeParsed: resumeData,
          resumeText,
          resumeUrl: downloadUrl,
          resumeFileName: getResumePdfFilename(resumeData, undefined),
          resumeUpdatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      toast({ title: 'Resume saved and PDF generated' });
    } catch (e) {
      console.error('Save failed', e);
      toast({ title: 'Failed to save resume', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uid) return;
    if (!isValidResumeFile(file)) {
      toast({ title: 'Invalid file type', description: 'Use PDF, DOCX, or DOC.', variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/parse-resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed');
      const parsed = result.data ? normalizeParsedResumeFromFirestore(result.data) : null;
      if (parsed) setResumeData(parsed);
      if (result.resumeUrl) {
        setOriginalPdfUrl(result.resumeUrl);
        const path = getStoragePathFromUrl(result.resumeUrl);
        if (path) {
          const storageRef = ref(storage, path);
          getBlob(storageRef)
            .then((blob) => {
              const pdfBlob = new Blob([blob], { type: 'application/pdf' });
              const blobUrl = URL.createObjectURL(pdfBlob);
              setOriginalPdfBlobUrl((old) => {
                if (old) URL.revokeObjectURL(old);
                originalPdfBlobUrlRef.current = blobUrl;
                return blobUrl;
              });
            })
            .catch((err) => console.error('Failed to load original PDF for preview:', err));
        }
      }
      toast({ title: 'Resume uploaded and parsed' });
    } catch (err) {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadClick = () => {
    const hasData = resumeData && (resumeData.name || resumeData.experience?.length || resumeData.education?.length);
    if (hasData && !window.confirm('This will replace your current resume data. Continue?')) return;
    fileInputRef.current?.click();
  };

  const handleDownloadPdf = async () => {
    if (!resumeData) return;
    try {
      if (activeTab === 'tailor' && tailorPatchedPdfUrl) {
        const response = await fetch(tailorPatchedPdfUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getResumePdfFilename(resumeData, tailorPreviewState?.acceptedCount ? 'tailored' : undefined);
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'PDF downloaded' });
        return;
      }
      const payload = resumeDataToPdfPayload(resumeData);
      if (!payload?.name && !payload?.Summary && !(payload?.Experience?.length)) {
        toast({ title: 'Add at least name, summary, or experience to download PDF', variant: 'destructive' });
        return;
      }
      const blob = await generateResumePDF(resumeData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getResumePdfFilename(resumeData, undefined);
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'PDF downloaded' });
    } catch (e) {
      toast({ title: 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  const openSaveToLibraryDialog = () => {
    setSaveToLibraryVersionName(
      getResumePdfFilename(resumeData, undefined).replace(/\.pdf$/i, '') || `Resume - ${new Date().toLocaleDateString()}`
    );
    setSaveToLibraryJobTitle('');
    setSaveToLibraryCompany('');
    setShowSaveToLibraryDialog(true);
  };

  const handleSaveToLibraryConfirm = async () => {
    if (!resumeData) return;
    setIsSavingToLibrary(true);
    try {
      const blob = await generateResumePDF(resumeData);
      const buffer = await blob.arrayBuffer();
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const res = await saveToResumeLibrary({
        display_name: saveToLibraryVersionName.trim() || `Resume - ${new Date().toLocaleDateString()}`,
        job_title: saveToLibraryJobTitle.trim() || undefined,
        company: saveToLibraryCompany.trim() || undefined,
        pdf_base64: pdfBase64,
        structured_data: resumeData,
        source: 'manual',
      });
      if (res.status === 'error') {
        toast({ title: 'Error', description: res.message, variant: 'destructive' });
        return;
      }
      setShowSaveToLibraryDialog(false);
      toast({ title: 'Saved to library' });
    } catch (e) {
      toast({ title: 'Failed to save to library', variant: 'destructive' });
    } finally {
      setIsSavingToLibrary(false);
    }
  };

  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    if (!resumeData) {
      setPreviewBlobUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      return;
    }
    previewDebounceRef.current = setTimeout(() => {
      const payload = resumeDataToPdfPayload(resumeData);
      pdf(<ResumePDF resume={payload} />)
        .toBlob()
        .then((blob) => {
          setPreviewBlobUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(blob);
          });
        })
        .catch(() => {});
    }, 500);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [resumeData]);

  useEffect(() => {
    if (activeTab !== 'tailor') {
      setTailorPreviewBlobUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      setTailorPatchedPdfUrl(null);
      setTailorPatchedPdfBlobUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        tailorPatchedPdfBlobUrlRef.current = null;
        return null;
      });
      setTailorPreviewState(null);
      setTailorPatchResult(null);
      setIsTailorPreviewLoading(false);
    }
  }, [activeTab]);

  const handleTailorPreviewData = useCallback((data: ParsedResume | null) => {
    if (!data) {
      setTailorPreviewBlobUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      setIsTailorPreviewLoading(false);
      return;
    }
    setIsTailorPreviewLoading(true);
    generateResumePDF(data).then((blob) => {
      setTailorPreviewBlobUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      setIsTailorPreviewLoading(false);
    });
  }, []);

  const handleTailorPreviewState = useCallback(
    (state: { acceptedCount: number; isShowingPreview: boolean } | null) => {
      setTailorPreviewState(state);
    },
    []
  );

  const handleTailorPatchedPdfUrl = useCallback((url: string | null) => {
    setTailorPatchedPdfUrl(url);
    if (!url) {
      setTailorPatchedPdfBlobUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        tailorPatchedPdfBlobUrlRef.current = null;
        return null;
      });
      return;
    }
    const path = getStoragePathFromUrl(url);
    if (path) {
      const storageRef = ref(storage, path);
      getBlob(storageRef)
        .then((blob) => {
          const pdfBlob = new Blob([blob], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(pdfBlob);
          setTailorPatchedPdfBlobUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            tailorPatchedPdfBlobUrlRef.current = blobUrl;
            return blobUrl;
          });
          setIsTailorPreviewLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load patched PDF:', err);
          setIsTailorPreviewLoading(false);
        });
    } else {
      setIsTailorPreviewLoading(false);
    }
  }, []);

  const handleTailorPatchResult = useCallback(
    (result: { unsafeCount: number; notFoundCount: number } | null) => {
      setTailorPatchResult(result);
    },
    []
  );

  const inputClass =
    'w-full bg-transparent border-0 border-b border-transparent focus:border-[#3B82F6] focus:ring-0 rounded-none px-0 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none';
  const sectionClass = 'mb-6';
  const sectionTitleClass = 'text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 pb-1.5 mb-3';

  if (loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <MainContentWrapper>
            <AppHeader title="My Resume" />
            <main className="flex-1 flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </main>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  const hasResume =
    resumeData &&
    (buildFromScratch ||
      !!resumeData.name ||
      !!resumeData.experience?.length ||
      !!resumeData.education?.length ||
      !!resumeData.objective?.trim());

  console.log('[DEBUG] originalPdfBlobUrl:', originalPdfBlobUrl);
  console.log('[DEBUG] previewBlobUrl:', previewBlobUrl);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FFFFFF]">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader
            title="My Resume"
            rightContent={
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_RESUME_TYPES.accept}
                  onChange={handleUpload}
                  className="hidden"
                />
                <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isUploading} className="gap-2">
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload New
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={!hasResume} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            }
          />
          <main className="flex-1 flex flex-col overflow-hidden" style={{ background: '#FAFBFF' }}>
            {/* Tab bar - StripeTabs pattern */}
            <ResumeTabBar
              activeTab={activeTab}
              onTabChange={setActiveTab}
              libraryCount={libraryEntries.length}
            />

            <div className="flex-1 flex min-h-0 gap-4 p-4 overflow-hidden">
              {/* Left: Tab content ~55% - white card */}
              <div className="w-[55%] min-w-0 flex flex-col overflow-hidden rounded-[3px] shadow-sm border border-gray-100 bg-white">
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-2xl mx-auto px-6 py-8">
                  {activeTab === 'editor' && (
                    <>
                      {!hasResume ? (
                    <div className="text-center py-16">
                      <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 mb-6">No resume yet</p>
                      <Button onClick={handleUploadClick} className="gap-2 mb-3">
                        <Upload className="h-4 w-4" />
                        Upload Your Resume
                      </Button>
                      <p className="text-sm text-gray-400 mb-2">or</p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setResumeData(emptyParsedResume());
                          setBuildFromScratch(true);
                        }}
                      >
                        Build from scratch
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Contact */}
                      <section className={sectionClass}>
                        <h2 className={sectionTitleClass}>Contact</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Name</label>
                            <input
                              className={inputClass}
                              value={resumeData.name}
                              onChange={(e) => updateResume((p) => ({ ...p, name: e.target.value }))}
                              placeholder="Full name"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Email</label>
                            <input
                              className={inputClass}
                              type="email"
                              value={resumeData.contact.email}
                              onChange={(e) => updateContact('email', e.target.value)}
                              placeholder="email@example.com"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Phone</label>
                            <input
                              className={inputClass}
                              value={resumeData.contact.phone}
                              onChange={(e) => updateContact('phone', e.target.value)}
                              placeholder="Phone"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Location</label>
                            <input
                              className={inputClass}
                              value={resumeData.contact.location}
                              onChange={(e) => updateContact('location', e.target.value)}
                              placeholder="City, State"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">LinkedIn</label>
                            <input
                              className={inputClass}
                              value={resumeData.contact.linkedin}
                              onChange={(e) => updateContact('linkedin', e.target.value)}
                              placeholder="https://linkedin.com/in/..."
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">GitHub</label>
                            <input
                              className={inputClass}
                              value={resumeData.contact.github}
                              onChange={(e) => updateContact('github', e.target.value)}
                              placeholder="https://github.com/..."
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-0.5">Website</label>
                            <input
                              className={inputClass}
                              value={resumeData.contact.website}
                              onChange={(e) => updateContact('website', e.target.value)}
                              placeholder="https://..."
                            />
                          </div>
                        </div>
                      </section>

                      {/* Summary */}
                      <section className={sectionClass}>
                        <h2 className={sectionTitleClass}>Summary / Objective</h2>
                        <textarea
                          className={`${inputClass} min-h-[100px] resize-y border-b`}
                          value={resumeData.objective}
                          onChange={(e) => updateResume((p) => ({ ...p, objective: e.target.value }))}
                          placeholder="Brief summary or objective"
                        />
                      </section>

                      {/* Experience */}
                      <section className={sectionClass}>
                        <h2 className={sectionTitleClass}>Experience</h2>
                        {(resumeData.experience || []).map((exp, expIndex) => (
                          <div key={expIndex} className="mb-6 pl-2 border-l-2 border-gray-100">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <input
                                  className={inputClass}
                                  value={exp.company}
                                  onChange={(e) => updateExperience(expIndex, 'company', e.target.value)}
                                  placeholder="Company"
                                />
                                <input
                                  className={inputClass}
                                  value={exp.title}
                                  onChange={(e) => updateExperience(expIndex, 'title', e.target.value)}
                                  placeholder="Title"
                                />
                                <input
                                  className={inputClass}
                                  value={exp.dates}
                                  onChange={(e) => updateExperience(expIndex, 'dates', e.target.value)}
                                  placeholder="Dates"
                                />
                                <input
                                  className={inputClass}
                                  value={exp.location}
                                  onChange={(e) => updateExperience(expIndex, 'location', e.target.value)}
                                  placeholder="Location"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="shrink-0 h-8 w-8 text-gray-400 hover:text-red-600"
                                onClick={() => removeExperience(expIndex)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <ul className="mt-2 space-y-1">
                              {(exp.bullets || []).map((bullet, bi) => (
                                <li key={bi} className="flex gap-2 items-start">
                                  <span className="text-gray-400 mt-1.5">•</span>
                                  <input
                                    className={`${inputClass} flex-1`}
                                    value={bullet}
                                    onChange={(e) => updateExperienceBullet(expIndex, bi, e.target.value)}
                                    placeholder="Bullet point"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 h-6 w-6 text-gray-400"
                                    onClick={() => removeExperienceBullet(expIndex, bi)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </li>
                              ))}
                              <li>
                                <Button type="button" variant="ghost" size="sm" className="gap-1 text-gray-500" onClick={() => addExperienceBullet(expIndex)}>
                                  <Plus className="h-3 w-3" /> Add bullet
                                </Button>
                              </li>
                            </ul>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="gap-2 mt-2" onClick={addExperience}>
                          <Plus className="h-4 w-4" /> Add Experience
                        </Button>
                      </section>

                      {/* Education */}
                      <section className={sectionClass}>
                        <h2 className={sectionTitleClass}>Education</h2>
                        {(resumeData.education || []).map((edu, eduIndex) => (
                          <div key={eduIndex} className="mb-4 pl-2 border-l-2 border-gray-100 flex gap-2">
                            <div className="flex-1 grid grid-cols-2 gap-2">
                              <div className="col-span-2">
                                <UniversitySelect
                                  value={edu.university}
                                  onValueChange={(v) => updateEducation(eduIndex, 'university', v)}
                                  placeholder="University"
                                  variant="settings"
                                />
                              </div>
                              <input
                                className={inputClass}
                                value={edu.degree}
                                onChange={(e) => updateEducation(eduIndex, 'degree', e.target.value)}
                                placeholder="Degree"
                              />
                              <input
                                className={inputClass}
                                value={edu.major}
                                onChange={(e) => updateEducation(eduIndex, 'major', e.target.value)}
                                placeholder="Major"
                              />
                              <input
                                className={inputClass}
                                value={edu.graduation}
                                onChange={(e) => updateEducation(eduIndex, 'graduation', e.target.value)}
                                placeholder="Graduation"
                              />
                              <input
                                className={inputClass}
                                value={edu.gpa}
                                onChange={(e) => updateEducation(eduIndex, 'gpa', e.target.value)}
                                placeholder="GPA"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 h-8 w-8 text-gray-400 hover:text-red-600"
                              onClick={() => removeEducation(eduIndex)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="gap-2 mt-2" onClick={addEducation}>
                          <Plus className="h-4 w-4" /> Add Education
                        </Button>
                      </section>

                      {/* Skills */}
                      <section className={sectionClass}>
                        <h2 className={sectionTitleClass}>Skills</h2>
                        <div className="space-y-3">
                          {Object.entries(resumeData.skills || {}).map(([key, values]) => (
                            <div key={key}>
                              <label className="text-xs text-gray-500 block mb-0.5">
                                {SKILL_CATEGORY_LABELS[key] || key.replace(/_/g, ' ')}
                              </label>
                              <input
                                className={inputClass}
                                value={Array.isArray(values) ? values.join(', ') : ''}
                                onChange={(e) =>
                                  updateSkillsCategory(
                                    key,
                                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                                  )
                                }
                                placeholder="Comma-separated"
                              />
                            </div>
                          ))}
                          <Button type="button" variant="ghost" size="sm" className="gap-1 text-gray-500" onClick={addSkillsCategory}>
                            <Plus className="h-3 w-3" /> Add category
                          </Button>
                        </div>
                      </section>

                      {/* Projects */}
                      <section className={sectionClass}>
                        <h2 className={sectionTitleClass}>Projects</h2>
                        {(resumeData.projects || []).map((proj, pi) => (
                          <div key={pi} className="mb-4 pl-2 border-l-2 border-gray-100 flex gap-2">
                            <div className="flex-1 space-y-2">
                              <input
                                className={inputClass}
                                value={proj.name}
                                onChange={(e) => updateProject(pi, 'name', e.target.value)}
                                placeholder="Project name"
                              />
                              <textarea
                                className={`${inputClass} min-h-[60px] resize-y`}
                                value={proj.description}
                                onChange={(e) => updateProject(pi, 'description', e.target.value)}
                                placeholder="Description"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  className={inputClass}
                                  value={proj.technologies}
                                  onChange={(e) => updateProject(pi, 'technologies', e.target.value)}
                                  placeholder="Technologies"
                                />
                                <input
                                  className={inputClass}
                                  value={proj.date}
                                  onChange={(e) => updateProject(pi, 'date', e.target.value)}
                                  placeholder="Date"
                                />
                              </div>
                              <input
                                className={inputClass}
                                value={proj.link}
                                onChange={(e) => updateProject(pi, 'link', e.target.value)}
                                placeholder="Link"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 h-8 w-8 text-gray-400 hover:text-red-600"
                              onClick={() => removeProject(pi)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="gap-2 mt-2" onClick={addProject}>
                          <Plus className="h-4 w-4" /> Add Project
                        </Button>
                      </section>

                      {/* Extracurriculars */}
                      <section className={sectionClass}>
                        <h2 className={sectionTitleClass}>Extracurriculars</h2>
                        {(resumeData.extracurriculars || []).map((extra, ei) => (
                          <div key={ei} className="mb-4 pl-2 border-l-2 border-gray-100 flex gap-2">
                            <div className="flex-1 grid grid-cols-2 gap-2">
                              <input
                                className={inputClass}
                                value={extra.organization}
                                onChange={(e) => updateExtracurricular(ei, 'organization', e.target.value)}
                                placeholder="Organization"
                              />
                              <input
                                className={inputClass}
                                value={extra.role}
                                onChange={(e) => updateExtracurricular(ei, 'role', e.target.value)}
                                placeholder="Role"
                              />
                              <input
                                className={inputClass}
                                value={extra.dates}
                                onChange={(e) => updateExtracurricular(ei, 'dates', e.target.value)}
                                placeholder="Dates"
                              />
                              <input
                                className={inputClass}
                                value={extra.description}
                                onChange={(e) => updateExtracurricular(ei, 'description', e.target.value)}
                                placeholder="Description"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 h-8 w-8 text-gray-400 hover:text-red-600"
                              onClick={() => removeExtracurricular(ei)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" className="gap-2 mt-2" onClick={addExtracurricular}>
                          <Plus className="h-4 w-4" /> Add Entry
                        </Button>
                      </section>

                      <div className="pt-6 border-t">
                        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save Changes
                        </Button>
                        <Button type="button" variant="outline" onClick={openSaveToLibraryDialog} className="gap-2 ml-2">
                          <FolderPlus className="h-4 w-4" />
                          Save to Library
                        </Button>
                      </div>
                    </>
                  )}
                </>
                  )}
                  {activeTab === 'tailor' && uid && (
                    <TailorTab
                      uid={uid}
                      resumeData={resumeData}
                      setResumeData={setResumeData}
                      onSwitchToEditor={() => setActiveTab('editor')}
                      loadLibrary={loadLibrary}
                      updateCredits={updateCredits}
                      credits={user?.credits ?? 0}
                      onTailorPreviewData={handleTailorPreviewData}
                      onTailorPreviewState={handleTailorPreviewState}
                      onTailorPatchedPdfUrl={handleTailorPatchedPdfUrl}
                      onTailorPatchResult={handleTailorPatchResult}
                    />
                  )}
                  {activeTab === 'library' && uid && (
                    <LibraryTab
                      uid={uid}
                      loadLibrary={loadLibrary}
                      entries={libraryEntries}
                      isLoadingLibrary={isLoadingLibrary}
                      onUseAsMain={(parsed) => { setResumeData(parsed); setActiveTab('editor'); setLibraryPreviewEntry(null); }}
                      onPreviewEntry={setLibraryPreviewEntry}
                      previewEntryId={libraryPreviewEntry?.id ?? null}
                    />
                  )}
                </div>
              </div>
              </div>

              {/* Right: PDF preview ~45% - white card */}
              <div className="w-[45%] shrink-0 flex flex-col min-h-0 rounded-[3px] shadow-sm border border-gray-100 bg-white overflow-hidden">
                {activeTab === 'tailor' && tailorPreviewState?.isShowingPreview ? (
                  <>
                    <div className={`px-3 py-2 text-xs flex flex-col gap-1 border-b ${isTailorPreviewLoading ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        {isTailorPreviewLoading ? 'Updating preview...' : `Preview with ${tailorPreviewState.acceptedCount} accepted change${tailorPreviewState.acceptedCount !== 1 ? 's' : ''}`}
                      </div>
                      {tailorPatchResult && (tailorPatchResult.unsafeCount > 0 || tailorPatchResult.notFoundCount > 0) && (
                        <div className="flex items-center gap-1.5 text-amber-700 text-[11px]">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          {tailorPatchResult.unsafeCount + tailorPatchResult.notFoundCount} suggestion{(tailorPatchResult.unsafeCount + tailorPatchResult.notFoundCount) !== 1 ? 's' : ''} couldn&apos;t be applied to the original PDF format
                        </div>
                      )}
                    </div>
                    <div className={`flex-1 overflow-hidden flex items-center justify-center p-4 transition-opacity duration-200 ${isTailorPreviewLoading ? 'opacity-50' : 'opacity-100'}`}>
                      {(tailorPatchedPdfBlobUrl || tailorPreviewBlobUrl) ? (
                        <iframe
                          title="Tailor preview PDF"
                          src={tailorPatchedPdfBlobUrl || tailorPreviewBlobUrl || ''}
                          className="w-full h-full rounded border bg-white"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-400 text-sm">
                          <Loader2 className="w-8 h-8 animate-spin" />
                          <span>Generating preview...</span>
                        </div>
                      )}
                    </div>
                  </>
                ) : activeTab === 'tailor' ? (
                  <>
                    <div className="px-3 py-2 text-xs flex items-center gap-1.5 border-b bg-gray-50 text-gray-400 border-gray-100">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      Original resume
                    </div>
                    <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
                      {originalPdfBlobUrl ? (
                        <iframe
                          title="Resume PDF preview"
                          src={originalPdfBlobUrl}
                          className="w-full h-full rounded border bg-white"
                        />
                      ) : previewBlobUrl ? (
                        <iframe
                          title="Resume PDF preview"
                          src={previewBlobUrl}
                          className="w-full h-full rounded border bg-white"
                        />
                      ) : (
                        <div className="text-center text-gray-400 text-sm">
                          {hasResume ? 'Generating preview...' : 'Upload or build a resume to see preview'}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-4 py-2 border-b bg-white">
                      <span className="text-sm font-medium text-gray-600">
                        {libraryPreviewEntry ? `Preview: ${libraryPreviewEntry.display_name}` : 'Live Preview'}
                      </span>
                    </div>
                    <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
                      {libraryPreviewEntry?.pdf_base64 ? (
                        <iframe
                          title="Library PDF preview"
                          src={`data:application/pdf;base64,${libraryPreviewEntry.pdf_base64}`}
                          className="w-full h-full rounded border bg-white"
                        />
                      ) : originalPdfBlobUrl ? (
                        <iframe
                          title="Resume PDF preview"
                          src={originalPdfBlobUrl}
                          className="w-full h-full rounded border bg-white"
                        />
                      ) : previewBlobUrl ? (
                        <iframe
                          title="Resume PDF preview"
                          src={previewBlobUrl}
                          className="w-full h-full rounded border bg-white"
                        />
                      ) : (
                        <div className="text-center text-gray-400 text-sm">
                          {hasResume ? 'Generating preview...' : 'Upload or build a resume to see preview'}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>

      <Dialog open={showSaveToLibraryDialog} onOpenChange={setShowSaveToLibraryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save to Library</DialogTitle>
            <DialogDescription>Save this version to your resume library with a name and optional job/company tags.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="library-name">Version name</Label>
              <Input id="library-name" value={saveToLibraryVersionName} onChange={(e) => setSaveToLibraryVersionName(e.target.value)} placeholder="Resume - Feb 28, 2025" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="library-job">Job title (optional)</Label>
              <Input id="library-job" value={saveToLibraryJobTitle} onChange={(e) => setSaveToLibraryJobTitle(e.target.value)} placeholder="e.g. Software Engineer" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="library-company">Company (optional)</Label>
              <Input id="library-company" value={saveToLibraryCompany} onChange={(e) => setSaveToLibraryCompany(e.target.value)} placeholder="e.g. Acme Inc" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveToLibraryDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveToLibraryConfirm} disabled={isSavingToLibrary}>
              {isSavingToLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save to library
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
