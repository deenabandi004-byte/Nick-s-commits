# Offerloop - AI-Powered Networking Platform

## Project Overview

Offerloop is a full-stack AI-powered professional networking platform built for college students. It automates the most time-consuming parts of career networking: discovering contacts, writing personalized outreach emails, preparing for meetings and interviews, and managing follow-ups.

**Core Features:**
- **Automated Contact Discovery** - Search for professionals by job title, company, location, and alumni network using People Data Labs (PDL)
- **AI Email Generation** - GPT-4o-mini generates personalized networking emails with anchor-based personalization (career transitions, tenure, title/company)
- **Meeting Prep** - AI-generated prep notes with talking points, company research, and conversation starters
- **Interview Prep** - AI-powered interview question generation with YouTube/Reddit/Glassdoor content aggregation
- **Resume Workshop** - Upload, parse, score (ATS), optimize, and tailor resumes with AI
- **Cover Letter Workshop** - AI-generated cover letters tailored to job descriptions
- **Gmail Integration** - OAuth2 connection for creating drafts and sending emails directly
- **Outbox & Tracking** - Track email status, replies, and follow-ups
- **Scout AI Assistant** - In-app AI chatbot for career guidance and platform help
- **Firm Search** - Company research with detailed overviews, culture insights, and recruiting timelines

**Team:** Sid (CTO), Nick Wittig (CEO), Rylan Bohnett (CMO) - all USC class of 2027.

**Stage:** UC LAUNCH accelerator Spring 2026, New Venture Seed Competition competitor.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript, Vite (SWC), Tailwind CSS, shadcn/ui (Radix primitives), React Router v6, TanStack Query, Lucide icons, Framer Motion |
| **Backend** | Python Flask, Gunicorn, Flask-CORS, Flask-Limiter |
| **Database** | Firebase Firestore (NoSQL). Legacy SQLite (`contacts.db`) for contact directory |
| **Auth** | Firebase Authentication (Google OAuth + email/password) |
| **Contact Search** | People Data Labs (PDL) v5 API - person search, company clean, location clean |
| **Email Generation** | OpenAI GPT-4o-mini (temperature 0.75, max_tokens 4000) |
| **Email Delivery** | Gmail API OAuth2 - draft creation, sending, reply tracking |
| **Payments** | Stripe - subscriptions, checkout sessions, customer portal, webhooks |
| **Email Enrichment** | Hunter.io - email verification and discovery |
| **Web Scraping** | SerpAPI (Google search), Jina AI (content extraction), YouTube Transcript API |
| **PDF Generation** | WeasyPrint, ReportLab, PyPDF2, @react-pdf/renderer (frontend) |
| **Analytics** | PostHog (event tracking, user identification) |
| **Error Tracking** | Sentry (optional, Flask integration) |
| **Hosting** | Render (backend), Firebase Hosting (frontend) |

---

## Annotated File Tree

