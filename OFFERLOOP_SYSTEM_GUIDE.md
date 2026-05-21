# Offerloop System Guide
**Technical Architecture & Implementation Guide for Founders**

This guide explains how Offerloop actually works at a technical level. It's written for someone who can read code but wants to understand the system architecture, not just the implementation details.

---

## SECTION 1 - High-Level Architecture

### What Runs Where

**Frontend (Browser)**
- React Single Page Application (SPA)
- Runs in user's browser
- Built with Vite, served as static files
- Communicates with backend via REST API
- Also connects directly to Firebase for auth and Firestore for data

**Backend (Server)**
- Flask application running on Python
- Handles all API requests from frontend
- Makes calls to external APIs (OpenAI, PDL, Gmail, etc.)
- Serves the built React app for production
- Runs on port 5001 (dev) or configured port (production)

### Data Flow Overview

```
User Browser
    ↓ (HTTP requests)
Backend Flask Server
    ↓ (API calls)
External Services (OpenAI, PDL, Gmail, Stripe)
    ↓ (store/retrieve)
Firestore Database (or SQLite for legacy)
```

### What Happens When a User Clicks a Button

1. **User clicks button** in React component
2. **React handler function** executes (runs in browser)
3. **API call made** to Flask backend (`/api/...`)
4. **Backend route** receives request (e.g., `routes/runs.py`)
5. **Route calls service** (e.g., `services/pdl_client.py`)
6. **Service makes external API calls** (PDL, OpenAI, etc.)
7. **Data saved to Firestore** (if needed)
8. **Response sent back** to frontend
9. **React updates UI** with new data

### Synchronous vs Async

**Synchronous (Blocking)**
- Most API calls are synchronous
- When you call `search_contacts()`, the function waits for PDL API to respond
- User's browser waits for the HTTP response
- Example: Contact search, email generation

**Async (Non-blocking)**
- Some long-running tasks use async patterns
- Meeting prep uses background processing
- Gmail OAuth uses callback patterns (redirects)
- Example: Meeting preparation, OAuth flows

**Where State Lives**

- **Frontend State**: React component state, React Query cache (temporary, in browser memory)
- **Backend State**: Request-scoped (dies after response), no persistent server state
- **Firestore State**: Permanent user data, contacts, credentials, subscription info
- **In-Memory Cache**: PDL query results cached temporarily in backend process

---

## SECTION 2 - Frontend Deep Dive

### Technology Stack

- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server (replaces Create React App)
- **React Router**: Client-side routing (SPA navigation)
- **TanStack Query (React Query)**: Server state management and caching
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: Component library built on Radix UI
- **Firebase SDK**: Direct client connection to Firestore and Auth

### Page vs Component Structure

```
src/
├── pages/          # Full page components (routes)
│   ├── Home.tsx
│   ├── ContactSearchPage.tsx
│   ├── SignIn.tsx
│   └── ...
├── components/     # Reusable components
│   ├── ui/        # shadcn components (Button, Input, etc.)
│   ├── ContactSearchForm.tsx
│   ├── ContactDirectory.tsx
│   └── ...
└── services/      # API client functions
    └── api.ts     # Centralized API calls
```

**Pages** = Routes (what URL shows what)
**Components** = Reusable UI pieces
**Services** = API communication layer

### Routing

Uses React Router for client-side routing:

```typescript
// App.tsx defines routes
<Route path="/" element={<Index />} />
<Route path="/home" element={<Home />} />
<Route path="/contact-search" element={<ContactSearchPage />} />
```

All routes are client-side (SPA). Backend serves `index.html` for all non-API routes (see `routes/spa.py`).

### State Management

**React Query (TanStack Query)**
- Manages server state (data from API)
- Handles caching, refetching, loading states
- Used for contact lists, user data, etc.
- Cache lives in browser memory, cleared on refresh

**React Context**
- `FirebaseAuthContext`: Global auth state (current user)
- `ScoutContext`: AI assistant state
- Shared across components without prop drilling

**Local Component State**
- Form inputs, UI toggles, temporary data
- Uses `useState` hook
- Dies when component unmounts

### API Calls

All API calls go through `services/api.ts`:

```typescript
// Example: Search contacts
const response = await fetch(`${API_BASE_URL}/api/runs/free-tier`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${firebaseToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ jobTitle, company, location })
});
```

Firebase token obtained from `FirebaseAuthContext`, included in `Authorization` header.

### Loading / Error States

**Loading States**
- React Query provides `isLoading` flags automatically
- Components show loading spinners/skeletons
- Custom loading states for forms (disabled buttons, spinners)

**Error Handling**
- React Query catches API errors
- Toast notifications (using `sonner` library)
- Error boundaries for React crashes
- API errors return JSON: `{ error: "message" }`

### Key Files

**Core Files**
- `src/App.tsx`: Main app component, routing setup
- `src/main.tsx`: Entry point, React render
- `src/contexts/FirebaseAuthContext.tsx`: Authentication logic
- `src/services/api.ts`: All API endpoint functions

**Important Components**
- `pages/ContactSearchPage.tsx`: Main search interface
- `pages/SignIn.tsx`: Authentication and Gmail OAuth
- `components/ContactSearchForm.tsx`: Search form UI
- `components/ContactDirectory.tsx`: Contact list display

