# Scout Implementation - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [Key Features](#key-features)
6. [Data Flow](#data-flow)
7. [API Endpoints](#api-endpoints)
8. [Integration Points](#integration-points)
9. [Data Models](#data-models)
10. [Utilities & Helpers](#utilities--helpers)

---

## Overview

Scout is an AI-powered conversational job search assistant integrated into Offerloop. It helps users:
- Parse job posting URLs to extract search parameters
- Find job listings based on natural language queries
- Analyze job fit based on user resumes
- Generate firm search queries
- Provide research and recommendations

Scout appears as a floating chat interface accessible from multiple pages in the application.

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React/TypeScript)                │
├─────────────────────────────────────────────────────────────┤
│  ScoutChatbot.tsx          │  ScoutFirmAssistant.tsx        │
│  ScoutBubble.tsx            │  ScoutHeaderButton.tsx         │
│  ScoutFirmAssistantButton.tsx                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/JSON
                            │
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Flask/Python)                    │
├─────────────────────────────────────────────────────────────┤
│  routes/scout.py          │  services/scout_service.py     │
│  - /api/scout/chat         │  - Intent classification      │
│  - /api/scout/analyze-job  │  - URL parsing                │
│  - /api/scout/firm-assist  │  - Job search                 │
│  - /api/scout/health        │  - Firm assistance            │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ API Calls
                            │
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
├─────────────────────────────────────────────────────────────┤
│  OpenAI (GPT-4o-mini)     │  Jina Reader API               │
│  SERP API (Google Jobs)   │  Firestore (User Data)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Implementation

### File Structure

```
backend/
├── app/
│   ├── routes/
│   │   └── scout.py              # API endpoints
│   └── services/
│       └── scout_service.py      # Core business logic
```

### Routes (`backend/app/routes/scout.py`)

#### 1. `/api/scout/chat` (POST)
Main chat endpoint for conversational interactions.

**Request:**
```json
{
  "message": "user's message or URL",
  "context": {
    "user_resume": {...},
    "recent_topics": [...],
    "history": [...]
  }
}
```

**Response:**
```json
{
  "status": "ok" | "needs_input" | "error",
  "message": "Scout's response",
  "fields": {
    "job_title": "...",
    "company": "...",
    "location": "...",
    "experience_level": "..."
  },
  "job_listings": [
    {
      "title": "...",
      "company": "...",
      "location": "...",
      "url": "...",
      "snippet": "..."
    }
  ],
  "intent": "URL_PARSE" | "JOB_SEARCH" | "FIELD_HELP" | "RESEARCH" | "CONVERSATION",
  "context": {...}
}
```

#### 2. `/api/scout/analyze-job` (POST)
Analyze job fit based on user's resume.

**Request:**
```json
{
  "job": {
    "title": "...",
    "company": "...",
    "location": "...",
    "url": "...",
    "snippet": "..."
  },
  "user_resume": {...}
}
```

**Response:**
```json
{
  "status": "ok",
  "analysis": {
    "score": 75,
    "match_level": "good",
    "strengths": [
      {
        "point": "Strong Python experience",
        "evidence": "Built ML models in coursework"
      }
    ],
    "gaps": [
      {
        "gap": "Missing cloud experience",
        "mitigation": "Highlight transferable skills from local deployments"
      }
    ],
    "pitch": "As a Data Science major with experience in...",
    "talking_points": [
      "Mention your capstone project",
      "Discuss your Python portfolio"
    ],
    "keywords_to_use": ["Python", "Machine Learning", "Data Analysis"]
  }
}
```

#### 3. `/api/scout/firm-assist` (POST)
Firm search assistant for helping users find and research companies.

**Request:**
```json
{
  "message": "user's request",
  "firm_context": {
    "current_query": "investment banks in NYC...",
    "current_results": [
      {
        "name": "Goldman Sachs",
        "industry": "...",
        "location": {...}
      }
    ],
    "parsed_filters": {
      "industry": "investment banking",
      "location": "New York",
      "focus": "healthcare"
    }
  },
  "user_resume": {...},
  "fit_context": {...},
  "conversation_history": [...]
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Scout's response",
  "suggestions": {
    "refined_query": "...",
    "recommended_firms": ["...", "..."],
    "firm_insights": {...},
    "next_steps": ["...", "..."]
  },
  "action_type": "refine_query" | "recommend_firms" | "research_firm" | "next_steps" | "general"
}
```

#### 4. `/api/scout/health` (GET)
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "scout"
}
```

### Service (`backend/app/services/scout_service.py`)

#### Core Class: `ScoutService`

The main service class that orchestrates all Scout functionality.

**Key Methods:**

1. **`handle_chat(message, context)`**
   - Main entry point for chat interactions
   - Classifies intent and routes to appropriate handler
   - Returns `ScoutResponse` object

2. **`_classify_intent(message, context)`**
   - Uses regex patterns and LLM to classify user intent
   - Returns: `(IntentType, extracted_entities)`
   - Intent types: `URL_PARSE`, `JOB_SEARCH`, `FIELD_HELP`, `RESEARCH`, `CONVERSATION`

3. **`_handle_url_parse(url, context)`**
   - Fetches job posting content via Jina Reader API
   - Extracts job details using LLM
   - Analyzes job fit if resume available
   - Returns fields to auto-populate search form

4. **`_handle_job_search(message, extracted, context)`**
   - Searches for jobs using SERP API (Google Jobs)
   - Supports resume-based job title generation
   - Filters and ranks jobs by resume relevance
   - Returns job listings and optimized search fields

5. **`analyze_job_fit(job, user_resume)`**
   - Deep analysis of user fit for a specific job
   - Fetches full job description if URL available
   - Returns comprehensive fit analysis with score, strengths, gaps, pitch, etc.

6. **`handle_firm_assist(message, firm_context, user_resume, fit_context, conversation_history)`**
   - Handles firm search assistance
   - Routes to: generate query, refine query, recommend firms, research firm, next steps

#### Intent Classification

Scout uses a multi-stage approach to classify user intent:

1. **Regex Patterns** (fast path):
   - URL detection: `https?://[^\s<>"{}|\\^`\[\]]+`
   - Job search patterns: `\b(find|search|look for)\b.*\b(jobs?|roles?)\b`
   - Field help patterns: `\b(what|which)\b.*\b(title|job title)\b`
   - Research patterns: `\b(what|how|tell me about)\b.*\b(interview|culture)\b`

2. **LLM Classification** (fallback):
   - Used when regex patterns don't match
   - Returns structured JSON with intent and extracted entities

#### URL Parsing Flow

```
User pastes URL
    ↓
Check cache
    ↓
Fetch content via Jina Reader API
    ↓
Extract job details using LLM
    ↓
Normalize fields (title, company, location)
    ↓
Analyze job fit (if resume available)
    ↓
Return fields + analysis
```

#### Job Search Flow

```
User query: "data analyst jobs in NYC"
    ↓
Classify intent: JOB_SEARCH
    ↓
Extract entities: {job_title: "data analyst", location: "NYC"}
    ↓
Build search query: "data analyst jobs in New York, NY"
    ↓
Search via SERP API (Google Jobs)
    ↓
Filter/rank by resume relevance (if resume available)
    ↓
Aggregate fields from results
    ↓
Return job listings + optimized fields
```

#### Resume-Based Job Search

Special handling when user asks for jobs "based on my resume":

1. Generate 2-3 specific job titles from resume using GPT
2. Extract location from resume (prioritize resume location over job results)
3. Search for each generated title
4. Filter out irrelevant jobs (retail, manual labor, etc.)
5. Rank by relevance score (major match, skills match, experience match)
6. Return top matches

#### Job Fit Analysis

Comprehensive analysis includes:

- **Score** (0-100): Overall fit rating
- **Match Level**: `strong`, `good`, `moderate`, `stretch`
- **Strengths**: Array of `{point, evidence}` objects
- **Gaps**: Array of `{gap, mitigation}` objects
- **Pitch**: 2-3 sentence positioning statement
- **Talking Points**: Specific points for networking/interviews
- **Keywords**: Terms to use in resume/cover letter

Analysis considers:
- Major/field alignment
- Skills match
- Key experiences
- Achievements
- Location preferences
- Education level

---

## Frontend Implementation

### Component Structure

```
connect-grow-hire/src/components/
├── ScoutChatbot.tsx              # Main chat interface
├── ScoutBubble.tsx                   # Floating bubble (Contact Search page)
├── ScoutHeaderButton.tsx             # Header button (Contact Search page)
├── ScoutFirmAssistant.tsx            # Firm search assistant chat
└── ScoutFirmAssistantButton.tsx     # Firm assistant button (Firm Search page)
```

### ScoutChatbot Component

**Location:** `connect-grow-hire/src/components/ScoutChatbot.tsx`

**Props:**
```typescript
interface ScoutChatbotProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
  userResume?: UserResume;
}
```

**Key Features:**
- Chat message interface with user/assistant messages
- Job listing display with "Analyze Fit" buttons
- Job fit analysis expansion panel
- Quick action chips (Paste URL, Find jobs, Ask about company)
- Auto-population of search fields
- Job title simplification for better search results

**State Management:**
- `messages`: Chat message history
- `input`: Current input text
- `isLoading`: Loading state
- `context`: Session context
- `jobAnalyses`: Cached job fit analyses
- `expandedJobId`: Currently expanded analysis
- `analyzingJobId`: Job being analyzed

**Key Methods:**

1. **`sendMessage()`**
   - Sends user message to `/api/scout/chat`
   - Updates context and messages
   - Auto-populates fields if returned

2. **`analyzeJob(job, jobId)`**
   - Calls `/api/scout/analyze-job`
   - Caches analysis result
   - Expands analysis panel

3. **`handleJobClick(job)`**
   - Simplifies job title
   - Calls `onJobTitleSuggestion` callback
   - Populates search form

4. **`simplifyJobTitle(title)`**
   - Removes department names, team names, project names
   - Keeps core role and seniority level
   - Examples:
     - "Treasury & Capital Markets Senior Analyst" → "Senior Analyst"
     - "Software Development Engineer II" → "Software Engineer"

### ScoutBubble Component

**Location:** `connect-grow-hire/src/components/ScoutBubble.tsx`

Floating bubble interface for Contact Search page. Opens full chat window when clicked.

**Features:**
- Floating bubble with Scout mascot
- Wave animation on mascot
- Full-screen chat window
- Loads user resume from Firestore

### ScoutHeaderButton Component

**Location:** `connect-grow-hire/src/components/ScoutHeaderButton.tsx`

Header button interface for Contact Search page. Opens draggable/resizable chat window.

**Features:**
- Header button with Scout mascot
- Draggable and resizable chat window
- Positioned in top-right corner
- Maintains position on window resize
- Loads user resume from Firestore

### ScoutFirmAssistant Component

**Location:** `connect-grow-hire/src/components/ScoutFirmAssistant.tsx`

Chat interface for firm search assistance.

**Props:**
```typescript
interface ScoutFirmAssistantProps {
  firmContext: FirmContext;
  userResume?: any;
  fitContext?: any;
  onApplyQuery?: (query: string) => void;
  onFindContacts?: (firmName: string) => void;
}
```

**Features:**
- Context-aware quick actions
- Query refinement suggestions
- Firm recommendations
- Research insights
- Next steps guidance

### ScoutFirmAssistantButton Component

**Location:** `connect-grow-hire/src/components/ScoutFirmAssistantButton.tsx`

Button wrapper for firm assistant with draggable/resizable window.

---

## Key Features

### 1. URL Parsing
- Supports major job board URLs (LinkedIn, Greenhouse, Lever, Workday, etc.)
- Extracts: job title, company, location, experience level
- Normalizes fields for better search results
- Analyzes job fit if resume available

### 2. Natural Language Job Search
- Understands queries like:
  - "data analyst jobs in NYC"
  - "software engineering internships in San Francisco"
  - "find me jobs that fit my resume"
- Extracts entities (job title, location, company)
- Generates optimized search queries
- Returns relevant job listings

### 3. Resume-Based Job Discovery
- Analyzes user resume to generate specific job titles
- Filters out irrelevant jobs (retail, manual labor, etc.)
- Ranks jobs by relevance (major match, skills match, experience match)
- Prioritizes user's location from resume

### 4. Job Fit Analysis
- Comprehensive analysis with score (0-100)
- Identifies strengths with evidence
- Highlights gaps with mitigation strategies
- Provides positioning pitch
- Suggests talking points for networking
- Recommends keywords for resume/cover letter

### 5. Firm Search Assistance
- Generates firm search queries from resume
- Refines existing searches
- Recommends firms based on background
- Researches specific firms
- Suggests next steps

### 6. Field Optimization
- Simplifies job titles (removes department/team names)
- Normalizes company names (removes legal suffixes)
- Normalizes locations (converts to "City, ST" format)
- Handles aliases (NYC → New York, NY)

### 7. Caching
- TTL cache for URL parsing results
- Caches job search results (30 min)
- Caches resume-based job titles (1 hour)
- Reduces API calls and improves performance

---

## Data Flow

### Chat Flow

```
User types message
    ↓
ScoutChatbot.sendMessage()
    ↓
POST /api/scout/chat
    ↓
ScoutService.handle_chat()
    ↓
_classify_intent() → (intent, extracted)
    ↓
Route to handler:
  - _handle_url_parse()
  - _handle_job_search()
  - _handle_field_help()
  - _handle_research()
  - _handle_conversation()
    ↓
Return ScoutResponse
    ↓
Update UI:
  - Add message to chat
  - Auto-populate fields (if returned)
  - Display job listings (if returned)
  - Show fit analysis (if returned)
```

### Job Analysis Flow

```
User clicks "Analyze Fit"
    ↓
ScoutChatbot.analyzeJob()
    ↓
POST /api/scout/analyze-job
    ↓
ScoutService.analyze_job_fit()
    ↓
Fetch full job description (if URL available)
    ↓
Generate analysis using GPT
    ↓
Return DetailedJobFitAnalysis
    ↓
Display in expanded panel:
  - Score and match level
  - Strengths with evidence
  - Gaps with mitigation
  - Pitch statement
  - Talking points
  - Keywords
```

### Firm Assist Flow

```
User asks for firm help
    ↓
ScoutFirmAssistant.sendMessage()
    ↓
POST /api/scout/firm-assist
    ↓
ScoutService.handle_firm_assist()
    ↓
_classify_firm_request() → action_type
    ↓
Route to handler:
  - _handle_generate_firm_query()
  - _handle_refine_firm_query()
  - _handle_firm_recommendations()
  - _handle_firm_research()
  - _handle_firm_next_steps()
  - _handle_general_firm_help()
    ↓
Return response with suggestions
    ↓
Display suggestions with action buttons
```

---

## API Endpoints

### Base URL
- Development: `http://localhost:5001`
- Production: `https://www.offerloop.ai`

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scout/chat` | Main chat endpoint |
| POST | `/api/scout/analyze-job` | Analyze job fit |
| POST | `/api/scout/firm-assist` | Firm search assistance |
| GET | `/api/scout/health` | Health check |

---

## Integration Points

### 1. Firestore
- Loads user resume data from `users/{uid}`
- Accesses `resumeParsed` and `resumeText` fields
- Used for job fit analysis and resume-based searches

### 2. OpenAI
- Model: `gpt-4o-mini`
- Used for:
  - Intent classification
  - Job detail extraction
  - Job fit analysis
  - Job title generation
  - Firm query generation
  - General conversation

### 3. Jina Reader API
- URL: `https://r.jina.ai/`
- Used for fetching job posting content
- Handles various job board formats
- Extracts clean text from HTML

### 4. SERP API
- Engine: `google_jobs`
- Used for job search
- Returns structured job listings
- Includes: title, company, location, URL, description

### 5. Contact Search Form
- Auto-populates via `onJobTitleSuggestion` callback
- Receives: job_title, company, location
- Optimized fields for better contact matching

### 6. Firm Search Form
- Receives refined queries via `onApplyQuery` callback
- Can trigger contact search via `onFindContacts` callback

---

## Data Models

### SearchFields
```python
@dataclass
class SearchFields:
    job_title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    experience_level: Optional[str] = None
```

### JobListing
```python
@dataclass
class JobListing:
    title: str
    company: str
    location: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    source: str = "serp"
```

### DetailedJobFitAnalysis
```python
@dataclass
class DetailedJobFitAnalysis:
    score: int  # 0-100
    match_level: str  # "strong", "good", "moderate", "stretch"
    strengths: List[Dict[str, str]]  # [{"point": "...", "evidence": "..."}]
    gaps: List[Dict[str, str]]  # [{"gap": "...", "mitigation": "..."}]
    pitch: str
    talking_points: List[str]
    keywords_to_use: List[str]
```

### ScoutResponse
```python
@dataclass
class ScoutResponse:
    status: str  # "ok", "needs_input", "error"
    message: str
    fields: Optional[SearchFields] = None
    job_listings: List[JobListing] = field(default_factory=list)
    intent: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    fit_analysis: Optional[JobFitAnalysis] = None
```

---

## Utilities & Helpers

### Job Title Simplification

**Method:** `_simplify_job_title(job_title: str) -> str`

Removes department names, team names, project names while keeping core role.

**Examples:**
- "Consulting Services - Senior Consultant" → "Senior Consultant"
- "AI Research Scientist, Text Data Research - MSL FAIR" → "AI Research Scientist"
- "Software Engineer, Infrastructure Team" → "Software Engineer"
- "Product Manager - Growth" → "Product Manager"

**Algorithm:**
1. Split on dashes/commas
2. Score each part (role keywords = +2, department keywords = -3)
3. Select part with highest score
4. Remove parenthetical team names
5. Remove trailing department indicators

### Location Normalization

**Method:** `_normalize_location(location: str) -> Optional[str]`

Converts to PDL-compatible format: "City, ST"

**Examples:**
- "Los Angeles, California, USA" → "Los Angeles, CA"
- "San Francisco Bay Area" → "San Francisco, CA"
- "NYC" → "New York, NY"
- "Remote" → None

**Features:**
- Handles city aliases (NYC, LA, SF, etc.)
- Converts full state names to abbreviations
- Handles major cities without state
- Filters out "Remote" (PDL doesn't search remote well)

### Company Normalization

**Method:** `_normalize_company(company: str) -> Optional[str]`

Simplifies company names for better search.

**Examples:**
- "Meta Platforms, Inc." → "Meta"
- "Alphabet Inc." → "Google"
- "Amazon.com, Inc." → "Amazon"
- "The Regents of the University of California on behalf of their Los Angeles Campus" → "UCLA"

**Features:**
- Removes legal suffixes (Inc., LLC, Corp., etc.)
- Handles university legal names
- Simplifies tech giants
- Removes "The" prefix when appropriate

### Caching

**Class:** `TTLCache`

Simple in-memory TTL cache for:
- URL parsing results (1 hour)
- Job search results (30 min)
- Resume-based job titles (1 hour)

**Usage:**
```python
cache_key = self._cache.make_key("url", url)
cached = self._cache.get(cache_key)
if cached:
    return cached
# ... compute result ...
self._cache.set(cache_key, result, ttl=3600)
```

---

## Error Handling

### Timeout Handling
- URL fetching: 4.5s timeout
- LLM calls: 8-50s timeouts (varies by operation)
- Overall job analysis: 50s timeout
- Graceful fallbacks on timeout

### Error Responses
- Returns user-friendly error messages
- Logs detailed errors server-side
- Continues operation when possible (e.g., uses snippet if URL fetch fails)

### Fallbacks
- Regex-based intent classification if LLM unavailable
- Basic job title extraction if full parsing fails
- Generic responses if specific handlers fail

---

## Performance Optimizations

1. **Caching**: Reduces redundant API calls
2. **Async Operations**: Non-blocking I/O
3. **Timeout Management**: Prevents hanging requests
4. **Content Truncation**: Limits content length to avoid token limits
5. **Batch Operations**: Searches multiple job titles in parallel
6. **Early Returns**: Skips unnecessary processing

---

## Future Enhancements

Potential improvements:
1. Persistent conversation history (Firestore)
2. Multi-turn conversation support
3. Saved job analyses
4. Email generation integration with fit context
5. Advanced filtering options
6. Integration with more job boards
7. Real-time job alerts
8. Interview preparation assistance

---

## Testing

### Manual Testing Checklist

1. **URL Parsing**
   - [ ] LinkedIn job URLs
   - [ ] Greenhouse URLs
   - [ ] Lever URLs
   - [ ] Workday URLs
   - [ ] Generic job board URLs

2. **Job Search**
   - [ ] Simple queries ("data analyst jobs in NYC")
   - [ ] Resume-based searches
   - [ ] Location extraction
   - [ ] Job title extraction

3. **Job Fit Analysis**
   - [ ] With resume uploaded
   - [ ] Without resume
   - [ ] Different match levels (strong, good, moderate, stretch)
   - [ ] URL fetching for full description

4. **Firm Assistance**
   - [ ] Query generation from resume
   - [ ] Query refinement
   - [ ] Firm recommendations
   - [ ] Firm research

5. **UI Components**
   - [ ] Chat interface
   - [ ] Job listing display
   - [ ] Analysis expansion
   - [ ] Field auto-population
   - [ ] Draggable/resizable windows

---

## Configuration

### Environment Variables

```python
# OpenAI
OPENAI_API_KEY=...

# SERP API
SERPAPI_KEY=...

# Jina Reader
JINA_API_KEY=...  # Optional, improves URL parsing
```

### Model Configuration

```python
DEFAULT_MODEL = "gpt-4o-mini"  # Fast and cost-effective
```

---

## Dependencies

### Backend
- `flask` - Web framework
- `openai` - OpenAI API client
- `httpx` - Async HTTP client
- `serpapi` - SERP API client
- `asyncio` - Async operations

### Frontend
- `react` - UI framework
- `lucide-react` - Icons
- `firebase/firestore` - User data

---

## Notes

- Scout uses `gpt-4o-mini` for cost-effectiveness and speed
- Job title simplification is critical for better contact search results
- Resume location is prioritized over job result locations
- Caching significantly reduces API costs
- Timeout management prevents hanging requests
- Error handling ensures graceful degradation

---

## Support

For issues or questions:
1. Check logs: `[Scout]` prefix in backend logs
2. Verify API keys are set
3. Check network connectivity
4. Review error messages in UI

---

*Last Updated: 2025-01-XX*