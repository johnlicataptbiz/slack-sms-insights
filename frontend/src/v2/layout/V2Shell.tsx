import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer } from 'vaul';
import { BarChart2, Inbox, Activity, GitBranch, LogOut, BookOpen, Menu, X, Sun, Moon } from 'lucide-react';

import { client } from '../../api/client';
import { V2_TERM_DEFINITIONS, V2_TERM_GROUPS, v2Copy } from '../copy';
import { springs, easing, listContainerVariants, listItemVariants } from '../utils/motion';
import { CommandPalette, CommandPaletteTrigger } from '../components/CommandPalette';

type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  { to: '/v2/insights', label: v2Copy.nav.insights, shortLabel: 'Insights', icon: <BarChart2 size={16} /> },
  { to: '/v2/inbox', label: v2Copy.nav.inbox, shortLabel: 'Inbox', icon: <Inbox size={16} /> },
  { to: '/v2/runs', label: v2Copy.nav.runs, shortLabel: 'Runs', icon: <Activity size={16} /> },
  { to: '/v2/sequences', label: v2Copy.nav.sequences, shortLabel: 'Sequences', icon: <GitBranch size={16} /> },
];

const brandLogoUrl = '/assets/sms-kit/logo1sms.png';
const patternUrl = '/assets/sms-kit/patternsms.png';
const heroBannerUrl = '/assets/sms-kit/herobannersms.png';
const banner3Url = '/assets/sms-kit/banner3.png';
const dividerUrl = '/assets/sms-kit/divider.png';
const divider3Url = '/assets/sms-kit/divider3.png';
const divider3SmsUrl = '/assets/sms-kit/divider%203%20sms.png';
const smsPattern2Url = '/assets/sms-kit/smspattern2.png';
const mobileMediaQuery = '(max-width: 1080px)';

// Image rotation for visual variety across routes
const getPatternForRoute = (pathname: string): string => {
  if (pathname.includes('/insights')) return smsPattern2Url;
  if (pathname.includes('/inbox')) return patternUrl;
  return patternUrl;
};

const getHeroBannerForRoute = (pathname: string): string => {
  if (pathname.includes('/sequences')) return banner3Url;
  return heroBannerUrl;
};
const topQuickLinks = ['/v2/insights', '/v2/inbox', '/v2/runs', '/v2/sequences'] as const;

