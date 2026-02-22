import { FormEvent, useState } from 'react';

import { ApiError, client } from '../api/client';

import './PasswordGate.css';

const brandLogoUrl =
  'https://22001532.fs1.hubspotusercontent-na1.net/hubfs/22001532/JL/Untitled.png';

export function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await client.post('/api/auth/password', {
        password: password.trim(),
        stayLoggedIn,
      });
      onUnlock();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError('Incorrect password');
      } else {
        setError('Unable to unlock right now. Try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
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
            disabled={isSubmitting}
          />
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Entering...' : 'Enter'}
          </button>
          <label className="PasswordGate__checkbox">
            <input
              type="checkbox"
              checked={stayLoggedIn}
              onChange={(event) => setStayLoggedIn(event.target.checked)}
              disabled={isSubmitting}
            />
            <span>Stay logged in on this device</span>
          </label>
        </form>
        {error ? <p className="PasswordGate__error">{error}</p> : null}
      </section>
    </main>
  );
}