**Cosmetic vs Core**
- **Core**: Routing, auth, API calls, data fetching
- **Cosmetic**: Styling, animations, UI polish (Tailwind classes)

---

## SECTION 3 - Backend Deep Dive

### Framework

**Flask** - Python web framework
- WSGI application (runs with Gunicorn in production)
- Entry point: `backend/wsgi.py` (creates Flask app)
- Development: `main.py` (shim that calls `backend/wsgi.py`)

### Route Structure

Backend uses **blueprints** to organize routes:

```
backend/app/routes/
├── health.py          # Health checks
├── gmail_oauth.py     # Gmail OAuth flow
├── contacts.py        # Contact CRUD operations
├── runs.py            # Contact search (free/pro tiers)
├── emails.py          # Email generation
├── billing.py         # Stripe payments
├── resume.py          # Resume parsing
└── ... (20+ route files)
```

Each blueprint registers routes like:
```python
contacts_bp = Blueprint('contacts', __name__, url_prefix='/api/contacts')

@contacts_bp.route('', methods=['GET'])
@require_firebase_auth
def get_contacts():
    # Handler code
```

All routes registered in `wsgi.py` during app initialization.

### Services vs Routes

**Routes** (in `routes/`)
- Thin layer: validate input, extract user ID, call services
- Handle HTTP request/response
- Return JSON responses
- Example: `routes/runs.py` receives POST request, calls `services/pdl_client.py`

**Services** (in `services/`)
- Business logic lives here
- Make external API calls
- Data transformation and processing
- No knowledge of HTTP/Flask
- Example: `services/pdl_client.py` handles all PDL API communication

**Why This Separation?**
- Routes = HTTP interface (can change without changing logic)
- Services = Reusable business logic (can be called from routes, background jobs, etc.)
- Easier to test services independently
- Clear separation of concerns

### Business Logic Location

Business logic is in **services**, not routes:

- `services/pdl_client.py`: Contact search logic, PDL API calls
- `services/reply_generation.py`: Email generation using OpenAI
- `services/gmail_client.py`: Gmail API operations (drafts, OAuth)
- `services/auth.py`: Credit management, user authentication
- `services/stripe_client.py`: Payment processing

Routes are intentionally thin - they're just HTTP handlers.

### Async Work Handling

Most work is **synchronous** (blocking):

```python
# Route handler waits for service to complete
contacts = search_contacts_with_pdl(...)  # Blocks until PDL responds
return jsonify({'contacts': contacts})
```

Some long operations use **background processing**:
- Meeting prep uses threading/async patterns
- Gmail OAuth uses redirects (user leaves page, comes back)

No job queue (like Celery) yet - this is a known limitation.

### Error Handling Philosophy

**Custom Exception Classes** (`utils/exceptions.py`):
- `OfferloopException`: Base exception
- `ValidationError`: Input validation failures
- `InsufficientCreditsError`: Credit limit exceeded
- `ExternalAPIError`: External API failures

Routes catch exceptions and return appropriate HTTP status codes:
- 400: Validation errors
- 401: Authentication required
- 403: Permission denied (wrong tier)
- 500: Server errors

Services raise exceptions; routes handle them.

### Request Flow Example

**Example: Contact Search Request**

1. **Frontend**: POST to `/api/runs/free-tier`
2. **Route** (`routes/runs.py`): `@runs_bp.post('/free-tier')` handler
3. **Auth Check**: `@require_firebase_auth` decorator verifies Firebase token
4. **Extract Data**: `request.get_json()` gets jobTitle, company, location
5. **Call Service**: `run_free_tier_enhanced_optimized(...)` in same file
6. **Service Calls**:
   - `services/contact_search_optimized.py`: Search PDL
   - `services/reply_generation.py`: Generate emails with OpenAI
   - `services/gmail_client.py`: Create Gmail drafts (if Gmail connected)
7. **Save to Firestore**: Contacts saved to `users/{uid}/contacts`
8. **Return JSON**: Route returns `{'contacts': [...], 'credits_remaining': 250}`
9. **Frontend**: React updates UI with results

---

## SECTION 4 - The Golden Path (End-to-End)

### Core Flow: User Searches for Contacts and Gets Emails

This is the main user flow. Let's trace it step-by-step:

#### Step 1: User Action
**File**: `connect-grow-hire/src/pages/ContactSearchPage.tsx`

User fills out form (job title, company, location) and clicks "Search".

#### Step 2: Frontend State Change
**File**: `connect-grow-hire/src/components/ContactSearchForm.tsx`

Form submission handler:
```typescript
const handleSubmit = async (data: SearchFormData) => {
  setIsLoading(true);
  const response = await searchContacts(data);  // From services/api.ts
  // ... handle response
}
```

#### Step 3: API Request
**File**: `connect-grow-hire/src/services/api.ts`

Function `searchContacts()`:
- Gets Firebase auth token from context
- POSTs to `https://www.offerloop.ai/api/runs/free-tier`
- Includes Authorization header: `Bearer <firebase_token>`
- Body: `{ jobTitle, company, location, userProfile, ... }`

#### Step 4: Backend Route
**File**: `backend/app/routes/runs.py`

