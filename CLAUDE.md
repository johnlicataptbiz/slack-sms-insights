# CLAUDE.md - Design System & Figma Integration Rules

**Last Updated:** March 20, 2026

This document defines the design system architecture and patterns for PT Biz SMS Insights, providing rules for AI-assisted code generation and Figma design integration via Model Context Protocol (MCP).

---

## 1. Token Definitions

### 1.1 Location & Format

**Primary Location:** [frontend/src/styles/tokens.css](frontend/src/styles/tokens.css)

Design tokens are defined using CSS custom properties (CSS variables) with `@theme` block in Tailwind CSS v4 format.

**Structure:**
```css
@theme {
  /* Brand Colors */
  --color-brand-jack: #11b8d6;
  --color-brand-brandon: #13b981;
  --color-brand-warn: #f59d0d;
  --color-brand-danger: #ef4c62;
  --color-brand-ink: #0c1429;

  /* Border Radius */
  --radius-control: 0.62rem;
  --radius-panel: 0.9rem;
  --radius-chip: 999px;

  /* Shadows */
  --shadow-surface: 0 8px 24px rgba(12, 20, 41, 0.12);
  --shadow-floating: 0 18px 40px rgba(12, 20, 41, 0.2);

  /* Spacing */
  --spacing-control-x: 0.75rem;
  --spacing-control-y: 0.55rem;
}
```

### 1.2 V2 Design Tokens

Modern V2 app uses expanded token set in [frontend/src/v2/v2.css](frontend/src/v2/v2.css):

**Typography:**
```css
--v2-font-display: "Poppins", "Sohne", sans-serif;    /* Section headings */
--v2-font-ui: "Sohne", "Inter", sans-serif;           /* Main UI text */
--v2-font-mono: "JetBrains Mono", ui-monospace;       /* Code/data */
```

**Spacing Scale (8px base):**
```css
--v2-space-1: 0.25rem;  /* 4px */
--v2-space-2: 0.5rem;   /* 8px */
--v2-space-3: 0.75rem;  /* 12px */
--v2-space-4: 1rem;     /* 16px */
--v2-space-5: 1.5rem;   /* 24px */
--v2-space-6: 2rem;     /* 32px */
```

**Border Radius Scale:**
```css
--v2-radius-sm: 0.55rem;     /* 8.8px - inputs */
--v2-radius-md: 0.9rem;      /* 14.4px - panels */
--v2-radius-lg: 1.2rem;      /* 19.2px - cards */
--v2-radius-xl: 1.8rem;      /* 28.8px - large elements */
```

**Color Palette (V2):**
```css
/* Grays - Dark mode base */
--v2-base-900: #050913;      /* Darkest */
--v2-base-800: #0a1528;
--v2-base-700: #13223c;

/* Light mode surfaces */
--v2-surface: #f8fafc;       /* Main background */
--v2-surface-elev: #ffffff;  /* Elevated surfaces */
--v2-surface-2: rgba(255, 255, 255, 0.95);

/* Text & Semantic */
--v2-text: #0f1419;
--v2-muted: #626d7a;
--v2-border: rgba(15, 20, 25, 0.08);

/* Status Colors */
--v2-accent: #0ea5e9;        /* Primary action */
--v2-accent-strong: #0284c7; /* Emphasize */
--v2-accent-soft: #38bdf8;   /* Subtle */
--v2-positive: #16a34a;      /* Success */
--v2-critical: #e11d48;      /* Error/Danger */
--v2-warning: #f59d0d;       /* Alert */
```

**Shadows:**
```css
--v2-shadow-1: 0 8px 24px rgba(8, 12, 29, 0.08);
--v2-shadow-2: 0 18px 45px rgba(8, 12, 29, 0.12);
--v2-shadow-elevated: 0 20px 50px rgba(8, 12, 29, 0.18);
```

### 1.3 Token Usage Rules

- ✅ Always use semantic tokens (e.g., `--v2-accent`) not hardcoded hex values
- ✅ Use the spacing scale for margins, padding, gaps
- ✅ Apply consistent border radius from the scale (no arbitrary values)
- ❌ Never hardcode color values directly in components
- ❌ Don't create new color variables without design review

