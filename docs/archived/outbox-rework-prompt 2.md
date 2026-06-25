# Outbox Rework - Full Cursor Prompt

Rework the Outbox feature to be a full conversation tracking system with AI-powered lifecycle management.

---

## BACKEND (`outbox.py`)

### New Data Model (on contact document in Firestore)

```python
gmailThreadId: str                    # Gmail thread ID
gmailDraftId: str | None              # Current pending draft (null if none/sent)
gmailDraftUrl: str | None             # URL to open draft
emailSentAt: str | None               # ISO timestamp when email was sent
lastMessageFrom: "user" | "contact"   # Who sent the last message
lastMessageAt: str                    # ISO timestamp of last message
lastMessageSnippet: str               # Preview of last message
conversationSummary: str | None       # AI-generated rolling summary
messageCount: int                     # Number of back-and-forth messages
followUpCount: int                    # How many follow-ups sent (0, 1, 2, 3)
nextFollowUpAt: str | None            # When auto follow-up should trigger
resolution: str | None                # "meeting_booked" | "soft_no" | "hard_no" | "ghosted" | "completed" | null
resolutionDetails: str | None         # e.g. "Meeting scheduled for Dec 5"
archivedAt: str | None                # ISO timestamp if archived
```

### Computed Status Logic

```python
def compute_status(contact_data):
    if contact_data.get("archivedAt"):
        return "archived"
    if contact_data.get("resolution") == "meeting_booked":
        return "won"
    if contact_data.get("resolution") in ["soft_no", "hard_no", "ghosted", "completed"]:
        return "archived"
    if contact_data.get("gmailDraftId"):
        return "draft_pending"
    if contact_data.get("lastMessageFrom") == "contact":
        return "reply_received"
    if contact_data.get("emailSentAt"):
        return "waiting_on_reply"
    return "unknown"
```

### Gmail Sync Logic

In `list_threads` or as a separate sync function:

```python
def sync_thread(gmail_service, contact_ref, contact_data, user_email):
    draft_id = contact_data.get("gmailDraftId")
    thread_id = contact_data.get("gmailThreadId")
    
    updates = {}
    
    # 1. Check if draft still exists
    if draft_id:
        try:
            gmail_service.users().drafts().get(userId='me', id=draft_id).execute()
            # Draft exists - status remains draft_pending
        except:
            # Draft gone - check if it was sent or deleted
            sent_message = find_user_sent_message_in_thread(gmail_service, thread_id, user_email)
            if sent_message:
                updates["gmailDraftId"] = None
                updates["gmailDraftUrl"] = None
                updates["emailSentAt"] = sent_message["date"]
                updates["lastMessageFrom"] = "user"
                updates["lastMessageAt"] = sent_message["date"]
                updates["lastMessageSnippet"] = sent_message["snippet"]
            else:
                # Draft deleted without sending - remove from outbox
                updates["gmailDraftId"] = None
                updates["gmailDraftUrl"] = None
                updates["gmailThreadId"] = None
                contact_ref.update(updates)
                return None  # Signal to remove from outbox
    
    # 2. Check for new replies from contact
    if thread_id and contact_data.get("emailSentAt"):
        latest = get_latest_message_in_thread(gmail_service, thread_id)
        contact_email = contact_data.get("email")
        
        if latest and is_from_contact(latest, contact_email):
            updates["lastMessageFrom"] = "contact"
            updates["lastMessageAt"] = latest["date"]
            updates["lastMessageSnippet"] = latest["snippet"]
            
            # Auto-generate reply draft if we don't have one
            if not contact_data.get("gmailDraftId"):
                draft = generate_and_create_draft(gmail_service, thread_id, latest, contact_data)
                if draft:
                    updates["gmailDraftId"] = draft["id"]
                    updates["gmailDraftUrl"] = f"https://mail.google.com/mail/u/0/#draft/{draft['id']}"
            
            # AI: Analyze reply for resolution signals
            resolution = analyze_reply_for_resolution(latest["body"])
            if resolution:
                updates["resolution"] = resolution["type"]
                updates["resolutionDetails"] = resolution.get("details")
    
    # 3. Check if follow-up is due
    if (contact_data.get("lastMessageFrom") == "user" and 
        not contact_data.get("gmailDraftId") and
        contact_data.get("followUpCount", 0) < 3):
        
        days_waiting = days_since(contact_data.get("lastMessageAt"))
        follow_up_count = contact_data.get("followUpCount", 0)
        
        # Follow-up schedule: Day 4, Day 8, Day 14
        thresholds = [4, 8, 14]
        if follow_up_count < len(thresholds) and days_waiting >= thresholds[follow_up_count]:
            draft = generate_follow_up_draft(gmail_service, thread_id, contact_data, follow_up_count + 1)
            if draft:
                updates["gmailDraftId"] = draft["id"]
                updates["gmailDraftUrl"] = f"https://mail.google.com/mail/u/0/#draft/{draft['id']}"
                updates["followUpCount"] = follow_up_count + 1
        
        # After 3 unanswered follow-ups over 21+ days, mark as ghosted
        if follow_up_count >= 3 and days_waiting >= 21:
            updates["resolution"] = "ghosted"
    
    # 4. Generate/update conversation summary
    if updates.get("lastMessageSnippet") or not contact_data.get("conversationSummary"):
        summary = generate_conversation_summary(gmail_service, thread_id)
        if summary:
            updates["conversationSummary"] = summary
    
    if updates:
        updates["updatedAt"] = datetime.utcnow().isoformat()
        contact_ref.update(updates)
    
    return updates
```

