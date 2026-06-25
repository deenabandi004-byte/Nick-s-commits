// src/App.tsx
import React, { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import posthog from "./lib/posthog";
import { FirebaseAuthProvider, useFirebaseAuth } from "./contexts/FirebaseAuthContext";
import PendingShareModal from "@/components/shares/PendingShareModal";
import { ScoutProvider, useScout } from "./contexts/ScoutContext";
import { TourProvider } from "./contexts/TourContext";
import { HelmetProvider } from "react-helmet-async";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScoutSidePanel } from "./components/ScoutSidePanel";
import FloatingAskScoutButton from "./components/AskScoutButton";
import { ReplyNotifier } from "./components/ReplyNotifier";
import { LoadingContainer } from "./components/ui/LoadingBar";
import { IS_DEV_PREVIEW } from "./lib/devPreview";
import { useAgentGlobalNotifier } from "./hooks/useAgent";

// Keep critical auth pages non-lazy for faster initial load
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import UscBeta from "@/pages/UscBeta";

// Landing page is lazy: authed users get redirected to /dashboard and never
// render it, so its heavy image/component tree must stay out of the critical
// entry chunk.
const Index = React.lazy(() => import("./pages/Index"));
// The gradient background is landing-only and decorative (pure CSS/React, no
// WebGL). Lazy so it never ships on the critical path. Mounts with a null
// fallback only when an unauthenticated visitor actually sees the landing page.
const DynamicGradientBackground = React.lazy(() =>
  import("./components/background/DynamicGradientBackground").then((m) => ({
    default: m.DynamicGradientBackground,
  })),
);

