# Onboarding Tour Implementation Plan

## Overview
Implement a guided tour with tooltip popups for first-time users, matching the style shown in the screenshots. The tour should auto-run once on first login and be accessible via a "?" help button.

**Tour Steps: 6-7 steps recommended** (covering full user journey):
1. Find Your Connections (Search filters)
2. View Search Results & Save to Directory
3. Manage Your Contacts (Contact Directory)
4. Assign Templates (Email templates section)
5. Personalize All (AI email customization)
6. Follow-up Emails (Follow-up tab)
7. Credits & Upgrade (Optional - understanding credit system)

**Note**: Start with 6-7 steps, but the system should be flexible to add/remove steps easily. Users can also skip steps if they want.

## Architecture & Components

### 1. Core Tour System
**New Component**: `connect-grow-hire/src/components/OnboardingTour.tsx`
- Reusable tour component built with React + TypeScript
- Uses Radix UI Popover for tooltips (already in project via `@radix-ui/react-popover`)
- Supports step-based navigation (Next/Back buttons)
- Progress indicator with dots (like in screenshots)
- Overlay backdrop to dim background when tour is active
- Position tooltips relative to anchor elements using `getBoundingClientRect()`
- Handle responsive positioning to prevent overflow off-screen

### 2. Tour Configuration
**New File**: `connect-grow-hire/src/config/onboardingTour.ts`
- Define 6-7 tour steps with:
  - Unique step IDs
  - Title and body text (per requirements)
  - CSS selector or ref callback to locate anchor elements
  - Tooltip placement preferences (top, bottom, left, right)
  - Optional: route/page where step should be shown
  - Optional: conditional logic (e.g., only show if user has contacts)

### 3. Persistence Layer
**Storage Strategy**:
- **Primary**: Firestore user document field `hasSeenOnboardingTour: boolean`
- **Fallback**: localStorage key `onboardingTourSeen` (for anonymous/unauthenticated users)
- Update in `FirebaseAuthContext.tsx` when user completes onboarding
- Check on app load / after authentication

### 4. Integration Points

#### A. Authentication Flow
**File**: `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`
- Check `hasSeenOnboardingTour` flag after user loads
- Expose helper: `startOnboardingTour()` and `markTourComplete()`
- When creating new user (line 170), ensure `hasSeenOnboardingTour: false` is set

#### B. Main App Layout
**File**: `connect-grow-hire/src/App.tsx` or appropriate layout component
- Render `<OnboardingTour />` at app root level
- Pass user authentication state
- Auto-start tour if `hasSeenOnboardingTour === false` and user is authenticated

#### C. Help Button
**New Component**: `connect-grow-hire/src/components/OnboardingTourTrigger.tsx`
- Small "?" help icon button (position: fixed, typically top-right or in header)
- Visible to all authenticated users
- Opens tour when clicked
- Use QuestionMarkCircle or HelpCircle icon from lucide-react

#### D. Anchor Elements Identification
Need to identify/locate these components in the codebase:

1. **Step 1 - "Find Your Connections"**
   - **Anchor**: Search filters section
   - **Location**: `Home.tsx` around the search form (lines 1200-1459)
   - **Selector**: Filter section with dropdowns (Companies, Positions, Education, Location, Industry, Interests)
   - **Note**: Add `data-tour-anchor="filters"` attribute to the filters container

2. **Step 2 - "View Search Results & Save to Directory"** (NEW)
   - **Anchor**: Search results section or "Save to Library" info
   - **Location**: `Home.tsx` - results display area (lines 1431-1457)
   - **Selector**: Results section showing contacts found
   - **Copy**: "When you run a search, contacts are automatically saved to your Contact Library. You can view them anytime from the sidebar or Contact Directory."
   - **Note**: May show after a search completes, or explain the auto-save feature

3. **Step 3 - "Manage Your Contacts"**
   - **Anchor**: Contact list/table in Contact Directory
   - **Location**: `ContactDirectory.tsx` (lines 448-686 show the contact table)
   - **Selector**: The contacts table container
   - **Note**: May need to navigate to `/contact-directory` route for this step

