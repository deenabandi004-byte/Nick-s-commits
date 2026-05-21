# Architecture

## System Diagram

```
                                    ┌──────────────────────────────────────────┐
                                    │           Browser (React SPA)            │
                                    │  React 18 + TypeScript + Vite + Tailwind │
                                    │  shadcn/ui + TanStack Query + Router v6  │
                                    └────────────────┬─────────────────────────┘
                                                     │
                                         Bearer {Firebase ID Token}
                                                     │
                                                     ▼
                                    ┌──────────────────────────────────────────┐
                                    │        Flask REST API (port 5001)        │
                                    │    32+ Blueprints registered in wsgi.py  │
                                    │   @require_firebase_auth decorator       │
                                    │   @require_tier(['pro','elite'])         │
                                    │   Flask-Limiter: 500/day, 200/hr        │
                                    └──┬──────┬──────┬──────┬──────┬──────────┘
                                       │      │      │      │      │
                          ┌────────────┘      │      │      │      └────────────┐
                          ▼                   ▼      ▼      ▼                   ▼
                 ┌─────────────┐    ┌──────────┐  ┌──────┐ ┌──────────┐  ┌───────────┐
                 │  Firebase    │    │  People   │  │OpenAI│ │  Gmail   │  │  Stripe   │
                 │  Firestore   │    │  Data     │  │ API  │ │  API     │  │   API     │
                 │  (Database)  │    │  Labs v5  │  │GPT-4o│ │  OAuth2  │  │ Webhooks  │
                 │             │    │  (Search) │  │-mini │ │ Compose  │  │ Checkout  │
                 └─────────────┘    └──────────┘  └──────┘ │ Send     │  │ Portal    │
                                                           │ Drafts   │  └───────────┘
                                                           └──────────┘
                                    Additional APIs:
                                    ├── Hunter.io (email enrichment)
                                    ├── SerpAPI (web search for prep features)
                                    ├── Jina AI (content extraction)
                                    ├── YouTube Data API (interview prep)
                                    └── PostHog (analytics, frontend only)

    Stripe Webhooks (server-to-server):
    Stripe ──webhook──▶ POST /api/billing/webhook ──▶ Update user tier/credits in Firestore
```

---

## Firebase Authentication Flow

### 1. Frontend Initialization
- `connect-grow-hire/src/lib/firebase.ts` initializes the Firebase app with project config
- `FirebaseAuthContext.tsx` wraps the app, listens for auth state changes via `onIdTokenChanged()`

### 2. Google OAuth Sign-In (App Auth - NOT Gmail)
```
User clicks "Sign In" → GoogleAuthProvider popup → Firebase Auth
                                                       │
                                                       ▼
                                              Firebase ID Token generated
                                                       │
                                                       ▼
                                              onIdTokenChanged fires
                                                       │
                                                       ▼
                                              loadUserData(firebaseUser):
                                                - Reads users/{uid} from Firestore
                                                - If doc exists: loads tier, credits, etc.
                                                - If new user: creates doc with tier=free, credits=300
                                                - Sets needsOnboarding=true for new users
                                                       │
                                                       ▼
                                              User state set in React context
```

### 3. Token Passing to Backend
- Every API call includes: `Authorization: Bearer {idToken}`
- Token obtained via `auth.currentUser.getIdToken()`
- Frontend `api.ts` adds this header to all fetch requests

### 4. Backend Token Verification
- `@require_firebase_auth` decorator in `extensions.py`
- Calls `firebase_admin.auth.verify_id_token(id_token, clock_skew_seconds=5)`
- Retry logic: 3 attempts with exponential backoff for network errors
- On success: sets `request.firebase_user = decoded` (contains uid, email, name, etc.)
- On failure: returns 401 (invalid token) or 503 (network error with `retry: True`)

### 5. User Document Structure

