// src/App.tsx
import React, { Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { FirebaseAuthProvider, useFirebaseAuth } from "./contexts/FirebaseAuthContext";
import { ScoutProvider, useScout } from "./contexts/ScoutContext";
import { TourProvider } from "./contexts/TourContext";
import { HelmetProvider } from "react-helmet-async";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DynamicGradientBackground } from "./components/background/DynamicGradientBackground";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { ScoutSidePanel } from "./components/ScoutSidePanel";
import { LoadingContainer } from "./components/ui/LoadingBar";
import { useEventLogger } from "./hooks/useEventLogger";
import { ProfileConfirmModal } from "./components/ProfileConfirmModal";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./lib/firebase";

// Keep critical pages non-lazy for faster initial load
import Index from "./pages/Index";
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import UscBeta from "@/pages/UscBeta";

// Lazy load heavy pages for code splitting
const AboutUs = React.lazy(() => import("./pages/AboutUs"));
const NetworkTracker = React.lazy(() => import("./pages/NetworkTracker"));
const CompanyTrackerPage = React.lazy(() => import("./pages/CompanyTrackerPage"));
const CalendarPage = React.lazy(() => import("./pages/CalendarPage"));
const Contact = React.lazy(() => import("./pages/Contact"));
const CoffeeChatLibrary = React.lazy(() => import("./pages/CoffeeChatLibrary"));
const ContactDirectory = React.lazy(() => import("./pages/ContactDirectory"));
const ContactUs = React.lazy(() => import("./pages/ContactUs"));
const PrivacyPolicy = React.lazy(() => import("./pages/PrivacyPolicy"));
const ExtensionPrivacyPolicy = React.lazy(() => import("./pages/ExtensionPrivacyPolicy"));
const TermsOfService = React.lazy(() => import("./pages/TermsOfService"));
const TermsOfServiceSettings = React.lazy(() => import("./pages/TermsOfServiceSettings"));
const AccountSettings = React.lazy(() => import("./pages/AccountSettings"));
const EditRateDashboardPage = React.lazy(() => import("./pages/EditRateDashboardPage"));
const Pricing = React.lazy(() => import("./pages/Pricing"));
const DocumentationPage = React.lazy(() => import("./pages/DocumentationPage"));
const JobBoardPage = React.lazy(() => import("./pages/JobBoardPage"));
const HiringManagerTrackerPage = React.lazy(() => import("./pages/HiringManagerTrackerPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const PaymentSuccess = React.lazy(() => import("./pages/PaymentSuccess"));
// Feature Pages - These are the largest, most important to lazy load
const CoffeeChatPrepPage = React.lazy(() => import("./pages/CoffeeChatPrepPage"));
const ContactSearchPage = React.lazy(() => import("./pages/ContactSearchPage"));
const FindPage = React.lazy(() => import("./pages/FindPage"));
const EmailTemplatesPage = React.lazy(() => import("./pages/EmailTemplatesPage"));
const InterviewPrepPage = React.lazy(() => import("./pages/InterviewPrepPage"));
const FirmSearchPage = React.lazy(() => import("./pages/FirmSearchPage"));
const ApplicationLabPage = React.lazy(() => import("./pages/ApplicationLabPage"));
const ResumeWorkshopPage = React.lazy(() => import("./pages/ResumeWorkshopPage"));
const ResumePage = React.lazy(() => import("./pages/ResumePage"));
const CoverLetterPage = React.lazy(() => import("./pages/CoverLetterPage"));
// New Lovable Onboarding Flow
const OnboardingFlow = React.lazy(() => import("./pages/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));
const DataStats = React.lazy(() => import("./pages/DataStats"));
// SEO Landing Pages
const CompareHandshake = React.lazy(() => import("./pages/CompareHandshake"));
const CompareLinkedIn = React.lazy(() => import("./pages/CompareLinkedIn"));
const CompareApollo = React.lazy(() => import("./pages/CompareApollo"));
const CompareChatGPT = React.lazy(() => import("./pages/CompareChatGPT"));
const ColdEmailConsulting = React.lazy(() => import("./pages/ColdEmailConsulting"));
const ColdEmailBanking = React.lazy(() => import("./pages/ColdEmailBanking"));
const ColdEmailTech = React.lazy(() => import("./pages/ColdEmailTech"));
const AlumniOutreach = React.lazy(() => import("./pages/AlumniOutreach"));
const CoffeeChatNetworking = React.lazy(() => import("./pages/CoffeeChatNetworking"));
const Glossary = React.lazy(() => import("./pages/Glossary"));
const Blog = React.lazy(() => import("./pages/Blog"));
const BlogPost = React.lazy(() => import("./pages/BlogPost"));
const NetworkingGuidePage = React.lazy(() => import("./pages/NetworkingGuidePage"));
const AlumniGuidePage = React.lazy(() => import("./pages/AlumniGuidePage"));
const ColdEmailGuidePage = React.lazy(() => import("./pages/ColdEmailGuidePage"));
const CoffeeChatGuidePage = React.lazy(() => import("./pages/CoffeeChatGuidePage"));
const RoleNetworkingGuidePage = React.lazy(() => import("./pages/RoleNetworkingGuidePage"));
const CompanyComparisonPage = React.lazy(() => import("./pages/CompanyComparisonPage"));

// Optimized QueryClient with caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSkeleton />
  </div>
);

// Environment-based logging helper
const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};

/* ---------------- Route Guards ---------------- */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  const loc = useLocation();

  // Check if coming from sign-out - don't redirect if so
  const params = new URLSearchParams(loc.search);
  const isSignedOut = params.get('signedOut') === 'true';

  devLog("🔒 [PROTECTED ROUTE] Route check:", {
    path: loc.pathname,
    search: loc.search,
    isLoading,
    hasUser: !!user,
    userEmail: user?.email || "none",
    needsOnboarding: user?.needsOnboarding || false,
    isSignedOut
  });

  if (isLoading) {
    devLog("🔒 [PROTECTED ROUTE] Still loading auth state, showing loading bar");
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <LoadingContainer 
          label="Loading Offerloop..." 
          sublabel="Please wait" 
        />
      </div>
    );
  }

  // If signed out flag is present, redirect to landing page instead of signin
  if (isSignedOut) {
    devLog("🔒 [PROTECTED ROUTE] signedOut=true detected, redirecting to landing page");
    return <Navigate to="/?signedOut=true" replace />;
  }

  if (!user) {
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    devLog("🔒 [PROTECTED ROUTE] No user, redirecting to signin with returnTo:", returnTo);
    return <Navigate to={`/signin?mode=signin&returnTo=${returnTo}`} replace />;
  }

  if (user.needsOnboarding) {
    if (loc.pathname === "/onboarding") {
      devLog("🔒 [PROTECTED ROUTE] User needs onboarding and is on onboarding page, allowing access");
      return <>{children}</>;
    }
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    devLog("🔒 [PROTECTED ROUTE] User needs onboarding, redirecting to /onboarding");
    return <Navigate to={`/onboarding?returnTo=${returnTo}`} replace />;
  }

  devLog("🔒 [PROTECTED ROUTE] User authenticated, allowing access");
  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  const location = useLocation();
  
  // Check if coming from sign-out - skip redirect if so
  const params = new URLSearchParams(location.search);
  const isSignedOut = params.get('signedOut') === 'true';
  
  devLog("🛣️ [PUBLIC ROUTE] Route check:", {
    path: location.pathname,
    search: location.search,
    isSignedOut,
    isLoading,
    hasUser: !!user,
    userEmail: user?.email || "none",
    needsOnboarding: user?.needsOnboarding || false
  });
  
  // Show loading spinner instead of null to avoid blank page
  if (isLoading) {
    devLog("🛣️ [PUBLIC ROUTE] Still loading auth state, showing spinner");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If explicitly signed out, always show the landing page regardless of user state
  // This prevents the race condition where user state hasn't fully cleared yet
  if (isSignedOut) {
    devLog("🛣️ [PUBLIC ROUTE] signedOut=true detected, showing landing page (ignoring user state)");
    return <>{children}</>;
  }

  // Only redirect authenticated users if they're not coming from sign-out
  if (user) {
    const redirectPath = user.needsOnboarding ? "/onboarding" : "/find";
    devLog("🛣️ [PUBLIC ROUTE] User authenticated, redirecting to:", redirectPath);
    return user.needsOnboarding ? (
      <Navigate to="/onboarding" replace />
    ) : (
      <Navigate to="/find" replace />
    );
  }
  
  devLog("🛣️ [PUBLIC ROUTE] No user, showing public content");
  return <>{children}</>;
};

/* ---------------- Routes ---------------- */
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Landing */}
      <Route path="/" element={<PublicRoute><Index /></PublicRoute>} />
      <Route path="/usc-beta" element={<UscBeta />} />

      {/* Auth */}
      <Route path="/signin" element={<PublicRoute><SignIn /></PublicRoute>} />
      <Route path="/signup" element={<Navigate to="/signin?mode=signup" replace />} />
      <Route path="/auth/callback" element={<PublicRoute><AuthCallback /></PublicRoute>} />

      {/* Onboarding */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}>
              <OnboardingFlow onComplete={() => { /* handled in component */ }} />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route path="/onboarding/*" element={<Navigate to="/onboarding" replace />} />

      {/* Protected App Pages - Wrapped in Suspense for lazy loading */}
      <Route path="/dashboard" element={<Navigate to="/find" replace />} />
      <Route path="/find" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><FindPage /></Suspense></ProtectedRoute>} />
      <Route path="/contact-search" element={<Navigate to="/find" replace />} />
      <Route path="/tracker" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><NetworkTracker /></Suspense></ProtectedRoute>} />
      <Route path="/outbox" element={<Navigate to="/tracker" replace />} />
      <Route path="/calendar" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CalendarPage /></Suspense></ProtectedRoute>} />
      {/* Legacy /home redirect to contact search */}
      <Route path="/home" element={<Navigate to="/find" replace />} />
      <Route path="/contact-directory" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ContactDirectory /></Suspense></ProtectedRoute>} />
      <Route path="/coffee-chat-library" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CoffeeChatLibrary /></Suspense></ProtectedRoute>} />
      <Route path="/account-settings" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><AccountSettings /></Suspense></ProtectedRoute>} />
      <Route path="/admin/edit-rate" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><EditRateDashboardPage /></Suspense></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Pricing /></Suspense></ProtectedRoute>} />
      <Route path="/documentation" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><DocumentationPage /></Suspense></ProtectedRoute>} />
      <Route path="/payment-success" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><PaymentSuccess /></Suspense></ProtectedRoute>} />
      
      {/* Feature Pages - Largest pages, most important to lazy load */}
      <Route path="/coffee-chat-prep" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CoffeeChatPrepPage /></Suspense></ProtectedRoute>} />
      <Route path="/contact-search/templates" element={<Navigate to="/find/templates" replace />} />
      <Route path="/find/templates" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><EmailTemplatesPage /></Suspense></ProtectedRoute>} />
      <Route path="/interview-prep" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><InterviewPrepPage /></Suspense></ProtectedRoute>} />
      <Route path="/firm-search" element={<Navigate to="/find?tab=companies" replace />} />
      <Route path="/job-board" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><JobBoardPage /></Suspense></ProtectedRoute>} />
      <Route path="/recruiter-spreadsheet" element={<Navigate to="/find?tab=hiring-managers" replace />} />
      <Route path="/hiring-manager-tracker" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><HiringManagerTrackerPage /></Suspense></ProtectedRoute>} />
      <Route path="/company-tracker" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CompanyTrackerPage /></Suspense></ProtectedRoute>} />
      <Route path="/scout" element={<ProtectedRoute><ScoutRedirect /></ProtectedRoute>} />
      <Route path="/application-lab" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ApplicationLabPage /></Suspense></ProtectedRoute>} />
      
      {/* Write Pages - Resume & Cover Letter */}
      <Route path="/write/resume" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ResumeWorkshopPage /></Suspense></ProtectedRoute>} />
      <Route path="/write/resume-library" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ResumeWorkshopPage /></Suspense></ProtectedRoute>} />
      <Route path="/my-resume" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ResumePage /></Suspense></ProtectedRoute>} />
      <Route path="/write/cover-letter" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CoverLetterPage /></Suspense></ProtectedRoute>} />
      <Route path="/write/cover-letter-library" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CoverLetterPage /></Suspense></ProtectedRoute>} />

      {/* Data & Stats */}
      <Route path="/data" element={<Suspense fallback={<PageLoader />}><DataStats /></Suspense>} />

      {/* Competitor Comparison Pages */}
      <Route path="/compare/handshake" element={<Suspense fallback={<PageLoader />}><CompareHandshake /></Suspense>} />
      <Route path="/compare/linkedin" element={<Suspense fallback={<PageLoader />}><CompareLinkedIn /></Suspense>} />
      <Route path="/compare/apollo" element={<Suspense fallback={<PageLoader />}><CompareApollo /></Suspense>} />
      <Route path="/compare/chatgpt" element={<Suspense fallback={<PageLoader />}><CompareChatGPT /></Suspense>} />

      {/* SEO Landing Pages */}
      <Route path="/cold-email-consulting" element={<Suspense fallback={<PageLoader />}><ColdEmailConsulting /></Suspense>} />
      <Route path="/cold-email-investment-banking" element={<Suspense fallback={<PageLoader />}><ColdEmailBanking /></Suspense>} />
      <Route path="/cold-email-tech-internships" element={<Suspense fallback={<PageLoader />}><ColdEmailTech /></Suspense>} />
      <Route path="/alumni-outreach" element={<Suspense fallback={<PageLoader />}><AlumniOutreach /></Suspense>} />
      <Route path="/coffee-chat-networking" element={<Suspense fallback={<PageLoader />}><CoffeeChatNetworking /></Suspense>} />
      <Route path="/glossary" element={<Suspense fallback={<PageLoader />}><Glossary /></Suspense>} />
      <Route path="/blog" element={<Suspense fallback={<PageLoader />}><Blog /></Suspense>} />
      <Route path="/blog/:slug" element={<Suspense fallback={<PageLoader />}><BlogPost /></Suspense>} />
      <Route path="/networking/:slug" element={<Suspense fallback={<PageLoader />}><NetworkingGuidePage /></Suspense>} />
      <Route path="/alumni/:slug" element={<Suspense fallback={<PageLoader />}><AlumniGuidePage /></Suspense>} />
      <Route path="/cold-email/:slug" element={<Suspense fallback={<PageLoader />}><ColdEmailGuidePage /></Suspense>} />
      <Route path="/coffee-chat/:slug" element={<Suspense fallback={<PageLoader />}><CoffeeChatGuidePage /></Suspense>} />
      <Route path="/networking-for/:slug" element={<Suspense fallback={<PageLoader />}><RoleNetworkingGuidePage /></Suspense>} />
      <Route path="/compare/:comparison" element={<Suspense fallback={<PageLoader />}><CompanyComparisonPage /></Suspense>} />

      {/* Public informational pages */}
      <Route path="/about" element={<Suspense fallback={<PageLoader />}><AboutUs /></Suspense>} />
      <Route path="/contact" element={<Suspense fallback={<PageLoader />}><Contact /></Suspense>} />
      <Route path="/contact-us" element={<Suspense fallback={<PageLoader />}><ContactUs /></Suspense>} />

      {/* Legal pages + canonical redirects */}
      <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />
      <Route path="/extension-privacy" element={<Suspense fallback={<PageLoader />}><ExtensionPrivacyPolicy /></Suspense>} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
      <Route path="/terms-of-service" element={<Suspense fallback={<PageLoader />}><TermsOfService /></Suspense>} />
      <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />

      {/* Settings-specific Terms (kept public like in your file) */}
      <Route path="/terms-of-service-settings" element={<PublicRoute><Suspense fallback={<PageLoader />}><TermsOfServiceSettings /></Suspense></PublicRoute>} />

      {/* 404 */}
      <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
    </Routes>
  );
};

