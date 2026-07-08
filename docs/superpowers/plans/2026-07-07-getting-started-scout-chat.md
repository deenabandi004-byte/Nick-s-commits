# Getting Started = Scout Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Getting Started page (`/dashboard`) becomes a full-page Scout chat that shares one live conversation with the Ask Scout side panel.

**Architecture:** Lift the single `useScoutChat()` instance plus all once-only side effects (navigate auto-execution, celebration listener, pending-message send) into a new `ScoutChatProvider` mounted in `App.tsx`. Extract the chat UI (empty state, message list, composer) from `ScoutSidePanel` into a reusable `ScoutChatThread` component with a `variant: 'panel' | 'page'` prop. The panel and the rewritten `DashboardPage` both render `ScoutChatThread`; they display the same state so they stay in sync automatically.

**Tech Stack:** React 18 + TypeScript + Vite, react-router-dom, Tailwind + inline brand CSS vars. Spec: `docs/superpowers/specs/2026-07-07-getting-started-scout-chat-design.md`.

## Global Constraints

- No backend changes. `useScoutChat` internals unchanged (its `inputRef`/`messagesEndRef` become unused-but-harmless; each `ScoutChatThread` owns local refs).
- No new npm packages (so no `vite.config.ts` chunk changes needed).
- Both views can be mounted at once — every effect that must fire exactly once per event lives in `ScoutChatProvider`, never in `ScoutChatThread`.
- Chat-history sidebar, search-help mode, tried-and-failed hint, and the tour demo stay in `ScoutSidePanel` only.
- Ask Scout button / Cmd+K behavior unchanged (opens panel on every page, including `/dashboard`).
- No emojis in UI; lucide icons only. Brand vars (`--brand-*`) and existing class idioms.
- Frontend has no test framework: each task verifies with `npx tsc --noEmit` (from `connect-grow-hire/`), and the final task does a build + manual browser QA.

---

### Task 1: `ScoutChatProvider` — one shared chat instance

**Files:**
- Create: `connect-grow-hire/src/contexts/ScoutChatContext.tsx`
- Modify: `connect-grow-hire/src/App.tsx` (wrap children of `<ScoutProvider>`)

**Interfaces:**
- Consumes: `useScoutChat` from `@/hooks/useScoutChat`, `useScout` from `@/contexts/ScoutContext`, scoutBridge helpers.
- Produces (used by Tasks 2–4):
  - `useScoutChatShared(): ScoutChatSharedValue` — everything `UseScoutChatReturn` has, plus `scoutCurrentPage: string`, `activeStrategy: ScoutActiveStrategy | null`, `resolvedIds: Set<string>`, `handleApprove(id, nav, prefill)`, `handleCtaAction(cta)`, `handlePlanStep(step)`, `handleInlineLink(href)`.
  - `decideNavAction(nav: ScoutNavigate, mode?: ScoutMode | null): NavAction` (moved verbatim from `ScoutSidePanel.tsx:69-84`, now exported).

- [ ] **Step 1: Create `connect-grow-hire/src/contexts/ScoutChatContext.tsx`**

