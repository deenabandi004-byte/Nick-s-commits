# Dark Mode Implementation Plan - All Pages

## Overview

This document outlines the comprehensive plan to implement dark mode across all pages in the application, following the patterns established in the landing page (Index.tsx) as documented in `DARK_MODE_IMPLEMENTATION.md`.

## Implementation Strategy

### Core Principles

1. **Use Tailwind `dark:` classes** for theme-aware styling
2. **Use CSS variables** from `index.css` where possible (background, foreground, card, border, etc.)
3. **Apply glassmorphism** using `.glass-card` class for containers
4. **Text colors**: White/gray-300 in dark mode, slate-900/slate-700 in light mode
5. **Backgrounds**: Dark slate/indigo gradients in dark mode, white/light blue in light mode
6. **Borders**: Lighter with transparency in dark mode, blue-tinted in light mode
7. **Shadows**: Blue-tinted shadows in both modes, more pronounced in dark mode

### Color Palette Reference

**Dark Mode:**
- Background: `#0a0e1a`, `#0f172a`, `#1e293b` (slate/indigo)
- Text Primary: `#FFFFFF` (white)
- Text Secondary: `#D1D5DB` (gray-300)
- Text Muted: `#9CA3AF` (gray-400)
- Accent: `#3B82F6` (blue-500)
- Border: `rgba(148, 163, 184, 0.35)`

**Light Mode:**
- Background: `#FFFFFF`, `#F0F7FF`, `#E0F2FE` (white to light blue)
- Text Primary: `#0F172A` (slate-900)
- Text Secondary: `#334155` (slate-700)
- Accent: `#3B82F6` (blue-500)
- Border: `rgba(59, 130, 246, 0.3)`

---

## Page-by-Page Implementation Plan

### 1. Index.tsx (Landing Page)
**Status**: ✅ Already implemented (reference implementation)

**No changes needed** - This is the reference implementation.

---

### 2. DashboardPage.tsx
**Priority**: High (Main authenticated page)

**Current Issues:**
- Uses `bg-transparent` - needs dark mode background
- Header uses `border-gray-100/30` - needs dark mode variant
- Tab container uses `bg-card` - should use glassmorphism
- Text colors not theme-aware

**Changes Needed:**

1. **Main Container:**
   - Replace `bg-transparent` with `bg-background dark:bg-[#0a0e1a]`
   - Add `min-h-screen` with gradient background support

2. **Header:**
   - Change `border-gray-100/30` to `border-border dark:border-slate-700/50`
   - Add `bg-background/80 dark:bg-slate-900/80 backdrop-blur-sm`
   - Update text color: `text-foreground dark:text-white`

3. **Tab Container:**
   - Apply `.glass-card` class or equivalent
   - Update border: `border-border dark:border-slate-700/50`
   - Text colors: `text-muted-foreground dark:text-gray-300` for inactive, `text-white` for active

4. **Main Content Area:**
   - Ensure `bg-background dark:bg-transparent` (inherits from parent)
   - Text colors: `text-foreground dark:text-gray-300`

---

### 3. ContactSearchPage.tsx
**Priority**: High (Core feature page)

**Current Issues:**
- Likely uses light backgrounds
- Form inputs need dark mode styling
- Cards and containers need glassmorphism
- Progress bars need dark mode colors

**Changes Needed:**

1. **Page Container:**
   - Add `bg-background dark:bg-[#0a0e1a] min-h-screen`
   - Apply gradient background in dark mode

2. **Header:**
   - Same as DashboardPage header changes

3. **Search Form Card:**
   - Apply `.glass-card` class
   - Input fields: `bg-background dark:bg-slate-800/50 border-border dark:border-slate-700`
   - Labels: `text-foreground dark:text-gray-300`
   - Placeholders: `placeholder:text-muted-foreground dark:placeholder:text-gray-500`

4. **Results Container:**
   - Cards: `.glass-card` styling
   - Text: `text-foreground dark:text-gray-300`
   - Borders: `border-border dark:border-slate-700/50`

5. **Progress Bar:**
   - Background: `bg-muted dark:bg-slate-800`
   - Fill: Keep blue gradient (works in both modes)

6. **Credit Display Boxes:**
   - Background: `bg-blue-50 dark:bg-blue-900/20`
   - Text: `text-blue-700 dark:text-blue-300`
   - Border: `border-blue-200 dark:border-blue-800/50`

7. **Batch Size Slider:**
   - Track: `bg-slate-200 dark:bg-slate-700`
   - Thumb: `bg-blue-500 dark:bg-blue-400`