// Lazy load heavy pages for code splitting
const AboutUs = React.lazy(() => import("./pages/AboutUs"));
const ConnectorSetup = React.lazy(() => import("./pages/ConnectorSetup"));
const ForStudentsPage = React.lazy(() => import("./pages/ForStudentsPage"));
const PromoPage = React.lazy(() => import("./pages/PromoPage"));
const CoffeeChatLibrary = React.lazy(() => import("./pages/CoffeeChatLibrary"));
const ContactUs = React.lazy(() => import("./pages/ContactUs"));
const PrivacyPolicy = React.lazy(() => import("./pages/PrivacyPolicy"));
const ExtensionPrivacyPolicy = React.lazy(() => import("./pages/ExtensionPrivacyPolicy"));
const TermsOfService = React.lazy(() => import("./pages/TermsOfService"));
const AccountSettings = React.lazy(() => import("./pages/AccountSettings"));
const ReferPage = React.lazy(() => import("./pages/ReferPage"));
const Pricing = React.lazy(() => import("./pages/Pricing"));
const DocumentationPage = React.lazy(() => import("./pages/DocumentationPage"));
const JobBoardPage = React.lazy(() => import("./pages/JobBoardPage"));
// Job board redesign is now the production component for /job-board.
// /dev/job-board-redesign is kept as a same-component fallback URL for one
// day of confirmation. The old JobBoardPage import above stays unrouted
// pending deletion after that confirmation window.
const JobBoardRedesign = React.lazy(() => import("./pages/JobBoardPage.redesign"));
// /outbox renders the redesign. /tracker is preserved as a redirect for
// internal call sites until a sweep updates them. The old NetworkTracker
// page file is unrouted pending deletion.
const NetworkTrackerRedesign = React.lazy(() => import("./pages/NetworkTrackerRedesign"));
const MyNetworkPage = React.lazy(() => import("./pages/MyNetworkPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const PaymentSuccess = React.lazy(() => import("./pages/PaymentSuccess"));
// Feature Pages - These are the largest, most important to lazy load
const CoffeeChatPrepPage = React.lazy(() => import("./pages/CoffeeChatPrepPage"));
const FindPage = React.lazy(() => import("./pages/FindPage"));
const EmailTemplatesPage = React.lazy(() => import("./pages/EmailTemplatesPage"));
const RecruitingTimelinePage = React.lazy(() => import("./pages/RecruitingTimelinePage"));
// Factory extracted so we can prefetch the chunk the moment auth resolves
// (see DashboardPrefetch), making the post-redirect Suspense fallback instant.
const importDashboardPage = () => import("./pages/DashboardPage");
const DashboardPage = React.lazy(importDashboardPage);
const AgentPage = React.lazy(() => import("./pages/AgentPage"));
const AgentSetup = React.lazy(() => import("./pages/AgentSetup"));
const LoopsPage = React.lazy(() => import("./pages/LoopsPage"));
const LoopDetailPage = React.lazy(() => import("./pages/LoopDetailPage"));
// New Lovable Onboarding Flow
const OnboardingFlow = React.lazy(() => import("./pages/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));
// Dev-only preview routes (no auth) for design iteration on the new Profile page
// and onboarding flow. See docs/PROFILE_ONBOARDING_SPEC.md.
const ProfilePreview = React.lazy(() => import("./pages/ProfilePreview"));
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

// Public free tools + widget sandboxes
const InterviewPrepFree = React.lazy(() => import("./pages/InterviewPrepFree"));
const CoverLetterFree = React.lazy(() => import("./pages/CoverLetterFree"));
const ResumeReviewFree = React.lazy(() => import("./pages/ResumeReviewFree"));
const WidgetSandbox = React.lazy(() => import("./pages/WidgetSandbox"));
const CoverLetterWidgetSandbox = React.lazy(() => import("./pages/CoverLetterWidgetSandbox"));
const InterviewPrepSandbox = React.lazy(() => import("./pages/InterviewPrepSandbox"));
const FindHiringManagerFree = React.lazy(() => import("./pages/FindHiringManagerFree"));
const FindHiringManagerWidgetSandbox = React.lazy(() => import("./pages/FindHiringManagerWidgetSandbox"));
const FindHiringManagerPreview = React.lazy(() => import("./pages/seo-preview/FindHiringManagerPreview"));
const FindCompaniesFree = React.lazy(() => import("./pages/FindCompaniesFree"));
const FindCompaniesWidgetSandbox = React.lazy(() => import("./pages/FindCompaniesWidgetSandbox"));
const FindCompaniesPreview = React.lazy(() => import("./pages/seo-preview/FindCompaniesPreview"));
const FindJobsFree = React.lazy(() => import("./pages/FindJobsFree"));
const FindJobsWidgetSandbox = React.lazy(() => import("./pages/FindJobsWidgetSandbox"));
const FindJobsPreview = React.lazy(() => import("./pages/seo-preview/FindJobsPreview"));
const FindPeopleFree = React.lazy(() => import("./pages/FindPeopleFree"));
const FindPeopleWidgetSandbox = React.lazy(() => import("./pages/FindPeopleWidgetSandbox"));
const FindPeopleUscGooglePreview = React.lazy(() => import("./pages/seo-preview/FindPeopleUscGooglePreview"));
const FindPeopleTemplate = React.lazy(() => import("./pages/seo-preview/templates/FindPeopleTemplate"));
const MeetingPrepFree = React.lazy(() => import("./pages/MeetingPrepFree"));
const MeetingPrepWidgetSandbox = React.lazy(() => import("./pages/MeetingPrepWidgetSandbox"));
const MeetingPrepFreePreview = React.lazy(() => import("./pages/seo-preview/MeetingPrepFreePreview"));

// SEO preview pages (marketing landing variants embedding the widgets)
const MeetingPrepPreview = React.lazy(() => import("./pages/seo-preview/MeetingPrepPreview"));
const ColdEmailPreview = React.lazy(() => import("./pages/seo-preview/ColdEmailPreview"));
const FindAlumniPreview = React.lazy(() => import("./pages/seo-preview/FindAlumniPreview"));
const ResumeCheckerPreview = React.lazy(() => import("./pages/seo-preview/ResumeCheckerPreview"));
const RecruitingTimelinePreview = React.lazy(() => import("./pages/seo-preview/RecruitingTimelinePreview"));
const NetworkingEmailGeneratorPreview = React.lazy(() => import("./pages/seo-preview/NetworkingEmailGeneratorPreview"));
const ResumeReviewGoldmanIBPreview = React.lazy(() => import("./pages/seo-preview/ResumeReviewGoldmanIBPreview"));
const WhatIsAnATSPreview = React.lazy(() => import("./pages/seo-preview/WhatIsAnATSPreview"));
const CoverLetterMckinseyBAPreview = React.lazy(() => import("./pages/seo-preview/CoverLetterMckinseyBAPreview"));
const InterviewPrepMckinseyCasePreview = React.lazy(() => import("./pages/seo-preview/InterviewPrepMckinseyCasePreview"));
const ResumeReviewTemplate = React.lazy(() => import("./pages/seo-preview/templates/ResumeReviewTemplate"));
const CoverLetterTemplate = React.lazy(() => import("./pages/seo-preview/templates/CoverLetterTemplate"));
const InterviewPrepTemplate = React.lazy(() => import("./pages/seo-preview/templates/InterviewPrepTemplate"));
const ATSGuideTemplate = React.lazy(() => import("./pages/seo-preview/templates/ATSGuideTemplate"));
const FreeToolsHub = React.lazy(() => import("./pages/FreeToolsHub"));

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

// Unified full-screen loader — used for BOTH auth resolution (route guards)
// and lazy-route Suspense fallbacks. Sharing one component keeps the two
// phases visually continuous instead of swapping between a spinner and a
// skeleton, which read as a "double load".
const FullScreenLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
    <LoadingContainer label="Loading Offerloop..." sublabel="Please wait" />
  </div>
);

// Suspense fallback (name kept for existing call sites).
const PageLoader = FullScreenLoader;

// Phase 3 stationery aesthetic — always-on (shipped).
// Formerly gated by VITE_FLAG_NEW_AESTHETIC env var during dev preview.
const NEW_AESTHETIC = true;

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

  // Dev preview bypass — skip all auth checks in dev mode with ?devpreview=true
  if (IS_DEV_PREVIEW) {
    devLog("🔒 [PROTECTED ROUTE] Dev preview bypass active, skipping auth");
    return <>{children}</>;
  }

  if (isLoading) {
    devLog("🔒 [PROTECTED ROUTE] Still loading auth state, showing loading bar");
    return <FullScreenLoader />;
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
  
  // Use the same full-screen loader as the protected routes and Suspense
  // fallbacks so auth resolution never visually swaps loaders.
  if (isLoading) {
    devLog("🛣️ [PUBLIC ROUTE] Still loading auth state, showing loader");
    return <FullScreenLoader />;
  }

  // If explicitly signed out, always show the landing page regardless of user state
  // This prevents the race condition where user state hasn't fully cleared yet
  if (isSignedOut) {
    devLog("🛣️ [PUBLIC ROUTE] signedOut=true detected, showing landing page (ignoring user state)");
    return <>{children}</>;
  }

  // Only redirect authenticated users if they're not coming from sign-out
  if (user) {
    const redirectPath = user.needsOnboarding ? "/onboarding" : "/dashboard";
    devLog("🛣️ [PUBLIC ROUTE] User authenticated, redirecting to:", redirectPath);
    return user.needsOnboarding ? (
      <Navigate to="/onboarding" replace />
    ) : (
      <Navigate to="/dashboard" replace />
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
      <Route path="/" element={<PublicRoute><Suspense fallback={<PageLoader />}><Index /></Suspense></PublicRoute>} />
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

      {/* Profile (Phase 2) — the dedicated free-flow profile page. Same
          component as the dev preview, just protected and routed at /profile.
          The home page "what we know about you" widget links here. */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}>
              <ProfilePreview />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Dev preview routes — no auth, no protection. For visual iteration only.
          See docs/PROFILE_ONBOARDING_SPEC.md. */}
      <Route
        path="/dev/profile-preview"
        element={
          <Suspense fallback={<PageLoader />}>
            <ProfilePreview />
          </Suspense>
        }
      />
      <Route
        path="/dev/onboarding-preview"
        element={
          <Suspense fallback={<PageLoader />}>
            <OnboardingFlow onComplete={() => { /* preview only — no save */ }} />
          </Suspense>
        }
      />
      <Route
        path="/dev/job-board-redesign"
        element={
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}>
              <JobBoardRedesign />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Protected App Pages - Wrapped in Suspense for lazy loading */}
      <Route path="/dashboard" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><DashboardPage /></Suspense></ProtectedRoute>} />
      <Route path="/find" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><FindPage /></Suspense></ProtectedRoute>} />
      <Route path="/my-network" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><MyNetworkPage /></Suspense></ProtectedRoute>} />
      <Route path="/my-network/:tab" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><MyNetworkPage /></Suspense></ProtectedRoute>} />
      <Route path="/contact-search" element={<Navigate to="/find" replace />} />
      <Route path="/outbox" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><NetworkTrackerRedesign /></Suspense></ProtectedRoute>} />
      <Route path="/tracker" element={<Navigate to="/outbox" replace />} />
      {/* Legacy /home redirect to contact search */}
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="/contact-directory" element={<Navigate to="/my-network/people" replace />} />
      <Route path="/coffee-chat-library" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CoffeeChatLibrary /></Suspense></ProtectedRoute>} />
      <Route path="/account-settings" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><AccountSettings /></Suspense></ProtectedRoute>} />
      <Route path="/refer" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ReferPage /></Suspense></ProtectedRoute>} />
      <Route path="/pricing" element={<Suspense fallback={<PageLoader />}><Pricing /></Suspense>} />
      <Route path="/documentation" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><DocumentationPage /></Suspense></ProtectedRoute>} />
      <Route path="/payment-success" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><PaymentSuccess /></Suspense></ProtectedRoute>} />
      
      {/* Feature Pages - Largest pages, most important to lazy load */}
      <Route path="/coffee-chat-prep" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><CoffeeChatPrepPage /></Suspense></ProtectedRoute>} />
      <Route path="/contact-search/templates" element={<Navigate to="/find/templates" replace />} />
      <Route path="/find/templates" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><EmailTemplatesPage /></Suspense></ProtectedRoute>} />
      <Route path="/firm-search" element={<Navigate to="/find?tab=companies" replace />} />
      <Route path="/job-board" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><JobBoardRedesign /></Suspense></ProtectedRoute>} />
      <Route path="/recruiter-spreadsheet" element={<Navigate to="/find?tab=hiring-managers" replace />} />
      <Route path="/hiring-manager-tracker" element={<Navigate to="/find?tab=hiring-managers" replace />} />
      <Route path="/company-tracker" element={<Navigate to="/find?tab=companies" replace />} />
      <Route path="/scout" element={<ProtectedRoute><ScoutRedirect /></ProtectedRoute>} />
      <Route path="/recruiting-timeline" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><RecruitingTimelinePage /></Suspense></ProtectedRoute>} />
      {/* /agent is the multi-Loop fleet view (LoopsPage). */}
      <Route path="/agent" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><LoopsPage /></Suspense></ProtectedRoute>} />
      <Route path="/agent/setup" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><AgentSetup /></Suspense></ProtectedRoute>} />
      <Route path="/agent/:loopId" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><LoopDetailPage /></Suspense></ProtectedRoute>} />

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
      <Route path="/connector" element={<Suspense fallback={<PageLoader />}><ConnectorSetup /></Suspense>} />
      <Route path="/for-students" element={<Suspense fallback={<PageLoader />}><ForStudentsPage /></Suspense>} />
      <Route path="/promo" element={<Suspense fallback={<PageLoader />}><PromoPage /></Suspense>} />
      <Route path="/contact" element={<Navigate to="/contact-us" replace />} />
      <Route path="/contact-us" element={<Suspense fallback={<PageLoader />}><ContactUs /></Suspense>} />

      {/* Legal pages + canonical redirects */}
      <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />
      <Route path="/extension-privacy" element={<Suspense fallback={<PageLoader />}><ExtensionPrivacyPolicy /></Suspense>} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
      <Route path="/terms-of-service" element={<Suspense fallback={<PageLoader />}><TermsOfService /></Suspense>} />
      <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />

      {/* 404 */}
      {/* Public free tools */}
      <Route path="/tools/interview-prep" element={<Suspense fallback={<PageLoader />}><InterviewPrepFree /></Suspense>} />
      <Route path="/tools/cover-letter" element={<Suspense fallback={<PageLoader />}><CoverLetterFree /></Suspense>} />
      <Route path="/tools/resume-review" element={<Suspense fallback={<PageLoader />}><ResumeReviewFree /></Suspense>} />
      <Route path="/tools/find-hiring-manager" element={<Suspense fallback={<PageLoader />}><FindHiringManagerFree /></Suspense>} />
      <Route path="/tools/find-companies" element={<Suspense fallback={<PageLoader />}><FindCompaniesFree /></Suspense>} />
      <Route path="/tools/find-jobs" element={<Suspense fallback={<PageLoader />}><FindJobsFree /></Suspense>} />
      <Route path="/tools/find-people" element={<Suspense fallback={<PageLoader />}><FindPeopleFree /></Suspense>} />
      <Route path="/tools/meeting-prep-free" element={<Suspense fallback={<PageLoader />}><MeetingPrepFree /></Suspense>} />

      {/* Widget sandboxes (internal preview, not linked from nav) */}
      <Route path="/sandbox/resume-widget" element={<Suspense fallback={<PageLoader />}><WidgetSandbox /></Suspense>} />
      <Route path="/sandbox/cover-letter-widget" element={<Suspense fallback={<PageLoader />}><CoverLetterWidgetSandbox /></Suspense>} />
      <Route path="/sandbox/interview-prep-widget" element={<Suspense fallback={<PageLoader />}><InterviewPrepSandbox /></Suspense>} />
      <Route path="/sandbox/find-hiring-manager-widget" element={<Suspense fallback={<PageLoader />}><FindHiringManagerWidgetSandbox /></Suspense>} />
      <Route path="/sandbox/find-companies-widget" element={<Suspense fallback={<PageLoader />}><FindCompaniesWidgetSandbox /></Suspense>} />
      <Route path="/sandbox/find-jobs-widget" element={<Suspense fallback={<PageLoader />}><FindJobsWidgetSandbox /></Suspense>} />
      <Route path="/sandbox/find-people-widget" element={<Suspense fallback={<PageLoader />}><FindPeopleWidgetSandbox /></Suspense>} />
      <Route path="/sandbox/meeting-prep-widget" element={<Suspense fallback={<PageLoader />}><MeetingPrepWidgetSandbox /></Suspense>} />

      {/* SEO preview pages */}
      <Route path="/seo-preview/meeting-mckinsey" element={<Suspense fallback={<PageLoader />}><MeetingPrepPreview /></Suspense>} />
      <Route path="/seo-preview/meeting-prep-free" element={<Suspense fallback={<PageLoader />}><MeetingPrepFreePreview /></Suspense>} />
      <Route path="/seo-preview/cold-email-goldman" element={<Suspense fallback={<PageLoader />}><ColdEmailPreview /></Suspense>} />
      <Route path="/seo-preview/find-usc-goldman" element={<Suspense fallback={<PageLoader />}><FindAlumniPreview /></Suspense>} />
      <Route path="/seo-preview/resume-checker" element={<Suspense fallback={<PageLoader />}><ResumeCheckerPreview /></Suspense>} />
      <Route path="/seo-preview/ib-recruiting-timeline" element={<Suspense fallback={<PageLoader />}><RecruitingTimelinePreview /></Suspense>} />
      <Route path="/seo-preview/networking-email-generator" element={<Suspense fallback={<PageLoader />}><NetworkingEmailGeneratorPreview /></Suspense>} />
      <Route path="/seo-preview/resume-review-goldman-ib" element={<Suspense fallback={<PageLoader />}><ResumeReviewGoldmanIBPreview /></Suspense>} />
      <Route path="/seo-preview/what-is-an-ats" element={<Suspense fallback={<PageLoader />}><WhatIsAnATSPreview /></Suspense>} />
      <Route path="/seo-preview/cover-letter-mckinsey-ba" element={<Suspense fallback={<PageLoader />}><CoverLetterMckinseyBAPreview /></Suspense>} />
      <Route path="/seo-preview/interview-prep-mckinsey-case" element={<Suspense fallback={<PageLoader />}><InterviewPrepMckinseyCasePreview /></Suspense>} />
      <Route path="/seo-preview/resume-review/:slug" element={<Suspense fallback={<PageLoader />}><ResumeReviewTemplate /></Suspense>} />
      <Route path="/seo-preview/cover-letter/:slug" element={<Suspense fallback={<PageLoader />}><CoverLetterTemplate /></Suspense>} />
      <Route path="/seo-preview/interview-prep/:slug" element={<Suspense fallback={<PageLoader />}><InterviewPrepTemplate /></Suspense>} />
      <Route path="/seo-preview/ats/:slug" element={<Suspense fallback={<PageLoader />}><ATSGuideTemplate /></Suspense>} />
      {/* Clean, indexable production prefixes for live (published) SEO rows. The /seo-preview/* twins above stay noindex and canonicalize here. */}
      <Route path="/free-tools" element={<Suspense fallback={<PageLoader />}><FreeToolsHub /></Suspense>} />
      <Route path="/resume-review/:slug" element={<Suspense fallback={<PageLoader />}><ResumeReviewTemplate /></Suspense>} />
      <Route path="/cover-letter/:slug" element={<Suspense fallback={<PageLoader />}><CoverLetterTemplate /></Suspense>} />
      <Route path="/interview-prep/:slug" element={<Suspense fallback={<PageLoader />}><InterviewPrepTemplate /></Suspense>} />
      <Route path="/ats/:slug" element={<Suspense fallback={<PageLoader />}><ATSGuideTemplate /></Suspense>} />
      <Route path="/seo-preview/find-hiring-manager" element={<Suspense fallback={<PageLoader />}><FindHiringManagerPreview /></Suspense>} />
      <Route path="/seo-preview/find-companies" element={<Suspense fallback={<PageLoader />}><FindCompaniesPreview /></Suspense>} />
      <Route path="/seo-preview/find-jobs" element={<Suspense fallback={<PageLoader />}><FindJobsPreview /></Suspense>} />
      <Route path="/seo-preview/find-people-usc-google" element={<Suspense fallback={<PageLoader />}><FindPeopleUscGooglePreview /></Suspense>} />
      <Route path="/seo-preview/find-people/:slug" element={<Suspense fallback={<PageLoader />}><FindPeopleTemplate /></Suspense>} />
      <Route path="/people/:slug" element={<Suspense fallback={<PageLoader />}><FindPeopleTemplate /></Suspense>} />

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
  
  // Redirect to dashboard
  return <Navigate to="/dashboard" replace />;
};

