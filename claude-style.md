# CLAUDE-style Documentation for Slack SMS Insights

## Purpose
Centralized guide for subagents and developers integrating Figma design tokens into the frontend design system.

## File structure and rules
- `frontend/src/styles/tokens.css`: canonical UI token definitions (colors, spacing, radius, shadows)
- `frontend/src/styles/globals.css`: theme variable mappings, dark mode, global utilities
- `frontend/src/components/ui`: component primitives exported via `index.ts`
- `frontend/src/components/ui/index.ts`: centralized UI export point
- `frontend/scripts/generate-design-tokens.ts`: generator for Figma JSON -> CSS + JSON token files
- `frontend/.storybook`: Storybook setup with Figma plugin addon

## Workflow (Figma to code)
1. Export tokens from Figma JSON.
2. Run `npm run generate-tokens` in `frontend`.
3. Review `frontend/src/styles/tokens.generated.css` and `frontend/src/styles/design-system.tokens.json`.
4. Copy relevant tokens into `frontend/src/styles/tokens.css` (or reference generated file).
5. Convert components by mapping Figma components to `src/components/ui/*`.
6. Create/update stories in `src/components/ui/*.stories.tsx`.
7. Run `npm run storybook` and validate with Figma designs using `storybook-addon-designs`.

## Style and design patterns
- Use Tailwind v4 for classes and CSS variables via `@theme`.
- Use CVA (`class-variance-authority`) for variant API patterns.
- Keep UI tokens in CSS variable syntax for easy theme switching.
- Prefer component-level composition over heavy global styles.

## General subagent principles
- Follow user instructions first.
- Output concise, structured markdown in feature docs.
- Immediately mark complete with `task_complete` once all requested items are done.
