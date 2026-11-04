import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AppShellView } from './AppShellView';
import type { AppShellViewProps } from './AppShellView';
import { navForRole } from '../lib/view-helpers';

const noop = () => {};
const base = (over: Partial<AppShellViewProps> = {}): AppShellViewProps => ({
  userName: 'Иван',
  nav: navForRole('owner'),
  theme: 'light',
  drawerOpen: false,
  onOpenSearch: noop,
  onNewIntake: noop,
  onToggleTheme: noop,
  onLogout: noop,
  onOpenDrawer: noop,
  onCloseDrawer: noop,
  children: <div>content</div>,
  ...over,
});
const html = (over: Partial<AppShellViewProps> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/board']}>
      <AppShellView {...base(over)} />
    </MemoryRouter>,
  );

describe('AppShellView', () => {
  it('uses brand name as logo alt', () => {
    const h = html({ brand: { name: 'Гараж CRM', logoLight: '/a.png', logoDark: '/b.png' } });
    expect(h.match(/alt="Гараж CRM"/g)).toHaveLength(2);
  });
  it('master nav has no settings link', () => {
    const h = html({ nav: navForRole('master') });
    expect(h).not.toContain('href="/settings"');
    expect(h).toContain('data-demo="nav-board"');
  });
  it('renders demo hooks, active link and overlays', () => {
    const h = html({ overlays: <i id="ov" /> });
    for (const k of ['search-trigger', 'new-intake', 'theme-toggle', 'user-chip', 'nav-clients'])
      expect(h).toContain(`data-demo="${k}"`);
    expect(h).toMatch(/class="nav-link active"[^>]*data-demo="nav-board"|data-demo="nav-board"[^>]*class="nav-link active"/);
    expect(h).toContain('id="ov"');
  });
});
