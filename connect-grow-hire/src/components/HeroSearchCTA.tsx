// src/components/HeroSearchCTA.tsx
//
// Offerloop landing hero - asymmetric, prompt-as-CTA layout inspired by
// Clado.ai. The left column is the pitch + real prompt input; the right
// column is an animated product preview that cycles through the three
// Offerloop phases - Search → Find → Outreach → Track - exactly the way
// the app actually flows.
//
// Cycle:
//   1. Query types into the search bar, "Find people" button fades in
//   2. "Finding" phase - contact rows stream into the table one by one
//   3. "Drafting" phase - Drafted pills fade into the Status column per row,
//      then the green "N contacts / N drafted" chips appear
//   4. "Network tracker" phase - statuses morph Drafted → Sent → Opened /
//      Replied over time, and the highlighted row resolves to a red
//      "● Follow up" pill with a pulsing notification dot
//   5. Hold briefly, then reset and loop
//
// When the visitor types their own query into the LEFT input and submits,
// the query is stashed in localStorage under `offerloop_pending_query` and
// they're bounced to the sign-up flow. ContactSearchPage reads the key on
// mount and pre-fills the real search bar with their query.
//
// Brand accent: #2563EB. Typography: Libre Baskerville for the headline,
// Inter for everything else.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Search, CornerDownLeft } from 'lucide-react';

export const PENDING_QUERY_KEY = 'offerloop_pending_query';

const ROTATING_PLACEHOLDERS = [
  'Find USC alumni at Goldman Sachs in New York',
  'Product managers at Stripe who went to Stanford',
  'IB analysts at JP Morgan under 3 years experience',
  'McKinsey consultants in Chicago from Michigan Ross',
  'Software engineers at OpenAI who studied CS at Berkeley',
];

// ───────────────────────────────────────────────────────────────────────────
// Animated preview - phase machine & demo data
// ───────────────────────────────────────────────────────────────────────────

const DEMO_QUERY = 'USC alumni working at Goldman Sachs in New York';

type Phase = 'search' | 'finding' | 'drafting' | 'tracking';
type Status = 'drafted' | 'sent' | 'opened' | 'replied' | 'followup';

type DemoRow = {
  initials: string;
  avatarBg: string;
  sender: string;
  email: string;
  subject: string;
  preview: string;
  time: string;
  highlight?: boolean;
  expanded?: boolean;
  final: Status;
};

// Fake Gmail draft list - these are the messages Offerloop auto-generates
// into the user's Gmail. The copy is intentionally specific (USC, Trojan
// Fund, M&A) so it feels real rather than templated. Maya's row stays
// expanded so the visitor can see the personalized email body inline.
const DEMO_ROWS: DemoRow[] = [
  {
    initials: 'CW',
    avatarBg: '#FECACA',
    sender: 'Chris Wallace',
    email: 'cwallace@evercore.com',
    subject: 'Re: Trojan Fund → Evercore intro',
    preview: "Thanks Alex, happy to chat. Does Thursday 3pm work?",
    time: '2m',
    highlight: true,
    final: 'followup',
  },
  {
    initials: 'MR',
    avatarBg: '#BFDBFE',
    sender: 'Maya Rodriguez',
    email: 'm.rodriguez@gs.com',
    subject: 'Quick question about your path at Goldman',
    preview: "Hi Maya, noticed your path from USC Marshall to Goldman TMT…",
    time: '12m',
    expanded: true,
    final: 'sent',
  },
  {
    initials: 'AM',
    avatarBg: '#BBF7D0',
    sender: 'Aidan Murphy',
    email: 'amurphy@bain.com',
    subject: 'Fellow Trojan, 15 min meeting?',
    preview: "Hi Aidan, as a fellow USC student heading into consulting…",
    time: '38m',
    final: 'replied',
  },
  {
    initials: 'RN',
    avatarBg: '#DDD6FE',
    sender: 'Rachel Nguyen',
    email: 'rachel.n@mckinsey.com',
    subject: 'Curious about your journey to McKinsey',
    preview: "Hi Rachel, noticed you made the transition from Marshall…",
    time: '1h',
    final: 'opened',
  },
  {
    initials: 'PS',
    avatarBg: '#FBCFE8',
    sender: 'Priya Sharma',
    email: 'priya.sharma@bcg.com',
    subject: 'BCG consulting, 15 min chat',
    preview: "Hi Priya, saw your recent work on the retail practice…",
    time: '3h',
    final: 'replied',
  },
];

