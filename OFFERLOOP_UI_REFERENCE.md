# OFFERLOOP UI REFERENCE PACKAGE
## Complete Design System Documentation for Figma

---

## 1. TAILWIND / UI TOKENS

### Brand Colors (HSL Format)

#### Dark Mode (Default)
```css
/* Backgrounds - Pure Black (Linear Style) */
--bg-primary: 0 0% 0%          /* #000000 - Pure black */
--bg-secondary: 0 0% 4%        /* #0A0A0A - Subtle layer */
--bg-tertiary: 0 0% 8%         /* #141414 - Card background */

/* Text - White on black */
--text-primary: 0 0% 100%      /* #FFFFFF - Pure white */
--text-secondary: 0 0% 64%     /* #A3A3A3 - Muted gray */
--text-tertiary: 0 0% 40%      /* #666666 - Tertiary gray */

/* Borders - Subtle on black */
--border-light: 0 0% 12%       /* #1F1F1F - Subtle divider */
--border-medium: 0 0% 18%      /* #2E2E2E - Medium border */
--border-strong: 0 0% 24%      /* #3D3D3D - Strong border */

/* Purple Gradient - INTENTIONAL USE ONLY */
--accent-from: 271 81% 69%     /* #8B5CF6 - Purple start */
--accent-to: 292 84% 61%       /* #D946EF - Pink end */
--accent-solid: 271 91% 65%    /* #A855F7 - Solid purple */
--accent-soft: 271 71% 20%     /* #2E1065 - Dark purple for backgrounds */
```

#### Light Mode
```css
/* Backgrounds - White */
--bg-primary: 0 0% 100%        /* #FFFFFF - Pure white */
--bg-secondary: 0 0% 98%       /* #FAFAFA - Subtle layer */
--bg-tertiary: 0 0% 96%        /* #F5F5F5 - Card background */

/* Text - Black on white */
--text-primary: 0 0% 0%        /* #000000 - Pure black */
--text-secondary: 0 0% 40%     /* #666666 - Muted gray */
--text-tertiary: 0 0% 60%      /* #999999 - Tertiary gray */

/* Borders - Subtle on white */
--border-light: 0 0% 88%       /* #E0E0E0 - Subtle divider */
--border-medium: 0 0% 82%      /* #D1D1D1 - Medium border */
--border-strong: 0 0% 76%      /* #C2C2C2 - Strong border */

/* Purple Gradient - same */
--accent-soft: 271 71% 90%     /* Light purple for backgrounds */
```

### ShadCN/UI Compatibility Colors
```css
--background: var(--bg-primary)
--foreground: var(--text-primary)
--card: var(--bg-secondary)
--card-foreground: var(--text-primary)
--primary: var(--accent-solid)
--primary-foreground: 0 0% 100%
--secondary: var(--bg-tertiary)
--secondary-foreground: var(--text-primary)
--muted: var(--bg-tertiary)
--muted-foreground: var(--text-secondary)
--accent: var(--accent-soft)
--accent-foreground: var(--text-primary)
--border: var(--border-light)
--input: var(--border-medium)
--ring: var(--accent-solid)
--destructive: 0 84.2% 60.2%
--destructive-foreground: 0 0% 100%
```

### Gradients

#### Primary Purple Gradient (Buttons, CTAs)
```css
background: linear-gradient(135deg, hsl(var(--accent-from)), hsl(var(--accent-to)))
/* Tailwind: bg-gradient-to-r from-[hsl(var(--accent-from))] to-[hsl(var(--accent-to))] */
/* Hex equivalent: #8B5CF6 → #D946EF */
```

#### Pink-Purple Gradient (Progress bars, text highlights)
```css
background: linear-gradient(to right, #EC4899, #A855F7)
/* Tailwind: bg-gradient-to-r from-pink-500 to-purple-500 */
/* Used for: Progress bars, active tab indicators, text gradients */
```

### Shadows

#### Dark Mode
```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3)
--shadow-md: 0 2px 4px rgba(0, 0, 0, 0.4)
--shadow-lg: 0 4px 8px rgba(0, 0, 0, 0.5)
```

#### Light Mode
```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05)
--shadow-md: 0 2px 4px rgba(0, 0, 0, 0.1)
--shadow-lg: 0 4px 8px rgba(0, 0, 0, 0.15)
```