### Helper Functions to Implement

```python
def find_user_sent_message_in_thread(gmail_service, thread_id, user_email):
    """
    Find a sent message from the user in the thread.
    Returns the message dict with 'date' and 'snippet' if found, else None.
    """
    pass

def get_latest_message_in_thread(gmail_service, thread_id):
    """
    Get the most recent message in the thread.
    Returns message dict with 'date', 'snippet', 'body', 'from' fields.
    """
    pass

def is_from_contact(message, contact_email):
    """
    Check if a message was sent by the contact (not the user).
    """
    return contact_email.lower() in message.get("from", "").lower()

def generate_and_create_draft(gmail_service, thread_id, latest_message, contact_data):
    """
    Use AI to generate a reply based on the contact's message,
    then create a Gmail draft in the thread.
    Returns the draft object with 'id' field.
    """
    pass

def analyze_reply_for_resolution(message_body):
    """
    Use AI to detect resolution signals in the contact's reply.
    Returns: { "type": "meeting_booked" | "soft_no" | "hard_no" | "completed", "details": str } or None
    
    Detection signals:
    - meeting_booked: "let's schedule", "how about Tuesday", "calendar invite", etc.
    - soft_no: "not right now", "maybe next quarter", "reach out later", etc.
    - hard_no: "not interested", "please don't contact", "unsubscribe", etc.
    - completed: "thanks for the info", "good luck", natural conversation ending
    """
    pass

def generate_follow_up_draft(gmail_service, thread_id, contact_data, follow_up_number):
    """
    Generate an appropriate follow-up message based on which follow-up this is.
    - Follow-up 1: Gentle bump, add value
    - Follow-up 2: Different angle, restate interest
    - Follow-up 3: Final "closing the loop" message
    """
    pass

def generate_conversation_summary(gmail_service, thread_id):
    """
    Fetch all messages in thread and generate a 1-2 sentence summary.
    e.g. "You reached out about PM internship. They asked about your experience. You're scheduling a call."
    """
    pass

def days_since(iso_timestamp):
    """Calculate days elapsed since the given ISO timestamp."""
    if not iso_timestamp:
        return 0
    dt = datetime.fromisoformat(iso_timestamp.replace('Z', '+00:00'))
    return (datetime.now(dt.tzinfo) - dt).days
```

### API Endpoints

#### 1. GET `/api/outbox/threads`

List all outbox threads with optional filtering.

```python
@outbox_bp.get("/threads")
@require_firebase_auth
def list_threads():
    """
    Query params:
    - filter: "active" | "wins" | "archived" (default: "active")
    
    Returns threads grouped/sorted by urgency.
    Triggers sync for each thread.
    """
    filter_type = request.args.get("filter", "active")
    
    # ... fetch contacts with gmailThreadId or gmailDraftId
    # ... sync each thread
    # ... compute status
    # ... filter based on filter_type:
    #     - active: draft_pending, waiting_on_reply, reply_received
    #     - wins: won (resolution == "meeting_booked")
    #     - archived: archived or resolution in [soft_no, hard_no, ghosted, completed]
    # ... sort by urgency (reply_received first, then draft_pending, then waiting)
    
    return jsonify({"threads": threads}), 200
```

