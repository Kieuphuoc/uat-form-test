import { useEffect, useState } from 'react';
import { fetchAuthConfig, type DemoRuntime } from '../api/authApi';
import { useAuth } from '../auth/AuthContext';
import { IconZalo } from '../components/AppIcons';
import { HomeNavbar } from '../components/home/HomeNavbar';
import { HomeTileCard, type TileTheme } from '../components/home/HomeTileCard';
import { HomeGuestLanding } from '../components/home/HomeGuestLanding';
import {
  MapPin,
  Plus,
  UserRoundCheck,
  FileCheck,
  FileText,
  PenLine,
  FolderOpen,
  ClipboardList,
  CalendarCheck,
  MessageSquare,
} from 'lucide-react';
import { FormIcon } from '../components/form/FormIcon';

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
      <div className="home-hrm-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p className="muted">Đang kiểm tra phiên đăng nhập…</p>
      </div>
    );
  }

  if (!jwt) {
    return <HomeGuestLanding loginError={loginError} onLogin={() => void login('/', { requireAdmin: false })} />;
  }

  const showAdmin = canAccessAdmin || developMode;
  const displayName = user?.nickname || user?.email || `user #${user?.userId ?? 0}`;

  // Kiểm tra các runtime khả dụng từ server API
  const hrmDemo = demos.find((d) => d.slug?.trim().toLowerCase() === 'hrm');
  const approvalDemo = demos.find((d) => d.slug?.trim().toLowerCase() === 'approval');
  
  // Lọc ra các demos tùy chỉnh khác chưa được fix cứng ở 9 ô tiêu chuẩn
  const customDemos = demos.filter(
    (d) => !['hrm', 'approval'].includes(d.slug?.trim().toLowerCase() || '')
  );

  return (
    <div className="home-hrm-page">
      <HomeNavbar
        displayName={displayName}
        isAdmin={isAdmin}
        showAdminLink={showAdmin}
        mobile={mobile}
        onLogout={logout}
      />

      <main className="home-hrm-container">
        {/* Lưới các thẻ tính năng chuẩn HRM */}
        <section className="home-hrm-grid" aria-label="Danh sách ứng dụng HRM">
          {/* 1. Chấm công */}
          <HomeTileCard
            to={hrmDemo ? `/runtime/${encodeURIComponent(hrmDemo.slug)}` : '/runtime/hrm'}
            title="Chấm công"
            desc="Điểm danh vị trí & ca làm"
            icon={<MapPin size={26} />}
            theme="yellow"
          />

          {/* 2. Thêm */}
          <HomeTileCard
            to="/runtime/hrm?tab=create"
            title="Thêm"
            desc="Tạo các loại đơn từ mới"
            icon={<Plus size={26} />}
            theme="grey"
          />

          {/* 3. Chờ duyệt */}
          <HomeTileCard
            to={approvalDemo ? `/runtime/${encodeURIComponent(approvalDemo.slug)}` : '/runtime/approval'}
            title="Chờ duyệt"
            desc="Đơn từ cần phê duyệt"
            icon={<UserRoundCheck size={26} />}
            theme="red"
            badge={21}
          />

          {/* 4. Đã xử lý */}
          <HomeTileCard
            to="/runtime/hrm?tab=processed"
            title="Đã xử lý"
            desc="Lịch sử duyệt đơn từ"
            icon={<FileCheck size={26} />}
            theme="blue"
          />

          {/* 5. Tài liệu */}
          <HomeTileCard
            to="/chat"
            title="Tài liệu"
            desc="Kho biểu mẫu & tài liệu"
            icon={<FileText size={26} />}
            theme="blue"
          />

          {/* 6. Đã ký */}
          <HomeTileCard
            to="/chat"
            title="Đã ký"
            desc="Văn bản đã hoàn tất ký"
            icon={<PenLine size={26} />}
            theme="blue"
          />

          {/* 7. Tài liệu của bạn */}
          <HomeTileCard
            to="/chat"
            title="Tài liệu của bạn"
            desc="Hồ sơ cá nhân & hợp đồng"
            icon={<FolderOpen size={26} />}
            theme="blue"
          />

          {/* 8. Đơn của bạn */}
          <HomeTileCard
            to="/runtime/hrm?tab=my-requests"
            title="Đơn của bạn"
            desc="Danh sách đơn đã gửi"
            icon={<ClipboardList size={26} />}
            theme="blue"
          />

          {/* 9. Booking */}
          <HomeTileCard
            to="/runtime/hrm?tab=booking"
            title="Booking"
            desc="Đặt phòng họp & thiết bị"
            icon={<CalendarCheck size={26} />}
            theme="grey"
          />

          {/* 10. Chat nội bộ */}
          <HomeTileCard
            to="/chat"
            title="Chat nội bộ"
            desc="Nhắn tin cá nhân & nhóm"
            icon={<MessageSquare size={26} />}
            theme="green"
          />

          {/* 11. Zalo Mini App */}
          <HomeTileCard
            to="/account/zalo"
            title="Zalo Mini App"
            desc="Liên kết QR tài khoản"
            icon={<IconZalo size={26} />}
            theme="blue"
          />

          {/* 12+. Demos mở rộng khác từ Server */}
          {customDemos.map((demo, index) => {
            const slug = demo.slug?.trim();
            if (!slug) return null;
            const themes: TileTheme[] = ['purple', 'blue', 'green', 'grey'];
            const theme = themes[index % themes.length];
            return (
              <HomeTileCard
                key={slug}
                to={`/runtime/${encodeURIComponent(slug)}`}
                title={demo.label || slug}
                desc={demo.description || `Runtime ${slug}`}
                icon={<FormIcon name={demo.icon || 'file-text'} hint={demo.label || slug} size={26} />}
                theme={theme}
              />
            );
          })}
        </section>
      </main>
    </div>
  );
}
