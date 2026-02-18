import React, { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { Insights } from './pages/Insights';
import { useEventStream } from './api/useEventStream';
import { useMetrics } from './api/queries';
import './styles/App.css';

type View = 'dashboard' | 'inbox' | 'insights';

function getTodayRange() {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('inbox');

  // Initialize real-time event stream
  useEventStream();

  // Fetch today's metrics for the sidebar
  const { data: metrics } = useMetrics(getTodayRange());

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
    <div className="AppShell">
      <nav className="AppShell__nav">
        <div className="AppShell__logo">Command Center</div>
        
        <div className="AppShell__links">
          <button 
            className={view === 'inbox' ? 'active' : ''} 
            onClick={() => setView('inbox')}
          >
            <span role="img" aria-label="inbox">📥</span> Inbox
          </button>
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

        <div className="AppShell__stats">
          <div className="AppShell__stat-item">
            <div className="AppShell__stat-label">Open Items</div>
            <div className="AppShell__stat-value">{metrics?.openWorkItems ?? '...'}</div>
          </div>
          <div className="AppShell__stat-item">
            <div className="AppShell__stat-label">SLA Breaches</div>
            <div className="AppShell__stat-value" style={{ color: metrics?.overdueWorkItems ? 'var(--color-error)' : 'white' }}>
              {metrics?.overdueWorkItems ?? '...'}
            </div>
          </div>
        </div>

        <button className="AppShell__logout" onClick={handleLogout}>
          Logout
        </button>
      </nav>

      <main className="AppShell__content">
        {view === 'inbox' ? (
          <Inbox />
        ) : view === 'insights' ? (
          <Insights />
        ) : (
          <Dashboard token={token} onLogout={handleLogout} />
        )}
      </main>
    </div>
  );
}