const isRouteActive = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`);

const navigateWithTransition = (navigate: ReturnType<typeof useNavigate>, to: string) => {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };

  if (doc.startViewTransition) {
    doc.startViewTransition(() => navigate(to));
    return;
  }
  navigate(to);
};


// Theme management utilities
const getStoredTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('v2-theme') as 'light' | 'dark' | null;
  if (stored) return stored;
  // Check system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const setStoredTheme = (theme: 'light' | 'dark') => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('v2-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
};

export default function V2Shell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDefinitionsOpen, setIsDefinitionsOpen] = useState(false);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(mobileMediaQuery).matches : false,
  );
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const location = useLocation();
  const navigate = useNavigate();
  const activeNavItem = navItems.find((item) => isRouteActive(location.pathname, item.to));

  // Initialize theme on mount
  useEffect(() => {
    const initialTheme = getStoredTheme();
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    setStoredTheme(newTheme);
  };

  useEffect(() => {
    setIsMenuOpen(false);
    setIsDefinitionsOpen(false);
    setIsCmdOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isDefinitionsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDefinitionsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDefinitionsOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia(mobileMediaQuery);
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsMenuOpen(false);
    }
  }, [isMobileViewport]);

  const handleSidebarToggle = () => {
    setIsMenuOpen((value) => !value);
  };

  const isDesktopCollapsed = false;

  const handleLogout = async () => {
    try {
      await client.post('/api/auth/logout', {});
    } catch {
      // noop
    } finally {
      window.location.assign('/');
    }
  };

  return (
    <div className="V2Shell">
      {/* Top Bar */}
      <motion.header
        className="V2Shell__topbar"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: easing.smooth }}
      >
        <div className="V2Shell__topStart">
          {isMobileViewport ? (
            <motion.button
              className="V2Shell__menuButton"
              type="button"
              aria-label="Toggle navigation"
              aria-expanded={isMenuOpen}
              onClick={handleSidebarToggle}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isMenuOpen ? (
                  <motion.span
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ display: 'flex' }}
                  >
                    <X size={18} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="open"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ display: 'flex' }}
                  >
                    <Menu size={18} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          ) : null}

          <div className="V2Shell__context">
            <p className="V2Shell__contextEyebrow">PT Biz SMS</p>
            <p className="V2Shell__contextTitle">
              {activeNavItem?.label || 'Command Center'}
            </p>
          </div>

          {!isMobileViewport ? (
            <div className="V2Shell__quickLinks" aria-label="Quick navigation">
              {navItems
                .filter((item) => topQuickLinks.includes(item.to as (typeof topQuickLinks)[number]))
                .map((item) => {
                  const active = isRouteActive(location.pathname, item.to);
                  return (
                    <button
                      key={item.to}
                      type="button"
                      className={`V2Shell__quickLink ${active ? 'is-active' : ''}`}
                      onClick={() => navigateWithTransition(navigate, item.to)}
                    >
                      {item.shortLabel}
                    </button>
                  );
                })}
            </div>
          ) : null}
        </div>

        <div className="V2Shell__topActions">
          {!isMobileViewport ? <CommandPaletteTrigger onClick={() => setIsCmdOpen(true)} /> : null}

          {/* Theme Toggle */}
          <motion.button
            className="V2ThemeToggle"
            type="button"
            onClick={toggleTheme}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            <Sun size={18} className="V2ThemeToggle__icon V2ThemeToggle__icon--sun" />
            <Moon size={18} className="V2ThemeToggle__icon V2ThemeToggle__icon--moon" />
          </motion.button>

          <motion.button
            className="V2Shell__defsButton"
            type="button"
            aria-expanded={isDefinitionsOpen}
            aria-controls="v2-kpi-definitions"
            onClick={() => setIsDefinitionsOpen((v) => !v)}
            whileHover={{
              scale: 1.05,
              boxShadow: '0 4px 15px rgba(17, 184, 214, 0.25)',
            }}
            whileTap={{ scale: 0.95 }}
          >
            <BookOpen size={13} />
            {v2Copy.actions.kpiDefinitions}
          </motion.button>
          <motion.button
            className="V2Shell__modeButton"
            type="button"
            onClick={() => void handleLogout()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <LogOut size={13} />
            Sign out
          </motion.button>
        </div>
      </motion.header>

      <div className={`V2Shell__body ${isDesktopCollapsed ? 'is-collapsed' : ''}`}>
        {/* Sidebar */}
        <motion.aside
          className={`V2Shell__sidebar ${isMenuOpen ? 'is-open' : ''} ${isDesktopCollapsed ? 'is-collapsed' : ''}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Brand pattern overlay - rotates based on route */}
          <div
            className="V2Shell__sidebarPattern"
            style={{ 
              backgroundImage: `url(${getPatternForRoute(location.pathname)})`,
              animation: 'v2-pattern-drift 60s linear infinite'
            }}
            aria-hidden="true"
          />

          <div className="V2Shell__sidebarBrand">
            <motion.img 
              className="V2Shell__sidebarLogo" 
              src={brandLogoUrl} 
              alt="PT Biz SMS"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
            />
          </div>
          <nav className="V2Shell__nav" aria-label="V2 primary navigation">
            <motion.div
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {navItems.map((item, index) => {
                const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
                return (
                  <motion.div
                    key={item.to}
                    variants={listItemVariants}
                    custom={index}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <NavLink
                      to={item.to}
                      className={({ isActive }) => `V2Shell__navItem V2Shell__navItem--enhanced ${isActive ? 'is-active' : ''}`}
                    >
                      <motion.span
                        className="V2Shell__navIcon"
                        animate={{
                          scale: isActive ? 1.1 : 1,
                          backgroundColor: isActive ? 'rgba(17, 184, 214, 0.3)' : 'transparent',
                        }}
                        transition={{ duration: 0.2 }}
                      >
                        {item.icon}
                      </motion.span>
                      <span className="V2Shell__navLabel">{item.label}</span>
                      <span className="V2Shell__navLabelShort">{item.shortLabel}</span>
                      {/* Active indicator */}
                      {isActive && (
                        <motion.div
                          className="V2Shell__activeIndicator"
                          layoutId="activeNav"
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={springs.soft}
                        />
                      )}
                    </NavLink>
                  </motion.div>
                );
              })}
            </motion.div>
          </nav>
          {/* Hero banner strip at bottom of sidebar - rotates based on route */}
          <motion.img
            className="V2Shell__sidebarHeroBanner"
            src={getHeroBannerForRoute(location.pathname)}
            alt=""
            aria-hidden="true"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 0.82, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          />
        </motion.aside>

        <main className="V2Shell__content">{children}</main>
      </div>

      {/* Floating Action Button for Definitions */}
      <motion.button
        className="V2Shell__defsFab"
        type="button"
        onClick={() => setIsDefinitionsOpen((v) => !v)}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{
          scale: 1.1,
          boxShadow: '0 8px 25px rgba(17, 184, 214, 0.35)',
        }}
        whileTap={{ scale: 0.9 }}
        transition={springs.bouncy}
      >
        <BookOpen size={14} />
        {v2Copy.actions.kpiDefinitions}
      </motion.button>

      {/* KPI Definitions — vaul Drawer (replaces custom AnimatePresence drawer) */}
      <Drawer.Root open={isDefinitionsOpen} onOpenChange={setIsDefinitionsOpen} direction="right">
        <Drawer.Portal>
          <Drawer.Overlay
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(4, 10, 22, 0.55)',
              backdropFilter: 'blur(3px)',
              zIndex: 800,
            }}
          />
          <Drawer.Content
            id="v2-kpi-definitions"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(480px, 92vw)',
              background: 'var(--v2-surface)',
              borderLeft: '1px solid rgba(17, 184, 214, 0.15)',
              boxShadow: '-16px 0 48px rgba(4, 10, 22, 0.4)',
              zIndex: 801,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '4px',
                background: 'rgba(17, 184, 214, 0.25)',
                borderRadius: '2px',
                margin: '12px auto 0',
                flexShrink: 0,
              }}
            />
            <div className="V2DefsDrawer__header">
              <div>
                <p className="V2DefsDrawer__eyebrow">Shared Vocabulary</p>
                <Drawer.Title asChild>
                  <h2>{v2Copy.actions.kpiDefinitions}</h2>
                </Drawer.Title>
              </div>
              <motion.button
                type="button"
                onClick={() => setIsDefinitionsOpen(false)}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
              >
                <X size={18} />
              </motion.button>
            </div>
            <Drawer.Description className="V2DefsDrawer__summary">
              These definitions match the daily reports and scorecards so setters and managers are speaking the same language.
            </Drawer.Description>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 1.25rem 2rem' }}>
              {V2_TERM_GROUPS.map((group) => (
                <section className="V2DefsDrawer__group" key={group.title}>
                  <h3>{group.title}</h3>
                  <div className="V2DefsDrawer__rows">
                    {group.keys.map((key) => {
                      const item = V2_TERM_DEFINITIONS[key];
                      return (
                        <article
                          className="V2DefsDrawer__row"
                          key={key}
                        >
                          <h4>{item.label}</h4>
                          <p>{item.definition}</p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* ⌘K Command Palette */}
      <CommandPalette
        open={isCmdOpen}
        onOpenChange={setIsCmdOpen}
        onSignOut={() => void handleLogout()}
      />
    </div>
  );
}