```tsx
/**
 * ScoutChatContext - THE single Scout conversation.
 *
 * One useScoutChat() instance lives here so every surface that renders the
 * chat (the Ask Scout side panel, the Getting Started page) shows the same
 * live thread. Everything that must fire exactly once per event regardless
 * of how many views are mounted also lives here: navigate auto-execution,
 * the post-search celebration listener, and the pending-message auto-send.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useScout } from '@/contexts/ScoutContext';
import {
  useScoutChat,
  type UseScoutChatReturn,
  type ScoutNavigate,
  type ScoutMode,
  type ScoutCta,
  type ScoutPlanStep,
  type ScoutActiveStrategy,
} from '@/hooks/useScoutChat';
import { toast } from '@/hooks/use-toast';
import {
  writeScoutPrefill,
  SCOUT_PREFILL_EVENT,
  SCOUT_SEARCH_COMPLETED_EVENT,
  isSameScoutPage,
  scoutPageIdentity,
  type ScoutSearchCompletedDetail,
} from '@/lib/scoutBridge';

// ---------------------------------------------------------------------------
// Three-rule decision for a navigate tool call (moved from ScoutSidePanel).
// Mode is the primary signal; the legacy 0.9+imperative rule remains a
// fallback so local dev still works when the classifier is unavailable.
// ---------------------------------------------------------------------------
export type NavAction = 'in-place' | 'skip-approve' | 'approve-card';

export function decideNavAction(nav: ScoutNavigate, mode?: ScoutMode | null): NavAction {
  if (nav.already_on_page) return 'in-place';
  if (mode === 'do') return 'skip-approve';
  if (!mode && nav.user_was_imperative && nav.confidence >= 0.9) {
    return 'skip-approve';
  }
  return 'approve-card';
}

function summarizePrefill(prefill: Record<string, string>): string {
  const vals = Object.values(prefill || {}).filter(Boolean);
  return vals.join(', ');
}

export interface ScoutChatSharedValue extends UseScoutChatReturn {
  /** pathname (+ ?tab=) sent to Scout as page context; also keys chips. */
  scoutCurrentPage: string;
  /** Most recent active_strategy payload in the thread, or null. */
  activeStrategy: ScoutActiveStrategy | null;
  /** Navigate messages already acted on (approve card renders collapsed). */
  resolvedIds: Set<string>;
  handleApprove: (id: string, nav: ScoutNavigate, prefill: Record<string, string>) => void;
  handleCtaAction: (cta: ScoutCta) => void;
  handlePlanStep: (step: ScoutPlanStep) => void;
  /** Click on an inline data-scout-link chip inside assistant prose. */
  handleInlineLink: (href: string) => void;
}

const ScoutChatSharedContext = createContext<ScoutChatSharedValue | undefined>(undefined);

export function useScoutChatShared(): ScoutChatSharedValue {
  const ctx = useContext(ScoutChatSharedContext);
  if (!ctx) throw new Error('useScoutChatShared must be used within a ScoutChatProvider');
  return ctx;
}

export function ScoutChatProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isPanelOpen, closePanel, pendingMessage, clearPendingMessage } = useScout();

  // Page context sent to Scout. The bare pathname collapses the Find tabs
  // into one page, so carry the tab param when present. Other query params
  // are deliberately dropped (noise for the model, churns the context cache).
  const tabParam = new URLSearchParams(location.search).get('tab');
  const scoutCurrentPage = tabParam
    ? `${location.pathname}?tab=${tabParam}`
    : location.pathname;

  const chat = useScoutChat(scoutCurrentPage);
  const { messages, sendMessage, appendSyntheticAssistant } = chat;

  // Navigate messages that have been acted on. Lives here (not in a view)
  // so a dual mount can never double-fire the auto-execute effect.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  // The most-recent message carrying an active_strategy payload.
  const activeStrategy: ScoutActiveStrategy | null = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const s = messages[i]?.activeStrategy;
      if (s) return s;
    }
    return null;
  })();

  /** Carry a navigate to its destination: write the bridge, then either
   *  navigate or (if in place) tell the current page to re-read the bridge.
   *  Auto-fired actions drop a 5s undo toast; approve-card actions skip it. */
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
  // skip-approve. Fires once per navigate message.
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

  const handleApprove = (id: string, nav: ScoutNavigate, prefill: Record<string, string>) => {
    setResolvedIds((prev) => new Set(prev).add(id));
    runNavigate(nav, prefill, 'approve-card');
  };

  /** CTA chip click: single-chip bridge to a workflow. */
  const handleCtaAction = useCallback((cta: ScoutCta) => {
    writeScoutPrefill(cta.route, cta.prefill || {});
    const query = new URLSearchParams(cta.route.split('?')[1] || '');
    query.delete('tab');
    const hasDeepLinkParams = [...query.keys()].length > 0;
    if (!hasDeepLinkParams && isSameScoutPage(location.pathname + location.search, cta.route)) {
      window.dispatchEvent(new CustomEvent(SCOUT_PREFILL_EVENT));
    } else {
      navigate(cta.route);
    }
    closePanel();
  }, [location.pathname, location.search, navigate, closePanel]);

  /** Plan-checklist "Do this" click: take a single step to its page. */
  const handlePlanStep = useCallback((step: ScoutPlanStep) => {
    if (!step.route) return;
    writeScoutPrefill(step.route, {});
    if (isSameScoutPage(location.pathname + location.search, step.route)) {
      window.dispatchEvent(new CustomEvent(SCOUT_PREFILL_EVENT));
    } else {
      navigate(step.route);
    }
    closePanel();
  }, [location.pathname, location.search, navigate, closePanel]);

  /** Inline data-scout-link chip inside assistant prose. */
  const handleInlineLink = useCallback((href: string) => {
    closePanel();
    navigate(href);
  }, [closePanel, navigate]);

  // Post-result celebration: when a Scout-driven workflow lands its results,
  // the destination page dispatches SCOUT_SEARCH_COMPLETED_EVENT and we post
  // a synthetic assistant message with a CTA chip back to the results page.
  // Singleton: lives here so a dual mount can't append the message twice.
  useEffect(() => {
    const onCompleted = (e: Event) => {
      const detail = (e as CustomEvent<ScoutSearchCompletedDetail>).detail;
      if (!detail) return;
      const count = typeof detail.count === 'number' ? detail.count : 0;
      const sourceId = scoutPageIdentity(detail.route || '');
      const wasContacts = !(sourceId.path === '/find' && sourceId.tab === 'companies');
      const resultsRoute = detail.results_route
        || (wasContacts ? '/my-network/people' : '/my-network/companies');
      const subject = wasContacts ? 'contact' : 'firm';
      const subjectPlural = wasContacts ? 'contacts' : 'firms';
      const chipLabel = wasContacts ? 'Open your network' : 'Open your companies';
      const names = Array.isArray(detail.names) ? detail.names.filter(Boolean) : [];
      const namesLine = names.length
        ? ` ${names.slice(0, 3).join(', ')}${count > 3 ? ` and ${count - 3} more` : ''}.`
        : '';
      const content = count === 0
        ? `Search ran, no ${subjectPlural} this time. Want me to widen it?`
        : count === 1
        ? `Found 1 ${subject}:${namesLine || ' pick who to reach out to or open your full list.'}`
        : `Found ${count} ${subjectPlural}:${namesLine} Pick who to reach out to or open your full list.`;
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

  // Auto-send a pending message (briefing chips, openPanelWithMessage). The
  // message is captured and sent synchronously: clearPendingMessage re-runs
  // this effect, which hits the early return, so the send happens once.
  useEffect(() => {
    if (!isPanelOpen || !pendingMessage) return;
    const msg = pendingMessage;
    clearPendingMessage();
    void sendMessage(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOpen, pendingMessage]);

  return (
    <ScoutChatSharedContext.Provider
      value={{
        ...chat,
        scoutCurrentPage,
        activeStrategy,
        resolvedIds,
        handleApprove,
        handleCtaAction,
        handlePlanStep,
        handleInlineLink,
      }}
    >
      {children}
    </ScoutChatSharedContext.Provider>
  );
}
```