```
Collection: users
Document: {firebase_uid}
Fields:
  uid: string                    # Firebase UID
  email: string                  # User's email address
  name: string                   # Display name
  picture: string                # Profile photo URL
  tier: string                   # "free" | "pro" | "elite"
  subscriptionTier: string       # Same as tier (backward compat)
  credits: number                # Current credit balance
  maxCredits: number             # Max credits for tier (300/1500/3000)
  lastCreditReset: string        # ISO datetime of last monthly reset
  lastCreditUpdate: string       # ISO datetime of last credit change
  lastUsageReset: string         # ISO datetime of last usage counter reset
  stripeCustomerId: string       # Stripe customer ID
  stripeSubscriptionId: string   # Stripe subscription ID
  subscriptionStatus: string     # "active" | "trialing" | null
  upgraded_at: string            # ISO datetime of tier upgrade
  updatedAt: string              # ISO datetime of last update
  createdAt: string              # ISO datetime of account creation
  lastSignIn: string             # ISO datetime of last sign-in
  needsOnboarding: boolean       # True until onboarding completed
  emailsMonthKey: string         # "YYYY-MM" for monthly email tracking
  emailsUsedThisMonth: number    # Email count this month
  alumniSearchesUsed: number     # Alumni search count (resets monthly for paid)
  coffeeChatPrepsUsed: number    # Meeting prep count
  interviewPrepsUsed: number     # Interview prep count
  resumeFileName: string         # Uploaded resume filename
  resumeText: string             # Extracted resume text
  signup_source: string          # How user found Offerloop
  emailTemplate: object          # Default email template settings
    purpose: string              # "networking" | "referral" | "follow_up" | "sales"
    stylePreset: string          # "casual" | "professional" | "short_direct" | etc.
    customInstructions: string   # User's custom prompt instructions
    subject: string              # Default subject line pattern
    signoffPhrase: string        # "Best," | "Thanks," | etc.
    signatureBlock: string       # Custom signature block text
  [onboarding fields]:           # university, major, year, interests, etc.
```

---

## Subscription & Credits System

### Tier Definitions

| Feature | Free | Pro ($9.99/mo) | Elite ($34.99/mo) |
|---------|------|----------------|-------------------|
| **Monthly Credits** | 300 | 1,500 | 3,000 |
| **Max Contacts/Search** | 3 | 8 | 15 |
| **Batch Size** | 1 | 5 | 15 |
| **Resume-Enhanced Emails** | No | Yes | Yes |
| **Firm Search** | No | Yes | Yes |
| **Smart Filters** | No | Yes | Yes |
| **Bulk Drafting** | No | Yes | Yes |
| **Export** | No | Yes | Yes |
| **Alumni Searches** | 10 (lifetime) | Unlimited (monthly) | Unlimited (monthly) |
| **Meeting Preps** | 3 (lifetime) | 10/month | Unlimited |
| **Interview Preps** | 2 (lifetime) | 5/month | Unlimited |
| **Priority Queue** | No | No | Yes |
| **Personalized Templates** | No | No | Yes |
| **Weekly Insights** | No | No | Yes |
| **Early Access** | No | No | Yes |
| **Est. Time Saved** | 300 min | 2,500 min | 5,000 min |

### Stripe Integration

**Price IDs:**
- Pro: `price_1ScLXrERY2WrVHp1bYgdMAu4` ($9.99/month)
- Elite: `price_1ScLcfERY2WrVHp1c5rcONJ3` ($34.99/month)

**Checkout Flow:**
1. User selects tier on `/pricing` page
2. Frontend calls `POST /api/billing/create-checkout-session` with `priceId`
3. Backend creates Stripe checkout session with:
   - 30-day free trial (`trial_period_days: 30`)
   - Promotion codes enabled (`allow_promotion_codes: True`)
   - Metadata: `user_id` and `tier`
4. User redirected to Stripe checkout
5. On success: redirected to `/payment-success?session_id={CHECKOUT_SESSION_ID}`

**Webhook Events Handled (`POST /api/billing/webhook`):**

| Event | Handler | Action |
|-------|---------|--------|
| `checkout.session.completed` | `handle_checkout_completed()` | Set tier, credits, stripeCustomerId, stripeSubscriptionId |
| `invoice.paid` | `handle_invoice_paid()` | Reset monthly credits + usage counters, sync tier from Stripe |
| `customer.subscription.deleted` | `handle_subscription_deleted()` | Downgrade to free, cap credits at 300 |
| `customer.subscription.updated` | `handle_subscription_updated()` | Update tier, adjust credits (upgrade=full, downgrade=cap) |

**Tier Change (Pro ↔ Elite):**
- `POST /api/billing/update-subscription` with new `priceId`
- Uses `stripe.Subscription.modify()` with `proration_behavior='create_prorations'`
- Immediately charges/credits the difference

**Customer Portal:**
- `POST /api/billing/portal-session` → returns Stripe portal URL
- Users can manage payment methods, cancel subscription, view invoices

### Credit System

**Firestore Fields:**
- `users/{uid}.credits` - current balance
- `users/{uid}.maxCredits` - tier max (300/1500/3000)
- `users/{uid}.lastCreditReset` - ISO datetime

**Credit Costs:**
- Contact search: 15 credits per search
- Meeting prep: 15 credits (`MEETING_CREDITS` in config.py)
- Interview prep: 25 credits (`INTERVIEW_PREP_CREDITS` in config.py)