#### 2. POST `/api/outbox/threads/<id>/archive`

Archive a conversation.

```python
@outbox_bp.post("/threads/<thread_id>/archive")
@require_firebase_auth
def archive_thread(thread_id):
    """
    Body (optional): { "resolution": "completed" | "soft_no" | "hard_no" }
    """
    # ... update contact with archivedAt and optional resolution
    pass
```

#### 3. POST `/api/outbox/threads/<id>/mark-won`

Mark a conversation as won.

```python
@outbox_bp.post("/threads/<thread_id>/mark-won")
@require_firebase_auth
def mark_won(thread_id):
    """
    Body (optional): { "details": "Meeting scheduled for Dec 5" }
    """
    # ... update contact with resolution="meeting_booked" and resolutionDetails
    pass
```

#### 4. POST `/api/outbox/threads/<id>/unarchive`

Restore a conversation from archive.

```python
@outbox_bp.post("/threads/<thread_id>/unarchive")
@require_firebase_auth
def unarchive_thread(thread_id):
    # ... clear archivedAt and resolution fields
    pass
```

#### 5. POST `/api/outbox/threads/<id>/snooze`

Snooze follow-ups until a specific date.

```python
@outbox_bp.post("/threads/<thread_id>/snooze")
@require_firebase_auth
def snooze_thread(thread_id):
    """
    Body: { "until": "2024-12-15" }
    """
    # ... set nextFollowUpAt to the snooze date
    pass
```

### Remove

- Remove `/threads/<id>/regenerate` endpoint
- Remove `suggestedReply`, `replyType`, `draftCreatedAt` fields from response
- Remove `generate_reply_to_message` usage for manual regeneration
- Remove MIMEText import and manual draft creation in regenerate

---

## FRONTEND (`Outbox.tsx`)

### New Type Definitions

```typescript
type OutboxStatus = 
  | "draft_pending"      // Has unsent draft
  | "waiting_on_reply"   // Email sent, waiting on contact  
  | "reply_received"     // Contact replied, draft ready
  | "won"                // Meeting booked / positive outcome
  | "archived"           // Completed, declined, or ghosted

type Resolution = 
  | "meeting_booked"
  | "soft_no"
  | "hard_no" 
  | "ghosted"
  | "completed"
  | null

type FilterTab = "active" | "wins" | "archived"
```

### New OutboxThread Interface

```typescript
interface OutboxThread {
  id: string
  contactName: string
  email: string
  jobTitle: string
  company: string
  
  // Status & state
  status: OutboxStatus
  lastMessageFrom: "user" | "contact"
  lastMessageAt: string
  lastMessageSnippet: string
  
  // Conversation tracking
  conversationSummary: string | null
  messageCount: number
  followUpCount: number
  
  // Gmail integration
  gmailThreadId: string
  gmailDraftId: string | null
  gmailDraftUrl: string | null
  
  // Resolution
  resolution: Resolution
  resolutionDetails: string | null
  
  // Timestamps
  emailSentAt: string | null
  nextFollowUpAt: string | null
  archivedAt: string | null
}
```

