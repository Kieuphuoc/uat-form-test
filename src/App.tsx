import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAppPage } from './pages/AdminAppPage';
import { AdminListPage } from './pages/AdminListPage';
import { HomePage } from './pages/HomePage';
import { RuntimePage } from './pages/RuntimePage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/runtime/:slug" element={<RuntimePage />} />
      <Route path="/admin" element={<AdminListPage />} />
      <Route path="/admin/apps/:id" element={<AdminAppPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
