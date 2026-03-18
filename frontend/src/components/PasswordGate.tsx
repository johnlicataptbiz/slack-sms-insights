import { FormEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';

import { ApiError, client } from '../api/client';

import './PasswordGate.css';

export function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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
      setSuccess(true);
      setTimeout(() => onUnlock(), 500);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError('Incorrect password. Try again.');
      } else {
        setError('Unable to unlock right now. Try again.');
      }
      setIsSubmitting(false);
    }
  };

  return (
    <main className="PasswordGate PasswordGate--minimal">
      <div className="PasswordGate__card PasswordGate__card--minimal">
        <div className="PasswordGate__textBlock">
          <p className="PasswordGate__eyebrow">PT Biz SMS Insights</p>
          <h1>Command Center</h1>
          <p className="PasswordGate__description">
            Enter the secure dashboard password to continue. Sessions stay in your browser while you keep the box checked below.
          </p>
        </div>

        <form className="PasswordGate__form" onSubmit={handleSubmit}>
          <div className="PasswordGate__inputWrap">
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError('');
              }}
              placeholder="Password"
              autoComplete="current-password"
              autoFocus
              disabled={isSubmitting || success}
              className={error ? 'is-error' : ''}
            />
            <span className="PasswordGate__inputIcon">
              <KeyRound size={16} />
            </span>
          </div>

          {error && <p className="PasswordGate__error">{error}</p>}

          <button
            type="submit"
            className="PasswordGate__submit"
            disabled={isSubmitting || success}
          >
            {success ? 'Unlocked' : 'Enter Dashboard'}
          </button>

          <label className="PasswordGate__stayLogged">
            <input
              type="checkbox"
              checked={stayLoggedIn}
              onChange={(event) => setStayLoggedIn(event.target.checked)}
              disabled={isSubmitting}
            />
            Stay logged in on this device
          </label>

          <p className="PasswordGate__footer">
            Access is logged to keep the dashboard secure.
          </p>
        </form>
      </div>
    </main>
  );
}
