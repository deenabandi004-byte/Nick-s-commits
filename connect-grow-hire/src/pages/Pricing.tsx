import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Check, ArrowLeft, Settings, Shield, ChevronDown, X, Menu, Sparkles, Zap, Clock, Plus } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import OfferloopLogo from '@/assets/offerloop_logo2.png';
import MountainsLake from '@/assets/for-students/mountains-lake.png';
import HighlightWash from '@/assets/for-students/highlight-wash.png';
// ScoutSticky + LandingThumbtack assets are now retired from this page (the
// Scout's Pick sticky-note was replaced with a clean "★ Most Popular" ribbon).
import { loadStripe } from "@stripe/stripe-js";
import { getAuth } from 'firebase/auth';
import { BACKEND_URL } from '@/services/api';
import {
  trackUpgradeClick,
  trackTrialStarted,
  trackSliderDragged,
  trackSeasonPassClicked,
} from "../lib/analytics";
import {
  useTierConfig,
  resolvePriceId,
  resolveSeasonPassPriceId,
  percentOff,
  annualMonthlyEquivalent,
  annualSavings,
  seasonPassVisible,
  emailsFromCredits,
} from "@/hooks/useTierConfig";
import { CreditSlider } from "@/components/CreditSlider";
import { TopUpModal } from "@/components/TopUpModal";
import { useCreditsView } from "@/hooks/useCreditsView";

// For Students palette — matches /for-students and /about so the marketing
// surfaces read as one design system.
const C_FS = {
  ink: '#003262',
  inkSubtle: '#4D619F',
  brand: '#2563EB',
  body: '#475569',
  muted: '#64748B',
  eyebrow: '#6478B4',
  cardBorder: '#E2E8F0',
};

// Vibrant accents — Higgsfield-inspired. Used sparingly for discount badges,
// savings tags, "Most Popular" ribbons, and CTA gradients. The For-Students
// palette stays the base; these are the loud notes on top.
const C_POP = {
  magenta:       '#EC4899',  // hot pink — % OFF discount badges
  magentaDeep:   '#DB2777',  // darker pink for gradient stops
  magentaSoft:   '#FCE7F3',  // pink-100 background for soft badges
  lime:          '#A3E635',  // neon lime — savings tags
  limeDeep:      '#65A30D',  // text-on-lime
  limeSoft:      '#ECFCCB',  // lime-100 soft background
  purple:        '#7C3AED',  // mid-stop in tier-name gradients
};

// Reusable discount/savings pill — used inline next to tier names, on toggles,
// and on feature rows. Pop colors with high contrast on white.
const PopBadge: React.FC<{
  tone?: 'magenta' | 'lime' | 'inverse-magenta';
  children: React.ReactNode;
  size?: 'sm' | 'md';
}> = ({ tone = 'magenta', children, size = 'sm' }) => {
  const styles = {
    magenta: {
      background: `linear-gradient(135deg, ${C_POP.magenta} 0%, ${C_POP.magentaDeep} 100%)`,
      color: '#fff',
      boxShadow: `0 4px 10px -2px ${C_POP.magenta}55`,
    },
    'inverse-magenta': {
      background: C_POP.magentaSoft,
      color: C_POP.magentaDeep,
      boxShadow: 'none',
    },
    lime: {
      background: C_POP.limeSoft,
      color: C_POP.limeDeep,
      boxShadow: 'none',
      border: `1px solid ${C_POP.lime}66`,
    },
  } as const;
  const padY = size === 'md' ? 4 : 3;
  const padX = size === 'md' ? 9 : 7;
  const fontSize = size === 'md' ? 10 : 9;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: `${padY}px ${padX}px`,
        borderRadius: 999,
        fontFamily: "'Inter', sans-serif",
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...styles[tone],
      }}
    >
      {children}
    </span>
  );
};

// Italic-blue serif accent — same component pattern as ForStudentsPage/AboutUs.
const Hl: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ fontStyle: 'italic', color: C_FS.inkSubtle }}>{children}</span>
);

// Watercolor highlight strike using the Figma asset. Used here on ".edu" to
// make the student discount the most catchy detail on the page.
const Wash: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span
    style={{
      position: 'relative',
      display: 'inline',
      backgroundImage: `url(${HighlightWash})`,
      backgroundSize: '100% 70%',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: '0 88%',
      padding: '0 0.05em',
      fontWeight: 700,
    }}
  >
    {children}
  </span>
);

const STRIPE_PUBLISHABLE_KEY = "pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB";
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Legacy Stripe Price IDs — kept as last-resort fallback if `useTierConfig()`
// returns an empty SKU. All real Price ID resolution now goes through the
// `STRIPE_PRICE_CATALOG` matrix exposed by `/api/tier-config` (cofounders wire
// the full SKU set in Stripe; we read by tier/cadence/audience/credits).
const LEGACY_PRO_PRICE_ID = "price_1ScLXrERY2WrVHp1bYgdMAu4";
const LEGACY_ELITE_PRICE_ID = "price_1ScLcfERY2WrVHp1c5rcONJ3";