---

### 4. FirmSearchPage.tsx
**Priority**: High (Core feature page)

**Changes Needed:**

1. **Page Container:**
   - Same as ContactSearchPage

2. **Search Form:**
   - Same input styling as ContactSearchPage

3. **Results Grid:**
   - Cards: `.glass-card` styling
   - Hover effects: `hover:border-blue-400 dark:hover:border-blue-500`
   - Text: `text-foreground dark:text-gray-300`

4. **Filters/Sidebar:**
   - Background: `bg-card dark:bg-slate-900/50`
   - Border: `border-border dark:border-slate-700`
   - Checkboxes: Theme-aware colors

---

### 5. AccountSettings.tsx
**Priority**: High (User settings)

**Current Issues:**
- Uses `GlassCard` component (good)
- Text colors may not be theme-aware
- Form inputs need dark mode styling
- Section headers need dark mode text

**Changes Needed:**

1. **Page Container:**
   - Ensure `bg-background dark:bg-[#0a0e1a]`

2. **GlassCard Components:**
   - Verify dark mode styling is applied
   - Check text colors inside cards

3. **Form Inputs:**
   - `Input`: `bg-background dark:bg-slate-800/50 border-border dark:border-slate-700`
   - `Select`: Same as Input
   - Labels: `text-foreground dark:text-gray-300`

4. **Section Headers:**
   - `text-foreground dark:text-white` with `font-semibold`

5. **Save Button:**
   - Already uses gradient (good)
   - Ensure text is white in both modes

6. **Avatar Section:**
   - Background: `bg-muted dark:bg-slate-800/50`
   - Border: `border-border dark:border-slate-700`

7. **Danger Zone:**
   - Keep red colors but adjust for dark mode
   - Background: `bg-red-50 dark:bg-red-900/20`
   - Border: `border-red-500/30 dark:border-red-500/50`
   - Text: `text-red-600 dark:text-red-400`

---

### 6. InterviewPrepPage.tsx
**Priority**: Medium

**Changes Needed:**

1. **Page Container:**
   - Same background as other pages

2. **Prep Cards:**
   - `.glass-card` styling
   - Hover: `hover:border-blue-400 dark:hover:border-blue-500`

3. **Form Sections:**
   - Same input styling as other forms

4. **Content Display:**
   - Text: `text-foreground dark:text-gray-300`
   - Code blocks: Dark syntax highlighting in dark mode

---

### 7. MeetingPrepPage.tsx
**Priority**: Medium

**Changes Needed:**

1. **Same as InterviewPrepPage** - similar structure

2. **Chat Interface:**
   - Message bubbles: Different background in dark mode
   - User messages: `bg-blue-500 dark:bg-blue-600`
   - AI messages: `bg-slate-100 dark:bg-slate-800`

---

### 8. MeetingLibrary.tsx
**Priority**: Medium

**Changes Needed:**

1. **Page Container:**
   - Same background pattern

2. **Library Grid:**
   - Cards: `.glass-card` styling
   - Empty state: `text-muted-foreground dark:text-gray-400`

3. **Delete Buttons:**
   - Hover: `hover:bg-red-100 dark:hover:bg-red-900/30`

---

### 9. Outbox.tsx
**Priority**: Medium

**Changes Needed:**

1. **Email List:**
   - Items: `bg-card dark:bg-slate-900/50`
   - Hover: `hover:bg-muted dark:hover:bg-slate-800/50`
   - Border: `border-border dark:border-slate-700`

2. **Email Content:**
   - Text: `text-foreground dark:text-gray-300`
   - Links: `text-blue-600 dark:text-blue-400`

3. **Status Badges:**
   - Sent: `bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400`
   - Draft: `bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400`

---

### 10. SignIn.tsx
**Priority**: High (First impression)

**Current Issues:**
- Uses `PageWrapper` and `GlassCard` (good)
- May need background gradient
- Form inputs need dark mode

**Changes Needed:**

1. **Page Background:**
   - Add `DynamicGradientBackground` component or equivalent
   - Or use `bg-background dark:bg-[#0a0e1a]` with gradient

2. **GlassCard:**
   - Verify dark mode styling
   - Ensure text is readable

3. **Form Inputs:**
   - Same as other forms
   - Focus states: `focus:border-blue-500 dark:focus:border-blue-400`

4. **Buttons:**
   - Primary: Already uses gradient (good)
   - Secondary: `border-border dark:border-slate-700 text-foreground dark:text-gray-300`

