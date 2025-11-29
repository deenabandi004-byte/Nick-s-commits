---
name: offerloop-design
description: Design system for Offerloop - the approachable mentor for professional networking. Creates confidence-building, friendly-yet-professional interfaces for anxious college students and early-career professionals.
---

# Offerloop Design System - "Your Friendly Professional Sidekick"

## Brand Philosophy
Offerloop is the approachable mentor at the networking event who remembers everyone's name and makes introductions feel easy. We're building confidence, not intimidation. Every design decision should ask: "Does this make networking feel less scary?"

## Core Design Principles

### 1. Visual Identity: "Quietly Confident"
- **NO gradients** - they scream "AI-generated" 
- **NO purple-on-dark** - overused in SaaS
- **YES to solid colors with purpose**
- **YES to subtle depth through shadows and layers**

### 2. Color System

#### Light Mode (Primary)
```css
:root {
  /* Base */
  --background: #FAFAF9; /* Warm off-white, not stark */
  --surface: #FFFFFF;
  --surface-elevated: #FFFFFF;
  
  /* Brand Colors - Friendly but Professional */
  --primary: #2563EB; /* Trustworthy blue, not purple */
  --primary-soft: #EFF6FF; /* Gentle blue tint for backgrounds */
  --accent: #10B981; /* Success green - confidence building */
  
  /* Text */
  --text-primary: #1F2937; /* Soft black, easier on eyes */
  --text-secondary: #6B7280;
  --text-muted: #9CA3AF;
  
  /* Interactive States */
  --hover-overlay: rgba(37, 99, 235, 0.04);
  --focus-ring: rgba(37, 99, 235, 0.5);
  
  /* Semantic */
  --success: #10B981;
  --warning: #F59E0B;
  --error: #EF4444;
  
  /* Borders & Dividers */
  --border: #E5E7EB;
  --border-strong: #D1D5DB;
}
```

#### Dark Mode (Sophisticated Night)
```css
:root[data-theme="dark"] {
  /* Base */
  --background: #0F1114; /* Rich dark, not pure black */
  --surface: #1A1D23;
  --surface-elevated: #242830;
  
  /* Brand Colors - Same personality, adapted */
  --primary: #3B82F6; /* Slightly brighter for contrast */
  --primary-soft: #1E3A8A15;
  --accent: #34D399;
  
  /* Text */
  --text-primary: #F3F4F6;
  --text-secondary: #D1D5DB;
  --text-muted: #9CA3AF;
  
  /* Interactive States */
  --hover-overlay: rgba(59, 130, 246, 0.08);
  --focus-ring: rgba(59, 130, 246, 0.5);
  
  /* Borders */
  --border: #2D3139;
  --border-strong: #374151;
}
```

### 3. Typography: "Friendly Authority"

```css
/* NEVER use Inter, Roboto, or system fonts */

@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Space+Mono&display=swap');

:root {
  /* Primary: Outfit - geometric but friendly, professional but approachable */
  --font-primary: 'Outfit', sans-serif;
  
  /* Accent: Space Mono for data/numbers - builds trust through precision */
  --font-mono: 'Space Mono', monospace;
  
  /* Sizing - Generous for readability */
  --text-xs: 0.8125rem;   /* 13px */
  --text-sm: 0.9375rem;   /* 15px */
  --text-base: 1.0625rem; /* 17px - slightly larger for confidence */
  --text-lg: 1.25rem;     /* 20px */
  --text-xl: 1.5rem;      /* 24px */
  --text-2xl: 2rem;       /* 32px */
  
  /* Spacing - Breathable */
  --leading-normal: 1.6;
  --leading-tight: 1.4;
  --tracking-normal: -0.01em;
  --tracking-wide: 0.02em;
}
```

### 4. Component Patterns

#### Buttons: "Encouraging Actions"
```css
.btn-primary {
  background: var(--primary);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem; /* Soft, not sharp */
  font-weight: 500;
  font-size: var(--text-base);
  transition: all 0.2s ease;
  border: 2px solid transparent;
  letter-spacing: var(--tracking-normal);
}

.btn-primary:hover {
  transform: translateY(-1px); /* Subtle lift */
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
}

/* Secondary buttons have borders for hierarchy */
.btn-secondary {
  background: transparent;
  color: var(--primary);
  border: 2px solid var(--border-strong);
}

.btn-secondary:hover {
  background: var(--hover-overlay);
  border-color: var(--primary);
}
```

#### Cards: "Organized Comfort"
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem; /* Friendly corners */
  padding: 1.5rem;
  transition: all 0.15s ease;
}