interface SubscriptionStatus {
  tier: string;
  status: string;
  hasSubscription: boolean;
  // Present only when a REAL Stripe subscription exists. Null during the no-card
  // Pro trial — used to route trial upgrades to checkout, not subscription-modify.
  subscriptionId?: string | null;
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
  // showStudentPrice is a visual toggle — lets visitors SEE the .edu discount
  // before signing up. Real checkout uses the student SKU only when the user's
  // Firestore `isStudent` flag is true; the server re-validates audience match.
  const [showStudentPrice, setShowStudentPrice] = useState(true);
  const [navbarScrolled, setNavbarScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Higgsfield-style in-tier credit slider — selected stop index per tier.
  // Initialized to the `default: true` stop in SLIDER_STOPS once config loads.
  const [proStopIdx, setProStopIdx] = useState(1);
  const [eliteStopIdx, setEliteStopIdx] = useState(1);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const navigate = useNavigate();
  const { user, updateUser, checkCredits, isLoading: authLoading } = useFirebaseAuth();
  // isStudent is on the Firestore user doc; not yet typed on the auth-context User shape.
  const isStudent = Boolean((user as { isStudent?: boolean } | null)?.isStudent);

  // Pull runtime tier config (cached via React Query). Drives prices, slider
  // stops, Stripe SKUs, trial days, active promos, top-up packs. Falls back to
  // lib/constants.ts defaults if the endpoint is unreachable.
  const { config: tierConfig } = useTierConfig();
  const creditsView = useCreditsView();
  const proStops = tierConfig.slider_stops.pro;
  const eliteStops = tierConfig.slider_stops.elite;
  const proStop = proStops[proStopIdx];
  const eliteStop = eliteStops[eliteStopIdx];

  // Annual SKUs exist only for the default credit stop on each tier (Pro 2K,
  // Elite 5K). Annual billing is selectable only when both sliders sit on their
  // default stop, so checkout always resolves to a real annual Stripe Price.
  const annualAvailable = Boolean(proStop?.default) && Boolean(eliteStop?.default);

  // Audience (student vs list) drives both display and Stripe Price ID resolution.
  const audience = showStudentPrice ? 'student' : 'list';

  // Derive display prices from the selected slider stop + cadence.
  const proMonthlyPrice = audience === 'student' ? proStop.student : proStop.list;
  const eliteMonthlyPrice = audience === 'student' ? eliteStop.student : eliteStop.list;
  const proListMonthly = proStop.list;
  const eliteListMonthly = eliteStop.list;
  // Annual prices are derived from monthly so they TRACK the slider. The fixed
  // `tierConfig.annual_pricing` dict is now only a Stripe-wiring reference for
  // cofounders (which default-stop SKU to map). Discount math: monthly × 9.6
  // = 20% off monthly cadence, equivalent to "2.4 months free".
  const ANNUAL_DISCOUNT_MULTIPLIER = 9.6; // = 12 × (1 - 0.20)
  const proAnnualPrice = Math.round(proMonthlyPrice * ANNUAL_DISCOUNT_MULTIPLIER);
  const eliteAnnualPrice = Math.round(eliteMonthlyPrice * ANNUAL_DISCOUNT_MULTIPLIER);

  // Stripe Price ID resolution from the env-driven catalog. Empty string means
  // cofounders haven't wired that SKU yet — CTA falls back to the legacy default.
  const proPriceId = useMemo(() => {
    const id = resolvePriceId(
      tierConfig.stripe_catalog,
      'pro',
      billingCadence,
      audience,
      proStop.credits,
    );
    return id || LEGACY_PRO_PRICE_ID;
  }, [tierConfig.stripe_catalog, billingCadence, audience, proStop.credits]);

  const elitePriceId = useMemo(() => {
    const id = resolvePriceId(
      tierConfig.stripe_catalog,
      'elite',
      billingCadence,
      audience,
      eliteStop.credits,
    );
    return id || LEGACY_ELITE_PRICE_ID;
  }, [tierConfig.stripe_catalog, billingCadence, audience, eliteStop.credits]);

  const seasonPassPriceId = useMemo(
    () => resolveSeasonPassPriceId(tierConfig.stripe_catalog, audience),
    [tierConfig.stripe_catalog, audience],
  );

  // Real coupon-gated urgency badge. Empty active_promos = no badge.
  const hasActivePromo = Object.values(tierConfig.active_promos).some(Boolean);

  // Trial duration — single value for everyone, from config. The .edu benefit is the
  // price discount, not a longer trial. Simpler to communicate, less confusing.
  const trialDays = tierConfig.trial.days_non_student;

  // Annual savings math — tracks the active audience so the badge reflects
  // the actual savings the user would see at checkout (student vs list).
  const proAnnualSave = annualSavings(
    audience === 'student' ? proStop.student : proStop.list,
    proAnnualPrice,
  );
  const eliteAnnualSave = annualSavings(
    audience === 'student' ? eliteStop.student : eliteStop.list,
    eliteAnnualPrice,
  );

  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    }
  }, [user]);

  // Sync slider indices to the `default: true` stop once the runtime config loads.
  useEffect(() => {
    const proDefault = proStops.findIndex((s) => s.default);
    const eliteDefault = eliteStops.findIndex((s) => s.default);
    if (proDefault >= 0 && proStopIdx === 1 && proDefault !== 1) setProStopIdx(proDefault);
    if (eliteDefault >= 0 && eliteStopIdx === 1 && eliteDefault !== 1) setEliteStopIdx(eliteDefault);
    // Intentionally one-shot on first load — user drags after this are preserved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierConfig]);

  // If either slider moves off its default stop while Annual is selected, fall
  // back to Monthly. Annual Stripe Prices only exist for the default stop, so
  // staying on Annual at a non-default stop would resolve to the wrong SKU.
  useEffect(() => {
    if (billingCadence === 'annual' && !annualAvailable) {
      setBillingCadence('monthly');
    }
  }, [billingCadence, annualAvailable]);

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
    
    // Credit amounts based on tier (matches backend/app/config.py TIER_CONFIGS,
    // doubled 2026-06-10 — see lib/constants.ts TIER_CONFIGS)
    const creditMap = {
      'free': 300,
      'pro': 2000,
      'elite': 5000
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

      const priceId = newTier === 'elite' ? elitePriceId : proPriceId;

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

  // Try to activate the one-time Pro free trial. Returns true if the trial
  // was started (caller should navigate); false if ineligible (caller should
  // fall back to Stripe checkout).
  const handleStartTrial = async (): Promise<boolean> => {
    if (!user) return false;
    setIsLoading(true);
    try {
      const auth = getAuth();
      const fbUser = auth.currentUser;
      if (!fbUser) return false;
      const token = await fbUser.getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/users/start-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        trackTrialStarted({ tier: 'pro', from_location: 'pricing_page' });
        if (checkCredits) await checkCredits();
        await fetchSubscriptionStatus();
        navigate('/find');
        return true;
      }
      // 409 = trial_already_used or already_subscribed → fall back to Stripe checkout
      // 404 = user doc missing → also fall back (Stripe checkout will surface the real error)
      return false;
    } catch (e) {
      console.error('start-trial failed:', e);
      return false;
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

        // For Pro: prefer the free trial over Stripe checkout when the user
        // is eligible (Free tier + hasn't used trial). The backend returns
        // 409 if ineligible, which we silently fall back to checkout for.
        if (planType === 'pro' && !hasActiveSubscription && currentTier === 'free') {
          const started = await handleStartTrial();
          if (started) return;
          // else: fall through to Stripe checkout
        }

        // Modify-in-place only works with a REAL Stripe subscription. A no-card
        // trial user has subscriptionStatus 'trialing' but no Stripe sub, so they
        // must go through checkout (which converts the trial to paid + hands over
        // the full monthly pool). Gating on subscriptionId, not the trialing flag.
        const hasRealStripeSub = !!subscriptionStatus?.subscriptionId;
        if (hasRealStripeSub) {
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
      // Anonymous visitor on the public /pricing page — send them to sign up,
      // then bring them straight back here to complete the upgrade.
      navigate(`/signin?mode=signup&redirect=${encodeURIComponent(`/pricing?tier=${tier}`)}`);
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

      // Resolve Stripe Price ID from the runtime catalog. Falls back to the
      // legacy live SKU if cofounders haven't wired the new audience/cadence/
      // credits combination yet (resolvePriceId returns '' on miss).
      const priceId = tier === 'elite' ? elitePriceId : proPriceId;

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

  // Season Pass — one-time, mode=payment checkout (NOT a subscription). Routed
  // to its own backend endpoint, which grants the season_pass tier on the
  // webhook. Mirrors the top-up purchase path, not handleStripeCheckout.
  const handleSeasonPassCheckout = async () => {
    if (!user) {
      navigate(`/signin?mode=signup&redirect=${encodeURIComponent('/pricing')}`);
      return;
    }
    setIsLoading(true);
    try {
      const fbUser = getAuth().currentUser;
      if (!fbUser) throw new Error('No Firebase user found');
      const token = await fbUser.getIdToken();
      const res = await fetch(`${BACKEND_URL}/api/billing/create-season-pass-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          audience,
          successUrl: `${window.location.origin}/payment-success?season_pass=1&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Season Pass checkout failed: ${res.status}`);
      }
      const { sessionId } = await res.json();
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe failed to initialize');
      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) alert('Payment error: ' + error.message);
    } catch (error) {
      console.error('Season Pass checkout error:', error);
      alert(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  // Tier resolution, in priority order:
  //   1. the freshly-fetched subscription status (richest, but async),
  //   2. the `user` object (auth context resolves it from Firestore),
  //   3. a localStorage hint from a prior visit — lets a returning user see the
  //      correct UI on the VERY FIRST paint, with no flash.
  const cachedTier = (typeof window !== 'undefined'
    ? (localStorage.getItem('offerloop_tier') as 'free' | 'pro' | 'elite' | null)
    : null);
  const currentTier = subscriptionStatus?.tier || user?.subscriptionTier || user?.tier || cachedTier || 'free';
  // Derive subscription flags from the RESOLVED tier so the promo card, the
  // subscription banner, and locked-feature states don't flash in/out before
  // /api/subscription-status returns. Once that fetch lands we honor its live
  // active/trialing status; until then we trust the tier from user/cache.
  const isProUser = subscriptionStatus
    ? (subscriptionStatus.tier === 'pro' && (subscriptionStatus.status === 'active' || subscriptionStatus.status === 'trialing'))
    : currentTier === 'pro';
  const isEliteUser = subscriptionStatus
    ? (subscriptionStatus.tier === 'elite' && (subscriptionStatus.status === 'active' || subscriptionStatus.status === 'trialing'))
    : currentTier === 'elite';
  const hasActiveSubscription = isProUser || isEliteUser;
  // Ready as soon as auth resolves — or immediately if we have a cached tier hint
  // (the common returning-visitor case), so the buttons never pop in from a box.
  const ctaReady = !authLoading || !!cachedTier;

  // Persist the resolved tier as a first-paint hint; clear it once we know the
  // user is signed out, so a returning visitor never sees a stale tier.
  useEffect(() => {
    if (user) {
      const t = user.subscriptionTier || user.tier;
      if (t) localStorage.setItem('offerloop_tier', t);
    } else if (!authLoading) {
      localStorage.removeItem('offerloop_tier');
    }
  }, [user, authLoading]);

  // Format renewal date
  const renewalDate = subscriptionStatus?.currentPeriodEnd 
    ? new Date(subscriptionStatus.currentPeriodEnd * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ background: '#FAFBFF', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Page-root mountains backdrop — full-bleed, sits behind everything.
          Sized larger than viewport to overlap the pricing cards and create
          the "bleeding into the choices" effect the brand calls for. Mask fades
          the bottom so the FAQ + footer sit on clean #FAFBFF. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: '-15%',
          right: '-15%',
          height: '180vh',
          backgroundImage: `url(${MountainsLake})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          opacity: 0.55,
          pointerEvents: 'none',
          zIndex: 0,
          maskImage:
            'linear-gradient(180deg, #000 0%, #000 55%, rgba(0,0,0,0.7) 75%, rgba(0,0,0,0.25) 90%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(180deg, #000 0%, #000 55%, rgba(0,0,0,0.7) 75%, rgba(0,0,0,0.25) 90%, transparent 100%)',
        }}
      />
      <Helmet>
        <title>Offerloop Pricing - Student Plans for College Networking</title>
        <meta name="description" content={`Students save ~50% with a .edu email. Pro $14.99/mo with ${trialDays}-day free trial, Elite $34.99/mo, plus annual plans. Offerloop helps college students network into consulting, investment banking, and tech.`} />
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

      <div className="w-full px-3 py-6 sm:px-6 sm:py-12" style={{ maxWidth: '900px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Back navigation — present for everyone. Logged-in users go back to
            wherever they came from (sidebar, deep-link, etc.) via browser history,
            with /find as fallback. Logged-out marketing visitors go home. */}
        <div className="mb-6 animate-fadeInUp" style={{ position: 'relative', zIndex: 2 }}>
          <button
            onClick={() => {
              if (!user) {
                navigate('/');
              } else if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/find');
              }
            }}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>{user ? 'Back' : 'Back to home'}</span>
          </button>
        </div>

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
                    {creditsView.balance.toLocaleString()} credits {creditsView.isTrialing ? 'today' : 'remaining'}
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

        {/* Header Section — For Students aesthetic. Mountains live at page-root
            level now (see below), not scoped to the hero, so they consume the
            full page and bleed behind the cards. */}
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: '32px', paddingTop: 16, paddingBottom: 32 }}>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: C_FS.eyebrow,
                textTransform: 'uppercase',
                margin: '0 0 16px',
              }}
            >
              Pricing
            </p>
            <h1
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(38px, 5.4vw, 58px)',
                fontWeight: 400,
                letterSpacing: '-0.015em',
                color: C_FS.ink,
                textAlign: 'center',
                margin: '0 auto 18px',
                lineHeight: 1.1,
                maxWidth: 760,
              }}
            >
              Plans that <Hl>pay for themselves</Hl>
            </h1>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 17,
                color: C_FS.body,
                textAlign: 'center',
                margin: '0 auto 16px',
                lineHeight: 1.65,
                maxWidth: 620,
              }}
            >
              {isStudent ? (
                <>Welcome, student — your <Wash>.edu</Wash> unlocks <Hl>~50% off</Hl>. {trialDays}-day free trial on Pro.</>
              ) : (
                <>Built for college students. Use a <Wash>.edu</Wash> to unlock <Hl>~50% off</Hl>. {trialDays}-day free trial on Pro.</>
              )}
            </p>

            {/* Live coupon banner — vibrant magenta when a real Stripe coupon ID
                is wired via env. No fake scarcity. Per project standing rule. */}
            {hasActivePromo && tierConfig.active_promos.pricing_recapture && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 20px',
                  marginTop: 14,
                  background: `linear-gradient(135deg, ${C_POP.magenta} 0%, ${C_POP.magentaDeep} 100%)`,
                  border: 'none',
                  borderRadius: 999,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  boxShadow: `0 10px 26px -8px ${C_POP.magenta}88, 0 0 0 3px #fff`,
                }}
              >
                <Sparkles size={14} />
                <span style={{ letterSpacing: '0.04em' }}>
                  Code <strong style={{ letterSpacing: '0.16em' }}>STAYHIRED</strong> — 20% off your first month
                </span>
              </div>
            )}
          </div>
          {/* Toggles - billing cadence + student-price visual */}
          <div className="flex flex-col items-center gap-4" style={{ position: 'relative', zIndex: 1 }}>

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
                onClick={() => annualAvailable && setBillingCadence('annual')}
                disabled={!annualAvailable}
                title={annualAvailable ? undefined : 'Annual billing is available on the default credit amount. Reset the credit slider to its default to pay annually.'}
                className={`px-5 py-2 text-sm font-semibold rounded-full transition-all flex items-center gap-2 ${
                  billingCadence === 'annual'
                    ? 'bg-[#0F172A] text-white shadow'
                    : 'text-gray-600 hover:text-gray-900'
                } ${!annualAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                Annual
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 999,
                    letterSpacing: '0.14em',
                    background: `linear-gradient(135deg, ${C_POP.magenta} 0%, ${C_POP.magentaDeep} 100%)`,
                    color: '#fff',
                    boxShadow: `0 3px 8px -2px ${C_POP.magenta}66`,
                  }}
                >
                  SAVE 20%
                </span>
              </button>
            </div>

          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto mt-12 mb-16 animate-fadeInUp" style={{ animationDelay: '200ms' }}>

          {/* Free Plan Card — translucent so the mountains backdrop bleeds through */}
          <div
            className="rounded-[3px] border border-gray-200 p-8 flex flex-col h-full hover:border-gray-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            style={{ background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
          >
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
              <p className="text-sm text-gray-500 mt-2">
                <strong style={{ color: C_FS.ink }}>
                  ~{emailsFromCredits(300, tierConfig.credit_costs.find_contact).toLocaleString()} emails
                </strong>
                {' '}/ month · 300 credits
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 my-6"></div>

            {/* Features */}
            <div className="flex-1 space-y-4">
              <FeatureItem>
                ~{emailsFromCredits(300, tierConfig.credit_costs.find_contact).toLocaleString()} emails / month
                {' '}<span className="text-gray-400">(300 credits)</span>
              </FeatureItem>
              <FeatureItem>Up to 3 contacts per search</FeatureItem>
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
              {!ctaReady ? (
                <div className="w-full py-3.5 px-6 rounded-[3px] font-semibold border-2 border-gray-100 bg-gray-50 text-transparent animate-pulse select-none" aria-hidden="true">
                  &nbsp;
                </div>
              ) : (
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
              )}
            </div>
          </div>

          {/* Pro Plan Card (Featured) — gradient border + Scout sticky badge */}
          <div
            className="relative rounded-[10px] p-[2px] flex flex-col hover:-translate-y-1 transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #60A5FA 45%, #818CF8 100%)',
              boxShadow:
                '0 12px 28px -8px rgba(37, 99, 235, 0.30), 0 6px 14px -6px rgba(37, 99, 235, 0.18)',
              overflow: 'visible',
            }}
          >
            {/* Hot magenta gradient "MOST POPULAR" ribbon — Higgsfield-style pop. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: -14,
                left: '50%',
                transform: 'translateX(-50%)',
                background: `linear-gradient(135deg, ${C_POP.magenta} 0%, ${C_POP.magentaDeep} 100%)`,
                color: '#fff',
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                padding: '6px 18px',
                borderRadius: 999,
                whiteSpace: 'nowrap',
                boxShadow: `0 8px 20px -4px ${C_POP.magenta}66, 0 0 0 3px #fff`,
                zIndex: 3,
              }}
            >
              ★ Most Popular
            </div>

            {/* Card Content — translucent inner so mountains bleed through gradient border */}
            <div
              className="rounded-[8px] p-8 flex flex-col h-full"
              style={{ background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
            >
              {/* Plan Header — vibrant gradient tier name + inline % OFF pop badge */}
              <div className="text-center mb-6">
                {currentTier === 'pro' && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 bg-emerald-100 text-emerald-700 text-[10px] font-bold tracking-wider uppercase rounded-full border border-emerald-200">
                    ✓ Your Plan
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
                  <h2
                    style={{
                      fontSize: 30,
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      margin: 0,
                      fontFamily: "'Libre Baskerville', Georgia, serif",
                      fontStyle: 'italic',
                      background: `linear-gradient(135deg, ${C_FS.brand} 0%, ${C_POP.purple} 55%, ${C_POP.magenta} 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    Pro
                  </h2>
                  {showStudentPrice && percentOff(proListMonthly, proMonthlyPrice) > 0 && (
                    <PopBadge tone="magenta" size="md">
                      {percentOff(proListMonthly, proMonthlyPrice)}% OFF
                    </PopBadge>
                  )}
                </div>
                <p className="text-gray-500">Best for Students</p>
              </div>

              {/* Price — annual discount applies in BOTH student and list modes.
                  The strikethrough shows the monthly-cadence price they'd pay
                  on the same audience; the big number shows the annual-cadence
                  per-month equivalent. */}
              <div className="text-center mb-4">
                {billingCadence === 'annual' ? (
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-lg text-gray-400 line-through" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${proMonthlyPrice}
                    </span>
                    <span className="text-4xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${annualMonthlyEquivalent(proAnnualPrice).toFixed(2)}
                    </span>
                    <span className="text-gray-500">/mo</span>
                  </div>
                ) : showStudentPrice ? (
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-lg text-gray-400 line-through" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${proListMonthly}
                    </span>
                    <span className="text-4xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${proMonthlyPrice}
                    </span>
                    <span className="text-gray-500">/mo</span>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-4xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${proMonthlyPrice}
                    </span>
                    <span className="text-gray-500">/mo</span>
                  </div>
                )}
                {/* Stacked discount math — real numbers only. Shown whenever
                    there's a real discount to surface: student vs list, OR
                    annual cadence vs monthly cadence. */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  {showStudentPrice && percentOff(proListMonthly, proMonthlyPrice) > 0 && (
                    <PopBadge tone="inverse-magenta">
                      {percentOff(proListMonthly, proMonthlyPrice)}% off list
                    </PopBadge>
                  )}
                  {billingCadence === 'annual' && proAnnualSave > 0 && (
                    <PopBadge tone="lime">save ${proAnnualSave.toFixed(0)}/yr</PopBadge>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {billingCadence === 'annual'
                    ? `Billed yearly at $${proAnnualPrice}`
                    : (
                      <>
                        <strong style={{ color: C_FS.ink }}>
                          ~{emailsFromCredits(proStop.credits, tierConfig.credit_costs.find_contact).toLocaleString()} emails
                        </strong>
                        {' '}/ month · {proStop.credits.toLocaleString()} credits
                      </>
                    )}
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

              {/* Credit slider — Higgsfield-style in-tier dial */}
              <div className="mb-2 -mt-1">
                <CreditSlider
                  stops={proStops}
                  selectedIndex={proStopIdx}
                  onChange={(next) => {
                    if (next !== proStopIdx) {
                      trackSliderDragged({
                        tier: 'pro',
                        credits: proStops[next]?.credits ?? 0,
                        from_index: proStopIdx,
                        to_index: next,
                      });
                    }
                    setProStopIdx(next);
                  }}
                  accentColor="#3B82F6"
                  compact
                />
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 my-6"></div>

              {/* Features */}
              <div className="flex-1 space-y-4">
                <FeatureItem highlight>
                  ~{emailsFromCredits(proStop.credits, tierConfig.credit_costs.find_contact).toLocaleString()} emails / month
                  {' '}<span style={{ color: '#94A3B8', fontWeight: 500 }}>({proStop.credits.toLocaleString()} credits)</span>
                </FeatureItem>
                <FeatureItem>Up to 8 contacts per search</FeatureItem>
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
                {!ctaReady ? (
                  <div className="w-full py-3.5 px-6 rounded-lg font-bold bg-gray-100 text-transparent animate-pulse select-none" aria-hidden="true">
                    &nbsp;
                  </div>
                ) : (
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
                    w-full py-3.5 px-6 rounded-lg font-bold transition-all
                    ${currentTier === 'elite'
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : currentTier === 'pro'
                        ? 'text-white'
                        : 'text-white hover:scale-[1.02] active:scale-100'
                    }
                    disabled:opacity-50
                  `}
                  style={
                    currentTier === 'elite'
                      ? undefined
                      : {
                          background: `linear-gradient(135deg, ${C_FS.brand} 0%, ${C_POP.purple} 60%, ${C_POP.magenta} 100%)`,
                          boxShadow: `0 10px 28px -8px ${C_POP.magenta}55, 0 6px 14px -6px ${C_FS.brand}55`,
                        }
                  }
                >
                  {isLoading ? 'Processing...' : currentTier === 'pro' ? 'Manage Subscription' : currentTier === 'elite' ? 'On Elite Plan' : `Start ${trialDays}-Day Free Trial`}
                </button>
                )}
              </div>
            </div>
          </div>

          {/* Elite Plan Card — translucent so mountains backdrop bleeds through */}
          <div
            className={`relative rounded-[3px] border p-8 flex flex-col h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${currentTier === 'elite' ? 'border-purple-300' : 'border-gray-200 hover:border-gray-300'}`}
            style={{ background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
          >
            {/* Active Badge if current plan */}
            {currentTier === 'elite' && (
              <div className="absolute -top-3 right-6">
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                  ACTIVE
                </span>
              </div>
            )}
            
            {/* Plan Header — gradient italic + % OFF pop badge */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
                <h2
                  style={{
                    fontSize: 30,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    margin: 0,
                    fontFamily: "'Libre Baskerville', Georgia, serif",
                    fontStyle: 'italic',
                    background: `linear-gradient(135deg, ${C_FS.ink} 0%, ${C_POP.purple} 55%, ${C_POP.magentaDeep} 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Elite
                </h2>
                {showStudentPrice && percentOff(eliteListMonthly, eliteMonthlyPrice) > 0 && (
                  <PopBadge tone="magenta" size="md">
                    {percentOff(eliteListMonthly, eliteMonthlyPrice)}% OFF
                  </PopBadge>
                )}
              </div>
              <p className="text-gray-500">For serious recruiting season</p>
            </div>
            
            {/* Price — annual discount applies in BOTH student and list modes */}
            <div className="text-center mb-4">
              {billingCadence === 'annual' ? (
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-lg text-gray-400 line-through" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${eliteMonthlyPrice}
                  </span>
                  <span className="text-4xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${annualMonthlyEquivalent(eliteAnnualPrice).toFixed(2)}
                  </span>
                  <span className="text-gray-500">/mo</span>
                </div>
              ) : showStudentPrice ? (
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-lg text-gray-400 line-through" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${eliteListMonthly}
                  </span>
                  <span className="text-4xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${eliteMonthlyPrice}
                  </span>
                  <span className="text-gray-500">/mo</span>
                </div>
              ) : (
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-4xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${eliteMonthlyPrice}
                  </span>
                  <span className="text-gray-500">/mo</span>
                </div>
              )}
              {/* Stacked discount badges — real numbers only */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                {showStudentPrice && percentOff(eliteListMonthly, eliteMonthlyPrice) > 0 && (
                  <PopBadge tone="inverse-magenta">
                    {percentOff(eliteListMonthly, eliteMonthlyPrice)}% off list
                  </PopBadge>
                )}
                {billingCadence === 'annual' && eliteAnnualSave > 0 && (
                  <PopBadge tone="lime">save ${eliteAnnualSave.toFixed(0)}/yr</PopBadge>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {billingCadence === 'annual'
                  ? `Billed yearly at $${eliteAnnualPrice}`
                  : (
                    <>
                      <strong style={{ color: C_FS.ink }}>
                        ~{emailsFromCredits(eliteStop.credits, tierConfig.credit_costs.find_contact).toLocaleString()} emails
                      </strong>
                      {' '}/ month · {eliteStop.credits.toLocaleString()} credits
                    </>
                  )}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {showStudentPrice && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-semibold text-blue-700">
                    🎓 .edu required
                  </span>
                )}
                {/* No trial chip on Elite — users come into Elite via the
                    post-checkout upsell from Pro, not a separate trial. */}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-semibold text-slate-700">
                  Start anytime · cancel anytime
                </span>
              </div>
            </div>

            {/* Credit slider — Higgsfield-style in-tier dial */}
            <div className="mb-2 -mt-1">
              <CreditSlider
                stops={eliteStops}
                selectedIndex={eliteStopIdx}
                onChange={(next) => {
                  if (next !== eliteStopIdx) {
                    trackSliderDragged({
                      tier: 'elite',
                      credits: eliteStops[next]?.credits ?? 0,
                      from_index: eliteStopIdx,
                      to_index: next,
                    });
                  }
                  setEliteStopIdx(next);
                }}
                accentColor="#0F172A"
                compact
              />
            </div>

              {/* Divider */}
              <div className="border-t border-gray-100 my-6"></div>

              {/* Features */}
              <div className="flex-1 space-y-4">
                <FeatureItem highlight>Run up to 5 Agents simultaneously</FeatureItem>
                <FeatureItem highlight>
                  ~{emailsFromCredits(eliteStop.credits, tierConfig.credit_costs.find_contact).toLocaleString()} emails / month
                  {' '}<span style={{ color: '#94A3B8', fontWeight: 500 }}>({eliteStop.credits.toLocaleString()} credits)</span>
                </FeatureItem>
                <FeatureItem>Up to 15 contacts per search</FeatureItem>
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
              {!ctaReady ? (
                <div className="w-full py-3.5 px-6 rounded-lg font-bold bg-gray-100 text-transparent animate-pulse select-none" aria-hidden="true">
                  &nbsp;
                </div>
              ) : (
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
                  w-full py-3.5 px-6 rounded-lg font-bold transition-all hover:scale-[1.02] active:scale-100
                  ${currentTier === 'elite'
                    ? 'border-2 border-[#E2E8F0] text-[#3B82F6] hover:bg-[#FAFBFF]'
                    : 'text-white'
                  }
                `}
                style={
                  currentTier === 'elite'
                    ? undefined
                    : {
                        background: `linear-gradient(135deg, ${C_FS.ink} 0%, ${C_POP.purple} 55%, ${C_POP.magentaDeep} 100%)`,
                        boxShadow: `0 10px 28px -8px ${C_POP.magentaDeep}55, 0 6px 14px -6px ${C_FS.ink}55`,
                      }
                }
              >
                {isLoading ? 'Processing...' : currentTier === 'elite' ? 'Manage Subscription' : currentTier === 'pro' ? 'Upgrade to Elite' : 'Get Elite'}
              </button>
              )}
            </div>
          </div>
        </div>

        {/* Season Pass — 4-month one-time pre-paid pass. Date-gated visibility:
            shown to all if past `new_users_only_until`, otherwise new users only. */}
        {/* Season Pass is shown to everyone — subscribers and non-subscribers alike.
            Passing isNewUser=true makes it always visible regardless of tier, and
            it no longer depends on subscription state, so there's no flash. */}
        {seasonPassVisible(tierConfig.season_pass, true) && (
          <div
            className="max-w-5xl mx-auto mb-16 animate-fadeInUp"
            style={{ animationDelay: '250ms' }}
          >
            <div
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg, #003262 0%, #1E3A8A 50%, #2563EB 100%)',
                borderRadius: 14,
                padding: '32px 28px',
                color: '#fff',
                overflow: 'hidden',
                boxShadow: '0 12px 36px -10px rgba(0, 50, 98, 0.35)',
              }}
            >
              {/* subtle decorative wash */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -60,
                  right: -60,
                  width: 240,
                  height: 240,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
                  gap: 28,
                  alignItems: 'center',
                  position: 'relative',
                }}
                className="md:grid-cols-[1.4fr_1fr] grid-cols-1"
              >
                <div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(255,255,255,0.15)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      padding: '5px 10px',
                      borderRadius: 999,
                      marginBottom: 14,
                    }}
                  >
                    <Zap size={11} style={{ color: C_POP.lime }} /> Recruiting Season Pass
                  </div>
                  <h3
                    style={{
                      fontFamily: "'Libre Baskerville', Georgia, serif",
                      fontSize: 'clamp(26px, 3.2vw, 34px)',
                      fontWeight: 400,
                      lineHeight: 1.2,
                      margin: '0 0 10px',
                      letterSpacing: '-0.012em',
                      color: '#fff',
                    }}
                  >
                    Four months.{' '}
                    <em
                      style={{
                        background: `linear-gradient(135deg, ${C_POP.lime} 0%, #FDE047 100%)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        fontWeight: 700,
                      }}
                    >
                      One charge.
                    </em>
                  </h3>
                  <p
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 14.5,
                      lineHeight: 1.6,
                      color: 'rgba(255,255,255,0.92)',
                      margin: '0 0 16px',
                      maxWidth: 480,
                    }}
                  >
                    Built for the 16 weeks your school's recruiting calendar actually burns hot.
                    Pro-level access, {tierConfig.season_pass.credits_per_month.toLocaleString()} credits
                    refilled every month, no renewal surprise. Pay once, hit the ground running.
                  </p>
                  <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 12 }}>
                    <span
                      style={{
                        padding: '5px 11px',
                        background: `${C_POP.lime}22`,
                        border: `1px solid ${C_POP.lime}66`,
                        color: '#ECFCCB',
                        borderRadius: 999,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <Clock size={11} style={{ marginRight: 4, color: C_POP.lime }} />
                      4 months, one-time
                    </span>
                    <span
                      style={{
                        padding: '5px 11px',
                        background: 'rgba(255,255,255,0.18)',
                        borderRadius: 999,
                        fontWeight: 700,
                        color: '#fff',
                      }}
                    >
                      No subscription
                    </span>
                    {showStudentPrice && (
                      <span
                        style={{
                          padding: '5px 11px',
                          background: `${C_POP.magenta}22`,
                          border: `1px solid ${C_POP.magenta}66`,
                          borderRadius: 999,
                          fontWeight: 700,
                          color: '#FBCFE8',
                        }}
                      >
                        🎓 .edu price
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: C_POP.lime,
                      marginBottom: 6,
                    }}
                  >
                    Pay once
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'center',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    {showStudentPrice && (
                      <span
                        style={{
                          fontSize: 18,
                          color: '#FBCFE8',
                          textDecoration: 'line-through',
                          textDecorationColor: C_POP.magenta,
                          textDecorationThickness: '2px',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 600,
                        }}
                      >
                        ${tierConfig.season_pass.list}
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: "'Libre Baskerville', Georgia, serif",
                        fontSize: 52,
                        fontWeight: 400,
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums',
                        color: '#fff',
                      }}
                    >
                      ${showStudentPrice ? tierConfig.season_pass.student : tierConfig.season_pass.list}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', marginBottom: 18, fontWeight: 600 }}>
                    {tierConfig.season_pass.months} months · ${(
                      (showStudentPrice ? tierConfig.season_pass.student : tierConfig.season_pass.list) /
                      tierConfig.season_pass.months
                    ).toFixed(2)}/mo equivalent
                  </div>
                  <button
                    type="button"
                    disabled={!seasonPassPriceId}
                    onClick={() => {
                      trackUpgradeClick('season_pass', {
                        from_location: 'pricing_page',
                        plan_selected: 'season_pass',
                      });
                      trackSeasonPassClicked({ audience });
                      // One-time Season Pass checkout (grants season_pass tier
                      // via webhook). Gated on the SKU being wired in Stripe.
                      if (seasonPassPriceId) handleSeasonPassCheckout();
                    }}
                    title={!seasonPassPriceId ? 'Season Pass SKU coming soon in Stripe' : undefined}
                    style={{
                      width: '100%',
                      padding: '13px 18px',
                      background: seasonPassPriceId ? '#fff' : 'rgba(255,255,255,0.4)',
                      color: '#003262',
                      border: 'none',
                      borderRadius: 6,
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: seasonPassPriceId ? 'pointer' : 'not-allowed',
                      transition: 'all 160ms ease',
                      boxShadow: seasonPassPriceId ? '0 8px 18px -6px rgba(0,0,0,0.25)' : 'none',
                    }}
                  >
                    {seasonPassPriceId ? 'Get the Season Pass' : 'Coming soon'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two-pillar guarantee — free trial + money-back, stated plainly */}
        <div className="max-w-3xl mx-auto mb-16 animate-fadeInUp" style={{ animationDelay: '300ms' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {/* Pillar 1 — free trial (Season Pass styling, header only) */}
            <div
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg, #003262 0%, #1E3A8A 50%, #2563EB 100%)',
                borderRadius: 14,
                padding: '22px 22px 20px',
                color: '#fff',
                overflow: 'hidden',
                boxShadow:
                  '0 1px 2px rgba(15,37,69,.04), 0 8px 18px -8px rgba(15,37,69,.20)',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '5px 10px',
                  borderRadius: 999,
                  marginBottom: 14,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                🎓 Free trial
              </div>
              <h3
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: 20,
                  lineHeight: 1.2,
                  color: '#fff',
                  margin: 0,
                  fontWeight: 400,
                }}
              >
                <em
                  style={{
                    background: `linear-gradient(135deg, ${C_POP.lime} 0%, #FDE047 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    fontWeight: 700,
                  }}
                >
                  {trialDays} days free
                </em>{' '}on Pro
              </h3>
            </div>

            {/* Pillar 2 — money-back (Season Pass styling, header only) */}
            <div
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg, #003262 0%, #1E3A8A 50%, #2563EB 100%)',
                borderRadius: 14,
                padding: '22px 22px 20px',
                color: '#fff',
                overflow: 'hidden',
                boxShadow:
                  '0 1px 2px rgba(15,37,69,.04), 0 8px 18px -8px rgba(15,37,69,.20)',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '5px 10px',
                  borderRadius: 999,
                  marginBottom: 14,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <Shield className="w-3 h-3" style={{ color: C_POP.lime }} /> Money-back
              </div>
              <h3
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: 20,
                  lineHeight: 1.2,
                  color: '#fff',
                  margin: 0,
                  fontWeight: 400,
                }}
              >
                <em
                  style={{
                    background: `linear-gradient(135deg, ${C_POP.lime} 0%, #FDE047 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    fontWeight: 700,
                  }}
                >
                  7-day refund
                </em>{' '}on Pro &amp; Elite, 14 days on Season Pass
              </h3>
            </div>
          </div>
        </div>

        {/* Compare every feature — collapsed by default to keep the page tight.
            Click to expand inline. No separate full-bleed section anymore. */}
        <div className="mb-12 animate-fadeInUp" style={{ animationDelay: '400ms' }}>
          <details
            style={{
              maxWidth: 760,
              margin: '0 auto',
              background: '#fff',
              border: `1px solid ${C_FS.cardBorder}`,
              borderRadius: 12,
              boxShadow: '0 1px 2px rgba(15,37,69,.04)',
            }}
          >
            <summary
              style={{
                listStyle: 'none',
                cursor: 'pointer',
                padding: '16px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 700,
                color: C_FS.ink,
                userSelect: 'none',
              }}
              className="hover:bg-slate-50 transition-colors"
            >
              <span>
                <span style={{ color: C_FS.eyebrow, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginRight: 10 }}>
                  Side by side
                </span>
                Compare every feature
              </span>
              <ChevronDown size={16} style={{ color: C_FS.muted, transition: 'transform 160ms ease' }} className="details-chevron" />
            </summary>
            <div style={{ borderTop: `1px solid ${C_FS.cardBorder}`, overflowX: 'auto' }}>
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-6 font-semibold text-gray-900 text-sm">Feature</th>
                    <th className="text-center py-3 px-6 font-semibold text-gray-900 text-sm">Free</th>
                    <th className="text-center py-3 px-6 font-semibold text-[#3B82F6] text-sm">Pro</th>
                    <th className="text-center py-3 px-6 font-semibold text-gray-900 text-sm">Elite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <ComparisonRow
                    feature="Monthly Emails"
                    free={`~${emailsFromCredits(300, tierConfig.credit_costs.find_contact)}`}
                    pro={`~${emailsFromCredits(proStop.credits, tierConfig.credit_costs.find_contact)}`}
                    elite={`~${emailsFromCredits(eliteStop.credits, tierConfig.credit_costs.find_contact)}`}
                  />
                  <ComparisonRow feature="Monthly Credits" free="300" pro={proStop.credits.toLocaleString()} elite={eliteStop.credits.toLocaleString()} />
                  <ComparisonRow feature="Contacts per Search" free="3" pro="8" elite="15" />
                  <ComparisonRow feature="Concurrent Agents" free=" - " pro="1" elite="Up to 5" />
                  <ComparisonRow feature="Find Companies" free={false} pro={true} elite={true} />
                  <ComparisonRow feature="Find Hiring Managers" free={false} pro={true} elite={true} />
                  <ComparisonRow feature="Email Outreach Tracking" free={true} pro={true} elite={true} />
                  <ComparisonRow feature="Gmail Integration" free={true} pro={true} elite={true} />
                  <ComparisonRow feature="Custom Email Templates" free={true} pro={true} elite={true} />
                  <ComparisonRow
                    feature="AI Email Drafts"
                    free={tierConfig.free_drafts_per_month > 0 ? `${tierConfig.free_drafts_per_month}/mo` : "Within credits"}
                    pro="Unlimited"
                    elite="Unlimited"
                  />
                  <ComparisonRow feature="Export to CSV" free={false} pro={true} elite={true} />
                  <ComparisonRow feature="Bulk Drafting" free={false} pro={true} elite={true} />
                  <ComparisonRow feature="Firm Search" free={false} pro={true} elite={true} />
                  <ComparisonRow feature="Top-Up Credit Packs" free={false} pro={true} elite={true} />
                  <ComparisonRow feature="Priority Queue + Support" free={false} pro={false} elite={true} />
                  <ComparisonRow feature={`${trialDays}-Day Free Trial`} free={false} pro={true} elite={false} />
                </tbody>
              </table>
            </div>
          </details>
          {/* Native open-state chevron rotation */}
          <style>{`
            details[open] .details-chevron { transform: rotate(180deg); }
          `}</style>
        </div>

        {/* Top-Up Packs — Pro/Elite subscriber perk. Free users see a locked
            state with an "Upgrade to unlock" CTA — keeps the paywall meaningful. */}
        <div className="mb-16 animate-fadeInUp" style={{ animationDelay: '450ms' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 28px' }}>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: C_FS.eyebrow,
                textTransform: 'uppercase',
                margin: '0 0 12px',
              }}
            >
              Credit packs · Pro &amp; Elite perk
            </p>
            <h2
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(26px, 3.5vw, 36px)',
                fontWeight: 400,
                lineHeight: 1.15,
                color: C_FS.ink,
                letterSpacing: '-0.012em',
                margin: 0,
              }}
            >
              Need more credits? <Hl>Top up anytime.</Hl>
            </h2>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                color: C_FS.body,
                marginTop: 12,
                maxWidth: 540,
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: 1.6,
              }}
            >
              {hasActiveSubscription ? (
                <>
                  One-time top-up packs, available to Pro &amp; Elite subscribers. Credits you buy{' '}
                  <strong style={{ color: C_FS.ink }}>never expire.</strong>
                </>
              ) : (
                <>
                  Credit packs are a perk for Pro &amp; Elite subscribers. Start a Pro trial to
                  unlock — and yes,{' '}
                  <strong style={{ color: C_FS.ink }}>purchased credits never expire.</strong>
                </>
              )}
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
              maxWidth: 760,
              margin: '0 auto',
              // Top padding so the "★ Best value" badge (top: -10 on its card)
              // sits inside the grid's box and isn't clipped by the page root's
              // overflow:hidden.
              paddingTop: 14,
            }}
          >
            {tierConfig.topup_packs.map((pack) => {
              const locked = !hasActiveSubscription;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => {
                    if (locked) {
                      // Scroll back to the pricing cards so the user can start a Pro trial.
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                      setTopUpModalOpen(true);
                    }
                  }}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    background: '#fff',
                    border: `1.5px solid ${pack.recommended && !locked ? C_FS.brand : C_FS.cardBorder}`,
                    borderRadius: 12,
                    padding: '20px 18px 18px',
                    cursor: 'pointer',
                    transition: 'all 180ms ease',
                    opacity: locked ? 0.72 : 1,
                    boxShadow: pack.recommended && !locked
                      ? `0 6px 18px -6px ${C_FS.brand}33`
                      : '0 1px 2px rgba(15,37,69,.04)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = pack.recommended && !locked
                      ? `0 10px 24px -8px ${C_FS.brand}44`
                      : '0 6px 18px -8px rgba(15,37,69,.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = pack.recommended && !locked
                      ? `0 6px 18px -6px ${C_FS.brand}33`
                      : '0 1px 2px rgba(15,37,69,.04)';
                  }}
                >
                  {pack.recommended && !locked && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -10,
                        right: 14,
                        background: C_FS.brand,
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: 999,
                      }}
                    >
                      ★ Best value
                    </span>
                  )}
                  <div
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      color: C_FS.muted,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    {pack.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Libre Baskerville', Georgia, serif",
                      fontSize: 28,
                      fontWeight: 400,
                      color: C_FS.ink,
                      lineHeight: 1,
                      letterSpacing: '-0.012em',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {pack.credits.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: C_FS.muted, marginTop: 2, marginBottom: 12 }}>
                    credits
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      borderTop: `1px solid ${C_FS.cardBorder}`,
                      paddingTop: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 18,
                        fontWeight: 700,
                        color: C_FS.ink,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      ${pack.price}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11,
                        color: locked ? C_FS.brand : C_FS.muted,
                        fontWeight: locked ? 700 : 500,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {locked ? '🔒 Upgrade' : (<><Plus size={11} /> Add</>)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mb-16 animate-fadeInUp" style={{ animationDelay: '500ms' }}>
          <div style={{ marginBottom: 28 }}>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: C_FS.eyebrow,
                textTransform: 'uppercase',
                margin: '0 0 10px',
              }}
            >
              FAQ
            </p>
            <h2
              style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: 'clamp(26px, 3.5vw, 36px)',
                fontWeight: 400,
                lineHeight: 1.15,
                color: C_FS.ink,
                letterSpacing: '-0.012em',
                margin: 0,
              }}
            >
              Things students <Hl>ask us</Hl>
            </h2>
          </div>
          
          <div>
            <FAQItem
              question="How does the free trial work?"
              answer={`You get ${trialDays} days of Pro access with 600 credits to spend — no credit card required. Use them on contact searches, firm search, hiring-manager lookups, and drafts. You can cancel anytime, and at the end of the window you drop to the Free plan automatically (no surprise charges). The trial is for Pro only; Elite users sign up directly or come in via the one-time upgrade offer right after checkout.`}
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
              answer="Annual saves ~20% - more than two months free. If you're committed to recruiting for the year, annual is the better deal whether or not you have a .edu email. If you're testing it out, start monthly and switch later."
            />
            <FAQItem
              question="Do credits roll over?"
              answer="Nope, they reset on the 1st of each month. Use 'em or lose 'em - but honestly, most students use them up well before the month is over during peak recruiting."
            />
            <FAQItem
              question="What if I don't have a .edu email?"
              answer={`You can still sign up and use Offerloop - you'll just get the standard ${trialDays}-day Pro trial and pay the public list price. Already a paid alumni? Reach out and we'll verify your old school manually.`}
            />
            <FAQItem
              question="How do I cancel?"
              answer="Cancel anytime from your subscription page. You keep access until the end of your billing period - no tricks."
            />
            <FAQItem
              question="What's your refund policy?"
              answer="Pro and Elite are refundable for 7 days from your first charge — whether monthly or annual. The Recruiting Season Pass has a 14-day window, provided you haven't used more than half of your month-1 credits. Top-up credit packs are non-refundable (your credits never expire, so there's no reason they should). Email support@offerloop.ai or request a refund from your account settings — we typically respond in 24 hours."
            />
          </div>
        </div>

        {/* Footer Note */}
        <div className="max-w-3xl text-sm text-gray-500 pb-8 animate-fadeInUp" style={{ animationDelay: '600ms' }}>
          <p>Still unsure? <button onClick={() => window.open('mailto:support@offerloop.ai', '_blank')} className="text-[#3B82F6] hover:underline font-medium">Talk to us</button></p>
        </div>

      </div>

      {/* Top-Up Modal — one-time credit-pack purchase. Wired to /api/billing/
          create-topup-session in Wave 1 backend; cofounders enable Stripe SKUs. */}
      <TopUpModal
        open={topUpModalOpen}
        onClose={() => setTopUpModalOpen(false)}
        fromFeature="pricing_page"
        onPurchase={async (pack, priceId) => {
          if (!user) {
            navigate('/signin?next=/pricing');
            return;
          }
          if (!priceId) {
            // Cofounders haven't wired this top-up SKU in Stripe yet.
            alert(`The ${pack.label} pack will be available shortly.`);
            return;
          }
          try {
            const auth = getAuth();
            const fbUser = auth.currentUser;
            if (!fbUser) throw new Error('No Firebase user');
            const token = await fbUser.getIdToken();
            const res = await fetch(`${BACKEND_URL}/api/billing/create-topup-session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                packId: pack.id,
                priceId,
                successUrl: `${window.location.origin}/payment-success?topup=${pack.id}`,
                cancelUrl: `${window.location.origin}/pricing`,
              }),
            });
            if (!res.ok) throw new Error(`Top-up checkout failed: ${res.status}`);
            const { sessionId } = await res.json();
            const stripe = await stripePromise;
            if (!stripe) throw new Error('Stripe not initialized');
            await stripe.redirectToCheckout({ sessionId });
          } catch (err) {
            console.error('Top-up error:', err);
            alert(err instanceof Error ? err.message : 'Top-up failed');
          }
        }}
      />
    </div>
  );
};

export default Pricing;
