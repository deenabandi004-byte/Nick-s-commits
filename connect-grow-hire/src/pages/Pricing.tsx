import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Check, ArrowLeft, Settings, Shield, ChevronDown, X, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import { loadStripe } from "@stripe/stripe-js";
import { getAuth } from 'firebase/auth';
import { BACKEND_URL } from '@/services/api';
import { trackUpgradeClick } from "../lib/analytics";

const STRIPE_PUBLISHABLE_KEY = "pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB";
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Monthly Stripe price IDs (existing, live)
const STRIPE_PRO_PRICE_ID = "price_1ScLXrERY2WrVHp1bYgdMAu4"; // Pro $14.99/mo
const STRIPE_ELITE_PRICE_ID = "price_1ScLcfERY2WrVHp1c5rcONJ3"; // Elite $34.99/mo

// Annual Stripe price IDs - set these in env when annual SKUs are created in Stripe dashboard.
// Until then, annual CTA falls back to monthly checkout.
const STRIPE_PRO_ANNUAL_PRICE_ID = (import.meta.env.VITE_STRIPE_PRO_ANNUAL_PRICE_ID as string | undefined) || null;
const STRIPE_ELITE_ANNUAL_PRICE_ID = (import.meta.env.VITE_STRIPE_ELITE_ANNUAL_PRICE_ID as string | undefined) || null;
const ANNUAL_ENABLED = Boolean(STRIPE_PRO_ANNUAL_PRICE_ID && STRIPE_ELITE_ANNUAL_PRICE_ID);

// Display prices - student is the real price, list is the public anchor (used for strikethrough)
const PRICES = {
  pro: { listMonthly: 29, studentMonthly: 14.99, studentAnnual: 149 },
  elite: { listMonthly: 59, studentMonthly: 34.99, studentAnnual: 349 },
} as const;

interface SubscriptionStatus {
  tier: string;
  status: string;
  hasSubscription: boolean;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}

// Feature Item Component
interface FeatureItemProps {
  children: React.ReactNode;
  highlight?: boolean;
  muted?: boolean;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ children, highlight, muted }) => (
  <div className="flex items-start gap-3">
    <div className={`
      w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
      ${highlight ? 'bg-cyan-100' : muted ? 'bg-gray-100' : 'bg-[#FAFBFF]'}
    `}>
      <Check className={`
        w-3 h-3
        ${highlight ? 'text-cyan-600' : muted ? 'text-gray-400' : 'text-[#3B82F6]'}
      `} />
    </div>
    <span className={`
      text-sm
      ${highlight ? 'font-semibold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-600'}
    `}>
      {children}
    </span>
  </div>
);

const DisabledFeatureItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-3">
    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-gray-100">
      <X className="w-3 h-3 text-gray-300" />
    </div>
    <span className="text-sm text-gray-400">{children}</span>
  </div>
);

// FAQ Item Component
interface FAQItemProps {
  question: string;
  answer: string;
  isProminent?: boolean;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isProminent = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <span className={`${isProminent ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{question}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ml-4 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className={`pb-4 text-gray-600 leading-relaxed ${isProminent ? 'text-base' : 'text-sm'}`}>
          {answer}
        </div>
      )}
    </div>
  );
};

// Comparison Row Component
interface ComparisonRowProps {
  feature: string;
  free: boolean | string;
  pro: boolean | string;
  elite: boolean | string;
}

const ComparisonRow: React.FC<ComparisonRowProps> = ({ feature, free, pro, elite }) => (
  <tr className="hover:bg-gray-50">
    <td className="py-4 px-6 text-gray-700">{feature}</td>
    <td className="text-center py-4 px-6">
      {typeof free === 'boolean' ? (
        free ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />
      ) : (
        <span className="text-gray-600">{free}</span>
      )}
    </td>
    <td className="text-center py-4 px-6 bg-[#FAFBFF]/30">
      {typeof pro === 'boolean' ? (
        pro ? <Check className="w-5 h-5 text-cyan-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />
      ) : (
        <span className="font-medium text-gray-900">{pro}</span>
      )}
    </td>
    <td className="text-center py-4 px-6">
      {typeof elite === 'boolean' ? (
        elite ? <Check className="w-5 h-5 text-green-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 mx-auto" />
      ) : (
        <span className="text-gray-600">{elite}</span>
      )}
    </td>
  </tr>
);

const Pricing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [billingCadence, setBillingCadence] = useState<'monthly' | 'annual'>('monthly');
  // showStudentPrice is a visual toggle for the public pricing page - it lets visitors
  // SEE the .edu discount before signing up. Actual checkout still uses the student
  // Stripe Price IDs (only ones wired); list-price checkout will be wired when
  // STRIPE_*_LIST_PRICE_ID env vars are added.
  const [showStudentPrice, setShowStudentPrice] = useState(true);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, updateUser, checkCredits } = useFirebaseAuth();
  const isStudent = Boolean(user?.isStudent);
  // Trial badge follows the toggle (visual). Real trial length in Stripe is set
  // server-side from the Firestore isStudent flag (see backend/app/services/stripe_client.py).
  const trialDays = showStudentPrice ? 30 : 14;

  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    }
  }, [user]);

  useEffect(() => {
    const handleScroll = () => setNavbarScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) return;

      const token = await firebaseUser.getIdToken();
      
      const API_URL = BACKEND_URL;

      const response = await fetch(`${API_URL}/api/subscription-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch subscription status:', error);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) {
        throw new Error('No Firebase user found');
      }

