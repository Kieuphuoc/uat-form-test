import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAuthConfig, type DemoRuntime } from '../api/authApi';
import { useAuth } from '../auth/AuthContext';
import { IconApps, IconChat, IconDesign, IconForm } from '../components/AppIcons';

function demoIcon(icon?: string) {
  if (icon === 'apps') return <IconApps size={26} />;
  if (icon === 'chat') return <IconChat size={26} />;
  return <IconForm size={26} />;
}

export function HomePage() {
  const { status, jwt, user, isAdmin, canAccessAdmin, login, logout, mobile, loginError } = useAuth();
  const [developMode, setDevelopMode] = useState(false);
  const [demos, setDemos] = useState<DemoRuntime[]>([]);

  useEffect(() => {
    if (!jwt) {
      setDevelopMode(false);
      setDemos([]);
      return;
    }
    void fetchAuthConfig().then((cfg) => {
      setDevelopMode(!!cfg.developMode);
      setDemos(Array.isArray(cfg.demoRuntimes) ? cfg.demoRuntimes : []);
    });
  }, [jwt]);

  if (status === 'loading') {
    return (
      <div className="shell">
        <p className="muted">Đang kiểm tra phiên…</p>
      </div>
    );
  }

  if (!jwt) {
    return <HomeGuestLanding loginError={loginError} onLogin={() => void login('/', { requireAdmin: false })} />;
  }

  const showAdmin = canAccessAdmin || developMode;
  const displayName = user?.nickname || user?.email || `user #${user?.userId ?? 0}`;

  return (
    <div className="shell wide stack home">
      <header className="home-head">
        <div>
          <h1>Arito Form</h1>
          <p className="muted">Chat nội bộ và runtime form.</p>
        </div>
        {!mobile && (
          <div className="row home-head-actions">
            {showAdmin && (
              <Link to="/admin" className="home-admin-link">
                Admin
              </Link>
            )}
            <button type="button" className="secondary" onClick={() => logout()}>
              Đăng xuất
            </button>
          </div>
        )}
      </header>

      <div className="home-tiles">
        <Link to="/chat" className="home-tile home-tile--primary" title="Nhắn tin nội bộ, nhóm làm việc">
          <span className="home-tile-icon">
            <IconChat size={26} />
          </span>
          <span className="home-tile-label">Chat</span>
          <span className="home-tile-desc">Nhắn tin nội bộ, nhóm làm việc</span>
        </Link>
        {demos.map((demo) => {
          const slug = demo.slug?.trim();
          if (!slug) return null;
          return (
            <Link
              key={slug}
              to={`/runtime/${encodeURIComponent(slug)}`}
              className="home-tile"
              title={demo.description || demo.label || slug}
            >
              <span className="home-tile-icon">{demoIcon(demo.icon)}</span>
              <span className="home-tile-label">{demo.label || slug}</span>
              <span className="home-tile-desc">{demo.description || `Runtime ${slug}`}</span>
            </Link>
          );
        })}
      </div>

      <p className="muted home-status">
        Đã đăng nhập: {displayName}
        {isAdmin ? ' · admin' : ''}
      </p>
    </div>
  );
}

const INTRO_SECTIONS = [
  {
    icon: <IconForm size={24} />,
    title: 'Runtime form',
    body: 'Chạy form nghiệp vụ đã thiết kế: đơn từ HRM, danh mục, quy trình duyệt. Cùng một app trên web và khi nhúng mobile.',
  },
  {
    icon: <IconDesign size={24} />,
    title: 'Designer',
    body: 'Kéo thả control, gán event và SQL, xuất bản app. Admin dùng để quản lý file form và chỉnh layout.',
  },
  {
    icon: <IconChat size={24} />,
    title: 'Chat nội bộ',
    body: 'Nhắn tin cá nhân và nhóm làm việc trên cùng tài khoản AritoID, không cần đăng nhập thêm.',
  },
  {
    icon: <IconApps size={24} />,
    title: 'Demo & embed',
    body: 'Sau khi đăng nhập, trang chủ mở các runtime demo. Cùng form đó cũng chạy khi nhúng trong app mobile.',
  },
];

function HomeGuestLanding({
  loginError,
  onLogin,
}: {
  loginError: string | null;
  onLogin: () => void;
}) {
  return (
    <div className="home-guest">
      <main className="home-guest-body">
        <section className="home-guest-hero">
          <div className="home-guest-brand">
            <img src="/favicon.ico" alt="" />
            <h1>Arito Form</h1>
          </div>
          <p className="home-guest-lead">
            Nền tảng thiết kế và chạy form nghiệp vụ trên web và mobile. Đăng nhập AritoID để dùng Chat,
            xem runtime demo và vào công cụ Admin / Designer.
          </p>
        </section>

        <section className="home-guest-grid" aria-label="Giới thiệu Arito Form">
          {INTRO_SECTIONS.map((item) => (
            <article key={item.title} className="home-guest-card">
              <span className="home-tile-icon">{item.icon}</span>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </section>

        <footer className="home-guest-login">
          {loginError && <div className="banner">{loginError}</div>}
          <button type="button" onClick={onLogin}>
            Đăng nhập với AritoID
          </button>
        </footer>
      </main>
    </div>
  );
}
