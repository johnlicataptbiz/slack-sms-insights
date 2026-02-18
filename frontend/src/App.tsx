import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import { Inbox } from './pages/Inbox';
import { Insights } from './pages/Insights';
import { useEventStream } from './api/useEventStream';
import './styles/App.css';

// Create a client
const queryClient = new QueryClient();

type View = 'dashboard' | 'inbox' | 'insights';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('inbox');

  // Initialize real-time event stream
  useEventStream();

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
    <QueryClientProvider client={queryClient}>
      <div className="AppShell">
        <nav className="AppShell__nav">
          <div className="AppShell__logo">SMS Insights</div>
          <div className="AppShell__links">
            <button 
              className={view === 'inbox' ? 'active' : ''} 
              onClick={() => setView('inbox')}
            >
              Inbox
            </button>
            <button 
              className={view === 'insights' ? 'active' : ''} 
              onClick={() => setView('insights')}
            >
              Insights
            </button>
            <button 
              className={view === 'dashboard' ? 'active' : ''} 
              onClick={() => setView('dashboard')}
            >
              Daily Runs
            </button>
          </div>
          <div style={{ flex: 1 }} />
          <button className="AppShell__logout" onClick={handleLogout}>Logout</button>
        </nav>

        <div className="AppShell__content">
          {view === 'inbox' ? (
            <Inbox />
          ) : view === 'insights' ? (
            <Insights />
          ) : (
            <Dashboard token={token} onLogout={handleLogout} />
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}