### Border Radius
```css
--radius-sm: 4px
--radius-md: 8px
--radius-lg: 12px
--radius-full: 9999px
--radius: var(--radius-md)  /* Default: 8px */
```

### Spacing Scale
```css
--space-1: 4px    /* 0.25rem */
--space-2: 8px    /* 0.5rem */
--space-3: 12px   /* 0.75rem */
--space-4: 16px   /* 1rem */
--space-6: 24px   /* 1.5rem */
--space-8: 32px   /* 2rem */
--space-12: 48px  /* 3rem */
--space-16: 64px  /* 4rem */
```

### Container Widths
```css
Container: max-w-7xl (1280px) - Most common
Container padding: 2rem (32px)
Container center: true
2xl breakpoint: 1400px
```

---

## 2. TYPOGRAPHY SYSTEM

### Font Family
```css
--font-primary: 'Satoshi', system-ui, -apple-system, sans-serif
--font-mono: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace
```

**Font Import:**
```css
@import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap');
```

### Font Weights
```css
--weight-normal: 400
--weight-medium: 500
--weight-bold: 700
```

### Font Sizes (CSS Variables)
```css
--text-xs: 0.75rem    /* 12px */
--text-sm: 0.875rem   /* 14px */
--text-base: 1rem     /* 16px */
--text-lg: 1.125rem   /* 18px */
--text-xl: 1.5rem     /* 24px */
--text-2xl: 2rem      /* 32px */
```

### Line Heights
```css
--leading-tight: 1.3
--leading-normal: 1.5
--leading-relaxed: 1.7
```

### Letter Spacing
```css
--tracking-tight: -0.02em
--tracking-normal: -0.01em
```

### Heading Styles

#### H1
```css
/* Base styles */
font-size: var(--text-2xl)  /* 32px / 2rem */
font-weight: var(--weight-bold)  /* 700 */
letter-spacing: var(--tracking-tight)  /* -0.02em */
line-height: var(--leading-tight)  /* 1.3 */

/* Common usage */
className: "text-3xl font-semibold text-foreground"  /* Page titles */
className: "text-2xl font-bold text-foreground"      /* Section headers */
```

#### H2
```css
/* Base styles */
font-size: var(--text-xl)  /* 24px / 1.5rem */
font-weight: var(--weight-bold)  /* 700 */
letter-spacing: var(--tracking-tight)  /* -0.02em */
line-height: var(--leading-tight)  /* 1.3 */

/* Common usage */
className: "text-xl font-semibold text-foreground"   /* Subsection headers */
className: "text-lg font-semibold text-foreground"   /* Card titles */
```

#### H3
```css
/* Base styles */
font-size: var(--text-lg)  /* 18px / 1.125rem */
font-weight: var(--weight-medium)  /* 500 */

/* Common usage */
className: "text-lg font-medium text-foreground"
```

### Body Text Styles

#### Large Body
```css
className: "text-base text-foreground leading-relaxed"
/* 16px, normal weight, relaxed line height */
```

#### Regular Body
```css
className: "text-sm text-foreground"
/* 14px, normal weight, normal line height */
```

#### Small Body / Captions
```css
className: "text-xs text-muted-foreground"
/* 12px, muted color for secondary text */
```

#### Muted Text
```css
className: "text-muted-foreground"
/* Uses --text-secondary color */
```

### Typography Examples from Codebase

**Page Title:**
```tsx
<h1 className="text-3xl font-semibold text-foreground">Coffee Chat Prep</h1>
```

**Page Subtitle:**
```tsx
<p className="text-sm text-muted-foreground">Prepare for your networking meetings.</p>
```

**Card Title:**
```tsx
<h2 className="text-lg font-semibold text-foreground">Generate Coffee Chat Prep</h2>
```

**Label:**
```tsx
<label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
  LinkedIn Profile URL
</label>
```

**Body Text:**
```tsx
<p className="text-sm text-foreground leading-relaxed">
  Description text here...
</p>
```

---

## 3. REUSABLE COMPONENTS

### Buttons

#### Primary Button (Default - Purple Gradient)
```tsx
<Button variant="default">
  Button Text
</Button>
```