5. **Links:**
   - `text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300`

---

### 11. Pricing.tsx
**Priority**: Medium

**Changes Needed:**

1. **Pricing Cards:**
   - `.glass-card` styling
   - Recommended badge: Keep gradient (works in both)
   - Hover: `hover:border-blue-400 dark:hover:border-blue-500`

2. **Feature Lists:**
   - Text: `text-foreground dark:text-gray-300`
   - Checkmarks: `text-green-600 dark:text-green-400`

3. **CTA Buttons:**
   - Already use gradient (good)

---

### 12. AboutUs.tsx
**Priority**: Low

**Changes Needed:**

1. **Content Sections:**
   - Text: `text-foreground dark:text-gray-300`
   - Headings: `text-foreground dark:text-white`

2. **Team Cards:**
   - `.glass-card` styling
   - Images: Add dark mode overlay if needed

---

### 13. ContactUs.tsx
**Priority**: Low

**Changes Needed:**

1. **Contact Form:**
   - Same as SignIn form styling

2. **Info Cards:**
   - `.glass-card` styling

---

### 14. PrivacyPolicy.tsx
**Priority**: Low

**Changes Needed:**

1. **Content:**
   - Text: `text-foreground dark:text-gray-300`
   - Headings: `text-foreground dark:text-white`
   - Links: `text-blue-600 dark:text-blue-400`

---

### 15. TermsOfService.tsx
**Priority**: Low

**Changes Needed:**

1. **Same as PrivacyPolicy**

---

### 16. Onboarding Flow Pages
**Priority**: Medium (User onboarding experience)

**Pages:**
- OnboardingWelcome.tsx
- OnboardingProfile.tsx
- OnboardingAcademics.tsx
- OnboardingLocationPreferences.tsx
- OnboardingFlow.tsx

**Changes Needed:**

1. **All Onboarding Pages:**
   - Background: Use onboarding-specific gradient or `bg-background dark:bg-[#0a0e1a]`
   - Progress indicator: Theme-aware colors
   - Form inputs: Same as other forms
   - Cards: `.glass-card` or onboarding-specific card styling
   - Buttons: Primary gradient, secondary with theme-aware borders

2. **Progress Bar:**
   - Track: `bg-slate-200 dark:bg-slate-700`
   - Fill: Blue gradient (works in both)

3. **Step Indicators:**
   - Active: Blue gradient
   - Inactive: `bg-slate-200 dark:bg-slate-700`
   - Text: `text-foreground dark:text-gray-300`

---

### 17. PaymentSuccess.tsx
**Priority**: Low

**Changes Needed:**

1. **Success Card:**
   - `.glass-card` styling
   - Success icon: `text-green-600 dark:text-green-400`
   - Text: `text-foreground dark:text-gray-300`

---

### 18. NotFound.tsx
**Priority**: Low

**Changes Needed:**

1. **404 Content:**
   - Text: `text-foreground dark:text-gray-300`
   - Heading: `text-foreground dark:text-white`
   - Button: Already uses gradient (good)

---

### 19. Home.tsx
**Priority**: Low (Just renders DashboardPage)

**Changes Needed:**

1. **No changes needed** - delegates to DashboardPage

---

### 20. Dashboard.tsx (Component)
**Priority**: High (Used in DashboardPage)

**Current Issues:**
- Uses various background colors
- Cards need dark mode styling
- Charts need dark mode colors

**Changes Needed:**

1. **Main Container:**
   - `bg-background dark:bg-transparent` (inherits from parent)

2. **Summary Cards:**
   - `.glass-card` styling
   - Icons: Theme-aware colors
   - Text: `text-foreground dark:text-gray-300`
   - Values: `text-foreground dark:text-white font-bold`

3. **Chart Containers:**
   - Background: `bg-card dark:bg-slate-900/50`
   - Border: `border-border dark:border-slate-700`
   - Chart colors: Use theme-aware palette
   - Grid lines: `stroke-slate-200 dark:stroke-slate-700`
   - Text: `text-foreground dark:text-gray-300`

4. **Activity Feed:**
   - Items: `bg-card dark:bg-slate-900/50`
   - Hover: `hover:bg-muted dark:hover:bg-slate-800/50`
   - Timestamps: `text-muted-foreground dark:text-gray-500`

5. **Streak/Goal Cards:**
   - `.glass-card` styling
   - Progress bars: Theme-aware

---

## Component-Level Changes

### Shared Components Needing Updates

