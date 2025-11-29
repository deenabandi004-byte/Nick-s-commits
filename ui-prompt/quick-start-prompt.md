# Offerloop UI Redesign - Quick Start Prompt

## TL;DR for Cursor
Transform Offerloop from generic SaaS to Linear-meets-Arc aesthetic. Monochrome + intentional purple gradient. No cards, maximum clarity.

---

## Immediate Actions (Start Here)

### 1. Update Global Styles (5 min)
**File**: Your main CSS file (globals.css, index.css, or App.css)

**Copy-paste this at the top**:
```css
@import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap');

:root {
  /* Monochrome foundation */
  --bg-primary: #FFFFFF;
  --bg-secondary: #FAFAFA;
  --bg-tertiary: #F5F5F5;
  --text-primary: #000000;
  --text-secondary: #666666;
  --text-tertiary: #999999;
  --border-light: #E5E5E5;
  --border-medium: #D4D4D4;
  --border-strong: #A3A3A3;
  
  /* Purple gradient - use sparingly */
  --accent-from: #8B5CF6;
  --accent-to: #D946EF;
  --accent-solid: #A855F7;
  --accent-soft: #F3E8FF;
  
  /* Spacing - generous */
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  
  /* Radius - slightly rounded */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  
  /* Shadows - soft */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.06);
  
  /* Fonts */
  --font-primary: 'Satoshi', system-ui, sans-serif;
}

body {
  font-family: var(--font-primary);
  font-size: 0.875rem;
  color: var(--text-primary);
  background: var(--bg-primary);
}
```

### 2. Primary Button (2 min)
**Find**: All primary button styles
**Replace with**:
```css
.btn-primary {
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: white;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
```

### 3. Remove All Cards (10 min)
**Find**: Components that look like this:
```jsx
<div className="card bg-white rounded-xl shadow-lg p-6">
  Content...
</div>
```

**Replace with**:
```jsx
<div className="list-container">
  <div className="list-item">
    Content...
  </div>
</div>
```

**Add these styles**:
```css
.list-container {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-primary);
}

.list-item {
  padding: var(--space-6);
  border-bottom: 1px solid var(--border-light);
}

.list-item:last-child {
  border-bottom: none;
}

.list-item:hover {
  background: var(--bg-secondary);
}
```

### 4. Input Fields (3 min)
```css
.input {
  font-family: var(--font-primary);
  padding: 12px 16px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
}

.input:focus {
  outline: none;
  border-color: var(--accent-solid);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
```

### 5. Credit Counter (2 min)
```css
.credit-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--accent-from), var(--accent-to));
  color: white;
  border-radius: 9999px;
  font-family: 'SF Mono', monospace;
  font-size: 0.875rem;
  font-weight: 500;
}
```

---

## Quick Cleanup Checklist

**Search entire codebase and delete**:
- [ ] All `linear-gradient` except on: buttons, logo, credit badge
- [ ] Shadow values higher than `0.08` alpha
- [ ] Border-radius values above `12px`
- [ ] Any `font-family` that isn't Satoshi

**Find and replace**:
```
font-family: Inter → font-family: var(--font-primary)
font-family: Roboto → font-family: var(--font-primary)
```

---

## What NOT to Touch
- Firebase auth
- API calls (PDL, OpenAI, Stripe)
- Database logic
- Email generation logic
- Credit calculation
- Any `.js` files with business logic

---

## Verify It Works
After changes:
1. Check authentication still works
2. Search contacts still works
3. Email generation still works
4. No console errors
5. Everything looks cleaner

---

## If You Get Stuck
1. The full detailed guide is in `offerloop-redesign-prompt.md`
2. Focus on ONE component at a time
3. Test after each change
4. Keep functionality intact - only change visuals

## Expected Outcome
Your UI should:
- Use Satoshi font everywhere
- Be mostly black/white/gray
- Have purple gradient ONLY on logo, primary buttons, credit badge
- Use lists instead of cards
- Feel cleaner and more Linear-like
- Still work perfectly
