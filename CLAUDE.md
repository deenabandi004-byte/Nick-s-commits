# CLAUDE.md

Project briefing for developers and AI assistants working in this repository.

## What This Is

Offerloop is an AI-powered networking SaaS platform for college students recruiting for internships and full-time roles in consulting, investment banking, and tech. It helps students find professional contacts (via a 2.2B-contact database), generate personalized outreach emails, prepare for meetings and interviews, and track their networking pipeline.

**Target market**: College students at USC, UCLA, Michigan, NYU, Georgetown, UPenn, and similar schools breaking into consulting (MBB, Big 4), investment banking (Goldman, JPMorgan, Morgan Stanley), and tech (Google, Meta, Amazon).

**Business metrics**: 300+ active student users, 41 paying subscribers, 22% free-to-paid conversion, $0 CAC (organic growth).

---

## House Style (MUST FOLLOW)

These rules are absolute. They apply to all code, UI copy, comments, docs, blog content, AI prompts, and commit messages, whether written by a human or an AI assistant.

1. **No em dashes.** Never use the em dash character (Unicode U+2014). Use a comma, parentheses, a colon, or a spaced hyphen ` - ` instead. This includes generated content and the text of prompts sent to LLMs.
2. **No Sparkles / sparkle / ✨ icon.** Do not import or render the lucide `Sparkles` or `Sparkle` icon, and do not use the ✨ emoji in the UI. It reads as generic AI slop. Pick a concrete icon that names the actual function instead, for example `Lightbulb` for suggestions, `Bot` for the Scout assistant, `TrendingUp` for optimization, `FileText` for documents, `Target` for fit analysis.
3. **The feature is "Meeting Prep"** (formerly "Coffee Chat Prep"). Use "meeting", not "coffee chat", in all new copy and identifiers. The only exceptions are three legacy persisted identifiers documented under Known Fragile Areas.
4. **Color is a signal, not decoration.** The authenticated app interior is cool-slate neutral with brand blue `#3B82F6` as the single accent (primary actions, links, active and selected states); status colors (green / amber / red) carry meaning only. Do not add new accent hues, warm or navy greys, gradients on functional UI, or saturated card / panel fills. Prefer the canonical `--c-*` tokens defined in `connect-grow-hire/src/index.css` over raw hex. Marketing and landing pages are exempt and keep their existing palette and gradients. Run `scripts/check-app-colors.sh` to catch regressions.

---

## Repository Structure

**Three independent codebases** share this monorepo but have no build-time dependencies:

| Project | Stack | Dev port | Entry point |
|---------|-------|----------|-------------|
| `backend/` | Flask 3.0 + Gunicorn | 5001 | `backend/wsgi.py` |
| `connect-grow-hire/` | React 18 + Vite + TypeScript | 8080 | `connect-grow-hire/src/App.tsx` |
| `chrome-extension/` | Vanilla JS, Manifest V3 | n/a | `chrome-extension/manifest.json` |

**Deployed as one service on Render.** Gunicorn serves the Flask API and the Vite-built SPA from the same process. No Docker, no `render.yaml` -- config lives in the Render dashboard.

### Top-level directory map

```
Offerloop/
├── backend/                    # Flask API server
│   ├── wsgi.py                 # THE entry point (not app/__init__.py)
│   ├── app/
│   │   ├── routes/             # 36 Flask blueprints (thin controllers)
│   │   ├── services/           # 52 business logic modules (function-based, not classes)
│   │   ├── models/             # 5 data models (contact, user, enums, meeting_prep)
│   │   ├── utils/              # 16 utilities (exceptions, validation, retry, rate limiting)
│   │   ├── config.py           # All constants, tier configs, env vars, PDL metro areas
│   │   └── extensions.py       # Auth decorators, Firebase init, rate limiting, CORS
│   ├── tests/                  # 31 pytest files (backend only)
│   ├── scripts/                # reddit_scanner.py, Firestore migrations
│   └── requirements.txt        # Python dependencies
├── connect-grow-hire/          # React SPA frontend
│   ├── src/
│   │   ├── pages/              # 67 page components (app + SEO landing pages)
│   │   ├── components/         # 101+ components
│   │   │   ├── ui/             # 48 shadcn/ui primitives (Radix + Tailwind + CVA)
│   │   │   ├── demo/           # 6 unauthenticated preview components
│   │   │   ├── tracker/        # 4 network pipeline/Kanban components
│   │   │   ├── search/         # 3 natural language search components
│   │   │   ├── resume/         # 3 resume builder tabs
│   │   │   ├── gates/          # 3 feature gating components (FeatureGate, UpgradeModal, UsageMeter)
│   │   │   └── background/     # 2 animated backgrounds
│   │   ├── services/           # 6 API service modules (~4000 lines total)
│   │   ├── contexts/           # 3 React contexts (Auth, Scout, Tour)
│   │   ├── hooks/              # 10 custom hooks
│   │   ├── lib/                # 9 config/utility files (constants, firebase, analytics)
│   │   ├── utils/              # 11 helper functions (PDF gen, resume tools, activity logging)
│   │   ├── types/              # 3 TypeScript type files
│   │   ├── data/               # 8 static data files (companies, universities, industries)
│   │   └── content/blog/       # 18+ auto-generated markdown blog posts
│   ├── public/                 # robots.txt, llms.txt, sitemap.xml, favicon
│   ├── dist/                   # Vite build output (served by Flask in production)
│   ├── vite.config.ts          # Build config with manual chunk splitting
│   └── package.json            # npm dependencies
├── chrome-extension/           # Chrome extension (Manifest V3, v1.0.9)
│   ├── manifest.json           # Permissions: storage, activeTab, contextMenus, identity
│   ├── background.js           # Service worker (OAuth, message passing)
│   ├── content.js              # LinkedIn/job board injection (~3800 lines)
│   ├── popup.js + popup.html   # Two-tab UI (Contact mode / Job mode)
│   └── tests/                  # Extension tests
├── Safari-extension/           # Safari extension variant
├── .github/workflows/          # GitHub Actions (blog generation, Reddit scanner)
├── docs/                       # 36 architecture/feature markdown docs
├── scripts/                    # generate-blog-post.cjs (OpenAI GPT-4o)
├── firestore.rules             # Firestore security rules (user-scoped access)
├── storage.rules               # Cloud Storage rules (resumes, 10MB max)
├── render-build.sh             # Render.com build script
├── CLAUDE.md                   # This file
└── .env                        # Environment variables (gitignored)
```

