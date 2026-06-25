import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useCreditsView } from "@/hooks/useCreditsView";
import { useScout } from "@/contexts/ScoutContext";
import { useTour } from "@/contexts/TourContext";
import {
  History, Loader2, AlertCircle, Download, Trash2, Building2, Search,
  CheckCircle, X, ChevronRight, ArrowRight, ArrowUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoDemo } from "@/components/VideoDemo";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiService } from "@/services/api";
import type { Firm, SearchHistoryItem } from "@/services/api";
import FirmSearchResults from "@/components/FirmSearchResults";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { StickyCTA } from "@/components/StickyCTA";

import { DEV_MOCK_USER } from "@/lib/devPreview";
import { getUniversityShortName } from "@/lib/universityUtils";
import { generateFirmDiscoveryPrompts, getGenericFirmPrompts, isContextEmpty, type UserContext, type PromptChip } from "@/utils/suggestionChips";
import { SearchPromptBox } from "@/components/find/SearchPromptBox";
import { firebaseApi } from "@/services/firebaseApi";

// Session storage key for Scout auto-populate
const SCOUT_AUTO_POPULATE_KEY = 'scout_auto_populate';

function getFirmPlaceholders(schoolShort: string | null): string[] {
  return [
    'Netflix hiring managers in LA',
    schoolShort ? `${schoolShort} grads at McKinsey` : 'Top grads at McKinsey',
    'AI startups hiring data scientists',
    'Boutique banks in New York',
    'Gaming studios in Los Angeles',
  ];
}

// Find Companies batch-size caps per tier (slider max) and defaults (where the
// slider initially sits). Free's default (5) sits below its max (10).
type CompanyTier = "free" | "pro" | "elite";
const COMPANY_BATCH_CAPS: Record<CompanyTier, number> = { free: 10, pro: 25, elite: 50 };
const COMPANY_BATCH_DEFAULTS: Record<CompanyTier, number> = { free: 5, pro: 10, elite: 20 };
const normalizeCompanyTier = (tier: unknown): CompanyTier =>
  tier === "pro" || tier === "elite" ? tier : "free";

