import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { uiModeStorageKey } from '../../uiMode';
import { V2_TERM_DEFINITIONS, V2_TERM_GROUPS, v2Copy } from '../copy';

type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  icon: string;
};

const navItems: NavItem[] = [
  { to: '/v2/insights', label: v2Copy.nav.insights, shortLabel: 'Insights', icon: '◉' },
  { to: '/v2/runs', label: v2Copy.nav.runs, shortLabel: 'Runs', icon: '◌' },
  { to: '/v2/rep/jack', label: v2Copy.nav.setterJack, shortLabel: 'Jack', icon: 'J' },
  { to: '/v2/rep/brandon', label: v2Copy.nav.setterBrandon, shortLabel: 'Brandon', icon: 'B' },
  { to: '/v2/sequences', label: v2Copy.nav.sequences, shortLabel: 'Sequences', icon: 'S' },
  { to: '/v2/attribution', label: v2Copy.nav.attribution, shortLabel: 'Attribution', icon: 'A' },
];

const brandLogoUrl =
  'https://22001532.fs1.hubspotusercontent-na1.net/hubfs/22001532/JL/Untitled.png';

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
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setIsMenuOpen(false);
    setIsDefinitionsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isDefinitionsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsDefinitionsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDefinitionsOpen]);

  return (
    <div className="V2Shell">
      <header className="V2Shell__topbar">
        <button
          className="V2Shell__menuButton"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((v) => !v)}
        >
          <span />
          <span />
        </button>

        <div className="V2Shell__brand" onClick={() => navigateWithTransition(navigate, '/v2/insights')}>
          <img className="V2Shell__brandLogo" src={brandLogoUrl} alt="PT Biz logo" />
        </div>

        <div className="V2Shell__topActions">
          <button
            className="V2Shell__defsButton"
            type="button"
            aria-expanded={isDefinitionsOpen}
            aria-controls="v2-kpi-definitions"
            onClick={() => setIsDefinitionsOpen((v) => !v)}
          >
            {v2Copy.actions.kpiDefinitions}
          </button>
          <button
            className="V2Shell__modeButton"
            type="button"
            onClick={() => {
              localStorage.setItem(uiModeStorageKey, 'legacy');
              navigate('/legacy?ui=legacy');
            }}
          >
            {v2Copy.actions.legacyUi}
          </button>
        </div>
      </header>

      <div className="V2Shell__body">
        <aside className={`V2Shell__sidebar ${isMenuOpen ? 'is-open' : ''}`}>
          <nav className="V2Shell__nav" aria-label="V2 primary navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `V2Shell__navItem ${isActive ? 'is-active' : ''}`}
              >
                <span className="V2Shell__navIcon">{item.icon}</span>
                <span className="V2Shell__navLabel">{item.label}</span>
                <span className="V2Shell__navLabelShort">{item.shortLabel}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="V2Shell__content">{children}</main>
      </div>

      <button className="V2Shell__defsFab" type="button" onClick={() => setIsDefinitionsOpen((v) => !v)}>
        {v2Copy.actions.kpiDefinitions}
      </button>

      <div
        className={`V2DefsBackdrop ${isDefinitionsOpen ? 'is-open' : ''}`}
        onClick={() => setIsDefinitionsOpen(false)}
        aria-hidden={!isDefinitionsOpen}
      />
      <aside
        className={`V2DefsDrawer ${isDefinitionsOpen ? 'is-open' : ''}`}
        id="v2-kpi-definitions"
        aria-hidden={!isDefinitionsOpen}
      >
        <header className="V2DefsDrawer__header">
          <div>
            <p className="V2DefsDrawer__eyebrow">Shared Vocabulary</p>
            <h2>{v2Copy.actions.kpiDefinitions}</h2>
          </div>
          <button type="button" onClick={() => setIsDefinitionsOpen(false)}>
            {v2Copy.actions.close}
          </button>
        </header>
        <p className="V2DefsDrawer__summary">
          These definitions match the daily reports and scorecards so setters and managers are speaking the same language.
        </p>
        {V2_TERM_GROUPS.map((group) => (
          <section className="V2DefsDrawer__group" key={group.title}>
            <h3>{group.title}</h3>
            <div className="V2DefsDrawer__rows">
              {group.keys.map((key) => {
                const item = V2_TERM_DEFINITIONS[key];
                return (
                  <article className="V2DefsDrawer__row" key={key}>
                    <h4>{item.label}</h4>
                    <p>{item.definition}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </aside>
    </div>
  );
}
