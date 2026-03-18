import { type ReactNode, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { BarChart2, Inbox, Activity, GitBranch } from "lucide-react";

import { v2Copy } from "../copy";
import { listContainerVariants, listItemVariants } from "../utils/motion";

type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  {
    to: "/v2/insights",
    label: v2Copy.nav.insights,
    shortLabel: "Insights",
    icon: <BarChart2 size={16} />,
  },
  {
    to: "/v2/inbox",
    label: v2Copy.nav.inbox,
    shortLabel: "Inbox",
    icon: <Inbox size={16} />,
  },
  {
    to: "/v2/runs",
    label: v2Copy.nav.runs,
    shortLabel: "Runs",
    icon: <Activity size={16} />,
  },
  {
    to: "/v2/sequences",
    label: v2Copy.nav.sequences,
    shortLabel: "Sequences",
    icon: <GitBranch size={16} />,
  },
];

const isRouteActive = (pathname: string, to: string) =>
  pathname === to || pathname.startsWith(`${to}/`);

const getStoredTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("v2-theme") as "light" | "dark" | null;
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export default function V2Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const activeNavItem = navItems.find((item) =>
    isRouteActive(location.pathname, item.to),
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getStoredTheme());
  }, []);

  return (
    <div className="V2Shell">
      <div className="V2Shell__body">
        {/* Sidebar */}
        <motion.aside
          className="V2Shell__sidebar"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="V2Shell__sidebarBrand" aria-label="PT Biz SMS">
            <div className="V2Shell__sidebarWordmark">
              <span className="V2Shell__sidebarWordmarkLine">PT Biz SMS</span>
              <span className="V2Shell__sidebarWordmarkSubline">
                Command Center
              </span>
            </div>
          </div>
          <nav className="V2Shell__nav" aria-label="V2 primary navigation">
            <motion.div
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {navItems.map((item, index) => {
                const isActive =
                  location.pathname === item.to ||
                  location.pathname.startsWith(item.to + "/");
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
                      className={({ isActive }) =>
                        `V2Shell__navItem ${isActive ? "is-active" : ""}`
                      }
                    >
                      <span className="V2Shell__navBullet" aria-hidden="true" />
                      <motion.span
                        className="V2Shell__navIcon"
                        animate={{
                          scale: isActive ? 1.05 : 1,
                        }}
                        transition={{ duration: 0.2 }}
                      >
                        {item.icon}
                      </motion.span>
                      <span className="V2Shell__navLabelWrap">
                        <span className="V2Shell__navLabel">{item.label}</span>
                        <span className="V2Shell__navLabelShort">
                          {item.shortLabel}
                        </span>
                      </span>
                    </NavLink>
                  </motion.div>
                );
              })}
            </motion.div>
          </nav>
        </motion.aside>

        <main className="V2Shell__content">
          <header className="V2Shell__contentHeader">
            <div className="V2Shell__brandBlock">
              <span className="V2Shell__brandKicker">PT Biz SMS</span>
              <div className="V2Shell__context">
                <p className="V2Shell__contextTitle">
                  {activeNavItem?.label || "Command Center"}
                </p>
                <p className="V2Shell__contextSubtitle">
                  Internal performance shell for insights, inbox, activity, and
                  sequences.
                </p>
              </div>
            </div>
            <div className="V2Shell__topbarPills" aria-label="Quick status">
              <span className="V2Shell__topbarPill">Desktop-first</span>
              <span className="V2Shell__topbarPill">Live data</span>
              <span className="V2Shell__topbarPill">No chrome clutter</span>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
