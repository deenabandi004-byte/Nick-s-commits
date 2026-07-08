/**
 * ScoutChatThread - the Scout conversation UI, shared by the Ask Scout side
 * panel (variant="panel") and the Getting Started page (variant="page").
 *
 * Pure view: all chat state and once-only side effects live in
 * ScoutChatProvider. Rendering two threads at once is a supported state -
 * they show the same messages and stay in sync automatically.
 *
 * Variant differences are layout-only:
 *  - panel: compact paddings, yeti-hero empty state with BriefingButton.
 *  - page:  Lovable-style empty state (serif heading + large prompt box +
 *           suggestion chips centered mid-page); once messages exist, a
 *           centered column with the composer pinned at the bottom.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowUp,
  Briefcase,
  Building2,
  Check,
  Coffee,
  Copy,
  FileText,
  History,
  Loader2,
  Lock,
  MessageSquarePlus,
  PenLine,
  RotateCcw,
  Search,
  Send,
  Square,
  Target,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { formatMessage } from '@/hooks/useScoutChat';
import { useScoutChatShared, decideNavAction } from '@/contexts/ScoutChatContext';
import { BriefingButton } from '@/components/scout/BriefingButton';
import { CompletenessGauge } from '@/components/scout/CompletenessGauge';
import { ActiveStrategyCard } from '@/components/scout/ActiveStrategyCard';
import { ScoutApproveCard } from '@/components/ScoutApproveCard';
import {
  ScoutModePill,
  ScoutToolPill,
  ScoutPlanChecklist,
  ScoutCtaChip,
} from '@/components/ScoutChatExtras';
import { SUGGESTED_QUESTIONS, SCOUT_CHIPS_BY_PAGE } from '@/data/scout-knowledge';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { listScoutChats, formatRelativeTime, type ScoutChatSummary } from '@/services/scoutChats';
import { ScribbleUnderline } from '@/components/ScribbleUnderline';
import ScoutYetiHead from '@/assets/scouts/scout-yeti-head.png';
import DoodleBurstLeft from '@/assets/for-students/doodle-burst-left.png';
import DoodleLoopArrow from '@/assets/for-students/doodle-loop-arrow.png';

interface ScoutChatThreadProps {
  variant: 'panel' | 'page';
  /** Rendered under the empty-state chips. The panel passes the
   *  tried-and-failed hint. */
  emptyStateExtra?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Scout home (page variant, empty state) — design "1a: Ability grid".
// Eight capability tiles that pre-fill the composer.
// ---------------------------------------------------------------------------
type Capability = {
  icon: LucideIcon;
  title: string;
  sub: string;
  prompt: string;
};

// Icons mirror the sidebar item for the same feature (Job Board, Search,
// Meeting Prep, Cover Letter, Resume Workshop, My Network) so the abilities
// read as the app's own surfaces.
const CAPABILITIES: Capability[] = [
  { icon: Briefcase, title: 'Apply to jobs', sub: 'Find roles that fit & apply', prompt: 'Find software roles I should apply to this week' },
  { icon: Search, title: 'Find people at companies', sub: 'Names + verified emails', prompt: 'Find 10 people at Stripe I could email' },
  { icon: Target, title: 'Reach the hiring manager', sub: 'Find who owns the role', prompt: "Who's the hiring manager for this role?" },
  { icon: Building2, title: 'Research companies', sub: 'Know them before you reach out', prompt: 'Give me a briefing on McKinsey before I reach out' },
  { icon: Coffee, title: 'Prep for meetings', sub: 'Walk in confident', prompt: 'Prep me for my coffee chat with a Bain consultant' },
  { icon: PenLine, title: 'Write a cover letter', sub: 'Personalized in seconds', prompt: 'Write a cover letter for this job posting' },
  { icon: FileText, title: 'Tailor your resume', sub: 'Match any job description', prompt: 'Tailor my resume to this job description' },
  { icon: Users, title: 'Track everything', sub: 'Contacts & conversations', prompt: 'Show me what’s waiting on me right now' },
];

