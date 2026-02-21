import React, { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import { Insights } from './pages/Insights';
import RepScorecard from './pages/RepScorecard';
import AttributionDeepDive from './pages/AttributionDeepDive';
import { useEventStream } from './api/useEventStream';
import Login from './components/Login';
import './styles/App.css';

type View = 'dashboard' | 'insights' | 'rep-jack' | 'rep-brandon' | 'rep-attribution';
const API_URL = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('slackToken');
  });
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>(() =>
    token ? 'checking' : 'unauthenticated',
  );
  const [view, setView] = useState<View>('insights');

  // Initialize real-time event stream
  useEventStream(authState === 'authenticated' ? token : null);

  useEffect(() => {
    if (!token) {
      setAuthState('unauthenticated');
      return;
    }

    let cancelled = false;

    const verify = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/verify`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (cancelled) return;
        if (!response.ok) {
          localStorage.removeItem('slackToken');
          setToken(null);
          setAuthState('unauthenticated');
          return;
        }

        setAuthState('authenticated');
      } catch {
        if (!cancelled) {
          setAuthState('unauthenticated');
        }
      }
    };

    setAuthState('checking');
    verify();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    localStorage.setItem('slackToken', token);
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('slackToken');
    setToken(null);
    setAuthState('unauthenticated');
  };

  if (!token || authState === 'unauthenticated') {
    return <Login />;
  }

  if (authState === 'checking') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Verifying Slack session...</p>
      </div>
    );
  }

  return (
    <div className="AppShell">
      <nav className="AppShell__nav">
        <div className="AppShell__logo">Command Center</div>
        
        <div className="AppShell__links">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
            <span role="img" aria-label="history">🕒</span> Daily Runs
          </button>

          <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12, paddingLeft: 6 }}>Reps</div>

          <button className={view === 'rep-jack' ? 'active' : ''} onClick={() => setView('rep-jack')}>
            <span role="img" aria-label="rep">👤</span> Jack
          </button>
          <button className={view === 'rep-brandon' ? 'active' : ''} onClick={() => setView('rep-brandon')}>
            <span role="img" aria-label="rep">👤</span> Brandon
          </button>

          <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12, paddingLeft: 6 }}>Deep Dives</div>

          <button className={view === 'rep-attribution' ? 'active' : ''} onClick={() => setView('rep-attribution')}>
            <span role="img" aria-label="attribution">🧾</span> Attribution
          </button>

          <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12, paddingLeft: 6 }}>Legacy</div>

          <button className={view === 'insights' ? 'active' : ''} onClick={() => setView('insights')}>
            <span role="img" aria-label="insights">📊</span> Team Insights
          </button>
        </div>


        <button className="AppShell__logout" onClick={handleLogout}>
          Logout
        </button>
      </nav>

      <main className="AppShell__content">
        {view === 'dashboard' ? (
          <Dashboard token={token} onLogout={handleLogout} />
        ) : view === 'insights' ? (
          <Insights />
        ) : view === 'rep-jack' ? (
          <RepScorecard rep="jack" />
        ) : view === 'rep-brandon' ? (
          <RepScorecard rep="brandon" />
        ) : (
          <AttributionDeepDive />
        )}
      </main>
    </div>
  );
}
