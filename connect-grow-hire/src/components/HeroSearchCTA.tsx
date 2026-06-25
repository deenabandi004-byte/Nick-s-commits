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
import RedSquiggleArrow from '@/assets/for-students/red-squiggle-arrow.png';
import HeroProductVideo from '@/assets/for-students/hero-product.mp4';
import HeroProductPoster from '@/assets/for-students/hero-product.png';

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

        /* "Try it out" arrow — gentle right-leaning bounce toward the
           search box so the eye is pulled to the CTA. The translation is
           applied to a wrapper so the inner img keeps its rotate+flip. */
        @keyframes hsc-arrow-nudge {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(7px); }
        }
        .hsc-arrow-nudge {
          animation: hsc-arrow-nudge 1.3s ease-in-out infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .hsc-arrow-nudge { animation: none; }
        }

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
            Reach{' '}
            <span style={{ fontStyle: 'italic', color: '#4D619F' }}>anyone</span>
            <br />
            Track every <span style={{ fontStyle: 'italic', color: '#4D619F' }}>conversation</span>
          </h1>

          {/* Prompt input - larger, with a typewriter placeholder. Wrapped
              in a relative container so the "Try it out" doodle hint can
              be anchored to the left margin of the search box. */}
          <div style={{ position: 'relative', maxWidth: 580, marginTop: 32 }}>
            {/* Handwritten "Try it out" hint + red squiggle arrow nudging
                toward the search box. Hidden under lg because there's no
                margin space to render it without crashing into other UI. */}
            <div
              aria-hidden
              className="hidden lg:block"
              style={{
                position: 'absolute',
                left: -84,
                top: 18,
                width: 84,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              <p
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 12,
                  lineHeight: 1.1,
                  color: '#C2410C',
                  margin: '0 0 2px',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                  transform: 'rotate(-22deg)',
                  transformOrigin: '50% 100%',
                  textAlign: 'center',
                }}
              >
                Try it out
              </p>
              <div
                className="hsc-arrow-nudge"
                style={{ width: 32, margin: '5px auto 0' }}
              >
                <img
                  src={RedSquiggleArrow}
                  alt=""
                  style={{
                    display: 'block',
                    width: 32,
                    height: 'auto',
                    transform: 'scaleX(-1) rotate(115deg)',
                    transformOrigin: '50% 50%',
                  }}
                />
              </div>
            </div>
            <form onSubmit={handleSubmit} style={{ marginBottom: 0 }}>
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
          </div>

          {/* Subheadline - names mechanisms (sits below the search box) */}
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 17,
              lineHeight: 1.6,
              color: '#475569',
              maxWidth: 540,
              margin: '24px 0 0',
            }}
          >
            Tell us who you want to meet. We find them, draft the message, and
            manage every reply, follow-up, and meeting prep.
          </p>

          {/* Chip buttons removed - example queries now type into the
              search bar via the typewriter placeholder above. */}
        </div>

        {/* ═════════════ RIGHT: animated Gmail mockup ═════════════ */}
        <div className="hsc-right-wrap">
          {/* Hero product video — same looping MP4 used on /for-students.
              Replaces the animated Gmail mockup as a quick visual swap. */}
          <div
            className="hsc-right-panel"
            style={{
              borderRadius: 14,
              overflow: 'hidden',
              border: '1px solid rgba(15, 37, 69, 0.08)',
              boxShadow:
                '0 1px 2px rgba(15, 37, 69, 0.04), 0 18px 36px rgba(15, 37, 69, 0.10), 0 38px 70px rgba(15, 37, 69, 0.12)',
              background: '#ffffff',
            }}
          >
            <video
              src={HeroProductVideo}
              poster={HeroProductPoster}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-label="Offerloop product preview"
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
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