**Deduction Logic (`auth.py`):**
- `deduct_credits_atomic()` - uses Firestore transactions to prevent race conditions
- Checks balance, deducts atomically, returns `(success, remaining_credits)`
- Falls back to non-transactional read if transaction fails

**Monthly Reset Logic:**
- `check_and_reset_credits()` - called before every credit check
- Compares `lastCreditReset` month/year to current month/year
- If new calendar month: resets credits to `maxCredits`, updates `lastCreditReset`
- Free tier limits are LIFETIME (never reset for alumni searches, meeting, interview prep counts)
- Pro/Elite usage counters reset every 30 days via `check_and_reset_usage()`

**When Credits Run Out:**
- Backend returns `{'error': 'Insufficient credits', 'credits_needed': X, 'current_credits': Y}`
- Frontend shows upgrade modal via `UpgradeModal` component
- `UsageMeter` component displays visual progress bar in sidebar

**Refund Logic:**
- `refund_credits_atomic()` - atomic credit refund for failed operations
- Used when email generation fails after credits were deducted

---

## Firestore Data Model

### Collection: `users/{uid}`
See User Document Structure above.

### Subcollection: `users/{uid}/contacts/{contactId}`
Saved contacts from search results.
```
Fields:
  firstName: string
  lastName: string
  email: string
  company: string
  title: string
  linkedinUrl: string
  city: string
  state: string
  college: string
  phone: string
  personalEmail: string
  workEmail: string
  hometown: string
  educationTop: string
  workSummary: string
  socialProfiles: object
  similarity: number
  emailSubject: string          # Generated email subject
  emailBody: string             # Generated email body
  emailStatus: string           # "draft" | "sent" | "replied"
  gmailDraftId: string          # Gmail draft ID
  gmailThreadId: string         # Gmail thread ID (for reply tracking)
  savedAt: string               # ISO datetime
  source: string                # "search" | "import" | "manual"
```

### Subcollection: `users/{uid}/integrations/gmail`
Gmail OAuth credentials and watch state.
```
Fields:
  token: string                 # OAuth access token
  refresh_token: string         # OAuth refresh token
  token_uri: string             # Token endpoint URL
  client_id: string             # OAuth client ID
  scopes: array<string>         # Granted scopes
  expiry: string                # Token expiry (ISO datetime)
  gmailAddress: string          # Connected Gmail address
  updatedAt: timestamp
  watchHistoryId: string        # Gmail push notification history ID
  watchExpiration: number       # Watch expiration timestamp (ms)
  watchStartedAt: string        # Watch start time (ISO datetime)
```

### Subcollection: `users/{uid}/firmSearches/{searchId}`
Saved firm/company search results.

### Subcollection: `users/{uid}/searchHistory/{historyId}`
Search history entries.

### Subcollection: `users/{uid}/exports/{exportId}`
Export operations (Pro/Elite only per Firestore rules).

### Subcollection: `users/{uid}/activity/{activityId}`
Activity log entries.

### Subcollection: `users/{uid}/goals/{goalId}`
User goals.

### Subcollection: `users/{uid}/calendar_events/{eventId}`
Calendar events.

### Subcollection: `users/{uid}/recruiters/{recruiterId}`
Hiring Manager Tracker entries.

### Subcollection: `users/{uid}/notifications/{notificationId}`
User notifications. Special doc: `notifications/outbox`.

### Subcollection: `users/{uid}/scoutConversations/{convId}`
Scout AI conversation history.

### Subcollection: `users/{uid}/professionalInfo/{docId}`
Professional info (stored by backend).

### Subcollection: `users/{uid}/coffee-chat-preps/{docId}`
Saved meeting prep notes.

### Subcollection: `users/{uid}/interview-preps/{docId}`
Saved interview prep notes.

### Subcollection: `users/{uid}/resume_library/{docId}`
Resume library entries.

### Subcollection: `users/{uid}/resume_scores/{docId}`
Resume ATS score results.

### Subcollection: `users/{uid}/cover_letter_library/{docId}`
Cover letter library entries.

### Collection: `oauth_state/{state}`
Temporary OAuth state tokens (CSRF protection, 15-minute TTL).
```
Fields:
  uid: string
  email: string
  created: timestamp
  expires: timestamp
```

### Collection: `gmail_mappings/{email}`
Email → UID mapping for O(1) lookup of Gmail notifications.
```
Fields:
  uid: string
```

---

## Firestore Security Rules Summary

- Users can read/write their own data and subcollections
- Tier-related fields (`tier`, `subscriptionTier`, `stripeSubscriptionId`, `stripeCustomerId`, `maxCredits`) are **protected from client-side writes** - only the backend (via Admin SDK) can modify these
- Export operations require Pro/Elite tier (enforced at Firestore rule level)
- Default deny: all other documents are inaccessible
