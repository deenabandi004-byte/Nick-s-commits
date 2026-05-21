# Job Board Feature - Codebase Analysis

Complete analysis of the Offerloop codebase to help you build a Job Board feature that matches existing patterns.

---

## 1. Design System & Styling

### Main Stylesheet: `src/index.css`

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/index.css`

**Key Features:**
- **Color Palette:** Blue/Purple/Cyan gradient theme
  - Primary: `#3B82F6` (Blue)
  - Secondary: `#60A5FA` (Light Blue)
  - Accent: `#8B5CF6` (Purple)
- **Glass Morphism:** `.glass-card` class with backdrop blur, gradients, and hover effects
- **CSS Variables:** Defined in `:root` for theming
- **Typography:** Inter font family, hero text utilities
- **Animations:** Fade-in, scale, float animations

**Key CSS Classes:**
- `.glass-card` - Primary glass card with gradient background
- `.glass-card-light` - Lighter variant
- `.btn-primary-glass` - Gradient button with hover effects
- `.btn-secondary-glass` - Outlined button variant
- `.gradient-text-teal` - Animated gradient text
- `.tabs-container-gradient` - Gradient background for tabs

### Tailwind Config

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/tailwind.config.ts`

```typescript
{
  colors: {
    primary: 'hsl(var(--primary))',      // #3B82F6
    secondary: 'hsl(var(--secondary))',   // #60A5FA
    accent: 'hsl(var(--accent))',         // #8B5CF6
    // ... plus card, border, muted, etc.
  },
  borderRadius: {
    lg: 'var(--radius)',  // 0.5rem
  }
}
```

---

## 2. Reusable Components

### GlassCard Component

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/components/GlassCard.tsx`

```typescript
<GlassCard className="p-6" variant="default" glow={false}>
  {/* Your content */}
</GlassCard>
```

**Props:**
- `children`: ReactNode
- `className?: string`
- `glow?: boolean`
- `variant?: 'default' | 'light'`

### PageWrapper Component

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/components/PageWrapper.tsx`

```typescript
<PageWrapper className="custom-class">
  {/* Page content */}
</PageWrapper>
```

**Usage:** Wraps page content with proper background and z-index handling.

### UI Components (shadcn/ui)

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/components/ui/`

**Available Components:**
- `Button` - With `variant="gradient"` for primary actions
- `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Input`, `Select`, `Badge`, `Dialog`, `Toast`, etc.

**Button Variants:**
```typescript
<Button variant="gradient">Primary Action</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Tertiary</Button>
```

**Card Usage:**
```typescript
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

---

## 3. Page Structure Pattern

### Example: ContactSearchPage

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/pages/ContactSearchPage.tsx`

**Structure:**
```typescript
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PageHeaderActions } from "@/components/PageHeaderActions";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";

const ContactSearchPage: React.FC = () => {
  const { user } = useFirebaseAuth();
  
  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header with sidebar trigger */}
          <div className="border-b">
            <SidebarTrigger />
            <PageHeaderActions />
          </div>
          
          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Your page content */}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};
```

### Example: MeetingPrepPage

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/pages/MeetingPrepPage.tsx`

**Key Patterns:**
- Uses `SidebarProvider` + `AppSidebar` for navigation
- `PageHeaderActions` for header actions (Scout chatbot, credits, etc.)
- `BackToHomeButton` for navigation
- `CreditPill` for credit display
- `Tabs` for multiple views (e.g., "Generate" vs "Library")
- `LoadingSkeleton` for loading states
- Toast notifications via `useToast()`

---

## 4. AppSidebar Navigation

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/components/AppSidebar.tsx`

**Navigation Items Array (lines 41-48):**
```typescript
const navigationItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Contact Search", url: "/contact-search", icon: Search },
  { title: "Firm Search", url: "/firm-search", icon: Building2 },
  { title: "Meeting Prep", url: "/meeting-prep", icon: Coffee },
  { title: "Interview Prep", url: "/interview-prep", icon: Briefcase },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
];
```