4. **Step 4 - "Assign Templates"**
   - **Anchor**: Email templates section (Main Email tab with General/Alumni/Industry-Focused templates)
   - **Location**: ⚠️ **NOT FOUND YET** - Need to search for:
     - Page/component with "Main Email" / "Follow-up Email" tabs
     - Template cards (General, Alumni, Industry-Focused, Create New)
     - "Apply Template" button
   - **Action Items**:
     - Search codebase for template-related components
     - May need to create this page if it doesn't exist
     - Or may be part of ContactDirectory or a separate route

5. **Step 5 - "Personalize All"** (NEW)
   - **Anchor**: "Personalize All" button in email templates section
   - **Location**: Same as Step 4 (need to locate)
   - **Selector**: "Personalize All" button
   - **Copy**: "Click 'Personalize All' to let our AI customize each email based on your resume, the contact's background, and commonalities. This makes your outreach much more personal and effective."
   - **Note**: Only show if templates have been assigned

6. **Step 6 - "Follow-up Emails"**
   - **Anchor**: Follow-up Email tab
   - **Location**: Same as Steps 4-5 (need to locate)
   - **Selector**: "Follow-up Email" tab element
   - **Copy**: (Already provided in requirements)

7. **Step 7 - "Credits & Upgrade"** (OPTIONAL)
   - **Anchor**: Credits pill/display in header
   - **Location**: `Home.tsx` header (lines 1187-1199) or `AppSidebar.tsx`
   - **Selector**: Credit display component
   - **Copy**: "You earn credits with each search. Free tier includes [X] credits. Upgrade to Pro for more credits and advanced features like resume matching."
   - **Note**: Optional step - can be included or skipped based on product strategy

## Tour Flow Considerations

### Route-Based Tour Steps
Some steps may need to navigate between routes:
- Steps 1-2: Home page (`/` or `/home`)
- Step 3: Contact Directory (`/contact-directory`)
- Steps 4-6: Email templates page (TBD - need to locate)

### Tour Continuity
- **Option A**: Complete tour on single page (if all features accessible from one route)
- **Option B**: Tour spans multiple routes (requires navigation between steps)
  - Store tour state in context/localStorage
  - Resume tour when navigating to new page
  - Show navigation prompt: "Let's continue the tour - navigate to Contact Directory"

### Conditional Steps
- Step 2 (Results) - Only show if user has run a search or has contacts
- Step 5 (Personalize) - Only show if user has assigned templates
- Step 7 (Credits) - Always show, but can be skipped

## Implementation Steps

### Phase 1: Core Tour Component
1. Create `OnboardingTour.tsx` component
   - State management: `currentStep`, `isActive`, `isOpen`
   - Overlay backdrop (dimmed background with `bg-black/50` or similar)
   - Tooltip positioning logic using `useRef` and `getBoundingClientRect()`
   - Next/Back button handlers
   - Progress dots indicator
   - Close/Skip functionality

2. Style tooltips to match existing UI
   - Use existing popover/tooltip styles from `ui/popover.tsx`
   - Rounded corners (`rounded-md` or `rounded-lg`)
   - Drop shadow (`shadow-md` or `shadow-lg`)
   - White background with border
   - Match padding and typography from existing modals

