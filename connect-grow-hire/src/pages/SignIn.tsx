// src/pages/SignIn.tsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiService } from "@/services/api";
import OfferloopLogo from '@/assets/offerloop_logo2.png';
 


type Tab = "signin" | "signup";

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, isLoading, signIn } = useFirebaseAuth();

  const initialTab: Tab = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("mode") === "signup" ? "signup" : "signin";
  }, [location.search]);

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [submitting, setSubmitting] = useState(false);
  const autoCheckGmailRanRef = useRef(false); // Prevent multiple auto-checks

  const forceNavigate = (dest: string) => {
    navigate(dest, { replace: true });
    setTimeout(() => {
      const at = window.location.pathname;
      // Only hard-redirect if the SPA nav genuinely never moved us off the
      // sign-in page. The previous guard compared `at !== dest`, but several
      // dests are redirect aliases (e.g. /home → /dashboard), so the path the
      // router lands on legitimately differs from `dest`. That made the guard
      // fire a full window.location.replace() on every normal sign-in —
      // wiping the freshly-rendered dashboard and re-bootstrapping the whole
      // app (the visible "load → reload" flash). If we've left /signin, the
      // navigation worked, regardless of which final path we settled on.
      if (at === "/signin") {
        console.warn("[signin] router nav didn't apply, forcing hard redirect", { at, dest });
        window.location.replace(dest);
      }
    }, 600);
  };

  // Check if Gmail connection is needed using Firebase auth directly
  const checkNeedsGmailConnection = async (): Promise<boolean> => {
    try {
      const data = await apiService.gmailStatus();
      return !data.connected;
    } catch (error) {
      return true;
    }
  };

  const initiateGmailOAuth = async (autoClose = false) => {
    try {
      const authUrl = await apiService.startGmailOAuth();
      if (!authUrl) return;

      const destination = user?.needsOnboarding ? '/onboarding' : '/home';
      localStorage.setItem('post_gmail_destination', destination);

      if (autoClose) {
        const popup = window.open(
          authUrl,
          `gmail-oauth-${Date.now()}`,
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );
        if (!popup) return;

        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            setTimeout(async () => {
              const needsGmail = await checkNeedsGmailConnection();
              if (!needsGmail) {
                toast({
                  title: "Gmail Connected!",
                  description: "Drafts will now appear in your Gmail account.",
                });
              }
            }, 1000);
          }
        }, 500);
      } else {
        window.location.replace(authUrl);
      }
    } catch (error) {
      if (!autoClose) {
        const dest = user?.needsOnboarding ? "/onboarding" : "/home";
        forceNavigate(dest);
      }
    }
  };

  // ✅ useEffects come AFTER function definitions
  useEffect(() => setActiveTab(initialTab), [initialTab]);

  // Capture referral code from ?ref= query param and persist in localStorage
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      localStorage.setItem('offerloop_ref', ref.trim().toUpperCase());
    }
  }, []);


  // ✅ AUTO-CHECK Gmail when signed-in user loads page
  // NOTE: This only runs if user navigates to /signin manually
  // If OAuth is triggered from handleGoogleAuth, it redirects immediately (no auto-check needed)
  useEffect(() => {
    // Only run if we're actually on the /signin route
    if (location.pathname !== '/signin') {
      return;
    }

    // Prevent multiple runs
    if (autoCheckGmailRanRef.current) {
      return;
    }

    const autoCheckGmail = async () => {
      if (isLoading || !user) return;
      
      // Mark as run immediately to prevent duplicate calls
      autoCheckGmailRanRef.current = true;
      
      // If user just completed OAuth flow, don't auto-trigger again
      // (handleGoogleAuth already handles OAuth for new/existing users)
      const params = new URLSearchParams(location.search);
      
      // CRITICAL: Check if coming from sign-out - don't auto-navigate if so
      // This prevents auto-sign-in when user is redirected to /signin after signing out
      const isSigningOut = params.get("signout") === "true";
      if (isSigningOut) {
        console.log("🚫 Coming from sign-out, skipping auto-navigation");
        return;
      }
      
      const justCompletedOAuth = params.get("connected") === "gmail" || params.get("gmail_error");
      if (justCompletedOAuth) {
        console.log("📧 OAuth just completed, skipping auto-check");
        return;
      }
    
      const gmailError = params.get("gmail_error");
      if (gmailError === "wrong_account") {
        console.warn("📧 Gmail OAuth returned wrong_account error");
        toast({
          variant: "destructive",
          title: "Wrong Gmail account",
          description: `Please connect the Gmail account that matches your login: ${user.email}`,
        });
        // Don't immediately redirect them again; just let them hit the button / auto flow
        // and pick the right account.
        // We still fall through so the auto-check can decide what to do.
      } else if (gmailError === "not_test_user") {
        console.warn("📧 Gmail OAuth - user not in test users list");
        toast({
          variant: "destructive",
          title: "Gmail Access Restricted",
          description: `Your email (${user.email}) needs to be added to the test users list. Please contact support or add it in Google Cloud Console > OAuth consent screen > Test users.`,
          duration: 10000,
        });
        return; // Don't proceed with auto-check if there's an error
      }

      const justConnectedGmail = params.get("connected") === "gmail";

      // ✅ Case 2: Gmail successfully connected
      if (justConnectedGmail) {
        console.log("📧 Returned from Gmail OAuth!");
        const dest = localStorage.getItem('post_gmail_destination') || '/home';
        localStorage.removeItem('post_gmail_destination');
        
        toast({
          title: "Gmail Connected! 🎉",
          description: "You can now create drafts directly in Gmail.",
        });
        
        forceNavigate(dest);
        return;
      }
      
      // Case 3: normal sign-in path → check whether Gmail is connected
      // Only auto-check if user just signed in (not if they manually navigated to /signin)
      // Check if we're coming from a fresh sign-in by checking if there's no OAuth return params
      const isReturningFromOAuth = params.has("connected") || params.has("gmail_error");
      if (isReturningFromOAuth) {
        // We already handled OAuth return cases above, so skip auto-check
        return;
      }
      
      // Don't auto-trigger OAuth here - let the user flow handle it
      // The handleGoogleAuth function now handles showing OAuth immediately for new users
      console.log('✅ User signed in, navigating to app');
      const dest = user.needsOnboarding ? "/onboarding" : "/home";
      console.log('🏠 Navigating to:', dest);
      forceNavigate(dest);
    };

    if (!isLoading && user) {
      const timer = setTimeout(autoCheckGmail, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, isLoading, location.search, location.pathname, toast]);

  // Reset the ref when user signs out or component unmounts
  useEffect(() => {
    if (!user) {
      autoCheckGmailRanRef.current = false;
    }
  }, [user]);
  
  const handleGoogleAuth = async () => {
    console.log("🚀 handleGoogleAuth CALLED", { submitting, isLoading });
    if (submitting || isLoading) {
      console.log("⚠️ Already submitting or loading, returning early");
      return;
    }
    setSubmitting(true);
    try {
      console.log("🔐 Initiating Google Sign-In...");
      const next = await signIn({ prompt: "consent" });
      
      console.log("✅ Firebase sign-in completed, next step:", next);
      
      // ✅ IMMEDIATELY check Gmail connection (no delay) and trigger OAuth if needed
      // This prevents navigation to home before OAuth
      const isNewUser = next === "onboarding";
      console.log("🔍 User type check:", { isNewUser, next });
      
      // For both new and existing users, check Gmail connection immediately
      console.log("🔍 Checking Gmail connection status...");
      const needsGmail = await checkNeedsGmailConnection();
      console.log("🔍 Gmail connection check result:", needsGmail);
      
      if (needsGmail) {
        console.log("📧 Gmail not connected, starting OAuth flow IMMEDIATELY...");
        console.log("📧 About to call initiateGmailOAuth(false)...");
        // Immediately trigger Gmail OAuth - show permissions screen right away
        // This redirects, so we don't navigate to home first
        // CRITICAL: This should redirect to Gmail OAuth consent screen immediately
        await initiateGmailOAuth(false); // false = redirect so user sees permissions screen
        // This line should never execute because initiateGmailOAuth redirects
        console.log("📧 initiateGmailOAuth completed (should have redirected)");
        return; // OAuth redirects, stop here - don't navigate anywhere
      }
      
      // Gmail already connected - navigate based on next route
      console.log("✅ Gmail already connected, navigating to app");
      const dest = (next as "onboarding" | "home") === "onboarding" ? "/onboarding" : "/home";
      console.log("[signin] signIn returned:", next, "→", dest, "(Gmail already connected)");
      forceNavigate(dest);
    } catch (err: any) {
      console.error("[signin] failed:", err);
      setSubmitting(false);
      toast({
        variant: "destructive",
        title: "Sign-in failed",
        description: err?.message || "Please try again.",
      });
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: 'var(--bg-white)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Background glow */}
      <div
        className="absolute top-[-200px] right-[-150px] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-[-150px] left-[-100px] w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.04) 0%, transparent 70%)',
        }}
      />

      {/* Back to Home */}
      <div className="absolute top-6 left-6 md:top-8 md:left-12">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-sm transition-colors"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text-tertiary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-tertiary)';
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>
      </div>

      {/* Sign-in Card */}
      <div
        className="relative w-full max-w-[440px] mx-auto px-6"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <div
          className="rounded-[3px] transition-all"
          style={{
            background: 'var(--bg-white)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.04)',
            padding: '48px 40px',
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <img
              src={OfferloopLogo}
              alt="Offerloop"
              className="h-16 mx-auto mb-6"
            />
            <h1
              style={{
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: '36px',
                fontWeight: 400,
                letterSpacing: '-0.025em',
                color: 'var(--text-primary)',
                lineHeight: 1.1,
                marginBottom: '8px',
              }}
            >
              {activeTab === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                color: 'var(--text-secondary)',
              }}
            >
              {activeTab === "signup"
                ? "Get started with Offerloop in seconds"
                : "Sign in to continue to your account"}
            </p>
          </div>

          {/* Tabs */}
          <div
            className="flex gap-2 mb-8"
            style={{
              background: 'var(--bg-off)',
              borderRadius: '10px',
              padding: '4px',
            }}
          >
            <button
              onClick={() => setActiveTab("signin")}
              disabled={submitting}
              className="flex-1 py-2 rounded-[8px] text-sm font-medium transition-all"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 500,
                background: activeTab === "signin" ? 'var(--bg-white)' : 'transparent',
                color: activeTab === "signin" ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: activeTab === "signin" ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
            <button
              onClick={() => setActiveTab("signup")}
              disabled={submitting}
              className="flex-1 py-2 rounded-[8px] text-sm font-medium transition-all"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 500,
                background: activeTab === "signup" ? 'var(--bg-white)' : 'transparent',
                color: activeTab === "signup" ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: activeTab === "signup" ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Create account
            </button>
          </div>

          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleAuth}
            disabled={submitting || isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-[10px] text-sm font-medium transition-all"
            style={{
              background: '#0F172A',
              color: 'white',
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              fontWeight: 600,
              border: 'none',
              cursor: submitting || isLoading ? 'not-allowed' : 'pointer',
              opacity: submitting || isLoading ? 0.6 : 1,
              boxShadow: '0 1px 3px rgba(59, 130, 246, 0.2), 0 4px 12px rgba(59, 130, 246, 0.15)',
            }}
            onMouseEnter={(e) => {
              if (!submitting && !isLoading) {
                e.currentTarget.style.background = '#1E293B';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(59, 130, 246, 0.3), 0 8px 20px rgba(59, 130, 246, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#2563EB';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(59, 130, 246, 0.2), 0 4px 12px rgba(59, 130, 246, 0.15)';
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.611 20.083H42V20H24v8h11.303C33.96 32.99 29.453 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.06 0 5.84 1.154 7.949 3.042l5.657-5.657C34.869 6.057 29.706 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20c10.493 0 19.128-8.08 19.128-20 0-1.341-.138-2.651-.4-3.917z"
              />
              <path
                fill="#FF3D00"
                d="M6.306 14.691l6.571 4.817C14.39 16.564 18.879 14 24 14c3.06 0 5.84 1.154 7.949 3.042l5.657-5.657C34.869 6.057 29.706 4 24 4c-7.668 0-14.266 4.343-17.694 10.691z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.453 0 10.01-1.787 13.49-4.852l-6.23-5.253C29.207 35.385 26.78 36 24 36c-5.438 0-10.028-3.668-11.66-8.67l-6.5 5.01C8.257 38.926 15.44 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.611 20.083H42V20H24v8h11.303c-1.098 3.24-3.48 5.773-6.043 7.091l6.23 5.253C37.147 38.47 40 32.943 40 26c0-2.055-.222-3.92-.611-5.917z"
              />
            </svg>
            {submitting ? "Connecting..." : activeTab === "signup" ? "Continue with Google" : "Sign in with Google"}
          </button>

          {/* Trust signals */}
          <div className="mt-6 space-y-2">
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                lineHeight: 1.6,
              }}
            >
              {activeTab === "signup"
                ? "Sign in with Google, then connect Gmail to enable draft creation."
                : "Sign in, then connect Gmail to allow draft creation in your account."}
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                marginTop: '12px',
              }}
            >
              {[
                "We'll never send emails without your permission",
                "We only create drafts in your Gmail",
                "You review and send all emails yourself",
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '12.5px',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: 'rgba(59, 130, 246, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer text */}
        <p
          className="text-center mt-6"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            opacity: 0.7,
          }}
        >
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default SignIn;