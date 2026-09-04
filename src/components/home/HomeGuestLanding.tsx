import { Building2, Sparkles, MessageSquare, LayoutGrid, Layers } from 'lucide-react';

const INTRO_FEATURES = [
  {
    icon: <LayoutGrid size={24} />,
    theme: 'blue' as const,
    title: 'Runtime form',
    body: 'Chạy form nghiệp vụ đã thiết kế: đơn từ HRM, danh mục, quy trình duyệt. Đồng bộ trên web và mobile.',
  },
  {
    icon: <Layers size={24} />,
    theme: 'purple' as const,
    title: 'Designer',
    body: 'Kéo thả control, gán event và SQL, xuất bản ứng dụng nhanh chóng cho quản trị viên.',
  },
  {
    icon: <MessageSquare size={24} />,
    theme: 'green' as const,
    title: 'Chat nội bộ',
    body: 'Nhắn tin cá nhân và nhóm làm việc tức thì trên cùng hệ thống tài khoản AritoID.',
  },
  {
    icon: <Sparkles size={24} />,
    theme: 'yellow' as const,
    title: 'Demo & embed',
    body: 'Hỗ trợ chạy mượt mà khi nhúng trong Zalo Mini App, Webview và App Mobile nội bộ.',
  },
];

type Props = {
  loginError: string | null;
  onLogin: () => void;
};

export function HomeGuestLanding({ loginError, onLogin }: Props) {
  return (
    <div className="home-guest-v2">
      <header className="home-guest-v2__nav">
        <div className="home-guest-v2__brand">
          <div className="home-guest-v2__logo">
            <Building2 size={22} />
          </div>
          <span className="home-guest-v2__brand-name">Arito Form & HRM</span>
        </div>
        <button type="button" className="home-guest-v2__nav-login-btn" onClick={onLogin}>
          Đăng nhập AritoID
        </button>
      </header>

      <main className="home-guest-v2__body">
        <section className="home-guest-v2__hero">
          <span className="home-guest-v2__hero-badge">Hệ thống Form & HRM Nghiệp Vụ</span>
          <h1 className="home-guest-v2__title">Trải nghiệm Nền Tảng Quản Trị Doanh Nghiệp Hiện Đại</h1>
          <p className="home-guest-v2__lead">
            Quản lý chấm công, quy trình phê duyệt đơn từ, nhắn tin làm việc nội bộ và thiết kế form động
            trên cùng một giao diện duy nhất.
          </p>

          <div className="home-guest-v2__cta-wrap">
            {loginError && <div className="banner home-guest-v2__banner">{loginError}</div>}
            <button type="button" className="home-guest-v2__main-btn" onClick={onLogin}>
              <span>Đăng nhập ngay với AritoID</span>
            </button>
          </div>
        </section>

        <section className="home-guest-v2__grid">
          {INTRO_FEATURES.map((item) => (
            <article key={item.title} className={`home-guest-v2__card home-guest-v2__card--${item.theme}`}>
              <div className="home-guest-v2__card-icon">{item.icon}</div>
              <h2 className="home-guest-v2__card-title">{item.title}</h2>
              <p className="home-guest-v2__card-body">{item.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="home-guest-v2__footer">
        <p>© Arito Platform — Giải pháp form nghiệp vụ & quản trị nhân sự HRM.</p>
      </footer>
    </div>
  );
}
