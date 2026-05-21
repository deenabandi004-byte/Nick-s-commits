/**
 * ScoutSidePanel - slide-out panel for the Scout assistant.
 *
 * Renders two modes:
 *  - Chat: Scout answers each turn with one tool (navigate / answer / clarify).
 *    A navigate is run through the three-rule decision (skip-approve, approve
 *    card, or in-place populate) and carried to the destination page via the
 *    route-keyed scoutBridge.
 *  - Search help: failed-search recovery, unchanged, on its own legacy channel.
 *
 * Mounted once in App.tsx as a sibling of the route switch, so it persists
 * across navigation. The conversation lives in useScoutChat (localStorage +
 * Firestore backed); the open/closed flag lives in ScoutContext.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Send, Loader2, Trash2 } from 'lucide-react';
import { useScout, SearchHelpResponse } from '@/contexts/ScoutContext';
import { useScoutChat, formatMessage, type ScoutNavigate } from '@/hooks/useScoutChat';
import { SUGGESTED_QUESTIONS, SCOUT_CHIPS_BY_PAGE } from '@/data/scout-knowledge';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { toast } from '@/hooks/use-toast';
import { ScoutApproveCard } from '@/components/ScoutApproveCard';
import { writeScoutPrefill, SCOUT_PREFILL_EVENT } from '@/lib/scoutBridge';
import ScoutWavingWhite from '@/assets/ScoutWavingWhite.mp4';
import { BACKEND_URL } from '@/services/api';

// Legacy sessionStorage key. Still used only by the failed-search recovery
// flow below; the Scout chat navigate path uses scoutBridge instead.
const AUTO_POPULATE_KEY = 'scout_auto_populate';

const SCOUT_LOADING_MESSAGES: Record<string, string> = {
  contacts: 'Searching your contacts...',
  email: 'Drafting an email...',
  strategy: 'Building a strategy...',
  general: 'Thinking...',
  default: 'On it...',
};

// ---------------------------------------------------------------------------
// Three-rule decision for a navigate tool call.
// ---------------------------------------------------------------------------
type NavAction = 'in-place' | 'skip-approve' | 'approve-card';

/**
 * Decide what to do with a navigate proposal:
 *  - in-place    : user is already on the destination; fill fields, no nav.
 *  - skip-approve: explicit command, high confidence, no credit spend; just go.
 *  - approve-card: everything else (inferred, mid-confidence, or paid page).
 */
function decideNavAction(nav: ScoutNavigate): NavAction {
  if (nav.already_on_page) return 'in-place';
  if (nav.user_was_imperative && nav.confidence >= 0.9 && !nav.credit_spending) {
    return 'skip-approve';
  }
  return 'approve-card';
}

function summarizePrefill(prefill: Record<string, string>): string {
  const vals = Object.values(prefill || {}).filter(Boolean);
  return vals.join(', ');
}

