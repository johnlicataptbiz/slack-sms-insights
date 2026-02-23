# Implementation Plan: PT Biz SMS Insights Dashboard

[Overview]
Transform the existing SMS Insights dashboard into a production-grade, fully-documented, and maintainable system with improved code quality, comprehensive testing, and enhanced user experience. The goal is to establish best practices for long-term maintainability while delivering immediate value through documentation, code quality improvements, and UI/UX enhancements.

[Types]
No changes to core API types required. Add new types for UI state management, validation schemas, and error handling.

New types to add:
- `Theme`: 'light' | 'dark' | 'system'
- `SidebarState`: 'expanded' | 'collapsed'
- `WidgetConfig`: { id: string; type: string; position: number }
- `ValidationError`: { field: string; message: string; code: string }
- `ApiErrorResponse`: { error: string; details?: ValidationError[]; requestId: string }

[Files]
Single sentence: Create comprehensive documentation, implement structured logging, add input validation, and enhance frontend performance.

Detailed breakdown:

**New Files:**
- `README.md` - Complete project overview with architecture diagrams, quick start, and links to all documentation
- `CONTRIBUTING.md` - Development workflow, coding standards, PR process, and commit conventions
- `API.md` - Complete API endpoint documentation with request/response examples
- `frontend/src/components/README.md` - Component library usage guide with examples
- `.env.example` - Template with all environment variables and descriptions
- `sms-insights/services/logger.ts` - Structured logging with pino
- `sms-insights/api/validation.ts` - Zod schemas for all API inputs
- `sms-insights/middleware/error-handler.ts` - Centralized error handling middleware
- `frontend/src/components/ErrorBoundary.tsx` - React error boundary for crash recovery
- `frontend/src/hooks/useDebounce.ts` - Debounce hook for search inputs
- `frontend/src/hooks/useLocalStorage.ts` - Persistent state hook
- `docs/adr/` - Architecture Decision Records folder
- `docs/adr/001-why-tailwind-v4.md` - ADR for Tailwind v4 choice
- `docs/adr/002-why-shadcn-ui.md` - ADR for shadcn/ui choice
- `docs/adr/003-why-react-query.md` - ADR for React Query choice

**Modified Files:**
- `sms-insights/app.ts` - Replace console.* with logger, add error middleware
- `sms-insights/api/routes.ts` - Add Zod validation to all routes
- `sms-insights/scripts/*.ts` - Inject logger instead of console.*
- `frontend/src/api/v2Queries.ts` - Add caching configuration
- `frontend/src/api/client.ts` - Add request/response interceptors
- `frontend/src/components/v2/ChartsGrid.tsx` - Add memoization, theme support
- `frontend/src/components/v2/KPIGrid.tsx` - Add skeleton loading states
- `frontend/src/components/v2/CampaignsTable.tsx` - Add virtualization for large datasets
- `frontend/src/pages/DashboardV2.tsx` - Add error boundary wrapper
- `frontend/src/v2/V2App.tsx` - Add route-level code splitting
- `frontend/vite.config.ts` - Add bundle analyzer, optimize deps
- `frontend/package.json` - Add testing dependencies (vitest, @testing-library/react, msw)
- `sms-insights/package.json` - Add pino, zod, compression
- `tsconfig.json` - Enable strict mode

**Deleted/Deprecated:**
- Remove all console.log/error/warn from production code paths
- Deprecate legacy CSS files in favor of Tailwind
- Remove unused imports and dead code

[Functions]
Single sentence: Implement structured logging, input validation, error handling, and performance optimizations across the stack.

Detailed breakdown:

**New Functions:**
- `createLogger(name: string): Logger` - Factory for namespaced loggers
- `validateRequest<T>(schema: ZodSchema<T>, req: Request): Promise<T>` - Request validation helper
- `handleApiError(error: unknown, req: Request, res: Response): void` - Centralized error handler
- `useDebounce<T>(value: T, delay: number): T` - React hook for debouncing
- `useLocalStorage<T>(key: string, initialValue: T): [T, (v: T) => void]` - Persistent state hook
- `memoizedChartData(data: ChartData[]): ChartData[]` - Chart data memoization
- `formatErrorForUser(error: ApiError): string` - User-friendly error messages

**Modified Functions:**
- `handleApiRoute()` - Add validation layer, structured logging, error handling
- `useV2Runs()` - Add staleTime, cacheTime, retry logic
- `useV2SalesMetrics()` - Add polling interval configuration
- `KPIGrid()` - Add React.memo, skeleton states
- `ChartsGrid()` - Add theme-aware colors, memoization

**Removed Functions:**
- All inline console.log statements (replaced with logger)

[Classes]
No class-based changes required. The codebase uses functional programming patterns.

[Dependencies]
Single sentence: Add structured logging, validation, testing, and performance monitoring dependencies.

Detailed breakdown:

**New Dependencies (Backend):**
- `pino` - High-performance JSON logger
- `pino-pretty` - Development log formatter
- `zod` - Runtime type validation
- `compression` - Response compression middleware
- `@sentry/node` - Error tracking (optional)

