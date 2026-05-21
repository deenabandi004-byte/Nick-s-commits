# Frontend Application Documentation

## Overview

This is a React-based single-page application (SPA) built with Vite, TypeScript, and Tailwind CSS. The frontend provides a user interface for the Offerloop platform, including contact search, email management, meeting preparation, billing, and user account management.

## Technology Stack

- **Vite** - Build tool and dev server
- **React 18** - UI framework
- **TypeScript** - Type safety
- **React Router** - Client-side routing
- **Firebase** - Authentication and data storage
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI component library
- **Radix UI** - Accessible component primitives
- **React Hook Form** - Form management
- **Zod** - Schema validation
- **Stripe.js** - Payment processing

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project configured
- Backend API running (see backend README)

### Installation

1. Navigate to the frontend directory:
```bash
cd connect-grow-hire
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (create `.env` file):
```bash
VITE_API_BASE_URL=http://localhost:5001/api
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:8080`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
connect-grow-hire/
├── src/
│   ├── components/        # Reusable React components
│   │   ├── ui/           # shadcn/ui components
│   │   └── ...           # Feature components
│   ├── contexts/         # React contexts
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility libraries
│   ├── pages/            # Page components (routes)
│   ├── services/         # API and service integrations
│   ├── App.tsx           # Main app component with routing
│   └── main.tsx          # Application entry point
├── public/               # Static assets
├── dist/                 # Production build output
└── vite.config.ts        # Vite configuration
```

## Key Features

### Authentication

Firebase Authentication is used for user management:
- Email/password authentication
- Google OAuth
- Protected routes
- Session management

**Context**: `src/contexts/FirebaseAuthContext.tsx`

### Routing

React Router handles client-side routing:

**Public Routes:**
- `/` - Landing page
- `/signin` - Sign in page
- `/about` - About us
- `/contact` - Contact us
- `/pricing` - Pricing page
- `/privacy` - Privacy policy
- `/terms` - Terms of service

**Protected Routes** (require authentication):
- `/home` - Main dashboard
- `/contact-directory` - Contact management
- `/meeting-library` - Meeting preps
- `/account-settings` - User settings
- `/dashboard` - Analytics dashboard
- `/onboarding` - User onboarding flow

**Route Guards**: Implemented in `App.tsx` with `ProtectedRoute` component

### Pages

#### Home (`pages/Home.tsx`)
- Main dashboard after login
- Contact search functionality
- Quick actions
- Meeting history

#### Contact Directory (`pages/ContactDirectory.tsx`)
- View all contacts
- Contact management
- Email tracking
- Contact statistics

#### Meeting Library (`pages/MeetingLibrary.tsx`)
- View meeting preparations
- Download PDFs
- Create new preps

#### Account Settings (`pages/AccountSettings.tsx`)
- Profile management
- Resume upload
- Tier management
- Gmail connection

#### Onboarding Flow (`pages/OnboardingFlow.tsx`)
- Multi-step user onboarding
- Profile setup
- Location preferences
- Academic information

### Components

#### UI Components (`components/ui/`)
shadcn/ui components including:
- Buttons, Inputs, Forms
- Dialogs, Modals
- Cards, Badges
- Tables, Tabs
- Toast notifications
- And more...

#### Feature Components

**ContactSearchForm** (`components/ContactSearchForm.tsx`)
- Contact search interface
- Job title, company, location inputs
- Tier-based search options

**ContactDirectory** (`components/ContactDirectory.tsx`)
- Contact list display
- Filtering and sorting
- Contact actions

**ScoutChatbot** (`components/ScoutChatbot.tsx`)
- AI assistant chatbot
- User guidance

**NotificationBell** (`components/NotificationBell.tsx`)
- Notification system
- User alerts

### Services

#### API Service (`services/api.ts`)
Centralized API client with:
- Base URL configuration
- Request/response types
- Error handling
- Authentication headers

**Key Functions:**
- `searchContacts()` - Free tier search
- `searchContactsPro()` - Pro tier search
- `getContacts()` - Fetch user contacts
- `createContact()` - Create new contact
- `generateAndDraftEmails()` - Email generation
- `createMeetingPrep()` - Meeting prep
- `uploadResume()` - Resume upload
- `checkCredits()` - Credit checking
- `createCheckoutSession()` - Stripe checkout

