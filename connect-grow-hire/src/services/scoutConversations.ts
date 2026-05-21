// src/services/scoutConversations.ts
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  setDoc,
  Timestamp,
  arrayUnion,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface ScoutMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp | { toDate: () => Date }; // Support both Firestore Timestamp and mock for display
  metadata?: {
    intent?: string; // URL_PARSE, JOB_SEARCH, etc.
    fields?: {
      job_title?: string;
      company?: string;
      location?: string;
      experience_level?: string;
    };
    jobListings?: Array<{
      id?: string;
      title: string;
      company: string;
      location?: string;
      url?: string;
      snippet?: string;
    }>;
    fitAnalysis?: {
      jobId: string;
      score: number;
      matchLevel: string;
      strengths: Array<{point: string; evidence: string}>;
      gaps: Array<{gap: string; mitigation: string}>;
      pitch: string;
      talkingPoints: string[];
      keywordsToUse: string[];
    };
  };
}

export interface ScoutConversation {
  id: string;
  title: string;
  createdAt: Timestamp | { toDate: () => Date };
  updatedAt: Timestamp | { toDate: () => Date };
  messageCount: number;
  lastMessage: string;
  messages: ScoutMessage[];
  metadata: {
    topics: string[];
    jobsDiscussed: string[];
    companiesDiscussed: string[];
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get conversations collection reference for a user
 */
const getConversationsRef = (uid: string) => 
  collection(db, 'users', uid, 'scoutConversations');

/**
 * Generate a simple title from the first message
 */
const generateTitleFromMessage = (message: string): string => {
  // Remove URLs
  const withoutUrls = message.replace(/https?:\/\/[^\s]+/g, '[Job Link]');
  
  // Truncate to first 50 chars
  const truncated = withoutUrls.slice(0, 50).trim();
  
  // Add ellipsis if truncated
  return truncated.length < withoutUrls.length 
    ? truncated + '...' 
    : truncated || 'New Conversation';
};

/**
 * Generate unique message ID
 */
const generateMessageId = (): string => {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Truncate message for preview
 */
const truncateMessage = (message: string, maxLength: number): string => {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength).trim() + '...';
};

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new conversation
 */
export const createConversation = async (
  uid: string, 
  firstMessage: string
): Promise<string> => {
  const conversationsRef = getConversationsRef(uid);
  
  const newConversation = {
    title: generateTitleFromMessage(firstMessage),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    messageCount: 0,
    lastMessage: '',
    messages: [],
    metadata: {
      topics: [],
      jobsDiscussed: [],
      companiesDiscussed: []
    }
  };
  
  const docRef = await addDoc(conversationsRef, newConversation);
  return docRef.id;
};

/**
 * Get all conversations for a user (sorted by most recent)
 */
export const getConversations = async (
  uid: string, 
  limitCount: number = 50
): Promise<ScoutConversation[]> => {
  const conversationsRef = getConversationsRef(uid);
  const q = query(
    conversationsRef, 
    orderBy('updatedAt', 'desc'), 
    limit(limitCount)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as ScoutConversation));
};

/**
 * Get a single conversation with all messages
 */
export const getConversation = async (
  uid: string, 
  conversationId: string
): Promise<ScoutConversation | null> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) return null;
  
  return {
    id: snapshot.id,
    ...snapshot.data()
  } as ScoutConversation;
};

/**
 * Add a message to a conversation
 */
export const addMessage = async (
  uid: string,
  conversationId: string,
  message: Omit<ScoutMessage, 'id' | 'timestamp'>
): Promise<void> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  
  const newMessage: ScoutMessage = {
    ...message,
    id: generateMessageId(),
    timestamp: Timestamp.now()
  };
  
  await updateDoc(docRef, {
    messages: arrayUnion(newMessage),
    updatedAt: serverTimestamp(),
    messageCount: increment(1),
    lastMessage: truncateMessage(message.content, 100)
  });
};

/**
 * Add both user and assistant messages (common pattern)
 */