**New Dependencies (Frontend):**
- `vitest` - Unit testing framework
- `@testing-library/react` - Component testing utilities
- `@testing-library/user-event` - User interaction simulation
- `msw` - Mock Service Worker for API mocking
- `@tanstack/react-virtual` - Virtual scrolling for large tables
- `react-error-boundary` - Error boundary component
- `use-debounce` - Debounce hook (or custom implementation)
- `@sentry/react` - Frontend error tracking (optional)
- `web-vitals` - Core Web Vitals reporting

**Version Updates:**
- Upgrade React Query to v5 (if not already)
- Ensure TypeScript 5.9+ strict mode compatibility

[Testing]
Single sentence: Implement comprehensive testing strategy including unit, component, integration, and E2E tests.

Detailed breakdown:

**Test File Requirements:**
- `sms-insights/tests/services/logger.test.ts` - Logger functionality
- `sms-insights/tests/api/validation.test.ts` - Validation schemas
- `sms-insights/tests/api/routes.test.ts` - API route handlers
- `frontend/src/components/v2/KPIGrid.test.tsx` - Component rendering
- `frontend/src/components/v2/ChartsGrid.test.tsx` - Chart interactions
- `frontend/src/hooks/useDebounce.test.ts` - Hook behavior
- `frontend/src/api/v2Queries.test.ts` - Query hooks with MSW
- `e2e/dashboard.spec.ts` - Playwright E2E tests

**Testing Strategy:**
1. Unit tests for utilities and hooks
2. Component tests with mocked API calls
3. Integration tests for API routes with test database
4. E2E tests for critical user flows (login, view dashboard, filter data)

[Implementation Order]
Single sentence: Execute in phases: documentation first, then code quality, then features, finally testing and monitoring.

Numbered steps:
1. **Phase 1: Documentation (Week 1)**
   - Create comprehensive README.md
   - Write CONTRIBUTING.md with coding standards
   - Document API endpoints in API.md
   - Create .env.example template
   - Write ADRs for key architectural decisions

2. **Phase 2: Backend Code Quality (Week 1-2)**
   - Implement structured logging with pino
   - Create Zod validation schemas
   - Add centralized error handling middleware
   - Replace all console.* with logger calls
   - Enable TypeScript strict mode
   - Add input validation to all API routes

3. **Phase 3: Frontend Code Quality (Week 2)**
   - Add React Query caching configuration
   - Implement error boundaries
   - Add debouncing to search inputs
   - Memoize expensive components (charts)
   - Add skeleton loading states
   - Implement virtual scrolling for tables

4. **Phase 4: Testing Infrastructure (Week 3)**
   - Set up Vitest for unit testing
   - Configure React Testing Library
   - Implement MSW for API mocking
   - Write tests for critical paths
   - Set up Playwright for E2E testing

5. **Phase 5: UI/UX Enhancements (Week 3-4)**
   - Complete V2 dashboard pages (Campaigns, Leads, Calls)
   - Add date range picker to charts
   - Implement export functionality
   - Add filter persistence to URL
   - Improve mobile responsiveness
   - Add keyboard shortcuts

6. **Phase 6: DevOps & Monitoring (Week 4)**
   - Set up GitHub Actions CI/CD
   - Add Sentry error tracking
   - Implement health check endpoints
   - Add Web Vitals monitoring
   - Configure branch preview environments

7. **Phase 7: Final Review & Polish (Week 5)**
   - Code review all changes
   - Performance audit (Lighthouse)
   - Accessibility audit (WCAG 2.1)
   - Security audit
   - Update all documentation
   - Create deployment runbook

[Success Criteria]
- Lighthouse performance score >90
- 100% TypeScript strict mode compliance
- Zero console.* in production code paths
- All API routes have input validation
- Test coverage >70% for critical paths
- Documentation complete and accurate
- Mobile-responsive design
- Accessibility WCAG 2.1 AA compliance

[Risks and Mitigations]
- **Risk**: Breaking changes during strict mode enablement
  - **Mitigation**: Incremental migration, thorough testing
- **Risk**: Performance regression from new dependencies
  - **Mitigation**: Bundle analysis, tree-shaking verification
- **Risk**: Database migration issues
  - **Mitigation**: Backward-compatible changes only, backup strategy
- **Risk**: User disruption during V2 rollout
  - **Mitigation**: Feature flags, gradual rollout, easy rollback

[Appendix: Current State Assessment]

**Strengths:**
- Modern React 19 with TypeScript
- Tailwind CSS v4 with shadcn/ui components
- React Query for server state management
- Recharts for data visualization
- Proper database schema with PostgreSQL
- Slack OAuth authentication
- Real-time updates via polling

**Weaknesses:**
- Minimal documentation (README is one line)
- Console logging in production code (98 instances)
- No input validation on API routes
- Missing error boundaries
- No caching configuration for React Query
- Incomplete V2 dashboard (missing pages)
- Limited test coverage
- No structured logging
- No performance monitoring