**Classes:**
```css
bg-gradient-to-br from-[hsl(var(--accent-from))] to-[hsl(var(--accent-to))]
text-white
shadow-sm
hover:shadow-md
hover:-translate-y-0.5
active:scale-[0.98]
h-10 px-4 py-2
rounded-[var(--radius-md)]  /* 8px */
text-sm font-medium
transition-all duration-150
```

**Sizes:**
- `sm`: `h-9 px-3 text-xs`
- `default`: `h-10 px-4 py-2`
- `lg`: `h-11 px-8 text-base`
- `icon`: `h-10 w-10`

#### Secondary Button
```tsx
<Button variant="secondary">
  Secondary
</Button>
```

**Classes:**
```css
bg-[hsl(var(--bg-secondary))]
text-[hsl(var(--text-primary))]
border border-[hsl(var(--border-light))]
hover:bg-[hsl(var(--bg-tertiary))]
hover:border-[hsl(var(--border-medium))]
```

#### Outline Button
```tsx
<Button variant="outline">
  Outline
</Button>
```

**Classes:**
```css
border border-[hsl(var(--border-medium))]
bg-transparent
hover:bg-[hsl(var(--bg-secondary))]
hover:border-[hsl(var(--border-strong))]
```

#### Ghost Button
```tsx
<Button variant="ghost">
  Ghost
</Button>
```

**Classes:**
```css
hover:bg-[hsl(var(--bg-secondary))]
text-[hsl(var(--text-secondary))]
hover:text-[hsl(var(--text-primary))]
```

#### Destructive Button
```tsx
<Button variant="destructive">
  Delete
</Button>
```

**Classes:**
```css
bg-destructive
text-destructive-foreground
hover:bg-destructive/90
shadow-sm
hover:shadow-md
hover:-translate-y-0.5
active:scale-[0.98]
```

#### Upgrade Plan Button (Special CTA)
```tsx
<button className="w-full bg-gradient-to-r from-[hsl(var(--accent-from))] to-[hsl(var(--accent-to))] rounded-xl py-3 px-4 text-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 active:scale-[0.98]">
  <div className="flex items-center justify-center gap-2">
    <Zap className="w-5 h-5 text-white" />
    <span className="font-semibold">Upgrade Plan</span>
  </div>
</button>
```

### Cards

#### Basic Card
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

**Base Classes:**
```css
rounded-lg
border
bg-card
text-card-foreground
shadow-sm
```

**Card Header:**
```css
flex flex-col space-y-1.5 p-6
```

**Card Title:**
```css
text-2xl font-semibold leading-none tracking-tight
```

**Card Description:**
```css
text-sm text-muted-foreground
```

**Card Content:**
```css
p-6 pt-0
```

**Card Footer:**
```css
flex items-center p-6 pt-0
```

#### Card with Custom Styling (Common Pattern)
```tsx
<div className="rounded-2xl bg-card border border-border p-8 space-y-6 shadow-lg">
  {/* Content */}
</div>
```

**Classes:**
```css
rounded-2xl  /* 16px */
bg-card
border border-border
p-8  /* 32px padding */
space-y-6  /* 24px vertical spacing */
shadow-lg
```

### Tabs

#### Tab Container
```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
```

**TabsList Classes:**
```css
inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground
```

**TabsTrigger (Inactive):**
```css
inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium
```

**TabsTrigger (Active - with gradient):**
```css
data-[state=active]:bg-gradient-to-r
data-[state=active]:from-pink-500
data-[state=active]:to-purple-500
data-[state=active]:text-white
data-[state=inactive]:text-muted-foreground
data-[state=inactive]:hover:text-foreground
transition-all
```

**Custom Tab Styling (from pages):**
```css
grid w-full grid-cols-2 max-w-lg bg-muted border border-border p-1 rounded-xl h-14
gap-2 h-12 text-base font-medium
```

### Input Fields

#### Standard Input
```tsx
<Input
  placeholder="Enter text..."
  className="h-12 rounded-xl bg-muted border border-border px-4 text-sm"
/>
```

**Base Classes:**
```css
flex h-10 w-full
rounded-md
border border-input
bg-background
px-3 py-2
text-base
ring-offset-background
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-ring
focus-visible:ring-offset-2
placeholder:text-muted-foreground
md:text-sm
```

**Custom Styling (from forms):**
```css
h-12
rounded-xl
bg-muted
border border-border
px-4
text-sm text-foreground
placeholder:text-muted-foreground
focus-visible:ring-2
focus-visible:ring-primary
focus-visible:border-transparent
```

