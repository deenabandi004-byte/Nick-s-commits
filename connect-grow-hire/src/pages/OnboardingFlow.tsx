import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { ArrowLeft, Check } from "lucide-react";
import { OnboardingProfileBasics, type ProfileBasicsData } from "./OnboardingProfileBasics";
import { OnboardingSource, type SourceResult } from "./OnboardingSource";
import { OnboardingManualEntry, type ManualEntryData } from "./OnboardingManualEntry";
import { OnboardingIntent, type IntentData } from "./OnboardingIntent";
import { OnboardingTrial } from "./OnboardingTrial";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { BACKEND_URL } from "@/services/api";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { EMPTY_PREFILL } from "@/utils/onboardingPrefill";
import ScoutYeti from "@/assets/scout-wave-removebg-preview.png";
// Hand-drawn circled step numbers (sliced from the design reference, bg removed).
import StepNum1 from "@/assets/step-num-1.png";
import StepNum2 from "@/assets/step-num-2.png";
import StepNum3 from "@/assets/step-num-3.png";
import StepNum4 from "@/assets/step-num-4.png";

const STEP_NUM_IMAGES = [StepNum1, StepNum2, StepNum3, StepNum4];
// All-white monochrome variant of offerloop_logo2.png (padding trimmed) — the
// standard dark-surface lockup, legible directly on the navy rail.
import OfferloopLogo from "@/assets/offerloop_logo2_allwhite.png";
import { OB } from "./onboardingTheme";
import { trackFeatureActionCompleted } from "@/lib/analytics";

// Mirrors Pricing.tsx; checkout adds the trial server-side (audience-aware length).
const STRIPE_PUBLISHABLE_KEY =
  "pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB";
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

type Step = "profile" | "source" | "manual" | "intent" | "trial";
// Progress index per step; "manual" shares the source phase so the rail stays 4-wide.
const STEP_INDEX: Record<Step, number> = { profile: 0, source: 1, manual: 1, intent: 2, trial: 3 };

// Slate Split rail: four tracked phases ("manual" renders as phase 2).
// Career tracks was cut from onboarding — tracks are added later from settings.
const RAIL_STEPS: { label: string; optional?: boolean }[] = [
  { label: "Your profile" },
  { label: "Resume & LinkedIn" },
  { label: "How you found us" },
  { label: "Your plan" },
];

interface OnboardingFlowProps {
  onComplete: (data: unknown) => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { completeOnboarding, refreshUser, user, signOut } = useFirebaseAuth();

  const sp = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = useMemo(() => sp.get("returnTo") || "", [sp]);

  const [currentStep, setCurrentStep] = useState<Step>("profile");
  const [submitting, setSubmitting] = useState(false);