---

## Quick Start

```bash
# Backend
cd backend && pip install -r requirements.txt
python3 wsgi.py                                  # http://localhost:5001

# Frontend (separate terminal)
cd connect-grow-hire && npm install
npm run dev                                      # http://localhost:8080

# Tests (backend only, no frontend tests exist)
cd backend && pytest tests/                      # all tests
cd backend && pytest tests/ -k "test_name"       # one test
cd backend && pytest tests/ -m unit              # by marker: unit, integration, slow

# List all registered routes (debug)
LIST_ROUTES=1 python backend/wsgi.py

# Production
gunicorn backend.wsgi:app --bind 0.0.0.0:5001 --workers 4
```

---

## Full Tech Stack

### Backend (Python 3.x)

Key packages: Flask 3.0, firebase-admin 6.4, openai 1.54, anthropic >=0.86 (fallback LLM), stripe 8.0, pydantic >=2.10. Full list in `backend/requirements.txt`.

### Frontend (TypeScript)

Key packages: React 18.2, Vite 5.0, firebase 10.7, @tanstack/react-query 5.89, tailwindcss 3.3, @stripe/stripe-js 7.9. Full list in `connect-grow-hire/package.json`.

---

## Architecture

```
Browser ──► React SPA (Vite build in connect-grow-hire/dist/)
              │
              │ Authorization: Bearer <firebase-id-token>
              ▼
           Flask API (/api/*)  ──► Firestore (offerloop-native)
              │                ──► OpenAI / Anthropic (AI generation)
              │                ──► People Data Labs (contact search)
              │                ──► Hunter.io (email verification)
              │                ──► Gmail API (drafts, thread sync, webhooks)
              │                ──► Stripe (subscriptions)
              │                ──► SerpAPI (job search, firm discovery)
              │                ──► Prerender.io (bot/crawler SSR)
              ▼
           Static files (/, /assets/*, /sitemap.xml, /robots.txt, /llms.txt)
           SPA fallback (404 → index.html for non-/api/ routes)

Chrome Extension ──► same Flask API at https://final-offerloop.onrender.com
```

**Canonical domain**: `https://offerloop.ai` (non-www). Prerender.io middleware in `wsgi.py` intercepts 40+ bot user agents and proxies to Prerender for SSR.

---

## Core Features

### 1. Contact Search (FIND)
**How it works**: User enters search criteria (company, title, location, university) → backend queries People Data Labs API (`pdl_client.py`, 3200+ lines) with ~50 metro area mappings → results filtered by tier limits (3/8/15 contacts) → optional Hunter.io email verification → results returned with LinkedIn, email, title, company, education.

**Key files**: `backend/app/services/pdl_client.py`, `backend/app/routes/runs.py`, `backend/app/routes/runs_hunter.py`, `connect-grow-hire/src/pages/FindPage.tsx`

### 2. Email Generation (REACH)
**How it works**: User selects contacts → OpenAI GPT-4 generates personalized emails using contact profile + user's resume + email templates → optionally creates Gmail drafts or returns compose links. Batch operations available for Pro/Elite.

**Key files**: `backend/app/services/reply_generation.py` (1500 lines), `backend/app/routes/emails.py`, `email_templates.py`

### 3. Network Tracker (TRACK)
**How it works**: Kanban-style pipeline with buckets (Needs Attention, Active, Done). Contacts move through stages. Gmail integration tracks sent emails, detects replies via push notifications (Pub/Sub webhooks). Real-time Firestore listeners update the frontend.

