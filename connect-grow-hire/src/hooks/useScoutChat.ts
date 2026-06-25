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
import {
  getScoutChat,
  type ScoutPersistedMessage,
} from '@/services/scoutChats';

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
  /** When true, the destination page populates the form AND fires its
   *  primary action automatically once the prefill lands. Scout sets this
   *  for complete queries on pages that opt in via the page registry
   *  (auto_submit_supported flag). The backend silently zeroes this for
   *  pages that have not opted in, so it is always safe to forward. */
  auto_submit: boolean;
  credit_spending: boolean;
  credit_cost: number | null;
  missing_required: string[];
  already_on_page: boolean;
}

/** The Haiku intent classifier output (Change 7). Stamped on every turn so
 *  the UI can render the mode pill and the panel can route skip-approve vs
 *  approve-card based on intent rather than the model's self-rated confidence.
 *  Mode falls back to 'chat' on classifier failure. */
export type ScoutMode = 'chat' | 'plan' | 'do' | 'clarify';

export interface ScoutIntent {
  intent: ScoutMode;
  confidence: number;
  missing_fields: string[];
  reason: string;
}

/** End-of-message CTA chip (Change 6). The single bridge from a chat answer
 *  to a runnable Offerloop workflow. Never paired with prose like "want
 *  me to..." - the chip is the entire bridge. */
export interface ScoutCta {
  label: string;
  route: string;
  prefill: Record<string, string>;
  credit_spending: boolean;
  credit_cost: number | null;
}

/** A multi-step plan rendered inline as a checklist (Change 5). Produced when
 *  Scout's save_strategy helper fires; the strategy is persisted separately
 *  but this view is what shows up in the conversation. */
export interface ScoutPlanStep {
  index: number;
  title: string;
  detail?: string | null;
  route?: string | null;
  done: boolean;
}

export interface ScoutPlan {
  strategy_id?: string | null;
  goal: string;
  steps: ScoutPlanStep[];
}

/** Profile coverage report from the strategist briefing's `done` event
 *  (Phase 3B). Drives the completeness gauge UI and the gap-callout chips. */
export interface ScoutCoverage {
  coverage_pct: number;
  present_groups: string[];
  gap_groups: string[];
  has_critical_gap: boolean;
  should_hide_gauge: boolean;
  should_pivot_briefing: boolean;
}

/** One step inside a persisted strategy. Mirrors the D2 stored schema with
 *  the additive E2 fields (rationale, prefill_payload, completed_at, etc.). */
export interface ScoutActiveStrategyStep {
  title: string;
  detail?: string;
  rationale?: string;
  feature?: string;
  route?: string | null;
  prefill_payload?: Record<string, string>;
  done: boolean;
  completed_at?: string | null;
  created_artifact_id?: string | null;
}

/** The user's currently-active multi-step strategy. Carried inside the
 *  briefing `done` event so the active-strategy card in the panel header
 *  can render with one round-trip. Null when the user has no strategy yet. */
export interface ScoutActiveStrategy {
  id: string;
  goal: string;
  steps: ScoutActiveStrategyStep[];
  created_at?: string | null;
  updated_at?: string | null;
}

/** Live tool-call pill (Change 1). One entry per helper-tool invocation in
 *  the turn. While running it renders as a pulsing pill with `label`; on
 *  completion it collapses to a chip showing `summary`, expandable to the
 *  raw result. */
export interface ScoutToolEvent {
  id: string;
  name: string;
  label: string;
  summary?: string;
  result?: unknown;
  done: boolean;
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
  // New fields surfaced by the unified Scout interaction model (May 2026).
  mode?: ScoutMode | null;
  intentDetail?: ScoutIntent | null;
  cta?: ScoutCta | null;
  plan?: ScoutPlan | null;
  toolEvents?: ScoutToolEvent[];
  // Strategist briefing payload (Phase 3B). Set on briefing-* messages only.
  coverage?: ScoutCoverage | null;
  activeStrategy?: ScoutActiveStrategy | null;
}

