import { Analytics } from '@vercel/analytics/react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ApiError, client, setUnauthorizedHandler } from './api/client';
import { PasswordGate } from './components/PasswordGate';
import { type UiMode, parseUiMode } from './uiMode';

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
      <Route
        path="/legacy/*"
        element={<Navigate to="/v2/insights" replace />}
      />
      <Route
        path="/v2/*"
        element={
          <Suspense
            fallback={
              <div className="text-muted-foreground">Loading dashboard...</div>
            }
          >
            <V2App />
          </Suspense>
        }
      />
      <Route path="*" element={<DefaultRoute />} />
    </Routes>
  </BrowserRouter>
);

export default function App() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    setUnauthorizedHandler(() => {
      if (!cancelled) {
        setIsAuthed(false);
      }
    });

    const verifySession = async () => {
      try {
        await client.get('/api/auth/verify');
        if (!cancelled) {
          setIsAuthed(true);
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 401) {
            setIsAuthed(false);
          } else {
            setIsAuthed(false);
          }
        }
      }
    };

    void verifySession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isAuthed === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: 'var(--muted-foreground, #888)',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <>
        <PasswordGate onUnlock={() => setIsAuthed(true)} />
        <Analytics />
      </>
    );
  }

  return (
    <>
      <AppRoutes />
      <Analytics />
    </>
  );
}

export const detectUiMode = resolveUiMode;
