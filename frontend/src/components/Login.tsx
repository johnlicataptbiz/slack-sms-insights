import React from 'react';
import '../styles/Login.css';

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

export default function Login() {
  return (
    <div className="login-container">
      <div className="login-card">
        <h1>📊 Daily Report Dashboard</h1>
        <p>Track your SMS Insights daily runs</p>

        <a href={`${API_URL}/api/oauth/start`} className="login-button">
          Sign in with Slack
        </a>
      </div>
    </div>
  );
}