// Example prompts that type themselves out and delete in the composer while
// it is empty (same type-and-delete idiom the old Getting Started box used).
const HERO_PLACEHOLDERS = [
  'Find software roles I should apply to this week',
  'Find 10 people at Google I could email',
  "Who's the hiring manager for this job?",
  'Give me a briefing on a company before I reach out',
];

// Scoped styles for the hero's hover states (inline styles can't express
// them). Class names are sh-* and only used inside the page hero.
const HERO_CSS = `
.sh-send{flex:none;width:46px;height:46px;border-radius:50%;border:none;background:var(--accent,#4A60A8);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 2px 8px rgba(74,96,168,.20);transition:background .2s}
.sh-send:hover{background:#3C4F8E}
.sh-send:disabled{cursor:default}
.sh-chip{display:flex;align-items:center;gap:12px;padding:13px 15px;background:#fff;border:1px solid #E5E7EC;border-radius:12px;cursor:pointer;text-align:left;transition:transform .2s cubic-bezier(0.16,1,0.3,1),box-shadow .2s,border-color .2s}
.sh-chip:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(26,26,26,.06);border-color:var(--primary-200,#B6C3E8)}
.sh-chip-ic{flex:none;width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:#fff;border:1px solid rgba(15,37,69,0.08);color:var(--accent,#4A60A8)}
.sh-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sh-caret{display:inline-block;width:1px;height:1em;margin-left:1px;background:currentColor;vertical-align:text-bottom;animation:sh-caret-blink 1s steps(2) infinite}
@keyframes sh-caret-blink{50%{opacity:0}}
@media (max-width:960px){.sh-grid{grid-template-columns:repeat(2,1fr)}}
@media (prefers-reduced-motion:reduce){.sh-chip:hover{transform:none}}
`;