**To Add Job Board:**
```typescript
import { Briefcase } from "lucide-react"; // or use a different icon

const navigationItems = [
  // ... existing items
  { title: "Job Board", url: "/job-board", icon: Briefcase }, // Add this
];
```

**Sidebar Features:**
- Collapsible sidebar with icon-only mode
- Active state highlighting with gradient background
- Settings dropdown with submenu
- Credits display with progress bar
- User profile with avatar
- Upgrade button

---

## 5. User Context & Authentication

### FirebaseAuthContext

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`

**Usage:**
```typescript
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";

const MyPage = () => {
  const { user, isLoading, updateCredits, checkCredits } = useFirebaseAuth();
  
  // User object structure:
  // {
  //   uid: string;
  //   email: string;
  //   name: string;
  //   picture?: string;
  //   tier: "free" | "pro" | "elite";
  //   credits: number;
  //   maxCredits: number;
  //   needsOnboarding?: boolean;
  // }
  
  if (isLoading) return <LoadingSkeleton />;
  if (!user) return <Navigate to="/signin" />;
  
  return <div>Welcome, {user.name}!</div>;
};
```

### Onboarding Data

**Stored in Firestore `users/{uid}`:**
- `university`, `major`, `graduationYear`
- `targetIndustries` (career interests)
- `jobType` (internship/full-time)
- `locationPreferences`
- `resumeParsed` (parsed resume data)

**Access Pattern:**
```typescript
import { firebaseApi } from "../services/firebaseApi";

const professionalInfo = await firebaseApi.getProfessionalInfo(user.uid);
// Returns: { firstName, lastName, university, fieldOfStudy, graduationYear, targetIndustries, ... }
```

---

## 6. API Service Pattern

### API Service

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/services/api.ts`

**Base URL Configuration:**
```typescript
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
    ? 'http://localhost:5001/api'
    : 'https://www.offerloop.ai/api');
```

**Example API Call:**
```typescript
import { apiService } from "@/services/api";

// Example: Contact Search
const result = await apiService.runFreeSearch({
  jobTitle: "Software Engineer",
  company: "Google",
  location: "San Francisco, CA",
  userProfile: {
    university: "Stanford",
    major: "Computer Science",
    year: "2024"
  }
});

// Example: Meeting Prep
const prep = await apiService.createMeetingPrep({
  linkedinUrl: "https://linkedin.com/in/..."
});

// Example: Interview Prep
const interviewPrep = await apiService.generateInterviewPrep({
  job_posting_url: "https://..."
});
```

**Error Handling:**
```typescript
try {
  const result = await apiService.someMethod();
  if (isErrorResponse(result)) {
    toast({ title: "Error", description: result.error });
    return;
  }
  // Handle success
} catch (error: any) {
  if (error.status === 401) {
    // Auth error - redirect to signin
  } else if (error.status === 402) {
    // Insufficient credits
    toast({ title: "Insufficient Credits", description: "Please upgrade your plan" });
  }
}
```

**Authentication:**
- All API calls automatically include Firebase ID token in `Authorization: Bearer {token}` header
- Token is obtained via `getIdToken()` from Firebase Auth
- Auto-refreshes on 401 errors

---

## 7. Backend Structure

### Flask App Entry Point

**Location:** `/Users/karthik/work/Offerloop/backend/wsgi.py`

**Blueprint Registration Pattern:**
```python
from .app.routes.health import health_bp
from .app.routes.contacts import contacts_bp
# ... other blueprints

app.register_blueprint(health_bp)
app.register_blueprint(contacts_bp, url_prefix='/api')
```

### Example Route Handler

**Location:** `/Users/karthik/work/Offerloop/backend/app/routes/contacts.py` (example)

**Pattern:**
```python
from flask import Blueprint, request, jsonify
from app.extensions import require_firebase_auth
from app.services.firebase import verify_firebase_token

contacts_bp = Blueprint('contacts', __name__)

@contacts_bp.route('/search', methods=['POST'])
@require_firebase_auth
def search_contacts():
    user_id = request.user_id  # Set by require_firebase_auth decorator
    data = request.get_json()
    
    # Your logic here
    result = {
        'contacts': [...],
        'total': 10
    }
    
    return jsonify(result), 200
```

