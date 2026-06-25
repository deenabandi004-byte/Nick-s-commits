# Scout Conversations Feature - Comprehensive Cursor Prompt

## Overview

Implement a ChatGPT/Claude-style persistent conversation system for Scout, Offerloop's AI-powered job search assistant. Users should be able to:
- View a list of past Scout conversations
- Continue any previous conversation
- Start new conversations
- See auto-generated titles for each conversation
- Have full conversation history sent to the backend for context

---

## Current Architecture

### Backend Structure
```
backend/
├── app/
│   ├── routes/
│   │   └── scout.py              # API endpoints
│   └── services/
│       └── scout_service.py      # Core business logic
```

### Frontend Structure
```
connect-grow-hire/src/components/
├── ScoutChatbot.tsx              # Main chat interface
├── ScoutBubble.tsx               # Floating bubble (Contact Search page)
├── ScoutHeaderButton.tsx         # Header button (Contact Search page)
├── ScoutFirmAssistant.tsx        # Firm search assistant chat
└── ScoutFirmAssistantButton.tsx  # Firm assistant button (Firm Search page)
```

### Current ScoutChatbot State
```typescript
// Current state in ScoutChatbot.tsx
const [messages, setMessages] = useState<Message[]>([]);
const [input, setInput] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [context, setContext] = useState<any>({});
const [jobAnalyses, setJobAnalyses] = useState<Record<string, any>>({});
const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
```

### Current API Endpoints
- `POST /api/scout/chat` - Main chat endpoint
- `POST /api/scout/analyze-job` - Analyze job fit
- `POST /api/scout/firm-assist` - Firm search assistance
- `GET /api/scout/health` - Health check

### Current Chat Request/Response
```typescript
// Request to /api/scout/chat
{
  "message": "user's message or URL",
  "context": {
    "user_resume": {...},
    "recent_topics": [...],
    "history": [...]  // Currently just recent messages, not persisted
  }
}

// Response from /api/scout/chat
{
  "status": "ok" | "needs_input" | "error",
  "message": "Scout's response",
  "fields": {
    "job_title": "...",
    "company": "...",
    "location": "...",
    "experience_level": "..."
  },
  "job_listings": [...],
  "intent": "URL_PARSE" | "JOB_SEARCH" | "FIELD_HELP" | "RESEARCH" | "CONVERSATION",
  "context": {...}
}
```

---

## Implementation Plan

### Phase 1: Firestore Schema & Data Layer

#### 1.1 Firestore Collection Structure

Create a new subcollection under users for Scout conversations:

```
users/{uid}/scoutConversations/{conversationId}
```

#### 1.2 Data Models

**Conversation Document:**
```typescript
interface ScoutConversation {
  id: string;                    // Firestore document ID
  title: string;                 // Auto-generated or user-edited title
  createdAt: Timestamp;          // When conversation started
  updatedAt: Timestamp;          // Last message timestamp
  messageCount: number;          // Total messages in conversation
  lastMessage: string;           // Preview of last message (truncated)
  metadata: {
    topics: string[];            // Extracted topics for search/filtering
    jobsDiscussed: string[];     // Job titles discussed
    companiesDiscussed: string[]; // Companies mentioned
  };
}
```

**Message Document (embedded array in conversation):**
```typescript
interface ScoutMessage {
  id: string;                    // Unique message ID
  role: 'user' | 'assistant';
  content: string;               // Message text
  timestamp: Timestamp;
  metadata?: {
    intent?: string;             // URL_PARSE, JOB_SEARCH, etc.
    fields?: {                   // Auto-populated fields
      job_title?: string;
      company?: string;
      location?: string;
      experience_level?: string;
    };
    jobListings?: Array<{        // Jobs returned in this message
      id: string;
      title: string;
      company: string;
      location?: string;
      url?: string;
      snippet?: string;
    }>;
    fitAnalysis?: {              // If job analysis was performed
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
```

#### 1.3 Firestore Helper Functions

Create a new file: `connect-grow-hire/src/services/scoutConversations.ts`

