import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { parseUiMode, type UiMode } from './uiMode';

const V2App = lazy(() => import('./v2/V2App'));

const resolveUiMode = (): UiMode => {
  const envMode = parseUiMode(import.meta.env.VITE_UI_VERSION);
  return envMode || 'v2';
};

const DefaultRoute = () => {
  return <Navigate to="/v2/insights" replace />;
};

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/legacy" element={<Navigate to="/v2/insights" replace />} />
      <Route path="/legacy/*" element={<Navigate to="/v2/insights" replace />} />
      <Route
        path="/v2/*"
        element={
          <Suspense fallback={<div className="text-muted-foreground">Loading dashboard...</div>}>
            <V2App />
          </Suspense>
        }
      />
      <Route path="*" element={<DefaultRoute />} />
    </Routes>
  </BrowserRouter>
);

export default function App() {
  return <AppRoutes />;
}

export const detectUiMode = resolveUiMode;
