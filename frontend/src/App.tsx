import React, { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import './styles/App.css';

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  const [loading, setLoading] = useState(true);

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

  return <Dashboard token="dummy-token-bypass-auth" onLogout={handleLogout} />;
}