const STATUS_STYLES: Record<Status, { bg: string; fg: string; label: string; showDot?: boolean }> = {
  drafted:  { bg: '#E0E7FF', fg: '#3730A3', label: 'Draft' },
  sent:     { bg: '#FEF3C7', fg: '#92400E', label: 'Sent' },
  opened:   { bg: '#EDE9FE', fg: '#6D28D9', label: 'Opened' },
  replied:  { bg: '#DCFCE7', fg: '#047857', label: 'Replied' },
  followup: { bg: '#FEE2E2', fg: '#B91C1C', label: 'Follow up', showDot: true },
};

const PHASE_LABELS: Record<Phase, { pips: number; title: string }> = {
  search:   { pips: 1, title: 'Finding 5 contacts' },
  finding:  { pips: 2, title: 'Writing 5 personalized drafts' },
  drafting: { pips: 3, title: '5 drafts synced to Gmail' },
  tracking: { pips: 4, title: 'Tracker · live replies' },
};

// Notification toasts that appear during the tracking phase - these show
// the "tracker updating" story: Offerloop watches replies and pings you.
type NotificationKind = 'replied' | 'opened' | 'followup';
const NOTIFICATIONS: { kind: NotificationKind; name: string; initials: string; bg: string; delay: number }[] = [
  { kind: 'replied',  name: 'Aidan Murphy',   initials: 'AM', bg: '#BBF7D0', delay: 0 },
  { kind: 'followup', name: 'Chris Wallace',  initials: 'CW', bg: '#FECACA', delay: 1800 },
];

const NOTIFICATION_COPY: Record<NotificationKind, { title: string; subtitle: string; accent: string }> = {
  replied:  { title: 'replied to your intro',     subtitle: 'Open in Tracker',    accent: '#047857' },
  opened:   { title: 'opened your email',         subtitle: 'Added to Tracker',    accent: '#6D28D9' },
  followup: { title: 'needs a follow-up',         subtitle: 'Flagged in Tracker',  accent: '#B91C1C' },
};

interface HeroSearchCTAProps {
  onSubmit?: (query: string) => void;
}

