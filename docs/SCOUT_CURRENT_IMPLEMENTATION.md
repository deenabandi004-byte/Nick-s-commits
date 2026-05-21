# Scout Current Implementation Audit

**Generated:** 2024  
**Purpose:** Complete technical documentation of how Scout (AI assistant) currently works in Offerloop

---

## Table of Contents

1. [Component Inventory](#1-component-inventory)
2. [Frontend Architecture](#2-frontend-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [System Prompts](#4-system-prompts)
5. [Intent Classification](#5-intent-classification)
6. [Special Features](#6-special-features)
7. [Conversation Flow](#7-conversation-flow)
8. [State & Persistence](#8-state--persistence)
9. [User Context](#9-user-context)
10. [Error Handling](#10-error-handling)
11. [OpenAI Integration](#11-openai-integration)
12. [Current Limitations](#12-current-limitations)

---

## 1. Component Inventory

### Frontend Components

| File | Purpose | Used In |
|------|---------|---------|
| `src/components/ScoutChatbot.tsx` | Main chat interface for job search assistance | ContactSearchPage (deprecated), ScoutHelperChatbot |
| `src/components/ScoutPage.tsx` | Full-page Scout AI Assistant (ChatGPT-style) | `/scout` route |
| `src/components/ScoutSidePanel.tsx` | Slide-out side panel for Scout | App.tsx (global) |
| `src/components/ScoutBubble.tsx` | Floating bubble wrapper (deprecated) | ContactSearchPage (deprecated) |
| `src/components/ScoutHeaderButton.tsx` | Header button to open Scout panel | PageHeaderActions (multiple pages) |
| `src/components/ScoutFirmAssistant.tsx` | Firm search assistant chat interface | FirmSearchPage |
| `src/components/ScoutFirmAssistantButton.tsx` | Button wrapper for firm assistant | FirmSearchPage |
| `src/components/ScoutHelperChatbot.tsx` | Lightweight chatbot for navigation/explanation | ApplicationLabPage, ContactSearchPage |
| `src/components/ScoutConversationList.tsx` | Sidebar for managing conversation history | ScoutHelperChatbot |

### Frontend Hooks & Services

| File | Purpose | Used In |
|------|---------|---------|
| `src/hooks/useScoutChat.ts` | Shared chat hook for message handling | ScoutPage, ScoutSidePanel |
| `src/services/scoutConversations.ts` | Firestore service for conversation persistence | ScoutHelperChatbot, ScoutConversationList |
| `src/contexts/ScoutContext.tsx` | Global state for Scout panel | App.tsx, ScoutSidePanel, ScoutHeaderButton |
| `src/types/scout.ts` | TypeScript types for Scout features | Multiple components |
| `src/data/scout-knowledge.ts` | Knowledge base for Scout assistant | ScoutPage, ScoutSidePanel, backend |

### Backend Services

| File | Purpose | Used In |
|------|---------|---------|
| `backend/app/routes/scout.py` | API endpoints for job search Scout | Frontend ScoutChatbot, ScoutHelperChatbot |
| `backend/app/routes/scout_assistant.py` | API endpoints for product assistant Scout | Frontend ScoutPage, ScoutSidePanel |
| `backend/app/services/scout_service.py` | Main service for job search functionality | scout.py routes |
| `backend/app/services/scout_assistant_service.py` | Service for product navigation assistant | scout_assistant.py routes |

---

## 2. Frontend Architecture

### 2.1 ScoutChatbot.tsx

**Location:** `connect-grow-hire/src/components/ScoutChatbot.tsx`  
**Lines:** 919

#### Props Interface

```typescript
interface ScoutChatbotProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
  userResume?: UserResume;
}
```

#### State Variables

```typescript
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [input, setInput] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [context, setContext] = useState<Record<string, any>>({});
const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
const [jobAnalyses, setJobAnalyses] = useState<Record<string, DetailedJobFitAnalysis>>({});
const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
```

#### Key Functions

1. **`sendMessage()`** (lines 185-266)
   - Sends user message to `/api/scout/chat`
   - Handles response with fields, job listings, fit analysis
   - Auto-populates search fields via `onJobTitleSuggestion` callback

2. **`analyzeJob()`** (lines 284-391)
   - Calls `/api/scout/analyze-job` for detailed fit analysis
   - Validates and normalizes analysis response
   - Stores analysis in `jobAnalyses` state

3. **`handleJobClick()`** (lines 275-282)
   - Simplifies job title using `simplifyJobTitle()` helper
   - Calls `onJobTitleSuggestion` to populate search fields

4. **`simplifyJobTitle()`** (lines 103-165)
   - Removes department names, team names, project names
   - Preserves core role and seniority level
   - Example: "Treasury & Capital Markets Senior Analyst" → "Senior Analyst"

#### API Calls

- **POST** `/api/scout/chat`
  - Payload: `{ message: string, context: { user_resume?: UserResume } }`
  - Response: `{ message: string, fields?: SearchFields, job_listings?: JobListing[], fit_analysis?: JobFitAnalysis, context: object }`

- **POST** `/api/scout/analyze-job`
  - Payload: `{ job: JobListing, user_resume: UserResume }`
  - Response: `{ status: "ok", analysis: DetailedJobFitAnalysis }`

#### Message Rendering

- User messages: Blue gradient background, right-aligned
- Assistant messages: Light blue background (`#F5F7FF`), left-aligned
- Supports markdown-like formatting (`**bold**`, line breaks)
- Displays search fields badge when fields are returned
- Displays job listings as clickable cards with "Analyze Fit" button
- Displays expanded fit analysis panel when job is analyzed

### 2.2 ScoutPage.tsx

**Location:** `connect-grow-hire/src/pages/ScoutPage.tsx`  
**Lines:** 280

#### Layout Structure

- Full-page layout with AppSidebar and AppHeader
- Uses `useScoutChat()` hook for chat functionality
- ChatGPT-style interface with centered messages
- Scout animation video as decorative element

#### Key Features

- Empty state with Scout animation and suggested questions
- Message bubbles with Scout avatar
- "Take me there" button for navigation
- Action buttons for additional navigation options
- Clear chat functionality

#### Uses `useScoutChat()` Hook

- Manages messages, input, loading state
- Handles API calls to `/api/scout-assistant/chat`
- Persists messages in sessionStorage

### 2.3 ScoutSidePanel.tsx

**Location:** `connect-grow-hire/src/components/ScoutSidePanel.tsx`  
**Lines:** 557

#### Opening/Closing

- Opens via `useScout().openPanel()` from ScoutContext
- Closes via `useScout().closePanel()`
- Escape key closes panel
- Click overlay closes panel
- Body scroll locked when open

#### Positioning & Sizing

- Fixed position, right side
- Width: `420px` on desktop, full width on mobile
- Slide-in animation from right
- Rounded left corners

#### Search Help Mode

- Special mode when opened with `openPanelWithSearchHelp()`
- Calls `/api/scout-assistant/search-help` endpoint
- Displays suggestions and "Continue" button
- Auto-populates search fields on continue

#### Normal Chat Mode

- Uses `useScoutChat()` hook with current page context
- Same interface as ScoutPage but in side panel
- Messages persist in sessionStorage

### 2.4 ScoutHeaderButton.tsx

**Location:** `connect-grow-hire/src/components/ScoutHeaderButton.tsx`  
**Lines:** 100

#### What Triggers Scout

- Button click opens Scout side panel
- Shows helper text on first use (disappears after click)
- Tracks first use in localStorage (`scout_first_use_completed`)

#### Visual States

- Normal: Transparent background, gray border
- Active (panel open): Blue background tint, blue border
- Shows Scout icon with small blue dot indicator

### 2.5 ScoutFirmAssistant.tsx

**Location:** `connect-grow-hire/src/components/ScoutFirmAssistant.tsx`  
**Lines:** 302

#### Purpose

- Specialized assistant for Firm Search page
- Helps refine searches, recommend firms, research companies

#### API Calls

- **POST** `/api/scout/firm-assist`
  - Payload: `{ message: string, firm_context: FirmContext, user_resume?: UserResume, fit_context?: object, conversation_history: Message[] }`
  - Response: `{ message: string, suggestions?: object, action_type: string }`

#### Quick Actions

- Context-aware quick action buttons
- Changes based on whether user has results, query, or resume

### 2.6 useScoutChat.ts

**Location:** `connect-grow-hire/src/hooks/useScoutChat.ts`  
**Lines:** 213

#### State Management

- Messages stored in state and sessionStorage (`scout_chat_messages`)
- Input state
- Loading state
- Auto-scroll to bottom on new messages

#### Functions Exposed

- `sendMessage(messageText?: string)` - Sends message to API
- `clearChat()` - Clears messages and sessionStorage
- `setInput(value)` - Updates input
- `input`, `messages`, `isLoading` - State values
- `messagesEndRef`, `inputRef` - Refs for scrolling/focusing

#### API Calls

- **POST** `/api/scout-assistant/chat`
  - Payload: `{ message: string, conversation_history: Message[], current_page: string, user_info: { name, tier, credits, max_credits } }`
  - Headers: `Authorization: Bearer <firebase_token>`
  - Response: `{ message: string, navigate_to?: string, action_buttons?: Array<{label, route}>, auto_populate?: object }`

#### Session Storage

- Key: `scout_chat_messages`
- Stores full message array as JSON
- Persists across page navigation
- Clears on browser close

### 2.7 ScoutContext.tsx

**Location:** `connect-grow-hire/src/contexts/ScoutContext.tsx`  
**Lines:** 95

#### State

- `isPanelOpen: boolean` - Panel visibility
- `searchHelpContext: SearchHelpContext | null` - Context for search help mode
- `searchHelpResponse: SearchHelpResponse | null` - Response from search help API

#### Functions

- `openPanel()` - Opens panel in normal mode
- `closePanel()` - Closes panel
- `togglePanel()` - Toggles panel
- `openPanelWithSearchHelp(context)` - Opens panel in search help mode
- `setSearchHelpResponse(response)` - Sets search help response
- `clearSearchHelp()` - Clears search help state

---

## 3. Backend Architecture

### 3.1 API Endpoints - scout.py

#### POST `/api/scout/chat`

**Purpose:** Main Scout chat endpoint for job search assistance

**Request Payload:**
```json
{
  "message": "string - user's message or URL",
  "context": {
    "user_resume": { ... },
    "recent_topics": [],
    "history": []
  },
  "conversation_id": "string (optional)",
  "conversation_history": [
    {"role": "user|assistant", "content": "..."}
  ]
}
```

**Response Payload:**
```json
{
  "status": "ok" | "needs_input" | "error",
  "message": "string - Scout's response",
  "fields": {
    "job_title": "string",
    "company": "string",
    "location": "string",
    "experience_level": "string"
  },
  "job_listings": [
    {
      "title": "string",
      "company": "string",
      "location": "string",
      "url": "string",
      "snippet": "string"
    }
  ],
  "fit_analysis": {
    "overall_score": 0-100,
    "strengths": ["string"],
    "gaps": ["string"],
    "angles": ["string"],
    "experience_match": "strong|moderate|stretch"
  },
  "intent": "URL_PARSE|JOB_SEARCH|FIELD_HELP|RESEARCH|CONVERSATION",
  "context": { ... }
}
```

**Business Logic:**
1. Receives message and context
2. Calls `scout_service.handle_chat()`
3. Service classifies intent (URL_PARSE, JOB_SEARCH, etc.)
4. Routes to appropriate handler
5. Returns response with fields, job listings, or fit analysis

#### POST `/api/scout/analyze-job`

**Purpose:** Analyze how well user fits a specific job

**Request Payload:**
```json
{
  "job": {
    "title": "string",
    "company": "string",
    "location": "string",
    "url": "string",
    "snippet": "string"
  },
  "user_resume": { ... }
}
```

**Response Payload:**
```json
{
  "status": "ok",
  "analysis": {
    "score": 0-100,
    "match_level": "strong|good|moderate|stretch",
    "strengths": [
      {"point": "string", "evidence": "string"}
    ],
    "gaps": [
      {"gap": "string", "mitigation": "string"}
    ],
    "pitch": "string",
    "talking_points": ["string"],
    "keywords_to_use": ["string"]
  }
}
```

**Business Logic:**
1. Validates job and resume data
2. Calls `scout_service.analyze_job_fit()`
3. Fetches full job description from URL if available (3s timeout)
4. Generates detailed analysis using GPT-4o-mini
5. Returns structured analysis

#### POST `/api/scout/firm-assist`

**Purpose:** Scout assistant for Firm Search page

**Request Payload:**
```json
{
  "message": "string",
  "firm_context": {
    "current_query": "string",
    "current_results": [Firm],
    "parsed_filters": { ... }
  },
  "user_resume": { ... },
  "fit_context": { ... },
  "conversation_history": [Message]
}
```

**Response Payload:**
```json
{
  "status": "ok",
  "message": "string",
  "suggestions": {
    "refined_query": "string",
    "recommended_firms": ["string"],
    "firm_insights": { ... },
    "next_steps": ["string"]
  },
  "action_type": "generate_query|refine_query|recommend_firms|research_firm|next_steps|general"
}
```

### 3.2 API Endpoints - scout_assistant.py

#### POST `/api/scout-assistant/chat`

**Purpose:** Main Scout assistant chat endpoint (product navigation)

**NO CREDIT COST** - This is a helper feature

**Request Payload:**
```json
{
  "message": "string",
  "conversation_history": [
    {"role": "user|assistant", "content": "..."}
  ],
  "current_page": "/contact-search",
  "user_info": {
    "name": "string",
    "tier": "free|pro|elite",
    "credits": 0,
    "max_credits": 300
  }
}
```

**Headers:** `Authorization: Bearer <firebase_token>` (required)

**Response Payload:**
```json
{
  "message": "string",
  "navigate_to": "/route-path" | null,
  "action_buttons": [
    {"label": "string", "route": "/route"}
  ],
  "auto_populate": {
    "search_type": "contact|firm",
    "job_title": "string",
    "company": "string",
    "location": "string",
    "industry": "string"
  } | null
}
```

**Business Logic:**
1. Validates Firebase auth token
2. Calls `scout_assistant_service.handle_chat()`
3. Builds system prompt with user context and knowledge base
4. Calls OpenAI GPT-4o-mini with conversation history
5. Parses JSON response and validates routes
6. Returns response with navigation options

#### POST `/api/scout-assistant/search-help`

**Purpose:** Help users when search fails (no results or error)

**NO CREDIT COST**

**Request Payload:**
```json
{
  "search_type": "contact|firm",
  "failed_search_params": {
    "job_title": "string",
    "company": "string",
    "location": "string"
  },
  "error_type": "no_results|error",
  "user_info": {
    "name": "string"
  }
}
```

**Response Payload:**
```json
{
  "message": "string",
  "suggestions": ["string"],
  "auto_populate": {
    "job_title": "string",
    "company": "string",
    "location": "string"
  },
  "search_type": "contact|firm",
  "action": "retry_search"
}
```

**Business Logic:**
1. Calls `scout_assistant_service.handle_search_help()`
2. For contact search: Generates alternative job titles using GPT
3. For firm search: Suggests broader industry terms or locations
4. Returns suggestions and auto-populate data

### 3.3 Scout Service (scout_service.py)

**Location:** `backend/app/services/scout_service.py`  
**Lines:** ~3480

#### Main Entry Point

**`handle_chat(message, context)`**
- Classifies intent using `_classify_intent()`
- Routes to handler based on intent:
  - `URL_PARSE` → `_handle_url_parse()`
  - `JOB_SEARCH` → `_handle_job_search()`
  - `FIELD_HELP` → `_handle_field_help()`
  - `RESEARCH` → `_handle_research()`
  - `CONVERSATION` → `_handle_conversation()`

#### Key Methods

1. **`_classify_intent(message, context)`**
   - Regex patterns for fast classification
   - Falls back to LLM if ambiguous
   - Returns `(IntentType, extracted_entities)`

2. **`_handle_url_parse(url, context)`**
   - Fetches URL content via Jina Reader API
   - Extracts job details using GPT
   - Analyzes job fit if resume available
   - Returns fields and fit analysis

3. **`_handle_job_search(message, extracted, context)`**
   - Builds search query from message/resume
   - Searches jobs via SERP API
   - Filters and ranks by resume relevance
   - Returns job listings and aggregated fields

4. **`analyze_job_fit(job, user_resume)`**
   - Fetches full job description if URL available
   - Generates detailed fit analysis
   - Returns score, strengths, gaps, pitch, talking points

5. **`handle_firm_assist(message, firm_context, ...)`**
   - Classifies firm request type
   - Routes to appropriate handler:
     - `generate_query` - Generate search from resume
     - `refine_query` - Refine existing search
     - `recommend_firms` - Recommend from results
     - `research_firm` - Research specific firm
     - `next_steps` - Suggest next actions

#### Caching

- `TTLCache` class for in-memory caching
- Caches URL parsing results (1 hour TTL)
- Caches job title generation from resume (1 hour TTL)

### 3.4 Scout Assistant Service (scout_assistant_service.py)

**Location:** `backend/app/services/scout_assistant_service.py`  
**Lines:** 700

#### Main Methods

1. **`handle_chat(message, conversation_history, current_page, user_name, tier, credits, max_credits)`**
   - Builds system prompt with knowledge base
   - Calls OpenAI with conversation history
   - Parses JSON response
   - Validates routes and auto-populate data
   - Returns response with navigation options

2. **`handle_search_help(search_type, failed_search_params, error_type, user_name)`**
   - Routes to contact or firm search help
   - Generates alternative suggestions using GPT
   - Returns suggestions and auto-populate data

#### Knowledge Base

- Hardcoded in service (mirrors frontend `scout-knowledge.ts`)
- Includes pages, routes, credit costs, tiers, troubleshooting
- Built into system prompt dynamically

---

## 4. System Prompts

### 4.1 Main Chat System Prompt (Scout Assistant)

**Located in:** `backend/app/services/scout_assistant_service.py:141-215`

```python
"""You are Scout, Offerloop's friendly product assistant. Your job is to help users understand and navigate the platform.

PERSONALITY:
- Helpful, concise, and friendly
- Give direct answers, not lengthy explanations
- When user wants to do something, briefly explain AND offer to navigate them there
- Use the user's name occasionally to personalize
- Keep responses to 2-4 sentences unless detailed explanation is requested

USER CONTEXT:
- Name: {user_name}
- Plan: {tier}
- Credits: {credits}/{max_credits}
- Current page: {current_page}

{knowledge_base_section}

AVAILABLE ROUTES FOR NAVIGATION:
{list_of_routes}

CRITICAL INSTRUCTIONS:
1. Answer questions about Offerloop features and how to use them
2. When directing user to a page, ALWAYS include the route in your response JSON's "navigate_to" field
3. Do NOT mention "click the button below" or reference any buttons in your message - the navigation button appears automatically
4. Your message should read naturally, e.g., "Head to Contact Search to find professionals" NOT "Click the button below to go to Contact Search"
5. If user asks about something outside Offerloop, politely redirect: "I'm here to help with Offerloop! What can I help you with on the platform?"
6. If you're unsure about something, say so - don't make up features
7. When mentioning credit costs, be specific about how many credits each action costs

AUTO-POPULATE INSTRUCTIONS:
When a user asks you to find specific people or companies, extract the search parameters from their request and include them in "auto_populate":

FOR CONTACT SEARCH REQUESTS:
- Extract: job_title, company, location (if mentioned)
- Examples:
  * "find me investment banking analysts from JP Morgan" → auto_populate: {"search_type": "contact", "job_title": "Investment Banking Analyst", "company": "JP Morgan", "location": ""}
  * "I need software engineers at Google in NYC" → auto_populate: {"search_type": "contact", "job_title": "Software Engineer", "company": "Google", "location": "NYC"}

FOR FIRM SEARCH REQUESTS:
- Extract: industry, location, size (if mentioned)
- Examples:
  * "find me venture capital firms in San Francisco" → auto_populate: {"search_type": "firm", "industry": "Venture Capital", "location": "San Francisco"}

RESPONSE FORMAT:
You must respond with valid JSON in this exact format:
{
  "message": "Your helpful response text here",
  "navigate_to": "/route-path" or null,
  "action_buttons": [
    {"label": "Button text", "route": "/route"}
  ] or [],
  "auto_populate": {
    "search_type": "contact" or "firm" or null,
    "job_title": "..." or null,
    "company": "..." or null,
    "location": "..." or null,
    "industry": "..." or null
  } or null
}
"""
```

### 4.2 Intent Classification Prompt

**Located in:** `backend/app/services/scout_service.py:419-440`

```python
"""Classify this user message for a job search assistant. Return JSON only.

Message: "{message}"

Recent context: {context}

Classify as one of:
- URL_PARSE: User shared a URL to a job posting
- JOB_SEARCH: User wants to find job listings (e.g., "data analyst jobs in SF")
- FIELD_HELP: User needs help with what to enter in search fields
- RESEARCH: User asking about a company, role, interview process, etc.
- CONVERSATION: General chat, follow-up, or unclear intent

Also extract any entities mentioned:
- job_title: specific role mentioned
- company: company name mentioned  
- location: city/location mentioned
- experience_level: intern, entry, mid, senior, etc.

Return format:
{"intent": "INTENT_TYPE", "entities": {"job_title": null, "company": null, "location": null, "experience_level": null}}
"""
```

### 4.3 Job Extraction Prompt

**Located in:** `backend/app/services/scout_service.py:684-705`

```python
"""Extract job posting details from this content. Return JSON only.

URL: {url}
Domain hint: {domain_hint}

Content:
{content[:8000]}

Extract:
- job_title: A simplified, searchable job title (e.g., "Software Engineer", "Data Analyst Intern"). 
  Remove team names, project names, and extra qualifiers. Keep only the core role.
  Example: "AI Research Scientist, Text Data Research - MSL FAIR" -> "AI Research Scientist"
- company: Company name
- location: City, State or "Remote" if mentioned
- experience_level: One of: intern, entry, mid, senior, lead, manager, director, or null
- summary: 1-2 sentence summary of the role (for context)

Return format:
{"job_title": "...", "company": "...", "location": "...", "experience_level": "...", "summary": "..."}

If a field cannot be determined, use null.
"""
```

### 4.4 Job Fit Analysis Prompt (Quick)

**Located in:** `backend/app/services/scout_service.py:793-823`

```python
"""Analyze how well this candidate fits the job. Return JSON only.

JOB DETAILS:
Title: {fields.job_title}
Company: {fields.company}
Location: {fields.location}
Level: {fields.experience_level}

JOB DESCRIPTION (if available):
{job_content[:3000]}

CANDIDATE RESUME:
{user_resume_json[:4000]}

Analyze and return:
{
    "overall_score": <0-100 fit score>,
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "gaps": ["gap 1", "gap 2"],
    "angles": ["positioning suggestion"],
    "experience_match": "strong" | "moderate" | "stretch"
}

Guidelines:
- strengths: Skills, experiences, or background that match well (be specific)
- gaps: Requirements they may not fully meet (be honest but constructive)
- angles: How they could position their experience to stand out
- experience_match: "strong" if experience level matches, "stretch" if reaching up, "moderate" if slight mismatch

Be concise. Each strength/gap should be under 15 words.
"""
```

### 4.5 Detailed Job Fit Analysis Prompt

**Located in:** `backend/app/services/scout_service.py:902-960`

```python
"""You are a career coach analyzing job fit. Provide detailed, actionable analysis.

## JOB POSTING
Title: {job.title}
Company: {job.company}
Location: {job.location}

Description:
{job_content}

## CANDIDATE RESUME
{user_resume_json[:4000]}

## INSTRUCTIONS
Analyze the fit considering ALL factors from their resume:
- **Major/Field of Study**: Does the job align with their academic background?
- **Skills**: Do their technical/soft skills match job requirements?
- **Key Experiences**: Do their past projects/roles relate to this position?
- **Achievements**: Do their accomplishments demonstrate relevant capabilities?
- **Location**: Is the job location reasonable given their background/preferences?
- **Education Level**: Is the role appropriate for their current stage (student/intern vs. full-time)?

Return JSON:
{
    "score": <0-100>,
    "match_level": "strong" | "good" | "moderate" | "stretch",
    "strengths": [
        {
            "point": "What matches well (specific skill/experience/project)",
            "evidence": "Concrete proof from their resume (mention specific projects, skills, or experiences)"
        }
    ],
    "gaps": [
        {
            "gap": "What's missing or weak",
            "mitigation": "How to address this in application/interview"
        }
    ],
    "pitch": "A 2-3 sentence positioning statement they could use to introduce themselves for this role. Reference their major, key projects, or relevant experiences. Make it specific and compelling.",
    "talking_points": [
        "Specific point to bring up in networking/interview (reference their resume)",
        "Another specific talking point"
    ],
    "keywords_to_use": ["keyword1", "keyword2", "keyword3"]
}

## GUIDELINES
- score: 80+ = strong, 60-79 = good, 40-59 = moderate, <40 = stretch
- Consider major alignment: A Computer Science major applying for a Software Engineer role = strong signal
- Consider location: If job is far from their university/location, note this as a consideration
- strengths: 2-4 items, be SPECIFIC - mention their actual projects, skills, or experiences from resume
- gaps: 1-3 items, always include mitigation strategy
- pitch: Write in first person, reference their actual background (e.g., "As a Data Science major with experience in...")
- talking_points: 3-5 specific, actionable points that reference their resume
- keywords_to_use: Terms from job posting to include in their materials

Be honest but constructive. If the job doesn't align well with their major/background, say so clearly but suggest how they could still position themselves.
"""
```

### 4.6 Conversation Prompt (Job Search Scout)

**Located in:** `backend/app/services/scout_service.py:2154-2170`

```python
"""You are Scout, a friendly and helpful job search assistant for Offerloop.ai.
                    
Your capabilities:
- Parse job posting URLs to extract details
- Find job listings based on descriptions
- Help users choose the right search terms
- Answer questions about companies, roles, and interviews

You help users fill in the Professional Search form with:
- Job Title (required)
- Company (optional)
- Location (required)

Be concise, friendly, and action-oriented. Use emojis sparingly.
If the user seems stuck, suggest concrete next steps.
If you can extract job search fields from the conversation, mention them."""
```

### 4.7 Search Help Prompts

#### Contact Search Help

**Located in:** `backend/app/services/scout_assistant_service.py:460-495`

```python
"""You are Scout, a helpful assistant that suggests alternative job titles when a contact search fails.

CONTEXT:
Different companies use different job titles for the same role. For example:
- Google uses "Software Engineer", "SWE", "Software Developer"
- Amazon uses "SDE", "Software Development Engineer"
- Meta/Facebook uses "Software Engineer, IC3", "Software Engineer, E4"
- Banks use "Analyst", "Associate", "VP" levels
- Consulting uses "Consultant", "Associate", "Senior Consultant"

COMPANY-SPECIFIC KNOWLEDGE:
- Google: Uses L3-L10 levels, "SWE" is common
- Amazon: Uses "SDE" (Software Development Engineer), levels I, II, III
- Meta: Uses E3-E8 levels, "Software Engineer, IC" format
- Microsoft: Uses levels 59-67+, "Software Engineer" or "SDE"
- Apple: Uses "Software Engineer", "ICT" prefixes
- Investment banks (Goldman, JPMorgan, etc.): Analyst, Associate, VP, Director, MD
- Consulting (McKinsey, BCG, Bain): Business Analyst, Associate, Consultant, Engagement Manager
- Private Equity: Analyst, Associate, VP, Principal, Partner

YOUR TASK:
Generate 3-5 alternative job titles that might work better for the given search.
Consider:
1. The company's known naming conventions
2. Industry standard variations
3. Seniority level variations
4. Abbreviations vs full titles

RESPONSE FORMAT (JSON):
{
  "message": "Brief, friendly explanation of why the search may have failed and what you suggest",
  "suggestions": ["Alternative Title 1", "Alternative Title 2", "Alternative Title 3"],
  "recommended_title": "The single best alternative to try first"
}

Keep the message to 1-2 sentences. Be specific about the company if known."""
```

#### Firm Search Help

**Located in:** `backend/app/services/scout_assistant_service.py:558-595`

```python
"""You are Scout, a helpful assistant that suggests alternatives when a firm search fails.

CONTEXT:
Firm searches can fail because:
1. Industry terminology varies (e.g., "VC" vs "Venture Capital" vs "Investment Firm")
2. Location is too narrow (city vs metro area vs state)
3. Company size filters are too restrictive
4. Spelling or naming variations

INDUSTRY KNOWLEDGE:
- Finance: "Investment Banking", "IB", "Investment Bank", "Financial Services"
- VC/PE: "Venture Capital", "VC", "Private Equity", "PE", "Growth Equity", "Investment Firm"
- Consulting: "Management Consulting", "Strategy Consulting", "Consulting Firm"
- Tech: "Technology", "Software", "SaaS", "Enterprise Software"
- Hedge Funds: "Hedge Fund", "Asset Management", "Investment Management", "Alternative Investments"

LOCATION SUGGESTIONS:
- If city-level fails, suggest the metro area or state
- NYC → "New York Metro", "New York State"
- SF → "Bay Area", "California"
- Boston → "Greater Boston", "Massachusetts"

YOUR TASK:
Generate 3-5 alternative search terms that might work better.
Consider:
1. Alternative industry terminology
2. Broader locations
3. Related industries

RESPONSE FORMAT (JSON):
{
  "message": "Brief, friendly explanation of why the search may have failed and what you suggest",
  "suggestions": ["Alternative 1", "Alternative 2", "Alternative 3"],
  "recommended_industry": "Best alternative industry term",
  "recommended_location": "Broader location if applicable, or original"
}

Keep the message to 1-2 sentences."""
```

### 4.8 Firm Assistant Prompts

#### Generate Firm Query from Resume

**Located in:** `backend/app/services/scout_service.py:2773-2834`

```python
"""Analyze this user's resume and generate a relevant FIRM/COMPANY search query for them.

USER'S RESUME:
{user_resume_json[:3000]}

USER'S REQUEST:
{message}

CRITICAL: This is a FIRM SEARCH, not a job search. Generate a query to find COMPANIES/FIRMS, not job positions.

TASK:
Generate a natural language firm search query that would help this user find relevant COMPANIES to target.

IMPORTANT REQUIREMENTS:
1. Industry must be one of these exact values:
   - "investment banking"
   - "real estate private equity"
   - "venture capital"
   - "private equity"
   - "consulting"
   - "software engineering"
   - "product management"
   - "hedge fund"
   - "asset management"
   - "accounting"
   
   Map similar terms:
   - "data science" → "software engineering" (data science companies are software/tech companies)
   - "VC" → "venture capital"
   - "PE" → "private equity"
   - "IB" → "investment banking"
   - "MBB" → "consulting"
   - "tech" → "software engineering"
   - "finance" → "investment banking" or "asset management" depending on context

2. Location must be included (city, state, or region). If not in resume, use a major city relevant to their field.

3. Query format should be about COMPANIES/FIRMS, not job positions:
   ✅ CORRECT: "Mid-sized investment banks in New York focused on healthcare M&A"
   ✅ CORRECT: "Software engineering companies in Los Angeles focused on data science"
   ❌ WRONG: "Entry-level data science positions in Los Angeles" (this is a job search, not firm search)

4. Focus on COMPANY characteristics:
   - Company size: "boutique", "mid-sized", "large"
   - Company type: "firms", "companies", "organizations"
   - Industry focus areas (optional): "focused on X", "specializing in Y"

Return JSON:
{
    "search_query": "the natural language search query to find COMPANIES/FIRMS",
    "explanation": "brief explanation of why this search is relevant to their background (2-3 sentences)",
    "key_factors": ["factor 1", "factor 2", "factor 3"]
}
"""
```

---

## 5. Intent Classification

### 5.1 Intent Types

Scout uses 5 main intent types:

1. **URL_PARSE** - User shared a URL to a job posting
2. **JOB_SEARCH** - User wants to find job listings
3. **FIELD_HELP** - User needs help with what to enter in search fields
4. **RESEARCH** - User asking about a company, role, interview process, etc.
5. **CONVERSATION** - General chat, follow-up, or unclear intent

### 5.2 Classification Method

**Location:** `backend/app/services/scout_service.py:251-536`

#### Step 1: Regex Pattern Matching (Fast Path)

1. **URL Detection**
   - Pattern: `https?://[^\s<>"{}|\\^`\[\]]+`
   - If found → `URL_PARSE`

2. **Job Search Patterns**
   - Multiple regex patterns for job search keywords
   - Extracts `job_title` and `location` from message
   - If matched → `JOB_SEARCH`

3. **Field Help Patterns**
   - Patterns like: `\b(what|which)\b.*\b(title|job title|role)\b.*\b(should|would|to use)\b`
   - If matched → `FIELD_HELP`

4. **Research Patterns**
   - Patterns like: `\b(what|how|tell me about|describe)\b.*\b(interview|culture|salary|compensation|benefits)\b`
   - If matched → `RESEARCH`

#### Step 2: LLM Classification (Fallback)

If regex doesn't match, calls OpenAI with classification prompt (see Section 4.2).

**Timeout:** 10 seconds  
**Fallback:** If LLM times out, uses heuristic fallback (checks for job keywords + location keywords)

### 5.3 Entity Extraction

During classification, extracts:
- `job_title` - Specific role mentioned
- `company` - Company name mentioned
- `location` - City/location mentioned
- `experience_level` - intern, entry, mid, senior, etc.

---

## 6. Special Features

### 6.1 URL Parsing

**What URLs are recognized:**
- Any HTTP/HTTPS URL in the message
- Common job board URLs (LinkedIn, Indeed, company career pages, Greenhouse, Lever, etc.)

**How they're parsed:**
1. URL detected via regex
2. Content fetched via Jina Reader API (with 4.5s timeout)
3. Job details extracted using GPT-4o-mini
4. Fields normalized (job title simplified, company normalized, location normalized)

**What data is extracted:**
- `job_title` - Simplified, searchable title
- `company` - Company name (inferred from URL domain if needed)
- `location` - City, State or "Remote"
- `experience_level` - intern, entry, mid, senior, lead, manager, director
- `summary` - 1-2 sentence role summary

**Response format:**
- Returns `SearchFields` object
- Auto-populates contact search form
- If resume available, includes quick fit analysis

### 6.2 Job Search

**What triggers it:**
- User message contains job search keywords ("find", "search", "look for", "jobs", "postings", "openings")
- AND location keywords ("in", "at", "near", or specific cities)

**What API is called:**
- SERP API (Google Search Results) via `serpapi` Python library
- Query built from extracted job title and location
- If resume available, generates job titles from resume first

**How results are formatted:**
- Up to 10 job listings returned
- Each listing has: title, company, location, url, snippet
- Jobs filtered and ranked by resume relevance if resume available

**How job cards are rendered:**
- Clickable cards in chat message
- Shows title, company, location
- "Analyze Fit" button (if resume uploaded)
- "View" button to open job posting URL
- Clicking card populates search fields

### 6.3 Job Fit Analysis

**When it's available:**
- User has uploaded resume in Account Settings
- User clicks "Analyze Fit" button on a job listing

**What inputs it needs:**
- Job object: `{ title, company, location, url, snippet }`
- User resume: Full resume data from Firestore

**How the analysis works:**
1. Fetches full job description from URL (3s timeout, non-blocking)
2. Calls GPT-4o-mini with detailed prompt (see Section 4.5)
3. Generates comprehensive analysis
4. Returns structured response

**Response format:**
```typescript
{
  score: 0-100,
  match_level: "strong" | "good" | "moderate" | "stretch",
  strengths: [{ point: string, evidence: string }],
  gaps: [{ gap: string, mitigation: string }],
  pitch: string,
  talking_points: string[],
  keywords_to_use: string[]
}
```

**UI Display:**
- Expandable panel below job card
- Shows score, match level, strengths, gaps, pitch, talking points, keywords
- "Find Contacts in This Role" button (stores fit context for email generation)
- Fit context stored in localStorage as `scout_fit_context`

### 6.4 Firm Search Assistance

**How it differs from main Scout:**
- Specialized for Firm Search page only
- Focuses on company/firm discovery, not job search
- Has context about current search results

**What triggers it:**
- User clicks "Ask Scout" button on Firm Search page
- Opens draggable/resizable chat window

**Special prompts or logic:**
- Classifies request type: `generate_query`, `refine_query`, `recommend_firms`, `research_firm`, `next_steps`
- Can generate search query from resume
- Can recommend firms from current results based on background
- Can research specific firms

**Quick Actions:**
- Context-aware buttons change based on:
  - Whether user has search results
  - Whether user has a query
  - Whether user has resume uploaded

### 6.5 Search Help Mode

**What triggers it:**
- Contact search returns no results
- Firm search returns no results
- Search encounters an error

**What suggestions are shown:**
- For contact search: Alternative job titles (company-specific variations)
- For firm search: Broader industry terms, alternative locations

**"Continue" button behavior:**
1. Stores auto-populate data in sessionStorage (`scout_auto_populate`)
2. Closes Scout panel
3. Navigates to appropriate page (contact-search or firm-search)
4. If already on page, dispatches `scout-auto-populate` event
5. Page reads sessionStorage and populates fields

### 6.6 Navigation Suggestions

**How Scout knows to suggest pages:**
- System prompt includes knowledge base with all pages and routes
- GPT analyzes user intent and suggests relevant route
- Route keywords mapped in `scout-knowledge.ts`

**How navigation is handled in frontend:**
- Response includes `navigate_to` field with route
- Frontend displays "Take me there" button
- Button calls `handleNavigate(route, autoPopulate)`
- Stores auto-populate in sessionStorage
- Navigates using React Router
- Target page reads sessionStorage and populates fields

---

## 7. Conversation Flow

### 7.1 Message Lifecycle

```
1. User types message
   ↓
2. Frontend: sendMessage() called
   - Creates user message object
   - Adds to messages state
   - Clears input
   - Sets isLoading = true
   ↓
3. API call to /api/scout/chat or /api/scout-assistant/chat
   - Includes message, conversation_history, context
   - Headers: Authorization Bearer token (for assistant)
   ↓
4. Backend: Service classifies intent
   - Regex patterns first (fast)
   - LLM classification if ambiguous
   ↓
5. Backend: Routes to handler
   - URL_PARSE → _handle_url_parse()
   - JOB_SEARCH → _handle_job_search()
   - etc.
   ↓
6. Backend: Handler processes request
   - May call external APIs (Jina, SERP, OpenAI)
   - Generates response
   ↓
7. Backend: Returns response
   - message: string
   - fields?: SearchFields
   - job_listings?: JobListing[]
   - navigate_to?: string
   - etc.
   ↓
8. Frontend: Receives response
   - Creates assistant message object
   - Adds to messages state
   - Updates context if provided
   - Auto-populates fields if provided
   ↓
9. UI update
   - Message rendered in chat
   - Job listings shown as cards
   - Navigation buttons displayed
   - Auto-scroll to bottom
```

### 7.2 Conversation History

**Scout Assistant (scout-assistant):**
- Last 10 messages sent to OpenAI
- Stored in frontend state and sessionStorage
- Persists across page navigation
- Clears on browser close

**Job Search Scout (scout):**
- Context object passed between messages
- Includes `history` array (last 6 messages)
- Includes `recent_topics` array
- Includes `user_resume` if available
- Stored in context state, not persisted

### 7.3 Context Management

**Scout Assistant:**
- No persistent context between sessions
- Each message includes current page and user info
- Conversation history only for current session

**Job Search Scout:**
- Context object maintained in component state
- Updated with each response
- Includes: history, recent_topics, user_resume, last_search_query, last_fields

---

## 8. State & Persistence

### 8.1 Conversation History Storage

**Scout Assistant (useScoutChat hook):**
- **Storage:** sessionStorage
- **Key:** `scout_chat_messages`
- **Format:** JSON array of ChatMessage objects
- **Persistence:** Across page navigation, cleared on browser close
- **Loading:** Loaded on hook initialization

**Job Search Scout (ScoutChatbot):**
- **Storage:** Component state only
- **Persistence:** Lost on component unmount
- **No persistence:** Messages don't persist across page refreshes

**ScoutHelperChatbot:**
- **Storage:** Firestore (`users/{uid}/scoutConversations/{conversationId}`)
- **Format:** ScoutConversation document with messages array
- **Persistence:** Permanent, persists across sessions
- **Features:** Multiple conversations, titles, metadata

### 8.2 Context Between Messages

**Scout Assistant:**
- No context passed between messages
- Each message is independent
- User info (name, tier, credits) sent with each request

**Job Search Scout:**
- Context object maintained in state
- Updated with each response
- Includes conversation history, recent topics, user resume

### 8.3 Persistence Across Navigation

**Scout Assistant:**
- Messages persist in sessionStorage
- Survives page navigation
- Clears on browser close

**Job Search Scout:**
- No persistence
- Messages lost on page refresh

### 8.4 Persistence Across Refresh

**Scout Assistant:**
- Yes, via sessionStorage
- Messages reloaded on mount

**Job Search Scout:**
- No, messages lost

### 8.5 What Clears on Logout

- All sessionStorage cleared
- All component state cleared
- Firestore conversations remain (user-specific)

### 8.6 Auto-Populate Data

**Storage:** sessionStorage  
**Key:** `scout_auto_populate`  
**Format:**
```json
{
  "search_type": "contact" | "firm",
  "job_title": "string",
  "company": "string",
  "location": "string",
  "industry": "string"
}
```

**Usage:**
- Set when Scout suggests navigation with auto-populate
- Read by target page on mount
- Cleared after use

### 8.7 Fit Context Storage

**Storage:** localStorage  
**Key:** `scout_fit_context`  
**Format:**
```json
{
  "job_title": "string",
  "company": "string",
  "score": 0-100,
  "match_level": "string",
  "pitch": "string",
  "talking_points": [],
  "strengths": [],
  "gaps": [],
  "keywords": []
}
```

**Usage:**
- Set when user clicks "Find Contacts in This Role" after analyzing fit
- Read by email generation to include fit context
- Persists until cleared

---

## 9. User Context

### 9.1 How Scout Gets User Data

**Scout Assistant:**
- User info passed in request: `{ name, tier, credits, max_credits }`
- Frontend gets from `useFirebaseAuth()` hook
- Firebase token sent in Authorization header
- Backend can extract user info from token if needed

**Job Search Scout:**
- User resume passed in context: `{ user_resume: UserResume }`
- Frontend loads resume from Firestore in component
- Resume data includes: name, university, major, year, location, skills, key_experiences, achievements, interests

### 9.2 What Fields Are Available

**User Info (Scout Assistant):**
- `name` - User's display name
- `tier` - Subscription tier (free, pro, elite)
- `credits` - Current credit balance
- `max_credits` - Maximum credits for tier
- `current_page` - Current route

**User Resume (Job Search Scout):**
- `name` - Name from resume
- `university` - School name
- `major` - Field of study
- `year` - Graduation year
- `location` - Location from resume
- `skills` - Array of skills
- `key_experiences` - Array of experience descriptions
- `achievements` - Array of achievements
- `interests` - Array of interests
- `rawText` - Full resume text (if available)
- `resumeParsed` - Nested parsed structure (if available)

### 9.3 How Context Is Used

**In Prompts:**
- User name used for personalization ("Hi John!")
- Tier and credits mentioned when relevant
- Current page used to provide context-aware help
- Resume data used for job fit analysis and personalized suggestions

**In Responses:**
- Credit costs mentioned based on user's tier
- Feature availability based on tier
- Personalized recommendations based on resume
- Location preferences from resume used in job searches

---

## 10. Error Handling

### 10.1 API Call Failures

**Frontend:**
- Try-catch blocks around fetch calls
- Error message added to chat: "I ran into an issue. Please try again or rephrase your message."
- Loading state cleared
- Input refocused

**Backend:**
- Try-catch blocks around service calls
- Returns error response with status "error"
- Error logged to console with traceback
- Graceful fallback responses provided

### 10.2 Timeout Handling

**URL Fetching (Jina Reader):**
- Timeout: 4.5 seconds
- On timeout: Returns null, falls back to SERP search
- Error logged but doesn't break flow

**OpenAI Calls:**
- Various timeouts depending on operation:
  - Intent classification: 10s
  - Job extraction: 15s
  - Job fit analysis: 45s (detailed), 10s (quick)
  - Conversation: 15s
- On timeout: Falls back to heuristic or default response
- Error logged, user sees helpful fallback message

**Job Fit Analysis:**
- Overall timeout: 50 seconds
- URL fetch timeout: 3 seconds (non-blocking)
- GPT call timeout: 45 seconds
- On timeout: Returns error message, doesn't break UI

### 10.3 Fallback Responses

**Intent Classification Timeout:**
- Uses heuristic fallback (checks for job keywords + location)
- Defaults to CONVERSATION intent

**URL Parse Failure:**
- Falls back to SERP search for the URL
- If that fails, asks user to paste job details directly

**Job Search No Results:**
- Calls `_handle_no_jobs_found()`
- Suggests alternative job titles
- Provides helpful tips

**OpenAI API Failure:**
- Returns helpful fallback message
- Doesn't expose technical error to user
- Logs error for debugging

### 10.4 Error UI States

**Loading States:**
- `isLoading` state shows "Thinking..." message
- Loading bar component for visual feedback
- Input disabled during loading

**Error States:**
- Error message displayed as assistant message
- Styled like normal message (not red/error styling)
- User can retry by sending another message

**Network Errors:**
- Caught in try-catch
- User sees: "I ran into an issue. Please try again or rephrase your message."
- No technical details exposed

---

## 11. OpenAI Integration

### 11.1 Models Used

**Primary Model:** `gpt-4o-mini`

Used for:
- Intent classification
- Job extraction from URLs
- Job fit analysis (quick and detailed)
- Conversation responses
- Search help suggestions
- Firm assistant queries

**No other models currently used.**

### 11.2 Temperature and Parameters

**Intent Classification:**
- Temperature: `0` (deterministic)
- Max tokens: `150`
- Response format: `json_object`

**Job Extraction:**
- Temperature: `0` (deterministic)
- Max tokens: `300`
- Response format: `json_object`

**Job Fit Analysis (Quick):**
- Temperature: `0.3`
- Max tokens: `400`
- Response format: `json_object`

**Job Fit Analysis (Detailed):**
- Temperature: `0.4`
- Max tokens: `800`
- Response format: `json_object`

**Conversation:**
- Temperature: `0.7`
- Max tokens: `400`
- Response format: `text` (not JSON)

**Scout Assistant:**
- Temperature: `0.7`
- Max tokens: `500`
- Response format: `json_object`

**Search Help:**
- Temperature: `0.7`
- Max tokens: `300`
- Response format: `json_object`

### 11.3 Token Limits

**Input Limits:**
- Job content: Truncated to 8000 chars for extraction, 4000 for analysis
- Resume: Truncated to 4000 chars
- Conversation history: Last 10 messages (assistant), last 6 messages (job search)

**Output Limits:**
- See max_tokens above for each operation

### 11.4 Conversation History Formatting

**For OpenAI API:**
```python
messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": "message 1"},
    {"role": "assistant", "content": "response 1"},
    {"role": "user", "content": "message 2"},
    ...
]
```

**History Length:**
- Scout Assistant: Last 10 messages
- Job Search Scout: Last 6 messages

### 11.5 Rate Limiting

**Not implemented in code.**
- Relies on OpenAI's built-in rate limiting
- No retry logic for rate limit errors
- Errors would be caught and shown as generic error message

---

## 12. Current Limitations

### 12.1 Features Partially Implemented

1. **Conversation Persistence (Job Search Scout)**
   - Messages don't persist across page refreshes
   - Only ScoutHelperChatbot uses Firestore persistence
   - ScoutChatbot loses all messages on unmount

2. **Resume-Based Job Search**
   - Location extraction from resume is inconsistent
   - Falls back to searching without location if extraction fails
   - No validation that location was successfully extracted

3. **Job Fit Analysis Caching**
   - Analysis results cached in component state only
   - Lost on page refresh
   - No backend caching of analysis results

### 12.2 Inconsistencies Between Components

1. **Two Different Scout Implementations**
   - `ScoutChatbot` - Job search focused, uses `/api/scout/chat`
   - `ScoutPage`/`ScoutSidePanel` - Product assistant, uses `/api/scout-assistant/chat`
   - Different APIs, different purposes, confusing naming

2. **Persistence Strategies**
   - Scout Assistant: sessionStorage
   - Job Search Scout: No persistence
   - ScoutHelperChatbot: Firestore
   - Three different approaches

3. **Context Management**
   - Scout Assistant: No context between messages
   - Job Search Scout: Context object in state
   - Inconsistent approaches

### 12.3 Missing Error Handling

1. **OpenAI API Errors**
   - No specific handling for rate limits
   - No retry logic
   - Generic error messages don't help user understand issue

2. **Network Timeouts**
   - Some operations have timeouts, others don't
   - Inconsistent timeout handling
   - User may wait indefinitely in some cases

3. **Invalid Responses**
   - JSON parsing errors caught but not handled gracefully
   - May return partial or malformed data
   - No validation of response structure

### 12.4 UI/UX Issues

1. **Loading States**
   - Some operations show loading, others don't
   - No progress indication for long operations (job fit analysis)
   - User may think app is frozen

2. **Error Messages**
   - Generic error messages don't help user
   - No actionable guidance on what to do
   - Errors styled same as normal messages (not obvious)

3. **Job Fit Analysis UI**
   - Expandable panel can be confusing
   - No clear indication that analysis is available
   - Fit context storage not obvious to user

### 12.5 Performance Concerns

1. **Multiple API Calls**
   - Job search may make multiple SERP calls (one per generated title)
   - No batching or optimization
   - Can be slow for resume-based searches

2. **Large Payloads**
   - Resume data sent with every request
   - No compression or optimization
   - May hit size limits for very large resumes

3. **No Caching**
   - URL parsing results cached, but analysis results not
   - Same job analyzed multiple times
   - Wastes API calls and credits

### 12.6 Known Bugs

1. **Location Extraction**
   - Inconsistent extraction from resume
   - May search without location filter
   - Results may be from wrong location

2. **Job Title Simplification**
   - May over-simplify titles
   - Could lose important qualifiers
   - May not work for all title formats

3. **Conversation History**
   - Job Search Scout context may get out of sync
   - History not properly maintained
   - May lose context on errors

### 12.7 Incomplete Features

1. **Firm Assistant**
   - Some handler methods may not be fully implemented
   - Error handling may be incomplete
   - Not all request types may be handled

2. **Search Help**
   - Fallback suggestions are basic
   - May not cover all edge cases
   - Company-specific knowledge limited

3. **Auto-Populate**
   - May not work on all pages
   - SessionStorage may not be read correctly
   - Event dispatching may not be handled

---

## Appendix: Code Locations Reference

### Frontend Files

- **Main Components:**
  - `connect-grow-hire/src/components/ScoutChatbot.tsx` - Job search chatbot
  - `connect-grow-hire/src/components/ScoutPage.tsx` - Full-page assistant
  - `connect-grow-hire/src/components/ScoutSidePanel.tsx` - Side panel
  - `connect-grow-hire/src/components/ScoutHelperChatbot.tsx` - Helper chatbot
  - `connect-grow-hire/src/components/ScoutFirmAssistant.tsx` - Firm assistant
  - `connect-grow-hire/src/components/ScoutHeaderButton.tsx` - Header button
  - `connect-grow-hire/src/components/ScoutBubble.tsx` - Floating bubble (deprecated)
  - `connect-grow-hire/src/components/ScoutConversationList.tsx` - Conversation list

- **Hooks & Services:**
  - `connect-grow-hire/src/hooks/useScoutChat.ts` - Chat hook
  - `connect-grow-hire/src/services/scoutConversations.ts` - Firestore service
  - `connect-grow-hire/src/contexts/ScoutContext.tsx` - Global context
  - `connect-grow-hire/src/types/scout.ts` - TypeScript types
  - `connect-grow-hire/src/data/scout-knowledge.ts` - Knowledge base

### Backend Files

- **Routes:**
  - `backend/app/routes/scout.py` - Job search Scout API
  - `backend/app/routes/scout_assistant.py` - Product assistant API

- **Services:**
  - `backend/app/services/scout_service.py` - Job search service (~3480 lines)
  - `backend/app/services/scout_assistant_service.py` - Assistant service (~700 lines)

### Environment Variables

- `SERPAPI_KEY` - For job search via SERP API
- `JINA_API_KEY` - For URL content fetching
- `OPENAI_API_KEY` - For GPT calls (via openai_client)

### Database Collections

- `users/{uid}/scoutConversations/{conversationId}` - Scout conversation history (Firestore)
  - Fields: `title`, `createdAt`, `updatedAt`, `messageCount`, `lastMessage`, `messages[]`, `metadata`

---

**End of Audit Document**