### Phase 2: Configuration & Steps
1. Create `config/onboardingTour.ts` with step definitions:
```typescript
export interface TourStep {
  id: string;
  title: string;
  body: string;
  anchorSelector: string | (() => HTMLElement | null);
  placement?: 'top' | 'bottom' | 'left' | 'right';
  route?: string; // Optional: route where this step should be shown
  conditional?: () => boolean; // Optional: only show if condition returns true
  order: number; // Order in which steps appear
  optional?: boolean; // Optional: can be skipped
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'find-connections',
    title: 'Find Your Connections',
    body: 'Use these filters to search for specific people. You can filter by organizations, roles, locations, and more to find exactly who you\'re looking for.',
    anchorSelector: '[data-tour-anchor="filters"]',
    placement: 'bottom',
    route: '/',
    order: 1
  },
  {
    id: 'search-results',
    title: 'Search Results',
    body: 'When you run a search, contacts are automatically saved to your Contact Library. You can view them anytime from the sidebar or Contact Directory.',
    anchorSelector: '[data-tour-anchor="results"]',
    placement: 'bottom',
    route: '/',
    order: 2,
    conditional: () => {
      // Only show if user has contacts or has run a search
      return true; // TBD: Add actual check
    }
  },
  {
    id: 'manage-contacts',
    title: 'Manage Your Contacts',
    body: 'Your selected contacts appear here. You can select contacts and assign templates to them.',
    anchorSelector: '[data-tour-anchor="contacts-list"]',
    placement: 'right',
    route: '/contact-directory',
    order: 3
  },
  {
    id: 'apply-templates',
    title: 'Apply Templates',
    body: 'After selecting templates, click "Apply Template" to assign them. Then use "Personalize All" to let our AI customize each email.',
    anchorSelector: '[data-tour-anchor="templates"]',
    placement: 'bottom',
    route: '/contact-directory', // TBD: Update when template page is located
    order: 4
  },
  {
    id: 'personalize-all',
    title: 'Personalize Your Emails',
    body: 'Click "Personalize All" to let our AI customize each email based on your resume, the contact\'s background, and commonalities. This makes your outreach much more personal and effective.',
    anchorSelector: '[data-tour-anchor="personalize-button"]',
    placement: 'top',
    route: '/contact-directory', // TBD: Update when template page is located
    order: 5,
    conditional: () => {
      // Only show if templates have been assigned
      return true; // TBD: Add actual check
    }
  },
  {
    id: 'follow-up-emails',
    title: 'Follow-up Emails',
    body: 'Switch to the Follow-up Email tab to choose a follow-up template. Follow-ups are optional but can improve response rates.',
    anchorSelector: '[data-tour-anchor="follow-up-tab"]',
    placement: 'bottom',
    route: '/contact-directory', // TBD: Update when template page is located
    order: 6
  },
  {
    id: 'credits-upgrade',
    title: 'Credits & Upgrades',
    body: 'You earn credits with each search. Free tier includes 120 credits (8 searches). Upgrade to Pro for 1800 credits and advanced features like resume matching.',
    anchorSelector: '[data-tour-anchor="credits"]',
    placement: 'bottom',
    route: '/',
    order: 7,
    optional: true // Can be skipped
  }
];
```

2. Add data attributes to anchor elements in relevant components

### Phase 3: Persistence & State
1. Update `FirebaseAuthContext.tsx`:
   - Add `hasSeenOnboardingTour` to User interface (line 23-42)
   - Load flag from Firestore in `loadUserData` (line 94-138)
   - Add `markTourComplete()` function to update Firestore
   - Add `startOnboardingTour()` helper function

2. Add localStorage fallback in `OnboardingTour.tsx`:
   - Check `localStorage.getItem('onboardingTourSeen')` if user not authenticated
   - Update localStorage on tour completion

### Phase 4: Integration
1. Add tour component to app layout
   - Import in `App.tsx` or main layout
   - Conditionally render based on `hasSeenOnboardingTour` flag
   - Auto-start on mount if flag is false

2. Create and integrate help button
   - Add `OnboardingTourTrigger.tsx` component
   - Position in header or fixed position
   - Wire up to manually start tour

3. Add anchor selectors to existing components:
   - `Home.tsx`: Add `data-tour-anchor="filters"` to filters section
   - `ContactDirectory.tsx`: Add `data-tour-anchor="contacts-list"` to contact list
   - Locate and update email templates page (TBD)

### Phase 5: Responsive & Edge Cases
1. Handle responsive positioning:
   - Detect if tooltip would overflow viewport
   - Adjust position dynamically (e.g., switch from 'bottom' to 'top' if no space below)
   - Use `useEffect` to recalculate on window resize

2. Handle missing anchors:
   - If anchor element not found, skip that step or show warning
   - Log errors to console for debugging

3. Handle route changes:
   - Pause tour if user navigates away
   - Resume from current step when returning (optional, or restart)

## Files to Create

1. `connect-grow-hire/src/components/OnboardingTour.tsx` - Main tour component
2. `connect-grow-hire/src/components/OnboardingTourTrigger.tsx` - Help button
3. `connect-grow-hire/src/config/onboardingTour.ts` - Tour step configuration
4. `connect-grow-hire/src/hooks/useOnboardingTour.ts` (optional) - Custom hook for tour logic