**Key files**: `backend/app/routes/outbox.py`, `backend/app/services/outbox_service.py`, `connect-grow-hire/src/pages/NetworkTracker.tsx`, `src/components/tracker/`

### 4. Meeting Prep
**How it works**: User selects a contact → background thread (`concurrent.futures`) researches the person (web scraping, company info, career trajectory) → AI generates a PDF prep document with talking points, questions to ask, and background research. Costs 15 credits. Runs async with job ID polling for status.

**Key files**: `backend/app/services/meeting.py` (714 lines), `backend/app/routes/meeting_prep.py`, `connect-grow-hire/src/pages/MeetingPrepPage.tsx`

### 5. Interview Prep
**How it works**: Multi-source content aggregation (Reddit, YouTube transcripts, Glassdoor, job postings) → AI personalizes prep based on user profile → generates PDF with behavioral/technical questions, company research, and strategy. Costs 25 credits.

**Key files**: `backend/app/services/interview_prep/` (8 submodules: content_aggregator, reddit_scraper, youtube_scraper, glassdoor_scraper, question_extractor, personalization, pdf_generator, job_posting_parser), `backend/app/routes/interview_prep.py`

### 6. Resume Workshop
**How it works**: Upload PDF/DOCX → parse with `resume_parser_v2.py` (layout preservation) → ATS scoring via `ats_scorer.py` → AI optimization suggestions via `resume_optimizer_v2.py` → PDF generation with `pdf_builder.py` (ReportLab/WeasyPrint).

**Key files**: `backend/app/services/resume_parser_v2.py`, `backend/app/services/resume_optimizer_v2.py`, `backend/app/services/ats_scorer.py`, `backend/app/routes/resume_workshop.py` (1900 lines)

### 7. Job Board
**How it works**: SerpAPI queries for job listings → job relevance ranking against user profile → resume matching scores → hiring manager/recruiter discovery via `recruiter_finder.py`.

**Key files**: `backend/app/routes/job_board.py` (8800+ lines -- the largest route file), `backend/app/services/recruiter_finder.py` (1325 lines), `backend/app/services/serp_client.py`

### 8. Firm Search
**How it works**: User searches for companies → SerpAPI + web scraping → firm details extraction (culture, recruiting info, alumni connections) → results with contact suggestions.

**Key files**: `backend/app/services/company_search.py` (1240 lines), `backend/app/services/firm_details_extraction.py` (1192 lines), `backend/app/routes/firm_search.py`

### 9. Scout AI Assistant
**How it works**: Conversational AI search assistant (Cmd+K to open). Multi-turn conversations stored in Firestore subcollection. Uses OpenAI with context from user profile and search history.

**Key files**: `backend/app/services/scout_service.py` (3400+ lines), `backend/app/services/scout_assistant_service.py` (1074 lines), `connect-grow-hire/src/contexts/ScoutContext.tsx`

### 10. Cover Letter Workshop
**How it works**: AI generates cover letters tailored to specific job postings using user's resume and target role context.

**Key files**: `backend/app/routes/cover_letter_workshop.py`, `connect-grow-hire/src/services/coverLetterWorkshop.ts`

### 11. Application Lab
**How it works**: Application tracking with status management, deadline tracking, and export functionality.

**Key files**: `backend/app/services/application_lab_service.py` (3082 lines), `backend/app/routes/application_lab.py`, `connect-grow-hire/src/services/applicationLab.ts`

### 12. Gmail Integration
**How it works**: 3-legged OAuth flow → credentials stored in Firestore at `users/{uid}/integrations/gmail` → drafts creation, thread sync, reply detection via Pub/Sub webhooks → watch renewal daemon thread runs every 6 days.

**Key files**: `backend/app/services/gmail_client.py` (1394 lines), `backend/app/routes/gmail_oauth.py`, `backend/app/routes/gmail_webhook.py`

### 13. Chrome Extension
**How it works**: Manifest V3 extension injects buttons on LinkedIn profiles and 8 job boards (Greenhouse, Lever, Workday, Indeed, Handshake, Glassdoor, ZipRecruiter, Wellfound). Scrapes profile/job data, calls backend API for email generation and contact lookup. Detects LinkedIn SPA navigation via `pushState`/`replaceState` interception.

**Key files**: `chrome-extension/content.js` (~3800 lines), `chrome-extension/popup.js` (~5200 lines), `chrome-extension/background.js`

---

## Auth System

**Firebase Authentication** with Google OAuth:

1. Frontend: `signInWithPopup(GoogleAuthProvider)` via Firebase SDK
2. Firebase ID token stored in `FirebaseAuthContext`, sent as `Authorization: Bearer <token>` on every API call
3. Backend: `@require_firebase_auth` decorator (in `extensions.py`) verifies token with 3 retries + exponential backoff, sets `request.firebase_user`
4. `@require_tier(['pro', 'elite'])` fetches tier from Firestore (never trusts the client), sets `request.user_tier`