---

## 2. Component Library

### 2.1 Component Architecture

**Tier 1: Primitive Components** (Radix UI + Tailwind)
- Location: [frontend/src/components/ui/](frontend/src/components/ui/)
- Exported Radix components with Tailwind styling
- Examples: `Button`, `Card`, `Input`, `DropdownMenu`, `Select`, `Tabs`

```typescript
// frontend/src/components/ui/button.tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

**Tier 2: V2 UI Primitives** (Foundation layer)
- Location: [frontend/src/v2/components/V2Primitives.tsx](frontend/src/v2/components/V2Primitives.tsx)
- Custom components built for V2 experience
- `V2Panel`, `V2State`, `V2Sparkline`, `V2Loading`

```typescript
// Example V2 Panel usage
<V2Panel 
  title="Analytics"
  caption="Last 30 days"
  className="V2Panel--glass"
>
  {/* content */}
</V2Panel>
```

**Tier 3: Composite Components** (Domain-specific)
- Location: [frontend/src/v2/components/](frontend/src/v2/components/)
- Examples: `MetricCarousel`, `DateRangePicker`, `SequencePerformanceTable`

### 2.2 Radix UI Integration

All primitive components wrap Radix UI with Tailwind styling.

**Installed Radix Packages:**
```json
{
  "@radix-ui/react-accordion": "^1.2.12",
  "@radix-ui/react-alert-dialog": "^1.1.15",
  "@radix-ui/react-avatar": "^1.1.11",
  "@radix-ui/react-checkbox": "^1.3.3",
  "@radix-ui/react-dialog": "^1.1.15",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-icons": "^1.3.2",
  "@radix-ui/react-label": "^2.1.8",
  "@radix-ui/react-popover": "^1.1.15",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-slider": "^1.3.6",
  "@radix-ui/react-switch": "^1.2.6",
  "@radix-ui/react-tabs": "^1.1.13",
  "@radix-ui/react-toast": "^1.2.15",
  "@radix-ui/react-toggle": "^1.1.10",
  "@radix-ui/react-toggle-group": "^1.1.11",
  "@radix-ui/react-tooltip": "^1.2.8"
}
```

### 2.3 Component Documentation Pattern

Composite components should follow this structure:

```typescript
export interface MyComponentProps {
  title: string;
  data: DataPoint[];
  variant?: "primary" | "secondary";
  isLoading?: boolean;
}

export function MyComponent({ 
  title, 
  data, 
  variant = "primary",
  isLoading 
}: MyComponentProps) {
  // Implementation
}
```

⚠️ **Always export interfaces** for component props to enable Code Connect mapping in Figma.

---

## 3. Frameworks & Libraries

### 3.1 Core Stack

| Layer | Technology | Version | Config |
|-------|-----------|---------|--------|
| **Frontend Framework** | React | 19 | JSX with TypeScript |
| **Build Tool** | Vite | - | [vite.config.ts](frontend/vite.config.ts) |
| **Styling** | Tailwind CSS | v4 | Uses `@tailwindcss/vite` plugin |
| **CSS-in-JS** | - | - | Pure CSS + Tailwind (no CSS-in-JS) |
| **Component Primitives** | Radix UI | Latest | Unstyled, composable |
| **Icon Library** | lucide-react | - | SVG-based, tree-shakeable |
| **Animation** | Framer Motion | - | Page transitions & micro-interactions |
| **Data Fetching** | @tanstack/react-query | v5 | Caching & synchronization |
| **UI Components** | sonner | - | Toast notifications |
| **Form Handling** | @hookform/resolvers | v5 | React Hook Form validation |
| **Charts** | @react-three/fiber | v9 | 3D visualizations |
| **Table** | @tanstack/react-table | v8 | Headless table library |
| **Utilities** | clsx, tailwind-merge | - | Class name composition |

### 3.2 Build Configuration

**Vite Alias:**
```typescript
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
    "@/v2": path.resolve(__dirname, "./src/v2"),
  },
}
```

**Import Path Convention:**
```typescript
// ✅ Correct
import { Button } from "@/components/ui/button";  // Legacy
import { V2Panel } from "@/v2/components/V2Primitives";  // V2

