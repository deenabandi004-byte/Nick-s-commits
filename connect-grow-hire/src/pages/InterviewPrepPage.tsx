import React, { useEffect, useMemo, useState, useRef } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { 
  Briefcase, Download, Loader2, BadgeCheck, Calendar, CheckCircle, XCircle,
  Link, Building2, MessageSquare, Lightbulb, AlertTriangle, FileText,
  ClipboardList, FolderOpen, ArrowRight, ChevronDown
} from "lucide-react";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { VideoDemo } from "@/components/VideoDemo";
import { ProGate } from "@/components/ProGate";
import { apiService } from "@/services/api";
import type { InterviewPrep, InterviewPrepStatus } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { INTERVIEW_PREP_CREDITS } from "@/lib/constants";
import { flushSync } from "react-dom";
import { logActivity, generateInterviewPrepSummary } from "@/utils/activityLogger";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { SteppedLoadingBar } from "@/components/ui/LoadingBar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useSubscription } from "@/hooks/useSubscription";
import { canUseFeature, getFeatureLimit } from "@/utils/featureAccess";
import { trackFeatureActionCompleted, trackContentViewed, trackError } from "../lib/analytics";
import { StickyCTA } from "@/components/StickyCTA";

const InterviewPrepPage: React.FC = () => {
  const { user, checkCredits } = useFirebaseAuth();
  const { subscription } = useSubscription();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;
  
  // Check if user has access to interview prep based on remaining uses
  const currentUsage = subscription?.interviewPrepsUsed || 0;
  const tier = subscription?.tier || effectiveUser.tier || 'free';
  const limit = getFeatureLimit(tier, 'interviewPreps');
  const hasMonthlyAccess = subscription 
    ? canUseFeature(
        subscription.tier,
        'interviewPreps',
        currentUsage
      )
    : (tier as 'free' | 'pro' | 'elite') === 'elite';
  
  const hasEnoughCredits = (effectiveUser.credits ?? 0) >= INTERVIEW_PREP_CREDITS;
  const hasAccess = hasMonthlyAccess && hasEnoughCredits;

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("interview-prep");

  // Interview Prep State
  const [interviewPrepLoading, setInterviewPrepLoading] = useState(false);
  const [interviewPrepProgress, setInterviewPrepProgress] = useState<string>("");
  const [interviewPrepId, setInterviewPrepId] = useState<string | null>(null);
  const [, setInterviewPrepResult] = useState<InterviewPrepStatus | null>(null);
  const [interviewPrepStatus, setInterviewPrepStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [currentPrepStatus, setCurrentPrepStatus] = useState<string>('processing');
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [totalSteps, setTotalSteps] = useState(7);
  const [jobPostingUrl, setJobPostingUrl] = useState("");
  const [parsedJobDetails, setParsedJobDetails] = useState<any | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCompanyName, setManualCompanyName] = useState("");
  const [manualJobTitle, setManualJobTitle] = useState("");
  const [showRecentPreps, setShowRecentPreps] = useState(false);
  
  // Ref for original button to track visibility
  const originalButtonRef = useRef<HTMLButtonElement>(null);

  // Interview Prep steps for SteppedLoadingBar - Updated to match new statuses
  const interviewPrepSteps = [
    { id: 'parsing_job_posting', label: 'Parsing job posting' },
    { id: 'extracting_requirements', label: 'Extracting requirements' },
    { id: 'scraping_sources', label: 'Gathering interview data' },
    { id: 'processing_content', label: 'Analyzing with AI' },
    { id: 'personalizing', label: 'Creating prep plan' },
    { id: 'generating_pdf', label: 'Generating guide' },
    { id: 'completed', label: 'Complete!' },
  ];

  // Interview Library State
  const [preps, setPreps] = useState<InterviewPrep[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  // URL validation
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Can generate check
  const canGenerate = jobPostingUrl.trim() || (manualCompanyName.trim() && manualJobTitle.trim());

  // Load interview preps
  useEffect(() => {
    const loadPreps = async () => {
      try {
        const result = await apiService.getInterviewPrepHistory(1000);
        if ("error" in result) {
          throw new Error(result.error);
        }
        setPreps(result.history || []);
      } catch (error) {
        console.error("Failed to load interview preps:", error);
        toast({
          title: "Unable to load library",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLibraryLoading(false);
      }
    };
    loadPreps();
  }, []);

  // Refresh library when a new prep is completed
  useEffect(() => {
    if (interviewPrepStatus === 'completed') {
      setTimeout(() => {
        const loadPreps = async () => {
          try {
            const result = await apiService.getInterviewPrepHistory(1000);
            if ("error" in result) {
              throw new Error(result.error);
            }
            setPreps(result.history || []);
          } catch (error) {
            console.error("Failed to reload interview preps:", error);
          }
        };
        loadPreps();
      }, 2000);
    }
  }, [interviewPrepStatus]);

  const handleInterviewPrepSubmit = async () => {
    const hasUrl = jobPostingUrl.trim();
    const hasManualInput = manualCompanyName.trim() && manualJobTitle.trim();
    
    if (!hasUrl && !hasManualInput) {
      toast({
        title: "Missing Information",
        description: "Please enter a job posting URL, or provide company name and job title.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue.",
        variant: "destructive",
      });
      return;
    }

    if (effectiveUser.credits < INTERVIEW_PREP_CREDITS) {
      toast({
        title: "Insufficient Credits",
        description: `You need ${INTERVIEW_PREP_CREDITS} credits to generate an interview prep.`,
        variant: "destructive",
      });
      return;
    }

    setInterviewPrepLoading(true);
    setInterviewPrepStatus('processing');
    setCurrentPrepStatus('processing');
    setInterviewPrepProgress('Initializing...');
    setProgressPercent(0);
    setCurrentStep(1);
    setTotalSteps(7);
    setInterviewPrepResult(null);

    try {
      const request: any = {};
      if (jobPostingUrl.trim()) {
        request.job_posting_url = jobPostingUrl.trim();
      } else {
        request.company_name = manualCompanyName.trim();
        request.job_title = manualJobTitle.trim();
      }
      
      const result = await apiService.generateInterviewPrep(request);
      
      if ('error' in result) {
        throw new Error(result.error);
      }

      const prepId = result.id;
      setInterviewPrepId(prepId);
      
      let pollCount = 0;
      const maxPolls = 120;
      
      const handleStatusUpdate = (statusResult: any) => {
            if ('status' in statusResult) {
              const status = statusResult.status;
              setCurrentPrepStatus(status);
              
              // Update progress fields
              setInterviewPrepProgress(statusResult.progress || 'Processing...');
              setProgressPercent(statusResult.progressPercent || 0);
              setCurrentStep(statusResult.currentStep || 1);
              setTotalSteps(statusResult.totalSteps || 7);
              
              if (statusResult.jobDetails) {
                setParsedJobDetails(statusResult.jobDetails);
              }
            }
      };
      
      const handleCompletion = (statusResult: any) => {
        if (user?.uid && statusResult.jobDetails) {
          try {
            const jobDetails = statusResult.jobDetails;
            const roleTitle = jobDetails.job_title || manualJobTitle.trim() || '';
            const company = jobDetails.company_name || manualCompanyName.trim() || '';
            const summary = generateInterviewPrepSummary({
              roleTitle: roleTitle || undefined,
              company: company || undefined,
            });
            logActivity(user.uid, 'interviewPrep', summary, {
              prepId: prepId,
              roleTitle: roleTitle || '',
              company: company || '',
              jobPostingUrl: jobPostingUrl.trim() || '',
            }).catch(err => console.error('Failed to log activity:', err));
          } catch (error) {
            console.error('Failed to log interview prep activity:', error);
          }
        }
        
        // TODO(#13): PostHog was reset and never re-configured. This event fired
        // into a void. Rewire through /api/metrics/events or replacement analytics
        // system per https://github.com/deenabandi004-byte/Final_offerloop/issues/13
        // <ORIGINAL CALL COMMENTED BELOW>
        // trackFeatureActionCompleted('interview_prep', 'generate', true, {
        //   credits_spent: INTERVIEW_PREP_CREDITS,
        // });
        
        flushSync(() => {
          setInterviewPrepLoading(false);
          setInterviewPrepStatus('completed');
          setInterviewPrepProgress('Interview Prep ready!');
          setInterviewPrepResult(statusResult as InterviewPrepStatus);
          setInterviewPrepId((statusResult as any).id || prepId);
        });
        
        toast({
          title: "Interview Prep Ready!",
          description: "Your interview prep PDF has been generated successfully.",
          duration: 5000,
        });
        
        if (checkCredits) {
          checkCredits();
        }
      };
      
      const pollPromise = new Promise((resolve, reject) => {
        let pollInterval = 2000; // Start at 2 seconds
        const maxInterval = 10000; // Cap at 10 seconds
        const backoffMultiplier = 1.3;
        let timeoutId: NodeJS.Timeout | null = null;
        let isPolling = true;
        
        // Initial poll
        (async () => {
          try {
            const statusResult = await apiService.getInterviewPrepStatus(prepId);
            
            if ('pdfUrl' in statusResult && statusResult.pdfUrl) {
              isPolling = false;
              if (timeoutId) clearTimeout(timeoutId);
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
          } catch (error) {
            console.error(`[InterviewPrep] Initial poll error:`, error);
          }
        })();
        
        // Recursive polling function with exponential backoff
        const poll = async () => {
          if (!isPolling) return;
          
          pollCount++;
          
          try {
            const statusResult = await apiService.getInterviewPrepStatus(prepId);
            
            if ('error' in statusResult && !('status' in statusResult)) {
              isPolling = false;
              reject(new Error(statusResult.error));
              return;
            }
            
            if ('status' in statusResult) {
              const status = statusResult.status;
              setCurrentPrepStatus(status);
              
              // Update progress fields
              setInterviewPrepProgress(statusResult.progress || 'Processing...');
              setProgressPercent(statusResult.progressPercent || 0);
              setCurrentStep(statusResult.currentStep || 1);
              setTotalSteps(statusResult.totalSteps || 7);
              
              if (statusResult.jobDetails) {
                setParsedJobDetails(statusResult.jobDetails);
              }
            }
            
            if ('pdfUrl' in statusResult && statusResult.pdfUrl) {
              isPolling = false;
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }
            
            handleStatusUpdate(statusResult);
            
            if (statusResult.status === 'failed' || statusResult.status === 'parsing_failed') {
              isPolling = false;
              if (statusResult.needsManualInput || statusResult.status === 'parsing_failed') {
                setShowManualInput(true);
                setInterviewPrepLoading(false);
                setInterviewPrepStatus('idle');
                toast({
                  title: "URL Parsing Failed",
                  description: "Please enter the company name and job title manually below.",
                  variant: "default",
                });
                resolve(statusResult);
                return;
              }
              reject(new Error(statusResult.error || 'Generation failed'));
              return;
            }
            
            if (pollCount >= maxPolls) {
              isPolling = false;
              setTimeout(async () => {
                try {
                  const finalCheck = await apiService.getInterviewPrepStatus(prepId);
                  if ('pdfUrl' in finalCheck && finalCheck.pdfUrl) {
                    flushSync(() => {
                      setInterviewPrepLoading(false);
                      setInterviewPrepStatus('completed');
                      setInterviewPrepProgress('Interview Prep ready!');
                      setInterviewPrepResult(finalCheck as InterviewPrepStatus);
                      setInterviewPrepId((finalCheck as any).id || prepId);
                    });
                    toast({
                      title: "Interview Prep Ready!",
                      description: "Your interview prep PDF has been generated successfully.",
                      duration: 5000,
                    });
                    if (checkCredits) checkCredits();
                    resolve(finalCheck);
                  } else {
                    reject(new Error('Generation is taking longer than expected. Please check back in a few minutes.'));
                  }
                } catch (e) {
                  reject(new Error('Generation timed out. Please try again or check back later.'));
                }
              }, 2000);
              return;
            }
            
            // Exponential backoff: increase interval for next poll
            pollInterval = Math.min(pollInterval * backoffMultiplier, maxInterval);
            
            // Schedule next poll
            if (isPolling) {
              timeoutId = setTimeout(poll, pollInterval);
            }
          } catch (error) {
            isPolling = false;
            reject(error);
          }
        };
        
        // Start polling after initial check
        timeoutId = setTimeout(poll, pollInterval);
      });
      
      await pollPromise;
      
    } catch (error: any) {
      console.error('Interview prep failed:', error);
      setInterviewPrepStatus('failed');
      setInterviewPrepProgress('Generation failed');
      trackError('interview_prep', 'generate', 'api_error', error.message);
      toast({
        title: "Generation Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setInterviewPrepLoading(false);
    }
  };

  const downloadInterviewPrepPDF = async (prepId?: string) => {
    const id = prepId || interviewPrepId;
    if (!id || !user) return;

    try {
      const MAX_TRIES = 20;
      const DELAY_MS = 1000;
      let pdfUrl: string | undefined;
      let companyName: string | undefined;
      let jobTitle: string | undefined;

      toast({
        title: "Preparing PDF",
        description: "Please wait while we prepare your Interview Prep PDF...",
        duration: 3000,
      });

      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const res = await apiService.downloadInterviewPrepPDF(id);
          pdfUrl = res?.pdfUrl || undefined;
          companyName = res?.companyName || undefined;
          jobTitle = res?.jobTitle || undefined;
          if (pdfUrl) {
            const response = await fetch(pdfUrl, { method: 'HEAD' });
            if (response.ok) {
              break;
            }
          }
        } catch { /* ignore transient errors */ }
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      if (!pdfUrl) {
        throw new Error("PDF isn't ready yet. Please try again in a moment.");
      }

      const sanitizeForFilename = (str: string): string => {
        return str
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 50);
      };

      const company = companyName ? sanitizeForFilename(companyName) : 'Company';
      const role = jobTitle ? sanitizeForFilename(jobTitle) : 'Role';
      const filename = `Oloop_interviewprep_${company}_${role}.pdf`;

      await new Promise(r => setTimeout(r, 500));

      try {
        const response = await fetch(pdfUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
        
        trackContentViewed('interview_prep', 'pdf', id);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Interview Prep PDF has been downloaded.",
          duration: 3000,
        });
      } catch (fetchError) {
        console.warn("Blob download failed, trying direct link:", fetchError);
        const a = document.createElement("a");
        a.href = pdfUrl;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 100);
        
        trackContentViewed('interview_prep', 'pdf', id);
        
        toast({
          title: "PDF Download Started",
          description: "Your Interview Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (err) {
      trackError('interview_prep', 'download', 'network_error', err instanceof Error ? err.message : undefined);
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Could not download the PDF.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (prep: InterviewPrep) => {
    try {
      if (prep.pdfUrl) {
        window.open(prep.pdfUrl, "_blank", "noopener");
        trackContentViewed('interview_prep', 'pdf', prep.id);
        return;
      }
      const { pdfUrl } = await apiService.downloadInterviewPrepPDF(prep.id);
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener");
        trackContentViewed('interview_prep', 'pdf', prep.id);
      } else {
        throw new Error("PDF URL not available yet");
      }
    } catch (error) {
      trackError('interview_prep', 'download', 'network_error', error instanceof Error ? error.message : undefined);
      toast({
        title: "Download failed",
        description: "Could not open the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const groupedPreps = useMemo(() => {
    const completed = preps.filter((p) => p.status === "completed");
    const inProgress = preps.filter((p) => p.status !== "completed");
    return { completed, inProgress };
  }, [preps]);

  const recentPreps = useMemo(() => {
    return groupedPreps.completed.slice(0, 3);
  }, [groupedPreps.completed]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader title="" />

          <ProGate title="Interview Prep" description="Get company-specific behavioral questions, prep guides, and insider context tailored to your target role." videoId="q5ZPtmnZciE">
          <main data-tour="tour-interview-prep" style={{ background: '#FAFBFF', flex: 1, overflowY: 'auto', paddingBottom: '96px' }}>
            <div className="max-w-4xl mx-auto px-3 py-6 sm:px-6 sm:py-12">
              
              {/* Header Section */}
              <div className="w-full px-3 py-6 sm:px-6 sm:py-12 !pb-0" style={{ maxWidth: '900px', margin: '0 auto' }}>
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
                  Interview Prep
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
                  Paste a job posting URL and get a full interview guide with likely questions and a prep plan.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <VideoDemo videoId="q5ZPtmnZciE" />
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
                    onClick={() => setActiveTab('interview-prep')}
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
                      background: activeTab === 'interview-prep' ? '#0F172A' : 'transparent',
                      color: activeTab === 'interview-prep' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'interview-prep' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <Briefcase className="h-4 w-4" />
                    Interview Prep
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('interview-library')}
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
                      background: activeTab === 'interview-library' ? '#0F172A' : 'transparent',
                      color: activeTab === 'interview-library' ? 'white' : '#64748B',
                      boxShadow: activeTab === 'interview-library' ? '0 1px 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Interview Library
                    {preps.length > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: activeTab === 'interview-library' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(37, 99, 235, 0.08)',
                          color: activeTab === 'interview-library' ? 'white' : '#0F172A',
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          fontSize: '11px',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {preps.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                {/* INTERVIEW PREP TAB */}
                <TabsContent value="interview-prep" className="mt-0">
                  {!hasAccess && (
                    <div className="mb-6 animate-fadeInUp" style={{ animationDelay: '150ms' }}>
                      <UpgradeBanner
                        hasExhaustedLimit={!hasMonthlyAccess}
                        hasEnoughCredits={hasEnoughCredits}
                        currentUsage={currentUsage}
                        limit={limit}
                        tier={tier}
                        requiredCredits={INTERVIEW_PREP_CREDITS}
                        currentCredits={effectiveUser.credits ?? 0}
                        featureName="Interview Preps"
                        nextTier={subscription?.tier === 'free' ? 'Pro' : 'Elite'}
                        showUpgradeButton={!hasMonthlyAccess || !hasEnoughCredits}
                      />
                    </div>
                  )}

                  {/* Main Card */}
                  <div className="bg-white rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                    {/* Simple gray divider */}
                    <div className="h-1 bg-gray-100"></div>
                    
                    <div className="p-8">
                      {/* Card Header */}
                      <div className="text-center mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">What role are you preparing for?</h2>
                        <p className="text-gray-600 max-w-lg mx-auto">
                          Paste a job posting URL to generate a personalized prep guide.
                        </p>
                      </div>

                      {/* URL Input Section */}
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Job Posting URL <span className="text-red-400">*</span>
                          </label>
                          
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                              <Link className="h-5 w-5 text-gray-400 group-focus-within:text-[#3B82F6] transition-colors" />
                            </div>
                            
                            <input
                              type="url"
                              value={jobPostingUrl}
                              onChange={(e) => {
                                setJobPostingUrl(e.target.value);
                                if (e.target.value.trim()) {
                                  setShowManualInput(false);
                                  setManualCompanyName("");
                                  setManualJobTitle("");
                                }
                              }}
                              placeholder="Paste the job posting URL here..."
                              disabled={interviewPrepLoading || !hasAccess}
                              className="block w-full pl-12 pr-12 py-4 text-base border-2 border-gray-300 rounded-[3px]
                                         text-gray-900 placeholder-gray-400 bg-white
                                         hover:border-gray-400
                                         focus:border-[#3B82F6] focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20
                                         transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            
                            {jobPostingUrl && isValidUrl(jobPostingUrl) && (
                              <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              </div>
                            )}
                          </div>
                          
                          {/* Supported platforms */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-500">Supports:</span>
                            {['LinkedIn', 'Indeed', 'Greenhouse', 'Lever', 'Workday'].map((platform) => (
                              <span 
                                key={platform}
                                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                              >
                                {platform}
                              </span>
                            ))}
                            <span className="text-xs text-gray-500">+ most career pages</span>
                          </div>
                        </div>

                        {/* OR Divider */}
                        {!showManualInput && !jobPostingUrl.trim() && (
                          <div className="relative py-4">
                            <div className="absolute inset-0 flex items-center">
                              <div className="w-full border-t border-gray-200"></div>
                            </div>
                            <div className="relative flex justify-center">
                              <span className="px-4 bg-white text-sm text-gray-500">Or enter manually</span>
                            </div>
                          </div>
                        )}

                        {/* Manual Entry Fields */}
                        {!showManualInput && !jobPostingUrl.trim() && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Company Name
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Building2 className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  value={manualCompanyName}
                                  onChange={(e) => setManualCompanyName(e.target.value)}
                                  placeholder="e.g., Google, Amazon, Meta"
                                  disabled={interviewPrepLoading || !hasAccess}
                                  className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-[3px]
                                             text-gray-900 placeholder-gray-400
                                             hover:border-gray-300
                                             focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]
                                             transition-all duration-150 disabled:opacity-50"
                                />
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Job Title
                              </label>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Briefcase className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                  type="text"
                                  value={manualJobTitle}
                                  onChange={(e) => setManualJobTitle(e.target.value)}
                                  placeholder="e.g., Software Engineer, Data Scientist"
                                  disabled={interviewPrepLoading || !hasAccess}
                                  className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-[3px]
                                             text-gray-900 placeholder-gray-400
                                             hover:border-gray-300
                                             focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]
                                             transition-all duration-150 disabled:opacity-50"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Manual Input Required (fallback) */}
                        {showManualInput && (
                          <div className="rounded-[3px] border border-amber-200 bg-amber-50 p-5 space-y-4">
                            <div className="flex items-start gap-2">
                              <XCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-800 mb-1">
                                  URL Parsing Failed - Manual Input Required
                                </p>
                                <p className="text-xs text-amber-700">
                                  We couldn't parse the job posting URL. Please enter the details manually below.
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Company Name <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Building2 className="h-5 w-5 text-gray-400" />
                                  </div>
                                  <input
                                    type="text"
                                    value={manualCompanyName}
                                    onChange={(e) => setManualCompanyName(e.target.value)}
                                    placeholder="e.g., Google, Amazon, Meta"
                                    disabled={interviewPrepLoading || !hasAccess}
                                    className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-[3px] bg-white
                                               text-gray-900 placeholder-gray-400
                                               focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]
                                               transition-all duration-150"
                                  />
                                </div>
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Job Title <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Briefcase className="h-5 w-5 text-gray-400" />
                                  </div>
                                  <input
                                    type="text"
                                    value={manualJobTitle}
                                    onChange={(e) => setManualJobTitle(e.target.value)}
                                    placeholder="e.g., Software Engineer, Product Manager"
                                    disabled={interviewPrepLoading || !hasAccess}
                                    className="block w-full pl-10 pr-4 py-3 border border-gray-200 rounded-[3px] bg-white
                                               text-gray-900 placeholder-gray-400
                                               focus:bg-[#FAFBFF]/20 focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]
                                               transition-all duration-150"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Parsed Job Details Preview */}
                        {parsedJobDetails && (
                          <div className="rounded-[3px] border border-gray-200 bg-gray-50 p-5">
                            <p className="text-sm font-semibold text-gray-700 mb-3">Job Details Preview:</p>
                            <div className="space-y-2 text-sm text-gray-700">
                              <div><span className="text-gray-500">Company:</span> {parsedJobDetails.company_name}</div>
                              <div><span className="text-gray-500">Role:</span> {parsedJobDetails.job_title}</div>
                              {parsedJobDetails.level && (
                                <div><span className="text-gray-500">Level:</span> {parsedJobDetails.level}</div>
                              )}
                              {parsedJobDetails.team_division && (
                                <div><span className="text-gray-500">Team:</span> {parsedJobDetails.team_division}</div>
                              )}
                              {parsedJobDetails.required_skills && parsedJobDetails.required_skills.length > 0 && (
                                <div>
                                  <span className="text-gray-500">Key Skills:</span> {parsedJobDetails.required_skills.slice(0, 5).join(', ')}
                                  {parsedJobDetails.required_skills.length > 5 && ` +${parsedJobDetails.required_skills.length - 5} more`}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* What You'll Receive Section - Demoted */}
                      <div className="mt-8 pt-6 border-t border-gray-100">
                        <p className="text-center text-xs text-gray-400 mb-4">Includes interview process, common questions, success tips, and a PDF guide</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl mx-auto">
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 rounded-[3px] bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <ClipboardList className="w-3 h-3 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-700">Interview Process</p>
                              <p className="text-xs text-gray-400">Company stages</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 rounded-[3px] bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <MessageSquare className="w-3 h-3 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-700">Common Questions</p>
                              <p className="text-xs text-gray-400">Behavioral & technical</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 rounded-[3px] bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <Lightbulb className="w-3 h-3 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-700">Success Tips</p>
                              <p className="text-xs text-gray-400">From candidates</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 rounded-[3px] bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <AlertTriangle className="w-3 h-3 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-700">Red Flags</p>
                              <p className="text-xs text-gray-400">Common mistakes</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 rounded-[3px] bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-3 h-3 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-700">Culture Insights</p>
                              <p className="text-xs text-gray-400">Work environment</p>
                            </div>
                          </div>
                          
                          <div className="flex items-start gap-2">
                            <div className="w-6 h-6 rounded-[3px] bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-3 h-3 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-700">PDF Guide</p>
                              <p className="text-xs text-gray-400">5-6 pages</p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Credits info */}
                        <div className="mt-4 text-center">
                          <p className="text-xs text-gray-400">Uses {INTERVIEW_PREP_CREDITS} credits per prep guide</p>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <div className="mt-8">
                        <button
                          ref={originalButtonRef}
                          onClick={handleInterviewPrepSubmit}
                          disabled={
                            interviewPrepLoading || 
                            effectiveUser.credits < INTERVIEW_PREP_CREDITS ||
                            !canGenerate ||
                            !hasAccess
                          }
                          className={`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3 mx-auto
                            transition-all duration-200 transform
                            ${(!canGenerate || interviewPrepLoading || !hasAccess)
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-[#0F172A] text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-100'
                            }
                          `}
                        >
                          {interviewPrepLoading ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              Generate Interview Prep
                              <ArrowRight className="w-5 h-5" />
                            </>
                          )}
                        </button>
                        
                        {/* Helper text */}
                        <p className="text-center text-xs text-gray-400 mt-3">
                          {jobPostingUrl 
                            ? "We'll extract the role details automatically"
                            : manualCompanyName && manualJobTitle 
                              ? `Preparing guide for ${manualJobTitle} at ${manualCompanyName}`
                              : "Enter a job URL or fill in the company and title"
                          }
                        </p>
                      </div>

                      {/* Progress/Status Display */}
                      {interviewPrepStatus !== 'idle' && (
                        <div className="mt-6">
                          {interviewPrepStatus === 'completed' ? (
                            <div className="flex flex-col items-center gap-4 p-6 bg-gray-50 border border-gray-200 rounded-[3px]">
                              <div className="flex items-center gap-2 text-gray-700">
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                <span className="font-medium">{interviewPrepProgress}</span>
                              </div>
                              <button
                                onClick={() => downloadInterviewPrepPDF()}
                                className="px-6 py-3 bg-[#0F172A] text-white font-semibold rounded-full hover:bg-[#1E293B] transition-colors flex items-center gap-2"
                              >
                                <Download className="h-5 w-5" />
                                Download Full PDF
                              </button>
                            </div>
                          ) : interviewPrepStatus === 'failed' ? (
                            <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 rounded-[3px] text-red-700">
                              <XCircle className="h-5 w-5" />
                              <span>{interviewPrepProgress || 'Generation failed'}</span>
                            </div>
                          ) : (
                            <div className="p-6 bg-gray-50 border border-gray-200 rounded-[3px]">
                              <div className="flex items-center justify-center gap-3 mb-4">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                                <span className="font-medium text-gray-700">{interviewPrepProgress}</span>
                              </div>
                              
                              {/* Stepped progress bar (shows both steps and percentage) */}
                              <SteppedLoadingBar 
                                steps={interviewPrepSteps} 
                                currentStepId={currentPrepStatus} 
                              />
                              
                              {/* Step indicator and time estimate */}
                              <div className="mt-3 flex items-center justify-between">
                                <p className="text-sm text-gray-600">
                                  Step {currentStep} of {totalSteps}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {progressPercent < 40 
                                    ? "This usually takes 45-60 seconds" 
                                    : progressPercent < 80 
                                      ? "Almost there..." 
                                      : "Finishing up..."}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Recent Preps from Library - Collapsible */}
                      {recentPreps.length > 0 && interviewPrepStatus !== 'completed' && (
                        <div className="mt-10 pt-8 border-t border-gray-100">
                          {/* Toggle Row */}
                          <button
                            onClick={() => setShowRecentPreps(!showRecentPreps)}
                            className="w-full flex items-center justify-between py-2 text-sm text-gray-600 hover:text-[#3B82F6] transition-colors cursor-pointer"
                          >
                            <span>Recent Prep Guides ({recentPreps.length})</span>
                            <ChevronDown 
                              className={`w-4 h-4 text-gray-400 group-hover:text-[#3B82F6] transition-all duration-150 ${showRecentPreps ? 'rotate-180' : ''}`}
                            />
                          </button>
                          
                          {/* Expandable Content */}
                          <div 
                            className={`overflow-hidden transition-all duration-200 ${showRecentPreps ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}
                          >
                            <div className="pt-4">
                              <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-gray-700">Recent Prep Guides</h3>
                                <button 
                                  onClick={() => setActiveTab('interview-library')}
                                  className="text-sm text-[#3B82F6] hover:underline"
                                >
                                  View all ({preps.length})
                                </button>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {recentPreps.map((prep) => (
                                  <div 
                                    key={prep.id}
                                    onClick={() => handleDownload(prep)}
                                    className="p-4 bg-gray-50 rounded-[3px] hover:bg-gray-100 cursor-pointer transition-colors group border border-transparent hover:border-gray-200"
                                  >
                                    <div className="flex items-center gap-3 mb-2">
                                      <div className="w-10 h-10 bg-white rounded-[3px] flex items-center justify-center border border-gray-200 group-hover:border-gray-300 transition-colors">
                                        <Briefcase className="w-5 h-5 text-gray-600" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 text-sm truncate">{prep.jobTitle || 'Interview Prep'}</p>
                                        <p className="text-xs text-gray-500 truncate">{prep.companyName}</p>
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-400">
                                      {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : ''}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* INTERVIEW LIBRARY TAB */}
                <TabsContent value="interview-library" className="mt-0">
                  <div className="bg-white rounded-[3px] shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp" style={{ animationDelay: '200ms' }}>
                    <div className="h-1 bg-gray-100"></div>
                    
                    <div className="p-8">
                      {libraryLoading ? (
                        <LoadingSkeleton variant="card" count={3} />
                      ) : preps.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Briefcase className="h-8 w-8 text-gray-600" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">No preps yet</h3>
                          <p className="text-sm text-gray-500 mb-6">
                            Generate your first interview prep to see it appear here.
                          </p>
                          <button
                            onClick={() => setActiveTab('interview-prep')}
                            className="px-6 py-3 bg-[#0F172A] text-white font-semibold rounded-full hover:shadow-lg transition-all"
                          >
                            Create Your First Prep
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {groupedPreps.inProgress.length > 0 && (
                            <section>
                              <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                                In Progress
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.inProgress.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="p-4 bg-amber-50 border border-amber-200 rounded-[3px] flex items-center justify-between"
                                  >
                                    <div>
                                      <p className="font-medium text-gray-900">{prep.companyName}</p>
                                      {prep.jobTitle && (
                                        <p className="text-sm text-gray-600">{prep.jobTitle}</p>
                                      )}
                                      <p className="text-xs text-gray-400 mt-1">
                                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 text-amber-600">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span className="text-xs uppercase font-medium">Processing...</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {groupedPreps.completed.length > 0 && (
                            <section className="space-y-3">
                              <h3 className="text-sm font-semibold text-gray-500 uppercase">
                                Completed ({groupedPreps.completed.length})
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.completed.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="p-5 bg-white border border-gray-200 rounded-[3px] hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <BadgeCheck className="h-5 w-5 text-gray-600" />
                                        <span className="font-semibold text-gray-900">{prep.companyName}</span>
                                      </div>
                                      {prep.jobTitle && (
                                        <p className="text-sm text-gray-600">{prep.jobTitle}</p>
                                      )}
                                      <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Calendar className="h-3 w-3" />
                                        {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : "—"}
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => handleDownload(prep)}
                                      className="px-4 py-2 bg-[#FAFBFF] text-[#3B82F6] rounded-full text-sm font-medium hover:bg-[#EEF2F8] transition-colors flex items-center gap-2"
                                    >
                                      <Download className="h-4 w-4" />
                                      PDF
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </main>
          </ProGate>
        </MainContentWrapper>

        {/* Sticky CTA - Only show on interview-prep tab */}
        {activeTab === 'interview-prep' && (
          <StickyCTA
            originalButtonRef={originalButtonRef}
            onClick={handleInterviewPrepSubmit}
            isLoading={interviewPrepLoading}
            disabled={
              interviewPrepLoading || 
              effectiveUser.credits < INTERVIEW_PREP_CREDITS ||
              !canGenerate ||
              !hasAccess
            }
            buttonClassName="rounded-full"
          >
            <span>Generate Interview Prep</span>
          </StickyCTA>
        )}
      </div>
    </SidebarProvider>
  );
};

export default InterviewPrepPage;
