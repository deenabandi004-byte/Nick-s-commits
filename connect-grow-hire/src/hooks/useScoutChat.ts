/**
 * useScoutChat - Custom hook for Scout chat functionality
 *
 * Shared logic between ScoutPage and ScoutSidePanel.
 * Supports streaming (SSE via POST) with fallback to non-streaming.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { BACKEND_URL } from '@/services/api';
import { clearActiveThread } from '@/services/scoutConversations';

// Key an earlier build used to persist the chat thread to localStorage. Scout
// no longer saves chat history; this is referenced only to clear stale data.
const LEGACY_LOCAL_CACHE_KEY = 'scout_chat_messages_v2';

// Build a compact `user_memory` block to ship with every chat call so Scout
// has session-scoped context (recent searches, prompts the user has tried
// and failed). Lives in localStorage; we centralize the read here so both
// streaming and fallback paths use the same shape.
function readUserMemoryFromLocalStorage(): Record<string, unknown> {
  const memory: Record<string, unknown> = {};
  try {
    const tried = JSON.parse(
      localStorage.getItem('ofl_tried_prompts') || '{}',
    ) as Record<string, number>;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const triedList = Object.entries(tried)
      .filter(([, ts]) => ts >= cutoff)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([p]) => p);
    if (triedList.length) memory.tried_prompts_24h = triedList;
  } catch {}
  try {
    const recent = JSON.parse(
      localStorage.getItem('ofl_recent_searches') || '[]',
    ) as Array<{ prompt: string; results: number; ts: number }>;
    if (Array.isArray(recent) && recent.length) {
      memory.recent_searches = recent.slice(0, 10);
    }
  } catch {}
  try {
    const thinPairs = JSON.parse(
      localStorage.getItem('ofl_thin_pairs') || '{}',
    ) as Record<string, number>;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const pairList = Object.entries(thinPairs)
      .filter(([, ts]) => ts >= cutoff)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([k]) => k);
    if (pairList.length) memory.known_thin_school_company_pairs = pairList;
  } catch {}
  // Briefing snapshot - set by MorningBriefing when the briefing data lands.
  // Lets Scout answer "what should I do today" with concrete reference to
  // outstanding items even when the user is talking from a different page.
  try {
    const briefingRaw = localStorage.getItem('ofl_briefing_snapshot');
    if (briefingRaw) {
      const snap = JSON.parse(briefingRaw);
      const ageMs = Date.now() - (snap?.ts || 0);
      // Snapshot is fresh for 6 hours - beyond that we don't trust it.
      if (ageMs < 6 * 60 * 60 * 1000 && snap?.data) {
        memory.briefing_snapshot = snap.data;
      }
    }
  } catch {}
  return memory;
}

// Types

/** The navigate tool's payload - everything the approve flow needs, computed
 *  by the backend so the frontend does not need the page registry. */
export interface ScoutNavigate {
  route: string;
  prefill: Record<string, string>;
  reasoning: string;
  confidence: number;
  user_was_imperative: boolean;
  credit_spending: boolean;
  credit_cost: number | null;
  missing_required: string[];
  already_on_page: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // Which tool Scout chose this turn. 'answer' and 'clarify' render as plain
  // chat text; 'navigate' drives the approve flow via the `navigate` payload.
  tool?: 'navigate' | 'answer' | 'clarify' | null;
  navigate?: ScoutNavigate | null;
  // Set once the user approves or skips a navigate, so the approve card renders
  // collapsed and the auto-navigate effect does not re-fire.
  approveResolved?: boolean;
  timestamp: Date;
  isStreaming?: boolean;
  intent?: string | null;
  // Live-session-only message from a failed send (the user's message and/or an
  // "unreachable" notice). Rendered in the thread but never persisted and never
  // sent to the model as history, so a failed turn leaves no orphaned,
  // reply-less message at the top of the thread on reload.
  transient?: boolean;
}

export interface UseScoutChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  sendMessage: (messageText?: string) => Promise<void>;
  clearChat: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
}

/**
 * Custom hook for Scout chat functionality
 * @param currentPageOverride - Optional override for current page (useful for side panel)
 */
