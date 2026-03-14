# Type Motion Integration Guide

## Overview
The `type-motion copy` folder contains a Google AI Studio app for generating cinematic 3D text animations. This document outlines how its UI patterns and components can be utilized in the PT Biz SMS Insights V2 dashboard.

## Key UI Patterns from Type Motion

### 1. Hero Carousel Component
**File:** `type-motion copy/App.tsx` (HeroCarousel component)

**Features:**
- Auto-playing video carousel with smooth transitions
- Mute/unmute controls with backdrop blur
- Navigation arrows (prev/next) with hover effects
- Progress indicators (dots)
- Gradient overlays for text readability
- Keyboard/touch friendly

**Potential Use Cases in PT Biz SMS:**
- **Dashboard Welcome Screen** - Rotating hero banners showcasing key metrics
- **Feature Highlights** - Carousel for new features or announcements
- **KPI Showcase** - Auto-rotating metric highlights with context

**Integration Approach:**
```tsx
// Adapt HeroCarousel for PT Biz SMS Insights
const InsightsHeroCarousel = () => {
  const slides = [
    { id: '1', title: "SMS Performance", metric: "94%", description: "Response rate this week" },
    { id: '2', title: "Booked Calls", metric: "127", description: "Total calls booked" },
    // ...
  ];
  // Reuse carousel logic with metric cards instead of videos
};
```

### 2. 3D Card Flip Animation
**Pattern:** CSS 3D transforms with perspective

**Features:**
- `perspective: 2000px` for 3D depth
- `transform-style: preserve-3d`
- `backface-visibility: hidden`
- Smooth rotation with cubic-bezier easing
- Dual-sided cards (front/back)

**Potential Use Cases:**
- **Metric Card Details** - Flip card to show detailed breakdown
- **Settings Panels** - Front: summary, Back: configuration
- **Contact Profiles** - Front: basic info, Back: full history
- **Sequence Details** - Front: overview, Back: step-by-step

**CSS Integration:**
```css
.V2Card3D {
  perspective: 2000px;
}

.V2Card3D__inner {
  transform-style: preserve-3d;
  transition: transform 0.8s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.V2Card3D__inner--flipped {
  transform: rotateY(180deg);
}

.V2Card3D__front,
.V2Card3D__back {
  backface-visibility: hidden;
}

.V2Card3D__back {
  transform: rotateY(180deg);
}
```

### 3. Glassmorphism Effects
**Pattern:** Backdrop blur with semi-transparent backgrounds

**Features:**
- `backdrop-filter: blur(12px)`
- Semi-transparent backgrounds (`bg-black/40`)
- Border highlights (`border-white/10`)
- Hover state transitions

**Already Implemented in V2:**
- `.V2Panel--glass` class exists in v2.css
- Topbar uses glassmorphism effect

**Enhancement Opportunities:**
- Apply to modals and drawers
- Use in floating action buttons
- Enhanced tooltip backgrounds

### 4. Loading State Patterns
**Pattern:** Multi-stage loading with visual feedback

**Features:**
- Animated spinners with dual-ring design
- Status message updates
- Progress indication through state changes
- Skeleton screens for content

**Current V2 Implementation:**
- `V2Shimmer` class for skeleton loading
- `SkeletonDashboard` component

**Enhancement from Type Motion:**
- Add dual-ring spinner variant
- Implement stage-based loading (Designing → Animating → Done)
- Progress rings for long operations

### 5. Dark Mode System
**Pattern:** Comprehensive dark/light theme support

**Features:**
- `dark:` Tailwind prefixes
- `dark:bg-zinc-950`, `dark:text-stone-100`
- Transition animations between modes
- Selection colors (`selection:bg-stone-900`)

**Current V2 Status:**
- V2 uses CSS custom properties
- No explicit dark mode toggle

**Integration Approach:**
- Add dark mode CSS variables to v2.css
- Implement theme toggle in V2Shell
- Use Type Motion's color palette as reference:
  - Light: `stone-50`, `stone-100`, `stone-900`
  - Dark: `zinc-950`, `zinc-900`, `zinc-800`, `zinc-700`

### 6. Form Component Styling
**Pattern:** Consistent, polished form elements

**Features:**
- Rounded inputs (`rounded-xl`)
- Focus rings (`focus:ring-2 focus:ring-stone-900`)
- Icon integration in labels
- Disabled states
- Character limits with visual feedback

**Applicable to PT Biz SMS:**
- Search inputs (already have SearchInput component)
- Filter dropdowns
- Date range pickers
- Form modals for data entry

### 7. Button Variants
**Pattern:** Multiple button styles with consistent hover/active states

**Features:**
- Primary: Dark bg, white text, shadow
- Secondary: Light bg, border, hover fill
- Ghost: Transparent with hover bg
- Icon buttons with scale transforms
- Active state scaling (`active:scale-[0.98]`)

**Current V2 Implementation:**
- `.V2Btn--enhanced` with shine effect
- Can incorporate Type Motion's active scale pattern

### 8. Typography System
**Pattern:** Clear hierarchy with utility classes

**Features:**
- `text-xs font-bold uppercase tracking-wider` for labels
- `text-4xl lg:text-5xl font-bold` for headlines
- `text-lg` for body text
- `line-clamp-2` for text truncation

## Specific Components to Port

### 1. ApiKeyDialog → PasswordGate Enhancement
The `ApiKeyDialog` component has a polished modal design that could enhance the existing `PasswordGate`:

