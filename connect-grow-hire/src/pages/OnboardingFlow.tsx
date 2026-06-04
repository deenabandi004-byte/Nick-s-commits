import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { ArrowLeft } from "lucide-react";
import { OnboardingProfileBasics, type ProfileBasicsData } from "./OnboardingProfileBasics";
import { OnboardingSource, type SourceResult } from "./OnboardingSource";
import { OnboardingManualEntry, type ManualEntryData } from "./OnboardingManualEntry";
import { OnboardingIntent, type IntentData } from "./OnboardingIntent";
import { OnboardingTrack, type TrackData } from "./OnboardingTrack";
import { OnboardingTrial } from "./OnboardingTrial";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { BACKEND_URL } from "@/services/api";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { careerTrackByLabel } from "@/utils/careerTrackMapping";
import { EMPTY_PREFILL } from "@/utils/onboardingPrefill";
import OfferloopLogo from "@/assets/offerloop_logo2.png";

// Mirrors Pricing.tsx — checkout adds the 30-day trial server-side.
const STRIPE_PUBLISHABLE_KEY =
  "pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB";
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const BLUE = "#1E3A8A";

type Step = "profile" | "source" | "manual" | "intent" | "track" | "trial";
// Segments shown in the progress bar (5 — "manual" is a sub-step of "source").
const STEP_ORDER: Step[] = ["profile", "source", "intent", "track", "trial"];
// Progress index per step; "manual" shares the source phase so the bar stays 5-wide.
const STEP_INDEX: Record<Step, number> = { profile: 0, source: 1, manual: 1, intent: 2, track: 3, trial: 4 };

