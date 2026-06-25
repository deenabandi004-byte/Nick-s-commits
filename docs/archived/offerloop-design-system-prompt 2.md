# Offerloop Design System Unification Prompt

## Context
I have a React/TypeScript SaaS application (Offerloop) with a beautiful landing page that uses a glassmorphism design system with teal/cyan gradients. I need to update ALL other pages and components to match this exact aesthetic.

## Current Landing Page Design System

### Color Palette
```
Primary Gradient: teal-400 → cyan-400 → blue-400
Background (Dark): Deep teal-black (#0a2e2e → #0d3838 → #0a2a2a)
Background (Light): Uses CSS variable --background with proper light mode adaptation
Text Primary (Dark): white / gray-300
Text Primary (Light): slate-900 / slate-700
Text Secondary (Dark): gray-400
Text Secondary (Light): slate-600
Accent: blue-400 (dark) / blue-600 (light), cyan-400/cyan-600
```

### Glass Card Styles
The landing page uses these glass card CSS classes that need to be applied consistently:

```css
/* Primary glass card */
.glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  /* Light mode variant */
  /* background: rgba(255, 255, 255, 0.7); */
  /* border: 1px solid rgba(148, 163, 184, 0.2); */
}

/* Lighter glass variant */
.glass-card-light {
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* Navigation glass */
.glass-nav {
  background: rgba(10, 30, 30, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
```

### Button Styles
```css
/* Primary button with gradient */
.btn-primary-glass {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(6, 182, 212, 0.9));
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  border-radius: 1rem; /* rounded-2xl */
  transition: all 0.3s;
}

.btn-primary-glass:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(6, 182, 212, 0.3);
}

/* Secondary button */
.btn-secondary-glass {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: white;
  border-radius: 0.75rem;
}

.btn-secondary-glass:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}
```

### Typography Classes
```css
.text-hero { font-size: clamp(3rem, 8vw, 6rem); font-weight: 800; }
.text-display-lg { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 700; }
.gradient-text-teal { 
  background: linear-gradient(135deg, #2dd4bf, #22d3ee, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.text-autopilot-gradient {
  background: linear-gradient(90deg, #5eead4, #22d3ee, #60a5fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### Glow Effects
```css
.glow-teal {
  box-shadow: 0 0 40px rgba(6, 182, 212, 0.15),
              0 0 80px rgba(6, 182, 212, 0.08);
}

.pulse-glow {
  animation: pulse-glow 3s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(6, 182, 212, 0.3); }
  50% { box-shadow: 0 0 40px rgba(6, 182, 212, 0.5), 0 0 60px rgba(59, 130, 246, 0.3); }
}
```

### Transitions & Hover Effects
```css
.link-slide {
  position: relative;
}
.link-slide::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 1px;
  background: linear-gradient(90deg, #3b82f6, #22d3ee);
  transition: width 0.3s ease;
}
.link-slide:hover::after {
  width: 100%;
}
```

## Task: Update All Pages & Components

Please update the following pages/components to match this exact design system:

### 1. Authentication Pages (SignIn, SignUp, ForgotPassword)
- Replace solid backgrounds with `DynamicGradientBackground` component
- Use `glass-card` for form containers
- Apply `btn-primary-glass` to submit buttons
- Style inputs with glass effect borders
- Use proper text colors: `text-white dark:text-white text-slate-900 dark:text-white` for headings
- Apply `gradient-text-teal` for accent text

### 2. Dashboard/Main App Pages
- Add `DynamicGradientBackground` as the base layer
- Replace all card components with `glass-card` styling
- Update sidebar/navigation to use `glass-nav` style
- Apply consistent hover states with `glow-teal` effects
- Use `rounded-2xl` or `rounded-3xl` for major containers

### 3. All Form Components
- Inputs: glass effect with `bg-white/5 border border-white/10 focus:border-blue-400/50`
- Labels: `text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300`
- Focus rings: Replace with `focus:ring-blue-400/30`

### 4. Modal/Dialog Components
- Apply `glass-card` styling with stronger blur
- Border: `border border-white/10`
- Background overlay: `bg-black/60 backdrop-blur-sm`

### 5. Table/List Components
- Table container: `glass-card rounded-2xl overflow-hidden`
- Table headers: `bg-white/5 text-gray-300`
- Table rows: `border-b border-white/5 hover:bg-white/5`
- Alternating rows optional: `even:bg-white/[0.02]`

### 6. Status Badges/Tags
```jsx
// Success
<span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
  
// Warning  
<span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">

// Error
<span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">

// Info/Default
<span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
```

### 7. Icons & Interactive Elements
- Default icon color: `text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400`
- Icon hover: `hover:text-blue-400 transition-colors`
- Interactive containers: Add `group` class and use `group-hover:` for coordinated effects

## Theme-Aware Pattern to Apply Everywhere

For any text element, apply this pattern:
```jsx
// Headings
className="text-white dark:text-white text-slate-900 dark:text-white"

// Body text
className="text-gray-300 dark:text-gray-300 text-slate-700 dark:text-gray-300"

// Secondary/muted text
className="text-gray-400 dark:text-gray-400 text-slate-600 dark:text-gray-400"

// Borders
className="border-white/5 dark:border-white/5 border-slate-300/20 dark:border-white/5"
```

## Component Wrappers to Create/Update

### 1. Create a reusable `GlassCard` component:
```tsx
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

export const GlassCard = ({ children, className = '', glow = false }: GlassCardProps) => (
  <div className={`glass-card rounded-2xl ${glow ? 'glow-teal' : ''} ${className}`}>
    {children}
  </div>
);
```

### 2. Create a `PageWrapper` component for consistent page layouts:
```tsx
export const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen text-foreground bg-background transition-colors duration-300">
    <DynamicGradientBackground />
    <div className="relative z-10">
      {children}
    </div>
  </div>
);
```

## Files to Update (in priority order)
1. `src/index.css` or `globals.css` - Add all glass CSS classes if not present
2. All page components in `src/pages/`
3. All reusable components in `src/components/`
4. Any UI library wrapper components (shadcn/ui overrides)

## Important Notes
- Preserve all existing functionality
- Maintain the ThemeContext integration (light/dark mode support)
- Keep the `DynamicGradientBackground` component as the base background layer
- Ensure all transitions use `transition-all duration-300` or similar for smooth effects
- Test both light and dark modes after changes

Please go through each file systematically and update the styling to match this design system. Start with the global CSS file, then move to individual components.