```typescript
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
  Timestamp,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';

// Types
export interface ScoutConversation {
  id: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  messageCount: number;
  lastMessage: string;
  messages: ScoutMessage[];
  metadata: {
    topics: string[];
    jobsDiscussed: string[];
    companiesDiscussed: string[];
  };
}

export interface ScoutMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
  metadata?: {
    intent?: string;
    fields?: {
      job_title?: string;
      company?: string;
      location?: string;
      experience_level?: string;
    };
    jobListings?: any[];
    fitAnalysis?: any;
  };
}

// Get conversations collection reference
const getConversationsRef = (uid: string) => 
  collection(db, 'users', uid, 'scoutConversations');

// Create a new conversation
export const createConversation = async (
  uid: string, 
  firstMessage: string
): Promise<string> => {
  const conversationsRef = getConversationsRef(uid);
  
  const newConversation = {
    title: generateTitleFromMessage(firstMessage),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
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

// Get all conversations for a user (sorted by most recent)
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

// Get a single conversation with all messages
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

// Add a message to a conversation
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
    updatedAt: Timestamp.now(),
    messageCount: increment(1),
    lastMessage: truncateMessage(message.content, 100)
  });
};

// Add both user and assistant messages (common pattern)
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
    updatedAt: now,
    messageCount: increment(2),
    lastMessage: truncateMessage(assistantMessage, 100)
  });
};

// Update conversation title
export const updateConversationTitle = async (
  uid: string,
  conversationId: string,
  title: string
): Promise<void> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  await updateDoc(docRef, { title });
};

// Delete a conversation
export const deleteConversation = async (
  uid: string,
  conversationId: string
): Promise<void> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  await deleteDoc(docRef);
};

// Update conversation metadata (topics, jobs, companies)
export const updateConversationMetadata = async (
  uid: string,
  conversationId: string,
  metadata: Partial<ScoutConversation['metadata']>
): Promise<void> => {
  const docRef = doc(db, 'users', uid, 'scoutConversations', conversationId);
  
  const updates: any = {};
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

// Helper: Generate title from first message
const generateTitleFromMessage = (message: string): string => {
  // Remove URLs
  const withoutUrls = message.replace(/https?:\/\/[^\s]+/g, '[Job Link]');
  
  // Truncate to first 50 chars
  const truncated = withoutUrls.slice(0, 50);
  
  // Add ellipsis if truncated
  return truncated.length < withoutUrls.length 
    ? truncated.trim() + '...' 
    : truncated.trim();
};

// Helper: Generate unique message ID
const generateMessageId = (): string => {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper: Truncate message for preview
const truncateMessage = (message: string, maxLength: number): string => {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength).trim() + '...';
};
```

---

### Phase 2: Backend Updates

#### 2.1 Update `/api/scout/chat` Endpoint

Modify `backend/app/routes/scout.py` to accept and use conversation history:

```python
@scout_bp.route('/chat', methods=['POST'])
@require_auth
def chat():
    """
    Main Scout chat endpoint with conversation history support.
    
    Request body:
    {
        "message": "user message",
        "conversation_id": "optional - existing conversation ID",
        "conversation_history": [  # Last N messages for context
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ],
        "context": {
            "user_resume": {...},
            "recent_topics": [...]
        }
    }
    """
    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        conversation_id = data.get('conversation_id')
        conversation_history = data.get('conversation_history', [])
        context = data.get('context', {})
        
        if not message:
            return jsonify({
                'status': 'error',
                'message': 'Message is required'
            }), 400
        
        # Add conversation history to context
        context['conversation_history'] = conversation_history
        context['conversation_id'] = conversation_id
        
        # Process through Scout service
        response = scout_service.handle_chat(message, context)
        
        return jsonify(response.to_dict())
        
    except Exception as e:
        logger.error(f"[Scout] Chat error: {e}")
        return jsonify({
            'status': 'error',
            'message': 'An error occurred processing your request'
        }), 500
```

#### 2.2 Update Scout Service to Use History

Modify `backend/app/services/scout_service.py`:

