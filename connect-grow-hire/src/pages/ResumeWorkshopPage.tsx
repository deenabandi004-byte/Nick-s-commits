/**
 * ResumeWorkshopPage - Resume optimization workspace
 * 
 * Route: /write/resume, /write/resume-library
 * Linear flow: Resume Preview → Score → Job Context → Actions
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from '@/components/AppHeader';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { VideoDemo } from '@/components/VideoDemo';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StickyCTA } from '@/components/StickyCTA';
import { Loader2, AlertCircle, FileText, Download, ChevronDown, ChevronUp, Upload, Eye, ArrowRight, X, Link, Briefcase, Building2, MapPin, Wrench, BarChart3, FolderOpen, CheckCircle, Copy } from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { 
  fixResume,
  scoreResume,
  tailorResume,
  replaceMainResume,
  getResumeLibrary,
  getLibraryEntry,
  deleteLibraryEntry,
  type ScoreCategory,
  type JobContext,
  type LibraryEntry,
  type TailorResult
} from '@/services/resumeWorkshop';

// PDF Preview Component
interface PDFPreviewProps {
  pdfUrl?: string | null;
  pdfBase64?: string | null;
  title?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ pdfUrl, pdfBase64, title = 'PDF Preview' }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoadingBlob, setIsLoadingBlob] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  // Fetch PDF as blob when pdfUrl changes (skip if pdfBase64 is provided)
  useEffect(() => {
    if (pdfBase64) {
      // If we have base64, no need to fetch blob
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
      setIsLoadingBlob(false);
      return;
    }

    if (!pdfUrl) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
      setIsLoadingBlob(false);
      return;
    }

    // Fetch PDF as blob to bypass Content-Disposition header
    setIsLoadingBlob(true);
    
    fetch(pdfUrl)
      .then(response => response.blob())
      .then(blob => {
        // Clean up previous blob URL if it exists
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        // Force correct MIME type - Firebase returns application/octet-stream
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        blobUrlRef.current = url;
        setBlobUrl(url);
        setIsLoadingBlob(false);
      })
      .catch(err => {
        console.error('Failed to fetch PDF as blob:', err);
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        setBlobUrl(null);
        setIsLoadingBlob(false);
      });

    // Cleanup: revoke object URL when component unmounts or URL changes
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [pdfUrl, pdfBase64]);

  // Determine the source URL - NEVER use pdfUrl directly, only blobUrl or base64
  const src = pdfBase64 
    ? `data:application/pdf;base64,${pdfBase64}` 
    : blobUrl || null;

  if (!src) {
    if (isLoadingBlob && pdfUrl) {
      return (
        <div className="border border-gray-200 rounded-[3px] p-8 bg-gray-50 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500">Loading PDF preview...</p>
        </div>
      );
    }
    return (
      <div className="border border-gray-200 rounded-[3px] p-8 bg-gray-50 text-center">
        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No resume to preview</p>
      </div>
    );
  }
  
  return (
    <div className="border border-gray-200 rounded-[3px] overflow-hidden bg-white">
      <iframe
        src={src}
        className="w-full h-[500px]"
        title={title}
      />
    </div>
  );
};

// Confirmation Modal Component
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

const ReplaceResumeModal: React.FC<ConfirmModalProps> = ({ isOpen, onClose, onConfirm, isLoading }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-[3px] shadow-xl max-w-md w-full mx-4 p-6 animate-scaleIn">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
        
        <div className="w-14 h-14 bg-gray-100 rounded-[3px] flex items-center justify-center mx-auto mb-4">
          <FileText className="w-7 h-7 text-gray-600" />
        </div>
        
        <h2 className="text-xl font-semibold text-gray-900 mb-3 text-center">
          Replace resume in account settings?
        </h2>
        <p className="text-gray-600 mb-6 text-center">
          This will replace your current resume across Offerloop.
        </p>
        
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={onClose} disabled={isLoading} className="rounded-full px-6">
            Cancel
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isLoading}
            className="bg-[#0F172A] hover:bg-[#1E293B] hover:shadow-lg rounded-full px-6"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Replace Resume
          </Button>
        </div>
      </div>
    </div>
  );
};

// Updated Recommendation interface for before/after display
interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: 'Summary' | 'Experience' | 'Skills' | 'Keywords';
  current: string;
  suggested: string;
  why?: string;
}

// Helper function to convert TailorResult sections to Recommendations
function convertSectionsToRecommendations(tailorResult: TailorResult): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Summary recommendation
  if (tailorResult.sections.summary?.suggested && tailorResult.sections.summary?.current !== tailorResult.sections.summary?.suggested) {
    recommendations.push({
      id: 'summary',
      title: 'Update Professional Summary',
      description: tailorResult.sections.summary.why || 'Tailor your summary to highlight relevant experience.',
      category: 'Summary',
      current: tailorResult.sections.summary.current || 'No summary found',
      suggested: tailorResult.sections.summary.suggested,
      why: tailorResult.sections.summary.why,
    });
  }

  // Experience bullet recommendations
  tailorResult.sections.experience?.forEach((exp, expIndex) => {
    exp.bullets?.forEach((bullet, bulletIndex) => {
      if (bullet.suggested && bullet.current !== bullet.suggested) {
        recommendations.push({
          id: `exp-${expIndex}-${bulletIndex}`,
          title: `Improve ${exp.role} @ ${exp.company}`,
          description: bullet.why || 'Strengthen this bullet point.',
          category: 'Experience',
          current: bullet.current,
          suggested: bullet.suggested,
          why: bullet.why,
        });
      }
    });
  });

  // Skills to add
  tailorResult.sections.skills?.add?.forEach((skill, index) => {
    recommendations.push({
      id: `skill-add-${index}`,
      title: `Add Skill: ${skill.skill}`,
      description: skill.reason,
      category: 'Skills',
      current: '', // No current text for new skills
      suggested: skill.skill,
      why: skill.reason,
    });
  });

  // Skills to remove
  tailorResult.sections.skills?.remove?.forEach((skill, index) => {
    recommendations.push({
      id: `skill-remove-${index}`,
      title: `Consider Removing: ${skill.skill}`,
      description: skill.reason,
      category: 'Skills',
      current: skill.skill,
      suggested: '', // Suggesting removal
      why: skill.reason,
    });
  });

  // Keywords to add
  tailorResult.sections.keywords?.forEach((kw, index) => {
    recommendations.push({
      id: `keyword-${index}`,
      title: `Add Keyword: ${kw.keyword}`,
      description: kw.where_to_add,
      category: 'Keywords',
      current: '',
      suggested: kw.keyword,
      why: kw.where_to_add,
    });
  });

  return recommendations;
}

// Recommendation Card Component
const RecommendationCard: React.FC<{ rec: Recommendation }> = ({ rec }) => {
  const [expanded, setExpanded] = useState(false);
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!", duration: 2000 });
  };
  
  return (
    <div className="border border-gray-200 rounded-[3px] p-4 bg-white hover:shadow-md transition-shadow">
      <div 
        className="flex justify-between items-start cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm">{rec.title}</h4>
          <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
          <span className="text-xs text-gray-400 mt-1 inline-block">{rec.category}</span>
        </div>
        <ChevronDown 
          className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ml-2 ${expanded ? 'rotate-180' : ''}`}
        />
      </div>
      
      {expanded && (
        <div className="mt-4 space-y-3">
          {/* Current/Before */}
          {rec.current && (
            <div className="bg-gray-50 rounded-[3px] p-3">
              <div className="text-xs font-medium text-gray-500 mb-1">Current</div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{rec.current}</p>
            </div>
          )}
          
          {/* Suggested/After */}
          {rec.suggested && (
            <div className="bg-gray-50 rounded-[3px] p-3 border border-gray-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-gray-600">
                  {rec.current ? 'Suggested' : 'Add This'}
                </span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(rec.suggested);
                  }}
                  className="text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1 transition-colors"
                >
                  <Copy size={12} />
                  Copy
                </button>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{rec.suggested}</p>
            </div>
          )}
          
          {/* For removals */}
          {rec.current && !rec.suggested && (
            <div className="bg-red-50 rounded-[3px] p-3 border border-red-200">
              <span className="text-xs font-medium text-red-600">Consider removing this</span>
            </div>
          )}
          
          {/* Why this change */}
          {rec.why && (
            <p className="text-xs text-gray-500 italic">{rec.why}</p>
          )}
        </div>
      )}
    </div>
  );
};

