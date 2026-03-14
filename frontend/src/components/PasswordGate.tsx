import { FormEvent, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Moon, Info } from 'lucide-react';

import { ApiError, client } from '../api/client';

import './PasswordGate.css';

// Asset URLs — all WebP
const pagePatternUrl = '/assets/sms-kit/ptbiz_sms_pattern.webp';
const modalSkinUrl = '/assets/sms-kit/sms_network_pattern.webp';
const brandLogoUrl = '/assets/sms-kit/logo1sms.webp';
const logoBadgeUrl = '/assets/sms-kit/ptbiz_sms_logo_badge.webp';

// Button: divider image rotates daily — the image IS the button
const DIVIDER_IMAGES = [
  '/assets/sms-kit/divider2.webp',
  '/assets/sms-kit/divider.webp',
  '/assets/sms-kit/divider3.webp',
  '/assets/sms-kit/divider 3 sms.webp',
  '/assets/sms-kit/arrow_strip_divider.webp',
  '/assets/sms-kit/network_bar_divider.webp',
  '/assets/sms-kit/node_bar_divider.webp',
  '/assets/sms-kit/wave_sms_divider.webp',
];

const getDividerForToday = (): string => DIVIDER_IMAGES[new Date().getDay() % DIVIDER_IMAGES.length];
const getLogoForToday = (): string => {
  const day = new Date().getDay();
  return day === 0 || day === 6 ? logoBadgeUrl : brandLogoUrl;
};

export function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [username] = useState('dashboard');
  const [password, setPassword] = useState('');
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

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

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'light' : 'dark');
  };

  const btnDividerUrl = getDividerForToday();
  const logoUrl = getLogoForToday();

  return (
    <main
      className="PasswordGate"
      data-theme={isDarkMode ? 'dark' : 'light'}
      style={{ backgroundImage: `url(${pagePatternUrl})` }}
    >
      {/* Dark overlay on page pattern */}
      <div className="PasswordGate__pageOverlay" />

      {/* 3D Card Container */}
      <div className="PasswordGate__cardContainer">
        <motion.div
          className={`PasswordGate__cardInner ${isFlipped ? 'PasswordGate__cardInner--flipped' : ''}`}
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
          {/* Front Face — Login Form */}
          {/* Modal skin = sms_network_pattern.webp as background */}
          <section
            className={`PasswordGate__card ${isSuccess ? 'PasswordGate__card--success' : ''}`}
            style={{ backgroundImage: `url(${modalSkinUrl})` }}
          >
            {/* Semi-transparent overlay so content is readable over the pattern skin */}
            <div className="PasswordGate__skinOverlay" />

            {/* Theme toggle */}
            <button
              className="PasswordGate__themeToggle"
              onClick={toggleTheme}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Card content — sits on top of the pattern skin */}
            <div className="PasswordGate__cardBody">

              {/* Logo — on top of the network pattern skin */}
              <motion.img
                className="PasswordGate__logo"
                src={logoUrl}
                alt="PT Biz SMS"
                initial={{ opacity: 0, y: -16, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.18, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />

              {/* Form */}
              <motion.form
                onSubmit={handleSubmit}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.45 }}
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
                </div>

                {/* THE DIVIDER IMAGE IS THE BUTTON — Type Motion unlock animation */}
                <motion.button
                  type="submit"
                  disabled={isSubmitting || isSuccess}
                  className={`PasswordGate__submitBtn ${isSubmitting ? 'is-submitting' : ''} ${isSuccess ? 'is-success' : ''}`}
                  style={{ backgroundImage: `url(${btnDividerUrl})` }}
                  animate={
                    isSuccess
                      ? { scale: [1, 1.06, 1], filter: ['brightness(1)', 'brightness(1.6)', 'brightness(1.2)'] }
                      : isSubmitting
                      ? { scale: [1, 1.02, 1], filter: ['brightness(1)', 'brightness(1.25)', 'brightness(1)'] }
                      : { scale: 1, filter: 'brightness(1)' }
                  }
                  transition={
                    isSuccess || isSubmitting
                      ? { duration: 0.7, repeat: isSubmitting && !isSuccess ? Infinity : 0, ease: 'easeInOut' }
                      : { type: 'spring', stiffness: 420, damping: 26 }
                  }
                  whileHover={!isSubmitting && !isSuccess ? { scale: 1.03, y: -2 } : {}}
                  whileTap={!isSubmitting && !isSuccess ? { scale: 0.97 } : {}}
                >
                  {/* Shimmer sweep on hover/submit */}
                  <span className="PasswordGate__btnShimmer" />
                  {/* Unlock glow ring — animates on submit */}
                  {(isSubmitting || isSuccess) && (
                    <motion.span
                      className="PasswordGate__unlockRing"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: [0, 0.7, 0], scale: [0.7, 1.3, 1.6] }}
                      transition={{ duration: 0.9, repeat: isSubmitting && !isSuccess ? Infinity : 0 }}
                    />
                  )}
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
                      'Enter Dashboard'
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

              <button
                className="PasswordGate__flipHint"
                onClick={() => setIsFlipped(true)}
              >
                <Info size={12} /> Learn more
              </button>

            </div>
          </section>

          {/* Back Face — Info Panel */}
          <section
            className="PasswordGate__cardBack"
            style={{ backgroundImage: `url(${modalSkinUrl})` }}
          >
            <div className="PasswordGate__skinOverlay" />
            <div className="PasswordGate__cardBody" style={{ position: 'relative', zIndex: 1 }}>
              <h2 className="PasswordGate__backTitle">About PT Biz SMS</h2>
              <p className="PasswordGate__backText">
                PT Biz SMS Insights provides real-time analytics for your SMS campaigns,
                tracking response rates, booked calls, and team performance metrics.
              </p>
              <button
                className="PasswordGate__backButton"
                onClick={() => setIsFlipped(false)}
              >
                Back to Login
              </button>
            </div>
          </section>

        </motion.div>
      </div>
    </main>
  );
}
