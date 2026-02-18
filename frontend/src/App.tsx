import React, { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import Insights from './pages/Insights';
import './styles/App.css';

type View = 'dashboard' | 'inbox' | 'insights';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('inbox');

  useEffect(() => {
    // Bypass authentication - set a dummy token
    const dummyToken = 'dummy-token-bypass-auth';
    localStorage.setItem('slackToken', dummyToken);
    setLoading(false);
  }, []);

  const handleLogout = () => {
    // No-op for logout since we're bypassing auth
    window.location.reload();
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  const token = 'dummy-token-bypass-auth';

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #eee' }}>
        <button onClick={() => setView('inbox')} disabled={view === 'inbox'}>
          Inbox
        </button>
        <button onClick={() => setView('insights')} disabled={view === 'insights'}>
          Insights
        </button>
        <button onClick={() => setView('dashboard')} disabled={view === 'dashboard'}>
          Daily Runs
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={handleLogout}>Logout</button>
      </div>

      {view === 'inbox' ? (
        <Inbox token={token} />
      ) : view === 'insights' ? (
        <Insights token={token} />
      ) : (
        <Dashboard token={token} onLogout={handleLogout} />
      )}
    </div>
  );
}