/* ---------------- Conditional Background Wrapper ----------------
   Decides whether to mount the landing background tree BEFORE rendering it.
   Authed users are redirected off "/" by PublicRoute, and during auth
   resolution we show a full-screen loader, so in neither case should the
   decorative background mount. Gate it on a visitor who will actually
   see the landing: on "/", not loading, and either signed out or no user. */
const ConditionalBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user, isLoading } = useFirebaseAuth();

  const params = new URLSearchParams(location.search);
  const isSignedOut = params.get('signedOut') === 'true';
  const isLandingPage = location.pathname === '/';
  const showLandingBackground =
    isLandingPage && !isLoading && (!user || isSignedOut);

  return (
    <div className="relative min-h-screen">
      {showLandingBackground && (
        <Suspense fallback={null}>
          <DynamicGradientBackground />
        </Suspense>
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

/* ---------------- Promo overlay gate ----------------
   The /promo route is a scripted screen-capture surface and /connector is a
   public marketing page. Suppress floating Scout UI on those paths. */
const NotOnPromo: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  if (pathname === '/promo' || pathname === '/connector') return null;
  return <>{children}</>;
};

/* ---------------- Pageview Tracker ----------------
   capture_pageview is false in posthog.ts, so PostHog does not auto-fire.
   This fires exactly one $pageview per location: once on initial mount and
   once per route change. No double-fire. */
const PageviewTracker: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    posthog.capture('$pageview');
  }, [location.pathname, location.search]);
  return null;
};