## Files to Modify

1. `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`
   - Add `hasSeenOnboardingTour` to User interface
   - Add tour-related methods
   - Update `loadUserData` to read flag

2. `connect-grow-hire/src/pages/Home.tsx`
   - Add `data-tour-anchor="filters"` to filters section
   - Ensure component renders before tour tries to attach

3. `connect-grow-hire/src/components/ContactDirectory.tsx`
   - Add `data-tour-anchor="contacts-list"` to contact list container

4. `connect-grow-hire/src/App.tsx` (or layout component)
   - Import and render `<OnboardingTour />`
   - Import and render `<OnboardingTourTrigger />` in header

5. **TBD**: Email templates assignment page/component
   - Add anchors for steps 3 and 4

## Styling Details

### Tooltip Style (matching existing UI)
- Background: `bg-background` (white/light)
- Border: `border border-border` (subtle gray)
- Padding: `p-4` or `p-6`
- Rounded corners: `rounded-lg`
- Shadow: `shadow-lg`
- Typography: Title `text-lg font-semibold`, Body `text-sm text-muted-foreground`
- Max width: `max-w-sm` or `max-w-md`

### Overlay Backdrop
- Background: `fixed inset-0 bg-black/50 z-40`
- Pointer events: Allow clicks on tooltip, block on backdrop (with close handler)

### Progress Dots
- Use flexbox with gap
- Active dot: `bg-primary` or `bg-blue-500`
- Inactive dot: `bg-gray-300` or `bg-gray-400`
- Size: `w-2 h-2 rounded-full`

## Testing Checklist

- [ ] Tour auto-starts on first login
- [ ] Tour does not auto-start on subsequent logins
- [ ] Help button appears in UI
- [ ] Help button opens tour manually
- [ ] Next/Back buttons work correctly
- [ ] Progress dots update correctly
- [ ] Tooltips position correctly relative to anchors
- [ ] Tooltips don't overflow viewport on small screens
- [ ] Overlay dims background properly
- [ ] Closing tour marks completion in Firestore
- [ ] Closing tour marks completion in localStorage (fallback)
- [ ] All 6-7 steps are reachable and display correctly
- [ ] Tour handles navigation between routes gracefully
- [ ] Conditional steps only show when appropriate
- [ ] Tour works on mobile/tablet (responsive)
- [ ] Tour gracefully handles missing anchor elements

## Dependencies

- ✅ Already available:
  - `@radix-ui/react-popover` (via `ui/popover.tsx`)
  - React hooks (`useState`, `useEffect`, `useRef`)
  - Firebase/Firestore for persistence
  - lucide-react icons
  - Tailwind CSS for styling

- ❌ May need to install:
  - None (should be able to use existing dependencies)

## Notes & Considerations

1. **Email Templates Page**: The screenshots show an email template assignment interface that wasn't found in the initial search. Need to:
   - Search more thoroughly for template-related routes/components
   - Check if it's behind a route that wasn't examined
   - May need to be created if it doesn't exist yet
   - **Alternative**: If templates are assigned from ContactDirectory, steps 4-6 might all be on that page

2. **Number of Steps**: Starting with 6-7 steps is more comprehensive:
   - Better covers the full user journey
   - Gives users a complete understanding of the workflow
   - Can be shortened if too overwhelming (users can skip)
   - **Recommendation**: Start with 6 steps, add 7th (Credits) if needed

3. **Tour Timing**: Consider adding a small delay before auto-starting (e.g., 500ms) to ensure page is fully rendered and anchors are available

4. **Accessibility**: Ensure tour is keyboard navigable (Tab, Enter, Escape) and screen-reader friendly (ARIA labels)

5. **Analytics**: Consider tracking tour completion/abandonment for product insights

6. **Localization**: If app supports i18n, extract tour text to translation files

## Future Enhancements (Out of Scope)

- Skippable tour option
- Tour customization per user role
- Tour completion rewards/incentives
- Analytics integration
- A/B testing different tour flows