export interface UseScoutChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  sendMessage: (messageText?: string) => Promise<void>;
  /** Trigger a strategist briefing (Phase 3B). Posts to /briefing/stream,
   *  streams the response into a new assistant message. Returns true when a
   *  terminal SSE event ('done' or 'error') was received. The "Get my game
   *  plan" button calls this; auto-fire on first-chat-open does too. */
  requestBriefing: () => Promise<boolean>;
  clearChat: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  // Phase 5 Stage 3: persisted chat thread surface.
  chatId: string | null;
  startNewChat: () => void;
  loadChat: (chatId: string) => Promise<void>;
  isLoadingChat: boolean;
  /** Push a synthetic assistant message into the chat without a backend
   *  round trip. Used for "the workflow just completed" follow-ups (e.g.
   *  the contact search returned 5 results, post a celebration with a
   *  chip back to the network). Local-only: not persisted to Firestore,
   *  so it disappears on reload of the chat. That is intentional - the
   *  message is contextual to the just-completed action and stale
   *  afterwards. */
  appendSyntheticAssistant: (
    content: string,
    extras?: { mode?: ScoutMode; cta?: ScoutCta | null },
  ) => void;
  /** Tour demo orchestration — local addition, not in loops-setup-v2.
   *  Mirror of appendSyntheticAssistant for the user side. Used only by the
   *  onboarding tour's seeded Scout demo to push a synthetic user turn. */
  appendSyntheticUser: (content: string) => void;
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

  // Chat state. Phase 5 Stage 3: the thread is persisted in Firestore (every
  // turn round-trips through the backend, which appends to
  // users/{uid}/scoutChats/{chatId}/messages). Local state is the in-memory
  // view of the active thread; `chatId` keys us to the persisted doc so each
  // outbound request reaches the same chat and so the sidebar can swap
  // threads in place. A full reload starts a new chat unless the sidebar
  // loads one.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  // Track the chat we're currently loading so a slow response from an earlier
  // click does not overwrite a later one if the user opens two chats quickly.
  const loadingChatTargetRef = useRef<string | null>(null);

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

  // Clear chat -- starts a fresh thread. The next send creates a new
  // persisted chat in Firestore; the previous one stays in the sidebar.
  const clearChat = useCallback(() => {
    setMessages([]);
    setChatId(null);
    inputRef.current?.focus();
  }, []);

  const startNewChat = clearChat;

  /** Load a persisted chat into the panel. Fetches the parent doc + messages
   *  from the backend, hydrates them into ChatMessage shape, and swaps. Safe
   *  to call mid-typing; the typed input is preserved. */
  const loadChat = useCallback(async (targetChatId: string) => {
    const id = (targetChatId || '').trim();
    if (!id) return;
    setIsLoadingChat(true);
    loadingChatTargetRef.current = id;
    try {
      const detail = await getScoutChat(id);
      // If a newer loadChat call started while this one was in flight, drop
      // the stale result so the latest click wins.
      if (loadingChatTargetRef.current !== id) return;
      const hydrated: ChatMessage[] = (detail.messages || []).map((m: ScoutPersistedMessage) => {
        // The terminal-tool args were stamped on the assistant turn so we
        // can rebuild the navigate card on resume. The shape mirrors what
        // _persist_assistant_turn writes on the backend.
        const terminal = Array.isArray(m.tool_calls)
          ? [...m.tool_calls].reverse().find((t) => {
              const name = (t as any)?.name;
              return name === 'navigate' || name === 'answer' || name === 'clarify';
            })
          : null;
        const navigate = terminal && (terminal as any).navigate ? ((terminal as any).navigate as ScoutNavigate) : null;
        const tool = terminal ? ((terminal as any).name as ChatMessage['tool']) : (m.role === 'assistant' ? 'answer' : null);
        return {
          id: m.message_id,
          role: m.role,
          content: m.content,
          tool,
          navigate,
          // A resumed navigate is already history: never auto-execute it.
          approveResolved: tool === 'navigate' ? true : undefined,
          timestamp: m.created_at ? new Date(m.created_at) : new Date(),
        };
      });
      setMessages(hydrated);
      setChatId(id);
    } finally {
      if (loadingChatTargetRef.current === id) {
        loadingChatTargetRef.current = null;
      }
      setIsLoadingChat(false);
      // Focus the input so the user can continue typing immediately.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
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
      chat_id: chatId,
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
              } else if (eventType === 'mode') {
                // Mode receipt pill (Change 7): the Haiku classifier output,
                // emitted before the final response so the pill appears
                // ahead of the prose and gives the user an immediate read
                // on how Scout is going to handle the turn.
                const m = (data?.mode as ScoutMode) || 'chat';
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantId ? {
                    ...msg,
                    mode: m,
                    intentDetail: {
                      intent: m,
                      confidence: typeof data?.confidence === 'number' ? data.confidence : 0,
                      missing_fields: [],
                      reason: typeof data?.reason === 'string' ? data.reason : '',
                    },
                  } : msg
                ));
              } else if (eventType === 'tool_start') {
                // Live tool-call narration (Change 1): start a pill the moment
                // we know the tool name.
                const evt: ScoutToolEvent = {
                  id: typeof data?.id === 'string' ? data.id : `tool-${Date.now()}`,
                  name: typeof data?.name === 'string' ? data.name : 'tool',
                  label: typeof data?.label === 'string' ? data.label : 'Working',
                  done: false,
                };
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantId ? {
                    ...msg,
                    toolEvents: [...(msg.toolEvents || []), evt],
                  } : msg
                ));
              } else if (eventType === 'tool_end') {
                // Collapse the matching pill to its result chip.
                const id = typeof data?.id === 'string' ? data.id : '';
                const name = typeof data?.name === 'string' ? data.name : '';
                const summary = typeof data?.summary === 'string' ? data.summary : '';
                setMessages(prev => prev.map(msg => {
                  if (msg.id !== assistantId) return msg;
                  const events = (msg.toolEvents || []).map(e => {
                    const matches = id ? e.id === id : (!e.done && e.name === name);
                    return matches ? { ...e, summary, done: true } : e;
                  });
                  return { ...msg, toolEvents: events };
                }));
              } else if (eventType === 'token') {
                accumulatedText += data.text;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: accumulatedText, isStreaming: true } : m
                ));
              } else if (eventType === 'done') {
                // Final update with the structured tool response. The backend
                // also returns chat_id; we capture it so subsequent sends
                // ride the same persisted chat (and so the sidebar can
                // refresh with the new title once it generates).
                receivedTerminal = true;
                if (typeof data.chat_id === 'string' && data.chat_id) {
                  setChatId(data.chat_id);
                }
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? {
                    ...m,
                    content: data.message || accumulatedText,
                    tool: data.tool || 'answer',
                    navigate: data.navigate || null,
                    isStreaming: false,
                    intent: null,
                    // Mode may have been delivered ahead by the 'mode' event;
                    // fall back to whatever the done payload carries.
                    mode: (data.mode as ScoutMode) || m.mode || 'chat',
                    intentDetail: data.intent || m.intentDetail || null,
                    cta: data.cta || null,
                    plan: data.plan || null,
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
              } else if (eventType === 'heartbeat') {
                // Backend keepalive while the LLM is generating. No-op: just
                // consume the event so the connection stays warm past the 60s
                // browser/proxy SSE idle cutoff. Real timeout is 120s of true
                // silence (the backend declares it for us).
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
      if (typeof data?.chat_id === 'string' && data.chat_id) {
        setChatId(data.chat_id);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message || "I'm not sure how to help with that. Could you rephrase?",
        tool: data.tool || 'answer',
        navigate: data.navigate || null,
        timestamp: new Date(),
        mode: (data.mode as ScoutMode) || 'chat',
        intentDetail: data.intent || null,
        cta: data.cta || null,
        plan: data.plan || null,
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
  }, [input, isLoading, messages, currentPage, user, chatId]);

  /** Push a synthetic assistant message into the chat (local-only).
   *  Useful for "the workflow you started just finished" follow-ups: a
   *  Scout-driven contact search completes, the page dispatches
   *  SCOUT_SEARCH_COMPLETED_EVENT, ScoutSidePanel calls this to drop a
   *  celebration message with a chip back to the network. */
  const appendSyntheticAssistant = useCallback((
    content: string,
    extras?: { mode?: ScoutMode; cta?: ScoutCta | null },
  ) => {
    const trimmed = (content || '').trim();
    if (!trimmed) return;
    setMessages(prev => [
      ...prev,
      {
        id: `synthetic-${Date.now()}`,
        role: 'assistant',
        content: trimmed,
        timestamp: new Date(),
        mode: extras?.mode ?? 'chat',
        cta: extras?.cta ?? null,
      },
    ]);
  }, []);

  // Tour demo orchestration — local addition, not in loops-setup-v2.
  // Mirror of appendSyntheticAssistant for the user side. Used by the
  // onboarding tour to seed a synthetic user turn in the Scout demo.
  const appendSyntheticUser = useCallback((content: string) => {
    const trimmed = (content || '').trim();
    if (!trimmed) return;
    setMessages(prev => [
      ...prev,
      {
        id: `synthetic-user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Strategist briefing (Phase 3B endpoint). Posts to /briefing/stream and
  // streams the prose back as it generates. Bypasses Haiku and the chat
  // history entirely - this is a fresh, profile-grounded plan, not a turn
  // in an ongoing conversation. The UI in Phase 4B wires this to the
  // "Get my game plan" button and the auto-fire on first-chat-open.
  const requestBriefing = useCallback(async (): Promise<boolean> => {
    if (isLoading) return false;
    setIsLoading(true);

    const token = await getToken();
    const assistantId = `briefing-${Date.now()}`;

    // Placeholder assistant message with isStreaming=true so the UI can show
    // a skeleton + "Scout is putting together your plan..." pill. Same
    // shape as the chat-stream placeholder so message rendering is shared.
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      intent: 'briefing',
    }]);

    try {
      const response = await fetch(`${BACKEND_URL}/api/scout-assistant/briefing/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        // Briefing payload is intentionally minimal: the backend reads user
        // context from Firestore. Tier is the only thing we forward so the
        // strategist prompt can cite the right contact-per-search cap
        // without an extra Firestore round-trip on the backend.
        body: JSON.stringify({
          user_info: {
            tier: user?.tier || 'free',
            subscriptionTier: user?.tier || 'free',
          },
          current_page: currentPage,
        }),
      });

      if (!response.ok || !response.body) {
        setMessages(prev => prev.map(m => m.id === assistantId ? {
          ...m,
          content: "I couldn't put together your plan right now. Try again in a moment.",
          isStreaming: false,
          intent: null,
        } : m));
        return false;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let receivedTerminal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === 'token') {
                accumulatedText += data.text || '';
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: accumulatedText, isStreaming: true }
                    : m
                ));
              } else if (eventType === 'done') {
                receivedTerminal = true;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? {
                    ...m,
                    content: data.message || accumulatedText,
                    isStreaming: false,
                    intent: null,
                    // Briefing payload extras (Phase 3B): gauge + strategy
                    // card render straight off the message object so the UI
                    // doesn't need a separate context fetch.
                    coverage: (data.coverage as ScoutCoverage) || null,
                    activeStrategy: (data.active_strategy as ScoutActiveStrategy) || null,
                  } : m
                ));
              } else if (eventType === 'error') {
                receivedTerminal = true;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? {
                    ...m,
                    content: data.message || 'Briefing failed - try again.',
                    isStreaming: false,
                    intent: null,
                  } : m
                ));
              } else if (eventType === 'heartbeat') {
                // No-op: keeps the SSE connection warm past the 60s idle cap.
              }
            } catch {
              // Skip malformed frames.
            }
            eventType = '';
          }
        }
      }

      if (!receivedTerminal) {
        // Stream closed without a terminal event: most likely a transport
        // hiccup. Show an explicit error rather than an empty bubble.
        setMessages(prev => prev.map(m => m.id === assistantId ? {
          ...m,
          content: accumulatedText || "I couldn't finish your plan. Try again.",
          isStreaming: false,
          intent: null,
        } : m));
        return false;
      }
      return true;
    } catch (error) {
      console.error('[Scout] requestBriefing error:', error);
      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        content: "I couldn't reach the briefing service. Check your connection and try again.",
        isStreaming: false,
        intent: null,
      } : m));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, user, currentPage]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    messagesEndRef,
    inputRef,
    chatId,
    startNewChat,
    loadChat,
    isLoadingChat,
    appendSyntheticAssistant,
    appendSyntheticUser,
    requestBriefing,
  };
}

