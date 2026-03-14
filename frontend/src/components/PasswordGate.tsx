import { FormEvent, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Sun, Moon, ChevronLeft, ChevronRight, Info } from 'lucide-react';

import { ApiError, client } from '../api/client';

import './PasswordGate.css';

const brandLogoUrl = '/assets/sms-kit/logo1sms.png';
const logoBadgeUrl = '/assets/sms-kit/ptbiz_sms_logo_badge.png';
const banner2Url = '/assets/sms-kit/banner2.png';
const banner3Url = '/assets/sms-kit/banner3.png';
const divider2Url = '/assets/sms-kit/divider2.png';
const dividerUrl = '/assets/sms-kit/divider.png';
const divider3Url = '/assets/sms-kit/divider3.png';
const divider3SmsUrl = '/assets/sms-kit/divider%203%20sms.png';
const arrowStripDividerUrl = '/assets/sms-kit/arrow_strip_divider.png';
const networkBarDividerUrl = '/assets/sms-kit/network_bar_divider.png';
const nodeBarDividerUrl = '/assets/sms-kit/node_bar_divider.png';
const waveSmsDividerUrl = '/assets/sms-kit/wave_sms_divider.png';

// Visual rotation based on day of week for variety
const getBannerForToday = (): string => {
  const day = new Date().getDay();
  // Alternate between banner2 and banner3
  return day % 2 === 0 ? banner2Url : banner3Url;
};

const getDividerForToday = (): string => {
  const day = new Date().getDay();
  // Rotate through 8 dividers for maximum variety
  if (day === 0) return divider2Url;           // Sunday
  if (day === 1) return dividerUrl;          // Monday
  if (day === 2) return divider3Url;         // Tuesday
  if (day === 3) return divider3SmsUrl;      // Wednesday
  if (day === 4) return arrowStripDividerUrl;  // Thursday
  if (day === 5) return networkBarDividerUrl; // Friday
  if (day === 6) return nodeBarDividerUrl;   // Saturday
  return waveSmsDividerUrl;
};

const getLogoForToday = (): string => {
  const day = new Date().getDay();
  // Alternate between logos on weekends
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

// Carousel slides data
const CAROUSEL_SLIDES = [
  {
    id: '1',
    image: '/assets/sms-kit/herobannersms.png',
    title: 'SMS Insights',
    description: 'Real-time analytics for your SMS campaigns',
  },
  {
    id: '2',
    image: '/assets/sms-kit/sms_growth_banner.png',
    title: 'Growth Tracking',
    description: 'Monitor your business growth metrics',
  },
  {
    id: '3',
    image: '/assets/sms-kit/analytics_wave_banner.png',
    title: 'Analytics Dashboard',
    description: 'Comprehensive performance analytics',
  },
  {
    id: '4',
    image: '/assets/sms-kit/sms_wave_banner.png',
    title: 'Wave Analytics',
    description: 'Trend analysis and forecasting',
  },
];

// Hero Carousel Component
function HeroCarousel({ currentSlide, onSlideChange }: { currentSlide: number; onSlideChange: (index: number) => void }) {
  const [isHovered, setIsHovered] = useState(false);

  const nextSlide = useCallback(() => {
    onSlideChange((currentSlide + 1) % CAROUSEL_SLIDES.length);
  }, [currentSlide, onSlideChange]);

  const prevSlide = useCallback(() => {
    onSlideChange((currentSlide - 1 + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length);
  }, [currentSlide, onSlideChange]);

  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isHovered, nextSlide]);

  return (
    <div 
      className="PasswordGate__carousel"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {CAROUSEL_SLIDES.map((slide, index) => (
        <div
          key={slide.id}
          className={`PasswordGate__carouselSlide ${index === currentSlide ? 'PasswordGate__carouselSlide--active' : ''}`}
        >
          <img src={slide.image} alt={slide.title} />
          <div className="PasswordGate__carouselOverlay">
            <h3 className="PasswordGate__carouselTitle">{slide.title}</h3>
            <p className="PasswordGate__carouselDesc">{slide.description}</p>
          </div>
        </div>
      ))}
      
      <div className="PasswordGate__carouselNav">
        {CAROUSEL_SLIDES.map((_, index) => (
          <button
            key={index}
            className={`PasswordGate__carouselDot ${index === currentSlide ? 'PasswordGate__carouselDot--active' : ''}`}
            onClick={() => onSlideChange(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      <div className="PasswordGate__carouselArrows">
        <button className="PasswordGate__carouselArrow" onClick={prevSlide} aria-label="Previous slide">
          <ChevronLeft size={20} />
        </button>
        <button className="PasswordGate__carouselArrow" onClick={nextSlide} aria-label="Next slide">
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
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
  const [currentSlide, setCurrentSlide] = useState(0);

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

  // Toggle theme
  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'light' : 'dark');
  };

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
            {/* Theme Toggle */}
            <button 
              className="PasswordGate__themeToggle"
              onClick={toggleTheme}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Hero Carousel */}
            <HeroCarousel currentSlide={currentSlide} onSlideChange={setCurrentSlide} />

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

        {/* Brand divider — rotates daily */}
        <img
          className="PasswordGate__divider"
          src={getDividerForToday()}
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
