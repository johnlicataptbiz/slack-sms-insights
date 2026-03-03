import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';

type CommandItem = {
  id: string;
  label: string;
  icon: string;
  group: string;
  action: () => void;
  keywords?: string[];
};

type Props = {
  onSignOut: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CommandPalette({ onSignOut, open: controlledOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const isControlled = controlledOpen !== undefined;
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback((value: boolean) => {
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  }, [isControlled, onOpenChange]);

  // ⌘K / Ctrl+K to open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open && search.length > 0) setSearch('');
  }, [open, search.length]);

  const go = useCallback(
    (to: string) => {
      setOpen(false);
      setSearch('');
      navigate(to);
    },
    [navigate],
  );

  const commands: CommandItem[] = [
    // Navigation
    { id: 'nav-insights', label: 'Insights', icon: '◉', group: 'Navigate', action: () => go('/v2/insights'), keywords: ['dashboard', 'overview'] },
    { id: 'nav-inbox', label: 'Inbox', icon: '✉', group: 'Navigate', action: () => go('/v2/inbox'), keywords: ['messages', 'conversations', 'sms'] },
    { id: 'nav-runs', label: 'Daily Runs', icon: '◌', group: 'Navigate', action: () => go('/v2/runs'), keywords: ['reports', 'daily'] },
    { id: 'nav-jack', label: "Rep: Jack's Scorecard", icon: 'J', group: 'Navigate', action: () => go('/v2/rep/jack'), keywords: ['jack', 'rep', 'scorecard'] },
    { id: 'nav-brandon', label: "Rep: Brandon's Scorecard", icon: 'B', group: 'Navigate', action: () => go('/v2/rep/brandon'), keywords: ['brandon', 'rep', 'scorecard'] },
    { id: 'nav-sequences', label: 'Sequences', icon: '⟐', group: 'Navigate', action: () => go('/v2/sequences'), keywords: ['sequences', 'qualification', 'campaigns'] },
    { id: 'nav-attribution', label: 'Attribution', icon: '⊕', group: 'Navigate', action: () => go('/v2/attribution'), keywords: ['attribution', 'source'] },
    // Actions
    { id: 'action-signout', label: 'Sign Out', icon: '→', group: 'Actions', action: () => { setOpen(false); onSignOut(); }, keywords: ['logout', 'sign out'] },
  ];

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  const dialogVariants = {
    hidden: { opacity: 0, scale: 0.96, y: -8 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 30 } },
    exit: { opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.15 } },
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="CmdPalette__backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(4, 10, 22, 0.65)',
              backdropFilter: 'blur(4px)',
              zIndex: 9000,
            }}
          />

          {/* Dialog */}
          <motion.div
            className="CmdPalette__dialog"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              position: 'fixed',
              top: '18vh',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'min(560px, 90vw)',
              zIndex: 9001,
              background: 'var(--v2-surface, #0d1829)',
              border: '1px solid rgba(17, 184, 214, 0.18)',
              borderRadius: '12px',
              boxShadow: '0 24px 64px rgba(4, 10, 22, 0.6), 0 0 0 1px rgba(17, 184, 214, 0.08)',
              overflow: 'hidden',
            }}
          >
            <Command
              className="CmdPalette"
              label="Command palette"
              shouldFilter={true}
              style={{ display: 'flex', flexDirection: 'column', maxHeight: '60vh' }}
            >
              {/* Search input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid rgba(17, 184, 214, 0.1)',
                }}
              >
                <span style={{ color: 'var(--v2-muted, #56607a)', fontSize: '0.9rem' }}>⌘</span>
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search pages, actions…"
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--v2-text, #e8eaf0)',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                  }}
                  autoFocus
                />
                <kbd
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--v2-muted, #56607a)',
                    background: 'rgba(17, 184, 214, 0.08)',
                    border: '1px solid rgba(17, 184, 214, 0.15)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                  }}
                >
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <Command.List
                className="CmdPalette__list"
                style={{
                  overflowY: 'auto',
                  padding: '0.5rem',
                  flex: 1,
                }}
              >
                <Command.Empty
                  className="CmdPalette__empty"
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--v2-muted, #56607a)',
                    fontSize: '0.875rem',
                  }}
                >
                  No results for &ldquo;{search}&rdquo;
                </Command.Empty>

                {['Navigate', 'Actions'].map((group) => {
                  const items = commands.filter((c) => c.group === group);
                  return (
                    <Command.Group
                      className="CmdPalette__group"
                      key={group}
                      heading={group}
                      style={{ marginBottom: '0.25rem' }}
                    >
                      {items.map((item) => (
                        <Command.Item
                          className="CmdPalette__item"
                          key={item.id}
                          value={`${item.label} ${item.keywords?.join(' ') ?? ''}`}
                          onSelect={item.action}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.55rem 0.75rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            color: 'var(--v2-text, #e8eaf0)',
                            transition: 'background 0.1s',
                          }}
                          // cmdk adds data-selected attribute for the highlighted item
                        >
                          <span
                            style={{
                              width: '1.5rem',
                              height: '1.5rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(17, 184, 214, 0.1)',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              color: 'var(--v2-accent, #11b8d6)',
                              flexShrink: 0,
                            }}
                          >
                            {item.icon}
                          </span>
                          <span style={{ flex: 1 }}>{item.label}</span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--v2-muted, #56607a)',
                              background: 'rgba(17, 184, 214, 0.06)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {group}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}
              </Command.List>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.5rem 1rem',
                  borderTop: '1px solid rgba(17, 184, 214, 0.08)',
                  fontSize: '0.7rem',
                  color: 'var(--v2-muted, #56607a)',
                }}
              >
                <span><kbd style={{ background: 'rgba(17,184,214,0.08)', borderRadius: '3px', padding: '1px 4px' }}>↑↓</kbd> navigate</span>
                <span><kbd style={{ background: 'rgba(17,184,214,0.08)', borderRadius: '3px', padding: '1px 4px' }}>↵</kbd> select</span>
                <span><kbd style={{ background: 'rgba(17,184,214,0.08)', borderRadius: '3px', padding: '1px 4px' }}>⌘K</kbd> toggle</span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Trigger button shown in the top bar
export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="V2Shell__cmdTrigger"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.35rem 0.75rem',
        background: 'rgba(17, 184, 214, 0.06)',
        border: '1px solid rgba(17, 184, 214, 0.15)',
        borderRadius: '6px',
        color: 'var(--v2-muted, #56607a)',
        fontSize: '0.8rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      aria-label="Open command palette (⌘K)"
    >
      <span>Search…</span>
      <kbd
        style={{
          fontSize: '0.65rem',
          background: 'rgba(17, 184, 214, 0.1)',
          border: '1px solid rgba(17, 184, 214, 0.2)',
          borderRadius: '3px',
          padding: '1px 5px',
          color: 'var(--v2-accent, #11b8d6)',
        }}
      >
        ⌘K
      </kbd>
    </motion.button>
  );
}