**Features to adopt:**
- Backdrop blur with fade animation
- Icon header with colored background
- Structured content sections
- Two-button layout (Cancel/Action)
- External link styling

### 2. HeroCarousel → MetricCarousel
Adapt for rotating metric highlights:

```tsx
const MetricCarousel = ({ metrics }: { metrics: Metric[] }) => {
  // Reuse carousel logic
  // Display metric cards instead of videos
  // Auto-rotate through KPIs
};
```

### 3. Loading Spinner → V2Loading
Enhanced loading component:

```tsx
const V2Loading = ({ stage, message }: { stage: string; message: string }) => (
  <div className="relative w-16 h-16">
    <div className="absolute inset-0 border-4 border-stone-200 rounded-full" />
    <div className="absolute inset-0 border-4 border-stone-900 rounded-full border-t-transparent animate-spin" />
  </div>
);
```

## Color Palette Mapping

| Type Motion | PT Biz SMS V2 | Usage |
|-------------|---------------|-------|
| `stone-50` | `--v2-surface` | Light backgrounds |
| `stone-100` | `--v2-surface-elev` | Elevated surfaces |
| `stone-900` | `--v2-base-900` | Primary text, buttons |
| `zinc-950` | (new) | Dark mode background |
| `zinc-900` | (new) | Dark mode elevated |
| `zinc-800` | (new) | Dark mode borders |
| `zinc-700` | (new) | Dark mode muted text |

## Animation Easing Reference

Type Motion uses this cubic-bezier for smooth transitions:
```css
cubic-bezier(0.25, 0.8, 0.25, 1)
```

This is already similar to V2's motion utilities but can be enhanced.

## Implementation Priority

### High Priority
1. **3D Card Flip** - For metric detail views
2. **Enhanced Loading States** - Better UX during data fetching
3. **Dark Mode Foundation** - Prepare for theme switching

### Medium Priority
4. **Hero Carousel** - For dashboard welcome/announcements
5. **Form Styling** - Polish existing inputs
6. **Button Active States** - Add press feedback

### Low Priority
7. **Modal Enhancements** - Update PasswordGate styling
8. **Typography Refinement** - Adopt consistent text hierarchy

## Files to Reference

- `type-motion copy/App.tsx` - Main component patterns
- `type-motion copy/index.css` - Base styling (if Tailwind customizations exist)
- `type-motion copy/utils.ts` - Helper functions for animations

## Implementation Status

### Phase 6 Complete ✓

All Type Motion patterns have been successfully integrated into the V2 dashboard:

| Pattern | Component/File | Status |
|---------|---------------|--------|
| **Metric Carousel** | `frontend/src/v2/components/MetricCarousel.tsx` | ✅ Complete |
| **3D Card Flip** | `frontend/src/v2/v2.css` (`.V2Card3D*`) | ✅ Complete |
| **Dark Mode Toggle** | `frontend/src/v2/layout/V2Shell.tsx` | ✅ Complete |
| **Dual-Ring Loading** | `frontend/src/v2/components/V2Loading.tsx` | ✅ Complete |
| **Motion Tokens** | `frontend/src/v2/v2.css` (`.V2Motion--*`) | ✅ Complete |
| **Reduced Motion** | `frontend/src/v2/v2.css` (`@media prefers-reduced-motion`) | ✅ Complete |

### Usage Examples

#### Metric Carousel in InsightsV2
```tsx
import { MetricCarousel } from '../components/MetricCarousel';

const metricSlides = [
  {
    id: 'response-rate',
    title: 'Response Rate',
    value: '94%',
    description: 'SMS response rate this week',
    trend: 'up',
    trendValue: '+12%',
    color: 'positive',
  },
  // ... more slides
];

<MetricCarousel slides={metricSlides} autoPlay={true} />
```

#### 3D Flip Card
```tsx
<div className="V2Card3D" onClick={() => setIsFlipped(!isFlipped)}>
  <div className={`V2Card3D__inner ${isFlipped ? 'V2Card3D__inner--flipped' : ''}`}>
    <div className="V2Card3D__front">
      {/* Summary content */}
    </div>
    <div className="V2Card3D__back">
      {/* Detailed breakdown */}
    </div>
  </div>
</div>
```

#### V2 Loading States
```tsx
import { V2Loading, V2LoadingOverlay, V2LoadingInline } from '../components/V2Loading';

// Default with message
<V2Loading message="Loading insights..." stage="Fetching" />

// Full-screen overlay
<V2LoadingOverlay message="Please wait..." />

// Inline for buttons
<button disabled={isLoading}>
  {isLoading ? <V2LoadingInline /> : 'Submit'}
</button>
```

#### Dark Mode Toggle
```tsx
// Already integrated in V2Shell
// Theme is persisted to localStorage and synced with system preference
// CSS variables automatically switch via [data-theme="dark"] selector
```

#### Motion Tokens
```css
/* Apply consistent easing */
.myComponent {
  transition: all 0.3s var(--v2-ease-smooth);
}

/* Or use utility classes */
<div className="V2Motion--ease-smooth V2Motion--duration-normal">
```

## Notes

- Type Motion uses **Tailwind CSS** while PT Biz SMS V2 uses **custom CSS**
- Patterns need adaptation from Tailwind classes to CSS custom properties
- Focus on animation patterns and UX patterns rather than direct component copying
- Ensure accessibility is maintained (keyboard navigation, screen readers)
- All components respect `prefers-reduced-motion` media query
