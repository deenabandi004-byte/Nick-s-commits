/**
 * ScoutSidePanel - ChatGPT-style slide-out side panel for Scout AI Assistant
 * 
 * Modern, clean interface with:
 * - Simplified text-only header
 * - Subtle Scout animation in content area
 * - Chat-style message bubbles
 * - Suggestion chips for recommended questions
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Send, Loader2, Trash2, Copy, ExternalLink, Mail, Check } from 'lucide-react';
import { useScout, SearchHelpResponse } from '@/contexts/ScoutContext';
import { useScoutChat, formatMessage, type ContactResult, type EmailPreview } from '@/hooks/useScoutChat';
import { SUGGESTED_QUESTIONS, SCOUT_CHIPS_BY_PAGE, getPageByRoute } from '@/data/scout-knowledge';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { toast } from '@/hooks/use-toast';
import ScoutWavingWhite from '@/assets/ScoutWavingWhite.mp4';

import { BACKEND_URL } from '@/services/api';

// Session storage key for auto-populate
const AUTO_POPULATE_KEY = 'scout_auto_populate';

const SCOUT_LOADING_MESSAGES: Record<string, string> = {
  contacts: "Searching your contacts…",
  email: "Drafting an email…",
  strategy: "Building a strategy…",
  general: "Thinking…",
  default: "On it…",
};

// Contact card component for search results
function ContactCard({ contact, onCopyEmail }: { contact: ContactResult; onCopyEmail: (email: string) => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!contact.email) return;
    navigator.clipboard.writeText(contact.email);
    setCopied(true);
    onCopyEmail(contact.email);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
          <p className="text-xs text-gray-500 truncate">
            {contact.job_title}{contact.job_title && contact.company ? ' at ' : ''}{contact.company}
          </p>
        </div>
        {contact.status && (
          <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            contact.status === 'active' ? 'bg-green-50 text-green-700' :
            contact.status === 'done' ? 'bg-blue-50 text-blue-700' :
            'bg-amber-50 text-amber-700'
          }`}>
            {contact.status.replace('_', ' ')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {contact.email && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            <span className="truncate max-w-[160px]">{contact.email}</span>
          </button>
        )}
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// Email preview component
function EmailPreviewCard({ preview, onCopy, onSearchInFind }: { preview: EmailPreview; onCopy: () => void; onSearchInFind: (company: string) => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = `Subject: ${preview.subject}\n\n${preview.body}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-600">Email Preview</span>
        {preview.recipient_name && (
          <span className="text-xs text-gray-400">to {preview.recipient_name}</span>
        )}
      </div>
      <div className="px-3 py-2 space-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Subject</p>
          <p className="text-sm text-gray-900">{preview.subject}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Body</p>
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{preview.body}</p>
        </div>
      </div>
      <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={() => onSearchInFind(preview.recipient_company)}
          className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          Search in Find
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
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
  
  // Use the shared chat hook with current page context
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
  
  // Fetch search help when context is provided
  useEffect(() => {
    if (isPanelOpen && searchHelpContext && !searchHelpResponse) {
      fetchSearchHelp();
    }
  }, [isPanelOpen, searchHelpContext, searchHelpResponse]);
  
  // Clean up search help context when panel closes
  useEffect(() => {
    if (!isPanelOpen) {
      // Clear search help after a delay to allow for animations
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
      // Get Firebase token
      const { auth } = await import('@/lib/firebase');
      const firebaseUser = auth.currentUser;
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      
      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/search-help`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          search_type: searchHelpContext.searchType,
          failed_search_params: searchHelpContext.failedSearchParams,
          error_type: searchHelpContext.errorType,
          user_info: {
            name: user?.name || 'there',
          },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data: SearchHelpResponse = await response.json();
      setSearchHelpResponse(data);
      
    } catch (error) {
      console.error('[Scout] Search help error:', error);
      // Set a fallback response
      setSearchHelpResponse({
        message: searchHelpContext.searchType === 'contact'
          ? "I couldn't find contacts matching your search. Try using different job titles or a broader location."
          : "I couldn't find firms matching your search. Try using different industry terms or a broader location.",
        suggestions: [],
        auto_populate: searchHelpContext.failedSearchParams,
        search_type: searchHelpContext.searchType,
        action: 'retry_search',
      });
    } finally {
      setIsLoadingSearchHelp(false);
    }
  };
  
  // Handle "Continue" button click for search help
  const handleContinue = () => {
    if (!searchHelpResponse) return;
    
    // Store auto-populate data in sessionStorage
    sessionStorage.setItem(AUTO_POPULATE_KEY, JSON.stringify({
      search_type: searchHelpResponse.search_type,
      auto_populate: searchHelpResponse.auto_populate,
    }));
    
    // Navigate to appropriate page
    const targetRoute = searchHelpResponse.search_type === 'contact' 
      ? '/find'
      : '/find?tab=companies';
    
    // Close panel and clear search help
    closePanel();
    
    // Navigate (if not already on the page)
    if (location.pathname !== targetRoute) {
      navigate(targetRoute);
    } else {
      // If already on the page, trigger a re-mount or event
      window.dispatchEvent(new CustomEvent('scout-auto-populate'));
    }
  };
  
  // Handle Escape key to close panel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPanelOpen) {
        closePanel();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPanelOpen, closePanel]);
  
  // Prevent body scrolling when panel is open
  useEffect(() => {
    if (isPanelOpen) {
      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore body scroll when panel closes
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isPanelOpen]);

  // Focus input when panel opens (only if not in search help mode)
  useEffect(() => {
    if (isPanelOpen && !searchHelpContext) {
      // Small delay to allow animation to start
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPanelOpen, inputRef, searchHelpContext]);

  // Auto-send a pending message (e.g. from briefing's "Ask Scout" chips).
  // Fires once when the panel opens with a pending message; cleared
  // immediately so subsequent panel opens don't replay the same prompt.
  useEffect(() => {
    if (!isPanelOpen || !pendingMessage) return;
    const msg = pendingMessage;
    clearPendingMessage();
    // Defer to next tick so the chat hook is fully wired before send.
    const t = setTimeout(() => {
      sendMessage(msg);
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanelOpen, pendingMessage]);
  
  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Handle suggestion click
  const handleSuggestionClick = (question: string) => {
    sendMessage(question);
  };
  
  // Handle navigation - navigate AND close panel
  const handleNavigate = (route: string, autoPopulate?: any) => {
    // Store auto-populate so Contact Search / Firm Search can pre-fill (sessionStorage + state)
    if (autoPopulate) {
      sessionStorage.setItem('scout_auto_populate', JSON.stringify(autoPopulate));
    }
    const pageName = getPageByRoute(route)?.name ?? 'that page';
    const isAlreadyOnPage = location.pathname === route || location.pathname === route.split('?')[0];
    if (isAlreadyOnPage && autoPopulate) {
      window.dispatchEvent(new CustomEvent('scout-auto-populate'));
    }
    navigate(route, { state: autoPopulate ? { scoutAutoPopulate: autoPopulate } : undefined });
    toast({
      title: `Taking you to ${pageName}`,
      description: "Let me know if you need help once you're there.",
    });
    closePanel();
  };
  
  // Handle clear chat
  const handleClearChat = () => {
    clearChat();
  };
  
  // Check if we're in search help mode
  const isSearchHelpMode = !!searchHelpContext;
  
  if (!isPanelOpen) return null;
  
  return (
    <>
      {/* Semi-transparent overlay - closes panel on click */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
        onClick={closePanel}
        aria-hidden="true"
      />
      
      {/* Side Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 h-full w-full sm:w-[420px] bg-white shadow-xl flex flex-col transform transition-transform duration-300 ease-out rounded-l-2xl"
        style={{
          animation: 'slideIn 0.3s ease-out forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Add keyframes for slide animation */}
        <style>{`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
            }
            to {
              transform: translateX(0);
            }
          }
        `}</style>
        
        {/* Header - Simplified, ChatGPT-style */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h1 className="text-base font-medium text-gray-900">Ask Scout</h1>
          
          <div className="flex items-center gap-1">
            {/* Clear chat button - only show in normal mode with messages */}
            {!isSearchHelpMode && messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            
            {/* Close button - subtle gray, no animation */}
            <button
              onClick={closePanel}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Help Mode */}
          {isSearchHelpMode && (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoadingSearchHelp ? (
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                  {/* Smaller Scout animation while loading */}
                  <div className="w-12 h-12 rounded-full bg-[#FFF7EA] flex items-center justify-center mb-4 overflow-hidden">
                    <video 
                      src={ScoutWavingWhite}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ transform: 'scale(1.05)' }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Analyzing your search...</span>
                  </div>
                </div>
              ) : searchHelpResponse ? (
                <div className="space-y-4">
                  {/* Scout message as chat bubble */}
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <video 
                        src={ScoutWavingWhite}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                        style={{ transform: 'scale(1.05)' }}
                      />
                    </div>
                    <div className="flex-1 max-w-[85%]">
                      <div className="bg-gray-100 rounded-[3px] rounded-tl-md px-4 py-3">
                        <p className="text-sm text-gray-900 leading-relaxed">
                          {searchHelpResponse.message}
                        </p>
                      </div>
                      
                      {/* Refined-prompt cards - preferred render path. Each card
                          is a one-click "try this instead" that fills the search
                          bar and auto-submits. Falls through to the legacy
                          suggestions list only when refined_prompts is absent. */}
                      {searchHelpResponse.refined_prompts && searchHelpResponse.refined_prompts.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {searchHelpResponse.refined_prompts.map((rp, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                // Hand the refined prompt off to ContactSearchPage
                                // via the same auto-populate channel used by the
                                // legacy Continue button. The page listens to
                                // 'scout-auto-populate' and reads sessionStorage.
                                try {
                                  sessionStorage.setItem(AUTO_POPULATE_KEY, JSON.stringify({
                                    search_type: 'contact',
                                    auto_populate: { prompt: rp.prompt, autoSubmit: true },
                                  }));
                                } catch {
                                  // Non-fatal - sessionStorage may be disabled.
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
                                <span className="text-sm text-gray-900 font-medium leading-snug">
                                  {rp.prompt}
                                </span>
                              </div>
                              {rp.rationale && (
                                <span className="text-xs text-gray-500 leading-snug pl-7">
                                  {rp.rationale}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        searchHelpResponse.suggestions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {searchHelpResponse.suggestions.map((suggestion, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 px-3 py-2 bg-[#FAFBFF] rounded-xl border border-[#EEF2F8]"
                              >
                                <span className="w-5 h-5 rounded-full bg-[rgba(59,130,246,0.10)] text-[#3B82F6] text-xs font-medium flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <span className="text-sm text-gray-800">{suggestion}</span>
                              </div>
                            ))}
                          </div>
                        )
                      )}

                      {/* Continue button - only meaningful for the legacy
                          structured path (refined_prompts cards self-execute on
                          click, so the Continue button would be redundant). */}
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
          
          {/* Normal Chat Mode */}
          {!isSearchHelpMode && (
            <>
              {/* Messages area */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-5 py-4">
                  {/* Empty state - Scout animation + first message + suggestions */}
                  {messages.length === 0 && (
                    <div className="flex flex-col">
                      {/* Scout animation - centered, smaller, decorative */}
                      <div className="flex justify-center mb-6 pt-4">
                        <div className="w-14 h-14 rounded-full bg-[#FFF7EA] flex items-center justify-center overflow-hidden">
                          <video 
                            src={ScoutWavingWhite}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                            style={{ transform: 'scale(1.05)' }}
                          />
                        </div>
                      </div>
                      
                      {/* Initial Scout message as chat bubble */}
                      <div className="flex gap-3 mb-5">
                        <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                          <video 
                            src={ScoutWavingWhite}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                            style={{ transform: 'scale(1.05)' }}
                          />
                        </div>
                        <div className="max-w-[85%]">
                          <div className="bg-gray-100 rounded-[3px] rounded-tl-md px-4 py-3">
                            <p className="text-sm text-gray-900 leading-relaxed">
                              Need help finding people, companies, or something else?
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Suggested questions - context-aware chips with fallback */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-10">
                        {(SCOUT_CHIPS_BY_PAGE[location.pathname] ?? SUGGESTED_QUESTIONS).map((question, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSuggestionClick(question)}
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
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {message.role === 'assistant' ? (
                            // Assistant message with avatar
                            <div className="flex gap-3 max-w-[85%]">
                              <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                                <video 
                                  src={ScoutWavingWhite}
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  className="w-full h-full object-cover"
                                  style={{ transform: 'scale(1.05)' }}
                                />
                              </div>
                              <div className="flex flex-col gap-2">
                                <div className="bg-gray-100 rounded-[3px] rounded-tl-md px-4 py-3">
                                  <div
                                    className="text-sm text-gray-900 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                                  />
                                </div>
                                
                                {/* Take me there button */}
                                {message.navigate_to && (
                                  <button
                                    onClick={() => handleNavigate(message.navigate_to!, message.auto_populate)}
                                    className="self-start px-4 py-2 rounded-xl bg-[#0F172A] text-white text-sm font-medium hover:bg-[#1E293B] transition-colors"
                                  >
                                    Take me there
                                  </button>
                                )}
                                
                                {/* Additional action buttons */}
                                {message.action_buttons && message.action_buttons.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {message.action_buttons.map((btn, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => handleNavigate(btn.route)}
                                        className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 transition-colors"
                                      >
                                        {btn.label}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* Contact search results */}
                                {message.contacts_results && message.contacts_results.length > 0 && (
                                  <div className="space-y-2">
                                    {message.contacts_results.map((contact, idx) => (
                                      <ContactCard
                                        key={idx}
                                        contact={contact}
                                        onCopyEmail={() => toast({ title: 'Email copied', description: 'Copied to clipboard' })}
                                      />
                                    ))}
                                    <button
                                      onClick={() => handleNavigate('/contact-directory')}
                                      className="w-full px-3 py-1.5 rounded-xl bg-gray-50 text-gray-600 text-xs hover:bg-gray-100 transition-colors border border-gray-200"
                                    >
                                      View all in Contacts
                                    </button>
                                  </div>
                                )}

                                {/* Email preview */}
                                {message.email_preview && (
                                  <EmailPreviewCard
                                    preview={message.email_preview}
                                    onCopy={() => toast({ title: 'Email copied', description: 'Subject and body copied to clipboard' })}
                                    onSearchInFind={(company) => {
                                      handleNavigate('/find', {
                                        search_type: 'contact',
                                        company,
                                        job_title: '',
                                        location: '',
                                      });
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                          ) : (
                            // User message - no avatar, right aligned
                            <div className="max-w-[85%]">
                              <div className="bg-[#0F172A] text-white rounded-[3px] rounded-tr-md px-4 py-3">
                                <p className="text-sm leading-relaxed">
                                  {message.content}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {/* Loading indicator - only show when loading AND no streaming content yet */}
                      {isLoading && !messages.some(m => m.isStreaming && m.content) && (
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#FFF7EA] flex-shrink-0 flex items-center justify-center overflow-hidden">
                            <video
                              src={ScoutWavingWhite}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                              style={{ transform: 'scale(1.05)' }}
                            />
                          </div>
                          <div className="bg-gray-100 rounded-[3px] rounded-tl-md px-4 py-3">
                            <div className="flex items-center gap-2 text-gray-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">{(() => {
                                const streamingMsg = messages.find(m => m.isStreaming);
                                const intent = streamingMsg?.intent || 'default';
                                return SCOUT_LOADING_MESSAGES[intent] || SCOUT_LOADING_MESSAGES.default;
                              })()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Scroll anchor */}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Input area - ChatGPT style */}
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
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                
                {/* Credits text - de-emphasized */}
                <p className="text-xs text-gray-400 text-center mt-2">
                  No credits used
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default ScoutSidePanel;
