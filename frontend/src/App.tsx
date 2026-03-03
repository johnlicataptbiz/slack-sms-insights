import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { ApiError, client } from './api/client';
import { PasswordGate } from './components/PasswordGate';
import { parseUiMode, type UiMode } from './uiMode';

const postAuthRedirectKey = 'ptbizsms-post-auth-redirect';
const getCurrentUrl = () => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};
import V2App from './v2/V2App';

const resolveUiMode = (): UiMode => {
  const envMode = parseUiMode(import.meta.env.VITE_UI_VERSION);
  return envMode || 'v2';
};

const DefaultRoute = () => {
  return <Navigate to="/v2/insights" replace />;
};

const PostAuthRedirect = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = sessionStorage.getItem(postAuthRedirectKey);
    if (!stored) return;

    // Avoid loops: only redirect if we're not already on the intended URL.
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (stored === current) {
      sessionStorage.removeItem(postAuthRedirectKey);
      return;
    }

    sessionStorage.removeItem(postAuthRedirectKey);
    navigate(stored, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
};

const CheckingSessionView = () => {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
        fontFamily: 'Manrope, system-ui, sans-serif',
        background:
          'radial-gradient(1200px 600px at 8% -10%, rgba(17, 184, 214, 0.22), transparent 50%), radial-gradient(900px 560px at 100% 0%, rgba(19, 185, 129, 0.16), transparent 44%), linear-gradient(160deg, #f3f8fc 0%, #edf5fa 55%, #e9f1f8 100%)',
      }}
    >
      <section
        style={{
          width: 'min(560px, 100%)',
          borderRadius: '18px',
          border: '1px solid rgba(7, 19, 36, 0.12)',
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.86))',
          boxShadow: '0 16px 40px rgba(8, 12, 29, 0.18)',
          padding: '1.1rem 1.2rem',
        }}
      >
        <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.68rem', color: '#56607a', fontWeight: 700 }}>
          PT Biz Setter Ops
        </p>
        <h1 style={{ margin: '0.35rem 0 0', fontSize: '1.35rem', color: '#0c1429', fontWeight: 800 }}>Checking secure session</h1>
        <p style={{ margin: '0.35rem 0 0', color: '#56607a', fontSize: '0.92rem' }}>
          Verifying your dashboard access before loading the app.
        </p>
      </section>
    </main>
  );
};

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await client.get('/api/auth/verify');
        if (active) setAuthState('authenticated');
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setAuthState('unauthenticated');
          return;
        }
        setAuthState('unauthenticated');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (authState === 'checking') {
    return <CheckingSessionView />;
  }

  if (authState === 'unauthenticated') {
    // Preserve deep links (e.g. /v2/insights?ui=v2) through the password gate.
    // Keep the deep link so unlock returns to the intended v2 page.
    if (typeof window !== 'undefined') {
      const current = getCurrentUrl();
      if (current !== '/' && current !== '/v2') {
        sessionStorage.setItem(postAuthRedirectKey, current);
      }
    }

    return (
      <PasswordGate
        onUnlock={() => {
          setAuthState('authenticated');
        }}
      />
    );
  }

  return (
    <BrowserRouter>
      <PostAuthRedirect />
      <Routes>
        <Route path="/legacy" element={<Navigate to="/v2/insights" replace />} />
        <Route path="/legacy/*" element={<Navigate to="/v2/insights" replace />} />
        <Route path="/v2/*" element={<V2App />} />
        <Route path="*" element={<DefaultRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export const detectUiMode = resolveUiMode;