- [ ] **Step 2: Mount the provider in `App.tsx`**

Add the import next to the ScoutContext import (`App.tsx:12`):

```tsx
import { ScoutChatProvider } from "./contexts/ScoutChatContext";
```

Wrap the children of `<ScoutProvider>` (currently `App.tsx:691-704`):

```tsx
                <ScoutProvider>
                  <ScoutChatProvider>
                    <TourProvider>
                      <KeyboardShortcutHandler />
                      <PageviewTracker />
                      <AgentNotifierMount />
                      <LoginNotification />
                      <PendingShareModal />
                      <AppRoutes />
                      <NotOnPromo>
                        <ScoutSidePanel />
                        <FloatingAskScoutButton />
                      </NotOnPromo>
                    </TourProvider>
                  </ScoutChatProvider>
                </ScoutProvider>
```

(`ScoutChatProvider` needs the router and `ScoutProvider` above it; both hold. `useScoutChat` also needs `FirebaseAuthProvider`, which wraps everything.)

- [ ] **Step 3: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: exit 0 (same as before the change — run once before editing if unsure of the baseline).

- [ ] **Step 4: Commit**

```bash
git add connect-grow-hire/src/contexts/ScoutChatContext.tsx connect-grow-hire/src/App.tsx
git commit -m "feat(scout): ScoutChatProvider owns the single shared chat instance"
```

---

### Task 2: `ScoutChatThread` — the reusable chat UI