```python
class ScoutService:
    
    def handle_chat(self, message: str, context: Dict[str, Any]) -> ScoutResponse:
        """Handle chat with conversation history context."""
        
        # Extract conversation history
        conversation_history = context.get('conversation_history', [])
        
        # Classify intent with history context
        intent, extracted = self._classify_intent(message, context, conversation_history)
        
        # Route to appropriate handler
        if intent == IntentType.URL_PARSE:
            return self._handle_url_parse(extracted.get('url'), context)
        elif intent == IntentType.JOB_SEARCH:
            return self._handle_job_search(message, extracted, context)
        elif intent == IntentType.FIELD_HELP:
            return self._handle_field_help(message, extracted, context)
        elif intent == IntentType.RESEARCH:
            return self._handle_research(message, extracted, context, conversation_history)
        else:
            return self._handle_conversation(message, context, conversation_history)
    
    def _classify_intent(
        self, 
        message: str, 
        context: Dict[str, Any],
        conversation_history: List[Dict[str, str]]
    ) -> Tuple[IntentType, Dict[str, Any]]:
        """Classify intent with conversation history for better context."""
        
        # First try regex patterns (fast path)
        url_match = re.search(r'https?://[^\s<>"{}|\\^`\[\]]+', message)
        if url_match:
            return IntentType.URL_PARSE, {'url': url_match.group()}
        
        # Check for job search patterns
        job_search_pattern = r'\b(find|search|look for|show me|get me)\b.*\b(jobs?|roles?|positions?|openings?)\b'
        if re.search(job_search_pattern, message, re.IGNORECASE):
            return IntentType.JOB_SEARCH, self._extract_search_entities(message)
        
        # Use LLM for ambiguous cases - include history for context
        return self._llm_classify_intent(message, context, conversation_history)
    
    def _llm_classify_intent(
        self,
        message: str,
        context: Dict[str, Any],
        conversation_history: List[Dict[str, str]]
    ) -> Tuple[IntentType, Dict[str, Any]]:
        """Use LLM to classify intent with full conversation context."""
        
        # Build history string for prompt
        history_str = ""
        if conversation_history:
            # Use last 10 messages for context
            recent_history = conversation_history[-10:]
            history_str = "\n".join([
                f"{msg['role'].upper()}: {msg['content'][:500]}"
                for msg in recent_history
            ])
        
        prompt = f"""Classify the user's intent in this conversation.

CONVERSATION HISTORY:
{history_str if history_str else "(No prior messages)"}

CURRENT MESSAGE: {message}

Classify as one of:
- URL_PARSE: User shared a job posting URL
- JOB_SEARCH: User wants to find/search for jobs
- FIELD_HELP: User needs help with search fields
- RESEARCH: User wants to research a company/role/interview
- CONVERSATION: General conversation or follow-up question

Consider the conversation history when classifying. For example:
- If they previously searched for jobs and now say "show me more like that" → JOB_SEARCH
- If they were discussing a company and ask "what about their culture?" → RESEARCH

Return JSON:
{{"intent": "...", "entities": {{"job_title": "...", "company": "...", "location": "..."}}}}
"""
        
        # Call OpenAI
        response = self._call_openai(prompt, max_tokens=200)
        
        # Parse response
        try:
            result = json.loads(response)
            intent = IntentType[result.get('intent', 'CONVERSATION')]
            entities = result.get('entities', {})
            return intent, entities
        except:
            return IntentType.CONVERSATION, {}
    
    def _handle_conversation(
        self,
        message: str,
        context: Dict[str, Any],
        conversation_history: List[Dict[str, str]]
    ) -> ScoutResponse:
        """Handle general conversation with full history context."""
        
        # Build messages for OpenAI
        messages = [
            {
                "role": "system",
                "content": """You are Scout, an AI job search assistant for Offerloop. 
You help users find jobs, analyze job fit, research companies, and prepare for interviews.
Be helpful, concise, and proactive in suggesting next steps.
If the user's resume is available, personalize your responses based on their background."""
            }
        ]
        
        # Add conversation history
        for msg in conversation_history[-15:]:  # Last 15 messages
            messages.append({
                "role": msg['role'],
                "content": msg['content']
            })
        
        # Add current message
        messages.append({
            "role": "user",
            "content": message
        })
        
        # Add resume context if available
        if context.get('user_resume'):
            resume_summary = self._summarize_resume(context['user_resume'])
            messages[0]['content'] += f"\n\nUser's background: {resume_summary}"
        
        # Call OpenAI
        response = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=1000,
            temperature=0.7
        )
        
        assistant_message = response.choices[0].message.content
        
        return ScoutResponse(
            status="ok",
            message=assistant_message,
            intent="CONVERSATION"
        )
