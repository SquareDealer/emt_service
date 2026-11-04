import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { navForRole } from '../lib/view-helpers';
import { useTheme } from '../lib/theme';
import { AppShellView } from './AppShellView';
import { GlobalSearch } from './GlobalSearch';
import { IntakeModal } from './IntakeModal';
import { IntakeContext } from '../lib/intake';
import type { IntakeInitial } from '../lib/intake';

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
      <AppShellView
        userName={user?.name ?? '?'}
        nav={nav}
        theme={theme}
        drawerOpen={drawer}
        drawerRef={drawerRef}
        menuButtonRef={menuButtonRef}
        closeButtonRef={closeButtonRef}
        onOpenSearch={() => setSearchOpen(true)}
        onNewIntake={() => setIntakeOpen(true)}
        onToggleTheme={toggle}
        onLogout={logout}
        onOpenDrawer={() => setDrawer(true)}
        onCloseDrawer={closeDrawer}
        overlays={
          <>
            <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
            <IntakeModal
              open={intakeOpen}
              initial={intakeInitial}
              onClose={() => setIntakeOpen(false)}
            />
          </>
        }
      >
        {children}
      </AppShellView>
    </IntakeContext.Provider>
  );
}