export const addMessagePair = async (
  uid: string,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
  assistantMetadata?: ScoutMessage['metadata']
): Promise<void> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  const now = Timestamp.now();
  
  const userMsg: ScoutMessage = {
    id: generateMessageId(),
    role: 'user',
    content: userMessage,
    timestamp: now
  };
  
  const assistantMsg: ScoutMessage = {
    id: generateMessageId(),
    role: 'assistant',
    content: assistantMessage,
    timestamp: Timestamp.fromMillis(now.toMillis() + 1),
    metadata: assistantMetadata
  };
  
  await updateDoc(docRef, {
    messages: arrayUnion(userMsg, assistantMsg),
    updatedAt: serverTimestamp(),
    messageCount: increment(2),
    lastMessage: truncateMessage(assistantMessage, 100)
  });
};

/**
 * Update conversation title
 */
export const updateConversationTitle = async (
  uid: string,
  conversationId: string,
  title: string
): Promise<void> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  await updateDoc(docRef, { 
    title: title.trim(),
    updatedAt: serverTimestamp()
  });
};

/**
 * Delete a conversation
 */
export const deleteConversation = async (
  uid: string,
  conversationId: string
): Promise<void> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  await deleteDoc(docRef);
};

/**
 * Update conversation metadata (topics, jobs, companies)
 */
export const updateConversationMetadata = async (
  uid: string,
  conversationId: string,
  metadata: Partial<ScoutConversation['metadata']>
): Promise<void> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  
  const updates: any = {
    updatedAt: serverTimestamp()
  };
  
  if (metadata.topics) {
    updates['metadata.topics'] = arrayUnion(...metadata.topics);
  }
  if (metadata.jobsDiscussed) {
    updates['metadata.jobsDiscussed'] = arrayUnion(...metadata.jobsDiscussed);
  }
  if (metadata.companiesDiscussed) {
    updates['metadata.companiesDiscussed'] = arrayUnion(...metadata.companiesDiscussed);
  }
  
  await updateDoc(docRef, updates);
};

/**
 * Generate a better title using GPT (optional - can be called after conversation starts)
 * This would call the backend API to generate a title
 */
export const generateConversationTitle = async (
  conversationId: string,
  messages: ScoutMessage[]
): Promise<string> => {
  // This would call a backend endpoint to generate title
  // For now, return a simple title based on first few messages
  if (messages.length === 0) return 'New Conversation';

  const firstMessages = messages.slice(0, 3).map(m => m.content).join(' ');
  return generateTitleFromMessage(firstMessages);
};

// ============================================================================
// ACTIVE THREAD - single rolling conversation per user
// ============================================================================
//
// useScoutChat persists the user's chat to a fixed-ID document at
// users/{uid}/scoutConversations/active. We use a fixed ID (not auto-gen)
// because there's only ever one "current" thread; the absence of multi-thread
// UI means we don't need a list of conversations, just a place to durably
// store the last N messages so the panel rehydrates on reload / new tab /
// new device.
//
// The doc is overwritten with the full message array on each save (rather
// than arrayUnion-appended) so optimistic local edits, deletes, and clears
// stay in sync without merge gymnastics.

const ACTIVE_CONVERSATION_ID = 'active';
const ACTIVE_MAX_MESSAGES = 60;

/** Lightweight shape - we don't need ScoutMessage's metadata-heavy fields
 *  for the side panel's chat thread persistence. */
export interface PersistedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestampMs: number;
}

export interface ActiveThreadDoc {
  messages: PersistedChatMessage[];
  updatedAt: any;
}

const activeRef = (uid: string) =>
  doc(db, 'users', uid, 'scoutConversations', ACTIVE_CONVERSATION_ID);

export const loadActiveThread = async (
  uid: string,
): Promise<PersistedChatMessage[]> => {
  try {
    const snap = await getDoc(activeRef(uid));
    if (!snap.exists()) return [];
    const data = snap.data() as ActiveThreadDoc;
    const msgs = Array.isArray(data?.messages) ? data.messages : [];
    return msgs.slice(-ACTIVE_MAX_MESSAGES);
  } catch (e) {
    console.error('[Scout] loadActiveThread failed:', e);
    return [];
  }
};

export const saveActiveThread = async (
  uid: string,
  messages: PersistedChatMessage[],
): Promise<void> => {
  try {
    const trimmed = messages.slice(-ACTIVE_MAX_MESSAGES);
    await setDoc(activeRef(uid), {
      messages: trimmed,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('[Scout] saveActiveThread failed:', e);
  }
};

export const clearActiveThread = async (uid: string): Promise<void> => {
  try {
    await setDoc(activeRef(uid), {
      messages: [],
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('[Scout] clearActiveThread failed:', e);
  }
};