/**
 * Format message content (handle markdown-like formatting).
 * HTML-escapes first to prevent XSS, then applies safe formatting.
 *
 * Supports:
 *   **bold**
 *   [link text](url)  — internal /relative-paths render as styled chips so
 *     the strategist briefing's deep-link CTAs land as readable buttons
 *     instead of URL-encoded blobs in prose. External (http/https) URLs
 *     open in a new tab; internal links get an `data-scout-link` attribute
 *     so the panel can intercept the click and route via react-router
 *     instead of triggering a full page reload.
 *   \n -> <br />
 */
export function formatMessage(content: string): string {
  // Escape HTML entities BEFORE inserting any HTML tags
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Markdown links: [text](url). We have already HTML-escaped the content,
  // so & in URLs is `&amp;`; un-escape it inside the href so the URL still
  // works when the user clicks (React Router params depend on real `&`).
  // The URL group allows whitespace because the strategist prompt emits
  // briefs with raw spaces (e.g. `?brief=8 USC alumni at Stripe`); we
  // encodeURI the captured href so the resulting <a href> is a valid URL.
  const withLinks = escaped.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_full, text, href) => {
      const realHref = encodeURI(href.replace(/&amp;/g, '&').trim())
      const isExternal = /^https?:\/\//i.test(realHref)
      const attrs = isExternal
        ? `href="${realHref}" target="_blank" rel="noopener noreferrer"`
        : `href="${realHref}" data-scout-link="1"`
      return (
        `<a ${attrs} class="inline-flex items-center gap-1 px-3 py-1.5 mt-1 mb-1 rounded-full ` +
        `bg-[var(--brand-blue)] text-white text-xs font-medium no-underline hover:bg-[#2563EB] ` +
        `transition-colors">${text}</a>`
      )
    },
  )

  return withLinks
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}