**Authentication Decorator:**
- `@require_firebase_auth` - Verifies Firebase ID token
- Sets `request.user_id` and `request.user_email` on request object
- Returns 401 if token is invalid

---

## 8. Routing Configuration

### App.tsx Router

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/App.tsx`

**Current Routes (lines 173-231):**
```typescript
<Routes>
  {/* Public Landing */}
  <Route path="/" element={<PublicRoute><Index /></PublicRoute>} />
  
  {/* Auth */}
  <Route path="/signin" element={<PublicRoute><SignIn /></PublicRoute>} />
  <Route path="/auth/callback" element={<PublicRoute><AuthCallback /></PublicRoute>} />
  
  {/* Onboarding */}
  <Route path="/onboarding" element={<ProtectedRoute><OnboardingFlow /></ProtectedRoute>} />
  
  {/* Protected App Pages */}
  <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
  <Route path="/contact-search" element={<ProtectedRoute><ContactSearchPage /></ProtectedRoute>} />
  <Route path="/firm-search" element={<ProtectedRoute><FirmSearchPage /></ProtectedRoute>} />
  <Route path="/meeting-prep" element={<ProtectedRoute><MeetingPrepPage /></ProtectedRoute>} />
  <Route path="/interview-prep" element={<ProtectedRoute><InterviewPrepPage /></ProtectedRoute>} />
  <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
  
  {/* 404 */}
  <Route path="*" element={<NotFound />} />
</Routes>
```

**To Add Job Board Route:**
```typescript
// 1. Import (lazy load for code splitting)
const JobBoardPage = React.lazy(() => import("./pages/JobBoardPage"));

// 2. Add route
<Route 
  path="/job-board" 
  element={
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>
        <JobBoardPage />
      </Suspense>
    </ProtectedRoute>
  } 
/>
```

**Route Guards:**
- `ProtectedRoute` - Requires authentication, redirects to `/signin` if not logged in
- `PublicRoute` - Redirects authenticated users to `/home` (unless signed out)

---

## 9. ScoutChatbot Integration

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/components/ScoutChatbot.tsx`

**Integration Pattern:**
```typescript
import { PageHeaderActions } from "@/components/PageHeaderActions";

// PageHeaderActions includes ScoutChatbot automatically
<PageHeaderActions />
```

**Or use directly:**
```typescript
import ScoutChatbot from "@/components/ScoutChatbot";

<ScoutChatbot 
  onJobTitleSuggestion={(title, company, location) => {
    // Auto-populate form fields
    setJobTitle(title);
    setCompany(company);
    setLocation(location);
  }}
  userResume={userResume} // Optional: for job fit analysis
/>
```

**Features:**
- Chat interface for job search assistance
- Auto-populates search fields from natural language
- Job fit analysis (if resume provided)
- Job listing suggestions with click-to-use

---

## 10. File Structure Summary

### Frontend Structure
```
connect-grow-hire/
├── src/
│   ├── pages/              # Page components
│   │   ├── Home.tsx
│   │   ├── ContactSearchPage.tsx
│   │   ├── MeetingPrepPage.tsx
│   │   └── ... (31 files)
│   ├── components/         # Reusable components
│   │   ├── AppSidebar.tsx
│   │   ├── GlassCard.tsx
│   │   ├── PageWrapper.tsx
│   │   ├── ScoutChatbot.tsx
│   │   ├── ui/            # shadcn/ui components
│   │   └── ... (122 files)
│   ├── contexts/          # React contexts
│   │   └── FirebaseAuthContext.tsx
│   ├── services/          # API services
│   │   ├── api.ts
│   │   ├── firebaseApi.ts
│   │   └── ...
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Utilities
│   │   ├── firebase.ts
│   │   ├── utils.ts
│   │   └── constants.ts
│   └── index.css          # Main stylesheet
└── tailwind.config.ts
```