// Main Component
export default function ResumeWorkshopPage() {
  const { user, isLoading: authLoading, updateCredits } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const activeTab = location.pathname === '/write/resume-library' ? 'resume-library' : 'resume-workshop';

  const handleTabChange = (tabId: string) => {
    if (tabId === 'resume-library') {
      navigate('/write/resume-library');
    } else {
      navigate('/write/resume');
    }
  };
  
  // Resume data state
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [isLoadingResume, setIsLoadingResume] = useState(true);
  
  // Score state (inline display)
  const [resumeScore, setResumeScore] = useState<number | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreData, setScoreData] = useState<{ score: number; score_label: string; categories: any[]; summary: string; cached?: boolean } | null>(null);
  const [showScoreDetails, setShowScoreDetails] = useState(false);
  
  // Job context state
  const [jobUrl, setJobUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [jobUrlError, setJobUrlError] = useState<string | null>(null);
  
  // Fix state
  const [isFixing, setIsFixing] = useState(false);
  const [fixedPdfBase64, setFixedPdfBase64] = useState<string | null>(null);
  const [fixedResumeText, setFixedResumeText] = useState<string | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  
  // Tailor state
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorScore, setTailorScore] = useState<number | null>(null);
  const [tailorScoreLabel, setTailorScoreLabel] = useState('');
  
  // Ref for original button to track visibility
  const originalButtonRef = useRef<HTMLButtonElement>(null);
  const [tailorCategories, setTailorCategories] = useState<ScoreCategory[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [tailorJobContext, setTailorJobContext] = useState<JobContext | null>(null);
  
  // Results mode
  const [showResults, setShowResults] = useState<'none' | 'fix' | 'tailor'>('none');
  
  // Library state
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<LibraryEntry | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Error state
  const [error, setError] = useState<string | null>(null);

  // Load user's resume
  const loadResume = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoadingResume(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        setResumeUrl(data.resumeUrl || null);
        setResumeFileName(data.resumeFileName || null);
      }
    } catch (err) {
      console.error('Failed to load resume:', err);
    } finally {
      setIsLoadingResume(false);
    }
  }, [user?.uid]);

  // Load resume library
  const loadLibrary = useCallback(async () => {
    if (!user?.uid) return;
    setIsLoadingLibrary(true);
    try {
      const result = await getResumeLibrary();
      if (result.status === 'ok' && result.entries) {
        setLibraryEntries(result.entries);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [user?.uid]);

  useEffect(() => { loadResume(); }, [loadResume]);
  useEffect(() => { if (activeTab === 'resume-library') loadLibrary(); }, [activeTab, loadLibrary]);

  // Check if job context is provided
  const hasJobUrl = jobUrl.trim().length > 0;
  const hasManualFields = jobTitle.trim() && company.trim() && locationInput.trim() && jobDescription.trim();
  const hasJobContext = hasJobUrl || hasManualFields;

  // URL validation
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Handle Score Resume (inline)
  const handleScore = async () => {
    if (!resumeUrl) return;
    
    setIsScoring(true);
    try {
      const result = await scoreResume();
      if (result.status === 'ok' && result.score !== undefined) {
        setResumeScore(result.score);
        setScoreData({
          score: result.score,
          score_label: result.score_label || '',
          categories: result.categories || [],
          summary: result.summary || '',
          cached: result.cached || false
        });
        
        // Show cached indicator if applicable
        if (result.cached) {
          toast({ 
            title: 'Score Retrieved', 
            description: 'Retrieved from recent score (no credits charged)',
            variant: 'default'
          });
        }
      } else if (result.status === 'error') {
        // Handle specific error codes
        let errorTitle = 'Error';
        let errorDescription = result.message || 'Failed to score resume';
        
        switch (result.error_code) {
          case 'INSUFFICIENT_CREDITS':
            errorTitle = 'Insufficient Credits';
            errorDescription = 'You need at least 5 credits to score your resume. Upgrade your plan or purchase credits.';
            break;
          case 'RESUME_TOO_SHORT':
            errorTitle = 'Resume Too Short';
            errorDescription = 'Your resume needs more content before scoring. Please add more details.';
            break;
          case 'RESUME_NOT_FOUND':
            errorTitle = 'Resume Not Found';
            errorDescription = 'Please upload your resume in Account Settings first.';
            break;
          case 'AI_TIMEOUT':
            errorTitle = 'Scoring Timed Out';
            errorDescription = 'Scoring timed out. Your credits were refunded. Please try again.';
            break;
          case 'AI_ERROR':
            errorTitle = 'Scoring Error';
            errorDescription = 'Something went wrong. Credits refunded. Please try again.';
            break;
          default:
            errorDescription = result.message || 'Failed to score resume';
        }
        
        toast({ title: errorTitle, description: errorDescription, variant: 'destructive' });
      }
      
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Network error occurred', variant: 'destructive' });
    } finally {
      setIsScoring(false);
    }
  };

  // Handle Fix Resume
  const handleFix = async () => {
    setError(null);
    if (!resumeUrl) {
      setError('Please upload your resume in Account Settings first.');
      return;
    }
    
    if ((user?.credits ?? 0) < 5) {
      setError('Insufficient credits. You need at least 5 credits.');
      toast({ title: 'Insufficient Credits', description: 'Upgrade your plan for more credits.', variant: 'destructive' });
      return;
    }

    setIsFixing(true);
    
    try {
      const result = await fixResume();
      
      if (result.status === 'error') {
        setError(result.message || 'Fix failed.');
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
        return;
      }
      
      setFixedPdfBase64(result.pdf_base64 || null);
      setFixedResumeText(result.improved_resume_text || null);
      setShowResults('fix');
      
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
      
      toast({ title: 'Resume Fixed', description: 'Review your improved resume below.' });
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsFixing(false);
    }
  };

  // Handle Save Fixed Resume
  const handleSaveFixed = async () => {
    if (!fixedPdfBase64 || !fixedResumeText) return;
    
    setIsReplacing(true);
    try {
      const result = await replaceMainResume({
        pdf_base64: fixedPdfBase64,
        resume_text: fixedResumeText,
      });
      
      if (result.status === 'error') {
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
        return;
      }
      
      await loadResume();
      setShowReplaceModal(false);
      setShowResults('none');
      setFixedPdfBase64(null);
      setFixedResumeText(null);
      
      toast({ title: 'Resume Replaced', description: 'Your main resume has been updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsReplacing(false);
    }
  };

  // Handle Tailor Resume
  const handleTailor = async () => {
    setError(null);
    setJobUrlError(null);
    
    if (!resumeUrl) {
      setError('Please upload your resume in Account Settings first.');
      return;
    }
    
    if (!hasJobContext) {
      setError('Please provide a job description URL or fill in the manual fields.');
      return;
    }
    
    if ((user?.credits ?? 0) < 5) {
      setError('Insufficient credits. You need at least 5 credits.');
      toast({ title: 'Insufficient Credits', description: 'Upgrade your plan for more credits.', variant: 'destructive' });
      return;
    }

    // Clear any previous state before starting new analysis
    setTailorScore(null);
    setTailorScoreLabel('');
    setTailorCategories([]);
    setRecommendations([]);
    setError(null);
    setJobUrlError(null);
    
    setIsTailoring(true);
    
    try {
      const result = await tailorResume({
        job_url: hasJobUrl ? jobUrl.trim() : undefined,
        job_title: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        location: locationInput.trim() || undefined,
        job_description: jobDescription.trim() || undefined,
      });
      
      if (result.status === 'error') {
        if (result.error_code === 'URL_PARSE_FAILED') {
          setJobUrlError('Could not read job URL. Please use manual inputs.');
          setShowManualInputs(true);
        } else {
          setError(result.message || 'Tailoring failed.');
          toast({ title: 'Error', description: result.message, variant: 'destructive' });
        }
        return;
      }
      
      // Log the score to help debug if it's always 68
      console.log('[ResumeWorkshop] Tailor result:', { 
        score: result.score, 
        score_label: result.score_label,
        has_categories: !!result.categories,
        raw_data: result
      });
      
      // Ensure we're setting the actual score from the response
      const scoreValue = typeof result.score === 'number' ? result.score : null;
      console.log('[ResumeWorkshop] Setting score:', scoreValue);
      
      setTailorScore(scoreValue);
      setTailorScoreLabel(result.score_label || '');
      setTailorCategories(result.categories || []);
      
      // Convert sections to recommendations if needed
      const recs = convertSectionsToRecommendations(result);
      setRecommendations(recs);
      
      setTailorJobContext(result.job_context || null);
      setShowResults('tailor');
      
      // Auto-fill from parsed job (if backend supports it)
      // Note: Current backend might not return parsed_job, but we'll handle it if it does
      
      if (result.credits_remaining !== undefined && updateCredits) {
        await updateCredits(result.credits_remaining);
      }
      
      toast({ title: 'Analysis Complete', description: `Your resume scored ${result.score}/100 for this role.` });
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsTailoring(false);
    }
  };

  // Note: handleApplyRecommendation removed - users now copy/paste manually

  // Handle Download
  const handleDownload = (pdfBase64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${pdfBase64}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Download Started', description: 'Your resume is being downloaded.' });
  };

  // Library handlers
  const handleViewEntry = async (entry: LibraryEntry) => {
    if (entry.pdf_base64) { setPreviewEntry(entry); return; }
    setIsLoadingPreview(true);
    try {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry) setPreviewEntry(result.entry);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to load preview.', variant: 'destructive' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownloadEntry = async (entry: LibraryEntry) => {
    let pdfBase64 = entry.pdf_base64;
    if (!pdfBase64) {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry?.pdf_base64) pdfBase64 = result.entry.pdf_base64;
    }
    if (pdfBase64) handleDownload(pdfBase64, `${entry.display_name}.pdf`);
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteLibraryEntry(entryId);
      setLibraryEntries(prev => prev.filter(e => e.id !== entryId));
      if (previewEntry?.id === entryId) setPreviewEntry(null);
      toast({ title: 'Deleted', description: 'Resume removed from library.' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  // Back to form
  const handleBackToForm = () => {
    setShowResults('none');
    setFixedPdfBase64(null);
    setFixedResumeText(null);
    setTailorScore(null);
    setRecommendations([]);
  };

  // Score helpers
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreBadgeStyles = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-700';
    if (score >= 60) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    return 'Needs Work';
  };

  // Auth loading
  if (authLoading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full text-foreground">
          <AppSidebar />
          <MainContentWrapper>
            <AppHeader title="" />
            <main className="bg-[#F8FAFC] min-h-screen">
              <div className="max-w-7xl mx-auto px-6 pt-10 pb-4">
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                </div>
              </div>
            </main>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  if (!user) return null;

  const isProcessing = isTailoring;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          <main data-tour="tour-resume" style={{ background: '#FAFBFF', flex: 1, overflowY: 'auto', paddingBottom: '96px' }}>
            <div className="w-full px-3 py-6 sm:px-6 sm:py-12" style={{ maxWidth: '900px', margin: '0 auto' }}>
              
              {/* Header Section */}
              <div>
                <h1
                  className="text-[28px] sm:text-[42px]"
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
                    fontWeight: 400,
                    letterSpacing: '-0.025em',
                    color: '#0F172A',
                    textAlign: 'center',
                    marginBottom: '10px',
                    lineHeight: 1.1,
                  }}
                >
                  Resume
                </h1>
                <p
                  style={{
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: '16px',
                    color: '#64748B',
                    textAlign: 'center',
                    marginBottom: '28px',
                    lineHeight: 1.5,
                  }}
                >
                  Optimize your resume to stand out and pass ATS screening.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <VideoDemo videoId="UJSlHiBRSyY" />
                </div>
              </div>

              {/* Pill-style Tabs */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '36px' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    gap: '0',
                    background: '#F0F4FD',
                    borderRadius: '12px',
                    padding: '4px',
                    margin: '0 auto',
                  }}
                >
                  <button
                    onClick={() => handleTabChange('resume-workshop')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '9px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                      background: activeTab === 'resume-workshop' ? '#0F172A' : 'transparent',
                      color: activeTab === 'resume-workshop' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'resume-workshop' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <Wrench className="h-4 w-4" />
                    Resume Workshop
                  </button>
                  
                  <button
                    onClick={() => handleTabChange('resume-library')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '9px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      fontSize: '14px',
                      fontWeight: 500,
                      transition: 'all 0.15s ease',
                      background: activeTab === 'resume-library' ? '#0F172A' : 'transparent',
                      color: activeTab === 'resume-library' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'resume-library' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Resume Library
                    {libraryEntries.length > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: activeTab === 'resume-library' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(37, 99, 235, 0.08)',
                          color: activeTab === 'resume-library' ? 'white' : '#0F172A',
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {libraryEntries.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">

                <div className="animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                  {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-[3px] p-4 flex items-start gap-3">
                      <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1"><p className="text-sm text-red-700">{error}</p></div>
                      <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">×</button>
                    </div>
                  )}

                  <TabsContent value="resume-workshop" className="mt-0">
                    {/* Show results or form */}
                    {showResults === 'none' ? (
                      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                        {/* Left Column - Resume Preview (3/5 width) */}
                        <div className="lg:col-span-3">
                          <div className="bg-white rounded-[3px] shadow-lg border border-gray-100 overflow-hidden">
                            <div className="h-1 bg-gray-100"></div>
                            
                            <div className="p-6">
                              {/* Header */}
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gray-100 rounded-[3px] flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-gray-600" />
                                  </div>
                                  <div>
                                    <h2 className="font-semibold text-gray-900">Your Resume</h2>
                                    {resumeFileName && (
                                      <p className="text-sm text-gray-500">{resumeFileName}</p>
                                    )}
                                  </div>
                                </div>
                                
                                <button 
                                  onClick={() => navigate('/account-settings')}
                                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-[#3B82F6] hover:bg-[#FAFBFF] rounded-[3px] transition-colors"
                                >
                                  <Upload className="w-4 h-4" />
                                  Upload New
                                </button>
                              </div>
                              
                              {/* PDF Viewer */}
                              {isLoadingResume ? (
                                <div className="border border-gray-200 rounded-[3px] p-8 bg-gray-50 text-center">
                                  <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto" />
                                </div>
                              ) : !resumeUrl ? (
                                <div 
                                  onClick={() => navigate('/account-settings')}
                                  className="border-2 border-dashed border-gray-300 rounded-[3px] p-12 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all"
                                >
                                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                  <p className="font-medium text-gray-700 mb-2">No resume uploaded yet</p>
                                  <p className="text-sm text-gray-500 mb-4">Upload your resume to get started</p>
                                  <span className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                                    Upload Resume
                                  </span>
                                </div>
                              ) : (
                                <PDFPreview pdfUrl={resumeUrl} title={resumeFileName || 'Your Resume'} />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Column - Actions (2/5 width) */}
                        <div className="lg:col-span-2 space-y-6">
                          {/* Job Description Card */}
                          {resumeUrl && (
                            <div className="bg-white rounded-[3px] shadow-lg border border-gray-100 overflow-hidden">
                              <div className="h-1 bg-gray-100"></div>
                              
                              <div className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="w-10 h-10 bg-gray-100 rounded-[3px] flex items-center justify-center">
                                    <Briefcase className="w-5 h-5 text-gray-600" />
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-gray-900">Job Description</h3>
                                    <p className="text-sm text-gray-500">For tailoring your resume</p>
                                  </div>
                                </div>
                                
                                <p className="text-sm text-gray-600 mb-4">
                                  Provide either a job description URL or fill out the manual fields.
                                </p>
                                
                                {/* Job Posting URL Input */}
                                <div className="mb-4">
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Job Posting URL</label>
                                  <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                      <Link className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                      type="url"
                                      value={jobUrl}
                                      onChange={(e) => { setJobUrl(e.target.value); setJobUrlError(null); }}
                                      placeholder="https://linkedin.com/jobs/..."
                                      disabled={isProcessing}
                                      className={`block w-full pl-9 pr-10 py-3 border rounded-[3px]
                                                 text-gray-900 placeholder-gray-400 text-sm
                                                 hover:border-gray-400
                                                 focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20
                                                 hover:border-gray-300 transition-all disabled:opacity-50
                                                 ${jobUrlError ? 'border-red-300' : 'border-gray-200'}`}
                                    />
                                    {jobUrl && isValidUrl(jobUrl) && (
                                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                      </div>
                                    )}
                                  </div>
                                  {jobUrlError && <p className="text-sm text-red-600 mt-1">{jobUrlError}</p>}
                                </div>
                                
                                {/* Expandable Manual Entry */}
                                <div className="border-t border-gray-100 pt-4">
                                  <button
                                    onClick={() => setShowManualInputs(!showManualInputs)}
                                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                                    disabled={isProcessing}
                                  >
                                    {showManualInputs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    Or enter job details manually
                                  </button>
                                  
                                  {showManualInputs && (
                                    <div className={`mt-4 space-y-4 ${hasJobUrl ? 'opacity-50' : ''}`}>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Building2 className="h-4 w-4 text-gray-400" />
                                          </div>
                                          <input
                                            type="text"
                                            value={company}
                                            onChange={(e) => setCompany(e.target.value)}
                                            placeholder="e.g. Google"
                                            disabled={!!jobUrl || isProcessing}
                                            className="block w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-[3px] text-sm
                                                       hover:border-gray-400
                                                 focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20 disabled:bg-gray-50"
                                          />
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Job Title</label>
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Briefcase className="h-4 w-4 text-gray-400" />
                                          </div>
                                          <input
                                            type="text"
                                            value={jobTitle}
                                            onChange={(e) => setJobTitle(e.target.value)}
                                            placeholder="e.g. Product Manager"
                                            disabled={!!jobUrl || isProcessing}
                                            className="block w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-[3px] text-sm
                                                       hover:border-gray-400
                                                 focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20 disabled:bg-gray-50"
                                          />
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                                        <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <MapPin className="h-4 w-4 text-gray-400" />
                                          </div>
                                          <input
                                            type="text"
                                            value={locationInput}
                                            onChange={(e) => setLocationInput(e.target.value)}
                                            placeholder="e.g. San Francisco, CA"
                                            disabled={!!jobUrl || isProcessing}
                                            className="block w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-[3px] text-sm
                                                       hover:border-gray-400
                                                 focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20 disabled:bg-gray-50"
                                          />
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Job Description</label>
                                        <textarea
                                          value={jobDescription}
                                          onChange={(e) => setJobDescription(e.target.value)}
                                          placeholder="Paste the job description here..."
                                          rows={4}
                                          disabled={!!jobUrl || isProcessing}
                                          className="block w-full px-4 py-2.5 border border-gray-200 rounded-[3px] text-sm resize-none
                                                     hover:border-gray-400
                                                 focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20 disabled:bg-gray-50"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons Card */}
                          {resumeUrl && (
                            <div className="bg-white rounded-[3px] shadow-lg border border-gray-100 overflow-hidden">
                              <div className="h-1 bg-gray-100"></div>
                              
                              <div className="p-6">
                                <h3 className="font-semibold text-gray-900 mb-4">Resume Actions</h3>
                                
                                <div className="space-y-3">
                                  {/* Tailor Resume Button */}
                                  <button
                                    ref={originalButtonRef}
                                    onClick={handleTailor}
                                    disabled={isProcessing || !resumeUrl || !hasJobContext}
                                    className={`
                                      w-full py-4 px-6 rounded-[3px] font-semibold transition-all duration-200
                                      flex items-center justify-center gap-3
                                      ${hasJobContext && !isProcessing
                                        ? 'text-white bg-[#0F172A] shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-100'
                                        : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                      }
                                    `}
                                  >
                                    {isTailoring && (
                                      <Loader2 className="w-5 h-5 animate-spin" />
                                    )}
                                    Tailor Resume
                                  </button>
                                  
                                  {!hasJobContext && (
                                    <p className="text-xs text-gray-500 text-center">
                                      Requires a job description to tailor your resume
                                    </p>
                                  )}
                                </div>
                                
                                {/* Cost info + credit indicator */}
                                <div className="mt-4 pt-4 border-t border-gray-100 text-center space-y-1">
                                  <p className="text-sm text-gray-500">
                                    Each action costs <span className="font-semibold text-gray-700">5 credits</span>
                                  </p>
                                  {(user?.credits ?? 0) === 0 ? (
                                    <div>
                                      <p className="text-xs text-red-500">No credits remaining</p>
                                      <button onClick={() => navigate('/pricing')} className="text-xs text-primary hover:underline mt-1">
                                        Upgrade for more credits →
                                      </button>
                                    </div>
                                  ) : (user?.credits ?? 0) < 50 ? (
                                    <p className="text-xs text-orange-500">⚠ {user?.credits} credits remaining</p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">{user?.credits} credits remaining</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* What Each Action Does */}
                          {resumeUrl && (
                            <div className="bg-gray-50 rounded-[3px] p-6 border border-gray-100">
                              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">What this action does</h3>
                              
                              <div className="flex items-start gap-3">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">Tailor Resume</p>
                                  <p className="text-xs text-gray-500">Customizes your resume to match the job description, highlighting relevant skills.</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : showResults === 'tailor' ? (
                      /* Tailor Results */
                      <div className="bg-white rounded-[3px] shadow-lg border border-gray-100 overflow-hidden">
                        <div className="h-1 bg-gray-100"></div>
                        
                        <div className="p-6">
                          <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-gray-900">
                              Tailored for: {tailorJobContext?.job_title} at {tailorJobContext?.company}
                            </h2>
                            <Button variant="ghost" onClick={handleBackToForm} className="text-gray-500">
                              ← Back
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left - Score & Recommendations */}
                            <div className="space-y-6">
                              {/* Score Card */}
                              {tailorScore !== null && (
                                <div className={`rounded-[3px] border p-4 ${
                                  tailorScore >= 80 ? 'bg-green-50 border-green-200' :
                                  tailorScore >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
                                }`}>
                                  <div className="flex items-baseline gap-2">
                                    <span className={`text-3xl font-bold ${getScoreColor(tailorScore)}`}>
                                      {typeof tailorScore === 'number' ? tailorScore : 'N/A'}
                                    </span>
                                    <span className="text-gray-500">/ 100</span>
                                    <span className="text-sm text-gray-600 ml-2">{tailorScoreLabel}</span>
                                  </div>
                                  <p className="text-sm text-gray-600 mt-2">Job fit score for this role</p>
                                </div>
                              )}
                              
                              {/* Recommendations */}
                              {recommendations.length > 0 && (
                                <div>
                                  <h3 className="text-md font-semibold text-gray-900 mb-3">
                                    Recommendations ({recommendations.length})
                                  </h3>
                                  <p className="text-sm text-gray-500 mb-3">
                                    Click to expand and copy suggestions to your resume.
                                  </p>
                                  <div className="space-y-3">
                                    {recommendations.map(rec => (
                                      <RecommendationCard key={rec.id} rec={rec} />
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                            </div>
                            
                            {/* Right - Preview */}
                            <div>
                              <h3 className="text-sm font-medium text-gray-700 mb-2">
                                Original Resume
                              </h3>
                              <PDFPreview
                                pdfUrl={resumeUrl}
                                title="Original Resume"
                              />
                              <p className="text-xs text-gray-500 mt-3 text-center">
                                Copy suggestions from recommendations and update your resume manually
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="resume-library" className="mt-0">
                    <div className="bg-white rounded-[3px] shadow-lg border border-gray-100 overflow-hidden">
                      <div className="h-1 bg-gray-100"></div>
                      
                      <div className="p-6">
                        {isLoadingLibrary ? (
                          <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                          </div>
                        ) : libraryEntries.length === 0 ? (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <FileText className="h-8 w-8 text-gray-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Saved Resumes</h3>
                            <p className="text-gray-500 max-w-md mx-auto mb-6">
                              Saved resumes will appear here. Use the Resume Workshop to get tailored recommendations.
                            </p>
                            <button 
                              onClick={() => handleTabChange('resume-workshop')} 
                              className="px-6 py-3 bg-[#0F172A] text-white font-semibold rounded-full hover:shadow-lg transition-all"
                            >
                              Go to Resume Workshop
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <h2 className="text-lg font-semibold text-gray-900">Saved Resumes ({libraryEntries.length})</h2>
                              {libraryEntries.map(entry => (
                                <div
                                  key={entry.id}
                                  className={`border rounded-[3px] p-4 bg-white transition-colors cursor-pointer ${
                                    previewEntry?.id === entry.id ? 'border-[#3B82F6] ring-1 ring-[#3B82F6]/20' : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                  onClick={() => handleViewEntry(entry)}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                      <div className="w-10 h-10 bg-gray-100 rounded-[3px] flex items-center justify-center flex-shrink-0">
                                        <FileText className="h-5 w-5 text-gray-600" />
                                      </div>
                                      <div>
                                        <h4 className="font-medium text-gray-900">{entry.display_name}</h4>
                                        <p className="text-sm text-gray-600">{entry.job_title} at {entry.company}</p>
                                        <div className="flex items-center gap-3 mt-2">
                                          <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</span>
                                          {entry.score && (
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                              entry.score >= 80 ? 'bg-green-100 text-green-700' :
                                              entry.score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                            }`}>Score: {entry.score}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleViewEntry(entry); }} className="rounded-[3px]">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleDownloadEntry(entry); }} className="rounded-[3px]">
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            <div>
                              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
                              {isLoadingPreview ? (
                                <div className="border border-gray-200 rounded-[3px] p-8 bg-gray-50 text-center">
                                  <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto" />
                                </div>
                              ) : previewEntry ? (
                                <div className="space-y-4">
                                  <PDFPreview pdfBase64={previewEntry.pdf_base64} title={previewEntry.display_name} />
                                  <Button variant="outline" className="w-full rounded-[3px]" onClick={() => handleDownloadEntry(previewEntry)}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download PDF
                                  </Button>
                                </div>
                              ) : (
                                <div className="border border-gray-200 rounded-[3px] p-8 bg-gray-50 text-center">
                                  <Eye className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                                  <p className="text-gray-500">Click on a resume to preview it</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </main>
        </MainContentWrapper>
      </div>
      
      <ReplaceResumeModal
        isOpen={showReplaceModal}
        onClose={() => setShowReplaceModal(false)}
        onConfirm={handleSaveFixed}
        isLoading={isReplacing}
      />

      {/* Loading Modal */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-[3px] p-8 max-w-md text-center shadow-2xl">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Tailoring your resume...
            </h3>
            <p className="text-gray-600 mb-4">
              Customizing for {jobTitle || 'this role'} at {company || 'the company'}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="h-2 rounded-full transition-all duration-300 bg-[#0F172A]"
                style={{ width: '60%' }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-3">This usually takes 20-30 seconds</p>
          </div>
        </div>
      )}
      
      {/* Sticky CTA - Only show on resume-workshop tab */}
      {activeTab === 'resume-workshop' && (
        <StickyCTA
          originalButtonRef={originalButtonRef}
          onClick={handleTailor}
          isLoading={isProcessing || isTailoring}
          disabled={isProcessing || !resumeUrl || !hasJobContext}
          buttonClassName="rounded-[3px]"
        >
          <span>Tailor Resume</span>
        </StickyCTA>
      )}
    </SidebarProvider>
  );
}