/* ---------------- Keyboard Shortcut Handler ---------------- */
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

/* ---------------- Agent Global Notifier ---------------- */
function AgentNotifierMount() {
  const { user } = useFirebaseAuth();
  const isElite = (user as { tier?: string } | null)?.tier === "elite";
  if (!isElite) return null;
  return <AgentNotifierActive />;
}

function AgentNotifierActive() {
  useAgentGlobalNotifier();
  return null;
}

/* ---------------- Dashboard Prefetch ----------------
   The moment auth resolves to an onboarded user, start downloading the
   dashboard chunk. By the time PublicRoute redirects "/" → "/dashboard",
   the lazy chunk is already in flight (or cached), so the post-redirect
   Suspense fallback is near-instant instead of a second visible load. */
const DashboardPrefetch: React.FC = () => {
  const { user, isLoading } = useFirebaseAuth();
  useEffect(() => {
    if (!isLoading && user && !user.needsOnboarding) {
      importDashboardPage();
    }
  }, [isLoading, user]);
  return null;
};

/* ---------------- App Root ---------------- */
const App: React.FC = () => {
  useEffect(() => {
    document.documentElement.dataset.theme = NEW_AESTHETIC ? 'stationery' : 'legacy';
  }, []);

  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FirebaseAuthProvider>
          <ErrorBoundary>
            <DashboardPrefetch />
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
                    <KeyboardShortcutHandler />
                    <PageviewTracker />
                    <AgentNotifierMount />
                    <ReplyNotifier />
                    <PendingShareModal />
                    <AppRoutes />
                    <NotOnPromo>
                      <ScoutSidePanel />
                      <FloatingAskScoutButton />
                    </NotOnPromo>
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
