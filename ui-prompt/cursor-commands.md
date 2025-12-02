# Cursor Commands for Offerloop Redesign

Copy-paste these prompts directly into Cursor to implement each phase. Use with Claude Sonnet 4.5.

---

## Setup Phase

### Command 1: Initial Analysis
```
@workspace Analyze the current UI implementation of Offerloop. Find:
1. Main CSS/stylesheet files
2. All component files that use cards or gradients
3. Current color variables
4. Button implementations
5. Form/input styles

List the files and their current styling patterns.
```

---

## Phase 1: Foundation

### Command 2: Update Global Styles
```
Update the main global stylesheet (globals.css or equivalent) with the Offerloop design system. 

Requirements:
1. Import Satoshi font from: https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap
2. Add CSS variables for:
   - Monochrome colors (white, grays, black)
   - Purple gradient (--accent-from: #8B5CF6, --accent-to: #D946EF)
   - Spacing scale (4px to 64px)
   - Border radius (4px, 8px, 12px)
   - Soft shadows (alpha 0.04-0.08)
3. Set body font to Satoshi
4. Add dark mode variables

Keep existing functionality intact. Only update visual styles.
```

### Command 3: Typography Cleanup
```
Find and replace all font-family declarations across the codebase:
- Replace Inter with var(--font-primary)
- Replace Roboto with var(--font-primary)
- Replace any system font stacks with var(--font-primary)

Update heading styles (h1, h2, h3) to use Satoshi with appropriate weights and letter-spacing.
```

---

## Phase 2: Components

### Command 4: Button System
```
Create a new button system with three variants:

1. Primary: gradient background (#8B5CF6 to #D946EF), white text, hover lift effect
2. Secondary: transparent bg, border outline, hover fill
3. Ghost: transparent bg, no border, subtle hover

Update ALL button instances in the codebase to use one of these three variants. Maintain all existing onClick handlers and functionality.

Files to update: @workspace [let Cursor find button files]
```

### Command 5: Cards to Lists Conversion
```
@workspace Find all card-style components (rounded containers with shadows/borders that wrap content).

Convert them to Linear-style lists:
- Wrapper: .list-container (border, rounded corners, no shadow)
- Items: .list-item (padding, bottom border between items)
- Hover: subtle background change

Maintain all existing data rendering and click handlers. Only change the visual wrapper.

Show me which components you found and will update before making changes.
```

### Command 6: Form Inputs
```
Update all input, textarea, and select elements:

Styles needed:
- Border: 1px solid var(--border-medium)
- Border-radius: 4px
- Padding: 12px 16px
- Focus: purple border + soft shadow
- Font: Satoshi

Update these component types:
- Text inputs
- Textareas
- Select dropdowns
- Search inputs

Keep all form validation and submit logic intact.
```

---

## Phase 3: Colors & Cleanup

### Command 7: Remove Gradients
```
@workspace Search for all instances of 'linear-gradient' in the codebase.

Keep gradients ONLY in:
- Logo/branding
- Primary buttons (created in previous step)
- Credit badge/counter

Delete or replace all other gradients with:
- Solid backgrounds using --bg-primary, --bg-secondary, or --bg-tertiary
- Or remove entirely if decorative

Show me the list before deleting so I can verify.
```

### Command 8: Color Simplification
```
Replace all colored backgrounds and accents:

Replace:
- Blue backgrounds → var(--bg-secondary) or var(--bg-tertiary)
- Green/success colors → keep semantic, but use sparingly
- Purple backgrounds → var(--accent-soft) (only for hover/active states)
- Any other colored backgrounds → monochrome

Keep functional colors for:
- Success indicators (green)
- Error states (red)
- Warning (yellow)

Update: @workspace [let Cursor find colored elements]
```

### Command 9: Border & Shadow Cleanup
```
Update all borders and shadows:

Borders:
- Replace thick/colored borders with 1px solid var(--border-light) or var(--border-medium)
- Max border-radius: 12px (update anything higher)

Shadows:
- Replace heavy shadows (alpha > 0.1) with subtle ones (0.04-0.08)
- Remove shadows from static elements
- Keep only on: buttons, hover states, modals

Apply across: @workspace
```

---

## Phase 4: Spacing

### Command 10: Increase Section Spacing
```
Update spacing throughout the app to be more generous:

Changes:
- Between major sections: 48px (var(--space-12)) or 64px (var(--space-16))
- Between elements: 24px (var(--space-6))
- Component padding: 32px (var(--space-8))
- List item padding: 24px (var(--space-6))

Target files:
- Layout components
- Dashboard
- Main content areas
- Settings pages

Maintain responsive behavior for mobile.
```

---

## Phase 5: Offerloop-Specific

### Command 11: Credit Counter
```
Update the credit counter/badge component:

Style:
- Gradient background (--accent-from to --accent-to)
- White text
- Rounded pill shape (border-radius: 9999px)
- Monospace font for the number
- Lightning bolt emoji before number
- Subtle shadow

Location: Header or navigation area
Ensure credit count updates correctly when changed.
```

### Command 12: Empty States
```
Find all empty state components (no results, no contacts, etc.) and update:

Structure:
- Icon/emoji (large, low opacity)
- Title (encouraging, not harsh)
- Description (helpful, brief)
- Action button (if applicable)

Style:
- Centered layout
- Generous padding (64px vertical)
- Text color: --text-secondary
- Max-width: 400px

Update copy to be friendly: "Ready to find contacts?" not "No results found"
```

### Command 13: Loading States
```
Replace all loading spinners with shimmer effects:

Create:
- .loading-shimmer class with gradient animation
- Skeleton loaders for list items
- Loading state for search results
- Loading state for email generation

Animation:
- Subtle shimmer moving left to right
- 1.5s duration, infinite loop
- Gray gradient background

Apply to: Search, email gen, contact loading
```