**Files:**
- Create: `connect-grow-hire/src/components/scout/ScoutChatThread.tsx`

**Interfaces:**
- Consumes: `useScoutChatShared()`, `decideNavAction` (Task 1); existing components `ScoutApproveCard`, `ScoutModePill`, `ScoutToolPill`, `ScoutPlanChecklist`, `ScoutCtaChip`, `BriefingButton`, `CompletenessGauge`, `ActiveStrategyCard`; `formatMessage` from `@/hooks/useScoutChat`; chips from `@/data/scout-knowledge`.
- Produces: `ScoutChatThread({ variant, emptyStateExtra? })` — `variant: 'panel' | 'page'`; `emptyStateExtra?: React.ReactNode` renders under the empty-state chips (the panel passes the tried-and-failed hint).

- [ ] **Step 1: Create `connect-grow-hire/src/components/scout/ScoutChatThread.tsx`**

The message-list JSX is moved verbatim from `ScoutSidePanel.tsx:960-1094` with three substitutions: handlers come from `useScoutChatShared()`, the inline-link `onClick` calls `handleInlineLink(href)`, and the scroll anchor is a local ref.

```tsx
/**
 * ScoutChatThread - the Scout conversation UI, shared by the Ask Scout side
 * panel (variant="panel") and the Getting Started page (variant="page").
 *
 * Pure view: all chat state and once-only side effects live in
 * ScoutChatProvider. Rendering two threads at once is a supported state -
 * they show the same messages and stay in sync automatically.
 *
 * Variant differences are layout-only:
 *  - panel: compact paddings, yeti-hero empty state with BriefingButton.
 *  - page:  Lovable-style empty state (serif heading + large prompt box +
 *           suggestion chips centered mid-page); once messages exist, a
 *           centered column with the composer pinned at the bottom.
 */
import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp, Loader2, Send } from 'lucide-react';
import { formatMessage } from '@/hooks/useScoutChat';
import { useScoutChatShared, decideNavAction } from '@/contexts/ScoutChatContext';
import { BriefingButton } from '@/components/scout/BriefingButton';
import { CompletenessGauge } from '@/components/scout/CompletenessGauge';
import { ActiveStrategyCard } from '@/components/scout/ActiveStrategyCard';
import { ScoutApproveCard } from '@/components/ScoutApproveCard';
import {
  ScoutModePill,
  ScoutToolPill,
  ScoutPlanChecklist,
  ScoutCtaChip,
} from '@/components/ScoutChatExtras';
import { SUGGESTED_QUESTIONS, SCOUT_CHIPS_BY_PAGE } from '@/data/scout-knowledge';
import ScoutYetiHead from '@/assets/scouts/scout-yeti-head.png';

interface ScoutChatThreadProps {
  variant: 'panel' | 'page';
  /** Rendered under the empty-state chips. Panel passes the tried hint. */
  emptyStateExtra?: React.ReactNode;
}

export function ScoutChatThread({ variant, emptyStateExtra }: ScoutChatThreadProps) {
  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    requestBriefing,
    scoutCurrentPage,
    activeStrategy,
    resolvedIds,
    handleApprove,
    handleCtaAction,
    handlePlanStep,
    handleInlineLink,
  } = useScoutChatShared();
  const location = useLocation();

  // Local DOM refs: with two threads potentially mounted at once, the
  // hook-level shared refs can't serve both, so each view scrolls and
  // focuses itself.
  const localInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus on mount. The panel returns null while closed, so its thread
  // mounts fresh on every open - this replaces the old focus-on-open effect.
  useEffect(() => {
    const t = setTimeout(() => localInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const chips =
    SCOUT_CHIPS_BY_PAGE[scoutCurrentPage] ??
    SCOUT_CHIPS_BY_PAGE[location.pathname] ??
    SUGGESTED_QUESTIONS;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ------------------------------------------------------------------
  // Page hero: Lovable-style empty state (heading + big box + chips)
  // ------------------------------------------------------------------
  if (variant === 'page' && messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-auto flex w-full max-w-[760px] flex-col px-5"
          style={{ paddingTop: '12vh', paddingBottom: 48 }}
        >
          <h1
            className="mb-6 text-center text-3xl sm:text-4xl"
            style={{ fontFamily: "var(--font-display, 'Instrument Serif', Georgia, serif)", fontWeight: 400 }}
          >
            What can Scout do for you?
          </h1>
          <div
            className="relative w-full bg-white"
            style={{
              border: '1px solid var(--brand-border)',
              borderRadius: 12,
              padding: '14px 16px',
              minHeight: 120,
              boxShadow: '0 4px 20px rgba(15,23,42,0.06)',
            }}
          >
            <textarea
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Scout anything - find people, research companies, build a plan..."
              aria-label="Ask Scout"
              rows={2}
              disabled={isLoading}
              className="w-full resize-none bg-transparent outline-none"
              style={{ border: 'none', fontSize: 14, lineHeight: 1.5, color: 'var(--brand-ink)', paddingRight: 44, minHeight: 72 }}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
              style={{
                position: 'absolute', right: 12, bottom: 12,
                width: 34, height: 34, borderRadius: '50%',
                background: 'var(--accent, #4A60A8)', color: '#fff', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background .25s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-blue, #3B82F6)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent, #4A60A8)')}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {chips.map((question, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(question)}
                className="text-left px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-[#3B82F6] hover:bg-[#FAFBFF]/50 text-sm text-gray-700 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-center">
            <BriefingButton onClick={() => void requestBriefing()} isLoading={isLoading} />
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Thread layout (panel always; page once messages exist)
  // ------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {activeStrategy && <ActiveStrategyCard strategy={activeStrategy} />}
      <div className="flex-1 overflow-y-auto">
        <div className={variant === 'page' ? 'mx-auto w-full max-w-[760px] px-5 py-6' : 'px-5 py-4'}>
          {/* Empty state (panel variant only reaches here when empty) */}
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
              <div className="ml-10 mb-3">
                <BriefingButton onClick={() => void requestBriefing()} isLoading={isLoading} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
                {chips.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(question)}
                    className="text-left px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-[#3B82F6] hover:bg-[#FAFBFF]/50 text-sm text-gray-700 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
              {emptyStateExtra}
            </div>
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
                          {showModePill && (
                            <div>
                              <ScoutModePill mode={message.mode!} />
                            </div>
                          )}
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
                                onClick={(e) => {
                                  const target = e.target as HTMLElement
                                  const link = target.closest('a[data-scout-link]') as HTMLAnchorElement | null
                                  if (!link) return
                                  const href = link.getAttribute('href') || ''
                                  if (!href.startsWith('/')) return
                                  e.preventDefault()
                                  handleInlineLink(href)
                                }}
                                dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                              />
                              {message.coverage && !message.isStreaming && (
                                <CompletenessGauge coverage={message.coverage} />
                              )}
                            </div>
                          )}
                          {liveEvents.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {liveEvents.map(evt => (
                                <ScoutToolPill key={evt.id} event={evt} />
                              ))}
                            </div>
                          )}
                          {message.plan && (
                            <ScoutPlanChecklist
                              plan={message.plan}
                              onStepAction={handlePlanStep}
                            />
                          )}
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

              {/* Minimal "thinking" dot while waiting for the turn's first event */}
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

              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className={variant === 'page' ? 'mx-auto w-full max-w-[760px] px-5 py-4 flex-shrink-0' : 'px-5 py-4 flex-shrink-0'}>
        <div className="relative">
          <input
            ref={localInputRef}
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
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: exit 0. (`noUnusedLocals` applies inside files; an exported-but-not-yet-imported component is fine.)

- [ ] **Step 3: Commit**

```bash
git add connect-grow-hire/src/components/scout/ScoutChatThread.tsx
git commit -m "feat(scout): extract reusable ScoutChatThread (panel + page variants)"
```

---

### Task 3: Rewire `ScoutSidePanel` to the shared chat

**Files:**
- Modify: `connect-grow-hire/src/components/ScoutSidePanel.tsx`

**Interfaces:**
- Consumes: `useScoutChatShared()` (Task 1), `ScoutChatThread` (Task 2).
- Produces: same `ScoutSidePanel` component export; behavior identical from the outside.

- [ ] **Step 1: Delete the lifted logic**

Remove from `ScoutSidePanel.tsx` (all moved to `ScoutChatContext` in Task 1):
- `type NavAction`, `decideNavAction` (lines 61-84), `summarizePrefill` (86-89).
- `resolvedIds` state (line 149) and the navigate auto-execute effect (lines 361-374).
- `runNavigate` (315-359), `handleApprove` (380-383), `handleCtaAction` (385-404), `handlePlanStep` (409-418).
- The celebration listener effect (lines 456-498).
- The `pendingMessage` auto-send effect (lines 615-621).
- The `activeStrategy` derivation (lines 189-195).
- The focus-on-open effect (lines 603-608) — the thread autofocuses on mount, and the panel unmounts its thread when closed.
- `handleKeyDown` (623-628).
- The entire chat-column JSX: `ScoutSidePanel.tsx:896-1122` (empty state, tried-hint placement, messages map, thinking dot, composer).

- [ ] **Step 2: Replace the chat hook call and chat column**

Replace the `useScoutChat(scoutCurrentPage)` call (lines 151-176, including the `scoutCurrentPage` derivation, which now lives in the provider) with:

```tsx
  const {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    chatId,
    startNewChat,
    loadChat,
    isLoadingChat,
    appendSyntheticAssistant,
    appendSyntheticUser,
  } = useScoutChatShared();
