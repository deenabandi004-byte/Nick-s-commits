# CLAUDE.md

Project briefing for developers and AI assistants working in this repository.

## What This Is

Offerloop is an AI-powered networking SaaS platform for college students recruiting for internships and full-time roles in consulting, investment banking, and tech. It helps students find professional contacts (via a 2.2B-contact database), generate personalized outreach emails, prepare for coffee chats and interviews, and track their networking pipeline.

**Target market**: College students at USC, UCLA, Michigan, NYU, Georgetown, UPenn, and similar schools breaking into consulting (MBB, Big 4), investment banking (Goldman, JPMorgan, Morgan Stanley), and tech (Google, Meta, Amazon).

**Business metrics**: 300+ active student users, 41 paying subscribers, 22% free-to-paid conversion, $0 CAC (organic growth).

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
│   │   ├── models/             # 5 data models (contact, user, enums, coffee_chat_prep)
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
│   │   │   ├── gates/          # 2 feature gating components (FeatureGate, UpgradeModal) — UsageMeter was orphan, removed
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
              │                ──► Perplexity (live search: jobs, companies, news, market context)
              │                ──► Firecrawl (web extraction: job postings, company profiles — non-LinkedIn)
              │                ──► Apify (LinkedIn profiles, posts, jobs, company pages — single LinkedIn vendor)
              │                ──► SerpAPI / Jina Reader (legacy fallbacks, off by default)
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

### 4. Coffee Chat Prep
**How it works**: User selects a contact → background thread (`concurrent.futures`) researches the person (web scraping, company info, career trajectory) → AI generates a PDF prep document with talking points, questions to ask, and background research. Costs 15 credits. Runs async with job ID polling for status.

**Key files**: `backend/app/services/coffee_chat.py` (714 lines), `backend/app/routes/coffee_chat_prep.py`, `connect-grow-hire/src/pages/CoffeeChatPrepPage.tsx`

### 5. Job Board
**How it works**: Job search routes through the `fetch_jobs` wrapper (`job_board.py:453`) — Perplexity `search_jobs_live` primary, SerpAPI fallback gated by `ENABLE_SERPAPI_FALLBACK`. Migration in progress: some legacy call sites still invoke `fetch_jobs_from_serpapi` directly. Results are ranked against the user profile, scored against the user's resume, and combined with hiring-manager/recruiter discovery via `recruiter_finder.py`.

**Key files**: `backend/app/routes/job_board.py` (8800+ lines -- the largest route file), `backend/app/services/recruiter_finder.py` (1325 lines), `backend/app/services/perplexity_client.py`, `backend/app/services/serp_client.py` (legacy fallback)

### 6. Firm Search
**How it works**: User searches for companies → Perplexity `pro_search` for discovery + Firecrawl `extract_company_profile` for structured detail extraction (culture, recruiting info, alumni connections) → results with contact suggestions. SerpAPI fallback in `firm_details_extraction.py` is gated by `ENABLE_SERPAPI_FALLBACK` (off by default).

**Key files**: `backend/app/services/company_search.py` (1240 lines), `backend/app/services/firm_details_extraction.py` (1192 lines), `backend/app/routes/firm_search.py`, `backend/app/services/perplexity_client.py`, `backend/app/services/firecrawl_client.py`

### 7. Scout AI Assistant
**How it works**: Conversational AI assistant in a side panel (Cmd+K or top-right Scout button to open). Multi-turn conversations stored in Firestore. Backend: `services/scout_assistant_service.py` (~2,700 lines) + `services/scout/` package (cache, chat_persistence, metrics, page_registry, router, strategy, tools, workflow_state).

**Key files**: `backend/app/services/scout_assistant_service.py`, `backend/app/services/scout/`, `connect-grow-hire/src/components/ScoutSidePanel.tsx`, `connect-grow-hire/src/contexts/ScoutContext.tsx`