// ❌ Avoid relative imports for shared components
// import { Button } from "../../components/ui/button";
```

### 3.3 TypeScript Configuration

**Compiler Options:**
```json
{
  "target": "ES2020",
  "module": "ESNext",
  "jsx": "react-jsx",
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "moduleResolution": "bundler",
  "resolveJsonModule": true
}
```

✅ **Strict mode enforced** - All code must pass TypeScript strict type checking.

---

## 4. Asset Management

### 4.1 Asset Storage

**Public Assets:**
- Location: [frontend/public/assets/](frontend/public/assets/)
- Organized by kit/feature (e.g., `sms-kit/`)
- Served via `<img src="/assets/path/to/file" />`

**Project Assets:**
- Location: [frontend/src/assets/](frontend/src/assets/)
- For assets bundled with code
- Imported as modules: `import logo from "@/assets/ptbiz-logo-sm.jpg"`

### 4.2 Asset Optimization

**Format Policy:**
- PNG/JPG for photography/detailed graphics
- WebP for performance (automatic fallback via `<picture>` tag)
- SVG for icons & vectors (preferred)

**Size Guidelines:**
- Hero images: < 500KB (use WebP + compression)
- UI graphics: < 100KB
- Icons: < 10KB as SVG or < 5KB as PNG sprite

**Example Usage:**
```typescript
// Responsive image with WebP
<picture>
  <source srcSet="/assets/sms-kit/banner.webp" type="image/webp" />
  <img src="/assets/sms-kit/banner.png" alt="SMS Banner" />
</picture>
```

### 4.3 SMS Kit Assets

Located at: [frontend/public/assets/sms-kit/](frontend/public/assets/sms-kit/)

Includes:
- Banners: `*banner*.{png,webp}`
- Dividers: `divider*.{png,webp}`
- Backgrounds: `pattern*.{png,webp}`, `*background*.{webp}`
- Logos & badges: `ptbiz_sms_*`, `logo*.{png,webp}`
- Hero images: `herobanner*.{png,webp}`, `sms_growth_*.{png,webp}`

**Import Pattern:**
```typescript
// Static URL
<img src="/assets/sms-kit/ptbiz_sms_logo_badge.png" alt="Badge" />

// Dynamic path
const assetUrl = `/assets/sms-kit/${imageName}.png`;
```

---

## 5. Icon System

### 5.1 Icon Library: Lucide React

**Package:** `lucide-react`
- SVG-based, tree-shakeable
- ~1000+ icons in single package
- Consistent stroke weight & sizing
- Built-in TypeScript support

### 5.2 Icon Usage

**Individual Icon Import:**
```typescript
import { 
  ChevronDown, 
  AlertTriangle, 
  TrendingUp, 
  Loader2,
  Inbox as InboxIcon 
} from "lucide-react";

export function MyComponent() {
  return (
    <>
      <ChevronDown size={20} />
      <AlertTriangle className="text-destructive" />
      <TrendingUp strokeWidth={2.5} />
      <Loader2 className="animate-spin" />
    </>
  );
}
```

**Icon Props:**
```typescript
interface LucideIconProps {
  size?: number;           // Default: 24
  strokeWidth?: number;    // Default: 2
  className?: string;      // Tailwind classes
  color?: string;          // hex color override
  absoluteStrokeWidth?: boolean;
}
```

### 5.3 Radix UI Icons

**Package:** `@radix-ui/react-icons` (legacy)
- Used in some older components
- Single-color icons, consistent design
- Can be mixed with Lucide React

```typescript
import { ChevronDownIcon, DotIcon } from "@radix-ui/react-icons";
```

### 5.4 Icon Naming Convention

- Use **PascalCase** for all icon imports
- Alias icon imports if name conflicts exist
- Store icon size as constants:

```typescript
const ICON_SIZE = 20;  // Small icons
const ICON_SIZE_LG = 24; // Default
const ICON_SIZE_XL = 32; // Large

