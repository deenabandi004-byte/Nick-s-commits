// Promo walkthrough — scripted animation for screen-recorded promo video.
// Standalone, no backend, no auth, no localStorage. Replay via key remount.
// Visual targets: src/pages/FindPage.tsx + src/pages/ContactSearchPage.tsx + tokens.css.
//
// Open at /promo. Use the Aspect toggle for 16:9 (1920x1080) or 9:16 (1080x1920).
// Record the .stage element directly for cleanest output.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Building2, UserCheck, Mail, FileText, Send, ArrowUp, ChevronRight, Linkedin, Star, Paperclip, Inbox as InboxIcon, Tag, RotateCcw, Settings, HelpCircle, Grid as GridIcon, Plus, Clock, CheckCircle, MoreVertical } from "lucide-react";

import "./promo.css";

// ============================================================================
// Tokens — pulled directly from src/styles/tokens.css. Hardcoded here so the
// promo is self-contained and doesn't drift if app tokens change later.
// ============================================================================
const T = {
  accent: "#4A60A8",      // slate-blue — primary action, active tab fill
  brand: "#1B2A44",       // navy
  ink: "#111318",
  ink2: "#4A4F5B",
  ink3: "#8A8F9A",
  paper: "#FFFFFF",
  paper2: "#FAFBFF",
  line: "#E5E5E0",
  line2: "#F0F0ED",
  pos: "#16A34A",
  posBg: "rgba(34, 197, 94, 0.12)",
  posInk: "#15803D",
  avatarBg: "rgba(74, 96, 168, 0.10)",
  serif: '"Instrument Serif", Georgia, serif',
  sans: '"Inter", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

// ============================================================================
// Mock contacts — themed to "USC alumni at Goldman Sachs". 32 entries so the
// results cascade overflows the frame.
// ============================================================================
const FIRST_NAMES = ["Jack","Sophia","Marcus","Priya","Ethan","Olivia","Daniel","Maya","Ryan","Chloe","Ben","Aisha","Noah","Layla","Caleb","Zoe","Andre","Naomi","Will","Iris","Jonah","Mia","Felix","Eva","Theo","Lila","Owen","Anya","Dylan","Sara","Henry","Tess"];
const LAST_NAMES = ["Chen","Kim","Patel","Wong","Singh","Nguyen","Rivera","Bhatt","Park","Diaz","Reed","Khan","Cole","Tran","Sato","Liu","Ahmed","Brooks","Mehta","Park","Yu","Adler","Cho","Ortiz","Lin","Bauer","Vega","Joshi","Smith","Ross","Iyer","Goldberg"];
const TITLES = ["Analyst","Associate","VP","Analyst","Associate","Vice President","Analyst","Associate","Analyst","Associate","Analyst","Associate"];
const REASONS = [
  "Went to University of Southern California like you. Career transition match.",
  "USC alum at Goldman Sachs. Open to coffee chats per LinkedIn.",
  "Same major as you. Active mentor for USC Marshall students.",
  "Cross-functional path you've mentioned wanting. Direct alum.",
  "USC '22 — recently joined Goldman. Strong early-career match.",
  "Trojan network. M&A focus matches your stated interest.",
];

interface MockContact {
  initials: string;
  name: string;
  title: string;
  company: string;
  email: string;
  reason: string;
  warmth: "strong" | "good";
}

function buildContacts(): MockContact[] {
  const out: MockContact[] = [];
  for (let i = 0; i < 32; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[i % LAST_NAMES.length];
    const title = TITLES[i % TITLES.length];
    out.push({
      initials: `${first[0]}${last[0]}`,
      name: `${first} ${last}`,
      title,
      company: "Goldman Sachs",
      email: `${first.toLowerCase()}.${last.toLowerCase()}@gs.com`,
      reason: REASONS[i % REASONS.length],
      // first 26 are Strong fit; tail are Good fit for variety
      warmth: i < 26 ? "strong" : "good",
    });
  }
  return out;
}

const CONTACTS = buildContacts();

// The expanded draft text — adapted from the real screenshot, themed to Goldman.
const DRAFT_BODY = `Hi ${CONTACTS[0].name.split(" ")[0]},

I'm Rylan Bohnett, a current USC student studying Business Administration. Your experience as an ${CONTACTS[0].title.toLowerCase()} at Goldman Sachs is impressive. I am exploring career opportunities in the financial services sector and would love to learn more about your journey and the insights you've gained in your role.

Would you be open to a 15-min call next week?

Resume attached: Rylan Bohnett Resume 2025.pdf.

Best,
RYLAN BOHNETT`;

const DRAFT_SUBJECT = "Connecting with You at Goldman Sachs";

// ============================================================================
// Beat timeline (ms from animation start). Tweak here, scenes read these.
// Total runtime ~ 18s. No cursor / no zoom — meant to be screen-recorded with
// post-production cursor + zoom effects added externally.
// ============================================================================
const BEATS = {
  HEADLINE_IN: 100,
  TABS_IN: 400,
  MODE_IN: 700,

  TYPING_START: 1100,
  TYPING_END: 2700,
  CHIPS_IN: 2800,

  MODE_PULSE: 3400,           // brief pulse on the active Draft emails pill
  SLIDER_START: 3900,
  SLIDER_END: 5400,           // 1.5s slider sweep 1 → 30
  SCANNING: 5800,             // brief scan shimmer on the search box

  RESULTS_START: 6400,
  RESULTS_HEADER: 6400,
  CARDS_STAGGER_BASE: 6500,
  CARDS_STAGGER_STEP: 55,     // 32 cards * 55ms = ~1.76s

  EXPAND_DRAFT: 8600,         // first card expands to full draft
  GMAIL_CUT: 11500,           // cut to dense Gmail drafts wall
  GMAIL_STAMP: 13800,         // "325 drafts. Ready to send." stamp
  END_CARD: 15800,
  END: 18000,
} as const;

const SEARCH_QUERY = "USC alumni at Goldman Sachs";

// ============================================================================
// PromoPage — entry. Handles stage sizing, aspect toggle, replay.
// ============================================================================
export default function PromoPage(): JSX.Element {
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [replayKey, setReplayKey] = useState(0);

  const dims = aspect === "16:9" ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };

  // Scale stage to fit viewport (leaving room for controls).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function update() {
      const padX = 48;
      const padY = 96;
      const vw = window.innerWidth - padX;
      const vh = window.innerHeight - padY;
      const sx = vw / dims.w;
      const sy = vh / dims.h;
      setScale(Math.min(sx, sy, 1));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [dims.w, dims.h]);

  return (
    <div className="promo-root">
      <div className="promo-controls">
        <button
          className="promo-btn"
          onClick={() => setReplayKey((k) => k + 1)}
          aria-label="Replay animation"
        >
          <RotateCcw size={14} /> Replay
        </button>
        <button
          className="promo-btn"
          onClick={() => setAspect((a) => (a === "16:9" ? "9:16" : "16:9"))}
          aria-label="Toggle aspect ratio"
        >
          {aspect === "16:9" ? "Switch to 9:16" : "Switch to 16:9"}
        </button>
        <span className="promo-dim">{dims.w}×{dims.h}</span>
      </div>

      <div className="promo-stage-wrapper" ref={wrapperRef} style={{ width: dims.w * scale, height: dims.h * scale }}>
        <div
          className="stage"
          style={{
            width: dims.w,
            height: dims.h,
            transform: `scale(${scale})`,
          }}
        >
          <Walkthrough key={replayKey} aspect={aspect} stageW={dims.w} stageH={dims.h} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Walkthrough — the actual 8-beat animation. Self-contained timeline,
// remounts cleanly on replay.
// ============================================================================
function Walkthrough({ aspect, stageW, stageH }: { aspect: "16:9" | "9:16"; stageW: number; stageH: number }): JSX.Element {
  const [t, setT] = useState(0); // ms since mount

  // Single rAF clock — every beat keys off `t`.
  useEffect(() => {
    let mounted = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      if (!mounted) return;
      const elapsed = now - start;
      setT(elapsed);
      if (elapsed < BEATS.END + 4000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const inGmail = t >= BEATS.GMAIL_CUT;
  const inEndCard = t >= BEATS.END_CARD;

  return (
    <div className="walk-root" style={{ width: stageW, height: stageH }}>
      <AnimatePresence>
        {!inGmail && !inEndCard && (
          <motion.div
            key="find-scene"
            className="walk-scene"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <FindScene t={t} aspect={aspect} />
          </motion.div>
        )}
        {inGmail && !inEndCard && (
          <motion.div
            key="gmail-scene"
            className="walk-scene"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <GmailScene t={t - BEATS.GMAIL_CUT} aspect={aspect} />
          </motion.div>
        )}
        {inEndCard && (
          <motion.div
            key="end-card"
            className="walk-scene"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <EndCard />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// FindScene — beats 1-6: headline, tabs, typing, mode, slider, scan, results,
// expanded draft. Pure CSS/framer-driven from `t`.
// ============================================================================
function FindScene({ t, aspect }: { t: number; aspect: "16:9" | "9:16" }): JSX.Element {
  // Beat 1
  const headlineOn = t >= BEATS.HEADLINE_IN;
  const tabsOn = t >= BEATS.TABS_IN;
  const modeOn = t >= BEATS.MODE_IN;

  // Beat 2 — typing
  const typedChars = (() => {
    if (t < BEATS.TYPING_START) return 0;
    if (t >= BEATS.TYPING_END) return SEARCH_QUERY.length;
    const span = BEATS.TYPING_END - BEATS.TYPING_START;
    const ratio = (t - BEATS.TYPING_START) / span;
    return Math.floor(ratio * SEARCH_QUERY.length);
  })();
  const typedText = SEARCH_QUERY.slice(0, typedChars);
  const showCaret = t >= BEATS.TYPING_START && t < BEATS.CHIPS_IN + 500;

  const chipsOn = t >= BEATS.CHIPS_IN;

  // Beat 3 — Draft mode pulse (already active visually from start, but we pulse it)
  const modePulse = t >= BEATS.MODE_PULSE && t < BEATS.MODE_PULSE + 700;

  // Beat 4 — slider sweep 1 -> 30
  const sliderValue = (() => {
    if (t < BEATS.SLIDER_START) return 1;
    if (t >= BEATS.SLIDER_END) return 30;
    const span = BEATS.SLIDER_END - BEATS.SLIDER_START;
    const ratio = (t - BEATS.SLIDER_START) / span;
    // ease-out
    const eased = 1 - Math.pow(1 - ratio, 2.5);
    return 1 + Math.round(eased * 29);
  })();
  const sliderFlashing = t >= BEATS.SLIDER_START && t < BEATS.SLIDER_END + 300;

  // Beat 5 — scanning beat (subtle pulse)
  const scanning = t >= BEATS.SCANNING && t < BEATS.RESULTS_START;

  // Beat 6 — results
  const resultsOn = t >= BEATS.RESULTS_START;
  const cardsRevealed = (() => {
    if (t < BEATS.CARDS_STAGGER_BASE) return 0;
    const k = Math.floor((t - BEATS.CARDS_STAGGER_BASE) / BEATS.CARDS_STAGGER_STEP) + 1;
    return Math.min(k, CONTACTS.length);
  })();
  const showResultsHeader = resultsOn;

  // Beat 7 — expand first card draft
  const expandDraft = t >= BEATS.EXPAND_DRAFT;

  // Layout: portrait vs landscape — same content, scaled spacing.
  const portraitMode = aspect === "9:16";

  return (
    <div
      className="find-scene"
      style={{
        padding: portraitMode ? "60px 36px 80px" : "72px 200px",
        background: T.paper,
        fontFamily: T.sans,
        color: T.ink,
      }}
    >
      {/* Top sub-bar (mimics the "Set your career goals" strip) */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: headlineOn ? 1 : 0, y: headlineOn ? 0 : -10 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: "#F2F6FF",
          color: "#1F3A8A",
          fontSize: 13,
          padding: "10px 24px",
          borderRadius: 6,
          marginBottom: portraitMode ? 28 : 36,
          fontFamily: T.sans,
        }}
      >
        Set your career goals to get better contact and company suggestions.{" "}
        <span style={{ textDecoration: "underline", fontWeight: 500 }}>Add goals</span>
      </motion.div>

      {/* HEADLINE — "Who do you want to meet?" */}
      <div style={{ textAlign: "center", marginBottom: portraitMode ? 28 : 36 }}>
        <Headline visible={headlineOn} portrait={portraitMode} />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: headlineOn ? 1 : 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          style={{
            color: T.ink2,
            fontSize: portraitMode ? 18 : 20,
            marginTop: 14,
          }}
        >
          Find the right people, get their contact info, and draft outreach in one step.
        </motion.div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: portraitMode ? 28 : 36 }}>
        <Tabs visible={tabsOn} portrait={portraitMode} />
      </div>

      {/* MODE PICKER + SEARCH BOX */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: modeOn ? 1 : 0, y: modeOn ? 0 : 12 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ marginBottom: 24 }}
      >
        <ModePicker pulse={modePulse} portrait={portraitMode} />
      </motion.div>

      {/* Show search + slider + chips until results take over */}
      {!resultsOn && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: modeOn ? 1 : 0, y: modeOn ? 0 : 20 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <SearchBox
            value={typedText}
            caret={showCaret}
            chipsOn={chipsOn}
            scanning={scanning}
            portrait={portraitMode}
          />

          <div style={{ marginTop: 32 }}>
            <Slider value={sliderValue} flashing={sliderFlashing} portrait={portraitMode} />
          </div>

          <div style={{ marginTop: 24 }}>
            <TemplateRow portrait={portraitMode} />
          </div>
        </motion.div>
      )}

      {/* RESULTS */}
      <AnimatePresence>
        {resultsOn && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            style={{ marginTop: 4 }}
          >
            <TemplateRow portrait={portraitMode} />
            <div style={{ marginTop: 18 }}>
              <ResultsHeader visible={showResultsHeader} count={cardsRevealed} totalLabel={`${CONTACTS.length} results found`} />
            </div>

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {CONTACTS.slice(0, cardsRevealed).map((c, i) => (
                <ContactCard
                  key={i}
                  contact={c}
                  expanded={i === 0 && expandDraft}
                  index={i}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ----- Sub-components --------------------------------------------------------

function Headline({ visible, portrait }: { visible: boolean; portrait: boolean }): JSX.Element {
  const size = portrait ? 72 : 88;
  return (
    <motion.h1
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 20 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      style={{
        fontFamily: T.serif,
        fontSize: size,
        fontWeight: 400,
        color: T.ink,
        margin: 0,
        lineHeight: 1.05,
        letterSpacing: "-0.01em",
      }}
    >
      Who do you want to <em style={{ fontStyle: "italic" }}>meet?</em>
    </motion.h1>
  );
}

const TAB_DEFS = [
  { id: "people", label: "PEOPLE", Icon: Search },
  { id: "companies", label: "COMPANIES", Icon: Building2 },
  { id: "hiring", label: "HIRING MANAGERS", Icon: UserCheck },
] as const;

function Tabs({ visible, portrait }: { visible: boolean; portrait: boolean }): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 10 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      style={{
        display: "flex",
        gap: 0,
        border: `1px solid ${T.line}`,
        borderRadius: 4,
        overflow: "hidden",
        fontFamily: T.sans,
      }}
    >
      {TAB_DEFS.map((tab, i) => {
        const isActive = tab.id === "people";
        return (
          <div
            key={tab.id}
            style={{
              padding: portrait ? "16px 28px" : "18px 44px",
              background: isActive ? T.accent : T.paper,
              color: isActive ? "#fff" : T.ink2,
              fontSize: 13.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              borderRight: i < TAB_DEFS.length - 1 ? `1px solid ${T.line}` : "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <tab.Icon size={15} />
            {tab.label}
          </div>
        );
      })}
    </motion.div>
  );
}

function ModePicker({ pulse, portrait }: { pulse: boolean; portrait: boolean }): JSX.Element {
  const items: Array<{ id: string; label: string; Icon: any; active?: boolean }> = [
    { id: "get", label: "Get emails", Icon: Mail },
    { id: "draft", label: "Draft emails", Icon: FileText, active: true },
    { id: "send", label: "Send emails", Icon: Send },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        padding: 4,
        background: T.paper,
        border: `1px solid ${T.line}`,
        borderRadius: 6,
        fontFamily: T.sans,
      }}
    >
      {items.map((it) => {
        const isActive = !!it.active;
        return (
          <div
            key={it.id}
            className={isActive && pulse ? "promo-mode-pulse" : ""}
            style={{
              padding: portrait ? "10px 16px" : "10px 20px",
              background: isActive ? T.accent : T.paper,
              color: isActive ? "#fff" : T.ink2,
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <it.Icon size={15} />
            {it.label}
          </div>
        );
      })}
    </div>
  );
}

function SearchBox({
  value,
  caret,
  chipsOn,
  scanning,
  portrait,
}: {
  value: string;
  caret: boolean;
  chipsOn: boolean;
  scanning: boolean;
  portrait: boolean;
}): JSX.Element {
  return (
    <div
      className={scanning ? "promo-scanning" : ""}
      style={{
        background: "#F7F7F4",
        border: `1px solid ${T.line}`,
        borderRadius: 8,
        padding: portrait ? 18 : 24,
        fontFamily: T.sans,
      }}
    >
      <div style={{ color: T.ink3, fontSize: 13, marginBottom: 14 }}>
        For best results include <u>company</u>, <u>role</u>, and <u>location</u> to get personalized email drafts
      </div>
      <div
        style={{
          background: T.paper,
          border: `1px solid ${T.line}`,
          borderRadius: 6,
          padding: portrait ? "18px 18px" : "22px 22px",
          minHeight: portrait ? 90 : 110,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            color: value ? T.ink : T.ink3,
            fontSize: portrait ? 18 : 20,
            fontFamily: T.sans,
            lineHeight: 1.4,
          }}
        >
          {value || "e.g. USC alumni at Goldman Sachs"}
          {caret && <span className="promo-caret">|</span>}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: T.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 4,
          }}
        >
          <ArrowUp size={20} color="#fff" />
        </div>
      </div>

      {/* Guided chips */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 18,
          flexWrap: "wrap",
        }}
      >
        {["USC grads in Tech — Startup", "Hiring managers in Tech — Startup", "USC grads in FinTech"].map((c, i) => (
          <motion.div
            key={c}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: chipsOn ? 1 : 0, y: chipsOn ? 0 : 6 }}
            transition={{ duration: 0.4, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{
              padding: "8px 16px",
              background: T.paper,
              border: `1px solid ${T.line}`,
              borderRadius: 999,
              fontSize: 13,
              color: T.ink2,
              fontFamily: T.sans,
            }}
          >
            {c}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Slider({ value, flashing, portrait }: { value: number; flashing: boolean; portrait: boolean }): JSX.Element {
  const max = 30;
  const pct = ((value - 1) / (max - 1)) * 100;
  return (
    <div style={{ fontFamily: T.sans }}>
      <div
        style={{
          fontFamily: T.serif,
          fontSize: 12,
          letterSpacing: "0.12em",
          color: T.ink3,
          marginBottom: 12,
        }}
      >
        HOW MANY TO FIND?
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 13, color: T.ink3, minWidth: 14 }}>1</span>
        <div
          style={{
            flex: 1,
            position: "relative",
            height: 6,
            background: "#E5E3DE",
            borderRadius: 3,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: 6,
              width: `${pct}%`,
              background: flashing ? T.accent : T.brand,
              borderRadius: 3,
              transition: "width 80ms linear, background 200ms ease",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `calc(${pct}% - 9px)`,
              top: -6,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: flashing ? T.accent : T.brand,
              boxShadow: flashing
                ? "0 2px 10px rgba(74,96,168,0.55)"
                : "0 2px 6px rgba(27,42,68,0.4)",
              transition: "left 80ms linear, background 200ms ease, box-shadow 200ms ease",
            }}
          />
        </div>
        <span style={{ fontSize: 13, color: T.ink3, minWidth: 18, textAlign: "right" }}>{max}</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 14,
        }}
      >
        <div
          style={{
            fontFamily: T.serif,
            fontStyle: "italic",
            fontSize: portrait ? 18 : 20,
            color: T.ink,
          }}
        >
          Find {value} contact{value !== 1 ? "s" : ""}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: T.ink2 }}>
          <span
            style={{
              padding: "5px 10px",
              background: "#FAFAF8",
              border: `1px solid ${T.line}`,
              borderRadius: 4,
              fontFamily: T.mono,
              fontSize: 12,
              color: T.ink,
            }}
          >
            {value * 5} credits
          </span>
          <span style={{ color: T.ink3 }}>of 11,818</span>
        </div>
      </div>
    </div>
  );
}

function TemplateRow(_: { portrait: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, fontFamily: T.sans }}>
      <div
        style={{
          padding: "10px 18px",
          border: `1px solid ${T.line}`,
          borderRadius: 6,
          background: T.paper,
          fontSize: 14,
          color: T.ink2,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Mail size={15} />
        Email template <span style={{ color: T.ink, fontWeight: 500 }}>networking · Professional</span>
        <ChevronRight size={14} style={{ transform: "rotate(90deg)" }} />
      </div>
      <div
        style={{
          padding: "10px 18px",
          border: `1px solid ${T.line}`,
          borderRadius: 6,
          background: T.paper,
          fontSize: 14,
          color: T.ink,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Paperclip size={15} />
        Resume <CheckCircle size={14} color={T.pos} />
      </div>
      <div style={{ fontSize: 14, color: T.ink2 }}>Import contacts</div>
    </div>
  );
}

function ResultsHeader({ visible, count, totalLabel }: { visible: boolean; count: number; totalLabel: string }): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 8 }}
      transition={{ duration: 0.4 }}
      style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: T.sans }}
    >
      <div
        style={{
          padding: "6px 14px",
          background: T.posBg,
          color: T.posInk,
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <CheckCircle size={14} />
        {totalLabel}
      </div>
      <div style={{ color: T.ink3, fontSize: 14 }}>
        {count} new: saved to your tracker automatically
      </div>
    </motion.div>
  );
}

function ContactCard({ contact, expanded }: { contact: MockContact; expanded: boolean; index: number }): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "13px 16px",
        background: T.paper,
        border: `0.5px solid #E2E8F0`,
        borderRadius: 4,
        fontFamily: T.sans,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: T.avatarBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
            color: T.ink,
            flexShrink: 0,
          }}
        >
          {contact.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{contact.name}</span>
            <span
              style={{
                padding: "1px 8px",
                borderRadius: 3,
                background: contact.warmth === "strong" ? T.posBg : "rgba(245, 158, 11, 0.14)",
                color: contact.warmth === "strong" ? T.posInk : "#B45309",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {contact.warmth === "strong" ? "Strong fit" : "Good fit"}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            {contact.title} at {contact.company}
          </div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{contact.email}</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 3, lineHeight: 1.3 }}>{contact.reason}</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "8px 16px",
              border: `1px solid ${expanded ? T.accent : T.line}`,
              borderRadius: 6,
              fontSize: 13,
              color: expanded ? T.accent : T.ink,
              background: T.paper,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {expanded ? "Hide draft" : "View draft"}
            <ChevronRight
              size={13}
              style={{
                transform: expanded ? "rotate(90deg)" : "none",
                transition: "transform .2s",
              }}
            />
          </div>
          <div
            style={{
              padding: "8px 16px",
              border: `1px solid ${T.line}`,
              borderRadius: 6,
              fontSize: 13,
              color: T.ink,
              background: T.paper,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Linkedin size={14} /> LinkedIn
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="draft"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                marginTop: 12,
                padding: "16px 18px",
                background: "#F8FAFC",
                borderRadius: 6,
                border: `0.5px solid #E2E8F0`,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, marginBottom: 8 }}>
                {DRAFT_SUBJECT}
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12, lineHeight: 1.5 }}>
                <div>To: {contact.email}</div>
                <div>From: rylanbohnett@gmail.com</div>
              </div>
              <div
                style={{
                  fontSize: 13.5,
                  color: "#334155",
                  lineHeight: 1.65,
                  whiteSpace: "pre-wrap",
                }}
              >
                {DRAFT_BODY}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
                <div
                  style={{
                    padding: "9px 16px",
                    background: T.accent,
                    color: "#fff",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Mail size={14} /> Open in Gmail
                </div>
                <div
                  style={{
                    padding: "9px 16px",
                    background: T.pos,
                    color: "#fff",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Send size={14} /> Send
                </div>
                <div
                  style={{
                    padding: "9px 16px",
                    background: T.paper,
                    border: `1px solid ${T.line}`,
                    borderRadius: 6,
                    fontSize: 13,
                    color: T.ink,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <FileText size={14} /> Copy email
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
// GmailScene — beat 7: dense Gmail-style drafts list (~50 visible, "1-50 of 325"
// counter, compose pane open). Stamp animates in.
// ============================================================================
const GMAIL_SUBJECTS = [
  "Connecting with You at Goldman Sachs",
  "Insights on Your Transition to Goldman Sachs",
  "Career pivot from tech to finance",
  "Your transition from summer analyst to full-time",
  "Question about your move to JPMorgan Chase",
  "Connecting at Goldman Sachs",
  "Transition to Managing Director at Goldman Sachs",
  "Insights on your transition to Goldman Sachs",
  "Insights on Your Role as CEO and Founder",
  "Insights on Your Transition to Amazon",
  "Exploring your transition to software development",
  "Curious about your transition to Amazon",
  "Congratulations on your promotion at JPMorgan",
  "USC student curious about your move within JPMorgan",
  "USC student interested in your JPMorgan to PNC transition",
  "Reaching Out About the Data Scientist Position",
  "Data Scientist Role - Passionate Candidate Here",
  "Insights on Your Path from JPMorgan to Goldman",
  "Connecting from USC — investment banking interest",
  "USC alum reaching out about your time at Morgan Stanley",
  "Following up on your LinkedIn post about M&A",
  "Insights on your path to Goldman Sachs IBD",
  "USC student curious about lateral moves in finance",
  "Connecting at Citi after your Goldman move",
  "Quick question about your transition to BlackRock",
  "Insights on your move from banking to PE",
];
const GMAIL_PREVIEWS = [
  "Hi Jillian, I'm Rylan Bohnett, a current USC student studying Business Administration. Y...",
  "Hi Nick, I'm Rylan Bohnett, a USC senior majoring in Business Administration. I see you'...",
  "Hi Gayle, Rylan here — sophomore at USC focused on Business Administration and exploring pat...",
  "Hi Sam, I'm Rylan Bohnett, a current USC student. I noticed your transition from sum...",
  "Hi Mark, I'm Rylan Bohnett, a USC junior studying Business Administration. Your move...",
  "Hi Jack, I'm Rylan Bohnett, a USC student. Congrats on your role at Goldman Sachs. I...",
  "Hi Priya, I'm Rylan Bohnett, a USC senior. Your path to managing director is impressi...",
  "Hi Yusuf, I'm Rylan, a current USC student studying Business. Your transition stood out...",
  "Hi Diana, I'm Rylan, a current USC student studying Business Administration. I came ac...",
  "Hi Shanil, I'm Rylan, a USC senior interested in product. I saw your transition to Ama...",
];
const GMAIL_TIMES = ["11:11AM", "11:11AM", "11:11AM", "11:11AM", "11:11AM", "11:10AM", "11:10AM", "11:10AM", "11:10AM", "11:09AM", "11:09AM", "11:09AM", "11:08AM", "11:08AM", "11:07AM", "11:06AM", "11:06AM", "11:06AM", "11:05AM", "11:05AM", "11:04AM", "11:04AM", "11:03AM", "11:03AM", "11:02AM", "11:01AM", "11:01AM", "11:00AM", "10:59AM", "10:59AM", "10:58AM", "10:58AM", "10:57AM", "10:56AM", "10:56AM", "10:55AM", "10:55AM", "10:54AM", "10:54AM", "10:53AM", "10:52AM", "10:52AM", "10:51AM", "10:50AM", "10:50AM", "10:49AM", "10:49AM", "10:48AM", "10:47AM", "10:47AM"];

function GmailScene({ t, aspect }: { t: number; aspect: "16:9" | "9:16" }): JSX.Element {
  const rowCount = 50;
  const portrait = aspect === "9:16";

  // Rows cascade in over first 2.5s
  const cascadeMs = 2500;
  const rowsRevealed = Math.min(rowCount, Math.floor((t / cascadeMs) * rowCount));
  const stampOn = t >= BEATS.GMAIL_STAMP - BEATS.GMAIL_CUT;

  const rows = useMemo(() => {
    const arr: Array<{ subject: string; preview: string; time: string }> = [];
    for (let i = 0; i < rowCount; i++) {
      arr.push({
        subject: GMAIL_SUBJECTS[i % GMAIL_SUBJECTS.length],
        preview: GMAIL_PREVIEWS[i % GMAIL_PREVIEWS.length],
        time: GMAIL_TIMES[i] || "10:00AM",
      });
    }
    return arr;
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#F6F8FC",
        fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
        color: "#202124",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Gmail top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 16px",
          background: "#F6F8FC",
          gap: 16,
          borderBottom: "1px solid #E0E2E6",
          height: 64,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GridIcon size={20} color="#5F6368" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22, fontFamily: "'Product Sans', sans-serif", color: "#5F6368" }}>
            <span style={{ color: "#4285F4" }}>G</span>
            <span style={{ color: "#EA4335" }}>m</span>
            <span style={{ color: "#FBBC04" }}>a</span>
            <span style={{ color: "#34A853" }}>i</span>
            <span style={{ color: "#EA4335" }}>l</span>
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, maxWidth: 720, marginLeft: 60 }}>
          <div
            style={{
              flex: 1,
              background: "#EAF1FB",
              borderRadius: 8,
              padding: "10px 16px",
              fontSize: 14,
              color: "#202124",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Search size={18} color="#5F6368" />
            <span style={{ fontFamily: "monospace" }}>in:draft</span>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
          <HelpCircle size={20} color="#5F6368" />
          <Settings size={20} color="#5F6368" />
          <GridIcon size={20} color="#5F6368" />
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#C5C5C5" }} />
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <div
          style={{
            width: 240,
            background: "#F6F8FC",
            padding: "8px 0 8px 8px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "16px 24px",
              background: "#C2E7FF",
              borderRadius: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              fontSize: 14,
              fontWeight: 500,
              color: "#001D35",
              marginBottom: 12,
              marginLeft: 8,
            }}
          >
            <Plus size={18} />
            Compose
          </div>
          <SidebarItem icon={<InboxIcon size={18} />} label="Inbox" count="23,201" />
          <SidebarItem icon={<Star size={18} />} label="Starred" />
          <SidebarItem icon={<Clock size={18} />} label="Snoozed" />
          <SidebarItem icon={<Send size={18} />} label="Sent" />
          <SidebarItem icon={<FileText size={18} />} label="Drafts" count="325" active />
          <SidebarItem icon={<Tag size={18} />} label="Purchases" count="682" />
          <SidebarItem icon={<ChevronRight size={18} />} label="More" />
          <div style={{ padding: "16px 24px 8px", fontSize: 14, color: "#5F6368" }}>Labels</div>
          <SidebarItem icon={<Tag size={18} color="#909090" />} label="[Imap]/Drafts" />
          <SidebarItem icon={<Tag size={18} color="#909090" />} label="Notes" />
        </div>

        {/* Drafts list */}
        <div style={{ flex: 1, background: T.paper, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Toolbar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 16px",
              gap: 14,
              fontSize: 13,
              color: "#5F6368",
              flexShrink: 0,
            }}
          >
            <div style={{ width: 18, height: 18, border: "1.5px solid #5F6368", borderRadius: 2 }} />
            <ChevronRight size={16} style={{ transform: "rotate(90deg)" }} />
            <RotateCcw size={16} />
            <MoreVertical size={16} />
            <div style={{ marginLeft: 16, padding: "4px 12px", border: "1px solid #DADCE0", borderRadius: 16, fontSize: 13 }}>
              Any time
            </div>
            <div style={{ padding: "4px 12px", border: "1px solid #DADCE0", borderRadius: 16, fontSize: 13 }}>
              Has attachment
            </div>
            <div style={{ padding: "4px 12px", border: "1px solid #DADCE0", borderRadius: 16, fontSize: 13 }}>
              To
            </div>
            <div style={{ color: "#1A73E8", fontSize: 13, fontWeight: 500 }}>Advanced search</div>
            <div style={{ marginLeft: "auto", fontSize: 13 }}>1-50 of 325</div>
            <ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
            <ChevronRight size={16} />
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {rows.slice(0, rowsRevealed).map((row, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 16px",
                  borderBottom: "1px solid #F1F3F4",
                  fontSize: 14,
                  color: "#202124",
                  height: 40,
                  gap: 12,
                  background: i === 0 ? "#F2F6FC" : T.paper,
                }}
              >
                <div style={{ width: 18, height: 18, border: "1.5px solid #DADCE0", borderRadius: 2 }} />
                <Star size={16} color="#DADCE0" />
                <span style={{ color: "#C5221F", fontWeight: 500, minWidth: 50 }}>Draft</span>
                <div style={{ flex: 1, display: "flex", gap: 10, overflow: "hidden" }}>
                  <span style={{ fontWeight: 600, color: "#202124", whiteSpace: "nowrap" }}>{row.subject}</span>
                  <span style={{ color: "#5F6368", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    - {row.preview}
                  </span>
                </div>
                <div style={{ color: "#5F6368", fontSize: 12, minWidth: 70, textAlign: "right" }}>{row.time}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Compose pane (open in lower right) */}
      <div
        style={{
          position: "absolute",
          right: 30,
          bottom: 0,
          width: portrait ? 540 : 580,
          height: portrait ? 600 : 560,
          background: T.paper,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          borderRadius: "8px 8px 0 0",
          display: "flex",
          flexDirection: "column",
          fontSize: 14,
          color: "#202124",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#404040",
            color: "#fff",
            padding: "8px 16px",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{DRAFT_SUBJECT}</span>
          <div style={{ display: "flex", gap: 12 }}>
            <span>—</span>
            <span>↗</span>
            <span>×</span>
          </div>
        </div>
        <div style={{ padding: 12, borderBottom: "1px solid #E0E2E6", fontSize: 14 }}>
          {CONTACTS[0].email}
        </div>
        <div style={{ padding: 12, borderBottom: "1px solid #E0E2E6", fontSize: 14, fontWeight: 600 }}>
          {DRAFT_SUBJECT}
        </div>
        <div style={{ padding: "8px 12px", fontSize: 12, color: "#5F6368", display: "flex", gap: 12 }}>
          <span>
            <kbd style={kbdStyle}>Tab</kbd> to improve,
          </span>
          <span>
            <kbd style={kbdStyle}>Esc</kbd> to dismiss
          </span>
        </div>
        <div style={{ padding: "12px 16px", fontSize: 13.5, lineHeight: 1.6, color: "#202124", flex: 1, whiteSpace: "pre-wrap", overflow: "hidden" }}>
          {DRAFT_BODY}
        </div>
        <div
          style={{
            padding: 10,
            borderTop: "1px solid #E0E2E6",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#F8F9FA",
          }}
        >
          <div
            style={{
              padding: "8px 22px",
              background: "#0B57D0",
              color: "#fff",
              borderRadius: 18,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Send
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#E8EAED",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
            }}
          >
            ▼
          </div>
          <Paperclip size={18} color="#5F6368" />
          <span style={{ marginLeft: 6, color: "#1A73E8", fontSize: 13 }}>resume.pdf (51K)</span>
        </div>
      </div>

      {/* Kinetic stamp */}
      <AnimatePresence>
        {stampOn && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: -4 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 18 }}
            style={{
              position: "absolute",
              top: "40%",
              left: "32%",
              transform: "translate(-50%, -50%)",
              padding: "28px 56px",
              background: T.brand,
              color: "#fff",
              fontFamily: T.serif,
              fontSize: 64,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              borderRadius: 8,
              boxShadow: "0 24px 60px rgba(15,23,42,0.4)",
              border: `3px solid ${T.accent}`,
              textAlign: "center",
              lineHeight: 1.05,
              zIndex: 10,
            }}
          >
            <div>325 drafts.</div>
            <div style={{ fontStyle: "italic", color: "#A5B4FC" }}>Ready to send.</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #DADCE0",
  borderRadius: 3,
  padding: "1px 6px",
  fontSize: 11,
  fontFamily: "monospace",
};

function SidebarItem({ icon, label, count, active }: { icon: React.ReactNode; label: string; count?: string; active?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "8px 26px",
        background: active ? "#D3E3FD" : "transparent",
        borderRadius: active ? "0 16px 16px 0" : 0,
        marginRight: 8,
        fontSize: 14,
        fontWeight: active ? 700 : 400,
        color: "#202124",
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {count && <span style={{ fontSize: 12, color: "#5F6368" }}>{count}</span>}
    </div>
  );
}

// ============================================================================
// EndCard — final beat. Offerloop logo + tagline.
// ============================================================================
function EndCard(): JSX.Element {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: T.paper,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: T.serif,
        color: T.ink,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ fontSize: 120, fontWeight: 400, letterSpacing: "-0.02em" }}
      >
        offerloop<span style={{ color: T.accent }}>.</span>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        style={{ fontFamily: T.sans, fontSize: 24, color: T.ink2, marginTop: 18 }}
      >
        From cold list to drafted outreach. In minutes.
      </motion.div>
    </div>
  );
}