```

Replace the deleted chat column (after the `<aside>` chat-history sidebar, which stays exactly as is) with:

```tsx
              {/* Chat column - the shared thread (same conversation as the
                  Getting Started page). */}
              <ScoutChatThread
                variant="panel"
                emptyStateExtra={
                  messages.length === 0 && triedHint ? (
                    <ScoutTriedFailedHint
                      triedPrompt={triedHint}
                      onWiden={handleHintWiden}
                      onDismiss={handleHintDismiss}
                    />
                  ) : null
                }
              />
```

- [ ] **Step 3: Fix imports**

Remove now-unused imports: `useScoutChat`, `formatMessage`, `ScoutNavigate`, `ScoutMode`, `ScoutCta`, `ScoutPlanStep`, `ScoutActiveStrategy` types, `toast`, `ScoutApproveCard`, `ScoutModePill`/`ScoutToolPill`/`ScoutPlanChecklist`/`ScoutCtaChip` (keep `ScoutTriedFailedHint`), `BriefingButton`, `CompletenessGauge`, `ActiveStrategyCard`, `SUGGESTED_QUESTIONS`/`SCOUT_CHIPS_BY_PAGE`, `writeScoutPrefill`/`SCOUT_PREFILL_EVENT`/`SCOUT_SEARCH_COMPLETED_EVENT`/`scoutPageIdentity`/`ScoutSearchCompletedDetail` (keep `isSameScoutPage` — search-help refined prompts use it), and the `Send` icon.

Add:

```tsx
import { useScoutChatShared } from '@/contexts/ScoutChatContext';
import { ScoutChatThread } from '@/components/scout/ScoutChatThread';
```

Keep: `ScoutYetiHead` (search-help mode), `AUTO_POPULATE_KEY`, tried-hint helpers, tour-demo effect (uses `openPanel`, `clearChat`, `appendSyntheticUser`, `appendSyntheticAssistant` — all still in scope), Esc/overflow effects, sidebar state + `refreshChats`, search-help mode block, header with Trash/X buttons.

- [ ] **Step 4: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: exit 0. `noUnusedLocals` will flag any import you forgot to remove — fix until clean.

- [ ] **Step 5: Commit**

```bash
git add connect-grow-hire/src/components/ScoutSidePanel.tsx
git commit -m "refactor(scout): side panel renders the shared ScoutChatThread"
```

---

### Task 4: Rewrite `DashboardPage` as the full-page chat

**Files:**
- Modify (full rewrite): `connect-grow-hire/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `ScoutChatThread` (Task 2).
- Produces: same default export `DashboardPage` (the lazy import in `App.tsx` is untouched).