**Decorator order matters**: `@require_tier` must appear before `@require_firebase_auth` in source code (decorators execute inside-out).

```python
# Correct:
@require_tier(['pro', 'elite'])
@require_firebase_auth
def premium_endpoint():
    uid = request.firebase_user['uid']
    tier = request.user_tier
```

**Gmail OAuth** is a separate 3-legged flow (`backend/app/routes/gmail_oauth.py`). Credentials stored per-user in Firestore at `users/{uid}/integrations/gmail`. Legacy routes `/api/gmail/*` forward to `/api/google/*`.

**Chrome extension auth**: Google OAuth2 via Chrome identity API → token exchanged with backend at `/api/auth/google-extension` → Firebase token stored in `chrome.storage.local`.

**Route guards** (frontend):
- `ProtectedRoute`: requires auth + completed onboarding, else redirects to `/signin` or `/onboarding`
- `PublicRoute`: redirects authenticated users to `/find`
- Special: `?signedOut=true` param prevents redirect loop on sign-out

---

## Tier & Credit System

Three tiers defined in `backend/app/config.py` (frontend mirror in `connect-grow-hire/src/lib/constants.ts` -- **keep these in sync**):

| | Free | Pro ($9.99/mo) | Elite ($34.99/mo) |
|---|---|---|---|
| Credits/month | 300 | 1500 | 3000 |
| Contacts/search | 3 | 8 | 15 |
| Batch size | 1 | 5 | 15 |
| Resume tools | No | Yes | Yes |
| Firm search | No | Yes | Yes |
| Meeting preps | 3 lifetime | 10/mo | Unlimited |
| Interview preps | 2 lifetime | 5/mo | Unlimited |
| Alumni searches | 10 | Unlimited | Unlimited |
| Smart filters | No | Yes | Yes |
| Bulk drafting | No | Yes | Yes |
| Export | No | Yes | Yes |
| Priority queue | No | No | Yes |
| Personalized templates | No | No | Yes |
| Weekly insights | No | No | Yes |

**Credit costs**: Meeting = 15, Interview prep = 25, Scout = 5.

Credits reset at calendar month boundary (not billing cycle). Atomic Firestore deduction prevents double-spend. Free tier has lifetime limits on some features; Pro/Elite reset monthly.

**Stripe Price IDs**: Pro = `price_1ScLXrERY2WrVHp1bYgdMAu4`, Elite = `price_1ScLcfERY2WrVHp1c5rcONJ3`. 30-day free trial.

**Known inconsistency**: Frontend `constants.ts` shows Free tier as 150 credits; backend `config.py` shows 300. Backend is source of truth.

---

## Database & Data Model

**Primary database**: Firestore (project `offerloop-native`). No SQL database for application data.

**User document** (`users/{uid}`):
- Profile: `email`, `name`, `professionalInfo`, `needsOnboarding`
- Billing: `subscriptionTier` (source of truth), `tier` (legacy fallback), `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`
- Credits: `credits`, `maxCredits`, `lastCreditReset`
- Usage counters: `alumniSearchesUsed`, `coffeeChatPrepsUsed`, `interviewPrepsUsed`

**Subcollections** under `users/{uid}/`:
- `contacts/` -- saved contacts with pipeline stages and Gmail tracking fields
- `integrations/gmail` -- OAuth tokens, watch expiration
- `calendar_events/` -- scheduled meetings
- `recruiters/` -- hiring manager tracker
- `scoutConversations/` -- Scout AI chat history
- `coffee-chat-preps/`, `interview-preps/` -- generated prep documents
- `resume_library/`, `resume_scores/`, `cover_letter_library/`
- `notifications/`, `activity/`, `searchHistory/`, `firmSearches/`, `exports/`, `goals/`

**Legacy**: `contacts.db` (SQLite) at repo root powers the contact directory feature (`backend/app/routes/contacts.py`, `ContactDirectory.tsx`). It's gitignored but must exist in production.

**Security rules** (`firestore.rules`): User-scoped access only. Clients cannot write `tier`, `subscriptionTier`, `stripeSubscriptionId`, `stripeCustomerId`, or `maxCredits`. Pro/Elite features gated by tier check in rules.

**Storage rules** (`storage.rules`): Resumes at `/resumes/{uid}/**`, max 10MB, PDF/images/DOC/DOCX only.

---

## Backend Structure

**`backend/wsgi.py`** is the only entry point. `app/__init__.py` is a package marker only.

`wsgi.py` does four things:
1. Registers 32+ Flask blueprints (all under `/api/`)
2. Sets up Prerender.io middleware (`@app.before_request`)
3. Serves static files from `connect-grow-hire/dist/` with SPA fallback
4. Starts Gmail watch renewal daemon thread (runs every 6 days)

### Blueprint registration

All 32+ blueprints registered in `create_app()` under `/api/`. Key ones:

| Blueprint | Prefix | Purpose |
|-----------|--------|---------|
| `billing_bp` | `/api` | Stripe checkout, webhooks, tier info |
| `runs_bp` | varies | Contact search runs |
| `emails_bp` | `/api/emails` | Email generation and drafts |
| `scout_bp` | `/api/scout` | AI job search assistant |
| `gmail_oauth_bp` | `/api/google` | Gmail OAuth start/callback |

**Critical ordering**: `linkedin_import_bp` must be registered before `contacts_bp` in `wsgi.py` (both use `/api/contacts` prefix).

**New blueprints must be registered in `wsgi.py`**. Debug with `LIST_ROUTES=1 python wsgi.py`.

### Code organization patterns

```python
# Standard route pattern
@bp.route('/api/something', methods=['POST'])
@require_firebase_auth
def do_something():
    uid = request.firebase_user['uid']
    db = get_db()
    data = request.get_json()
    # validate with Pydantic, call service, return jsonify(result)
```

- **Routes** (`app/routes/`): Thin Flask blueprints. Validate input, call services, return JSON.
- **Services** (`app/services/`): All business logic. Function-based modules, not classes.
- **Models** (`app/models/`): Data normalization and creation helpers.
- **Utils** (`app/utils/`): Cross-cutting concerns (exceptions, validation schemas, retry, rate limiting).
- `get_db()` from `extensions.py` returns the Firestore client singleton.
- Meeting prep runs in a background thread (`concurrent.futures`), returns job ID for polling.
- Rate limiting: 2000/day, 500/hour per user (ID if authed, else IP). Static assets and meeting status polling exempted.
- CORS: `offerloop.ai`, `www.offerloop.ai`, plus `CORS_ORIGINS` env var. Localhost origins in dev.

### Error handling

Custom exception hierarchy in `app/utils/exceptions.py`:
- `OfferloopException` (base) → `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `InsufficientCreditsError`, `ExternalAPIError`, `RateLimitError`
- All have `.to_response()` for JSON serialization
- Pydantic schemas in `app/utils/validation.py`: `ContactSearchRequest`, `FirmSearchRequest`, `MeetingPrepRequest`, `InterviewPrepRequest`

---

## Frontend Structure

### Key files

| File | What it does |
|------|-------------|
| `src/App.tsx` | All routes, context providers, lazy loading, Cmd+K shortcut for Scout |
| `src/contexts/FirebaseAuthContext.tsx` | Auth state, user profile, tier, credits, onboarding |
| `src/contexts/ScoutContext.tsx` | AI assistant sidebar state |
| `src/contexts/TourContext.tsx` | Product tour state and progress |
| `src/services/api.ts` | All backend API calls (~2000 lines) |
| `src/services/firebaseApi.ts` | Direct Firestore reads/writes (~900 lines) |
| `src/services/resumeWorkshop.ts` | Resume builder service (~675 lines) |
| `src/services/applicationLab.ts` | Application tracking (~349 lines) |
| `src/services/scoutConversations.ts` | Scout chat history (~311 lines) |
| `src/services/coverLetterWorkshop.ts` | Cover letter service (~213 lines) |
| `src/lib/constants.ts` | Tier configs, credit costs, feature limits |
| `src/lib/firebase.ts` | Firebase SDK init (hardcoded fallbacks for dev) |
| `src/lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) |
| `src/lib/analytics.ts` | PostHog event tracking |

### Routing

**Public pages**: `/`, `/signin`, `/blog`, `/blog/:slug`, `/about`, `/privacy`, `/terms-of-service`, `/compare/*`, plus 40+ SEO template routes (`/networking/:slug`, `/alumni/:slug`, `/cold-email/:slug`, etc.)

**Protected pages** (require auth + onboarding):
- `/find` -- Main search hub (tabs: People, Companies, Hiring Managers). Default landing for authenticated users.
- `/tracker` -- Network pipeline (Kanban-style buckets: Needs Attention, Active, Done)
- `/meeting-prep`, `/interview-prep` -- AI generation with stepped progress bars
- `/meeting-library` -- Library of past meeting preps
- `/job-board` -- Job listings with resume matching
- `/contact-directory` -- Saved contacts library
- `/write/resume`, `/write/resume-library` -- Resume builder and library
- `/write/cover-letter`, `/write/cover-letter-library` -- Cover letter builder
- `/application-lab` -- Application tracking
- `/hiring-manager-tracker` -- Hiring manager tracking
- `/company-tracker` -- Company tracking Kanban
- `/calendar` -- Event scheduling
- `/email-templates` -- Email template management
- `/account-settings` -- Profile, subscription, resume upload
- `/pricing` -- Pricing page
- `/documentation` -- Help docs
- `/onboarding` -- Multi-step first-time setup (welcome, profile, academics, location, goals)

**Redirects**: `/dashboard` `/home` `/contact-search` → `/find`. `/outbox` → `/tracker`. `/firm-search` → `/find?tab=companies`. `/recruiter-spreadsheet` → `/find?tab=hiring-managers`. `/scout` opens Scout panel then redirects to `/find`.

