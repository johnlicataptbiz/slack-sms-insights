# Implementation Plan

[Overview]
Transform the existing ptbizsms.com/v2 dashboard into a modern, 2026-grade immersive SMS Daily Report Dashboard using Tailwind CSS v4, shadcn/ui, and React. The goal is to replace the current dated, minimal interface with a modular, hyper-personalized, data-first layout that includes dark mode, micro-interactions, and real-time updates, while maintaining the existing backend integration.

[Types]
No major changes to the backend API types (`frontend/src/api/v2-types.ts`) are strictly required, but frontend-specific UI state types will be added.

New types for UI state management:
- `Theme`: 'light' | 'dark' | 'system'
- `SidebarState`: 'expanded' | 'collapsed'
- `WidgetConfig`: Definition for drag-and-drop widgets (id, type, position).

[Files]
- **New Files**:
    - `frontend/src/components/ui/*.tsx`: shadcn/ui components (Button, Card, Table, etc.).
    - `frontend/src/lib/utils.ts`: Utility for tailwind class merging (cn).
    - `frontend/src/components/v2/DashboardLayout.tsx`: Main layout shell (Sidebar, Header).
    - `frontend/src/components/v2/KPIGrid.tsx`: Replacement for MetricCard row.
    - `frontend/src/components/v2/ChartsGrid.tsx`: Container for Recharts widgets.
    - `frontend/src/components/v2/CampaignsTable.tsx`: Replacement for RepTable using TanStack Table.
    - `frontend/src/pages/DashboardV2.tsx`: The new main dashboard page.
    - `frontend/src/styles/globals.css`: Tailwind directives and theme variables.
- **Modified Files**:
    - `frontend/package.json`: Add dependencies (tailwindcss, lucide-react, recharts, clsx, tailwind-merge, @radix-ui/*).
    - `frontend/vite.config.ts`: Configure path aliases (@/*) if needed.
    - `frontend/src/App.tsx`: Update routing to use `DashboardV2` for `/v2` paths.
    - `frontend/src/main.tsx`: Import global styles.
- **Deleted/Deprecated**:
    - `frontend/src/components/insights/*`: These will be replaced by the new v2 components.

[Functions]
- `DashboardLayout`: Wraps content with Sidebar and Header, handles theme toggling and mobile responsiveness.
- `KPIGrid`: Fetches `SalesMetricsV2` and renders `KPICard` components with sparklines.
- `CampaignsTable`: Renders a sortable, paginated table of campaigns/runs using `RunsListV2` data.
- `ChartsGrid`: Renders `SalesTrendChart` and `ResponseTimeChart` using Recharts, adapted for the new UI.

[Changes]
1.  **Setup & Dependencies**:
    -   Install Tailwind CSS, PostCSS, Autoprefixer.
    -   Initialize Tailwind config.
    -   Install `lucide-react`, `recharts`, `clsx`, `tailwind-merge`.
    -   Install shadcn/ui CLI (or manually copy core components: Button, Card, Table, DropdownMenu, Avatar, Sheet/Sidebar).
2.  **Theme & Global Styles**:
    -   Define CSS variables for colors (Slate/Indigo palette based on PT Biz brand) in `globals.css`.
    -   Implement dark mode support using a `ThemeProvider`.
3.  **Layout Implementation**:
    -   Build `Sidebar` with Lucide icons and collapsible state.
    -   Build `Header` with search, notifications (mock/realtime), and user profile.
    -   Create `DashboardLayout` to compose these.
4.  **Component Migration**:
    -   **KPI Cards**: Create `KPICard` with elevation, hover effects, and sparklines (using Recharts).
    -   **Charts**: Re-implement `SalesTrendChart` and `ResponseTimeChart` using Recharts with the new theme colors.
    -   **Table**: Implement `CampaignsTable` using shadcn `Table` component (based on TanStack Table concepts if needed, or simple mapping for now).
5.  **Page Assembly**:
    -   Construct `DashboardV2.tsx` using the Layout and new components.
    -   Connect data fetching (React Query) to these components, reusing existing hooks/queries where possible.
6.  **Routing Update**:
    -   Switch `App.tsx` to render `DashboardV2` for the authenticated dashboard route.
7.  **Cleanup**:
    -   Remove old CSS files and unused legacy components.

[Tests]
-   **Unit Tests**: Test utility functions (cn).
-   **Component Tests**: Verify `KPICard` renders correct values and trends.
-   **Integration Tests**: Verify `DashboardV2` loads and displays data from the API (mocked).
-   **Visual Verification**: Check dark mode toggling, mobile responsiveness, and hover states.
