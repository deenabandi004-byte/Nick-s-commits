# Claude Code Context

Quick-reference context file for Claude Code sessions working on Offerloop.

---

## Quick Reference Card

| Item | Value |
|------|-------|
| **Backend** | `backend/` - Python Flask, port 5001 |
| **Frontend** | `connect-grow-hire/` - React 18 + Vite, port 8080 |
| **Database** | Firestore (NoSQL) + legacy SQLite (`contacts.db`) |
| **Auth** | Firebase Auth → ID tokens → `@require_firebase_auth` decorator |
| **Payments** | Stripe (live keys in `.env`) |
| **AI** | OpenAI GPT-4o-mini (email gen), GPT-4o (prep features) |
| **Search** | People Data Labs v5 (contact search) |
| **Email** | Gmail API OAuth2, Hunter.io (enrichment) |
| **Entry point** | `backend/wsgi.py` (32+ blueprints) |
| **App factory** | `backend/app/__init__.py` (subset only: health, outbox, SPA) |
| **Frontend entry** | `connect-grow-hire/src/App.tsx` (43 routes) |
| **Config** | `backend/app/config.py` (all constants, tier configs, metro areas) |
| **Extensions** | `backend/app/extensions.py` (Firebase, CORS, rate limits, decorators) |
| **API calls** | `connect-grow-hire/src/services/api.ts` (~52KB, all backend calls) |
| **Firestore ops** | `connect-grow-hire/src/services/firebaseApi.ts` (direct client reads/writes) |

---

## Architecture Decisions

### Why Flask (not FastAPI/Django)?
- Lightweight, minimal boilerplate for a REST API
- Blueprint system maps well to feature-based route organization
- Team familiarity; fast iteration for a startup
- No ORM needed (Firestore is NoSQL, accessed via Admin SDK)

### Why Firestore (not PostgreSQL/MongoDB)?
- Firebase ecosystem: Auth + Firestore + Hosting in one platform
- Real-time listeners used in frontend (TanStack Query + onSnapshot)
- Subcollection model fits user-scoped data naturally
- No schema migrations needed during rapid iteration
- Security rules provide row-level access control without backend code

### Why People Data Labs (not Apollo/ZoomInfo)?
- Person Search API with Elasticsearch query syntax
- Education data with school names (critical for alumni filtering)
- Metro area location matching
- Competitive pricing for startup scale

### Why GPT-4o-mini for emails (not GPT-4o)?
- Speed: batch generation of 3-15 emails per search needs low latency
- Cost: high-volume generation (every search triggers email gen)
- Quality: sufficient for short networking emails with heavy post-processing
- GPT-4o used for more complex tasks (interview prep, meeting prep)

### Why separate Gmail OAuth (not Firebase Auth scopes)?
- Firebase Auth uses Google sign-in for authentication only
- Gmail API requires compose/send/readonly scopes - separate consent flow
- Credentials stored in Firestore subcollection `users/{uid}/integrations/gmail`
- Users can use the app without connecting Gmail (emails shown as compose links)

### Why Vite (not CRA/Next.js)?
- SWC compiler for fast builds
- SPA served by Flask in production (no SSR needed)
- Manual chunk splitting configured to prevent circular dependency issues

---

## Code Conventions

### Backend
- Routes: `backend/app/routes/{feature}.py` as Flask Blueprints
- Services: `backend/app/services/{feature}.py` for business logic
- Utils: `backend/app/utils/{feature}.py` for pure helpers
- New blueprints MUST be registered in `backend/wsgi.py`
- Auth decorator order: `@require_tier` BEFORE `@require_firebase_auth` (outermost first)
- Rate limiting: 500/day, 200/hour per user (in-memory, not Redis)
- Credit operations use Firestore transactions (`deduct_credits_atomic()`)