/* ---------------- Scout Redirect Component ---------------- */
const ScoutRedirect: React.FC = () => {
  const { openPanel } = useScout();
  
  useEffect(() => {
    // Open panel when navigating to /scout
    openPanel();
  }, [openPanel]);
  
  // Redirect to find page
  return <Navigate to="/find" replace />;
};

/* ---------------- Conditional Background Wrapper ---------------- */
const ConditionalBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  
  return (
    <div className="relative min-h-screen">
      {isLandingPage && <DynamicGradientBackground />}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

/* ---------------- Keyboard Shortcut Handler ---------------- */
/**
 * Phase 2 event logger host. Mounted once at the app shell so the flush
 * interval, sendBeacon listeners, and localStorage retry queue are
 * always active. Individual components import `useEventLogger` to call
 * `logEvent` — this host just keeps the lifecycle alive.
 */
const EventLoggerHost: React.FC = () => {
  useEventLogger();
  return null;
};

/**
 * Phase 1 personalization gate. Pops the ProfileConfirmModal once after
 * `phase1_backfill.py` has populated the user's structured fields, so the
 * student confirms / edits values that future emails will use. Gated on
 * exactly the three audit-specified fields:
 *   user.schemaVersion === 1
 *   user.backfillProcessed === true
 *   !user.profileConfirmedAt
 *
 * `dismissed` is a session-local flag so a Skip during this session
 * doesn't re-pop on every navigation; the persistent dismissal-count
 * lives on the modal/server side per its own design (15).
 */
const ProfileConfirmModalHost: React.FC = () => {
  const { user, updateUser } = useFirebaseAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!user) return null;
  if (dismissed) return null;
  const shouldShow =
    user.schemaVersion === 1 &&
    user.backfillProcessed === true &&
    !user.profileConfirmedAt;
  if (!shouldShow) return null;

  const handleConfirmed = async () => {
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, "users", user.uid), {
        profileConfirmedAt: serverTimestamp(),
      });
      // Sync local context so the gate flips and the modal unmounts.
      await updateUser({ profileConfirmedAt: nowIso });
    } catch (err) {
      console.warn("[ProfileConfirmModalHost] failed to persist profileConfirmedAt:", err);
      setDismissed(true);
    }
  };

  const handleSkip = () => {
    // Modal owns the dismissal-count write. Locally hide for this session
    // so the user isn't pestered on every route change.
    setDismissed(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setDismissed(true);
  };

  return (
    <ProfileConfirmModal
      open
      onOpenChange={handleOpenChange}
      onConfirmed={handleConfirmed}
      onSkip={handleSkip}
    />
  );
};

const KeyboardShortcutHandler: React.FC = () => {
  const { openPanel, isPanelOpen, togglePanel } = useScout();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open/toggle Scout panel
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        // Don't trigger if user is typing in an input/textarea
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        
        event.preventDefault();
        togglePanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel]);

  return null;
};

/* ---------------- App Root ---------------- */
const App: React.FC = () => {
  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FirebaseAuthProvider>
          <ErrorBoundary>
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <ConditionalBackground>
                <Toaster />
                <Sonner />
                <ScoutProvider>
                  <TourProvider>
                    <EventLoggerHost />
                    <KeyboardShortcutHandler />
                    <ProfileConfirmModalHost />
                    <AppRoutes />
                    <ScoutSidePanel />
                  </TourProvider>
                </ScoutProvider>
              </ConditionalBackground>
            </BrowserRouter>
          </ErrorBoundary>
        </FirebaseAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;
