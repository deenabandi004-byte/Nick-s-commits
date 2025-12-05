// src/App.tsx
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { FirebaseAuthProvider, useFirebaseAuth } from "./contexts/FirebaseAuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import UscBeta from "@/pages/UscBeta";

// Pages
import Index from "./pages/Index";
import DashboardPage from "./pages/DashboardPage"; // NEW: Use DashboardPage instead of Home
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import AboutUs from "./pages/AboutUs";
import Contact from "./pages/Contact";
import CoffeeChatLibrary from "./pages/CoffeeChatLibrary";
import ContactDirectory from "./pages/ContactDirectory";
import ContactUs from "./pages/ContactUs";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import TermsOfServiceSettings from "./pages/TermsOfServiceSettings";
import AccountSettings from "./pages/AccountSettings";
import Pricing from "./pages/Pricing";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
import Outbox from "./pages/Outbox";
import FirmSearch from "./pages/FirmSearch";
import ContactSearch from "./pages/ContactSearch";
import CoffeeChatPrepPage from "./pages/CoffeeChatPrepPage";
import InterviewPrepPage from "./pages/InterviewPrepPage";
// New Lovable Onboarding Flow
import { OnboardingFlow } from "./pages/OnboardingFlow";

const queryClient = new QueryClient();

/* ---------------- Route Guards ---------------- */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  const loc = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    return <Navigate to={`/signin?mode=signin&returnTo=${returnTo}`} replace />;
  }

  if (user.needsOnboarding) {
    if (loc.pathname === "/onboarding") return <>{children}</>;
    const returnTo = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    return <Navigate to={`/onboarding?returnTo=${returnTo}`} replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useFirebaseAuth();
  if (isLoading) return null;

  if (user) {
    return user.needsOnboarding ? (
      <Navigate to="/onboarding" replace />
    ) : (
      <Navigate to="/home" replace />
    );
  }
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
            <OnboardingFlow onComplete={() => { /* handled in component */ }} />
          </ProtectedRoute>
        }
      />
      <Route path="/onboarding/*" element={<Navigate to="/onboarding" replace />} />

      {/* Protected App Pages */}
      <Route path="/home" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/firm-search" element={<ProtectedRoute><FirmSearch /></ProtectedRoute>} />
      <Route path="/contact-search" element={<ProtectedRoute><ContactSearch /></ProtectedRoute>} />
      <Route path="/coffee-chat-prep" element={<ProtectedRoute><CoffeeChatPrepPage /></ProtectedRoute>} />
      <Route path="/interview-prep" element={<ProtectedRoute><InterviewPrepPage /></ProtectedRoute>} />
      <Route path="/account-settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
      <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
      <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
      
      {/* Legacy routes - kept for backward compatibility */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/contact-directory" element={<ProtectedRoute><ContactDirectory /></ProtectedRoute>} />
      <Route path="/coffee-chat-library" element={<ProtectedRoute><CoffeeChatLibrary /></ProtectedRoute>} />
      <Route path="/outbox" element={<ProtectedRoute><Outbox /></ProtectedRoute>} />


      {/* Public informational pages */}
      <Route path="/about" element={<AboutUs />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/contact-us" element={<ContactUs />} />

      {/* Legal pages + canonical redirects */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />

      {/* Settings-specific Terms (kept public like in your file) */}
      <Route path="/terms-of-service-settings" element={<PublicRoute><TermsOfServiceSettings /></PublicRoute>} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

/* ---------------- App Root ---------------- */
const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <FirebaseAuthProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </FirebaseAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
