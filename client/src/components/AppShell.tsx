import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Search,
  Sun,
  Moon,
  LogOut,
  Menu,
  Plus,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { navForRole } from '../lib/view-helpers';
import { useTheme } from '../lib/theme';
import { Avatar } from './ui';
import { GlobalSearch } from './GlobalSearch';
import { IntakeModal } from './IntakeModal';
import { IntakeContext } from '../lib/intake';
import type { IntakeInitial } from '../lib/intake';
import { DEFAULT_BRAND } from '../lib/brand';
import './app-shell.css';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  // Slot to pre-fill when the wizard is opened from the calendar.
  const [intakeInitial, setIntakeInitial] = useState<IntakeInitial | undefined>();
  const openIntake = useCallback((initial?: IntakeInitial) => {
    setIntakeInitial(initial);
    setIntakeOpen(true);
  }, []);
  const intakeCtx = useMemo(() => ({ openIntake }), [openIntake]);
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = (restoreFocus = true) => {
    setDrawer(false);
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  const nav = navForRole(user?.role);

  useEffect(() => setDrawer(false), [loc.pathname]);

  useEffect(() => {
    if (!drawer) return;

    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <IntakeContext.Provider value={intakeCtx}>
      <div className="shell">
        {drawer && (
          <div className="sidebar-backdrop" onClick={() => closeDrawer()} aria-hidden="true" />
        )}
        <aside
          ref={drawerRef}
          className={`sidebar ${drawer ? 'open' : ''}`}
          role={drawer ? 'dialog' : undefined}
          aria-modal={drawer || undefined}
          aria-label={drawer ? 'Навигация' : undefined}
        >
          <div className="brand">
            <img
              className="brand-logo brand-logo-light"
              src={DEFAULT_BRAND.logoLight}
              alt={DEFAULT_BRAND.name}
            />
            <img
              className="brand-logo brand-logo-dark"
              src={DEFAULT_BRAND.logoDark}
              alt={DEFAULT_BRAND.name}
            />
            <button
              ref={closeButtonRef}
              className="btn btn-ghost btn-icon drawer-close"
              type="button"
              onClick={() => closeDrawer()}
              aria-label="Закрыть меню"
            >
              <X size={18} />
            </button>
          </div>
          <nav id="main-navigation" className="nav">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className="nav-link" onClick={() => closeDrawer(false)}>
                <Icon />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <button className="user-chip" onClick={logout} title="Выйти">
              <Avatar name={user?.name ?? '?'} size={28} />
              <div className="col grow" style={{ minWidth: 0 }}>
                <span className="text-sm fw-500 truncate">{user?.name}</span>
                <span className="text-xs faint">Выйти</span>
              </div>
              <LogOut size={15} className="muted" />
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button
              ref={menuButtonRef}
              className="btn btn-ghost btn-icon hamburger"
              onClick={() => setDrawer(true)}
              aria-label="Меню"
              aria-expanded={drawer}
              aria-controls="main-navigation"
            >
              <Menu size={18} />
            </button>
            <button className="search-trigger" onClick={() => setSearchOpen(true)}>
              <Search size={16} />
              <span>Поиск по ФИО, телефону, VIN, госномеру…</span>
              <kbd>⌘K</kbd>
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setIntakeOpen(true)}
              aria-label="Новый приём"
              title="Новый приём"
            >
              <Plus size={16} />
              <span className="hide-sm">Новый приём</span>
            </button>
            <button
              className="btn btn-ghost btn-icon"
              onClick={toggle}
              aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </header>
          <main className="content">{children}</main>
        </div>

        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <IntakeModal
          open={intakeOpen}
          initial={intakeInitial}
          onClose={() => setIntakeOpen(false)}
        />
      </div>
    </IntakeContext.Provider>
  );
}