```

#### 2.3 Add Title Generation Endpoint (Optional)

Add an endpoint to generate better titles using GPT:

```python
@scout_bp.route('/generate-title', methods=['POST'])
@require_auth
def generate_title():
    """Generate a conversation title from messages."""
    try:
        data = request.get_json()
        messages = data.get('messages', [])
        
        if not messages:
            return jsonify({'title': 'New Conversation'})
        
        # Use first few messages to generate title
        context = "\n".join([
            f"{m['role']}: {m['content'][:200]}"
            for m in messages[:4]
        ])
        
        prompt = f"""Generate a short, descriptive title (max 50 chars) for this conversation:

{context}

Title should capture the main topic. Examples:
- "Software Engineer Jobs in NYC"
- "Resume Review for Data Science"
- "Goldman Sachs Interview Prep"

Return only the title, no quotes or extra text."""
        
        response = scout_service._call_openai(prompt, max_tokens=50)
        title = response.strip()[:50]
        
        return jsonify({'title': title})
        
    except Exception as e:
        logger.error(f"[Scout] Title generation error: {e}")
        return jsonify({'title': 'New Conversation'})
```

---

### Phase 3: Frontend Implementation

#### 3.1 Create Conversation List Component

Create `connect-grow-hire/src/components/ScoutConversationList.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  Clock
} from 'lucide-react';
import { 
  ScoutConversation, 
  getConversations, 
  deleteConversation,
  updateConversationTitle 
} from '../services/scoutConversations';
import { useAuth } from '../contexts/AuthContext';

interface ScoutConversationListProps {
  currentConversationId: string | null;
  onSelectConversation: (conversation: ScoutConversation) => void;
  onNewConversation: () => void;
}

