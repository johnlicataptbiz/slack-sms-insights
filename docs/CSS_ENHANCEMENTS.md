# CSS Enhancements for PT Biz SMS Insights V2

## Overview
This document tracks the CSS enhancements implemented throughout the PT Biz SMS Insights V2 dashboard.

## New CSS Classes Added

### Visual Effects
- `.V2Panel--glass` - Glassmorphism effect with backdrop blur
- `.V2MetricCard--glow` - Radial glow effect on hover
- `.V2MetricCard--glow-positive` - Green glow variant
- `.V2MetricCard--glow-critical` - Red glow variant
- `.V2Panel--gradient-border` - Animated gradient border
- `.V2Shimmer` - Shimmer loading animation
- `.V2GradientText` - Gradient text effect

### Animations
- `.V2Float` - Floating animation
- `.V2Float--delay-1` - Delayed floating (0.5s)
- `.V2Float--delay-2` - Delayed floating (1s)
- `.V2PulseGlow` - Pulsing glow effect
- `.V2PageTransition` - Page enter animation
- `.V2Stagger` - Staggered children animation
- `.V2CardLift` - Card lift on hover

### Interactive Elements
- `.V2Btn--enhanced` - Button with shine effect
- `.V2Shell__navItem--enhanced` - Enhanced nav with active indicator
- `.V2Table--enhanced` - Table with hover slide effect
- `.V2StatusBadge` - Status badge with pulse dot
- `.V2Tooltip` - Enhanced tooltip
- `.V2Sparkline` - Mini bar chart sparkline

### Layout & Structure
- `.V2ProgressRing` - SVG progress ring
- `.V2HeroBannerOverlay` - Banner with gradient overlay
- `.V2Divider` - Animated section divider
- `.V2HeroSummary` - Hero summary grid layout

### Mobile Optimizations
- `.V2Btn--mobile` - Touch-friendly buttons
- Responsive breakpoints at 760px and 1080px

## Keyframe Animations
- `v2-shimmer` - Shimmer loading effect
- `v2-float` - Floating animation
- `v2-pulse-glow` - Pulsing glow
- `v2-page-enter` - Page transition
- `v2-stagger-fade` - Staggered fade in
- `v2-status-pulse` - Status dot pulse
- `v2-divider-pulse` - Divider dot pulse
- `v2-pattern-drift` - Background pattern drift

## Files Modified
1. `frontend/src/v2/v2.css` - Added 500+ lines of new CSS
2. `frontend/src/v2/layout/V2Shell.tsx` - Applied enhanced classes
3. `frontend/src/v2/pages/InsightsV2.tsx` - Applied page transition

## Accessibility
- All animations respect `prefers-reduced-motion`
- Touch targets meet 44px minimum on mobile
- Focus states maintained for keyboard navigation
- ARIA labels preserved

## Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Webkit prefixes for backdrop-filter and mask
- Fallbacks for older browsers via CSS.supports

## Type Motion Patterns (Phase 6)

### MetricCarousel
Auto-rotating metric showcase component:
- `.MetricCarousel` - Container
- `.MetricCarousel__container` - Slide wrapper
- `.MetricCarousel__slide` - Individual slide
- `.MetricCarousel__slide--accent` - Accent color variant
- `.MetricCarousel__slide--positive` - Positive trend variant
- `.MetricCarousel__slide--critical` - Critical trend variant
- `.MetricCarousel__slide--warning` - Warning variant
- `.MetricCarousel__title` - Metric label
- `.MetricCarousel__value` - Metric value
- `.MetricCarousel__trend` - Trend indicator
- `.MetricCarousel__arrow` - Navigation arrows
- `.MetricCarousel__dots` - Dot indicators

### V2Card3D
3D flip card component:
- `.V2Card3D` - Perspective container
- `.V2Card3D__inner` - Transform container
- `.V2Card3D__inner--flipped` - Flipped state
- `.V2Card3D__front` - Front face
- `.V2Card3D__back` - Back face

### V2Loading
Dual-ring loading spinner:
- `.V2Loading` - Default loading
- `.V2LoadingOverlay` - Full-screen overlay
- `.V2LoadingInline` - Inline spinner

### V2ThemeToggle
Dark mode toggle:
- `.V2ThemeToggle` - Toggle button
- `.V2ThemeToggle__icon--sun` - Sun icon
- `.V2ThemeToggle__icon--moon` - Moon icon

### Motion Utilities
- `.V2Motion--ease-smooth` - Smooth easing
- `.V2Motion--ease-bounce` - Bounce easing
- `.V2Motion--duration-fast` - 150ms duration
- `.V2Motion--duration-normal` - 300ms duration
- `.V2Motion--duration-slow` - 500ms duration

### Dark Mode Support
All Type Motion patterns support dark mode via `[data-theme="dark"]` selector with:
- Inverted color variables
- Adjusted gradients
- Modified shadows
- Preserved accent colors