<ChevronDown size={ICON_SIZE} />
```

---

## 6. Styling Approach

### 6.1 Tailwind CSS v4

**Architecture:** Utility-first CSS with custom theme configuration

**Main Files:**
- [frontend/src/styles/globals.css](frontend/src/styles/globals.css) - Tailwind framework + custom properties
- [frontend/src/styles/tokens.css](frontend/src/styles/tokens.css) - Brand design tokens
- [frontend/src/styles/utilities.css](frontend/src/styles/utilities.css) - Custom utility classes
- [frontend/src/v2/v2.css](frontend/src/v2/v2.css) - V2 design system variables & classes

**Import Structure:**
```css
/* globals.css */
@import "tailwindcss";           /* Tailwind framework */
@import "./tokens.css";          /* Brand tokens */
@import "./utilities.css";       /* Custom utilities */

@theme {
  /* CSS custom properties for Tailwind theme */
  --color-border: hsl(var(--border));
  --radius-lg: var(--radius);
  /* ... */
}
```

### 6.2 CSS Utility Pattern (Tailwind v4)

Modern utility-based CSS utilities for V2:

**Reusable Patterns:**
```css
/* frontend/src/styles/utilities.css */

@utility tw-surface {
  border-radius: var(--radius-panel);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  box-shadow: var(--shadow-surface);
}

@utility tw-field {
  border-radius: var(--radius-control);
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  padding-inline: var(--spacing-control-x);
  padding-block: var(--spacing-control-y);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

@utility tw-focus-ring {
  &:focus-visible {
    outline: none;
    border-color: color-mix(in srgb, hsl(var(--ring)) 70%, hsl(var(--border)) 30%);
    box-shadow: 0 0 0 3px color-mix(in srgb, hsl(var(--ring)) 26%, transparent 74%);
  }
}
```

**Usage in Components:**
```html
<div class="tw-surface tw-focus-ring">
  <input class="tw-field tw-field-sm" />
</div>
```

### 6.3 Class Composition Helper

**Function:** `cn()` in [frontend/src/lib/utils.ts](frontend/src/lib/utils.ts)

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Purpose:** Correctly merge Tailwind classes while handling conflicts

**Usage:**
```typescript
// Component with Tailwind integration
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated";
}

export function Card({ variant = "default", className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        variant === "elevated" && "shadow-lg",
        className  // User overrides applied last
      )}
      {...props}
    />
  );
}
```

### 6.4 Theme Provider (Light/Dark Mode)

**Location:** [frontend/src/components/theme-provider.tsx](frontend/src/components/theme-provider.tsx)

```typescript
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
      return
    }
    
    root.classList.add(theme)
  }, [theme])

  // ...
}
```

**Usage:**
```typescript
// In main.tsx
import { ThemeProvider } from "@/components/theme-provider"

<ThemeProvider storageKey="vite-ui-theme">
  <App />
</ThemeProvider>
```

### 6.5 Global Styles

**Feature-specific CSS Files** (one per major feature):
- [frontend/src/styles/App.css](frontend/src/styles/App.css) - App layout
- [frontend/src/styles/Login.css](frontend/src/styles/Login.css) - Login page
- [frontend/src/styles/Dashboard.css](frontend/src/styles/Dashboard.css) - Dashboard layout
- [frontend/src/styles/Sequences.css](frontend/src/styles/Sequences.css) - Sequences app

**Naming Convention:**
- File name matches component name: `MyComponent.tsx` → `MyComponent.css`
- Local scope via class names: `.MyComponent`, `.MyComponent__element`
- Example: `.V2Shell`, `.V2Shell__sidebar`, `.V2Shell__content`

### 6.6 V2 Custom Class System

Semantic class-based styling for V2 dashboard:

**Layout Classes:**
- `.V2Shell` - Main app container
- `.V2Shell__sidebar` - Left navigation
- `.V2Shell__content` - Main content area
- `.V2Page` - Full-page component wrapper

**Component Classes:**
- `.V2Panel` - Card/panel container
- `.V2Panel--glass` - Glassmorphism effect
- `.V2MetricCard` - Metric display card
- `.V2Table` - Table wrapper
- `.V2Button` - Custom button styling

**Effect Classes:**
- `.V2Shimmer` - Loading shimmer animation
- `.V2CardLift` - Card hover lift effect
- `.V2PulseGlow` - Pulsing glow animation
- `.V2Stagger` - Staggered children animation

**Animation Keyframes Defined:**
```css
@keyframes v2-shimmer { /* Loading effect */ }
@keyframes v2-float { /* Floating animation */ }
@keyframes v2-pulse-glow { /* Glow pulse */ }
@keyframes v2-page-enter { /* Page transition */ }
@keyframes v2-status-pulse { /* Status indicator */ }
```

### 6.7 Responsive Design

**Tailwind Breakpoints (default + custom):**
```
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