### UI Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Outbox                              [Credits] [Back]│
├─────────────────────────────────────────────────────────────┤
│ Tabs: [Active (5)] [Wins (2)] [Archived (12)]              │
├──────────────────────────┬──────────────────────────────────┤
│ Left Panel (Thread List) │ Right Panel (Conversation View)  │
│                          │                                  │
│ 🔴 Needs Action (2)      │ ┌──────────────────────────────┐ │
│ ┌──────────────────────┐ │ │ Sarah Chen                   │ │
│ │ Sarah Chen           │ │ │ PM @ Google · sarah@g.com    │ │
│ │ PM @ Google          │ │ └──────────────────────────────┘ │
│ │ "Let's schedule..."  │ │                                  │
│ │ 🟢 Reply received    │ │ ┌──────────────────────────────┐ │
│ │ ✨ Draft ready       │ │ │ 🤖 Summary                   │ │
│ └──────────────────────┘ │ │ You reached out about PM     │ │
│                          │ │ role. They're interested...  │ │
│ ⏳ Waiting (3)           │ └──────────────────────────────┘ │
│ ┌──────────────────────┐ │                                  │
│ │ Mike Liu             │ │ ┌──────────────────────────────┐ │
│ │ SWE @ Meta           │ │ │ Timeline                     │ │
│ │ "Thanks for the..."  │ │ │                              │ │
│ │ 🟡 Sent 3 days ago   │ │ │ 📤 You (Nov 25)              │ │
│ │ Follow-up in 1 day   │ │ │ Initial outreach about...    │ │
│ └──────────────────────┘ │ │                              │ │
│                          │ │ 📥 Sarah (Nov 27)            │ │
│ [Search...]              │ │ "Thanks for reaching out!    │ │
│                          │ │ Tell me more about..."       │ │
│                          │ │                              │ │
│                          │ │ 📤 You (Nov 28)              │ │
│                          │ │ Shared background and...     │ │
│                          │ │                              │ │
│                          │ │ 📥 Sarah (Nov 30)            │ │
│                          │ │ "Let's schedule a call"      │ │
│                          │ │ └─ ✨ Draft ready            │ │
│                          │ └──────────────────────────────┘ │
│                          │                                  │
│                          │ ┌──────────────────────────────┐ │
│                          │ │ [Review Draft] [Archive]     │ │
│                          │ │ [Mark as Won 🎉]             │ │
│                          │ └──────────────────────────────┘ │
└──────────────────────────┴──────────────────────────────────┘
```

### Component Structure

```
Outbox.tsx
├── OutboxTabs (Active / Wins / Archived)
├── ThreadList (left panel)
│   ├── SearchInput
│   ├── ThreadGroup ("Needs Action")
│   │   └── ThreadCard[]
│   └── ThreadGroup ("Waiting")
│       └── ThreadCard[]
└── ConversationView (right panel)
    ├── ContactHeader
    ├── SummaryCard
    ├── Timeline
    │   └── TimelineMessage[]
    └── ActionBar
```

### Status Configuration

```typescript
import { 
  FileEdit, 
  Clock, 
  MessageCircle, 
  Trophy, 
  Archive,
  Sparkles 
} from "lucide-react"

const statusConfig: Record<OutboxStatus, { 
  label: string
  color: string
  icon: LucideIcon 
}> = {
  draft_pending: { 
    label: "Draft pending", 
    color: "bg-amber-500/10 text-amber-300 border-amber-500/40",
    icon: FileEdit 
  },
  waiting_on_reply: { 
    label: "Waiting on reply", 
    color: "bg-blue-500/10 text-blue-300 border-blue-500/40",
    icon: Clock 
  },
  reply_received: { 
    label: "Reply received", 
    color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
    icon: MessageCircle 
  },
  won: { 
    label: "Won! 🎉", 
    color: "bg-green-500/10 text-green-300 border-green-500/40",
    icon: Trophy 
  },
  archived: { 
    label: "Archived", 
    color: "bg-gray-800 text-gray-400 border-gray-700",
    icon: Archive 
  },
}
```

### Thread Grouping Logic

```typescript
const groupThreads = (threads: OutboxThread[]) => {
  const needsAction = threads.filter(t => 
    t.status === "reply_received" || t.status === "draft_pending"
  )
  const waiting = threads.filter(t => 
    t.status === "waiting_on_reply"
  )
  
  // Sort needs action: reply_received first, then by lastMessageAt
  needsAction.sort((a, b) => {
    if (a.status === "reply_received" && b.status !== "reply_received") return -1
    if (b.status === "reply_received" && a.status !== "reply_received") return 1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })
  
  // Sort waiting by lastMessageAt (oldest first - they've been waiting longest)
  waiting.sort((a, b) => 
    new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime()
  )
  
  return { needsAction, waiting }
}
```

### Follow-up Timing Display

```typescript
const getFollowUpText = (thread: OutboxThread): string | null => {
  if (thread.status !== "waiting_on_reply") return null
  if (thread.followUpCount >= 3) return "Final follow-up sent"
  
  const daysSinceSent = daysSince(thread.lastMessageAt)
  const thresholds = [4, 8, 14]
  const nextThreshold = thresholds[thread.followUpCount]
  
  if (!nextThreshold) return null
  
  const daysUntilFollowUp = nextThreshold - daysSinceSent
  
  if (daysUntilFollowUp <= 0) return "Follow-up ready"
  if (daysUntilFollowUp === 1) return "Follow-up in 1 day"
  return `Follow-up in ${daysUntilFollowUp} days`
}

