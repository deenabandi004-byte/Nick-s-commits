/**
 * TourContext - In-app guided walkthrough (product tour) using react-joyride.
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
const TOUR_NAV_DELAY_MS = 450;
const COMPLETION_AUTO_DISMISS_MS = 3000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_START_DELAY_MS = 800;

// -----------------------------------------------------------------------------
// Step config type
// -----------------------------------------------------------------------------
export interface TourStepConfig {
  target: string;
  title: string;
  content: string;
  route: string;
  tab?: 'contact-search' | 'contact-library';
}

// -----------------------------------------------------------------------------
// Step list (order defines tour flow)
// -----------------------------------------------------------------------------
export const TOUR_STEPS: TourStepConfig[] = [
  { target: '[data-tour="tour-search-form"]', title: 'Search or Import', content: 'Search by name, role, or company - or paste a LinkedIn URL to import a contact. We\'ll find their emails and draft outreach for you.', route: '/find', tab: 'contact-search' },
  { target: '[data-tour="tour-tracker-table"]', title: 'Track Your Contacts', content: 'Everyone you find lands here. Update their status, open email drafts, and export to CSV.', route: '/find', tab: 'contact-library' },
  { target: '[data-tour="tour-find-companies"]', title: 'Find Companies', content: 'Describe the type of companies you\'re looking for in plain English and we\'ll find them for you.', route: '/find?tab=companies' },
  { target: '[data-tour="tour-find-hiring-managers"]', title: 'Find Hiring Managers', content: 'Paste a job posting URL and we\'ll find the recruiters and hiring managers for that role.', route: '/find?tab=hiring-managers' },
  { target: '[data-tour="tour-meeting-prep"]', title: 'Meeting Prep', content: 'Paste a LinkedIn URL and get a personalized prep sheet with talking points, recent news, and smart questions.', route: '/meeting-prep' },
  { target: '[data-tour="tour-track-email"]', title: 'Track Your Outreach', content: 'Monitor all your email threads, follow-ups, and replies in one place. Use the calendar and networking tabs to stay organized.', route: '/tracker' },
];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function buildPath(route: string, tab?: string): string {
  if (route === '/find' && tab) return `${route}?tab=${tab}`;
  return route;
}

// -----------------------------------------------------------------------------
// Context type
// -----------------------------------------------------------------------------
export interface TourContextType {
  run: boolean;
  stepIndex: number;
  showCompletion: boolean;
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

  // When location matches pending step path, show that step after delay
  useEffect(() => {
    if (pendingStepRef.current === null) return;
    const idx = pendingStepRef.current;
    const step = TOUR_STEPS[idx];
    if (!step) return;
    const stepPath = buildPath(step.route, step.tab);
    if (currentPath !== stepPath) return;
    const t = setTimeout(() => {
      setStepIndex(idx);
      setRun(true);
      pendingStepRef.current = null;
    }, TOUR_NAV_DELAY_MS);
    return () => clearTimeout(t);
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

  const joyrideSteps = TOUR_STEPS.map((s) => ({
    target: s.target,
    title: s.title,
    content: s.content,
    disableBeacon: true,
    placement: 'bottom' as const,
  }));

  const value: TourContextType = {
    run,
    stepIndex,
    showCompletion,
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
          tooltipTitle: { fontSize: 18, fontWeight: 600, marginBottom: 8 },
          tooltipContent: { fontSize: 14, lineHeight: 1.5 },
          buttonNext: { backgroundColor: '#2563EB', color: '#fff', borderRadius: 8 },
          buttonSkip: { color: '#64748B' },
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
