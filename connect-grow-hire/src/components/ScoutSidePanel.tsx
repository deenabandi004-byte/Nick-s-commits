/**
 * ScoutSidePanel - slide-out panel for the Scout assistant.
 *
 * Renders two modes:
 *  - Chat: Scout answers each turn with one tool (navigate / answer / clarify).
 *    A navigate is run through the three-rule decision (skip-approve, approve
 *    card, or in-place populate) and carried to the destination page via the
 *    route-keyed scoutBridge.
 *  - Search help: failed-search recovery, unchanged, on its own legacy channel.
 *
 * Mounted once in App.tsx as a sibling of the route switch, so it persists
 * across navigation. The conversation lives in useScoutChat (localStorage +
 * Firestore backed); the open/closed flag lives in ScoutContext.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Send, Loader2, Trash2, MessageSquarePlus, History, Lock } from 'lucide-react';
import { useScout, SearchHelpResponse } from '@/contexts/ScoutContext';
import { useScoutChat, formatMessage, type ScoutNavigate, type ScoutMode, type ScoutCta, type ScoutPlanStep, type ScoutActiveStrategy } from '@/hooks/useScoutChat';
import { BriefingButton } from '@/components/scout/BriefingButton';
import { CompletenessGauge } from '@/components/scout/CompletenessGauge';
import { ActiveStrategyCard } from '@/components/scout/ActiveStrategyCard';
import { SUGGESTED_QUESTIONS, SCOUT_CHIPS_BY_PAGE } from '@/data/scout-knowledge';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
// Tour demo orchestration — local addition, not in loops-setup-v2.
import { useTour } from '@/contexts/TourContext';
import { toast } from '@/hooks/use-toast';
import { ScoutApproveCard } from '@/components/ScoutApproveCard';
import {
  ScoutModePill,
  ScoutToolPill,
  ScoutPlanChecklist,
  ScoutCtaChip,
  ScoutTriedFailedHint,
} from '@/components/ScoutChatExtras';
import {
  writeScoutPrefill,
  SCOUT_PREFILL_EVENT,
  SCOUT_SEARCH_COMPLETED_EVENT,
  type ScoutSearchCompletedDetail,
} from '@/lib/scoutBridge';
import ScoutYetiHead from '@/assets/scouts/scout-yeti-head.png';
import { BACKEND_URL } from '@/services/api';
import {
  listScoutChats,
  formatRelativeTime,
  type ScoutChatSummary,
} from '@/services/scoutChats';

// Legacy sessionStorage key. Still used only by the failed-search recovery
// flow below; the Scout chat navigate path uses scoutBridge instead.
const AUTO_POPULATE_KEY = 'scout_auto_populate';

// LocalStorage keys for the tried-and-failed hint (Change 3). We never want
// to surface the same dismissed prompt twice in the same session.
const TRIED_HINT_DISMISSED_KEY = 'scout_tried_hint_dismissed';
const TRIED_PROMPTS_KEY = 'ofl_tried_prompts';

// ---------------------------------------------------------------------------
// Three-rule decision for a navigate tool call.
// Mode is the new primary signal (Change 7 - the Haiku intent classifier).
// The legacy 0.9+imperative rule remains a fallback so local dev still works
// when CLAUDE_API_KEY is unset and Haiku falls back silently.
// ---------------------------------------------------------------------------
type NavAction = 'in-place' | 'skip-approve' | 'approve-card';

function decideNavAction(nav: ScoutNavigate, mode?: ScoutMode | null): NavAction {
  if (nav.already_on_page) return 'in-place';
  if (mode === 'do' && !nav.credit_spending) return 'skip-approve';
  // Fallback: when the classifier was unavailable (no key, timeout, parse
  // error) the mode pill defaults to 'chat' regardless of navigate intent;
  // honor the model's own user_was_imperative + confidence so a clear
  // command still skips the card.
  if (!mode && nav.user_was_imperative && nav.confidence >= 0.9 && !nav.credit_spending) {
    return 'skip-approve';
  }
  return 'approve-card';
}

function summarizePrefill(prefill: Record<string, string>): string {
  const vals = Object.values(prefill || {}).filter(Boolean);
  return vals.join(', ');
}

// Picks the most recent zero-result prompt from localStorage that has not
// already been dismissed this session. Used by the proactive hint at the
// top of the panel. Returns null when nothing applies.
function pickTriedFailedHint(): string | null {
  try {
    const dismissed = new Set(
      JSON.parse(sessionStorage.getItem(TRIED_HINT_DISMISSED_KEY) || '[]') as string[],
    );
    const tried = JSON.parse(localStorage.getItem(TRIED_PROMPTS_KEY) || '{}') as Record<string, number>;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const entries = Object.entries(tried)
      .filter(([p, ts]) => ts >= cutoff && !dismissed.has(p))
      .sort((a, b) => b[1] - a[1]);
    return entries.length ? entries[0][0] : null;
  } catch {
    return null;
  }
}

function markTriedFailedDismissed(prompt: string): void {
  try {
    const dismissed = new Set(
      JSON.parse(sessionStorage.getItem(TRIED_HINT_DISMISSED_KEY) || '[]') as string[],
    );
    dismissed.add(prompt);
    sessionStorage.setItem(TRIED_HINT_DISMISSED_KEY, JSON.stringify(Array.from(dismissed)));
  } catch {
    /* sessionStorage may be disabled */
  }
}