### Component patterns

- **UI primitives**: shadcn/ui in `src/components/ui/` (48 files). Built on Radix, styled with Tailwind + CVA. Use `cn()` for class merging.
- **Layout**: `SidebarProvider` > `AppSidebar` + `MainContentWrapper` > `AppHeader` + content
- **Feature gates**: `FeatureGate` component checks tier. `UpgradeModal` shows upgrade path. `LockedFeatureOverlay` for paywall. `ProGate` and `EliteGateModal` for specific tiers.
- **Demo placeholders**: `src/components/demo/` -- preview components for unauthenticated users (6 files)
- **Loading**: `LoadingSkeleton` for content, `SteppedLoadingBar` for multi-step processes, `JobBoardSkeleton` for job board

### State management

- **React Query** for server state. Config: 5min stale, 10min cache, no refetch on window focus, 1 retry.
- **Context API** for auth (`FirebaseAuthContext`), Scout panel (`ScoutContext`), product tours (`TourContext`)
- **Firestore real-time listeners** for contacts, calendar events, notifications
- **No Redux, no Zustand.**

### Key hooks

| Hook | Purpose |
|------|---------|
| `useSubscription()` | Tier, credits, usage counts. Refetches every 30s |
| `useFeatureGate(feature)` | Checks tier access, server-side verified |
| `useNotifications()` | Real-time Firestore listener for outbox reply notifications |

Other hooks: `useScoutChat`, `useAutocomplete`, `useFirebaseMigration`, `useDebounce`, `useMobile`, `useOutsideClick`.

### Build configuration

**Vite chunk splitting** (`vite.config.ts`): `vendor-react`, `vendor-firebase`, `vendor-utils`, `vendor-animations`, `vendor-dates`, `vendor-stripe`.

**Any new React-dependent npm package must be added to the `vendor-react` chunk** in `vite.config.ts` or you'll get "Cannot access before initialization" errors at runtime.

Additional Vite config:
- `preserveEntrySignatures: false` -- prevents initialization errors
- `hoistTransitiveImports: false` -- maintains proper initialization order
- `constBindings: true`
- React deduplication enabled
- No sourcemaps in production
- Dev server: port 8080, HMR support for ngrok

TypeScript strict mode: `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.

Path alias: `@` maps to `./src`.

---

## Environment Variables

**Backend** (root `.env`):
- `OPENAI_API_KEY` -- Primary AI provider (GPT-4)
- `CLAUDE_API_KEY` -- Fallback AI provider (Anthropic Claude)
- `PEOPLE_DATA_LABS_API_KEY` -- Contact search (2.2B contacts)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` -- Payments
- `STRIPE_PRO_PRICE_ID`, `STRIPE_ELITE_PRICE_ID` -- Stripe price overrides (defaults hardcoded)
- `SERPAPI_KEY` -- Job/firm search
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` -- Gmail OAuth
- `GOOGLE_APPLICATION_CREDENTIALS` -- Path to Firebase service account JSON
- `GOOGLE_SERVICE_ACCOUNT_FILE`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` -- Service account config
- `GOOGLE_CLOUD_PROJECT_ID` -- GCP project (default: `offerloop-native`)
- `GMAIL_PUBSUB_TOPIC` -- Pub/Sub topic for Gmail webhooks
- `GMAIL_WEBHOOK_SECRET` -- Pub/Sub webhook verification
- `JINA_API_KEY` -- Web content extraction
- `PRERENDER_TOKEN` -- SSR for bots (default hardcoded in wsgi.py)
- `PROMPT_SEARCH_ENABLED` -- Experimental natural language search (default: false)
- `CREATE_GMAIL_DRAFTS` -- Create actual Gmail drafts vs compose links (default: false)
- `FLASK_SECRET` -- Flask secret key (default: "dev")
- `FLASK_ENV` -- Environment detection (production / testing / development)
- `RENDER` -- Set automatically on Render platform
- `OAUTH_REDIRECT_URI` -- Override OAuth redirect URI
- `CORS_ORIGINS` -- Additional CORS origins

**Frontend** (`connect-grow-hire/.env.production`):
- `VITE_API_BASE_URL=https://offerloop.ai/api`
- Firebase config has hardcoded fallbacks in `src/lib/firebase.ts`

---

## Testing

**Backend only** -- the frontend has no test framework.

```bash
cd backend
pytest tests/                        # all tests
pytest tests/ -k "test_name"         # specific test
pytest tests/ -m unit                # by marker: unit, integration, slow
pytest tests/ --cov=app              # with coverage
```

**31 test files** covering:
- Email generation, meeting, interview prep, resume workshop
- Contact import, firm search, job board, outbox
- Credit system (credit reset audit, meeting audit)
- Validation (Pydantic schemas), exceptions
- Content aggregation, scraping (Reddit, YouTube, Glassdoor)
- PDF patching, search pipeline, recruiter email generation

**Fixtures** in `conftest.py`: `mock_firebase_user`, `mock_db`, `app`, `client`, `authenticated_request`.