### Backend Structure
```
backend/
├── app/
│   ├── routes/            # Flask blueprints
│   │   ├── contacts.py
│   │   ├── meeting_prep.py
│   │   ├── interview_prep.py
│   │   └── ...
│   ├── services/          # Business logic
│   │   ├── firebase.py
│   │   ├── openai_client.py
│   │   └── ...
│   ├── models/            # Data models
│   └── utils/             # Utilities
└── wsgi.py               # Flask app entry point
```

---

## 11. Key Patterns to Follow

### 1. Page Component Structure
```typescript
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PageHeaderActions } from "@/components/PageHeaderActions";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

const JobBoardPage: React.FC = () => {
  const { user, isLoading } = useFirebaseAuth();
  
  if (isLoading) return <LoadingSkeleton />;
  
  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b flex items-center gap-2 p-4">
            <SidebarTrigger />
            <PageHeaderActions />
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {/* Your content */}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};
```

### 2. API Integration
```typescript
import { apiService } from "@/services/api";
import { toast } from "@/hooks/use-toast";

const [loading, setLoading] = useState(false);

const handleSearch = async () => {
  setLoading(true);
  try {
    const result = await apiService.someEndpoint({ /* params */ });
    // Handle success
    toast({ title: "Success", description: "Job board updated!" });
  } catch (error: any) {
    toast({ 
      title: "Error", 
      description: error.message || "Something went wrong" 
    });
  } finally {
    setLoading(false);
  }
};
```

### 3. Credit Checking
```typescript
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { CreditPill } from "@/components/credits";

const { user, checkCredits } = useFirebaseAuth();
const hasEnoughCredits = (user?.credits ?? 0) >= REQUIRED_CREDITS;

// Display credits
<CreditPill credits={user?.credits ?? 0} maxCredits={user?.maxCredits ?? 300} />
```

### 4. Toast Notifications
```typescript
import { toast } from "@/hooks/use-toast";

toast({
  title: "Success",
  description: "Job saved successfully",
});

toast({
  title: "Error",
  description: "Failed to load jobs",
  variant: "destructive",
});
```

### 5. Loading States
```typescript
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

{loading ? (
  <LoadingSkeleton />
) : (
  <div>Content</div>
)}
```

---

## 12. Constants & Configuration

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/lib/constants.ts`

**Common Constants:**
- `TIER_CONFIGS` - Tier-specific limits and features
- Credit costs for different features
- Feature flags

---

## 13. Analytics Integration

**Location:** `/Users/karthik/work/Offerloop/connect-grow-hire/src/lib/analytics.ts`

**Usage:**
```typescript
import { trackFeatureActionCompleted, trackNavClick } from "../lib/analytics";

trackNavClick("Job Board", "sidebar");
trackFeatureActionCompleted("job_board_search", { results_count: 10 });
```

---

## Next Steps for Job Board Implementation

1. **Create Page Component:** `src/pages/JobBoardPage.tsx`
2. **Add Route:** Update `App.tsx` with `/job-board` route
3. **Update Sidebar:** Add "Job Board" to `navigationItems` in `AppSidebar.tsx`
4. **Create Backend Endpoint:** Add blueprint in `backend/app/routes/job_board.py`
5. **Add API Service Method:** Add method to `src/services/api.ts`
6. **Style with Glass Cards:** Use `GlassCard` and existing UI components
7. **Integrate Scout:** Use `PageHeaderActions` or `ScoutChatbot` directly

---

## Quick Reference: Import Paths

```typescript
// Components
import { AppSidebar } from "@/components/AppSidebar";
import { GlassCard } from "@/components/GlassCard";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeaderActions } from "@/components/PageHeaderActions";
import { CreditPill } from "@/components/credits";
import { BackToHomeButton } from "@/components/BackToHomeButton";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

// Contexts & Services
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { apiService } from "@/services/api";
import { firebaseApi } from "../services/firebaseApi";

// Hooks & Utils
import { toast } from "@/hooks/use-toast";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
```

---

**You're all set!** Use this document as a reference while building your Job Board feature. All the patterns, components, and structures are documented above.