### Tables

#### Table Structure
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column 1</TableHead>
      <TableHead>Column 2</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Data 1</TableCell>
      <TableCell>Data 2</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**Table Classes:**
```css
w-full caption-bottom text-sm
```

**TableHeader:**
```css
[&_tr]:border-b
```

**TableHead:**
```css
h-12 px-4 text-left align-middle font-medium text-muted-foreground
```

**TableRow:**
```css
border-b transition-colors hover:bg-muted/50
```

**TableCell:**
```css
p-4 align-middle
```

**Table Container (from FirmSearchResults):**
```css
bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border overflow-hidden
```

### Badges

#### Standard Badge
```tsx
<Badge variant="secondary">Badge Text</Badge>
```

**Common Usage:**
```tsx
<Badge variant="secondary" className="bg-muted text-muted-foreground">
  {COFFEE_CHAT_CREDITS} credits
</Badge>
```

---

## 4. LAYOUT PATTERNS

### Page Structure

#### Standard Page Layout
```tsx
<SidebarProvider>
  <div className="min-h-screen flex w-full bg-background">
    <AppSidebar />
    
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <h1 className="text-xl font-semibold text-foreground">Page Title</h1>
          </div>
          <div className="flex items-center">
            <ThemeToggle />
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <main className="flex-1 p-6 relative">
        <div className="max-w-7xl mx-auto h-full">
          {/* Content here */}
        </div>
      </main>
    </div>
  </div>
</SidebarProvider>
```

### Container Widths

**Primary Container:**
```css
max-w-7xl  /* 1280px */
mx-auto    /* Centered */
```

**Content Padding:**
```css
px-4 sm:px-6 lg:px-8  /* Responsive: 16px → 24px → 32px */
py-8                  /* 32px vertical */
```

**Section Spacing:**
```css
space-y-10  /* 40px between sections */
mb-8        /* 32px bottom margin */
```

### Grid Systems

#### Two Column Grid (Common)
```tsx
<div className="grid gap-8 lg:grid-cols-2">
  <div>Left Column</div>
  <div>Right Column</div>
</div>
```

#### Three Column Grid
```tsx
<div className="grid grid-cols-3 gap-4">
  <div>Column 1</div>
  <div>Column 2</div>
  <div>Column 3</div>
</div>
```

### Card Layouts

#### Card Grid (Firm Search Results)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Cards */}
</div>
```

**Card Spacing:**
```css
gap-6  /* 24px between cards */
```

#### Single Card Layout
```tsx
<div className="mx-auto max-w-5xl px-6 py-12 space-y-10">
  <div className="rounded-2xl bg-card border border-border p-8 space-y-6 shadow-lg">
    {/* Card content */}
  </div>
</div>
```

### Spacing Between Sections

**Large Section Gap:**
```css
space-y-10  /* 40px */
mb-16       /* 64px */
```

**Medium Section Gap:**
```css
space-y-6   /* 24px */
mb-8        /* 32px */
```

**Small Section Gap:**
```css
space-y-4   /* 16px */
mb-4        /* 16px */
```

### Sidebar Layout

**Sidebar Width:**
- Expanded: `w-60` (240px)
- Collapsed: `w-20` (80px)

**Sidebar Structure:**
```tsx
<Sidebar className="w-60" collapsible="icon">
  <SidebarContent className="bg-background border-r">
    {/* Brand logo */}
    <div className="p-3 border-b">
      {/* Logo */}
    </div>
    
    {/* Navigation */}
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {/* Menu items */}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>
  
  {/* Footer with credits */}
  <SidebarFooter className="border-t bg-background">
    {/* Credits, upgrade button, user profile */}
  </SidebarFooter>
</Sidebar>
```

---

## 5. COLOR + COMPONENT USAGE EXAMPLES

### Header Typography

**Page Header:**
```tsx
<div className="space-y-2">
  <h1 className="text-3xl font-semibold text-foreground">Coffee Chat Prep</h1>
  <p className="text-sm text-muted-foreground">
    Prepare for your networking meetings.
  </p>