**V2 Custom Breakpoints:**
```css
/* V2-specific responsive behaviors */
@media (width >= 760px) { /* Tablet */  }
@media (width >= 1080px) { /* Desktop */ }
@media (width >= 1400px) { /* Wide */ }
```

**Usage Pattern:**
```html
<!-- Tailwind responsive classes -->
<div class="p-4 md:p-6 lg:p-8">
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <!-- Responsive grid -->
  </div>
</div>
```

### 6.8 CSS-in-JS Approach

❌ **No CSS-in-JS libraries used** (styled-components, Emotion, etc.)

**Why:**
- Tailwind provides server-side rendering efficiency
- Reduced runtime overhead
- Better IDE support for class names
- Easier to maintain design tokens

---

## 7. Project Structure

### 7.1 Directory Organization

```
frontend/
├── public/                          # Static assets
│   ├── index.html                   # Entry point
│   └── assets/
│       ├── sms-kit/                 # Branded asset collection
│       │   ├── *banner*.{png,webp}
│       │   ├── *divider*.{png,webp}
│       │   ├── ptbiz_*.{png,webp}
│       │   └── ...
│       └── *.jpg
│
├── src/
│   ├── main.tsx                     # React entry point
│   ├── App.tsx                      # Root app component
│   ├── uiMode.ts                    # UI mode configuration
│   ├── firebase.ts                  # Firebase config
│   ├── setupTests.ts                # Test setup
│   ├── vite-env.d.ts                # Vite type definitions
│   │
│   ├── api/                         # API integration
│   │   ├── client.ts                # API client setup
│   │   ├── queries.ts               # React Query hooks
│   │   ├── types.ts                 # API response types
│   │   └── useEventStream.ts        # WebSocket streaming
│   │
│   ├── components/                  # Reusable components
│   │   ├── ui/                      # Primitive UI (Radix + Tailwind)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── table.tsx
│   │   │   └── ...
│   │   ├── v2/                      # V2 specific components
│   │   │   ├── CampaignsTable.tsx
│   │   │   ├── Header.tsx
│   │   │   └── ...
│   │   ├── insights/                # Feature: Insights
│   │   ├── theme-provider.tsx       # Theme context
│   │   ├── PasswordGate.tsx         # Auth wrapper
│   │   ├── Login.tsx                # Login page
│   │   ├── RunDetail.tsx            # Run details view
│   │   ├── RunList.tsx              # Runs list view
│   │   └── ...
│   │
│   ├── lib/                         # Utility functions
│   │   └── utils.ts                 # cn() helper
│   │
│   ├── styles/                      # Global CSS
│   │   ├── globals.css              # Tailwind framework setup
│   │   ├── tokens.css               # Brand design tokens
│   │   ├── utilities.css            # Custom utility classes
│   │   ├── App.css                  # App layout styles
│   │   ├── Dashboard.css
│   │   ├── Sequences.css
│   │   ├── Login.css
│   │   ├── RunDetail.css
│   │   ├── RunList.css
│   │   ├── DataPages.css
│   │   ├── Insights.css
│   │   ├── RepScorecard.css
│   │   └── PasswordGate.css
│   │
│   ├── utils/                       # Feature utilities
│   │   └── [domain-specific utilities]
│   │
│   ├── v2/                          # V2 Dashboard (modern UI)
│   │   ├── V2App.tsx                # V2 router & shell
│   │   ├── v2.css                   # V2 design system CSS
│   │   ├── IMPLEMENTATION_TODO.md
│   │   │
│   │   ├── components/              # V2 components
│   │   │   ├── V2Primitives.tsx     # Foundation primitives
│   │   │   ├── V2Loading.tsx        # Loading spinners
│   │   │   ├── MetricCarousel.tsx   # Metric showcase
│   │   │   ├── DateRangePicker.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── ...
│   │   │
│   │   ├── pages/                   # Route pages
│   │   │   ├── InsightsV2.tsx       # Analytics dashboard
│   │   │   ├── RunsV2.tsx           # Runs history
│   │   │   ├── SequencesV2.tsx      # SMS sequences
│   │   │   └── InboxV2.tsx          # Message inbox
│   │   │
│   │   ├── layout/                  # Layout components
│   │   │   ├── V2Shell.tsx          # App shell (sidebar + main)
│   │   │   └── ...
│   │   │
│   │   ├── hooks/                   # V2-specific hooks
│   │   │   └── [custom hooks]
│   │   │
│   │   ├── styles/                  # V2 CSS modules
│   │   │   ├── components.css       # Issue-specific components
│   │   │   └── ...
│   │   │
│   │   ├── utils/                   # V2 utilities
│   │   │   ├── motion.ts            # Framer Motion config
│   │   │   └── [domain utils]
│   │   │
│   │   └── copy.ts                  # Copywriting & text constants
│   │
│   └── assets/                      # Bundled assets
│       └── *.jpg
│
├── vite.config.ts                   # Vite build configuration
├── tsconfig.json                    # TypeScript config
├── tsconfig.v2.json                 # V2 TypeScript config
├── tsconfig.node.json               # Build tools config
├── package.json
├── index.html
└── vercel.json                      # Vercel deployment config
```

