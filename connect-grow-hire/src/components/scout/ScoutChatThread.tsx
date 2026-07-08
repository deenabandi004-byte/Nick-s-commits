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
import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp, Loader2, Send } from 'lucide-react';
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
import ScoutYetiHead from '@/assets/scouts/scout-yeti-head.png';

interface ScoutChatThreadProps {
  variant: 'panel' | 'page';
  /** Rendered under the empty-state chips. The panel passes the
   *  tried-and-failed hint. */
  emptyStateExtra?: React.ReactNode;
}

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

  // ------------------------------------------------------------------
  // Page hero: Lovable-style empty state (heading + big box + chips)
  // ------------------------------------------------------------------
  if (variant === 'page' && messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-auto flex w-full max-w-[760px] flex-col px-5"
          style={{ paddingTop: '12vh', paddingBottom: 48 }}
        >
          <h1
            className="mb-6 text-center text-3xl sm:text-4xl"
            style={{ fontFamily: "var(--font-display, 'Instrument Serif', Georgia, serif)", fontWeight: 400 }}
          >
            What can Scout do for you?
          </h1>
          <div
            className="relative w-full bg-white"
            style={{
              border: '1px solid var(--brand-border)',
              borderRadius: 12,
              padding: '14px 16px',
              minHeight: 120,
              boxShadow: '0 4px 20px rgba(15,23,42,0.06)',
            }}
          >
            <textarea
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Scout anything - find people, research companies, build a plan..."
              aria-label="Ask Scout"
              rows={2}
              disabled={isLoading}
              className="w-full resize-none bg-transparent outline-none"
              style={{ border: 'none', fontSize: 14, lineHeight: 1.5, color: 'var(--brand-ink)', paddingRight: 44, minHeight: 72 }}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
              style={{
                position: 'absolute', right: 12, bottom: 12,
                width: 34, height: 34, borderRadius: '50%',
                background: 'var(--accent, #4A60A8)', color: '#fff', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background .25s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-blue, #3B82F6)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent, #4A60A8)')}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          <div className="mt-4 flex justify-center">
            <BriefingButton onClick={() => void requestBriefing()} isLoading={isLoading} />
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