</div>
```

**Section Header:**
```tsx
<div className="flex items-center justify-between pb-4 border-b border-border">
  <div className="flex items-center gap-2">
    <h2 className="text-lg font-semibold text-foreground">Generate Coffee Chat Prep</h2>
    <BetaBadge size="xs" variant="glow" />
  </div>
  <Badge variant="secondary" className="bg-muted text-muted-foreground">
    30 credits
  </Badge>
</div>
```

### Button Gradient Usage

**Primary CTA:**
```tsx
<Button className="h-12 w-full rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl">
  Generate Prep
</Button>
```

**Upgrade Button:**
```tsx
<button className="w-full bg-gradient-to-r from-[hsl(var(--accent-from))] to-[hsl(var(--accent-to))] rounded-xl py-3 px-4 text-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 active:scale-[0.98]">
  <div className="flex items-center justify-center gap-2">
    <Zap className="w-5 h-5 text-white" />
    <span className="font-semibold">Upgrade Plan</span>
  </div>
</button>
```

### Card Layouts

**Main Content Card:**
```tsx
<div className="rounded-2xl bg-card border border-border p-8 space-y-6 shadow-lg">
  <div className="flex items-center justify-between pb-4 border-b border-border">
    <h2 className="text-lg font-semibold text-foreground">Title</h2>
  </div>
  <div className="grid gap-8 lg:grid-cols-2">
    {/* Two column content */}
  </div>
</div>
```

**Info Card (Colored):**
```tsx
<div className="rounded-xl border border-green-500/40 bg-green-500/10 p-5 space-y-3">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold text-green-200 uppercase tracking-wide">
      Contact Snapshot
    </h3>
    <span className="text-xs text-green-300/80">
      Ready for coffee chat
    </span>
  </div>
  <div className="space-y-1 text-sm text-foreground">
    {/* Content */}
  </div>
</div>
```

**Muted Info Card:**
```tsx
<div className="rounded-xl border border-border bg-muted p-5 text-sm text-foreground space-y-3">
  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
    What you'll receive
  </h3>
  <ul className="space-y-2 text-foreground">
    {/* List items */}
  </ul>
</div>
```

### Icon Colors

**Primary Icons:**
```tsx
<Coffee className="h-4 w-4 mr-2" />  /* Default: text-foreground */
```

**Status Icons:**
```tsx
<CheckCircle className="h-4 w-4 text-green-400" />
<XCircle className="h-4 w-4 text-red-400" />
<Loader2 className="h-4 w-4 animate-spin text-blue-400" />
```

**Accent Icons:**
```tsx
<Building2 className="h-5 w-5 text-blue-400" />
```

**Gradient Text Icons:**
```tsx
<Zap className="w-5 h-5 text-white" />  /* Inside gradient buttons */
```

### Table Formatting

**Table Header:**
```tsx
<div className="px-6 py-4 border-b border-border bg-muted">
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-2">
      <Building2 className="h-5 w-5 text-blue-400" />
      <span className="font-medium text-foreground">
        25 firms
      </span>
    </div>
  </div>
</div>
```

**Table Row:**
```tsx
<div className="border-b border-border hover:bg-muted/30 transition-colors">
  <div className="px-6 py-4 grid grid-cols-7 gap-4 items-center">
    {/* Cells */}
  </div>
</div>
```

**Table Cell:**
```tsx
<div className="text-sm text-foreground">
  {/* Content */}
</div>
```

### Progress Bar

**Credit Progress Bar:**
```tsx
<div className="mb-4 w-full h-2 bg-[hsl(var(--border-light))] rounded-full overflow-hidden">
  <div 
    className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
    style={{ width: `${(credits / maxCredits) * 100}%` }}
  />
</div>
```

**Classes:**
```css
w-full h-2
bg-[hsl(var(--border-light))]  /* Track background */
rounded-full
overflow-hidden
/* Fill: */
bg-gradient-to-r from-pink-500 to-purple-500
transition-all duration-300
```

### Status Indicators

**Success:**
```tsx
<div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4">
  <div className="flex items-center gap-2">
    <CheckCircle className="h-4 w-4 text-green-400" />
    <span className="text-sm text-foreground">Success message</span>
  </div>
</div>
```

**Error:**
```tsx
<div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
  <div className="flex items-center gap-2">
    <XCircle className="h-4 w-4 text-red-400" />
    <span className="text-sm text-foreground">Error message</span>
  </div>
