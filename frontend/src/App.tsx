import { useEffect, useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import LegacyApp from './legacy/LegacyApp';
import { parseUiMode, type UiMode, uiModeStorageKey } from './uiMode';
import V2App from './v2/V2App';

const resolveUiMode = (): UiMode => {
  const envMode = parseUiMode(import.meta.env.VITE_UI_VERSION);
  if (typeof window === 'undefined') return envMode || 'legacy';

  const queryMode = parseUiMode(new URLSearchParams(window.location.search).get('ui'));
  if (queryMode) return queryMode;

  const stored = parseUiMode(localStorage.getItem(uiModeStorageKey));
  if (stored) return stored;

  return envMode || 'legacy';
};

const ModeSync = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const queryMode = parseUiMode(query.get('ui'));
    if (!queryMode) return;

    localStorage.setItem(uiModeStorageKey, queryMode);

    const isOnV2 = location.pathname.startsWith('/v2');
    const isOnLegacy = location.pathname.startsWith('/legacy');

    if (queryMode === 'v2' && isOnLegacy) {
      navigate('/v2/insights', { replace: true });
      return;
    }
    if (queryMode === 'legacy' && isOnV2) {
      navigate('/legacy', { replace: true });
      return;
    }

    query.delete('ui');
    const nextSearch = query.toString();
    if (nextSearch !== location.search.replace(/^\?/, '')) {
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
          hash: location.hash,
        },
        { replace: true },
      );
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
};

const DefaultRoute = () => {
  const mode = useMemo(resolveUiMode, []);
  return <Navigate to={mode === 'v2' ? '/v2/insights' : '/legacy'} replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <ModeSync />
      <Routes>
        <Route path="/legacy" element={<LegacyApp />} />
        <Route path="/legacy/*" element={<LegacyApp />} />
        <Route path="/v2/*" element={<V2App />} />
        <Route path="*" element={<DefaultRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export const detectUiMode = resolveUiMode;