- [ ] **Step 1: Replace the file contents**

```tsx
// DashboardPage - "Getting Started"
// The post-login landing is a full-page Scout chat. It renders the SAME
// conversation as the Ask Scout side panel (state lives in
// ScoutChatProvider); this page is just the big view of it.
//
// User-facing name is "Getting Started"; the route stays /dashboard (see
// docs/getting-started-route-note.md for why the label and route differ).

import React from "react";
import { Loader2 } from "lucide-react";

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { ScoutChatThread } from "@/components/scout/ScoutChatThread";

export default function DashboardPage() {
  const { isLoading: authLoading } = useFirebaseAuth();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--brand-blue)" }} />
      </div>
    );
  }

  return (
    <SidebarProvider>
      {/* h-screen (not min-h-screen): the chat thread needs a bounded height
          so its message list scrolls and the composer pins to the bottom. */}
      <div className="flex h-screen w-full font-sans" style={{ color: "var(--brand-ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Getting Started" />

          <div className="relative flex flex-1 flex-col overflow-hidden" style={{ background: "#FBFCFE" }}>
            {/* Brand watercolor backdrop, fixed to the viewport bottom. */}
            <img
              src="/mountains-lake.png"
              alt=""
              aria-hidden
              draggable={false}
              style={{
                position: "fixed", bottom: 0, left: 0, width: "100%", height: "70vh",
                objectFit: "cover", objectPosition: "bottom center", opacity: 0.9,
                zIndex: 0, pointerEvents: "none", userSelect: "none",
              }}
            />

            <div className="relative flex min-h-0 flex-1 flex-col" style={{ zIndex: 1 }}>
              <ScoutChatThread variant="page" />
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
```

