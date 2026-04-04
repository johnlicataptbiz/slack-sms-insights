import { FormEvent, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound } from 'lucide-react';

import { ApiError, client } from '../api/client';

import './PasswordGate.css';

const brandLogoUrl = '/assets/sms-kit/logo1sms.png';
const banner2Url = '/assets/sms-kit/banner2.png';
const divider2Url = '/assets/sms-kit/divider2.png';

// Floating orb component for background ambiance
function FloatingOrb({ delay, x, y, size, color }: { delay: number; x: string; y: string; size: number; color: string }) {
  return (
    <motion.div
      className="PasswordGate__orb"
      style={{ left: x, top: y, width: size, height: size, background: color }}
      animate={{
        y: [0, -30, 0],
        x: [0, 15, 0],
        scale: [1, 1.08, 1],
        opacity: [0.55, 0.75, 0.55],
      }}
      transition={{
        duration: 7 + delay,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      }}
    />
  );
}

export function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [username] = useState('dashboard');
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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
      setIsSuccess(true);
      // Brief success animation before unlocking
      setTimeout(() => onUnlock(), 600);
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
    <main className="PasswordGate">
      {/* Animated background orbs */}
      <FloatingOrb delay={0} x="8%" y="15%" size={320} color="radial-gradient(circle, rgba(17,184,214,0.28) 0%, transparent 70%)" />
      <FloatingOrb delay={2} x="72%" y="5%" size={280} color="radial-gradient(circle, rgba(19,185,129,0.22) 0%, transparent 70%)" />
      <FloatingOrb delay={4} x="55%" y="65%" size={240} color="radial-gradient(circle, rgba(17,184,214,0.18) 0%, transparent 70%)" />
      <FloatingOrb delay={1.5} x="2%" y="60%" size={200} color="radial-gradient(circle, rgba(19,185,129,0.15) 0%, transparent 70%)" />

      {/* Card */}
      <motion.section
        className={`PasswordGate__card${isSuccess ? ' PasswordGate__card--success' : ''}`}
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Brand banner — full-width, clipped by card overflow:hidden */}
        <img
          className="PasswordGate__banner"
          src={banner2Url}
          alt=""
          aria-hidden="true"
        />

        {/* Card body — padded content area */}
        <div className="PasswordGate__cardBody">

        {/* Logo */}
        <motion.img
          className="PasswordGate__logo"
          src={brandLogoUrl}
          alt="PT Biz SMS"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45 }}
        />

        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          {/* Hidden username for password managers */}
          <input
            type="text"
            name="username"
            value={username}
            readOnly
            tabIndex={-1}
            autoComplete="username"
            aria-hidden="true"
            style={{ position: 'absolute', left: '-10000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}
          />

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
              disabled={isSubmitting || isSuccess}
              className={error ? 'is-error' : ''}
            />
            <span className="PasswordGate__inputIcon"><KeyRound size={16} /></span>
          </div>

          <motion.button
            type="submit"
            disabled={isSubmitting || isSuccess}
            className={isSuccess ? 'is-success' : ''}
            whileHover={{ scale: isSubmitting || isSuccess ? 1 : 1.02, y: isSubmitting || isSuccess ? 0 : -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {isSuccess ? (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                ✓ Unlocked
              </motion.span>
            ) : isSubmitting ? (
              <span className="PasswordGate__spinner" />
            ) : (
              'Enter Dashboard'
            )}
          </motion.button>

          <label className="PasswordGate__checkbox">
            <input
              type="checkbox"
              checked={stayLoggedIn}
              onChange={(event) => setStayLoggedIn(event.target.checked)}
              disabled={isSubmitting || isSuccess}
            />
            <span>Stay logged in on this device</span>
          </label>
        </motion.form>

        {/* Error message */}
        <AnimatePresence>
          {error ? (
            <motion.p
              className="PasswordGate__error"
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.25 }}
            >
              ⚠ {error}
            </motion.p>
          ) : null}
        </AnimatePresence>

        {/* Brand divider */}
        <img
          className="PasswordGate__divider"
          src={divider2Url}
          alt=""
          aria-hidden="true"
        />

        {/* Footer */}
        <motion.p
          className="PasswordGate__footer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
        >
          PT Biz Setter Ops · Secure Access
        </motion.p>

        </div>{/* end .PasswordGate__cardBody */}
      </motion.section>
    </main>
  );
}
