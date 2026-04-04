# Implementation TODO — Motion, Notifications & UI Upgrades

## Status Legend
- [ ] Pending
- [x] Done
- [-] Skipped (reason noted)

---

## Phase 1 — Package Installation

- [x] Install `framer-motion` — page transitions, micro-animations
- [x] Install `sonner` — production-grade toast notifications
- [x] Install `zod` — type-safe validation (frontend forms)
- [x] Install `react-hook-form` + `@hookform/resolvers` — form handling
- [x] Install `date-fns` — date formatting utilities
- [x] Install `usehooks-ts` — useful React hooks
- [x] Install `tailwindcss-animate` — Tailwind animation utilities
- [x] Install `@radix-ui/react-label` — accessible form labels
- [x] Install `@radix-ui/react-icons` — minimal system icons
- [-] Skip `@visx/visx`, `@nivo/*`, `react-spring` — recharts already present, framer-motion covers interactions
- [-] Skip `@react-icons/all-files` — lucide-react already present
- [-] Skip `react-loading-skeleton` — will use CSS skeleton animations

---

## Phase 2 — Toast / Notification System

- [x] Wire `sonner` `<Toaster>` into `V2App.tsx`
- [x] Create `frontend/src/v2/hooks/useToast.ts` — typed toast helpers (success/error/warning/info/promise)
- [x] Add toast triggers to InboxV2 send actions
- [x] Add toast triggers to SequencesV2 expand/collapse audit rows

---

## Phase 3 — Framer Motion Animations

- [x] Add `AnimatePresence` page transitions in `V2App.tsx`
- [x] Add staggered entrance to `V2MetricCard` grid in `InsightsV2.tsx`
- [x] Add animated risk alert banner in `InsightsV2.tsx`
- [x] Add animated health alert cards in `SequencesV2.tsx`
- [x] Add animated table row entrances in `SequencesV2.tsx`
- [x] Add animated expand/collapse for audit rows in `SequencesV2.tsx`

---

## Phase 4 — V2Primitives Enhancements

- [x] Add `V2AnimatedList` — staggered animated list wrapper
- [x] Add `V2ProgressBar` — health score / progress bar component
- [-] Add `V2SkeletonCard` — CSS skeleton loading card (already exists in InboxV2)
- [x] Update `V2MetricCard` — add sparkline header layout fix + trend badge

---

## Phase 5 — CSS Enhancements (v2.css)

- [x] Add health score bar styles for SequencesV2
- [x] Add skeleton loading animation
- [x] Add enhanced page transition keyframes
- [x] Add sonner toast theme overrides to match v2 design system

---

## Phase 6 — Commit

- [x] Create branch `blackboxai/motion-notifications-ui`
- [x] Stage and commit all changes
