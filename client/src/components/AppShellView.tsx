import type { ReactNode, Ref } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, Sun, Moon, LogOut, Menu, Plus, X } from 'lucide-react';
import type { NavItem } from '../lib/view-helpers';
import type { Theme } from '../lib/theme';
import { DEFAULT_BRAND } from '../lib/brand';
import type { Brand } from '../lib/brand';
import { Avatar } from './ui';
import './app-shell.css';

export interface AppShellViewProps {
  userName: string;
  nav: NavItem[];
  theme: Theme;
  drawerOpen: boolean;
  brand?: Brand;
  drawerRef?: Ref<HTMLElement>;
  menuButtonRef?: Ref<HTMLButtonElement>;
  closeButtonRef?: Ref<HTMLButtonElement>;
  onOpenSearch(): void;
  onNewIntake(): void;
  onToggleTheme(): void;
  onLogout(): void;
  onOpenDrawer(): void;
  onCloseDrawer(restoreFocus?: boolean): void;
  overlays?: ReactNode;
  children: ReactNode;
}

export function AppShellView({
  userName,
  nav,
  theme,
  drawerOpen: drawer,
  brand = DEFAULT_BRAND,
  drawerRef,
  menuButtonRef,
  closeButtonRef,
  onOpenSearch,
  onNewIntake,
  onToggleTheme,
  onLogout,
  onOpenDrawer,
  onCloseDrawer,
  overlays,
  children,
}: AppShellViewProps) {
  return (
    <div className="shell">
      {drawer && (
        <div className="sidebar-backdrop" onClick={() => onCloseDrawer()} aria-hidden="true" />
      )}
      <aside
        ref={drawerRef}
        className={`sidebar ${drawer ? 'open' : ''}`}
        role={drawer ? 'dialog' : undefined}
        aria-modal={drawer || undefined}
        aria-label={drawer ? 'Навигация' : undefined}
      >
        <div className="brand">
          <img className="brand-logo brand-logo-light" src={brand.logoLight} alt={brand.name} />
          <img className="brand-logo brand-logo-dark" src={brand.logoDark} alt={brand.name} />
          <button
            ref={closeButtonRef}
            className="btn btn-ghost btn-icon drawer-close"
            type="button"
            onClick={() => onCloseDrawer()}
            aria-label="Закрыть меню"
          >
            <X size={18} />
          </button>
        </div>
        <nav id="main-navigation" className="nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className="nav-link"
              data-demo={`nav-${to.replace(/^\//, '')}`}
              onClick={() => onCloseDrawer(false)}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="user-chip" data-demo="user-chip" onClick={onLogout} title="Выйти">
            <Avatar name={userName} size={28} />
            <div className="col grow" style={{ minWidth: 0 }}>
              <span className="text-sm fw-500 truncate">{userName}</span>
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
            onClick={onOpenDrawer}
            aria-label="Меню"
            aria-expanded={drawer}
            aria-controls="main-navigation"
          >
            <Menu size={18} />
          </button>
          <button className="search-trigger" data-demo="search-trigger" onClick={onOpenSearch}>
            <Search size={16} />
            <span>Поиск по ФИО, телефону, VIN, госномеру…</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            className="btn btn-primary"
            data-demo="new-intake"
            onClick={onNewIntake}
            aria-label="Новый приём"
            title="Новый приём"
          >
            <Plus size={16} />
            <span className="hide-sm">Новый приём</span>
          </button>
          <button
            className="btn btn-ghost btn-icon"
            data-demo="theme-toggle"
            onClick={onToggleTheme}
            aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
            title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </header>
        <main className="content">{children}</main>
      </div>

      {overlays}
    </div>
  );
}
