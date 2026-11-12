import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { ClientsPage } from './features/clients/ClientsPage';
import { ClientCardPage } from './features/clients/ClientCardPage';
import { WorkOrderPage } from './features/work-orders/WorkOrderPage';
import { BoardPage } from './features/board/BoardPage';
import { PriceListPage } from './features/price-list/PriceListPage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { ArchivePage } from './features/archive/ArchivePage';
import { ImportPage } from './features/import/ImportPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { Spinner } from './components/ui';
import { canSeeAnalytics } from './lib/roles';

export function App() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="center" style={{ minHeight: '100dvh' }}>
        <Spinner size={24} />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/clients" replace />} />
        <Route path="/login" element={<Navigate to="/clients" replace />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientCardPage />} />
        <Route path="/work-orders/:id" element={<WorkOrderPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/price-list" element={<PriceListPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        {canSeeAnalytics(user.role) && <Route path="/analytics" element={<AnalyticsPage />} />}
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/clients" replace />} />
      </Routes>
    </AppShell>
  );
}