Route handler `run_free_tier()`:
```python
@runs_bp.post('/free-tier')
@require_firebase_auth
def run_free_tier():
    data = request.get_json()
    user_id = request.firebase_user['uid']  # From auth decorator
    # Calls service function
    result = run_free_tier_enhanced_optimized(...)
    return jsonify(result)
```

#### Step 5: Service Logic
**File**: `backend/app/routes/runs.py` (function `run_free_tier_enhanced_optimized`)

This function:
1. **Checks credits**: Calls `services/auth.py` - `check_and_reset_credits()`
2. **Loads existing contacts**: Queries Firestore `users/{uid}/contacts` to exclude duplicates
3. **Searches contacts**: Calls `services/contact_search_optimized.py` → `services/pdl_client.py`
   - Makes PDL API call: `POST https://api.peopledatalabs.com/v5/person/search`
   - Returns list of contacts matching criteria
4. **Generates emails**: Calls `services/reply_generation.py` → `batch_generate_emails()`
   - Calls OpenAI API: `POST https://api.openai.com/v1/chat/completions`
   - Generates personalized email for each contact
5. **Creates Gmail drafts** (if Gmail connected): Calls `services/gmail_client.py`
   - Uses Gmail API: `POST https://gmail.googleapis.com/gmail/v1/users/me/drafts`
   - Creates draft email in user's Gmail
6. **Saves contacts**: Writes to Firestore `users/{uid}/contacts/{contact_id}`
7. **Updates credits**: Decrements user's credit balance in Firestore

#### Step 6: External API Calls

**PDL (People Data Labs)**
- **Input**: Job title, company, location, filters
- **Output**: List of contact profiles (name, email, LinkedIn, etc.)
- **Failure**: Returns empty list, error logged

**OpenAI**
- **Input**: Contact info, user resume, job description
- **Output**: Generated email subject and body
- **Failure**: Email generation fails, contact still returned but without email

**Gmail API**
- **Input**: Email content, recipient, resume attachment
- **Output**: Gmail draft ID and URL
- **Failure**: Draft creation fails, contact still saved, user can manually create email

#### Step 7: Database Writes

**Firestore Writes**:
- Contact saved: `users/{uid}/contacts/{contact_id}`
- User credits updated: `users/{uid}` (decrement credits field)
- Draft metadata saved: Contact document includes `gmailDraftId`, `gmailDraftUrl`

#### Step 8: Response Back to UI

Backend returns JSON:
```json
{
  "contacts": [...],
  "successful_drafts": 3,
  "credits_remaining": 285,
  "tier": "free"
}
```

Frontend receives response, updates UI:
- Shows contact list
- Displays Gmail draft links
- Updates credit counter
- Shows success/error toasts

**Real File Names Used**:
- Route: `backend/app/routes/runs.py` → `run_free_tier()`
- Service: `backend/app/services/contact_search_optimized.py` → `contact_search_optimized()`
- PDL Client: `backend/app/services/pdl_client.py` → `search_contacts_with_smart_location_strategy()`
- Email Gen: `backend/app/services/reply_generation.py` → `batch_generate_emails()`
- Gmail: `backend/app/services/gmail_client.py` → `create_gmail_draft_for_user()`

---

## SECTION 5 - External Integrations

### Gmail API

**Why it exists**: Users need to send emails. Gmail API allows creating drafts in user's Gmail account.

**What data goes in**:
- Email subject and body (HTML or plain text)
- Recipient email address
- Optional: Resume attachment (PDF)

**What data comes out**:
- Gmail draft ID
- Gmail draft URL (link to open draft in Gmail)
- Thread ID (if replying to existing thread)

**What happens when it fails**:
- Draft creation fails silently (logged)
- Contact still saved to Firestore
- User can manually create email in Gmail
- Error returned in API response (frontend shows toast)

**How we protect from failures**:
- OAuth tokens stored securely in Firestore `users/{uid}/integrations/gmail`
- Token refresh handled automatically by Google client library
- Retries on transient errors (network issues)
- Falls back gracefully (contact saved even if draft fails)

**Files**: `backend/app/services/gmail_client.py`, `backend/app/routes/gmail_oauth.py`

### OpenAI

**Why it exists**: Generates personalized outreach emails based on contact and user profile.

**What data goes in**:
- Contact information (name, title, company, LinkedIn)
- User resume text
- User profile (university, major, career interests)
- Job/company context (what user is reaching out about)
- Optional: Job fit analysis context

**What data comes out**:
- Email subject line
- Email body (HTML formatted)
- Sometimes: Suggested approach/tone

**What happens when it fails**:
- API timeout (5 minute limit)
- Rate limit exceeded (429 error)
- Invalid API key
- Response: Email generation fails, contact returned without email
- User can manually write email

**How we protect from failures**:
- Timeout set to 5 minutes (long for complex prompts)
- Retry logic with exponential backoff (2 retries)
- Connection pooling (httpx client)
- Error logged, graceful degradation (contact still returned)

**Files**: `backend/app/services/openai_client.py`, `backend/app/services/reply_generation.py`

### PDL (People Data Labs)

**Why it exists**: Provides contact database (names, emails, LinkedIn, job titles, companies).

