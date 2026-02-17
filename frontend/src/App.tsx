import React, { useEffect, useState } from 'react';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';
import './styles/App.css';

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check URL params for token (from OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const receivedToken = params.get('token');
    if (receivedToken) {
      localStorage.setItem('slackToken', receivedToken);
      setToken(receivedToken);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      // Try to get token from localStorage
      const storedToken = localStorage.getItem('slackToken');
      if (storedToken) {
        // Verify token is still valid
        verifyToken(storedToken);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const verifyToken = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/verify`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setToken(token);
      } else {
        localStorage.removeItem('slackToken');
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      localStorage.removeItem('slackToken');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('slackToken');
    setToken(null);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!token) {
    return <Login />;
  }

  return <Dashboard token={token} onLogout={handleLogout} />;
}
