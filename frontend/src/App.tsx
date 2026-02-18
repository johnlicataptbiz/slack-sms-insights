import React, { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import { Insights } from './pages/Insights';
import { useEventStream } from './api/useEventStream';
import { useMetrics } from './api/queries';
import './styles/App.css';

type View = 'dashboard' | 'insights';

function getTodayRange() {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('insights');

  // Ensure a token exists before any queries fire (React Query runs during render).
  // This prevents a first-render 401 when localStorage is empty.
  //
  // NOTE: In dev, React.StrictMode intentionally double-invokes render/effects.
  // We set the token unconditionally to keep the app stable during local dev.
  if (typeof window !== 'undefined') {
    localStorage.setItem('slackToken', localStorage.getItem('slackToken') || 'dummy-token-bypass-auth');
  }

  // Initialize real-time event stream
  useEventStream();

  // Fetch today's metrics for the sidebar
  const { data: metrics } = useMetrics(getTodayRange());

  useEffect(() => {
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

  const token = localStorage.getItem('slackToken') || 'dummy-token-bypass-auth';

  return (
    <div className="AppShell">
      <nav className="AppShell__nav">
        <div className="AppShell__logo">Command Center</div>
        
        <div className="AppShell__links">
          <button 
            className={view === 'insights' ? 'active' : ''} 
            onClick={() => setView('insights')}
          >
            <span role="img" aria-label="insights">📊</span> Insights
          </button>
          <button 
            className={view === 'dashboard' ? 'active' : ''} 
            onClick={() => setView('dashboard')}
          >
            <span role="img" aria-label="history">🕒</span> Daily Runs
          </button>
        </div>


        <button className="AppShell__logout" onClick={handleLogout}>
          Logout
        </button>
      </nav>

      <main className="AppShell__content">
        {view === 'insights' ? (
          <Insights />
        ) : (
          <Dashboard token={token} onLogout={handleLogout} />
        )}
      </main>
    </div>
  );
}