**What data goes in**:
- Search query: Job title, company, location
- Filters: College alumni, industry, etc.
- Max results count

**What data comes out**:
- List of contact profiles (name, email, LinkedIn, title, company, education, etc.)
- Contact count
- Search metadata

**What happens when it fails**:
- API key invalid/expired
- Rate limit exceeded (PDL has strict limits)
- No results found
- Response: Empty list or error
- User sees "No contacts found" message

**How we protect from failures**:
- **Caching**: Results cached in memory (`pdl_cache` dict) to reduce API calls
- Rate limiting awareness (tracks usage)
- Retry logic with backoff
- Location/job title enrichment (normalizes queries for better matches)
- Graceful degradation (returns empty list, doesn't crash)

**Files**: `backend/app/services/pdl_client.py`, `backend/app/config.py` (cache config)

### Hunter.io

**Why it exists**: Enriches contacts with email addresses when PDL doesn't have them.

**What data goes in**:
- Contact name and company

**What data comes out**:
- Email address (with confidence score)
- Email pattern for company

**What happens when it fails**:
- API key invalid
- Rate limit exceeded
- No email found
- Response: Contact returned without email (user can search manually)

**How we protect from failures**:
- Used as fallback only (not primary source)
- Errors logged, doesn't block contact creation
- Optional enrichment (nice-to-have, not required)

**Files**: `backend/app/services/hunter.py`

### SerpAPI

**Why it exists**: Used for firm search and company research (finding company info, news, etc.).

**What data goes in**:
- Company name
- Search query (e.g., "company news", "company jobs")

**What data comes out**:
- Search results (company info, news articles, job postings)
- Structured data about companies

**What happens when it fails**:
- API key invalid
- Rate limit exceeded
- No results found
- Response: Feature disabled or empty results

**How we protect from failures**:
- Used in specific features only (firm search, meeting prep)
- Errors logged, feature gracefully degrades
- Not critical path (nice-to-have enrichment)

**Files**: `backend/app/services/serp_client.py`, `backend/app/services/meeting.py`

### Firebase / Firestore

**Why it exists**: Primary database for user data, contacts, authentication, subscriptions.

**What data goes in**:
- User documents: `users/{uid}` (tier, credits, email, subscription status)
- Contacts: `users/{uid}/contacts/{contact_id}` (name, email, LinkedIn, Gmail draft info)
- OAuth credentials: `users/{uid}/integrations/gmail` (encrypted tokens)
- Meeting preps: `users/{uid}/coffee_chat_preps/{prep_id}`
- Runs/search history: `users/{uid}/runs/{run_id}`

**What data comes out**:
- User data (for auth, credit checking)
- Contact lists (for directory, outbox)
- OAuth tokens (for Gmail API calls)
- Historical data (past searches, preps)

**What happens when it fails**:
- Network errors (Firestore offline)
- Permission errors (security rules)
- Quota exceeded (Firestore free tier limits)
- Response: Error returned, operation fails
- Frontend shows error message

**How we protect from failures**:
- Firebase Admin SDK with retry logic
- Security rules restrict access (users can only read/write their own data)
- Error handling in all Firestore operations
- Graceful degradation (some features disabled if Firestore unavailable)
- Connection pooling (Firebase SDK handles this)

**Files**: `backend/app/services/firebase.py`, `backend/app/extensions.py` (Firestore client init)

---

## SECTION 6 - Data Model & Persistence

### What's Stored in Firestore

**Collections Structure**:
```
users/
  {uid}/                    # User document
    contacts/               # Subcollection
      {contact_id}/         # Contact document
    integrations/           # Subcollection
      gmail/                # Gmail OAuth credentials
    coffee_chat_preps/      # Subcollection
      {prep_id}/            # Meeting prep document
    runs/                   # Subcollection (search history)
      {run_id}/             # Run document
```

**Legacy Collections** (may still exist):
- `oauth_state/` - Temporary OAuth state tokens (expire after 15 min)

### User Document Structure

**Path**: `users/{uid}`

**Fields**:
```typescript
{
  uid: string,
  email: string,
  name: string,
  tier: 'free' | 'pro' | 'elite',
  credits: number,              // Current credit balance
  maxCredits: number,           // Max credits for tier
  subscriptionTier: string,     // Same as tier (backward compat)
  stripeCustomerId: string,     // Stripe customer ID
  stripeSubscriptionId: string, // Stripe subscription ID
  subscriptionStatus: string,   // 'active' | 'canceled' | null
  createdAt: string,            // ISO timestamp
  lastCreditReset: string,      // Last time credits were reset
  needsOnboarding: boolean,     // First-time user flag
  emailsUsedThisMonth: number,  // Monthly email usage tracking
  emailsMonthKey: string,       // YYYY-MM format for monthly tracking
  // Usage counters
  alumniSearchesUsed: number,
  coffeeChatPrepsUsed: number,
  interviewPrepsUsed: number,
}
```

### Contacts Subcollection

**Path**: `users/{uid}/contacts/{contact_id}`

**Fields**:
```typescript
{
  firstName: string,
  lastName: string,
  email: string,
  linkedinUrl: string,
  company: string,
  jobTitle: string,
  college: string,
  location: string,
  status: string,              // Contact status (e.g., "pending", "replied")
  firstContactDate: string,    // MM/DD/YYYY
  lastContactDate: string,     // MM/DD/YYYY
  emailSubject: string,        // Generated email subject
  emailBody: string,           // Generated email body (HTML)
  // Gmail integration
  gmailThreadId: string,       // Gmail thread ID (if email sent/replied)
  gmailMessageId: string,      // Gmail message ID
  gmailDraftId: string,        // Gmail draft ID
  gmailDraftUrl: string,       // Link to Gmail draft
  hasUnreadReply: boolean,     // Has unread reply in thread
  notificationsMuted: boolean, // User muted notifications
  draftCreatedAt: string,      // ISO timestamp
  lastChecked: string,         // Last time checked for replies
  createdAt: string,           // ISO timestamp
  updatedAt: string,           // ISO timestamp
}
```

### Runs (Search History)

**Path**: `users/{uid}/runs/{run_id}`

Stores historical search results (optional, may not be used in all flows).

### Meeting Preps

**Path**: `users/{uid}/coffee_chat_preps/{prep_id}`

Stores generated meeting preparation documents (PDFs, analysis, etc.).

### Outbox Threads

Not stored as separate collection - derived from contacts with `gmailThreadId`.

Frontend queries contacts with `gmailThreadId` exists to show outbox.

### Ephemeral vs Persistent

**Ephemeral (Not Saved)**:
- Search results (before user saves contacts)
- API response cache (in-memory, cleared on server restart)
- OAuth state tokens (expire after 15 minutes)
- Session data (no server sessions, stateless)

**Persistent (Saved to Firestore)**:
- User accounts and subscriptions
- Contacts (saved when user adds to directory)
- Gmail OAuth tokens (encrypted, stored permanently until revoked)
- Meeting preps
- Search history (runs)

### Cached vs Recomputed

**Cached**:
- PDL search results (in-memory cache, `pdl_cache` dict)
- Job title enrichments (LRU cache, max 1000 entries)
- Location cleanings (cached)

**Recomputed Every Time**:
- Email generation (always calls OpenAI, not cached)
- Credit checks (always queries Firestore)
- Contact lists (always queries Firestore, but Firestore may cache)

**Cache Duration**:
- PDL cache: 365 days (very long, contacts don't change much)
- Job title cache: LRU cache (evicts oldest when full)
- Firestore: Firebase SDK handles caching automatically

---

## SECTION 7 - Auth, Security, and Permissions

### How Users Authenticate

**Frontend Authentication (Firebase Auth)**:
1. User clicks "Sign in with Google" on `SignIn.tsx`
2. Firebase Auth SDK opens Google OAuth popup
3. User authorizes with Google
4. Firebase returns ID token
5. Frontend stores token (in Firebase SDK, not localStorage manually)
6. Token included in API requests: `Authorization: Bearer <token>`

**Backend Verification**:
1. Route decorated with `@require_firebase_auth`
2. Decorator extracts token from `Authorization` header
3. Calls Firebase Admin SDK: `firebase_admin.auth.verify_id_token(token)`
4. Firebase verifies token signature and expiration
5. If valid, adds `request.firebase_user` with user info (uid, email)
6. Route handler can access `request.firebase_user['uid']`

**Files**: `backend/app/extensions.py` (require_firebase_auth decorator), `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`

### Gmail OAuth (Separate from Firebase Auth)

Gmail OAuth is **separate** from Firebase Auth:

1. User already signed in with Firebase
2. User clicks "Connect Gmail" on `SignIn.tsx`
3. Frontend calls `/api/google/oauth/start`
4. Backend creates OAuth flow, returns Google OAuth URL
5. User redirected to Google (or popup opens)
6. User authorizes Gmail access (different scopes than Firebase Auth)
7. Google redirects to `/api/google/oauth/callback`
8. Backend exchanges code for tokens
9. Tokens saved to Firestore: `users/{uid}/integrations/gmail`
10. User redirected back to frontend

**Why Separate?**
- Firebase Auth = Sign into Offerloop (who you are)
- Gmail OAuth = Access Gmail API (send emails on your behalf)
- Different scopes, different purposes

**Files**: `backend/app/routes/gmail_oauth.py`, `backend/app/services/gmail_client.py`

### Where Tokens Live

**Firebase ID Tokens**:
- Stored by Firebase SDK in browser (not manually stored)
- Included in API requests via `Authorization` header
- Expire after 1 hour, auto-refreshed by SDK
- Never stored in localStorage manually (SDK handles it)

**Gmail OAuth Tokens**:
- Stored in Firestore: `users/{uid}/integrations/gmail`
- Encrypted/secure (Firestore security rules protect access)
- Includes access token and refresh token
- Backend loads tokens when needed for Gmail API calls
- Tokens refreshed automatically by Google client library

**API Keys (Backend)**:
- Stored in environment variables (`.env` file, or Render env vars)
- Never exposed to frontend
- Used by backend services (OpenAI, PDL, Stripe, etc.)

### What Would Break if Compromised

**Firebase ID Token Compromised**:
- Attacker could make API calls as that user
- Could read user's contacts, credits, subscription
- Could create contacts, use credits
- **Protection**: Tokens expire after 1 hour, Firebase can revoke

**Gmail OAuth Token Compromised**:
- Attacker could read user's emails
- Could send emails as that user
- Could create drafts
- **Protection**: User can revoke access in Google Account settings, tokens expire

**Backend API Keys Compromised**:
- OpenAI key: Attacker could use your OpenAI quota
- PDL key: Attacker could use your PDL quota
- Stripe key: Attacker could access billing (scary!)
- **Protection**: Rotate keys immediately, monitor usage, use environment variables (not code)

**Firestore Security Rules**:
- Rules restrict users to only access their own data
- Even if token compromised, can't access other users' data
- Rules defined in `firestore.rules` (not in codebase, deployed separately)

### Current Weaknesses (Be Honest)

1. **No Rate Limiting on Expensive Operations**
   - User could spam contact searches (costs PDL credits)
   - Some rate limiting exists (Flask-Limiter) but not comprehensive

2. **Synchronous Long-Running Operations**
   - Email generation can take 30+ seconds
   - User's browser waits (poor UX)
   - No background job queue (Celery, etc.)

3. **Error Handling Could Be Better**
   - Some external API failures not handled gracefully
   - Errors sometimes return 500 instead of user-friendly messages

4. **Token Storage**
   - Gmail tokens in Firestore (fine, but not encrypted at rest beyond Firestore defaults)
   - Could use more secure storage (e.g., Google Secret Manager)

5. **No Request Validation on All Endpoints**
   - Some endpoints don't validate input thoroughly
   - Could allow invalid data to cause errors

6. **Credit System Vulnerabilities**
   - Credits checked but not atomically (race conditions possible)
   - Could be exploited with concurrent requests (unlikely but possible)

7. **CORS Configuration**
   - Development mode allows many origins (necessary for dev, but permissive)

---

## SECTION 8 - Failure Modes & Tradeoffs

### Known Fragile Points

1. **PDL API Rate Limits**
   - **Problem**: PDL has strict rate limits (varies by plan)
   - **Symptom**: 429 errors, searches fail
   - **Current Handling**: Retry with backoff, cache results
   - **Tradeoff**: Caching reduces API calls but uses memory

2. **OpenAI API Timeouts**
   - **Problem**: Long email generation can timeout (5 min limit)
   - **Symptom**: Email generation fails, contact returned without email
   - **Current Handling**: 5-minute timeout, graceful degradation
   - **Tradeoff**: Long timeout = poor UX (user waits), short timeout = more failures

3. **Gmail OAuth Token Expiration**
   - **Problem**: Refresh tokens can expire if not used for 6 months
   - **Symptom**: Gmail operations fail, user needs to re-authenticate
   - **Current Handling**: Auto-refresh when possible, manual re-auth if needed
   - **Tradeoff**: Re-auth is friction, but necessary for security

4. **Firestore Quota Limits**
   - **Problem**: Free tier has read/write limits (50k reads/day)
   - **Symptom**: Operations fail, quota exceeded errors
   - **Current Handling**: None (would need to upgrade Firebase plan)
   - **Tradeoff**: Free tier is fine for now, but will hit limits at scale

5. **Synchronous Long Operations**
   - **Problem**: Contact search + email gen can take 30-60 seconds
   - **Symptom**: User's browser hangs, poor UX
   - **Current Handling**: Loading spinners, but still blocking
   - **Tradeoff**: Simpler code (no job queue), but poor UX for long operations

### Rate Limits

**PDL (People Data Labs)**:
- Varies by plan (likely 100-1000 requests/month on basic plan)
- **Handling**: Caching, request deduplication
- **When Exceeded**: 429 error, search fails

**OpenAI**:
- Tiered limits (requests/minute, tokens/minute)
- **Handling**: Retry with backoff
- **When Exceeded**: 429 error, email generation fails

**Gmail API**:
- 1 billion quota units/day (usually not an issue)
- **Handling**: None needed (limits very high)
- **When Exceeded**: 429 error, draft creation fails

**Stripe**:
- 100 requests/second (very high, not an issue)
- **Handling**: None needed
- **When Exceeded**: 429 error, payment fails

### Timeouts

**OpenAI API**: 5 minutes (300 seconds)
- Long for complex email generation
- Tradeoff: Allow long generations but poor UX

**PDL API**: 60 seconds (default requests timeout)
- Usually fast, timeout rare
- Tradeoff: Reasonable default

**Gmail API**: 60 seconds (default)
- Usually fast, timeout rare
- Tradeoff: Reasonable default

**Frontend API Calls**: No explicit timeout (browser default ~5 minutes)
- Could hang if backend is slow
- Tradeoff: Simpler code, but poor UX

### Partial Failures

**Contact Search with Email Generation**:
- If PDL succeeds but OpenAI fails: Contact returned without email
- If OpenAI succeeds but Gmail fails: Contact saved, email returned, but no draft
- **Handling**: Graceful degradation, partial success returned

**Batch Operations**:
- Some contacts succeed, some fail (e.g., batch email generation)
- **Handling**: Returns successful count, failed items logged
- **Tradeoff**: User sees partial success (could be confusing)

### Where Retries Exist vs Don't

**Retries Exist**:
- PDL API calls (retry with backoff in `utils/retry.py`)
- OpenAI API calls (built into OpenAI client, 2 retries)
- Gmail API calls (some retry logic in gmail_client.py)
- Firebase Auth token verification (3 retries for network errors)

**Retries Don't Exist**:
- Firestore operations (Firebase SDK may retry internally, but not explicit)
- Stripe API calls (no retry, fails fast)
- Frontend API calls (no retry, user must retry manually)

### Why These Tradeoffs Were Acceptable

**Early Stage Priorities**:
1. **Speed to Market**: Simple synchronous code faster to build than job queues
2. **Cost**: Free/low-cost tiers sufficient for initial users
3. **Simplicity**: Easier to debug and maintain synchronous code
4. **User Scale**: Not enough users yet to hit most limits

**What Will Break at Scale**:
- Firestore quota limits (need paid plan)
- PDL rate limits (need higher tier plan)
- Synchronous operations (need job queue for long operations)
- Credit system race conditions (need atomic operations)
- No horizontal scaling (single Flask process, need load balancer + multiple workers)

**When to Fix**:
- When users complain about slow operations → Add job queue
- When hitting rate limits → Upgrade API plans, add better caching
- When hitting Firestore quota → Upgrade Firebase plan
- Before major growth → Fix race conditions, add monitoring

---

## SECTION 9 - How I Would Explain This to an Investor

### 60-Second Technical Explanation

"Offerloop is a full-stack web application that helps students find and reach out to professionals for networking. 

On the frontend, we have a React app that users interact with in their browser. It's built with modern tools like TypeScript and Tailwind for a fast, polished experience.

The backend is a Flask API server that handles all the heavy lifting. When a user searches for contacts, we call People Data Labs API to find matching professionals, then use OpenAI to generate personalized outreach emails, and finally create Gmail drafts in the user's account.

All user data - contacts, credits, subscriptions - is stored in Firebase Firestore, which gives us real-time sync and scales automatically. We use Firebase Auth for login, and a separate Gmail OAuth flow so we can send emails on behalf of users.

The system is designed to be reliable: if one part fails (like email generation), the user still gets their contacts and can manually write the email. We cache aggressively to reduce API costs and improve speed."

### What's Hard Here

"The hard parts are:

**1. Email Personalization at Scale**: Generating truly personalized emails that don't sound templated is tricky. We feed a lot of context into OpenAI - the contact's background, the user's resume, the specific opportunity - but getting the tone and personalization right requires careful prompt engineering and iteration.

**2. Contact Data Quality**: People Data Labs is great, but contact data is messy. Job titles vary wildly ('Software Engineer' vs 'SWE' vs 'Developer'), companies have multiple names, locations are inconsistent. We do a lot of normalization and enrichment to make searches work reliably.

**3. Gmail Integration Complexity**: Gmail OAuth is a two-step process (separate from user login), and the API has quirks. Creating drafts with attachments, tracking replies, handling thread conversations - there's a lot of edge cases to handle.

**4. Credit System Accuracy**: We need to track credits accurately across concurrent requests. Users can't go negative, but we also can't double-charge. Firestore transactions help, but we have to be careful about race conditions.

**5. Cost Management**: Every contact search costs money (PDL API), every email generation costs money (OpenAI). We cache aggressively and have tiered limits, but balancing user experience with unit economics is an ongoing challenge."

### What Would Break at Scale

"At our current architecture, here's what would break:

**1. Synchronous Long Operations**: Right now, when a user searches for contacts, their browser waits 30-60 seconds for the whole process (PDL search + email generation + Gmail drafts). At scale, this would timeout and create a terrible user experience. We'd need to move to asynchronous job processing (like Celery with Redis) where the user gets immediate feedback and we process in the background.

**2. Single Flask Process**: We're running a single Flask process. At scale, this would become a bottleneck. We'd need multiple worker processes behind a load balancer, and we'd need to make sure our caching and state management works across processes (probably move from in-memory cache to Redis).

**3. Firestore Quota Limits**: Free tier Firestore has 50k reads/day. At 1000 active users doing a few searches each, we'd hit this quickly. We'd need to upgrade to paid Firebase plan, and potentially optimize queries (fewer reads, better indexing).

**4. API Rate Limits**: PDL and OpenAI have rate limits. With many concurrent users, we'd hit these. We'd need to implement request queuing, rate limit awareness, and potentially upgrade API plans.

**5. Credit System Race Conditions**: Our current credit checking isn't fully atomic. With many concurrent requests, a user could potentially go negative or we could double-charge. We'd need to use Firestore transactions consistently everywhere.

**6. No Monitoring/Alerting**: Right now, if something breaks, we might not know until users complain. At scale, we'd need proper monitoring (like DataDog or Sentry), alerting for API failures, and dashboards to track key metrics (API costs, error rates, user activity).

The good news is that our architecture is modular - routes, services, and external APIs are separated, so we can fix these issues incrementally without a full rewrite."

---

## SECTION 10 - What I Should Learn Next

Based on this system, here are the tech areas to deepen, in order of priority:

### 1. Asynchronous Job Processing (High Priority)

**Why**: Your longest operations (contact search + email generation) are synchronous and block the user's browser. This will break at scale.

**What to Learn**:
- Celery + Redis for background jobs
- Task queues and job scheduling
- WebSocket or Server-Sent Events for real-time progress updates
- How to refactor synchronous code to async jobs

**Why It Matters**: Users will abandon if operations take 30+ seconds with no feedback. Job queues let you return immediately and process in background.

**Resources**: Celery docs, Redis basics, Flask-Celery integration

### 2. Database Optimization & Scaling (High Priority)

**Why**: Firestore queries can be slow and expensive at scale. You're doing a lot of reads (contact lists, credit checks, etc.).

**What to Learn**:
- Firestore indexing and query optimization
- When to denormalize data (vs normalize)
- Caching strategies (Redis for frequently accessed data)
- Database connection pooling
- Query performance analysis

**Why It Matters**: Firestore costs scale with reads. At 1000+ users, inefficient queries will cost hundreds per month and be slow.

**Resources**: Firestore best practices, Redis caching patterns, database indexing

### 3. Error Handling & Observability (Medium Priority)

**Why**: Right now, errors are logged but not systematically tracked. You won't know when things break until users complain.

**What to Learn**:
- Structured logging (JSON logs, log levels)
- Error tracking (Sentry integration - you have the code but may not be using it)
- Metrics and monitoring (DataDog, Prometheus, or cloud-native)
- Health checks and alerting
- Distributed tracing (for debugging multi-service flows)

**Why It Matters**: At scale, you need to know when APIs are failing, when rates are high, and where bottlenecks are. Can't optimize what you can't measure.

**Resources**: Sentry docs, observability best practices, Flask logging

### 4. API Design & Versioning (Medium Priority)

**Why**: Your API will evolve. Without versioning, breaking changes will break the frontend.

**What to Learn**:
- REST API versioning strategies (`/api/v1/...` vs headers)
- API documentation (OpenAPI/Swagger - you have Swagger config but may not be using it)
- Request/response validation (Pydantic - you're using this, good!)
- API rate limiting strategies (beyond Flask-Limiter)
- Backward compatibility patterns

**Why It Matters**: As you add features, you'll need to change APIs without breaking existing clients (especially if you build mobile apps later).

**Resources**: REST API design, OpenAPI spec, API versioning patterns

### 5. Security Hardening (Medium Priority)

**Why**: You have basic auth, but there are vulnerabilities (race conditions, no input validation everywhere, permissive CORS in dev).

**What to Learn**:
- Input validation and sanitization (prevent injection attacks)
- CSRF protection (if you add state-changing GET requests)
- Rate limiting per user (prevent abuse)
- Secrets management (beyond env vars - AWS Secrets Manager, etc.)
- Security headers (CSP, HSTS, etc.)
- OWASP Top 10 vulnerabilities

**Why It Matters**: A security breach (stolen API keys, user data leak) could kill the product. Better to be proactive.

**Resources**: OWASP guides, Flask security best practices, secrets management

### 6. Testing & Quality Assurance (Lower Priority, But Important)

**Why**: Manual testing doesn't scale. You need automated tests to catch regressions.

**What to Learn**:
- Unit testing (pytest for Python, Jest for React)
- Integration testing (test API endpoints)
- Mocking external APIs (so tests don't hit real APIs)
- End-to-end testing (Playwright or Cypress)
- Test coverage and CI/CD integration

**Why It Matters**: As codebase grows, manual testing becomes impossible. Tests catch bugs before users do.

**Resources**: pytest docs, React Testing Library, Playwright docs

### Learning Order Recommendation

1. **Start with #1 (Job Queues)** - Biggest UX impact, will be needed soon
2. **Then #2 (Database Optimization)** - Prevents cost explosion as you scale
3. **Then #3 (Observability)** - Need visibility before you can optimize
4. **Then #4 (API Design)** - Important but less urgent if you're the only client
5. **Then #5 (Security)** - Critical but can be incremental improvements
6. **Finally #6 (Testing)** - Important but can start small (unit tests for critical paths)

### Why Each Matters for This Product

- **Job Queues**: Users will leave if operations are slow. This is a competitive differentiator (fast vs slow).
- **Database Optimization**: Directly impacts costs and user experience (slow queries = bad UX).
- **Observability**: Can't improve what you can't measure. Need to track API costs, error rates, user behavior.
- **API Design**: Will enable mobile apps, third-party integrations, and future features.
- **Security**: Trust is critical for a product handling user emails and professional data.
- **Testing**: Prevents regressions as you add features. Saves time in long run.

---

## Final Notes

This guide is based on the actual codebase as of the time it was generated. The system is actively evolving, so some details may change.

**Key Takeaways**:
- Frontend = React SPA, Backend = Flask API, Database = Firestore
- Routes are thin, services contain business logic
- Most operations are synchronous (will need job queues at scale)
- External APIs: PDL (contacts), OpenAI (emails), Gmail (drafts), Stripe (payments)
- Graceful degradation is built in (partial failures don't break user experience)
- System is designed for early stage, will need optimizations at scale

**Remember**: This is a learning guide, not external documentation. It's honest about tradeoffs and weaknesses. Use it to understand the system, then make improvements incrementally.

Good luck with your investor interview! 🚀