export function useScoutChat(currentPageOverride?: string): UseScoutChatReturn {
  const location = useLocation();
  const { user } = useFirebaseAuth();

  // Determine current page - use override if provided, otherwise use location
  const currentPage = currentPageOverride || location.pathname;

  // Chat state. Scout does not persist chat history: the thread lives only in
  // memory for the current page session. Navigating between pages keeps it
  // (the panel is mounted once, app-wide); a full reload starts fresh.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // One-time cleanup of chat history saved by an earlier build. Scout no longer
  // persists conversations, so wipe the legacy local cache and the Firestore
  // active-thread doc rather than ever reading them back.
  const didCleanupRef = useRef(false);
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_LOCAL_CACHE_KEY);
    } catch {}
    if (!user?.uid || didCleanupRef.current) return;
    didCleanupRef.current = true;
    void clearActiveThread(user.uid);
  }, [user?.uid]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear chat - the thread is in-memory only, so this just resets state.
  const clearChat = useCallback(() => {
    setMessages([]);
    inputRef.current?.focus();
  }, []);

  // Get Firebase token helper
  const getToken = async (): Promise<string | null> => {
    const { auth } = await import('@/lib/firebase');
    const firebaseUser = auth.currentUser;
    return firebaseUser ? await firebaseUser.getIdToken() : null;
  };

  // Build request payload. Slices conversation history to the last 6 turns
  // (the previous behavior) AND includes a `user_memory` block so Scout has
  // context that lives outside the active chat - recent searches, prompts the
  // user already tried and bombed on, school×company combinations PDL has
  // already failed at. This is the substrate that lets Scout "remember" the
  // user across sessions without retraining.
  const buildPayload = (text: string, currentMessages: ChatMessage[]) => {
    // Exclude transient messages (a failed turn): they are not real
    // conversation turns and must not be replayed to the model as history.
    const conversationHistory = currentMessages
      .filter(msg => !msg.transient)
      .slice(-6)
      .map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

    return {
      message: text,
      conversation_history: conversationHistory,
      current_page: currentPage,
      user_info: {
        name: user?.name || 'there',
        tier: user?.tier || 'free',
        credits: user?.credits || 0,
        max_credits: user?.maxCredits || 300,
      },
      user_memory: readUserMemoryFromLocalStorage(),
    };
  };

  // Streaming send via SSE POST
  const sendMessageStreaming = async (text: string, _userMessage: ChatMessage, currentMessages: ChatMessage[]): Promise<boolean> => {
    const token = await getToken();
    const payload = buildPayload(text, currentMessages);

    const assistantId = `assistant-${Date.now()}`;

    // Create placeholder assistant message
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        // Remove placeholder and signal fallback
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        return false;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      // Set once the backend sends a terminal SSE event (done or error). A
      // stream that connects but ends without one delivered nothing usable.
      let receivedTerminal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (eventType === 'intent') {
                // Update the placeholder with intent for contextual loading
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, intent: data.intent } : m
                ));
              } else if (eventType === 'token') {
                accumulatedText += data.text;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: accumulatedText, isStreaming: true } : m
                ));
              } else if (eventType === 'done') {
                // Final update with the structured tool response.
                receivedTerminal = true;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? {
                    ...m,
                    content: data.message || accumulatedText,
                    tool: data.tool || 'answer',
                    navigate: data.navigate || null,
                    isStreaming: false,
                    intent: null,
                  } : m
                ));
              } else if (eventType === 'error') {
                // The backend reached us and reported an error: that is a
                // delivered response (we show its text), not a transport
                // failure, so it does not trigger the fallback.
                receivedTerminal = true;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? {
                    ...m,
                    content: data.message || "Something went wrong. Try again!",
                    isStreaming: false,
                    intent: null,
                  } : m
                ));
              }
            } catch {
              // Ignore malformed JSON
            }
            eventType = ''; // Reset for next event
          }
        }
      }

      // Ensure streaming flag is cleared
      setMessages(prev => prev.map(m =>
        m.id === assistantId && m.isStreaming ? { ...m, isStreaming: false, intent: null } : m
      ));

      // A stream that connected but produced no terminal event and no text is
      // not a real delivery (e.g. the connection dropped mid-flight). Drop the
      // empty placeholder so the caller can fall back or surface an error.
      const delivered = receivedTerminal || accumulatedText.trim().length > 0;
      if (!delivered) {
        setMessages(prev => prev.filter(m => m.id !== assistantId));
      }
      return delivered;
    } catch (error) {
      console.error('[Scout] Streaming error:', error);
      // Remove placeholder and signal fallback
      setMessages(prev => prev.filter(m => m.id !== assistantId));
      return false;
    }
  };

  // Non-streaming fallback. Returns true only when a real response was
  // rendered; on any transport or HTTP failure it returns false so the caller
  // can surface an explicit error instead of failing silently.
  const sendMessageFallback = async (text: string, currentMessages: ChatMessage[]): Promise<boolean> => {
    try {
      const token = await getToken();
      const payload = buildPayload(text, currentMessages);

      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[Scout] Fallback API returned ${response.status}`);
        return false;
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message || "I'm not sure how to help with that. Could you rephrase?",
        tool: data.tool || 'answer',
        navigate: data.navigate || null,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      return true;
    } catch (error) {
      console.error('[Scout] Fallback error:', error);
      return false;
    }
  };

  // Send message - tries streaming first, falls back to non-streaming. When
  // BOTH transport paths fail (e.g. the backend is unreachable), the user must
  // see an explicit error: never leave them looking at stale thread content as
  // if it were a fresh reply.
  const sendMessage = useCallback(async (messageText?: string) => {
    const text = (messageText || input).trim();
    if (!text || isLoading) return;

    // Clear input immediately
    setInput('');

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    let delivered = false;
    try {
      const currentMessages = [...messages, userMessage];

      // Try streaming first, then the non-streaming endpoint.
      delivered = await sendMessageStreaming(text, userMessage, currentMessages);
      if (!delivered) {
        console.log('[Scout] Streaming failed, falling back to non-streaming');
        delivered = await sendMessageFallback(text, currentMessages);
      }
    } catch (error) {
      console.error('[Scout] Error:', error);
      delivered = false;
    } finally {
      if (!delivered) {
        // Both paths failed (e.g. backend unreachable). The whole turn is
        // transient: keep the user's message and an explicit error visible for
        // this session, but persist neither, so a failed turn never leaves an
        // orphaned, reply-less message at the top of the thread on reload. Also
        // drop any optimistic assistant placeholder the stream left behind.
        setMessages(prev => [
          ...prev
            .filter(
              m => !(m.role === 'assistant' && (m.isStreaming || m.content.trim() === '')),
            )
            .map(m => (m.id === userMessage.id ? { ...m, transient: true } : m)),
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'Scout is unreachable right now. Try again in a moment.',
            timestamp: new Date(),
            transient: true,
          },
        ]);
      }
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages, currentPage, user]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    messagesEndRef,
    inputRef,
  };
}

/**
 * Format message content (handle markdown-like formatting).
 * HTML-escapes first to prevent XSS, then applies safe formatting.
 */
export function formatMessage(content: string): string {
  // Escape HTML entities BEFORE inserting any HTML tags
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}
