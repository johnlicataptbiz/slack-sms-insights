import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { parseUiMode, type UiMode } from './uiMode';

import V2App from './v2/V2App';

const resolveUiMode = (): UiMode => {
  const envMode = parseUiMode(import.meta.env.VITE_UI_VERSION);
  return envMode || 'v2';
};

const DefaultRoute = () => {
  return <Navigate to="/v2/insights" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
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