### 7.2 Feature Organization Pattern

Features are organized by domain with co-located CSS:

**Example: Sequences Feature**
```
components/
└── sequences/
    ├── SequenceList.tsx     # Main component
    ├── SequenceList.css     # Feature-specific styles
    ├── SequenceDetail.tsx
    ├── SequenceDetail.css
    └── [sub-components]
```

✅ **Co-locate CSS with components** - Same directory, matching name

### 7.3 Import Path Conventions

**Always use `@` alias for cross-directory imports:**
```typescript
// ✅ Correct
import { Button } from "@/components/ui/button";
import { V2Panel } from "@/v2/components/V2Primitives";
import { cn } from "@/lib/utils";

// ❌ Avoid
import { Button } from "../../components/ui/button";
import { Button } from "./components/ui/button";
```

### 7.4 Component Naming Convention

- **Component files:** `PascalCase` (e.g., `MyComponent.tsx`)
- **CSS files:** Match component name (e.g., `MyComponent.css`)
- **Exported components:** `PascalCase` (e.g., `export function MyComponent()`)
- **Utility functions:** `camelCase` (e.g., `export function useMyHook()`)
- **CSS classes:** `PascalCase` with BEM for nested elements
  - `.MyComponent` - Block
  - `.MyComponent__element` - Element
  - `.MyComponent--modifier` - Modifier

---

## 8. Design Patterns & Best Practices

### 8.1 Component Composition Pattern

**Primitive → Composite → Feature**

```typescript
// Tier 1: Primitive (Radix + Tailwind)
import { Button } from "@/components/ui/button";

// Tier 2: Composite (domain-specific)
export function MyDialog({ isOpen, onClose, data }: MyDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
        </DialogHeader>
        <Button onClick={onClose}>Close</Button>
      </DialogContent>
    </Dialog>
  );
}

// Tier 3: Feature (business logic)
export function MyFeature() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Dialog</Button>
      <MyDialog isOpen={isOpen} onClose={() => setIsOpen(false)} data={data} />
    </>
  );
}
```