interface OnboardingFlowProps {
  onComplete: (data: unknown) => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { completeOnboarding, refreshUser, user } = useFirebaseAuth();

  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sp.get("returnTo") || "", [sp]);

  const [currentStep, setCurrentStep] = useState<Step>("profile");
  const [submitting, setSubmitting] = useState(false);

  const [profileBasics, setProfileBasics] = useState<ProfileBasicsData | null>(null);
  const [source, setSource] = useState<SourceResult | null>(null);
  const [manualAcademics, setManualAcademics] = useState<ManualEntryData | null>(null);
  const [intent, setIntent] = useState("");
  const [track, setTrack] = useState<TrackData | null>(null);

  // Onboarding analytics: fire-and-forget step events.
  const loggedSteps = useRef<Set<string>>(new Set());
  const logOnboardingEvent = (event: "viewed" | "completed", step: string, skipped = false) => {
    auth.currentUser
      ?.getIdToken()
      .then((token) => {
        fetch(`${BACKEND_URL}/api/users/onboarding-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event, step, skipped }),
        }).catch(() => {});
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!loggedSteps.current.has(currentStep)) {
      loggedSteps.current.add(currentStep);
      logOnboardingEvent("viewed", currentStep);
    }
  }, [currentStep]);

  // ── Step handlers ─────────────────────────────────────────────────────────
  const handleProfile = (data: ProfileBasicsData) => {
    setProfileBasics(data);
    logOnboardingEvent("completed", "profile");
    setCurrentStep("source");
  };
  const handleSource = (data: SourceResult) => {
    setSource(data);
    logOnboardingEvent("completed", "source", data.entryPath === "manual");
    // Manual choice opens a form to type the academics the parse would provide.
    setCurrentStep(data.entryPath === "manual" ? "manual" : "intent");
  };
  const handleManualEntry = (data: ManualEntryData) => {
    setManualAcademics(data);
    logOnboardingEvent("completed", "manual");
    setCurrentStep("intent");
  };
  const handleIntent = (data: IntentData) => {
    setIntent(data.intent);
    logOnboardingEvent("completed", "intent", !data.intent);
    setCurrentStep("track");
  };
  const handleTrack = (data: TrackData) => {
    setTrack(data);
    logOnboardingEvent("completed", "track");
    setCurrentStep("trial");
  };

  const handleBack = () => {
    if (currentStep === "profile") navigate("/"); // first step → landing page
    else if (currentStep === "source") setCurrentStep("profile");
    else if (currentStep === "manual") setCurrentStep("source");
    // intent's previous screen depends on whether the user went manual.
    else if (currentStep === "intent") setCurrentStep(source?.entryPath === "manual" ? "manual" : "source");
    else if (currentStep === "track") setCurrentStep("intent");
    else if (currentStep === "trial") setCurrentStep("track");
  };

  // ── Final Firestore write (approved write-map paths) ───────────────────────
  const buildFinalData = (profile: ProfileBasicsData, src: SourceResult | null, intentValue: string, trk: TrackData) => {
    const nameParts = profile.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    // Academics: typed manual entry on the manual path, else the résumé/LinkedIn resolve.
    const academics =
      src?.entryPath === "manual" && manualAcademics
        ? { university: manualAcademics.university, major: manualAcademics.major, graduationYear: manualAcademics.graduationYear }
        : src?.resolved || EMPTY_PREFILL;
    const manualDegree = src?.entryPath === "manual" ? manualAcademics?.degree || "" : "";
    const trackOpt = careerTrackByLabel(trk.careerTrackLabel);
    const trackValue = trackOpt?.value || trk.careerTrackLabel;
    const industries = trackOpt?.targetIndustries || [];
    const hasCompanies = trk.dreamCompanies.length > 0;
    const hasJobTypes = trk.jobTypes.length > 0;

    return {
      profile: {
        fullName: profile.fullName,
        firstName,
        lastName,
        email: profile.email,
        phone: profile.phone,
        linkedinUrl: src?.linkedinUrl || "",
      },
      university: academics.university,
      academics: {
        university: academics.university,
        college: academics.university,
        degree: manualDegree,
        major: academics.major,
        graduationYear: academics.graduationYear,
      },
      careerTrack: trackValue,
      targetIndustries: industries,
      goals: {
        careerTrack: trackValue,
        targetIndustries: industries,
        ...(hasCompanies ? { dreamCompanies: trk.dreamCompanies } : {}),
      },
      ...(hasCompanies ? { dreamCompanies: trk.dreamCompanies, targetFirms: trk.dreamCompanies } : {}),
      // jobTypes: top-level (RecommendedJobs) + location.jobTypes (job_board)
      ...(hasJobTypes ? { jobTypes: trk.jobTypes, location: { jobTypes: trk.jobTypes } } : {}),
      ...(intentValue ? { onboardingIntent: intentValue } : {}),
      onboarding: { completedAt: new Date().toISOString() },
    };
  };

  const persistOnboarding = async () => {
    if (!profileBasics || !track) throw new Error("Missing onboarding data");
    const finalData = buildFinalData(profileBasics, source, intent, track);
    logOnboardingEvent("completed", "trial");
    await completeOnboarding(finalData);
    sessionStorage.setItem("onboarding_just_completed", "true");
    await new Promise((r) => setTimeout(r, 300));
    await refreshUser();
    try {
      onComplete(finalData);
    } catch (e) {
      console.error("Analytics error:", e);
    }
    return finalData;
  };

  const resolveDestination = () => {
    let dest = "/home";
    if (returnTo) {
      try {
        let decoded = returnTo;
        while (decoded !== decodeURIComponent(decoded)) decoded = decodeURIComponent(decoded);
        if (!decoded.includes("/onboarding") && !decoded.includes("/signin")) dest = decoded;
      } catch {
        /* ignore decode errors */
      }
    }
    return dest;
  };

  const handleContinueFree = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await persistOnboarding();
      navigate(resolveDestination(), { replace: true });
    } catch (e) {
      console.error("Onboarding failed:", e);
      toast.error("Failed to finish onboarding. Please try again.");
      setSubmitting(false);
    }
  };

  const handleStartTrial = async (priceId: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await persistOnboarding();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          priceId,
          userId: user?.uid,
          userEmail: user?.email,
          successUrl: `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/home`,
        }),
      });
      const data = await res.json();
      const stripe = await stripePromise;
      if (res.ok && data.sessionId && stripe) {
        await stripe.redirectToCheckout({ sessionId: data.sessionId });
        return;
      }
      toast.error("Couldn't start checkout — you're on the free plan for now.");
      navigate(resolveDestination(), { replace: true });
    } catch (e) {
      console.error("Trial checkout failed:", e);
      toast.error("Couldn't start checkout — you're on the free plan for now.");
      navigate(resolveDestination(), { replace: true });
    }
  };

  const currentIndex = STEP_INDEX[currentStep];

  return (
    <div className="min-h-screen bg-background">
      {/* Progress bar — sticky at the very top, stays put while scrolling */}
      <div className="sticky top-0 z-50 bg-background px-4 pt-3 pb-3">
        <div className="flex gap-1.5">
          {STEP_ORDER.map((s, i) => (
            <div
              key={s}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ background: i <= currentIndex ? BLUE : "#E2E8F0" }}
            />
          ))}
        </div>
      </div>

      <div className="container mx-auto px-4 pb-12 max-w-xl">
        {/* Back — lowered, dark + bold so it's clearly visible */}
        <div className="mt-4 mb-1">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#0F172A] hover:text-[#1E3A8A] transition-colors"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>

        {/* Logo — big, with the PNG's transparent padding cropped via negative margins */}
        <div className="text-center" style={{ marginTop: -16, marginBottom: -36 }}>
          <img src={OfferloopLogo} alt="Offerloop" className="h-48 mx-auto" />
        </div>

        {/* Steps */}
        <div>
          {currentStep === "profile" && (
            <OnboardingProfileBasics
              onNext={handleProfile}
              // Prefill from the Google-authenticated user (sign-in happens on /signin).
              initial={profileBasics || { fullName: user?.name || "", email: user?.email || "" }}
            />
          )}
          {currentStep === "source" && (
            <OnboardingSource onNext={handleSource} initialLinkedinUrl={source?.linkedinUrl} />
          )}
          {currentStep === "manual" && (
            <OnboardingManualEntry onNext={handleManualEntry} initial={manualAcademics || undefined} />
          )}
          {currentStep === "intent" && <OnboardingIntent onNext={handleIntent} initial={intent} />}
          {currentStep === "track" && (
            <OnboardingTrack onNext={handleTrack} initial={track || undefined} />
          )}
          {currentStep === "trial" && (
            <OnboardingTrial
              onStartTrial={handleStartTrial}
              onContinueFree={handleContinueFree}
              submitting={submitting}
            />
          )}
        </div>
      </div>
    </div>
  );
};