      const token = await firebaseUser.getIdToken();
      
      const API_URL = BACKEND_URL;

      const response = await fetch(`${API_URL}/api/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/pricing`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.details || errorData.error || 'Failed to create portal session';
        throw new Error(errorMessage);
      }

      const { url } = await response.json();
      if (!url) {
        throw new Error('No portal URL received from server');
      }
      
      window.location.href = url;

    } catch (error) {
      console.error('Portal error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to open subscription management. Please try again.';
      
      // Show more helpful error message
      if (errorMessage.includes('mode mismatch') || errorMessage.includes('test mode') || errorMessage.includes('live mode')) {
        alert('Stripe Configuration Error: There is a mismatch between test and live mode keys. Please contact support or check your Stripe configuration.');
      } else {
        alert(`Failed to open subscription management: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };


  const handleResetCredits = async (tier: 'free' | 'pro' | 'elite') => {
    if (!user) return;
    
    // Credit amounts based on tier (matches backend/app/config.py TIER_CONFIGS)
    const creditMap = {
      'free': 500,
      'pro': 3000,
      'elite': 12000
    };
    
    const maxCredits = creditMap[tier];
    
    try {
      console.log(`🔄 Resetting credits for ${tier} tier to ${maxCredits}`);
      await updateUser({ 
        credits: maxCredits,
        maxCredits: maxCredits
      });
      
      // Refresh credits to update UI
      if (checkCredits) {
        await checkCredits();
      }
      
      // No popup - just silently reset credits
    } catch (error) {
      console.error("Error resetting credits:", error);
      // Silently fail - don't show popup
    }
  };

  const handleSubscriptionUpgrade = async (newTier: 'pro' | 'elite') => {
    if (!user) return;

    setIsLoading(true);
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('No Firebase user found');

      const token = await firebaseUser.getIdToken();

      const API_URL = BACKEND_URL;

      const useAnnualUpgrade = billingCadence === 'annual' && ANNUAL_ENABLED;
      const priceId = newTier === 'elite'
        ? (useAnnualUpgrade ? STRIPE_ELITE_ANNUAL_PRICE_ID! : STRIPE_ELITE_PRICE_ID)
        : (useAnnualUpgrade ? STRIPE_PRO_ANNUAL_PRICE_ID! : STRIPE_PRO_PRICE_ID);

      const response = await fetch(`${API_URL}/api/update-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to update subscription');
      }

      await response.json();

      if (checkCredits) await checkCredits();
      await fetchSubscriptionStatus();

      alert(`Successfully upgraded to ${newTier === 'elite' ? 'Elite' : 'Pro'}! Your credits have been updated.`);
    } catch (error) {
      console.error('Subscription upgrade error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to upgrade: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (planType: 'free' | 'pro' | 'elite', fromFeature?: string) => {
    // Public pricing page - visitors without an account get bounced to sign-in
    // and brought back to /pricing with the plan they tapped pre-selected.
    if (!user) {
      navigate(`/signin?next=/pricing&plan=${planType}`);
      return;
    }

    try {
      if (planType === 'free') {
        await updateUser({
          tier: 'free',
          credits: 500,
          maxCredits: 500
        });
        navigate("/find");
      }
      else if (planType === 'pro' || planType === 'elite') {
        trackUpgradeClick(fromFeature || 'pricing', {
          from_location: 'pricing_page',
          plan_selected: planType,
        });

        if (hasActiveSubscription) {
          await handleSubscriptionUpgrade(planType);
        } else {
          await handleStripeCheckout(planType);
        }
      }
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const handleStripeCheckout = async (tier: 'pro' | 'elite' = 'pro') => {
    if (!user) {
      console.error("User not authenticated");
      return;
    }

    setIsLoading(true);
    
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) {
        throw new Error('No Firebase user found');
      }

      const token = await firebaseUser.getIdToken();
      
      const API_URL = BACKEND_URL;

      // Select price ID based on tier + billing cadence.
      // Annual price IDs come from env vars - if not set, fall back to monthly so checkout still works.
      const useAnnual = billingCadence === 'annual' && ANNUAL_ENABLED;
      const priceId = tier === 'elite'
        ? (useAnnual ? STRIPE_ELITE_ANNUAL_PRICE_ID! : STRIPE_ELITE_PRICE_ID)
        : (useAnnual ? STRIPE_PRO_ANNUAL_PRICE_ID! : STRIPE_PRO_PRICE_ID);

      const response = await fetch(`${API_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          priceId: priceId,
          userId: user.uid,
          userEmail: user.email,
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Checkout session creation failed:', response.status, errorText);
        throw new Error(`Failed to create checkout session: ${response.status} - ${errorText}`);
      }

      const responseData = await response.json();
      console.log('Checkout session response:', responseData);
      
      const sessionId = responseData.sessionId;
      if (!sessionId) {
        console.error('No sessionId in response:', responseData);
        throw new Error('Invalid response from server: missing sessionId');
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe failed to initialize');
      }

      const { error } = await stripe.redirectToCheckout({
        sessionId: sessionId,
      });

      if (error) {
        console.error('Stripe redirect error:', error);
        alert('Payment error: ' + error.message);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Something went wrong: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isProUser = subscriptionStatus?.tier === 'pro' && (subscriptionStatus?.status === 'active' || subscriptionStatus?.status === 'trialing');
  const isEliteUser = subscriptionStatus?.tier === 'elite' && (subscriptionStatus?.status === 'active' || subscriptionStatus?.status === 'trialing');
  const hasActiveSubscription = isProUser || isEliteUser;
  const currentTier = subscriptionStatus?.tier || 'free';

  // Format renewal date
  const renewalDate = subscriptionStatus?.currentPeriodEnd 
    ? new Date(subscriptionStatus.currentPeriodEnd * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ background: '#FAFBFF', minHeight: '100vh' }}>
      <Helmet>
        <title>Offerloop Pricing - Student Plans for College Networking</title>
        <meta name="description" content="Students save ~50% with a .edu email. Pro $14.99/mo, Elite $34.99/mo, plus annual plans. Offerloop helps college students network into consulting, investment banking, and tech." />
        <link rel="canonical" href="https://offerloop.ai/pricing" />
      </Helmet>

      {/* Pill header - logged-out (marketing) visitors only. In-app pricing keeps its own nav. */}
      {!user && (
        <>
          <div className="fixed top-0 left-0 right-0 z-50 flex justify-center" style={{ padding: '12px 24px 8px' }}>
            <header
              className="flex items-center justify-between w-full h-12 px-5 md:px-6"
              style={{
                maxWidth: '860px',
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: '4px',
                background: navbarScrolled ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(16px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
                border: '1px solid rgba(37,99,235,0.1)',
                borderRadius: '100px',
                boxShadow: navbarScrolled ? '0 2px 16px rgba(37,99,235,0.08)' : '0 1px 8px rgba(0,0,0,0.03)',
                transition: 'all 0.3s ease',
                overflow: 'visible',
              }}
            >
              <div className="flex items-center">
                <img src={OfferloopLogo} alt="Offerloop" className="h-16 cursor-pointer logo-animate" onClick={() => navigate('/')} />
              </div>

              <nav className="hidden md:flex items-center gap-5" style={{ flexShrink: 1, minWidth: 0 }}>
                <Link to="/for-students" className="nav-link text-sm relative" style={{ color: '#475569', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
                  For Students
                </Link>
                <Link to="/pricing" className="nav-link text-sm relative" style={{ color: '#2563EB', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
                  Pricing
                </Link>
                <Link to="/about" className="nav-link text-sm relative" style={{ color: '#475569', fontFamily: "'Libre Baskerville', Georgia, serif", fontWeight: 600, textDecoration: 'none' }}>
                  About
                </Link>
              </nav>

              <div className="hidden md:flex items-center gap-3" style={{ flexShrink: 0 }}>
                <button
                  onClick={() => navigate('/signin?mode=signin')}
                  style={{ background: 'transparent', color: '#0F172A', fontSize: '13px', fontWeight: 600, fontFamily: "'Libre Baskerville', Georgia, serif", padding: '8px 20px', borderRadius: '100px', border: '1px solid rgba(37,99,235,0.2)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.2)'; }}
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate('/signin?mode=signup')}
                  style={{ background: '#2563EB', color: '#fff', fontSize: '13px', fontWeight: 600, fontFamily: "'Libre Baskerville', Georgia, serif", padding: '8px 20px', borderRadius: '3px', border: 'none', cursor: 'pointer', transition: 'background 0.15s ease', flexShrink: 0, whiteSpace: 'nowrap' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1D4ED8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#2563EB'; }}
                >
                  Create account
                </button>
              </div>

              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2" style={{ color: '#475569' }}>
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </header>
          </div>

          {mobileMenuOpen && (
            <div className="fixed top-[72px] left-4 right-4 md:hidden z-40" style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(37,99,235,0.1)', borderRadius: '16px', boxShadow: '0 4px 24px rgba(37,99,235,0.08)', backdropFilter: 'blur(16px)' }}>
              <nav className="flex flex-col p-3 gap-1">
                <Link to="/for-students" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#475569', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>For Students</Link>
                <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#2563EB', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>Pricing</Link>
                <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="text-left px-4 py-3 text-sm font-medium rounded-lg hover:bg-gray-50" style={{ color: '#475569', fontFamily: "'Libre Baskerville', Georgia, serif", textDecoration: 'none' }}>About</Link>
                <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(37,99,235,0.08)' }}>
                  <button onClick={() => { navigate('/signin?mode=signup'); setMobileMenuOpen(false); }} className="w-full text-center py-3 text-sm font-semibold" style={{ background: '#2563EB', color: '#fff', borderRadius: '3px', fontFamily: "'Libre Baskerville', Georgia, serif" }}>Create account</button>
                </div>
              </nav>
            </div>
          )}

          <div className="h-20" />
        </>
      )}

      <div className="w-full px-3 py-6 sm:px-6 sm:py-12" style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Back Navigation - in-app (logged-in) visitors only. Marketing visitors use the pill header. */}
        {user && (
          <div className="mb-8 animate-fadeInUp">
            <button
              onClick={() => navigate("/find")}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="font-medium">Find people</span>
            </button>
          </div>
        )}

        {/* Subscription Status Banner */}
        {hasActiveSubscription && (
          <div className="mb-10 bg-[#0F172A] rounded-[3px] p-[2px] animate-fadeInUp" style={{ animationDelay: '50ms' }}>
            <div className="bg-white rounded-[3px] px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {isEliteUser ? 'Elite' : 'Pro'} Subscription{subscriptionStatus?.status === 'trialing' ? ' - Free Trial' : ' Active'}
                    </h3>
                    {subscriptionStatus?.status === 'trialing' ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Trial</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">Active</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {user?.credits ?? 0} credits remaining
                    {renewalDate && !subscriptionStatus?.cancelAtPeriodEnd && ` • Renews ${renewalDate}`}
                    {subscriptionStatus?.cancelAtPeriodEnd && renewalDate && ` • Cancels ${renewalDate}`}
                  </p>
                </div>
              </div>
              
              <button 
                onClick={handleManageSubscription}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F172A] text-white font-medium rounded-[3px] hover:shadow-lg hover:shadow-[#3B82F6]/30 transition-all disabled:opacity-50"
              >
                <Settings className="w-4 h-4" />
                Manage Subscription
              </button>
            </div>
          </div>
        )}

        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(36px, 5.5vw, 56px)',
              fontWeight: 400,
              letterSpacing: '-0.025em',
              color: '#0F172A',
              textAlign: 'center',
              marginBottom: '14px',
              lineHeight: 1.1,
            }}
          >
            Pricing
          </h1>
          <p
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: '16px',
              color: '#0F172A',
              textAlign: 'center',
              marginBottom: '12px',
              lineHeight: 1.5,
            }}
          >
            {isStudent
              ? `Welcome, student - your .edu unlocks ~50% off and a 30-day free trial.`
              : `Built for college students. Use a .edu email to unlock ~50% off and a 30-day trial.`}
          </p>
          {/* Toggles - billing cadence + student-price visual */}
          <div className="flex flex-col items-center gap-4">

            {/* .edu Student Price toggle - the primary discount lever */}
            <div className={`
              flex items-center gap-3 px-4 py-3 rounded-full border-2 transition-all
              ${showStudentPrice
                ? 'bg-[#EFF6FF] border-blue-300 shadow-sm'
                : 'bg-white border-gray-200'
              }
            `}>
              <span className="text-base">🎓</span>
              <span className={`text-sm font-semibold ${showStudentPrice ? 'text-blue-900' : 'text-gray-600'}`}>
                {showStudentPrice ? 'Showing .edu student price - save ~50%' : 'Show .edu student price (~50% off)'}
              </span>
              <button
                onClick={() => setShowStudentPrice(!showStudentPrice)}
                role="switch"
                aria-checked={showStudentPrice}
                aria-label="Toggle student price display"
                className={`
                  relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors
                  ${showStudentPrice ? 'bg-blue-600' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    inline-block h-5 w-5 transform rounded-full bg-white shadow transition
                    ${showStudentPrice ? 'translate-x-5' : 'translate-x-0.5'}
                  `}
                />
              </button>
            </div>

            {/* Monthly / Annual toggle */}
            <div className="inline-flex items-center bg-white border border-gray-200 rounded-full p-1 shadow-sm">
              <button
                onClick={() => setBillingCadence('monthly')}
                className={`px-5 py-2 text-sm font-semibold rounded-full transition-all ${
                  billingCadence === 'monthly'
                    ? 'bg-[#0F172A] text-white shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCadence('annual')}
                className={`px-5 py-2 text-sm font-semibold rounded-full transition-all flex items-center gap-2 ${
                  billingCadence === 'annual'
                    ? 'bg-[#0F172A] text-white shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Annual
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wider ${
                  billingCadence === 'annual' ? 'bg-emerald-400 text-emerald-950' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  2 MONTHS FREE
                </span>
              </button>
            </div>

          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto mt-12 mb-16 animate-fadeInUp" style={{ animationDelay: '200ms' }}>

          {/* Free Plan Card */}
          <div className="bg-white rounded-[3px] border border-gray-200 p-8 flex flex-col h-full hover:border-gray-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
            {/* Plan Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Free</h2>
              <p className="text-gray-500">Try it out for free</p>
            </div>
            
            {/* Price */}
            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold text-gray-900">$0</span>
                <span className="text-gray-500">/forever</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">500 credits / month (~33 contacts)</p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 my-6"></div>

            {/* Features */}
            <div className="flex-1 space-y-4">
              <FeatureItem>500 credits / month (~33 contacts)</FeatureItem>
              <FeatureItem>Up to 5 contacts per search</FeatureItem>
              <FeatureItem>AI email drafting</FeatureItem>
              <FeatureItem>Custom email templates</FeatureItem>
              <FeatureItem>Gmail integration + outreach tracking</FeatureItem>
              <FeatureItem>Meeting Prep</FeatureItem>
              <FeatureItem>Smart filters</FeatureItem>
              <DisabledFeatureItem>Find Hiring Managers</DisabledFeatureItem>
              <DisabledFeatureItem>Bulk drafting + Export</DisabledFeatureItem>
              <DisabledFeatureItem>Firm search</DisabledFeatureItem>
              <DisabledFeatureItem>The Agent</DisabledFeatureItem>
            </div>
            
            {/* CTA Button */}
            <div className="mt-8">
              <button
                onClick={() => {
                  if (!user) {
                    navigate('/signin?next=/pricing&plan=free');
                  } else if (currentTier === 'free') {
                    handleResetCredits('free');
                  } else {
                    handleUpgrade('free', 'pricing_page');
                  }
                }}
                className="w-full py-3.5 px-6 rounded-[3px] font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                {!user ? 'Sign up free' : currentTier === 'free' ? 'Current Plan' : 'Start for Free'}
              </button>
            </div>
          </div>

          {/* Pro Plan Card (Featured) */}
          <div className="relative bg-[#3B82F6] rounded-[3px] p-[2px] flex flex-col hover:shadow-xl hover:shadow-[#3B82F6]/20 transition-all duration-300 hover:-translate-y-1">

            {/* Card Content */}
            <div className="bg-white rounded-[3px] p-8 flex flex-col h-full">
              {/* Plan Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 bg-[#3B82F6] text-white text-[10px] font-bold tracking-wider uppercase rounded-full">
                  {currentTier === 'pro' ? '✓ Your Plan' : '★ Most Popular'}
                </div>
                <h2 className="text-2xl font-bold text-[#3B82F6] mb-2">Pro</h2>
                <p className="text-gray-500">Best for Students</p>
              </div>

              {/* Price */}
              <div className="text-center mb-6">
                {showStudentPrice ? (
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-lg text-gray-400 line-through">${PRICES.pro.listMonthly}</span>
                    <span className="text-4xl font-bold text-gray-900">
                      ${billingCadence === 'annual' ? (PRICES.pro.studentAnnual / 12).toFixed(2) : PRICES.pro.studentMonthly}
                    </span>
                    <span className="text-gray-500">/mo</span>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-4xl font-bold text-gray-900">${PRICES.pro.listMonthly}</span>
                    <span className="text-gray-500">/mo</span>
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  {billingCadence === 'annual' && showStudentPrice
                    ? `Billed yearly at $${PRICES.pro.studentAnnual} · save $30/yr`
                    : '3,000 credits / month (~200 contacts)'}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {showStudentPrice && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-semibold text-blue-700">
                      🎓 .edu required
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-semibold text-green-700">
                    {trialDays}-day free trial · no credit card
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 my-6"></div>

              {/* Features */}
              <div className="flex-1 space-y-4">
                <FeatureItem highlight>3,000 credits / month (~200 contacts)</FeatureItem>
                <FeatureItem>Up to 15 contacts per search</FeatureItem>
                <FeatureItem><span className="font-semibold">Everything in Free, plus:</span></FeatureItem>
                <FeatureItem>Single agent use</FeatureItem>
                <FeatureItem>Find Hiring Managers</FeatureItem>
                <FeatureItem>Firm Search</FeatureItem>
                <FeatureItem>Bulk drafting + Export (CSV & Gmail)</FeatureItem>
                <FeatureItem>Unlimited directory saving</FeatureItem>
                <DisabledFeatureItem>Run multiple agents at once (Elite)</DisabledFeatureItem>
                <DisabledFeatureItem>Priority queue + support</DisabledFeatureItem>
                <FeatureItem highlight>Save ~210 hours/mo on research</FeatureItem>
              </div>
              
              {/* CTA Button */}
              <div className="mt-8">
                <button 
                  onClick={
                    isLoading ? undefined :
                    currentTier === 'pro'
                      ? (e: React.MouseEvent) => {
                          if (e.shiftKey) {
                            handleResetCredits('pro');
                          } else {
                            handleManageSubscription();
                          }
                        }
                      : () => handleUpgrade('pro', 'pricing_page')
                  }
                  disabled={isLoading || currentTier === 'elite'}
                  title={currentTier === 'pro' ? 'Click to manage subscription. Hold Shift+Click to reset credits.' : currentTier === 'elite' ? 'You are on Elite plan' : undefined}
                  className={`
                    w-full py-3.5 px-6 rounded-[3px] font-semibold transition-all
                    ${currentTier === 'elite' 
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                      : currentTier === 'pro'
                        ? 'bg-[#3B82F6] text-white'
                        : 'bg-[#3B82F6] text-white hover:shadow-lg hover:shadow-[#3B82F6]/30 hover:scale-[1.02] active:scale-100'
                    }
                    disabled:opacity-50
                  `}
                >
                  {isLoading ? 'Processing...' : currentTier === 'pro' ? 'Manage Subscription' : currentTier === 'elite' ? 'On Elite Plan' : 'Start Free Trial'}
                </button>
              </div>
            </div>
          </div>

          {/* Elite Plan Card */}
          <div className={`relative bg-white rounded-[3px] border p-8 flex flex-col h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${currentTier === 'elite' ? 'border-purple-300' : 'border-gray-200 hover:border-gray-300'}`}>
            {/* Active Badge if current plan */}
            {currentTier === 'elite' && (
              <div className="absolute -top-3 right-6">
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                  ACTIVE
                </span>
              </div>
            )}
            
            {/* Plan Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Elite</h2>
              <p className="text-gray-500">For serious recruiting season</p>
            </div>
            
            {/* Price */}
            <div className="text-center mb-6">
              {showStudentPrice ? (
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-lg text-gray-400 line-through">${PRICES.elite.listMonthly}</span>
                  <span className="text-4xl font-bold text-gray-900">
                    ${billingCadence === 'annual' ? (PRICES.elite.studentAnnual / 12).toFixed(2) : PRICES.elite.studentMonthly}
                  </span>
                  <span className="text-gray-500">/mo</span>
                </div>
              ) : (
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-4xl font-bold text-gray-900">${PRICES.elite.listMonthly}</span>
                  <span className="text-gray-500">/mo</span>
                </div>
              )}
              <p className="text-sm text-gray-500 mt-2">
                {billingCadence === 'annual' && showStudentPrice
                  ? `Billed yearly at $${PRICES.elite.studentAnnual} · save $70/yr`
                  : '12,000 credits / month (~800 contacts)'}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {showStudentPrice && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-semibold text-blue-700">
                    🎓 .edu required
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-semibold text-green-700">
                  {trialDays}-day free trial · no credit card
                </span>
              </div>
            </div>

              {/* Divider */}
              <div className="border-t border-gray-100 my-6"></div>

              {/* Features */}
              <div className="flex-1 space-y-4">
                <FeatureItem highlight>Run up to 5 Agents simultaneously</FeatureItem>
                <FeatureItem highlight>12,000 credits / month (~800 contacts)</FeatureItem>
                <FeatureItem>Up to 30 contacts per search</FeatureItem>
                <FeatureItem><span className="font-semibold">Everything in Pro, plus:</span></FeatureItem>
                <FeatureItem>Priority queue for contact generation</FeatureItem>
                <FeatureItem>Personalized templates tailored to your resume</FeatureItem>
                <FeatureItem>Weekly personalized firm insights</FeatureItem>
                <FeatureItem>Early access to new AI tools</FeatureItem>
                <FeatureItem>Priority support</FeatureItem>
                <FeatureItem highlight>Save ~1,120 hours/mo at max usage</FeatureItem>
              </div>
            
            {/* CTA Button */}
            <div className="mt-8">
              <button 
                onClick={
                  isLoading ? undefined :
                  currentTier === 'elite'
                    ? (e: React.MouseEvent) => {
                        if (e.shiftKey) {
                          handleResetCredits('elite');
                        } else {
                          handleManageSubscription();
                        }
                      }
                    : () => handleUpgrade('elite', 'pricing_page')
                }
                disabled={isLoading}
                title={currentTier === 'elite' ? 'Click to manage subscription. Hold Shift+Click to reset credits.' : undefined}
                className={`
                  w-full py-3.5 px-6 rounded-[3px] font-semibold transition-all
                  ${currentTier === 'elite' 
                    ? 'border-2 border-[#E2E8F0] text-[#3B82F6] hover:bg-[#FAFBFF]' 
                    : 'bg-gray-900 text-white hover:bg-gray-800 hover:shadow-lg'
                  }
                `}
              >
                {isLoading ? 'Processing...' : currentTier === 'elite' ? 'Manage Subscription' : currentTier === 'pro' ? 'Upgrade to Elite' : 'Try Elite Free'}
              </button>
            </div>
          </div>
        </div>

        {/* Money-Back Guarantee Banner */}
        <div className="max-w-2xl mx-auto mb-16 animate-fadeInUp" style={{ animationDelay: '300ms' }}>
          <div className="bg-green-50 rounded-[3px] p-6 border border-green-200 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">
              30 Days Free with .edu (14 Otherwise) · 7-Day Money-Back Guarantee
            </h3>
            <p className="text-sm text-gray-600">
              Students with a .edu email get a full 30-day Pro trial - no credit card.
              Non-student trial is 14 days. After that, not satisfied within 7 days? Full refund, no questions asked.
            </p>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="mb-16 animate-fadeInUp" style={{ animationDelay: '400ms' }}>
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Compare all features</h2>
          
          <div className="bg-white rounded-[3px] border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-4 px-6 font-semibold text-gray-900">Feature</th>
                  <th className="text-center py-4 px-6 font-semibold text-gray-900">Free</th>
                  <th className="text-center py-4 px-6 font-semibold text-[#3B82F6]">Pro</th>
                  <th className="text-center py-4 px-6 font-semibold text-gray-900">Elite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <ComparisonRow feature="Monthly Credits" free="500" pro="3,000" elite="12,000" />
                <ComparisonRow feature="Contacts per Search" free="5" pro="15" elite="30" />
                <ComparisonRow feature="Concurrent Agents" free=" - " pro="1" elite="Up to 5" />
                <ComparisonRow feature="Find Companies" free="Credit-limited" pro={true} elite={true} />
                <ComparisonRow feature="Find Hiring Managers" free={false} pro={true} elite={true} />
                <ComparisonRow feature="Email Outreach Tracking" free={true} pro={true} elite={true} />
                <ComparisonRow feature="Gmail Integration" free={true} pro={true} elite={true} />
                <ComparisonRow feature="Custom Email Templates" free={true} pro={true} elite={true} />
                <ComparisonRow feature="Export to CSV" free={false} pro={true} elite={true} />
                <ComparisonRow feature="Bulk Drafting" free={false} pro={true} elite={true} />
                <ComparisonRow feature="Firm Search" free={false} pro={true} elite={true} />
                <ComparisonRow feature="Priority Queue + Support" free={false} pro={false} elite={true} />
                <ComparisonRow feature="Time Saved / Month" free="~28 hrs" pro="~210 hrs" elite="~1,120 hrs" />
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mb-16 animate-fadeInUp" style={{ animationDelay: '500ms' }}>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          
          <div>
            <FAQItem
              question="How does the free trial work?"
              answer="If you sign up with a .edu email, you get 30 days of full Pro access - no credit card required. Without .edu, the trial is 14 days. Either way you can cancel anytime, and at the end of the trial you drop to the Free plan automatically (no surprise charges)."
              isProminent={true}
            />
            <FAQItem
              question="What's the .edu student discount?"
              answer="The student price is the price you see - roughly 50% off the public list rate. As long as you signed up with a verified .edu email, you keep that student price for life, even after you graduate."
              isProminent={true}
            />
            <FAQItem
              question="What happens when I run out of credits?"
              answer="Searches pause until your plan renews (the 1st of the next month) or you upgrade. No waiting, no emails - just upgrade when you're ready. All your saved contacts and drafts stay put."
              isProminent={true}
            />
            <FAQItem
              question="Can I change plans anytime?"
              answer="Yep, anytime. Upgrading? You get access immediately. Downgrading? Takes effect at your next billing cycle. Takes 10 seconds to switch."
              isProminent={true}
            />
            <FAQItem
              question="Monthly vs annual - which should I pick?"
              answer="Annual saves ~17% - that's roughly two months free. If you're committed to recruiting for the year, annual is the better deal. If you're testing it out, start monthly and switch later."
            />
            <FAQItem
              question="Do credits roll over?"
              answer="Nope, they reset on the 1st of each month. Use 'em or lose 'em - but honestly, most students use them up well before the month is over during peak recruiting."
            />
            <FAQItem
              question="What if I don't have a .edu email?"
              answer="You can still sign up and use Offerloop - you'll just get the 14-day trial instead of 30 days and pay the public list price. Already a paid alumni? Reach out and we'll verify your old school manually."
            />
            <FAQItem
              question="How do I cancel?"
              answer="Cancel anytime from your subscription page. You keep access until the end of your billing period - no tricks."
            />
          </div>
        </div>

        {/* Footer Note */}
        <div className="max-w-3xl text-sm text-gray-500 pb-8 animate-fadeInUp" style={{ animationDelay: '600ms' }}>
          <p>Still unsure? <button onClick={() => window.open('mailto:support@offerloop.ai', '_blank')} className="text-[#3B82F6] hover:underline font-medium">Talk to us</button></p>
        </div>
        
      </div>
    </div>
  );
};

export default Pricing;