export function ScoutChatThread({ variant, emptyStateExtra }: ScoutChatThreadProps) {
  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    stopGeneration,
    requestBriefing,
    scoutCurrentPage,
    activeStrategy,
    resolvedIds,
    handleApprove,
    handleCtaAction,
    handlePlanStep,
    handleInlineLink,
  } = useScoutChatShared();
  const location = useLocation();

  // Local DOM refs: with two threads potentially mounted at once (panel open
  // over the Getting Started page), the hook-level shared refs can't serve
  // both, so each view scrolls and focuses itself.
  const localInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus on mount. The panel returns null while closed, so its thread
  // mounts fresh on every open - this replaces the old focus-on-open effect.
  useEffect(() => {
    const t = setTimeout(() => localInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  const chips =
    SCOUT_CHIPS_BY_PAGE[scoutCurrentPage] ??
    SCOUT_CHIPS_BY_PAGE[location.pathname] ??
    SUGGESTED_QUESTIONS;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Message hover actions (copy / edit / retry). copiedId briefly swaps the
  // copy icon for a checkmark on the copied message.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopyMessage = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      /* clipboard unavailable (permissions/insecure context) — do nothing */
    }
  };
  const handleEditMessage = (content: string) => {
    setInput(content);
    localInputRef.current?.focus();
  };
  const handleRetryMessage = (content: string) => {
    if (isLoading) return;
    void sendMessage(content);
  };

  // Shared icon-button look for the hover action rows.
  const msgActionBtn =
    'p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-default';

  // Hero composer (page variant, empty state): example prompts type
  // themselves out and delete while the box is empty, then the next one
  // starts (same idiom as the old Getting Started box). Static placeholder
  // for reduced-motion users.
  const heroTaRef = useRef<HTMLTextAreaElement>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [typed, setTyped] = useState('');
  const [typeIdx, setTypeIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (variant !== 'page' || reducedMotion) return;
    if (messages.length > 0 || input !== '') return;
    const full = HERO_PLACEHOLDERS[typeIdx % HERO_PLACEHOLDERS.length];
    let t: ReturnType<typeof setTimeout>;
    if (!deleting && typed === full) {
      t = setTimeout(() => setDeleting(true), 1500);
    } else if (deleting && typed === '') {
      setDeleting(false);
      setTypeIdx((i) => (i + 1) % HERO_PLACEHOLDERS.length);
    } else {
      t = setTimeout(() => {
        setTyped((prev) => (deleting ? full.slice(0, prev.length - 1) : full.slice(0, prev.length + 1)));
      }, deleting ? 30 : 55);
    }
    return () => clearTimeout(t);
  }, [variant, reducedMotion, messages.length, input, typed, deleting, typeIdx]);

  const fillFromTile = (prompt: string) => {
    setInput(prompt);
    heroTaRef.current?.focus();
  };

  // Chat history (page variant only — the panel manages its own sidebar).
  // Refetched on mount and when the active chat changes; the small delay
  // lets the backend finish writing the auto-generated title first.
  const { user } = useFirebaseAuth();
  const userTier = (user?.tier as 'free' | 'pro' | 'elite' | undefined) ?? 'free';
  const isPaidTier = userTier === 'pro' || userTier === 'elite';
  const {
    chatId,
    startNewChat,
    loadChat,
    isLoadingChat,
    clearChat,
  } = useScoutChatShared();
  const [chats, setChats] = useState<ScoutChatSummary[]>([]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const refreshChats = useCallback(async () => {
    if (!user?.uid) {
      setChats([]);
      return;
    }
    try {
      setChats(await listScoutChats(20));
    } catch {
      /* history list is best-effort on the page surface */
    }
  }, [user?.uid]);
  useEffect(() => {
    if (variant !== 'page') return;
    const t = setTimeout(() => {
      void refreshChats();
    }, chatId ? 1500 : 0);
    return () => clearTimeout(t);
  }, [variant, chatId, refreshChats]);

  const handleChatRowClick = useCallback(
    async (id: string) => {
      if (id === chatId) return;
      setActiveRowId(id);
      try {
        await loadChat(id);
      } finally {
        setActiveRowId(null);
      }
    },
    [chatId, loadChat],
  );

  // ------------------------------------------------------------------
  // Page hero: Scout home empty state (design 1a "Ability grid") —
  // headline, subhead, composer with rotating placeholder, capability grid.
  // ------------------------------------------------------------------
  if (variant === 'page' && messages.length === 0) {
    return (
      <div className="relative flex-1 overflow-y-auto">
        <style>{HERO_CSS}</style>

        {/* Design-system doodles in the margins (watermark weight). Hidden
            below lg where there is no margin to live in. */}
        <img
          src={DoodleBurstLeft}
          alt=""
          aria-hidden
          className="hidden lg:block"
          style={{
            position: 'absolute', top: 110, left: '4.5%',
            width: 90, height: 'auto', transform: 'rotate(-6deg)',
            opacity: 0.45, pointerEvents: 'none',
          }}
        />
        <img
          src={DoodleLoopArrow}
          alt=""
          aria-hidden
          className="hidden lg:block"
          style={{
            position: 'absolute', top: 330, right: '4.5%',
            width: 130, height: 'auto', transform: 'scaleX(-1) rotate(8deg)',
            opacity: 0.5, pointerEvents: 'none',
          }}
        />

        <div
          className="mx-auto flex w-full max-w-[900px] flex-col px-7 sm:px-16"
          style={{ paddingTop: 64, paddingBottom: 80, fontFamily: 'var(--font-body)' }}
        >
          {/* Headline + subhead — same serif treatment as PageTitle
              (Libre Baskerville, italic navy accent, scribble underline). */}
          <div className="mx-auto mb-[26px] flex max-w-[720px] flex-col items-center text-center" style={{ marginTop: 32 }}>
            <h1
              className="font-serif text-[44px] leading-[1.05] tracking-[-0.015em]"
              style={{ color: 'var(--ink)', margin: '0 0 12px' }}
            >
              What should we{' '}
              <em className="font-serif relative inline-block" style={{ fontStyle: 'italic', fontWeight: 400, color: '#003262' }}>
                work on
                <ScribbleUnderline />
              </em>{' '}
              today?
            </h1>
            <p style={{ font: "400 15px/1.6 var(--font-body, 'Inter', sans-serif)", color: 'var(--ink-2, #4A4F5B)', margin: 0, maxWidth: 560 }}>
              Tell Scout what you're after and it handles the busywork: finding the
              people, writing the outreach, and tracking every conversation, so you
              can focus on landing the offer.
            </p>
          </div>

          {/* Composer */}
          <div
            className="mx-auto flex w-full max-w-[760px] flex-col gap-3"
            style={{
              background: '#fff',
              border: '1px solid #E5E7EC',
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(26,26,26,0.06)',
              padding: '18px 18px 16px',
              marginBottom: 22,
            }}
          >
            <div className="relative">
              {/* Type-and-delete example overlay, only while the box is
                  empty. Reduced-motion users get a static placeholder. */}
              {!reducedMotion && input === '' && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0"
                  style={{ font: "400 17px/1.5 var(--font-body, 'Inter', sans-serif)", color: '#94A3B8', whiteSpace: 'pre-wrap' }}
                >
                  {typed}
                  <span className="sh-caret" />
                </div>
              )}
              <textarea
                ref={heroTaRef}
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={reducedMotion ? HERO_PLACEHOLDERS[0] : undefined}
                aria-label="Ask Scout"
                rows={2}
                disabled={isLoading}
                className="w-full resize-none bg-transparent outline-none"
                style={{ border: 'none', font: "400 17px/1.5 var(--font-body, 'Inter', sans-serif)", color: 'var(--ink, #0A0A0A)' }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span style={{ font: "400 13px var(--font-body, 'Inter', sans-serif)", color: '#94A3B8' }}>
                Pick a task below, or just start typing
              </span>
              <button
                type="button"
                className="sh-send"
                onClick={() => (isLoading ? stopGeneration() : sendMessage())}
                disabled={!isLoading && !input.trim()}
                aria-label={isLoading ? 'Stop response' : 'Send message'}
              >
                {isLoading ? <Square size={16} fill="currentColor" /> : <ArrowUp size={20} strokeWidth={1.8} />}
              </button>
            </div>
          </div>

          {/* "Scout can" divider + capability grid */}
          <div className="mx-auto w-full max-w-[900px]">
            <div className="mb-3.5 flex items-center gap-2.5">
              <span style={{ font: "600 12px var(--font-body, 'Inter', sans-serif)", letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent, #4A60A8)' }}>
                Scout can
              </span>
              <div style={{ flex: 1, height: 1, background: '#E5E7EC' }} />
            </div>
            <div className="sh-grid">
              {CAPABILITIES.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.title}
                    type="button"
                    className="sh-chip"
                    onClick={() => fillFromTile(c.prompt)}
                  >
                    <span className="sh-chip-ic">
                      <Icon size={20} strokeWidth={1.6} />
                    </span>
                    <span>
                      <span style={{ display: 'block', font: "600 14px var(--font-body, 'Inter', sans-serif)", color: 'var(--ink, #0A0A0A)' }}>
                        {c.title}
                      </span>
                      <span style={{ display: 'block', font: "400 12px var(--font-body, 'Inter', sans-serif)", color: '#64748B' }}>
                        {c.sub}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Recent chats — pick a past conversation back up from the
                landing without opening the side panel. */}
            {chats.length > 0 && (
              <div className="mx-auto mt-8 w-full max-w-[760px]">
                <div className="mb-3 flex items-center gap-2.5">
                  <span style={{ font: "600 12px var(--font-body, 'Inter', sans-serif)", letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent, #4A60A8)' }}>
                    Recent chats
                  </span>
                  <div style={{ flex: 1, height: 1, background: '#E5E7EC' }} />
                </div>
                <div
                  className="flex flex-col overflow-hidden"
                  style={{ background: '#fff', border: '1px solid #E5E7EC', borderRadius: 12 }}
                >
                  {chats.slice(0, 4).map((row) => (
                    <button
                      key={row.chat_id}
                      type="button"
                      onClick={() => void handleChatRowClick(row.chat_id)}
                      disabled={isLoadingChat}
                      className="flex items-center justify-between gap-3 border-t border-[#EFF0F3] px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-[#FAFBFF]"
                    >
                      <span className="min-w-0 flex-1 truncate" style={{ font: "500 13.5px var(--font-body, 'Inter', sans-serif)", color: 'var(--ink, #0A0A0A)' }}>
                        {row.title || 'New chat'}
                      </span>
                      <span className="flex-shrink-0" style={{ font: "400 12px var(--font-body, 'Inter', sans-serif)", color: '#94A3B8' }}>
                        {activeRowId === row.chat_id && isLoadingChat
                          ? 'Opening…'
                          : formatRelativeTime(row.last_active_at)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Thread layout (panel always; page once messages exist). The page
  // variant wraps the whole conversation in a white chat card so it reads
  // as a contained chat surface over the mountain backdrop.
  // ------------------------------------------------------------------
  const threadColumn = (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Persistent active-strategy card in the chat column header so step
          progress is always-on context while the user scrolls older
          messages. Hidden when there is no strategy yet. */}
      {activeStrategy && <ActiveStrategyCard strategy={activeStrategy} />}
      <div className="flex-1 overflow-y-auto">
        <div className={variant === 'page' ? 'px-6 py-5' : 'px-5 py-4'}>
          {/* Empty state (only the panel variant reaches here when empty) */}
          {messages.length === 0 && (
            <div className="flex flex-col">
              <div className="flex justify-center mb-6 pt-4">
                <div className="w-14 h-14 rounded-full bg-[#FFF7EA] flex items-center justify-center overflow-hidden">
                  <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                </div>
              </div>
              <div className="flex gap-3 mb-5">
                <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                  <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                </div>
                <div className="max-w-[85%]">
                  <div className="bg-gray-100 rounded-3xl rounded-bl-md px-4 py-2.5">
                    <p className="text-sm text-gray-900 leading-relaxed">
                      Need help finding people, companies, or something else?
                    </p>
                  </div>
                </div>
              </div>
              {/* Primary briefing CTA above the suggested chips. */}
              <div className="ml-10 mb-3">
                <BriefingButton
                  onClick={() => void requestBriefing()}
                  isLoading={isLoading}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
                {chips.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(question)}
                    className="text-left px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-[#3B82F6] hover:bg-[#FAFBFF]/50 text-sm text-gray-700 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
              {emptyStateExtra}
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((message) => {
                const showCard =
                  message.role === 'assistant' &&
                  message.tool === 'navigate' &&
                  !!message.navigate &&
                  decideNavAction(message.navigate, message.mode) === 'approve-card';
                const showModePill = message.role === 'assistant' && !!message.mode && !message.isStreaming;
                const liveEvents = (message.toolEvents || []).filter(e => !e.done);
                const doneEvents = (message.toolEvents || []).filter(e => e.done);
                // A streaming assistant turn with nothing to show yet would
                // render as a bare floating avatar; the "Thinking…"
                // indicator below covers that state instead.
                if (
                  message.role === 'assistant' &&
                  !message.content &&
                  liveEvents.length === 0 &&
                  doneEvents.length === 0 &&
                  !message.plan &&
                  !message.cta &&
                  !showCard
                ) {
                  return null;
                }
                return (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="flex gap-3 max-w-[85%] group">
                        <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                          <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {/* Mode receipt pill above the response */}
                          {showModePill && (
                            <div>
                              <ScoutModePill mode={message.mode!} />
                            </div>
                          )}
                          {/* Done tool pills - above the prose so the user
                              sees what Scout looked at before the answer. */}
                          {doneEvents.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {doneEvents.map(evt => (
                                <ScoutToolPill key={evt.id} event={evt} />
                              ))}
                            </div>
                          )}
                          {message.content && (
                            <div className="bg-gray-100 rounded-3xl rounded-bl-md px-4 py-2.5">
                              <div
                                className="text-sm text-gray-900 leading-relaxed [overflow-wrap:anywhere] break-words"
                                // Intercept clicks on chips marked
                                // data-scout-link so they route via
                                // react-router instead of a full page reload.
                                onClick={(e) => {
                                  const target = e.target as HTMLElement
                                  const link = target.closest('a[data-scout-link]') as HTMLAnchorElement | null
                                  if (!link) return
                                  const href = link.getAttribute('href') || ''
                                  if (!href.startsWith('/')) return
                                  e.preventDefault()
                                  handleInlineLink(href)
                                }}
                                dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                              />
                              {/* Inline coverage gauge on briefing messages.
                                  Self-hides above 90%. */}
                              {message.coverage && !message.isStreaming && (
                                <CompletenessGauge coverage={message.coverage} />
                              )}
                            </div>
                          )}
                          {/* Hover copy on finished assistant prose */}
                          {message.content && !message.isStreaming && (
                            <div className="flex items-center gap-0.5 -mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                type="button"
                                className={msgActionBtn}
                                onClick={() => handleCopyMessage(message.id, message.content)}
                                title="Copy"
                                aria-label="Copy message"
                              >
                                {copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}
                              </button>
                            </div>
                          )}
                          {/* Live tool pills (still running) - below the
                              prose so they animate without pushing earlier
                              content up. */}
                          {liveEvents.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {liveEvents.map(evt => (
                                <ScoutToolPill key={evt.id} event={evt} />
                              ))}
                            </div>
                          )}
                          {/* Plan checklist */}
                          {message.plan && (
                            <ScoutPlanChecklist
                              plan={message.plan}
                              onStepAction={handlePlanStep}
                            />
                          )}
                          {/* CTA chips - chip bridges, never paragraphed
                              prose. `ctas` (multi-chip turns, e.g. Inbox +
                              My Network after drafting) supersedes the
                              single `cta`. */}
                          {message.ctas && message.ctas.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-2">
                              {message.ctas.map((chip, i) => (
                                <ScoutCtaChip
                                  key={`${chip.route}-${i}`}
                                  cta={chip}
                                  onAction={handleCtaAction}
                                />
                              ))}
                            </div>
                          ) : message.cta ? (
                            <ScoutCtaChip
                              cta={message.cta}
                              onAction={handleCtaAction}
                            />
                          ) : null}
                          {showCard && message.navigate && (
                            <ScoutApproveCard
                              navigate={message.navigate}
                              resolved={resolvedIds.has(message.id)}
                              onApprove={(prefill) => handleApprove(message.id, message.navigate!, prefill)}
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[85%] group">
                        <div className="text-white rounded-3xl rounded-br-md px-4 py-2.5" style={{ background: 'var(--accent, #4A60A8)' }}>
                          <p className="text-sm leading-relaxed">{message.content}</p>
                        </div>
                        {/* Hover actions: retry / edit / copy (Claude-style) */}
                        <div className="flex items-center justify-end gap-0.5 mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            className={msgActionBtn}
                            onClick={() => handleRetryMessage(message.content)}
                            disabled={isLoading}
                            title="Retry"
                            aria-label="Send this message again"
                          >
                            <RotateCcw size={13} />
                          </button>
                          <button
                            type="button"
                            className={msgActionBtn}
                            onClick={() => handleEditMessage(message.content)}
                            title="Edit"
                            aria-label="Edit this message in the composer"
                          >
                            <PenLine size={13} />
                          </button>
                          <button
                            type="button"
                            className={msgActionBtn}
                            onClick={() => handleCopyMessage(message.id, message.content)}
                            title="Copy"
                            aria-label="Copy message"
                          >
                            {copiedId === message.id ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Minimal "thinking" dot while we wait for the very first
                  event of the turn so the thread does not feel frozen. */}
              {isLoading && !messages.some((m) => m.isStreaming && (m.content || (m.toolEvents && m.toolEvents.length > 0))) && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                    <img src={ScoutYetiHead} alt="" className="w-full h-full object-contain" />
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--brand-border)] bg-[var(--brand-bg-surface)] px-2.5 py-1 text-xs text-[var(--brand-ink-secondary)]">
                    <Loader2 className="h-3 w-3 animate-spin text-[var(--brand-blue)]" />
                    <span>Thinking…</span>
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div
        className="px-5 py-4 flex-shrink-0"
        style={variant === 'page' ? { borderTop: '1px solid #EFF0F3', background: '#fff' } : undefined}
      >
        {/* "Scout can" quick actions — the capability list stays reachable
            mid-conversation as a pill row; clicking pre-fills the composer. */}
        {variant === 'page' && (
          <div
            className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5"
            style={{ scrollbarWidth: 'none' }}
          >
            {CAPABILITIES.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.title}
                  type="button"
                  onClick={() => {
                    setInput(c.prompt);
                    localInputRef.current?.focus();
                  }}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-[#FAFBFF] hover:text-gray-800"
                  style={{ borderColor: '#E5E7EC' }}
                >
                  <Icon size={13} strokeWidth={1.7} style={{ color: 'var(--accent, #4A60A8)' }} />
                  {c.title}
                </button>
              );
            })}
          </div>
        )}
        <div className="relative">
          <input
            ref={localInputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Scout anything..."
            className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent,#4A60A8)] focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={() => (isLoading ? stopGeneration() : sendMessage())}
            disabled={!isLoading && !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white transition-colors"
            style={{ background: 'var(--accent, #4A60A8)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#3C4F8E')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent, #4A60A8)')}
            aria-label={isLoading ? 'Stop response' : 'Send message'}
          >
            {isLoading ? <Square className="h-4 w-4" fill="currentColor" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">Free to chat</p>
      </div>
    </div>
  );

  if (variant === 'page') {
    return (
      <div className="flex flex-1 min-h-0 overflow-hidden px-3 sm:px-6" style={{ paddingTop: 16, paddingBottom: 16 }}>
        {/* Chat card: the conversation lives in a contained surface over the
            mountain backdrop, mirroring the Ask Scout panel — header with
            new-chat/clear actions, chat-history rail, thread, composer. */}
        <div
          className="mx-auto flex w-full max-w-[1080px] min-h-0 flex-col overflow-hidden"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E5E7EC',
            borderRadius: 16,
            boxShadow: '0 4px 16px rgba(26,26,26,0.06)',
          }}
        >
          {/* Card header */}
          <div className="flex flex-shrink-0 items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #EFF0F3' }}>
            <span className="font-serif" style={{ fontSize: 17, color: 'var(--ink)' }}>Ask Scout</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startNewChat}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Start a new chat"
              >
                <MessageSquarePlus className="h-4 w-4" />
                New chat
              </button>
              <button
                type="button"
                onClick={clearChat}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Chat-history rail (hidden on small screens) */}
            <aside className="hidden w-48 flex-shrink-0 flex-col border-r border-gray-100 bg-white md:flex">
              <div className="flex items-center gap-1.5 px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                <History className="h-3.5 w-3.5" />
                <span>Chats</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {chats.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-gray-400">No chats yet.</div>
                ) : (
                  <ul className="space-y-0.5">
                    {chats.map((row) => {
                      const isActive = row.chat_id === chatId;
                      const isLoadingRow = activeRowId === row.chat_id && isLoadingChat;
                      return (
                        <li key={row.chat_id}>
                          <button
                            type="button"
                            onClick={() => void handleChatRowClick(row.chat_id)}
                            disabled={isLoadingRow}
                            className={
                              'w-full rounded-md px-2.5 py-2 text-left transition-colors ' +
                              (isActive
                                ? 'border border-[#E0EAFF] bg-[#FAFBFF]'
                                : 'border border-transparent hover:bg-gray-50')
                            }
                            title={row.title}
                          >
                            <div className="truncate text-xs font-medium text-gray-900">
                              {row.title || 'New chat'}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-gray-400">
                              {isLoadingRow ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <span>{formatRelativeTime(row.last_active_at)}</span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {!isPaidTier && (
                <div className="flex items-start gap-1.5 border-t border-gray-100 px-3 py-2.5 text-[11px] leading-snug text-gray-500">
                  <Lock className="mt-0.5 h-3 w-3 flex-shrink-0" />
                  <span>Upgrade to Pro to keep chat history beyond today.</span>
                </div>
              )}
            </aside>

            {/* Thread + composer */}
            {threadColumn}
          </div>
        </div>
      </div>
    );
  }

  return threadColumn;
}