1. **GlassCard Component:**
   - Verify dark mode styling is complete
   - Check all variants

2. **PageWrapper Component:**
   - Ensure background is theme-aware
   - Check padding and spacing

3. **Header Component:**
   - Already has some styling, verify dark mode

4. **Button Components:**
   - Primary: Already uses gradient (good)
   - Secondary: Add dark mode border/text colors
   - Ghost: Add dark mode hover states

5. **Input Components:**
   - Background: `bg-background dark:bg-slate-800/50`
   - Border: `border-border dark:border-slate-700`
   - Text: `text-foreground dark:text-gray-300`
   - Placeholder: `placeholder:text-muted-foreground dark:placeholder:text-gray-500`
   - Focus: `focus:border-blue-500 dark:focus:border-blue-400`

6. **Select Components:**
   - Same as Input

7. **Card Components:**
   - Background: `bg-card dark:bg-slate-900/50`
   - Border: `border-border dark:border-slate-700`
   - Text: `text-card-foreground dark:text-gray-300`

8. **Tabs Components:**
   - Background: `bg-card dark:bg-slate-900/50`
   - Active tab: Blue gradient
   - Inactive tab: `text-muted-foreground dark:text-gray-400`

9. **Progress Components:**
   - Track: `bg-slate-200 dark:bg-slate-700`
   - Fill: Blue gradient

10. **Badge Components:**
    - Default: `bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-gray-300`
    - Variants: Theme-aware colors

---

## Global CSS Updates

### index.css

**Changes Needed:**

1. **Body/HTML:**
   - Remove `background: white !important` or make it theme-aware
   - Use `bg-background` class instead

2. **Dark Mode Variables:**
   - Verify all CSS variables are properly defined
   - Check sidebar variables for dark mode

3. **Glass Card Styles:**
   - Ensure dark mode variants are complete
   - Verify backdrop blur works in dark mode

4. **Scrollbar Styling:**
   - Add dark mode scrollbar colors:
     ```css
     .dark ::-webkit-scrollbar-thumb {
       background: rgba(148, 163, 184, 0.3);
     }
     .dark ::-webkit-scrollbar-track {
       background: rgba(15, 23, 42, 0.5);
     }
     ```

---

## Testing Checklist

For each page, verify:

- [ ] Background colors switch correctly
- [ ] Text is readable in both modes
- [ ] Borders are visible in both modes
- [ ] Inputs are usable in both modes
- [ ] Buttons are clearly visible
- [ ] Hover states work in both modes
- [ ] Focus states are visible
- [ ] Cards/containers have proper contrast
- [ ] Icons are visible
- [ ] Links are distinguishable
- [ ] Charts/graphs are readable
- [ ] Images have proper contrast
- [ ] Loading states are visible
- [ ] Error messages are readable
- [ ] Success messages are readable

---

## Implementation Order

### Phase 1: Core Pages (Week 1)
1. DashboardPage.tsx
2. ContactSearchPage.tsx
3. FirmSearchPage.tsx
4. AccountSettings.tsx
5. SignIn.tsx

### Phase 2: Feature Pages (Week 2)
6. InterviewPrepPage.tsx
7. MeetingPrepPage.tsx
8. MeetingLibrary.tsx
9. Outbox.tsx
10. Dashboard.tsx (component)

### Phase 3: Supporting Pages (Week 3)
11. Pricing.tsx
12. Onboarding Flow Pages (all 5)
13. PaymentSuccess.tsx

### Phase 4: Content Pages (Week 4)
14. AboutUs.tsx
15. ContactUs.tsx
16. PrivacyPolicy.tsx
17. TermsOfService.tsx
18. NotFound.tsx

### Phase 5: Component Updates (Ongoing)
- Update shared components as needed
- Global CSS refinements
- Final polish and testing

---

## Notes

- **Consistency**: Maintain consistent styling patterns across all pages
- **Accessibility**: Ensure WCAG contrast ratios are met in both modes
- **Performance**: Use CSS variables and Tailwind classes for optimal performance
- **User Preference**: Respect system preference on first load, then user selection
- **Transitions**: Add smooth transitions between theme changes (`transition-colors duration-300`)

---

## Reference Files

- `DARK_MODE_IMPLEMENTATION.md` - Landing page implementation reference
- `src/index.css` - Global styles and CSS variables
- `src/contexts/ThemeContext.tsx` - Theme context provider
- `src/components/background/DynamicGradientBackground.tsx` - Background component
- `tailwind.config.ts` - Tailwind configuration