Set `FLASK_ENV=testing` for test runs. Markers: `unit`, `integration`, `slow`.

---

## Deployment

**Platform**: Render. Single service, no Docker.

**Build** (`render-build.sh`):
1. `cd connect-grow-hire && npm ci && npm run build` (produces `dist/`)
2. `pip install -r backend/requirements.txt`
3. Falls back to bun if npm unavailable

**Runtime**: `gunicorn backend.wsgi:app --bind 0.0.0.0:5001 --workers 4`

**Static serving** (in `wsgi.py`):
- Flask `static_folder` = `connect-grow-hire/dist`
- `/assets/*` -- 1-year immutable cache
- `/sitemap.xml`, `/robots.txt`, `/llms.txt` -- explicit routes with correct MIME types
- 404 -- serves `index.html` for non-`/api/` routes (SPA routing)
- `/api/*` 404s return proper error JSON

**Background processes**:
- Gmail watch renewal: daemon thread in `wsgi.py`, every 6 days. Iterates all users with Gmail integration, renews watches expiring within 24h. Will silently die on unhandled exception.
- Reddit scanner: GitHub Actions cron every 30 min (`backend/scripts/reddit_scanner.py` → Telegram notification)
- Blog generation: GitHub Actions every Friday 9am UTC (`scripts/generate-blog-post.cjs` → OpenAI GPT-4o → markdown in `src/content/blog/` → git commit to main)

---

## SEO & Crawler Setup

- `robots.txt`: Allows all major search engines and AI crawlers (GPTBot, ClaudeBot, PerplexityBot). Blocks `/api`, `/auth`, `/dashboard`, `/tracker`, `/settings`.
- `llms.txt`: Structured product description for AI crawlers with features, pricing, competitive differentiators.
- `sitemap.xml`: ~1492 URLs.
- Prerender.io middleware in `wsgi.py` intercepts 40+ bot user agents for SSR. Only GET requests to non-API, non-asset, non-file-extension routes.

---

## Known Fragile Areas & Technical Debt

### Critical pitfalls

1. **`wsgi.py` is the entry point, not `app/__init__.py`.** The latter is just a package marker. New blueprints, middleware, and background tasks go in `wsgi.py`.

2. **Vite chunk splitting is fragile.** Any new npm package that imports React must be added to the `vendor-react` manual chunk in `vite.config.ts`. Failure produces cryptic "Cannot access before initialization" errors at runtime, not build time.

3. **Tier constants exist in two places.** `backend/app/config.py` and `connect-grow-hire/src/lib/constants.ts`. If you change limits, pricing, or feature flags, update both. Currently out of sync on Free tier credits (backend: 300, frontend: 150).

4. **Gmail watch renewal is a daemon thread.** If it throws an unhandled exception, it dies silently. Check logs if Gmail push notifications stop working.

5. **`linkedin_import_bp` must be registered before `contacts_bp`** in `wsgi.py` to avoid route conflicts (both use `/api/contacts` prefix).

6. **`contacts.db`** (SQLite) is gitignored but required in production for the contact directory feature.

7. **`subscriptionTier` is the source-of-truth field** for user tier in Firestore. `tier` is a legacy fallback. The backend always reads from Firestore, never trusts client-sent tier data.

8. **OAuth redirect URI auto-detects** based on `FLASK_ENV` / `RENDER` env var. prod = `https://offerloop.ai/api/google/oauth/callback`, dev = `http://localhost:5001/api/google/oauth/callback`.

9. **The frontend has no test framework.** All tests are backend pytest only.

10. **Blog posts are auto-generated.** The weekly GitHub Action commits directly to `main`. Posts are markdown with YAML frontmatter in `connect-grow-hire/src/content/blog/`.

11. **Meeting Prep keeps three legacy `coffee_chat` persisted identifiers.** The feature was rebranded "Coffee Chat Prep" to "Meeting Prep" across all code and UI, but three names still address live data and must NOT be renamed in code without a data migration: the Firestore subcollection `users/{uid}/coffee-chat-preps`, the Cloud Storage path prefix `coffee_chat_preps/`, and the user-doc usage field `coffeeChatPrepsUsed`. A migration script is at `backend/scripts/migrate_coffee_chat_to_meeting.py`; after it runs against production, those three can be flipped to `meeting` names. The pre-rebrand API route `/api/coffee-chat-prep` is kept alive as a registered alias in `wsgi.py` for deployed extension installs.

### Technical debt

- **`job_board.py` is 8,800+ lines** -- the largest single route file. Should be broken into smaller modules.
- **`scout_service.py` is 3,400+ lines** -- another oversized service file.
- **Legacy `tier` field** still exists alongside `subscriptionTier` in Firestore. Should be migrated.
- **No frontend tests** -- entire test coverage is backend-only.
- **`contacts.db` SQLite dependency** -- legacy file that must exist in production but isn't in git.
- **Untracked new files** in working tree: `bright_data_client.py` -- appears to be in-progress work.
- **Duplicate onboarding location references** -- `OnboardingLocationPreferences.tsx` page exists alongside the multi-step `OnboardingFlow.tsx`.