export const ScoutConversationList: React.FC<ScoutConversationListProps> = ({
  currentConversationId,
  onSelectConversation,
  onNewConversation
}) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ScoutConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
      loadConversations();
    }
  }, [user?.uid]);

  const loadConversations = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      const convos = await getConversations(user.uid);
      setConversations(convos);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (conversationId: string) => {
    if (!user?.uid) return;
    
    try {
      await deleteConversation(user.uid, conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      setDeleteConfirmId(null);
      
      // If deleting current conversation, start new one
      if (conversationId === currentConversationId) {
        onNewConversation();
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleEditSave = async (conversationId: string) => {
    if (!user?.uid || !editTitle.trim()) return;
    
    try {
      await updateConversationTitle(user.uid, conversationId, editTitle.trim());
      setConversations(prev => 
        prev.map(c => 
          c.id === conversationId 
            ? { ...c, title: editTitle.trim() } 
            : c
        )
      );
      setEditingId(null);
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  const formatDate = (timestamp: any) => {
    const date = timestamp?.toDate?.() || new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 
                     bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                     transition-colors"
        >
          <Plus size={18} />
          New Chat
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            Loading conversations...
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No conversations yet. Start a new chat!
          </div>
        ) : (
          <div className="py-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group relative px-3 py-2 mx-2 rounded-lg cursor-pointer
                           transition-colors ${
                             conversation.id === currentConversationId
                               ? 'bg-blue-100 border border-blue-200'
                               : 'hover:bg-gray-100'
                           }`}
                onClick={() => onSelectConversation(conversation)}
              >
                {/* Edit Mode */}
                {editingId === conversation.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border rounded"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave(conversation.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditSave(conversation.id);
                      }}
                      className="p-1 text-green-600 hover:bg-green-100 rounded"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      className="p-1 text-gray-500 hover:bg-gray-200 rounded"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : deleteConfirmId === conversation.id ? (
                  /* Delete Confirmation */
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-600">Delete?</span>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(conversation.id);
                        }}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                      >
                        Yes
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(null);
                        }}
                        className="px-2 py-1 text-xs bg-gray-300 rounded"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal View */
                  <>
                    <div className="flex items-start gap-2">
                      <MessageSquare 
                        size={16} 
                        className="mt-1 text-gray-400 flex-shrink-0" 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {conversation.title}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {conversation.lastMessage || 'No messages'}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                          <Clock size={12} />
                          {formatDate(conversation.updatedAt)}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons (visible on hover) */}
                    <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTitle(conversation.title);
                          setEditingId(conversation.id);
                        }}
                        className="p-1 text-gray-500 hover:bg-gray-200 rounded"
                        title="Edit title"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(conversation.id);
                        }}
                        className="p-1 text-gray-500 hover:bg-red-100 hover:text-red-600 rounded"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

#### 3.2 Update ScoutChatbot Component

Modify `connect-grow-hire/src/components/ScoutChatbot.tsx`:

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, X, ChevronDown, ChevronUp, ExternalLink, Sparkles, Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  ScoutConversation, 
  ScoutMessage,
  createConversation,
  getConversation,
  addMessagePair,
  getConversations
} from '../services/scoutConversations';
import { ScoutConversationList } from './ScoutConversationList';

interface ScoutChatbotProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
  userResume?: any;
  showSidebar?: boolean;  // New prop to control sidebar visibility
}

// Message type for display (includes UI state)
interface DisplayMessage extends ScoutMessage {
  isLoading?: boolean;
}

export const ScoutChatbot: React.FC<ScoutChatbotProps> = ({
  onJobTitleSuggestion,
  userResume,
  showSidebar = true
}) => {
  const { user } = useAuth();
  
  // Conversation state
  const [currentConversation, setCurrentConversation] = useState<ScoutConversation | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(showSidebar);
  
  // Input state
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Analysis state (existing)
  const [jobAnalyses, setJobAnalyses] = useState<Record<string, any>>({});
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversation when selected
  const handleSelectConversation = async (conversation: ScoutConversation) => {
    setCurrentConversation(conversation);
    setMessages(conversation.messages || []);
    setJobAnalyses({});
    setExpandedJobId(null);
  };

  // Start a new conversation
  const handleNewConversation = () => {
    setCurrentConversation(null);
    setMessages([]);
    setJobAnalyses({});
    setExpandedJobId(null);
    inputRef.current?.focus();
  };

  // Send a message
  const sendMessage = async () => {
    if (!input.trim() || isLoading || !user?.uid) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message to display immediately
    const tempUserMsg: DisplayMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: { toDate: () => new Date() } as any
    };
    
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      // Create conversation if this is the first message
      let conversationId = currentConversation?.id;
      if (!conversationId) {
        conversationId = await createConversation(user.uid, userMessage);
        // We'll update currentConversation after we get the response
      }

      // Build conversation history for context
      const historyForApi = messages.slice(-15).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Call Scout API
      const response = await fetch('/api/scout/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversation_id: conversationId,
          conversation_history: historyForApi,
          context: {
            user_resume: userResume
          }
        })
      });

      const data = await response.json();

      // Create assistant message
      const assistantMsg: DisplayMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: { toDate: () => new Date() } as any,
        metadata: {
          intent: data.intent,
          fields: data.fields,
          jobListings: data.job_listings
        }
      };

      // Update messages display
      setMessages(prev => [...prev.slice(0, -1), tempUserMsg, assistantMsg]);

      // Save to Firestore
      await addMessagePair(
        user.uid,
        conversationId,
        userMessage,
        data.message,
        assistantMsg.metadata
      );

      // Update current conversation
      if (!currentConversation) {
        const newConvo = await getConversation(user.uid, conversationId);
        setCurrentConversation(newConvo);
      }

      // Handle field suggestions (existing functionality)
      if (data.fields && onJobTitleSuggestion) {
        const { job_title, company, location } = data.fields;
        if (job_title) {
          onJobTitleSuggestion(job_title, company, location);
        }
      }

    } catch (error) {
      console.error('Scout chat error:', error);
      
      // Add error message
      const errorMsg: DisplayMessage = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: { toDate: () => new Date() } as any
      };
      
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Analyze job fit (existing functionality)
  const analyzeJob = async (job: any, jobId: string) => {
    if (analyzingJobId || !user?.uid) return;
    
    setAnalyzingJobId(jobId);
    
    try {
      const response = await fetch('/api/scout/analyze-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job,
          user_resume: userResume
        })
      });
      
      const data = await response.json();
      
      if (data.status === 'ok' && data.analysis) {
        setJobAnalyses(prev => ({
          ...prev,
          [jobId]: data.analysis
        }));
        setExpandedJobId(jobId);
      }
    } catch (error) {
      console.error('Job analysis error:', error);
    } finally {
      setAnalyzingJobId(null);
    }
  };

  return (
    <div className="flex h-full bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-64 flex-shrink-0">
          <ScoutConversationList
            currentConversationId={currentConversation?.id || null}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="text-blue-600" size={20} />
            <span className="font-semibold text-gray-900">Scout</span>
          </div>
          {currentConversation && (
            <span className="text-sm text-gray-500 truncate">
              {currentConversation.title}
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Sparkles size={48} className="text-blue-200 mb-4" />
              <p className="text-lg font-medium">How can I help you today?</p>
              <p className="text-sm mt-2">
                Try pasting a job URL, searching for jobs, or asking about companies.
              </p>
              
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 mt-6 justify-center">
                {[
                  'Find software engineer jobs in SF',
                  'Jobs that match my resume',
                  'Tell me about Google\'s culture'
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 
                               rounded-full transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  
                  {/* Job Listings */}
                  {message.metadata?.jobListings && 
                   message.metadata.jobListings.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.metadata.jobListings.map((job: any, idx: number) => {
                        const jobId = `${message.id}_job_${idx}`;
                        const analysis = jobAnalyses[jobId];
                        const isExpanded = expandedJobId === jobId;
                        const isAnalyzing = analyzingJobId === jobId;
                        
                        return (
                          <div
                            key={jobId}
                            className="bg-white rounded-lg p-3 border border-gray-200"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900">
                                  {job.title}
                                </h4>
                                <p className="text-sm text-gray-600">
                                  {job.company}
                                  {job.location && ` • ${job.location}`}
                                </p>
                              </div>
                              {job.url && (
                                <a
                                  href={job.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-gray-400 hover:text-blue-600"
                                >
                                  <ExternalLink size={16} />
                                </a>
                              )}
                            </div>
                            
                            {/* Analyze/Use buttons */}
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => analyzeJob(job, jobId)}
                                disabled={isAnalyzing}
                                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 
                                           rounded hover:bg-blue-200 disabled:opacity-50"
                              >
                                {isAnalyzing ? (
                                  <span className="flex items-center gap-1">
                                    <Loader2 size={12} className="animate-spin" />
                                    Analyzing...
                                  </span>
                                ) : analysis ? (
                                  <span className="flex items-center gap-1">
                                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    {isExpanded ? 'Hide' : 'Show'} Analysis
                                  </span>
                                ) : (
                                  'Analyze Fit'
                                )}
                              </button>
                              
                              <button
                                onClick={() => {
                                  if (onJobTitleSuggestion) {
                                    onJobTitleSuggestion(
                                      job.title,
                                      job.company,
                                      job.location
                                    );
                                  }
                                }}
                                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 
                                           rounded hover:bg-gray-200"
                              >
                                Use for Search
                              </button>
                            </div>
                            
                            {/* Analysis Panel */}
                            {analysis && isExpanded && (
                              <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
                                {/* Score */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-medium">Fit Score:</span>
                                  <span className={`px-2 py-0.5 rounded text-white ${
                                    analysis.score >= 80 ? 'bg-green-500' :
                                    analysis.score >= 60 ? 'bg-blue-500' :
                                    analysis.score >= 40 ? 'bg-yellow-500' :
                                    'bg-red-500'
                                  }`}>
                                    {analysis.score}%
                                  </span>
                                  <span className="text-gray-500">
                                    ({analysis.match_level})
                                  </span>
                                </div>
                                
                                {/* Strengths */}
                                {analysis.strengths?.length > 0 && (
                                  <div className="mb-2">
                                    <span className="font-medium text-green-700">
                                      Strengths:
                                    </span>
                                    <ul className="mt-1 space-y-1">
                                      {analysis.strengths.map((s: any, i: number) => (
                                        <li key={i} className="text-gray-700">
                                          • {s.point}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                
                                {/* Gaps */}
                                {analysis.gaps?.length > 0 && (
                                  <div className="mb-2">
                                    <span className="font-medium text-orange-700">
                                      Gaps to Address:
                                    </span>
                                    <ul className="mt-1 space-y-1">
                                      {analysis.gaps.map((g: any, i: number) => (
                                        <li key={i} className="text-gray-700">
                                          • {g.gap}
                                          {g.mitigation && (
                                            <span className="text-gray-500">
                                              {' '}→ {g.mitigation}
                                            </span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                
                                {/* Pitch */}
                                {analysis.pitch && (
                                  <div className="mt-2 p-2 bg-blue-50 rounded">
                                    <span className="font-medium">Your Pitch:</span>
                                    <p className="mt-1 text-gray-700">
                                      {analysis.pitch}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-2">
                <Loader2 className="animate-spin text-gray-500" size={20} />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Scout anything about jobs, companies, or interviews..."
              className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

### Phase 4: Integration & Polish

#### 4.1 Update ScoutBubble and ScoutHeaderButton

These components need minor updates to pass the new props and handle the sidebar:

```typescript
// In ScoutBubble.tsx - add showSidebar prop
<ScoutChatbot
  onJobTitleSuggestion={handleJobTitleSuggestion}
  userResume={userResume}
  showSidebar={true}  // Full sidebar for bubble view
/>

// In ScoutHeaderButton.tsx - might want compact mode
<ScoutChatbot
  onJobTitleSuggestion={handleJobTitleSuggestion}
  userResume={userResume}
  showSidebar={false}  // Start collapsed, user can toggle
/>
```

#### 4.2 Firestore Security Rules

Add to `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Existing user rules...
    
    // Scout Conversations
    match /users/{userId}/scoutConversations/{conversationId} {
      // Users can only access their own conversations
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Validate conversation structure
      allow create: if request.auth != null 
        && request.auth.uid == userId
        && request.resource.data.keys().hasAll(['title', 'createdAt', 'updatedAt', 'messages'])
        && request.resource.data.messages is list;
      
      // Allow updates to add messages
      allow update: if request.auth != null 
        && request.auth.uid == userId
        && request.resource.data.messages is list;
    }
  }
}
```

#### 4.3 Firestore Indexes

Add to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "scoutConversations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## Testing Checklist

### Conversation Management
- [ ] Create new conversation on first message
- [ ] Load existing conversation from sidebar
- [ ] Switch between conversations preserves state
- [ ] Delete conversation removes from list and Firestore
- [ ] Edit conversation title saves correctly
- [ ] New Chat button starts fresh conversation

### Message Persistence
- [ ] User messages save to Firestore
- [ ] Assistant messages save with metadata (intent, fields, jobs)
- [ ] Message order preserved on reload
- [ ] Job listings persist in message metadata
- [ ] Job analyses work after reload

### Conversation History Context
- [ ] Backend receives conversation history
- [ ] Follow-up questions use context ("show me more like that")
- [ ] Intent classification considers history
- [ ] Conversation stays coherent across messages

### UI/UX
- [ ] Sidebar toggles on/off
- [ ] Current conversation highlighted in list
- [ ] Timestamps display correctly
- [ ] Loading states work
- [ ] Error handling shows user-friendly messages
- [ ] Mobile responsiveness (sidebar collapses)

### Edge Cases
- [ ] Very long conversations (100+ messages)
- [ ] Rapid message sending
- [ ] Network failures mid-conversation
- [ ] User logs out and back in
- [ ] Multiple tabs open

---

## Environment Variables

No new environment variables needed - uses existing:
- `OPENAI_API_KEY`
- Firebase configuration

---

## Rollout Plan

1. **Phase 1**: Deploy backend changes (backward compatible)
2. **Phase 2**: Deploy Firestore rules and indexes
3. **Phase 3**: Deploy frontend with feature flag
4. **Phase 4**: Enable for beta users
5. **Phase 5**: Full rollout

---

## Notes

- Conversation history sent to backend is limited to last 15 messages to manage token usage
- Firestore document size limit is 1MB - monitor message count and consider subcollection if conversations get very long
- Consider adding a "search conversations" feature later
- Title auto-generation is basic - can enhance with GPT call if needed
- Job analyses are stored per-message, not at conversation level, to support proper context

---

*Generated for Offerloop Scout Conversations Feature*
