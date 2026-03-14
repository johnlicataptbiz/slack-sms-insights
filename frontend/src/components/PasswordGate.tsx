import { FormEvent, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Sun, Moon, Info } from 'lucide-react';

import { ApiError, client } from '../api/client';

import './PasswordGate.css';

const brandLogoUrl = '/assets/sms-kit/logo1sms.png';
const logoBadgeUrl = '/assets/sms-kit/ptbiz_sms_logo_badge.png';
const patternHeaderUrl = '/assets/sms-kit/ptbiz_sms_pattern.png';
const divider2Url = '/assets/sms-kit/divider2.png';
const dividerUrl = '/assets/sms-kit/divider.png';
const divider3Url = '/assets/sms-kit/divider3.png';
const divider3SmsUrl = '/assets/sms-kit/divider%203%20sms.png';
const arrowStripDividerUrl = '/assets/sms-kit/arrow_strip_divider.png';
const networkBarDividerUrl = '/assets/sms-kit/network_bar_divider.png';
const nodeBarDividerUrl = '/assets/sms-kit/node_bar_divider.png';
const waveSmsDividerUrl = '/assets/sms-kit/wave_sms_divider.png';

// Button background rotates daily through divider images
const getDividerForToday = (): string => {
  const day = new Date().getDay();
  if (day === 0) return divider2Url;
  if (day === 1) return dividerUrl;
  if (day === 2) return divider3Url;
  if (day === 3) return divider3SmsUrl;
  if (day === 4) return arrowStripDividerUrl;
  if (day === 5) return networkBarDividerUrl;
  if (day === 6) return nodeBarDividerUrl;
  return waveSmsDividerUrl;
};

const getLogoForToday = (): string => {
  const day = new Date().getDay();
  return day === 0 || day === 6 ? logoBadgeUrl : brandLogoUrl;
};

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

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'light' : 'dark');
  };

  const btnBgImage = getDividerForToday();

  return (
    <main className="PasswordGate" data-theme={isDarkMode ? 'dark' : 'light'}>
      {/* Animated background orbs */}
      <FloatingOrb delay={0} x="8%" y="15%" size={320} color="radial-gradient(circle, rgba(17,184,214,0.28) 0%, transparent 70%)" />
      <FloatingOrb delay={2} x="72%" y="5%" size={280} color="radial-gradient(circle, rgba(19,185,129,0.22) 0%, transparent 70%)" />
      <FloatingOrb delay={4} x="55%" y="65%" size={240} color="radial-gradient(circle, rgba(17,184,214,0.18) 0%, transparent 70%)" />
      <FloatingOrb delay={1.5} x="2%" y="60%" size={200} color="radial-gradient(circle, rgba(19,185,129,0.15) 0%, transparent 70%)" />

      {/* 3D Card Container */}
      <div className="PasswordGate__cardContainer">
        <motion.div
          className={`PasswordGate__cardInner ${isFlipped ? 'PasswordGate__cardInner--flipped' : ''}`}
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Front Face - Login Form */}
          <section className={`PasswordGate__card ${isSuccess ? 'PasswordGate__card--success' : ''}`}>

            {/* Pattern Header — replaces carousel */}
            <div
              className="PasswordGate__patternHeader"
              style={{ backgroundImage: `url(${patternHeaderUrl})` }}
            >
              <div className="PasswordGate__patternHeaderOverlay" />
              {/* Theme Toggle */}
              <button
                className="PasswordGate__themeToggle"
                onClick={toggleTheme}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>

            {/* Card body — padded content area */}
            <div className="PasswordGate__cardBody">

              {/* Logo - rotates on weekends */}
              <motion.img
                className="PasswordGate__logo"
                src={getLogoForToday()}
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

                {/* Type Motion Image Button */}
                <motion.button
                  type="submit"
                  disabled={isSubmitting || isSuccess}
                  className={`PasswordGate__submitBtn ${isSuccess ? 'is-success' : ''}`}
                  style={{ backgroundImage: `url(${btnBgImage})` }}
                  whileHover={{ scale: isSubmitting || isSuccess ? 1 : 1.025, y: isSubmitting || isSuccess ? 0 : -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                >
                  <span className="PasswordGate__btnOverlay" />
                  <span className="PasswordGate__btnShimmer" />
                  <span className="PasswordGate__btnContent">
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

              {/* Footer */}
              <motion.p
                className="PasswordGate__footer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
              >
                PT Biz Setter Ops · Secure Access
              </motion.p>

              {/* Flip hint */}
              <button
                className="PasswordGate__flipHint"
                onClick={() => setIsFlipped(true)}
              >
                <Info size={12} /> Learn more
              </button>

            </div>{/* end .PasswordGate__cardBody */}
          </section>

          {/* Back Face - Info Panel */}
          <section className="PasswordGate__cardBack">
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
          </section>
        </motion.div>
      </div>{/* end .PasswordGate__cardContainer */}
    </main>
  );
}
