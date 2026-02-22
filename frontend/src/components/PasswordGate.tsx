import { FormEvent, useState } from 'react';

import './PasswordGate.css';

const gatePassword = 'bigbizin26';
const accessSessionKey = 'ptbizsms_password_gate_session_v1';
const accessCookieName = 'ptbizsms_password_gate';
const brandLogoUrl =
  'https://22001532.fs1.hubspotusercontent-na1.net/hubfs/22001532/JL/Untitled.png';

const hasAccessCookie = (): boolean => {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((part) => part.trim() === `${accessCookieName}=ok`);
};

export const hasPasswordGateAccess = (): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (hasAccessCookie()) return true;
  return sessionStorage.getItem(accessSessionKey) === 'ok';
};

export function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== gatePassword) {
      setError('Incorrect password');
      return;
    }

    if (stayLoggedIn) {
      const maxAgeSeconds = 60 * 60 * 24 * 30;
      document.cookie = `${accessCookieName}=ok; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax; Secure`;
      sessionStorage.removeItem(accessSessionKey);
    } else {
      sessionStorage.setItem(accessSessionKey, 'ok');
      document.cookie = `${accessCookieName}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    }

    setError('');
    onUnlock();
  };

  return (
    <main className="PasswordGate">
      <section className="PasswordGate__card">
        <img className="PasswordGate__logo" src={brandLogoUrl} alt="PT Biz SMS" />
        <h1>PT Biz Dashboard</h1>
        <p>Enter password to continue.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            autoFocus
          />
          <button type="submit">Enter</button>
          <label className="PasswordGate__checkbox">
            <input
              type="checkbox"
              checked={stayLoggedIn}
              onChange={(event) => setStayLoggedIn(event.target.checked)}
            />
            <span>Stay logged in on this device</span>
          </label>
        </form>
        {error ? <p className="PasswordGate__error">{error}</p> : null}
      </section>
    </main>
  );
}