export function ScoutSidePanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useFirebaseAuth();
  const {
    isPanelOpen,
    closePanel,
    searchHelpContext,
    searchHelpResponse,
    setSearchHelpResponse,
    clearSearchHelp,
    pendingMessage,
    clearPendingMessage,
  } = useScout();
  const panelRef = useRef<HTMLDivElement>(null);
  const [isLoadingSearchHelp, setIsLoadingSearchHelp] = useState(false);

  // Navigate messages that have been acted on (approved, skipped, or
  // populated in place), so the auto-execute effect does not re-fire and the
  // approve card renders collapsed. Lives in component state, which persists
  // because the panel never unmounts.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    messagesEndRef,
    inputRef,
  } = useScoutChat(location.pathname);

  // -------------------------------------------------------------------------
  // Navigate execution + the auto-execute effect
  // -------------------------------------------------------------------------

  /** Carry a navigate to its destination: write the bridge, then either
   *  navigate or (if in place) tell the current page to re-read the bridge. */
  const runNavigate = (nav: ScoutNavigate, prefill: Record<string, string>, action: NavAction) => {
    writeScoutPrefill(nav.route, prefill);
    const summary = summarizePrefill(prefill);
    if (action === 'in-place') {
      window.dispatchEvent(new CustomEvent(SCOUT_PREFILL_EVENT));
      toast({
        title: 'Scout filled in the search',
        description: summary || undefined,
      });
    } else {
      navigate(nav.route);
      toast({
        title: `Scout took you to ${nav.route}`,
        description: summary || undefined,
      });
    }
  };

  // Auto-run the navigates that need no card: in-place populate and
  // skip-approve. Fires once per navigate message; approve-card navigates wait
  // for the user to click Approve on the card.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.isStreaming) return;
    if (last.tool !== 'navigate' || !last.navigate) return;
    if (resolvedIds.has(last.id)) return;
    const action = decideNavAction(last.navigate);
    if (action === 'approve-card') return;
    setResolvedIds((prev) => new Set(prev).add(last.id));
    runNavigate(last.navigate, last.navigate.prefill, action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, resolvedIds]);

  /** Approve-card click: the user OK'd (and maybe edited) the prefill. */
  const handleApprove = (id: string, nav: ScoutNavigate, prefill: Record<string, string>) => {
    setResolvedIds((prev) => new Set(prev).add(id));
    runNavigate(nav, prefill, 'skip-approve'); // a card is only shown for a real nav
  };

  // -------------------------------------------------------------------------
  // Search help (failed-search recovery) - unchanged, legacy channel
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isPanelOpen && searchHelpContext && !searchHelpResponse) {
      fetchSearchHelp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOpen, searchHelpContext, searchHelpResponse]);

  useEffect(() => {
    if (!isPanelOpen) {
      const timer = setTimeout(() => {
        clearSearchHelp();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isPanelOpen, clearSearchHelp]);

  const fetchSearchHelp = async () => {
    if (!searchHelpContext) return;
    setIsLoadingSearchHelp(true);
    try {
      const { auth } = await import('@/lib/firebase');
      const firebaseUser = auth.currentUser;
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;

      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/search-help`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          search_type: searchHelpContext.searchType,
          failed_search_params: searchHelpContext.failedSearchParams,
          error_type: searchHelpContext.errorType,
          user_info: { name: user?.name || 'there' },
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data: SearchHelpResponse = await response.json();
      setSearchHelpResponse(data);
    } catch (error) {
      console.error('[Scout] Search help error:', error);
      setSearchHelpResponse({
        message:
          searchHelpContext.searchType === 'contact'
            ? "I couldn't find contacts matching your search. Try different job titles or a broader location."
            : "I couldn't find firms matching your search. Try different industry terms or a broader location.",
        suggestions: [],
        auto_populate: searchHelpContext.failedSearchParams,
        search_type: searchHelpContext.searchType,
        action: 'retry_search',
      });
    } finally {
      setIsLoadingSearchHelp(false);
    }
  };

  const handleContinue = () => {
    if (!searchHelpResponse) return;
    sessionStorage.setItem(
      AUTO_POPULATE_KEY,
      JSON.stringify({
        search_type: searchHelpResponse.search_type,
        auto_populate: searchHelpResponse.auto_populate,
      }),
    );
    const targetRoute = searchHelpResponse.search_type === 'contact' ? '/find' : '/find?tab=companies';
    closePanel();
    if (location.pathname !== targetRoute) {
      navigate(targetRoute);
    } else {
      window.dispatchEvent(new CustomEvent('scout-auto-populate'));
    }
  };

  // -------------------------------------------------------------------------
  // Panel chrome
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPanelOpen) closePanel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPanelOpen, closePanel]);

  useEffect(() => {
    if (isPanelOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isPanelOpen]);

  useEffect(() => {
    if (isPanelOpen && !searchHelpContext) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isPanelOpen, inputRef, searchHelpContext]);

  // Auto-send a pending message (e.g. from briefing's "Ask Scout" chips).
  useEffect(() => {
    if (!isPanelOpen || !pendingMessage) return;
    const msg = pendingMessage;
    clearPendingMessage();
    const t = setTimeout(() => sendMessage(msg), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOpen, pendingMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isSearchHelpMode = !!searchHelpContext;

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Overlay - closes panel on click */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-white shadow-xl flex flex-col transform transition-transform duration-300 ease-out rounded-l-2xl"
        style={{ animation: 'slideIn 0.3s ease-out forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h1 className="text-base font-medium text-gray-900">Ask Scout</h1>
          <div className="flex items-center gap-1">
            {!isSearchHelpMode && messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={closePanel}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search help mode */}
          {isSearchHelpMode && (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoadingSearchHelp ? (
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                  <div className="w-12 h-12 rounded-full bg-[#FFF7EA] flex items-center justify-center mb-4 overflow-hidden">
                    <video src={ScoutWavingWhite} autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ transform: 'scale(1.05)' }} />
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Analyzing your search...</span>
                  </div>
                </div>
              ) : searchHelpResponse ? (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <video src={ScoutWavingWhite} autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ transform: 'scale(1.05)' }} />
                    </div>
                    <div className="flex-1 max-w-[85%]">
                      <div className="bg-gray-100 rounded-[3px] rounded-tl-md px-4 py-3">
                        <p className="text-sm text-gray-900 leading-relaxed">{searchHelpResponse.message}</p>
                      </div>

                      {searchHelpResponse.refined_prompts && searchHelpResponse.refined_prompts.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {searchHelpResponse.refined_prompts.map((rp, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                try {
                                  sessionStorage.setItem(
                                    AUTO_POPULATE_KEY,
                                    JSON.stringify({
                                      search_type: 'contact',
                                      auto_populate: { prompt: rp.prompt, autoSubmit: true },
                                    }),
                                  );
                                } catch {
                                  /* sessionStorage may be disabled - non-fatal */
                                }
                                closePanel();
                                if (location.pathname !== '/find') {
                                  navigate('/find');
                                } else {
                                  window.dispatchEvent(new CustomEvent('scout-auto-populate'));
                                }
                              }}
                              className="w-full text-left flex flex-col gap-1.5 px-3.5 py-3 bg-white rounded-xl border border-[#EEF2F8] hover:border-[#3B82F6] hover:bg-[#FAFBFF] transition-colors"
                            >
                              <div className="flex items-start gap-2">
                                <span className="w-5 h-5 rounded-full bg-[rgba(59,130,246,0.10)] text-[#3B82F6] text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <span className="text-sm text-gray-900 font-medium leading-snug">{rp.prompt}</span>
                              </div>
                              {rp.rationale && (
                                <span className="text-xs text-gray-500 leading-snug pl-7">{rp.rationale}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        searchHelpResponse.suggestions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {searchHelpResponse.suggestions.map((suggestion, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-[#FAFBFF] rounded-xl border border-[#EEF2F8]">
                                <span className="w-5 h-5 rounded-full bg-[rgba(59,130,246,0.10)] text-[#3B82F6] text-xs font-medium flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <span className="text-sm text-gray-800">{suggestion}</span>
                              </div>
                            ))}
                          </div>
                        )
                      )}

                      {(!searchHelpResponse.refined_prompts || searchHelpResponse.refined_prompts.length === 0) && (
                        <div className="mt-4">
                          <button
                            onClick={handleContinue}
                            className="px-4 py-2 rounded-xl bg-[#0F172A] text-white text-sm font-medium hover:bg-[#1E293B] transition-colors"
                          >
                            Continue
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Chat mode */}
          {!isSearchHelpMode && (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="px-5 py-4">
                  {/* Empty state */}
                  {messages.length === 0 && (
                    <div className="flex flex-col">
                      <div className="flex justify-center mb-6 pt-4">
                        <div className="w-14 h-14 rounded-full bg-[#FFF7EA] flex items-center justify-center overflow-hidden">
                          <video src={ScoutWavingWhite} autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ transform: 'scale(1.05)' }} />
                        </div>
                      </div>
                      <div className="flex gap-3 mb-5">
                        <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                          <video src={ScoutWavingWhite} autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ transform: 'scale(1.05)' }} />
                        </div>
                        <div className="max-w-[85%]">
                          <div className="bg-gray-100 rounded-[3px] rounded-tl-md px-4 py-3">
                            <p className="text-sm text-gray-900 leading-relaxed">
                              Need help finding people, companies, or something else?
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
                        {(SCOUT_CHIPS_BY_PAGE[location.pathname] ?? SUGGESTED_QUESTIONS).map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => sendMessage(question)}
                            className="text-left px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-[#3B82F6] hover:bg-[#FAFBFF]/50 text-sm text-gray-700 transition-colors"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
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
                          decideNavAction(message.navigate) === 'approve-card';
                        return (
                          <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {message.role === 'assistant' ? (
                              <div className="flex gap-3 max-w-[85%]">
                                <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                                  <video src={ScoutWavingWhite} autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ transform: 'scale(1.05)' }} />
                                </div>
                                <div className="flex flex-col gap-1">
                                  {message.content && (
                                    <div className="bg-gray-100 rounded-[3px] rounded-tl-md px-4 py-3">
                                      <div
                                        className="text-sm text-gray-900 leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                                      />
                                    </div>
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
                                <div className="bg-[#0F172A] text-white rounded-[3px] rounded-tr-md px-4 py-3">
                                  <p className="text-sm leading-relaxed">{message.content}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Loading indicator */}
                      {isLoading && !messages.some((m) => m.isStreaming && m.content) && (
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                            <video src={ScoutWavingWhite} autoPlay loop muted playsInline className="w-full h-full object-cover" style={{ transform: 'scale(1.05)' }} />
                          </div>
                          <div className="bg-gray-100 rounded-[3px] rounded-tl-md px-4 py-3">
                            <div className="flex items-center gap-2 text-gray-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">
                                {(() => {
                                  const streamingMsg = messages.find((m) => m.isStreaming);
                                  const intent = streamingMsg?.intent || 'default';
                                  return SCOUT_LOADING_MESSAGES[intent] || SCOUT_LOADING_MESSAGES.default;
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </div>

              {/* Input */}
              <div className="px-5 py-4 flex-shrink-0">
                <div className="relative">
                  <input
                    ref={inputRef}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default ScoutSidePanel;