### 8.2 Variant Pattern (CVA - Class Variance Authority)

Use `class-variance-authority` for component variants:

```typescript
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base styles (always applied)
  "inline-flex items-center justify-center font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input hover:bg-accent",
        ghost: "hover:bg-accent",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-11 px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
)
```

### 8.3 Hook Pattern for Side Effects

Use React Query for server state and custom hooks for local state:

```typescript
// API query hook
import { useQuery } from "@tanstack/react-query"
import { client } from "@/api/client"

export function useMyData(id: string) {
  return useQuery({
    queryKey: ["myData", id],
    queryFn: async () => {
      const response = await client.get(`/api/data/${id}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Usage in component
export function MyComponent({ id }: { id: string }) {
  const { data, isLoading, error } = useMyData(id);
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return <div>{JSON.stringify(data)}</div>;
}
```

### 8.4 Form Handling Pattern

React Hook Form + Zod validation:

```typescript
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const FormSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Min 8 characters"),
})

type FormData = z.infer<typeof FormSchema>

export function MyForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(FormSchema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      await submitForm(data);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("email")} />
      {errors.email && <span>{errors.email.message}</span>}
      
      <input {...register("password")} type="password" />
      {errors.password && <span>{errors.password.message}</span>}
      
      <button type="submit">Submit</button>
    </form>
  )
}
```

### 8.5 Animation Pattern (Framer Motion)

Used for V2 page transitions and micro-interactions:

```typescript
import { motion, AnimatePresence } from "framer-motion"

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" }
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: { duration: 0.2 }
  },
}

