/**
 * TourContext — In-app guided walkthrough (product tour) using react-joyride.
 * Persists completion in Firestore; auto-starts for new users or after 7 days away.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Joyride, { ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
// Element-ready polling replaces the old fixed-delay nav wait. Some pages
// fetch async data before the tour's anchor mounts (My Network's PeopleTable
// renders only after contacts load), so a hard timeout was guaranteed to lose
// the race. We poll + MutationObserver up to TOUR_ELEMENT_MAX_WAIT_MS.
const TOUR_ELEMENT_POLL_MS = 100;
const TOUR_ELEMENT_MAX_WAIT_MS = 5000;
const COMPLETION_AUTO_DISMISS_MS = 3000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_START_DELAY_MS = 800;

// -----------------------------------------------------------------------------
// Step config type
// -----------------------------------------------------------------------------
export type TourDemoSurface =
  | 'people'
  | 'hiring-managers'
  | 'companies'
  | 'my-network'
  | 'inbox'
  | 'meeting-prep'
  | 'scout'
  | 'loops';

export interface TourStepConfig {
  // Stable identifier for steps that need explicit per-step handling (e.g.
  // the welcome step's centered styling). Match on this, never on array
  // index, so reordering steps later can't restyle the wrong one.
  id?: string;
  target: string;
  title: string;
  content: string;
  route: string;
  tab?: 'contact-search';
  placement?: 'bottom' | 'center';
  nextLabel?: string;
  // When set, the destination page subscribes to this surface and runs its
  // local demo choreography (animate query, show a seeded inert card). The
  // tour orchestrator never touches the page's state directly — it only
  // signals which surface is active.
  demoSurface?: TourDemoSurface;
}

// -----------------------------------------------------------------------------
// Step list (order defines tour flow)
// -----------------------------------------------------------------------------
// Phase 1 sequence. Welcome modal opens the tour; the four core surfaces
// (Find People → Companies → Hiring Managers → My Network → Meeting Prep)
// each land on an anchor that exists today. Future phases will splice
// Job Board, Ask Scout, and Loop steps in without reworking the order.
export const TOUR_STEPS: TourStepConfig[] = [
  // 0 — Welcome (centered modal, no anchor). Shares Find People's route so
  // there's no navigation between this step and the next.
  {
    id: 'welcome',
    target: 'body',
    title: "Let's get started",
    content: 'Learn how everything works in Offerloop.',
    route: '/find',
    tab: 'contact-search',
    placement: 'center',
    nextLabel: 'Get Started',
  },
  // 1 — Find People
  {
    target: '[data-tour="tour-search-form"]',
    title: 'Find People',
    content: "Search by name, role, or company. Or paste a LinkedIn URL to import a contact. We'll find their email and draft outreach for you.",
    route: '/find',
    tab: 'contact-search',
    demoSurface: 'people',
  },
  // 2 — Find Companies
  {
    target: '[data-tour="tour-find-companies"]',
    title: 'Find Companies',
    content: "Describe the kind of companies you're targeting in plain English and we'll surface the ones that fit.",
    route: '/find?tab=companies',
    demoSurface: 'companies',
  },
  // 3 — Find Hiring Manager
  {
    target: '[data-tour="tour-find-hiring-managers"]',
    title: 'Find Hiring Manager',
    content: "Paste a job posting URL and we'll find the recruiter and hiring manager for that role.",
    route: '/find?tab=hiring-managers',
    demoSurface: 'hiring-managers',
  },
  // 4-6 — Job Board, broken into three sub-steps. The page auto-selects the
  // first job on mount (JobBoardPage.redesign.tsx ~287-298), so the Find People
  // panel is in the DOM by the time the user reaches step 6 without any
  // programmatic expansion from the tour.
  {
    target: '[data-tour="tour-job-board-list"]',
    title: 'Job Board',
    content: "Hundreds of roles handpicked for you, including any you've already saved. Click any job to see the full posting.",
    route: '/job-board',
  },
  {
    target: '[data-tour="tour-job-board-filters"]',
    title: 'Filter the Feed',
    content: "Search by keyword, or narrow the feed by location, role type, salary, and more.",
    route: '/job-board',
  },
  {
    target: '[data-tour="tour-job-board-find-people"]',
    title: 'Find People for the Role',
    content: "For each job, we'll surface the hiring manager and people on the team: your fastest path to a warm intro.",
    route: '/job-board',
  },
  // 7 — My Network. Trimmed: the inbox/Gmail story now lives in its own step.
  {
    target: '[data-tour="tour-network-table"]',
    title: 'My Network',
    content: "Everyone you find and save lands here. Click the mail icon on any contact to open the conversation.",
    route: '/my-network/people',
    demoSurface: 'my-network',
  },
  // 8 — Inbox. Was implicit in the old My Network copy; now a step of its own
  // anchored on the /outbox surface so the spotlight matches the language.
  {
    target: '[data-tour="tour-inbox"]',
    title: 'Inbox',
    content: "Track every conversation in one place. Manage replies and follow-ups here, or jump to Gmail to see the drafts we wrote.",
    route: '/outbox',
    demoSurface: 'inbox',
  },
  // 9 — Meeting Prep
  {
    target: '[data-tour="tour-coffee-chat-prep"]',
    title: 'Meeting Prep',
    content: "When you land a call, prep here. Paste a LinkedIn URL and get talking points, recent news, and smart questions tailored to who you're meeting.",
    route: '/coffee-chat-prep',
    demoSurface: 'meeting-prep',
  },
  // 10 — Ask Scout. The orchestration in ScoutSidePanel opens the panel
  // and seeds a Mark Cuban conversation so the user sees both the trigger
  // and the assistant's strategist behavior. Route is /agent because the
  // FloatingAskScoutButton is suppressed on /dashboard and we'll already
  // be there for Loops on the next step (same-route advance, no nav).
  {
    target: '[data-tour="tour-scout-button"]',
    title: 'Ask Scout',
    content: "Stuck anywhere in Offerloop? Press Cmd+K or click Ask Scout for help from your AI copilot.",
    route: '/agent',
    // Centered, not anchored: the Scout panel opens right-0 full-height for
    // this step's seeded demo. A 'bottom' tooltip anchored on the top-right
    // scout button lands over the panel and covers the demo, so center the
    // tooltip in the viewport (clear of the 420px panel) instead.
    placement: 'center',
    demoSurface: 'scout',
  },
  // 11 — Loops. The closer. Seeds a single running Loop into the React
  // Query cache so the user sees the "works while you sleep" proposition
  // through live mid-funnel metrics on the seeded card.
  {
    target: '[data-tour="tour-loops-grid"]',
    title: 'Loops',
    content: "Run the whole flow on autopilot. Describe who you want to reach, and a Loop keeps finding contacts, drafting emails, and surfacing replies 24/7.",
    route: '/agent',
    demoSurface: 'loops',
  },
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function buildPath(route: string, tab?: string): string {
  if (route === '/find' && tab) return `${route}?tab=${tab}`;
  return route;
}

// Resolves once `selector` is in the DOM, or false after maxMs. Uses a
// MutationObserver plus a slow poll as belt-and-suspenders against observer
// edge cases (e.g. anchor swapped into an iframe-like detached subtree).
function waitForElement(selector: string, maxMs: number): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (document.querySelector(selector)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearInterval(poll);
      resolve(ok);
    };
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) finish(true);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const poll = setInterval(() => {
      if (document.querySelector(selector)) finish(true);
      else if (Date.now() - start > maxMs) finish(false);
    }, TOUR_ELEMENT_POLL_MS);
  });
}

// -----------------------------------------------------------------------------
// Context type
// -----------------------------------------------------------------------------
export interface TourContextType {
  run: boolean;
  stepIndex: number;
  showCompletion: boolean;
  // Active demo surface, derived from the current step's metadata. The Find
  // pages subscribe to this to run their typing-and-seeded-card choreography;
  // it goes back to null on every tour-end path (close, skip, finish), so
  // teardown effects on the subscribers fire automatically.
  demoSurface: TourDemoSurface | null;
  startTour: () => void;
  stopTour: () => void;
  dismissCompletion: () => void;
}

const TourContext = createContext<TourContextType | null>(null);

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------
export function TourProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useFirebaseAuth();

  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);
  const pendingStepRef = useRef<number | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCheckedTriggerRef = useRef(false);

  const currentPath = location.pathname + location.search;

  const markTourCompleteInFirestore = useCallback(async () => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        hasCompletedTour: true,
        lastLoginDate: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[Tour] Failed to mark complete:', e);
    }
  }, [user?.uid]);

  const stopTour = useCallback(() => {
    setRun(false);
    pendingStepRef.current = null;
  }, []);

  const startTour = useCallback(() => {
    setShowCompletion(false);
    setStepIndex(0);
    pendingStepRef.current = null;
    const first = TOUR_STEPS[0];
    const firstPath = buildPath(first.route, first.tab);
    if (currentPath !== firstPath) {
      pendingStepRef.current = 0;
      navigate(firstPath);
    } else {
      setStepIndex(0);
      setRun(true);
    }
  }, [currentPath, navigate]);

  const dismissCompletion = useCallback(() => {
    setShowCompletion(false);
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  // Once location matches the pending step's path, wait for the step's
  // anchor element to actually be in the DOM before showing it. This replaces
  // the old fixed-450ms wait, which lost the race whenever the destination
  // page fetched data before mounting the anchor.
  useEffect(() => {
    if (pendingStepRef.current === null) return;
    const idx = pendingStepRef.current;
    const step = TOUR_STEPS[idx];
    if (!step) return;
    const stepPath = buildPath(step.route, step.tab);
    if (currentPath !== stepPath) return;
    let cancelled = false;
    (async () => {
      const found = await waitForElement(step.target, TOUR_ELEMENT_MAX_WAIT_MS);
      if (cancelled) return;
      if (!found) {
        console.warn(
          `[Tour] Anchor not found within ${TOUR_ELEMENT_MAX_WAIT_MS}ms for step ${idx} (${step.target}) on ${stepPath}. Showing step anyway; Joyride will fire TARGET_NOT_FOUND and skip.`,
        );
      }
      setStepIndex(idx);
      setRun(true);
      pendingStepRef.current = null;
    })();
    return () => { cancelled = true; };
  }, [currentPath]);

  // Joyride callback
  const handleJoyrideCallback = useCallback(
    (data: { action: string; index: number; status: string; type: string }) => {
      const { action, index, status, type } = data;

      // X (close) button: mark complete and stop tour
      if (action === ACTIONS.CLOSE) {
        markTourCompleteInFirestore();
        setRun(false);
        pendingStepRef.current = null;
        return;
      }

      if (type === EVENTS.STEP_BEFORE && pendingStepRef.current !== null) {
        setStepIndex(pendingStepRef.current);
        pendingStepRef.current = null;
        return;
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        const missing = TOUR_STEPS[index];
        console.warn(
          `[Tour] Joyride TARGET_NOT_FOUND on step ${index} (${missing?.target ?? '(unknown)'}). Auto-advancing.`,
        );
        const nextIdx = index + 1;
        if (nextIdx >= TOUR_STEPS.length) {
          markTourCompleteInFirestore();
          setShowCompletion(true);
          setRun(false);
          completionTimerRef.current = setTimeout(dismissCompletion, COMPLETION_AUTO_DISMISS_MS);
        } else {
          setStepIndex(nextIdx);
        }
        return;
      }

      if (type === EVENTS.STEP_AFTER && action === ACTIONS.PREV) {
        const prevIdx = index - 1;
        if (prevIdx < 0) return;
        const prevStep = TOUR_STEPS[prevIdx];
        const prevPath = buildPath(prevStep.route, prevStep.tab);
        if (currentPath !== prevPath) {
          setRun(false);
          pendingStepRef.current = prevIdx;
          navigate(prevPath);
        } else {
          setStepIndex(prevIdx);
        }
        return;
      }

      if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT) {
        const nextIdx = index + 1;
        if (nextIdx >= TOUR_STEPS.length) {
          markTourCompleteInFirestore();
          setShowCompletion(true);
          setRun(false);
          // Natural finish (clicked Done on the last step): drop the user on
          // the home dashboard. Skip/Close paths below intentionally do NOT
          // navigate — if a user bails early we leave them where they were.
          navigate('/dashboard');
          completionTimerRef.current = setTimeout(dismissCompletion, COMPLETION_AUTO_DISMISS_MS);
          return;
        }
        const nextStep = TOUR_STEPS[nextIdx];
        const nextPath = buildPath(nextStep.route, nextStep.tab);
        if (currentPath !== nextPath) {
          setRun(false);
          pendingStepRef.current = nextIdx;
          navigate(nextPath);
        } else {
          setStepIndex(nextIdx);
        }
        return;
      }

      if ([STATUS.SKIPPED, STATUS.FINISHED].includes(status as typeof STATUS.SKIPPED)) {
        markTourCompleteInFirestore();
        setRun(false);
        if (status === STATUS.FINISHED) {
          setShowCompletion(true);
          // Mirror the STEP_AFTER+NEXT finish branch above. Joyride emits a
          // STATUS.FINISHED event in some completion paths in addition to the
          // STEP_AFTER+NEXT we already navigate from, so this is a belt-and-
          // suspenders home-route nav for the natural finish. Skip path
          // (STATUS.SKIPPED) deliberately does not navigate.
          navigate('/dashboard');
          completionTimerRef.current = setTimeout(dismissCompletion, COMPLETION_AUTO_DISMISS_MS);
        }
      }
    },
    [currentPath, navigate, markTourCompleteInFirestore, dismissCompletion]
  );

  // Auto-start: once per session when user is logged in and past onboarding
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user?.uid || user?.needsOnboarding || hasCheckedTriggerRef.current) return;
    hasCheckedTriggerRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        const data = snap.data();
        let hasCompletedTour = data?.hasCompletedTour === true;
        const lastLogin = data?.lastLoginDate;
        if (lastLogin) {
          const last = new Date(lastLogin).getTime();
          if (Date.now() - last > SEVEN_DAYS_MS) hasCompletedTour = false;
        }
        if (!hasCompletedTour) {
          autoStartTimerRef.current = setTimeout(startTour, AUTO_START_DELAY_MS);
        }
      } catch (e) {
        console.error('[Tour] Auto-start check failed:', e);
      }
    })();
    return () => {
      cancelled = true;
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    };
  }, [user?.uid, user?.needsOnboarding, startTour]);

  // Cleanup completion timer on unmount
  useEffect(() => {
    return () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
    };
  }, []);

  // Escape to dismiss completion modal
  useEffect(() => {
    if (!showCompletion) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissCompletion();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCompletion, dismissCompletion]);

  // Per-step style override for the centered welcome modal. Gated on
  // id === 'welcome' (NOT placement) so other centered steps (e.g. the
  // Ask Scout step) keep the moderate-sized treatment from the global
  // styles below. Title and content are centered horizontally; the footer
  // is centered too so the "Get Started" button sits in the middle of the
  // modal rather than floating right.
  const WELCOME_STEP_STYLES = {
    tooltip: { padding: 32 },
    tooltipContainer: { textAlign: 'center' as const },
    tooltipTitle: { fontSize: 30, fontWeight: 700, marginBottom: 14, textAlign: 'center' as const },
    tooltipContent: { fontSize: 21, lineHeight: 1.5, textAlign: 'center' as const, marginBottom: 4 },
    tooltipFooter: { justifyContent: 'center' as const, marginTop: 24, gap: 16 },
    buttonNext: { fontSize: 18, fontWeight: 600, padding: '14px 32px', borderRadius: 8 },
  };

  const joyrideSteps = TOUR_STEPS.map((s) => ({
    target: s.target,
    title: s.title,
    content: s.content,
    disableBeacon: true,
    placement: (s.placement ?? 'bottom') as 'bottom' | 'center',
    ...(s.nextLabel ? { locale: { next: s.nextLabel } } : {}),
    ...(s.id === 'welcome' ? { styles: WELCOME_STEP_STYLES } : {}),
  }));

  // Demo surface is live only while the tour is actually running on a step
  // that declares one. Any tour-end path flips `run` to false, which clears
  // this back to null and triggers subscriber teardown.
  const activeStep = run ? TOUR_STEPS[stepIndex] : undefined;
  const demoSurface: TourDemoSurface | null = activeStep?.demoSurface ?? null;

  const value: TourContextType = {
    run,
    stepIndex,
    showCompletion,
    demoSurface,
    startTour,
    stopTour,
    dismissCompletion,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      <Joyride
        steps={joyrideSteps}
        run={run}
        stepIndex={stepIndex}
        continuous
        showProgress
        showSkipButton
        callback={handleJoyrideCallback}
        scrollToFirstStep
        scrollOffset={80}
        spotlightPadding={8}
        disableOverlayClose={false}
        locale={{ back: 'Back', close: 'Close', last: 'Done', next: 'Next', skip: 'Skip tour' }}
        styles={{
          options: { primaryColor: '#2563EB', zIndex: 10000 },
          tooltip: {
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          },
          tooltipContainer: { textAlign: 'left' },
          tooltipTitle: { fontSize: 22, fontWeight: 600, marginBottom: 10 },
          tooltipContent: { fontSize: 19, lineHeight: 1.55 },
          buttonNext: { backgroundColor: '#2563EB', color: '#fff', borderRadius: 8, fontSize: 16, fontWeight: 600, padding: '12px 26px' },
          buttonBack: { color: '#475569', fontSize: 15, fontWeight: 500, padding: '12px 20px', marginRight: 8 },
          buttonSkip: { color: '#64748B', fontSize: 14 },
        }}
      />
      {/* Completion modal */}
      {showCompletion && (
        <div
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={dismissCompletion}
          role="dialog"
          aria-modal="true"
          aria-label="Tour complete"
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-gray-900 mb-2">You're all set!</h3>
            <p className="text-gray-600 mb-6">
              Start by importing a LinkedIn profile or searching for contacts.
            </p>
            <button
              type="button"
              onClick={dismissCompletion}
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextType {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}
