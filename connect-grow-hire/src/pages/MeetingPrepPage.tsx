import React, { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { PDLOutageBanner } from "@/components/PDLOutageBanner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Coffee,
  Download,
  Trash2,
  BadgeCheck,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Linkedin,
  MessageSquare,
  FileText,
  Newspaper,
  Loader2,
  AlertCircle,
  Upload,
  FolderOpen,
} from "lucide-react";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { VideoDemo } from "@/components/VideoDemo";
import { ProGate } from "@/components/ProGate";
import { apiService } from "@/services/api";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import type { MeetingPrep, CoffeeChatPrepStatus } from "@/services/api";
import { InlineLoadingBar, SteppedLoadingBar } from "@/components/ui/LoadingBar";
import { toast } from "@/hooks/use-toast";
import { MEETING_CREDITS } from "@/lib/constants";
import { flushSync } from "react-dom";
import { logActivity, generateCoffeeChatPrepSummary } from "@/utils/activityLogger";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { IS_DEV_PREVIEW } from "@/lib/devPreview";
import { useSubscription } from "@/hooks/useSubscription";
import { canUseFeature, getFeatureLimit } from "@/utils/featureAccess";
import { trackFeatureActionCompleted, trackContentViewed, trackError } from "../lib/analytics";

const MeetingPrepPage: React.FC = () => {
  const { user: firebaseUser, checkCredits } = useFirebaseAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();
  const effectiveUser = firebaseUser || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;
  
  // Check if user has access to meeting prep based on remaining uses
  const currentUsage = subscription?.coffeeChatPrepsUsed || 0;
  const tier = subscription?.tier || effectiveUser.tier || 'free';
  const limit = getFeatureLimit(tier, 'coffeeChatPreps');
  const hasMonthlyAccess = subscription 
    ? canUseFeature(
        subscription.tier,
        'coffeeChatPreps',
        currentUsage
      )
    : effectiveUser.tier === 'elite';
  
  const hasEnoughCredits = (effectiveUser.credits ?? 0) >= MEETING_CREDITS;
  const hasAccess = hasMonthlyAccess && hasEnoughCredits;

  // Animated placeholder
  const PLACEHOLDER_EXAMPLES = [
    'linkedin.com/in/sarah-chen-goldman-sachs',
    'linkedin.com/in/david-park-mckinsey',
    'linkedin.com/in/maria-garcia-google',
    'linkedin.com/in/james-wilson-deloitte',
    'linkedin.com/in/priya-patel-jpmorgan',
  ];
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
        setPlaceholderVisible(true);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Meeting Generation State
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingProgress, setMeetingProgress] = useState<string>("");
  const [meetingPrepId, setMeetingPrepId] = useState<string | null>(null);
  const [meetingResult, setMeetingResult] = useState<CoffeeChatPrepStatus | null>(null);
  const [meetingStatus, setMeetingStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [currentPrepStatus, setCurrentPrepStatus] = useState<string>('pending');
  
  const meetingSteps = [
    { id: 'processing', label: 'Initializing...' },
    { id: 'enriching', label: 'Looking up LinkedIn profile...' },
    { id: 'researching', label: 'Researching company & industry...' },
    { id: 'analyzing', label: 'Analyzing career history...' },
    { id: 'generating', label: 'Writing tailored questions...' },
    { id: 'building', label: 'Building your prep sheet...' },
    { id: 'completed', label: 'Complete!' },
  ];
  const meetingPollTimeoutRef = useRef<number | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Library State
  const [preps, setPreps] = useState<MeetingPrep[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("meeting-prep");

  // LinkedIn URL validation
  const isValidLinkedInUrl = (url: string) => {
    return url.match(/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/);
  };

  const meetingTabs = [
    { id: 'meeting-prep', label: 'Meeting Prep', icon: MessageSquare },
    { id: 'coffee-library', label: 'Coffee Library', icon: FolderOpen },
  ];

  useLayoutEffect(() => {
    const activeIndex = meetingTabs.findIndex(t => t.id === activeTab);
    const el = tabRefs.current[activeIndex];
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (meetingPollTimeoutRef.current) {
        clearTimeout(meetingPollTimeoutRef.current);
        meetingPollTimeoutRef.current = null;
      }
    };
  }, []);

  // Load library preps
  useEffect(() => {
    const loadPreps = async () => {
      try {
        const result = await apiService.getAllCoffeeChatPreps();
        if ("error" in result) {
          throw new Error(result.error);
        }
        setPreps(result.preps || []);
      } catch (error) {
        console.error("Failed to load meeting preps:", error);
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

  // Refresh library after successful generation
  useEffect(() => {
    if (meetingStatus === 'completed' && meetingPrepId) {
      const loadPreps = async () => {
        try {
          const result = await apiService.getAllCoffeeChatPreps();
          if ("error" in result) {
            return;
          }
          setPreps(result.preps || []);
        } catch (error) {
          // Silent fail on refresh
        }
      };
      loadPreps();
    }
  }, [meetingStatus, meetingPrepId]);

  const handleMeetingSubmit = async () => {
    if (!linkedinUrl.trim()) {
      toast({
        title: "Missing LinkedIn URL",
        description: "Please enter a LinkedIn profile URL.",
        variant: "destructive",
      });
      return;
    }

    if (!firebaseUser) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to continue.",
        variant: "destructive",
      });
      return;
    }

    if ((effectiveUser.credits ?? 0) < MEETING_CREDITS) {
      toast({
        title: "Insufficient Credits",
        description: `You need ${MEETING_CREDITS} credits to generate a meeting prep.`,
        variant: "destructive",
      });
      return;
    }

    setMeetingLoading(true);
    setMeetingStatus('processing');
    setCurrentPrepStatus('processing');
    setMeetingProgress('Starting Meeting Prep...');
    setMeetingResult(null);

    try {
      const result = await apiService.createMeetingPrep({ linkedinUrl });
      
      if ('error' in result) {
        throw new Error(result.error);
      }

      const prepId = result.prepId;
      setMeetingPrepId(prepId);
      
      let pollCount = 0;
      const maxPolls = 200;
      
      const handleStatusUpdate = (statusResult: any) => {
        if ('status' in statusResult) {
          const stage = statusResult.stage || statusResult.status;
          setCurrentPrepStatus(stage);

          // Use stageLabel from backend if available, otherwise fallback
          const progressMessage = statusResult.stageLabel || (() => {
            const statusMessages: Record<string, string> = {
              'processing': 'Initializing...',
              'enriching': 'Looking up LinkedIn profile...',
              'researching': 'Researching company & industry...',
              'analyzing': 'Analyzing career history...',
              'generating': 'Writing tailored questions...',
              'building': 'Building your prep sheet...',
              'completed': 'Meeting Prep ready!',
              'failed': 'Generation failed',
            };
            return statusMessages[stage] || 'Processing...';
          })();
          setMeetingProgress(progressMessage);
        }
      };
      
      const handleCompletion = (statusResult: any) => {
        const contactData = statusResult.contactData || {};
        if (firebaseUser?.uid && statusResult.contactData) {
          try {
            const contactName = statusResult.contactData.name ||
                               `${statusResult.contactData.firstName || ''} ${statusResult.contactData.lastName || ''}`.trim() ||
                               '';
            const company = statusResult.contactData.company || statusResult.contactData.companyName || '';
            const summary = generateCoffeeChatPrepSummary({
              contactName: contactName || undefined,
              company: company || undefined,
            });
            logActivity(firebaseUser.uid, 'coffeePrep', summary, {
              prepId: prepId,
              linkedinUrl: linkedinUrl,
              contactName: contactName || '',
              company: company || '',
            }).catch(err => console.error('Failed to log activity:', err));
          } catch (error) {
            console.error('Failed to log meeting prep activity:', error);
          }
        }
        
        flushSync(() => {
          setMeetingLoading(false);
          setMeetingStatus('completed');
          setMeetingProgress('Meeting Prep ready!');
          setMeetingResult(statusResult as CoffeeChatPrepStatus);
          setMeetingPrepId((statusResult as any).id || prepId);
        });
        
        // TODO(#13): PostHog was reset and never re-configured. This event fired
        // into a void. Rewire through /api/metrics/events or replacement analytics
        // system per https://github.com/deenabandi004-byte/Final_offerloop/issues/13
        // <ORIGINAL CALL COMMENTED BELOW>
        // trackFeatureActionCompleted('meeting_prep', 'generate', true, {
        //   company: contactData.company || contactData.companyName || '',
        //   role: contactData.jobTitle || contactData.title || undefined,
        // });
        
        toast({
          title: "Meeting Prep Ready!",
          description: "Your one-pager has been generated successfully.",
          duration: 5000,
        });
        
        checkCredits?.();
      };
      
      const pollPromise = new Promise((resolve, reject) => {
        let pollInterval = 3000;
        const maxInterval = 10000;
        let polling = false;
        let stopped = false;

        const doPoll = async () => {
          if (polling || stopped) return;
          polling = true;
          pollCount++;
          try {
            const statusResult = await apiService.getCoffeeChatPrepStatus(prepId);

            if ('error' in statusResult && !('status' in statusResult)) {
              stopped = true;
              reject(new Error(statusResult.error));
              return;
            }

            if ('pdfUrl' in statusResult && statusResult.pdfUrl) {
              stopped = true;
              handleCompletion(statusResult);
              resolve(statusResult);
              return;
            }

            handleStatusUpdate(statusResult);
            // Reset interval on success
            pollInterval = 3000;

            if (pollCount >= maxPolls) {
              stopped = true;
              reject(new Error('Generation timed out'));
              return;
            }
          } catch (error: any) {
            // Exponential backoff on 429
            if (error?.message?.includes('429') || error?.status === 429) {
              pollInterval = Math.min(pollInterval * 2, maxInterval);
              console.warn(`[MeetingPrep] 429 - backing off to ${pollInterval}ms`);
            } else {
              stopped = true;
              reject(error);
              return;
            }
          } finally {
            polling = false;
          }
          if (!stopped) schedulePoll();
        };

        const schedulePoll = () => {
          if (stopped) return;
          setTimeout(doPoll, pollInterval);
        };

        // Initial poll immediately
        doPoll();
      });
      
      await pollPromise;
      
    } catch (error: any) {
      console.error('Meeting prep failed:', error);
      setMeetingStatus('failed');
      setMeetingProgress('Generation failed');
      trackError('meeting_prep', 'generate', 'api_error', error.message);
      toast({
        title: "Generation Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setMeetingLoading(false);
    }
  };

  const downloadMeetingPDF = async (prepId?: string) => {
    const id = prepId || meetingPrepId;
    if (!id || !firebaseUser) return;

    try {
      const MAX_TRIES = 20;
      const DELAY_MS = 1000;
      let pdfUrl: string | undefined;
      let contactName: string | undefined;

      toast({
        title: "Preparing PDF",
        description: "Please wait while we prepare your Meeting PDF...",
        duration: 3000,
      });

      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const res = await apiService.downloadMeetingPDF(id);
          pdfUrl = res?.pdfUrl || undefined;
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

      // Get contact name from result if available, or from meetingResult
      if (meetingResult?.contactData) {
        const firstName = meetingResult.contactData.firstName || '';
        const lastName = meetingResult.contactData.lastName || '';
        contactName = `${firstName} ${lastName}`.trim() || undefined;
      }

      const sanitizeForFilename = (str: string): string => {
        return str
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 50);
      };

      const name = contactName ? sanitizeForFilename(contactName) : 'Contact';
      const filename = `Oloop_meeting_${name}.pdf`;

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
        
        trackContentViewed('meeting_prep', 'pdf', id);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Meeting Prep PDF has been downloaded.",
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
        
        trackContentViewed('meeting_prep', 'pdf', id);
        
        toast({
          title: "PDF Download Started",
          description: "Your Meeting Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (err) {
      trackError('meeting_prep', 'download', 'network_error', err instanceof Error ? err.message : undefined);
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Could not download the PDF.",
        variant: "destructive",
      });
    }
  };

  const handleLibraryDownload = async (prep: MeetingPrep) => {
    try {
      const pdfUrl = prep.pdfUrl || (await apiService.downloadMeetingPDF(prep.id)).pdfUrl;
      
      if (!pdfUrl) {
        throw new Error("PDF URL not available yet");
      }

      const sanitizeForFilename = (str: string): string => {
        return str
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 50);
      };

      const contactName = prep.contactName || 'Contact';
      const name = sanitizeForFilename(contactName);
      const filename = `Oloop_meeting_${name}.pdf`;

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
        
        trackContentViewed('meeting_prep', 'pdf', prep.id);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Meeting Prep PDF has been downloaded.",
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
        
        trackContentViewed('meeting_prep', 'pdf', prep.id);
        
        toast({
          title: "PDF Download Started",
          description: "Your Meeting Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (error) {
      trackError('meeting_prep', 'download', 'network_error', error instanceof Error ? error.message : undefined);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLibraryDelete = async (prepId: string) => {
    setDeletingId(prepId);
    try {
      const result = await apiService.deleteMeetingPrep(prepId);
      if ("error" in result) {
        throw new Error(result.error);
      }
      setPreps((prev) => prev.filter((prep) => prep.id !== prepId));
      toast({
        title: "Prep deleted",
        description: "Removed from your Meeting Library.",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
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
      <div className="flex min-h-screen w-full font-sans" style={{ background: 'var(--warm-bg, #FEFDFB)' }}>
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader title="Meeting Prep" />
          <PDLOutageBanner />

          <ProGate title="Meeting Prep" description="Get AI-generated talking points, background research, and conversation starters for any professional - just paste their LinkedIn." videoId="D1--4aVisho" bypass={IS_DEV_PREVIEW}>
          <main data-tour="tour-meeting-prep" style={{ background: 'var(--warm-bg, #FEFDFB)', flex: 1, overflowY: 'auto' }}>

            <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 40px' }}>

              {/* ── Page header ── */}
              <div style={{ marginBottom: 28, paddingTop: 24 }}>
                <h1 style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: '#1A1714',
                  lineHeight: 1.2,
                  marginBottom: 6,
                  fontFamily: "'Lora', Georgia, serif",
                }}>
                  Meeting Prep
                </h1>
                <p style={{
                  fontSize: 13,
                  color: 'var(--warm-ink-tertiary, #9C9590)',
                  lineHeight: 1.6,
                }}>
                  Walk into every conversation prepared. We'll research them so you don't have to.
                </p>
              </div>

              {/* ── Search area (no card wrapper) ── */}
              <div style={{ marginBottom: 32 }}>
                {!hasAccess && (
                  <div style={{ marginBottom: 16 }}>
                    <UpgradeBanner
                      hasExhaustedLimit={!hasMonthlyAccess}
                      hasEnoughCredits={hasEnoughCredits}
                      currentUsage={currentUsage}
                      limit={limit}
                      tier={tier}
                      requiredCredits={MEETING_CREDITS}
                      currentCredits={effectiveUser.credits ?? 0}
                      featureName="Meeting Preps"
                      nextTier={subscription?.tier === 'free' ? 'Pro' : 'Elite'}
                      showUpgradeButton={!hasMonthlyAccess || !hasEnoughCredits}
                    />
                  </div>
                )}

                {/* Personalized greeting */}
                <p style={{
                  textAlign: 'center',
                  fontSize: 16,
                  color: '#1B2A44',
                  fontFamily: "'Lora', Georgia, serif",
                  fontStyle: 'italic',
                  marginBottom: 20,
                }}>
                  {preps.length > 0
                    ? `${preps.length} conversation${preps.length === 1 ? '' : 's'} prepared, ${(effectiveUser.name || '').split(' ')[0] || 'there'}.`
                    : `Let's get you prepared, ${(effectiveUser.name || '').split(' ')[0] || 'there'}.`}
                </p>

                {/* Input row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '14px 18px',
                  border: '1.5px solid var(--warm-border, #E8E4DE)',
                  borderRadius: 14,
                  background: 'var(--warm-surface, #FAFBFF)',
                  transition: 'all .15s',
                  marginBottom: 12,
                }}
                className="focus-within:border-[#1B2A44] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(27,42,68,0.15)]"
                >
                  <Linkedin style={{ width: 16, height: 16, flexShrink: 0, color: '#1B2A44', strokeWidth: 1.5 }} />
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleMeetingSubmit(); } }}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      placeholder={inputFocused && !linkedinUrl ? PLACEHOLDER_EXAMPLES[placeholderIdx] : undefined}
                      disabled={meetingLoading || !hasAccess}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'none',
                        fontSize: 14,
                        color: '#1A1714',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    {!linkedinUrl && !inputFocused && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          pointerEvents: 'none',
                          fontSize: 14,
                          fontFamily: 'inherit',
                          lineHeight: 1.5,
                          color: 'var(--warm-ink-tertiary, #9C9590)',
                          opacity: placeholderVisible ? 1 : 0,
                          transition: 'opacity 0.3s ease',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {PLACEHOLDER_EXAMPLES[placeholderIdx]}
                      </div>
                    )}
                  </div>
                  {linkedinUrl && isValidLinkedInUrl(linkedinUrl) && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: '#DCFCE7', color: '#15803D',
                      fontSize: 11, fontWeight: 500, padding: '3px 8px',
                      borderRadius: 100, whiteSpace: 'nowrap',
                    }}>
                      <CheckCircle className="h-2.5 w-2.5" />
                      Valid
                    </div>
                  )}
                </div>

                {linkedinUrl && !isValidLinkedInUrl(linkedinUrl) && linkedinUrl.length > 10 && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mb-3">
                    <AlertCircle className="w-3 h-3" /> Please enter a valid LinkedIn profile URL
                  </p>
                )}

                {/* CTA */}
                <button
                  onClick={handleMeetingSubmit}
                  disabled={!linkedinUrl.trim() || meetingLoading || !hasAccess || (effectiveUser.credits ?? 0) < MEETING_CREDITS}
                  style={{
                    width: '100%',
                    height: 52,
                    borderRadius: 12,
                    background: (meetingLoading || !hasAccess) ? 'var(--warm-border, #E8E4DE)' : '#1B2A44',
                    color: (meetingLoading || !hasAccess) ? 'var(--warm-ink-tertiary, #9C9590)' : '#fff',
                    border: 'none',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: (!linkedinUrl.trim() || meetingLoading || !hasAccess) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all .15s',
                    fontFamily: 'inherit',
                  }}
                >
                  {meetingLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating prep sheet...</span>
                    </>
                  ) : (
                    <span>Generate Prep Sheet</span>
                  )}
                </button>

                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)' }}>{MEETING_CREDITS} credits · PDF auto-saved</span>
                  {subscription?.resumeFileName ? (
                    <button
                      onClick={() => navigate('/settings')}
                      style={{
                        fontSize: 11, color: '#16A34A', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 3,
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <CheckCircle className="w-3 h-3" />
                      {subscription.resumeFileName}
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate('/settings')}
                      style={{
                        fontSize: 11, color: '#1B2A44', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 3,
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <Upload className="w-3 h-3" />
                      Add resume for personalized questions
                    </button>
                  )}
                </div>
              </div>

              {/* ── Tabs ── */}
              <div style={{ marginBottom: 28, borderBottom: '1px solid var(--warm-border, #E8E4DE)' }}>
                <div className="relative">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {meetingTabs.map((tab, index) => {
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          ref={(el) => { tabRefs.current[index] = el; }}
                          onClick={() => setActiveTab(tab.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            padding: '14px 28px',
                            fontSize: 14,
                            fontWeight: isActive ? 600 : 400,
                            cursor: 'pointer',
                            border: 'none',
                            borderBottom: isActive ? '2px solid #1B2A44' : '2px solid transparent',
                            background: 'transparent',
                            color: isActive ? '#1A1714' : 'var(--warm-ink-tertiary, #9C9590)',
                            transition: 'all .15s',
                            fontFamily: 'inherit',
                          }}
                        >
                          <tab.icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                {/* MEETING PREP TAB */}
                <TabsContent value="meeting-prep" className="mt-0">
                  <div>

                      {/* Progress/Status Display */}
                      {meetingStatus !== 'idle' && (
                        <div style={{ marginBottom: 24 }}>
                          {meetingStatus === 'completed' ? (
                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '16px 20px',
                              background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12,
                            }}>
                              <div className="flex items-center gap-3">
                                <div style={{
                                  width: 36, height: 36, borderRadius: '50%', background: '#DCFCE7',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                  <CheckCircle className="w-4 h-4" style={{ color: '#15803D' }} />
                                </div>
                                <div>
                                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1A1714' }}>
                                    {meetingResult?.contactData?.firstName} {meetingResult?.contactData?.lastName} - prep sheet ready
                                  </p>
                                  <p style={{ fontSize: 12, color: 'var(--warm-ink-tertiary, #9C9590)' }}>{meetingResult?.contactData?.company}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => downloadMeetingPDF()}
                                style={{
                                  padding: '9px 18px', background: '#1B2A44', color: '#fff',
                                  fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
                                }}
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download PDF
                              </button>
                            </div>
                          ) : meetingStatus === 'failed' ? (
                            <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700" style={{ borderRadius: 12 }}>
                              <XCircle className="h-5 w-5" />
                              <span>{meetingProgress || 'Generation failed'}</span>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              <SteppedLoadingBar steps={meetingSteps} currentStepId={currentPrepStatus} />
                              <p style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)', textAlign: 'center' }}>Usually 20-35 seconds</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* What's included - feature cards */}
                      {meetingStatus !== 'completed' && (
                        <div style={{ marginTop: 28, marginBottom: 28 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="max-sm:!grid-cols-1">
                            {[
                              {
                                icon: Newspaper,
                                title: 'Company Intel',
                                desc: 'Know what they care about right now - news, deals, and shifts in their world',
                              },
                              {
                                icon: MessageSquare,
                                title: 'Talking Points',
                                desc: 'Find the overlap between your story and theirs so the conversation flows naturally',
                              },
                              {
                                icon: FileText,
                                title: 'PDF Prep Sheet',
                                desc: 'A one-pager with smart questions and their career arc - glance at it before you hop on',
                              },
                            ].map((item) => (
                              <div
                                key={item.title}
                                style={{
                                  background: '#FFFFFF',
                                  border: '1px solid var(--warm-border, #E8E4DE)',
                                  borderTop: '3px solid #1B2A44',
                                  borderRadius: 12,
                                  padding: '20px 18px 22px',
                                  transition: 'transform 0.15s, box-shadow 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(27,42,68,0.12)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <div style={{
                                  width: 32, height: 32, borderRadius: 8,
                                  background: 'rgba(27,42,68,0.06)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  marginBottom: 12,
                                }}>
                                  <item.icon style={{ width: 15, height: 15, color: '#1B2A44' }} />
                                </div>
                                <p style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', marginBottom: 6, fontFamily: "'Lora', Georgia, serif" }}>{item.title}</p>
                                <p style={{ fontSize: 12, color: 'var(--warm-ink-tertiary, #9C9590)', lineHeight: 1.55 }}>{item.desc}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent Preps from Library */}
                      {recentPreps.length > 0 && meetingStatus !== 'completed' && (
                        <div style={{ paddingTop: 24, borderTop: '1px solid #E8E4DE' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', fontFamily: "'Lora', Georgia, serif" }}>Recent Prep Sheets</h3>
                            <button
                              onClick={() => setActiveTab('coffee-library')}
                              style={{
                                fontSize: 12, color: '#1B2A44', fontWeight: 500,
                                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                            >
                              View all ({preps.length})
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }} className="max-sm:!grid-cols-1">
                            {recentPreps.map((prep) => (
                              <div
                                key={prep.id}
                                onClick={() => handleLibraryDownload(prep)}
                                style={{
                                  padding: '14px 16px',
                                  border: '1px solid var(--warm-border, #E8E4DE)',
                                  borderRadius: 12,
                                  cursor: 'pointer',
                                  transition: 'all .15s',
                                  background: '#FFFFFF',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.borderColor = '#1B2A44';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--warm-border, #E8E4DE)';
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                  <div style={{
                                    width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #1B2A44, #2C4A6E)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                  }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>
                                      {(prep.contactName || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                                    </span>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 500, color: '#1A1714', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.contactName}</p>
                                    <p style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.company}</p>
                                  </div>
                                </div>
                                <p style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)' }}>
                                  {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </TabsContent>

                {/* COFFEE LIBRARY TAB */}
                <TabsContent value="coffee-library" className="mt-0">
                  <div>
                    <div className="p-0">
                      {libraryLoading ? (
                        <LoadingSkeleton variant="card" count={3} />
                      ) : preps.length === 0 ? (
                        <div className="text-center py-12">
                          <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', background: 'rgba(27,42,68,0.06)', borderRadius: 12 }}>
                            <Coffee className="h-8 w-8" style={{ color: '#1B2A44' }} />
                          </div>
                          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1A1714', marginBottom: 8, fontFamily: "'Lora', Georgia, serif" }}>No preps yet</h3>
                          <p style={{ fontSize: 13, color: 'var(--warm-ink-tertiary, #9C9590)', marginBottom: 24 }}>
                            Generate your first meeting prep to see it appear here.
                          </p>
                          <button
                            onClick={() => setActiveTab('meeting-prep')}
                            style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600, background: '#1B2A44', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Create Your First Prep
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {groupedPreps.inProgress.length > 0 && (
                            <section>
                              <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--warm-ink-tertiary, #9C9590)', marginBottom: 12 }}>
                                In Progress
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.inProgress.map((prep) => (
                                  <div
                                    key={prep.id}
                                    style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--warm-surface, #FAFBFF)', border: '1px solid var(--warm-border, #E8E4DE)', borderRadius: 12 }}
                                  >
                                    <div>
                                      <p style={{ fontWeight: 500, color: '#1A1714' }}>{prep.contactName}</p>
                                      <p style={{ fontSize: 13, color: 'var(--warm-ink-tertiary, #9C9590)' }}>
                                        {prep.jobTitle} @ {prep.company}
                                      </p>
                                      <p style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)', marginTop: 4 }}>
                                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2" style={{ color: 'var(--warm-ink-tertiary, #9C9590)' }}>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase' }}>Processing...</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {groupedPreps.completed.length > 0 && (
                            <section className="space-y-3">
                              <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--warm-ink-tertiary, #9C9590)' }}>
                                Completed ({groupedPreps.completed.length})
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.completed.map((prep) => (
                                  <div
                                    key={prep.id}
                                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                    style={{ padding: 20, background: '#FFFFFF', border: '1px solid var(--warm-border, #E8E4DE)', borderRadius: 12 }}
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <BadgeCheck className="h-5 w-5 text-green-600" />
                                        <span style={{ fontWeight: 600, color: '#1A1714' }}>{prep.contactName}</span>
                                      </div>
                                      <p style={{ fontSize: 13, color: '#3B3530' }}>
                                        {prep.jobTitle} @ {prep.company}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)' }}>
                                        <span className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : " - "}
                                        </span>
                                        {prep.hometown && (
                                          <span className="flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {prep.hometown}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() => handleLibraryDownload(prep)}
                                        style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(27,42,68,0.08)', color: '#1B2A44', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                                      >
                                        <Download className="h-4 w-4" />
                                        PDF
                                      </button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="relative overflow-hidden text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                        disabled={deletingId === prep.id}
                                        onClick={() => handleLibraryDelete(prep.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        <InlineLoadingBar isLoading={deletingId === prep.id} />
                                      </Button>
                                    </div>
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
      </div>
    </SidebarProvider>
  );
};

export default MeetingPrepPage;