const FirmSearchPage: React.FC<{ embedded?: boolean; initialTab?: string; isDevPreview?: boolean }> = ({ embedded = false, initialTab, isDevPreview = false }) => {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { user: authUser, checkCredits } = useFirebaseAuth();
  const user = isDevPreview ? DEV_MOCK_USER as any : authUser;
  const { openPanelWithSearchHelp } = useScout();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free",
  } as const;
  // Trial-aware credit balance for display (daily pool during a trial).
  const creditsView = useCreditsView();

  const userSchoolShort = useMemo(() => getUniversityShortName((user as any)?.university), [user]);
  const FIRM_PLACEHOLDERS = useMemo(() => getFirmPlaceholders(userSchoolShort), [userSchoolShort]);

  // Search state
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Firm[]>([]);
  const [parsedFilters, setParsedFilters] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [firmSuggestions, setFirmSuggestions] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{ current: number, total: number, step: string } | null>(null);
  const [searchComplete, setSearchComplete] = useState(false);

  // ── Tour demo state ──────────────────────────────────────────────────────
  // Mirrors the People / Hiring Manager pattern: the tour step declares
  // `demoSurface: 'companies'`, which flips `companiesDemoActive` here. The
  // effect types the example query into the real input, briefly flashes the
  // page's native "Searching for companies" modal, then seeds a single inert
  // firm card. The seam at the top of `handleSearch` short-circuits every
  // real-search trigger (button, Enter, suggestion chip) while the demo is
  // live; `handleViewContacts` and `handleDeleteFirm` guard the per-card
  // actions. Cleanup wipes every demo state write on tour-end or unmount.
  const { demoSurface } = useTour();
  const companiesDemoActive = demoSurface === 'companies';
  const COMPANIES_DEMO_QUERY = 'AI startups, 20-50 employees, Los Angeles, California';
  const COMPANIES_DEMO_FIRM = {
    id: 'demo-offerloop',
    name: 'Offerloop',
    location: { display: 'Los Angeles, CA' },
    industry: 'AI / Career Tech',
    sizeBucket: 'small',
    sizeRange: '5-10',
    // `demo` isn't on the Firm interface (Firm is the API contract); the
    // handler guards downcast to read it so the seed stays type-safe at
    // its source but the runtime flag still flows through.
    demo: true as const,
  } as Firm & { demo: true };

  useEffect(() => {
    if (!companiesDemoActive) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const TYPE_DELAY_MS = 32;
    const SEARCHING_HOLD_MS = 1500;
    const POST_TYPE_PAUSE_MS = 250;

    setQuery('');
    setResults([]);
    setSearchComplete(false);
    setIsSearching(false);
    setHasSearched(false);
    setSearchProgress(null);
    setError(null);

    for (let i = 1; i <= COMPANIES_DEMO_QUERY.length; i++) {
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setQuery(COMPANIES_DEMO_QUERY.slice(0, i));
        }, i * TYPE_DELAY_MS),
      );
    }

    const typingDoneAt = COMPANIES_DEMO_QUERY.length * TYPE_DELAY_MS + POST_TYPE_PAUSE_MS;
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setIsSearching(true);
        setSearchProgress({ current: 1, total: 1, step: 'Surfacing companies that match your criteria' });
      }, typingDoneAt),
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setIsSearching(false);
        setSearchProgress(null);
        setResults([COMPANIES_DEMO_FIRM]);
        setHasSearched(true);
        setSearchComplete(true);
      }, typingDoneAt + SEARCHING_HOLD_MS),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setQuery('');
      setResults([]);
      setIsSearching(false);
      setSearchComplete(false);
      setHasSearched(false);
      setSearchProgress(null);
      setError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiesDemoActive]);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Ref for original button to track visibility
  const originalButtonRef = useRef<HTMLButtonElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState(initialTab || 'firm-search');

  // Respond to external tab changes
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Loading state for saved firms
  const [loadingSavedFirms, setLoadingSavedFirms] = useState(false);
  const [deletingFirmId, setDeletingFirmId] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Use a ref to track current results to avoid stale closures
  const resultsRef = useRef<Firm[]>([]);

  // Track deleted firm IDs to prevent them from reappearing
  const deletedFirmIds = useRef<Set<string>>(new Set());

  // Credit system state. Batch default sits at a tier-specific value
  // (free 5, pro 10, elite 20). The clamp effect below keeps it within
  // maxBatchSize, and the tier-snap effect updates it once the tier loads.
  const companyTier = normalizeCompanyTier(effectiveUser.tier);
  const userAdjustedBatchSize = useRef(false);
  const [batchSize, setBatchSize] = useState<number>(() => COMPANY_BATCH_DEFAULTS[companyTier]);
  const [creditsPerFirm] = useState<number>(2);

  // UI polish state
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Rotating placeholder
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    if (inputFocused || query) return;
    const timer = setInterval(() => {
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIdx(i => (i + 1) % FIRM_PLACEHOLDERS.length);
        setPlaceholderVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(timer);
  }, [inputFocused, query]);

  const showAnimatedPlaceholder = !query && !inputFocused;

  const archiveLoadedRef = useRef(false);

  // Prompt cards state (prompt-first discovery)
  const [promptChips, setPromptChips] = useState<PromptChip[]>([]);
  const [promptsPersonalized, setPromptsPersonalized] = useState(false);
  const [userSchoolShortForPrompts, setUserSchoolShortForPrompts] = useState<string | null>(null);

  // Build prompt cards from user profile data
  useEffect(() => {
    if (!user?.uid || archiveLoadedRef.current) return;
    archiveLoadedRef.current = true;

    const buildArchive = async () => {
      try {
        const onboarding = await firebaseApi.getUserOnboardingData(user.uid);
        const schoolShort = getUniversityShortName(onboarding.university);
        setUserSchoolShortForPrompts(schoolShort || null);

        const ctx: UserContext = {
          firstName: onboarding.firstName,
          university: onboarding.university,
          graduationYear: onboarding.graduationYear,
          targetIndustries: onboarding.targetIndustries,
          preferredLocations: onboarding.preferredLocations,
          dreamCompanies: onboarding.dreamCompanies,
          careerTrack: onboarding.careerTrack,
          preferredJobRole: onboarding.preferredJobRole,
          targetFirms: onboarding.targetFirms || [],
          extractedRoles: onboarding.extractedRoles || [],
          directionNarrative: onboarding.directionNarrative || '',
          personalContext: onboarding.personalContext || '',
        };

        // Build prompt cards
        if (!isContextEmpty(ctx)) {
          setPromptChips(generateFirmDiscoveryPrompts(ctx));
          setPromptsPersonalized(true);
        } else {
          setPromptChips(getGenericFirmPrompts());
          setPromptsPersonalized(false);
        }
      } catch (err) {
        console.error('[FirmSearch] onboarding fetch failed, using generic prompts:', err);
        setPromptChips(getGenericFirmPrompts());
        setPromptsPersonalized(false);
      }
    };

    buildArchive();
  }, [user?.uid]);

  // Validation — discovery-first. Any non-trivial query (3+ chars) is a valid
  // search. The previous rule required 20+ chars AND a location keyword,
  // which made "Apple" or "fintech in NYC" fail. The Companies tab is for
  // exploration; we don't want to gatekeep behind sentence-shaped prompts.
  const isValidQuery = query.trim().length >= 3;

  // Refresh credits when batch size changes to update UI warnings
  useEffect(() => {
    if (checkCredits && user) {
      checkCredits();
    }
  }, [batchSize, checkCredits, user]);

  // Keep resultsRef in sync with results state
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // Handle Scout auto-populate from failed search, chat "Take me there", or navigation state
  useEffect(() => {
    const applyPopulate = (populateData: { industry?: string; location?: string; size?: string }) => {
      const { industry, location: autoLocation, size } = populateData;
      let newQuery = '';
      if (industry) newQuery += industry;
      if (autoLocation) newQuery += (newQuery ? ' in ' : '') + autoLocation;
      if (size) newQuery += (newQuery ? ', ' : '') + size;
      if (newQuery) {
        setQuery(newQuery);
        toast({
          title: "Search pre-filled",
          description: "Scout has filled in your search fields. Click Search to find firms.",
        });
      }
    };

    const handleAutoPopulate = () => {
      try {
        const stateData = (routerLocation.state as { scoutAutoPopulate?: { search_type?: string; industry?: string; location?: string; size?: string } } | undefined)?.scoutAutoPopulate;
        if (stateData?.search_type === 'firm') {
          applyPopulate(stateData);
          sessionStorage.removeItem(SCOUT_AUTO_POPULATE_KEY);
          navigate(routerLocation.pathname, { replace: true, state: {} });
          return;
        }

        const stored = sessionStorage.getItem(SCOUT_AUTO_POPULATE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          let populateData: { industry?: string; location?: string; size?: string };
          if (data.search_type === 'firm') {
            if (data.auto_populate) {
              populateData = data.auto_populate;
            } else {
              populateData = data;
            }
            applyPopulate(populateData);
            sessionStorage.removeItem(SCOUT_AUTO_POPULATE_KEY);
          }
        }
      } catch (e) {
        console.error('[Scout] Auto-populate error:', e);
      }
    };

    handleAutoPopulate();
    window.addEventListener('scout-auto-populate', handleAutoPopulate);
    return () => window.removeEventListener('scout-auto-populate', handleAutoPopulate);
  }, [routerLocation.state, routerLocation.pathname, navigate]);

  // Track recently deleted firm IDs to filter them out during reload
  const recentlyDeletedFirmIds = useRef<Set<string>>(new Set());

  // Load all saved firms from Firebase on mount
  const loadAllSavedFirms = useCallback(async () => {
    if (!user) {
      setLoadingSavedFirms(false);
      return;
    }

    setLoadingSavedFirms(true);
    try {
      const history = await apiService.getFirmSearchHistory(100, true);

      const allFirms: Firm[] = [];
      const firmIds = new Set<string>();
      const firmKeys = new Set<string>();

      history.forEach((historyItem: any) => {
        if (historyItem.results && Array.isArray(historyItem.results)) {
          historyItem.results.forEach((firm: Firm) => {
            if (firm.id && deletedFirmIds.current.has(firm.id)) {
              return;
            }

            if (firm.id && recentlyDeletedFirmIds.current.has(firm.id)) {
              return;
            }

            const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;

            if (firm.id) {
              if (!firmIds.has(firm.id)) {
                firmIds.add(firm.id);
                allFirms.push(firm);
              }
            } else {
              if (!firmKeys.has(firmKey)) {
                firmKeys.add(firmKey);
                allFirms.push(firm);
              }
            }
          });
        }
      });

      const filteredFirms = allFirms.filter(firm => {
        if (firm.id && deletedFirmIds.current.has(firm.id)) {
          return false;
        }
        return true;
      });

      if (recentlyDeletedFirmIds.current.size > 0) {
        recentlyDeletedFirmIds.current.clear();
      }

      setResults(filteredFirms);
    } catch (err) {
      console.error('Failed to load saved firms:', err);
      toast({
        title: "Failed to load firms",
        description: err instanceof Error ? err.message : "Please check your connection and try refreshing.",
        variant: "destructive",
      });
    } finally {
      setLoadingSavedFirms(false);
    }
  }, [user]);

  // Load search history
  const loadHistory = useCallback(async () => {
    if (!user) return;

    setLoadingHistory(true);
    try {
      const history = await apiService.getFirmSearchHistory(10);
      setSearchHistory(history);
    } catch (err) {
      console.error('Failed to load search history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
    if (checkCredits) {
      checkCredits();
    }
  }, [loadHistory, checkCredits]);

  // Track if we've attempted to load
  const loadAttemptedRef = useRef(false);

  // Load saved firms when switching to firm-library tab
  useEffect(() => {
    if (activeTab !== 'firm-library') {
      loadAttemptedRef.current = false;
      return;
    }

    if (!user) return;
    if (loadAttemptedRef.current) return;

    loadAttemptedRef.current = true;
    loadAllSavedFirms();
  }, [activeTab, user, loadAllSavedFirms]);

  // Handle search submission
  const handleSearch = async (searchQuery?: string) => {
    // Hard short-circuit while the tour's demo is active on this surface.
    // Catches button click, Enter key, and chip-driven prefills in one
    // guard. No API call fires.
    if (companiesDemoActive) return;
    const q = searchQuery || query;

    if (!q.trim()) {
      setError('Please enter a search query');
      return;
    }

    if (!user) {
      setError('Please sign in to search for firms');
      toast({
        title: "Authentication Required",
        description: "Please sign in to use Firm Search.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setSearchComplete(false);

    const estimatedSeconds = 2 + Math.ceil(batchSize / 5) * 2;
    const estimatedTime = estimatedSeconds < 60
      ? `${estimatedSeconds} seconds`
      : `${Math.ceil(estimatedSeconds / 60)} minutes`;

    // Initialize progress with estimated time
    setSearchProgress({ current: 0, total: batchSize, step: `Starting search... (est. ${estimatedTime})` });

    let eventSource: EventSource | null = null;

    try {
      // Start async search — returns immediately with searchId
      const { searchId } = await apiService.searchFirmsAsync(q, batchSize);

      // Open SSE stream for real-time progress
      eventSource = await apiService.createFirmSearchStream(searchId);

      await new Promise<void>((resolve, reject) => {
        eventSource!.addEventListener('progress', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            setSearchProgress({
              current: data.current ?? 0,
              total: data.total ?? batchSize,
              step: data.step || 'Searching...',
            });
          } catch { /* ignore parse errors */ }
        });

        eventSource!.addEventListener('complete', (e: MessageEvent) => {
          sseFallbackStarted = true; // prevent onerror from firing after close
          eventSource?.close();
          try {
            const result = JSON.parse(e.data);
            setSearchProgress(null);

            if (result.success && result.firms?.length > 0) {
              setParsedFilters(result.parsedFilters);
              setResults(result.firms);
              setSearchComplete(true);
              setFirmSuggestions(result.suggestions || []);
              toast({
                title: "Search Complete!",
                description: `Found ${result.firms.length} firm${result.firms.length !== 1 ? 's' : ''}. Used ${result.creditsCharged || 0} credits.`,
              });
              if (checkCredits) checkCredits();
              loadHistory();
            } else if (result.firms?.length === 0) {
              setFirmSuggestions(result.suggestions || []);
              setError('Hmm, nothing matched that exactly. Try broadening to just the city or industry — or ask Scout.');
              openPanelWithSearchHelp({
                searchType: 'firm',
                failedSearchParams: { industry: q, location: '', size: '' },
                errorType: 'no_results',
              });
            } else {
              setError(result.error || 'Search failed. Please try again.');
            }
          } catch { setError('Failed to parse search results.'); }
          resolve();
        });

        eventSource!.addEventListener('error', (e: MessageEvent) => {
          sseFallbackStarted = true; // prevent onerror from firing after close
          eventSource?.close();
          try {
            const data = JSON.parse(e.data);
            setError(data.message || 'Search failed.');
          } catch {
            setError('Search connection lost. Please try again.');
          }
          resolve();
        });

        // EventSource native error (connection failure)
        // Do NOT fall back to sync search — the async search is already running
        // and would double-charge credits. Instead, poll the status endpoint.
        let sseFallbackStarted = false;
        eventSource!.onerror = () => {
          if (sseFallbackStarted) return;
          sseFallbackStarted = true;
          eventSource?.close();
          const pollInterval = setInterval(async () => {
            try {
              const statusRes = await apiService.getFirmSearchStatus(searchId);
              if (statusRes.progress?.status === 'completed') {
                clearInterval(pollInterval);
                setSearchProgress(null);
                if (checkCredits) checkCredits();
                // Load results from history into both history list and results view
                loadHistory();
                loadAllSavedFirms();
                setSearchComplete(true);
                toast({ title: "Search Complete!", description: "Results loaded from history." });
                resolve();
              } else if (statusRes.progress?.status === 'failed') {
                clearInterval(pollInterval);
                setError((statusRes.progress as unknown as Record<string, string>)?.error || 'Search failed.');
                resolve();
              }
            } catch {
              clearInterval(pollInterval);
              setError('Search connection lost. Please check your search history for results.');
              resolve();
            }
          }, 2000);
          // Safety timeout for polling
          setTimeout(() => {
            clearInterval(pollInterval);
            setError('Search is taking longer than expected. Check your history for results.');
            resolve();
          }, 120000);
        };
      });
    } catch (err: any) {
      console.error('Search error:', err);

      if (err.status === 401 || err.message?.includes('Authentication required')) {
        setError('Authentication required. Please sign in again.');
        toast({ title: "Authentication Required", description: "Your session may have expired.", variant: "destructive" });
      } else if (err.status === 402 || err.error_code === 'INSUFFICIENT_CREDITS') {
        const creditsNeeded = err.creditsNeeded || err.required || (batchSize * creditsPerFirm);
        const currentCreds = err.currentCredits || err.available || creditsView.balance;
        setError(`Insufficient credits. You need ${creditsNeeded} but have ${currentCreds}.`);
        toast({ title: "Insufficient Credits", description: `Need ${creditsNeeded}, have ${currentCreds}.`, variant: "destructive" });
        if (checkCredits) await checkCredits();
      } else if (err.status === 502 || err.error_code === 'EXTERNAL_API_ERROR') {
        setError(err.message || 'Search service temporarily unavailable.');
        toast({ title: "Service Unavailable", description: err.message || "Try again shortly.", variant: "destructive" });
      } else {
        setError(err.message || 'An unexpected error occurred.');
        toast({ title: "Search Failed", description: err.message || "Please try again.", variant: "destructive" });
      }
    } finally {
      eventSource?.close();
      setIsSearching(false);
      setSearchProgress(null);
    }
  };


  // Handle "View Contacts" - navigate to contact search with company/location pre-filled
  const handleViewContacts = (firm: Firm) => {
    // Inert during the tour's companies demo — the seeded firm isn't a real
    // contact source, so navigating with its name would dead-end on Find.
    if ((firm as Firm & { demo?: boolean }).demo) return;
    const params = new URLSearchParams();
    params.set('company', firm.name);

    if (firm.location?.display) {
      params.set('location', firm.location.display);
    } else if (firm.location?.city) {
      const locationParts = [firm.location.city, firm.location.state, firm.location.country].filter(Boolean);
      params.set('location', locationParts.join(', '));
    }

    navigate(`/find?${params.toString()}`);
  };

  // Get unique firm key (helper function)
  const getFirmKey = (firm: Firm): string => {
    return firm.id || `${firm.name}-${firm.location?.display}`;
  };

  // Handle delete firm
  const handleDeleteFirm = async (firm: Firm) => {
    // Inert during the tour's companies demo — apiService.deleteFirm hits
    // Firestore; a demo card has no row to delete.
    if ((firm as Firm & { demo?: boolean }).demo) return;
    const firmKey = getFirmKey(firm);
    setDeletingFirmId(firmKey);

    try {
      if (firm.id) {
        deletedFirmIds.current.add(firm.id);
        recentlyDeletedFirmIds.current.add(firm.id);
      }

      setResults((prev) => {
        const filtered = prev.filter((f) => {
          if (firm.id && f.id) {
            return f.id !== firm.id;
          }
          const fKey = getFirmKey(f);
          return fKey !== firmKey;
        });
        return filtered;
      });

      const result = await apiService.deleteFirm(firm);

      if (result.success) {
        if (result.deletedCount === 0) {
          if (firm.id) {
            deletedFirmIds.current.delete(firm.id);
            recentlyDeletedFirmIds.current.delete(firm.id);
          }
          setResults((prev) => {
            const exists = prev.some(f => {
              if (firm.id && f.id) {
                return f.id === firm.id;
              }
              return getFirmKey(f) === firmKey;
            });
            if (!exists) {
              return [...prev, firm];
            }
            return prev;
          });
          toast({
            title: "Delete failed",
            description: "Firm not found in database. It may have already been deleted.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Firm deleted",
          description: `Removed from your Firm Library.`,
        });

        if (activeTab === 'firm-library') {
          // Single reload after a short delay to let Firestore propagate
          setTimeout(async () => {
            try {
              await loadAllSavedFirms();
            } catch (reloadError) {
              console.error('Error reloading firms:', reloadError);
            }
          }, 1500);
        }
      } else {
        if (firm.id) {
          deletedFirmIds.current.delete(firm.id);
          recentlyDeletedFirmIds.current.delete(firm.id);
        }
        setResults((prev) => {
          const exists = prev.some(f => {
            if (firm.id && f.id) {
              return f.id === firm.id;
            }
            return getFirmKey(f) === firmKey;
          });
          if (!exists) {
            return [...prev, firm];
          }
          return prev;
        });
        throw new Error(result.error || 'Failed to delete firm');
      }
    } catch (error) {
      console.error('Delete firm error:', error);
      if (firm.id) {
        deletedFirmIds.current.delete(firm.id);
        recentlyDeletedFirmIds.current.delete(firm.id);
      }
      setResults((prev) => {
        const exists = prev.some(f => {
          if (firm.id && f.id) {
            return f.id === firm.id;
          }
          return getFirmKey(f) === firmKey;
        });
        if (!exists) {
          return [...prev, firm];
        }
        return prev;
      });
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingFirmId(null);
    }
  };

  // Handle delete all firms
  const handleDeleteAllFirms = async () => {
    const count = results.length;
    setShowDeleteAllDialog(false);

    try {
      const deletePromises = results.map(firm => apiService.deleteFirm(firm));
      const results_array = await Promise.allSettled(deletePromises);

      const successCount = results_array.filter(
        r => r.status === 'fulfilled' && r.value.success && (r.value.deletedCount || 0) > 0
      ).length;
      const failedCount = count - successCount;

      if (failedCount === 0) {
        setResults([]);
        toast({
          title: "All firms deleted",
          description: `Removed ${successCount} firm${successCount !== 1 ? 's' : ''} from your Firm Library.`,
        });

        if (activeTab === 'firm-library') {
          setTimeout(async () => {
            try {
              await loadAllSavedFirms();
            } catch (reloadError) {
              console.error('Error reloading firms:', reloadError);
            }
          }, 1000);
        }
      } else {
        toast({
          title: "Partial deletion",
          description: `Deleted ${successCount} of ${count} firms. ${failedCount} failed.`,
          variant: "default",
        });

        if (activeTab === 'firm-library') {
          setTimeout(async () => {
            try {
              await loadAllSavedFirms();
            } catch (reloadError) {
              console.error('Error reloading firms:', reloadError);
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Error deleting all firms:', error);
      toast({
        title: "Delete error",
        description: "An error occurred while deleting firms.",
        variant: "destructive",
      });

      if (activeTab === 'firm-library') {
        setTimeout(async () => {
          try {
            await loadAllSavedFirms();
          } catch (reloadError) {
            console.error('Error reloading firms:', reloadError);
          }
        }, 1000);
      }
    }
  };

  // Handle clicking a history item
  const handleHistoryClick = (item: SearchHistoryItem) => {
    setQuery(item.query);
    setShowHistory(false);
    // Don't auto-fire search — let user review the query and click "Find Companies" manually
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  // CSV Export function
  const handleExportCsv = () => {
    if (effectiveUser.tier === 'free') {
      setShowUpgradeDialog(true);
      return;
    }

    if (!results || results.length === 0) {
      return;
    }

    const headers = ['Company Name', 'Website', 'LinkedIn', 'Location', 'Industry'] as const;
    const headerRow = headers.join(',');

    const rows = results.map((firm) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const location = firm.location?.display ||
        [firm.location?.city, firm.location?.state, firm.location?.country]
          .filter(Boolean)
          .join(', ');

      return [
        escapeCsv(firm.name),
        escapeCsv(firm.website),
        escapeCsv(firm.linkedinUrl),
        escapeCsv(location),
        escapeCsv(firm.industry)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `firms_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle upgrade navigation
  const handleUpgrade = () => {
    setShowUpgradeDialog(false);
    navigate('/pricing');
  };

  // Companies search batch cap is tier-specific (free 10, pro 25, elite 50),
  // 2 credits per company found.
  const maxBatchSize = COMPANY_BATCH_CAPS[companyTier];

  // Snap to the tier default once the tier is known (if the user has not moved
  // the slider), and always clamp within the current tier's max.
  useEffect(() => {
    if (!userAdjustedBatchSize.current) {
      setBatchSize(COMPANY_BATCH_DEFAULTS[companyTier]);
    } else if (batchSize > maxBatchSize) {
      setBatchSize(maxBatchSize);
    }
  }, [companyTier, maxBatchSize, batchSize]);


  // --- Embedded content (rendered inside FindPage wrapper) ---
  const embeddedContent = (
    <>
      <div>
              {/* Main Content Area */}
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                  {/* TAB 1: Find Companies */}
                  <TabsContent value="firm-search" className="mt-0">
                    {/* Authentication Notice */}
                    {!user && (
                      <div
                        className="flex items-center gap-2 text-sm text-amber-800"
                        style={{ maxWidth: '860px', margin: '0 auto 16px', padding: '10px 14px', background: '#FFFBEB', border: '0.5px solid #FDE68A', borderRadius: 3 }}
                      >
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        Please sign in to use Find Companies.
                      </div>
                    )}

                    <div style={{ padding: '24px 32px 32px', maxWidth: '860px' }}>

                      {/* ── Search box — shared SearchPromptBox (matches Find People) ── */}
                      <SearchPromptBox
                        helper="Describe the type of companies you're looking for"
                        onSubmit={() => handleSearch()}
                        submitDisabled={!isValidQuery || isSearching || !user || creditsView.balance < (batchSize * creditsPerFirm) || creditsView.balance === 0}
                        inputValue={query}
                        submitAriaLabel="Search companies"
                        submitIcon={isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                        footer={!hasSearched && !isSearching ? (
                        <div style={{
                          marginTop: 16,
                          opacity: inputFocused && query.trim() ? 0.4 : 1,
                          transition: 'opacity .15s',
                        }}>
                          {/* Section header — matches Find People "Recommended for you" treatment */}
                          <div style={{ marginBottom: 4 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 500, color: 'var(--ink-3, #8A8F9A)',
                              fontFamily: "'Libre Baskerville', Georgia, serif",
                            }}>
                              Recommended Searches
                            </span>
                          </div>

                          {/* Profile nudge for the generic (non-personalized) tier — subtitle style */}
                          {!promptsPersonalized && (
                            <div style={{ marginBottom: 14 }}>
                              <span style={{ fontSize: 11.5, color: 'var(--ink-2, #4A4F5B)' }}>
                                Add your school and target industries to get prompts shaped around you.
                              </span>
                            </div>
                          )}

                          {/* Recommendation cards — reuses Find People card tokens, adapted for a company search query */}
                          <div style={{
                            display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6,
                            scrollbarWidth: 'none',
                          }}>
                            {promptChips.map((chip, idx) => (
                              <button
                                key={chip.id}
                                type="button"
                                disabled={isSearching}
                                onClick={() => {
                                  setQuery(chip.prompt);
                                  handleSearch(chip.prompt);
                                }}
                                className="suggestion-row-enter"
                                style={{
                                  flex: '0 0 280px', width: 280,
                                  borderRadius: 16, overflow: 'hidden',
                                  background: 'var(--elev, #FFFFFF)',
                                  border: '1px solid var(--line, #E8E8E8)',
                                  cursor: 'pointer', textAlign: 'left',
                                  transition: 'all .2s ease',
                                  fontFamily: 'inherit', padding: 0,
                                  boxShadow: 'inset 0 -1px 0 var(--line, #E8E8E8), 0 1px 2px rgba(26,29,35,0.03)',
                                  animationDelay: `${idx * 60}ms`,
                                }}
                                onMouseEnter={(e) => {
                                  const el = e.currentTarget as HTMLButtonElement;
                                  el.style.borderColor = 'var(--accent, #4A60A8)';
                                  el.style.boxShadow = 'inset 0 -1px 0 var(--line, #E8E8E8), 0 2px 6px rgba(26,29,35,0.06)';
                                  el.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                  const el = e.currentTarget as HTMLButtonElement;
                                  el.style.borderColor = 'var(--line, #E8E8E8)';
                                  el.style.boxShadow = 'inset 0 -1px 0 var(--line, #E8E8E8), 0 1px 2px rgba(26,29,35,0.03)';
                                  el.style.transform = 'translateY(0)';
                                }}
                              >
                                <div style={{ padding: '12px 14px 14px' }}>
                                  {/* Leading companies-icon tile — colored accent for a bit of style */}
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{
                                      width: 32, height: 32, borderRadius: 8,
                                      background: 'rgba(74, 96, 168, 0.10)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      <Building2 style={{ width: 16, height: 16, color: 'var(--accent, #4A60A8)' }} />
                                    </div>
                                  </div>

                                  {/* Company search query — card title, wraps to 2 lines */}
                                  <div style={{
                                    fontSize: 13.5, fontWeight: 500, color: 'var(--ink, #111318)',
                                    lineHeight: 1.4,
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden', minHeight: 38, marginBottom: 6,
                                  }}>
                                    {chip.prompt}
                                  </div>

                                  {/* Descriptor — mirrors the People card's reason line */}
                                  <div style={{
                                    fontSize: 11, color: 'var(--ink-2, #4A4F5B)', lineHeight: 1.4,
                                    marginBottom: 10,
                                  }}>
                                    {chip.hint || 'Suggested search'}
                                  </div>

                                  {/* CTA — same indigo as "Find contacts →" */}
                                  <div style={{
                                    fontSize: 11, color: 'var(--accent, #4A60A8)', fontWeight: 500,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                  }}>
                                    Run search
                                    <ArrowRight style={{ width: 11, height: 11, opacity: 0.7 }} />
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Recent searches — compact toggle */}
                          {searchHistory.length > 0 && (
                            <div style={{ marginTop: 18 }}>
                              <button
                                onClick={() => setShowHistory(!showHistory)}
                                style={{
                                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontSize: 11, letterSpacing: '0.04em', color: '#8A8F97',
                                }}
                              >
                                <History style={{ width: 12, height: 12 }} />
                                {searchHistory.length} recent {searchHistory.length === 1 ? 'search' : 'searches'}
                                <ChevronRight style={{
                                  width: 11, height: 11,
                                  transition: 'transform .15s ease',
                                  transform: showHistory ? 'rotate(90deg)' : 'rotate(0deg)',
                                }} />
                              </button>

                              {showHistory && (
                                <div style={{ marginTop: 8 }}>
                                  {searchHistory.slice(0, 5).map((item) => (
                                    <div
                                      key={item.id}
                                      onClick={() => {
                                        setQuery(item.query);
                                        handleSearch(item.query);
                                      }}
                                      style={{
                                        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                                        padding: '7px 0',
                                        borderTop: '1px solid #EFEDE8',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <div style={{ fontSize: 12, color: '#4A4F57' }}>
                                        <Search style={{ width: 11, height: 11, display: 'inline', verticalAlign: 'middle', color: '#8A8F97', marginRight: 5 }} />
                                        {item.query}
                                      </div>
                                      <div style={{
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: 10, color: '#8A8F97', whiteSpace: 'nowrap', marginLeft: 12,
                                      }}>
                                        {item.resultsCount} {item.resultsCount === 1 ? 'result' : 'results'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        ) : null}
                      >
                        <textarea
                          ref={textareaRef}
                          rows={1}
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            const el = e.currentTarget;
                            el.style.height = 'auto';
                            el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                          }}
                          onKeyDown={handleKeyDown}
                          onFocus={() => setInputFocused(true)}
                          onBlur={() => setInputFocused(false)}
                          placeholder={FIRM_PLACEHOLDERS[placeholderIdx]}
                          disabled={isSearching || companiesDemoActive}
                          style={{
                            width: '100%',
                            border: 'none',
                            outline: 'none',
                            resize: 'none',
                            background: 'transparent',
                            fontSize: 14,
                            lineHeight: 1.5,
                            color: 'var(--ink, #111418)',
                            fontFamily: 'inherit',
                            padding: 0,
                            paddingRight: 40,
                            minHeight: 21,
                            overflow: 'hidden',
                          }}
                        />
                      </SearchPromptBox>

                      {/* ── Quantity slider (directly below the search box) ── */}
                      <div style={{ marginTop: 24, marginBottom: 12 }}>
                        <div style={{
                          fontFamily: '"Libre Baskerville", Georgia, serif',
                          fontSize: 10, letterSpacing: '0.12em', color: '#8A8F97', marginBottom: 8,
                        }}>
                          HOW MANY TO FIND?
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 11, color: '#8A8F97', minWidth: 12 }}>5</span>
                          <div className="slider-input-wrapper" style={{ flex: 1, position: 'relative', height: 4, background: '#E5E3DE', borderRadius: 2 }}>
                            <div style={{
                              position: 'absolute', left: 0, top: 0, height: 4,
                              width: maxBatchSize > 5 ? `${((batchSize - 5) / (maxBatchSize - 5)) * 100}%` : '0%',
                              background: 'var(--accent, #1B2A44)', borderRadius: 2,
                            }} />
                            <input
                              type="range"
                              min={5}
                              max={maxBatchSize}
                              step={1}
                              value={batchSize}
                              onChange={(e) => { userAdjustedBatchSize.current = true; setBatchSize(Math.min(Number(e.target.value), maxBatchSize)); }}
                              disabled={isSearching}
                              className="slider-custom"
                              aria-label="Number of companies to find"
                              style={{
                                position: 'absolute', inset: 0, width: '100%', height: '100%',
                                opacity: 0, cursor: 'pointer', margin: 0,
                              }}
                            />
                            <div style={{
                              position: 'absolute',
                              left: `calc(${maxBatchSize > 5 ? ((batchSize - 5) / (maxBatchSize - 5)) * 100 : 0}% - 7px)`,
                              top: -5, width: 14, height: 14, borderRadius: '50%',
                              background: 'var(--accent, #1B2A44)',
                              boxShadow: '0 1px 4px rgba(27,42,68,0.4)',
                              pointerEvents: 'none',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#8A8F97', minWidth: 16, textAlign: 'right' }}>{maxBatchSize}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }}>
                          <div style={{
                            fontFamily: "var(--serif, 'Instrument Serif', Georgia, serif)",
                            fontStyle: 'italic', fontSize: 13.5, color: '#111418',
                          }}>
                            Find {batchSize} companies
                          </div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#4A4F57' }}>
                            <span style={{
                              display: 'inline-flex', padding: '3px 8px',
                              background: '#FAFAF8', border: '1px solid #E5E3DE', borderRadius: 4,
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#111418',
                            }}>
                              {batchSize * creditsPerFirm} credits
                            </span>
                            <span style={{ color: '#8A8F97' }}>
                              of {creditsView.balance.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        {creditsView.balance < (batchSize * creditsPerFirm) && (
                          <p style={{ fontSize: 11, color: '#D97706', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertCircle style={{ width: 12, height: 12 }} />
                            Insufficient credits. Need {batchSize * creditsPerFirm}, have {creditsView.balance}.
                          </p>
                        )}
                      </div>

                      {/* Validation feedback */}
                      {query && !isValidQuery && !hasSearched && (
                        <p style={{ fontSize: 11, color: '#8A8F97', marginTop: 6, textAlign: 'center' }}>
                          Include an industry and location for best results
                        </p>
                      )}

                      {/* Back to recommendations link */}
                      {hasSearched && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery('');
                            setHasSearched(false);
                            setError(null);
                          }}
                          style={{
                            fontSize: 12, color: '#8A8F97', background: 'none', border: 'none',
                            cursor: 'pointer', fontFamily: 'inherit', padding: '12px 0 0',
                            transition: 'color .12s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent, #1B2A44)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8A8F97'; }}
                        >
                          ← Back to recommendations
                        </button>
                      )}

                    </div>
                  </TabsContent>

                  {/* TAB 2: Company Tracker */}
                  <TabsContent value="firm-library" className="mt-0">
<div
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '3px',
                        maxWidth: '900px',
                        margin: '0 auto',
                        boxShadow: 'none',
                        animationDelay: '200ms',
                      }}
                      className="w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp"
                    >
                      <div className="h-1" style={{ background: '#EEF2F8' }}></div>

                      <div className="p-8">
                        {/* Header with actions */}
                        <div className="flex justify-between items-center pb-6 mb-6" style={{ borderBottom: '1px solid #EEF2F8' }}>
                          <div>
                            <h2 className="text-xl font-semibold" style={{ color: '#0F172A', fontFamily: "'Lora', Georgia, serif" }}>
                              {results.length} {results.length === 1 ? 'company' : 'companies'} saved
                            </h2>
                            <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
                              Export your results to CSV for further analysis
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => {
                                loadAttemptedRef.current = false;
                                loadAllSavedFirms();
                              }}
                              variant="outline"
                              size="sm"
                              className="gap-2 hover:bg-[#FAFBFF]"
                              style={{ borderColor: '#E2E8F0', color: '#0F172A', borderRadius: 3 }}
                              disabled={loadingSavedFirms}
                            >
                              {loadingSavedFirms ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              )}
                              Refresh
                            </Button>
                            {results.length > 0 && (
                              <>
                                <Button
                                  onClick={() => setShowDeleteAllDialog(true)}
                                  variant="outline"
                                  className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete All
                                </Button>
                                <Button
                                  onClick={handleExportCsv}
                                  className={`gap-2 ${effectiveUser.tier === 'free'
                                    ? 'bg-[#94A3B8] hover:bg-[#94A3B8] cursor-not-allowed opacity-60'
                                    : 'bg-[#0F172A] hover:bg-[#1E293B]'
                                    }`}
                                  disabled={effectiveUser.tier === 'free'}
                                  title={effectiveUser.tier === 'free' ? 'Upgrade to Pro or Elite to export CSV' : 'Export firms to CSV'}
                                >
                                  <Download className="h-4 w-4" />
                                  Export CSV
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Company Results */}
                        {loadingSavedFirms ? (
                          <LoadingSkeleton variant="card" count={3} />
                        ) : results.length > 0 ? (
                          <FirmSearchResults
                            firms={results}
                            onViewContacts={handleViewContacts}
                            onDelete={handleDeleteFirm}
                            deletingId={deletingFirmId}
                          />
                        ) : (
                          <div className="py-12 text-center">
                            <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4" style={{ background: '#EEF2F8', borderRadius: 3 }}>
                              <Building2 className="h-8 w-8" style={{ color: '#0F172A' }} />
                            </div>
                            <h3 className="text-lg font-semibold mb-2" style={{ color: '#0F172A', fontFamily: "'Lora', Georgia, serif" }}>No companies yet</h3>
                            <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
                              Use the Find Companies tab to discover companies
                            </p>
                            <button
                              onClick={() => setActiveTab('firm-search')}
                              className="px-6 py-3 text-white font-semibold transition-all"
                              style={{ background: '#3B82F6', borderRadius: 3 }}
                            >
                              Find Companies
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

        {/* Search History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn" style={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold" style={{ color: '#0F172A', fontFamily: "'Lora', Georgia, serif" }}>Search History</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-[#FAFBFF]"
                  style={{ borderRadius: 3 }}
                >
                  <X className="w-5 h-5" style={{ color: '#6B7280' }} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 space-y-2">
                {loadingHistory ? (
                  <div className="py-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: '#94A3B8' }} />
                  </div>
                ) : searchHistory.length === 0 ? (
                  <div className="py-8 text-center" style={{ color: '#6B7280' }}>
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No search history yet</p>
                  </div>
                ) : (
                  searchHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleHistoryClick(item)}
                      className="flex items-center justify-between p-4 cursor-pointer transition-colors"
                      style={{ background: '#FAFBFF', borderRadius: 3 }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#EEF2F8'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#FAFBFF'; }}
                    >
                      <div>
                        <p className="font-medium text-sm line-clamp-2" style={{ color: '#0F172A' }}>{item.query}</p>
                        <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
                          {item.resultsCount} results • {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4" style={{ color: '#94A3B8' }} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Loading Modal */}
        {isSearching && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200" style={{ borderRadius: 3, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              {/* Animated Icon */}
              <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 relative" style={{ background: '#EEF2F8', borderRadius: 3 }}>
                <div className="absolute inset-0 animate-pulse" style={{ background: 'rgba(59,130,246,0.10)', borderRadius: 3 }}></div>
                <Building2 className="w-10 h-10 relative z-10" style={{ color: '#0F172A' }} />
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold mb-2" style={{ color: '#0F172A', fontFamily: "'Lora', Georgia, serif" }}>Searching for companies</h3>

              {/* Status Message */}
              <p className="mb-6 text-sm min-h-[20px]" style={{ color: '#6B7280' }}>
                {searchProgress?.step || `Finding ${batchSize} companies matching your criteria`}
              </p>

              {/* Progress Bar Container */}
              <div className="mb-4">
                <div className="w-full h-3 overflow-hidden" style={{ background: '#EEF2F8', borderRadius: 3 }}>
                  <div
                    className="h-3 transition-all duration-500 ease-out relative overflow-hidden"
                    style={{
                      background: '#3B82F6',
                      borderRadius: 3,
                      width: searchProgress
                        ? `${Math.max(2, Math.min(98, (searchProgress.current / searchProgress.total) * 100))}%`
                        : '10%'
                    }}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"></div>
                  </div>
                </div>

                {/* Progress Text */}
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="font-medium" style={{ color: '#3B82F6' }}>
                    {searchProgress
                      ? `${searchProgress.current} of ${searchProgress.total} companies`
                      : 'Starting...'}
                  </span>
                  <span style={{ color: '#6B7280' }}>
                    {searchProgress
                      ? `${Math.round((searchProgress.current / searchProgress.total) * 100)}%`
                      : '0%'}
                  </span>
                </div>
              </div>

              {/* Estimated Time */}
              <p className="text-xs mt-4" style={{ color: '#94A3B8' }}>
                This usually takes 10-20 seconds
              </p>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {searchComplete && results.length > 0 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 max-w-md text-center animate-scaleIn" style={{ borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div className="w-16 h-16 bg-green-100 flex items-center justify-center mx-auto mb-4" style={{ borderRadius: 3 }}>
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold mb-1" style={{ color: '#0F172A', fontFamily: "'Lora', Georgia, serif" }}>Found {results.length} companies!</h3>
              <p className="mb-2" style={{ color: '#6B7280' }}>Matching your criteria</p>
              <p className="text-sm font-medium mb-6" style={{ color: '#3B82F6' }}>Saved to your Company Tracker</p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => {
                    setSearchComplete(false);
                    // Land on the Companies table in list mode, newest-first, so the
                    // firms we just found are scannable and sit at the top - overrides
                    // any persisted grid/oldest preference for this hand-off.
                    try {
                      localStorage.setItem('ofl_my_network_companies_view', 'list');
                      localStorage.setItem('ofl_my_network_companies_sort', 'newest');
                    } catch {}
                    navigate('/my-network/companies');
                  }}
                  className="px-6 py-3 text-white font-semibold transition-all"
                  style={{ background: '#3B82F6', borderRadius: 3 }}
                >
                  View Companies →
                </button>
                <button
                  onClick={() => { setSearchComplete(false); setQuery(''); setHasSearched(false); }}
                  className="px-6 py-3 font-semibold transition-colors"
                  style={{ background: '#EEF2F8', color: '#0F172A', borderRadius: 3 }}
                >
                  Search again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete All Confirmation Dialog */}
        <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete All Companies?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove all {results.length} {results.length === 1 ? 'company' : 'companies'} from your Company Tracker.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAllFirms}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Upgrade Dialog for CSV Export */}
        <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Upgrade to Export CSV</AlertDialogTitle>
              <AlertDialogDescription>
                CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleUpgrade}
                className="bg-[#3B82F6] hover:bg-[#2563EB] focus:ring-[#3B82F6]"
              >
                Upgrade to Pro/Elite
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      {/* Mobile-only CSS overrides */}
      <style>{`
        @media (max-width: 768px) {
          /* 1. PAGE CONTAINER - Prevent horizontal overflow */
          .firm-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .firm-search-container {
            max-width: 100%;
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          /* 2. HEADER - Reduce font size, ensure wrapping */
          .firm-search-title {
            font-size: 1.75rem !important;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding-left: 0;
            padding-right: 0;
          }

          /* 3. SUBTITLE TEXT - Reduce font size */
          .firm-search-subtitle {
            font-size: 0.875rem !important;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 4. TAB BAR - Horizontal scroll or fit within viewport */
          .firm-search-tabs {
            width: 100% !important;
            max-width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 8px !important;
            justify-content: flex-start;
          }

          .firm-search-tabs::-webkit-scrollbar {
            display: none;
          }

          .firm-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. FORM CARD - Full width, proper padding */
          .firm-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 6. SECTION HEADING + HISTORY BUTTON ROW - Stack if needed */
          .firm-search-header-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .firm-search-header-content {
            width: 100%;
          }

          .firm-search-form-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
          }

          .firm-search-form-subtitle {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .firm-search-history-btn {
            width: 100%;
            justify-content: center;
            min-height: 44px;
          }

          /* 7. EXAMPLE CHIPS - Wrap to multiple lines */
          .firm-search-examples {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-example-chips {
            flex-wrap: wrap !important;
            gap: 8px;
            max-width: 100%;
          }

          .firm-search-example-chips button {
            flex-shrink: 0;
            max-width: 100%;
            word-wrap: break-word;
            white-space: normal;
            padding: 8px 12px;
            font-size: 0.875rem;
          }

          /* 8. TEXTAREA - Full width, proper padding */
          .firm-search-textarea-wrapper {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-textarea {
            width: 100% !important;
            max-width: 100%;
            box-sizing: border-box;
            padding: 12px !important;
            padding-right: 48px !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 9. HOW MANY COMPANIES SECTION - Ensure wrapping */
          .firm-search-quantity-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-quantity-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
          }

          .firm-search-quantity-subtitle {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .firm-search-quantity-card {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 10. NUMBER SELECTOR BUTTONS - Ensure all 4 fit or allow scroll */
          .firm-search-quantity-buttons {
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
          }

          .firm-search-quantity-btn {
            min-width: 60px;
            min-height: 44px !important;
            flex: 1 1 calc(25% - 6px);
            max-width: calc(25% - 6px);
            padding: 12px 8px !important;
            font-size: 0.875rem;
          }

          /* 11. COMPANY ICON VISUALIZATION ROW - Constrain to viewport */
          .firm-search-company-icons {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            max-width: 100%;
            flex-wrap: nowrap;
            padding-bottom: 4px;
          }

          .firm-search-company-icons::-webkit-scrollbar {
            display: none;
          }

          .firm-search-company-icons > div {
            flex-shrink: 0;
          }

          /* 12. WHAT YOU'LL GET SECTION - Stack in 2x2 grid or single column */
          .firm-search-features-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-features-title {
            font-size: 0.75rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding: 0 8px;
          }

          .firm-search-features-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }

          .firm-search-features-grid > div {
            padding: 12px !important;
            box-sizing: border-box;
          }

          .firm-search-features-grid > div > div {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-features-grid p {
            font-size: 0.75rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 13. FIND COMPANIES CTA BUTTON - Full width */
          .firm-search-cta {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-find-btn {
            width: 100% !important;
            min-height: 48px !important;
            max-width: 100%;
            box-sizing: border-box;
            padding: 14px 16px !important;
          }

          /* GENERAL - Ensure all containers respect max-width */
          .firm-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-page input,
          .firm-search-page textarea,
          .firm-search-page select,
          .firm-search-page button {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .firm-search-page p,
          .firm-search-page h1,
          .firm-search-page h2,
          .firm-search-page h3,
          .firm-search-page span,
          .firm-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }

          /* Ensure content doesn't touch screen edge */
          .firm-search-container > * {
            padding-left: 0;
            padding-right: 0;
          }

          /* Additional overflow fixes */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .firm-search-page {
            overflow-x: hidden;
          }

          .firm-search-header {
            padding-left: 16px;
            padding-right: 16px;
          }
        }
      `}</style>
      
      {/* Sticky CTA - Only show on firm-search tab */}
      {activeTab === 'firm-search' && (
        <StickyCTA
          originalButtonRef={originalButtonRef}
          onClick={() => handleSearch()}
          isLoading={isSearching}
          disabled={!isValidQuery || isSearching || !user || creditsView.balance < (batchSize * creditsPerFirm)}
          buttonClassName="rounded-[3px]"
        >
          <span>Find companies</span>
        </StickyCTA>
      )}
    </>
  );

  if (embedded) return embeddedContent;

  // --- Standalone page with full shell ---
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader />

          <main className="px-3 py-6 sm:px-6 sm:py-12" style={{ background: '#FAFBFF', flex: 1, overflowY: 'auto', paddingBottom: '96px' }}>
            {/* Header Section */}
            <div className="w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0" style={{ maxWidth: '900px', margin: '0 auto' }}>
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
                Find Companies
              </h1>
              <p
                style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: '16px',
                  color: '#6B7280',
                  textAlign: 'center',
                  marginBottom: '28px',
                  lineHeight: 1.5,
                }}
              >
                Describe the type of companies you're looking for in plain English and we'll find them for you.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <VideoDemo videoId="n_AYHEJSXrE" />
              </div>
            </div>

            {embeddedContent}
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default FirmSearchPage;