#### Firebase API (`services/firebaseApi.ts`)
Firebase-specific operations:
- Firestore data operations
- User data management
- Contact CRUD operations

### State Management

#### React Query (`@tanstack/react-query`)
- Server state management
- Caching and synchronization
- Background updates
- Optimistic updates

#### React Context
- `FirebaseAuthContext` - Authentication state
- Global UI state

### Styling

#### Tailwind CSS
- Utility-first CSS framework
- Responsive design
- Custom theme configuration

#### CSS Variables
Defined in `src/index.css` for theming:
- Colors
- Spacing
- Typography
- Border radius

## API Integration

### Base URL Configuration

The API base URL is configured in `services/api.ts`:
- Development: `http://localhost:5001/api`
- Production: `https://www.offerloop.ai/api`
- Configurable via `VITE_API_BASE_URL` environment variable

### Authentication

All authenticated requests include Firebase ID token:
```typescript
const idToken = await auth.currentUser?.getIdToken();
fetch('/api/endpoint', {
  headers: {
    'Authorization': `Bearer ${idToken}`
  }
});
```

### Error Handling

API errors are handled consistently:
- Network errors
- Authentication errors (401)
- Validation errors (400)
- Server errors (500)

## Development

### Vite Configuration

The Vite config (`vite.config.ts`) includes:
- React plugin with SWC
- Path aliases (`@/` for `src/`)
- Dev server on port 8080
- Build configuration
- HMR (Hot Module Replacement) support

### TypeScript Configuration

- Strict mode enabled
- Path aliases configured
- React types included

### Code Organization

- **Components**: Reusable UI components
- **Pages**: Route-level components
- **Hooks**: Custom React hooks
- **Services**: API and external service integrations
- **Utils**: Helper functions
- **Types**: TypeScript type definitions

## Features

### Contact Search

**Free Tier:**
- Basic contact search
- Limited fields
- 3 contacts per search

**Pro Tier:**
- Enhanced search with resume
- More contact fields
- 8 contacts per search
- Personalized results

### Email Management

- Email generation
- Gmail integration
- Draft creation
- Reply tracking
- Email templates

### Meeting Preparation

- LinkedIn profile analysis
- Similarity detection
- Question generation
- PDF export
- Company news integration

### Billing

- Stripe integration
- Tier management
- Credit system
- Subscription handling
- Payment success flow

### User Management

- Profile management
- Resume upload and parsing
- Account settings
- Onboarding flow
- Gmail OAuth connection

## Environment Variables

Required environment variables:

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:5001/api

# Firebase Configuration
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Build and Deployment

### Development Build

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

Output: `dist/` directory with optimized assets

### Static Hosting

The `dist/` folder can be served by:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Any static file server

### Backend Integration

The built frontend is served by the Flask backend:
- Static files in `connect-grow-hire/dist/`
- Backend serves SPA for all non-API routes
- API routes handled by Flask

## Performance

### Optimizations

- Code splitting by route
- Lazy loading components
- Image optimization
- Tree shaking
- Minification in production

### Caching

- React Query caching
- Browser caching for static assets
- Service worker (if implemented)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Troubleshooting

### Common Issues

1. **API Connection Errors**
   - Verify backend is running
   - Check `VITE_API_BASE_URL` configuration
   - Check CORS settings on backend

2. **Firebase Errors**
   - Verify Firebase config in `.env`
   - Check Firebase project settings
   - Verify authentication rules

3. **Build Errors**
   - Clear `node_modules` and reinstall
   - Check TypeScript errors
   - Verify all dependencies installed

4. **Routing Issues**
   - Verify React Router configuration
   - Check route guards
   - Verify protected routes

## Development Workflow

1. Start backend server (port 5001)
2. Start frontend dev server (port 8080)
3. Make changes - HMR will update automatically
4. Test in browser
5. Build for production when ready

## Testing

[Add testing information if tests are implemented]

## Contributing

[Add contribution guidelines]

## License

[Your License Here]
