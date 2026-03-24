import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  GitBranch,
  Inbox,
  Menu,
  Radio,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

import { v2Copy } from '../copy';
import { listContainerVariants, listItemVariants } from '../utils/motion';

type NavKey = 'insights' | 'inbox' | 'runs' | 'sequences';

type NavItem = {
  key: NavKey;
  to: string;
  label: string;
  shortLabel: string;
  detail: string;
  signal: string;
  icon: ReactNode;
};

type ShellMeta = {
  eyebrow: string;
  subtitle: string;
  focusTitle: string;
  focusSubtitle: string;
  topTags: string[];
};

const navItems: NavItem[] = [
  {
    key: 'insights',
    to: '/v2/insights',
    label: v2Copy.nav.insights,
    shortLabel: 'Insights',
    detail: 'KPI command overview, live momentum, and booking pulse.',
    signal: 'Core board',
    icon: <BarChart2 size={16} />,
  },
  {
    key: 'inbox',
    to: '/v2/inbox',
    label: v2Copy.nav.inbox,
    shortLabel: 'Inbox',
    detail: 'Conversation triage, replies, and handoff visibility.',
    signal: 'Reply desk',
    icon: <Inbox size={16} />,
  },
  {
    key: 'runs',
    to: '/v2/runs',
    label: v2Copy.nav.runs,
    shortLabel: 'Runs',
    detail: 'Automation health, failures, and daily operating timeline.',
    signal: 'Ops feed',
    icon: <Activity size={16} />,
  },
  {
    key: 'sequences',
    to: '/v2/sequences',
    label: v2Copy.nav.sequences,
    shortLabel: 'Sequences',
    detail: 'Sequence quality, funnel pressure, and watchlist review.',
    signal: 'Quality lane',
    icon: <GitBranch size={16} />,
  },
];

const shellMeta: Record<NavKey, ShellMeta> = {
  insights: {
    eyebrow: 'Revenue command surface',
    subtitle:
      'Track the team pulse, booking velocity, and conversion signals without losing the big picture.',
    focusTitle: 'Team pulse + booked-call momentum',
    focusSubtitle: 'Best when you need an executive read in under 30 seconds.',
    topTags: ['Live metrics', 'Team view', 'Exec snapshot'],
  },
  inbox: {
    eyebrow: 'Conversation control room',
    subtitle:
      'Scan active conversations, prioritize response debt, and keep message operations organized under pressure.',
    focusTitle: 'Reply flow + active handoffs',
    focusSubtitle: 'Designed for quick triage and cleaner operator focus.',
    topTags: ['Reply desk', 'Lead triage', 'Active threads'],
  },
  runs: {
    eyebrow: 'Automation operations lane',
    subtitle:
      'Inspect cron execution, spot failures early, and keep the daily machine behaving like it had coffee.',
    focusTitle: 'Run health + daily execution trace',
    focusSubtitle: 'Use this to audit jobs, drift, and operational risk.',
    topTags: ['Ops audit', 'Run history', 'Failure watch'],
  },
  sequences: {
    eyebrow: 'Sequence quality review',
    subtitle:
      'Evaluate sequence pressure, booking contribution, and opt-out risk with a tighter editorial frame.',
    focusTitle: 'Sequence performance + risk watch',
    focusSubtitle: 'Ideal for campaign tuning and pattern spotting.',
    topTags: ['Campaign QA', 'Conversion lens', 'Opt-out watch'],
  },
};

