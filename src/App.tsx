import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { AdminAppPage } from './pages/AdminAppPage';
import { AdminListPage } from './pages/AdminListPage';
import { DesignPage } from './pages/DesignPage';
import { HomePage } from './pages/HomePage';
import { RedirectPage } from './pages/RedirectPage';
import { RuntimePage } from './pages/RuntimePage';

function AdminGate({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/redirect" element={<RedirectPage />} />
      <Route path="/runtime/:slug" element={<RuntimePage />} />
      <Route
        path="/admin"
        element={
          <AdminGate>
            <AdminListPage />
          </AdminGate>
        }
      />
      <Route
        path="/admin/apps/:id"
        element={
          <AdminGate>
            <AdminAppPage />
          </AdminGate>
        }
      />
      <Route
        path="/admin/design"
        element={
          <AdminGate>
            <DesignPage />
          </AdminGate>
        }
      />
      <Route
        path="/admin/design/:slug"
        element={
          <AdminGate>
            <DesignPage />
          </AdminGate>
        }
      />
      <Route
        path="/admin/design/:slug/:formId"
        element={
          <AdminGate>
            <DesignPage />
          </AdminGate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