Everything else in the old file (FindMode, MODE_EXAMPLES, type-and-delete animation, enrich dialog + `ENRICH_URLS_KEY`, `timeAgo`, activity query, `/find` handoff) is deleted. Note: `ENRICH_URLS_KEY` was a sessionStorage handoff the Find page reads; nothing else writes it, and removing the writer is harmless.

- [ ] **Step 2: Check for dead references**

Run: `grep -rn "offerloop_enrich_linkedin_urls\|getting-started-activity" connect-grow-hire/src --include="*.ts*"`
Expected: only reads in the Find page code (if any) — no compile-breaking references to the dashboard's deleted symbols.

- [ ] **Step 3: Typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add connect-grow-hire/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): Getting Started is a full-page Scout chat"
```

---

### Task 5: Build + manual QA

**Files:**
- None created; verification only.

- [ ] **Step 1: Production build**

Run: `cd connect-grow-hire && npm run build`
Expected: build succeeds, no "Cannot access before initialization"-style chunk warnings (no new packages were added, so `vite.config.ts` is untouched).

- [ ] **Step 2: Manual QA in the browser** (dev servers: `python3 wsgi.py` in `backend/`, `npm run dev` in `connect-grow-hire/`; or use the browse/gstack skill)

1. `/dashboard` empty state: heading + big prompt box + `/dashboard` chips + briefing button over the watercolor backdrop. No "Help me find", no cards, no recent activity.
2. Send a prompt on the page → user bubble renders, reply streams, page switches to thread layout with composer pinned bottom.
3. Ask something that triggers a navigate (e.g. "find me 5 product managers at Google") → approve card or auto-run + undo toast fires exactly once.
4. With messages on the page, press Cmd+K → panel slides open showing the same thread. Send from the panel → the message appears on the page behind it too.
5. On `/find`, open the panel, send a message, then navigate to `/dashboard` → same conversation fills the page.
6. Panel-only features intact: chat-history sidebar (switch chats, new chat), failed-search help flow, tried-and-failed hint on a fresh chat, onboarding tour's Scout step.
7. Trash (clear chat) in the panel header clears both views.

- [ ] **Step 3: Commit any QA fixes**

```bash
git add -A connect-grow-hire/src
git commit -m "fix(scout): QA fixes for shared getting-started chat"
```

(Skip if QA was clean.)

---

## Self-Review Notes

- **Spec coverage:** provider (Task 1), thread extraction (Task 2), panel keeps chrome/sidebar/search-help/hint/tour (Task 3), page rewrite + backdrop kept (Task 4), shortcut behavior untouched (no task needed — spec says unchanged), manual test list mirrors the spec's Testing section (Task 5).
- **Ref handling:** spec left "exact mechanics" to this plan — resolved as local refs per thread + autofocus-on-mount; hook-level refs left in place but unattached (hook untouched per spec).
- **Type consistency:** `useScoutChatShared`, `decideNavAction`, `handleInlineLink`, `ScoutChatThread({ variant, emptyStateExtra })` used identically across Tasks 2-4.
