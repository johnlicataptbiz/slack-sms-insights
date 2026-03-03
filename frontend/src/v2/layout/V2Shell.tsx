import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Drawer } from 'vaul';

import { client } from '../../api/client';
import { uiModeStorageKey } from '../../uiMode';
import { V2_TERM_DEFINITIONS, V2_TERM_GROUPS, v2Copy } from '../copy';
import { springs, easing, listContainerVariants, listItemVariants } from '../utils/motion';
import { CommandPalette, CommandPaletteTrigger } from '../components/CommandPalette';

type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  icon: string;
};

const navItems: NavItem[] = [
  { to: '/v2/insights', label: v2Copy.nav.insights, shortLabel: 'Insights', icon: '◉' },
  { to: '/v2/inbox', label: v2Copy.nav.inbox, shortLabel: 'Inbox', icon: '✉' },
  { to: '/v2/runs', label: v2Copy.nav.runs, shortLabel: 'Runs', icon: '◌' },
  { to: '/v2/rep/jack', label: v2Copy.nav.setterJack, shortLabel: 'Jack', icon: 'J' },
  { to: '/v2/rep/brandon', label: v2Copy.nav.setterBrandon, shortLabel: 'Brandon', icon: 'B' },
  { to: '/v2/sequences', label: v2Copy.nav.sequences, shortLabel: 'Sequences', icon: '⟐' },
];

const brandLogoUrl = '/bizsmslogo.png';
const mobileMediaQuery = '(max-width: 1080px)';
const topQuickLinks = ['/v2/inbox', '/v2/runs', '/v2/sequences'] as const;

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


export default function V2Shell({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDefinitionsOpen, setIsDefinitionsOpen] = useState(false);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(mobileMediaQuery).matches : false,
  );
  const location = useLocation();
  const navigate = useNavigate();
  const activeNavItem = navItems.find((item) => isRouteActive(location.pathname, item.to));

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
              <motion.span
                animate={{
                  rotate: isMenuOpen ? 45 : 0,
                  y: isMenuOpen ? 8 : 0,
                }}
                transition={{ duration: 0.2 }}
              />
              <motion.span
                animate={{
                  rotate: isMenuOpen ? -45 : 0,
                  y: isMenuOpen ? -8 : 0,
                }}
                transition={{ duration: 0.2 }}
              />
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
          {/* ⌘K Command Palette Trigger */}
          <CommandPaletteTrigger onClick={() => setIsCmdOpen(true)} />

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
            {v2Copy.actions.kpiDefinitions}
          </motion.button>
          <motion.button
            className="V2Shell__modeButton"
            type="button"
            onClick={() => {
              localStorage.setItem(uiModeStorageKey, 'legacy');
              navigate('/legacy?ui=legacy');
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {v2Copy.actions.legacyUi}
          </motion.button>
          <motion.button
            className="V2Shell__modeButton"
            type="button"
            onClick={() => void handleLogout()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Sign out
          </motion.button>
        </div>
      </motion.header>

      <div className={`V2Shell__body ${isDesktopCollapsed ? 'is-collapsed' : ''}`}>
        {/* Sidebar */}
        <motion.aside
          className={`V2Shell__sidebar ${isMenuOpen ? 'is-open' : ''} ${isDesktopCollapsed ? 'is-collapsed' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="V2Shell__sidebarBrand">
            <img className="V2Shell__sidebarLogo" src={brandLogoUrl} alt="PT Biz SMS" />
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
                      className={({ isActive }) => `V2Shell__navItem ${isActive ? 'is-active' : ''}`}
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
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={springs.soft}
                        />
                      )}
                    </NavLink>
                  </motion.div>
                );
              })}
            </motion.div>
          </nav>
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
                {v2Copy.actions.close}
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
        onToggleLegacy={() => {
          localStorage.setItem(uiModeStorageKey, 'legacy');
          navigate('/legacy?ui=legacy');
        }}
      />
    </div>
  );
}