  const [profileBasics, setProfileBasics] = useState<ProfileBasicsData | null>(null);
  // A .edu the user may add on the trial step purely to unlock student pricing —
  // kept SEPARATE from their primary email so we never clobber what they signed
  // up with. Drives the student discount + a school-email outreach signal.
  const [eduEmail, setEduEmail] = useState("");
  const [source, setSource] = useState<SourceResult | null>(null);
  const [manualAcademics, setManualAcademics] = useState<ManualEntryData | null>(null);
  // Acquisition source ("How did you hear about us?") — stored as referralSource.
  const [intent, setIntent] = useState("");

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
    setCurrentStep("trial");
  };

  const handleBack = async () => {
    // Backing out of the first step abandons the session entirely: sign out so
    // the next "Sign in" starts fresh at Google instead of resuming this
    // half-onboarded account. ?signedOut=true stops PublicRoute from bouncing
    // back to /onboarding while auth state clears.
    if (currentStep === "profile") {
      await signOut();
      navigate("/?signedOut=true", { replace: true });
    }
    else if (currentStep === "source") setCurrentStep("profile");
    else if (currentStep === "manual") setCurrentStep("source");
    // intent's previous screen depends on whether the user went manual.
    else if (currentStep === "intent") setCurrentStep(source?.entryPath === "manual" ? "manual" : "source");
    else if (currentStep === "trial") setCurrentStep("intent");
  };

  // ── Final Firestore write (approved write-map paths) ───────────────────────
  const buildFinalData = (profile: ProfileBasicsData, src: SourceResult | null, intentValue: string) => {
    const nameParts = profile.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
    // Academics: typed manual entry on the manual path, else the résumé/LinkedIn resolve.
    const academics =
      src?.entryPath === "manual" && manualAcademics
        ? { university: manualAcademics.university, major: manualAcademics.major, graduationYear: manualAcademics.graduationYear }
        : src?.resolved || EMPTY_PREFILL;
    const manualDegree = src?.entryPath === "manual" ? manualAcademics?.degree || "" : "";
    // A .edu unlocks student pricing (Pricing.tsx reads `isStudent`) and is a
    // stronger outreach signal. It can come from the primary email (auto-detected
    // — e.g. the Google account itself is .edu) OR a .edu the user added on the
    // profile step — the latter is stored separately so it never replaces their
    // primary/sign-up email. Server re-validates audience at checkout.
    const primaryIsEdu = profile.email.toLowerCase().trim().endsWith(".edu");
    const addedEdu = eduEmail.toLowerCase().trim();
    const eduAddress = primaryIsEdu ? profile.email.trim() : addedEdu.endsWith(".edu") ? eduEmail.trim() : "";
    const isStudent = !!eduAddress;

    // Career tracks were removed from onboarding (added later from settings) —
    // write the same empty shape the old "skipped" path produced so downstream
    // readers (profile page, Find recs, job board) see a consistent schema.
    return {
      isStudent,
      ...(eduAddress ? { eduEmail: eduAddress } : {}),
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
      careerTrack: "",
      careerTracks: [],
      careerTrackLabels: [],
      targetIndustries: [],
      goals: { careerTrack: "", careerTracks: [], targetIndustries: [] },
      // Acquisition source ("How did you hear about us?") — feeds marketing attribution.
      ...(intentValue ? { referralSource: intentValue } : {}),
      onboarding: { completedAt: new Date().toISOString() },
    };
  };

  const persistOnboarding = async () => {
    if (!profileBasics) throw new Error("Missing onboarding data");
    const finalData = buildFinalData(profileBasics, source, intent);
    logOnboardingEvent("completed", "trial");
    // Set BEFORE completeOnboarding: that call flips needsOnboarding in the
    // auth context, which is the moment TourContext runs its auto-start
    // check and reads this flag to treat the account as a fresh signup.
    sessionStorage.setItem("onboarding_just_completed", "true");
    await completeOnboarding(finalData);
    await new Promise((r) => setTimeout(r, 300));
    await refreshUser();
    trackFeatureActionCompleted('onboarding', 'complete', true);
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

  const handleStartTrial = async (tier: 'pro' | 'elite', priceId: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await persistOnboarding();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      // Pro trials run on the no-card Path A. Elite has no standalone trial
      // (the pricing page declares Elite trial = no), so it goes straight to
      // direct paid checkout. A Pro user who already used their trial returns
      // 409 here and falls through to checkout too.
      if (tier === 'pro') {
        const trialRes = await fetch(`${BACKEND_URL}/api/users/start-trial`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({}),
        });
        if (trialRes.ok) {
          toast.success("Your Pro trial is active. 600 credits to spend, no card.");
          navigate(resolveDestination(), { replace: true });
          return;
        }
        // Trial refused (already used it, or already on a paid plan). Tell the
        // user why instead of silently bouncing them to a Stripe checkout.
        const reason = (await trialRes.json().catch(() => ({})))?.error;
        if (reason === "already_subscribed") {
          toast.info("You're already on a paid plan. Taking you in.");
          navigate(resolveDestination(), { replace: true });
          return;
        }
        if (reason === "trial_already_used") {
          toast.info("You've already used your free trial. Opening checkout to subscribe.");
        }
      }

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
      toast.error("Couldn't start checkout. You're on the free plan for now.");
      navigate(resolveDestination(), { replace: true });
    } catch (e) {
      console.error("Trial checkout failed:", e);
      toast.error("Couldn't start checkout. You're on the free plan for now.");
      navigate(resolveDestination(), { replace: true });
    }
  };

  const currentIndex = STEP_INDEX[currentStep];
  const isStudent =
    !!profileBasics?.email?.toLowerCase().trim().endsWith(".edu") ||
    eduEmail.toLowerCase().trim().endsWith(".edu");

  // Per-step right-pane header + rail footer (mascot on 1 & 3, hint card elsewhere).
  const em = (text: string) => (
    <em style={{ fontStyle: "italic", color: OB.primary }}>{text}</em>
  );
  const STEP_META: Record<
    Step,
    { headline: React.ReactNode; sub: string; footer: { mascot?: number; hint?: React.ReactNode } }
  > = {
    profile: {
      headline: <>Welcome to {em("Offerloop")}</>,
      sub: "Let's start your profile. Just a few quick details.",
      footer: { mascot: 150 },
    },
    source: {
      headline: <>Add your resume {em("& LinkedIn")}</>,
      sub: "We'll prefill everything from these. No typing required.",
      footer: {
        hint: (
          <>
            Most people add a resume here. It helps us surface recommended jobs and people to
            talk to, and makes your emails far more personalized by connecting real similarities
            between you and each contact. You'll also need one for auto-apply.
          </>
        ),
      },
    },
    manual: {
      headline: <>Enter your {em("details")}</>,
      sub: "Fill these in so we can personalize your contacts, emails, and job feed.",
      footer: {
        hint: (
          <>
            Most people add a resume here. It helps us surface recommended jobs and people to
            talk to, and makes your emails far more personalized by connecting real similarities
            between you and each contact. You'll also need one for auto-apply.
          </>
        ),
      },
    },
    intent: {
      headline: <>How did you {em("hear")} about us?</>,
      sub: "",
      footer: { mascot: 140 },
    },
    trial: {
      headline: <>Start using {em("Offerloop")}</>,
      sub: "Try Pro free. No credit card.",
      footer: {
        hint: isStudent ? (
          <>
            <strong style={{ color: "#fff" }}>Student?</strong> Your .edu discount from step 1 is
            already applied below.
          </>
        ) : (
          <>Try Pro free, cancel anytime. You can change plans whenever.</>
        ),
      },
    },
  };
  const meta = STEP_META[currentStep];
  const panePad = "clamp(24px, 5vw, 48px)";

  return (
    // Full-page Slate Split: the rail and pane fill the whole viewport (no card container).
    <div
      className="min-h-screen flex"
      style={{ background: "#fff", fontFamily: OB.fontBody }}
    >
      <style>{`
        @keyframes obPaneIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .ob-pane-anim { animation: obPaneIn .35s cubic-bezier(0.16,1,0.3,1); }
        @media (prefers-reduced-motion: reduce) { .ob-pane-anim { animation: none; } }
      `}</style>
        {/* ── Left rail ─────────────────────────────────────────────────── */}
        <div
          className="hidden md:flex"
          style={{
            width: 308,
            flexShrink: 0,
            background: OB.railGradient,
            color: "#fff",
            padding: "32px 28px",
            flexDirection: "column",
          }}
        >
          <img
            src={OfferloopLogo}
            alt="Offerloop"
            style={{ height: 38, display: "block", alignSelf: "flex-start", marginBottom: 36 }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
            {RAIL_STEPS.map((s, i) => {
              const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
              return (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    opacity: state === "done" ? 0.6 : state === "upcoming" ? 0.5 : 1,
                  }}
                >
                  {state === "done" ? (
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        background: "rgba(123,143,201,.25)",
                        color: OB.railPeriwinkle,
                      }}
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                  ) : (
                    <img
                      src={STEP_NUM_IMAGES[i]}
                      alt={`Step ${i + 1}`}
                      style={{ width: 28, height: 27, flexShrink: 0, display: "block" }}
                    />
                  )}
                  <span style={{ fontSize: 14, fontWeight: state === "current" ? 600 : 400 }}>
                    {s.label}
                    {s.optional && (
                      <span style={{ fontWeight: 400, color: OB.railPeriwinkle }}> · optional</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rail footer: mascot (steps 1 & 3) or hint card */}
          {meta.footer.mascot ? (
            <img
              src={ScoutYeti}
              alt="Scout"
              style={{
                alignSelf: "center",
                marginTop: 20,
                width: meta.footer.mascot + 105,
                display: "block",
                filter: "drop-shadow(0 6px 18px rgba(0,0,0,.3))",
              }}
            />
          ) : (
            <div
              style={{
                background: "rgba(255,255,255,.06)",
                borderRadius: 12,
                padding: "16px 18px",
                fontSize: 14.5,
                lineHeight: 1.55,
                fontWeight: 600,
                color: "#fff",
              }}
            >
              {meta.footer.hint}
            </div>
          )}
        </div>

        {/* ── Right pane ────────────────────────────────────────────────── */}
        <div
          key={currentStep}
          className="ob-pane-anim"
          style={{
            flex: 1,
            minWidth: 0,
            background: "#fff",
            padding: panePad,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            style={{
              position: "absolute",
              top: 24,
              left: panePad,
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: OB.ink3,
              fontWeight: 600,
              fontSize: 14,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: OB.fontBody,
            }}
          >
            <ArrowLeft size={17} strokeWidth={1.8} /> Back
          </button>

          {/* Mobile progress (rail hidden below md) */}
          {/* display comes from Tailwind (flex + md:hidden) — an inline display would override the md:hidden breakpoint */}
          <div className="flex md:hidden" style={{ position: "absolute", top: 28, right: panePad, gap: 5 }}>
            {RAIL_STEPS.map((s, i) => (
              <span
                key={s.label}
                style={{
                  width: 18,
                  height: 4,
                  borderRadius: 99,
                  background: i <= currentIndex ? OB.primary : OB.primary100,
                }}
              />
            ))}
          </div>

          {/* Readable column centered in the full-width pane */}
          <div style={{ paddingTop: 40, width: "100%", maxWidth: 560, margin: "0 auto" }}>
            <div
              style={{
                color: OB.ink4,
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: ".02em",
                marginBottom: 10,
              }}
            >
              STEP {currentIndex + 1} OF {RAIL_STEPS.length}
            </div>

            <h2
              style={{
                fontFamily: OB.fontDisplay,
                fontWeight: 600,
                fontSize: "clamp(24px, 3.2vw, 30px)",
                letterSpacing: "-0.02em",
                color: OB.heading,
                margin: "0 0 8px",
              }}
            >
              {meta.headline}
            </h2>
            {meta.sub ? (
              <p style={{ fontSize: 15, color: OB.ink2, margin: "0 0 24px", lineHeight: 1.65 }}>
                {meta.sub}
              </p>
            ) : (
              <div style={{ height: 24 }} />
            )}

            {currentStep === "profile" && (
              <OnboardingProfileBasics
                onNext={handleProfile}
                // Prefill from the Google-authenticated user (sign-in happens on /signin).
                initial={profileBasics || { fullName: user?.name || "", email: user?.email || "" }}
                initialEduEmail={eduEmail}
                onEduEmail={(edu) => setEduEmail(edu)}
              />
            )}
            {currentStep === "source" && (
              <OnboardingSource onNext={handleSource} initialLinkedinUrl={source?.linkedinUrl} />
            )}
            {currentStep === "manual" && (
              <OnboardingManualEntry onNext={handleManualEntry} initial={manualAcademics || undefined} />
            )}
            {currentStep === "intent" && <OnboardingIntent onNext={handleIntent} initial={intent} />}
            {currentStep === "trial" && (
              <OnboardingTrial
                onStartTrial={handleStartTrial}
                onContinueFree={handleContinueFree}
                submitting={submitting}
                isStudent={isStudent}
              />
            )}
          </div>
        </div>
    </div>
  );
};