### 8. Gmail Integration
**How it works**: 3-legged OAuth flow → credentials stored in Firestore at `users/{uid}/integrations/gmail` → drafts creation, thread sync, reply detection via Pub/Sub webhooks → watch renewal daemon thread runs every 6 days.

**Key files**: `backend/app/services/gmail_client.py` (1394 lines), `backend/app/routes/gmail_oauth.py`, `backend/app/routes/gmail_webhook.py`

### 9. Chrome Extension
**How it works**: Manifest V3 extension injects buttons on LinkedIn profiles and 8 job boards (Greenhouse, Lever, Workday, Indeed, Handshake, Glassdoor, ZipRecruiter, Wellfound). Scrapes profile/job data, calls backend API for email generation and contact lookup. Detects LinkedIn SPA navigation via `pushState`/`replaceState` interception.

**Key files**: `chrome-extension/content.js` (~3800 lines), `chrome-extension/popup.js` (~5200 lines), `chrome-extension/background.js`

**Job tab "Generate Cover Letter" survived the 2026-05-26 website cleanup intentionally** — the website's Cover Letter Workshop was killed but the extension keeps `/api/job-board/generate-cover-letter` + `/api/job-board/cover-letter-pdf` as a job-board-only utility. Don't delete those routes or the popup.html button without checking with Sid.

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
| Credits/month | 500 | 3000 | 12000 |
| Contacts/search | 3 | 8 | 15 |
| Batch size | 3 | 8 | 15 |
| Firm search | No | Yes | Yes |
| Coffee chat preps | 3 lifetime | 10/mo | Unlimited |
| Alumni searches | 10 | Unlimited | Unlimited |
| Smart filters | No | Yes | Yes |
| Bulk drafting | No | Yes | Yes |
| Export | No | Yes | Yes |
| Priority queue | No | No | Yes |
| Personalized templates | No | No | Yes |
| Weekly insights | No | No | Yes |

**Credit costs**: Coffee chat = 15, Scout = 5.

Credits reset at calendar month boundary (not billing cycle). Atomic Firestore deduction prevents double-spend. Free tier has lifetime limits on some features; Pro/Elite reset monthly.

**Stripe Price IDs**: Pro = `price_1ScLXrERY2WrVHp1bYgdMAu4`, Elite = `price_1ScLcfERY2WrVHp1c5rcONJ3`. 30-day free trial.

**KNOWN PRICING ISSUE**: `Pricing.tsx` displays Pro at $14.99/mo but `STRIPE_PRO_PRICE_ID` still charges $9.99. Create new Stripe Price at $14.99 + rotate constant, or revert displayed price.

**TODO**: Annual price IDs (`VITE_STRIPE_PRO_ANNUAL_PRICE_ID`, `VITE_STRIPE_ELITE_ANNUAL_PRICE_ID`) aren't set yet — annual CTA falls back to monthly checkout.

**TODO**: `isStudent` field is read by `Pricing.tsx:152` via `(user as any).isStudent` but not yet populated during onboarding when a .edu email is verified.

---

## Database & Data Model

**Primary database**: Firestore (project `offerloop-native`). No SQL database for application data.

**User document** (`users/{uid}`):
- Profile: `email`, `name`, `professionalInfo`, `needsOnboarding`
- Billing: `subscriptionTier` (source of truth), `tier` (legacy fallback), `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`
- Credits: `credits`, `maxCredits`, `lastCreditReset`
- Usage counters: `alumniSearchesUsed`, `coffeeChatPrepsUsed`

