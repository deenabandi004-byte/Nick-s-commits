// First-time empty state for /agent (no Loops yet).
//
// Direct port of the Loops-redesign handoff "Screen 1 · First-time empty
// state" (see Loop Onboarding Screens.html in the design bundle). Warm
// Scout greeter, resume-derived suggestion the student can launch in one
// click, plus a "Tweak first" path and 2x2 starter templates.

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useProposedBrief } from "@/hooks/useProposedBrief";
import { firebaseApi } from "@/services/firebaseApi";
import ScoutYetiFull from "@/assets/scouts/scout-yeti-full.png";
import MountainsLake from "@/assets/for-students/mountains-lake.png";
import { getCompanyLogo } from "@/lib/companyLogos";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Slate-blue brand palette pulled straight from the design's
// colors_and_type.css so the surface reads identically to the prototype.
const C = {
  paper2: "#F5F6F8",
  border: "#E5E7EC",
  borderLight: "#EFF0F3",
  ink: "#0A0A0A",
  ink2: "#475569",
  ink3: "#64748B",
  ink4: "#94A3B8",
  heading: "#1E2D4D",
  primary: "#4A60A8",
  primaryDark: "#3C4F8E",
  primary50: "#EEF1F9",
  primary100: "#E4E9F5",
  primary200: "#B6C3E8",
  shadowSm: "0 1px 2px rgba(26,26,26,0.05)",
  shadowMd: "0 4px 16px rgba(26,26,26,0.06)",
  shadowBlue: "0 2px 8px rgba(74,96,168,0.20)",
};

// Color chip for a single company in the CoStack — initial in a tinted
// rounded square. The tint map matches the design's loop-shared.jsx so
// company colors stay consistent with the rest of the Loops surface.
const COMPANY_TINTS: Record<string, string> = {
  Google: "#4285F4",
  Meta: "#0866FF",
  Facebook: "#0866FF",
  Amazon: "#FF9900",
  Apple: "#111827",
  Stripe: "#635BFF",
  Ramp: "#1F2937",
  Notion: "#111827",
  Databricks: "#FF3621",
  Goldman: "#6B7DA8",
  JPMorgan: "#5B4636",
  Datadog: "#632CA6",
};

function CoBadge({ name, size = 28 }: { name: string; size?: number }) {
  const logo = getCompanyLogo(name);
  if (logo) {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          flexShrink: 0,
          background: "#ffffff",
          border: "1px solid rgba(15, 37, 69, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          padding: 3,
        }}
        title={name}
      >
        <img
          src={logo}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </span>
    );
  }
  const tint = COMPANY_TINTS[name] || C.primary;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flexShrink: 0,
        background: tint + "1a",
        color: tint,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.42,
        fontFamily: "'Inter', sans-serif",
      }}
      title={name}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}