</div>
```

**Loading:**
```tsx
<div className="rounded-lg border border-border bg-muted p-4 shadow-inner text-sm text-foreground">
  <div className="flex items-center gap-2">
    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
    <span>Processing your request...</span>
  </div>
</div>
```

---

## 6. SPECIAL PATTERNS

### Overlay with Gradient Background

**Pro Members Only Overlay:**
```tsx
<div 
  className="absolute inset-0 backdrop-blur-sm z-[100] flex items-start justify-center pointer-events-auto pt-32"
  style={{
    background: 'linear-gradient(135deg, rgba(75, 85, 99, 0.75), rgba(100, 100, 100, 0.75), rgba(55, 65, 81, 0.75), rgba(80, 80, 80, 0.75))'
  }}
>
  <div className="text-center space-y-6">
    <div className="w-16 h-16 mx-auto bg-gray-800/80 rounded-full flex items-center justify-center border-2 border-gray-700/80 backdrop-blur-sm">
      <Lock className="w-8 h-8 text-white" />
    </div>
    <p className="text-white text-7xl font-semibold drop-shadow-lg">
      Unlock with <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">Pro</span>
    </p>
    {/* Button */}
  </div>
</div>
```

### Background Blobs (Decorative)

```tsx
<motion.div
  className="absolute -top-32 left-10 w-80 h-80 rounded-full bg-purple-500/20 blur-3xl pointer-events-none"
  animate={{ 
    y: [0, 20, 0], 
    scale: [1, 1.05, 1],
    x: [0, 10, 0]
  }}
  transition={{ 
    duration: 12, 
    repeat: Infinity, 
    ease: "easeInOut" 
  }}
/>
```

**Classes:**
```css
absolute
rounded-full
bg-purple-500/20  /* 20% opacity */
blur-3xl
pointer-events-none
```

### Segmented Control

```tsx
<div className="inline-flex items-center gap-2 rounded-full bg-muted p-1 border border-border relative">
  {/* Animated background indicator */}
  <motion.div
    className="absolute bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg h-12"
    layoutId="activeSegment"
    transition={{ type: "spring", stiffness: 500, damping: 30 }}
    style={{
      width: `${100 / options.length}%`,
      left: `${(selectedIndex / options.length) * 100}%`,
    }}
  />
  {/* Options */}
</div>
```

---

## 7. ANIMATIONS & TRANSITIONS

### Button Hover Effects
```css
hover:shadow-md
hover:-translate-y-0.5  /* Slight lift */
active:scale-[0.98]     /* Press down */
transition-all duration-150
```

### Color Transitions
```css
transition-colors
```

### Smooth Transitions
```css
transition-all duration-300
```

### Animation Timing
```css
transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)
```

---

## 8. FIGMA IMPLEMENTATION NOTES

### Color Setup
1. Create color styles for all HSL values
2. Set up both Dark and Light mode color palettes
3. Create gradient styles for:
   - Primary purple gradient (#8B5CF6 → #D946EF)
   - Pink-purple gradient (#EC4899 → #A855F7)

### Typography Setup
1. Import Satoshi font (400, 500, 700 weights)
2. Create text styles for:
   - H1 (32px, bold, tight tracking)
   - H2 (24px, bold, tight tracking)
   - H3 (18px, medium)
   - Body Large (16px, normal)
   - Body (14px, normal)
   - Small (12px, normal)
   - Muted variants for each

### Component Library
1. Create components for:
   - Buttons (all variants)
   - Cards (with header, content, footer)
   - Inputs
   - Tabs
   - Tables
   - Badges
   - Progress bars

### Spacing System
- Use 4px base unit
- Common spacing: 4, 8, 12, 16, 24, 32, 48, 64px

### Border Radius
- Small: 4px
- Medium: 8px (default)
- Large: 12px
- XL: 16px (rounded-2xl)
- Full: 9999px

### Shadows
- Small: 0 1px 2px rgba(0, 0, 0, 0.3)
- Medium: 0 2px 4px rgba(0, 0, 0, 0.4)
- Large: 0 4px 8px rgba(0, 0, 0, 0.5)

---

## END OF REFERENCE DOCUMENT

This document contains all the design tokens, components, and patterns used in the Offerloop application. Use this as a reference when designing the new Home Page (Dashboard, Outbox, Calendar) in Figma to ensure visual consistency.