**Subcollections** under `users/{uid}/`:
- `contacts/` -- saved contacts with pipeline stages and Gmail tracking fields (My Network reads these)
- `integrations/gmail` -- OAuth tokens, watch expiration
- `calendar_events/` -- legacy: scheduled meetings (Calendar page killed 2026-05-26; Dashboard still displays events inline)
- `recruiters/` -- hiring manager pipeline (Find tab `/find?tab=hiring-managers` reads these)
- `manual_firms/` -- user-added companies (added by Nick's My Network redesign)
- `scoutConversations/` -- Scout AI chat history
- `coffee-chat-preps/` -- generated coffee chat prep documents
- `scoutChats/`, `messages/` -- Scout assistant chat persistence (TTL on `expires_at`)
- `notifications/`, `activity/`, `searchHistory/`, `firmSearches/`, `exports/`, `goals/`
- `referrals/` -- per-referred-user dedupe docs for the referral program (one doc per person who signed up via this user's code)

Top-level collection (not under `users/`):
- `referralCodes/{code}` -- referral code → owner uid lookup (backend admin SDK only; clients denied by rules)

Note: `interview-preps/`, `resume_library/`, `resume_scores/`, `cover_letter_library/`, `application_lab/` (or similar) Firestore subcollections may still hold legacy data for users who used those features before the 2026-05-26 cleanup. No live code reads/writes them now — safe to leave the data in production.

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
- Coffee chat prep runs in a background thread (`concurrent.futures`), returns job ID for polling.
- Rate limiting: 2000/day, 500/hour per user (ID if authed, else IP). Static assets and coffee chat status polling exempted.
- CORS: `offerloop.ai`, `www.offerloop.ai`, plus `CORS_ORIGINS` env var. Localhost origins in dev.

### Error handling

Custom exception hierarchy in `app/utils/exceptions.py`:
- `OfferloopException` (base) → `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `InsufficientCreditsError`, `ExternalAPIError`, `RateLimitError`
- All have `.to_response()` for JSON serialization
- Pydantic schemas in `app/utils/validation.py`: `ContactSearchRequest`, `FirmSearchRequest`, `CoffeeChatPrepRequest`, `InterviewPrepRequest`

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

**Sidebar (post-2026-05-26 Nick redesign + cleanup) — 7 main + 2 utility + 5 dropdown + Scout side panel = 14 user-reachable routes:**
- `/dashboard` -- **Home** (Nick's 1030-line personalized home page)
- `/agent` -- **Loops** (multi-Loop fleet view via LoopsPage)
- `/find` -- Find (People / Companies / Hiring Managers tabs; embeds ContactSearchPage, FirmSearchPage, RecruiterSpreadsheetPage as tab content)
- `/my-network` -- My Network (auto-redirects to `/my-network/people`)
- `/coffee-chat-prep` -- **Meeting Prep** (label-only rename; route + backend keep "coffee_chat" naming). Has internal "Coffee Library" tab + header "View Library" button → `/coffee-chat-library`
- `/tracker` -- Network pipeline
- `/job-board` -- Job listings with resume matching
- `/pricing`, `/documentation` (utility nav)
- `/account-settings`, `/about`, `/contact-us`, `/privacy`, `/terms-of-service` (user dropdown)
- **Scout side panel** — top-right button or Cmd+K; opens `ScoutSidePanel.tsx`, not a route

**Other live routes** (not in sidebar but reachable via deep-link / cross-page):
- `/coffee-chat-library` -- Library of past coffee chat preps (button in Meeting Prep header)
- `/agent/setup`, `/agent/:loopId` -- Agent flow
- `/email-templates` (`/find/templates`) -- Email template management
- `/onboarding`, `/onboarding/*` -- First-time setup
- `/dev/onboarding-preview`, `/dev/profile-preview` -- Designer preview routes

**Redirects** (gracefully forward old/bookmarked URLs):
- `/home`, `/contact-search` → `/find`
- `/firm-search`, `/company-tracker` → `/find?tab=companies`
- `/recruiter-spreadsheet`, `/hiring-manager-tracker` → `/find?tab=hiring-managers`
- `/outbox` → `/tracker`
- `/contact-directory` → `/my-network/people` (Contact Directory page killed; My Network reads same data)
- `/contact` → `/contact-us`
- `/privacy-policy` → `/privacy`, `/terms` → `/terms-of-service`
- `/scout` opens panel then redirects to `/find`

**Killed in 2026-05-26 cleanup (do not reference)**: `/interview-prep`, `/application-lab`, `/write/resume*`, `/write/cover-letter*`, `/my-resume`, `/calendar`, `/profile` (sidebar-link removed), `/agent/legacy`, `/terms-of-service-settings`. See git log for details.

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
- `STRIPE_REFERRAL_REWARD_COUPON_ID` -- 100%-off-once coupon applied when an already-paying user claims the referral reward (free users get a 30-day Elite trial checkout instead)
- `PERPLEXITY_API_KEY` -- Live search (jobs, companies, news, market context) — primary search provider
- `FIRECRAWL_API_KEY` -- Structured web extraction (job postings, company profiles) — primary scraping provider for **non-LinkedIn** URLs. As of 2026-06-18 every linkedin.com URL is auto-routed to Apify by `firecrawl_client._is_linkedin_url`.
- `APIFY_API_KEY` -- Single LinkedIn vendor (profiles, posts, jobs, company pages). Actor IDs are overridable per surface via `APIFY_USER_PROFILE_ACTOR_ID`, `APIFY_LINKEDIN_JOB_ACTOR_ID`, `APIFY_LINKEDIN_COMPANY_ACTOR_ID`.
- `BRIGHTDATA_API_KEY` -- DEPRECATED 2026-06-18. No longer load-bearing; Apify replaced Bright Data on every LinkedIn path. Safe to leave set during the next revision in case a fast revert is needed; will be removed in the follow-up cleanup.
- `SERPAPI_KEY` -- LEGACY. Used only when `ENABLE_SERPAPI_FALLBACK=1`. Kept as emergency fallback in `coffee_chat.py`, `firm_details_extraction.py`, `agent_actions.py`, and `job_board.py` (the latter migration in progress — direct `fetch_jobs_from_serpapi` callers still bypass the gate). Note: scout_service.py was deleted 2026-05-26 as part of Application Lab cleanup.
- `JINA_API_KEY` -- DEPRECATED 2026-06-18 alongside Bright Data. No longer reachable from the enrichment chain even with `ENABLE_JINA_FALLBACK=1` (Apify replaced both); flag will be removed in the follow-up cleanup.
- `ENABLE_SERPAPI_FALLBACK` -- Set to `1` to re-enable the SerpAPI fallback path during a Perplexity incident. Off by default.
- `ENABLE_JINA_FALLBACK` -- Set to `1` to re-enable the Jina Reader fallback path during a Firecrawl incident. Off by default.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` -- Gmail OAuth
- `GOOGLE_APPLICATION_CREDENTIALS` -- Path to Firebase service account JSON
- `GOOGLE_SERVICE_ACCOUNT_FILE`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` -- Service account config
- `GOOGLE_CLOUD_PROJECT_ID` -- GCP project (default: `offerloop-native`)
- `GMAIL_PUBSUB_TOPIC` -- Pub/Sub topic for Gmail webhooks
- `GMAIL_WEBHOOK_SECRET` -- Pub/Sub webhook verification
- `PRERENDER_TOKEN` -- SSR for bots (default hardcoded in wsgi.py)
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

**Test files** covering:
- Email generation, coffee chat
- Contact import, firm search, job board, outbox, hiring manager
- Credit system (credit reset audit, coffee chat audit)
- Validation (Pydantic schemas), exceptions
- Scout assistant (cutover, cache, chat persistence, metrics, router, strategy, workflow state)
- Search pipeline, recruiter email generation
- Several Interview Prep / Resume Workshop / Application Lab test files were removed in the 2026-05-26 cleanup along with their feature code.

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

### Technical debt

- **`job_board.py` is 8,800+ lines** -- the largest single route file. Should be broken into smaller modules.
- **Legacy `tier` field** still exists alongside `subscriptionTier` in Firestore. Should be migrated.
- **No frontend tests** -- entire test coverage is backend-only.
- **Search/scraping migration partially complete** -- `coffee_chat.py`, `firm_details_extraction.py`, `linkedin_enrichment.py`, and `agent_actions.py` are on Perplexity + Firecrawl with SerpAPI/Jina gated by env-var flags. `job_board.py` still has direct `fetch_jobs_from_serpapi` call sites that bypass the new `fetch_jobs` wrapper -- migration in progress.
- **Duplicate onboarding location references** -- `OnboardingLocationPreferences.tsx` page exists alongside the multi-step `OnboardingFlow.tsx`.

---

## Current Work in Progress

Based on git status and recent commits:
- **Onboarding redesign**: 5-step flow (welcome, profile, academics, location, goals) with new illustrations
- **Recruiter spreadsheets**: New hiring manager/recruiter data views
- **Search/scraping migration to Perplexity + Firecrawl** (Phase 7): replacing SerpAPI / Jina / GoogleSearch across the codebase. Done in agent flows, firm details, and partially in coffee chat / scout / LinkedIn enrichment. `job_board.py` direct call sites still pending.
- **Frontend build**: Updated dist assets indicate recent frontend changes across many components

---

## External Service Reference

| Service | Purpose | Config |
|---------|---------|--------|
| Firebase (offerloop-native) | Auth, Firestore, Cloud Storage | `backend/app/extensions.py`, `src/lib/firebase.ts` |
| OpenAI (GPT-4) | Email gen, resume optimization, scout, interview/coffee chat prep | `backend/app/services/openai_client.py` |
| Anthropic (Claude) | Fallback LLM | `backend/app/services/openai_client.py` |
| People Data Labs | Contact search (2.2B contacts), enrichment | `backend/app/services/pdl_client.py` |
| Hunter.io | Email discovery, verification | `backend/app/services/hunter.py` |
| Stripe | Subscriptions (Pro $9.99/mo, Elite $34.99/mo) | `backend/app/services/stripe_client.py`, `backend/app/routes/billing.py` |
| Gmail API | OAuth, drafts, thread sync, push via Pub/Sub | `backend/app/services/gmail_client.py`, `backend/app/routes/gmail_oauth.py` |
| Perplexity | Primary live search: jobs, companies, news, market context, hiring-manager verification | `backend/app/services/perplexity_client.py` |
| Firecrawl | Primary web extraction: job postings, company profiles (non-LinkedIn) | `backend/app/services/firecrawl_client.py` |
| Apify (HarvestAPI + curious_coder) | Single LinkedIn vendor: profiles, posts, jobs, company pages | `backend/app/services/apify_client.py` |
| Bright Data | DEPRECATED 2026-06-18. Replaced by Apify on every LinkedIn path. | `backend/app/services/bright_data_client.py` |
| Prerender.io | SSR for bot crawlers (40+ user agents) | `backend/wsgi.py` middleware |
| PostHog | Frontend analytics | `connect-grow-hire/src/lib/posthog.ts` |
| Sentry | Backend error tracking (dev only) | `backend/app/utils/sentry_config.py` |
| Google Cloud Pub/Sub | Gmail webhook notifications | `backend/app/routes/gmail_webhook.py` |
| SerpAPI (legacy) | Google Search / Google Jobs — fallback only, gated by `ENABLE_SERPAPI_FALLBACK` | `backend/app/services/serp_client.py` |
| Jina Reader (legacy) | Web content extraction — fallback only, gated by `ENABLE_JINA_FALLBACK` | `backend/app/utils/linkedin_enrichment.py` |

---

## Skill routing

GStack skills are auto-loaded into context (see system reminder for full list). When a request matches a skill, invoke it via the Skill tool as the first action — don't answer ad-hoc.

Key routing rules:
- Product ideas, brainstorming → office-hours
- Bugs, errors, 500s, "why is this broken" → investigate
- Ship, deploy, push, create PR → ship
- QA, test the site, find bugs → qa (or qa-only for report only)
- Code review, check my diff → review
- Update docs after shipping → document-release
- Weekly retro → retro
- Design system, brand → design-consultation
- Visual audit, design polish → design-review
- Architecture review → plan-eng-review
- Save/resume progress → context-save / context-restore
- Code quality, health check → health
- Browser QA, dogfood a flow, verify deploy → browse
