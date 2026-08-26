import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './auth/RequireAdmin';
import { RequireAuth } from './auth/RequireAuth';
import { ChatAppShell } from './components/chat/ChatAppShell';
import { AdminAppPage } from './pages/AdminAppPage';
import { AdminListPage } from './pages/AdminListPage';
import { ApprovalDesignPage } from './pages/ApprovalDesignPage';
import { ApprovalListPage } from './pages/ApprovalListPage';
import { ChatPage } from './pages/ChatPage';
import { ChatSettingsPage } from './pages/ChatSettingsPage';
import { ChatBotCreatePage } from './pages/ChatBotCreatePage';
import { ContactsPage } from './pages/ContactsPage';
import { ZaloChatPage } from './pages/ZaloChatPage';
import { ZaloUsersPage } from './pages/ZaloUsersPage';
import { DesignPage } from './pages/DesignPage';
import { HomePage } from './pages/HomePage';
import { RedirectPage } from './pages/RedirectPage';
import { RuntimePage } from './pages/RuntimePage';
import { ZaloLinkPage } from './pages/ZaloLinkPage';

function AdminGate({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}

/** Chat cho mọi user đã đăng nhập — không dùng AdminGate. */
function ChatGate({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth nextPath="/chat" title="Arito Chat">
      {children}
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/redirect" element={<RedirectPage />} />
      <Route
        path="/account/zalo"
        element={
          <RequireAuth nextPath="/account/zalo" title="Liên kết Zalo">
            <ZaloLinkPage />
          </RequireAuth>
        }
      />
      <Route path="/runtime/:slug" element={<RuntimePage />} />
      <Route
        path="/chat"
        element={
          <ChatGate>
            <ChatAppShell />
          </ChatGate>
        }
      >
        <Route index element={<ChatPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="zalo/users" element={<ZaloUsersPage />} />
        <Route path="zalo" element={<ZaloChatPage />} />
        <Route path="settings" element={<ChatSettingsPage />} />
        <Route path="settings/bots/new" element={<ChatBotCreatePage />} />
        <Route path="settings/bots/:folderId" element={<ChatBotCreatePage />} />
        <Route path=":conversationId" element={<ChatPage />} />
      </Route>
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
      <Route
        path="/admin/approval"
        element={
          <AdminGate>
            <ApprovalListPage />
          </AdminGate>
        }
      />
      <Route
        path="/admin/approval/:id"
        element={
          <AdminGate>
            <ApprovalDesignPage />
          </AdminGate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