const getFollowUpLabel = (count: number): string => {
  if (count === 0) return ""
  if (count === 1) return "1st follow-up sent"
  if (count === 2) return "2nd follow-up sent"
  return "3rd follow-up sent"
}
```

### Context-Aware Action Buttons

```typescript
const getActions = (thread: OutboxThread) => {
  const actions: Action[] = []
  
  // Primary action: Review draft if available
  if (thread.gmailDraftUrl) {
    actions.push({ 
      label: "Review Draft in Gmail", 
      icon: ExternalLink, 
      primary: true,
      onClick: () => window.open(thread.gmailDraftUrl, "_blank")
    })
  }
  
  // Mark as won (for reply_received status)
  if (thread.status === "reply_received") {
    actions.push({ 
      label: "Mark as Won 🎉", 
      icon: Trophy,
      onClick: () => handleMarkWon(thread.id)
    })
  }
  
  // Archive (for active threads)
  if (thread.status !== "archived" && thread.status !== "won") {
    actions.push({ 
      label: "Archive", 
      icon: Archive,
      variant: "ghost",
      onClick: () => handleArchive(thread.id)
    })
  }
  
  // Restore (for archived threads)
  if (thread.status === "archived") {
    actions.push({ 
      label: "Restore", 
      icon: RotateCcw,
      variant: "ghost",
      onClick: () => handleUnarchive(thread.id)
    })
  }
  
  return actions
}
```

### API Service Updates

```typescript
// In api.ts

export const apiService = {
  // ... existing methods
  
  getOutboxThreads: async (filter: FilterTab = "active") => {
    const response = await fetch(`${API_BASE}/api/outbox/threads?filter=${filter}`, {
      headers: await getAuthHeaders()
    })
    return response.json()
  },
  
  archiveThread: async (threadId: string, resolution?: Resolution) => {
    const response = await fetch(`${API_BASE}/api/outbox/threads/${threadId}/archive`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ resolution })
    })
    return response.json()
  },
  
  markThreadWon: async (threadId: string, details?: string) => {
    const response = await fetch(`${API_BASE}/api/outbox/threads/${threadId}/mark-won`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ details })
    })
    return response.json()
  },
  
  unarchiveThread: async (threadId: string) => {
    const response = await fetch(`${API_BASE}/api/outbox/threads/${threadId}/unarchive`, {
      method: "POST",
      headers: await getAuthHeaders()
    })
    return response.json()
  },
  
  snoozeThread: async (threadId: string, until: string) => {
    const response = await fetch(`${API_BASE}/api/outbox/threads/${threadId}/snooze`, {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ until })
    })
    return response.json()
  }
}
```

### Remove from Current Implementation

- Remove "Copy reply text" button and `handleCopy` function
- Remove "Regenerate" button and `handleRegenerate` function
- Remove `suggestedReply` textarea and display
- Remove the entire "Suggested reply" section
- Remove `regenerateOutboxReply` API call
- Remove old status types: `no_reply_yet`, `waiting_on_them`, `waiting_on_you`, `closed`

### Keep from Current Implementation

- Search functionality
- Refresh button  
- Credit pill display
- Basic thread list selection UX
- `formatLastActivity` helper function
- Toast notifications
- Loading states

---

## Summary of Changes

### Backend
1. New data model with conversation tracking fields
2. Computed status based on thread state
3. Gmail sync logic to detect sent/deleted drafts and new replies
4. Auto-follow-up generation on schedule (Day 4, 8, 14)
5. AI resolution detection (meeting booked, soft/hard no, ghosted)
6. New endpoints: archive, mark-won, unarchive, snooze
7. Remove: regenerate endpoint, suggestedReply field

### Frontend
1. Three-tab layout: Active / Wins / Archived
2. Thread list grouped by urgency (Needs Action vs Waiting)
3. Conversation timeline view with AI summary
4. Follow-up timing indicators
5. Context-aware action buttons
6. New status badges and colors
7. Remove: copy text, regenerate, suggested reply section
