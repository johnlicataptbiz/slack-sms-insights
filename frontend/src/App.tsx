import { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { parseUiMode, type UiMode } from './uiMode';
import { client, setUnauthorizedHandler } from './api/client';
import { PasswordGate } from './components/PasswordGate';

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
  // null = checking, false = unauthenticated, true = authenticated
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  const handleUnauthorized = useCallback(() => {
    setIsAuthed(false);
  }, []);

  const handleUnlock = useCallback(() => {
    setIsAuthed(true);
  }, []);

  useEffect(() => {
    // Register global 401 handler so any API call can trigger re-auth
    setUnauthorizedHandler(handleUnauthorized);

    // Verify session on mount
    client.get('/api/auth/verify')
      .then(() => setIsAuthed(true))
      .catch(() => setIsAuthed(false));
  }, [handleUnauthorized]);

  if (isAuthed === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted-foreground, #888)' }}>
        Loading…
      </div>
    );
  }

  if (!isAuthed) {
    return <PasswordGate onUnlock={handleUnlock} />;
  }

  return <AppRoutes />;
}

export const detectUiMode = resolveUiMode;