const HeroSearchCTA: React.FC<HeroSearchCTAProps> = ({ onSubmit }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Left column (real prompt) ────────────────────────────────────
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [typedPlaceholder, setTypedPlaceholder] = useState('');

  // Typewriter effect - cycles through ROTATING_PLACEHOLDERS, typing each
  // one out character by character, holding briefly, then erasing and
  // moving to the next. Pauses when the user focuses or types.
  useEffect(() => {
    if (value || focused) {
      setTypedPlaceholder('');
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idx = 0;
    let charIdx = 0;
    let mode: 'typing' | 'hold' | 'erasing' | 'pause' = 'typing';

    const tick = () => {
      if (cancelled) return;
      const target = ROTATING_PLACEHOLDERS[idx];

      if (mode === 'typing') {
        if (charIdx < target.length) {
          charIdx++;
          setTypedPlaceholder(target.slice(0, charIdx));
          timeoutId = setTimeout(tick, 42 + Math.random() * 38);
        } else {
          mode = 'hold';
          timeoutId = setTimeout(tick, 1700);
        }
      } else if (mode === 'hold') {
        mode = 'erasing';
        timeoutId = setTimeout(tick, 30);
      } else if (mode === 'erasing') {
        if (charIdx > 0) {
          charIdx--;
          setTypedPlaceholder(target.slice(0, charIdx));
          timeoutId = setTimeout(tick, 18);
        } else {
          mode = 'pause';
          idx = (idx + 1) % ROTATING_PLACEHOLDERS.length;
          timeoutId = setTimeout(tick, 360);
        }
      } else if (mode === 'pause') {
        mode = 'typing';
        tick();
      }
    };

    timeoutId = setTimeout(tick, 400);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [value, focused]);

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    const query = value.trim();
    if (query) {
      try {
        localStorage.setItem(PENDING_QUERY_KEY, query);
      } catch {
        /* private mode - swallow */
      }
    }
    onSubmit?.(query);
    navigate('/signin?mode=signup');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ─── Right column (animated preview) ──────────────────────────────
  const [typedQuery, setTypedQuery] = useState('');
  const [caretOn, setCaretOn] = useState(true);
  const [showFindBtn, setShowFindBtn] = useState(false);
  const [phase, setPhase] = useState<Phase>('search');
  const [visibleRows, setVisibleRows] = useState<number[]>([]);
  const [rowStatuses, setRowStatuses] = useState<Record<number, Status>>({});
  const [showChips, setShowChips] = useState(false);
  const [visibleNotifs, setVisibleNotifs] = useState<number[]>([]);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Blink caret continuously
  useEffect(() => {
    const t = setInterval(() => setCaretOn((c) => !c), 520);
    return () => clearInterval(t);
  }, []);

  // Main animation loop
  useEffect(() => {
    const clearAll = () => {
      timeouts.current.forEach(clearTimeout);
      timeouts.current = [];
    };
    const at = (ms: number, fn: () => void) => {
      timeouts.current.push(setTimeout(fn, ms));
    };

    const runCycle = () => {
      clearAll();
      // Reset state
      setTypedQuery('');
      setShowFindBtn(false);
      setPhase('search');
      setVisibleRows([]);
      setRowStatuses({});
      setShowChips(false);
      setVisibleNotifs([]);

      // ─── Phase 1 · SEARCH - type the query ───
      const TYPE_START = 500;
      const TYPE_PER_CHAR = 42;
      for (let i = 0; i <= DEMO_QUERY.length; i++) {
        at(TYPE_START + i * TYPE_PER_CHAR, () => setTypedQuery(DEMO_QUERY.slice(0, i)));
      }
      const typingEnd = TYPE_START + DEMO_QUERY.length * TYPE_PER_CHAR;

      // Compose button appears once the query is typed
      at(typingEnd + 180, () => setShowFindBtn(true));

      // ─── Phase 2 · FINDING / DRAFTING - all 6 rows stream in fast ───
      // Batch feel: tight 90ms stagger so the whole list pops within ~540ms
      const findingStart = typingEnd + 600;
      at(findingStart, () => setPhase('finding'));
      DEMO_ROWS.forEach((_, idx) => {
        at(findingStart + 120 + idx * 90, () => {
          setVisibleRows((r) => [...r, idx]);
          setRowStatuses((s) => ({ ...s, [idx]: 'drafted' }));
        });
      });
      const rowsEnd = findingStart + 120 + DEMO_ROWS.length * 90;

      // ─── Phase 3 · READY - celebratory "5 drafts synced" moment ───
      at(rowsEnd + 250, () => {
        setPhase('drafting');
        setShowChips(true);
      });
      const readyEnd = rowsEnd + 250 + 1100;

      // ─── Phase 4 · TRACKING - drafts turn into sent/opened/replied ───
      at(readyEnd, () => setPhase('tracking'));
      // Wave 1: every row shifts from Draft → Sent
      DEMO_ROWS.forEach((_, idx) => {
        at(readyEnd + 200 + idx * 80, () =>
          setRowStatuses((s) => ({ ...s, [idx]: 'sent' }))
        );
      });
      const sentEnd = readyEnd + 200 + DEMO_ROWS.length * 80;

      // Wave 2: non-sent rows resolve to their final status
      const finalResolves = DEMO_ROWS.map((r, idx) => ({ idx, final: r.final }))
        .filter((r) => r.final !== 'sent');
      finalResolves.forEach((r, i) => {
        at(sentEnd + 300 + i * 380, () =>
          setRowStatuses((s) => ({ ...s, [r.idx]: r.final }))
        );
      });
      const finalEnd = sentEnd + 300 + finalResolves.length * 380;

      // Wave 3: reply notification toasts slide in over the Gmail panel
      NOTIFICATIONS.forEach((_, i) => {
        at(finalEnd + 300 + NOTIFICATIONS[i].delay, () =>
          setVisibleNotifs((n) => [...n, i])
        );
      });
      const notifEnd =
        finalEnd + 300 + NOTIFICATIONS[NOTIFICATIONS.length - 1].delay + 800;

      // Hold on the final state, then loop
      at(notifEnd + 2800, runCycle);
    };

    runCycle();
    return clearAll;
  }, []);

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <>
      {/* Local keyframes + responsive breakpoints. Prefixed `hsc-` so nothing
          bleeds into the rest of the app. */}
      <style>{`
        @keyframes hsc-row-in {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes hsc-pill-in {
          0% { opacity: 0; transform: scale(0.86); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes hsc-fade-in {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes hsc-live-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.38); }
          50%      { box-shadow: 0 0 0 6px rgba(37, 99, 235, 0); }
        }
        @keyframes hsc-notify-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(185, 28, 28, 0.45); }
          50%      { box-shadow: 0 0 0 5px rgba(185, 28, 28, 0); }
        }

        @keyframes hsc-notif-in {
          0%   { opacity: 0; transform: translateX(24px) scale(0.94); }
          60%  { opacity: 1; transform: translateX(-4px) scale(1.01); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        .hsc-row-enter { animation: hsc-row-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .hsc-pill-enter { animation: hsc-pill-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .hsc-fade-enter { animation: hsc-fade-in 0.35s ease both; }
        .hsc-notify { animation: hsc-notify-pulse 1.6s ease-out infinite; }
        .hsc-notif-enter { animation: hsc-notif-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }

        @keyframes hsc-popup-in {
          0%   { opacity: 0; transform: translate(-12px, 8px) scale(0.96); }
          100% { opacity: 1; transform: translate(0, 0) scale(1); }
        }
        .hsc-popup-enter { animation: hsc-popup-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }

        /* Dot grid background for the right side */
        .hsc-dot-grid {
          background-image: radial-gradient(rgba(15, 37, 69, 0.14) 1px, transparent 1px);
          background-size: 22px 22px;
        }

        /* Flex layout - left text gets more horizontal room, panel shrinks
           and slides right with a slight trim past the viewport */
        .hsc-grid {
          display: flex;
          align-items: center;
          gap: 72px;
          max-width: 1440px;
          margin-left: auto;
          margin-right: auto;
          padding-left: 96px;
          padding-right: 0;
        }

        .hsc-left {
          flex: 0 0 600px;
          max-width: 600px;
          text-align: left;
        }

        .hsc-right-wrap {
          flex: 1 1 auto;
          position: relative;
          min-height: 460px;
          min-width: 0;
        }
        .hsc-right-panel {
          position: absolute;
          top: 0;
          left: 40px;
          width: 720px;
        }

        @media (max-width: 1280px) {
          .hsc-grid { padding-left: 72px; gap: 56px; }
          .hsc-left { flex-basis: 500px; max-width: 500px; }
          .hsc-right-panel { width: 680px; left: 20px; }
        }
        @media (max-width: 1100px) {
          .hsc-grid { padding-left: 48px; gap: 40px; }
          .hsc-left { flex-basis: 440px; max-width: 440px; }
          .hsc-right-panel { width: 640px; left: 0; }
        }
        @media (max-width: 1024px) {
          .hsc-grid {
            flex-direction: column;
            padding: 0 24px;
            gap: 40px;
            max-width: 680px;
          }
          .hsc-left { flex-basis: auto; max-width: 100%; text-align: center; margin: 0 auto; }
          .hsc-right-wrap { width: 100%; min-height: 440px; }
          .hsc-right-panel { position: relative; width: 100%; max-width: 640px; margin: 0 auto; }
        }
        @media (max-width: 560px) {
          .hsc-right-wrap { display: none; }
        }
      `}</style>

      <div className="hsc-grid">
        {/* ═════════════ LEFT: pitch + prompt input ═════════════ */}
        <div className="hsc-left">
          {/* Headline - two parallel phrases, product loop */}
          <h1
            style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 'clamp(44px, 4.4vw, 64px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: '#0f2545',
              margin: 0,
            }}
          >
            Reach anyone.
            <br />
            Track every conversation.
          </h1>

          {/* Subheadline - names mechanisms */}
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 17,
              lineHeight: 1.6,
              color: '#475569',
              maxWidth: 540,
              margin: '24px 0 32px',
            }}
          >
            Tell us who you want to meet. We find them, draft the message, and
            manage every reply, follow-up, and meeting prep.
          </p>

          {/* Prompt input - larger, with a typewriter placeholder */}
          <form onSubmit={handleSubmit} style={{ maxWidth: 580, marginBottom: 0 }}>
            <div
              style={{
                position: 'relative',
                background: '#ffffff',
                borderRadius: 16,
                border: `1.5px solid ${focused ? '#2563EB' : 'rgba(15, 37, 69, 0.08)'}`,
                boxShadow: focused
                  ? '0 0 0 6px rgba(37, 99, 235, 0.12), 0 16px 48px rgba(37, 99, 235, 0.16)'
                  : '0 2px 10px rgba(15, 37, 69, 0.05), 0 22px 52px rgba(15, 37, 69, 0.08)',
                transition: 'all 0.18s ease',
                padding: '22px 22px 18px 54px',
                textAlign: 'left',
              }}
            >
              <div
                style={{ position: 'absolute', top: 25, left: 22, color: '#2563EB' }}
                aria-hidden
              >
                <Search size={20} strokeWidth={2.3} />
              </div>

              <textarea
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={typedPlaceholder || (focused ? 'Describe who you want to meet…' : '')}
                rows={1}
                aria-label="Describe the people you want to meet"
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  background: 'transparent',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 17,
                  lineHeight: 1.5,
                  color: '#0f2545',
                  padding: 0,
                  minHeight: 26,
                  maxHeight: 96,
                  overflow: 'hidden',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 18,
                  gap: 12,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12.5,
                    color: '#94A3B8',
                  }}
                >
                  <kbd style={kbdStyle}>
                    <CornerDownLeft size={11} strokeWidth={2.6} />
                  </kbd>
                  to search
                </span>

                <button
                  type="submit"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#0F172A',
                    color: '#ffffff',
                    fontFamily: "'Libre Baskerville', Georgia, serif",
                    fontWeight: 600,
                    fontSize: 14,
                    border: 'none',
                    borderRadius: 11,
                    padding: '12px 20px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#2563EB';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#0F172A';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Search size={14} strokeWidth={2.4} />
                  Search
                </button>
              </div>
            </div>
          </form>

          {/* Chip buttons removed - example queries now type into the
              search bar via the typewriter placeholder above. */}
        </div>

        {/* ═════════════ RIGHT: animated Gmail mockup ═════════════ */}
        <div className="hsc-right-wrap">
          {/* Dotted grid backdrop */}
          <div
            className="hsc-dot-grid"
            aria-hidden
            style={{
              position: 'absolute',
              inset: '-80px -200px -80px -40px',
              opacity: 0.45,
              zIndex: 0,
              maskImage:
                'radial-gradient(ellipse at 40% 50%, black 40%, transparent 90%)',
              WebkitMaskImage:
                'radial-gradient(ellipse at 40% 50%, black 40%, transparent 90%)',
            }}
          />

          {/* Gmail-style panel */}
          <div
            className="hsc-right-panel"
            style={{
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid rgba(15, 37, 69, 0.10)',
              boxShadow:
                '0 2px 8px rgba(15, 37, 69, 0.04), 0 24px 60px rgba(15, 37, 69, 0.12)',
              overflow: 'hidden',
              zIndex: 1,
            }}
          >
            {/* ─── Gmail top chrome ─── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 16px',
                borderBottom: '1px solid #E8EAED',
                background: '#F6F8FC',
              }}
            >
              {/* Hamburger */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      display: 'block',
                      width: 16,
                      height: 2,
                      background: '#5F6368',
                      borderRadius: 2,
                    }}
                  />
                ))}
              </div>

              {/* Official Gmail logo - canonical 2020 refresh
                  Color mapping (matching Google's brand):
                  - Blue   #4285F4: bottom-left (left stroke of M)
                  - Green  #34A853: bottom-right (right stroke of M)
                  - Red    #EA4335: center V (the prominent middle dip)
                  - Yellow #FBBC04: top-right triangle (right peak)
                  - Dark red #C5221F: top-left triangle (left peak) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg
                  width="30"
                  height="22"
                  viewBox="0 0 256 193"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label="Gmail"
                >
                  <path
                    d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.659 7.825 17.455 17.455 17.455h40.727Z"
                    fill="#4285F4"
                  />
                  <path
                    d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.504l-31.156 17.837-27.026 25.799v98.91Z"
                    fill="#34A853"
                  />
                  <path
                    d="M58.182 93.14V17.455l69.818 52.364 69.818-52.364V93.14L128 145.504Z"
                    fill="#EA4335"
                  />
                  <path
                    d="M197.818 17.455V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945Z"
                    fill="#FBBC04"
                  />
                  <path
                    d="M0 49.504 26.759 69.45 58.182 93.14V17.455L41.89 5.286C24.61-7.659 0 4.646 0 26.231Z"
                    fill="#C5221F"
                  />
                </svg>
                <span
                  style={{
                    fontFamily: "'Inter', 'Google Sans', sans-serif",
                    fontSize: 20,
                    color: '#5F6368',
                    fontWeight: 400,
                    letterSpacing: '-0.02em',
                  }}
                >
                  Gmail
                </span>
              </div>

              {/* Search bar - this is where the Offerloop query types in */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#EAF1FB',
                  borderRadius: 8,
                  padding: '8px 14px',
                  minWidth: 0,
                }}
              >
                <Search size={16} strokeWidth={2.2} style={{ color: '#5F6368', flexShrink: 0 }} />
                <div
                  style={{
                    flex: 1,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    color: '#202124',
                    fontWeight: 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                  }}
                >
                  {typedQuery || (
                    <span style={{ color: '#80868B' }}>Search mail</span>
                  )}
                  <span
                    style={{
                      display: 'inline-block',
                      width: 1.5,
                      height: 13,
                      background: '#202124',
                      marginLeft: 2,
                      verticalAlign: 'middle',
                      opacity: caretOn && !showFindBtn ? 1 : 0,
                      transition: 'opacity 0.08s',
                    }}
                  />
                </div>
              </div>

              {/* Account circle */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                A
              </div>
            </div>

            {/* ─── Gmail body: sidebar + list ─── */}
            <div style={{ display: 'flex', minHeight: 360 }}>
              {/* Sidebar */}
              <div
                style={{
                  width: 128,
                  borderRight: '1px solid #E8EAED',
                  padding: '14px 0 14px 10px',
                  background: '#ffffff',
                  flexShrink: 0,
                }}
              >
                {/* Compose button */}
                <div
                  style={{
                    opacity: showFindBtn ? 1 : 0,
                    transform: showFindBtn ? 'translateX(0)' : 'translateX(-4px)',
                    transition: 'all 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#C2E7FF',
                      color: '#001D35',
                      fontFamily: "'Inter', 'Google Sans', sans-serif",
                      fontSize: 12.5,
                      fontWeight: 500,
                      padding: '10px 18px 10px 14px',
                      borderRadius: 16,
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#001D35"/>
                    </svg>
                    Compose
                  </div>
                </div>

                {/* Labels */}
                {[
                  { label: 'Inbox', icon: 'inbox', selected: false, count: 0 },
                  { label: 'Starred', icon: 'star', selected: false, count: 0 },
                  { label: 'Sent', icon: 'send', selected: false, count: 0 },
                  { label: 'Drafts', icon: 'draft', selected: true, count: visibleRows.length },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '7px 16px 7px 18px',
                      borderTopLeftRadius: 16,
                      borderBottomLeftRadius: 16,
                      background: item.selected ? '#D3E3FD' : 'transparent',
                      marginRight: 0,
                      marginBottom: 1,
                      position: 'relative',
                    }}
                  >
                    <GmailIcon kind={item.icon as 'inbox' | 'star' | 'send' | 'draft'} active={item.selected} />
                    <span
                      style={{
                        fontFamily: "'Inter', 'Google Sans', sans-serif",
                        fontSize: 12,
                        color: item.selected ? '#001D35' : '#44474A',
                        fontWeight: item.selected ? 700 : 400,
                        flex: 1,
                      }}
                    >
                      {item.label}
                    </span>
                    {item.label === 'Drafts' && item.count > 0 && (
                      <span
                        className="hsc-fade-enter"
                        key={item.count}
                        style={{
                          fontFamily: "'Inter', 'Google Sans', sans-serif",
                          fontSize: 11,
                          color: '#001D35',
                          fontWeight: 700,
                        }}
                      >
                        {item.count}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Email list */}
              <div style={{ flex: 1, background: '#ffffff', minWidth: 0 }}>
                {/* Sub-header with phase label + Offerloop badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 18px',
                    borderBottom: '1px solid #E8EAED',
                    background: '#FAFBFF',
                    minHeight: 42,
                  }}
                >
                  {/* Offerloop sync badge - signals the drafts are auto-generated */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#2563EB',
                      color: '#ffffff',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 100,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.28)',
                    }}
                  >
                    <Zap size={11} strokeWidth={2.8} />
                    Offerloop
                  </div>

                  {/* Phase pips */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-block',
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background:
                            i <= PHASE_LABELS[phase].pips ? '#2563EB' : '#DADCE0',
                          transition: 'background 0.3s ease',
                        }}
                      />
                    ))}
                  </div>

                  {/* Phase title - mentions "6 drafts" explicitly to sell the batch */}
                  <span
                    key={phase}
                    className="hsc-fade-enter"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: '#202124',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {PHASE_LABELS[phase].title}
                  </span>

                  {/* Success chip - pops when drafts are ready */}
                  <div
                    style={{
                      marginLeft: 'auto',
                      opacity: showChips ? 1 : 0,
                      transform: showChips ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.92)',
                      transition: 'all 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  >
                    <Chip
                      color="#0B6B2B"
                      bg="#E6F4EA"
                      label={`✓ ${DEMO_ROWS.length} in Gmail`}
                    />
                  </div>
                </div>

                {/* Empty state shown in search phase */}
                {phase === 'search' && visibleRows.length === 0 && (
                  <div
                    style={{
                      padding: '56px 24px',
                      textAlign: 'center',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 13,
                      color: '#9AA0A6',
                    }}
                  >
                    No drafts yet
                  </div>
                )}

                {/* ─── Gmail draft rows ─── */}
                {DEMO_ROWS.map((row, idx) => {
                  const isVisible = visibleRows.includes(idx);
                  if (!isVisible) return null;
                  const status = rowStatuses[idx];
                  const highlighted = row.highlight && status === 'followup';
                  const expanded = row.expanded;
                  return (
                    <div
                      key={row.sender}
                      className="hsc-row-enter"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: 0,
                        borderBottom: '1px solid #F1F3F4',
                        background: highlighted
                          ? '#FFF8E1'
                          : expanded
                            ? '#F4F8FE'
                            : '#ffffff',
                        position: 'relative',
                        borderLeft: expanded ? '3px solid #2563EB' : 'none',
                      }}
                    >
                      {/* Highlighted row gets a red left edge indicator */}
                      {highlighted && (
                        <div
                          aria-hidden
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 3,
                            background: '#EA4335',
                          }}
                        />
                      )}

                      {/* ─── Row header (always rendered) ─── */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: expanded ? '11px 18px 6px 14px' : '9px 18px 9px 14px',
                          minHeight: 40,
                        }}
                      >
                        {/* Checkbox + star */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <div
                            style={{
                              width: 14,
                              height: 14,
                              border: '1.5px solid #DADCE0',
                              borderRadius: 2,
                              flexShrink: 0,
                            }}
                          />
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                              stroke="#DADCE0"
                              strokeWidth="1.4"
                              fill="none"
                            />
                          </svg>
                        </div>

                        {/* Avatar */}
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: row.avatarBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#0f2545',
                            flexShrink: 0,
                          }}
                        >
                          {row.initials}
                        </div>

                        {/* Sender name */}
                        <div
                          style={{
                            width: 118,
                            fontFamily: "'Inter', 'Google Sans', sans-serif",
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#202124',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flexShrink: 0,
                          }}
                        >
                          {row.sender}
                        </div>

                        {/* Label chip: "Draft" in red like Gmail */}
                        {status === 'drafted' && (
                          <span
                            className="hsc-pill-enter"
                            style={{
                              display: 'inline-block',
                              fontFamily: "'Inter', sans-serif",
                              fontSize: 10,
                              fontWeight: 600,
                              color: '#D93025',
                              flexShrink: 0,
                            }}
                          >
                            Draft
                          </span>
                        )}

                        {/* Subject + preview */}
                        <div
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 6,
                            minWidth: 0,
                            fontFamily: "'Inter', 'Google Sans', sans-serif",
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: highlighted || expanded ? 700 : 500,
                              color: '#202124',
                              flexShrink: 0,
                            }}
                          >
                            {row.subject}
                          </span>
                          {!expanded && (
                            <span
                              style={{
                                color: '#5F6368',
                                fontWeight: 400,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              · {row.preview}
                            </span>
                          )}
                        </div>

                        {/* Status pill (Offerloop overlay) */}
                        {status && status !== 'drafted' && (
                          <div style={{ flexShrink: 0 }}>
                            <StatusPill status={status} />
                          </div>
                        )}

                        {/* Timestamp */}
                        <div
                          style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 11,
                            color: highlighted ? '#202124' : '#5F6368',
                            fontWeight: highlighted ? 700 : 400,
                            flexShrink: 0,
                            minWidth: 24,
                            textAlign: 'right',
                          }}
                        >
                          {row.time}
                        </div>
                      </div>

                      {/* ─── Expanded email body - only for the "opened" row ─── */}
                      {expanded && (
                        <div
                          style={{
                            padding: '0 20px 14px 56px',
                          }}
                        >
                          <div
                            style={{
                              fontFamily: "'Inter', 'Google Sans', sans-serif",
                              fontSize: 11.5,
                              color: '#202124',
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            <span style={{ color: '#5F6368', fontWeight: 400 }}>to </span>
                            {row.email}
                          </div>
                          <div
                            style={{
                              fontFamily: "'Inter', 'Google Sans', sans-serif",
                              fontSize: 12.5,
                              lineHeight: 1.55,
                              color: '#3C4043',
                            }}
                          >
                            Hi Maya, I came across your profile and noticed your path from{' '}
                            <mark style={{ background: '#FEF3C7', color: '#92400E', padding: '0 3px', borderRadius: 2, fontWeight: 600 }}>
                              USC Marshall
                            </mark>
                            {' '}to{' '}
                            <mark style={{ background: '#FEF3C7', color: '#92400E', padding: '0 3px', borderRadius: 2, fontWeight: 600 }}>
                              Goldman TMT
                            </mark>
                            . Would love to hear how you broke in. Open to a quick 15-min chat?
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ─── Footer banner: Offerloop sync status ─── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 18px',
                background: '#F6F8FC',
                borderTop: '1px solid #E8EAED',
                fontFamily: "'Inter', sans-serif",
                fontSize: 11.5,
                color: '#5F6368',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Zap size={12} strokeWidth={2.4} style={{ color: '#2563EB' }} />
                Drafts auto-written into <strong style={{ color: '#202124', fontWeight: 700 }}>your Gmail</strong>
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#2563EB',
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#2563EB',
                    animation: 'hsc-live-pulse 1.8s ease-out infinite',
                  }}
                />
                Synced
              </span>
            </div>
          </div>

          {/* Both popups removed - the personalization story is now told
              inline via Maya's expanded row, and the tracker story via the
              reply notifications below. Less crowding, less distraction. */}

          {/* ─── Floating reply notifications - positioned bottom-right
              of the panel, overlapping rows 5-6 ─── */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: 24,
              bottom: 44,
              display: 'flex',
              flexDirection: 'column-reverse',
              gap: 8,
              zIndex: 10,
              pointerEvents: 'none',
              maxWidth: 240,
            }}
          >
            {NOTIFICATIONS.map((n, i) => {
              const isVisible = visibleNotifs.includes(i);
              const copy = NOTIFICATION_COPY[n.kind];
              if (!isVisible) return null;
              return (
                <div
                  key={n.name + n.kind}
                  className="hsc-notif-enter"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: '#ffffff',
                    border: '1px solid rgba(15, 37, 69, 0.08)',
                    borderRadius: 12,
                    padding: '9px 13px 9px 9px',
                    minWidth: 232,
                    boxShadow:
                      '0 2px 8px rgba(15, 37, 69, 0.10), 0 18px 40px rgba(15, 37, 69, 0.22)',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: n.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#0f2545',
                      flexShrink: 0,
                      position: 'relative',
                    }}
                  >
                    {n.initials}
                    <span
                      style={{
                        position: 'absolute',
                        right: -1,
                        bottom: -1,
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: copy.accent,
                        border: '2px solid #ffffff',
                      }}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#0f2545',
                        lineHeight: 1.25,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <span>{n.name}</span>{' '}
                      <span style={{ color: '#64748B', fontWeight: 500 }}>
                        {copy.title}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 2,
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 9.5,
                        fontWeight: 700,
                        color: copy.accent,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: copy.accent,
                        }}
                      />
                      {copy.subtitle}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

// Tiny SVG icons for the Gmail sidebar
const GmailIcon: React.FC<{ kind: 'inbox' | 'star' | 'send' | 'draft'; active: boolean }> = ({
  kind,
  active,
}) => {
  const color = active ? '#001D35' : '#5F6368';
  const stroke = 1.6;
  if (kind === 'inbox') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.89 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H5V5h14v10z" stroke={color} strokeWidth={stroke} fill="none" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (kind === 'star') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" stroke={color} strokeWidth={stroke} fill="none" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (kind === 'send') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" stroke={color} strokeWidth={stroke} fill="none" strokeLinejoin="round"/>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" stroke={color} strokeWidth={stroke} fill="none" strokeLinejoin="round"/>
    </svg>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────────

const Chip: React.FC<{ color: string; bg: string; label: string }> = ({
  color,
  bg,
  label,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: bg,
      color,
      fontFamily: "'Inter', sans-serif",
      fontSize: 10.5,
      fontWeight: 700,
      padding: '4px 10px',
      borderRadius: 100,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}
  >
    <span
      style={{
        display: 'inline-block',
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: color,
      }}
    />
    {label}
  </div>
);

const StatusPill: React.FC<{ status: Status }> = ({ status }) => {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="hsc-pill-enter"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: s.bg,
        color: s.fg,
        fontFamily: "'Inter', sans-serif",
        fontSize: 11.5,
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: 100,
        whiteSpace: 'nowrap',
      }}
    >
      {s.showDot && (
        <span
          className="hsc-notify"
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: s.fg,
          }}
        />
      )}
      {s.label}
    </span>
  );
};

const kbdStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  background: '#F1F5F9',
  border: '1px solid #E2E8F0',
  borderRadius: 4,
  padding: '1px 6px',
  color: '#475569',
  marginLeft: 2,
};

export default HeroSearchCTA;
