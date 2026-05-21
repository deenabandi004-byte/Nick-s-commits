/**
 * CoverLetterPage - Cover letter generation workspace
 * 
 * Route: /write/cover-letter, /write/cover-letter-library
 * Tabs: Cover Letter Generator, Cover Letter Library
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from '@/components/AppHeader';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { VideoDemo } from '@/components/VideoDemo';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { StickyCTA } from '@/components/StickyCTA';
import { 
  Loader2, 
  AlertCircle, 
  PenLine, 
  Download, 
  ChevronDown, 
  ChevronUp,
  Eye,
  FileText,
  Link,
  Building2,
  Briefcase,
  FolderOpen,
  CheckCircle,
  Copy,
  X,
  Check
} from 'lucide-react';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { toast } from '@/hooks/use-toast';
import { 
  generateCoverLetter, 
  getCoverLetterLibrary,
  getLibraryEntry,
  type LibraryEntry
} from '@/services/coverLetterWorkshop';

// PDF Preview Component
interface PDFPreviewProps {
  pdfUrl?: string | null;
  pdfBase64?: string | null;
  title?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ pdfUrl, pdfBase64, title = 'PDF Preview' }) => {
  const src = pdfBase64 
    ? `data:application/pdf;base64,${pdfBase64}` 
    : pdfUrl || '';
  
  if (!src) {
    return null;
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

export default function CoverLetterPage() {
  const { user, isLoading: authLoading, updateCredits } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine active tab from route
  const activeTab = location.pathname === '/write/cover-letter-library' ? 'cover-letter-library' : 'cover-letter-generator';

  // Handle tab change - navigate to the appropriate route
  const handleTabChange = (tabId: string) => {
    if (tabId === 'cover-letter-library') {
      navigate('/write/cover-letter-library');
    } else {
      navigate('/write/cover-letter');
    }
  };
  
  // Ref for original button to track visibility
  const originalButtonRef = useRef<HTMLButtonElement>(null);

  // Job context state
  const [jobUrl, setJobUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [showManualInputs, setShowManualInputs] = useState(false);
  const [jobUrlError, setJobUrlError] = useState<string | null>(null);
  const [urlParsedSuccessfully, setUrlParsedSuccessfully] = useState(false);
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [generatedPdfBase64, setGeneratedPdfBase64] = useState<string | null>(null);
  const [generatedCompany, setGeneratedCompany] = useState<string | null>(null);
  const [generatedJobTitle, setGeneratedJobTitle] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  // Library state
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<LibraryEntry | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Error state
  const [error, setError] = useState<string | null>(null);

  // URL validation
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Load library
  const loadLibrary = useCallback(async () => {
    if (!user?.uid) return;
    
    setIsLoadingLibrary(true);
    try {
      const result = await getCoverLetterLibrary();
      if (result.status === 'ok' && result.entries) {
        setLibraryEntries(result.entries);
      }
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [user?.uid]);

  // Load library when tab changes
  useEffect(() => {
    if (activeTab === 'cover-letter-library') {
      loadLibrary();
    }
  }, [activeTab, loadLibrary]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/signin');
    }
  }, [user, authLoading, navigate]);

  // Progress simulation for loading state
  useEffect(() => {
    if (isGenerating) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isGenerating]);

  // Check if we can generate - only job description is required
  const canGenerate = 
    jobUrl.trim() || 
    jobDescription.trim().length > 0;

  // Handle Generate Cover Letter
  const handleGenerate = async () => {
    setError(null);
    setJobUrlError(null);
    
    // Build request params
    const params: {
      job_url?: string;
      job_title?: string;
      company?: string;
      location?: string;
      job_description?: string;
    } = {};
    
    if (jobUrl.trim()) {
      params.job_url = jobUrl.trim();
    }
    
    if (jobTitle.trim()) params.job_title = jobTitle.trim();
    if (company.trim()) params.company = company.trim();
    if (locationInput.trim()) params.location = locationInput.trim();
    if (jobDescription.trim()) params.job_description = jobDescription.trim();
    
    setIsGenerating(true);
    
    try {
      const result = await generateCoverLetter(params);
      
      // Debug logging - remove after confirming it works
      console.log('Cover letter API response:', result);
      console.log('Response keys:', Object.keys(result));
      
      // Handle both snake_case and camelCase response formats
      const coverLetterText = result.cover_letter_text || result.coverLetter || result.cover_letter || null;
      const creditsRemaining = result.credits_remaining ?? result.creditsRemaining ?? null;
      const isError = result.status === 'error' || result.error;
      const isSuccess = result.status === 'ok' || result.status === 'success' || (coverLetterText && !isError);
      
      // Check for errors first
      if (isError || (!isSuccess && !coverLetterText)) {
        // Handle specific errors
        const errorCode = result.error_code || result.errorCode;
        if (errorCode === 'insufficient_credits') {
          setError('You don\'t have enough credits. Please upgrade your plan to continue.');
          toast({
            title: 'Insufficient Credits',
            description: 'Please upgrade your plan to generate more cover letters.',
            variant: 'destructive',
          });
        } else if (errorCode === 'no_resume') {
          setError('Please upload your resume in Account Settings first.');
        } else if (result.parsed_job) {
          // URL was parsed but job description might be missing
          setJobUrlError('Job URL parsed, but job description may be missing. Please add a job description.');
          setShowManualInputs(true);
          setUrlParsedSuccessfully(true);
          // Auto-fill what we got
          if (result.parsed_job.job_title) setJobTitle(result.parsed_job.job_title);
          if (result.parsed_job.company) setCompany(result.parsed_job.company);
          if (result.parsed_job.location) setLocationInput(result.parsed_job.location);
          if (result.parsed_job.job_description) setJobDescription(result.parsed_job.job_description);
        } else if (params.job_url && !params.job_title) {
          // URL parsing failed completely
          setJobUrlError('Could not read job URL. Please use manual inputs.');
          setShowManualInputs(true);
          setUrlParsedSuccessfully(false); // Enable manual inputs when parsing fails
        } else {
          const errorMessage = result.message || result.error || 'Failed to generate cover letter.';
          setError(errorMessage);
          toast({
            title: 'Error',
            description: errorMessage,
            variant: 'destructive',
          });
        }
        return;
      }
      
      // Success!
      if (isSuccess && coverLetterText) {
        setProgress(100);
        setGeneratedText(coverLetterText);
        
        // Handle PDF base64 in both formats
        const pdfBase64 = result.pdf_base64 || result.pdfBase64 || null;
        setGeneratedPdfBase64(pdfBase64);
        
        // Store the job details for display (handle both formats)
        const parsedJob = result.parsed_job || result.parsedJob;
        setGeneratedJobTitle(parsedJob?.job_title || parsedJob?.jobTitle || jobTitle || null);
        setGeneratedCompany(parsedJob?.company || company || null);
        
        // Auto-fill fields from parsed job
        if (parsedJob) {
          setUrlParsedSuccessfully(true);
          if (parsedJob.job_title && !jobTitle) setJobTitle(parsedJob.job_title);
          if (parsedJob.jobTitle && !jobTitle) setJobTitle(parsedJob.jobTitle);
          if (parsedJob.company && !company) setCompany(parsedJob.company);
          if (parsedJob.location && !locationInput) setLocationInput(parsedJob.location);
        }
        
        // Update credits (handle both formats)
        if (creditsRemaining !== null && creditsRemaining !== undefined && updateCredits) {
          await updateCredits(creditsRemaining);
        }
        
        // Show success toast
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 5000);
        
        toast({
          title: 'Cover Letter Generated',
          description: 'Your cover letter has been created and saved to your library.',
        });
      } else {
        // No cover letter text found
        const errorMessage = result.message || result.error || 'Failed to generate cover letter. No cover letter text received.';
        setError(errorMessage);
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
      
    } catch (err: any) {
      setError(err.message || 'Failed to generate cover letter.');
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate cover letter.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Copy to Clipboard
  const handleCopyToClipboard = async () => {
    if (!generatedText) return;
    
    try {
      await navigator.clipboard.writeText(generatedText);
      toast({
        title: 'Copied!',
        description: 'Cover letter copied to clipboard.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  // Handle Download PDF
  const handleDownload = () => {
    if (!generatedPdfBase64) return;
    
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${generatedPdfBase64}`;
    link.download = `${(generatedJobTitle || jobTitle || 'cover').replace(/\s+/g, '_')}_letter.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Download Started',
      description: 'Your cover letter is being downloaded.',
    });
  };

  // Handle Regenerate
  const handleRegenerate = () => {
    setGeneratedText(null);
    setGeneratedPdfBase64(null);
    setGeneratedCompany(null);
    setGeneratedJobTitle(null);
    handleGenerate();
  };

  // Handle Clear / Start Over
  const handleStartOver = () => {
    setGeneratedText(null);
    setGeneratedPdfBase64(null);
    setGeneratedCompany(null);
    setGeneratedJobTitle(null);
    setJobUrl('');
    setJobTitle('');
    setCompany('');
    setLocationInput('');
    setJobDescription('');
    setShowManualInputs(false);
    setJobUrlError(null);
    setUrlParsedSuccessfully(false);
  };

  // Handle View library entry
  const handleViewEntry = async (entry: LibraryEntry) => {
    if (entry.pdf_base64) {
      setPreviewEntry(entry);
      return;
    }
    
    setIsLoadingPreview(true);
    try {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry) {
        setPreviewEntry(result.entry);
      } else {
        toast({
          title: 'Error',
          description: result.message || 'Failed to load cover letter preview.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to load cover letter preview.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle Download library entry
  const handleDownloadEntry = async (entry: LibraryEntry) => {
    let pdfBase64 = entry.pdf_base64;
    
    if (!pdfBase64) {
      try {
        const result = await getLibraryEntry(entry.id);
        if (result.status === 'ok' && result.entry?.pdf_base64) {
          pdfBase64 = result.entry.pdf_base64;
        } else {
          toast({
            title: 'Error',
            description: 'Failed to download cover letter.',
            variant: 'destructive',
          });
          return;
        }
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to download cover letter.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${pdfBase64}`;
    link.download = `${entry.display_name || 'cover_letter'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Download Started',
      description: 'Your cover letter is being downloaded.',
    });
  };

  // Load cover letter into generator
  const loadCoverLetter = async (entry: LibraryEntry) => {
    // Switch to generator tab and load the entry
    handleTabChange('cover-letter-generator');
    
    // Load full entry if needed
    let fullEntry = entry;
    if (!entry.pdf_base64) {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry) {
        fullEntry = result.entry;
      }
    }
    
    setGeneratedText(fullEntry.cover_letter_text || null);
    setGeneratedPdfBase64(fullEntry.pdf_base64 || null);
    setGeneratedCompany(fullEntry.company);
    setGeneratedJobTitle(fullEntry.job_title);
  };

  // Format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

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

  if (!user) {
    return null; // Will redirect via useEffect
  }

  // Get recent cover letters (first 3)
  const recentCoverLetters = libraryEntries.slice(0, 3);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader title="" />

          <main style={{ background: '#FAFBFF', flex: 1, overflowY: 'auto', paddingBottom: '96px' }}>
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
                  Cover Letter
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
                  Generate personalized cover letters that make you stand out.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <VideoDemo videoId="VlHvxH44HCU" />
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
                    onClick={() => handleTabChange('cover-letter-generator')}
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
                      background: activeTab === 'cover-letter-generator' ? '#0F172A' : 'transparent',
                      color: activeTab === 'cover-letter-generator' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'cover-letter-generator' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <PenLine className="h-4 w-4" />
                    Cover Letter Generator
                  </button>
                  
                  <button
                    onClick={() => handleTabChange('cover-letter-library')}
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
                      background: activeTab === 'cover-letter-library' ? '#0F172A' : 'transparent',
                      color: activeTab === 'cover-letter-library' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'cover-letter-library' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Cover Letter Library
                    {libraryEntries.length > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: activeTab === 'cover-letter-library' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(37, 99, 235, 0.08)',
                          color: activeTab === 'cover-letter-library' ? 'white' : '#0F172A',
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
                  {/* Error display */}
                  {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-[3px] p-4 flex items-start gap-3">
                      <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                      <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">×</button>
                    </div>
                  )}

                  <TabsContent value="cover-letter-generator" className="mt-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Left Column - Job Details Input */}
                      <div className="space-y-6">
                        {/* Job Details Card */}
                        <div className="bg-white rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden h-fit">
                          {/* Simple gray divider */}
                          <div className="h-1 bg-gray-100"></div>
                          
                          <div className="p-6">
                            {/* Header */}
                            <div className="flex items-center gap-3 mb-6">
                              <div className="w-10 h-10 bg-gray-100 rounded-[3px] flex items-center justify-center">
                                <Briefcase className="w-5 h-5 text-gray-600" />
                              </div>
                              <div>
                                <h2 className="font-semibold text-gray-900">Job Details</h2>
                                <p className="text-sm text-gray-500">Tell us about the role you're applying for</p>
                              </div>
                            </div>
                            
                            {/* Job Posting URL Input */}
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Job Posting URL <span className="text-gray-400 font-normal">(optional)</span>
                              </label>
                              <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Link className="h-4 w-4 text-gray-400 group-focus-within:text-[#3B82F6] transition-colors" />
                                </div>
                                <input
                                  type="url"
                                  value={jobUrl}
                                  onChange={(e) => {
                                    setJobUrl(e.target.value);
                                    setJobUrlError(null);
                                    setUrlParsedSuccessfully(false); // Reset when URL changes
                                  }}
                                  placeholder="https://linkedin.com/jobs/..."
                                  disabled={isGenerating}
                                  className={`block w-full pl-10 pr-10 py-3 border-2 rounded-[3px]
                                             text-gray-900 placeholder-gray-400 text-sm bg-white
                                             hover:border-gray-400
                                             focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20
                                             transition-all duration-150 disabled:opacity-50
                                             ${jobUrlError ? 'border-red-300' : 'border-gray-300'}`}
                                />
                                {jobUrl && isValidUrl(jobUrl) && (
                                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                  </div>
                                )}
                              </div>
                              {jobUrlError && (
                                <p className="text-sm text-amber-600 mt-1">{jobUrlError}</p>
                              )}
                              
                              {/* Supported platforms hint */}
                              {!jobUrl && (
                                <p className="text-xs text-gray-400 mt-2">
                                  Supports LinkedIn, Indeed, Greenhouse, Lever, and most career pages
                                </p>
                              )}
                            </div>
                            
                            {/* Expandable Manual Entry */}
                            <div className="border-t border-gray-100 pt-4 mb-6">
                              <button
                                onClick={() => setShowManualInputs(!showManualInputs)}
                                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                                disabled={isGenerating}
                              >
                                {showManualInputs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                Use manual inputs instead
                              </button>
                              
                              {showManualInputs && (
                                <div className={`mt-4 space-y-4 ${urlParsedSuccessfully && jobUrl ? 'opacity-50' : ''}`}>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Company
                                    </label>
                                    <div className="relative">
                                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Building2 className="h-4 w-4 text-gray-400" />
                                      </div>
                                      <input
                                        type="text"
                                        value={company}
                                        onChange={(e) => setCompany(e.target.value)}
                                        placeholder="e.g. Google, Stripe"
                                        disabled={(urlParsedSuccessfully && jobUrl) || isGenerating}
                                        className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-[3px]
                                                   text-gray-900 placeholder-gray-400 text-sm
                                                   hover:border-gray-300
                                                   focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20
                                                   transition-all duration-150
                                                   hover:border-gray-300 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                                      />
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Job Title
                                    </label>
                                    <div className="relative">
                                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Briefcase className="h-4 w-4 text-gray-400" />
                                      </div>
                                      <input
                                        type="text"
                                        value={jobTitle}
                                        onChange={(e) => setJobTitle(e.target.value)}
                                        placeholder="e.g. Product Manager, Software Engineer"
                                        disabled={(urlParsedSuccessfully && jobUrl) || isGenerating}
                                        className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-[3px]
                                                   text-gray-900 placeholder-gray-400 text-sm
                                                   hover:border-gray-300
                                                   focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20
                                                   transition-all duration-150
                                                   hover:border-gray-300 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                                      />
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Job Description <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                      value={jobDescription}
                                      onChange={(e) => setJobDescription(e.target.value)}
                                      placeholder="Paste the job description or key requirements here..."
                                      rows={5}
                                      disabled={(urlParsedSuccessfully && jobUrl) || isGenerating}
                                      className="block w-full px-4 py-3 border border-gray-200 rounded-[3px]
                                                 text-gray-900 placeholder-gray-400 text-sm resize-none
                                                 hover:border-gray-300
                                                 focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20
                                                 transition-all duration-150
                                                 hover:border-gray-300 transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Generate Button */}
                            <button
                              ref={originalButtonRef}
                              onClick={handleGenerate}
                              disabled={!canGenerate || isGenerating || (user?.credits ?? 0) === 0}
                              className={`
                                w-full py-4 rounded-[3px] font-semibold text-base
                                flex items-center justify-center gap-3
                                transition-all duration-200 transform
                                ${!canGenerate || isGenerating || (user?.credits ?? 0) === 0
                                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                  : 'bg-[#0F172A] text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-100'
                                }
                              `}
                            >
                              {isGenerating && (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              )}
                              {isGenerating ? 'Generating...' : 'Generate Cover Letter'}
                              {!isGenerating && <span className="text-gray-400 font-normal">(5 credits)</span>}
                            </button>
                            
                            {/* Credit indicator */}
                            <div className="mt-3 text-center">
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
                            
                            {/* Resume info */}
                            <div className="mt-4 flex items-center gap-3 p-3 bg-gray-50 rounded-[3px]">
                              <div className="w-8 h-8 bg-white rounded-[3px] flex items-center justify-center">
                                <FileText className="w-4 h-4 text-gray-600" />
                              </div>
                              <p className="text-sm text-gray-600">
                                Your resume from <button onClick={() => navigate('/account-settings')} className="text-[#3B82F6] hover:underline font-medium">Account Settings</button> will be used to personalize the cover letter.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* What's Included - Demoted */}
                        <div className="pt-6 border-t border-gray-100">
                          <p className="text-xs text-gray-400 text-center mb-3">Includes personalized opening, skills alignment, professional formatting, and strong closing</p>
                        </div>
                      </div>

                      {/* Right Column - Preview */}
                      <div>
                        {generatedPdfBase64 ? (
                          /* Preview Card (With Content) */
                          <div className="bg-white rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden h-full min-h-[600px] flex flex-col">
                            {/* Simple gray divider */}
                            <div className="h-1 bg-gray-100"></div>
                            
                            {/* Header with actions */}
                            <div className="p-6 border-b border-gray-100">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gray-100 rounded-[3px] flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-gray-600" />
                                  </div>
                                  <div>
                                    <h2 className="font-semibold text-gray-900">Cover Letter</h2>
                                    <p className="text-sm text-gray-500">
                                      {generatedJobTitle} at {generatedCompany}
                                    </p>
                                  </div>
                                </div>
                                
                                {/* Action buttons */}
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={handleCopyToClipboard}
                                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-[3px] transition-colors"
                                    title="Copy to clipboard"
                                  >
                                    <Copy className="w-5 h-5" />
                                  </button>
                                  <button 
                                    onClick={handleDownload}
                                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-[3px] transition-colors"
                                    title="Download PDF"
                                  >
                                    <Download className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                            
                            {/* Cover Letter Content */}
                            <div className="flex-1 overflow-auto p-6 bg-gray-50">
                              <PDFPreview
                                pdfBase64={generatedPdfBase64}
                                title="Generated Cover Letter"
                              />
                            </div>
                            
                            {/* Footer with regenerate option */}
                            <div className="p-4 border-t border-gray-100 bg-gray-50">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-500">
                                  Not quite right? You can regenerate or start over.
                                </p>
                                <div className="flex items-center gap-3">
                                  <button 
                                    onClick={handleStartOver}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-[3px] hover:bg-gray-50 transition-colors"
                                  >
                                    Start Over
                                  </button>
                                  <button 
                                    onClick={handleRegenerate}
                                    disabled={isGenerating}
                                    className="px-4 py-2 text-sm font-medium text-white bg-[#0F172A] rounded-[3px] hover:bg-[#1E293B] transition-colors disabled:opacity-50"
                                  >
                                    Regenerate
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Preview Card (Empty State) */
                          <div className="bg-white rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden h-full min-h-[600px] flex flex-col">
                            {/* Simple gray divider */}
                            <div className="h-1 bg-gray-100"></div>
                            
                            {/* Header */}
                            <div className="p-6 border-b border-gray-100">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gray-100 rounded-[3px] flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-gray-400" />
                                  </div>
                                  <div>
                                    <h2 className="font-semibold text-gray-900">Preview</h2>
                                    <p className="text-sm text-gray-500">Your generated cover letter</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Empty State Content */}
                            <div className="flex-1 flex items-center justify-center p-8">
                              <div className="text-center">
                                <div className="w-20 h-20 bg-gray-100 rounded-[3px] flex items-center justify-center mx-auto mb-4">
                                  <PenLine className="w-10 h-10 text-gray-300" />
                                </div>
                                <h3 className="text-lg font-medium text-gray-500 mb-2">No cover letter to preview</h3>
                                <p className="text-sm text-gray-400 max-w-xs mx-auto">
                                  Enter job details on the left and click "Generate Cover Letter" to create your personalized cover letter.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Recent Cover Letters Section */}
                    {recentCoverLetters.length > 0 && !generatedPdfBase64 && (
                      <div className="mt-10 pt-8 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-lg font-semibold text-gray-900">Recent Cover Letters</h3>
                          <button 
                            onClick={() => handleTabChange('cover-letter-library')}
                            className="text-sm text-[#3B82F6] hover:underline font-medium"
                          >
                            View all ({libraryEntries.length})
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {recentCoverLetters.map((letter) => (
                            <div 
                              key={letter.id}
                              onClick={() => loadCoverLetter(letter)}
                              className="bg-white rounded-[3px] border border-gray-200 p-4 hover:border-gray-300 hover:shadow-md cursor-pointer transition-all group"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 bg-gray-50 rounded-[3px] flex items-center justify-center group-hover:bg-gray-100 transition-colors">
                                  <FileText className="w-5 h-5 text-gray-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-900 text-sm truncate">{letter.job_title}</p>
                                  <p className="text-xs text-gray-500 truncate">{letter.company}</p>
                                </div>
                              </div>
                              <p className="text-xs text-gray-400">Created {formatTimeAgo(letter.created_at)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="cover-letter-library" className="mt-0">
                    <div className="bg-white rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
                      <div className="h-1 bg-gray-100"></div>
                      
                      <div className="p-6">
                        {isLoadingLibrary ? (
                          <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                          </div>
                        ) : libraryEntries.length === 0 ? (
                          <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <PenLine className="h-8 w-8 text-gray-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Saved Cover Letters</h3>
                            <p className="text-gray-500 max-w-md mx-auto mb-6">
                              Your generated cover letters will appear here.
                            </p>
                            <button 
                              onClick={() => handleTabChange('cover-letter-generator')}
                              className="px-6 py-3 bg-[#0F172A] text-white font-semibold rounded-full hover:shadow-lg transition-all"
                            >
                              Create a Cover Letter
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column - Library List */}
                            <div className="space-y-4">
                              <h2 className="text-lg font-semibold text-gray-900">
                                Saved Cover Letters ({libraryEntries.length})
                              </h2>
                              
                              {libraryEntries.map((entry) => (
                                <div
                                  key={entry.id}
                                  className={`border rounded-[3px] p-4 bg-white transition-colors cursor-pointer ${
                                    previewEntry?.id === entry.id 
                                      ? 'border-[#3B82F6] ring-1 ring-[#3B82F6]/20' 
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                  onClick={() => handleViewEntry(entry)}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                      <div className="w-10 h-10 bg-gray-100 rounded-[3px] flex items-center justify-center flex-shrink-0">
                                        <FileText className="h-5 w-5 text-gray-600" />
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="font-medium text-gray-900 truncate">{entry.display_name}</h4>
                                        <p className="text-sm text-gray-600 mt-0.5">
                                          {entry.job_title} at {entry.company}
                                        </p>
                                        {entry.location && (
                                          <p className="text-sm text-gray-500">{entry.location}</p>
                                        )}
                                        <span className="text-xs text-gray-400 mt-2 block">
                                          {new Date(entry.created_at).toLocaleDateString()}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleViewEntry(entry);
                                        }}
                                        className="text-gray-600 rounded-[3px]"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDownloadEntry(entry);
                                        }}
                                        className="text-gray-600 rounded-[3px]"
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Right Column - Preview Panel */}
                            <div>
                              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
                              
                              {isLoadingPreview ? (
                                <div className="border border-gray-200 rounded-[3px] p-8 bg-gray-50 text-center">
                                  <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto" />
                                  <p className="text-sm text-gray-500 mt-2">Loading preview...</p>
                                </div>
                              ) : previewEntry ? (
                                <div className="space-y-4">
                                  <PDFPreview
                                    pdfBase64={previewEntry.pdf_base64}
                                    title={previewEntry.display_name}
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      onClick={() => handleDownloadEntry(previewEntry)}
                                      className="flex-1 rounded-[3px]"
                                      variant="outline"
                                    >
                                      <Download className="h-4 w-4 mr-2" />
                                      Download PDF
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="border border-gray-200 rounded-[3px] p-8 bg-gray-50 text-center">
                                  <Eye className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                                  <p className="text-gray-500">
                                    Click on a cover letter to preview it
                                  </p>
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

      {/* Loading Modal */}
      {isGenerating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-[3px] p-8 max-w-md text-center shadow-2xl animate-scaleIn">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <PenLine className="w-8 h-8 text-gray-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Writing your cover letter...</h3>
            <p className="text-gray-600 mb-4">
              {jobUrl 
                ? "Analyzing the job posting and crafting your letter"
                : `Creating a personalized letter for ${jobTitle || 'this role'} at ${company || 'the company'}`
              }
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-[#0F172A] h-2 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-3">This usually takes 15-20 seconds</p>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fadeInUp">
          <div className="bg-white rounded-[3px] shadow-lg border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Cover letter generated!</p>
              <p className="text-sm text-gray-500">Saved to your Cover Letter Library</p>
            </div>
            <button 
              onClick={() => setShowSuccessToast(false)}
              className="p-1 hover:bg-gray-100 rounded-[3px]"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>
      )}
      
      {/* Sticky CTA - Only show on cover-letter-generator tab */}
      {activeTab === 'cover-letter-generator' && (
        <StickyCTA
          originalButtonRef={originalButtonRef}
          onClick={handleGenerate}
          isLoading={isGenerating}
          disabled={!canGenerate || isGenerating}
          buttonClassName="rounded-[3px]"
        >
          <span>Generate Cover Letter</span>
        </StickyCTA>
      )}
    </SidebarProvider>
  );
}