---

## Current Work in Progress

Based on git status and recent commits:
- **Onboarding redesign**: 5-step flow (welcome, profile, academics, location, goals) with new illustrations
- **Recruiter spreadsheets**: New hiring manager/recruiter data views
- **Contact enrichment**: New `bright_data_client.py` being developed
- **Frontend build**: Updated dist assets indicate recent frontend changes across many components

---

## External Service Reference

| Service | Purpose | Config |
|---------|---------|--------|
| Firebase (offerloop-native) | Auth, Firestore, Cloud Storage | `backend/app/extensions.py`, `src/lib/firebase.ts` |
| OpenAI (GPT-4) | Email gen, resume optimization, scout, interview/meeting prep | `backend/app/services/openai_client.py` |
| Anthropic (Claude) | Fallback LLM | `backend/app/services/openai_client.py` |
| People Data Labs | Contact search (2.2B contacts), enrichment | `backend/app/services/pdl_client.py` |
| Hunter.io | Email discovery, verification | `backend/app/services/hunter.py` |
| Stripe | Subscriptions (Pro $9.99/mo, Elite $34.99/mo) | `backend/app/services/stripe_client.py`, `backend/app/routes/billing.py` |
| Gmail API | OAuth, drafts, thread sync, push via Pub/Sub | `backend/app/services/gmail_client.py`, `backend/app/routes/gmail_oauth.py` |
| SerpAPI | Google Search, Google Jobs, firm discovery | `backend/app/services/serp_client.py` |
| Prerender.io | SSR for bot crawlers (40+ user agents) | `backend/wsgi.py` middleware |
| PostHog | Frontend analytics | `connect-grow-hire/src/lib/posthog.ts` |
| Sentry | Backend error tracking (dev only) | `backend/app/utils/sentry_config.py` |
| Google Cloud Pub/Sub | Gmail webhook notifications | `backend/app/routes/gmail_webhook.py` |
| Jina Reader | Web content extraction | Referenced in `backend/app/config.py` |
| Bright Data | Web scraping (in development) | `backend/app/services/bright_data_client.py` |

---

## GStack Tools

This project has access to GStack browser tools and Claude Code skills for development workflows:

### Available Skills (invoke with `/skill-name`)

| Skill | When to use |
|-------|-------------|
| `/browse` | Fast headless browser for QA testing, site dogfooding, navigating URLs, verifying deployments |
| `/gstack` | Same as browse -- headless browser for QA and testing |
| `/qa` | Systematically QA test the app and fix bugs found |
| `/qa-only` | QA testing that reports bugs without fixing |
| `/ship` | Ship workflow: tests, review, changelog, PR creation |
| `/review` | Pre-landing PR review for structural issues |
| `/land-and-deploy` | Merge PR, wait for CI, verify production health |
| `/investigate` | Systematic debugging with root cause analysis |
| `/design-review` | Visual QA: finds spacing, hierarchy, and consistency issues |
| `/design-shotgun` | Generate multiple design variants for comparison |
| `/design-consultation` | Design system creation (aesthetic, typography, color) |
| `/design-html` | Generate production-quality HTML/CSS |
| `/health` | Code quality dashboard with composite score |
| `/benchmark` | Performance regression detection |
| `/canary` | Post-deploy monitoring for errors and regressions |
| `/cso` | Security audit (secrets, dependencies, CI/CD, OWASP) |
| `/codex` | OpenAI Codex second opinion (review, challenge, consult) |
| `/plan-ceo-review` | CEO/founder plan review (scope expansion/reduction) |
| `/plan-eng-review` | Engineering architecture review |
| `/plan-design-review` | Designer's eye plan review |
| `/plan-devex-review` | Developer experience audit |
| `/autoplan` | Auto-run all plan reviews sequentially |
| `/retro` | Weekly engineering retrospective |
| `/office-hours` | YC-style brainstorming and idea validation |
| `/checkpoint` | Save/resume working state across sessions |
| `/freeze` | Restrict file edits to a specific directory |
| `/guard` | Full safety mode (destructive warnings + edit restrictions) |
| `/careful` | Warn before destructive commands |
| `/learn` | Manage project learnings across sessions |
| `/setup-deploy` | Configure deployment settings |
| `/setup-browser-cookies` | Import cookies for authenticated QA testing |
| `/open-gstack-browser` | Launch visible AI-controlled Chromium |

### Using `/browse` for QA

The `/browse` skill launches a headless Chromium browser (~100ms per command) for:
- Navigating to any URL and verifying page content
- Clicking elements, filling forms, testing user flows
- Taking screenshots for visual verification
- Testing responsive layouts
- Checking for console errors
- Verifying deployments

Use `/browse` whenever you need to verify that a change works end-to-end in the browser, dogfood a feature, or capture evidence of a bug.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
