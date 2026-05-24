/**
 * Scout chat persistence (Phase 5 Stage 3).
 *
 * Thin client for the persisted Scout chat collection. Backend owns the
 * write path (every chat turn appends its own messages via the assistant
 * endpoint), so this service is read-only: list the sidebar, load a chat
 * for resume. Everything is best-effort: a transport failure returns an
 * empty result so the panel can show "Could not load history" without
 * dragging the rest of Scout down.
 */
import { BACKEND_URL } from '@/services/api';

export interface ScoutChatSummary {
  chat_id: string;
  title: string;
  created_at: string | null;
  last_active_at: string | null;
  message_count: number;
  active_strategy_id: string | null;
  tier_when_created: 'free' | 'pro' | 'elite';
  expires_at: string | null;
}

export interface ScoutPersistedMessage {
  message_id: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls: Array<Record<string, any>> | null;
  tool_results: Array<Record<string, any>> | null;
  created_at: string | null;
  metrics: Record<string, any> | null;
}

export interface ScoutChatDetail {
  chat: ScoutChatSummary | null;
  messages: ScoutPersistedMessage[];
}

async function getFirebaseToken(): Promise<string | null> {
  try {
    const { auth } = await import('@/lib/firebase');
    const firebaseUser = auth.currentUser;
    return firebaseUser ? await firebaseUser.getIdToken() : null;
  } catch {
    return null;
  }
}

export async function listScoutChats(limit = 20): Promise<ScoutChatSummary[]> {
  const token = await getFirebaseToken();
  if (!token) return [];
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/scout-assistant/chats?limit=${limit}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.chats) ? data.chats : [];
  } catch (e) {
    console.error('[Scout] listScoutChats failed:', e);
    return [];
  }
}

export async function getScoutChat(chatId: string): Promise<ScoutChatDetail> {
  const empty: ScoutChatDetail = { chat: null, messages: [] };
  const id = (chatId || '').trim();
  if (!id) return empty;
  const token = await getFirebaseToken();
  if (!token) return empty;
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/scout-assistant/chats/${encodeURIComponent(id)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) return empty;
    const data = await res.json();
    return {
      chat: (data?.chat as ScoutChatSummary | null) ?? null,
      messages: Array.isArray(data?.messages) ? (data.messages as ScoutPersistedMessage[]) : [],
    };
  } catch (e) {
    console.error('[Scout] getScoutChat failed:', e);
    return empty;
  }
}

/**
 * Format an ISO timestamp as a compact relative time ("2h ago", "yesterday",
 * "3d ago"). Returns the date as a fallback for anything older than a week.
 */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffMs = Date.now() - ts;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(ts).toLocaleDateString();
}
