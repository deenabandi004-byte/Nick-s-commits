import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useCreditsView } from "@/hooks/useCreditsView";
import { useScout } from "@/contexts/ScoutContext";
import { useTour } from "@/contexts/TourContext";
import {
  Linkedin, Loader2, ArrowRight, ArrowUp,
  User, Check, CheckCircle,
  FileText, Upload, Mail, Inbox, AlertCircle, X, ExternalLink, ChevronRight, Lock, Send
} from "lucide-react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiService, BACKEND_URL, isErrorResponse, type EmailTemplate, getEmailTemplateLabel } from "@/services/api";
import { firebaseApi } from "../services/firebaseApi";
import type { Contact as ContactApi } from '../services/firebaseApi';
import { toast } from "@/hooks/use-toast";
import { TIER_CONFIGS, CREDIT_COSTS } from "@/lib/constants";
import { logActivity, generateContactSearchSummary } from "@/utils/activityLogger";
import { EliteGateModal } from "@/components/EliteGateModal";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { db, storage, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { trackFeatureActionCompleted, trackError } from "../lib/analytics";
import { ACCEPTED_RESUME_TYPES, isValidResumeFile } from "@/utils/resumeFileTypes";
import ContactImport from "@/components/ContactImport";
import { motion, AnimatePresence } from "framer-motion";
import DimensionChips from "@/components/find/DimensionChips";
import CompanyAlternatives from "@/components/find/CompanyAlternatives";
import RoleVariations from "@/components/find/RoleVariations";
import QuickStarters from "@/components/find/QuickStarters";
import { SearchPromptBox, PEOPLE_SEARCH_HELPER, PEOPLE_SEARCH_HELPER_SEND, PEOPLE_SEARCH_HELPER_PREVIEW } from "@/components/find/SearchPromptBox";
import { SearchModeSelector } from "@/components/find/SearchModeSelector";
import { ResultActionButton } from "@/components/find/ResultActionButton";
import { SendConfirmDialog } from "@/components/SendConfirmDialog";
import { type OutreachMode, getDefaultOutreachMode, canUseOutreachMode } from "@/utils/featureAccess";
import { findCompletion, expandQueryForBackend } from "@/lib/specificity";
import SuggestionChips from "@/components/find/SuggestionChips";
import { TemplateButton } from "@/components/TemplateButton";

import { DEV_MOCK_USER } from "@/lib/devPreview";
import { getUniversityShortName } from "@/lib/universityUtils";

// Session storage key for Scout auto-populate
const SCOUT_AUTO_POPULATE_KEY = 'scout_auto_populate';

function getPeopleFallbackPlaceholders(schoolShort: string | null): string[] {
  // Each prompt uses a different shape (alum-to-company, role+season, hiring-manager,
  // location, sector) so cycling them nudges the user toward thinking about WHICH
  // angle of search they care about, rather than copying a single template.
  const school = schoolShort || 'USC';
  return [
    `${school} alumni at Goldman Sachs`,
    `Stripe engineers hiring for summer 2026 SWE interns`,
    `Hiring managers for product roles at Sequoia-backed startups`,
    `${school} grads now working at Google in product`,
    `Investment bankers in NYC who went to ${school}`,
    `McKinsey consultants who studied at ${school}`,
    `Founders of YC startups who went to ${school}`,
    `Recruiters at Meta hiring for new-grad SWE`,
  ];
}

// Typewriter cycler: types one phrase, holds, erases, advances to the next.
// Returns the currently visible substring. Pause when `paused` is true so we
// don't waste cycles while the user is typing into the textarea.
function useTypewriterCycle(
  phrases: string[],
  opts?: { typeMs?: number; eraseMs?: number; holdMs?: number; paused?: boolean }
): string {
  const { typeMs = 45, eraseMs = 22, holdMs = 1600, paused = false } = opts ?? {};
  const [idx, setIdx] = useState(0);
  const [display, setDisplay] = useState('');
  const [phase, setPhase] = useState<'typing' | 'erasing'>('typing');

  // Reset when the source phrases change (e.g. user's school loads in async).
  useEffect(() => {
    setIdx(0);
    setDisplay('');
    setPhase('typing');
  }, [phrases]);

  useEffect(() => {
    if (paused || phrases.length === 0) return;
    const current = phrases[idx % phrases.length];

    if (phase === 'typing') {
      if (display.length < current.length) {
        const t = setTimeout(
          () => setDisplay(current.slice(0, display.length + 1)),
          typeMs,
        );
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase('erasing'), holdMs);
      return () => clearTimeout(t);
    }

    // erasing
    if (display.length > 0) {
      const t = setTimeout(
        () => setDisplay(display.slice(0, -1)),
        eraseMs,
      );
      return () => clearTimeout(t);
    }
    setIdx((i) => (i + 1) % phrases.length);
    setPhase('typing');
  }, [phase, display, idx, phrases, paused, typeMs, eraseMs, holdMs]);

  return display;
}

// Title case formatter for display (does not mutate Firestore data)
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'via', 'vs']);
function toTitleCase(str: string): string {
  if (!str) return str;
  // Skip if already mixed case (not all-upper or all-lower)
  if (str !== str.toUpperCase() && str !== str.toLowerCase()) return str;
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i === 0 || !SMALL_WORDS.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

// LinkedIn URL detection helper
function isLinkedInUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?/.test(trimmed)) return true;
  if (/^(www\.)?linkedin\.com\/in\/[\w-]+\/?/.test(trimmed)) return true;
  if (/^\/in\/[\w-]+\/?$/.test(trimmed)) return true;
  return false;
}

// Normalize a LinkedIn URL to a fully-qualified https URL
function normalizeLinkedInUrl(input: string): string {
  let url = input.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.startsWith('linkedin.com') || url.startsWith('www.linkedin.com')) {
      url = `https://${url}`;
    } else if (url.startsWith('/in/')) {
      url = `https://linkedin.com${url}`;
    } else if (url.includes('linkedin') && url.includes('/in/')) {
      const match = url.match(/\/in\/[^\/\s]+/);
      if (match) url = `https://linkedin.com${match[0]}`;
    } else {
      url = `https://linkedin.com/in/${url}`;
    }
  }
  return url;
}


// Helper function for contact count guidance

// Stripe-style Tabs Component with animated underline
interface StripeTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