function CoStack({ names, size = 28, max = 4 }: { names: string[]; size?: number; max?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      {shown.map((n, idx) => (
        <span
          key={n + idx}
          style={{
            marginLeft: idx ? -10 : 0,
            zIndex: 10 - idx,
            borderRadius: 10,
            padding: 2,
            background: "#fff",
            boxShadow: "0 2px 5px rgba(30,45,77,.12)",
          }}
        >
          <CoBadge name={n} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{
            marginLeft: -10,
            width: size + 5,
            height: size + 5,
            borderRadius: 10,
            background: C.primary,
            color: "#fff",
            border: "2px solid #fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "'Inter', sans-serif",
            zIndex: 1,
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function StarterChip({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
        textAlign: "left",
        padding: "11px 16px",
        borderRadius: 12,
        cursor: "pointer",
        background: hov ? "#fff" : "transparent",
        border: `1px solid ${hov ? C.primary200 : C.border}`,
        boxShadow: hov ? C.shadowSm : "none",
        transition: "all .2s cubic-bezier(0.16,1,0.3,1)",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.heading }}>{label}</span>
      <span style={{ fontSize: 11.5, color: C.ink4 }}>{sub}</span>
    </button>
  );
}

// Mirrors agent.ts ParsedBrief shape — kept inline so this file doesn't
// depend on the services layer for a type that's only used at the
// callback boundary.
export interface InitialBriefParsed {
  companies: string[];
  industries: string[];
  roles: string[];
  locations: string[];
}

interface LoopsEmptyStateProps {
  // The parent decides where "start" lands (typically /agent/setup) and
  // gets the chance to seed that flow with the brief the user just
  // edited here. We also forward the AI proposal's parsed chips so the
  // wizard's Step 02 review has something to show for roles / industries
  // even when the brief text doesn't explicitly name them — without
  // this, a brief like "opportunities at Apple, IBM, Google in Tech"
  // shows Roles=— because the parser correctly finds no roles in the
  // text, but the user's resume implies them.
  onStart: (initialBrief?: string, initialBriefParsed?: InitialBriefParsed) => void;
}

// Fold the user's dream companies (profile `targetFirms`) into the
// AI-drafted sentence. If a target firm is already mentioned in the draft
// we don't double-up; otherwise we tack on ", focused on Stripe, Ramp,
// Notion." so the brief reflects the student's own stated preferences,
// not just what Scout inferred from the resume.
function composeBriefWithDreamCos(sentence: string, dreamCos: string[]): string {
  if (!dreamCos.length) return sentence;
  const lower = sentence.toLowerCase();
  const missing = dreamCos.filter((c) => !lower.includes(c.toLowerCase()));
  if (!missing.length) return sentence;
  const trimmed = sentence.trim().replace(/\.\s*$/, "");
  const list = missing.slice(0, 5).join(", ");
  return `${trimmed}, focused on ${list}.`;
}

export function LoopsEmptyState({ onStart }: LoopsEmptyStateProps) {
  const { user } = useFirebaseAuth();
  const proposal = useProposedBrief({ enabled: true });
  const [primHov, setPrimHov] = useState(false);
  const [dreamCos, setDreamCos] = useState<string[]>([]);
  const [briefText, setBriefText] = useState("");
  const [briefDirty, setBriefDirty] = useState(false);
  const [briefFocused, setBriefFocused] = useState(false);

  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "there";

  // Load the user's dream companies once we know the uid. These come from
  // onboarding's Direction extractor (targetFirms / legacy dreamCompanies)
  // and let the brief read like the student's plan, not Scout's guess.
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    firebaseApi
      .getUserOnboardingData(user.uid)
      .then((d) => {
        if (cancelled) return;
        setDreamCos((d.targetFirms || []).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setDreamCos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Pull suggested companies + counts from the AI-drafted brief when ready;
  // fall back to friendly defaults while the proposal is loading or if the
  // backend returns nothing usable. Keeps the suggestion card always
  // visible — never an empty state inside an empty state.
  const proposedOk = proposal.data && proposal.data.status === "ok";
  const proposalSentence = proposedOk && proposal.data!.sentence
    ? proposal.data!.sentence
    : "People building spatial, location, or geo-intelligence products at tech companies and startups. The kind of work that lines up with your projects.";

  // Merge dream companies with whatever the resume-derived proposal
  // surfaced, dedupe (case-insensitive), and feed the CoStack — the
  // student's listed firms always lead.
  const mergedCompanies = (() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (name: string) => {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(name);
    };
    dreamCos.forEach(push);
    if (proposedOk) proposal.data!.companies.forEach(push);
    return out;
  })();
  const suggestedCompanies = mergedCompanies.length
    ? mergedCompanies
    : ["Google", "Meta", "Databricks", "Datadog", "Stripe"];

  const peopleCount = proposedOk ? Math.max(60, suggestedCompanies.length * 24) : 120;
  const rolesCount = proposedOk ? Math.max(1, proposal.data!.roles.length) : 6;
  const industriesCount = proposedOk ? Math.max(1, proposal.data!.industries.length) : 3;

  // Eyebrow shows what we drafted the suggestion from — primary signal is
  // the user's first industry/role; resume is implicit.
  const proposedRole = proposedOk ? proposal.data!.roles[0] : null;
  const proposedIndustry = proposedOk ? proposal.data!.industries[0] : null;
  const headlineSubject = proposedRole || "Data scientists";
  const headlineAccent = proposedIndustry || "ML engineers in tech";

  // Keep the textarea in sync with the proposal until the user starts
  // editing — once they touch it, their words win. New proposal data (or
  // dream-company hydration) regenerates the seed text right up to first
  // keystroke.
  useEffect(() => {
    if (briefDirty) return;
    setBriefText(composeBriefWithDreamCos(proposalSentence, dreamCos));
  }, [proposalSentence, dreamCos, briefDirty]);

  const handleBriefChange = (v: string) => {
    if (!briefDirty) setBriefDirty(true);
    setBriefText(v);
  };

  // Every starter just opens the setup composer for now — the composer's
  // AI draft step seeds the brief, so the chips are entry points, not
  // pre-filled templates.
  const goToSetup = () => onStart();

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100%",
        overflow: "hidden",
        background: C.paper2,
        fontFamily: "'Inter', sans-serif",
        color: C.ink,
      }}
    >
      {/* Same mountains as the Home/Loops backdrop, dialed down so it reads as
          a faint atmosphere rather than a full scene. Anchored bottom-center,
          soft top fade. Aria-hidden + no pointer events. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage: `url(${MountainsLake})`,
          backgroundSize: "120% auto",
          backgroundPosition: "center bottom",
          backgroundRepeat: "no-repeat",
          opacity: 0.28,
          maskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 20%, #000 60%, #000 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 20%, #000 60%, #000 100%)",
        }}
      />

      {/* Soft warm wash behind the headline */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -120,
          left: "50%",
          transform: "translateX(-50%)",
          width: 760,
          height: 460,
          background:
            "radial-gradient(60% 60% at 50% 40%, rgba(74,96,168,.10), rgba(74,96,168,0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 680,
          margin: "0 auto",
          padding: "64px 40px 72px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {/* Scout greeter */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
          <img
            src="/scout-loops.png"
            alt="Scout"
            style={{
              width: 104,
              objectFit: "contain",
              flexShrink: 0,
              filter: "drop-shadow(0 14px 22px rgba(30,45,77,.18))",
              animation: "loops-empty-bob 3.4s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "relative",
              background: "#fff",
              border: `1px solid ${C.border}`,
              borderRadius: 18,
              padding: "15px 19px",
              boxShadow: C.shadowMd,
              marginBottom: 18,
              maxWidth: 340,
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 14, color: C.ink2, lineHeight: 1.55 }}>
              Hi {firstName}! I'm{" "}
              <strong style={{ color: C.heading, fontWeight: 600 }}>Scout</strong>. I read
              your resume, so I already have a head start. Let's set up your first Loop.
            </div>
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: -6,
                bottom: 22,
                width: 12,
                height: 12,
                background: "#fff",
                borderLeft: `1px solid ${C.border}`,
                borderBottom: `1px solid ${C.border}`,
                transform: "rotate(45deg)",
              }}
            />
          </div>
        </div>

        {/* Headline */}
        <h1
          style={{
            margin: "26px 0 0",
            fontFamily: "'Lora', 'Instrument Serif', Georgia, serif",
            fontWeight: 500,
            fontSize: 48,
            lineHeight: 1.04,
            letterSpacing: "-0.028em",
            color: C.heading,
          }}
        >
          Let's start your first{" "}
          <em style={{ fontStyle: "italic", color: C.primary }}>Loop.</em>
        </h1>
        <p
          style={{
            margin: "16px 0 0",
            fontSize: 16,
            color: C.ink3,
            lineHeight: 1.6,
            maxWidth: 460,
          }}
        >
          A Loop hunts in the background, surfacing open roles and the right people to
          reach while you get on with your day. Set one up in about a minute.
        </p>

        {/* Resume-derived suggestion — Scout perched on the card's left side,
            vertically centered. Wrapper handles the centering so the bob
            animation (which animates transform) doesn't fight translateY. */}
        <div style={{ position: "relative", width: "100%", marginTop: 36 }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: -52,
              transform: "translateY(-50%)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            <img
              src={ScoutYetiFull}
              alt="Scout"
              style={{
                display: "block",
                width: 96,
                filter: "drop-shadow(0 12px 18px rgba(30,45,77,.18))",
                animation: "loops-empty-bob 3.4s ease-in-out infinite",
              }}
            />
          </div>
          <div
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            boxShadow: C.shadowMd,
            overflow: "hidden",
            textAlign: "left",
          }}
        >
          <div style={{ padding: "22px 24px 20px" }}>
            <div style={{ marginBottom: 14 }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: C.ink4,
                }}
              >
                Drafted from your resume
              </span>
            </div>
            <h3
              style={{
                margin: 0,
                fontFamily: "'Lora', 'Instrument Serif', Georgia, serif",
                fontWeight: 500,
                fontSize: 24,
                lineHeight: 1.2,
                letterSpacing: "-0.015em",
                color: C.heading,
              }}
            >
              {headlineSubject} &amp;{" "}
              <em style={{ fontStyle: "italic", color: C.primary }}>{headlineAccent}</em>
            </h3>

            {/* Editable brief — the textarea IS the body copy. We seed it
                with the AI draft (augmented with the user's dream cos) and
                let the student rewrite in place, no separate "Tweak first"
                hop. */}
            <textarea
              value={briefText}
              onChange={(e) => handleBriefChange(e.target.value)}
              onFocus={() => setBriefFocused(true)}
              onBlur={() => setBriefFocused(false)}
              rows={3}
              aria-label="Your Loop's goal — edit freely"
              style={{
                display: "block",
                width: "100%",
                margin: "12px 0 0",
                padding: "10px 12px",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14.5,
                lineHeight: 1.6,
                color: C.ink2,
                background: briefFocused ? "#fff" : "transparent",
                border: `1px solid ${briefFocused ? C.primary200 : "transparent"}`,
                borderRadius: 10,
                outline: "none",
                resize: "vertical",
                minHeight: 76,
                boxShadow: briefFocused ? `0 0 0 4px ${C.primary50}` : "none",
                transition: "background .15s, border-color .15s, box-shadow .15s",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
              <CoStack names={suggestedCompanies} size={28} max={4} />
              <span style={{ fontSize: 13, color: C.ink3 }}>
                <strong style={{ color: C.ink2, fontWeight: 600 }}>~{peopleCount} people</strong>
                {" "}we could reach · {rolesCount} role{rolesCount === 1 ? "" : "s"} · {industriesCount} industries
              </span>
            </div>
          </div>

          {/* Action footer — single primary CTA now that the body is
              inline-editable. */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              padding: "16px 24px",
              borderTop: `1px solid ${C.borderLight}`,
              background: `linear-gradient(180deg, #FCFDFE, ${C.primary50})`,
            }}
          >
            <button
              onClick={() => {
                // Forward the proposal's parsed chips merged with the
                // student's dream cos so Step 02's review surfaces real
                // roles / industries even when the brief text is
                // company-only.
                const parsed: InitialBriefParsed = {
                  companies: suggestedCompanies,
                  industries: proposedOk ? (proposal.data!.industries ?? []) : [],
                  roles: proposedOk ? (proposal.data!.roles ?? []) : [],
                  locations: proposedOk ? (proposal.data!.locations ?? []) : [],
                };
                onStart(briefText.trim() || undefined, parsed);
              }}
              onMouseEnter={() => setPrimHov(true)}
              onMouseLeave={() => setPrimHov(false)}
              style={{
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                padding: "13px 22px",
                borderRadius: 11,
                border: "1.5px solid transparent",
                cursor: "pointer",
                background: primHov ? C.primaryDark : C.primary,
                color: "#fff",
                fontSize: 14.5,
                fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
                boxShadow: C.shadowBlue,
                whiteSpace: "nowrap",
                transition: "background .2s",
              }}
            >
              Start this Loop
              <span
                style={{
                  display: "inline-flex",
                  transform: primHov ? "translateX(3px)" : "none",
                  transition: "transform .2s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          </div>
          </div>
        </div>

        {/* Starter templates */}
        <div style={{ width: "100%", marginTop: 30 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              margin: "0 0 14px",
            }}
          >
            <span style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 12.5, color: C.ink4, fontWeight: 500 }}>
              or start from a template
            </span>
            <span style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StarterChip
              label="Software engineering · big tech"
              sub="Google, Meta, Amazon & peers"
              onClick={goToSetup}
            />
            <StarterChip
              label="Investment banking analyst"
              sub="Goldman, Morgan Stanley, JPMorgan"
              onClick={goToSetup}
            />
            <StarterChip
              label="Product management · startups"
              sub="Stripe, Ramp, Notion & more"
              onClick={goToSetup}
            />
            <StarterChip label="Blank Loop" sub="Start from scratch" onClick={goToSetup} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loops-empty-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation: loops-empty-bob"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
