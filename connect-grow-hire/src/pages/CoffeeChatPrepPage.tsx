import React, { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useTour } from "@/contexts/TourContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
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
  List as ListIcon,
  LayoutGrid,
  Info,
} from "lucide-react";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { VideoDemo } from "@/components/VideoDemo";
import { ProGate } from "@/components/ProGate";
import { apiService } from "@/services/api";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import type { CoffeeChatPrep, CoffeeChatPrepStatus } from "@/services/api";
import { InlineLoadingBar, SteppedLoadingBar } from "@/components/ui/LoadingBar";
import { toast } from "@/hooks/use-toast";
import { COFFEE_CHAT_CREDITS } from "@/lib/constants";
import { flushSync } from "react-dom";
import { logActivity, generateCoffeeChatPrepSummary } from "@/utils/activityLogger";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { CompanyLogo } from "@/components/CompanyLogo";
import { IS_DEV_PREVIEW } from "@/lib/devPreview";
import { useSubscription } from "@/hooks/useSubscription";
import { useCreditsView } from "@/hooks/useCreditsView";
import { canUseFeature, getFeatureLimit } from "@/utils/featureAccess";
import { trackFeatureActionCompleted, trackContentViewed, trackError } from "../lib/analytics";
import meetingPrepBg from "@/assets/meeting-prep-watercolor.png";

