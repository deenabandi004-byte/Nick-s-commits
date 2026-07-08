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
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowUp,
  Briefcase,
  Building2,
  FileText,
  KanbanSquare,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Target,
  UserSearch,
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
// Eight capability tiles that pre-fill the composer; tiles 1-2 are the lead
// capabilities and get the orange icon-chip treatment.
// ---------------------------------------------------------------------------
type Capability = {
  icon: LucideIcon;
  title: string;
  sub: string;
  prompt: string;
  lead?: boolean;
};

const CAPABILITIES: Capability[] = [
  { icon: Briefcase, title: 'Apply to jobs', sub: 'Find roles that fit & apply', prompt: 'Find software roles I should apply to this week', lead: true },
  { icon: UserSearch, title: 'Find people at companies', sub: 'Names + verified emails', prompt: 'Find 10 people at Stripe I could email', lead: true },
  { icon: Target, title: 'Reach the hiring manager', sub: 'Find who owns the role', prompt: "Who's the hiring manager for this role?" },
  { icon: Building2, title: 'Research companies', sub: 'Know them before you reach out', prompt: 'Give me a briefing on McKinsey before I reach out' },
  { icon: MessageSquare, title: 'Prep for meetings', sub: 'Walk in confident', prompt: 'Prep me for my coffee chat with a Bain consultant' },
  { icon: FileText, title: 'Write a cover letter', sub: 'Personalized in seconds', prompt: 'Write a cover letter for this job posting' },
  { icon: Sparkles, title: 'Tailor your resume', sub: 'Match any job description', prompt: 'Tailor my resume to this job description' },
  { icon: KanbanSquare, title: 'Track everything', sub: 'Contacts & conversations', prompt: 'Show me what’s waiting on me right now' },
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
.sh-send:disabled{opacity:.5;cursor:not-allowed}
.sh-chip{display:flex;align-items:center;gap:12px;padding:13px 15px;background:#fff;border:1px solid #E5E7EC;border-radius:12px;cursor:pointer;text-align:left;transition:transform .2s cubic-bezier(0.16,1,0.3,1),box-shadow .2s,border-color .2s}
.sh-chip:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(26,26,26,.06);border-color:var(--primary-200,#B6C3E8)}
.sh-chip-ic{flex:none;width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:#fff;border:1px solid rgba(15,37,69,0.08);color:var(--accent,#4A60A8)}
.sh-chip.lead .sh-chip-ic{color:#C9652C}
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
            width: 130, height: 'auto', transform: 'rotate(6deg)',
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
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp size={20} strokeWidth={1.8} />}
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
                    className={'sh-chip' + (c.lead ? ' lead' : '')}
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
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Thread layout (panel always; page once messages exist)
  // ------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Persistent active-strategy card in the chat column header so step
          progress is always-on context while the user scrolls older
          messages. Hidden when there is no strategy yet. */}
      {activeStrategy && <ActiveStrategyCard strategy={activeStrategy} />}
      <div className="flex-1 overflow-y-auto">
        <div className={variant === 'page' ? 'mx-auto w-full max-w-[760px] px-5 py-6' : 'px-5 py-4'}>
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
                return (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="flex gap-3 max-w-[85%]">
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
                          {/* CTA chip - single bridge, never paragraphed
                              prose. */}
                          {message.cta && (
                            <ScoutCtaChip
                              cta={message.cta}
                              onAction={handleCtaAction}
                            />
                          )}
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
                      <div className="max-w-[85%]">
                        <div className="bg-[var(--brand-blue)] text-white rounded-3xl rounded-br-md px-4 py-2.5">
                          <p className="text-sm leading-relaxed">{message.content}</p>
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
      <div className={variant === 'page' ? 'mx-auto w-full max-w-[760px] px-5 py-4 flex-shrink-0' : 'px-5 py-4 flex-shrink-0'}>
        <div className="relative">
          <input
            ref={localInputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Scout anything..."
            className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white bg-[#0F172A] hover:bg-[#1E293B] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">Free to chat</p>
      </div>
    </div>
  );
}
