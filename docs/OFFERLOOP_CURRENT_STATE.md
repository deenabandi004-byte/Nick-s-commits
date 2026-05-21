# Offerloop Current State Audit

**Generated:** 2024  
**Purpose:** Accurate, up-to-date audit of Offerloop's current features and Scout's implementation for training Scout AI

---

## Table of Contents

1. [PART 1: OFFERLOOP FEATURE AUDIT](#part-1-offerloop-feature-audit)
   - [1.1 Sidebar Navigation](#11-sidebar-navigation)
   - [1.2 All Pages & Features](#12-all-pages--features)
   - [1.3 Subscription Tiers](#13-subscription-tiers)
   - [1.4 Credit System](#14-credit-system)
   - [1.5 Removed Features](#15-removed-features)
2. [PART 2: SCOUT IMPLEMENTATION AUDIT](#part-2-scout-implementation-audit)
   - [2.1 Scout Components](#21-scout-components)
   - [2.2 Scout API Endpoints](#22-scout-api-endpoints)
   - [2.3 Current System Prompts](#23-current-system-prompts)
   - [2.4 Scout Capabilities](#24-scout-capabilities)
   - [2.5 What Scout Knows](#25-what-scout-knows)
3. [PART 3: KNOWLEDGE BASE CONTENT](#part-3-knowledge-base-content)
   - [3.1 Platform Overview](#31-platform-overview)
   - [3.2 Feature Descriptions](#32-feature-descriptions)
   - [3.3 Troubleshooting FAQ](#33-troubleshooting-faq)
   - [3.4 Workflows](#34-workflows)

---

## PART 1: OFFERLOOP FEATURE AUDIT

### 1.1 Sidebar Navigation

**Location:** `connect-grow-hire/src/components/AppSidebar.tsx`

#### Top-Level Item
- **Dashboard**
  - Route: `/dashboard`
  - Icon: `LayoutDashboard` (lucide-react)
  - Visible to: All users

#### FIND Section
- **Find People**
  - Route: `/contact-search`
  - Icon: `FindPeopleIcon` (custom image: icons8-magnifying-glass-50.png)
  - Visible to: All users

- **Find Companies**
  - Route: `/firm-search`
  - Icon: `FindCompaniesIcon` (custom image: icons8-building-50.png)
  - Visible to: Pro and Elite users only (Free tier blocked)

- **Find Hiring Managers**
  - Route: `/recruiter-spreadsheet`
  - Icon: `FindHiringManagersIcon` (custom image: icons8-find-user-male-48.png)
  - Visible to: All users

#### PREPARE Section
- **Meeting Prep**
  - Route: `/meeting-prep`
  - Icon: `MeetingIcon` (custom image: icons8-cup-48.png)
  - Visible to: All users (with tier-based limits)

- **Interview Prep**
  - Route: `/interview-prep`
  - Icon: `InterviewPrepIcon` (custom image: icons8-briefcase-48.png)
  - Visible to: All users (with tier-based limits)

#### WRITE Section
- **Resume**
  - Route: `/write/resume`
  - Icon: `ResumeIcon` (custom image: icons8-paper-48.png)
  - Visible to: All users

- **Cover Letter**
  - Route: `/write/cover-letter`
  - Icon: `CoverLetterIcon` (custom image: icons8-write-48.png)
  - Visible to: All users

#### TRACK Section
- **Track Email Outreach**
  - Route: `/outbox`
  - Icon: `EmailOutreachIcon` (custom image: icons8-important-mail-48.png)
  - Visible to: All users

- **Calendar**
  - Route: `/calendar`
  - Icon: `CalendarIcon` (lucide-react)
  - Visible to: All users

- **Networking**
  - Route: `/contact-directory`
  - Icon: `NetworkingIcon` (custom image: icons8-people-working-together-48.png)
  - Visible to: All users

- **Hiring Managers**
  - Route: `/hiring-manager-tracker`
  - Icon: `FindHiringManagersIcon` (custom image: icons8-find-user-male-48.png)
  - Visible to: All users

- **Companies**
  - Route: `/company-tracker`
  - Icon: `TrackCompaniesIcon` (custom image: icons8-building-50 2.png)
  - Visible to: All users

#### Standalone Items
- **Pricing**
  - Route: `/pricing`
  - Icon: `PricingIcon` (custom image: icons8-wallet-48.png)
  - Visible to: All users

- **Documentation**
  - Route: `https://docs.offerloop.ai` (external link)
  - Icon: `DocumentationIcon` (custom image: icons8-play-50.png)
  - Visible to: All users

#### User Dropdown Menu Items
- **Account Settings** - `/account-settings`
- **About Us** - `/about`
- **Contact Us** - `/contact-us`
- **Privacy Policy** - `/privacy`
- **Terms of Service** - `/terms-of-service`
- **Sign out** - Action button

---

### 1.2 All Pages & Features

#### Dashboard
- **Route:** `/dashboard`
- **Purpose:** Central hub for tracking networking progress, managing emails, and planning recruiting timeline
- **Key Features:**
  - Activity statistics (contacts sent, replies received, meetings booked, time saved)
  - Streak counter (consecutive days of activity)
  - Weekly summary
  - Quick access to main features
- **Credit Cost:** Free (viewing only)
- **Tier Access:** All
- **User Inputs:** None (displays data)
- **Outputs:** Statistics, activity summary, time saved calculation

#### Contact Search (Find People)
- **Route:** `/contact-search`
- **Purpose:** Find professionals at companies to network with. Enter job title, company, and location to discover contacts and generate personalized outreach emails.
- **Key Features:**
  - Search by job title, company, location
  - Optional filters: college, experience level
  - AI-generated personalized email drafts
  - Gmail integration for saving drafts
  - Save contacts to directory
  - Import contacts from CSV or manually
  - Resume matching for better personalization (Pro+)
  - Batch size: 1-15 contacts (tier-dependent)
- **Credit Cost:** 15 credits per contact
- **Tier Access:** All (Free: up to 3 contacts per search, Pro: up to 8, Elite: up to 15)
- **User Inputs:** Job title (required), company (optional), location (required), batch size, optional filters
- **Outputs:** List of contacts with LinkedIn, email, title, company, location; AI-generated email drafts

#### Firm Search (Find Companies)
- **Route:** `/firm-search`
- **Purpose:** Discover companies and firms matching your criteria. Search by industry, location, and size to find potential employers.
- **Key Features:**
  - Natural language search for companies
  - Filter by industry, location, company size
  - Save firms to your list
  - View search history
  - Scout assistant for refined searches
  - Batch sizes: 5, 10, 20, 40 firms
- **Credit Cost:** 5 credits per firm
- **Tier Access:** Pro and Elite only (Free tier blocked)
- **User Inputs:** Natural language query (e.g., "Investment banks in NYC focused on healthcare M&A"), batch size
- **Outputs:** List of firms with name, industry, location, size, description

#### Find Hiring Managers (Recruiter Spreadsheet)
- **Route:** `/recruiter-spreadsheet`
- **Purpose:** Find recruiters and hiring managers at target companies
- **Key Features:**
  - Search for recruiters by company
  - Find hiring managers for specific roles
  - Generate contact information
- **Credit Cost:** 15 credits per contact
- **Tier Access:** All
- **User Inputs:** Company name, role/job title
- **Outputs:** List of recruiters/hiring managers with contact info

#### Meeting Prep
- **Route:** `/meeting-prep`
- **Purpose:** Generate comprehensive preparation materials for networking conversations. Get talking points, questions to ask, and research on your contact.
- **Key Features:**
  - Paste LinkedIn URL to generate prep
  - Company news and recent developments
  - Suggested questions to ask
  - Similarity analysis based on your background
  - PDF download of prep materials
  - Saved preps in library
  - Multi-step progress tracking
- **Credit Cost:** 15 credits per prep
- **Tier Access:** All (Free: 3 preps lifetime, Pro: 10/month, Elite: unlimited)
- **User Inputs:** LinkedIn profile URL
- **Outputs:** PDF prep document with talking points, questions, company research, similarity analysis

#### Interview Prep
- **Route:** `/interview-prep`
- **Purpose:** Generate interview preparation guides based on job postings. Get insights on company culture, common questions, and success tips.
- **Key Features:**
  - Paste job posting URL to generate prep
  - Reddit and online research for real interview experiences
  - Common interview questions
  - Company culture insights
  - Success tips and what to avoid
  - PDF download of prep materials
  - Saved preps in library
  - Multi-step progress tracking
- **Credit Cost:** 25 credits per prep
- **Tier Access:** All (Free: 2 preps lifetime, Pro: 5/month, Elite: unlimited)
- **User Inputs:** Job posting URL (or manual company/job title entry)
- **Outputs:** PDF prep document with interview questions, company insights, success tips

#### Application Lab
- **Route:** `/application-lab`
- **Purpose:** Deep job fit analysis and application strengthening. Get detailed fit scores, resume edits, and cover letters.
- **Key Features:**
  - Job fit score and analysis
  - Requirement-by-requirement matching
  - AI-suggested resume edits
  - Custom cover letter generation
  - Score breakdown and improvement tips
  - Enhanced fit analysis with strengths, gaps, pitch, talking points
- **Credit Cost:** Varies (analysis and generation use credits)
- **Tier Access:** All (Elite gets priority queue)
- **User Inputs:** Job posting URL or job description
- **Outputs:** Fit analysis, resume edit suggestions, cover letter, score breakdown

#### Resume Workshop
- **Route:** `/write/resume`, `/write/resume-library`
- **Purpose:** Resume optimization workspace. Score resume, tailor for jobs, fix issues, and manage resume library.
- **Key Features:**
  - Resume preview (PDF viewer)
  - ATS score calculation
  - Job context input for tailoring
  - Fix resume issues
  - Apply recommendations
  - Resume library management
  - Replace main resume
- **Credit Cost:** Varies by operation (scoring, tailoring, fixing)
- **Tier Access:** All
- **User Inputs:** Resume PDF upload, job context (optional)
- **Outputs:** Resume score, tailored resume, fixed resume, recommendations

#### Cover Letter
- **Route:** `/write/cover-letter`, `/write/cover-letter-library`
- **Purpose:** Generate custom cover letters for job applications
- **Key Features:**
  - Generate cover letter from job posting
  - PDF preview and download
  - Cover letter library
  - Edit and regenerate
- **Credit Cost:** 10 credits per letter (from knowledge base)
- **Tier Access:** All
- **User Inputs:** Job posting URL or job details
- **Outputs:** Custom cover letter PDF

#### Track Email Outreach (Outbox)
- **Route:** `/outbox`
- **Purpose:** Manage your email threads and track responses. View drafts, sent emails, and replies.
- **Key Features:**
  - View all email threads
  - Track reply status
  - Regenerate suggested replies (AI-powered)
  - Open emails in Gmail
  - Status tracking (no_reply_yet, new_reply, waiting_on_them, waiting_on_you, closed)
- **Credit Cost:** 10 credits per reply generation
- **Tier Access:** All
- **User Inputs:** None (displays existing threads)
- **Outputs:** Email thread list, reply suggestions

#### Calendar
- **Route:** `/calendar`
- **Purpose:** View your personalized recruiting timeline with key dates and milestones.
- **Key Features:**
  - AI-generated recruiting timeline
  - Phase-based planning
  - Key milestones and deadlines
  - Customizable based on your goals
- **Credit Cost:** Free
- **Tier Access:** All
- **User Inputs:** None (displays timeline)
- **Outputs:** Calendar view with milestones

#### Networking (Contact Directory)
- **Route:** `/contact-directory`
- **Purpose:** View and manage all your saved contacts from previous searches.
- **Key Features:**
  - View all saved contacts
  - Search and filter contacts
  - Export contacts (Pro+)
  - Remove contacts
- **Credit Cost:** Free (viewing only)
- **Tier Access:** All
- **User Inputs:** Search/filter terms
- **Outputs:** List of saved contacts

#### Meeting Library
- **Route:** `/meeting-library`
- **Purpose:** Access all your past meeting preparation materials.
- **Key Features:**
  - View past preps
  - Download PDFs
  - Delete old preps
- **Credit Cost:** Free (viewing only)
- **Tier Access:** All
- **User Inputs:** None
- **Outputs:** List of saved meeting preps

#### Hiring Manager Tracker
- **Route:** `/hiring-manager-tracker`
- **Purpose:** Track hiring managers you've contacted
- **Key Features:**
  - Track hiring manager contacts
  - Manage relationships
- **Credit Cost:** Free (tracking only)
- **Tier Access:** All
- **User Inputs:** Hiring manager information
- **Outputs:** List of tracked hiring managers

#### Company Tracker
- **Route:** `/company-tracker`
- **Purpose:** Track companies you're targeting
- **Key Features:**
  - Track target companies
  - Manage company lists
- **Credit Cost:** Free (tracking only)
- **Tier Access:** All
- **User Inputs:** Company information
- **Outputs:** List of tracked companies

#### Job Board
- **Route:** `/job-board`
- **Purpose:** Browse job listings, optimize your resume for specific jobs, generate cover letters, and find recruiters.
- **Key Features:**
  - AI-curated job listings
  - Resume optimization for specific jobs (20 credits)
  - Cover letter generation (15 credits)
  - Find recruiters at target companies
  - Save jobs for later
  - Match score based on your resume
- **Credit Cost:** 20 credits per resume optimization, 15 credits per cover letter, 15 credits per recruiter search
- **Tier Access:** All
- **User Inputs:** Job search filters, job posting URL
- **Outputs:** Job listings, optimized resume, cover letter, recruiter contacts

#### Account Settings
- **Route:** `/account-settings`
- **Purpose:** Manage your profile, upload resume, connect Gmail, and update preferences.
- **Key Features:**
  - Update profile information
  - Upload and manage resume
  - Connect Gmail for email drafts
  - View and update preferences
  - Sign out
- **Credit Cost:** Free
- **Tier Access:** All
- **User Inputs:** Profile data, resume file, Gmail OAuth
- **Outputs:** Updated profile, parsed resume data

#### Pricing
- **Route:** `/pricing`
- **Purpose:** View and manage your subscription. Compare Free, Pro, and Elite plans.
- **Key Features:**
  - Compare plan features
  - Upgrade or downgrade subscription
  - Manage billing through Stripe
  - View current plan and credits
  - 7-day money back guarantee
- **Credit Cost:** Free
- **Tier Access:** All
- **User Inputs:** Plan selection, payment info
- **Outputs:** Subscription management, plan comparison

#### Scout
- **Route:** `/scout` (redirects to dashboard and opens Scout panel)
- **Purpose:** AI assistant for navigating Offerloop and getting help
- **Key Features:**
  - Answer questions about Offerloop
  - Navigate users to pages
  - Auto-populate search fields
  - Help with failed searches
- **Credit Cost:** Free (no credits used)
- **Tier Access:** All
- **User Inputs:** Questions about Offerloop
- **Outputs:** Helpful responses, navigation suggestions

---

### 1.3 Subscription Tiers

**Source of Truth:** `backend/app/config.py:108-182` and `connect-grow-hire/src/pages/Pricing.tsx`

#### Free Tier
- **Price:** $0/month
- **Monthly Credits:** 300 (~20 contacts)
- **Max Credits:** 300
- **Contacts Per Search:** Up to 3 contacts
- **Meeting Prep:** 3 preps (lifetime, not monthly)
- **Interview Prep:** 2 preps (lifetime, not monthly)
- **Alumni Searches:** 10 (lifetime cap)
- **Features:**
  - Basic contact search + AI email drafts
  - Gmail integration
  - Directory saves all contacts
  - Basic email generation
- **Limitations:**
  - No Firm Search (blocked)
  - No resume-matched emails
  - Exports disabled (CSV + Gmail bulk draft blocked)
  - No smart filters (school/major/career)
  - No bulk drafting
  - Limited Interview Prep access
  - Basic personalization

#### Pro Tier
- **Price:** $14.99/month (shown as $9.99/month student pricing with strikethrough)
- **Stripe Price ID:** `price_1ScLXrERY2WrVHp1bYgdMAu4`
- **Monthly Credits:** 1,500 (~100 contacts)
- **Max Credits:** 1,500
- **Contacts Per Search:** Up to 8 contacts
- **Meeting Prep:** 10/month (resets on billing cycle)
- **Interview Prep:** 5/month (resets on billing cycle)
- **Alumni Searches:** Unlimited
- **Features:**
  - Everything in Free, plus:
  - Full Firm Search access
  - Resume-matched personalized emails
  - Smart school/major/career filters
  - 10 Meeting Preps/month
  - 5 Interview Preps/month
  - Unlimited directory saving
  - Bulk drafting + Export unlocked (CSV & Gmail)
  - Priority support
- **Limitations:**
  - No unlimited preps
  - No Application Lab priority
  - No advanced analytics
  - No personalized templates
  - No weekly insights

#### Elite Tier
- **Price:** $34.99/month
- **Stripe Price ID:** `price_1ScLcfERY2WrVHp1c5rcONJ3`
- **Monthly Credits:** 3,000 (~200 contacts)
- **Max Credits:** 3,000
- **Contacts Per Search:** Up to 15 contacts
- **Meeting Prep:** Unlimited
- **Interview Prep:** Unlimited
- **Alumni Searches:** Unlimited
- **Features:**
  - Everything in Pro, plus:
  - Unlimited Meeting Prep
  - Unlimited Interview Prep
  - Priority queue for contact generation
  - Personalized outreach templates (tailored to resume)
  - Weekly personalized firm insights
  - Early access to new AI tools
- **Limitations:** None

---

### 1.4 Credit System

**Source of Truth:** `backend/app/config.py`, `backend/app/routes/*.py`, `connect-grow-hire/src/data/scout-knowledge.ts`

#### Credit Costs

| Feature | Credits | Unit |
|---------|---------|------|
| Contact Search | 15 | per contact |
| Firm Search | 5 | per firm |
| Meeting Prep | 15 | per prep |
| Interview Prep | 25 | per prep |
| Resume Optimization (Job Board) | 20 | per optimization |
| Cover Letter Generation (Job Board) | 15 | per letter |
| Reply Generation (Outbox) | 10 | per reply |
| Resume Optimization (Resume Workshop) | Varies | per operation |
| Cover Letter (Cover Letter Page) | 10 | per letter (from knowledge base) |
| Recruiter Search | 15 | per search |

#### Credit Reset

- **When:** Monthly, based on subscription billing cycle
- **Do unused credits roll over?** No - credits reset at the beginning of each billing cycle and do not roll over
- **Reset Date:** Based on subscription start date (Stripe billing cycle)

#### Credit Display

- Shown in sidebar footer: `{credits}/{maxCredits}`
- Progress bar showing percentage used
- Credits checked before each operation
- Insufficient credits error messages show required amount

---

### 1.5 Removed Features

**Note:** Based on codebase analysis, these features may have been planned but are NOT currently implemented or have been removed:

- **Job Board:** Still exists (`/job-board` route active) - NOT removed
- All routes in `App.tsx` are currently active

**No confirmed removed features** - all routes in the router are currently functional.

---

## PART 2: SCOUT IMPLEMENTATION AUDIT

### 2.1 Scout Components

#### Frontend Components

| File | Exists? | Purpose |
|------|---------|---------|
| `src/components/ScoutChatbot.tsx` | Yes | Main chat interface for job search assistance (used in ContactSearchPage, deprecated in favor of ScoutHelperChatbot) |
| `src/components/ScoutPage.tsx` | Yes | Full-page Scout AI Assistant (ChatGPT-style interface) |
| `src/components/ScoutSidePanel.tsx` | Yes | Slide-out side panel for Scout (global, accessible via Cmd+K) |
| `src/components/ScoutBubble.tsx` | Yes | Floating bubble wrapper (deprecated, replaced by ScoutHeaderButton) |
| `src/components/ScoutHeaderButton.tsx` | Yes | Header button to open Scout panel (used in PageHeaderActions) |
| `src/components/ScoutFirmAssistant.tsx` | Yes | Firm search assistant chat interface (specialized for Firm Search page) |
| `src/components/ScoutFirmAssistantButton.tsx` | Yes | Button wrapper for firm assistant (draggable/resizable window) |
| `src/components/ScoutHelperChatbot.tsx` | Yes | Lightweight chatbot for navigation/explanation (used in ApplicationLabPage, ContactSearchPage) |
| `src/components/ScoutConversationList.tsx` | Yes | Sidebar for managing conversation history (used in ScoutHelperChatbot) |

#### Frontend Hooks & Services

| File | Exists? | Purpose |
|------|---------|---------|
| `src/hooks/useScoutChat.ts` | Yes | Shared chat hook for message handling (used by ScoutPage, ScoutSidePanel) |
| `src/services/scoutConversations.ts` | Yes | Firestore service for conversation persistence |
| `src/contexts/ScoutContext.tsx` | Yes | Global state for Scout panel (open/close, search help mode) |
| `src/types/scout.ts` | Yes | TypeScript types for Scout features (EnhancedFitAnalysis, etc.) |
| `src/data/scout-knowledge.ts` | Yes | Knowledge base for Scout assistant (pages, features, credit costs, tiers, troubleshooting) |

#### Backend Services

| File | Exists? | Purpose |
|------|---------|---------|
| `backend/app/routes/scout.py` | Yes | API endpoints for job search Scout (`/api/scout/*`) |
| `backend/app/routes/scout_assistant.py` | Yes | API endpoints for product assistant Scout (`/api/scout-assistant/*`) |
| `backend/app/services/scout_service.py` | Yes | Main service for job search functionality (~3480 lines) |
| `backend/app/services/scout_assistant_service.py` | Yes | Service for product navigation assistant (~700 lines) |

---

### 2.2 Scout API Endpoints

#### Job Search Scout (`/api/scout/*`)

**Base URL:** `/api/scout`

##### POST `/api/scout/chat`
- **Purpose:** Main Scout chat endpoint for job search assistance
- **Request:**
  ```json
  {
    "message": "string",
    "context": {
      "user_resume": { ... },
      "recent_topics": [],
      "history": []
    },
    "conversation_id": "string (optional)",
    "conversation_history": [{"role": "user|assistant", "content": "..."}]
  }
  ```
- **Response:**
  ```json
  {
    "status": "ok|needs_input|error",
    "message": "string",
    "fields": {
      "job_title": "string",
      "company": "string",
      "location": "string",
      "experience_level": "string"
    },
    "job_listings": [...],
    "fit_analysis": {...},
    "intent": "URL_PARSE|JOB_SEARCH|FIELD_HELP|RESEARCH|CONVERSATION",
    "context": {...}
  }
  ```
- **Credit Cost:** Uses credits for job searches and analysis

##### POST `/api/scout/analyze-job`
- **Purpose:** Analyze how well user fits a specific job
- **Request:**
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
- **Response:**
  ```json
  {
    "status": "ok",
    "analysis": {
      "score": 0-100,
      "match_level": "strong|good|moderate|stretch",
      "strengths": [{"point": "string", "evidence": "string"}],
      "gaps": [{"gap": "string", "mitigation": "string"}],
      "pitch": "string",
      "talking_points": ["string"],
      "keywords_to_use": ["string"]
    }
  }
  ```
- **Credit Cost:** Uses credits for analysis

##### POST `/api/scout/firm-assist`
- **Purpose:** Scout assistant for Firm Search page
- **Request:**
  ```json
  {
    "message": "string",
    "firm_context": {
      "current_query": "string",
      "current_results": [Firm],
      "parsed_filters": {...}
    },
    "user_resume": {...},
    "fit_context": {...},
    "conversation_history": [Message]
  }
  ```
- **Response:**
  ```json
  {
    "status": "ok",
    "message": "string",
    "suggestions": {
      "refined_query": "string",
      "recommended_firms": ["string"],
      "firm_insights": {...},
      "next_steps": ["string"]
    },
    "action_type": "generate_query|refine_query|recommend_firms|research_firm|next_steps|general"
  }
  ```
- **Credit Cost:** Uses credits for firm searches

##### GET `/api/scout/health`
- **Purpose:** Health check endpoint
- **Response:** `{"status": "ok", "service": "scout"}`
- **Credit Cost:** Free

#### Product Assistant Scout (`/api/scout-assistant/*`)

**Base URL:** `/api/scout-assistant`

##### POST `/api/scout-assistant/chat`
- **Purpose:** Main Scout assistant chat endpoint (product navigation)
- **Request:**
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
- **Headers:** `Authorization: Bearer <firebase_token>` (required)
- **Response:**
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
- **Credit Cost:** **FREE** - No credits used (helper feature)

##### POST `/api/scout-assistant/search-help`
- **Purpose:** Help users when search fails (no results or error)
- **Request:**
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
- **Headers:** `Authorization: Bearer <firebase_token>` (required)
- **Response:**
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
- **Credit Cost:** **FREE** - No credits used (helper feature)

##### GET `/api/scout-assistant/health`
- **Purpose:** Health check endpoint
- **Response:** `{"status": "ok", "service": "scout-assistant"}`
- **Credit Cost:** Free

---

### 2.3 Current System Prompts

#### Scout Assistant System Prompt

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

Always include "auto_populate" when the user is asking for specific contacts or firms, so the search fields are pre-filled when they click "Take me there."

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

#### Job Search Scout Conversation Prompt

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

#### Search Help Prompts

**Contact Search Help** - Located in: `backend/app/services/scout_assistant_service.py:460-495`

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

**Firm Search Help** - Located in: `backend/app/services/scout_assistant_service.py:558-595`

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

---

### 2.4 Scout Capabilities

What Scout currently can do:

- [x] Answer questions about Offerloop features
- [x] Navigate users to pages
- [x] Auto-populate search fields
- [x] Parse job URLs (Job Search Scout only)
- [x] Search for jobs (Job Search Scout only)
- [x] Analyze job fit (Job Search Scout only)
- [x] Help with firm search (Firm Assistant)
- [x] Generate search suggestions (Search Help mode)
- [x] Help when searches fail (Search Help mode)
- [x] Provide troubleshooting guidance
- [x] Explain credit costs and tiers
- [x] Guide users through workflows

What Scout currently CANNOT do:

- [ ] Access user's saved contacts directly
- [ ] Access user's email threads directly
- [ ] Perform actions on behalf of user (only guides)
- [ ] Generate emails or preps (only guides to features)
- [ ] Access billing/subscription details directly
- [ ] Remember conversations across browser sessions (Scout Assistant only - uses sessionStorage)

---

### 2.5 What Scout Knows

**Source:** `connect-grow-hire/src/data/scout-knowledge.ts` and `backend/app/services/scout_assistant_service.py`

#### Pages Scout Knows About

Scout has knowledge of all pages in the sidebar:
- Dashboard (`/dashboard`)
- Contact Search (`/contact-search`)
- Firm Search (`/firm-search`)
- Find Hiring Managers (`/recruiter-spreadsheet`)
- Meeting Prep (`/meeting-prep`)
- Interview Prep (`/interview-prep`)
- Resume (`/write/resume`)
- Cover Letter (`/write/cover-letter`)
- Track Email Outreach (`/outbox`)
- Calendar (`/calendar`)
- Networking (`/contact-directory`)
- Hiring Managers (`/hiring-manager-tracker`)
- Companies (`/company-tracker`)
- Pricing (`/pricing`)
- Account Settings (`/account-settings`)
- Application Lab (`/application-lab`)
- Job Board (`/job-board`)

#### Features Scout Knows About

- Contact Search: 15 credits per contact, tier-based limits
- Firm Search: 5 credits per firm, Pro+ only
- Meeting Prep: 15 credits per prep, tier-based monthly limits
- Interview Prep: 25 credits per prep, tier-based monthly limits
- Resume Optimization: 20 credits (Job Board), varies (Resume Workshop)
- Cover Letter: 15 credits (Job Board), 10 credits (Cover Letter page)
- Reply Generation: 10 credits per reply

#### Credit System Scout Knows

- Free: 300 credits/month, up to 3 contacts per search
- Pro: 1,500 credits/month, up to 8 contacts per search
- Elite: 3,000 credits/month, up to 15 contacts per search
- Credits reset monthly (don't roll over)
- Credit costs for each feature

#### Troubleshooting Scout Knows

- Gmail not connected: Go to Account Settings
- Out of credits: Check credits in sidebar, upgrade at Pricing
- No contacts found: Try broader job titles or different locations
- Emails seem generic: Upload resume for better personalization
- Prep taking too long: Normal for Interview Prep (2-3 minutes)

#### Route Keywords

Scout uses keyword matching to suggest routes:
- Contact Search: "contact", "search", "find contacts", "networking", "outreach", "email", "people", "professionals"
- Firm Search: "firm", "company", "companies", "employers", "find firms", "search companies"
- Job Board: "job", "jobs", "listings", "openings", "positions", "resume", "cover letter", "recruiter"
- Meeting Prep: "meeting", "coffee prep", "networking prep", "informational"
- Interview Prep: "interview prep", "interview preparation", "prepare for interview"
- Application Lab: "application lab", "fit analysis", "job fit", "analyze application"
- Pricing: "pricing", "plans", "upgrade", "subscription", "pro", "elite", "credits", "billing"
- Account Settings: "settings", "account", "profile", "gmail", "connect gmail", "resume upload"
- Outbox: "outbox", "emails", "drafts", "sent", "replies"
- Calendar: "calendar", "timeline", "schedule", "deadlines"

---

## PART 3: KNOWLEDGE BASE CONTENT

### 3.1 Platform Overview

**Offerloop** is an AI-powered networking and recruiting platform designed for students and professionals seeking internships and full-time positions. The platform helps users find contacts at target companies, generate personalized outreach emails, prepare for networking conversations and interviews, and track their recruiting progress - all while saving significant time through automation.

**Who it's for:** Students and professionals actively recruiting for internships and full-time roles, particularly in competitive fields like investment banking, consulting, technology, and finance.

**Core value proposition:** Automate the time-consuming parts of networking and job searching (finding contacts, writing emails, preparing for conversations) so users can focus on building relationships and landing opportunities.

---

### 3.2 Feature Descriptions

#### Contact Search (Find People)

**What it does:** Finds professionals at companies based on job title, company, and location. Automatically generates personalized outreach emails using AI.

**How to use it:**
1. Go to Contact Search from the sidebar
2. Enter the job title you're targeting (e.g., "Investment Banking Analyst")
3. Enter the company name (e.g., "Goldman Sachs") - optional
4. Enter the location (e.g., "New York, NY")
5. Optionally filter by college or experience level
6. Select how many contacts you want (1-15 depending on your plan)
7. Click Search to find contacts
8. Review the contacts and generated emails
9. Emails are saved to Gmail drafts automatically (if Gmail connected)
10. Save contacts to your directory for later

**Credit cost:** 15 credits per contact

**Tier requirements:** All tiers (Free: up to 3 contacts per search, Pro: up to 8, Elite: up to 15)

#### Firm Search (Find Companies)

**What it does:** Discovers companies matching your criteria using natural language search. Great for finding employers you might not know about.

**How to use it:**
1. Go to Firm Search from the sidebar
2. Type a natural language query (e.g., "Investment banks in NYC focused on healthcare M&A")
3. Select batch size (5, 10, 20, or 40 firms)
4. Click Search to find matching companies
5. Review firm details (industry, location, size, description)
6. Save interesting firms to your list
7. Use Scout assistant to refine searches or get recommendations

**Credit cost:** 5 credits per firm

**Tier requirements:** Pro and Elite only (Free tier blocked)

#### Meeting Prep

**What it does:** Generates comprehensive preparation materials for networking conversations. Includes talking points, questions to ask, and research on the person and their company.

**How to use it:**
1. Go to Meeting Prep from the sidebar
2. Find the LinkedIn URL of the person you're meeting
3. Paste the URL in the input field
4. Click Generate Prep
5. Wait for the AI to research and compile materials (takes 1-2 minutes)
6. Review the prep materials (talking points, questions, company news, similarity analysis)
7. Download as PDF to reference during the meeting

**Credit cost:** 15 credits per prep

**Tier requirements:** All tiers (Free: 3 preps lifetime, Pro: 10/month, Elite: unlimited)

#### Interview Prep

**What it does:** Generates interview preparation guides based on job postings. Scrapes Reddit and other sources for real interview experiences at that company.

**How to use it:**
1. Go to Interview Prep from the sidebar
2. Get the job posting URL
3. Paste it in the input field (or manually enter company and job title)
4. Click Generate Prep
5. Wait for Reddit and online research (takes 2-3 minutes)
6. Review interview process, common questions, company culture insights
7. Study the success tips and red flags
8. Download PDF for offline review

**Credit cost:** 25 credits per prep

**Tier requirements:** All tiers (Free: 2 preps lifetime, Pro: 5/month, Elite: unlimited)

#### Application Lab

**What it does:** Deep analysis of how well you match a specific job. Get requirement-by-requirement breakdown, resume edit suggestions, and custom cover letters.

**How to use it:**
1. Go to Application Lab
2. Paste a job posting URL or description
3. Click Analyze
4. Review your fit score and requirement matches
5. Apply suggested resume edits
6. Generate a custom cover letter
7. Review pitch and talking points for interviews

**Credit cost:** Varies (analysis and generation use credits)

**Tier requirements:** All tiers (Elite gets priority queue)

#### Resume Workshop

**What it does:** Resume optimization workspace. Score your resume, tailor it for specific jobs, fix issues, and manage your resume library.

**How to use it:**
1. Go to Resume from the sidebar
2. Upload your resume PDF (if not already uploaded)
3. View resume preview and ATS score
4. Optionally enter job context to tailor resume
5. Click "Fix Resume" to identify issues
6. Click "Score Resume" to get ATS score
7. Apply recommendations to improve resume
8. Save tailored versions to library

**Credit cost:** Varies by operation

**Tier requirements:** All tiers

#### Cover Letter

**What it does:** Generate custom cover letters for job applications.

**How to use it:**
1. Go to Cover Letter from the sidebar
2. Paste job posting URL or enter job details
3. Click Generate
4. Review and edit the cover letter
5. Download as PDF

**Credit cost:** 10 credits per letter

**Tier requirements:** All tiers

#### Track Email Outreach (Outbox)

**What it does:** Manage your email threads and track responses. View drafts, sent emails, and replies.

**How to use it:**
1. Go to Track Email Outreach from the sidebar
2. View all email threads with status indicators
3. Click on a thread to see conversation history
4. Use "Generate Reply" to get AI-suggested responses (10 credits)
5. Open emails in Gmail to send or edit

**Credit cost:** 10 credits per reply generation

**Tier requirements:** All tiers

#### Calendar

**What it does:** View your personalized recruiting timeline with key dates and milestones.

**How to use it:**
1. Go to Calendar from the sidebar
2. View AI-generated recruiting timeline
3. See phase-based planning and key milestones
4. Track deadlines and important dates

**Credit cost:** Free

**Tier requirements:** All tiers

#### Job Board

**What it does:** Browse job listings, optimize your resume for specific jobs, generate cover letters, and find recruiters.

**How to use it:**
1. Go to Job Board from the sidebar
2. Browse AI-curated job listings
3. Click on a job to see details
4. Click "Optimize Resume" to tailor your resume (20 credits)
5. Click "Generate Cover Letter" (15 credits)
6. Click "Find Recruiter" to find recruiters at that company (15 credits)
7. Save jobs for later

**Credit cost:** 20 credits per resume optimization, 15 credits per cover letter, 15 credits per recruiter search

**Tier requirements:** All tiers

---

### 3.3 Troubleshooting FAQ

#### Gmail Connection Issues

**Issue:** Gmail not connected or emails not saving to drafts

**Symptoms:**
- "Connect Gmail" button showing in Account Settings
- Emails not appearing in Gmail drafts after search
- Error messages about Gmail connection

**Solution:**
1. Go to Account Settings
2. Find the Gmail section
3. Click "Connect Gmail"
4. Sign in with your Google account
5. Grant permissions for draft access
6. Try your search again

**Prevention:** Connect Gmail before using Contact Search for full functionality

#### Credit Issues

**Issue:** Out of credits or insufficient credits

**Symptoms:**
- Searches failing with "Insufficient credits" message
- Actions blocked
- Credit balance showing 0 or low number

**Solution:**
1. Check your credits in the sidebar (shows current/max)
2. Go to Pricing to upgrade your plan
3. Credits reset monthly - check your reset date
4. Pro ($14.99) gives 1,500 credits, Elite ($34.99) gives 3,000
5. Free tier: 300 credits/month

**Note:** Unused credits don't roll over - use them before they reset!

#### Search Returning No Results

**Issue:** Contact search or firm search returns no results

**Symptoms:**
- Empty search results
- "No contacts found" message
- Few or no matches

**Solution:**
1. **For Contact Search:**
   - Try broader job titles (e.g., "Analyst" instead of "Investment Banking Analyst")
   - Check spelling of company name
   - Try different locations or remove location filter
   - Some smaller companies may have limited data
   - Use Scout's search help feature for alternative suggestions

2. **For Firm Search:**
   - Try broader industry terms
   - Use metro area instead of city (e.g., "Bay Area" instead of "San Francisco")
   - Remove size filters if too restrictive
   - Use Scout assistant to refine your search

#### Prep Generation Failing

**Issue:** Meeting Prep or Interview Prep taking too long or failing

**Symptoms:**
- Loading for more than 5 minutes
- Stuck on processing
- Error messages

**Solution:**
1. **Meeting Prep:** Usually takes 1-2 minutes - if stuck longer, refresh and try again
2. **Interview Prep:** Can take 2-3 minutes (normal) - if stuck longer, refresh and try again
3. Check if the LinkedIn URL or job posting is accessible
4. Make sure you have enough credits (15 for Meeting, 25 for Interview Prep)
5. Check if you've hit your monthly limit (Free/Pro tiers)

#### Email Personalization Issues

**Issue:** Emails seem generic or not personalized

**Symptoms:**
- Basic email templates
- No resume references
- Generic content

**Solution:**
1. Make sure you've uploaded your resume in Account Settings
2. Pro/Elite users get resume-matched personalization
3. Complete your profile with career interests
4. The more info you provide, the better personalization

#### Subscription/Billing Issues

**Issue:** Payment failed, plan not updating, credits not showing

**Symptoms:**
- Payment failed message
- Plan upgraded but credits not showing
- Billing errors

**Solution:**
1. Go to Pricing and click "Manage Subscription"
2. This opens Stripe where you can update payment
3. If plan upgraded but credits not showing, refresh the page
4. Contact support if issues persist

#### Firm Search Blocked

**Issue:** Cannot access Firm Search

**Symptoms:**
- Firm Search button grayed out or not visible
- "Upgrade to Pro" message

**Solution:**
1. Firm Search is a Pro+ feature
2. Free tier users cannot access it
3. Upgrade to Pro ($14.99/month) or Elite ($34.99/month) to unlock
4. Go to Pricing to upgrade

---

### 3.4 Workflows

#### Finding Contacts to Network With

**Step-by-step:**
1. Connect Gmail in Account Settings (if not done)
2. Go to Contact Search from the sidebar
3. Enter the job title you're targeting (e.g., "Investment Banking Analyst")
4. Enter the company name (e.g., "Goldman Sachs") - optional but recommended
5. Enter the location (e.g., "New York, NY")
6. Optionally filter by college or experience level
7. Select how many contacts you want (1-15 depending on your plan)
8. Click Search
9. Review the contacts and generated emails
10. Emails are saved to Gmail drafts automatically
11. Open Gmail, review, personalize if needed, and send
12. Save contacts to your directory for later reference

**Time saved:** ~20 minutes per contact (manual research + email writing)

#### Preparing for a Meeting

**Step-by-step:**
1. Go to Meeting Prep from the sidebar
2. Find the LinkedIn URL of the person you're meeting
3. Paste the URL in the input field
4. Click Generate Prep
5. Wait 1-2 minutes for research to complete
6. Review the prep materials:
   - Talking points based on their background
   - Suggested questions to ask
   - Company news and recent developments
   - Similarity analysis (common ground)
7. Download PDF to reference during the meeting
8. Use the suggested questions during your conversation

**Time saved:** ~30 minutes per prep (research + preparation)

#### Preparing for an Interview

**Step-by-step:**
1. Go to Interview Prep from the sidebar
2. Get the job posting URL
3. Paste it in the input field
4. Click Generate Prep
5. Wait 2-3 minutes for research to complete
6. Review the prep materials:
   - Interview process overview
   - Common interview questions
   - Company culture insights
   - Success tips
   - Red flags to avoid
7. Study the common questions and practice answers
8. Download PDF for offline review

**Time saved:** ~60 minutes per prep (research + preparation)

#### Optimizing Your Resume for a Job

**Step-by-step:**
1. Go to Job Board and find a job you like
2. Click on the job to see details
3. Click "Optimize Resume" on that job
4. AI analyzes your resume against the job
5. Review ATS score and suggestions
6. Apply the recommended changes
7. Download the optimized version

**Alternative (Resume Workshop):**
1. Go to Resume from the sidebar
2. Upload your resume if not already uploaded
3. Enter job context (job title, company, job description)
4. Click "Tailor Resume"
5. Review suggestions and apply changes
6. Save tailored version to library

**Credit cost:** 20 credits (Job Board) or varies (Resume Workshop)

#### Finding Recruiters for a Job

**Step-by-step:**
1. Go to Job Board
2. Find a job listing you're interested in
3. Click "Find Recruiter" button
4. AI searches for recruiters at that company
5. Review recruiter profiles and emails
6. Emails are drafted and saved to Gmail
7. Open Gmail to review and send

**Credit cost:** 15 credits per recruiter search

#### Connecting Gmail

**Step-by-step:**
1. Click on Settings in the sidebar (or your profile)
2. Go to Account Settings
3. Find the Gmail section
4. Click "Connect Gmail"
5. Sign in with your Google account
6. Grant permissions for draft access
7. You're connected! Emails will now save to drafts automatically

**Note:** You must connect Gmail before using Contact Search for full functionality

#### Getting More Credits

**Step-by-step:**
1. Go to Pricing from the sidebar
2. Compare Free, Pro, and Elite plans
3. Click "Upgrade" on your chosen plan
4. Complete payment through Stripe
5. Credits are added immediately
6. Your new plan limits are now active

**Note:** Credits reset monthly based on your subscription date. Unused credits don't roll over.

---

## Appendix: Key Constants

### Credit Costs (Backend)

**Location:** `backend/app/config.py`, `backend/app/routes/*.py`

- `MEETING_CREDITS = 15`
- `INTERVIEW_PREP_CREDITS = 25`
- Contact Search: 15 credits per contact (hardcoded in routes)
- Firm Search: 5 credits per firm (`CREDITS_PER_FIRM = 5`)
- Resume Optimization (Job Board): 20 credits (`OPTIMIZATION_CREDIT_COST = 20`)
- Cover Letter (Job Board): 15 credits (`COVER_LETTER_CREDIT_COST = 15`)
- Reply Generation: 10 credits (`REPLY_GENERATION_CREDIT_COST = 10`)

### Tier Limits (Backend)

**Location:** `backend/app/config.py:108-182`

**Free:**
- `max_contacts: 3`
- `coffee_chat_preps: 3` (lifetime)
- `interview_preps: 2` (lifetime)
- `firm_search: False`
- `export_enabled: False`
- `bulk_drafting: False`

**Pro:**
- `max_contacts: 8`
- `coffee_chat_preps: 10` (monthly)
- `interview_preps: 5` (monthly)
- `firm_search: True`
- `export_enabled: True`
- `bulk_drafting: True`

**Elite:**
- `max_contacts: 15`
- `coffee_chat_preps: 'unlimited'`
- `interview_preps: 'unlimited'`
- `firm_search: True`
- `priority_queue: True`
- `personalized_templates: True`

---

**End of Audit Document**

