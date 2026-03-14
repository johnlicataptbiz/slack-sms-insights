import { FormEvent, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock } from 'lucide-react';

import { ApiError, client } from '../api/client';

import './PasswordGate.css';

// Asset URLs — all WebP
const pagePatternUrl = '/assets/sms-kit/ptbiz_sms_pattern.webp';
const modalSkinUrl = '/assets/sms-kit/sms_network_pattern.webp';
const brandLogoUrl = '/assets/sms-kit/logo1sms.webp';

export function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [username] = useState('dashboard');
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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
      setTimeout(() => onUnlock(), 900);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setError('Incorrect password. Try again.');
      } else {
        setError('Unable to unlock right now. Try again.');
      }
      setIsSubmitting(false);
    }
  };

  const handleBtnClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
    setTimeout(() => setRipple(null), 700);
  };

  return (
    <main
      className="PasswordGate"
      style={{ backgroundImage: `url(${pagePatternUrl})` }}
    >
      {/* Dark overlay on page pattern */}
      <div className="PasswordGate__pageOverlay" />

      {/* Card */}
      <motion.div
        className="PasswordGate__cardContainer"
        initial={{ opacity: 0, y: 40, scale: 0.94 }}
        animate={
          isSuccess
            ? { opacity: 0, y: -30, scale: 1.04 }
            : { opacity: 1, y: 0, scale: 1 }
        }
        transition={
          isSuccess
            ? { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
        }
      >
        <section
          className={`PasswordGate__card ${isSuccess ? 'PasswordGate__card--success' : ''}`}
          style={{ backgroundImage: `url(${modalSkinUrl})` }}
        >
          {/* Overlay so content is readable over the pattern skin */}
          <div className="PasswordGate__skinOverlay" />

          {/* Card content */}
          <div className="PasswordGate__cardBody">

            {/* Logo */}
            <motion.img
              className="PasswordGate__logo"
              src={brandLogoUrl}
              alt="PT Biz SMS"
              initial={{ opacity: 0, y: -12, scale: 0.93 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Form */}
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.45 }}
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

              {/* Password field — white, lock icon, exactly like the image */}
              <div className="PasswordGate__inputWrap">
                <span className="PasswordGate__inputIcon">
                  <Lock size={18} strokeWidth={2} />
                </span>
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
              </div>

              {/* Blue "Log In" button — animated on click */}
              <motion.button
                ref={btnRef}
                type="submit"
                disabled={isSubmitting || isSuccess}
                className={`PasswordGate__submitBtn ${isSubmitting ? 'is-submitting' : ''} ${isSuccess ? 'is-success' : ''}`}
                onClick={handleBtnClick}
                whileHover={!isSubmitting && !isSuccess ? { scale: 1.025, y: -1 } : {}}
                whileTap={!isSubmitting && !isSuccess ? { scale: 0.97 } : {}}
                animate={
                  isSuccess
                    ? { backgroundColor: '#16a34a' }
                    : { backgroundColor: '#2563eb' }
                }
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              >
                {/* Ripple effect on click */}
                <AnimatePresence>
                  {ripple && (
                    <motion.span
                      key={ripple.id}
                      className="PasswordGate__ripple"
                      style={{ left: ripple.x, top: ripple.y }}
                      initial={{ width: 0, height: 0, opacity: 0.55, x: '-50%', y: '-50%' }}
                      animate={{ width: 340, height: 340, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.65, ease: 'easeOut' }}
                    />
                  )}
                </AnimatePresence>

                {/* Shimmer sweep */}
                <span className="PasswordGate__btnShimmer" />

                {/* Button label */}
                <span className="PasswordGate__btnContent">
                  {isSuccess ? (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.75 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      ✓ Unlocked
                    </motion.span>
                  ) : isSubmitting ? (
                    <span className="PasswordGate__spinner" />
                  ) : (
                    'Log In'
                  )}
                </span>
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

            {/* Error */}
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

            {/* Footer */}
            <motion.p
              className="PasswordGate__footer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
            >
              PT Biz Setter Ops · Secure Access
            </motion.p>

          </div>
        </section>
      </motion.div>
    </main>
  );
}