const StripeTabs: React.FC<StripeTabsProps> = ({ activeTab, onTabChange, tabs }) => {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // Update indicator position when active tab changes
  useLayoutEffect(() => {
    const activeIndex = tabs.findIndex(tab => tab.id === activeTab);
    const activeTabRef = tabRefs.current[activeIndex];

    if (activeTabRef) {
      const { offsetLeft, offsetWidth } = activeTabRef;
      setIndicatorStyle({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeTab, tabs]);

  return (
    <div className="relative">
      {/* Tab buttons */}
      <div className="flex items-center gap-8">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[index] = el; }}
            onClick={() => onTabChange(tab.id)}
            className={`
              relative pb-3 text-sm font-medium transition-colors duration-150
              focus:outline-none focus-visible:outline-none
              ${activeTab === tab.id
                ? 'text-[var(--accent, #4A60A8)]'
                : 'text-[#6B7280] hover:text-[#0F172A]'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Full-width divider line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#E2E8F0]" />

      {/* Animated underline indicator - sits on top of divider */}
      <div
        className="absolute bottom-0 h-[2px] bg-[var(--accent, #4A60A8)] transition-all duration-200 ease-out"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
      />
    </div>
  );
};

// Find People default batch size per tier (where the slider initially sits).
// Defaults sit at each tier's max so users get the full batch by default.
const PEOPLE_BATCH_DEFAULTS: Record<"free" | "pro" | "elite", number> = { free: 3, pro: 8, elite: 15 };

const ContactSearchPage: React.FC<{ embedded?: boolean; hideSubTabs?: boolean; parentEmailTemplate?: EmailTemplate | null; isDevPreview?: boolean }> = ({ embedded = false, hideSubTabs = false, parentEmailTemplate, isDevPreview = false }) => {
  const { user: authUser, checkCredits, updateCredits } = useFirebaseAuth();
  const user = isDevPreview ? DEV_MOCK_USER as any : authUser;
  const { openPanelWithSearchHelp } = useScout();
  const { demoSurface } = useTour();
  const peopleDemoActive = demoSurface === 'people';
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const effectiveUser = user || {
    credits: 0,
    maxCredits: 0,
    name: "User",
    email: "user@example.com",
    tier: "free" as "free" | "pro" | "elite",
  };
  // Trial-aware credit balance for display (daily pool during a trial).
  const creditsView = useCreditsView();

  const userTier: "free" | "pro" | "elite" = useMemo(() => {
    // Use the actual tier from the user object, default to "free"
    const tier = effectiveUser?.tier;
    if (tier === "pro" || tier === "elite") return tier;
    return "free";
  }, [effectiveUser?.tier]);

  // Outreach mode picked before running a search. Free lands on preview (its
  // only option), Pro and Elite land on draft. If the tier changes and the
  // current selection is no longer allowed, fall back to the tier default.
  const [outreachMode, setOutreachMode] = useState<OutreachMode>(() => getDefaultOutreachMode(userTier));
  useEffect(() => {
    if (!canUseOutreachMode(userTier, outreachMode)) {
      setOutreachMode(getDefaultOutreachMode(userTier));
    }
  }, [userTier, outreachMode]);

  // Hard confirm gate shown before any send (send is irreversible).
  const [showSendConfirm, setShowSendConfirm] = useState(false);

  // Per-draft send state for the inline Send button on reviewed drafts.
  // confirmSendDraftIdx: index in lastResults for which the confirm dialog is open.
  // sendingDraftIdx: index currently in-flight (drives loading state on the button).
  const [confirmSendDraftIdx, setConfirmSendDraftIdx] = useState<number | null>(null);
  const [sendingDraftIdx, setSendingDraftIdx] = useState<number | null>(null);

  async function handleSendReviewedDraft(idx: number) {
    const c = lastResults[idx];
    const draftId = c?.gmailDraftId;
    if (!draftId) {
      toast({ description: 'No draft ID on this contact.' });
      return;
    }
    setSendingDraftIdx(idx);
    try {
      const result = await apiService.sendDraft(draftId);
      // 410 (draft_not_found) means the draft was already sent — treat as success.
      const sent = result?.success || result?.error === 'draft_not_found';
      if (sent) {
        setLastResults((prev) => prev.map((row, i) => (i === idx ? { ...row, emailSent: true } : row)));
        toast({ description: 'Email sent.' });
      } else {
        toast({ description: result?.message || 'Send failed. Try Open in Gmail.' });
      }
    } catch (err: any) {
      console.error('[SendDraft] failed', err);
      toast({ description: err?.message || 'Send failed. Try Open in Gmail.' });
    } finally {
      setSendingDraftIdx(null);
      setConfirmSendDraftIdx(null);
    }
  }

  function isSearchResult(x: any): x is { contacts: any[]; successful_drafts?: number } {
    return x && Array.isArray(x.contacts);
  }

  const searchSuccessRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // Form state (prompt-based search).
  // Initial value may come from the landing-page hero: HeroSearchCTA stashes
  // the visitor's query in localStorage under `offerloop_pending_query` before
  // redirecting them into the sign-up flow. We consume it once on mount so
  // their first in-app experience is the exact search they asked for.
  const pendingAutoSearch = useRef(false);
  const [searchPrompt, setSearchPrompt] = useState(() => {
    try {
      const pending = typeof window !== 'undefined'
        ? window.localStorage.getItem('offerloop_pending_query')
        : null;
      if (pending) {
        window.localStorage.removeItem('offerloop_pending_query');
        return pending;
      }
    } catch {
      // Private mode / disabled storage — just fall through to empty
    }
    return "";
  });
  const [hoveredChipPrompt, setHoveredChipPrompt] = useState<string | null>(null);
  const [showTemplateTooltip, setShowTemplateTooltip] = useState(false);
  const templateTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCsvTooltip, setShowCsvTooltip] = useState(false);
  const csvTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [savedResumeUrl, setSavedResumeUrl] = useState<string | null>(null);
  const [savedResumeFileName, setSavedResumeFileName] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [currentFitContext, setCurrentFitContext] = useState<any>(null); // Track fit context for UI display

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  // Rotation seed — drives randomization in the right-rail recommendations so
  // users who click Network multiple times get fresh suggestions each pass.
  // Initialized to a random page-load value, incremented every search submission.
  const [rotationSeed, setRotationSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [progressValue, setProgressValue] = useState(0);
  const [searchComplete, setSearchComplete] = useState(false);
  const [lastResults, setLastResults] = useState<any[]>([]);
  const [expandedEmailIdx, setExpandedEmailIdx] = useState<number | null>(null);
  const [smartPlaceholder, setSmartPlaceholder] = useState<string | null>(null);
  const [alreadySavedResults, setAlreadySavedResults] = useState<any[]>([]);
  // Backend-provided message for unusual result shapes (e.g. "All N matching contact(s)
  // are already in your tracker..."). Prefer this over hardcoded frontend copy.
  const [resultMessage, setResultMessage] = useState<string>("");
  // Backend signals when its retry chain dropped filters to find matches. We
  // surface this honestly above the result list so the user knows the system
  // worked harder for them — and which constraints loosened — instead of
  // pretending the original specific query yielded those people.
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [searchBroadened, setSearchBroadened] = useState(false);
  const [lastSearchStats, setLastSearchStats] = useState<{
    successful_drafts: number;
    total_contacts: number;
  } | null>(null);

  // ── Tour demo state ──────────────────────────────────────────────────────
  // When the product tour reaches the Find People step it sets `demoSurface`
  // to 'people'. This effect runs a fully local demo: types the example query
  // into the prompt state, flashes a short "Searching…" hold, then seeds a
  // single inert card. Every state write here is to the same setters the real
  // search uses, so the visual matches a real result exactly — but no API
  // call is ever made. The cleanup return wipes every piece of demo residue
  // (query, results, searching flags, the landing-page handoff localStorage
  // key) so the page is bone-clean the moment the tour advances or aborts.
  const PEOPLE_DEMO_QUERY = 'founder of offerloop';
  // Three inert demo cards — the Offerloop founding team. Each carries
  // `demo: true`, which the per-card action handlers in the results map
  // (Copy email, etc.) already guard against, so all three render fully
  // styled but every action no-ops uniformly.
  const PEOPLE_DEMO_CARDS = [
    {
      demo: true as const,
      FirstName: 'Nick',
      LastName: 'Wittig',
      JobTitle: 'Cofounder',
      Company: 'Offerloop',
      Email: 'nickwittig@offerloop.ai',
      emailSubject: 'Coffee chat about Offerloop',
      emailBody:
        "Hi Nick,\n\nI came across Offerloop and love the take on AI-driven networking for students. I'd love to learn how you've thought about positioning the product for the college-recruiting use case.\n\nWould you be open to a 20-minute call next week?\n\nBest,\n[Your name]",
    },
    {
      demo: true as const,
      FirstName: 'Rylan',
      LastName: 'Bohnett',
      JobTitle: 'CMO',
      Company: 'Offerloop',
      Email: 'rylan@offerloop.ai',
      emailSubject: 'Quick question about Offerloop',
      emailBody:
        "Hi Rylan,\n\nI've been following Offerloop's launch and the storytelling stands out. I'd love to hear how you've thought about reaching college students at scale.\n\nWould you be open to a 20-minute call next week?\n\nBest,\n[Your name]",
    },
    {
      demo: true as const,
      FirstName: 'Deena',
      LastName: 'Bandi',
      JobTitle: 'CTO',
      Company: 'Offerloop',
      Email: 'deena@offerloop.ai',
      emailSubject: 'A quick chat about Offerloop',
      emailBody:
        "Hi Deena,\n\nOfferloop's product caught my eye — the agent layer over the contact graph feels novel. I'd love to learn how you've architected it for the scale you're seeing.\n\nWould you be open to a 20-minute call next week?\n\nBest,\n[Your name]",
    },
  ];

  useEffect(() => {
    if (!peopleDemoActive) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const TYPE_DELAY_MS = 32;
    const SEARCHING_HOLD_MS = 1500;
    const POST_TYPE_PAUSE_MS = 250;

    // Reset to a clean slate before the animation begins.
    setSearchPrompt('');
    setLastResults([]);
    setSearchComplete(false);
    setIsSearching(false);
    setProgressValue(0);

    // Type one character per tick into the real `searchPrompt` state. Safe
    // because nothing watches `searchPrompt` to fire a search.
    for (let i = 1; i <= PEOPLE_DEMO_QUERY.length; i++) {
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setSearchPrompt(PEOPLE_DEMO_QUERY.slice(0, i));
        }, i * TYPE_DELAY_MS),
      );
    }

    const typingDoneAt = PEOPLE_DEMO_QUERY.length * TYPE_DELAY_MS + POST_TYPE_PAUSE_MS;
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setIsSearching(true);
        setProgressValue(45);
      }, typingDoneAt),
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setIsSearching(false);
        setProgressValue(100);
        setLastResults(PEOPLE_DEMO_CARDS);
        setSearchComplete(true);
      }, typingDoneAt + SEARCHING_HOLD_MS),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setSearchPrompt('');
      setLastResults([]);
      setIsSearching(false);
      setSearchComplete(false);
      setProgressValue(0);
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('offerloop_pending_query');
        }
      } catch {
        // ignore — private mode / disabled storage
      }
    };
    // PEOPLE_DEMO_QUERY and PEOPLE_DEMO_CARDS are stable literals; only the
    // active flag drives this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleDemoActive]);
  const hasResults = lastResults.length > 0 || alreadySavedResults.length > 0;

  // Auto-scroll to success state after search completes
  useEffect(() => {
    if (hasResults && !isSearching && searchSuccessRef.current) {
      searchSuccessRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [hasResults, isSearching]);

  // Batch size state. Default sits at a tier-specific value (free 5, pro 10,
  // elite 20). For free, the default equals the max (5), so the slider sits at
  // its maximum. The clamp effect below keeps it within maxBatchSize.
  const userAdjustedBatchSize = useRef(false);
  const [batchSize, setBatchSize] = useState<number>(() => PEOPLE_BATCH_DEFAULTS[userTier]);

  // Flash effect on the quantity slider — vibrant blue while the user is
  // actively dragging, fades back to slate ~700ms after they stop. Each
  // onChange resets the timer so the bright state persists during a drag.
  const [sliderFlashing, setSliderFlashing] = useState(false);
  const sliderFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSlider = () => {
    setSliderFlashing(true);
    if (sliderFlashTimer.current) clearTimeout(sliderFlashTimer.current);
    sliderFlashTimer.current = setTimeout(() => setSliderFlashing(false), 700);
  };
  useEffect(() => () => {
    if (sliderFlashTimer.current) clearTimeout(sliderFlashTimer.current);
  }, []);

  // When the tier becomes known or changes and the user has not moved the
  // slider yet, snap the default to that tier's value.
  useEffect(() => {
    if (!userAdjustedBatchSize.current) {
      setBatchSize(PEOPLE_BATCH_DEFAULTS[userTier]);
    }
  }, [userTier]);

  // UI polish state
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false);

  // Typewriter rotating examples (types + deletes between rotations)
  const [typedText, setTypedText] = useState('');
  const [twIdx, setTwIdx] = useState(0);
  const [twPhase, setTwPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing');
  const [profileHints, setProfileHints] = useState<string[]>([]);
  // Strings worth offering as ghost-completion: explicit target firms, target
  // locations, target industries, extracted roles. Sourced from the user's profile
  // so completions feel like the system already knows them.
  const [profileCompletionTokens, setProfileCompletionTokens] = useState<string[]>([]);
  // Structured profile facts — used by QuickStarters to assemble click-to-fill
  // queries that match the user's actual targets. Mirrors the personalization
  // chips on the Profile page.
  const [profileFacts, setProfileFacts] = useState<{
    schoolShort?: string;
    schoolFull?: string;
    targetFirms?: string[];
    targetIndustries?: string[];
    preferredLocations?: string[];
    extractedRoles?: string[];
  }>({});
  const [inputFocused, setInputFocused] = useState(false);
  // Focus model is now strictly tied to inputFocused: recommendations show whenever
  // the user is NOT actively in the input. No manual override or outside-click handler.
  const [userSchoolShort, setUserSchoolShort] = useState<string | null>(null);
  const peopleFallbackPlaceholders = useMemo(() => getPeopleFallbackPlaceholders(userSchoolShort), [userSchoolShort]);
  const typedPlaceholder = useTypewriterCycle(peopleFallbackPlaceholders);

  useEffect(() => {
    if (!user?.uid) return;
    if (isDevPreview) {
      const school = getUniversityShortName((user as any)?.university);
      setUserSchoolShort(school);
      const hints: string[] = [];
      if (school) {
        hints.push(`${school} alumni in Data Science`);
        hints.push('Who\'s hiring for AI/ML?');
        hints.push(`${school} grads at McKinsey`);
      } else {
        hints.push('Alumni in Data Science');
        hints.push('Who\'s hiring for AI/ML?');
      }
      hints.push('Analysts in Los Angeles');
      hints.push('Try a company name, role, or school');
      setProfileHints(hints);
      return;
    }
    firebaseApi.getUserOnboardingData(user.uid).then((data) => {
      const uni = data.university || '';
      const shortUni = uni.replace(/^(University of |The )/, '').split(' - ')[0].split(',')[0].trim();
      setUserSchoolShort(getUniversityShortName(uni));
      const industries = data.targetIndustries || [];
      const locs = data.preferredLocations || [];
      const firms = data.targetFirms || [];
      const roles = data.extractedRoles || [];
      const hints: string[] = [];
      if (shortUni && industries[0]) hints.push(`${shortUni} alumni in ${industries[0]}`);
      if (industries[0]) hints.push(`Who's hiring for ${industries[0]}?`);
      if (shortUni && firms[0]) hints.push(`${shortUni} alumni at ${firms[0]}`);
      else if (shortUni) hints.push(`${shortUni} grads at McKinsey`);
      if (locs[0]) hints.push(`Analysts in ${locs[0]}`);
      hints.push("Paste a LinkedIn URL to import a contact");
      hints.push("Who do you want to meet today?");
      if (shortUni && firms[1]) hints.push(`${shortUni} alumni at ${firms[1]}`);
      else if (shortUni) hints.push(`${shortUni} alumni at Goldman Sachs`);
      hints.push("Try a company name, role, or school");
      if (hints.length > 0) setProfileHints(hints);

      // Build profile completion tokens — used to bias the ghost-text autocomplete
      // toward strings the user has already told us they care about.
      const tokens: string[] = [];
      for (const f of firms) if (typeof f === 'string') tokens.push(f);
      for (const l of locs) if (typeof l === 'string') tokens.push(l);
      for (const i of industries) if (typeof i === 'string') tokens.push(i);
      for (const r of roles) if (typeof r === 'string') tokens.push(r);
      if (uni) tokens.push(uni);
      if (shortUni) tokens.push(shortUni);
      setProfileCompletionTokens(tokens);

      // Structured profile facts for QuickStarters
      setProfileFacts({
        schoolShort: getUniversityShortName(uni) || shortUni,
        schoolFull: uni,
        targetFirms: firms,
        targetIndustries: industries,
        preferredLocations: locs,
        extractedRoles: roles,
      });
    }).catch(() => {});
  }, [user?.uid, isDevPreview]);

  // Typewriter examples — derived from profile hints, with fallback list
  const typewriterExamples = useMemo(() => {
    const filtered = profileHints.filter((h) =>
      !h.toLowerCase().startsWith('paste') &&
      !h.toLowerCase().startsWith('try a') &&
      !h.endsWith('?')
    );
    if (filtered.length > 0) return filtered;
    const fallback = [
      'Software engineers at Google',
      'Investment bankers in NYC',
      'Marketing managers in LA',
      'Data scientists at Meta',
      'Product managers at Stripe',
    ];
    if (userSchoolShort) fallback.unshift(`${userSchoolShort} alumni at Goldman Sachs`);
    return fallback;
  }, [profileHints, userSchoolShort]);

  useEffect(() => {
    if (inputFocused || searchPrompt) return;
    if (typewriterExamples.length === 0) return;
    const current = typewriterExamples[twIdx % typewriterExamples.length];
    if (twPhase === 'typing') {
      if (typedText.length < current.length) {
        const t = setTimeout(() => setTypedText(current.slice(0, typedText.length + 1)), 55);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setTwPhase('pausing'), 1400);
      return () => clearTimeout(t);
    }
    if (twPhase === 'pausing') {
      const t = setTimeout(() => setTwPhase('deleting'), 80);
      return () => clearTimeout(t);
    }
    if (twPhase === 'deleting') {
      if (typedText.length > 0) {
        const t = setTimeout(() => setTypedText(current.slice(0, typedText.length - 1)), 28);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => {
        setTwIdx((i) => (i + 1) % typewriterExamples.length);
        setTwPhase('typing');
      }, 200);
      return () => clearTimeout(t);
    }
  }, [twPhase, typedText, twIdx, typewriterExamples, inputFocused, searchPrompt]);

  // Typewriter shows when input is blurred + empty (greeting state). Once the
  // user focuses or types, it gets out of the way — the QuickStarters row
  // below the input takes over the "what could I try?" job.
  const showAnimatedPlaceholder = !searchPrompt;
  // Ghost-text autocomplete: predicts the rest of the word/phrase the user is typing
  // against the dimension lexicons. Tab or Right-arrow (when cursor at end) accepts.
  const ghostCompletion = useMemo(
    () => findCompletion(searchPrompt, profileCompletionTokens),
    [searchPrompt, profileCompletionTokens],
  );

  // Hover preview from the right-column suggestion popovers. When set, the prompt
  // overlay renders the previewed swap (highlighted) without modifying searchPrompt.
  // Click on a suggestion commits via onAcceptSuggestion (existing path).
  const [previewSwap, setPreviewSwap] = useState<{ matched: string; chosen: string } | null>(null);
  const previewedPrompt = useMemo(() => {
    if (!previewSwap) return null;
    const escaped = previewSwap.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    const match = regex.exec(searchPrompt);
    if (!match) return null;
    const before = searchPrompt.slice(0, match.index);
    const after = searchPrompt.slice(match.index + match[0].length);
    return { before, replacement: previewSwap.chosen.toLowerCase(), after };
  }, [previewSwap, searchPrompt]);

  const maxBatchSize = useMemo(() => {
    const tierMax = userTier === 'free' ? 3 : userTier === 'pro' ? 8 : 15;
    const creditMax = Math.floor(creditsView.balance / 5);
    return Math.min(tierMax, creditMax);
  }, [userTier, creditsView.balance]);

  useEffect(() => {
    if (batchSize > maxBatchSize) {
      setBatchSize(Math.max(1, maxBatchSize));
    }
  }, [maxBatchSize, batchSize]);

  // Gmail state
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailBannerDismissed, setGmailBannerDismissed] = useState(() => {
    try { return localStorage.getItem('offerloop-gmail-banner-dismissed') === 'true'; } catch { return false; }
  });
  const dismissGmailBanner = () => {
    setGmailBannerDismissed(true);
    try { localStorage.setItem('offerloop-gmail-banner-dismissed', 'true'); } catch {}
  };

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("contact-search");
  const [showEliteGate, setShowEliteGate] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const isElite = user?.tier === "elite";

  // LinkedIn Import state
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [linkedInError, setLinkedInError] = useState<string | null>(null);
  const [linkedInSuccess, setLinkedInSuccess] = useState<string | null>(null);
  const [linkedInLastDraftUrl, setLinkedInLastDraftUrl] = useState<string | null>(null);

  // Email template state (saved default + session override)
  const [savedEmailTemplate, setSavedEmailTemplate] = useState<EmailTemplate | null>(null);
  const [sessionEmailTemplate, setSessionEmailTemplate] = useState<EmailTemplate | null>(null);
  const activeEmailTemplate = parentEmailTemplate ?? sessionEmailTemplate ?? savedEmailTemplate;

  // Fallback to 'free' config if tier not found (safety for new tiers)
  const currentTierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free;

  // Sync activeTab from URL ?tab= (for product tour)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'linkedin-email') {
      setActiveTab('contact-search');
    } else if (tabParam === 'contact-search' || tabParam === 'contact-library' || tabParam === 'import') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Read URL parameters (e.g., from "View Contacts" in Firm Library, suggestion cards)
  useEffect(() => {
    const companyParam = searchParams.get('company');
    const locationParam = searchParams.get('location');
    const roleParam = searchParams.get('role');

    if (companyParam || locationParam || roleParam) {
      const parts = [];
      if (roleParam) parts.push(roleParam);
      if (companyParam) parts.push(`at ${companyParam}`);
      if (locationParam) parts.push(`in ${locationParam}`);
      setSearchPrompt(parts.join(' ') || '');
      pendingAutoSearch.current = true;

      setSearchParams({}, { replace: true });
    }
  }, [searchParams]); // React to param changes from suggestion cards and other navigations

  // Auto-trigger search when pre-filled from URL params (e.g. job board "Find Contact")
  useEffect(() => {
    if (pendingAutoSearch.current && searchPrompt.trim() && user) {
      pendingAutoSearch.current = false;
      handleSearch();
    }
  }, [searchPrompt, user]);

  // Load saved email template on mount (contact search tab)
  useEffect(() => {
    if (!user?.uid || isDevPreview) return;
    apiService.getEmailTemplate().then((t) => {
      setSavedEmailTemplate({
        purpose: t.purpose ?? null,
        stylePreset: t.stylePreset ?? null,
        customInstructions: t.customInstructions ?? "",
        name: t.name,
        subject: t.subject,
        savedTemplateId: t.savedTemplateId,
      });
    }).catch(() => {});
  }, [user?.uid]);

  // When returning from Email Templates page with "Apply to this search", apply the template and clear state
  useEffect(() => {
    const state = (routerLocation.state as { appliedEmailTemplate?: EmailTemplate } | undefined)?.appliedEmailTemplate;
    if (state) {
      setSessionEmailTemplate(state);
      try {
        sessionStorage.removeItem("offerloop_applied_email_template");
      } catch {
        // ignore
      }
      navigate("/find", { replace: true, state: {} });
      return;
    }
    // Fallback: template may have been stored in sessionStorage if navigation state was lost
    try {
      const raw = sessionStorage.getItem("offerloop_applied_email_template");
      if (raw) {
        const parsed = JSON.parse(raw) as EmailTemplate;
        if (parsed && (parsed.purpose != null || parsed.stylePreset != null || (parsed.customInstructions && parsed.customInstructions.trim()))) {
          setSessionEmailTemplate(parsed);
        }
        sessionStorage.removeItem("offerloop_applied_email_template");
      }
    } catch {
      // ignore
    }
  }, [routerLocation.state]);

  // Handle Scout auto-populate from failed search, chat "Take me there", or navigation state
  useEffect(() => {
    const applyPopulate = (
      populateData: {
        job_title?: string;
        company?: string;
        location?: string;
        prompt?: string;
        autoSubmit?: boolean;
      },
    ) => {
      // Prompt-mode: refined-prompt cards from Scout's failed-search panel
      // pass the full natural-language prompt directly. Skip the structured
      // assembly path and just drop the prompt in. autoSubmit re-runs the
      // search immediately so the user sees fresh results without a second
      // click.
      if (populateData.prompt && populateData.prompt.trim()) {
        setSearchPrompt(populateData.prompt.trim());
        if (populateData.autoSubmit) {
          pendingAutoSearch.current = true;
        } else {
          toast({
            title: "Search pre-filled",
            description: "Scout has filled in your search. Click Search to find contacts.",
          });
        }
        return;
      }

      const { job_title, company: autoCompany, location: autoLocation } = populateData;
      const parts = [];
      if (job_title != null && job_title !== '') parts.push(job_title);
      if (autoCompany != null && autoCompany !== '') parts.push(`at ${autoCompany}`);
      if (autoLocation != null && autoLocation !== '') parts.push(`in ${autoLocation}`);
      if (parts.length) {
        setSearchPrompt(parts.join(' '));
        toast({
          title: "Search pre-filled",
          description: "Scout has filled in your search. Click Search to find contacts.",
        });
      }
    };

    const handleAutoPopulate = () => {
      try {
        // Prefer navigation state (set when clicking "Take me there" from Scout panel)
        const stateData = (routerLocation.state as { scoutAutoPopulate?: { search_type?: string; job_title?: string; company?: string; location?: string } } | undefined)?.scoutAutoPopulate;
        if (stateData?.search_type === 'contact') {
          applyPopulate(stateData);
          sessionStorage.removeItem(SCOUT_AUTO_POPULATE_KEY);
          navigate(routerLocation.pathname, { replace: true, state: {} });
          return;
        }

        const stored = sessionStorage.getItem(SCOUT_AUTO_POPULATE_KEY);
        if (stored) {
          const data = JSON.parse(stored);

          // Handle both formats: search help format (nested) and chat format (flat)
          let populateData: { job_title?: string; company?: string; location?: string };
          if (data.search_type === 'contact') {
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

  // Helper function to trigger Scout on 0 results. Forwards the parsed query +
  // retry-chain context so the backend can generate concrete refined prompts
  // ("try Mediobanca instead — Bocconi pipeline") rather than generic title
  // alternatives. The extra signals are optional; the backend falls through to
  // the legacy structured path if any are missing.
  //
  // Critical: we ALSO pass `tried_prompts` — the list of prompts that have
  // already failed in this session — so Scout doesn't recommend a refined
  // prompt the user just clicked through and bombed on. The LLM is instructed
  // to never suggest one of these. List is rolling, 24h, 30 most recent.
  const triggerScoutForNoResults = useCallback(
    (extra?: {
      parsedQuery?: any;
      retryLevel?: number;
      broadenedDimensions?: string[];
    }) => {
      let triedPrompts: string[] = [];
      try {
        const stored = JSON.parse(
          localStorage.getItem('ofl_tried_prompts') || '{}',
        ) as Record<string, number>;
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        triedPrompts = Object.entries(stored)
          .filter(([, ts]) => ts >= cutoff)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([p]) => p);
      } catch {
        // Non-fatal — localStorage may be disabled.
      }
      openPanelWithSearchHelp({
        searchType: 'contact',
        failedSearchParams: {
          prompt: searchPrompt.trim(),
          parsed_query: extra?.parsedQuery,
          retry_level_used: extra?.retryLevel,
          broadened_dimensions: extra?.broadenedDimensions,
          tried_prompts: triedPrompts,
        },
        errorType: 'no_results',
      });
    },
    [openPanelWithSearchHelp, searchPrompt],
  );

  // Helper functions
  const stripUndefined = <T extends Record<string, any>>(obj: T) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

  // Memoize getUserProfileData to avoid recreating on every render
  const getUserProfileData = useCallback(async () => {
    if (!user) return null;
    try {
      if (user?.uid) {
        const professionalInfo = await firebaseApi.getProfessionalInfo(user.uid);
        if (professionalInfo) {
          return {
            name: `${professionalInfo.firstName || ""} ${professionalInfo.lastName || ""}`.trim() || user.name || "",
            university: professionalInfo.university || "",
            major: professionalInfo.fieldOfStudy || "",
            year: professionalInfo.graduationYear || "",
            graduationYear: professionalInfo.graduationYear || "",
            degree: professionalInfo.currentDegree || "",
            careerInterests: professionalInfo.targetIndustries || [],
          };
        }
      }
      const professionalInfo = localStorage.getItem("professionalInfo");
      const resumeData = localStorage.getItem("resumeData");
      const prof = professionalInfo ? JSON.parse(professionalInfo) : {};
      const resume = resumeData ? JSON.parse(resumeData) : {};
      return {
        name: `${(prof.firstName || "")} ${(prof.lastName || "")}`.trim() || resume.name || user.name || "",
        university: prof.university || resume.university || "",
        major: prof.fieldOfStudy || resume.major || "",
        year: prof.graduationYear || resume.year || "",
        graduationYear: prof.graduationYear || resume.year || "",
        degree: prof.currentDegree || resume.degree || "",
        careerInterests: prof.targetIndustries || [],
      };
    } catch {
      return null;
    }
  }, [user]);

  const autoSaveToDirectory = async (contacts: any[], searchLocation?: string) => {
    if (!user) return;
    try {
      const today = new Date().toLocaleDateString('en-US');
      const mapped: Omit<ContactApi, 'id'>[] = contacts.map((c: any) => {
        const derivedLocation = [c.City ?? '', c.State ?? ''].filter(Boolean).join(', ') || c.location || searchLocation || '';
        const mappedContact = stripUndefined({
          firstName: c.FirstName ?? c.firstName ?? '',
          lastName: c.LastName ?? c.lastName ?? '',
          linkedinUrl: c.LinkedIn ?? c.linkedinUrl ?? '',
          email: c.Email ?? c.email ?? '',
          company: c.Company ?? c.company ?? '',
          jobTitle: c.Title ?? c.jobTitle ?? '',
          college: c.College ?? c.college ?? '',
          location: derivedLocation,
          firstContactDate: today,
          status: 'Not Contacted',
          lastContactDate: today,
          emailSubject: c.email_subject ?? c.emailSubject ?? undefined,
          emailBody: c.email_body ?? c.emailBody ?? undefined,
          gmailThreadId: c.gmailThreadId ?? c.gmail_thread_id ?? undefined,
          gmailMessageId: c.gmailMessageId ?? c.gmail_message_id ?? undefined,
          gmailDraftId: c.gmailDraftId ?? c.gmail_draft_id ?? undefined,
          gmailDraftUrl: c.gmailDraftUrl ?? c.gmail_draft_url ?? undefined,
          hasUnreadReply: false,
          notificationsMuted: false,
          warmthScore: c.warmth_score ?? undefined,
          warmthTier: c.warmth_tier ?? undefined,
          warmthSignals: c.warmth_signals ?? undefined,
          personalizationLabel: c.personalization?.label ?? undefined,
          personalizationType: c.personalization?.commonality_type ?? undefined,
          briefing: c.briefing ?? undefined,
        });

        // DEBUG: Log first mapped contact to see email fields
        if (contacts.indexOf(c) === 0) {
          console.log('[DEBUG] autoSaveToDirectory - Original contact:', {
            emailSubject: c.emailSubject || c.email_subject || 'MISSING',
            emailBody: c.emailBody || c.email_body ? `${(c.emailBody || c.email_body).substring(0, 100)}...` : 'MISSING',
            allKeys: Object.keys(c).filter(k => k.toLowerCase().includes('email')),
          });
          console.log('[DEBUG] autoSaveToDirectory - Mapped contact:', {
            emailSubject: mappedContact.emailSubject || 'MISSING',
            emailBody: mappedContact.emailBody ? `${mappedContact.emailBody.substring(0, 100)}...` : 'MISSING',
          });
        }

        return mappedContact;
      });
      await firebaseApi.bulkCreateContacts(user.uid, mapped);
    } catch (error) {
      const isDev = import.meta.env.DEV;
      if (isDev) console.error('Error in autoSaveToDirectory:', error);
      throw error;
    }
  };

  const checkNeedsGmailConnection = async (): Promise<boolean> => {
    try {
      if (!user) return false;
      const data = await apiService.gmailStatus();
      return !data.connected;
    } catch (error) {
      const isDev = import.meta.env.DEV;
      if (isDev) console.error("Error checking Gmail status:", error);
      return false; // Don't show banner if we can't determine status
    }
  };

  const initiateGmailOAuth = async () => {
    try {
      const authUrl = await apiService.startGmailOAuth();
      if (authUrl) {
        sessionStorage.setItem('gmail_oauth_return', window.location.pathname);
        window.location.href = authUrl;
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error("Error initiating Gmail OAuth:", error);
    }
  };


  // Check Gmail status on mount
  useEffect(() => {
    const checkGmailStatus = async () => {
      if (!user) return;
      try {
        const connected = await checkNeedsGmailConnection();
        setGmailConnected(!connected);
      } catch {
        setGmailConnected(false);
      }
    };
    checkGmailStatus();
  }, [user]);

  // Check for fit context on mount (from Scout)
  useEffect(() => {
    try {
      const storedContext = localStorage.getItem('scout_fit_context');
      if (storedContext) {
        const fitContext = JSON.parse(storedContext);
        setCurrentFitContext(fitContext);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  // Scout job title suggestion handler (sets prompt from role/company/location)
  const handleJobTitleSuggestion = (title: string, company?: string, location?: string) => {
    const parts = [title];
    if (company) parts.push(`at ${company}`);
    if (location) parts.push(`in ${location}`);
    setSearchPrompt(parts.join(' '));
  };

  // Clear fit context when user manually edits search (handled on explicit Clear or after search)
  useEffect(() => {
    // Fit context will be cleared after email generation completes or on Clear
  }, [searchPrompt]);

  // Load saved resume from Firestore
  const loadSavedResume = useCallback(async () => {
    if (!user?.uid || isDevPreview) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        const resumeUrl = data.resumeUrl || null;
        const resumeFileName = data.resumeFileName || null;
        setSavedResumeUrl(resumeUrl);
        setSavedResumeFileName(resumeFileName);
        // If we have a saved resume, we can optionally load it as uploadedFile for search
        // But we'll keep uploadedFile separate for the current search session
      }
    } catch (error) {
      console.error('Failed to load saved resume:', error);
    }
  }, [user?.uid]);

  // Load resume on mount
  useEffect(() => {
    loadSavedResume();
  }, [loadSavedResume]);

  // Save resume to account settings (Firestore)
  const saveResumeToAccountSettings = async (file: File) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    setIsUploadingResume(true);
    try {
      // 1) Parse resume via backend
      const formData = new FormData();
      formData.append('resume', file);

      const API_URL = BACKEND_URL;

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const response = await fetch(`${API_URL}/api/parse-resume`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse resume');
      }

      // 2) Upload the PDF to Firebase Storage
      const ts = Date.now();
      const storagePath = `resumes/${user.uid}/${ts}-${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);

      // 3) Get download URL and write to Firestore
      const downloadUrl = await getDownloadURL(storageRef);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: file.name,
        resumeUpdatedAt: new Date().toISOString(),
        resumeParsed: {
          name: result.data.name || '',
          university: result.data.university || '',
          major: result.data.major || '',
          year: result.data.year || '',
        },
      });

      // 4) Update local state
      setSavedResumeUrl(downloadUrl);
      setSavedResumeFileName(file.name);
      setUploadedFile(file);

      toast({
        title: "Resume saved",
        description: "Your resume has been uploaded and saved to your account.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save resume';
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsUploadingResume(false);
    }
  };

  // File upload handler (click)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isValidResumeFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, DOCX, or DOC file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      await saveResumeToAccountSettings(file);
    } catch (error) {
      // Error already handled in saveResumeToAccountSettings
    }

    // Reset input
    event.target.value = '';
  };


  // LinkedIn Import handler
  const handleLinkedInImport = async (urlOverride?: string) => {
    const rawUrl = urlOverride || linkedInUrl;
    if (!rawUrl.trim()) return;

    // Normalize LinkedIn URL (accepts URLs with or without protocol)
    let normalizedUrl = rawUrl.trim();

    // If it doesn't start with http, try to normalize it
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      // If it starts with linkedin.com or www.linkedin.com, add https://
      if (normalizedUrl.startsWith('linkedin.com') || normalizedUrl.startsWith('www.linkedin.com')) {
        normalizedUrl = `https://${normalizedUrl}`;
      } else if (normalizedUrl.startsWith('/in/')) {
        // If it's just a path like /in/username, add the full domain
        normalizedUrl = `https://linkedin.com${normalizedUrl}`;
      } else if (normalizedUrl.includes('linkedin') && normalizedUrl.includes('/in/')) {
        // Extract the /in/username part and rebuild
        const match = normalizedUrl.match(/\/in\/[^\/\s]+/);
        if (match) {
          normalizedUrl = `https://linkedin.com${match[0]}`;
        }
      } else {
        // Otherwise, assume it's just a username and add the full path
        normalizedUrl = `https://linkedin.com/in/${normalizedUrl}`;
      }
    }

    // Validate the normalized URL format
    const linkedInRegex = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/;
    if (!linkedInRegex.test(normalizedUrl)) {
      setLinkedInError('Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/username)');
      return;
    }

    if (!user?.uid) {
      setLinkedInError('Please sign in to import contacts');
      return;
    }

    setLinkedInLoading(true);
    setLinkedInError(null);
    setLinkedInSuccess(null);
    setLinkedInLastDraftUrl(null);

    try {
      // Get user resume text from Firestore
      let userResumeText = '';
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.resumeText) {
            userResumeText = data.resumeText;
          } else if (data.resumeParsed) {
            userResumeText = JSON.stringify(data.resumeParsed);
          }
        }
      } catch (error) {
        console.error('Failed to load resume:', error);
      }

      // Get Firebase auth token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error('User not authenticated');
      }
      const idToken = await firebaseUser.getIdToken();

      const API_BASE = BACKEND_URL;

      const response = await fetch(`${API_BASE}/api/contacts/import-linkedin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          linkedin_url: normalizedUrl, // Use normalized URL
          user_id: user.uid,
          user_resume: userResumeText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to import contact');
      }

      if (data.status === 'ok') {
        const c = data.contact || {};
        // Build a card in the same shape the Find People results render, then
        // route it through the unified results display (lastResults) so the
        // imported person gets the same card + action buttons (Open Gmail
        // drafts / Tracker / View in Spreadsheet) as a normal search.
        const cardContact = {
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          FirstName: c.firstName || '',
          LastName: c.lastName || '',
          Title: c.jobTitle || '',
          jobTitle: c.jobTitle || '',
          Company: c.company || '',
          company: c.company || '',
          Email: c.email || '',
          email: c.email || '',
          LinkedIn: c.linkedinUrl || c.linkedin_url || normalizedUrl,
          linkedinUrl: c.linkedinUrl || c.linkedin_url || normalizedUrl,
          emailSubject: c.emailSubject || '',
          emailBody: c.emailBody || '',
          gmailDraftUrl: c.gmailDraftUrl || data.gmail_draft_url || '',
          warmth_label: c.warmth_label || '',
          warmth_tier: c.warmth_tier || '',
          warmth_signals: c.warmth_signals || [],
        };

        setLinkedInSuccess(null);        // don't show the old success banner
        setLinkedInLastDraftUrl(null);
        setLastResults([cardContact]);
        setAlreadySavedResults([]);
        setResultMessage('');
        setSearchSuggestions([]);
        setSearchBroadened(false);
        setSearchComplete(true);
        setLinkedInUrl('');               // clear the input field
        setSearchPrompt('');

        // Update credits if provided
        if (data.credits_remaining !== undefined && updateCredits) {
          await updateCredits(data.credits_remaining);
        }

        // Show appropriate toast based on what was accomplished
        const emailFound = data.email_found !== false; // Default to true if not specified
        const draftCreated = data.draft_created === true;

        let toastDescription = `${c.full_name || 'Contact'} added to your contacts`;
        if (draftCreated) {
          toastDescription += ' with a draft email.';
        } else if (!emailFound) {
          toastDescription += '. No email address was found - you can add one manually later.';
        } else {
          toastDescription += ', but the email draft could not be created.';
        }

        toast({
          title: "Contact Imported!",
          description: toastDescription,
        });
      } else {
        setLinkedInError(data.message || 'Failed to import contact');
      }
    } catch (error: any) {
      console.error('LinkedIn import error:', error);
      setLinkedInError(error.message || 'An error occurred while importing. Please try again.');
    } finally {
      setLinkedInLoading(false);
    }
  };

  // Search handler (prompt-based, single flow for all tiers)
  const handleSearch = async (confirmedSend = false) => {
    // Hard short-circuit while the tour's demo is active on this surface.
    // Catches every trigger path — form submit, button click, the
    // pendingAutoSearch chip path — with a single guard. No API call fires.
    if (peopleDemoActive) return;

    if (!searchPrompt.trim()) {
      toast({
        title: "Enter a search",
        description: "Describe who you want to connect with (e.g. role, company, location).",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to search for contacts.",
        variant: "destructive",
      });
      navigate("/signin");
      return;
    }

    // Send is irreversible: gate it behind the hard confirm dialog. The dialog's
    // confirm handler re-invokes handleSearch(true) to actually run the send.
    if (outreachMode === "send" && !confirmedSend) {
      setShowSendConfirm(true);
      return;
    }

    setIsSearching(true);
    setProgressValue(10);
    setSearchComplete(false);
    // Rotate the recommendation seed so users who run multiple searches get
    // different sub-rail suggestions each time (anchors stay stable).
    setRotationSeed((s) => s + 1);
    setResultMessage("");
    setSearchSuggestions([]);
    setSearchBroadened(false);

    let progressInterval: NodeJS.Timeout | null = null;
    let searchSucceeded = false;
    const startProgressSimulation = () => {
      let currentProgress = 10;
      progressInterval = setInterval(() => {
        if (currentProgress < 85) {
          currentProgress += Math.random() * 5 + 2;
          currentProgress = Math.min(currentProgress, 85);
          setProgressValue(Math.floor(currentProgress));
        }
      }, 500);
    };

    try {
      startProgressSimulation();

      const [userProfile, currentCredits] = await Promise.all([
        getUserProfileData(),
        checkCredits ? checkCredits() : Promise.resolve(effectiveUser.credits ?? 0)
      ]);
      setProgressValue(20);

      if (currentCredits < 5) {
        if (progressInterval) clearInterval(progressInterval);
        setIsSearching(false);
        setProgressValue(0);
        toast({
          title: "Insufficient Credits",
          description: `You have ${currentCredits} credits. You need at least 10 credits to search.`,
          variant: "destructive",
        });
        return;
      }

      setProgressValue(40);
      // Expand school acronyms before sending to PDL so "USC" → "University of Southern
      // California". The frontend chip continues displaying the short label; only the
      // backend payload is rewritten so PDL's school matcher hits the right institution.
      const expandedPrompt = expandQueryForBackend(searchPrompt.trim());
      // Mode reached here is already authorized: preview/draft run directly, and
      // send only arrives after the hard confirm dialog (confirmedSend=true).
      const result = await apiService.runPromptSearch({ prompt: expandedPrompt, batchSize, emailTemplate: activeEmailTemplate, mode: outreachMode });

      if (!isSearchResult(result)) {
        if (progressInterval) clearInterval(progressInterval);
        setIsSearching(false);
        setProgressValue(0);
        const errMsg = (result as any)?.error || "Please try again.";
        if ((result as any)?.error?.toLowerCase().includes("insufficient")) {
          if (checkCredits) await checkCredits();
        }
        trackError('contact_search', 'search', 'api_error', errMsg);
        toast({
          title: "Search Failed",
          description: errMsg,
          variant: "destructive",
        });
        return;
      }

      if (progressInterval) clearInterval(progressInterval);
      setProgressValue(90);

      const creditsUsed = (result as any)?.credits_used ?? result.contacts.length * 5;
      if ((result as any)?.credits_remaining !== undefined && updateCredits) {
        await updateCredits((result as any).credits_remaining).catch(() => {});
      } else if (updateCredits) {
        const newCredits = Math.max(0, currentCredits - creditsUsed);
        await updateCredits(newCredits).catch(() => {});
      }
      setProgressValue(100);
      const alreadySavedFromServer = (result as any)?.already_saved_contacts || [];
      const backendMessage = (result as any)?.message || "";
      const broadenedDims: string[] = Array.isArray((result as any)?.broadened_dimensions)
        ? (result as any).broadened_dimensions
        : [];
      setLastResults(result.contacts);
      setAlreadySavedResults(alreadySavedFromServer);
      setResultMessage(backendMessage);

      // Append every completed search to a rolling localStorage list so Scout's
      // chat can reference "you searched for X yesterday and got 5 results"
      // across reloads / new tabs / new devices. Capped at 30 entries; older
      // ones FIFO-evict.
      try {
        const trimmedPrompt = searchPrompt.trim();
        if (trimmedPrompt) {
          const prior = JSON.parse(
            localStorage.getItem('ofl_recent_searches') || '[]',
          ) as Array<{ prompt: string; results: number; ts: number }>;
          const arr = Array.isArray(prior) ? prior : [];
          arr.unshift({
            prompt: trimmedPrompt,
            results: result.contacts?.length || 0,
            ts: Date.now(),
          });
          // De-dup by prompt — keep the most recent occurrence only.
          const seen = new Set<string>();
          const deduped = arr.filter((e) => {
            const k = e.prompt.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          localStorage.setItem(
            'ofl_recent_searches',
            JSON.stringify(deduped.slice(0, 30)),
          );
        }
      } catch {
        // Non-fatal — localStorage may be disabled.
      }

      // Track empty-result (school, company) pairs in localStorage so the
      // right rail can deprioritize firms we already know are thin for the
      // user's school (e.g. Bocconi × Morgan Stanley). We only persist when
      // the retry chain bottomed out at level >= 4 — meaning even after
      // dropping the company filter we still found no new alumni in the
      // role family. That's the strongest signal the firm × school combo
      // is unreachable via PDL.
      try {
        const retryLevel = Number((result as any)?.retry_level_used ?? 0);
        const newCountAfter = result.contacts?.length || 0;
        const parsedFromServer = (result as any)?.parsed_query || {};
        const companies: any[] = parsedFromServer?.companies || [];
        const firstCompanyName: string =
          (companies?.[0]?.name as string | undefined)?.trim().toLowerCase() || '';
        // School is taken from the user's profile (the rail uses the same).
        const userSchool: string =
          (profileFacts?.schoolFull || profileFacts?.schoolShort || '')
            .trim()
            .toLowerCase();
        if (
          newCountAfter === 0 &&
          retryLevel >= 4 &&
          userSchool &&
          firstCompanyName
        ) {
          const key = `${userSchool}|${firstCompanyName}`;
          const existing = JSON.parse(
            localStorage.getItem('ofl_thin_pairs') || '{}',
          ) as Record<string, number>;
          existing[key] = Date.now();
          const entries = Object.entries(existing).sort((a, b) => b[1] - a[1]);
          const trimmed = Object.fromEntries(entries.slice(0, 100));
          localStorage.setItem('ofl_thin_pairs', JSON.stringify(trimmed));
        }
      } catch {
        // Non-fatal — localStorage may be disabled in private browsing.
      }
      setSearchSuggestions((result as any)?.suggestions || []);
      setSearchBroadened((result as any)?.search_broadened || false);

      // Open Scout with refined-prompt suggestions in two cases:
      //   - genuine zero results (nothing to surface)
      //   - all matches already saved AND the chain had to broaden (retry >= 2,
      //     i.e. title/industry got dropped) — that's the "I want fresh contacts
      //     and the system gave me what it could" moment where suggestions
      //     genuinely help.
      const retryLevelFromServer = Number((result as any)?.retry_level_used ?? 0);
      const allHitsAlreadySaved =
        result.contacts.length === 0 && alreadySavedFromServer.length > 0;
      const isZeroResults =
        result.contacts.length === 0 && alreadySavedFromServer.length === 0;
      const shouldOfferRefinement =
        isZeroResults || (allHitsAlreadySaved && retryLevelFromServer >= 2);

      // Stamp the prompt as "tried and failed" before opening Scout, so the
      // very same suggestion can't bounce back at the user on the next pass.
      // Persists to localStorage with a 24h TTL; trimmed to 30 entries.
      if (isZeroResults) {
        try {
          const promptKey = searchPrompt.trim().toLowerCase();
          if (promptKey) {
            const existing = JSON.parse(
              localStorage.getItem('ofl_tried_prompts') || '{}',
            ) as Record<string, number>;
            existing[promptKey] = Date.now();
            const entries = Object.entries(existing).sort((a, b) => b[1] - a[1]);
            const trimmed = Object.fromEntries(entries.slice(0, 30));
            localStorage.setItem('ofl_tried_prompts', JSON.stringify(trimmed));
          }
        } catch {
          // Non-fatal — localStorage may be disabled.
        }
      }

      if (shouldOfferRefinement) {
        triggerScoutForNoResults({
          parsedQuery: (result as any)?.parsed_query,
          retryLevel: retryLevelFromServer,
          broadenedDimensions: broadenedDims,
        });
        setSearchComplete(true);
      }

      trackFeatureActionCompleted('contact_search', 'search', true, {
        results_count: result.contacts.length,
        credits_spent: creditsUsed,
      });

      if (user?.uid && result.contacts.length > 0) {
        try {
          const summary = generateContactSearchSummary({
            jobTitle: searchPrompt.trim().slice(0, 80),
            contactCount: result.contacts.length,
          });
          await logActivity(user.uid, 'contactSearch', summary, {
            prompt: searchPrompt.trim(),
            contactCount: result.contacts.length,
            tier: userTier,
          });
        } catch (error) {
          const isDev = import.meta.env.DEV;
          if (isDev) console.error('Failed to log contact search activity:', error);
        }
      }

      // Backend already saves contacts to Firestore (runs.py save loop) — no frontend save needed

      setLastSearchStats({
        successful_drafts: 0,
        total_contacts: result.contacts.length + ((result as any)?.already_saved_contacts?.length || 0),
      });
      setSearchComplete(true);
      searchSucceeded = true;

      const savedCount = alreadySavedFromServer.length;
      const newCount = result.contacts.length;
      if (newCount === 0 && savedCount === 0) {
        // Genuine no-results — Scout panel already opened above; a short toast
        // confirms the outcome without claiming "Contacts Found!".
        toast({
          title: "No matching contacts found",
          description: backendMessage || "Try broadening your search.",
          duration: 5000,
        });
      } else if (newCount === 0 && savedCount > 0) {
        // All matches already saved. Use the backend's exact message so the UI
        // copy matches what the API contract promises (and gives the user a
        // specific next step: open them in the network or broaden the search).
        toast({
          title: "Already in your inbox",
          description: backendMessage
            || `All ${savedCount} matching contact(s) are already in your inbox. Open them in your network, or broaden your search to find new people.`,
          duration: 7000,
        });
      } else if ((result as any)?.mode === "send") {
        // Send mode: confirm what went out and what got routed to drafts by
        // the backend guardrails (quality gate + daily cap).
        const sentCount = Number((result as any)?.successful_sends ?? 0);
        const draftedFallback = Number((result as any)?.successful_drafts ?? 0);
        const qualityBlocked = Number((result as any)?.send_blocked_by_quality ?? 0);
        const capBlocked = Number((result as any)?.send_blocked_by_daily_cap ?? 0);
        const fallbackBits: string[] = [];
        if (qualityBlocked > 0) {
          fallbackBits.push(
            `${qualityBlocked} needed your eyes (now in Gmail drafts)`
          );
        }
        if (capBlocked > 0) {
          fallbackBits.push(
            `${capBlocked} hit your daily send cap (now in Gmail drafts)`
          );
        }
        const fallbackLine = fallbackBits.length > 0
          ? ` ${fallbackBits.join(", ")}.`
          : draftedFallback > 0
            ? ` ${draftedFallback} routed to Gmail drafts.`
            : "";
        toast({
          title: sentCount > 0 ? "Emails sent" : draftedFallback > 0 ? "Routed to drafts" : "Contacts Found!",
          description: sentCount > 0
            ? `Sent ${sentCount} ${sentCount === 1 ? "email" : "emails"}.${fallbackLine} Track replies in your Inbox.`
            : draftedFallback > 0
              ? `No sends went out.${fallbackLine} Review and send from Gmail.`
              : `Found ${newCount} contacts, but no emails could be sent. Check your Gmail connection.`,
          duration: 7000,
        });
      } else {
        toast({
          title: "Contacts Found!",
          description: savedCount > 0
            ? `Found ${newCount + savedCount} contacts (${newCount} new, ${savedCount} already saved) — view in your Inbox.`
            : `Found ${newCount} contacts — view them in your Inbox to start outreach.`,
          duration: 5000,
        });
      }
    } catch (error: any) {
      // Clear progress interval on error
      if (progressInterval) clearInterval(progressInterval);
      const isDev = import.meta.env.DEV;
      if (isDev) console.error("Search failed:", error);
      if (error?.needsAuth || error?.require_reauth) {
        const authUrl = error.authUrl;
        // Preserve contacts so user doesn't lose search results (drafts failed but contacts are returned)
        if (error.contacts?.length) {
          setLastResults(error.contacts);
        }
        if (authUrl) {
          toast({
            title: "Gmail Connection Expired",
            description: error.message || "Please reconnect your Gmail account to create drafts.",
            variant: "destructive",
            duration: 5000,
            action: (
              <Button size="sm" variant="outline" onClick={() => { window.location.href = authUrl; }}>
                Reconnect Gmail
              </Button>
            ),
          });
          window.location.href = authUrl;
          return;
        }
        toast({
          title: "Gmail Connection Expired",
          description: error.message || "Please reconnect your Gmail account to create drafts.",
          variant: "destructive",
          duration: 8000,
          action: (
            <Button size="sm" variant="outline" onClick={() => navigate("/account-settings")}>
              Reconnect Gmail
            </Button>
          ),
        });
        setSearchComplete(false);
        setProgressValue(0);
        return;
      }
      if (error?.code === "PDL_OUTAGE") {
        toast({
          title: "Temporarily Unavailable",
          description: "Find features are temporarily down due to a data provider update. We expect full service within 1–2 days.",
          duration: 8000,
        });
      } else {
        toast({
          title: "Search Failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
          duration: 5000,
        });
      }
      setSearchComplete(false);
      setProgressValue(0);
    } finally {
      // Ensure progress interval is cleared
      if (progressInterval) clearInterval(progressInterval);
      setIsSearching(false);
      if (searchSucceeded) {
        setTimeout(() => {
          setProgressValue(0);
          setSearchComplete(false);
        }, 2000);
      } else {
        setTimeout(() => setProgressValue(0), 500);
      }
    }
  };

  // Unified submit handler — routes to LinkedIn import or search
  const handleSubmit = () => {
    const input = searchPrompt.trim();
    if (!input) return;
    if (isLinkedInUrl(input)) {
      const normalized = normalizeLinkedInUrl(input);
      setLinkedInUrl(normalized);
      handleLinkedInImport(normalized);
    } else {
      handleSearch();
    }
  };

  // CSV Export function for Contact Search Results (currently unused)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExportCsv = () => {
    if (!lastResults || lastResults.length === 0) {
      return;
    }

    // Define CSV headers based on Contact interface
    const headers = [
      'First Name',
      'Last Name',
      'Email',
      'Work Email',
      'Personal Email',
      'LinkedIn',
      'Job Title',
      'Company',
      'City',
      'State',
      'College',
      'Phone',
      'Email Subject',
      'Email Body'
    ] as const;

    const headerRow = headers.join(',');

    // Map contacts to CSV rows
    const rows = lastResults.map((contact: any) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        escapeCsv(contact.FirstName || contact.firstName),
        escapeCsv(contact.LastName || contact.lastName),
        escapeCsv(contact.Email || contact.email),
        escapeCsv(contact.WorkEmail || contact.workEmail),
        escapeCsv(contact.PersonalEmail || contact.personalEmail),
        escapeCsv(contact.LinkedIn || contact.linkedinUrl),
        escapeCsv(contact.Title || contact.jobTitle),
        escapeCsv(contact.Company || contact.company),
        escapeCsv(contact.City || contact.city),
        escapeCsv(contact.State || contact.state),
        escapeCsv(contact.College || contact.college),
        escapeCsv(contact.Phone || contact.phone),
        escapeCsv(contact.email_subject || contact.emailSubject),
        escapeCsv(contact.email_body || contact.emailBody)
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `contacts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "CSV Exported!",
      description: `Exported ${lastResults.length} contacts to CSV.`,
    });
  };

  // --- Embedded content (rendered inside FindPage wrapper) ---
  const embeddedContent = (
    <>
      {/* Gmail hint — subtle inline text, not a warning banner */}
      {gmailConnected === false && !gmailBannerDismissed && (
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '8px 32px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3, #8A8F9A)' }}>
            <button
              type="button"
              onClick={initiateGmailOAuth}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-2, #4A4F5B)', textDecoration: 'underline', textUnderlineOffset: 2, fontFamily: 'inherit' }}
            >
              Connect Gmail
            </button>
            {' '}to auto-create email drafts
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismissGmailBanner}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3, #8A8F9A)', fontSize: 14, lineHeight: 1, padding: 2 }}
          >
            &times;
          </button>
        </div>
      )}

      <div
        data-tour="tour-search-form"
        style={{ padding: '24px 32px 32px', maxWidth: '860px', margin: '0 auto' }}
      >
        <input
          type="file"
          accept={ACCEPTED_RESUME_TYPES.accept}
          onChange={handleFileUpload}
          className="hidden"
          id="resume-upload"
          disabled={isSearching || isUploadingResume}
        />

        {/* Progress Bar */}
        {isSearching && (
          <div style={{ marginBottom: 16 }}>
            <Progress value={progressValue} className="h-0.5 rounded-none" />
          </div>
        )}

        {/* Targeted context banner */}
        {currentFitContext && currentFitContext.job_title && (
          <div
            style={{
              marginBottom: 16,
              background: '#FAFBFF',
              border: '0.5px solid #E2E8F0',
              borderRadius: 3,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#6B7280]">
                Targeting <span className="font-medium text-[#0F172A]">{currentFitContext.job_title}</span> at {currentFitContext.company || 'target companies'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem('scout_fit_context');
                setCurrentFitContext(null);
              }}
              className="h-7 text-[#94A3B8] hover:text-[#0F172A]"
            >
              Clear
            </Button>
          </div>
        )}

        {/* Outreach mode picker. Chosen before running a search: Get emails
            (preview), Draft emails (default), or Send emails (Elite). */}
        <div style={{ maxWidth: 896, marginLeft: 'auto', marginRight: 'auto', marginBottom: 10, display: 'flex', justifyContent: 'flex-start' }}>
          <SearchModeSelector
            tier={userTier}
            value={outreachMode}
            onChange={setOutreachMode}
            disabled={isSearching || linkedInLoading}
          />
        </div>

        <SendConfirmDialog
          open={showSendConfirm}
          count={batchSize}
          loading={isSearching}
          onCancel={() => setShowSendConfirm(false)}
          onConfirm={() => {
            setShowSendConfirm(false);
            handleSearch(true);
          }}
        />

        {/* Single-draft confirm. Fires when the inline Send button on a reviewed
            draft is clicked. Same hard-confirm pattern as the batch dialog
            because send is irreversible. */}
        <SendConfirmDialog
          open={confirmSendDraftIdx !== null}
          count={1}
          loading={sendingDraftIdx !== null}
          title={
            confirmSendDraftIdx !== null
              ? `Send this email to ${
                  ((lastResults[confirmSendDraftIdx]?.FirstName || lastResults[confirmSendDraftIdx]?.firstName || '') as string).trim() ||
                  'this contact'
                }?`
              : undefined
          }
          description="This sends the reviewed draft from your Gmail account. This cannot be undone."
          confirmLabel={sendingDraftIdx !== null ? 'Sending...' : 'Send now'}
          onCancel={() => setConfirmSendDraftIdx(null)}
          onConfirm={() => {
            if (confirmSendDraftIdx !== null) {
              handleSendReviewedDraft(confirmSendDraftIdx);
            }
          }}
        />

        {/* Hero search bar — full-width prompt. Company Alternatives sidebar is
            absolutely positioned in the empty space to the right of the form (outside
            the prompt bubble) so the prompt keeps its full width for typing. */}
        <div style={{ marginTop: 0, marginBottom: 16, position: 'relative', maxWidth: 896, marginLeft: 'auto', marginRight: 'auto' }}>
            <SearchPromptBox
              onSubmit={handleSubmit}
              submitDisabled={isSearching || linkedInLoading || !user}
              inputValue={searchPrompt}
              submitAriaLabel={isLinkedInUrl(searchPrompt) ? "Import from LinkedIn" : "Search"}
              helper={
                outreachMode === 'send'
                  ? PEOPLE_SEARCH_HELPER_SEND
                  : outreachMode === 'preview'
                    ? PEOPLE_SEARCH_HELPER_PREVIEW
                    : PEOPLE_SEARCH_HELPER
              }
              submitIcon={
                isSearching || linkedInLoading ? <Loader2 className="w-4 h-4 animate-spin" />
                : isLinkedInUrl(searchPrompt) ? <Linkedin className="w-4 h-4" />
                : <ArrowUp className="w-4 h-4" />
              }
              footer={
                <>
              {/* Role-variations pill row — Grammarly-style, sits directly below the
                  typed sentence. Hover any pill to preview the swap, click to commit. */}
              <div style={{ paddingLeft: 26, marginTop: 0 }}>
                <RoleVariations
                  prompt={searchPrompt}
                  isSearching={isSearching}
                  hasResults={hasResults}
                  isLinkedIn={isLinkedInUrl(searchPrompt)}
                  inputFocused={inputFocused}
                  onAcceptSuggestion={(originalMatched, chosen) => {
                    const escaped = originalMatched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                    setSearchPrompt((prev) => prev.replace(regex, chosen.toLowerCase()));
                    setPreviewSwap(null);
                  }}
                  onPreviewSuggestion={(originalMatched, chosen) =>
                    setPreviewSwap({ matched: originalMatched, chosen })
                  }
                  onClearPreview={() => setPreviewSwap(null)}
                />
              </div>

              {/* Row 2 — bottom of the prompt box. When the user has focus-but-empty,
                  this slot shows the click-to-fill quick-starters (mental starting line).
                  When the user has typed something, dimension chips take over. */}
              <div style={{ paddingLeft: 26 }}>
                {!searchPrompt.trim() ? (
                  <QuickStarters
                    visible
                    onPick={(seed) => {
                      // Treat the click as if the user had typed the seed verbatim:
                      // fill the prompt, place caret at end, keep focus on the input,
                      // and let the existing pipeline (DimensionChips, RoleVariations,
                      // CompanyAlternatives, ghost completion) re-derive everything.
                      setSearchPrompt(seed);
                      requestAnimationFrame(() => {
                        const el = promptInputRef.current;
                        if (el) {
                          el.focus();
                          try {
                            el.setSelectionRange(seed.length, seed.length);
                          } catch {
                            // Safari may throw on hidden/transparent inputs — non-fatal.
                          }
                        }
                      });
                    }}
                    schoolShort={profileFacts.schoolShort}
                    schoolFull={profileFacts.schoolFull}
                    targetFirms={profileFacts.targetFirms}
                    targetIndustries={profileFacts.targetIndustries}
                    preferredLocations={profileFacts.preferredLocations}
                    extractedRoles={profileFacts.extractedRoles}
                  />
                ) : (
                  <DimensionChips
                    prompt={searchPrompt}
                    isSearching={isSearching}
                    hasResults={hasResults}
                    isLinkedIn={isLinkedInUrl(searchPrompt)}
                    inputFocused={inputFocused}
                  />
                )}
              </div>
                </>
              }
            >
              {/* Row 1 — search icon + input + LinkedIn pill */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, position: 'relative', paddingRight: 40 }}>
                {/* Pseudo-element styling for the transparent input:
                    - ::placeholder — keep it visible despite color:transparent on the host
                    - ::selection — keep selected text transparent (the visible rendering
                      lives in the overlay above; without this rule, the input's selected
                      text re-emerges and double-renders against the overlay). */}
                <style>{`.ofl-search-input::placeholder{color:var(--ink-3, #8A8F9A);opacity:1;}.ofl-search-input::selection{color:transparent;background:rgba(74,96,168,0.20);}.ofl-search-input::-moz-selection{color:transparent;background:rgba(74,96,168,0.20);}`}</style>
                <textarea
                  ref={promptInputRef}
                  className="ofl-search-input"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  rows={1}
                  value={searchPrompt}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSearchPrompt(next);
                    setLinkedInError(null);
                    setLinkedInSuccess(null);
                    // Auto-grow vertically as the user types — keeps long queries readable.
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && ghostCompletion && !e.shiftKey) {
                      e.preventDefault();
                      setSearchPrompt((prev) => prev + ghostCompletion);
                      return;
                    }
                    if (
                      e.key === 'ArrowRight' &&
                      ghostCompletion &&
                      e.currentTarget.selectionStart === searchPrompt.length
                    ) {
                      e.preventDefault();
                      setSearchPrompt((prev) => prev + ghostCompletion);
                      return;
                    }
                    // Enter submits, Shift+Enter inserts a newline.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  // Native placeholder is intentionally empty — the typewriter overlay below
                  // owns ALL placeholder rendering (focused or not), so we don't double-show.
                  placeholder={undefined}
                  disabled={isSearching || linkedInLoading || peopleDemoActive}
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'none',
                    fontSize: 14,
                    // Native textarea text is invisible. The visible text + ghost suffix render
                    // in the overlay below so they're guaranteed to share metrics and align.
                    color: 'transparent',
                    caretColor: '#0F172A',
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    padding: 0,
                    resize: 'none',
                    overflow: 'hidden',
                    minHeight: 21, // matches one line at fontSize 14 × lineHeight 1.5
                  }}
                />
                {/* Typewriter placeholder overlay — types + deletes between examples in quotes */}
                {showAnimatedPlaceholder && (
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
                      color: 'var(--ink-3, #8A8F9A)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    e.g. {typedPlaceholder}
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 1,
                        marginLeft: 2,
                        background: 'currentColor',
                        // Match the line-height so the caret tracks the text baseline.
                        height: '1em',
                        verticalAlign: 'text-bottom',
                        animation: 'cgh-typewriter-caret 1s steps(2) infinite',
                      }}
                    />
                    <style>{`@keyframes cgh-typewriter-caret { 50% { opacity: 0; } }`}</style>
                  </div>
                )}
                {/* Combined text overlay — typed text in primary ink + optional ghost suffix
                    in faded ink. Both rendered in the same DOM node so they share font metrics
                    and align pixel-perfect with each other (no offset between typed and ghost). */}
                {searchPrompt && !showAnimatedPlaceholder && (
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
                      // pre-wrap so long prompts wrap to multiple lines instead of cutting off.
                      // The textarea grows in tandem; together they stay aligned pixel-perfect.
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflow: 'hidden',
                    }}
                  >
                    {previewedPrompt ? (
                      // Hover-preview: render the prompt with the matched word swapped in
                      // a faded blue highlight so the user sees the result before clicking.
                      <>
                        <span style={{ color: '#0F172A' }}>{previewedPrompt.before}</span>
                        <span
                          style={{
                            color: 'var(--accent, #4A60A8)',
                            background: 'rgba(74,96,168,0.12)',
                            borderRadius: 3,
                            padding: '0 1px',
                          }}
                        >
                          {previewedPrompt.replacement}
                        </span>
                        <span style={{ color: '#0F172A' }}>{previewedPrompt.after}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: '#0F172A' }}>{searchPrompt}</span>
                        {ghostCompletion && inputFocused && (
                          <span style={{ color: 'var(--ink-3, #8A8F9A)', opacity: 0.55 }}>
                            {ghostCompletion}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              {isLinkedInUrl(searchPrompt) && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(74,96,168,0.10)',
                  color: 'var(--accent, #4A60A8)',
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '4px 10px',
                  borderRadius: 100,
                  whiteSpace: 'nowrap',
                  marginTop: 2,
                }}>
                  <Linkedin className="h-3 w-3" />
                  LinkedIn
                </div>
              )}
              </div>
            </SearchPromptBox>

            {/* RIGHT — Company Alternatives, absolutely positioned in the empty space
                outside the form's max-width container. Doesn't affect the prompt's
                full-width layout. */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 'calc(100% + 20px)',
                width: 168,
              }}
            >
              <CompanyAlternatives
                prompt={searchPrompt}
                isSearching={isSearching}
                hasResults={hasResults}
                isLinkedIn={isLinkedInUrl(searchPrompt)}
                rotationSeed={rotationSeed}
                inputFocused={inputFocused}
                onAcceptSuggestion={(originalMatched, chosen) => {
                  const escaped = originalMatched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                  setSearchPrompt((prev) => prev.replace(regex, chosen.toLowerCase()));
                  setPreviewSwap(null);
                }}
                onPreviewSuggestion={(originalMatched, chosen) =>
                  setPreviewSwap({ matched: originalMatched, chosen })
                }
                onClearPreview={() => setPreviewSwap(null)}
                onAppendCompany={(company) => {
                  // No specific company in the prompt yet — append "at <company>"
                  // so the search picks up the user's intent.
                  setSearchPrompt((prev) => {
                    const trimmed = prev.replace(/\s+$/, '');
                    return /\bat\b/i.test(trimmed)
                      ? `${trimmed} ${company}`
                      : `${trimmed} at ${company}`;
                  });
                }}
                onAppendLocation={(loc) => {
                  setSearchPrompt((prev) => {
                    const trimmed = prev.replace(/\s+$/, '');
                    return /\bin\b/i.test(trimmed)
                      ? `${trimmed} ${loc}`
                      : `${trimmed} in ${loc}`;
                  });
                }}
              />
            </div>
        </div>

        {linkedInError && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-[3px] flex items-center gap-2 border border-red-200 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {linkedInError}
          </div>
        )}

        {/* Quantity slider — matched to the Companies slider; hidden for LinkedIn URLs */}
        {!isLinkedInUrl(searchPrompt) && (
          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <div style={{
              fontFamily: '"Libre Baskerville", Georgia, serif',
              fontSize: 10, letterSpacing: '0.12em', color: '#8A8F97', marginBottom: 8,
            }}>
              HOW MANY TO FIND?
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: '#8A8F97', minWidth: 12 }}>1</span>
              <div className="slider-input-wrapper" style={{ flex: 1, position: 'relative', height: 4, background: '#E5E3DE', borderRadius: 2 }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: 4,
                  width: maxBatchSize > 1 ? `${((batchSize - 1) / (maxBatchSize - 1)) * 100}%` : '0%',
                  background: sliderFlashing ? 'var(--brand-blue, #3B82F6)' : 'var(--accent, #1B2A44)',
                  borderRadius: 2,
                  transition: 'background .35s ease',
                }} />
                <input
                  type="range"
                  min={1}
                  max={maxBatchSize}
                  step={1}
                  value={batchSize}
                  onChange={(e) => {
                    userAdjustedBatchSize.current = true;
                    setBatchSize(Math.min(Number(e.target.value), maxBatchSize));
                    flashSlider();
                  }}
                  disabled={isSearching}
                  className="slider-custom"
                  aria-label="Number of contacts to find"
                  style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    opacity: 0, cursor: 'pointer', margin: 0,
                  }}
                />
                <div style={{
                  position: 'absolute',
                  left: `calc(${maxBatchSize > 1 ? ((batchSize - 1) / (maxBatchSize - 1)) * 100 : 0}% - 7px)`,
                  top: -5, width: 14, height: 14, borderRadius: '50%',
                  background: sliderFlashing ? 'var(--brand-blue, #3B82F6)' : 'var(--accent, #1B2A44)',
                  boxShadow: sliderFlashing
                    ? '0 1px 6px rgba(59,130,246,0.55)'
                    : '0 1px 4px rgba(27,42,68,0.4)',
                  pointerEvents: 'none',
                  transition: 'background .35s ease, box-shadow .35s ease',
                }} />
              </div>
              <span style={{ fontSize: 11, color: '#8A8F97', minWidth: 16, textAlign: 'right' }}>{maxBatchSize}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 }}>
              <div style={{
                fontFamily: "var(--serif, 'Instrument Serif', Georgia, serif)",
                fontStyle: 'italic', fontSize: 13.5, color: '#111418',
              }}>
                Find {batchSize} contact{batchSize !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#4A4F57' }}>
                <span style={{
                  display: 'inline-flex', padding: '3px 8px',
                  background: '#FAFAF8', border: '1px solid #E5E3DE', borderRadius: 4,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#111418',
                }}>
                  {batchSize * CREDIT_COSTS.find_contact} credits
                </span>
                <span style={{ color: '#8A8F97' }}>
                  of {creditsView.balance.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Email Template + Resume — matched pair, centered; Import link kept right */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 18, marginBottom: 4 }}>
          <TemplateButton
            template={activeEmailTemplate}
            onClick={() => navigate("/find/templates")}
          />
          {/* Resume button — matches TemplateButton; replaces the old "Resume: <filename>" line */}
          <button
            type="button"
            onClick={() => document.getElementById('resume-upload')?.click()}
            disabled={isSearching || isUploadingResume}
            title={savedResumeFileName || undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              padding: '12px 20px',
              border: '1px solid var(--line, #E5E5E0)',
              borderRadius: 12,
              background: 'var(--paper, #FFFFFF)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--ink, #111318)',
              transition: 'all .15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent, #4A60A8)';
              e.currentTarget.style.color = 'var(--accent, #4A60A8)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,96,168,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--line, #E5E5E0)';
              e.currentTarget.style.color = 'var(--ink, #111318)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Upload style={{ width: 18, height: 18, color: 'currentColor', opacity: 0.7 }} />
            <span style={{ color: 'currentColor' }}>{savedResumeUrl ? 'Resume' : 'Upload Resume'}</span>
            {savedResumeUrl && <Check className="w-4 h-4 text-green-600" />}
          </button>
          {/* Import contacts — kept on the right */}
          <button
            type="button"
            onClick={() => setShowImportDialog(true)}
            style={{ position: 'absolute', right: 0, fontSize: 12, color: 'var(--ink-2, #4A4F5B)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px', borderRadius: 6, transition: 'color .12s, background .12s' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--accent, #4A60A8)';
              e.currentTarget.style.background = 'rgba(74,96,168,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-2, #4A4F5B)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Import contacts
          </button>
        </div>

        {/* Resume upload card — shown when no results and no resume */}
        {!hasResults && !isSearching && !savedResumeUrl && (
          <div
            className="max-sm:flex-col max-sm:items-start"
            style={{
              marginTop: 20,
              background: '#FFFFFF',
              border: '1px solid var(--line, #E5E5E0)',
              borderRadius: 12,
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'var(--paper-2, #FAFBFF)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <FileText style={{ width: 20, height: 20, color: 'var(--ink-2, #4A4F5B)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink, #111318)', marginBottom: 3 }}>
                Upload your resume for better matches
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3, #8A8F9A)', lineHeight: 1.5 }}>
                We'll find people who hired for roles like yours — and tailor your outreach automatically.
              </div>
            </div>
            <button
              className="max-sm:w-full"
              onClick={() => document.getElementById('resume-upload')?.click()}
              style={{
                background: 'var(--ink, #111318)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Upload resume
            </button>
          </div>
        )}

        {/* Resume status — compact indicator when resume is already uploaded */}
        {/* Resume status now lives in the Resume button beside Email Template (above). */}

        {/* Suggestion cards — visible whenever the input doesn't have focus and there
            are no results yet. Includes the case where the user has typed content and
            then clicked away — the recs surface immediately as a discovery panel. */}
        <AnimatePresence initial={false}>
          {!hasResults && !isSearching && (
            <motion.div
              key="recs"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ marginTop: 36 }}
            >
              <SuggestionChips
                type="people"
                uid={user?.uid}
                onSelect={(prompt) => {
                  pendingAutoSearch.current = true;
                  setSearchPrompt(prompt);
                }}
                collapsed={suggestionsCollapsed}
                onCollapse={setSuggestionsCollapsed}
                hasSearched={hasResults}
                disabled={isSearching || linkedInLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>


        {/* Results section */}
        {hasResults && !isSearching && !linkedInSuccess && (
          <div
            ref={searchSuccessRef}
            style={{
              marginTop: 24,
              paddingTop: 24,
              borderTop: '0.5px solid #EEF2F8',
            }}
          >
            {/* Success pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                background: '#DCFCE7',
                color: '#15803D',
                border: '0.5px solid #BBF7D0',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 500,
              }}>
                <CheckCircle className="w-3 h-3" />
                {lastResults.length + alreadySavedResults.length} {(lastResults.length + alreadySavedResults.length) === 1 ? 'result' : 'results'} found
              </div>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>
                {lastResults.length > 0 ? `${lastResults.length} new: saved to your inbox automatically` : ''}
                {lastResults.length > 0 && alreadySavedResults.length > 0 ? ' · ' : ''}
                {alreadySavedResults.length > 0 ? `${alreadySavedResults.length} already in your inbox` : ''}
              </span>
            </div>

            {/* Backend message — persistent inline callout for "all already saved" or adjacency explanation.
                Shows when there are no new contacts to explain why and what to do next. */}
            {resultMessage && lastResults.length === 0 && (
              <div style={{
                padding: '10px 14px',
                background: alreadySavedResults.length > 0 ? 'rgba(245,158,11,0.06)' : 'rgba(74,96,168,0.05)',
                border: alreadySavedResults.length > 0 ? '0.5px solid #FDE68A' : '0.5px solid #BFDBFE',
                borderRadius: 6,
                fontSize: 13,
                color: alreadySavedResults.length > 0 ? '#713F12' : '#1E40AF',
                lineHeight: 1.5,
                marginBottom: 12,
              }}>
                {resultMessage}
              </div>
            )}

            {/* Broadening notice — shown when the backend retry chain dropped one
                or more constraints to find these contacts. Tells the user honestly
                that the system expanded its search rather than pretending the
                original specific query yielded these people. */}
            {/* Cross-tab suggestions (e.g. "Find recruiters at X") */}
            {searchSuggestions.length > 0 && lastResults.length === 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {searchSuggestions.map((suggestion: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (suggestion.type === 'switch_tab') {
                        navigate(`/find?tab=${suggestion.tab}${suggestion.prefill?.company ? `&company=${encodeURIComponent(suggestion.prefill.company)}` : ''}`);
                      } else if (suggestion.type === 'broaden_query' && suggestion.query) {
                        setSearchPrompt(suggestion.query);
                      }
                    }}
                    style={{
                      padding: '8px 14px',
                      background: '#fff',
                      border: '1px solid #E2E8F0',
                      borderRadius: 6,
                      fontSize: 13,
                      color: 'var(--accent, #4A60A8)',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all .12s',
                    }}
                  >
                    {suggestion.label} <ArrowRight style={{ width: 12, height: 12, display: 'inline', marginLeft: 4 }} />
                  </button>
                ))}
              </div>
            )}

            {/* Contact cards */}
            {lastResults.length <= 8 && lastResults.map((c: any, i: number) => {
              const name = toTitleCase([c.FirstName || c.firstName, c.LastName || c.lastName].filter(Boolean).join(' ') || (c.Email || c.email || '').split('@')[0] || 'Unknown');
              const title = toTitleCase(c.JobTitle || c.jobTitle || c.Title || '');
              const company = toTitleCase(c.Company || c.company || '');
              const email = c.Email || c.email || '';
              const linkedin = c.LinkedIn || c.linkedinUrl || '';
              const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
              // Per-contact email state derived from what the search returned,
              // not a mode flag. hasDraft and isSent drive the right-side action.
              const hasDraft = !!(c.emailSubject || c.emailBody);
              const isSent = !!c.emailSent;
              const canDraft = canUseOutreachMode(userTier, 'draft');
              const isExpanded = expandedEmailIdx === i;
              const linkedinHref = linkedin
                ? (linkedin.startsWith('http') ? linkedin : `https://${linkedin}`)
                : '';
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '11px 13px',
                    background: '#fff',
                    border: '0.5px solid #E2E8F0',
                    borderRadius: 3,
                    marginBottom: 6,
                    cursor: 'pointer',
                    transition: 'all .12s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent, #4A60A8)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(74,96,168,.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#E2E8F0';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  {/* Top row: identity on the left, tidy action column on the right.
                      Card stays compact, it only grows when the draft is expanded. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: 'rgba(74,96,168,0.10)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#0F172A',
                      flexShrink: 0,
                    }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{name}</span>
                        {/* Warmth indicator */}
                        {(() => {
                          const label = c.warmth_label || (c.warmth_tier === 'warm' ? 'Strong match' : c.warmth_tier === 'neutral' ? 'Good fit' : '');
                          if (!label) return null;
                          const isRoleMismatch = label === 'Right company, different role';
                          const isStrong = label === 'Strong fit' || label === 'Strong match';
                          const tooltipText = (() => {
                            const sigs = c.warmth_signals || [];
                            return sigs.slice(0, 2).map((s: any) => s.detail || s.signal?.replace(/_/g, ' ')).filter(Boolean).join(', ');
                          })();
                          return (
                            <span
                              title={tooltipText}
                              style={{
                                padding: '1px 6px',
                                borderRadius: 3,
                                background: isStrong
                                  ? 'rgba(34, 197, 94, 0.12)'
                                  : isRoleMismatch
                                    ? 'rgba(148, 163, 184, 0.18)'
                                    : 'rgba(245, 158, 11, 0.14)',
                                color: isStrong
                                  ? '#15803D'
                                  : isRoleMismatch
                                    ? '#475569'
                                    : '#B45309',
                                fontSize: 10,
                                fontWeight: 600,
                                fontFamily: "'DM Sans', system-ui, sans-serif",
                              }}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                        {[title, company].filter(Boolean).join(' at ')}
                      </div>
                      {/* Email address shows on every card, in every mode */}
                      {email && (
                        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                          {email}
                        </div>
                      )}
                      {/* Briefing line — "Why this person" */}
                      {c.briefing && (
                        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3, lineHeight: 1.3 }}>
                          {c.briefing}
                        </div>
                      )}
                    </div>

                    {/* Right action column: the email action and the LinkedIn pill
                        read as a tidy pair. Buttons are short, not full width. */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 6,
                      flexShrink: 0,
                    }}>
                      {/* Email action. Sent and draft states expand to read inline.
                          In preview with a tier that cannot draft, this is the
                          upgrade prompt (same locked treatment as the mode selector).
                          A paid tier in preview sees no email button, just keeps
                          email and LinkedIn. */}
                      {isSent ? (
                        <ResultActionButton
                          variant="secondary"
                          size="sm"
                          className="text-green-700 hover:text-green-700 font-semibold"
                          onClick={(e) => { e.stopPropagation(); setExpandedEmailIdx(isExpanded ? null : i); }}
                        >
                          <CheckCircle style={{ width: 13, height: 13 }} />
                          {isExpanded ? 'Hide message' : 'Sent, view in Gmail'}
                        </ResultActionButton>
                      ) : hasDraft ? (
                        <ResultActionButton
                          variant="secondary"
                          size="sm"
                          className="text-st-accent hover:text-st-accent font-semibold"
                          onClick={(e) => { e.stopPropagation(); setExpandedEmailIdx(isExpanded ? null : i); }}
                        >
                          {isExpanded ? 'Hide draft' : 'View draft'}
                          <ChevronRight style={{
                            width: 12, height: 12,
                            transform: isExpanded ? 'rotate(90deg)' : 'none',
                            transition: 'transform .15s',
                          }} />
                        </ResultActionButton>
                      ) : !canDraft ? (
                        <ResultActionButton
                          variant="secondary"
                          size="sm"
                          title="Upgrade to Pro to draft emails automatically."
                          style={{ color: '#94A3B8', cursor: 'not-allowed' }}
                          onClick={(e) => { e.stopPropagation(); }}
                        >
                          <FileText style={{ width: 13, height: 13 }} /> Draft Email
                          <Lock style={{ width: 11, height: 11 }} />
                        </ResultActionButton>
                      ) : null}

                      {/* LinkedIn pill: lucide glyph plus label, secondary language.
                          Not the brand-restricted LinkedIn logo. */}
                      {linkedinHref && (
                        <ResultActionButton
                          variant="secondary"
                          size="sm"
                          href={linkedinHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <Linkedin style={{ width: 14, height: 14 }} /> LinkedIn
                        </ResultActionButton>
                      )}
                    </div>
                  </div>

                  {/* Expanded email panel: the card grows only when this is open */}
                  {isExpanded && (hasDraft || isSent) && (
                    <div style={{
                      marginTop: 10, padding: '12px 14px',
                      background: '#F8FAFC', borderRadius: 6, border: '0.5px solid #E2E8F0',
                    }}>
                      {c.emailSubject && (
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>
                          {c.emailSubject}
                        </div>
                      )}
                      {/* Sender context so the panel reads like a real email */}
                      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10, lineHeight: 1.5 }}>
                        {email && <div>To: {email}</div>}
                        {user?.email && <div>From: {user.email}</div>}
                      </div>
                      <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {c.emailBody}
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
                        {!isSent && c.gmailDraftUrl && (
                          <ResultActionButton
                            variant="primary"
                            size="sm"
                            href={c.gmailDraftUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            <Mail style={{ width: 13, height: 13 }} /> Open in Gmail
                          </ResultActionButton>
                        )}
                        {!isSent && c.gmailDraftId && (
                          <ResultActionButton
                            variant="primary"
                            size="sm"
                            disabled={sendingDraftIdx === i}
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              setConfirmSendDraftIdx(i);
                            }}
                            style={{ background: '#16A34A' }}
                          >
                            {sendingDraftIdx === i ? (
                              <>
                                <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> Sending...
                              </>
                            ) : (
                              <>
                                <Send style={{ width: 13, height: 13 }} /> Send
                              </>
                            )}
                          </ResultActionButton>
                        )}
                        {isSent && (
                          <a
                            href="https://mail.google.com/mail/u/0/#sent"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              color: '#15803D', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                            }}
                          >
                            <CheckCircle style={{ width: 12, height: 12 }} /> Sent, view in Gmail
                          </a>
                        )}
                        <ResultActionButton
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (c.demo) return;
                            const text = `Subject: ${c.emailSubject || ''}\n\n${c.emailBody || ''}`;
                            navigator.clipboard.writeText(text);
                            toast({ description: 'Email copied to clipboard' });
                          }}
                        >
                          <FileText style={{ width: 13, height: 13 }} /> Copy email
                        </ResultActionButton>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Already saved contacts */}
            {alreadySavedResults.length > 0 && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  marginBottom: 4,
                }}>
                  <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                  <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Already in your inbox
                  </span>
                  <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                </div>
                {alreadySavedResults.map((c: any, i: number) => {
                  const name = toTitleCase([c.FirstName || c.firstName, c.LastName || c.lastName].filter(Boolean).join(' ') || (c.Email || c.email || '').split('@')[0] || 'Unknown');
                  const title = toTitleCase(c.Title || c.JobTitle || c.jobTitle || '');
                  const company = toTitleCase(c.Company || c.company || '');
                  const linkedin = c.LinkedIn || c.linkedinUrl || '';
                  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <div
                      key={`saved-${i}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        padding: '11px 13px',
                        background: '#FAFAFA',
                        border: '0.5px solid #E2E8F0',
                        borderRadius: 3,
                        marginBottom: 6,
                        opacity: 0.7,
                      }}
                    >
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'rgba(107,114,128,0.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#6B7280',
                        flexShrink: 0,
                      }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>{name}</span>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: 'rgba(107,114,128,0.08)',
                            color: '#94A3B8',
                            fontSize: 10,
                            fontWeight: 500,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}>
                            Already saved
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                          {[title, company].filter(Boolean).join(' at ')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {linkedin && (
                          <ResultActionButton
                            variant="secondary"
                            size="sm"
                            href={linkedin.startsWith('http') ? linkedin : `https://${linkedin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            <Linkedin style={{ width: 14, height: 14 }} /> LinkedIn
                          </ResultActionButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Action buttons. Batch path to Gmail and the tracker. The Gmail
                drafts button shows only when drafts actually exist (derived from
                per-contact state, not a mode flag). "View in Outbox" was dropped
                because it redirected to the tracker, which the Tracker button now
                covers directly. */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {lastResults.some((c: any) => c.gmailDraftUrl && !c.emailSent) && (
                <ResultActionButton
                  variant="primary"
                  href="https://mail.google.com/mail/u/0/#drafts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Open Gmail drafts
                </ResultActionButton>
              )}
              <ResultActionButton
                variant="secondary"
                onClick={() => {
                  // Deep-link the just-drafted contact so the tracker expands
                  // its (collapsed-by-default) group, selects it, and refetches
                  // fresh. Navigate straight to /outbox: routing via /tracker
                  // hits a <Navigate replace> that would drop the route state.
                  const drafted = lastResults.find(
                    (c: any) => (c.gmailDraftUrl || c.emailSubject || c.emailBody) && (c.Email || c.email)
                  );
                  const anyWithEmail = lastResults.find((c: any) => c.Email || c.email);
                  const focusEmail =
                    (drafted && (drafted.Email || drafted.email)) ||
                    (anyWithEmail && (anyWithEmail.Email || anyWithEmail.email)) ||
                    undefined;
                  navigate('/outbox', { state: { focusEmail, segment: 'people' } });
                }}
                className="flex-1"
              >
                <Inbox className="w-3.5 h-3.5" />
                Inbox
              </ResultActionButton>
              <ResultActionButton
                variant="secondary"
                onClick={() => navigate('/contact-directory')}
                className="flex-1"
              >
                <User className="w-3.5 h-3.5" />
                View in Spreadsheet
              </ResultActionButton>
            </div>
          </div>
        )}

        {/* LinkedIn success */}
        {linkedInSuccess && (
          <div style={{
            marginTop: 24,
            paddingTop: 24,
            borderTop: '0.5px solid #EEF2F8',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                background: '#DCFCE7',
                color: '#15803D',
                border: '0.5px solid #BBF7D0',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 500,
              }}>
                <CheckCircle className="w-3 h-3" />
                {linkedInSuccess}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              {linkedInLastDraftUrl && (
                <button
                  onClick={() => window.open(linkedInLastDraftUrl!, '_blank')}
                  style={{
                    flex: 1,
                    height: 37,
                    borderRadius: 3,
                    background: 'var(--accent, #4A60A8)',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    fontFamily: 'inherit',
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  Open Gmail Draft
                </button>
              )}
              <button
                onClick={() => navigate('/contact-directory')}
                style={{
                  flex: 1,
                  height: 37,
                  borderRadius: 3,
                  background: '#fff',
                  border: '0.5px solid #E2E8F0',
                  color: '#6B7280',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  fontFamily: 'inherit',
                }}
              >
                <User className="w-3 h-3" />
                View in Spreadsheet
              </button>
            </div>
          </div>
        )}
      </div>

      <EliteGateModal open={showEliteGate} onClose={() => setShowEliteGate(false)} />

      {/* Import CSV dialog */}
      {showImportDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }}
            onClick={() => setShowImportDialog(false)}
          />
          <div
            style={{
              position: 'relative',
              background: '#fff',
              borderRadius: 3,
              width: '100%',
              maxWidth: 600,
              maxHeight: '85vh',
              overflowY: 'auto',
              margin: 16,
              boxShadow: '0 4px 12px rgba(0,0,0,.08)',
            }}
          >
            <button
              type="button"
              onClick={() => setShowImportDialog(false)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: '#94A3B8',
                zIndex: 1,
              }}
            >
              <X className="h-4 w-4" />
            </button>
            <div style={{ padding: '24px' }}>
              <ContactImport
                onImportComplete={() => setShowImportDialog(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return embeddedContent;

  // --- Standalone page with full shell ---
  return (
    <>
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#FFFFFF] text-foreground font-sans">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader
            title=""
            onJobTitleSuggestion={handleJobTitleSuggestion}
            rightContent={
              <>
                <button
                  onClick={() => navigate("/find/templates")}
                  className="hidden md:flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#0F172A] cursor-pointer transition-colors"
                >
                  Template:&nbsp;<span className="font-medium text-[#0F172A]">
                    {getEmailTemplateLabel(activeEmailTemplate)}
                  </span>
                </button>
                <Button
                  type="button"
                  onClick={() => isElite ? navigate("/find/templates") : setShowEliteGate(true)}
                  className="h-8 px-4 rounded-[3px] bg-[var(--accent, #4A60A8)] hover:bg-[var(--primary-600, #4C62A8)] text-white text-sm font-medium transition-all"
                  data-tour="tour-templates-button"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline whitespace-nowrap ml-2">
                    Email Template
                  </span>
                </Button>
              </>
            }
          />

          <main style={{ background: '#FFFFFF', flex: 1, overflowY: 'auto' }} className="px-4 py-8 pb-24 sm:px-8 sm:py-12 sm:pb-24">
            {/* Header */}
            <div className="w-full mb-8" style={{ maxWidth: '720px', margin: '0 auto' }}>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F172A] mb-2" style={{ fontFamily: "'Lora', Georgia, serif" }}>
                {(activeTab === 'contact-search' || activeTab === 'import') && 'Find People'}
                {activeTab === 'contact-library' && 'Your Contacts'}
                {!['contact-search', 'import', 'contact-library'].includes(activeTab) && 'Find'}
              </h1>
              <p className="text-sm text-[#6B7280] leading-relaxed">
                {(activeTab === 'contact-search' || activeTab === 'import') && 'Search by name, role, or company — or paste a LinkedIn URL.'}
                {activeTab === 'contact-library' && 'Everyone you find lands here. Track status, view emails, and export.'}
                {!['contact-search', 'import', 'contact-library'].includes(activeTab) && 'Discover professionals at your target companies.'}
              </p>
            </div>

            {embeddedContent}
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
    </>
  );

};

export default ContactSearchPage;