export function MyPage() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {/* Content */}
      </motion.div>
    </AnimatePresence>
  )
}
```

---

## 9. Figma MCP Integration Rules

### 9.1 Code Connect Mapping Strategy

When integrating Figma designs:

1. **Export component propsto enhance Code Connect mappings**
   - Always define and export component interfaces
   - Use meaningful prop names that match design specs
   
   ```typescript
   export interface CardProps {
     title: string;
     description?: string;
     variant?: "default" | "elevated";
     children?: React.ReactNode;
   }
   
   export function Card({ title, description, variant = "default", children }: CardProps) {
     // Implementation
   }
   ```

2. **Map Figma components to code components**
   - Use Code Connect labels: React, Vue, Web Components, Markdown
   - Source files should be in `src/` directory (not `node_modules`)
   - Include examples showing prop usage

3. **Document design tokens mapping**
   ```
   Figma Token → CSS Variable → Tailwind Usage
   
   Example:
   Brand Primary (#0ea5e9) → --v2-accent → class="text-accent"
   ```

### 9.2 Design-to-Code Workflow

1. **Get Design Context** from Figma node
   - Extract screenshot, component metadata, design hints
   - Review Code Connect mappings if available

2. **Adapt to Project Stack**
   - Use existing components from `@/components/ui/` or `@/v2/components/`
   - Follow established patterns (CVA for variants, cn() for merging)
   - Apply design tokens, not hardcoded colors

3. **Generate Implementation**
   - Follow project file structure and naming conventions
   - Use `@` path aliases
   - Include TypeScript interfaces for props
   - Apply Tailwind utilities with semantic tokens

### 9.3 Asset Integration

When Figma provides design assets:

1. **Export as SVG or WebP**
   - SVG: Preferred for icons and vectors
   - WebP: For photography/raster images

2. **Place in correct location**
   - Public assets: `frontend/public/assets/[feature-name]/`
   - Bundled assets: `frontend/src/assets/`

3. **Reference in code**
   ```typescript
   // Public asset
   <img src="/assets/sms-kit/banner.webp" alt="Banner" />
   
   // Bundled asset
   import logo from "@/assets/logo.png";
   <img src={logo} alt="Logo" />
   ```

### 9.4 Token System Mapping

**Figma Tokens → CSS Variables → Tailwind Classes**

Example color token mapping:
```
Figma Design System
├── Colors
│   ├── Primary → #0ea5e9 → --v2-accent
│   ├── Success → #16a34a → --v2-positive
│   └── Error → #e11d48 → --v2-critical
│
Tailwind Usage
├── bg-[var(--v2-accent)]
├── text-[var(--v2-positive)]
└── border-[var(--v2-critical)]
```

### 9.5 Component Documentation for Figma

Create Code Connect templates using Figma's `figmadoc` format:

```markdown
# Button Component

Component variants and usage in the codebase.

## Props
- `variant`: "default" | "outline" | "ghost"
- `size`: "sm" | "md" | "lg"
- `disabled`: boolean
- `onClick`: () => void

## Examples
```

---

## 10. Reference Documentation

### 10.1 Key Files

| File | Purpose |
|------|---------|
| [frontend/package.json](frontend/package.json) | Dependencies & scripts |
| [frontend/vite.config.ts](frontend/vite.config.ts) | Build configuration |
| [frontend/tsconfig.json](frontend/tsconfig.json) | TypeScript settings |
| [frontend/src/styles/globals.css](frontend/src/styles/globals.css) | Tailwind setup |
| [frontend/src/styles/tokens.css](frontend/src/styles/tokens.css) | Brand tokens |
| [frontend/src/lib/utils.ts](frontend/src/lib/utils.ts) | `cn()` helper |
| [frontend/src/components/ui/button.tsx](frontend/src/components/ui/button.tsx) | Button component (example) |
| [frontend/src/v2/v2.css](frontend/src/v2/v2.css) | V2 design system |
| [frontend/src/v2/components/V2Primitives.tsx](frontend/src/v2/components/V2Primitives.tsx) | V2 foundation |

### 10.2 Useful Commands

```bash
# Development
cd frontend
npm run dev              # Start Vite dev server
npm run build            # Production build
npm run typecheck:v2     # Type check only

# Code quality
cd sms-insights
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix linting issues
npm run build            # Full build

cd frontend
npm run typecheck:v2     # Type check frontend
```

### 10.3 Design Resources

- **SMS Kit Assets:** [frontend/public/assets/sms-kit/](frontend/public/assets/sms-kit/)
- **Figma Integration:** Use `@figma/*` path aliases if installed
- **Color Reference:** See section 1.2 (V2 Design Tokens)
- **Component Gallery:** [frontend/src/components/ui/](frontend/src/components/ui/)

### 10.4 External Documentation

- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [Radix UI Docs](https://www.radix-ui.com/docs/primitives/overview/introduction)
- [React Docs](https://react.dev)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [Lucide React Icons](https://lucide.dev/)

---

## 11. Quick Reference Checklist

### When Creating New Components

- [ ] Use TypeScript with strict mode
- [ ] Define and export component prop interface
- [ ] Use `@/` path aliases for imports
- [ ] Apply design tokens from `tokens.css` or `v2.css`
- [ ] Use `cn()` helper for class merging
- [ ] Use Tailwind utilities for styling (no inline styles)
- [ ] Create accompanying `ComponentName.css` if custom styles needed
- [ ] Place component in appropriate tier (ui/, v2/, or features/)
- [ ] Use CVA for component variants
- [ ] Add JSDoc comments for public APIs

### When Styling Components

- [ ] Use design tokens, never hardcoded colors
- [ ] Use spacing scale (v2-space-1 through v2-space-6)
- [ ] Use border radius scale (v2-radius-sm through v2-radius-xl)
- [ ] Apply shadows from token set only
- [ ] Use Tailwind responsive utilities (sm:, md:, lg:)
- [ ] Test in dark mode if applicable
- [ ] Check accessibility (focus states, color contrast)

### When Integrating from Figma

- [ ] Export design context using get_design_context
- [ ] Map Figma component to existing code component if available
- [ ] Use Code Connect for component mapping
- [ ] Export assets as SVG or WebP
- [ ] Place assets in correct directory
- [ ] Map design tokens to CSS variables
- [ ] Follow established component patterns
- [ ] Type all component props

---

**Last Updated:** March 20, 2026
**Maintained By:** PT Biz SMS Insights Team
**Version:** 1.0.0