const isRouteActive = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`);

const getStoredTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('v2-theme') as 'light' | 'dark' | null;
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

export default function V2Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const activeNavItem =
    navItems.find((item) => isRouteActive(location.pathname, item.to)) ??
    navItems[0];

  const activeMeta = useMemo(
    () => shellMeta[activeNavItem.key],
    [activeNavItem.key],
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getStoredTheme());
  }, []);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div className="V2Shell">
      <div
        className={`V2Shell__backdrop ${isMobileNavOpen ? 'is-open' : ''}`}
        aria-hidden={!isMobileNavOpen}
        onClick={() => setIsMobileNavOpen(false)}
      />

      <header className="V2Shell__topbar">
        <div className="V2Shell__topStart">
          <button
            type="button"
            className="V2Shell__menuToggle"
            aria-label={isMobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={isMobileNavOpen}
            aria-controls="v2-shell-sidebar"
            onClick={() => setIsMobileNavOpen((open) => !open)}
          >
            {isMobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="V2Shell__brand" aria-label="PT Biz SMS Command Center">
            <span className="V2Shell__brandPulse" aria-hidden="true" />
            <div className="V2Shell__brandCopy">
              <span className="V2Shell__brandEyebrow">PT Biz SMS</span>
              <span className="V2Shell__brandTitle">Command Center</span>
            </div>
          </div>
        </div>

        <div className="V2Shell__quickLinks" aria-label="Current view focus areas">
          {activeMeta.topTags.map((tag) => (
            <span key={tag} className="V2Shell__quickLink">
              {tag}
            </span>
          ))}
        </div>
      </header>

      <div className="V2Shell__body">
        <motion.aside
          id="v2-shell-sidebar"
          className={`V2Shell__sidebar ${isMobileNavOpen ? 'is-open' : ''}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="V2Shell__sidebarHeader">
            <div className="V2Shell__sidebarBrand" aria-label="PT Biz SMS">
              <div className="V2Shell__sidebarWordmark">
                <span className="V2Shell__sidebarWordmarkLine">PT Biz SMS</span>
                <span className="V2Shell__sidebarWordmarkSubline">
                  Message operations • analytics shell
                </span>
              </div>
            </div>

            <p className="V2Shell__sidebarHelper">
              A tighter command surface for the team&apos;s most time-sensitive views.
            </p>

            <div className="V2Shell__sidebarStatusBar" aria-label="Shell status highlights">
              <span className="V2Shell__sidebarStatusPill">
                <Radio size={12} />
                Live sync
              </span>
              <span className="V2Shell__sidebarStatusPill">
                <ShieldCheck size={12} />
                Auth gated
              </span>
            </div>
          </div>

          <div className="V2Shell__sidebarSectionLabel">Primary surfaces</div>

          <nav className="V2Shell__nav" aria-label="V2 primary navigation">
            <motion.div
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {navItems.map((item, index) => {
                const isActive = isRouteActive(location.pathname, item.to);

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
                      className={({ isActive: navIsActive }) =>
                        `V2Shell__navItem ${navIsActive ? 'is-active' : ''}`
                      }
                    >
                      <span className="V2Shell__navBullet" aria-hidden="true" />
                      <motion.span
                        className="V2Shell__navIcon"
                        animate={{ scale: isActive ? 1.05 : 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        {item.icon}
                      </motion.span>
                      <span className="V2Shell__navLabelWrap">
                        <span className="V2Shell__navLabelRow">
                          <span className="V2Shell__navLabel">{item.label}</span>
                          <span className="V2Shell__navSignal">{item.signal}</span>
                        </span>
                        <span className="V2Shell__navMeta">{item.detail}</span>
                        <span className="V2Shell__navLabelShort">{item.shortLabel}</span>
                      </span>
                    </NavLink>
                  </motion.div>
                );
              })}
            </motion.div>
          </nav>

          <div className="V2Shell__sidebarFooter">
            <section className="V2Shell__statusCard" aria-label="Operational signals">
              <span className="V2Shell__statusEyebrow">Ops posture</span>
              <h2 className="V2Shell__statusTitle">Built for team-wide visibility</h2>
              <ul className="V2Shell__statusList">
                <li className="V2Shell__statusItem">
                  <span className="V2Shell__statusDot is-live" aria-hidden="true" />
                  <span className="V2Shell__statusLabel">Signal lane</span>
                  <span className="V2Shell__statusValue">Live</span>
                </li>
                <li className="V2Shell__statusItem">
                  <span className="V2Shell__statusDot is-accent" aria-hidden="true" />
                  <span className="V2Shell__statusLabel">Focus mode</span>
                  <span className="V2Shell__statusValue">Desktop-first</span>
                </li>
                <li className="V2Shell__statusItem">
                  <span className="V2Shell__statusDot is-muted" aria-hidden="true" />
                  <span className="V2Shell__statusLabel">Shell intent</span>
                  <span className="V2Shell__statusValue">Fast triage</span>
                </li>
              </ul>

              <div className="V2Shell__sidebarTags" aria-label="Connected system markers">
                <span className="V2Shell__sidebarTag">Slack</span>
                <span className="V2Shell__sidebarTag">Monday</span>
                <span className="V2Shell__sidebarTag">Sequences</span>
              </div>
            </section>
          </div>
        </motion.aside>

        <div className="V2Shell__content">
          <header className="V2Shell__contentHeader">
            <div className="V2Shell__brandBlock">
              <span className="V2Shell__contextEyebrow">{activeMeta.eyebrow}</span>
              <div className="V2Shell__context">
                <p className="V2Shell__contextTitle">{activeNavItem.label}</p>
                <p className="V2Shell__contextSubtitle">{activeMeta.subtitle}</p>
              </div>
            </div>

            <div className="V2Shell__headerRail">
              <div className="V2Shell__headerCard">
                <span className="V2Shell__headerLabel">
                  <Sparkles size={12} />
                  Current focus
                </span>
                <p className="V2Shell__headerValue">{activeMeta.focusTitle}</p>
                <p className="V2Shell__headerMeta">{activeMeta.focusSubtitle}</p>
              </div>

              <div className="V2Shell__topbarPills" aria-label="Quick status">
                <span className="V2Shell__topbarPill">Signal-rich shell</span>
                <span className="V2Shell__topbarPill">Cleaner scan path</span>
                <span className="V2Shell__topbarPill">
                  <ArrowUpRight size={12} />
                  Team command view
                </span>
              </div>
            </div>
          </header>

          <div className="V2Shell__contentInner">{children}</div>
        </div>
      </div>
    </div>
  );
}