### Frontend
- Path alias: `@` → `./src`
- UI components: `src/components/ui/` (shadcn/ui, don't modify)
- Feature components: `src/components/{Feature}/`
- Pages: `src/pages/{Feature}.tsx`
- Contexts: `src/contexts/{Feature}Context.tsx`
- TypeScript: `strictNullChecks: false`, `noImplicitAny: false`
- New React-dependent npm packages → add to `vendor-react` chunk in `vite.config.ts`
- Lazy loading: all pages use `React.lazy()` with `Suspense` fallback

### Naming
- Backend: snake_case (Python)
- Frontend: camelCase for variables/functions, PascalCase for components
- Firestore fields: camelCase (e.g., `emailStatus`, `gmailDraftId`)
- API routes: `/api/{feature}/{action}` with kebab-case

---

## Environment Variables

### Backend (root `.env`)

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API (email gen, prep features) |
| `PEOPLE_DATA_LABS_API_KEY` | PDL contact search |
| `STRIPE_SECRET_KEY` | Stripe payments (LIVE key) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe client-side key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `SERPAPI_KEY` | SerpAPI (web search for prep features) |
| `JINA_API_KEY` | Jina AI (content extraction) |
| `GOOGLE_CLIENT_ID` | Google OAuth (Gmail integration) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Path to Firebase service account JSON |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `FLASK_SECRET` | Flask session secret |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project (default: offerloop-native) |
| `GMAIL_PUBSUB_TOPIC` | Pub/Sub topic for Gmail push notifications |
| `GMAIL_WEBHOOK_SECRET` | Webhook verification secret |
| `OAUTH_REDIRECT_URI` | Gmail OAuth callback URL |
| `HUNTER_API_KEY` | Hunter.io email enrichment |
| `YOUTUBE_API_KEY` | YouTube Data API (interview prep) |
| `SENTRY_DSN` | Sentry error tracking |
| `STRIPE_PRO_PRICE_ID` | Stripe Pro tier price ID |
| `STRIPE_ELITE_PRICE_ID` | Stripe Elite tier price ID |
| `PROMPT_SEARCH_ENABLED` | Feature flag: experimental prompt-first search |

### Frontend (`connect-grow-hire/.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_POSTHOG_KEY` | PostHog analytics key |
| `VITE_POSTHOG_HOST` | PostHog host URL |

---

## Tier System Quick Reference

| | Free | Pro ($9.99/mo) | Elite ($34.99/mo) |
|-|------|----------------|-------------------|
| **Credits** | 300/mo | 1,500/mo | 3,000/mo |
| **Contacts/search** | 3 | 8 | 15 |
| **Batch size** | 1 | 5 | 15 |
| **Resume-enhanced emails** | No | Yes | Yes |
| **Firm search** | No | Yes | Yes |
| **Export** | No | Yes | Yes |
| **Alumni searches** | 10 lifetime | Unlimited/mo | Unlimited/mo |
| **Meeting preps** | 3 lifetime | 10/mo | Unlimited |
| **Interview preps** | 2 lifetime | 5/mo | Unlimited |
| **Priority queue** | No | No | Yes |

**Credit costs:** Search = 15, Meeting Prep = 15, Interview Prep = 25

**Monthly reset:** Calendar month boundary. Free tier limits are LIFETIME (never reset) for alumni searches, meeting preps, interview preps.

---

## Known Issues & Tech Debt

### Active TODOs in Codebase

| File | Issue |
|------|-------|
| `services/background_sync.py` | TODO: Run `sync_stale_threads()` periodically for all active users |
| `routes/job_board.py` | TODO: Implement pagination for multi-query results |
| `services/application_lab_service.py` | Multiple TODO: Remove deprecated methods in next cleanup |
| `services/reply_generation.py` | TEMPORARY DEBUG print statements left in production code |

### Architecture Debt
- **In-memory caching:** PDL cache, Hunter cache, exclusion list cache, rate limiter - all use in-memory dicts. Resets on server restart. No Redis.
- **Legacy SQLite:** `contacts.db` at project root used by contact directory feature. Parallel to Firestore - potential data inconsistency.
- **Large service files:** `pdl_client.py` (37K+ tokens), `reply_generation.py` (67KB), `job_board.py` (6000+ lines). Should be split.
- **Feature flag:** `CREATE_GMAIL_DRAFTS = False` in config - Gmail drafts disabled globally, returns compose links instead. Toggle carefully.
- **No frontend tests:** No test framework configured for the React app.
- **Debug prints:** Production code has `print()` debug statements (not logging).

### Common Pitfalls
- **Decorator order matters:** `@require_tier(['pro'])` must come BEFORE `@require_firebase_auth` in decorator stack (Python evaluates bottom-up).
- **Vite chunk splitting:** Adding React-dependent packages without updating `vite.config.ts` `vendor-react` chunk causes "Cannot access before initialization" errors.
- **PDL location:** "CA" gets interpreted as Canada by PDL. `_fix_canada_misinterpretation()` and `_expand_us_state_abbreviation()` handle this.
- **Firestore tier fields:** `tier`, `subscriptionTier`, `stripeSubscriptionId`, `stripeCustomerId`, `maxCredits` are protected from client-side writes by Firestore security rules. Only backend (Admin SDK) can modify these.
- **Gmail OAuth vs Firebase Auth:** Completely separate flows. Firebase Auth = app login (Google sign-in popup). Gmail OAuth = email integration (separate consent with compose/send scopes).

---

## File Tree (Key Files)

```
Offerloop/
├── backend/
│   ├── wsgi.py                          # MAIN ENTRY POINT - registers 32+ blueprints
│   ├── app/
│   │   ├── __init__.py                  # App factory (subset of routes)
│   │   ├── config.py                    # All config, env vars, tier configs, metro areas
│   │   ├── extensions.py               # Firebase init, CORS, rate limiter, auth decorators
│   │   ├── routes/
│   │   │   ├── runs.py                  # Contact search + email generation
│   │   │   ├── contacts.py              # Contact CRUD, import, export
│   │   │   ├── billing.py               # Stripe checkout, webhooks, portal
│   │   │   ├── gmail_oauth.py           # Gmail OAuth flow
│   │   │   ├── gmail_notifications.py   # Gmail push notifications
│   │   │   ├── outbox.py                # Email tracking
│   │   │   ├── resume.py                # Resume upload, score, optimize, tailor
│   │   │   ├── interview_prep.py        # Interview prep generation
│   │   │   ├── meeting_prep.py      # Meeting prep
│   │   │   ├── scout.py                 # Recruiter finder
│   │   │   ├── scout_assistant.py       # AI chat assistant
│   │   │   ├── timeline.py              # Recruiting timeline
│   │   │   ├── job_board.py             # Job board aggregation
│   │   │   └── ... (20+ more blueprints)
│   │   ├── services/
│   │   │   ├── pdl_client.py            # PDL search, alumni filtering (LARGE: 37K+ tokens)
│   │   │   ├── reply_generation.py      # Email generation + post-processing (LARGE: 67KB)
│   │   │   ├── gmail_client.py          # Gmail API operations
│   │   │   ├── stripe_client.py         # Stripe integration
│   │   │   ├── hunter.py                # Hunter.io email enrichment
│   │   │   ├── auth.py                  # Credit management, usage checks
│   │   │   ├── resume_parser.py         # Resume text extraction
│   │   │   ├── resume_optimizer_v2.py   # AI resume optimization
│   │   │   ├── ats_scorer.py            # ATS score calculation
│   │   │   ├── pdf_patcher.py           # PDF editing
│   │   │   └── pdf_builder.py           # PDF generation
│   │   └── utils/
│   │       ├── contact.py               # Email text cleaning (clean_email_text)
│   │       ├── users.py                 # User info extraction, university shorthand
│   │       └── meeting_prep.py      # Commonality detection
│   ├── email_templates.py               # Style/purpose presets
│   └── requirements.txt                 # 41 Python dependencies
├── connect-grow-hire/
│   ├── src/
│   │   ├── App.tsx                      # 43 routes, lazy loading, route guards
│   │   ├── services/
│   │   │   ├── api.ts                   # All backend API calls (~52KB)
│   │   │   └── firebaseApi.ts           # Direct Firestore operations
│   │   ├── contexts/
│   │   │   ├── FirebaseAuthContext.tsx   # Auth state, user data, credits
│   │   │   ├── ScoutContext.tsx          # Scout AI state
│   │   │   └── TourContext.tsx           # Onboarding tour state
│   │   ├── components/
│   │   │   ├── ui/                      # shadcn/ui components (don't modify)
│   │   │   ├── AppSidebar.tsx           # Main navigation sidebar
│   │   │   └── ... (feature components)
│   │   ├── pages/                       # Page components
│   │   └── lib/
│   │       └── firebase.ts              # Firebase app initialization
│   ├── vite.config.ts                   # Chunk splitting config
│   └── tailwind.config.ts               # Tailwind config
├── firestore.rules                      # Security rules (15 subcollections)
├── .env                                 # Backend secrets (LIVE KEYS - DO NOT COMMIT)
└── docs/                                # This documentation directory
```

---

## Firestore Collections Summary

| Collection/Subcollection | Description |
|--------------------------|-------------|
| `users/{uid}` | User profile, tier, credits, settings |
| `users/{uid}/contacts/{id}` | Saved contacts from search |
| `users/{uid}/integrations/gmail` | Gmail OAuth credentials |
| `users/{uid}/firmSearches/{id}` | Firm search results |
| `users/{uid}/searchHistory/{id}` | Search history |
| `users/{uid}/exports/{id}` | Export operations (Pro/Elite) |
| `users/{uid}/activity/{id}` | Activity log |
| `users/{uid}/goals/{id}` | User goals |
| `users/{uid}/calendar_events/{id}` | Calendar events |
| `users/{uid}/recruiters/{id}` | Hiring manager tracker |
| `users/{uid}/notifications/{id}` | Notifications (special: `outbox` doc) |
| `users/{uid}/scoutConversations/{id}` | Scout AI chat history |
| `users/{uid}/professionalInfo/{id}` | Professional info |
| `users/{uid}/coffee-chat-preps/{id}` | Meeting prep notes |
| `users/{uid}/interview-preps/{id}` | Interview prep notes |
| `users/{uid}/resume_library/{id}` | Resume library |
| `users/{uid}/resume_scores/{id}` | ATS score results |
| `users/{uid}/cover_letter_library/{id}` | Cover letter library |
| `oauth_state/{state}` | Temporary OAuth state tokens (15-min TTL) |
| `gmail_mappings/{email}` | Email → UID mapping for Gmail notifications |

---

## Development Workflow

```bash
# Start backend
cd backend && python3 wsgi.py

# Start frontend (separate terminal)
cd connect-grow-hire && npm run dev

# Run backend tests
cd backend && pytest tests/

# Production build
cd connect-grow-hire && npm run build
gunicorn backend.wsgi:app --bind 0.0.0.0:5001 --workers 4
```

**Production serving:** Flask serves the built SPA from `connect-grow-hire/dist/` and falls back to `index.html` for non-API 404s (client-side routing).
