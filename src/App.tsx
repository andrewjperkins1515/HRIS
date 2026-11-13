import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, SelfServiceShell } from './components/AppShell';
import { EmptyState } from './components/ui';
import { can, homePath, ROLE_LABEL, type Permission } from './domain/permissions';
import OverviewPage from './pages/Overview';
import PeoplePage from './pages/People';
import EmployeeProfilePage from './pages/EmployeeProfile';
import NewEmployeePage from './pages/NewEmployee';
import SchedulingPage from './pages/Scheduling';
import TimePage from './pages/Time';
import KioskPage from './pages/Kiosk';
import PbjPage from './pages/Pbj';
import ReportsPage from './pages/Reports';
import SettingsPage from './pages/Settings';
import SelfServicePage from './pages/SelfService';
import { useUser } from './store/hooks';

function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  const user = useUser();
  if (!can(user, perm))
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Not available for this demo role"
        body={`The ${ROLE_LABEL[user.role]} role does not include this area. Switch roles from the header to explore it.`}
      />
    );
  return <>{children}</>;
}

function ManagerRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Guard perm="overview.view"><OverviewPage /></Guard>} />
        <Route path="/people" element={<Guard perm="people.view"><PeoplePage /></Guard>} />
        <Route path="/people/new" element={<Guard perm="people.create"><NewEmployeePage /></Guard>} />
        <Route path="/people/:id" element={<Guard perm="people.view"><EmployeeProfilePage /></Guard>} />
        <Route path="/scheduling" element={<Guard perm="schedule.view"><SchedulingPage /></Guard>} />
        <Route path="/time" element={<Guard perm="time.view_all"><TimePage /></Guard>} />
        <Route path="/time/clock" element={<KioskPage />} />
        <Route path="/pbj" element={<Guard perm="pbj.view"><PbjPage /></Guard>} />
        <Route path="/reports" element={<Guard perm="reports.view"><ReportsPage /></Guard>} />
        <Route path="/settings" element={<Guard perm="settings.view"><SettingsPage /></Guard>} />
        <Route path="/me/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function EmployeeRoutes() {
  return (
    <SelfServiceShell>
      <Routes>
        <Route path="/me" element={<SelfServicePage tab="home" />} />
        <Route path="/me/schedule" element={<SelfServicePage tab="schedule" />} />
        <Route path="/me/time" element={<SelfServicePage tab="time" />} />
        <Route path="/me/requests" element={<SelfServicePage tab="requests" />} />
        <Route path="*" element={<Navigate to={homePath('employee')} replace />} />
      </Routes>
    </SelfServiceShell>
  );
}

function Root() {
  const user = useUser();
  return user.role === 'employee' ? <EmployeeRoutes /> : <ManagerRoutes />;
}

export default function App() {
  return (
    <HashRouter>
      <Root />
    </HashRouter>
  );
}