export function ScoutSidePanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useFirebaseAuth();
  const {
    isPanelOpen,
    openPanel,
    closePanel,
    searchHelpContext,
    searchHelpResponse,
    setSearchHelpResponse,
    clearSearchHelp,
    pendingMessage,
    clearPendingMessage,
  } = useScout();
  // Tour demo orchestration — local addition, not in loops-setup-v2.
  // `demoSurface === 'scout'` means the onboarding tour reached the Ask-Scout
  // step; the effect below seeds a synthetic demo thread while it's active.
  const { demoSurface } = useTour();
  const scoutDemoActive = demoSurface === 'scout';
  const panelRef = useRef<HTMLDivElement>(null);
  const [isLoadingSearchHelp, setIsLoadingSearchHelp] = useState(false);

  // Navigate messages that have been acted on (approved, skipped, or
  // populated in place), so the auto-execute effect does not re-fire and the
  // approve card renders collapsed. Lives in component state, which persists
  // because the panel never unmounts.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    messagesEndRef,
    inputRef,
    chatId,
    startNewChat,
    loadChat,
    isLoadingChat,
    appendSyntheticAssistant,
    appendSyntheticUser,
    requestBriefing,
  } = useScoutChat(location.pathname);

  // Phase 4B auto-fire: when the user opens Scout for the very first time
  // (no prior briefing flagged in localStorage AND a fresh chat with zero
  // messages), kick off the strategist briefing once so they land on a
  // profile-grounded plan, not an empty state. Manual button always works
  // regardless of the flag and never resets it. Per-uid key so two users on
  // the same machine each get their own first-time experience.
  const briefingShownKey = user?.uid
    ? `scout_briefing_shown_${user.uid}`
    : null;
  const briefingAutoFiredRef = useRef(false);
  useEffect(() => {
    if (!isPanelOpen) return;
    if (!briefingShownKey) return;
    if (isLoading || isLoadingChat) return;
    if (messages.length > 0) return;
    if (briefingAutoFiredRef.current) return;
    try {
      if (localStorage.getItem(briefingShownKey) === '1') return;
    } catch {
      // Storage disabled; fall back to once-per-session.
    }
    briefingAutoFiredRef.current = true;
    void (async () => {
      const ok = await requestBriefing();
      if (ok) {
        try {
          localStorage.setItem(briefingShownKey, '1');
        } catch {
          // Best-effort; not worth surfacing.
        }
      }
    })();
  }, [isPanelOpen, briefingShownKey, isLoading, isLoadingChat, messages.length, requestBriefing]);

  // The most-recent message carrying an active_strategy payload becomes the
  // source for the header card. Looking at messages in reverse so a fresh
  // briefing supersedes an older one without us tracking strategy state
  // separately.
  const activeStrategy: ScoutActiveStrategy | null = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const s = messages[i]?.activeStrategy;
      if (s) return s;
    }
    return null;
  })();

  // -------------------------------------------------------------------------
  // Sidebar (Phase 5 Stage 3): persisted chat history
  // -------------------------------------------------------------------------
  // Free tier: shows just the current chat row + upgrade affordance, no past
  // chat list (the backend caps list_chats to one for Free). Pro/Elite: shows
  // up to 20 recent chats with a relative timestamp and a strategy dot.
  const userTier = (user?.tier as 'free' | 'pro' | 'elite' | undefined) ?? 'free';
  const isPaidTier = userTier === 'pro' || userTier === 'elite';
  const [chats, setChats] = useState<ScoutChatSummary[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const refreshChats = useCallback(async () => {
    if (!user?.uid) {
      setChats([]);
      return;
    }
    setChatsLoading(true);
    setChatsError(false);
    try {
      const list = await listScoutChats(20);
      setChats(list);
    } catch (e) {
      console.error('[Scout] sidebar list failed:', e);
      setChatsError(true);
    } finally {
      setChatsLoading(false);
    }
  }, [user?.uid]);

  // Refresh the sidebar each time the panel opens, and again whenever the
  // active chat_id changes (so a fresh thread shows up immediately after the
  // first turn lands and the title generation finishes).
  useEffect(() => {
    if (!isPanelOpen) return;
    // Tour demo orchestration — local addition, not in loops-setup-v2.
    // Suppress the real chat-history refetch while the seeded demo is active
    // so the user's actual chats don't bleed into the tour's demo thread.
    if (scoutDemoActive) return;
    void refreshChats();
  }, [isPanelOpen, refreshChats, scoutDemoActive]);

  useEffect(() => {
    if (!isPanelOpen) return;
    // Tour demo orchestration — local addition, not in loops-setup-v2.
    if (scoutDemoActive) return;
    // Small debounce: the backend writes the title asynchronously after the
    // turn responds, so wait briefly before refetching so we pick the new
    // title up on the same render that surfaced the chat_id.
    const t = setTimeout(() => {
      void refreshChats();
    }, 1500);
    return () => clearTimeout(t);
  }, [chatId, isPanelOpen, refreshChats, scoutDemoActive]);

  const handleSidebarChatClick = useCallback(
    async (id: string) => {
      if (id === chatId) return;
      setActiveRowId(id);
      try {
        await loadChat(id);
      } finally {
        setActiveRowId(null);
      }
    },
    [chatId, loadChat],
  );

  const handleNewChatClick = useCallback(() => {
    startNewChat();
  }, [startNewChat]);

  // ── Tour Scout demo orchestration ──────────────────────────────────────
  // Local addition, NOT in loops-setup-v2 — re-ported on top of the branch
  // overwrite (depends on appendSyntheticUser, also re-added to useScoutChat).
  // When the tour reaches the Ask-Scout step, open the panel programmatically
  // and seed a two-turn strategist conversation about reaching Mark Cuban.
  // The seed uses the appendSyntheticUser / appendSyntheticAssistant helpers
  // (purely local, never persisted), and the sidebar history refetch is gated
  // above so the user's real chat list won't pop in alongside the demo.
  // Cleanup closes the panel and clears the seeded thread.
  useEffect(() => {
    if (!scoutDemoActive) return;

    // Open the panel if it isn't already, and start from a clean thread so
    // the demo isn't mixed with a real in-progress chat.
    openPanel();
    clearChat();
    appendSyntheticUser('I want to talk to Mark Cuban');
    appendSyntheticAssistant(
      "Smart goal. Mark's reachable but the angle has to be sharp. Here's how I'd run this:\n\n" +
      "1. Map the path. I'll surface mutual LinkedIn connections with bias toward Shark Tank investors, Cost Plus Drugs operators, and Mavericks-adjacent execs.\n\n" +
      "2. Pick the channel. Skip the public Mavs email (zero signal). Target a referral through someone he's engaged with in the last 30 days.\n\n" +
      "3. Frame the ask. One concrete idea aligned with what he's publicly focused on right now, kept under five sentences.\n\n" +
      "Want me to start mapping connections?"
    );

    return () => {
      // Wipe the seeded thread and close the panel. clearChat is local-only
      // (setMessages([]) + setChatId(null)), so no backend write fires.
      clearChat();
      closePanel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoutDemoActive]);

  // -------------------------------------------------------------------------
  // Navigate execution + the auto-execute effect
  // -------------------------------------------------------------------------

  /** Carry a navigate to its destination: write the bridge, then either
   *  navigate or (if in place) tell the current page to re-read the bridge.
   *  Auto-fired actions (skip-approve, in-place) drop a 5s undo toast that
   *  reverses the navigation - this is the trust hook that lets us be
   *  aggressive about skip-approve without spooking the user (Change 4).
   *  Approve-card actions skip the toast since they were already an explicit
   *  confirmation. */
  const runNavigate = (nav: ScoutNavigate, prefill: Record<string, string>, action: NavAction) => {
    const previousPath = location.pathname + location.search;
    writeScoutPrefill(nav.route, prefill, { auto_submit: !!nav.auto_submit });
    const summary = summarizePrefill(prefill);
    const wasInPlace = action === 'in-place';
    if (wasInPlace) {
      window.dispatchEvent(new CustomEvent(SCOUT_PREFILL_EVENT));
    } else {
      navigate(nav.route);
    }
    if (action === 'approve-card') return;
    // Toast copy depends on whether the page is going to run the search
    // automatically or just populate the form. Auto-submit means "Scout is
    // running it for you"; non-auto means "Scout set it up, you click Search."
    const title = nav.auto_submit
      ? `Scout is running your search`
      : wasInPlace
      ? `Scout filled in ${nav.route}`
      : `Scout took you to ${nav.route}`;
    toast({
      title,
      description: summary || undefined,
      duration: 5000,
      action: (
        <button
          type="button"
          onClick={() => {
            // Clear the prefill envelope first so a stray re-mount of the
            // destination page does not pick it up after we leave.
            try {
              sessionStorage.removeItem('scout_prefill');
            } catch {
              /* sessionStorage may be disabled */
            }
            if (!wasInPlace && previousPath) {
              navigate(previousPath);
            }
          }}
          className="text-xs font-medium text-[var(--brand-blue)] hover:underline"
        >
          Undo
        </button>
      ) as React.ReactElement,
    });
  };

  // Auto-run the navigates that need no card: in-place populate and
  // skip-approve. Fires once per navigate message; approve-card navigates wait
  // for the user to click Approve on the card.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.isStreaming) return;
    if (last.tool !== 'navigate' || !last.navigate) return;
    if (resolvedIds.has(last.id)) return;
    const action = decideNavAction(last.navigate, last.mode);
    if (action === 'approve-card') return;
    setResolvedIds((prev) => new Set(prev).add(last.id));
    runNavigate(last.navigate, last.navigate.prefill, action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, resolvedIds]);

  /** Approve-card click: the user OK'd (and maybe edited) the prefill.
   *  runNavigate handles the bridge write + navigation; passing
   *  'approve-card' as the action suppresses the undo toast since this was
   *  already an explicit confirmation. */
  const handleApprove = (id: string, nav: ScoutNavigate, prefill: Record<string, string>) => {
    setResolvedIds((prev) => new Set(prev).add(id));
    runNavigate(nav, prefill, 'approve-card');
  };

  /** CTA chip click (Change 6): single-chip bridge to a workflow. */
  const handleCtaAction = useCallback((cta: ScoutCta) => {
    writeScoutPrefill(cta.route, cta.prefill || {});
    if (location.pathname === cta.route) {
      window.dispatchEvent(new CustomEvent(SCOUT_PREFILL_EVENT));
    } else {
      navigate(cta.route);
    }
    closePanel();
  }, [location.pathname, navigate, closePanel]);

  /** Plan-checklist "Do this" click (Change 5): take a single step to its
   *  page. The step's route is the same shape as a navigate route, so we use
   *  the bridge. */
  const handlePlanStep = useCallback((step: ScoutPlanStep) => {
    if (!step.route) return;
    writeScoutPrefill(step.route, {});
    if (location.pathname === step.route) {
      window.dispatchEvent(new CustomEvent(SCOUT_PREFILL_EVENT));
    } else {
      navigate(step.route);
    }
    closePanel();
  }, [location.pathname, navigate, closePanel]);

  // -------------------------------------------------------------------------
  // Tried-and-failed proactive hint (Change 3)
  // -------------------------------------------------------------------------
  const [triedHint, setTriedHint] = useState<string | null>(null);
  useEffect(() => {
    if (!isPanelOpen) {
      setTriedHint(null);
      return;
    }
    // Only show the hint on a fresh empty chat where the user hasn't typed
    // anything yet. After they engage, the hint stops being relevant.
    if (messages.length === 0) {
      setTriedHint(pickTriedFailedHint());
    }
  }, [isPanelOpen, messages.length]);

  const handleHintWiden = useCallback((prompt: string) => {
    setTriedHint(null);
    markTriedFailedDismissed(prompt);
    void sendMessage(`Last time I tried "${prompt}" and got nothing. Widen it for me.`);
  }, [sendMessage]);

  const handleHintDismiss = useCallback(() => {
    if (triedHint) markTriedFailedDismissed(triedHint);
    setTriedHint(null);
  }, [triedHint]);

  // -------------------------------------------------------------------------
  // Post-result celebration: when a Scout-driven workflow (auto_submit
  // contact / firm search) lands its results on the destination page, the
  // page dispatches SCOUT_SEARCH_COMPLETED_EVENT. We listen here and post a
  // synthetic assistant message into the chat with a CTA chip back to the
  // results page. The chat is the orchestrator surface: even when the user
  // is on the destination page, the celebration belongs in the chat so the
  // round trip is visible from Scout.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onCompleted = (e: Event) => {
      const detail = (e as CustomEvent<ScoutSearchCompletedDetail>).detail;
      if (!detail) return;
      const count = typeof detail.count === 'number' ? detail.count : 0;
      // Default to the My Network tab matching the source page. The
      // unified /my-network/{tab} view is the canonical home for saved
      // people and companies (legacy standalone trackers were retired),
      // so anything Scout drives points there.
      const wasContacts = detail.route === '/contact-search';
      const resultsRoute = detail.results_route
        || (wasContacts ? '/my-network/people' : '/my-network/companies');
      const subject = wasContacts ? 'contact' : 'firm';
      const subjectPlural = wasContacts ? 'contacts' : 'firms';
      const chipLabel = wasContacts ? 'Open your network' : 'Open your companies';
      const content = count === 0
        ? `Search ran, no ${subjectPlural} this time. Want me to widen it?`
        : count === 1
        ? `Found 1 ${subject}. Pick who to reach out to or open your full list.`
        : `Found ${count} ${subjectPlural}. Pick who to reach out to or open your full list.`;
      appendSyntheticAssistant(content, {
        mode: 'do',
        cta: count === 0
          ? null
          : {
              label: chipLabel,
              route: resultsRoute,
              prefill: {},
              credit_spending: false,
              credit_cost: null,
            },
      });
    };
    window.addEventListener(SCOUT_SEARCH_COMPLETED_EVENT, onCompleted);
    return () => window.removeEventListener(SCOUT_SEARCH_COMPLETED_EVENT, onCompleted);
  }, [appendSyntheticAssistant]);

  // -------------------------------------------------------------------------
  // Search help (failed-search recovery) - unchanged, legacy channel
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isPanelOpen && searchHelpContext && !searchHelpResponse) {
      fetchSearchHelp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOpen, searchHelpContext, searchHelpResponse]);

  useEffect(() => {
    if (!isPanelOpen) {
      const timer = setTimeout(() => {
        clearSearchHelp();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isPanelOpen, clearSearchHelp]);

  const fetchSearchHelp = async () => {
    if (!searchHelpContext) return;
    setIsLoadingSearchHelp(true);
    try {
      const { auth } = await import('@/lib/firebase');
      const firebaseUser = auth.currentUser;
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;

      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/search-help`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          search_type: searchHelpContext.searchType,
          failed_search_params: searchHelpContext.failedSearchParams,
          error_type: searchHelpContext.errorType,
          user_info: { name: user?.name || 'there' },
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data: SearchHelpResponse = await response.json();
      setSearchHelpResponse(data);
    } catch (error) {
      console.error('[Scout] Search help error:', error);
      setSearchHelpResponse({
        message:
          searchHelpContext.searchType === 'contact'
            ? "I couldn't find contacts matching your search. Try different job titles or a broader location."
            : "I couldn't find firms matching your search. Try different industry terms or a broader location.",
        suggestions: [],
        auto_populate: searchHelpContext.failedSearchParams,
        search_type: searchHelpContext.searchType,
        action: 'retry_search',
      });
    } finally {
      setIsLoadingSearchHelp(false);
    }
  };

  const handleContinue = () => {
    if (!searchHelpResponse) return;
    sessionStorage.setItem(
      AUTO_POPULATE_KEY,
      JSON.stringify({
        search_type: searchHelpResponse.search_type,
        auto_populate: searchHelpResponse.auto_populate,
      }),
    );
    const targetRoute = searchHelpResponse.search_type === 'contact' ? '/find' : '/find?tab=companies';
    closePanel();
    if (location.pathname !== targetRoute) {
      navigate(targetRoute);
    } else {
      window.dispatchEvent(new CustomEvent('scout-auto-populate'));
    }
  };

  // -------------------------------------------------------------------------
  // Panel chrome
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPanelOpen) closePanel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPanelOpen, closePanel]);

  useEffect(() => {
    if (isPanelOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isPanelOpen]);

  useEffect(() => {
    if (isPanelOpen && !searchHelpContext) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isPanelOpen, inputRef, searchHelpContext]);

  // Auto-send a pending message (the home-page "Ask Scout" box, briefing
  // chips). The message is captured and sent synchronously: clearPendingMessage
  // sets pendingMessage to null, which re-runs this effect, so a deferred send
  // (setTimeout) would be cancelled by this effect's own cleanup before it
  // fired. The re-run hits the early return below, so the send happens once.
  useEffect(() => {
    if (!isPanelOpen || !pendingMessage) return;
    const msg = pendingMessage;
    clearPendingMessage();
    void sendMessage(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOpen, pendingMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isSearchHelpMode = !!searchHelpContext;

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Overlay - closes panel on click */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel. Chat mode is wider to accommodate the persisted-chat sidebar
          AND briefing prose with deep-link URLs that don't wrap mid-token.
          Search-help mode keeps the legacy width. */}
      <div
        ref={panelRef}
        className={
          'fixed right-0 top-0 z-50 h-full w-full bg-white shadow-xl flex flex-col transform transition-transform duration-300 ease-out rounded-l-2xl ' +
          (isSearchHelpMode
            ? 'sm:w-[420px]'
            : 'sm:w-[640px] md:w-[760px] lg:w-[860px]')
        }
        style={{ animation: 'slideIn 0.3s ease-out forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h1 className="text-base font-medium text-gray-900">Ask Scout</h1>
          <div className="flex items-center gap-1">
            {!isSearchHelpMode && messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={closePanel}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search help mode */}
          {isSearchHelpMode && (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoadingSearchHelp ? (
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                  <div className="w-12 h-12 rounded-full bg-[#FFF7EA] flex items-center justify-center mb-4 overflow-hidden">
                    <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Analyzing your search...</span>
                  </div>
                </div>
              ) : searchHelpResponse ? (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 max-w-[85%]">
                      <div className="bg-gray-100 rounded-3xl rounded-bl-md px-4 py-2.5">
                        <p className="text-sm text-gray-900 leading-relaxed">{searchHelpResponse.message}</p>
                      </div>

                      {searchHelpResponse.refined_prompts && searchHelpResponse.refined_prompts.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {searchHelpResponse.refined_prompts.map((rp, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                try {
                                  sessionStorage.setItem(
                                    AUTO_POPULATE_KEY,
                                    JSON.stringify({
                                      search_type: 'contact',
                                      auto_populate: { prompt: rp.prompt, autoSubmit: true },
                                    }),
                                  );
                                } catch {
                                  /* sessionStorage may be disabled - non-fatal */
                                }
                                closePanel();
                                if (location.pathname !== '/find') {
                                  navigate('/find');
                                } else {
                                  window.dispatchEvent(new CustomEvent('scout-auto-populate'));
                                }
                              }}
                              className="w-full text-left flex flex-col gap-1.5 px-3.5 py-3 bg-white rounded-xl border border-[#EEF2F8] hover:border-[#3B82F6] hover:bg-[#FAFBFF] transition-colors"
                            >
                              <div className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-[rgba(59,130,246,0.10)] text-[#3B82F6] text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <span className="text-sm text-gray-900 font-medium leading-snug">{rp.prompt}</span>
                              </div>
                              {rp.rationale && (
                                <span className="text-xs text-gray-500 leading-snug pl-7">{rp.rationale}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        searchHelpResponse.suggestions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {searchHelpResponse.suggestions.map((suggestion, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-[#FAFBFF] rounded-xl border border-[#EEF2F8]">
                                <span className="w-5 h-5 rounded-full bg-[rgba(59,130,246,0.10)] text-[#3B82F6] text-xs font-medium flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <span className="text-sm text-gray-800">{suggestion}</span>
                              </div>
                            ))}
                          </div>
                        )
                      )}

                      {(!searchHelpResponse.refined_prompts || searchHelpResponse.refined_prompts.length === 0) && (
                        <div className="mt-4">
                          <button
                            onClick={handleContinue}
                            className="px-4 py-2 rounded-xl bg-[#0F172A] text-white text-sm font-medium hover:bg-[#1E293B] transition-colors"
                          >
                            Continue
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Chat mode */}
          {!isSearchHelpMode && (
            <div className="flex-1 flex overflow-hidden">
              {/* Sidebar (chat history). Always rendered, even on Free, so the
                  current chat row stays visible and the upgrade affordance has
                  somewhere to live. */}
              <aside className="w-44 flex-shrink-0 border-r border-gray-100 bg-white flex flex-col">
                <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <History className="h-3.5 w-3.5" />
                    <span>Chats</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleNewChatClick}
                    className="p-1 text-gray-400 hover:text-[#3B82F6] hover:bg-[#FAFBFF] rounded-md transition-colors"
                    aria-label="Start a new chat"
                    title="New chat"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-2">
                  {chatsLoading && chats.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-400">Loading...</div>
                  ) : chatsError ? (
                    <div className="px-2 py-3 text-xs text-gray-500">
                      Could not load history.{' '}
                      <button
                        type="button"
                        onClick={() => void refreshChats()}
                        className="text-[#3B82F6] hover:underline"
                      >
                        Retry
                      </button>
                    </div>
                  ) : chats.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-400">
                      No chats yet.
                    </div>
                  ) : (
                    <ul className="space-y-0.5">
                      {chats.map((row) => {
                        const isActive = row.chat_id === chatId;
                        const isLoadingRow = activeRowId === row.chat_id && isLoadingChat;
                        return (
                          <li key={row.chat_id}>
                            <button
                              type="button"
                              onClick={() => void handleSidebarChatClick(row.chat_id)}
                              disabled={isLoadingRow}
                              className={
                                'w-full text-left px-2.5 py-2 rounded-md transition-colors group ' +
                                (isActive
                                  ? 'bg-[#FAFBFF] border border-[#E0EAFF]'
                                  : 'border border-transparent hover:bg-gray-50')
                              }
                              title={row.title}
                            >
                              <div className="flex items-start gap-1.5">
                                {row.active_strategy_id ? (
                                  <span
                                    className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#3B82F6] flex-shrink-0"
                                    aria-label="Chat had an active strategy"
                                  />
                                ) : (
                                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-gray-900 truncate">
                                    {row.title || 'New chat'}
                                  </div>
                                  <div className="text-[11px] text-gray-400 flex items-center gap-1">
                                    {isLoadingRow ? (
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                    ) : (
                                      <span>{formatRelativeTime(row.last_active_at)}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {!isPaidTier && (
                  <div className="px-3 py-2.5 border-t border-gray-100 flex items-start gap-1.5 text-[11px] text-gray-500 leading-snug">
                    <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>
                      Upgrade to Pro to keep chat history beyond today.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          closePanel();
                          navigate('/pricing');
                        }}
                        className="text-[#3B82F6] hover:underline font-medium"
                      >
                        See plans
                      </button>
                    </span>
                  </div>
                )}
              </aside>

              {/* Chat column */}
              <div className="flex-1 flex flex-col overflow-hidden">
              {/* Phase 4B (D2-A): persistent active-strategy card lives in
                  the chat column header so step progress is always-on context
                  while the user scrolls older messages. Hidden when there is
                  no strategy yet, so the empty-state hero is uncluttered. */}
              {activeStrategy && (
                <ActiveStrategyCard strategy={activeStrategy} />
              )}
              <div className="flex-1 overflow-y-auto">
                <div className="px-5 py-4">
                  {/* Empty state */}
                  {messages.length === 0 && (
                    <div className="flex flex-col">
                      <div className="flex justify-center mb-6 pt-4">
                        <div className="w-14 h-14 rounded-full bg-[#FFF7EA] flex items-center justify-center overflow-hidden">
                          <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                        </div>
                      </div>
                      <div className="flex gap-3 mb-5">
                        <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                          <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                        </div>
                        <div className="max-w-[85%]">
                          <div className="bg-gray-100 rounded-3xl rounded-bl-md px-4 py-2.5">
                            <p className="text-sm text-gray-900 leading-relaxed">
                              Need help finding people, companies, or something else?
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Phase 4B: primary briefing CTA above the suggested
                          chips. Auto-fires once for new users via the effect
                          above; this button is the manual re-fire path. */}
                      <div className="ml-10 mb-3">
                        <BriefingButton
                          onClick={() => void requestBriefing()}
                          isLoading={isLoading}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
                        {(SCOUT_CHIPS_BY_PAGE[location.pathname] ?? SUGGESTED_QUESTIONS).map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => sendMessage(question)}
                            className="text-left px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-[#3B82F6] hover:bg-[#FAFBFF]/50 text-sm text-gray-700 transition-colors"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tried-and-failed proactive hint (Change 3). Only on a
                      fresh empty chat. */}
                  {messages.length === 0 && triedHint && (
                    <ScoutTriedFailedHint
                      triedPrompt={triedHint}
                      onWiden={handleHintWiden}
                      onDismiss={handleHintDismiss}
                    />
                  )}

                  {/* Messages */}
                  {messages.length > 0 && (
                    <div className="space-y-4">
                      {messages.map((message) => {
                        const showCard =
                          message.role === 'assistant' &&
                          message.tool === 'navigate' &&
                          !!message.navigate &&
                          decideNavAction(message.navigate, message.mode) === 'approve-card';
                        const showModePill = message.role === 'assistant' && !!message.mode && !message.isStreaming;
                        const liveEvents = (message.toolEvents || []).filter(e => !e.done);
                        const doneEvents = (message.toolEvents || []).filter(e => e.done);
                        return (
                          <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {message.role === 'assistant' ? (
                              <div className="flex gap-3 max-w-[85%]">
                                <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                                  <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  {/* Mode receipt pill above the response */}
                                  {showModePill && (
                                    <div>
                                      <ScoutModePill mode={message.mode!} />
                                    </div>
                                  )}
                                  {/* Done tool pills (Change 1) - sit above
                                      the prose so the user sees what Scout
                                      looked at before reading the answer. */}
                                  {doneEvents.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                      {doneEvents.map(evt => (
                                        <ScoutToolPill key={evt.id} event={evt} />
                                      ))}
                                    </div>
                                  )}
                                  {message.content && (
                                    <div className="bg-gray-100 rounded-3xl rounded-bl-md px-4 py-2.5">
                                      <div
                                        className="text-sm text-gray-900 leading-relaxed [overflow-wrap:anywhere] break-words"
                                        // Intercept clicks on chips marked
                                        // data-scout-link so they route via
                                        // react-router instead of triggering
                                        // a full page reload (which would
                                        // close the Scout panel).
                                        onClick={(e) => {
                                          const target = e.target as HTMLElement
                                          const link = target.closest('a[data-scout-link]') as HTMLAnchorElement | null
                                          if (!link) return
                                          const href = link.getAttribute('href') || ''
                                          if (!href.startsWith('/')) return
                                          e.preventDefault()
                                          closePanel()
                                          navigate(href)
                                        }}
                                        dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                                      />
                                      {/* Phase 4B (E1): inline coverage gauge
                                          on briefing messages. The component
                                          self-hides above 90% so finished
                                          profiles don't see ambient noise. */}
                                      {message.coverage && !message.isStreaming && (
                                        <CompletenessGauge coverage={message.coverage} />
                                      )}
                                    </div>
                                  )}
                                  {/* Live tool pills (still running) - shown
                                      below the prose so they animate without
                                      pushing earlier content up. */}
                                  {liveEvents.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                      {liveEvents.map(evt => (
                                        <ScoutToolPill key={evt.id} event={evt} />
                                      ))}
                                    </div>
                                  )}
                                  {/* Plan checklist (Change 5) */}
                                  {message.plan && (
                                    <ScoutPlanChecklist
                                      plan={message.plan}
                                      onStepAction={handlePlanStep}
                                    />
                                  )}
                                  {/* CTA chip (Change 6) - single bridge,
                                      never paragraphed prose. */}
                                  {message.cta && (
                                    <ScoutCtaChip
                                      cta={message.cta}
                                      onAction={handleCtaAction}
                                    />
                                  )}
                                  {showCard && message.navigate && (
                                    <ScoutApproveCard
                                      navigate={message.navigate}
                                      resolved={resolvedIds.has(message.id)}
                                      onApprove={(prefill) => handleApprove(message.id, message.navigate!, prefill)}
                                    />
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="max-w-[85%]">
                                <div className="bg-[var(--brand-blue)] text-white rounded-3xl rounded-br-md px-4 py-2.5">
                                  <p className="text-sm leading-relaxed">{message.content}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Loading indicator (Change 1). The old cycling
                          SCOUT_LOADING_MESSAGES is gone: live tool pills
                          render inline on each assistant message instead.
                          We still show a minimal "thinking" dot while we
                          wait for the very first event of the turn so the
                          panel does not feel frozen. */}
                      {isLoading && !messages.some((m) => m.isStreaming && (m.content || (m.toolEvents && m.toolEvents.length > 0))) && (
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                            <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg-surface)] px-2.5 py-1 text-xs text-[var(--brand-ink-secondary)]">
                            <Loader2 className="h-3 w-3 animate-spin text-[var(--brand-blue)]" />
                            <span>Thinking…</span>
                          </div>
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </div>

              {/* Input */}
              <div className="px-5 py-4 flex-shrink-0">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Scout anything..."
                    className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
                    disabled={isLoading}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white bg-[#0F172A] hover:bg-[#1E293B] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    aria-label="Send message"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 text-center mt-2">Free to chat</p>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ScoutSidePanel;