```
Offerloop/
├── .env                                    # Backend environment variables (API keys, secrets)
├── CLAUDE.md                               # Claude Code instructions
├── cursor-rules.md                         # Timeline feature implementation context
├── firebase.json                           # Firebase project config (Firestore location: nam5)
├── firestore.rules                         # Firestore security rules (tier protection, subcollection ACLs)
├── firestore.indexes.json                  # Firestore composite indexes
├── contacts.db                             # Legacy SQLite database for contact directory
│
├── backend/                                # Python Flask REST API
│   ├── wsgi.py                             # CANONICAL entry point - app factory, 32+ blueprint registration
│   ├── app.py                              # Deprecated entry point (use wsgi.py)
│   ├── email_templates.py                  # Email style/purpose presets (casual, professional, short_direct, etc.)
│   ├── requirements.txt                    # Python dependencies (Flask, OpenAI, firebase-admin, stripe, etc.)
│   ├── pytest.ini                          # Pytest configuration
│   ├── reset_user_credits.py               # Admin script: reset user credits
│   ├── update_user_tier.py                 # Admin script: change user tier
│   ├── upgrade_users_to_elite_batch.py     # Admin script: batch elite upgrades
│   ├── elite_upgrade_uids.txt              # List of UIDs for elite upgrades
│   │
│   ├── app/
│   │   ├── __init__.py                     # Legacy app factory (subset of blueprints)
│   │   ├── config.py                       # All configuration: API keys, tier configs, PDL metro areas, constants
│   │   ├── extensions.py                   # Flask extensions: Firebase init, CORS, rate limiting, auth/tier decorators
│   │   ├── logging_config.py               # Logging setup
│   │   │
│   │   ├── routes/                         # Flask Blueprints (32+ registered in wsgi.py)
│   │   │   ├── health.py                   # GET /api/health - health check
│   │   │   ├── runs.py                     # POST /api/runs/search - main contact search + email generation
│   │   │   ├── runs_hunter.py              # Hunter.io email enrichment routes
│   │   │   ├── emails.py                   # POST /api/emails/generate-and-draft - email generation with Gmail drafts
│   │   │   ├── email_template.py           # Email template CRUD routes
│   │   │   ├── contacts.py                 # Contact CRUD (save, update, delete, bulk operations)
│   │   │   ├── directory.py                # Contact directory/library management
│   │   │   ├── contact_import.py           # CSV/bulk contact import
│   │   │   ├── linkedin_import.py          # LinkedIn profile import
│   │   │   ├── enrichment.py               # Contact enrichment endpoints
│   │   │   ├── gmail_oauth.py              # Gmail OAuth2 flow (start, callback, status, disconnect)
│   │   │   ├── gmail_webhook.py            # Gmail Pub/Sub webhook receiver
│   │   │   ├── resume.py                   # Resume upload, parsing, text extraction
│   │   │   ├── resume_workshop.py          # Resume optimization, ATS scoring, tailoring
│   │   │   ├── resume_pdf_patch.py         # Resume PDF patching/editing
│   │   │   ├── cover_letter_workshop.py    # Cover letter generation and management
│   │   │   ├── meeting_prep.py         # Meeting prep generation (OpenAI + web research)
│   │   │   ├── interview_prep.py           # Interview prep generation (Glassdoor, YouTube, Reddit)
│   │   │   ├── billing.py                  # Stripe checkout, webhooks, portal, tier info, credit checks
│   │   │   ├── users.py                    # User profile endpoints (get, update, professional info)
│   │   │   ├── outbox.py                   # Outbox management (email tracking, status updates, reply detection)
│   │   │   ├── scout.py                    # Scout AI assistant (recruiter finder)
│   │   │   ├── scout_assistant.py          # Scout assistant chat routes
│   │   │   ├── firm_search.py              # Firm/company search and details
│   │   │   ├── job_board.py                # Job board aggregation
│   │   │   ├── dashboard.py                # Dashboard statistics and data
│   │   │   ├── timeline.py                 # Recruiting timeline CRUD
│   │   │   ├── search_history.py           # Search history management
│   │   │   ├── prompt_search.py            # Natural language prompt-based search
│   │   │   ├── parse_prompt.py             # Search prompt parsing (NLP → structured query)
│   │   │   ├── application_lab.py          # Application tracking lab
│   │   │   ├── auth_extension.py           # Chrome extension auth
│   │   │   ├── admin.py                    # Admin endpoints
│   │   │   └── spa.py                      # SPA fallback route handler
│   │   │
│   │   ├── services/                       # Business logic layer (39+ files)
│   │   │   ├── pdl_client.py               # PDL API: search, alumni filtering, location strategies, deduplication
│   │   │   ├── openai_client.py            # OpenAI client initialization with timeout tuning
│   │   │   ├── reply_generation.py         # Core email generation: system prompts, anchor system, batch generation
│   │   │   ├── recruiter_email_generator.py # Recruiter outreach email generation
│   │   │   ├── gmail_client.py             # Gmail API: OAuth creds, draft creation, watch/push notifications
│   │   │   ├── stripe_client.py            # Stripe: checkout, webhooks, portal, tier management
│   │   │   ├── auth.py                     # Credit management: check/reset, atomic deduction, feature access
│   │   │   ├── hunter.py                   # Hunter.io email enrichment
│   │   │   ├── resume_parser.py            # PDF/DOCX resume text extraction
│   │   │   ├── resume_parser_v2.py         # Enhanced resume parser
│   │   │   ├── resume_optimizer_v2.py      # AI resume optimization
│   │   │   ├── resume_template.py          # Resume templates
│   │   │   ├── resume_capabilities.py      # Resume feature capabilities
│   │   │   ├── pdf_builder.py              # PDF generation (WeasyPrint/ReportLab)
│   │   │   ├── pdf_patcher.py              # PDF patching/editing
│   │   │   ├── docx_service.py             # DOCX generation
│   │   │   ├── meeting.py              # Meeting prep business logic
│   │   │   ├── prompt_parser.py            # NLP prompt → structured search params
│   │   │   ├── prompt_pdl_search.py        # Prompt-to-PDL search execution
│   │   │   ├── contact_search_optimized.py # Optimized contact search pipeline
│   │   │   ├── company_search.py           # Company/firm search logic
│   │   │   ├── company_extraction.py       # Company data extraction
│   │   │   ├── firm_details_extraction.py  # Firm details web scraping
│   │   │   ├── directory_search.py         # Local contact directory search
│   │   │   ├── scout_service.py            # Scout service logic
│   │   │   ├── scout_assistant_service.py  # Scout assistant AI service
│   │   │   ├── application_lab_service.py  # Application lab service
│   │   │   ├── ats_scorer.py               # ATS resume score calculation
│   │   │   ├── skills_taxonomy.py          # Skills taxonomy for matching
│   │   │   ├── serp_client.py              # SerpAPI web search
│   │   │   ├── firebase.py                 # Firebase utility functions
│   │   │   ├── cache.py                    # Caching utilities
│   │   │   ├── job_queue.py                # Background job processing
│   │   │   ├── background_sync.py          # Background sync tasks
│   │   │   ├── search_progress.py          # Search progress tracking
│   │   │   ├── migration.py                # Data migration utilities
│   │   │   └── interview_prep/             # Interview prep submodule
│   │   │       ├── glassdoor_scraper.py    # Glassdoor scraping
│   │   │       ├── resume_parser.py        # Resume parsing for interview prep
│   │   │       ├── content_processor.py    # Content processing
│   │   │       ├── job_posting_parser.py   # Job posting parsing
│   │   │       ├── question_extractor.py   # Interview question extraction
│   │   │       └── pdf_generator.py        # Interview prep PDF generation
│   │   │
│   │   ├── models/                         # Data models
│   │   │   ├── enums.py                    # Enum definitions
│   │   │   ├── users.py                    # User models
│   │   │   ├── contact.py                  # Contact models
│   │   │   └── meeting_prep.py         # Meeting prep models
│   │   │
│   │   └── utils/                          # Utility modules
│   │       ├── users.py                    # User info extraction from resumes
│   │       ├── contact.py                  # Contact utility functions (clean_email_text)
│   │       ├── meeting_prep.py         # Commonality detection
│   │       ├── validation.py               # Request validation (Pydantic models)
│   │       ├── exceptions.py               # Custom exceptions (ValidationError, InsufficientCreditsError, etc.)
│   │       ├── retry.py                    # Retry decorator with backoff
│   │       ├── sentry_config.py            # Sentry error tracking setup
│   │       ├── swagger_config.py           # Swagger API docs (dev only)
│   │       ├── job_url_fetcher.py          # Job URL fetching
│   │       └── firestore_limiter.py        # Firestore-based rate limiter storage
│   │
│   └── tests/                              # Test suite (pytest)
│       ├── interview_prep/                 # Interview prep tests
│       ├── output/                         # Test output
│       └── results/                        # Test results
│
├── connect-grow-hire/                      # React SPA Frontend
│   ├── package.json                        # 73 dependencies, 11 devDependencies
│   ├── vite.config.ts                      # Vite config with manual chunk splitting
│   ├── tailwind.config.ts                  # Tailwind CSS configuration
│   ├── tsconfig.json                       # TypeScript config (strictNullChecks: false)
│   ├── .env                                # Frontend env vars (VITE_ prefixed)
│   ├── .env.production                     # Production env vars
│   │
│   └── src/
│       ├── App.tsx                         # Root component: routing (43 routes), providers, route guards
│       ├── main.tsx                        # Entry point
│       ├── index.css                       # Global styles
│       │
│       ├── pages/                          # 43 page components
│       │   ├── Index.tsx                   # Landing page (43KB)
│       │   ├── SignIn.tsx                  # Sign in/signup (20KB)
│       │   ├── ContactSearchPage.tsx       # Main contact search (72KB)
│       │   ├── FirmSearchPage.tsx          # Firm/company search (71KB)
│       │   ├── Outbox.tsx                  # Email tracking (71KB)
│       │   ├── InterviewPrepPage.tsx       # Interview prep (61KB)
│       │   ├── ResumeWorkshopPage.tsx      # Resume workshop (64KB)
│       │   ├── CoverLetterPage.tsx         # Cover letter generator (56KB)
│       │   ├── MeetingPrepPage.tsx      # Meeting prep (47KB)
│       │   ├── JobBoardPage.tsx            # Job board (108KB)
│       │   ├── AccountSettings.tsx         # Settings & subscription (107KB)
│       │   ├── Pricing.tsx                 # Pricing page (34KB)
│       │   ├── RecruiterSpreadsheetPage.tsx # Recruiter finder (44KB)
│       │   ├── ResumePage.tsx              # My Resume editor (57KB)
│       │   ├── OnboardingFlow.tsx          # Onboarding orchestrator
│       │   ├── OnboardingProfile.tsx       # Onboarding: profile setup
│       │   ├── OnboardingAcademics.tsx     # Onboarding: academics (39KB)
│       │   ├── OnboardingLocationPreferences.tsx # Onboarding: location prefs
│       │   └── [20+ more pages...]
│       │
│       ├── components/                     # Feature & UI components
│       │   ├── AppSidebar.tsx              # Main navigation sidebar (749 lines)
│       │   ├── ContactSearchForm.tsx       # Search form component
│       │   ├── ScoutChatbot.tsx            # Scout AI chatbot
│       │   ├── ScoutSidePanel.tsx          # Scout side panel
│       │   ├── EmailTemplateModal.tsx      # Email template editor
│       │   ├── PersonalizedRecruitingTimeline.tsx # Recruiting timeline
│       │   ├── ProductTour.tsx             # Onboarding tour
│       │   ├── search/                     # Search components (PromptSearchFlow, etc.)
│       │   ├── gates/                      # Feature gates (FeatureGate, UpgradeModal, UsageMeter)
│       │   ├── resume/                     # Resume components (LibraryTab, ScoreFixTab, TailorTab)
│       │   └── ui/                         # shadcn/ui components (50 files)
│       │
│       ├── contexts/                       # React Context providers
│       │   ├── FirebaseAuthContext.tsx      # Auth state, user profile, credits, tier
│       │   ├── ScoutContext.tsx             # Scout AI panel state
│       │   └── TourContext.tsx              # Product tour state
│       │
│       ├── services/                       # API & data services
│       │   ├── api.ts                      # All backend API calls (61KB, ~52 endpoints)
│       │   ├── firebaseApi.ts              # Direct Firestore operations (27KB)
│       │   ├── resumeWorkshop.ts           # Resume API calls (17KB)
│       │   ├── coverLetterWorkshop.ts      # Cover letter API calls
│       │   ├── applicationLab.ts           # Application lab API calls
│       │   └── scoutConversations.ts       # Scout chat API
│       │
│       ├── hooks/                          # Custom React hooks
│       │   ├── useFeatureGate.ts           # Tier-based feature access checks
│       │   ├── useSubscription.ts          # Subscription state
│       │   ├── useNotifications.ts         # In-app notifications
│       │   ├── useScoutChat.ts             # Scout chatbot messaging
│       │   └── [6 more hooks...]
│       │
│       ├── lib/                            # Config & utilities
│       │   ├── firebase.ts                 # Firebase initialization
│       │   ├── analytics.ts                # PostHog event tracking
│       │   ├── constants.ts                # App-wide constants
│       │   └── utils.ts                    # Tailwind cn() helper
│       │
│       ├── types/                          # TypeScript types
│       │   ├── resume.ts                   # Resume data structures
│       │   ├── scout.ts                    # Scout AI types
│       │   └── timeline.ts                 # Recruiting timeline types
│       │
│       ├── utils/                          # Utility modules
│       │   ├── featureAccess.ts            # Tier-based feature checking
│       │   ├── activityLogger.ts           # Activity event logging
│       │   ├── pdfGenerator.tsx            # PDF generation
│       │   ├── resumePDFGenerator.tsx       # Resume PDF generation
│       │   └── [6 more utils...]
│       │
│       └── data/                           # Static data
│           ├── scout-knowledge.ts          # Scout AI knowledge base
│           ├── universities.ts             # University list/logos
│           └── videoTutorials.ts           # Tutorial metadata
│
└── chrome-extension/                       # Chrome Extension (Manifest V3)
    └── [built separately]
```

