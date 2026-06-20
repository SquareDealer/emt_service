import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Users,
  LayoutGrid,
  CalendarDays,
  Archive,
  Upload,
  Settings,
  Search,
  Sun,
  Moon,
  LogOut,
  Menu,
  Plus,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isPlainMaster, canManageUsers } from '../lib/roles';
import { useTheme } from '../lib/theme';
import { Avatar } from './ui';
import { GlobalSearch } from './GlobalSearch';
import { IntakeModal } from './IntakeModal';
import './app-shell.css';

const NAV = [
  { to: '/clients', label: 'Клиенты', icon: Users },
  { to: '/board', label: 'Доска', icon: LayoutGrid },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays },
  { to: '/archive', label: 'Архив', icon: Archive },
  { to: '/import', label: 'Импорт базы', icon: Upload },
  { to: '/settings', label: 'Настройки', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();

  // A plain master has no business in Settings (rates, requisites, staff);
  // base import is owner-only.
  const nav = NAV.filter((n) => {
    if (n.to === '/settings' && isPlainMaster(user?.role)) return false;
    if (n.to === '/import' && !canManageUsers(user?.role)) return false;
    return true;
  });

  useEffect(() => setDrawer(false), [loc.pathname]);

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
    <div className="shell">
      {drawer && <div className="sidebar-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">Т</div>
          <div className="col">
            <span className="brand-name">Татарин CRM</span>
            <span className="brand-sub">MINI · сервис</span>
          </div>
        </div>
        <nav className="nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="nav-link">
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
            className="btn btn-ghost btn-icon hamburger"
            onClick={() => setDrawer(true)}
            aria-label="Меню"
          >
            <Menu size={18} />
          </button>
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span>Поиск по ФИО, телефону, VIN, госномеру…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="grow" />
          <button className="btn btn-primary" onClick={() => setIntakeOpen(true)}>
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
      <IntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} />
    </div>
  );
}
