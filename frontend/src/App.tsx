import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import { Insights } from './pages/Insights';
import RepScorecard from './pages/RepScorecard';
import AttributionDeepDive from './pages/AttributionDeepDive';
import SequencesDeepDive from './pages/Sequences';
import { useEventStream } from './api/useEventStream';
import './styles/App.css';

type View = 'dashboard' | 'insights' | 'rep-jack' | 'rep-brandon' | 'rep-attribution' | 'sequences';

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('slackToken');
  });
  const [view, setView] = useState<View>('insights');

  // Initialize real-time event stream
  useEventStream(token);

  const handleLogout = () => {
    localStorage.removeItem('slackToken');
    setToken(null);
  };

  return (
    <div className="AppShell">
      <nav className="AppShell__nav">
        <div className="AppShell__logo">
          <img className="AppShell__logoMark" src="/sidebar-logo.png" alt="PT Biz SMS" />
        </div>

        <div className="AppShell__links">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
            <span role="img" aria-label="history">🕒</span> Daily Runs
          </button>

          <div className="AppShell__sectionLabel">Reps</div>

          <button className={view === 'rep-jack' ? 'active' : ''} onClick={() => setView('rep-jack')}>
            <span role="img" aria-label="rep">👤</span> Jack
          </button>
          <button className={view === 'rep-brandon' ? 'active' : ''} onClick={() => setView('rep-brandon')}>
            <span role="img" aria-label="rep">👤</span> Brandon
          </button>

          <div className="AppShell__sectionLabel">Deep Dives</div>

          <button className={view === 'sequences' ? 'active' : ''} onClick={() => setView('sequences')}>
            <span role="img" aria-label="sequences">🧬</span> Sequences
          </button>

          <button className={view === 'rep-attribution' ? 'active' : ''} onClick={() => setView('rep-attribution')}>
            <span role="img" aria-label="attribution">🧾</span> Attribution
          </button>

          <div className="AppShell__sectionLabel">Legacy</div>

          <button className={view === 'insights' ? 'active' : ''} onClick={() => setView('insights')}>
            <span role="img" aria-label="insights">📊</span> Team Insights
          </button>
        </div>


        {token ? (
          <button className="AppShell__logout" onClick={handleLogout}>
            Logout
          </button>
        ) : null}
      </nav>

      <main className="AppShell__content">
        {view === 'dashboard' ? (
          <Dashboard />
        ) : view === 'insights' ? (
          <Insights />
        ) : view === 'rep-jack' ? (
          <RepScorecard rep="jack" />
        ) : view === 'rep-brandon' ? (
          <RepScorecard rep="brandon" />
        ) : view === 'sequences' ? (
          <SequencesDeepDive />
        ) : (
          <AttributionDeepDive />
        )}
      </main>
    </div>
  );
}