---

## Environment Variables

### Backend (`.env` at project root)

| Variable | Service | Required | Example |
|----------|---------|----------|---------|
| `PEOPLE_DATA_LABS_API_KEY` | PDL | Yes | `<your_pdl_api_key>` |
| `OPENAI_API_KEY` | OpenAI | Yes | `sk-proj-xxxxxxxxxxxx` |
| `STRIPE_SECRET_KEY` | Stripe | Yes | `sk_test_xxxxxxxxxxxx` |
| `STRIPE_PUBLISHABLE_KEY` | Stripe | Yes | `pk_test_xxxxxxxxxxxx` |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Yes | `whsec_xxxxxxxxxxxx` |
| `STRIPE_PRO_PRICE_ID` | Stripe | No | `price_xxxxxxxxxxxx` (defaults hardcoded) |
| `STRIPE_ELITE_PRICE_ID` | Stripe | No | `price_xxxxxxxxxxxx` (defaults hardcoded) |
| `GOOGLE_CLIENT_ID` | Gmail OAuth | Yes | `xxxxxxxxxxxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth | Yes | `GOCSPX-xxxxxxxxxxxx` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Firebase Admin | Yes (prod) | Path to service account JSON |
| `OAUTH_REDIRECT_URI` | Gmail OAuth | No | `http://localhost:5001/api/google/oauth/callback` (auto-detected) |
| `SERPAPI_KEY` | SerpAPI | Yes | `<your_serpapi_key>` |
| `HUNTER_API_KEY` | Hunter.io | Yes | `<your_hunter_api_key>` |
| `JINA_API_KEY` | Jina AI | No | `jina_xxxxxxxxxxxx` |
| `YOUTUBE_API_KEY` | YouTube Data | No | `<your_youtube_api_key>` |
| `SENTRY_DSN` | Sentry | No | `https://xxxx@xxxx.ingest.sentry.io/xxxx` |
| `FLASK_SECRET` | Flask | Yes (prod) | Random 32-char hex string |
| `FLASK_ENV` | Flask | No | `development` or `production` |
| `PROMPT_SEARCH_ENABLED` | Feature flag | No | `true` / `false` |
| `GOOGLE_CLOUD_PROJECT_ID` | Gmail Pub/Sub | No | `your-project-id` |
| `GMAIL_PUBSUB_TOPIC` | Gmail Pub/Sub | No | `projects/your-project/topics/gmail-notifications` |
| `GMAIL_WEBHOOK_SECRET` | Gmail Pub/Sub | No | Random 32-char string |