const CoffeeChatPrepPage: React.FC = () => {
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
  // Trial-aware credit balance (daily pool during a trial).
  const creditsView = useCreditsView();
  
  // Check if user has access to coffee chat prep based on remaining uses
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
  
  const hasEnoughCredits = creditsView.balance >= COFFEE_CHAT_CREDITS;
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

  // Coffee Chat Generation State
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [coffeeChatLoading, setCoffeeChatLoading] = useState(false);
  const [coffeeChatProgress, setCoffeeChatProgress] = useState<string>("");
  const [coffeeChatPrepId, setCoffeeChatPrepId] = useState<string | null>(null);
  const [coffeeChatResult, setCoffeeChatResult] = useState<CoffeeChatPrepStatus | null>(null);
  const [coffeeChatStatus, setCoffeeChatStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [currentPrepStatus, setCurrentPrepStatus] = useState<string>('pending');
  
  const coffeeChatSteps = [
    { id: 'processing', label: 'Initializing...' },
    { id: 'enriching', label: 'Looking up LinkedIn profile...' },
    { id: 'researching', label: 'Researching company & industry...' },
    { id: 'analyzing', label: 'Analyzing career history...' },
    { id: 'generating', label: 'Writing tailored questions...' },
    { id: 'building', label: 'Building your prep sheet...' },
    { id: 'completed', label: 'Complete!' },
  ];
  const coffeeChatPollTimeoutRef = useRef<number | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Library State
  const [preps, setPreps] = useState<CoffeeChatPrep[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("coffee-chat-prep");

  // Library view mode (list | grid), persisted in localStorage
  const [libraryView, setLibraryView] = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list';
    return (window.localStorage.getItem('meetingPrep.libraryView.v2') as 'list' | 'grid') || 'list';
  });

  useEffect(() => {
    try { window.localStorage.setItem('meetingPrep.libraryView.v2', libraryView); } catch {}
  }, [libraryView]);

  // Smart default: if preps load and user has any, jump to Library on initial mount.
  // Ref guard ensures we only auto-switch once, so manual navigation sticks.
  const hasDefaultedTabRef = useRef(false);
  useEffect(() => {
    if (!libraryLoading && !hasDefaultedTabRef.current) {
      hasDefaultedTabRef.current = true;
      if (preps.length > 0) {
        setActiveTab('coffee-library');
      }
    }
  }, [libraryLoading, preps.length]);

  // ── Tour Meeting Prep demo orchestration ───────────────────────────────
  // When the tour reaches step 9, seed a completed prep for Nick Wittig
  // into the local `preps` state, switch to the Library tab, and scroll the
  // user down so they see the seeded card rather than the top of the form.
  // The cancellable-effect wrapper on loadPreps below makes sure an
  // in-flight real fetch can't clobber the seed.
  const { demoSurface } = useTour();
  const meetingPrepDemoActive = demoSurface === 'meeting-prep';
  const libraryAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!meetingPrepDemoActive) return;
    const now = new Date();
    const recentIso = new Date(now.getTime() - 1000 * 60 * 60 * 4).toISOString();
    const demoPrep: CoffeeChatPrep = {
      id: 'demo-nick-prep',
      contactName: 'Nick Wittig',
      company: 'Offerloop',
      jobTitle: 'Cofounder',
      linkedinUrl: undefined,
      status: 'completed',
      createdAt: recentIso,
      pdfUrl: undefined,
    };
    setPreps([demoPrep]);
    setLibraryLoading(false);
    // Reset the smart-default guard so the auto-switch fires for the seed.
    hasDefaultedTabRef.current = false;
    setActiveTab('coffee-library');

    // Scroll the seeded card into view shortly after the tab content paints.
    const scrollTimer = setTimeout(() => {
      libraryAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);

    return () => {
      clearTimeout(scrollTimer);
      // Drop the seeded prep so the next real session starts clean. The
      // mount-time real-load effect below will re-fire (its cancellable
      // wrapper checks meetingPrepDemoActive at entry), repopulating with
      // the user's actual library.
      setPreps([]);
      setActiveTab('coffee-chat-prep');
      hasDefaultedTabRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingPrepDemoActive]);

  // Safety: if the Prepare tab gets removed (e.g. a new returning user just
  // generated their first prep), don't leave activeTab pointing at a tab that
  // no longer exists.
  useEffect(() => {
    if (preps.length > 0 && activeTab === 'coffee-chat-prep') {
      setActiveTab('coffee-library');
    }
  }, [preps.length, activeTab]);

  // LinkedIn URL validation
  const isValidLinkedInUrl = (url: string) => {
    return url.match(/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/);
  };

  // Hide the Prepare tab once the user has used the function at least once.
  // Returning users only see Library; they make new preps via the always-visible
  // LinkedIn input above, and access the explainer cards via the (i) popover.
  const coffeeChatTabs = preps.length === 0
    ? [
        { id: 'coffee-chat-prep', label: 'Prepare', icon: MessageSquare },
        { id: 'coffee-library', label: 'Library', icon: FolderOpen },
      ]
    : [
        { id: 'coffee-library', label: 'Library', icon: FolderOpen },
      ];

  // (i) info popover next to the LinkedIn input — only useful for returning
  // users since new users already see the cards inline in the Prepare tab.
  const [showInfoCards, setShowInfoCards] = useState(false);

  useLayoutEffect(() => {
    const activeIndex = coffeeChatTabs.findIndex(t => t.id === activeTab);
    const el = tabRefs.current[activeIndex];
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (coffeeChatPollTimeoutRef.current) {
        clearTimeout(coffeeChatPollTimeoutRef.current);
        coffeeChatPollTimeoutRef.current = null;
      }
    };
  }, []);

  // The 3 explainer cards — rendered inline for new users (no preps yet) and
  // inside the (i) popover for returning users. Same content, two surfaces.
  const prepExplainerCards = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="max-sm:!grid-cols-1">
      {[
        { icon: Newspaper, title: 'Company Intel', desc: 'Know what they care about right now: news, deals, and shifts in their world' },
        { icon: MessageSquare, title: 'Talking Points', desc: 'Find the overlap between your story and theirs so the conversation flows naturally' },
        { icon: FileText, title: 'PDF Prep Sheet', desc: 'A one-pager with smart questions and their career arc. Glance at it before you hop on.' },
      ].map((item) => (
        <div
          key={item.title}
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--line)',
            borderTop: '3px solid var(--brand-blue, #3B82F6)',
            borderRadius: 3,
            padding: '18px 18px 20px',
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 3,
            background: 'rgba(59,130,246,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <item.icon style={{ width: 15, height: 15, color: 'var(--brand-blue, #3B82F6)' }} />
          </div>
          <p style={{ fontSize: 18, fontWeight: 400, color: 'var(--ink)', marginBottom: 6, lineHeight: '20px' }}>{item.title}</p>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55 }}>{item.desc}</p>
        </div>
      ))}
    </div>
  );

  // Load library preps. Gated and cancellable so the tour's Meeting Prep
  // demo seed (set above) isn't clobbered by an in-flight real fetch.
  useEffect(() => {
    if (meetingPrepDemoActive) return;
    let cancelled = false;
    const loadPreps = async () => {
      try {
        const result = await apiService.getAllCoffeeChatPreps();
        if (cancelled) return;
        if ("error" in result) {
          throw new Error(result.error);
        }
        setPreps(result.preps || []);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load coffee chat preps:", error);
        toast({
          title: "Unable to load library",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    };
    loadPreps();
    return () => { cancelled = true; };
  }, [meetingPrepDemoActive]);

  // Refresh library after successful generation. Same cancellable shape;
  // also gated so a demo-active state can't accidentally trigger a fetch.
  useEffect(() => {
    if (meetingPrepDemoActive) return;
    if (coffeeChatStatus === 'completed' && coffeeChatPrepId) {
      let cancelled = false;
      const loadPreps = async () => {
        try {
          const result = await apiService.getAllCoffeeChatPreps();
          if (cancelled) return;
          if ("error" in result) {
            return;
          }
          setPreps(result.preps || []);
        } catch (error) {
          // Silent fail on refresh
        }
      };
      loadPreps();
      return () => { cancelled = true; };
    }
  }, [coffeeChatStatus, coffeeChatPrepId, meetingPrepDemoActive]);

  const handleCoffeeChatSubmit = async () => {
    if (meetingPrepDemoActive) return;
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

    if (creditsView.balance < COFFEE_CHAT_CREDITS) {
      toast({
        title: "Insufficient Credits",
        description: `You need ${COFFEE_CHAT_CREDITS} credits to generate a coffee chat prep.`,
        variant: "destructive",
      });
      return;
    }

    setCoffeeChatLoading(true);
    setCoffeeChatStatus('processing');
    setCurrentPrepStatus('processing');
    setCoffeeChatProgress('Starting Coffee Chat Prep...');
    setCoffeeChatResult(null);

    try {
      const result = await apiService.createCoffeeChatPrep({ linkedinUrl });
      
      if ('error' in result) {
        throw new Error(result.error);
      }

      const prepId = result.prepId;
      setCoffeeChatPrepId(prepId);
      
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
              'completed': 'Coffee Chat Prep ready!',
              'failed': 'Generation failed',
            };
            return statusMessages[stage] || 'Processing...';
          })();
          setCoffeeChatProgress(progressMessage);
        }
      };
      
      const handleCompletion = (statusResult: any) => {
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
            console.error('Failed to log coffee chat prep activity:', error);
          }
        }
        
        flushSync(() => {
          setCoffeeChatLoading(false);
          setCoffeeChatStatus('completed');
          setCoffeeChatProgress('Coffee Chat Prep ready!');
          setCoffeeChatResult(statusResult as CoffeeChatPrepStatus);
          setCoffeeChatPrepId((statusResult as any).id || prepId);
        });
        
        trackFeatureActionCompleted('coffee_chat_prep', 'generate', true);
        
        toast({
          title: "Coffee Chat Prep Ready!",
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

            // Backend marks doc status=failed (e.g. PDL enrichment whiffed,
            // Perplexity timed out). Without this check the poll would keep
            // running for the full maxPolls window (~10 min) before giving up.
            if ('status' in statusResult && (statusResult as any).status === 'failed') {
              stopped = true;
              reject(new Error((statusResult as any).error || 'Generation failed'));
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
              console.warn(`[CoffeeChatPrep] 429 — backing off to ${pollInterval}ms`);
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
      console.error('Coffee chat prep failed:', error);
      setCoffeeChatStatus('failed');
      setCoffeeChatProgress('Generation failed');
      trackError('coffee_chat_prep', 'generate', 'api_error', error.message);
      toast({
        title: "Generation Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCoffeeChatLoading(false);
    }
  };

  const downloadCoffeeChatPDF = async (prepId?: string) => {
    if (meetingPrepDemoActive) return;
    const id = prepId || coffeeChatPrepId;
    if (!id || !firebaseUser) return;

    try {
      const MAX_TRIES = 20;
      const DELAY_MS = 1000;
      let pdfUrl: string | undefined;
      let contactName: string | undefined;

      toast({
        title: "Preparing PDF",
        description: "Please wait while we prepare your Coffee Chat PDF...",
        duration: 3000,
      });

      for (let i = 0; i < MAX_TRIES; i++) {
        try {
          const res = await apiService.downloadCoffeeChatPDF(id);
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

      // Get contact name from result if available, or from coffeeChatResult
      if (coffeeChatResult?.contactData) {
        const firstName = coffeeChatResult.contactData.firstName || '';
        const lastName = coffeeChatResult.contactData.lastName || '';
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
      const filename = `Oloop_coffeechat_${name}.pdf`;

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
        
        trackContentViewed('coffee_chat_prep', 'pdf', id);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Coffee Chat Prep PDF has been downloaded.",
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
        
        trackContentViewed('coffee_chat_prep', 'pdf', id);
        
        toast({
          title: "PDF Download Started",
          description: "Your Coffee Chat Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (err) {
      trackError('coffee_chat_prep', 'download', 'network_error', err instanceof Error ? err.message : undefined);
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Could not download the PDF.",
        variant: "destructive",
      });
    }
  };

  const handleLibraryDownload = async (prep: CoffeeChatPrep) => {
    if (meetingPrepDemoActive) return;
    try {
      const pdfUrl = prep.pdfUrl || (await apiService.downloadCoffeeChatPDF(prep.id)).pdfUrl;
      
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
      const filename = `Oloop_coffeechat_${name}.pdf`;

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
        
        trackContentViewed('coffee_chat_prep', 'pdf', prep.id);
        
        toast({
          title: "PDF Downloaded",
          description: "Your Coffee Chat Prep PDF has been downloaded.",
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
        
        trackContentViewed('coffee_chat_prep', 'pdf', prep.id);
        
        toast({
          title: "PDF Download Started",
          description: "Your Coffee Chat Prep PDF download has started.",
          duration: 3000,
        });
      }
    } catch (error) {
      trackError('coffee_chat_prep', 'download', 'network_error', error instanceof Error ? error.message : undefined);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLibraryDelete = async (prepId: string) => {
    if (meetingPrepDemoActive) return;
    setDeletingId(prepId);
    try {
      const result = await apiService.deleteCoffeeChatPrep(prepId);
      if ("error" in result) {
        throw new Error(result.error);
      }
      setPreps((prev) => prev.filter((prep) => prep.id !== prepId));
      toast({
        title: "Prep deleted",
        description: "Removed from your Coffee Chat Library.",
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
    const STUCK_THRESHOLD_MS = 30 * 60 * 1000;
    const completed = preps
      .filter((p) => p.status === "completed")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const inProgress = preps
      .filter((p) => p.status !== "completed")
      .filter((p) => {
        if (!p.createdAt) return true;
        const age = Date.now() - new Date(p.createdAt).getTime();
        return age < STUCK_THRESHOLD_MS;
      });
    return { completed, inProgress };
  }, [preps]);

  const recentPreps = useMemo(() => {
    return groupedPreps.completed.slice(0, 3);
  }, [groupedPreps.completed]);

  // Group completed preps by company. Multi-prep companies cluster with a
  // quiet header; single-prep companies fall into an unlabeled tail block.
  const groupedByCompany = useMemo(() => {
    const groups = new Map<string, CoffeeChatPrep[]>();
    for (const prep of groupedPreps.completed) {
      const key = (prep.company || '').trim() || '(unknown)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(prep);
    }
    const multi: Array<{ company: string; preps: CoffeeChatPrep[] }> = [];
    const singles: CoffeeChatPrep[] = [];
    for (const [company, list] of groups.entries()) {
      if (list.length >= 2) {
        multi.push({ company, preps: list });
      } else {
        singles.push(list[0]);
      }
    }
    multi.sort((a, b) => new Date(b.preps[0].createdAt).getTime() - new Date(a.preps[0].createdAt).getTime());
    return { multi, singles };
  }, [groupedPreps.completed]);

  const renderGridTile = (prep: CoffeeChatPrep) => (
    <div
      key={prep.id}
      onClick={() => handleLibraryDownload(prep)}
      style={{
        position: 'relative',
        padding: '14px 16px',
        borderRadius: 3,
        border: '1px solid var(--line)',
        background: '#FFFFFF',
        cursor: 'pointer',
        transition: 'border-color .15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--brand-blue, #3B82F6)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--line)';
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); handleLibraryDelete(prep.id); }}
        disabled={deletingId === prep.id}
        aria-label="Delete prep"
        className="hover:bg-red-50"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          padding: 4,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--signal-neg, #dc2626)',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 3,
        }}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, paddingRight: 20 }}>
        <CompanyLogo company={prep.company} size={32} rounded={6} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {prep.contactName}
          </p>
          <p style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {prep.company}
          </p>
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : ''}
      </p>
    </div>
  );

  return (
    <SidebarProvider>
      <div
        className="flex min-h-screen w-full font-sans"
        style={{
          background: `linear-gradient(rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0.65)), url(${meetingPrepBg}) center bottom / cover no-repeat fixed`,
          color: 'var(--ink)',
        }}
      >
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader />

          <ProGate title="Coffee Chat Prep" description="Get AI-generated talking points, background research, and conversation starters for any professional — just paste their LinkedIn." videoId="D1--4aVisho" bypass={IS_DEV_PREVIEW}>
          <main
            data-tour="tour-coffee-chat-prep"
            style={{
              background: `linear-gradient(rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0.65)), url(${meetingPrepBg}) center bottom / cover no-repeat fixed`,
              flex: 1,
              overflowY: 'auto',
            }}
          >

            <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 40px' }}>

              {/* ── Page header ── always visible. Sized to match
                  ProtoHeader's "Your Inbox" treatment (28px serif 700,
                  16px subtitle) for visual consistency across pages. Pushed
                  down ~140px so the prepare flow sits centered. */}
              <div style={{ marginBottom: 36, paddingTop: 140 }}>
                <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
                  <h1 style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: 'var(--heading, var(--ink))',
                    lineHeight: 1.1,
                    marginBottom: 12,
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    letterSpacing: '-0.025em',
                  }}>
                    Meeting Prep
                  </h1>
                  <p style={{
                    fontSize: 16,
                    color: 'var(--ink-2)',
                    lineHeight: '24px',
                  }}>
                    We research your contacts so you walk into every meeting prepared.
                  </p>
                </div>
              </div>

              {/* ── Search area (LinkedIn input + Generate button + meta) ── */}
              <div style={{ marginBottom: 44 }}>
                {!hasAccess && (
                  <div style={{ marginBottom: 16 }}>
                    <UpgradeBanner
                      hasExhaustedLimit={!hasMonthlyAccess}
                      hasEnoughCredits={hasEnoughCredits}
                      currentUsage={currentUsage}
                      limit={limit}
                      tier={tier}
                      requiredCredits={COFFEE_CHAT_CREDITS}
                      currentCredits={creditsView.balance}
                      featureName="Coffee Chat Preps"
                      nextTier={subscription?.tier === 'free' ? 'Pro' : 'Elite'}
                      showUpgradeButton={!hasMonthlyAccess || !hasEnoughCredits}
                    />
                  </div>
                )}

                {/* Input row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '20px 20px',
                  border: '1px solid var(--line)',
                  borderRadius: 3,
                  background: 'var(--paper-2)',
                  transition: 'all .15s',
                  marginBottom: 18,
                }}
                className="focus-within:border-[#3B82F6] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                >
                  <Linkedin style={{ width: 16, height: 16, flexShrink: 0, color: 'var(--brand-blue, #3B82F6)', strokeWidth: 1.5 }} />
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCoffeeChatSubmit(); } }}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      placeholder={inputFocused && !linkedinUrl ? PLACEHOLDER_EXAMPLES[placeholderIdx] : undefined}
                      disabled={coffeeChatLoading || !hasAccess}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'none',
                        fontSize: 14,
                        color: 'var(--ink)',
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
                          color: 'var(--ink-3)',
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
                  {preps.length > 0 && (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setShowInfoCards((o) => !o)}
                        aria-label="What's in each prep?"
                        style={{
                          width: 24, height: 24,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: 'none', background: 'transparent',
                          color: showInfoCards ? 'var(--brand-blue, #3B82F6)' : 'var(--ink-3)',
                          borderRadius: 999, cursor: 'pointer',
                          transition: 'color .15s, background .15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(59,130,246,0.08)';
                          e.currentTarget.style.color = 'var(--brand-blue, #3B82F6)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = showInfoCards ? 'var(--brand-blue, #3B82F6)' : 'var(--ink-3)';
                        }}
                      >
                        <Info style={{ width: 16, height: 16 }} />
                      </button>
                      {showInfoCards && (
                        <>
                          {/* Click-outside catcher */}
                          <div
                            onClick={() => setShowInfoCards(false)}
                            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: 'calc(100% + 10px)',
                              right: -4,
                              width: 520,
                              maxWidth: 'calc(100vw - 80px)',
                              background: '#FFFFFF',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              boxShadow: '0 12px 32px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.08)',
                              padding: 16,
                              zIndex: 50,
                            }}
                          >
                            <p style={{
                              fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                              textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12,
                            }}>
                              What's in each prep
                            </p>
                            {prepExplainerCards}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {linkedinUrl && !isValidLinkedInUrl(linkedinUrl) && linkedinUrl.length > 10 && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mb-3">
                    <AlertCircle className="w-3 h-3" /> Please enter a valid LinkedIn profile URL
                  </p>
                )}

                {/* CTA — slate-blue (matches the navy/--accent scheme used by
                    the other tabs) until the user types a valid LinkedIn URL,
                    at which point it flips to the vibrant --brand-blue to
                    signal "ready to go". */}
                <button
                  onClick={handleCoffeeChatSubmit}
                  disabled={!linkedinUrl.trim() || coffeeChatLoading || !hasAccess || creditsView.balance < COFFEE_CHAT_CREDITS}
                  style={{
                    width: '100%',
                    height: 52,
                    borderRadius: 3,
                    background: (coffeeChatLoading || !hasAccess)
                      ? 'var(--line)'
                      : isValidLinkedInUrl(linkedinUrl)
                        ? 'var(--brand-blue, #3B82F6)'
                        : 'var(--accent, #4A60A8)',
                    color: (coffeeChatLoading || !hasAccess) ? 'var(--ink-3)' : '#fff',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: (!linkedinUrl.trim() || coffeeChatLoading || !hasAccess) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'background .2s ease, color .2s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  {coffeeChatLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating prep sheet...</span>
                    </>
                  ) : (
                    <span>Generate Prep Sheet</span>
                  )}
                </button>

                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-3)', textShadow: '0 1px 2px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.5)' }}>{COFFEE_CHAT_CREDITS} credits · PDF auto-saved</span>
                  {subscription?.resumeFileName ? (
                    <button
                      onClick={() => navigate('/settings')}
                      style={{
                        fontSize: 13, color: 'var(--signal-pos, #16a34a)', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        textShadow: '0 1px 2px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.5)',
                      }}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {subscription.resumeFileName}
                    </button>
                  ) : (
                    <button
                      onClick={() => navigate('/settings')}
                      style={{
                        fontSize: 13, color: 'var(--brand-blue, #3B82F6)', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        textShadow: '0 1px 2px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.5)',
                      }}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Add resume for personalized questions
                    </button>
                  )}
                </div>

                <p style={{
                  textAlign: 'center',
                  fontSize: 14,
                  color: 'var(--ink-3)',
                  marginTop: 16,
                  lineHeight: 1.5,
                  textShadow: '0 1px 2px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.5)',
                }}>
                  Each prep: company news, talking points, and a printable one-pager PDF.
                </p>
              </div>

              {/* ── Tabs ── */}
              <div style={{ marginBottom: 20, borderBottom: '1px solid var(--line)' }}>
                <div className="relative">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {coffeeChatTabs.map((tab, index) => {
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
                            padding: '14px 22px 12px',
                            fontSize: 13,
                            fontWeight: isActive ? 500 : 400,
                            cursor: 'pointer',
                            border: 'none',
                            borderBottom: isActive ? '2px solid var(--brand-blue, #3B82F6)' : '2px solid transparent',
                            background: 'transparent',
                            color: isActive ? 'var(--brand-blue, #3B82F6)' : 'var(--ink-3)',
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

                {/* COFFEE CHAT PREP TAB */}
                <TabsContent value="coffee-chat-prep" className="mt-0">
                  <div>

                      {/* Progress/Status Display */}
                      {coffeeChatStatus !== 'idle' && (
                        <div style={{ marginBottom: 24 }}>
                          {coffeeChatStatus === 'completed' ? (
                            <div style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '12px 16px',
                              background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 3,
                            }}>
                              <div className="flex items-center gap-3">
                                <div style={{
                                  width: 32, height: 32, borderRadius: '50%', background: '#DCFCE7',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                  <CheckCircle className="w-4 h-4" style={{ color: '#15803D' }} />
                                </div>
                                <div>
                                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                                    {coffeeChatResult?.contactData?.firstName} {coffeeChatResult?.contactData?.lastName}, prep sheet ready
                                  </p>
                                  <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>{coffeeChatResult?.contactData?.company}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => downloadCoffeeChatPDF()}
                                style={{
                                  padding: '8px 14px', background: 'var(--brand-blue, #3B82F6)', color: '#fff',
                                  fontSize: 13, fontWeight: 600, borderRadius: 3, border: 'none',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
                                }}
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download PDF
                              </button>
                            </div>
                          ) : coffeeChatStatus === 'failed' ? (
                            <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700" style={{ borderRadius: 3 }}>
                              <XCircle className="h-5 w-5" />
                              <span>{coffeeChatProgress || 'Generation failed'}</span>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              <SteppedLoadingBar steps={coffeeChatSteps} currentStepId={currentPrepStatus} />
                              <p style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center' }}>Usually 20-35 seconds</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* First-time-user explainer: what each prep contains */}
                      {coffeeChatStatus !== 'completed' && preps.length === 0 && (
                        <div style={{ marginTop: 20, marginBottom: 24 }}>
                          {prepExplainerCards}
                        </div>
                      )}

                      {/* Recent Preps from Library */}
                      {recentPreps.length > 0 && coffeeChatStatus !== 'completed' && (
                        <div style={{ paddingTop: 20, borderTop: '1px solid var(--line)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 400, color: 'var(--ink)', fontFamily: "'Instrument Serif', Georgia, serif" }}>Recent Prep Sheets</h3>
                            <button
                              onClick={() => setActiveTab('coffee-library')}
                              style={{
                                fontSize: 12, color: 'var(--brand-blue, #3B82F6)', fontWeight: 500,
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
                                  border: '1px solid var(--line)',
                                  borderRadius: 3,
                                  cursor: 'pointer',
                                  transition: 'all .15s',
                                  background: '#FFFFFF',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--brand-blue, #3B82F6)';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--line)';
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                  <CompanyLogo company={prep.company} size={32} rounded={6} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.contactName}</p>
                                    <p style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prep.company}</p>
                                  </div>
                                </div>
                                <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>
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
                  <div ref={libraryAnchorRef}>
                    <div className="p-0">
                      {libraryLoading ? (
                        <LoadingSkeleton variant="card" count={3} />
                      ) : preps.length === 0 ? (
                        <div className="text-center py-10">
                          <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', background: 'rgba(59,130,246,0.08)', borderRadius: 3 }}>
                            <Coffee className="h-7 w-7" style={{ color: 'var(--brand-blue, #3B82F6)' }} />
                          </div>
                          <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 6, fontFamily: "'Instrument Serif', Georgia, serif" }}>No preps yet</h3>
                          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
                            Generate your first coffee chat prep to see it appear here.
                          </p>
                          <button
                            onClick={() => setActiveTab('coffee-chat-prep')}
                            style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: 'var(--brand-blue, #3B82F6)', color: '#fff', borderRadius: 3, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Create Your First Prep
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {groupedPreps.inProgress.length > 0 && (
                            <section>
                              <h3 style={{ fontSize: 16, fontWeight: 400, color: 'var(--ink)', fontFamily: "'Instrument Serif', Georgia, serif", marginBottom: 12 }}>
                                In Progress
                              </h3>
                              <div className="space-y-3">
                                {groupedPreps.inProgress.map((prep) => (
                                  <div
                                    key={prep.id}
                                    style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 3 }}
                                  >
                                    <div>
                                      <p style={{ fontWeight: 500, color: 'var(--ink)' }}>{prep.contactName}</p>
                                      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                                        {prep.jobTitle} @ {prep.company}
                                      </p>
                                      <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2" style={{ color: 'var(--ink-3)' }}>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase' }}>Processing...</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {groupedPreps.completed.length > 0 && (
                            <section>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <h3 style={{ fontSize: 16, fontWeight: 400, color: 'var(--ink)', fontFamily: "'Instrument Serif', Georgia, serif" }}>
                                  Completed ({groupedPreps.completed.length})
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <button
                                    onClick={() => setLibraryView('list')}
                                    aria-label="List view"
                                    style={{
                                      padding: 4, background: 'transparent', border: 'none', cursor: 'pointer',
                                      color: libraryView === 'list' ? 'var(--brand-blue, #3B82F6)' : 'var(--ink-3)',
                                      display: 'flex', alignItems: 'center',
                                    }}
                                  >
                                    <ListIcon className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setLibraryView('grid')}
                                    aria-label="Grid view"
                                    style={{
                                      padding: 4, background: 'transparent', border: 'none', cursor: 'pointer',
                                      color: libraryView === 'grid' ? 'var(--brand-blue, #3B82F6)' : 'var(--ink-3)',
                                      display: 'flex', alignItems: 'center',
                                    }}
                                  >
                                    <LayoutGrid className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {libraryView === 'grid' ? (
                                <div className="space-y-4">
                                  {groupedByCompany.multi.map(({ company, preps: companyPreps }) => (
                                    <div key={company}>
                                      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                        {company}
                                      </p>
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }} className="max-md:!grid-cols-2 max-sm:!grid-cols-1">
                                        {companyPreps.map(renderGridTile)}
                                      </div>
                                    </div>
                                  ))}
                                  {groupedByCompany.singles.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }} className="max-md:!grid-cols-2 max-sm:!grid-cols-1">
                                      {groupedByCompany.singles.map(renderGridTile)}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {groupedPreps.completed.map((prep) => (
                                    <div
                                      key={prep.id}
                                      className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                                      style={{ padding: '16px 18px', background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: 3 }}
                                    >
                                      <div className="flex items-start gap-3">
                                        <CompanyLogo company={prep.company} size={36} rounded={9} />
                                        <div className="space-y-2 flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <BadgeCheck className="h-5 w-5" style={{ color: 'var(--signal-pos, #16a34a)' }} />
                                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{prep.contactName}</span>
                                          </div>
                                          <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                                            {prep.jobTitle} @ {prep.company}
                                          </p>
                                          <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                                            <span className="flex items-center gap-1">
                                              <Calendar className="h-3 w-3" />
                                              {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : "-"}
                                            </span>
                                            {prep.hometown && (
                                              <span className="flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {prep.hometown}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={() => handleLibraryDownload(prep)}
                                          style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(59,130,246,0.08)', color: 'var(--brand-blue, #3B82F6)', borderRadius: 3, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
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
                              )}
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

export default CoffeeChatPrepPage;