.card:hover {
  border-color: var(--border-strong);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* Interactive cards lift slightly */
.card-interactive:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
}
```

#### Forms: "Guided Input"
```css
.input {
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: var(--text-base);
  transition: all 0.15s ease;
}

.input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

/* Placeholder encouragement */
.input::placeholder {
  color: var(--text-muted);
  /* Examples: "e.g. Software Engineer" not just "Job Title" */
}
```

### 5. Interaction Patterns

#### Micro-animations: "Reassuring Feedback"
```css
/* Smooth, not jarring */
* {
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Loading states that reduce anxiety */
@keyframes pulse-gentle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.loading {
  animation: pulse-gentle 2s infinite;
}

/* Success celebrations - subtle */
@keyframes success-bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.success-indicator {
  animation: success-bounce 0.5s ease;
}
```

#### Progress Indicators: "You're Getting There"
```css
.progress-bar {
  background: var(--primary-soft);
  height: 0.5rem;
  border-radius: 0.25rem;
  overflow: hidden;
}

.progress-fill {
  background: var(--primary);
  height: 100%;
  border-radius: 0.25rem;
  transition: width 0.3s ease;
  /* Add shimmer effect for active progress */
  background-image: linear-gradient(
    90deg,
    var(--primary),
    var(--accent),
    var(--primary)
  );
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}
```

### 6. Unique Offerloop Elements

#### Credit Counter: "Gamified but Professional"
```css
.credit-display {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  color: var(--text-primary);
  background: var(--primary-soft);
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  border: 2px solid var(--primary);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.credit-display::before {
  content: "⚡";
  font-size: 1.25em;
}
```

#### Empty States: "Encouraging First Steps"
```css
.empty-state {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--text-secondary);
}

.empty-state-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

/* Encouraging language in empty states */
/* "Ready to make your first connection?" not "No contacts found" */
```

#### Navigation: "Clear Wayfinding"
```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  color: var(--text-secondary);
  font-weight: 500;
  transition: all 0.15s ease;
  position: relative;
}

.nav-item:hover {
  background: var(--hover-overlay);
  color: var(--text-primary);
  transform: translateX(2px); /* Subtle direction */
}

.nav-item.active {
  background: var(--primary-soft);
  color: var(--primary);
}

/* Active indicator - friendly blob, not harsh line */
.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 24px;
  background: var(--primary);
  border-radius: 0 2px 2px 0;
}
```

### 7. Content Tone Guidelines

#### Microcopy: "Your Encouraging Friend"
- ✅ "Let's find your next connection" 
- ❌ "Search database"

- ✅ "Nice! Email drafted and ready" 
- ❌ "Email generated successfully"

- ✅ "You're all set!" 
- ❌ "Process complete"

#### Error Messages: "Helpful, Not Harsh"
- ✅ "Let's try that again - email needs an @ symbol" 
- ❌ "Invalid email format"

- ✅ "Oops, we couldn't find that. Try different keywords?" 
- ❌ "No results found"

### 8. Accessibility: "Inclusive Confidence"
- Minimum contrast ratio: 4.5:1 for body text
- Focus indicators always visible
- All interactive elements minimum 44x44px tap target
- Descriptive labels that guide, not confuse
- Loading states announced to screen readers

### 9. Layout Principles
- **Breathing room**: Generous padding (minimum 1.5rem)
- **Clear hierarchy**: Maximum 3 levels of visual importance
- **Predictable patterns**: Consistency builds confidence
- **Progressive disclosure**: Don't overwhelm, reveal complexity gradually

## Implementation Notes

1. **Remove ALL gradients** from the existing UI
2. **Replace purple with trustworthy blue** 
3. **Add subtle depth through shadows**, not color transitions
4. **Use animation sparingly** - only for feedback and delight
5. **Test with real anxious students** - is this reducing or adding stress?

## Example Component Structure

```jsx
// A confidence-building search experience
<div className="search-container">
  <div className="search-header">
    <h2 className="search-title">Who would you like to connect with?</h2>
    <p className="search-subtitle">We'll help you find the perfect person</p>
  </div>
  
  <div className="search-filters">
    <input 
      className="input input-primary"
      placeholder="e.g. Product Manager at Google"
      aria-label="Job title and company"
    />
    <button className="btn-primary">
      Find Connections
      <span className="btn-icon">→</span>
    </button>
  </div>
  
  <div className="search-suggestions">
    <span className="suggestion-label">Popular searches:</span>
    <div className="suggestion-chips">
      {/* Clickable, encouraging suggestions */}
    </div>
  </div>
</div>
```

Remember: Every pixel should make networking feel less scary and more achievable. We're not just building a tool, we're building confidence.