### Frontend (`connect-grow-hire/.env`)

| Variable | Service | Required | Example |
|----------|---------|----------|---------|
| `VITE_PUBLIC_POSTHOG_KEY` | PostHog | No | `phc_xxxxxxxxxxxx` |
| `VITE_PUBLIC_POSTHOG_HOST` | PostHog | No | `https://us.i.posthog.com` |
| `VITE_API_BASE_URL` | Backend URL | No | `http://localhost:5001` (for dev) |

---

## Local Development Setup

### Prerequisites
- Python 3.12+
- Node.js 18+
- Firebase service account JSON file
- API keys for: PDL, OpenAI, Stripe, Google OAuth, Hunter.io

### Backend Setup

```bash
# 1. Create and activate virtual environment
cd backend
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment variables
cp .env.example ../.env  # Edit with your API keys

# 4. Set Firebase credentials
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/offerloop-native-firebase-adminsdk.json

# 5. Run development server
python3 wsgi.py
# Server starts on http://localhost:5001
```

### Frontend Setup

```bash
# 1. Install dependencies
cd connect-grow-hire
npm install

# 2. Run development server
npm run dev
# Server starts on http://localhost:8080
```

### Stripe Webhook Testing (Local)

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:5001/api/billing/webhook
# Copy the webhook signing secret and set as STRIPE_WEBHOOK_SECRET
```

### Running Tests

```bash
cd backend
pytest tests/                    # All tests
pytest tests/ -k "test_name"    # Single test
pytest tests/ -m unit           # By marker
```

---

## Deployment

### Backend (Render)

The backend runs on Render as a web service:

```bash
# Build command
pip install -r backend/requirements.txt

# Start command
gunicorn backend.wsgi:app --bind 0.0.0.0:5001 --workers 4
```

The Flask app serves the built frontend SPA from `connect-grow-hire/dist/` and falls back to `index.html` for non-API 404s (SPA routing).

**Required environment variables on Render:** All backend env vars listed above, plus `FLASK_ENV=production`.

### Frontend (Firebase Hosting)

```bash
cd connect-grow-hire
npm run build                   # Builds to dist/
firebase deploy --only hosting  # Deploy to Firebase Hosting
```

The production frontend at `www.offerloop.ai` is served by Firebase Hosting. API calls go to the Render backend.

**Domain:** `www.offerloop.ai` (apex `offerloop.ai` redirects to `www` via Flask `before_request` hook).