---

## Phase 6: Interactions

### Command 14: Micro-interactions
```
Add subtle interactions to interactive elements:

Hover effects:
- Buttons: translateY(-1px) + shadow
- List items: background color change
- Icons: slight rotation (5deg) + scale

Click effects:
- All buttons: scale(0.98) on active

Focus effects:
- All inputs: purple outline ring

Transition:
- Timing: cubic-bezier(0.4, 0, 0.2, 1)
- Duration: 150ms

Add @media (prefers-reduced-motion) support.
```

---

## Phase 7: Testing

### Command 15: Functionality Audit
```
Test all critical user flows:

1. Login/signup flow
2. Contact search → results display
3. Email generation → copy/send
4. Credit system → purchase → update
5. Settings save
6. Dark mode toggle

Create a test checklist and verify each works correctly. Report any broken functionality.
```

### Command 16: Visual Consistency Check
```
Audit the entire app for visual consistency:

Check:
- All text uses Satoshi font
- No gradients except approved locations
- All cards converted to lists
- Spacing is generous (48px+ between sections)
- Border radius ≤ 12px everywhere
- Colors are monochrome + purple only
- Shadows are subtle

Generate a report of any inconsistencies found.
```

---

## Phase 8: Dark Mode

### Command 17: Dark Mode Implementation
```
Ensure dark mode works perfectly:

Update theme toggle to apply data-theme="dark" attribute.

Test in dark mode:
- Text contrast (WCAG AA minimum)
- Border visibility
- Input states
- Button states
- Hover effects
- Purple gradient visibility

Fix any readability issues while maintaining the design system.
```

---

## Phase 9: Responsive

### Command 18: Mobile Optimization
```
Test and fix responsive design:

Breakpoints:
- Mobile: 640px
- Tablet: 768px
- Desktop: 1024px

Verify:
- Navigation works on mobile
- Lists stack properly
- Buttons are touch-friendly (44px min)
- Spacing scales down appropriately
- No horizontal scroll
- Text remains readable

Update grid layouts to stack on mobile.
```

---

## Phase 10: Polish

### Command 19: Final Cleanup
```
Clean up the codebase:

Remove:
- Unused CSS classes
- Old color variables
- Commented-out code
- Duplicate styles
- Unused component files

Organize:
- Group related CSS variables
- Add section comments
- Alphabetize utility classes
- Document custom components

Do NOT remove any functional code, only styling cruft.
```

### Command 20: Performance Check
```
Analyze and optimize:

Check:
- CSS bundle size (should be smaller after cleanup)
- No unused CSS classes in production
- Font loading strategy (preload Satoshi)
- Animation performance (no jank)
- Lazy load images if needed

Suggest optimizations without breaking functionality.
```

---

## Final Verification

### Command 21: Pre-launch Checklist
```
Final verification before considering redesign complete:

Visual:
✓ Satoshi font everywhere
✓ No unwanted gradients
✓ No cards (all lists)
✓ Generous spacing
✓ Clean borders
✓ Subtle shadows
✓ Monochrome + purple only

Functional:
✓ All features work
✓ No console errors
✓ Auth flow intact
✓ API calls successful
✓ Forms submit correctly
✓ Mobile responsive

Generate comprehensive test report.
```

---

## Troubleshooting Commands

### Debug: Find Remaining Cards
```
@workspace Search for components that still look like cards:
- className containing "card", "rounded-xl", "shadow-lg"
- Components with background + shadow + rounded corners
- Any div with padding + border + background

List all findings so I can convert them to lists.
```

### Debug: Find Remaining Gradients
```
@workspace Find all remaining gradients:
- Search: linear-gradient, radial-gradient
- Exclude: logo files, button-primary, credit-badge
- List locations

Show me each instance and confirm if it should be removed.
```

### Debug: Find Font Issues
```
@workspace Find all font-family declarations not using Satoshi:
- Search: font-family
- Exclude: var(--font-primary), var(--font-mono)
- List all instances

Show me what needs updating.
```

### Debug: Console Errors
```
Check the browser console for any errors after the redesign:
- JavaScript errors
- CSS warnings
- Failed API calls
- Missing resources

List all errors with file locations and suggested fixes.
```

---

## Pro Tips for Using These Commands

1. **Run commands sequentially** - Don't skip ahead
2. **Test after each phase** - Catch breaks early
3. **Use @workspace** - Let Cursor find relevant files
4. **Review before applying** - Ask Cursor to show you the changes first
5. **Keep git commits small** - One commit per phase for easy rollback
6. **Test functionality constantly** - Visual changes shouldn't break features

---

## Example Cursor Workflow

```
1. Paste Command 1 → Review file list
2. Paste Command 2 → Let Cursor update globals.css
3. Test: Refresh browser, verify font loads
4. Paste Command 3 → Let Cursor replace fonts
5. Test: Check all pages use Satoshi
6. Continue through commands...
7. Test after every 2-3 commands
8. Commit to git after each phase
```

---

## If You Need Custom Help

Use this template:
```
@workspace I'm working on Offerloop redesign Phase [X].

Context: [What you're trying to do]
Issue: [What's not working]
Expected: [What should happen]
Current: [What's actually happening]

Files involved: [list files]

Help me fix this while maintaining the design system rules:
- Monochrome + purple gradient only
- No cards, use lists
- Satoshi font
- Generous spacing
- Soft shadows
```

---

## Success!

When you've completed all commands and tests pass, your Offerloop UI will be:
✨ Clean
✨ Intelligent
✨ Distinctive
✨ Fast-feeling
✨ Not generic SaaS

And most importantly: **Everything still works perfectly.**
