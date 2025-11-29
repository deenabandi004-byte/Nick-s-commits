# Onboarding Tour Testing Checklist

## ✅ Implementation Complete

All code has been written and tested for compilation/linting errors.

## Testing Scenarios

### 1. First-Time User Flow ✅
- [ ] User signs up for new account
- [ ] User completes onboarding flow
- [ ] User lands on `/home` after onboarding
- [ ] Tour auto-starts after 500ms delay
- [ ] First step ("Find Your Connections") appears with tooltip
- [ ] Tooltip is positioned correctly relative to filters section
- [ ] Overlay backdrop dims the background

### 2. Tour Navigation ✅
- [ ] "Next" button advances to next step
- [ ] "Back" button returns to previous step (when available)
- [ ] Progress dots update correctly
- [ ] Last step shows "Finish" button instead of "Next"
- [ ] "X" close button skips tour and marks complete

### 3. Route Navigation ✅
- [ ] Tour navigates from `/home` to `/contact-directory` when needed
- [ ] Tooltip positions correctly after route change
- [ ] Anchors are found after navigation

### 4. Missing Anchors Handling ✅
- [ ] If anchor not found, tour retries after 500ms
- [ ] If still not found, console warning is logged
- [ ] Tour auto-advances to next step if anchor missing
- [ ] Steps 4-6 (templates) gracefully skip if anchors don't exist

### 5. Completion & Persistence ✅
- [ ] Clicking "Finish" marks tour complete in Firestore
- [ ] Closing tour with "X" marks tour complete
- [ ] `hasSeenOnboardingTour` is set to `true` in Firestore
- [ ] localStorage also updated as fallback
- [ ] Tour does NOT auto-start on next login

### 6. Help Button ✅
- [ ] "?" help button visible in top-right after onboarding complete
- [ ] Help button NOT visible during onboarding
- [ ] Clicking help button manually starts tour
- [ ] Manual tour start works even if tour was previously completed

### 7. Existing Users ✅
- [ ] Existing users (with `createdAt`) default to `hasSeenOnboardingTour: true`
- [ ] Existing users do NOT see auto-start tour
- [ ] Existing users CAN manually start tour via help button

### 8. Tooltip Positioning ✅
- [ ] Tooltips position correctly (top, bottom, left, right)
- [ ] Tooltips adjust if they would overflow viewport
- [ ] Tooltips re-position on window resize
- [ ] Tooltips re-position on scroll

### 9. Responsive Design ✅
- [ ] Tour works on desktop
- [ ] Tour works on tablet
- [ ] Tour works on mobile
- [ ] Tooltips stay within viewport on all screen sizes

### 10. Edge Cases ✅
- [ ] User closes browser mid-tour → tour doesn't persist (expected)
- [ ] User navigates away manually → tour closes
- [ ] User refreshes page → tour doesn't restart if already completed
- [ ] Multiple tour instances don't conflict

## Current Anchors Status

### ✅ Anchored & Ready (4 steps)
1. **filters** - `[data-tour-anchor="filters"]` in Home.tsx line 1243
2. **results** - `[data-tour-anchor="results"]` in Home.tsx line 1434
3. **contacts-list** - `[data-tour-anchor="contacts-list"]` in ContactDirectory.tsx line 450
4. **credits** - `[data-tour-anchor="credits"]` in Home.tsx line 1188

### ⏳ Pending Anchors (3 steps - will gracefully skip if not found)
5. **templates** - `[data-tour-anchor="templates"]` - Needs to be added when email templates page exists
6. **personalize-button** - `[data-tour-anchor="personalize-button"]` - Needs to be added
7. **follow-up-tab** - `[data-tour-anchor="follow-up-tab"]` - Needs to be added

## Known Behaviors

1. **Steps 4-6** will auto-skip if anchors don't exist (graceful degradation)
2. **Tour auto-starts** only after onboarding is complete
3. **Help button** only appears after onboarding is complete
4. **Existing users** won't see tour automatically (can use help button)

## Testing Commands

To test the tour manually in browser console:
```javascript
// Check if tour function is available
window.startOnboardingTour()

// Check user's tour status
// In React DevTools, check user.hasSeenOnboardingTour

// Force reset tour status (for testing)
localStorage.setItem('onboardingTourSeen', 'false')
// Then refresh and check Firestore
```

## Files to Monitor

- `connect-grow-hire/src/components/OnboardingTour.tsx` - Main tour component
- `connect-grow-hire/src/App.tsx` - Integration point
- `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx` - User state
- `connect-grow-hire/src/config/onboardingTour.ts` - Step configuration

## Expected Console Messages

- ✅ Normal: No errors or warnings
- ⚠️ Warning (expected): `Tour anchor not found: [data-tour-anchor="templates"]` (for steps 4-6 until anchors added)
- ✅ Success: `Tour marked as complete` when tour finishes

