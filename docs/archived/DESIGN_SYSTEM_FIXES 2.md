# Design System Fixes - Implementation Guide

## ✅ Completed Fixes

### 1. CSS Cleanup & Consolidation ✓
- Removed all unused 3D grid background code (250+ lines)
- Consolidated theme definitions to single source of truth
- Removed duplicate `.dark` definitions
- Reduced CSS file from 1270+ lines to ~550 lines
- Organized into clear sections with comments

### 2. Unified Theme System ✓
- Single theme selector: `[data-theme="dark"]` and `[data-theme="light"]`
- All color tokens use CSS variables
- Consistent glass morphism tokens
- Unified sidebar tokens

### 3. Header Component Update ✓
- Updated to use `glass-nav` class
- Theme-aware styling
- Matches landing page aesthetic
- Consistent gradient button usage

### 4. Button Component Update ✓
- Fixed outline variant to use theme-aware colors
- Enhanced gradient variant
- Better hover states

### 5. Dashboard Page Updates ✓
- Updated background from hardcoded `bg-white` to `bg-background`
- Header uses glass-nav styling

## 🔄 Remaining Work

### High Priority
1. **Dashboard Component Styling**
   - Replace all `bg-white` with `bg-card` or `glass-card`
   - Replace `border-gray-200` with `border-border`
   - Use theme-aware text colors
   - Standardize card padding to `p-6` or `p-8`
   - Standardize border radius to `rounded-xl`

2. **Replace Hardcoded Colors**
   - Search and replace `bg-white` → `bg-card`
   - Search and replace `border-gray-*` → `border-border`
   - Search and replace `text-gray-*` → `text-muted-foreground` or `text-foreground`

3. **Standardize Spacing**
   - Card padding: Use `p-6` (standard) or `p-8` (large)
   - Border radius: Use `rounded-xl` consistently
   - Gaps: Use `gap-4`, `gap-6`, `gap-8` consistently

### Medium Priority
4. **Button Standardization**
   - Replace custom `btn-primary-glass` with Button variant="gradient"
   - Replace custom `btn-secondary-glass` with Button variant="outline"
   - Ensure all buttons use shadcn Button component

5. **Component Consistency**
   - All cards should use glass-card or standard card styling
   - Consistent hover effects
   - Unified shadow system

## 📋 Quick Reference: Class Replacements

```css
/* Background Colors */
bg-white → bg-card (for cards)
bg-white → bg-background (for page backgrounds)

/* Borders */
border-gray-200 → border-border
border-gray-100 → border-border

/* Text Colors */
text-gray-700 → text-foreground
text-gray-600 → text-muted-foreground
text-gray-500 → text-muted-foreground
text-gray-400 → text-muted-foreground

/* Spacing */
p-8 → p-6 (standardize to p-6)
rounded-2xl → rounded-xl (standardize)
```

## 🎨 Design Tokens Reference

### Colors
- Primary: Blue (#3B82F6 / hsl(217 91% 60%))
- Secondary: Light Blue (#60A5FA / hsl(213 94% 68%))
- Accent: Purple (#8B5CF6 / hsl(262 83% 58%))
- Gradient: `from-purple-600 to-indigo-600`

### Glass Cards
- Use `.glass-card` for primary glass cards
- Use `.glass-card-light` for lighter variant
- Background: Theme-aware with backdrop blur
- Border: Theme-aware with blue tint

### Spacing
- Standard padding: `p-6`
- Large padding: `p-8`
- Standard gap: `gap-4`, `gap-6`
- Border radius: `rounded-xl`

## 🔍 Files Needing Updates

1. `src/components/Dashboard.tsx` - Multiple hardcoded colors
2. `src/components/Calendar.tsx` - Check for hardcoded colors
3. `src/components/ContactDirectory.tsx` - Check for consistency
4. `src/pages/*.tsx` - All pages need theme-aware styling

## 📝 Notes

- All changes should maintain functionality
- Test in both light and dark themes
- Ensure WCAG contrast compliance
- Maintain responsive design
